"""경유지 길찾기(/route?via= · journey_graph.plan_via — 2026-10-29 사용자 결정 A): 탐색 자료 대신 가짜 탐색 결과로 본다."""

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

from server.clock import KST
from server.routes import journey as journey_routes
from server.services import journey_graph as graph

WHEN = datetime(2026, 10, 29, 9, 0, tzinfo=KST)
T0 = WHEN.timestamp()
ORIGIN, VIA, DEST = (37.50, 127.00), (37.55, 127.05), (37.60, 127.10)
COORDS = {"from": ["37.5,127.0"], "to": ["37.6,127.1"]}


def ride(name, arrive, *, kind="ride", legs=1, station=7):
    """걷기 없이 타기만 하는 가짜 탐색 결과 하나(legs 구간 · 마지막에 station 역에서 내림)."""
    parts = [{"type": kind, "line" if kind == "ride" else "route": f"{name}-{i}", "from": f"{name}{i}", "to": f"{name}{i + 1}",
              "seconds": 300, "stations": [station - 1, station], "color": "#3d5bab",
              "_dep": arrive - 600, "_ban": ("x", (f"{name}-{i}",))} for i in range(legs)]
    return {"leave": arrive - 900, "arrive": arrive, "legs": parts}


class Batches:
    """run_batch 대역: 탐색마다 (어디로 · 언제 · 탈것 · 예산)을 적고, 앞 구간(경유지로)과 뒤 구간(도착지로)에 따로 답한다."""
    def __init__(self, first, second):
        self.first, self.second, self.calls = first, second, []

    def __call__(self, jobs, seconds):
        out = []
        for when, _start, _goal, _live, _pen, _banned, modes, _ceiling, toward in jobs:
            self.calls.append((toward, when, modes, seconds))
            out.append(self.first(len([c for c in self.calls if c[0] == VIA])) if toward == VIA else self.second(when, modes))
        return out


