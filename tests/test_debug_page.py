"""디버깅 페이지(주인만): 탑승 기록 · 캡처 받기 · 노선 찾기 (덕배 2026-10-12)."""

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from types import SimpleNamespace

from server.routes.http import Server, make_handler
from server.routes.owner import safe_next
from server.services.debug import DebugService
from server.store.debug_log import DebugStore

NOW = 1791800000.0   # 2026-10-12 KST 저녁
GOOD = "good-token"


class DebugPageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        routes = {"100100438": {"id": "100100438", "name": "3011", "start": "장지공영차고지", "end": "한남동"},
                  "1": {"id": "1", "name": "301", "start": "가", "end": "나"}, "2": {"id": "2", "name": "3012"}}
        debug = DebugService(DebugStore(self.root), bus_routes=lambda: routes, clock=lambda: NOW)
        services = SimpleNamespace(debug=debug, auth=SimpleNamespace(valid_token=lambda v: v == GOOD))
        self.server = Server(("127.0.0.1", 0), make_handler(services, 0))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.temp.cleanup()

    def call(self, path, body=None, cookie=GOOD, ctype="application/json"):
        headers = {"Content-Type": ctype}
        if cookie:
            headers["Cookie"] = f"other=1; syung_owner={cookie}"
        request = urllib.request.Request(self.base + path, data=body, headers=headers, method="POST" if body is not None else "GET")
        try:
            with urllib.request.urlopen(request) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_ride_events_are_cleaned_and_saved_per_day(self):
        t = NOW * 1000
        events = [{"ride": "r1", "kind": "start", "mode": "bus", "routeId": "100100438", "routeName": "3011", "t": t},
                  {"ride": "r1", "kind": "gps", "mode": "bus", "t": t + 5000, "lat": 37.5, "lng": 127.1, "acc": 8, "secret": "x"},
                  {"ride": "r1", "kind": "arrive", "mode": "bus", "t": t + 9000, "station": "잠실역"}]
        status, body = self.call("/admin/debug/ride", json.dumps({"events": events}).encode())
        self.assertEqual((status, body), (200, {"ok": True, "saved": 3}))
        rows = [json.loads(l) for l in (self.root / "rides" / "20261012.jsonl").read_text().splitlines()]
        self.assertEqual(rows[1]["lat"], 37.5); self.assertNotIn("secret", rows[1], "정해진 칸만 남긴다")
        self.assertEqual(rows[0]["receivedAt"], NOW * 1000)
        status, body = self.call("/admin/debug/recent")
        self.assertEqual(body["rides"][0] | {}, {"ride": "r1", "mode": "bus", "line": "3011", "from": t, "to": t + 9000, "stops": 1, "gps": 1,
                                                 "taps": [{"kind": "arrive", "t": t + 9000, "station": "잠실역"}]})

    def test_recent_can_show_a_past_day(self):
        (self.root / "rides").mkdir()
        (self.root / "rides" / "20261010.jsonl").write_text(json.dumps(
            {"ride": "old", "kind": "arrive", "mode": "subway", "line": "7호선", "t": 1, "station": "청담"}) + "\n")
        status, body = self.call("/admin/debug/recent")
        self.assertEqual((body["day"], body["days"], body["rides"]), ("20261012", ["20261012", "20261010"], []), "오늘이 맨 위, 없어도 고를 수 있다")
        status, body = self.call("/admin/debug/recent?day=20261010")
        self.assertEqual([r["ride"] for r in body["rides"]], ["old"])
        status, body = self.call("/admin/debug/recent?day=../../etc")
        self.assertEqual(body["day"], "20261012", "날짜 꼴이 아니면 오늘")

    def test_cancel_mark_drops_the_tap_before_it(self):
        t = NOW * 1000
        events = [{"ride": "r2", "kind": "arrive", "mode": "subway", "t": t, "station": "건대입구"},
                  {"ride": "r2", "kind": "depart", "mode": "subway", "t": t + 40000, "station": "건대입구"},
                  {"ride": "r2", "kind": "mark", "mode": "subway", "t": t + 47000, "note": "바로 앞 도착 · 출발 취소"},
                  {"ride": "r2", "kind": "depart", "mode": "subway", "t": t + 49000, "station": "건대입구"}]
        self.assertEqual(self.call("/admin/debug/ride", json.dumps({"events": events}).encode())[0], 200)
        ride = self.call("/admin/debug/recent")[1]["rides"][0]
        self.assertEqual([(x["kind"], x["t"] - t) for x in ride["taps"]], [("arrive", 0), ("depart", 49000)])

    def test_bad_events_are_refused_whole(self):
        for events in [[], [{"ride": "r", "kind": "fly", "mode": "bus", "t": NOW * 1000}], [{"kind": "gps", "mode": "bus", "t": 1}]]:
            status, body = self.call("/admin/debug/ride", json.dumps({"events": events}).encode())
            self.assertEqual(status, 400); self.assertEqual(body["error"]["code"], "bad_request")
        self.assertFalse((self.root / "rides").exists())

    def test_motion_keeps_numbers_and_nulls_only(self):
        t = NOW * 1000
        m = [-4900, 0.123, 9.8, None, 0.01, None, None, 1.5, -2, 3]
        status, body = self.call("/admin/debug/ride", json.dumps({"events": [
            {"ride": "r1", "kind": "motion", "mode": "subway", "line": "7호선", "t": t, "m": m}]}).encode())
        self.assertEqual((status, body), (200, {"ok": True, "saved": 1}))
        row = json.loads((self.root / "rides" / "20261012.jsonl").read_text())
        self.assertEqual(row["m"], [-4900, 0.12, 9.8, None, 0.01, None, None, 1.5, -2, 3])
        for bad in ([], ["x"], [True], [1e9], list(range(1501)), "1,2"):
            status, _ = self.call("/admin/debug/ride", json.dumps({"events": [
                {"ride": "r1", "kind": "motion", "mode": "subway", "t": t, "m": bad}]}).encode())
            self.assertEqual(status, 400, bad)

    def test_only_the_owner(self):
        for path, body in [("/admin/debug/ride", b'{"events":[]}'), ("/admin/debug/shot", b"png"), ("/admin/debug/recent", None),
                           ("/admin/debug/bus-route?name=3011", None), ("/admin/next-api", None), ("/admin/next-api", b"x")]:
            for cookie in (None, "wrong"):
                status, answer = self.call(path, body, cookie=cookie)
                self.assertEqual((status, answer["error"]["code"]), (401, "login"), path)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_shot_keeps_file_note_and_state(self):
        from urllib.parse import quote
        state = json.dumps({"ua": "iPhone", "w": 390})
        status, body = self.call(f"/admin/debug/shot?note={quote('7호선 중곡 도착')}&state={quote(state)}", b"\x89PNG....", ctype="image/png")
        self.assertEqual(status, 200)
        self.assertEqual((self.root / "shots" / body["file"]).read_bytes(), b"\x89PNG....")
        status, recent = self.call("/admin/debug/recent")
        self.assertEqual(recent["shots"][0]["note"], "7호선 중곡 도착")
        meta = json.loads((self.root / "shots.jsonl").read_text())
        self.assertEqual(meta["state"], {"ua": "iPhone", "w": 390})
        status, body = self.call("/admin/debug/shot", b"MZ", ctype="application/x-msdownload")
        self.assertEqual(status, 400)

    def test_bus_route_search_exact_first(self):
        status, body = self.call("/admin/debug/bus-route?name=301")
        self.assertEqual([r["name"] for r in body["routes"]], ["301", "3011", "3012"])
        self.assertEqual(self.call("/admin/debug/bus-route?name=3011")[1]["routes"][0]["id"], "100100438")

    def test_admin_paths_only(self):
        # 옛 주소(/debug/…)와 모르는 관리 주소는 주인이어도 없다
        for path, body in [("/debug/recent", None), ("/debug/ride", b'{"events":[]}'), ("/admin/nothing", None), ("/admin/nothing", b"x")]:
            request = urllib.request.Request(self.base + path, data=body, headers={"Cookie": f"syung_owner={GOOD}"},
                                             method="POST" if body is not None else "GET")
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request)
            self.assertEqual(caught.exception.code, 404, path)

    def test_login_returns_to_the_debug_page(self):
        self.assertEqual(safe_next("/admin/debug"), "/admin/debug")
        self.assertEqual(safe_next("/debug"), "/admin/learning")
        self.assertEqual(safe_next("//evil"), "/admin/learning")


if __name__ == "__main__":
    unittest.main()
