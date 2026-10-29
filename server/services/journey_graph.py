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
import re
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
MAX_PLANS = 5                 # routes shown(2026-10-28 사용자 결정 B — 전엔 12). 태그 붙은 길은 늘 남긴다
STOP_PLANS = 5                # 첫 탐색들(가장 빠른 · 환승 적은 · 지하철만 · 버스만)이 끝나고 보여 줄 길이 이만큼이면 멈춘다(SEARCH_SECONDS 는 상한)
MAX_FOUND = 24                # 모아 둘 길 상한(전엔 MAX_PLANS * 2 = 24 — MAX_PLANS 가 줄어 따로 둔다)
ROUTE_SLACK = 60 * 60         # at most this much later than the fastest
MAX_SEARCHES, SEARCH_SECONDS = 24, 4.0
DOMINATED_LATE = 35 * 60      # a way no better in changes and walking is kept if within this
MAX_EASY_TRANSFERS = 3        # 환승이 이보다 많은 길(탈 것 5개 이상)은 빼지 않고 목록 맨 뒤로(2026-10-29 사용자 결정)
# 같은 구간 다른 버스: 같은 정류장(같은 번호)에서 타서 같은 정류장에 내리는 노선만(옆 정류장은 어디서 타고 내리는지 안내가 따로 있어야 해서 뺐다 — Codex 리뷰 2026-10-29)
ALT_DEPART_WITHIN = 20 * 60   # 고른 버스보다 이 안에 떠나는 것만
ALT_ARRIVE_LATE = 15 * 60     # 고른 버스보다 이보다 늦게 닿지 않는 것만
MAX_ALTERNATIVES = 3
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
# 경기 프리미엄버스(이름이 P + 숫자 — 예 "P9601(출근)"): 앱으로 좌석을 예약해야 타고 하루 한두 번이라
# 시간표가 맞아도 길찾기 결과로 쓸 수 없다(2026-10-29 사용자 결정). 자료에 노선 종류 칸이 없어(build_bus_data.py 는
# route_short_name 만 싣는다) 이름으로 가린다. 버스 층 · /bus 는 따로라 그대로 보인다
PREMIUM_BUS = re.compile(r"P\d")


def bookable_only(name: str) -> bool:
    """예약해야만 타는 노선(경기 프리미엄버스)인가 — 길찾기에서 타지 않는다."""
    return PREMIUM_BUS.match(name.strip()) is not None


def bus_boardings(patterns: list[Row], routes: list[Any]) -> dict[int, list[tuple[int, int]]]:
    """stop → [(pattern, position)] 탈 수 있는 자리. 프리미엄버스 패턴은 넣지 않는다(패턴 번호는 그대로 — BUS_SHAPES 가 번호로 찾는다)."""
    at: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for pi, pat in enumerate(patterns):
        if bookable_only(routes[pat["r"]][0]):
            continue
        for k, stop in enumerate(pat["s"][:-1]):
            at[stop].append((pi, k))
    return at


for _p in BPATS:
    _p["starts"] = [d[0] for d in _p["d"]]
BUS_AT = bus_boardings(BPATS, BROUTES)
_bgrid: dict[tuple[int, int], list[int]] = defaultdict(list)
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
# (역, 정류장) → 갈아탈 때 나가는 출구 번호("11" · "2-1"). 출구 자료가 없는 역은 칸이 없다(= 빈 글자)
EXIT_REF: dict[tuple[int, int], str] = {}
for _sid in STATIONS:
    _best: dict[int, tuple[float, Pt, str]] = {}
    for _lat, _lng, _ref in _points(_sid):
        for _m, _i in _stops_near((_lat, _lng), STATION_BUS_M):
            if _i not in _best or _m < _best[_i][0]:
                _best[_i] = (_m, (_lat, _lng), _ref)
    for _i, (_m, _pt, _ref) in _best.items():
        STATION_BUS[_sid].append((_i, _m, _pt))
        BUS_STATION[_i].append((_sid, _m, _pt))
        if _ref:
            EXIT_REF[(_sid, _i)] = _ref


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
        if node[0] == "stay":   # 경유지 역에서 내리지 않고 같은 열차로 계속(plan_via — ("stay", 노선, 앞 역, 경유지 역, 종점)): 기다림 · 환승 없이 다음 역부터
            _, line, a, b, end = node
            label = _label(line, a, b)
            for c_ in (ADJ[line][b] if "subway" in modes and b != end else ()):
                hop = _hop(line, b, c_)
                if c_ != a and hop and not (label and _label(line, b, c_) not in (label, None)):
                    push((line, b, c_, end), T0 + hop, T0 + hop, ("board", None, {"departs": T0, "train": None, "ready": T0, "stay": True}), 0)
            continue
        if node[0] == "bstay":   # 경유지 정류장에서 내리지 않고 같은 버스로 계속(plan_via — ("bstay", 패턴, 운행 시작 epoch, 배율, 내린 자리)): 시간표를 다시 찾지 않는다
            _, pi, base, scale, k = node
            p, here = BPATS[pi], base + BPATS[pi]["t"][k] * scale
            for j in (range(k + 1, len(p["s"])) if "bus" in modes else ()):
                arr = base + p["t"][j] * scale
                push(("bs", p["s"][j]), arr, arr, ("bus", None, {"p": pi, "k": k, "j": j, "base": base, "sc": scale, "departs": here, "ready": here,
                                                                "stay": True}), 0)
            continue
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
                                                                     "b": (BSTOPS[stop][1], BSTOPS[stop][2]),
                                                                     "exit": EXIT_REF.get((sid, stop), "")}), changes)
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
                                 ("bus", s, {"p": pi, "k": k, "j": j, "base": base, "sc": scale, "departs": day0 + dep, "ready": t}), changes + (kind != "start"))
            if kind == "bus":
                for j, m in BUS_WALK[stop]:
                    w = _walk_sec(m)
                    push(("bs", j, "w"), cost + w, t + w, ("walk", s, {"seconds": w, "metres": round(m * WALK_DETOUR),
                         "a": (BSTOPS[stop][1], BSTOPS[stop][2]), "b": (BSTOPS[j][1], BSTOPS[j][2])}), changes)
                if "subway" in modes:
                    for sid, m, pt in BUS_STATION.get(stop, ()):
                        w = _walk_sec(m) + STATION_ACCESS
                        push(("at", sid, "w"), cost + w, t + w, ("walk", s, {"seconds": w, "metres": round(m * WALK_DETOUR),
                             "a": (BSTOPS[stop][1], BSTOPS[stop][2]), "b": pt,
                             "exit": EXIT_REF.get((sid, stop), "")}), changes)
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
            legs.append({"type": "walk", "seconds": info["seconds"], "metres": info["metres"], "exit": info.get("exit", ""),
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
                         "_dep": info["departs"], "_ban": [(s[0], s[1]), (s[0],)], **({"_stay": True} if info.get("stay") else {})})
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
                         "_dep": info["departs"], "_arr": best[s][1], "_ban": [("bus", p["r"], ids[0]), ("bus", p["r"])], "_stop": ids[-1],
                         "_run": (info["p"], info["base"], info["sc"], info["j"]), **({"_stay": True} if info.get("stay") else {})})
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


