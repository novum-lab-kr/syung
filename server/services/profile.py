"""내 정보의 닉네임 · 프로필 사진 검사(2026-10-27 결정 D1 · D2 · D4). 저장은 services/members.py → store.

- 닉네임(D4): 1~12자, 같은 이름 허용. NFC 로 맞추고 제어 · 보이지 않는 글자(서식 · 줄 나눔 · 사용자 정의 · 한글 채움 문자)를
  지우고, 공백 종류는 한 칸으로 줄여 앞뒤를 자른다.
- 사진(D2): 브라우저가 정사각 256×256 으로 잘라 다시 인코딩(WebP, 안 되면 JPEG)해 올린다. 서버는 이미지를 디코드하지 않고
  매직 바이트 · 크기 상한 · 가로세로 · 구조(끝에 붙은 바이트 없음)만 본다. 위치(GPS) 같은 메타데이터 칸(JPEG APP1 · APP13,
  WebP EXIF · XMP)이 있으면 받지 않는다 — 브라우저가 다시 그린 사진에는 없는 칸이라 원본 파일을 그대로 보낸 것이다.
- 캐릭터(D1): 내 위치 캐릭터 이름(web/map/avatars/*.mjs — 화면은 web/brand/faces/<이름>-*.png 얼굴 그림).
"""
from __future__ import annotations

import re
import struct
import unicodedata

NAME_MIN, NAME_MAX = 1, 12
PHOTO_SIZE = 256   # 가로 = 세로(px)
PHOTO_MAX_BYTES = 160 * 1024   # 256×256 WebP · JPEG 는 보통 10~60 KB
CHARACTERS = ("sprout", "builder", "seonbi", "visitor", "scv", "drone", "probe")
# 보이지 않는데 글자(Lo)로 분류되는 한글 채움 문자 · 점자 빈칸 — 빈 닉네임처럼 보이게 쓰인다
INVISIBLE = {"ᅟ", "ᅠ", "ㅤ", "ﾠ", "⠀"}
DROP_CATEGORIES = {"Cc", "Cf", "Co", "Cs", "Cn", "Zl", "Zp"}
SPACES = re.compile(r"\s+")


class PhotoError(ValueError):
    """올린 사진이 받을 수 없는 모양 — 문구는 화면에 그대로 보인다."""


def clean_name(value) -> str:
    """닉네임 → 저장할 글자. 틀리면 ValueError(문구는 화면에 그대로)."""
    if not isinstance(value, str):
        raise ValueError(f"닉네임은 {NAME_MIN}~{NAME_MAX}자예요")
    text = unicodedata.normalize("NFC", value)
    kept = []
    for char in text:
        category = unicodedata.category(char)
        if category == "Zs" or char in "\t\n\r\v\f":
            kept.append(" ")   # 여러 공백 종류(전각 · 줄바꿈 없는 공백 …)는 보통 칸으로
        elif category not in DROP_CATEGORIES and char not in INVISIBLE:
            kept.append(char)
    name = SPACES.sub(" ", "".join(kept)).strip()
    if not NAME_MIN <= len(name) <= NAME_MAX:
        raise ValueError(f"닉네임은 {NAME_MIN}~{NAME_MAX}자예요")
    return name


def check_photo(data: bytes) -> str:
    """올린 사진 바이트 → 확장자(webp · jpg). 받을 수 없으면 PhotoError."""
    if not data or len(data) > PHOTO_MAX_BYTES:
        raise PhotoError(f"사진은 {PHOTO_MAX_BYTES // 1024} KB 까지예요")
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        width, height = _webp_size(data)
        extension = "webp"
    elif data[:3] == b"\xff\xd8\xff":
        width, height = _jpeg_size(data)
        extension = "jpg"
    else:
        raise PhotoError("WebP · JPEG 사진만 올릴 수 있어요")
    if (width, height) != (PHOTO_SIZE, PHOTO_SIZE):
        raise PhotoError(f"사진은 {PHOTO_SIZE}×{PHOTO_SIZE} 이어야 해요")
    return extension


