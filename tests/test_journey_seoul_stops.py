"""길찾기 버스 — 탐색 자료(KTDB) 패턴을 서울 버스 자료 노선에 맞추기(journey_graph.seoul_runs · 2026-11-07).
KTDB 는 472 를 시청역9번출구(02133)에 세우지만 서울 자료 · 도착 정보로는 472 가 02133 에 서지 않는다 — 그 자리에서 타라고 내지 않고,
버스 구간에 서울 노선 id · 정류장 id · 번호를 싣는다. 탐색 자료 대신 가짜 자료로 본다(좌표 · 번호는 그날 서울 자료 값을 옮겼다)."""

import unittest
from datetime import datetime
from unittest.mock import patch

from server.clock import KST
from server.services import journey_graph as graph
from tests.test_journey_via import StationViaSearchTest, _NoRouter

# KTDB 쪽(가짜 탐색 자료): 472 는 경찰청 → 시청역9번출구 → 남대문세무서(KTDB 좌표는 반올림) · 101 은 경찰청 → 시청역9번출구
KTDB_STOPS = [["경찰청", 37.5617, 126.9681], ["시청역9번출구.시청서소문2청사", 37.5632, 126.975],
              ["소공동주민센터", 37.5622, 126.976], ["남대문세무서", 37.565, 126.988]]
KTDB_ROUTES = [["472", "trunk"], ["101", "trunk"], ["M4130", "express"]]
# 서울 쪽(data/bus/stops.json · routes.json 꼴)
SEOUL_STOPS = {
    "113000094": {"id": "113000094", "arsId": "13252", "name": "경찰청", "lat": 37.561698, "lng": 126.968085},
    "101000036": {"id": "101000036", "arsId": "02133", "name": "시청역9번출구.시청서소문2청사", "lat": 37.56319, "lng": 126.974652},
    "101000033": {"id": "101000033", "arsId": "02128", "name": "소공동주민센터", "lat": 37.562197, "lng": 126.976444},
    "101000173": {"id": "101000173", "arsId": "02001", "name": "명동성당.남대문세무서", "lat": 37.564668, "lng": 126.988076},
}
SEOUL_ROUTES = [{"id": "100100075", "name": "472", "stopIds": ["113000094", "101000033", "101000173"]},
                {"id": "100100006", "name": "101", "stopIds": ["113000094", "101000036"]}]


def pattern(route, stops, start=8 * 3600):
    pat = {"r": route, "s": stops, "t": [i * 120 for i in range(len(stops))], "d": [[st, 1.0] for st in range(start, start + 3 * 3600, 600)]}
    pat["starts"] = [d[0] for d in pat["d"]]
    return pat


