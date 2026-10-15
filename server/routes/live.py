"""/live: 지도가 보는 노선들의 열차(lines · focused · focus · watch) 또는 한 역의 도착 예정(arrivals). 보여 줄 게 없으면 503."""
from __future__ import annotations


def live(service, query: dict) -> tuple[dict, int]:
    lines = [item.strip() for value in query.get("lines", []) for item in value.split(",") if item.strip()]
    focused = query.get("focused", [""])[0] == "1"
    focus = query.get("focus", [""])[0].strip()
    watch = query.get("watch", [""])[0] != "0"   # watch=0: 학습 기록기 — 보는 사람으로 세지 않는다
    arrivals = query.get("arrivals", [""])[0].strip()
    if arrivals:
        body = service.snapshot_arrivals(arrivals)
    else:
        body = service.snapshot(lines, focused=focused, focus=focus, watch=watch)
    return body, 200 if body.get("ok") else 503
