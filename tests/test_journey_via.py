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
    """경유지가 역 · 정류장이면 좌표까지 걷지 않고 그 역 · 정류장에서 갈아탄다(2026-10-29 사용자 결정). 가짜 탐색은 요청한 탈것만 돌려준다."""

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

    def batches(self, via, first, second):
        """앞 구간(via 로)은 first, 뒤 구간은 second(start, modes) — 요청에 없는 탈것을 쓰는 답은 None 으로 바꾼다."""
        def run(jobs, seconds):
            self.jobs += jobs
            out = []
            for _w, start, _goal, _live, _pen, _banned, modes, _ceiling, toward in jobs:
                r = first if toward == via else second(start, modes)
                rides = {l["type"] for l in r["legs"] if l["type"] != "walk"} if r else set()
                out.append(r if r and all(("subway" if t == "ride" else "bus") in modes for t in rides) else None)
            return out
        return run

    def seconds_jobs(self):
        return [j for j in self.jobs if j[-1] == DEST]

    def test_station_and_its_stops_are_the_via(self):
        self.assertEqual(graph._via_nodes(STATION_VIA), [("at", CHEONGDAM), ("bs", STOP)])
        self.assertEqual(graph._via_nodes((37.53, 127.06)), [], "역 · 정류장이 아닌 곳(건물)은 지금처럼 좌표")

    def test_subway_then_bus_from_the_stop_near_the_station(self):
        # 재현: 7호선 먹골 → 청담 하차 → 청담역 근처 정류장 143. 앞 구간이 지하철만이어도 뒤 구간을 둘 다로도 찾는다(Codex 리뷰 1)
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("ride", "7호선", "먹골", "청담"), end_walk("청담")]}
        bus = {"leave": T0 + 2000, "arrive": T0 + 2900, "legs": [start_walk("청담역.경기고교", 172), leg("bus", "143", "청담역.경기고교", "무역센터", _stop=5)]}
        subway = {"leave": T0 + 2000, "arrive": T0 + 3300, "legs": [start_walk("청담", 150), leg("ride", "9호선", "청담", "봉은사", stations=[CHEONGDAM, 9])]}

        def second(start, modes):
            return bus if "bus" in modes else subway
        result = graph.plan_via(ORIGIN, STATION_VIA, DEST, WHEN, {}, self.batches(STATION_VIA, first, second), 3)
        goal = self.jobs[0][2]
        self.assertEqual(sorted(goal), [("at", CHEONGDAM), ("bs", STOP)])
        self.assertTrue(all(w[0] == 0 for w in goal.values()), "역 · 근처 정류장에 닿으면 끝(걷기 0)")
        jobs = self.seconds_jobs()
        self.assertEqual(sorted(sorted(j[6]) for j in jobs), [["bus", "subway"], ["subway"]])
        self.assertEqual({j[0].timestamp() for j in jobs}, {T0 + 1800}, "뒤 구간은 내린 시각부터(갈아타기 시간은 시작 걷기에)")
        start = jobs[0][1]
        self.assertEqual(start[("at", CHEONGDAM)][0], 150, "같은 역 갈아타기 시간")
        self.assertEqual(start[("bs", STOP)][0], graph._walk_sec(80.0) + graph.STATION_ACCESS, "역 ↔ 근처 정류장은 탐색의 환승 걷기 그대로")
        self.assertIn(("stay", "7호선", 441, CHEONGDAM, None), start, "내리지 않고 같은 열차로 계속")
        plans = result["plans"]
        self.assertEqual([p["kind"] for p in plans], ["mixed", "subway"], "섞어 타기 길과 지하철만 길(조건 바꾸기) 둘 다")
        legs = plans[0]["legs"]
        self.assertEqual([l["type"] for l in legs], ["ride", "walk", "bus"])
        self.assertEqual(legs[1]["label"], "청담역에서 청담역.경기고교 정류장으로")
        self.assertEqual(legs[1]["seconds"], graph._walk_sec(80.0) + graph.STATION_ACCESS)
        self.assertTrue(all(k not in l for l in legs for k in ("_stop", "_run", "_stay", "_dep", "_ban", "point", "a", "b")))
        self.assertEqual(plans[0]["transfers"], 1)

    def test_same_train_through_the_via_station_is_one_leg(self):
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("ride", "7호선", "먹골", "청담"), end_walk("청담")]}
        on = leg("ride", "7호선", "청담", "강남구청", stations=[CHEONGDAM, 443, 444], arrives="08:40", stops=2, _stay=True)
        second = {"leave": T0 + 1800, "arrive": T0 + 2400, "legs": [on, {**end_walk("강남구청"), "point": DEST}]}
        plans = graph.plan_via(ORIGIN, STATION_VIA, DEST, WHEN, {}, self.batches(STATION_VIA, first, lambda start, modes: second), 3)["plans"]
        legs = plans[0]["legs"]
        self.assertEqual([l["type"] for l in legs], ["ride", "walk"], "내렸다 같은 열차를 다시 타는 것처럼 보이지 않게")
        self.assertEqual((legs[0]["from"], legs[0]["to"], legs[0]["stops"], legs[0]["arrives"]), ("먹골", "강남구청", 4, "08:40"))
        self.assertEqual(legs[0]["stations"], [440, 441, CHEONGDAM, 443, 444])
        self.assertEqual(plans[0]["transfers"], 0)

    def test_another_train_of_the_same_line_stays_two_legs(self):
        # 같은 노선 · 방향이어도 내려서 다음 열차를 탔으면(청담 종착 열차 → 다음 열차) 실제 환승이라 나눠 둔다(Codex 리뷰 2)
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("ride", "7호선", "먹골", "청담", destination="청담"), end_walk("청담")]}
        nxt = leg("ride", "7호선", "청담", "강남구청", stations=[CHEONGDAM, 443, 444], departs="08:40")
        second = {"leave": T0 + 2000, "arrive": T0 + 3000, "legs": [start_walk("청담", 150), nxt]}
        legs = graph.plan_via(ORIGIN, STATION_VIA, DEST, WHEN, {}, self.batches(STATION_VIA, first, lambda start, modes: second), 3)["plans"][0]["legs"]
        self.assertEqual([(l["from"], l["to"]) for l in legs], [("먹골", "청담"), ("청담", "강남구청")])
        # 청담 종착 열차면 같은 열차로 계속할 자리(stay)의 종점이 청담 — 탐색이 계속 타지 않는다
        stay = [k for k in self.seconds_jobs()[0][1] if k[0] == "stay"]
        self.assertEqual([k[4] for k in stay], [CHEONGDAM])

    def test_walking_on_starts_at_the_exit_where_you_got_off(self):
        # 뒤 구간을 걷기로 대신하면 경유지 좌표(역 중심)가 아니라 내린 역 출구에서 목적지까지(탐색의 '내려서 목적지까지 걷기')(Codex 리뷰 3)
        near_dest = (37.5210, 127.0560)   # 경유지에서 약 250 m — 걸어가기가 이긴다
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("ride", "7호선", "먹골", "청담"), end_walk("청담")]}
        goal = {("at", CHEONGDAM): (200, 230, "9", 37.5200, 127.0550)}
        walked = []

        def walk_path(a, b):
            walked.append((a, b))
            return [[a[1], a[0]], [b[1], b[0]]], 240, 280
        with patch.object(graph, "_walk_table", lambda point, nodes, reverse=False: goal if point == near_dest else {}), \
                patch.object(graph, "walk_path", walk_path):
            plans = graph.plan_via(ORIGIN, STATION_VIA, near_dest, WHEN, {}, self.batches(STATION_VIA, first, lambda start, modes: None), 3)["plans"]
        legs = plans[0]["legs"]
        self.assertEqual([l["type"] for l in legs], ["ride", "walk"])
        self.assertEqual((legs[1]["seconds"], legs[1]["exit"], legs[1]["label"]), (200, "9", "청담역 9번 출구에서 목적지까지"))
        self.assertIn(((37.5200, 127.0550), near_dest), walked)
        self.assertEqual(plans[0]["arrives"], graph._fmt(T0 + 1800 + 200))

    def test_walking_on_from_a_station_not_in_the_goal_table_is_measured_from_its_exit(self):
        # 목적지 걷기 표에 없는 역이면 경유지 좌표에서 잰 걷기를 빌려 쓰지 않고 목적지에 가장 가까운 출구에서 다시 잰다(Codex 재리뷰 2)
        near_dest = (37.5240, 127.0600)
        walked = []

        def walk_path(a, b):
            walked.append(a)
            return [[a[1], a[0]], [b[1], b[0]]], round(graph._meters(a, b)), round(graph._meters(a, b))
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("ride", "7호선", "먹골", "청담"), end_walk("청담")]}
        with patch.object(graph, "walk_path", walk_path):
            plans = graph.plan_via(ORIGIN, STATION_VIA, near_dest, WHEN, {}, self.batches(STATION_VIA, first, lambda start, modes: None), 3)["plans"]
        exit_ = min((p[:2] for p in graph._points(CHEONGDAM)), key=lambda q: graph._meters(q, near_dest))
        self.assertIn(exit_, walked)
        legs = plans[0]["legs"]
        self.assertEqual(legs[1]["seconds"], round(graph._meters(exit_, near_dest)) + graph.STATION_ACCESS)
        self.assertEqual(plans[0]["arrives"], graph._fmt(T0 + 1800 + legs[1]["seconds"]))
        self.assertEqual(plans[0]["walkMinutes"], round(legs[1]["seconds"] / 60))

    def test_same_bus_through_the_via_stop_is_one_leg(self):
        stop_via = (37.53, 127.06)   # 역에서 먼 정류장(거리는 아래 _stops_near 대역이 정한다)
        first = {"leave": T0 + 60, "arrive": T0 + 1800, "legs": [leg("bus", "143", "먹골역", "청담역.경기고교", arrives="08:30", _stop=STOP, _run=(3, T0, 1.2, 4)),
                                                                {**end_walk("청담역.경기고교"), "point": stop_via}]}
        same = leg("bus", "143", "청담역.경기고교", "무역센터", departs="08:30", arrives="08:45", path=[[127.05, 37.52], [127.06, 37.51]], _stop=7, _stay=True)
        later = {k: v for k, v in same.items() if k != "_stay"}   # 같은 번호 다음 차(정류장에서 시간표로 다시 탄 것) — 갈아탄 것
        seen = []
        answer = [same]

        def second(start, modes):
            seen.append(start)
            return {"leave": T0 + 1800, "arrive": T0 + 2700, "legs": [start_walk("청담역.경기고교", 0), answer[0]]}
        # 이름이 같은 길 건너편(OTHER 를 같은 이름으로)은 경유지, 이름이 다르면 아니다
        with patch.object(graph, "_stops_near", lambda point, radius: [(5.0, STOP)] if radius < 100 else [(5.0, STOP), (90.0, OTHER)]):
            self.assertEqual(graph._via_nodes(stop_via), [("bs", STOP)])
            with patch.object(graph, "BSTOPS", [["청담역.경기고교", 37.5197, 127.0550], ["청담역.경기고교", 37.5199, 127.0560]]):
                self.assertEqual(graph._via_nodes(stop_via), [("bs", STOP), ("bs", OTHER)])
            plans = graph.plan_via(ORIGIN, stop_via, DEST, WHEN, {}, self.batches(stop_via, first, second), 3)["plans"]
            answer[0] = later
            other = graph.plan_via(ORIGIN, stop_via, DEST, WHEN, {}, self.batches(stop_via, first, second), 3)["plans"]
        self.assertEqual(seen[0][("bs", STOP)][0], 0, "버스에서 내린 정류장에서 바로")
        self.assertIn(("bs", OTHER), seen[0], "이어 걷는 정류장")
        self.assertIn(("at", CHEONGDAM), seen[0], "가까운 역")
        self.assertIn(("bstay", 3, T0, 1.2, 4), seen[0], "내리지 않고 같은 버스로 계속(운행 · 내린 자리 그대로)")
        legs = plans[0]["legs"]
        self.assertEqual([(l["type"], l["from"], l["to"], l["stops"]) for l in legs], [("bus", "먹골역", "무역센터", 4)])
        self.assertEqual(legs[0]["path"], [[127.0, 37.5], [127.05, 37.52], [127.06, 37.51]])
        self.assertEqual(plans[0]["transfers"], 0)
        self.assertEqual(len(other[0]["legs"]), 2, "같은 번호라도 다른 차면 두 구간")


