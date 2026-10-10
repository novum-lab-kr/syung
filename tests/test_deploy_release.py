"""deploy.sh만 사용해 임시 저장소의 릴리스·최초 전환·되돌리기를 확인한다."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
DATA = {
    "data/osm-tracks/track_shapes.json": "track_shapes.json",
    "data/osm-tracks/exits.json": "exits.json",
    "data/ktdb-gtfs-2025/edge_times.json": "edge_times.json",
    "data/osm-tracks/coaster_buildings.bin": "coaster_buildings.bin",
    "data/osm-tracks/coaster_towers.json": "coaster_towers.json",
}
LEGACY = ("gallery", "webgl.html", "subway-utilization-case.png",
          "subwayStationMaster_tdata.csv", "verification_report.md")
TOOLS = ("git", "bash", "flock", "tar", "date", "mv")


@unittest.skipUnless(all(shutil.which(name) for name in TOOLS), "배포 스크립트 도구가 필요합니다")
class ReleaseFixture(unittest.TestCase):
    scripts = ("deploy.sh",)

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="syung-deploy-test-")
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.repo = self.base / "repo"
        self.web = self.base / "www" / "syung"
        self.releases = self.base / "releases"
        self.keep = self.base / "keep"
        self.state = self.base / "state"
        self.bin = self.base / "bin"
        self.systemctl_log = self.base / "systemctl.log"
        for folder in (self.repo, self.web, self.state, self.bin, self.base / "tmp"):
            folder.mkdir(parents=True)
        self.env = {key: value for key, value in os.environ.items()
                    if not key.startswith("SYUNG_") and key.lower() not in
                    ("http_proxy", "https_proxy", "all_proxy", "no_proxy")
                    and not key.startswith("GIT_")}
        self.env.update({
            "SYUNG_WEB": str(self.web),
            "SYUNG_RELEASES": str(self.releases), "SYUNG_KEEP_DIR": str(self.keep),
            "SYUNG_STATE": str(self.state), "SYUNG_KEEP_COUNT": "5",
            "TMPDIR": str(self.base / "tmp"), "PYTHONDONTWRITEBYTECODE": "1",
            "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
            "FIXTURE_SYSTEMCTL_LOG": str(self.systemctl_log),
            "PATH": str(self.bin) + os.pathsep + os.environ.get("PATH", os.defpath),
            "LC_ALL": "C.UTF-8",
        })
        self.command("systemctl", """
import os, sys
if sys.argv[1:] != ['restart', 'subway-live']:
    raise SystemExit('허용하지 않은 가짜 systemctl 호출')
with open(os.environ['FIXTURE_SYSTEMCTL_LOG'], 'a') as log:
    log.write('restart subway-live\\n')
raise SystemExit(int(os.environ.get('FIXTURE_SYSTEMCTL_FAIL', '0')))
""")
        real_date = shutil.which("date")
        self.command("date", f"""
import os, sys
if sys.argv[1:] == ['-u', '+%Y%m%dT%H%M%SZ']:
    print('20261010T120000Z')
else:
    os.execv({real_date!r}, [{real_date!r}] + sys.argv[1:])
