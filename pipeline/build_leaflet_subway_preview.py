#!/usr/bin/env python3
"""Build an honest station map: real tiles + source coordinates, no inferred rail links."""

from __future__ import annotations

import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "build"   # legacy Leaflet page (its TEMPLATE is reused by build_ktdb_gtfs_preview.py)
CSV_PATH = ROOT / "subwayStationMaster_tdata.csv"
OUT_PATH = ROOT / "index.html"


def load() -> list[dict]:
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        return [
            {
                "code": r["외구간_역_수"],
                "name": r["역한글명칭"],
                "line": r["호선명칭"],
                "lon": float(r["환승역X좌표"]),
                "lat": float(r["환승역Y좌표"]),
            }
            for r in csv.DictReader(f)
        ]


def build() -> None:
    rows = load()
    counts = Counter(r["line"] for r in rows)
    parent = list(range(len(rows)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a: int, b: int) -> None:
        a, b = find(a), find(b)
        if a != b:
            parent[b] = a

    by_name: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        by_name[row["name"]].append(index)
    for indexes in by_name.values():
        for pos, a in enumerate(indexes):
            for b in indexes[pos + 1 :]:
                mean_lat = math.radians((rows[a]["lat"] + rows[b]["lat"]) / 2)
                dx = (rows[a]["lon"] - rows[b]["lon"]) * 111.32 * math.cos(mean_lat)
                dy = (rows[a]["lat"] - rows[b]["lat"]) * 110.57
                if math.hypot(dx, dy) <= 0.6:
                    union(a, b)

    groups: dict[int, list[int]] = defaultdict(list)
    for index in range(len(rows)):
        groups[find(index)].append(index)
    stations = []
    row_to_station: dict[int, int] = {}
    for group in groups.values():
        first = rows[group[0]]
        station_id = len(stations)
        for row_index in group:
            row_to_station[row_index] = station_id
        stations.append(
            {
                "id": station_id,
                "name": first["name"],
                "lat": sum(rows[i]["lat"] for i in group) / len(group),
                "lon": sum(rows[i]["lon"] for i in group) / len(group),
                "lines": [{"name": rows[i]["line"], "code": rows[i]["code"]} for i in group],
            }
        )
    paths = {}
    for line in counts:
        ordered = sorted(
            (i for i, row in enumerate(rows) if row["line"] == line),
            key=lambda i: str(rows[i]["code"]),
        )
        station_ids = []
        for row_index in ordered:
            station_id = row_to_station[row_index]
            if not station_ids or station_ids[-1] != station_id:
                station_ids.append(station_id)
        chunks: list[list[int]] = []
        chunk: list[int] = []
        for station_id in station_ids:
            if chunk:
                prev = stations[chunk[-1]]
                current = stations[station_id]
                mean_lat = math.radians((prev["lat"] + current["lat"]) / 2)
                dx = (prev["lon"] - current["lon"]) * 111.32 * math.cos(mean_lat)
                dy = (prev["lat"] - current["lat"]) * 110.57
                if math.hypot(dx, dy) > 15:
                    if len(chunk) > 1:
                        chunks.append(chunk)
                    chunk = []
            chunk.append(station_id)
        if len(chunk) > 1:
            chunks.append(chunk)
        paths[line] = chunks

    # The source station codes mix main lines and branches on these services.
    # Keep their physical paths explicit instead of drawing across code jumps.
    manual_routes = {
        "2호선": [
            ["시청", "을지로입구", "을지로3가", "을지로4가", "동대문역사문화공원", "신당", "상왕십리", "왕십리(성동구청)", "한양대", "뚝섬", "성수", "건대입구", "구의(광진구청)", "강변(동서울터미널)", "잠실나루", "잠실(송파구청)", "잠실새내", "종합운동장", "삼성(무역센터)", "선릉", "역삼", "강남", "교대(법원.검찰청)", "서초", "방배", "사당", "낙성대", "서울대입구(관악구청)", "봉천", "신림", "신대방", "구로디지털단지", "대림(구로구청)", "신도림", "문래", "영등포구청", "당산", "합정", "홍대입구", "신촌", "이대", "아현", "충정로(경기대입구)", "시청"],
            ["성수", "용답", "신답", "용두(동대문구청)", "신설동"],
            ["신도림", "도림천", "양천구청", "신정네거리", "까치산"],
        ],
        "경부선": [
            ["서울역", "남영", "용산", "노량진", "대방", "신길", "영등포", "신도림", "구로", "가산디지털단지", "독산", "금천구청", "석수", "관악", "안양", "명학", "금정", "군포", "당정", "의왕", "성균관대", "화서", "수원", "세류", "병점", "세마", "오산대", "오산", "진위", "송탄", "서정리", "지제", "평택", "성환", "직산", "두정", "천안"],
            ["금천구청", "광명"], ["병점", "서동탄"],
        ],
        "경인선": [["구일", "개봉", "오류동", "온수(성공회대입구)", "역곡", "소사", "부천", "중동", "송내", "부개", "부평", "백운", "동암", "간석", "주안", "도화", "제물포", "도원", "동인천", "인천"]],
        "분당선": [["서울숲", "압구정로데오", "강남구청", "선정릉", "선릉", "한티", "도곡", "구룡", "개포동", "대모산입구", "수서", "복정", "가천대", "태평", "모란", "야탑", "이매", "서현", "수내", "정자", "미금", "오리", "죽전", "보정", "구성", "신갈", "기흥", "상갈", "청명", "영통", "망포", "매탄권선", "수원시청", "매교", "수원"]],
        "경강선": [["판교", "성남", "이매", "삼동", "경기광주", "초월", "곤지암", "신둔도예촌", "이천", "부발", "세종대왕릉", "여주"]],
        "안산선": [["산본", "수리산", "대야미", "반월", "상록수", "한대앞", "중앙", "고잔", "초지", "안산", "신길온천", "정왕", "오이도"]],
    }

    def station_for(name: str, line: str) -> int | None:
        candidates = [s for s in stations if s["name"] == name]
        if not candidates:
            return None
        matching = [s for s in candidates if any(item["name"] == line for item in s["lines"])]
        return (matching or candidates)[0]["id"]

    for line, route_groups in manual_routes.items():
        paths[line] = []
        for names in route_groups:
            ids = [station_for(name, line) for name in names]
            ids = [station_id for station_id in ids if station_id is not None]
            if len(ids) > 1:
                paths[line].append(ids)
    payload = json.dumps(stations, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    count_payload = json.dumps(dict(counts), ensure_ascii=False, separators=(",", ":"))
    path_payload = json.dumps(paths, ensure_ascii=False, separators=(",", ":"))
    html = TEMPLATE.replace("__STATIONS__", payload).replace("__COUNTS__", count_payload).replace("__PATHS__", path_payload).replace("__NODE_COUNT__", str(len(stations)))
    html = html.replace("font-size:11px", "font-size:12px")
    OUT_PATH.write_text(html, encoding="utf-8")
    print(f"built {OUT_PATH}: {len(rows)} source rows, {len(stations)} merged station nodes")


TEMPLATE = r'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>수도권 철도 실제 지도 · 역 위치 탐색</title>
<link rel="stylesheet" href="./vendor/leaflet.css">
<style>
:root{--board:#f3f6f7;--paper:#fff;--ink:#172429;--secondary:#52646a;--muted:#6b7b80;--rule:#cbd5d8;--navy:#102f3d;--orange:#f35b38;--focus:#ffb000;--control:#eef2f3;--selected:#dbe8ec}
*{box-sizing:border-box}html,body{height:100%;margin:0;color:var(--ink);background:var(--board);font-family:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;-webkit-font-smoothing:antialiased}body{overflow:hidden}button,input{font:inherit}button{color:inherit}::selection{background:#ffd76a;color:#10252d}:focus-visible{outline:3px solid var(--focus);outline-offset:2px}.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.app{height:100%;display:grid;grid-template-rows:68px minmax(0,1fr)}.mast{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 24px;background:var(--navy);color:#fff;border-bottom:2px solid var(--orange)}.identity{display:flex;align-items:center;gap:13px;min-width:0}.mark{width:38px;height:38px;border:9px solid var(--orange);border-radius:50%;position:relative;flex:none}.mark:after{content:"";position:absolute;left:-15px;right:-15px;top:6px;height:7px;background:#fff}.identity h1{font-size:19px;line-height:1.1;letter-spacing:-.03em;margin:0}.identity p{margin:3px 0 0;color:#bed0d6;font-size:12px}.source-state{display:flex;align-items:center;gap:8px;color:#d9e4e7;font-size:12px}.source-state i{width:8px;height:8px;border-radius:50%;background:#7bd4a5}.source-state[data-state=loading] i{background:#ffcf66}.source-state[data-state=error] i{background:#ff7f66}.layout{min-height:0;display:grid;grid-template-columns:300px minmax(0,1fr)}
.rail{min-height:0;display:flex;flex-direction:column;background:var(--paper);border-right:1px solid var(--rule)}.search-wrap{padding:16px 16px 12px;border-bottom:1px solid var(--rule);flex:none}.search{position:relative}.search svg{position:absolute;left:12px;top:12px;width:18px;height:18px;color:#62747a}.search input{width:100%;height:42px;border:1px solid #9fadb1;border-radius:5px;background:var(--control);padding:0 12px 0 40px}.search input::placeholder{color:#66777c}.filter-head{display:flex;justify-content:space-between;align-items:center;margin-top:12px}.filter-head strong{font-size:13px}.text-btn{border:0;background:transparent;color:#315d70;padding:7px 0;cursor:pointer;font-size:12px;text-decoration:underline;text-underline-offset:3px}.line-select{width:100%;height:40px;margin-top:5px;border:1px solid #9fadb1;border-radius:5px;background:#fff;padding:0 34px 0 11px;color:var(--ink);cursor:pointer}.line-list{flex:1 1 auto;min-height:0;padding:8px;overflow:auto;scrollbar-color:#89979a #edf1f2}.line-btn{width:100%;min-height:38px;border:0;border-radius:4px;background:transparent;padding:7px 9px;display:grid;grid-template-columns:12px 1fr auto;align-items:center;gap:9px;text-align:left;cursor:pointer;font-size:13px}.line-btn:hover{background:var(--control)}.line-btn[aria-pressed=true]{background:var(--selected);font-weight:700}.swatch{width:11px;height:11px;border-radius:50%;background:var(--line)}.count{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}.provenance{flex:none;padding:13px 16px;border-top:1px solid var(--rule);color:var(--secondary);font-size:11px;line-height:1.5}.provenance strong{display:block;color:var(--ink);margin-bottom:3px}
.map-area{min-width:0;min-height:0;position:relative}.map{width:100%;height:100%;background:#dce5e7}.map-status{position:absolute;z-index:800;top:14px;left:14px;max-width:min(520px,calc(100% - 110px));background:rgba(255,255,255,.96);border:1px solid rgba(32,57,67,.2);border-radius:6px;padding:11px 14px;box-shadow:0 3px 12px rgba(17,44,54,.13)}.map-status h2{font-size:15px;margin:0 0 3px}.map-status p{font-size:12px;color:var(--secondary);margin:0;line-height:1.45}.map-status .pending{color:#8b4b24}.legend{position:absolute;z-index:800;left:14px;bottom:24px;background:rgba(255,255,255,.96);border:1px solid rgba(32,57,67,.2);border-radius:5px;padding:8px 10px;font-size:11px;color:var(--secondary)}.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#fff;border:3px solid #0052a4}.leaflet-control-zoom a{color:var(--navy)!important}.leaflet-popup-content-wrapper{border-radius:7px;color:var(--ink);box-shadow:0 8px 24px rgba(15,39,48,.2)}.leaflet-popup-content{margin:14px 16px;min-width:180px}.popup h3{font-size:17px;margin:0 0 9px;letter-spacing:-.03em}.chips{display:flex;flex-wrap:wrap;gap:5px}.chip{display:inline-flex;align-items:center;gap:5px;border:1px solid #ccd4d5;border-radius:999px;padding:3px 7px;font-size:11px}.chip:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--line)}.coord{margin-top:9px;padding-top:8px;border-top:1px solid #dbe1e2;color:var(--muted);font-size:10px;font-variant-numeric:tabular-nums}.error{position:absolute;z-index:1000;inset:0;display:grid;place-items:center;background:#eef3f4;color:#30454d;text-align:center;padding:30px}.error[hidden]{display:none}
@media(max-width:720px){body{overflow:auto}.app{height:auto;min-height:100%;grid-template-rows:62px auto}.mast{padding:0 12px}.identity h1{font-size:16px}.identity p{font-size:11px}.source-state{display:none}.layout{display:grid;grid-template-columns:1fr;grid-template-rows:auto 70vh}.rail{min-width:0;border-right:0;border-bottom:1px solid var(--rule)}.search-wrap{padding:10px 12px 8px}.filter-head{margin-top:7px}.line-list{display:flex;gap:5px;padding:7px 12px 10px;overflow-x:auto}.line-btn{width:auto;min-width:max-content;grid-template-columns:10px auto auto;border:1px solid #d1d9db;padding:6px 8px}.provenance{display:none}.map-status{top:10px;left:10px;max-width:calc(100% - 64px);padding:9px 11px}.map-status h2{font-size:14px}.map-status p{font-size:11px}.legend{left:10px;bottom:18px}.mark{width:34px;height:34px;border-width:8px}}
@media(max-height:650px) and (min-width:721px){.app{grid-template-rows:56px minmax(0,1fr)}.mast{padding:0 16px}.provenance{display:none}.search-wrap{padding:9px 12px 8px}.search input{height:36px}.search svg{top:9px}.filter-head{margin-top:5px}.line-select{height:34px;margin-top:2px}.line-list{padding-top:5px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
.map{background-color:#edf2f1!important;background-image:linear-gradient(rgba(35,73,78,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(35,73,78,.055) 1px,transparent 1px)!important;background-size:48px 48px!important}.leaflet-tooltip.station-name{background:transparent;border:0;box-shadow:none;color:#24353a;font-size:11px;font-weight:700;line-height:1;padding:0;text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff;white-space:nowrap}.leaflet-tooltip-left.station-name:before,.leaflet-tooltip-right.station-name:before{display:none}
.map-toggle,.train-toggle{position:absolute;z-index:800;right:10px;min-width:86px;height:34px;border:1px solid #8e9b9f;border-radius:5px;background:#fff;padding:0 10px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 7px rgba(17,44,54,.12)}.map-toggle{top:122px}.train-toggle{top:164px}.map-toggle[aria-pressed=true],.train-toggle[aria-pressed=true]{background:var(--navy);color:#fff;border-color:var(--navy)}.leaflet-control.zoom-readout{min-width:34px;margin-top:8px;padding:5px 7px;border:1px solid #8e9b9f;border-radius:4px;background:rgba(255,255,255,.96);color:var(--navy);font-size:11px;font-weight:800;line-height:1;text-align:center;box-shadow:0 1px 5px rgba(17,44,54,.14)}
.train-pin{display:block;width:42px;height:42px;position:relative;filter:drop-shadow(0 4px 4px rgba(10,30,38,.38))}.train-body{position:absolute;left:6px;top:14px;width:30px;height:14px;border:1.5px solid #fff;border-radius:4px 7px 7px 4px;background:linear-gradient(180deg,color-mix(in srgb,var(--train) 72%,#fff),var(--train) 48%,color-mix(in srgb,var(--train) 72%,#000));transform:rotate(calc(var(--heading) - 90deg)) translateY(var(--lane)) skewX(-7deg);transform-origin:50% 50%;box-shadow:inset -5px 0 0 rgba(0,0,0,.14),0 2px 0 rgba(15,42,52,.28)}.train-body:before{content:"";position:absolute;left:2px;right:3px;top:-5px;height:6px;border:1px solid rgba(255,255,255,.9);border-bottom:0;border-radius:4px 6px 0 0;background:linear-gradient(90deg,color-mix(in srgb,var(--train) 48%,#fff),color-mix(in srgb,var(--train) 82%,#fff));clip-path:polygon(8% 0,92% 0,100% 100%,0 100%)}.train-body:after{content:"";position:absolute;left:4px;right:6px;top:3px;height:5px;border-radius:2px;background:repeating-linear-gradient(90deg,#dff5fa 0 5px,#315d70 5px 6px);border:1px solid rgba(9,45,57,.38);box-shadow:20px 5px 0 -2px #fff3a3}.train-pin.express .train-body{outline:2px solid #ffcf66;outline-offset:1px}.train-pin.arrived .train-body{animation:arrivalPulse 1.4s ease-out 2}.train-pin.entering .train-body{box-shadow:inset -5px 0 0 rgba(0,0,0,.14),0 2px 0 rgba(15,42,52,.28),0 0 0 2px color-mix(in srgb,var(--train) 42%,transparent)}@keyframes arrivalPulse{0%{filter:brightness(1);box-shadow:inset -5px 0 0 rgba(0,0,0,.14),0 0 0 0 color-mix(in srgb,var(--train) 70%,transparent)}70%{filter:brightness(1.12);box-shadow:inset -5px 0 0 rgba(0,0,0,.14),0 0 0 7px transparent}100%{filter:brightness(1);box-shadow:inset -5px 0 0 rgba(0,0,0,.14),0 0 0 0 transparent}}.train-popup strong{display:block;font-size:15px;margin-bottom:6px}.train-popup dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:0;font-size:11px}.train-popup dt{color:var(--muted)}.train-popup dd{margin:0;font-weight:700}.live-legend{margin-left:10px;padding-left:10px;border-left:1px solid #c7d1d4}.live-legend i{background:#f35b38;border:2px solid #fff;box-shadow:0 0 0 1px #52646a}
</style>
</head>
<body>
<main class="app">
  <header class="mast"><div class="identity"><span class="mark" aria-hidden="true"></span><div><h1>수도권 철도 노선 위치도</h1><p>원본 784행 · 통합 __NODE_COUNT__개 역 노드</p></div></div><div id="liveState" class="source-state" data-state="loading"><i></i><span>실시간 열차 불러오는 중</span></div></header>
  <div class="layout">
    <aside class="rail" aria-label="노선 탐색">
      <div class="search-wrap"><div class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 5 5" fill="none" stroke="currentColor" stroke-width="2"/></svg><label class="sr" for="search">역명 검색</label><input id="search" type="search" placeholder="역명을 입력하세요" autocomplete="off"></div><div class="filter-head"><strong>노선 필터</strong><button id="resetFilter" class="text-btn" type="button">전체 보기</button></div><label class="sr" for="lineSelect">노선 선택</label><select id="lineSelect" class="line-select"><option value="all">전체 노선</option></select></div>
      <div id="lineList" class="line-list"></div>
      <div class="provenance"><strong>현재 표시 기준</strong>동일 호선은 역 코드 순서로 연결했습니다. 동일 역명·600m 이내 좌표는 하나의 환승 노드로 통합했습니다.</div>
    </aside>
    <section class="map-area" aria-labelledby="mapTitle">
      <div id="map" class="map" role="application" aria-label="수도권 철도역 실제 지도"></div>
      <button id="toggleMap" class="map-toggle" type="button" aria-pressed="false">지도 켜기</button>
      <button id="toggleTrains" class="train-toggle" type="button" aria-pressed="true">열차 숨기기</button>
      <div class="map-status"><h2 id="mapTitle">__NODE_COUNT__개 역 노드 전체 보기</h2><p id="status" role="status" aria-live="polite">같은 호선의 역을 순서대로 연결했습니다. 겹치는 환승역은 하나의 점과 이름으로 표시합니다.</p></div>
      <div class="legend"><span><i></i> 원본 좌표 기준 역 위치</span><span class="live-legend"><i></i> 실시간 열차</span></div>
      <div id="error" class="error" hidden><div><strong>지도를 불러오지 못했습니다.</strong><br>네트워크 상태를 확인한 뒤 새로고침해 주세요.</div></div>
    </section>
  </div>
</main>
<script id="stationData" type="application/json">__STATIONS__</script>
<script id="lineCounts" type="application/json">__COUNTS__</script>
<script id="linePaths" type="application/json">__PATHS__</script>
<script src="./vendor/leaflet.js"></script>
<script src="./vendor/leaflet.polylineoffset.js"></script>
<script>
(()=>{'use strict';
const stations=JSON.parse(document.getElementById('stationData').textContent),counts=JSON.parse(document.getElementById('lineCounts').textContent),paths=JSON.parse(document.getElementById('linePaths').textContent);
const colors={'1호선':'#0052A4','2호선':'#00A84D','3호선':'#EF7C1C','4호선':'#00A5DE','5호선':'#996CAC','6호선':'#CD7C2F','7호선':'#747F00','8호선':'#E6186C','9호선':'#BDB092','GTX-A':'#9A6292','경강선':'#0054A6','경의중앙선':'#77C4A3','경춘선':'#178C72','공항철도':'#0090D2','김포골드라인':'#AD8605','서해선':'#8FC31F','수인분당선':'#F5A200','신림선':'#6789CA','신분당선':'#D4003B','에버라인선':'#6FB245','우이신설선':'#B7C452','의정부선':'#FDA600','인천1호선':'#7CA8D5','인천2호선':'#ED8B00'};const color=l=>{if(!colors[l])throw new Error(`미등록 노선색: ${l}`);return colors[l]};
if(!window.L){document.getElementById('error').hidden=false;return}const map=L.map('map',{zoomControl:false,minZoom:7,maxZoom:18,attributionControl:false}).setView([37.53,126.98],10);L.control.zoom({position:'topright'}).addTo(map);const zoomReadout=L.control({position:'topright'});zoomReadout.onAdd=()=>{const el=L.DomUtil.create('div','zoom-readout');el.id='zoomLevel';el.setAttribute('aria-label','현재 지도 확대 단계');el.textContent=`줌 ${map.getZoom()}`;return el};zoomReadout.addTo(map);const updateZoomReadout=()=>{const el=document.getElementById('zoomLevel');if(el)el.textContent=`줌 ${map.getZoom()}`};map.on('zoomend',updateZoomReadout);const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19});const attribution=L.control.attribution({prefix:false});attribution.addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors');
const lineLayer=L.layerGroup().addTo(map),layer=L.layerGroup().addTo(map),trainLayer=L.layerGroup().addTo(map),markers=[],trainMarkers=[],trainMarkerById=new Map(),lineShapes={};function popup(s){const express=s.express?.length?`<div class="coord">급행 정차 · ${s.express.map(escapeHtml).join(', ')}</div>`:'';return `<div class="popup"><h3>${escapeHtml(s.name)}${s.express?.length?' (급행)':''}</h3><div class="chips">${s.lines.map(x=>`<span class="chip" style="--line:${color(x.name)}">${escapeHtml(x.name)} · ${escapeHtml(String(x.code))}</span>`).join('')}</div>${express}<div class="coord">${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}</div></div>`}function escapeHtml(v){return String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
const edgeLines={};Object.entries(paths).forEach(([line,chunks])=>chunks.forEach(ids=>ids.slice(1).forEach((id,i)=>{const a=ids[i],key=a<id?`${a}:${id}`:`${id}:${a}`;(edgeLines[key]??=new Set()).add(line)})));Object.entries(paths).forEach(([line,chunks])=>{lineShapes[line]=[];chunks.forEach(ids=>ids.slice(1).forEach((id,i)=>{const a=ids[i],key=a<id?`${a}:${id}`:`${id}:${a}`,shared=[...edgeLines[key]].sort((x,y)=>x.localeCompare(y,'ko')),offset=(shared.indexOf(line)-(shared.length-1)/2)*6,shape=L.polyline([[stations[a].lat,stations[a].lon],[stations[id].lat,stations[id].lon]],{color:color(line),weight:3,opacity:.88,lineCap:'round',lineJoin:'round',offset}).bindTooltip(line,{sticky:true});shape.on('add',()=>{const el=shape.getElement();if(el){el.dataset.line=line;el.dataset.shared=String(shared.length);el.dataset.offset=String(offset);el.dataset.edge=key}});shape.addTo(lineLayer);lineShapes[line].push(shape)}))});
stations.forEach((s,index)=>{const primary=s.lines[0].name,label=s.name+(s.express?.length?' (급행)':''),m=L.circleMarker([s.lat,s.lon],{radius:s.lines.length>1?5:4,color:color(primary),weight:s.lines.length>1?3:2,fillColor:'#fff',fillOpacity:1,opacity:.95}).bindPopup(popup(s)).bindTooltip(label,{permanent:true,direction:index%2?'right':'left',offset:index%2?[6,0]:[-6,0],className:'station-name'});m.station=s;markers.push(m);m.addTo(layer)});
const lines=Object.keys(counts).sort((a,b)=>a.localeCompare(b,'ko')),lineList=document.getElementById('lineList'),lineSelect=document.getElementById('lineSelect');let selected='all';lines.forEach(line=>{const option=document.createElement('option');option.value=line;option.textContent=`${line} · ${counts[line]}개 역`;lineSelect.append(option);const b=document.createElement('button');b.type='button';b.className='line-btn';b.dataset.line=line;b.setAttribute('aria-pressed','false');b.innerHTML=`<span class="swatch" style="--line:${color(line)}"></span><span>${line}</span><span class="count">${counts[line]}</span>`;b.onclick=()=>filterLine(selected===line?'all':line);lineList.append(b)});lineSelect.onchange=e=>filterLine(e.target.value);
function show(test,message){layer.clearLayers();let n=0;markers.forEach(m=>{if(test(m.station)){m.addTo(layer);n++}});document.getElementById('status').textContent=`${message} · ${n}개 역 위치와 역명을 표시합니다.`;return n}
function filterLine(line){selected=line;lineSelect.value=line;document.querySelectorAll('.line-btn').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.line===line)));lineLayer.clearLayers();Object.entries(lineShapes).forEach(([name,shapes])=>{if(line==='all'||name===line)shapes.forEach(shape=>shape.addTo(lineLayer))});show(s=>line==='all'||s.lines.some(x=>x.name===line),line==='all'?'전체 노선':line);renderVisibleTrains();if(line!=='all'){const visible=markers.filter(m=>m.station.lines.some(x=>x.name===line));if(visible.length)map.fitBounds(L.featureGroup(visible).getBounds().pad(.12))}else map.setView([37.53,126.98],10);scheduleViewportRefresh()}
const stationKey=v=>String(v||'').replace(/\([^)]*\)/g,'').replace(/(종착|지선|역)$/,'').replace(/\s/g,'').toLocaleLowerCase('ko');const stationByLine=new Map();stations.forEach(s=>s.lines.forEach(x=>stationByLine.set(`${x.name}:${stationKey(s.name)}`,s)));let trainsEnabled=true;
function renderVisibleTrains(){trainLayer.clearLayers();if(!trainsEnabled)return;trainMarkers.forEach(m=>{if(selected==='all'||m.train.line===selected)m.addTo(trainLayer)})}
function lerp(a,b,p){return [a.lat+(b.lat-a.lat)*p,a.lon+(b.lon-a.lon)*p]}function distanceMeters(a,b){const rad=Math.PI/180,x=(b.lon-a.lon)*rad*Math.cos((a.lat+b.lat)*rad/2),y=(b.lat-a.lat)*rad;return Math.sqrt(x*x+y*y)*6371000}function headingBetween(a,b){return Math.atan2(b.lon-a.lon,b.lat-a.lat)*180/Math.PI}function receivedAgeSeconds(value){const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);if(!match)return 0;const [,y,m,d,h,min,sec]=match,received=Date.UTC(+y,+m-1,+d,+h-9,+min,+sec);return Math.max(0,(Date.now()-received)/1000)}function routeStep(t,s){const destination=stationByLine.get(`${t.line}:${stationKey(t.destination)}`),linePaths=paths[t.line]||[],branchDestination=/신설동|성수지선|신도림지선|까치산/.test(String(t.destination||''));if(t.line==='2호선'&&!branchDestination&&linePaths[0]){const raw=linePaths[0],closure=raw.indexOf(raw[0],1),cycle=closure>1?raw.slice(0,closure):raw,i=cycle.indexOf(s.id);if(i>=0){const sign=t.direction.includes('외')?-1:1,n=cycle.length;return {next:stations[cycle[(i+sign+n)%n]],previous:stations[cycle[(i-sign+n)%n]]}}}let best=null;for(const ids of linePaths){for(let i=0;i<ids.length-1;i++){if(ids[i]!==s.id)continue;if(destination){for(let j=i+1;j<ids.length;j++){if(ids[j]===destination.id&&(!best||j-i<best.distance))best={ids,at:i,sign:1,distance:j-i}}}else if(!best)best={ids,at:i,sign:t.direction.includes('상')?-1:1,distance:Infinity}}}if(!best)return {next:null,previous:null};return {next:stations[best.ids[best.at+best.sign]],previous:stations[best.ids[best.at-best.sign]]}}function motionFor(t,s){const {next,previous}=routeStep(t,s),atStation=[s.lat,s.lon],age=receivedAgeSeconds(t.receivedAt),segmentSeconds=next?Math.max(35,Math.min(180,distanceMeters(s,next)/9.5)):0,heading=next?headingBetween(s,next):0;function outbound(elapsed){if(!next||!segmentSeconds)return {start:atStation,end:atStation,duration:0,heading};const progress=Math.min(.96,Math.max(0,elapsed)/segmentSeconds);return {start:lerp(s,next,progress),end:[next.lat,next.lon],duration:Math.max(0,(segmentSeconds-elapsed)*1000),heading}}if(t.status==='출발')return outbound(age);if(t.status==='도착')return {start:atStation,end:atStation,duration:0,heading};if(t.status==='진입'&&previous){const enteringSeconds=Math.max(7,Math.min(45,t.etaSeconds||distanceMeters(previous,s)*.42/9.5)),enteringHeading=headingBetween(previous,s);if(age>=enteringSeconds)return {start:atStation,end:atStation,duration:0,heading};const progress=.58+.42*(age/enteringSeconds);return {start:lerp(previous,s,progress),end:atStation,duration:(enteringSeconds-age)*1000,heading:enteringHeading}}return {start:atStation,end:atStation,duration:0,heading}}
function animateMarker(marker,start,end,duration){if(marker._motionFrame)cancelAnimationFrame(marker._motionFrame);if(!duration||matchMedia('(prefers-reduced-motion: reduce)').matches){marker.setLatLng(end);return}const began=performance.now();function frame(now){const p=Math.min(1,(now-began)/duration);marker.setLatLng([start[0]+(end[0]-start[0])*p,start[1]+(end[1]-start[1])*p]);if(p<1)marker._motionFrame=requestAnimationFrame(frame);else marker._motionFrame=null}marker._motionFrame=requestAnimationFrame(frame)}
function trainIcon(t,moving=false,heading=0){const stateClass=t.status==='도착'?' arrived':t.status==='진입'?' entering':'',direction=t.direction.includes('내')?'내':t.direction.includes('외')?'외':t.direction.includes('상')?'상':t.direction.includes('하')?'하':'·',lane=(direction==='상'||direction==='내')?7:(direction==='하'||direction==='외')?-7:0;return L.divIcon({className:'',html:`<span class="train-pin${t.express?' express':''}${stateClass}" data-status="${escapeHtml(t.status)}" data-moving="${moving}" data-direction="${escapeHtml(direction)}" data-lane="${lane}" style="--train:${color(t.line)};--heading:${heading}deg;--lane:${lane}px" aria-label="${escapeHtml(t.line)} ${escapeHtml(direction)}행 열차"><span class="train-body"></span></span>`,iconSize:[42,42],iconAnchor:[21,21]})}function trainPopup(t){const tags=[t.express?'급행':'',t.last?'막차':''].filter(Boolean).join(' · ');return `<div class="train-popup"><strong>${escapeHtml(t.line)} ${escapeHtml(t.trainNo)}열차</strong><dl><dt>현재</dt><dd>${escapeHtml(t.station)} · ${escapeHtml(t.status)}</dd><dt>방향</dt><dd>${escapeHtml(t.destination)}행 · ${escapeHtml(t.direction)}</dd>${tags?`<dt>구분</dt><dd>${escapeHtml(tags)}</dd>`:''}<dt>수신</dt><dd>${escapeHtml(t.receivedAt||'확인 중')}</dd></dl></div>`}
function renderTrains(data){const seen=new Set(),collisions={};(data.trains||[]).forEach(t=>{const s=stationByLine.get(`${t.line}:${stationKey(t.station)}`);if(!s)return;const id=`${t.line}:${t.trainNo}`,eventKey=`${t.receivedAt}|${t.station}|${t.status}`,collisionKey=`${s.id}:${t.line}`,slot=collisions[collisionKey]||0;collisions[collisionKey]=slot+1;const angle=slot*2.39996,r=.0001*Math.ceil((slot+1)/2),offset=[Math.sin(angle)*r,Math.cos(angle)*r],motion=motionFor(t,s),plannedStart=[motion.start[0]+offset[0],motion.start[1]+offset[1]],end=[motion.end[0]+offset[0],motion.end[1]+offset[1]];let marker=trainMarkerById.get(id);if(!marker){marker=L.marker(plannedStart,{icon:trainIcon(t,motion.duration>0,motion.heading),zIndexOffset:1000,title:`${t.line} ${t.trainNo}`}).bindPopup(trainPopup(t));marker._eventKey='';trainMarkerById.set(id,marker)}marker.train=t;marker.setPopupContent(trainPopup(t));seen.add(id);if(marker._eventKey!==eventKey){const current=marker._eventKey?[marker.getLatLng().lat,marker.getLatLng().lng]:plannedStart;marker._eventKey=eventKey;marker.setIcon(trainIcon(t,motion.duration>0,motion.heading));animateMarker(marker,current,end,motion.duration)}});for(const [id,marker] of trainMarkerById){if(!seen.has(id)){if(marker._motionFrame)cancelAnimationFrame(marker._motionFrame);trainLayer.removeLayer(marker);trainMarkerById.delete(id)}}trainMarkers.splice(0,trainMarkers.length,...trainMarkerById.values());renderVisibleTrains();const state=document.getElementById('liveState'),when=data.fetchedAt?new Date(data.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'',label=(data.lines||[]).join('·');state.dataset.state=data.warnings?.length?'error':'live';state.querySelector('span').textContent=`추정 위치 ${trainMarkers.length}대 · ${label} · ${when}`}
function clearTrains(){for(const marker of trainMarkerById.values()){if(marker._motionFrame)cancelAnimationFrame(marker._motionFrame)}trainMarkerById.clear();trainMarkers.length=0;trainLayer.clearLayers()}function focusedViewport(){return selected==='all'?{lines:[],message:'노선 하나를 선택하면 실시간 열차를 표시합니다'}:{lines:[selected],message:`${selected} 전체 열차`}}
let refreshTimer=null,currentViewportLines=[];function scheduleViewportRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refreshViewport(true),350)}async function refreshViewport(force=false){const focus=focusedViewport(),lines=focus.lines,state=document.getElementById('liveState'),key=lines.join(',');currentViewportLines=lines;if(!lines.length){clearTrains();state.dataset.state='loading';state.querySelector('span').textContent=focus.message;return}state.dataset.state='loading';state.querySelector('span').textContent=`${focus.message} · 최신 위치 확인 중`;try{const response=await fetch(`./api/live?lines=${encodeURIComponent(key)}`,{headers:{Accept:'application/json'},cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'응답 오류');if(currentViewportLines.join(',')===key)renderTrains(data)}catch(error){state.dataset.state='error';state.querySelector('span').textContent='실시간 위치 연결 실패 · 잠시 후 재시도'}}
document.getElementById('resetFilter').onclick=()=>{document.getElementById('search').value='';filterLine('all')};document.getElementById('search').addEventListener('input',e=>{const q=e.target.value.trim().toLocaleLowerCase('ko');const n=show(s=>(!q||s.name.toLocaleLowerCase('ko').includes(q))&&(selected==='all'||s.lines.some(x=>x.name===selected)),q?`“${escapeHtml(e.target.value.trim())}” 검색 결과`:selected==='all'?'전체 노선':selected);if(n===1){const only=markers.find(m=>map.hasLayer(m));map.setView(only.getLatLng(),14);only.openPopup()}});document.getElementById('toggleMap').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(on));e.currentTarget.textContent=on?'지도 끄기':'지도 켜기';if(on){tiles.addTo(map);attribution.addTo(map)}else{map.removeLayer(tiles);map.removeControl(attribution)}};document.getElementById('toggleTrains').onclick=e=>{trainsEnabled=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(trainsEnabled));e.currentTarget.textContent=trainsEnabled?'열차 숨기기':'열차 보이기';renderVisibleTrains()};map.on('moveend zoomend',scheduleViewportRefresh);window.__subwayLive={refresh:()=>refreshViewport(true),receivedAgeSeconds,headingProbe:(a,b)=>headingBetween(a,b),routeProbe:(line,station,destination,direction)=>{const s=stationByLine.get(`${line}:${stationKey(station)}`),step=s?routeStep({line,destination,direction},s):{};return {next:step.next?.name||null,previous:step.previous?.name||null}},movingPositions:()=>[...trainMarkerById].filter(([,m])=>m._motionFrame).map(([id,m])=>({id,lat:m.getLatLng().lat,lng:m.getLatLng().lng}))};refreshViewport(true);setInterval(()=>refreshViewport(false),95000);
})();
</script>
</body></html>'''

if __name__ == "__main__":
    build()
