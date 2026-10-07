#!/usr/bin/env python3
"""Demand-driven Seoul bus positions, with a separate durable daily quota.

python3 server/bus_live_proxy.py                 # loopback :3114
BUS_LIVE_MODE=mock python3 server/bus_live_proxy.py
GET /api/bus/live?routes=<standard IDs>&focus=<one of those IDs>
No key means unavailable, never an implicit simulation.
Background polling (background_loop, started by subway_live_proxy.py), one call per turn of the shared
gate: first the routes someone is watching (asked in the last WATCH_SECONDS) whose cache is stale, so a
watched route is fresh before the map asks again; only when none is due, the learning routes
BUS_LIVE_SAMPLE_ROUTES in turn, 05:00–24:00 KST, spread so they never use the last
BUS_LIVE_SAMPLE_RESERVE calls of the day (the map's). On 2026-10-06 the map made 2 calls of 950, too few
to learn from; 2026-10-07 the watchers came first instead of the collection pausing while anyone
watched (행님 · 덕배: 정확도가 먼저).
Every successful upstream answer is also appended to <BUS_LIVE_RECORD_DIR>/YYYYMMDD.jsonl (KST day,
default /var/lib/subway-live/bus; empty disables) for learning bus timing later: one row per
vehicle with the route, when we fetched it and the feed's own fields (RECORD_FIELDS).
"""
from __future__ import annotations

import fcntl
import json
import math
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
# The official service documents HTTP; HTTPS timed out in the 2026-10-03 probe.
API_URL = "http://ws.bus.go.kr/api/rest/buspos/getBusPosByRtid"
MAX_ROUTES = 8
SAMPLE_HOURS = (5 * 60, 24 * 60)   # KST 분: 버스가 다니는 동안만 모은다
NIGHT_END, NIGHT_WEIGHT = 5 * 60, 0.25   # KST 00~05시는 버스가 거의 없다: 호출 간격을 4배로 두고 아낀 몫을 낮에 쓴다
WATCH_SECONDS = 90   # 지도가 이 안에 물은 노선은 '보는 중': 수집보다 먼저 새로 받아 둔다
# 학습용으로 남기는 API 항목(차량 번호판 plainNo 는 남기지 않는다): 구간 순번 · 구간 안 거리 · 정류장 정차 · 측정 시각 등
RECORD_FIELDS = ("vehId", "sectOrd", "sectDist", "fullSectDist", "stopFlag", "dataTm", "sectionId", "lastStnId",
                 "nextStId", "nextStTm", "gpsX", "gpsY", "isrunyn", "islastyn", "busType", "isFullFlag", "congetion",
                 "rtDist", "stopId", "trnstnid")
MESSAGES = {
    "missing_key": "버스 위치 API 서비스키가 설정되지 않았습니다.",
    "disabled": "버스 실시간 위치 수집이 비활성화되어 있습니다.",
    "upstream_auth": "버스 위치 API 인증 또는 활용신청 승인을 확인해 주세요.",
    "upstream_quota": "버스 위치 API 호출 한도에 도달했습니다.",
    "upstream_route": "버스 위치 API에서 해당 노선을 찾을 수 없습니다.",
    "upstream_error": "버스 위치 API를 일시적으로 조회할 수 없습니다.",
    "invalid_payload": "버스 위치 API 응답 형식을 확인할 수 없습니다.",
    "quota_storage": "버스 호출량 기록을 읽거나 저장할 수 없어 수집을 중단했습니다.",
    "daily_limit": "오늘의 버스 위치 수집 예산을 모두 사용했습니다.",
    "paced": "하루 호출 예산에 맞춰 다음 노선 조회를 기다립니다.",
    "in_flight": "버스 위치 정보를 조회 중입니다.",
    "backoff": "API 오류 후 재시도를 기다립니다.",
    "data_unavailable": "버스 정적 노선 데이터를 불러올 수 없습니다.",
}


def iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def day_bounds(now: float) -> tuple[str, float]:
    local = datetime.fromtimestamp(now, KST)
    midnight = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return local.date().isoformat(), midnight.timestamp()


def pacing(now: float, midnight: float, left: int) -> float:
    """Seconds between calls so `left` calls last until midnight: the night (00–05 KST) counts
    NIGHT_WEIGHT of its length, so a night call comes 1/NIGHT_WEIGHT times as far apart."""
    night_end = midnight - 86400 + NIGHT_END * 60
    night = max(0.0, night_end - now)
    weighted = NIGHT_WEIGHT * night + (midnight - max(now, night_end))
    return weighted / max(1, left) / (NIGHT_WEIGHT if night else 1)


