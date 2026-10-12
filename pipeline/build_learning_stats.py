#!/usr/bin/env python3
"""Numbers for the learning page (web/admin/learning.html) → <web folder>/admin/learning.json.

- days: per collection day, the records kept (samples: the all-stations feed; position: the
  per-line position feed), how many of them carry their own event time (only those can time a
  stop or a run, build_live_timing.load) and how many trains they cover
- history: per nightly retrain (retrain.log), the holdout error of the timing in use and of the
  candidate, the result and the learned values with their sample counts. Days before the nightly
  retrain existed are backfilled the same way it works: learn on the week before yesterday, score
  on yesterday, then learn again with yesterday included.
- latest: the live-timing.json the map uses now, plus every line's stations in route order with
  their names, and per station how often its stand (도착→출발) was timed over the days that timing
  learned from and the median, and how many 도착 → next 도착 runs left it (stands: {line: {id:
  [n, s, runs]}}, before STOP_MIN_N/clamp). latest.lines leaves out the per-edge runs (a count instead).
- bus: the bus positions the bus proxy recorded (server/store/records.py record_bus, bus/YYYYMMDD.jsonl): per day
  the upstream answers (calls), vehicle rows, distinct buses and routes, and per route over all days
  the calls and buses with its name and colour. Not learned from yet.
Per-day numbers are cached in /var/lib/subway-live (a day's file is read again only when it grew).
Run by retrain_live_timing.py after each retrain; by hand: build_learning_stats.py [web folder]
"""

from __future__ import annotations

import json
import statistics
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyse_live_samples import metro, times  # noqa: E402
from build_live_timing import OUT as REPO_TIMING, WINDOW, brief, day_pairs, evaluate, learn, load  # noqa: E402
from sample_files import all_days, day_files, lines  # noqa: E402

KST = timezone(timedelta(hours=9))
STATE = Path("/var/lib/subway-live")
DAYS_CACHE = STATE / "learning-days.json"
BUS_CACHE = STATE / "learning-bus-days.json"
BUS_ROUTES = Path(__file__).resolve().parent.parent / "data" / "bus" / "routes.json"
HISTORY_CACHE = STATE / "learning-history.json"




def line_stations() -> dict:
    """{line: station ids in route order}, longest route variant first."""
    out = {}
    for line, variants in metro["lines"].items():
        seen = {}
        for v in sorted(variants, key=lambda v: -len(v["stops"])):
            seen.update(dict.fromkeys(v["stops"]))
        out[line] = list(seen)
    return out


def station_stands(paths: list[str]) -> dict:
    """Timed stands and onward runs per station, the way build_live_timing.learn collects them."""
    at, runs = defaultdict(list), defaultdict(int)
    for line, e1, e2, a, b, dt in day_pairs(paths):
        if not (e1["event"] and e2["event"]):
            continue
        if a == b and (e1["status"], e2["status"]) == ("도착", "출발") and dt < 300:
            at[(line, a)].append(dt)
        elif a != b and (e1["status"], e2["status"]) == ("도착", "도착") \
                and (run := times["edges"].get(f"{line}:{min(a, b)}:{max(a, b)}")) and 0.5 * run < dt < run + 300:
            runs[(line, a)] += 1
    out = defaultdict(dict)
    for line, a in sorted(set(at) | set(runs)):
        v = at.get((line, a), [])
        out[line][str(a)] = [len(v), round(statistics.median(v)) if v else None, runs.get((line, a), 0)]
    return dict(out)


def day_stats(d: date, cache: dict) -> dict:
    files = day_files(d)
    stamp = [[p.name, p.parent.name, p.stat().st_size] for p in files]
    key = d.isoformat()
    if cache.get(key, {}).get("stamp") == stamp:
        return cache[key]
    out = {"date": key, "stamp": stamp}
    for p in files:
        src = p.parent.name   # samples | position
        rows = sum(1 for _ in lines(p))
        trains = load([str(p)])
        events = sum(1 for seq in trains.values() for e in seq if e["event"])
        firsts = sum(len(seq) for seq in trains.values())
        out[src] = {"records": rows, "sightings": firsts, "event": events, "trains": len(trains)}
    cache[key] = out
    return out


def bus_day_stats(p: Path, cache: dict) -> dict:
    """One day of recorded bus answers: calls, rows, buses, and per route [calls, buses]."""
    stamp = [p.name, p.stat().st_size]
    key = p.name.split(".", 1)[0]
    if cache.get(key, {}).get("stamp") == stamp:
        return cache[key]
    calls, buses, routes = set(), set(), defaultdict(lambda: [set(), set()])
    rows = 0
    for row in lines(p):
        e = json.loads(row)
        rows += 1
        rid, call = e.get("routeId"), (e.get("routeId"), e.get("fetchedAt"))
        calls.add(call)
        buses.add((rid, e.get("vehId")))
        routes[rid][0].add(call)
        routes[rid][1].add(e.get("vehId"))
    d = f"{key[:4]}-{key[4:6]}-{key[6:8]}"
    out = {"date": d, "stamp": stamp, "calls": len(calls), "rows": rows, "buses": len(buses), "routes": len(routes),
           "byRoute": {rid: [len(c), len(v)] for rid, (c, v) in routes.items()}}
    cache[key] = out
    return out


