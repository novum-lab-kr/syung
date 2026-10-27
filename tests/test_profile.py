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
import time
import unittest
from unittest import mock
import urllib.parse
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from server.config import MemberConfig
import server.jobs.member_backup as member_backup
from server.jobs.member_backup import backup_all, backup_photos, prune
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


def vp8x(flags=0x00, width=256, height=256) -> bytes:
    return chunk(b"VP8X", bytes([flags, 0, 0, 0]) + (width - 1).to_bytes(3, "little") + (height - 1).to_bytes(3, "little"))


def webp(width=256, height=256) -> bytes:
    return riff(vp8(width, height))


def webp_lossless(width=256, height=256) -> bytes:
    bits = (width - 1) | ((height - 1) << 14)
    return riff(chunk(b"VP8L", b"\x2f" + bits.to_bytes(4, "little") + bytes(30)))


SCAN = b"\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00"


def jpeg(width=256, height=256, *, app1=False, tail=b"", scan=bytes(range(1, 200)), between=b"") -> bytes:
    parts = [b"\xff\xd8", b"\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"]
    if app1:   # 사진기가 넣는 Exif(위치 GPS 가 여기에 든다)
        exif = b"Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08" + b"GPS" * 10
        parts.append(b"\xff\xe1" + struct.pack(">H", len(exif) + 2) + exif)
    parts.append(b"\xff\xc0\x00\x11\x08" + struct.pack(">HH", height, width) + b"\x03\x01\x22\x00\x02\x11\x01\x03\x11\x01")
    parts.append(SCAN + scan + between + b"\xff\xd9")   # between: 두 번째 스캔 앞에 끼울 조각(+ SCAN …)
    return b"".join(parts) + tail


EXIF_SEGMENT = b"\xff\xe1\x00\x10Exif\x00\x00MMGPS!!"


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
        return sorted(path.name for path in self.photos.iterdir() if not path.name.startswith(".")) if self.photos.exists() else []

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
            "JPEG 스캔 사이 Exif": jpeg(between=EXIF_SEGMENT + SCAN + b"\x05\x06"),
            "JPEG EOI 뒤 Exif + EOI": jpeg(tail=EXIF_SEGMENT + b"\xff\xd9"),
            "JPEG SOF 없음": b"\xff\xd8" + SCAN + b"\x01\xff\xd9",
            "WebP 프레임 크기가 캔버스와 다름": riff(vp8x(), vp8(128, 128)),
            "WebP 그림 조각 없음": riff(vp8x()),
            "WebP 그림 조각 둘": riff(vp8x(), vp8(), vp8()),
            "WebP 단순형 뒤 조각": riff(vp8(), chunk(b"ICCP", bytes(4))),
            "WebP 알파 표시 없이 ALPH": riff(vp8x(), chunk(b"ALPH", bytes(5)), vp8()),
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
        self.assertEqual(check_photo(riff(vp8x(0x10), chunk(b"ALPH", bytes(5)), vp8())), "webp", "알파가 있는 손실 WebP")
        self.assertEqual(check_photo(riff(vp8x(), vp8())), "webp")
        self.assertEqual(check_photo(webp_lossless()), "webp")
        self.assertEqual(check_photo(jpeg(scan=b"\x01\xff\x00\x02\xff\xd0\x03\xff\xff\xd1\x04")), "jpg", "채움 · 재시작 마커는 스캔 자료")
        self.assertEqual(check_photo(jpeg(between=b"\xff\xc4\x00\x04\x00\x00" + SCAN + b"\x07")), "jpg", "여러 스캔(점진적 JPEG)")
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

    def test_cleanup_failures_never_remove_the_current_photo(self):
        session = self.login()
        first = self.upload(session, webp()).json["avatar"]["url"]

        def broken(name):
            raise OSError("디스크 오류")
        with mock.patch.object(self.members.avatars, "remove", broken):
            second = self.upload(session, jpeg(), "image/jpeg")
        self.assertEqual(second.status, 200, "앞 사진을 못 지워도 바꾸기는 성공")
        url = second.json["avatar"]["url"]
        self.assertEqual(self.request("GET", url, cookie=session).status, 200, "DB 가 가리키는 새 사진은 남는다")
        self.assertEqual(len(self.files()), 2, "못 지운 앞 사진은 나중 정리가 지운다")
        self.assertNotEqual(first, url)
        with mock.patch.object(self.members.store, "set_avatar", side_effect=sqlite3.OperationalError("locked")):
            self.assertEqual(self.upload(session, webp()).status, 503)
        self.assertEqual(len(self.files()), 2, "DB 를 못 바꾼 새 사진만 지운다")
        self.assertEqual(self.request("GET", url, cookie=session).status, 200)

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
                         [("avatar_view", 1, ""), ("avatar", 1, "부적절한 사진 신고"), ("name", 1, "부적절한 닉네임")],
                         "사진은 이유 없이 보되 볼 때마다 기록(올린 사진이 없을 때의 404 는 기록 안 함)")
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


class BackupSyncTest(unittest.TestCase):
    """백업이 DB 사본을 뜬 뒤 사진을 바꾸거나 탈퇴해도 그 사본이 가리키는 사진이 사진 백업에 들어간다."""
    def test_photos_of_the_db_copy_survive_a_change_during_backup(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        base = Path(temp.name)
        config = MemberConfig(db_file=base / "members.sqlite3")
        members = MemberService(config, providers={})
        keep_id = members.store.find_or_create_user("kakao", "1", "가", NOW)[0]
        leave_id = members.store.find_or_create_user("kakao", "2", "나", NOW)[0]
        keep_name = members.upload_photo(keep_id, webp())["avatar"]["url"].rsplit("/", 1)[1]
        leave_name = members.upload_photo(leave_id, jpeg())["avatar"]["url"].rsplit("/", 1)[1]
        real_backup = member_backup.backup
        changers = []

        def backup_then_change(*args, **kwargs):
            made = real_backup(*args, **kwargs)
            # 사본을 뜬 바로 뒤 서버가 사진을 바꾸고 다른 회원이 탈퇴한다(잠금 때문에 파일 지우기는 기다린다)
            for work in (lambda: members.reset_avatar(keep_id), lambda: members.delete(leave_id)):
                thread = threading.Thread(target=work)
                thread.start()
                changers.append(thread)
            time.sleep(0.3)
            return made
        with mock.patch.object(member_backup, "backup", backup_then_change):
            lines = backup_all(config, base / "backups", date(2026, 10, 27))
        for thread in changers:
            thread.join(5)
        self.assertTrue(any("사진 백업" in line for line in lines), lines)
        with tarfile.open(base / "backups" / "avatars-20261027.tar.gz") as tar:
            self.assertEqual(sorted(tar.getnames()), sorted([f"avatars/{keep_name}", f"avatars/{leave_name}"]))
        self.assertEqual(AvatarFiles(config.avatar_dir).names(), [], "백업이 끝나면 바뀐 · 탈퇴한 사진은 지워진다")
        self.assertFalse((config.avatar_dir / ".backup").exists(), "붙잡아 둔 폴더는 남기지 않는다")


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
