"""주인 로그인 주소(Caddy forward_auth → /auth, 로그인 페이지 → POST /login · /logout).

관리 페이지는 모두 /admin 아래(로그인 페이지 /admin/login.html 만 열려 있다).
GET /auth: 쿠키가 맞으면 204, 아니면 페이지는 로그인 페이지로 302, 자료(.json)는 401.
POST /login: 비밀번호가 맞으면 쿠키를 주고 next 로 303, 틀리면 로그인 페이지?e=1(너무 많이 틀리면 e=wait).
"""
from __future__ import annotations

import urllib.parse
from typing import TYPE_CHECKING

from server.routes.response import Response
from server.services.owner_auth import MAX_AGE

if TYPE_CHECKING:   # 타입만
    from server.services.owner_auth import OwnerAuth

COOKIE = "syung_owner"
HOME = "/admin/learning"   # 로그인 뒤 기본으로 가는 곳
LOGIN_PAGE = "/admin/login.html"


def safe_next(path: str) -> str:
    """이 사이트의 관리 페이지(/admin, /admin/…)로만 돌아간다."""
    inside = path == "/admin" or path.startswith(("/admin/", "/admin?"))
    return path if inside and "//" not in path and "\\" not in path else HOME


def make_cookie(token: str) -> str:
    return f"{COOKIE}={token}; Max-Age={MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax"


def clear_cookie() -> str:
    return f"{COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"


def cookie_value(cookie_header: str | None) -> str | None:
    """Cookie 머리말에서 첫 syung_owner 값(없으면 None)."""
    for part in (cookie_header or "").split(";"):
        name, _, value = part.strip().partition("=")
        if name == COOKIE:
            return value
    return None


def auth(auth_service: OwnerAuth, cookie_header: str | None, uri: str) -> Response:
    """uri: X-Forwarded-Uri(없으면 HOME) — Caddy 가 지키려는 주소."""
    if auth_service.valid_token(cookie_value(cookie_header)):
        return Response(204, "empty")
    if uri.split("?", 1)[0].endswith(".json"):
        return Response(401, body=b'{"ok":false,"error":"login"}')
    return Response(302, "redirect", location=LOGIN_PAGE + "?next=" + urllib.parse.quote(safe_next(uri), safe=""))


def logout() -> Response:
    return Response(303, "redirect", location=LOGIN_PAGE, cookie=clear_cookie())


def login(auth_service: OwnerAuth, form_bytes: bytes, address: str) -> Response:
    """form_bytes: 본문(4096 바이트까지), address: X-Forwarded-For 첫 주소(없으면 연결 주소)."""
    form = urllib.parse.parse_qs(form_bytes.decode("utf-8", "replace"))
    user, password = form.get("user", [""])[0], form.get("password", [""])[0]
    nxt = safe_next(form.get("next", [HOME])[0])
    if auth_service.check_password(user, password, address):
        return Response(303, "redirect", location=nxt, cookie=make_cookie(auth_service.issue_token()))
    error = "wait" if auth_service.blocked(address) else "1"
    return Response(303, "redirect", location=f"{LOGIN_PAGE}?e={error}&next=" + urllib.parse.quote(nxt, safe=""))
