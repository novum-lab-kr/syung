"""회원 DB 하루 백업(subway-member-backup.timer 가 매일 03:30 KST 에 한 번 부른다 · 2026-10-27 사용자 결정 A).

python3 -m server.jobs.member_backup [--dest 폴더] [--keep-days 14]

- 원본은 config 의 SYUNG_MEMBER_DB(기본 /var/lib/subway-live/members.sqlite3). 아직 없으면(회원 기능을 안 켠 서버) 조용히 끝낸다.
- 복사는 sqlite3 표준 라이브러리 backup() 으로 한다 — 서버가 쓰는 중이어도(WAL) 한 시점의 온전한 사본이 나온다. 서버에
  sqlite3 명령이 없어도 된다.
- 사본은 <폴더>/members-YYYYMMDD.sqlite3.gz(한국 날짜). 폴더 0700 · 파일 0600(회원 정보라 root 만). 같은 날 다시 돌면 덮어쓴다.
- 프로필 사진(2026-10-27 결정 D3): 회원 DB 옆 avatars/ 폴더의 사진을 <폴더>/avatars-YYYYMMDD.tar.gz(0600)로 같이 담는다.
  담기 전에 어느 회원도 쓰지 않는 사진(지우다 멈춘 것)을 지운다 — 탈퇴한 사람 사진은 백업에도 새로 들어가지 않는다.
  올린 사진이 하나도 없으면 사진 사본은 만들지 않는다. 되살릴 땐 tar 를 회원 DB 옆에 풀면 avatars/ 가 된다.
- 이름의 날짜가 keep_days 일보다 오래된 사본(회원 DB · 사진 둘 다)은 지운다. 이 모양이 아닌 파일은 건드리지 않는다.
- 서버 밖 복사는 아직 없다(결정 A 범위 밖).
"""
from __future__ import annotations

import argparse
import gzip
import os
import re
import shutil
import sqlite3
import tarfile
from datetime import date, datetime, timedelta
from pathlib import Path

from server.clock import KST
from server.config import MemberConfig
from server.services.members import MemberService

DEFAULT_DEST = Path("/var/backups/syung")
KEEP_DAYS = 14
BACKUP_NAME = re.compile(r"(?:members-(\d{8})\.sqlite3|avatars-(\d{8})\.tar)\.gz")


def backup(db_file: Path, dest: Path, today: date, keep_days: int = KEEP_DAYS) -> Path | None:
    """오늘 사본을 만들고 오래된 사본을 지운다. 원본이 없으면 아무것도 안 하고 None."""
    if not db_file.is_file():
        return None
    dest.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(dest, 0o700)   # 이미 있던 폴더도
    target = dest / f"members-{today:%Y%m%d}.sqlite3.gz"
    raw = dest / f".{target.name}.sqlite3.tmp"
    packed = dest / f".{target.name}.tmp"
    try:
        _copy(db_file, raw)
        fd = os.open(packed, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with raw.open("rb") as source, os.fdopen(fd, "wb") as out, gzip.GzipFile(fileobj=out, mode="wb", mtime=0) as zipped:
            shutil.copyfileobj(source, zipped)
        os.chmod(packed, 0o600)
        os.replace(packed, target)   # 다 쓴 뒤에 이름을 바꿔 반쯤 쓴 사본이 남지 않게
    finally:
        raw.unlink(missing_ok=True)
        packed.unlink(missing_ok=True)
    prune(dest, today, keep_days)
    return target


def _copy(db_file: Path, raw: Path) -> None:
    raw.unlink(missing_ok=True)
    fd = os.open(raw, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)   # sqlite 가 열기 전에 권한부터 0600
    os.close(fd)
    source = sqlite3.connect(db_file, timeout=30)   # 읽기만 한다(WAL 이면 서버의 쓰기를 막지 않는다)
    copy = sqlite3.connect(raw)
    try:
        source.backup(copy)
    finally:
        copy.close()
        source.close()


def backup_photos(folder: Path, names: list[str], dest: Path, today: date) -> Path | None:
    """사진 폴더의 names 를 avatars-YYYYMMDD.tar.gz(0600) 하나로. 사진이 없으면 아무것도 안 하고 None."""
    if not names:
        return None
    dest.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(dest, 0o700)
    target = dest / f"avatars-{today:%Y%m%d}.tar.gz"
    packed = dest / f".{target.name}.tmp"

    def plain(info: tarfile.TarInfo) -> tarfile.TarInfo:
        info.uid = info.gid = 0
        info.uname = info.gname = ""
        info.mode = 0o600
        return info
    try:
        fd = os.open(packed, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as out, tarfile.open(fileobj=out, mode="w:gz") as tar:
            for name in names:
                path = folder / name
                if path.is_file():   # 그사이 지워진 사진은 건너뛴다
                    tar.add(path, arcname=f"avatars/{name}", recursive=False, filter=plain)
        os.chmod(packed, 0o600)
        os.replace(packed, target)
    finally:
        packed.unlink(missing_ok=True)
    return target


def prune(dest: Path, today: date, keep_days: int = KEEP_DAYS) -> list[Path]:
    """이름의 날짜가 today - keep_days 보다 앞선 사본을 지우고 지운 목록을 돌려준다."""
    oldest = today - timedelta(days=keep_days)
    removed = []
    for path in sorted(dest.iterdir()):
        matched = BACKUP_NAME.fullmatch(path.name)
        if not matched or not path.is_file():
            continue
        try:
            stamp = datetime.strptime(matched.group(1) or matched.group(2), "%Y%m%d").date()
        except ValueError:
            continue
        if stamp < oldest:
            path.unlink()
            removed.append(path)
    return removed


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="회원 DB 하루 백업")
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    parser.add_argument("--keep-days", type=int, default=KEEP_DAYS)
    args = parser.parse_args(argv)
    os.umask(0o077)
    config = MemberConfig.from_env()
    today = datetime.now(KST).date()
    made = backup(config.db_file, args.dest, today, max(1, args.keep_days))
    if made is None:   # 원본이 없으면 아무것도 안 찍고 끝낸다
        return
    print(f"백업 {made} ({made.stat().st_size} B)")
    members = MemberService(config, providers={})   # 로그인 제공자는 안 쓴다(사진 정리 · 목록만)
    swept = members.sweep_photos()
    photos = backup_photos(config.avatar_dir, members.avatars.names(), args.dest, today)
    if photos is not None:
        print(f"사진 백업 {photos} ({photos.stat().st_size} B · 주인 없는 사진 {len(swept)}장 정리)")


if __name__ == "__main__":
    main()