class SeoulRunsTest(unittest.TestCase):
    def runs(self, patterns, stops=KTDB_STOPS, seoul_routes=SEOUL_ROUTES, seoul_stops=SEOUL_STOPS):
        return graph.seoul_runs(patterns, KTDB_ROUTES, stops, seoul_routes, seoul_stops)

    def test_stop_the_route_no_longer_serves_is_left_out(self):
        runs = self.runs([pattern(0, [0, 1, 2, 3])])
        rid, spots = runs[0]
        self.assertEqual(rid, "100100075")
        self.assertEqual(spots, [("113000094", "13252"), None, ("101000033", "02128"), ("101000173", "02001")])

    def test_renamed_stop_matches_by_name_piece_or_distance(self):
        # KTDB 「남대문세무서」 ↔ 서울 「명동성당.남대문세무서」(41 m) — 이름 조각이 같다
        self.assertEqual(graph._stop_words("명동성당.남대문세무서"), {"명동성당", "남대문세무서"})
        self.assertEqual(graph._stop_words("남대문세무서(중)"), {"남대문세무서"})
        # 이름이 전혀 달라도 SEOUL_NEAR_M 안이면 같은 정류장
        stops = [*KTDB_STOPS[:3], ["다른이름", 37.565, 126.988]]
        self.assertEqual(self.runs([pattern(0, [0, 2, 3])], stops=stops)[0][1][2], ("101000173", "02001"))

    def test_same_name_far_away_is_not_a_match(self):
        far = [["소공동주민센터", 37.5622 + 0.002, 126.976]]   # 같은 이름 · 약 220 m
        self.assertEqual(graph.seoul_runs([pattern(0, [0, 0, 0])], KTDB_ROUTES, far, SEOUL_ROUTES, SEOUL_STOPS), {})

    def test_stop_moved_away_by_stop_fix_still_matches_by_its_raw_coordinates(self):
        # bus-stop-fix 가 소공동주민센터를 약 220 m 옮겼다(옮긴 좌표로는 멀다) — 옮기기 전 KTDB 좌표로는 서울 정류장 옆이라 막지 않는다
        moved = [*KTDB_STOPS[:2], ["소공동주민센터", 37.5622 + 0.002, 126.976], KTDB_STOPS[3]]
        pats = [pattern(0, [0, 2, 3])]
        self.assertEqual(self.runs(pats, stops=moved)[0][1][1], None, "옮긴 좌표만 보면 막힌다(고치기 전)")
        runs = graph.seoul_runs(pats, KTDB_ROUTES, moved, SEOUL_ROUTES, SEOUL_STOPS, {2: (37.5622, 126.976)})
        self.assertEqual(runs[0][1], [("113000094", "13252"), ("101000033", "02128"), ("101000173", "02001")])
        self.assertIn(2, graph.bus_boardings(pats, KTDB_ROUTES, runs))

    def test_route_that_mostly_differs_is_not_matched(self):
        # 같은 이름이어도 자리 대부분이 안 맞으면(경기 · 인천의 같은 번호, 통째로 바뀐 노선) 손대지 않는다
        self.assertEqual(self.runs([pattern(0, [1, 1, 1, 0])]), {})

    def test_route_missing_in_seoul_data_is_not_matched(self):
        self.assertEqual(self.runs([pattern(2, [0, 2, 3])]), {})   # M4130 은 서울 자료에 없다

    def test_order_picks_the_stop_in_riding_direction(self):
        # 같은 이름 정류장이 길 양쪽(방향 둘)에 있으면 서울 노선 차례를 따라 고른다 — 가까운 반대편이 아니라
        seoul_stops = {
            "a1": {"id": "a1", "arsId": "1", "name": "갑", "lat": 37.0, "lng": 127.0},
            "b1": {"id": "b1", "arsId": "2", "name": "을", "lat": 37.003, "lng": 127.0},
            "b2": {"id": "b2", "arsId": "3", "name": "을", "lat": 37.003, "lng": 127.0003},
            "c1": {"id": "c1", "arsId": "4", "name": "병", "lat": 37.006, "lng": 127.0},
            "a2": {"id": "a2", "arsId": "5", "name": "갑", "lat": 37.0, "lng": 127.0003},
        }
        routes = [{"id": "r", "name": "472", "stopIds": ["a1", "b1", "c1", "b2", "a2"]}]   # 가는 길 갑 → 을 → 병, 오는 길 을 → 갑
        stops = [["갑", 37.0, 127.0], ["을", 37.003, 127.00025], ["병", 37.006, 127.0]]   # 「을」 은 반대편(b2)에 더 가깝다
        spots = graph.seoul_runs([pattern(0, [0, 1, 2])], KTDB_ROUTES, stops, routes, seoul_stops)[0][1]
        self.assertEqual([spot and spot[1] for spot in spots], ["1", "2", "4"])

    def test_boardings_skip_unserved_stops(self):
        pats = [pattern(0, [0, 1, 2, 3]), pattern(1, [0, 1])]
        runs = graph.seoul_runs(pats, KTDB_ROUTES, KTDB_STOPS, SEOUL_ROUTES, SEOUL_STOPS)
        at = graph.bus_boardings(pats, KTDB_ROUTES, runs)
        self.assertEqual(at.get(1, []), [], "472 는 시청역9번출구에서 타지 않는다(101 은 거기가 종점이라 타는 자리가 아니다)")
        self.assertEqual(sorted(at[0]), [(0, 0), (1, 0)])
        self.assertEqual(at[2], [(0, 2)])
        self.assertEqual(graph.bus_boardings(pats, KTDB_ROUTES)[1], [(0, 1)], "맞추기 자료가 없으면 예전 그대로")


