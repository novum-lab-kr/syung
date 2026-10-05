#!/usr/bin/env python3
"""OSM 승강장 면을 수도권 전체에서 한 번에 받아 data/osm-tracks/platforms-raw.json 에 저장한다.

조회 조건(2026-10-05, 전 역 카카오 맞춤 0단계):
- 범위: 수도권 전체 bbox(build_track_shapes.BBOX 와 같음, 36.7,126.3 ~ 38.2,128.0)
- 태그: railway=platform, 또는 public_transport=platform (버스 승강장 제외: bus=yes · highway=bus_stop/platform)
- 종류: way 와 relation(멀티폴리곤 승강장) 둘 다, out geom 으로 좌표 포함
예전 파일(2026-05-31 기준)은 서울 안쪽 · railway=platform way 만이라 432개였다.
결과 파일은 .gitignore 대상(크고 다시 받을 수 있음)이고, 조회 조건은 이 파일이 기록이다.
쓰는 곳: pipeline/osm_platforms.py (승강장 면 → 역 맞춤), build_track_shapes.py (PLATFORM_AREAS).
Track data © OpenStreetMap contributors (ODbL).
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "osm-tracks" / "platforms-raw.json"
BBOX = "36.7,126.3,38.2,128.0"   # build_track_shapes.BBOX 와 같은 수도권 범위
USER_AGENT = "nol-meok-subway-preview/1.0"
MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
           "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
NOT_BUS = '["bus"!="yes"]["highway"!~"^(bus_stop|platform)$"]'
QUERY = (f'[out:json][timeout:600][bbox:{BBOX}];('
         'way["railway"="platform"];'
         'relation["railway"="platform"];'
         f'way["public_transport"="platform"]{NOT_BUS};'
         f'relation["public_transport"="platform"]{NOT_BUS};'
         ');out geom tags;')


def fetch(query: str = QUERY) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(6):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=700) as res:
                return json.load(res)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:  # 붐비는 공용 서버
            if isinstance(exc, urllib.error.HTTPError) and exc.code not in (429, 502, 503, 504) or attempt == 5:
                raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("unreachable")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--print-query", action="store_true", help="조회문만 보여 주고 끝")
    a = ap.parse_args()
    if a.print_query:
        print(QUERY)
        raise SystemExit
    data = fetch()
    data["query"] = QUERY
    a.out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    kinds = Counter((e["type"], "railway" if e.get("tags", {}).get("railway") == "platform" else "public_transport")
                    for e in data["elements"])
    print(json.dumps({"elements": len(data["elements"]), "osm_base": data.get("osm3s", {}).get("timestamp_osm_base"),
                      "by_kind": {f"{t}/{k}": n for (t, k), n in sorted(kinds.items())}}, ensure_ascii=False))
