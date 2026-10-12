"""주인 로그인 주소(Caddy forward_auth → /auth, 로그인 페이지 → POST /login · /logout).

GET /auth: 쿠키가 맞으면 204, 아니면 페이지는 /login.html 로 302, 자료(.json)는 401.
POST /login: 비밀번호가 맞으면 쿠키를 주고 next 로 303, 틀리면 /login.html?e=1(너무 많이 틀리면 e=wait).
"""
from __future__ import annotations

import urllib.parse

from server.routes.response import Response
from server.services.owner_auth import MAX_AGE

COOKIE = "syung_owner"


def safe_next(path: str) -> str:
    """Only back to a private page of this site."""
    return path if path.startswith(("/learning", "/debug")) and "//" not in path and "\\" not in path else "/learning"


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


def auth(auth_service, cookie_header: str | None, uri: str) -> Response:
    """uri: X-Forwarded-Uri(없으면 /learning) — Caddy 가 지키려는 주소."""
    if auth_service.valid_token(cookie_value(cookie_header)):
        return Response(204, "empty")
    if uri.split("?", 1)[0].endswith(".json"):
        return Response(401, body=b'{"ok":false,"error":"login"}')
    return Response(302, "redirect", location="/login.html?next=" + urllib.parse.quote(safe_next(uri), safe=""))


def logout() -> Response:
    return Response(303, "redirect", location="/login.html", cookie=clear_cookie())


def login(auth_service, form_bytes: bytes, address: str) -> Response:
    """form_bytes: 본문(4096 바이트까지), address: X-Forwarded-For 첫 주소(없으면 연결 주소)."""
    form = urllib.parse.parse_qs(form_bytes.decode("utf-8", "replace"))
    user, password = form.get("user", [""])[0], form.get("password", [""])[0]
    nxt = safe_next(form.get("next", ["/learning"])[0])
    if auth_service.check_password(user, password, address):
        return Response(303, "redirect", location=nxt, cookie=make_cookie(auth_service.issue_token()))
    error = "wait" if auth_service.blocked(address) else "1"
    return Response(303, "redirect", location=f"/login.html?e={error}&next=" + urllib.parse.quote(nxt, safe=""))