""")
        (self.repo / "deploy").mkdir()
        for name in self.scripts:
            shutil.copy2(ROOT / "deploy" / name, self.repo / "deploy" / name)
            (self.repo / "deploy" / name).chmod(0o755)
        self.write("web/index.html", "committed index")
        self.write("web/learning.html", "owner page")
        self.write("web/login.html", "login page")
        self.write("web/maplibre_runtime.mjs", "export const fixture = true;\n")
        self.write("web/city/new/deep/module.mjs", "export const city = true;\n")
        for source in DATA:
            self.write(source, "committed:" + source)
        self.write("data/live-timing.json", '{"source":"commit"}')
        for name in ("routes", "stops", "manifest"):
            self.write("data/bus/" + name + ".json", json.dumps({"file": name}))
        self.seed_repo()
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Deploy fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        self.initial = self.commit("initial")
        (self.web / "index.html").write_text("old index", encoding="utf-8")
        (self.web / "learning.json").write_text('{"learned":1}', encoding="utf-8")
        for name in LEGACY:
            target = self.web / name
            if name == "gallery":
                target.mkdir()
                (target / "picture.txt").write_text("old gallery", encoding="utf-8")
            else:
                target.write_text("old:" + name, encoding="utf-8")
        (self.web / "do-not-carry.mjs").write_text("unlisted old file", encoding="utf-8")

    def command(self, name, source):
        target = self.bin / name
        target.write_text("#!" + sys.executable + "\n" + source.lstrip(), encoding="utf-8")
        target.chmod(0o755)

    def run_command(self, args, *, cwd=None, check=True, env=None):
        result = subprocess.run(args, cwd=cwd or self.repo, env=env or self.env,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                timeout=20)
        if check:
            self.assertEqual(result.returncode, 0, result.stdout)
        return result

    def git(self, *args, cwd=None):
        return self.run_command(["git", *args], cwd=cwd).stdout.strip()

    def write(self, path, content, *, repo=None):
        target = (repo or self.repo) / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def commit(self, message, *, repo=None):
        self.git("add", ".", cwd=repo)
        self.git("commit", "-q", "-m", message, cwd=repo)
        return self.git("rev-parse", "HEAD", cwd=repo)

    def deploy(self, *args, check=True):
        return self.run_command(["bash", str(self.repo / "deploy/deploy.sh"), *args], check=check)

    def adopt(self):
        self.deploy("--adopt")
        return self.web.resolve()

    def history(self):
        return (self.releases / ".history").read_text(encoding="utf-8").splitlines()

    def seed_repo(self):
        """원격 배포 테스트가 필요한 작은 서버·테스트 파일을 더한다."""
        pass


class StaticDeployTest(ReleaseFixture):
    def test_archive_uses_committed_files_and_includes_new_subdirectories(self):
        self.adopt()
        self.write("web/index.html", "uncommitted tracked edit")
        self.write("web/lib/untracked.mjs", "untracked")
        self.write("web/city/new/untracked.txt", "untracked")
        self.deploy(self.initial)
        self.assertEqual((self.web / "index.html").read_text(), "committed index")
        self.assertTrue((self.web / "city/new/deep/module.mjs").is_file())
        self.assertFalse((self.web / "lib/untracked.mjs").exists())
        self.assertFalse((self.web / "city/new/untracked.txt").exists())
        self.assertFalse((self.web / "do-not-carry.mjs").exists())

    def test_data_bus_learning_and_repository_timing_are_published(self):
        self.adopt()
        self.deploy()
        for source, published in DATA.items():
            self.assertEqual((self.web / published).read_text(), "committed:" + source)
        for name in ("routes", "stops", "manifest"):
            self.assertEqual(json.loads((self.web / "data/bus" / (name + ".json")).read_text()), {"file": name})
        self.assertEqual(json.loads((self.web / "live-timing.json").read_text()), {"source": "commit"})
        self.assertEqual(json.loads((self.web / "learning.json").read_text()), {"learned": 1})
        self.assertFalse((self.web / "osm-tracks").exists())

    def test_state_timing_wins_and_learning_is_carried_from_current_release(self):
        self.adopt()
        (self.state / "live-timing.json").write_text('{"source":"state"}')
        self.deploy()
        (self.web / "learning.json").write_text('{"learned":2}')
        self.deploy()
        self.assertEqual(json.loads((self.web / "live-timing.json").read_text()), {"source": "state"})
        self.assertEqual(json.loads((self.web / "learning.json").read_text()), {"learned": 2})

    def test_optional_bus_data_can_be_absent(self):
        self.git("rm", "-qr", "data/bus")
        sha = self.commit("without bus catalog")
        self.adopt()
        self.deploy(sha)
        self.assertFalse((self.web / "data/bus").exists())

    def test_adopt_moves_old_folder_copies_only_legacy_and_is_idempotent(self):
        adopted = self.adopt()
        self.assertTrue(self.web.is_symlink())
        self.assertTrue(adopted.name.endswith("-before-releases"))
        self.assertEqual((adopted / "index.html").read_text(), "old index")
        self.assertEqual({path.name for path in self.keep.iterdir()}, set(LEGACY))
        self.assertFalse((self.keep / "gallery").is_symlink())
        (adopted / "gallery/picture.txt").write_text("changed original")
        self.assertEqual((self.keep / "gallery/picture.txt").read_text(), "old gallery")
        history = self.history()
        self.deploy("--adopt")
        self.assertEqual(self.web.resolve(), adopted)
        self.assertEqual(self.history(), history)

    def test_normal_deployment_refuses_real_folder_without_changing_it(self):
        result = self.deploy(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--adopt", result.stdout)
        self.assertFalse(self.web.is_symlink())
        self.assertEqual((self.web / "index.html").read_text(), "old index")
        self.assertFalse((self.releases / ".history").exists())

    def test_adopt_restores_real_folder_if_second_rename_fails(self):
        real_mv = shutil.which("mv")
        self.command("mv", f"""
