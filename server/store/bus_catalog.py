"""버스 정적 자료(data/bus/routes.json · stops.json) 읽기. 틀린 파일은 예외로 알리고, 쓸지 말지는 services 가 정한다."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def read_routes(path: Path) -> dict[str, Any]:
    """노선 id → 노선. schemaVersion 이 1 이 아니거나 모양이 틀리면 OSError · ValueError · KeyError · TypeError."""
    payload: dict[str, Any] = json.loads(path.read_text())
    if payload["schemaVersion"] != 1:
        raise ValueError("schema")
    return {route["id"]: route for route in payload["routes"]}


def read_route_list(path: Path) -> list[Any]:
    return json.loads(path.read_text())["routes"]


def file_stamp(path: Path) -> tuple[int, int]:
    """(수정 시각 ns, 크기): 배포로 파일이 바뀌었는지 알아채는 데 쓴다."""
    info = path.stat()
    return info.st_mtime_ns, info.st_size


def read_stops(path: Path) -> dict[str, Any]:
    """정류장 번호(arsId) → 정류장."""
    payload: dict[str, Any] = json.loads(path.read_text())
    if payload["schemaVersion"] != 1:
        raise ValueError("schema")
    return {stop["arsId"]: stop for stop in payload["stops"] if stop.get("arsId")}
