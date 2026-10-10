"""받은 실시간 자료를 학습용으로 날마다(KST) JSONL 에 덧붙인다. 쓰기 실패는 요청을 막지 않는다."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from server.clock import KST, iso

# 학습용으로 남기는 API 항목(차량 번호판 plainNo 는 남기지 않는다): 구간 순번 · 구간 안 거리 · 정류장 정차 · 측정 시각 등
RECORD_FIELDS = ("vehId", "sectOrd", "sectDist", "fullSectDist", "stopFlag", "dataTm", "sectionId", "lastStnId",
                 "nextStId", "nextStTm", "gpsX", "gpsY", "isrunyn", "islastyn", "busType", "isFullFlag", "congetion",
                 "rtDist", "stopId", "trnstnid")


def record_bus(items: list[dict], route_id: str, now: float, directory: Path | None) -> None:
    """Append one upstream answer to that KST day's file; a failed write never fails the request."""
    if not directory:
        return
    fetched = iso(now)
    rows = "".join(json.dumps({"routeId": route_id, "fetchedAt": fetched,
                               **{k: row[k] for k in RECORD_FIELDS if row.get(k) not in (None, "")}},
                              ensure_ascii=False, separators=(",", ":")) + "\n" for row in items)
    if not rows:
        return
    try:
        directory.mkdir(parents=True, exist_ok=True)
        with (directory / f"{datetime.fromtimestamp(now, KST):%Y%m%d}.jsonl").open("a", encoding="utf-8") as out:
            out.write(rows)
    except OSError:
        pass
