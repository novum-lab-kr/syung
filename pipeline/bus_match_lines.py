#!/usr/bin/env python3
"""버스 노선 표시선: 공식 경로(path)를 도로 중앙선에 맞춰 data/bus/routes.json 의 `line` 에 넣는다.

공식 경로(getRoutePath)는 도로에서 수~수십 m 비껴 있고 꺾임이 들쭉날쭉하다. 화면에서 매번 타일로
맞추면 끊기고 갈고리가 생겨서, 노선마다 한 번 OSRM 버스 도로망(server/osrm-build-bus.sh)의 /match 로
맞춘 연속선을 미리 만들어 둔다. 맞추지 못한 구간은 /route 로 잇고, 그것도 이상하면 공식 경로를 그대로
쓴다(선이 끊기지 않게). 차량 위치 · 정류장 거리는 지금처럼 `path` 를 쓴다.

    docker run -d --rm --name osrm-bus -p 127.0.0.1:5001:5000 -v /var/lib/osrm/bus:/data \
      ghcr.io/project-osrm/osrm-backend:v6.0.0 osrm-routed --algorithm mld --max-matching-size 500 \
      /data/south-korea-latest.osrm
    python3 pipeline/bus_match_lines.py [--routes id,…] && docker stop osrm-bus

`path` 를 다시 받으면(bus_fetch_paths.py) 이것도 다시 돌린다.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.bus_build_static import write_json  # noqa: E402
from pipeline.build_bus_shapes import decode, metres  # noqa: E402

OSRM = os.environ.get("OSRM_BUS_URL", "http://127.0.0.1:5001").rstrip("/")
STEP = 40          # m: 공식 경로를 이 간격으로 다시 찍어 맞춘다
CHUNK = 400        # 한 번에 맞추는 점 수(osrm-routed --max-matching-size 500)
RADIUS = 30        # m: 공식 경로 점이 도로에서 떨어질 수 있는 거리
DETOUR = 2.0       # 메우는 길이가 DETOUR × 직선 + 150 m 보다 길면 잘못 이은 것
PAIR = (28, 40)    # m: 반대 방향 선이 이 안쪽(완전히 ~ 서서히)이면 한가운데로 모은다(상하행 분리 차도)
OFF = 45           # m: 표시선이 공식 경로에서 이보다 멀어지면 그 구간은 공식 경로로 둔다
SPUR = 150         # m: 선이 건너뛰어도 되는 짧은 회차 꼬리(공식 경로가 들어갔다 나오는 곳)의 깊이
SPUR_RUN = 4       # 공식 경로 점(STEP 간격)이 이만큼 이어서 선에서 멀면 꼬리가 아니라 빠진 길


def resample(path: list[list[float]], step: float = STEP) -> list[list[float]]:
    out, carry = [path[0]], 0.0
    for a, b in zip(path, path[1:]):
        d = metres(a, b)
        s = step - carry
        while s < d:
            t = s / d
            out.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
            s += step
        carry = (carry + d) % step if d else carry
    if out[-1] != path[-1]:
        out.append(path[-1])
    return out


def get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def coords(points: list[list[float]]) -> str:
    return ";".join(f"{p[0]:.6f},{p[1]:.6f}" for p in points)


def osrm_route(a: list[float], b: list[float]) -> list[list[float]] | None:
    try:
        r = get(f"{OSRM}/route/v1/driving/{coords([a, b])}?overview=full&geometries=polyline6&continue_straight=true")
    except Exception:
        return None
    if r.get("code") != "Ok" or not r["routes"]:
        return None
    line = decode(r["routes"][0]["geometry"])
    return line if r["routes"][0]["distance"] <= DETOUR * metres(a, b) + 150 else None


def match(points: list[list[float]]) -> list[tuple[int, int, list[list[float]]]]:
    """맞춘 조각들: (첫 점 번호, 끝 점 번호, 도로 위 선)."""
    pieces = []
    for start in range(0, len(points), CHUNK):
        part = points[start:start + CHUNK]
        if len(part) < 2:
            continue
        query = (f"{OSRM}/match/v1/driving/{coords(part)}?overview=full&geometries=polyline6&gaps=split"
                 f"&tidy=false&radiuses={';'.join([str(RADIUS)] * len(part))}")
        try:
            r = get(query)
        except Exception:
            continue
        if r.get("code") != "Ok":
            continue
        first = {}
        for i, tp in enumerate(r["tracepoints"]):
            if tp is not None:
                first.setdefault(tp["matchings_index"], [start + i, start + i])[1] = start + i
        for k, m in enumerate(r["matchings"]):
            if k in first and first[k][1] > first[k][0]:
                pieces.append((first[k][0], first[k][1], decode(m["geometry"])))
    return sorted(pieces)


def nearest(p: list[float], line: list[list[float]]) -> float:
    best = math.inf
    for a, b in zip(line, line[1:]):
        kx = 111320 * math.cos(math.radians(p[1]))
        ax, ay, bx, by, px, py = a[0] * kx, a[1] * 110540, b[0] * kx, b[1] * 110540, p[0] * kx, p[1] * 110540
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
        best = min(best, math.hypot(px - ax - dx * t, py - ay - dy * t))
    return best


def project(p: list[float], path: list[list[float]], cum: list[float], lo: float, hi: float,
            near: float | None = None) -> tuple[float, float]:
    """p 를 path 의 [lo, hi] 거리 구간에 내린 (떨어진 거리, path 위 거리).

    near 를 주면 같은 길을 되돌아오는 노선에서 앞쪽 지점으로 건너뛰지 않게 near 에서 먼 곳에 벌점을 준다."""
    best, score = (math.inf, lo), math.inf
    kx = 111320 * math.cos(math.radians(p[1]))
    for i in range(1, len(path)):
        if cum[i] < lo or cum[i - 1] > hi:
            continue
        a, b = path[i - 1], path[i]
        ax, ay, bx, by, px, py = a[0] * kx, a[1] * 110540, b[0] * kx, b[1] * 110540, p[0] * kx, p[1] * 110540
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
        d = math.hypot(px - ax - dx * t, py - ay - dy * t)
        at = cum[i - 1] + (cum[i] - cum[i - 1]) * t
        cost = d + (0.05 * abs(at - near) if near is not None else 0)
        if cost < score:
            best, score = (d, at), cost
    return best


def official(path: list[list[float]], cum: list[float], s0: float, s1: float) -> list[list[float]]:
    def at(s: float) -> list[float]:
        for i in range(1, len(path)):
            if cum[i] >= s:
                t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) or 1)
                return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t]
        return path[-1]
    return [at(s0)] + [p for p, c in zip(path, cum) if s0 < c < s1] + [at(s1)]


def repair(line: list[list[float]], path: list[list[float]]) -> tuple[list[list[float]], int]:
    """공식 경로에서 OFF 보다 멀어진 구간(블록 한 바퀴 고리 · 옆 도로)만 공식 경로로 바꾼다."""
    cum = [0.0]
    for a, b in zip(path, path[1:]):
        cum.append(cum[-1] + metres(a, b))
    marks, s, last = [], 0.0, line[0]
    for p in line:
        d, at = project(p, path, cum, s - 150, s + 1500, s + metres(last, p))
        last = p
        marks.append((d, at))
        if d <= OFF:
            s = max(s, at)  # 고리 안의 점이 거리를 앞당기지 않게 가까운 점만 진행시킨다
    out, i, fixed = [], 0, 0
    while i < len(line):
        if marks[i][0] <= OFF:
            out.append(line[i])
            i += 1
            continue
        j = i
        while j < len(line) and marks[j][0] > OFF:
            j += 1
        s0 = marks[i - 1][1] if i else 0.0
        s1 = marks[j][1] if j < len(line) else cum[-1]
        if s1 > s0:
            join(out, official(path, cum, s0, s1))
        fixed += 1
        i = j
    return out, fixed


def centre(line: list[list[float]], step: float = 8) -> list[list[float]]:
    """가는 길과 오는 길이 상하행 분리 차도에 나란히 두 줄로 생기면 그 사이 한가운데로 모은다.

    지하철 노선처럼 한 노선은 한 줄로 보이게. 반대 방향(내적 < -0.8)으로 PAIR[1] 안쪽에 있는 자기 선을
    찾아 그 점과의 가운데로 옮기고, PAIR[0]~PAIR[1] 사이는 서서히 덜 옮겨 꺾임이 생기지 않게 한다."""
    if len(line) < 3:
        return line
    o = line[0]
    kx, ky = 111320 * math.cos(math.radians(o[1])), 110540
    xy = [((p[0] - o[0]) * kx, (p[1] - o[1]) * ky) for p in line]
    dense = [xy[0]]
    for a, b in zip(xy, xy[1:]):
        n = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        dense += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(1, n + 1)]
    cum = [0.0]
    for a, b in zip(dense, dense[1:]):
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    cell, grid = 50.0, {}
    for i in range(1, len(dense)):
        a, b = dense[i - 1], dense[i]
        for gx in range(int(min(a[0], b[0]) // cell), int(max(a[0], b[0]) // cell) + 1):
            for gy in range(int(min(a[1], b[1]) // cell), int(max(a[1], b[1]) // cell) + 1):
                grid.setdefault((gx, gy), []).append(i)
    out = []
    for i, (x, y) in enumerate(dense):
        j0, j1 = max(0, i - 1), min(len(dense) - 1, i + 1)
        fx, fy = dense[j1][0] - dense[j0][0], dense[j1][1] - dense[j0][1]
        fl = math.hypot(fx, fy) or 1
        best = None
        for gx in range(int(x // cell) - 1, int(x // cell) + 2):
            for gy in range(int(y // cell) - 1, int(y // cell) + 2):
                for k in grid.get((gx, gy), ()):
                    if abs(cum[k] - cum[i]) < 2 * PAIR[1]:
                        continue  # 자기 바로 앞뒤 조각은 짝이 아니다
                    a, b = dense[k - 1], dense[k]
                    dx, dy = b[0] - a[0], b[1] - a[1]
                    ln = math.hypot(dx, dy)
                    if not ln or (dx * fx + dy * fy) / (ln * fl) > -0.8:
                        continue
                    t = max(0.0, min(1.0, ((x - a[0]) * dx + (y - a[1]) * dy) / (ln * ln)))
                    px, py = a[0] + dx * t, a[1] + dy * t
                    d = math.hypot(x - px, y - py)
                    if d < PAIR[1] and (best is None or d < best[0]):
                        best = (d, px, py)
        if best:
            d, px, py = best
            w = 0.5 * min(1.0, max(0.0, (PAIR[1] - d) / (PAIR[1] - PAIR[0])))
            x, y = x + (px - x) * w, y + (py - y) * w
        out.append([o[0] + x / kx, o[1] + y / ky])
    return out


def turns_back(path: list[list[float]], cum: list[float], p: list[float], reach: float) -> bool:
    """공식 경로가 p 에 가장 가까운 자리 앞뒤 reach m 안에서 되돌아가는지(120° 넘게 꺾이는 회차가 있는지)."""
    _, at = project(p, path, cum, 0, cum[-1])
    segs = []
    for i in range(1, len(path)):
        if cum[i] < at - reach or cum[i - 1] > at + reach or cum[i] - cum[i - 1] < 0.5:
            continue
        kx = math.cos(math.radians(path[i][1]))
        d = ((path[i][0] - path[i - 1][0]) * kx, path[i][1] - path[i - 1][1])
        segs.append((d[0] / math.hypot(*d), d[1] / math.hypot(*d)))
    return any(u[0] * v[0] + u[1] * v[1] < -0.5 for k, u in enumerate(segs) for v in segs[k + 1:])


def despike(line: list[list[float]], path: list[list[float]] | None = None, short: float = 30) -> list[list[float]]:
    """되돌아 나오는 뾰족한 점을 지운다: 교차로 안으로 잠깐 들어갔다 나온 점(30 m 이하, 150° 넘게 꺾임)과,
    공식 경로는 그 근처에서 곧게 가는데 선만 120° 넘게 되돌아가는 점(옆길로 들어갔다 나온 꼬리 ·
    상하행을 모으며 생긴 지그재그). 공식 경로도 되돌아가는 곳은 진짜 회차라서 둔다."""
    cum = [0.0]
    for a, b in zip(path or [], (path or [])[1:]):
        cum.append(cum[-1] + metres(a, b))
    out = list(line)
    changed = True
    while changed:
        changed = False
        i = 1
        while i < len(out) - 1:
            a, b, c = out[i - 1], out[i], out[i + 1]
            kx = math.cos(math.radians(b[1]))
            u = ((b[0] - a[0]) * kx, b[1] - a[1])
            v = ((c[0] - b[0]) * kx, c[1] - b[1])
            lu, lv = math.hypot(*u), math.hypot(*v)
            cos = (u[0] * v[0] + u[1] * v[1]) / (lu * lv) if lu and lv else 1
            legs = metres(a, b), metres(b, c)
            if (cos < -0.866 and min(legs) <= short) or (
                    cos < -0.5 and path and len(path) > 1 and not turns_back(path, cum, b, max(legs) + 40)):
                del out[i]
                changed = True
            else:
                i += 1
    return out


def simplify(line: list[list[float]], tolerance: float = 1.5) -> list[list[float]]:
    if len(line) < 3:
        return line
    keep, stack = {0, len(line) - 1}, [(0, len(line) - 1)]
    while stack:
        i, j = stack.pop()
        far, k = 0.0, 0
        for m in range(i + 1, j):
            d = nearest(line[m], [line[i], line[j]])
            if d > far:
                far, k = d, m
        if far > tolerance:
            keep.add(k)
            stack += [(i, k), (k, j)]
    return [line[i] for i in sorted(keep)]


def join(line: list[list[float]], more: list[list[float]]) -> None:
    for p in more:
        if not line or metres(line[-1], p) > 0.3:
            line.append(p)


def road_line(path: list[list[float]]) -> tuple[list[list[float]], dict]:
    points = resample(path)
    pieces = match(points)
    line: list[list[float]] = []
    stats = {"points": len(points), "matched": 0, "routed": 0, "official": 0}
    cursor = 0  # 다음에 이어야 할 점 번호
    for a, b, geometry in pieces:
        if b <= cursor:
            continue
        if a > cursor or not line:
            # 맞추지 못한 틈: 도로로 잇고, 이상하면 공식 경로 점으로 메운다.
            gap_from = line[-1] if line else points[0]
            routed = osrm_route(gap_from, geometry[0]) if (line or a > 0) else None
            if routed:
                join(line, routed)
                stats["routed"] += a - cursor
            else:
                join(line, points[cursor:a + 1] if line or a > 0 else [])
                stats["official"] += a - cursor
        join(line, geometry)
        stats["matched"] += b - a
        cursor = b
    if cursor < len(points) - 1:
        join(line, points[cursor:])
        stats["official"] += len(points) - 1 - cursor
    if len(line) < 2:
        return path, stats
    line, stats["repaired"] = repair(line, path)
    # 공식 경로에서 멀어진 곳이 있으면 그 노선은 맞춘 선을 버린다(엉뚱한 길보다 공식 경로가 낫다).
    # 양 끝 100 m 는 차고지 안이라 도로에서 떨어져 있어도 된다.
    offs = [nearest(p, line) for p in points[3:-3] or points]
    run = longest = 0
    for d in offs:
        run = run + 1 if d > OFF else 0
        longest = max(longest, run)
    stats["maxOff"], stats["offRun"] = round(max(offs), 1), longest
    stats["maxLineOff"] = round(max(nearest(p, path) for p in line[::5] + [line[-1]]), 1)
    return despike(simplify(centre(line)), path), stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=ROOT / "data" / "bus")
    parser.add_argument("--routes", help="쉼표로 나눈 노선 id(시험용)")
    parser.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 통계만 낸다")
    parser.add_argument("--despike", action="store_true", help="OSRM 없이 이미 만든 line 의 뾰족한 점만 다시 지운다")
    args = parser.parse_args()
    payload = json.loads((args.data / "routes.json").read_text())
    wanted = set(args.routes.split(",")) if args.routes else None
    todo = [r for r in payload["routes"] if wanted is None or r["id"] in wanted]
    if args.despike:
        removed = 0
        for route in todo:
            if "line" in route:
                line = despike(route["line"], route["path"])
                removed += len(route["line"]) - len(line)
                route["line"] = line
        print(f"뾰족한 점 {removed}개 지움")
        if not args.dry_run:
            manifest = json.loads((args.data / "manifest.json").read_text())
            manifest["files"]["routes.json"] = write_json(args.data / "routes.json", payload)
            write_json(args.data / "manifest.json", manifest)
        return

    def one(route: dict) -> tuple[dict, list, dict]:
        return route, *road_line(route["path"])

    rejected = []
    with ThreadPoolExecutor(4) as pool:
        for route, line, stats in pool.map(one, todo):
            ok = (line is not route["path"] and stats.get("maxOff", math.inf) <= SPUR
                  and stats.get("offRun", math.inf) <= SPUR_RUN and stats.get("maxLineOff", math.inf) <= OFF)
            if ok:
                route["line"] = [[round(x, 5), round(y, 5)] for x, y in line]  # 약 1 m
            else:
                route.pop("line", None)
                rejected.append(route["name"])
            print(f"{route['name']:>8} {route['id']} {'ok ' if ok else 'OFF'} {stats}", flush=True)
    print(f"{len(todo) - len(rejected)}/{len(todo)} 노선 맞춤, 공식 경로 유지: {', '.join(rejected) or '없음'}")
    if args.dry_run:
        return
    payload["source"]["lines"] = {"method": "OSRM /match (server/osrm-bus.lua)", "stepMetres": STEP,
                                  "radiusMetres": RADIUS, "maxOffMetres": OFF,
                                  "matchedRoutes": sum("line" in r for r in payload["routes"])}
    manifest = json.loads((args.data / "manifest.json").read_text())
    manifest["files"]["routes.json"] = write_json(args.data / "routes.json", payload)
    write_json(args.data / "manifest.json", manifest)


if __name__ == "__main__":
    main()
