"""기상청 단기예보 조회서비스(공공데이터포털 · 기상청41_단기예보 조회서비스 VilageFcstInfoService_2.0) — 초단기실황 · 초단기예보.

인증키는 포털의 '일반 인증키(Decoding)' 그대로 받아 주소를 만들 때 딱 한 번만 URL 인코딩한다(Encoding 키를 넣으면 두 번 인코딩돼 거부된다).
오류 · 로그에 키 · 키가 든 주소를 싣지 않는다(KmaError 에는 기상청 오류 이름만).
요청 · 응답 필드는 활용가이드(2610판) 기준: serviceKey · pageNo · numOfRows · dataType · base_date · base_time · nx · ny →
response.header.resultCode · response.body.items.item[] (실황 category · obsrValue / 예보 category · fcstDate · fcstTime · fcstValue).
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, cast

BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0"
NO_DATA = "03"   # 가이드 오류코드표: 03 NODATA_ERROR — 아직 안 만들어진 발표시각


class KmaError(Exception):
    """기상청이 준 오류(code = 가이드의 resultCode · 'HTTP' · 'FORMAT')."""

    def __init__(self, code: str):
        super().__init__(f"KMA {code}")
        self.code = code


def _call(operation: str, key: str, base_date: str, base_time: str, nx: int, ny: int, rows: int) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode({"serviceKey": key, "pageNo": 1, "numOfRows": rows, "dataType": "JSON",
                                    "base_date": base_date, "base_time": base_time, "nx": nx, "ny": ny}, quote_via=urllib.parse.quote)
    request = urllib.request.Request(f"{BASE}/{operation}?{query}", headers={"User-Agent": "syung-weather/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=6) as reply:
            payload: Any = json.load(reply)
    except urllib.error.HTTPError as exc:   # 키 오류는 401/403 + 본문에 이유가 오기도 한다
        try:
            payload = json.load(exc)
        except (ValueError, OSError):
            raise KmaError("HTTP") from None
    except (OSError, ValueError):   # 연결 · 시간 초과 · JSON 아님(XML 오류 본문)
        raise KmaError("FORMAT") from None
    if not isinstance(payload, dict):
        raise KmaError("FORMAT")
    root = cast("dict[str, Any]", payload)
    gateway = root.get("OpenAPI_ServiceResponse")   # 포털 관문 오류: cmmMsgHeader.returnReasonCode(20 접근거부 · 30 미등록 키 …)
    if isinstance(gateway, dict):
        reason_header = cast("dict[str, Any]", gateway).get("cmmMsgHeader")
        reason = cast("dict[str, Any]", reason_header).get("returnReasonCode") if isinstance(reason_header, dict) else None
        raise KmaError(str(reason or "FORMAT"))
    response = root.get("response")
    if not isinstance(response, dict):
        raise KmaError("FORMAT")
    response_map = cast("dict[str, Any]", response)
    header = response_map.get("header")
    if not isinstance(header, dict):
        raise KmaError("FORMAT")
    code = str(cast("dict[str, Any]", header).get("resultCode", "")).zfill(2)
    if code != "00":
        raise KmaError(code)
    body = response_map.get("body")
    items = cast("dict[str, Any]", body).get("items") if isinstance(body, dict) else None
    rows_out = cast("dict[str, Any]", items).get("item") if isinstance(items, dict) else None
    if not isinstance(rows_out, list):
        return []
    return [cast("dict[str, Any]", row) for row in cast("list[Any]", rows_out) if isinstance(row, dict)]


def ultra_ncst(key: str, base_date: str, base_time: str, nx: int, ny: int) -> list[dict[str, Any]]:
    """초단기실황(getUltraSrtNcst): 매시 정시 발표(base_time HH00), 10분 이후 호출. 항목 8개(T1H · RN1 · UUU · VVV · REH · PTY · VEC · WSD)."""
    return _call("getUltraSrtNcst", key, base_date, base_time, nx, ny, 10)


def ultra_fcst(key: str, base_date: str, base_time: str, nx: int, ny: int) -> list[dict[str, Any]]:
    """초단기예보(getUltraSrtFcst): 매시 30분 발표(base_time HH30), 45분 이후 호출. 6시간 × 10항목 = 60개."""
    return _call("getUltraSrtFcst", key, base_date, base_time, nx, ny, 60)
