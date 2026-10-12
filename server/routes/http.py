"""통합 서버(:3113)의 HTTP 처리: 주소 → 담당 route, 응답 쓰기(옛 subway_live_proxy.Handler 와 같은 머리말 · 직렬화).

GET  /live · /health · /api/health · /route · /place · /auth · /bus/live · /api/bus/live · /debug/recent · /debug/bus-route
POST /login · /logout · /debug/ride · /debug/shot
그 밖은 기본 HTML 404(옛 그대로). 요청 기록(로그)은 남기지 않는다(쿼리 · 키가 든 주소가 찍히지 않게).
"""
from __future__ import annotations

import json
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from server.routes import bus as bus_routes
from server.routes import debug as debug_routes
from server.routes import journey as journey_routes
from server.routes import live as live_routes
from server.routes import owner as owner_routes
from server.routes.errors import api_error
from server.routes.response import Response
from server.services.debug import MAX_SHOT_BYTES


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 256   # the default 5 made bursts of connections wait for SYN retries (1–2.5 s)


class ResponseCache:
    """/live 의 완성된 응답(상태 + 바이트)을 같은 주소에 seconds 동안 그대로 준다(the map polls every 10–20 s;
    a busy minute is many people asking for the same few line sets). 503 도 담는다(옛 그대로)."""
    def __init__(self, seconds: float):
        self.seconds = seconds
        self._lock = threading.Lock()
        self._responses: dict[str, tuple[float, int, bytes]] = {}

    def get(self, key: str) -> tuple[int, bytes] | None:
        with self._lock:
            hit = self._responses.get(key)
        return (hit[1], hit[2]) if hit and time.time() < hit[0] else None

    def put(self, key: str, status: int, data: bytes) -> None:
        with self._lock:
            if len(self._responses) > 2000:
                self._responses.clear()
            self._responses[key] = (time.time() + self.seconds, status, data)


# GET 주소 → route(services, query) → (body, status). /bus 는 따로(직렬화 · 길이 제한이 다르다).
# 새 주소는 /api/… 로 만들고 오류는 routes/errors.py 의 api_error 모양 하나로(옛 주소의 응답 모양은 바꾸지 않는다)
GET_JSON = {
    "/live": lambda services, query: live_routes.live(services.live, query),
    "/health": lambda services, query: ({"ok": True}, 200),
    # 이상 감지(관제탑이 5분마다): 늘 200, 바깥 API 를 부르지 않는다
    "/api/health": lambda services, query: (services.health.report(), 200),
    "/route": journey_routes.route,
    "/place": journey_routes.place,
}

# 디버깅 페이지(주인 쿠키만) — 쿠키를 받아야 해서 GET_JSON 과 따로
DEBUG_GET = {"/debug/recent": debug_routes.recent, "/debug/bus-route": debug_routes.bus_route}


def make_handler(services, response_seconds: float):
    cache = ResponseCache(response_seconds)

    class Handler(BaseHTTPRequestHandler):
        def _write(self, response: Response) -> None:
            if response.kind == "json":
                return self._send(response.status, response.body)
            if response.kind == "error":
                return self.send_error(response.status)
            self.send_response(response.status)
            if response.kind == "redirect":
                self.send_header("Location", response.location)
                if response.cookie:
                    self.send_header("Set-Cookie", response.cookie)
            self.send_header("Cache-Control", "no-store")
            if response.kind == "redirect":
                self.send_header("Content-Length", "0")
            self.end_headers()

        def do_POST(self) -> None:
            path = self.path.split("?", 1)[0]
            if path == "/logout":
                return self._write(owner_routes.logout())
            if path in ("/debug/ride", "/debug/shot"):
                return self._debug_post(path)
            if path != "/login":
                return self.send_error(404)
            size = min(int(self.headers.get("Content-Length") or 0), 4096)
            form = self.rfile.read(size)
            address = (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()
            self._write(owner_routes.login(services.auth, form, address))

        def _debug_post(self, path: str) -> None:
            # 로그인부터 보고 본문을 읽는다(남이 큰 파일을 보내도 읽지 않는다)
            cookie = self.headers.get("Cookie")
            if not debug_routes.allowed(services, cookie):
                self.close_connection = True
                return self._send_json(*debug_routes.LOGIN)
            limit = debug_routes.RIDE_BYTES if path == "/debug/ride" else MAX_SHOT_BYTES
            size = int(self.headers.get("Content-Length") or 0)
            if size <= 0 or size > limit:
                self.close_connection = True
                return self._send_json(api_error("too_large", "본문이 없거나 너무 커요"), 413)
            body = self.rfile.read(size)
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            if path == "/debug/ride":
                return self._send_json(*debug_routes.ride(services, cookie, body))
            self._send_json(*debug_routes.shot(services, cookie, body, self.headers.get("Content-Type", ""), query))

        def _send_json(self, body, status: int) -> None:
            self._send(status, json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode())

        def do_GET(self) -> None:
            path = self.path.split("?", 1)[0]
            if path in DEBUG_GET:
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                return self._send_json(*DEBUG_GET[path](services, self.headers.get("Cookie"), query))
            if path == "/auth":
                return self._write(owner_routes.auth(services.auth, self.headers.get("Cookie"),
                                                     self.headers.get("X-Forwarded-Uri", "/learning")))
            # bus: separate cache/quota; the same process serves both paths.
            if path in ("/bus/live", "/api/bus/live"):
                if len(self.path) > 2048:
                    return self._send(400, b'{"ok":false,"error":"invalid_request"}')
                body, status = bus_routes.snapshot(services, urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query))
                return self._send(status, json.dumps(body, ensure_ascii=False, allow_nan=False).encode())
            if path not in GET_JSON:
                self.send_error(404)
                return
            cached = cache.seconds and self.path.startswith("/live")
            if cached and (hit := cache.get(self.path)):
                return self._send(*hit)
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            body, status = GET_JSON[path](services, query)
            data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
            if cached:
                cache.put(self.path, status, data)
            self._send(status, data)

        def _send(self, status: int, data: bytes) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store" if self.path.startswith(("/live", "/auth", "/bus/", "/api/bus/", "/debug/")) else "public, max-age=30")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format: str, *args: object) -> None:
            return

    return Handler
