"""디버깅 페이지 기록 파일: 탑승 기록(rides/YYYYMMDD.jsonl, 한 줄 한 사건)과 캡처(shots/ 파일 + shots.jsonl 목록).
오래된 것은 remove_before 로 날 단위로 지운다(기한은 services/debug.py KEEP_DAYS).

모양 검사는 services/debug.py 가 하고, 여기는 쓰고 읽기만 한다.
"""
from __future__ import annotations

import json
import secrets
import threading
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from server.clock import KST

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable


def _shot_file(line: str) -> str:
    """캡처 목록 한 줄의 파일 이름(읽을 수 없는 줄은 빈 글자 — 지우지 않고 남긴다)."""
    try:
        row: object = json.loads(line)
    except ValueError:
        return ""
    name = cast("dict[str, Any]", row).get("file") if isinstance(row, dict) else None
    return name if isinstance(name, str) else ""


class DebugStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.lock = threading.Lock()

    def append_rides(self, events: list[dict[str, Any]], now: float) -> None:
        day = datetime.fromtimestamp(now, KST).strftime("%Y%m%d")
        folder = self.root / "rides"
        with self.lock:
            folder.mkdir(parents=True, exist_ok=True)
            with open(folder / f"{day}.jsonl", "a", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")

    def save_shot(self, data: bytes, ext: str, meta: dict[str, Any], now: float) -> str:
        """파일 이름(YYYYMMDD-HHMMSS-무작위.ext)을 돌려준다."""
        name = datetime.fromtimestamp(now, KST).strftime("%Y%m%d-%H%M%S") + f"-{secrets.token_hex(3)}.{ext}"
        folder = self.root / "shots"
        with self.lock:
            folder.mkdir(parents=True, exist_ok=True)
            (folder / name).write_bytes(data)
            with open(self.root / "shots.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps({**meta, "file": name}, ensure_ascii=False, separators=(",", ":")) + "\n")
        return name

    def recent_shots(self, limit: int) -> list[dict[str, Any]]:
        path = self.root / "shots.jsonl"
        if not path.exists():
            return []
        rows: list[dict[str, Any]] = []
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

    def remove_before(self, oldest: str) -> dict[str, int]:
        """oldest(YYYYMMDD)보다 앞 날의 탑승 기록 파일 · 캡처 파일을 지우고 캡처 목록(shots.jsonl)에서도 그 줄을 뺀다 → 지운 수.
        날은 파일 이름 앞 8글자로 본다(rides/YYYYMMDD.jsonl · shots/YYYYMMDD-HHMMSS-….ext)."""
        old: Callable[[str], bool] = lambda name: len(name) >= 8 and name[:8].isdigit() and name[:8] < oldest
        removed = {"rides": 0, "shots": 0}
        with self.lock:
            for folder, key in ((self.root / "rides", "rides"), (self.root / "shots", "shots")):
                for path in sorted(folder.glob("*")) if folder.exists() else []:
                    if path.is_file() and old(path.name):
                        path.unlink()
                        removed[key] += 1
            listing = self.root / "shots.jsonl"
            if listing.exists():
                lines = listing.read_text(encoding="utf-8").splitlines()
                kept = [line for line in lines if not old(_shot_file(line))]
                if len(kept) != len(lines):
                    temp = listing.with_name(listing.name + ".tmp")
                    temp.write_text("".join(line + "\n" for line in kept), encoding="utf-8")
                    temp.replace(listing)
        return removed

    def recent_rides(self, day: str) -> list[dict[str, Any]]:
        path = self.root / "rides" / f"{day}.jsonl"
        if not path.exists():
            return []
        rows: list[dict[str, Any]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
        return rows
