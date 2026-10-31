// 로그아웃 · 다시 로그인 사이의 늦은 응답(Codex 리뷰 ee62412): 실제 session.ts · tickets.ts · token.ts · api.ts 를 돌리고 바깥(키체인 · fetch · 화면)만 가짜로 둔다.
// 실행: app/ 에서 npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const STUBS = {
  react: 'export const useSyncExternalStore = () => undefined;',
  'expo-secure-store': `
    const box = globalThis.__keychain;
    export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 1;
    export const getItemAsync = async key => box.get(key) ?? null;
    export const setItemAsync = async (key, value) => { box.set(key, value); };
    export const deleteItemAsync = async key => { box.delete(key); };`,
  './login': 'export const dropReturnNotice = () => undefined; export const startLogin = async () => null;',
  './toast': 'export const showToast = text => globalThis.__toasts.push(text);',
  '../config': "export const SERVER_ORIGIN = 'https://test.invalid';",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in STUBS) return { url: `stub:${specifier}`, shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const typed = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(typed))) return { url: typed.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true };
    return nextLoad(url, context);
  },
});

globalThis.__keychain = new Map();
globalThis.__toasts = [];
const KEY = 'syung.session';
const ME = { id: 2, name: 'B', provider: 'apple', avatar: null };

// 보낸 요청을 잡아 두고 시험이 원하는 때에 답한다
const pending = [];
globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
  pending.push({
    path: String(url).replace('https://test.invalid', ''),
    bearer: init.headers.Authorization,
    answer: (status, body) => resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
    fail: () => reject(new Error('연결 끊김')),
  });
});
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
async function requestTo(path) {
  await settle();
  const index = pending.findIndex(item => item.path === path);
  assert.notEqual(index, -1, `${path} 요청이 나가야 한다`);
  return pending.splice(index, 1)[0];
}

const { applyLogin, sessionNow, signOut } = await import('../src/account/session.ts');
const { deleteTicket, loadTickets, resetTickets, saveTicket, ticketById } = await import('../src/account/tickets.ts');
const { readToken } = await import('../src/account/token.ts');

const ticket = (id, name) => ({
  id, name, from: { name: '가', lat: 37, lng: 127 }, to: { name: '나', lat: 37, lng: 127 }, depart: '08:00', days: [1], route: null,
});
const login = async (token) => { await applyLogin({ kind: 'ok', token, me: ME }); await requestTo('/api/me/usage'); };
// A 가 로그아웃하고(서버 응답은 안 온 채) B 로 다시 로그인한 상태까지
async function switchToB() {
  const leaving = signOut();
  const logout = await requestTo('/api/auth/logout').catch(() => null);
  resetTickets();
  await login('token-B');
  return { leaving, logout };
}

test('로그아웃 응답이 B 로그인 뒤에 와도 B 의 토큰과 세션은 그대로다', async () => {
  await login('token-A');
  const leaving = signOut();
  const logout = await requestTo('/api/auth/logout');
  assert.equal(logout.bearer, 'Bearer token-A', '서버에는 A 의 토큰으로 로그아웃을 보낸다');
  assert.equal(globalThis.__keychain.has(KEY), false, '응답을 기다리기 전에 기기 토큰부터 지운다');

  await login('token-B');
  logout.answer(200, { ok: true });
  await leaving;

  assert.equal(globalThis.__keychain.get(KEY), 'token-B');
  assert.equal(await readToken(), 'token-B');
  assert.equal(sessionNow().status, 'in');
});

test('A 의 로그아웃 요청이 401 이나 연결 끊김으로 끝나도 B 는 그대로다', async () => {
  for (const finish of [item => item.answer(401, {}), item => item.fail()]) {
    await login('token-A');
    const { leaving, logout } = await switchToB();
    assert.ok(logout, '로그아웃 요청이 나가야 한다');
    finish(logout);
    await leaving;
    assert.equal(await readToken(), 'token-B');
    assert.equal(sessionNow().status, 'in');
  }
});

test('A 의 늦은 승차권 응답은 B 화면에 들어가지 않는다', async () => {
  await login('token-A');
  const loading = loadTickets();
  const late = await requestTo('/api/me/tickets');
  const { leaving, logout } = await switchToB();
  logout?.answer(200, {});
  await leaving;

  const own = loadTickets();
  const mine = await requestTo('/api/me/tickets');
  mine.answer(200, { tickets: [ticket(20, 'B 승차권')] });
  await own;
  late.answer(200, { tickets: [ticket(10, 'A 승차권')] });
  await loading;

  assert.equal(ticketById(10), null, 'A 의 승차권이 들어오면 안 된다');
  assert.equal(ticketById(20)?.name, 'B 승차권');
});

test('A 의 늦은 오류도 B 목록을 오류로 바꾸지 않는다', async () => {
  await login('token-A');
  const loading = loadTickets();
  const late = await requestTo('/api/me/tickets');
  const { leaving, logout } = await switchToB();
  logout?.answer(200, {});
  await leaving;

  const own = loadTickets();
  (await requestTo('/api/me/tickets')).answer(200, { tickets: [ticket(21, 'B 승차권')] });
  await own;
  late.fail();
  await loading;

  assert.equal(ticketById(21)?.name, 'B 승차권');
});

test('A 의 늦은 발권 · 지우기 응답도 B 목록을 바꾸지 않는다', async () => {
  await login('token-A');
  const saving = saveTicket(ticket(0, 'A 새 승차권'));
  const lateSave = await requestTo('/api/me/tickets');
  const removing = deleteTicket(22);
  const lateDelete = await requestTo('/api/me/tickets/22');
  const { leaving, logout } = await switchToB();
  logout?.answer(200, {});
  await leaving;

  const own = loadTickets();
  (await requestTo('/api/me/tickets')).answer(200, { tickets: [ticket(22, 'B 승차권')] });
  await own;
  lateSave.answer(200, ticket(11, 'A 새 승차권'));
  lateDelete.answer(200, {});
  await Promise.all([saving, removing]);

  assert.equal(ticketById(11), null);
  assert.equal(ticketById(22)?.name, 'B 승차권');
});

test('세션이 그대로면 승차권을 평소처럼 받는다', async () => {
  const loading = loadTickets();
  (await requestTo('/api/me/tickets')).answer(200, { tickets: [ticket(30, '내 승차권')] });
  await loading;
  assert.equal(ticketById(30)?.name, '내 승차권');
});
