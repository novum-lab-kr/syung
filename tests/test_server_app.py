"""가짜 배경 작업·서비스와 임시 포트로 서버 조립·HTTP 응답의 기존 계약을 확인한다."""

import http.client
import json
import threading
import unittest
import urllib.error
from types import SimpleNamespace
from unittest.mock import Mock, call, patch

from server import app
from server.config import SubwayConfig
from server.jobs import burst
from server.jobs.warm_journey import warm_journey
from server.routes.errors import api_error
from server.routes import http as http_routes


class StopLoop(Exception):
    """실제 대기 없이 지정한 수집 차례만 실행하고 끝낸다."""


class BurstTest(unittest.TestCase):
    def setUp(self):
        self.events = []
        self.live = SimpleNamespace(
            config=SubwayConfig(burst_lines=["2호선", "9호선"], burst_every=7200),
            quiet=Mock(return_value=False), calls_left=Mock(return_value=150),
            fetch_line=Mock(side_effect=self.fetch), save_positions=Mock(side_effect=self.save),
        )

    def fetch(self, line):
        data = {"line": line, "sample": self.live.fetch_line.call_count}
        self.events.append(("fetch", line))
        return data

    def save(self, data):
        self.events.append(("save", data))

    def run_rounds(self, rounds):
        outer = 0

        def sleep(seconds):
            nonlocal outer
            self.events.append(("sleep", seconds))
            if seconds == 7200:
                outer += 1
                if outer > rounds:
                    raise StopLoop

        with self.assertRaises(StopLoop):
            burst.burst_loop(self.live, sleep=sleep)

    def test_quiet_or_no_lines_skips_calls_and_reserve_check(self):
        for quiet, lines in ((True, ["2호선"]), (False, [])):
            with self.subTest(quiet=quiet, lines=lines):
                self.live.quiet.return_value = quiet
                self.live.config.burst_lines = lines
                self.run_rounds(1)
        self.live.calls_left.assert_not_called()
        self.live.fetch_line.assert_not_called()
        self.live.save_positions.assert_not_called()
        self.assertEqual(self.live.quiet.call_count, 2)

    def test_less_than_150_calls_left_skips_collection(self):
        self.live.calls_left.return_value = 149
        self.run_rounds(1)
        self.live.calls_left.assert_called_once_with()
        self.live.fetch_line.assert_not_called()
        self.live.save_positions.assert_not_called()

    def test_lines_rotate_with_eight_saves_and_45_second_gaps(self):
        self.run_rounds(3)
        self.assertEqual(self.live.fetch_line.call_args_list,
                         [call("2호선")] * 8 + [call("9호선")] * 8 + [call("2호선")] * 8)
        self.assertEqual(self.live.calls_left.call_count, 3)
        self.assertEqual(self.live.save_positions.call_count, 24)
        offset = 0
        for line in ("2호선", "9호선", "2호선"):
            self.assertEqual(self.events[offset], ("sleep", 7200))
            offset += 1
            for _ in range(8):
                fetch, save, sleep = self.events[offset:offset + 3]
                self.assertEqual(fetch, ("fetch", line))
                self.assertEqual(save[0], "save")
                self.assertEqual(save[1]["line"], line)
                self.assertEqual(sleep, ("sleep", 45))
                offset += 3
        self.assertEqual(self.events[offset:], [("sleep", 7200)])

    def test_skipped_round_does_not_advance_line(self):
        self.live.quiet.side_effect = [True, False, False, False]
        self.live.calls_left.side_effect = [150, 149, 150]
        self.run_rounds(4)
        self.assertEqual(self.live.fetch_line.call_args_list, [call("2호선")] * 8 + [call("9호선")] * 8)
        self.assertEqual(self.live.save_positions.call_count, 16)

    def test_fetch_failure_stops_current_round_then_rotates(self):
        for error in (OSError("offline"), ValueError("bad json"), RuntimeError("quota"),
                      urllib.error.URLError("unreachable")):
            with self.subTest(error=type(error).__name__):
                self.events.clear()
                self.live.fetch_line.reset_mock()
                self.live.save_positions.reset_mock()

                def fetch(line):
                    if self.live.fetch_line.call_count == 2:
                        raise error
                    return self.fetch(line)

                self.live.fetch_line.side_effect = fetch
                self.run_rounds(2)
                self.assertEqual(self.live.fetch_line.call_args_list, [call("2호선")] * 2 + [call("9호선")] * 8)
                self.assertEqual(self.live.save_positions.call_count, 9)
                self.assertEqual(self.events.count(("sleep", 45)), 9)
                self.assertEqual(self.live.save_positions.call_args_list,
                                 [call({"line": "2호선", "sample": 1})]
                                 + [call({"line": "9호선", "sample": n}) for n in range(3, 11)])

    def test_save_failure_propagates_before_gap(self):
        self.live.save_positions.side_effect = OSError("disk full")
        with self.assertRaisesRegex(OSError, "disk full"):
            burst.burst_loop(self.live, sleep=lambda seconds: self.events.append(("sleep", seconds)))
        self.live.fetch_line.assert_called_once_with("2호선")
        self.assertNotIn(("sleep", 45), self.events)


