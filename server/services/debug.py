"""디버깅 페이지(주인만, 2026-10-12 덕배): 지하철 · 버스를 탈 때 실제 도착 · 출발(정답)과 GPS, 캡처를 받아 남긴다.

그 기록을 원자료(샘플러 · 버스 기록)와 맞춰 정확도(늦음 · 정차 · 감속)를 실측으로 고친다.
받은 값은 정해진 칸 · 길이 · 범위만 남기고 나머지는 버린다(아무 JSON 이나 쌓이지 않게).
"""
from __future__ import annotations

import json
import math
import time
from datetime import datetime
from typing import TYPE_CHECKING, Any, cast

from server.clock import KST
from server.services.ride_motion import detect
from server.store.debug_log import DebugStore

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable

RIDE_KINDS = {"start", "gps", "arrive", "depart", "end", "mark", "motion"}
CANCEL_NOTE = "바로 앞 도착 · 출발 취소"   # 디버깅 페이지가 이미 보낸 누름을 취소할 때 남기는 표시(debug.html undo)
MODES = {"subway", "bus"}
MAX_EVENTS = 1000
SHOT_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic", "video/mp4": "mp4",
              "video/quicktime": "mov", "video/webm": "webm"}
MAX_SHOT_BYTES = 40 * 1024 * 1024
TEXT = {"ride": 40, "line": 40, "routeId": 20, "routeName": 20, "station": 60, "train": 20, "vehicle": 20, "note": 300}
MOTION_VALUES = 1500   # motion 한 사건의 m 길이 상한(10 Hz × 5초 × 10칸 = 500)
NUMBER = {"t": (1.6e12, 4.1e12), "lat": (33.0, 39.0), "lng": (124.0, 132.0), "acc": (0, 1e5), "speed": (0, 100), "heading": (0, 360)}


class BadRequest(ValueError):
    """사람이 읽을 고정 문구만 싣는다."""


def clean_event(raw: object) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise BadRequest("사건 모양이 아니에요")
    raw = cast("dict[str, Any]", raw)   # JSON 객체 — 키는 늘 글자
    kind, mode = raw.get("kind"), raw.get("mode")
    if kind not in RIDE_KINDS or mode not in MODES:
        raise BadRequest("kind · mode 가 아니에요")
    event: dict[str, Any] = {"kind": kind, "mode": mode}
    for key, size in TEXT.items():
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            event[key] = value.strip()[:size]
    for key, (lo, hi) in NUMBER.items():
        value = raw.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and lo <= value <= hi:
            event[key] = round(float(value), 7 if key in ("lat", "lng") else 1)
    if kind == "motion":
        # 가속도 센서 묶음: m = 0.1초 칸마다 [t 기준 ms, 중력 포함 가속 x y z, 중력 뺀 가속 x y z, 회전 α β γ] 를 이어 붙인 숫자(없는 값은 null)
        m = raw.get("m")
        if not isinstance(m, list) or not m or len(cast("list[Any]", m)) > MOTION_VALUES:
            raise BadRequest(f"motion 의 m 은 1~{MOTION_VALUES}개예요")
        m = cast("list[Any]", m)   # 위에서 list 인지 봤다
        event["m"] = [None if v is None else round(float(v), 2) for v in m
                      if v is None or (isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and abs(v) <= 1e5)]
        if len(event["m"]) != len(m):
            raise BadRequest("motion 의 m 은 숫자 · null 만 돼요")
    if "t" not in event or "ride" not in event:
        raise BadRequest("시각(t) · 탑승(ride) 이 없어요")
    return event


