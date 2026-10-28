"""Journey planner: from a place to a place at a time, by walking and the 수도권 subway.

- walking: OSRM foot routing on OpenStreetMap (OSRM_URL, default http://127.0.0.1:5000), to and
  from each station's exits (exits.json), so a result names the exit
- riding: stations and line order from the KTDB network (capital-metro.json), stop-to-stop times
  and live direction labels, headways and transfer times from data/journey.json
  (pipeline/build_journey_data.py)
- the first train at a boarding station comes from the live feed when one is on its way; otherwise
  (and for later legs) the wait is half the line's headway at that hour
plan(...) returns the earliest arrival and, when different, the one with fewest transfers.

탐색 자료는 이 모듈을 import 할 때 한 번 읽는 읽기 전용 자료다(파일은 store/journey_data.py, 걷기는 sources/osrm.py).
탐색 일꾼 풀 · 실시간 열차 붙이기는 services/journey.py 의 JourneyPlanner 가 맡는다(장소 검색은 services/places.py).
"""

from __future__ import annotations

import bisect
import heapq
import math
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, cast

from server.clock import KST
from server.config import JourneyConfig
from server.sources.osrm import OsrmSource
from server.store import journey_data

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable

    Row = dict[str, Any]   # JSON 한 줄(실시간 열차 · 버스 패턴 · 구간 · 결과)
    Pt = tuple[float, float]   # (lat, lng)
    Node = tuple[Any, ...]   # 탐색 상태 — ("at", 역) · ("bs", 정류장[, "w"]) · (노선, 출발, 다음, 종점) · ("goal",)
    Walk = tuple[int, int, str, float, float]   # 걷기 (초, 미터, 출구, lat, lng)
    Live = dict[str, list[Row]]   # 노선 → 실시간 열차(SubwayLiveService.all_lines)
    Job = tuple[Any, ...]   # _search 인자 한 벌(일꾼에 피클로 보낸다)

OSRM = OsrmSource(JourneyConfig.from_env().osrm_url)
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
ASTAR_SPEED = 35.0            # m/s
MAX_PLANS = 12                # routes shown
ROUTE_SLACK = 60 * 60         # at most this much later than the fastest
MAX_SEARCHES, SEARCH_SECONDS = 24, 4.0
DOMINATED_LATE = 35 * 60      # a way no better in changes and walking is kept if within this
BUS_COLORS = {"trunk": "#3d5bab", "branch": "#5bb025", "express": "#e60012", "circular": "#f2b70a",
              "maeul": "#7bc043", "night": "#4a4f8c"}

_metro = journey_data.read(journey_data.METRO)
_data = journey_data.read(journey_data.JOURNEY)
_timing = journey_data.read(journey_data.TIMING)
_exits = journey_data.read(journey_data.EXITS)
STATIONS = {n["id"]: n for n in _metro["nodes"]}
ADJ: dict[str, dict[int, set[int]]] = defaultdict(lambda: defaultdict(set))
for key in _data["hops"]:
    line, a, b = key.split("|")
    ADJ[line][int(a)].add(int(b))


# Stations renamed after the GTFS snapshot (GTFS name → current name), as in web/lib/routing.mjs.
NEW_NAMES = {"당고개": "불암산", "초성리": "청산", "뚝섬유원지": "자양", "총신대입구": "이수", "화전": "한국항공대",
             "운동장·송담대": "용인중앙시장", "서구청": "서해구청"}
_OLD = {v: k for k, v in NEW_NAMES.items()}


def _key(name: str) -> str:
    import re
    name = re.sub(r"\([^)]*\)", "", name or "")
    name = re.sub(r"(종착|지선|역)$", "", name).replace(" ", "").lower()
    return _OLD.get(name, name)


for _n in STATIONS.values():   # riders see the current name
    _n["name"] = NEW_NAMES.get(_n["name"], _n["name"])


BY_NAME = {(line, _key(n["name"])): n["id"] for n in _metro["nodes"] for line in n["lines"]}


# ---- buses (data/bus.json, pipeline/build_bus_data.py; optional) ---------------------------

