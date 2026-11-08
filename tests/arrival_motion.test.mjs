// 도착 연기 로딩 실패는 기존 카드로 돌아가도록 알리고, 이미 닫힌 연기는 다시 열지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {playArrival} from '../web/lib/arrival_motion.mts';

const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(context, response) {
  const before = new Map(['lottie', 'document', 'getComputedStyle', 'matchMedia'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  context.after(() => { for (const [key, descriptor] of before) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const listeners = {}, errors = [], classes = new Set();
  let destroyed = 0;
  const anim = {destroy() { destroyed++; }, play() {}, goToAndStop() {}, totalFrames: 2, addEventListener(name, listener) { listeners[name] = listener; }};
  globalThis.lottie = {loadAnimation: () => anim};
  globalThis.document = {createElement: () => ({style: {}, remove() {}})};
  globalThis.getComputedStyle = () => ({color: 'rgb(0, 0, 0)'});
  globalThis.matchMedia = () => ({matches: false});
  context.mock.method(globalThis, 'fetch', response);
  const box = {isConnected: true, append() {}, classList: {add(name) { classes.add(name); }, remove(name) { classes.delete(name); }}};
  return {box, errors, listeners, classes, destroyed: () => destroyed, fail: () => errors.push('fallback')};
}

test('장면 HTTP 오류를 기존 카드로 돌아가도록 알린다', async context => {
  const {box, errors, fail} = setup(context, async () => ({ok: false}));
  const stop = playArrival(box, 'char-ride', fail);
  await settle(); assert.deepEqual(errors, ['fallback']); stop();
});

test('장면 요청 거부와 잘못된 JSON을 알리고 다음 도착에 다시 받는다', async context => {
  let count = 0;
  const {box, errors, fail} = setup(context, async () => {
    count++;
    if (count === 1) throw new Error('offline');
    return {ok: true, json: async () => { throw new SyntaxError('bad JSON'); }};
  });
  playArrival(box, 'char-ride', fail); await settle();
  playArrival(box, 'char-ride', fail); await settle();
  assert.equal(count, 2); assert.deepEqual(errors, ['fallback', 'fallback']);
});

test('플레이어를 쓸 수 없으면 기존 카드로 돌아가도록 알린다', async context => {
  const {box, errors, fail} = setup(context, async () => { globalThis.lottie = undefined; return {ok: true, json: async () => ({layers: []})}; });
  playArrival(box, 'char-ride', fail);
  await settle(); assert.deepEqual(errors, ['fallback']);
});

test('SVG 플레이어 생성 오류를 알린다', async context => {
  const {box, errors, fail} = setup(context, async () => ({ok: true, json: async () => ({layers: []})}));
  globalThis.lottie.loadAnimation = () => { throw new Error('renderer unavailable'); };
  playArrival(box, 'char-ride', fail);
  await settle(); assert.deepEqual(errors, ['fallback']);
});

test('재생기 비동기 오류는 한 번만 알리고 부분 장면을 치운다', async context => {
  const {box, errors, fail, classes, listeners, destroyed} = setup(context, async () => ({ok: true, json: async () => ({layers: []})}));
  const stop = playArrival(box, 'char-ride', fail);
  await settle(); assert.equal(classes.has('on'), true); assert.deepEqual(errors, []);
  listeners.data_failed(); listeners.error(); stop();
  assert.deepEqual(errors, ['fallback']); assert.equal(destroyed(), 1); assert.equal(classes.has('on'), false);
});

test('이미 닫았거나 DOM에서 빠진 장면은 늦은 로딩 실패를 알리지 않는다', async context => {
  let reject;
  const {box, errors, fail} = setup(context, () => new Promise((_, no) => { reject = no; }));
  const stop = playArrival(box, 'flag', fail);
  stop(); reject(new Error('late rejection')); await settle();
  assert.deepEqual(errors, []);
  box.isConnected = false;
  playArrival(box, 'char-ride', fail); await settle();
  assert.deepEqual(errors, []);
});
