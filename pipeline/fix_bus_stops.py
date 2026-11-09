#!/usr/bin/env python3
"""Put KTDB bus stops whose coordinates are rounded onto their OpenStreetMap stop → data/bus-stop-fix.json.

A quarter of the KTDB GTFS stops have 3 decimals or fewer (~100 m; 1,410 of them 1–2 decimals), so
길찾기 walked to a point off the stop and drew the stop apart from it. Each such stop is matched to
an OSM bus stop (highway=bus_stop, or a bus platform) of the same name inside the rounding: per axis
half a unit of that axis's last decimal plus SLACK_M (37.5078 · 127.056 → ±6 m north-south, ±45 m
east-west, each + 10 m). The nearest one wins; the side of the road (on the right of the buses
through it — right-hand traffic) only decides between candidates within SIDE_TIE_M of each other.
Undecided sides and unmatched stops keep their coordinates.

예전 규칙(2026-09-30 운영 자료)은 반지름(3자리 150 m) 안 후보를 오른쪽 표 → 거리 차례로 골랐다. 오른쪽 판단이
앞 정류장 → 뒤 정류장 직선 기준이라 교차로에서 꺾는 노선은 틀리고, 표가 거리를 이겨 150 m 떨어진 다른 같은 이름
정류장으로 옮겼다(포스코사거리 KTDB 원본 28 m → 125 m · 2415 위워크 삼성 → 묵동 길찾기 · 2026-11-09).
서울 노선이 서는 공식 정류장(data/bus/stops.json)으로 재면 옮긴 4,887 중 원본보다 20 m+ 멀어진 것 501(그중 100 m+ 125)
→ 이 규칙으로 123(100 m+ 4), 20 m+ 가까워진 것 1,178 → 1,356.
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
RADIUS = {3: 150, 2: 900}   # metres, by decimals of the rounder coordinate — 찾는 범위(반올림 상자를 다 덮는다)
SLACK_M = 10      # 반올림 상자 바깥으로 더 보는 거리(OSM 점과 KTDB 가 찍은 자리가 다른 만큼) — 5 · 10 · 15 · 20 m 중 서울 공식 정류장에 가장 맞았다
SIDE_TIE_M = 20   # 가장 가까운 후보와 이만큼 안이면 길의 어느 쪽인지(오른쪽 표)로 가른다


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


def in_rounding(lat: float, lng: float, osm_lat: float, osm_lng: float) -> bool:
    """OSM 점이 KTDB 좌표의 반올림 상자(축마다 마지막 자리의 반 + SLACK_M) 안인가 — 37.5078 은 남북 ±6 m 인데 127.056 은 동서 ±45 m."""
    slack = SLACK_M / 111320
    return (abs(osm_lat - lat) <= 0.5 * 10 ** -decimals(lat) + slack
            and abs(osm_lng - lng) <= 0.5 * 10 ** -decimals(lng) + slack / math.cos(math.radians(lat)))


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
        cands = sorted((d, j) for d, j in near(lat, lng, r)
                       if norm(osm[j][0]) == n and in_rounding(lat, lng, osm[j][1], osm[j][2]))
        if not cands:
            stat["no OSM stop"] += 1
            continue
        pick = cands[0][1]
        if len(cands) > 1 and cands[1][0] - cands[0][0] < SIDE_TIE_M:   # 가까운 둘이 비슷하면(길 양쪽) 오른쪽 표로
            first, second = right_side(i, cands[0][1]), right_side(i, cands[1][1])
            if first == second:
                stat["side undecided"] += 1
                continue
            pick = cands[0][1] if first > second else cands[1][1]
        fix[str(i)] = [osm[pick][1], osm[pick][2]]
        stat["moved"] += 1
    OUT.write_text(json.dumps(fix, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(dict(stat), ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else PBF)
