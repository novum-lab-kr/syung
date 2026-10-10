"""routes 함수가 돌려주는 응답 한 개. 실제로 쓰는 일(헤더 · 직렬화)은 routes/http.py 의 Handler 가 한다."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Response:
    """kind: json(본문 바이트) · redirect(Location, 선택 Set-Cookie, 본문 없음) · empty(204, 길이 머리말 없음) · error(기본 HTML 오류)."""
    status: int
    kind: str = "json"
    body: bytes = b""
    location: str = ""
    cookie: str | None = None
