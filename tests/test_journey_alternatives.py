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


# 옆 정류장(걸어서 이어지는 곳): 청담(0) ↔ 청담옆(1) 60 m · 삼성(3) ↔ 삼성옆(4) 70 m (이름이 달라 80 m 이내여야 한다)
WALK = [[[1, 60.0]], [[0, 60.0]], [], [[4, 70.0]], [[3, 70.0]]]


# 정류장 번호 자료(data/bus/stops.json 꼴): 이름 → [(lat, lng, id, 번호)] — 청담옆(1)은 (1, 0) 자리
CATALOG = {"청담옆": [(1.0, 0.0, "122000084", "23187"), (1.0001, 0.0, "122000085", "23188")], "삼성옆": [(4.0, 0.0, "122000095", "23198")]}


def run(patterns, routes=ROUTES, onward=(3,), ready=READY, extra=(), walk=(), stops=STOPS, goal=None):
    """143(09:05 출발 · 09:11 도착)을 고른 구간으로 놓고 같은 구간 다른 노선을 구한다. onward: 지나 내리는 정류장들(경유지에서 이어 탔으면 경유 정류장 먼저)."""
    with patch.object(graph, "BSTOPS", stops), patch.object(graph, "BROUTES", routes), patch.object(graph, "BPATS", patterns), \
            patch.object(graph, "BUS_AT", graph.bus_boardings(patterns, routes)), \
            patch.object(graph, "BUS_WALK", (walk if isinstance(walk, list) else WALK) if walk else []), \
            patch.object(graph, "EXIT_REF", {(7, 1): "11", (8, 4): "3"}), patch.object(graph, "_catalog_by_name", CATALOG):
        return graph._alternatives((0, onward, ready, LEAVES, GETS, *extra), "143", DAY0, goal)


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

    def test_next_stops_are_listed_with_where_to_board_and_get_off(self):
        # 옆 정류장에서 타는 버스: 걷는 시간(60 m → 65초)만큼 늦게 닿는 것으로 보고, 어느 정류장인지(이름 · 거리 · 출구)를 싣는다
        found = run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [1, 3], NINE + 8 * 60)], walk=True, extra=(7, 8))
        self.assertEqual([a["route"] for a in found], ["2415"])
        self.assertEqual(found[0]["boardAt"], {"name": "청담옆", "metres": 60, "id": "122000084", "ars": "23187", "exit": "11"})
        self.assertNotIn("alightAt", found[0])
        found = run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [0, 4], NINE + 8 * 60)], walk=True, extra=(7, 8))
        self.assertEqual(found[0]["alightAt"], {"name": "삼성옆", "metres": 70, "id": "122000095", "ars": "23198", "exit": "3"})
        self.assertNotIn("boardAt", found[0])

    def test_next_stop_carries_the_stop_number(self):
        # 같은 이름 다른 정류장을 가르도록 정류장 id · 번호를 싣는다(가장 가까운 같은 이름 정류장의 것)
        found = run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [1, 3], NINE + 8 * 60), pattern(2, [0, 4], NINE + 9 * 60)], walk=True, extra=(7, 8))
        by_route = {a["route"]: a for a in found}
        self.assertEqual((by_route["2415"]["boardAt"]["id"], by_route["2415"]["boardAt"]["ars"]), ("122000084", "23187"))
        self.assertEqual(by_route["301"]["alightAt"]["ars"], "23198")

    def test_next_stop_distance_limits_by_name(self):
        # 이름이 같으면 150 m 까지, 다르면 80 m 까지(걷기 1분 안팎) — 그 밖은 후보가 아니다
        names = [["청담", 0, 0], ["청담", 1, 0], ["옆동네", 2, 0], ["삼성", 3, 0]]
        def near(same_m, other_m):
            return [[[1, same_m], [2, other_m]], [[0, same_m]], [[0, other_m]], []]
        patterns = [pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [1, 3], NINE + 8 * 60), pattern(2, [2, 3], NINE + 9 * 60)]
        self.assertEqual([a["route"] for a in run(patterns, walk=near(150.0, 80.0), stops=names)], ["2415", "301"])   # 경계값은 들어간다
        self.assertEqual([a["route"] for a in run(patterns, walk=near(151.0, 81.0), stops=names)], [])
        self.assertEqual([a["route"] for a in run(patterns, walk=near(140.0, 90.0), stops=names)], ["2415"])   # 이름 다른 90 m 는 빠진다

    def test_same_stop_has_no_note_and_is_preferred(self):
        found = run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [0, 3], NINE + 8 * 60), pattern(1, [1, 3], NINE + 8 * 60)], walk=True)
        self.assertEqual(len(found), 1)
        self.assertNotIn("boardAt", found[0])

    def test_next_stop_bus_already_gone_when_you_arrive_is_left_out(self):
        # 옆 정류장은 65초 걸어야 닿아 — 고른 버스가 떠난 09:05 보다 먼저 떠나면(09:05:30 에 닿아도 이미 떠남) 못 탄다
        gone = pattern(1, [1, 3], NINE + 4 * 60 + 30)
        self.assertEqual(run([pattern(0, [0, 3], NINE + 5 * 60), gone], walk=True, ready=READY + 30), [])

    def test_without_walk_links_next_stop_buses_stay_out(self):
        self.assertEqual(run([pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [1, 3], NINE + 8 * 60)]), [])

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

    def test_last_ride_alights_by_arrival_at_destination_not_by_distance(self):
        # 마지막 탈것: 내리는 곳이 150 m 넘게 떨어져도(삼성옆 5 = 230 m) 목적지 도착이 비슷하면 후보, 늦으면 빠진다
        stops = [*STOPS, ["삼성먼", 3.002, 0]]   # 5 번 정류장: 3(삼성) 에서 약 222 m
        final = GETS + 120   # 고른 길은 143 이 닿고 2분 걸어 목적지에 닿는다
        extra = (None, None, final)
        patterns = [pattern(0, [0, 3], NINE + 5 * 60), pattern(1, [0, 5], NINE + 7 * 60)]
        near = {("bs", 3): (120, 150, "", 0.0, 0.0), ("bs", 5): (150, 200, "", 0.0, 0.0)}
        found = run(patterns, extra=extra, stops=stops, goal=near)
        self.assertEqual([a["route"] for a in found], ["2415"])
        self.assertEqual(found[0]["alightAt"]["name"], "삼성먼")
        self.assertEqual(found[0]["alightAt"]["destMinutes"], 2)   # 150 초 → 반올림 2분
        far = {("bs", 3): (120, 150, "", 0.0, 0.0), ("bs", 5): (2000, 1500, "", 0.0, 0.0)}   # 내려서 한참 걸어야 한다
        self.assertEqual(run(patterns, extra=extra, stops=stops, goal=far), [])
        self.assertEqual(run(patterns, extra=extra, stops=stops), [])   # 마지막 탈것이 아니면(goal 없음) 옛 규칙: 150 m 넘어 빠진다

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
        self.assertEqual(first[5:], (None, None, None))   # 앞 · 뒤에 지하철 갈아타기가 없다
        self.assertEqual(first[2], DAY0 + NINE + 300)   # 첫 탈것: 떠나는 때
        self.assertEqual(second[2], DAY0 + NINE + 600)   # 그 뒤: 떠나는 때 - 기다린 때


if __name__ == "__main__":
    unittest.main()
