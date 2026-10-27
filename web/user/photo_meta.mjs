// 프로필 사진 JPEG 의 부가 정보 조각 떼기(web/user/account.mjs 가 올리기 전에 부른다 — 첫 화면 코드에 없음).
// 사파리 · 아이폰은 canvas 를 JPEG 로 만들 때(맥 ImageIO) APP1(Exif) · APP13(Photos) 조각을 기본으로 넣는다. 다시 그린 그림이라
// 위치 정보는 없지만, 서버는 위치가 들 수 있는 APP1 · APP13 이 있는 JPEG 를 받지 않는다(server/services/profile.py).
// 그래서 첫 스캔(SOS) 전의 APP1~APP15 · COM 조각을 떼고 나머지 바이트는 그대로 둔다. APP0(JFIF)은 남긴다.

// bytes: Uint8Array(JPEG) → 뗀 Uint8Array. JPEG 모양이 아니면 그대로 돌려준다(서버가 판단).
export function stripJpegMeta(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return bytes;
  const parts = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xFF) {
    const marker = bytes[offset + 1];
    if (marker === 0xFF) { offset += 1; continue; }   // 마커 앞 채움 바이트
    if (marker === 0xDA || marker === 0xD9) break;   // 스캔 자료부터는 그대로
    const end = offset + 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
    if (end > bytes.length) return bytes;
    const meta = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE;
    if (!meta) parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  parts.push(bytes.subarray(offset));
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
