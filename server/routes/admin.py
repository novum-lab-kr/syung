"""관리 화면 주소(주인 쿠키만 — http.py 가 쿠키를 먼저 보고 /admin 을 뗀 주소로 부른다). 바깥 주소는 /api/admin/…

GET    /members/stats                → {total, today, week, month, providers:[{provider,count}], daily:[{day,count}] 30일}
                                       + withdraw:{total, today, week, month, reasons:[{reason,count}], daily:[{day,count}] 30일}
                                         — 탈퇴 수만(reason: self · kakao_unlink · admin, 누구인지 없음)
GET    /members?q=&page=             → {total, page, pageSize, members:[{id,name,createdAt,provider,tickets,lastLogin,sessions}]}
GET    /members/<번호>                → 목록 칸 + identities · ticketList(장소 · 경로 빼고) · log · 404
POST   /members/<번호>/places         {reason}            → {places:[{id,name,from:{name,lat,lng},to:{…}}]} — 열람 기록을 남긴다
POST   /members/<번호>/logout         {reason}            → {ok, sessions} — 그 회원 세션 모두 삭제 · 기록
DELETE /members/<번호>                {reason, confirm}   → {ok, removed:{identities,sessions,tickets}} — 탈퇴 처리 · 기록
GET    /status                       → API 호출 수/한도 · 캐시 · 지금 문제 · 서버 시작 시각
바꾸는 요청(POST · DELETE)은 X-Requested-With: syung 머리말이 있어야 한다(회원 주소와 같은 틀). 오류 모양은 api_error 하나.
"""
from __future__ import annotations

import json
import re
import sqlite3

from server.routes.errors import api_error
from server.services.admin import AdminError

BODY_LIMIT = 4096
CSRF_HEADER, CSRF_VALUE = "X-Requested-With", "syung"
MEMBER = re.compile(r"/members/([1-9][0-9]{0,11})(/places|/logout)?")
NOT_FOUND = (api_error("not_found", "없는 회원이에요"), 404)


def is_admin_path(path: str) -> bool:
    """/admin 을 뗀 주소가 이 모듈 담당인지(아니면 debug 쪽 표를 본다)."""
    return path in ("/status", "/members", "/members/stats") or MEMBER.fullmatch(path) is not None


def _first(query: dict, key: str) -> str:
    return (query.get(key) or [""])[0]


def _page(text: str) -> int:
    return int(text) if text.isascii() and text.isdigit() and len(text) <= 6 else 1


def handle(admin, method: str, path: str, query: dict, headers, read_body) -> tuple[dict, int]:
    """read_body(limit) → bytes | None(너무 큼 · 없음). 주인 쿠키는 부르는 쪽이 이미 확인했다."""
    if method in ("POST", "DELETE") and headers.get(CSRF_HEADER) != CSRF_VALUE:
        return api_error("forbidden", "이 요청은 관리 화면에서만 할 수 있어요"), 403
    try:
        return _route(admin, method, path, query, read_body)
    except AdminError as error:
        return api_error("bad_request", str(error)), 400
    except (OSError, sqlite3.Error):
        # DB 자리가 아직 없거나 잠겼다 — 내용(경로 · SQL)은 밖으로 내지 않는다
        return api_error("unavailable", "회원 DB 를 잠시 쓸 수 없어요"), 503


def _route(admin, method, path, query, read_body) -> tuple[dict, int]:
    if method == "GET" and path == "/status":
        return admin.status(), 200
    if method == "GET" and path == "/members/stats":
        return admin.stats(), 200
    if method == "GET" and path == "/members":
        return admin.members(_first(query, "q"), _page(_first(query, "page"))), 200
    match = MEMBER.fullmatch(path)
    if match is None:
        return api_error("method_not_allowed", "이 주소에서 할 수 없는 요청이에요"), 405
    user_id, action = int(match.group(1)), match.group(2)
    if action is None and method == "GET":
        member = admin.member(user_id)
        return (member, 200) if member else NOT_FOUND
    if (action is None and method == "DELETE") or (action and method == "POST"):
        body = _body(read_body)
        if action == "/places":
            places = admin.places(user_id, body)
            return ({"places": places}, 200) if places is not None else NOT_FOUND
        if action == "/logout":
            removed = admin.logout(user_id, body)
            return ({"ok": True, "sessions": removed}, 200) if removed is not None else NOT_FOUND
        removed = admin.delete(user_id, body)
        return ({"ok": True, "removed": removed}, 200) if removed is not None else NOT_FOUND
    return api_error("method_not_allowed", "이 주소에서 할 수 없는 요청이에요"), 405


def _body(read_body):
    raw = read_body(BODY_LIMIT)
    if raw is None:
        raise AdminError("본문이 없거나 너무 커요")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise AdminError("본문은 JSON 이에요") from None
