"""로컬 가짜 서버와 임시 origin으로 원격 배포·배포 확인을 검증한다."""

import json
import os
import signal
import shutil
import subprocess
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from test_deploy_release import DATA, ReleaseFixture, TOOLS as RELEASE_TOOLS


class LocalSite:
    """정적 파일은 임시 웹 링크에서 읽고 API는 지정한 응답만 돌려준다."""

    def __init__(self, web):
        self.web = web
        self.responses = {}
        self.requests = []
        self.holds = {}
        self.open_admin = False   # True 면 /admin/* 을 로그인 없이 내준다(Caddy 보호가 빠진 경우)
        site = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                path = urlsplit(self.path).path
                site.requests.append(self.path)
                if path in site.holds:
                    entered, resume = site.holds[path]
                    entered.set()
                    if not resume.wait(timeout=60):
                        self.send_error(504)
                        return
                if path in site.responses:
                    status, content_type, body = site.responses[path]
                elif path in ("/api/live", "/api/route"):
                    status, content_type, body = 200, "application/json", b'{"ok":true}'
                elif path.startswith("/api/"):
                    status, content_type, body = 404, "text/plain", b"no such API"
                elif path.startswith("/admin/") and path != "/admin/login.html" and not site.open_admin:
                    status, content_type, body = 302, "text/plain", b"owner only"
                else:
                    target = site.web / ("index.html" if path == "/" else path.lstrip("/"))
                    try:
                        body = target.read_bytes()
                        status = 200
                        content_type = "text/javascript" if path.endswith(".mjs") else "application/octet-stream"
                    except (OSError, ValueError):
                        status, content_type, body = 404, "text/plain", b"not found"
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.worker = threading.Thread(target=self.server.serve_forever,
                                       kwargs={"poll_interval": 0.01}, daemon=True)
        self.worker.start()
        self.base = "http://127.0.0.1:%d" % self.server.server_port

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=2)


@unittest.skipUnless(all(shutil.which(name) for name in (*RELEASE_TOOLS, "node", "curl")), "원격 배포 스크립트 도구가 필요합니다")
class RemoteFixture(ReleaseFixture):
    scripts = ("deploy.sh", "check_site.sh", "remote_deploy.sh", "install_backup_units.sh")

    def seed_repo(self):
        self.env.update({
            "SYUNG_CLONE": str(self.repo), "SYUNG_DEPLOY_LOG": str(self.base / "deploy.log"),
            "SYUNG_CHECK_RESOLVE": "", "SYUNG_CHECK_WAIT": "0",
        })
        # 주소 설정 실수가 생겨도 운영 주소로 요청이 나가지 않게 curl을 감싼다.
        real_curl = shutil.which("curl")
        self.command("curl", f"""
import os, sys
from urllib.parse import urlsplit
urls = [arg for arg in sys.argv[1:] if arg.startswith(('http://', 'https://'))]
expected = urlsplit(os.environ['SYUNG_CHECK_BASE'])
if len(urls) != 1 or '--resolve' in sys.argv or urlsplit(urls[0]).hostname != '127.0.0.1' or urlsplit(urls[0]).netloc != expected.netloc:
    raise SystemExit('임시 로컬 서버 외의 curl 호출은 금지')
os.execv({real_curl!r}, [{real_curl!r}] + sys.argv[1:])
""")
        self.write("server/subway_live_proxy.py", "VERSION = 1\n")
        self.write("server/subway-member-backup.service", "[Service]\nExecStart=backup v1\n")
        self.write("server/subway-member-backup.timer", "[Timer]\nOnCalendar=03:30\n")
        self.write("tests/tiny.test.mjs", "import test from 'node:test'; test('fixture', () => {});\n")
        self.write("tests/test_tiny.py", "import unittest\nclass Tiny(unittest.TestCase):\n    def test_ok(self):\n        self.assertTrue(True)\n")

    def restart_calls(self):
        return self.systemctl_log.read_text().splitlines() if self.systemctl_log.exists() else []

    def unit_calls(self):
        return self.unit_log.read_text().splitlines() if self.unit_log.exists() else []

    def start_site(self):
        self.site = LocalSite(self.web)
        self.addCleanup(self.site.close)
        self.env["SYUNG_CHECK_BASE"] = self.site.base

    def setup_origin(self):
        self.origin = self.base / "origin.git"
        self.producer = self.base / "producer"
        self.git("init", "--bare", "-q", "-b", "main", str(self.origin))
        self.git("remote", "add", "origin", str(self.origin))
        self.git("push", "-q", "-u", "origin", "main")
        self.git("clone", "-q", str(self.origin), str(self.producer))
        self.git("config", "user.name", "Deploy fixture", cwd=self.producer)
        self.git("config", "user.email", "fixture@example.invalid", cwd=self.producer)

    def candidate(self, changes):
        for path, content in changes.items():
            self.write(path, content, repo=self.producer)
        sha = self.commit("candidate", repo=self.producer)
        self.git("push", "-q", "origin", "main", cwd=self.producer)
        return sha

    def remote(self, check=True):
        return self.run_command(["bash", str(self.repo / "deploy/remote_deploy.sh")], check=check)

    def deployed(self):
        path = self.state / "deployed-commit"
        return path.read_text().strip() if path.exists() else None

    @staticmethod
    def stop_process(process):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
        process.communicate(timeout=3)