class BackgroundTest(unittest.TestCase):
    def test_warm_failure_prints_original_message_and_returns(self):
        journey = SimpleNamespace(warm=Mock(side_effect=RuntimeError("fixture failure")))
        with patch("builtins.print") as output:
            warm_journey(SimpleNamespace(journey=journey))
        journey.warm.assert_called_once_with()
        output.assert_called_once_with("journey warm-up failed: fixture failure", flush=True)

    def test_warm_success_does_not_print(self):
        journey = SimpleNamespace(warm=Mock())
        with patch("builtins.print") as output:
            warm_journey(SimpleNamespace(journey=journey))
        journey.warm.assert_called_once_with()
        output.assert_not_called()

    def test_bus_failure_prints_only_exception_type(self):
        service = SimpleNamespace(bus=object())
        with patch.object(app, "background_loop", side_effect=RuntimeError("https://fixture.invalid/?key=fixture-secret")) as run, \
                patch("builtins.print") as output:
            app._bus_samples(service)
        run.assert_called_once_with(service.bus)
        output.assert_called_once_with("bus samples stopped: RuntimeError", flush=True)


class AppTest(unittest.TestCase):
    def run_main(self, every):
        events = []
        config = SubwayConfig(host="127.0.0.1", port=38199, burst_every=every, response_seconds=1.75)
        services = SimpleNamespace(
            live=SimpleNamespace(load_quota=Mock(side_effect=lambda: events.append("load"))),
            journey=object(), bus=object(), health=object(),
        )
        threads = []

        def thread(*, target, args, daemon):
            events.append("thread")
            threads.append((target, args, daemon))
            return SimpleNamespace(start=lambda: events.append("start"))

        handler = object()

        def make_handler(service, seconds):
            events.append("handler")
            self.assertIs(service, services)
            self.assertEqual(seconds, 1.75)
            return handler

        def server(address, actual_handler):
            events.append("server")
            self.assertEqual(address, ("127.0.0.1", 38199))
            self.assertIs(actual_handler, handler)
            return SimpleNamespace(serve_forever=lambda: events.append("serve"))

        with patch.object(app.SubwayConfig, "from_env", return_value=config), \
                patch.object(app, "default_services", return_value=services), \
                patch.object(app.threading, "Thread", side_effect=thread), \
                patch.object(app, "make_handler", side_effect=make_handler), \
                patch.object(app, "Server", side_effect=server):
            app.main()
        return events, threads, services

    def test_main_loads_quota_then_starts_warm_burst_bus_then_server(self):
        events, threads, services = self.run_main(7200)
        self.assertEqual(events, ["load"] + ["thread", "start"] * 5 + ["handler", "server", "serve"])
        self.assertEqual(threads, [(app.warm_journey, (services,), True),
                                   (app.burst_loop, (services.live,), True),
                                   (app._bus_samples, (services,), True),
                                   (app.baseline_loop, (services.health,), True),
                                   (app.probe_loop, (services.live, 30), True)])

    def test_main_without_burst_starts_only_warm_and_bus_threads(self):
        events, threads, services = self.run_main(0)
        self.assertEqual(events, ["load"] + ["thread", "start"] * 4 + ["handler", "server", "serve"])
        self.assertEqual(threads, [(app.warm_journey, (services,), True), (app._bus_samples, (services,), True),
                                   (app.baseline_loop, (services.health,), True), (app.probe_loop, (services.live, 30), True)])

    def test_main_continues_after_journey_creation_fails_in_warm_thread(self):
        events = []

        class BrokenServices:
            live = SimpleNamespace(load_quota=Mock(side_effect=lambda: events.append("load")))
            health = object()

            @property
            def journey(self):
                events.append("journey")
                raise ValueError("invalid JOURNEY_WORKERS")

        services = BrokenServices()

        def thread(*, target, args, daemon):
            def start():
                if target is app.warm_journey:
                    events.append("warm-start")
                    # 가짜 start 안에서 warm을 실행해, 잡은 예외가 main으로 새지 않는지 확인한다.
                    target(*args)
                elif target in (app.baseline_loop, app.probe_loop):
                    pass
                else:
                    self.assertIs(target, app._bus_samples)
                    events.append("bus-start")
            return SimpleNamespace(start=start)

        config = SubwayConfig(burst_every=0, probe_every=0)
        handler = object()
        with patch.object(app.SubwayConfig, "from_env", return_value=config), \
                patch.object(app, "default_services", return_value=services), \
                patch.object(app.threading, "Thread", side_effect=thread) as threads, \
                patch.object(app, "make_handler", return_value=handler) as make_handler, \
                patch.object(app, "Server") as server, \
                patch("builtins.print", side_effect=lambda *args, **kwargs: events.append("log")) as output:
            server.return_value.serve_forever.side_effect = lambda: events.append("serve")
            app.main()

        self.assertEqual(events, ["load", "warm-start", "journey", "log", "bus-start", "serve"])
        output.assert_called_once_with("journey warm-up failed: invalid JOURNEY_WORKERS", flush=True)
        self.assertEqual(threads.call_args_list,
                         [call(target=app.warm_journey, args=(services,), daemon=True),
                          call(target=app._bus_samples, args=(services,), daemon=True),
                          call(target=app.baseline_loop, args=(services.health,), daemon=True)])
        make_handler.assert_called_once_with(services, config.response_seconds)
        server.assert_called_once_with((config.host, config.port), handler)
        server.return_value.serve_forever.assert_called_once_with()

    def test_main_bus_loads_catalog_before_starting_standalone_server(self):
        events = []

        class Services:
            @property
            def bus(self):
                events.append("bus")
                return object()

        services, handler = Services(), object()
        with patch.object(app, "default_services", return_value=services), \
                patch.object(app.BusServerConfig, "from_env", side_effect=lambda: (events.append("config") or SimpleNamespace(host="127.0.0.1", port=38198))), \
                patch.object(app.bus_routes, "make_handler", return_value=handler) as make, \
                patch.object(app, "ThreadingHTTPServer") as server:
            server.side_effect = lambda address, cls: (events.append("server") or SimpleNamespace(serve_forever=lambda: events.append("serve")))
            app.main_bus()
        self.assertEqual(events, ["bus", "config", "server", "serve"])
        make.assert_called_once_with(services)
        server.assert_called_once_with(("127.0.0.1", 38198), handler)


