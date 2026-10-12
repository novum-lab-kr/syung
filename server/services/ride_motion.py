"""탑승 기록의 가속도 센서(motion 사건)에서 섰다 · 떠났다를 찾는다 — 사람이 누른 도착 · 출발과 비교하려고(덕배 2026-10-12, 시험판).

motion 사건의 m: 0.1초 칸마다 [사건 t 기준 ms, 중력 포함 가속 x y z, 중력 뺀 가속 x y z, 회전 α β γ] 를 이어 붙인 숫자.
1. 칸마다 중력 방향(중력 포함 − 중력 뺀 가속)을 구해 가속에서 수평 성분만 남긴다(휴대폰을 어떻게 쥐어도 땅 기준).
2. 2초 평균 벡터: 손 떨림은 방향이 들쭉날쭉해 상쇄되고, 열차의 출발 · 감속처럼 한 방향으로 이어지는 힘만 남는다.
3. 그 크기가 ON 을 넘어 MIN_PULSE 초 이상 이어지면 한 번의 '밀림'. 처음 밀림 = 출발 방향, 같은 쪽이면 가속 · 반대쪽이면 감속.
4. 감속이 끝난 때 = 섰다, 선 뒤 첫 가속이 시작한 때 = 떠났다. 서지 않고 다시 감속하면 마지막 감속을 쓴다.
한계: 휴대폰을 크게 돌리면 방향이 틀릴 수 있다. 달리다 속도만 줄였다 다시 내면 섰다 · 떠났다로 잘못 잡을 수 있다.
"""
from __future__ import annotations

import math

BIN_MS = 100
WINDOW = 20          # 2초 평균(칸)
ON, OFF = 0.3, 0.15  # m/s² — 열차 출발 · 감속은 약 0.5~1.0, 서 있으면 0 가까이
MIN_PULSE = 3.0      # 초 — 열차 가속 · 감속은 8초 넘게 이어진다, 손으로 흔든 것은 짧다
MERGE = 1.0          # 초 — 같은 방향 밀림 사이가 이보다 짧으면 한 번으로


def _bins(events: list[dict]) -> list[tuple[float, tuple, tuple]]:
    """(시각 ms, 중력 포함 가속, 중력 뺀 가속 | None) — 시각 차례."""
    out = []
    for e in events:
        m = e.get("m") or []
        for i in range(0, len(m) - 9, 10):
            off, gx, gy, gz, ax, ay, az = m[i:i + 7]
            if None in (off, gx, gy, gz):
                continue
            lin = (ax, ay, az) if None not in (ax, ay, az) else None
            out.append((e["t"] + off, (gx, gy, gz), lin))
    out.sort(key=lambda b: b[0])
    return out


def _horizontal(bins) -> list[tuple[float, tuple]]:
    """칸마다 수평 가속 벡터(휴대폰 좌표, 중력 성분 뺌)."""
    out, low = [], None
    for t, g, lin in bins:
        if lin is None:   # 중력 뺀 값이 없는 기기: 중력 포함 값의 느린 평균을 중력으로(약 3초)
            low = g if low is None else tuple(l + (x - l) * 0.033 for l, x in zip(low, g))
            lin, grav = tuple(x - l for x, l in zip(g, low)), low
        else:
            grav = tuple(x - a for x, a in zip(g, lin))
        n = math.sqrt(sum(x * x for x in grav)) or 1.0
        u = tuple(x / n for x in grav)
        up = sum(a * x for a, x in zip(lin, u))
        out.append((t, tuple(a - up * x for a, x in zip(lin, u))))
    return out


def _smooth(h) -> list[tuple[float, tuple, float]]:
    """2초 가운데 평균 벡터와 그 크기. 칸 사이가 1초 넘게 비면(화면 꺼짐) 거기서 끊는다."""
    out = []
    for i, (t, _) in enumerate(h):
        lo, hi = max(0, i - WINDOW // 2), min(len(h), i + WINDOW // 2)
        part = [v for tt, v in h[lo:hi] if abs(tt - t) <= WINDOW * BIN_MS / 2 + 1]
        s = tuple(sum(v[k] for v in part) / len(part) for k in range(3))
        out.append((t, s, math.sqrt(sum(x * x for x in s))))
    return out


def _pulses(sm) -> list[dict]:
    pulses, cur = [], None
    for t, s, mag in sm:
        if cur and (mag < OFF or t - cur["last"] > 1000):
            pulses.append(cur); cur = None
        if mag >= ON and cur is None:
            cur = {"start": t, "last": t, "sum": [0.0, 0.0, 0.0], "peak": 0.0}
        if cur and mag >= OFF:
            cur["last"] = t; cur["peak"] = max(cur["peak"], mag)
            for k in range(3):
                cur["sum"][k] += s[k]
    if cur:
        pulses.append(cur)
    pulses = [p for p in pulses if (p["last"] - p["start"]) / 1000 >= MIN_PULSE]
    for p in pulses:
        n = math.sqrt(sum(x * x for x in p["sum"])) or 1.0
        p["dir"] = tuple(x / n for x in p["sum"])
    merged = []
    for p in pulses:
        q = merged[-1] if merged else None
        if q and (p["start"] - q["last"]) / 1000 < MERGE and sum(a * b for a, b in zip(p["dir"], q["dir"])) > 0.5:
            q["last"] = p["last"]; q["peak"] = max(q["peak"], p["peak"])
            continue
        merged.append(p)
    return merged


def detect(events: list[dict]) -> dict:
    """motion 사건들 → {"events": [{"kind": "arrive"|"depart", "t": ms}], "series": [[ms, 부호 붙은 m/s²], …](1초마다)}.
    series 의 부호: 출발 방향 +, 감속 −."""
    sm = _smooth(_horizontal(_bins(events)))
    if not sm:
        return {"events": [], "series": []}
    pulses, out, ref, stopped = _pulses(sm), [], None, True
    pending_arrive = None
    for p in pulses:
        if ref is None:
            ref = p["dir"]   # 처음 밀림은 출발(역에 서 있다가 탑승 시작)
        accel = sum(a * b for a, b in zip(p["dir"], ref)) > 0
        ref = p["dir"] if accel else tuple(-x for x in p["dir"])   # 휴대폰이 천천히 돌아도 따라간다
        if accel:
            if pending_arrive is not None:
                out.append({"kind": "arrive", "t": round(pending_arrive)}); pending_arrive = None; stopped = True
            if stopped:
                out.append({"kind": "depart", "t": round(p["start"])}); stopped = False
        else:
            pending_arrive = p["last"]   # 서지 않고 또 감속하면 마지막 것
    if pending_arrive is not None:
        out.append({"kind": "arrive", "t": round(pending_arrive)})
    # 1초마다 그래프 점(출발 방향 기준 부호)
    series, ref2, next_t, pi = [], None, sm[0][0], 0
    dirs = [(p["start"], p["dir"]) for p in pulses]
    first = dirs[0][1] if dirs else (1.0, 0.0, 0.0)
    ref2 = first
    for t, s, mag in sm:
        while pi < len(pulses) and pulses[pi]["start"] <= t:
            d = pulses[pi]["dir"]; ref2 = d if sum(a * b for a, b in zip(d, ref2)) > 0 else tuple(-x for x in d); pi += 1
        if t >= next_t:
            sign = 1 if sum(a * b for a, b in zip(s, ref2)) >= 0 else -1
            series.append([round(t), round(sign * mag, 2)])
            next_t = t + 1000
    return {"events": out, "series": series}