class ViaPlanTest(unittest.TestCase):
    def setUp(self):
        patches = [patch.object(graph, "BUS", False),
                   patch.object(graph, "_near_nodes", lambda point: []),
                   patch.object(graph, "_walk_table", lambda point, nodes, reverse=False: {}),
                   patch.object(graph, "_data", {"transfer": {"7": 150}, "defaultTransfer": 120})]
        for active in patches:
            active.start()
            self.addCleanup(active.stop)

    def test_joins_each_first_part_with_the_second_found_from_its_arrival(self):
        # 앞 구간: 가장 빨리 닿는 길 A(09:30) 하나, 그 뒤로는 비켜 가는 길들(늦게 닿는다)
        batches = Batches(lambda n: ride(f"A{n}", T0 + 1800 + (n - 1) * 300),
                          lambda when, modes: ride(f"B{int(when.timestamp())}", when.timestamp() + 1200))
        result = graph.plan_via(ORIGIN, VIA, DEST, WHEN, {}, batches, 3)
        self.assertTrue(result["ok"])
        seconds = [c for c in batches.calls if c[0] == DEST]
        self.assertTrue(seconds, "뒤 구간을 찾았다")
        # 뒤 구간은 앞 구간이 닿은 시각 + 내린 역(7)의 갈아타기 여유(150초)부터
        firsts = sorted(T0 + 1800 + i * 300 for i in range(graph.VIA_FIRST))
        self.assertEqual(sorted(c[1].timestamp() for c in seconds), [t + 150 for t in firsts])
        best = result["plans"][0]
        self.assertEqual(best["tag"], "가장 빠른 길")
        self.assertEqual(best["leaveBy"], "09:15")   # 앞 구간이 떠나는 시각(09:30 - 15분)
        self.assertEqual(best["arrives"], "09:52")   # 09:30 + 2분 30초 여유 + 20분 → 09:52:30
        self.assertEqual(best["minutes"], round((T0 + 1800 + 150 + 1200 - T0) / 60))
        self.assertEqual(best["transfers"], 1, "앞 · 뒤 구간을 이어 탄 것도 환승 하나")
        self.assertEqual([leg["line"][0] for leg in best["legs"]], ["A", "B"])
        self.assertTrue(all("_dep" not in leg and "_ban" not in leg for leg in best["legs"]))
        self.assertEqual(result["straightMetres"], round(graph._meters(ORIGIN, DEST)))

    def test_budget_is_shared_and_never_over_search_seconds(self):
        batches = Batches(lambda n: ride(f"A{n}", T0 + 1800 + n * 60), lambda when, modes: ride("B", when.timestamp() + 600))
        graph.plan_via(ORIGIN, VIA, DEST, WHEN, {}, batches, 3)
        firsts = [c[3] for c in batches.calls if c[0] == VIA]
        seconds = [c[3] for c in batches.calls if c[0] == DEST]
        self.assertTrue(all(left <= graph.SEARCH_SECONDS * graph.VIA_FIRST_SHARE for left in firsts), firsts)
        self.assertTrue(seconds and all(0 < left <= graph.SEARCH_SECONDS for left in seconds), seconds)   # 뒤 구간은 남은 예산(전체에서 이미 쓴 만큼 뺀 것)

    def test_second_part_rides_the_same_kind_first_then_both(self):
        # 앞 구간이 지하철만이면 뒤 구간도 지하철만으로 먼저 찾고, 못 찾으면 둘 다로 한 번 더(남은 예산에서)
        def second(when, modes):
            return None if modes == frozenset({"subway"}) else ride("B", when.timestamp() + 600, kind="bus")
        batches = Batches(lambda n: ride(f"A{n}", T0 + 1800 + n * 60) if n == 1 else None, second)
        result = graph.plan_via(ORIGIN, VIA, DEST, WHEN, {}, batches, 3)
        self.assertEqual([c[2] for c in batches.calls if c[0] == DEST], [frozenset({"subway"}), frozenset({"subway", "bus"})])
        self.assertEqual([p["kind"] for p in result["plans"]], ["mixed"])

    def test_kinds_are_kept_for_the_filter(self):
        # 지하철만 · 버스만 앞 구간이 있으면 같은 탈것 뒤 구간을 붙여 이어 붙인 길에도 지하철만 · 버스만 길이 남는다(조건 바꾸기)
        firsts = {1: ride("A", T0 + 1800), 2: ride("C", T0 + 1900, kind="bus")}
        batches = Batches(lambda n: firsts.get(n),
                          lambda when, modes: ride("B", when.timestamp() + 600, kind="bus" if modes == frozenset({"bus"}) else "ride"))
        kinds = sorted(p["kind"] for p in graph.plan_via(ORIGIN, VIA, DEST, WHEN, {}, batches, 3)["plans"])
        self.assertEqual(kinds, ["bus", "subway"])

    def test_many_transfers_go_last_after_joining(self):
        # 앞 구간 4개(환승 3) + 뒤 구간 1개 = 탈 것 5개(환승 4): 가장 빨라도 맨 뒤(#101 규칙 그대로)
        firsts = {1: ride("A", T0 + 1800, legs=4), 2: ride("C", T0 + 2000)}
        batches = Batches(lambda n: firsts.get(n), lambda when, modes: ride(f"B{int(when.timestamp())}", when.timestamp() + 600))
        plans = graph.plan_via(ORIGIN, VIA, DEST, WHEN, {}, batches, 3)["plans"]
        self.assertEqual([p["transfers"] for p in plans], [1, 4])
        self.assertEqual(plans[-1]["tag"], "가장 빠른 길")

    def test_no_first_part_means_no_plans(self):
        result = graph.plan_via(ORIGIN, VIA, DEST, WHEN, {}, Batches(lambda n: None, lambda when, modes: None), 3)
        self.assertEqual((result["ok"], result["plans"]), (False, []))
        self.assertIn("error", result)

    def test_slow_walk_lookup_does_not_eat_the_search_budget(self):
        # 출발 → 경유지가 2.5 km 안이라 걷기를 OSRM 에 묻는데 그 조회가 예산(4초)보다 오래 걸려도 뒤 구간은 찾는다(Codex 리뷰 2026-10-29)
        clock = [1000.0]

        def slow_walk(a, b):
            clock[0] += graph.SEARCH_SECONDS + 2   # 걷기 조회 한 번에 6초
            return [[a[1], a[0]], [b[1], b[0]]], 3600, 4000   # 한 시간 걷기 — 탈것이 이긴다
        batches = Batches(lambda n: ride(f"A{n}", T0 + 1800) if n == 1 else None,
                          lambda when, modes: ride("B", when.timestamp() + 600))
        near = (37.545, 127.045)   # 경유지(VIA)에서 약 700 m
        with patch.object(graph, "walk_path", slow_walk), patch.object(graph.time, "monotonic", lambda: clock[0]):
            result = graph.plan_via(near, VIA, (37.545, 127.055), WHEN, {}, batches, 3)
        self.assertTrue([c for c in batches.calls if c[0] != VIA], "뒤 구간을 찾았다")
        self.assertTrue(result["ok"])

    def test_walk_legs_meet_at_the_via_point(self):
        walked = []

        def walk_path(a, b):
            walked.append((a, b))
            return [[a[1], a[0]], [b[1], b[0]]], 60, 70
        first, second = ride("A", T0 + 1800), ride("B", T0 + 3000)
        first["legs"] += [{"type": "walk", "seconds": 60, "metres": 70, "exit": "1", "from": "A1", "point": (37.551, 127.051),
                           "label": "A1역 1번 출구에서 목적지까지"}]
        second["legs"].insert(0, {"type": "walk", "seconds": 60, "metres": 70, "exit": "2", "to": "B0", "point": (37.549, 127.049),
                                  "label": "B0역 2번 출구까지"})
        with patch.object(graph, "walk_path", walk_path):
            plans = graph.plan_via((37.0, 126.0), VIA, (38.0, 128.0), WHEN, {},
                                   Batches(lambda n: first if n == 1 else None, lambda when, modes: second), 3)["plans"]
        legs = plans[0]["legs"]
        self.assertEqual(legs[1]["label"], "A1역 1번 출구에서 경유지까지")
        self.assertIn(((37.551, 127.051), VIA), walked)
        self.assertIn((VIA, (37.549, 127.049)), walked)
        self.assertTrue(all("point" not in leg for leg in legs))
        self.assertEqual(plans[0]["walkMinutes"], 2)


