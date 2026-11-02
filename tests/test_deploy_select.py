"""배포 시험 고르기(deploy/select_tests.py): 바뀐 경로 → 돌릴 시험. 모르면 전부."""
import importlib.util
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("select_tests", ROOT / "deploy" / "select_tests.py")
select_tests = importlib.util.module_from_spec(spec)
spec.loader.exec_module(select_tests)


class PickTests(unittest.TestCase):
    def test_server_code_runs_everything(self):
        # server/ · 서버가 돌리는 pipeline/(subway-retrain · subway-sampler 유닛) · 서버가 읽는 data/(store/journey_data.py · config.py)
        for path in ("server/app.py", "server/subway-live.service", "pipeline/retrain_live_timing.py",
                     "data/journey.json", "data/fare/hop_km.json"):
            self.assertEqual(select_tests.pick_for_paths([path]), (True, "all"), path)

    def test_deploy_tooling_and_settings_run_everything(self):
        for path in ("deploy/deploy.sh", ".github/workflows/deploy.yml", ".github/actions/check/action.yml",
                     "package.json", "package-lock.json", "vite.config.mts", "tsconfig.json", "pyproject.toml",
                     "tests/fixtures/x.json", "admin/learning.json", "new-folder/x.txt", "other.txt"):
            self.assertEqual(select_tests.pick_for_paths([path]), (True, "all"), path)

    def test_web_runs_js_and_python_that_reads_web(self):
        self.assertEqual(select_tests.pick_for_paths(["web/index.html", "web/city/mesh.mjs"]), (True, "web"))

    def test_side_folders_run_js_only(self):
        for path in ("app/src/x.tsx", "tools/dev.mjs", ".storybook/main.ts", "tests/routing.test.mjs", "tests/fixtures.mjs"):
            self.assertEqual(select_tests.pick_for_paths([path]), (True, "none"), path)

    def test_python_test_runs_python_only(self):
        self.assertEqual(select_tests.pick_for_paths(["tests/test_fare.py"]), (False, "all"))

    def test_documents_run_nothing(self):
        self.assertEqual(select_tests.pick_for_paths(["README.md", "AGENTS.md", "docs/a/b.png"]), (False, "none"))
        self.assertEqual(select_tests.pick_for_paths(["web/README.md"]), (True, "web"))   # 문서 자리가 아니면 문서로 치지 않는다

    def test_widest_pick_wins(self):
        self.assertEqual(select_tests.pick_for_paths(["docs/a.md", "web/x.mjs"]), (True, "web"))
        self.assertEqual(select_tests.pick_for_paths(["web/x.mjs", "server/app.py"]), (True, "all"))
        self.assertEqual(select_tests.pick_for_paths(["tests/test_fare.py", "tools/x.mjs"]), (True, "all"))

    def test_nothing_changed_runs_everything(self):
        self.assertEqual(select_tests.pick_for_paths([]), (True, "all"))   # 손으로 다시 돌리기


class WebPythonListTests(unittest.TestCase):
    def test_every_python_test_touching_web_is_listed(self):
        # web/ 을 직접 읽거나, web/ 을 다루는 pipeline 을 부르는 Python 시험이 목록에서 빠지면 웹 변경 때 안 돈다
        found = set()
        for path in sorted((ROOT / "tests").glob("test_*.py")):
            if path.stem.startswith("test_deploy"):   # 가짜 레포에 web/ 을 만들 뿐이다
                continue
            text = path.read_text(encoding="utf-8")
            names = re.findall(r"^\s*(?:from|import) (?:pipeline\.)?([a-z_0-9]+)", text, re.M)
            sources = [ROOT / "pipeline" / f"{name}.py" for name in names]
            if '"web"' in text or any(source.exists() and re.search(r'"web"|\bweb/', source.read_text(encoding="utf-8")) for source in sources):
                found.add(path.stem)
        self.assertLessEqual(found, set(select_tests.WEB_PYTHON_TESTS))
        for name in select_tests.WEB_PYTHON_TESTS:
            self.assertTrue((ROOT / "tests" / f"{name}.py").exists(), name)


class SelectTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="syung-select-test-")
        self.addCleanup(temporary.cleanup)
        self.repo = temporary.name
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "fixture")
        self.git("config", "user.email", "fixture@example.invalid")

    def git(self, *args):
        return subprocess.run(["git", "-C", self.repo, *args], check=True, capture_output=True, text=True).stdout.strip()

    def commit(self, path):
        target = Path(self.repo) / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text((target.read_text() if target.exists() else "") + "x\n")
        self.git("add", "--", path)
        self.git("commit", "-q", "-m", path)
        return self.git("rev-parse", "HEAD")

    def test_reads_changes_between_commits(self):
        base = self.commit("server/app.py")
        head = self.commit("web/index.html")
        self.assertEqual(select_tests.select(self.repo, base, head), (True, "web"))

    def test_changes_in_every_commit_since_base_count(self):
        base = self.commit("web/index.html")
        self.commit("server/app.py")
        head = self.commit("web/index.html")
        self.assertEqual(select_tests.select(self.repo, base, head), (True, "all"))

    def test_moved_file_counts_old_place(self):
        base = self.commit("server/app.py")
        (Path(self.repo) / "web").mkdir()
        self.git("mv", "server/app.py", "web/app.py")
        self.git("commit", "-q", "-m", "옮김")
        self.assertEqual(select_tests.select(self.repo, base, self.git("rev-parse", "HEAD")), (True, "all"))

    def test_unknown_base_runs_everything(self):
        head = self.commit("web/index.html")
        for base in ("", "web-dist", "not a sha", "--help", "0" * 40):
            self.assertEqual(select_tests.select(self.repo, base, head), (True, "all"), base)

    def test_base_not_ancestor_runs_everything(self):
        first = self.commit("web/a.mjs")
        side = self.commit("web/b.mjs")
        self.git("reset", "-q", "--hard", first)
        head = self.commit("web/c.mjs")
        self.assertEqual(select_tests.select(self.repo, side, head), (True, "all"))

    def test_same_commit_runs_everything(self):
        head = self.commit("web/index.html")
        self.assertEqual(select_tests.select(self.repo, head, head), (True, "all"))


class WorkflowShapeTests(unittest.TestCase):
    def test_handoff_runs_full_check_without_secrets_or_forks(self):
        text = (ROOT / ".github/workflows/athena-handoff.yml").read_text(encoding="utf-8")
        verify = text.split("  verify:\n", 1)[1].split("  merge:\n", 1)[0]
        self.assertIn("uses: ./.github/actions/check", verify)
        self.assertNotIn("base:", verify)   # 머지 전 검증은 늘 전부
        self.assertIn("persist-credentials: false", verify)
        self.assertIn("github.event.repository.fork == false", verify)
        self.assertNotIn("secrets.", text)
        self.assertNotIn("--force", text)
        self.assertNotIn("pull_request", text.split("\non:\n", 1)[1].split("\npermissions:", 1)[0])

    def test_only_main_deploy_narrows(self):
        text = (ROOT / ".github/workflows/deploy.yml").read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)   # 넘긴 작업의 머지 뒤 배포를 이것으로 부른다
        self.assertIn("if: github.ref == 'refs/heads/main'\n", text.split("  build:\n", 1)[0])


if __name__ == "__main__":
    unittest.main()
