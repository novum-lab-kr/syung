#!/usr/bin/env python3
"""Bus routes along the roads → data/bus-shapes.json, for drawing bus legs of 길찾기.

The KTDB GTFS has no shapes, so each pattern of data/bus.json is map-matched through its stops (as a
trace timed by the timetable) on the OSRM bus-road graph (server/osrm-build-bus.sh; OSRM_BUS_URL,
default http://127.0.0.1:5001). Matching picks one continuous road path instead of forcing the
route through each snapped stop, which made loops into side streets and U-turns at stops. A leg the
matcher skips, or that detours absurdly, is routed on its own; failing that it stays straight.
Output: {"<pattern index>": [polyline6, [point index of each stop]]}, simplified to ~3 m.
Rebuild whenever data/bus.json is rebuilt (pattern indices).
Usage: build_bus_shapes.py [--limit N]
"""

from __future__ import annotations

import json
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUS = ROOT / "data" / "bus.json"
OUT = ROOT / "data" / "bus-shapes.json"
OSRM = os.environ.get("OSRM_BUS_URL", "http://127.0.0.1:5001").rstrip("/")
CHUNK = 300           # stops per match request (overlapping by one); osrm-routed --max-matching-size 500
MATCH_RADIUS = 50     # metres a stop may sit from its road
STATS = {"legs": 0, "retried": 0, "straight": 0, "kinked": 0}
DETOUR = 3.0          # a leg longer than DETOUR × straight + 400 m is a mis-snap


def metres(a, b) -> float:
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    return 6371000 * math.hypot(x, math.radians(b[1] - a[1]))


def decode(s: str, precision: int = 6) -> list[list[float]]:
    pts, i, lat, lng, f = [], 0, 0, 0, 10 ** precision
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
        pts.append([lng / f, lat / f])
    return pts


def encode(pts: list[list[float]], precision: int = 6) -> str:
    out, plat, plng, f = [], 0, 0, 10 ** precision
    for lng, lat in pts:
        ilat, ilng = round(lat * f), round(lng * f)
        for d in (ilat - plat, ilng - plng):
            v = ~(d << 1) if d < 0 else d << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        plat, plng = ilat, ilng
    return "".join(out)


def simplify(pts: list[list[float]], tol: float = 3.0) -> list[int]:
    """Douglas–Peucker on a short stretch (metres, local flat projection): kept indices."""
    if len(pts) < 3:
        return list(range(len(pts)))
    lat0 = math.radians(pts[0][1])
    xy = [(math.radians(p[0]) * math.cos(lat0) * 6371000, math.radians(p[1]) * 6371000) for p in pts]
    keep, stack = {0, len(pts) - 1}, [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = xy[a], xy[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = 0.0, -1
        for i in range(a + 1, b):
            d = abs((xy[i][0] - ax) * dy - (xy[i][1] - ay) * dx) / L
            if d > best:
                best, bi = d, i
        if best > tol:
            keep.add(bi)
            stack += [(a, bi), (bi, b)]
    return sorted(keep)


def route_legs(coords: list[list[float]], curb: bool = True) -> list[list[list[float]]] | None:
    """OSRM through the stops: one point list per leg (stop i → i+1)."""
    q = ";".join(f"{x:.6f},{y:.6f}" for x, y in coords)
    url = (f"{OSRM}/route/v1/driving/{q}?overview=false&steps=true&geometries=polyline6&continue_straight=false"
           + (f"&approaches={';'.join(['curb'] * len(coords))}" if curb else ""))
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            res = json.load(r)
    except (OSError, ValueError):
        return None
    if res.get("code") != "Ok":
        return None
    legs = []
    for leg in res["routes"][0]["legs"]:
        pts = []
        for st in leg["steps"]:
            g = decode(st["geometry"])
            pts += g[1:] if pts else g
        legs.append(pts)
    return legs


def match_legs(coords: list[list[float]], times: list[float]) -> list:
    """OSRM map matching of the stops as a trace (timetable times): the likeliest continuous road
    path, one point list per leg (None where the matcher skipped a stop)."""
    q = ";".join(f"{x:.6f},{y:.6f}" for x, y in coords)
    url = (f"{OSRM}/match/v1/driving/{q}?overview=false&steps=true&geometries=polyline6&gaps=ignore&tidy=false"
           f"&radiuses={';'.join([str(MATCH_RADIUS)] * len(coords))}"
           f"&timestamps={';'.join(str(int(t) + i) for i, t in enumerate(times))}")
    out = [None] * (len(coords) - 1)
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            res = json.load(r)
    except (OSError, ValueError):
        return out
    if res.get("code") != "Ok":
        return out
    tp = res["tracepoints"]
    for mi, m in enumerate(res["matchings"]):
        idx = [i for i, t in enumerate(tp) if t and t["matchings_index"] == mi]
        for li, leg in enumerate(m["legs"]):
            if idx[li + 1] != idx[li] + 1:
                continue
            pts = []
            for st in leg["steps"]:
                g = decode(st["geometry"])
                pts += g[1:] if pts else g
            out[idx[li]] = pts
    return out


def ok(leg, a, b) -> bool:
    if not leg or len(leg) < 2:
        return False
    return sum(metres(leg[i], leg[i + 1]) for i in range(len(leg) - 1)) <= DETOUR * metres(a, b) + 400


def shape(p: dict, stops: list) -> list | None:
    coords = [[stops[i][2], stops[i][1]] for i in p["s"]]
    times = [p["d"][0][0] + t for t in p["t"]]
    legs: list = []
    for c0 in range(0, len(coords) - 1, CHUNK - 1):
        legs += match_legs(coords[c0:c0 + CHUNK], times[c0:c0 + CHUNK])
    pts, idx = [], []
    for k, leg in enumerate(legs):
        a, b = coords[k], coords[k + 1]
        STATS["legs"] += 1
        if not ok(leg, a, b):
            # skipped by the matcher, or a detour: this leg alone, kerb side first, then either side
            alone = route_legs([a, b])
            if not (alone and ok(alone[0], a, b)):
                alone = route_legs([a, b], curb=False)
            leg = alone[0] if alone and ok(alone[0], a, b) else None
            STATS["retried"] += 1
            if not leg:
                STATS["straight"] += 1
        seg = leg if leg and len(leg) >= 2 else [a, b]
        if leg and sum(metres(leg[i], leg[i + 1]) for i in range(len(leg) - 1)) > 1.25 * metres(a, b) + 150:
            STATS["kinked"] += 1   # longer than it looks: worth a glance
        seg = [seg[i] for i in simplify(seg)]
        if not pts:
            pts.append(seg[0])
        idx.append(len(pts) - 1)
        pts += seg[1:]
    idx.append(len(pts) - 1)
    return [encode([[round(x, 6), round(y, 6)] for x, y in pts]), idx]


def main() -> None:
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    bus = json.loads(BUS.read_text(encoding="utf-8"))
    pats = bus["patterns"][:limit] if limit else bus["patterns"]
    out, done = {}, 0
    with ThreadPoolExecutor(4) as ex:
        for i, r in enumerate(ex.map(lambda p: shape(p, bus["stops"]), pats)):
            if r:
                out[str(i)] = r
            done += 1
            if done % 250 == 0:
                print(f"{done}/{len(pats)}", flush=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"patterns": len(out), "bytes": OUT.stat().st_size, **STATS}))


if __name__ == "__main__":
    main()
