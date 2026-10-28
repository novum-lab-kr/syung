"""Demand-driven Seoul bus positions, with a separate durable daily quota.

BUS_LIVE_MODE=mock: 예시 버스(정적 노선을 따라 오가는 한 대). No key means unavailable, never an implicit simulation.
정류장 도착 정보(BusArrivalService)는 같은 키를 쓰지만 하루 한도를 따로 받아서 장부도 따로 쓴다(BUS_ARRIVAL_*).
Background polling (jobs/bus_samples.py), one call per turn of the shared gate: first the routes someone
is watching (asked in the last WATCH_SECONDS) whose cache is stale, so a watched route is fresh before the
map asks again; only when none is due, the learning routes (rotated daily, jobs/bus_samples.py) in turn, 05:00–24:00
KST, spread so they never use the last BUS_LIVE_SAMPLE_RESERVE calls of the day (the map's). On
2026-10-06 the map made 2 calls of 950, too few to learn from; 2026-10-07 the watchers came first
instead of the collection pausing while anyone watched (행님 · 덕배: 정확도가 먼저).
Every successful upstream answer is also appended to <BUS_LIVE_RECORD_DIR>/YYYYMMDD.jsonl (KST day,
default /var/lib/subway-live/bus; empty disables) for learning bus timing later (store/records.py).
"""
from __future__ import annotations

import math
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, cast

from server.clock import KST, day_bounds, iso
from server.config import ArrivalConfig, BusConfig
from server.errors import MESSAGES, BusError
from server.sources.seoul_bus import fetch_arrivals, fetch_positions
from server.store.bus_catalog import file_stamp, read_route_list, read_routes, read_stops
from server.store.bus_quota import QuotaLedger
from server.store.records import record_bus

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable

    Row = dict[str, Any]   # 바깥 API · 응답의 JSON 한 줄

# 도착정보의 routeType → 지도 버스 종류. 우리 노선 자료에 없는 노선(공항버스 등)의 이름표에만 쓴다
ARRIVAL_ROUTE_TYPES = {"1": "airport", "2": "village", "3": "trunk", "4": "branch", "5": "circular", "6": "express"}
# 서울시 서버는 같은 키 · 같은 요청에 401 을 섞어 돌려준다(2026-10-07 운영 서버에서 8번 중 3번, 6번 중 4번).
# 401 은 5초 뒤 다시 묻고, 연속 AUTH_STRIKES 번이면서 AUTH_SILENT_SECONDS 동안 한 번도 못 받았을 때만
# 진짜 인증 문제로 보고 5분 쉰다(키가 막혔다면 성공이 아예 없다)
AUTH_RETRY_SECONDS, AUTH_STRIKES, AUTH_SILENT_SECONDS = 5, 5, 600
FRESH_SECONDS = 5   # 정류장 팝업의 새로고침이 서울시에 새로 묻는 최소 간격
SAMPLE_HOURS = (5 * 60, 24 * 60)   # KST 분: 버스가 다니는 동안만 모은다
WATCH_SECONDS = 90   # 지도가 이 안에 물은 노선은 '보는 중': 수집보다 먼저 새로 받아 둔다


def note_failure(proxy: BusLiveService | BusArrivalService, key: str, code: str, retry: float) -> None:
    """실패 기록. proxy.lock 안에서 부른다. 한도 초과는 바로, 401 은 연속일 때만 전체를 쉰다."""
    now = proxy.clock()
    if code == "upstream_auth":
        proxy.auth_strikes += 1
        if proxy.auth_strikes < AUTH_STRIKES or now - proxy.last_ok < AUTH_SILENT_SECONDS:
            proxy.failures[key] = (now + AUTH_RETRY_SECONDS, code)
            return
    proxy.failures[key] = (now + retry, code)
    if code in ("upstream_auth", "upstream_quota"):
        proxy.backoff_until = now + 300


