#!/usr/bin/env python3
"""Snap each GTFS station-to-station edge onto real OSM track geometry.

Output: {"edges": {"<line>:<lo id>:<hi id>": [[lon, lat], ...]}, "stops": {"<line>:<id>": [lon, lat]}}.
Edges run from the lower station id to the higher one (the canonical direction the WebGL runtime
uses for line-offset); stops are each station projected onto that line's track, so transfer
stations get one on-track point per line. Edges whose
track can't be found or looks implausible are left out, and the runtime draws them straight.
Track data © OpenStreetMap contributors (ODbL).
"""

from __future__ import annotations

import heapq
import os
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "osm-tracks"
SOURCE = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"
OVERPASS = "https://overpass-api.de/api/interpreter"
USER_AGENT = "nol-meok-subway-preview/1.0"
BBOX = "36.7,126.3,38.2,128.0"
SNAP_METRES = 900
# OSM route relation name patterns for each preview line.
LINE_PATTERNS = {
    "1호선": r"^수도권 전철 1호선", "2호선": r"^서울 지하철 2호선", "3호선": r"^수도권 전철 3호선",
    "4호선": r"^수도권 전철 4호선", "5호선": r"^서울 지하철 5호선", "6호선": r"^서울 지하철 6호선",
    "7호선": r"^서울 지하철 7호선", "8호선": r"^서울 지하철 8호선", "9호선": r"^서울 지하철 9호선",
    "GTX-A": r"광역급행철도 A선", "경강선": r"^수도권 전철 경강선", "경의중앙선": r"^경의·중앙선",
    "경춘선": r"^수도권 전철 경춘선", "공항철도": r"^인천국제공항철도", "김포골드라인": r"^김포 골드라인",
    "서해선": r"^수도권 전철 서해선", "수인분당선": r"^수인·분당선", "신림선": r"신림선",
    "신분당선": r"신분당선", "에버라인선": r"^용인 경전철", "우이신설선": r"^우이신설선",
    "의정부선": r"^의정부경전철", "인천1호선": r"인천.*1호선", "인천2호선": r"인천.*2호선",
}
TRACK = r"^(rail|subway|light_rail|monorail|narrow_gauge)$"


