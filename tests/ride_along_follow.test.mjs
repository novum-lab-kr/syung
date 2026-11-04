// 타고 가기(web/ui/ride_along.mts) — 지하철을 타는 동안 지도가 탄 열차를 따라가는가.
// 본체는 animFrame 콜백을 시트 따라가기 루프(ui/sheet.mts followLoop)로 돌리고, 그 루프는 `rideFollow` 가 참일 때만 돈다(열차 층 draw.mts 가 깨운다).
// 운영 2026-11-04: 탄 순간 열차 자리로 한 번 가고는 6분 넘게 그대로 — 루프가 타고 가기 상태를 몰라 콜백이 한 번도 안 불렸다.
// 루프 · 깨우기 쪽은 sheet.mts · draw.mts 의 그 구간을 글자로 잘라 실행한다(tests/coaster_mode_transition 과 같은 방식 — 표지 글자를 바꾸면 여기도 맞춘다).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

// ride_along 은 모듈을 읽을 때 카드 자리(div)를 body 에 붙인다 — Node 에는 document 가 없어 최소한만 흉내 낸다
const element = () => ({className: '', querySelector: () => null});
globalThis.document = {createElement: element, body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
// 프레임 시간은 시험이 명시적으로 진행한다(카메라가 열차 쪽으로 미끄러지는 몫은 지난 시간으로 셈 — 같은 시각이면 0)
let clockMs = 0;
Object.defineProperty(globalThis.performance, 'now', {value: () => clockMs, configurable: true, writable: true});
const frame = (callbacks, ms = 16) => { clockMs += ms; for (const callback of callbacks) callback(); };
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const CITY_HALL = {lng: 126.9770, lat: 37.5658}, SEOUL = {lng: 126.9723, lat: 37.5563};
function setup() {
  const calls = {easeTo: [], jumpTo: [], otherStop: 0}, listeners = {};
  let spot = {...CITY_HALL}, moving = false, otherOn = false, actions = null;
  const map = {
    getZoom: () => 15, isMoving: () => moving,
    easeTo: options => calls.easeTo.push(options), jumpTo: options => calls.jumpTo.push({by: 'ride', ...options}),   // by: 누가 옮겼나(버스 콜백은 'bus' 를 붙인다)
    on: (type, listener) => { listeners[type] = listener; },
  };
  const geolocate = {_watchState: 'ACTIVE', trigger() {}, on() {}};
  const planner = {plans: [{id: '1호선:0097', seq: [{id: 1}, {id: 2}, {id: 3}], cum: [0, 1000, 2000]}]};
  const animFrame = [];
  // 시트의 버스 따라가기 콜백은 타고 가기 콜백보다 먼저 들어 있다(본체: createBottomSheet → createRideAlong) — 같은 프레임에 둘 다 jumpTo 하면 뒤(타고 가기)가 이긴다
  const BUS = {lng: 126.9780, lat: 37.5700};
  animFrame.push(() => { if (otherOn) map.jumpTo({center: {...BUS}, by: 'bus'}); });
  const rideAlong = createRideAlong({
    map, geolocate, planner, trainPose: () => ({dist: 0}), trainLngLat: () => ({...spot}), arrivalRank: () => 0,
    byId: new Map([[1, {lat: 37.5658, lon: 126.9770, name: '시청'}], [2, {lat: 37.5563, lon: 126.9723, name: '서울'}], [3, {lat: 37.5547, lon: 126.9707, name: '남영'}]]),
    animFrame, drawRideCard: (_host, _view, next) => { actions = next; }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => otherOn, stop: () => { otherOn = false; calls.otherStop++; }},
  });
  // 방향이 없는 구간은 곧 올 열차를 받지 않는다(fetch 없음) · 길찾기가 알려 준 열차 0097 이 첫 짐작
  const plan = {arrives: '23:59', legs: [{type: 'ride', line: '1호선', from: '시청', to: '남영', departs: '00:00', arrives: '23:59', direction: null, stops: 2, wait: 60, stations: [1, 2, 3], trainNo: '0097'}]};
  return {rideAlong, map, calls, listeners, animFrame, planner, plan, BUS, actions: () => actions, setSpot: next => { spot = next; }, setMoving: next => { moving = next; }, setOther: next => { otherOn = next; }};
}

