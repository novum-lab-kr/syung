// 타고 가기(web/ui/ride_along.mts) — 카드 ✕: 「슝 도착!」 뒤 ✕ 는 길찾기를 다 끝내라고(ended(true) → lib/journey-ui rideEnded 가 경로 · 아래 막대를 지운다),
// 타는 도중 ✕ 는 경로를 아래 막대로 남기라고(ended(false)) 알린다(2026-11-08 사용자)
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {hidden: false, createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const at = minutes => { const time = new Date(Date.now() + minutes * 60000); return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`; };

function ride(context) {
  const views = [], ends = [];
  let actions = null;
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on() {}},
    planner: {plans: []}, trainPose: () => ({dist: 0}), trainLngLat: () => ({lng: 0, lat: 0}), arrivalRank: () => 0, byId: new Map(), animFrame: [],
    drawRideCard: (_host, view, given) => { views.push(view); actions = given; }, look: () => 'sprout', walked() {}, ended: arrived => { ends.push(arrived); }, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
  });
  context.after(() => rideAlong.stop());
  return {rideAlong, views, ends, close: () => actions.close()};
}

test('「슝 도착!」 뒤 ✕ 는 길찾기를 다 끝내라고 알린다', context => {
  context.mock.timers.enable({apis: ['setInterval']});
  const {rideAlong, views, ends, close} = ride(context);
  // 걷기 하나뿐 · 도착 시각이 지났고 위치가 없다 → 다음 tick 에 도착
  rideAlong.start({arrives: at(-1), legs: [{type: 'walk', metres: 200, minutes: 3}]}, '시청역');
  context.mock.timers.tick(1000);
  assert.equal(views.at(-1)?.title, '슝 도착!');
  close();
  assert.deepEqual(ends, [true]);
  assert.equal(rideAlong.active, false);
});

test('타는 도중 ✕ 는 경로를 남기라고 알린다(지금 동작 그대로)', context => {
  const {rideAlong, views, ends, close} = ride(context);
  rideAlong.start({arrives: at(10), legs: [{type: 'walk', metres: 600, minutes: 8}]}, '시청역');
  assert.notEqual(views.at(-1)?.title, '슝 도착!');
  close();
  assert.deepEqual(ends, [false]);
});
