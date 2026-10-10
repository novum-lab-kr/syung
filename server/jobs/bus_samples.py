"""버스 배경 수집: 보는 중인 노선을 먼저 새로, 남는 차례에 학습용 노선(BUS_LIVE_SAMPLE_ROUTES)을 번갈아."""
from __future__ import annotations

import time


def background_loop(proxy, sleep=time.sleep) -> None:
    """Watched routes first, then the learning routes in turn, forever (while the key is live)."""
    routes = [rid for rid in proxy.config.sample_routes if rid in proxy.routes] or [None]
    turn = 0
    while proxy.mode == "live":
        wait, called = proxy.background_once(routes[turn % len(routes)])
        turn += called
        sleep(wait)