import os, sys
if sys.argv[1:] == ['-T', {str(self.web) + '.new'!r}, {str(self.web)!r}]:
    raise SystemExit(1)
os.execv({real_mv!r}, [{real_mv!r}] + sys.argv[1:])
""")
        result = self.deploy("--adopt", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.web.is_symlink())
        self.assertEqual((self.web / "index.html").read_text(), "old index")
        self.assertFalse(Path(str(self.web) + ".new").exists())

    def test_keep_links_are_published_and_committed_names_take_precedence(self):
        self.adopt()
        self.write("web/webgl.html", "committed replacement")
        sha = self.commit("tracked legacy replacement")
        self.deploy(sha)
        self.assertFalse((self.web / "webgl.html").is_symlink())
        self.assertEqual((self.web / "webgl.html").read_text(), "committed replacement")
        for name in LEGACY:
            if name != "webgl.html":
                self.assertTrue((self.web / name).is_symlink(), name)
                self.assertEqual((self.web / name).resolve(), self.keep / name)
        self.assertEqual((self.keep / "webgl.html").read_text(), "old:webgl.html")

    def test_same_second_releases_and_repeated_commit_rollback_in_switch_order(self):
        adopted = self.adopt()
        self.deploy(self.initial)
        first = self.web.resolve()
        self.write("web/index.html", "second commit")
        second_sha = self.commit("second release")
        self.deploy(second_sha)
        second = self.web.resolve()
        self.deploy(second_sha)
        third = self.web.resolve()
        self.assertEqual(len({adopted, first, second, third}), 4)
        self.assertTrue(all(path.name.startswith("20261010T120000Z-") for path in (adopted, first, second, third)))
        self.assertEqual(self.history(), [path.name for path in (adopted, first, second, third)])
        for previous in (second, first, adopted):
            self.deploy("--rollback")
            self.assertEqual(self.web.resolve(), previous)
            self.assertEqual(self.history()[-1], previous.name)
        result = self.deploy("--rollback", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.web.resolve(), adopted)

    def test_invalid_commit_preserves_link_and_history(self):
        adopted = self.adopt()
        result = self.deploy("not-a-commit", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.web.resolve(), adopted)
        self.assertEqual(self.history(), [adopted.name])

    def test_prune_protects_current_previous_and_adopted_even_with_keep_one(self):
        adopted = self.adopt()
        releases = []
        for _ in range(4):
            self.deploy()
            releases.append(self.web.resolve())
        self.assertTrue(all(path.exists() for path in releases))
        self.env["SYUNG_KEEP_COUNT"] = "1"
        self.deploy("--prune")
        self.assertTrue(adopted.exists())
        self.assertTrue(releases[-1].exists())
        self.assertTrue(releases[-2].exists())
        self.assertFalse(releases[0].exists())
        self.assertFalse(releases[1].exists())
        self.assertEqual(self.history(), [adopted.name, releases[-2].name, releases[-1].name])
        self.deploy("--rollback")
        self.assertEqual(self.web.resolve(), releases[-2])



if __name__ == "__main__":
    unittest.main()
