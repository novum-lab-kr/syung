"""켤 때 배경에서 길찾기 준비: 탐색 자료를 읽고 일꾼을 띄워 둔다(첫 길찾기가 ~2 s 기다리지 않게)."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:   # 타입만
    from server.services.runtime import Services


def warm_journey(services: Services) -> None:
    """services.journey 도 여기(배경)에서 만든다: 설정 오류 등으로 실패해도 서버는 뜬다(옛 코드와 같게)."""
    try:
        services.journey.warm()   # route search workers up before the first 길찾기
    except Exception as e:  # noqa: BLE001 — routing falls back to searching in-process
        print(f"journey warm-up failed: {e}", flush=True)
