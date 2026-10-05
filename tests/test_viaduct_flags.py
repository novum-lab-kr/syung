import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import build_viaduct_flags as flags


class ViaductFlagsTests(unittest.TestCase):
    def test_partial_generation_preserves_unselected_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            shapes = {"테스트:1:2": [[127, 37.5], [127.002, 37.5]],
                      "테스트:3:4": [[128, 37.5], [128.002, 37.5]]}
            (folder / "track_shapes.json").write_text(json.dumps({"edges": shapes}))
            (folder / "line-테스트.json").write_text(json.dumps({"elements": [
                {"type": "node", "id": 1, "lon": 127, "lat": 37.5},
                {"type": "node", "id": 2, "lon": 127.002, "lat": 37.5},
                {"type": "way", "nodes": [1, 2], "tags": {"bridge": "yes"}}
            ]}))
            existing, output = folder / "existing.mjs", folder / "output.mjs"
            before = {"테스트:1:2": [[.1, .2]], "테스트:3:4": [[.25, .75]]}
            existing.write_text("export default " + json.dumps(before) + ";\n")
            with patch.object(flags, "CACHE", folder), patch.object(flags, "OUT", existing):
                flags.main(selected={"테스트:1:2"}, output=output)
            after = json.loads(output.read_text().split("export default ")[1].strip().rstrip(";"))
            self.assertEqual(after["테스트:3:4"], before["테스트:3:4"])
            self.assertNotEqual(after["테스트:1:2"], before["테스트:1:2"])
            self.assertEqual(existing.read_text(), "export default " + json.dumps(before) + ";\n")


if __name__ == "__main__":
    unittest.main()
