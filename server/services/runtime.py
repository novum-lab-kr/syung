"""한 프로세스의 서비스 인스턴스 주인(캐시 · 장부 · 잠금이 두 벌 생기지 않게).

처음 쓸 때 만든다: 버스만 쓰는 deploy/dev_server.py 가 다른 서비스 자료까지 읽지 않게.
진입점(app · 옛 껍데기)은 default_services() 하나를 같이 쓰고, 테스트는 Services(...) 를 따로 만들어 넣는다.
"""
from __future__ import annotations

import threading

from server.services.bus import BusArrivalService, BusLiveService
from server.services.journey import JourneyPlanner
from server.services.live import SubwayLiveService
from server.services.owner_auth import OwnerAuth
from server.services.places import PlaceSearch


class Services:
    def __init__(self, *, bus: BusLiveService | None = None, arrivals: BusArrivalService | None = None,
                 live: SubwayLiveService | None = None, journey: JourneyPlanner | None = None,
                 places: PlaceSearch | None = None, auth: OwnerAuth | None = None):
        self._lock = threading.RLock()   # journey 를 만들 때 live 를 같이 꺼낸다
        self._bus, self._arrivals, self._live = bus, arrivals, live
        self._journey, self._places, self._auth = journey, places, auth

    @property
    def live(self) -> SubwayLiveService:
        with self._lock:
            if self._live is None:
                self._live = SubwayLiveService()
            return self._live

    @property
    def bus(self) -> BusLiveService:
        with self._lock:
            if self._bus is None:
                self._bus = BusLiveService()
            return self._bus

    @property
    def arrivals(self) -> BusArrivalService:
        with self._lock:
            if self._arrivals is None:
                self._arrivals = BusArrivalService()
            return self._arrivals

    @property
    def journey(self) -> JourneyPlanner:
        """길찾기(탐색 자료는 warm() 이나 첫 길찾기 때 읽는다)."""
        with self._lock:
            if self._journey is None:
                self._journey = JourneyPlanner(live=self.live)
            return self._journey

    @property
    def places(self) -> PlaceSearch:
        with self._lock:
            if self._places is None:
                self._places = PlaceSearch()
            return self._places

    @property
    def auth(self) -> OwnerAuth:
        with self._lock:
            if self._auth is None:
                self._auth = OwnerAuth()
            return self._auth


_default: Services | None = None
_default_lock = threading.Lock()


def default_services() -> Services:
    global _default
    with _default_lock:
        if _default is None:
            _default = Services()
        return _default
