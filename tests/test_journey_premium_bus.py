"""길찾기에서 경기 프리미엄버스(예약제 · P + 숫자) 빼기(2026-10-29 사용자 결정): 가짜 버스 자료로 본다."""

import unittest
from unittest import mock

from server.services import journey_graph as graph

# 가짜 노선 · 패턴(실제 정류장 번호 아님)
ROUTES = [["P9601(출근)", "maeul"], ["G1300", "branch"], ["강남02", "maeul"], ["8906", "express"], ["P9110", "maeul"]]
PATTERNS = [
    {"r": 0, "s": [10, 11, 12], "t": [0, 60, 120], "d": [[23400, 1]]},
    {"r": 1, "s": [10, 13, 14], "t": [0, 90, 180], "d": [[23000, 1]]},
    {"r": 2, "s": [14, 15], "t": [0, 60], "d": [[24000, 1]]},
    {"r": 3, "s": [11, 16], "t": [0, 300], "d": [[22000, 1]]},
    {"r": 4, "s": [16, 17], "t": [0, 300], "d": [[22000, 1]]},
]


class BookableOnlyTest(unittest.TestCase):
    def test_premium_names_are_bookable_only(self):
        for name in ("P9601(출근)", "P9601(퇴근)", "P9110", " P9201"):
            self.assertTrue(graph.bookable_only(name), name)

    def test_ordinary_names_are_not(self):
        for name in ("G1300", "8906", "M4101", "강남02", "N61", "402", "4319", "9-1", "P", "PA1", "1100(출근)"):
            self.assertFalse(graph.bookable_only(name), name)


class BusBoardingsTest(unittest.TestCase):
    def test_premium_patterns_cannot_be_boarded(self):
        at = graph.bus_boardings(PATTERNS, ROUTES)
        boarded = {pi for spots in at.values() for pi, _ in spots}
        self.assertEqual(boarded, {1, 2, 3})   # 0 · 4 는 프리미엄

    def test_ordinary_patterns_keep_every_stop_but_the_last_and_their_numbers(self):
        at = graph.bus_boardings(PATTERNS, ROUTES)
        self.assertEqual(at[10], [(1, 0)])   # 같은 정류장의 P9601 은 빠지고 G1300 만
        self.assertEqual(at[13], [(1, 1)])
        self.assertEqual(at[14], [(2, 0)])   # G1300 종점이 아니라 강남02 첫 정류장
        self.assertEqual(at[11], [(3, 0)])
        self.assertNotIn(12, at)   # P9601 만 서는 정류장
        self.assertNotIn(17, at)

    def test_loaded_data_has_no_premium_boarding(self):
        for spots in graph.BUS_AT.values():
            for pi, _ in spots:
                self.assertFalse(graph.bookable_only(graph.BROUTES[graph.BPATS[pi]["r"]][0]))


if __name__ == "__main__":
    unittest.main()


class BusShapedTest(unittest.TestCase):
    """길찾기 버스 구간의 shaped: 도로 모양 자료가 있는 패턴만 true(웹이 점선 대신 실선으로 그린다)."""

    def test_shaped_only_when_shape_points_match_stops(self):
        shapes = {"1": ["_p~iF~ps|U", [0, 1, 2]], "2": ["_p~iF~ps|U", [0, 1, 2]]}   # 패턴 2 는 정류장이 둘이라 점 3개와 안 맞는다
        with mock.patch.object(graph, "BPATS", PATTERNS), mock.patch.object(graph, "BUS_SHAPES", shapes):
            self.assertTrue(graph._bus_shaped(1))
            self.assertFalse(graph._bus_shaped(0))   # 모양 없음 → 정류장끼리 직선
            self.assertFalse(graph._bus_shaped(2))
