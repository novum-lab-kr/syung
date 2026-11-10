// 타고 가기(web/ui/ride_along.mts) — 지하철을 놓쳤는데 탄 것으로 넘어감(2026-11-10 사용자 · 묵동 60-8 → 용산역).
// 승강장 시간(90초)이 지난 뒤 고른 열차가 역에 들어오면 그 순간 탄 것으로 보는데(2026-11-07 결정), 실제로 안 탔으면 되돌아오지 않았다.
// 열차는 다음 역까지 갔는데 내 위치는 탄 역에 그대로면(위치 3번 연달아) 그 열차를 놓친 것으로 보고 기다리기로 되돌린다
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {hidden: false, createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const at = minutes => { const time = new Date(Date.now() + minutes * 60000); return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`; };
const CITY_HALL = [126.9770, 37.5658], SEOUL = [126.9723, 37.5563];
// 시청 → 남영(1호선 하행) — 시험용 구간
const CITY_LINE = {line: '1호선', direction: '하행', from: '시청', to: '남영', stations: [1, 2, 3], byId: [[1, {lat: CITY_HALL[1], lon: CITY_HALL[0], name: '시청'}], [2, {lat: SEOUL[1], lon: SEOUL[0], name: '서울역'}], [3, {lat: 37.5547, lon: 126.9707, name: '남영'}]]};
// 2026-11-10 사용자가 놓친 곳: 태릉입구(424) → 석계(124) 6호선 상행(data/journey.json dirs '6호선|424|124' = 상행 — 곧 올 열차 줄을 받는 구간) · 좌표는 web/index.html
const TAEREUNG = [127.075135, 37.617939], SEOKGYE = [127.066136, 37.6152145];
const TAEREUNG_LINE = {line: '6호선', direction: '상행', from: '태릉입구', to: '석계', stations: [424, 124, 423], byId: [[424, {lat: TAEREUNG[1], lon: TAEREUNG[0], name: '태릉입구'}], [124, {lat: SEOKGYE[1], lon: SEOKGYE[0], name: '석계'}], [423, {lat: 37.610538, lon: 127.056485, name: '돌곶이'}]]};

function setup(context, route = CITY_LINE) {
  let onFix = null, clock = Date.now();
  const realNow = Date.now, realFetch = globalThis.fetch, views = [], id = `${route.line}:0097`, dist = new Map([[id, 0]]);
  Date.now = () => clock;
  // 곧 올 열차: 0097 2분 뒤 · 0099 7분 뒤(arrivalRank 는 줄의 eta 를 그대로 남은 초로)
  globalThis.fetch = async () => ({json: async () => ({arrivals: [
    {line: route.line, direction: route.direction, destination: null, trainNo: '0097', eta: 120, message: '전역 출발', receivedAt: null},
    {line: route.line, direction: route.direction, destination: null, trainNo: '0099', eta: 420, message: '[3]번째 전역', receivedAt: null},
  ]})});
  const plans = [{id, seq: [{id: 0}, ...route.stations.map(station => ({id: station}))], cum: [0, 1000, 2000, 3000]}];
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans}, trainPose: plan => ({dist: dist.get(plan.id) ?? 0}), trainLngLat: () => ({lng: SEOUL[0], lat: SEOUL[1]}), arrivalRank: row => row.eta,
    byId: new Map(route.byId),
    animFrame: [], drawRideCard: (_host, view) => { views.push(view); }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
  });
  context.after(() => { rideAlong.stop(); Date.now = realNow; globalThis.fetch = realFetch; });
  const fix = ([longitude, latitude], accuracy = 10) => onFix({coords: {longitude, latitude, accuracy}});
  // 탈 시각은 5분 전(목록이 끊기면 시각으로 넘기는 길도 같이 본다)
  const plan = {arrives: at(20), legs: [{type: 'ride', line: route.line, from: route.from, to: route.to, departs: at(-5), arrives: at(10), direction: route.direction, stops: 2, wait: 60, stations: route.stations, trainNo: '0097'}]};
  return {rideAlong, plan, fix, dist, id, view: () => views.at(-1), pass: seconds => { clock += seconds * 1000; }};
}

// 시청에서 0097 을 기다리다 승강장 시간이 지나 0097 이 들어옴 → 탄 것(지금 규칙)
async function boardAtCityHall({rideAlong, plan, fix, dist, id, view, pass}, spot = CITY_HALL, to = '남영') {
  fix(spot);
  rideAlong.start(plan, to);
  await settle();
  assert.match(view().title, /타는 곳으로/);
  pass(100);   // 승강장 90초 지남
  dist.set(id, 1000);   // 0097 이 탈 역에 들어옴
  fix(spot);
  assert.equal(view().title, `${to}에서 내려요`, '들어온 순간 탄 것으로(2026-11-07 결정 그대로)');
}

test('열차는 다음 역까지 갔는데 내 위치가 탄 역에 그대로면 놓친 것 — 기다리기로 되돌려 다음 열차', async context => {
  const ctx = setup(context);
  await boardAtCityHall(ctx);
  const {fix, dist, view, pass} = ctx;
  dist.set('1호선:0097', 2000);   // 0097 은 서울역에 닿음 · 나는 시청에 그대로
  for (let count = 0; count < 3; count++) { pass(5); fix(CITY_HALL); }
  assert.match(view().title, /타는 곳으로/, '놓친 것으로 보고 기다리기로');
  await settle();   // 곧 올 열차를 다시 받는다
  fix(CITY_HALL);
  assert.match(view().title, /타는 곳으로/, '탈 시각이 지났어도 바로 다시 탄 것으로 넘기지 않는다');
  assert.match(view().sub, /승강장 도착 · 다음 열차 7분 뒤/, '놓친 0097 은 빼고 0099');
});

test('열차를 탔으면(내 위치가 열차와 함께 역을 떠남) 그대로 타는 중', async context => {
  const ctx = setup(context);
  await boardAtCityHall(ctx);
  const {fix, dist, view, pass} = ctx;
  dist.set('1호선:0097', 2000);
  for (let count = 0; count < 3; count++) { pass(5); fix(SEOUL); }
  assert.equal(view().title, '남영에서 내려요');
});

test('열차가 아직 다음 역 전이면(막 떠남) 탄 역 근처 위치로 되돌리지 않는다 · 위치 한두 번은 무시', async context => {
  const ctx = setup(context);
  await boardAtCityHall(ctx);
  const {fix, dist, view, pass} = ctx;
  dist.set('1호선:0097', 1300);   // 시청을 막 떠남(서울역 전)
  for (let count = 0; count < 5; count++) { pass(5); fix(CITY_HALL); }
  assert.equal(view().title, '남영에서 내려요', '열차가 다음 역에 닿기 전');
  dist.set('1호선:0097', 2000);
  pass(5); fix(CITY_HALL); pass(5); fix(CITY_HALL);
  assert.equal(view().title, '남영에서 내려요', '두 번까지는 그대로');
  pass(5); fix(SEOUL);   // 한 번 열차 쪽 위치 → 다시 센다
  pass(5); fix(CITY_HALL);
  assert.equal(view().title, '남영에서 내려요');
});

// 태릉입구(6 · 7호선 모두 지하 승강장): 지하에서 위치가 오느냐에 따라 갈린다 — 오면(역 와이파이 등 정확도 100m 안) 잡고, 안 오면 못 잡는다(한계)
test('태릉입구 6호선 상행: 승강장에서 위치가 오면(정확도 100m 안) 놓친 것으로 되돌린다', async context => {
  const ctx = setup(context, TAEREUNG_LINE);
  await boardAtCityHall(ctx, TAEREUNG, '석계');
  const {fix, dist, id, view, pass} = ctx;
  dist.set(id, 2000);   // 0097 은 석계에 닿음 · 나는 태릉입구에 그대로
  for (let count = 0; count < 3; count++) { pass(5); fix(TAEREUNG, 60); }
  assert.match(view().title, /6호선 석계 방면 타는 곳으로/);
  await settle();
  fix(TAEREUNG, 60);
  assert.match(view().sub, /다음 열차 7분 뒤/, '놓친 0097 은 빼고 0099');
});

test('태릉입구 한계: 지하라 위치가 안 오거나 정확도가 100m 넘으면 못 잡는다(탄 것으로 남는다)', async context => {
  const ctx = setup(context, TAEREUNG_LINE);
  await boardAtCityHall(ctx, TAEREUNG, '석계');
  const {fix, dist, id, view, pass} = ctx;
  dist.set(id, 2000);
  pass(60);   // 위치가 안 옴(1초 tick 은 위치를 세지 않는다)
  assert.equal(view().title, '석계에서 내려요', '위치가 없으면 그대로');
  for (let count = 0; count < 5; count++) { pass(5); fix(TAEREUNG, 150); }   // 기지국 위치처럼 정확도 150m — 버린다(BAD_FIX_M 100)
  assert.equal(view().title, '석계에서 내려요', '흐린 위치는 버려 그대로');
});
