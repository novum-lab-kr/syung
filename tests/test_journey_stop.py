"""길찾기 일찍 멈추기 · 보여 줄 길 고르기(2026-10-28 사용자 결정 B): 탐색 자료 대신 가짜 탐색 결과로 본다."""

import unittest
from datetime import datetime
from unittest.mock import patch

from server.clock import KST
from server.services import journey_graph as graph

WHEN = datetime(2026, 10, 29, 9, 0, tzinfo=KST)


def ride(line, arrive, *, legs=1):
    """지하철만 타는 가짜 탐색 결과 하나(legs 구간 · 걷기 없음)."""
    parts = [{"type": "subway", "line": f"{line}-{i}", "from": i, "to": i + 1, "seconds": 300,
              "_dep": arrive - 600, "_ban": ("x", (f"{line}-{i}",))} for i in range(legs)]
    return {"leave": arrive - 900, "arrive": arrive, "legs": parts}


class PickShownTest(unittest.TestCase):
    def test_tagged_plans_are_kept_and_order_stays_by_arrival(self):
        plans = [{"tag": "가장 빠른 길" if i == 0 else "", "_arrive": 100 + i} for i in range(8)]
        plans.append({"tag": "환승 적은 길", "_arrive": 200})   # 가장 늦게 닿지만 태그가 있다
        shown = graph._pick_shown(plans)
        self.assertEqual(len(shown), graph.MAX_PLANS)
        self.assertEqual([p["_arrive"] for p in shown], [100, 101, 102, 103, 200])

    def test_fewer_than_max_are_all_kept(self):
        plans = [{"tag": "", "_arrive": 1}, {"tag": "걸어가기", "_arrive": 2}]
        self.assertEqual(graph._pick_shown(plans), plans)


class ShownCountTest(unittest.TestCase):
    def test_counts_after_grouping_and_dropping_dominated(self):
        t = WHEN.timestamp()
        found = [ride("A", t + 1800), ride("A", t + 1900),   # 같은 구간 → 하나
                 ride("B", t + 2000), ride("C", t + 1800 + graph.DOMINATED_LATE + 60),   # C 는 A 보다 늦고 나을 게 없다
                 ride("D", t + 1800 + graph.ROUTE_SLACK + 60)]   # 너무 늦다
        self.assertEqual(graph._shown_count(found, t + 1800), 2)


class EarlyStopTest(unittest.TestCase):
    def setUp(self):
        patches = [patch.object(graph, "BUS", False),   # 첫 탐색 둘(가장 빠른 · 환승 적은)
                   patch.object(graph, "_near_nodes", lambda point: []),
                   patch.object(graph, "_walk_table", lambda point, nodes, reverse=False: {}),
                   patch.object(graph, "SEARCH_SECONDS", 60.0)]
        for active in patches:
            active.start()
            self.addCleanup(active.stop)

    def test_stops_once_seed_searches_are_done_and_five_can_be_shown(self):
        made = []

        def run_batch(jobs, seconds):
            out = []
            for _ in jobs:
                made.append(1)
                out.append(ride(f"L{len(made)}", WHEN.timestamp() + 1800 + len(made) * 60))
            return out
        result = graph.plan((37.50, 127.00), (37.60, 127.10), WHEN, {}, run_batch, 3)
        # 묶음마다 2개씩(첫 탐색 둘 → 그 길을 비켜 가는 탐색 둘 …): 6개째에서 보여 줄 길 5개 이상 → 멈춤(전엔 24번까지)
        self.assertEqual(result["searched"]["searches"], 6)
        self.assertEqual(len(result["plans"]), graph.MAX_PLANS)
        self.assertEqual(result["plans"][0]["tag"], "가장 빠른 길")

    def test_keeps_searching_while_too_few_can_be_shown(self):
        made = []

        def run_batch(jobs, seconds):   # 첫 길 뒤로는 다른 길이지만 모두 그 길보다 늦고 나을 게 없다(보여 줄 길 1개)
            out = []
            for _ in jobs:
                made.append(1)
                late = 0 if len(made) == 1 else graph.DOMINATED_LATE + 60 + len(made)
                out.append(ride(f"L{len(made)}", WHEN.timestamp() + 1800 + late))
            return out
        result = graph.plan((37.50, 127.00), (37.60, 127.10), WHEN, {}, run_batch, 3)
        # 멈추지 않고 비켜 갈 탐색이 바닥날 때까지(첫 탐색 둘 × 비켜 가기 세 겹 = 8 — 6번째에서 멈추지 않는다)
        self.assertEqual(result["searched"]["searches"], 8)
        self.assertEqual(len(result["plans"]), 1)


if __name__ == "__main__":
    unittest.main()
