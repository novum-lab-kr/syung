#!/usr/bin/env python3
"""Quota-aware, per-line proxy for Seoul realtime subway positions."""

from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get("SUBWAY_LIVE_HOST", "127.0.0.1")
PORT = int(os.environ.get("SUBWAY_LIVE_PORT", "3113"))
CACHE_SECONDS = max(60, int(os.environ.get("SUBWAY_LIVE_CACHE_SECONDS", "90")))
FOCUSED_CACHE_SECONDS = max(5, min(CACHE_SECONDS, int(os.environ.get("SUBWAY_LIVE_FOCUSED_CACHE_SECONDS", "15"))))
DAILY_LIMIT = max(1, int(os.environ.get("SUBWAY_LIVE_DAILY_LIMIT", "950")))   # raise it when the key's quota is raised
# No upstream calls while no trains run (KST, "HH:MM-HH:MM", may wrap midnight; empty = always call).
QUIET_HOURS = os.environ.get("SUBWAY_LIVE_QUIET_HOURS", "01:30-05:15").strip()
API_KEY = os.environ.get("SEOUL_SUBWAY_API_KEY", "sample").strip() or "sample"
API_URL = "http://swopenapi.seoul.go.kr/api/subway/{}/json/realtimePosition/0/1000/{}"
# One call returns arrival rows for every station on every line (~3k rows); used as the primary
# source so any number of lines costs one upstream call per CACHE_SECONDS.
ALL_URL = "http://swopenapi.seoul.go.kr/api/subway/{}/json/realtimeStationArrival/ALL"
SOURCE_MODE = os.environ.get("SUBWAY_LIVE_SOURCE", "all")
QUOTA_FILE = Path(os.environ.get("SUBWAY_LIVE_QUOTA_FILE", "/var/lib/subway-live/quota.json"))

LINE_NAMES = {
    "1001": "1호선", "1002": "2호선", "1003": "3호선", "1004": "4호선",
    "1005": "5호선", "1006": "6호선", "1007": "7호선", "1008": "8호선",
    "1009": "9호선", "1032": "GTX-A", "1063": "경의중앙선", "1065": "공항철도",
    "1067": "경춘선", "1075": "수인분당선", "1077": "신분당선", "1081": "경강선",
    "1092": "우이신설선", "1093": "서해선", "1094": "신림선",
}

_lock = threading.Lock()
_line_cache: dict[str, tuple[float, dict]] = {}
_all_cache: tuple[float, dict] | None = None
_quota_day = ""
_quota_used = 0


def _load_quota() -> None:
    global _quota_day, _quota_used
    try:
        saved = json.loads(QUOTA_FILE.read_text(encoding="utf-8"))
        if saved.get("day") == _today():
            _quota_day, _quota_used = saved["day"], int(saved.get("used", 0))
    except (OSError, ValueError, TypeError, KeyError):
        pass


def _save_quota() -> None:
    QUOTA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = QUOTA_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps({"day": _quota_day, "used": _quota_used}), encoding="utf-8")
    temporary.replace(QUOTA_FILE)


KST = timezone(timedelta(hours=9))


def _today() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")   # the key's daily quota runs on Korean days


def _quiet(now: datetime | None = None) -> bool:
    if not QUIET_HOURS:
        return False
    try:
        start, end = ((int(x[:2]) * 60 + int(x[3:5])) for x in QUIET_HOURS.split("-"))
    except ValueError:
        return False
    t = now or datetime.now(KST)
    m = t.hour * 60 + t.minute
    return start <= m < end if start <= end else m >= start or m < end


def _clean_station(value: object) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+(도착|진입|출발)$", "", text)
    text = re.sub(r"\([^)]*\)$", "", text).strip()
    return text


def _status(row: dict) -> str:
    return {"0": "진입", "1": "도착", "2": "출발", "3": "전역 출발", "4": "전전역 출발", "5": "전전역 도착"}.get(str(row.get("arvlCd")), "운행 중")


