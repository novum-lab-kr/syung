"""반올림된 KTDB 정류장을 OSM 정류장으로 옮기기(pipeline/fix_bus_stops.py) — 반올림 상자 안에서 가장 가까운 것.
2026-11-09 위워크 삼성 → 묵동 길찾기: KTDB 「포스코사거리」(37.5078, 127.056 · 2415 가 서는 서울 23202 에서 28 m)를
예전 규칙(반지름 150 m 안 · 오른쪽 표가 거리보다 먼저)이 150 m 떨어진 다른 포스코사거리 OSM 점으로 옮겼다. 좌표는 그날 자료 값."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pipeline import fix_bus_stops as fix

KTDB = ["포스코사거리", 37.5078, 127.056]
NEAR = ["포스코사거리", 37.5078434, 127.0559882]    # 반올림 상자 안 · 약 5 m
FAR = ["포스코사거리", 37.5072805, 127.0575624]     # 남북으로 58 m 밖(37.5078 은 ±6 m) · 약 150 m
PREV, NEXT = ["대치사거리", 37.5037, 127.059], ["한별구립어린이집", 37.5104, 127.055]   # 2415 의 앞 · 뒤 정류장


class InRoundingTest(unittest.TestCase):
    def test_box_follows_each_axis_decimals(self):
        self.assertTrue(fix.in_rounding(KTDB[1], KTDB[2], NEAR[1], NEAR[2]))
        self.assertFalse(fix.in_rounding(KTDB[1], KTDB[2], FAR[1], FAR[2]), "위도 4자리라 남북으로는 거의 안 움직인다")
        # 경도 3자리(±0.0005 ≈ 44 m)는 동서로 그만큼 + SLACK_M 까지
        self.assertTrue(fix.in_rounding(37.5078, 127.056, 37.5078, 127.0565))
        self.assertFalse(fix.in_rounding(37.5078, 127.056, 37.5078, 127.0568))


class MoveTest(unittest.TestCase):
    def run_fix(self, stops, osm):
        with tempfile.TemporaryDirectory() as tmp:
            bus, out, src = Path(tmp, "bus.json"), Path(tmp, "fix.json"), Path(tmp, "osm.json")
            bus.write_text(json.dumps({"stops": stops, "patterns": [{"s": list(range(len(stops)))}]}), encoding="utf-8")
            src.write_text(json.dumps(osm, ensure_ascii=False), encoding="utf-8")
            with patch.object(fix, "BUS", bus), patch.object(fix, "OUT", out), patch("builtins.print"):
                fix.main(str(src))
            return json.loads(out.read_text(encoding="utf-8"))

    def test_far_same_name_stop_on_the_right_does_not_win_over_the_near_one(self):
        # 앞 → 뒤 직선으로 보면 FAR 가 오른쪽 · NEAR 가 왼쪽이다(교차로에서 꺾는 노선) — 예전 규칙은 FAR 로 옮겼다
        self.assertGreater(self.right_votes(FAR), self.right_votes(NEAR))
        moved = self.run_fix([PREV, KTDB, NEXT], [NEAR, FAR])
        self.assertEqual(moved.get("1"), [NEAR[1], NEAR[2]])

    def test_only_far_candidate_keeps_the_ktdb_coordinates(self):
        self.assertNotIn("1", self.run_fix([PREV, KTDB, NEXT], [FAR]))

    def test_close_pair_is_split_by_side_of_the_road(self):
        # 길 양쪽 같은 이름 둘(서로 SIDE_TIE_M 안): 가까운 쪽이 아니라 버스 오른쪽 것
        stops = [["갑", 37.5, 127.0011], ["을", 37.501, 127.001], ["병", 37.502, 127.0011]]   # 북쪽으로 가는 버스 · 을 은 3자리
        left, right = ["을", 37.501, 127.00095], ["을", 37.501, 127.00112]   # 서쪽 약 4 m · 동쪽 약 11 m
        self.assertEqual(self.run_fix(stops, [left, right]).get("1"), [right[1], right[2]])

    @staticmethod
    def right_votes(cand):
        # fix_bus_stops.right_side 와 같은 셈(앞 → 뒤 직선의 오른쪽이면 +1)
        vx, vy = fix.local((NEXT[1], NEXT[2]), (PREV[1], PREV[2]))
        cx, cy = fix.local((cand[1], cand[2]), (PREV[1], PREV[2]))
        return 1 if vx * cy - vy * cx < 0 else -1


if __name__ == "__main__":
    unittest.main()
