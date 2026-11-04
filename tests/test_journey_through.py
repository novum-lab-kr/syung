"""같은 열차로 계속 타기: 실제 운행 계통(capital-metro.json lines)대로만 — 지나쳤다 되돌아오거나 지선에서 꺾지 않는다.

2026-11-04 사용자 제보 '도착지는 같은데 뺑뺑이': 방향 이름(dirs)이 없는 급행 이음(1호선 서울↔금천구청 · 9호선 노량진↔동작 …)을
지나면 방향 검사가 꺼져, 운영 '가장 빠른 길' 독산 → 서울이 '1호선 독산-금천구청-서울'(남쪽 금천구청까지 갔다가 같은 열차로 서울행)로 나왔다.
탐색 자료(지하철)는 git 에 있는 것을 그대로 쓴다.
"""

import math
import unittest
from datetime import datetime

from server.clock import KST
from server.services import journey_graph as graph

WHEN = datetime(2026, 11, 5, 14, 0, tzinfo=KST)


def sid(line: str, name: str) -> int:
    return graph.BY_NAME[(line, graph._key(name))]


def search(line: str, origin: str, dest: str):
    a, b = graph.STATIONS[sid(line, origin)], graph.STATIONS[sid(line, dest)]
    start = {("at", a["id"]): (0, 0, "", a["lat"], a["lon"])}
    goal = {("at", b["id"]): (0, 0, "", b["lat"], b["lon"])}
    return graph._search(WHEN, start, goal, {}, graph.TIE_PENALTY, modes=frozenset({"subway"}), toward=(b["lat"], b["lon"]))


def turns_back(stations: list[int]) -> list[str]:
    """탄 구간 안에서 거의 반대로 꺾는 역(앞 · 뒤 이음 사이 각이 약 107도 넘음)."""
    out = []
    for i in range(1, len(stations) - 1):
        p, q, r = (graph.STATIONS[s] for s in stations[i - 1:i + 2])
        ux, uy = (q["lon"] - p["lon"]) * math.cos(math.radians(q["lat"])), q["lat"] - p["lat"]
        vx, vy = (r["lon"] - q["lon"]) * math.cos(math.radians(q["lat"])), r["lat"] - q["lat"]
        if (ux * vx + uy * vy) / (math.hypot(ux, uy) * math.hypot(vx, vy)) < -0.3:
            out.append(q["name"])
    return out


class ThroughRideTest(unittest.TestCase):
    def test_no_ride_runs_past_and_back(self):
        # (노선, 출발, 도착) — 고치기 전 운영 · 로컬 탐색이 탄 구간 안에서 되돌아갔던 쌍
        cases = [("1호선", "독산", "서울"), ("1호선", "독산", "남영"), ("1호선", "노량진", "독산"),
                 ("1호선", "광명", "안양"), ("1호선", "광명", "석수"), ("1호선", "의왕", "광명")]
        for line, origin, dest in cases:
            with self.subTest(f"{origin}→{dest}"):
                r = search(line, origin, dest)
                self.assertIsNotNone(r)
                for leg in r["legs"]:
                    if leg["type"] == "ride":
                        names = "-".join(graph.STATIONS[s]["name"] for s in leg["stations"])
                        self.assertEqual(turns_back(leg["stations"]), [], f"{leg['line']} {names}")

    def test_reversals_and_branch_turns_are_not_through(self):
        for line, a, b, c in [("1호선", "독산", "금천구청", "서울"), ("1호선", "영등포", "서울", "남영"),
                              ("1호선", "광명", "금천구청", "안양"), ("1호선", "개봉", "구로", "가산디지털단지"),
                              ("9호선", "노량진", "동작", "흑석"), ("9호선", "석촌", "올림픽공원", "한성백제"),
                              ("2호선", "뚝섬", "성수", "용답"), ("2호선", "도림천", "신도림", "문래")]:
            with self.subTest(f"{line} {a}-{b}-{c}"):
                self.assertFalse(graph._rides_on(line, sid(line, a), sid(line, b), sid(line, c)))

    def test_real_continuations_stay(self):
        # 급행 → 완행 이음 · 공항철도 끝(크게 꺾여도 같은 열차) · 2호선 순환의 계통 이음매(시청) · 광명셔틀 · 양 방향
        for line, a, b, c in [("9호선", "김포공항", "마곡나루", "양천향교"), ("1호선", "서울", "금천구청", "석수"),
                              ("공항철도", "공항화물청사", "인천공항1터미널", "인천공항2터미널"),
                              ("2호선", "충정로", "시청", "을지로입구"), ("2호선", "을지로입구", "시청", "충정로"),
                              ("1호선", "독산", "금천구청", "광명"), ("1호선", "광명", "금천구청", "독산")]:
            with self.subTest(f"{line} {a}-{b}-{c}"):
                self.assertTrue(graph._rides_on(line, sid(line, a), sid(line, b), sid(line, c)))

    def test_airport_line_end_is_one_ride(self):
        r = search("공항철도", "공항화물청사", "인천공항2터미널")
        self.assertIsNotNone(r)
        self.assertEqual([leg["type"] for leg in r["legs"]], ["walk", "ride", "walk"])


if __name__ == "__main__":
    unittest.main()
