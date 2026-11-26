"""디버깅 페이지(주인만, 2026-10-12 덕배): 지하철 · 버스를 탈 때 실제 도착 · 출발(정답)과 GPS, 캡처를 받아 남긴다.

그 기록을 원자료(샘플러 · 버스 기록)와 맞춰 정확도(늦음 · 정차 · 감속)를 실측으로 고친다.
받은 값은 정해진 칸 · 길이 · 범위만 남기고 나머지는 버린다(아무 JSON 이나 쌓이지 않게).
개발자 회원의 지도 타고 가기 기록(2026-11-11, POST /api/me/rides)도 같은 자리 · 같은 모양으로 남긴다 — 서버가 source:"map" 을 붙이고,
지도만 보내는 사건 둘을 더 받는다: judge(앱 판정 — state 글자) · answer(개발자가 누른 정답 — answer "rode" | "not_rode").
로그인 안 한 사람(과 개발자 아닌 회원)의 지도 기록(2026-11-26 사용자 C안)도 같은 자리 · 같은 모양으로 남긴다 — 회원번호 대신
웹이 만든 무작위 기기 id 를 본문 device 로 받아 사건마다 device 를 붙인다(형식 DEVICE). 로그인 없이 열린 쓰기 길이라
주소(IP · IPv6 는 /64 로 묶어)마다 ANON_WINDOW 초에 ANON_TRIES 번까지, 모두 합쳐 하루(한국 날짜) ANON_DAY_BYTES 까지만 받는다
(allow_anonymous — 본문을 읽기 전에 센다. 하루 합계는 record_ride 가 저장 전에 같은 잠금 안에서 본문 크기만큼 예약하고
 넘으면 DayFull · 저장이 실패하면 되돌린다. 메모리에만 — 서버를 다시 켜면 0 부터).
기록은 KEEP_DAYS 일 지나면 지운다(jobs/debug_prune.py — 디버깅 페이지 기록 · 캡처도 같이).
"""
from __future__ import annotations

import ipaddress
import json
import math
import re
import threading
import time
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, cast

from server.clock import KST
from server.services.ride_motion import detect
from server.store.debug_log import DebugStore

if TYPE_CHECKING:   # 타입만
    from collections.abc import Callable

RIDE_KINDS = {"start", "gps", "arrive", "depart", "end", "mark", "motion"}
MAP_KINDS = RIDE_KINDS | {"judge", "answer"}   # 지도 타고 가기(source "map")만 보내는 사건
MAP_SOURCE = "map"
ANSWERS = {"rode", "not_rode"}   # [탔음] · [안 탔음]
KEEP_DAYS = 90   # 탑승 기록 · 캡처를 남기는 날 수(2026-11-11 사용자 D4)
CANCEL_NOTE = "바로 앞 도착 · 출발 취소"   # 디버깅 페이지가 이미 보낸 누름을 취소할 때 남기는 표시(debug.html undo)
MODES = {"subway", "bus"}
MAX_EVENTS = 1000
SHOT_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic", "video/mp4": "mp4",
              "video/quicktime": "mov", "video/webm": "webm"}
MAX_SHOT_BYTES = 40 * 1024 * 1024
TEXT = {"ride": 40, "line": 40, "routeId": 20, "routeName": 20, "station": 60, "train": 20, "vehicle": 20, "note": 300}
STATE_TEXT = 40   # judge 의 state 길이 상한
MOTION_VALUES = 1500   # motion 한 사건의 m 길이 상한(10 Hz × 5초 × 10칸 = 500)
DEVICE = re.compile(r"[A-Za-z0-9_-]{16,64}")   # 익명 기기 id(웹 crypto.randomUUID() 36자가 들어가게)
ANON_TRIES, ANON_WINDOW = 12, 60   # 익명 기록: 주소마다 60초에 12번(웹은 15초마다 + 정답 · 도착 때 한 번 더 보낸다)
ANON_DAY_BYTES = 100 * 1024 * 1024   # 익명 기록 본문 하루 합계 상한(주소를 바꿔 가며 보내도 디스크가 차지 않게 · 90일 보관이면 9 GB 까지)
NUMBER = {"t": (1.6e12, 4.1e12), "lat": (33.0, 39.0), "lng": (124.0, 132.0), "acc": (0, 1e5), "speed": (0, 100), "heading": (0, 360)}


class BadRequest(ValueError):
    """사람이 읽을 고정 문구만 싣는다."""


class DayFull(Exception):
    """익명 기록 하루 합계(ANON_DAY_BYTES)를 이 본문이 넘긴다 — 부르는 쪽이 429 로 답한다."""


class MissingDevice(BadRequest):
    """익명 기록인데 본문에 device 가 없다 — 부르는 쪽이 옛 응답(401 · 403)으로 답한다(기기 id 를 모르는 옛 화면이 기록을 지우지 않게)."""


def clean_event(raw: object, kinds: set[str] = RIDE_KINDS) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise BadRequest("사건 모양이 아니에요")
    raw = cast("dict[str, Any]", raw)   # JSON 객체 — 키는 늘 글자
    kind, mode = raw.get("kind"), raw.get("mode")
    if kind not in kinds or mode not in MODES:
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
    if kind == "judge":
        state = raw.get("state")
        if not isinstance(state, str) or not state.strip():
            raise BadRequest("judge 에는 state(판정 글자)가 있어야 해요")
        event["state"] = state.strip()[:STATE_TEXT]
    if kind == "answer":
        if raw.get("answer") not in ANSWERS:
            raise BadRequest("answer 는 rode · not_rode 예요")
        event["answer"] = raw["answer"]
    if "t" not in event or "ride" not in event:
        raise BadRequest("시각(t) · 탑승(ride) 이 없어요")
    return event


