"""장소 검색(/place): 카카오 로컬 검색을 검색어마다 10분 담아 둔다."""
from __future__ import annotations

import time
import urllib.error

from server.config import JourneyConfig
from server.sources.kakao import search_places


class PlaceSearch:
    def __init__(self, config: JourneyConfig | None = None, *, search=None):
        self.config = config or JourneyConfig.from_env()
        self.search_places = search or search_places
        self.cache: dict[str, tuple[float, list]] = {}

    def search(self, q: str, near: tuple | None) -> dict:
        """q: 검사를 마친 검색어, near: 쿼리에서 읽은 좌표(길이가 2 가 아니면 위치 없이 찾는다). ok=False 면 실패."""
        k, now = f"{q}|{near}", time.time()
        hit = self.cache.get(k)
        if hit and now - hit[0] < 600:
            return {"ok": True, "places": hit[1]}
        try:
            places = self.search_places(self.config.kakao_key, q, near if near and len(near) == 2 else None)
        except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
            return {"ok": False, "error": f"장소 검색 실패: {exc}"}
        if len(self.cache) > 5000:
            self.cache.clear()
        self.cache[k] = (now, places)
        return {"ok": True, "places": places}
