"""서울 버스 API(ws.bus.go.kr): 노선별 버스 위치 · 정류장 도착 정보.

호출 한 번 = 장부 한 칸은 services 가 미리 잡는다(store/bus_quota.py). 여기는 부르고 봉투를 풀기만 한다.
오류는 고정 코드의 BusError 로만 내보낸다(urllib 예외에는 키가 든 주소가 있을 수 있다).
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from server.errors import BusError

# The official service documents HTTP; HTTPS timed out in the 2026-10-03 probe.
API_URL = "http://ws.bus.go.kr/api/rest/buspos/getBusPosByRtid"
# 정류소정보조회: 정류장 번호(arsId) 하나로 그 정류장의 모든 노선 도착 예정을 한 번에 준다(2026-10-07 승인)
ARRIVAL_URL = "http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid"


def parse_payload(raw: bytes) -> list[dict]:
    """Both the bus XML envelope and resultType=json envelope; never echo errors."""
    if len(raw) > 2_000_000 or b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise BusError("invalid_payload")
    try:
        if raw.lstrip().startswith(b"{"):
            payload = json.loads(raw)
            header = payload.get("msgHeader")
            if not isinstance(header, dict):
                raise BusError("invalid_payload")
            code = str(header.get("headerCd", ""))
            body = payload.get("msgBody")
            if body is None or body == "":
                body = {}
            if not isinstance(body, dict):
                raise BusError("invalid_payload")
            items = body.get("itemList")
            if items is None or items == "":
                items = []
            if isinstance(items, dict):
                items = [items]
        else:
            root = ET.fromstring(raw)
            code = root.findtext(".//headerCd", "")
            if not code:
                reason = root.findtext(".//returnReasonCode", "")
                raise BusError("upstream_auth" if reason in ("20", "30", "31")
                               else "upstream_quota" if reason == "22" else "invalid_payload")
            items = [{child.tag: child.text or "" for child in item} for item in root.findall(".//itemList")]
        # 8: service has ended (official guide); 4: "결과가 없습니다" — no bus on the route right now (a
        # night route in the daytime, 2026-10-07 N62). Both clear old vehicles; 4 was an error, which
        # kept the map's "갱신 지연" notice on and retried every minute
        if code in ("4", "8"):
            return []
        if code != "0":
            raise BusError("upstream_quota" if code == "22" else "upstream_error")
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            raise BusError("invalid_payload")
        return items
    except (ET.ParseError, ValueError, TypeError, AttributeError):
        raise BusError("invalid_payload") from None


def fetch_positions(route_id: str, config) -> list[dict]:
    return fetch_upstream(API_URL, {"busRouteId": route_id}, config)


def fetch_arrivals(ars_id: str, config) -> list[dict]:
    return fetch_upstream(ARRIVAL_URL, {"arsId": ars_id}, config)


def http_error_code(error) -> str:
    """하루 한도를 넘기면 서울시는 401 에 '서비스 요청제한 횟수 초과 에러'를 담아 준다(2026-10-07 확인).
    처음엔 서버마다 넘는 때가 달라 401 이 섞여 오다가 모두 401 이 된다: 인증 오류가 아니라 한도 초과로 본다."""
    if error.code == 429:
        return "upstream_quota"
    if error.code not in (401, 403):
        return "upstream_error"
    try:
        body = error.read(4000).decode("utf-8", "replace")
    except Exception:  # noqa: BLE001 — 본문을 못 읽어도 상태 코드로 판단한다
        body = ""
    return "upstream_quota" if "횟수 초과" in body or "LIMITED_NUMBER_OF_SERVICE_REQUESTS" in body else "upstream_auth"


def fetch_upstream(url: str, params: dict, config) -> list[dict]:
    # unquote (NOT unquote_plus) supports either portal encoding of the same key.
    query = urllib.parse.urlencode({"serviceKey": urllib.parse.unquote(config.key), **params, "resultType": "json"})
    request = urllib.request.Request(url + "?" + query, headers={"User-Agent": "syung-bus/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=config.timeout) as response:
            raw = response.read(2_000_001)
    except urllib.error.HTTPError as error:
        raise BusError(http_error_code(error)) from None
    except (OSError, urllib.error.URLError, ValueError):
        raise BusError("upstream_error") from None
    return parse_payload(raw)
