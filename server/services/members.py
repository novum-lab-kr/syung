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
- 앱 로그인(2026-10-30 · 앱은 쿠키 세션을 못 쓴다): 앱이 시스템 브라우저로 start(app=1 · PKCE code_challenge)를 열고 →
  제공자 → 같은 콜백(제공자 콘솔에 등록한 리다이렉트 URI 그대로)이 세션 대신 일회용 코드를 만들어 딥링크로 앱에 돌려준다(finish_app) →
  앱이 코드 + code_verifier 를 세션 토큰으로 바꾼다(redeem_app_code — RFC 7636 S256 · 한 번만). 토큰은 웹 세션과 같은 sessions 줄이라
  로그인 기기 목록 · 기기별 로그아웃 · 탈퇴가 그대로 돈다(기기 수 제한 없음 — 웹과 같다). 일회용 코드는 메모리에만 APP_CODE_AGE 초
  (서버가 다시 뜨면 다시 로그인). 앱 세션만 쓸 때마다 SESSION_AGE 연장(사용자 결정 2026-10-30): 마지막 사용 시각을 고쳐 쓸 때
  (TOUCH_EVERY 간격) 끝나는 시각을 그때 + SESSION_AGE 로 민다 — SESSION_AGE 동안 안 쓰면 끝난다. 웹 세션은 만든 때부터 고정 그대로.
- 계정 · 내 통계(2026-10-27 계획서 D1~D4 — 모양은 services/account.py): 로그인 기기 목록 · 하나 / 다른 기기 모두 로그아웃,
  내 데이터 내려받기(JSON), 날짜별 사용 횟수. 세션의 마지막 사용 시각은 TOUCH_EVERY 초가 지났을 때만 고쳐 쓴다(쓰기를 줄인다).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
from datetime import timedelta
from typing import TYPE_CHECKING, Any, NamedTuple, Protocol, cast

from server.config import MemberConfig, avatar_dir
from server.services.account import (SESSION_ID, USAGE_KINDS, USAGE_MOST, app_device, device_of, session_id,
                                     session_view, stats_view, today_kst)
from server.services.fare import month_view
from server.services.login_providers import providers_from_config
from server.services.profile import (CHARACTERS, avatar_value, avatar_view, check_photo, clean_name, photo_name)
from server.sources.oauth import ProviderError
from server.store.avatars import AvatarFiles
from server.store.members import USAGE_DAYS, MemberStore

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable
    from pathlib import Path

    class LoginProvider(Protocol):
        """로그인 제공자가 갖춘 것(login_providers 의 카카오 · 구글 · Apple, 개발 서버 · 시험의 가짜)."""
        def authorize_url(self, state: str, redirect_uri: str) -> str: ...
        def identify(self, code: str, redirect_uri: str) -> tuple[str, str]: ...

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
TOUCH_EVERY = 3600   # 세션 마지막 사용 시각을 고쳐 쓰는 가장 짧은 간격(화면에는 날짜 · 시각만 보인다)
APP_CODE_AGE = 60   # 앱 일회용 코드 수명(딥링크로 돌아온 앱이 곧바로 바꾼다)
APP_CHALLENGE = re.compile(r"[A-Za-z0-9_-]{43}")   # PKCE S256 code_challenge(SHA-256 32바이트의 base64url · = 없음)
APP_VERIFIER = re.compile(r"[A-Za-z0-9._~-]{43,128}")   # PKCE code_verifier(RFC 7636 4.1)


class LoginError(Exception):
    """code: state(요청이 맞지 않음) · denied(사용자가 취소) · provider(제공자 실패) · limit(시도 한도) · unknown(없는 제공자)
    · code(앱 일회용 코드가 없음 · 지남 · 이미 씀 · code_verifier 가 맞지 않음 · 그사이 탈퇴 — 앱에는 하나로만 알린다)."""
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def pkce_challenge(verifier: str) -> str:
    """code_verifier → S256 code_challenge(RFC 7636 4.2 — BASE64URL(SHA256(ASCII(verifier))), = 없음)."""
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")


