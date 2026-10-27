"""회원이 올린 프로필 사진 파일(폴더 하나 — config.avatar_dir). 파일 읽기 · 쓰기 · 지우기는 여기에만 둔다.

- 폴더 0700 · 파일 0600(서버 계정만). 파일 이름은 추측할 수 없는 무작위 32글자 + 확장자(webp · jpg)이고,
  바깥에서 받은 이름은 NAME 모양이 아니면 열지 않는다(../ 같은 경로 조작은 여기서 막힌다).
- 쓰기는 임시 파일(O_EXCL · 0600)에 다 쓴 뒤 이름을 바꿔 반쯤 쓴 사진이 남지 않게 한다.
- 내용 검사(형식 · 크기 · 가로세로)는 services/profile.py 가 먼저 한다 — 여기는 받은 바이트를 그대로 둔다.
"""
from __future__ import annotations

import os
import re
import secrets
from pathlib import Path

NAME = re.compile(r"[A-Za-z0-9_-]{32}\.(?:webp|jpg)")
EXTENSIONS = ("webp", "jpg")


class AvatarFiles:
    def __init__(self, folder: Path):
        self.folder = Path(folder)

    def _path(self, name: str) -> Path | None:
        return self.folder / name if isinstance(name, str) and NAME.fullmatch(name) else None

    def save(self, data: bytes, extension: str) -> str:
        """새 사진을 쓰고 파일 이름을 돌려준다. 폴더가 없으면 0700 으로 만든다."""
        if extension not in EXTENSIONS:
            raise ValueError("사진 확장자가 틀려요")
        self.folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.folder, 0o700)   # 이미 있던 폴더도
        name = f"{secrets.token_urlsafe(24)}.{extension}"   # 24바이트 → 32글자([A-Za-z0-9_-])
        target = self.folder / name
        temp = self.folder / f".{name}.tmp"
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "wb") as out:
                out.write(data)
                out.flush()
                os.fsync(out.fileno())
            os.replace(temp, target)
        finally:
            temp.unlink(missing_ok=True)
        return name

    def read(self, name: str) -> bytes | None:
        path = self._path(name)
        if path is None:
            return None
        try:
            return path.read_bytes()
        except FileNotFoundError:
            return None

    def remove(self, name: str | None) -> bool:
        """그 사진 파일을 지운다 → 지웠나. 이름이 틀리거나 없으면 False."""
        path = self._path(name) if name else None
        if path is None:
            return False
        try:
            path.unlink()
            return True
        except FileNotFoundError:
            return False

    def names(self) -> list[str]:
        """폴더 안 사진 이름(NAME 모양만). 폴더가 없으면 빈 목록."""
        try:
            return sorted(entry.name for entry in self.folder.iterdir() if NAME.fullmatch(entry.name) and entry.is_file())
        except FileNotFoundError:
            return []

    def age(self, name: str, now: float) -> float | None:
        """파일을 쓴 뒤 지난 초(없으면 None) — 정리할 때 막 올린 사진을 건드리지 않게."""
        path = self._path(name)
        try:
            return None if path is None else now - path.stat().st_mtime
        except FileNotFoundError:
            return None
