"""가속도 센서로 섰다 · 떠났다 찾기(server/services/ride_motion.py, 시험판)."""

import math
import random
import unittest

from server.services.ride_motion import detect

T0 = 1791800000000


def ride(profile, tilt=0.6, jitter=0.5, seed=1):
    """profile: [(초, 진행 방향 가속 m/s²)] → motion 사건들. 휴대폰은 기울여 쥐고(tilt rad) 손이 떨린다(jitter m/s²)."""
    rnd, events, bins, t = random.Random(seed), [], [], 0
    fwd = (0.0, math.cos(tilt), -math.sin(tilt))      # 열차 진행 방향(휴대폰 좌표)
    grav = (0.0, 9.81 * math.sin(tilt), 9.81 * math.cos(tilt))
    for seconds, acc in profile:
        for _ in range(int(seconds * 10)):
            lin = tuple(acc * f + rnd.uniform(-jitter, jitter) for f in fwd)
            g = tuple(a + x for a, x in zip(lin, grav))
            bins.append((t, g, lin)); t += 100
    for i in range(0, len(bins), 50):   # 5초마다 한 사건
        chunk, base = bins[i:i + 50], T0 + bins[min(i + 49, len(bins) - 1)][0]
        m = []
        for bt, g, lin in chunk:
            m += [T0 + bt - base, *[round(x, 2) for x in g], *[round(x, 2) for x in lin], 0, 0, 0]
        events.append({"kind": "motion", "t": base, "m": m})
    return events


class RideMotionTest(unittest.TestCase):
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

    def test_no_motion(self):
        self.assertEqual(detect([]), {"events": [], "series": []})


if __name__ == "__main__":
    unittest.main()
