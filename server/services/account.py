"""내 정보의 계정 칸 · 내 통계(2026-10-27 계획서 D1~D4): 로그인 기기 종류 · 세션 번호 · 사용 횟수 종류 · 통계 모양.
저장 · 읽기는 store/members.py, 흐름(누가 · 언제)은 services/members.py MemberService 가 맡는다.

- 기기 종류: 로그인할 때 User-Agent 에서 '운영체제/브라우저' 두 낱말만 뽑아 저장한다(예 'iphone/safari').
  원문 · 버전 · IP 는 저장하지 않는다. 모르는 것은 '' — 화면에는 '알 수 없는 기기'.
  앱 로그인(2026-10-30)은 브라우저 자리에 'app' — 운영체제는 로그인 화면을 연 시스템 브라우저의 User-Agent 에서 뽑는다(예 'iphone/app').
- 세션 번호: 화면에 주는 번호는 토큰 해시를 한 번 더 해시한 앞 16글자다(DB 의 열쇠 · 토큰은 밖으로 내지 않는다).
- 사용 횟수 종류(계획서 D3 — 기존 화면 동작에서 고름): open(로그인한 채로 슝을 연 번) · route(길찾기 결과를 받은 번) ·
  ticket(승차권 뒷면을 본 번). 날짜(한국) · 종류별 횟수만, 하루 한 종류 USAGE_MOST 번까지 센다.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta
from typing import Any

from server.clock import KST

USAGE_KINDS = ("open", "route", "ticket")
USAGE_MOST = 200   # 하루 한 종류 최대 횟수(이 위로는 세지 않는다 — 장난 요청으로 줄이 커지지 않게)
STATS_DAYS = 30   # 내 통계의 날짜별 칸(오늘 포함)
SESSION_ID = re.compile(r"[0-9a-f]{16}")
UA_MAX = 512   # 이보다 긴 User-Agent 는 앞만 본다

# (찾을 글자, 낱말) — 앞에서부터 처음 맞는 것. 순서가 중요하다(아이패드 · 안드로이드 글자에 다른 운영체제 이름이 같이 들어 있다)
OS_RULES = (("iPhone", "iphone"), ("iPad", "ipad"), ("Android", "android"), ("CrOS", "chromeos"),
            ("Windows", "windows"), ("Macintosh", "mac"), ("Mac OS X", "mac"), ("Linux", "linux"))
BROWSER_RULES = (("KAKAOTALK", "kakaotalk"), ("NAVER(inapp", "naver"), ("SamsungBrowser/", "samsung"), ("Whale/", "whale"),
                 ("Edg/", "edge"), ("EdgiOS/", "edge"), ("EdgA/", "edge"), ("OPR/", "opera"), ("Firefox/", "firefox"),
                 ("FxiOS/", "firefox"), ("CriOS/", "chrome"), ("Chrome/", "chrome"), ("Safari/", "safari"))
OS_NAMES = {"iphone": "아이폰", "ipad": "아이패드", "android": "안드로이드", "chromeos": "크롬북", "windows": "윈도우",
            "mac": "맥", "linux": "리눅스"}
BROWSER_NAMES = {"kakaotalk": "카카오톡", "naver": "네이버 앱", "samsung": "삼성 인터넷", "whale": "웨일", "edge": "엣지",
                 "opera": "오페라", "firefox": "파이어폭스", "chrome": "크롬", "safari": "사파리", "app": "슝 앱"}


def device_of(user_agent: str | None) -> str:
    """User-Agent → 'iphone/safari' 처럼 두 낱말(모르는 쪽은 빈칸, 둘 다 모르면 '')."""
    text = (user_agent or "")[:UA_MAX]
    os_name = next((word for mark, word in OS_RULES if mark in text), "")
    browser = next((word for mark, word in BROWSER_RULES if mark in text), "")
    return f"{os_name}/{browser}" if os_name or browser else ""


def app_device(user_agent: str | None) -> str:
    """앱 로그인의 기기 종류: 시스템 브라우저 User-Agent 의 운영체제 + 'app'(예 'iphone/app' · 모르면 '/app')."""
    return f"{device_of(user_agent).partition('/')[0]}/app"


def device_label(device: str) -> str:
    """저장된 기기 종류 → 화면 글자 '아이폰 · 사파리'. 모르면 '알 수 없는 기기'."""
    os_name, _, browser = (device or "").partition("/")
    words = [name for name in (OS_NAMES.get(os_name), BROWSER_NAMES.get(browser)) if name]
    return " · ".join(words) or "알 수 없는 기기"


def session_id(token_hash: str) -> str:
    return hashlib.sha256(f"session:{token_hash}".encode()).hexdigest()[:16]


def session_view(row: dict[str, Any], current_hash: str | None) -> dict[str, Any]:
    return {"id": session_id(row["token_hash"]), "device": device_label(row["device"]), "createdAt": row["created_at"],
            "lastUsedAt": row["used_at"] or row["created_at"], "current": row["token_hash"] == current_hash}


def today_kst(now: float) -> datetime:
    return datetime.fromtimestamp(now, KST).replace(hour=0, minute=0, second=0, microsecond=0)


def stats_view(now: float, joined_at: int, tickets: list[dict[str, Any]], rows: list[dict[str, Any]]) -> dict[str, Any]:
    """내 통계: 함께한 날 · 승차권 수 · 한 주에 타는 횟수(승차권 타는 날 합) · 최근 STATS_DAYS 일 날짜별 횟수 · 1년 합계.
    rows: 1년 치 usage_daily 줄(day · kind · count)."""
    today = today_kst(now)
    days = [(today - timedelta(days=back)).strftime("%Y-%m-%d") for back in range(STATS_DAYS - 1, -1, -1)]
    daily = {day: dict.fromkeys(USAGE_KINDS, 0) for day in days}
    year = dict.fromkeys(USAGE_KINDS, 0)
    open_days = recent_open_days = 0
    for row in rows:
        if row["kind"] not in year:
            continue
        year[row["kind"]] += row["count"]
        if row["kind"] == "open":
            open_days += 1
        if row["day"] in daily:
            daily[row["day"]][row["kind"]] = row["count"]
            recent_open_days += row["kind"] == "open"
    joined = today_kst(joined_at)
    return {"joinedAt": joined_at, "daysTogether": (today - joined).days + 1,
            "tickets": len(tickets), "weeklyRides": sum(len(ticket["days"]) for ticket in tickets),
            "recent": {"days": STATS_DAYS, "openDays": recent_open_days,
                       "route": sum(item["route"] for item in daily.values()),
                       "ticket": sum(item["ticket"] for item in daily.values())},
            "year": {"openDays": open_days, "route": year["route"], "ticket": year["ticket"]},
            "daily": [{"day": day, **daily[day]} for day in days]}
