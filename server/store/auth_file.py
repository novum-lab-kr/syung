"""주인 로그인 파일(AUTH_FILE, root 만 읽기): {"user", "salt", "hash", "iterations", "secret"}."""
from __future__ import annotations

import json
import os
from pathlib import Path


class AuthFile:
    def __init__(self, path: Path):
        self.path = path

    def read(self) -> dict | None:
        """없거나 깨졌으면 None(로그인할 수 없음)."""
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def write(self, cfg: dict) -> None:
        """0600 으로 쓰고 바꿔 끼운다."""
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(cfg), encoding="utf-8")
        os.chmod(tmp, 0o600)
        tmp.replace(self.path)
