import contextlib
import io
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import build_stations as build

PAGE = """<h2 id="mapTitle">1개 역 노드 전체 보기</h2>
<script id="stationData" type="application/json">[]</script>
<script id="lineCounts" type="application/json">{}</script>
<script id="linePaths" type="application/json">{}</script>
<script>/* 나머지는 그대로 */</script>"""

DATA = {
    "nodes": [{"id": 1, "name": "가</script>", "lat": 37.5, "lon": 127.0, "lines": ["1호선"]},
              {"id": 2, "name": "나", "lat": 37.6, "lon": 127.1, "lines": ["1호선", "9호선"]}],
    "lines": {"1호선": [{"name": "1호선 일반", "stops": [1, 2]}],
              "9호선": [{"name": "9호선 급행", "stops": [2]}, {"name": "9호선", "stops": [2]}]},
}


def block(html, name):
    return json.loads(re.search(rf'<script id="{name}" type="application/json">(.*?)</script>', html, re.S).group(1))


def outside(html):
    # 바꿔 넣는 자리(칸 안 · 역 수)를 비운 나머지
    html = re.sub(r'(type="application/json">).*?(</script>)', r'\1\2', html, flags=re.S)
    return re.sub(r'\d+개 역 노드', '개 역 노드', html)


class BuildStationsTests(unittest.TestCase):
    def test_page_is_up_to_date_with_capital_metro(self):
        # capital-metro.json 을 고쳤으면 python3 pipeline/build_stations.py 로 index.html 에 넣는다
        html = build.PAGE.read_bytes().decode("utf-8")
        self.assertEqual(build.render(html, json.loads(build.SOURCE.read_text(encoding="utf-8"))), html)

    def test_only_data_blocks_and_count_change(self):
        out = build.render(PAGE, DATA)
        self.assertEqual(outside(out), outside(PAGE))
        self.assertIn('<h2 id="mapTitle">2개 역 노드 전체 보기</h2>', out)
        self.assertNotIn("가</script>", out)   # 역 이름이 칸을 닫지 않는다
        stations = block(out, "stationData")
        self.assertEqual(stations[0]["name"], "가</script>")
        self.assertEqual(stations[1]["express"], ["9호선"])   # 급행은 정차역 표시만
        self.assertEqual(block(out, "linePaths"), {"1호선": [[1, 2]], "9호선": [[2]]})
        self.assertEqual(block(out, "lineCounts"), {"1호선": 2, "9호선": 1})
        self.assertEqual(build.render(out, DATA), out)

    def test_broken_or_duplicate_block_fails(self):
        for page in (PAGE.replace('id="linePaths"', 'id="paths"'),
                     PAGE.replace('{}</script>\n<script>/*', '{}\n<script>/*'),   # linePaths 닫는 태그 없음
                     PAGE + '\n<script id="lineCounts" type="application/json">{}</script>'):
            with self.assertRaises(SystemExit):
                build.render(page, DATA)

    def test_check_and_write_keep_line_endings(self):
        with tempfile.TemporaryDirectory() as directory:
            page, source = Path(directory) / "index.html", Path(directory) / "capital-metro.json"
            page.write_bytes(PAGE.replace("\n", "\r\n").encode("utf-8"))
            source.write_text(json.dumps(DATA), encoding="utf-8")
            with patch.object(build, "PAGE", page), patch.object(build, "SOURCE", source), patch.object(build, "ROOT", Path(directory)), \
                    contextlib.redirect_stdout(io.StringIO()):
                before = page.read_bytes()
                self.assertEqual(build.main(["--check"]), 1)
                self.assertEqual(page.read_bytes(), before)
                self.assertEqual(build.main([]), 0)
                self.assertEqual(build.main(["--check"]), 0)
            self.assertEqual(page.read_bytes().count(b"\r\n"), PAGE.count("\n"))


if __name__ == "__main__":
    unittest.main()
