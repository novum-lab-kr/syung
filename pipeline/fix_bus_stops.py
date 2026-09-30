#!/usr/bin/env python3
"""Put KTDB bus stops whose coordinates are rounded onto their OpenStreetMap stop → data/bus-stop-fix.json.

A quarter of the KTDB GTFS stops have 3 decimals or fewer (~100 m; 1,410 of them 1–2 decimals), so
길찾기 walked to a point off the stop and drew the stop apart from it. Each such stop is matched to
an OSM bus stop (highway=bus_stop, or a bus platform) of the same name within the rounding
(150 m at 3 decimals, 900 m at 2); of the two sides of a road, the one on the right of the buses
through it (right-hand traffic). Undecided sides and unmatched stops keep their coordinates.
Output: {"<stop index in bus.json>": [lat, lng]}. Rebuild whenever data/bus.json is rebuilt.
Needs pyosmium (pip install osmium) and the OSRM extract, or an extracted stop list:
Usage: fix_bus_stops.py [south-korea.osm.pbf | osm_bus_stops.json]
"""

from __future__ import annotations

import collections
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUS = ROOT / "data" / "bus.json"
OUT = ROOT / "data" / "bus-stop-fix.json"
PBF = "/var/lib/osrm/south-korea-latest.osm.pbf"
RADIUS = {3: 150, 2: 900}   # metres, by decimals of the rounder coordinate


def osm_stops(src: str) -> list[list]:
    """[[name, lat, lng], ...] in the capital area."""
    if src.endswith(".json"):
        return json.loads(Path(src).read_text(encoding="utf-8"))
    import osmium
    out = []

    class Stops(osmium.SimpleHandler):
        def node(self, n):
            t = n.tags
            if t.get("highway") == "bus_stop" or (t.get("public_transport") == "platform" and t.get("bus") == "yes"):
                if 36.7 < n.location.lat < 38.3 and 126.3 < n.location.lon < 128.0:
                    out.append([t.get("name") or t.get("name:ko") or "", round(n.location.lat, 7), round(n.location.lon, 7)])
    Stops().apply_file(src)
    return out


def norm(name: str) -> str:
    name = re.sub(r"\[.*?\]", "", name or "")
    return re.sub(r"\s|\.|·|정류장|정류소|\((중|중앙|가상|경유)\)", "", name).lower()


def decimals(x: float) -> int:
    s = repr(x)
    return len(s.split(".")[1]) if "." in s else 0


def local(p, o):
    return ((p[1] - o[1]) * 111320 * math.cos(math.radians(o[0])), (p[0] - o[0]) * 111320)


def main(src: str) -> None:
    bus = json.loads(BUS.read_text(encoding="utf-8"))
    stops, patterns = bus["stops"], bus["patterns"]
    osm = osm_stops(src)
    grid = collections.defaultdict(list)
    for j, o in enumerate(osm):
        grid[(int(o[1] / 0.01), int(o[2] / 0.01))].append(j)

    def near(lat, lng, r):
        k = int(r / 800) + 1
        cy, cx = int(lat / 0.01), int(lng / 0.01)
        for dy in range(-k, k + 1):
            for dx in range(-k, k + 1):
                for j in grid.get((cy + dy, cx + dx), ()):
                    d = math.hypot(*local((osm[j][1], osm[j][2]), (lat, lng)))
                    if d <= r:
                        yield d, j

    # the way buses go through each stop: (previous stop, next stop)
    ways = collections.defaultdict(list)
    for p in patterns:
        s = p["s"]
        for k in range(len(s)):
            a, b = stops[s[max(0, k - 1)]], stops[s[min(len(s) - 1, k + 1)]]
            if a is not b:
                ways[s[k]].append(((a[1], a[2]), (b[1], b[2])))

    def right_side(i, j):   # votes for the OSM stop being on the right of the buses through stop i
        c = (osm[j][1], osm[j][2])
        votes = 0
        for a, b in ways.get(i, []):
            vx, vy = local(b, a)
            cx, cy = local(c, a)
            votes += 1 if vx * cy - vy * cx < 0 else -1
        return votes

    fix, stat = {}, collections.Counter()
    for i, (name, lat, lng) in enumerate(stops):
        r = RADIUS.get(min(decimals(lat), decimals(lng)))
        if r is None:
            stat["precise" if min(decimals(lat), decimals(lng)) >= 4 else "too coarse"] += 1
            continue
        n = norm(name)
        cands = [(d, j) for d, j in near(lat, lng, r) if norm(osm[j][0]) == n]
        if not cands:
            stat["no OSM stop"] += 1
            continue
        best = sorted(cands, key=lambda x: (-right_side(i, x[1]), x[0]))
        if len(best) > 1 and right_side(i, best[0][1]) == right_side(i, best[1][1]) and abs(best[0][0] - best[1][0]) < 20:
            stat["side undecided"] += 1
            continue
        fix[str(i)] = [osm[best[0][1]][1], osm[best[0][1]][2]]
        stat["moved"] += 1
    OUT.write_text(json.dumps(fix, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(dict(stat), ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else PBF)
