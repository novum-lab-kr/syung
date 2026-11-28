// 타고 가기(web/ui/ride_along.mts) — 마지막 걷기의 목적지 도착: 목적지 30m(DEST_NEAR_M) 안에 5초 머물면 「슝 도착!」.
// 예전엔 역 · 정류장과 같은 100m(NEAR_M)라 목적지 100m 앞에서 도착이 떴다(2026-11-28 사용자 결정 — 역 · 정류장으로 걷는 기준은 그대로)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEST_NEAR_M, NEAR_HOLD_MS } from '../web/lib/ride-along.mts';

globalThis.document = {addEventListener() {}, hidden: false, createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const at = minutes => { const time = new Date(Date.now() + minutes * 60000); return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`; };
const GOAL = [127, 37.5];
const north = metresAway => [GOAL[0], GOAL[1] - metresAway / 111195];   // 목적지에서 남쪽으로 이만큼(위도 1도 ≈ 111195m)

// 목적지까지 걷기 한 구간만 있는 길을 시작해 그 거리에서 위치를 받으며 머문 뒤의 카드 제목
function stayAt(context, metresAway) {
  context.mock.timers.enable({apis: ['Date', 'setTimeout', 'setInterval'], now: Date.now()});
  const views = [];
  let onFix = null;
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, project: () => ({x: 0, y: 0}), getContainer: () => ({clientWidth: 390, clientHeight: 844}), easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans: []}, trainPose: () => ({dist: 0}), trainLngLat: () => ({lng: 0, lat: 0}), arrivalRank: () => 0, byId: new Map(), animFrame: [],
    drawRideCard: (_host, view) => { views.push(view); }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
  });
  context.after(() => rideAlong.stop());
  const fix = spot => onFix({coords: {longitude: spot[0], latitude: spot[1], accuracy: 10}});
  fix(north(metresAway));
  // 도착은 넉넉히 뒤(시각으로 끝나지 않게)
  rideAlong.start({arrives: at(30), legs: [{type: 'walk', seconds: 300, metres: 300, label: '목적지까지', path: [north(300), GOAL]}]}, '코엑스');
  for (let waited = 0; waited <= NEAR_HOLD_MS; waited += 1000) { fix(north(metresAway)); context.mock.timers.tick(1000); }
  fix(north(metresAway));
  return views.at(-1).title;
}

test('마지막 걷기: 목적지 30m 안에 5초 머물면 도착', context => {
  assert.equal(DEST_NEAR_M, 30); assert.equal(NEAR_HOLD_MS, 5000);
  assert.equal(stayAt(context, 29), '슝 도착!');
});

test('마지막 걷기: 목적지 40m 는 아직 걷는 중(예전 100m 기준이면 도착이 떴다)', context => {
  assert.notEqual(stayAt(context, 40), '슝 도착!');
});