class SeoulStopSearchTest(unittest.TestCase):
    """실제 탐색 — 472 를 시청역9번출구가 아니라 소공동주민센터에서 타고, 구간에 서울 번호를 싣는다."""
    WHEN = datetime(2026, 11, 8, 8, 0, tzinfo=KST)
    ORIGIN, DEST = (37.5634, 126.9748), (37.5649, 126.9881)   # 시청역9번출구 바로 옆 → 명동성당.남대문세무서 옆

    def setUp(self):
        stops = [list(stop) for stop in KTDB_STOPS]
        pats = [pattern(0, [0, 1, 2, 3])]
        runs = graph.seoul_runs(pats, KTDB_ROUTES, stops, SEOUL_ROUTES, SEOUL_STOPS)

        def near_nodes(point):
            return [("bs", i) for i, stop in enumerate(stops) if graph._meters(point, (stop[1], stop[2])) <= graph.BUS_RADIUS_M]
        self.patches = [patch.object(graph, "OSRM", _NoRouter()), patch.object(graph, "BUS", True), patch.object(graph, "BSTOPS", stops),
                        patch.object(graph, "BPATS", pats), patch.object(graph, "BROUTES", KTDB_ROUTES), patch.object(graph, "SEOUL", runs),
                        patch.object(graph, "BUS_AT", graph.bus_boardings(pats, KTDB_ROUTES, runs)), patch.object(graph, "BUS_WALK", [[], [], [], []]),
                        patch.object(graph, "BUS_SHAPES", {}), patch.object(graph, "_near_nodes", near_nodes),
                        patch.object(graph, "_stops_near", lambda point, radius: sorted(
                            (graph._meters(point, (s[1], s[2])), i) for i, s in enumerate(stops) if graph._meters(point, (s[1], s[2])) <= radius)),
                        patch.object(graph, "STATION_BUS", {}), patch.object(graph, "BUS_STATION", {})]
        for active in self.patches:
            active.start()
            self.addCleanup(active.stop)

    def bus_legs(self):
        plans = graph.plan(self.ORIGIN, self.DEST, self.WHEN, {}, StationViaSearchTest.run_batch, 3)["plans"]
        return [leg for p in plans for leg in p["legs"] if leg["type"] == "bus"]

    def test_boards_at_a_stop_the_route_serves_and_carries_seoul_ids(self):
        legs = self.bus_legs()
        self.assertTrue(legs)
        for leg in legs:
            self.assertNotEqual(leg["from"], "시청역9번출구.시청서소문2청사")
            self.assertNotEqual(leg["to"], "시청역9번출구.시청서소문2청사")
        leg = legs[0]
        self.assertEqual((leg["from"], leg["to"]), ("소공동주민센터", "남대문세무서"))
        self.assertEqual({key: leg[key] for key in ("routeId", "fromId", "fromArs", "toId", "toArs")},
                         {"routeId": "100100075", "fromId": "101000033", "fromArs": "02128", "toId": "101000173", "toArs": "02001"})

    def test_without_seoul_match_only_the_boarding_stop_number_is_filled(self):
        # 서울 자료에 없는 노선(경기 · 광역)처럼 맞추지 못한 패턴: KTDB 자리에서 타고, 타는 정류장 번호만 이름 · 거리로 싣는다
        pats = graph.BPATS
        with patch.object(graph, "SEOUL", {}), patch.object(graph, "BUS_AT", graph.bus_boardings(pats, KTDB_ROUTES)), \
                patch.object(graph, "_catalog_by_name", catalog_by_name(SEOUL_STOPS)), patch.object(graph, "BSTOPS_RAW", {}):
            legs = self.bus_legs()
        self.assertEqual(legs[0]["from"], "시청역9번출구.시청서소문2청사", "맞추기 없으면 KTDB 자리에서 탄다")
        self.assertEqual((legs[0].get("fromId"), legs[0].get("fromArs")), ("101000036", "02133"))
        for key in ("routeId", "toId", "toArs"):
            self.assertNotIn(key, legs[0])


def catalog_by_name(seoul_stops):
    """journey_graph._catalog_by_name 꼴(이름 → [(lat, lng, id, 번호)])."""
    out = {}
    for row in seoul_stops.values():
        out.setdefault(row["name"], []).append((row["lat"], row["lng"], row["id"], row["arsId"]))
    return out


class BoardIdsTest(unittest.TestCase):
    """서울 자료에 없는 노선(M4403 · 6001 — 2026-11-08 운영 #4)의 탈 정류장 번호: 같은 이름 · 가까움 · 길 양쪽이 비슷하면 비움."""
    def ids(self, stop, catalog, raw=None):
        with patch.object(graph, "BSTOPS", [stop]), patch.object(graph, "BSTOPS_RAW", raw or {}), \
                patch.object(graph, "_catalog_by_name", catalog_by_name(catalog)):
            return graph._board_ids(0)

    def row(self, sid, ars, name, lat, lng):
        return {sid: {"id": sid, "arsId": ars, "name": name, "lat": lat, "lng": lng}}

    def test_single_same_name_stop_nearby(self):
        # KCC사옥(22162) — KTDB 좌표에서 약 6 m
        self.assertEqual(self.ids(["KCC사옥", 37.5, 127.0], self.row("121000086", "22162", "KCC사옥", 37.50005, 127.0)), ("121000086", "22162"))

    def test_far_or_other_name_is_left_empty(self):
        self.assertEqual(self.ids(["KCC사옥", 37.5, 127.0], self.row("x", "1", "KCC사옥", 37.502, 127.0)), ("", ""), "약 220 m")
        self.assertEqual(self.ids(["KCC사옥", 37.5, 127.0], self.row("x", "1", "다른 정류장", 37.5, 127.0)), ("", ""))

    def test_both_sides_of_the_road(self):
        both = {**self.row("a", "1", "갑", 37.50005, 127.0), **self.row("b", "2", "갑", 37.5001, 127.0)}   # 약 6 m · 11 m — 어느 쪽인지 모른다
        self.assertEqual(self.ids(["갑", 37.5, 127.0], both), ("", ""))
        clear = {**self.row("a", "1", "갑", 37.50005, 127.0), **self.row("b", "2", "갑", 37.5005, 127.0)}   # 약 6 m · 56 m
        self.assertEqual(self.ids(["갑", 37.5, 127.0], clear), ("a", "1"))

    def test_raw_coordinates_count_too(self):
        # bus-stop-fix 가 옮긴 좌표로는 멀어도 옮기기 전 좌표로 가까우면 찾는다
        self.assertEqual(self.ids(["갑", 37.502, 127.0], self.row("a", "1", "갑", 37.5, 127.0), {0: (37.5, 127.0)}), ("a", "1"))


if __name__ == "__main__":
    unittest.main()
