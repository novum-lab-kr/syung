"""회원: 소셜 로그인 흐름 · 세션 · 탈퇴 · 출퇴근 설정. HTTP 모양(쿠키 · 주소 · 상태 코드)은 routes/members.py 가 맡는다.

- 로그인: start 가 state(무작위)를 만들고 → 제공자 → finish 가 쿠키의 state 와 맞춰 본 뒤 인가 코드로 회원번호를 받아
  회원을 찾거나 만들고 세션을 연다. 세션 쿠키 값은 DB 에 해시(SHA-256)로만 남는다.
- 한도: 주소마다 10분에 로그인 마무리(콜백) 20번까지(제공자 토큰 주소를 대신 두드리지 못하게 · 주인 로그인과 같은 틀).
- 탈퇴: 회원 행 하나를 지우면 연결 · 세션 · 출퇴근이 같이 지워진다.
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


class LoginError(Exception):
    """code: state(요청이 맞지 않음) · denied(사용자가 취소) · provider(제공자 실패) · limit(시도 한도) · unknown(없는 제공자)."""
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _place(value, label: str) -> dict | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError(f"{label} 장소 모양이 틀려요")
    name = value.get("name")
    lat, lng = value.get("lat"), value.get("lng")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        raise ValueError(f"{label} 이름은 1~80자예요")
    for number, (low, high) in ((lat, LAT_RANGE), (lng, LNG_RANGE)):
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not low <= number <= high:
            raise ValueError(f"{label} 좌표가 틀려요")
    return {"name": name.strip(), "lat": round(float(lat), 6), "lng": round(float(lng), 6)}


def clean_commute(body) -> dict:
    """PUT /api/me/commute 본문 → 저장할 값. 틀리면 ValueError(사람이 읽을 문구)."""
    if not isinstance(body, dict):
        raise ValueError("본문은 JSON 객체예요")
    home, work = _place(body.get("home"), "집"), _place(body.get("work"), "회사")
    times = {}
    for key, label in (("leave", "나가는 시각"), ("back", "돌아오는 시각")):
        value = body.get(key)
        if value is not None and (not isinstance(value, str) or not TIME.fullmatch(value)):
            raise ValueError(f"{label}은 HH:MM 이에요")
        times[key] = value
    days = body.get("days", [])
    if (not isinstance(days, list) or len(days) > 7
            or any(isinstance(day, bool) or not isinstance(day, int) or not 1 <= day <= 7 for day in days)):
        raise ValueError("요일은 1(월)~7(일) 목록이에요")
    return {"home_name": home and home["name"], "home_lat": home and home["lat"], "home_lng": home and home["lng"],
            "work_name": work and work["name"], "work_lat": work and work["lat"], "work_lng": work and work["lng"],
            "leave_at": times["leave"], "back_at": times["back"], "days": ",".join(str(day) for day in sorted(set(days)))}


def commute_view(row: dict | None) -> dict:
    """저장된 줄 → 응답 모양(없으면 빈 설정)."""
    row = row or {}

    def place(prefix: str) -> dict | None:
        if row.get(prefix + "_name") is None:
            return None
        return {"name": row[prefix + "_name"], "lat": row[prefix + "_lat"], "lng": row[prefix + "_lng"]}
    days = row.get("days") or ""
    return {"home": place("home"), "work": place("work"), "leave": row.get("leave_at"), "back": row.get("back_at"),
            "days": [int(day) for day in days.split(",") if day]}


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

    def finish(self, provider: str, query: dict, expected_state: str | None, address: str) -> str:
        """콜백 쿼리(code · state · error) → 새 세션 토큰(쿠키 값). 실패는 LoginError."""
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
        user_id = self.store.find_or_create_user(provider, subject, name, now)
        return self._new_session(user_id, now)

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

    def commute(self, user_id: int) -> dict:
        return commute_view(self.store.commute(user_id))

    def save_commute(self, user_id: int, body) -> dict:
        """검사 → 저장 → 저장된 모양. 틀리면 ValueError."""
        self.store.save_commute(user_id, clean_commute(body), int(self._clock()))
        return self.commute(user_id)
