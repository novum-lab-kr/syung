"""걷기 한 구간만(/route?walk=1 · journey_graph.walk_leg — 2026-11-06 결정 D1): 타고 가기에서 길을 벗어나면 탈 것은 그대로 두고
걷는 길만 다시 찾는다. OSRM 은 가짜(표 · 경로)로 본다.

재현 근거: 지금 /route 는 1.5 km 쯤 떨어지면 걷기 안을 주지 않는다(37.55,126.97 → 시청 10번: 지하철 · 버스 안만 — 계획서 Progress).
"""

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from server.routes import journey as journey_routes
from server.services import journey_graph as graph

SICHEONG = 1
WEST = (37.5629, 126.9708)      # 시청 서쪽 — 9번은 큰길 건너편, 10번은 같은 쪽(test_journey_exit_side)
FAR = (37.5500, 126.9700)       # 시청에서 약 1.6 km 남쪽


class _Osrm:
    """OSRM 흉내: 표는 출구 번호(ref) → 걷는 초(거리 = 초 × 1.4), 경로는 a → 가운데 한 점 → b."""
    def __init__(self, seconds_by_ref=None):
        refs = seconds_by_ref or {}
        self.cells = [refs.get(ref) for _, _, ref in graph._points(SICHEONG)]
        self.routes = []

    def table(self, coords, query):
        dist = [None if s is None else s * 1.4 for s in self.cells]
        return {"durations": [self.cells], "distances": [dist]}

    def route(self, a, b):
        self.routes.append((a, b))
        metres = graph._meters(a, b) * 1.2
        mid = [(a[1] + b[1]) / 2 + 0.001, (a[0] + b[0]) / 2]
        return {"geometry": {"coordinates": [[a[1], a[0]], mid, [b[1], b[0]]]}, "duration": metres / 1.3, "distance": metres}


def every_exit(seconds):
    return {ref: seconds for _, _, ref in graph._points(SICHEONG)}


class WalkLegTest(unittest.TestCase):
    def test_to_a_point_is_one_direct_walk(self):
        dest = (37.5665, 126.9780)
        osrm = _Osrm()
        with patch.object(graph, "OSRM", osrm):
            leg = graph.walk_leg(WEST, dest)
        self.assertEqual(osrm.routes, [(WEST, dest)])
        self.assertEqual(set(leg), {"type", "seconds", "metres", "exit", "direct", "label", "path", "road"})
        self.assertEqual((leg["type"], leg["exit"], leg["direct"], leg["label"]), ("walk", "", True, "목적지까지 걸어서"))
        self.assertEqual(leg["path"][0], [WEST[1], WEST[0]])
        self.assertEqual(leg["path"][-1], [dest[1], dest[0]])
        self.assertGreater(leg["seconds"], 0)

    def test_to_a_station_takes_the_same_side_exit(self):
        osrm = _Osrm({**every_exit(400), "9": 229, "10": 236})   # 9번(길 건너)이 7초 빠르지만 비김 → 10번
        with patch.object(graph, "OSRM", osrm):
            leg = graph.walk_leg(WEST, station=SICHEONG)
        ten = next(p for p in graph._points(SICHEONG) if p[2] == "10")
        self.assertEqual(set(leg), {"type", "seconds", "metres", "exit", "to", "label", "path", "road"})
        self.assertEqual((leg["type"], leg["seconds"], leg["metres"], leg["exit"], leg["to"]), ("walk", 236, 330, "10", "시청"))
        self.assertEqual(leg["label"], "시청역 10번 출구까지")
        self.assertEqual(osrm.routes, [(WEST, ten[:2])], "그린 길도 고른 출구까지")
        self.assertEqual(leg["path"][-1], [ten[1], ten[0]])

    def test_far_from_the_station_still_walks(self):
        self.assertGreater(graph._meters(FAR, (graph.STATIONS[SICHEONG]["lat"], graph.STATIONS[SICHEONG]["lon"])), 1500)
        osrm = _Osrm({**every_exit(1500), "5": 1300})
        with patch.object(graph, "OSRM", osrm):
            leg = graph.walk_leg(FAR, station=SICHEONG)
        self.assertEqual((leg["exit"], leg["seconds"]), ("5", 1300))

    def test_far_point_has_no_distance_limit(self):
        dest = (37.5665, 126.9780)
        self.assertGreater(graph._meters(FAR, dest), 1500)
        far_dest = (37.5900, 126.9700)   # 약 4.4 km — plan 의 걸어가기 상한(2.5 km)도 넘는다
        with patch.object(graph, "OSRM", _Osrm()):
            for end in (dest, far_dest):
                with self.subTest(end=end):
                    leg = graph.walk_leg(FAR, end)
                    self.assertEqual(leg["type"], "walk")
                    self.assertGreater(leg["metres"], graph._meters(FAR, end))

    def test_without_a_router_walks_a_straight_line(self):
        broken = SimpleNamespace(table=Mock(side_effect=OSError), route=Mock(side_effect=OSError))
        with patch.object(graph, "OSRM", broken):
            leg = graph.walk_leg(WEST, station=SICHEONG)
        self.assertEqual(leg["to"], "시청")
        self.assertEqual(len(leg["path"]), 2)

    def test_unknown_or_unreachable_station(self):
        self.assertIsNone(graph.walk_leg(WEST, station=-1))
        with patch.object(graph, "OSRM", _Osrm(every_exit(None))):
            self.assertIsNone(graph.walk_leg(WEST, station=SICHEONG))


