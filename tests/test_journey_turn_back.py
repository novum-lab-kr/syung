"""반대 방향으로 갔다가 되돌아오며 갈아타는 길: 갈아탈 열차가 실시간으로 확인될 때만 고른다(2026-11-04 사용자 결정).

운영 독산 → 서울 '가장 빠른 길'이 독산 → 금천구청(남쪽 1개 역) → 금천구청에서 급행으로 서울이었다. 금천구청 → 서울 급행 이음은
방향 이름이 없어 실시간 열차를 못 붙이고 기본 간격 8분의 절반(4분)을 기다린다고 셈해서 앞섰다 — 그 급행이 4분 안에 오는지는 모른다.
탐색 자료(지하철)는 git 에 있는 것을 그대로 쓴다. 실시간 열차는 운영 피드 모양(services/live.py normalize_positions)대로 만든다.
"""

import unittest
from datetime import datetime, timedelta
from unittest import mock

from server.clock import KST
from server.services import journey_graph as graph

NOW = datetime(2026, 11, 4, 12, 16, 30, tzinfo=KST)


def sid(line: str, name: str) -> int:
    return graph.BY_NAME[(line, graph._key(name))]


def train(no: str, station: str, destination: str, direction: str, status: str, line: str = "1호선") -> dict[str, object]:
    return {"line": line, "trainNo": no, "station": station, "destination": destination, "direction": direction,
            "status": status, "etaSeconds": None, "express": False, "last": False,
            "receivedAt": (NOW - timedelta(seconds=10)).strftime("%Y-%m-%d %H:%M:%S")}


LIVE = {"1호선": [train("7017", "가산디지털단지", "광명", "하행", "진입"), train("0450", "관악", "청량리", "상행", "진입")]}


def rides(origin: str, dest: str, live: dict[str, list[dict[str, object]]], line: str = "1호선") -> list[tuple[str | None, list[str]]]:
    a, b = graph.STATIONS[sid(line, origin)], graph.STATIONS[sid(line, dest)]
    start = {("at", a["id"]): (0, 0, "", a["lat"], a["lon"])}
    goal = {("at", b["id"]): (0, 0, "", b["lat"], b["lon"])}
    r = graph._search(NOW, start, goal, live, graph.TIE_PENALTY, modes=frozenset({"subway"}), toward=(b["lat"], b["lon"]))
    assert r is not None
    return [(leg["trainNo"], [graph.STATIONS[s]["name"] for s in leg["stations"]]) for leg in r["legs"] if leg["type"] == "ride"]


class TurnBackTest(unittest.TestCase):
    def test_guessed_wait_does_not_turn_back(self):
        # 금천구청 급행은 실시간이 없다(추정 기다림) → 남쪽으로 갔다 오지 않고 독산에서 바로 북쪽
        got = rides("독산", "서울", LIVE)
        self.assertEqual(len(got), 1, got)
        self.assertEqual(got[0][0], "0450")
        self.assertEqual(got[0][1][:2], ["독산", "가산디지털단지"])

    def test_live_wait_may_turn_back(self):
        # 금천구청 → 서울 급행이 실시간으로 곧 온다고 확인되면 남쪽 길을 그대로 고를 수 있다
        real = graph._next_live
        gc, seoul = sid("1호선", "금천구청"), sid("1호선", "서울")
        express = train("1924", "금천구청", "청량리", "상행", "진입")

        def with_express(live, line, at, toward, after):
            if (line, at, toward) == ("1호선", gc, seoul):
                return after + timedelta(seconds=30), express
            return real(live, line, at, toward, after)

        with mock.patch.object(graph, "_next_live", with_express):
            got = rides("독산", "서울", LIVE)
        self.assertEqual([(no, names[-1]) for no, names in got], [("7017", "금천구청"), ("1924", "서울")])

    def test_forward_transfer_on_out_and_back_line_stays(self):
        # 화랑대에서 봉화산행(실시간)을 타고 봉화산에서 신내행(추정 기다림)으로 갈아타기는 앞으로 가는 길 — 다른 노선으로 돌지 않는다
        live = {"6호선": [train("6201", "태릉입구", "봉화산", "하행", "진입", line="6호선")]}
        got = rides("화랑대", "신내", live, line="6호선")
        self.assertEqual([(no, names) for no, names in got], [("6201", ["화랑대", "봉화산"]), (None, ["봉화산", "신내"])])

    def test_turn_back_is_told_from_service_order(self):
        # 되돌아옴 = 운행 계통 하나에 「갈아탈 다음 역 … 앞 역 → 갈아탄 역」 차례(갈아탄 뒤 앞 역 쪽으로 다시 감)
        for a, b, c, back in [("독산", "금천구청", "서울", True), ("독산", "금천구청", "독산", True),
                              ("광명", "금천구청", "안양", False), ("광명", "금천구청", "독산", False),
                              ("독산", "금천구청", "석수", False), ("석수", "금천구청", "서울", False)]:
            with self.subTest(f"{a}-{b}-{c}"):
                self.assertEqual(graph._turns_back("1호선", sid("1호선", a), sid("1호선", b), sid("1호선", c)), back)
        # 6호선은 갔다 오는 계통(신내 → 응암 고리 → 신내) — 반대편 구간(돌아오는 쪽)까지 이어 보지 않는다(Codex 리뷰 2026-11-04:
        # 화랑대 → 봉화산 뒤 봉화산 → 신내를 「신내 … 화랑대 → 봉화산」(돌아오는 쪽)으로 잡아 되돌아감으로 봤다)
        for a, b, c, back in [("화랑대", "봉화산", "신내", False), ("신내", "봉화산", "화랑대", False),
                              ("봉화산", "화랑대", "봉화산", True), ("태릉입구", "화랑대", "봉화산", False), ("화랑대", "태릉입구", "봉화산", True),
                              ("응암", "역촌", "응암", True), ("구산", "응암", "새절", False),
                              ("연신내", "구산", "응암", False), ("불광", "역촌", "응암", False), ("구산", "응암", "구산", True)]:
            with self.subTest(f"6호선 {a}-{b}-{c}"):
                self.assertEqual(graph._turns_back("6호선", sid("6호선", a), sid("6호선", b), sid("6호선", c)), back)
        for a, b, c, back in [("충정로", "시청", "을지로입구", False), ("을지로입구", "시청", "충정로", False),
                              ("아현", "충정로", "시청", False), ("시청", "충정로", "시청", True)]:
            with self.subTest(f"2호선 {a}-{b}-{c}"):
                self.assertEqual(graph._turns_back("2호선", sid("2호선", a), sid("2호선", b), sid("2호선", c)), back)


if __name__ == "__main__":
    unittest.main()
