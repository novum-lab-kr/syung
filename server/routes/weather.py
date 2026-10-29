"""/api/weather?lat=&lng=: 좌표 검사. 기상청을 못 받아도 200 {"ok": false}(화면은 날씨 없이 그린다), 좌표가 잘못이면 400."""
from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

from server.routes.errors import api_error

if TYPE_CHECKING:   # 타입만
    from server.services.runtime import Services


def weather(services: Services, query: dict[str, list[str]]) -> tuple[dict[str, Any], int]:
    try:
        lat, lng = float(query.get("lat", [""])[0]), float(query.get("lng", [""])[0])
    except ValueError:
        return api_error("bad_coordinates", "lat 과 lng 가 필요해요"), 400
    if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
        return api_error("bad_coordinates", "좌표 범위가 맞지 않아요"), 400
    body = services.weather.lookup(lat, lng)
    if body is None:
        return api_error("out_of_range", "기상청 격자 밖이에요"), 400
    return body, 200
