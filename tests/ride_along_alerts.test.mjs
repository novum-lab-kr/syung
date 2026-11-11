// 타고 가기 알림 때(계획서 plans/feature/20261111-syung-타고-가기-앱-알림.md — D2 도착 2분 전 · 5절 글):
// 셈(lib/ride-along rideAlerts · dueAlerts) · 보내기(ui/ride_alerts — 이미 울린 것 빼기 · 브라우저 타이머) · 타고 가기에 이은 것(ui/ride_along — 가짜 위치 · 가짜 도착)
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_ALERT_S, alightPlanMs, clockMs, dueAlerts, rideAlerts } from '../web/lib/ride-along.mts';

globalThis.document = {hidden: false, createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlerts, browserAlerts, rideAlertSink} = await import('../web/ui/ride_alerts.mts');
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const NOW = new Date(2026, 10, 11, 8, 0, 0).getTime();
const trainLeg = {type: 'ride', line: '4호선', from: '서울역', to: '사당', departs: '08:05', arrives: '08:25', direction: '하행', stops: 5, wait: 60, stations: [1, 2, 3, 4, 5, 6]};
const busLeg = {type: 'bus', route: '472', from: '시청', to: '신사역', departs: '08:10', arrives: '08:40', toward: '개포동', stops: 10, wait: 60, path: [[126.97, 37.56], [127.02, 37.51]]};
const walk = {type: 'walk', seconds: 120, metres: 100, path: [[126.97, 37.55], [126.97, 37.56]]};
const base = {nowMs: NOW, tries: 0, boardAtMs: null, boardedMs: null, leaveAtMs: null, stopsLeft: null};

test('기다리는 동안: 실시간으로 아는 첫 열차 도착 2분 전 탈 준비 · 내림 준비는 그 열차로 계획 시각', () => {
  assert.equal(BOARD_ALERT_S, 120);
  const arrives = NOW + 7 * 60000;
  const [board, alight] = rideAlerts({...base, legs: [walk, trainLeg], index: 1, step: 'wait', boardAtMs: arrives});
  assert.deepEqual(board, {id: 'board:1:0', at: arrives - 120000, title: '🚇 4호선 사당 방면 열차가 곧 와요', body: '탈 준비하세요'});
  // 20분 · 5정거장 → 앞 역을 떠나는 때 = 탄 때 + 16분
  assert.deepEqual(alight, {id: 'alight:1', at: arrives + 16 * 60000, title: '🚇 다음 역 사당에서 내리세요', body: ''});
});

test('실시간 도착을 모르면 탈 준비는 없다(시간표만으로 「곧 와요」 안 함) — 내림 준비도 없다', () => {
  assert.deepEqual(rideAlerts({...base, legs: [walk, trainLeg], index: 1, step: 'wait'}), []);
});

test('계획 출발이 이미 지난 기다리기(08:05 출발 · 지금 08:30 · 실시간 모름)는 빈 목록 — 승강장에서 「내리세요」가 울리지 않는다', () => {
  const late = clockMs('08:30', NOW);
  assert.deepEqual(rideAlerts({...base, legs: [walk, trainLeg], index: 1, step: 'wait', nowMs: late}), []);
  const ride = rideAlerts({...base, legs: [walk, trainLeg], index: 1, step: 'ride', nowMs: late, boardedMs: late});
  assert.deepEqual(ride.map(alert => [alert.id, alert.at]), [['alight:1', late + 16 * 60000]], '탄 뒤에 탄 때부터 센다');
});

test('놓쳐서 다음 열차를 기다리면 탈 준비는 새 id', () => {
  assert.equal(rideAlerts({...base, legs: [trainLeg], index: 0, step: 'wait', boardAtMs: NOW, tries: 1})[0].id, 'board:0:1');
});

test('타는 중: 탄 열차 예측 > 남은 1정거장이면 지금 > 계획 시각(탄 때부터)', () => {
  const ride = {...base, legs: [trainLeg], index: 0, step: 'ride', boardedMs: NOW};
  assert.deepEqual(rideAlerts(ride).map(alert => [alert.id, alert.at]), [['alight:0', NOW + 16 * 60000]], '계획: 탄 때 + 16분');
  assert.equal(rideAlerts({...ride, leaveAtMs: NOW + 9 * 60000})[0].at, NOW + 9 * 60000, '지도 예측이 앞 역을 떠날 때');
  assert.equal(rideAlerts({...ride, leaveAtMs: NOW + 9 * 60000, stopsLeft: 1, nowMs: NOW + 5000})[0].at, NOW + 5000, '카드가 「다음 역에서 내려요」면 지금');
  assert.equal(rideAlerts({...ride, boardAtMs: NOW + 60000}).length, 1, '타는 중에는 탈 준비가 없다');
});

