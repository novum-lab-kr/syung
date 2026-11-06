"""/route · /place: 좌표 · 시각 · 검색어 검사. 길찾기 결과는 (찾지 못해도) 200, 장소 검색 실패는 503."""
from __future__ import annotations

import math
from datetime import datetime
from typing import TYPE_CHECKING, Any

from server.clock import KST

if TYPE_CHECKING:   # 타입만
    from server.services.runtime import Services


def route(services: Services, query: dict[str, list[str]]) -> tuple[dict[str, Any], int]:
    """/route?from=lat,lng&to=lat,lng[&at=YYYY-MM-DDTHH:MM][&via=lat,lng] — see journey_graph.plan · plan_via(경유지).
    walk=1 이면 걷기 한 구간만(walk_route)."""
    if query.get("walk", [""])[0].strip() == "1":
        return walk_route(services, query)
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
    raw_via = query.get("via", [""])[0].strip()
    if not raw_via:   # 경유지 없음: 지금과 같은 부름
        return services.journey.plan(o, d, when), 200
    try:
        via = tuple(float(x) for x in raw_via.split(","))
        if len(via) != 2 or not all(math.isfinite(x) for x in via):
            raise ValueError
    except ValueError:
        return {"ok": False, "error": "경유지 좌표는 via=위도,경도 예요"}, 400
    return services.journey.plan(o, d, when, via), 200


def _point(raw: str) -> tuple[float, float] | None:
    """'위도,경도' → (lat, lng), 아니면 None."""
    try:
        values = tuple(float(x) for x in raw.split(","))
    except ValueError:
        return None
    if len(values) != 2 or not all(math.isfinite(x) for x in values):
        return None
    return values[0], values[1]


def walk_route(services: Services, query: dict[str, list[str]]) -> tuple[dict[str, Any], int]:
    """/route?walk=1&from=lat,lng&(to=lat,lng | station=역 id) — 걷기 한 구간만, 거리 제한 없음(journey_graph.walk_leg).
    station 이 있으면 to 는 보지 않는다. 답: {"ok": true, "leg": 걷기 구간}, 못 걸으면 200 {"ok": false, "error"}."""
    origin = _point(query.get("from", [""])[0])
    if origin is None:
        return {"ok": False, "error": "출발 좌표가 필요해요 (from=위도,경도)"}, 400
    raw_station = query.get("station", [""])[0].strip()
    if raw_station:
        try:
            station = int(raw_station)
        except ValueError:
            return {"ok": False, "error": "역 id 는 숫자예요 (station=역 id)"}, 400
        leg = services.journey.walk(origin, station=station)
        if leg is None:
            return {"ok": False, "error": "이 역으로 걸어가는 길을 찾지 못했어요"}, 200
        return {"ok": True, "leg": leg}, 200
    dest = _point(query.get("to", [""])[0])
    if dest is None:
        return {"ok": False, "error": "도착 좌표나 역이 필요해요 (to=위도,경도 또는 station=역 id)"}, 400
    leg = services.journey.walk(origin, dest)
    if leg is None:
        return {"ok": False, "error": "걸어가는 길을 찾지 못했어요"}, 200
    return {"ok": True, "leg": leg}, 200


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