def _transfers(r: Row) -> int:
    return sum(l["type"] != "walk" for l in r["legs"]) - 1


def _walking(r: Row) -> int:
    return sum(l["seconds"] for l in r["legs"] if l["type"] == "walk")


def _ride_key(r: Row) -> tuple[Any, ...]:
    """같은 두 정류장 사이를 타는 길은 한 가지(버스 번호만 다르면 묶는다)."""
    return tuple((l["type"], l.get("line") or "", l["from"], l["to"]) for l in r["legs"] if l["type"] != "walk")


def _undominated(found: list[Row]) -> list[Row]:
    """같은 종류 안에서 DOMINATED_LATE 넘게 늦고 환승 · 걷기도 나을 게 없는 길은 뺀다."""
    return [r for r in found if not any(q is not r and _kind(q) == _kind(r) and q["arrive"] + DOMINATED_LATE <= r["arrive"]
            and _transfers(q) <= _transfers(r) and _walking(q) <= _walking(r)
            and (q["arrive"], _transfers(q), _walking(q)) != (r["arrive"], _transfers(r), _walking(r)) for q in found)]


def _pick_shown(plans: list[Row]) -> list[Row]:
    """도착 차례로 놓인 plans 에서 보여 줄 MAX_PLANS 개: 태그 붙은 길(가장 빠른 · 환승 적은 · 덜 걷는 · 걸어가기)을 먼저 남기고
    나머지는 일찍 닿는 차례 — 남긴 것의 차례는 그대로(5개로 줄어 늦게 닿는 '환승 적은 길'이 잘리지 않게)."""
    keep = sorted(range(len(plans)), key=lambda i: (plans[i]["tag"] == "", plans[i]["_arrive"]))[:MAX_PLANS]
    return [plans[i] for i in sorted(keep)]


def _easy_first(plans: list[Row]) -> list[Row]:
    """환승이 MAX_EASY_TRANSFERS 넘는 길을 맨 뒤로 — 그 안끼리 · 나머지끼리 차례(도착 순)와 태그는 그대로.
    고르기(_pick_shown) 뒤에 보여 주는 차례만 바꾼다."""
    return sorted(plans, key=lambda p: p["transfers"] > MAX_EASY_TRANSFERS)   # sorted 는 안정 정렬


def _shows_walk(arrives: list[float], walk_sec: int, t0: float) -> bool:
    """가까울 때 걸어가기를 보여 줄지: 탈것 길이 없거나, 걷기가 가장 빨리 닿는 탈것보다 10분 넘게 늦지 않으면."""
    return not arrives or walk_sec <= min(arrives) - t0 + 10 * 60


def _shown_count(found: list[Row], best_arrive: float, walk_sec: int | None, t0: float) -> int:
    """지금까지 찾은 것으로 보여 줄 수 있는 길 수(아래 plan 의 거르기와 같은 순서 · 값을 바꾸지 않는다) — 일찍 멈출지 볼 때.
    walk_sec: 걸어가기 초(가까울 때만 — 아니면 None). 걸어가기가 붙으면 걷기보다 늦게 닿는 탈것 길은 빠지니 세지 않는다."""
    firsts: dict[tuple[Any, ...], Row] = {}
    for r in sorted((r for r in found if r["arrive"] <= best_arrive + ROUTE_SLACK), key=lambda r: r["arrive"]):
        firsts.setdefault(_ride_key(r), r)
    arrives = [r["arrive"] for r in _undominated(list(firsts.values()))]
    if walk_sec is None or not _shows_walk(arrives, walk_sec, t0):
        return len(arrives)
    return 1 + sum(a < t0 + walk_sec for a in arrives)