def overpass(query: str, cache_name: str) -> dict:
    path = CACHE / cache_name
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    body = urllib.parse.urlencode({"data": query}).encode()
    mirrors = ["https://overpass.kumi.systems/api/interpreter", OVERPASS, "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
    for attempt in range(9):
        try:
            request = urllib.request.Request(mirrors[attempt % len(mirrors)], data=body, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=300) as response:
                data = json.load(response)
            break
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:  # busy public instances
            if isinstance(exc, urllib.error.HTTPError) and exc.code not in (429, 502, 503, 504) or attempt == 8:
                raise
            time.sleep(10 * (attempt + 1))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    time.sleep(3)  # be polite to the public Overpass instance
    return data


def _norm(name: str) -> str:
    return re.sub(r"역$", "", re.sub(r"\s*\([^)]*\)", "", name or "")).replace(" ", "")


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat = math.radians((a[1] + b[1]) / 2)
    return math.hypot((b[0] - a[0]) * math.cos(lat), b[1] - a[1]) * 111_320


def simplify(points: list[tuple[float, float]], tolerance: float = 4.0) -> list[tuple[float, float]]:
    """Douglas–Peucker in metres; keeps endpoints."""
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    base = metres(a, b) or 1e-9
    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        p = points[i]
        # triangle area / base = distance from p to chord a–b
        d = abs(metres(a, p) * math.sin(_angle(a, b, p))) if base > 1e-6 else metres(a, p)
        if d > worst:
            worst, index = d, i
    if worst <= tolerance:
        return [a, b]
    return simplify(points[: index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def _angle(a, b, p) -> float:
    lat = math.cos(math.radians(a[1]))
    v1 = ((b[0] - a[0]) * lat, b[1] - a[1])
    v2 = ((p[0] - a[0]) * lat, p[1] - a[1])
    return math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1])


class TrackGraph:
    def __init__(self, data: dict):
        self.coord: dict[int, tuple[float, float]] = {}
        self.tunnel: set[tuple[int, int]] = set()
        self.adj: dict[int, list[tuple[int, float]]] = defaultdict(list)
        for e in data["elements"]:
            if e["type"] == "node":
                self.coord[e["id"]] = (e["lon"], e["lat"])
        for e in data["elements"]:
            if e["type"] != "way":
                continue
            refs = [n for n in e["nodes"] if n in self.coord]
            tags = e.get("tags", {})
            under = tags.get("tunnel") not in (None, "no") or str(tags.get("layer", "0")).lstrip("-").isdigit() and int(tags.get("layer", "0")) < 0
            for u, v in zip(refs, refs[1:]):
                w = metres(self.coord[u], self.coord[v])
                self.adj[u].append((v, w))
                if under:
                    self.tunnel.add((u, v))
                    self.tunnel.add((v, u))
                self.adj[v].append((u, w))
        # Segment index on a ~1 km grid; long segments are registered in every cell they cross.
        self.segments: dict[tuple[int, int], set[tuple[int, int]]] = defaultdict(set)
        for u, edges in self.adj.items():
            for v, w in edges:
                if u < v:
                    steps = max(1, int(w / 300))
                    for i in range(steps + 1):
                        lon = self.coord[u][0] + (self.coord[v][0] - self.coord[u][0]) * i / steps
                        lat = self.coord[u][1] + (self.coord[v][1] - self.coord[u][1]) * i / steps
                        self.segments[(int(lon * 100), int(lat * 100))].add((u, v))

    def candidates(self, point: tuple[float, float], slack: float = 40.0, limit: int = 4) -> list[tuple]:
        """On-track projections near a stop, one per nearby segment, nearest first.

        Double track is usually mapped as one way per direction and the two only meet far away,
        so a stop keeps a few candidates (one per parallel track) and each edge picks the pair
        that gives the shortest route."""
        cx, cy = int(point[0] * 100), int(point[1] * 100)
        kx = math.cos(math.radians(point[1]))
        found = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for u, v in self.segments.get((cx + dx, cy + dy), ()):
                    a, b = self.coord[u], self.coord[v]
                    ax, ay, bx, by = a[0] * kx, a[1], b[0] * kx, b[1]
                    px, py = point[0] * kx, point[1]
                    seg = (bx - ax) ** 2 + (by - ay) ** 2
                    t = 0.0 if seg == 0 else max(0.0, min(1.0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / seg))
                    q = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
                    d = metres(point, q)
                    if d <= SNAP_METRES:
                        found.append((d, u, v, q))
        found.sort()
        if not found:
            return []
        picked = []
        for hit in found:
            if hit[0] > found[0][0] + slack or len(picked) >= limit:
                break
            # skip segments that touch one already picked (same track, adjacent segment)
            if not any({hit[1], hit[2]} & {p[1], p[2]} for p in picked):
                picked.append(hit)
        return picked

    def path(self, starts, goals, budget: float):
        goal_cost = {n: d for d, n in goals}
        dist, prev, heap = {}, {}, []
        for d, n in starts:
            dist[n] = d
            heapq.heappush(heap, (d, n))
        best = None
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist.get(u, math.inf) or d > budget:
                continue
            if u in goal_cost:
                total = d + goal_cost[u]
                if best is None or total < best[0]:
                    best = (total, u)
            if best and d > best[0]:
                break
            for v, w in self.adj[u]:
                nd = d + w
                if nd < dist.get(v, math.inf):
                    dist[v], prev[v] = nd, u
                    heapq.heappush(heap, (nd, v))
        if not best:
            return None
        node, nodes = best[1], []
        while node in prev:
            nodes.append(node)
            node = prev[node]
        nodes.append(node)
        return best[0], [self.coord[n] for n in reversed(nodes)], list(reversed(nodes))


# OSM draws some subway tunnels as single straight segments over a kilometre long (e.g. 7호선
# 용마산–사가정 runs over a school). Seoul's lines mostly run under main roads, so a straight tunnel
# piece longer than COARSE_METRES is replaced by the main-road route between its ends when that
# route is at most ROAD_DETOUR× the straight distance.
COARSE_METRES, ROAD_DETOUR, ROAD_SNAP_METRES, ROAD_MAX_PIECE = 500, 1.3, 120, 1600
# Short downtown gaps may follow streets that bend well away from the chord (용마산–사가정 via 용마산로).
SHORT_GAP_METRES, SHORT_GAP_DETOUR = 1200, 1.8
ROAD_END_METRES, ROAD_SMOOTH_METRES = 60, 25
# Deep / regional tunnels (GTX-A, 신분당선 …) run straight regardless of streets: never road-match them.
NO_ROAD_MATCH = {"GTX-A", "신분당선", "공항철도", "서해선", "경강선", "경춘선", "경의중앙선"}
ROAD_CLASSES = "trunk|primary|secondary|tertiary|trunk_link|primary_link|secondary_link"


class RoadGraph:
    def __init__(self):
        self.coord: dict[int, tuple[float, float]] = {}
        self.adj: dict[int, list[tuple[int, float]]] = defaultdict(list)
        self.grid: dict[tuple[int, int], list[int]] = defaultdict(list)
        self.tiles: set = set()
        self.bridge: set[tuple[int, int]] = set()
        self.replaced = 0

    def load(self, data: dict) -> None:
        for e in data["elements"]:
            if e["type"] == "node" and e["id"] not in self.coord:
                self.coord[e["id"]] = (e["lon"], e["lat"])
                self.grid[(int(e["lon"] * 500), int(e["lat"] * 500))].append(e["id"])
        for e in data["elements"]:
            if e["type"] == "way":
                if str(e.get("tags", {}).get("highway", "")).endswith("_link"):
                    continue   # interchange ramps loop around junctions; subways don't follow them
                refs = [n for n in e["nodes"] if n in self.coord]
                on_bridge = e.get("tags", {}).get("bridge") not in (None, "no")
                for u, v in zip(refs, refs[1:]):
                    w_ = metres(self.coord[u], self.coord[v])
                    self.adj[u].append((v, w_))
                    self.adj[v].append((u, w_))
                    if on_bridge:
                        self.bridge.add((u, v))
                        self.bridge.add((v, u))

    def fetch_wide(self, pieces: list[tuple[tuple[float, float], tuple[float, float]]]) -> None:
        """One request per chunk: main roads within 700 m plus named minor through-roads within 300 m."""
        import hashlib
        for i in range(0, len(pieces), 30):
            chunk = pieces[i:i + 30]
            clauses = "".join(f'way["highway"~"^({ROAD_CLASSES})$"](around:700,{a[1]:.6f},{a[0]:.6f},{b[1]:.6f},{b[0]:.6f});'
                              f'way["highway"~"^(residential|unclassified|tertiary_link)$"]["name"~"로$"](around:300,{a[1]:.6f},{a[0]:.6f},{b[1]:.6f},{b[0]:.6f});' for a, b in chunk)
            tag = hashlib.sha1(clauses.encode()).hexdigest()[:12]
            self.load(overpass(f"[out:json][timeout:300];({clauses});(._;>;);out body qt;", f"roads/wide-{tag}.json"))
            self.tiles.add(tag)

    def fetch_along(self, pieces: list[tuple[tuple[float, float], tuple[float, float]]], radius: int = 300, minor: bool = False) -> None:
        """Main roads within `radius` m of each straight piece, a few batched Overpass calls (cached)."""
        import hashlib
        for i in range(0, len(pieces), 30):
            chunk = pieces[i:i + 30]
            # minor=True: named through-roads OSM grades as residential/unclassified in parts (면목로), not "…길" alleys
            sel = '["highway"~"^(residential|unclassified|tertiary_link)$"]["name"~"로$"]' if minor else f'["highway"~"^({ROAD_CLASSES})$"]'
            clauses = "".join(f'way{sel}(around:{radius},{a[1]:.6f},{a[0]:.6f},{b[1]:.6f},{b[0]:.6f});' for a, b in chunk)
            tag = hashlib.sha1(clauses.encode()).hexdigest()[:12]
            self.load(overpass(f"[out:json][timeout:240];({clauses});(._;>;);out body qt;", f"roads/along-{tag}.json"))
            self.tiles.add(tag)

    def _nearest(self, p: tuple[float, float]):
        cx, cy = int(p[0] * 500), int(p[1] * 500)   # ~200 m cells
        best = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for n in self.grid.get((cx + dx, cy + dy), ()):
                    d = metres(p, self.coord[n])
                    if d <= ROAD_SNAP_METRES and (best is None or d < best[0]):
                        best = (d, n)
        return best

    def follow(self, a: tuple[float, float], b: tuple[float, float], detour: float = ROAD_DETOUR):
        """Main-road polyline from a to b (a and b included), or None if no plausible one."""
        straight = metres(a, b)
        sa, sb = self._nearest(a), self._nearest(b)
        if not sa or not sb:
            return None
        budget = straight * detour
        dist, prev, heap = {sa[1]: sa[0]}, {}, [(sa[0], sa[1])]
        while heap:
            d, u = heapq.heappop(heap)
            if u == sb[1] or d > budget:
                break
            if d > dist.get(u, math.inf):
                continue
            for v, w_ in self.adj[u]:
                nd = d + w_
                if nd < dist.get(v, math.inf):
                    dist[v], prev[v] = nd, u
                    heapq.heappush(heap, (nd, v))
        if sb[1] not in dist or dist[sb[1]] + sb[0] > budget:
            return None
        nodes, u = [], sb[1]
        while u in prev:
            nodes.append(u)
            u = prev[u]
        nodes.append(u)
        # a tunnel that "follows" a road over a long bridge is a river crossing: keep the track line
        if sum(metres(self.coord[x], self.coord[y]) for x, y in zip(nodes, nodes[1:]) if (x, y) in self.bridge) > 150:
            return None
        self.replaced += 1
        # Keep only the road's broad course: drop road points near the ends so the line eases off the
        # track into the street, then flatten junction / carriageway jogs below ROAD_SMOOTH_METRES.
        road = [self.coord[n] for n in reversed(nodes)]
        road = [p for p in road if metres(p, a) > ROAD_END_METRES and metres(p, b) > ROAD_END_METRES]
        return simplify([a, *road, b], ROAD_SMOOTH_METRES)


ROADS = RoadGraph()

# Station platforms are drawn along the street the station sits under, and the route line is
# re-threaded so it enters and leaves each platform at its two ends.
PLATFORM_HALF_METRES, PLATFORM_JOIN_METRES, STATION_ROAD_METRES, STATION_ROAD_MAX_ANGLE = 90, 15, 50, 45


def _local(p, origin):
    k = math.cos(math.radians(origin[1]))
    return ((p[0] - origin[0]) * k * 111_320, (p[1] - origin[1]) * 111_320)


def _lonlat(xy, origin):
    k = math.cos(math.radians(origin[1]))
    return (origin[0] + xy[0] / (k * 111_320), origin[1] + xy[1] / 111_320)


def station_roads(points: list[tuple[float, float]]):
    """Road segments near every stop (main + tertiary streets within STATION_ROAD_METRES), cached."""
    import hashlib
    graph = RoadGraph()
    for i in range(0, len(points), 60):
        chunk = points[i:i + 60]
        clauses = "".join(f'way["highway"~"^(trunk|primary|secondary|tertiary)$"](around:{STATION_ROAD_METRES},{y:.6f},{x:.6f});' for x, y in chunk)
        tag = hashlib.sha1(clauses.encode()).hexdigest()[:12]
        graph.load(overpass(f"[out:json][timeout:240];({clauses});(._;>;);out body qt;", f"roads/stations-{tag}.json"))
    return graph


def orient_stations(shapes: dict, stops: dict) -> dict:
    # track direction at each stop, from the edges that touch it
    touching = defaultdict(list)
    for k, pts in shapes.items():
        line, lo, hi = k.rsplit(":", 2)
        touching[f"{line}:{lo}"].append((k, 0))
        touching[f"{line}:{hi}"].append((k, -1))
    graph = station_roads(sorted({tuple(v) for v in stops.values()}))
    dirs = {}
    for sk, c in stops.items():
        c = tuple(c)
        # track direction: chord through points ~40 m either side along the touching edges
        ends = []
        for k, idx in touching.get(sk, []):
            pts = shapes[k] if idx == 0 else shapes[k][::-1]
            acc, prev = 0.0, pts[0]
            for p in pts[1:]:
                acc += metres(prev, p)
                prev = p
                if acc >= 40:
                    break
            ends.append(_local(prev, c))
        if len(ends) >= 2:
            tx, ty = ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]
        elif ends:
            tx, ty = ends[0]
        else:
            continue
        tl = math.hypot(tx, ty) or 1
        tx, ty = tx / tl, ty / tl
        dx, dy = tx, ty
        # nearest street segment
        best = None
        cx, cy = int(c[0] * 500), int(c[1] * 500)
        for ddx in (-1, 0, 1):
            for ddy in (-1, 0, 1):
                for n in graph.grid.get((cx + ddx, cy + ddy), ()):
                    for m, _ in graph.adj[n]:
                        a, b = _local(graph.coord[n], c), _local(graph.coord[m], c)
                        vx, vy = b[0] - a[0], b[1] - a[1]
                        vl2 = vx * vx + vy * vy
                        if vl2 < 1:
                            continue
                        t = max(0.0, min(1.0, -(a[0] * vx + a[1] * vy) / vl2))
                        d = math.hypot(a[0] + vx * t, a[1] + vy * t)
                        if d <= STATION_ROAD_METRES and (best is None or d < best[0]):
                            best = (d, vx / math.sqrt(vl2), vy / math.sqrt(vl2))
        if best:
            rx, ry = best[1], best[2]
            if rx * tx + ry * ty < 0:
                rx, ry = -rx, -ry
            if math.degrees(math.acos(max(-1.0, min(1.0, rx * tx + ry * ty)))) <= STATION_ROAD_MAX_ANGLE:
                dx, dy = rx, ry
        dirs[sk] = [round(dx, 5), round(dy, 5)]
    # re-thread each edge: centre → platform end → (track beyond the platform) → platform end → centre
    for k, pts in list(shapes.items()):
        line, lo, hi = k.rsplit(":", 2)
        ka, kb = f"{line}:{lo}", f"{line}:{hi}"
        if ka not in dirs or kb not in dirs:
            continue
        ca, cb = tuple(stops[ka]), tuple(stops[kb])
        def end_toward(c, d, target):
            tx_, ty_ = _local(target, c)
            sign = 1 if d[0] * tx_ + d[1] * ty_ >= 0 else -1
            return _lonlat((d[0] * PLATFORM_HALF_METRES * sign, d[1] * PLATFORM_HALF_METRES * sign), c)
        ea, eb = end_toward(ca, dirs[ka], cb), end_toward(cb, dirs[kb], ca)
        keep = [tuple(p) for p in pts[1:-1]
                if metres(p, ca) > PLATFORM_HALF_METRES + PLATFORM_JOIN_METRES and metres(p, cb) > PLATFORM_HALF_METRES + PLATFORM_JOIN_METRES]
        if metres(ca, cb) < 2 * PLATFORM_HALF_METRES + 20:
            continue   # stations too close for full platforms: leave the track as it is
        shapes[k] = [[round(x, 6), round(y, 6)] for x, y in [ca, ea, *keep, eb, cb]]
    return dirs


