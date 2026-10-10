#!/usr/bin/env python3
"""옛 버스 프록시 진입점 — 이제 새 층을 부르는 얇은 껍데기다(상태는 server/services/runtime.py 가 가진다).

python3 server/bus_live_proxy.py                 # loopback :3114 (버스만)
BUS_LIVE_MODE=mock python3 server/bus_live_proxy.py   (server/app.py 의 main_bus)
import bus_live_proxy; bus_live_proxy.snapshot(parse_qs(...)) → (body, status)   # deploy/dev_server.py
from server.bus_live_proxy import BusError, Config, QuotaLedger, iso, parse_payload   # pipeline/bus_fetch_paths.py
실제 코드: sources/seoul_bus.py · store/bus_quota.py · store/records.py · services/bus.py · routes/bus.py · jobs/bus_samples.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parent.parent)   # import bus_live_proxy(deploy/dev_server.py) 로 불러도 server 패키지를 찾게
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server.clock import KST, day_bounds, iso  # noqa: E402,F401
from server.config import ROOT, ArrivalConfig, BusConfig as Config  # noqa: E402,F401
from server.errors import MESSAGES, BusError  # noqa: E402,F401
from server.jobs import bus_samples  # noqa: E402
from server.routes import bus as bus_routes  # noqa: E402
from server.services.bus import (  # noqa: E402,F401
    AUTH_RETRY_SECONDS, AUTH_SILENT_SECONDS, AUTH_STRIKES, BusArrivalService as ArrivalProxy,
    BusLiveService as BusProxy, measurement_time, normalize_arrivals, normalize_positions)
from server.services.runtime import default_services  # noqa: E402
from server.sources.seoul_bus import fetch_arrivals, fetch_positions, http_error_code, parse_payload  # noqa: E402,F401
from server.store.bus_quota import NIGHT_WEIGHT, QuotaLedger, pacing  # noqa: E402,F401


def get_proxy() -> BusProxy:
    return default_services().bus


def get_arrivals() -> ArrivalProxy:
    return default_services().arrivals


def background_loop(proxy: BusProxy | None = None, sleep=time.sleep) -> None:
    """subway_live_proxy.py starts it: watched routes first, then the learning routes in turn, forever."""
    bus_samples.background_loop(proxy or get_proxy(), sleep)


def snapshot(query: dict) -> tuple[dict, int]:
    """Small integration surface for the existing subway HTTP handler (and deploy/dev_server.py)."""
    return bus_routes.snapshot(default_services(), query)


if __name__ == "__main__":
    from server.app import main_bus
    main_bus()
