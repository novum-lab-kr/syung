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

import bisect
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
TIE_PENALTY = 3 * 60          # fastest plan: a change must save 3 minutes to be worth it
REALTIME_HORIZON = 45 * 60    # use the live feed for boardings up to this far ahead
BUS_RADIUS_M = 600            # bus stops considered at either end
MAX_BUS_STOPS = 24
STATION_BUS_M = 250           # bus stops this close to a station exit are a transfer
STATION_ACCESS = 90           # extra seconds to get between street and platform
WALK_DETOUR, WALK_SPEED = 1.3, 1.2   # straight line × detour at m/s, for short transfer walks
MAX_TRIP = 4 * 3600
BUS_COLORS = {"trunk": "#3d5bab", "branch": "#5bb025", "express": "#e60012", "circular": "#f2b70a",
              "maeul": "#7bc043", "night": "#4a4f8c"}

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


# ---- buses (data/bus.json, pipeline/build_bus_data.py; optional) ---------------------------

_bus_file = ROOT / "data/bus.json"
BUS = json.loads(_bus_file.read_text(encoding="utf-8")) if _bus_file.exists() else None
BSTOPS = BUS["stops"] if BUS else []
BROUTES = BUS["routes"] if BUS else []
BPATS = BUS["patterns"] if BUS else []
BUS_WALK = BUS["walk"] if BUS else []
BUS_AT: dict[int, list[tuple[int, int]]] = defaultdict(list)   # stop → [(pattern, position)]
_bgrid: dict[tuple[int, int], list[int]] = defaultdict(list)
for _pi, _p in enumerate(BPATS):
    _p["starts"] = [d[0] for d in _p["d"]]
    for _k, _s in enumerate(_p["s"][:-1]):
        BUS_AT[_s].append((_pi, _k))
for _i, (_, _la, _lo) in enumerate(BSTOPS):
    _bgrid[(int(_la / 0.0027), int(_lo / 0.0034))].append(_i)


def _stops_near(p: tuple[float, float], radius: float) -> list[tuple[float, int]]:
    r = int(radius / 300) + 1
    cy, cx = int(p[0] / 0.0027), int(p[1] / 0.0034)
    out = []
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            for i in _bgrid.get((cy + dy, cx + dx), ()):
                m = _meters(p, (BSTOPS[i][1], BSTOPS[i][2]))
                if m <= radius:
                    out.append((m, i))
    return sorted(out)


def _walk_sec(m: float) -> int:
    return round(m * WALK_DETOUR / WALK_SPEED)


def _bus_next(p: dict, k: int, ready: float) -> tuple[int, float, float] | None:
    """The first trip of pattern p leaving its k-th stop at or after `ready` (seconds from the query
    day's midnight; GTFS times run past 24:00): (trip start, scale, departure)."""
    tk, found = p["t"][k], None
    for shift in (0, 86400):   # today's trips, and yesterday's still running after midnight
        r = ready + shift
        starts = p["starts"]
        i = bisect.bisect_left(starts, r - tk * 1.6)
        for st, scale in p["d"][i:i + 20]:
            dep = st + tk * scale
            if dep >= r and (found is None or dep - shift < found[2]):
                found = (st - shift, scale, dep - shift)
            if st > r:
                break
    return found


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


def _near_nodes(p: tuple[float, float]) -> list[tuple]:
    """Stations and bus stops to walk to or from: [("at", sid) | ("bs", stop)]."""
    return [("at", sid) for sid in _near_stations(p)] + \
           [("bs", i) for _, i in _stops_near(p, BUS_RADIUS_M)[:MAX_BUS_STOPS]]


