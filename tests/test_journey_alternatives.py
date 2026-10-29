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

# 정류장 0 청담(타는 곳) · 1 청담옆 · 2 중간(경유) · 3 삼성(내리는 곳) · 4 삼성옆
STOPS = [["청담", 0, 0], ["청담옆", 1, 0], ["중간", 2, 0], ["삼성", 3, 0], ["삼성옆", 4, 0]]
ROUTES = [["143", "trunk"], ["2415", "branch"], ["301", "trunk"], ["999", "express"], ["8", "trunk"]]
READY, LEAVES, GETS = DAY0 + NINE + 4 * 60, DAY0 + NINE + 5 * 60, DAY0 + NINE + 11 * 60   # 143: 09:04 에 정류장 · 09:05 출발 · 09:11 도착


def pattern(route, stops, start, scale=1.0):
    """정류장마다 2분씩 걸리는 패턴 하나(start 에 출발하는 한 대)."""
    return {"r": route, "s": stops, "t": [i * 120 for i in range(len(stops))], "d": [[start, scale]], "starts": [start]}


def run(patterns, routes=ROUTES, onward=(3,), ready=READY):
    """143(09:05 출발 · 09:11 도착)을 고른 구간으로 놓고 같은 구간 다른 노선을 구한다. onward: 지나 내리는 정류장들(경유지에서 이어 탔으면 경유 정류장 먼저)."""
    with patch.object(graph, "BSTOPS", STOPS), patch.object(graph, "BROUTES", routes), patch.object(graph, "BPATS", patterns), \
            patch.object(graph, "BUS_AT", graph.bus_boardings(patterns, routes)):
        return graph._alternatives((0, onward, ready, LEAVES, GETS), "143", DAY0)


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

    def test_next_stops_are_not_the_same_place(self):
        # 옆 정류장에서 타거나 내리는 버스는 어디서 타고 내리는지 안내가 없어 보여 주지 않는다(Codex 리뷰)
        self.assertEqual(run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [1, 3], NINE + 8 * 60)]), [])
        self.assertEqual(run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [0, 4], NINE + 8 * 60)]), [])

    def test_through_the_via_stop_when_the_leg_was_joined(self):
        # 경유지(2)에서 같은 버스로 계속 탄 구간: 경유지를 안 지나는 버스는 양 끝만 같아도 뺀다
        direct = pattern(1, [0, 3], NINE + 6 * 60)
        passing = pattern(2, [0, 2, 3], NINE + 7 * 60)
        backwards = pattern(3, [0, 3, 2], NINE + 7 * 60)   # 경유지를 내린 곳 뒤에 지난다
        found = run([pattern(0, [0, 2, 3], NINE + 5 * 60), direct, passing, backwards], onward=(2, 3))
        self.assertEqual([a["route"] for a in found], ["301"])

    def test_first_ride_is_checked_from_the_shown_departure(self):
        # 첫 탈것: 보이는 출발(leaveBy)대로 가면 정류장에 닿는 때는 고른 버스가 떠나는 09:05 — 그 전에 떠난 버스는 못 탄다
        gone = pattern(1, [0, 3], NINE + 4 * 60 + 30)
        self.assertEqual(run([pattern(0, [0, 3], NINE + 5 * 60), gone], ready=LEAVES), [])
        self.assertEqual([a["route"] for a in run([pattern(0, [0, 3], NINE + 5 * 60), gone], ready=READY)], ["2415"])   # 탐색 때 닿은 때(09:04)면 탈 수 있었다

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


class ShapedTest(unittest.TestCase):
    def test_ready_time_is_the_shown_departure_for_the_first_ride_only(self):
        def bus(route, dep, wait, **extra):
            return {"type": "bus", "route": route, "from": "a", "to": "b", "departs": "09:05", "arrives": "09:11", "wait": wait, "_dep": DAY0 + dep,
                    "_arr": DAY0 + dep + 360, "_ban": [("bus", 0, 0)], "_stop": 3, "_run": None, **extra}
        walk = {"type": "walk", "seconds": 60, "metres": 50, "exit": "", "to": "a", "point": (0.0, 0.0), "label": "x"}
        found = [{"leave": DAY0 + NINE, "arrive": DAY0 + NINE + 900, "legs": [dict(walk), bus("143", NINE + 300, 200), bus("9", NINE + 700, 100)]}]
        with patch.object(graph, "walk_path", lambda a, b: ([], 1, 1)):
            legs = graph._shaped(found, (0.0, 0.0), (1.0, 1.0), WHEN)[0]["legs"]
        first, second = legs[1]["_alt"], legs[2]["_alt"]
        self.assertEqual(first[2], DAY0 + NINE + 300)   # 첫 탈것: 떠나는 때
        self.assertEqual(second[2], DAY0 + NINE + 600)   # 그 뒤: 떠나는 때 - 기다린 때


if __name__ == "__main__":
    unittest.main()
