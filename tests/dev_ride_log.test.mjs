// 개발자 회원의 타고 가기 기록기(web/user/dev_ride_log.mts) — 기기에 쌓기 · 15초마다 POST /api/me/rides · 센서 0.1초 칸 ·
// 보낸 결과에 따라 빼기 / 다시 / 멈추기(2026-11-11 계획서 — 서버 계약 server/routes/members.py · services/debug.py clean_event)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRideLog, batchSize, dropAfter, motionChunks, closeCell, RIDE_LOG_KEY, FLUSH_MS, MOTION_MS} from '../web/user/dev_ride_log.mts';

const KINDS = new Set(['start', 'gps', 'arrive', 'depart', 'end', 'mark', 'motion', 'judge', 'answer']);   // 서버 MAP_KINDS
const SUBWAY = {mode: 'subway', line: '2호선', train: '2234', station: '시청'};

// 가짜 브라우저: 저장소 · 보내기(답 차례를 고를 수 있다) · 시계 · 되풀이 · 센서
function rig({stored = null, replies = [], ask = null} = {}) {
  const store = new Map(stored ? [[RIDE_LOG_KEY, stored]] : []), sent = [], timers = new Set(), asked = [];
  let clock = Date.UTC(2026, 10, 11, 1, 0, 0), motionOn = null;
  const deps = {
    storage: {getItem: key => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); }},
    send: async (url, init) => { sent.push({url, init, events: JSON.parse(init.body).events}); const status = replies.length ? replies.shift() : 200; if (status === 'throw') throw new Error('offline'); return {status}; },
    now: () => clock,
    every: (run, ms) => { const timer = {run, ms}; timers.add(timer); return () => timers.delete(timer); },
    online: () => true,
    askMotion: ask && (() => { asked.push(clock); return ask(); }),
    listenMotion: on => { motionOn = on; return () => { motionOn = null; }; },
    forbidden: () => { deps.gone = (deps.gone ?? 0) + 1; },
  };
  const fire = ms => { for (const timer of [...timers]) if (timer.ms === ms) timer.run(); };
  const settle = () => new Promise(done => setTimeout(done, 0));
  return {deps, store, sent, timers, asked, fire, settle, advance: ms => { clock += ms; }, motion: event => motionOn?.(event), get motionOn() { return !!motionOn; }, saved: () => JSON.parse(store.get(RIDE_LOG_KEY) ?? '[]')};
}

// 서버 clean_event 가 받는 모양인지(필수 칸 · 길이 · 범위)
function serverShape(event) {
  assert.ok(KINDS.has(event.kind), event.kind);
  assert.ok(['subway', 'bus'].includes(event.mode));
  assert.ok(typeof event.ride === 'string' && event.ride.length <= 40);
  assert.ok(event.t >= 1.6e12 && event.t <= 4.1e12);
  if (event.kind === 'motion') { assert.ok(event.m.length >= 1 && event.m.length <= 1500); assert.equal(event.m.length % 10, 0); }
  if (event.kind === 'judge') assert.ok(typeof event.state === 'string' && event.state.length >= 1 && event.state.length <= 40);
  if (event.kind === 'answer') assert.ok(['rode', 'not_rode'].includes(event.answer));
}

test('출발 누름 안에서 센서 권한을 바로 묻고, 시작 · 판정 · 정답 · 끝을 기기에 쌓아 서버 모양으로 보낸다', async () => {
  const box = rig({ask: async () => 'granted'});
  const log = createRideLog(box.deps);
  assert.equal(box.timers.size, 0, '쌓인 것이 없으면 보내기 타이머도 없다');
  log.begin(SUBWAY);
  assert.equal(box.asked.length, 1, 'begin 안에서 기다림 없이 권한을 묻는다(아이폰 누름 안)');
  assert.equal(log.recording, true);
  log.judge('wait@0', SUBWAY); log.judge('wait@0', SUBWAY);   // 같은 판정은 한 번
  log.judge('wait:hold@0', SUBWAY);
  log.answer('rode', SUBWAY);
  assert.equal(log.answered, 'rode');
  await box.settle();
  const first = box.sent[0];
  assert.equal(first.url, './api/me/rides');
  assert.equal(first.init.method, 'POST');
  assert.equal(first.init.credentials, 'same-origin');
  assert.equal(first.init.headers['X-Requested-With'], 'syung');
  assert.deepEqual(first.events.map(event => event.kind), ['start', 'judge', 'judge', 'answer']);
  assert.deepEqual(first.events.filter(event => event.kind === 'judge').map(event => event.state), ['wait@0', 'wait:hold@0']);
  assert.equal(first.events[0].line, '2호선');
  assert.equal(first.events[0].train, '2234');
  first.events.forEach(serverShape);
  assert.equal(new Set(first.events.map(event => event.ride)).size, 1);
  assert.deepEqual(box.saved(), [], '보낸 것은 기기에서 뺀다');
  log.end('도착', SUBWAY);
  assert.equal(log.recording, false);
  await box.settle();
  assert.deepEqual(box.sent.at(-1).events.map(event => event.kind), ['end']);
  assert.equal(box.timers.size, 0, '다 보냈고 끝났으면 타이머를 멈춘다');
});

