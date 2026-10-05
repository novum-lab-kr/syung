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
        style = (ROOT / "web" / "lib" / "city_style_seoul.mjs").read_text(encoding="utf-8")
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


if __name__ == "__main__":
    unittest.main()