class SiteCheckTest(RemoteFixture):
    def setUp(self):
        super().setUp()
        self.adopt()
        self.deploy()
        self.start_site()

    def check_site(self, check=True):
        return self.run_command(["bash", str(self.repo / "deploy/check_site.sh"),
                                 str(self.web.resolve())], check=check)

    def test_checks_all_modules_data_and_legacy_links_but_skips_owner_pages(self):
        self.check_site()
        paths = {urlsplit(path).path for path in self.site.requests}
        self.assertIn("/", paths)
        self.assertIn("/city/new/deep/module.mjs", paths)
        self.assertIn("/gallery/picture.txt", paths)
        for name in DATA.values():
            self.assertIn("/" + name, paths)
        self.assertIn("/data/bus/routes.json", paths)
        self.assertIn("/live-timing.json", paths)
        self.assertIn("/api/route", paths)
        self.assertIn("/api/live", paths)
        self.assertNotIn("/admin/login.html", paths, "로그인 페이지는 syung.novum-lab.com/admin 으로 옮겨 가 보지 않는다")
        self.assertIn("/admin/learning.html", paths, "주인 페이지는 막혀 있는지만 본다")

    def test_admin_moved_to_intro_host_passes(self):
        # 관리 화면을 syung.novum-lab.com/admin 으로 옮긴 뒤(Caddy step5): map. 의 /admin/… 은 모두 301
        moved = (301, "text/plain", b"moved")
        self.site.responses["/admin/login.html"] = moved
        self.site.responses["/admin/learning.html"] = moved
        self.check_site()

    def test_owner_page_open_without_login_fails(self):
        self.site.open_admin = True   # Caddy 보호 없이 올라간 경우
        result = self.check_site(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("로그인 없이 열림", result.stdout)
        route = next(path for path in self.site.requests if path.startswith("/api/route?"))
        self.assertIn("from=", route)
        self.assertIn("&to=", route)

    def test_live_503_json_warns_and_passes(self):
        self.site.responses["/api/live"] = (503, "application/json; charset=utf-8", b'{"ok":false,"error":"fixture upstream"}')
        result = self.check_site()
        self.assertIn("경고", result.stdout)
        self.assertIn("503", result.stdout)

    def test_live_500_or_non_json_fails(self):
        for status, content_type, body in ((500, "application/json", b'{}'),
                                          (503, "text/html", b'<html>unavailable</html>'),
                                          (503, "application/json", b'not-json'),
                                          (200, "application/json", b'not-json')):
            with self.subTest(status=status, content_type=content_type, body=body):
                self.site.responses["/api/live"] = (status, content_type, body)
                self.assertNotEqual(self.check_site(check=False).returncode, 0)

    def test_route_503_or_non_json_fails(self):
        for status, body in ((503, b'{}'), (200, b'not-json')):
            with self.subTest(status=status):
                self.site.responses["/api/route"] = (status, "application/json", body)
                self.assertNotEqual(self.check_site(check=False).returncode, 0)

    def test_missing_nested_module_fails_check(self):
        self.site.responses["/city/new/deep/module.mjs"] = (404, "text/plain", b"missing")
        result = self.check_site(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("/city/new/deep/module.mjs", result.stdout)

    def test_error_bodies_do_not_expose_synthetic_key_in_warning_or_failure(self):
        marker = "fixture-key-never-real"
        for status in (503, 500):
            with self.subTest(status=status):
                body = json.dumps({"ok": False, "error": "https://api.invalid/" + marker}).encode()
                self.site.responses["/api/live"] = (status, "application/json", body)
                result = self.check_site(check=False)
                self.assertEqual(result.returncode, 0 if status == 503 else 1)
                self.assertIn(str(status), result.stdout)
                self.assertNotIn(marker, result.stdout)

    def test_missing_or_empty_release_directory_fails_before_http_requests(self):
        empty = self.base / "empty-release"
        empty.mkdir()
        for directory in (self.base / "missing-release", empty):
            with self.subTest(directory=directory.name):
                self.site.requests.clear()
                result = self.run_command(["bash", str(self.repo / "deploy/check_site.sh"),
                                           str(directory)], check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("실패", result.stdout)
                self.assertEqual(self.site.requests, [])


class RemoteDeployTest(RemoteFixture):
    def setUp(self):
        super().setUp()
        self.adopt()
        self.setup_origin()
        self.start_site()

    def test_failed_candidate_tests_preserve_head_link_history_and_record(self):
        self.remote()
        old_head = self.git("rev-parse", "HEAD")
        old_link, old_history, old_record = self.web.resolve(), self.history(), self.deployed()
        self.candidate({"server/subway_live_proxy.py": "VERSION = 2\n",
                        "tests/test_tiny.py": "import unittest\nclass Tiny(unittest.TestCase):\n    def test_fail(self):\n        self.fail('candidate failure')\n"})
        result = self.remote(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("tests failed", result.stdout)
        self.assertEqual(self.git("rev-parse", "HEAD"), old_head)
        self.assertEqual(self.web.resolve(), old_link)
        self.assertEqual(self.history(), old_history)
        self.assertEqual(self.deployed(), old_record)
        self.assertEqual(self.restart_calls(), ["restart subway-live"])

    def test_missing_record_restarts_once_then_same_commit_does_not(self):
        self.remote()
        self.assertEqual(self.deployed(), self.initial)
        self.assertEqual(self.restart_calls(), ["restart subway-live"])
        self.remote()
        self.assertEqual(self.deployed(), self.initial)
        self.assertEqual(self.restart_calls(), ["restart subway-live"])

    def test_deploy_tests_skipped_only_when_deploy_tooling_unchanged(self):
        skip = "배포 장치 시험은 건너뜀"
        self.assertNotIn(skip, self.remote().stdout)   # 성공 기록이 없으면 모두 돈다
        self.candidate({"web/index.html": "new web"})
        self.assertIn(skip, self.remote().stdout)
        self.candidate({"deploy/notes.txt": "deploy tooling changed\n"})
        self.assertNotIn(skip, self.remote().stdout)

    def test_only_server_changes_restart_after_successful_baseline(self):
        self.remote()
        web_sha = self.candidate({"web/index.html": "new web"})
        self.remote()
        self.assertEqual(self.deployed(), web_sha)
        self.assertEqual(self.restart_calls(), ["restart subway-live"])
        server_sha = self.candidate({"server/subway_live_proxy.py": "VERSION = 2\n"})
        self.remote()
        self.assertEqual(self.deployed(), server_sha)
        self.assertEqual(self.restart_calls(), ["restart subway-live"] * 2)
        self.assertEqual(self.git("rev-parse", "HEAD"), server_sha)

    def test_head_already_advanced_still_compares_last_successful_record(self):
        self.remote()
        old_link = self.web.resolve()
        target = self.candidate({"server/subway_live_proxy.py": "VERSION = 2\n"})
        self.git("fetch", "-q", "origin", "main")
        self.git("merge", "--ff-only", "-q", target)
        self.assertEqual(self.deployed(), self.initial)
        self.assertEqual(self.web.resolve(), old_link)
        self.remote()
        self.assertEqual(self.deployed(), target)
        self.assertEqual(self.restart_calls(), ["restart subway-live"] * 2)

    def test_unknown_record_restarts_and_replaces_record_on_success(self):
        (self.state / "deployed-commit").write_text("0" * 40 + "\n")
        self.remote()
        self.assertEqual(self.deployed(), self.initial)
        self.assertEqual(self.restart_calls(), ["restart subway-live"])

    def test_failed_health_check_rolls_back_static_and_keeps_record_for_retry(self):
        self.remote()
        old_link, old_history = self.web.resolve(), self.history()
        target = self.candidate({"server/subway_live_proxy.py": "VERSION = 2\n",
                                 "web/index.html": "bad release"})
        self.site.responses["/api/live"] = (500, "application/json", b'{"ok":false}')
        result = self.remote(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.web.resolve(), old_link)
        self.assertEqual(self.history(), old_history)
        self.assertEqual(self.deployed(), self.initial)
        self.assertEqual(self.git("rev-parse", "HEAD"), target)
        self.assertEqual(self.restart_calls(), ["restart subway-live"] * 2)
        del self.site.responses["/api/live"]
        self.remote()
        self.assertEqual(self.deployed(), target)
        self.assertEqual(self.restart_calls(), ["restart subway-live"] * 3)

    def test_failed_restart_rolls_back_before_health_check_and_keeps_record(self):
        self.remote()
        old_link = self.web.resolve()
        self.candidate({"server/subway_live_proxy.py": "VERSION = 2\n"})
        self.site.requests.clear()
        self.env["FIXTURE_SYSTEMCTL_FAIL"] = "1"
        result = self.remote(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.web.resolve(), old_link)
        self.assertEqual(self.deployed(), self.initial)
        self.assertEqual(self.site.requests, [])

    def test_live_503_json_is_success_and_updates_record(self):
        self.remote()
        target = self.candidate({"web/index.html": "new web"})
        self.site.responses["/api/live"] = (503, "application/json", b'{"ok":false}')
        result = self.remote()
        self.assertIn("경고", result.stdout)
        self.assertEqual(self.deployed(), target)
        self.assertEqual((self.web / "index.html").read_text(), "new web")
        self.assertEqual(self.restart_calls(), ["restart subway-live"])

    def test_backup_units_installed_once_then_only_when_changed(self):
        self.remote()
        installed = ["daemon-reload", "enable --now subway-member-backup.timer"]
        self.assertEqual(sorted(path.name for path in self.systemd.iterdir() if not path.name.startswith(".")),
                         ["subway-member-backup.service", "subway-member-backup.timer"])
        self.assertEqual((self.systemd / "subway-member-backup.service").read_text(), "[Service]\nExecStart=backup v1\n")
        self.assertEqual(self.unit_calls(), installed)
        self.candidate({"web/index.html": "new web"})
        self.remote()
        self.assertEqual(self.unit_calls(), installed)   # 같으면 다시 안 깐다
        self.candidate({"server/subway-member-backup.service": "[Service]\nExecStart=backup v2\n"})
        self.remote()
        self.assertEqual((self.systemd / "subway-member-backup.service").read_text(), "[Service]\nExecStart=backup v2\n")
        self.assertEqual(self.unit_calls(), installed * 2)

    def test_backup_unit_failure_warns_but_deploy_succeeds_and_retries(self):
        (self.systemd / "subway-retrain.timer").write_text("hand installed\n")   # 다른 유닛은 건드리지 않는다
        self.env["FIXTURE_UNIT_FAIL"] = "enable"
        result = self.remote()
        self.assertIn("경고: 회원 DB 백업 유닛 설치 실패", result.stdout)
        self.assertEqual(self.deployed(), self.initial)
        self.assertEqual(self.restart_calls(), ["restart subway-live"])
        del self.env["FIXTURE_UNIT_FAIL"]
        self.remote()   # 파일은 같아도 지난 설치가 안 끝났으면 다시 한다
        self.assertEqual(self.unit_calls()[-2:], ["daemon-reload", "enable --now subway-member-backup.timer"])
        self.assertFalse((self.state / "backup-units-pending").exists())
        self.assertEqual((self.systemd / "subway-retrain.timer").read_text(), "hand installed\n")

    def test_install_step_brought_by_this_deploy_runs_in_this_deploy(self):
        # remote_deploy.sh 는 bash 가 처음 연 옛 내용을 끝까지 돈다(#15 배포에서 설치가 빠짐) — 설치 파일은 merge 뒤에 불러 새 내용으로 돈다
        self.remote()
        script = (self.repo / "deploy/install_backup_units.sh").read_text()
        self.candidate({"deploy/install_backup_units.sh": script + 'echo "새 설치 단계"\n'})
        (self.state / "backup-units-pending").touch()   # 설치가 돌게
        self.assertIn("새 설치 단계", self.remote().stdout)

    def test_failed_reload_after_copy_retries_next_deploy(self):
        self.remote()   # 한 번 깔리고 켜진 뒤
        self.candidate({"server/subway-member-backup.timer": "[Timer]\nOnCalendar=03:40\n"})
        self.env["FIXTURE_UNIT_FAIL"] = "reload"
        self.assertIn("경고: 회원 DB 백업 유닛 설치 실패", self.remote().stdout)
        self.assertEqual((self.systemd / "subway-member-backup.timer").read_text(), "[Timer]\nOnCalendar=03:40\n")   # 복사는 됐고
        self.assertTrue((self.state / "backup-units-pending").exists())   # 타이머는 그대로 enabled 지만 재시도 표시가 남는다
        del self.env["FIXTURE_UNIT_FAIL"]
        calls = len(self.unit_calls())
        self.remote()
        self.assertEqual(self.unit_calls()[calls:], ["daemon-reload", "enable --now subway-member-backup.timer"])
        self.assertFalse((self.state / "backup-units-pending").exists())
        self.remote()
        self.assertEqual(len(self.unit_calls()), calls + 2)   # 다 끝난 뒤에는 다시 안 한다

    def test_enabled_but_not_started_timer_retries_next_deploy(self):
        self.env["FIXTURE_UNIT_FAIL"] = "start"
        self.assertIn("경고: 회원 DB 백업 유닛 설치 실패", self.remote().stdout)
        self.assertTrue((self.systemd / ".enabled").exists())
        self.assertFalse((self.systemd / ".active").exists())
        del self.env["FIXTURE_UNIT_FAIL"]
        (self.state / "backup-units-pending").unlink()   # 표시가 없어도 enabled · active 가 아니면 다시 한다
        self.remote()
        self.assertEqual(self.unit_calls()[-2:], ["daemon-reload", "enable --now subway-member-backup.timer"])
        self.assertTrue((self.systemd / ".active").exists())

    def test_local_tracked_edits_refuse_deployment_before_tests(self):
        old_link, old_history = self.web.resolve(), self.history()
        self.write("web/index.html", "local tracked edit")
        result = self.remote(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("local uncommitted changes", result.stdout)
        self.assertEqual(self.git("rev-parse", "HEAD"), self.initial)
        self.assertEqual(self.web.resolve(), old_link)
        self.assertEqual(self.history(), old_history)
        self.assertIsNone(self.deployed())
        self.assertEqual(self.restart_calls(), [])

    def test_head_ahead_of_candidate_refuses_without_changing_deployment(self):
        self.remote()
        self.write("server/subway_live_proxy.py", "VERSION = 999\n")
        local_sha = self.commit("local commit outside origin")
        old_link, old_history, old_record = self.web.resolve(), self.history(), self.deployed()
        self.site.requests.clear()
        result = self.remote(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not deploying", result.stdout)
        self.assertEqual(self.git("rev-parse", "HEAD"), local_sha)
        self.assertEqual(self.web.resolve(), old_link)
        self.assertEqual(self.history(), old_history)
        self.assertEqual(self.deployed(), old_record)
        self.assertEqual(self.restart_calls(), ["restart subway-live"])
        self.assertEqual(self.site.requests, [])

    def test_api_error_synthetic_key_is_absent_from_remote_deploy_log(self):
        marker = "fixture-key-never-real"
        body = json.dumps({"ok": False, "error": "https://api.invalid/" + marker}).encode()
        self.site.responses["/api/live"] = (503, "application/json", body)
        result = self.remote()
        self.assertIn("경고", result.stdout)
        self.assertNotIn(marker, result.stdout)
        self.assertNotIn(marker, (self.base / "deploy.log").read_text())

    def test_manual_rollback_waits_until_remote_finishes_health_check(self):
        self.remote()
        old_link = self.web.resolve()
        self.candidate({"web/index.html": "new web while remote holds lock"})
        entered, resume = threading.Event(), threading.Event()
        self.site.holds["/api/route"] = (entered, resume)
        marker = self.base / "manual-flock-entered"
        real_flock = shutil.which("flock")
        self.command("flock", f"""
import os, sys
from pathlib import Path
if sys.argv[1:] == ['9']:
    Path({str(marker)!r}).touch()
os.execv({real_flock!r}, [{real_flock!r}] + sys.argv[1:])
""")
        remote = subprocess.Popen(["bash", str(self.repo / "deploy/remote_deploy.sh")],
                                  cwd=self.repo, env=self.env, text=True, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, start_new_session=True)
        self.addCleanup(self.stop_process, remote)
        self.addCleanup(resume.set)
        try:
            self.assertTrue(entered.wait(timeout=30), "remote가 건강 확인에 도달하지 못했습니다")   # 서버가 CPU 제한으로 느려도(2026-10-11 5초를 못 맞춤) 넉넉히
            new_link = self.web.resolve()
            self.assertNotEqual(new_link, old_link)
            manual = subprocess.Popen(["bash", str(self.repo / "deploy/deploy.sh"), "--rollback"],
                                      cwd=self.repo, env=self.env, text=True, stdout=subprocess.PIPE,
                                      stderr=subprocess.STDOUT, start_new_session=True)
            self.addCleanup(self.stop_process, manual)
            deadline = time.monotonic() + 5
            while not marker.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(marker.exists(), "수동 되돌리기가 잠금 단계에 도달하지 못했습니다")
            with self.assertRaises(subprocess.TimeoutExpired):
                manual.communicate(timeout=0.15)
            self.assertEqual(self.web.resolve(), new_link)
        finally:
            resume.set()
        remote_output, _ = remote.communicate(timeout=60)
        manual_output, _ = manual.communicate(timeout=30)
        self.assertEqual(remote.returncode, 0, remote_output)
        self.assertEqual(manual.returncode, 0, manual_output)
        self.assertEqual(self.web.resolve(), old_link)



class WebDistDeployTest(RemoteFixture):
    """웹 빌드가 있는 커밋(vite.config.mts): CI 가 web-dist 브랜치에 올린 빌드 결과를 배포한다(서버는 빌드하지 않는다)."""
    scripts = RemoteFixture.scripts + ("publish_web_dist.sh",)

    def setUp(self):
        super().setUp()
        self.adopt()
        self.setup_origin()
        self.start_site()

    def publish(self, files):
        """CI build 잡 흉내: producer 의 HEAD 를 '빌드'한 dist/web 을 web-dist 에 올린다."""
        dist = self.producer / "dist"
        for path, content in files.items():
            self.write("dist/web/" + path, content, repo=self.producer)
        try:
            self.run_command(["bash", str(self.producer / "deploy/publish_web_dist.sh")], cwd=self.producer)
        finally:
            shutil.rmtree(dist)
        return self.git("rev-parse", "refs/heads/web-dist", cwd=self.origin)

    def built_candidate(self, index):
        return self.candidate({"vite.config.mts": "// fixture build\n", "web/index.html": "source " + index})

    def test_built_commit_deploys_web_dist_and_data_from_the_commit(self):
        sha = self.built_candidate("one")
        dist = self.publish({"index.html": "built one", "maplibre_runtime.mjs": "export const built = 1;\n",
                             "admin/login.html": "login page"})
        self.assertEqual(self.git("log", "-1", "--format=%s", dist, cwd=self.origin), "web-dist " + sha)
        self.assertEqual(self.git("ls-tree", "-r", "--name-only", dist, cwd=self.origin).splitlines(),
                         ["web/admin/login.html", "web/index.html", "web/maplibre_runtime.mjs"])
        result = self.remote()
        self.assertIn("빌드 결과", result.stdout)
        self.assertEqual(self.deployed(), sha)
        self.assertEqual((self.web / "index.html").read_text(), "built one")
        self.assertFalse((self.web / "city/new/deep/module.mjs").exists(), "소스 web/ 은 섞이지 않는다")
        for source, published in DATA.items():
            self.assertEqual((self.web / published).read_text(), "committed:" + source)

    def test_publish_chains_on_previous_build(self):
        self.built_candidate("one")
        first = self.publish({"index.html": "built one"})
        self.built_candidate("two")
        second = self.publish({"index.html": "built two"})
        self.assertEqual(self.git("rev-parse", second + "^", cwd=self.origin), first)

    def test_built_commit_without_build_is_not_deployed(self):
        self.remote()
        old_link, old_history, old_record = self.web.resolve(), self.history(), self.deployed()
        self.built_candidate("one")
        result = self.remote(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("빌드 결과 없음", result.stdout)
        self.assertEqual(self.web.resolve(), old_link)
        self.assertEqual(self.history(), old_history)
        self.assertEqual(self.deployed(), old_record)

    def test_main_ahead_of_build_deploys_last_built_commit_then_the_next(self):
        first = self.built_candidate("one")
        self.publish({"index.html": "built one"})
        second = self.built_candidate("two")   # CI 가 아직 빌드 중
        result = self.remote()
        self.assertIn("빌드 전", result.stdout)
        self.assertEqual(self.deployed(), first)
        self.assertEqual((self.web / "index.html").read_text(), "built one")
        self.publish({"index.html": "built two"})
        self.remote()
        self.assertEqual(self.deployed(), second)
        self.assertEqual((self.web / "index.html").read_text(), "built two")

    def test_commit_before_build_era_still_deploys_source_web(self):
        self.publish({"index.html": "unrelated build"})   # web-dist 가 있어도 빌드 없는 커밋은 소스 web/
        self.remote()
        self.assertEqual(self.deployed(), self.initial)
        self.assertEqual((self.web / "index.html").read_text(), "committed index")


if __name__ == "__main__":
    unittest.main()