def _gather(when: datetime, start: dict[Node, Walk], goal: dict[Node, Walk], dest: tuple[float, float], live: Live,
            run_batch: Callable[[list[Job], float], list[Row | None]], workers: int, seconds: float,
            walk_sec: int | None) -> tuple[list[Row], int]:
    """탐색 결과 모으기 → (가장 빠른 것보다 ROUTE_SLACK 안에 닿는 길들, 탐색 수). seconds: 이 모으기의 예산(상한)."""
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
    seeds = set(queue)   # 태그를 정하는 첫 탐색들 — 다 끝나야 일찍 멈출 수 있다
    searches = 0
    while queue and searches < MAX_SEARCHES and len(found) < MAX_FOUND:
        left = seconds - (time.monotonic() - t_start)
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
        if seeds <= tried and _shown_count(found, best_arrive, walk_sec, when.timestamp()) >= STOP_PLANS:
            break   # 태그를 정하는 탐색이 끝났고 보여 줄 길이 넉넉하다(2026-10-28 사용자 결정 B)
    return [r for r in found if r["arrive"] <= best_arrive + ROUTE_SLACK], searches


def _distinct(found: list[Row]) -> list[Row]:
    """같은 두 정류장 사이 버스는 한 길(먼저 닿는 것 + 다른 번호는 alts) · 같은 종류에서 한참 늦고 나을 게 없는 길은 뺀다."""
    # buses between the same two stops are one way to go: keep the first to arrive, list the others
    groups: dict[tuple[Any, ...], Row] = {}
    for r in sorted(found, key=lambda r: r["arrive"]):
        key = _ride_key(r)
        if key not in groups:
            groups[key] = r
            continue
        kept = [l for l in groups[key]["legs"] if l["type"] != "walk"]
        for k, l in zip(kept, [l for l in r["legs"] if l["type"] != "walk"]):
            if l["type"] == "bus" and l["route"] != k["route"] and l["route"] not in k.setdefault("alts", []):
                k["alts"].append(l["route"])
    # of one kind, drop a way that is DOMINATED_LATE later than another and changes and walks no less
    return _undominated(list(groups.values()))


def _shaped(found: list[Row], origin: tuple[float, float], dest: tuple[float, float], when: datetime) -> list[Row]:
    """길들 → 응답의 plans 칸(태그 · 걷기 모양 · 분 · 환승 …, 차례를 고를 때 쓰는 _arrive 붙임)."""
    transfers, walking = _transfers, _walking
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
        first_ride = next((l for l in legs if l["type"] != "walk"), None)
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
                if l["type"] == "bus" and l.get("_arr") is not None and not l.get("_stay"):   # 같은 구간 다른 버스는 보여 줄 길을 고른 뒤 _finish 에서 찾는다(타는 정류장 · 내리는 정류장 · 정류장에 닿은 때 · 떠난 때 · 닿은 때)
                    # 첫 탈것은 보이는 출발 일정(leaveBy)대로 가면 고른 버스가 떠나는 때에 정류장에 닿는다 — 탐색 때 닿은 때가 아니다
                    ready = l["_dep"] if l is first_ride else l["_dep"] - l["wait"]
                    # 앞 · 뒤가 지하철 갈아타기(걷기 하나 사이)면 그 역 — 옆 정류장 안내의 가까운 출구를 찾는 데 쓴다
                    before = legs[i - 2]["stations"][-1] if i >= 2 and legs[i - 1]["type"] == "walk" and legs[i - 2]["type"] == "ride" else None
                    after = legs[i + 2]["stations"][0] if i + 2 < len(legs) and legs[i + 1]["type"] == "walk" and legs[i + 2]["type"] == "ride" else None
                    l["_alt"] = (l["_ban"][0][2], (*l.get("_via", ()), l["_stop"]), ready, l["_dep"], l["_arr"], before, after)
                l.pop("_dep")
                l.pop("_ban")
                for k in ("_stop", "_run", "_stay", "_arr", "_via"):   # 경유지 역 · 정류장에서 이어 갈 자리 · 같은 차량 알아보기(plan_via) — 응답에는 안 싣는다
                    l.pop(k, None)
        transit = [l for l in legs if l["type"] != "walk"]
        plans.append({"tag": tag, "kind": _kind(r) if transit else "walk", "leaveBy": _fmt(r["leave"]), "arrives": _fmt(r["arrive"]),
                      "minutes": round((r["arrive"] - when.timestamp()) / 60), "transfers": max(0, len(transit) - 1),
                      "walkMinutes": round(sum(l["seconds"] for l in legs if l["type"] == "walk") / 60), "legs": legs,
                      "_arrive": r["arrive"]})
    return plans


def _nearby(stop: int) -> list[tuple[int, float]]:
    """그 정류장과 걸어서 이어지는 옆 정류장들: [(정류장, 미터)] — 그 정류장 자신이 맨 앞(0 m)."""
    return [(stop, 0.0), *(BUS_WALK[stop] if stop < len(BUS_WALK) else ())]


def _stop_note(stop: int, metres: float, sid: int | None) -> Row:
    """옆 정류장 안내: 이름 · 걷는 거리 · 갈아타는 역의 가까운 출구(자료가 있을 때만)."""
    note: Row = {"name": BSTOPS[stop][0], "metres": round(metres)}
    ref = EXIT_REF.get((sid, stop)) if sid is not None else None
    if ref:
        note["exit"] = ref
    return note