class ResponseCacheTest(unittest.TestCase):
    def test_new_api_error_has_only_code_and_message_in_error_object(self):
        self.assertEqual(api_error("invalid_request", "요청을 확인해 주세요"),
                         {"error": {"code": "invalid_request", "message": "요청을 확인해 주세요"}})

    def test_cache_keeps_503_bytes_until_exact_expiry(self):
        cache = http_routes.ResponseCache(2)
        with patch.object(http_routes.time, "time", return_value=1000):
            self.assertIsNone(cache.get("/live?a=1"))
            cache.put("/live?a=1", 503, b'{"ok":false}')
        with patch.object(http_routes.time, "time", return_value=1001.999):
            self.assertEqual(cache.get("/live?a=1"), (503, b'{"ok":false}'))
            self.assertIsNone(cache.get("/live?a=2"))
        with patch.object(http_routes.time, "time", return_value=1002):
            self.assertIsNone(cache.get("/live?a=1"))

    def test_cache_clears_only_when_already_over_2000(self):
        cache = http_routes.ResponseCache(2)
        with patch.object(http_routes.time, "time", return_value=1000):
            for number in range(2001):
                cache.put(f"/live?key={number}", 200, b"{}")
            self.assertEqual(cache.get("/live?key=0"), (200, b"{}"))
            cache.put("/live?key=2001", 503, b"failed")
            self.assertIsNone(cache.get("/live?key=0"))
            self.assertIsNone(cache.get("/live?key=2000"))
            self.assertEqual(cache.get("/live?key=2001"), (503, b"failed"))


