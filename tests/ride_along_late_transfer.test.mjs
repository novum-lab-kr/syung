// 타고 가기(web/ui/ride_along.mts) — 탈 시각이 지난 뒤 닿은 지하철 구간: 곧 올 열차를 받기도 전(목록 0)에 「탈 시각 1분 지남」으로 바로 탄 것으로
// 넘어갔다(2026-11-08 운영 10케이스 #3 고속터미널 9호선 — 기다리기 카드 2초 · 「N분 뒤」 없음). 승강장 걷기가 끝나기 전엔 시각으로 넘기지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {hidden: false, createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const at = minutes => { const time = new Date(Date.now() + minutes * 60000); return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`; };
const STATION = [127.0049, 37.5049];

test('탈 시각이 지나 닿은 지하철 구간은 승강장 걷기 동안 기다리기(곧 올 열차를 받기 전에 탄 것으로 넘기지 않는다)', async context => {
  const views = [];
  let onFix = null, answer = null;
  const fetched = [], realFetch = globalThis.fetch;
  globalThis.fetch = async url => { fetched.push(String(url)); await new Promise(resolve => { answer = resolve; }); return {json: async () => ({arrivals: []})}; };
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans: []}, trainPose: () => ({dist: 0}), trainLngLat: () => ({lng: 0, lat: 0}), arrivalRank: () => 0, byId: new Map(), animFrame: [],
    drawRideCard: (_host, view) => { views.push(view); }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
  });
  context.after(() => { rideAlong.stop(); globalThis.fetch = realFetch; answer?.(); });
  const fix = ([longitude, latitude]) => onFix({coords: {longitude, latitude, accuracy: 10}});
  fix(STATION);
  // 탈 시각은 5분 전(앞 구간이 늦어짐) · 방향은 서버가 줌
  const late = at(-5);
  rideAlong.start({arrives: at(20), legs: [{type: 'ride', line: '9호선', from: '고속터미널', to: '언주', departs: late, arrives: at(10), direction: '상행', stops: 3, wait: 60, stations: [1, 2, 3, 4], trainNo: '9534'}]}, '언주');
  await settle();
  assert.equal(fetched.length, 1, '곧 올 열차를 부른다');
  fix(STATION);   // 아직 응답 전(목록 0) · 탈 시각은 1분 넘게 지남
  assert.match(views.at(-1).title, /타는 곳으로/, '승강장 걷기 동안은 기다리기');
});
