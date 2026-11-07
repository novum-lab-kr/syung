"""지하철 구간 방향(direction): 첫 역 쌍의 방향 이름이 dirs 에 없어도 같은 구간 뒤 쌍으로 채운다.

2026-11-08 운영 10케이스 시험 #7: 9호선 노량진 → 중앙보훈병원 구간 direction 이 null(급행 이음 노량진 → 동작은 dirs 에 없다) →
웹이 곧 올 열차를 못 골라 「열차 N분 뒤」 없이 기다렸다. 탐색 자료(지하철)는 git 에 있는 것을 그대로 쓴다.
"""

import unittest

from server.services import journey_graph as graph
from tests.test_journey_through import search, sid


class RideDirectionTest(unittest.TestCase):
    def test_first_pair_without_label_takes_the_next_pair(self):
        # 전제: 노량진 → 동작(급행 이음)은 방향 이름이 없다
        self.assertIsNone(graph._label("9호선", sid("9호선", "노량진"), sid("9호선", "동작")))
        r = search("9호선", "노량진", "신논현")
        self.assertIsNotNone(r)
        rides = [leg for leg in r["legs"] if leg["type"] == "ride"]
        self.assertTrue(rides)
        for leg in rides:
            names = "-".join(graph.STATIONS[s]["name"] for s in leg["stations"])
            self.assertEqual(leg["direction"], "상행", f"{leg['line']} {names}")

    def test_every_ride_leg_has_a_direction(self):
        # 10케이스에 나온 탈 역들 — 모두 방향이 있어야 웹이 곧 올 열차를 고른다
        for line, origin, dest in [("9호선", "노량진", "중앙보훈병원"), ("9호선", "고속터미널", "언주"), ("8호선", "가락시장", "석촌"),
                                   ("1호선", "오류동", "노량진"), ("2호선", "사당", "신림")]:
            with self.subTest(f"{line} {origin}→{dest}"):
                r = search(line, origin, dest)
                self.assertIsNotNone(r)
                for leg in r["legs"]:
                    if leg["type"] == "ride":
                        self.assertIsNotNone(leg["direction"], f"{leg['line']} {leg['from']}→{leg.get('to')}")


if __name__ == "__main__":
    unittest.main()
