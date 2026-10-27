"""예상 교통비 거리 자료(data/fare/ 아래 JSON — pipeline/build_fare_km.py 가 만든다) 읽기.
서버는 클론에서 돌고 data/ 만 바뀐 배포에는 다시 시작하지 않아, 파일의 수정 시각이 바뀌면 다시 읽는다. 없으면 None."""
from __future__ import annotations

import json
import threading
from pathlib import Path

from server.config import ROOT

HOP_KM = ROOT / "data/fare/hop_km.json"   # 전철: 이웃 역 쌍마다 공식 역간거리
BUS_KM = ROOT / "data/fare/bus_km.json"   # 버스: 서울 버스 노선마다 정류소 · 기점부터의 거리

_lock = threading.Lock()
_cache: dict[Path, tuple[float, object]] = {}


def read(path: Path):
    """JSON 내용(같은 수정 시각이면 앞에 읽은 것). 파일이 없으면 None."""
    try:
        stamp = path.stat().st_mtime
    except FileNotFoundError:
        return None
    with _lock:
        held = _cache.get(path)
        if held and held[0] == stamp:
            return held[1]
    data = json.loads(path.read_text(encoding="utf-8"))
    with _lock:
        _cache[path] = (stamp, data)
    return data
