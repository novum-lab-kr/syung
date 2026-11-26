// 타고 가기(web/ui/ride_along.mts) — 내림 판정(2026-11-26 사용자: 중화에서 내렸는데 「중화에서 내려요 · 7정거장」 그대로 어린이대공원까지 열차를 따라감)
// ① 탄 열차 예측이 내릴 역을 건너뛰어(또는 계획보다 앞 열차라 계획 도착 시각 전에) 구간 역이 모두 빠지면 바로 내린 것으로
// ② 내릴 역에서 열차와 떨어진 새 위치가 연달아 3번이면 내린 것으로
// ③ 같은 열차로 가는 동안 남은 정거장은 늘지 않는다(예측을 놓쳐 시각 셈으로 바뀌어도)
import test from 'node:test';
import assert from 'node:assert/strict';

// ride_along 은 만들 때 카드 자리(div)를 body 에 붙이고 화면 숨김(visibilitychange)을 듣는다 — Node 에는 document 가 없어 최소한만 흉내 낸다(ride_along_battery 와 같은 틀)
globalThis.document ??= {hidden: false, addEventListener() {}, createElement: () => ({className: '', querySelector: () => null}), body: {append() {}, classList: {toggle() {}, remove() {}}}};
globalThis.innerHeight = 844;
const {createRideAlong} = await import('../web/ui/ride_along.mts');

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const at = minutes => { const time = new Date(Date.now() + minutes * 60000); return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`; };
const CITY_HALL = [126.9770, 37.5658], SEOUL = [126.9723, 37.5563], NAMYEONG = [126.9707, 37.5447], YONGSAN = [126.9648, 37.5298];

// 시청(1) → 서울역(2) → 남영(3) 2정거장 · 계획 도착은 10분 뒤(아직 안 됨) · 열차 0097 은 지도 예측 [0,1,2,3]
function setup(context) {
  let onFix = null, clock = Date.now();
  context.mock.timers.enable({apis: ['setInterval']});
  const realNow = Date.now, realFetch = globalThis.fetch, views = [], id = '1호선:0097', dist = new Map([[id, 0]]), spot = {at: SEOUL};
  Date.now = () => clock;
  globalThis.fetch = async () => ({json: async () => ({arrivals: [{line: '1호선', direction: '하행', destination: null, trainNo: '0097', eta: 120, message: '전역 출발', receivedAt: null}]})});
  const plans = [{id, seq: [{id: 0}, {id: 1}, {id: 2}, {id: 3}], cum: [0, 1000, 2000, 3000]}];
  const rideAlong = createRideAlong({
    map: {getZoom: () => 16, isMoving: () => false, project: () => ({x: 195, y: 300}), getContainer: () => ({clientWidth: 390, clientHeight: 844}), easeTo() {}, jumpTo() {}, on() {}},
    geolocate: {_watchState: 'ACTIVE', trigger() {}, on: (_type, listener) => { onFix = listener; }},
    planner: {plans}, trainPose: plan => ({dist: dist.get(plan.id) ?? 0}), trainLngLat: () => ({lng: spot.at[0], lat: spot.at[1]}), arrivalRank: row => row.eta,
    byId: new Map([[1, {lat: CITY_HALL[1], lon: CITY_HALL[0], name: '시청'}], [2, {lat: SEOUL[1], lon: SEOUL[0], name: '서울역'}], [3, {lat: NAMYEONG[1], lon: NAMYEONG[0], name: '남영'}]]),
    animFrame: [], drawRideCard: (_host, view) => { views.push(view); }, look: () => 'sprout', walked() {}, ended() {}, detour() {},
    otherFollow: {active: () => false, stop() {}}, reroute: async () => null, exitsOf: () => [], busStopAt: () => null,
    bus: {board: () => null, arrivals: async () => null, approach: () => null, atStop: () => null, ride() {}, watch() {}},
  });
  context.after(() => { rideAlong.stop(); Date.now = realNow; globalThis.fetch = realFetch; });
  const fix = ([longitude, latitude], accuracy = 10) => onFix({coords: {longitude, latitude, accuracy}});
  const ridePlan = {arrives: at(10), legs: [{type: 'ride', line: '1호선', from: '시청', to: '남영', departs: at(-5), arrives: at(10), direction: '하행', stops: 2, wait: 60, stations: [1, 2, 3], trainNo: '0097'}]};
  const pass = seconds => { clock += seconds * 1000; };
  const quiet = seconds => { pass(seconds); context.mock.timers.tick(1000); };
  return {rideAlong, ridePlan, plans, fix, dist, id, spot, view: () => views.at(-1), pass, quiet};
}

// 시청에서 0097 이 들어왔다 떠나고 위치가 30초 넘게 끊김(지하) → 탄 것(ride_along_battery boardAtCityHall 과 같은 장면)
async function board({rideAlong, ridePlan, fix, dist, id, view, pass, quiet}) {
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

test('① 열차 예측이 남영을 건너뛰어 구간 역이 모두 빠지면 계획 도착 시각 전이어도 바로 내렸다', async context => {
  const ctx = setup(context), {plans, dist, id, view, quiet} = ctx;
  await board(ctx);
  quiet(1);   // 타는 중 판정이 한 번 돈다 — 예측에 구간 역(남영)이 보였다
  // 다음 실시간 받기: 0097 은 남영을 지나 용산 · 노량진 …(예측이 한 번에 두 역을 건너뛰었다 — reached(남영)을 못 봄)
  plans[0] = {id, seq: [{id: 4}, {id: 5}, {id: 6}], cum: [0, 1000, 2000]};
  dist.set(id, 300);
  quiet(1);
  assert.equal(view().title, '슝 도착!', '계획 도착 시각(10분 뒤)까지 지난 열차를 따라가지 않는다');
});

test('② 내릴 역에서 열차와 떨어진 새 위치가 연달아 3번이면 내렸다 — 열차와 같이 있으면 그대로', async context => {
  const ctx = setup(context), {fix, spot, view, pass} = ctx;
  await board(ctx);
  // 열차와 같이 남영에 들어옴(열차 자리 = 내 위치): 내리지 않는다
  spot.at = NAMYEONG;
  for (let count = 0; count < 3; count++) { pass(5); fix([NAMYEONG[0], NAMYEONG[1] + (count % 2 ? 0.00002 : -0.00002)]); }
  assert.equal(view().title, '남영에서 내려요');
  // 열차는 용산 쪽으로 떠나고 나는 남영에 남음 — 두 번은 아직, 세 번째에 내렸다
  spot.at = YONGSAN;
  pass(5); fix([NAMYEONG[0], NAMYEONG[1] + 0.00003]);
  pass(5); fix([NAMYEONG[0], NAMYEONG[1] - 0.00003]);
  assert.equal(view().title, '남영에서 내려요');
  pass(5); fix([NAMYEONG[0] + 0.00003, NAMYEONG[1]]);
  assert.equal(view().title, '슝 도착!');
});

test('③ 탄 열차가 지도에서 사라져 시각 셈으로 바뀌어도 남은 정거장은 늘지 않는다', async context => {
  const ctx = setup(context), {plans, dist, id, view, quiet} = ctx;
  await board(ctx);
  dist.set(id, 2000);   // 서울역 도착 — 남은 정거장 1
  quiet(1);
  assert.match(view().sub, /다음 역에서 내려요/);
  plans.length = 0;     // 탄 열차가 지도 목록에서 빠짐 → 시각 셈(계획 2정거장 중 지난 몫)으로는 2
  quiet(1);
  assert.match(view().sub, /다음 역에서 내려요/, '1 → 2 로 늘지 않는다');
  assert.doesNotMatch(view().sub, /2정거장/);
});