BUS = journey_data.read_optional(journey_data.BUS)
BSTOPS = BUS["stops"] if BUS else cast("list[Any]", [])
BROUTES = BUS["routes"] if BUS else cast("list[Any]", [])
BPATS = BUS["patterns"] if BUS else cast("list[Any]", [])
BUS_WALK = BUS["walk"] if BUS else cast("list[Any]", [])
# stops whose KTDB coordinates are rounded, put on their OSM stop (pipeline/fix_bus_stops.py)
for _i, (_la, _lo) in (journey_data.read_optional(journey_data.BUS_STOP_FIX, {}).items() if BUS else ()):
    if int(_i) < len(BSTOPS):
        BSTOPS[int(_i)] = [BSTOPS[int(_i)][0], _la, _lo]
BUS_AT: dict[int, list[tuple[int, int]]] = defaultdict(list)   # stop → [(pattern, position)]
_bgrid: dict[tuple[int, int], list[int]] = defaultdict(list)
for _pi, _p in enumerate(BPATS):
    _p["starts"] = [d[0] for d in _p["d"]]
    for _k, _s in enumerate(_p["s"][:-1]):
        BUS_AT[_s].append((_pi, _k))
for _i, (_, _la, _lo) in enumerate(BSTOPS):
    _bgrid[(int(_la / 0.0027), int(_lo / 0.0034))].append(_i)


BUS_SHAPES = journey_data.read_optional(journey_data.BUS_SHAPES, {}) if BUS else cast("dict[str, Any]", {})   # pipeline/build_bus_shapes.py; optional


def _decode(s: str) -> list[list[float]]:
    """Polyline (precision 6) → [[lng, lat], ...]."""
    pts, i, lat, lng = cast("list[list[float]]", []), 0, 0, 0
    while i < len(s):
        for which in (0, 1):
            shift = result = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(result >> 1) if result & 1 else result >> 1
            if which == 0:
                lat += d
            else:
                lng += d
        pts.append([lng / 1e6, lat / 1e6])
    return pts


def _bus_path(pi: int, k: int, j: int) -> list[list[float]]:
    """Where the bus goes from its k-th to its j-th stop: along the roads when shaped, else stop to stop.

    Starts and ends at the stops themselves: the shape's own stop points came from matching the
    (often rounded) coordinates onto the road and sat up to ~140 m off (643 at 사당역), so the road
    path is cut where it passes closest to each stop, between its neighbouring stops' points."""
    p, sh = BPATS[pi], BUS_SHAPES.get(str(pi))
    a, b = [BSTOPS[p["s"][k]][2], BSTOPS[p["s"][k]][1]], [BSTOPS[p["s"][j]][2], BSTOPS[p["s"][j]][1]]
    if not (sh and len(sh[1]) == len(p["s"])):
        return [[BSTOPS[i][2], BSTOPS[i][1]] for i in p["s"][k:j + 1]]
    line, at = _decode(sh[0]), sh[1]

    def closest(stop: list[float], lo: int, hi: int) -> int:
        return min(range(lo, hi + 1), key=lambda n: (line[n][0] - stop[0]) ** 2 * 0.63 + (line[n][1] - stop[1]) ** 2)

    s0 = closest(a, at[k - 1] if k else 0, at[k + 1] if k + 1 < len(at) else len(line) - 1)
    s1 = closest(b, max(s0, at[j - 1]), at[j + 1] if j + 1 < len(at) else len(line) - 1)
    return [a, *line[s0:s1 + 1], b]


def _stops_near(p: tuple[float, float], radius: float) -> list[tuple[float, int]]:
    r = int(radius / 300) + 1
    cy, cx = int(p[0] / 0.0027), int(p[1] / 0.0034)
    out: list[tuple[float, int]] = []
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            for i in _bgrid.get((cy + dy, cx + dx), ()):
                m = _meters(p, (BSTOPS[i][1], BSTOPS[i][2]))
                if m <= radius:
                    out.append((m, i))
    return sorted(out)


def _walk_sec(m: float) -> int:
    return round(m * WALK_DETOUR / WALK_SPEED)


def _bus_next(p: Row, k: int, ready: float) -> tuple[int, float, float] | None:
    """The first trip of pattern p leaving its k-th stop at or after `ready` (seconds from the query
    day's midnight; GTFS times run past 24:00): (trip start, scale, departure)."""
    tk, found = p["t"][k], cast("tuple[int, float, float] | None", None)
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
    h: dict[str, int] = _data["headway"].get(f"{line}|{label}") or {}
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


# ---- walking -------------------------------------------------------------------------------

