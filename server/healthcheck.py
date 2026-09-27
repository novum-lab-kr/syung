#!/usr/bin/env python3
"""Live-proxy health check (run every 5 minutes by subway-healthcheck.timer).

Checks that the proxy answers, that its data is recent, and that today's upstream calls are below
90% of the daily limit. On a dead or stale proxy it restarts subway-live. Writes the result to
/var/lib/subway-live/health.json and, if SUBWAY_ALERT_WEBHOOK is set (Slack-compatible), posts
problems there (only when the state changes, to avoid repeats).
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROXY = "http://127.0.0.1:3113"
STATE = Path("/var/lib/subway-live/health.json")
WEBHOOK = os.environ.get("SUBWAY_ALERT_WEBHOOK", "").strip()
KST = timezone(timedelta(hours=9))


def get(path: str, timeout: int = 25) -> dict:
    return json.load(urllib.request.urlopen(PROXY + path, timeout=timeout))


def main() -> None:
    now = datetime.now(timezone.utc)
    problems, info, restarted = [], {}, False
    try:
        get("/health", 5)
        d = get("/live?lines=" + urllib.parse.quote("2호선"))
        info["quota"] = d.get("quota")
        age = (now - datetime.fromisoformat(d["fetchedAt"])).total_seconds() if d.get("fetchedAt") else None
        info["data_age_s"] = round(age) if age is not None else None
        if not d.get("ok"):
            problems.append(f"프록시 오류: {d.get('error')}")
        elif age is not None and age > 300 and not d.get("quiet"):   # no upstream calls in the quiet hours
            problems.append(f"실시간 데이터가 {round(age / 60)}분째 갱신되지 않음")
        q = d.get("quota") or {}
        if q.get("limit") and q.get("used", 0) >= 0.9 * q["limit"]:
            problems.append(f"오늘 API 호출 {q['used']}/{q['limit']} (90% 이상)")
    except Exception as exc:  # proxy down or hung
        problems.append(f"프록시 응답 없음: {exc}")
    if any(p.startswith(("프록시 응답 없음", "실시간 데이터가")) for p in problems):
        restarted = subprocess.run(["systemctl", "restart", "subway-live"]).returncode == 0
    prev = json.loads(STATE.read_text()) if STATE.exists() else {}
    state = {"checkedAt": now.astimezone(KST).isoformat(timespec="seconds"), "ok": not problems, "problems": problems, "restarted": restarted, **info}
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    if WEBHOOK and (problems != prev.get("problems")):
        text = ("🚇 실시간 지하철 프록시 문제: " + " / ".join(problems) + (" (자동 재시작함)" if restarted else "")) if problems else "🚇 실시간 지하철 프록시 정상 복구"
        try:
            urllib.request.urlopen(urllib.request.Request(WEBHOOK, data=json.dumps({"text": text}).encode(), headers={"Content-Type": "application/json"}), timeout=10)
        except Exception:
            pass
    print(json.dumps(state, ensure_ascii=False))


if __name__ == "__main__":
    main()
