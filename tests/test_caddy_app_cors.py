"""앱(syung-app) 지도 웹뷰 CORS — server/Caddyfile.example 의 @app_paths · @app_cors · @app_preflight 와 서버 do_OPTIONS.

이 맥 · CI 에는 caddy 가 없어 Caddy 를 띄우지 못한다. 그래서 예시 파일의 matcher · header · handle 줄을 읽어
Caddy 의 뜻(path: 같은 글자 또는 끝 * 은 앞부분 · 대소문자 무시, method: 목록 중 하나, header: 같은 글자)대로 따져 본다.
운영 반영 뒤에는 실제 Caddy 에 curl 로 확인한다(계획서 plans/feature/20261030-슝-앱-만들기.md).
"""
from __future__ import annotations

import http.client
import pathlib
import re
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from server.routes import http as http_routes

ROOT = pathlib.Path(__file__).resolve().parents[1]
CADDYFILE = ROOT / "server" / "Caddyfile.example"
APP_ORIGIN = "http://127.0.0.1:38127"
# 계약(계획서 "앱 묶음 → 서버 CORS"): 공개 API 다섯 + 서버 릴리스가 내는 지도 자료
APP_PATHS = ["/api/live", "/api/route", "/api/place", "/api/weather", "/api/bus/live",
             "/track_shapes.json", "/live-timing.json", "/edge_times.json", "/exits.json",
             "/coaster_buildings.bin", "/coaster_towers.json", "/data/bus/*"]
ACAO = "Access-Control-Allow-Origin"


def _words(line: str) -> list[str]:
    return [word.strip('"') for word in re.findall(r'"[^"]*"|\S+', line)]


def _site_lines() -> list[str]:
    """@app_cors 가 든 사이트 블록의 줄(주석 · 빈 줄 뺌)."""
    lines = ["" if line.lstrip().startswith("#") else line.strip() for line in CADDYFILE.read_text(encoding="utf-8").splitlines()]
    blocks: list[list[str]] = []
    depth = 0
    for line in lines:
        if not line:
            continue
        if depth == 0 and line.endswith("{"):
            blocks.append([])
        elif depth >= 1:
            blocks[-1].append(line)
        depth += line.count("{") - line.count("}")
    found = [block for block in blocks if any(line.startswith("@app_cors") for line in block)]
    assert len(found) == 1, "@app_cors 가 든 사이트 블록은 하나"
    return found[0]


def _parse(site: list[str]) -> tuple[dict[str, dict[str, list[str]]], list[tuple[str, list[list[str]]]], list[tuple[str, list[list[str]]]]]:
    """(named matcher → 조건, header 지시 [(matcher, [[이름, 값…]…])], handle 지시 [(matcher 또는 경로, [[줄]…])])."""
    matchers: dict[str, dict[str, list[str]]] = {}
    headers: list[tuple[str, list[list[str]]]] = []
    handles: list[tuple[str, list[list[str]]]] = []
    index = 0
    while index < len(site):
        words = _words(site[index])
        body: list[list[str]] = []
        if words[-1] == "{":
            words = words[:-1]
            index += 1
            depth = 1
            while depth:
                line = site[index]
                depth += line.count("{") - line.count("}")
                if depth >= 1 and line != "}":
                    body.append(_words(line))
                index += 1
        else:
            index += 1
        if words[0].startswith("@"):
            conditions = {words[1]: words[2:]} if len(words) > 1 else {}
            conditions.update({line[0]: line[1:] for line in body})
            matchers[words[0]] = conditions
        elif words[0] == "header":
            headers.append((words[1], [words[2:]] if len(words) > 2 else body))
        elif words[0] == "handle" and len(words) > 1:
            handles.append((words[1], body))
    return matchers, headers, handles


def _path_ok(pattern: str, path: str) -> bool:
    if pattern.endswith("*"):
        return path.lower().startswith(pattern[:-1].lower())
    return path.lower() == pattern.lower()


