"""서버 코드를 실행하지 않고 층 경계와 환경·HTTP 접근 위치를 검사한다."""

import ast
import sys
import unittest
from pathlib import Path


COMMON = {"server.config", "server.errors", "server.clock"}
LEGACY = {
    "server.subway_live_proxy", "server.bus_live_proxy", "server.owner_auth",
    "server.healthcheck",
}
ALLOWED = {
    "routes": {"routes", "services"},
    "services": {"services", "sources", "store"},
    "sources": {"sources"},
    "store": {"store"},
    "jobs": {"jobs", "services"},
}


def module_name(relative_path):
    parts = list(Path(relative_path).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(["server", *parts])


def classify(module):
    if module in LEGACY:
        return "legacy"
    if module == "server.app":
        return "app"
    if module == "server" or module in COMMON:
        return "common"
    parts = module.split(".")
    if len(parts) > 1 and parts[1] in ALLOWED:
        return parts[1]
    return None


def qualified_names(node, aliases):
    """import 별칭을 포함한 정적 이름을 얻는다. 실행이나 import는 하지 않는다."""
    if isinstance(node, ast.Name):
        return aliases.get(node.id, {node.id})
    if isinstance(node, ast.Attribute):
        return {name + "." + node.attr for name in qualified_names(node.value, aliases)}
    return set()


def inspect_sources(sources):
    """{서버 안 상대 파일명: 소스 문자열}에서 위반 메시지 목록을 돌려준다."""
    modules = {module_name(path): (str(path), source) for path, source in sources.items()}
    known = set(modules)
    # __init__.py 없는 과도기 폴더도 from-import의 패키지로 해석한다.
    for module in modules:
        parts = module.split(".")
        known.update(".".join(parts[:i]) for i in range(1, len(parts)))
    internal_roots = {name.split(".")[1] for name in known if "." in name}
    internal_roots.update(name.rsplit(".", 1)[-1] for name in known)
    internal_roots.update(name.split(".")[1] for name in COMMON | LEGACY)
    internal_roots.update(ALLOWED)
    internal_roots.add("app")
    graph = {module: set() for module in modules if module not in LEGACY}
    problems = []

    def report(module, line, message):
        problems.append(f"{modules[module][0]}:{line}: {message}")

    def edge(origin, target, line):
        if target == "server.app" or target in LEGACY:
            report(origin, line, f"app·옛 껍데기 import 금지: {target}")
            return
        kind, target_kind = classify(origin), classify(target)
        if target_kind is None:
            report(origin, line, f"분류되지 않은 내부 대상: {target}")
            return
        allowed = (
            kind == "app"
            or target_kind == "common"
            or target_kind in ALLOWED.get(kind, set())
        )
        if not allowed:
            report(origin, line, f"층 방향 위반: {origin} → {target}")
        if target in graph:
            graph[origin].add(target)

    def capability(origin, name, line):
        kind = classify(origin)
        if (name == "os.environ" or name.startswith("os.environ.")
                or name == "os.getenv") and origin != "server.config":
            report(origin, line, f"환경 변수 접근은 config.py만 허용: {name}")
        if (name == "urllib.request" or name.startswith("urllib.request.")
                or name == "http.client" or name.startswith("http.client.")) and kind != "sources":
            report(origin, line, f"바깥 HTTP 접근은 sources만 허용: {name}")
        if (name == "http.server" or name.startswith("http.server.")) and kind not in {"routes", "app"}:
            report(origin, line, f"HTTP 서버 접근은 routes/app만 허용: {name}")

    def imported(origin, target, line):
        capability(origin, target, line)
        if target == "server":
            report(origin, line, "import server 대신 server.xxx 절대 import를 사용해야 함")
        elif target.startswith("server."):
            edge(origin, target, line)
        elif target.split(".")[0] in internal_roots and target.split(".")[0] not in sys.stdlib_module_names:
            report(origin, line, f"서버 내부 bare import 금지: {target}")

    for origin, (path, source) in sorted(modules.items()):
        kind = classify(origin)
        if kind is None:
            report(origin, 1, f"분류되지 않은 서버 파일: {origin}")
            continue
        if kind == "legacy":
            # 옛 파일 다섯 개는 이동 전 구현까지 예외. healthcheck도 실행하지 않는다.
            continue
        try:
            tree = ast.parse(source, filename=path)
        except SyntaxError as error:
            report(origin, error.lineno or 1, f"Python 구문 오류: {error.msg}")
            continue
        aliases = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for item in node.names:
                    imported(origin, item.name, node.lineno)
                    binding = item.asname or item.name.split(".")[0]
                    value = item.name if item.asname else item.name.split(".")[0]
                    aliases.setdefault(binding, set()).add(value)
            elif isinstance(node, ast.ImportFrom):
                if node.level:
                    report(origin, node.lineno, "상대 import 금지: server.xxx 절대 import를 사용해야 함")
                    continue
                base = node.module or ""
                if base != "server":
                    imported(origin, base, node.lineno)
                for item in node.names:
                    target = base + "." + item.name
                    if item.name == "*":
                        report(origin, node.lineno, "별표 import는 층·접근 위치를 확인할 수 없음")
                        continue
                    if base == "server" or target in known or target in COMMON | LEGACY | {"server.app"}:
                        edge(origin, target, node.lineno)
                    # from urllib import request, from os import environ도 검사한다.
                    capability(origin, target, node.lineno)
                    aliases.setdefault(item.asname or item.name, set()).add(target)
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) or isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                for name in qualified_names(node, aliases):
                    capability(origin, name, node.lineno)

    visiting, visited, path = set(), set(), []

    def visit(module):
        if module in visiting:
            cycle = path[path.index(module):] + [module]
            report(module, 1, "순환 import: " + " → ".join(cycle))
            return
        if module in visited:
            return
        visiting.add(module)
        path.append(module)
        for target in sorted(graph[module]):
            visit(target)
        path.pop()
        visiting.remove(module)
        visited.add(module)

    for module in sorted(graph):
        visit(module)
    return sorted(set(problems))


