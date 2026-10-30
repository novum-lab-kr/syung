"""회원 주소(/api/auth/… · /api/me…). 운영 Caddy 는 /api 를 붙인 채 넘긴다(state 쿠키 경로가 /api/auth/ —
server/Caddyfile.example @member). 떼인 주소(/auth/… · /me…)도 같이 받는다.

GET    /api/auth/providers            → {"providers": ["kakao", …], "me": {"id","name","provider"} | null}(설정이 없으면 빈 목록 · me null — 화면은 로그인 줄을 숨긴다.
                                         me 를 같이 실어 화면이 요청 한 번으로 메뉴 칸을 그린다)
GET    /api/auth/<제공자>/start         → 302 제공자 로그인(state 쿠키)
GET    /api/auth/<제공자>/callback      → 302 /#login=ok(처음 가입이면 =new, 세션 쿠키) · 실패면 /#login=<코드>
POST   /api/auth/logout               → 204(세션 지움)
앱 로그인(2026-10-30 — 앱은 쿠키 세션을 못 쓴다. 흐름은 services/members.py 머리말):
GET    /api/auth/<제공자>/start?app=1&code_challenge=<S256>&code_challenge_method=S256
                                      → 302 제공자 로그인(state 쿠키에 code_challenge 를 같이 싣는다) · 400 bad_request(challenge 가 없거나 틀림)
GET    /api/auth/<제공자>/callback      (앱으로 시작한 로그인) → 302 syung://login?code=<일회용 코드>(60초 · 한 번) ·
                                         실패면 syung://login?error=<웹의 #login= 과 같은 코드>. 세션 쿠키는 주지 않는다
POST   /api/auth/app/token            {code, codeVerifier} → 200 {token, expiresAt(유닉스 초 — 받은 때 + 30일), new(처음 가입), me} ·
                                         400 invalid_code(없음 · 지남 · 이미 씀 · verifier 틀림 — 하나로) · 400 bad_request(본문)
앱은 그 뒤 모든 회원 주소에 Authorization: Bearer <token> 을 싣는다(쿠키 대신 — 둘 다 오면 Bearer). 로그아웃 · 기기 목록 · 탈퇴는 웹과 같은 주소.
앱 토큰은 쓸 때마다 끝나는 시각이 마지막 사용 + 30일로 밀린다(1시간에 한 번 고쳐 쓴다 · 응답에는 다시 싣지 않는다 — 401 이면 다시 로그인).
GET    /api/me                        → {"id","name","provider","avatar"} · 401
                                         avatar: null(기본 캐릭터) · {"type":"character","id"} · {"type":"photo","url":"/api/me/avatar/<이름>"}
DELETE /api/me                        → 204(회원 · 설정 · 올린 사진 모두 지움)
PUT    /api/me/profile                {name}  → 200 내 정보 · 400(1~12자)
PUT    /api/me/avatar                 사진: Content-Type image/webp · image/jpeg, 본문 = 256×256 사진(160 KB 까지) → 200 내 정보 ·
                                         400(형식 · 크기 · 메타데이터) · 413 / 캐릭터: Content-Type application/json {character} → 200 내 정보
DELETE /api/me/avatar                 → 200 내 정보(기본 캐릭터로 · 올린 사진 파일 지움)
GET    /api/me/avatar/<이름>           → 200 사진(지금 내 사진일 때만 — 남의 · 지난 사진은 404). 이름이 바뀌면 주소가 바뀌어 오래 캐시한다
GET    /api/me/tickets                → {"tickets":[{id,name,from:{name,lat,lng},to:{…},depart:"HH:MM",days:[1..7],route:{…}|null,via:{name,lat,lng}|null}]} · 401
                                         (via: 경유지 — 발권 본문에 via 를 넣으면 저장, 없거나 null 이면 경유지 없음)
POST   /api/me/tickets                → 201 승차권 한 장(발권) · 400(검사 실패) · 409(20장 넘음)
PUT    /api/me/tickets/<번호>          → 200 고친 한 장 · 404(남의 것 · 없음)
DELETE /api/me/tickets/<번호>          → 204 · 404
GET    /api/me/sessions               → {"sessions":[{id,device:"아이폰 · 사파리",createdAt,lastUsedAt,current}]}(지금 기기 먼저)
DELETE /api/me/sessions?others=1      → 200 {"removed":N}(지금 기기만 남기고 내 다른 기기 모두 로그아웃) · 400(others=1 이 없음)
DELETE /api/me/sessions/<번호>         → 204(내 기기 하나 로그아웃 — 지금 기기면 세션 쿠키도 지움) · 404(남의 것 · 없음)
GET    /api/me/stats                  → 내 통계 {joinedAt,daysTogether,tickets,weeklyRides,recent:{days,openDays,route,ticket},
                                         year:{openDays,route,ticket},daily:[{day,open,route,ticket}]}
POST   /api/me/usage                  {kind: open|route|ticket} → 204(오늘 그 종류 +1) · 400
GET    /api/me/export                 → 내 데이터 JSON 한 묶음(회원 정보 · 로그인 방법 · 기기 · 승차권 · 날짜별 사용 횟수 — 화면이 파일로 저장)
GET · POST /api/auth/kakao/unlink     → 카카오 연결 해제 웹훅(카카오 서버가 부른다). Authorization: KakaoAK <대표 어드민 키>,
                                         app_id · user_id · referrer_type 은 GET 쿼리 · POST 폼으로. 200(본문 없음 · 그 회원이 없어도) ·
                                         401(키 · 앱 ID 가 다름) · 400(회원번호가 틀림) · 404(KAKAO_ADMIN_KEY 없음)
바꾸는 요청(POST · PUT · DELETE)은 X-Requested-With: syung 머리말이 있어야 한다(다른 사이트의 폼 · 단순 요청을 막는다 —
쿠키 SameSite=Lax 에 더해). 앱(Bearer)도 같이 싣는다(앱 토큰 바꾸기 포함 — 규칙 하나). 웹훅만 예외 — 쿠키를 쓰지 않고 어드민 키로 확인한다. 오류 모양은 api_error 하나. 쿠키는 주인 로그인(routes/owner.py)과 같은 속성.
"""
from __future__ import annotations

