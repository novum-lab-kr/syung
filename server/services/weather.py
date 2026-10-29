"""메뉴 하늘 그림의 날씨(/api/weather): 위경도 → 기상청 격자 → 초단기실황 + 초단기예보 → 작은 응답 하나.

격자 칸마다 10분 담아 둔다(같은 칸은 기상청을 다시 안 부른다). 키가 없거나 기상청이 실패하면 {"ok": False}(오류 화면 없음) —
서버 로그에는 이유 한 줄만(키 값은 안 찍는다), 같은 이유는 10분에 한 번만.
기상청 발표 규칙(활용가이드 2610판): 실황은 매시 정시(HH00) 발표 · 10분 이후 호출, 예보는 매시 30분(HH30) 발표 · 45분 이후 호출.
"""
from __future__ import annotations

import math
import threading
import time
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from server.clock import KST
from server.config import WeatherConfig
from server.sources import kma
from server.sources.kma import KmaError

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable

    Fetch = Callable[[str, str, str, int, int], list[dict[str, Any]]]

CACHE_SECONDS = 600
FAIL_SECONDS = 60   # 실패한 칸은 잠깐만 담아 둔다(기상청을 계속 두드리지 않게)

# 하늘상태 SKY: 맑음(1) 구름많음(3) 흐림(4)
SKY = {1: "clear", 3: "cloudy", 4: "overcast"}
# 강수형태 PTY(초단기): 없음(0) 비(1) 비/눈(2) 눈(3) 소나기(4) 빗방울(5) 빗방울눈날림(6) 눈날림(7) — 소나기는 비로 그린다
PRECIP = {0: "none", 1: "rain", 2: "rain_snow", 3: "snow", 4: "rain", 5: "drizzle", 6: "sleet_drizzle", 7: "flurry"}


def to_grid(lat: float, lng: float) -> tuple[int, int]:
    """위경도 → 기상청 격자 (nx, ny) — 기상청 공식 LCC(람베르트 정각원추) 변환식(기준점 126.0E 38.0N → 43, 136 · 5 km 격자)."""
    radian = math.pi / 180
    re, grid = 6371.00877, 5.0
    slat1, slat2, olon, olat = 30 * radian, 60 * radian, 126.0 * radian, 38.0 * radian
    scale = re / grid
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(math.tan(math.pi * .25 + slat2 * .5) / math.tan(math.pi * .25 + slat1 * .5))
    sf = math.tan(math.pi * .25 + slat1 * .5) ** sn * math.cos(slat1) / sn
    ro = scale * sf / math.tan(math.pi * .25 + olat * .5) ** sn
    ra = scale * sf / math.tan(math.pi * .25 + lat * radian * .5) ** sn
    theta = lng * radian - olon
    theta = (theta + math.pi) % (2 * math.pi) - math.pi   # -π ~ π
    theta *= sn
    return math.floor(ra * math.sin(theta) + 43 + .5), math.floor(ro - ra * math.cos(theta) + 136 + .5)


def in_grid(nx: int, ny: int) -> bool:
    """기상청 격자 범위(가이드 별첨 격자표: X 1~149 · Y 1~253)."""
    return 1 <= nx <= 149 and 1 <= ny <= 253


def ncst_base(now: datetime) -> datetime:
    """호출 가능한 가장 최근 실황 발표시각(HH00, 10분 이후부터)."""
    stamp = now if now.minute >= 10 else now - timedelta(hours=1)
    return stamp.replace(minute=0, second=0, microsecond=0)


def fcst_base(now: datetime) -> datetime:
    """호출 가능한 가장 최근 예보 발표시각(HH30, 45분 이후부터)."""
    stamp = now if now.minute >= 45 else now - timedelta(hours=1)
    return stamp.replace(minute=30, second=0, microsecond=0)


def _number(raw: Any) -> float | None:
    """관측 · 예보 값: 숫자가 아니거나 ±900 이상(가이드: 결측값)이면 None."""
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return None if not math.isfinite(value) or abs(value) >= 900 else value


def _int(raw: Any, table: dict[int, str], default: str) -> str:
    value = _number(raw)
    return table.get(int(value), default) if value is not None else default


