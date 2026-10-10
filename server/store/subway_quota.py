"""지하철 API 하루 호출 수 파일({"day","used","position"}). 다시 켜도 오늘 쓴 만큼 이어 센다."""
from __future__ import annotations

import json
from pathlib import Path


class SubwayQuotaFile:
    def __init__(self, path: Path):
        self.path = path

    def read(self):
        """저장된 값(모양 검사는 부르는 쪽). 없거나 깨졌으면 OSError · ValueError."""
        return json.loads(self.path.read_text(encoding="utf-8"))

    def write(self, day: str, used: int, position: int) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"day": day, "used": used, "position": position}), encoding="utf-8")
        temporary.replace(self.path)