import json
import re
import sqlite3
import urllib.parse
from typing import TYPE_CHECKING, Any, cast

from server.routes.errors import api_error
from server.routes.response import Response
from server.services.members import (APP_CHALLENGE, SESSION_AGE, STATE_AGE, TICKET_LIMIT, LoginError, TicketLimit,
                                     WebhookError, token_hash)
from server.services.profile import PHOTO_MAX_BYTES

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable
    from email.message import Message

    from server.services.members import MemberService

    ReadBody = Callable[[int], bytes | None]   # read_body(limit) → 본문 · None(너무 큼 · 없음)

SESSION_COOKIE = "syung_session"
STATE_COOKIE = "syung_login"
CSRF_HEADER, CSRF_VALUE = "X-Requested-With", "syung"
BODY_LIMIT = 16384   # 승차권 본문(고른 경로 구간 최대 12개 포함)
UNLINK_PATH = "/auth/kakao/unlink"
UNLINK_BODY_LIMIT = 2048   # 웹훅 폼(app_id · user_id · referrer_type · group_user_token)
APP_TOKEN_PATH = "/auth/app/token"
APP_RETURN = "syung://login"   # 앱 딥링크(app/app.json scheme "syung") — 고정 주소라 열린 넘기기가 아니다
APP_BODY_LIMIT = 1024   # {code, codeVerifier}


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


def session_token(headers: Message) -> str | None:
    """세션 토큰: 앱은 Authorization: Bearer <토큰>, 웹은 세션 쿠키. Bearer 가 있으면 그것만 본다(틀려도 쿠키로 넘어가지 않는다)."""
    scheme, _, value = (headers.get("Authorization") or "").strip().partition(" ")
    if scheme.lower() == "bearer":
        return value.strip() or None
    return cookie_value(headers.get("Cookie"), SESSION_COOKIE)


def _json(body: dict[str, Any], status: int = 200) -> Response:
    return Response(status, body=json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode())


def _error(status: int, code: str, message: str) -> Response:
    return _json(api_error(code, message), status)


LOGIN_NEEDED = ("login", "로그인이 필요해요")
TICKET_PATH = re.compile(r"/me/tickets/([1-9][0-9]{0,9})")
SESSION_PATH = re.compile(r"/me/sessions/([0-9a-f]{16})")
PHOTO_PATH = re.compile(r"/me/avatar/([A-Za-z0-9_-]{32}\.(?:webp|jpg))")
PHOTO_TYPES = {"image/webp": "webp", "image/jpeg": "jpg"}
CONTENT_TYPES = {"webp": "image/webp", "jpg": "image/jpeg"}


