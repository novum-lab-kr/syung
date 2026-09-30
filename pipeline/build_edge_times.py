#!/usr/bin/env python3
"""Scheduled run time between adjacent stations, from KTDB GTFS stop_times.

Output (edge_times.json): {"edges": {"<line>:<lo id>:<hi id>": seconds}, "dwell": {"<line>": seconds}}
- edges: median of (arrival at next stop − departure from this stop) over all regular trips.
- dwell: median of (departure − arrival) at intermediate stops, per line (0 when the feed has none).
- estimated: edges not in the timetable (newer sections), timed by length at the line's own pace.
The WebGL runtime uses these instead of a guessed cruising speed when rolling trains forward.
"""

from __future__ import annotations

import csv
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_ktdb_capital_metro import CAPITAL_LINES, DISPLAY_NAMES, SOURCE, normalized_station_name  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
METRO = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"
OUT = ROOT / "data" / "ktdb-gtfs-2025" / "edge_times.json"
# Runs the timetable gets wrong, set from the live feeds instead.
OBSERVED = {
    # 신내–봉화산: the timetable has 270 s (trips starting at 신내 seem to count their wait there);
    # 상행 신내 출발 → 봉화산 도착 takes 90–180 s in the 2026-09-29 samples, 6310 about 2 min on
    # 2026-09-30 22:00 (카카오 had it at 봉화산 while the map was still halfway)
    "6호선:179:426": 130,
    # position feed, 2026-09-28–30: edges the map ran 30+ s off with 20+ runs seen (3호선 and
    # 1호선 downtown are whole minutes in the timetable); value = the run that makes the map's
    # 출발→도착 match the median seen (build_live_timing.evaluate)
    "3호선:59:60": 77,   # 지축–구파발 시간표 180s, 실제 출발→도착 49s (n=27)
    "1호선:1:104": 61,   # 시청–서울 시간표 120s, 실제 출발→도착 39s (n=82)
    "3호선:86:87": 64,   # 수서–가락시장 시간표 120s, 실제 출발→도착 36s (n=39)
    "3호선:66:67": 67,   # 독립문–경복궁 시간표 120s, 실제 출발→도착 39s (n=43)
    "1호선:1:2": 67,   # 시청–종각 시간표 120s, 실제 출발→도착 46s (n=86)
    "2호선:56:58": 100,   # 신정네거리–까치산 시간표 150s, 실제 출발→도착 57s (n=30)
    "3호선:60:61": 72,   # 구파발–연신내 시간표 120s, 실제 출발→도착 44s (n=42)
    "3호선:74:75": 72,   # 압구정–신사 시간표 120s, 실제 출발→도착 44s (n=42)
    "3호선:78:79": 73,   # 남부터미널–양재 시간표 120s, 실제 출발→도착 44s (n=44)
    "3호선:85:86": 73,   # 일원–수서 시간표 120s, 실제 출발→도착 45s (n=44)
    "3호선:73:74": 74,   # 옥수–압구정 시간표 120s, 실제 출발→도착 46s (n=26)
    "3호선:63:64": 74,   # 녹번–홍제 시간표 120s, 실제 출발→도착 46s (n=29)
    "2호선:55:56": 135,   # 양천구청–신정네거리 시간표 180s, 실제 출발→도착 91s (n=26)
    "3호선:31:77": 80,   # 교대–고속터미널 시간표 120s, 실제 출발→도착 52s (n=45)
    "3호선:79:80": 80,   # 양재–매봉 시간표 120s, 실제 출발→도착 52s (n=41)
    "1호선:7:8": 51,   # 제기동–청량리 시간표 90s, 실제 출발→도착 29s (n=61)
    "2호선:33:34": 111,   # 방배–사당 시간표 150s, 실제 출발→도착 68s (n=59)
    "1호선:5:9": 52,   # 동대문–동묘앞 시간표 90s, 실제 출발→도착 30s (n=31)
    "2호선:54:55": 115,   # 도림천–양천구청 시간표 150s, 실제 출발→도착 72s (n=30)
    "1호선:6:9": 58,   # 신설동–동묘앞 시간표 90s, 실제 출발→도착 36s (n=30)
    "1호선:2:3": 59,   # 종각–종로3가 시간표 90s, 실제 출발→도착 37s (n=48)
    "2호선:39:40": 129,   # 신대방–구로디지털단지 시간표 90s, 실제 출발→도착 85s (n=50)
}


