#!/usr/bin/env python3
"""Quota-aware, per-line proxy for Seoul realtime subway positions."""

from __future__ import annotations

import json
import sys
import threading
import time
import urllib.error
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parent.parent)   # python3 server/subway_live_proxy.py 로 띄워도 server 패키지를 찾게
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server.config import SubwayConfig  # noqa: E402
from server.routes import journey as journey_routes  # noqa: E402
from server.routes import live as live_routes  # noqa: E402
from server.services.runtime import default_services  # noqa: E402

CONFIG = SubwayConfig.from_env()
HOST, PORT = CONFIG.host, CONFIG.port
# Position bursts: the per-line position feed stamps each train with its own event time, which the
# all-stations feed does not on the Seoul Metro lines. Every BURST_EVERY seconds one of these lines
# is read BURST_CALLS times, BURST_GAP apart, and saved for build_live_timing.py (dwell/approach).
BURST_LINES = CONFIG.burst_lines
BURST_EVERY = CONFIG.burst_every
BURST_CALLS, BURST_GAP, BURST_RESERVE = 8, 45, 150
RESPONSE_SECONDS = CONFIG.response_seconds

_response_lock = threading.Lock()
_responses: dict[str, tuple[float, int, bytes]] = {}


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 256   # the default 5 made bursts of connections wait for SYN retries (1–2.5 s)


class Handler(BaseHTTPRequestHandler):
    # ---- owner login for the private pages (owner_auth.py; Caddy forward_auth → /auth) ----
    def _redirect(self, status: int, location: str, cookie: str | None = None) -> None:
        self.send_response(status)
        self.send_header("Location", location)
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _auth(self) -> None:
        from server import owner_auth
        if owner_auth.valid(self.headers.get("Cookie")):
            self.send_response(204)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        uri = self.headers.get("X-Forwarded-Uri", "/learning")
        if uri.split("?", 1)[0].endswith(".json"):
            return self._send(401, b'{"ok":false,"error":"login"}')
        self._redirect(302, "/login.html?next=" + urllib.parse.quote(owner_auth.safe_next(uri), safe=""))

    def do_POST(self) -> None:
        from server import owner_auth
        path = self.path.split("?", 1)[0]
        if path == "/logout":
            return self._redirect(303, "/login.html", owner_auth.clear_cookie())
        if path != "/login":
            return self.send_error(404)
        size = min(int(self.headers.get("Content-Length") or 0), 4096)
        form = urllib.parse.parse_qs(self.rfile.read(size).decode("utf-8", "replace"))
        user, password = form.get("user", [""])[0], form.get("password", [""])[0]
        nxt = owner_auth.safe_next(form.get("next", ["/learning"])[0])
        address = (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()
        if owner_auth.check_password(user, password, address):
            return self._redirect(303, nxt, owner_auth.make_cookie())
        error = "wait" if owner_auth.blocked(address) else "1"
        self._redirect(303, f"/login.html?e={error}&next=" + urllib.parse.quote(nxt, safe=""))

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/auth":
            return self._auth()
        # bus: separate cache/quota; the same process can serve the new endpoint.
        if self.path.split("?", 1)[0] in ("/bus/live", "/api/bus/live"):
            from server import bus_live_proxy
            if len(self.path) > 2048:
                return self._send(400, b'{"ok":false,"error":"invalid_request"}')
            body, status = bus_live_proxy.snapshot(urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query))
            return self._send(status, json.dumps(body, ensure_ascii=False, allow_nan=False).encode())
        if self.path.split("?", 1)[0] not in ("/live", "/health", "/route", "/place"):
            self.send_error(404)
            return
        if RESPONSE_SECONDS and self.path.startswith("/live"):
            with _response_lock:
                hit = _responses.get(self.path)
            if hit and time.time() < hit[0]:
                return self._send(hit[1], hit[2])
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        if self.path.startswith("/route"):
            body, status = journey_routes.route(default_services(), query)
        elif self.path.startswith("/place"):
            body, status = journey_routes.place(default_services(), query)
        elif not self.path.startswith("/live"):
            body, status = {"ok": True}, 200
        else:
            body, status = live_routes.live(default_services().live, query)
        data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
        if RESPONSE_SECONDS and self.path.startswith("/live"):
            with _response_lock:
                if len(_responses) > 2000:
                    _responses.clear()
                _responses[self.path] = (time.time() + RESPONSE_SECONDS, status, data)
        self._send(status, data)

    def _send(self, status: int, data: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store" if self.path.startswith(("/live", "/auth", "/bus/", "/api/bus/")) else "public, max-age=30")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: object) -> None:
        return


def _burst_loop() -> None:
    live = default_services().live
    turn = 0
    while True:
        time.sleep(BURST_EVERY)
        if live.quiet() or not BURST_LINES:
            continue
        if live.calls_left() < BURST_RESERVE:   # keep the rest of the day's calls for the map
            continue
        line = BURST_LINES[turn % len(BURST_LINES)]
        turn += 1
        for _ in range(BURST_CALLS):
            try:
                data = live.fetch_line(line)   # counts against the daily quota; raises at the limit
            except (OSError, ValueError, RuntimeError, urllib.error.URLError):
                break
            live.save_positions(data)
            time.sleep(BURST_GAP)


def _bus_samples() -> None:
    try:
        from server import bus_live_proxy
        bus_live_proxy.background_loop()   # 보는 중인 버스 노선을 먼저 새로, 남는 차례에 학습용 수집
    except Exception as e:  # noqa: BLE001 — the map's bus requests still work
        print(f"bus samples stopped: {e}", flush=True)


def _warm_journey() -> None:
    try:
        default_services().journey.warm()   # route search workers up before the first 길찾기
    except Exception as e:  # noqa: BLE001 — routing falls back to searching in-process
        print(f"journey warm-up failed: {e}", flush=True)


if __name__ == "__main__":
    default_services().live.load_quota()
    threading.Thread(target=_warm_journey, daemon=True).start()
    if BURST_EVERY > 0:
        threading.Thread(target=_burst_loop, daemon=True).start()
    threading.Thread(target=_bus_samples, daemon=True).start()
    Server((HOST, PORT), Handler).serve_forever()
