#!/usr/bin/env python3
"""Per-line timing for rolling live trains forward, learned from sample_live_positions.py samples.

Output (data/live-timing.json), read by the map runtime:
  {"lines": {"<line>": {"pace": x, "zone": s, "approach": s}}, "default": {...}, "from": [...]}
- pace: observed ÷ timetable time over 1–4 stations between two records of the same status
  (도착→도착, 출발→출발), median. The feed's 도착/출발 mark a train entering and leaving the
  station section, so equal-status spans cancel that offset. Clamped to 0.80–1.05 (express trains
  on 1·9호선 pull the median down).
- zone: seconds from 도착 to 출발 at one station (the train inside the station section).
- approach: seconds from 진입 to 도착.
zone and approach only use records stamped with their own event time (a stamp shared by three or
more trains of a line and direction in one fetch is a snapshot time, useless for durations this
short), and take the harmonic mean: a state is caught in a sample about in proportion to how long
it lasts, so the plain mean would overweight long ones.
Usage: build_live_timing.py <samples.jsonl> [...]
"""

from __future__ import annotations

import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyse_live_samples import key, node_of, scheduled, times, ts  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "live-timing.json"
DEFAULT = {"pace": 0.9, "zone": 40, "approach": 40}   # zone 40: stands the timetable's 30 s where unmeasured
MIN_N = {"pace": 200, "zone": 100, "approach": 100}
CLAMP = {"pace": (0.80, 1.05), "zone": (40, 95), "approach": (25, 85)}


def main(paths: list[str]) -> None:
    records, shared = [], Counter()
    for p in paths:
        for row in Path(p).read_text(encoding="utf-8").splitlines():
            e = json.loads(row)
            if e.get("receivedAt") and e.get("status") in ("진입", "도착", "출발"):
                records.append(e)
                shared[(e["fetchedAt"], e["line"], e["direction"], e["receivedAt"])] += 1
    trains = defaultdict(dict)
    for e in records:
        e["event"] = shared[(e["fetchedAt"], e["line"], e["direction"], e["receivedAt"])] < 3
        trains[(e["line"], e["trainNo"])].setdefault((e["receivedAt"], e["station"], e["status"]), e)

    pace, zone, approach = defaultdict(list), defaultdict(list), defaultdict(list)
    for (line, _), evs in trains.items():
        seq = sorted(evs.values(), key=lambda e: e["receivedAt"])
        for e1, e2 in zip(seq, seq[1:]):
            a, b = node_of.get((line, key(e1["station"]))), node_of.get((line, key(e2["station"])))
            dt = ts(e2["receivedAt"]) - ts(e1["receivedAt"])
            if a is None or b is None or dt <= 0 or dt > 1500:
                continue
            s1, s2 = e1["status"], e2["status"]
            if a == b:
                if e1["event"] and e2["event"]:
                    if (s1, s2) == ("도착", "출발") and dt < 300:
                        zone[line].append(dt)
                    if (s1, s2) == ("진입", "도착") and dt < 180:
                        approach[line].append(dt)
                continue
            sched = scheduled(line, a, b)
            if sched and s1 == s2 and s1 in ("도착", "출발"):
                hops, run = sched
                pace[line].append(dt / (run + hops * times["dwell"].get(line, 30)))

    stat = {"pace": statistics.median, "zone": statistics.harmonic_mean, "approach": statistics.harmonic_mean}
    lines = {}
    for line in sorted(set(pace) | set(zone) | set(approach)):
        out = {}
        for name, values in (("pace", pace[line]), ("zone", zone[line]), ("approach", approach[line])):
            if len(values) >= MIN_N[name]:
                lo, hi = CLAMP[name]
                v = min(hi, max(lo, stat[name](values)))
                out[name] = round(v, 2) if name == "pace" else round(v)
        if out:
            lines[line] = out
    result = {"lines": lines, "default": DEFAULT, "from": [Path(p).name for p in paths]}
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for line, v in lines.items():
        print(f"{line:6} {v}  (n pace {len(pace[line])}, zone {len(zone[line])}, approach {len(approach[line])})")


if __name__ == "__main__":
    main(sys.argv[1:])
