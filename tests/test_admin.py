"""관리 화면 API(주인만): 회원 수 · 목록 · 상세 · 장소 보기 · 강제 로그아웃 · 탈퇴 처리 · 서버 상태.
임시 SQLite 파일 + 가짜 주인 인증으로 HTTP 서버를 끝까지 돌려 본다(바깥 API 를 부르지 않는다)."""

import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path
from types import SimpleNamespace

from server.errors import BusError
from server.routes.http import Server, make_handler
from server.services.admin import AdminService
from server.services.members import clean_ticket
from server.store.members import MemberStore

NOW = 1_800_000_000   # 2027-01-15 17:00 KST
DAY = 86400
GOOD = "good-token"
TICKET = {"name": "출근", "from": {"name": "서울시청", "lat": 37.5663, "lng": 126.9779},
          "to": {"name": "강남역", "lat": 37.4979, "lng": 127.0276}, "depart": "08:10", "days": [1, 2, 3]}
ROUTE = {"tag": "빠른 길", "minutes": 31, "leaveBy": "08:11", "arrives": "08:41", "transfers": 0, "walkMinutes": 2,
         "legs": [{"type": "ride", "line": "2호선", "from": "시청", "to": "강남", "departs": "08:13", "arrives": "08:40", "wait": 60}]}
SECRET_WORDS = ("서울시청", "강남역", "37.5663", "126.9779", "37.4979", "127.0276", "시청", "subject-")
WRITE = {"Content-Type": "application/json", "X-Requested-With": "syung"}


class AdminHttpTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(prefix="syung-admin-test-")
        self.addCleanup(folder.cleanup)
        self.db = Path(folder.name) / "members.sqlite3"
        self.store = MemberStore(self.db)
        self.now = NOW
        self.admin = AdminService(self.store, clock=lambda: self.now, started_at=NOW - 3600)
        services = SimpleNamespace(admin=self.admin, auth=SimpleNamespace(valid_token=lambda value: value == GOOD))
        self.server = Server(("127.0.0.1", 0), make_handler(services, 0))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        # 회원 셋: 1 카카오(오늘 · 승차권 2장 · 세션 2개), 2 구글(5일 전), 3 카카오(40일 전)
        self.kim = self.member("kakao", "subject-1", "김슝", NOW - 600)
        self.lee = self.member("google", "subject-2", "이슝_100%", NOW - 5 * DAY)
        self.old = self.member("kakao", "subject-3", "오래된 회원", NOW - 40 * DAY)
        self.store.add_session("hash-a", self.kim, NOW - 500, NOW + DAY)
        self.store.add_session("hash-b", self.kim, NOW - 300, NOW + DAY)
        self.store.add_session("hash-c", self.lee, NOW - 200, NOW + DAY)
        self.store.add_ticket(self.kim, clean_ticket(TICKET | {"route": ROUTE}), NOW - 400, 20)
        self.store.add_ticket(self.kim, clean_ticket(TICKET | {"name": "퇴근"}), NOW - 300, 20)

    def member(self, provider, subject, name, at):
        return self.store.find_or_create_user(provider, subject, name, at)[0]

    def call(self, method, path, body=None, cookie=GOOD, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
        sent = dict(headers if headers is not None else (WRITE if body is not None else {}))
        if cookie:
            sent["Cookie"] = f"other=1; syung_owner={cookie}"
        data = json.dumps(body, ensure_ascii=False).encode() if isinstance(body, dict) else body
        conn.request(method, urllib.parse.quote(path, safe="/?=&%"), body=data, headers=sent)
        response = conn.getresponse()
        raw = response.read()
        conn.close()
        return response.status, raw.decode("utf-8")

    def json(self, method, path, body=None, **kwargs):
        status, text = self.call(method, path, body, **kwargs)
        return status, json.loads(text)

    def rows(self, sql, args=()):
        conn = sqlite3.connect(self.db)
        try:
            return conn.execute(sql, args).fetchall()
        finally:
            conn.close()

    def test_every_admin_address_needs_the_owner_cookie(self):
        calls = [("GET", "/admin/members/stats", None), ("GET", "/admin/members", None), ("GET", "/admin/members?q=김", None),
                 ("GET", f"/admin/members/{self.kim}", None), ("GET", "/admin/status", None),
                 ("POST", f"/admin/members/{self.kim}/places", {"reason": "문의"}),
                 ("POST", f"/admin/members/{self.kim}/logout", {"reason": "문의"}),
                 ("DELETE", f"/admin/members/{self.kim}", {"reason": "문의", "confirm": str(self.kim)})]
        for cookie in (None, "bad-token"):
            for method, path, body in calls:
                with self.subTest(method=method, path=path, cookie=cookie):
                    status, answer = self.json(method, path, body, cookie=cookie)
                    self.assertEqual((status, answer["error"]["code"]), (401, "login"))
        self.assertEqual(len(self.rows("SELECT * FROM sessions WHERE user_id=?", (self.kim,))), 2, "쿠키 없이는 아무것도 안 바뀐다")
        self.assertEqual(self.rows("SELECT * FROM admin_log"), [])

    def test_stats_count_signups_by_day_and_provider(self):
        status, body = self.json("GET", "/admin/members/stats")
        self.assertEqual(status, 200)
        self.assertEqual((body["total"], body["today"], body["week"], body["month"]), (3, 1, 2, 2))
        self.assertEqual(body["providers"], [{"provider": "kakao", "count": 2}, {"provider": "google", "count": 1}])
        self.assertEqual(len(body["daily"]), 30)
        self.assertEqual(body["daily"][-1], {"day": "2027-01-15", "count": 1}, "한국 날짜로 오늘이 맨 끝")
        self.assertEqual(body["daily"][-6], {"day": "2027-01-10", "count": 1})
        self.assertEqual(sum(day["count"] for day in body["daily"]), 2, "40일 전 가입은 30일 칸 밖")

    def test_stats_count_withdrawals_by_day_and_reason(self):
        self.assertEqual(self.json("GET", "/admin/members/stats")[1]["withdraw"],
                         {"total": 0, "today": 0, "week": 0, "month": 0, "reasons": [],
                          "daily": [{"day": day["day"], "count": 0} for day in self.json("GET", "/admin/members/stats")[1]["daily"]]})
        self.now = NOW - 3 * DAY   # 2027-01-12 — 7일 안
        self.store.delete_user(self.old, int(self.now))
        self.now = NOW - 40 * DAY   # 30일 밖은 모두 수에만
        self.store.delete_identity_user("kakao", "subject-x", int(self.now))   # 없는 회원 — 안 센다
        self.member("kakao", "subject-9", "옛 회원", self.now - DAY)
        self.store.delete_identity_user("kakao", "subject-9", int(self.now))
        self.now = NOW
        self.json("DELETE", f"/admin/members/{self.kim}", {"reason": "본인 요청", "confirm": str(self.kim)})
        self.store.delete_user(self.lee, int(self.now))
        status, body = self.json("GET", "/admin/members/stats")
        self.assertEqual(status, 200)
        out = body["withdraw"]
        self.assertEqual((out["total"], out["today"], out["week"], out["month"]), (4, 2, 3, 3))
        self.assertEqual(out["reasons"], [{"reason": "self", "count": 2}, {"reason": "admin", "count": 1},
                                          {"reason": "kakao_unlink", "count": 1}])
        self.assertEqual([day["day"] for day in out["daily"]], [day["day"] for day in body["daily"]], "가입 추이와 같은 30일 칸")
        self.assertEqual(out["daily"][-1], {"day": "2027-01-15", "count": 2}, "한국 날짜로 오늘이 맨 끝")
        self.assertEqual(out["daily"][-4], {"day": "2027-01-12", "count": 1})
        self.assertEqual(body["total"], 0, "회원 수는 지운 만큼 준다")
        # 표에는 날짜 · 사유 · 수만 — 회원을 알아볼 칸이 없다
        self.assertEqual([column[1] for column in self.rows("PRAGMA table_info(withdraw_stats)")], ["day", "reason", "count"])
        dump = repr(self.rows("SELECT * FROM withdraw_stats"))
        for word in ("김슝", "이슝", "오래된 회원", "옛 회원", "subject-", "본인 요청"):
            self.assertNotIn(word, dump)
        self.assertEqual({row[1] for row in self.rows("SELECT * FROM withdraw_stats")}, {"self", "kakao_unlink", "admin"})

    def test_list_has_no_places_and_searches_by_name_or_number(self):
        status, text = self.call("GET", "/admin/members")
        self.assertEqual(status, 200)
        for word in SECRET_WORDS:
            self.assertNotIn(word, text, "목록에는 승차권 장소 · 제공자 회원번호가 없다")
        body = json.loads(text)
        self.assertEqual((body["total"], body["page"], body["pageSize"]), (3, 1, 50))
        self.assertEqual([member["id"] for member in body["members"]], [self.kim, self.lee, self.old], "새로 가입한 차례")
        self.assertEqual(body["members"][0], {"id": self.kim, "name": "김슝", "createdAt": NOW - 600, "provider": "kakao",
                                              "tickets": 2, "lastLogin": NOW - 300, "sessions": 2})
        self.assertEqual([m["id"] for m in self.json("GET", "/admin/members?q=%EA%B9%80")[1]["members"]], [self.kim])
        self.assertEqual([m["id"] for m in self.json("GET", f"/admin/members?q={self.old}")[1]["members"]], [self.old])
        self.assertEqual([m["id"] for m in self.json("GET", "/admin/members?q=_100%25")[1]["members"]], [self.lee],
                         "% · _ 는 글자 그대로 찾는다")
        self.assertEqual(self.json("GET", "/admin/members?q=%25")[1]["total"], 1)
        self.assertEqual(self.json("GET", "/admin/members?page=2")[1]["members"], [])
        self.assertEqual(self.json("GET", "/admin/members?page=x")[1]["page"], 1)

    def test_detail_hides_places_until_asked_with_a_reason(self):
        status, text = self.call("GET", f"/admin/members/{self.kim}")
        self.assertEqual(status, 200)
        for word in SECRET_WORDS:
            self.assertNotIn(word, text, "상세 기본 응답에도 장소 · 경로가 없다")
        body = json.loads(text)
        self.assertEqual([(t["name"], t["depart"], t["days"], t["hasRoute"]) for t in body["ticketList"]],
                         [("출근", "08:10", [1, 2, 3], True), ("퇴근", "08:10", [1, 2, 3], False)])
        self.assertEqual(body["identities"], [{"provider": "kakao", "createdAt": NOW - 600}])
        self.assertEqual(body["log"], [])
        self.assertEqual(self.json("GET", "/admin/members/999")[0], 404)

        status, body = self.json("POST", f"/admin/members/{self.kim}/places", {"reason": "  "})
        self.assertEqual((status, body["error"]["code"]), (400, "bad_request"))
        self.assertEqual(self.json("POST", f"/admin/members/{self.kim}/places", {"reason": "문의"},
                                   headers={"Content-Type": "application/json"})[0], 403, "X-Requested-With 없으면 막는다")
        self.assertEqual(self.rows("SELECT * FROM admin_log"), [], "실패한 요청은 기록도 장소도 없다")

        self.now = NOW + 60
        status, body = self.json("POST", f"/admin/members/{self.kim}/places", {"reason": "길찾기 오류 문의\n확인"})
        self.assertEqual(status, 200)
        self.assertEqual(body["places"][0]["from"], {"name": "서울시청", "lat": 37.5663, "lng": 126.9779})
        self.assertEqual(body["places"][1]["to"]["name"], "강남역")
        self.assertEqual(self.rows("SELECT at, action, user_id, reason FROM admin_log"),
                         [(NOW + 60, "places", self.kim, "길찾기 오류 문의 확인")])
        self.assertEqual(self.json("GET", f"/admin/members/{self.kim}")[1]["log"],
                         [{"at": NOW + 60, "action": "places", "reason": "길찾기 오류 문의 확인"}])
        self.assertEqual(self.json("POST", "/admin/members/999/places", {"reason": "문의"})[0], 404)
        self.assertEqual(len(self.rows("SELECT * FROM admin_log")), 1, "없는 회원은 기록하지 않는다")

    def test_force_logout_removes_every_session_and_is_logged(self):
        self.assertEqual(self.json("POST", f"/admin/members/{self.kim}/logout", {})[0], 400, "이유가 있어야 한다")
        status, body = self.json("POST", f"/admin/members/{self.kim}/logout", {"reason": "기기 분실 신고"})
        self.assertEqual((status, body), (200, {"ok": True, "sessions": 2}))
        self.assertEqual(self.rows("SELECT user_id FROM sessions"), [(self.lee,)], "다른 회원 세션은 그대로")
        self.assertEqual(self.rows("SELECT action, user_id, reason FROM admin_log"), [("logout", self.kim, "기기 분실 신고")])
        self.assertEqual(len(self.rows("SELECT * FROM tickets WHERE user_id=?", (self.kim,))), 2, "승차권은 그대로")

    def test_delete_needs_the_number_again_and_removes_every_row(self):
        status, body = self.json("DELETE", f"/admin/members/{self.kim}", {"reason": "본인 요청", "confirm": str(self.lee)})
        self.assertEqual((status, body["error"]["code"]), (400, "bad_request"))
        self.assertEqual(self.json("DELETE", f"/admin/members/{self.kim}", {"confirm": str(self.kim)})[0], 400)
        self.assertEqual(self.call("DELETE", f"/admin/members/{self.kim}", b"", headers=WRITE)[0], 400, "본문이 없으면 400")
        self.assertEqual(len(self.rows("SELECT * FROM users WHERE id=?", (self.kim,))), 1, "확인이 틀리면 지우지 않는다")

        status, body = self.json("DELETE", f"/admin/members/{self.kim}", {"reason": "본인 요청(메일)", "confirm": self.kim})
        self.assertEqual((status, body), (200, {"ok": True, "removed": {"identities": 1, "sessions": 2, "tickets": 2, "photo": 0}}))
        for table in ("users", "identities", "sessions", "tickets"):
            column = "id" if table == "users" else "user_id"
            self.assertEqual(self.rows(f"SELECT * FROM {table} WHERE {column}=?", (self.kim,)), [], table)
        self.assertEqual(len(self.rows("SELECT * FROM users")), 2, "다른 회원은 그대로")
        self.assertEqual(self.rows("SELECT action, user_id, reason FROM admin_log"), [("delete", self.kim, "본인 요청(메일)")],
                         "회원이 지워져도 기록은 남는다")
        self.assertEqual(self.json("DELETE", f"/admin/members/{self.kim}", {"reason": "다시", "confirm": str(self.kim)})[0], 404)
        self.assertEqual(self.rows("SELECT * FROM withdraw_stats"), [("2027-01-15", "admin", 1)],
                         "탈퇴 수는 날짜 · 사유 · 수만(없는 회원을 다시 지우면 안 센다)")
        self.assertEqual(self.json("GET", "/admin/members/stats")[1]["total"], 2)

    def test_log_keeps_no_address_or_search_words(self):
        self.call("GET", "/admin/members?q=비밀검색어")
        self.json("POST", f"/admin/members/{self.kim}/logout", {"reason": "확인"}, headers=WRITE | {"X-Forwarded-For": "203.0.113.9"})
        self.assertEqual(self.rows("PRAGMA table_info(admin_log)")[1:], [(1, "at", "INTEGER", 1, None, 0),
                                                                         (2, "action", "TEXT", 1, None, 0),
                                                                         (3, "user_id", "INTEGER", 1, None, 0),
                                                                         (4, "reason", "TEXT", 1, None, 0)])
        dump = "\n".join(self.rows("SELECT ? || group_concat(reason) FROM admin_log", ("",))[0])
        self.assertNotIn("203.0.113.9", dump)
        self.assertNotIn("비밀검색어", dump)
        self.assertEqual(self.store.schema_version(), 6)

    def test_log_is_kept_for_one_year(self):
        self.json("POST", f"/admin/members/{self.kim}/logout", {"reason": "오래된 조치"})
        self.now = NOW + 200 * DAY
        self.json("POST", f"/admin/members/{self.lee}/logout", {"reason": "반년 뒤 조치"})
        self.now = NOW + 365 * DAY - 1
        self.json("GET", "/admin/members/stats")
        self.assertEqual(len(self.rows("SELECT * FROM admin_log")), 2, "1년이 안 됐으면 남는다")
        self.now = NOW + 365 * DAY
        self.assertEqual(self.json("GET", f"/admin/members/{self.kim}")[1]["log"], [], "1년 된 기록은 상세에도 없다")
        self.assertEqual(self.rows("SELECT reason FROM admin_log"), [("반년 뒤 조치",)])
        self.now = NOW + 600 * DAY
        self.json("POST", f"/admin/members/{self.kim}/places", {"reason": "새 조회"})
        self.assertEqual(self.rows("SELECT reason FROM admin_log"), [("새 조회",)], "새 기록을 쓸 때도 1년 지난 것을 지운다")

    def test_unknown_admin_address_and_method(self):
        self.assertEqual(self.call("GET", "/admin/members/0")[0], 404, "0 번은 회원 주소 꼴이 아니다(debug 표로 가서 404)")
        self.assertEqual(self.call("PUT", f"/admin/members/{self.kim}", {"reason": "x"})[0], 404)
        self.assertEqual(self.json("GET", f"/admin/members/{self.kim}/logout")[0], 405)
        self.assertEqual(self.json("POST", "/admin/members/stats", {"reason": "x"})[0], 405)


class FakeLedger:
    def __init__(self, used, limit, broken=False):
        self.used, self.limit, self.broken = used, limit, broken

    def view(self, now):
        if self.broken:
            raise BusError("quota_storage")
        return {"day": "2027-01-15", "used": self.used, "limit": self.limit, "remaining": self.limit - self.used}


class AdminStatusTest(unittest.TestCase):
    def test_status_reads_counts_caches_and_problems_without_calling_out(self):
        live = SimpleNamespace(quota_view=lambda: {"used": 412, "limit": 950, "day": "2027-01-15"},
                               position_used={"day": "2027-01-15", "calls": 30}, config=SimpleNamespace(position_budget=3000),
                               all_cache=(NOW - 42, {}), position_cache={"2호선": (0, [])})
        bus = SimpleNamespace(ledger=FakeLedger(100, 950), cache={"a": 1, "b": 2}, config=SimpleNamespace(daily_limit=950))
        arrivals = SimpleNamespace(ledger=FakeLedger(0, 950, broken=True), cache={}, config=SimpleNamespace(daily_limit=950))
        health = SimpleNamespace(report=lambda: {"checkedAt": "2027-01-15T17:00:00+09:00", "checks": [
            {"key": "source:all", "ok": True, "text": "정상"}, {"key": "live:7호선", "ok": False, "text": "7호선 열차가 적어요"}]})
        admin = AdminService(MemberStore(Path("/nonexistent/members.sqlite3")), live=lambda: live, health=lambda: health,
                             bus=lambda: bus, arrivals=lambda: arrivals, started_at=NOW - 7200, clock=lambda: NOW)
        body = admin.status()
        self.assertEqual((body["uptimeSeconds"], body["startedAt"]), (7200, "2027-01-15T15:00:00+09:00"))
        self.assertEqual([(c["key"], c["used"], c["limit"]) for c in body["calls"]],
                         [("subway", 412, 950), ("position", 30, 3000), ("bus", 100, 950), ("arrival", None, 950)])
        self.assertEqual([(c["key"], c["entries"], c["ageSeconds"]) for c in body["caches"]],
                         [("subway", 1, 42), ("position", 1, None), ("bus", 2, None), ("arrival", 0, None)])
        self.assertEqual([p["key"] for p in body["problems"]], ["quota:arrival", "live:7호선"])


if __name__ == "__main__":
    unittest.main()
