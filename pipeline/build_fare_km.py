#!/usr/bin/env python3
"""내 통계 '이번 달 예상 교통비'(2026-10-27 계획서 D5 · D6)에 쓸 거리 → data/fare/hop_km.json(전철) · data/fare/bus_km.json(버스).

    python3 pipeline/build_fare_km.py                 # 공공데이터포털에서 받아 만든다(로그인 없이 받는 파일 데이터)
    python3 pipeline/build_fare_km.py --from <폴더>    # 이미 받아 둔 CSV(<자료번호>.csv)로 만든다

- 출처: 공공데이터포털(data.go.kr) 파일 데이터 — 국가철도공단이 운영기관별로 올린 '역간거리' CSV(아래 SOURCES).
  열은 철도운영기관명 · 선명 · 역명 · 역간거리(km)[· 후행역간거리]. 받은 날 · 자료 수정일은 출력 파일 sources 에 남긴다.
- 슝 노선망(data/journey.json hops = 이웃 역 쌍)의 쌍마다 공식 목록에서 두 역이 바로 이어 적힌 줄의 거리를 붙인다.
  공식 목록은 노선마다 '앞 역까지' · '다음 역까지' 뜻이 다르고 지선이 한 목록에 이어 붙어 있어, 뜻은 역 좌표 직선 거리와
  맞는 쪽으로 고르고(맞는 쌍이 70% 아래면 그 노선 목록은 쓰지 않는다), 쌍마다 직선 거리와 크게 어긋나는 값은 버린다.
  좌표 거리는 검사에만 쓴다 — 공식 거리가 없는 쌍은 null 로 두고 메우지 않는다(그 쌍을 지나는 승차권은 '계산 못 함').
- 공식 목록에 없는 노선 · 역(자료 기준일 뒤 개통 구간 등)은 null 로 남는다. 노선별로 몇 쌍이 채워졌는지 lines 에 남긴다.
- 수도권 밖 구간(평택~신창 · 가평~춘천 — 서울교통공사 운임안내: 4km 까지마다 100원 따로 붙음)의 쌍은 outside 로 표시한다
  (그 구간을 지나는 승차권은 계산하지 않는다).
- 버스(bus_km.json): data/bus/routes.json 의 서울 버스 노선(공식 노선 경로 — 공공데이터 15000193, pathSource api)을 따라
  정류소마다 기점부터의 거리(km)를 잰다. 정류소 좌표(data/bus/stops.json)를 노선 모양에 앞에서부터 차례로 붙여(되돌아가지 않게) 잰다.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
METRO = ROOT / "data" / "ktdb-gtfs-2025" / "capital-metro.json"
JOURNEY = ROOT / "data" / "journey.json"
OUT = ROOT / "data" / "fare" / "hop_km.json"
PORTAL = "https://www.data.go.kr"
KST = timezone(timedelta(hours=9))

# 자료번호 → 설명. 같은 노선이 여러 자료에 있으면 앞 자료를 먼저 쓴다(비어 있는 쌍만 뒤 자료로 채운다)
SOURCES = {
    "15081860": "국가철도공단_서울교통공사 역간거리",
    "15081858": "국가철도공단_코레일 역간거리",
    "15041460": "국가철도공단_수도권1호선_역간거리",
    "15041298": "국가철도공단_수도권9호선_역간거리",
    "15041074": "국가철도공단_신분당선_역간거리",
    "15041310": "국가철도공단_공항철도_역간거리",
    "15081857": "국가철도공단_인천교통공사 역간거리",
    "15081850": "국가철도공단_에버라인 역간거리",
    "15081852": "국가철도공단_의정부경전철_역간거리",
    "15081853": "국가철도공단_우이신설 역간거리",
    "15041327": "국가철도공단_경의중앙선_역간거리",
    "15041296": "국가철도공단_경강선_역간거리",
    "15041295": "국가철도공단_경춘선_역간거리",
    "15041284": "국가철도공단_수인분당선_역간거리",
}
# 공식 자료의 선명 → 슝 노선 이름(이 밖의 선명 — 동해 · 대경선 등 — 은 수도권 노선망에 없어 쓰지 않는다)
LINE_NAMES = {"1호선": "1호선", "1호선(경인선)": "1호선", "1호선(광명선)": "1호선", "1호선(서동탄선)": "1호선",
              "1호선(경부선)": "1호선", "2호선": "2호선", "3호선": "3호선", "4호선": "4호선", "5호선": "5호선",
              "6호선": "6호선", "7호선": "7호선", "8호선": "8호선", "9호선": "9호선", "신분당": "신분당선", "공항": "공항철도",
              "인천1호선": "인천1호선", "인천2호선": "인천2호선", "에버라인": "에버라인선", "의정부": "의정부선",
              "우이신설": "우이신설선", "경의중앙": "경의중앙선", "경강": "경강선", "경춘": "경춘선", "수인분당": "수인분당선",
              "서해선": "서해선"}
# GTFS 뒤 바뀐 역 이름(server/services/journey_graph.py NEW_NAMES 와 같다) — 공식 자료가 어느 쪽 이름이어도 맞춘다
NEW_NAMES = {"당고개": "불암산", "초성리": "청산", "뚝섬유원지": "자양", "총신대입구": "이수", "화전": "한국항공대",
             "운동장·송담대": "용인중앙시장", "서구청": "서해구청"}
OUTSIDE = (("1호선", "평택", "신창"), ("경춘선", "가평", "춘천"))   # (노선, 경계 역, 끝 역) — 두 역 사이 쌍이 수도권 밖
BUS_ROUTES = ROOT / "data" / "bus" / "routes.json"
BUS_STOPS = ROOT / "data" / "bus" / "stops.json"
BUS_OUT = ROOT / "data" / "fare" / "bus_km.json"
FIT_SHARE = 0.7   # 이 비율 넘게 좌표 거리와 맞아야 그 목록의 뜻(앞 역까지 / 다음 역까지)을 믿는다


def key(name: str) -> str:
    name = re.sub(r"\([^)]*\)", "", name or "")
    name = re.sub(r"역$", "", name.strip()).replace(" ", "").replace(".", "·")
    return NEW_NAMES.get(name, name)


def metres(left: dict, right: dict) -> float:
    lat1, lat2 = math.radians(left["lat"]), math.radians(right["lat"])
    dlat, dlng = lat2 - lat1, math.radians(right["lon"] - left["lon"])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6_371_000 * 2 * math.asin(math.sqrt(value))


def plausible(km: float | None, straight_km: float) -> bool:
    """이어 적힌 줄이 정말 그 두 역 사이 거리인지 대강 본다 — 엉뚱한 쌍(지선 이음매 · 칸 뜻 반대)만 거른다.
    역 좌표는 역 하나에 한 점이라(환승역은 노선마다 승강장이 떨어져 있다) 공식 거리가 직선보다 조금 짧을 수도 있고,
    선로가 크게 도는 쌍(공항철도 인천공항1 → 2터미널 5.8 km · 직선 2 km)도 있다."""
    return km is not None and km > 0 and straight_km * 0.7 - 0.3 <= km <= straight_km * 3 + 0.5


def number(text: str) -> float | None:
    try:
        value = float((text or "").strip())
    except ValueError:
        return None
    return value if value >= 0 else None


def fetch(dataset: str) -> tuple[bytes, dict]:
    """자료 페이지에서 첫 파일 주소 · 이름 · 수정일을 찾아 받는다 → (CSV 바이트, 출처 정보)."""
    agent = {"User-Agent": "Mozilla/5.0 (syung pipeline)"}
    page_url = f"{PORTAL}/data/{dataset}/fileData.do"
    with urllib.request.urlopen(urllib.request.Request(page_url, headers=agent), timeout=30) as response:
        page = response.read().decode("utf-8", "replace")
    found = re.search(r"fileDownload\.do\?atchFileId=([A-Z_0-9]+)&fileDetailSn=(\d+)", page)
    if not found:
        raise SystemExit(f"{dataset}: 받을 파일을 찾지 못했어요({page_url})")
    url = f"{PORTAL}/cmm/cmm/fileDownload.do?atchFileId={found.group(1)}&fileDetailSn={found.group(2)}&insertDataPrcus=N"
    with urllib.request.urlopen(urllib.request.Request(url, headers=agent), timeout=60) as response:
        data = response.read()
    text = re.sub(r"<[^>]+>", " ", page)
    modified = re.search(r"수정일\s*(\d{4}-\d{2}-\d{2})", text)
    title = re.search(r"파일데이터명\s*([^\s<][^<\n]*?)\s+분류체계", text)
    return data, {"page": page_url, "file": url, "modified": modified.group(1) if modified else None,
                  "title": title.group(1).strip() if title else None}


def read_rows(data: bytes) -> list[dict]:
    for encoding in ("utf-8-sig", "cp949"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise SystemExit("CSV 글자 모양(utf-8 · cp949)을 알 수 없어요")
    rows = list(csv.reader(io.StringIO(text)))
    head = [cell.strip() for cell in rows[0]]
    prev_col = next(index for index, name in enumerate(head) if name.startswith("역간거리"))
    next_col = head.index("후행역간거리") if "후행역간거리" in head else None
    out = []
    for row in rows[1:]:
        if len(row) <= prev_col:
            continue
        out.append({"org": row[0].strip(), "line": row[1].strip(), "name": row[2].strip(), "km": number(row[prev_col]),
                    "next": number(row[next_col]) if next_col is not None and len(row) > next_col else None,
                    "two": next_col is not None})
    return out


def line_path(pairs: dict, line: str, start: int | None, end: int | None, skip: set = frozenset()) -> list[int]:
    """그 노선의 이웃 쌍만 따라 start → end 역 번호 목록(걸리는 초가 가장 짧은 길, skip 쌍은 빼고). 없으면 []."""
    import heapq
    near = defaultdict(list)
    for (name, left, right), seconds in pairs.items():
        if name == line and (name, left, right) not in skip:
            near[left].append((right, seconds))
            near[right].append((left, seconds))
    best, back, queue = {start: 0}, {}, [(0, start)]
    while queue:
        cost, here = heapq.heappop(queue)
        if here == end:
            path = [end]
            while path[-1] != start:
                path.append(back[path[-1]])
            return path[::-1]
        if cost > best.get(here, cost):
            continue
        for there, seconds in near[here]:
            if cost + seconds < best.get(there, float("inf")):
                best[there], back[there] = cost + seconds, here
                heapq.heappush(queue, (cost + seconds, there))
    return []


def along(path: list, points: list[tuple[float, float]]) -> list[float | None]:
    """노선 모양(path: [[lng, lat], …]) 위에 points(lat, lng)를 차례로 붙여 기점부터의 km. 모양에서 80 m 넘게 떨어진 곳은 None."""
    cumulative = [0.0]
    for left, right in zip(path, path[1:]):
        cumulative.append(cumulative[-1] + metres({"lat": left[1], "lon": left[0]}, {"lat": right[1], "lon": right[0]}) / 1000)
    out, start = [], 0
    for lat, lng in points:
        best = None
        for index in range(start, len(path) - 1):
            (x1, y1), (x2, y2) = path[index], path[index + 1]
            scale = math.cos(math.radians(lat))
            dx, dy = (x2 - x1) * scale, y2 - y1
            length = dx * dx + dy * dy
            share = 0.0 if length == 0 else max(0.0, min(1.0, ((lng - x1) * scale * dx + (lat - y1) * dy) / length))
            px, py = x1 + (x2 - x1) * share, y1 + (y2 - y1) * share
            gap = metres({"lat": lat, "lon": lng}, {"lat": py, "lon": px})
            if best is None or gap < best[0] - 1e-9:
                best = (gap, index, share)
            if best[0] < 30 and gap > 400:   # 붙일 곳을 찾았고 멀어지기 시작했다 — 뒤쪽(되돌아오는 길)의 같은 자리를 잡지 않게
                break
        if best is None or best[0] > 80:
            out.append(None)
            continue
        gap, index, share = best
        out.append(round(cumulative[index] + (cumulative[index + 1] - cumulative[index]) * share, 3))
        start = index
    return out


def build_bus(today: str) -> dict:
    routes = json.loads(BUS_ROUTES.read_text(encoding="utf-8"))
    stops = {stop["id"]: stop for stop in json.loads(BUS_STOPS.read_text(encoding="utf-8"))["stops"]}
    out, missing = {}, 0
    for route in routes["routes"]:
        if route.get("pathSource") != "api":
            continue
        names = [stops[stop_id]["name"] if stop_id in stops else None for stop_id in route["stopIds"]]
        points = [(stops[stop_id]["lat"], stops[stop_id]["lng"]) if stop_id in stops else (0.0, 0.0) for stop_id in route["stopIds"]]
        km = along(route["path"], points)
        missing += sum(value is None for value in km)
        out[route["name"]] = {"type": route["type"], "stops": [[name, value] for name, value in zip(names, km)]}
    return {"note": "서울 버스 노선마다 정류소 차례 · 기점부터의 거리(km, 공식 노선 경로를 따라). null = 그 정류소를 노선 모양에 붙이지 못함. "
                    "pipeline/build_fare_km.py 가 만든다.", "builtAt": today,
            "sources": [*routes["source"]["datasets"], {"name": "노선 경로", "note": "공공데이터 15000193 (data/bus/routes.json pathSource api)"}],
            "unplaced": missing, "routes": out}


def runs(rows: list[dict], line: str, by_key: dict, pairs: dict) -> list[list[tuple[dict, int]]]:
    """공식 목록을 '이어 적힌 두 줄이 슝 노선망에서도 이웃'인 덩어리로 나눈다 → [[(줄, 역 번호), …], …].
    목록은 지선 · 구간을 이어 붙여 적고, 덩어리마다 값의 뜻(앞 역까지 / 다음 역까지)이 다를 수 있다
    (코레일 1호선은 서울 쪽 역까지의 거리라 연천→회기 덩어리는 '다음 역까지', 남영→ 덩어리는 '앞 역까지')."""
    out, current = [], []
    for row in rows:
        node = by_key.get((line, key(row["name"])))
        if node is None:
            if current:
                out.append(current)
            current = []
            continue
        if current and (line, *sorted((current[-1][1], node))) not in pairs:
            out.append(current)
            current = []
        current.append((row, node))
    if current:
        out.append(current)
    return out


def _values(row: dict) -> tuple:
    return (row["km"], row["next"]) if row["two"] else (row["km"],)


def choose_way(run: list, nodes: dict) -> tuple[tuple[int, str] | None, int, int]:
    """덩어리 안 쌍들로 뜻을 고른다 → ((칸 번호, 'prev' | 'next'), 맞는 쌍 수, 쌍 수). 맞는 쌍이 많고 좌표와의 오차가 작은 쪽.
    'prev' = 줄의 값이 앞 줄 역까지, 'next' = 다음 줄 역까지."""
    if len(run) < 2:
        return None, 0, 0
    best = None
    for column in range(len(_values(run[0][0]))):
        for direction in ("prev", "next"):
            fit, error = 0, 0.0
            for (first, left), (second, right) in zip(run, run[1:]):
                value = _values(second if direction == "prev" else first)[column]
                straight = metres(nodes[left], nodes[right]) / 1000
                if plausible(value, straight):
                    fit += 1
                    error += abs(math.log(value / max(straight * 1.1, 0.05)))
            score = (fit, -error)
            if best is None or score > best[0]:
                best = (score, (column, direction), fit)
    return best[1], best[2], len(run) - 1


def assigned(run: list, way: tuple[int, str], line: str, nodes: dict, near: dict):
    """덩어리의 값을 쌍에 붙인다 → [(쌍, km, 직선 km)]. 덩어리 끝 줄('next' 면 마지막, 'prev' 면 처음)의 값은 덩어리 밖 이웃 중
    좌표와 가장 맞는 역과의 쌍에 붙인다(순환선 이음매 · 운영기관 경계 — 2호선 을지로입구→시청, 1호선 회기→청량리 · 남영→서울)."""
    column, direction = way
    out = []
    for (first, left), (second, right) in zip(run, run[1:]):
        value = _values(second if direction == "prev" else first)[column]
        out.append(((line, *sorted((left, right))), value, metres(nodes[left], nodes[right]) / 1000))
    end_row, end_node = run[-1] if direction == "next" else run[0]
    inside = run[-2][1] if direction == "next" else run[1][1]
    value = _values(end_row)[column]
    choices = []
    for other in near.get((line, end_node), ()):
        if other == inside:
            continue
        straight = metres(nodes[end_node], nodes[other]) / 1000
        if plausible(value, straight):
            choices.append((abs(math.log(value / max(straight * 1.1, 0.05))), other, straight))
    if choices:
        _, other, straight = min(choices)
        out.append(((line, *sorted((end_node, other))), value, straight))
    return out


def build(raw: dict[str, bytes], sources: dict[str, dict], today: str) -> dict:
    metro = json.loads(METRO.read_text(encoding="utf-8"))
    hops = json.loads(JOURNEY.read_text(encoding="utf-8"))["hops"]
    nodes = {node["id"]: node for node in metro["nodes"]}
    by_key: dict[tuple[str, str], int] = {}   # (노선, 이름 열쇠) → 역 번호
    for node in metro["nodes"]:
        for line in node["lines"]:
            by_key[(line, key(node["name"]))] = node["id"]
    pairs: dict[tuple[str, int, int], int] = {}   # (노선, 작은 번호, 큰 번호) → 가장 짧은 걸리는 초
    for name, seconds in hops.items():
        line, left, right = name.split("|")
        pair = (line, *sorted((int(left), int(right))))
        pairs[pair] = min(seconds, pairs.get(pair, seconds))
    km: dict[tuple[str, int, int], float] = {}
    report: dict[str, list] = defaultdict(list)
    near: dict[tuple[str, int], set[int]] = defaultdict(set)   # (노선, 역) → 그 노선의 이웃 역(급행 쌍 포함)
    for line, left, right in pairs:
        near[(line, left)].add(right)
        near[(line, right)].add(left)
    for dataset, data in raw.items():
        groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for row in read_rows(data):
            if row["line"] in LINE_NAMES:
                groups[(row["org"], row["line"])].append(row)
        for (org, official), rows in groups.items():
            line = LINE_NAMES[official]
            added = fitted = total = 0
            for run in runs(rows, line, by_key, pairs):
                way, fit, size = choose_way(run, nodes)
                total += size
                if size == 0:
                    continue
                if way is None or fit < FIT_SHARE * size:
                    report[line].append(f"{dataset} {org} {official}: {run[0][0]['name']}~{run[-1][0]['name']} "
                                        f"좌표와 맞는 쌍 {fit}/{size} — 쓰지 않음")
                    continue
                fitted += fit
                for pair, value, straight in assigned(run, way, line, nodes, near):
                    if pair not in km and plausible(value, straight):
                        km[pair] = value
                        added += 1
            report[line].append(f"{dataset} {org} {official}: 맞는 쌍 {fitted}/{total} · 새로 채움 {added}")
    # 급행 쌍: 같은 노선에서 그 쌍보다 짧게 걸리는 쌍들만 거쳐 비슷한 시간(1.8배 + 2분 안)에 닿는 쌍 — 같은 선로를 서는 역 없이 달린다
    # (더 긴 쌍은 빼고 본다 — 급행 쌍을 거쳐 도는 길로 완행 쌍을 급행으로 잘못 보지 않게).
    # 서버는 급행 쌍을 거리 계산에 쓰지 않는다(그 사이 완행 쌍의 공식 거리 합이 같은 거리)
    express = set()
    for pair, seconds in pairs.items():
        line, left, right = pair
        longer = {other for other, other_seconds in pairs.items() if other[0] == line and other_seconds >= seconds}
        around = line_path(pairs, line, left, right, longer)
        if len(around) > 2:
            cost = sum(pairs[(line, *sorted(step))] for step in zip(around, around[1:]))
            if cost <= seconds * 1.8 + 120:
                express.add(pair)
    outside = set()
    for line, start, end in OUTSIDE:
        path = line_path(pairs, line, by_key.get((line, key(start))), by_key.get((line, key(end))), express)
        if not path:
            raise SystemExit(f"수도권 밖 구간 {line} {start}~{end} 를 노선망에서 찾지 못했어요")
        outside.update((line, *sorted(pair)) for pair in zip(path, path[1:]))
    lines = defaultdict(lambda: {"pairs": 0, "official": 0, "express": 0})
    out_hops = []
    shown = lambda node_id: NEW_NAMES.get(nodes[node_id]["name"], nodes[node_id]["name"])   # 길찾기 구간 글자와 같은 지금 이름
    for (line, left, right), seconds in sorted(pairs.items()):
        value = km.get((line, left, right))
        lines[line]["pairs"] += 1
        lines[line]["official"] += value is not None
        lines[line]["express"] += (line, left, right) in express
        out_hops.append([line, shown(left), shown(right), seconds, value, 1 if (line, left, right) in outside else 0,
                         1 if (line, left, right) in express else 0])
    return {"note": "슝 노선망(data/journey.json)의 이웃 역 쌍마다 [노선, 역, 역, 걸리는 초, 공식 역간거리 km | null, 수도권 밖, 급행 쌍]. "
                    "null = 공식 자료에서 찾지 못함 — 그 쌍을 지나는 승차권은 예상 교통비를 계산하지 않는다. "
                    "pipeline/build_fare_km.py 가 만든다.",
            "builtAt": today, "sources": [{"id": dataset, **sources.get(dataset, {}), "name": SOURCES.get(dataset)}
                                          for dataset in raw],
            "lines": {line: {**counts, "notes": report.get(line, [])} for line, counts in sorted(lines.items())},
            "hops": out_hops}


def main() -> None:
    parser = argparse.ArgumentParser(description="공식 역간거리 → data/fare/hop_km.json")
    parser.add_argument("--from", dest="folder", type=Path, help="받아 둔 CSV 폴더(<자료번호>.csv) — 없으면 공공데이터포털에서 받는다")
    args = parser.parse_args()
    today = datetime.now(KST).strftime("%Y-%m-%d")
    raw, sources = {}, {}
    for dataset in SOURCES:
        if args.folder:
            path = args.folder / f"{dataset}.csv"
            if path.is_file():
                raw[dataset] = path.read_bytes()
                sources[dataset] = {"page": f"{PORTAL}/data/{dataset}/fileData.do", "receivedAt": None}
            continue
        raw[dataset], info = fetch(dataset)
        sources[dataset] = {**info, "receivedAt": today}
    result = build(raw, sources, today)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    bus = build_bus(today)
    BUS_OUT.write_text(json.dumps(bus, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"버스: 노선 {len(bus['routes'])}개 · 노선 모양에 못 붙인 정류소 {bus['unplaced']}곳")
    for line, counts in result["lines"].items():
        print(f"{line}: {counts['official']}/{counts['pairs']} 쌍 (급행 쌍 {counts['express']})")
        for note in counts["notes"]:
            print(f"  {note}")


if __name__ == "__main__":
    main()
