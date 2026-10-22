"""완행 대피 대기(pipeline/build_live_timing.py waits): 급행과 섞지 않고 역 · 방향 · 출퇴근마다 배우고, evaluate 도 그 값으로 잰다."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from build_live_timing import WAIT_MIN_N, evaluate, learn, stand, wait_key  # noqa: E402

LINE = "9호선"


def stamp(t: datetime) -> str:
    return t.strftime("%Y-%m-%d %H:%M:%S")


class WaitsTest(unittest.TestCase):
    def write(self, folder: Path, waits: dict[bool, float]) -> Path:
        """위치 피드 하루: 수요일 낮, 열차마다 가양 도착 → 출발(급행 여부별 대기 초). 노선은 30초마다 이어 읽었다."""
        rows, t0 = [], datetime(2026, 10, 21, 12, 0, 0)
        for i in range(WAIT_MIN_N + 2):
            for express, wait in waits.items():
                start, no = t0 + timedelta(minutes=10 * i + (5 if express else 0)), f"9{i:02d}{int(express)}"
                for status, at in (("도착", start), ("출발", start + timedelta(seconds=wait))):
                    rows.append({"line": LINE, "trainNo": no, "station": "가양", "status": status, "direction": "하행",
                                 "express": express, "receivedAt": stamp(at), "fetchedAt": (at - timedelta(hours=9)).isoformat() + "+00:00"})
        for k in range(0, 24 * 60 * 2):   # 다른 열차의 읽기: 30초마다
            at = t0 + timedelta(seconds=30 * k - 3600)
            rows.append({"line": LINE, "trainNo": "9999", "station": "개화", "status": "진입", "direction": "하행",
                         "express": False, "receivedAt": stamp(t0 - timedelta(hours=2)), "fetchedAt": (at - timedelta(hours=9)).isoformat() + "+00:00"})
        path = folder / "position" / "20261021.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
        return path

    def test_local_wait_learned_apart_from_express(self):
        with tempfile.TemporaryDirectory() as d:
            path = self.write(Path(d), {False: 220, True: 70})
            timing = learn([str(path)])
            waits = timing["lines"][LINE].get("waits", {})
            (key, value), = waits.items()
            self.assertTrue(key.endswith(":하행:day"), key)
            self.assertEqual(value, 225, "완행 대기 가운데값 + 5(stops 와 같게)")
            e = {"express": False, "direction": "하행", "receivedAt": "2026-10-21 13:00:00"}
            self.assertEqual(stand(timing["lines"][LINE] | {"zone": 60}, int(key.split(":")[0]), e), 215)
            self.assertIsNone(wait_key(1, {**e, "express": True}), "급행은 대피 대기를 쓰지 않는다")
            self.assertIsNone(wait_key(1, {k: v for k, v in e.items() if k != "express"}), "급행 여부를 모르면 쓰지 않는다")
            self.assertTrue(wait_key(1, {**e, "receivedAt": "2026-10-21 08:00:00"}).endswith(":rush"))
            self.assertTrue(wait_key(1, {**e, "receivedAt": "2026-10-18 08:00:00"}).endswith(":day"), "주말은 출퇴근이 아니다")
            without = json.loads(json.dumps(timing))
            without["lines"][LINE].pop("waits")
            self.assertLess(evaluate(timing, [str(path)])["mean"], evaluate(without, [str(path)])["mean"], "evaluate 도 waits 로 잰다")

    def test_no_waits_when_locals_stand_like_the_station(self):
        with tempfile.TemporaryDirectory() as d:
            timing = learn([str(self.write(Path(d), {False: 75, True: 70}))])
            self.assertNotIn("waits", timing["lines"].get(LINE, {}))


if __name__ == "__main__":
    unittest.main()
