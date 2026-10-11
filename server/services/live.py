"""실시간 지하철: 서울시 전 노선 역 도착(ALL)을 한 번 받아 모든 노선에 나눠 주고, 원하면 노선별 위치 피드를 덧씌운다.

Quota-aware: 하루 호출 수(SUBWAY_LIVE_DAILY_LIMIT)를 넘지 않게 ALL 간격을 늘리고, 열차가 안 다니는 시각엔 부르지 않는다.
바깥 호출은 sources/seoul_subway.py, 호출 수 · 위치 기록 파일은 store/, 입력 검사 · 상태 코드는 routes/live.py.
"""
from __future__ import annotations

import re
import threading
import time
import urllib.error
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from server.clock import KST, kst_today
from server.config import SubwayConfig
from server.sources.seoul_subway import SeoulSubwaySource, check_error
from server.store.records import record_positions
from server.store.subway_quota import SubwayQuotaFile

PACE_RESERVE, MAX_PACE_SECONDS = 60, 600
PROBE_RESERVE = 100   # 이상 감지의 위치 피드 확인은 지도 몫(position_reserve)보다 이만큼 더 남았을 때만
POSITION_PARTIAL_MIN = 9   # 전 역 도착에 이만큼 넘게 있는 노선만 위치 피드가 모자란지 본다(overlay_positions)

LINE_NAMES = {
    "1001": "1호선", "1002": "2호선", "1003": "3호선", "1004": "4호선",
    "1005": "5호선", "1006": "6호선", "1007": "7호선", "1008": "8호선",
    "1009": "9호선", "1032": "GTX-A", "1063": "경의중앙선", "1065": "공항철도",
    "1067": "경춘선", "1075": "수인분당선", "1077": "신분당선", "1081": "경강선",
    "1092": "우이신설선", "1093": "서해선", "1094": "신림선",
}


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


