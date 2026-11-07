// 타고 가기(web/ui/ride_along.mts) — 버스 기다리기: 정류장 도착(남은 시간)을 카드에 · 곧 올 차가 정류장에 들어오면 그 순간 탄 것 ·
// 탄 차는 내 위치에 그린다(2026-11-07 사용자 결정). 버스 층(bus/layer journey*)은 가짜로 바꿔 끼운다
import test from 'node:test';
import assert from 'node:assert/strict';

// ride_along 은 모듈을 읽을 때 카드 자리(div)를 body 에 붙인다 — Node 에는 document 가 없어 최소한만 흉내 낸다(ride_along_follow 와 같다)
globalThis.document = {hidden: false, createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const STOP = [126.9790, 37.5650];
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
// 출발 시각은 지금보다 30분 뒤(시각으로 넘어가지 않게)
const later = new Date(Date.now() + 30 * 60000), hhmm = `${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
const BUS = {type: 'bus', route: '472', from: '시청역9번출구.시청서소문2청사', to: '신사역', departs: hhmm, arrives: hhmm, toward: '신사역', stops: 8, wait: 60, path: [STOP, [126.9800, 37.5640]]};

function setup() {
  let onFix = null;
  const views = [], cars = {approach: null, atStop: new Map()}, calls = {arrivals: [], ride: []};
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans: []}, trainPose: () => ({dist: 0}), trainLngLat: () => ({lng: 0, lat: 0}), arrivalRank: () => 0, byId: new Map(), animFrame: [],
    drawRideCard: (_host, view) => { views.push(view); }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {
      board: () => ({routeId: '100100118', stopId: 'S1', arsId: '02137'}),
      arrivals: async (arsId, routeId) => { calls.arrivals.push([arsId, routeId]); return [Date.now() + 180000, Date.now() + 720000]; },
      approach: (_routeId, _stopId, skip) => cars.approach && !skip.has(cars.approach) ? cars.approach : null,
      atStop: vehicleId => cars.atStop.get(vehicleId) ?? null,
      ride: (vehicleId, spot) => { calls.ride.push([vehicleId, spot]); },
    },
  });
  const fix = ([longitude, latitude]) => onFix({coords: {longitude, latitude, accuracy: 10}});
  return {rideAlong, cars, calls, fix, view: () => views.at(-1)};
}

test('버스 기다리기 카드에 그 노선 도착 시간 · 곧 올 차가 정류장에 들어오면 탄 것 · 탄 차를 내 위치에 그린다', async context => {
  const {rideAlong, cars, calls, fix, view} = setup();
  context.after(() => rideAlong.stop());
  fix(STOP);
  rideAlong.start({arrives: hhmm, legs: [BUS]}, '신사역');
  await settle();
  assert.deepEqual(calls.arrivals, [['02137', '100100118']], '탈 정류장 번호 · 노선으로 받는다');
  assert.equal(view().sub, '정류장 도착 · 472번 3분 뒤 · 다음 12분 뒤');
  assert.equal(view().say, null, '버스는 말풍선 없음(글이 열차 이야기)');
  // 차가 아직 오는 중: 그대로 기다리기
  cars.approach = 'BUS1'; cars.atStop.set('BUS1', false);
  fix(STOP);
  assert.equal(view().title, '472 신사역 방면 타는 곳으로', '아직 기다리기');
  // 정류장에 들어옴 → 탄 것(승강장 시간 없음 — 이 구간은 처음부터 정류장)
  cars.atStop.set('BUS1', true);
  fix(STOP);
  assert.equal(view().title, '신사역에서 내려요');
  fix(STOP);
  assert.deepEqual(calls.ride.at(-1), ['BUS1', STOP], '탄 차를 내 위치에');
  rideAlong.stop();
  assert.deepEqual(calls.ride.at(-1), [null, null], '그만두면 실시간 위치로 되돌린다');
});

test('버스 층이 차를 못 보면 탄 차는 모름(실시간 위치 그대로) — 내 위치가 버스 길을 따라 나아가면 탄 것', async context => {
  const {rideAlong, calls, fix, view} = setup();
  context.after(() => rideAlong.stop());
  fix(STOP);
  rideAlong.start({arrives: hhmm, legs: [BUS]}, '신사역');
  await settle();
  fix([126.9798, 37.5642]);   // 버스 길 위 약 114m(타는 곳에서 100m 넘게)
  assert.equal(view().title, '신사역에서 내려요');
  fix([126.9798, 37.5642]);
  assert.equal(calls.ride.at(-1)[0], null);
});