def normalize(payload: dict) -> list[dict]:
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in payload.get("realtimeArrivalList") or []:
        line = LINE_NAMES.get(str(row.get("subwayId")))
        train_no = str(row.get("btrainNo") or "").strip()
        if line and train_no:
            grouped[(line, train_no)].append(row)
    trains = []
    for (line, train_no), rows in grouped.items():
        row = min(rows, key=lambda r: int(str(r.get("barvlDt") or "999999")) if str(r.get("barvlDt") or "").isdigit() else 999999)
        station = _clean_station(row.get("arvlMsg3"))
        if not station or re.search(r"(후|전역|운행|출발)", station):
            station = _clean_station(row.get("statnNm"))
        trains.append({
            "line": line,
            "trainNo": train_no,
            "station": station,
            "destination": _clean_station(row.get("bstatnNm")),
            "direction": str(row.get("updnLine") or ""),
            "status": _status(row),
            "etaSeconds": int(row.get("barvlDt") or 0) if str(row.get("barvlDt") or "").isdigit() else None,
            "express": str(row.get("btrainSttus") or "") not in ("", "일반"),
            "last": str(row.get("lstcarAt") or "0") == "1",
            "receivedAt": row.get("recptnDt"),
        })
    return sorted(trains, key=lambda t: (t["line"], t["trainNo"]))


def normalize_positions(payload: dict, requested_line: str) -> list[dict]:
    trains = []
    for row in payload.get("realtimePositionList") or []:
        line = LINE_NAMES.get(str(row.get("subwayId")), requested_line)
        raw_direction = str(row.get("updnLine") or "")
        if raw_direction in ("0", "1"):
            direction = ("내선" if raw_direction == "0" else "외선") if line == "2호선" else ("상행" if raw_direction == "0" else "하행")
        else:
            direction = raw_direction
        trains.append({
            "line": line,
            "trainNo": str(row.get("trainNo") or "").strip(),
            "station": _clean_station(row.get("statnNm")),
            "destination": _clean_station(row.get("statnTnm")),
            "direction": direction,
            "status": {"0": "진입", "1": "도착", "2": "출발", "3": "전역 출발"}.get(str(row.get("trainSttus")), "운행 중"),
            "etaSeconds": None,
            "express": str(row.get("directAt") or "0") in ("1", "7"),
            "last": str(row.get("lstcarAt") or "0") == "1",
            "receivedAt": row.get("recptnDt"),
        })
    return sorted((t for t in trains if t["trainNo"] and t["station"]), key=lambda t: (t["line"], t["trainNo"]))


def normalize_arrivals(payload: dict) -> dict[str, list[dict]]:
    """Station-arrival rows → one position per train, grouped by line.

    Each train appears once per upcoming station. Prefer a row where it is at that station
    (arvlCd 0 진입 / 1 도착 / 2 출발); otherwise use arvlMsg3 (its current station) with the
    relative codes 3 전역출발 / 4 전역진입 / 5 전역도착 re-expressed against that station."""
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in payload.get("realtimeArrivalList") or []:
        line = LINE_NAMES.get(str(row.get("subwayId")))
        train_no = str(row.get("btrainNo") or "").strip()
        if line and train_no:
            grouped[(line, train_no)].append(row)

    def rank(row: dict) -> tuple[int, int]:
        code = str(row.get("arvlCd"))
        eta = int(row["barvlDt"]) if str(row.get("barvlDt") or "").isdigit() else 99999
        return (0 if code in ("0", "1", "2") else 1 if code in ("3", "4", "5") else 2, eta)

    # 전역 출발/진입/도착 (3/4/5) are about the station before the row's one; arvlMsg3 names it on
    # most rows but the row's own station on some (5·6호선): then take statnFid's station (not
    # always: 공항철도's statnFid points at stations that are not even adjacent)
    names = {str(r.get("statnId")): _clean_station(r.get("statnNm")) for r in payload.get("realtimeArrivalList") or []}
    out: dict[str, list[dict]] = defaultdict(list)
    for (line, train_no), rows in grouped.items():
        # Rows for one train (one per upcoming station) are not updated together: take the most
        # recently received one, so an older row resurfacing cannot move the train back.
        latest = max(str(r.get("recptnDt") or "") for r in rows)
        row = min((r for r in rows if str(r.get("recptnDt") or "") == latest), key=rank)
        code = str(row.get("arvlCd"))
        current = _clean_station(row.get("arvlMsg3")) or _clean_station(row.get("statnNm"))
        if code in ("0", "1", "2"):
            station, status = _clean_station(row.get("statnNm")), {"0": "진입", "1": "도착", "2": "출발"}[code]
        elif code in ("3", "4", "5"):
            if current == _clean_station(row.get("statnNm")):
                current = names.get(str(row.get("statnFid"))) or current
            station, status = current, {"3": "출발", "4": "진입", "5": "도착"}[code]
        else:
            station, status = current, "운행 중"
        if not station:
            continue
        out[line].append({
            "line": line,
            "trainNo": train_no,
            "station": station,
            "destination": _clean_station(row.get("bstatnNm")),
            "direction": str(row.get("updnLine") or ""),
            "status": status,
            "etaSeconds": None,
            "express": str(row.get("btrainSttus") or "") not in ("", "일반"),
            "last": str(row.get("lstcarAt") or "0") == "1",
            "receivedAt": row.get("recptnDt"),
        })
    return out


