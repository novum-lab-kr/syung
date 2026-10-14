"""탑승 기록의 가속도 센서(motion 사건)에서 섰다 · 떠났다를 찾는다 — 사람이 누른 도착 · 출발과 비교하려고(덕배 2026-10-12, 시험판).

motion 사건의 m: 0.1초 칸마다 [사건 t 기준 ms, 중력 포함 가속 x y z, 중력 뺀 가속 x y z, 회전 α β γ] 를 이어 붙인 숫자.
1. 칸마다 중력 방향(중력 포함 − 중력 뺀 가속)을 구해 가속에서 수평 성분만 남긴다(휴대폰을 어떻게 쥐어도 땅 기준).
2. 2초 평균 벡터: 손 떨림은 방향이 들쭉날쭉해 상쇄되고, 열차의 출발 · 감속처럼 한 방향으로 이어지는 힘만 남는다.
3. 그 크기가 ON 을 넘어 MIN_PULSE 초 이상 이어지고 PEAK 를 한 번 넘으면 한 번의 '밀림'.
4. 밀림의 차례로 읽는다(방향은 앞 밀림과 같은 쪽인지만 본다 — 휴대폰을 돌려 쥐어도 된다):
   - 섰다 = 감속 밀림 바로 뒤(HUMP_GAP 초 안)에 반대 방향 밀림이 생기고 그 뒤 STAND 초 넘게 조용할 때, 그 반대 밀림이 시작한 때.
     휴대폰이 주는 '중력 뺀 가속'은 중력을 천천히 따라가며 추정해서, 긴 감속 동안 중력 추정이 기울었다가 열차가 서는 순간
     반대쪽 가속처럼 보이며 10~20초에 걸쳐 사그라든다(되튐). 옛 규칙은 이 되튐을 출발로 읽어 첫 탑승에서 29개를 잡았다.
   - 떠났다 = 그렇게 선 뒤 STAND 초 넘게 조용하다 처음 밀린 때(되튐과 같은 쪽). 탑승의 첫 밀림도 출발.
   - 출발 가속이 끝날 때도 같은 되튐이 생긴다: 출발 바로 뒤 반대 밀림은 섰다가 아니다.
   - 되튐 없이 '감속 → 조용 → 반대로 밀림'도 섰다로 읽게 해 봤더니 달리다 한 번 더 밀린 것을 역으로 잡아(청담 29초 일찍) 뺐다.
     되튐은 중력을 추정하는 모든 기기에 생긴다(중력 뺀 값이 없는 기기는 _horizontal 이 같은 식으로 추정한다).
   맞춘 근거: 7호선 두 번 탑승(10-13 · 10-14, 누름 40번)에서 센서 − 누름 가운데 도착 −1.1초 · 출발 −0.8초(사람이 1초쯤 늦게 누른다),
   40번 중 37번이 5초 안, 누름 없는 센서 사건 0. 놓친 것: 끝 역 하나, 출발 하나, 출발 전에 한 번 더 밀린 역 하나(26초 일찍).
한계: 같은 노선 두 번으로만 맞췄다 — 다른 노선 · 버스 · 다른 휴대폰은 탑승 기록으로 다시 본다.
"""
from __future__ import annotations

import math

BIN_MS = 100
WINDOW = 20          # 2초 평균(칸)
ON, OFF = 0.3, 0.15  # m/s² — 열차 출발 · 감속은 약 0.5~1.0, 서 있으면 0 가까이
MIN_PULSE = 2.0      # 초 — 열차 가속 · 감속은 8초 넘게 이어진다, 손으로 흔든 것은 짧다(되튐이 2~3초로 짧은 역도 있다)
MERGE = 1.0          # 초 — 같은 방향 밀림 사이가 이보다 짧으면 한 번으로
PEAK = 0.45          # m/s² — 이보다 약한 밀림은 버린다(폰 만짐 · 작은 흔들림)
HUMP_GAP = 9.0       # 초 — 감속 끝에서 되튐 시작까지
STAND = 6.0          # 초 — 역에 서 있다고 볼 조용한 시간(되튐이 끝난 뒤. 실제 두 탑승에선 13초 넘게, 6~10 은 결과가 같았다)


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
    pulses = [p for p in _pulses(sm) if p["peak"] >= PEAK]
    out, last_depart, hump = [], None, None
    same = lambda a, b: sum(x * y for x, y in zip(a["dir"], b["dir"]))
    for i, p in enumerate(pulses):
        prev = pulses[i - 1] if i else None
        nxt = pulses[i + 1] if i + 1 < len(pulses) else None
        before = (p["start"] - prev["last"]) / 1000 if prev else math.inf
        after = (nxt["start"] - p["last"]) / 1000 if nxt else math.inf
        if prev is not None and prev is not last_depart and before <= HUMP_GAP and same(prev, p) < -0.5 and after >= STAND:
            out.append({"kind": "arrive", "t": round(p["start"])}); hump = p   # 감속 → 되튐 → 조용
        elif prev is None or (before >= STAND and (prev is hump and same(prev, p) > 0.3)):
            out.append({"kind": "depart", "t": round(p["start"])}); last_depart = p
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
