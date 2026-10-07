import io
import json
import tempfile
import threading
import unittest
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from server import bus_live_proxy as bus

R1, R2 = "100100001", "100100002"
ROUTES = {rid: {"id": rid, "path": [[126.98, 37.57], [126.99, 37.58]], "stopIds": []} for rid in (R1, R2)}
ROW = {"vehId": "12345", "gpsX": "126.98", "gpsY": "37.57", "sectOrd": "4",
       "stopFlag": "1", "islastyn": "1", "dataTm": "20261003000000", "isrunyn": "1"}


class PayloadTest(unittest.TestCase):
    def test_xml_json_and_singleton(self):
        raw = b'<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody><itemList><vehId>12345</vehId></itemList></msgBody></ServiceResult>'
        self.assertEqual(bus.parse_payload(raw), [{"vehId": "12345"}])
        for items in ([ROW], ROW):
            raw = json.dumps({"msgHeader": {"headerCd": "0"}, "msgBody": {"itemList": items}}).encode()
            self.assertEqual(bus.parse_payload(raw), [ROW])

    def test_empty_is_success_but_auth_and_malformed_are_not(self):
        self.assertEqual(bus.parse_payload(b'<ServiceResult><msgHeader><headerCd>8</headerCd></msgHeader></ServiceResult>'), [])
        with self.assertRaises(bus.BusError) as route_error:
            bus.parse_payload(b'<ServiceResult><msgHeader><headerCd>4</headerCd></msgHeader></ServiceResult>')
        self.assertEqual(route_error.exception.code, "upstream_route")
        for raw in (b"<html>upstream down</html>", b"{}", b"garbage", b'{"msgHeader":{"headerCd":0},"msgBody":[]}',
                    b'<!DOCTYPE x [<!ENTITY secret "x">]><x/>'):
            with self.subTest(raw=raw), self.assertRaises(bus.BusError):
                bus.parse_payload(raw)
        with self.assertRaises(bus.BusError) as caught:
            bus.parse_payload(b'<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><errMsg>SECRET</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>')
        self.assertEqual(caught.exception.code, "upstream_auth")
        self.assertNotIn("SECRET", str(caught.exception))

    def test_coordinates_times_flags_and_no_invented_speed(self):
        position = bus.normalize_positions([ROW], R1)[0]
        self.assertEqual(position["receivedAt"], "2026-10-02T15:00:00+00:00")
        self.assertEqual(position["stopSequence"], 4)
        self.assertTrue(position["lastBus"] and position["atStop"])
        self.assertIsNone(position["speedKph"])
        self.assertIsNone(position["heading"])
        self.assertEqual(bus.measurement_time("2026-10-03 00:00:00"), position["receivedAt"])
        self.assertIsNone(bus.measurement_time("bad"))
        self.assertIsNone(bus.normalize_positions([{**ROW, "dataTm": ""}], R1)[0]["receivedAt"])

    def test_invalid_and_inactive_vehicles_never_become_map_points(self):
        rows = [{**ROW, "gpsX": value} for value in ("nan", "inf", "200000", "0", "")]
        rows += [{**ROW, "isrunyn": "0"}, {**ROW, "isrunyn": "N"}, {**ROW, "vehId": ""},
                 {"vehId": "1", "posX": "200000", "posY": "400000"}, {**ROW, "routeId": R2}]
        self.assertEqual(bus.normalize_positions(rows, R1), [])

    def test_duplicate_vehicle_uses_latest_measurement(self):
        rows = [{**ROW, "dataTm": "20261003000010", "gpsX": "127"}, ROW]
        self.assertEqual(len(bus.normalize_positions(rows, R1)), 1)
        self.assertEqual(bus.normalize_positions(rows, R1)[0]["lng"], 127)

    def test_key_encoded_once_and_never_in_config_repr(self):
        urls = []
        class Response(io.BytesIO):
            pass
        def opener(request, timeout):
            urls.append(request.full_url)
            return Response(b'{"msgHeader":{"headerCd":"0"},"msgBody":{"itemList":[]}}')
        with patch.object(bus.urllib.request, "urlopen", side_effect=opener):
            for key in ("secret+/=", "secret%2B%2F%3D"):
                config = bus.Config(key=key)
                self.assertNotIn("secret", repr(config))
                self.assertEqual(bus.fetch_positions(R1, config), [])
        self.assertEqual(urls[0], urls[1])
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlsplit(urls[0]).query)["serviceKey"], ["secret+/="])


class ProxyTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.now = datetime(2026, 10, 2, 15, tzinfo=timezone.utc).timestamp()  # KST midnight
        self.path = Path(self.directory.name) / "quota.json"
        self.calls = []

    def config(self, **kwargs):
        return bus.Config(key="test-secret", quota_file=self.path, **kwargs)

    def fetch(self, rid, config):
        self.calls.append(rid)
        return [ROW]

    def proxy(self, **kwargs):
        return bus.BusProxy(self.config(**kwargs), routes=ROUTES, fetch=self.fetch, clock=lambda: self.now)

    def get(self, proxy, *ids, focus=None):
        query = {"routes": [",".join(ids)]}
        if focus:
            query["focus"] = [focus]
        body, status = proxy.snapshot(query)
        self.assertEqual(status, 200)
        return body

    def test_missing_key_and_empty_view_never_fetch(self):
        proxy = bus.BusProxy(bus.Config(quota_file=self.path), routes=ROUTES, fetch=self.fetch, clock=lambda: self.now)
        body = self.get(proxy, R1)
        self.assertFalse(body["ok"])
        self.assertEqual(body["mode"], "unavailable")
        self.assertEqual(body["buses"], [])
        self.get(self.proxy())
        self.assertEqual(self.calls, [])
        self.assertFalse(self.path.exists())

    def test_mock_requires_explicit_mode_and_marks_every_vehicle(self):
        proxy = self.proxy(mode="mock")
        body = self.get(proxy, R1, R2)
        self.assertTrue(body["ok"])
        self.assertEqual(body["mode"], "mock")
        self.assertEqual(body["busCount"], 2)
        self.assertTrue(all(b["mock"] and b["id"].startswith("mock:") for b in body["buses"]))
        self.assertEqual(self.calls, [])
        self.assertFalse(self.path.exists())

    def test_invalid_unknown_excess_routes_and_focus_are_rejected_without_quota(self):
        proxy = self.proxy()
        for query in ({"routes": ["../../secret"]}, {"routes": ["999999999"]},
                      {"routes": [R1], "focus": [R2]}, {"focus": [R1]},
                      {"routes": [R1], "focus": [R1, R1]},
                      {"routes": [",".join(str(100100000+i) for i in range(10))]}):
            with self.subTest(query=query):
                self.assertEqual(proxy.snapshot(query)[1], 400)
        self.assertEqual(self.calls, [])

    def test_focus_cache_and_global_pacing(self):
        proxy = self.proxy()
        body = self.get(proxy, R1, R2, focus=R2)
        self.assertEqual(self.calls, [R2])
        self.assertEqual(body["routes"][R2]["status"], "fresh")
        self.assertEqual(body["routes"][R1]["status"], "deferred")
        self.now += 10
        body = self.get(proxy, R2)
        self.assertEqual(body["routes"][R2]["status"], "cached")
        self.assertEqual(body["quota"]["used"], 1)
        self.now += 82
        body = self.get(proxy, R2, R1)
        self.assertEqual(self.calls, [R2, R1])
        self.assertEqual(body["routes"][R2]["status"], "stale")

    def test_answers_are_recorded_per_kst_day_without_plate_numbers(self):
        folder = Path(self.directory.name) / "bus"
        self.fetch = lambda rid, config: (self.calls.append(rid), [{**ROW, "plainNo": "서울70사1234", "sectDist": "120"}])[1]
        self.get(self.proxy(record_dir=folder), R1)
        rows = [json.loads(x) for x in (folder / "20261003.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["routeId"], R1)
        self.assertEqual(rows[0]["sectOrd"], "4")
        self.assertEqual(rows[0]["sectDist"], "120")
        self.assertNotIn("plainNo", rows[0])
        self.assertEqual(rows[0]["fetchedAt"], bus.iso(self.now))

    def test_unwritable_record_folder_still_serves_buses(self):
        blocker = Path(self.directory.name) / "file"
        blocker.write_text("x")
        body = self.get(self.proxy(record_dir=blocker / "bus"), R1)
        self.assertEqual(body["busCount"], 1)

    def test_round_robin_does_not_starve_visible_routes(self):
        proxy = self.proxy()
        for _ in range(4):
            self.get(proxy, R1, R2)
            self.now += 92
        self.assertEqual(self.calls, [R1, R2, R1, R2])

    def test_restart_does_not_reset_quota_or_pacing(self):
        self.get(self.proxy(), R1)
        restarted = self.proxy()
        self.assertEqual(self.get(restarted, R1)["quota"]["used"], 1)
        self.assertEqual(self.calls, [R1])
        self.now += 92
        self.assertEqual(self.get(restarted, R1)["quota"]["used"], 2)

    def test_kst_rollover_and_hard_daily_limit(self):
        proxy = self.proxy(daily_limit=1)
        self.get(proxy, R1)
        self.now += 120
        body = self.get(proxy, R2)
        self.assertEqual(body["routes"][R2]["reason"], "daily_limit")
        self.assertEqual(len(self.calls), 1)
        self.now += 86400
        body = self.get(proxy, R2)
        self.assertEqual(body["quota"]["day"], "2026-10-04")
        self.assertEqual(body["quota"]["used"], 1)
        self.assertEqual(len(self.calls), 2)

    def test_network_failures_count_and_hide_raw_secrets(self):
        proxy = self.proxy()
        def fail(*args):
            raise RuntimeError("http://upstream/?serviceKey=test-secret")
        proxy.fetch = fail
        body = self.get(proxy, R1)
        self.assertEqual(body["quota"]["used"], 1)
        self.assertEqual(body["routes"][R1]["status"], "error")
        self.assertNotIn("test-secret", json.dumps(body))
        self.get(proxy, R1)
        self.assertEqual(proxy.ledger.view(self.now)["used"], 1)

    def test_bad_quota_file_stops_calls_instead_of_resetting_budget(self):
        self.path.write_text("broken")
        body = self.get(self.proxy(), R1)
        self.assertEqual(self.calls, [])
        self.assertIsNone(body["quota"]["used"])
        self.assertIn("quota_storage", [e["code"] for e in body["errors"]])

    def test_stale_fallback_expires(self):
        proxy = self.proxy()
        self.get(proxy, R1)
        def fail(*args):
            raise bus.BusError("upstream_error")
        proxy.fetch = fail
        self.now += 92
        body = self.get(proxy, R1)
        self.assertEqual(body["routes"][R1]["status"], "stale")
        self.assertEqual(body["busCount"], 1)
        self.now += 300
        self.assertEqual(self.get(proxy, R1)["busCount"], 0)

    def test_concurrent_identical_requests_share_one_upstream_attempt(self):
        entered, release = threading.Event(), threading.Event()
        proxy = self.proxy()
        def slow(rid, config):
            entered.set()
            release.wait(3)
            return self.fetch(rid, config)
        proxy.fetch = slow
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(self.get, proxy, R1)
            self.assertTrue(entered.wait(2))
            second = self.get(proxy, R1)
            self.assertEqual(second["routes"][R1]["reason"], "in_flight")
            release.set()
            self.assertEqual(first.result()["busCount"], 1)
        self.assertEqual(self.calls, [R1])
        self.assertEqual(proxy.ledger.view(self.now)["used"], 1)

    def test_independent_ledgers_share_atomic_pacing(self):
        def attempt(_):
            return bus.QuotaLedger(self.config()).reserve(self.now)[0]
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(16)))
        self.assertEqual(sum(results), 1)

    def test_explicit_static_batch_still_obeys_hard_limit_and_live_gate(self):
        ledger = bus.QuotaLedger(self.config(daily_limit=2))
        self.assertTrue(ledger.reserve(self.now, paced=False)[0])
        self.assertFalse(ledger.reserve(self.now)[0])
        self.assertTrue(ledger.reserve(self.now, paced=False)[0])
        self.assertEqual(ledger.reserve(self.now, paced=False)[1], "daily_limit")
        self.assertEqual(ledger.view(self.now)["used"], 2)

    def test_static_jobs_cannot_race_through_reserved_live_budget(self):
        def attempt(_):
            return bus.QuotaLedger(self.config(daily_limit=5)).reserve(self.now, paced=False, reserve_calls=3)[0]
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(attempt, range(12)))
        self.assertEqual(sum(results), 2)
        self.assertEqual(bus.QuotaLedger(self.config(daily_limit=5)).view(self.now)["remaining"], 3)

    def test_http_mock_contract_and_input_error(self):
        proxy = self.proxy(mode="mock")
        server = bus.ThreadingHTTPServer(("127.0.0.1", 0), bus.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        with patch.object(bus, "_proxy", proxy):
            thread.start()
            try:
                base = f"http://127.0.0.1:{server.server_port}"
                with urllib.request.urlopen(f"{base}/api/bus/live?routes={R1}") as response:
                    self.assertEqual(response.headers["Cache-Control"], "no-store")
                    self.assertEqual(json.load(response)["mode"], "mock")
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(f"{base}/api/bus/live?routes=wrong")
                self.assertEqual(caught.exception.code, 400)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(2)


if __name__ == "__main__":
    unittest.main()
