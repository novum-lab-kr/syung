"""회원 DB 하루 백업(server/jobs/member_backup.py): 임시 폴더의 SQLite 로 사본 · 권한 · 지우기를 본다."""

import gzip
import os
import sqlite3
import stat
import tempfile
import unittest
from datetime import date
from pathlib import Path

from server.jobs.member_backup import backup, prune

ROOT = Path(__file__).resolve().parent.parent
TODAY = date(2026, 10, 27)


class MemberBackupTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.db = self.base / "members.sqlite3"
        self.dest = self.base / "backups" / "syung"

    def tearDown(self):
        self.temp.cleanup()

    def make_db(self, wal=True):
        conn = sqlite3.connect(self.db, isolation_level=None)
        if wal:
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT)")
        conn.execute("INSERT INTO members (name) VALUES ('슝')")
        return conn

    def restored_names(self, path):
        raw = self.base / "restored.sqlite3"
        raw.write_bytes(gzip.decompress(path.read_bytes()))
        conn = sqlite3.connect(raw)
        try:
            self.assertEqual(conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            return [row[0] for row in conn.execute("SELECT name FROM members")]
        finally:
            conn.close()

    def test_no_db_is_quiet(self):
        self.assertIsNone(backup(self.db, self.dest, TODAY))
        self.assertFalse(self.dest.exists())

    def test_copy_while_open_in_wal(self):
        conn = self.make_db()   # 서버처럼 연결을 쥔 채로(WAL 에 아직 안 옮긴 쓰기 포함)
        try:
            made = backup(self.db, self.dest, TODAY)
        finally:
            conn.close()
        self.assertEqual(made, self.dest / "members-20261027.sqlite3.gz")
        self.assertEqual(self.restored_names(made), ["슝"])
        self.assertEqual(sorted(path.name for path in self.dest.iterdir()), ["members-20261027.sqlite3.gz"])   # 임시 파일 안 남김

    def test_permissions(self):
        self.make_db().close()
        self.dest.mkdir(parents=True)
        os.chmod(self.dest, 0o755)   # 이미 있던 폴더가 넓게 열려 있어도
        made = backup(self.db, self.dest, TODAY)
        self.assertEqual(stat.S_IMODE(self.dest.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(made.stat().st_mode), 0o600)

    def test_same_day_overwrites(self):
        conn = self.make_db()
        backup(self.db, self.dest, TODAY)
        conn.execute("INSERT INTO members (name) VALUES ('둘째')")
        conn.close()
        made = backup(self.db, self.dest, TODAY)
        self.assertEqual(self.restored_names(made), ["슝", "둘째"])

    def test_prune_keeps_14_days_and_other_files(self):
        self.dest.mkdir(parents=True)
        for name in ("members-20261012.sqlite3.gz", "members-20261013.sqlite3.gz", "members-20261026.sqlite3.gz",
                     "members-20261399.sqlite3.gz", "notes.txt", "members-20261001.sqlite3"):
            (self.dest / name).write_bytes(b"x")
        removed = prune(self.dest, TODAY)
        self.assertEqual([path.name for path in removed], ["members-20261012.sqlite3.gz"])
        self.assertTrue((self.dest / "members-20261013.sqlite3.gz").exists())   # 딱 14일 전은 남긴다
        self.assertTrue((self.dest / "notes.txt").exists())
        self.assertTrue((self.dest / "members-20261001.sqlite3").exists())

    def test_backup_prunes(self):
        self.make_db().close()
        self.dest.mkdir(parents=True)
        (self.dest / "members-20261001.sqlite3.gz").write_bytes(b"x")
        backup(self.db, self.dest, TODAY)
        self.assertEqual(sorted(path.name for path in self.dest.iterdir()), ["members-20261027.sqlite3.gz"])

    def test_units(self):
        service = (ROOT / "server/subway-member-backup.service").read_text()
        timer = (ROOT / "server/subway-member-backup.timer").read_text()
        self.assertIn("ExecStart=/usr/bin/python3 -m server.jobs.member_backup", service)
        self.assertIn("WorkingDirectory=/root/syung", service)
        self.assertIn("EnvironmentFile=-/etc/subway-live.env", service)   # SYUNG_MEMBER_DB 를 바꿨으면 그 경로
        self.assertIn("OnCalendar=*-*-* 03:30:00 Asia/Seoul", timer)
        self.assertIn("Persistent=true", timer)


if __name__ == "__main__":
    unittest.main()