def retry_reserve(proxy: BusLiveService | BusArrivalService, key: str) -> bool:
    """방금 부른 게 섞여 온 401 이면 바로 한 번 더 부를 자리를 잡는다(장부에 센다).
    사람이 누른 그 응답에서 바로 보이게: 안 그러면 지도가 다시 물을 때(15초)까지 비어 있다."""
    with proxy.lock:
        failure = proxy.failures.get(key)
        if not failure or failure[1] != "upstream_auth" or proxy.backoff_until > proxy.clock() or key in proxy.pending:
            return False
        try:
            allowed, _, _ = proxy.ledger.reserve(proxy.clock(), paced=False)
        except BusError:
            return False
        if allowed:
            if isinstance(proxy.pending, dict):
                proxy.pending[key] = threading.Event()
            else:
                proxy.pending.add(key)
        return allowed


def number(value: Any) -> float | None:   # JSON 값을 float() 에 그대로 넘긴다(못 바꾸면 None)
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


def measurement_time(value: object) -> str | None:
    text = str(value or "").strip()
    try:
        if re.fullmatch(r"\d{14}", text):
            dt = datetime.strptime(text, "%Y%m%d%H%M%S").replace(tzinfo=KST)
        else:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=KST)
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        return None


def normalize_positions(items: list[Row], route_id: str) -> list[Row]:
    vehicles: dict[str, Row] = {}
    for row in items:
        vid = str(row.get("vehId") or "").strip()
        lng, lat = number(row.get("gpsX")), number(row.get("gpsY"))
        # posX/posY are projected GRS80 metres, NEVER longitude/latitude.
        if (not re.fullmatch(r"\d{1,20}", vid) or lng is None or lat is None
                or not 124 < lng < 132 or not 33 < lat < 40
                or str(row.get("isrunyn", "")).upper() in ("0", "N")):
            continue
        if row.get("routeId") and str(row["routeId"]) != route_id:
            continue
        seq = number(row.get("sectOrd"))
        bus: Row = {"id": f"{route_id}:{vid}", "vehicleId": vid, "routeId": route_id,
               "lng": round(lng, 6), "lat": round(lat, 6), "heading": None, "speedKph": None,
               "stopSequence": int(seq) if seq is not None and seq >= 1 and seq.is_integer() else None,
               "atStop": str(row.get("stopFlag", "0")) == "1",
               "lastBus": str(row.get("islastyn", "0")).upper() in ("1", "Y"),
               "receivedAt": measurement_time(row.get("dataTm")), "mock": False}
        previous = vehicles.get(vid)
        if not previous or (bus["receivedAt"] or "") >= (previous["receivedAt"] or ""):
            vehicles[vid] = bus
    return sorted(vehicles.values(), key=lambda bus: bus["id"])


def normalize_arrivals(items: list[Row]) -> list[Row]:
    """노선마다 다가오는 버스 두 대의 안내 문구 · 남은 초 · 막차 여부. 차량 번호는 내보내지 않는다."""
    rows: dict[str, Row] = {}
    for item in items:
        rid, name = str(item.get("busRouteId") or "").strip(), str(item.get("rtNm") or "").strip()
        if not re.fullmatch(r"\d{9}", rid) or not name or rid in rows:
            continue
        buses: list[Row] = []
        for n in ("1", "2"):
            message = str(item.get(f"arrmsg{n}") or "").strip()
            if not message:
                continue
            seconds = number(item.get(f"traTime{n}"))
            buses.append({"message": message[:40], "seconds": int(seconds) if seconds is not None and seconds >= 0 else None,
                          "last": str(item.get(f"isLast{n}", "0")).upper() in ("1", "Y")})
        rows[rid] = {"routeId": rid, "name": name[:20], "type": ARRIVAL_ROUTE_TYPES.get(str(item.get("routeType")), "other"),
                     "direction": str(item.get("adirection") or "").strip()[:30] or None, "buses": buses}
    return list(rows.values())


