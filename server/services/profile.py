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


META = PhotoError("사진 정보(위치 등)가 든 파일은 올릴 수 없어요")
VP8X_ALLOWED = 0x10 | 0x20   # 알파 · ICC 색 정보만(0x08 EXIF · 0x04 XMP · 0x02 움직이는 그림 · 나머지 예약 비트는 거절)


def _webp_chunks(data: bytes, bad: PhotoError) -> list[tuple[bytes, bytes]]:
    """RIFF 조각 목록. RIFF 크기가 파일 길이와 맞고 조각이 파일 끝에 딱 맞아야 한다."""
    if len(data) < 12 or struct.unpack_from("<I", data, 4)[0] + 8 != len(data):
        raise bad
    chunks = []
    offset = 12
    while offset < len(data):
        if offset + 8 > len(data):
            raise bad
        kind, length = data[offset:offset + 4], struct.unpack_from("<I", data, offset + 4)[0]
        body = data[offset + 8:offset + 8 + length]
        if len(body) != length:
            raise bad
        chunks.append((kind, body))
        offset += 8 + length + (length & 1)   # 홀수 길이는 1바이트 채움
    if offset != len(data):
        raise bad
    return chunks


def _webp_size(data: bytes) -> tuple[int, int]:
    """WebP 구조를 끝까지 본다. 단순형 = 그림 조각(VP8 · VP8L) 하나뿐. 확장형 = VP8X → (ICCP) → (ALPH — VP8 앞에만) → 그림 조각 하나로
    끝나야 하고, 그 밖의 조각(EXIF · XMP · ANIM · ANMF · 모르는 것)은 거절. 그림 조각의 실제 가로세로가 VP8X 캔버스와 같아야 한다."""
    bad = PhotoError("WebP 사진을 읽을 수 없어요")
    chunks = _webp_chunks(data, bad)
    if any(kind in (b"EXIF", b"XMP ") for kind, _ in chunks):
        raise META
    if not chunks:
        raise bad
    if chunks[0][0] != b"VP8X":
        if len(chunks) != 1:
            raise bad
        return _webp_frame(*chunks[0], bad)
    head = chunks[0][1]
    if len(head) != 10:
        raise bad
    flags = head[0]
    if flags & 0x0E:
        raise META
    if flags & ~VP8X_ALLOWED or head[1:4] != b"\0\0\0":
        raise bad
    canvas = (int.from_bytes(head[4:7], "little") + 1, int.from_bytes(head[7:10], "little") + 1)
    rest = [kind for kind, _ in chunks[1:]]
    allowed = [[b"VP8 "], [b"VP8L"], [b"ALPH", b"VP8 "]]
    if flags & 0x20:
        allowed = [[b"ICCP"] + order for order in allowed]
    if rest not in allowed:
        raise bad   # 그림 조각이 없거나 둘 이상 · 순서가 틀림 · 알 수 없는 조각
    if (b"ALPH" in rest) != bool(flags & 0x10) and rest[-1] == b"VP8 ":
        raise bad   # 손실 압축의 알파는 ALPH 조각이 있을 때만
    frame = _webp_frame(*chunks[-1], bad)
    if frame != canvas:
        raise bad
    return frame


def _webp_frame(kind: bytes, body: bytes, bad: PhotoError) -> tuple[int, int]:
    """그림 조각(VP8 손실 · VP8L 무손실)의 실제 가로세로."""
    if kind == b"VP8 ":
        if len(body) < 10 or body[0] & 1 or body[3:6] != b"\x9d\x01\x2a":   # 키프레임 · 시작 코드
            raise bad
        width, height = struct.unpack_from("<HH", body, 6)
        return width & 0x3FFF, height & 0x3FFF
    if kind == b"VP8L":
        if len(body) < 5 or body[0] != 0x2F:
            raise bad
        bits = int.from_bytes(body[1:5], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    raise bad


SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
RST = range(0xD0, 0xD8)


def _jpeg_size(data: bytes) -> tuple[int, int]:
    """JPEG 를 EOI 까지 모두 걸어 본다. 마커 조각(SOS 뒤 · 여러 스캔 사이 포함)마다 APP1(Exif · XMP) · APP13 이면 거절하고,
    스캔 자료 안의 FF 00(채움) · FF D0~D7(재시작)은 건너뛴다. 첫 EOI 가 파일 끝이어야 한다(뒤에 붙인 바이트 거절).
    가로세로는 SOF 하나에서 읽는다(SOF 가 없거나 둘 이상이면 거절)."""
    bad = PhotoError("JPEG 사진을 읽을 수 없어요")
    size = None
    scanned = False
    offset = 2
    end = len(data)
    while True:
        if offset + 2 > end or data[offset] != 0xFF:
            raise bad
        marker = data[offset + 1]
        if marker == 0xFF:   # 마커 앞 채움 바이트
            offset += 1
            continue
        if marker == 0xD9:   # EOI
            if offset + 2 != end or size is None or not scanned:
                raise bad
            return size
        if marker in (0xD8, 0x01, 0x00) or marker in RST:
            raise bad   # 두 번째 SOI · TEM · 스캔 밖의 재시작 마커
        if marker in (0xE1, 0xED):
            raise META
        if offset + 4 > end:
            raise bad
        length = struct.unpack_from(">H", data, offset + 2)[0]
        if length < 2 or offset + 2 + length > end:
            raise bad
        if marker in SOF:
            if length < 8 or size is not None:
                raise bad
            height, width = struct.unpack_from(">HH", data, offset + 5)
            size = (width, height)
        offset += 2 + length
        if marker == 0xDA:   # SOS — 스캔 자료를 다음 마커까지 건너뛴다
            if size is None:
                raise bad
            scanned = True
            while True:
                found = data.find(b"\xff", offset)
                if found < 0 or found + 1 >= end:
                    raise bad
                following = data[found + 1]
                if following == 0x00 or following in RST:
                    offset = found + 2
                    continue
                if following == 0xFF:
                    offset = found + 1
                    continue
                offset = found
                break


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
