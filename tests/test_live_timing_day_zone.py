"""출퇴근 밖 정차 차이(pipeline/build_live_timing.py dayZone): 노선 하나 값으로 배우고, stand · evaluate 가 출퇴근 밖에만 더한다."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from build_live_timing import DAY_MIN_N, evaluate, learn, stand  # noqa: E402

LINE = "2호선"


def stamp(t: datetime) -> str:
    return t.strftime("%Y-%m-%d %H:%M:%S")


class DayZoneTest(unittest.TestCase):
    def write(self, folder: Path, rush_stand: float, day_stand: float) -> Path:
        """위치 피드 하루(수요일): 강남 도착 → 출발 — 출근(8시)에 rush_stand 초 · 한낮(12시)에 day_stand 초. 노선은 30초마다 이어 읽었다."""
        rows, day = [], datetime(2026, 11, 25)
        for i in range(DAY_MIN_N + 10):
            for hour, wait in ((8, rush_stand), (12, day_stand)):
                start, no = day + timedelta(hours=hour, seconds=20 * i), f"2{hour:02d}{i:03d}"
                for status, at in (("도착", start), ("출발", start + timedelta(seconds=wait))):
                    rows.append({"line": LINE, "trainNo": no, "station": "강남", "status": status, "direction": "내선",
                                 "receivedAt": stamp(at), "fetchedAt": (at - timedelta(hours=9)).isoformat() + "+00:00"})
        for k in range(0, 24 * 60 * 2):   # 다른 열차의 읽기: 30초마다
            at = day + timedelta(seconds=30 * k)
            rows.append({"line": LINE, "trainNo": "2999", "station": "시청", "status": "진입", "direction": "내선",
                         "receivedAt": stamp(day), "fetchedAt": (at - timedelta(hours=9)).isoformat() + "+00:00"})
        path = folder / "position" / "20261125.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
        return path

    def test_day_zone_learned_and_used_outside_rush(self):
        with tempfile.TemporaryDirectory() as d:
            path = self.write(Path(d), rush_stand=90, day_stand=70)
            timing = learn([str(path)])
            tm = {**timing["default"], **timing["lines"][LINE]}
            self.assertLess(tm["dayZone"], 0, "한낮이 짧으면 음수")
            (station, zone), = tm["stops"].items()
            self.assertEqual(stand(tm, int(station)), zone - 10, "기록이 없으면(runs 셈) 그대로")
            self.assertEqual(stand(tm, int(station), {"receivedAt": "2026-11-25 08:10:00"}), zone - 10, "출퇴근은 그대로")
            self.assertEqual(stand(tm, int(station), {"receivedAt": "2026-11-25 13:00:00"}), zone + tm["dayZone"] - 10)
            self.assertEqual(stand(tm, int(station), {"receivedAt": "2026-11-28 08:10:00"}), zone + tm["dayZone"] - 10, "주말은 출퇴근이 아니다")
            without = json.loads(json.dumps(timing))
            without["lines"][LINE].pop("dayZone")
            self.assertLess(evaluate(timing, [str(path)])["mean"], evaluate(without, [str(path)])["mean"], "evaluate 도 dayZone 으로 잰다")

    def test_no_day_zone_when_day_stands_like_rush(self):
        with tempfile.TemporaryDirectory() as d:
            timing = learn([str(self.write(Path(d), rush_stand=80, day_stand=80))])
            self.assertNotIn("dayZone", timing["lines"].get(LINE, {}))


if __name__ == "__main__":
    unittest.main()
