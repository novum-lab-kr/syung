#!/usr/bin/env python3
"""Data for the journey planner (server/journey.py) → data/journey.json.

- hops: "<line>|<a>|<b>" → seconds from leaving station a to leaving the next station b (run +
  stop), from the KTDB timetable run times and the learned live timing (pace, zone), both ways
- dirs: "<line>|<a>|<b>" → the live feed's direction label (상행/하행/내선/외선) for trains going
  a→b, learned from consecutive records of the same train in the samples
- headway: "<line>|<label>" → {hour: seconds} median gap between trains at a station, from the
  samples (first sighting of each train at each station); "*" is the all-day median
- transfer: "<station id>" → seconds to change lines there (GTFS transfers, median per station)
Usage: build_journey_data.py <samples.jsonl> [...]
"""

from __future__ import annotations

import csv
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyse_live_samples import key, metro, node_of, times  # noqa: E402
from extract_ktdb_capital_metro import SOURCE, normalized_station_name  # noqa: E402
from sample_files import lines  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "journey.json"
TIMING = ROOT / "data" / "live-timing.json"
DEFAULT_TRANSFER = 180


def main(paths: list[str]) -> None:
    timing = json.loads(TIMING.read_text(encoding="utf-8"))
    tm = lambda line: {**timing["default"], **timing["lines"].get(line, {})}

    hops = {}
    for line, variants in metro["lines"].items():
        t = tm(line)
        for v in variants:
            for a, b in zip(v["stops"], v["stops"][1:]):
                run = times["edges"].get(f"{line}:{min(a, b)}:{max(a, b)}")
                if run and a != b:
                    hops[f"{line}|{a}|{b}"] = hops[f"{line}|{b}|{a}"] = round(t["pace"] * (run + 30))

    dirs, seen = defaultdict(Counter), defaultdict(list)
    for p in paths:
        for row in lines(p):   # .jsonl or .jsonl.gz
            e = json.loads(row)
            if e.get("receivedAt") and e.get("direction"):
                seen[(e["line"], e["trainNo"], e["receivedAt"][:10])].append(e)
    arrivals = defaultdict(list)   # (line, label, station) → first-sighting times
    for (line, _, _), evs in seen.items():
        evs.sort(key=lambda e: e["receivedAt"])
        firsts = {}
        for e in evs:
            firsts.setdefault(e["station"], e)
        for e1, e2 in zip(evs, evs[1:]):
            a, b = node_of.get((line, key(e1["station"]))), node_of.get((line, key(e2["station"])))
            if a and b and a != b and f"{line}|{a}|{b}" in hops and e1["direction"] == e2["direction"]:
                dirs[f"{line}|{a}|{b}"][e1["direction"]] += 1
        for st, e in firsts.items():
            arrivals[(line, e["direction"], st)].append(datetime.strptime(e["receivedAt"], "%Y-%m-%d %H:%M:%S"))

    gaps = defaultdict(lambda: defaultdict(list))
    for (line, label, _), ts in arrivals.items():
        ts.sort()
        for t1, t2 in zip(ts, ts[1:]):
            g = (t2 - t1).total_seconds()
            if 60 <= g <= 1800 and t1.date() == t2.date():
                gaps[f"{line}|{label}"][t1.hour].append(g)
    headway = {}
    for k, by in gaps.items():
        allg = [g for v in by.values() for g in v]
        if len(allg) >= 30:
            headway[k] = {"*": round(statistics.median(allg)),
                          **{str(h): round(statistics.median(v)) for h, v in by.items() if len(v) >= 10}}

    names = {s["stop_id"]: normalized_station_name(s["stop_name"]) for s in csv.DictReader((SOURCE / "stops.txt").open(encoding="utf-8-sig"))}
    by_name = defaultdict(set)
    for n in metro["nodes"]:
        by_name[n["name"]].add(n["id"])
    tr = defaultdict(list)
    for r in csv.DictReader((SOURCE / "transfers.txt").open(encoding="utf-8-sig")):
        a, b = names.get(r["from_stop_id"]), names.get(r["to_stop_id"])
        if a and a == b and r.get("min_transfer_time", "").isdigit():
            for nid in by_name.get(a, ()):
                tr[str(nid)].append(int(r["min_transfer_time"]))
    transfer = {k: round(statistics.median(v)) for k, v in tr.items()}

    out = {"hops": hops, "dirs": {k: c.most_common(1)[0][0] for k, c in dirs.items() if sum(c.values()) >= 3},
           "headway": headway, "transfer": transfer, "defaultTransfer": DEFAULT_TRANSFER,
           "from": [Path(p).name for p in paths]}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({k: len(v) for k, v in out.items() if isinstance(v, dict)}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
