// 타고 가기(web/ui/ride_along.mts) × 개발자 기록기(devLog — 2026-11-11 계획서 D2 · D3):
// 개발자일 때만 「이 길로 출발」 ~ 도착 · ✕ 동안 시작 · 판정 · 끝을 남기고 카드에 [탔음] [안 탔음](view.dev)을 둔다. 기록기가 없으면 지금 그대로
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {hidden: false, createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const at = minutes => { const time = new Date(Date.now() + minutes * 60000); return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`; };

// 가짜 기록기: 부른 차례만 적는다(판정은 진짜처럼 바뀔 때만)
function fakeLog() {
  const calls = [];
  let recording = false, answered = null, last = '';
  return {
    calls,
    begin(info) { calls.push(['begin', info.mode]); recording = true; answered = null; last = ''; },
    gps(coords) { calls.push(['gps', coords.accuracy]); },
    judge(state) { if (recording && state !== last) { last = state; calls.push(['judge', state]); } },
    answer(value) { calls.push(['answer', value]); answered = value; },
    end(note) { calls.push(['end', note]); recording = false; },
    async flush() {}, close() {},
    get recording() { return recording; }, get answered() { return answered; },
  };
}

function ride(context, log) {
  const views = [];
  let actions = null, onFix = null;
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans: []}, trainPose: () => ({dist: 0}), trainLngLat: () => ({lng: 0, lat: 0}), arrivalRank: () => 0, byId: new Map(), animFrame: [],
    drawRideCard: (_host, view, given) => { views.push(view); actions = given; }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
    ...(log === undefined ? {} : {devLog: () => log}),
  });
  context.after(() => rideAlong.stop());
  return {rideAlong, views, actions: () => actions, fix: coords => onFix({coords})};
}

test('개발자: 출발에서 기록을 시작하고 첫 판정 · 위치(흐린 것도) · 정답 · ✕ 를 남긴다', context => {
  const log = fakeLog();
  const {rideAlong, views, actions, fix} = ride(context, log);
  rideAlong.start({arrives: at(10), legs: [{type: 'walk', metres: 600, minutes: 8}]}, '시청역');
  assert.deepEqual(log.calls.slice(0, 2), [['begin', 'subway'], ['judge', 'walk@0']]);
  assert.deepEqual(views.at(-1).dev, {answered: null}, '카드에 [탔음] [안 탔음]');
  fix({longitude: 126.97, latitude: 37.56, accuracy: 900});   // 타고 가기는 버리는 흐린 위치도 기록에는 남긴다
  actions().answer('not_rode');
  assert.deepEqual(views.at(-1).dev, {answered: 'not_rode'});
  actions().close();
  assert.deepEqual(log.calls.slice(2), [['gps', 900], ['answer', 'not_rode'], ['end', '그만둠']]);
  assert.equal(views.at(-1), null);
});

test('개발자: 도착하면 done 판정 → 끝 · 도착 카드에는 버튼이 없고 ✕ 에서 다시 끝내지 않는다', context => {
  context.mock.timers.enable({apis: ['setInterval']});
  const log = fakeLog();
  const {rideAlong, views, actions} = ride(context, log);
  rideAlong.start({arrives: at(-1), legs: [{type: 'walk', metres: 200, minutes: 3}]}, '시청역');
  context.mock.timers.tick(1000);
  assert.equal(views.at(-1).title, '슝 도착!');
  assert.equal(views.at(-1).dev, undefined);
  actions().close();
  assert.deepEqual(log.calls, [['begin', 'subway'], ['judge', 'walk@0'], ['judge', 'done'], ['end', '도착']]);
});

test('개발자 아님 · 로그인 안 함(기록기 없음): 카드는 지금 그대로', context => {
  for (const log of [undefined, null]) {
    const {rideAlong, views} = ride(context, log);
    rideAlong.start({arrives: at(10), legs: [{type: 'walk', metres: 600, minutes: 8}]}, '시청역');
    assert.equal('dev' in views.at(-1), false);
    rideAlong.stop();
  }
});
