"""걷기 구간의 길 위 부분(road = [i, j] — 2026-11-07): path[i] … path[j] 가 OSRM 길을 따라가고, 그 앞 · 뒤 마디는 길 밖 직선 이음
(내 위치 → 가장 가까운 길 · 길 → 끝 점 — 웹이 흐리게 그린다). 이음이 없으면 [0, len-1], 길 위 마디가 없으면 [0, 0].

재현 근거: walk_path 가 [내 위치, OSRM 길…, 끝] 을 이어 붙여 첫 마디가 건물 위를 직선으로 지났다(운영 예 59 m) — path 만으로는 어느 마디가 이음인지 모른다.
"""

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from server.services import journey_graph as graph

LAT, LNG = 37.56, 126.97
M_LAT = 1 / 111320                       # 1 m 위도
M_LNG = 1 / (111320 * 0.7907)            # 1 m 경도(위도 37.56)


def pt(east: float, north: float) -> list[float]:
    """기준점에서 동쪽 · 북쪽 m → [lng, lat]."""
    return [LNG + east * M_LNG, LAT + north * M_LAT]


def at(east: float, north: float) -> tuple[float, float]:
    q = pt(east, north)
    return (q[1], q[0])


class _Osrm:
    def __init__(self, coords):
        self.coords = coords

    def route(self, a, b):
        return {"geometry": {"coordinates": self.coords}, "duration": 100.0, "distance": 120.0}


def walk(a, b, coords):
    with patch.object(graph, "OSRM", _Osrm(coords)):
        return graph.walk_path(a, b)


class WalkRoadTest(unittest.TestCase):
    def check_road(self, path, road, osrm):
        i, j = road
        self.assertTrue(0 <= i <= j < len(path))
        for q in path[i:j + 1]:
            self.assertIn(q, osrm, "길 위 구간은 OSRM 의 점만")

    def test_start_and_end_on_the_road_have_no_connector(self):
        road_pts = [pt(0, 0), pt(100, 0), pt(100, 80)]
        path, _, _, road = walk(at(0, 0), at(100, 80), road_pts)
        self.assertEqual(path, road_pts)
        self.assertEqual(road, [0, len(path) - 1])

    def test_connectors_at_both_ends(self):
        road_pts = [pt(0, 50), pt(100, 50), pt(100, 150)]
        a, b = at(0, 0), at(140, 150)          # 길까지 50 m · 길 끝에서 40 m — 건물을 지나는 직선
        path, _, _, road = walk(a, b, road_pts)
        self.assertEqual(path, [pt(0, 0), *road_pts, pt(140, 150)])
        self.assertEqual(road, [1, len(path) - 2])
        self.check_road(path, road, road_pts)

    def test_points_near_the_start_are_dropped_and_the_road_starts_after_them(self):
        # 시작 12 m 안의 OSRM 점(출구를 돌아 붙은 갈고리)은 _unhook 이 지운다 — road 는 지운 뒤 path 기준
        road_pts = [pt(5, 0), pt(8, 3), pt(60, 3), pt(60, 120)]
        path, _, _, road = walk(at(0, 0), at(60, 160), road_pts)
        self.assertEqual(path, [pt(0, 0), pt(60, 3), pt(60, 120), pt(60, 160)])
        self.assertEqual(road, [1, 2])
        self.check_road(path, road, road_pts)

    def test_points_near_the_end_are_dropped_too(self):
        road_pts = [pt(0, 30), pt(100, 30), pt(100, 85), pt(104, 88)]
        path, _, _, road = walk(at(0, 0), at(100, 90), road_pts)
        self.assertEqual(path, [pt(0, 0), pt(0, 30), pt(100, 30), pt(100, 90)])
        self.assertEqual(road, [1, 2])
        self.check_road(path, road, road_pts)

    def test_first_road_point_doubling_back_is_dropped(self):
        # OSRM 첫 점이 지나쳤다 되돌아오는 점이면 _unhook 이 지우고 다음 점부터 길
        road_pts = [pt(0, 60), pt(0, 30), pt(80, 30), pt(80, 120)]
        path, _, _, road = walk(at(0, 0), at(80, 120), road_pts)
        self.assertEqual(path[road[0]], pt(0, 30))
        self.assertEqual(path[road[1]], pt(80, 120))
        self.check_road(path, road, road_pts)

    def test_folded_to_two_points_is_all_connector(self):
        road_pts = [pt(3, 2), pt(6, 4)]          # 짧은 걷기 — 모두 끝 12 m 안이라 [시작, 끝] 으로 접힌다
        path, _, _, road = walk(at(0, 0), at(8, 5), road_pts)
        self.assertEqual(path, [pt(0, 0), pt(8, 5)])
        self.assertEqual(road, [0, 0])

    def test_one_road_point_left_is_all_connector(self):
        road_pts = [pt(30, 40)]
        path, _, _, road = walk(at(0, 0), at(60, 0), road_pts)
        self.assertEqual(len(path), 3)
        self.assertEqual(road, [0, 0])

    def test_without_a_router_is_one_straight_connector(self):
        broken = SimpleNamespace(route=Mock(side_effect=OSError))
        with patch.object(graph, "OSRM", broken):
            path, _, _, road = graph.walk_path(at(0, 0), at(300, 0))
        self.assertEqual(len(path), 2)
        self.assertEqual(road, [0, 0])

    def test_unhook_kept_counts_input_points(self):
        pts = [pt(0, 0), pt(5, 0), pt(8, 3), pt(60, 3), pt(60, 3), pt(60, 120), pt(60, 160)]
        self.assertEqual(graph._unhook_kept(pts), [0, 3, 5, 6])   # 시작 12 m 안 · 겹친 점은 빠진다


class ShapedRoadTest(unittest.TestCase):
    def test_plan_walk_legs_carry_road(self):
        walk_leg = {"type": "walk", "seconds": 60, "metres": 50, "exit": "", "to": "a", "point": (0.0, 0.0), "label": "x"}
        found = [{"leave": 0.0, "arrive": 600.0, "legs": [dict(walk_leg)]}]
        with patch.object(graph, "walk_path", lambda a, b: ([[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]], 1, 1, [1, 2])):
            legs = graph._shaped(found, (0.0, 0.0), (1.0, 1.0), graph.datetime(2026, 11, 7, 9, 0, tzinfo=graph.KST))[0]["legs"]
        self.assertEqual(legs[0]["road"], [1, 2])


if __name__ == "__main__":
    unittest.main()
