#!/usr/bin/env python3
"""Put chosen stations back on their platform: data/osm-tracks/stop_overrides.json → track_shapes.json.

build_track_shapes.py places each stop from the station point, then re-centres it on the station's
exits and on nearby platform areas; at some stations that moved it 100–270 m along the track
(2026-09-30 audit: 2호선 홍대입구, 8호선 잠실, 5호선 마곡, 6호선 화랑대, …). For those, the stop is
set from OSM's stop_position nodes of that line (the trains' stopping points, one per direction:
their middle is the platform's middle), projected onto the line's track, and the station's edges
are cut and joined again at that point.
stop_overrides.json: {"<line>|<station name>": [lng, lat]} (the anchor; projected here).
Run after build_track_shapes.py (it calls apply() itself), or alone to patch track_shapes.json.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHAPES = ROOT / "data" / "osm-tracks" / "track_shapes.json"
OVERRIDES = ROOT / "data" / "osm-tracks" / "stop_overrides.json"
METRO = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"


def _xy(p, o):
    k = math.cos(math.radians(o[1]))
    return ((p[0] - o[0]) * k * 111320, (p[1] - o[1]) * 111320)


def _metres(a, b):
    return math.hypot(*_xy(a, b))


def _project(pts, q):
    """(segment index, point) on the polyline nearest q."""
    best = None
    for i in range(len(pts) - 1):
        ax, ay = _xy(pts[i], q); bx, by = _xy(pts[i + 1], q); vx, vy = bx - ax, by - ay
        l2 = vx * vx + vy * vy
        t = 0.0 if l2 == 0 else max(0.0, min(1.0, -(ax * vx + ay * vy) / l2))
        d = math.hypot(ax + vx * t, ay + vy * t)
        if best is None or d < best[0]:
            p = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]
            best = (d, i, p)
    return best


def move_stop(ts: dict, line: str, sid: int, anchor) -> tuple[float, float] | None:
    """Move stops[line:sid] onto the track nearest `anchor`, re-cutting its (one or two) edges.
    Returns (metres moved, anchor → track metres), or None where the station has 3+ edges."""
    keys = [k for k in ts["edges"] if k.startswith(line + ":") and str(sid) in k.split(":")[1:] and k.count(":") == 2]
    keys = [k for k in keys if str(sid) in (k.split(":")[1], k.split(":")[2])]
    if not 1 <= len(keys) <= 2:
        return None
    # each edge oriented to run into the station, then the path through it: in[0] … station … in[1] reversed
    ins = []
    for k in keys:
        _, lo, hi = k.split(":")
        pts = ts["edges"][k]
        ins.append((k, pts if int(hi) == sid else pts[::-1], int(hi) == sid))
    through = ins[0][1] + (ins[1][1][::-1][1:] if len(ins) == 2 else [])
    d, i, p = _project(through, anchor)
    old = ts["stops"][f"{line}:{sid}"]
    first, second = through[:i + 1] + [p], [p] + through[i + 1:]   # neighbour → station, station → neighbour
    rnd = lambda q: [round(q[0], 6), round(q[1], 6)]
    k0, _, hi0 = ins[0]
    ts["edges"][k0] = [rnd(q) for q in (first if hi0 else first[::-1])]
    if len(ins) == 2:
        k1, _, hi1 = ins[1]
        ts["edges"][k1] = [rnd(q) for q in (second[::-1] if hi1 else second)]
    ts["stops"][f"{line}:{sid}"] = rnd(p)
    return _metres(old, p), d


def apply(ts: dict) -> list:
    if not OVERRIDES.exists():
        return []
    metro = json.loads(METRO.read_text(encoding="utf-8"))
    by_name = {(line, n["name"]): n["id"] for n in metro["nodes"] for line in n["lines"]}
    done = []
    for k, anchor in json.loads(OVERRIDES.read_text(encoding="utf-8")).items():
        if k.startswith("_"):
            continue
        line, name = k.split("|")
        sid = by_name.get((line, name))
        r = move_stop(ts, line, sid, anchor) if sid is not None and f"{line}:{sid}" in ts["stops"] else None
        done.append((k, None if r is None else (round(r[0]), round(r[1]))))
    return done


if __name__ == "__main__":
    ts = json.loads(SHAPES.read_text(encoding="utf-8"))
    for k, r in apply(ts):
        print(k, "skipped" if r is None else f"moved {r[0]} m (anchor {r[1]} m off the track)")
    SHAPES.write_text(json.dumps(ts, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
