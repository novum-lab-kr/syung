"""OSRM 걷기 길찾기(OSRM_URL, 기본 http://127.0.0.1:5000 — 이 기계의 docker). 못 부르면 예외: 직선으로 대신할지는 services 가 정한다."""
from __future__ import annotations

import json
import urllib.request
from typing import Any


class OsrmSource:
    def __init__(self, base_url: str):
        self.base_url = base_url

    def _get(self, url: str) -> dict[str, Any]:
        with urllib.request.urlopen(url, timeout=6) as r:
            return json.load(r)

    def table(self, coords: list[str], query: str) -> dict[str, Any]:
        """한 곳 ↔ 여러 곳 걷는 시간 · 거리(coords 는 'lng,lat' 문자열, query 는 sources=…&destinations=…)."""
        return self._get(f"{self.base_url}/table/v1/foot/{';'.join(coords)}?{query}&annotations=duration,distance")

    def route(self, a: tuple[float, float], b: tuple[float, float]) -> dict[str, Any]:
        """a→b 걷는 길(a · b 는 (lat, lng)): 첫 경로 하나."""
        return self._get(f"{self.base_url}/route/v1/foot/{a[1]:.6f},{a[0]:.6f};{b[1]:.6f},{b[0]:.6f}?overview=full&geometries=geojson")["routes"][0]
