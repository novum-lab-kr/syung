"""가속도 센서로 섰다 · 떠났다 찾기(server/services/ride_motion.py, 시험판)."""

import math
import random
import unittest

from server.services.ride_motion import detect

T0 = 1791800000000


def ride(profile, tilt=0.6, jitter=0.5, seed=1, settle=8.0, off=()):
    """profile: [(초, 진행 방향 가속 m/s²)] → motion 사건들. 휴대폰은 기울여 쥐고(tilt rad) 손이 떨린다(jitter m/s²).
    휴대폰의 '중력 뺀 가속'은 중력을 settle 초쯤에 걸쳐 따라가며 추정한다: 오래 밀리면 그 밀림도 중력으로 잘못 알아
    밀림이 끝나면 반대로 되튄다(실제 탑승 10-13 · 10-14 에서 역마다 보인 모양).
    off: [(시작 초, 끝 초)] — 화면이 꺼져 센서가 안 온 구간(10-15 탑승 모양). 기기의 중력 추정은 그동안에도 흐른다."""
    rnd, events, bins, t, low = random.Random(seed), [], [], 0, 0.0
    fwd = (0.0, math.cos(tilt), -math.sin(tilt))      # 열차 진행 방향(휴대폰 좌표)
    grav = (0.0, 9.81 * math.sin(tilt), 9.81 * math.cos(tilt))
    for seconds, acc in profile:
        for _ in range(int(seconds * 10)):
            low += (acc - low) * 0.1 / settle   # 기기가 중력으로 잘못 아는 몫
            shake = tuple(rnd.uniform(-jitter, jitter) for _ in fwd)
            g = tuple(acc * f + s + x for f, s, x in zip(fwd, shake, grav))
            lin = tuple((acc - low) * f + s for f, s in zip(fwd, shake))
            if not any(lo * 1000 <= t < hi * 1000 for lo, hi in off):
                bins.append((t, g, lin))
            t += 100
    for i in range(0, len(bins), 50):   # 5초(칸 50개)마다 한 사건
        chunk, base = bins[i:i + 50], T0 + bins[min(i + 49, len(bins) - 1)][0]
        m = []
        for bt, g, lin in chunk:
            m += [T0 + bt - base, *[round(x, 2) for x in g], *[round(x, 2) for x in lin], 0, 0, 0]
        events.append({"kind": "motion", "t": base, "m": m})
    return events


class RideMotionTest(unittest.TestCase):
    def test_rebound_after_departing_is_not_a_stop(self):
        # 가속 끝의 되튐(반대쪽)과 감속 끝의 되튐: 앞 것은 무시, 뒤 것이 섰다
        found = detect(ride([(10, 0), (15, 0.8), (40, 0), (15, -0.8), (30, 0)]))
        got = [(e["kind"], round((e["t"] - T0) / 1000)) for e in found["events"]]
        self.assertEqual([k for k, _ in got], ["depart", "arrive"], got)
        self.assertLess(abs(got[1][1] - 80), 3, got)

    def test_two_stops_with_shaky_hand(self):
        # 서 있음 10 → 가속 15 → 달림 30 → 감속 15 → 서 있음 20 → 가속 15 → 달림 20 → 감속 15 → 서 있음 10
        found = detect(ride([(10, 0), (15, 0.8), (30, 0), (15, -0.8), (20, 0), (15, 0.8), (20, 0), (15, -0.8), (10, 0)]))
        got = [(e["kind"], round((e["t"] - T0) / 1000)) for e in found["events"]]
        self.assertEqual([k for k, _ in got], ["depart", "arrive", "depart", "arrive"])
        for (kind, sec), want in zip(got, (10, 70, 90, 140)):
            self.assertLess(abs(sec - want), 3, (kind, sec, want))
        self.assertTrue(any(v > 0.5 for _, v in found["series"]) and any(v < -0.5 for _, v in found["series"]))

    def test_slowing_down_twice_keeps_the_last_braking(self):
        found = detect(ride([(5, 0), (12, 0.8), (20, 0), (8, -0.6), (10, 0), (10, -0.8), (15, 0)]))
        got = [(e["kind"], round((e["t"] - T0) / 1000)) for e in found["events"]]
        self.assertEqual([k for k, _ in got], ["depart", "arrive"])
        self.assertLess(abs(got[1][1] - 65), 3)

    def test_hand_jitter_alone_is_nothing(self):
        # 0.1초 칸 평균에 ±0.5 m/s² 떨림(실제 손 떨림 크기는 탑승 기록으로 다시 맞춘다)
        for seed in range(5):
            self.assertEqual(detect(ride([(120, 0)], jitter=0.5, seed=seed))["events"], [], seed)

    # 센서 끊김(화면 꺼짐) 뒤 다시 시작 — 10-15 탑승은 끊김에 감속 · 되튐이 가려져 첫 출발 뒤 출발을 하나도 못 잡았다(1/11)
    TWO_STATIONS = [(10, 0), (15, 0.8), (40, 0), (15, -0.8), (25, 0), (15, 0.8), (40, 0), (15, -0.8), (25, 0), (15, 0.8), (30, 0)]
    # 출발 10 · 105 · 200, 도착(감속 끝) 80 · 175

    def kinds(self, found):
        return [(e["kind"], round((e["t"] - T0) / 1000)) for e in found["events"]]

    def test_departs_again_after_the_stop_was_hidden(self):
        got = self.kinds(detect(ride(self.TWO_STATIONS, off=[(55, 100)])))   # 감속 · 되튐 · 서 있음 대부분이 가려졌다
        self.assertEqual([k for k, _ in got], ["depart", "depart", "arrive", "depart"], got)
        for (kind, sec), want in zip(got, (10, 105, 175, 200)):
            self.assertLess(abs(sec - want), 3, (kind, sec, want))

    def test_rebound_after_a_hidden_braking_is_a_stop(self):
        # 감속만 가려지고 되튐(출발과 같은 쪽)부터 보인다 — 되튐을 출발로 읽지 않고 섰다로, 그 뒤 밀림이 출발
        got = self.kinds(detect(ride(self.TWO_STATIONS, off=[(55, 80)])))
        self.assertEqual([k for k, _ in got], ["depart", "arrive", "depart", "arrive", "depart"], got)
        self.assertLess(abs(got[2][1] - 105), 3, got)

    def test_braking_seen_after_a_gap_is_not_a_depart(self):
        # 달리는 중에 끊겼다가 감속하며 다시 온다 — 반대쪽 밀림은 출발이 아니고, 되튐 · 조용으로 섰다
        got = self.kinds(detect(ride(self.TWO_STATIONS, off=[(30, 62)])))
        self.assertEqual([k for k, _ in got], ["depart", "arrive", "depart", "arrive", "depart"], got)

    def test_without_gaps_nothing_changes(self):
        got = self.kinds(detect(ride(self.TWO_STATIONS)))
        self.assertEqual([k for k, _ in got], ["depart", "arrive", "depart", "arrive", "depart"], got)

    def test_no_motion(self):
        self.assertEqual(detect([]), {"events": [], "series": []})


if __name__ == "__main__":
    unittest.main()
