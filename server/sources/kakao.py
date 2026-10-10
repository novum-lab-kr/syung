"""카카오 로컬 검색(KAKAO_REST_KEY): 검색어 → 장소 좌표. 키는 헤더로만 보낸다."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request


def search_places(key: str, query: str, near: tuple[float, float] | None = None) -> list[dict]:
    """Kakao keyword search, then address search: [{name, address, lat, lng}]."""
    if not key:
        raise RuntimeError("KAKAO_REST_KEY 가 설정되지 않았어요")
    out = []
    for kind in ("keyword", "address"):
        params = {"query": query, "size": 8}
        if near and kind == "keyword":
            params.update(y=near[0], x=near[1], sort="accuracy")
        req = urllib.request.Request(f"https://dapi.kakao.com/v2/local/search/{kind}.json?{urllib.parse.urlencode(params)}",
                                     headers={"Authorization": f"KakaoAK {key}"})
        with urllib.request.urlopen(req, timeout=8) as r:
            docs = json.load(r).get("documents") or []
        for d in docs:
            out.append({"name": d.get("place_name") or d.get("address_name"),
                        "address": d.get("road_address_name") or d.get("address_name") or "",
                        "lat": float(d["y"]), "lng": float(d["x"])})
        if out:
            break
    return out
