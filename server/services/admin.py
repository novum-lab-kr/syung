"""관리 화면(주인만): 회원 수 · 목록 · 상세 · 조치와 서버 상태. HTTP 모양(주소 · 상태 코드 · 쿠키 확인)은 routes/admin.py 가 맡는다.

- 목록 · 상세에는 승차권 장소(이름 · 좌표)와 고른 경로를 넣지 않는다. 장소는 이유를 받는 places() 로만 주고 그때 기록을 남긴다.
- 조치(강제 로그아웃 · 탈퇴 처리)는 이유가 있어야 하고, 탈퇴 처리는 회원번호를 한 번 더 받아 맞춰 본다. 모두 admin_log 에 남긴다.
- 기록에는 언제 · 무엇을 · 누구에게 · 왜만 남긴다(관리자 IP · 검색어 · 토큰은 남기지 않는다). 1년 보관 후 지운다(store ADMIN_LOG_AGE).
- 서버 상태는 이미 가진 값만 읽는다(바깥 API 를 부르지 않는다).
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta

from server.clock import KST
from server.errors import BusError
from server.store.members import MemberStore

PAGE_SIZE = 50
DAILY_DAYS = 30   # 날짜별 가입 수를 보여 줄 날 수(오늘 포함)
REASON_MAX = 200
SEARCH_MAX = 40


class AdminError(ValueError):
    """사람이 고칠 수 있는 요청 오류(이유 없음 · 회원번호가 다름) — 문구는 화면에 그대로 보인다."""


def clean_reason(body) -> str:
    if not isinstance(body, dict):
        raise AdminError("본문은 JSON 객체예요")
    reason = body.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        raise AdminError("이유를 적어 주세요")
    reason = " ".join(reason.split())   # 줄바꿈 · 여러 칸은 한 칸으로(기록 한 줄)
    if len(reason) > REASON_MAX:
        raise AdminError(f"이유는 {REASON_MAX}자까지예요")
    return reason


def _days(text: str) -> list[int]:
    return [int(day) for day in (text or "").split(",") if day]


def _member_view(row: dict) -> dict:
    return {"id": row["id"], "name": row["display_name"], "createdAt": row["created_at"], "provider": row["provider"],
            "tickets": row["tickets"], "lastLogin": row["last_login"], "sessions": row["sessions"]}


class AdminService:
    """store: 회원 DB(MemberService 의 것을 같이 쓴다). live · health · bus · arrivals: 서버 상태를 읽을 서비스를 꺼내는
    인자 없는 함수(없으면 그 칸을 빼고) — 회원 화면만 쓰는 시험 · 개발 서버가 지하철 · 버스 서비스를 만들지 않게 늦게 꺼낸다."""

    def __init__(self, store: MemberStore, *, live=None, health=None, bus=None, arrivals=None,
                 started_at: float | None = None, clock=time.time):
        self.store, self.clock = store, clock
        self._live, self._health, self._bus, self._arrivals = live, health, bus, arrivals
        self.started_at = started_at if started_at is not None else clock()

    # ---- 회원 ----
    def stats(self) -> dict:
        now = self.clock()
        self.store.prune_admin_log(int(now))   # 관리 화면을 열 때마다 1년 지난 기록을 지운다
        today = datetime.fromtimestamp(now, KST).replace(hour=0, minute=0, second=0, microsecond=0)
        starts = tuple(int((today - timedelta(days=back)).timestamp()) for back in (0, 6, 29))
        first = today - timedelta(days=DAILY_DAYS - 1)
        saved = self.store.admin_stats(starts, int(first.timestamp()))
        counted = {row["day"]: row["count"] for row in saved["daily"]}
        days = [(first + timedelta(days=step)).strftime("%Y-%m-%d") for step in range(DAILY_DAYS)]
        return {"total": saved["total"], "today": saved["today"], "week": saved["week"], "month": saved["month"],
                "providers": saved["providers"], "daily": [{"day": day, "count": counted.get(day, 0)} for day in days]}

    def members(self, query: str, page: int) -> dict:
        word = " ".join((query or "").split())[:SEARCH_MAX]
        number = int(word) if word.isascii() and word.isdigit() and len(word) <= 12 else None
        page = max(1, page)
        total, rows = self.store.admin_members(word, number, int(self.clock()), (page - 1) * PAGE_SIZE, PAGE_SIZE)
        return {"total": total, "page": page, "pageSize": PAGE_SIZE, "members": [_member_view(row) for row in rows]}

    def member(self, user_id: int) -> dict | None:
        self.store.prune_admin_log(int(self.clock()))   # 1년 지난 기록은 보이지 않게
        row = self.store.admin_member(user_id, int(self.clock()))
        if row is None:
            return None
        view = _member_view(row)
        view["identities"] = [{"provider": item["provider"], "createdAt": item["created_at"]} for item in row["identities"]]
        view["ticketList"] = [{"id": ticket["id"], "name": ticket["name"], "depart": ticket["depart_at"], "days": _days(ticket["days"]),
                               "hasRoute": bool(ticket["has_route"]), "createdAt": ticket["created_at"], "updatedAt": ticket["updated_at"]}
                              for ticket in row["ticket_rows"]]
        view["log"] = [{"at": item["at"], "action": item["action"], "reason": item["reason"]} for item in row["log"]]
        return view

    def places(self, user_id: int, body) -> list[dict] | None:
        """승차권 장소(이름 · 좌표). 이유가 있어야 하고, 꺼낼 때 기록을 남긴다. 회원이 없으면 None."""
        rows = self.store.admin_places(user_id, int(self.clock()), clean_reason(body))
        if rows is None:
            return None
        return [{"id": row["id"], "name": row["name"],
                 "from": {"name": row["from_name"], "lat": row["from_lat"], "lng": row["from_lng"]},
                 "to": {"name": row["to_name"], "lat": row["to_lat"], "lng": row["to_lng"]}} for row in rows]

    def logout(self, user_id: int, body) -> int | None:
        """그 회원의 모든 기기에서 로그아웃 → 지운 세션 수. 회원이 없으면 None."""
        return self.store.admin_logout(user_id, int(self.clock()), clean_reason(body))

    def delete(self, user_id: int, body) -> dict | None:
        """탈퇴 처리: 본문 confirm 이 회원번호와 같아야 한다. 회원이 없으면 None."""
        reason = clean_reason(body)
        if str(body.get("confirm", "")).strip() != str(user_id):
            raise AdminError("확인용 회원번호가 맞지 않아요")
        return self.store.admin_delete(user_id, int(self.clock()), reason)

    # ---- 서버 상태 ----
    def status(self) -> dict:
        now = self.clock()
        body = {"checkedAt": datetime.fromtimestamp(now, KST).isoformat(timespec="seconds"),
                "startedAt": datetime.fromtimestamp(self.started_at, KST).isoformat(timespec="seconds"),
                "uptimeSeconds": max(0, int(now - self.started_at)), "calls": [], "caches": [], "problems": []}
        if self._live:
            live = self._live()
            quota = live.quota_view()
            body["calls"].append({"key": "subway", "label": "서울시 지하철", "used": quota["used"],
                                  "limit": quota["limit"], "day": quota["day"] or None})
            body["calls"].append({"key": "position", "label": "열차 위치 피드", "used": live.position_used["calls"],
                                  "limit": live.config.position_budget, "day": live.position_used["day"] or None})
            stamp = live.all_cache[0] if live.all_cache else None
            body["caches"].append({"key": "subway", "label": "지하철 전 노선", "entries": 1 if stamp else 0,
                                   "ageSeconds": None if stamp is None else max(0, int(now - stamp))})
            body["caches"].append({"key": "position", "label": "열차 위치(노선별)", "entries": len(live.position_cache), "ageSeconds": None})
        for key, label, getter in (("bus", "서울시 버스 위치", self._bus), ("arrival", "서울시 버스 도착", self._arrivals)):
            if not getter:
                continue
            service = getter()
            try:
                quota = service.ledger.view(now)
                body["calls"].append({"key": key, "label": label, "used": quota["used"], "limit": quota["limit"], "day": quota["day"]})
            except BusError:
                body["calls"].append({"key": key, "label": label, "used": None, "limit": service.config.daily_limit, "day": None})
                body["problems"].append({"key": f"quota:{key}", "text": f"{label} 호출 장부 파일을 읽지 못했어요"})
            body["caches"].append({"key": key, "label": label, "entries": len(service.cache), "ageSeconds": None})
        if self._health:
            report = self._health().report()
            body["problems"] += [{"key": check["key"], "text": check["text"]} for check in report["checks"] if not check["ok"]]
            body["healthCheckedAt"] = report["checkedAt"]
        return body
