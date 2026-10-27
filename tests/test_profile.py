"""내 정보: 닉네임 · 프로필 사진 · 캐릭터(2026-10-27 결정 D1~D5). 임시 SQLite + 임시 사진 폴더 + 가짜 제공자로 HTTP 서버를 끝까지 돌린다.

사진은 서버가 디코드하지 않으므로(형식 · 크기 · 가로세로 · 구조만 본다) 시험 사진은 머리말만 맞춘 바이트로 만든다.
"""

import contextlib
import gzip
import http.client
import json
import os
import sqlite3
import stat
import struct
import tarfile
import tempfile
import threading
import unittest
import urllib.parse
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from server.config import MemberConfig
from server.jobs.member_backup import backup_photos, prune
from server.routes.http import Server, make_handler
from server.services.admin import AdminService
from server.services.members import MemberService
from server.services.profile import PHOTO_MAX_BYTES, PhotoError, check_photo, clean_name
from server.sources.oauth import ProviderError
from server.store.avatars import AvatarFiles

NOW = 1_800_000_000
ADMIN_KEY = "test-admin-key"   # 시험용 가짜 대표 어드민 키
OWNER = "good-token"           # 시험용 가짜 주인 쿠키


def chunk(kind: bytes, body: bytes) -> bytes:
    return kind + struct.pack("<I", len(body)) + body + (b"\0" if len(body) & 1 else b"")


def riff(*chunks: bytes) -> bytes:
    body = b"WEBP" + b"".join(chunks)
    return b"RIFF" + struct.pack("<I", len(body)) + body


def vp8(width=256, height=256) -> bytes:
    return chunk(b"VP8 ", b"\x10\x02\x00\x9d\x01\x2a" + struct.pack("<HH", width, height) + bytes(range(40)))


def vp8x(flags=0x10, width=256, height=256) -> bytes:
    return chunk(b"VP8X", bytes([flags, 0, 0, 0]) + (width - 1).to_bytes(3, "little") + (height - 1).to_bytes(3, "little"))


def webp(width=256, height=256) -> bytes:
    return riff(vp8(width, height))


def webp_lossless(width=256, height=256) -> bytes:
    bits = (width - 1) | ((height - 1) << 14)
    return riff(chunk(b"VP8L", b"\x2f" + bits.to_bytes(4, "little") + bytes(30)))


def jpeg(width=256, height=256, *, app1=False, tail=b"") -> bytes:
    parts = [b"\xff\xd8", b"\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"]
    if app1:   # 사진기가 넣는 Exif(위치 GPS 가 여기에 든다)
        exif = b"Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08" + b"GPS" * 10
        parts.append(b"\xff\xe1" + struct.pack(">H", len(exif) + 2) + exif)
    parts.append(b"\xff\xc0\x00\x11\x08" + struct.pack(">HH", height, width) + b"\x03\x01\x22\x00\x02\x11\x01\x03\x11\x01")
    parts.append(b"\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00" + bytes(range(1, 200)) + b"\xff\xd9")
    return b"".join(parts) + tail


class FakeProvider:
    """인가 코드 'who:<번호>:<이름>' 을 그 사람으로 읽는다."""
    def authorize_url(self, state, redirect_uri):
        return f"https://provider.test/authorize?state={state}"

    def identify(self, code, redirect_uri):
        if code == "bad":
            raise ProviderError("provider")
        _, subject, name = code.split(":")
        return subject, name


class ProfileHttpTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(prefix="syung-profile-test-")
        self.addCleanup(folder.cleanup)
        self.db = Path(folder.name) / "members.sqlite3"
        self.photos = Path(folder.name) / "avatars"
        self.now = NOW
        self.members = MemberService(MemberConfig(db_file=self.db, public_url="https://syung.test", kakao_admin_key=ADMIN_KEY),
                                     providers={"kakao": FakeProvider()}, clock=lambda: self.now)
        self.admin = AdminService(self.members.store, clock=lambda: self.now, started_at=NOW)
        services = SimpleNamespace(members=self.members, admin=self.admin,
                                   auth=SimpleNamespace(valid_token=lambda value: value == OWNER))
        self.server = Server(("127.0.0.1", 0), make_handler(services, 0))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, *, cookie=None, body=None, kind=None, csrf=True, extra=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        headers = dict(extra or {})
        if cookie:
            headers["Cookie"] = cookie
        if csrf:
            headers["X-Requested-With"] = "syung"
        data = None
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
            headers["Content-Type"] = kind or "application/json"
        connection.request(method, urllib.parse.quote(path, safe="/?=&%."), body=data, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        connection.close()
        is_json = response.headers.get("Content-Type", "").startswith("application/json")
        return SimpleNamespace(status=response.status, headers=response.headers, raw=raw, json=json.loads(raw) if raw and is_json else None)

    def login(self, subject="42", name="민지"):
        start = self.request("GET", "/api/auth/kakao/start")
        state_cookie = start.headers["Set-Cookie"].split(";")[0]
        state = urllib.parse.parse_qs(urllib.parse.urlsplit(start.headers["Location"]).query)["state"][0]
        done = self.request("GET", f"/api/auth/kakao/callback?code=who:{subject}:{urllib.parse.quote(name)}&state={state}",
                            cookie=state_cookie)
        session = next(value for key, value in done.headers.items() if key == "Set-Cookie" and value.startswith("syung_session="))
        return session.split(";")[0]

    def upload(self, session, data, kind="image/webp"):
        return self.request("PUT", "/api/me/avatar", cookie=session, body=data, kind=kind)

    def files(self):
        return sorted(path.name for path in self.photos.iterdir()) if self.photos.exists() else []

    def rows(self, sql, args=()):
        with contextlib.closing(sqlite3.connect(self.db)) as conn:
            return conn.execute(sql, args).fetchall()

    def owner(self, method, path, body=None):
        headers = {"Cookie": f"syung_owner={OWNER}"}
        return self.request(method, path, body=body, extra=headers)

    # ---- 닉네임 ----
    def test_rename_rules_and_login_again_keeps_the_new_name(self):
        session = self.login(name="카카오닉네임")
        renamed = self.request("PUT", "/api/me/profile", cookie=session, body={"name": "  슝​슝이　 ‮ "})
        self.assertEqual((renamed.status, renamed.json["name"]), (200, "슝슝이"), "앞뒤 공백 · 보이지 않는 글자를 지운다")
        for bad in ("", "   ", "ㅤ​", "가" * 13, 12, None):
            with self.subTest(name=bad):
                answer = self.request("PUT", "/api/me/profile", cookie=session, body={"name": bad})
                self.assertEqual((answer.status, answer.json["error"]["code"]), (400, "bad_request"))
        self.assertEqual(self.request("PUT", "/api/me/profile", cookie=session, body={"name": "가" * 12}).json["name"], "가" * 12)
        other = self.login(subject="77", name="준호")
        self.assertEqual(self.request("PUT", "/api/me/profile", cookie=other, body={"name": "가" * 12}).status, 200, "같은 이름 허용")
        # 다시 로그인해도 카카오 닉네임으로 덮어쓰지 않는다
        again = self.login(name="카카오닉네임")
        self.assertEqual(self.request("GET", "/api/me", cookie=again).json["name"], "가" * 12)
        self.assertEqual(self.request("PUT", "/api/me/profile", cookie=session, body={"name": "새"}, csrf=False).status, 403)
        self.assertEqual(self.request("PUT", "/api/me/profile", body={"name": "새"}).status, 401)

    def test_clean_name_unicode(self):
        self.assertEqual(clean_name("éclair"), "éclair", "NFC 로 맞춘다")
        self.assertEqual(clean_name("한\n\t글"), "한 글")
        self.assertEqual(clean_name("🚇슝"), "🚇슝")
        with self.assertRaises(ValueError):
            clean_name("ᅟᅠﾠ⠀")

    # ---- 사진 ----
    def test_upload_view_replace_and_reset_photo(self):
        session = self.login()
        first = self.upload(session, webp())
        self.assertEqual(first.status, 200)
        avatar = first.json["avatar"]
        self.assertEqual(avatar["type"], "photo")
        self.assertRegex(avatar["url"], r"^/api/me/avatar/[A-Za-z0-9_-]{32}\.webp$")
        self.assertEqual(stat.S_IMODE(self.photos.stat().st_mode), 0o700)
        self.assertEqual(len(self.files()), 1)
        self.assertEqual(stat.S_IMODE((self.photos / self.files()[0]).stat().st_mode), 0o600)
        self.assertEqual(self.request("GET", "/api/me", cookie=session).json["avatar"], avatar)

        shown = self.request("GET", avatar["url"], cookie=session)
        self.assertEqual((shown.status, shown.raw), (200, webp()))
        self.assertEqual(shown.headers["Content-Type"], "image/webp")
        self.assertEqual(shown.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(shown.headers["Cache-Control"], "private, max-age=31536000, immutable")
        self.assertIn("sandbox", shown.headers["Content-Security-Policy"])
        self.assertEqual(self.request("GET", avatar["url"]).status, 401, "로그인해야 본다")
        other = self.login(subject="77", name="준호")
        self.assertEqual(self.request("GET", avatar["url"], cookie=other).status, 404, "남의 사진은 안 준다")
        self.assertEqual(self.upload(other, jpeg(), "image/jpeg").json["avatar"]["url"][-4:], ".jpg")
        self.assertEqual(self.request("GET", self.request("GET", "/api/me", cookie=other).json["avatar"]["url"],
                                      cookie=other).headers["Content-Type"], "image/jpeg")

        second = self.upload(session, webp_lossless())
        self.assertEqual(second.status, 200)
        self.assertEqual(self.request("GET", avatar["url"], cookie=session).status, 404, "지난 사진 주소는 끝")
        self.assertEqual(len(self.files()), 2, "바꾸면 앞 사진 파일은 지운다(준호 사진 + 새 사진)")

        picked = self.request("PUT", "/api/me/avatar", cookie=session, body={"character": "seonbi"})
        self.assertEqual(picked.json["avatar"], {"type": "character", "id": "seonbi"})
        self.assertEqual(len(self.files()), 1, "캐릭터로 바꾸면 올린 사진 파일을 지운다")
        self.assertEqual(self.request("PUT", "/api/me/avatar", cookie=session, body={"character": "../x"}).status, 400)
        self.upload(session, webp())
        reset = self.request("DELETE", "/api/me/avatar", cookie=session)
        self.assertEqual((reset.status, reset.json["avatar"]), (200, None))
        self.assertEqual(len(self.files()), 1)

    def test_bad_photos_are_refused_and_nothing_is_kept(self):
        session = self.login()
        cases = {
            "PNG": b"\x89PNG\r\n\x1a\n" + bytes(100),
            "글자": b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
            "가로세로": webp(255, 256),
            "직사각": jpeg(256, 300),
            "JPEG Exif(GPS)": jpeg(app1=True),
            "JPEG 뒤에 붙인 파일": jpeg(tail=b"PK\x03\x04zip"),
            "WebP EXIF 조각": riff(vp8x(0x10), vp8(), chunk(b"EXIF", b"MM\x00\x2aGPS")),
            "WebP EXIF 표시": riff(vp8x(0x18), vp8()),
            "움직이는 WebP": riff(vp8x(0x12), chunk(b"ANIM", bytes(6))),
            "RIFF 크기 틀림": webp()[:-4],
            "빈 WebP": riff(),
        }
        for label, data in cases.items():
            with self.subTest(label):
                answer = self.upload(session, data, "image/jpeg" if data.startswith(b"\xff\xd8") else "image/webp")
                self.assertEqual((answer.status, answer.json["error"]["code"]), (400, "bad_request"))
        self.assertEqual(self.upload(session, webp(), "text/plain").status, 415)
        self.assertEqual(self.upload(session, b"\x00" * (PHOTO_MAX_BYTES + 1)).status, 413)
        self.assertEqual(self.request("PUT", "/api/me/avatar", cookie=session, body=webp(), kind="image/webp", csrf=False).status, 403)
        self.assertEqual(self.request("PUT", "/api/me/avatar", body=webp(), kind="image/webp").status, 401)
        self.assertEqual(self.files(), [], "받지 않은 사진은 파일로 남지 않는다")
        self.assertIsNone(self.request("GET", "/api/me", cookie=session).json["avatar"])
        self.assertEqual(check_photo(riff(vp8x(0x10), vp8())), "webp", "알파 표시만 있는 VP8X 는 받는다")
        with self.assertRaises(PhotoError):
            check_photo(b"")

    def test_photo_names_cannot_walk_out_of_the_folder(self):
        session = self.login()
        self.upload(session, webp())
        for path in ("/api/me/avatar/../members.sqlite3", "/api/me/avatar/%2e%2e%2fmembers.sqlite3", "/api/me/avatar/x.webp"):
            with self.subTest(path=path):
                self.assertEqual(self.request("GET", path, cookie=session).status, 404)
        files = AvatarFiles(self.photos)
        self.assertIsNone(files.read("../members.sqlite3"))
        self.assertFalse(files.remove("../members.sqlite3"))
        self.assertTrue(self.db.exists())

    # ---- 탈퇴 3경로 ----
    def test_leaving_removes_the_photo_file(self):
        session = self.login()
        self.upload(session, webp())
        stay = self.login(subject="77", name="준호")
        self.upload(stay, webp())
        self.assertEqual(len(self.files()), 2)
        self.assertEqual(self.request("DELETE", "/api/me", cookie=session).status, 204)
        self.assertEqual(len(self.files()), 1, "본인 탈퇴: 그 사람 사진만 지운다")

    def test_kakao_unlink_removes_the_photo_file(self):
        session = self.login(subject="42")
        self.upload(session, jpeg(), "image/jpeg")
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        connection.request("POST", "/api/auth/kakao/unlink", body=b"user_id=42&referrer_type=UNLINK_FROM_APPS",
                           headers={"Authorization": f"KakaoAK {ADMIN_KEY}", "Content-Type": "application/x-www-form-urlencoded"})
        self.assertEqual(connection.getresponse().status, 200)
        connection.close()
        self.assertEqual(self.files(), [])
        self.assertEqual(self.rows("SELECT count(*) FROM users"), [(0,)])

    def test_admin_delete_removes_the_photo_file(self):
        session = self.login()
        self.upload(session, webp())
        gone = self.owner("DELETE", "/admin/members/1", {"reason": "본인 요청(메일)", "confirm": "1"})
        self.assertEqual(gone.json, {"ok": True, "removed": {"identities": 1, "sessions": 1, "tickets": 0, "photo": 1}})
        self.assertEqual(self.files(), [])

    # ---- 관리자(D5) ----
    def test_admin_sees_and_takes_down_a_photo_and_resets_the_name(self):
        session = self.login(name="이상한이름")
        self.request("PUT", "/api/me/profile", cookie=session, body={"name": "고친이름"})
        self.assertIsNone(self.owner("GET", "/admin/members/1").json["avatar"])
        self.assertEqual(self.owner("GET", "/admin/members/1/avatar").status, 404)
        self.assertEqual(self.owner("POST", "/admin/members/1/avatar", {"reason": "신고"}).status, 400, "올린 사진이 없다")
        self.upload(session, webp())
        detail = self.owner("GET", "/admin/members/1").json
        self.assertEqual(detail["avatar"], {"type": "photo"}, "관리 상세에는 회원 쪽 사진 주소를 싣지 않는다")
        shown = self.owner("GET", "/admin/members/1/avatar")
        self.assertEqual((shown.status, shown.raw, shown.headers["Content-Type"]), (200, webp(), "image/webp"))
        self.assertEqual(self.request("GET", "/admin/members/1/avatar").status, 401, "주인 쿠키가 있어야 본다")

        self.assertEqual(self.owner("POST", "/admin/members/1/avatar", {"reason": " "}).status, 400, "이유가 있어야 한다")
        taken = self.owner("POST", "/admin/members/1/avatar", {"reason": "부적절한 사진 신고"})
        self.assertEqual((taken.status, taken.json), (200, {"ok": True}))
        self.assertEqual(self.files(), [])
        self.assertIsNone(self.request("GET", "/api/me", cookie=session).json["avatar"])

        self.assertEqual(self.owner("POST", "/admin/members/1/name", {}).status, 400)
        named = self.owner("POST", "/admin/members/1/name", {"reason": "부적절한 닉네임"})
        self.assertEqual(named.json, {"ok": True, "name": "카카오 사용자"})
        self.assertEqual(self.request("GET", "/api/me", cookie=session).json["name"], "카카오 사용자")
        self.assertEqual(self.rows("SELECT action, user_id, reason FROM admin_log ORDER BY id"),
                         [("avatar", 1, "부적절한 사진 신고"), ("name", 1, "부적절한 닉네임")])
        self.assertEqual(self.owner("POST", "/admin/members/9/name", {"reason": "x"}).status, 404)
        self.assertEqual(self.owner("GET", "/admin/members/1/avatar/x").status, 404)

    # ---- 주인 없는 사진 정리 ----
    def test_sweep_removes_only_old_unused_files(self):
        session = self.login()
        self.upload(session, webp())
        used = self.files()[0]
        files = AvatarFiles(self.photos)
        old = files.save(webp(), "webp")
        fresh = files.save(webp(), "webp")
        os.utime(self.photos / old, (NOW - 7200, NOW - 7200))
        os.utime(self.photos / fresh, (NOW - 60, NOW - 60))
        os.utime(self.photos / used, (NOW - 7200, NOW - 7200))
        self.assertEqual(self.members.sweep_photos(), [old])
        self.assertEqual(self.files(), sorted([used, fresh]))


class PhotoBackupTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name)
        self.dest = self.base / "backups"

    def test_photos_are_packed_owner_only_and_pruned_with_the_db_copies(self):
        files = AvatarFiles(self.base / "avatars")
        names = [files.save(webp(), "webp"), files.save(jpeg(), "jpg")]
        self.assertIsNone(backup_photos(files.folder, [], self.dest, date(2026, 10, 27)), "사진이 없으면 만들지 않는다")
        made = backup_photos(files.folder, files.names(), self.dest, date(2026, 10, 27))
        self.assertEqual(made.name, "avatars-20261027.tar.gz")
        self.assertEqual(stat.S_IMODE(made.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.dest.stat().st_mode), 0o700)
        with tarfile.open(made) as tar:
            self.assertEqual(sorted(tar.getnames()), sorted(f"avatars/{name}" for name in names))
            self.assertTrue(all(member.mode == 0o600 and member.uid == 0 for member in tar.getmembers()))
        (self.dest / "avatars-20261001.tar.gz").write_bytes(gzip.compress(b""))
        (self.dest / "members-20261001.sqlite3.gz").write_bytes(gzip.compress(b""))
        removed = sorted(path.name for path in prune(self.dest, date(2026, 10, 27)))
        self.assertEqual(removed, ["avatars-20261001.tar.gz", "members-20261001.sqlite3.gz"], "14일 지난 사본은 둘 다 지운다")
        self.assertTrue(made.exists())


if __name__ == "__main__":
    unittest.main()
