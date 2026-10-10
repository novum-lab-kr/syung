"""가짜 서울시 응답·고정 시각·임시 파일로 지하철 서비스의 기존 동작을 확인한다."""

import copy
import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import Mock, patch

from server.clock import KST
from server.config import SubwayConfig
from server.routes import live as live_routes
from server.services import live
from server.store import records


NOW = datetime(2026, 10, 10, 12, tzinfo=KST)
DAY = "2026-10-10"
STAMP = "2026-10-10 11:59:00"


class FixedDatetime(datetime):
    current = NOW

    @classmethod
    def now(cls, tz=None):
        return cls.current.astimezone(tz) if tz else cls.current.replace(tzinfo=None)


def arrival_row(train, station, *, direction="상행", destination="응암", code="1", eta="0", current=None):
    return {"subwayId": "1006", "btrainNo": train, "statnNm": station,
            "statnId": station, "bstatnNm": destination, "updnLine": direction,
            "arvlCd": code, "barvlDt": eta, "arvlMsg3": current or station,
            "recptnDt": STAMP}


def position_row(train="9001", station="당산", *, line="1009", direction="0"):
    return {"subwayId": line, "trainNo": train, "statnNm": station,
            "statnTnm": "개화", "updnLine": direction, "trainSttus": "1", "recptnDt": STAMP}


def train_row(train="keep", station="당산", *, line="9호선", stamp=STAMP, status="도착"):
    return {"line": line, "trainNo": train, "station": station, "destination": "중앙보훈병원",
            "direction": "하행", "status": status, "receivedAt": stamp}


class FakeSource:
    def __init__(self, *, all_result=None, line_result=None):
        self.all_result = all_result if all_result is not None else {"realtimeArrivalList": []}
        self.line_result = line_result if line_result is not None else {"realtimePositionList": [position_row()]}
        self.calls = []
        self.on_fetch = None

    def _result(self, operation, result):
        self.calls.append(operation)
        if self.on_fetch:
            self.on_fetch(operation)
        if isinstance(result, Exception):
            raise result
        return copy.deepcopy(result)

    def fetch_all(self):
        return self._result("all", self.all_result)

    def fetch_line(self, line):
        return self._result(line, self.line_result)


class LiveServiceTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        FixedDatetime.current = NOW
        for context in (
            patch.object(live, "datetime", FixedDatetime),
            patch.object(live.time, "time", return_value=NOW.timestamp()),
            patch.object(live, "kst_today", return_value=DAY),
            patch.object(records, "kst_today", return_value=DAY),
        ):
            context.start()
            self.addCleanup(context.stop)

    def service(self, source=None, **options):
        values = {"api_key": "synthetic", "quiet_hours": "", "daily_limit": 100000,
                  "position_budget": 100000, "quota_file": self.directory / "quota.json",
                  "burst_dir": self.directory / "positions"}
        values.update(options)
        return live.SubwayLiveService(SubwayConfig(**values), source=source if source is not None else FakeSource())

    def saved(self):
        return json.loads((self.directory / "quota.json").read_text(encoding="utf-8"))

    def test_normalize_arrivals_skips_next_trip_and_marks_idle(self):
        rows = [
            arrival_row("6283", "태릉입구", direction="하행", destination="신내", code="2"),
            arrival_row("6308", "신내", code="3", eta="1080", current="봉화산"),
            arrival_row("6312", "먹골", code="3", eta="600", current="태릉입구"),
        ]
        lines, skipped, idle = live.normalize_arrivals({"realtimeArrivalList": rows})
        self.assertEqual(skipped, {("6호선", "6308")})
        self.assertEqual(idle, {("6호선", "6312")})
        self.assertEqual([row["trainNo"] for row in lines["6호선"]], ["6283", "6312"])
        self.assertEqual(lines["6호선"][1]["station"], "태릉입구")
        self.assertEqual(lines["6호선"][1]["status"], "출발")

    def test_normalize_arrivals_sets_terminus_departure_time(self):
        other = arrival_row("6283", "태릉입구", direction="하행", destination="신내", code="2")
        for code, eta, station, current, expected in (
            ("1", "600", "신내", "신내", "2026-10-10 12:09:00"),
            ("3", "600", "봉화산", "신내", "2026-10-10 12:07:00"),
        ):
            with self.subTest(code=code):
                rows = [other, arrival_row("6316", station, code=code, eta=eta, current=current)]
                lines, _, _ = live.normalize_arrivals({"realtimeArrivalList": rows})
                waiting = next(row for row in lines["6호선"] if row["trainNo"] == "6316")
                self.assertEqual((waiting["station"], waiting["status"], waiting["departsAt"]),
                                 ("신내", "도착", expected))

    def test_fetch_all_installs_next_trip_and_idle_state(self):
        source = FakeSource(all_result={"realtimeArrivalList": [
            arrival_row("6283", "태릉입구", direction="하행", destination="신내"),
            arrival_row("6308", "신내", code="3", eta="1080", current="봉화산"),
            arrival_row("6312", "먹골", code="3", eta="600", current="태릉입구"),
        ]})
        service = self.service(source)
        service.snapshot_all(["6호선"])
        self.assertEqual(service.next_trips, {("6호선", "6308")})
        self.assertEqual(service.idle, {("6호선", "6312")})
        source.all_result = {"realtimeArrivalList": []}
        service._fetch_all()
        self.assertEqual((service.next_trips, service.idle), (set(), set()))

    def test_stabilize_retains_first_time_of_same_state(self):
        memory = {}
        first = live.stabilize({"9호선": [train_row()]}, memory)["9호선"][0]
        repeated = live.stabilize({"9호선": [train_row(stamp="2026-10-10 11:59:20")]}, memory)["9호선"][0]
        self.assertEqual(repeated["receivedAt"], first["receivedAt"])
        self.assertEqual(repeated["stampedAt"], "2026-10-10 11:59:20")
        self.assertEqual(memory[("9호선", "keep")]["snap"], repeated["stampedAt"])

    def test_stabilize_does_not_restore_older_or_same_stamp_other_state(self):
        for stamp in ("2026-10-10 11:58:59", STAMP):
            with self.subTest(stamp=stamp):
                memory = {}
                first = live.stabilize({"9호선": [train_row()]}, memory)["9호선"][0]
                back = live.stabilize({"9호선": [train_row(station="선유도", stamp=stamp, status="진입")]}, memory)
                self.assertEqual(back["9호선"][0], first)

    def test_call_count_is_saved_after_receiving_all_and_line(self):
        source = FakeSource()
        service = self.service(source)
        observations = []
        source.on_fetch = lambda operation: observations.append((operation, service.quota_used))
        service._fetch_all()
        self.assertEqual(self.saved(), {"day": DAY, "used": 1, "position": 0})
        body = service.fetch_line("9호선")
        self.assertEqual(observations, [("all", 0), ("9호선", 1)])
        self.assertEqual(self.saved(), {"day": DAY, "used": 2, "position": 0})
        self.assertEqual(body["quota"]["used"], 2)

    def test_transport_failure_is_not_counted_but_api_error_is_saved(self):
        for operation in ("all", "line"):
            with self.subTest(operation=operation):
                source = FakeSource(all_result=OSError("가짜 통신 실패"), line_result=OSError("가짜 통신 실패"))
                service = self.service(source)
                fetch = service._fetch_all if operation == "all" else lambda: service.fetch_line("9호선")
                with self.assertRaises(OSError):
                    fetch()
                self.assertEqual(service.quota_used, 0)
                error = {"code": "ERROR-337", "message": "가짜 API 오류"}
                source.all_result = source.line_result = error
                with self.assertRaisesRegex(RuntimeError, "가짜 API 오류"):
                    fetch()
                self.assertEqual(self.saved(), {"day": DAY, "used": 1, "position": 0})

    def test_save_failure_precedes_api_error_check(self):
        source = FakeSource(all_result={"code": "ERROR-337", "message": "API 오류"})
        service = self.service(source)
        with patch.object(service.quota_file, "write", side_effect=OSError("저장 실패")):
            with self.assertRaisesRegex(OSError, "저장 실패"):
                service._fetch_all()
        self.assertEqual(service.quota_used, 1)

    def test_daily_limit_blocks_source_but_sample_key_ignores_limit(self):
        source = FakeSource()
        service = self.service(source, daily_limit=1)
        service.fetch_line("9호선")
        for fetch in (service._fetch_all, lambda: service.fetch_line("9호선")):
            with self.assertRaisesRegex(RuntimeError, "일일 안전 호출 한도"):
                fetch()
        self.assertEqual(source.calls, ["9호선"])
        sample = self.service(FakeSource(), api_key="sample", daily_limit=1)
        sample._fetch_all()
        body = sample.fetch_line("9호선")
        self.assertEqual((body["mode"], sample.quota_used, self.saved()["used"]), ("sample", 2, 2))

    def test_load_quota_resumes_same_day_and_position_count(self):
        (self.directory / "quota.json").write_text(json.dumps({"day": DAY, "used": 7, "position": 3}))
        service = self.service()
        service.load_quota()
        self.assertEqual(service.quota_view(), {"day": DAY, "used": 7, "limit": 100000})
        self.assertEqual(service.position_used, {"day": DAY, "calls": 3})
        service.fetch_line("9호선")
        self.assertEqual(self.saved(), {"day": DAY, "used": 8, "position": 3})

    def test_load_quota_ignores_old_day_and_broken_json(self):
        for text in ('{"day":"2026-10-09","used":7,"position":3}', "{"):
            with self.subTest(text=text):
                (self.directory / "quota.json").write_text(text)
                service = self.service()
                service.load_quota()
                self.assertEqual((service.quota_day, service.quota_used, service.position_used["calls"]), ("", 0, 0))

    def test_fetched_at_is_before_all_normalization_and_after_line_normalization(self):
        service = self.service()
        def all_normalization(payload):
            FixedDatetime.current += timedelta(seconds=5)
            return {}, set(), set()
        with patch.object(live, "normalize_arrivals", side_effect=all_normalization):
            data = service._fetch_all()
        self.assertEqual(data["fetchedAt"], NOW.astimezone(live.timezone.utc).isoformat())
        FixedDatetime.current = NOW
        def line_normalization(payload, line):
            FixedDatetime.current += timedelta(seconds=5)
            return []
        with patch.object(live, "normalize_positions", side_effect=line_normalization):
            data = service.fetch_line("9호선")
        self.assertEqual(data["fetchedAt"], (NOW + timedelta(seconds=5)).astimezone(live.timezone.utc).isoformat())

    def test_snapshot_all_quiet_is_200_without_source_call(self):
        service = self.service(quiet_hours="11:00-13:00")
        body, status = live_routes.live(service, {"lines": ["6호선,6호선,없는노선"]})
        self.assertEqual((status, body["quiet"], body["trainCount"], body["lines"]), (200, True, 0, ["6호선"]))
        self.assertEqual(service.source.calls, [])

    def test_snapshot_all_daily_limit_is_200_without_source_call(self):
        service = self.service(daily_limit=1)
        service.quota_day, service.quota_used = DAY, 1
        body, status = live_routes.live(service, {"lines": ["6호선"]})
        self.assertEqual((status, body["quotaExhausted"], body["trainCount"]), (200, True, 0))
        self.assertEqual(service.source.calls, [])

    def test_failed_all_returns_none_and_failed_line_fallback_is_503(self):
        service = self.service(FakeSource(all_result=OSError("가짜 실패"), line_result=OSError("가짜 실패")))
        self.assertIsNone(service.snapshot_all(["6호선"]))
        service.source.calls.clear()
        body, status = live_routes.live(service, {"lines": ["6호선"]})
        self.assertEqual((status, body["ok"], body["trains"]), (503, False, []))
        self.assertEqual(service.source.calls, ["all", "6호선"])
        self.assertEqual(service.quota_used, 0)

    def test_failed_all_falls_back_to_successful_line(self):
        service = self.service(FakeSource(all_result=OSError("가짜 실패")))
        body, status = live_routes.live(service, {"lines": ["9호선"]})
        self.assertEqual((status, body["mode"], body["trainCount"]), (200, "viewport", 1))
        self.assertEqual(service.source.calls, ["all", "9호선"])
        self.assertEqual(service.quota_used, 1)

    def test_failed_all_uses_stale_cache_without_line_fallback(self):
        source = FakeSource(all_result={"realtimeArrivalList": [arrival_row("6310", "먹골")]})
        service = self.service(source)
        first = service.snapshot_all(["6호선"])
        service.all_cache = (NOW.timestamp() - 1000, service.all_cache[1])
        source.all_result = OSError("가짜 실패")
        body, status = live_routes.live(service, {"lines": ["6호선"]})
        self.assertEqual((status, body["trains"], body["fetchedAt"]), (200, first["trains"], first["fetchedAt"]))
        self.assertIn("이전 자료 표시 중", body["warnings"][0])
        self.assertEqual(source.calls, ["all", "all"])

    def test_snapshot_requests_keep_original_io_lock_scopes(self):
        for method, expected in (("all", (True, False)), ("viewport", (True, False)), ("position", (False, True))):
            with self.subTest(method=method):
                source = FakeSource()
                service = self.service(source, source_mode="position", position_lines=1)
                held = []
                source.on_fetch = lambda operation: held.append((service.lock.locked(), service.position_lock.locked()))
                if method == "all":
                    service.snapshot_all(["9호선"])
                elif method == "viewport":
                    service.snapshot(["9호선"])
                else:
                    service._positions("9호선", 25)
                self.assertEqual(held, [expected])

    def test_all_lines_refreshes_and_returns_shared_lines(self):
        service = self.service(FakeSource(all_result={"realtimeArrivalList": [arrival_row("6310", "먹골")]}))
        lines = service.all_lines()
        self.assertIs(lines, service.all_cache[1]["lines"])
        self.assertEqual([row["trainNo"] for row in lines["6호선"]], ["6310"])
        self.assertIs(service.all_lines(), lines)
        self.assertEqual(service.source.calls, ["all"])

    def test_arrivals_route_returns_200_or_503_and_preserves_station_name(self):
        source = FakeSource(all_result={"realtimeArrivalList": [arrival_row("6310", "먹골")]})
        service = self.service(source)
        body, status = live_routes.live(service, {"arrivals": [" 먹골역 "]})
        self.assertEqual((status, body["station"], body["arrivals"][0]["trainNo"]), (200, "먹골역", "6310"))
        service = self.service(FakeSource(all_result=OSError("가짜 실패")))
        body, status = live_routes.live(service, {"arrivals": ["먹골"]})
        self.assertEqual((status, body), (503, {"ok": False, "error": "가짜 실패"}))

    def test_overlay_uses_position_roster_and_filters_next_trips_and_idle(self):
        source = FakeSource(line_result={"realtimePositionList": [
            position_row("keep"), position_row("new", direction="1"),
            position_row("next"), position_row("idle"),
        ]})
        service = self.service(source, position_lines=1)
        service.next_trips = {("9호선", "next")}
        service.idle = {("9호선", "idle")}
        departure = "2026-10-10 12:10:00"
        original = [dict(train_row(), departsAt=departure), train_row("gone"), train_row("idle"),
                    train_row("other", line="2호선")]
        body = {"ok": True, "trains": copy.deepcopy(original), "trainCount": len(original)}
        overlaid = service.overlay_positions(body, ["9호선", "2호선"], "")
        by_number = {row["trainNo"]: row for row in overlaid["trains"]}
        self.assertEqual(set(by_number), {"keep", "new", "other"})
        self.assertEqual((by_number["keep"]["direction"], by_number["keep"]["destination"], by_number["keep"]["departsAt"]),
                         ("하행", "중앙보훈병원", departure))
        self.assertEqual((by_number["new"]["direction"], by_number["new"]["source"]), ("상행", "position"))
        self.assertEqual((overlaid["trainCount"], overlaid["positionLines"], overlaid["positionBudget"]["used"]),
                         (3, ["9호선"], 1))
        self.assertEqual(body["trains"], original)
        self.assertEqual(service.overlay_positions(body, ["9호선", "2호선"], ""), overlaid)
        self.assertEqual(source.calls, ["9호선"])
        self.assertEqual(self.saved(), {"day": DAY, "used": 1, "position": 1})
        rows = [json.loads(row) for row in (self.directory / "positions" / "20261010.jsonl").read_text().splitlines()]
        self.assertEqual(len(rows), 4)
        self.assertTrue(all(row["fetchedAt"] == NOW.astimezone(live.timezone.utc).isoformat() for row in rows))

    def test_disabled_overlay_returns_same_body_without_calling_source(self):
        service = self.service(position_lines=0)
        body = {"ok": True, "trains": [train_row()]}
        self.assertIs(service.overlay_positions(body, ["9호선"], "9호선"), body)
        self.assertEqual(service.source.calls, [])

    def test_route_parses_lines_and_focus_and_arrivals_takes_precedence(self):
        service = Mock()
        service.snapshot.return_value = {"ok": True}
        self.assertEqual(live_routes.live(service, {"lines": [" 9호선, ,2호선", "6호선"], "focused": ["1"], "focus": [" 9호선 "]}),
                         ({"ok": True}, 200))
        service.snapshot.assert_called_once_with(["9호선", "2호선", "6호선"], focused=True, focus="9호선")
        service.snapshot_arrivals.return_value = {"ok": False, "error": "가짜 실패"}
        self.assertEqual(live_routes.live(service, {"lines": ["9호선"], "arrivals": [" 먹골 "]})[1], 503)
        service.snapshot_arrivals.assert_called_once_with("먹골")
        self.assertEqual(service.snapshot.call_count, 1)


if __name__ == "__main__":
    unittest.main()
