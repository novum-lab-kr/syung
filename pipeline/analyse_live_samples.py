#!/usr/bin/env python3
"""Compare observed train movement (from sample_live_positions.py) with the GTFS timetable.

For consecutive events of the same train:
- 도착→도착 or 출발→출발 at stations k hops apart (1–4): observed time vs timetable
  (sum of scheduled run times + k dwells). This is the main, plentiful measurement.
- 도착→출발 at the same station: observed dwell.
- 출발→도착 on adjacent stations: observed pure run time.
- 진입→도착 at the same station: time from the 진입 signal to stopping.
Usage: analyse_live_samples.py <samples.jsonl> [...]
"""

from __future__ import annotations

import json
import re
import statistics
import sys
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
metro = json.loads((ROOT / "data/ktdb-gtfs-2025/capital-metro.json").read_text(encoding="utf-8"))
times = json.loads((ROOT / "data/ktdb-gtfs-2025/edge_times.json").read_text(encoding="utf-8"))


def key(name: str) -> str:  # same normalisation as the map runtime
    name = re.sub(r"\([^)]*\)", "", name or "")
    return re.sub(r"(종착|지선|역)$", "", name).replace(" ", "").lower()


node_of = {(line, key(n["name"])): n["id"] for n in metro["nodes"] for line in n["lines"]}
adj: dict[str, dict[int, set[int]]] = defaultdict(lambda: defaultdict(set))
for line, variants in metro["lines"].items():
    for v in variants:
        for a, b in zip(v["stops"], v["stops"][1:]):
            adj[line][a].add(b)
            adj[line][b].add(a)


def scheduled(line: str, a: int, b: int, max_hops: int = 4):
    """Shortest path a→b on the line: (hops, scheduled run seconds) or None."""
    prev, q = {a: None}, deque([a])
    while q:
        u = q.popleft()
        if u == b:
            break
        for v in adj[line][u]:
            if v not in prev:
                prev[v] = u
                q.append(v)
    if b not in prev:
        return None
    path, u = [], b
    while u is not None:
        path.append(u)
        u = prev[u]
    hops = len(path) - 1
    if not 1 <= hops <= max_hops:
        return None
    run = [times["edges"].get(f"{line}:{min(x, y)}:{max(x, y)}") for x, y in zip(path, path[1:])]
    return None if None in run else (hops, sum(run))


def ts(value: str) -> float:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").timestamp()


def main(paths: list[str]) -> None:
    events = defaultdict(dict)
    for p in paths:
        for line in Path(p).read_text(encoding="utf-8").splitlines():
            e = json.loads(line)
            if e.get("receivedAt"):
                events[(e["line"], e["trainNo"])][(e["receivedAt"], e["station"], e["status"])] = e
    ratio = defaultdict(list)          # line → observed/scheduled for same-status hops
    dwell, run, approach = defaultdict(list), defaultdict(list), []
    for (line, _), evs in events.items():
        seq = sorted(evs.values(), key=lambda e: e["receivedAt"])
        for e1, e2 in zip(seq, seq[1:]):
            a, b = node_of.get((line, key(e1["station"]))), node_of.get((line, key(e2["station"])))
            dt = ts(e2["receivedAt"]) - ts(e1["receivedAt"])
            if a is None or b is None or dt <= 0 or dt > 1500:
                continue
            s1, s2 = e1["status"], e2["status"]
            if a == b:
                if s1 == "도착" and s2 == "출발" and dt < 300:
                    dwell[line].append(dt)
                if s1 == "진입" and s2 == "도착" and dt < 180:
                    approach.append(dt)
                continue
            sched = scheduled(line, a, b)
            if not sched:
                continue
            hops, sched_run = sched
            dw = times["dwell"].get(line, 30)
            if s1 == s2 and s1 in ("도착", "출발"):
                ratio[line].append(dt / (sched_run + hops * dw))
            if s1 == "출발" and s2 == "도착" and hops == 1:
                run[line].append(dt / sched_run)
    q = lambda v: f"{statistics.median(v):.2f} (n={len(v)}, IQR {statistics.quantiles(v, n=4)[0]:.2f}–{statistics.quantiles(v, n=4)[2]:.2f})" if len(v) >= 4 else f"n={len(v)}"
    allr = [x for v in ratio.values() for x in v]
    print("observed ÷ timetable, same-status hops (도착→도착 / 출발→출발), all lines:", q(allr) if allr else "no data")
    for line in sorted(ratio, key=lambda l: -len(ratio[l])):
        print(f"  {line:6} {q(ratio[line])}")
    allrun = [x for v in run.values() for x in v]
    print("pure run (출발→다음역 도착) ÷ timetable run:", q(allrun) if allrun else "no data")
    alld = [x for v in dwell.values() for x in v]
    print("observed dwell seconds (도착→출발):", f"median {statistics.median(alld):.0f}s (n={len(alld)})" if alld else "no data")
    for line in sorted(dwell, key=lambda l: -len(dwell[l]))[:8]:
        print(f"  {line:6} median {statistics.median(dwell[line]):.0f}s (n={len(dwell[line])})")
    print("진입→도착 seconds:", f"median {statistics.median(approach):.0f}s (n={len(approach)})" if approach else "no data")


if __name__ == "__main__":
    main(sys.argv[1:])