class DebugService:
    def __init__(self, store: DebugStore, *, bus_routes: Callable[[], dict[str, dict[str, Any]]] = lambda: {}, clock: Callable[[], float] = time.time):
        self.store, self.bus_routes, self.clock = store, bus_routes, clock

    def record_ride(self, body: bytes) -> dict[str, Any]:
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise BadRequest("JSON 이 아니에요") from None
        raw = cast("dict[str, Any]", payload).get("events") if isinstance(payload, dict) else None
        if not isinstance(raw, list) or not raw or len(cast("list[Any]", raw)) > MAX_EVENTS:
            raise BadRequest(f"events 는 1~{MAX_EVENTS}개예요")
        raw = cast("list[Any]", raw)   # 위에서 list 인지 봤다
        now = self.clock()
        events = [{**clean_event(e), "receivedAt": round(now * 1000)} for e in raw]
        self.store.append_rides(events, now)
        return {"ok": True, "saved": len(events)}

    def save_shot(self, data: bytes, content_type: str, note: str, state: str) -> dict[str, Any]:
        ext = SHOT_TYPES.get((content_type or "").split(";")[0].strip().lower())
        if not ext:
            raise BadRequest("사진(PNG · JPG · WEBP · HEIC) · 동영상(MP4 · MOV · WEBM)만 돼요")
        if not data or len(data) > MAX_SHOT_BYTES:
            raise BadRequest("파일이 비었거나 40MB 를 넘어요")
        try:
            parsed: object = json.loads(state) if state else {}
        except ValueError:
            parsed = {}
        meta: dict[str, Any] = {"at": round(self.clock() * 1000), "type": ext, "bytes": len(data), "note": (note or "")[:2000],
                "state": parsed if isinstance(parsed, dict) and len(state) <= 8000 else {}}
        name = self.store.save_shot(data, ext, meta, self.clock())
        return {"ok": True, "file": name}

    def recent(self, day: str = "") -> dict[str, Any]:
        """그날(YYYYMMDD, 없거나 이상하면 오늘)의 탑승 기록 요약 · 기록이 있는 날 목록 · 최근 캡처."""
        today = datetime.fromtimestamp(self.clock(), KST).strftime("%Y%m%d")
        day = day if len(day) == 8 and day.isdigit() else today
        rides: dict[str, dict[str, Any]] = {}
        motions: dict[str, list[dict[str, Any]]] = {}
        for e in self.store.recent_rides(day):
            if e["kind"] == "motion":
                motions.setdefault(e["ride"], []).append(e)
            r = rides.setdefault(e["ride"], {"ride": e["ride"], "mode": e["mode"], "line": e.get("line") or e.get("routeName"),
                                             "from": e["t"], "to": e["t"], "stops": 0, "gps": 0, "taps": []})
            if e["kind"] in ("arrive", "depart"):
                r["taps"].append({"kind": e["kind"], "t": e["t"], "station": e.get("station")})
                r["stops"] += e["kind"] == "arrive"
            elif e["kind"] == "mark" and e.get("note") == CANCEL_NOTE:   # 이미 보낸 누름을 '방금 것 취소': 그 앞 마지막 누름을 뺀다
                before = [i for i, tap in enumerate(r["taps"]) if tap["t"] <= e["t"]]
                if before:
                    r["stops"] -= r["taps"].pop(before[-1])["kind"] == "arrive"
            r["to"] = max(r["to"], e["t"])
            r["gps"] += e["kind"] == "gps"
        for ride_id, r in rides.items():   # 센서가 잡은 섰다 · 떠났다(시험판, ride_motion)
            if ride_id in motions:
                found = detect(motions[ride_id])
                r["sensor"], r["series"] = found["events"], found["series"]
        shots = [{k: s.get(k) for k in ("at", "type", "bytes", "note", "file")} for s in self.store.recent_shots(20)]
        days = sorted(set(self.store.ride_days()) | {today}, reverse=True)
        return {"day": day, "days": days, "rides": sorted(rides.values(), key=lambda r: -r["from"]), "shots": shots}

    def find_bus_route(self, name: str) -> dict[str, Any]:
        name = (name or "").strip()[:20]
        if not name:
            return {"routes": []}
        found = [r for r in self.bus_routes().values() if str(r.get("name", "")).startswith(name)]
        found.sort(key=lambda r: (r.get("name") != name, len(str(r.get("name"))), str(r.get("name"))))
        return {"routes": [{"id": r["id"], "name": r.get("name"), "start": r.get("start"), "end": r.get("end")} for r in found[:10]]}
