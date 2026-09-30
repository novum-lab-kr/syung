#!/usr/bin/env python3
"""Nightly: relearn live-timing.json from the last week of samples, and publish it only if it
predicts yesterday at least as well as the one in use.

- candidate: learned from the 7 days before yesterday (samples + position bursts)
- both it and the current file are scored on yesterday (build_live_timing.evaluate: median error
  in seconds of the next event, event-stamped records)
- candidate no worse (≤ current + 0.5 s): relearn with yesterday included, write it to
  /var/lib/subway-live/live-timing.json and the web folder; otherwise keep the current one
- every run appends one JSON line to /var/lib/subway-live/retrain.log
deploy/deploy.sh publishes /var/lib/subway-live/live-timing.json when it exists, so a deploy does
not roll a retrained file back to the repository's copy.
Usage: retrain_live_timing.py [web folder, default /var/www/syung]
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_live_timing import OUT as REPO_TIMING, evaluate, learn  # noqa: E402

STATE = Path("/var/lib/subway-live")
TIMING = STATE / "live-timing.json"
LOG = STATE / "retrain.log"
DAYS, SLACK = 7, 0.5


def files(day: datetime) -> list[str]:
    name = f"{day:%Y%m%d}.jsonl"
    return [str(p) for p in (STATE / "samples" / name, STATE / "position" / name) if p.exists()]


def publish(timing: dict, web: Path) -> None:
    text = json.dumps(timing, ensure_ascii=False, separators=(",", ":"))
    for target in (TIMING, web / "live-timing.json"):
        tmp = target.with_suffix(".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(target)


def main() -> None:
    web = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/var/www/syung")
    today = datetime.now(timezone(timedelta(hours=9)))
    holdout = files(today - timedelta(days=1))
    train = [f for d in range(2, DAYS + 2) for f in files(today - timedelta(days=d))]
    entry = {"at": today.isoformat(timespec="seconds"), "holdout": [Path(f).name for f in holdout], "train_files": len(train)}
    if not holdout or not train:
        entry["result"] = "skipped: not enough samples"
    else:
        current = json.loads((TIMING if TIMING.exists() else REPO_TIMING).read_text(encoding="utf-8"))
        candidate = learn(train)
        entry["current"], entry["candidate"] = evaluate(current, holdout), evaluate(candidate, holdout)
        if entry["candidate"]["all"] is not None and entry["current"]["all"] is not None \
                and entry["candidate"]["all"] <= entry["current"]["all"] + SLACK:
            final = learn(train + holdout)
            publish(final, web)
            entry["result"], entry["lines"], entry["n"] = "published", final["lines"], final.get("n")
        else:
            entry["result"] = "kept current"
    with LOG.open("a", encoding="utf-8") as log:
        log.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(json.dumps({k: v for k, v in entry.items() if k not in ("lines", "n")}, ensure_ascii=False))
    try:   # the learning page's numbers (pipeline/build_learning_stats.py)
        from build_learning_stats import main as stats
        stats(web)
    except Exception as e:  # noqa: BLE001 — the retrain itself is done
        print(f"learning stats failed: {e}")


if __name__ == "__main__":
    main()
