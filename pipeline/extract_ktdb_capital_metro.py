#!/usr/bin/env python3
"""Extract 수도권 urban-rail service paths from the 2025 KTDB GTFS bundle."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "ktdb-gtfs-2025" / "202503_GTFS_DataSet"   # raw KTDB GTFS (not in git; see README)
OUTPUT = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"

CAPITAL_LINES = {
    "서울1호선", "서울2호선", "서울3호선", "서울4호선", "서울5호선", "서울6호선",
    "서울7호선", "서울8호선", "서울9호선", "경의중앙선", "GTX-A", "인천1호선",
    "인천2호선", "신분당선", "공항철도", "경춘선", "의정부경전철", "용인경전철",
    "경강선", "우이신설경전철", "서해선", "김포도시철도", "수인분당선", "신림선",
}

DISPLAY_NAMES = {
    **{f"서울{i}호선": f"{i}호선" for i in range(1, 10)},
    "공항철도": "공항철도", "김포도시철도": "김포골드라인",
    "우이신설경전철": "우이신설선", "의정부경전철": "의정부선",
    "용인경전철": "에버라인선",
}
LINE_SUFFIXES = CAPITAL_LINES | set(DISPLAY_NAMES.values()) | {"공항철도"}


# Platform qualifiers KTDB uses for one physical station (Seoul Station's 1호선 is split into
# 지하/지상 and 경의·중앙선 has its own entry); they merge like line suffixes do.
PLATFORM_ALIASES = {"서울(지하)": "서울", "서울(지상)": "서울", "서울(경의·중앙선)": "서울",
                    "기흥(에버라인)": "기흥", "동백(에버라인)": "동백"}
# KTDB 2025-03 has 1호선 도봉산 and 도봉 with each other's coordinates (the line zigzags
# 망월사→도봉산→도봉→방학 north-south); swap them back so 도봉산 merges with its 7호선 platform.
COORDINATE_FIXES = {
    ("도봉산", 37.679059, 127.045495): (37.68959, 127.04606),
    ("도봉", 37.68959, 127.04606): (37.679059, 127.045495),
}


def normalized_station_name(name: str) -> str:
    if name in PLATFORM_ALIASES:
        return PLATFORM_ALIASES[name]
    for suffix in LINE_SUFFIXES:
        marker = f"({suffix})"
        if name.endswith(marker):
            return name[:-len(marker)].strip()
    return name


def read_csv(name: str):
    return csv.DictReader((SOURCE / name).open(encoding="utf-8-sig", newline=""))


def main() -> None:
    routes = {
        row["route_id"]: row
        for row in read_csv("routes.txt")
        if row["route_type"] == "1" and row["route_short_name"] in CAPITAL_LINES
    }
    trip_route = {
        row["trip_id"]: row["route_id"]
        for row in read_csv("trips.txt")
        if row["route_id"] in routes
    }
    sequences: dict[str, list[tuple[int, str]]] = defaultdict(list)
    with (SOURCE / "stop_times.txt").open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            trip_id = row["trip_id"]
            if trip_id in trip_route:
                sequences[trip_id].append((int(row["stop_sequence"]), row["stop_id"]))

    best_trip: dict[str, tuple[str, list[str]]] = {}
    for trip_id, values in sequences.items():
        route_id = trip_route[trip_id]
        ordered = [stop_id for _, stop_id in sorted(values)]
        if route_id not in best_trip or len(ordered) > len(best_trip[route_id][1]):
            best_trip[route_id] = (trip_id, ordered)

    used_stop_ids = {stop_id for _, ordered in best_trip.values() for stop_id in ordered}
    stops = {
        row["stop_id"]: {
            "stop_id": row["stop_id"], "name": row["stop_name"],
            "lat": float(row["stop_lat"]), "lon": float(row["stop_lon"]),
        }
        for row in read_csv("stops.txt") if row["stop_id"] in used_stop_ids
    }

    for stop in stops.values():
        fix = COORDINATE_FIXES.get((normalized_station_name(stop["name"]), round(stop["lat"], 6), round(stop["lon"], 6)))
        if fix:
            stop["lat"], stop["lon"] = fix

    # KTDB names platforms by line, e.g. 교대(2호선)/교대(3호선).
    # Strip only line suffixes, then merge platforms within 500 m.
    stop_list = list(stops.values())
    parent = list(range(len(stop_list)))
    index_by_id = {stop["stop_id"]: i for i, stop in enumerate(stop_list)}

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a: int, b: int) -> None:
        a, b = find(a), find(b)
        if a != b:
            parent[b] = a

    by_name: dict[str, list[int]] = defaultdict(list)
    for i, stop in enumerate(stop_list):
        by_name[normalized_station_name(stop["name"])].append(i)
    for indexes in by_name.values():
        for pos, a in enumerate(indexes):
            for b in indexes[pos + 1:]:
                dx = (stop_list[a]["lon"] - stop_list[b]["lon"]) * 88
                dy = (stop_list[a]["lat"] - stop_list[b]["lat"]) * 111
                if (dx * dx + dy * dy) ** 0.5 <= 0.5:
                    union(a, b)

    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(len(stop_list)):
        groups[find(i)].append(i)
    nodes = []
    stop_to_node = {}
    for indexes in groups.values():
        node_id = len(nodes)
        for i in indexes:
            stop_to_node[stop_list[i]["stop_id"]] = node_id
        nodes.append({
            "id": node_id,
            "name": normalized_station_name(stop_list[indexes[0]]["name"]),
            "lat": sum(stop_list[i]["lat"] for i in indexes) / len(indexes),
            "lon": sum(stop_list[i]["lon"] for i in indexes) / len(indexes),
            "lines": [],
        })

    line_paths: dict[str, list[dict]] = defaultdict(list)
    seen: dict[str, set[tuple[int, ...]]] = defaultdict(set)
    for route_id, (trip_id, stop_ids) in best_trip.items():
        route = routes[route_id]
        display = DISPLAY_NAMES.get(route["route_short_name"], route["route_short_name"])
        node_ids = []
        for stop_id in stop_ids:
            node_id = stop_to_node[stop_id]
            if not node_ids or node_ids[-1] != node_id:
                node_ids.append(node_id)
            if display not in nodes[node_id]["lines"]:
                nodes[node_id]["lines"].append(display)
            stop = stops[stop_id]
            nodes[node_id].setdefault("platforms", {}).setdefault(display, [stop["lon"], stop["lat"]])
        canonical = min(tuple(node_ids), tuple(reversed(node_ids)))
        if canonical in seen[display]:
            continue
        seen[display].add(canonical)
        line_paths[display].append({
            "route_id": route_id,
            "name": route["route_long_name"],
            "trip_id": trip_id,
            "stops": node_ids,
        })

    result = {
        "source": "KTDB GTFS 2025-03",
        "nodes": nodes,
        "lines": dict(sorted(line_paths.items())),
        "route_count": len(routes),
        "trip_count": len(trip_route),
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({
        "routes": len(routes), "trips": len(trip_route), "representative_paths": sum(map(len, line_paths.values())),
        "lines": len(line_paths), "nodes": len(nodes), "output": str(OUTPUT),
        "line1_paths": [p["name"] for p in line_paths.get("1호선", [])],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