def _points(sid: int) -> list[tuple[float, float, str]]:
    """Where a station is entered: its exits (lat, lng, ref), else its centre."""
    ex: list[Any] = _exits.get(str(sid)) or []
    if ex:
        return [(e[1], e[0], str(e[2] or "")) for e in ex]
    s = STATIONS[sid]
    return [(s["lat"], s["lon"], "")]


def _near_stations(p: tuple[float, float]) -> list[int]:
    d = sorted((_meters(p, (s["lat"], s["lon"])), sid) for sid, s in STATIONS.items())
    near = [sid for m, sid in d if m <= WALK_RADIUS_M][:MAX_STATIONS]
    return near or [sid for _, sid in d[:2]]


def _near_nodes(p: tuple[float, float]) -> list[Node]:
    """Stations and bus stops to walk to or from: [("at", sid) | ("bs", stop)]."""
    return [("at", sid) for sid in _near_stations(p)] + \
           [("bs", i) for _, i in _stops_near(p, BUS_RADIUS_M)[:MAX_BUS_STOPS]]


# stations ↔ bus stops close to one of their exits: sid → [(stop, metres, (lat, lng) of that exit)]
STATION_BUS: dict[int, list[tuple[int, float, Pt]]] = defaultdict(list)
BUS_STATION: dict[int, list[tuple[int, float, Pt]]] = defaultdict(list)
for _sid in STATIONS:
    _best: dict[int, tuple[float, Pt]] = {}
    for _lat, _lng, _ in _points(_sid):
        for _m, _i in _stops_near((_lat, _lng), STATION_BUS_M):
            if _i not in _best or _m < _best[_i][0]:
                _best[_i] = (_m, (_lat, _lng))
    for _i, (_m, _pt) in _best.items():
        STATION_BUS[_sid].append((_i, _m, _pt))
        BUS_STATION[_i].append((_sid, _m, _pt))


def _walk_table(origin: tuple[float, float], nodes: list[Node], reverse: bool = False) -> dict[Node, Walk]:
    """Walking seconds between a place and each node (a station's best exit, or a bus stop):
    {node: (seconds, metres, exit, lat, lng)}."""
    pts = [(n, p) for n in nodes for p in (_points(n[1]) if n[0] == "at" else [(BSTOPS[n[1]][1], BSTOPS[n[1]][2], "")])]
    coords = [f"{origin[1]:.6f},{origin[0]:.6f}"] + [f"{p[1]:.6f},{p[0]:.6f}" for _, p in pts]
    q = ("sources=" + ";".join(str(i) for i in range(1, len(coords))) + "&destinations=0") if reverse else \
        ("sources=0&destinations=" + ";".join(str(i) for i in range(1, len(coords))))
    try:
        res = OSRM.table(coords, q)
        dur = [row[0] for row in res["durations"]] if reverse else res["durations"][0]
        dist = [row[0] for row in res["distances"]] if reverse else res["distances"][0]
    except (OSError, ValueError, KeyError):
        # no router: straight line × 1.3 at 1.2 m/s
        dist = [_meters(origin, p[:2]) * WALK_DETOUR for _, p in pts]
        dur = cast("list[float | None]", [m / WALK_SPEED for m in dist])   # OSRM 표는 못 가는 칸이 null
    best: dict[Node, Walk] = {}
    for (n, p), s, m in zip(pts, dur, dist):
        if s is not None and (n not in best or s < best[n][0]):
            best[n] = (round(s), round(m or 0), p[2], p[0], p[1])
    return best


# ---- live trains ---------------------------------------------------------------------------

