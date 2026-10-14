"""버스 배경 수집: 보는 중인 노선을 먼저 새로, 남는 차례에 학습용 노선을 번갈아.

학습용 노선은 날마다 바뀐다(BUS_LIVE_SAMPLE_ROTATE, 덕배 2026-10-14): 모든 노선을 고정된 섞인 차례로 돌며 하루 학습 몫
(BUS_LIVE_DAILY_LIMIT − BUS_LIVE_SAMPLE_RESERVE)에 맞는 수만큼. 노선 하나를 하루(05~24시, 약 75초마다) 받으면 구간 빠르기를
배우기에 충분했다(pipeline/bus_replay.mjs: 하루치로 배운 것 ≈ 이레치). 끄면(0) 예전처럼 BUS_LIVE_SAMPLE_ROUTES 만.
"""
from __future__ import annotations

import hashlib
import time
from datetime import datetime

from server.clock import KST

CALLS_PER_ROUTE_DAY = 900   # 노선 하나를 05~24시에 약 75초마다


def day_routes(route_ids, day: int, budget: int) -> list[str]:
    """그 날(날짜 순번 day)의 학습 노선: 노선 번호의 해시 차례(유형이 섞이게)로 이어서 하루 budget 호출에 맞는 수만큼."""
    order = sorted(route_ids, key=lambda rid: hashlib.sha1(rid.encode()).hexdigest())
    if not order:
        return []
    count = min(len(order), max(1, round(budget / CALLS_PER_ROUTE_DAY)))
    start = day * count % len(order)
    return [order[(start + i) % len(order)] for i in range(count)]


def sample_routes(proxy) -> list:
    config = proxy.config
    if config.sample_rotate:
        day = datetime.fromtimestamp(proxy.clock(), KST).date().toordinal()
        return day_routes(proxy.routes, day, config.daily_limit - config.sample_reserve) or [None]
    return [rid for rid in config.sample_routes if rid in proxy.routes] or [None]


def background_loop(proxy, sleep=time.sleep) -> None:
    """Watched routes first, then the learning routes in turn, forever (while the key is live)."""
    turn = 0
    while proxy.mode == "live":
        routes = sample_routes(proxy)   # 날짜가 바뀌면 새 노선들
        wait, called = proxy.background_once(routes[turn % len(routes)])
        turn += called
        sleep(wait)