test('타는 동안에만 followingTrain — 기다릴 때 · 끝났을 때는 아니다', context => {
  const {rideAlong, plan, calls} = setup();
  context.after(() => rideAlong.stop());   // 실패해도 1초 타이머가 남아 프로세스가 안 끝나는 일이 없게
  assert.equal(rideAlong.followingTrain, false, '출발 전');
  rideAlong.start(plan, '여의도공원');
  assert.equal(rideAlong.followingTrain, false, '기다리는 중에는 열차를 따라가지 않는다');
  assert.equal(rideAlong.tapTrain({id: '1호선:0097'}), true);   // 열차를 누르면 탄 것으로
  assert.equal(calls.easeTo.length, 1, '탈 때 그 열차로 한 번 이동');
  assert.equal(rideAlong.followingTrain, true, '타는 중');
  rideAlong.stop();
  assert.equal(rideAlong.followingTrain, false, '그만두면');
});

test('타는 동안 프레임마다 탄 열차 자리로 카메라 — 같은 자리면 건너뛰고, 손으로 움직이면 멈춘다', context => {
  const {rideAlong, plan, calls, listeners, animFrame, setSpot} = setup();
  context.after(() => rideAlong.stop());
  rideAlong.start(plan, '여의도공원');
  rideAlong.tapTrain({id: '1호선:0097'});
  frame(animFrame);
  assert.equal(calls.jumpTo.length, 1);
  assert.deepEqual(calls.jumpTo[0].center, CITY_HALL, '첫 프레임은 열차 자리 그대로');
  frame(animFrame);
  assert.equal(calls.jumpTo.length, 1, '열차가 그 자리면 jumpTo 를 다시 부르지 않는다');
  setSpot({...SEOUL});   // 서울역 쪽으로
  frame(animFrame);
  assert.equal(calls.jumpTo.length, 2);
  const moved = calls.jumpTo[1].center;
  assert.ok(moved.lat < CITY_HALL.lat && moved.lat > SEOUL.lat, `열차 쪽으로 미끄러진다(${moved.lat})`);
  frame(animFrame, 5000);   // 한참 뒤 프레임(1초 넘게 쉬었으면 열차 자리로 바로)
  assert.deepEqual(calls.jumpTo[2].center, SEOUL);
  // 손으로 지도를 움직이면 따라가기를 멈춘다
  listeners.movestart({originalEvent: {}});
  assert.equal(rideAlong.followingTrain, false);
  frame(animFrame);
  assert.equal(calls.jumpTo.length, 3, '멈춘 뒤에는 카메라를 옮기지 않는다');
});

test('탄 열차가 지도 목록에 없으면 followingTrain 은 아니다(루프를 헛돌리지 않는다)', context => {
  const {rideAlong, plan, planner, animFrame, calls} = setup();
  context.after(() => rideAlong.stop());
  rideAlong.start(plan, '여의도공원');
  rideAlong.tapTrain({id: '1호선:0097'});
  planner.plans.length = 0;
  assert.equal(rideAlong.followingTrain, false);
  frame(animFrame);
  assert.equal(calls.jumpTo.length, 0);
});

test('다른 따라가기(시트의 버스 · 열차)를 고르면 타고 가기 카메라는 비킨다 — 손으로 움직였을 때처럼 끄고 「다시 따라가기」로 되돌린다', context => {
  const {rideAlong, plan, calls, animFrame, setOther, actions, BUS} = setup();
  context.after(() => rideAlong.stop());
  rideAlong.start(plan, '여의도공원');
  rideAlong.tapTrain({id: '1호선:0097'});
  frame(animFrame);
  assert.equal(calls.jumpTo.at(-1).by, 'ride');
  setOther(true);   // 지도에서 버스를 눌러 따라가기 시작(시트 followBusStart)
  frame(animFrame);
  assert.equal(calls.jumpTo.at(-1).by, 'bus', '같은 프레임에서 타고 가기 카메라가 버스 카메라를 덮지 않는다');
  assert.equal(rideAlong.followingTrain, false, '타고 가기 따라가기는 꺼진다(카드에 「다시 따라가기」)');
  frame(animFrame);
  assert.equal(calls.jumpTo.filter(call => call.by === 'ride').length, 1, '버스를 따라가는 동안 타고 가기는 카메라를 옮기지 않는다');
  // 「다시 따라가기」: 다른 따라가기를 끄고 탄 열차로
  actions().follow();
  assert.equal(calls.otherStop, 1, '시트의 따라가기를 끈다');
  assert.equal(rideAlong.followingTrain, true);
  assert.equal(calls.easeTo.length, 2, '탄 열차로 한 번 이동');
  frame(animFrame);
  assert.equal(calls.jumpTo.at(-1).by, 'ride');
});