def handle(members: MemberService, method: str, path: str, headers: Message, read_body: ReadBody, address: str) -> Response | None:
    """path: 쿼리까지 붙은 요청 주소. read_body(limit) → bytes | None(너무 큼 · 없음). 회원 주소가 아니면 None."""
    split = urllib.parse.urlsplit(path)
    bare = member_path(split.path)
    if bare is None:
        return None
    if bare == UNLINK_PATH:
        try:
            return _kakao_unlink(members, method, split.query, headers, read_body)
        except (OSError, sqlite3.Error):
            # 못 지웠다 — 200 이 아니면 카카오가 다시 보낸다(5분 · 30분 · 60분)
            return _error(503, "unavailable", "회원 기능을 잠시 쓸 수 없어요")
    if method in ("POST", "PUT", "DELETE") and headers.get(CSRF_HEADER) != CSRF_VALUE:
        return _error(403, "forbidden", "이 요청은 슝 화면에서만 할 수 있어요")
    try:
        return _route(members, method, bare, urllib.parse.parse_qs(split.query), headers, read_body, address)
    except (OSError, sqlite3.Error):
        # DB 자리가 아직 없거나 잠겼다 — 내용(경로 · SQL)은 밖으로 내지 않는다
        return _error(503, "unavailable", "회원 기능을 잠시 쓸 수 없어요")


def _signed_in(members: MemberService, headers: Message) -> dict[str, Any] | None:
    """지금 로그인한 사람(없으면 None). 꺼져 있으면 DB 를 열지 않고, DB 를 못 쓰면 로그인 안 한 것으로 본다(로그인 줄은 그대로 뜬다)."""
    if not members.enabled:
        return None
    try:
        user_id = members.user_id(session_token(headers))
        return members.me(user_id) if user_id else None
    except (OSError, sqlite3.Error):
        return None


def _route(members: MemberService, method: str, bare: str, query: dict[str, list[str]], headers: Message, read_body: ReadBody,
           address: str) -> Response:
    if bare == "/auth/providers" and method == "GET":
        return _json({"providers": list(members.providers), "me": _signed_in(members, headers)})
    if not members.enabled:
        return _error(404, "not_found", "회원 기능이 꺼져 있어요")
    parts = bare.split("/")   # ["", "auth", 제공자, 동작]
    if bare == APP_TOKEN_PATH and method == "POST":
        return _app_token(members, read_body)
    if len(parts) == 4 and parts[1] == "auth" and method == "GET" and parts[3] in ("start", "callback"):
        return _start(members, parts[2], query) if parts[3] == "start" else _callback(members, parts[2], query, headers, address)
    if bare == "/auth/logout" and method == "POST":
        members.logout(session_token(headers))
        return Response(204, "empty", cookie=_cookie(SESSION_COOKIE, "", 0, "/"))
    ticket = TICKET_PATH.fullmatch(bare)
    photo = PHOTO_PATH.fullmatch(bare)
    session = SESSION_PATH.fullmatch(bare)
    if bare not in ("/me", "/me/tickets", "/me/profile", "/me/avatar") + ACCOUNT_PATHS and not ticket and not photo and not session:
        return _error(404, "not_found", "없는 주소예요")
    token = session_token(headers)
    user_id = members.user_id(token)
    me = members.me(user_id) if user_id else None
    if me is None:
        return _error(401, *LOGIN_NEEDED)
    user_id = cast("int", user_id)   # me 가 있으면 user_id 도 있다
    if bare in ACCOUNT_PATHS or session:
        return _account(members, method, bare, session, query, user_id, cast("str", token), read_body)   # 로그인했으면 토큰이 있다
    if bare == "/me":
        if method == "GET":
            return _json(me)
        if method == "DELETE":
            members.delete(user_id)
            return Response(204, "empty", cookie=_cookie(SESSION_COOKIE, "", 0, "/"))
    elif photo:
        if method == "GET":
            found = members.photo(user_id, photo.group(1))
            if found is None:
                return _error(404, "not_found", "없는 사진이에요")
            data, extension = found
            # 이름이 사진마다 새로 생겨(바꾸면 주소가 바뀐다) 오래 캐시해도 된다. 로그인한 본인 것이라 공용 캐시에는 두지 않는다
            return Response(200, "image", body=data, content_type=CONTENT_TYPES[extension],
                            cache="private, max-age=31536000, immutable")
    elif bare == "/me/profile":
        if method == "PUT":
            return _with_body(read_body, lambda body: _me_or_gone(members.rename(user_id, body)))
    elif bare == "/me/avatar":
        if method == "PUT":
            return _avatar(members, user_id, headers, read_body)
        if method == "DELETE":
            return _me_or_gone(members.reset_avatar(user_id))
    elif bare == "/me/tickets":
        if method == "GET":
            return _json({"tickets": members.tickets(user_id)})
        if method == "POST":
            return _with_body(read_body, lambda body: _json(members.add_ticket(user_id, body), 201))
    else:
        ticket_id = int(cast("re.Match[str]", ticket).group(1))   # 위 갈래들이 아니면 승차권 주소
        if method == "PUT":
            def save(body: object) -> Response:
                saved = members.update_ticket(user_id, ticket_id, body)
                return _json(saved) if saved else _error(404, "not_found", "없는 승차권이에요")
            return _with_body(read_body, save)
        if method == "DELETE":
            if members.delete_ticket(user_id, ticket_id):
                return Response(204, "empty")
            return _error(404, "not_found", "없는 승차권이에요")
    return _error(405, "method_not_allowed", "이 주소에서 할 수 없는 요청이에요")