def error_entry(route_id: str | None, code: str) -> Row:
    return {"routeId": route_id, "code": code, "message": MESSAGES[code]}


def status_entry(status: str, stamp: float | None, now: float, buses: list[Row], retry: float) -> Row:
    return {"status": status, "fetchedAt": iso(stamp) if stamp is not None else None,
            "ageSeconds": max(0, round(now - stamp, 1)) if stamp is not None else None,
            "busCount": len(buses), "retryAfterSeconds": retry}


class BusLiveService:
    """노선별 버스 위치. 지도가 묻는 노선을 하루 장부 안에서 골고루 새로 받는다. 옛 이름 BusProxy."""
    def __init__(self, config: BusConfig | None = None, *, routes: dict[str, Any] | None = None,
                 fetch: Callable[[str, BusConfig], list[Row]] | None = None, clock: Callable[[], float] | None = None):
        self.config = config or BusConfig.from_env()
        self.clock, self.fetch = clock or time.time, fetch or fetch_positions
        self.ledger = QuotaLedger(self.config)
        self.data_error = False
        if routes is None:
            try:
                routes = read_routes(self.config.routes_file)
            except (OSError, ValueError, KeyError, TypeError):
                self.data_error, routes = True, {}
        self.routes = routes
        self.cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
        self.failures: dict[str, tuple[float, str]] = {}
        self.pending: set[str] = set()
        self.lock = threading.Lock()
        self.backoff_until: float = 0
        self.auth_strikes = 0   # 연속 401 수
        self.last_ok = self.clock()   # 마지막으로 받은 때(띄운 때부터 센다)
        self.next_at: float = 0
        self.last_block = "paced"
        self.watched: dict[str, float] = {}   # 노선 → 지도가 마지막으로 물은 때
        self.sample_at: float = 0   # 다음 수집 호출을 해도 되는 때

    @property
    def mode(self) -> str:
        if self.config.mode == "mock":
            return "mock"
        return "live" if self.config.key and self.config.mode != "disabled" else "unavailable"

    def catalog_error(self, now: float) -> Row:
        """정적 노선 자료를 못 읽었을 때의 응답 본문."""
        return self._body([], now, errors=[error_entry(None, "data_unavailable")])

    def snapshot(self, ids: list[str], focus: str, now: float) -> Row:
        """검사를 마친 노선들(routes/bus.py)의 버스 · 노선별 상태. 필요하면 한 노선을 새로 받는다.
        now: 요청을 받은 때(routes 가 검사 전에 잡는다)."""
        with self.lock:
            for rid in ids:
                self.watched[rid] = now
        if self.mode == "unavailable":
            code = "disabled" if self.config.mode == "disabled" else "missing_key"
            statuses = {rid: status_entry("unavailable", None, now, [], 60) for rid in ids}
            return self._body(ids, now, statuses=statuses, errors=[error_entry(None, code)])
        if self.mode == "mock":
            buses = [bus for rid in ids for bus in self._mock(rid, now)]
            statuses = {rid: status_entry("mock", now, now, [b for b in buses if b["routeId"] == rid], 15)
                        for rid in ids}
            return self._body(ids, now, buses=buses, statuses=statuses)

        chosen: str | None = None
        storage_error: str | None = None
        with self.lock:
            due = [rid for rid in ids if rid not in self.pending
                   and now - self.cache.get(rid, (-math.inf, []))[0] >= self.config.cache_seconds
                   and now >= self.failures.get(rid, (0, ""))[0]]
            # Unknown/oldest first prevents the first visible route starving its neighbours.
            due.sort(key=lambda rid: (0 if rid == focus else 1, self.cache.get(rid, (-math.inf, []))[0], ids.index(rid)))
            if due and now >= self.backoff_until:
                # 사람이 방금 고른 노선(focus)을 처음(또는 오래 안 받다가) 물으면 하루치를 나눠 쓰는 간격을 기다리지 않는다:
                # 기다리면 지도가 다시 물을 때(15초, 밤엔 40초 넘게)까지 버스가 0대였다(2026-10-08 덕배). 하루 상한은 그대로
                cold = due[0] == focus and now - self.cache.get(focus, (-math.inf, []))[0] > self.config.stale_seconds
                try:
                    allowed, self.last_block, self.next_at = self.ledger.reserve(now, paced=not cold)
                    if allowed:
                        chosen = due[0]
                        self.pending.add(chosen)
                except BusError as error:
                    storage_error = error.code
        if chosen and not self._fetch(chosen) and retry_reserve(self, chosen):
            self._fetch(chosen)
        now = self.clock()
        buses, statuses, errors = cast("list[Row]", []), cast("dict[str, Row]", {}), cast("list[Row]", [])
        with self.lock:
            for rid in ids:
                stamp, cached = self.cache.get(rid, cast("tuple[None, list[Row]]", (None, [])))
                age = now - stamp if stamp is not None else None
                failure = self.failures.get(rid)
                retry = max(self.next_at, self.backoff_until, failure[0] if failure else 0)
                if stamp is not None and age is not None and age < self.config.cache_seconds:   # age 는 stamp 가 있을 때만 있다
                    status = "fresh" if rid == chosen else "cached"
                    retry = max(retry, stamp + self.config.cache_seconds)
                elif stamp is not None:
                    status = "stale"
                else:
                    status = "error" if failure or storage_error else "deferred"
                reason = storage_error or (failure[1] if failure else "in_flight" if rid in self.pending
                                          else "backoff" if now < self.backoff_until else self.last_block or "paced")
                # Keep recent stale observations for display, but never resurrect old buses.
                visible = cached if stamp is not None and age is not None and age <= self.config.stale_seconds else []
                buses.extend(visible)
                statuses[rid] = status_entry(status, stamp, now, visible, max(1, math.ceil(retry - now)))
                if status in ("stale", "deferred", "error"):
                    statuses[rid]["reason"] = reason
                if failure:
                    errors.append(error_entry(rid, failure[1]))
        if storage_error:
            errors.append(error_entry(None, storage_error))
        return self._body(ids, now, buses=buses, statuses=statuses, errors=errors)

    def _fetch(self, rid: str) -> bool:
        """One reserved upstream call (rid already in pending): cache, record, or note the failure."""
        try:
            items = self.fetch(rid, self.config)
            buses = normalize_positions(items, rid)
            record_bus(items, rid, self.clock(), self.config.record_dir)
            with self.lock:
                self.cache[rid] = (self.clock(), buses)
                self.failures.pop(rid, None)
                self.auth_strikes, self.last_ok = 0, self.clock()
            return True
        except Exception as error:
            # Never expose urllib exceptions: they may contain a key-bearing URL.
            code = error.code if isinstance(error, BusError) else "upstream_error"
            with self.lock:
                note_failure(self, rid, code, 60)
            return False
        finally:
            with self.lock:
                self.pending.discard(rid)

    def _watched_due(self, now: float) -> list[str]:
        """보는 중인 노선 중 캐시가 지난 것, 가장 오래된 것부터."""
        with self.lock:
            for rid, at in list(self.watched.items()):
                if now - at >= WATCH_SECONDS:
                    del self.watched[rid]
            return [rid for _, rid in sorted(
                (self.cache.get(rid, (-math.inf, []))[0], rid) for rid in self.watched
                if rid not in self.pending and now - self.cache.get(rid, (-math.inf, []))[0] >= self.config.cache_seconds
                and now >= self.failures.get(rid, (0, ""))[0])]

    def background_once(self, sample_rid: str) -> tuple[float, bool]:
        """One background turn: (seconds to wait, whether the learning route sample_rid had its turn).
        A route someone watches comes first at any hour; the learning call only when none is due."""
        now, config = self.clock(), self.config
        if self.mode != "live":
            return 3600, False
        if now < self.backoff_until:
            return self.backoff_until - now, False
        due = self._watched_due(now)
        if due:
            try:
                allowed, _, next_at = self.ledger.reserve(now)
            except BusError:
                return 60, False
            if not allowed:
                return max(0.5, min(5, next_at - now)), False
            with self.lock:
                self.pending.add(due[0])
            self._fetch(due[0])
            return 0.5, False
        local = datetime.fromtimestamp(now, KST)
        minute = local.hour * 60 + local.minute
        if sample_rid not in self.routes or not SAMPLE_HOURS[0] <= minute < SAMPLE_HOURS[1]:
            return 5, False   # 밤에도 보는 중인 노선은 5초마다 살핀다
        if now < self.sample_at:
            return max(0.5, min(1, self.sample_at - now)), False   # 그 사이 보는 노선이 생기면 먼저
        if now - self.cache.get(sample_rid, (-math.inf, []))[0] < config.cache_seconds:
            # 누가 보고 있어 방금 받은 노선(그 응답도 기록돼 학습에 쓰인다): 또 부르면 호출만 쓰고 캐시 시각이 흔들려
            # 그 노선을 보는 지도의 새 자리가 늦게 왔다(2026-10-11 143번, 76초마다 14초 만에 또 불러 다음 갱신이 44초 뒤로). 다음 노선 차례로
            return 0.5, True
        try:
            left = config.daily_limit - config.sample_reserve - self.ledger.view(now)["used"]
            if left <= 0:
                return 5, False
            allowed, _, next_at = self.ledger.reserve(now, reserve_calls=config.sample_reserve)
        except BusError:
            return 60, False
        if not allowed:
            return max(0.5, min(5, next_at - now)), False
        with self.lock:
            self.pending.add(sample_rid)
        self._fetch(sample_rid)
        # 남은 수집 몫을 오늘 모으는 시간 끝까지 고르게
        end = local.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=SAMPLE_HOURS[1])
        self.sample_at = now + max(config.min_interval, (end.timestamp() - now) / left)
        return 0.5, True

    def _body(self, ids: list[str], now: float, *, buses: list[Row] | None = None, statuses: dict[str, Row] | None = None,
              errors: list[Row] | None = None) -> Row:
        errors, buses, statuses = list(errors or []), buses or [], statuses or {}
        try:
            quota = self.ledger.view(now)
        except BusError:
            quota = {"day": day_bounds(now)[0], "used": None, "limit": self.config.daily_limit, "remaining": None}
            if not any(error["code"] == "quota_storage" for error in errors):
                errors.append(error_entry(None, "quota_storage"))
        ready = all(statuses.get(rid, {}).get("status") in ("fresh", "cached", "mock") for rid in ids)
        return {"schemaVersion": 1, "ok": ready and not errors, "mode": self.mode,
                "fetchedAt": iso(now), "pollAfterSeconds": 15 if self.mode == "mock" or not ready else 30,   # 못 받은 노선은 15초 뒤 다시
                "busCount": len(buses), "buses": buses, "routes": statuses, "quota": quota, "errors": errors}

    def _mock(self, rid: str, now: float) -> list[Row]:
        path = self.routes[rid].get("path", [])
        if len(path) < 2:
            return []
        # Ping-pong, not a synthetic final→first segment across an open path.
        duration = (len(path) - 1) * 25
        phase = (now + int(rid[-3:])) % (2 * duration)
        step = min(phase, 2 * duration - phase) / 25
        index = min(len(path) - 2, int(step))
        fraction = step - index
        a, b = path[index:index + 2]
        lng, lat = (a[k] + (b[k] - a[k]) * fraction for k in (0, 1))
        return [{"id": f"mock:{rid}:1", "vehicleId": f"mock:{rid}:1", "routeId": rid,
                 "lng": round(lng, 6), "lat": round(lat, 6), "heading": None, "speedKph": None,
                 "stopSequence": None, "atStop": False, "lastBus": False,
                 "receivedAt": iso(now), "mock": True}]