test('다른 따라가기를 골랐는데 프레임 루프가 안 돌아도(고른 열차가 역에 서 있을 때) 1초 tick 이 타고 가기 따라가기를 끈다', context => {
  context.mock.timers.enable({apis: ['setInterval']});
  const {rideAlong, plan, setOther, actions} = setup();
  context.after(() => rideAlong.stop());
  rideAlong.start(plan, '여의도공원');
  rideAlong.tapTrain({id: '1호선:0097'});
  assert.equal(rideAlong.followingTrain, true);
  setOther(true);
  context.mock.timers.tick(1000);   // 프레임 콜백은 한 번도 안 불린다
  assert.equal(rideAlong.followingTrain, false, '카드에 「다시 따라가기」');
  actions().follow();
  assert.equal(rideAlong.followingTrain, true);
});

// ---- 실제 깨우기 경로: ui/sheet.mts followLoop · trains/draw.mts 의 followSoon 조건(글자로 잘라 실행)
const sheetSource = stripTypeScriptTypes(readFileSync(new URL('../web/ui/sheet.mts', import.meta.url), 'utf8'));
const drawSource = stripTypeScriptTypes(readFileSync(new URL('../web/trains/draw.mts', import.meta.url), 'utf8'));
const part = (source, from, to) => { const start = source.indexOf(from), end = source.indexOf(to, start); assert.ok(start >= 0 && end > start, `표지 글자 ${from}`); return source.slice(start, end); };

function loopHarness() {
  const calls = {raf: 0, repaint: 0, frames: 0};
  const context = vm.createContext({
    Math, performance, followRaf: 0, followLast: 0, following: null, followBus: null, easing: false, FOLLOW_FPS: 30,
    live: {rider: {ride: null}, rideFollow: false, frameMs: 0}, planner: {setFrame() {}},
    animFrame: [() => { calls.frames++; }], map: {triggerRepaint() { calls.repaint++; }},
    requestAnimationFrame: () => { calls.raf++; return calls.raf; },
  });
  const {followLoop} = vm.runInContext([
    part(sheetSource, 'function followSoon(){', '  // 손가락'),
    part(sheetSource, '  function followLoop(', '  animFrame.push(()=>{'),
    '({followSoon, followLoop})',
  ].join('\n'), context);
  return {context, calls, followLoop};
}

test('sheet.mts followLoop: 타고 가기(rideFollow)만 켜져 있어도 animFrame 콜백을 돌린다 — 시트 · 롤코 · 버스 따라가기가 없을 때', () => {
  const {context, calls, followLoop} = loopHarness();
  followLoop(1000);
  assert.equal(calls.frames, 0, '아무 따라가기도 없으면 루프는 바로 끝난다');
  context.live.rideFollow = true;
  followLoop(1000);
  assert.equal(calls.frames, 1, '타고 가기 따라가기면 콜백을 돈다');
  assert.equal(calls.repaint, 1, '카메라 뒤에 지도를 다시 그린다');
  context.easing = true;
  followLoop(2000);
  assert.equal(calls.frames, 1, '시트가 easeTo 로 가는 동안은 쉰다');
  context.easing = false; context.live.rideFollow = false;
  followLoop(3000);
  assert.equal(calls.frames, 1, '타고 가기가 끝나면 루프도 멈춘다(다시 예약하지 않는다)');
  assert.equal(calls.raf, 0);
});

test('draw.mts: 열차가 움직이는 프레임에 타고 가기(rideFollow)면 followSoon 으로 깨우고, 아니면 열차 프레임만', () => {
  const decide = vm.runInContext(`(function(animating, rippling, waiting, live, followSoon, trainFrameSoon, TRAIN_FPS) {\n${part(drawSource, '      if(animating&&(live.following', '\n    }\n    onRemove(')}\n})`, vm.createContext({}));
  const run = live => { const calls = {follow: 0, train: []}; decide(true, false, false, live, () => calls.follow++, ms => calls.train.push(ms), 20); return calls; };
  const idle = {following: null, rider: {ride: null}, rideFollow: false, easing: false};
  assert.deepEqual(run(idle), {follow: 0, train: [50]}, '따라가기가 없으면 열차 프레임만');
  assert.deepEqual(run({...idle, rideFollow: true}), {follow: 1, train: []}, '타고 가기면 카메라 · 지도 · 열차를 같이(followSoon)');
  assert.deepEqual(run({...idle, rideFollow: true, easing: true}), {follow: 0, train: [50]}, 'easeTo 중에는 깨우지 않는다');
});
