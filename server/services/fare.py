"""내 통계 '이번 달 예상 교통비'(2026-10-27 계획서 D5 · D6): 승차권마다 고른 경로의 거리로 1회 요금 × 이번 달 타는 날 수.
승차권대로 다 탄다고 가정한 예상이다. 성인 · 선후불 교통카드 요금만.

요금 규칙(공식 자료 · 2026-10-27 확인):
- 전철만 탈 때 — 서울교통공사 운임안내(http://www.seoulmetro.co.kr/kr/page.do?menuIdx=354, 최단거리 기준 거리비례):
  10km 까지 1,550원, 10~50km 는 5km 까지마다 100원, 50km 넘으면 8km 까지마다 100원 더.
- 버스와 갈아탈 때(통합거리비례제) — 같은 서울교통공사 운임안내 '버스와 환승 이용 시' · 서울시 대중교통요금 현황
  (https://news.seoul.go.kr/traffic/archives/345, 교통정책과 · 2025-09-18 수정): 총 이용거리 10km 까지 기본요금(탄 수단 중 높은 쪽),
  넘으면 5km 까지마다 100원(서울광역버스는 30km 까지 기본 · 넘으면 5km 까지마다 100원). 각 수단 요금을 따로 낸 합보다 많지 않다.
- 서울 시내버스 기본요금(서울시 대중교통요금 현황 · '23.8.12 조정): 도시형(간선 · 지선) 1,500원, 좌석(광역) 3,000원.
  순환 · 심야 · 마을 · 경기 · 인천 버스와 특수 노선(새벽A · 자율주행 · 출퇴근 맞춤)은 위 자료에 지금 요금이 없거나
  거리 자료가 없어 계산하지 않는다.
거리: 전철은 공식 역간거리(data/fare/hop_km.json), 버스는 서울 버스 공식 노선 경로를 따라 잰 정류소 사이 거리(data/fare/bus_km.json).
계산하지 않는 것(그 승차권은 '계산 못 함'으로 센다): 고른 경로가 없는 옛 승차권 · 공식 거리가 없는 구간(GTX-A · 김포골드라인 ·
신림선 · 자료 기준일 뒤 개통 구간 등) · 수도권 밖 구간(평택~신창 · 가평~춘천 — 따로 붙는 운임) · 추가 운임 구간(신분당선 전 구간 ·
의정부경전철 · 공항철도 청라국제도시~인천공항2터미널 — 서울시메트로9호선 운임안내, 사용자 결정 2026-10-27) · 위의 계산하지 않는 버스.
반영하지 않는 것(화면에 작게 안내): 환승 시간 조건 · 정기권 · 공휴일 · 조조할인.
"""
from __future__ import annotations

import calendar
import heapq
import math
import re
import threading
from collections import defaultdict
from datetime import datetime

from server.clock import KST
from server.store import fare_data

SUBWAY_BASE = 1550
BUS_BASE = {"trunk": 1500, "branch": 1500, "express": 3000}   # 서울 간선 · 지선 · 광역
WIDE_FREE_KM = 30   # 서울광역버스가 들어간 통합 요금의 기본 거리
# 요금을 확인한 보통 노선 이름: 번호(3~4자리) + 갈래(-1 · A · B, 뒤에 행선지 글자) — 702A · 5522A난곡 · 9401-1.
# 서울시 자료가 간선 · 지선으로 적었어도 새벽A160 · 동대문A01(자율주행) · 서울02출근 · 8442출근(출퇴근 맞춤) 같은
# 특수 노선은 요금 근거가 없어 계산하지 않는다(PR #23 리뷰)
PLAIN_BUS = re.compile(r"[0-9]{3,4}(?:-[0-9])?(?:[AB][가-힣]*)?")
DETOUR = 1.25   # 공식 거리가 있는 쌍만으로 찾은 길이 이보다 오래 걸리면(돌아간 길) 계산하지 않는다


def subway_fare(km: float) -> int:
    km = round(km, 1)
    if km <= 10:
        return SUBWAY_BASE
    if km <= 50:
        return SUBWAY_BASE + math.ceil(round((km - 10) / 5, 6)) * 100
    return SUBWAY_BASE + 800 + math.ceil(round((km - 50) / 8, 6)) * 100


def joint_fare(km: float, base: int, free_km: float) -> int:
    km = round(km, 1)
    return base + math.ceil(round(max(0.0, km - free_km) / 5, 6)) * 100


class _Graph:
    """전철 이웃 쌍 자료 → 노선마다 {역 이름: [(이웃, 초, km|None, 'outside' | 'extra' | None)]}(급행 쌍 빼고)."""
    def __init__(self, data: dict):
        self.near: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
        for line, left, right, seconds, km, outside, express, extra in data["hops"]:
            if express:   # 급행 쌍은 그 사이 완행 쌍들과 같은 선로 — 거리는 완행 쌍으로 잰다
                continue
            flag = "outside" if outside else "extra" if extra else None
            self.near[line][left].append((right, seconds, km, flag))
            self.near[line][right].append((left, seconds, km, flag))

    def _walk(self, line: str, start: str, end: str, known_only: bool):
        best, queue = {start: (0, 0.0, None)}, [(0, 0.0, "", start)]
        while queue:
            seconds, km, flag, here = heapq.heappop(queue)
            if here == end:
                return seconds, km, flag or None
            if seconds > best[here][0]:
                continue
            for there, hop_seconds, hop_km, hop_flag in self.near[line].get(here, ()):
                if known_only and hop_km is None:
                    continue
                cost = seconds + hop_seconds
                if there not in best or cost < best[there][0]:
                    best[there] = (cost, km + (hop_km or 0.0), flag or hop_flag or "")
                    heapq.heappush(queue, (cost, best[there][1], best[there][2], there))
        return None

    def ride_km(self, line: str, start: str, end: str) -> tuple[float | None, str | None]:
        """한 노선 start → end 의 공식 거리 → (km, None) · 못 구하면 (None, 이유)."""
        if line not in self.near or start not in self.near[line] or end not in self.near[line]:
            return None, "distance"
        fastest = self._walk(line, start, end, False)
        known = self._walk(line, start, end, True)
        if fastest is None or known is None or known[0] > fastest[0] * DETOUR + 120:
            return None, "distance"
        if known[2]:   # 수도권 밖 구간(따로 붙는 운임) · 추가 운임 구간(신분당선 · 의정부경전철 · 공항철도 청라국제도시~인천공항)
            return None, known[2]
        return known[1], None