ACCOUNT_PATHS = ("/me/sessions", "/me/stats", "/me/usage", "/me/export")


def _account(members: MemberService, method: str, bare: str, session: re.Match[str] | None, query: dict[str, list[str]], user_id: int, token: str,
             read_body: ReadBody) -> Response:
    """계정 칸 · 내 통계(로그인한 본인 것만 — 모두 user_id 로만 읽고 지운다)."""
    if session:
        if method == "DELETE":
            removed = members.logout_session(user_id, session.group(1))
            if removed is None:
                return _error(404, "not_found", "없는 로그인 기기예요")
            # 지금 기기를 골랐으면 이 브라우저의 쿠키도 지운다(로그아웃과 같게)
            current = removed == token_hash(token)
            return Response(204, "empty", cookie=_cookie(SESSION_COOKIE, "", 0, "/") if current else None)
    elif bare == "/me/sessions":
        if method == "GET":
            return _json({"sessions": members.sessions(user_id, token)})
        if method == "DELETE":
            if query.get("others", [""])[0] != "1":
                return _error(400, "bad_request", "다른 기기 모두 로그아웃은 others=1 이에요")
            return _json({"removed": members.logout_others(user_id, token)})
    elif bare == "/me/stats":
        if method == "GET":
            stats = members.stats(user_id)
            return _json(stats) if stats else _error(401, *LOGIN_NEEDED)
    elif bare == "/me/usage":
        if method == "POST":
            def count(body: object) -> Response:
                members.count_usage(user_id, body)
                return Response(204, "empty")
            return _with_body(read_body, count)
    elif bare == "/me/export":
        if method == "GET":
            data = members.export(user_id, token)
            return _json(data) if data else _error(401, *LOGIN_NEEDED)
    return _error(405, "method_not_allowed", "이 주소에서 할 수 없는 요청이에요")


WEBHOOK_ERRORS = {"off": (404, "not_found", "없는 주소예요"),
                  "auth": (401, "unauthorized", "카카오가 보낸 요청이 아니에요"),
                  "bad": (400, "bad_request", "회원번호가 없거나 틀려요")}


def _kakao_unlink(members: MemberService, method: str, query: str, headers: Message, read_body: ReadBody) -> Response:
    """카카오 연결 해제 웹훅. 키부터 보고 본문을 읽는다(남이 보낸 본문은 읽지 않는다). 회원번호는 응답 · 로그에 싣지 않는다."""
    if method not in ("GET", "POST"):
        return _error(405, "method_not_allowed", "이 주소에서 할 수 없는 요청이에요")
    try:
        members.check_kakao_webhook(headers.get("Authorization"))
        if method == "GET":
            fields = urllib.parse.parse_qs(query)
        else:
            raw = read_body(UNLINK_BODY_LIMIT)
            if raw is None:
                return _error(413, "too_large", "본문이 없거나 너무 커요")
            fields = urllib.parse.parse_qs(raw.decode("utf-8", "replace"))
        members.kakao_unlinked(fields)
    except WebhookError as error:
        return _error(*WEBHOOK_ERRORS[error.code])
    return Response(200, body=b"")


def _me_or_gone(me: dict[str, Any] | None) -> Response:
    """바꾼 뒤 내 정보 — 그사이 탈퇴했으면 401."""
    return _json(me) if me else _error(401, *LOGIN_NEEDED)


