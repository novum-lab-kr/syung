"""디버깅 페이지 주소(주인 쿠키만). 바깥 주소는 /api/admin/debug/… — Caddy 가 /api 를, http.py 가 /admin 을 뗀다.

POST /debug/ride  탑승 기록 사건 묶음(JSON {"events": […]})
POST /debug/shot  캡처 파일 본문 그대로, ?note=…&state=…(JSON) — Content-Type 으로 종류를 안다
GET  /debug/recent       그날(?day=YYYYMMDD, 기본 오늘) 탑승 기록 요약 · 기록 있는 날 · 최근 캡처 목록
GET  /debug/bus-route    ?name=3011 → 노선 id 후보
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from server.routes.errors import api_error
from server.routes.owner import cookie_value
from server.services.debug import BadRequest

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable

    from server.services.runtime import Services

RIDE_BYTES = 1024 * 1024
LOGIN = (api_error("login", "로그인이 필요해요"), 401)


def allowed(services: Services, cookie_header: str | None) -> bool:
    return services.auth.valid_token(cookie_value(cookie_header))


def _guard(services: Services, cookie_header: str | None, action: Callable[[], dict[str, Any]]) -> tuple[dict[str, Any], int]:
    if not allowed(services, cookie_header):
        return LOGIN
    try:
        return action(), 200
    except BadRequest as error:
        return api_error("bad_request", str(error)), 400


def ride(services: Services, cookie_header: str | None, body: bytes) -> tuple[dict[str, Any], int]:
    return _guard(services, cookie_header, lambda: services.debug.record_ride(body))


def shot(services: Services, cookie_header: str | None, body: bytes, content_type: str, query: dict[str, list[str]]) -> tuple[dict[str, Any], int]:
    first: Callable[[str], str] = lambda key: (query.get(key) or [""])[0]
    return _guard(services, cookie_header, lambda: services.debug.save_shot(body, content_type, first("note"), first("state")))


def recent(services: Services, cookie_header: str | None, query: dict[str, list[str]]) -> tuple[dict[str, Any], int]:
    return _guard(services, cookie_header, lambda: services.debug.recent((query.get("day") or [""])[0]))


def bus_route(services: Services, cookie_header: str | None, query: dict[str, list[str]]) -> tuple[dict[str, Any], int]:
    return _guard(services, cookie_header, lambda: services.debug.find_bus_route((query.get("name") or [""])[0]))
