// 타고 가기(web/ui/ride_along.mts) — 걷는 길에서 20m 넘게 벗어난 위치를 연달아 3번 받으면 시트 없이 지금 위치에서 다시 찾아 이어 간다(2026-11-06)
// 다시 찾기는 걷는 구간만 바꾼다 — 고른 지하철 · 버스 · 정류장은 그대로(2026-11-07 · lib/ride-along walkEnd · walkQuery · freshWalk · spliceWalk)
import test from 'node:test';
import assert from 'node:assert/strict';

// ride_along 은 모듈을 읽을 때 카드 자리(div)를 body 에 붙인다 — Node 에는 document 가 없어 최소한만 흉내 낸다(ride_along_follow 와 같다)
globalThis.document = {createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');
const {REROUTE_GAP_MS, WALK_AGAIN_MAX_S, freshWalk, spliceWalk, walkEnd, walkQuery} = await import('../web/lib/ride-along.mts');

// 서울시청 근처 동쪽으로 약 200m 걷는 길 · 위도 0.0003 ≈ 33m
const WEST = [126.9770, 37.5660], EAST = [126.97926, 37.5660], OFF = [126.9780, 37.5663], ON = [126.9780, 37.5660];
const walkPlan = (path, arrives = '23:59') => ({arrives, legs: [{type: 'walk', seconds: 300, metres: 200, label: '목적지까지 걸어서', path}]});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function setup(answers) {
  let onFix = null, views = [];
  const calls = {reroute: [], asked: [], used: 0, detour: 0, easeTo: 0, ended: 0};
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, easeTo: () => { calls.easeTo++; }, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans: []}, trainPose: () => ({dist: 0}), trainLngLat: () => ({lng: 0, lat: 0}), arrivalRank: () => 0, byId: new Map(), animFrame: [],
    drawRideCard: (_host, view) => { views.push(view); }, look: () => 'sprout', walked() {}, ended: () => { calls.ended++; }, detour: () => { calls.detour++; },
    // 버스 층 없음(버스 기다리기는 내 위치 · 출발 시각으로만)
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
    otherFollow: {active: () => false, stop() {}},
    reroute: (spot, plan, index) => { calls.reroute.push(spot); calls.asked.push({plan, index}); const next = answers.shift(); const made = typeof next === 'function' ? next(plan, index) : next; return Promise.resolve(made ? {plan: made, use: () => { calls.used++; }} : null); },
  });
  const fix = ([longitude, latitude], accuracy = 10) => onFix({coords: {longitude, latitude, accuracy}});
  return {rideAlong, calls, fix, view: () => views.at(-1)};
}

test('20m 넘게 벗어난 위치 3번째에 지금 위치로 다시 찾고, 새 걷기로 시트 없이 이어 간다', async context => {
  const fresh = walkPlan([OFF, [126.9790, 37.5663]], '23:58');
  const {rideAlong, calls, fix, view} = setup([fresh]);
  context.after(() => rideAlong.stop());
  rideAlong.start(walkPlan([WEST, EAST]), '시청');
  fix(OFF); fix(OFF);
  assert.equal(calls.reroute.length, 0, '두 번은 아직');
  fix(OFF);
  assert.deepEqual(calls.reroute, [OFF], '세 번째에 그 위치에서');
  fix(OFF);
  assert.equal(calls.reroute.length, 1, '찾는 중에는 또 부르지 않는다');
  await settle();
  assert.equal(calls.used, 1, '새 길을 지도 · 아래 막대에');
  assert.equal(calls.detour, 0, '시트(다른 길 찾기)는 열지 않는다');
  assert.equal(rideAlong.active, true, '타고 가기는 그대로');
  assert.equal(view().detour, false);
  assert.match(view().sub, /^1\/1 · /, '새 걷기 카드');
  assert.equal(calls.asked[0].index, 0, '지금 걷는 구간');
  // 새 길 위에서 벗어나도 간격 안에서는 다시 부르지 않는다
  for (const spot of [WEST, WEST, WEST, WEST]) fix(spot);
  assert.equal(calls.reroute.length, 1, `다시 찾은 뒤 ${REROUTE_GAP_MS / 1000}초는 쉰다`);
});

test('한 번 튄 위치는 무시 · 정확도 나쁜 위치는 세지 않는다', context => {
  const {rideAlong, calls, fix} = setup([]);
  context.after(() => rideAlong.stop());
  rideAlong.start(walkPlan([WEST, EAST]), '시청');
  fix(OFF); fix(OFF); fix(ON); fix(OFF); fix(OFF);
  assert.equal(calls.reroute.length, 0, '중간에 길 위로 돌아오면 처음부터 센다');
  fix(OFF, 150);
  assert.equal(calls.reroute.length, 0, '정확도 100m 보다 나쁜 위치는 버린다');
});