class AppCode(NamedTuple):
    """콜백이 앱에 건넨 일회용 코드 하나(메모리에 코드의 해시로 둔다)."""
    expires: int
    user_id: int
    created: bool   # 처음 가입했나(웹의 #login=new 와 같은 뜻)
    device: str
    challenge: str


def _place(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label}지를 골라 주세요")
    value = cast("dict[str, Any]", value)   # JSON 객체 — 키는 늘 글자
    name = value.get("name")
    lat, lng = value.get("lat"), value.get("lng")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        raise ValueError(f"{label} 이름은 1~80자예요")
    for number, (low, high) in ((lat, LAT_RANGE), (lng, LNG_RANGE)):
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not low <= number <= high:
            raise ValueError(f"{label} 좌표가 틀려요")
    # 위 검사를 지났으면 lat · lng 는 수다
    return {"name": name.strip(), "lat": round(float(cast("float", lat)), 6), "lng": round(float(cast("float", lng)), 6)}


def _text(value: object, label: str, most: int = 40) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > most:
        raise ValueError(f"경로의 {label}이 틀려요")
    return value.strip()


def _count(value: object, label: str, most: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= most:
        raise ValueError(f"경로의 {label}이 틀려요")
    return value


def _clock(value: object, label: str) -> str:
    if not isinstance(value, str) or not TIME.fullmatch(value):
        raise ValueError(f"경로의 {label}이 틀려요")
    return value


def _bus_color(value: object) -> str:
    if not isinstance(value, str) or not COLOR.fullmatch(value):
        raise ValueError("경로의 버스 색이 틀려요")
    return value


def _side_stop(value: object) -> dict[str, Any]:
    """옆 정류장 안내(boardAt · alightAt) → 이름 · 거리 · 출구만."""
    if not isinstance(value, dict):
        raise ValueError("경로의 옆 정류장이 틀려요")
    row = cast("dict[str, Any]", value)
    out: dict[str, Any] = {"name": _text(row.get("name"), "옆 정류장 이름"), "metres": _count(row.get("metres"), "옆 정류장 거리", 2000)}
    if row.get("exit"):
        out["exit"] = _text(row.get("exit"), "출구 번호", 8)
    if row.get("walkMinutes") is not None:
        out["walkMinutes"] = _count(row.get("walkMinutes"), "옆 정류장 걷는 분", 60)
    for key in ("id", "ars"):   # 정류장 id · 번호(같은 이름 다른 정류장을 가른다)
        if row.get(key):
            out[key] = _text(row.get(key), "옆 정류장 번호", 12)
    return out


def _alternatives(value: object) -> list[dict[str, Any]]:
    """같은 구간 다른 버스(alternatives) → 많아야 12개(서버 MAX_ALTERNATIVES), 번호 · 색 · 출발 · 도착만. 없으면 빈 목록."""
    if value is None:
        return []
    if not isinstance(value, list) or len(cast("list[Any]", value)) > 12:
        raise ValueError("경로의 같은 구간 버스가 틀려요")
    out: list[dict[str, Any]] = []
    for item in cast("list[Any]", value):
        if not isinstance(item, dict):
            raise ValueError("경로의 같은 구간 버스가 틀려요")
        row = cast("dict[str, Any]", item)
        saved: dict[str, Any] = {"route": _text(row.get("route"), "버스 번호", 20), "color": _bus_color(row.get("color")),
                                 "departs": _clock(row.get("departs"), "출발 시각"), "arrives": _clock(row.get("arrives"), "도착 시각")}
        for key in ("boardAt", "alightAt"):   # 옆 정류장일 때만
            if row.get(key):
                saved[key] = _side_stop(row[key])
        out.append(saved)
    return out


def _leg(leg: object) -> dict[str, Any]:
    """길찾기(/api/route) 구간 하나 → 그리는 데 쓰는 칸만."""
    if not isinstance(leg, dict) or cast("dict[str, Any]", leg).get("type") not in ("walk", "ride", "bus"):
        raise ValueError("경로 구간이 틀려요")
    leg = cast("dict[str, Any]", leg)   # 위에서 dict 인지 봤다
    if leg["type"] == "walk":
        walk: dict[str, Any] = {"type": "walk", "seconds": _count(leg.get("seconds"), "걷는 시간", 6 * 3600)}
        if leg.get("exit"):   # 갈아탈 때 나가는 출구 번호(없으면 칸을 두지 않는다)
            walk["exit"] = _text(leg.get("exit"), "출구 번호", 8)
        return walk
    out: dict[str, Any] = {"type": leg["type"]}
    if leg["type"] == "ride":
        out["line"] = _text(leg.get("line"), "노선", 20)
    else:
        out["route"] = _text(leg.get("route"), "버스 번호", 20)
        color = leg.get("color")
        if not isinstance(color, str) or not COLOR.fullmatch(color):
            raise ValueError("경로의 버스 색이 틀려요")
        out["color"] = color
        alternatives = _alternatives(leg.get("alternatives"))
        if alternatives:
            out["alternatives"] = alternatives
    out.update({"from": _text(leg.get("from"), "타는 곳"), "to": _text(leg.get("to"), "내리는 곳"),
                "departs": _clock(leg.get("departs"), "출발 시각"), "arrives": _clock(leg.get("arrives"), "도착 시각"),
                "wait": _count(leg.get("wait"), "기다리는 시간", 6 * 3600)})
    return out


def _route(value: object) -> str | None:
    """발권할 때 고른 경로(길찾기 결과 한 개) → 저장할 JSON 글자. 없으면 None."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("경로가 틀려요")
    value = cast("dict[str, Any]", value)   # JSON 객체 — 키는 늘 글자
    legs = value.get("legs")
    if not isinstance(legs, list) or not 1 <= len(cast("list[Any]", legs)) <= LEGS_MAX:
        raise ValueError(f"경로 구간은 1~{LEGS_MAX}개예요")
    legs = cast("list[Any]", legs)   # 위에서 list 인지 봤다
    tag = value.get("tag", "")
    if not isinstance(tag, str) or len(tag) > 20:
        raise ValueError("경로 이름표가 틀려요")
    route = {"tag": tag, "minutes": _count(value.get("minutes"), "걸리는 시간", 24 * 60),
             "leaveBy": _clock(value.get("leaveBy"), "출발 시각"), "arrives": _clock(value.get("arrives"), "도착 시각"),
             "transfers": _count(value.get("transfers"), "환승 수", LEGS_MAX),
             "walkMinutes": _count(value.get("walkMinutes"), "걷는 시간", 24 * 60),
             "legs": [_leg(leg) for leg in legs]}
    return json.dumps(route, ensure_ascii=False, separators=(",", ":"))


def clean_ticket(body: object) -> dict[str, Any]:
    """발권 · 고치기 본문 {name, from:{name,lat,lng}, to:{…}, depart:"HH:MM", days:[1..7], route?:{…}, via?:{name,lat,lng}} → 저장할 값.
    via 가 없거나 null 이면 경유지 없음. 틀리면 ValueError."""
    if not isinstance(body, dict):
        raise ValueError("본문은 JSON 객체예요")
    body = cast("dict[str, Any]", body)   # JSON 객체 — 키는 늘 글자
    name = body.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > NAME_MAX:
        raise ValueError(f"승차권 이름은 1~{NAME_MAX}자예요")
    origin, dest = _place(body.get("from"), "출발"), _place(body.get("to"), "도착")
    depart = body.get("depart")
    if not isinstance(depart, str) or not TIME.fullmatch(depart):
        raise ValueError("출발 시각은 HH:MM 이에요")
    days = body.get("days", [])
    if (not isinstance(days, list) or len(cast("list[Any]", days)) > 7
            or any(isinstance(day, bool) or not isinstance(day, int) or not 1 <= day <= 7 for day in cast("list[Any]", days))):
        raise ValueError("타는 날은 1(월)~7(일) 목록이에요")
    days = cast("list[int]", days)   # 위에서 1~7 수 목록인지 봤다
    via = None if body.get("via") is None else _place(body.get("via"), "경유")
    return {"name": name.strip(), "from_name": origin["name"], "from_lat": origin["lat"], "from_lng": origin["lng"],
            "to_name": dest["name"], "to_lat": dest["lat"], "to_lng": dest["lng"], "depart_at": depart,
            "days": ",".join(str(day) for day in sorted(set(days))), "route": _route(body.get("route")),
            "via_name": via["name"] if via else None, "via_lat": via["lat"] if via else None, "via_lng": via["lng"] if via else None}


def ticket_view(row: dict[str, Any]) -> dict[str, Any]:
    """저장된 줄 → 응답 모양."""
    return {"id": row["id"], "name": row["name"],
            "from": {"name": row["from_name"], "lat": row["from_lat"], "lng": row["from_lng"]},
            "to": {"name": row["to_name"], "lat": row["to_lat"], "lng": row["to_lng"]},
            "depart": row["depart_at"], "days": [int(day) for day in (row["days"] or "").split(",") if day],
            "route": json.loads(row["route"]) if row.get("route") else None,
            "via": {"name": row["via_name"], "lat": row["via_lat"], "lng": row["via_lng"]} if row.get("via_name") else None}


class WebhookError(Exception):
    """code: off(웹훅 키가 설정에 없음) · auth(카카오가 보낸 것이 아님 — 키 · 앱 ID 가 다름) · bad(회원번호가 없거나 틀림)."""
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class TicketLimit(Exception):
    """승차권이 이미 TICKET_LIMIT 장."""


class MemberService:
    def __init__(self, config: MemberConfig | None = None, *, store: MemberStore | None = None,
                 providers: dict[str, LoginProvider] | None = None, clock: Callable[[], float] = time.time):
        self.config = config or MemberConfig.from_env()
        self.providers = providers_from_config(self.config) if providers is None else providers
        self.store = store or MemberStore(self.config.db_file)
        self.avatars = AvatarFiles(avatar_dir(self.store.path))   # 사진 폴더는 늘 회원 DB 옆(config.avatar_dir)
        self._clock = clock
        self._tries: dict[str, list[float]] = {}
        self._app_codes: dict[str, AppCode] = {}
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

    def finish(self, provider: str, query: dict[str, list[str]], expected_state: str | None, address: str,
               user_agent: str | None = None) -> tuple[str, bool]:
        """콜백 쿼리(code · state · error) → (새 세션 토큰(쿠키 값), 처음 가입했나). 실패는 LoginError.
        user_agent: 기기 종류만 뽑아 세션에 남긴다(원문은 저장하지 않는다)."""
        user_id, created, now = self._identify(provider, query, expected_state, address)
        return self._new_session(user_id, now, device_of(user_agent)), created

    def finish_app(self, provider: str, query: dict[str, list[str]], expected_state: str | None, address: str,
                   user_agent: str | None, challenge: str) -> str:
        """앱 로그인 콜백 → 일회용 코드(딥링크로 앱에 건넨다). 세션은 앱이 코드를 바꿀 때 연다. 실패는 LoginError(finish 와 같은 code).
        challenge: start 때 앱이 보낸 PKCE S256 code_challenge(state 쿠키에 실려 돌아온 것)."""
        user_id, created, now = self._identify(provider, query, expected_state, address)
        code = secrets.token_urlsafe(32)
        with self._lock:
            for old in [key for key, held in self._app_codes.items() if held.expires <= now]:
                del self._app_codes[old]
            self._app_codes[token_hash(code)] = AppCode(now + APP_CODE_AGE, user_id, created, app_device(user_agent), challenge)
        return code

    def redeem_app_code(self, code: str, verifier: str) -> tuple[str, int, bool, int]:
        """일회용 코드 + code_verifier → (세션 토큰, 끝나는 시각(유닉스 초), 처음 가입했나, 회원 번호). 코드는 한 번만 —
        verifier 가 틀려도 지운다(코드 하나로 verifier 를 여러 번 맞춰 보지 못하게). 실패는 LoginError("code")."""
        if not code or len(code) > 200 or not APP_VERIFIER.fullmatch(verifier or ""):
            raise LoginError("code")
        now = int(self._clock())
        with self._lock:
            held = self._app_codes.pop(token_hash(code), None)
        if held is None or held.expires <= now:
            raise LoginError("code")
        if not hmac.compare_digest(pkce_challenge(verifier).encode(), held.challenge.encode()):
            raise LoginError("code")
        if self.store.user(held.user_id) is None:   # 코드를 받고 바꾸기 전에 탈퇴했다
            raise LoginError("code")
        token = self._new_session(held.user_id, now, held.device, app=True)
        return token, now + SESSION_AGE, held.created, held.user_id

    def _identify(self, provider: str, query: dict[str, list[str]], expected_state: str | None, address: str) -> tuple[int, bool, int]:
        """콜백 쿼리를 확인해 회원을 찾거나 만든다 → (회원 번호, 처음 가입했나, 지금 시각). 웹 · 앱 콜백이 같이 쓴다."""
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
        return user_id, created, now

    def _new_session(self, user_id: int, now: int, device: str = "", *, app: bool = False) -> str:
        token = secrets.token_urlsafe(32)
        self.store.add_session(token_hash(token), user_id, now, now + SESSION_AGE, device, app)
        return token

    # ---- 세션으로 ----
    def user_id(self, token: str | None) -> int | None:
        """살아 있는 세션의 회원 번호. 마지막 사용이 TOUCH_EVERY 초보다 오래면 지금으로 고쳐 쓴다(앱 세션은 끝나는 시각도 민다)."""
        if not token or len(token) > 200:
            return None
        hashed, now = token_hash(token), int(self._clock())
        found = self.store.session_user(hashed, now)
        if found is None:
            return None
        user_id, used_at = found
        if now - used_at >= TOUCH_EVERY:
            self.store.touch_session(hashed, now, now + SESSION_AGE)
        return user_id

    def me(self, user_id: int) -> dict[str, Any] | None:
        user = self.store.user(user_id)
        return user and {"id": user["id"], "name": user["display_name"], "provider": user["provider"],
                         "avatar": avatar_view(user["avatar"], PHOTO_URL)}

    # ---- 내 정보: 닉네임 · 프로필 사진 ----
    def rename(self, user_id: int, body: object) -> dict[str, Any] | None:
        """본문 {name} → 바뀐 내 정보. 틀리면 ValueError, 회원이 없으면 None."""
        name = clean_name(cast("dict[str, Any]", body).get("name") if isinstance(body, dict) else None)
        return self.me(user_id) if self.store.set_name(user_id, name) else None

    def pick_character(self, user_id: int, body: object) -> dict[str, Any] | None:
        """본문 {character} → 바뀐 내 정보(앞에 올린 사진 파일은 지운다). 틀리면 ValueError."""
        character = cast("dict[str, Any]", body).get("character") if isinstance(body, dict) else None
        if character not in CHARACTERS:
            raise ValueError("없는 캐릭터예요")
        return self._set_avatar(user_id, avatar_value("character", character))

    def upload_photo(self, user_id: int, data: bytes) -> dict[str, Any] | None:
        """사진 바이트 → 바뀐 내 정보. 받을 수 없는 사진이면 PhotoError(ValueError).
        새 파일을 쓴 뒤 DB 를 바꾸고, DB 가 새 사진을 가리키지 않게 끝난 경우(실패 · 그사이 탈퇴)에만 새 파일을 지운다."""
        name = self.avatars.save(data, check_photo(data))
        try:
            found, before = self.store.set_avatar(user_id, avatar_value("photo", name))
        except BaseException:
            self._forget_file(name)   # DB 를 못 바꿨다 — 주인 없는 사진을 남기지 않는다
            raise
        if not found:
            self._forget_file(name)   # 그사이 탈퇴했다
            return None
        # 여기부터는 DB 가 새 사진을 가리킨다 — 앞 사진 정리가 실패해도 새 사진은 건드리지 않는다
        self._forget_file(photo_name(before))
        return self.me(user_id)

    def reset_avatar(self, user_id: int) -> dict[str, Any] | None:
        """기본 캐릭터로(올린 사진 파일은 지운다)."""
        return self._set_avatar(user_id, None)

    def _set_avatar(self, user_id: int, value: str | None) -> dict[str, Any] | None:
        found, before = self.store.set_avatar(user_id, value)
        if not found:
            return None
        self._forget_file(photo_name(before))
        return self.me(user_id)

    def _forget_file(self, name: str | None) -> None:
        """더는 DB 가 가리키지 않는 사진 파일을 지운다. 지우다 실패해도(디스크 · 권한) 요청은 성공으로 두고
        파일은 하루 백업 전 정리(sweep_photos)가 다시 지운다."""
        if not name:
            return
        try:
            self.avatars.remove(name)
        except OSError:
            pass

    def photo(self, user_id: int, name: str) -> tuple[bytes, str] | None:
        """내 사진 바이트와 형식(webp · jpg). 지금 내 사진 이름이 아니면 None(남의 사진 · 지난 사진은 안 준다)."""
        user = self.store.user(user_id)
        if not user or photo_name(user["avatar"]) != name:
            return None
        data = self.avatars.read(name)
        return (data, name.rsplit(".", 1)[1]) if data is not None else None

    def photos_in_copy(self, db_file: Path) -> set[str]:
        """회원 DB 사본(백업이 막 뜬 파일)이 가리키는 사진 이름들."""
        return {name for name in map(photo_name, MemberStore.avatars_in_file(db_file)) if name}

    def sweep_photos(self) -> list[str]:
        """어느 회원도 쓰지 않는 사진 파일(지우다 멈춘 것 등)을 지운다 → 지운 이름. 갓 쓴 파일(ORPHAN_AGE 안)은 둔다.
        하루 백업(jobs/member_backup.py)이 사본을 만들기 전에 부른다."""
        used = {photo_name(value) for value in self.store.avatars_in_use()}
        now = self._clock()
        removed: list[str] = []
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
            self._forget_file(photo_name(removed["avatar"]))

    # ---- 계정: 로그인 기기 ----
    def sessions(self, user_id: int, token: str | None) -> list[dict[str, Any]]:
        """내 로그인 기기들(지금 기기 먼저, 그다음 최근에 쓴 차례). 지금 기기는 current: true."""
        current = token_hash(token) if token else None
        views = [session_view(row, current) for row in self.store.sessions(user_id, int(self._clock()))]
        return sorted(views, key=lambda view: not view["current"])   # 안정 정렬 — 나머지는 최근 차례 그대로

    def logout_session(self, user_id: int, public_id: str) -> str | None:
        """내 세션 하나를 지운다 → 지운 세션의 해시(지금 기기인지 부르는 쪽이 본다) · 내 세션이 아니면 None."""
        if not SESSION_ID.fullmatch(public_id or ""):
            return None
        for row in self.store.sessions(user_id, int(self._clock())):
            if session_id(row["token_hash"]) == public_id and self.store.delete_user_session(user_id, row["token_hash"]):
                return row["token_hash"]
        return None

    def logout_others(self, user_id: int, token: str) -> int:
        """지금 기기만 남기고 내 다른 세션을 모두 지운다 → 지운 수."""
        return self.store.delete_other_sessions(user_id, token_hash(token))

    # ---- 내 통계 · 사용 횟수 ----
    def count_usage(self, user_id: int, body: object) -> None:
        """본문 {kind}(open · route · ticket) → 오늘 그 종류 +1. 틀리면 ValueError."""
        kind = cast("dict[str, Any]", body).get("kind") if isinstance(body, dict) else None
        if kind not in USAGE_KINDS:
            raise ValueError("없는 사용 종류예요")
        self.store.count_usage(user_id, int(self._clock()), kind, USAGE_MOST)

    def _usage_rows(self, user_id: int) -> list[dict[str, Any]]:
        first = (today_kst(self._clock()) - timedelta(days=USAGE_DAYS - 1)).strftime("%Y-%m-%d")
        return self.store.usage(user_id, first)

    def stats(self, user_id: int) -> dict[str, Any] | None:
        joined = self.store.member_since(user_id)
        if joined is None:
            return None
        tickets = self.tickets(user_id)
        view = stats_view(self._clock(), joined, tickets, self._usage_rows(user_id))
        view["fare"] = month_view(tickets, self._clock())   # 이번 달 예상 교통비(D5 · D6 — services/fare.py)
        return view

    def prune_usage(self) -> int:
        """보관 기간(1년)이 지난 날짜별 사용 횟수를 지운다 → 지운 줄 수(하루 백업이 매일 부른다)."""
        return self.store.prune_usage(int(self._clock()))

    def export(self, user_id: int, token: str | None) -> dict[str, Any] | None:
        """내 데이터 한 묶음(회원 정보 · 로그인 방법 · 로그인 기기 · 승차권 · 날짜별 사용 횟수). 남의 것은 없다 — 모두 user_id 로만 읽는다.
        제공자 회원번호 · 세션 토큰(해시) · 사진 파일은 넣지 않는다(사진은 화면에서 따로 본다)."""
        me = self.me(user_id)
        joined = self.store.member_since(user_id)
        if me is None or joined is None:
            return None
        avatar = me["avatar"]
        return {"service": "슝", "exportedAt": int(self._clock()),
                "member": {"id": me["id"], "name": me["name"], "joinedAt": joined,
                           "avatar": None if avatar is None else {"type": avatar["type"], **({"id": avatar["id"]} if avatar["type"] == "character" else {})}},
                "logins": [{"provider": row["provider"], "linkedAt": row["created_at"]} for row in self.store.identities(user_id)],
                "devices": [{key: view[key] for key in ("device", "createdAt", "lastUsedAt", "current")}
                            for view in self.sessions(user_id, token)],
                "tickets": self.tickets(user_id),
                "usage": self._usage_rows(user_id)}

    # ---- 카카오 연결 해제 웹훅 ----
    def check_kakao_webhook(self, authorization: str | None) -> None:
        """Authorization 머리말이 'KakaoAK <대표 어드민 키>' 인지(본문을 읽기 전에). 아니면 WebhookError."""
        key = self.config.kakao_admin_key
        if not key:
            raise WebhookError("off")
        if not hmac.compare_digest((authorization or "").strip().encode(), f"KakaoAK {key}".encode()):
            raise WebhookError("auth")

    def kakao_unlinked(self, fields: dict[str, list[str]]) -> bool:
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
        self._forget_file(photo_name(removed["avatar"]))
        return True

    # ---- 승차권 ----
    def tickets(self, user_id: int) -> list[dict[str, Any]]:
        return [ticket_view(row) for row in self.store.tickets(user_id)]

    def add_ticket(self, user_id: int, body: object) -> dict[str, Any]:
        """발권: 검사 → 저장 → 저장된 모양. 틀리면 ValueError, 장수가 넘으면 TicketLimit."""
        ticket_id = self.store.add_ticket(user_id, clean_ticket(body), int(self._clock()), TICKET_LIMIT)
        if ticket_id is None:
            raise TicketLimit()
        return ticket_view(cast("dict[str, Any]", self.store.ticket(user_id, ticket_id)))   # 방금 넣었다

    def update_ticket(self, user_id: int, ticket_id: int, body: object) -> dict[str, Any] | None:
        """그 사람의 승차권이 없으면 None. 틀리면 ValueError."""
        values = clean_ticket(body)
        if not self.store.update_ticket(user_id, ticket_id, values, int(self._clock())):
            return None
        return ticket_view(cast("dict[str, Any]", self.store.ticket(user_id, ticket_id)))   # 방금 고쳤다

    def delete_ticket(self, user_id: int, ticket_id: int) -> bool:
        return self.store.delete_ticket(user_id, ticket_id)
