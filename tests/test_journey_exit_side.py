"""출구 고르기 — 같은 역 출구들의 걷는 시간이 EXIT_TIE_S 안으로 비기면 큰길 건너편 출구는 뺀다(2026-11-06 사용자 결정 A).

재현 건: 시청 서쪽(37.5629, 126.9708) → 아현. 걷기 길 자료가 서소문로를 중앙선 한 줄로만 알아 9번(길 건너편) 229초 ·
10번(같은 쪽) 236초로 9번을 골랐다(운영 /api/route 2026-11-06).
"""

import unittest
from unittest.mock import patch

from server.services import journey_graph as graph

SICHEONG = 1
WEST = (37.5629, 126.9708)


class _Table:
    """OSRM 표 흉내: 출구 번호(ref) → 걷는 초. 거리는 초 × 1.4."""
    def __init__(self, seconds_by_ref, sid=SICHEONG):
        self.cells = [seconds_by_ref.get(ref) for _, _, ref in graph._points(sid)]

    def table(self, coords, query):
        dist = [None if s is None else s * 1.4 for s in self.cells]
        if query.startswith("sources=0"):
            return {"durations": [self.cells], "distances": [dist]}
        return {"durations": [[s] for s in self.cells], "distances": [[m] for m in dist]}


def others(seconds):
    """시청의 다른 출구는 모두 seconds 초."""
    return {ref: seconds for _, _, ref in graph._points(SICHEONG)}


class SicheongTest(unittest.TestCase):
    def test_data_puts_exit_9_and_10_on_opposite_sides_of_seosomun_ro(self):
        nine = next(p for p in graph._points(SICHEONG) if p[2] == "9")
        ten = next(p for p in graph._points(SICHEONG) if p[2] == "10")
        self.assertTrue(graph._across(WEST, nine[:2]), "서쪽 출발점에서 9번은 길 건너편")
        self.assertFalse(graph._across(WEST, ten[:2]), "10번은 같은 쪽")

    def test_west_of_sicheong_walks_to_exit_10(self):
        with patch.object(graph, "OSRM", _Table({**others(400), "9": 229, "10": 236})):
            walk = graph._walk_table(WEST, [("at", SICHEONG)])[("at", SICHEONG)]
        self.assertEqual(walk[:3], (236, 330, "10"))

    def test_arriving_from_the_station_uses_the_destination_side_too(self):
        with patch.object(graph, "OSRM", _Table({**others(400), "9": 229, "10": 236})):
            walk = graph._walk_table(WEST, [("at", SICHEONG)], reverse=True)[("at", SICHEONG)]
        self.assertEqual(walk[2], "10")

    def test_not_a_tie_keeps_the_fastest(self):
        with patch.object(graph, "OSRM", _Table({**others(400), "9": 229, "10": 250})):   # 21초 차이
            walk = graph._walk_table(WEST, [("at", SICHEONG)])[("at", SICHEONG)]
        self.assertEqual(walk[2], "9")

    def test_exactly_the_tie_window_still_counts(self):
        with patch.object(graph, "OSRM", _Table({**others(400), "9": 229, "10": 249})):
            walk = graph._walk_table(WEST, [("at", SICHEONG)])[("at", SICHEONG)]
        self.assertEqual(walk[2], "10")

    def test_unreachable_exits_are_skipped(self):
        with patch.object(graph, "OSRM", _Table({**others(None), "9": 229})):   # 10번 null(못 감)
            walk = graph._walk_table(WEST, [("at", SICHEONG)])[("at", SICHEONG)]
        self.assertEqual(walk[2], "9")


class PickExitTest(unittest.TestCase):
    """가짜 큰길 하나(동서로 곧은 길 — 위도 37.5000)로 본 규칙."""
    ROAD = ((37.5, 127.0), (37.5, 127.001))
    NORTH, SOUTH = (37.5003, 127.0005), (37.4997, 127.0005)   # 길에서 약 33 m 씩
    HERE = (37.5010, 127.0)                                    # 길 북쪽 약 110 m

    def walk(self, seconds, pt, ref):
        return (float(seconds), (seconds, seconds, ref, *pt))

    def pick(self, ways, place=HERE):
        with patch.object(graph, "EXIT_ROAD", {self.NORTH: self.ROAD, self.SOUTH: self.ROAD}):
            return graph._pick_exit(place, ways)[2]

    def test_road_side(self):
        self.assertEqual(graph._road_side(self.ROAD, self.NORTH), 1)
        self.assertEqual(graph._road_side(self.ROAD, self.SOUTH), -1)
        self.assertEqual(graph._road_side(self.ROAD, (37.50001, 127.002)), 0, "선에서 1 m — 모른다")

    def test_tie_prefers_the_same_side(self):
        self.assertEqual(self.pick([self.walk(100, self.SOUTH, "S"), self.walk(110, self.NORTH, "N")]), "N")

    def test_all_tied_exits_across_keeps_the_fastest(self):
        self.assertEqual(self.pick([self.walk(100, self.SOUTH, "S"), self.walk(105, self.SOUTH, "S2")]), "S")

    def test_exit_without_road_is_not_across(self):
        self.assertEqual(self.pick([self.walk(100, self.SOUTH, "S"), self.walk(115, (37.51, 127.0), "X")]), "X")

    def test_far_place_does_not_look_at_sides(self):
        far = (37.5050, 127.0)   # 출구에서 500 m 넘게
        self.assertEqual(self.pick([self.walk(100, self.SOUTH, "S"), self.walk(110, self.NORTH, "N")], far), "S")

    def test_place_on_the_road_line_does_not_look_at_sides(self):
        on_line = (37.5, 126.999)
        self.assertEqual(self.pick([self.walk(100, self.SOUTH, "S"), self.walk(110, self.NORTH, "N")], on_line), "S")


if __name__ == "__main__":
    unittest.main()
