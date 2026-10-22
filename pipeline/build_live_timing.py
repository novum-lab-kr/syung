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
- stops: {station id: zone} for every station with STOP_MIN_N timed stands whose own zone differs
  from the line's: the median 도착→출발 + 5 (the map has 출발 come zone − 5 s after 도착).
- waits: {"<station id>:<direction>:rush|day": zone} for local (non-express) trains where their own 도착→출발 differs
  from stops by WAIT_DIFF s or more: the median + 5, like stops. 9호선 완행 wait ~200 s at 가양 · 동작 · 샛강 · 사평 · 송파나루
  for an express to pass (대피), by direction and rush hour (동작 in the day, 샛강 · 사평 하행 at rush), while stops mixed both
  kinds into one 70–92 s — the map left waiting trains ~2–3 min early and ran them up to three stations ahead (화면 재현 9호선
  p90 63–99 s against 7 · 2호선 24–37 s, 2026-10-22). Only position-feed records say express, so only they teach waits.
- runs: {"a:b": seconds} per direction of every edge: the median 출발 at a → 도착 at b (RUN_MIN_N of
  them), or for stations whose feed never says 출발 (코레일 sections) the median 도착 → next 도착
  less a's stand. The timetable × pace is only the fallback.
  Why (2026-10-07): the per-line constants stopped improving at a median error of 9–10 s, while the
  feed itself is steady per place: fitting each edge's own median on the same day leaves 1 s on
  출발→다음 도착 (the line constants 15 s) and 5 s overall. Learned on the 7 days before and scored on
  the next (10/4, 10/5, 10/6 each) the error went 9.0–9.9 → 5.0 s (출발→다음 도착 10 → 1,
  도착→다음 도착 11 → 7, 도착→출발 7 → 6), 2호선 7 → 2, 1호선 11 → 8, 3호선 14 → 12; hour of day,
  rush hour and weekday/weekend per edge did not help out of sample — what is left is how long
  each train happens to stand.
  역 정차(stops)를 시간대로 나눠도 같았다(2026-10-15, 10-13 채점 · 앞 14일 학습): 출퇴근 · 아침/저녁/낮 · 매시 모두
  평균 15.36 → 15.28~15.33 s, 출퇴근 평균 17.6 → 17.3 s — 남은 오차는 열차마다 우연히 오래 서는 것이라 넣지 않았다.