class WalkRouteTest(unittest.TestCase):
    def setUp(self):
        self.planner = SimpleNamespace(plan=Mock(), walk=Mock(return_value={"type": "walk"}))
        self.services = SimpleNamespace(journey=self.planner)

    def call(self, query):
        return journey_routes.route(self.services, {"walk": ["1"], **query})

    def test_point_end(self):
        self.assertEqual(self.call({"from": ["37.5,127"], "to": ["37.6,127.1"]}), ({"ok": True, "leg": {"type": "walk"}}, 200))
        self.planner.walk.assert_called_once_with((37.5, 127.0), (37.6, 127.1))
        self.planner.plan.assert_not_called()

    def test_station_end_wins_over_to(self):
        self.assertEqual(self.call({"from": ["37.5,127"], "station": [" 1 "], "to": ["37.6,127.1"]})[1], 200)
        self.planner.walk.assert_called_once_with((37.5, 127.0), station=1)

    def test_bad_input_is_400(self):
        for query in ({}, {"from": ["37.5"], "to": ["37.6,127"]}, {"from": ["nan,127"], "to": ["37.6,127"]},
                      {"from": ["37.5,127"]}, {"from": ["37.5,127"], "to": ["서울"]}, {"from": ["37.5,127"], "station": ["시청"]}):
            with self.subTest(query=query):
                body, status = self.call(query)
                self.assertEqual(status, 400)
                self.assertFalse(body["ok"])
                self.assertIsInstance(body["error"], str)
        self.planner.walk.assert_not_called()

    def test_not_found_is_200_not_ok(self):
        self.planner.walk.return_value = None
        body, status = self.call({"from": ["37.5,127"], "station": ["999999"]})
        self.assertEqual((status, body["ok"]), (200, False))

    def test_without_walk_the_old_route_runs(self):
        self.planner.plan.return_value = {"ok": True, "plans": []}
        for flag in ([], ["0"], [""]):
            with self.subTest(flag=flag):
                query = {"from": ["37.5,127"], "to": ["37.6,127.1"], **({"walk": flag} if flag else {})}
                self.assertEqual(journey_routes.route(self.services, query)[1], 200)
        self.assertEqual(self.planner.plan.call_count, 3)
        self.planner.walk.assert_not_called()


if __name__ == "__main__":
    unittest.main()
