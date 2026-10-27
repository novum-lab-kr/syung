"""회원: 소셜 로그인 흐름 · 세션 · 탈퇴 · 승차권(출발지 → 도착지 · 출발 시각 · 타는 날 · 고른 경로). HTTP 모양(쿠키 · 주소 · 상태 코드)은 routes/members.py 가 맡는다.

- 로그인: start 가 state(무작위)를 만들고 → 제공자 → finish 가 쿠키의 state 와 맞춰 본 뒤 인가 코드로 회원번호를 받아
  회원을 찾거나 만들고 세션을 연다. 세션 쿠키 값은 DB 에 해시(SHA-256)로만 남는다.
- 한도: 주소마다 10분에 로그인 마무리(콜백) 20번까지(제공자 토큰 주소를 대신 두드리지 못하게 · 주인 로그인과 같은 틀).
- 탈퇴: 회원 행 하나를 지우면 연결 · 세션 · 승차권이 같이 지워진다. 올린 프로필 사진 파일은 DB 를 지운 바로 뒤에 지운다
  (본인 탈퇴 · 카카오 연결 해제 · 관리자 탈퇴 처리 모두 — 관리자는 services/admin.py).
- 내 정보(2026-10-27): 닉네임 고치기 · 프로필 사진 올리기 · 캐릭터 고르기(검사는 services/profile.py, 사진 파일은 store/avatars.py).
  사진은 로그인한 본인만 /api/me/avatar/<무작위 이름> 으로 본다.
- 카카오 연결 해제 웹훅: 사용자가 카카오 쪽(계정 관리 · 계정 탈퇴 · 고객센터)에서 슝 연결을 끊으면 카카오가 알려 온다.
  Authorization: KakaoAK <대표 어드민 키> 로 진짜인지 보고, 본문 user_id(카카오 회원번호)의 회원을 정리한다
  (카카오 문서 kakaologin/callback#unlink · getting-started/callback — 받은 뒤 3초 안에 200, 그 회원이 없어도 200).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import threading
import time

from server.config import MemberConfig, avatar_dir
from server.services.login_providers import providers_from_config
from server.services.profile import (CHARACTERS, avatar_value, avatar_view, check_photo, clean_name, photo_name)
from server.sources.oauth import ProviderError
from server.store.avatars import AvatarFiles
from server.store.members import MemberStore

SESSION_AGE = 30 * 24 * 3600
STATE_AGE = 600   # 제공자 화면에서 돌아올 때까지
TRIES, TRY_WINDOW = 20, 600
TIME = re.compile(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]")   # ASCII 숫자만 · fullmatch 로 전체를 본다(끝 개행 · 유니코드 숫자 거부)
# 한국 안 좌표만(장소는 카카오 장소 검색에서 고른다)
LAT_RANGE, LNG_RANGE = (32.0, 39.5), (124.0, 132.0)
TICKET_LIMIT = 20   # 사람당 승차권 수
NAME_MAX = 12   # 승차권 이름(앞면 · '○○권' 띠에 들어간다)
LEGS_MAX = 12   # 고른 경로의 구간 수(걷기 포함)
COLOR = re.compile(r"#[0-9a-fA-F]{6}")
KAKAO_MEMBER = re.compile(r"[0-9]{1,20}")   # 카카오 회원번호(/v2/user/me 의 id 와 같은 수 — 저장은 str(id))
PHOTO_URL = "/api/me/avatar/{name}"   # 로그인한 본인만 보는 사진 주소(routes/members.py)
ORPHAN_AGE = 3600   # 정리할 때 이보다 갓 쓴 사진 파일은 건드리지 않는다(올리는 중일 수 있다)


class LoginError(Exception):
    """code: state(요청이 맞지 않음) · denied(사용자가 취소) · provider(제공자 실패) · limit(시도 한도) · unknown(없는 제공자)."""
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _place(value, label: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"{label}지를 골라 주세요")
    name = value.get("name")
    lat, lng = value.get("lat"), value.get("lng")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        raise ValueError(f"{label} 이름은 1~80자예요")
    for number, (low, high) in ((lat, LAT_RANGE), (lng, LNG_RANGE)):
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not low <= number <= high:
            raise ValueError(f"{label} 좌표가 틀려요")
    return {"name": name.strip(), "lat": round(float(lat), 6), "lng": round(float(lng), 6)}


def _text(value, label: str, most: int = 40) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > most:
        raise ValueError(f"경로의 {label}이 틀려요")
    return value.strip()


def _count(value, label: str, most: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= most:
        raise ValueError(f"경로의 {label}이 틀려요")
    return value


def _clock(value, label: str) -> str:
    if not isinstance(value, str) or not TIME.fullmatch(value):
        raise ValueError(f"경로의 {label}이 틀려요")
    return value


def _leg(leg) -> dict:
    """길찾기(/api/route) 구간 하나 → 그리는 데 쓰는 칸만."""
    if not isinstance(leg, dict) or leg.get("type") not in ("walk", "ride", "bus"):
        raise ValueError("경로 구간이 틀려요")
    if leg["type"] == "walk":
        return {"type": "walk", "seconds": _count(leg.get("seconds"), "걷는 시간", 6 * 3600)}
    out = {"type": leg["type"]}
    if leg["type"] == "ride":
        out["line"] = _text(leg.get("line"), "노선", 20)
    else:
        out["route"] = _text(leg.get("route"), "버스 번호", 20)
        color = leg.get("color")
        if not isinstance(color, str) or not COLOR.fullmatch(color):
            raise ValueError("경로의 버스 색이 틀려요")
        out["color"] = color
    out.update({"from": _text(leg.get("from"), "타는 곳"), "to": _text(leg.get("to"), "내리는 곳"),
                "departs": _clock(leg.get("departs"), "출발 시각"), "arrives": _clock(leg.get("arrives"), "도착 시각"),
                "wait": _count(leg.get("wait"), "기다리는 시간", 6 * 3600)})
    return out


def _route(value) -> str | None:
    """발권할 때 고른 경로(길찾기 결과 한 개) → 저장할 JSON 글자. 없으면 None."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("경로가 틀려요")
    legs = value.get("legs")
    if not isinstance(legs, list) or not 1 <= len(legs) <= LEGS_MAX:
        raise ValueError(f"경로 구간은 1~{LEGS_MAX}개예요")
    tag = value.get("tag", "")
    if not isinstance(tag, str) or len(tag) > 20:
        raise ValueError("경로 이름표가 틀려요")
    route = {"tag": tag, "minutes": _count(value.get("minutes"), "걸리는 시간", 24 * 60),
             "leaveBy": _clock(value.get("leaveBy"), "출발 시각"), "arrives": _clock(value.get("arrives"), "도착 시각"),
             "transfers": _count(value.get("transfers"), "환승 수", LEGS_MAX),
             "walkMinutes": _count(value.get("walkMinutes"), "걷는 시간", 24 * 60),
             "legs": [_leg(leg) for leg in legs]}
    return json.dumps(route, ensure_ascii=False, separators=(",", ":"))


