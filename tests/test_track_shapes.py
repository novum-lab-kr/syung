import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import build_track_shapes as track


def points(xy):
    return [list(track._lonlat(p, (127, 37.5))) for p in xy]


class TrackShapesTests(unittest.TestCase):
    def test_reversal_is_removed_without_moving_endpoints(self):
        raw = points([(0, 0), (100, 0), (40, 40), (0, 100)])
        fixed = track.remove_spikes(raw)
        self.assertNotIn(raw[1], fixed)
        self.assertEqual(fixed[0], raw[0])
        self.assertEqual(fixed[-1], raw[-1])

    def test_sharp_corner_is_rounded_within_track_corridor(self):
        self.assertTrue(hasattr(track, "clean_track_shape"), "급한 꺾임 정리 함수가 필요해요.")
        raw = points([(0, 0), (100, 0), (100, 100), (250, 100)])
        fixed = track.clean_track_shape(raw)
        self.assertEqual(fixed[0], raw[0])
        self.assertEqual(fixed[-1], raw[-1])
        for a, b, c in zip(fixed, fixed[1:], fixed[2:]):
            ax, ay = track._local(a, b)
            bx, by = track._local(c, b)
            cosine = -(ax * bx + ay * by) / (math.hypot(ax, ay) * math.hypot(bx, by))
            self.assertLessEqual(math.degrees(math.acos(max(-1, min(1, cosine)))), 50)
        for p in fixed:
            x, y = track._local(p, raw[0])
            distance = min(math.hypot(x - max(0, min(100, x)), y),
                           math.hypot(x - 100, y - max(0, min(100, y))),
                           math.hypot(x - max(100, min(250, x)), y - 100))
            self.assertLessEqual(distance, 20.15)

    def test_misaligned_platform_reconnection_keeps_original_track(self):
        raw = points([(0, 0), (60, 0), (120, 0), (240, 0), (300, 0)])
        shapes = {"테스트:1:2": raw}
        stops = {"테스트:1": raw[0], "테스트:2": raw[-1]}
        graph = track.RoadGraph()
        road = points([(0, 0), (100, 80)])
        graph.coord = {1: road[0], 2: road[1]}
        graph.adj[1].append((2, 128))
        graph.grid[(int(road[0][0] * 500), int(road[0][1] * 500))].append(1)
        # 도로 조회만 대체하고 승강장 방향 계산과 재연결은 실제 코드로 검증한다.
        with patch.object(track, "station_roads", return_value=graph):
            track.orient_stations(shapes, stops)
        self.assertEqual(shapes["테스트:1:2"], raw)

    def test_offline_postprocess_only_changes_edges(self):
        self.assertTrue(hasattr(track, "postprocess_track_shapes"), "오프라인 후처리가 필요해요.")
        raw = points([(0, 0), (100, 0), (100, 100)])
        metadata = {"stops": {"테스트:1": raw[0], "테스트:2": raw[-1]},
                    "stopDirs": {"테스트:1": [1, 0]}, "stopHalf": {"테스트:1": 90},
                    "platformHalf": {"테스트:1": 85}, "stopWidth": {"테스트:1": 22},
                    "extra": {"보존": True}}
        data = {"edges": {"테스트:1:2": raw}, **metadata}
        with tempfile.TemporaryDirectory() as folder:
            source, output, report = [Path(folder) / n for n in ["input.json", "output.json", "report.json"]]
            source.write_text(json.dumps(data), encoding="utf-8")
            # 전체 생성이나 외부 조회 없이 오프라인 함수가 실행되어야 한다.
            with patch.object(track, "overpass", side_effect=AssertionError("외부 조회 금지")):
                summary = track.postprocess_track_shapes(source, output, report)
            fixed = json.loads(output.read_text())
            self.assertEqual({k: v for k, v in fixed.items() if k != "edges"}, metadata)
            self.assertEqual(json.loads(source.read_text()), data)
            self.assertEqual(summary["changed_edges"], ["테스트:1:2"])
            self.assertEqual(summary["before_count"], 1)
            self.assertEqual(summary["after_count"], 0)
            self.assertEqual(json.loads(report.read_text()), summary)
            self.assertEqual(track.clean_track_shape(fixed["edges"]["테스트:1:2"]), fixed["edges"]["테스트:1:2"])

    def test_gentle_track_and_short_edges_are_unchanged(self):
        for raw in [[], points([(0, 0)]), points([(0, 0), (100, 0)]),
                    points([(0, 0), (100, 0), (200, 20), (300, 50)])]:
            self.assertEqual(track.clean_track_shape(raw), raw)

    def test_duplicate_points_do_not_hide_reversal(self):
        raw = points([(0, 0), (100, 0), (100, 0), (100.3, 0), (40, 40), (0, 100)])
        fixed = track.clean_track_shape(raw)
        self.assertNotIn(raw[1], fixed)
        self.assertEqual(fixed[0], raw[0])
        self.assertEqual(fixed[-1], raw[-1])

    def test_short_road_jog_does_not_leave_a_station_side_bulge(self):
        raw = points([(0, 0), (100, 15), (200, 55), (225, -25), (565, -220), (650, -265)])
        fixed = track.clean_track_shape(raw)
        for p in fixed:
            x, y = track._local(p, raw[0])
            if x >= 100:
                self.assertLessEqual(y, 15.1)
        self.assertEqual(fixed[0], raw[0])
        self.assertEqual(fixed[-1], raw[-1])


if __name__ == "__main__":
    unittest.main()
