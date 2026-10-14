#!/usr/bin/env python3
"""Nightly: relearn live-timing.json from the last two weeks of samples, and publish it only if it
predicts yesterday at least as well as the one in use.

- candidate: learned from the WINDOW (14) days before yesterday (samples + position bursts); the
  per-edge runs need more than a week for the rarer edges, and a day is read at a time
- both it and the current file are scored on yesterday (build_live_timing.evaluate: median error
  in seconds of the next event, event-stamped records)
- candidate no worse: median and mean error no higher, and no kind of event more than SLACK s
  worse (until 2026-10-07 the rule was median ≤ current + 0.5 s, and 10/6 published a timing whose
  도착→출발 went 7.0 → 8.0 s): relearn with yesterday included, write it to
  /var/lib/subway-live/live-timing.json and the web folder; otherwise keep the current one
- first, the finished days' record files are gzipped (sample_files.compress_old)
- every run appends one JSON line to /var/lib/subway-live/retrain.log (the learned values without the
  per-edge runs, only their count: they would add ~20 kB a night)
deploy/deploy.sh publishes /var/lib/subway-live/live-timing.json when it exists, so a deploy does
not roll a retrained file back to the repository's copy.
Usage: retrain_live_timing.py [web folder, default /var/www/syung]
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_live_timing import OUT as REPO_TIMING, WINDOW, brief, evaluate, learn  # noqa: E402
from sample_files import compress_old, day_files  # noqa: E402

STATE = Path("/var/lib/subway-live")
TIMING = STATE / "live-timing.json"
LOG = STATE / "retrain.log"
DAYS, SLACK = WINDOW, 0.5
KINDS = ("도착→출발", "출발→다음 도착", "도착→다음 도착")


def no_worse(candidate: dict, current: dict) -> bool:
    if candidate["all"] is None or current["all"] is None or candidate["all"] > current["all"]:
        return False
    if current.get("mean") is not None and candidate["mean"] > current["mean"]:
        return False
    return all(candidate.get(k) is None or current.get(k) is None or candidate[k] <= current[k] + SLACK for k in KINDS)


def files(day: datetime) -> list[str]:
    return [str(p) for p in day_files(day.date(), STATE)]


def publish(timing: dict, web: Path) -> None:
    text = json.dumps(timing, ensure_ascii=False, separators=(",", ":"))
    for target in (TIMING, web / "live-timing.json"):
        tmp = target.with_suffix(".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(target)


def main() -> None:
    web = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/var/www/syung")
    today = datetime.now(timezone(timedelta(hours=9)))
    try:   # yesterday's records are complete: gzip them (sample_files.py)
        packed = compress_old(today.date(), STATE)
    except OSError as e:
        packed = [f"failed: {e}"]
    holdout = files(today - timedelta(days=1))
    train = [f for d in range(2, DAYS + 2) for f in files(today - timedelta(days=d))]
    entry = {"at": today.isoformat(timespec="seconds"), "holdout": [Path(f).name for f in holdout], "train_files": len(train),
             "compressed": packed}
    if not holdout or not train:
        entry["result"] = "skipped: not enough samples"
    else:
        current = json.loads((TIMING if TIMING.exists() else REPO_TIMING).read_text(encoding="utf-8"))
        candidate = learn(train)
        entry["current"], entry["candidate"] = evaluate(current, holdout), evaluate(candidate, holdout)
        if no_worse(entry["candidate"], entry["current"]):
            final = learn(train + holdout)
            publish(final, web)
            entry["result"], entry["lines"], entry["n"] = "published", brief(final["lines"]), final.get("n")
        else:
            entry["result"] = "kept current"
    with LOG.open("a", encoding="utf-8") as log:
        log.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(json.dumps({k: v for k, v in entry.items() if k not in ("lines", "n")}, ensure_ascii=False))
    try:   # 버스 구간 빠르기(pipeline/bus_pace.mjs): 지난 버스 기록으로 노선 · 시간대마다 배워 웹 폴더 data/bus/pace/ 에
        node = shutil.which("node") or "/usr/bin/node"
        done = subprocess.run([node, str(Path(__file__).with_name("bus_pace.mjs")), "--web", str(web)],
                              capture_output=True, text=True, timeout=1800)
        print(f"bus pace: {done.stdout.strip() or done.stderr.strip()[-300:]}")
    except Exception as e:  # noqa: BLE001 — the retrain itself is done
        print(f"bus pace failed: {e}")
    try:   # the learning page's numbers (pipeline/build_learning_stats.py)
        from build_learning_stats import main as stats
        stats(web)
    except Exception as e:  # noqa: BLE001 — the retrain itself is done
        print(f"learning stats failed: {e}")


if __name__ == "__main__":
    main()
