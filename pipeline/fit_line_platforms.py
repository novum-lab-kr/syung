#!/usr/bin/env python3
"""노선 하나의 역을 OSM 승강장 기준으로 다시 놓는다(전 역 카카오 맞춤 ③, 시범 eccc0e7 에서 손으로 한 일).

  python3 pipeline/fit_line_platforms.py --line 1호선 [--stations 영등포,신길] [--write] [--report out.json]

역마다(그 노선의 track_shapes.json stops):
- OSM 승강장 면 있음(pipeline/osm_platforms.py 맞춤): 면들의 가운데(열차 길이 2배 넘는 장거리 승강장은 짧은 면이 있으면 뺌)를
  이웃 역까지 가장 짧은 OSM 선로 위로 붙인 점이 역 점, 그 선로의 ±승강장 반 길이 현 방향이 승강장 방향,
  면 길이의 가운데값이 승강장 길이.
- 승강장 면 없음: 역 점은 그대로(OSM 선로에서 NO_AREA_SNAP_M 넘게 떨어졌을 때만 선로 위로), 이 노선 출구가 역 점 양쪽에
  있으면 출구 가운데로(승강장 반 길이 안, 카카오 확인 점 제외), 방향은 OSM 선로 현 방향, 길이는 그대로(열차 길이). 사진 대상.
- 둘 다: 그 노선 출구(이 역 출구 중 이 노선 선로가 가장 가까운 것, 150 m 안)가 모두 승강장 한쪽 끝 밖(REACH_MIN_M 넘게)에
  있으면 그 끝을 가장 먼 출구까지 늘린 통로 끝(reach)을 둔다. 지도는 그 통로에 출구를 잇는다.
판정: 바뀜(역 점 MOVE_M 이상 · 방향 TURN_DEG 이상 · 막대 길이 LENGTH_M 이상 · 출구 연결 · 통로가 바뀜) / 승강장 면 없음 / OSM 과 맞음.
--write: 바뀜 · (바뀐 게 있는) 승강장 면 없음 역을 stop_overrides.json(at · shift · dir · half · reach · from)과
track_shapes.json(stops · stopDirs · platformHalf · stopHalf · stopReach, 앞뒤 구간을 [역, 막대 끝, OSM 선로, 막대 끝, 역]으로)에 쓴다.
--snap(--write 와 같이, 2026-10-05 단계 3): 바뀐 역을 도로 맞춤(web/city/viaduct_snap.mjs) stops 에서 빼고
web/modes/basic/city.mjs keepStations 에 넣은 뒤, 그 역에 닿은 도로 맞춤 구간만 build_viaduct_snap.mjs --edges 로 다시 만든다
(기본 지도는 그 파일을 먼저 쓰므로). 끝나면 기본 지도가 쓰는 역 점 · 구간 끝 · 막대 끝을 데이터로 확인(snapCheck).
역마다 정확도 판정 ⓐ~ⓓ(checks) · 카카오 검증 대상(verify: 20 m 이상 이동 · 갈림 역 · 면 없음인데 값 바뀜 · 환승역)을 내고,
검증 대상 · 예외 역만 카카오 링크 목록(.nhm/links/<노선>.md, 좌표는 우리 역 점)을 쓴다.
면 없는 역에서 OSM 선로 방향이 NO_AREA_MAX_TURN 넘게 다르거나, 카카오 확인 점이 선로에서 멀면 그대로 두고 holds 로 적는다.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from osm_platforms import PLATFORM_TRACK_M, line_tracks, local, lonlat, match, metres  # noqa: E402
from build_track_shapes import CONSIST, MAX_TRACK_TURN, PLATFORM_HALF_METRES, PLATFORM_JOIN_METRES, _turn, _distinct_points, clean_track_shape, simplify  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SHAPES = ROOT / "data" / "osm-tracks" / "track_shapes.json"
OVERRIDES = ROOT / "data" / "osm-tracks" / "stop_overrides.json"
EXITS = ROOT / "data" / "osm-tracks" / "exits.json"
MANUAL = ROOT / "data" / "osm-tracks" / "manual_routes.json"
METRO = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"
SNAP = ROOT / "web" / "city" / "viaduct_snap.mjs"
MOVE_M, TURN_DEG, LENGTH_M = 5.0, 3.0, 5.0          # 바뀐 역 기준(계획서: 5 m · 3°)
NO_AREA_SNAP_M = 15.0                               # 승강장 면 없는 역: 이보다 멀면 OSM 선로 위로(카카오 확인 점은 빼고)
NO_AREA_MAX_SNAP_M = 40.0                           # 승강장 면 없는 역: OSM 경로가 이보다 멀면(다른 선로) 끌지 않음
NO_AREA_MAX_TURN = 15.0                             # 승강장 면 없는 역: OSM 선로 방향이 이만큼 넘게 다르면 지금 방향 유지
EXIT_TRACK_M, EXIT_OTHER_M, REACH_MIN_M = 150.0, 10.0, 10.0
CHECK_CENTRE_M, CHECK_LENGTH, CHECK_ON_TRACK_M, VERIFY_MOVE_M = 5.0, 0.10, 5.0, 20.0   # 정확도 판정 · 검증 대상 기준(계획서)
LONG_PLATFORM = 2.0                                 # 열차 길이의 이 배 넘는 면은 장거리 열차 승강장으로 본다


def rnd(p, n=6):
    return [round(p[0], n), round(p[1], n)]


def angle(d):
    return math.degrees(math.atan2(d[1], d[0]))


def turn_between(a, b):
    """두 방향(부호 무시) 사이 각도 0~90°."""
    if not a or not b:
        return None
    c = abs(a[0] * b[0] + a[1] * b[1]) / ((math.hypot(*a) * math.hypot(*b)) or 1)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def along(poly, start_index_point, dist):
    """poly 를 따라 첫 점에서 dist m 간 점."""
    left = dist
    for a, b in zip(poly, poly[1:]):
        d = metres(a, b)
        if d >= left:
            t = left / (d or 1)
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        left -= d
    return poly[-1]


def seg_dist(p, a, b):
    ax, ay = local(a, p); bx, by = local(b, p); vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, -(ax * vx + ay * vy) / l2))
    return math.hypot(ax + vx * t, ay + vy * t), t


def poly_dist(p, pts):
    return min((seg_dist(p, a, b)[0] for a, b in zip(pts, pts[1:])), default=math.inf)


class Network:
    def __init__(self, ts: dict):
        self.ts = ts
        metro = json.loads(METRO.read_text(encoding="utf-8"))
        self.names = {n["id"]: n["name"] for n in metro["nodes"]}
        self.by_name = {(line, n["name"]): n["id"] for n in metro["nodes"] for line in n["lines"]}
        self.exits = json.loads(EXITS.read_text(encoding="utf-8")) if EXITS.exists() else {}
        self.adj = defaultdict(set)          # "<line>:<id>" → 이웃 id
        self.edge_of = {}
        for k in ts["edges"]:
            line, lo, hi = k.rsplit(":", 2)
            self.adj[f"{line}:{lo}"].add(int(hi)); self.adj[f"{line}:{hi}"].add(int(lo))
        self.lines_at = defaultdict(list)
        for k in ts["stops"]:
            line, sid = k.rsplit(":", 1)
            self.lines_at[sid].append(line)
        m = re.search(r"export const stops = (\{.*?\});", SNAP.read_text(encoding="utf-8")) if SNAP.exists() else None
        self.snap_stops = json.loads(m.group(1)) if m else {}
        m = re.search(r"export default (\{.*?\});\n", SNAP.read_text(encoding="utf-8")) if SNAP.exists() else None
        self.snap_edges = set(json.loads(m.group(1))) if m else set()
        self.overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
        manual = json.loads(MANUAL.read_text(encoding="utf-8")) if MANUAL.exists() else {}
        self.manual = set()
        for k in manual:
            if k.startswith("_"):
                continue
            line, a, b = k.split("|")
            ia, ib = self.by_name.get((line, a)), self.by_name.get((line, b))
            if ia and ib:
                self.manual.add(f"{line}:{min(ia, ib)}:{max(ia, ib)}")

    def edge_key(self, line, a, b):
        return f"{line}:{min(a, b)}:{max(a, b)}"

    def edge_from(self, line, sid, n):
        """sid → n 쪽으로 가는 구간 좌표."""
        k = self.edge_key(line, sid, n)
        pts = self.ts["edges"].get(k)
        if not pts:
            return None
        return pts if sid < n else pts[::-1]

    def bar(self, line, sid, stops=None, halves=None, edges=None):
        """기본 지도 막대: 이웃 구간을 역에서 승강장 반 길이만큼(런타임 trackStart 와 같음). 이웃 하나뿐이면 반대쪽은 직선 연장."""
        stops = stops or self.ts["stops"]; halves = halves or self.ts.get("platformHalf", {})
        k = f"{line}:{sid}"
        h = halves.get(k, PLATFORM_HALF_METRES)
        sides = []
        for n in sorted(self.adj[k]):
            pts = (edges or {}).get(self.edge_key(line, sid, n)) or self.ts["edges"].get(self.edge_key(line, sid, n))
            if not pts:
                continue
            pts = pts if sid < n else pts[::-1]
            out, left = [pts[0]], h
            for a, b in zip(pts, pts[1:]):
                d = metres(a, b)
                if d >= left:
                    t = left / (d or 1)
                    out.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); break
                out.append(b); left -= d
            sides.append(out)
        if not sides:
            return [stops[k], stops[k]]
        if len(sides) == 1:
            a, b = sides[0][0], sides[0][1]
            ax, ay = local(b, a); l = math.hypot(ax, ay) or 1
            sides.append([a, lonlat((-ax / l * h, -ay / l * h), a)])
        return sides[0][::-1] + sides[1][1:]

    def own_exits(self, line, sid, edges=None):
        """이 역 출구 중 이 노선 선로가 가장 가까운 것(EXIT_TRACK_M 안, 다른 노선보다 EXIT_OTHER_M 넘게 멀지 않음)."""
        def track(l):
            k = f"{l}:{sid}"
            return [(edges or {}).get(self.edge_key(l, sid, n)) or self.ts["edges"].get(self.edge_key(l, sid, n)) or [] for n in self.adj[k]]
        mine_t = track(line)
        out = []
        for e in self.exits.get(str(sid), []):
            p = (e[0], e[1])
            mine = min((poly_dist(p, t) for t in mine_t if len(t) > 1), default=math.inf)
            if mine > EXIT_TRACK_M:
                continue
            if any(min((poly_dist(p, t) for t in track(o) if len(t) > 1), default=math.inf) + EXIT_OTHER_M < mine
                   for o in self.lines_at[str(sid)] if o != line):
                continue
            out.append(e)
        return out


def reach_point(centre, d, half, exits):
    """출구가 모두 승강장 한쪽 끝 밖에 몰렸으면 그쪽 끝을 가장 먼 출구까지 늘린 점, 아니면 None."""
    if not exits:
        return None
    ts_ = []
    for e in exits:
        x, y = local((e[0], e[1]), centre)
        ts_.append(x * d[0] + y * d[1])
    if all(t > half + REACH_MIN_M for t in ts_):
        far = max(ts_)
    elif all(t < -half - REACH_MIN_M for t in ts_):
        far = min(ts_)
    else:
        return None
    return rnd(lonlat((d[0] * far, d[1] * far), centre))


def exit_links(net, sid, stops, halves, reach, edges=None):
    """출구 → 붙는 노선(런타임과 같이 가장 가까운 막대 · 통로). {출구 번호: 노선}."""
    out = {}
    bars = {}
    for line in net.lines_at[str(sid)]:
        k = f"{line}:{sid}"
        b = net.bar(line, sid, stops, halves, edges)
        segs = [b]
        r = reach.get(k)
        if r:
            end = min((b[0], b[-1]), key=lambda q: metres(q, r))
            segs.append([end, r])
        bars[line] = segs
    for e in net.exits.get(str(sid), []):
        p = (e[0], e[1])
        best = min(((min(poly_dist(p, s) for s in segs), line) for line, segs in bars.items()), default=None)
        if best and best[0] * 1 <= 350:
            out[str(e[2])] = best[1]
    return out


def checks(net, tracks, line, k, v, after_links):
    """정확도 판정(계획서 ⓐ~ⓓ): 값 · 통과 여부. 면 있음: ⓐ 면 가운데에서 선로 방향 5 m · ⓑ 면 축과 3° · ⓒ 길이 ±10% ·
    ⓓ 이 노선 출구가 이 노선에 붙음. 면 없음: ⓐ 선로 위(5 m 안) · ⓑ 선로 방향과 3° · ⓓ 같음."""
    out = {}
    d, p = v["dir"], v["point"]
    if v["areas"]:
        x, y = local(v["centre"], p)
        al = abs(x * d[0] + y * d[1])
        out["a_centreAlongM"] = [round(al, 1), al <= CHECK_CENTRE_M]
        ax0 = v["areas"][0]["axis"]
        sx = sum(a["axis"][0] * (1 if a["axis"][0] * ax0[0] + a["axis"][1] * ax0[1] >= 0 else -1) for a in v["areas"])
        sy = sum(a["axis"][1] * (1 if a["axis"][0] * ax0[0] + a["axis"][1] * ax0[1] >= 0 else -1) for a in v["areas"])
        t = turn_between(d, [sx, sy])
        out["b_axisDeg"] = [round(t, 1), t <= TURN_DEG]
        ln = statistics.median(a["length"] for a in v["areas"])
        r = 2 * v["half"] / ln - 1
        out["c_lengthPct"] = [round(100 * r, 1), abs(r) <= CHECK_LENGTH]
    else:
        hit = tracks.nearest(p, cells=2)
        dist = hit[0] if hit else math.inf
        out["a_onTrackM"] = [round(dist, 1), dist <= CHECK_ON_TRACK_M]
        t = turn_between(d, hit[2]) if hit else 90.0
        out["b_trackDeg"] = [round(t, 1), t <= TURN_DEG]
    own = [str(e[2]) for e in net.own_exits(line, v["sid"])]
    wrong = [r for r in own if after_links.get(r) not in (None, line)]
    out["d_exitsOnLine"] = [wrong, not wrong]
    return out


def verify_reasons(net, line, k, v, moved, changed):
    """카카오 비교 대상인 까닭(계획서 방식 3): 20 m 이상 이동 · 갈림 역 · 면 없음인데 값 바뀜 · 환승역."""
    why = []
    if moved >= VERIFY_MOVE_M:
        why.append(f"{moved:.0f} m 이동")
    if len(net.adj[k]) >= 3:
        why.append("갈림 역")
    if not v["areas"] and changed:
        why.append("면 없음 · 값 바뀜")
    if len(net.lines_at[str(v["sid"])]) >= 2:
        why.append("환승역")
    return why


def fit(net: Network, line: str, only: set | None, matched: dict):
    ts = net.ts
    tracks = line_tracks(line)
    if tracks is None:
        raise SystemExit(f"OSM 선로 캐시가 없어요: data/osm-tracks/line-{line}.json")
    train = CONSIST.get(line, (8, 20))
    train_m = train[0] * train[1]
    stops = dict(ts["stops"]); dirs = dict(ts.get("stopDirs", {})); halves = dict(ts.get("platformHalf", {}))
    reach_old = dict(ts.get("stopReach", {}))
    keys = [k for k in ts["stops"] if k.rsplit(":", 1)[0] == line]
    if only:
        keys = [k for k in keys if net.names.get(int(k.rsplit(":", 1)[1])) in only]
    results = []
    new = {}
    def best_route(p, q):
        rs = [tracks.route(x, y) for x in tracks.candidates(p) for y in tracks.candidates(q)]
        rs = [r for r in rs if r]
        return min(rs, key=lambda r: r[0]) if rs else None

    for k in keys:
        sid = int(k.rsplit(":", 1)[1])
        cur = ts["stops"][k]
        nb = sorted(net.adj[k])
        half_old = halves.get(k, PLATFORM_HALF_METRES)
        # 이웃 역 둘을 잇는 가장 짧은 OSM 본선 경로(갈림 역은 이웃 둘씩 모두)
        throughs = []
        for i in range(len(nb)):
            for j in range(i + 1, len(nb)):
                r = best_route(stops[f"{line}:{nb[i]}"], stops[f"{line}:{nb[j]}"])
                if r:
                    throughs.append(r[1])
        areas = matched.get(k, [])
        far_areas = []
        if throughs:   # 이웃 사이 본선에서 먼 면(지하 노선 옆 지상 장거리 승강장 등)은 뺀다
            far_areas = [a["id"] for a in areas if min(poly_dist(a["centre"], t) for t in throughs) > PLATFORM_TRACK_M]
            areas = [a for a in areas if a["id"] not in far_areas]
        short = [a for a in areas if a["length"] <= LONG_PLATFORM * train_m + 10]
        use = short or areas
        ent = net.overrides.get(f"{line}|{net.names.get(sid)}")
        forced = isinstance(ent, dict) and str(ent.get("from", "")).startswith("kakao-check")
        if forced:   # 카카오 눈 비교로 정한 점(되돌림 · 고침): OSM 면 대신 이 점을 지키고 구간 · 도로 맞춤만 다시 잇는다
            use = []
        if use:
            c = (statistics.fmean(a["centre"][0] for a in use), statistics.fmean(a["centre"][1] for a in use))
            half = round(statistics.median(a["length"] for a in use) / 2)
        else:
            c, half = tuple(cur), half_old
        if throughs:
            through = min(throughs, key=lambda t: poly_dist(c, t))
            _, t, i = min(seg_dist(c, a, b) + (i,) for i, (a, b) in enumerate(zip(through, through[1:])))   # (거리, 비율, 조각)
            a_, b_ = through[i], through[i + 1]
            foot = (a_[0] + (b_[0] - a_[0]) * t, a_[1] + (b_[1] - a_[1]) * t)
            sides = [[foot, *through[:i + 1][::-1]], [foot, *through[i + 1:]]]
        else:   # 끝 역 · 이웃 경로 없음: 가장 가까운 선로, 이웃 쪽 경로
            cands = tracks.candidates(c)
            if not cands:
                results.append({"key": k, "station": net.names.get(sid), "verdict": "OSM 선로 없음", "areas": [a["id"] for a in use]})
                continue
            foot = cands[0][2]
            sides = [r[1] for n in nb for r in [min([x for x in (tracks.route(cands[0], y) for y in tracks.candidates(stops[f"{line}:{n}"])) if x],
                                                     key=lambda x: x[0], default=None)] if r]
        src = (net.overrides.get(f"{line}|{net.names.get(sid)}") or {})
        src = src.get("from", "") if isinstance(src, dict) else ""
        holds = []   # 면 없는 역: OSM 이 맞다고 볼 근거가 약해 그대로 둔 것(예외 목록)
        far_track = not use and metres(cur, foot) > NO_AREA_MAX_SNAP_M   # 이웃 사이 최단 경로가 이 역을 지나지 않음(인천공항1터미널)
        if use or (NO_AREA_SNAP_M < metres(cur, foot) and not far_track and not src.startswith("kakao")):
            point = rnd(foot)
        else:
            point = list(cur)
            if far_track:
                holds.append(f"이웃 사이 OSM 경로가 {metres(cur, foot):.0f} m 떨어져 지나감 — 선로로 끌지 않음")
            elif not use and metres(cur, foot) > NO_AREA_SNAP_M:
                holds.append(f"카카오 확인 점이 OSM 선로에서 {metres(cur, foot):.0f} m — 선로로 끌지 않음")
        cand = (tracks.candidates(point) or [None])[0]
        # 승강장 방향: 면이 있으면 면들의 긴 축 평균, 없으면 선로를 따라 ±half 지점의 현
        if use:
            ax0 = use[0]["axis"]
            sx = sum(a["axis"][0] * (1 if a["axis"][0] * ax0[0] + a["axis"][1] * ax0[1] >= 0 else -1) for a in use)
            sy = sum(a["axis"][1] * (1 if a["axis"][0] * ax0[0] + a["axis"][1] * ax0[1] >= 0 else -1) for a in use)
            a, b = (0.0, 0.0), (sx, sy)
            dx, dy = sx, sy
        else:
            if len(sides) >= 2:
                a, b = along(sides[0], None, half), along(sides[1], None, half)
            elif len(sides) == 1:
                a, b = foot, along(sides[0], None, half)
            else:
                u, v = tracks.segs[cand[1]]
                a, b = tracks.coord[u], tracks.coord[v]
            dx, dy = local(b, a)
        l = math.hypot(dx, dy) or 1
        d = [dx / l, dy / l]
        od = dirs.get(k)
        if od and d[0] * od[0] + d[1] * od[1] < 0:
            d = [-d[0], -d[1]]
        d = [round(d[0], 5), round(d[1], 5)]
        if forced and (ent.get("dir") or od):
            d = list(ent.get("dir") or od)   # 카카오 눈 비교로 정한 역: 방향도 그 칸(운영 값) 그대로, OSM 방향 계산은 쓰지 않음
        elif not use and od and (turn_between(od, d) or 0) >= NO_AREA_MAX_TURN:
            # 지하 터널 OSM 선은 거칠어 굽은 곳에서 현 방향이 크게 틀어진다: 지금 방향(거리 방향) 유지
            holds.append(f"OSM 선로 방향과 {turn_between(od, d):.0f}° 달라 지금 방향 유지")
            d = list(od)
        note = None
        if not use:
            # 승강장 면 없음: 이 노선 출구가 역 점 양쪽에 있으면 그 가운데가 승강장 가운데(생성 때 규칙과 같음).
            # 카카오로 확인한 점(stop_overrides from kakao*)은 그대로, 승강장 반 길이 넘게 옮겨야 하면 옮기지 않고 적어 둔다.
            ex = net.own_exits(line, sid)
            if len(ex) >= 2:
                al = []
                for e in ex:
                    x, y = local((e[0], e[1]), point)
                    al.append(x * d[0] + y * d[1])
                mid = (min(al) + max(al)) / 2
                if min(al) < -REACH_MIN_M and max(al) > REACH_MIN_M and abs(mid) >= MOVE_M:
                    if src.startswith("kakao"):
                        note = f"출구 가운데가 {mid:+.0f} m — 카카오 확인 점이라 그대로"
                    elif abs(mid) > half:
                        note = f"출구 가운데가 {mid:+.0f} m(승강장 반 길이 {half} m 넘음) — 그대로, 확인 필요"
                    else:
                        q = lonlat((d[0] * mid, d[1] * mid), point)
                        hit = tracks.nearest(q)
                        point = rnd(hit[1]) if hit and hit[0] > NO_AREA_SNAP_M else rnd(q)
                        note = f"출구 가운데로 {mid:+.0f} m"
        new[k] = {"point": point, "dir": d, "half": half, "areas": use, "farAreas": far_areas, "cand": cand, "sid": sid, "note": note,
                  "centre": c if use else None, "holds": holds, "forced": forced}
    # 앞뒤 구간 다시 잇기(새 값으로) → 출구 · 통로
    new_stops = dict(stops); new_dirs = dict(dirs); new_halves = dict(halves)
    for k, v in new.items():
        new_stops[k], new_dirs[k], new_halves[k] = v["point"], v["dir"], v["half"]
    new_edges, edge_notes = {}, {}
    touched = {net.edge_key(line, v["sid"], n) for v in new.values() for n in net.adj[f"{line}:{v['sid']}"]}
    for ek in sorted(touched):
        _, lo, hi = ek.rsplit(":", 2)
        lo, hi = int(lo), int(hi)
        ka, kb = f"{line}:{lo}", f"{line}:{hi}"
        if ek in net.manual:
            edge_notes[ek] = "손으로 고른 경로(manual_routes.json) — 그대로"
            continue
        ca, cb = new_stops[ka], new_stops[kb]
        ha, hb = new_halves.get(ka, PLATFORM_HALF_METRES), new_halves.get(kb, PLATFORM_HALF_METRES)
        if metres(ca, cb) < ha + hb + 20:
            edge_notes[ek] = "두 역이 가까워 막대 끝 잇기 안 함 — 그대로"
            continue
        ra = new[ka]["cand"] if ka in new else (tracks.candidates(ca) or [None])[0]
        rb_c = tracks.candidates(cb)
        rs = [tracks.route(ra, c) for c in rb_c] if ra else []
        rs = [r for r in rs if r]
        if not rs:
            edge_notes[ek] = "OSM 선로 경로 없음 — 그대로"
            continue
        path = simplify(min(rs, key=lambda r: r[0])[1])
        def end_toward(c, d, target, half):
            tx, ty = local(target, c)
            sign = 1 if d[0] * tx + d[1] * ty >= 0 else -1
            return lonlat((d[0] * half * sign, d[1] * half * sign), c)
        ea = end_toward(ca, new_dirs.get(ka) or [1, 0], cb, ha)
        eb = end_toward(cb, new_dirs.get(kb) or [1, 0], ca, hb)
        keep = [p for p in path[1:-1] if metres(p, ca) > ha + PLATFORM_JOIN_METRES and metres(p, cb) > hb + PLATFORM_JOIN_METRES]
        cand_pts = [rnd(p) for p in [ca, ea, *keep, eb, cb]]
        dist_pts = _distinct_points(cand_pts)
        turns = [_turn(*dist_pts[i - 1:i + 2])[0] for i in range(1, len(dist_pts) - 1)]
        if turns and (turns[0] > MAX_TRACK_TURN or turns[-1] > MAX_TRACK_TURN):
            # 갈림 역에서 갈라지는 구간 등: 막대 끝 없이 역 점에서 바로 OSM 선로로(역 점이 옮겨졌으니 끝은 꼭 맞춘다)
            inner = [p for p in path[1:-1] if metres(p, ca) > 1 and metres(p, cb) > 1]
            new_edges[ek] = clean_track_shape([rnd(p) for p in [ca, *inner, cb]])
            edge_notes[ek] = f"막대 끝에서 {max(turns[0], turns[-1]):.0f}° 꺾여 막대 끝 없이 OSM 선로로 이음"
            continue
        new_edges[ek] = clean_track_shape(cand_pts)
        edge_notes[ek] = f"다시 이음(최대 꺾임 {max(turns or [0]):.0f}°)"
        if ek in net.snap_edges:
            edge_notes[ek] += " · 도로 맞춤 구간(city_viaduct_snap.mjs) — 기본 지도는 그 파일 경로를 씀, 다시 만들어야 보임"
    # 다시 잇지 않은 구간도 옮겨진 역 점에 끝을 맞춘다(끊어지지 않게)
    for ek in sorted(touched - set(new_edges)):
        _, lo, hi = ek.rsplit(":", 2)
        pts = [list(p) for p in ts["edges"].get(ek, [])]
        if len(pts) < 2:
            continue
        ka, kb = f"{line}:{lo}", f"{line}:{hi}"
        if metres(pts[0], new_stops[ka]) < 0.5 and metres(pts[-1], new_stops[kb]) < 0.5:
            continue
        pts[0], pts[-1] = rnd(new_stops[ka]), rnd(new_stops[kb])
        new_edges[ek] = clean_track_shape(pts)
        edge_notes[ek] = (edge_notes.get(ek) or "") + " · 끝점만 새 역 점으로"
    new_reach = dict(reach_old)
    for k, v in new.items():
        v["reach"] = reach_point(v["point"], v["dir"], v["half"], net.own_exits(line, v["sid"], new_edges))
        if v["reach"]:
            new_reach[k] = v["reach"]
        else:
            new_reach.pop(k, None)
    for k, v in new.items():
        sid = v["sid"]
        before_links = exit_links(net, sid, stops, halves, reach_old)
        after_links = exit_links(net, sid, new_stops, new_halves, new_reach, new_edges)
        moved = metres(ts["stops"][k], v["point"])
        dturn = turn_between(dirs.get(k), v["dir"])
        dlen = 2 * (v["half"] - halves.get(k, PLATFORM_HALF_METRES))
        link_changes = {r: [before_links.get(r), after_links.get(r)] for r in sorted(set(before_links) | set(after_links), key=str)
                        if before_links.get(r) != after_links.get(r)}
        reach_changed = (reach_old.get(k) is None) != (v["reach"] is None) or (
            v["reach"] is not None and metres(reach_old[k], v["reach"]) >= MOVE_M)
        changed = moved >= MOVE_M or (dturn or 0) >= TURN_DEG or abs(dlen) >= LENGTH_M or bool(link_changes) or reach_changed or v["forced"]
        verdict = "승강장 면 없음" if not v["areas"] else "바뀜" if changed else "OSM 과 맞음"
        edges_here = {ek: edge_notes.get(ek) for ek in sorted(touched) if str(sid) in ek.rsplit(":", 2)[1:]}
        results.append({
            "key": k, "station": net.names.get(sid), "verdict": verdict, "changed": changed,
            "areas": [a["id"] for a in v["areas"]], "farAreas": v["farAreas"],
            "before": {"at": ts["stops"][k], "dirDeg": None if not dirs.get(k) else round(angle(dirs[k]), 1),
                       "lengthM": 2 * halves.get(k, PLATFORM_HALF_METRES), "reach": reach_old.get(k), "exits": before_links},
            "after": {"at": v["point"], "dirDeg": round(angle(v["dir"]), 1), "lengthM": 2 * v["half"], "reach": v["reach"], "exits": after_links},
            "movedM": round(moved, 1), "turnDeg": None if dturn is None else round(dturn, 1), "lengthChangeM": round(dlen),
            "exitChanges": link_changes, "edges": edges_here,
            "snapStop": k in net.snap_stops, "note": v["note"], "holds": v["holds"],
            "checks": checks(net, tracks, line, k, v, after_links),
            "verify": verify_reasons(net, line, k, v, moved, changed),
        })
        v["changed"] = changed
    return results, new, new_edges, new_reach


def write(net: Network, line: str, new: dict, new_edges: dict, new_reach: dict, results: list):
    ts = net.ts
    ovr = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    applied = []
    by_key = {r["key"]: r for r in results}
    for k, v in new.items():
        r = by_key.get(k)
        name = net.names[v["sid"]]
        ok = f"{line}|{name}"
        entry = ovr.get(ok) if isinstance(ovr.get(ok), dict) else ({"at": ovr[ok]} if ok in ovr else {})
        if r and not r["changed"] and str(entry.get("from", "")).startswith("osm-") and "dir" not in entry:
            # 이미 OSM 으로 맞춘 역(시범 등)은 지금 방향 · 길이를 칸에 적어 전체 재생성 때 되돌아가지 않게
            entry["dir"] = ts["stopDirs"][k]
            entry["half"] = ts["platformHalf"].get(k, PLATFORM_HALF_METRES)
            ovr[ok] = entry
            applied.append(k)
            continue
        if not r or not r["changed"]:
            continue
        if r["movedM"] >= 0.5 or not entry:
            entry["at"] = v["point"]
            entry["shift"] = True
            entry["from"] = "osm-platform" if v["areas"] else "osm-track"
        entry["dir"] = v["dir"]
        entry["half"] = v["half"]
        if v["reach"]:
            entry["reach"] = v["reach"]
        else:
            entry.pop("reach", None)
        ovr[ok] = entry
        ts["stops"][k] = v["point"]
        ts.setdefault("stopDirs", {})[k] = v["dir"]
        ph, sh = ts.setdefault("platformHalf", {}), ts.setdefault("stopHalf", {})
        exits_half = sh.get(k, 0) if sh.get(k, 0) > ph.get(k, 0) else 0
        ph[k] = v["half"]; sh[k] = max(v["half"], exits_half)
        if v["reach"]:
            ts.setdefault("stopReach", {})[k] = v["reach"]
        else:
            ts.get("stopReach", {}).pop(k, None)
        sid = v["sid"]
        for ek, pts in new_edges.items():
            _, lo, hi = ek.rsplit(":", 2)
            if sid in (int(lo), int(hi)):
                ts["edges"][ek] = pts
        applied.append(k)
    sync_edge_ends(ts, line, {ek for ek in new_edges if ts["edges"].get(ek) is new_edges[ek]})
    OVERRIDES.write_text(json.dumps(ovr, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    SHAPES.write_text(json.dumps(ts, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return applied


def sync_edge_ends(ts: dict, line: str, keys) -> list:
    """구간 끝을 그 역 stops 에 맞춘다(0.5 m 넘게 어긋난 끝만). fit() 은 바뀌지 않은 옆 역도 새 점으로 구간을 잇는데,
    write() 는 바뀐 역의 stops 만 쓰므로 그 옆 역 쪽 끝이 1~5 m 떨어졌다(검토 112312). 고친 구간 키 목록을 돌려준다."""
    fixed = []
    for ek in keys:
        pts = ts["edges"].get(ek)
        if not pts:
            continue
        _, lo, hi = ek.rsplit(":", 2)
        a, b = ts["stops"][f"{line}:{lo}"], ts["stops"][f"{line}:{hi}"]
        if metres(pts[0], a) <= 0.5 and metres(pts[-1], b) <= 0.5:
            continue
        pts = [list(p) for p in pts]
        pts[0], pts[-1] = rnd(a), rnd(b)
        ts["edges"][ek] = clean_track_shape(pts)
        fixed.append(ek)
    return fixed


STYLE = ROOT / "web" / "modes" / "basic" / "city.mjs"
SNAP_BUILD = ROOT / "pipeline" / "build_viaduct_snap.mjs"
LINKS = ROOT / ".nhm" / "links"


def write_links(line: str, results: list, path: Path) -> int:
    """검증 대상 · 판정 예외 역만 카카오 링크(좌표는 우리 역 점)로. 사람이 눌러 보는 목록."""
    rows = []
    for r in results:
        bad = [k for k, (val, ok) in (r.get("checks") or {}).items() if not ok] + (r.get("holds") or [])
        if not r.get("verify") and not bad:
            continue
        lon, lat = r["after"]["at"]
        url = f"https://map.kakao.com/link/map/{r['station']}역,{lat},{lon}"
        rows.append(f"| {r['station']} | {r['verdict']} | {' · '.join(r.get('verify') or []) or '-'} | {', '.join(bad) or '-'} | "
                    f"{r.get('movedM', 0)} m · {r.get('turnDeg') or 0}° | [카카오]({url}) |")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {line} 검증 대상 · 판정 예외 ({len(rows)}곳)\n\n좌표는 우리 역 점(바뀐 뒤). 카카오는 눈으로 비교만.\n\n"
                    "| 역 | 판정 | 검증 까닭 | 예외 | 이동 · 방향 | 링크 |\n|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n", encoding="utf-8")
    return len(rows)


def _snap_stops_span(text):
    m = re.search(r"export const stops = (\{.*?\});", text)
    return m, json.loads(m.group(1))


def snap_update(net: Network, line: str, written: list, tilejson: Path, tiles: Path, report: Path) -> dict:
    """--snap: 바뀐 역 근처는 도로 맞춤보다 OSM 결과가 먼저 쓰이게(시범 eccc0e7 과 같은 방법).
    ① 그 역을 city_viaduct_snap.mjs stops 에서 빼고 web/modes/basic/city.mjs keepStations 에 넣고
    ② 그 역에 닿은 도로 맞춤 구간만 build_viaduct_snap.mjs --edges 로 다시 만든다(바뀐 track_shapes 기준)."""
    import subprocess
    ts = net.ts
    sids = {int(k.rsplit(":", 1)[1]) for k in written}
    touching = sorted(ek for ek in ts["edges"] if ek.startswith(line + ":") and sids & {int(x) for x in ek.rsplit(":", 2)[1:]})
    snap_edges = [ek for ek in touching if ek in net.snap_edges]
    keep = [k for k in written if k in net.snap_stops or any(ek in net.snap_edges for ek in touching if str(k.rsplit(":", 1)[1]) in ek.rsplit(":", 2)[1:])]
    text = SNAP.read_text(encoding="utf-8")
    m, stops = _snap_stops_span(text)
    removed = [k for k in keep if k in stops]
    body = m.group(1)   # 숫자 모양(JS 0.00006 ↔ Python 6e-05)이 바뀌지 않게 그 역 항목만 글자 그대로 지운다
    for k in removed:
        body, n = re.subn(r'"' + re.escape(k) + r'":\[[^\]]*\],', "", body, count=1)
        if not n:
            body, n = re.subn(r',"' + re.escape(k) + r'":\[[^\]]*\]', "", body, count=1)
        assert n == 1, k
    left = json.loads(body)
    assert set(left) == set(stops) - set(removed) and all(left[x] == stops[x] for x in left)
    SNAP.write_text(text[:m.start(1)] + body + text[m.end(1):], encoding="utf-8")
    st = STYLE.read_text(encoding="utf-8")
    m2 = re.search(r'"keepStations": (\[[^\]]*\])', st)
    ks = json.loads(m2.group(1))
    added = [k for k in keep if k not in ks]
    ks += added
    STYLE.write_text(st[:m2.start(1)] + json.dumps(ks, ensure_ascii=False) + st[m2.end(1):], encoding="utf-8")
    out = {"keepStationsAdded": added, "snapStopsRemoved": removed, "snapEdges": snap_edges}
    if snap_edges:
        report.mkdir(parents=True, exist_ok=True)
        ef = report / f"edges-{line}.json"
        ef.write_text(json.dumps(snap_edges, ensure_ascii=False), encoding="utf-8")
        cmd = ["node", str(SNAP_BUILD), "--edges", str(ef), "--tilejson", str(tilejson), "--cache", str(tiles), "--report", str(report / line)]
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=1500)
        out["build"] = {"exit": r.returncode, "tail": (r.stdout + r.stderr).strip().splitlines()[-3:]}
        if r.returncode:
            raise SystemExit(f"build_viaduct_snap.mjs 실패: {out['build']}")
    return out


def snap_check(line: str, keys: list) -> dict:
    """기본 지도가 실제로 쓰는 값(도로 맞춤 stops/구간이 있으면 그것, 없으면 track_shapes)이 바뀐 역 점 · 막대 끝과 맞는지."""
    ts = json.loads(SHAPES.read_text(encoding="utf-8"))
    text = SNAP.read_text(encoding="utf-8")
    _, stops = _snap_stops_span(text)
    edges = json.loads(re.search(r"export default (\{.*?\});\n", text).group(1))
    bad = []
    for k in keys:
        sid = k.rsplit(":", 1)[1]
        p = stops.get(k, ts["stops"][k])[:2]
        if metres(p, ts["stops"][k]) > 0.5:
            bad.append(f"{k}: 역 점이 도로 맞춤 점({metres(p, ts['stops'][k]):.0f} m)")
            continue
        h, d = ts["platformHalf"].get(k, PLATFORM_HALF_METRES), ts["stopDirs"].get(k)
        for ek in ts["edges"]:
            if not ek.startswith(line + ":") or sid not in ek.rsplit(":", 2)[1:]:
                continue
            g = edges.get(ek) or ts["edges"][ek]
            end = g[0] if ek.rsplit(":", 2)[1] == sid else g[-1]
            if metres(end, p) > 0.5:
                bad.append(f"{ek}: 구간 끝이 역 점에서 {metres(end, p):.0f} m")
            elif d:
                ends = [lonlat((d[0] * h * sg, d[1] * h * sg), p) for sg in (1, -1)]
                off = min(poly_dist(e, g) for e in ends)
                if off > 5:
                    bad.append(f"{ek}: 막대 끝에서 {off:.0f} m")
    return {"stations": len(keys), "problems": bad}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--line", required=True)
    ap.add_argument("--stations", help="쉼표로 나눈 역 이름(없으면 노선 전체)")
    ap.add_argument("--write", action="store_true", help="stop_overrides.json · track_shapes.json 에 쓴다")
    ap.add_argument("--report", type=Path, help="역별 전/후 · 판정 JSON")
    ap.add_argument("--shapes", type=Path, help="읽을 track_shapes.json(기본: 레포 파일, --write 와 같이 못 씀)")
    ap.add_argument("--snap", action="store_true", help="--write 뒤 바뀐 역 근처 도로 맞춤 다시 만들기(keepStations + build_viaduct_snap --edges)")
    ap.add_argument("--tilejson", type=Path, help="--snap: OpenFreeMap tilejson 캐시")
    ap.add_argument("--tiles", type=Path, help="--snap: z14 타일 캐시 폴더(없는 타일은 받아 저장)")
    ap.add_argument("--snap-report", type=Path, help="--snap: build_viaduct_snap 보고 폴더(기본: 임시 폴더)")
    ap.add_argument("--links", type=Path, help="검증 대상 · 예외 카카오 링크 목록(기본 .nhm/links/<노선>.md)")
    a = ap.parse_args()
    if a.shapes and a.write:
        ap.error("--shapes 와 --write 는 같이 못 써요.")
    ts = json.loads((a.shapes or SHAPES).read_text(encoding="utf-8"))
    net = Network(ts)
    only = set(a.stations.split(",")) if a.stations else None
    matched = match(ts["stops"])
    results, new, new_edges, new_reach = fit(net, a.line, only, matched)
    summary = defaultdict(int)
    for r in results:
        summary[r["verdict"]] += 1
    out = {"line": a.line, "summary": dict(summary),
           "photo": [r["key"] for r in results if r["verdict"] in ("바뀜", "승강장 면 없음")], "stations": results}
    if a.snap and not a.write:
        ap.error("--snap 은 --write 와 같이 써요.")
    out["checkFailures"] = sum(1 for r in results if any(not ok for _, ok in (r.get("checks") or {}).values()))
    out["holds"] = sum(1 for r in results if r.get("holds"))
    out["verify"] = [r["key"] for r in results if r.get("verify")]
    out["links"] = write_links(a.line, results, a.links or LINKS / f"{a.line}.md")
    if a.write:
        out["written"] = write(net, a.line, new, new_edges, new_reach, results)
        if a.snap:
            import tempfile
            out["snap"] = snap_update(net, a.line, out["written"], a.tilejson, a.tiles,
                                      a.snap_report or Path(tempfile.mkdtemp(prefix="snap-")))
            out["snapCheck"] = snap_check(a.line, [k for k in out["written"] if k in new])
    text = json.dumps(out, ensure_ascii=False, indent=1)
    if a.report:
        a.report.write_text(text + "\n", encoding="utf-8")
        print(json.dumps({"line": a.line, "summary": out["summary"], "verify": len(out["verify"]), "checkFailures": out["checkFailures"], "holds": out["holds"],
                          "written": len(out.get("written", [])), "snap": {k: len(v) for k, v in out.get("snap", {}).items() if isinstance(v, list)},
                          "snapProblems": len(out.get("snapCheck", {}).get("problems", []))}, ensure_ascii=False))
    else:
        print(text)
