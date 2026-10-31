// 세션 토큰 보관(expo-secure-store — iOS 키체인 · Android Keystore). 토큰은 비밀값: 로그 · 지도 다리 · 화면에 싣지 않는다(계획서 8절).
// 이 기기에서만(다른 기기 백업으로 옮겨 가지 않게 THIS_DEVICE_ONLY). 끝나는 시각으로 미리 지우지 않고 서버 401 로만 지운다.
import * as SecureStore from 'expo-secure-store';

const KEY = 'syung.session';
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let cached: string | null | undefined;   // undefined = 아직 안 읽음

export async function readToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    cached = await SecureStore.getItemAsync(KEY, OPTIONS);
    return cached;
  } catch {
    return null;   // 키체인을 못 읽으면(기기 잠금 등) 이번만 로그인 안 된 것으로 — 기억하지 않아 다음에 다시 읽는다
  }
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token, OPTIONS);
  cached = token;   // 저장에 실패하면 던지고 기억도 하지 않는다
}

export async function clearToken(): Promise<void> {
  cached = null;
  try { await SecureStore.deleteItemAsync(KEY, OPTIONS); } catch { /* 이미 없으면 그대로 */ }
}
