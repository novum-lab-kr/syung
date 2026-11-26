// 타고 가기(web/ui/ride_along.mts) — 지하철을 놓쳤는데 탄 것으로 넘어감(2026-11-10 사용자 · 묵동 60-8 → 용산역).
// 승강장 시간(90초)이 지난 뒤 고른 열차가 역에 들어오면 그 순간 탄 것으로 보는데(2026-11-07 결정), 실제로 안 탔으면 되돌아오지 않았다.
// 열차는 다음 역까지 갔는데 내 위치는 탄 역에 그대로면(위치 3번 연달아) 그 열차를 놓친 것으로 보고 기다리기로 되돌린다
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {addEventListener() {}, hidden: false, createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');
const {rideFixView} = await import('../web/lib/ride-along.mts');

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const at = minutes => { const time = new Date(Date.now() + minutes * 60000); return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`; };
const CITY_HALL = [126.9770, 37.5658], SEOUL = [126.9723, 37.5563];
// 시청 → 남영(1호선 하행) — 시험용 구간
const CITY_LINE = {line: '1호선', direction: '하행', from: '시청', to: '남영', stations: [1, 2, 3], byId: [[1, {lat: CITY_HALL[1], lon: CITY_HALL[0], name: '시청'}], [2, {lat: SEOUL[1], lon: SEOUL[0], name: '서울역'}], [3, {lat: 37.5547, lon: 126.9707, name: '남영'}]]};
// 2026-11-10 사용자가 놓친 곳: 태릉입구(424) → 석계(124) 6호선 상행(data/journey.json dirs '6호선|424|124' = 상행 — 곧 올 열차 줄을 받는 구간) · 좌표는 web/index.html
const TAEREUNG = [127.075135, 37.617939], SEOKGYE = [127.066136, 37.6152145];
// 서 있어도 GPS 는 조금씩 흔들린다(약 2m) — 같은 좌표 되풀이는 새 위치로 안 친다(2026-11-26 사용자 결정 A · ①)
const jitter = (spot, count) => [spot[0] + (count % 2 ? 0.00002 : -0.00002), spot[1]];
const TAEREUNG_LINE = {line: '6호선', direction: '상행', from: '태릉입구', to: '석계', stations: [424, 124, 423], byId: [[424, {lat: TAEREUNG[1], lon: TAEREUNG[0], name: '태릉입구'}], [124, {lat: SEOKGYE[1], lon: SEOKGYE[0], name: '석계'}], [423, {lat: 37.610538, lon: 127.056485, name: '돌곶이'}]]};

function setup(context, route = CITY_LINE) {
  let onFix = null, clock = Date.now(), trainSpot = SEOUL;
  // 1초 tick(setInterval)만 손으로 돌린다 — 위치가 안 오는 동안의 판정(지하 끊김)을 보려고
  context.mock.timers.enable({apis: ['setInterval']});
  const realNow = Date.now, realFetch = globalThis.fetch, views = [], acts = [], id = `${route.line}:0097`, dist = new Map([[id, 0]]);
  Date.now = () => clock;
  // 곧 올 열차: 0097 2분 뒤 · 0099 7분 뒤(arrivalRank 는 줄의 eta 를 그대로 남은 초로)
  globalThis.fetch = async () => ({json: async () => ({arrivals: [
    {line: route.line, direction: route.direction, destination: null, trainNo: '0097', eta: 120, message: '전역 출발', receivedAt: null},
    {line: route.line, direction: route.direction, destination: null, trainNo: '0099', eta: 420, message: '[3]번째 전역', receivedAt: null},
  ]})});
  const plans = [{id, seq: [{id: 0}, ...route.stations.map(station => ({id: station}))], cum: [0, 1000, 2000, 3000]}];
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, project: () => ({x: 0, y: 0}), getContainer: () => ({clientWidth: 390, clientHeight: 844}), easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans}, trainPose: plan => ({dist: dist.get(plan.id) ?? 0}), trainLngLat: () => ({lng: trainSpot[0], lat: trainSpot[1]}), arrivalRank: row => row.eta,
    byId: new Map(route.byId),
    animFrame: [], drawRideCard: (_host, view, actions) => { views.push(view); acts.push(actions); }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
  });
  context.after(() => { rideAlong.stop(); Date.now = realNow; globalThis.fetch = realFetch; });
  const fix = ([longitude, latitude], accuracy = 10) => onFix({coords: {longitude, latitude, accuracy}});
  // 탈 시각은 5분 전(목록이 끊기면 시각으로 넘기는 길도 같이 본다)
  const plan = {arrives: at(20), legs: [{type: 'ride', line: route.line, from: route.from, to: route.to, departs: at(-5), arrives: at(10), direction: route.direction, stops: 2, wait: 60, stations: route.stations, trainNo: '0097'}]};
  const pass = seconds => { clock += seconds * 1000; };
  // 위치 없이 시간만 흐름: 1초 tick 을 부른다
  const quiet = seconds => { pass(seconds); context.mock.timers.tick(1000); };
  return {rideAlong, plan, fix, dist, id, view: () => views.at(-1), press: act => acts.at(-1).fix(act), pass, quiet, trainAt: spot => { trainSpot = spot; }};
}

// 시청에서 0097 을 기다리다 승강장 시간이 지나 0097 이 들어옴 → 들어온 순간 탄 것(2026-11-26 사용자 결정 — 출발을 기다리지 않는다)
async function boardAtCityHall({rideAlong, plan, fix, dist, id, view, pass, quiet}, spot = CITY_HALL, to = '남영') {
  fix(spot);
  rideAlong.start(plan, to);
  await settle();
  assert.match(view().title, /타는 곳으로/);
  pass(100);   // 승강장 90초 지남
  dist.set(id, 1000);   // 0097 이 탈 역에 들어옴
  fix(spot);
  assert.equal(view().title, `${to}에서 내려요`, '들어온 순간 탄 것');
  dist.set(id, 1300);   // 0097 이 떠남
  quiet(1);
}

test('열차는 다음 역까지 갔는데 내 위치가 탄 역에 그대로면 놓친 것 — 기다리기로 되돌려 다음 열차', async context => {
  const ctx = setup(context);
  await boardAtCityHall(ctx);
  const {fix, dist, view, pass} = ctx;
  dist.set('1호선:0097', 2000);   // 0097 은 서울역에 닿음 · 나는 시청에 그대로
  for (let count = 0; count < 3; count++) { pass(5); fix(jitter(CITY_HALL, count)); }
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
  for (let count = 0; count < 5; count++) { pass(5); fix(jitter(CITY_HALL, count)); }
  assert.equal(view().title, '남영에서 내려요', '열차가 다음 역에 닿기 전');
  dist.set('1호선:0097', 2000);
  pass(5); fix(jitter(CITY_HALL, 0)); pass(5); fix(jitter(CITY_HALL, 1));
  assert.equal(view().title, '남영에서 내려요', '두 번까지는 그대로');
  pass(5); fix(SEOUL);   // 한 번 열차 쪽 위치 → 다시 센다
  pass(5); fix(jitter(CITY_HALL, 0));
  assert.equal(view().title, '남영에서 내려요');
});

// 태릉입구(6 · 7호선 모두 지하 승강장): 지하에서 위치가 오느냐에 따라 갈린다 — 오면(역 와이파이 등 정확도 100m 안) 잡고, 안 오면 못 잡는다(한계)
test('태릉입구 6호선 상행: 승강장에서 위치가 오면(정확도 100m 안) 놓친 것으로 되돌린다', async context => {
  const ctx = setup(context, TAEREUNG_LINE);
  await boardAtCityHall(ctx, TAEREUNG, '석계');
  const {fix, dist, id, view, pass} = ctx;
  dist.set(id, 2000);   // 0097 은 석계에 닿음 · 나는 태릉입구에 그대로
  for (let count = 0; count < 3; count++) { pass(5); fix(jitter(TAEREUNG, count), 60); }
  assert.match(view().title, /6호선 석계 방면 타는 곳으로/);
  await settle();
  fix(TAEREUNG, 60);
  assert.match(view().sub, /다음 열차 7분 뒤/, '놓친 0097 은 빼고 0099');
});

test('결정 ①: 탄 뒤 탄 역 좌표가 똑같이 되풀이되기만 하면(지하에서 브라우저가 마지막 위치를 다시 줌) 놓침으로 되돌리지 않는다', async context => {
  const ctx = setup(context, TAEREUNG_LINE);
  await boardAtCityHall(ctx, TAEREUNG, '석계');
  const {fix, dist, id, view, pass} = ctx;
  dist.set(id, 2000);   // 0097 은 석계에 닿음 · 위치는 태릉입구 그 좌표 그대로
  for (let count = 0; count < 5; count++) { pass(5); fix(TAEREUNG, 60); }
  assert.equal(view().title, '석계에서 내려요', '같은 좌표 되풀이는 새 위치가 아니다 — 타는 중 그대로(못 탔으면 사용자가 바로잡는다)');
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

// ---- 2026-11-26 사용자 결정(8080 가짜 GPS 먹골 — 열차가 들어와 캐릭터와 겹쳤는데 「지금 타세요」 그대로 · 「탔다는 가정하에 화면 전환」):
// 고른 열차가 탈 역에 들어온 순간 승강장에 와 있거나 남은 걷기 1분(RUN_S) 이하면 탄 것 — 출발을 기다리지 않는다.
// 못 탔으면 열차가 다음 역에 닿은 뒤 탄 역 근처 위치가 연달아 3번(OFF_FIXES)일 때만 되돌린다 · 「못 탔어요」 그대로
async function arriveOnPlatform(context, waitS = 100) {
  const ctx = setup(context, TAEREUNG_LINE);
  const {rideAlong, plan, fix, dist, id, pass} = ctx;
  fix(TAEREUNG);
  rideAlong.start(plan, '석계');
  await settle();
  pass(waitS);
  dist.set(id, 1000);   // 0097 이 들어옴
  fix(TAEREUNG);
  return ctx;
}

test('고른 열차가 들어온 순간 탄 것 — 서 있는 동안에도 타는 중 화면(출발을 기다리지 않는다)', async context => {
  const {view} = await arriveOnPlatform(context);
  assert.equal(view().title, '석계에서 내려요');
});

test('남은 걷기 1분 이하면 승강장에 닿기 전이라도 들어온 순간 탄 것(뛰어서 탄다) · 1분 넘게 남았으면 놓침', async context => {
  const near = await arriveOnPlatform(context, 40);   // 승강장 90초 가운데 40초 — 50초 남음
  near.quiet(1);   // 1초 tick 이 가린다
  assert.equal(near.view().title, '석계에서 내려요', '50초 남음 — 탄 것');
});

test('들어오자 탄 것으로 넘긴 뒤 열차가 다음 역(석계)에 닿았는데 탄 역 근처 위치가 연달아 3번이면 놓친 것 — 「못 탄 것 같아요」 [아니에요, 탔어요] → 그 열차로 다시', async context => {
  const {rideAlong, fix, dist, id, view, press, pass} = await arriveOnPlatform(context);
  assert.equal(view().title, '석계에서 내려요');
  for (let count = 0; count < 4; count++) { pass(5); fix(jitter(TAEREUNG, count)); }
  assert.equal(view().title, '석계에서 내려요', '다음 역에 닿기 전에는 세지 않는다');
  dist.set(id, 2000);   // 0097 이 석계에 닿음 · 나는 태릉입구 근처 그대로
  pass(5); fix(jitter(TAEREUNG, 0)); pass(5); fix(jitter(TAEREUNG, 1));   // (앞 위치와 같은 좌표 되풀이는 새 위치가 아니라 번갈아 흔든다)
  assert.equal(view().title, '석계에서 내려요', '한두 번 튐으로는 되돌리지 않는다');
  pass(5); fix(jitter(TAEREUNG, 0));
  assert.match(view().title, /6호선 석계 방면 타는 곳으로/, '연달아 3번 — 놓친 것');
  assert.equal(view().say, '못 탄 것 같아요');
  assert.deepEqual(buttons(view()), ['아니에요, 탔어요']);
  press('undo');
  assert.equal(view().title, '석계에서 내려요');
  assert.ok(rideAlong.rideTrain({id}), '놓친 것으로 본 0097 을 다시 따라간다');
});

// 받아들인 단점(2026-11-26 사용자): 출구 ~ 승강장 통로(역 100m · 출구 50m 밖)에 있는 동안 열차가 들어와도 탄 것 — 통로 위치로는 되돌리지 않는다(사용자가 「못 탔어요」)
// 태릉입구 통로 자리: 역 한가운데에서 동쪽(석계 반대쪽)으로 약 150m(출구 자료 없음)
const PASSAGE = [127.076835, 37.617939];
test('통로에 있는 동안 고른 열차가 들어와도 탄 것 — 「못 탔어요」를 누르면 그 열차 빼고 다음 열차', async context => {
  const {fix, dist, id, view, press, pass} = await arriveOnPlatform(context);
  pass(1); fix(PASSAGE);
  assert.equal(view().title, '석계에서 내려요');
  dist.set(id, 2000);
  for (let count = 0; count < 3; count++) { pass(5); fix([PASSAGE[0] + (count % 2 ? 0.00001 : 0), PASSAGE[1]]); }
  assert.equal(view().title, '석계에서 내려요', '탄 역 근처(nearBoarding)가 아니니 되돌리지 않는다');
  press('missed');
  assert.match(view().title, /6호선 석계 방면 타는 곳으로/);
  pass(5); fix(TAEREUNG);
  assert.match(view().sub, /다음 열차 7분 뒤/, '0097 은 빼고 0099');
});

// ---- 2026-11-26 사용자 결정 ② 바로잡기 창구 A+B: 늘 보이는 링크(A) + 슝이 헷갈릴 때 묻기(B) — 지하철 구간만
const links = view => view.fix?.links.map(link => link.text) ?? [];
const buttons = view => view.fix?.buttons.map(button => button.text) ?? [];

test('② 글: 고르는 중 > 놓침으로 되돌림 > 늘 보이는 링크 차례 · 타는 중은 「못 탔어요」만', () => {
  const pick = state => rideFixView({step: 'wait', undo: false, choosing: false, ...state});
  assert.deepEqual(pick({}).fix.links.map(link => link.text), ['벌써 탔어요 ›', '다른 열차를 탔어요 ›']);
  assert.equal(pick({undo: true}).say, '못 탄 것 같아요');
  assert.deepEqual(pick({undo: true}).fix.buttons.map(button => button.act), ['undo']);
  assert.equal(pick({undo: true, choosing: true}).title, '탄 열차를 지도에서 눌러 주세요');
  assert.deepEqual(rideFixView({step: 'ride', undo: false, choosing: false}).fix.links.map(link => link.act), ['missed'], '타는 중엔 「다른 열차예요」 없이 목록 · 지도의 열차를 바로 누른다(2026-11-26 사용자)');
});

test('② A 기다리기: 「벌써 탔어요」 — 열차가 들어오기 전이라도 지금 짐작한 열차로 타는 중', async context => {
  const ctx = setup(context, TAEREUNG_LINE);
  const {rideAlong, plan, fix, id, view, press} = ctx;
  fix(TAEREUNG);
  rideAlong.start(plan, '석계');
  await settle();
  assert.deepEqual(links(view()), ['벌써 탔어요 ›', '다른 열차를 탔어요 ›']);
  press('boarded');
  assert.equal(view().title, '석계에서 내려요');
  assert.ok(rideAlong.rideTrain({id}), '짐작한 0097 을 따라간다');
  assert.deepEqual(links(view()), ['못 탔어요 ›'], '타는 중에는 「못 탔어요」만(다른 열차는 목록 · 지도에서 바로 누른다)');
});

test('② A 타는 중: 「못 탔어요」 → 기다리기(사용자가 말한 것은 되묻지 않는다)', async context => {
  const ctx = setup(context, TAEREUNG_LINE);
  await boardAtCityHall(ctx, TAEREUNG, '석계');
  const {view, press} = ctx;
  press('missed');
  assert.match(view().title, /6호선 석계 방면 타는 곳으로/);
  assert.deepEqual(buttons(view()), [], '사용자가 말한 것은 되묻지 않는다');
});

test('② B 타는 중에 슝이 탄 역에 남은 것을 보고 되돌림: 「아니에요, 탔어요」를 묻는다', async context => {
  const ctx = setup(context, TAEREUNG_LINE);
  await boardAtCityHall(ctx, TAEREUNG, '석계');
  const {fix, dist, id, view, pass} = ctx;
  dist.set(id, 2000);   // 석계에 닿음 · 나는 태릉입구에 그대로(흔들리는 좌표)
  for (let count = 0; count < 3; count++) { pass(5); fix(jitter(TAEREUNG, count), 60); }
  assert.match(view().title, /6호선 석계 방면 타는 곳으로/);
  assert.deepEqual(buttons(view()), ['아니에요, 탔어요'], '슝이 스스로 되돌렸으니 묻는다');
});

test('② 다른 열차: 고르는 동안 정보 화면을 걷고 지도에서 탄 열차를 누르면 그 열차로 · 「안 고를게요」는 그대로', async context => {
  const ctx = setup(context, TAEREUNG_LINE);
  await boardAtCityHall(ctx, TAEREUNG, '석계');
  const {rideAlong, view, press} = ctx;
  press('other');
  assert.equal(view().title, '탄 열차를 지도에서 눌러 주세요');
  assert.equal(view().info, undefined, '지도를 보여 준다');
  assert.deepEqual(links(view()), ['안 고를게요 ›']);
  press('stay');
  assert.equal(view().title, '석계에서 내려요');
  press('other');
  assert.ok(rideAlong.tapTrain({id: '6호선:0099'}));
  assert.equal(view().title, '석계에서 내려요');
  assert.ok(rideAlong.rideTrain({id: '6호선:0099'}), '누른 열차로 바뀐다');
});
