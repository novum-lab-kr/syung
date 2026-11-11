"""디버깅 기록 지우기(2026-11-11 사용자 D4): 켤 때와 한국 날짜가 바뀔 때마다 KEEP_DAYS 일 지난 탑승 기록 · 캡처를 지운다.

개발자 회원의 지도 기록과 디버깅 페이지 기록이 같은 자리(rides/ · shots/)라 같이 지운다. 무엇이 지워졌는지(수)만 찍는다.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import TYPE_CHECKING

from server.clock import KST

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable

    from server.services.debug import DebugService

CHECK_EVERY = 3600   # 초 — 날짜가 바뀌었는지 보는 간격


def prune_loop(debug: Callable[[], DebugService], sleep: Callable[[float], None] = time.sleep) -> None:
    done = ""
    while True:
        today = datetime.now(KST).strftime("%Y-%m-%d")
        if today != done:
            try:
                removed = debug().prune()
                done = today
                if removed["rides"] or removed["shots"]:
                    print(f"debug prune: rides {removed['rides']} · shots {removed['shots']}", flush=True)
            except OSError as e:   # 다음 시간에 다시
                print(f"debug prune failed: {type(e).__name__}", flush=True)
        sleep(CHECK_EVERY)
