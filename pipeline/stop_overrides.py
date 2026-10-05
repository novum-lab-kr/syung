#!/usr/bin/env python3
"""Put chosen stations back on their platform: data/osm-tracks/stop_overrides.json → track_shapes.json.

build_track_shapes.py places each stop from the station point, then re-centres it on the station's
exits and on nearby platform areas; at some stations that moved it 100–270 m along the track
(2026-09-30 audit: 2호선 홍대입구, 8호선 잠실, 5호선 마곡, 6호선 화랑대, …). For those, the stop is
set from OSM's stop_position nodes of that line (the trains' stopping points, one per direction:
their middle is the platform's middle), projected onto the line's track, and the station's edges
are cut and joined again at that point.
stop_overrides.json: {"<line>|<station name>": [lng, lat]} (the anchor; projected here), or
{"at": [lng, lat], "shift": true} to also slide the track under the station over to the anchor.
선택 칸(2026-10-05, 전 역 카카오 맞춤 0단계 · pipeline/fit_line_platforms.py 가 씀):
  "dir": [동, 북] 승강장 방향 단위 벡터 — stopDirs 에 넣고, build_track_shapes.orient_stations 가 거리 방향 대신 이 값을 따른다
  "half": 승강장 반 길이 m (OSM 승강장 면) — platformHalf, 그리고 stopHalf 가 이보다 짧으면 stopHalf
  "reach": [lng, lat] 출구가 승강장 한쪽 끝 밖에 몰린 역에서 그 끝을 늘린 통로 끝 — stopReach
Run after build_track_shapes.py (it calls apply() itself), or alone to patch track_shapes.json.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHAPES = ROOT / "data" / "osm-tracks" / "track_shapes.json"
OVERRIDES = ROOT / "data" / "osm-tracks" / "stop_overrides.json"
METRO = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"


def _xy(p, o):
    k = math.cos(math.radians(o[1]))
    return ((p[0] - o[0]) * k * 111320, (p[1] - o[1]) * 111320)


def _metres(a, b):
    return math.hypot(*_xy(a, b))


def _project(pts, q):
    """(segment index, point) on the polyline nearest q."""
    best = None
    for i in range(len(pts) - 1):
        ax, ay = _xy(pts[i], q); bx, by = _xy(pts[i + 1], q); vx, vy = bx - ax, by - ay
        l2 = vx * vx + vy * vy
        t = 0.0 if l2 == 0 else max(0.0, min(1.0, -(ax * vx + ay * vy) / l2))
        d = math.hypot(ax + vx * t, ay + vy * t)
        if best is None or d < best[0]:
            p = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]
            best = (d, i, p)
    return best


def move_stop(ts: dict, line: str, sid: int, anchor, shift: bool = False) -> tuple[float, float] | None:
    """Move stops[line:sid] onto the track nearest `anchor`, re-cutting its (one or two) edges.
    With `shift`, the track itself is slid over to the anchor around the station (full within
    SHIFT_FULL m, eased out by SHIFT_FADE m) and the stop sits on the anchor.
    At a junction (3+ edges) only `shift` works: every edge's station end slides over to the anchor.
    Returns (metres moved, anchor → track metres), or None at a junction without `shift`."""
    keys = [k for k in ts["edges"] if k.startswith(line + ":") and str(sid) in k.split(":")[1:] and k.count(":") == 2]
    keys = [k for k in keys if str(sid) in (k.split(":")[1], k.split(":")[2])]
    if len(keys) > 2 and shift:   # a junction (branch, loop): no single path to re-cut, slide every edge's station end over
        old = ts["stops"][f"{line}:{sid}"]
        o = _xy(anchor, old)
        rnd = lambda q: [round(q[0], 6), round(q[1], 6)]
        for k in keys:
            e = ts["edges"][k]
            far = e[0] if _metres(e[-1], old) < _metres(e[0], old) else e[-1]
            span = _metres(far, old)
            ts["edges"][k] = [rnd(_shifted(q, old, o, min(SHIFT_FULL, .35 * span), min(SHIFT_FADE, .8 * span))) for q in e]
        ts["stops"][f"{line}:{sid}"] = rnd(anchor)
        return _metres(old, anchor), 0.0
    if not 1 <= len(keys) <= 2:
        return None
    # each edge oriented to run into the station, then the path through it: in[0] … station … in[1] reversed
    ins = []
    for k in keys:
        _, lo, hi = k.split(":")
        pts = ts["edges"][k]
        ins.append((k, pts if int(hi) == sid else pts[::-1], int(hi) == sid))
    through = ins[0][1] + (ins[1][1][::-1][1:] if len(ins) == 2 else [])
    d, i, p = _project(through, anchor)
    old = ts["stops"][f"{line}:{sid}"]
    first, second = through[:i + 1] + [p], [p] + through[i + 1:]   # neighbour → station, station → neighbour
    rnd = lambda q: [round(q[0], 6), round(q[1], 6)]
    k0, _, hi0 = ins[0]
    ts["edges"][k0] = [rnd(q) for q in (first if hi0 else first[::-1])]
    if len(ins) == 2:
        k1, _, hi1 = ins[1]
        ts["edges"][k1] = [rnd(q) for q in (second[::-1] if hi1 else second)]
    ts["stops"][f"{line}:{sid}"] = rnd(p)
    if shift:   # OSM tunnel drawn beside the platform: slide the track over to the anchor near the station
        o = _xy(anchor, p)
        for k in keys:
            e = ts["edges"][k]
            far = e[0] if _metres(e[-1], p) < _metres(e[0], p) else e[-1]   # the neighbour's end stays put
            span = _metres(far, p)
            full, fade = min(SHIFT_FULL, .35 * span), min(SHIFT_FADE, .8 * span)
            ts["edges"][k] = [rnd(_shifted(q, p, o, full, fade)) for q in e]
        ts["stops"][f"{line}:{sid}"] = rnd(anchor)
    return _metres(old, ts["stops"][f"{line}:{sid}"]), d


SHIFT_FULL, SHIFT_FADE = 120, 250   # metres from the stop: moved all the way, then easing back onto the drawn track
# (scaled down on short edges, so the neighbouring station's end of the edge never moves)


def _shifted(q, p, o, full=SHIFT_FULL, fade=SHIFT_FADE):
    r = _metres(q, p)
    w = 1.0 if r <= full else max(0.0, 1 - (r - full) / max(1.0, fade - full))
    w = w * w * (3 - 2 * w)
    k = math.cos(math.radians(p[1]))
    return [q[0] + o[0] * w / (k * 111320), q[1] + o[1] * w / 111320]


def _entries():
    """(stop key "<line>:<id>", 원래 키 "<line>|<name>", 항목) — 역 이름을 못 찾으면 stop key 는 None."""
    if not OVERRIDES.exists():
        return []
    metro = json.loads(METRO.read_text(encoding="utf-8"))
    by_name = {(line, n["name"]): n["id"] for n in metro["nodes"] for line in n["lines"]}
    out = []
    for k, v in json.loads(OVERRIDES.read_text(encoding="utf-8")).items():
        if k.startswith("_"):
            continue
        line, name = k.split("|")
        sid = by_name.get((line, name))
        out.append((None if sid is None else f"{line}:{sid}", k, v))
    return out


def fixed_dirs() -> dict:
    """{"<line>:<id>": [동, 북]} — "dir" 칸이 있는 역. orient_stations 가 이 방향을 그대로 쓴다."""
    return {sk: v["dir"] for sk, _, v in _entries() if sk and isinstance(v, dict) and v.get("dir")}


def apply_extras(ts: dict, sk: str, v: dict) -> None:
    """"dir" · "half" · "reach" 칸을 track_shapes 의 stopDirs · platformHalf · stopHalf · stopReach 에 넣는다."""
    if v.get("dir"):
        ts.setdefault("stopDirs", {})[sk] = v["dir"]
    if v.get("half"):
        ph, sh = ts.setdefault("platformHalf", {}), ts.setdefault("stopHalf", {})
        # 출구로 늘어난 역 길이(stopHalf > platformHalf)는 남기고, 승강장 길이만큼은 보장
        exits_half = sh.get(sk, 0) if sh.get(sk, 0) > ph.get(sk, 0) else 0
        ph[sk] = v["half"]
        sh[sk] = max(v["half"], exits_half)
    if v.get("reach"):
        ts.setdefault("stopReach", {})[sk] = v["reach"]


def _trim_end(pts: list) -> list:
    """역 쪽 끝(pts[0] = 역 점)의 두 가지 찌꺼기를 걷어 낸다(2026-10-05 노선 검수).
    · 꼬리: 역 점을 승강장으로 옮긴 뒤(분기역은 끝만 평행 이동) 옛 역 점 너머 선로가 남아 갔다가 되돌아오는 것
      (1호선 구로–가산: 115 m 나갔다 돌아옴) — 뒤 선로가 역 점 곁(30 m 안, 지나온 길의 35 % 안)을 다시 지나면 그 앞을 잘라 잇는다
    · 말림: 역 30 m 안 선분이 그 너머로 가는 방향과 60° 넘게 어긋나는 것(1호선 화서–수원: 13 m 나갔다 감겨 돎) — 30 m 너머 첫 점에 바로 잇는다"""
    o = pts[0]
    xy = [_xy(q, o) for q in pts]
    length, best = 0.0, None
    for i in range(1, len(xy)):
        (ax, ay), (bx, by) = xy[i - 1], xy[i]
        vx, vy = bx - ax, by - ay
        seg = math.hypot(vx, vy)
        if length > 500:
            break
        t = max(0.0, min(1.0, -(ax * vx + ay * vy) / (seg * seg))) if seg else 0.0
        d, along = math.hypot(ax + vx * t, ay + vy * t), length + seg * t
        if i >= 2 and along > 15 and d < 30 and d < .35 * along and (best is None or along - d > best[1] - best[2]):
            best = (i, along, d, [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t])
        length += seg
    if best:
        i, _, d, q = best
        pts = [o] + ([] if d < 10 else [[round(q[0], 6), round(q[1], 6)]]) + pts[i:]
        xy = [_xy(q, o) for q in pts]
    j = next((k for k, q in enumerate(xy) if math.hypot(*q) > 30), None)
    if j and j >= 2:
        head = math.atan2(*xy[j])
        for k in range(1, j + 1):
            (ax, ay), (bx, by) = xy[k - 1], xy[k]
            if math.hypot(bx - ax, by - ay) < .3 or math.hypot(ax, ay) >= 30:
                continue
            dev = abs((math.atan2(bx - ax, by - ay) - head + math.pi) % (2 * math.pi) - math.pi)
            if math.degrees(dev) > 60:
                return [o] + pts[j:]
    return pts


EASE_JOIN_M, EASE_MAX_OFF_M = 120, 25


def _at(xy: list, cum: list, s: float) -> tuple:
    """(x, y, 방향) — 지나온 길 s m 지점."""
    i = next((k for k in range(1, len(cum)) if cum[k] >= s), len(cum) - 1)
    t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) or 1)
    (ax, ay), (bx, by) = xy[i - 1], xy[i]
    l = math.hypot(bx - ax, by - ay) or 1
    return ax + (bx - ax) * t, ay + (by - ay) * t, ((bx - ax) / l, (by - ay) / l)


def _ease_end(pts: list, half: float) -> list:
    """승강장 끝(half m)에서 EASE_JOIN_M 앞까지 선로가 승강장 줄에서 비켜 S자로 꺾여 들면(1호선 온수: 띠 끝 27 m 안에서
    39° 꺾였다 되돌아감 — 승강장을 OSM 승강장 쪽으로 옮긴 만큼 선로와 어긋남) 승강장 방향에서 출발해 그 지점 선로 방향으로
    들어가는 3차 Hermite 곡선으로 바꾼다. 새 곡선이 원래 선로에서 EASE_MAX_OFF_M 넘게 벗어나면 그대로 둔다."""
    o = pts[0]
    xy = [_xy(q, o) for q in pts]
    cum = [0.0]
    for a, b in zip(xy, xy[1:]):
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    s0, s1 = half, half + EASE_JOIN_M
    if cum[-1] < s1 + 60 or half < 20:
        return pts
    x0, y0, _ = _at(xy, cum, s0)
    bx, by, _ = _at(xy, cum, s0 - 20)
    l = math.hypot(x0 - bx, y0 - by) or 1
    t0 = ((x0 - bx) / l, (y0 - by) / l)
    x1, y1, _ = _at(xy, cum, s1)
    fx, fy, _ = _at(xy, cum, s1 + 20)
    l = math.hypot(fx - x1, fy - y1) or 1
    t1 = ((fx - x1) / l, (fy - y1) / l)
    # 원래 길의 S자 정도: 방향 변화 합 − 알짜 변화(°)
    heads = []
    for k in range(int(s0) - 20, int(s1), 5):   # 승강장 끝 20 m 안쪽부터(꺾임이 끝에서 바로 시작하는 역)
        ax, ay, _ = _at(xy, cum, k)
        cx, cy, _ = _at(xy, cum, k + 5)
        heads.append(math.atan2(cx - ax, cy - ay))
    turns = [((b - a + math.pi) % (2 * math.pi)) - math.pi for a, b in zip(heads, heads[1:])]
    if math.degrees(sum(map(abs, turns)) - abs(sum(turns))) < 30:
        return pts
    L = math.hypot(x1 - x0, y1 - y0)
    curve = []
    for k in range(1, 12):
        t = k / 12
        h00, h10, h01, h11 = 2 * t ** 3 - 3 * t * t + 1, t ** 3 - 2 * t * t + t, -2 * t ** 3 + 3 * t * t, t ** 3 - t * t
        curve.append((h00 * x0 + h10 * L * t0[0] + h01 * x1 + h11 * L * t1[0], h00 * y0 + h10 * L * t0[1] + h01 * y1 + h11 * L * t1[1]))
    def off(q):
        best = 1e9
        for a, b in zip(xy, xy[1:]):
            vx, vy = b[0] - a[0], b[1] - a[1]
            l2 = vx * vx + vy * vy
            t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / l2))
            best = min(best, math.hypot(q[0] - a[0] - vx * t, q[1] - a[1] - vy * t))
        return best
    if max(off(q) for q in curve) > EASE_MAX_OFF_M:
        return pts
    k = math.cos(math.radians(o[1]))
    ll = lambda q: [round(o[0] + q[0] / (k * 111320), 6), round(o[1] + q[1] / 111320, 6)]
    head = [pts[i] for i in range(len(pts)) if cum[i] < s0]
    tail = [pts[i] for i in range(len(pts)) if cum[i] > s1]
    return head + [ll((x0, y0))] + [ll(q) for q in curve] + [ll((x1, y1))] + tail


def ease_platform_ends(ts: dict, keys) -> list:
    """stop_overrides 로 옮긴 역(keys: "<line>:<id>")의 양쪽 구간에 _ease_end — 고친 "구간 @ 역" 목록."""
    fixed = []
    half = ts.get("platformHalf", {})
    for sk in keys:
        line, sid = sk.rsplit(":", 1)
        for k, e in ts["edges"].items():
            _, lo, hi = k.rsplit(":", 2)
            if not k.startswith(line + ":") or sid not in (lo, hi) or sk not in half:
                continue
            new = _ease_end(e, half[sk]) if lo == sid else _ease_end(e[::-1], half[sk])[::-1]
            if new != e:
                ts["edges"][k] = new
                fixed.append(f"{k} @ {sk}")
    return fixed


def trim_station_ends(ts: dict) -> list:
    """모든 구간의 양 끝에 _trim_end — 고친 구간 키 목록."""
    fixed = []
    for k, e in ts["edges"].items():
        if len(e) < 3:
            continue
        new = _trim_end(e)
        new = _trim_end(new[::-1])[::-1] if len(new) >= 3 else new
        if new != e:
            ts["edges"][k] = new
            fixed.append(k)
    return fixed


def apply(ts: dict) -> list:
    done = []
    for sk, k, anchor in _entries():
        line = k.split("|")[0]
        sid = None if sk is None else int(sk.rsplit(":", 1)[1])
        shift = isinstance(anchor, dict) and anchor.get("shift")
        extra = anchor if isinstance(anchor, dict) else {}
        anchor = anchor["at"] if isinstance(anchor, dict) else anchor
        r = move_stop(ts, line, sid, anchor, bool(shift)) if sid is not None and f"{line}:{sid}" in ts["stops"] else None
        if r is not None:
            apply_extras(ts, sk, extra)
        done.append((k, None if r is None else (round(r[0]), round(r[1]))))
    for k in trim_station_ends(ts):
        done.append((f"trim {k}", (0, 0)))
    for k in ease_platform_ends(ts, [sk for sk, _, v in _entries() if sk and isinstance(v, dict) and v.get("shift")]):
        done.append((f"ease {k}", (0, 0)))
    return done


if __name__ == "__main__":
    ts = json.loads(SHAPES.read_text(encoding="utf-8"))
    for k, r in apply(ts):
        print(k, "skipped" if r is None else f"moved {r[0]} m (anchor {r[1]} m off the track)")
    SHAPES.write_text(json.dumps(ts, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
