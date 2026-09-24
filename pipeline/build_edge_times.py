#!/usr/bin/env python3
"""Scheduled run time between adjacent stations, from KTDB GTFS stop_times.

Output (edge_times.json): {"edges": {"<line>:<lo id>:<hi id>": seconds}, "dwell": {"<line>": seconds}}
- edges: median of (arrival at next stop − departure from this stop) over all regular trips.
- dwell: median of (departure − arrival) at intermediate stops, per line (0 when the feed has none).
The WebGL runtime uses these instead of a guessed cruising speed when rolling trains forward.
"""

from __future__ import annotations

import csv
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_ktdb_capital_metro import CAPITAL_LINES, DISPLAY_NAMES, SOURCE, normalized_station_name  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
METRO = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"
OUT = ROOT / "data" / "ktdb-gtfs-2025" / "edge_times.json"


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
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"edges": len(out["edges"]), "of": len(edges), "dwell": out["dwell"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