def _match(conditions: dict[str, list[str]], method: str, path: str, origin: str | None) -> bool:
    for key, values in conditions.items():
        if key == "path" and not any(_path_ok(pattern, path) for pattern in values):
            return False
        if key == "method" and method not in values:
            return False
        if key == "header":
            name, *expected = values
            assert name == "Origin" and len(expected) == 1 and "*" not in expected[0]
            if origin != expected[0]:
                return False
        if key not in ("path", "method", "header"):
            raise AssertionError(f"모르는 조건 {key}")
    return True


class CaddyAppCorsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.matchers, self.headers, self.handles = _parse(_site_lines())

    def respond(self, method: str, path: str, origin: str | None) -> tuple[dict[str, list[str]], bool]:
        """Caddy 가 붙일 머리(이 세 matcher 몫만)와, 여기서 204 로 끝내는 사전 요청인지."""
        out: dict[str, list[str]] = {}
        for matcher, lines in self.headers:
            if matcher.startswith("@app_") and _match(self.matchers[matcher], method, path, origin):
                for name, *value in lines:
                    if name.startswith("+"):
                        out.setdefault(name[1:], []).append(" ".join(value))
                    else:
                        out[name] = [" ".join(value)]
        preflight = any(matcher == "@app_preflight" and _match(self.matchers[matcher], method, path, origin)
                        for matcher, _ in self.handles)
        return out, preflight

    def test_three_matchers_share_one_path_list_and_one_origin(self) -> None:
        for name in ("@app_paths", "@app_cors", "@app_preflight"):
            with self.subTest(matcher=name):
                self.assertEqual(self.matchers[name]["path"], APP_PATHS)
        self.assertEqual(self.matchers["@app_cors"]["header"], ["Origin", APP_ORIGIN])
        self.assertEqual(self.matchers["@app_preflight"]["header"], ["Origin", APP_ORIGIN])
        self.assertEqual(self.matchers["@app_cors"]["method"], ["GET", "HEAD", "OPTIONS"])
        self.assertEqual(self.matchers["@app_preflight"]["method"], ["OPTIONS"])

    def test_allowed_origin_gets_its_own_origin_back_without_credentials(self) -> None:
        for path in [*APP_PATHS[:-1], "/data/bus/routes.json", "/data/bus/pace/100100118.json"]:
            for method in ("GET", "HEAD", "OPTIONS"):
                with self.subTest(path=path, method=method):
                    headers, _ = self.respond(method, path, APP_ORIGIN)
                    self.assertEqual(headers[ACAO], [APP_ORIGIN])
                    self.assertEqual(headers["Access-Control-Allow-Methods"], ["GET, HEAD, OPTIONS"])
                    self.assertEqual(headers["Vary"], ["Origin"])
                    self.assertNotIn("Access-Control-Allow-Credentials", headers)

    def test_other_or_missing_origin_gets_no_cors_header_but_still_vary(self) -> None:
        others = [None, "null", "file://", "https://map.syung.novum-lab.com", "http://127.0.0.1:38128",
                  "http://localhost:38127", "https://127.0.0.1:38127", "http://127.0.0.1:38127/", "HTTP://127.0.0.1:38127"]
        for origin in others:
            for path in ("/api/live", "/track_shapes.json", "/data/bus/stops.json"):
                with self.subTest(origin=origin, path=path):
                    headers, preflight = self.respond("GET", path, origin)
                    self.assertNotIn(ACAO, headers)
                    self.assertNotIn("Access-Control-Allow-Methods", headers)
                    self.assertEqual(headers["Vary"], ["Origin"])
                    self.assertFalse(self.respond("OPTIONS", path, origin)[1])
                    self.assertFalse(preflight)

    def test_login_member_admin_post_and_other_files_stay_closed(self) -> None:
        closed = ["/api/me", "/api/me/tickets", "/api/auth/kakao/start", "/api/auth/kakao/callback", "/api/admin/status",
                  "/api/login", "/api/logout", "/api/health", "/admin/learning", "/", "/index.html",
                  "/maplibre_runtime.mjs", "/data/journey.json", "/api/live/x", "/api/livex"]
        for path in closed:
            with self.subTest(path=path):
                headers, preflight = self.respond("GET", path, APP_ORIGIN)
                self.assertEqual(headers, {})
                self.assertFalse(self.respond("OPTIONS", path, APP_ORIGIN)[1])
                self.assertFalse(preflight)
        for method in ("POST", "PUT", "DELETE", "PATCH"):
            for path in ("/api/route", "/api/live", "/data/bus/routes.json"):
                with self.subTest(method=method, path=path):
                    headers, preflight = self.respond(method, path, APP_ORIGIN)
                    self.assertNotIn(ACAO, headers)
                    self.assertFalse(preflight)

    def test_preflight_from_allowed_origin_ends_with_204(self) -> None:
        self.assertIn(("@app_preflight", [["respond", "204"]]), self.handles)
        for path in ("/track_shapes.json", "/data/bus/routes.json", "/api/route"):
            with self.subTest(path=path):
                headers, preflight = self.respond("OPTIONS", path, APP_ORIGIN)
                self.assertTrue(preflight)
                self.assertEqual(headers[ACAO], [APP_ORIGIN])

    def test_no_wildcard_no_credentials_and_only_one_place_sets_cors(self) -> None:
        text = CADDYFILE.read_text(encoding="utf-8")
        code = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
        self.assertNotIn("Access-Control-Allow-Credentials", code)
        self.assertEqual(re.findall(r'Access-Control-Allow-Origin\s+"([^"]*)"', code), [APP_ORIGIN])
        # 서버가 같이 붙이면 머리가 둘이 되어 브라우저가 거절한다 — Python 은 CORS 머리를 내지 않는다
        for source in (ROOT / "server").rglob("*.py"):
            with self.subTest(source=source.name):
                self.assertNotIn("Access-Control-", source.read_text(encoding="utf-8"))

    def test_proxied_api_paths_preflight_on_the_server(self) -> None:
        """Caddy 가 path handle 로 서버에 넘기는 공개 API 는 서버 PUBLIC_GET 에 있어야 사전 요청이 204 다."""
        rewrites = {path: next((line[2] for line in body if line[:2] == ["rewrite", "*"]), path)
                    for path, body in self.handles if not path.startswith("@")}
        for path in APP_PATHS:
            if path.startswith("/api/"):
                with self.subTest(path=path):
                    self.assertIn(path, rewrites)
                    self.assertIn(rewrites[path], http_routes.PUBLIC_GET)


