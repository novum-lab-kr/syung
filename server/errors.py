"""밖(HTTP 응답)으로 나가도 되는 고정 오류 코드 · 문구. 바깥 API 의 원문(키가 든 주소 등)은 절대 싣지 않는다."""
from __future__ import annotations

MESSAGES = {
    "missing_key": "버스 위치 API 서비스키가 설정되지 않았습니다.",
    "disabled": "버스 실시간 위치 수집이 비활성화되어 있습니다.",
    "upstream_auth": "버스 위치 API 인증 또는 활용신청 승인을 확인해 주세요.",
    "upstream_quota": "버스 위치 API 호출 한도에 도달했습니다.",
    "upstream_error": "버스 위치 API를 일시적으로 조회할 수 없습니다.",
    "invalid_payload": "버스 위치 API 응답 형식을 확인할 수 없습니다.",
    "quota_storage": "버스 호출량 기록을 읽거나 저장할 수 없어 수집을 중단했습니다.",
    "daily_limit": "오늘의 버스 위치 수집 예산을 모두 사용했습니다.",
    "paced": "하루 호출 예산에 맞춰 다음 노선 조회를 기다립니다.",
    "in_flight": "버스 위치 정보를 조회 중입니다.",
    "backoff": "API 오류 후 재시도를 기다립니다.",
    "data_unavailable": "버스 정적 노선 데이터를 불러올 수 없습니다.",
}


class BusError(Exception):
    """Only fixed, safe codes/messages cross the HTTP boundary."""
    def __init__(self, code: str):
        self.code = code if code in MESSAGES else "upstream_error"
        super().__init__(MESSAGES[self.code])