class BusError(Exception):
    """Only fixed, safe codes/messages cross the HTTP boundary."""
    def __init__(self, code: str):
        self.code = code if code in MESSAGES else "upstream_error"
        super().__init__(MESSAGES[self.code])


@dataclass
class Config:
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
    sample_routes: tuple = ()   # 학습용으로 알아서 부를 노선(없으면 안 부름)
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
        return cls(key=os.environ.get("SEOUL_BUS_SERVICE_KEY", ""),
                   mode=os.environ.get("BUS_LIVE_MODE", "auto"),
                   cache_seconds=float(os.environ.get("BUS_LIVE_CACHE_SECONDS", "30")),
                   stale_seconds=float(os.environ.get("BUS_LIVE_STALE_SECONDS", "300")),
                   daily_limit=int(os.environ.get("BUS_LIVE_DAILY_LIMIT", "950")),
                   min_interval=float(os.environ.get("BUS_LIVE_MIN_INTERVAL", "1")),
                   timeout=float(os.environ.get("BUS_LIVE_TIMEOUT", "8")),
                   quota_file=Path(os.environ.get("BUS_LIVE_QUOTA_FILE", "/var/lib/subway-live/bus-quota.json")),
                   routes_file=Path(os.environ.get("BUS_LIVE_ROUTES_FILE", str(ROOT / "data/bus/routes.json"))),
                   record_dir=Path(d) if (d := os.environ.get("BUS_LIVE_RECORD_DIR", "/var/lib/subway-live/bus")) else None,
                   # 472(개포동–신촌로타리) · 143(정릉–개포동): 많이 타는 간선 둘
                   sample_routes=tuple(r.strip() for r in os.environ.get("BUS_LIVE_SAMPLE_ROUTES", "100100075,100100022").split(",") if r.strip()),
                   sample_reserve=int(os.environ.get("BUS_LIVE_SAMPLE_RESERVE", "250")))


