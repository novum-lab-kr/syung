#!/usr/bin/env python3
"""Local development server: the map straight from the repo, live trains from production.

    python3 deploy/dev_server.py            # http://localhost:8080
    python3 deploy/dev_server.py 9000       # another port

Serves web/ and the built data files at the same paths as the deployed site (no copy step: edit
web/maplibre_runtime.mjs and reload). /api/live (and /api/route · /api/place) is forwarded to the production proxy, so no Seoul API
key is needed locally. Set SUBWAY_LIVE_UPSTREAM to use another proxy (e.g. http://127.0.0.1:3113/live).

회원 주소(/api/auth/… · /api/me…)는 서버와 같은 코드(server/routes/members.py)로 여기서 답한다. DB 는 임시 폴더
(SYUNG_MEMBER_DB 로 바꿈). SYUNG_DEV_LOGIN=1 이면 카카오 자리에 가짜 제공자를 넣어 바로 '개발용 사용자'로 로그인된다
(카카오 앱 없이 화면 확인용 — 운영 서버에는 이 제공자가 없다). 아니면 운영처럼 환경 변수의 제공자를 쓴다.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))   # server.* (회원 주소)
UPSTREAM = os.environ.get("SUBWAY_LIVE_UPSTREAM", "https://syung.novum-lab.com/api/live")
# 길찾기 · 장소 검색(승차권 발권 화면이 부른다)도 운영으로 — 바깥 API 키 없이 로컬에서 시험한다
JOURNEY_UPSTREAM = os.environ.get("SYUNG_JOURNEY_UPSTREAM", "https://syung.novum-lab.com/api")
JOURNEY_PATHS = {"/api/route": "/route", "/api/place": "/place"}
# published path → file in the repo
DATA = {
    "/track_shapes.json": ROOT / "data" / "osm-tracks" / "track_shapes.json",
    "/exits.json": ROOT / "data" / "osm-tracks" / "exits.json",
    "/edge_times.json": ROOT / "data" / "ktdb-gtfs-2025" / "edge_times.json",
    "/coaster_buildings.bin": ROOT / "data" / "osm-tracks" / "coaster_buildings.bin",
    "/coaster_towers.json": ROOT / "data" / "osm-tracks" / "coaster_towers.json",
    # bus: the same public URLs as deployment, without copying files.
    "/data/bus/routes.json": ROOT / "data" / "bus" / "routes.json",
    "/data/bus/stops.json": ROOT / "data" / "bus" / "stops.json",
    "/data/bus/manifest.json": ROOT / "data" / "bus" / "manifest.json",
}


class DevLogin:
    """가짜 제공자: 인가 주소가 곧 콜백. 누구로 로그인해도 같은 '개발용 사용자'."""
    name = "kakao"

    def authorize_url(self, state, redirect_uri):
        return f"{redirect_uri}?code=dev&state={urllib.parse.quote(state)}"

    def identify(self, code, redirect_uri):
        return "dev-1", "개발용 사용자"


_members = None


def members(port: int):
    global _members
    if _members is None:
        import tempfile
        from server.config import MemberConfig
        from server.services.members import MemberService
        config = MemberConfig.from_env()
        config.public_url = f"http://localhost:{port}"
        if "SYUNG_MEMBER_DB" not in os.environ:
            config.db_file = Path(tempfile.gettempdir()) / "syung-dev-members.sqlite3"
        dev = os.environ.get("SYUNG_DEV_LOGIN") == "1"
        _members = MemberService(config, providers={"kakao": DevLogin()} if dev else None)
    return _members


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # always the file you just edited
        super().end_headers()

    def _member(self, method):
        """회원 주소면 서버와 같은 routes 로 답하고 True."""
        from server.routes import members as member_routes
        if member_routes.member_path(self.path.split("?", 1)[0]) is None:
            return False

        def read_body(limit):
            size = int(self.headers.get("Content-Length") or 0)
            return self.rfile.read(size) if 0 < size <= limit else None
        response = member_routes.handle(members(self.server.server_address[1]), method, self.path, self.headers,
                                        read_body, self.client_address[0])
        self.send_response(response.status)
        if response.kind == "redirect":
            self.send_header("Location", response.location)
        for cookie in ((response.cookie,) if response.cookie else ()) + tuple(response.cookies):
            self.send_header("Set-Cookie", cookie)
        if response.kind == "json":
            self.send_header("Content-Type", "application/json; charset=utf-8")
        if response.kind != "empty":
            self.send_header("Content-Length", str(len(response.body)))
        self.end_headers()
        self.wfile.write(response.body)
        return True

    def do_POST(self):
        if not self._member("POST"):
            self.send_error(404)

    def do_PUT(self):
        if not self._member("PUT"):
            self.send_error(404)

    def do_DELETE(self):
        if not self._member("DELETE"):
            self.send_error(404)

    def do_GET(self):
        if self._member("GET"):
            return
        path = self.path.split("?", 1)[0]
        # bus: local backend, explicit BUS_LIVE_MODE=mock for UI development.
        if path == "/api/bus/live":
            if str(ROOT / "server") not in sys.path:
                sys.path.insert(0, str(ROOT / "server"))
            import bus_live_proxy
            if len(self.path) > 2048:
                payload, status = {"ok": False, "error": "invalid_request"}, 400
            else:
                payload, status = bus_live_proxy.snapshot(urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query))
            body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path.endswith("/api/live") or path in JOURNEY_PATHS:
            query = self.path.split("?", 1)[1] if "?" in self.path else ""
            upstream = UPSTREAM if path.endswith("/api/live") else JOURNEY_UPSTREAM + JOURNEY_PATHS[path]
            try:
                req = urllib.request.Request(f"{upstream}?{query}", headers={"User-Agent": "subway-live-map-dev/1.0"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    body, status = r.read(), r.status
            except urllib.error.HTTPError as e:
                body, status = e.read(), e.code
            except Exception as e:  # upstream unreachable
                body, status = f'{{"ok":false,"error":"{type(e).__name__}"}}'.encode(), 502
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path in DATA:
            data = DATA[path].read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream" if path.endswith(".bin") else "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def guess_type(self, path):
        return "text/javascript" if str(path).endswith(".mjs") else super().guess_type(path)

    def log_message(self, fmt, *args):
        if "/api/live" not in self.path:
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"subway-live-map dev: http://localhost:{port}  (live trains via {UPSTREAM})")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