def _event_time(t: Row) -> datetime | None:
    try:
        return datetime.strptime(str(t.get("receivedAt")), "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
    except ValueError:
        return None


def _next_live(live: Live, line: str, at: int, toward: int, after: datetime) -> tuple[datetime, Row] | None:
    """The first live train on `line` leaving station `at` toward `toward` no earlier than `after`."""
    label = _label(line, at, toward)
    if not label:
        return None
    # stations upstream of `at` in this direction, with the seconds from leaving each to leaving `at`
    up, frontier = {at: 0}, [at]
    while frontier:
        nxt: list[int] = []
        for b in frontier:
            for a in ADJ[line][b]:
                if a not in up and _label(line, a, b) == label and (h := _hop(line, a, b)):
                    up[a] = up[b] + h
                    nxt.append(a)
        frontier = nxt
    best = cast("tuple[datetime, Row] | None", None)
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

def _unhook(pts: list[list[float]], min_leg: float = 12.0) -> list[list[float]]:
    """Drop vertices where a [lng, lat] path doubles back (legs within ~30° of each other, one of
    them min_leg or longer), and repeated points."""
    pts = [q for i, q in enumerate(pts) if i == 0 or q != pts[i - 1]]

    def near(q: list[float], r: list[float], m: float = 12.0) -> bool:
        return math.hypot((q[0] - r[0]) * math.cos(math.radians(r[1])), q[1] - r[1]) * 111320 < m
    # once the path is within 12 m of where it ends, go straight there (it curled round an exit to
    # reach the footway point OSRM snapped it to); the same from where it starts
    if len(pts) > 2:
        end = next(i for i in range(len(pts)) if near(pts[i], pts[-1]))
        pts = pts[:end] + [pts[-1]] if end else [pts[0], pts[-1]]
        start = max(i for i in range(len(pts)) if near(pts[i], pts[0]))
        pts = [pts[0]] + pts[start + 1:] if start < len(pts) - 1 else [pts[0], pts[-1]]
    changed = True
    while changed and len(pts) > 2:
        changed = False
        for i in range(1, len(pts) - 1):
            k = math.cos(math.radians(pts[i][1]))
            ax, ay = (pts[i - 1][0] - pts[i][0]) * k, pts[i - 1][1] - pts[i][1]
            bx, by = (pts[i + 1][0] - pts[i][0]) * k, pts[i + 1][1] - pts[i][1]
            la, lb = math.hypot(ax, ay) * 111320, math.hypot(bx, by) * 111320
            if la < 0.5 or lb < 0.5 or max(la, lb) < min_leg:
                continue
            if (ax * bx + ay * by) / (math.hypot(ax, ay) * math.hypot(bx, by)) > 0.85:
                del pts[i]
                changed = True
                break
    return pts


def walk_path(a: tuple[float, float], b: tuple[float, float]) -> tuple[list[list[float]], int, int]:
    """OSRM foot route a→b: ([[lng, lat], ...], seconds, metres); a straight line when unavailable."""
    try:
        route = OSRM.route(a, b)
        # from the very point to the very point (OSRM starts and ends where it snapped them onto a
        # footway), without the hook where it ran past an exit or stop and came back to it
        pts = [[a[1], a[0]], *route["geometry"]["coordinates"], [b[1], b[0]]]
        return _unhook(pts), round(route["duration"]), round(route["distance"])
    except (OSError, ValueError, KeyError, IndexError):
        m = _meters(a, b) * 1.3
        return [[a[1], a[0]], [b[1], b[0]]], round(m / 1.2), round(m)


def _fmt(ts: float) -> str:
    return datetime.fromtimestamp(ts, KST).strftime("%H:%M")


def _node_name(n: Node) -> str:
    return STATIONS[n[1]]["name"] if n[0] == "at" else BSTOPS[n[1]][0]


def _search(t0: datetime, start: dict[Node, Walk], goal: dict[Node, Walk], live: Live, penalty: int,
            banned: frozenset[Node] = frozenset(), modes: frozenset[str] = frozenset({"subway", "bus"}),
            ceiling: float = math.inf, toward: tuple[float, float] | None = None) -> Row | None:
    """A* (Dijkstra when `toward`, the destination, is not given) over stations ("at", sid), bus stops ("bs", stop) and subway riding states
    (line, from, to, end); cost = arrival time (epoch seconds) + a penalty per boarding after the first.
    ("at"/"bs", id) is getting off there; ("at"/"bs", id, "w") is arriving on foot, which may board
    but neither walks on (no chains of walks) nor ends the trip. The A* bound: the straight line to
    the destination at ASTAR_SPEED, faster than anything runs (GTX-A averages ~28 m/s)."""
    T0 = t0.timestamp()
    day0 = t0.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    heap, best, back, tick = cast("list[tuple[float, int, int, float, Node]]", []), cast("dict[Node, tuple[float, float]]", {}), cast("dict[Node, tuple[str, Node | None, Row]]", {}), [0]
    bbest = [math.inf] * len(BSTOPS)   # best cost per bus stop, to turn down most bus pushes cheaply
    scanned: dict[tuple[int, int], tuple[int, float]] = {}   # (pattern, trip start) → (from position, cost offset)

    hcache: dict[Node, float] = {}

    def h(s: Node) -> float:
        if toward is None or s[0] == "goal":
            return 0.0
        k = (s[0], s[1]) if s[0] in ("at", "bs") else ("at", s[2])
        v = hcache.get(k)
        if v is None:
            if k[0] == "at":
                n = STATIONS[k[1]]
                v = _meters((n["lat"], n["lon"]), toward) / ASTAR_SPEED
            else:
                v = _meters((BSTOPS[k[1]][1], BSTOPS[k[1]][2]), toward) / ASTAR_SPEED
            hcache[k] = v
        return v

    def push(s: Node, c: float, t: float, info: tuple[str, Node | None, Row], ch: int) -> None:
        if c < best.get(s, (math.inf,))[0]:
            best[s] = (c, t)
            if len(s) == 2 and s[0] == "bs":
                bbest[s[1]] = c
            back[s] = info
            tick[0] += 1
            heapq.heappush(heap, (c + h(s), ch, tick[0], c, s))

    for node, w in start.items():
        if node[0] == "bs" and "bus" not in modes or node[0] == "at" and "subway" not in modes:
            continue
        push((*node, "w"), T0 + w[0], T0 + w[0], ("start", None, {"w": w}), 0)
    finish = False
    while heap:
        bound, changes, _, cost, s = heapq.heappop(heap)
        if best[s][0] < cost:
            continue
        t = best[s][1]
        if s == ("goal",):
            finish = True
            break
        if bound - T0 > MAX_TRIP or bound > ceiling:
            break   # nothing left that arrives in time
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
                    # this very bus already boarded upstream at no higher cost: what lies ahead is done
                    seen_ = scanned.get((pi, st))
                    if seen_ and seen_[0] <= k and seen_[1] <= extra:
                        continue
                    scanned[(pi, st)] = (k, extra)
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

    path, s = cast("list[tuple[str, Node, Row]]", []), cast("Node | None", ("goal",))
    while s is not None:
        kind, prev, info = back[s]
        path.append((kind, s, info))
        s = prev
    path.reverse()
    legs: list[Row] = []
    for kind, s, info in path:
        if kind == "start":
            sec_, m, ex, lat, lng = info["w"]
            name = _node_name(s)
            legs.append({"type": "walk", "seconds": sec_, "metres": m, "exit": ex, "to": name, "point": (lat, lng),
                         "label": f"{name}역{f' {ex}번 출구' if ex else ''}까지" if s[0] == "at" else f"{name} 정류장까지"})
        elif kind == "end":
            sec_, m, ex, lat, lng = info["w"]
            node = cast("Node", back[s][1])   # end 의 앞은 늘 있다
            name = _node_name(node)
            legs.append({"type": "walk", "seconds": sec_, "metres": m, "exit": ex, "from": name, "point": (lat, lng),
                         "label": f"{name}역{f' {ex}번 출구' if ex else ''}에서 목적지까지" if node[0] == "at" else f"{name} 정류장에서 목적지까지"})
        elif kind == "walk":
            prev = cast("Node", back[s][1])   # walk 의 앞은 늘 있다
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
                         "path": _bus_path(info["p"], info["k"], info["j"]),
                         "_dep": info["departs"], "_ban": [("bus", p["r"], ids[0]), ("bus", p["r"])]})
    transit = [l for l in legs if l["type"] != "walk"]
    leave = transit[0]["_dep"] - (legs[0]["seconds"] if legs[0]["type"] == "walk" else 0) if transit else T0
    return {"legs": legs, "leave": max(T0, leave), "arrive": best[("goal",)][1]}


