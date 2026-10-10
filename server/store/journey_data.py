"""길찾기 정적 자료(data/ 아래 JSON) 읽기. 무엇을 어떻게 쓰는지는 services/journey_graph.py 가 정한다."""
from __future__ import annotations

import json
from pathlib import Path

from server.config import ROOT

METRO = ROOT / "data/ktdb-gtfs-2025/capital-metro.json"   # 역 · 노선 순서(KTDB)
JOURNEY = ROOT / "data/journey.json"   # 역 사이 시간 · 배차 · 환승(pipeline/build_journey_data.py)
TIMING = ROOT / "data/live-timing.json"
EXITS = ROOT / "data/osm-tracks/exits.json"
BUS = ROOT / "data/bus.json"   # pipeline/build_bus_data.py; optional
BUS_STOP_FIX = ROOT / "data/bus-stop-fix.json"   # pipeline/fix_bus_stops.py; optional
BUS_SHAPES = ROOT / "data/bus-shapes.json"   # pipeline/build_bus_shapes.py; optional


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_optional(path: Path, default=None):
    """없는 파일이면 default(있는데 깨졌으면 예외 — 옛 코드와 같다)."""
    return read(path) if path.exists() else default
