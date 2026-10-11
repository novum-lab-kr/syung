"""이상 감지(/api/health)의 배경 작업 두 가지.

- baseline_loop: 켤 때와 한국 날짜가 바뀔 때마다 지난 기록으로 평소 기준을 다시 만든다(바깥 API 를 부르지 않는다).
- probe_loop: probe_every 초마다 노선 하나의 위치 피드를 읽어 전 역 도착과 견준다 — 지도를 보는 사람이 없어도 위치 피드가
  모자란 노선(7호선 2026-10-12)을 알 수 있게. 지금 도착 정보에 열차가 있는 노선 가운데 가장 오래 안 읽은 것, 10분 안에
  누군가 읽은 노선은 건너뛴다. 위치 피드 예산(position_budget) 안에서 센다 — 지도의 위치 읽기는 그만큼 느긋해진다.
"""
from __future__ import annotations

import time
from datetime import datetime

from server.clock import KST
from server.services.live import LINE_NAMES, POSITION_PARTIAL_MIN

PROBE_FRESH = 600


def baseline_loop(health, sleep=time.sleep) -> None:
    done = ""
    while True:
        today = datetime.now(KST).strftime("%Y-%m-%d")
        if today != done:
            try:
                health.refresh_baseline(pause=1.0, sleep=sleep)
                done = today
            except Exception as e:  # noqa: BLE001 — 다음 시간에 다시
                print(f"health baseline failed: {type(e).__name__}", flush=True)
        sleep(3600 if done == today else 600)


def next_probe(live, now: float) -> str | None:
    """읽을 노선: 지금 도착 정보에 POSITION_PARTIAL_MIN 대 이상인 노선 가운데 PROBE_FRESH 초 넘게 위치 피드를 안 읽은, 가장 오래된 것."""
    if not live.all_cache:
        return None
    lines = live.all_cache[1]["lines"]
    stale = [(live.last_position_read(line), line) for line in dict.fromkeys(LINE_NAMES.values())
             if len(lines.get(line, [])) >= POSITION_PARTIAL_MIN and now - live.last_position_read(line) > PROBE_FRESH]
    return min(stale)[1] if stale else None


def probe_loop(live, every: int, sleep=time.sleep) -> None:
    while True:
        sleep(every)
        try:
            if (line := next_probe(live, time.time())):
                live.probe_position(line)
        except Exception as e:  # noqa: BLE001 — 지도 요청은 계속된다
            print(f"position probe failed: {type(e).__name__}", flush=True)