def _signature(r: Row) -> tuple[Any, ...]:
    return tuple((l.get("line") or l.get("route"), l["from"], l["to"]) for l in r["legs"] if l["type"] != "walk")


def _search_job(args: Job) -> Row | None:   # pyright: ignore[reportUnusedFunction] — services/journey.py 가 일꾼에 넘긴다
    """일꾼 프로세스가 부르는 탐색 하나(모듈 함수라야 forkserver 로 피클된다)."""
    return _search(*args)


def _kind(r: Row) -> str:
    """subway, bus or mixed: what a plan rides."""
    ks = {l["type"] for l in r["legs"] if l["type"] != "walk"}
    return "mixed" if len(ks) > 1 else "bus" if ks == {"bus"} else "subway"


def plan(origin: tuple[float, float], dest: tuple[float, float], when: datetime, live: Live,
         run_batch: Callable[[list[Job], float], list[Row | None]], workers: int) -> Row:
    """run_batch(jobs, seconds): 탐색 여럿을 나란히(JourneyPlanner._run_batch), workers: 한 번에 workers*2 개씩."""
    start = _walk_table(origin, _near_nodes(origin))
    goal = _walk_table(dest, _near_nodes(dest), reverse=True)
    straight = _meters(origin, dest)
    both, subway, bus = frozenset({"subway", "bus"}), frozenset({"subway"}), frozenset({"bus"})

    # Many routes: the fastest by each mode, then, breadth first, the same search with one more
    # line (or bus route) of an earlier result barred — each of those finds the next best way
    # round it. Kept: different rides, arriving at most ROUTE_SLACK after the fastest; bounded in searches
    # and time.
    found: list[Row] = []
    seen_sigs, tried = cast("set[tuple[Any, ...]]", set()), cast("set[tuple[frozenset[str], frozenset[Node], int]]", set())
    t_start, best_arrive = time.monotonic(), math.inf
    queue: list[tuple[frozenset[str], frozenset[Node], int]] = [(both, frozenset(), TIE_PENALTY), (both, frozenset(), TRANSFER_PENALTY)]
    if BUS:
        queue += [(subway, frozenset(), TIE_PENALTY), (bus, frozenset(), TIE_PENALTY)]
    searches = 0
    while queue and searches < MAX_SEARCHES and len(found) < MAX_PLANS * 2:
        left = SEARCH_SECONDS - (time.monotonic() - t_start)
        if left <= 0:
            break
        # a batch: the searches known so far, run side by side (_run_batch)
        batch: list[tuple[frozenset[str], frozenset[Node], int]] = []
        while queue and len(batch) < workers * 2 and searches + len(batch) < MAX_SEARCHES:
            item = queue.pop(0)
            if item not in tried:
                tried.add(item)
                batch.append(item)
        searches += len(batch)
        ceiling = best_arrive + ROUTE_SLACK + 2 * TRANSFER_PENALTY
        jobs = [(when, start, goal, live, pen, banned, modes, ceiling, dest) for modes, banned, pen in batch]
        for (modes, banned, _pen), r in zip(batch, run_batch(jobs, left)):
            if not r or r["arrive"] > best_arrive + ROUTE_SLACK:
                continue
            best_arrive = min(best_arrive, r["arrive"])
            sig = _signature(r)
            if sig not in seen_sigs:
                seen_sigs.add(sig)
                found.append(r)
            if len(banned) < 3:   # route around each line or bus of this one
                for l in r["legs"]:
                    if l["type"] != "walk":
                        queue.append((modes, banned | {l["_ban"][1]}, TIE_PENALTY))
    found = [r for r in found if r["arrive"] <= best_arrive + ROUTE_SLACK]

    def transfers(r: Row) -> int: return sum(l["type"] != "walk" for l in r["legs"]) - 1
    def walking(r: Row) -> int: return sum(l["seconds"] for l in r["legs"] if l["type"] == "walk")
    # buses between the same two stops are one way to go: keep the first to arrive, list the others
    groups: dict[tuple[Any, ...], Row] = {}
    for r in sorted(found, key=lambda r: r["arrive"]):
        key = tuple((l["type"], l.get("line") or "", l["from"], l["to"]) for l in r["legs"] if l["type"] != "walk")
        if key not in groups:
            groups[key] = r
            continue
        kept = [l for l in groups[key]["legs"] if l["type"] != "walk"]
        for k, l in zip(kept, [l for l in r["legs"] if l["type"] != "walk"]):
            if l["type"] == "bus" and l["route"] != k["route"] and l["route"] not in k.setdefault("alts", []):
                k["alts"].append(l["route"])
    found = list(groups.values())
    # of one kind, drop a way that is DOMINATED_LATE later than another and changes and walks no less
    found = [r for r in found if not any(q is not r and _kind(q) == _kind(r) and q["arrive"] + DOMINATED_LATE <= r["arrive"]
             and transfers(q) <= transfers(r) and walking(q) <= walking(r)
             and (q["arrive"], transfers(q), walking(q)) != (r["arrive"], transfers(r), walking(r)) for q in found)]

    # tags: the fastest, the fewest changes, the least walking (each once)
    tags: dict[int, str] = {}
    if found:
        for tag, rank in (("가장 빠른 길", lambda r: (r["arrive"], transfers(r))),  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType, reportUnknownVariableType] — 순위 람다(r 은 결과 한 줄 Row) — 실행 코드를 바꾸지 않고는 람다 인자에 타입을 못 준다
                         ("환승 적은 길", lambda r: (transfers(r), r["arrive"])),  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType] — 위와 같음
                         ("덜 걷는 길", lambda r: (walking(r), r["arrive"]))):  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType] — 위와 같음
            k = min(range(len(found)), key=lambda i: cast("tuple[float, float]", rank(found[i])))   # 순위 = (작을수록 앞, 동점 가르기)
            tags.setdefault(k, tag)
    tagged = [(tags.get(i, ""), r) for i, r in enumerate(found)]

    plans: list[Row] = []
    for tag, r in tagged:
        legs = r["legs"]
        for i, l in enumerate(legs):
            if l["type"] == "walk":   # walking geometry
                a, b = (l.pop("a"), l.pop("b")) if "a" in l else (origin, l["point"]) if "to" in l else (l["point"], dest)
                # to and from a bus: where its drawn path starts / ends (the stop on the kerb of its
                # road), not the stop's own coordinates — a quarter of KTDB's are rounded to 3
                # decimals or fewer, so the walk ended ~100 m from where the bus was drawn boarding
                # (643 at 사당역 132 m, 2016 at 신촌 142 m)
                nxt, prv = (legs[i + 1] if i + 1 < len(legs) else None), (legs[i - 1] if i else None)
                if nxt and nxt["type"] == "bus" and nxt.get("path"):
                    b = (nxt["path"][0][1], nxt["path"][0][0])
                if prv and prv["type"] == "bus" and prv.get("path"):
                    a = (prv["path"][-1][1], prv["path"][-1][0])
                l["path"], _, _ = walk_path(a, b)
                l.pop("point", None)
            else:
                l.pop("_dep")
                l.pop("_ban")
        transit = [l for l in legs if l["type"] != "walk"]
        plans.append({"tag": tag, "kind": _kind(r), "leaveBy": _fmt(r["leave"]), "arrives": _fmt(r["arrive"]),
                      "minutes": round((r["arrive"] - when.timestamp()) / 60), "transfers": max(0, len(transit) - 1),
                      "walkMinutes": round(sum(l["seconds"] for l in legs if l["type"] == "walk") / 60), "legs": legs,
                      "_arrive": r["arrive"]})
    if straight < 2500:   # close enough to just walk
        path, sec, metres = walk_path(origin, dest)
        if not plans or sec <= min(p["_arrive"] for p in plans) - when.timestamp() + 10 * 60:
            arrive = when.timestamp() + sec
            plans.append({"tag": "걸어가기", "kind": "walk", "leaveBy": when.strftime("%H:%M"), "arrives": _fmt(arrive),
                          "minutes": round(sec / 60), "transfers": 0, "walkMinutes": round(sec / 60), "_arrive": arrive,
                          "legs": [{"type": "walk", "seconds": sec, "metres": metres, "exit": "", "direct": True,
                                    "label": "목적지까지 걸어서", "path": path}]})
    walk_only = [p["_arrive"] for p in plans if p["tag"] == "걸어가기"]
    if walk_only:   # riding that gets there later than walking is no use
        plans = [p for p in plans if p["tag"] == "걸어가기" or p["_arrive"] < walk_only[0]]
    plans.sort(key=lambda p: p["_arrive"])
    plans = plans[:MAX_PLANS]
    for p in plans:
        del p["_arrive"]
    out = {"ok": bool(plans), "at": when.strftime("%Y-%m-%d %H:%M"), "straightMetres": round(straight), "plans": plans,
           "searched": {"searches": searches, "seconds": round(time.monotonic() - t_start, 1)}}
    if not plans:
        out["error"] = "이 시각에는 다니는 열차·버스가 없거나, 가까운 역·정류장에서 이어지는 경로를 찾지 못했어요."
    return out
