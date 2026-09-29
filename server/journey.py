"""Journey planner: from a place to a place at a time, by walking and the 수도권 subway.

- places: Kakao Local (KAKAO_REST_KEY) turns a query into coordinates (search_places)
- walking: OSRM foot routing on OpenStreetMap (OSRM_URL, default http://127.0.0.1:5000), to and
  from each station's exits (exits.json), so a result names the exit
- riding: stations and line order from the KTDB network (capital-metro.json), stop-to-stop times
  and live direction labels, headways and transfer times from data/journey.json
  (pipeline/build_journey_data.py)
- the first train at a boarding station comes from the live feed when one is on its way; otherwise
  (and for later legs) the wait is half the line's headway at that hour
plan(...) returns the earliest arrival and, when different, the one with fewest transfers.
"""

from __future__ import annotations

import heapq
import json
import math
import os
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
KAKAO_REST_KEY = os.environ.get("KAKAO_REST_KEY", "").strip()
OSRM_URL = os.environ.get("OSRM_URL", "http://127.0.0.1:5000").rstrip("/")
WALK_RADIUS_M = 1600          # stations considered at either end
MAX_STATIONS = 6
TRANSFER_PENALTY = 8 * 60     # "fewest transfers" plan: each change weighs as 8 extra minutes
TIE_PENALTY = 60              # fastest plan: of two equally quick, the one with fewer changes
REALTIME_HORIZON = 45 * 60    # use the live feed for boardings up to this far ahead

_metro = json.loads((ROOT / "data/ktdb-gtfs-2025/capital-metro.json").read_text(encoding="utf-8"))
_data = json.loads((ROOT / "data/journey.json").read_text(encoding="utf-8"))
_timing = json.loads((ROOT / "data/live-timing.json").read_text(encoding="utf-8"))
_exits = json.loads((ROOT / "data/osm-tracks/exits.json").read_text(encoding="utf-8"))
STATIONS = {n["id"]: n for n in _metro["nodes"]}
ADJ: dict[str, dict[int, set[int]]] = defaultdict(lambda: defaultdict(set))
for key in _data["hops"]:
    line, a, b = key.split("|")
    ADJ[line][int(a)].add(int(b))


def _key(name: str) -> str:
    import re
    name = re.sub(r"\([^)]*\)", "", name or "")
    return re.sub(r"(종착|지선|역)$", "", name).replace(" ", "").lower()


BY_NAME = {(line, _key(n["name"])): n["id"] for n in _metro["nodes"] for line in n["lines"]}


def _hop(line: str, a: int, b: int) -> int | None:
    return _data["hops"].get(f"{line}|{a}|{b}")


def _label(line: str, a: int, b: int) -> str | None:
    return _data["dirs"].get(f"{line}|{a}|{b}")


def _headway(line: str, label: str | None, t: datetime) -> int | None:
    """Median gap between trains at that hour; None when the samples show no service then
    (after the last train, before the first) for a line observed most of the day."""
    h = _data["headway"].get(f"{line}|{label}") or {}
    if str(t.hour) in h:
        return h[str(t.hour)]
    if len(h) - 1 >= 12:   # well observed ("*" plus 12+ hours) and nothing at this hour
        return None
    return h.get("*") or 480


def _stand(line: str) -> int:
    tm = {**_timing["default"], **_timing["lines"].get(line, {})}
    return max(15, tm["zone"] - 10)


def _meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lon1), (lat2, lon2) = a, b
    x = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    return 6371000 * math.hypot(x, math.radians(lat2 - lat1))


# ---- places --------------------------------------------------------------------------------