_last_seen: dict[tuple[str, str], dict] = {}


def _kst(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return None


SNAPSHOT_LAG = 20


def stabilize(lines: dict[str, list[dict]], memory: dict[tuple[str, str], dict]) -> dict[str, list[dict]]:
    """Turn all-stations snapshots into a forward-only event per train.

    On the Seoul Metro lines recptnDt is the snapshot time (every train of a line and direction
    carries the same one), not when the train reached its state; the Korail lines stamp each train
    with its own event time. For the snapshot kind:
    - a record older than the last, or one that moves the train back at the same time, is dropped
    - the same station and status seen again keeps the time it was first seen (otherwise every
      snapshot would restart the train's approach or dwell)
    - a new state carrying a snapshot stamp is dated SNAPSHOT_LAG earlier: against the per-line
      position feed's own event times (7호선, 2026-09-28 07:58–08:10, 295 events) the snapshot
      stamp comes 21 s later (IQR 12–36 s)
    """
    out: dict[str, list[dict]] = {}
    # a stamp ahead of the clock (seen: 3 min, and 23:59:57 in the morning) would freeze the train
    # on the map and, as "newest", block every later record: date those now
    now = datetime.now(timezone(timedelta(hours=9))).replace(tzinfo=None)
    for trains in lines.values():
        for t in trains:
            at = _kst(str(t.get("receivedAt") or ""))
            if at and (at - now).total_seconds() > 30:
                t["receivedAt"] = now.strftime("%Y-%m-%d %H:%M:%S")
    for line, trains in lines.items():
        # a stamp three or more trains of the line and direction share is a snapshot time
        # (3·4호선 mix both: Seoul Metro and Korail sections)
        shared = Counter((t.get("direction"), t.get("receivedAt")) for t in trains)
        kept = []
        for t in trains:
            k, seen = (line, t["trainNo"]), memory.get((line, t["trainNo"]))
            snap = str(t.get("receivedAt") or "")
            if seen and seen["record"].get("direction") == t.get("direction"):
                prev, last_snap = seen["record"], seen["snap"]
                same = (t["station"], t["status"]) == (prev["station"], prev["status"])
                back = snap < last_snap or (snap == last_snap and not same)
                if back:
                    t, snap = prev, last_snap
                elif same:
                    t = {**t, "receivedAt": prev["receivedAt"]}
                elif shared[(t.get("direction"), snap)] >= 3 and (at := _kst(snap)):
                    t = {**t, "receivedAt": (at - timedelta(seconds=SNAPSHOT_LAG)).strftime("%Y-%m-%d %H:%M:%S")}
            t = {**t, "stampedAt": snap}   # the feed's own recptnDt, kept for the samples
            memory[k] = {"record": t, "snap": snap}
            kept.append(t)
        out[line] = kept
    return out


def _count_call() -> None:
    global _quota_day, _quota_used
    day = _today()
    if day != _quota_day:
        _quota_day, _quota_used = day, 0
    if API_KEY != "sample" and _quota_used >= DAILY_LIMIT:
        raise RuntimeError("일일 안전 호출 한도에 도달했습니다.")


def _fetch_all() -> dict:
    global _quota_used
    _count_call()
    url = ALL_URL.format(urllib.parse.quote(API_KEY, safe=""))
    request = urllib.request.Request(url, headers={"User-Agent": "nol-meok-subway-live/1.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)
    _quota_used += 1
    _save_quota()
    error = payload.get("errorMessage") or {}
    if error.get("code") not in (None, "INFO-000"):
        raise RuntimeError(error.get("message") or "서울시 API 오류")
    return {"fetchedAt": datetime.now(timezone.utc).isoformat(), "lines": stabilize(normalize_arrivals(payload), _last_seen), "stations": index_arrivals(payload)}


def station_key(name: object) -> str:
    """Station name key shared with the map: no parentheses, no trailing 역, no spaces."""
    text = re.sub(r"\([^)]*\)", "", str(name or ""))
    return re.sub(r"역$", "", text).replace(" ", "")


def index_arrivals(payload: dict) -> dict[str, list[dict]]:
    """Upcoming trains per station (as the station-arrival rows give them), for station popups."""
    out: dict[str, list[dict]] = defaultdict(list)
    for row in payload.get("realtimeArrivalList") or []:
        line = LINE_NAMES.get(str(row.get("subwayId")))
        if not line:
            continue
        eta = int(row["barvlDt"]) if str(row.get("barvlDt") or "").isdigit() else None
        out[station_key(row.get("statnNm"))].append({
            "line": line,
            "direction": str(row.get("updnLine") or ""),
            "heading": str(row.get("trainLineNm") or ""),
            "destination": _clean_station(row.get("bstatnNm")),
            "trainNo": str(row.get("btrainNo") or ""),
            "eta": eta,
            "message": str(row.get("arvlMsg2") or ""),
            "where": _clean_station(row.get("arvlMsg3")),
            "code": str(row.get("arvlCd") or ""),
            "express": str(row.get("btrainSttus") or "") not in ("", "일반"),
            "last": str(row.get("lstcarAt") or "0") == "1",
            "receivedAt": row.get("recptnDt"),
        })
    return out


def snapshot_arrivals(name: str) -> tuple[dict, int]:
    """Arrivals at one station from the cached all-lines call (fetching it if the cache is cold)."""
    global _all_cache
    with _lock:
        now = time.time()
        if _all_cache is None or now - _all_cache[0] >= CACHE_SECONDS:
            try:
                _all_cache = (now, _fetch_all())
            except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
                if _all_cache is None:
                    return {"ok": False, "error": str(exc)}, 503
        data = _all_cache[1]
        rows = data.get("stations", {}).get(station_key(name), [])
        return {"ok": True, "fetchedAt": data["fetchedAt"], "station": name, "arrivals": rows}, 200


def snapshot_all(lines: list[str]) -> tuple[dict, int] | None:
    """Serve any set of lines from one cached all-lines call; None → caller falls back per line."""
    global _all_cache
    selected = [line for line in dict.fromkeys(lines) if line in set(LINE_NAMES.values())]
    with _lock:
        now, warnings, quiet = time.time(), [], _quiet()
        if quiet and _all_cache is None:
            return {"ok": True, "mode": "all", "quiet": True, "fetchedAt": datetime.now(timezone.utc).isoformat(), "trainCount": 0, "cacheSeconds": CACHE_SECONDS,
                    "quota": {"used": _quota_used, "limit": DAILY_LIMIT, "day": _quota_day}, "lines": selected, "warnings": [], "trains": []}, 200
        if not quiet and (_all_cache is None or now - _all_cache[0] >= CACHE_SECONDS):
            try:
                _all_cache = (now, _fetch_all())
            except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
                if _all_cache is None:
                    return None
                warnings.append(f"전체 노선: 이전 자료 표시 중 ({exc})")
        data = _all_cache[1]
        trains = [t for line in selected for t in data["lines"].get(line, [])]
        return {"ok": True, "mode": "all", "quiet": quiet, "fetchedAt": data["fetchedAt"], "trainCount": len(trains), "cacheSeconds": CACHE_SECONDS,
                "quota": {"used": _quota_used, "limit": DAILY_LIMIT, "day": _quota_day}, "lines": selected, "warnings": warnings, "trains": trains}, 200


def _fetch_line(line: str) -> dict:
    global _quota_day, _quota_used
    day = _today()
    if day != _quota_day:
        _quota_day, _quota_used = day, 0
    if API_KEY != "sample" and _quota_used >= DAILY_LIMIT:
        raise RuntimeError("일일 안전 호출 한도에 도달했습니다.")
    url = API_URL.format(urllib.parse.quote(API_KEY, safe=""), urllib.parse.quote(line, safe=""))
    request = urllib.request.Request(url, headers={"User-Agent": "nol-meok-subway-live/1.0"})
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.load(response)
    _quota_used += 1
    _save_quota()
    error = payload.get("errorMessage") or {}
    if error.get("code") not in (None, "INFO-000"):
        raise RuntimeError(error.get("message") or "서울시 API 오류")
    trains = normalize_positions(payload, line)
    return {
        "ok": True,
        "mode": "sample" if API_KEY == "sample" else "live",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "sourceTotal": int(error.get("total") or len(payload.get("realtimePositionList") or [])),
        "recordsReceived": len(payload.get("realtimePositionList") or []),
        "trainCount": len(trains),
        "cacheSeconds": CACHE_SECONDS,
        "quota": {"used": _quota_used, "limit": DAILY_LIMIT, "day": _quota_day},
        "trains": trains,
    }


def snapshot(lines: list[str], focused: bool = False) -> tuple[dict, int]:
    if SOURCE_MODE == "all" and lines:
        result = snapshot_all(lines)
        if result:
            return result
    now = time.time()
    selected = [line for line in dict.fromkeys(lines) if line in set(LINE_NAMES.values())][:5]
    if not selected:
        return {"ok": True, "mode": "viewport", "fetchedAt": datetime.now(timezone.utc).isoformat(), "trainCount": 0, "cacheSeconds": CACHE_SECONDS, "quota": {"used": _quota_used, "limit": DAILY_LIMIT, "day": _quota_day}, "lines": [], "trains": []}, 200
    with _lock:
        # Keep a continuously open viewport within roughly 960 upstream calls/day:
        # one line refreshes every 90s, two every 180s, ... five every 450s.
        ttl = FOCUSED_CACHE_SECONDS if focused and len(selected) == 1 else CACHE_SECONDS * len(selected)
        warnings, trains, fetched = [], [], []
        for line in selected:
            cached = _line_cache.get(line)
            if cached is None or now - cached[0] >= ttl:
                try:
                    cached = (now, _fetch_line(line))
                    _line_cache[line] = cached
                except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
                    if cached is None:
                        warnings.append(f"{line}: {exc}")
                        continue
                    warnings.append(f"{line}: 이전 자료 표시 중")
            fetched.append(cached[1])
            trains.extend(cached[1]["trains"])
        if not fetched and warnings:
            return {"ok": False, "error": " / ".join(warnings), "trains": []}, 503
        return {"ok": True, "mode": "viewport", "fetchedAt": datetime.now(timezone.utc).isoformat(), "trainCount": len(trains), "cacheSeconds": ttl, "quota": {"used": _quota_used, "limit": DAILY_LIMIT, "day": _quota_day}, "lines": selected, "warnings": warnings, "trains": trains}, 200


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] not in ("/live", "/health"):
            self.send_error(404)
            return
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        lines = [item.strip() for value in query.get("lines", []) for item in value.split(",") if item.strip()]
        focused = query.get("focused", [""])[0] == "1"
        arrivals = query.get("arrivals", [""])[0].strip()
        if not self.path.startswith("/live"):
            body, status = {"ok": True}, 200
        elif arrivals:
            body, status = snapshot_arrivals(arrivals)
        else:
            body, status = snapshot(lines, focused=focused)
        data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/live") else "public, max-age=30")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    _load_quota()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
