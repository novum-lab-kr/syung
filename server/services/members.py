"""회원: 소셜 로그인 흐름 · 세션 · 탈퇴 · 승차권(출발지 → 도착지 · 출발 시각 · 타는 날). HTTP 모양(쿠키 · 주소 · 상태 코드)은 routes/members.py 가 맡는다.

- 로그인: start 가 state(무작위)를 만들고 → 제공자 → finish 가 쿠키의 state 와 맞춰 본 뒤 인가 코드로 회원번호를 받아
  회원을 찾거나 만들고 세션을 연다. 세션 쿠키 값은 DB 에 해시(SHA-256)로만 남는다.
- 한도: 주소마다 10분에 로그인 마무리(콜백) 20번까지(제공자 토큰 주소를 대신 두드리지 못하게 · 주인 로그인과 같은 틀).
- 탈퇴: 회원 행 하나를 지우면 연결 · 세션 · 승차권이 같이 지워진다.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time

from server.config import MemberConfig
from server.services.login_providers import providers_from_config
from server.sources.oauth import ProviderError
from server.store.members import MemberStore

SESSION_AGE = 30 * 24 * 3600
STATE_AGE = 600   # 제공자 화면에서 돌아올 때까지
TRIES, TRY_WINDOW = 20, 600
TIME = re.compile(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]")   # ASCII 숫자만 · fullmatch 로 전체를 본다(끝 개행 · 유니코드 숫자 거부)
# 한국 안 좌표만(장소는 카카오 장소 검색에서 고른다)
LAT_RANGE, LNG_RANGE = (32.0, 39.5), (124.0, 132.0)
TICKET_LIMIT = 20   # 사람당 승차권 수
NAME_MAX = 12   # 승차권 이름(앞면 · '○○권' 띠에 들어간다)


class LoginError(Exception):
    """code: state(요청이 맞지 않음) · denied(사용자가 취소) · provider(제공자 실패) · limit(시도 한도) · unknown(없는 제공자)."""
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _place(value, label: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"{label}를 골라 주세요")
    name = value.get("name")
    lat, lng = value.get("lat"), value.get("lng")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        raise ValueError(f"{label} 이름은 1~80자예요")
    for number, (low, high) in ((lat, LAT_RANGE), (lng, LNG_RANGE)):
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not low <= number <= high:
            raise ValueError(f"{label} 좌표가 틀려요")
    return {"name": name.strip(), "lat": round(float(lat), 6), "lng": round(float(lng), 6)}


def clean_ticket(body) -> dict:
    """발권 · 고치기 본문 {name, from:{name,lat,lng}, to:{…}, depart:"HH:MM", days:[1..7]} → 저장할 값. 틀리면 ValueError."""
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
            "days": ",".join(str(day) for day in sorted(set(days)))}


def ticket_view(row: dict) -> dict:
    """저장된 줄 → 응답 모양."""
    return {"id": row["id"], "name": row["name"],
            "from": {"name": row["from_name"], "lat": row["from_lat"], "lng": row["from_lng"]},
            "to": {"name": row["to_name"], "lat": row["to_lat"], "lng": row["to_lng"]},
            "depart": row["depart_at"], "days": [int(day) for day in (row["days"] or "").split(",") if day]}


class TicketLimit(Exception):
    """승차권이 이미 TICKET_LIMIT 장."""


class MemberService:
    def __init__(self, config: MemberConfig | None = None, *, store: MemberStore | None = None,
                 providers: dict | None = None, clock=time.time):
        self.config = config or MemberConfig.from_env()
        self.providers = providers_from_config(self.config) if providers is None else providers
        self.store = store or MemberStore(self.config.db_file)
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
        return user and {"id": user["id"], "name": user["display_name"], "provider": user["provider"]}

    def logout(self, token: str | None) -> None:
        if token:
            self.store.delete_session(token_hash(token))

    def delete(self, user_id: int) -> None:
        self.store.delete_user(user_id)

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