class HttpTest(unittest.TestCase):
    def setUp(self):
        self.body = {"ok": True, "trains": [{"station": "서울역"}]}
        self.services = SimpleNamespace(
            live=SimpleNamespace(snapshot=Mock(return_value=self.body), snapshot_arrivals=Mock(return_value=self.body)),
            bus=Mock(), arrivals=Mock(),
        )
        self.start_server(20)

    def start_server(self, seconds):
        server = http_routes.Server(("127.0.0.1", 0), http_routes.make_handler(self.services, seconds))
        worker = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        worker.start()

        def close():
            server.shutdown()
            server.server_close()
            worker.join(timeout=2)

        self.addCleanup(close)
        self.address = server.server_address

    def get(self, path):
        connection = http.client.HTTPConnection(*self.address, timeout=3)
        try:
            connection.request("GET", path)
            response = connection.getresponse()
            return response.status, response.getheaders(), response.read()
        finally:
            connection.close()

    def test_health_returns_original_compact_json_and_headers(self):
        status, headers, body = self.get("/health?ignored=1")
        self.assertEqual(status, 200)
        self.assertEqual(body, b'{"ok":true}')
        self.assertEqual([name for name, _ in headers],
                         ["Server", "Date", "Content-Type", "Cache-Control", "X-Content-Type-Options", "Content-Length"])
        self.assertEqual(dict(headers)["Content-Type"], "application/json; charset=utf-8")
        self.assertEqual(dict(headers)["Cache-Control"], "public, max-age=30")
        self.assertEqual(dict(headers)["X-Content-Type-Options"], "nosniff")
        self.assertEqual(dict(headers)["Content-Length"], str(len(body)))
        self.services.live.snapshot.assert_not_called()

    def test_missing_address_returns_default_html_404(self):
        for path in ("/missing", "/live-extra", "/health/", "/bus/live/", "/api/bus/live/"):
            with self.subTest(path=path):
                status, headers, body = self.get(path)
                self.assertEqual(status, 404)
                self.assertEqual(dict(headers)["Content-Type"], "text/html;charset=utf-8")
                self.assertEqual(dict(headers)["Connection"], "close")
                self.assertEqual(dict(headers)["Content-Length"], str(len(body)))
                self.assertIn(b"<!DOCTYPE HTML>", body)
                self.assertIn(b"Error code: 404", body)
        self.services.live.snapshot.assert_not_called()

    def test_live_identical_path_reuses_service_response(self):
        path = "/live?lines=2&focused=1&focus=9"
        first, second = self.get(path), self.get(path)
        self.assertEqual(first[0], 200)
        self.assertEqual(first[2], second[2])
        self.assertEqual(first[2], json.dumps(self.body, ensure_ascii=False, separators=(",", ":")).encode())
        self.assertEqual(dict(first[1])["Cache-Control"], "no-store")
        self.services.live.snapshot.assert_called_once_with(["2"], focused=True, focus="9", watch=True)

    def test_live_cache_key_includes_full_query_order(self):
        for path in ("/live?lines=2&focused=1", "/live?focused=1&lines=2", "/live?lines=9"):
            self.assertEqual(self.get(path)[0], 200)
            self.assertEqual(self.get(path)[0], 200)
        self.assertEqual(self.services.live.snapshot.call_count, 3)

    def test_live_503_is_cached(self):
        self.services.live.snapshot.return_value = {"ok": False, "error": "fixture unavailable"}
        first = self.get("/live")
        self.services.live.snapshot.return_value = self.body
        second = self.get("/live")
        self.assertEqual(first[0], 503)
        self.assertEqual(second[0], 503)
        self.assertEqual(first[2], second[2])
        self.services.live.snapshot.assert_called_once()

    def test_zero_response_seconds_disables_cache(self):
        self.start_server(0)
        self.get("/live")
        self.get("/live")
        self.assertEqual(self.services.live.snapshot.call_count, 2)

    def test_bus_length_check_precedes_route_and_json_serialization(self):
        with patch.object(http_routes.bus_routes, "snapshot", return_value=({"ok": True, "name": "버스"}, 200)) as snapshot:
            for prefix in ("/bus/live?x=", "/api/bus/live?x="):
                with self.subTest(prefix=prefix):
                    snapshot.reset_mock()
                    path = prefix + "x" * (2049 - len(prefix))
                    status, headers, body = self.get(path)
                    self.assertEqual(status, 400)
                    self.assertEqual(body, b'{"ok":false,"error":"invalid_request"}')
                    self.assertEqual(dict(headers)["Cache-Control"], "no-store")
                    snapshot.assert_not_called()
                    status, _, body = self.get(path[:-1])
                    self.assertEqual(status, 200)
                    self.assertEqual(body, '{"ok": true, "name": "버스"}'.encode())
                    snapshot.assert_called_once()
            self.assertEqual(self.get("/bus/unknown?x=" + "x" * 2049)[0], 404)
        self.services.bus.assert_not_called()


if __name__ == "__main__":
    unittest.main()