def _alternatives(alt: tuple[Any, ...], route: str, day0: float) -> list[Row]:
    """고른 버스 구간(alt = 타는 정류장, 지나 내리는 정류장들(경유지에서 이어 탔으면 경유 정류장 포함 · 차례대로), 정류장에 닿은 때, 떠난 때, 닿은 때,
    [앞 구간에서 내린 역 | None, 뒤 구간에서 탈 역 | None])과 같은 구간을 가는 다른 노선(노선마다 가장 먼저 떠나는 한 대 · 먼저 떠나는 순 · MAX_ALTERNATIVES 개까지).
    타는 정류장 · (경유지 없는 구간의) 내리는 정류장은 걸어서 이어지는 옆 정류장도 된다 — 옆 정류장은 걷는 시간만큼 늦게 닿는 것으로 보고
    (이미 떠난 버스는 뺀다), 응답에 boardAt · alightAt(이름 · 거리 · 출구)을 싣는다. 같은 정류장이면 칸이 없다."""
    from_stop, onward, ready, dep, arr = alt[:5]
    board_sid, alight_sid = (alt[5], alt[6]) if len(alt) >= 7 else (None, None)
    ends = _nearby(onward[-1]) if len(onward) == 1 else [(onward[-1], 0.0)]   # 경유지가 있으면 내리는 곳은 그 정류장 그대로
    best: dict[str, tuple[float, float, float, str, int, float, int, float]] = {}
    for board, board_m in _nearby(from_stop):
        for pi, k in BUS_AT.get(board, ()):
            p = BPATS[pi]
            name, rkind = BROUTES[p["r"]]
            if name == route:
                continue
            for end, end_m in ends:
                at, j = k, 0
                for stop in (*onward[:-1], end):   # 정류장들을 차례로 지나는가 — 마지막이 내리는 자리(j)
                    j = next((n for n in range(at + 1, len(p["s"])) if p["s"][n] == stop), -1)
                    if j < 0:
                        break
                    at = j
                nxt = _bus_next(p, k, ready + (_walk_sec(board_m) if board_m else 0) - day0) if j > 0 else None
                if not nxt:
                    continue
                start, scale, left = nxt
                leaves, gets = day0 + left, day0 + start + p["t"][j] * scale
                if leaves > dep + ALT_DEPART_WITHIN or gets + (_walk_sec(end_m) if end_m else 0) > arr + ALT_ARRIVE_LATE:
                    continue
                key = (leaves, gets, board_m + end_m)   # 같은 노선이 여럿이면 먼저 떠나는 것 · 같으면 덜 걷는 것
                if name not in best or key < best[name][:3]:
                    best[name] = (leaves, gets, board_m + end_m, BUS_COLORS.get(rkind, "#3d5bab"), board, board_m, end, end_m)
    ordered = sorted(best.items(), key=lambda item: item[1][:3])[:MAX_ALTERNATIVES]
    out: list[Row] = []
    for name, (leaves, gets, _w, color, board, board_m, end, end_m) in ordered:
        row: Row = {"route": name, "color": color, "departs": _fmt(leaves), "arrives": _fmt(gets)}
        if board != from_stop:
            row["boardAt"] = _stop_note(board, board_m, board_sid)
        if end != onward[-1]:
            row["alightAt"] = _stop_note(end, end_m, alight_sid)
        out.append(row)
    return out


def _finish(plans: list[Row], when: datetime, straight: float, searches: int, t_begin: float) -> Row:
    """도착 차례 → 보여 줄 MAX_PLANS 개 → 환승 많은 길 뒤로 → 응답."""
    plans.sort(key=lambda p: p["_arrive"])
    plans = _easy_first(_pick_shown(plans))
    day0 = when.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    for p in plans:
        del p["_arrive"]
        for l in p["legs"]:
            alt = l.pop("_alt", None)   # 버스 구간만(_shaped 가 달았다)
            if alt:
                found_alts = _alternatives(alt, l["route"], day0)
                if found_alts:
                    l["alternatives"] = found_alts
    out = {"ok": bool(plans), "at": when.strftime("%Y-%m-%d %H:%M"), "straightMetres": round(straight), "plans": plans,
           "searched": {"searches": searches, "seconds": round(time.monotonic() - t_begin, 1)}}
    if not plans:
        out["error"] = "이 시각에는 다니는 열차·버스가 없거나, 가까운 역·정류장에서 이어지는 경로를 찾지 못했어요."
    return out


def plan(origin: tuple[float, float], dest: tuple[float, float], when: datetime, live: Live,
         run_batch: Callable[[list[Job], float], list[Row | None]], workers: int) -> Row:
    """run_batch(jobs, seconds): 탐색 여럿을 나란히(JourneyPlanner._run_batch), workers: 한 번에 workers*2 개씩."""
    start = _walk_table(origin, _near_nodes(origin))
    goal = _walk_table(dest, _near_nodes(dest), reverse=True)
    straight = _meters(origin, dest)
    t_begin = time.monotonic()
    # close enough to just walk: 먼저 재 둔다 — 일찍 멈출지 셀 때 걷기보다 늦게 닿는 길은 빼야 해서(탐색 예산 밖)
    walk = walk_path(origin, dest) if straight < 2500 else None
    walk_sec = walk[1] if walk else None
    found, searches = _gather(when, start, goal, dest, live, run_batch, workers, SEARCH_SECONDS, walk_sec)
    plans = _shaped(_distinct(found), origin, dest, when)
    if walk:   # close enough to just walk
        path, sec, metres = walk
        if _shows_walk([p["_arrive"] for p in plans], sec, when.timestamp()):
            arrive = when.timestamp() + sec
            plans.append({"tag": "걸어가기", "kind": "walk", "leaveBy": when.strftime("%H:%M"), "arrives": _fmt(arrive),
                          "minutes": round(sec / 60), "transfers": 0, "walkMinutes": round(sec / 60), "_arrive": arrive,
                          "legs": [{"type": "walk", "seconds": sec, "metres": metres, "exit": "", "direct": True,
                                    "label": "목적지까지 걸어서", "path": path}]})
    walk_only = [p["_arrive"] for p in plans if p["tag"] == "걸어가기"]
    if walk_only:   # riding that gets there later than walking is no use
        plans = [p for p in plans if p["tag"] == "걸어가기" or p["_arrive"] < walk_only[0]]
    return _finish(plans, when, straight, searches, t_begin)


