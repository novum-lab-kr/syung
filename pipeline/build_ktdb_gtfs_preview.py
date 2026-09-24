#!/usr/bin/env python3
"""Build the preview from KTDB GTFS service routes."""

from __future__ import annotations

import json
import shutil
from collections import Counter, defaultdict
from pathlib import Path

from build_leaflet_subway_preview import TEMPLATE

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"
OUT = ROOT / "build" / "index.html"   # regenerated page; compare with web/index.html before replacing it


def main() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    express_by_node: dict[int, set[str]] = defaultdict(set)
    paths = {}
    for line, variants in data["lines"].items():
        regular_paths = []
        for path in variants:
            if "급행" in path["name"]:
                for node_id in path["stops"]:
                    express_by_node[node_id].add(line)
            else:
                regular_paths.append(path["stops"])
        paths[line] = regular_paths

    stations = []
    for node in data["nodes"]:
        stations.append({
            "id": node["id"], "name": node["name"], "lat": node["lat"], "lon": node["lon"],
            "lines": [{"name": line, "code": "GTFS"} for line in node["lines"]],
            "express": sorted(express_by_node.get(node["id"], set())),
        })
    counts = Counter()
    for station in stations:
        for item in station["lines"]:
            counts[item["name"]] += 1
    html = TEMPLATE.replace(
        "__STATIONS__", json.dumps(stations, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    ).replace(
        "__COUNTS__", json.dumps(dict(counts), ensure_ascii=False, separators=(",", ":"))
    ).replace(
        "__PATHS__", json.dumps(paths, ensure_ascii=False, separators=(",", ":"))
    ).replace("__NODE_COUNT__", str(len(stations)))
    html = html.replace("font-size:11px", "font-size:12px")
    html = html.replace("수도권 철도 노선 위치도", "수도권 전철 GTFS 노선도")
    html = html.replace("원본 784행 · 통합", "KTDB 2025-03 · 통합")
    html = html.replace("호선별 연결 · 환승역 통합 표시", "GTFS 운행계통 · 실제 정차 순서")
    html = html.replace(
        "동일 호선은 역 코드 순서로 연결했습니다. 동일 역명·600m 이내 좌표는 하나의 환승 노드로 통합했습니다.",
        "KTDB GTFS의 routes·trips·stop_times를 사용했습니다. 노선명 접미사를 제외한 동일 역명·500m 이내 승강장은 하나의 환승 노드로 통합했습니다.",
    )
    html = html.replace(
        "같은 호선의 역을 순서대로 연결했습니다. 겹치는 환승역은 하나의 점과 이름으로 표시합니다.",
        "GTFS 운행별 stop_sequence로 연결했습니다. 급행·지선·분기 운행계통을 함께 표시합니다.",
    )
    html = html.replace(
        "GTFS 운행별 stop_sequence로 연결했습니다. 급행·지선·분기 운행계통을 함께 표시합니다.",
        "GTFS 일반 운행계통만 선으로 표시합니다. 급행 정차역은 역명 옆에 (급행)으로 표시합니다.",
    )
    html = html.replace("원본 좌표 기준 역 위치", "KTDB GTFS 역 위치")
    html = html.replace(
        "GTFS 일반 운행계통만 선으로 표시합니다. 급행 정차역은 역명 옆에 (급행)으로 표시합니다.",
        "GTFS 일반 운행계통을 표시하며, 공용 선로는 공식 노선색을 섞지 않고 평행선으로 나눕니다. 급행 정차역은 역명 옆에 (급행)으로 표시합니다.",
    )
    html = html.replace('<link rel="stylesheet" href="./vendor/leaflet.css">', '<link rel="stylesheet" href="./vendor/maplibre-gl.css">')
    html = html.replace('</style>', '.webgl-station-label{color:#24353a;font-size:11px;font-weight:700;white-space:nowrap;text-shadow:-1px -1px #fff,1px -1px #fff,-1px 1px #fff,1px 1px #fff;pointer-events:none}.webgl-zoom{position:absolute;z-index:5;right:10px;top:88px;padding:6px 8px;border:1px solid #8e9b9f;border-radius:4px;background:#fff;font-size:11px;font-weight:800}.maplibregl-popup-content{border-radius:7px}.maplibregl-ctrl-top-right{top:4px;right:0}</style>')
    html = html.replace('<div id="map" class="map" role="application" aria-label="수도권 철도역 실제 지도"></div>', '<div id="map" class="map" role="application" aria-label="수도권 철도역 WebGL 지도"></div><div id="zoomLevel" class="webgl-zoom">줌 10</div>')
    script_at = html.index('<script src="./vendor/leaflet.js"></script>')
    html = html[:script_at].replace('<script src="./vendor/leaflet.polylineoffset.js"></script>', '') + '<script type="module" src="./maplibre_runtime.mjs"></script>\n</body></html>'
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "web" / "maplibre_runtime.mjs", OUT.parent / "maplibre_runtime.mjs")
    shapes = Path(__file__).resolve().parent.parent / "data" / "osm-tracks" / "track_shapes.json"  # from build_track_shapes.py
    times = Path(__file__).resolve().parent.parent / "data" / "ktdb-gtfs-2025" / "edge_times.json"  # from build_edge_times.py
    if times.exists():
        shutil.copy2(times, OUT.parent / "edge_times.json")
    if shapes.exists():
        shutil.copy2(shapes, OUT.parent / "track_shapes.json")
    print(json.dumps({"nodes": len(stations), "lines": len(paths), "paths": sum(map(len, paths.values())), "output": str(OUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
