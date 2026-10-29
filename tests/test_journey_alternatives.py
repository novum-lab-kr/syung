"""같은 구간 다른 버스(2026-10-29 사용자 결정): 고른 버스와 같은(또는 옆) 정류장에서 타서 같은(또는 옆) 정류장에 내리는 다른 노선을 함께 알린다.
탐색 자료 대신 가짜 정류장 · 노선 · 시간표로 본다."""

import unittest
from datetime import datetime
from unittest.mock import patch

from server.clock import KST
from server.services import journey_graph as graph

WHEN = datetime(2026, 10, 29, 9, 0, tzinfo=KST)
DAY0 = WHEN.replace(hour=0, minute=0).timestamp()
NINE = 9 * 3600   # 하루 시작에서 9시까지 초

# 정류장 0 청담(타는 곳) · 1 청담옆 · 2 중간 · 3 삼성(내리는 곳) · 4 삼성옆 · lat 이 번호라 옆 정류장 찾기를 가짜로 대신할 수 있다
STOPS = [["청담", 0, 0], ["청담옆", 1, 0], ["중간", 2, 0], ["삼성", 3, 0], ["삼성옆", 4, 0]]
ROUTES = [["143", "trunk"], ["2415", "branch"], ["301", "trunk"], ["999", "express"], ["8", "trunk"]]
NEXT_TO = {0: [(60.0, 1)], 3: [(80.0, 4)]}   # 정류장 → [(미터, 옆 정류장)]
READY, LEAVES, GETS = DAY0 + NINE + 4 * 60, DAY0 + NINE + 5 * 60, DAY0 + NINE + 11 * 60   # 143: 09:04 에 정류장 · 09:05 출발 · 09:11 도착


def pattern(route, stops, start, scale=1.0):
    """정류장마다 2분씩 걸리는 패턴 하나(start 에 출발하는 한 대)."""
    return {"r": route, "s": stops, "t": [i * 120 for i in range(len(stops))], "d": [[start, scale]], "starts": [start]}


def run(patterns, routes=ROUTES, near=None):
    """143(09:04 정류장 도착 · 09:05 출발 · 09:11 도착)을 고른 구간으로 놓고 같은 구간 다른 노선을 구한다. near: 옆 정류장 표(없으면 옆 정류장 없음)."""
    table = near or {}
    with patch.object(graph, "BSTOPS", STOPS), patch.object(graph, "BROUTES", routes), patch.object(graph, "BPATS", patterns), \
            patch.object(graph, "BUS_AT", graph.bus_boardings(patterns, routes)), \
            patch.object(graph, "_stops_near", lambda point, radius: table.get(int(point[0]), [])):
        return graph._alternatives((0, 3, READY, LEAVES, GETS), "143", DAY0)


class AlternativesTest(unittest.TestCase):
    def test_other_route_on_same_stops_is_listed(self):
        found = run([pattern(0, [0, 2, 3], NINE + 5 * 60), pattern(1, [0, 2, 3], NINE + 7 * 60)])
        self.assertEqual([a["route"] for a in found], ["2415"])
        self.assertEqual(found[0]["departs"], "09:07")
        self.assertEqual(found[0]["arrives"], "09:11")
        self.assertEqual(found[0]["color"], graph.BUS_COLORS["branch"])

    def test_chosen_route_itself_is_not_listed(self):
        self.assertEqual(run([pattern(0, [0, 2, 3], NINE + 5 * 60)]), [])

    def test_listed_in_order_of_leaving_and_capped(self):
        patterns = [pattern(0, [0, 3], NINE + 5 * 60)] + [pattern(i, [0, 3], NINE + (9 - i) * 60) for i in (1, 2, 3, 4)]
        found = run(patterns)
        self.assertEqual([a["route"] for a in found], ["8", "999", "301"])   # 09:05 · 09:06 · 09:07 · (2415 는 09:08 로 잘림)
        self.assertLessEqual(len(found), graph.MAX_ALTERNATIVES)

    def test_next_stop_boarding_and_alighting_count(self):
        found = run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [1, 4], NINE + 8 * 60)], near=NEXT_TO)
        self.assertEqual([a["route"] for a in found], ["2415"])
        self.assertEqual(run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [1, 4], NINE + 8 * 60)]), [])   # 옆 정류장을 같은 자리로 안 보면 없음

    def test_walking_to_next_stop_makes_a_bus_leaving_too_soon_unusable(self):
        # 정류장에 09:04 에 닿았고 옆 정류장까지 걷는 데 약 65초 — 09:05 에 떠나는 버스는 탈 수 있지만 09:04:30 에 떠나는 버스는 못 탄다
        found = run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [1, 3], NINE + 4 * 60 + 30)], near=NEXT_TO)
        self.assertEqual(found, [])

    def test_late_or_far_apart_buses_are_left_out(self):
        late = pattern(1, [0, 3], NINE + 5 * 60 + graph.ALT_DEPART_WITHIN + 60)   # 너무 한참 뒤
        slow = pattern(2, [0, 3], NINE + 6 * 60, scale=20.0)   # 너무 늦게 닿는다
        self.assertEqual(run([pattern(0, [0, 3], NINE + 5 * 60), late, slow]), [])

    def test_wrong_direction_is_left_out(self):
        self.assertEqual(run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [3, 0], NINE + 6 * 60)]), [])

    def test_premium_bus_is_never_offered(self):
        routes = [*ROUTES]
        routes[1] = ["P9601(출근)", "express"]
        self.assertEqual(run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [0, 3], NINE + 6 * 60)], routes), [])


if __name__ == "__main__":
    unittest.main()