def bus_stats() -> dict:
    cache = json.loads(BUS_CACHE.read_text(encoding="utf-8")) if BUS_CACHE.exists() else {}
    days = [bus_day_stats(p, cache) for p in sorted((STATE / "bus").glob("*.jsonl*"))]
    BUS_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    try:
        known = {r["id"]: r for r in json.loads(BUS_ROUTES.read_text(encoding="utf-8"))["routes"]}
    except (OSError, ValueError, KeyError):
        known = {}
    total = defaultdict(lambda: [0, 0, 0])   # 부른 횟수(모든 날), 버스 수(가장 많이 본 날), 모은 날
    for d in days:
        for rid, (c, v) in d["byRoute"].items():
            t = total[rid]
            t[0] += c
            t[1] = max(t[1], v)
            t[2] += 1
    routes = [{"id": rid, "name": known.get(rid, {}).get("name", rid), "color": known.get(rid, {}).get("color"),
               "type": known.get(rid, {}).get("type"), "calls": c, "buses": v, "days": n}
              for rid, (c, v, n) in sorted(total.items(), key=lambda x: -x[1][0])]
    return {"days": [{k: v for k, v in d.items() if k not in ("stamp", "byRoute")} for d in days], "routes": routes}


def backfill(d: date, have: set[date]) -> dict | None:
    """What the nightly retrain on day d would have done."""
    holdout = [str(p) for p in day_files(d - timedelta(days=1))]
    train = [str(p) for k in range(2, WINDOW + 2) for p in day_files(d - timedelta(days=k))]
    if not holdout or not train:
        return None
    candidate = learn(train)
    final = learn(train + holdout)
    return {"date": d.isoformat(), "source": "backfill", "candidate": evaluate(candidate, holdout),
            "result": "backfill", "lines": brief(final["lines"]), "n": final.get("n"), "train_files": len(train)}


def main(web: Path) -> None:
    days_cache = json.loads(DAYS_CACHE.read_text(encoding="utf-8")) if DAYS_CACHE.exists() else {}
    history = json.loads(HISTORY_CACHE.read_text(encoding="utf-8")) if HISTORY_CACHE.exists() else {}
    days = all_days(STATE)
    today = datetime.now(KST).date()
    stats = [day_stats(d, days_cache) for d in days]
    DAYS_CACHE.write_text(json.dumps(days_cache, ensure_ascii=False), encoding="utf-8")

    # nightly runs from the log (the logged numbers win over a backfill of the same day)
    log = STATE / "retrain.log"
    for row in (log.read_text(encoding="utf-8").splitlines() if log.exists() else []):
        e = json.loads(row)
        d = e["at"][:10]
        prev = history.get(d, {})
        history[d] = {"date": d, "source": "retrain", "current": e.get("current"), "candidate": e.get("candidate"),
                      "result": e.get("result"), "lines": e.get("lines") or prev.get("lines"),
                      "n": e.get("n") or prev.get("n"), "train_files": e.get("train_files")}
    for d in [days[0] + timedelta(days=k) for k in range((today - days[0]).days + 1)] if days else []:
        if d.isoformat() not in history and d <= today:
            b = backfill(d, set(days))
            if b:
                history[d.isoformat()] = b
        elif history.get(d.isoformat(), {}).get("n") is None and d <= today:
            b = backfill(d, set(days))   # a logged run from before counts were kept
            if b:
                history[d.isoformat()]["n"] = b["n"]
    HISTORY_CACHE.write_text(json.dumps(history, ensure_ascii=False), encoding="utf-8")

    timing = STATE / "live-timing.json"
    latest = json.loads((timing if timing.exists() else REPO_TIMING).read_text(encoding="utf-8"))
    learned_from = [str(p) for k in range(1, WINDOW + 2) for p in day_files(today - timedelta(days=k))]
    stations = line_stations()
    names = {n["id"]: n["name"] for n in metro["nodes"]}
    out = {"generatedAt": datetime.now(KST).isoformat(timespec="seconds"),
           "retrainAt": "매일 03:10", "window": WINDOW,
           "days": [{k: v for k, v in s.items() if k != "stamp"} for s in stats],
           "history": [history[k] for k in sorted(history)],
           "latest": {"lines": brief(latest.get("lines") or {}), "default": latest.get("default"), "n": latest.get("n"),
                      "stations": stations, "stands": station_stands(learned_from),
                      "names": {str(a): names[a] for ids in stations.values() for a in ids if a in names}},
           "bus": bus_stats()}
    target = web / "admin" / "learning.json"   # 관리 페이지와 같은 폴더: Caddy 가 /admin/* 을 주인만 보여 준다
    target.parent.mkdir(exist_ok=True)
    tmp = target.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(target)
    print(json.dumps({"days": len(out["days"]), "history": len(out["history"]), "bytes": target.stat().st_size}))


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/var/www/syung"))
