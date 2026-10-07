#!/usr/bin/env python3
"""Keyless Seoul bus workbook → data/bus/{routes,stops,manifest}.json.

Only the standard library is needed. Raw workbooks stay in ignored build/bus-source/.
Usage: python3 pipeline/bus_build_static.py [--date 20260902] [--offline]
The path is an ordered stop polyline, NOT a surveyed/road-matched route.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
DATASETS = {"services": "OA-15066", "stops": "OA-15067", "sequences": "OA-1095"}
TYPES = {"간선": ("trunk", "3", "#2563eb"), "지선": ("branch", "4", "#16a34a"),
         "광역": ("express", "6", "#dc2626"), "순환": ("circular", "5", "#eab308"),
         "심야": ("night", "3", "#2563eb")}


def route_type(row: dict):
    official = row.get("유형", "")
    if official in TYPES:
        return (*TYPES[official], "official")
    # The 2026-09 workbook leaves ALL 15 city night services' type cells blank.
    # Airport N6000 etc have an explicit airport type and must stay excluded.
    name = row.get("노선번호", "")
    if not official and (re.fullmatch(r"N\d{2}", name) or name.startswith("심야")):
        return "night", None, "#2563eb", "name"
    return None


def xlsx_rows(path: Path):
    """Read the first sheet, keeping sparse cells and leading-zero string IDs."""
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = ["".join(t.text or "" for t in si.findall(".//m:t", NS))
                       for si in root.findall("m:si", NS)]
        with archive.open("xl/worksheets/sheet1.xml") as stream:
            context = ET.iterparse(stream, events=("start", "end"))
            _, root = next(context)
            headers = None
            for event, row in context:
                if event != "end" or row.tag != f"{{{NS['m']}}}row":
                    continue
                cells = {}
                for cell in row:
                    col = re.match(r"[A-Z]+", cell.attrib["r"]).group()
                    value = cell.findtext("m:v", "", NS)
                    if cell.get("t") == "s":
                        value = strings[int(value)]
                    elif cell.get("t") == "inlineStr":
                        value = "".join(t.text or "" for t in cell.findall(".//m:t", NS))
                    cells[col] = value.strip()
                if headers is None:
                    headers = cells
                elif any(cells.values()):
                    yield {name: cells.get(col, "") for col, name in headers.items()}
                row.clear()
                root.clear()


def download(role: str, cache: Path, date: str | None, offline: bool) -> tuple[Path, dict]:
    dataset = DATASETS[role]
    path = cache / f"{dataset}.xlsx"
    meta_path = cache / f"{dataset}.json"
    if offline:
        meta = json.loads(meta_path.read_text())
        if date and meta["date"] != date:
            raise ValueError(f"cached {dataset} does not match --date")
        if hashlib.sha256(path.read_bytes()).hexdigest() != meta["sha256"]:
            raise ValueError(f"cached {dataset} checksum mismatch")
        return path, meta
    page = f"https://data.seoul.go.kr/dataList/{dataset}/F/1/datasetView.do"
    with urllib.request.urlopen(page, timeout=30) as response:
        html = response.read(2_000_000).decode("utf-8")
    form = re.search(r'<form name="frmFile".*?</form>', html, re.S)
    if not form:
        raise ValueError(f"download form missing: {dataset}")
    inf_seq = re.search(r'name="infSeq" value="(\d+)"', form.group()).group(1)
    files = re.findall(r'<span title="([^"<>]+\.xlsx)" onclick="javascript:downloadFile\(\'(\d+)\'\);">', html)
    choices = [(name, seq, re.search(r"(20\d{6})", name).group(1))
               for name, seq in files if re.search(r"20\d{6}", name)]
    choices = [choice for choice in choices if not date or choice[2] == date]
    if not choices:
        raise ValueError(f"no matching workbook: {dataset}")
    name, seq, day = max(choices, key=lambda choice: choice[2])
    url = "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?" + urllib.parse.urlencode(
        {"infId": dataset, "infSeq": inf_seq, "seq": seq})
    with urllib.request.urlopen(url, timeout=45) as response:
        blob = response.read(12_000_001)
    if len(blob) > 12_000_000 or not blob.startswith(b"PK"):
        raise ValueError(f"invalid/oversized workbook: {dataset}")
    cache.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    meta = {"dataset": dataset, "name": name, "date": day, "url": page, "downloadUrl": url,
            "sha256": hashlib.sha256(blob).hexdigest(), "bytes": len(blob)}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    return path, meta


def stop_from_row(row: dict) -> dict:
    lng, lat = float(row["X좌표"]), float(row["Y좌표"])
    if not (math.isfinite(lng) and math.isfinite(lat) and 124 < lng < 132 and 33 < lat < 40):
        raise ValueError("invalid WGS84 stop coordinates")
    sid = row["NODE_ID"]
    if not re.fullmatch(r"\d{9}", sid):
        raise ValueError("invalid standard stop ID")
    ars = row.get("ARS_ID", "")
    if ars.isdigit():
        ars = ars.zfill(5)
    return {"id": sid, "arsId": ars or None, "name": row["정류소명"],
            "lng": round(lng, 6), "lat": round(lat, 6)}


def build(services, stop_rows, sequences) -> tuple[list[dict], list[dict], dict]:
    services_by_name = {}
    for row in services:
        name = row.get("노선번호", "")
        if name:
            previous = services_by_name.get(name)
            if previous and previous["유형"] != row["유형"]:
                raise ValueError("conflicting official route types")
            services_by_name[name] = row
    # Sequence rows include Seoul routes' stops outside Seoul; keep those too.
    # 한강선착장(한강버스 배 타는 곳)은 버스 정류장이 아니다.
    stop_rows = list(stop_rows)
    stop_master = {stop["id"]: stop for stop in map(stop_from_row, stop_rows)}
    piers = {row["NODE_ID"] for row in stop_rows if row.get("정류소타입") == "한강선착장"}
    grouped = defaultdict(list)
    excluded = set()
    unknown = set()
    source_routes = set()
    for row in sequences:
        rid, name = row["ROUTE_ID"], row["노선명"]
        source_routes.add(rid)
        if name not in services_by_name:
            unknown.add(name)
            continue
        if route_type(services_by_name[name]) is None:
            excluded.add(rid)
            continue
        if not re.fullmatch(r"\d{9}", rid):
            raise ValueError("invalid standard route ID")
        grouped[rid].append(row)
    routes, used_stops = [], {}
    included_names = set()
    for rid, rows in sorted(grouped.items()):
        rows.sort(key=lambda row: int(row["순번"]))
        orders = [int(row["순번"]) for row in rows]
        if len(set(orders)) != len(orders) or min(orders) < 1 or len(rows) < 2:
            raise ValueError(f"invalid stop sequence: {rid}")
        name = rows[0]["노선명"]
        if any(row["노선명"] != name for row in rows):
            raise ValueError("conflicting route names")
        info = services_by_name[name]
        kind, code, color, type_source = route_type(info)
        stops = [stop_from_row(row) for row in rows]
        path = [[stop["lng"], stop["lat"]] for stop in stops]
        for stop in stops:
            if stop["id"] in used_stops and used_stops[stop["id"]] != stop:
                raise ValueError(f"conflicting sequence stop: {stop['id']}")
            used_stops[stop["id"]] = stop
        routes.append({"id": rid, "name": name, "type": kind, "typeCode": code, "color": color,
                       "typeSource": type_source, "stopIds": [stop["id"] for stop in stops],
                       "stopSequences": orders, "path": path,
                       "bbox": [min(p[0] for p in path), min(p[1] for p in path),
                                max(p[0] for p in path), max(p[1] for p in path)],
                       "pathSource": "stops", "start": info.get("기점명"), "end": info.get("종점명")})
        included_names.add(name)
    missing = sorted(name for name, row in services_by_name.items()
                     if route_type(row) is not None and name not in included_names)
    served = len(used_stops)
    # 마을버스 · 공항버스만 서는 정류장, 서울에 있지만 경기 · 인천 버스만 서는 정류장(잠실광역환승센터 등)도
    # 실제로 있는 정류장이다. 노선을 그리지 않아도 정류장은 다 찍고, 도착 정보는 정류장 번호로 받는다.
    unserved = {sid: stop for sid, stop in stop_master.items() if sid not in used_stops and sid not in piers}
    stats = {"routes": len(routes), "stops": served + len(unserved), "servedStops": served, "routeStops": sum(len(r["stopIds"]) for r in routes),
             "types": dict(sorted(Counter(r["type"] for r in routes).items())),
             "sourceRouteCount": len(source_routes), "sourceStopCount": len(stop_master),
             "sourceServiceCount": len(services_by_name), "excludedRouteCount": len(excluded),
             "unmatchedSequenceNames": sorted(unknown), "missingRouteNames": missing,
             "servedStopsOutsideMaster": len(set(used_stops) - set(stop_master))}
    stats["routesWithSequenceGaps"] = [r["id"] for r in routes
                                       if r["stopSequences"] != list(range(1, len(r["stopIds"]) + 1))]
    if not routes or missing:
        raise ValueError(f"incomplete route build: {missing}")
    return routes, sorted([*used_stops.values(), *unserved.values()], key=lambda stop: stop["id"]), stats


def write_json(path: Path, value: dict) -> dict:
    raw = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    temp = path.with_suffix(".tmp")
    temp.write_bytes(raw)
    temp.replace(path)
    return {"bytes": len(raw), "gzipBytes": len(gzip.compress(raw, mtime=0)),
            "sha256": hashlib.sha256(raw).hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / "build" / "bus-source")
    parser.add_argument("--out", type=Path, default=ROOT / "data" / "bus")
    parser.add_argument("--date", help="Pin source workbook YYYYMMDD")
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    sources = {role: download(role, args.source_dir, args.date, args.offline) for role in DATASETS}
    dates = {meta["date"] for _, meta in sources.values()}
    if len(dates) != 1:
        raise ValueError("source dates differ; rebuild with --date YYYYMMDD")
    routes, stops, stats = build(*(xlsx_rows(sources[role][0]) for role in DATASETS))
    generated = datetime.now(timezone.utc).isoformat()
    source = {"name": "서울특별시 열린데이터광장", "url": sources["sequences"][1]["url"],
              "updatedAt": datetime.strptime(dates.pop(), "%Y%m%d").date().isoformat(),
              "license": "공공누리 제1유형 (출처표시)", "datasets": [meta for _, meta in sources.values()]}
    common = {"schemaVersion": 1, "generatedAt": generated, "source": source}
    args.out.mkdir(parents=True, exist_ok=True)
    files = {"routes.json": write_json(args.out / "routes.json", {**common, "routes": routes}),
             "stops.json": write_json(args.out / "stops.json", {**common, "stops": stops})}
    write_json(args.out / "manifest.json", {**common, "counts": stats, "files": files,
                                          "pathQuality": "ordered-stop approximation; not road geometry"})
    print(json.dumps({"counts": stats, "files": files}, ensure_ascii=False))


if __name__ == "__main__":
    main()
