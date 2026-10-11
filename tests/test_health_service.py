"""이상 감지(/api/health): 샘플러 기록으로 만든 평소 기준 · 지금 10분 · 위치 피드 대 도착 · 원본 오류 · 한도 (덕배 2026-10-12)."""

import gzip
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from server.clock import KST
from server.config import SubwayConfig
from server.jobs.health import next_probe
from server.routes.http import GET_JSON
from server.services import health as health_module
from server.services.health import LINES, HealthService, day_kind
from server.services.live import SubwayLiveService
from server.store.live_samples import LiveSamples, service_slot

NOW = datetime(2026, 10, 12, 8, 0, tzinfo=KST)   # 월요일 출근 시간
PAST = ["20261006", "20261007", "20261008"]       # 평일 셋(10-05 · 10-09 는 공휴일)


def event(at: datetime, line: str, train: str) -> str:
    return json.dumps({"line": line, "trainNo": train, "station": "역", "status": "도착",
                       "fetchedAt": at.astimezone(timezone.utc).isoformat()}, ensure_ascii=False) + "\n"


def day_rows(day: datetime, trains: dict, hours=range(5, 24), step=600) -> str:
    """그날 hours 동안 step 초마다 노선별 열차 trains[line] 대가 한 번씩 사건을 남긴다."""
    rows = []
    for h in hours:
        for s in range(0, 3600, step):
            at = day.replace(hour=h, minute=0) + timedelta(seconds=s)
            for line, n in trains.items():
                rows += [event(at, line, f"{line[0]}{i:03d}") for i in range(n)]
    return "".join(rows)


class FakeSource:
    def __init__(self):
        self.calls = []

    def fetch_all(self):
        self.calls.append("all")
        raise OSError("가짜 실패")

    def fetch_line(self, line):
        self.calls.append(line)
        return {"realtimePositionList": [{"subwayId": "1007", "trainNo": "7001", "statnNm": "온수", "updnLine": "1"}]}


class HealthTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.samples = root / "samples"
        self.samples.mkdir()
        for name in PAST:
            day = datetime.strptime(name, "%Y%m%d").replace(tzinfo=KST)
            with gzip.open(self.samples / f"{name}.jsonl.gz", "wt", encoding="utf-8") as f:
                f.write(day_rows(day, {"7호선": 50, "2호선": 40}))
        self.source = FakeSource()
        config = SubwayConfig(api_key="sample", quiet_hours="", quota_file=root / "quota.json", burst_dir=root / "position",
                              daily_limit=10000, position_budget=5500, samples_dir=self.samples, health_dir=root / "days")
        self.live = SubwayLiveService(config, source=self.source)
        self.health = HealthService(self.live, LiveSamples(self.samples, root / "days"), clock=lambda: NOW.timestamp())
        self.health.refresh_baseline()

    def tearDown(self):
        self.temp.cleanup()

    def today(self, trains: dict, minutes: int = 40, short: dict | None = None, short_minutes: int = 0):
        """오늘 파일: NOW 앞 minutes 분, 마지막 short_minutes 분은 short 대수로."""
        rows = []
        for back in range(minutes * 60, 0, -60):
            at = NOW - timedelta(seconds=back)
            counts = short if short is not None and back <= short_minutes * 60 else trains
            for line, n in counts.items():
                rows += [event(at, line, f"{line[0]}{i:03d}") for i in range(n)]
        (self.samples / "20261012.jsonl").write_text("".join(rows), encoding="utf-8")
        self.health.report_cache = None

    def check(self, key):
        return next(c for c in self.health.report()["checks"] if c["key"] == key)

    def test_baseline_and_all_keys_every_time(self):
        self.today({"7호선": 49, "2호선": 41})
        body = self.health.report()
        keys = [c["key"] for c in body["checks"]]
        self.assertEqual(keys, ["source:all", "feed:samples", "quota:daily", *[f"live:{l}" for l in LINES], *[f"position:{l}" for l in LINES]])
        self.assertEqual(len(set(keys)), len(keys))
        self.assertTrue(all(isinstance(c["ok"], bool) and c["text"] for c in body["checks"]))
        self.assertEqual(self.check("live:7호선"), {"key": "live:7호선", "ok": True, "text": "7호선 실시간 열차 49대(평소 약 50대)"})
        self.assertIn("평소 열차가 적은 시간이라 보지 않아요", self.check("live:9호선")["text"])
        self.assertTrue(self.check("live:9호선")["ok"])
        self.assertEqual(self.source.calls, [], "바깥 API 를 부르지 않는다")
        self.assertEqual(self.health.usual[("weekday", "7호선")][service_slot(NOW.timestamp())[1]], 50)

    def test_line_short_for_over_ten_minutes(self):
        self.today({"7호선": 50, "2호선": 40}, short={"7호선": 3, "2호선": 40}, short_minutes=25)
        c = self.check("live:7호선")
        self.assertFalse(c["ok"])
        self.assertEqual(c["text"], "7호선 실시간 열차가 평소의 6%예요(3대 / 평소 약 50대, 07:35부터)")
        self.assertTrue(self.check("live:2호선")["ok"])
        self.assertFalse(self.health.report()["ok"])

    def test_one_short_window_is_only_watched(self):
        self.today({"7호선": 50}, short={"7호선": 3}, short_minutes=9)
        c = self.check("live:7호선")
        self.assertTrue(c["ok"])
        self.assertIn("모자람 확인 중", c["text"])

    def test_samples_stopped_and_line_empty(self):
        self.today({"7호선": 50, "2호선": 40}, short={}, short_minutes=20)
        self.assertFalse(self.check("feed:samples")["ok"])
        self.assertIn("10분 넘게 멈췄어요(마지막 07:39)", self.check("feed:samples")["text"])
        self.assertIn("10분 넘게 안 들어와요", self.check("live:7호선")["text"])

    def test_position_feed_partial_needs_ten_minutes(self):
        self.today({"7호선": 50})
        t = NOW.timestamp()
        self.live.note_position("7호선", t - 120, 3, 51)
        self.assertTrue(self.check("position:7호선")["ok"])
        self.assertIn("모자람 확인 중", self.check("position:7호선")["text"])
        self.live.note_position("7호선", t - 900, 3, 50)
        self.live.position_checks["7호선"].sort()
        self.health.report_cache = None
        self.assertEqual(self.check("position:7호선"), {"key": "position:7호선", "ok": False,
                                                       "text": "7호선 위치 정보가 도착 정보의 6%만 와요(3대 / 51대, 07:45부터)"})
        self.live.note_position("7호선", t - 30, 30, 51)
        self.health.report_cache = None
        self.assertEqual(self.check("position:7호선")["text"], "7호선 위치 정보 30대(도착 정보 51대, 07:59 확인)")

    def test_source_errors_and_quota(self):
        self.today({"7호선": 50})
        self.live.all_ok_at, self.live.all_error_since = NOW.timestamp() - 900, NOW.timestamp() - 840
        self.live.quota_day, self.live.quota_used = "2026-10-12", 10000
        self.assertEqual(self.check("source:all")["text"], "서울시 실시간 원본이 07:46부터 계속 오류예요(14분, 마지막 성공 07:45)")
        self.assertFalse(self.check("quota:daily")["ok"])
        self.assertIn("호출 한도가 바닥났어요(10000 / 10000", self.check("quota:daily")["text"])

    def test_fetch_all_failure_is_remembered(self):
        with self.assertRaises(OSError):
            self.live._fetch_all()
        self.assertIsNotNone(self.live.all_error_since)

    def test_route_is_cached_and_always_200(self):
        self.today({"7호선": 50})
        services = type("S", (), {"health": self.health})()
        body, status = GET_JSON["/api/health"](services, {})
        self.assertEqual(status, 200)
        (self.samples / "20261012.jsonl").write_text("", encoding="utf-8")
        self.assertIs(GET_JSON["/api/health"](services, {})[0], body, "1분 동안 같은 답")

    def test_day_kinds(self):
        self.assertEqual([day_kind(d) for d in ["2026-10-12", "2026-10-10", "2026-10-11", "2026-10-09"]],
                         ["weekday", "saturday", "sunday", "sunday"])
        self.assertEqual(service_slot(datetime(2026, 10, 13, 0, 30, tzinfo=KST).timestamp()), ("2026-10-12", 3))
        self.assertTrue((Path(self.temp.name) / "days" / "20261006.json").exists(), "지난날 요약은 남긴다")

    def test_probe_picks_oldest_unread_busy_line_within_budget(self):
        t = NOW.timestamp()
        self.live.all_cache = (t, {"lines": {"7호선": [{}] * 50, "2호선": [{}] * 40, "9호선": [{}] * 3}})
        self.live.note_position("2호선", t - 60, 38, 40)
        self.assertEqual(next_probe(self.live, t), "7호선", "9호선은 열차가 적고 2호선은 방금 읽었다")
        self.live.position_used.update(day=datetime.now(KST).strftime("%Y-%m-%d"), calls=5500)
        self.assertFalse(self.live.probe_position("7호선"), "위치 피드 예산이 바닥이면 읽지 않는다")
        self.live.position_used["calls"] = 0
        self.assertTrue(self.live.probe_position("7호선"))
        self.assertEqual(self.source.calls, ["7호선"])
        self.assertEqual(self.live.position_checks["7호선"][-1][1:], (1, 50))


if __name__ == "__main__":
    unittest.main()