class ServerOptionsTest(unittest.TestCase):
    def setUp(self) -> None:
        services = SimpleNamespace(live=Mock(), bus=Mock(), journey=Mock(), weather=Mock(), members=Mock())
        server = http_routes.Server(("127.0.0.1", 0), http_routes.make_handler(services, 0))
        worker = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        worker.start()

        def close() -> None:
            server.shutdown()
            server.server_close()
            worker.join(timeout=2)

        self.addCleanup(close)
        self.address = server.server_address
        self.services = services

    def options(self, path: str, origin: str | None) -> tuple[int, dict[str, str], bytes]:
        connection = http.client.HTTPConnection(*self.address, timeout=3)
        try:
            connection.request("OPTIONS", path, headers={"Origin": origin} if origin else {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_public_get_paths_answer_204_without_cors_headers(self) -> None:
        for path in ("/live?lines=2", "/route", "/place", "/api/weather", "/bus/live", "/api/bus/live"):
            for origin in (APP_ORIGIN, "https://evil.example", None):
                with self.subTest(path=path, origin=origin):
                    status, headers, body = self.options(path, origin)
                    self.assertEqual(status, 204)
                    self.assertEqual(body, b"")
                    self.assertEqual(headers["Allow"], "GET, HEAD, OPTIONS")
                    self.assertFalse([name for name in headers if name.lower().startswith("access-control-")])
        self.services.live.assert_not_called()

    def test_other_paths_stay_501(self) -> None:
        for path in ("/api/me", "/api/me/tickets", "/api/auth/kakao/start", "/admin/status", "/login", "/health", "/missing"):
            with self.subTest(path=path):
                status, headers, _ = self.options(path, APP_ORIGIN)
                self.assertEqual(status, 501)
                self.assertNotIn(ACAO, headers)


if __name__ == "__main__":
    unittest.main()
