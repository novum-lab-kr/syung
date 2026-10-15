"""역 하나 도착 재기(server/jobs/station_probe.py)."""
import tempfile
import unittest
import json
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

from server.clock import KST
from server.config import SubwayConfig
from server.jobs.station_probe import in_hours, station_probe_loop
from server.services import live

ROW = {"subwayId": "1007", "statnNm": "군자", "updnLine": "하행", "btrainNo": "7079", "barvlDt": "60", "arvlCd": "3",
       "arvlMsg2": "전역 출발", "arvlMsg3": "중곡", "recptnDt": "2026-10-16 08:00:00", "bstatnNm": "석남"}


class Source:
    def __init__(self):
        self.asked = []

    def fetch_station(self, name):
        self.asked.append(name)
        return {"errorMessage": {"code": "INFO-000"}, "realtimeArrivalList": [ROW, {**ROW, "statnNm": "중곡"}]}


class Stop(Exception):
    pass


class StationProbeTest(unittest.TestCase):
    def test_hours(self):
        at = lambda h, m: datetime(2026, 10, 16, h, m, tzinfo=KST)
        self.assertTrue(in_hours("07:30-09:30", at(7, 30)))
        self.assertFalse(in_hours("07:30-09:30", at(9, 30)))
        self.assertTrue(in_hours("07:30-09:30,17:30-19:00", at(18, 0)))
        self.assertTrue(in_hours("", at(3, 0)))

    def test_probe_records_one_station_next_to_the_cached_all_rows_and_counts_the_call(self):
        with tempfile.TemporaryDirectory() as d:
            src = Source()
            config = SubwayConfig(api_key="k", daily_limit=1000, quiet_hours="", station_probe=["군자", "건대입구"],
                                  station_probe_seconds=30, station_probe_dir=Path(d), quota_file=Path(d) / "q.json")
            svc = live.SubwayLiveService(config, source=src)
            svc.all_cache = (0, {"fetchedAt": "2026-10-15T23:00:00+00:00", "stations": {"군자": [{"trainNo": "7079", "code": "4"}]}})
            sleeps, clock = [], iter([datetime(2026, 10, 16, 8, 0, tzinfo=KST), datetime(2026, 10, 16, 8, 0, tzinfo=KST), datetime(2026, 10, 16, 10, 0, tzinfo=KST)])

            def sleep(s):
                sleeps.append(s)
                if len(sleeps) > 3:
                    raise Stop

            with self.assertRaises(Stop):
                station_probe_loop(svc, sleep=sleep, now=lambda: next(clock))
            self.assertEqual(sleeps, [15, 15, 15, 15], '30초를 두 역에 나눠')
            self.assertEqual(src.asked, ["군자", "건대입구"], '10시는 시간 밖')
            self.assertEqual(svc.quota_used, 2)
            lines = [json.loads(l) for f in Path(d).glob("2*.jsonl") for l in f.read_text().splitlines()]
            self.assertEqual(len(lines), 2)
            first = lines[0]
            self.assertEqual(first["station"], "군자")
            self.assertEqual([r["trainNo"] for r in first["one"]], ["7079"], '그 역 행만')
            self.assertEqual(first["one"][0]["receivedAt"], "2026-10-16 08:00:00")
            self.assertEqual(first["all"], [{"line": None, "direction": None, "trainNo": "7079", "code": "4", "where": None, "eta": None, "message": None, "receivedAt": None}])
            self.assertEqual(lines[1]["all"], [], '전 역 자료에 없는 역')

    def test_off_without_stations_and_quiet_or_low_quota_skips(self):
        station_probe_loop(SimpleNamespace(config=SubwayConfig()))   # 바로 돌아온다
        src = Source()
        svc = SimpleNamespace(config=SubwayConfig(station_probe=["군자"], station_probe_hours=""), quiet=lambda: False, calls_left=lambda: 100,
                              fetch_station=lambda n: src.fetch_station(n))
        n = []

        def sleep(s):
            n.append(s)
            if len(n) > 2:
                raise Stop

        with self.assertRaises(Stop):
            station_probe_loop(svc, sleep=sleep)
        self.assertEqual(src.asked, [], '남은 호출이 적으면 지도 몫')


if __name__ == "__main__":
    unittest.main()
