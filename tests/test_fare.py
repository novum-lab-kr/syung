"""이번 달 예상 교통비(server/services/fare.py · 계획서 D5 · D6): 요금표 · 통합 요금 · 거리 · 계산 못 하는 승차권 · 이번 달 타는 날."""

import unittest

from server.services import fare

NOW = 1_800_000_000   # 2027-01-15(금) 17:00 KST — 1월은 31일, 월 · 화 · 수 · 목 · 금 · 토 · 일이 4 · 4 · 4 · 4 · 5 · 5 · 5번


def ride(line, start, end):
    return {"type": "ride", "line": line, "from": start, "to": end}


def bus(route, start, end):
    return {"type": "bus", "route": route, "from": start, "to": end}


# 거리를 정해 둔 가짜 자료(실제 자료가 바뀌어도 요금 규칙 시험은 그대로)
GRAPH = fare._Graph({"hops": [
    ["2호선", "가", "나", 120, 6.0, 0, 0], ["2호선", "나", "다", 120, 6.0, 0, 0], ["2호선", "다", "라", 120, None, 0, 0],
    ["2호선", "가", "다", 200, None, 0, 1],   # 급행 쌍은 거리 계산에 안 쓴다
    ["1호선", "평택", "성환", 300, 5.0, 1, 0]]})
BUSES = {"routes": {"472": {"type": "trunk", "stops": [["앞", 0.0], ["가운데", 3.0], ["뒤", 9.0], ["앞", 18.0]]},
                    "9401": {"type": "express", "stops": [["서울역", 0.0], ["분당", 25.0]]},
                    "심야": {"type": "night", "stops": [["앞", 0.0], ["뒤", 5.0]]},
                    "702A": {"type": "trunk", "stops": [["앞", 0.0], ["뒤", 4.0]]},
                    "새벽A160": {"type": "trunk", "stops": [["앞", 0.0], ["뒤", 4.0]]},
                    "8442출근": {"type": "branch", "stops": [["앞", 0.0], ["뒤", 4.0]]}}}


class FareTableTest(unittest.TestCase):
    def test_subway_fare_steps_follow_the_official_table(self):
        # 서울교통공사 운임안내 이용거리별 운임표(교통카드 · 어른)와 같은 값
        for km, won in ((0.5, 1550), (10, 1550), (10.1, 1650), (15, 1650), (15.1, 1750), (50, 2350), (50.1, 2450),
                        (58, 2450), (58.1, 2550), (66, 2550), (138, 3450)):
            self.assertEqual(fare.subway_fare(km), won, km)

    def test_subway_trip_sums_rides_on_known_pairs_only(self):
        self.assertEqual(fare.trip_fare({"legs": [ride("2호선", "가", "다")]}, GRAPH, BUSES), (1650, 12.0, None),
                         "급행 쌍(가-다)이 아니라 완행 쌍 거리로")
        self.assertEqual(fare.trip_fare({"legs": [{"type": "walk", "seconds": 60}, ride("2호선", "가", "나"),
                                                  ride("2호선", "나", "다")]}, GRAPH, BUSES)[0], 1650, "갈아타도 한 번 요금(거리 합)")
        self.assertEqual(fare.trip_fare({"legs": [ride("2호선", "가", "라")]}, GRAPH, BUSES), (None, None, "distance"))
        self.assertEqual(fare.trip_fare({"legs": [ride("1호선", "평택", "성환")]}, GRAPH, BUSES), (None, None, "outside"))
        self.assertEqual(fare.trip_fare({"legs": [ride("신림선", "샛강", "대방")]}, GRAPH, BUSES), (None, None, "distance"))
        self.assertEqual(fare.trip_fare(None, GRAPH, BUSES), (None, None, "route"))
        self.assertEqual(fare.trip_fare({"legs": [{"type": "walk", "seconds": 60}]}, GRAPH, BUSES), (None, None, "none"))

    def test_bus_and_subway_use_the_joint_fare_but_never_more_than_paying_apart(self):
        self.assertEqual(fare.trip_fare({"legs": [bus("472", "앞", "가운데")]}, GRAPH, BUSES), (1500, 3.0, None))
        # 버스 9 km + 전철 12 km = 21 km → 1,550 + 300 = 1,850 (따로 내면 1,500 + 1,650 = 3,150)
        self.assertEqual(fare.trip_fare({"legs": [bus("472", "앞", "뒤"), ride("2호선", "가", "다")]}, GRAPH, BUSES),
                         (1850, 21.0, None))
        # 짧게 두 번 타면 합이 더 싸다: 버스 3 km + 전철 6 km = 9 km → 통합 1,550(따로 3,050) — 통합이 더 싸서 1,550
        self.assertEqual(fare.trip_fare({"legs": [bus("472", "앞", "가운데"), ride("2호선", "가", "나")]}, GRAPH, BUSES)[0], 1550)
        # 같은 정류소 이름이 다시 나와도(돌아오는 길) 앞에서 가장 가까운 뒤 정류소로
        self.assertEqual(fare.trip_fare({"legs": [bus("472", "가운데", "앞")]}, GRAPH, BUSES), (1500, 15.0, None))

    def test_wide_area_bus_has_30km_before_extra(self):
        self.assertEqual(fare.trip_fare({"legs": [bus("9401", "서울역", "분당")]}, GRAPH, BUSES), (3000, 25.0, None))
        # 광역 25 km + 전철 12 km = 37 km → 3,000 + 7 km 넘음 → 2칸 200 = 3,200 (따로 3,000 + 1,650 = 4,650)
        self.assertEqual(fare.trip_fare({"legs": [bus("9401", "서울역", "분당"), ride("2호선", "가", "다")]}, GRAPH, BUSES)[0], 3200)

    def test_buses_without_a_confirmed_fare_or_stop_are_skipped(self):
        self.assertEqual(fare.trip_fare({"legs": [bus("심야", "앞", "뒤")]}, GRAPH, BUSES)[2], "bus")
        self.assertEqual(fare.trip_fare({"legs": [bus("경기1", "앞", "뒤")]}, GRAPH, BUSES)[2], "bus")
        self.assertEqual(fare.trip_fare({"legs": [bus("472", "없는곳", "뒤")]}, GRAPH, BUSES)[2], "bus")
        self.assertEqual(fare.trip_fare({"legs": [bus("702A", "앞", "뒤")]}, GRAPH, BUSES), (1500, 4.0, None), "번호 + 갈래는 보통 노선")
        for special in ("새벽A160", "8442출근"):   # 서울시 자료가 간선 · 지선이라 적어도 요금 근거가 없는 특수 노선
            self.assertEqual(fare.trip_fare({"legs": [bus(special, "앞", "뒤")]}, GRAPH, BUSES)[2], "bus", special)

    def test_month_rides_count_the_calendar(self):
        self.assertEqual(fare.month_rides([1, 2, 3, 4, 5], NOW), ("2027-01", 21))
        self.assertEqual(fare.month_rides([6, 7], NOW), ("2027-01", 10))
        self.assertEqual(fare.month_rides([], NOW), ("2027-01", 0))


