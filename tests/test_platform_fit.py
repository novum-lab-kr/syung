"""전 역 카카오 맞춤 0단계: OSM 승강장 면 · stop_overrides dir/half/reach 칸 · 출구 한쪽 몰림 통로."""

import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

import osm_platforms  # noqa: E402
import stop_overrides  # noqa: E402
from fit_line_platforms import reach_point  # noqa: E402


def _rect(cx, cy, length, width, deg):
    """경위도 직사각형 고리(가운데 cx, cy · 길이 · 폭 m · 긴 축 각도)."""
    a = math.radians(deg)
    ux, uy = math.cos(a), math.sin(a)
    pts = []
    for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1)):
        x = ux * s * length / 2 - uy * t * width / 2
        y = uy * s * length / 2 + ux * t * width / 2
        pts.append({"lon": cx + x / (111320 * math.cos(math.radians(cy))), "lat": cy + y / 111320})
    return pts


class PlatformAreaTest(unittest.TestCase):
    def test_way_area_centre_axis_length(self):
        a = osm_platforms._area({"type": "way", "id": 1, "geometry": _rect(126.9, 37.5, 200, 10, 27.3)})
        self.assertLess(osm_platforms.metres(a["centre"], (126.9, 37.5)), 0.5)
        self.assertAlmostEqual(abs(math.degrees(math.atan2(a["axis"][1], a["axis"][0])) % 180), 27.3, delta=0.2)
        self.assertAlmostEqual(a["length"], 200, delta=1)

    def test_relation_uses_outer_rings(self):
        rel = {"type": "relation", "id": 2, "members": [
            {"type": "way", "role": "outer", "geometry": _rect(126.9, 37.5, 120, 8, 0)},
            {"type": "way", "role": "inner", "geometry": _rect(126.9, 37.5, 10, 2, 90)}]}
        a = osm_platforms._area(rel)
        self.assertAlmostEqual(a["length"], 120, delta=1)


class OverrideExtrasTest(unittest.TestCase):
    def test_dir_half_reach_go_into_track_shapes(self):
        ts = {"stopDirs": {"L:1": [1, 0]}, "platformHalf": {"L:1": 90, "L:2": 90}, "stopHalf": {"L:1": 150, "L:2": 90}}
        stop_overrides.apply_extras(ts, "L:1", {"dir": [0.6, 0.8], "half": 110, "reach": [126.9, 37.5]})
        stop_overrides.apply_extras(ts, "L:2", {"half": 70})
        self.assertEqual(ts["stopDirs"]["L:1"], [0.6, 0.8])
        self.assertEqual((ts["platformHalf"]["L:1"], ts["stopHalf"]["L:1"]), (110, 150))   # 출구로 늘어난 역 길이는 남음
        self.assertEqual((ts["platformHalf"]["L:2"], ts["stopHalf"]["L:2"]), (70, 70))
        self.assertEqual(ts["stopReach"]["L:1"], [126.9, 37.5])

    def test_pilot_stations_keep_their_direction(self):
        dirs = stop_overrides.fixed_dirs()
        d = dirs.get("1호선:117")
        self.assertIsNotNone(d, "영등포 1호선 dir 칸")
        self.assertAlmostEqual(math.degrees(math.atan2(d[1], d[0])), 27.3, delta=0.5)
        for k in ("1호선:133", "5호선:133"):
            self.assertIn(k, dirs)


class ExitReachTest(unittest.TestCase):
    c = (126.9, 37.5)

    def _exit(self, along, across=0.0):
        k = 111320 * math.cos(math.radians(self.c[1]))
        return [self.c[0] + along / k, self.c[1] + across / 111320, "1"]

    def test_all_exits_past_one_end(self):
        r = reach_point(self.c, [1, 0], 100, [self._exit(-140, 20), self._exit(-170, -10)])
        self.assertIsNotNone(r)
        self.assertAlmostEqual(osm_platforms.local(r, self.c)[0], -170, delta=0.5)

    def test_exits_on_both_sides_or_inside(self):
        self.assertIsNone(reach_point(self.c, [1, 0], 100, [self._exit(-140), self._exit(150)]))
        self.assertIsNone(reach_point(self.c, [1, 0], 100, [self._exit(-140), self._exit(-50)]))
        self.assertIsNone(reach_point(self.c, [1, 0], 100, [self._exit(-105)]))   # 끝에서 10 m 안은 늘리지 않음
        self.assertIsNone(reach_point(self.c, [1, 0], 100, []))