# ---- 경유지(via): 출발 → 경유지 길 몇 개 × 그 길이 닿은 시각부터 경유지 → 도착 가장 빠른 길(2026-10-29 사용자 결정 A) ----
VIA_FIRST = 4                 # 이어 붙일 앞 구간 길 수(종류마다 가장 빠른 것 먼저, 나머지는 일찍 닿는 차례)
VIA_FIRST_SHARE = 0.6         # 앞 구간 모으기가 쓸 탐색 예산 몫(나머지는 뒤 구간 — 둘 합쳐 SEARCH_SECONDS 를 넘지 않는다)
_MODES = {"subway": frozenset({"subway"}), "bus": frozenset({"bus"})}   # 앞 구간 종류 → 뒤 구간을 찾을 탈것(섞어 · 걷기는 둘 다)
# 경유지가 역 · 정류장이면 좌표까지 걷지 않고 그 역 · 정류장에서 갈아탄다(2026-10-29 사용자 결정). 장소 검색(카카오)의 '○○역' 좌표는
# 역 중심(capital-metro)에서 수십 m(청담 20 m)라 VIA_STATION_M 안이면 그 역, 아니고 정류장에서 VIA_STOP_M 안이면 그 정류장
VIA_STATION_M = 120
VIA_STOP_M = 40
VIA_STOP_PAIR_M = 150         # 경유 정류장과 이름이 같은 길 건너편 정류장도 같은 경유지


def _via_firsts(found: list[Row]) -> list[Row]:
    """이어 붙일 앞 구간 길(도착 차례 · 많아야 VIA_FIRST 개): 종류(지하철만 · 버스만 · 섞어)마다 가장 빨리 닿는 것을 먼저 넣고 나머지는 일찍 닿는 차례
    — 뒤 구간을 같은 탈것으로 찾아 붙이니 이어 붙인 길에도 지하철만 · 버스만 길이 남는다(조건 바꾸기)."""
    ordered = sorted(found, key=lambda r: r["arrive"])
    picked: list[Row] = []
    for kind in ("subway", "bus", "mixed"):
        first = next((r for r in ordered if _kind(r) == kind), None)
        if first is not None:
            picked.append(first)
    picked += [r for r in ordered if all(r is not p for p in picked)]
    return sorted(picked[:VIA_FIRST], key=lambda r: r["arrive"])


def _via_ready(r: Row) -> float:
    """앞 구간이 경유지에 닿은 뒤 뒤 구간을 찾을 시각: 지하철에서 내렸으면 그 역의 갈아타기 여유(탐색의 환승 시간 규칙과 같은 값)를 더한다."""
    rides = [l for l in r["legs"] if l["type"] != "walk"]
    if rides and rides[-1]["type"] == "ride":
        return r["arrive"] + _data["transfer"].get(str(rides[-1]["stations"][-1]), _data["defaultTransfer"])
    return r["arrive"]


def _walk_row(walk: tuple[list[list[float]], int, int], a: tuple[float, float], b: tuple[float, float], t0: float, label: str) -> Row:
    """걸어서만 가는 구간 하나(탐색 결과와 같은 모양 — 걷기 모양은 _shaped 가 a · b 로 다시 잰다)."""
    _path, sec, metres = walk
    return {"legs": [{"type": "walk", "seconds": sec, "metres": metres, "exit": "", "direct": True, "label": label, "a": a, "b": b}],
            "leave": t0, "arrive": t0 + sec}


def _via_nodes(via: tuple[float, float]) -> list[Node]:
    """경유지가 역 · 정류장이면 '닿으면 경유'인 자리들, 아니면 [] (좌표까지 걷는 지금 동작).
    역: 그 역 + 출구 가까운 정류장(STATION_BUS — 탐색의 역 ↔ 정류장 갈아타기와 같은 범위). 정류장: 그 정류장 + 길 건너 같은 이름 정류장."""
    sid = _near_stations(via)[0]
    if _meters(via, (STATIONS[sid]["lat"], STATIONS[sid]["lon"])) <= VIA_STATION_M:
        return [("at", sid)] + [("bs", stop) for stop, _m, _pt in STATION_BUS.get(sid, ())]
    near = _stops_near(via, VIA_STOP_M)
    if not near:
        return []
    name = BSTOPS[near[0][1]][0]
    return [("bs", i) for _m, i in _stops_near(via, VIA_STOP_PAIR_M) if BSTOPS[i][0] == name]