def normalize_arrivals(payload: dict) -> tuple[dict[str, list[dict]], set, set]:
    """Station-arrival rows → one position per train, grouped by line; also the next trips listed
    before they start (skipped) and the trains not running yet (idle), for overlay_positions.

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
        # A 진입/도착/출발 row far out is not where the train is now: on the 응암 loop a 하행 train
        # entering it (역촌 2분 후) also has "응암 도착" 12 minutes out, for coming round again — taken
        # as at 응암, it was run on toward 새절 and vanished (6303, 2026-09-30). Then the nearest row.
        code = str(row.get("arvlCd"))
        eta = int(row["barvlDt"]) if str(row.get("barvlDt") or "").isdigit() else 99999
        return (0 if code in ("0", "1", "2") and eta < 300 else 1 if code in ("3", "4", "5") and eta < 480 else 2, eta)

    # 전역 출발/진입/도착 (3/4/5) are about the station before the row's one; arvlMsg3 names it on
    # most rows but the row's own station on some (5·6호선): then take statnFid's station (not
    # always: 공항철도's statnFid points at stations that are not even adjacent)
    names = {str(r.get("statnId")): _clean_station(r.get("statnNm")) for r in payload.get("realtimeArrivalList") or []}
    # A train's next trip is listed before it starts: at 신내 a 상행 '응암순환' number appears while the
    # train is still running in as 하행, placed where that 하행 train is (6308/6310 at 화랑대·태릉입구,
    # 2026-09-30) — a ghost that runs backwards and then jumps to 신내. Such a train is listed only at
    # stations where the other direction's trains end (not its own destination; a running train is also
    # listed at the stations after), and is not there yet (see below): it has to get there before this
    # trip begins. Its current trip is
    # drawn under its other number; skip this one until it starts.
    ends: dict[tuple[str, str], set[str]] = defaultdict(set)
    for (line, _), rows in grouped.items():
        for r in rows:
            ends[(line, str(r.get("updnLine") or ""))].add(_clean_station(r.get("bstatnNm")))
    other = {"상행": "하행", "하행": "상행", "내선": "외선", "외선": "내선"}

    def next_trip(line: str, rows: list[dict]) -> bool:
        for r in rows:
            at, code = _clean_station(r.get("statnNm")), str(r.get("arvlCd"))
            eta = int(r["barvlDt"]) if str(r.get("barvlDt") or "").isdigit() else 0
            if at not in ends[(line, other.get(str(r.get("updnLine") or ""), ""))] or at == _clean_station(r.get("bstatnNm")):
                return False
            # not there yet: "22분 후 (화랑대)" from elsewhere, or 전역 출발/진입/도착 still 8+ minutes out
            # (6310 "신내 전역출발" 18 min while it ran in as 6283; a running one is 1–4 min)
            if not ((code == "99" and _clean_station(r.get("arvlMsg3")) != at) or (code in ("3", "4", "5") and eta >= 480)):
                return False
        return True

    out: dict[str, list[dict]] = defaultdict(list)
    skipped, idle = set(), set()
    for (line, train_no), rows in grouped.items():
        if next_trip(line, rows):
            skipped.add((line, train_no))
            continue
        # Not running yet, wherever the position feed puts it: its nearest row is 전역 출발/진입/도착
        # (one station away) but 8+ minutes out — standing at a terminus or coming out of the depot.
        # 6312 sat in the position feed as "봉화산 전역출발" (신내 → 봉화산, a 2-minute run) for 4+
        # minutes while this feed had it 15 minutes out and 6310 was still at the 신내 platform.
        near = min(rows, key=lambda r: int(r["barvlDt"]) if str(r.get("barvlDt") or "").isdigit() else 99999)
        if str(near.get("arvlCd")) in ("3", "4", "5") and str(near.get("barvlDt") or "").isdigit() and int(near["barvlDt"]) >= 480:
            idle.add((line, train_no))
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
        # Standing at a terminus 8+ minutes before leaving — 진입/도착/출발 there with a long wait (5717
        # 방화 14 min, 6316 신내 45 min), or a 전역 row far out (6308 "봉화산 전역출발" 11 min: at 신내):
        # the map holds it there till departsAt instead of running it off after a normal dwell.
        departs = None
        terminus = ends[(line, other.get(str(row.get("updnLine") or ""), ""))] - {_clean_station(row.get("bstatnNm"))}
        eta_of = lambda r: int(r["barvlDt"]) if str(r.get("barvlDt") or "").isdigit() else 0
        wait = next((r for r in rows if str(r.get("arvlCd")) in ("0", "1", "2") and eta_of(r) >= 480
                     and _clean_station(r.get("statnNm")) == station), None) if station in terminus else None
        lead = 0
        if wait is None and code in ("3", "4", "5") and eta_of(row) >= 480 and station in terminus:
            wait, lead = row, 120
        stamp = _kst(str(wait.get("recptnDt") or "")) if wait else None
        if stamp:
            status = "도착"
            departs = (stamp + timedelta(seconds=eta_of(wait) - lead)).strftime("%Y-%m-%d %H:%M:%S")
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
            **({"departsAt": departs} if departs else {}),   # the map holds it there till then
        })
    # skipped: the position feed lists these too (6310 신내 전역출발): overlay_positions
    return out, skipped, idle


def _kst(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return None


def stabilize(lines: dict[str, list[dict]], memory: dict[tuple[str, str], dict]) -> dict[str, list[dict]]:
    """Turn all-stations snapshots into a forward-only event per train.

    On the Seoul Metro lines recptnDt is the snapshot time (every train of a line and direction
    carries the same one), not when the train reached its state; the Korail lines stamp each train
    with its own event time. For the snapshot kind:
    - a record older than the last, or one that moves the train back at the same time, is dropped
    - the same station and status seen again keeps the time it was first seen (otherwise every
      snapshot would restart the train's approach or dwell)
    New states keep the snapshot stamp as it is: dating them earlier (halfway back to the last
    snapshot, or 20 s by the position feed's event times) put the trains ahead when riding 7호선
    (7081, 2026-09-28 사가정–어린이대공원).
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
            t = {**t, "stampedAt": snap}   # the feed's own recptnDt, kept for the samples
            memory[k] = {"record": t, "snap": snap}
            kept.append(t)
        out[line] = kept
    return out


# Stations renamed after the GTFS snapshot (current name → GTFS name), as in web/lib/routing.mjs.
RENAMED = {"불암산": "당고개", "청산": "초성리", "자양": "뚝섬유원지", "이수": "총신대입구", "한국항공대": "화전",
           "용인중앙시장": "운동장·송담대", "서해구청": "서구청"}


def station_key(name: object) -> str:
    """Station name key shared with the map: no parentheses, no trailing 역, no spaces; renamed stations fold together."""
    text = re.sub(r"\([^)]*\)", "", str(name or ""))
    text = re.sub(r"역$", "", text).replace(" ", "")
    return RENAMED.get(text, text)


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


class SubwayLiveService:
    """실시간 지하철: 전 노선 한 번 받기(ALL) 캐시 · 노선별 위치 덧씌우기 · 하루 호출 수. 옛 subway_live_proxy 의 전역 상태 주인."""

    def __init__(self, config: SubwayConfig | None = None, *, source: SeoulSubwaySource | None = None):
        self.config = config or SubwayConfig.from_env()
        self.source = source or SeoulSubwaySource(self.config.api_key)
        self.quota_file = SubwayQuotaFile(self.config.quota_file)
        self.lock = threading.Lock()
        self.line_cache: dict[str, tuple[float, dict]] = {}
        self.all_cache: tuple[float, dict] | None = None
        self.quota_day = ""
        self.quota_used = 0
        self.next_trips: set[tuple[str, str]] = set()   # normalize_arrivals: overlay_positions 가 빼는 다음 운행
        self.idle: set[tuple[str, str]] = set()   # not running yet (normalize_arrivals); kept off position-feed lines
        self.last_seen: dict[tuple[str, str], dict] = {}   # stabilize 의 기억
        self.position_lock = threading.Lock()
        self.position_cache: dict[str, tuple[float, list[dict]]] = {}
        self.position_used = {"day": "", "calls": 0}
        self.position_seen: dict[str, float] = {}   # line -> last time a request asked for it (lines being watched now)
        # 이상 감지(/api/health): 전 노선 받기의 마지막 성공 · 이어진 실패의 시작, 노선별 위치 피드 대수 대 전 역 도착 대수
        self.all_ok_at: float | None = None
        self.all_error_since: float | None = None
        self.position_checks: dict[str, list[tuple[float, int, int]]] = {}   # line -> [(받은 때, 위치 대수, 도착 대수)] 최근 1시간

    # ---- 하루 호출 수 ----------------------------------------------------------------------

    def load_quota(self) -> None:
        """켤 때 한 번: 오늘 쓴 호출 수를 파일에서 이어 받는다."""
        try:
            saved = self.quota_file.read()
            if saved.get("day") == kst_today():
                self.quota_day, self.quota_used = saved["day"], int(saved.get("used", 0))
                self.position_used.update(day=saved["day"], calls=int(saved.get("position", 0)))   # survives restarts
        except (OSError, ValueError, TypeError, KeyError):
            pass

    def _save_quota(self) -> None:
        self.quota_file.write(self.quota_day, self.quota_used, self.position_used["calls"])

    def _count_call(self) -> None:
        day = kst_today()
        if day != self.quota_day:
            self.quota_day, self.quota_used = day, 0
        if self.config.api_key != "sample" and self.quota_used >= self.config.daily_limit:
            raise RuntimeError("일일 안전 호출 한도에 도달했습니다.")

    def quota_view(self) -> dict:
        return {"used": self.quota_used, "limit": self.config.daily_limit, "day": self.quota_day}

    def calls_left(self) -> int:
        return self.config.daily_limit - self.quota_used

    def quiet(self, now: datetime | None = None) -> bool:
        """열차가 안 다니는 시각(SUBWAY_LIVE_QUIET_HOURS)이면 바깥을 부르지 않는다."""
        quiet_hours = self.config.quiet_hours
        if not quiet_hours:
            return False
        try:
            start, end = ((int(x[:2]) * 60 + int(x[3:5])) for x in quiet_hours.split("-"))
        except ValueError:
            return False
        t = now or datetime.now(KST)
        m = t.hour * 60 + t.minute
        return start <= m < end if start <= end else m >= start or m < end

    # ---- 전 노선(ALL) ------------------------------------------------------------------------

    def _fetch_all(self) -> dict:
        try:
            self._count_call()
            payload = self.source.fetch_all()
            self.quota_used += 1
            self._save_quota()
            check_error(payload)
        except Exception:
            self.all_error_since = self.all_error_since or time.time()
            raise
        self.all_ok_at, self.all_error_since = time.time(), None
        fetched_at = datetime.now(timezone.utc).isoformat()
        lines, self.next_trips, self.idle = normalize_arrivals(payload)
        return {"fetchedAt": fetched_at, "lines": stabilize(lines, self.last_seen), "stations": index_arrivals(payload)}

    def snapshot_arrivals(self, name: str) -> dict:
        """Arrivals at one station from the cached all-lines call (fetching it if the cache is cold)."""
        with self.lock:
            now = time.time()
            if self.all_cache is None or now - self.all_cache[0] >= self.config.cache_seconds:
                try:
                    self.all_cache = (now, self._fetch_all())
                except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
                    if self.all_cache is None:
                        return {"ok": False, "error": str(exc)}
            data = self.all_cache[1]
            rows = data.get("stations", {}).get(station_key(name), [])
            return {"ok": True, "fetchedAt": data["fetchedAt"], "station": name, "arrivals": rows}

    def _all_interval(self, now: datetime | None = None) -> float:
        """Seconds between all-lines calls: CACHE_SECONDS, stretched when the calls left today (less
        PACE_RESERVE for bursts and the position overlay) would not last until midnight at that rate —
        1000 a day at 60 s runs out in the evening (2026-09-30: gone at 16:53)."""
        t = now or datetime.now(KST)
        to_midnight = (t.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1) - t).total_seconds()
        left = self.config.daily_limit - self.quota_used - PACE_RESERVE
        return max(self.config.cache_seconds, min(MAX_PACE_SECONDS, to_midnight / max(1, left)))

    def snapshot_all(self, lines: list[str]) -> dict | None:
        """Serve any set of lines from one cached all-lines call; None → caller falls back per line."""
        selected = [line for line in dict.fromkeys(lines) if line in set(LINE_NAMES.values())]
        cache_seconds, limit = self.config.cache_seconds, self.config.daily_limit
        with self.lock:
            now, warnings, quiet = time.time(), [], self.quiet()
            if quiet and self.all_cache is None:
                return {"ok": True, "mode": "all", "quiet": True, "fetchedAt": datetime.now(timezone.utc).isoformat(), "trainCount": 0, "cacheSeconds": cache_seconds,
                        "quota": self.quota_view(), "lines": selected, "warnings": [], "trains": []}
            if not quiet and (self.all_cache is None or now - self.all_cache[0] >= self._all_interval()):
                try:
                    self.all_cache = (now, self._fetch_all())
                except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
                    if self.all_cache is None:
                        if self.quota_used >= limit:   # not an outage: say so instead of a 503
                            return {"ok": True, "mode": "all", "quotaExhausted": True, "fetchedAt": datetime.now(timezone.utc).isoformat(), "trainCount": 0,
                                    "cacheSeconds": cache_seconds, "quota": self.quota_view(), "lines": selected, "warnings": [str(exc)], "trains": []}
                        return None
                    warnings.append(f"전체 노선: 이전 자료 표시 중 ({exc})")
            quota_out = self.quota_used >= limit
            data = self.all_cache[1]
            trains = [t for line in selected for t in data["lines"].get(line, [])]
            return {"ok": True, "mode": "all", "quiet": quiet, "quotaExhausted": quota_out, "fetchedAt": data["fetchedAt"], "trainCount": len(trains), "cacheSeconds": round(self._all_interval()),
                    "quota": self.quota_view(), "lines": selected, "warnings": warnings, "trains": trains}

    def all_lines(self) -> dict:
        """길찾기용: 모든 노선의 지금 열차(캐시가 지났으면 한 번 새로 받는다). 받은 적 없으면 빈 dict."""
        self.snapshot_all(list(LINE_NAMES.values()))   # refreshes the shared cache if due (one upstream call at most)
        return self.all_cache[1]["lines"] if self.all_cache else {}

    # ---- 노선별 위치 ------------------------------------------------------------------------

    def fetch_line(self, line: str) -> dict:
        """한 노선의 위치 피드 한 번(하루 호출 수에 센다; 한도면 RuntimeError). burst 도 이것을 부른다."""
        self._count_call()
        payload = self.source.fetch_line(line)
        self.quota_used += 1
        self._save_quota()
        error = check_error(payload)
        trains = normalize_positions(payload, line)
        return {
            "ok": True,
            "mode": "sample" if self.config.api_key == "sample" else "live",
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "sourceTotal": int(error.get("total") or len(payload.get("realtimePositionList") or [])),
            "recordsReceived": len(payload.get("realtimePositionList") or []),
            "trainCount": len(trains),
            "cacheSeconds": self.config.cache_seconds,
            "quota": self.quota_view(),
            "trains": trains,
        }

    def save_positions(self, data: dict) -> None:
        """event-stamped records: build_live_timing.py learns rush-hour pace from them."""
        record_positions(data, self.config.burst_dir)

    def _position_ttl(self, line: str, ttl: int, now: float) -> float:
        """`ttl`, stretched when the budget left would not last until midnight with every line watched
        in the last 2 minutes read at that pace (like _all_interval): with many people spread over many
        lines the overlay slows down instead of running out in the afternoon and stopping for the day."""
        self.position_seen[line] = now
        active = sum(1 for t in self.position_seen.values() if now - t < 120)
        t = datetime.now(KST)
        to_midnight = (t.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1) - t).total_seconds()
        left = self.config.position_budget - self.position_used["calls"]
        return max(ttl, min(MAX_PACE_SECONDS, to_midnight * active / max(1, left)))

    def _position_hours(self, now: datetime | None = None) -> bool:
        position_hours = self.config.position_hours
        if not position_hours:
            return True
        t = now or datetime.now(KST)
        m = t.hour * 60 + t.minute
        for span in position_hours.split(","):
            try:
                a, b = ((int(x[:2]) * 60 + int(x[3:5])) for x in span.strip().split("-"))
            except ValueError:
                continue
            if a <= m < b:
                return True
        return False

    def _positions(self, line: str, ttl: int) -> list[dict] | None:
        """The line's trains from the position feed, at most `ttl` seconds old; None when unavailable."""
        with self.position_lock:
            now, cached = time.time(), self.position_cache.get(line)
            if self.position_used["day"] != kst_today():
                self.position_used.update(day=kst_today(), calls=0)
            ttl = self._position_ttl(line, ttl, now)
            if cached and now - cached[0] < ttl:
                return cached[1]
            if (self.quiet() or not self._position_hours() or self.config.daily_limit - self.quota_used < self.config.position_reserve
                    or self.position_used["calls"] >= self.config.position_budget):
                return cached[1] if cached and now - cached[0] < ttl * 4 else None
            self.position_used["calls"] += 1
            try:
                data = self.fetch_line(line)   # saves the quota file, position count included
            except (OSError, ValueError, RuntimeError, urllib.error.URLError):
                return cached[1] if cached and now - cached[0] < ttl * 4 else None
            self.save_positions(data)
            trains = data["trains"]
            self.position_cache[line] = (now, trains)
            return trains

    def overlay_positions(self, body: dict, lines: list[str], focus: str) -> dict:
        """Replace the all-stations records of trains on the chosen lines with position-feed ones.

        Position overlay — off by default (SUBWAY_LIVE_POSITION_LINES=0); until the key's daily quota is
        lifted it runs for one line in commuting hours only (SUBWAY_LIVE_POSITION_HOURS, _BUDGET).
        The per-line position feed is ahead of the all-stations one at 3 of 4 moments, mostly by one
        station; the all-stations feed caught up after a median 38 s at 60 s polling (2·5·6·7·9호선,
        3,158 moments, 2026-09-28–29). With it on, the first N lines a request names (the map sends
        them most-visible first) and the line of a train being followed (focus=) are read from it too."""
        position_lines = self.config.position_lines
        names = set(LINE_NAMES.values())
        picks = [focus] if focus in names else []
        picks += [l for l in lines[:position_lines] if l not in picks]
        if not position_lines or not (picks or self.position_cache):
            return body
        trains = list(body.get("trains") or [])
        at = {(t["line"], t["trainNo"]): i for i, t in enumerate(trains)}
        used, partial = [], []
        # also the other requested lines whose position feed was read lately for someone else (no call):
        # a line dropping out of the first POSITION_LINES as the map moves no longer flips back to the
        # all-stations roster, ghosts and all (6308 at 봉화산 showing and going, 2026-09-30)
        now = time.time()
        recent = {l: c[1] for l in lines if l not in picks and (c := self.position_cache.get(l)) and now - c[0] < 2 * self.config.position_seconds}
        for line in picks + list(recent):
            pos = recent[line] if line in recent else self._positions(line, self.config.focus_seconds if line == focus else self.config.position_seconds)
            if pos is None:
                continue
            # 위치 피드가 노선 일부만 줄 때가 있다(7호선 2026-10-12 출근 시간: 위치 3대 · 전 역 도착 51대, 평소 위치 약 30대).
            # 그대로 명단으로 쓰면 전 역 도착에만 있는 열차가 다 빠진다 — 전 역 도착의 3분의 1도 안 되면 그 노선은 위치 피드를 쓰지 않는다
            listed = sum(1 for t in trains if t["line"] == line)
            if (c := self.position_cache.get(line)) and c[1] is pos:
                self.note_position(line, c[0], len(pos), listed)
            if listed >= POSITION_PARTIAL_MIN and len(pos) * 3 < listed:
                partial.append(line)
                continue
            used.append(line)
            for p in pos:
                i = at.get((p["line"], p["trainNo"]))
                if i is not None:
                    # direction and destination as the all-stations feed names them: 9호선's updnLine
                    # is the other way round in the position feed, and trains turning at a terminus
                    # disagree for a while (2호선: 30 of 511)
                    old = trains[i]
                    trains[i] = {**p, "direction": old.get("direction") or p["direction"],
                                 "destination": old.get("destination") or p["destination"], "source": "position",
                                 # still standing at the terminus it starts from (normalize_arrivals)
                                 **({"departsAt": old["departsAt"]} if old.get("departsAt") and p["station"] == old["station"] else {})}
                elif (p["line"], p["trainNo"]) in self.next_trips:
                    continue   # a next trip listed before it starts (normalize_arrivals)
                else:
                    flip = {"상행": "하행", "하행": "상행"} if line == "9호선" else {}
                    trains.append({**p, "direction": flip.get(p["direction"], p["direction"]), "source": "position"})
        # On a line read from the position feed, that feed is the roster: a train only the all-stations
        # feed has is a next trip listed early (6308 "봉화산 도착" while not on the line, 2026-09-30), or
        # one that ended its run at a terminus (5175 하남검단산, 3362 대화) — not a train on the line.
        # Nor is one that feed has as not running yet (idle: 6312).
        trains = [t for t in trains if t["line"] not in used or (t.get("source") == "position" and (t["line"], t["trainNo"]) not in self.idle)]
        return {**body, "trains": trains, "trainCount": len(trains), "positionLines": used,
                **({"positionPartial": partial} if partial else {}),
                "positionBudget": {"used": self.position_used["calls"], "limit": self.config.position_budget}}

    def note_position(self, line: str, at: float, count: int, listed: int) -> None:
        """위치 피드 한 번의 대수와 그때 전 역 도착의 대수(같은 받기는 한 번만, 1시간치만 둔다)."""
        rows = self.position_checks.setdefault(line, [])
        if rows and rows[-1][0] == at:
            return
        rows.append((at, count, listed))
        while rows and rows[0][0] < at - 3600:
            rows.pop(0)

    def last_position_read(self, line: str) -> float:
        rows, cached = self.position_checks.get(line), self.position_cache.get(line)
        return max(rows[-1][0] if rows else 0.0, cached[0] if cached else 0.0)

    def probe_position(self, line: str) -> bool:
        """이상 감지용 위치 피드 한 번(jobs/position_probe): 위치 피드 예산 · 하루 한도 안에서만, 지도의 위치 캐시는 건드리지 않는다."""
        with self.position_lock:
            if self.position_used["day"] != kst_today():
                self.position_used.update(day=kst_today(), calls=0)
            if (self.quiet() or self.position_used["calls"] >= self.config.position_budget
                    or self.calls_left() < self.config.position_reserve + PROBE_RESERVE):
                return False
            self.position_used["calls"] += 1
        listed = len(self.all_cache[1]["lines"].get(line, [])) if self.all_cache else 0
        try:
            data = self.fetch_line(line)
        except (OSError, ValueError, RuntimeError, urllib.error.URLError):
            return False
        self.save_positions(data)
        self.note_position(line, time.time(), len(data["trains"]), listed)
        return True

    # ---- 지도가 묻는 것 ----------------------------------------------------------------------

    def snapshot(self, lines: list[str], focused: bool = False, focus: str = "") -> dict:
        """지도의 /live: 보이는 노선들의 열차. ok=False 면 보여 줄 것이 없다(routes 가 503 으로)."""
        if self.config.source_mode == "all" and lines:
            body = self.snapshot_all(lines)
            if body:
                return self.overlay_positions(body, lines, focus) if not body.get("quiet") else body
        now = time.time()
        selected = [line for line in dict.fromkeys(lines) if line in set(LINE_NAMES.values())][:5]
        if not selected:
            return {"ok": True, "mode": "viewport", "fetchedAt": datetime.now(timezone.utc).isoformat(), "trainCount": 0, "cacheSeconds": self.config.cache_seconds, "quota": self.quota_view(), "lines": [], "trains": []}
        with self.lock:
            # Keep a continuously open viewport within roughly 960 upstream calls/day:
            # one line refreshes every 90s, two every 180s, ... five every 450s.
            ttl = self.config.focused_cache_seconds if focused and len(selected) == 1 else self.config.cache_seconds * len(selected)
            warnings, trains, fetched = [], [], []
            for line in selected:
                cached = self.line_cache.get(line)
                if cached is None or now - cached[0] >= ttl:
                    try:
                        cached = (now, self.fetch_line(line))
                        self.line_cache[line] = cached
                    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
                        if cached is None:
                            warnings.append(f"{line}: {exc}")
                            continue
                        warnings.append(f"{line}: 이전 자료 표시 중")
                fetched.append(cached[1])
                trains.extend(cached[1]["trains"])
            if not fetched and warnings:
                return {"ok": False, "error": " / ".join(warnings), "trains": []}
            return {"ok": True, "mode": "viewport", "fetchedAt": datetime.now(timezone.utc).isoformat(), "trainCount": len(trains), "cacheSeconds": ttl, "quota": self.quota_view(), "lines": selected, "warnings": warnings, "trains": trains}
