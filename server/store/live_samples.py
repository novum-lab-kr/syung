"""subway-sampler 가 남기는 실시간 기록(/var/lib/subway-live/samples/YYYYMMDD.jsonl[.gz])을 읽는다 — 이상 감지(/api/health)용.

샘플러는 30초마다 우리 서버의 /live(전 노선)를 읽어 바뀐 열차 사건만 한 줄씩 적는다(바깥 API 를 더 부르지 않는다).
- day_counts: 하루 파일 → 운행일(새벽 4시 전은 전날) × 노선 × 10분 칸마다 사건이 있던 열차 수. 요약은 health_dir 에 날마다 남긴다.
- recent_events: 오늘(자정 직후면 어제도) 파일의 끝만 읽어 최근 사건(받은 때 · 노선 · 열차 번호).
"""
from __future__ import annotations

import gzip
import json
from datetime import datetime, timedelta
from pathlib import Path

from server.clock import KST

SLOT_SECONDS = 600
SLOTS = 24 * 3600 // SLOT_SECONDS
SERVICE_DAY_SHIFT = timedelta(hours=4)   # 01:00 의 열차는 전날 운행(막차 ~01:30, 첫차 ~04:30)
TAIL_BYTES = 8 * 1024 * 1024   # 출근 시간 한 시간 기록이 약 3.5 MB


def _stamp(value: object) -> float | None:
    try:
        return datetime.fromisoformat(str(value)).timestamp()
    except ValueError:
        return None


def service_slot(timestamp: float) -> tuple[str, int]:
    """받은 때 → (운행일 YYYY-MM-DD, 하루 안 10분 칸 번호 — 시계 기준 0 = 00:00)."""
    local = datetime.fromtimestamp(timestamp, KST)
    return (local - SERVICE_DAY_SHIFT).date().isoformat(), (local.hour * 3600 + local.minute * 60) // SLOT_SECONDS


class LiveSamples:
    def __init__(self, samples_dir: Path, health_dir: Path):
        self.samples_dir, self.health_dir = samples_dir, health_dir

    def files(self) -> list[str]:
        """기록이 있는 날(YYYYMMDD), 오래된 차례."""
        try:
            names = {p.name.split(".")[0] for p in self.samples_dir.iterdir() if p.name[:8].isdigit() and ".jsonl" in p.name}
        except OSError:
            return []
        return sorted(n for n in names if len(n) == 8)

    def _open(self, day: str):
        plain, packed = self.samples_dir / f"{day}.jsonl", self.samples_dir / f"{day}.jsonl.gz"
        if packed.exists():
            return gzip.open(packed, "rt", encoding="utf-8")
        return plain.open(encoding="utf-8")

    def day_counts(self, day: str) -> dict:
        """하루 파일의 요약 {운행일: {노선: [10분 칸 144개의 열차 수]}} — 끝난 날이면 health_dir 에 남겨 다음에 다시 읽지 않는다."""
        saved = self.health_dir / f"{day}.json"
        try:
            return json.loads(saved.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        seen: dict[str, dict[str, list[set]]] = {}
        try:
            with self._open(day) as rows:
                for row in rows:
                    try:
                        t = json.loads(row)
                    except ValueError:
                        continue
                    at = _stamp(t.get("fetchedAt"))
                    if at is None or not t.get("line") or not t.get("trainNo"):
                        continue
                    service, slot = service_slot(at)
                    seen.setdefault(service, {}).setdefault(t["line"], [set() for _ in range(SLOTS)])[slot].add(t["trainNo"])
        except OSError:
            return {}
        counts = {s: {line: [len(x) for x in slots] for line, slots in lines.items()} for s, lines in seen.items()}
        if day < datetime.now(KST).strftime("%Y%m%d"):   # 오늘 파일은 아직 자라는 중
            try:
                self.health_dir.mkdir(parents=True, exist_ok=True)
                temporary = saved.with_suffix(".tmp")
                temporary.write_text(json.dumps(counts, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
                temporary.replace(saved)
            except OSError:
                pass
        return counts

    def recent_events(self, now: float, seconds: float) -> list[tuple[float, str, str]]:
        """최근 seconds 초의 사건 (받은 때, 노선, 열차 번호) — 파일 끝 TAIL_BYTES 만 읽는다."""
        local = datetime.fromtimestamp(now, KST)
        days = [local.strftime("%Y%m%d")]
        if local.hour * 3600 + local.minute * 60 < seconds + 60:
            days.insert(0, (local - timedelta(days=1)).strftime("%Y%m%d"))
        events = []
        for day in days:
            path = self.samples_dir / f"{day}.jsonl"
            try:
                with path.open("rb") as f:
                    size = f.seek(0, 2)
                    f.seek(max(0, size - TAIL_BYTES))
                    chunk = f.read().decode("utf-8", errors="ignore")
            except OSError:
                continue
            lines = chunk.split("\n")
            if size > TAIL_BYTES:
                lines = lines[1:]   # 잘린 첫 줄
            for row in lines:
                if not row:
                    continue
                try:
                    t = json.loads(row)
                except ValueError:
                    continue
                at = _stamp(t.get("fetchedAt"))
                if at is not None and now - seconds < at <= now + 60 and t.get("line") and t.get("trainNo"):
                    events.append((at, t["line"], t["trainNo"]))
        return events
