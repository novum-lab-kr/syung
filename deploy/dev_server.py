#!/usr/bin/env python3
"""Local development server: the map straight from the repo, live trains from production.

    python3 deploy/dev_server.py            # http://localhost:8080
    python3 deploy/dev_server.py 9000       # another port

Serves web/ and the built data files at the same paths as the deployed site (no copy step: edit
web/maplibre_runtime.mjs and reload). /api/live is forwarded to the production proxy, so no Seoul API
key is needed locally. Set SUBWAY_LIVE_UPSTREAM to use another proxy (e.g. http://127.0.0.1:3113/live).
"""

from __future__ import annotations

import os
import sys
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = os.environ.get("SUBWAY_LIVE_UPSTREAM", "https://syung.novum-lab.com/api/live")
# published path → file in the repo
DATA = {
    "/track_shapes.json": ROOT / "data" / "osm-tracks" / "track_shapes.json",
    "/exits.json": ROOT / "data" / "osm-tracks" / "exits.json",
    "/edge_times.json": ROOT / "data" / "ktdb-gtfs-2025" / "edge_times.json",
    "/coaster_buildings.bin": ROOT / "data" / "osm-tracks" / "coaster_buildings.bin",
    "/coaster_towers.json": ROOT / "data" / "osm-tracks" / "coaster_towers.json",
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # always the file you just edited
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.endswith("/api/live"):
            query = self.path.split("?", 1)[1] if "?" in self.path else ""
            try:
                req = urllib.request.Request(f"{UPSTREAM}?{query}", headers={"User-Agent": "subway-live-map-dev/1.0"})
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
