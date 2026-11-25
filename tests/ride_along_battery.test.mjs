// 타고 가기(web/ui/ride_along.mts) — 배터리 줄이기(2026-11-25 사용자 추천안 B · C · D).
// B 걷기 · 기다리기: 위치마다 카메라를 옮기지 않고 내 위치가 화면 가장자리 쪽일 때만
// C 화면이 숨으면 1초 tick · 곧 올 열차 받기를 멈추고, 다시 보이면 바로 한 번 돌려 이어 간다
// D 지하철을 탄 뒤 탄 역에 남겨졌는지(놓침) 가린 다음에만 위치를 덜 정확하게 · 내리면(끝나면) 원래대로
import test from 'node:test';
import assert from 'node:assert/strict';

// ride_along 은 만들 때 카드 자리(div)를 body 에 붙이고 화면 숨김(visibilitychange)을 듣는다 — Node 에는 document 가 없어 최소한만 흉내 낸다
const listeners = [];
globalThis.document = {hidden: false, addEventListener: (type, listener) => { if (type === 'visibilitychange') listeners.push(listener); },
  createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const setHidden = hidden => { document.hidden = hidden; for (const listener of listeners) listener(); };
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const at = minutes => { const time = new Date(Date.now() + minutes * 60000); return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`; };
const CITY_HALL = [126.9770, 37.5658], SEOUL = [126.9723, 37.5563];

function setup(context) {
  let onFix = null, clock = Date.now(), screen = {x: 195, y: 300};
  context.mock.timers.enable({apis: ['setInterval']});
  const realNow = Date.now, realFetch = globalThis.fetch, views = [], id = '1호선:0097', dist = new Map([[id, 0]]), calls = {easeTo: 0, fetch: 0, gps: [], labels: [], info: []};
  Date.now = () => clock;
  globalThis.fetch = async () => { calls.fetch++; return {json: async () => ({arrivals: [
    {line: '1호선', direction: '하행', destination: null, trainNo: '0097', eta: 120, message: '전역 출발', receivedAt: null},
    {line: '1호선', direction: '하행', destination: null, trainNo: '0099', eta: 420, message: '[3]번째 전역', receivedAt: null},
  ]})}; };
  const plans = [{id, seq: [{id: 0}, {id: 1}, {id: 2}, {id: 3}], cum: [0, 1000, 2000, 3000]}];
  const rideAlong = createRideAlong({
    // 내 위치가 화면 어디에 그려지는지(project)는 시험이 정한다 — 390×844 화면 · 카드 없음
    map: {getZoom: () => 16, isMoving: () => false, project: () => screen, getContainer: () => ({clientWidth: 390, clientHeight: 844}), easeTo() { calls.easeTo++; }, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans}, trainPose: plan => ({dist: dist.get(plan.id) ?? 0}), trainLngLat: () => ({lng: SEOUL[0], lat: SEOUL[1]}), arrivalRank: row => row.eta,
    byId: new Map([[1, {lat: CITY_HALL[1], lon: CITY_HALL[0], name: '시청'}], [2, {lat: SEOUL[1], lon: SEOUL[0], name: '서울역'}], [3, {lat: 37.5547, lon: 126.9707, name: '남영'}]]),
    animFrame: [], drawRideCard: (_host, view) => { views.push(view); }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
    gpsLowPower: on => calls.gps.push(on), quietLabels: on => calls.labels.push(on), infoScreen: on => calls.info.push(on),
  });
  context.after(() => { rideAlong.stop(); Date.now = realNow; globalThis.fetch = realFetch; document.hidden = false; });
  const fix = ([longitude, latitude], accuracy = 10) => onFix({coords: {longitude, latitude, accuracy}});
  const ridePlan = {arrives: at(20), legs: [{type: 'ride', line: '1호선', from: '시청', to: '남영', departs: at(-5), arrives: at(10), direction: '하행', stops: 2, wait: 60, stations: [1, 2, 3], trainNo: '0097'}]};
  const pass = seconds => { clock += seconds * 1000; };
  const quiet = seconds => { pass(seconds); context.mock.timers.tick(1000); };
  return {rideAlong, ridePlan, plans, fix, dist, id, calls, view: () => views.at(-1), pass, quiet, context, setScreen: next => { screen = next; }};
}

// 시청에서 0097 을 기다리다 승강장 시간이 지나 0097 이 들어왔다 떠나고 위치가 30초 넘게 끊김(지하) → 탄 것(tests/ride_along_missed_train 과 같은 장면)
async function boardAtCityHall({rideAlong, ridePlan, fix, dist, id, view, pass, quiet}) {
  fix(CITY_HALL);
  rideAlong.start(ridePlan, '남영');
  await settle();
  pass(100);
  dist.set(id, 1000);
  fix(CITY_HALL);
  dist.set(id, 1300);
  quiet(1);
  quiet(31);
  assert.equal(view().title, '남영에서 내려요');
}

test('B 걷기: 내 위치가 화면 가운데 쪽이면 카메라를 옮기지 않고, 가장자리 쪽이면 옮긴다', async context => {
  const ctx = setup(context), {rideAlong, fix, calls, setScreen} = ctx;
  const walk = {arrives: at(20), legs: [{type: 'walk', seconds: 600, metres: 800, path: [CITY_HALL, SEOUL]}]};
  fix(CITY_HALL);
  rideAlong.start(walk, '서울역');
  const started = calls.easeTo;   // 출발 때 한 번은 내 위치로
  setScreen({x: 195, y: 420});
  for (let count = 0; count < 5; count++) fix([CITY_HALL[0], CITY_HALL[1] - count * 0.00002]);
  assert.equal(calls.easeTo, started, '가운데 쪽이면 위치가 와도 지도를 그대로 둔다');
  setScreen({x: 195, y: 780});   // 아래 가장자리(844 의 80 % 넘게)
  fix([CITY_HALL[0], CITY_HALL[1] - 0.0002]);
  assert.equal(calls.easeTo, started + 1, '가장자리 쪽이면 내 위치로 옮긴다');
  setScreen({x: 20, y: 420});   // 왼쪽 가장자리
  fix([CITY_HALL[0], CITY_HALL[1] - 0.00022]);
  assert.equal(calls.easeTo, started + 2);
});

test('C 화면이 숨으면 곧 올 열차를 받지 않고, 다시 보이면 바로 한 번 받는다', async context => {
  const ctx = setup(context), {rideAlong, ridePlan, fix, calls, context: testContext} = ctx;
  fix(CITY_HALL);
  rideAlong.start(ridePlan, '남영');
  await settle();
  assert.equal(calls.fetch, 1, '기다리기를 시작할 때 한 번');
  testContext.mock.timers.tick(20000);
  assert.equal(calls.fetch, 2, '보이는 동안은 20초마다');
  setHidden(true);
  testContext.mock.timers.tick(60000);
  assert.equal(calls.fetch, 2, '숨은 동안은 받지 않는다');
  setHidden(false);
  assert.equal(calls.fetch, 3, '다시 보이면 바로 받는다');
  testContext.mock.timers.tick(20000);
  assert.equal(calls.fetch, 4, '그 뒤로 20초마다 이어 간다');
});

test('C 숨은 동안 tick 은 5초마다로 느리게 — 판정(알림 예약)은 이어 가고, 보이면 바로 돌아 1초로', async context => {
  const ctx = setup(context), {dist, id, view, pass, context: testContext} = ctx;
  await boardAtCityHall(ctx);
  setHidden(true);
  dist.set(id, 3000);   // 숨은 동안 남영에 닿음
  pass(4);
  testContext.mock.timers.tick(4000);
  assert.equal(view().title, '남영에서 내려요', '5초가 안 됐으면 아직 판정하지 않는다');
  pass(1);
  testContext.mock.timers.tick(1000);
  assert.match(view().title, /도착/, '숨은 동안도 5초마다 판정한다(알림이 화면 꺼진 사람에게 가야 한다)');
});

test('C 숨었다 다시 보이면 바로 한 번 돌고 1초 tick 으로 돌아온다', async context => {
  const ctx = setup(context), {dist, id, view, pass, context: testContext} = ctx;
  await boardAtCityHall(ctx);
  setHidden(true);
  dist.set(id, 3000);
  pass(2);
  testContext.mock.timers.tick(2000);
  assert.equal(view().title, '남영에서 내려요');
  setHidden(false);
  assert.match(view().title, /도착/, '보이자마자 한 번 돌아 도착으로');
});

test('D 탄 뒤 탄 역을 벗어난 위치가 오면 위치를 덜 정확하게 · 내리면 원래대로', async context => {
  const ctx = setup(context), {fix, dist, id, calls, quiet} = ctx;
  await boardAtCityHall(ctx);
  assert.deepEqual(calls.gps, [], '탄 직후(열차가 아직 다음 역 전 · 위치 없음)는 그대로 — 놓침을 가려야 한다');
  fix(SEOUL, 60);   // 땅 밑 와이파이 위치(정확도 60 m) · 탄 역에서 1 km
  assert.deepEqual(calls.gps, [true], '탄 것이 확실해졌으니 덜 정확하게');
  dist.set(id, 3000);   // 남영 도착 → 도착
  quiet(1);
  assert.deepEqual(calls.gps, [true, false], '지하철 단계를 벗어나면 원래대로');
});

test('D 탄 역에 그대로 있으면(놓침을 가려야 한다) 정확한 위치를 그대로 받고, 놓친 것으로 되돌아오면 계속 그대로', async context => {
  const ctx = setup(context), {fix, dist, id, calls, view, pass} = ctx;
  await boardAtCityHall(ctx);
  dist.set(id, 2000);   // 0097 은 서울역에 닿음 · 나는 시청에 그대로
  for (let count = 0; count < 3; count++) { pass(5); fix(CITY_HALL); }
  assert.match(view().title, /타는 곳으로/, '놓친 것으로 보고 기다리기로');
  assert.deepEqual(calls.gps, [], '놓침을 가리는 동안 위치 정확도는 그대로');
});

test('D 열차가 다음 역에 닿았는데 위치가 30초 넘게 없으면(땅 밑) 덜 정확하게 · 그만두면 원래대로', async context => {
  const ctx = setup(context), {rideAlong, dist, id, calls, quiet} = ctx;
  await boardAtCityHall(ctx);   // 마지막 위치는 32초 전
  assert.deepEqual(calls.gps, [], '열차가 다음 역 전이면 그대로');
  dist.set(id, 2000);
  quiet(1);
  assert.deepEqual(calls.gps, [true]);
  rideAlong.stop();
  assert.deepEqual(calls.gps, [true, false], '그만두면 원래대로');
});

// 여정 전체 역 목록(시안 15 — 노선 색을 안 넘겨 회색)
const LIST_ROWS = [{kind: 'stop', name: '시청', color: '#888', edge: 'first', off: false}, {kind: 'stop', name: '서울역', color: '#888', edge: null, off: false}, {kind: 'stop', name: '남영', color: '#888', edge: 'last', off: true}];
// ---- 2단계(2026-11-25): 탄 동안 이번 역을 알면 지도 대신 정보 화면 — 그동안 탄 열차 따라가기 · 지도 그리기를 쉰다
// 말풍선 글(lib/ride-along rideTalk): 내릴 곳에 노란 밑줄 · 작은 글은 남은 정거장 + 계획 도착 시각(ridePlan 의 at(10) — 여정을 만든 때의 시각)
const TALK = sub => ({title: [{text: '남영', mark: 'line'}, '에서 내려요'], sub, todo: null});
test('정보 화면: 탄 뒤 이번 역을 알면 카드에 역 목록 · 말풍선 글이 붙고 본체에 알린다 — 따라가기 · 이름표 fade 끄기는 하지 않는다', async context => {
  const ctx = setup(context), {rideAlong, calls, view, dist, id, quiet} = ctx;
  await boardAtCityHall(ctx);   // 0097 은 시청을 떠나 300 m
  const ARRIVES = view().info.talk.sub[3].text;   // 시험 도중 분이 바뀌어도 같은 값으로 본다
  assert.deepEqual(view().info, {here: [127, 37.6], talk: TALK(['아직 ', {text: '2정거장', mark: 'bold'}, ' 남았어요. ', {text: ARRIVES, mark: 'bold'}, '쯤 도착해요']), list: {rows: LIST_ROWS, at: 0, ahead: true}, sky: {name: '남영', at: [126.9707, 37.5547]}});
  assert.equal(rideAlong.infoScreen, true);
  assert.deepEqual(calls.info, [true], '지도 그리기를 멈추라고 한 번');
  assert.equal(rideAlong.followingTrain, false, '지도를 덮었으니 탄 열차를 따라가지 않는다(따라가기 루프가 돌지 않는다)');
  assert.deepEqual(calls.labels, []);
  dist.set(id, 2000);   // 서울역에 닿음
  quiet(1);
  assert.deepEqual(view().info, {here: [127, 37.6], talk: TALK([{text: '다음 역에서 내려요!', mark: 'star'}]), list: {rows: LIST_ROWS, at: 1, ahead: false}, sky: {name: '남영', at: [126.9707, 37.5547]}});
  assert.deepEqual(calls.info, [true], '역이 바뀌어도 다시 알리지 않는다');
});

test('정보 화면: 걷기 · 기다리기에는 없고, 도착하거나 그만두면 지도 그리기를 되돌린다', async context => {
  const ctx = setup(context), {rideAlong, ridePlan, fix, calls, view, dist, id, quiet} = ctx;
  fix(CITY_HALL);
  rideAlong.start(ridePlan, '남영');
  await settle();
  assert.equal(view().info, undefined, '기다리기는 지도 그대로');
  assert.deepEqual(calls.info, []);
  rideAlong.stop();
  await boardAtCityHall(ctx);
  assert.deepEqual(calls.info, [true]);
  dist.set(id, 3000);   // 남영 도착
  quiet(1);
  assert.equal(view().info, undefined, '도착 화면은 지도에서 연기한다');
  assert.deepEqual(calls.info, [true, false]);
  await boardAtCityHall(ctx);
  rideAlong.stop();
  assert.deepEqual(calls.info, [true, false, true, false], '그만두면 되돌린다');
});

test('정보 화면: 탄 열차가 지도 목록에 없으면(이번 역 모름) 지도 그대로', async context => {
  const ctx = setup(context), {rideAlong, calls, view, quiet, plans} = ctx;
  await boardAtCityHall(ctx);
  plans.length = 0;   // 탄 열차가 실시간 목록에서 빠짐
  quiet(1);
  assert.equal(view().info, undefined);
  assert.equal(rideAlong.infoScreen, false);
  assert.deepEqual(calls.info, [true, false]);
});