@unittest.skipUnless((ROOT / "data" / "osm-tracks" / "line-1호선.json").exists()
                     and (ROOT / "data" / "osm-tracks" / "platforms-raw.json").exists(), "OSM 캐시 없음(.gitignore)")
class FitToolTest(unittest.TestCase):
    def test_pilot_stations_match_osm(self):
        import fit_line_platforms as F
        ts = json.loads(F.SHAPES.read_text(encoding="utf-8"))
        net = F.Network(ts)
        results, *_ = F.fit(net, "1호선", {"영등포", "신길"}, osm_platforms.match(ts["stops"]))
        by = {r["station"]: r for r in results}
        self.assertEqual(by["영등포"]["verdict"], "OSM 과 맞음")
        self.assertEqual(by["신길"]["verdict"], "OSM 과 맞음")
        self.assertEqual(by["신길"]["after"]["exits"].get("2"), "1호선")   # 신길 2번 출구는 1호선 통로로
        self.assertEqual(by["신길"]["after"]["exits"].get("1"), "1호선")


class LinksTest(unittest.TestCase):
    def test_only_verify_targets_and_exceptions_get_a_kakao_link(self):
        import tempfile
        from fit_line_platforms import write_links
        rows = [
            {"station": "가", "verdict": "바뀜", "verify": ["25 m 이동"], "checks": {"b_axisDeg": [0.5, True]}, "holds": [],
             "after": {"at": [126.9, 37.5]}, "movedM": 25.0, "turnDeg": 0.5},
            {"station": "나", "verdict": "승강장 면 없음", "verify": [], "checks": {"a_onTrackM": [9.0, False]}, "holds": [],
             "after": {"at": [127.0, 37.6]}, "movedM": 0, "turnDeg": 0},
            {"station": "다", "verdict": "OSM 과 맞음", "verify": [], "checks": {"b_axisDeg": [0.1, True]}, "holds": [],
             "after": {"at": [127.1, 37.7]}, "movedM": 0, "turnDeg": 0},
        ]
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "L.md"
            self.assertEqual(write_links("L", rows, f), 2)
            text = f.read_text(encoding="utf-8")
        self.assertIn("https://map.kakao.com/link/map/가역,37.5,126.9", text)
        self.assertIn("a_onTrackM", text)
        self.assertNotIn("다역", text)


