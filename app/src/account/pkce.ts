// PKCE S256(RFC 7636) — 계획서 8절 "앱 로그인 계약" 1단계. verifier 는 이 기기 메모리에만 두고 서버에는 토큰 받을 때 한 번만 보낸다.
// verifier 43~128자 [A-Za-z0-9._~-] · challenge = base64url(SHA-256(verifier)) 43자 · '=' 없음
import { CryptoDigestAlgorithm, digest, getRandomBytes } from 'expo-crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// 바이트 → base64url('=' 없음). Hermes 의 btoa 에 기대지 않고 직접 셈한다
export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    text += ALPHABET[(chunk >> 18) & 63]! + ALPHABET[(chunk >> 12) & 63]!;
    if (second !== undefined) text += ALPHABET[(chunk >> 6) & 63]!;
    if (third !== undefined) text += ALPHABET[chunk & 63]!;
  }
  return text;
}

// 32바이트 → 43자(base64url 글자는 모두 [A-Za-z0-9_-] 라 계약 글자 범위 안)
export const makeVerifier = () => base64url(getRandomBytes(32));

export async function challengeOf(verifier: string): Promise<string> {
  const ascii = new Uint8Array([...verifier].map(letter => letter.charCodeAt(0)));
  return base64url(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, ascii)));
}