class _NoRouter:
    """OSRM 이 없는 것처럼(걷기는 직선 × 1.3 — 시험이 기계마다 같게)."""
    def table(self, coords, query):
        raise OSError("no router")

    def route(self, a, b):
        raise OSError("no router")


class StationViaSearchTest(unittest.TestCase):
    """실제 탐색(지하철 자료 data/ + 가짜 버스 노선 하나)으로 본 회귀 — 먹골 → 삼성 평일 08:00, 경유지 청담역(재현 건)."""
    ORIGIN, DEST = (37.6107, 127.0774), (37.5088, 127.0631)
    WHEN = datetime(2026, 10, 30, 8, 0, tzinfo=KST)

    def setUp(self):
        stops = [["청담역.경기고교", 37.5197, 127.0550], ["무역센터", 37.5095, 127.0615]]
        pats = [{"r": 0, "s": [0, 1], "t": [0, 240], "d": [[st, 1.0] for st in range(5 * 3600, 24 * 3600, 120)]}]
        for pat in pats:
            pat["starts"] = [d[0] for d in pat["d"]]
        routes = [["143", "trunk"]]
        exit_pt = graph._points(CHEONGDAM)[0][:2]

        def near_nodes(point):
            return [("at", sid) for sid in graph._near_stations(point)] + \
                   [("bs", i) for i, stop in enumerate(stops) if graph._meters(point, (stop[1], stop[2])) <= graph.BUS_RADIUS_M]
        patches = [patch.object(graph, "OSRM", _NoRouter()), patch.object(graph, "BUS", True), patch.object(graph, "BSTOPS", stops),
                   patch.object(graph, "BPATS", pats), patch.object(graph, "BROUTES", routes),
                   patch.object(graph, "BUS_AT", graph.bus_boardings(pats, routes)), patch.object(graph, "BUS_WALK", [[], []]),
                   patch.object(graph, "BUS_SHAPES", {}), patch.object(graph, "_near_nodes", near_nodes),
                   patch.object(graph, "_stops_near", lambda point, radius: sorted(
                       (graph._meters(point, (s[1], s[2])), i) for i, s in enumerate(stops) if graph._meters(point, (s[1], s[2])) <= radius)),
                   patch.object(graph, "STATION_BUS", {CHEONGDAM: [(0, 80.0, exit_pt)]}),
                   patch.object(graph, "BUS_STATION", {0: [(CHEONGDAM, 80.0, exit_pt)]}),
                   patch.object(graph, "EXIT_REF", {(CHEONGDAM, 0): "11"})]
        for active in patches:
            active.start()
            self.addCleanup(active.stop)

    @staticmethod
    def run_batch(jobs, seconds):
        return [graph._search(*job) for job in jobs]

    @staticmethod
    def rides(p):
        return [(l.get("line") or l.get("route"), l["from"], l["to"]) for l in p["legs"] if l["type"] != "walk"]

    def test_via_cheongdam_keeps_the_fastest_way_through_it(self):
        plain = graph.plan(self.ORIGIN, self.DEST, self.WHEN, {}, self.run_batch, 3)["plans"]
        fastest = next(p for p in plain if p["tag"] == "가장 빠른 길")
        self.assertEqual(self.rides(fastest), [("7호선", "먹골", "청담"), ("143", "청담역.경기고교", "무역센터")], "경유 없이도 청담을 지나는 길")
        via = graph.plan_via(self.ORIGIN, STATION_VIA, self.DEST, self.WHEN, {}, self.run_batch, 3)["plans"]
        same = [p for p in via if self.rides(p) == self.rides(fastest)]
        self.assertTrue(same, [self.rides(p) for p in via])
        self.assertEqual((same[0]["arrives"], same[0]["walkMinutes"]), (fastest["arrives"], fastest["walkMinutes"]), "경유지를 넣어도 같은 시각 · 걷기")
        self.assertEqual(same[0]["tag"], "가장 빠른 길")

    def test_transfer_walk_names_the_exit(self):
        """지하철 → 버스 갈아타기 걷기 구간에 가까운 출구 번호(청담역 11번 출구)가 실린다 — 탐색 · 경유지 모두."""
        plain = graph.plan(self.ORIGIN, self.DEST, self.WHEN, {}, self.run_batch, 3)["plans"]
        fastest = next(p for p in plain if p["tag"] == "가장 빠른 길")
        transfer = [l for l in fastest["legs"] if l["type"] == "walk" and "정류장으로" in l["label"]]
        self.assertEqual([l["exit"] for l in transfer], ["11"])
        via = graph.plan_via(self.ORIGIN, STATION_VIA, self.DEST, self.WHEN, {}, self.run_batch, 3)["plans"]
        shown = [l["exit"] for p in via if self.rides(p) == self.rides(fastest) for l in p["legs"] if l["type"] == "walk" and "정류장으로" in l["label"]]
        self.assertTrue(shown and set(shown) == {"11"}, shown)

    def test_staying_on_line_7_through_cheongdam_is_one_ride(self):
        dest = (graph.STATIONS[CHEONGDAM + 2]["lat"], graph.STATIONS[CHEONGDAM + 2]["lon"])
        self.assertIn("7호선", graph.STATIONS[CHEONGDAM + 2]["lines"])
        with patch.object(graph, "BUS", False):
            plain = graph.plan(self.ORIGIN, dest, self.WHEN, {}, self.run_batch, 3)["plans"]
            via = graph.plan_via(self.ORIGIN, STATION_VIA, dest, self.WHEN, {}, self.run_batch, 3)["plans"]
        line7 = [p for p in plain if self.rides(p) == [("7호선", "먹골", graph.STATIONS[CHEONGDAM + 2]["name"])]]
        self.assertTrue(line7, [self.rides(p) for p in plain])
        same = [p for p in via if self.rides(p) == self.rides(line7[0])]
        self.assertTrue(same, [self.rides(p) for p in via])
        self.assertEqual(same[0]["arrives"], line7[0]["arrives"], "같은 열차로 계속 — 환승 · 기다림을 다시 더하지 않는다")


