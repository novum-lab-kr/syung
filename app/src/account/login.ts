// 앱 로그인 흐름(계획서 8절 "앱 로그인 계약"): 시스템 브라우저(iOS ASWebAuthenticationSession · Android Custom Tabs)로
// start?app=1&code_challenge=… → 제공자 → 서버가 syung://login?code=… 로 돌려보냄 → POST /api/auth/app/token {code, codeVerifier} → 토큰.
// 돌아오는 길이 둘이다 — openAuthSessionAsync 의 결과 주소, 그리고 Android 등에서 Expo Router 가 여는 /login 화면(src/app/login.tsx).
// 어느 쪽이 먼저 와도 코드 바꾸기는 한 번만 한다(verifier 는 한 번 쓰면 버린다).
import * as WebBrowser from 'expo-web-browser';
import { SERVER_ORIGIN } from '../config';
import { call, errorCode, errorMessage, isRecord, meOf, type Me } from './api';
import { challengeOf, makeVerifier } from './pkce';

export const REDIRECT = 'syung://login';
export type Provider = 'kakao' | 'google' | 'apple';
export const PROVIDER_LABELS: Record<Provider, string> = { kakao: '카카오로 계속하기', google: '구글로 계속하기', apple: 'Apple로 계속하기' };
export const isProvider = (value: unknown): value is Provider => value === 'kakao' || value === 'google' || value === 'apple';

// 서버 오류 코드 → 안내(웹 web/user/account.mts LOGIN_ERRORS 와 같은 글 · 그 밖은 기본 글)
const LOGIN_ERRORS: Record<string, string> = {
  provider: '로그인 서비스가 답하지 않아요. 잠시 뒤 다시 해 주세요.',
  limit: '시도가 너무 많아요. 10분 뒤 다시 해 주세요.',
};
const LOGIN_EXPIRED = '로그인 시간이 지났어요. 다시 로그인해 주세요.';
export const LOGIN_FAILED = '로그인하지 못했어요. 잠시 뒤 다시 해 주세요.';

export type LoginResult =
  | { kind: 'ok'; token: string; me: Me; isNew: boolean }
  | { kind: 'cancel' }                      // 사용자가 브라우저를 닫음(안내 없이)
  | { kind: 'denied' }                      // 제공자 화면에서 취소(서버 error=denied — 웹처럼 '로그인을 취소했어요.')
  | { kind: 'error'; message: string };

let pendingVerifier: string | null = null;   // 브라우저를 연 로그인 하나의 verifier(메모리에만)
let exchanging: Promise<LoginResult> | null = null;
let attempted = false;   // 이 프로세스에서 로그인을 연 적 있음 — 없는데 복귀 주소가 오면 브라우저에 가 있는 동안 앱이 죽었다 다시 켜진 것
let returnNotice: string | null = null;   // 그때 로그인 시트에 띄울 글

// 로그인 시트가 처음 그릴 때 읽고 바로 버린다. 로그인이 된 상태면 session.ts 가 버린다
export const readReturnNotice = () => returnNotice;
export const dropReturnNotice = () => { returnNotice = null; };

// 돌아온 주소의 code · error(쿼리). 주소가 syung://login 이 아니면 null(syung://login-x 같은 다른 주소도), 값을 풀지 못하면 error=unknown(기본 안내)
export function parseReturn(url: string): { code?: string; error?: string } | null {
  if (url !== REDIRECT && !url.startsWith(`${REDIRECT}?`)) return null;
  const query = url.split('?')[1] ?? '';
  const result: { code?: string; error?: string } = {};
  for (const pair of query.split('&')) {
    const [key, raw = ''] = pair.split('=');
    let value: string;
    try {
      value = decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
      return { error: 'unknown' };
    }
    if (key === 'code' && value) result.code = value;
    if (key === 'error' && value) result.error = value;
  }
  return result;
}

// 돌아온 code · error 로 끝내기. 이미 다른 길로 끝냈으면(verifier 없음) 그 결과를 같이 기다리거나 null
export function finishLogin(back: { code?: string; error?: string }): Promise<LoginResult> | null {
  if (exchanging) return exchanging;
  const verifier = pendingVerifier;
  if (!verifier) {
    if (!attempted && (back.code || back.error)) returnNotice = LOGIN_EXPIRED;
    return null;
  }
  pendingVerifier = null;
  if (!back.code) {
    const code = back.error ?? '';
    return Promise.resolve(code === 'denied' ? { kind: 'denied' } : { kind: 'error', message: LOGIN_ERRORS[code] ?? LOGIN_FAILED });
  }
  exchanging = exchange(back.code, verifier).finally(() => { exchanging = null; });
  return exchanging;
}

async function exchange(code: string, codeVerifier: string): Promise<LoginResult> {
  try {
    const reply = await call('POST', '/api/auth/app/token', { code, codeVerifier }, { auth: false });
    const body = reply.body;
    if (reply.ok && isRecord(body) && typeof body.token === 'string' && body.token) {
      const me = meOf(body.me);
      if (me) return { kind: 'ok', token: body.token, me, isNew: body.new === true };
    }
    // invalid_code: 지남 · 이미 씀 · verifier 틀림 — 하나로, 다시 로그인
    if (errorCode(body) === 'invalid_code') return { kind: 'error', message: LOGIN_EXPIRED };
    return { kind: 'error', message: errorMessage(body) ?? LOGIN_FAILED };
  } catch {
    return { kind: 'error', message: '로그인하지 못했어요. 연결을 확인해 주세요.' };
  }
}

// 로그인 열기 → 결과. 브라우저가 돌아온 주소를 주면 여기서 끝내고, 아니면(/login 화면이 받음) 그 결과를 기다린다
export async function startLogin(provider: Provider): Promise<LoginResult> {
  const verifier = makeVerifier();
  const challenge = await challengeOf(verifier);
  pendingVerifier = verifier;
  attempted = true;
  const url = `${SERVER_ORIGIN}/api/auth/${provider}/start?app=1&code_challenge=${challenge}&code_challenge_method=S256`;
  let opened: WebBrowser.WebBrowserAuthSessionResult;
  try {
    opened = await WebBrowser.openAuthSessionAsync(url, REDIRECT);
  } catch {
    pendingVerifier = null;
    return { kind: 'error', message: '로그인 창을 열지 못했어요. 잠시 뒤 다시 해 주세요.' };
  }
  if (opened.type === 'success') {
    const back = parseReturn(opened.url);
    const done = back ? finishLogin(back) : null;
    if (done) return done;
  }
  if (exchanging) return exchanging;   // /login 화면이 먼저 받아 바꾸는 중 — 같은 결과
  if (pendingVerifier === verifier) pendingVerifier = null;   // 아무도 못 받음 = 브라우저를 닫음
  return { kind: 'cancel' };
}
