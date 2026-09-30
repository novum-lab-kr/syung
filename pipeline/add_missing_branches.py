#!/usr/bin/env python3
"""Add branches the KTDB 2025-03 GTFS lacks, from OpenStreetMap route relations.

Run after extract_ktdb_capital_metro.py. For each branch, the OSM relation's stop sequence is mapped
onto existing station nodes by name (else a new node is created at the OSM stop position), and a
path variant joining the branch to the existing line is appended to capital-metro.json.
Idempotent: variants named "OSM 보충 …" are replaced on every run.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_track_shapes import overpass  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
METRO = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"

# line, OSM relation id, junction station on the existing line, display name
BRANCHES = [
    ("5호선", 4744338, "강동", "OSM 보충 5호선 마천지선"),
    ("4호선", 13675922, "당고개", "OSM 보충 4호선 진접선"),
    ("인천1호선", 19425646, "계양", "OSM 보충 인천1호선 검단연장"),   # 아라·신검단중앙·검단호수공원, 2025-06
]
ALIASES = {"불암산": "당고개", "총신대입구 (이수)": "총신대입구(이수)", "동대문역사문화공원": "동대문역사문화공원"}


def norm(name: str) -> str:
    name = ALIASES.get(name.strip(), name.strip())
    return re.sub(r"\s|역$", "", re.sub(r"\([^)]*\)", "", name))


def metres(a, b):
    return math.hypot((a[0] - b[0]) * 88_000, (a[1] - b[1]) * 111_000)


def main() -> None:
    metro = json.loads(METRO.read_text(encoding="utf-8"))
    nodes = metro["nodes"]
    for variants in metro["lines"].values():
        variants[:] = [v for v in variants if not v["name"].startswith("OSM 보충")]
    ids = ",".join(str(b[1]) for b in BRANCHES)
    d = overpass(f'[out:json][timeout:120];relation(id:{ids});out body;node(r:"stop");out body;node(r:"stop_entry_only");out body;node(r:"stop_exit_only");out body;', "branches.json")
    osm_nodes = {e["id"]: e for e in d["elements"] if e["type"] == "node"}
    rels = {e["id"]: e for e in d["elements"] if e["type"] == "relation"}
    added = []
    for line, rid, junction, label in BRANCHES:
        stops = [osm_nodes[m["ref"]] for m in rels[rid]["members"] if m["type"] == "node" and m["role"].startswith("stop") and m["ref"] in osm_nodes]
        names = [s["tags"].get("name", "") for s in stops]
        j = next(i for i, n in enumerate(names) if norm(n) == norm(junction))
        branch = stops[j:]                                   # junction … branch terminus
        seq = []
        for s in branch:
            p = (s["lon"], s["lat"])
            hit = [n for n in nodes if norm(n["name"]) == norm(s["tags"].get("name", "")) and metres(p, (n["lon"], n["lat"])) < 1500]
            if hit:
                node = hit[0]
            else:
                node = {"id": max(n["id"] for n in nodes) + 1, "name": norm(s["tags"]["name"]), "lat": round(p[1], 6), "lon": round(p[0], 6), "lines": []}
                nodes.append(node)
                added.append(f"{line} {node['name']}")
            if line not in node["lines"]:
                node["lines"].append(line)
            node.setdefault("platforms", {}).setdefault(line, [round(p[0], 6), round(p[1], 6)])
            seq.append(node["id"])
        # join onto the longest existing path that has the junction at or near an end
        base = max((v["stops"] for v in metro["lines"][line] if seq[0] in v["stops"]), key=len)
        k = base.index(seq[0])
        path = base[:k + 1] + seq[1:] if k >= len(base) / 2 else list(reversed(seq[1:])) + base[k:]
        metro["lines"][line].append({"route_id": f"osm-{rid}", "name": label, "trip_id": "", "stops": path})
    METRO.write_text(json.dumps(metro, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"added_nodes": added, "nodes": len(nodes)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
