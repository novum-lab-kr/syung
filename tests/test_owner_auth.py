"""임시 로그인 파일과 고정 시각으로 주인 인증·쿠키·리다이렉트의 기존 계약을 확인한다."""

import hashlib
import hmac
import json
import socket
import stat
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import call, patch

from server.config import AuthConfig
from server.routes import owner
from server.routes.http import Server, make_handler
from server.routes.response import Response
from server.services import owner_auth


NOW = 1_800_000_000.75
PASSWORD = "fixture password"
ADDRESS = "192.0.2.10"
COOKIE_ATTRIBUTES = "; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax"


class OwnerAuthTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="syung-auth-test-")
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "login.json"
        self.config = AuthConfig(auth_file=self.path)
        self.auth = owner_auth.OwnerAuth(self.config)
        self.now = NOW
        clock = patch.object(owner_auth.time, "time", side_effect=lambda: self.now)
        clock.start()
        self.addCleanup(clock.stop)
        self.auth.set_password("owner", PASSWORD)

    def login(self, *, user="owner", password=PASSWORD, nxt="/admin/learning", address=ADDRESS):
        form = urllib.parse.urlencode({"user": user, "password": password, "next": nxt}).encode()
        return owner.login(self.auth, form, address)

    def signed_token(self, *, user="owner", expires=None):
        cfg = json.loads(self.path.read_text(encoding="utf-8"))
        expires = str(expires if expires is not None else int(self.now) + 2592000)
        signature = hmac.new(cfg["secret"].encode(), f"{user}|{expires}".encode(), hashlib.sha256).hexdigest()
        return f"{user}.{expires}.{signature}"

    def test_correct_password_redirects_with_exact_cookie_attribute_order(self):
        result = self.login(nxt="/admin/learning/topic?x=1#part")
        token = self.signed_token()
        self.assertEqual(result, Response(303, "redirect", location="/admin/learning/topic?x=1#part",
                                          cookie="syung_owner=" + token + COOKIE_ATTRIBUTES))
        self.assertTrue(self.auth.valid_token(token))

    def test_wrong_password_redirects_with_original_error_and_quoted_next(self):
        result = self.login(password="wrong", nxt="/admin/learning?tab=a&b=1")
        self.assertEqual(result, Response(303, "redirect",
                                          location="/admin/login.html?e=1&next=%2Fadmin%2Flearning%3Ftab%3Da%26b%3D1"))
        self.assertIsNone(result.cookie)

    def test_eighth_failure_blocks_even_correct_password_until_window_expires(self):
        for attempt in range(1, 9):
            with self.subTest(attempt=attempt):
                error = "wait" if attempt == 8 else "1"
                self.assertEqual(self.login(password="wrong").location,
                                 f"/admin/login.html?e={error}&next=%2Fadmin%2Flearning")
        self.assertTrue(self.auth.blocked(ADDRESS))
        self.assertEqual(self.login().location, "/admin/login.html?e=wait&next=%2Fadmin%2Flearning")
        self.now = NOW + 599.999
        self.assertEqual(self.login().location, "/admin/login.html?e=wait&next=%2Fadmin%2Flearning")
        # 600초 경계에서는 과거 실패가 제외되며, 막힌 요청은 창을 연장하지 않는다.
        self.now = NOW + 600
        self.assertFalse(self.auth.blocked(ADDRESS))
        self.assertEqual(self.login().location, "/admin/learning")
        self.assertIsNotNone(self.login().cookie)

    def test_failure_history_is_per_address_and_service_instance(self):
        for _ in range(8):
            self.auth.check_password("owner", "wrong", ADDRESS)
        self.assertTrue(self.auth.blocked(ADDRESS))
        self.assertTrue(self.auth.check_password("owner", PASSWORD, "192.0.2.11"))
        other = owner_auth.OwnerAuth(self.config)
        self.assertFalse(other.blocked(ADDRESS))
        self.assertTrue(other.check_password("owner", PASSWORD, ADDRESS))

    def test_success_does_not_clear_previous_failures(self):
        for _ in range(7):
            self.login(password="wrong")
        self.assertEqual(self.login().location, "/admin/learning")
        self.assertEqual(self.login(password="wrong").location, "/admin/login.html?e=wait&next=%2Fadmin%2Flearning")

    def test_wrong_user_counts_as_failure_even_with_correct_password(self):
        self.assertEqual(self.login(user="another-owner").location, "/admin/login.html?e=1&next=%2Fadmin%2Flearning")
        self.assertFalse(self.auth.blocked(ADDRESS))
        self.assertEqual(len(self.auth._fails[ADDRESS]), 1)

    def test_non_ascii_user_counts_as_failure_instead_of_raising(self):
        self.assertEqual(self.login(user="주인").location, "/admin/login.html?e=1&next=%2Fadmin%2Flearning")
        self.assertEqual(len(self.auth._fails[ADDRESS]), 1)
        self.auth.set_password("주인", PASSWORD)
        self.assertEqual(self.login(user="주인").location, "/admin/learning")

    def test_failures_older_than_window_are_dropped(self):
        for index in range(50):
            self.login(password="wrong", address=f"198.51.100.{index}")
        self.auth.blocked("203.0.113.1")
        self.assertEqual(len(self.auth._fails), 50, "틀린 적 없는 주소는 키를 남기지 않는다")
        self.now += owner_auth.TRY_WINDOW
        self.login(password="wrong")
        self.assertEqual(list(self.auth._fails), [ADDRESS])
        self.assertFalse(self.auth.blocked("198.51.100.0"))
        self.assertEqual(list(self.auth._fails), [ADDRESS])

    def test_login_uses_first_form_value_and_defaults_next(self):
        form = urllib.parse.urlencode([
            ("user", "owner"), ("user", "wrong"), ("password", PASSWORD), ("password", "wrong"),
        ]).encode()
        result = owner.login(self.auth, form, ADDRESS)
        self.assertEqual(result.location, "/admin/learning")
        self.assertIsNotNone(result.cookie)
        self.assertEqual(owner.login(self.auth, b"", ADDRESS).location, "/admin/login.html?e=1&next=%2Fadmin%2Flearning")

    def test_login_restricts_next_for_success_and_failure(self):
        for nxt in ("//example.invalid/admin/learning", "/admin/learning//example", "/admin/learning\\other", "/outside"):
            with self.subTest(nxt=nxt):
                self.assertEqual(self.login(nxt=nxt).location, "/admin/learning")
                self.assertEqual(self.login(password="wrong", nxt=nxt).location,
                                 "/admin/login.html?e=1&next=%2Fadmin%2Flearning")

    def test_token_expires_at_exact_timestamp(self):
        token = self.auth.issue_token()
        expires = int(token.rsplit(".", 2)[1])
        self.assertEqual(expires, int(NOW) + 2592000)
        self.now = expires - 0.001
        self.assertTrue(self.auth.valid_token(token))
        self.now = expires
        self.assertFalse(self.auth.valid_token(token))
        self.now = expires + 1
        self.assertFalse(self.auth.valid_token(token))

    def test_token_rejects_changed_signature_and_other_user_with_valid_signature(self):
        token = self.auth.issue_token()
        changed = token[:-1] + ("0" if token[-1] != "0" else "1")
        self.assertFalse(self.auth.valid_token(changed))
        self.assertFalse(self.auth.valid_token(self.signed_token(user="another-owner")))
        self.assertFalse(self.auth.valid_token(self.signed_token(expires="not-a-number")))
        for value in (None, "", "owner", "owner.123", "owner.1.sig", token + ".extra"):
            with self.subTest(value=value):
                self.assertFalse(self.auth.valid_token(value))

    def test_username_with_dots_keeps_token_valid(self):
        self.auth.set_password("owner.with.dots", PASSWORD)
        result = self.login(user="owner.with.dots")
        token = owner.cookie_value(result.cookie)
        self.assertEqual(token, self.signed_token(user="owner.with.dots"))
        self.assertTrue(self.auth.valid_token(token))
        self.assertEqual(owner.auth(self.auth, result.cookie, "/admin/learning"), Response(204, "empty"))

    def test_cookie_header_uses_first_owner_value_even_if_empty_or_malformed(self):
        token = self.auth.issue_token()
        cases = (
            (None, None, False), ("", None, False), ("other=value", None, False),
            (f"other=x; syung_owner={token}; syung_owner=bad", token, True),
            (f"syung_owner=bad; syung_owner={token}", "bad", False),
            (f"syung_owner=; syung_owner={token}", "", False),
            (f"syung_owner; syung_owner={token}", "", False),
            (f"SYUNG_OWNER={token}", None, False),
            (f" syung_owner={token} ; other=x", token, True),
            (f"syung_owner= {token}", " " + token, False),
            (f"syung_owner={token}=extra", token + "=extra", False),
        )
        for header, expected, valid in cases:
            with self.subTest(header=header):
                self.assertEqual(owner.cookie_value(header), expected)
                self.assertEqual(owner.auth(self.auth, header, "/admin/learning").status, 204 if valid else 302)

    def test_auth_valid_cookie_returns_empty_204_even_for_json(self):
        cookie = "syung_owner=" + self.auth.issue_token()
        for uri in ("/admin/learning", "/admin/learning/data.json?x=1"):
            with self.subTest(uri=uri):
                self.assertEqual(owner.auth(self.auth, cookie, uri), Response(204, "empty"))

    def test_auth_json_checks_only_path_before_query(self):
        for uri in ("/admin/learning/data.json", "/admin/learning/data.json?x=1", "/outside.json?x=1"):
            with self.subTest(uri=uri):
                self.assertEqual(owner.auth(self.auth, None, uri),
                                 Response(401, body=b'{"ok":false,"error":"login"}'))
        for uri in ("/admin/learning?file=data.json", "/admin/learning/data.JSON", "/admin/learning/data.json/more"):
            with self.subTest(uri=uri):
                self.assertEqual(owner.auth(self.auth, None, uri),
                                 Response(302, "redirect", location="/admin/login.html?next=" + urllib.parse.quote(uri, safe="")))

    def test_auth_redirects_to_safe_next(self):
        for uri, expected in (("/admin/learning?tab=one", "%2Fadmin%2Flearning%3Ftab%3Done"),
                              ("//example.invalid/admin/learning", "%2Fadmin%2Flearning"),
                              ("/admin/learning//other", "%2Fadmin%2Flearning"),
                              ("/admin/learning\\other", "%2Fadmin%2Flearning"),
                              ("/outside", "%2Fadmin%2Flearning")):
            with self.subTest(uri=uri):
                self.assertEqual(owner.auth(self.auth, None, uri),
                                 Response(302, "redirect", location="/admin/login.html?next=" + expected))

    def test_safe_next_only_admin_pages(self):
        for path in ("/admin", "/admin?x=1", "/admin/learning", "/admin/learning/topic", "/admin/learning?tab=one", "/admin/debug"):
            with self.subTest(path=path):
                self.assertEqual(owner.safe_next(path), path)
        for path in ("", "learning", "/outside", "//admin/learning", "/admin/learning//x", "/admin/learning\\x",
                     "/learning", "/debug", "/administrator", "/admin.evil"):
            with self.subTest(path=path):
                self.assertEqual(owner.safe_next(path), "/admin/learning")

    def test_logout_clears_cookie_with_exact_attribute_order(self):
        self.assertEqual(owner.logout(), Response(303, "redirect", location="/admin/login.html",
                                                  cookie="syung_owner=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"))

    def test_missing_or_corrupt_file_rejects_login_and_tokens(self):
        token = self.auth.issue_token()
        self.path.unlink()
        for contents in (None, "{broken json"):
            with self.subTest(contents=contents):
                if contents is not None:
                    self.path.write_text(contents, encoding="utf-8")
                self.assertIsNone(self.auth.store.read())
                self.assertFalse(self.auth.valid_token(token))
                self.assertFalse(self.auth.check_password("owner", PASSWORD, ADDRESS))
                self.assertEqual(self.login().location, "/admin/login.html?e=1&next=%2Fadmin%2Flearning")
                self.assertFalse(self.auth.blocked(ADDRESS))
                with self.assertRaisesRegex(KeyError, "user"):
                    self.auth.issue_token()

    def test_set_password_writes_expected_file_mode_and_replaces_signing_secret(self):
        salt1, salt2 = bytes(range(16)), bytes(range(16, 32))
        with patch.object(owner_auth.secrets, "token_bytes", side_effect=[salt1, salt2]) as salts, \
                patch.object(owner_auth.secrets, "token_hex", side_effect=["11" * 32, "22" * 32]) as secrets:
            self.auth.set_password("new.owner", "first password")
            first = json.loads(self.path.read_text(encoding="utf-8"))
            self.assertEqual(first, {
                "user": "new.owner", "salt": salt1.hex(), "iterations": 240_000,
                "hash": hashlib.pbkdf2_hmac("sha256", b"first password", salt1, 240_000).hex(),
                "secret": "11" * 32,
            })
            self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
            token = self.auth.issue_token()
            self.auth.set_password("new.owner", "second password")
            second = json.loads(self.path.read_text(encoding="utf-8"))
            self.assertEqual(set(second), {"user", "salt", "hash", "iterations", "secret"})
            self.assertEqual(second["salt"], salt2.hex())
            self.assertEqual(second["secret"], "22" * 32)
            self.assertEqual(second["hash"], hashlib.pbkdf2_hmac("sha256", b"second password", salt2, 240_000).hex())
            self.assertEqual(second["iterations"], 240_000)
            self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
            self.assertFalse(self.path.with_suffix(".tmp").exists())
            self.assertFalse(self.auth.valid_token(token))
            self.assertFalse(self.auth.check_password("new.owner", "first password", ADDRESS))
            self.assertTrue(self.auth.check_password("new.owner", "second password", ADDRESS))
            self.assertEqual(salts.call_args_list, [call(16), call(16)])
            self.assertEqual(secrets.call_args_list, [call(32), call(32)])