test('GPS 는 5초에 한 점 · 15초 안의 마지막 위치를 다른 사건에 붙인다', () => {
  const box = rig();
  const log = createRideLog(box.deps);
  log.begin(SUBWAY);
  const coords = {latitude: 37.5658, longitude: 126.9772, accuracy: 12, speed: null, heading: NaN};
  log.gps(coords);
  box.advance(1000); log.gps(coords);   // 4.5초 안: 남기지 않는다
  box.advance(4000); log.gps({...coords, speed: 3.2});
  log.judge('ride@0', SUBWAY);
  box.advance(16000); log.judge('done', SUBWAY);   // 15초 넘음: 위치를 붙이지 않는다
  const events = box.saved();
  const gps = events.filter(event => event.kind === 'gps');
  assert.equal(gps.length, 2);
  assert.equal('speed' in gps[0], false); assert.equal('heading' in gps[0], false);
  assert.equal(gps[1].speed, 3.2);
  const [near, far] = events.filter(event => event.kind === 'judge');
  assert.equal(near.lat, 37.5658);
  assert.equal('lat' in far, false);
  events.forEach(serverShape);
});

test('가속도: 0.1초 칸 평균을 5초마다 motion 으로 · 권한을 거절하면 센서 없이', async () => {
  const box = rig({ask: async () => 'granted'});
  const log = createRideLog(box.deps);
  log.begin(SUBWAY);
  await box.settle();
  assert.equal(box.motionOn, true);
  for (let index = 0; index < 30; index++) {
    box.motion({accelerationIncludingGravity: {x: 0.1, y: 9.8, z: 0.2}, acceleration: {x: index % 3 ? 0.2 : 0, y: null, z: 0}, rotationRate: {alpha: 1, beta: 2, gamma: 3}});
    box.advance(50);
  }
  box.fire(MOTION_MS);
  const motion = box.saved().filter(event => event.kind === 'motion');
  assert.equal(motion.length, 1);
  serverShape(motion[0]);
  assert.equal(motion[0].m[4], 0.1, '중력 뺀 x 평균(0 · 0.2 반반 → 소수 둘째 자리)');
  assert.equal(motion[0].m[5], null, '없는 값은 null');
  log.end('그만둠', SUBWAY);
  assert.equal(box.motionOn, false, '끝나면 센서를 끈다');

  const denied = rig({ask: async () => 'denied'});
  createRideLog(denied.deps).begin(SUBWAY);
  await denied.settle();
  assert.equal(denied.motionOn, false);
});

test('보낸 결과: 끊김 · 503 은 다음에 다시, 400 은 그 묶음을 버리고, 401 은 멈추고(기기에 둔다), 403 은 멈추고 지운다', async () => {
  const box = rig({replies: ['throw', 503, 400]});
  const log = createRideLog(box.deps);
  log.begin(SUBWAY);
  box.fire(FLUSH_MS); await box.settle();
  assert.equal(box.saved().length, 1, '끊김: 그대로');
  box.fire(FLUSH_MS); await box.settle();
  assert.equal(box.saved().length, 1, '503: 그대로');
  box.fire(FLUSH_MS); await box.settle();
  assert.equal(box.saved().length, 0, '400: 버린다');

  const expired = rig({replies: [401]});
  const left = createRideLog(expired.deps);
  left.begin(SUBWAY);
  expired.fire(FLUSH_MS); await expired.settle();
  assert.equal(expired.deps.gone, 1);
  assert.equal(left.recording, false);
  assert.equal(expired.saved().length, 1, '401: 다음 로그인 때 보내게 둔다');
  assert.equal(expired.timers.size, 0, '더 보내지 않는다');

  const demoted = rig({replies: [403]});
  createRideLog(demoted.deps).begin(SUBWAY);
  demoted.fire(FLUSH_MS); await demoted.settle();
  assert.equal(demoted.deps.gone, 1);
  assert.deepEqual(demoted.saved(), [], '403: 받아 줄 곳이 없으니 지운다');
});

test('지난번에 못 보낸 기록은 다시 만들 때 보낸다 · close 뒤로는 보내지 않는다', async () => {
  const leftover = JSON.stringify([{kind: 'gps', mode: 'subway', ride: 'map-1', t: Date.UTC(2026, 10, 11), lat: 37.5, lng: 127, acc: 10}]);
  const box = rig({stored: leftover});
  const log = createRideLog(box.deps);
  assert.equal(box.timers.size, 1);
  box.fire(FLUSH_MS); await box.settle();
  assert.equal(box.sent.length, 1);
  log.begin(SUBWAY);
  log.close();
  assert.equal(log.recording, false);
  box.fire(FLUSH_MS); await log.flush(); await box.settle();
  assert.equal(box.sent.length, 1);
  assert.equal(box.saved().length, 1, '쌓인 것은 기기에 둔다');
});

test('보내기 묶음: 500개 · 센서 40개까지 · 200 · 400 · 413 만 줄에서 뺀다', () => {
  assert.equal(batchSize(Array.from({length: 900}, () => ({kind: 'gps'}))), 500);
  assert.equal(batchSize([{kind: 'start'}, ...Array.from({length: 60}, () => ({kind: 'motion'}))]), 41);
  assert.deepEqual([200, 400, 413, 401, 403, 500, 503].map(dropAfter), [true, true, true, false, false, false, false]);
  const bins = Array.from({length: 150}, (_, index) => closeCell({slot: 1000 + index * 100, sum: Array(9).fill(1), n: Array(9).fill(1)}));
  const chunks = motionChunks(bins, 1000);
  assert.deepEqual(chunks.map(chunk => chunk.length), [1400, 100]);
  assert.equal(chunks[0][0], 0);
});
