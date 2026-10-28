"""슝 서버 조립: 서비스 · 주소 표(routes/http.py) · 배경 작업(jobs/)을 묶어 띄운다.

python3 server/subway_live_proxy.py → main()   (subway-live.service, 127.0.0.1:3113)
python3 server/bus_live_proxy.py    → main_bus()   (버스만, 127.0.0.1:3114)
층: app → routes → services → sources · store. jobs 는 services 를 부른다. 환경 변수는 config.py 만 읽는다.
"""
from __future__ import annotations

import threading
from http.server import ThreadingHTTPServer
from typing import TYPE_CHECKING

from server.config import BusServerConfig, SubwayConfig
from server.jobs.burst import burst_loop
from server.jobs.bus_samples import background_loop
from server.jobs.station_probe import station_probe_loop
from server.jobs.health import baseline_loop, probe_loop
from server.jobs.warm_journey import warm_journey
from server.routes import bus as bus_routes
from server.routes.http import Server, make_handler
from server.services.runtime import default_services

if TYPE_CHECKING:   # 타입만
    from server.services.runtime import Services


def _bus_samples(services: Services) -> None:
    try:
        background_loop(services.bus)   # 보는 중인 버스 노선을 먼저 새로, 남는 차례에 학습용 수집
    except Exception as e:  # noqa: BLE001 — the map's bus requests still work
        print(f"bus samples stopped: {type(e).__name__}", flush=True)   # 내용은 찍지 않는다(키가 든 주소가 있을 수 있다)


def main() -> None:
    config = SubwayConfig.from_env()
    services = default_services()
    services.live.load_quota()
    threading.Thread(target=warm_journey, args=(services,), daemon=True).start()   # 길찾기 미리 준비(배경)
    if config.burst_every > 0:
        threading.Thread(target=burst_loop, args=(services.live,), daemon=True).start()
    threading.Thread(target=_bus_samples, args=(services,), daemon=True).start()
    threading.Thread(target=baseline_loop, args=(services.health,), daemon=True).start()   # 이상 감지: 평소 기준
    if config.probe_every > 0:
        threading.Thread(target=probe_loop, args=(services.live, config.probe_every), daemon=True).start()   # 이상 감지: 위치 피드 확인
    if config.station_probe:
        threading.Thread(target=station_probe_loop, args=(services.live,), daemon=True).start()   # 역 하나 도착 자료가 전 역보다 빠른지 재기
    Server((config.host, config.port), make_handler(services, config.response_seconds)).serve_forever()


def main_bus() -> None:
    services = default_services()
    services.bus  # noqa: B018 — 띄울 때 노선 자료를 읽어 둔다(옛 코드와 같게 · 속성을 읽는 것이 일)
    config = BusServerConfig.from_env()
    ThreadingHTTPServer((config.host, config.port), bus_routes.make_handler(services)).serve_forever()
