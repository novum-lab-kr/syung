#!/usr/bin/env python3
"""web/index.html 안 역 데이터 칸(stationData · lineCounts · linePaths)과 역 수 글자만 capital-metro.json 으로 바꿔 넣는다.

화면이 이 칸을 바로 읽어 첫 노선을 그리므로 데이터는 HTML 안에 둔다(밖으로 빼면 첫 노선 전에 요청이 는다).
나머지 HTML 은 건드리지 않는다. --check: 바꿀 것이 있으면 1 로 끝난다(파일은 그대로).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"   # extract_ktdb_capital_metro.py · add_missing_branches.py
PAGE = ROOT / "web" / "index.html"


def network(data: dict) -> tuple[list, dict, dict]:
    """급행 운행계통은 선으로 그리지 않고 정차역에 노선 이름만 남긴다. 일반 계통의 정차 순서가 선이 된다."""
    express_by_node: dict[int, set[str]] = defaultdict(set)
    paths = {}
    for line, variants in data["lines"].items():
        regular = []
        for path in variants:
            if "급행" in path["name"]:
                for node_id in path["stops"]:
                    express_by_node[node_id].add(line)
            else:
                regular.append(path["stops"])
        paths[line] = regular
    stations = [{
        "id": node["id"], "name": node["name"], "lat": node["lat"], "lon": node["lon"],
        "lines": [{"name": line, "code": "GTFS"} for line in node["lines"]],
        "express": sorted(express_by_node.get(node["id"], set())),
    } for node in data["nodes"]]
    counts = Counter(item["name"] for station in stations for item in station["lines"])
    return stations, dict(counts), paths


def compact(value) -> str:
    # 스크립트 칸 안이므로 </ 가 칸을 닫지 않게
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def replace_once(html: str, pattern: str, repl: str, what: str) -> str:
    out, n = re.subn(pattern, lambda m: m.group(1) + repl + m.group(2), html, flags=re.S)
    if n != 1:
        raise SystemExit(f"{PAGE.name}: {what} 칸이 {n}개 (1개여야 함)")
    return out


def render(html: str, data: dict) -> str:
    stations, counts, paths = network(data)
    for block, value in (("stationData", stations), ("lineCounts", counts), ("linePaths", paths)):
        # 닫는 태그가 빠졌을 때 다음 <script 칸까지 삼키지 않게
        html = replace_once(html, rf'(<script id="{block}" type="application/json">)(?:(?!<script).)*?(</script>)', compact(value), block)
    # 화면이 뜨기 전 제목(뜬 뒤에는 maplibre_runtime.mjs 가 같은 글자를 다시 쓴다)
    return replace_once(html, r'(<h2 id="mapTitle">)\d+(개 역 노드 전체 보기</h2>)', str(len(stations)), "mapTitle")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="바꾸지 않고, 바꿀 것이 있으면 1")
    args = parser.parse_args(argv)
    html = PAGE.read_bytes().decode("utf-8")   # 줄바꿈(CRLF 등)을 그대로 둔다
    out = render(html, json.loads(SOURCE.read_text(encoding="utf-8")))
    if args.check:
        print("index.html 역 데이터: " + ("최신" if out == html else "다름 — python3 pipeline/build_stations.py 로 넣기"))
        return 0 if out == html else 1
    if out != html:
        PAGE.write_bytes(out.encode("utf-8"))
    print(json.dumps({"changed": out != html, "output": str(PAGE.relative_to(ROOT))}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