# stations ↔ bus stops close to one of their exits: sid → [(stop, metres, (lat, lng) of that exit)]
STATION_BUS: dict[int, list] = defaultdict(list)
BUS_STATION: dict[int, list] = defaultdict(list)
for _sid in STATIONS:
    _best: dict[int, tuple] = {}
    for _lat, _lng, _ in _points(_sid):
        for _m, _i in _stops_near((_lat, _lng), STATION_BUS_M):
            if _i not in _best or _m < _best[_i][0]:
                _best[_i] = (_m, (_lat, _lng))
    for _i, (_m, _pt) in _best.items():
        STATION_BUS[_sid].append((_i, _m, _pt))
        BUS_STATION[_i].append((_sid, _m, _pt))


def _walk_table(origin: tuple[float, float], nodes: list[tuple], reverse: bool = False) -> dict[tuple, tuple]:
    """Walking seconds between a place and each node (a station's best exit, or a bus stop):
    {node: (seconds, metres, exit, lat, lng)}."""
    pts = [(n, p) for n in nodes for p in (_points(n[1]) if n[0] == "at" else [(BSTOPS[n[1]][1], BSTOPS[n[1]][2], "")])]
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
        dist = [_meters(origin, p[:2]) * WALK_DETOUR for _, p in pts]
        dur = [m / WALK_SPEED for m in dist]
    best: dict[tuple, tuple] = {}
    for (n, p), s, m in zip(pts, dur, dist):
        if s is not None and (n not in best or s < best[n][0]):
            best[n] = (round(s), round(m or 0), p[2], p[0], p[1])
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

def walk_path(a: tuple[float, float], b: tuple[float, float]) -> tuple[list, int, int]:
    """OSRM foot route a→b: ([[lng, lat], ...], seconds, metres); a straight line when unavailable."""
    try:
        url = f"{OSRM_URL}/route/v1/foot/{a[1]:.6f},{a[0]:.6f};{b[1]:.6f},{b[0]:.6f}?overview=full&geometries=geojson"
        with urllib.request.urlopen(url, timeout=6) as r:
            route = json.load(r)["routes"][0]
        return route["geometry"]["coordinates"], round(route["duration"]), round(route["distance"])
    except (OSError, ValueError, KeyError, IndexError):
        m = _meters(a, b) * 1.3
        return [[a[1], a[0]], [b[1], b[0]]], round(m / 1.2), round(m)


def _fmt(ts: float) -> str:
    return datetime.fromtimestamp(ts, KST).strftime("%H:%M")


def _node_name(n: tuple) -> str:
    return STATIONS[n[1]]["name"] if n[0] == "at" else BSTOPS[n[1]][0]


