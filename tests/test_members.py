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
from server.services.members import MemberService, TRIES, clean_commute
from server.sources.oauth import ProviderError
from server.store.members import MIGRATIONS, MemberStore

NOW = 1_800_000_000


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
        self.assertEqual((done.status, done.headers["Location"]), (302, "/#login=ok"))
        session = next(c for c in done.cookies if c.startswith("syung_session="))
        return session.split(";")[0]

    def test_providers_list_and_disabled_service_hides_everything(self):
        self.assertEqual(self.request("GET", "/api/auth/providers").json, {"providers": ["kakao"]})
        self.members.providers = {}
        self.assertEqual(self.request("GET", "/auth/providers").json, {"providers": []})
        self.assertEqual(self.request("GET", "/api/me").status, 404)
        self.assertEqual(self.request("GET", "/api/auth/kakao/start").status, 404)
        self.assertFalse(self.db.exists(), "꺼져 있으면 DB 파일을 만들지 않는다")

    def test_start_sets_state_cookie_with_owner_cookie_attributes(self):
        start = self.request("GET", "/api/auth/kakao/start")
        self.assertTrue(start.headers["Location"].startswith("https://provider.test/authorize?"))
        self.assertIn("redirect_uri=https%3A%2F%2Fsyung.test%2Fapi%2Fauth%2Fkakao%2Fcallback", start.headers["Location"])
        self.assertRegex(start.cookies[0], r"^syung_login=kakao\.[\w-]+; Max-Age=600; Path=/api/auth/; HttpOnly; Secure; SameSite=Lax$")
        self.assertEqual(start.headers["Cache-Control"], "no-store")

    def test_signup_login_me_commute_logout_and_delete(self):
        session = self.login()
        self.assertEqual(self.provider.codes[-1][1], "https://syung.test/api/auth/kakao/callback")
        me = self.request("GET", "/api/me", cookie=session)
        self.assertEqual((me.status, me.json), (200, {"id": 1, "name": "민지", "provider": "kakao"}))
        self.assertEqual(me.headers["Cache-Control"], "no-store")
        # 같은 사람이 다시 로그인하면 같은 회원
        again = self.login(prefix="")   # Caddy 가 /api 를 뗀 주소
        self.assertEqual(self.request("GET", "/me", cookie=again).json["id"], 1)

        empty = self.request("GET", "/api/me/commute", cookie=session)
        self.assertEqual(empty.json, {"home": None, "work": None, "leave": None, "back": None, "days": []})
        setting = {"home": {"name": "우리 집", "lat": 37.5665, "lng": 126.978}, "work": {"name": "회사", "lat": 37.4979, "lng": 127.0276},
                   "leave": "08:10", "back": "18:30", "days": [5, 1, 2, 3, 4, 1]}
        saved = self.request("PUT", "/api/me/commute", cookie=session, body=setting)
        self.assertEqual(saved.status, 200)
        self.assertEqual(saved.json["days"], [1, 2, 3, 4, 5])
        self.assertEqual(self.request("GET", "/api/me/commute", cookie=session).json, saved.json)

        # 다른 사람은 남의 설정을 못 본다
        other = self.login(subject="77", name="준호")
        self.assertEqual(self.request("GET", "/api/me", cookie=other).json["id"], 2)
        self.assertEqual(self.request("GET", "/api/me/commute", cookie=other).json["home"], None)

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
            for table in ("identities", "sessions", "commute"):
                self.assertEqual(conn.execute(f"SELECT count(*) FROM {table} WHERE user_id=1").fetchone()[0], 0, table)
            self.assertEqual(conn.execute("SELECT count(*) FROM users").fetchone()[0], 1, "준호는 남는다")
            # 세션 쿠키 값은 저장하지 않는다(해시만)
            tokens = [row[0] for row in conn.execute("SELECT token_hash FROM sessions")]
            self.assertNotIn(other.split("=", 1)[1], tokens)
            self.assertTrue(all(len(token) == 64 for token in tokens))

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
        for method, path in (("POST", "/api/auth/logout"), ("DELETE", "/api/me"), ("PUT", "/api/me/commute")):
            with self.subTest(method=method):
                result = self.request(method, path, cookie=session, body={} if method == "PUT" else None, csrf=False)
                self.assertEqual(result.status, 403)
                self.assertEqual(result.json["error"]["code"], "forbidden")
        self.assertEqual(self.request("GET", "/api/me", cookie=session).status, 200, "막힌 요청은 아무것도 안 바꾼다")

    def test_bad_commute_bodies(self):
        session = self.login()
        for body in (b"not json", {"home": {"name": "", "lat": 37.5, "lng": 127}}, {"home": {"name": "집", "lat": 0, "lng": 0}},
                     {"leave": "8:10"}, {"back": "24:00"}, {"days": [0]}, {"days": [True]}, {"days": "1,2"}, []):
            with self.subTest(body=body):
                result = self.request("PUT", "/api/me/commute", cookie=session, body=body)
                self.assertEqual(result.status, 400)
                self.assertEqual(result.json["error"]["code"], "bad_request")
        big = self.request("PUT", "/api/me/commute", cookie=session, body=b"{" + b" " * 5000 + b"}")
        self.assertEqual(big.status, 413)

    def test_unauthenticated_and_expired_sessions(self):
        self.assertEqual(self.request("GET", "/api/me").json, {"error": {"code": "login", "message": "로그인이 필요해요"}})
        self.assertEqual(self.request("GET", "/api/me/commute", cookie="syung_session=made-up").status, 401)
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


class CleanCommuteTest(unittest.TestCase):
    def test_partial_setting_is_allowed(self):
        self.assertEqual(clean_commute({"leave": "07:05"})["leave_at"], "07:05")
        self.assertIsNone(clean_commute({})["home_name"])


if __name__ == "__main__":
    unittest.main()
