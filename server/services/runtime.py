"""한 프로세스의 서비스 인스턴스 주인(캐시 · 장부 · 잠금이 두 벌 생기지 않게).

처음 쓸 때 만든다: 버스만 쓰는 deploy/dev_server.py 가 다른 서비스 자료까지 읽지 않게.
진입점(app · 옛 껍데기)은 default_services() 하나를 같이 쓰고, 테스트는 Services(...) 를 따로 만들어 넣는다.
"""
from __future__ import annotations

import threading
import time

from server.config import DebugConfig
from server.services.admin import AdminService
from server.services.bus import BusArrivalService, BusLiveService
from server.services.debug import DebugService
from server.services.health import HealthService
from server.services.journey import JourneyPlanner
from server.services.live import SubwayLiveService
from server.services.members import MemberService
from server.services.owner_auth import OwnerAuth
from server.services.places import PlaceSearch
from server.store.debug_log import DebugStore
from server.store.live_samples import LiveSamples


class Services:
    def __init__(self, *, bus: BusLiveService | None = None, arrivals: BusArrivalService | None = None,
                 live: SubwayLiveService | None = None, journey: JourneyPlanner | None = None,
                 places: PlaceSearch | None = None, auth: OwnerAuth | None = None, health: HealthService | None = None,
                 debug: DebugService | None = None, members: MemberService | None = None):
        self._lock = threading.RLock()   # journey 를 만들 때 live 를 같이 꺼낸다
        self._bus, self._arrivals, self._live = bus, arrivals, live
        self._journey, self._places, self._auth, self._health, self._debug = journey, places, auth, health, debug
        self._members, self._admin = members, None
        self.started_at = time.time()   # 관리 화면 '서버 시작 시각'

    @property
    def live(self) -> SubwayLiveService:
        with self._lock:
            if self._live is None:
                self._live = SubwayLiveService()
            return self._live

    @property
    def health(self) -> HealthService:
        """이상 감지(/api/health): live 의 상태 + subway-sampler 기록(평소 기준은 jobs/health_baseline 이 만든다)."""
        with self._lock:
            if self._health is None:
                config = self.live.config
                self._health = HealthService(self.live, LiveSamples(config.samples_dir, config.health_dir))
            return self._health

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

    @property
    def debug(self) -> DebugService:
        with self._lock:
            if self._debug is None:
                self._debug = DebugService(DebugStore(DebugConfig.from_env().debug_dir), bus_routes=lambda: self.bus.routes)
            return self._debug

    @property
    def members(self) -> MemberService:
        """회원 로그인 · 출퇴근(제공자 설정이 없으면 꺼짐 — DB 파일도 열지 않는다)."""
        with self._lock:
            if self._members is None:
                self._members = MemberService()
            return self._members


    @property
    def admin(self) -> AdminService:
        """관리 화면(주인만): 회원 DB 는 members 의 것을 같이 쓰고, 서버 상태는 부를 때 각 서비스를 꺼낸다."""
        with self._lock:
            if self._admin is None:
                self._admin = AdminService(self.members.store, live=lambda: self.live, health=lambda: self.health,
                                           bus=lambda: self.bus, arrivals=lambda: self.arrivals, started_at=self.started_at)
            return self._admin


_default: Services | None = None
_default_lock = threading.Lock()


def default_services() -> Services:
    global _default
    with _default_lock:
        if _default is None:
            _default = Services()
        return _default