def _webp_size(data: bytes) -> tuple[int, int]:
    """RIFF 조각을 끝까지 걸어 본다: 크기가 파일과 맞고, 아는 조각만 있고, 움직이는 그림 · 메타데이터가 없어야 한다."""
    bad = PhotoError("WebP 사진을 읽을 수 없어요")
    if struct.unpack_from("<I", data, 4)[0] + 8 != len(data):
        raise bad
    size = None
    offset = 12
    while offset < len(data):
        if offset + 8 > len(data):
            raise bad
        kind, length = data[offset:offset + 4], struct.unpack_from("<I", data, offset + 4)[0]
        body = data[offset + 8:offset + 8 + length]
        if len(body) != length:
            raise bad
        if kind in (b"EXIF", b"XMP "):
            raise PhotoError("사진 정보(위치 등)가 든 파일은 올릴 수 없어요")
        if kind not in (b"VP8 ", b"VP8L", b"VP8X", b"ALPH", b"ICCP"):
            raise bad   # ANIM · ANMF(움직이는 그림) · 모르는 조각
        if size is None:
            size = _webp_frame(kind, body, bad)
        offset += 8 + length + (length & 1)   # 홀수 길이는 1바이트 채움
    if size is None:
        raise bad
    return size


def _webp_frame(kind: bytes, body: bytes, bad: PhotoError) -> tuple[int, int]:
    if kind == b"VP8X":
        if len(body) < 10:
            raise bad
        if body[0] & 0x0E:   # 0x08 EXIF · 0x04 XMP · 0x02 움직이는 그림
            raise PhotoError("사진 정보(위치 등)가 든 파일은 올릴 수 없어요")
        return (int.from_bytes(body[4:7], "little") + 1, int.from_bytes(body[7:10], "little") + 1)
    if kind == b"VP8 ":
        if len(body) < 10 or body[3:6] != b"\x9d\x01\x2a":
            raise bad
        width, height = struct.unpack_from("<HH", body, 6)
        return width & 0x3FFF, height & 0x3FFF
    if kind == b"VP8L":
        if len(body) < 5 or body[0] != 0x2F:
            raise bad
        bits = int.from_bytes(body[1:5], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    raise bad   # 첫 조각이 그림이 아니다(ALPH · ICCP 는 VP8X 뒤에만 온다)


SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def _jpeg_size(data: bytes) -> tuple[int, int]:
    """SOS 전까지 마커를 걸어 가로세로를 읽는다. 위치 정보가 들 수 있는 APP1(Exif · XMP) · APP13 은 받지 않는다.
    끝은 EOI(FF D9)여야 한다(뒤에 다른 파일을 붙인 것을 막는다)."""
    bad = PhotoError("JPEG 사진을 읽을 수 없어요")
    if not data.endswith(b"\xff\xd9"):
        raise bad
    size = None
    offset = 2
    while True:
        if offset + 4 > len(data) or data[offset] != 0xFF:
            raise bad
        marker = data[offset + 1]
        if marker == 0xFF:   # 채움 바이트
            offset += 1
            continue
        if marker in (0xE1, 0xED):
            raise PhotoError("사진 정보(위치 등)가 든 파일은 올릴 수 없어요")
        length = struct.unpack_from(">H", data, offset + 2)[0]
        if length < 2 or offset + 2 + length > len(data):
            raise bad
        if marker in SOF:
            if length < 7:
                raise bad
            height, width = struct.unpack_from(">HH", data, offset + 5)
            size = (width, height)
        if marker == 0xDA:   # SOS — 그림 자료가 시작된다
            break
        offset += 2 + length
    if size is None:
        raise bad
    return size


def avatar_value(kind: str, value: str) -> str:
    """DB users.avatar 칸 글자: 'photo:<파일 이름>' · 'character:<이름>'."""
    return f"{kind}:{value}"


def photo_name(stored: str | None) -> str | None:
    """DB 값이 올린 사진이면 그 파일 이름."""
    return stored[6:] if stored and stored.startswith("photo:") else None


def avatar_view(stored: str | None, photo_url: str) -> dict | None:
    """DB 값 → 응답 모양. None(기본 캐릭터) · {type:'character', id} · {type:'photo', url}. photo_url 은 '{name}' 을 담은 틀."""
    if photo_name(stored):
        return {"type": "photo", "url": photo_url.format(name=photo_name(stored))}
    if stored and stored.startswith("character:") and stored[10:] in CHARACTERS:
        return {"type": "character", "id": stored[10:]}
    return None