test('못 찾으면 지금 길 그대로 「다른 길 찾기 ›」 — 길 위로 돌아오면 지운다', async context => {
  const {rideAlong, calls, fix, view} = setup([]);   // 답 없음(경로 없음 · 연결)
  context.after(() => rideAlong.stop());
  rideAlong.start(walkPlan([WEST, EAST]), '시청');
  fix(OFF); fix(OFF); fix(OFF);
  await settle();
  assert.equal(calls.reroute.length, 1);
  assert.equal(calls.used, 0);
  assert.equal(view().detour, true, '수동 링크');
  assert.equal(rideAlong.active, true);
  fix(ON);
  assert.equal(view().detour, false);
});

test('찾는 동안 그만뒀으면 늦게 온 길은 버린다', async context => {
  const {rideAlong, calls, fix} = setup([walkPlan([OFF, EAST])]);
  context.after(() => rideAlong.stop());
  rideAlong.start(walkPlan([WEST, EAST]), '시청');
  fix(OFF); fix(OFF); fix(OFF);
  rideAlong.stop();
  await settle();
  assert.equal(calls.used, 0);
  assert.equal(rideAlong.active, false);
});

// 걷기 → 버스 → 걷기(부흥고등학교 정류장 — 운영 시험에서 다시 찾기가 부흥초교로 바꿨던 길)
const BUS = {type: 'bus', route: '17', from: '부흥고등학교', to: '시청', departs: '23:50', arrives: '23:55', toward: '시청', stops: 4, wait: 60, path: [[126.9790, 37.5650], [126.9800, 37.5640]]};
const busPlan = () => ({arrives: '23:58', minutes: 20, walkMinutes: 6, legs: [
  {type: 'walk', seconds: 240, metres: 200, exit: '', label: '부흥고등학교 정류장까지', path: [WEST, EAST]}, BUS,
  {type: 'walk', seconds: 120, metres: 100, exit: '', label: '시청 정류장에서 목적지까지', path: [[126.9800, 37.5640], [126.9810, 37.5640]]}]});
const RIDE = {type: 'ride', line: '1호선', from: '시청', to: '종각', departs: '23:50', arrives: '23:52', direction: '상행', stops: 1, wait: 60, stations: [133, 132], trainNo: null};
const AT = new Date(2026, 10, 7, 23, 40);

test('끝점: 다음이 지하철이면 그 역 · 버스면 버스 길 첫 점 · 마지막이면 목적지 · 걷기 다음 걷기면 지금 길 끝', () => {
  const walk = path => ({type: 'walk', seconds: 60, metres: 50, exit: '', path});
  assert.deepEqual(walkEnd([walk([WEST, EAST]), RIDE], 0), {station: 133});
  assert.deepEqual(walkEnd(busPlan().legs, 0), {to: BUS.path[0]});
  assert.deepEqual(walkEnd(busPlan().legs, 2), {goal: true});
  assert.deepEqual(walkEnd([RIDE, walk([EAST, WEST]), RIDE], 1), {station: 133}, '갈아타기 걷기는 다음 역');
  assert.deepEqual(walkEnd([walk([WEST, EAST]), walk([EAST, OFF])], 0), {to: EAST});
  assert.equal(walkEnd(busPlan().legs, 1), null, '걷기가 아니면 없음');
});

test('서버에 보내는 좌표는 위도,경도 순서', () => {
  const goal = {lat: 37.57, lng: 126.98};
  assert.equal(walkQuery(OFF, {station: 133}, goal), 'walk=1&from=37.5663,126.978&station=133');
  assert.equal(walkQuery(OFF, {to: BUS.path[0]}, goal), 'walk=1&from=37.5663,126.978&to=37.565,126.979');
  assert.equal(walkQuery(OFF, {goal: true}, goal), 'walk=1&from=37.5663,126.978&to=37.57,126.98');
});

test('못 찾음 · 모양이 다름 · 터무니없이 긴 답은 못 찾은 것으로', () => {
  const leg = {type: 'walk', seconds: 300, metres: 330, exit: '10', to: '시청', label: '시청역 10번 출구까지', path: [OFF, EAST]};
  assert.deepEqual(freshWalk({ok: true, leg}), {seconds: 300, metres: 330, path: [OFF, EAST], exit: '10', label: '시청역 10번 출구까지', to: '시청'});
  assert.equal(freshWalk({ok: false, error: '이 역으로 걸어가는 길을 찾지 못했어요'}), null);
  assert.equal(freshWalk({ok: true, leg: {...leg, seconds: WALK_AGAIN_MAX_S + 1}}), null, '2시간 넘게 걷는 답(뒤집힌 좌표의 13,000 km 직선)');
  assert.equal(freshWalk({ok: true, leg: {...leg, path: [OFF]}}), null);
  assert.equal(freshWalk({ok: true, leg: {...leg, path: [OFF, ['x', 1]]}}), null);
  assert.equal(freshWalk({ok: true, leg: {...leg, type: 'ride'}}), null);
  assert.equal(freshWalk(null), null);
});

