"""/route · /place: 좌표 · 시각 · 검색어 검사. 길찾기 결과는 (찾지 못해도) 200, 장소 검색 실패는 503."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from server.clock import KST

if TYPE_CHECKING:   # 타입만
    from server.services.runtime import Services


def route(services: Services, query: dict[str, list[str]]) -> tuple[dict[str, Any], int]:
    """/route?from=lat,lng&to=lat,lng[&at=YYYY-MM-DDTHH:MM] — see journey_graph.plan."""
    try:
        o = tuple(float(x) for x in query.get("from", [""])[0].split(","))
        d = tuple(float(x) for x in query.get("to", [""])[0].split(","))
        if len(o) != 2 or len(d) != 2:
            raise ValueError
    except ValueError:
        return {"ok": False, "error": "출발지와 도착지 좌표가 필요해요 (from=위도,경도&to=위도,경도)"}, 400
    at = query.get("at", [""])[0].strip()
    try:
        when = datetime.strptime(at, "%Y-%m-%dT%H:%M").replace(tzinfo=KST) if at else datetime.now(KST)
    except ValueError:
        return {"ok": False, "error": "시각은 YYYY-MM-DDTHH:MM 형식이에요"}, 400
    return services.journey.plan(o, d, when), 200


def place(services: Services, query: dict[str, list[str]]) -> tuple[dict[str, Any], int]:
    """/place?q=...[&near=lat,lng] — Kakao Local search, cached 10 minutes per query."""
    q = query.get("q", [""])[0].strip()[:80]
    if not q:
        return {"ok": False, "error": "검색어가 필요해요"}, 400
    near: tuple[float, ...] | None = None
    try:
        near = tuple(float(x) for x in query.get("near", [""])[0].split(",")) or None
    except ValueError:
        pass
    body = services.places.search(q, near)
    return body, 200 if body["ok"] else 503
