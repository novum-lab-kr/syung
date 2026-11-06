#!/usr/bin/env python3
"""출구 옆 큰길(OpenStreetMap) → data/osm-tracks/exit_roads.json.

길찾기가 같은 역 출구들의 걷는 시간이 비길 때 길 건너편 출구를 빼려고 쓴다(server/services/journey_graph.py
`_pick_exit` · 2026-11-06 사용자 결정 A). 걷기 길 자료(OSRM)는 서울 큰길 대부분이 중앙선 한 줄이라 출구가
길의 어느 쪽인지 모른다 — 그래서 출구마다 가장 가까운 큰길 조각(두 점)을 적어 두고, 어느 쪽인지는 서버가
그 조각을 늘린 선으로 셈한다.

data/osm-tracks/exits.json 의 출구마다 EXIT_ROAD_M 안의 큰길(motorway · trunk · primary · secondary · tertiary
와 그 _link, 땅 밑 길은 뺀다) 가운데 가장 가까운 길에서, 가장 가까운 자리 앞뒤로 그 길을 CHORD_M 씩 따라간 두 점
(갈림목의 몇 m 짜리 조각만 쓰면 방향이 흔들린다). 큰길이 없거나 선 위에 붙은 출구는 칸이 없다.
Output: {"<station id>": [[exit lon, exit lat, a lon, a lat, b lon, b lat], ...]}

Overpass 응답은 data/osm-tracks/roads/exit-roads.json 에 캐시(git 무시) — 지우면 다시 받는다.
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_track_shapes import overpass  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
EXITS = ROOT / "data" / "osm-tracks" / "exits.json"
OUT = ROOT / "data" / "osm-tracks" / "exit_roads.json"
BBOX = "36.9,126.4,38.0,127.6"   # build_entrances.py 와 같은 범위
EXIT_ROAD_M = 40     # 큰길 중앙선에서 출구까지(8차로 길 반 폭 + 보도도 이 안)
ON_LINE_M = 2        # 이보다 가까우면 선 위 — 어느 쪽인지 모른다
CHORD_M = 30        # 가장 가까운 자리에서 길을 따라 앞뒤로 이만큼(길이 짧으면 끝까지)
CELL = 0.005         # 조각 찾기 격자(도) — 약 450 × 550 m
QUERY = ('[out:json][timeout:240];node["railway"="subway_entrance"](' + BBOX + ')->.e;'
         'way(around.e:50)["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"];out tags geom;')


def seg_metres(p, a, b):
    """점 p 에서 조각 a-b 까지(m). 점은 (lon, lat), p 둘레 평면으로 편다."""
    k = math.cos(math.radians(p[1]))
    ax, ay = (a[0] - p[0]) * k, a[1] - p[1]
    bx, by = (b[0] - p[0]) * k, b[1] - p[1]
    dx, dy = bx - ax, by - ay
    span = dx * dx + dy * dy
    t = 0.0 if span == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / span))
    return math.hypot(ax + t * dx, ay + t * dy) * 111_320


def metres(a, b):
    return math.hypot((a[0] - b[0]) * 111_320 * math.cos(math.radians(a[1])), (a[1] - b[1]) * 111_320)


def chord(geom, i):
    """조각 i(geom[i]-geom[i+1]) 둘레로 길을 따라 앞뒤 CHORD_M 씩 간 두 점."""
    back, run = i, 0.0
    while back > 0 and run < CHORD_M:
        run += metres(geom[back], geom[back - 1])
        back -= 1
    fwd, run = i + 1, 0.0
    while fwd < len(geom) - 1 and run < CHORD_M:
        run += metres(geom[fwd], geom[fwd + 1])
        fwd += 1
    return geom[back], geom[fwd]


def underground(layer):
    try:
        return int(layer or 0) < 0
    except ValueError:
        return False


def main() -> None:
    exits = json.loads(EXITS.read_text(encoding="utf-8"))
    data = overpass(QUERY, "roads/exit-roads.json")
    grid: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)   # 칸 → (길 번호, 조각 번호)
    geoms: list[list[tuple[float, float]]] = []
    for w in data["elements"]:
        t = w.get("tags", {})
        if t.get("tunnel") not in (None, "no") or underground(t.get("layer")):
            continue   # 땅 밑 길(지하차도)은 건너는 길이 아니다
        geom = [(g["lon"], g["lat"]) for g in w.get("geometry") or []]
        geoms.append(geom)
        for i, (a, b) in enumerate(zip(geom, geom[1:])):
            for cell in {(math.floor(q[0] / CELL), math.floor(q[1] / CELL)) for q in (a, b)}:
                grid[cell].append((len(geoms) - 1, i))
    out: dict[str, list[list[float]]] = {}
    kept = total = 0
    for sid, rows in exits.items():
        for row in rows:
            total += 1
            p = (row[0], row[1])
            cx, cy = math.floor(p[0] / CELL), math.floor(p[1] / CELL)
            near = {s for dx in (-1, 0, 1) for dy in (-1, 0, 1) for s in grid.get((cx + dx, cy + dy), ())}
            best = min(((seg_metres(p, geoms[w][i], geoms[w][i + 1]), w, i) for w, i in near), default=None, key=lambda x: x[0])
            if best is None or not ON_LINE_M <= best[0] <= EXIT_ROAD_M:
                continue
            a, b = chord(geoms[best[1]], best[2])
            out.setdefault(sid, []).append([p[0], p[1], round(a[0], 7), round(a[1], 7), round(b[0], 7), round(b[1], 7)])
            kept += 1
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"ways": len(geoms), "exits": total, "kept": kept, "stations": len(out), "bytes": OUT.stat().st_size}))


if __name__ == "__main__":
    main()