def _address_key(address: str) -> str:
    """요청 수를 세는 열쇠: IPv4 는 그대로, IPv6 는 /64 망(한 집 · 한 기기가 끝자리를 바꿔 가며 한도를 피하지 못하게)."""
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return address
    if parsed.version == 6:
        return str(ipaddress.ip_network(f"{parsed}/64", strict=False))
    return str(parsed)


def _device(value: object) -> str:
    if value is None:
        raise MissingDevice("기기 표시(device)가 없어요")
    if not isinstance(value, str) or not DEVICE.fullmatch(value):
        raise BadRequest("기기 표시(device)는 영문 · 숫자 · - · _ 16~64자예요")
    return value


class DebugService:
    def __init__(self, store: DebugStore, *, bus_routes: Callable[[], dict[str, dict[str, Any]]] = lambda: {}, clock: Callable[[], float] = time.time):
        self.store, self.bus_routes, self.clock = store, bus_routes, clock
        self._tries: dict[str, list[float]] = {}
        self._swept = 0.0   # 지난 주소 정리 시각(요청마다 전부 돌지 않게 ANON_WINDOW 초에 한 번)
        self._day, self._day_bytes = "", 0   # 익명 기록 본문 하루 합계(한국 날짜)
        self._lock = threading.Lock()

    def _today(self) -> str:
        return datetime.fromtimestamp(self.clock(), KST).strftime("%Y%m%d")

    def allow_anonymous(self, address: str) -> bool:
        """익명 기록: 하루 합계가 ANON_DAY_BYTES 를 넘었으면 거절, 아니면 주소마다 ANON_WINDOW 초에 ANON_TRIES 번까지.
        부를 때마다 한 번으로 센다(services/members.py _allow 와 같은 방식)."""
        now, today, key = self.clock(), self._today(), _address_key(address)
        with self._lock:
            if self._day == today and self._day_bytes >= ANON_DAY_BYTES:
                return False
            if now - self._swept >= ANON_WINDOW:
                self._swept = now
                for old in [name for name, times in self._tries.items() if now - times[-1] >= ANON_WINDOW]:
                    del self._tries[old]
            recent = [moment for moment in self._tries.get(key, []) if now - moment < ANON_WINDOW]
            if len(recent) >= ANON_TRIES:
                self._tries[key] = recent
                return False
            self._tries[key] = recent + [now]
            return True

    def record_ride(self, body: bytes, source: str | None = None, anonymous: bool = False) -> dict[str, Any]:
        """사건 묶음을 그날 파일에 남긴다. source="map"(지도 기록)이면 judge · answer 도 받고 사건마다 source 를 붙인다
        (보낸 쪽이 적은 source · device 는 늘 버린다 — 정해진 칸만). anonymous 면 본문 device(DEVICE 형식)가 있어야 하고
        사건마다 device 를 붙인다 — 없으면 MissingDevice, 형식이 틀리면 BadRequest, 하루 합계를 넘기면 DayFull(저장 안 함)."""
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise BadRequest("JSON 이 아니에요") from None
        raw = cast("dict[str, Any]", payload).get("events") if isinstance(payload, dict) else None
        if not isinstance(raw, list) or not raw or len(cast("list[Any]", raw)) > MAX_EVENTS:
            raise BadRequest(f"events 는 1~{MAX_EVENTS}개예요")
        raw = cast("list[Any]", raw)   # 위에서 list 인지 봤다
        now = self.clock()
        kinds, stamp = (MAP_KINDS, {"source": MAP_SOURCE}) if source == MAP_SOURCE else (RIDE_KINDS, {})
        if anonymous:
            stamp = {**stamp, "device": _device(cast("dict[str, Any]", payload).get("device"))}   # events 가 있으면 payload 는 dict
        events = [{**clean_event(e, kinds), **stamp, "receivedAt": round(now * 1000)} for e in raw]
        if not anonymous:
            self.store.append_rides(events, now)
            return {"ok": True, "saved": len(events)}
        today, size = self._today(), len(body)
        with self._lock:   # 저장 전에 예약 — 동시에 온 요청도 합계를 넘겨 저장하지 못한다
            if self._day != today:
                self._day, self._day_bytes = today, 0
            if self._day_bytes + size > ANON_DAY_BYTES:
                raise DayFull("오늘 받을 수 있는 기록을 다 받았어요")
            self._day_bytes += size
        try:
            self.store.append_rides(events, now)
        except BaseException:
            with self._lock:   # 못 남긴 양은 되돌린다(그사이 날이 바뀌었으면 새 날 합계는 건드리지 않는다)
                if self._day == today:
                    self._day_bytes -= size
            raise
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

    def prune(self) -> dict[str, int]:
        """KEEP_DAYS 일보다 오래된 탑승 기록(날 파일) · 캡처(파일과 목록 줄)를 지운다 → 지운 수. 오늘이 1일째다."""
        oldest = (datetime.fromtimestamp(self.clock(), KST) - timedelta(days=KEEP_DAYS - 1)).strftime("%Y%m%d")
        return self.store.remove_before(oldest)

    def find_bus_route(self, name: str) -> dict[str, Any]:
        name = (name or "").strip()[:20]
        if not name:
            return {"routes": []}
        found = [r for r in self.bus_routes().values() if str(r.get("name", "")).startswith(name)]
        found.sort(key=lambda r: (r.get("name") != name, len(str(r.get("name"))), str(r.get("name"))))
        return {"routes": [{"id": r["id"], "name": r.get("name"), "start": r.get("start"), "end": r.get("end")} for r in found[:10]]}
