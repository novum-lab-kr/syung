"""회원 DB(SQLite 파일 하나): 회원 · 로그인 제공자 연결 · 세션 · 승차권. SQL 은 여기에만 둔다.

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
    # 2(2026-10-27): 출퇴근 한 줄(commute) → 승차권 여러 장(tickets). 한 장 = 출발지 → 도착지 · 출발 시각 · 타는 날.
    # 옛 줄은 장소와 시각이 다 있을 때만 '출근'(집 → 회사) · '퇴근'(회사 → 집) 승차권으로 옮기고 commute 표는 지운다.
    (2, """
        CREATE TABLE tickets (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            from_name TEXT NOT NULL, from_lat REAL NOT NULL, from_lng REAL NOT NULL,
            to_name TEXT NOT NULL, to_lat REAL NOT NULL, to_lng REAL NOT NULL,
            depart_at TEXT NOT NULL,
            days TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX tickets_user ON tickets(user_id);
        INSERT INTO tickets (user_id, name, from_name, from_lat, from_lng, to_name, to_lat, to_lng, depart_at, days, created_at, updated_at)
            SELECT user_id, '출근', home_name, home_lat, home_lng, work_name, work_lat, work_lng, leave_at, days, updated_at, updated_at
            FROM commute WHERE home_name IS NOT NULL AND work_name IS NOT NULL AND leave_at IS NOT NULL;
        INSERT INTO tickets (user_id, name, from_name, from_lat, from_lng, to_name, to_lat, to_lng, depart_at, days, created_at, updated_at)
            SELECT user_id, '퇴근', work_name, work_lat, work_lng, home_name, home_lat, home_lng, back_at, days, updated_at, updated_at
            FROM commute WHERE home_name IS NOT NULL AND work_name IS NOT NULL AND back_at IS NOT NULL;
        DROP TABLE commute
    """),
    # 3(2026-10-27): 발권할 때 고른 경로(길찾기 결과 한 개를 줄인 JSON). 옛 승차권은 NULL — 뒷면은 그때 길을 찾는다.
    (3, """
        ALTER TABLE tickets ADD COLUMN route TEXT
    """),
    # 4(2026-10-27): 관리자 열람 · 조치 기록(장소 보기 · 강제 로그아웃 · 탈퇴 처리). 회원을 지워도 기록은 남게 user_id 는 외래 키가 아니다.
    # 관리자 IP · 검색어 · 토큰은 남기지 않는다(무엇을 · 언제 · 누구에게 · 왜만).
    (4, """
        CREATE TABLE admin_log (
            id INTEGER PRIMARY KEY,
            at INTEGER NOT NULL,
            action TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            reason TEXT NOT NULL
        );
        CREATE INDEX admin_log_user ON admin_log(user_id, at)
    """),
]
KST_SECONDS = 9 * 3600   # 날짜별 가입 수는 한국 날짜로 센다

TICKET_COLUMNS = ("name", "from_name", "from_lat", "from_lng", "to_name", "to_lat", "to_lng", "depart_at", "days", "route")


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
    def find_or_create_user(self, provider: str, subject: str, display_name: str, now: int) -> tuple[int, bool]:
        """제공자 회원번호로 찾고, 없으면 회원 + 연결을 만든다 → (회원 번호, 새로 만들었나). 이름은 처음 만들 때만 쓴다."""
        def work(conn):
            row = conn.execute("SELECT user_id FROM identities WHERE provider=? AND subject=?", (provider, subject)).fetchone()
            if row:
                return row["user_id"], False
            user_id = conn.execute("INSERT INTO users (display_name, created_at) VALUES (?, ?)", (display_name, now)).lastrowid
            conn.execute("INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)",
                         (provider, subject, user_id, now))
            return user_id, True
        return self._write(work)

    def user(self, user_id: int) -> dict | None:
        row = self._read("SELECT u.id, u.display_name, (SELECT provider FROM identities WHERE user_id=u.id "
                         "ORDER BY created_at LIMIT 1) AS provider FROM users u WHERE u.id=?", (user_id,))
        return dict(row) if row else None

    def delete_user(self, user_id: int) -> None:
        """회원과 그 사람의 연결 · 세션 · 승차권을 모두 지운다(ON DELETE CASCADE)."""
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

    # ---- 승차권(출발지 → 도착지 · 출발 시각 · 타는 날 · 고른 경로) ----
    def tickets(self, user_id: int) -> list[dict]:
        self.open()
        conn = self._connect()
        try:
            rows = conn.execute(f"SELECT id, {', '.join(TICKET_COLUMNS)} FROM tickets WHERE user_id=? ORDER BY created_at, id",
                                (user_id,)).fetchall()
        finally:
            conn.close()
        return [dict(row) for row in rows]

    def ticket(self, user_id: int, ticket_id: int) -> dict | None:
        row = self._read(f"SELECT id, {', '.join(TICKET_COLUMNS)} FROM tickets WHERE id=? AND user_id=?", (ticket_id, user_id))
        return dict(row) if row else None

    def add_ticket(self, user_id: int, values: dict, now: int, limit: int) -> int | None:
        """새 승차권 번호. 이미 limit 장이면 None(만들지 않는다)."""
        def work(conn):
            count = conn.execute("SELECT count(*) FROM tickets WHERE user_id=?", (user_id,)).fetchone()[0]
            if count >= limit:
                return None
            names = ", ".join(TICKET_COLUMNS)
            marks = ", ".join("?" for _ in TICKET_COLUMNS)
            return conn.execute(f"INSERT INTO tickets (user_id, {names}, created_at, updated_at) VALUES (?, {marks}, ?, ?)",
                                (user_id, *(values[name] for name in TICKET_COLUMNS), now, now)).lastrowid
        return self._write(work)

    def update_ticket(self, user_id: int, ticket_id: int, values: dict, now: int) -> bool:
        """그 사람의 승차권이 없으면 False."""
        sets = ", ".join(f"{name}=?" for name in TICKET_COLUMNS)
        return self._write(lambda conn: conn.execute(
            f"UPDATE tickets SET {sets}, updated_at=? WHERE id=? AND user_id=?",
            (*(values[name] for name in TICKET_COLUMNS), now, ticket_id, user_id)).rowcount > 0)

    def delete_ticket(self, user_id: int, ticket_id: int) -> bool:
        return self._write(lambda conn: conn.execute("DELETE FROM tickets WHERE id=? AND user_id=?",
                                                     (ticket_id, user_id)).rowcount > 0)

    # ---- 관리(주인만 — routes/admin.py) ----
    def _all(self, sql: str, args: tuple) -> list[dict]:
        self.open()
        conn = self._connect()
        try:
            return [dict(row) for row in conn.execute(sql, args).fetchall()]
        finally:
            conn.close()

    def admin_stats(self, since: tuple[int, int, int], first_day: int) -> dict:
        """since: (오늘 · 7일 · 30일 시작 시각), first_day: 날짜별 수를 셀 첫 시각 → 수만(이름 · 장소 없음)."""
        counts = self._read("SELECT count(*) AS total, sum(created_at>=?) AS today, sum(created_at>=?) AS week, "
                            "sum(created_at>=?) AS month FROM users", since)
        providers = self._all("SELECT i.provider, count(*) AS count FROM users u JOIN identities i ON i.rowid="
                              "(SELECT rowid FROM identities WHERE user_id=u.id ORDER BY created_at LIMIT 1) "
                              "GROUP BY i.provider ORDER BY count DESC, i.provider", ())
        daily = self._all("SELECT date(created_at+?, 'unixepoch') AS day, count(*) AS count FROM users "
                          "WHERE created_at>=? GROUP BY day ORDER BY day", (KST_SECONDS, first_day))
        return {"total": counts["total"], "today": counts["today"] or 0, "week": counts["week"] or 0,
                "month": counts["month"] or 0, "providers": providers, "daily": daily}

    _MEMBER_ROW = ("SELECT u.id, u.display_name, u.created_at, "
                   "(SELECT provider FROM identities WHERE user_id=u.id ORDER BY created_at LIMIT 1) AS provider, "
                   "(SELECT count(*) FROM tickets WHERE user_id=u.id) AS tickets, "
                   "(SELECT max(created_at) FROM sessions WHERE user_id=u.id) AS last_login, "
                   "(SELECT count(*) FROM sessions WHERE user_id=u.id AND expires_at>?) AS sessions FROM users u")

    def admin_members(self, word: str, number: int | None, now: int, offset: int, limit: int) -> tuple[int, list[dict]]:
        """닉네임에 word 가 든 회원 또는 회원번호 number(둘 다 없으면 모두), 새로 가입한 차례 → (모두 몇 명, 그 쪽 줄들)."""
        where, args = "", ()
        if word:
            pattern = "%" + word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            where, args = " WHERE u.display_name LIKE ? ESCAPE '\\'", (pattern,)
            if number is not None:
                where, args = where + " OR u.id=?", args + (number,)
        total = self._read("SELECT count(*) AS n FROM users u" + where, args)["n"]
        rows = self._all(self._MEMBER_ROW + where + " ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?",
                         (now, *args, limit, offset))
        return total, rows

    def admin_member(self, user_id: int, now: int) -> dict | None:
        """회원 한 명: 목록 칸 + 연결된 로그인 방법 + 승차권(장소 · 경로 빼고) + 관리 기록. 없으면 None."""
        row = self._read(self._MEMBER_ROW + " WHERE u.id=?", (now, user_id))
        if row is None:
            return None
        member = dict(row)
        member["identities"] = self._all("SELECT provider, created_at FROM identities WHERE user_id=? ORDER BY created_at",
                                          (user_id,))
        member["ticket_rows"] = self._all("SELECT id, name, depart_at, days, route IS NOT NULL AS has_route, created_at, "
                                          "updated_at FROM tickets WHERE user_id=? ORDER BY created_at, id", (user_id,))
        member["log"] = self._all("SELECT at, action, reason FROM admin_log WHERE user_id=? ORDER BY at DESC, id DESC LIMIT 50",
                                  (user_id,))
        return member

    def admin_places(self, user_id: int, at: int, reason: str) -> list[dict] | None:
        """승차권 장소(이름 · 좌표)를 꺼내며 같은 트랜잭션에 열람 기록을 남긴다. 회원이 없으면 None(기록 안 남김)."""
        def work(conn):
            if conn.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone() is None:
                return None
            rows = conn.execute("SELECT id, name, from_name, from_lat, from_lng, to_name, to_lat, to_lng FROM tickets "
                                "WHERE user_id=? ORDER BY created_at, id", (user_id,)).fetchall()
            conn.execute("INSERT INTO admin_log (at, action, user_id, reason) VALUES (?, 'places', ?, ?)", (at, user_id, reason))
            return [dict(row) for row in rows]
        return self._write(work)

    def admin_logout(self, user_id: int, at: int, reason: str) -> int | None:
        """그 회원의 세션을 모두 지우고 기록 → 지운 세션 수. 회원이 없으면 None(기록 안 남김)."""
        def work(conn):
            if conn.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone() is None:
                return None
            removed = conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,)).rowcount
            conn.execute("INSERT INTO admin_log (at, action, user_id, reason) VALUES (?, 'logout', ?, ?)", (at, user_id, reason))
            return removed
        return self._write(work)

    def admin_delete(self, user_id: int, at: int, reason: str) -> dict | None:
        """탈퇴 처리: 회원 탈퇴(delete_user)와 같은 DELETE(연결 · 세션 · 승차권은 ON DELETE CASCADE) + 기록 → 지운 수. 없으면 None."""
        def work(conn):
            if conn.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone() is None:
                return None
            counts = {name: conn.execute(f"SELECT count(*) FROM {name} WHERE user_id=?", (user_id,)).fetchone()[0]
                      for name in ("identities", "sessions", "tickets")}
            conn.execute("DELETE FROM users WHERE id=?", (user_id,))
            conn.execute("INSERT INTO admin_log (at, action, user_id, reason) VALUES (?, 'delete', ?, ?)", (at, user_id, reason))
            return counts
        return self._write(work)
