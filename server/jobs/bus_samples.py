"""버스 배경 수집: 보는 중인 노선을 먼저 새로, 남는 차례에 학습용 노선을 번갈아.

학습용 노선은 날마다 바뀐다(BUS_LIVE_SAMPLE_ROTATE, 덕배 2026-10-14): 모든 노선을 고정된 섞인 차례로 돌며 하루 학습 몫
(BUS_LIVE_DAILY_LIMIT − BUS_LIVE_SAMPLE_RESERVE)에 맞는 수만큼. 노선 하나를 하루(05~24시, 약 75초마다) 받으면 구간 빠르기를
배우기에 충분했다(pipeline/bus_replay.mjs: 하루치로 배운 것 ≈ 이레치). 끄면(0) 예전처럼 BUS_LIVE_SAMPLE_ROUTES 만.
그 몫 가운데 한 노선은 전날 노선을 다시 받는다(행님 2026-10-22): 매일 새 노선만 받으면 전날까지 배운 노선이 그날 채점에
거의 안 걸려(trainedRoutes 0~3) 학습이 나아지는지 잴 수 없었다 — 다음 날 같은 노선으로 진짜 채점이 생긴다.
"""
from __future__ import annotations

import hashlib
import time
from datetime import datetime

from server.clock import KST

CALLS_PER_ROUTE_DAY = 900   # 노선 하나를 05~24시에 약 75초마다


def is_night_route(route: dict) -> bool:
    """심야(N · 심야A) · 새벽 노선: 학습 시간(05~24시)엔 거의 안 다녀 호출이 헛돈다(10-14 N30 · N31 · 새벽A148 0대, 덕배)."""
    name = str(route.get("name") or "")
    return name.startswith(("새벽", "심야")) or (name[:1] == "N" and name[1:2].isdigit())


def day_routes(route_ids, day: int, budget: int) -> list[str]:
    """하루 몫에서 전날 노선 하나를 재관측하고, 나머지는 해시 차례로 새로 배운다."""
    order = sorted(route_ids, key=lambda rid: hashlib.sha1(rid.encode()).hexdigest())
    if not order:
        return []
    count = min(len(order), max(1, round(budget / CALLS_PER_ROUTE_DAY)))
    # 같은 호출 몫 안에서 전날 학습 노선 하나를 다시 관측한다. 새 노선 순환은 계속한다.
    # 한 노선 몫뿐이면 이틀씩 받아 둘째 날을 채점용으로 삼는다.
    if count == 1:
        return [order[(day // 2) % len(order)]]
    fresh = count - 1
    start = day * fresh % len(order)
    selected = [order[(start + i) % len(order)] for i in range(fresh)]
    repeat = order[((day - 1) * fresh) % len(order)]
    if repeat not in selected:
        selected.append(repeat)
    else:
        # 작은 노선 집합에서 중복되어도 하루 노선 수를 유지한다.
        selected.append(next(rid for rid in order if rid not in selected))
    return selected


def sample_routes(proxy) -> list:
    config = proxy.config
    if config.sample_rotate:
        day = datetime.fromtimestamp(proxy.clock(), KST).date().toordinal()
        ids = [rid for rid, route in proxy.routes.items() if not is_night_route(route)]
        return day_routes(ids, day, config.daily_limit - config.sample_reserve) or [None]
    return [rid for rid in config.sample_routes if rid in proxy.routes] or [None]


def background_loop(proxy, sleep=time.sleep) -> None:
    """Watched routes first, then the learning routes in turn, forever (while the key is live)."""
    turn = 0
    while proxy.mode == "live":
        routes = sample_routes(proxy)   # 날짜가 바뀌면 새 노선들
        wait, called = proxy.background_once(routes[turn % len(routes)])
        turn += called
        sleep(wait)