class SnapAppliedTest(unittest.TestCase):
    def test_changed_stations_are_what_the_default_map_uses(self):
        """--snap 적용 노선: 바뀐 역은 도로 맞춤 stops 에 없거나 같은 점이라, 기본 지도가 OSM 결과 역 점을 쓴다."""
        import re
        ts = json.loads((ROOT / "data" / "osm-tracks" / "track_shapes.json").read_text(encoding="utf-8"))
        text = (ROOT / "web" / "lib" / "city_viaduct_snap.mjs").read_text(encoding="utf-8")
        snap = json.loads(re.search(r"export const stops = (\{.*?\});", text).group(1))
        style = (ROOT / "web" / "modes" / "basic" / "city.mjs").read_text(encoding="utf-8")
        keep = json.loads(re.search(r'"keepStations": (\[[^\]]*\])', style).group(1))
        ovr = json.loads((ROOT / "data" / "osm-tracks" / "stop_overrides.json").read_text(encoding="utf-8"))
        metro = json.loads((ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json").read_text(encoding="utf-8"))
        by_name = {(line, n["name"]): n["id"] for n in metro["nodes"] for line in n["lines"]}
        n = 0
        for k, v in ovr.items():
            if not isinstance(v, dict) or not str(v.get("from", "")).startswith("osm-"):
                continue
            line, name = k.split("|")
            sk = f"{line}:{by_name[(line, name)]}"
            if sk in snap:
                self.assertLess(osm_platforms.metres(snap[sk][:2], ts["stops"][sk]), 0.5, sk)
            n += 1
        self.assertGreater(n, 3)
        self.assertIn("8호선:24", keep)


class EdgeEndTest(unittest.TestCase):
    def test_sync_edge_ends_puts_edge_ends_on_stops(self):
        from fit_line_platforms import sync_edge_ends
        k = 111320 * math.cos(math.radians(37.5))
        ts = {"stops": {"L:1": [126.9, 37.5], "L:2": [126.9 + 300 / k, 37.5]},
              "edges": {"L:1:2": [[126.9, 37.5 + 4 / 111320], [126.9 + 150 / k, 37.5], [126.9 + 300 / k, 37.5]]}}
        self.assertEqual(sync_edge_ends(ts, "L", ["L:1:2"]), ["L:1:2"])
        self.assertLess(osm_platforms.metres(ts["edges"]["L:1:2"][0], ts["stops"]["L:1"]), 0.5)
        self.assertEqual(sync_edge_ends(ts, "L", ["L:1:2"]), [])   # 이미 맞으면 손대지 않음

    def test_every_edge_end_is_its_stop(self):
        """track_shapes 와 기본 지도(도로 맞춤 우선) 모두: 구간 끝 = 그 역 점(0.5 m 안). 운영 eccc0e7 은 0곳(검토 112312)."""
        import re
        ts = json.loads((ROOT / "data" / "osm-tracks" / "track_shapes.json").read_text(encoding="utf-8"))
        text = (ROOT / "web" / "lib" / "city_viaduct_snap.mjs").read_text(encoding="utf-8")
        se = json.loads(re.search(r"export default (\{.*?\});\n", text).group(1))
        ss = json.loads(re.search(r"export const stops = (\{.*?\});", text).group(1))
        bad = []
        for ek, pts in ts["edges"].items():
            line, lo, hi = ek.rsplit(":", 2)
            for basic in (False, True):
                g = (se.get(ek) or pts) if basic else pts
                for p, sk in ((g[0], f"{line}:{lo}"), (g[-1], f"{line}:{hi}")):
                    stop = (ss.get(sk) or ts["stops"][sk])[:2] if basic else ts["stops"][sk]
                    if osm_platforms.metres(p, stop) > 0.5:
                        bad.append((ek, sk, basic))
        self.assertEqual(bad, [])


@unittest.skipUnless((ROOT / "data" / "osm-tracks" / "line-4호선.json").exists()
                     and (ROOT / "data" / "osm-tracks" / "platforms-raw.json").exists(), "OSM 캐시 없음(.gitignore)")
class FitRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import fit_line_platforms as F
        cls.F = F
        cls.ts = json.loads(F.SHAPES.read_text(encoding="utf-8"))
        cls.net = F.Network(cls.ts)
        cls.matched = osm_platforms.match(cls.ts["stops"])

    def one(self, line, name):
        results, *_ = self.F.fit(self.net, line, {name}, self.matched)
        return results[0]

    def test_kakao_check_station_keeps_point_and_direction(self):
        r = self.one("4호선", "삼각지")   # from: kakao-check(운영 점 · 방향으로 되돌린 역), OSM 면 · 선로 방향을 쓰지 않음
        self.assertEqual(r["movedM"], 0.0)
        self.assertEqual(r["turnDeg"], 0.0)
        self.assertEqual(r["after"]["dirDeg"], r["before"]["dirDeg"])

    def test_no_area_station_is_not_pulled_onto_a_far_track(self):
        r = self.one("공항철도", "인천공항1터미널")   # 이웃 사이 OSM 경로가 2 km 떨어져 지나감(NO_AREA_MAX_SNAP_M)
        self.assertEqual(r["movedM"], 0.0)
        self.assertTrue(any("이웃 사이 OSM 경로" in h for h in r["holds"]))

    def test_large_turn_on_no_area_station_is_held(self):
        # 면 없는 역의 지금 방향이 OSM 선로 방향과 NO_AREA_MAX_TURN(15°) 넘게 다르면 지금 방향 유지 + holds.
        # 실제 예(일원 3호선 51° 등 19역)는 2026-10-05 카카오대로 고쳐 남지 않아서, 일원 방향만 50° 돌린 복사본으로 만든다
        import copy
        ts = copy.deepcopy(self.ts)
        k, a = "3호선:85", math.radians(50)
        d = ts["stopDirs"][k]
        ts["stopDirs"][k] = [d[0] * math.cos(a) - d[1] * math.sin(a), d[0] * math.sin(a) + d[1] * math.cos(a)]
        net = self.F.Network(ts)
        net.overrides.pop("3호선|일원", None)   # kakao-check 역은 방향 계산을 건너뛰므로 뺀다
        results, *_ = self.F.fit(net, "3호선", {"일원"}, self.matched)
        r = results[0]
        self.assertEqual(r["turnDeg"], 0.0)
        self.assertTrue(any("OSM 선로 방향과" in h for h in r["holds"]))


if __name__ == "__main__":
    unittest.main()