- approach: seconds from 진입 to 도착.
All three only use records stamped with their own event time (a stamp shared by three or
more trains of a line and direction in one fetch is a snapshot time, useless for durations this
short), and take the harmonic mean: a state is caught in a sample about in proportion to how long
it lasts, so the plain mean would overweight long ones.
Files under a "position" directory are position-feed bursts (the proxy's BURST_* settings):
every record there carries its own event time, which gives zone and approach on the lines whose
all-stations records are all snapshot-stamped (2·5·6·7·9호선).
Records are read one day at a time (all days at once took 4.9 GB and was killed once, 2026-10-03).
Usage: build_live_timing.py <samples.jsonl | position/*.jsonl> [...]
"""

from __future__ import annotations

import json
import statistics
import sys
from bisect import bisect_left
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyse_live_samples import key, node_of, scheduled, times, ts  # noqa: E402
from sample_files import day_of, lines  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "live-timing.json"
# zone 62 where unmeasured (2·5·6·7·9호선 are snapshot-stamped): 8호선 measures 62 s, and the
# 7호선 position feed's own event times 67 s (2026-09-28, 45 stops) — 40 s had 7호선 trains leave
# ~30 s early
DEFAULT = {"pace": 1.0, "zone": 62, "approach": 40}
STOP_MIN_N, STOP_CLAMP, RUN_MIN_N = 30, (30, 180), 15
WAIT_MIN_N, WAIT_CLAMP, WAIT_DIFF, WAIT_MAX = 8, (30, 360), 30, 420   # 완행 대피: 기록 수 · 범위 · stops 와 이만큼 달라야 · 이보다 긴 도착→출발은 버림
WINDOW = 14   # days a nightly retrain learns from (retrain_live_timing.py)
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


READ_GAP = 120   # 위치 피드: 앞 읽기와 이만큼(초) 안이어야 이어 본 것(pairs)


class Trains(dict):
    """load() 의 결과: 열차마다 기록 + 노선마다 위치 피드를 읽은 때(reads, 초)."""
    reads: dict


def read_at(fetched) -> float | None:
    try:
        return datetime.fromisoformat(fetched).timestamp()
    except (TypeError, ValueError):
        return None


def load(paths: list[str]) -> dict:
    """(source, line, trainNo) → that train's records, first sightings in time order, each marked
    event (own event time) or not (a snapshot stamp)."""
    records, shared, reads = [], Counter(), defaultdict(set)
    for p in paths:
        position = Path(p).parent.name == "position"
        for row in lines(p):   # .jsonl or .jsonl.gz
            e = json.loads(row)
            e["source"] = "position" if position else "all"
            if position:
                e["read"] = read_at(e.get("fetchedAt"))
                if e["read"] is not None:
                    reads[e["line"]].add(e["read"])
                e["fetchedAt"] = f"position:{e.get('fetchedAt')}:{e['trainNo']}"   # never shared: event stamps
            if e.get("receivedAt") and e.get("status") in ("진입", "도착", "출발"):
                records.append(e)
                # stampedAt: the feed's own stamp (the proxy re-dates receivedAt since 2026-09-28)
                shared[(e["fetchedAt"], e["line"], e["direction"], e.get("stampedAt") or e["receivedAt"])] += 1
    trains = defaultdict(dict)
    for e in records:
        e["event"] = shared[(e["fetchedAt"], e["line"], e["direction"], e.get("stampedAt") or e["receivedAt"])] < 3
        trains[(e["source"], e["line"], e["trainNo"])].setdefault((e["receivedAt"], e["station"], e["status"]), e)
    out = Trains()
    out.reads = {line: sorted(v) for line, v in reads.items()}
    for k, evs in trains.items():
        seq = sorted(evs.values(), key=lambda e: e["receivedAt"])
        # the same station and status seen again later (every snapshot re-stamps it) is not a new
        # event: keep the first sighting, or spans to the next event come out short
        out[k] = [e for i, e in enumerate(seq) if i == 0 or (e["station"], e["status"]) != (seq[i - 1]["station"], seq[i - 1]["status"])]
    return out


def pairs(trains: dict):
    """Consecutive records of a train: (line, e1, e2, station a, station b, seconds apart).
    위치 피드는 그 노선을 READ_GAP 초 안에 이어 읽었을 때만(e2 를 본 읽기의 바로 앞 읽기가 READ_GAP 안): 띄엄띄엄 읽으면 그 사이 사건을
    놓쳐 '다음 사건' 짝이 아니다 — 2026-10-16 부터 노선마다 약 7분에 한 번 읽어 채점 평균이 15 → 30초로 커 보였다(덕배 2026-10-18)."""
    reads = getattr(trains, "reads", {})
    for (source, line, _), seq in trains.items():
        times_read = reads.get(line, [])
        for e1, e2 in zip(seq, seq[1:]):
            a, b = node_of.get((line, key(e1["station"]))), node_of.get((line, key(e2["station"])))
            dt = ts(e2["receivedAt"]) - ts(e1["receivedAt"])
            if a is None or b is None or not 0 < dt <= 1500:
                continue
            if source == "position" and (r := e2.get("read")) is not None:
                i = bisect_left(times_read, r)
                if i == 0 or r - times_read[i - 1] > READ_GAP:
                    continue
            yield line, e1, e2, a, b, dt


def day_pairs(paths: list[str]):
    """pairs() one day at a time (a train running past midnight loses that one pair)."""
    days = defaultdict(list)
    for p in paths:
        days[day_of(Path(p)) or p].append(p)
    for group in days.values():
        yield from pairs(load(group))


def wait_key(a, e: dict) -> str | None:
    """waits 의 열쇠(완행만 — 급행 여부를 모르는 기록은 None): 역 · 방향 · 출퇴근(rush)/그 밖(day)."""
    if e.get("express") is not False:
        return None
    return f"{a}:{e.get('direction')}:{'rush' if rush(e['receivedAt']) else 'day'}"


def stand(tm: dict, a, e: dict | None = None) -> float:
    """Seconds from 도착 until the train pulls out at station a (출발 comes 15 s later); e: the 도착 record, for a local's wait."""
    k = wait_key(a, e) if e else None
    zone = tm.get("waits", {}).get(k) if k else None
    return max(15, (zone or tm.get("stops", {}).get(str(a), tm["zone"])) - 10)


def learn(paths: list[str], verbose: bool = False) -> dict:
    pace, zone, approach, rush_pace = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    zone_at, leave, onward = defaultdict(list), defaultdict(list), defaultdict(list)   # (line, a, b): 출발 → 도착, 도착 → 도착
    wait_at = defaultdict(list)   # (line, wait_key): 완행의 도착 → 출발
    for line, e1, e2, a, b, dt in day_pairs(paths):
        s1, s2, both = e1["status"], e2["status"], e1["event"] and e2["event"]
        if a == b:
            if both and (s1, s2) == ("도착", "출발") and dt < 300:
                zone[line].append(dt)
                zone_at[(line, a)].append(dt)
            if both and (s1, s2) == ("도착", "출발") and dt < WAIT_MAX and (k := wait_key(a, e1)):
                wait_at[(line, k)].append(dt)
            if both and (s1, s2) == ("진입", "도착") and dt < 180:
                approach[line].append(dt)
            continue
        if both and s2 == "도착" and (run := times["edges"].get(f"{line}:{min(a, b)}:{max(a, b)}")):
            if s1 == "출발" and dt < run + 300:
                leave[(line, a, b)].append(dt)
            elif s1 == "도착" and 0.5 * run < dt < run + 300:
                onward[(line, a, b)].append(dt)
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
        base = out.get("zone", DEFAULT["zone"])
        stops = {str(a): round(min(STOP_CLAMP[1], max(STOP_CLAMP[0], statistics.median(v) + 5)))
                 for (l, a), v in sorted(zone_at.items()) if l == line and len(v) >= STOP_MIN_N}
        stops = {a: v for a, v in stops.items() if v != base}
        if stops:
            out["stops"] = stops
        waits = {}
        for (l, k), v in sorted(wait_at.items()):
            if l == line and len(v) >= WAIT_MIN_N:
                w = round(min(WAIT_CLAMP[1], max(WAIT_CLAMP[0], statistics.median(v) + 5)))
                if abs(w - stops.get(k.split(":")[0], base)) >= WAIT_DIFF:
                    waits[k] = w
        if waits:
            out["waits"] = waits
        tm, runs = {**DEFAULT, **out}, {}
        for (l, a, b) in sorted(set(leave) | set(onward)):
            if l != line:
                continue
            if len(leave[(l, a, b)]) >= RUN_MIN_N:
                runs[f"{a}:{b}"] = round(statistics.median(leave[(l, a, b)]))
            elif len(onward[(l, a, b)]) >= RUN_MIN_N:   # no 출발 here: the stand is the line's, the rest is the run
                runs[f"{a}:{b}"] = max(5, round(statistics.median(onward[(l, a, b)]) - stand(tm, a) - 5))
        if runs:
            out["runs"] = runs
        lines[line] = out
        if not out:
            lines.pop(line)
        if verbose and out:
            print(f"{line:6} {({k: v for k, v in out.items() if k not in ('stops', 'runs', 'waits')})} stops {len(out.get('stops', {}))} waits {len(out.get('waits', {}))} runs {len(out.get('runs', {}))}  (n pace {len(pace[line])}, rush {len(rush_pace[line])}, zone {len(zone[line])}, approach {len(approach[line])})")
    counts = {line: {k: n for k, n in (("pace", len(pace[line])), ("rushPace", len(rush_pace[line])),
                                       ("zone", len(zone[line])), ("approach", len(approach[line])),
                                       ("runs", sum(len(v) for (l, _, _), v in leave.items() if l == line))) if n}
              for line in sorted(set(pace) | set(zone) | set(approach))}
    return {"lines": lines, "default": DEFAULT, "from": [Path(p).name for p in paths], "n": counts}


def brief(lines: dict) -> dict:
    """Learned values for the log and the learning page: the per-edge runs as a count."""
    return {line: {k: (len(v) if k in ("runs", "waits") else v) for k, v in out.items()} for line, out in lines.items()}


def evaluate(timing: dict, paths: list[str]) -> dict:
    """Median |predicted − observed| seconds for the next event, as the map rolls trains
    (maplibre_runtime.mjs planTrain: a 도착 record's train leaves zone − 20 s later and is 15 s into
    its run at 출발, so 출발 comes zone − 5 s after 도착; the next 도착 comes the edge's learned run
    (runs), else pace × (run + 30) − zone + 5 s, after 출발), over event-stamped records.
    mean: the mean error, to tell apart timings whose medians tie at whole seconds.
    p90 · means: 학습 현황 화면용 — 오차가 정수 초라 중앙값은 10-08 부터 늘 5초에 걸려 있었다(4초 이하 45 %, 5초 이하 50 %).
    평균 · 90 % 는 꼬리(출퇴근에 오래 서는 열차)까지 보여 조금씩 나아지는 게 보인다(덕배 2026-10-15)."""
    errors = defaultdict(list)
    for line, e1, e2, a, b, dt in day_pairs(paths):
        if not (e1["event"] and e2["event"]):
            continue
        tm = {**timing["default"], **timing["lines"].get(line, {})}
        if "rushPace" in tm and rush(e1["receivedAt"]):
            tm["pace"] = tm["rushPace"]
        s1, s2 = e1["status"], e2["status"]
        leave = stand(tm, a, e1 if s1 == "도착" else None) + 5   # 도착 → 출발 at the station it stands at
        if a == b and (s1, s2) == ("도착", "출발"):
            kind, predicted = "도착→출발", leave
        elif a != b and s2 == "도착" and s1 in ("도착", "출발") and (run := times["edges"].get(f"{line}:{min(a, b)}:{max(a, b)}")):
            moving = tm.get("runs", {}).get(f"{a}:{b}")   # 출발 → 도착
            if moving is None:
                moving = max(0.5 * run, tm["pace"] * (run + 30) - tm["zone"]) + 5
            kind, predicted = (f"{s1}→다음 도착", leave + moving if s1 == "도착" else moving)
        else:
            continue
        errors[kind].append(abs(predicted - dt))
    every = [x for v in errors.values() for x in v]
    p90 = lambda v: sorted(v)[int(0.9 * len(v))]
    return {"all": round(statistics.median(every), 1) if every else None, "n": len(every),
            "mean": round(statistics.mean(every), 2) if every else None,
            "p90": p90(every) if every else None,
            "means": {k: round(statistics.mean(v), 1) for k, v in errors.items()},
            **{k: round(statistics.median(v), 1) for k, v in errors.items()}}


def main(paths: list[str]) -> None:
    result = learn(paths, verbose=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
