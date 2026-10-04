#!/usr/bin/env python3
"""Which stretches of each track edge really run on a bridge or viaduct, for the 심시티 고가 (viaduct) look.

In the simcity mode every line is drawn on a viaduct; the stretches that really are elevated (OSM
bridge=yes/viaduct on the line's railway ways) get a slightly darker concrete. This marks them.

Output: web/lib/city_viaduct_flags.mjs — {"<line>:<lo id>:<hi id>": [[t0, t1], ...]}: fractions of the
edge's length (lo→hi, as track_shapes.json draws it) that lie within NEAR_M of a bridge way, merged, runs
shorter than MIN_RUN_M dropped. Reads data/osm-tracks/track_shapes.json and the cached Overpass answers
data/osm-tracks/line-*.json (build_track_shapes.py fetched them). Track data © OpenStreetMap contributors (ODbL).

    python3 pipeline/build_viaduct_flags.py
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "osm-tracks"
OUT = ROOT / "web" / "lib" / "city_viaduct_flags.mjs"
SAMPLE_M, NEAR_M, MIN_RUN_M, GRID_M = 8.0, 25.0, 40.0, 120.0


def frame(lat0: float):
    """lon/lat → metres (equirectangular about lat0; a line spans < 1° of latitude: error < 1 %)."""
    kx = math.cos(math.radians(lat0)) * 111320.0
    return lambda p: (p[0] * kx, p[1] * 111320.0)


def bridge_segments(line: str, to_m):
    data = json.loads((CACHE / f"line-{line}.json").read_text())
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in data["elements"] if e["type"] == "node"}
    grid: dict[tuple[int, int], list] = defaultdict(list)
    n = 0
    for w in data["elements"]:
        if w["type"] != "way" or w.get("tags", {}).get("bridge") in (None, "no"):
            continue
        ids = [i for i in w["nodes"] if i in nodes]
        for a, b in zip(ids, ids[1:]):
            A, B = to_m(nodes[a]), to_m(nodes[b])
            n += 1
            x0, x1 = sorted((A[0], B[0]))
            y0, y1 = sorted((A[1], B[1]))
            for gx in range(int(x0 // GRID_M), int(x1 // GRID_M) + 1):
                for gy in range(int(y0 // GRID_M), int(y1 // GRID_M) + 1):
                    grid[(gx, gy)].append((A, B))
    return grid, n


def near_bridge(grid, p, near: float) -> bool:
    gx, gy = int(p[0] // GRID_M), int(p[1] // GRID_M)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for A, B in grid.get((gx + dx, gy + dy), ()):
                ex, ey = B[0] - A[0], B[1] - A[1]
                l2 = ex * ex + ey * ey or 1.0
                u = max(0.0, min(1.0, ((p[0] - A[0]) * ex + (p[1] - A[1]) * ey) / l2))
                if math.hypot(A[0] + ex * u - p[0], A[1] + ey * u - p[1]) <= near:
                    return True
    return False


def samples(coords, to_m):
    """points every SAMPLE_M along the edge (metres), with their distance along and the total."""
    pts = [to_m(c) for c in coords]
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = cum[-1]
    out, s, i = [], 0.0, 0
    while s <= total and len(pts) > 1:
        while i < len(pts) - 2 and cum[i + 1] < s:
            i += 1
        seg = cum[i + 1] - cum[i] or 1.0
        u = max(0.0, min(1.0, (s - cum[i]) / seg))
        out.append((s, (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u)))
        s += SAMPLE_M
    return out, total


def runs(flags, total: float):
    """flagged sample runs → [[t0, t1]] fractions; one-sample gaps bridged; short runs dropped."""
    out = []
    i, n = 0, len(flags)
    while i < n:
        if not flags[i][1]:
            i += 1
            continue
        j = i
        while j + 1 < n and (flags[j + 1][1] or (j + 2 < n and flags[j + 2][1])):
            j += 1
        s0, s1 = max(0.0, flags[i][0] - SAMPLE_M / 2), min(total, flags[j][0] + SAMPLE_M / 2)
        if s1 - s0 >= MIN_RUN_M and total > 0:
            out.append([round(s0 / total, 4), round(s1 / total, 4)])
        i = j + 1
    return out


def main() -> None:
    shapes = json.loads((CACHE / "track_shapes.json").read_text())["edges"]
    by_line: dict[str, list[tuple[str, list]]] = defaultdict(list)
    for key, coords in shapes.items():
        by_line[key.split(":")[0]].append((key, coords))
    result, report = {}, []
    for line, edges in sorted(by_line.items()):
        lat0 = sum(c[1] for _, cs in edges for c in cs) / max(1, sum(len(cs) for _, cs in edges))
        to_m = frame(lat0)
        try:
            grid, nseg = bridge_segments(line, to_m)
        except FileNotFoundError:
            report.append(f"{line}: no line-{line}.json — skipped")
            continue
        km_total = km_up = 0.0
        for key, coords in edges:
            pts, total = samples(coords, to_m)
            km_total += total / 1000
            flags = [(s, near_bridge(grid, p, NEAR_M)) for s, p in pts]
            r = runs(flags, total)
            if r:
                result[key] = r
                km_up += sum((t1 - t0) * total for t0, t1 in r) / 1000
        report.append(f"{line}: bridge ways {nseg} segments; elevated {km_up:.1f} of {km_total:.1f} km in {sum(1 for k in result if k.startswith(line + ':'))} edges")
    body = json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    OUT.write_text(
        "// 심시티 고가: which stretches of each track edge really run on a bridge or viaduct (OSM bridge=*), as fractions of the\n"
        "// edge's length lo→hi — the viaduct renderer tints their concrete a little darker. Generated by pipeline/build_viaduct_flags.py;\n"
        "// do not edit by hand. Track data © OpenStreetMap contributors (ODbL).\n"
        f"export default {body};\n")
    print("\n".join(report))
    print(f"→ {OUT.relative_to(ROOT)}: {len(result)} edges, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
