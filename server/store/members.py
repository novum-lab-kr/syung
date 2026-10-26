"""회원 DB(SQLite 파일 하나): 회원 · 로그인 제공자 연결 · 세션 · 출퇴근 설정. SQL 은 여기에만 둔다.

표 설계 · 마이그레이션 차례는 계획서 3-1 과 같다. 새 칸 · 새 표는 MIGRATIONS 끝에 번호를 하나 더해 붙인다
(지난 번호의 SQL 은 고치지 않는다 — 운영 DB 는 그 번호까지 이미 돌았다).
연결은 부를 때마다 새로 연다(ThreadingHTTPServer 의 스레드마다 다르다). 쓰기는 한 잠금으로 줄을 세운다.
"""
from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

MIGRATIONS: list[tuple[int, str]] = [
    (1, """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            display_name TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE identities (
            provider TEXT NOT NULL,
            subject TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (provider, subject)
        );
        CREATE INDEX identities_user ON identities(user_id);
        CREATE TABLE sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE INDEX sessions_user ON sessions(user_id);
        CREATE TABLE commute (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            home_name TEXT, home_lat REAL, home_lng REAL,
            work_name TEXT, work_lat REAL, work_lng REAL,
            leave_at TEXT, back_at TEXT,
            days TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL
        );
    """),
]

COMMUTE_COLUMNS = ("home_name", "home_lat", "home_lng", "work_name", "work_lat", "work_lng", "leave_at", "back_at", "days")


class MemberStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.Lock()
        self._ready = False

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=5, isolation_level=None)   # 트랜잭션은 BEGIN 으로 직접
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def open(self) -> None:
        """파일이 없으면 0600 으로 만들고, 아직 안 돈 마이그레이션을 차례로 돌린다. 폴더가 없으면 OSError."""
        with self._lock:
            if self._ready:
                return
            if not self.path.exists():
                fd = os.open(self.path, os.O_CREAT | os.O_WRONLY, 0o600)   # 처음부터 주인만 읽게(umask 와 상관없이)
                os.close(fd)
            conn = self._connect()
            try:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
                row = conn.execute("SELECT version FROM schema_version").fetchone()
                current = row["version"] if row else 0
                if row is None:
                    conn.execute("INSERT INTO schema_version (version) VALUES (0)")
                for number, sql in MIGRATIONS:
                    if number <= current:
                        continue
                    conn.execute("BEGIN")
                    try:
                        for statement in (part.strip() for part in sql.split(";")):
                            if statement:
                                conn.execute(statement)
                        conn.execute("UPDATE schema_version SET version=?", (number,))
                        conn.execute("COMMIT")
                    except sqlite3.Error:
                        conn.execute("ROLLBACK")
                        raise
            finally:
                conn.close()
            self._ready = True

    def schema_version(self) -> int:
        self.open()
        conn = self._connect()
        try:
            return conn.execute("SELECT version FROM schema_version").fetchone()["version"]
        finally:
            conn.close()

    def _write(self, work):
        """work(conn) 을 한 트랜잭션으로. 쓰기는 한 번에 하나."""
        self.open()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("BEGIN IMMEDIATE")
                try:
                    result = work(conn)
                    conn.execute("COMMIT")
                    return result
                except BaseException:
                    conn.execute("ROLLBACK")
                    raise
            finally:
                conn.close()

    def _read(self, sql: str, args: tuple) -> sqlite3.Row | None:
        self.open()
        conn = self._connect()
        try:
            return conn.execute(sql, args).fetchone()
        finally:
            conn.close()

    # ---- 회원 ----
    def find_or_create_user(self, provider: str, subject: str, display_name: str, now: int) -> int:
        """제공자 회원번호로 찾고, 없으면 회원 + 연결을 만든다. 이름은 처음 만들 때만 쓴다(1차)."""
        def work(conn):
            row = conn.execute("SELECT user_id FROM identities WHERE provider=? AND subject=?", (provider, subject)).fetchone()
            if row:
                return row["user_id"]
            user_id = conn.execute("INSERT INTO users (display_name, created_at) VALUES (?, ?)", (display_name, now)).lastrowid
            conn.execute("INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)",
                         (provider, subject, user_id, now))
            return user_id
        return self._write(work)

    def user(self, user_id: int) -> dict | None:
        row = self._read("SELECT u.id, u.display_name, (SELECT provider FROM identities WHERE user_id=u.id "
                         "ORDER BY created_at LIMIT 1) AS provider FROM users u WHERE u.id=?", (user_id,))
        return dict(row) if row else None

    def delete_user(self, user_id: int) -> None:
        """회원과 그 사람의 연결 · 세션 · 출퇴근 설정을 모두 지운다(ON DELETE CASCADE)."""
        self._write(lambda conn: conn.execute("DELETE FROM users WHERE id=?", (user_id,)))

    # ---- 세션 ----
    def add_session(self, token_hash: str, user_id: int, now: int, expires_at: int) -> None:
        def work(conn):
            conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))   # 끝난 것은 새로 만들 때 같이 치운다
            conn.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                         (token_hash, user_id, now, expires_at))
        self._write(work)

    def session_user(self, token_hash: str, now: int) -> int | None:
        row = self._read("SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?", (token_hash, now))
        return row["user_id"] if row else None

    def delete_session(self, token_hash: str) -> None:
        self._write(lambda conn: conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,)))

    # ---- 출퇴근 ----
    def commute(self, user_id: int) -> dict | None:
        row = self._read(f"SELECT {', '.join(COMMUTE_COLUMNS)} FROM commute WHERE user_id=?", (user_id,))
        return dict(row) if row else None

    def save_commute(self, user_id: int, values: dict, now: int) -> None:
        """values: COMMUTE_COLUMNS 이름 → 값(검사는 services 가 마쳤다)."""
        names = ", ".join(COMMUTE_COLUMNS)
        marks = ", ".join("?" for _ in COMMUTE_COLUMNS)
        updates = ", ".join(f"{name}=excluded.{name}" for name in COMMUTE_COLUMNS)
        args = (user_id, *(values[name] for name in COMMUTE_COLUMNS), now)
        self._write(lambda conn: conn.execute(
            f"INSERT INTO commute (user_id, {names}, updated_at) VALUES (?, {marks}, ?) "
            f"ON CONFLICT(user_id) DO UPDATE SET {updates}, updated_at=excluded.updated_at", args))
