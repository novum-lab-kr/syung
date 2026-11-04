"""길찾기 실시간 열차 고르기: 탈 방향(역 → 다음 역)으로 실제로 가는 열차만 — 방향 이름(상행 · 하행)만 같은 다른 갈래 열차를 고르지 않는다.

2026-11-04 운영 재시험(main 6b2ddd7) 광명 → 안양: 금천구청 → 석수(하행)로 탈 열차로
광명셔틀 7017(영등포 도착 · 광명행 — 금천구청에서 광명으로 꺾는다)과 「동인천 방면」(용산 운행 중 — 금천구청을 지나지 않는다)을 골랐다.
탐색 자료(지하철)는 git 에 있는 것을 그대로 쓴다. 실시간 열차는 운영 피드 모양(services/live.py normalize_positions)대로 만든다.
"""

import unittest
from datetime import datetime, timedelta

from server.clock import KST
from server.services import journey_graph as graph

NOW = datetime(2026, 11, 4, 12, 26, tzinfo=KST)


def sid(line: str, name: str) -> int:
    return graph.BY_NAME[(line, graph._key(name))]


def train(no: str, station: str, destination: str, direction: str, status: str = "도착", line: str = "1호선") -> dict[str, object]:
    return {"line": line, "trainNo": no, "station": station, "destination": destination, "direction": direction,
            "status": status, "etaSeconds": None, "express": False, "last": False,
            "receivedAt": (NOW - timedelta(seconds=10)).strftime("%Y-%m-%d %H:%M:%S")}


def next_no(live: dict[str, list[dict[str, object]]], line: str, at: str, toward: str) -> str | None:
    found = graph._next_live(live, line, sid(line, at), sid(line, toward), NOW)
    return str(found[1]["trainNo"]) if found else None


class LiveTrainTowardTest(unittest.TestCase):
    def test_branch_and_other_route_trains_are_not_picked(self):
        # 금천구청 → 석수(안양 쪽): 광명셔틀 · 동인천행은 안 간다, 천안행은 간다
        for wrong in (train("7017", "영등포", "광명", "하행"), train("K123", "용산", "동인천", "하행", "운행 중")):
            with self.subTest(wrong["trainNo"]):
                self.assertIsNone(next_no({"1호선": [wrong]}, "1호선", "금천구청", "석수"))
        live = {"1호선": [train("7017", "가산디지털단지", "광명", "하행"), train("K123", "용산", "동인천", "하행", "운행 중"),
                          train("1555", "구로", "천안", "하행")]}
        self.assertEqual(next_no(live, "1호선", "금천구청", "석수"), "1555")

    def test_same_cause_elsewhere(self):
        # 같은 원인(방향 이름만 맞으면 고름)으로 운영 실시간 두 장(2026-11-04 12:51 · 13:0x)에서 틀리게 고르던 열차 — 갈래가 다른 열차 · 이미 종점에 닿은 열차 ·
        # 6호선 응암 고리에서 이미 지나간 열차
        cases = [("1호선", "구로", "가산디지털단지", train("1607", "신도림", "인천", "하행")),
                 ("2호선", "신도림", "도림천", train("2216", "대림", "성수", "내선", line="2호선")),
                 ("5호선", "강동", "둔촌동", train("5085", "천호", "하남검단산", "하행", line="5호선")),
                 ("경의중앙선", "가좌", "신촌", train("5073", "가좌", "덕소", "하행", line="경의중앙선")),
                 ("수인분당선", "왕십리", "청량리", train("6088", "왕십리", "왕십리", "상행", line="수인분당선")),
                 ("6호선", "응암", "역촌", train("6151", "독바위", "봉화산", "하행", line="6호선"))]
        for line, at, toward, row in cases:
            with self.subTest(f"{line} {at}→{toward} {row['station']}·{row['destination']}행"):
                self.assertIsNone(next_no({line: [row]}, line, at, toward))

    def test_train_ending_here_is_not_picked_on_a_circle(self):
        # 2호선 순환 계통은 한 바퀴 더 이어 보므로 「성수 → 뚝섬 → 성수」가 차례로 있다 — 그래도 성수에서 끝나는 열차는 성수에서 못 탄다
        # (Codex 리뷰 2026-11-04: 종착 열차를 먼저 골라 정상 열차를 놓치고 성수 → 용답 → 성수 → 뚝섬 으로 돌았다)
        ending = train("2901", "성수", "성수종착", "외선", line="2호선")
        plain = train("2902", "건대입구", "신도림", "외선", "진입", line="2호선")
        self.assertIsNone(next_no({"2호선": [ending]}, "2호선", "성수", "뚝섬"))
        self.assertEqual(next_no({"2호선": [ending, plain]}, "2호선", "성수", "뚝섬"), "2902")
        a, b = graph.STATIONS[sid("2호선", "성수")], graph.STATIONS[sid("2호선", "뚝섬")]
        start = {("at", a["id"]): (0, 0, "", a["lat"], a["lon"])}
        goal = {("at", b["id"]): (0, 0, "", b["lat"], b["lon"])}
        r = graph._search(NOW, start, goal, {"2호선": [ending, plain]}, graph.TIE_PENALTY, modes=frozenset({"subway"}),
                          toward=(b["lat"], b["lon"]))
        self.assertIsNotNone(r)
        rides = [leg for leg in r["legs"] if leg["type"] == "ride"]
        self.assertEqual([(leg["trainNo"], [graph.STATIONS[s]["name"] for s in leg["stations"]]) for leg in rides],
                         [("2902", ["성수", "뚝섬"])])

    def test_plain_trains_stay(self):
        # 같은 갈래 열차는 그대로: 종점이 다음 역 · 그 너머 · 순환선 이음매 너머 · 종점을 모르는 열차
        cases = [("1호선", "독산", "금천구청", train("2001", "구로", "서동탄", "하행")),
                 ("1호선", "독산", "가산디지털단지", train("2002", "석수", "광운대", "상행")),
                 ("1호선", "금천구청", "석수", train("2003", "독산", "석수", "하행")),
                 ("2호선", "충정로", "시청", train("2004", "아현", "성수", "내선", line="2호선")),
                 ("1호선", "금천구청", "석수", train("2005", "구로", "어딘가", "하행"))]
        for line, at, toward, row in cases:
            with self.subTest(f"{line} {at}→{toward} {row['destination']}"):
                self.assertEqual(next_no({line: [row]}, line, at, toward), row["trainNo"])

    def test_gwangmyeong_to_anyang_rides_a_train_that_goes_there(self):
        a, b = graph.STATIONS[sid("1호선", "광명")], graph.STATIONS[sid("1호선", "안양")]
        start = {("at", a["id"]): (0, 0, "", a["lat"], a["lon"])}
        goal = {("at", b["id"]): (0, 0, "", b["lat"], b["lon"])}
        live = {"1호선": [train("7017", "영등포", "광명", "하행"), train("K123", "용산", "동인천", "하행", "운행 중")]}
        r = graph._search(NOW, start, goal, live, graph.TIE_PENALTY, modes=frozenset({"subway"}), toward=(b["lat"], b["lon"]))
        self.assertIsNotNone(r)
        rides = [leg for leg in r["legs"] if leg["type"] == "ride"]
        self.assertEqual([leg["trainNo"] for leg in rides if leg["realtime"]], [])


if __name__ == "__main__":
    unittest.main()
