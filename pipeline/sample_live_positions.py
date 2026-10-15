#!/usr/bin/env python3
"""Record live train events for calibrating the map's run/dwell timing.

Polls the local subway_live_proxy (which caches the upstream all-lines call for 90 s, so polling
more often costs no extra quota; watch=0 keeps it from counting as a map viewer — it used to make the proxy read
1·2·3호선's position feed all day, 2026-10-16) and appends every *new* train event — (line, trainNo, station,
status, receivedAt) — to a JSONL file. Analyse with analyse_live_samples.py.

Usage: sample_live_positions.py [minutes=60] [out=data/live-samples/<timestamp>.jsonl]
       sample_live_positions.py 0 <dir>      run forever, one file per KST day in <dir> (systemd service)
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROXY = "http://127.0.0.1:3113/live?watch=0&lines="   # watch=0: 보는 사람으로 세지 않는다(위치 피드를 부르지 않고 읽어 둔 것만 받는다, 2026-10-16)
LINES = ["1호선", "2호선", "3호선", "4호선", "5호선", "6호선", "7호선", "8호선", "9호선", "GTX-A", "경의중앙선",
         "공항철도", "경춘선", "수인분당선", "신분당선", "경강선", "우이신설선", "서해선", "신림선"]


def main() -> None:
    minutes = float(sys.argv[1]) if len(sys.argv) > 1 else 60
    forever = minutes <= 0
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "data" / "live-samples" / f"{datetime.now():%Y%m%d-%H%M}.jsonl"
    day_file = lambda: target / f"{datetime.now(timezone(timedelta(hours=9))):%Y%m%d}.jsonl"
    out = day_file() if forever else target
    out.parent.mkdir(parents=True, exist_ok=True)
    url = PROXY + urllib.parse.quote(",".join(LINES))
    seen: set[tuple] = set()
    end, polls, events = (float("inf") if forever else time.time() + minutes * 60), 0, 0
    sink = out.open("a", encoding="utf-8")
    try:
        while time.time() < end:
            if forever and day_file() != out:        # new KST day → new file, forget yesterday's keys
                sink.close()
                out, seen = day_file(), set()
                sink = out.open("a", encoding="utf-8")
            try:
                data = json.load(urllib.request.urlopen(url, timeout=30))
                polls += 1
                for t in data.get("trains", []):
                    key = (t["line"], t["trainNo"], t["station"], t["status"], t["receivedAt"])
                    if key in seen:
                        continue
                    seen.add(key)
                    sink.write(json.dumps({**{k: t.get(k) for k in ("line", "trainNo", "station", "status", "direction", "destination", "receivedAt", "stampedAt")},
                                           "fetchedAt": data.get("fetchedAt")}, ensure_ascii=False) + "\n")
                    events += 1
                sink.flush()
            except Exception as exc:  # keep sampling through transient proxy/API errors
                print(f"{datetime.now():%H:%M:%S} poll failed: {exc}", flush=True)
            time.sleep(30)
    finally:
        sink.close()
    print(json.dumps({"out": str(out), "polls": polls, "events": events}, ensure_ascii=False))


if __name__ == "__main__":
    main()
