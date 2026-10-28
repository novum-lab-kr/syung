"""Position bursts: the per-line position feed stamps each train with its own event time, which the
all-stations feed does not on the Seoul Metro lines. Every BURST_EVERY seconds one of these lines
is read BURST_CALLS times, BURST_GAP apart, and saved for build_live_timing.py (dwell/approach)."""
from __future__ import annotations

import time
import urllib.error
from typing import TYPE_CHECKING

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable

    from server.services.live import SubwayLiveService

BURST_CALLS, BURST_GAP, BURST_RESERVE = 8, 45, 150


def burst_loop(live: SubwayLiveService, sleep: Callable[[float], None] = time.sleep) -> None:
    """live: SubwayLiveService. SUBWAY_LIVE_BURST_EVERY 마다 노선 하나를 돌아가며(하루 호출 수 안에서)."""
    lines, every = live.config.burst_lines, live.config.burst_every
    turn = 0
    while True:
        sleep(every)
        if live.quiet() or not lines:
            continue
        if live.calls_left() < BURST_RESERVE:   # keep the rest of the day's calls for the map
            continue
        line = lines[turn % len(lines)]
        turn += 1
        for _ in range(BURST_CALLS):
            try:
                data = live.fetch_line(line)   # counts against the daily quota; raises at the limit
            except (OSError, ValueError, RuntimeError, urllib.error.URLError):
                break
            live.save_positions(data)
            sleep(BURST_GAP)
