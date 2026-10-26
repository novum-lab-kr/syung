"""회원 주소(/api/auth/… · /api/me…). 운영 Caddy 가 /api 를 떼고 넘기므로 떼인 주소(/auth/… · /me…)와 붙은 주소 둘 다 받는다.

GET    /api/auth/providers            → {"providers": ["kakao", …]}(설정이 없으면 빈 목록 — 화면은 로그인 줄을 숨긴다)
GET    /api/auth/<제공자>/start         → 302 제공자 로그인(state 쿠키)
GET    /api/auth/<제공자>/callback      → 302 /#login=ok(처음 가입이면 =new, 세션 쿠키) · 실패면 /#login=<코드>
POST   /api/auth/logout               → 204(세션 지움)
GET    /api/me                        → {"id","name","provider"} · 401
DELETE /api/me                        → 204(회원 · 설정 모두 지움)
GET    /api/me/tickets                → {"tickets":[{id,name,from:{name,lat,lng},to:{…},depart:"HH:MM",days:[1..7]}]} · 401
POST   /api/me/tickets                → 201 승차권 한 장(발권) · 400(검사 실패) · 409(20장 넘음)
PUT    /api/me/tickets/<번호>          → 200 고친 한 장 · 404(남의 것 · 없음)
DELETE /api/me/tickets/<번호>          → 204 · 404
바꾸는 요청(POST · PUT · DELETE)은 X-Requested-With: syung 머리말이 있어야 한다(다른 사이트의 폼 · 단순 요청을 막는다 —
쿠키 SameSite=Lax 에 더해). 오류 모양은 api_error 하나. 쿠키는 주인 로그인(routes/owner.py)과 같은 속성.
"""
from __future__ import annotations

import json
import re
import sqlite3
import urllib.parse

from server.routes.errors import api_error
from server.routes.response import Response
from server.services.members import SESSION_AGE, STATE_AGE, TICKET_LIMIT, LoginError, TicketLimit

SESSION_COOKIE = "syung_session"
STATE_COOKIE = "syung_login"
CSRF_HEADER, CSRF_VALUE = "X-Requested-With", "syung"
BODY_LIMIT = 4096


def member_path(path: str) -> str | None:
    """/api/me · /me → /me. 회원 주소가 아니면 None(/auth 하나 — 주인 forward_auth — 는 회원 주소가 아니다)."""
    bare = path[4:] if path.startswith("/api/") else path
    if bare == "/me" or bare.startswith("/me/") or bare.startswith("/auth/"):
        return bare
    return None


def _cookie(name: str, value: str, age: int, path: str) -> str:
    return f"{name}={value}; Max-Age={age}; Path={path}; HttpOnly; Secure; SameSite=Lax"


def cookie_value(cookie_header: str | None, name: str) -> str | None:
    for part in (cookie_header or "").split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return None


def _json(body: dict, status: int = 200) -> Response:
    return Response(status, body=json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode())


def _error(status: int, code: str, message: str) -> Response:
    return _json(api_error(code, message), status)


LOGIN_NEEDED = ("login", "로그인이 필요해요")
TICKET_PATH = re.compile(r"/me/tickets/([1-9][0-9]{0,9})")


def handle(members, method: str, path: str, headers, read_body, address: str) -> Response | None:
    """path: 쿼리까지 붙은 요청 주소. read_body(limit) → bytes | None(너무 큼 · 없음). 회원 주소가 아니면 None."""
    split = urllib.parse.urlsplit(path)
    bare = member_path(split.path)
    if bare is None:
        return None
    if method in ("POST", "PUT", "DELETE") and headers.get(CSRF_HEADER) != CSRF_VALUE:
        return _error(403, "forbidden", "이 요청은 슝 화면에서만 할 수 있어요")
    try:
        return _route(members, method, bare, urllib.parse.parse_qs(split.query), headers, read_body, address)
    except (OSError, sqlite3.Error):
        # DB 자리가 아직 없거나 잠겼다 — 내용(경로 · SQL)은 밖으로 내지 않는다
        return _error(503, "unavailable", "회원 기능을 잠시 쓸 수 없어요")