def _search(t0: datetime, start: dict[tuple, tuple], goal: dict[tuple, tuple], live: dict, penalty: int,
            banned: frozenset = frozenset(), modes: frozenset = frozenset({"subway", "bus"})) -> dict | None:
    """Dijkstra over stations ("at", sid), bus stops ("bs", stop) and subway riding states
    (line, from, to, end); cost = arrival time (epoch seconds) + a penalty per boarding after the first.
    ("at"/"bs", id) is getting off there; ("at"/"bs", id, "w") is arriving on foot, which may board
    but neither walks on (no chains of walks) nor ends the trip."""
    T0 = t0.timestamp()
    day0 = t0.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    heap, best, back, tick = [], {}, {}, [0]
    bbest = [math.inf] * len(BSTOPS)   # best cost per bus stop, to turn down most bus pushes cheaply

    def push(s, c, t, info, ch):
        if c < best.get(s, (math.inf,))[0]:
            best[s] = (c, t)
            if len(s) == 2 and s[0] == "bs":
                bbest[s[1]] = c
            back[s] = info
            tick[0] += 1
            heapq.heappush(heap, (c, ch, tick[0], s))

    for node, w in start.items():
        if node[0] == "bs" and "bus" not in modes or node[0] == "at" and "subway" not in modes:
            continue
        push((*node, "w"), T0 + w[0], T0 + w[0], ("start", None, {"w": w}), 0)
    finish = False
    while heap:
        cost, changes, _, s = heapq.heappop(heap)
        if best[s][0] < cost:
            continue
        t = best[s][1]
        if s == ("goal",):
            finish = True
            break
        if cost - T0 > MAX_TRIP:
            break
        kind = back[s][0]
        if kind in ("alight", "bus") and s in goal:   # walk to the goal straight off a train or bus
            g = goal[s]
            push(("goal",), cost + g[0], t + g[0], ("end", s, {"w": g}), changes)
        if s[0] == "at":
            sid = s[1]
            if "subway" in modes:
                for line in STATIONS[sid]["lines"]:
                    if (line, sid) in banned or (line,) in banned:
                        continue
                    ready = t + (_data["transfer"].get(str(sid), _data["defaultTransfer"]) if kind == "alight" else 0)
                    pen = 0 if kind == "start" else penalty
                    ready_dt = datetime.fromtimestamp(ready, KST)
                    for b in ADJ[line][sid]:
                        hop = _hop(line, sid, b)
                        if not hop:
                            continue
                        lv = _next_live(live, line, sid, b, ready_dt) if ready - T0 < REALTIME_HORIZON else None
                        if lv:
                            dep, train = lv[0].timestamp(), lv[1]
                        else:
                            gap = _headway(line, _label(line, sid, b), ready_dt)
                            if gap is None:
                                continue   # no trains at that hour
                            dep, train = ready + gap / 2, None
                        end = BY_NAME.get((line, _key(train.get("destination", "")))) if train else None
                        if end == sid:
                            continue
                        arr = dep + hop
                        push((line, sid, b, end), cost + (arr - t) + pen, arr,
                             ("board", s, {"departs": dep, "train": train, "ready": ready}), changes + (kind != "start"))
            if kind == "alight" and "bus" in modes:
                for stop, m, pt in STATION_BUS.get(sid, ()):
                    w = _walk_sec(m) + STATION_ACCESS
                    push(("bs", stop, "w"), cost + w, t + w, ("walk", s, {"seconds": w, "metres": round(m * WALK_DETOUR), "a": pt,
                                                                     "b": (BSTOPS[stop][1], BSTOPS[stop][2])}), changes)
        elif s[0] == "bs":
            stop = s[1]
            if "bus" in modes:
                pen = 0 if kind == "start" else penalty
                for pi, k in BUS_AT.get(stop, ()):
                    p = BPATS[pi]
                    if ("bus", p["r"]) in banned or ("bus", p["r"], stop) in banned:
                        continue
                    nxt = _bus_next(p, k, t - day0)
                    if not nxt:
                        continue
                    st, scale, dep = nxt
                    base, extra, ps, pt = day0 + st, cost - t + pen, p["s"], p["t"]
                    for j in range(k + 1, len(ps)):
                        arr = base + pt[j] * scale
                        if arr + extra < bbest[ps[j]]:
                            push(("bs", ps[j]), arr + extra, arr,
                                 ("bus", s, {"p": pi, "k": k, "j": j, "departs": day0 + dep, "ready": t}), changes + (kind != "start"))
            if kind == "bus":
                for j, m in BUS_WALK[stop]:
                    w = _walk_sec(m)
                    push(("bs", j, "w"), cost + w, t + w, ("walk", s, {"seconds": w, "metres": round(m * WALK_DETOUR),
                         "a": (BSTOPS[stop][1], BSTOPS[stop][2]), "b": (BSTOPS[j][1], BSTOPS[j][2])}), changes)
                if "subway" in modes:
                    for sid, m, pt in BUS_STATION.get(stop, ()):
                        w = _walk_sec(m) + STATION_ACCESS
                        push(("at", sid, "w"), cost + w, t + w, ("walk", s, {"seconds": w, "metres": round(m * WALK_DETOUR),
                             "a": (BSTOPS[stop][1], BSTOPS[stop][2]), "b": pt}), changes)
        else:
            line, a, b, end = s
            push(("at", b), cost, t, ("alight", s, {}), changes)
            # ride on, same direction; a live train goes no further than its destination
            label = _label(line, a, b)
            for c_ in (ADJ[line][b] if b != end else ()):
                if c_ == a or (label and _label(line, b, c_) not in (label, None)):
                    continue
                hop = _hop(line, b, c_)
                if hop:
                    push((line, b, c_, end), cost + hop, t + hop, ("ride", s, {}), changes)
    if not finish:
        return None

    path, s = [], ("goal",)
    while s is not None:
        kind, prev, info = back[s]
        path.append((kind, s, info))
        s = prev
    path.reverse()
    legs = []
    for kind, s, info in path:
        if kind == "start":
            sec_, m, ex, lat, lng = info["w"]
            name = _node_name(s)
            legs.append({"type": "walk", "seconds": sec_, "metres": m, "exit": ex, "to": name, "point": (lat, lng),
                         "label": f"{name}역{f' {ex}번 출구' if ex else ''}까지" if s[0] == "at" else f"{name} 정류장까지"})
        elif kind == "end":
            sec_, m, ex, lat, lng = info["w"]
            node = back[s][1]
            name = _node_name(node)
            legs.append({"type": "walk", "seconds": sec_, "metres": m, "exit": ex, "from": name, "point": (lat, lng),
                         "label": f"{name}역{f' {ex}번 출구' if ex else ''}에서 목적지까지" if node[0] == "at" else f"{name} 정류장에서 목적지까지"})
        elif kind == "walk":
            prev = back[s][1]
            legs.append({"type": "walk", "seconds": info["seconds"], "metres": info["metres"], "exit": "",
                         "label": f"{_node_name(prev)}{'역' if prev[0] == 'at' else ' 정류장'}에서 {_node_name(s)}{'역' if s[0] == 'at' else ' 정류장'}으로",
                         "a": info["a"], "b": info["b"]})
        elif kind == "board":
            train = info["train"]
            legs.append({"type": "ride", "line": s[0], "from": STATIONS[s[1]]["name"], "departs": _fmt(info["departs"]),
                         "direction": _label(s[0], s[1], s[2]), "stops": 1, "realtime": bool(train),
                         "trainNo": train.get("trainNo") if train else None,
                         "destination": (train.get("destination") if train else None),
                         "trainNow": f"{train.get('station')} {train.get('status')}" if train else None,
                         "wait": round(info["departs"] - info["ready"]), "stations": [s[1], s[2]],
                         "_dep": info["departs"], "_ban": [(s[0], s[1]), (s[0],)]})
        elif kind == "ride":
            legs[-1]["stops"] += 1
            legs[-1]["stations"].append(s[2])
        elif kind == "alight":
            legs[-1]["to"] = STATIONS[s[1]]["name"]   # s is ("at", station) here
            legs[-1]["arrives"] = _fmt(best[s][1])
        elif kind == "bus":
            p = BPATS[info["p"]]
            route, rkind = BROUTES[p["r"]]
            ids = p["s"][info["k"]:info["j"] + 1]
            legs.append({"type": "bus", "route": route, "kind": rkind, "color": BUS_COLORS.get(rkind, "#3d5bab"),
                         "from": BSTOPS[ids[0]][0], "to": BSTOPS[ids[-1]][0], "departs": _fmt(info["departs"]),
                         "arrives": _fmt(best[s][1]), "stops": len(ids) - 1, "wait": round(info["departs"] - info["ready"]),
                         "realtime": False, "toward": BSTOPS[p["s"][-1]][0],
                         "path": [[BSTOPS[i][2], BSTOPS[i][1]] for i in ids],
                         "_dep": info["departs"], "_ban": [("bus", p["r"], ids[0]), ("bus", p["r"])]})
    transit = [l for l in legs if l["type"] != "walk"]
    leave = transit[0]["_dep"] - (legs[0]["seconds"] if legs[0]["type"] == "walk" else 0) if transit else T0
    return {"legs": legs, "leave": max(T0, leave), "arrive": best[("goal",)][1]}