test('지하철역까지 걷기: 출구 · 글은 서버 값 · 탈 열차와 도착 시각은 그대로', () => {
  const plan = {arrives: '23:52', minutes: 12, walkMinutes: 5, legs: [{type: 'walk', seconds: 300, metres: 250, exit: '9', to: '시청', label: '시청역 9번 출구까지', path: [WEST, EAST]}, RIDE]};
  const fresh = freshWalk({ok: true, leg: {type: 'walk', seconds: 420, metres: 330, exit: '10', to: '시청', label: '시청역 10번 출구까지', path: [OFF, EAST]}});
  const next = spliceWalk(plan, 0, fresh, {station: 133}, AT);
  assert.equal(next.legs[1], RIDE, '같은 열차 구간');
  assert.deepEqual({exit: next.legs[0].exit, label: next.legs[0].label, seconds: next.legs[0].seconds, path: next.legs[0].path}, {exit: '10', label: '시청역 10번 출구까지', seconds: 420, path: [OFF, EAST]});
  assert.equal(next.arrives, '23:52');
  assert.equal(next.walkMinutes, 7);
  assert.equal(plan.legs[0].exit, '9', '처음 경로는 고치지 않는다');
});

test('갈아타기 · 버스 정류장 걷기는 원래 글 · 마지막 걷기는 도착 시각을 다시 센다', () => {
  const transfer = {arrives: '23:59', minutes: 19, walkMinutes: 3, legs: [RIDE, {type: 'walk', seconds: 180, metres: 150, exit: '', label: '종각역에서 시청역으로', path: [WEST, EAST]}, RIDE]};
  const toStation = freshWalk({ok: true, leg: {type: 'walk', seconds: 200, metres: 160, exit: '4', to: '시청', label: '시청역 4번 출구까지', path: [OFF, EAST]}});
  assert.equal(spliceWalk(transfer, 1, toStation, {station: 133}, AT).legs[1].label, '종각역에서 시청역으로');
  const toCoord = freshWalk({ok: true, leg: {type: 'walk', seconds: 300, metres: 250, exit: '', direct: true, label: '목적지까지 걸어서', path: [OFF, EAST]}});
  const bus = spliceWalk(busPlan(), 0, toCoord, {to: BUS.path[0]}, AT);
  assert.equal(bus.legs[0].label, '부흥고등학교 정류장까지');
  assert.deepEqual(bus.legs[1], BUS, '같은 버스 · 정류장');
  assert.equal(bus.arrives, '23:58');
  const last = spliceWalk(busPlan(), 2, toCoord, {goal: true}, AT);
  assert.equal(last.legs[2].label, '시청 정류장에서 목적지까지');
  assert.equal(last.arrives, '23:45', '지금 23:40 + 5분');
  assert.equal(last.minutes, 7, '23:58 → 23:45 만큼 줄인다');
});

test('버스를 타러 걷다 벗어나도 같은 버스 · 정류장 그대로 · 같은 걷기 단계에서 새 걷기로', async context => {
  const plan = busPlan();
  const toCoord = freshWalk({ok: true, leg: {type: 'walk', seconds: 300, metres: 250, exit: '', direct: true, label: '목적지까지 걸어서', path: [OFF, [126.9790, 37.5650]]}});
  const {rideAlong, calls, fix, view} = setup([(riding, index) => spliceWalk({...plan, legs: riding.legs}, index, toCoord, walkEnd(riding.legs, index), AT)]);
  context.after(() => rideAlong.stop());
  rideAlong.start(plan, '시청');
  assert.equal(view().title, '부흥고등학교 정류장까지 걸어요');
  fix(OFF); fix(OFF); fix(OFF);
  await settle();
  assert.equal(calls.used, 1);
  assert.equal(calls.detour, 0);
  assert.equal(view().title, '부흥고등학교 정류장까지 걸어요', '같은 정류장');
  assert.match(view().sub, /^1\/3 · 250m · /, '새 걷기 거리 · 같은 단계');
  // 새 걷기 위에서 다시 벗어나면(간격 뒤) 바뀐 경로로 묻는다 — 버스 구간은 처음 것 그대로
  for (const spot of [WEST, WEST, WEST]) fix(spot);
  assert.equal(calls.asked.length, 1, '간격 안');
  assert.equal(calls.asked[0].plan.legs[1], BUS);
});