class BusArrivalService:
    """정류장을 누른 사람이 있을 때만 그 정류장 하나를 부른다(정류장 하나 = 호출 1번). 옛 이름 ArrivalProxy."""
    def __init__(self, config: ArrivalConfig | None = None, *, stops: dict[str, Any] | None = None,
                 fetch: Callable[[str, ArrivalConfig], list[Row]] | None = None, clock: Callable[[], float] | None = None):
        self.config = config or ArrivalConfig.from_env()
        self.clock, self.fetch = clock or time.time, fetch or fetch_arrivals
        self.ledger = QuotaLedger(self.config)
        self.data_error = False
        self.stops_stamp: tuple[int, int] | None = None   # 파일에서 읽었으면 그 파일의 (수정 시각, 크기): 배포로 바뀌면 다시 읽는다
        self.stops = stops or {}   # arsId → 정류장
        if stops is None:
            self._load_stops()
        self.cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}   # arsId → (받은 때, 줄)
        self.failures: dict[str, tuple[float, str]] = {}   # arsId → (다시 물어도 되는 때, 코드)
        self.pending: dict[str, threading.Event] = {}   # arsId → Event: 같은 정류장을 동시에 물으면 한 번만 부르고 함께 기다린다
        self.lock = threading.Lock()
        self.next_at: float = 0
        self.backoff_until: float = 0
        self.auth_strikes = 0   # 연속 401 수
        self.last_ok = self.clock()   # 마지막으로 받은 때(띄운 때부터 센다)
        self.mock_routes: list[Any] | None = None

    @property
    def mode(self) -> str:
        if self.config.mode == "mock":
            return "mock"
        return "live" if self.config.key and self.config.mode != "disabled" else "unavailable"

    def _load_stops(self) -> None:
        try:
            stamp = file_stamp(self.config.stops_file)
            if stamp == self.stops_stamp:
                return
            self.stops = read_stops(self.config.stops_file)
            self.stops_stamp, self.data_error = stamp, False
        except (OSError, ValueError, KeyError, TypeError):
            # 읽던 목록이 있으면 그대로 쓴다(배포 중 반쯤 쓴 파일 등). 처음부터 못 읽었을 때만 오류
            self.data_error = not self.stops

    def refresh_stops(self) -> None:
        """파일에서 읽은 목록이면 바뀌었는지 보고 다시 읽는다(요청마다 routes 가 먼저 부른다)."""
        if self.stops_stamp is not None or self.data_error:
            self._load_stops()

    def catalog_error(self, now: float) -> Row:
        return self._body("", now, "error", None, [], [error_entry(None, "data_unavailable")])

    def snapshot(self, stop: str, now: float, fresh: bool = False) -> Row:
        """검사를 마친 정류장(routes/bus.py) 하나의 도착 정보. now: 요청을 받은 때, fresh: 팝업의 새로고침."""
        # 새로고침(fresh=1): 받은 지 FRESH_SECONDS 가 지났으면 새로 묻는다. 연타로 하루 한도를 쓰지 않게 그보다 짧으면 받아 둔 것
        window = min(self.config.cache_seconds, FRESH_SECONDS) if fresh else self.config.cache_seconds
        if self.mode == "unavailable":
            code = "disabled" if self.config.mode == "disabled" else "missing_key"
            return self._body(stop, now, "unavailable", None, [], [error_entry(None, code)])
        if self.mode == "mock":
            return self._body(stop, now, "mock", now, self._mock(stop, now), [])

        call, waiting, block = False, cast("threading.Event | None", None), ""
        with self.lock:
            stamp = self.cache.get(stop, cast("tuple[None, list[Row]]", (None, [])))[0]
            if stamp is None or now - stamp >= window:
                waiting = self.pending.get(stop)
                failure = self.failures.get(stop, (0, ""))
                if waiting:
                    pass
                elif now < failure[0]:
                    block = failure[1]
                elif now < self.backoff_until:
                    block = "backoff"
                elif now < self.next_at:
                    block = "paced"
                else:
                    try:
                        # 누른 만큼만 부르니 하루치를 나눠 쓰는 간격은 두지 않는다. 하루 상한은 그대로 지킨다
                        allowed, reason, _ = self.ledger.reserve(now, paced=False)
                    except BusError as error:
                        allowed, reason = False, error.code
                    if allowed:
                        call, self.next_at = True, now + self.config.min_interval
                        waiting = self.pending[stop] = threading.Event()
                    else:
                        block = reason
        if call:
            self._fetch(stop, cast("threading.Event", waiting))   # 부르기로 했으면 위에서 Event 를 만들었다
            if retry_reserve(self, stop):
                self._fetch(stop, self.pending[stop])
        elif waiting:
            waiting.wait(self.config.timeout + 1)
        now = self.clock()
        with self.lock:
            stamp, rows = self.cache.get(stop, cast("tuple[None, list[Row]]", (None, [])))
            failure = self.failures.get(stop)
        age = now - stamp if stamp is not None else None
        if age is not None and age < self.config.cache_seconds:
            status = "fresh" if call else "cached"
        elif age is not None and age <= self.config.stale_seconds:
            status = "stale"
        else:
            status, rows = "error", []
        code = (failure[1] if failure else block) if status in ("stale", "error") else ""
        if status == "error" and not code:
            code = "in_flight" if waiting else "upstream_error"
        return self._body(stop, now, status, stamp, rows, [error_entry(None, code)] if code else [])

    def _fetch(self, stop: str, done: threading.Event) -> None:
        try:
            rows = normalize_arrivals(self.fetch(stop, self.config))
            with self.lock:
                self.cache[stop] = (self.clock(), rows)
                self.failures.pop(stop, None)
                self.auth_strikes, self.last_ok = 0, self.clock()
                if len(self.cache) > 5000:   # 정류장 8천여 곳: 오래된 것부터 버린다
                    for old in sorted(self.cache, key=lambda k: self.cache[k][0])[:1000]:
                        del self.cache[old]
        except Exception as error:
            # urllib 예외에는 키가 든 주소가 있을 수 있다: 코드만 남긴다
            code = error.code if isinstance(error, BusError) else "upstream_error"
            with self.lock:
                note_failure(self, stop, code, 30)
        finally:
            with self.lock:
                self.pending.pop(stop, None)
            done.set()

    def _mock(self, stop: str, now: float) -> list[Row]:
        if self.mock_routes is None:
            try:
                self.mock_routes = read_route_list(self.config.routes_file)
            except (OSError, ValueError, KeyError, TypeError):
                self.mock_routes = []
        sid, rows = self.stops[stop].get("id"), cast("list[Row]", [])
        for i, route in enumerate(r for r in self.mock_routes if sid in r.get("stopIds", [])):
            wait = int((now / 7 + i * 97) % 900)
            rows.append({"routeId": route["id"], "name": route["name"], "type": route.get("type", "other"), "direction": None,
                         "buses": [{"message": f"{wait // 60}분후[예시]", "seconds": wait, "last": False}]})
        return rows

    def _body(self, stop: str, now: float, status: str, stamp: float | None, rows: list[Row], errors: list[Row]) -> Row:
        try:
            quota = self.ledger.view(now)
        except BusError:
            quota = {"day": day_bounds(now)[0], "used": None, "limit": self.config.daily_limit, "remaining": None}
        return {"schemaVersion": 1, "ok": status in ("fresh", "cached", "mock") and not errors, "mode": self.mode,
                "stop": stop, "status": status, "fetchedAt": iso(stamp) if stamp is not None else None,
                "ageSeconds": max(0, round(now - stamp, 1)) if stamp is not None else None,
                "pollAfterSeconds": 30, "arrivals": rows, "quota": quota, "errors": errors}
