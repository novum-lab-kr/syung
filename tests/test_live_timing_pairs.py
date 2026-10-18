"""학습 짝(pipeline/build_live_timing.py pairs): 위치 피드는 그 노선을 이어 읽었을 때만 '다음 사건' 짝으로 쓴다."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from build_live_timing import READ_GAP, Trains, pairs  # noqa: E402

T0 = 1792000000.0   # 읽은 때(초)


def rec(station, status, at, read):
    return {"station": station, "status": status, "receivedAt": at, "read": read, "event": True}


class PairsTest(unittest.TestCase):
    def trains(self, reads, seq, source="position"):
        t = Trains({(source, "7호선", "7079"): seq})
        t.reads = {"7호선": sorted(reads)}
        return t

    def test_position_pair_needs_a_read_of_the_line_just_before(self):
        seq = [rec("건대입구", "도착", "2026-10-18 08:00:00", T0), rec("건대입구", "출발", "2026-10-18 08:00:40", T0 + 60)]
        got = list(pairs(self.trains([T0, T0 + 30, T0 + 60], seq)))
        self.assertEqual([(g[0], g[5]) for g in got], [("7호선", 40)], "30초마다 이어 읽었으면 짝")
        self.assertEqual(list(pairs(self.trains([T0, T0 + 420], [seq[0], {**seq[1], "read": T0 + 420}]))), [],
                         f"앞 읽기가 {READ_GAP}초보다 멀면(약 7분에 한 번) 사이 사건을 놓쳤을 수 있다")

    def test_all_feed_records_are_not_filtered_by_position_reads(self):
        seq = [rec("건대입구", "도착", "2026-10-18 08:00:00", None), rec("건대입구", "출발", "2026-10-18 08:00:40", None)]
        self.assertEqual(len(list(pairs(self.trains([], seq, source="all")))), 1)


if __name__ == "__main__":
    unittest.main()