_lock = threading.Lock()
_graph: tuple[int, _Graph] | None = None


def _hop_graph() -> _Graph | None:
    global _graph
    data = fare_data.read(fare_data.HOP_KM)
    if data is None:
        return None
    with _lock:
        if _graph is None or _graph[0] != id(data):
            _graph = (id(data), _Graph(data))
        return _graph[1]


def _stop_key(name: str) -> str:
    return re.sub(r"[\s.·]", "", name or "")


def _bus_km(routes: dict, leg: dict) -> tuple[float | None, str | None]:
    route = routes.get(leg.get("route"))
    if route is None or route["type"] not in BUS_BASE or not PLAIN_BUS.fullmatch(leg.get("route") or ""):
        return None, "bus"
    stops = route["stops"]
    start, end = _stop_key(leg.get("from")), _stop_key(leg.get("to"))
    best = None
    for index, (name, at) in enumerate(stops):
        if _stop_key(name) != start or at is None:
            continue
        for later_name, later_at in stops[index + 1:]:
            if _stop_key(later_name) == end and later_at is not None and later_at > at:
                best = later_at - at if best is None else min(best, later_at - at)
                break
    return (best, None) if best is not None else (None, "bus")


def trip_fare(route: dict | None, graph: _Graph | None, buses: dict | None) -> tuple[int | None, float | None, str | None]:
    """고른 경로 하나 → (1회 요금, 총 거리 km, None) · 못 구하면 (None, None, 이유: route · distance · outside · bus · none)."""
    if not route:
        return None, None, "route"
    groups: list[tuple[str, float, int]] = []   # 이어 탄 전철 묶음 · 버스 한 번 → (종류, km, 따로 낼 때 요금)
    for leg in route.get("legs") or ():
        if leg.get("type") == "ride":
            if graph is None:
                return None, None, "distance"
            km, why = graph.ride_km(leg.get("line"), leg.get("from"), leg.get("to"))
            if km is None:
                return None, None, why
            if groups and groups[-1][0] == "subway":
                groups[-1] = ("subway", groups[-1][1] + km, 0)
            else:
                groups.append(("subway", km, 0))
        elif leg.get("type") == "bus":
            km, why = _bus_km((buses or {}).get("routes", {}), leg)
            if km is None:
                return None, None, why
            kind = (buses or {})["routes"][leg["route"]]["type"]
            groups.append((kind, km, BUS_BASE[kind]))
    if not groups:
        return None, None, "none"
    total = sum(km for _, km, _ in groups)
    if all(kind == "subway" for kind, _, _ in groups) and len(groups) == 1:
        return subway_fare(total), round(total, 1), None
    alone = sum(subway_fare(km) if kind == "subway" else fare for kind, km, fare in groups)
    base = max(SUBWAY_BASE if kind == "subway" else BUS_BASE[kind] for kind, _, _ in groups)
    free = WIDE_FREE_KM if any(kind == "express" for kind, _, _ in groups) else 10
    return min(joint_fare(total, base, free), alone), round(total, 1), None


def month_rides(days: list[int], now: float) -> tuple[str, int]:
    """이번 달(한국 날짜) 달력에서 그 요일(1 월 … 7 일)이 몇 번 있나 → ('YYYY-MM', 횟수)."""
    today = datetime.fromtimestamp(now, KST)
    count = sum(1 for day in range(1, calendar.monthrange(today.year, today.month)[1] + 1)
                if datetime(today.year, today.month, day).isoweekday() in days)
    return today.strftime("%Y-%m"), count


def month_view(tickets: list[dict], now: float) -> dict:
    """승차권(ticket_view 모양) 목록 → 이번 달 예상 교통비 {month, total, tickets:[{id,name,fare,km,rides,monthly}], skipped, reasons}."""
    graph, buses = _hop_graph(), fare_data.read(fare_data.BUS_KM)
    month, rows, skipped, reasons = None, [], 0, defaultdict(int)
    for ticket in tickets:
        month, rides = month_rides(ticket["days"], now)
        fare, km, why = trip_fare(ticket.get("route"), graph, buses)
        if fare is None:
            skipped += 1
            reasons[why] += 1
            continue
        rows.append({"id": ticket["id"], "name": ticket["name"], "fare": fare, "km": km, "rides": rides, "monthly": fare * rides})
    if month is None:
        month = datetime.fromtimestamp(now, KST).strftime("%Y-%m")
    return {"month": month, "total": sum(row["monthly"] for row in rows), "tickets": rows, "skipped": skipped,
            "reasons": dict(reasons)}
