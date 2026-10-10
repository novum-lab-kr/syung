"""/bus/live · /api/bus/live: 입력 검사와 상태 코드. 응답 본문(schemaVersion 1)은 버스 서비스가 만든다.

GET /api/bus/live?routes=<standard IDs>&focus=<one of those IDs>
GET /api/bus/live?stop=<arsId>   정류장 도착 정보: 같은 주소라 Caddy 설정을 바꾸지 않는다.
/api/ 아래지만 이미 화면이 읽는 옛 주소라 새 오류 모양({"error":{…}})을 쓰지 않는다.
"""
from __future__ import annotations

import json
import re
import urllib.parse
from http.server import BaseHTTPRequestHandler

MAX_ROUTES = 8


def invalid(message: str) -> dict:
    return {"schemaVersion": 1, "ok": False, "error": "invalid_request", "message": message}


def parse_routes(query: dict, known: dict) -> tuple[list[str], str]:
    ids = list(dict.fromkeys(value.strip() for entry in query.get("routes", [])
                             for value in entry.split(",") if value.strip()))
    focus_values = query.get("focus", [])
    focus = focus_values[0].strip() if focus_values else ""
    if (len(ids) > MAX_ROUTES or len(focus_values) > 1
            or any(not re.fullmatch(r"\d{9}", rid) or rid not in known for rid in ids)
            or (focus and focus not in ids)):
        raise ValueError("routes must contain at most 8 known route IDs; focus must be one of them")
    return ids, focus


def positions(service, query: dict) -> tuple[dict, int]:
    """노선별 버스 위치(BusLiveService)."""
    now = service.clock()   # 기준 시각은 검사 전에(옛 순서 그대로)
    if service.data_error:
        return service.catalog_error(now), 503
    try:
        ids, focus = parse_routes(query, service.routes)
    except ValueError as error:
        return invalid(str(error)), 400
    return service.snapshot(ids, focus, now), 200


def arrivals(service, query: dict) -> tuple[dict, int]:
    """정류장 하나의 도착 정보(BusArrivalService)."""
    now = service.clock()   # 기준 시각은 정류장 목록을 다시 읽기 전에(옛 순서 그대로)
    service.refresh_stops()
    if service.data_error:
        return service.catalog_error(now), 503
    values = query.get("stop", [])
    stop = values[0].strip() if len(values) == 1 else ""
    if not re.fullmatch(r"\d{5}", stop) or stop not in service.stops or query.get("routes"):
        return invalid("stop must be one known 5-digit stop number"), 400
    return service.snapshot(stop, now, fresh=query.get("fresh", [""])[0] == "1"), 200


def snapshot(services, query: dict) -> tuple[dict, int]:
    """stop= 이 있으면(값이 비어도) 정류장 도착 정보, 아니면 버스 위치. (body, status)."""
    if "stop" in query:
        return arrivals(services.arrivals, query)
    return positions(services.bus, query)


def make_handler(services):
    """버스만 따로 띄울 때(python3 server/bus_live_proxy.py)의 HTTP 처리. 통합 서버와 응답 모양이 조금 다르다(그대로 둔다)."""
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            if len(self.path) > 2048:
                body, status = {"ok": False, "error": "invalid_request"}, 400
            elif parsed.path in ("/api/bus/live", "/bus/live", "/live"):
                body, status = snapshot(services, urllib.parse.parse_qs(parsed.query))
            elif parsed.path in ("/health", "/api/bus/health"):
                bus = services.bus
                body, status = {"ok": not bus.data_error, "mode": bus.mode, "routeCount": len(bus.routes)}, 200
            else:
                body, status = {"ok": False, "error": "not_found"}, 404
            raw = json.dumps(body, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, format, *args):
            pass  # Never log request queries or key-bearing upstream errors.

    return Handler
