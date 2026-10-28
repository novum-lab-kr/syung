"""로그인 제공자마다 인가 주소 만들기 · 인가 코드 → (제공자 회원번호, 화면 이름). 주소 · 응답 모양은 계획서 3-2(공식 문서).

제공자는 같은 모양(name · authorize_url · identify)이라 시험은 가짜 제공자를 넣는다.
회원 ID 로는 제공자 회원번호(카카오 id · ID 토큰 sub)만 쓴다 — 이메일 · 전화번호는 바뀌므로 쓰지 않는다(카카오 · 구글 문서).
"""
from __future__ import annotations

import base64
import json
import time
import urllib.parse
from typing import TYPE_CHECKING, Any, cast

from server.sources.oauth import ProviderError, get_bearer, post_form

if TYPE_CHECKING:   # 타입만(실행 때 config 를 다시 부르지 않는다)
    from collections.abc import Callable

    from server.config import MemberConfig

    Post = Callable[[str, dict[str, Any]], dict[str, Any]]   # 토큰 주소(sources.oauth.post_form 과 같은 모양)
    Get = Callable[[str, str], dict[str, Any]]   # 사용자 정보(sources.oauth.get_bearer)

DEFAULT_NAMES = {"kakao": "카카오 사용자", "google": "구글 사용자", "apple": "Apple 사용자"}


def _name(value: object, provider: str) -> str:
    text = value.strip() if isinstance(value, str) else ""
    return text[:40] or DEFAULT_NAMES[provider]


def id_token_claims(id_token: str, *, issuer: str, audience: str, now: float) -> dict[str, Any]:
    """토큰 주소에서 HTTPS 로 직접 받은 ID 토큰의 내용(서명 검증은 안 한다 — 구글 문서: 제공자와 직접 받은 토큰은 믿어도 된다).
    그래도 발급자 · 받는 앱 · 만료 · sub 는 본다."""
    try:
        payload = id_token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        raise ProviderError("id_token unreadable") from None
    if not isinstance(claims, dict):
        raise ProviderError("id_token unreadable")
    claims = cast("dict[str, Any]", claims)   # JSON 객체 — 키는 늘 글자
    aud = claims.get("aud")
    audiences: list[Any] = cast("list[Any]", aud) if isinstance(aud, list) else [aud]
    issuers = (issuer, issuer.removeprefix("https://"))   # 구글은 둘 다 쓴다
    if (claims.get("iss") not in issuers or audience not in audiences
            or not isinstance(claims.get("exp"), (int, float)) or claims["exp"] <= now
            or not isinstance(claims.get("sub"), str) or not claims["sub"]):
        raise ProviderError("id_token claims rejected")
    return claims


class KakaoProvider:
    name = "kakao"

    def __init__(self, client_id: str, client_secret: str = "", *, post: Post = post_form, get: Get = get_bearer):
        self.client_id, self.client_secret, self._post, self._get = client_id, client_secret, post, get

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        return "https://kauth.kakao.com/oauth/authorize?" + urllib.parse.urlencode(
            {"response_type": "code", "client_id": self.client_id, "redirect_uri": redirect_uri, "state": state})

    def identify(self, code: str, redirect_uri: str) -> tuple[str, str]:
        token = self._post("https://kauth.kakao.com/oauth/token", {
            "grant_type": "authorization_code", "client_id": self.client_id, "redirect_uri": redirect_uri,
            "code": code, "client_secret": self.client_secret})
        access = token.get("access_token")
        if not isinstance(access, str) or not access:
            raise ProviderError("no access_token")
        me = self._get("https://kapi.kakao.com/v2/user/me", access)
        member = me.get("id")
        if not isinstance(member, int) or isinstance(member, bool):
            raise ProviderError("no member id")
        profile: object = cast("dict[str, Any]", me.get("kakao_account") or {}).get("profile") or {}
        return str(member), _name(cast("dict[str, Any]", profile).get("nickname") if isinstance(profile, dict) else None, self.name)


class GoogleProvider:
    name = "google"

    def __init__(self, client_id: str, client_secret: str, *, post: Post = post_form, clock: Callable[[], float] = time.time):
        self.client_id, self.client_secret, self._post, self._clock = client_id, client_secret, post, clock

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(
            {"response_type": "code", "client_id": self.client_id, "scope": "openid profile",
             "redirect_uri": redirect_uri, "state": state})

    def identify(self, code: str, redirect_uri: str) -> tuple[str, str]:
        token = self._post("https://oauth2.googleapis.com/token", {
            "code": code, "client_id": self.client_id, "client_secret": self.client_secret,
            "redirect_uri": redirect_uri, "grant_type": "authorization_code"})
        claims = id_token_claims(str(token.get("id_token") or ""), issuer="https://accounts.google.com",
                                 audience=self.client_id, now=self._clock())
        return claims["sub"], _name(claims.get("name"), self.name)


class AppleProvider:
    """client_secret 은 미리 만든 ES256 JWT(표준 라이브러리에 ECDSA 가 없다 · 최대 6개월). 이름 · 이메일 범위는 안 받는다(query 응답)."""
    name = "apple"

    def __init__(self, client_id: str, client_secret: str, *, post: Post = post_form, clock: Callable[[], float] = time.time):
        self.client_id, self.client_secret, self._post, self._clock = client_id, client_secret, post, clock

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        return "https://appleid.apple.com/auth/authorize?" + urllib.parse.urlencode(
            {"response_type": "code", "response_mode": "query", "client_id": self.client_id,
             "redirect_uri": redirect_uri, "state": state})

    def identify(self, code: str, redirect_uri: str) -> tuple[str, str]:
        token = self._post("https://appleid.apple.com/auth/token", {
            "client_id": self.client_id, "client_secret": self.client_secret, "code": code,
            "grant_type": "authorization_code", "redirect_uri": redirect_uri})
        claims = id_token_claims(str(token.get("id_token") or ""), issuer="https://appleid.apple.com",
                                 audience=self.client_id, now=self._clock())
        return claims["sub"], DEFAULT_NAMES[self.name]


def providers_from_config(config: MemberConfig) -> dict[str, KakaoProvider | GoogleProvider | AppleProvider]:
    """설정이 다 있는 제공자만, 화면에 보일 차례(카카오 → 구글 → Apple)로."""
    found: dict[str, KakaoProvider | GoogleProvider | AppleProvider] = {}
    if config.kakao_client_id:
        found["kakao"] = KakaoProvider(config.kakao_client_id, config.kakao_client_secret)
    if config.google_client_id and config.google_client_secret:
        found["google"] = GoogleProvider(config.google_client_id, config.google_client_secret)
    if config.apple_client_id and config.apple_client_secret:
        found["apple"] = AppleProvider(config.apple_client_id, config.apple_client_secret)
    return found