def search_places(query: str, near: tuple[float, float] | None = None) -> list[dict]:
    """Kakao keyword search, then address search: [{name, address, lat, lng}]."""
    if not KAKAO_REST_KEY:
        raise RuntimeError("KAKAO_REST_KEY 가 설정되지 않았어요")
    out = []
    for kind in ("keyword", "address"):
        params = {"query": query, "size": 8}
        if near and kind == "keyword":
            params.update(y=near[0], x=near[1], sort="accuracy")
        req = urllib.request.Request(f"https://dapi.kakao.com/v2/local/search/{kind}.json?{urllib.parse.urlencode(params)}",
                                     headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"})
        with urllib.request.urlopen(req, timeout=8) as r:
            docs = json.load(r).get("documents") or []
        for d in docs:
            out.append({"name": d.get("place_name") or d.get("address_name"),
                        "address": d.get("road_address_name") or d.get("address_name") or "",
                        "lat": float(d["y"]), "lng": float(d["x"])})
        if out:
            break
    return out


# ---- walking -------------------------------------------------------------------------------

def _points(sid: int) -> list[tuple[float, float, str]]:
    """Where a station is entered: its exits (lat, lng, ref), else its centre."""
    ex = _exits.get(str(sid)) or []
    if ex:
        return [(e[1], e[0], str(e[2] or "")) for e in ex]
    s = STATIONS[sid]
    return [(s["lat"], s["lon"], "")]


def _near_stations(p: tuple[float, float]) -> list[int]:
    d = sorted((_meters(p, (s["lat"], s["lon"])), sid) for sid, s in STATIONS.items())
    near = [sid for m, sid in d if m <= WALK_RADIUS_M][:MAX_STATIONS]
    return near or [sid for _, sid in d[:2]]


def _walk_table(origin: tuple[float, float], sids: list[int], reverse: bool = False) -> dict[int, tuple[int, int, str]]:
    """Walking seconds between a place and each station's best exit: {sid: (seconds, metres, exit)}."""
    pts = [(sid, p) for sid in sids for p in _points(sid)]
    coords = [f"{origin[1]:.6f},{origin[0]:.6f}"] + [f"{p[1]:.6f},{p[0]:.6f}" for _, p in pts]
    q = ("sources=" + ";".join(str(i) for i in range(1, len(coords))) + "&destinations=0") if reverse else \
        ("sources=0&destinations=" + ";".join(str(i) for i in range(1, len(coords))))
    url = f"{OSRM_URL}/table/v1/foot/{';'.join(coords)}?{q}&annotations=duration,distance"
    try:
        with urllib.request.urlopen(url, timeout=6) as r:
            res = json.load(r)
        dur = [row[0] for row in res["durations"]] if reverse else res["durations"][0]
        dist = [row[0] for row in res["distances"]] if reverse else res["distances"][0]
    except (OSError, ValueError, KeyError):
        # no router: straight line × 1.3 at 1.2 m/s
        dist = [_meters(origin, p[:2]) * 1.3 for _, p in pts]
        dur = [m / 1.2 for m in dist]
    best: dict[int, tuple[int, int, str]] = {}
    for (sid, p), s, m in zip(pts, dur, dist):
        if s is not None and (sid not in best or s < best[sid][0]):
            best[sid] = (round(s), round(m or 0), p[2])
    return best


# ---- live trains ---------------------------------------------------------------------------

def _event_time(t: dict) -> datetime | None:
    try:
        return datetime.strptime(str(t.get("receivedAt")), "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
    except ValueError:
        return None


def _next_live(live: dict, line: str, at: int, toward: int, after: datetime) -> tuple[datetime, dict] | None:
    """The first live train on `line` leaving station `at` toward `toward` no earlier than `after`."""
    label = _label(line, at, toward)
    if not label:
        return None
    # stations upstream of `at` in this direction, with the seconds from leaving each to leaving `at`
    up, frontier = {at: 0}, [at]
    while frontier:
        nxt = []
        for b in frontier:
            for a in ADJ[line][b]:
                if a not in up and _label(line, a, b) == label and (h := _hop(line, a, b)):
                    up[a] = up[b] + h
                    nxt.append(a)
        frontier = nxt
    best = None
    for t in live.get(line) or []:
        if t.get("direction") != label:
            continue
        x, ev = BY_NAME.get((line, _key(t.get("station", "")))), _event_time(t)
        if x not in up or ev is None:
            continue
        status = str(t.get("status", "")).replace(" ", "")
        leave_x = ev + timedelta(seconds={"도착": _stand(line), "진입": 25 + _stand(line)}.get(status, 0))
        if x == at and status == "출발":
            continue   # already gone
        end = BY_NAME.get((line, _key(t.get("destination", ""))))
        if end in up and up[end] < up[x]:
            continue   # it terminates before reaching `at`
        dep = leave_x + timedelta(seconds=up[x])
        if dep >= after and (best is None or dep < best[0]):
            best = (dep, t)
    return best


# ---- search --------------------------------------------------------------------------------

def _search(t0: datetime, start: dict[int, tuple[int, int, str]], goal: dict[int, tuple[int, int, str]],
            live: dict, penalty: int) -> list[dict] | None:
    """Dijkstra over (station) and (line, from, to) riding states; cost = arrival time + penalties."""
    heap, best, back = [], {}, {}
    for sid, (walk, m, ex) in start.items():
        s = ("at", sid)
        t = t0 + timedelta(seconds=walk)
        best[s] = (t.timestamp(), t)
        back[s] = ("walk", None, {"seconds": walk, "metres": m, "exit": ex, "station": sid})
        heapq.heappush(heap, (t.timestamp(), 0, s))
    finish = None
    while heap:
        cost, changes, s = heapq.heappop(heap)
        if best.get(s, (math.inf,))[0] < cost:
            continue
        t = best[s][1]
        if s == ("goal",):
            finish = s
            break
        if s[0] == "at":
            sid = s[1]
            if sid in goal:
                g = t + timedelta(seconds=goal[sid][0])
                c = cost + goal[sid][0]
                if c < best.get(("goal",), (math.inf,))[0]:
                    best[("goal",)] = (c, g)
                    back[("goal",)] = ("walk", s, {"seconds": goal[sid][0], "metres": goal[sid][1], "exit": goal[sid][2], "station": sid})
                    heapq.heappush(heap, (c, changes, ("goal",)))
            first = back[s][0] == "walk"
            for line in STATIONS[sid]["lines"]:
                for b in ADJ[line][sid]:
                    hop = _hop(line, sid, b)
                    if not hop:
                        continue
                    ready = t if first else t + timedelta(seconds=_data["transfer"].get(str(sid), _data["defaultTransfer"]))
                    lv = _next_live(live, line, sid, b, ready) if (ready - t0).total_seconds() < REALTIME_HORIZON else None
                    if lv:
                        dep, train = lv
                    else:
                        gap = _headway(line, _label(line, sid, b), ready)
                        if gap is None:
                            continue   # no trains at that hour
                        dep, train = ready + timedelta(seconds=gap / 2), None
                    arr = dep + timedelta(seconds=hop)
                    end = BY_NAME.get((line, _key(train.get("destination", "")))) if train else None
                    if end == sid:
                        continue
                    ns = (line, sid, b, end)
                    c = cost + (arr - t).total_seconds() + (0 if first else penalty)
                    if c < best.get(ns, (math.inf,))[0]:
                        best[ns] = (c, arr)
                        back[ns] = ("board", s, {"line": line, "at": sid, "departs": dep, "train": train, "ready": ready})
                        heapq.heappush(heap, (c, changes + (0 if first else 1), ns))
        else:
            line, a, b, end = s
            # get off at b
            off = ("at", b)
            if cost < best.get(off, (math.inf,))[0]:
                best[off] = (cost, t)
                back[off] = ("alight", s, {})
                heapq.heappush(heap, (cost, changes, off))
            # ride on, same direction; a live train goes no further than its destination
            label = _label(line, a, b)
            for c_ in (ADJ[line][b] if b != end else ()):
                if c_ == a or (label and _label(line, b, c_) not in (label, None)):
                    continue
                hop = _hop(line, b, c_)
                if not hop:
                    continue
                ns, arr = (line, b, c_, end), t + timedelta(seconds=hop)
                c = cost + hop
                if c < best.get(ns, (math.inf,))[0]:
                    best[ns] = (c, arr)
                    back[ns] = ("ride", s, {})
                    heapq.heappush(heap, (c, changes, ns))
    if not finish:
        return None
    # unwind into legs
    path, s = [], finish
    while s is not None:
        kind, prev, info = back[s]
        path.append((kind, s, info))
        s = prev
    path.reverse()
    legs, i = [], 0
    for kind, s, info in path:
        if kind == "walk":   # to a station's exit at the start, from one at the end
            legs.append({"type": "walk", "seconds": info["seconds"], "metres": info["metres"], "exit": info["exit"],
                         ("from" if s == ("goal",) else "to"): STATIONS[info["station"]]["name"]})
        elif kind == "board":
            train = info["train"]
            legs.append({"type": "ride", "line": s[0], "from": STATIONS[info["at"]]["name"], "departs": info["departs"].strftime("%H:%M"),
                         "direction": _label(s[0], s[1], s[2]), "stops": 1, "realtime": bool(train),
                         "trainNo": train.get("trainNo") if train else None,
                         "destination": (train.get("destination") if train else None),
                         "trainNow": f"{train.get('station')} {train.get('status')}" if train else None,
                         "wait": round((info["departs"] - info["ready"]).total_seconds())})
        elif kind == "ride":
            legs[-1]["stops"] += 1
        elif kind == "alight":
            legs[-1]["to"] = STATIONS[s[1]]["name"]   # s is ("at", station) here
            legs[-1]["arrives"] = best[s][1].strftime("%H:%M")
    return legs


def plan(origin: tuple[float, float], dest: tuple[float, float], when: datetime, live: dict) -> dict:
    start = _walk_table(origin, _near_stations(origin))
    goal = _walk_table(dest, _near_stations(dest), reverse=True)
    walk_only = _meters(origin, dest)
    fastest = _search(when, start, goal, live, TIE_PENALTY)
    fewest = _search(when, start, goal, live, TRANSFER_PENALTY)

    def summary(legs):
        if not legs:
            return None
        total = sum(l["seconds"] for l in legs if l["type"] == "walk")
        rides = [l for l in legs if l["type"] == "ride"]
        end = datetime.strptime(rides[-1]["arrives"], "%H:%M").replace(year=when.year, month=when.month, day=when.day, tzinfo=KST) if rides else when
        if rides and end < when - timedelta(hours=12):
            end += timedelta(days=1)
        arrive = end + timedelta(seconds=legs[-1]["seconds"] if legs[-1]["type"] == "walk" else 0)
        leave = datetime.strptime(rides[0]["departs"], "%H:%M").replace(year=when.year, month=when.month, day=when.day, tzinfo=KST) - timedelta(seconds=legs[0]["seconds"]) if rides else when
        return {"arrives": arrive.strftime("%H:%M"), "leaveBy": leave.strftime("%H:%M"),
                "minutes": round((arrive - when).total_seconds() / 60), "transfers": max(0, len(rides) - 1),
                "walkMinutes": round(total / 60), "legs": legs}

    plans = [p for p in (summary(fastest), summary(fewest)) if p]
    if len(plans) == 2 and plans[0]["legs"] == plans[1]["legs"]:
        plans = plans[:1]
    out = {"ok": bool(plans), "at": when.strftime("%Y-%m-%d %H:%M"), "straightMetres": round(walk_only), "plans": plans}
    if not plans:
        out["error"] = "이 시각에는 다니는 열차가 없거나, 가까운 역에서 이어지는 경로를 찾지 못했어요."
    return out
