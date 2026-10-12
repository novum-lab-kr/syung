"""디버깅 페이지(주인만, 2026-10-12 덕배): 지하철 · 버스를 탈 때 실제 도착 · 출발(정답)과 GPS, 캡처를 받아 남긴다.

그 기록을 원자료(샘플러 · 버스 기록)와 맞춰 정확도(늦음 · 정차 · 감속)를 실측으로 고친다.
받은 값은 정해진 칸 · 길이 · 범위만 남기고 나머지는 버린다(아무 JSON 이나 쌓이지 않게).
"""
from __future__ import annotations

import json
import math
import time
from datetime import datetime

from server.clock import KST
from server.store.debug_log import DebugStore

RIDE_KINDS = {"start", "gps", "arrive", "depart", "end", "mark"}
MODES = {"subway", "bus"}
MAX_EVENTS = 1000
SHOT_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic", "video/mp4": "mp4",
              "video/quicktime": "mov", "video/webm": "webm"}
MAX_SHOT_BYTES = 40 * 1024 * 1024
TEXT = {"ride": 40, "line": 40, "routeId": 20, "routeName": 20, "station": 60, "train": 20, "vehicle": 20, "note": 300}
NUMBER = {"t": (1.6e12, 4.1e12), "lat": (33.0, 39.0), "lng": (124.0, 132.0), "acc": (0, 1e5), "speed": (0, 100), "heading": (0, 360)}


class BadRequest(ValueError):
    """사람이 읽을 고정 문구만 싣는다."""


def clean_event(raw) -> dict:
    if not isinstance(raw, dict):
        raise BadRequest("사건 모양이 아니에요")
    kind, mode = raw.get("kind"), raw.get("mode")
    if kind not in RIDE_KINDS or mode not in MODES:
        raise BadRequest("kind · mode 가 아니에요")
    event = {"kind": kind, "mode": mode}
    for key, size in TEXT.items():
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            event[key] = value.strip()[:size]
    for key, (lo, hi) in NUMBER.items():
        value = raw.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and lo <= value <= hi:
            event[key] = round(float(value), 7 if key in ("lat", "lng") else 1)
    if "t" not in event or "ride" not in event:
        raise BadRequest("시각(t) · 탑승(ride) 이 없어요")
    return event


class DebugService:
    def __init__(self, store: DebugStore, *, bus_routes=lambda: {}, clock=time.time):
        self.store, self.bus_routes, self.clock = store, bus_routes, clock

    def record_ride(self, body: bytes) -> dict:
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise BadRequest("JSON 이 아니에요") from None
        raw = payload.get("events") if isinstance(payload, dict) else None
        if not isinstance(raw, list) or not raw or len(raw) > MAX_EVENTS:
            raise BadRequest(f"events 는 1~{MAX_EVENTS}개예요")
        now = self.clock()
        events = [{**clean_event(e), "receivedAt": round(now * 1000)} for e in raw]
        self.store.append_rides(events, now)
        return {"ok": True, "saved": len(events)}

    def save_shot(self, data: bytes, content_type: str, note: str, state: str) -> dict:
        ext = SHOT_TYPES.get((content_type or "").split(";")[0].strip().lower())
        if not ext:
            raise BadRequest("사진(PNG · JPG · WEBP · HEIC) · 동영상(MP4 · MOV · WEBM)만 돼요")
        if not data or len(data) > MAX_SHOT_BYTES:
            raise BadRequest("파일이 비었거나 40MB 를 넘어요")
        try:
            parsed = json.loads(state) if state else {}
        except ValueError:
            parsed = {}
        meta = {"at": round(self.clock() * 1000), "type": ext, "bytes": len(data), "note": (note or "")[:2000],
                "state": parsed if isinstance(parsed, dict) and len(state) <= 8000 else {}}
        name = self.store.save_shot(data, ext, meta, self.clock())
        return {"ok": True, "file": name}

    def recent(self) -> dict:
        today = datetime.fromtimestamp(self.clock(), KST).strftime("%Y%m%d")
        rides: dict[str, dict] = {}
        for e in self.store.recent_rides(today):
            r = rides.setdefault(e["ride"], {"ride": e["ride"], "mode": e["mode"], "line": e.get("line") or e.get("routeName"),
                                             "from": e["t"], "to": e["t"], "stops": 0, "gps": 0})
            r["to"] = max(r["to"], e["t"])
            r["stops"] += e["kind"] == "arrive"
            r["gps"] += e["kind"] == "gps"
        shots = [{k: s.get(k) for k in ("at", "type", "bytes", "note", "file")} for s in self.store.recent_shots(20)]
        return {"rides": sorted(rides.values(), key=lambda r: -r["from"]), "shots": shots}

    def find_bus_route(self, name: str) -> dict:
        name = (name or "").strip()[:20]
        if not name:
            return {"routes": []}
        found = [r for r in self.bus_routes().values() if str(r.get("name", "")).startswith(name)]
        found.sort(key=lambda r: (r.get("name") != name, len(str(r.get("name"))), str(r.get("name"))))
        return {"routes": [{"id": r["id"], "name": r.get("name"), "start": r.get("start"), "end": r.get("end")} for r in found[:10]]}
