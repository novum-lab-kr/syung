#!/usr/bin/env python3
"""Subway exits from OpenStreetMap → data/osm-tracks/exits.json.

Each railway=subway_entrance node (exit number in `ref`) is assigned to the nearest station node
within 400 m, preferring one whose name appears in the entrance description ("월계역 2번출구").
Output: {"<station id>": [[lon, lat, "2", wheelchair(1/0/null), named(1/0)], ...]}
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_track_shapes import CACHE, overpass  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"
OUT = ROOT / "data" / "osm-tracks" / "exits.json"
BBOX = "36.9,126.4,38.0,127.6"


def metres(a, b):
    return math.hypot((a[0] - b[0]) * 88_000, (a[1] - b[1]) * 111_000)


def main() -> None:
    nodes = json.loads(SOURCE.read_text(encoding="utf-8"))["nodes"]
    data = overpass(f'[out:json][timeout:240];node["railway"="subway_entrance"]({BBOX});out body;', "exits-raw.json")
    norm = lambda v: re.sub(r"\s|역$|\([^)]*\)", "", v or "")
    out: dict[str, list] = {}
    kept = 0
    for e in data["elements"]:
        t = e.get("tags", {})
        ref = (t.get("ref") or "").strip()
        if not ref:
            continue
        p = (e["lon"], e["lat"])
        desc = t.get("description:ko") or t.get("description") or t.get("name") or ""
        near = sorted(((metres(p, (n["lon"], n["lat"])), n) for n in nodes if abs(n["lat"] - p[1]) < .01 and abs(n["lon"] - p[0]) < .012), key=lambda x: x[0])
        # an exit named after a station ("청담역 1번출구") belongs to it even far along a long passage (≤ 900 m);
        # unnamed exits go to the nearest station within 400 m
        named = [(d, n) for d, n in near if d <= 900 and norm(n["name"]) and norm(n["name"]) in norm(desc)]
        if named:
            d, n = named[0]
        elif near and near[0][0] <= 400:
            d, n = near[0]
        else:
            continue
        wc = {"yes": 1, "limited": 1, "no": 0}.get(t.get("wheelchair"))
        out.setdefault(str(n["id"]), []).append([round(p[0], 6), round(p[1], 6), ref, wc, 1 if named else 0])   # last: named after the station
        kept += 1
    for v in out.values():
        v.sort(key=lambda x: (int(re.match(r"\d+", x[2]).group()) if re.match(r"\d+", x[2]) else 999, x[2]))
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"entrances": len(data["elements"]), "kept": kept, "stations": len(out), "bytes": OUT.stat().st_size}))


if __name__ == "__main__":
    main()
