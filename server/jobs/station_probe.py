"""역 하나 도착 자료 재기(2026-10-16 덕배): 서울 API 의 역 하나 도착(realtimeStationArrival/<역>)이 지금 쓰는 전 역(ALL)보다
덜 늦게 오는지. 정한 시간(SUBWAY_LIVE_STATION_PROBE_HOURS)에 역마다 STATION_PROBE_SECONDS 마다 한 번 받아, 그 순간 들고 있는
ALL 자료의 같은 역 행과 나란히 남긴다(station_probe_dir). 비교는 열차 · 상태가 처음 보인 때와 recptnDt 로 한다."""
from __future__ import annotations

import time
import urllib.error
from datetime import datetime, timezone

from server.clock import KST

PROBE_RESERVE = 300   # 하루 남은 호출이 이만큼 안 되면 지도 몫으로 남긴다


def in_hours(spec: str, now: datetime) -> bool:
    """"07:30-09:30,17:30-19:00"(KST) 안인가. 비면 늘."""
    if not spec:
        return True
    m = now.hour * 60 + now.minute
    for span in spec.split(","):
        try:
            a, b = ((int(x[:2]) * 60 + int(x[3:5])) for x in span.strip().split("-"))
        except ValueError:
            continue
        if a <= m < b:
            return True
    return False


def keep(rows: list[dict]) -> list[dict]:
    return [{k: r.get(k) for k in ("line", "direction", "trainNo", "code", "where", "eta", "message", "receivedAt")} for r in rows]


def probe_once(live, name: str) -> bool:
    """한 역 한 번: 받으면 기록하고 True, 못 받으면 False."""
    try:
        rows = live.fetch_station(name)   # 하루 호출 수에 센다
    except (OSError, ValueError, RuntimeError, urllib.error.URLError):
        return False
    cached = live.cached_station(name)
    live.save_station_probe({"at": datetime.now(timezone.utc).isoformat(), "station": name, "one": keep(rows),
                             "allFetchedAt": cached[0] if cached else None, "all": keep(cached[1]) if cached else None})
    return True


def station_probe_loop(live, sleep=time.sleep, now=lambda: datetime.now(KST)) -> None:
    """live: SubwayLiveService. 정한 시간에만, 역들을 고르게 나눠 돈다."""
    names, every = live.config.station_probe, live.config.station_probe_seconds
    if not names:
        return
    gap = every / len(names)
    while True:
        for name in names:
            sleep(gap)
            if live.quiet() or not in_hours(live.config.station_probe_hours, now()) or live.calls_left() < PROBE_RESERVE:
                continue
            probe_once(live, name)
