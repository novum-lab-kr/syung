"""새 /api/… 주소의 오류 모양 하나: {"error": {"code": …, "message": …}}.

옛 주소(/live · /route · /place · /bus/live · /api/bus/live · /auth …)는 지금 화면(web/)이 읽는 모양 그대로라 쓰지 않는다.
message 에는 사람이 읽을 고정 문구만(바깥 API 원문 · 키가 든 주소 · 개인정보는 싣지 않는다).
"""
from __future__ import annotations


def api_error(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}
