#!/usr/bin/env python3
"""Numbers for the learning page (web/learning.html) → <web folder>/learning.json.

- days: per collection day, the records kept (samples: the all-stations feed; position: the
  per-line position feed), how many of them carry their own event time (only those can time a
  stop or a run, build_live_timing.load) and how many trains they cover
- history: per nightly retrain (retrain.log), the holdout error of the timing in use and of the
  candidate, the result and the learned values with their sample counts. Days before the nightly
  retrain existed are backfilled the same way it works: learn on the week before yesterday, score
  on yesterday, then learn again with yesterday included.
- latest: the live-timing.json the map uses now
Per-day numbers are cached in /var/lib/subway-live (a day's file is read again only when it grew).
Run by retrain_live_timing.py after each retrain; by hand: build_learning_stats.py [web folder]
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_live_timing import OUT as REPO_TIMING, evaluate, learn, load  # noqa: E402
from sample_files import all_days, day_files, lines  # noqa: E402

KST = timezone(timedelta(hours=9))
STATE = Path("/var/lib/subway-live")
DAYS_CACHE = STATE / "learning-days.json"
HISTORY_CACHE = STATE / "learning-history.json"
WINDOW = 7   # days of samples a retrain learns from (retrain_live_timing.DAYS)




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


def backfill(d: date, have: set[date]) -> dict | None:
    """What the nightly retrain on day d would have done."""
    holdout = [str(p) for p in day_files(d - timedelta(days=1))]
    train = [str(p) for k in range(2, WINDOW + 2) for p in day_files(d - timedelta(days=k))]
    if not holdout or not train:
        return None
    candidate = learn(train)
    final = learn(train + holdout)
    return {"date": d.isoformat(), "source": "backfill", "candidate": evaluate(candidate, holdout),
            "result": "backfill", "lines": final["lines"], "n": final.get("n"), "train_files": len(train)}


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
    out = {"generatedAt": datetime.now(KST).isoformat(timespec="seconds"),
           "retrainAt": "매일 03:10", "window": WINDOW,
           "days": [{k: v for k, v in s.items() if k != "stamp"} for s in stats],
           "history": [history[k] for k in sorted(history)],
           "latest": {"lines": latest.get("lines"), "default": latest.get("default"), "n": latest.get("n")}}
    target = web / "learning.json"
    tmp = target.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(target)
    print(json.dumps({"days": len(out["days"]), "history": len(out["history"]), "bytes": target.stat().st_size}))


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/var/www/syung"))
