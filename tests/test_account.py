"""내 정보 계정 칸 · 내 통계(2026-10-27 계획서 D1~D4): 로그인 기기 · 기기 로그아웃 · 내 데이터 내려받기 · 날짜별 사용 횟수.
임시 SQLite 파일 + 가짜 제공자로 HTTP 서버를 끝까지 돌려 본다(바깥 API 를 부르지 않는다)."""

import contextlib
import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.parse
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from server.config import MemberConfig
from server.jobs.member_backup import backup_all
from server.routes.http import Server, make_handler
from server.services.account import USAGE_MOST, app_device, device_label, device_of
from server.services.admin import AdminService
from server.services.members import TOUCH_EVERY, MemberService
from server.store.members import MIGRATIONS, MemberStore
from test_members import ADMIN_KEY, ROUTE, TICKET, FakeProvider

NOW = 1_800_000_000   # 2027-01-15 17:00 KST
DAY = 86400
IPHONE = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
          "Version/18.1 Mobile/15E148 Safari/604.1")
WINDOWS = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
ANDROID_KAKAO = ("Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 "
                 "Mobile Safari/537.36 KAKAOTALK 10.8.0")


class DeviceTest(unittest.TestCase):
    def test_only_os_and_browser_words_are_kept(self):
        cases = {IPHONE: "iphone/safari", WINDOWS: "windows/chrome", ANDROID_KAKAO: "android/kakaotalk",
                 "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15": "mac/safari",
                 "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0": "windows/edge",
                 "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile/15E148 Safari/604.1": "iphone/chrome",
                 "Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36": "android/samsung",
                 "curl/8.0": "", "": "", None: ""}
        for agent, device in cases.items():
            self.assertEqual(device_of(agent), device, agent)
        self.assertEqual(device_label("iphone/safari"), "아이폰 · 사파리")
        self.assertEqual(device_label("android/"), "안드로이드")
        self.assertEqual(device_label(""), "알 수 없는 기기")
        self.assertEqual(device_label("이상한/값"), "알 수 없는 기기")

    def test_app_login_keeps_the_os_and_marks_the_app(self):
        self.assertEqual(app_device(IPHONE), "iphone/app")
        self.assertEqual(app_device(ANDROID_KAKAO), "android/app")
        self.assertEqual(app_device(None), "/app")
        self.assertEqual(device_label("iphone/app"), "아이폰 · 슝 앱")
        self.assertEqual(device_label("/app"), "슝 앱")


class AccountHttpTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(prefix="syung-account-test-")
        self.addCleanup(folder.cleanup)
        self.db = Path(folder.name) / "members.sqlite3"
        self.now = NOW
        self.members = MemberService(MemberConfig(db_file=self.db, public_url="https://syung.test"),
                                     providers={"kakao": FakeProvider()}, clock=lambda: self.now)
        self.server = Server(("127.0.0.1", 0), make_handler(SimpleNamespace(members=self.members), 0))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, *, cookie=None, body=None, agent=None, csrf=True):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        headers = {}
        if cookie:
            headers["Cookie"] = cookie
        if csrf:
            headers["X-Requested-With"] = "syung"
        if agent:
            headers["User-Agent"] = agent
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        connection.request(method, path, body=data, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        connection.close()
        return SimpleNamespace(status=response.status, raw=raw, cookies=response.headers.get_all("Set-Cookie") or [],
                               location=response.headers.get("Location", ""),
                               json=json.loads(raw) if raw and response.headers.get("Content-Type", "").startswith("application/json") else None)

    def login(self, subject="42", name="민지", agent=IPHONE):
        start = self.request("GET", "/api/auth/kakao/start", agent=agent)
        state = urllib.parse.parse_qs(urllib.parse.urlsplit(start.location).query)["state"][0]
        done = self.request("GET", f"/api/auth/kakao/callback?code=who:{subject}:{urllib.parse.quote(name)}&state={state}",
                            cookie=start.cookies[0].split(";")[0], agent=agent)
        self.assertEqual(done.status, 302)
        return next(c for c in done.cookies if c.startswith("syung_session=")).split(";")[0]

    def rows(self, sql, args=()):
        with contextlib.closing(sqlite3.connect(self.db)) as conn:
            return conn.execute(sql, args).fetchall()

    def test_device_list_shows_kind_and_keeps_no_raw_agent(self):
        phone = self.login(agent=IPHONE)
        self.now += 600
        pc = self.login(agent=WINDOWS)
        listed = self.request("GET", "/api/me/sessions", cookie=pc).json["sessions"]
        self.assertEqual([(item["device"], item["current"]) for item in listed], [("윈도우 · 크롬", True), ("아이폰 · 사파리", False)])
        self.assertEqual(listed[1]["createdAt"], NOW)
        self.assertRegex(listed[0]["id"], r"^[0-9a-f]{16}$")
        dump = json.dumps(self.rows("SELECT * FROM sessions"), ensure_ascii=False)
        self.assertNotIn("Mozilla", dump, "브라우저 정보 원문은 저장하지 않는다")
        self.assertNotIn("18_1", dump, "버전도 저장하지 않는다")
        hashes = {row[0] for row in self.rows("SELECT token_hash FROM sessions")}
        self.assertFalse(any(item["id"] in value for item in listed for value in hashes), "세션 번호는 DB 열쇠가 아니다")
        self.assertEqual(self.request("GET", "/api/me/sessions", cookie=phone).json["sessions"][0]["device"], "아이폰 · 사파리",
                         "지금 기기가 먼저")
        self.assertEqual(self.request("GET", "/api/me/sessions").status, 401)

    def test_cannot_log_out_someone_elses_device(self):
        mine = self.login("42", "민지")
        theirs = self.login("77", "준호", agent=WINDOWS)
        their_id = self.request("GET", "/api/me/sessions", cookie=theirs).json["sessions"][0]["id"]
        self.assertEqual(self.request("DELETE", f"/api/me/sessions/{their_id}", cookie=mine).status, 404)
        self.assertEqual(self.request("GET", "/api/me", cookie=theirs).status, 200, "남의 세션은 그대로")
        self.assertEqual(self.request("DELETE", "/api/me/sessions/zz", cookie=mine).status, 404)
        self.assertEqual(self.request("DELETE", f"/api/me/sessions/{their_id}", cookie=mine, csrf=False).status, 403)
        self.assertEqual(self.request("DELETE", "/api/me/sessions?others=1", cookie=mine).json, {"removed": 0},
                         "다른 기기 모두에 남의 세션은 들지 않는다")
        self.assertEqual(self.request("GET", "/api/me", cookie=theirs).status, 200)

    def test_log_out_one_device_and_all_others(self):
        first = self.login(agent=IPHONE)
        second = self.login(agent=WINDOWS)
        third = self.login(agent=ANDROID_KAKAO)
        listed = self.request("GET", "/api/me/sessions", cookie=third).json["sessions"]
        iphone = next(item["id"] for item in listed if item["device"] == "아이폰 · 사파리")
        done = self.request("DELETE", f"/api/me/sessions/{iphone}", cookie=third)
        self.assertEqual((done.status, done.cookies), (204, []), "다른 기기를 끊으면 내 쿠키는 그대로")
        self.assertEqual(self.request("GET", "/api/me", cookie=first).status, 401)
        self.assertEqual(self.request("DELETE", "/api/me/sessions", cookie=third).status, 400, "others=1 이 있어야 한다")
        self.assertEqual(self.request("DELETE", "/api/me/sessions?others=1", cookie=third).json, {"removed": 1})
        self.assertEqual(self.request("GET", "/api/me", cookie=second).status, 401)
        self.assertEqual(self.request("GET", "/api/me", cookie=third).status, 200, "지금 기기는 빠진다")
        mine = self.request("GET", "/api/me/sessions", cookie=third).json["sessions"]
        self.assertEqual(len(mine), 1)
        gone = self.request("DELETE", f"/api/me/sessions/{mine[0]['id']}", cookie=third)
        self.assertEqual(gone.status, 204)
        self.assertTrue(gone.cookies[0].startswith("syung_session=; Max-Age=0"), "지금 기기를 끊으면 쿠키도 지운다")
        self.assertEqual(self.request("GET", "/api/me", cookie=third).status, 401)

    def test_last_use_is_written_only_now_and_then(self):
        session = self.login()
        self.now += TOUCH_EVERY - 1
        self.request("GET", "/api/me", cookie=session)
        self.assertEqual(self.rows("SELECT used_at FROM sessions"), [(NOW,)], "간격 안에서는 쓰지 않는다")
        self.now += 1
        self.request("GET", "/api/me", cookie=session)
        self.assertEqual(self.rows("SELECT used_at FROM sessions"), [(NOW + TOUCH_EVERY,)])
        self.assertEqual(self.request("GET", "/api/me/sessions", cookie=session).json["sessions"][0]["lastUsedAt"], NOW + TOUCH_EVERY)

    def test_usage_counts_and_stats(self):
        session = self.login()
        self.assertEqual(self.request("POST", "/api/me/tickets", cookie=session, body=TICKET | {"route": ROUTE}).status, 201)
        for kind in ("open", "open", "route", "ticket"):
            self.assertEqual(self.request("POST", "/api/me/usage", cookie=session, body={"kind": kind}).status, 204)
        self.assertEqual(self.request("POST", "/api/me/usage", cookie=session, body={"kind": "where"}).status, 400)
        self.assertEqual(self.request("POST", "/api/me/usage", body={"kind": "open"}).status, 401)
        self.assertEqual(self.request("POST", "/api/me/usage", cookie=session, body={"kind": "open"}, csrf=False).status, 403)
        self.now += 2 * DAY
        self.request("POST", "/api/me/usage", cookie=session, body={"kind": "open"})
        self.assertEqual(self.rows("SELECT day, kind, count FROM usage_daily ORDER BY day, kind"),
                         [("2027-01-15", "open", 2), ("2027-01-15", "route", 1), ("2027-01-15", "ticket", 1), ("2027-01-17", "open", 1)],
                         "한국 날짜 · 종류 · 횟수만")
        self.assertEqual([row[1] for row in self.rows("PRAGMA table_info(usage_daily)")], ["user_id", "day", "kind", "count"])
        stats = self.request("GET", "/api/me/stats", cookie=session).json
        self.assertEqual((stats["daysTogether"], stats["tickets"], stats["weeklyRides"]), (3, 1, 4))
        self.assertEqual(stats["recent"], {"days": 30, "openDays": 2, "route": 1, "ticket": 1})
        self.assertEqual(stats["year"], {"openDays": 2, "route": 1, "ticket": 1})
        self.assertEqual(len(stats["daily"]), 30)
        self.assertEqual(stats["daily"][-1], {"day": "2027-01-17", "open": 1, "route": 0, "ticket": 0})
        self.assertEqual(stats["daily"][-3], {"day": "2027-01-15", "open": 2, "route": 1, "ticket": 1})
        # 이번 달 예상 교통비: 시험 경로의 마지막 구간이 마을버스(종로11)라 계산하지 않는다(services/fare.py 가 정한 버스만)
        self.assertEqual(stats["fare"], {"month": "2027-01", "total": 0, "tickets": [], "skipped": 1, "reasons": {"bus": 1}})

    def test_usage_stops_at_the_daily_cap(self):
        session = self.login()
        user_id = self.request("GET", "/api/me", cookie=session).json["id"]
        for _ in range(USAGE_MOST + 5):
            self.members.store.count_usage(user_id, NOW, "route", USAGE_MOST)
        self.assertEqual(self.rows("SELECT count FROM usage_daily"), [(USAGE_MOST,)])

    def test_export_has_only_my_data(self):
        mine = self.login("42", "민지")
        theirs = self.login("77", "준호비밀", agent=WINDOWS)
        self.request("POST", "/api/me/tickets", cookie=mine, body=TICKET | {"name": "내 출근"})
        self.request("POST", "/api/me/tickets", cookie=theirs, body=TICKET | {"name": "남의 퇴근"})
        self.request("POST", "/api/me/usage", cookie=mine, body={"kind": "route"})
        self.request("POST", "/api/me/usage", cookie=theirs, body={"kind": "ticket"})
        data = self.request("GET", "/api/me/export", cookie=mine).json
        self.assertEqual(data["member"]["name"], "민지")
        self.assertEqual(data["logins"], [{"provider": "kakao", "linkedAt": NOW}])
        self.assertEqual([ticket["name"] for ticket in data["tickets"]], ["내 출근"])
        self.assertEqual(data["usage"], [{"day": "2027-01-15", "kind": "route", "count": 1}])
        self.assertEqual(data["devices"], [{"device": "아이폰 · 사파리", "createdAt": NOW, "lastUsedAt": NOW, "current": True}])
        text = json.dumps(data, ensure_ascii=False)
        for secret in ("준호비밀", "남의 퇴근", "윈도우", "42\"", *(row[0] for row in self.rows("SELECT token_hash FROM sessions"))):
            self.assertNotIn(secret, text)
        self.assertEqual(self.request("GET", "/api/me/export").status, 401)

    def test_every_way_of_leaving_removes_devices_and_usage(self):
        self.members.config.kakao_admin_key = ADMIN_KEY
        admin = AdminService(self.members.store, clock=lambda: self.now, started_at=NOW)
        ids = {}
        for subject in ("1", "2", "3", "4"):
            session = self.login(subject, f"회원{subject}")
            ids[subject] = self.request("GET", "/api/me", cookie=session).json["id"]
            self.request("POST", "/api/me/usage", cookie=session, body={"kind": "open"})
            if subject == "1":
                own = session
        self.assertEqual(self.request("DELETE", "/api/me", cookie=own).status, 204)   # 본인 탈퇴
        self.assertTrue(self.members.kakao_unlinked({"user_id": ["2"]}))   # 카카오 연결 해제
        admin.delete(ids["3"], {"reason": "본인 요청", "confirm": str(ids["3"])})   # 관리자 탈퇴 처리
        self.assertEqual(self.rows("SELECT user_id FROM usage_daily"), [(ids["4"],)])
        self.assertEqual(self.rows("SELECT user_id FROM sessions"), [(ids["4"],)])
        self.assertEqual(self.rows("SELECT reason, count FROM withdraw_stats ORDER BY reason"),
                         [("admin", 1), ("kakao_unlink", 1), ("self", 1)])

    def test_usage_older_than_a_year_is_pruned_by_the_daily_backup(self):
        session = self.login()
        user_id = self.request("GET", "/api/me", cookie=session).json["id"]
        store = self.members.store
        for back in (365, 364, 0):
            store.count_usage(user_id, NOW - back * DAY, "open", USAGE_MOST)
        self.assertEqual(len(self.rows("SELECT * FROM usage_daily")), 3)
        lines = backup_all(MemberConfig(db_file=self.db), self.db.parent / "backups", date(2027, 1, 15))
        # 백업 작업은 진짜 시계로 돈다 — 2027 년 날짜 줄은 아직 1년이 안 지났다
        self.assertFalse(any("사용 기록" in line for line in lines))
        self.assertEqual(store.prune_usage(NOW), 1, "오늘 포함 365일만 남긴다")
        self.assertEqual([row[0] for row in self.rows("SELECT day FROM usage_daily ORDER BY day")], ["2026-01-16", "2027-01-15"])
        self.assertEqual(store.prune_usage(NOW + 400 * DAY), 2)


class MigrationTest(unittest.TestCase):
    def test_version_six_sessions_get_device_and_last_use(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "members.sqlite3"
            with contextlib.closing(sqlite3.connect(path, isolation_level=None)) as conn:
                conn.execute("CREATE TABLE schema_version (version INTEGER NOT NULL)")
                conn.execute("INSERT INTO schema_version VALUES (6)")
                for number, sql in MIGRATIONS[:6]:
                    for statement in (part.strip() for part in sql.split(";")):
                        if statement and not statement.startswith(("INSERT INTO tickets", "DROP TABLE commute")):
                            conn.execute(statement)
                conn.execute("INSERT INTO users (id, display_name, created_at) VALUES (1, '옛 회원', 100)")
                conn.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('h', 1, 123, 9999999999)")
            store = MemberStore(path)
            self.assertEqual(store.schema_version(), MIGRATIONS[-1][0])
            self.assertEqual(store.sessions(1, 200), [{"token_hash": "h", "device": "", "created_at": 123, "used_at": 123}])


if __name__ == "__main__":
    unittest.main()