def main(out_paths: list[Path]) -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    nodes = {n["id"]: (n["lon"], n["lat"]) for n in source["nodes"]}
    # merged transfer stations keep each line's own platform position
    platforms = {(line, n["id"]): tuple(xy) for n in source["nodes"] for line, xy in n.get("platforms", {}).items()}
    names = {n["id"]: n["name"] for n in source["nodes"]}
    # KTDB points often sit on an entrance or the station building; OSM station nodes (fetched into
    # stations.json) mark the station itself, often one node per line at interchanges.
    osm_by_name: dict[str, list[tuple[float, float]]] = defaultdict(list)
    stations_file = CACHE / "stations.json"
    if stations_file.exists():
        for e in json.loads(stations_file.read_text(encoding="utf-8"))["elements"]:
            for k in ("name", "name:ko"):
                if e.get("tags", {}).get(k):
                    osm_by_name[_norm(e["tags"][k])].append((e["lon"], e["lat"]))
    osm_used = 0
    relations = overpass(f'[out:json][timeout:180];relation["type"="route"]["route"~"^(subway|train|light_rail|monorail)$"]({BBOX});out tags;', "relations.json")
    shapes, stops, report = {}, {}, {}
    raw_routes: dict[str, tuple[list, list]] = {}
    for line, variants in source["lines"].items():
        pattern = re.compile(LINE_PATTERNS.get(line, r"^$"))
        ids = [e["id"] for e in relations["elements"] if pattern.search(e["tags"].get("name", ""))]
        edges = {tuple(sorted((a, b))) for v in variants if "급행" not in v["name"] for a, b in zip(v["stops"], v["stops"][1:])}
        if not ids:
            report[line] = {"relations": 0, "edges": len(edges), "snapped": 0}
            continue
        data = overpass(f'[out:json][timeout:240];relation(id:{",".join(map(str, ids))});way(r)["railway"~"{TRACK}"];(._;>;);out body qt;', f"line-{line}.json")
        graph = TrackGraph(data)
        # One on-track position per (line, station) so both edges meeting at a stop share an endpoint.
        def anchor(n: int) -> tuple[float, float]:
            """Where to snap stop n on this line: the same-name OSM station nearest this line's
            track (within 1 km of the KTDB point), else the KTDB / platform point."""
            nonlocal osm_used
            ktdb = platforms.get((line, n), nodes[n])
            best = None
            for xy in osm_by_name.get(_norm(names[n]), []):
                if metres(xy, ktdb) > 1000:
                    continue
                hit = graph.candidates(xy)
                if hit and (best is None or hit[0][0] < best[0]):
                    best = (hit[0][0], xy)
            if best and best[0] <= 150:
                osm_used += 1
                return best[1]
            return ktdb

        snaps = {n: graph.candidates(anchor(n)) for n in {n for edge in edges for n in edge}}
        routes: dict[tuple, tuple | None] = {}

        def route(a: int, i: int, b: int, j: int):
            """Track route from candidate i of stop a to candidate j of stop b (cached)."""
            key = (a, i, b, j)
            if key not in routes:
                (_, au, av, qa), (_, bu, bv, qb) = snaps[a][i], snaps[b][j]
                straight = metres(qa, qb)
                if {au, av} == {bu, bv}:
                    routes[key] = (straight, [qa, qb], [(au, av) in graph.tunnel])
                else:
                    starts = [(metres(qa, graph.coord[au]), au), (metres(qa, graph.coord[av]), av)]
                    goals = [(metres(qb, graph.coord[bu]), bu), (metres(qb, graph.coord[bv]), bv)]
                    found = graph.path(starts, goals, budget=straight * 1.8 + 800)
                    if found:
                        ids = found[2]
                        # flags per consecutive piece: qa→first node, node→node…, last node→qb
                        flags = [(au, av) in graph.tunnel] + [(x, y) in graph.tunnel for x, y in zip(ids, ids[1:])] + [(bu, bv) in graph.tunnel]
                        routes[key] = (found[0], [qa, *found[1], qb], flags)
                    else:
                        routes[key] = None
            return routes[key]

        # Pick one candidate per stop along each service pattern (Viterbi): the cheapest chain
        # stays on one physical track instead of hopping between the two directions' ways.
        chosen: dict[int, int] = {}
        for variant in variants:
            if "급행" in variant["name"]:
                continue
            seq = [n for n in variant["stops"] if snaps.get(n)]
            if len(seq) < 2:
                continue
            options = [[chosen[n]] if n in chosen else list(range(len(snaps[n]))) for n in seq]
            cost = [{i: snaps[seq[0]][i][0] for i in options[0]}]
            back = [{}]
            for k in range(1, len(seq)):
                cost.append({})
                back.append({})
                for j in options[k]:
                    best = None
                    for i, c in cost[k - 1].items():
                        r = route(seq[k - 1], i, seq[k], j)
                        # unroutable hop: allow it at a high price so the chain survives
                        total = c + (r[0] if r else 50_000) + snaps[seq[k]][j][0]
                        if best is None or total < best[0]:
                            best = (total, i)
                    cost[k][j], back[k][j] = best
            j = min(cost[-1], key=cost[-1].get)
            for k in range(len(seq) - 1, -1, -1):
                chosen.setdefault(seq[k], j)
                j = back[k].get(j, j)
        for n, hits in snaps.items():
            if hits:
                q = hits[chosen.get(n, 0)][3]
                stops[f"{line}:{n}"] = [round(q[0], 6), round(q[1], 6)]
        snapped = 0
        for lo, hi in sorted(edges):
            if not snaps.get(lo) or not snaps.get(hi):
                continue
            r = route(lo, chosen.get(lo, 0), hi, chosen.get(hi, 0))
            if not r:
                # chosen tracks don't connect here (loop joins, direction splits): take any pair
                # and bridge from/to the shared stop points
                pairs = [route(lo, i, hi, j) for i in range(len(snaps[lo])) for j in range(len(snaps[hi]))]
                pairs = [x for x in pairs if x]
                if not pairs:
                    continue
                best = min(pairs, key=lambda x: x[0])
                r = (best[0], [tuple(stops[f"{line}:{lo}"]), *best[1], tuple(stops[f"{line}:{hi}"])], [False, *best[2], False])
            raw_routes[f"{line}:{lo}:{hi}"] = (r[1], r[2] if len(r) > 2 else [])
            points = simplify(r[1])
            shapes[f"{line}:{lo}:{hi}"] = [[round(x, 6), round(y, 6)] for x, y in points]
            snapped += 1
        report[line] = {"relations": len(ids), "edges": len(edges), "snapped": snapped}
    # Coarse straight tunnel pieces → main-road routes (roads fetched once for all of them).
    coarse = lambda raw, flags: [(raw[i], raw[i + 1]) for i in range(len(raw) - 1)
                                 if i < len(flags) and flags[i] and COARSE_METRES < metres(raw[i], raw[i + 1]) <= ROAD_MAX_PIECE]
    raw_routes = {k: v for k, v in raw_routes.items() if k.rsplit(":", 2)[0] not in NO_ROAD_MATCH}
    pieces = sorted({p for raw, flags in raw_routes.values() for p in coarse(raw, flags)})
    # Road matching is experimental (road polylines add jogs at junctions); off unless ROAD_MATCH=1.
    if os.environ.get("ROAD_MATCH") != "1":
        pieces = []
    if pieces:
        # main roads nearby, main roads that bow far from the line (용마산로), and named minor through-roads
        # (면목로): always fetched for the full piece list so the requests are identical and cached
        ROADS.fetch_along(pieces)
        # only the pieces the nearby main roads can't serve need the wide / minor-road corridor
        # (deterministic for fixed rules, so the request stays cached)
        missed = [(a, b) for a, b in pieces
                  if not ROADS.follow(a, b, SHORT_GAP_DETOUR if metres(a, b) <= SHORT_GAP_METRES else ROAD_DETOUR)]
        ROADS.fetch_wide(missed)
        ROADS.replaced = 0
        for k, (raw, flags) in raw_routes.items():
            if os.environ.get("DEBUG_EDGE") == k:
                print("DEBUG", k, "raw", len(raw), "flags", flags, "lens", [round(metres(raw[i], raw[i + 1])) for i in range(len(raw) - 1)], file=sys.stderr)
            if not coarse(raw, flags):
                continue
            # When straight tunnel pieces make up most of the gap, match the whole station-to-station
            # run: the road detour is then judged against the full gap, not just the straight piece.
            total = sum(metres(raw[i], raw[i + 1]) for i in range(len(raw) - 1)) or 1
            detour = SHORT_GAP_DETOUR if total <= SHORT_GAP_METRES else ROAD_DETOUR   # judged on the station gap
            whole = ROADS.follow(raw[0], raw[-1], detour) if sum(metres(a_, b_) for a_, b_ in coarse(raw, flags)) / total >= 0.7 else None
            if whole:
                shapes[k] = [[round(x, 6), round(y, 6)] for x, y in simplify(whole)]
                continue
            points = [raw[0]]
            for i in range(len(raw) - 1):
                a_, b_ = raw[i], raw[i + 1]
                road = ROADS.follow(a_, b_, detour) if i < len(flags) and flags[i] and metres(a_, b_) > COARSE_METRES else None
                points.extend(road[1:] if road else [b_])
            shapes[k] = [[round(x, 6), round(y, 6)] for x, y in simplify(points)]
    # Hand-picked courses (manual_routes.json) override the automatic shape for their edge.
    manual_file = CACHE / "manual_routes.json"
    if manual_file.exists():
        by_name = {(line, n["name"]): n["id"] for n in source["nodes"] for line in n["lines"]}
        for k, via in json.loads(manual_file.read_text(encoding="utf-8")).items():
            if k.startswith("_"):
                continue
            line, a_name, b_name = k.split("|")
            a, b = by_name.get((line, a_name)), by_name.get((line, b_name))
            if a is None or b is None or f"{line}:{a}" not in stops or f"{line}:{b}" not in stops:
                print(f"manual route skipped: {k}", file=sys.stderr)
                continue
            pts = [stops[f"{line}:{a}"], *via, stops[f"{line}:{b}"]]
            if a > b:
                pts.reverse()
            shapes[f"{line}:{min(a, b)}:{max(a, b)}"] = pts
    stop_dirs = orient_stations(shapes, stops)
    payload = json.dumps({"edges": shapes, "stops": stops, "stopDirs": stop_dirs}, ensure_ascii=False, separators=(",", ":"))
    for out in out_paths:
        out.write_text(payload, encoding="utf-8")
    print(json.dumps({"coarse_tunnel_pieces": len(pieces), "road_matched_tunnel_pieces": ROADS.replaced, "road_requests": len(ROADS.tiles), "osm_station_anchors": osm_used, "shapes": len(shapes), "stops": len(stops), "bytes": len(payload), "lines": report}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main([Path(p) for p in sys.argv[1:]] or [ROOT / "data" / "osm-tracks" / "track_shapes.json"])
