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


STATION_VIA = (37.5193, 127.0539)   # 청담역(442) 중심에서 20 m — 카카오 '청담역 7호선' 좌표
CHEONGDAM, STOP, OTHER = 442, 0, 1   # 역 · 출구 가까운 정류장 · 그 정류장에서 걸어가는 정류장(가짜 버스 자료 번호)


def leg(kind, name, frm, to, **extra):
    """탐색 결과 구간 하나(_search 가 만드는 칸만)."""
    base = {"type": kind, "from": frm, "to": to, "stops": 2, "departs": "08:20", "arrives": "08:30", "seconds": 600,
            "_dep": T0 + 1200, "color": "#3d5bab"}
    if kind == "ride":
        base |= {"line": name, "direction": "장암행" if name == "7호선" else None, "stations": [440, 441, CHEONGDAM],
                 "_ban": [(name, 440), (name,)]}
    else:
        base |= {"route": name, "path": [[127.0, 37.5], [127.05, 37.52]], "_ban": [("bus", 9, STOP), ("bus", 9)]}
    return base | extra


def end_walk(name):
    return {"type": "walk", "seconds": 0, "metres": 0, "exit": "", "from": name, "point": STATION_VIA, "label": f"{name}역에서 목적지까지"}


def start_walk(name, seconds):
    return {"type": "walk", "seconds": seconds, "metres": 0, "exit": "", "to": name, "point": STATION_VIA, "label": f"{name}역까지"}