class LoginRequestSizeTest(unittest.TestCase):
    """POST /login 의 Content-Length: 없거나 0 이하 · 숫자가 아니면 본문을 읽지 않고 413(요청 스레드가 묶이지 않게)."""
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="syung-auth-test-")
        self.addCleanup(directory.cleanup)
        self.auth = owner_auth.OwnerAuth(AuthConfig(auth_file=Path(directory.name) / "login.json"))
        self.auth.set_password("owner", PASSWORD)
        self.server = Server(("127.0.0.1", 0), make_handler(SimpleNamespace(auth=self.auth), 0))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def status(self, length):
        with socket.create_connection(self.server.server_address, timeout=2) as connection:
            connection.sendall(f"POST /login HTTP/1.1\r\nHost: x\r\nContent-Length: {length}\r\n\r\nuser=a".encode())
            return connection.recv(64).split()[1]   # 상태 코드만(문구는 Python 버전마다 다르다 — 3.13 Content Too Large · 3.12 이하 Request Entity Too Large)

    def test_bad_length_is_refused_without_reading(self):
        for length in ("-1", "0", "abc"):
            with self.subTest(length=length):
                self.assertEqual(self.status(length), b"413")
        self.assertEqual(self.auth._fails, {}, "읽지 않았으니 틀린 횟수로도 세지 않는다")
        self.assertEqual(self.status("6"), b"303")

if __name__ == "__main__":
    unittest.main()


class ClientAddressTest(unittest.TestCase):
    """로그인 한도의 열쇠 주소: 로컬 프록시 뒤에서만 X-Forwarded-For 를 믿는다."""

    def test_local_proxy_uses_forwarded_first(self):
        from email.message import Message
        from server.routes.http import client_address
        headers = Message()
        headers["X-Forwarded-For"] = "203.0.113.7, 10.0.0.1"
        self.assertEqual(client_address(headers, "127.0.0.1"), "203.0.113.7")
        self.assertEqual(client_address(headers, "::1"), "203.0.113.7")

    def test_remote_peer_ignores_forwarded(self):
        from email.message import Message
        from server.routes.http import client_address
        headers = Message()
        headers["X-Forwarded-For"] = "1.2.3.4"
        self.assertEqual(client_address(headers, "198.51.100.9"), "198.51.100.9")

    def test_local_without_header_uses_peer(self):
        from email.message import Message
        from server.routes.http import client_address
        self.assertEqual(client_address(Message(), "127.0.0.1"), "127.0.0.1")