def _node_point(n: Node) -> Pt:
    return (STATIONS[n[1]]["lat"], STATIONS[n[1]]["lon"]) if n[0] == "at" else (BSTOPS[n[1]][1], BSTOPS[n[1]][2])


def _transfer_leg(a_node: Node, b_node: Node, seconds: int, metres: float, a: Pt, b: Pt, exit_ref: str = "") -> Row:
    """탐색 안 갈아타기 걷기 구간과 같은 모양(_search 의 walk)."""
    def named(n: Node) -> str:
        return f"{_node_name(n)}{'역' if n[0] == 'at' else ' 정류장'}"
    return {"type": "walk", "seconds": seconds, "metres": round(metres * WALK_DETOUR), "exit": exit_ref,
            "label": f"{named(a_node)}에서 {named(b_node)}으로", "a": a, "b": b}


def _via_arrival(first: Row) -> Node | None:
    """앞 구간이 경유지 역 · 정류장에 닿은 자리(마지막에 탄 것에서 내린 곳). 걷기만 한 길이면 None."""
    rides = [l for l in first["legs"] if l["type"] != "walk"]
    if not rides:
        return None
    last = rides[-1]
    if last["type"] == "ride":
        return ("at", last["stations"][-1])
    return ("bs", last["_stop"]) if "_stop" in last else None


def _via_start(node: Node, first: Row) -> dict[Node, tuple[Walk, Row | None]]:
    """경유지 역 · 정류장에 내린 자리에서 뒤 구간을 시작할 곳 → (걷기, 보여 줄 갈아타기 구간 | 없음). 탐색 안 갈아타기 규칙 그대로:
    지하철에서 내렸으면 같은 열차로 계속(내리지 않음 — 기다림 · 환승 없이) · 그 역(갈아타기 시간) · 출구 가까운 정류장(걷기 + 오르내리기),
    버스에서 내렸으면 그 정류장(같은 버스도 바로 이어 탄다) · 이어 걷는 정류장 · 가까운 역."""
    out: dict[Node, tuple[Walk, Row | None]] = {}
    here = _node_point(node)
    if node[0] == "at":
        sid = node[1]
        last = [l for l in first["legs"] if l["type"] != "walk"][-1]
        if len(last["stations"]) >= 2:
            dest_name = last.get("destination")
            end = BY_NAME.get((last["line"], _key(dest_name))) if dest_name else None
            out[("stay", last["line"], last["stations"][-2], sid, end)] = ((0, 0, "", *here), None)
        out[node] = ((_data["transfer"].get(str(sid), _data["defaultTransfer"]), 0, "", *here), None)
        for stop, m, pt in STATION_BUS.get(sid, ()):
            w, b = _walk_sec(m) + STATION_ACCESS, _node_point(("bs", stop))
            out[("bs", stop)] = ((w, round(m * WALK_DETOUR), "", *b), _transfer_leg(node, ("bs", stop), w, m, pt, b, EXIT_REF.get((sid, stop), "")))
        return out
    stop = node[1]
    last = [l for l in first["legs"] if l["type"] != "walk"][-1]
    if "_run" in last:   # 같은 버스로 계속 — 운행 · 내린 자리를 그대로 넘긴다(도착 시각으로 시간표를 다시 찾으면 소수 배율 반올림에 그 차를 놓친다)
        out[("bstay", *last["_run"])] = ((0, 0, "", *here), None)
    out[node] = ((0, 0, "", *here), None)
    for j, m in BUS_WALK[stop] if stop < len(BUS_WALK) else ():
        w, b = _walk_sec(m), _node_point(("bs", j))
        out.setdefault(("bs", j), ((w, round(m * WALK_DETOUR), "", *b), _transfer_leg(node, ("bs", j), w, m, here, b)))
    for sid, m, pt in BUS_STATION.get(stop, ()):
        w = _walk_sec(m) + STATION_ACCESS
        out.setdefault(("at", sid), ((w, round(m * WALK_DETOUR), "", *pt), _transfer_leg(node, ("at", sid), w, m, here, pt, EXIT_REF.get((sid, stop), ""))))
    return out


def _first_ride_node(r: Row) -> Node | None:
    """뒤 구간이 처음 탄 자리(지하철 역 · 버스 정류장) — 그 구간이 어느 시작 자리에서 출발했는지."""
    rides = [l for l in r["legs"] if l["type"] != "walk"]
    if not rides:
        return None
    l = rides[0]
    return ("at", l["stations"][0]) if l["type"] == "ride" else ("bs", l["_ban"][0][2])


def _same_vehicle(a: Row, b: Row) -> bool:
    """경유지에서 내리지 않고 같은 차량을 그대로 탔는가(바로 이어진 두 탈 것 구간): 뒤 구간이 탐색 시작의 '같은 열차 · 버스로 계속'
    (stay · bstay → _stay)에서 나온 것. 노선만 같고 다른 열차 · 버스면 실제 환승이라 나눠 둔다."""
    if a["type"] != b["type"]:
        return False
    if a["type"] == "ride":
        return bool(b.get("_stay")) and a["line"] == b["line"] and a["stations"][-1] == b["stations"][0]
    return bool(b.get("_stay")) and a.get("_stop") == b["_ban"][0][2]