class StationViaTest(unittest.TestCase):
    """경유지가 역 · 정류장이면 좌표까지 걷지 않고 그 역 · 정류장에서 갈아탄다(2026-10-29 사용자 결정)."""

    def setUp(self):
        stops = [["청담역.경기고교", 37.5197, 127.0550], ["진흥아파트.청담역", 37.5199, 127.0560]]
        patches = [patch.object(graph, "BUS", True), patch.object(graph, "BSTOPS", stops),
                   patch.object(graph, "STATION_BUS", {CHEONGDAM: [(STOP, 80.0, (37.5195, 127.0545))]}),
                   patch.object(graph, "BUS_STATION", {STOP: [(CHEONGDAM, 80.0, (37.5195, 127.0545))]}),
                   patch.object(graph, "BUS_WALK", [[(OTHER, 90.0)], []]),
                   patch.object(graph, "_near_nodes", lambda point: []),
                   patch.object(graph, "_walk_table", lambda point, nodes, reverse=False: {}),
                   patch.object(graph, "_data", {"transfer": {str(CHEONGDAM): 150}, "defaultTransfer": 120})]
        for active in patches:
            active.start()
            self.addCleanup(active.stop)
        self.jobs = []

    def batches(self, first, second):
        def run(jobs, seconds):
            self.jobs += jobs
            return [first if toward == STATION_VIA else second(start) for _w, start, *_rest, toward in jobs]
        return run

    def test_station_and_its_stops_are_the_via(self):
        self.assertEqual(graph._via_nodes(STATION_VIA), [("at", CHEONGDAM), ("bs", STOP)])
        self.assertEqual(graph._via_nodes((37.53, 127.06)), [], "역 · 정류장이 아닌 곳(건물)은 지금처럼 좌표")

    def test_subway_then_bus_from_the_stop_near_the_station(self):
        # 재현: 7호선 먹골 → 청담 하차 → 청담역 근처 정류장 143 — 좌표(역 중심)까지 걸었다 돌아가지 않는다
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("ride", "7호선", "먹골", "청담"), end_walk("청담")]}
        second = {"leave": T0 + 2000, "arrive": T0 + 2900, "legs": [start_walk("청담역.경기고교", 172), leg("bus", "143", "청담역.경기고교", "무역센터", _stop=5)]}
        result = graph.plan_via(ORIGIN, STATION_VIA, DEST, WHEN, {}, self.batches(first, lambda start: second), 3)
        goal = self.jobs[0][2]
        self.assertEqual(sorted(goal), [("at", CHEONGDAM), ("bs", STOP)])
        self.assertTrue(all(w[0] == 0 for w in goal.values()), "역 · 근처 정류장에 닿으면 끝(걷기 0)")
        seconds = [j for j in self.jobs if j[-1] == DEST]
        self.assertEqual(seconds[0][0].timestamp(), T0 + 1800, "뒤 구간은 내린 시각부터(갈아타기 시간은 시작 걷기에)")
        start = seconds[0][1]
        self.assertEqual(start[("at", CHEONGDAM)][0], 150, "같은 역 갈아타기 시간")
        self.assertEqual(start[("bs", STOP)][0], graph._walk_sec(80.0) + graph.STATION_ACCESS, "역 ↔ 근처 정류장은 탐색의 환승 걷기 그대로")
        legs = result["plans"][0]["legs"]
        self.assertEqual([l["type"] for l in legs], ["ride", "walk", "bus"])
        self.assertEqual(legs[1]["label"], "청담역에서 청담역.경기고교 정류장으로")
        self.assertEqual(legs[1]["seconds"], graph._walk_sec(80.0) + graph.STATION_ACCESS)
        self.assertTrue(all(k not in l for l in legs for k in ("_stop", "_dep", "_ban", "point", "a", "b")))
        self.assertEqual(result["plans"][0]["transfers"], 1)

    def test_same_train_through_the_via_station_is_one_leg(self):
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("ride", "7호선", "먹골", "청담"), end_walk("청담")]}
        on = leg("ride", "7호선", "청담", "강남구청", stations=[CHEONGDAM, 443, 444], arrives="08:40", stops=2)
        second = {"leave": T0 + 2000, "arrive": T0 + 2500, "legs": [start_walk("청담", 150), on]}
        plans = graph.plan_via(ORIGIN, STATION_VIA, DEST, WHEN, {}, self.batches(first, lambda start: second), 3)["plans"]
        legs = plans[0]["legs"]
        self.assertEqual(len(legs), 1, "내렸다 같은 열차를 다시 타는 것처럼 보이지 않게")
        self.assertEqual((legs[0]["from"], legs[0]["to"], legs[0]["stops"], legs[0]["arrives"]), ("먹골", "강남구청", 4, "08:40"))
        self.assertEqual(legs[0]["stations"], [440, 441, CHEONGDAM, 443, 444])
        self.assertEqual(plans[0]["transfers"], 0)

    def test_turning_back_on_the_same_line_stays_two_legs(self):
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("ride", "7호선", "먹골", "청담"), end_walk("청담")]}
        back = leg("ride", "7호선", "청담", "먹골", stations=[CHEONGDAM, 441, 440], direction="장암행")
        second = {"leave": T0 + 2000, "arrive": T0 + 2500, "legs": [start_walk("청담", 150), back]}
        legs = graph.plan_via(ORIGIN, STATION_VIA, DEST, WHEN, {}, self.batches(first, lambda start: second), 3)["plans"][0]["legs"]
        self.assertEqual(len(legs), 2)

    def test_same_bus_through_the_via_stop_is_one_leg(self):
        stop_via = (37.53, 127.06)   # 역에서 먼 정류장(거리는 아래 _stops_near 대역이 정한다)
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("bus", "143", "먹골역", "청담역.경기고교", arrives="08:30", _stop=STOP),
                                                                {**end_walk("청담역.경기고교"), "point": stop_via}]}
        on = leg("bus", "143", "청담역.경기고교", "무역센터", departs="08:30", arrives="08:45", path=[[127.05, 37.52], [127.06, 37.51]], _stop=7)
        seen = []

        def batches(jobs, seconds):
            seen.extend(job[1] for job in jobs if job[-1] == DEST)
            return [first if toward == stop_via else {"leave": T0 + 1800, "arrive": T0 + 2700, "legs": [start_walk("청담역.경기고교", 0), on]}
                    for *_head, toward in jobs]
        # 이름이 같은 길 건너편(OTHER 를 같은 이름으로)은 경유지, 이름이 다르면 아니다
        with patch.object(graph, "_stops_near", lambda point, radius: [(5.0, STOP)] if radius < 100 else [(5.0, STOP), (90.0, OTHER)]):
            self.assertEqual(graph._via_nodes(stop_via), [("bs", STOP)])
            with patch.object(graph, "BSTOPS", [["청담역.경기고교", 37.5197, 127.0550], ["청담역.경기고교", 37.5199, 127.0560]]):
                self.assertEqual(graph._via_nodes(stop_via), [("bs", STOP), ("bs", OTHER)])
            plans = graph.plan_via(ORIGIN, stop_via, DEST, WHEN, {}, batches, 3)["plans"]
        self.assertEqual(seen[0][("bs", STOP)][0], 0, "버스에서 내린 정류장에서 바로")
        self.assertIn(("bs", OTHER), seen[0], "이어 걷는 정류장")
        self.assertIn(("at", CHEONGDAM), seen[0], "가까운 역")
        legs = plans[0]["legs"]
        self.assertEqual([(l["type"], l["from"], l["to"], l["stops"]) for l in legs], [("bus", "먹골역", "무역센터", 4)])
        self.assertEqual(legs[0]["path"], [[127.0, 37.5], [127.05, 37.52], [127.06, 37.51]])
        self.assertEqual(plans[0]["transfers"], 0)

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
