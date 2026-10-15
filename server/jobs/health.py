"""이상 감지(/api/health)의 배경 작업 두 가지.

- baseline_loop: 켤 때와 한국 날짜가 바뀔 때마다 지난 기록으로 평소 기준을 다시 만든다(바깥 API 를 부르지 않는다).
- probe_loop: 노선을 돌아가며 위치 피드를 읽는다(2026-10-16 덕배: 학습용 읽기와 지도용 읽기를 한 줄로). 읽은 것은 전 역 도착과
  견주고(지도를 보는 사람이 없어도 위치 피드가 모자란 노선 — 7호선 2026-10-12), 학습 기록에 남고, 지도의 위치 캐시에도 들어가
  그 노선을 보는 사람에게 그대로 간다. 지금 도착 정보에 열차가 있는 노선 가운데 가장 오래 안 읽은 것, PROBE_FRESH 초 안에
  누군가 읽은 노선은 건너뛴다. 간격은 probe_every 초에서 위치 피드 예산의 남은 몫 절반으로 자정까지 가게 늘인다(probe_interval) —
  나머지 절반은 사람이 보는 노선 몫.
"""
from __future__ import annotations

import time
from datetime import datetime

from server.clock import KST
from server.services.live import LINE_NAMES, POSITION_PARTIAL_MIN

PROBE_FRESH = 300


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
        sleep(live.probe_interval(every))
        try:
            if (line := next_probe(live, time.time())):
                live.probe_position(line)
        except Exception as e:  # noqa: BLE001 — 지도 요청은 계속된다
            print(f"position probe failed: {type(e).__name__}", flush=True)