class RealDataTest(unittest.TestCase):
    """커밋된 공식 거리 자료(data/fare/hop_km.json)로 실제 구간을 잰다 — 공식 역간거리 합과 같아야 한다."""

    def test_known_trips(self):
        graph = fare._hop_graph()
        self.assertIsNotNone(graph, "data/fare/hop_km.json 이 있어야 한다(pipeline/build_fare_km.py)")
        for line, start, end, km in (("2호선", "시청", "강남", 21.8), ("2호선", "을지로입구", "시청", 0.7),
                                     ("1호선", "서울", "수원", 41.6), ("9호선", "김포공항", "신논현", 23.4)):
            found, why = graph.ride_km(line, start, end)
            self.assertIsNone(why, (line, start, end))
            self.assertAlmostEqual(found, km, places=1, msg=(line, start, end))
        self.assertEqual(graph.ride_km("1호선", "평택", "천안"), (None, "outside"), "수도권 밖 구간은 계산하지 않는다")
        self.assertEqual(graph.ride_km("경춘선", "상봉", "춘천"), (None, "outside"))
        self.assertEqual(graph.ride_km("신림선", "샛강", "관악산"), (None, "distance"), "공식 자료가 없는 노선")

    def test_month_view(self):
        tickets = [{"id": 1, "name": "출근", "days": [1, 2, 3, 4, 5], "route": {"legs": [ride("2호선", "시청", "강남")]}},
                   {"id": 2, "name": "옛 승차권", "days": [6], "route": None},
                   {"id": 3, "name": "신림", "days": [1], "route": {"legs": [ride("신림선", "샛강", "관악산")]}}]
        view = fare.month_view(tickets, NOW)
        self.assertEqual(view["month"], "2027-01")
        self.assertEqual(view["tickets"], [{"id": 1, "name": "출근", "fare": 1850, "km": 21.8, "rides": 21, "monthly": 38850}])
        self.assertEqual((view["total"], view["skipped"], view["reasons"]), (38850, 2, {"route": 1, "distance": 1}))


if __name__ == "__main__":
    unittest.main()