def _merged(a: Row, b: Row) -> Row:
    """같은 열차 · 버스를 이어 탄 두 구간 → 한 구간(탄 곳 · 떠난 시각 · 열차 정보는 앞, 내린 곳 · 닿은 시각은 뒤)."""
    out = {**a, "to": b["to"], "arrives": b["arrives"], "stops": a["stops"] + b["stops"]}
    if a["type"] == "ride":
        out["stations"] = a["stations"] + b["stations"][1:]
    else:
        out["path"] = a.get("path", []) + b.get("path", [])[1:]
        out["_stop"] = b.get("_stop")
        out["_via"] = [*a.get("_via", []), a.get("_stop")]   # 이어 탄 경유 정류장들(같은 구간 다른 버스가 이곳들을 차례로 지나는지 볼 때)
        out["_arr"] = b.get("_arr")
        out.pop("alts", None)   # 앞 구간 두 정류장 사이 다른 번호 — 이어 탄 길 전체와는 맞지 않는다
    return out


def _via_walk_on(node: Node, goal: dict[Node, Walk], dest: tuple[float, float], ready: float) -> Row | None:
    """경유지 역 · 정류장에 내린 자리에서 목적지까지 걸어가기(뒤 구간을 걷기로 대신할 때): 그 역 출구 · 정류장이 목적지 걷기 표(goal)에 있으면
    탐색의 '내려서 목적지까지 걷기'와 같은 구간, 없으면 그 정류장 · 목적지에 가장 가까운 역 출구에서 목적지까지 다시 잰다
    (걸어갈 만한 거리 — plan 의 걸어가기와 같은 2.5 km 안. 역이면 오르내리기를 더한다)."""
    if node in goal:
        sec, m, ex, lat, lng = goal[node]
        name = _node_name(node)
        label = f"{name}역{f' {ex}번 출구' if ex else ''}에서 목적지까지" if node[0] == "at" else f"{name} 정류장에서 목적지까지"
        return {"legs": [{"type": "walk", "seconds": sec, "metres": m, "exit": ex, "from": name, "point": (lat, lng), "label": label}],
                "leave": ready, "arrive": ready + sec}
    point = min((p[:2] for p in _points(node[1])), key=lambda q: _meters(q, dest)) if node[0] == "at" else _node_point(node)
    if _meters(point, dest) >= 2500:
        return None
    row = _walk_row(walk_path(point, dest), point, dest, ready, "목적지까지 걸어서")
    access = STATION_ACCESS if node[0] == "at" else 0
    row["legs"][0]["seconds"] += access
    row["arrive"] += access
    return row


def _via_join(first: Row, second: Row, via: tuple[float, float], start: dict[Node, tuple[Walk, Row | None]] | None = None) -> Row:
    """앞 구간 + 뒤 구간 → 한 길. 경유지 쪽 걷기는 경유지 좌표로 잇고(a · b) 이름표는 '경유지까지'.
    start(경유지가 역 · 정류장일 때 _via_start): 경유지에서 끝나는 0초 걷기와 뒤 구간의 시작 걷기를 갈아타기 구간으로 바꾸고,
    경유지에서 내리지 않고 같은 차량을 계속 탔으면(_same_vehicle) 한 구간으로 합친다."""
    legs = [dict(l) for l in first["legs"]] + [dict(l) for l in second["legs"]]   # 구간마다 따로 고쳐 쓴다(같은 앞 구간을 여러 길이 같이 쓴다)
    head = len(first["legs"])
    last, nxt = legs[head - 1], legs[head]
    if start is not None:
        if last["type"] == "walk" and "point" in last and "to" not in last:   # 역 · 정류장에 닿으면 끝(0초 걷기)
            legs.pop(head - 1)
            head -= 1
        node = _first_ride_node(second)
        if nxt["type"] == "walk" and "point" in nxt and "to" in nxt and node in start:   # 뒤 구간 시작 걷기 → 갈아타기 구간 | 없음
            shown = start[node][1]
            if shown is None:
                legs.pop(head)
            else:
                legs[head] = dict(shown)
        if 0 < head < len(legs) and legs[head - 1]["type"] != "walk" and legs[head]["type"] != "walk" \
                and _same_vehicle(legs[head - 1], legs[head]):
            legs[head - 1:head + 1] = [_merged(legs[head - 1], legs[head])]
        return {"legs": legs, "leave": first["leave"], "arrive": second["arrive"]}
    if last["type"] == "walk" and "point" in last and "to" not in last:   # 앞 구간 끝 걷기(역 · 정류장 → 경유지)
        last["a"], last["b"] = last.pop("point"), via
        last["label"] = str(last["label"]).replace("목적지까지", "경유지까지")
    if nxt["type"] == "walk" and "point" in nxt and "to" in nxt:   # 뒤 구간 첫 걷기(경유지 → 역 · 정류장)
        nxt["a"], nxt["b"] = via, nxt.pop("point")
    return {"legs": legs, "leave": first["leave"], "arrive": second["arrive"]}


