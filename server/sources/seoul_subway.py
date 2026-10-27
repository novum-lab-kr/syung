"""서울시 실시간 지하철 API(swopenapi.seoul.go.kr): 전 노선 역 도착(ALL) · 노선별 열차 위치.

여기는 부르고 JSON 을 돌려주기만 한다. 하루 호출 수는 services/live.py 가 센다(받은 뒤에 센다 — 버스와 다르다).
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any

API_URL = "http://swopenapi.seoul.go.kr/api/subway/{}/json/realtimePosition/0/1000/{}"
# One call returns arrival rows for every station on every line (~3k rows); used as the primary
# source so any number of lines costs one upstream call per CACHE_SECONDS.
ALL_URL = "http://swopenapi.seoul.go.kr/api/subway/{}/json/realtimeStationArrival/ALL"
# 한 역의 도착 행(역 이름으로). ALL 과 같은 행 모양 — 더 빨리 바뀌는지는 jobs/station_probe.py 로 잰다
STATION_URL = "http://swopenapi.seoul.go.kr/api/subway/{}/json/realtimeStationArrival/0/60/{}"


class SeoulSubwaySource:
    def __init__(self, api_key: str):
        self._key = api_key

    def _get(self, url: str, timeout: float) -> dict[str, Any]:
        request = urllib.request.Request(url, headers={"User-Agent": "nol-meok-subway-live/1.0"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)

    def fetch_all(self) -> dict[str, Any]:
        """전 노선 역 도착 행(realtimeArrivalList) 한 번."""
        return self._get(ALL_URL.format(urllib.parse.quote(self._key, safe="")), 20)

    def fetch_station(self, name: str) -> dict[str, Any]:
        """한 역의 도착 행(realtimeArrivalList)."""
        return self._get(STATION_URL.format(urllib.parse.quote(self._key, safe=""), urllib.parse.quote(name, safe="")), 15)

    def fetch_line(self, line: str) -> dict[str, Any]:
        """한 노선의 열차 위치(realtimePositionList)."""
        return self._get(API_URL.format(urllib.parse.quote(self._key, safe=""), urllib.parse.quote(line, safe="")), 15)


def check_error(payload: dict[str, Any]) -> dict[str, Any]:
    """응답 봉투의 오류를 RuntimeError 로. 오류가 아니면 그 머리말(total 등)을 돌려준다."""
    # errors come in errorMessage, or at the top level (ERROR-337 daily limit: {"status":500,"code":...})
    error: dict[str, Any] = payload.get("errorMessage") or ({"code": payload.get("code"), "message": payload.get("message")} if payload.get("code") else {})
    if error.get("code") not in (None, "INFO-000"):
        raise RuntimeError(error.get("message") or "서울시 API 오류")
    return error
