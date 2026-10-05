#!/usr/bin/env python3
"""OSM 승강장 면(platforms-raw.json) 을 노선 · 역(track_shapes.json 의 stops) 에 맞춘다.

맞춤 규칙(2026-10-05, 전 역 카카오 맞춤 0단계):
- 승강장 면 하나 = way 하나 또는 relation 하나(바깥 고리 모두). highway=footway 등 보도로 그린 것은 뺀다. 주성분 방향을 긴 축으로, 그 축의
  최소~최대 범위 가운데를 면의 가운데로 본다. 길이 20~500 m 만 쓴다.
- 노선 L 의 OSM 선로(line-L.json, 그 노선 relation 의 선로 way)에서 면의 가운데가 PLATFORM_TRACK_M 안이고,
  가까운 선로 조각과 면의 축이 PLATFORM_ANGLE 도 안으로 나란하면 L 의 승강장 후보.
- 여러 노선이 후보면, 가장 가까운 선로 + 10 m 안의 노선만 남긴다(같은 선로를 나눠 쓰는 노선은 함께 남음).
- 후보 노선의 역 가운데 면의 가운데에서 가장 가까운 역(PLATFORM_STOP_M 안)에 붙인다.
명령: python3 pipeline/osm_platforms.py [--json] → 노선별 '승강장 면 있음 / 없음' 개수.
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "osm-tracks"
RAW = CACHE / "platforms-raw.json"
SHAPES = CACHE / "track_shapes.json"
PLATFORM_TRACK_M, PLATFORM_ANGLE, PLATFORM_STOP_M, SHARED_TRACK_M = 30.0, 25.0, 350.0, 10.0
WALKWAY = {"footway", "pedestrian", "path", "steps", "corridor"}
M = 111_320


def local(p, o):
    k = math.cos(math.radians(o[1]))
    return ((p[0] - o[0]) * k * M, (p[1] - o[1]) * M)


def lonlat(xy, o):
    k = math.cos(math.radians(o[1]))
    return (o[0] + xy[0] / (k * M), o[1] + xy[1] / M)


def metres(a, b):
    return math.hypot(*local(b, a))


def _area(e: dict) -> dict | None:
    if e["type"] == "way":
        rings = [e.get("geometry") or []]
    else:   # relation: 바깥 고리(역할 outer 또는 빈 역할) way 모두
        rings = [m.get("geometry") or [] for m in e.get("members", []) if m.get("type") == "way" and m.get("role") in ("outer", "")]
    pts = [(p["lon"], p["lat"]) for r in rings for p in r if p]
    if len(pts) < 2:
        return None
    if len(pts) > 2 and pts[0] == pts[-1]:
        pts = pts[:-1]
    o = (sum(x for x, _ in pts) / len(pts), sum(y for _, y in pts) / len(pts))
    xy = [local(p, o) for p in pts]
    sxx = sum(a * a for a, _ in xy); syy = sum(b * b for _, b in xy); sxy = sum(a * b for a, b in xy)
    th = 0.5 * math.atan2(2 * sxy, sxx - syy)
    ax = (math.cos(th), math.sin(th))
    along = [a * ax[0] + b * ax[1] for a, b in xy]
    across = [-a * ax[1] + b * ax[0] for a, b in xy]
    ma, mc = (max(along) + min(along)) / 2, (max(across) + min(across)) / 2
    centre = lonlat((ax[0] * ma - ax[1] * mc, ax[1] * ma + ax[0] * mc), o)
    return {"id": f"{e['type']}/{e['id']}", "tags": e.get("tags", {}), "centre": centre, "axis": ax,
            "length": max(along) - min(along), "width": max(across) - min(across), "rings": [[(p["lon"], p["lat"]) for p in r if p] for r in rings]}


@lru_cache(maxsize=1)
def load_areas(path: Path = RAW) -> tuple:
    if not path.exists():
        return ()
    out = []
    for e in json.loads(path.read_text(encoding="utf-8"))["elements"]:
        if e.get("tags", {}).get("highway") in WALKWAY:   # 보도 · 통로로 그린 면(서울역 footway 등)은 승강장이 아님
            continue
        a = _area(e)
        if a and 20 <= a["length"] <= 500:
            out.append(a)
    return tuple(out)


class Tracks:
    """한 노선의 OSM 선로 조각(경위도) + 약 200 m 칸 색인."""

    def __init__(self, data: dict):
        coord = {e["id"]: (e["lon"], e["lat"]) for e in data["elements"] if e["type"] == "node"}
        self.coord = coord
        self.adj: dict[int, list[tuple[int, float]]] = defaultdict(list)
        self.segs = []
        self.grid: dict[tuple[int, int], list[int]] = defaultdict(list)
        seen = set()
        for e in data["elements"]:
            if e["type"] != "way":
                continue
            refs = [n for n in e["nodes"] if n in coord]
            # 본선 우선: 측선 · 차량기지 선(service=*)은 경로 비용 4배(시범 eccc0e7 과 같음)
            pen = 4 if e.get("tags", {}).get("service") else 1
            for u, v in zip(refs, refs[1:]):
                if (u, v) in seen or u == v:
                    continue
                seen.add((u, v)); seen.add((v, u))
                w = metres(coord[u], coord[v]) * pen
                self.adj[u].append((v, w)); self.adj[v].append((u, w))
                i = len(self.segs)
                self.segs.append((u, v))
                steps = max(1, int(w / 100))
                for s in range(steps + 1):
                    x = coord[u][0] + (coord[v][0] - coord[u][0]) * s / steps
                    y = coord[u][1] + (coord[v][1] - coord[u][1]) * s / steps
                    cell = (int(x * 500), int(y * 500))
                    if not self.grid[cell] or self.grid[cell][-1] != i:
                        self.grid[cell].append(i)

    def nearest(self, p, cells: int = 1):
        """(거리 m, 선로 위 발, 단위 방향(동, 북), 조각 번호) 또는 None."""
        cx, cy = int(p[0] * 500), int(p[1] * 500)
        best = None
        for dx in range(-cells, cells + 1):
            for dy in range(-cells, cells + 1):
                for i in self.grid.get((cx + dx, cy + dy), ()):
                    u, v = self.segs[i]
                    a, b = local(self.coord[u], p), local(self.coord[v], p)
                    vx, vy = b[0] - a[0], b[1] - a[1]
                    l2 = vx * vx + vy * vy
                    t = 0.0 if l2 == 0 else max(0.0, min(1.0, -(a[0] * vx + a[1] * vy) / l2))
                    d = math.hypot(a[0] + vx * t, a[1] + vy * t)
                    if best is None or d < best[0]:
                        l = math.sqrt(l2) or 1
                        foot = lonlat((a[0] + vx * t, a[1] + vy * t), p)
                        best = (d, foot, (vx / l, vy / l), i)
        return best

    def _foot(self, i, p):
        u, v = self.segs[i]
        a, b = local(self.coord[u], p), local(self.coord[v], p)
        vx, vy = b[0] - a[0], b[1] - a[1]
        l2 = vx * vx + vy * vy
        t = 0.0 if l2 == 0 else max(0.0, min(1.0, -(a[0] * vx + a[1] * vy) / l2))
        return math.hypot(a[0] + vx * t, a[1] + vy * t), lonlat((a[0] + vx * t, a[1] + vy * t), p)

    def candidates(self, p, slack: float = 40.0, limit: int = 4, cells: int = 2):
        """p 둘레 선로 위 발들(가까운 순, 나란한 선로마다 하나): [(거리, 조각 번호, 발)].
        복선이 방향마다 way 하나로 그려져 멀리서만 만나므로, 역마다 몇 개를 두고 경로가 짧은 쪽을 고른다."""
        cx, cy = int(p[0] * 500), int(p[1] * 500)
        found = sorted({(self._foot(i, p)[0], i) for dx in range(-cells, cells + 1) for dy in range(-cells, cells + 1)
                        for i in self.grid.get((cx + dx, cy + dy), ())})
        picked = []
        for d, i in found:
            if picked and (d > picked[0][0] + slack or len(picked) >= limit):
                break
            if not any(set(self.segs[i]) & set(self.segs[j]) for _, j, _ in picked):
                picked.append((d, i, self._foot(i, p)[1]))
        return picked

    def route(self, a, b, budget: float | None = None):
        """선로 위 발 a=(거리, 조각, 발) 에서 b 까지 가장 짧은 선로 경로: (비용 m, [발, 노드…, 발]) 또는 None.
        비용은 측선(service=*)을 4배로 친 길이."""
        (_, ia, fa), (_, ib, fb) = a, b
        if ia == ib:
            return metres(fa, fb), [fa, fb]
        budget = budget if budget is not None else metres(fa, fb) * 1.8 + 800
        au, av = self.segs[ia]; bu, bv = self.segs[ib]
        goals = {bu: metres(self.coord[bu], fb), bv: metres(self.coord[bv], fb)}
        dist, prev, heap = {}, {}, []
        for n in (au, av):
            d = metres(fa, self.coord[n])
            if d < dist.get(n, math.inf):
                dist[n] = d
                heapq.heappush(heap, (d, n))
        best = None
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist.get(u, math.inf) or d > budget or (best and d >= best[0]):
                continue
            if u in goals and (best is None or d + goals[u] < best[0]):
                best = (d + goals[u], u)
            for v, w in self.adj[u]:
                if d + w < dist.get(v, math.inf):
                    dist[v], prev[v] = d + w, u
                    heapq.heappush(heap, (d + w, v))
        if not best:
            return None
        nodes, u = [], best[1]
        while u in prev:
            nodes.append(u)
            u = prev[u]
        nodes.append(u)
        return best[0], [fa, *[self.coord[n] for n in reversed(nodes)], fb]


@lru_cache(maxsize=None)
def line_tracks(line: str) -> Tracks | None:
    f = CACHE / f"line-{line}.json"
    return Tracks(json.loads(f.read_text(encoding="utf-8"))) if f.exists() else None


def match(stops: dict, areas=None) -> dict[str, list[dict]]:
    """{"<line>:<id>": [승강장 면, …]} — stops 는 track_shapes.json 의 stops."""
    areas = load_areas() if areas is None else areas
    by_line = defaultdict(dict)
    for k, c in stops.items():
        line, sid = k.rsplit(":", 1)
        by_line[line][k] = c
    tracks = {line: line_tracks(line) for line in by_line}
    out = defaultdict(list)
    for a in areas:
        cand = []
        for line, tr in tracks.items():
            if tr is None:
                continue
            hit = tr.nearest(a["centre"])
            if not hit or hit[0] > PLATFORM_TRACK_M:
                continue
            if abs(hit[2][0] * a["axis"][0] + hit[2][1] * a["axis"][1]) < math.cos(math.radians(PLATFORM_ANGLE)):
                continue
            cand.append((hit[0], line))
        if not cand:
            continue
        near = min(d for d, _ in cand)
        for d, line in cand:
            if d > near + SHARED_TRACK_M:
                continue
            best = min(((metres(a["centre"], c), k) for k, c in by_line[line].items()), default=None)
            if best and best[0] <= PLATFORM_STOP_M:
                out[best[1]].append(a)
    return dict(out)


def counts(stops: dict, matched: dict) -> dict:
    per = defaultdict(lambda: {"있음": 0, "없음": 0})
    for k in stops:
        per[k.rsplit(":", 1)[0]]["있음" if matched.get(k) else "없음"] += 1
    return dict(sorted(per.items(), key=lambda kv: -sum(kv[1].values())))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    stops = json.loads(SHAPES.read_text(encoding="utf-8"))["stops"]
    matched = match(stops)
    c = counts(stops, matched)
    total = {"있음": sum(v["있음"] for v in c.values()), "없음": sum(v["없음"] for v in c.values())}
    if a.json:
        print(json.dumps({"total": total, "lines": c, "areas": len(load_areas())}, ensure_ascii=False, indent=1))
    else:
        print(f"승강장 면 {len(load_areas())}개 · 역 {len(stops)}곳: 있음 {total['있음']} · 없음 {total['없음']}")
        for line, v in c.items():
            print(f"  {line}: 있음 {v['있음']} · 없음 {v['없음']}")