test('버스: 「🚌 472 버스가 곧 와요」 · 「🚌 다음 정류장 신사역에서 내리세요」 · 걷기 · 없는 구간은 빈 목록', () => {
  const [board, alight] = rideAlerts({...base, legs: [walk, busLeg], index: 1, step: 'wait', boardAtMs: NOW + 300000});
  assert.equal(board.title, '🚌 472 버스가 곧 와요'); assert.equal(board.body, '');
  assert.equal(alight.title, '🚌 다음 정류장 신사역에서 내리세요');
  assert.equal(alight.at, NOW + 300000 + 27 * 60000, '30분 · 10정거장 → 27분 뒤');
  assert.deepEqual(rideAlerts({...base, legs: [walk, busLeg], index: 0, step: 'wait'}), []);
  assert.deepEqual(rideAlerts({...base, legs: [walk], index: 3, step: 'ride'}), []);
});

test('계획 시각 셈: 자정 넘김 · 1정거장(탄 때 바로) · 시각 글은 지금에서 12시간 안쪽', () => {
  assert.equal(alightPlanMs({...trainLeg, departs: '23:55', arrives: '00:05', stops: 2}, 0), 5 * 60000);
  assert.equal(alightPlanMs({...trainLeg, stops: 1}, 1000), 1000);
  assert.equal(clockMs('23:50', new Date(2026, 10, 11, 0, 10).getTime()), new Date(2026, 10, 10, 23, 50).getTime(), '자정 직후의 「23:50」은 어제');
});

test('이미 울린 것: 지난 때는 아직 안 보냈으면 지금 울리고, 그때로 보냈으면(앱 · 타이머가 울림) 빼고, 한 번 울린 id 는 다시 안 넣는다', () => {
  const fired = new Set(), alert = (id, at) => ({id, at, title: id, body: ''});
  assert.deepEqual(dueAlerts([alert('a', NOW - 1000), alert('b', NOW + 1000)], new Map(), fired, NOW), [alert('a', NOW), alert('b', NOW + 1000)]);
  assert.deepEqual(dueAlerts([alert('a', NOW + 5000)], new Map(), fired, NOW), [], 'a 는 울렸다');
  assert.deepEqual(dueAlerts([alert('c', NOW - 10)], new Map([['c', {at: NOW - 10, text: 'c\n'}]]), fired, NOW), [], '그때로 보냈다 — 이미 울렸다');
  assert.deepEqual(dueAlerts([alert('d', NOW - 10)], new Map([['d', {at: NOW + 60000, text: 'd\n'}]]), fired, NOW), [alert('d', NOW)], '예측이 당겨졌다 — 지금');
});

test('보내기: 바뀐 때만(10초 안 흔들림은 그대로) · 울린 뒤 빠짐 · 그만두면 빈 목록 한 번', () => {
  const sent = [], sink = createRideAlerts(list => sent.push(list.map(alert => `${alert.id}@${alert.at - NOW}`)));
  const list = at => [{id: 'board:1:0', at: NOW + at, title: 't', body: ''}];
  sink.update(list(60000), NOW);
  sink.update(list(65000), NOW + 1000);
  sink.update(list(75000), NOW + 2000);
  sink.update(list(75000), NOW + 75000);   // 울릴 때가 됨 — 그쪽이 울렸다
  sink.update(list(75000), NOW + 76000);
  sink.clear();
  assert.deepEqual(sent, [['board:1:0@60000'], ['board:1:0@75000'], []], '빈 목록 뒤 그만둠은 더 보내지 않는다');
  sink.update([{id: 'alight:1', at: NOW + 600000, title: 't', body: ''}], NOW);
  sink.clear(); sink.clear();
  assert.deepEqual(sent.slice(3), [['alight:1@600000'], []], '남은 예약이 있으면 빈 목록 한 번');
});

