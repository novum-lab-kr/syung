"""로그인 제공자(카카오 · 구글 · Apple)의 토큰 · 사용자 정보 주소를 부른다. 바깥 HTTP 는 여기서만.

오류에는 상태 코드만 싣는다(응답 본문 · 보낸 값에는 인가 코드 · 시크릿 · 토큰이 있을 수 있다).
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT = 8


class ProviderError(Exception):
    """제공자가 실패로 답했거나 닿지 않았다. 메시지는 안전한 고정 문구 + 상태 코드뿐."""


def _json(req: urllib.request.Request) -> dict:
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        raise ProviderError(f"provider http {error.code}") from None
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise ProviderError(f"provider unreachable: {type(error).__name__}") from None
    if not isinstance(body, dict):
        raise ProviderError("provider answer is not an object")
    return body


def post_form(url: str, fields: dict) -> dict:
    """application/x-www-form-urlencoded 로 보내고 JSON 객체를 받는다(토큰 주소)."""
    data = urllib.parse.urlencode({key: value for key, value in fields.items() if value}).encode()
    return _json(urllib.request.Request(url, data=data, method="POST",
                                        headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"}))


def get_bearer(url: str, access_token: str) -> dict:
    """Authorization: Bearer 로 GET(카카오 사용자 정보)."""
    return _json(urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}"}))