class ServerLayerTest(unittest.TestCase):
    def test_repository_layers(self):
        root = Path(__file__).resolve().parents[1] / "server"
        sources = {path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                   for path in sorted(root.rglob("*.py"))}
        self.assertTrue(sources, "server의 Python 파일을 찾지 못했습니다")
        self.assertEqual(inspect_sources(sources), [])


class LayerCheckerFixtureTest(unittest.TestCase):
    def assert_rejected(self, sources, message):
        problems = inspect_sources(sources)
        self.assertTrue(any(message in problem for problem in problems), problems)

    def test_allowed_directions_and_common_leaves(self):
        sources = {
            "__init__.py": "",
            "app.py": "from server.routes import live\nfrom server.jobs import burst\nimport http.server",
            "config.py": "import os\nPORT = os.environ.get('PORT')\nfrom server.clock import KST",
            "errors.py": "from server.clock import KST",
            "clock.py": "KST = None",
            "routes/live.py": "import server.services.live\nfrom http.server import BaseHTTPRequestHandler",
            "services/live.py": "from server.sources import seoul\nfrom server.store import quota",
            "sources/seoul.py": "import urllib.request\nimport http.client\nfrom server.config import PORT",
            "store/quota.py": "from server.errors import Failure",
            "jobs/burst.py": "from server.services.live import Live",
        }
        self.assertEqual(inspect_sources(sources), [])

    def test_function_and_conditional_imports_are_checked(self):
        for source in (
            "def fetch():\n    from server.services.live import Live",
            "if False:\n    import server.services.live",
        ):
            with self.subTest(source=source):
                self.assert_rejected({"sources/seoul.py": source}, "층 방향 위반")

    def test_disallowed_directions(self):
        for origin, target in (
            ("routes/live.py", "server.sources.seoul"),
            ("services/live.py", "server.routes.live"),
            ("sources/seoul.py", "server.store.quota"),
            ("store/quota.py", "server.sources.seoul"),
            ("jobs/burst.py", "server.sources.seoul"),
            ("config.py", "server.services.live"),
        ):
            with self.subTest(origin=origin, target=target):
                self.assert_rejected({origin: "import " + target}, "층 방향 위반")

    def test_relative_and_bare_imports_fail(self):
        for source in ("from . import live", "from ..services import live", "import services.live", "import bus_live_proxy"):
            with self.subTest(source=source):
                self.assert_rejected({"routes/live.py": source}, "import 금지")

    def test_from_server_import_resolves_children(self):
        self.assertEqual(inspect_sources({"services/live.py": "from server import config"}), [])
        self.assert_rejected({"sources/seoul.py": "from server import services"}, "층 방향 위반")
        self.assert_rejected({"routes/live.py": "from server import bus_live_proxy"}, "껍데기 import 금지")

    def test_from_package_import_resolves_submodule(self):
        self.assert_rejected({"services/a.py": "from server.services import b",
                              "services/b.py": "from server.services import a"}, "순환 import")

    def test_cycles_include_imports_inside_functions(self):
        self.assert_rejected({"services/a.py": "import server.services.b",
                              "services/b.py": "def work():\n    import server.services.a"}, "순환 import")

    def test_package_initializer_is_checked(self):
        self.assert_rejected({"sources/__init__.py": "import server.services.live"}, "층 방향 위반")

    def test_unclassified_files_and_targets_fail(self):
        self.assert_rejected({"helper.py": ""}, "분류되지 않은 서버 파일")
        self.assert_rejected({"journey.py": ""}, "분류되지 않은 서버 파일")
        self.assert_rejected({"extra/worker.py": ""}, "분류되지 않은 서버 파일")
        self.assert_rejected({"services/live.py": "from server import helper"}, "분류되지 않은 내부 대상")

    def test_app_and_legacy_cannot_be_imported_even_by_app(self):
        for target in sorted(LEGACY | {"server.app"}):
            with self.subTest(target=target):
                self.assert_rejected({"services/live.py": "import " + target}, "껍데기 import 금지")
        self.assert_rejected({"app.py": "import server.bus_live_proxy"}, "껍데기 import 금지")

    def test_environment_access_and_aliases(self):
        for source in (
            "import os\nx = os.environ['KEY']",
            "import os as env\nx = env.environ.get('KEY')",
            "from os import environ as env\nx = env.get('KEY')",
            "import os\nx = os.getenv('KEY')",
            "from os import getenv\nx = getenv('KEY')",
            "def load():\n    import os\n    return os.environ.get('KEY')",
        ):
            with self.subTest(source=source):
                self.assert_rejected({"services/live.py": source}, "환경 변수 접근")
                self.assertEqual(inspect_sources({"config.py": source}), [])

    def test_outbound_http_and_aliases(self):
        for source in (
            "import urllib.request",
            "from urllib import request",
            "from urllib.request import urlopen as open_url",
            "import urllib as u\nu.request.urlopen('fake')",
            "import http.client as client",
            "from http import client",
            "import http as h\nh.client.HTTPConnection('fake')",
        ):
            with self.subTest(source=source):
                self.assert_rejected({"services/live.py": source}, "바깥 HTTP 접근")
                self.assertEqual(inspect_sources({"sources/seoul.py": source}), [])
        self.assertEqual(inspect_sources({"routes/live.py": "import urllib.parse"}), [])

    def test_http_server_access(self):
        for source in ("import http.server", "from http import server", "from http.server import BaseHTTPRequestHandler"):
            with self.subTest(source=source):
                self.assert_rejected({"services/live.py": source}, "HTTP 서버 접근")
                self.assertEqual(inspect_sources({"routes/http.py": source, "app.py": source}), [])

    def test_legacy_files_are_exempt_and_absent_layers_are_allowed(self):
        old_source = "import os\nimport urllib.request\nimport http.server\nimport journey\nfrom . import old"
        sources = {name.split(".")[1] + ".py": old_source for name in LEGACY}
        self.assertEqual(inspect_sources(sources), [])
        self.assertEqual(inspect_sources({"config.py": "import os\nx = os.environ.get('PORT')"}), [])

    def test_star_import_and_ambiguous_package_import_fail(self):
        self.assert_rejected({"services/live.py": "from server.sources import *"}, "별표 import")
        self.assert_rejected({"services/live.py": "import server"}, "server.xxx 절대 import")


if __name__ == "__main__":
    unittest.main()