class WeatherService:
    def __init__(self, config: WeatherConfig | None = None, *, ncst: Fetch | None = None, fcst: Fetch | None = None,
                 clock: Callable[[], datetime] | None = None, monotonic: Callable[[], float] | None = None):
        self.config = config or WeatherConfig.from_env()
        self._ncst, self._fcst = ncst or kma.ultra_ncst, fcst or kma.ultra_fcst
        self._clock, self._monotonic = clock or (lambda: datetime.now(KST)), monotonic or time.monotonic
        self._cache: dict[tuple[int, int], tuple[float, dict[str, Any]]] = {}
        self._logged: dict[str, float] = {}
        self._lock = threading.Lock()

    def lookup(self, lat: float, lng: float) -> dict[str, Any] | None:
        """날씨 한 칸. 격자 밖이면 None, 받지 못하면 {"ok": False}."""
        nx, ny = to_grid(lat, lng)
        if not in_grid(nx, ny):
            return None
        now = self._monotonic()
        with self._lock:
            hit = self._cache.get((nx, ny))
            if hit and now < hit[0]:
                return hit[1]
        body = self._load(nx, ny)
        with self._lock:
            if len(self._cache) > 400:
                self._cache.clear()
            self._cache[(nx, ny)] = (now + (CACHE_SECONDS if body["ok"] else FAIL_SECONDS), body)
        return body

    def _log(self, reason: str) -> None:
        now = self._monotonic()
        if now - self._logged.get(reason, -CACHE_SECONDS) >= CACHE_SECONDS:
            self._logged[reason] = now
            print(f"weather: {reason}", flush=True)   # 키 · 주소는 찍지 않는다

    def _load(self, nx: int, ny: int) -> dict[str, Any]:
        key = self.config.kma_key
        if not key:
            self._log("KMA_SERVICE_KEY 없음 — 날씨 없이 답해요")
            return {"ok": False}
        now = self._clock()
        try:
            observed = self._call(self._ncst, key, ncst_base(now), nx, ny)
            forecast = self._call(self._fcst, key, fcst_base(now), nx, ny)
        except KmaError as exc:
            self._log(f"기상청 오류 {exc.code}")
            return {"ok": False}
        return self._build(observed[0], observed[1], forecast[0], forecast[1], nx, ny, now)

    @staticmethod
    def _call(fetch: Fetch, key: str, base: datetime, nx: int, ny: int) -> tuple[datetime, list[dict[str, Any]]]:
        """그 발표시각 자료(아직 안 만들어졌으면 한 시간 앞 발표시각 하나만 더 본다)."""
        for attempt in (base, base - timedelta(hours=1)):
            try:
                return attempt, fetch(key, attempt.strftime("%Y%m%d"), attempt.strftime("%H%M"), nx, ny)
            except KmaError as exc:
                if exc.code != kma.NO_DATA:
                    raise
        raise KmaError(kma.NO_DATA)

    @staticmethod
    def _build(observed_at: datetime, observed: list[dict[str, Any]], _forecast_at: datetime, forecast: list[dict[str, Any]],
               nx: int, ny: int, now: datetime) -> dict[str, Any]:
        live = {str(row.get("category")): row.get("obsrValue") for row in observed}
        nearest: dict[str, tuple[str, Any]] = {}   # 예보는 종류마다 가장 이른 시각의 값(지금과 가장 가깝다)
        for row in forecast:
            stamp = f"{row.get('fcstDate')}{row.get('fcstTime')}"
            category = str(row.get("category"))
            if category not in nearest or stamp < nearest[category][0]:
                nearest[category] = (stamp, row.get("fcstValue"))
        if "T1H" not in live or "SKY" not in nearest:
            return {"ok": False}
        lightning = _number(nearest.get("LGT", ("", 0))[1])
        return {
            "ok": True, "nx": nx, "ny": ny,
            "tempC": _number(live.get("T1H")),
            "sky": _int(nearest["SKY"][1], SKY, "clear"),
            "precip": _int(live.get("PTY"), PRECIP, "none"),
            "rainMm": max(0.0, _number(live.get("RN1")) or 0.0),
            "windMs": max(0.0, _number(live.get("WSD")) or 0.0),
            "lightning": bool(lightning and lightning > 0),
            "observedAt": observed_at.isoformat(),
            "updatedAt": now.isoformat(timespec="seconds"),
        }