class QuotaLedger:
    """Count BEFORE I/O, atomically, including failures and across restarts/processes."""
    def __init__(self, config: Config):
        self.path, self.limit, self.min_interval = config.quota_file, config.daily_limit, config.min_interval

    def _read(self, now: float) -> dict:
        day, _ = day_bounds(now)
        try:
            saved = json.loads(self.path.read_text())
        except FileNotFoundError:
            return {"day": day, "used": 0, "nextAt": 0}
        except (OSError, ValueError):
            raise BusError("quota_storage") from None
        if not isinstance(saved, dict) or not isinstance(saved.get("day"), str):
            raise BusError("quota_storage")
        if saved["day"] != day:
            return {"day": day, "used": 0, "nextAt": 0}
        if (type(saved.get("used")) is not int or saved["used"] < 0
                or not isinstance(saved.get("nextAt"), (int, float))
                or not math.isfinite(saved["nextAt"])):
            raise BusError("quota_storage")
        return saved

    def view(self, now: float) -> dict:
        saved = self._read(now)
        return {"day": saved["day"], "used": saved["used"], "limit": self.limit,
                "remaining": max(0, self.limit - saved["used"])}

    def reserve(self, now: float, *, paced: bool = True, reserve_calls: int = 0) -> tuple[bool, str, float]:
        """paced=False is only for an explicit, bounded static-data collection job.

        It still shares the same hard daily limit and advances the live poll gate.
        No HTTP request parameter can change this policy.
        """
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.with_suffix(".lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                saved = self._read(now)
                _, midnight = day_bounds(now)
                if saved["used"] >= self.limit - max(0, reserve_calls):
                    return False, "daily_limit", midnight
                if paced and now < saved["nextAt"]:
                    return False, "paced", saved["nextAt"]
                # GLOBAL spacing, not an independent allowance for each route/viewer.
                interval = max(self.min_interval, pacing(now, midnight, self.limit - saved["used"]))
                saved.update(used=saved["used"] + 1, nextAt=max(saved["nextAt"], now + interval))
                temporary = self.path.with_suffix(".tmp")
                with temporary.open("w") as output:
                    json.dump(saved, output, separators=(",", ":"))
                    output.flush()
                    os.fsync(output.fileno())
                temporary.replace(self.path)
                return True, "", saved["nextAt"]
        except OSError:
            raise BusError("quota_storage") from None


def parse_payload(raw: bytes) -> list[dict]:
    """Both the bus XML envelope and resultType=json envelope; never echo errors."""
    if len(raw) > 2_000_000 or b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise BusError("invalid_payload")
    try:
        if raw.lstrip().startswith(b"{"):
            payload = json.loads(raw)
            header = payload.get("msgHeader")
            if not isinstance(header, dict):
                raise BusError("invalid_payload")
            code = str(header.get("headerCd", ""))
            body = payload.get("msgBody")
            if body is None or body == "":
                body = {}
            if not isinstance(body, dict):
                raise BusError("invalid_payload")
            items = body.get("itemList")
            if items is None or items == "":
                items = []
            if isinstance(items, dict):
                items = [items]
        else:
            root = ET.fromstring(raw)
            code = root.findtext(".//headerCd", "")
            if not code:
                reason = root.findtext(".//returnReasonCode", "")
                raise BusError("upstream_auth" if reason in ("20", "30", "31")
                               else "upstream_quota" if reason == "22" else "invalid_payload")
            items = [{child.tag: child.text or "" for child in item} for item in root.findall(".//itemList")]
        if code == "8":  # official guide: service has ended; clear old vehicles
            return []
        if code != "0":
            raise BusError("upstream_route" if code == "4" else
                           "upstream_quota" if code == "22" else "upstream_error")
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            raise BusError("invalid_payload")
        return items
    except (ET.ParseError, ValueError, TypeError, AttributeError):
        raise BusError("invalid_payload") from None


def fetch_positions(route_id: str, config: Config) -> list[dict]:
    # unquote (NOT unquote_plus) supports either portal encoding of the same key.
    query = urllib.parse.urlencode({"serviceKey": urllib.parse.unquote(config.key),
                                   "busRouteId": route_id, "resultType": "json"})
    request = urllib.request.Request(API_URL + "?" + query, headers={"User-Agent": "syung-bus/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=config.timeout) as response:
            raw = response.read(2_000_001)
    except urllib.error.HTTPError as error:
        raise BusError("upstream_auth" if error.code in (401, 403)
                       else "upstream_quota" if error.code == 429 else "upstream_error") from None
    except (OSError, urllib.error.URLError, ValueError):
        raise BusError("upstream_error") from None
    return parse_payload(raw)


def record(items: list[dict], route_id: str, now: float, directory: Path | None) -> None:
    """Append one upstream answer to that KST day's file; a failed write never fails the request."""
    if not directory:
        return
    fetched = iso(now)
    rows = "".join(json.dumps({"routeId": route_id, "fetchedAt": fetched,
                               **{k: row[k] for k in RECORD_FIELDS if row.get(k) not in (None, "")}},
                              ensure_ascii=False, separators=(",", ":")) + "\n" for row in items)
    if not rows:
        return
    try:
        directory.mkdir(parents=True, exist_ok=True)
        with (directory / f"{datetime.fromtimestamp(now, KST):%Y%m%d}.jsonl").open("a", encoding="utf-8") as out:
            out.write(rows)
    except OSError:
        pass


def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


def measurement_time(value) -> str | None:
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


def normalize_positions(items: list[dict], route_id: str) -> list[dict]:
    vehicles = {}
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
        bus = {"id": f"{route_id}:{vid}", "vehicleId": vid, "routeId": route_id,
               "lng": round(lng, 6), "lat": round(lat, 6), "heading": None, "speedKph": None,
               "stopSequence": int(seq) if seq is not None and seq >= 1 and seq.is_integer() else None,
               "atStop": str(row.get("stopFlag", "0")) == "1",
               "lastBus": str(row.get("islastyn", "0")).upper() in ("1", "Y"),
               "receivedAt": measurement_time(row.get("dataTm")), "mock": False}
        previous = vehicles.get(vid)
        if not previous or (bus["receivedAt"] or "") >= (previous["receivedAt"] or ""):
            vehicles[vid] = bus
    return sorted(vehicles.values(), key=lambda bus: bus["id"])


class BusProxy:
    def __init__(self, config: Config | None = None, *, routes: dict | None = None,
                 fetch=None, clock=None):
        self.config = config or Config.from_env()
        self.clock, self.fetch = clock or time.time, fetch or fetch_positions
        self.ledger = QuotaLedger(self.config)
        self.data_error = False
        if routes is None:
            try:
                payload = json.loads(self.config.routes_file.read_text())
                if payload["schemaVersion"] != 1:
                    raise ValueError("schema")
                routes = {route["id"]: route for route in payload["routes"]}
            except (OSError, ValueError, KeyError, TypeError):
                self.data_error, routes = True, {}
        self.routes = routes
        self.cache = {}
        self.failures = {}
        self.pending = set()
        self.lock = threading.Lock()
        self.backoff_until = 0
        self.next_at = 0
        self.last_block = "paced"
        self.watched = {}   # 노선 → 지도가 마지막으로 물은 때
        self.sample_at = 0   # 다음 수집 호출을 해도 되는 때

    @property
    def mode(self):
        if self.config.mode == "mock":
            return "mock"
        return "live" if self.config.key and self.config.mode != "disabled" else "unavailable"

    def validate(self, query: dict) -> tuple[list[str], str]:
        ids = list(dict.fromkeys(value.strip() for entry in query.get("routes", [])
                                 for value in entry.split(",") if value.strip()))
        focus_values = query.get("focus", [])
        focus = focus_values[0].strip() if focus_values else ""
        if (len(ids) > MAX_ROUTES or len(focus_values) > 1
                or any(not re.fullmatch(r"\d{9}", rid) or rid not in self.routes for rid in ids)
                or (focus and focus not in ids)):
            raise ValueError("routes must contain at most 8 known route IDs; focus must be one of them")
        return ids, focus

    def snapshot(self, query: dict) -> tuple[dict, int]:
        now = self.clock()
        if self.data_error:
            return self._body([], now, errors=[self._error(None, "data_unavailable")]), 503
        try:
            ids, focus = self.validate(query)
        except ValueError as error:
            return {"schemaVersion": 1, "ok": False, "error": "invalid_request", "message": str(error)}, 400
        with self.lock:
            for rid in ids:
                self.watched[rid] = now
        if self.mode == "unavailable":
            code = "disabled" if self.config.mode == "disabled" else "missing_key"
            statuses = {rid: self._status("unavailable", None, now, [], 60) for rid in ids}
            return self._body(ids, now, statuses=statuses, errors=[self._error(None, code)]), 200
        if self.mode == "mock":
            buses = [bus for rid in ids for bus in self._mock(rid, now)]
            statuses = {rid: self._status("mock", now, now, [b for b in buses if b["routeId"] == rid], 15)
                        for rid in ids}
            return self._body(ids, now, buses=buses, statuses=statuses), 200

        chosen = None
        storage_error = None
        with self.lock:
            due = [rid for rid in ids if rid not in self.pending
                   and now - self.cache.get(rid, (-math.inf, []))[0] >= self.config.cache_seconds
                   and now >= self.failures.get(rid, (0, ""))[0]]
            # Unknown/oldest first prevents the first visible route starving its neighbours.
            due.sort(key=lambda rid: (0 if rid == focus else 1, self.cache.get(rid, (-math.inf, []))[0], ids.index(rid)))
            if due and now >= self.backoff_until:
                try:
                    allowed, self.last_block, self.next_at = self.ledger.reserve(now)
                    if allowed:
                        chosen = due[0]
                        self.pending.add(chosen)
                except BusError as error:
                    storage_error = error.code
        if chosen:
            self._fetch(chosen)
        now = self.clock()
        buses, statuses, errors = [], {}, []
        with self.lock:
            for rid in ids:
                stamp, cached = self.cache.get(rid, (None, []))
                age = now - stamp if stamp is not None else None
                failure = self.failures.get(rid)
                retry = max(self.next_at, self.backoff_until, failure[0] if failure else 0)
                if stamp is not None and age < self.config.cache_seconds:
                    status = "fresh" if rid == chosen else "cached"
                    retry = max(retry, stamp + self.config.cache_seconds)
                elif stamp is not None:
                    status = "stale"
                else:
                    status = "error" if failure or storage_error else "deferred"
                reason = storage_error or (failure[1] if failure else "in_flight" if rid in self.pending
                                          else "backoff" if now < self.backoff_until else self.last_block or "paced")
                # Keep recent stale observations for display, but never resurrect old buses.
                visible = cached if stamp is not None and age <= self.config.stale_seconds else []
                buses.extend(visible)
                statuses[rid] = self._status(status, stamp, now, visible, max(1, math.ceil(retry - now)))
                if status in ("stale", "deferred", "error"):
                    statuses[rid]["reason"] = reason
                if failure:
                    errors.append(self._error(rid, failure[1]))
        if storage_error:
            errors.append(self._error(None, storage_error))
        return self._body(ids, now, buses=buses, statuses=statuses, errors=errors), 200

    def _fetch(self, rid):
        """One reserved upstream call (rid already in pending): cache, record, or note the failure."""
        try:
            items = self.fetch(rid, self.config)
            buses = normalize_positions(items, rid)
            record(items, rid, self.clock(), self.config.record_dir)
            with self.lock:
                self.cache[rid] = (self.clock(), buses)
                self.failures.pop(rid, None)
            return True
        except Exception as error:
            # Never expose urllib exceptions: they may contain a key-bearing URL.
            code = error.code if isinstance(error, BusError) else "upstream_error"
            with self.lock:
                self.failures[rid] = (self.clock() + 60, code)
                if code in ("upstream_auth", "upstream_quota"):
                    self.backoff_until = self.clock() + 300
            return False
        finally:
            with self.lock:
                self.pending.discard(rid)

    def _watched_due(self, now):
        """보는 중인 노선 중 캐시가 지난 것, 가장 오래된 것부터."""
        with self.lock:
            for rid, at in list(self.watched.items()):
                if now - at >= WATCH_SECONDS:
                    del self.watched[rid]
            return [rid for _, rid in sorted(
                (self.cache.get(rid, (-math.inf, []))[0], rid) for rid in self.watched
                if rid not in self.pending and now - self.cache.get(rid, (-math.inf, []))[0] >= self.config.cache_seconds
                and now >= self.failures.get(rid, (0, ""))[0])]

    def background_once(self, sample_rid) -> tuple[float, bool]:
        """One background turn: (seconds to wait, whether the learning route sample_rid was called).
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

    @staticmethod
    def _error(route_id, code):
        return {"routeId": route_id, "code": code, "message": MESSAGES[code]}

    @staticmethod
    def _status(status, stamp, now, buses, retry):
        return {"status": status, "fetchedAt": iso(stamp) if stamp is not None else None,
                "ageSeconds": max(0, round(now - stamp, 1)) if stamp is not None else None,
                "busCount": len(buses), "retryAfterSeconds": retry}

    def _body(self, ids, now, *, buses=None, statuses=None, errors=None):
        errors, buses, statuses = list(errors or []), buses or [], statuses or {}
        try:
            quota = self.ledger.view(now)
        except BusError:
            quota = {"day": day_bounds(now)[0], "used": None, "limit": self.config.daily_limit, "remaining": None}
            if not any(error["code"] == "quota_storage" for error in errors):
                errors.append(self._error(None, "quota_storage"))
        ready = all(statuses.get(rid, {}).get("status") in ("fresh", "cached", "mock") for rid in ids)
        return {"schemaVersion": 1, "ok": ready and not errors, "mode": self.mode,
                "fetchedAt": iso(now), "pollAfterSeconds": 15 if self.mode == "mock" else 30,
                "busCount": len(buses), "buses": buses, "routes": statuses, "quota": quota, "errors": errors}

    def _mock(self, rid, now):
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


_proxy = None
_proxy_lock = threading.Lock()


def get_proxy() -> BusProxy:
    global _proxy
    with _proxy_lock:
        if _proxy is None:
            _proxy = BusProxy()
        return _proxy


def background_loop(proxy: BusProxy | None = None, sleep=time.sleep) -> None:
    """subway_live_proxy.py starts it: watched routes first, then the learning routes in turn, forever."""
    proxy = proxy or get_proxy()
    routes = [rid for rid in proxy.config.sample_routes if rid in proxy.routes] or [None]
    turn = 0
    while proxy.mode == "live":
        wait, called = proxy.background_once(routes[turn % len(routes)])
        turn += called
        sleep(wait)


def snapshot(query: dict) -> tuple[dict, int]:
    """Small integration surface for the existing subway HTTP handler."""
    return get_proxy().snapshot(query)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        if len(self.path) > 2048:
            body, status = {"ok": False, "error": "invalid_request"}, 400
        elif parsed.path in ("/api/bus/live", "/bus/live", "/live"):
            body, status = snapshot(urllib.parse.parse_qs(parsed.query))
        elif parsed.path in ("/health", "/api/bus/health"):
            proxy = get_proxy()
            body, status = {"ok": not proxy.data_error, "mode": proxy.mode, "routeCount": len(proxy.routes)}, 200
        else:
            body, status = {"ok": False, "error": "not_found"}, 404
        raw = json.dumps(body, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, format, *args):
        pass  # Never log request queries or key-bearing upstream errors.


if __name__ == "__main__":
    config = Config.from_env()
    _proxy = BusProxy(config)
    address = (os.environ.get("BUS_LIVE_HOST", "127.0.0.1"), int(os.environ.get("BUS_LIVE_PORT", "3114")))
    ThreadingHTTPServer(address, Handler).serve_forever()