test('브라우저: 허용했으면 때에 울리고, 목록이 바뀌면 다시 건다 · 허용 안 했으면 아무것도 안 한다', context => {
  context.mock.timers.enable({apis: ['setTimeout', 'Date'], now: NOW});
  const shown = [];
  class FakeNotification { static permission = 'granted'; static requestPermission() { return Promise.resolve('granted'); } constructor(title, options) { shown.push([title, options]); } }
  const deliver = browserAlerts(FakeNotification);
  deliver([{id: 'board:1:0', at: NOW + 60000, title: '🚇 곧 와요', body: '탈 준비하세요'}]);
  deliver([{id: 'board:1:0', at: NOW + 90000, title: '🚇 곧 와요', body: '탈 준비하세요'}]);
  context.mock.timers.tick(60000);
  assert.deepEqual(shown, [], '옛 때(60초)는 지웠다');
  context.mock.timers.tick(30000);
  assert.deepEqual(shown, [['🚇 곧 와요', {body: '탈 준비하세요', tag: 'board:1:0'}]]);
  FakeNotification.permission = 'denied';
  deliver([{id: 'alight:1', at: Date.now(), title: '내려요', body: ''}]);
  context.mock.timers.tick(10);
  assert.equal(shown.length, 1, '거부면 조용히');
});

test('알림 장치가 없는 브라우저는 알림 없이(null) · 앱이면 앱으로 · 권한은 아직 안 정했을 때만 묻는다', () => {
  const saved = globalThis.Notification;
  delete globalThis.Notification;
  assert.equal(rideAlertSink(null), null);
  let asked = 0;
  globalThis.Notification = class { static permission = 'default'; static requestPermission() { asked++; return Promise.resolve('denied'); } };
  rideAlertSink(null).ask();
  globalThis.Notification.permission = 'denied';
  rideAlertSink(null).ask();
  assert.equal(asked, 1);
  const got = [];
  rideAlertSink(list => got.push(list)).update([{id: 'x', at: NOW + 5000, title: 'x', body: ''}], NOW);
  assert.equal(got.length, 1, '앱 다리로');
  if (saved) globalThis.Notification = saved; else delete globalThis.Notification;
});

// 타고 가기에 이음(ui/ride_along — ride_along_missed_train 시험과 같은 가짜): 기다리는 동안 곧 올 열차 줄 → 탈 준비, 그만두면 빈 목록
test('타고 가기: 곧 올 열차 2분 뒤를 받으면 탈 준비(지금) · 내림 준비 · 그만두면 지운다', async context => {
  context.mock.timers.enable({apis: ['setInterval']});
  const realFetch = globalThis.fetch, at = minutes => { const time = new Date(Date.now() + minutes * 60000); return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`; };
  globalThis.fetch = async () => ({json: async () => ({arrivals: [{line: '1호선', direction: '하행', destination: null, trainNo: '0097', eta: 300, message: '전역 출발', receivedAt: null}]})});
  const delivered = [], sink = createRideAlerts(list => delivered.push(list)), CITY_HALL = [126.9770, 37.5658];
  let onFix = null;
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans: []}, trainPose: () => ({dist: 0}), trainLngLat: () => ({lng: 0, lat: 0}), arrivalRank: row => row.eta,
    byId: new Map([[1, {lat: CITY_HALL[1], lon: CITY_HALL[0], name: '시청'}], [2, {lat: 37.5563, lon: 126.9723, name: '서울역'}], [3, {lat: 37.5547, lon: 126.9707, name: '남영'}]]),
    animFrame: [], drawRideCard() {}, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
    alerts: sink,
  });
  context.after(() => { rideAlong.stop(); globalThis.fetch = realFetch; });
  onFix({coords: {longitude: CITY_HALL[0], latitude: CITY_HALL[1], accuracy: 10}});
  const leg = {type: 'ride', line: '1호선', from: '시청', to: '남영', departs: at(2), arrives: at(12), direction: '하행', stops: 2, wait: 60, stations: [1, 2, 3], trainNo: '0097'};
  rideAlong.start({arrives: at(20), legs: [leg]}, '남영');
  await new Promise(resolve => setTimeout(resolve, 0));
  context.mock.timers.tick(1000);   // tick 이 곧 올 열차 줄에서 0097(5분 뒤)을 고른다
  const last = delivered.at(-1), board = last.find(alert => alert.id === 'board:0:0'), alight = last.find(alert => alert.id === 'alight:0');
  assert.equal(board.title, '🚇 1호선 남영 방면 열차가 곧 와요');
  assert.ok(Math.abs(board.at - (Date.now() + 180000)) < 3000, '5분 뒤 열차 → 3분 뒤 탈 준비');
  assert.ok(Math.abs(alight.at - (Date.now() + 300000 + 5 * 60000)) < 3000, '그 열차로 탄 때 + 10분 × 1/2');
  rideAlong.stop();
  assert.deepEqual(delivered.at(-1), [], '그만두면 빈 목록');
});
