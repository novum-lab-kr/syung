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


class EasyFirstTest(unittest.TestCase):
    def test_many_transfers_go_last_and_the_rest_keep_order(self):
        # 옥정 → 양재(2026-10-29): 환승 4번(버스 5대) 길이 도착 2번째로 나왔다
        plans = [{"tag": "", "transfers": 1, "_arrive": 100},
                 {"tag": "가장 빠른 길", "transfers": 4, "_arrive": 90},
                 {"tag": "환승 적은 길", "transfers": 0, "_arrive": 120},
                 {"tag": "", "transfers": 5, "_arrive": 95},
                 {"tag": "", "transfers": 3, "_arrive": 130}]
        shown = graph._easy_first(plans)
        self.assertEqual([p["_arrive"] for p in shown], [100, 120, 130, 90, 95])
        # 태그는 그대로(가장 빠른 길이 환승 4번이어도 태그는 남고 차례만 뒤)
        self.assertEqual([p["tag"] for p in shown], ["", "환승 적은 길", "", "가장 빠른 길", ""])

    def test_three_transfers_stay_in_place(self):
        plans = [{"tag": "", "transfers": graph.MAX_EASY_TRANSFERS, "_arrive": i} for i in range(3)]
        self.assertEqual(graph._easy_first(plans), plans)

    def test_plan_puts_four_transfer_way_last(self):
        made = []

        def run_batch(jobs, seconds):   # 첫 길(가장 빨리 닿음)만 탈 것 5개(환승 4번), 나머지는 1개
            out = []
            for _ in jobs:
                made.append(1)
                legs = 5 if len(made) == 1 else 1
                out.append(ride(f"L{len(made)}", WHEN.timestamp() + 1800 + len(made) * 60, legs=legs))
            return out
        with patch.object(graph, "BUS", False), patch.object(graph, "_near_nodes", lambda point: []), \
                patch.object(graph, "_walk_table", lambda point, nodes, reverse=False: {}), \
                patch.object(graph, "SEARCH_SECONDS", 60.0):
            result = graph.plan((37.50, 127.00), (37.60, 127.10), WHEN, {}, run_batch, 3)
        plans = result["plans"]
        self.assertEqual(plans[-1]["transfers"], 4)
        self.assertEqual(plans[-1]["tag"], "가장 빠른 길")
        self.assertTrue(all(p["transfers"] == 0 for p in plans[:-1]))
        arrives = [p["arrives"] for p in plans[:-1]]
        self.assertEqual(arrives, sorted(arrives))


class ShownCountTest(unittest.TestCase):
    def test_counts_after_grouping_and_dropping_dominated(self):
        t = WHEN.timestamp()
        found = [ride("A", t + 1800), ride("A", t + 1900),   # 같은 구간 → 하나
                 ride("B", t + 2000), ride("C", t + 1800 + graph.DOMINATED_LATE + 60),   # C 는 A 보다 늦고 나을 게 없다
                 ride("D", t + 1800 + graph.ROUTE_SLACK + 60)]   # 너무 늦다
        self.assertEqual(graph._shown_count(found, t + 1800, None, t), 2)

    def test_rides_later_than_walking_are_not_counted(self):
        t = WHEN.timestamp()
        found = [ride(f"L{i}", t + 1200 + i * 60) for i in range(6)]   # 20~25분에 닿는 길 여섯
        self.assertEqual(graph._shown_count(found, t + 1200, None, t), 6)   # 걸어가기 없음(멀다)
        # 걸어서 22분 30초: 걷기보다 일찍 닿는 셋(20 · 21 · 22분) + 걸어가기 하나
        self.assertEqual(graph._shown_count(found, t + 1200, 1350, t), 4)
        # 걸어서 40분: 가장 빠른 탈것보다 10분 넘게 늦어 걸어가기를 안 붙인다 → 탈것 여섯 그대로
        self.assertEqual(graph._shown_count(found, t + 1200, 2400, t), 6)


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


    def test_does_not_stop_on_rides_that_walking_beats(self):
        made = []

        def run_batch(jobs, seconds):   # 다른 길이 넉넉히 나오지만 모두 걸어서(15분)보다 늦게 닿는다
            out = []
            for _ in jobs:
                made.append(1)
                out.append(ride(f"L{len(made)}", WHEN.timestamp() + 1200 + len(made) * 60))
            return out
        near = (37.5010, 127.0010)   # 약 140 m — 걸어갈 만큼 가깝다
        with patch.object(graph, "walk_path", lambda a, b: ([[a[1], a[0]], [b[1], b[0]]], 900, 1100)):
            result = graph.plan((37.50, 127.00), near, WHEN, {}, run_batch, 3)
        # 걸어가기에 밀려 빠질 길로는 멈추지 않는다(전엔 6번째에서 멈춤) — 비켜 갈 탐색이 바닥날 때까지 8번
        self.assertEqual(result["searched"]["searches"], 8)
        self.assertEqual([p["tag"] for p in result["plans"]], ["걸어가기"])


if __name__ == "__main__":
    unittest.main()
