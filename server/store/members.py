"""회원 DB(SQLite 파일 하나): 회원 · 로그인 제공자 연결 · 세션(기기 종류 · 마지막 사용) · 승차권 · 날짜별 사용 횟수. SQL 은 여기에만 둔다.

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
    # 5(2026-10-27): 날짜별 탈퇴 수(한국 날짜 · 사유별 수만). 누가 탈퇴했는지 알 수 있는 값(회원번호 · 닉네임 · 가입일)은 넣지 않는다.
    # reason: self(본인 탈퇴) · kakao_unlink(카카오 연결 해제 웹훅) · admin(관리자 탈퇴 처리).
    (5, """
        CREATE TABLE withdraw_stats (
            day TEXT NOT NULL,
            reason TEXT NOT NULL CHECK (reason IN ('self', 'kakao_unlink', 'admin')),
            count INTEGER NOT NULL,
            PRIMARY KEY (day, reason)
        )
    """),
    # 6(2026-10-27): 프로필 사진 · 캐릭터. NULL = 기본 캐릭터, 'character:<이름>' · 'photo:<파일 이름>'(사진은 config.avatar_dir).
    # 닉네임은 그대로 display_name — 회원이 고치면 그 값이 남고, 다시 로그인해도 제공자 닉네임으로 덮지 않는다(find_or_create_user).
    (6, """
        ALTER TABLE users ADD COLUMN avatar TEXT
    """),
    # 7(2026-10-27): 로그인 기기 관리 · 내 통계(계획서 D2 · D3 · D4).
    # sessions.device: 로그인할 때 브라우저 정보에서 뽑은 기기 종류 'iphone/safari' 처럼(원문 · IP 는 저장하지 않는다, 모르면 '').
    # sessions.used_at: 마지막으로 쓴 시각(services 가 일정 간격 이상일 때만 고쳐 쓴다). 옛 세션은 만든 시각으로 채운다.
    # usage_daily: 회원 · 한국 날짜 · 종류별 사용 횟수만(위치 · 검색어 · 시각 없음). 1년 지난 날짜 줄은 매일 지운다(prune_usage).
    (7, """
        ALTER TABLE sessions ADD COLUMN device TEXT NOT NULL DEFAULT '';
        ALTER TABLE sessions ADD COLUMN used_at INTEGER NOT NULL DEFAULT 0;
        UPDATE sessions SET used_at=created_at;
        CREATE TABLE usage_daily (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            day TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('open', 'route', 'ticket')),
            count INTEGER NOT NULL,
            PRIMARY KEY (user_id, day, kind)
        );
        CREATE INDEX usage_daily_day ON usage_daily(day)
    """),
]
KST_SECONDS = 9 * 3600   # 날짜별 가입 · 탈퇴 수는 한국 날짜로 센다
ADMIN_LOG_AGE = 365 * 86400   # 관리 기록은 1년 보관 후 파기(사용자 2026-10-27 — 개인정보처리방침 8절)
USAGE_DAYS = 365   # 날짜별 사용 횟수는 1년(오늘 포함 365일) 보관(계획서 D4)

TICKET_COLUMNS = ("name", "from_name", "from_lat", "from_lng", "to_name", "to_lat", "to_lng", "depart_at", "days", "route")


def _log(conn: sqlite3.Connection, at: int, action: str, user_id: int, reason: str) -> None:
    """관리 기록 한 줄. 1년 지난 기록은 새로 쓸 때 같이 지운다(세션과 같은 틀)."""
    conn.execute("DELETE FROM admin_log WHERE at<=?", (at - ADMIN_LOG_AGE,))
    conn.execute("INSERT INTO admin_log (at, action, user_id, reason) VALUES (?, ?, ?, ?)", (at, action, user_id, reason))


def _count_withdraw(conn: sqlite3.Connection, at: int, reason: str) -> None:
    """그 한국 날짜 · 사유의 탈퇴 수를 1 올린다. 회원을 지우는 같은 트랜잭션 안에서만 부른다."""
    conn.execute("INSERT INTO withdraw_stats (day, reason, count) VALUES (date(?, 'unixepoch'), ?, 1) "
                 "ON CONFLICT (day, reason) DO UPDATE SET count=count+1", (at + KST_SECONDS, reason))


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
        row = self._read("SELECT u.id, u.display_name, u.avatar, (SELECT provider FROM identities WHERE user_id=u.id "
                         "ORDER BY created_at LIMIT 1) AS provider FROM users u WHERE u.id=?", (user_id,))
        return dict(row) if row else None

    def set_name(self, user_id: int, name: str) -> bool:
        """닉네임을 바꾼다 → 그 회원이 있었나."""
        return self._write(lambda conn: conn.execute("UPDATE users SET display_name=? WHERE id=?", (name, user_id)).rowcount > 0)

    def set_avatar(self, user_id: int, value: str | None) -> tuple[bool, str | None]:
        """프로필 사진 · 캐릭터를 바꾼다 → (그 회원이 있었나, 바꾸기 전 값). 앞 사진 파일은 부르는 쪽이 지운다."""
        def work(conn):
            row = conn.execute("SELECT avatar FROM users WHERE id=?", (user_id,)).fetchone()
            if row is None:
                return False, None
            conn.execute("UPDATE users SET avatar=? WHERE id=?", (value, user_id))
            return True, row["avatar"]
        return self._write(work)

    def avatars_in_use(self) -> set[str]:
        """지금 회원이 쓰는 avatar 값 모두(남은 사진 파일 정리용)."""
        return {row["avatar"] for row in self._all("SELECT avatar FROM users WHERE avatar IS NOT NULL", ())}

    @staticmethod
    def avatars_in_file(path: Path) -> set[str]:
        """다른 DB 파일(백업 사본)의 avatar 값 모두 — 읽기만(immutable: 잠금 · WAL 파일을 만들지 않는다)."""
        conn = sqlite3.connect(f"file:{Path(path).resolve()}?immutable=1", uri=True)
        try:
            return {row[0] for row in conn.execute("SELECT avatar FROM users WHERE avatar IS NOT NULL")}
        finally:
            conn.close()

    def delete_user(self, user_id: int, now: int) -> dict | None:
        """회원과 그 사람의 연결 · 세션 · 승차권 · 사용 횟수를 모두 지우고(ON DELETE CASCADE) 오늘 본인 탈퇴 수를 1 올린다
        → {'avatar': 지운 회원의 avatar 값}(사진 파일은 부르는 쪽이 지운다) · 없던 회원이면 None."""
        def work(conn):
            row = conn.execute("SELECT avatar FROM users WHERE id=?", (user_id,)).fetchone()
            if row is None:
                return None
            conn.execute("DELETE FROM users WHERE id=?", (user_id,))
            _count_withdraw(conn, now, "self")
            return {"avatar": row["avatar"]}
        return self._write(work)

    def delete_identity_user(self, provider: str, subject: str, now: int) -> dict | None:
        """제공자 회원번호의 회원을 지운다(delete_user 와 같은 DELETE — 연결 · 세션 · 승차권 · 사용 횟수는 ON DELETE CASCADE)
        → {'avatar': …} · 없던 회원이면 None. 지웠으면 오늘 카카오 연결 해제 탈퇴 수를 1 올린다(제공자는 카카오만 부른다)."""
        def work(conn):
            row = conn.execute("SELECT u.id, u.avatar FROM users u JOIN identities i ON i.user_id=u.id "
                               "WHERE i.provider=? AND i.subject=?", (provider, subject)).fetchone()
            if row is None:
                return None
            conn.execute("DELETE FROM users WHERE id=?", (row["id"],))
            _count_withdraw(conn, now, f"{provider}_unlink")
            return {"avatar": row["avatar"]}
        return self._write(work)

    # ---- 세션 ----
    def add_session(self, token_hash: str, user_id: int, now: int, expires_at: int, device: str = "") -> None:
        def work(conn):
            conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))   # 끝난 것은 새로 만들 때 같이 치운다
            conn.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, device, used_at) VALUES (?, ?, ?, ?, ?, ?)",
                         (token_hash, user_id, now, expires_at, device, now))
        self._write(work)

    def session_user(self, token_hash: str, now: int) -> tuple[int, int] | None:
        """살아 있는 세션 → (회원 번호, 마지막 사용 시각). 없거나 끝났으면 None."""
        row = self._read("SELECT user_id, used_at FROM sessions WHERE token_hash=? AND expires_at>?", (token_hash, now))
        return (row["user_id"], row["used_at"]) if row else None

    def touch_session(self, token_hash: str, now: int) -> None:
        """마지막 사용 시각을 now 로(부르는 쪽이 간격을 보고 가끔만 부른다)."""
        self._write(lambda conn: conn.execute("UPDATE sessions SET used_at=? WHERE token_hash=? AND used_at<?",
                                              (now, token_hash, now)))

    def delete_session(self, token_hash: str) -> None:
        self._write(lambda conn: conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,)))

    def sessions(self, user_id: int, now: int) -> list[dict]:
        """그 회원의 살아 있는 세션(token_hash · device · created_at · used_at) — 최근에 쓴 차례."""
        return self._all("SELECT token_hash, device, created_at, used_at FROM sessions WHERE user_id=? AND expires_at>? "
                         "ORDER BY used_at DESC, created_at DESC", (user_id, now))

    def delete_user_session(self, user_id: int, token_hash: str) -> bool:
        """그 회원의 세션 하나를 지운다 → 지웠나(남의 세션 · 없는 세션이면 False)."""
        return self._write(lambda conn: conn.execute("DELETE FROM sessions WHERE token_hash=? AND user_id=?",
                                                     (token_hash, user_id)).rowcount > 0)

    def delete_other_sessions(self, user_id: int, keep_hash: str) -> int:
        """그 회원의 세션 중 keep_hash 아닌 것을 모두 지운다 → 지운 수."""
        return self._write(lambda conn: conn.execute("DELETE FROM sessions WHERE user_id=? AND token_hash<>?",
                                                     (user_id, keep_hash)).rowcount)

    # ---- 날짜별 사용 횟수(내 통계) ----
    def count_usage(self, user_id: int, now: int, kind: str, most: int) -> None:
        """그 회원 · 오늘(한국 날짜) · 종류의 횟수를 1 올린다(most 까지만). 회원이 없으면(그사이 탈퇴) 아무것도 안 한다."""
        def work(conn):
            if conn.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone() is None:
                return
            conn.execute("INSERT INTO usage_daily (user_id, day, kind, count) VALUES (?, date(?, 'unixepoch'), ?, 1) "
                         "ON CONFLICT (user_id, day, kind) DO UPDATE SET count=count+1 WHERE count<?",
                         (user_id, now + KST_SECONDS, kind, most))
        self._write(work)

    def usage(self, user_id: int, first_day: str) -> list[dict]:
        """first_day('YYYY-MM-DD') 부터의 그 회원 사용 횟수 줄(day · kind · count) — 날짜 차례."""
        return self._all("SELECT day, kind, count FROM usage_daily WHERE user_id=? AND day>=? ORDER BY day, kind",
                         (user_id, first_day))

    def prune_usage(self, now: int) -> int:
        """보관 기간(USAGE_DAYS)이 지난 날짜 줄을 모두 지운다 → 지운 수. 하루 백업(jobs/member_backup.py)이 매일 부른다."""
        return self._write(lambda conn: conn.execute(
            "DELETE FROM usage_daily WHERE day<date(?, 'unixepoch', ?)",
            (now + KST_SECONDS, f"-{USAGE_DAYS - 1} days")).rowcount)

    def member_since(self, user_id: int) -> int | None:
        row = self._read("SELECT created_at FROM users WHERE id=?", (user_id,))
        return row["created_at"] if row else None

    def identities(self, user_id: int) -> list[dict]:
        """연결된 로그인 방법(provider · created_at). 제공자 회원번호(subject)는 꺼내지 않는다."""
        return self._all("SELECT provider, created_at FROM identities WHERE user_id=? ORDER BY created_at", (user_id,))

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

    def withdraw_stats(self, since: tuple[str, str, str], first_day: str) -> dict:
        """since: (오늘 · 7일 · 30일 시작 날짜 'YYYY-MM-DD'), first_day: 날짜별 수를 셀 첫 날짜 → 탈퇴 수만(누구인지 없음)."""
        counts = self._read("SELECT coalesce(sum(count), 0) AS total, coalesce(sum(CASE WHEN day>=? THEN count END), 0) AS today, "
                            "coalesce(sum(CASE WHEN day>=? THEN count END), 0) AS week, "
                            "coalesce(sum(CASE WHEN day>=? THEN count END), 0) AS month FROM withdraw_stats", since)
        reasons = self._all("SELECT reason, sum(count) AS count FROM withdraw_stats GROUP BY reason "
                            "ORDER BY count DESC, reason", ())
        daily = self._all("SELECT day, sum(count) AS count FROM withdraw_stats WHERE day>=? GROUP BY day ORDER BY day",
                          (first_day,))
        return {"total": counts["total"], "today": counts["today"], "week": counts["week"], "month": counts["month"],
                "reasons": reasons, "daily": daily}

    _MEMBER_ROW = ("SELECT u.id, u.display_name, u.avatar, u.created_at, "
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

    def prune_admin_log(self, now: int) -> int:
        """1년 지난 관리 기록을 지운다 → 지운 수. 관리 화면을 열 때도 부른다(조치가 한동안 없어도 남지 않게)."""
        return self._write(lambda conn: conn.execute("DELETE FROM admin_log WHERE at<=?", (now - ADMIN_LOG_AGE,)).rowcount)

    def admin_places(self, user_id: int, at: int, reason: str) -> list[dict] | None:
        """승차권 장소(이름 · 좌표)를 꺼내며 같은 트랜잭션에 열람 기록을 남긴다. 회원이 없으면 None(기록 안 남김)."""
        def work(conn):
            if conn.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone() is None:
                return None
            rows = conn.execute("SELECT id, name, from_name, from_lat, from_lng, to_name, to_lat, to_lng FROM tickets "
                                "WHERE user_id=? ORDER BY created_at, id", (user_id,)).fetchall()
            _log(conn, at, "places", user_id, reason)
            return [dict(row) for row in rows]
        return self._write(work)

    def admin_logout(self, user_id: int, at: int, reason: str) -> int | None:
        """그 회원의 세션을 모두 지우고 기록 → 지운 세션 수. 회원이 없으면 None(기록 안 남김)."""
        def work(conn):
            if conn.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone() is None:
                return None
            removed = conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,)).rowcount
            _log(conn, at, "logout", user_id, reason)
            return removed
        return self._write(work)

    def admin_delete(self, user_id: int, at: int, reason: str) -> tuple[dict, str | None] | None:
        """탈퇴 처리: 회원 탈퇴(delete_user)와 같은 DELETE(연결 · 세션 · 승차권 · 사용 횟수는 ON DELETE CASCADE) + 기록 + 오늘 관리자 탈퇴 수 +1
        → (지운 수, 지운 회원의 avatar 값 — 사진 파일은 부르는 쪽이 지운다). 없으면 None."""
        def work(conn):
            row = conn.execute("SELECT avatar FROM users WHERE id=?", (user_id,)).fetchone()
            if row is None:
                return None
            counts = {name: conn.execute(f"SELECT count(*) FROM {name} WHERE user_id=?", (user_id,)).fetchone()[0]
                      for name in ("identities", "sessions", "tickets")}
            conn.execute("DELETE FROM users WHERE id=?", (user_id,))
            _log(conn, at, "delete", user_id, reason)
            _count_withdraw(conn, at, "admin")
            return counts, row["avatar"]
        return self._write(work)

    def admin_clear_avatar(self, user_id: int, at: int, reason: str) -> tuple[bool, str | None] | None:
        """사진 내리기: 올린 사진을 기본 캐릭터로 되돌리고 기록 → (내렸나, 내린 avatar 값). 올린 사진이 아니면 (False, 그 값) · 기록 안 남김.
        회원이 없으면 None."""
        def work(conn):
            row = conn.execute("SELECT avatar FROM users WHERE id=?", (user_id,)).fetchone()
            if row is None:
                return None
            if not (row["avatar"] or "").startswith("photo:"):
                return False, row["avatar"]
            conn.execute("UPDATE users SET avatar=NULL WHERE id=?", (user_id,))
            _log(conn, at, "avatar", user_id, reason)
            return True, row["avatar"]
        return self._write(work)

    def admin_photo_seen(self, user_id: int, at: int) -> str | None:
        """관리자가 회원 사진을 볼 때: 지금 avatar 값을 읽으며 같은 트랜잭션에 'avatar_view' 기록(이유 없이 — 사용자 결정 2026-10-27).
        올린 사진이 없거나 회원이 없으면 None(기록 안 남김)."""
        def work(conn):
            row = conn.execute("SELECT avatar FROM users WHERE id=?", (user_id,)).fetchone()
            if row is None or not (row["avatar"] or "").startswith("photo:"):
                return None
            _log(conn, at, "avatar_view", user_id, "")
            return row["avatar"]
        return self._write(work)

    def admin_reset_name(self, user_id: int, name: str, at: int, reason: str) -> bool | None:
        """닉네임 초기화(name 은 서비스가 정한 기본 이름) + 기록 → True. 회원이 없으면 None."""
        def work(conn):
            if conn.execute("UPDATE users SET display_name=? WHERE id=?", (name, user_id)).rowcount == 0:
                return None
            _log(conn, at, "name", user_id, reason)
            return True
        return self._write(work)
