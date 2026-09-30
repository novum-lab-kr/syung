#!/usr/bin/env python3
"""Per-line timing for rolling live trains forward, learned from sample_live_positions.py samples.

Output (data/live-timing.json), read by the map runtime:
  {"lines": {"<line>": {"pace": x, "zone": s, "approach": s}}, "default": {...}, "from": [...],
   "n": {"<line>": {"pace": spans, ...}}}   (n: how many spans each value was learned from)
- pace: observed ÷ timetable time over 1–4 stations between two records of the same status
  (first sightings only)
  (도착→도착, 출발→출발), median. The feed's 도착/출발 mark a train entering and leaving the
  station section, so equal-status spans cancel that offset. Clamped to 0.95–1.05. Measured on snapshot
  stamps it came out 0.82–0.87 on 2·5·6·7·9호선, yet riding 7호선 (7081, 2026-09-28) the trains ran
  at timetable pace and the map, rolling them at 0.85, was a station ahead; on event stamps the
  same lines give 0.97–1.02.
- rushPace: pace over spans starting in weekday rush hours (RUSH, KST), when Seoul Metro lines run
  slower (7호선 1.045 against 0.927 the rest of the day, 2026-09-24–30); the map uses it then.
  Only for lines with RUSH_MIN_N spans; else the map keeps pace.
- zone: seconds from 도착 to 출발 at one station (the train inside the station section).
- approach: seconds from 진입 to 도착.
All three only use records stamped with their own event time (a stamp shared by three or
more trains of a line and direction in one fetch is a snapshot time, useless for durations this
short), and take the harmonic mean: a state is caught in a sample about in proportion to how long
it lasts, so the plain mean would overweight long ones.
Files under a "position" directory are position-feed bursts (the proxy's BURST_* settings):
every record there carries its own event time, which gives zone and approach on the lines whose
all-stations records are all snapshot-stamped (2·5·6·7·9호선).
Usage: build_live_timing.py <samples.jsonl | position/*.jsonl> [...]
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
# zone 62 where unmeasured (2·5·6·7·9호선 are snapshot-stamped): 8호선 measures 62 s, and the
# 7호선 position feed's own event times 67 s (2026-09-28, 45 stops) — 40 s had 7호선 trains leave
# ~30 s early
DEFAULT = {"pace": 1.0, "zone": 62, "approach": 40}
MIN_N = {"pace": 200, "zone": 100, "approach": 100, "rushPace": 60}
CLAMP = {"pace": (0.95, 1.05), "zone": (40, 95), "approach": (25, 85), "rushPace": (0.95, 1.12)}
# weekday rush hours, KST minutes of the day [start, end) — maplibre_runtime.mjs RUSH is the same
RUSH = ((7 * 60, 9 * 60 + 30), (17 * 60 + 30, 20 * 60))


def rush(stamp: str) -> bool:
    """A receivedAt ("YYYY-MM-DD HH:MM:SS", KST) in weekday rush hours."""
    from datetime import date
    if date.fromisoformat(stamp[:10]).weekday() >= 5:
        return False
    m = int(stamp[11:13]) * 60 + int(stamp[14:16])
    return any(a <= m < b for a, b in RUSH)


def load(paths: list[str]) -> dict:
    """(source, line, trainNo) → that train's records, first sightings in time order, each marked
    event (own event time) or not (a snapshot stamp)."""
    records, shared = [], Counter()
    for p in paths:
        position = Path(p).parent.name == "position"
        for row in Path(p).read_text(encoding="utf-8").splitlines():
            e = json.loads(row)
            e["source"] = "position" if position else "all"
            if position:
                e["fetchedAt"] = f"position:{e.get('fetchedAt')}:{e['trainNo']}"   # never shared: event stamps
            if e.get("receivedAt") and e.get("status") in ("진입", "도착", "출발"):
                records.append(e)
                # stampedAt: the feed's own stamp (the proxy re-dates receivedAt since 2026-09-28)
                shared[(e["fetchedAt"], e["line"], e["direction"], e.get("stampedAt") or e["receivedAt"])] += 1
    trains = defaultdict(dict)
    for e in records:
        e["event"] = shared[(e["fetchedAt"], e["line"], e["direction"], e.get("stampedAt") or e["receivedAt"])] < 3
        trains[(e["source"], e["line"], e["trainNo"])].setdefault((e["receivedAt"], e["station"], e["status"]), e)
    out = {}
    for k, evs in trains.items():
        seq = sorted(evs.values(), key=lambda e: e["receivedAt"])
        # the same station and status seen again later (every snapshot re-stamps it) is not a new
        # event: keep the first sighting, or spans to the next event come out short
        out[k] = [e for i, e in enumerate(seq) if i == 0 or (e["station"], e["status"]) != (seq[i - 1]["station"], seq[i - 1]["status"])]
    return out


def pairs(trains: dict):
    """Consecutive records of a train: (line, e1, e2, station a, station b, seconds apart)."""
    for (_, line, _), seq in trains.items():
        for e1, e2 in zip(seq, seq[1:]):
            a, b = node_of.get((line, key(e1["station"]))), node_of.get((line, key(e2["station"])))
            dt = ts(e2["receivedAt"]) - ts(e1["receivedAt"])
            if a is not None and b is not None and 0 < dt <= 1500:
                yield line, e1, e2, a, b, dt


def learn(paths: list[str], verbose: bool = False) -> dict:
    pace, zone, approach, rush_pace = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    for line, e1, e2, a, b, dt in pairs(load(paths)):
        s1, s2, both = e1["status"], e2["status"], e1["event"] and e2["event"]
        if a == b:
            if both and (s1, s2) == ("도착", "출발") and dt < 300:
                zone[line].append(dt)
            if both and (s1, s2) == ("진입", "도착") and dt < 180:
                approach[line].append(dt)
            continue
        sched = scheduled(line, a, b)
        if sched and s1 == s2 and s1 in ("도착", "출발") and both:
            hops, run = sched
            pace[line].append(dt / (run + hops * times["dwell"].get(line, 30)))
            if rush(e1["receivedAt"]):
                rush_pace[line].append(pace[line][-1])

    stat = {"pace": statistics.median, "zone": statistics.harmonic_mean, "approach": statistics.harmonic_mean,
            "rushPace": statistics.median}
    lines = {}
    for line in sorted(set(pace) | set(zone) | set(approach)):
        out = {}
        for name, values in (("pace", pace[line]), ("zone", zone[line]), ("approach", approach[line]),
                             ("rushPace", rush_pace[line])):
            if len(values) >= MIN_N[name]:
                lo, hi = CLAMP[name]
                v = min(hi, max(lo, stat[name](values)))
                out[name] = round(v, 2) if name in ("pace", "rushPace") else round(v)
        if abs(out.get("rushPace", 0) - out.get("pace", DEFAULT["pace"])) < 0.02:
            out.pop("rushPace", None)   # no different at rush hour
        if out:
            lines[line] = out
        if verbose and out:
            print(f"{line:6} {out}  (n pace {len(pace[line])}, rush {len(rush_pace[line])}, zone {len(zone[line])}, approach {len(approach[line])})")
    counts = {line: {k: n for k, n in (("pace", len(pace[line])), ("rushPace", len(rush_pace[line])),
                                       ("zone", len(zone[line])), ("approach", len(approach[line]))) if n}
              for line in sorted(set(pace) | set(zone) | set(approach))}
    return {"lines": lines, "default": DEFAULT, "from": [Path(p).name for p in paths], "n": counts}


def evaluate(timing: dict, paths: list[str]) -> dict:
    """Median |predicted − observed| seconds for the next event, as the map rolls trains
    (maplibre_runtime.mjs planTrain: a 도착 record's train leaves zone − 20 s later and is 15 s into
    its run at 출발, so 출발 comes zone − 5 s after 도착; the next 도착 comes pace × (run + 30) −
    zone + 5 s after 출발), over event-stamped records."""
    errors = defaultdict(list)
    for line, e1, e2, a, b, dt in pairs(load(paths)):
        if not (e1["event"] and e2["event"]):
            continue
        tm = {**timing["default"], **timing["lines"].get(line, {})}
        if "rushPace" in tm and rush(e1["receivedAt"]):
            tm["pace"] = tm["rushPace"]
        stand = max(15, tm["zone"] - 10)
        s1, s2 = e1["status"], e2["status"]
        if a == b and (s1, s2) == ("도착", "출발"):
            kind, predicted = "도착→출발", stand + 5
        elif a != b and s2 == "도착" and s1 in ("도착", "출발") and (run := times["edges"].get(f"{line}:{min(a, b)}:{max(a, b)}")):
            moving = max(0.5 * run, tm["pace"] * (run + 30) - tm["zone"]) + 10
            kind, predicted = (f"{s1}→다음 도착", stand + moving if s1 == "도착" else moving - 5)
        else:
            continue
        errors[kind].append(abs(predicted - dt))
    every = [x for v in errors.values() for x in v]
    return {"all": round(statistics.median(every), 1) if every else None, "n": len(every),
            **{k: round(statistics.median(v), 1) for k, v in errors.items()}}


def main(paths: list[str]) -> None:
    result = learn(paths, verbose=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