def _route(members, method, bare, query, headers, read_body, address) -> Response:
    if bare == "/auth/providers" and method == "GET":
        return _json({"providers": list(members.providers)})
    if not members.enabled:
        return _error(404, "not_found", "회원 기능이 꺼져 있어요")
    parts = bare.split("/")   # ["", "auth", 제공자, 동작]
    if len(parts) == 4 and parts[1] == "auth" and method == "GET" and parts[3] in ("start", "callback"):
        return _start(members, parts[2]) if parts[3] == "start" else _callback(members, parts[2], query, headers, address)
    if bare == "/auth/logout" and method == "POST":
        members.logout(cookie_value(headers.get("Cookie"), SESSION_COOKIE))
        return Response(204, "empty", cookie=_cookie(SESSION_COOKIE, "", 0, "/"))
    ticket = TICKET_PATH.fullmatch(bare)
    if bare not in ("/me", "/me/tickets") and not ticket:
        return _error(404, "not_found", "없는 주소예요")
    user_id = members.user_id(cookie_value(headers.get("Cookie"), SESSION_COOKIE))
    me = members.me(user_id) if user_id else None
    if me is None:
        return _error(401, *LOGIN_NEEDED)
    if bare == "/me":
        if method == "GET":
            return _json(me)
        if method == "DELETE":
            members.delete(user_id)
            return Response(204, "empty", cookie=_cookie(SESSION_COOKIE, "", 0, "/"))
    elif bare == "/me/tickets":
        if method == "GET":
            return _json({"tickets": members.tickets(user_id)})
        if method == "POST":
            return _with_body(read_body, lambda body: _json(members.add_ticket(user_id, body), 201))
    else:
        ticket_id = int(ticket.group(1))
        if method == "PUT":
            def save(body):
                saved = members.update_ticket(user_id, ticket_id, body)
                return _json(saved) if saved else _error(404, "not_found", "없는 승차권이에요")
            return _with_body(read_body, save)
        if method == "DELETE":
            if members.delete_ticket(user_id, ticket_id):
                return Response(204, "empty")
            return _error(404, "not_found", "없는 승차권이에요")
    return _error(405, "method_not_allowed", "이 주소에서 할 수 없는 요청이에요")


def _with_body(read_body, work) -> Response:
    """JSON 본문을 읽어 work(본문) — 검사 실패 · 장수 한도는 400 · 409."""
    raw = read_body(BODY_LIMIT)
    if raw is None:
        return _error(413, "too_large", "본문이 없거나 너무 커요")
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _error(400, "bad_request", "본문은 JSON 이에요")
    try:
        return work(body)
    except TicketLimit:
        return _error(409, "too_many", f"승차권은 {TICKET_LIMIT}장까지예요")
    except ValueError as error:
        return _error(400, "bad_request", str(error))


def _start(members, provider: str) -> Response:
    try:
        state, url = members.start(provider)
    except LoginError:
        return _error(404, "not_found", "없는 로그인 방법이에요")
    return Response(302, "redirect", location=url,
                    cookie=_cookie(STATE_COOKIE, f"{provider}.{state}", STATE_AGE, "/api/auth/"))


def _callback(members, provider: str, query: dict, headers, address: str) -> Response:
    held = cookie_value(headers.get("Cookie"), STATE_COOKIE) or ""
    held_provider, _, held_state = held.partition(".")
    clear_state = _cookie(STATE_COOKIE, "", 0, "/api/auth/")
    try:
        token, created = members.finish(provider, query, held_state if held_provider == provider else None, address)
    except LoginError as error:
        return Response(302, "redirect", location=f"/#login={error.code}", cookie=clear_state)
    # 처음 가입이면 화면이 발권 화면으로 바로 이어 준다
    return Response(302, "redirect", location="/#login=new" if created else "/#login=ok",
                    cookie=_cookie(SESSION_COOKIE, token, SESSION_AGE, "/"), cookies=(clear_state,))
