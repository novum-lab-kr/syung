"""이상 감지(/api/health)의 배경 작업 두 가지.

- baseline_loop: 켤 때와 한국 날짜가 바뀔 때마다 지난 기록으로 평소 기준을 다시 만든다(바깥 API 를 부르지 않는다).
- probe_loop: 노선을 돌아가며 위치 피드를 읽는다(2026-10-16 덕배: 학습용 읽기와 지도용 읽기를 한 줄로). 읽은 것은 전 역 도착과
  견주고(지도를 보는 사람이 없어도 위치 피드가 모자란 노선 — 7호선 2026-10-12), 학습 기록에 남고, 지도의 위치 캐시에도 들어가
  그 노선을 보는 사람에게 그대로 간다. 지금 도착 정보에 열차가 있는 노선 가운데 가장 오래 안 읽은 것, PROBE_FRESH 초 안에
  누군가 읽은 노선은 건너뛴다. 고른 노선은 BLOCK_READS 번 이어 읽는다(이어진 자료라야 학습에 쓴다, 2026-10-18). 간격은 probe_every 초에서 위치 피드 예산의 남은 몫 절반으로 자정까지 가게 늘인다(probe_interval) —
  나머지 절반은 사람이 보는 노선 몫.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import TYPE_CHECKING

from server.clock import KST
from server.services.live import LINE_NAMES, POSITION_PARTIAL_MIN

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable

    from server.services.health import HealthService
    from server.services.live import SubwayLiveService

PROBE_FRESH = 300
BLOCK_READS = 20   # 한 노선을 이어 읽는 횟수(30초 간격이면 약 10분)
# 고정 채점 창: 탑승 확인이 있는 7호선 · 서울교통공사 대표 2호선 · 다른 운영사(급행) 9호선, 출근 · 평시 · 퇴근 30분씩(하루 약 540번)
EVAL_LINES = ("7호선", "2호선", "9호선")
EVAL_WINDOWS = ((8 * 60, 8 * 60 + 30), (13 * 60, 13 * 60 + 30), (18 * 60, 18 * 60 + 30))   # KST 분 [시작, 끝)


def baseline_loop(health: HealthService, sleep: Callable[[float], None] = time.sleep) -> None:
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


def next_probe(live: SubwayLiveService, now: float) -> str | None:
    """읽을 노선: 지금 도착 정보에 POSITION_PARTIAL_MIN 대 이상인 노선 가운데 PROBE_FRESH 초 넘게 위치 피드를 안 읽은, 가장 오래된 것."""
    if not live.all_cache:
        return None
    lines = live.all_cache[1]["lines"]
    stale = [(live.last_position_read(line), line) for line in dict.fromkeys(LINE_NAMES.values())
             if len(lines.get(line, [])) >= POSITION_PARTIAL_MIN and now - live.last_position_read(line) > PROBE_FRESH]
    return min(stale)[1] if stale else None


def in_eval(t: datetime) -> bool:
    """고정 채점 창(KST)인가."""
    m = t.hour * 60 + t.minute
    return any(a <= m < b for a, b in EVAL_WINDOWS)


def probe_loop(live: SubwayLiveService, every: int, sleep: Callable[[float], None] = time.sleep, clock: Callable[[], float] = time.time,
               kst_now: Callable[[], datetime] = lambda: datetime.now(KST)) -> None:
    """한 노선을 BLOCK_READS 번 이어 읽고(간격 probe_interval) 다음 노선으로. 노선마다 한 번씩 띄엄띄엄(약 7분에 한 번) 읽으면
    열차의 다음 사건을 놓쳐 학습 · 채점에 못 쓴다(2026-10-18 덕배: 학습 오차가 커 보였다) — 같은 호출 수로 이어진 자료를 만든다.
    고정 채점 창(EVAL_WINDOWS)에는 EVAL_LINES 를 every 초마다 모두 읽는다: 날마다 같은 노선 · 같은 시간의 화면 재현 점수
    (pipeline/replay_score.mjs)가 오픈 판단 숫자다(2026-10-19 덕배 · Codex 상의)."""
    line, left = None, 0
    while True:
        evaluating = in_eval(kst_now())
        sleep(every if evaluating else live.probe_interval(every))
        try:
            if evaluating:
                for name in EVAL_LINES:
                    live.probe_position(name)
                continue
            if not left:
                line, left = next_probe(live, clock()), BLOCK_READS
            if line and live.probe_position(line):
                left -= 1
            else:
                left = 0   # 읽을 노선이 없거나 못 읽었으면(예산 · 한도 · 조용한 시간) 다음에 다시 고른다
        except Exception as e:  # noqa: BLE001 — 지도 요청은 계속된다
            left = 0
            print(f"position probe failed: {type(e).__name__}", flush=True)
