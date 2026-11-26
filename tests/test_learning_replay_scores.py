"""학습 현황의 화면 재현 점수(pipeline/build_learning_stats.py replay_scores): 같은 순간끼리 견준 채점(moments "section")의 첫 날."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
import build_learning_stats  # noqa: E402


class ReplayScoresTest(unittest.TestCase):
    def scores(self, data: dict) -> dict:
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "replay-scores.json").write_text(json.dumps(data), encoding="utf-8")
            with mock.patch.object(build_learning_stats, "STATE", Path(folder)):
                return build_learning_stats.replay_scores()

    def test_scoring_since_is_first_day_with_section_moments(self) -> None:
        out = self.scores({"20261125": [{"line": "7호선", "events": 3}], "20261127": [{"line": "7호선", "moments": "section"}],
                           "20261126": [{"line": "7호선", "events": 0}, {"line": "2호선", "moments": "section"}]})
        self.assertEqual(out["scoringSince"], "20261126")
        self.assertEqual(out["criteria"], {"absMedian": 15, "p90": 30, "bias": 10, "stalls": 0})
        self.assertEqual([d["day"] for d in out["days"]], ["20261125", "20261126", "20261127"])

    def test_old_scores_only(self) -> None:
        self.assertIsNone(self.scores({"20261125": [{"line": "7호선"}]})["scoringSince"])


if __name__ == "__main__":
    unittest.main()