def seconds(value: str) -> int | None:
    try:
        h, m, s = (int(x) for x in value.split(":"))
        return h * 3600 + m * 60 + s
    except (ValueError, AttributeError):
        return None


def read_csv(name: str):
    return csv.DictReader((SOURCE / name).open(encoding="utf-8-sig", newline=""))


def main() -> None:
    metro = json.loads(METRO.read_text(encoding="utf-8"))
    node_by = {(n["name"], line): n["id"] for n in metro["nodes"] for line in n["lines"]}
    edges = {(line, min(a, b), max(a, b)) for line, variants in metro["lines"].items()
             for v in variants for a, b in zip(v["stops"], v["stops"][1:])}

    routes = {r["route_id"]: DISPLAY_NAMES.get(r["route_short_name"], r["route_short_name"])
              for r in read_csv("routes.txt") if r["route_type"] == "1" and r["route_short_name"] in CAPITAL_LINES}
    trip_line = {t["trip_id"]: routes[t["route_id"]] for t in read_csv("trips.txt") if t["route_id"] in routes}
    stop_name = {s["stop_id"]: normalized_station_name(s["stop_name"]) for s in read_csv("stops.txt")}

    runs: dict[tuple, list[int]] = defaultdict(list)
    dwells: dict[str, list[int]] = defaultdict(list)
    prev = None  # (trip_id, node, departure)
    with (SOURCE / "stop_times.txt").open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):  # rows are grouped by trip, in stop order
            line = trip_line.get(row["trip_id"])
            if not line:
                prev = None
                continue
            node = node_by.get((stop_name.get(row["stop_id"], ""), line))
            arr, dep = seconds(row["arrival_time"]), seconds(row["departure_time"])
            if prev and prev[0] == row["trip_id"] and node is not None and prev[1] is not None and arr is not None and prev[2] is not None:
                key = (line, min(prev[1], node), max(prev[1], node))
                if key in edges and 0 < arr - prev[2] < 1800:
                    runs[key].append(arr - prev[2])
                if dep is not None and 0 <= dep - arr < 600:
                    dwells[line].append(dep - arr)
            prev = (row["trip_id"], node, dep)

    out = {"edges": {f"{l}:{a}:{b}": round(statistics.median(v)) for (l, a, b), v in runs.items()},
           "dwell": {l: round(statistics.median(v)) for l, v in dwells.items()}}
    # sections newer than the timetable (인천1호선 검단연장, 2025-06): the line's own seconds per
    # straight-line metre over its timetabled sections, times this one's length
    at = {n["id"]: (n["lat"], n["lon"]) for n in metro["nodes"]}
    def metres(a, b):
        (la1, lo1), (la2, lo2) = at[a], at[b]
        return 6371000 * math.hypot(math.radians(lo2 - lo1) * math.cos(math.radians((la1 + la2) / 2)), math.radians(la2 - la1))
    per_metre = {}
    for (l, a, b), v in runs.items():
        t, m = per_metre.get(l, (0, 0))
        per_metre[l] = (t + statistics.median(v), m + metres(a, b))
    estimated = []
    for l, a, b in sorted(edges - set(runs)):
        if l in per_metre and per_metre[l][1]:
            out["edges"][f"{l}:{a}:{b}"] = round(metres(a, b) * per_metre[l][0] / per_metre[l][1])
            estimated.append(f"{l}:{a}:{b}")
    out["estimated"] = estimated
    for k, v in OBSERVED.items():
        out["edges"][k] = v
    out["observed"] = sorted(OBSERVED)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"edges": len(out["edges"]), "of": len(edges), "estimated": {k: out["edges"][k] for k in estimated}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
