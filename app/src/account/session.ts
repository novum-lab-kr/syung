// 로그인 상태 한 곳(모듈 저장소 — 뿌리 레이아웃을 건드리지 않고 어느 화면에서나 useSession()). 토큰 자체는 token.ts(안전한 저장소)에만 두고 여기엔 싣지 않는다.
// 401 이면 api.ts 가 알려 온다 → 토큰 지우고 로그아웃 상태 + '로그인이 끝났어요' 안내.
import { useSyncExternalStore } from 'react';
import { call, meOf, whenExpired, type Me } from './api';
import { dropReturnNotice, startLogin, type LoginResult, type Provider } from './login';
import { showToast } from './toast';
import { clearToken, readToken, saveToken } from './token';

// offline: 토큰은 있는데 서버에 닿지 못해 내 정보를 못 받음(토큰은 지우지 않는다 — 다시 시도)
export type SessionState = { status: 'loading' } | { status: 'offline' } | { status: 'out' } | { status: 'in'; me: Me };

let state: SessionState = { status: 'loading' };
const listeners = new Set<() => void>();
function set(next: SessionState) { if (next.status === 'in') dropReturnNotice(); state = next; listeners.forEach(listener => listener()); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const useSession = () => useSyncExternalStore(subscribe, () => state);
export const sessionNow = () => state;

whenExpired(() => {
  if (state.status !== 'in') return;
  void clearToken();
  set({ status: 'out' });
  showToast('로그인이 끝났어요. 다시 로그인해 주세요.', true);
});

// 처음 한 번: 저장한 토큰으로 내 정보를 받는다. 연결이 안 되면 토큰은 그대로 두고(401 일 때만 지운다) 다음에 다시
let booting: Promise<void> | null = null;
export function bootSession(): Promise<void> {
  booting ??= (async () => {
    if (!(await readToken())) { set({ status: 'out' }); return; }
    await refreshMe();
  })().finally(() => { booting = null; });
  return booting;
}

export async function refreshMe(): Promise<void> {
  const before = state.status;
  try {
    const token = await readToken();
    const reply = await call('GET', '/api/me', undefined, token ? { token } : {});
    if ((await readToken()) !== token) return;   // 그사이 로그아웃 · 다시 로그인 — 옛 답으로 지금 세션을 바꾸지 않는다
    const me = reply.ok ? meOf(reply.body) : null;
    if (me) {
      set({ status: 'in', me });
      if (before !== 'in') countUse('open');   // 웹처럼 연 날 세기(앱은 켤 때 · 로그인할 때 한 번)
      return;
    }
    if (reply.status === 401) { await clearToken(); set({ status: 'out' }); return; }
  } catch { /* 연결 끊김 — 아래 */ }
  if (state.status !== 'in') set({ status: 'offline' });
}

// 사용 횟수(내 통계 — 웹 countUse 와 같은 종류 open · route · ticket). 못 보내도 화면에는 아무 일 없다
export function countUse(kind: 'open' | 'route' | 'ticket') {
  if (state.status !== 'in') return;
  call('POST', '/api/me/usage', { kind }).catch(() => undefined);
}

export const setMe = (me: Me) => set({ status: 'in', me });

// 로그인 결과 반영(브라우저 결과 · /login 화면 둘 다 여기로). 돌려주는 글은 로그인 화면에 띄울 안내(성공 · 닫음은 null — 웹도 성공 때 안내 없이 닫는다)
// 취소(denied)는 웹처럼 안내만 · 오류 모양 아님
// 같은 바꾸기 결과가 두 길로 와도(둘 다 같은 결과 객체를 받는다 — login.ts exchanging) 토큰 저장은 한 번만
const applied = new WeakSet<LoginResult>();
export async function applyLogin(result: LoginResult): Promise<{ text: string; error: boolean } | null> {
  if (applied.has(result)) return null;
  applied.add(result);
  if (result.kind === 'ok') {
    await saveToken(result.token);
    set({ status: 'in', me: result.me });
    countUse('open');
    return null;
  }
  if (result.kind === 'denied') return { text: '로그인을 취소했어요.', error: false };
  if (result.kind === 'error') return { text: result.message, error: true };
  return null;
}

export async function signIn(provider: Provider) {
  return applyLogin(await startLogin(provider));
}

// 로그아웃: 서버 세션을 지우고(실패해도) 이 기기 토큰을 지운다
// 먼저 로그아웃 상태로 바꿔 두어 그 요청의 401 이 '로그인이 끝났어요'를 또 띄우지 않게 한다
export async function signOut(): Promise<void> {
  const token = await readToken();
  set({ status: 'out' });
  if (token) {
    try { await call('POST', '/api/auth/logout', undefined, { token }); } catch { /* 연결이 안 돼도 이 기기에선 지운다 */ }
  }
  await clearToken();
  showToast('로그아웃했어요');
}

// 탈퇴 뒤처럼 서버 세션이 이미 없을 때
export async function dropSession(message: string): Promise<void> {
  await clearToken();
  set({ status: 'out' });
  showToast(message);
}
