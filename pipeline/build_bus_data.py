#!/usr/bin/env python3
"""수도권 city buses for the journey planner (server/journey.py) → data/bus.json.

From the KTDB GTFS, the 서울 (SEB), 경기 (GGB) and 인천 (ICB) city bus routes:
- stops: [[name, lat, lng], ...]
- routes: [[number, kind], ...]; kind is a colour class guessed from the number (see kind())
- patterns: one per distinct stop sequence of a route —
  {"r": route index, "s": [stop index, ...], "t": [seconds from the first stop, ...],
   "d": [[start second of day, scale], ...]} where the offsets are the pattern's median trip and a
  trip reaches stop k at start + t[k] × scale (trips run slower at rush hour)
- walk: [[stop index, metres], ...] per stop — other stops within WALK_M, straight-line distance
Usage: build_bus_data.py
"""

from __future__ import annotations

import csv
import json
import math
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_ktdb_capital_metro import SOURCE  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "bus.json"
PREFIXES = ("BR_TAGO_SEB", "BR_TAGO_GGB", "BR_TAGO_ICB")
WALK_M = 300


def kind(rid: str, name: str) -> str:
    """서울: 간선 3-digit blue, 지선 4-digit green, 광역 9xxx red, 순환 0x yellow, 마을 (e.g. 강남01) green;
    경기/인천: M·직행좌석 (1xxx, 3xxx, 5xxx, 7xxx, 8xxx 4-digit) red, 좌석 blue, else green."""
    n = name.strip()
    if re.search(r"[가-힣]", n) and not n.startswith("N"):
        return "maeul"
    if n.startswith("N"):
        return "night"
    if n.startswith("M"):
        return "express"
    digits = re.match(r"\d+", n)
    d = digits.group(0) if digits else ""
    if rid.startswith("BR_TAGO_SEB"):
        if len(d) == 2 and d.startswith("0"):
            return "circular"
        if len(d) == 4:
            return "express" if d.startswith("9") else "branch"
        return "trunk" if len(d) == 3 else "branch"
    if len(d) == 4 and d[0] in "13578":
        return "express"
    if "좌석" in n:
        return "trunk"
    return "branch"


def sec(hms: str) -> int:
    h, m, s = hms.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def main() -> None:
    names = {}
    for r in csv.DictReader((SOURCE / "routes.txt").open(encoding="utf-8-sig")):
        if r["route_id"].startswith(PREFIXES):
            names[r["route_id"]] = r["route_short_name"]
    stops_all = {r["stop_id"]: (r["stop_name"], float(r["stop_lat"]), float(r["stop_lon"]))
                 for r in csv.DictReader((SOURCE / "stops.txt").open(encoding="utf-8-sig"))
                 if r["stop_id"].startswith("BS_TAGO_")}

    # route → pattern (stop tuple) → [(start, arrival offsets)]
    pats: dict[str, dict[tuple, list]] = defaultdict(lambda: defaultdict(list))
    cur, rows = None, []

    def flush() -> None:
        if not rows:
            return
        rows.sort()
        route = cur.rsplit("_", 1)[0]
        seq = tuple(s for _, s, _, _ in rows)
        if route in names and all(s in stops_all for s in seq) and len(seq) >= 2:
            t0 = sec(rows[0][3])
            pats[route][seq].append((t0, [sec(a) - t0 for _, _, a, _ in rows]))

    with (SOURCE / "stop_times.txt").open(encoding="utf-8") as f:
        next(f)
        for line in f:
            if not line.startswith(PREFIXES):
                if rows:
                    flush()
                    cur, rows = None, []
                continue
            trip, arr, dep, stop, seqno = line.split(",", 5)[:5]
            if trip != cur:
                flush()
                cur, rows = trip, []
            rows.append((int(seqno), stop, arr, dep))
        flush()

    stop_ix, stops, routes, patterns = {}, [], [], []
    def six(s: str) -> int:
        if s not in stop_ix:
            stop_ix[s] = len(stops)
            n, la, lo = stops_all[s]
            stops.append([n, round(la, 6), round(lo, 6)])
        return stop_ix[s]
    for route, by in sorted(pats.items()):
        ri = len(routes)
        routes.append([names[route], kind(route, names[route])])
        for seq, trips in by.items():
            trips.sort()
            durs = sorted(offs[-1] for _, offs in trips)
            mid = durs[len(durs) // 2]
            base = next(offs for _, offs in trips if offs[-1] == mid)
            base = [max(o, base[i - 1] if i else 0) for i, o in enumerate(base)]
            patterns.append({"r": ri, "s": [six(s) for s in seq], "t": base,
                             "d": [[t0, round(offs[-1] / mid, 3) if mid else 1] for t0, offs in trips]})

    # walking links between nearby stops (grid of ~300 m cells)
    cell = defaultdict(list)
    for i, (_, la, lo) in enumerate(stops):
        cell[(int(la / 0.0027), int(lo / 0.0034))].append(i)
    walk = []
    for i, (_, la, lo) in enumerate(stops):
        cy, cx, near = int(la / 0.0027), int(lo / 0.0034), []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for j in cell.get((cy + dy, cx + dx), ()):
                    if j != i:
                        x = math.radians(stops[j][2] - lo) * math.cos(math.radians(la))
                        m = 6371000 * math.hypot(x, math.radians(stops[j][1] - la))
                        if m <= WALK_M:
                            near.append([j, round(m)])
        walk.append(near)

    out = {"stops": stops, "routes": routes, "patterns": patterns, "walk": walk, "walkMetres": WALK_M}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"stops": len(stops), "routes": len(routes), "patterns": len(patterns),
                      "trips": sum(len(p["d"]) for p in patterns),
                      "medianStops": statistics.median(len(p["s"]) for p in patterns),
                      "bytes": OUT.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