def plan_via(origin: tuple[float, float], via: tuple[float, float], dest: tuple[float, float], when: datetime, live: Live,
             run_batch: Callable[[list[Job], float], list[Row | None]], workers: int) -> Row:
    """출발 → 경유지 → 도착. 앞 구간은 plan 과 같은 모으기(예산 VIA_FIRST_SHARE 몫)로 찾고, 그 가운데 VIA_FIRST 개마다
    그 길이 경유지에 닿은 시각(+ 갈아타기 여유)부터 뒤 구간 가장 빠른 길을 같은 탈것으로(없으면 둘 다로) 찾아 이어 붙인다.
    경유지가 역 · 정류장이면(_via_nodes) 앞 구간은 그 역 · 정류장에 닿으면 끝, 뒤 구간은 내린 자리에서 탐색의 갈아타기 규칙대로 출발한다.
    이어 붙인 길에 거르기 · 태그 · 5개 고르기 · 환승 많은 길 뒤로를 그대로 쓴다. 응답 모양은 plan 과 같다."""
    start = _walk_table(origin, _near_nodes(origin))
    stops = _via_nodes(via)
    to_via = {n: cast("Walk", (0, 0, "", *_node_point(n))) for n in stops} if stops else _walk_table(via, _near_nodes(via), reverse=True)
    from_via = _walk_table(via, _near_nodes(via))
    goal = _walk_table(dest, _near_nodes(dest), reverse=True)
    t_begin = time.monotonic()
    t0 = when.timestamp()
    # 구간이 걸어갈 만큼 가까우면 걷기도 그 구간 길 하나(plan 의 걸어가기와 같은 기준). 걷기 조회(OSRM)는 탐색 전에 다 하고
    # 탐색 예산(SEARCH_SECONDS)은 그 뒤부터 잰다 — 조회가 느려도 뒤 구간 탐색 몫을 먹지 않게(Codex 리뷰 2026-10-29)
    walk_a = walk_path(origin, via) if _meters(origin, via) < 2500 else None
    walk_b = walk_path(via, dest) if _meters(via, dest) < 2500 else None
    t_search = time.monotonic()
    found, searches = _gather(when, start, to_via, via, live, run_batch, workers, SEARCH_SECONDS * VIA_FIRST_SHARE,
                              walk_a[1] if walk_a else None)
    firsts = _via_firsts(_distinct(found))
    if walk_a and _shows_walk([r["arrive"] for r in firsts], walk_a[1], t0):
        firsts = [r for r in firsts if r["arrive"] < t0 + walk_a[1]] + [_walk_row(walk_a, origin, via, t0, "경유지까지 걸어서")]
    # 앞 구간마다 뒤 구간을 시작할 자리와 시각: 역 · 정류장 경유지에 내렸으면 그 자리에서(갈아타기 시간은 시작 걷기에 들었다), 아니면 경유지 좌표에서
    arrivals = [_via_arrival(r) if stops else None for r in firsts]
    starts = [_via_start(n, r) if n is not None else None for n, r in zip(arrivals, firsts)]
    readies = [r["arrive"] if n is not None else _via_ready(r) for r, n in zip(firsts, arrivals)]
    both = frozenset({"subway", "bus"})
    # 뒤 구간: 앞 구간마다 같은 탈것으로 먼저(종류 그대로 남게), 못 찾은 것만 남은 예산에서 둘 다로 한 번 더.
    # 역 · 정류장 경유지면 처음부터 둘 다로도 찾는다 — 지하철로 와서 그 역 근처 정류장 버스로 갈아타는 길(7호선 청담 → 143)이 빠지지 않게
    backs: list[list[Row]] = [[] for _ in firsts]   # 앞 구간 번호 → 이어 붙일 뒤 구간들
    modes_of = [_MODES.get(_kind(r), both) if any(l["type"] != "walk" for l in r["legs"]) else both for r in firsts]
    asked = [(i, modes_of[i]) for i in range(len(firsts))] + [(i, both) for i in range(len(firsts)) if starts[i] is not None and modes_of[i] != both]
    for round_no in (0, 1):
        todo = asked if round_no == 0 else [(i, both) for i in range(len(firsts)) if not backs[i] and (i, both) not in asked]
        left = SEARCH_SECONDS - (time.monotonic() - t_search)   # 앞 · 뒤 탐색에 쓴 시간만
        if not todo or left <= 0:
            continue
        jobs = [(at, _start_walks(starts[i]) or from_via, goal, live if (at - when).total_seconds() < REALTIME_HORIZON else {}, TIE_PENALTY,
                 cast("frozenset[Node]", frozenset()), modes, math.inf, dest)
                for (i, modes), at in ((item, datetime.fromtimestamp(readies[item[0]], KST)) for item in todo)]
        searches += len(jobs)
        for (i, _modes), r in zip(todo, run_batch(jobs, left)):
            if r is not None:
                backs[i].append(r)
    joined: list[Row] = []
    for i, first in enumerate(firsts):
        ready = readies[i]
        node = arrivals[i]
        walk_on = _via_walk_on(node, goal, dest, ready) if node is not None else \
            _walk_row(walk_b, via, dest, ready, "목적지까지 걸어서") if walk_b else None
        seconds_ = backs[i]
        if walk_on and (not seconds_ or _shows_walk([r["arrive"] for r in seconds_], round(walk_on["arrive"] - ready), ready)):
            seconds_ = [r for r in seconds_ if r["arrive"] < walk_on["arrive"]] or [walk_on]
        joined += [_via_join(first, second, via, starts[i]) for second in seconds_]
    best = min((r["arrive"] for r in joined), default=math.inf)
    joined = [r for r in joined if r["arrive"] <= best + ROUTE_SLACK]
    return _finish(_shaped(_distinct(joined), origin, dest, when), when, _meters(origin, dest), searches, t_begin)


def _start_walks(start: dict[Node, tuple[Walk, Row | None]] | None) -> dict[Node, Walk]:
    """_via_start → 탐색의 출발 걷기 표(없으면 빈 표 — 경유지 좌표에서 출발)."""
    return {n: w for n, (w, _leg) in start.items()} if start else {}