def clean_ticket(body) -> dict:
    """발권 · 고치기 본문 {name, from:{name,lat,lng}, to:{…}, depart:"HH:MM", days:[1..7], route?:{…}} → 저장할 값. 틀리면 ValueError."""
    if not isinstance(body, dict):
        raise ValueError("본문은 JSON 객체예요")
    name = body.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > NAME_MAX:
        raise ValueError(f"승차권 이름은 1~{NAME_MAX}자예요")
    origin, dest = _place(body.get("from"), "출발"), _place(body.get("to"), "도착")
    depart = body.get("depart")
    if not isinstance(depart, str) or not TIME.fullmatch(depart):
        raise ValueError("출발 시각은 HH:MM 이에요")
    days = body.get("days", [])
    if (not isinstance(days, list) or len(days) > 7
            or any(isinstance(day, bool) or not isinstance(day, int) or not 1 <= day <= 7 for day in days)):
        raise ValueError("타는 날은 1(월)~7(일) 목록이에요")
    return {"name": name.strip(), "from_name": origin["name"], "from_lat": origin["lat"], "from_lng": origin["lng"],
            "to_name": dest["name"], "to_lat": dest["lat"], "to_lng": dest["lng"], "depart_at": depart,
            "days": ",".join(str(day) for day in sorted(set(days))), "route": _route(body.get("route"))}


def ticket_view(row: dict) -> dict:
    """저장된 줄 → 응답 모양."""
    return {"id": row["id"], "name": row["name"],
            "from": {"name": row["from_name"], "lat": row["from_lat"], "lng": row["from_lng"]},
            "to": {"name": row["to_name"], "lat": row["to_lat"], "lng": row["to_lng"]},
            "depart": row["depart_at"], "days": [int(day) for day in (row["days"] or "").split(",") if day],
            "route": json.loads(row["route"]) if row.get("route") else None}


class WebhookError(Exception):
    """code: off(웹훅 키가 설정에 없음) · auth(카카오가 보낸 것이 아님 — 키 · 앱 ID 가 다름) · bad(회원번호가 없거나 틀림)."""
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class TicketLimit(Exception):
    """승차권이 이미 TICKET_LIMIT 장."""