class BusStopViaSearchTest(unittest.TestCase):
    """실제 탐색 — 정류장 경유지를 같은 버스로 지나가기. 정류장 사이 121초 × 배율 1.2 처럼 도착 시각이 소수여도 그 버스를 놓치지 않는다(Codex 재리뷰 1)."""
    STOPS = [["신촌가", 37.5600, 126.9400], ["홍제가", 37.5900, 126.9400], ["독바위가", 37.6200, 126.9400]]   # 역에서 190 m · 390 m · 640 m
    WHEN = datetime(2026, 10, 30, 8, 0, tzinfo=KST)

    def setUp(self):
        stops = self.STOPS
        pats = [{"r": 0, "s": [0, 1, 2], "t": [0, 121, 242], "d": [[st, 1.2] for st in range(5 * 3600, 24 * 3600, 600)]}]
        for pat in pats:
            pat["starts"] = [d[0] for d in pat["d"]]
        routes = [["7212", "trunk"]]

        def near_nodes(point):
            return [("bs", i) for i, stop in enumerate(stops) if graph._meters(point, (stop[1], stop[2])) <= graph.BUS_RADIUS_M]
        patches = [patch.object(graph, "OSRM", _NoRouter()), patch.object(graph, "BUS", True), patch.object(graph, "BSTOPS", stops),
                   patch.object(graph, "BPATS", pats), patch.object(graph, "BROUTES", routes),
                   patch.object(graph, "BUS_AT", graph.bus_boardings(pats, routes)), patch.object(graph, "BUS_WALK", [[], [], []]),
                   patch.object(graph, "BUS_SHAPES", {}), patch.object(graph, "_near_nodes", near_nodes),
                   patch.object(graph, "_stops_near", lambda point, radius: sorted(
                       (graph._meters(point, (s[1], s[2])), i) for i, s in enumerate(stops) if graph._meters(point, (s[1], s[2])) <= radius)),
                   patch.object(graph, "STATION_BUS", {}), patch.object(graph, "BUS_STATION", {})]
        for active in patches:
            active.start()
            self.addCleanup(active.stop)

    def test_staying_on_the_same_bus_through_the_stop(self):
        origin, via, dest = (37.5601, 126.9401), (37.5900, 126.9400), (37.6199, 126.9401)
        self.assertEqual(graph._via_nodes(via), [("bs", 1)])
        run = StationViaSearchTest.run_batch
        plain = graph.plan(origin, dest, self.WHEN, {}, run, 3)["plans"]
        plans = graph.plan_via(origin, via, dest, self.WHEN, {}, run, 3)["plans"]
        self.assertEqual([StationViaSearchTest.rides(p) for p in plans], [[("7212", "신촌가", "독바위가")]], "한 버스 한 구간")
        self.assertEqual(plans[0]["arrives"], plain[0]["arrives"], "다음 차로 바뀌지 않는다")
        self.assertEqual(plans[0]["legs"][1]["stops"], 2)


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
