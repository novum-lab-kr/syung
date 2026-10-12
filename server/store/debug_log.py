"""디버깅 페이지 기록 파일: 탑승 기록(rides/YYYYMMDD.jsonl, 한 줄 한 사건)과 캡처(shots/ 파일 + shots.jsonl 목록).

모양 검사는 services/debug.py 가 하고, 여기는 쓰고 읽기만 한다.
"""
from __future__ import annotations

import json
import secrets
import threading
from datetime import datetime
from pathlib import Path

from server.clock import KST


class DebugStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.lock = threading.Lock()

    def append_rides(self, events: list[dict], now: float) -> None:
        day = datetime.fromtimestamp(now, KST).strftime("%Y%m%d")
        folder = self.root / "rides"
        with self.lock:
            folder.mkdir(parents=True, exist_ok=True)
            with open(folder / f"{day}.jsonl", "a", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")

    def save_shot(self, data: bytes, ext: str, meta: dict, now: float) -> str:
        """파일 이름(YYYYMMDD-HHMMSS-무작위.ext)을 돌려준다."""
        name = datetime.fromtimestamp(now, KST).strftime("%Y%m%d-%H%M%S") + f"-{secrets.token_hex(3)}.{ext}"
        folder = self.root / "shots"
        with self.lock:
            folder.mkdir(parents=True, exist_ok=True)
            (folder / name).write_bytes(data)
            with open(self.root / "shots.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps({**meta, "file": name}, ensure_ascii=False, separators=(",", ":")) + "\n")
        return name

    def recent_shots(self, limit: int) -> list[dict]:
        path = self.root / "shots.jsonl"
        if not path.exists():
            return []
        rows = []
        for line in path.read_text(encoding="utf-8").splitlines()[-limit:]:
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
        return rows[::-1]

    def ride_days(self) -> list[str]:
        """기록이 있는 날(YYYYMMDD), 최근 날부터."""
        folder = self.root / "rides"
        return sorted((p.stem for p in folder.glob("*.jsonl") if p.stem.isdigit() and len(p.stem) == 8), reverse=True) if folder.exists() else []

    def recent_rides(self, day: str) -> list[dict]:
        path = self.root / "rides" / f"{day}.jsonl"
        if not path.exists():
            return []
        rows = []
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
        return rows
