"""환경 변수 · 비밀값을 읽는 곳은 여기 하나다. 다른 server 모듈은 os.environ 을 읽지 않는다.

설정마다 dataclass 하나, from_env() 가 기본값 · 범위 자르기를 옛 코드와 똑같이 한다.
비밀값(키) 필드는 repr=False 라서 설정을 찍어도 나오지 않는다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # 저장소 루트(data/ 가 여기 아래)


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass
class SubwayConfig:
    """실시간 지하철 프록시(서울시 realtimeStationArrival/ALL · realtimePosition)."""
    host: str = "127.0.0.1"
    port: int = 3113
    api_key: str = field(default="sample", repr=False)
    cache_seconds: int = 90
    focused_cache_seconds: int = 15
    daily_limit: int = 950
    quiet_hours: str = "01:40-04:25"
    source_mode: str = "all"
    burst_lines: list = field(default_factory=list)
    burst_every: int = 7200
    burst_dir: Path = Path("/var/lib/subway-live/position")
    position_lines: int = 0
    position_seconds: int = 25
    focus_seconds: int = 15
    position_reserve: int = 200
    position_hours: str = ""
    position_budget: int = 3000
    # 역 하나 도착 자료(realtimeStationArrival/<역>)가 전 역(ALL)보다 빨리 오는지 재기(jobs/station_probe.py, 2026-10-16 덕배): 비면 끔
    station_probe: list = field(default_factory=list)
    station_probe_hours: str = "07:30-09:30"
    station_probe_seconds: int = 30
    station_probe_dir: Path = Path("/var/lib/subway-live/station-probe")
    response_seconds: float = 2.0
    quota_file: Path = Path("/var/lib/subway-live/quota.json")
    samples_dir: Path = Path("/var/lib/subway-live/samples")
    health_dir: Path = Path("/var/lib/subway-live/health-days")
    probe_every: int = 30

    @classmethod
    def from_env(cls) -> "SubwayConfig":
        cache_seconds = max(15, int(_env("SUBWAY_LIVE_CACHE_SECONDS", "90")))   # 60+ while the key had 1000 calls a day
        return cls(
            host=_env("SUBWAY_LIVE_HOST", "127.0.0.1"),
            port=int(_env("SUBWAY_LIVE_PORT", "3113")),
            api_key=_env("SEOUL_SUBWAY_API_KEY", "sample").strip() or "sample",
            cache_seconds=cache_seconds,
            focused_cache_seconds=max(5, min(cache_seconds, int(_env("SUBWAY_LIVE_FOCUSED_CACHE_SECONDS", "15")))),
            daily_limit=max(1, int(_env("SUBWAY_LIVE_DAILY_LIMIT", "950"))),   # raise it when the key's quota is raised
            # No upstream calls while no trains run (KST, "HH:MM-HH:MM", may wrap midnight; empty = always call).
            quiet_hours=_env("SUBWAY_LIVE_QUIET_HOURS", "01:40-04:25").strip(),   # no trains then: the last run till ~01:30, the first from ~04:30
            source_mode=_env("SUBWAY_LIVE_SOURCE", "all"),
            burst_lines=[l for l in _env("SUBWAY_LIVE_BURST_LINES", "2호선,5호선,6호선,7호선,9호선").split(",") if l.strip()],
            burst_every=int(_env("SUBWAY_LIVE_BURST_EVERY", "7200")),
            burst_dir=Path(_env("SUBWAY_LIVE_BURST_DIR", "/var/lib/subway-live/position")),
            position_lines=max(0, int(_env("SUBWAY_LIVE_POSITION_LINES", "0"))),
            position_seconds=max(10, int(_env("SUBWAY_LIVE_POSITION_SECONDS", "25"))),
            focus_seconds=max(5, int(_env("SUBWAY_LIVE_FOCUS_SECONDS", "15"))),
            position_reserve=max(0, int(_env("SUBWAY_LIVE_POSITION_RESERVE", "200"))),   # calls kept for the map
            # only at these KST times ("07:00-09:30,17:30-20:00"; empty = all day)
            position_hours=_env("SUBWAY_LIVE_POSITION_HOURS", "").strip(),
            # however many people look at however many lines, the overlay makes at most this many calls a day
            position_budget=max(0, int(_env("SUBWAY_LIVE_POSITION_BUDGET", "3000"))),
            station_probe=[s.strip() for s in _env("SUBWAY_LIVE_STATION_PROBE", "군자,건대입구,강남").split(",") if s.strip()],
            station_probe_hours=_env("SUBWAY_LIVE_STATION_PROBE_HOURS", "07:30-09:30").strip(),
            station_probe_seconds=max(15, int(_env("SUBWAY_LIVE_STATION_PROBE_SECONDS", "30"))),
            station_probe_dir=Path(_env("SUBWAY_LIVE_STATION_PROBE_DIR", "/var/lib/subway-live/station-probe")),
            # Identical requests within this many seconds get the same bytes
            response_seconds=max(0.0, float(_env("SUBWAY_LIVE_RESPONSE_SECONDS", "2"))),
            quota_file=Path(_env("SUBWAY_LIVE_QUOTA_FILE", "/var/lib/subway-live/quota.json")),
            # 이상 감지(/api/health): subway-sampler 기록 · 하루 요약을 두는 곳, 사람이 안 보는 노선의 위치 피드 확인 간격(0 = 끔)
            samples_dir=Path(_env("SUBWAY_LIVE_SAMPLES_DIR", "/var/lib/subway-live/samples")),
            health_dir=Path(_env("SUBWAY_LIVE_HEALTH_DIR", "/var/lib/subway-live/health-days")),
            probe_every=max(0, int(_env("SUBWAY_LIVE_PROBE_EVERY", "30"))),
        )


@dataclass
class BusConfig:
    """서울 버스 위치(getBusPosByRtid). 옛 bus_live_proxy.Config."""
    key: str = field(default="", repr=False)
    mode: str = "auto"
    cache_seconds: float = 30
    stale_seconds: float = 300
    daily_limit: int = 950
    min_interval: float = 1
    timeout: float = 8
    quota_file: Path = Path("/var/lib/subway-live/bus-quota.json")
    routes_file: Path = ROOT / "data" / "bus" / "routes.json"
    record_dir: Path | None = None   # 받은 위치를 날마다 저장할 폴더(없으면 저장 안 함)
    sample_routes: tuple = ()   # 학습용으로 알아서 부를 노선(없으면 안 부름) — sample_rotate 가 꺼졌을 때만
    sample_rotate: bool = False   # 학습 노선을 날마다 돌린다(jobs/bus_samples.py). 운영 기본은 켬(from_env)
    sample_reserve: int = 250   # 하루 호출 중 지도 보는 사람 몫으로 남길 수

    def __post_init__(self):
        if self.mode not in ("auto", "live", "mock", "disabled"):
            raise ValueError("BUS_LIVE_MODE must be auto, live, mock or disabled")
        self.key = self.key.strip()
        self.cache_seconds = max(5, self.cache_seconds)
        self.stale_seconds = max(self.cache_seconds, self.stale_seconds)
        self.daily_limit = max(1, self.daily_limit)
        self.min_interval = max(1, self.min_interval)
        self.timeout = min(30, max(1, self.timeout))

    @classmethod
    def from_env(cls):
        return cls(key=_env("SEOUL_BUS_SERVICE_KEY", ""),
                   mode=_env("BUS_LIVE_MODE", "auto"),
                   cache_seconds=float(_env("BUS_LIVE_CACHE_SECONDS", "30")),
                   stale_seconds=float(_env("BUS_LIVE_STALE_SECONDS", "300")),
                   daily_limit=int(_env("BUS_LIVE_DAILY_LIMIT", "950")),
                   min_interval=float(_env("BUS_LIVE_MIN_INTERVAL", "1")),
                   timeout=float(_env("BUS_LIVE_TIMEOUT", "8")),
                   quota_file=Path(_env("BUS_LIVE_QUOTA_FILE", "/var/lib/subway-live/bus-quota.json")),
                   routes_file=Path(_env("BUS_LIVE_ROUTES_FILE", str(ROOT / "data/bus/routes.json"))),
                   record_dir=Path(d) if (d := _env("BUS_LIVE_RECORD_DIR", "/var/lib/subway-live/bus")) else None,
                   # 472(개포동–신촌로타리) · 143(정릉–개포동): 많이 타는 간선 둘
                   sample_routes=tuple(r.strip() for r in _env("BUS_LIVE_SAMPLE_ROUTES", "100100075,100100022").split(",") if r.strip()),
                   sample_rotate=_env("BUS_LIVE_SAMPLE_ROTATE", "1") != "0",
                   sample_reserve=int(_env("BUS_LIVE_SAMPLE_RESERVE", "250")))


@dataclass
class ArrivalConfig:
    """정류장 도착 정보. 버스 위치와 같은 키를 쓰지만 한도 · 장부는 따로다(개발계정 하루 1,000번)."""
    key: str = field(default="", repr=False)
    mode: str = "auto"
    cache_seconds: float = 20   # 같은 정류장은 20초 동안 여러 사람이 함께 쓴다
    stale_seconds: float = 120   # 다시 못 받으면 2분까지는 지난 값을 '지연'으로 보여 준다
    daily_limit: int = 950
    min_interval: float = 1   # 정류장이 달라도 1초에 한 번만 부른다
    timeout: float = 8
    quota_file: Path = Path("/var/lib/subway-live/bus-arrival-quota.json")
    stops_file: Path = ROOT / "data" / "bus" / "stops.json"
    routes_file: Path = ROOT / "data" / "bus" / "routes.json"   # 예시(mock) 도착 정보에만 쓴다

    def __post_init__(self):
        if self.mode not in ("auto", "live", "mock", "disabled"):
            raise ValueError("BUS_LIVE_MODE must be auto, live, mock or disabled")
        self.key = self.key.strip()
        self.cache_seconds = max(5, self.cache_seconds)
        self.stale_seconds = max(self.cache_seconds, self.stale_seconds)
        self.daily_limit = max(1, self.daily_limit)
        self.min_interval = max(1, self.min_interval)
        self.timeout = min(30, max(1, self.timeout))

    @classmethod
    def from_env(cls):
        return cls(key=_env("SEOUL_BUS_SERVICE_KEY", ""),
                   mode=_env("BUS_LIVE_MODE", "auto"),
                   cache_seconds=float(_env("BUS_ARRIVAL_CACHE_SECONDS", "20")),
                   daily_limit=int(_env("BUS_ARRIVAL_DAILY_LIMIT", "950")),
                   timeout=float(_env("BUS_LIVE_TIMEOUT", "8")),
                   quota_file=Path(_env("BUS_ARRIVAL_QUOTA_FILE", "/var/lib/subway-live/bus-arrival-quota.json")),
                   stops_file=Path(_env("BUS_LIVE_STOPS_FILE", str(ROOT / "data/bus/stops.json"))),
                   routes_file=Path(_env("BUS_LIVE_ROUTES_FILE", str(ROOT / "data/bus/routes.json"))))


@dataclass
class BusServerConfig:
    """버스만 따로 띄울 때(python3 server/bus_live_proxy.py)의 주소."""
    host: str = "127.0.0.1"
    port: int = 3114

    @classmethod
    def from_env(cls):
        return cls(host=_env("BUS_LIVE_HOST", "127.0.0.1"), port=int(_env("BUS_LIVE_PORT", "3114")))


@dataclass
class JourneyConfig:
    """길찾기: 장소 검색(카카오) · 걷기(OSRM) · 탐색 일꾼 수."""
    kakao_key: str = field(default="", repr=False)
    osrm_url: str = "http://127.0.0.1:5000"
    workers: int = 3

    @classmethod
    def from_env(cls):
        return cls(kakao_key=_env("KAKAO_REST_KEY", "").strip(),
                   osrm_url=_env("OSRM_URL", "http://127.0.0.1:5000").rstrip("/"),
                   workers=max(0, int(_env("JOURNEY_WORKERS", "3"))))


@dataclass
class AuthConfig:
    """주인 로그인(학습 페이지). 파일은 root 만 읽는다."""
    auth_file: Path = Path("/etc/subway-live-auth.json")

    @classmethod
    def from_env(cls):
        return cls(auth_file=Path(_env("SYUNG_AUTH_FILE", "/etc/subway-live-auth.json")))


@dataclass
class DebugConfig:
    """디버깅 페이지(주인만): 탑승 기록 · 캡처를 남기는 곳(2026-10-12 덕배)."""
    debug_dir: Path = Path("/var/lib/subway-live/debug")

    @classmethod
    def from_env(cls):
        return cls(debug_dir=Path(_env("SYUNG_DEBUG_DIR", "/var/lib/subway-live/debug")))


@dataclass
class MemberConfig:
    """회원 로그인(카카오 · 구글 · Apple) · 출퇴근 설정(2026-10-26). 제공자 값이 하나도 없으면 회원 기능 전체가 꺼진다
    (화면은 /api/auth/providers 가 빈 목록이면 로그인 줄을 숨긴다 — 설정 전 배포에도 지금 화면 그대로).

    카카오: KAKAO_LOGIN=1 로 켠다(카카오 디벨로퍼스에서 카카오 로그인 · 리다이렉트 URI 를 켠 뒤). client_id 는 앱의 REST API 키라
    따로 안 주면 장소 검색의 KAKAO_REST_KEY 를 쓴다. 시크릿은 REST API 키에 기본으로 켜져 있다(KAKAO_CLIENT_SECRET).
    카카오 연결 해제 웹훅(카카오 쪽에서 연결을 끊은 회원을 지운다): KAKAO_ADMIN_KEY(앱의 대표 어드민 키 — 카카오가 Authorization 에
    실어 보낸다)가 있어야 받는다. KAKAO_APP_ID(앱 ID)를 주면 본문의 app_id 도 맞춰 본다. 로그인을 꺼도 이미 가입한 사람은 지워야 해서
    KAKAO_LOGIN 과 따로 읽는다.
    구글: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET. Apple: APPLE_CLIENT_ID(Services ID) + APPLE_CLIENT_SECRET(미리 만든 ES256 JWT, 6개월).
    """
    db_file: Path = Path("/var/lib/subway-live/members.sqlite3")
    public_url: str = "https://syung.novum-lab.com"   # 리다이렉트 URI 의 앞부분(제공자 콘솔에 등록한 것과 같아야 한다)
    kakao_client_id: str = field(default="", repr=False)
    kakao_client_secret: str = field(default="", repr=False)
    kakao_admin_key: str = field(default="", repr=False)
    kakao_app_id: str = field(default="", repr=False)
    google_client_id: str = field(default="", repr=False)
    google_client_secret: str = field(default="", repr=False)
    apple_client_id: str = field(default="", repr=False)
    apple_client_secret: str = field(default="", repr=False)

    @classmethod
    def from_env(cls) -> "MemberConfig":
        kakao_on = _env("KAKAO_LOGIN", "0").strip() == "1"
        return cls(db_file=Path(_env("SYUNG_MEMBER_DB", "/var/lib/subway-live/members.sqlite3")),
                   public_url=_env("SYUNG_PUBLIC_URL", "https://syung.novum-lab.com").strip().rstrip("/"),
                   kakao_client_id=(_env("KAKAO_LOGIN_CLIENT_ID", "") or _env("KAKAO_REST_KEY", "")).strip() if kakao_on else "",
                   kakao_client_secret=_env("KAKAO_CLIENT_SECRET", "").strip() if kakao_on else "",
                   kakao_admin_key=_env("KAKAO_ADMIN_KEY", "").strip(),
                   kakao_app_id=_env("KAKAO_APP_ID", "").strip(),
                   google_client_id=_env("GOOGLE_CLIENT_ID", "").strip(),
                   google_client_secret=_env("GOOGLE_CLIENT_SECRET", "").strip(),
                   apple_client_id=_env("APPLE_CLIENT_ID", "").strip(),
                   apple_client_secret=_env("APPLE_CLIENT_SECRET", "").strip())
