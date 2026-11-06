// 타고 가기(web/ui/ride_along.mts) — 걷는 길에서 20m 넘게 벗어난 위치를 연달아 3번 받으면 시트 없이 지금 위치에서 다시 찾아 이어 간다(2026-11-06)
import test from 'node:test';
import assert from 'node:assert/strict';

// ride_along 은 모듈을 읽을 때 카드 자리(div)를 body 에 붙인다 — Node 에는 document 가 없어 최소한만 흉내 낸다(ride_along_follow 와 같다)
globalThis.document = {createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');
const {REROUTE_GAP_MS} = await import('../web/lib/ride-along.mts');

// 서울시청 근처 동쪽으로 약 200m 걷는 길 · 위도 0.0003 ≈ 33m
const WEST = [126.9770, 37.5660], EAST = [126.97926, 37.5660], OFF = [126.9780, 37.5663], ON = [126.9780, 37.5660];
const walkPlan = (path, arrives = '23:59') => ({arrives, legs: [{type: 'walk', seconds: 300, metres: 200, label: '목적지까지 걸어서', path}]});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function setup(answers) {
  let onFix = null, views = [];
  const calls = {reroute: [], used: 0, detour: 0, easeTo: 0, ended: 0};
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, easeTo: () => { calls.easeTo++; }, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans: []}, trainPose: () => ({dist: 0}), trainLngLat: () => ({lng: 0, lat: 0}), arrivalRank: () => 0, byId: new Map(), animFrame: [],
    drawRideCard: (_host, view) => { views.push(view); }, look: () => 'sprout', walked() {}, ended: () => { calls.ended++; }, detour: () => { calls.detour++; },
    otherFollow: {active: () => false, stop() {}},
    reroute: spot => { calls.reroute.push(spot); const next = answers.shift(); return Promise.resolve(next ? {plan: next, use: () => { calls.used++; }} : null); },
  });
  const fix = ([longitude, latitude], accuracy = 10) => onFix({coords: {longitude, latitude, accuracy}});
  return {rideAlong, calls, fix, view: () => views.at(-1)};
}

test('20m 넘게 벗어난 위치 3번째에 지금 위치로 다시 찾고, 새 길 처음부터 시트 없이 이어 간다', async context => {
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
  assert.match(view().sub, /^1\/1 · /, '새 길 첫 걷기 카드');
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