class MemberService:
    def __init__(self, config: MemberConfig | None = None, *, store: MemberStore | None = None,
                 providers: dict | None = None, clock=time.time):
        self.config = config or MemberConfig.from_env()
        self.providers = providers_from_config(self.config) if providers is None else providers
        self.store = store or MemberStore(self.config.db_file)
        self.avatars = AvatarFiles(avatar_dir(self.store.path))   # 사진 폴더는 늘 회원 DB 옆(config.avatar_dir)
        self._clock = clock
        self._tries: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return bool(self.providers)

    def redirect_uri(self, provider: str) -> str:
        return f"{self.config.public_url}/api/auth/{provider}/callback"

    # ---- 로그인 ----
    def start(self, provider: str) -> tuple[str, str]:
        """→ (state, 제공자 인가 주소). state 는 쿠키에 담아 콜백에서 맞춰 본다."""
        if provider not in self.providers:
            raise LoginError("unknown")
        state = secrets.token_urlsafe(24)
        return state, self.providers[provider].authorize_url(state, self.redirect_uri(provider))

    def _allow(self, address: str) -> bool:
        """주소마다 TRY_WINDOW 초에 TRIES 번까지. 부를 때마다 한 번으로 센다."""
        now = self._clock()
        with self._lock:
            for old in [key for key, times in self._tries.items() if now - times[-1] >= TRY_WINDOW]:
                del self._tries[old]
            recent = [moment for moment in self._tries.get(address, []) if now - moment < TRY_WINDOW]
            if len(recent) >= TRIES:
                self._tries[address] = recent
                return False
            self._tries[address] = recent + [now]
            return True

    def finish(self, provider: str, query: dict, expected_state: str | None, address: str) -> tuple[str, bool]:
        """콜백 쿼리(code · state · error) → (새 세션 토큰(쿠키 값), 처음 가입했나). 실패는 LoginError."""
        if provider not in self.providers:
            raise LoginError("unknown")
        if not self._allow(address):
            raise LoginError("limit")
        state = query.get("state", [""])[0]
        if not expected_state or not state or not hmac.compare_digest(state.encode(), expected_state.encode()):
            raise LoginError("state")
        if query.get("error"):
            raise LoginError("denied")
        code = query.get("code", [""])[0]
        if not code or len(code) > 2048:
            raise LoginError("state")
        try:
            subject, name = self.providers[provider].identify(code, self.redirect_uri(provider))
        except ProviderError:
            raise LoginError("provider") from None
        now = int(self._clock())
        user_id, created = self.store.find_or_create_user(provider, subject, name, now)
        return self._new_session(user_id, now), created

    def _new_session(self, user_id: int, now: int) -> str:
        token = secrets.token_urlsafe(32)
        self.store.add_session(token_hash(token), user_id, now, now + SESSION_AGE)
        return token

    # ---- 세션으로 ----
    def user_id(self, token: str | None) -> int | None:
        if not token or len(token) > 200:
            return None
        return self.store.session_user(token_hash(token), int(self._clock()))

    def me(self, user_id: int) -> dict | None:
        user = self.store.user(user_id)
        return user and {"id": user["id"], "name": user["display_name"], "provider": user["provider"],
                         "avatar": avatar_view(user["avatar"], PHOTO_URL)}

    # ---- 내 정보: 닉네임 · 프로필 사진 ----
    def rename(self, user_id: int, body) -> dict | None:
        """본문 {name} → 바뀐 내 정보. 틀리면 ValueError, 회원이 없으면 None."""
        name = clean_name(body.get("name") if isinstance(body, dict) else None)
        return self.me(user_id) if self.store.set_name(user_id, name) else None

    def pick_character(self, user_id: int, body) -> dict | None:
        """본문 {character} → 바뀐 내 정보(앞에 올린 사진 파일은 지운다). 틀리면 ValueError."""
        character = body.get("character") if isinstance(body, dict) else None
        if character not in CHARACTERS:
            raise ValueError("없는 캐릭터예요")
        return self._set_avatar(user_id, avatar_value("character", character))

    def upload_photo(self, user_id: int, data: bytes) -> dict | None:
        """사진 바이트 → 바뀐 내 정보. 받을 수 없는 사진이면 PhotoError(ValueError). 새 파일을 쓴 뒤 DB 를 바꾸고 앞 사진을 지운다."""
        name = self.avatars.save(data, check_photo(data))
        try:
            return self._set_avatar(user_id, avatar_value("photo", name), new_photo=name)
        except BaseException:
            self.avatars.remove(name)   # DB 를 못 바꿨다 — 주인 없는 사진을 남기지 않는다
            raise

    def reset_avatar(self, user_id: int) -> dict | None:
        """기본 캐릭터로(올린 사진 파일은 지운다)."""
        return self._set_avatar(user_id, None)

    def _set_avatar(self, user_id: int, value: str | None, new_photo: str | None = None) -> dict | None:
        found, before = self.store.set_avatar(user_id, value)
        if not found:
            self.avatars.remove(new_photo)   # 그사이 탈퇴했다
            return None
        if photo_name(before) and photo_name(before) != new_photo:
            self.avatars.remove(photo_name(before))
        return self.me(user_id)

    def photo(self, user_id: int, name: str) -> tuple[bytes, str] | None:
        """내 사진 바이트와 형식(webp · jpg). 지금 내 사진 이름이 아니면 None(남의 사진 · 지난 사진은 안 준다)."""
        user = self.store.user(user_id)
        if not user or photo_name(user["avatar"]) != name:
            return None
        data = self.avatars.read(name)
        return (data, name.rsplit(".", 1)[1]) if data is not None else None

    def sweep_photos(self) -> list[str]:
        """어느 회원도 쓰지 않는 사진 파일(지우다 멈춘 것 등)을 지운다 → 지운 이름. 갓 쓴 파일(ORPHAN_AGE 안)은 둔다.
        하루 백업(jobs/member_backup.py)이 사본을 만들기 전에 부른다."""
        used = {photo_name(value) for value in self.store.avatars_in_use()}
        now = self._clock()
        removed = []
        for name in self.avatars.names():
            age = self.avatars.age(name, now)
            if name not in used and age is not None and age >= ORPHAN_AGE and self.avatars.remove(name):
                removed.append(name)
        return removed

    def logout(self, token: str | None) -> None:
        if token:
            self.store.delete_session(token_hash(token))

    def delete(self, user_id: int) -> None:
        removed = self.store.delete_user(user_id, int(self._clock()))
        if removed:
            self.avatars.remove(photo_name(removed["avatar"]))

    # ---- 카카오 연결 해제 웹훅 ----
    def check_kakao_webhook(self, authorization: str | None) -> None:
        """Authorization 머리말이 'KakaoAK <대표 어드민 키>' 인지(본문을 읽기 전에). 아니면 WebhookError."""
        key = self.config.kakao_admin_key
        if not key:
            raise WebhookError("off")
        if not hmac.compare_digest((authorization or "").strip().encode(), f"KakaoAK {key}".encode()):
            raise WebhookError("auth")

    def kakao_unlinked(self, fields: dict) -> bool:
        """웹훅 본문(app_id · user_id · referrer_type — 쿼리 · 폼을 parse_qs 한 것) → 지운 회원이 있었나. 틀리면 WebhookError."""
        app_id = fields.get("app_id", [""])[0]
        if self.config.kakao_app_id and not hmac.compare_digest(app_id.encode(), self.config.kakao_app_id.encode()):
            raise WebhookError("auth")
        subject = fields.get("user_id", [""])[0]
        if not KAKAO_MEMBER.fullmatch(subject):
            raise WebhookError("bad")
        return self._forget_kakao(subject)

    def _forget_kakao(self, subject: str) -> bool:
        """카카오 연결이 끊긴 회원은 본인 탈퇴와 똑같이 지운다(사용자 결정 2026-10-27 — 슝 회원은 로그인 방법이 하나라
        다시 들어올 길이 없다. 관리 기록은 남기지 않는다). 없는 회원이면 False."""
        removed = self.store.delete_identity_user("kakao", subject, int(self._clock()))
        if removed is None:
            return False
        self.avatars.remove(photo_name(removed["avatar"]))
        return True

    # ---- 승차권 ----
    def tickets(self, user_id: int) -> list[dict]:
        return [ticket_view(row) for row in self.store.tickets(user_id)]

    def add_ticket(self, user_id: int, body) -> dict:
        """발권: 검사 → 저장 → 저장된 모양. 틀리면 ValueError, 장수가 넘으면 TicketLimit."""
        ticket_id = self.store.add_ticket(user_id, clean_ticket(body), int(self._clock()), TICKET_LIMIT)
        if ticket_id is None:
            raise TicketLimit()
        return ticket_view(self.store.ticket(user_id, ticket_id))

    def update_ticket(self, user_id: int, ticket_id: int, body) -> dict | None:
        """그 사람의 승차권이 없으면 None. 틀리면 ValueError."""
        values = clean_ticket(body)
        if not self.store.update_ticket(user_id, ticket_id, values, int(self._clock())):
            return None
        return ticket_view(self.store.ticket(user_id, ticket_id))

    def delete_ticket(self, user_id: int, ticket_id: int) -> bool:
        return self.store.delete_ticket(user_id, ticket_id)
