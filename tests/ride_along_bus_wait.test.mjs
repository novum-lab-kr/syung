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
  const views = [], cars = {approach: null, atStop: new Map()}, calls = {arrivals: [], ride: [], watch: []};
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans: []}, trainPose: () => ({dist: 0}), trainLngLat: () => ({lng: 0, lat: 0}), arrivalRank: () => 0, byId: new Map(), animFrame: [],
    drawRideCard: (_host, view) => { views.push(view); }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {
      board: leg => leg.route === 'M4403' ? {routeId: '', stopId: '121000123', arsId: '22162', routeName: 'M4403'} : {routeId: '100100118', stopId: 'S1', arsId: '02137'},
      arrivals: async (arsId, routeId, routeName) => { calls.arrivals.push(routeName ? [arsId, routeId, routeName] : [arsId, routeId]); return [Date.now() + 180000, Date.now() + 720000]; },
      approach: (_routeId, _stopId, skip) => cars.approach && !skip.has(cars.approach) ? cars.approach : null,
      atStop: vehicleId => cars.atStop.get(vehicleId) ?? null,
      ride: (vehicleId, spot, riding) => { calls.ride.push([vehicleId, spot, riding]); },
      watch: routeId => { calls.watch.push(routeId); },
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
  assert.deepEqual(calls.ride.at(-1), ['BUS1', STOP, true], '탄 차를 내 위치에');
  rideAlong.stop();
  assert.deepEqual(calls.ride.at(-1), [null, null, false], '그만두면 실시간 위치로 되돌리고 캐릭터도 다시 보인다');
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
  // 탄 차를 몰라도 타는 단계면 캐릭터는 계속 숨긴다(2026-11-08 사용자 결정 — 놓친 동안 다시 보였다)
  assert.equal(calls.ride.at(-1)[2], true);
});

// 운영 472 추적(2026-11-07 probe): 지켜보던 앞 차가 몇 초 위치가 끊겼다(stale — 층이 못 봄) 돌아왔다. 그동안 뒤 차를 골라 붙들고 있어
// 앞 차가 정류장에 들어와도 탄 것으로 넘어가지 않았다(탄 차 ridden 도 없음)
test('지켜보던 앞 차가 잠깐 안 보였다 돌아와 정류장에 들어오면 그 차를 탄 것(뒤 차를 붙들지 않는다)', async context => {
  const {rideAlong, cars, calls, fix, view} = setup();
  context.after(() => rideAlong.stop());
  fix(STOP);
  rideAlong.start({arrives: hhmm, legs: [BUS]}, '신사역');
  await settle();
  cars.approach = 'BUS1'; cars.atStop.set('BUS1', false);
  fix(STOP);
  // 앞 차 위치가 끊김: 층은 그 차를 못 보고 곧 올 차로 뒤 차를 낸다
  cars.atStop.delete('BUS1'); cars.approach = 'BUS2'; cars.atStop.set('BUS2', false);
  fix(STOP);
  // 앞 차가 돌아와 다시 가장 가까운 곧 올 차 → 정류장에 들어옴
  cars.approach = 'BUS1'; cars.atStop.set('BUS1', false);
  fix(STOP);
  cars.atStop.set('BUS1', true);
  fix(STOP);
  assert.equal(view().title, '신사역에서 내려요');
  fix(STOP);
  assert.deepEqual(calls.ride.at(-1), ['BUS1', STOP, true], '탄 차는 앞 차');
});

// 운영 10케이스 #8(2026-11-08): 타는 중 정류장 원을 눌러 그 아래 140번 선이 골라지자 버스 층이 길찾기 노선을 지우고 140번만 받아
// 다음 구간 603 을 25분 못 탔다 — 타고 가기가 기다리는 노선을 버스 층에 따로 알린다(그만두면 놓는다)
test('버스 기다리기 · 타기 동안 그 노선을 버스 층에 알리고(다른 노선을 눌러도 계속 받게) 그만두면 놓는다', async context => {
  const {rideAlong, cars, calls, fix} = setup();
  context.after(() => rideAlong.stop());
  fix(STOP);
  rideAlong.start({arrives: hhmm, legs: [BUS]}, '신사역');
  await settle();
  assert.equal(calls.watch.at(-1), '100100118', '기다리는 노선');
  cars.approach = 'BUS1'; cars.atStop.set('BUS1', true);
  fix(STOP);
  assert.equal(calls.watch.at(-1), '100100118', '타는 동안도 그대로');
  rideAlong.stop();
  assert.equal(calls.watch.at(-1), null);
});

// 운영 10케이스 #7 6616(2026-11-08): 탈 정류장(수궁119안전센터)을 고리로 다시 지나는 노선. 버스 길 전체에서 가장 가까운 점을 찾으면
// 되돌아오는 쪽(길 처음부터 1.2km 넘게)에 붙어 차가 오기 전에 「내려요」로 넘어갔다. 지난 자리부터 앞으로만 찾는다
const NORTH = 37.56518;   // 탈 정류장 20m 북쪽으로 되돌아오는 길
const LOOP = {...BUS, route: '6616', path: [STOP, [126.9858, 37.5650], [126.9858, NORTH], [126.9790, NORTH], [126.9750, NORTH]]};
const NEAR_RETURN = [126.9790, 37.565135];   // 정류장 15m 북쪽(되돌아오는 길까지 5m)
test('고리 노선: 탈 정류장 옆을 되돌아오는 길이 지나도 차가 오기 전엔 기다리기 · 탄 뒤 남은 정거장은 처음 쪽', async context => {
  const {rideAlong, cars, fix, view} = setup();
  context.after(() => rideAlong.stop());
  fix(NEAR_RETURN);
  rideAlong.start({arrives: hhmm, legs: [LOOP]}, '오류동역');
  await settle();
  fix(NEAR_RETURN);
  assert.equal(view().title, '6616 신사역 방면 타는 곳으로', '차 없이 탄 것으로 넘어가지 않는다');
  cars.approach = 'BUS1'; cars.atStop.set('BUS1', true);
  fix(NEAR_RETURN);
  assert.equal(view().title, '신사역에서 내려요');
  fix(NEAR_RETURN);
  assert.match(view().sub, /8정거장/, '남은 정거장은 탄 정류장 기준(되돌아오는 쪽이면 줄어 보였다)');
});

// 광역(2026-11-08 사용자 결정): 서울 자료에 없는 노선은 도착을 노선 이름으로 받아 「N분 뒤」 · 곧 올 차는 모르니 지켜보지 않는다
test('광역 노선(노선 id 없음): 정류장 도착을 노선 이름으로 받아 N분 뒤 · 곧 올 차 · 지켜보는 노선은 없음', async context => {
  const {rideAlong, calls, fix, view} = setup();
  context.after(() => rideAlong.stop());
  fix(STOP);
  rideAlong.start({arrives: hhmm, legs: [{...BUS, route: 'M4403', toward: '강남역'}]}, '강남역');
  await settle();
  assert.deepEqual(calls.arrivals, [['22162', '', 'M4403']]);
  assert.equal(view().sub, '정류장 도착 · M4403번 3분 뒤 · 다음 12분 뒤');
  assert.equal(calls.watch.at(-1), null);
});