class ViaRouteTest(unittest.TestCase):
    def setUp(self):
        self.planner = SimpleNamespace(plan=Mock(return_value={"ok": True, "plans": []}))
        self.services = SimpleNamespace(journey=self.planner)

    def test_without_via_the_call_is_unchanged(self):
        for query in (COORDS, {**COORDS, "via": [""]}, {**COORDS, "via": ["  "]}):
            with self.subTest(query=query):
                journey_routes.route(self.services, {**query, "at": ["2026-10-29T09:00"]})
                self.planner.plan.assert_called_with((37.5, 127.0), (37.6, 127.1), WHEN)

    def test_via_is_passed_on(self):
        body, status = journey_routes.route(self.services, {**COORDS, "at": ["2026-10-29T09:00"], "via": ["37.55,127.05"]})
        self.assertEqual(status, 200)
        self.planner.plan.assert_called_once_with((37.5, 127.0), (37.6, 127.1), WHEN, (37.55, 127.05))

    def test_bad_via_is_refused(self):
        for value in ("성수", "37.5", "37.5,127,1", "nan,127", "37.5,inf"):
            with self.subTest(value=value):
                self.assertEqual(journey_routes.route(self.services, {**COORDS, "via": [value]}),
                                 ({"ok": False, "error": "경유지 좌표는 via=위도,경도 예요"}, 400))
        self.planner.plan.assert_not_called()


if __name__ == "__main__":
    unittest.main()
