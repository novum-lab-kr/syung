// 세션 토큰 보관(expo-secure-store — iOS 키체인 · Android Keystore). 토큰은 비밀값: 로그 · 지도 다리 · 화면에 싣지 않는다(계획서 8절).
// 이 기기에서만(다른 기기 백업으로 옮겨 가지 않게 THIS_DEVICE_ONLY). 끝나는 시각으로 미리 지우지 않고 서버 401 로만 지운다.
import * as SecureStore from 'expo-secure-store';

const KEY = 'syung.session';
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let cached: string | null | undefined;   // undefined = 아직 안 읽음
// 저장 · 지우기는 부른 차례대로 — 앞 계정 지우기가 뒤 계정 저장을 앞지르거나 덮지 않게
let writes: Promise<unknown> = Promise.resolve();
function inTurn(step: () => Promise<void>): Promise<void> {
  const run = writes.then(step);
  writes = run.catch(() => undefined);
  return run;
}

export async function readToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const stored = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (cached === undefined) cached = stored;   // 읽는 사이 저장 · 지우기가 있었으면 그 값이 지금 값
    return cached;
  } catch {
    return null;   // 키체인을 못 읽으면(기기 잠금 등) 이번만 로그인 안 된 것으로 — 기억하지 않아 다음에 다시 읽는다
  }
}

export async function saveToken(token: string): Promise<void> {
  await inTurn(async () => {
    await SecureStore.setItemAsync(KEY, token, OPTIONS);
    cached = token;   // 저장에 실패하면 던지고 기억도 하지 않는다
  });
}

export async function clearToken(): Promise<void> {
  cached = null;   // 지우기 차례를 기다리는 동안에도 옛 토큰을 내주지 않는다
  await inTurn(async () => {
    cached = null;   // 앞선 저장이 그사이 기억한 값도 비운다
    try { await SecureStore.deleteItemAsync(KEY, OPTIONS); } catch { /* 이미 없으면 그대로 */ }
  });
}