def _signature(r: dict) -> tuple:
    return tuple((l.get("line") or l.get("route"), l["from"], l["to"]) for l in r["legs"] if l["type"] != "walk")


def plan(origin: tuple[float, float], dest: tuple[float, float], when: datetime, live: dict) -> dict:
    start = _walk_table(origin, _near_nodes(origin))
    goal = _walk_table(dest, _near_nodes(dest), reverse=True)
    straight = _meters(origin, dest)
    both, subway, bus = frozenset({"subway", "bus"}), frozenset({"subway"}), frozenset({"bus"})

    found: list[tuple[str, dict]] = []
    def add(tag: str, r: dict | None) -> None:
        if r and all(_signature(r) != _signature(f) for _, f in found):
            found.append((tag, r))
    fastest = _search(when, start, goal, live, TIE_PENALTY)
    add("가장 빠른 길", fastest)
    add("환승 적은 길", _search(when, start, goal, live, TRANSFER_PENALTY))
    if BUS:
        add("지하철만", _search(when, start, goal, live, TIE_PENALTY, modes=subway))
        add("버스만", _search(when, start, goal, live, TIE_PENALTY, modes=bus))
    if fastest:
        transit = [l for l in fastest["legs"] if l["type"] != "walk"]
        # other ways: not boarding where the fastest one first boards; nor its first line (or bus) anywhere
        add("다른 길", _search(when, start, goal, live, TIE_PENALTY, frozenset({transit[0]["_ban"][0]})))
        add("다른 노선", _search(when, start, goal, live, TIE_PENALTY, frozenset({transit[0]["_ban"][1]})))

    plans = []
    for tag, r in found:
        legs = r["legs"]
        for l in legs:
            if l["type"] == "walk":   # walking geometry
                a, b = (l.pop("a"), l.pop("b")) if "a" in l else (origin, l["point"]) if "to" in l else (l["point"], dest)
                l["path"], _, _ = walk_path(a, b)
                l.pop("point", None)
            else:
                l.pop("_dep"), l.pop("_ban")
        transit = [l for l in legs if l["type"] != "walk"]
        plans.append({"tag": tag, "leaveBy": _fmt(r["leave"]), "arrives": _fmt(r["arrive"]),
                      "minutes": round((r["arrive"] - when.timestamp()) / 60), "transfers": max(0, len(transit) - 1),
                      "walkMinutes": round(sum(l["seconds"] for l in legs if l["type"] == "walk") / 60), "legs": legs,
                      "_arrive": r["arrive"]})
    if straight < 2500:   # close enough to just walk
        path, sec, metres = walk_path(origin, dest)
        if not plans or sec <= min(p["_arrive"] for p in plans) - when.timestamp() + 10 * 60:
            arrive = when.timestamp() + sec
            plans.append({"tag": "걸어가기", "leaveBy": when.strftime("%H:%M"), "arrives": _fmt(arrive),
                          "minutes": round(sec / 60), "transfers": 0, "walkMinutes": round(sec / 60), "_arrive": arrive,
                          "legs": [{"type": "walk", "seconds": sec, "metres": metres, "exit": "", "direct": True,
                                    "label": "목적지까지 걸어서", "path": path}]})
    walk_only = [p["_arrive"] for p in plans if p["tag"] == "걸어가기"]
    if walk_only:   # riding that gets there later than walking is no use
        plans = [p for p in plans if p["tag"] == "걸어가기" or p["_arrive"] < walk_only[0]]
    plans.sort(key=lambda p: p["_arrive"])
    plans = plans[:6]
    for p in plans:
        del p["_arrive"]
    out = {"ok": bool(plans), "at": when.strftime("%Y-%m-%d %H:%M"), "straightMetres": round(straight), "plans": plans}
    if not plans:
        out["error"] = "이 시각에는 다니는 열차·버스가 없거나, 가까운 역·정류장에서 이어지는 경로를 찾지 못했어요."
    return out