def _avatar(members: MemberService, user_id: int, headers: Message, read_body: ReadBody) -> Response:
    """PUT /me/avatar: 사진(image/webp · image/jpeg 본문 그대로) 또는 캐릭터({character} JSON)."""
    kind = (headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
    if kind in PHOTO_TYPES:
        raw = read_body(PHOTO_MAX_BYTES)
        if raw is None:
            return _error(413, "too_large", f"사진은 {PHOTO_MAX_BYTES // 1024} KB 까지예요")
        try:
            return _me_or_gone(members.upload_photo(user_id, raw))
        except ValueError as error:
            return _error(400, "bad_request", str(error))
    if kind == "application/json":
        return _with_body(read_body, lambda body: _me_or_gone(members.pick_character(user_id, body)))
    return _error(415, "unsupported", "WebP · JPEG 사진이나 캐릭터만 받아요")


def _with_body(read_body: ReadBody, work: Callable[[object], Response]) -> Response:
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


def _start(members: MemberService, provider: str, query: dict[str, list[str]]) -> Response:
    """state 쿠키: 웹 '<제공자>.<state>' · 앱 '<제공자>.<state>.<code_challenge>'(셋 다 '.' 이 없는 글자)."""
    held = ""
    if query.get("app", [""])[0] == "1":
        challenge = query.get("code_challenge", [""])[0]
        if query.get("code_challenge_method", [""])[0] != "S256" or not APP_CHALLENGE.fullmatch(challenge):
            return _error(400, "bad_request", "앱 로그인은 code_challenge(S256)가 있어야 해요")
        held = "." + challenge
    try:
        state, url = members.start(provider)
    except LoginError:
        return _error(404, "not_found", "없는 로그인 방법이에요")
    return Response(302, "redirect", location=url,
                    cookie=_cookie(STATE_COOKIE, f"{provider}.{state}{held}", STATE_AGE, "/api/auth/"))


def _app_token(members: MemberService, read_body: ReadBody) -> Response:
    """POST /auth/app/token {code, codeVerifier} → 세션 토큰. 틀린 까닭은 앱에 하나로만 알린다(invalid_code)."""
    raw = read_body(APP_BODY_LIMIT)
    if raw is None:
        return _error(413, "too_large", "본문이 없거나 너무 커요")
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _error(400, "bad_request", "본문은 JSON 이에요")
    fields: dict[str, Any] = cast("dict[str, Any]", body) if isinstance(body, dict) else {}
    code, verifier = fields.get("code"), fields.get("codeVerifier")
    if not isinstance(code, str) or not isinstance(verifier, str):
        return _error(400, "bad_request", "code · codeVerifier 는 글자예요")
    try:
        token, expires_at, created, user_id = members.redeem_app_code(code, verifier)
    except LoginError:
        return _error(400, "invalid_code", "로그인 코드가 맞지 않거나 지났어요. 다시 로그인해 주세요")
    return _json({"token": token, "expiresAt": expires_at, "new": created, "me": members.me(user_id)})


def _app_return(**fields: str) -> str:
    return f"{APP_RETURN}?{urllib.parse.urlencode(fields)}"


def _callback(members: MemberService, provider: str, query: dict[str, list[str]], headers: Message, address: str) -> Response:
    held = (cookie_value(headers.get("Cookie"), STATE_COOKIE) or "").split(".")
    held_provider, held_state = held[0], held[1] if len(held) > 1 else ""
    challenge = held[2] if len(held) == 3 and APP_CHALLENGE.fullmatch(held[2]) else ""
    clear_state = _cookie(STATE_COOKIE, "", 0, "/api/auth/")
    if challenge:   # 앱으로 시작한 로그인 — 세션 쿠키 대신 일회용 코드를 딥링크로
        try:
            code = members.finish_app(provider, query, held_state if held_provider == provider else None, address,
                                      headers.get("User-Agent"), challenge)
        except LoginError as error:
            return Response(302, "redirect", location=_app_return(error=error.code), cookie=clear_state)
        return Response(302, "redirect", location=_app_return(code=code), cookie=clear_state)
    try:
        token, created = members.finish(provider, query, held_state if held_provider == provider else None, address,
                                        headers.get("User-Agent"))
    except LoginError as error:
        return Response(302, "redirect", location=f"/#login={error.code}", cookie=clear_state)
    # 처음 가입이면 화면이 발권 화면으로 바로 이어 준다
    return Response(302, "redirect", location="/#login=new" if created else "/#login=ok",
                    cookie=_cookie(SESSION_COOKIE, token, SESSION_AGE, "/"), cookies=(clear_state,))
