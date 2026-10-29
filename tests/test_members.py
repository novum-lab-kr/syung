"""회원 로그인 · 세션 · 출퇴근 설정: 임시 SQLite 파일 + 가짜 제공자로 HTTP 서버를 끝까지 돌려 본다(바깥 API 를 부르지 않는다)."""

import base64
import contextlib
import http.client
import json
import os
import sqlite3
import stat
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path
from types import SimpleNamespace

from server.config import MemberConfig
from server.routes.http import Server, make_handler
from server.services import login_providers
from server.services.members import TICKET_LIMIT, MemberService, TRIES, clean_ticket
from server.sources.oauth import ProviderError
from server.store.members import MIGRATIONS, MemberStore

NOW = 1_800_000_000
ADMIN_KEY = "test-admin-key"   # 시험용 가짜 대표 어드민 키
TICKET = {"name": "출근", "from": {"name": "서울시청", "lat": 37.5663, "lng": 126.9779},
          "to": {"name": "강남역", "lat": 37.4979, "lng": 127.0276}, "depart": "08:10", "days": [5, 1, 2, 4]}
# 길찾기(/api/route) 결과 한 개 — 그리는 데 안 쓰는 칸(path · stations · direction …)은 저장하지 않는다
ROUTE = {"tag": "가장 빠른 길", "kind": "subway", "leaveBy": "08:11", "arrives": "08:41", "minutes": 31, "transfers": 0, "walkMinutes": 2,
         "legs": [{"type": "walk", "seconds": 80, "metres": 112, "exit": "2-1", "to": "잠실", "path": [[127.1, 37.5]]},
                  {"type": "ride", "line": "2호선", "from": "잠실", "to": "시청", "departs": "08:13", "arrives": "08:40", "wait": 106,
                   "direction": "외선", "stations": [1, 2], "realtime": False},
                  {"type": "bus", "route": "종로11", "color": "#7bc043", "from": "조선일보", "to": "시청역", "departs": "08:53",
                   "arrives": "08:54", "wait": 49, "alts": ["01"],
                   "alternatives": [{"route": "7016", "color": "#3d5bab", "departs": "08:55", "arrives": "08:57", "path": [[127, 37]]}]}]}
SAVED_ROUTE = {"tag": "가장 빠른 길", "minutes": 31, "leaveBy": "08:11", "arrives": "08:41", "transfers": 0, "walkMinutes": 2,
               "legs": [{"type": "walk", "seconds": 80, "exit": "2-1"},
                        {"type": "ride", "line": "2호선", "from": "잠실", "to": "시청", "departs": "08:13", "arrives": "08:40", "wait": 106},
                        {"type": "bus", "route": "종로11", "color": "#7bc043", "from": "조선일보", "to": "시청역", "departs": "08:53",
                         "arrives": "08:54", "wait": 49,
                         "alternatives": [{"route": "7016", "color": "#3d5bab", "departs": "08:55", "arrives": "08:57"}]}]}


class FakeProvider:
    """인가 주소는 콜백으로 바로, 인가 코드 'who:<번호>:<이름>' 을 그 사람으로 읽는다. 'bad' 는 제공자 실패."""
    def __init__(self, name="kakao"):
        self.name = name
        self.codes = []

    def authorize_url(self, state, redirect_uri):
        return f"https://provider.test/authorize?state={state}&redirect_uri={urllib.parse.quote(redirect_uri, safe='')}"

    def identify(self, code, redirect_uri):
        self.codes.append((code, redirect_uri))
        if code == "bad":
            raise ProviderError("provider http 401")
        _, subject, name = code.split(":")
        return subject, name


class MemberHttpTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(prefix="syung-members-test-")
        self.addCleanup(folder.cleanup)
        self.db = Path(folder.name) / "members.sqlite3"
        self.now = NOW
        self.provider = FakeProvider()
        self.members = MemberService(MemberConfig(db_file=self.db, public_url="https://syung.test"),
                                     providers={"kakao": self.provider}, clock=lambda: self.now)
        self.server = Server(("127.0.0.1", 0), make_handler(SimpleNamespace(members=self.members), 0))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, *, cookie=None, body=None, csrf=True, forwarded="192.0.2.1"):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        headers = {"X-Forwarded-For": forwarded}
        if cookie:
            headers["Cookie"] = cookie
        if csrf:
            headers["X-Requested-With"] = "syung"
        data = None
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        connection.request(method, path, body=data, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        result = SimpleNamespace(status=response.status, headers=response.headers, raw=raw,
                                 cookies=response.headers.get_all("Set-Cookie") or [])
        result.json = json.loads(raw) if raw and response.headers.get("Content-Type", "").startswith("application/json") else None
        connection.close()
        return result

    def login(self, subject="42", name="민지", *, prefix="/api"):
        start = self.request("GET", f"{prefix}/auth/kakao/start")
        self.assertEqual(start.status, 302)
        state_cookie = start.cookies[0].split(";")[0]
        state = urllib.parse.parse_qs(urllib.parse.urlsplit(start.headers["Location"]).query)["state"][0]
        done = self.request("GET", f"{prefix}/auth/kakao/callback?code=who:{subject}:{urllib.parse.quote(name)}&state={state}",
                            cookie=state_cookie)
        self.assertEqual(done.status, 302)
        self.assertIn(done.headers["Location"], ("/#login=new", "/#login=ok"))
        self.last_location = done.headers["Location"]
        session = next(c for c in done.cookies if c.startswith("syung_session="))
        return session.split(";")[0]

    def test_providers_list_and_disabled_service_hides_everything(self):
        self.assertEqual(self.request("GET", "/api/auth/providers").json, {"providers": ["kakao"], "me": None})
        self.members.providers = {}
        self.assertEqual(self.request("GET", "/auth/providers").json, {"providers": [], "me": None})
        self.assertEqual(self.request("GET", "/api/me").status, 404)
        self.assertEqual(self.request("GET", "/api/auth/kakao/start").status, 404)
        self.assertFalse(self.db.exists(), "꺼져 있으면 DB 파일을 만들지 않는다")

    def test_start_sets_state_cookie_with_owner_cookie_attributes(self):
        start = self.request("GET", "/api/auth/kakao/start")
        self.assertTrue(start.headers["Location"].startswith("https://provider.test/authorize?"))
        self.assertIn("redirect_uri=https%3A%2F%2Fsyung.test%2Fapi%2Fauth%2Fkakao%2Fcallback", start.headers["Location"])
        self.assertRegex(start.cookies[0], r"^syung_login=kakao\.[\w-]+; Max-Age=600; Path=/api/auth/; HttpOnly; Secure; SameSite=Lax$")
        self.assertEqual(start.headers["Cache-Control"], "no-store")

    def test_signup_login_me_tickets_logout_and_delete(self):
        session = self.login()
        self.assertEqual(self.last_location, "/#login=new", "처음 가입이면 #login=new 로 돌려보낸다")
        self.assertEqual(self.provider.codes[-1][1], "https://syung.test/api/auth/kakao/callback")
        me = self.request("GET", "/api/me", cookie=session)
        self.assertEqual((me.status, me.json), (200, {"id": 1, "name": "민지", "provider": "kakao", "avatar": None}))
        self.assertEqual(me.headers["Cache-Control"], "no-store")
        listed = self.request("GET", "/api/auth/providers", cookie=session)
        self.assertEqual(listed.json, {"providers": ["kakao"], "me": {"id": 1, "name": "민지", "provider": "kakao", "avatar": None}}, "메뉴는 요청 하나로 그린다")
        self.assertEqual(listed.headers["Cache-Control"], "no-store")
        self.assertIsNone(self.request("GET", "/api/auth/providers", cookie="syung_session=nope").json["me"])
        # 같은 사람이 다시 로그인하면 같은 회원
        again = self.login(prefix="")   # Caddy 가 /api 를 뗀 주소
        self.assertEqual(self.last_location, "/#login=ok")
        self.assertEqual(self.request("GET", "/me", cookie=again).json["id"], 1)

        self.assertEqual(self.request("GET", "/api/me/tickets", cookie=session).json, {"tickets": []})
        issued = self.request("POST", "/api/me/tickets", cookie=session, body=TICKET)
        self.assertEqual(issued.status, 201)
        self.assertEqual(issued.json, {"id": 1, "name": "출근", "from": TICKET["from"], "to": TICKET["to"], "depart": "08:10", "days": [1, 2, 4, 5],
                                       "route": None, "via": None})
        back = self.request("POST", "/api/me/tickets", cookie=session, body=dict(TICKET, name="퇴근", **{"from": TICKET["to"], "to": TICKET["from"]}, depart="18:30"))
        self.assertEqual(back.status, 201, "같은 요일에 여러 장")
        listed = self.request("GET", "/api/me/tickets", cookie=session).json["tickets"]
        self.assertEqual([ticket["name"] for ticket in listed], ["출근", "퇴근"])

        fixed = self.request("PUT", "/api/me/tickets/1", cookie=session, body=dict(TICKET, depart="07:50", days=[6]))
        self.assertEqual((fixed.status, fixed.json["depart"], fixed.json["days"]), (200, "07:50", [6]))
        routed = self.request("PUT", "/api/me/tickets/1", cookie=session, body=dict(TICKET, route=ROUTE))
        self.assertEqual((routed.status, routed.json["route"]), (200, SAVED_ROUTE), "고른 경로는 그리는 칸만 남긴다")
        self.assertEqual(self.request("GET", "/api/me/tickets", cookie=session).json["tickets"][0]["route"], SAVED_ROUTE)
        broken = dict(ROUTE, legs=[dict(ROUTE["legs"][2], alternatives=[{"route": "7016", "color": "red", "departs": "08:55", "arrives": "08:57"}])])
        self.assertEqual(self.request("PUT", "/api/me/tickets/1", cookie=session, body=dict(TICKET, route=broken)).status, 400, "같은 구간 버스의 색이 틀리면 거절")
        cleared = self.request("PUT", "/api/me/tickets/1", cookie=session, body=dict(TICKET, depart="07:50", days=[6]))
        self.assertIsNone(cleared.json["route"], "route 를 빼고 고치면 지운다")
        # 경유지(2026-10-29): via 를 넣으면 저장 · 읽을 때 그대로, 빼고 고치면 지운다(route 와 같다)
        via = {"name": "성수역 2호선", "lat": 37.544581, "lng": 127.055961}
        vias = self.request("PUT", "/api/me/tickets/1", cookie=session, body=dict(TICKET, route=ROUTE, via=dict(via, name=" 성수역 2호선 ")))
        self.assertEqual((vias.status, vias.json["via"]), (200, via))
        self.assertEqual(self.request("GET", "/api/me/tickets", cookie=session).json["tickets"][0]["via"], via)
        self.assertEqual(self.request("PUT", "/api/me/tickets/1", cookie=session, body=dict(TICKET, via={"name": "성수", "lat": 99, "lng": 127})).status, 400)
        self.assertIsNone(self.request("PUT", "/api/me/tickets/1", cookie=session, body=dict(TICKET, depart="07:50", days=[6])).json["via"])
        self.assertEqual(self.request("DELETE", "/api/me/tickets/2", cookie=session).status, 204)
        self.assertEqual(self.request("DELETE", "/api/me/tickets/2", cookie=session).status, 404)

        # 다른 사람은 남의 승차권을 못 보고 못 고치고 못 지운다
        other = self.login(subject="77", name="준호")
        self.assertEqual(self.request("GET", "/api/me", cookie=other).json["id"], 2)
        self.assertEqual(self.request("GET", "/api/me/tickets", cookie=other).json, {"tickets": []})
        self.assertEqual(self.request("PUT", "/api/me/tickets/1", cookie=other, body=TICKET).status, 404)
        self.assertEqual(self.request("DELETE", "/api/me/tickets/1", cookie=other).status, 404)
        self.assertEqual(self.request("GET", "/api/me/tickets", cookie=session).json["tickets"][0]["depart"], "07:50")

        out = self.request("POST", "/api/auth/logout", cookie=session)
        self.assertEqual(out.status, 204)
        self.assertTrue(out.cookies[0].startswith("syung_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"))
        self.assertEqual(self.request("GET", "/api/me", cookie=session).status, 401)
        self.assertEqual(self.request("GET", "/api/me", cookie=again).status, 200, "다른 기기 세션은 남는다")

        gone = self.request("DELETE", "/api/me", cookie=again)
        self.assertEqual(gone.status, 204)
        self.assertEqual(self.request("GET", "/api/me", cookie=again).status, 401)
        with contextlib.closing(sqlite3.connect(self.db)) as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM users WHERE id=1").fetchone()[0], 0)
            self.assertEqual(conn.execute("SELECT * FROM withdraw_stats").fetchall(), [("2027-01-15", "self", 1)],
                             "본인 탈퇴는 한국 날짜 · 사유 · 수만 남긴다")
            for table in ("identities", "sessions", "tickets"):
                self.assertEqual(conn.execute(f"SELECT count(*) FROM {table} WHERE user_id=1").fetchone()[0], 0, table)
            self.assertEqual(conn.execute("SELECT count(*) FROM users").fetchone()[0], 1, "준호는 남는다")
            # 세션 쿠키 값은 저장하지 않는다(해시만)
            tokens = [row[0] for row in conn.execute("SELECT token_hash FROM sessions")]
            self.assertNotIn(other.split("=", 1)[1], tokens)
            self.assertTrue(all(len(token) == 64 for token in tokens))

    def test_ticket_limit(self):
        session = self.login()
        for _ in range(TICKET_LIMIT):
            self.assertEqual(self.request("POST", "/api/me/tickets", cookie=session, body=TICKET).status, 201)
        over = self.request("POST", "/api/me/tickets", cookie=session, body=TICKET)
        self.assertEqual((over.status, over.json["error"]["code"]), (409, "too_many"))

    def test_callback_rejects_missing_or_wrong_state_and_cancel(self):
        start = self.request("GET", "/api/auth/kakao/start")
        state_cookie = start.cookies[0].split(";")[0]
        for query, cookie, code in (
            ("code=who:1:a&state=forged", state_cookie, "state"),
            ("code=who:1:a&state=" + state_cookie.split(".", 1)[1], None, "state"),
            ("error=access_denied&state=" + state_cookie.split(".", 1)[1], state_cookie, "denied"),
            ("code=bad&state=" + state_cookie.split(".", 1)[1], state_cookie, "provider"),
        ):
            with self.subTest(query=query):
                done = self.request("GET", "/api/auth/kakao/callback?" + query, cookie=cookie)
                self.assertEqual(done.headers["Location"], f"/#login={code}")
                self.assertFalse(any(c.startswith("syung_session=") for c in done.cookies))
        # 다른 제공자의 state 쿠키로는 안 된다
        self.members.providers["google"] = FakeProvider("google")
        done = self.request("GET", "/api/auth/google/callback?code=who:1:a&state=" + state_cookie.split(".", 1)[1], cookie=state_cookie)
        self.assertEqual(done.headers["Location"], "/#login=state")

    def test_changing_requests_need_the_header(self):
        session = self.login()
        for method, path in (("POST", "/api/auth/logout"), ("DELETE", "/api/me"), ("POST", "/api/me/tickets"),
                             ("PUT", "/api/me/tickets/1"), ("DELETE", "/api/me/tickets/1")):
            with self.subTest(method=method, path=path):
                result = self.request(method, path, cookie=session, body=TICKET if path.startswith("/api/me/tickets") and method != "DELETE" else None, csrf=False)
                self.assertEqual(result.status, 403)
                self.assertEqual(result.json["error"]["code"], "forbidden")
        self.assertEqual(self.request("GET", "/api/me", cookie=session).status, 200, "막힌 요청은 아무것도 안 바꾼다")

    def test_bad_ticket_bodies(self):
        session = self.login()
        for body in (b"not json", [], dict(TICKET, name=""), dict(TICKET, name="가" * 13), {k: v for k, v in TICKET.items() if k != "from"},
                     dict(TICKET, to={"name": "집", "lat": 0, "lng": 0}), dict(TICKET, depart="8:10"), dict(TICKET, depart=None),
                     dict(TICKET, days=[0]), dict(TICKET, days=[True]), dict(TICKET, days="1,2"),
                     dict(TICKET, route="2호선"), dict(TICKET, route=dict(ROUTE, legs=[])),
                     dict(TICKET, route=dict(ROUTE, legs=ROUTE["legs"] * 5))):
            with self.subTest(body=body):
                result = self.request("POST", "/api/me/tickets", cookie=session, body=body)
                self.assertEqual(result.status, 400)
                self.assertEqual(result.json["error"]["code"], "bad_request")
        big = self.request("POST", "/api/me/tickets", cookie=session, body=b"{" + b" " * 20000 + b"}")
        self.assertEqual(big.status, 413)
        self.assertEqual(self.request("PUT", "/api/me/tickets/0", cookie=session, body=TICKET).status, 404, "번호 모양이 아니면 없는 주소")

    def test_unauthenticated_and_expired_sessions(self):
        self.assertEqual(self.request("GET", "/api/me").json, {"error": {"code": "login", "message": "로그인이 필요해요"}})
        self.assertEqual(self.request("GET", "/api/me/tickets", cookie="syung_session=made-up").status, 401)
        session = self.login()
        self.now = NOW + 30 * 24 * 3600
        self.assertEqual(self.request("GET", "/api/me", cookie=session).status, 401)

    def test_callback_attempts_are_limited_per_address(self):
        for _ in range(TRIES):
            self.request("GET", "/api/auth/kakao/callback?code=x&state=y", forwarded="198.51.100.9")
        self.assertEqual(self.request("GET", "/api/auth/kakao/callback?code=x&state=y", forwarded="198.51.100.9").headers["Location"],
                         "/#login=limit")
        self.login()   # 다른 주소는 그대로
        self.now = NOW + 600
        self.assertEqual(self.request("GET", "/api/auth/kakao/callback?code=x&state=y", forwarded="198.51.100.9").headers["Location"],
                         "/#login=state")

    def unlink(self, method="POST", *, key=ADMIN_KEY, fields=None, raw=None):
        """카카오 연결 해제 웹훅을 흉내 낸다(카카오 문서 예시와 같은 모양 — GET 은 쿼리, POST 는 폼). raw 는 POST 본문 그대로."""
        fields = {"app_id": "1234", "user_id": "42", "referrer_type": "UNLINK_FROM_APPS"} if fields is None else fields
        form = urllib.parse.urlencode(fields)
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        headers = {"Authorization": f"KakaoAK {key}"} if key is not None else {}
        path, body = "/api/auth/kakao/unlink", None
        if method == "GET":
            path += "?" + form
        else:
            body = (form.encode() if raw is None else raw)
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return SimpleNamespace(status=response.status, raw=data,
                               json=json.loads(data) if data and response.headers.get("Content-Type", "").startswith("application/json") else None)

    def test_kakao_unlink_needs_the_admin_key(self):
        self.assertEqual(self.unlink().status, 404, "KAKAO_ADMIN_KEY 가 없으면 받지 않는다")
        self.members.config.kakao_admin_key = ADMIN_KEY
        for key in (None, "", "other-key", ADMIN_KEY + "x"):
            result = self.unlink(key=key)
            self.assertEqual(result.status, 401)
            self.assertEqual(result.json, {"error": {"code": "unauthorized", "message": "카카오가 보낸 요청이 아니에요"}})
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        connection.request("POST", "/api/auth/kakao/unlink", body=b"user_id=42", headers={"Authorization": f"Bearer {ADMIN_KEY}"})
        self.assertEqual(connection.getresponse().status, 401, "KakaoAK 방식만 받는다")
        connection.close()
        self.members.config.kakao_app_id = "1234"
        self.assertEqual(self.unlink(fields={"app_id": "9999", "user_id": "42"}).status, 401, "앱 ID 를 주면 맞춰 본다")
        self.assertFalse(self.db.exists(), "키가 틀리면 DB 를 열지 않는다")

    def test_kakao_unlink_deletes_the_member_like_leaving(self):
        self.members.config.kakao_admin_key = ADMIN_KEY
        self.members.config.kakao_app_id = "1234"
        session = self.login(subject="42")
        self.assertEqual(self.request("POST", "/api/me/tickets", cookie=session, body=TICKET).status, 201)
        other = self.login(subject="77", name="준호")
        result = self.unlink()
        self.assertEqual((result.status, result.raw), (200, b""), "본문 없이 200(카카오 문서)")
        self.assertEqual(self.request("GET", "/api/me", cookie=session).status, 401, "세션도 지워진다")
        with contextlib.closing(sqlite3.connect(self.db)) as conn:
            for table in ("users", "identities", "sessions", "tickets"):
                self.assertEqual(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0 if table == "tickets" else 1, table)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM admin_log").fetchone()[0], 0, "관리 기록은 남기지 않는다")
            self.assertEqual(conn.execute("SELECT * FROM withdraw_stats").fetchall(), [("2027-01-15", "kakao_unlink", 1)],
                             "탈퇴 수만 하나 오른다(회원번호 · 닉네임 없음)")
        self.assertEqual(self.request("GET", "/api/me", cookie=other).json["name"], "준호", "다른 회원은 그대로")
        # 같은 알림이 다시 와도(재전송) · 없는 회원이어도 200 — GET 도 받는다
        self.assertEqual(self.unlink("GET").status, 200)
        self.assertEqual(self.unlink(fields={"app_id": "1234", "user_id": "999", "referrer_type": "ACCOUNT_DELETE"}).status, 200)
        with contextlib.closing(sqlite3.connect(self.db)) as conn:
            self.assertEqual(conn.execute("SELECT count FROM withdraw_stats").fetchall(), [(1,)], "다시 온 알림 · 없는 회원은 안 센다")
        # 다시 카카오로 들어오면 새 회원
        self.login(subject="42")
        self.assertEqual(self.last_location, "/#login=new")

    def test_kakao_unlink_only_touches_kakao_members(self):
        self.members.config.kakao_admin_key = ADMIN_KEY
        google = FakeProvider("google")
        self.members.providers["google"] = google
        start = self.request("GET", "/api/auth/google/start")
        state = urllib.parse.parse_qs(urllib.parse.urlsplit(start.headers["Location"]).query)["state"][0]
        done = self.request("GET", f"/api/auth/google/callback?code=who:42:g&state={state}", cookie=start.cookies[0].split(";")[0])
        session = next(c for c in done.cookies if c.startswith("syung_session=")).split(";")[0]
        self.assertEqual(self.unlink().status, 200)
        self.assertEqual(self.request("GET", "/api/me", cookie=session).status, 200, "구글 회원번호 42 는 카카오 42 와 다른 사람")

    def test_kakao_unlink_answers_503_when_the_db_is_missing(self):
        self.members.config.kakao_admin_key = ADMIN_KEY
        self.members.store = MemberStore(self.db.parent / "없는 폴더" / "members.sqlite3")
        result = self.unlink()
        self.assertEqual((result.status, result.json["error"]["code"]), (503, "unavailable"), "못 지웠으면 200 을 주지 않아 다시 받는다")

    def test_kakao_unlink_refuses_bad_member_numbers_and_methods(self):
        self.members.config.kakao_admin_key = ADMIN_KEY
        for subject in ("", "abc", "42\n", "４２", "1" * 21):
            self.assertEqual(self.unlink(fields={"app_id": "1234", "user_id": subject}).status, 400, subject)
        self.assertEqual(self.unlink(raw=b"").status, 413)
        self.assertEqual(self.unlink(raw=b"user_id=42&" + b"x" * 4096).status, 413)
        self.assertEqual(self.unlink("PUT").status, 405)
        # 회원 기능(로그인 제공자)이 꺼져 있어도 웹훅은 받는다 — 이미 가입한 사람은 지워야 한다
        self.members.providers = {}
        self.assertEqual(self.unlink().status, 200)

    def test_missing_db_folder_answers_503_without_details(self):
        self.members.store = MemberStore(self.db.parent / "없는 폴더" / "members.sqlite3")
        result = self.request("GET", "/api/me", cookie="syung_session=abc")
        self.assertEqual(result.status, 503)
        self.assertEqual(result.json, {"error": {"code": "unavailable", "message": "회원 기능을 잠시 쓸 수 없어요"}})

    def test_other_paths_are_untouched(self):
        self.assertEqual(self.request("GET", "/media").status, 404)
        self.assertEqual(self.request("PUT", "/live").status, 404)


class MemberStoreTest(unittest.TestCase):
    def test_new_file_is_owner_only_and_migrated(self):
        with tempfile.TemporaryDirectory() as folder:
            store = MemberStore(Path(folder) / "m.sqlite3")
            self.assertEqual(store.schema_version(), MIGRATIONS[-1][0])
            self.assertEqual(stat.S_IMODE(os.stat(store.path).st_mode), 0o600)
            # 다시 열어도 마이그레이션을 두 번 돌지 않는다
            again = MemberStore(store.path)
            self.assertEqual(again.schema_version(), MIGRATIONS[-1][0])
            self.assertEqual([number for number, _ in MIGRATIONS], list(range(1, len(MIGRATIONS) + 1)), "번호는 1부터 빈틈없이")


class ProviderTest(unittest.TestCase):
    def test_kakao_uses_member_number_and_nickname(self):
        calls = []

        def post(url, fields):
            calls.append((url, fields))
            return {"access_token": "access", "token_type": "bearer"}

        def get(url, token):
            calls.append((url, token))
            return {"id": 123456789, "kakao_account": {"profile": {"nickname": "  라이언 "}, "email": "x@example.com"}}
        kakao = login_providers.KakaoProvider("rest-key", "secret", post=post, get=get)
        url = urllib.parse.urlsplit(kakao.authorize_url("st", "https://syung.test/api/auth/kakao/callback"))
        self.assertEqual(url.netloc + url.path, "kauth.kakao.com/oauth/authorize")
        self.assertEqual(urllib.parse.parse_qs(url.query), {"response_type": ["code"], "client_id": ["rest-key"],
                                                            "redirect_uri": ["https://syung.test/api/auth/kakao/callback"], "state": ["st"]})
        self.assertEqual(kakao.identify("code", "https://syung.test/cb"), ("123456789", "라이언"))
        self.assertEqual(calls[0], ("https://kauth.kakao.com/oauth/token", {"grant_type": "authorization_code", "client_id": "rest-key",
                                    "redirect_uri": "https://syung.test/cb", "code": "code", "client_secret": "secret"}))
        self.assertEqual(calls[1], ("https://kapi.kakao.com/v2/user/me", "access"))
        no_name = login_providers.KakaoProvider("k", post=post, get=lambda url, token: {"id": 5})
        self.assertEqual(no_name.identify("c", "r"), ("5", "카카오 사용자"))
        with self.assertRaises(ProviderError):
            login_providers.KakaoProvider("k", post=post, get=lambda url, token: {"id": "5"}).identify("c", "r")

    def id_token(self, **claims):
        body = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
        return f"header.{body}.signature"

    def test_google_and_apple_read_sub_from_the_id_token(self):
        good = dict(iss="https://accounts.google.com", aud="gid", sub="g-1", exp=NOW + 60, name="Kim")
        google = login_providers.GoogleProvider("gid", "gsecret", post=lambda url, fields: {"id_token": self.id_token(**good)},
                                                clock=lambda: NOW)
        self.assertEqual(google.identify("c", "r"), ("g-1", "Kim"))
        self.assertIn("scope=openid+profile", google.authorize_url("s", "r"))
        for bad in (dict(good, aud="other"), dict(good, exp=NOW), dict(good, iss="https://evil.test"), dict(good, sub="")):
            with self.subTest(bad=bad), self.assertRaises(ProviderError):
                login_providers.GoogleProvider("gid", "s", post=lambda url, fields, bad=bad: {"id_token": self.id_token(**bad)},
                                               clock=lambda: NOW).identify("c", "r")
        apple = login_providers.AppleProvider("com.syung.web", "jwt", clock=lambda: NOW, post=lambda url, fields: {
            "id_token": self.id_token(iss="https://appleid.apple.com", aud="com.syung.web", sub="a.1", exp=NOW + 60)})
        self.assertEqual(apple.identify("c", "r"), ("a.1", "Apple 사용자"))
        self.assertIn("response_mode=query", apple.authorize_url("s", "r"))

    def test_only_fully_configured_providers_are_on(self):
        config = MemberConfig(kakao_client_id="k", google_client_id="g", apple_client_id="a", apple_client_secret="s")
        self.assertEqual(list(login_providers.providers_from_config(config)), ["kakao", "apple"])
        self.assertEqual(login_providers.providers_from_config(MemberConfig()), {})
        self.assertNotIn("k", repr(config), "키는 repr 에 안 나온다")


class CleanTicketTest(unittest.TestCase):
    def test_days_are_sorted_and_unique(self):
        self.assertEqual(clean_ticket(dict(TICKET, days=[5, 1, 1]))["days"], "1,5")
        self.assertEqual(clean_ticket(dict(TICKET, days=[]))["days"], "")

    def test_times_must_be_exactly_hh_mm_in_ascii(self):
        for value in ("08:10\n", "\n08:10", "０８:１０", "٠٨:١٠", "08:10 ", "8:10", "24:00"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                clean_ticket(dict(TICKET, depart=value))
        self.assertEqual(clean_ticket(dict(TICKET, depart="23:59"))["depart_at"], "23:59")


class CleanRouteTest(unittest.TestCase):
    def test_bad_routes_are_refused(self):
        ride, bus = ROUTE["legs"][1], ROUTE["legs"][2]
        for route in (dict(ROUTE, minutes=-1), dict(ROUTE, minutes=True), dict(ROUTE, arrives="8:41"), dict(ROUTE, tag=1),
                      dict(ROUTE, legs=[{"type": "plane"}]), dict(ROUTE, legs=[{"type": "walk", "seconds": "80"}]),
                      dict(ROUTE, legs=[dict(ride, line="")]), dict(ROUTE, legs=[dict(ride, departs="08:13\n")]),
                      dict(ROUTE, legs=[dict(ride, to="가" * 41)]), dict(ROUTE, legs=[dict(bus, color="red")]),
                      dict(ROUTE, legs=[dict(bus, color="#7bc0431")]), dict(ROUTE, legs=[dict(ride, wait=None)])):
            with self.subTest(route=route), self.assertRaises(ValueError):
                clean_ticket(dict(TICKET, route=route))

    def test_side_stop_and_exit_are_kept_and_checked(self):
        side = {"name": "청담역.경기고교", "metres": 60, "walkMinutes": 2, "exit": "11", "id": "122000084", "ars": "23187"}
        alt = {"route": "2415", "color": "#3d5bab", "departs": "08:55", "arrives": "08:57", "boardAt": side, "alightAt": {"name": "무역센터", "metres": 90}}
        legs = [dict(leg) for leg in ROUTE["legs"]]
        legs[2] = dict(legs[2], alternatives=[alt])
        saved = json.loads(clean_ticket(dict(TICKET, route=dict(ROUTE, legs=legs)))["route"])["legs"]
        self.assertEqual(saved[2]["alternatives"], [alt])
        self.assertEqual(saved[0]["exit"], "2-1")
        legs[2] = dict(legs[2], alternatives=[dict(alt, boardAt={"name": "x", "metres": "60"})])
        with self.assertRaises(ValueError):
            clean_ticket(dict(TICKET, route=dict(ROUTE, legs=legs)))

    def test_many_alternatives_are_kept_up_to_the_server_cap(self):
        # 서버가 12대까지 내려 주므로 승차권에도 그만큼 저장된다(3대 상한이면 저장이 실패했다)
        alts = [{"route": f"R{n}", "color": "#3d5bab", "departs": "08:55", "arrives": "08:57"} for n in range(12)]
        legs = [dict(leg) for leg in ROUTE["legs"]]
        legs[2] = dict(legs[2], alternatives=alts)
        saved = json.loads(clean_ticket(dict(TICKET, route=dict(ROUTE, legs=legs)))["route"])["legs"]
        self.assertEqual(saved[2]["alternatives"], alts)
        legs[2] = dict(legs[2], alternatives=alts + alts[:1])
        with self.assertRaises(ValueError):
            clean_ticket(dict(TICKET, route=dict(ROUTE, legs=legs)))

    def test_walk_only_route_and_no_route(self):
        walk = {"tag": "걸어가기", "leaveBy": "08:10", "arrives": "08:30", "minutes": 20, "transfers": 0, "walkMinutes": 20,
                "legs": [{"type": "walk", "seconds": 1200, "direct": True, "label": "목적지까지 걸어서"}]}
        self.assertEqual(json.loads(clean_ticket(dict(TICKET, route=walk))["route"])["legs"], [{"type": "walk", "seconds": 1200}])
        self.assertIsNone(clean_ticket(TICKET)["route"])
        self.assertIsNone(clean_ticket(dict(TICKET, route=None))["route"])


class CleanViaTest(unittest.TestCase):
    def test_via_is_a_place_or_nothing(self):
        saved = clean_ticket(dict(TICKET, via={"name": " 성수역 ", "lat": 37.5445812, "lng": 127.0559614}))
        self.assertEqual((saved["via_name"], saved["via_lat"], saved["via_lng"]), ("성수역", 37.544581, 127.055961))
        for body in (TICKET, dict(TICKET, via=None)):
            self.assertEqual([clean_ticket(body)[name] for name in ("via_name", "via_lat", "via_lng")], [None, None, None])
        for via in ("성수역", {}, {"name": "", "lat": 37.5, "lng": 127.0}, {"name": "성수", "lat": True, "lng": 127.0},
                    {"name": "성수", "lat": 37.5, "lng": 200}, {"name": "가" * 81, "lat": 37.5, "lng": 127.0}):
            with self.subTest(via=via), self.assertRaises(ValueError):
                clean_ticket(dict(TICKET, via=via))


class MigrationTest(unittest.TestCase):
    def test_version_seven_tickets_read_without_via(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "m.sqlite3"
            with contextlib.closing(sqlite3.connect(path, isolation_level=None)) as conn:
                conn.execute("CREATE TABLE schema_version (version INTEGER NOT NULL)")
                conn.execute("INSERT INTO schema_version VALUES (7)")
                for _number, sql in MIGRATIONS[:7]:
                    for statement in (part.strip() for part in sql.split(";")):
                        if statement and not statement.startswith(("INSERT INTO tickets", "DROP TABLE commute")):
                            conn.execute(statement)
                conn.execute("INSERT INTO users (id, display_name, created_at) VALUES (1, '옛 회원', 100)")
                conn.execute("INSERT INTO tickets (user_id, name, from_name, from_lat, from_lng, to_name, to_lat, to_lng, depart_at, days, "
                             "created_at, updated_at) VALUES (1, '출근', '집', 37.5, 127.0, '회사', 37.4, 127.1, '08:10', '1', 5, 5)")
            members = MemberService(MemberConfig(db_file=path), providers={})
            self.assertEqual(members.store.schema_version(), MIGRATIONS[-1][0])
            [ticket] = members.tickets(1)
            self.assertEqual((ticket["name"], ticket["route"], ticket["via"]), ("출근", None, None), "옛 승차권은 경유지 없이 그대로")

    def test_version_one_commute_rows_become_tickets(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "m.sqlite3"
            with contextlib.closing(sqlite3.connect(path)) as conn:
                conn.execute("CREATE TABLE schema_version (version INTEGER NOT NULL)")
                conn.execute("INSERT INTO schema_version VALUES (1)")
                for statement in (part.strip() for part in MIGRATIONS[0][1].split(";")):
                    if statement:
                        conn.execute(statement)
                conn.execute("INSERT INTO users VALUES (1, '민지', 0), (2, '준호', 0)")
                conn.execute("INSERT INTO commute VALUES (1, '집', 37.5, 127.0, '회사', 37.4, 127.1, '08:10', '18:30', '1,2,3', 5)")
                conn.execute("INSERT INTO commute VALUES (2, '집', 37.5, 127.0, NULL, NULL, NULL, '09:00', NULL, '', 6)")
                conn.commit()
            store = MemberStore(path)
            self.assertEqual(store.schema_version(), MIGRATIONS[-1][0])
            tickets = store.tickets(1)
            self.assertEqual([(t["name"], t["from_name"], t["to_name"], t["depart_at"], t["days"]) for t in tickets],
                             [("출근", "집", "회사", "08:10", "1,2,3"), ("퇴근", "회사", "집", "18:30", "1,2,3")])
            self.assertEqual(store.tickets(2), [], "장소가 빠진 줄은 옮기지 않는다")
            self.assertEqual([t["route"] for t in tickets], [None, None], "옮긴 승차권은 고른 경로가 없다")
            with contextlib.closing(sqlite3.connect(path)) as conn:
                self.assertIsNone(conn.execute("SELECT name FROM sqlite_master WHERE name='commute'").fetchone())


if __name__ == "__main__":
    unittest.main()
