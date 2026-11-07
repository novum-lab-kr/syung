// 타고 가기 기다리기 카드 — 승강장 도착 · 열차 도착 · 지하에서 위치가 끊겨 기다리기로(계획서 2026-11-06 「기다리기 카드」)
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXIT_NEAR_M, LOST_FIX_MS, LOST_NEAR_M, STATION_ACCESS_S, arriveOutcome, arrivedEarly, legPace, lostUnderground, nearBoarding, nearestM, pickedArrived, waitText, walkLeftS } from '../web/lib/ride-along.mts';

const walkLeg = {type: 'walk', seconds: 300, metres: 240, label: '시청역 5번 출구까지', path: [[126.977, 37.566], [126.979, 37.566]]};
const rideLeg = (extra = {}) => ({type: 'ride', line: '2호선', from: '시청', to: '강남', departs: '08:10', arrives: '08:40', direction: '외선', stops: 12, wait: 120, stations: [201, 202, 203], ...extra});
const legs = [walkLeg, rideLeg(), rideLeg({line: '4호선', from: '사당', to: '오이도', stations: [433, 434]})];

test('걷는 시간이 0이면 「승강장 도착」 — 0초 전에는 그대로 분(1분 아래도 1분)', () => {
  assert.equal(waitText(legs, 1, 0, [300, 540], 0).sub, '승강장 도착 · 열차 5분 뒤 · 다음 9분 뒤');
  assert.equal(waitText(legs, 1, 0, null, 0).sub, '승강장 도착');
  assert.equal(waitText(legs, 1, 20, null, 0).sub, '걸어서 1분');
  assert.equal(waitText(legs, 2, 0, [420], 0).sub, '2/3 · 승강장 도착 · 열차 7분 뒤', '갈아타기도 같다');
  const busLeg = {type: 'bus', route: '472', from: '시청역9번출구.시청서소문2청사', to: '신사역', departs: '08:10', arrives: '08:40', toward: '개포동', stops: 9, wait: 60, path: []};
  assert.equal(waitText([walkLeg, busLeg], 1, 0, null, 0).sub, '정류장 도착', '버스는 정류장(2026-11-07 사용자 시험)');
  assert.equal(waitText([walkLeg, busLeg], 1, 0, [180, 720], 0).sub, '정류장 도착 · 472번 3분 뒤 · 다음 12분 뒤', '버스 도착 실시간(2026-11-07 사용자 결정)');
  assert.equal(waitText([walkLeg, busLeg], 1, 0, [600], 0, false, true).sub, '정류장 도착 · 다음 472번 10분 뒤', '놓친 뒤');
});

test('고른 열차가 들어왔으면 「열차 도착 · 지금 타세요」 — 다음 열차는 그대로', () => {
  assert.equal(waitText(legs, 1, 0, [120, 540], 0, true).sub, '승강장 도착 · 열차 도착 · 지금 타세요 · 다음 9분 뒤', '줄이 늦어 2분 뒤로 보여도');
  assert.equal(waitText(legs, 1, 0, [120], 0, false).sub, '승강장 도착 · 열차 2분 뒤');
  // 앞 열차를 못 타는 경우에도 들어온 열차는 「도착」, 그 뒤는 「다음」
  assert.equal(waitText(legs, 1, 120, [30, 200, 500], 0, true).sub, '걸어서 2분 · 열차 도착 · 지금 타세요 · 다음 8분 뒤');
});

test('열차 도착 판단: 곧 도착 0초 · 줄에서 0초 · 지도 예측이 그 역에 서 있음 중 하나', () => {
  const track = (dist) => ({seqIds: [200, 201, 202], cum: [0, 1000, 2000], dist});
  const base = {zeroSinceMs: 0, pickedDueS: 120, track: null, stationId: 201};
  assert.equal(pickedArrived(base), false, '줄에서 2분 남음 · 지도에 없음');
  assert.equal(pickedArrived({...base, zeroSinceMs: 1}), true, '곧 도착 0초를 봤다');
  assert.equal(pickedArrived({...base, pickedDueS: 0}), true, '줄에서 0초');
  assert.equal(pickedArrived({...base, track: track(1000)}), true, '줄이 늦어도 지도 예측이 역에 닿았으면');
  assert.equal(pickedArrived({...base, track: track(990)}), true, '역 바로 앞(앞뒤 역 사이 3% 안)');
  assert.equal(pickedArrived({...base, track: track(800)}), false, '아직 앞 역 쪽');
  assert.equal(pickedArrived({...base, track: track(1200)}), false, '이미 떠났다(10% 넘게)');
  assert.equal(pickedArrived({...base, pickedDueS: null, track: {seqIds: [202, 203], cum: [0, 1000], dist: 0}}), false, '역이 차례에 없음');
});

test('지하에서 위치가 끊김: 마지막 위치가 타는 역 150m 안 · 30초 넘게 새 위치 없음이면 기다리기로', () => {
  assert.equal(LOST_NEAR_M, 150); assert.equal(LOST_FIX_MS, 30000);
  const base = {nowMs: 100000, lastFixMs: 100000 - 31000, stationM: 140};
  assert.equal(lostUnderground(base), true);
  assert.equal(lostUnderground({...base, lastFixMs: 100000 - 30000}), false, '30초까지는 기다린다');
  assert.equal(lostUnderground({...base, stationM: 151}), false, '150m 밖이면 걷기 그대로');
  assert.equal(lostUnderground({...base, stationM: null}), false, '다음이 지하철이 아니면');
  assert.equal(lostUnderground({...base, lastFixMs: 0}), false, '위치를 받은 적 없음');
});

// 그 역의 어느 출구든(2026-11-06 사용자 확정): 정한 출구가 아닌 출구 50m 안에 머물거나 그 근처에서 위치가 끊기면 기다리기로
test('어느 출구든: 가장 가까운 출구 거리 · 출구 50m 안이면 가까움(기존 길 끝 · 역 100m 규칙은 그대로)', () => {
  assert.equal(EXIT_NEAR_M, 50);
  const exits = [[126.9800, 37.5660], [126.9760, 37.5650]];
  assert.equal(nearestM([126.9760, 37.5650], exits), 0);
  assert.ok(Math.abs(nearestM([126.9760, 37.5654], exits) - 44.5) < 1, '북쪽으로 약 45m');
  assert.equal(nearestM([126.9760, 37.5650], []), null, '출구 자료 없음');
  assert.equal(nearBoarding({goalM: 400, stationM: 300, exitM: 40}), true, '다른 출구로 들어감');
  assert.equal(nearBoarding({goalM: 400, stationM: 300, exitM: 60}), false, '출구에서 60m — 아직 걷기');
  assert.equal(nearBoarding({goalM: 400, stationM: 300, exitM: null}), false, '출구 자료가 없으면 예전대로');
  assert.equal(nearBoarding({goalM: 90, stationM: null, exitM: null}), true, '정한 출구(길 끝) 100m 그대로');
  assert.equal(nearBoarding({goalM: 400, stationM: 95, exitM: null}), true, '역 한가운데 100m 그대로');
});

// 2026-11-07 사용자 결정: 역(출구 · 역 한가운데 · 길 끝)에 닿아 기다리기로 넘기면 남은 길 0, 승강장 90초만 그때부터 센다
// 재현(운영 기록 click-log 2026-11-07T04-32-18): 시청역 11번 출구 길(374m · 269초)을 벗어나 역 한가운데 35m 에서 넘김 → 길에 비춘 남은 길 111m 가 남아
//  111 ÷ 2.09 + 90 = 143초 「걸어서 2분」, 4분 뒤 열차는 놓침으로 보였다
test('역에 닿아 넘기면 남은 길 0 — 승강장 90초만(예전: 길에 비춘 남은 길까지 더해 「걸어서 2분」 · 열차 놓침)', () => {
  const exit11 = {type: 'walk', seconds: 269, metres: 374, label: '시청역 11번 출구까지', path: walkLeg.path}, plan = [exit11, rideLeg()];
  const before = walkLeftS(plan, 0, 111, legPace(plan, 0));
  assert.equal(Math.round(before), 143, '고치기 전 값(남은 길 111m 를 그대로 둠)');
  // 기록의 「다음 열차 4분 뒤」는 그 앞 열차(143 × 0.8 = 114초 안쪽 — 기록에 초는 없어 100초로 둔다)를 못 탄다고 뺀 것
  assert.equal(waitText(plan, 1, before, [100, 240, 3960], 0).sub, '걸어서 2분 · 다음 열차 4분 뒤 · 그다음 66분 뒤', '기록 카드와 같은 글');
  assert.equal(walkLeftS(plan, 0, 0, legPace(plan, 0)), STATION_ACCESS_S, '남은 길 0 이면 승강장 90초만');
  assert.equal(waitText(plan, 1, STATION_ACCESS_S, [100, 240, 3960], 0).sub, '걸어서 2분 · 열차 2분 뒤 · 다음 4분 뒤', '앞 열차도 탈 수 있다(90 × 0.8 = 72초 넘게 남음)');
});

test('고른 열차가 들어왔을 때: 승강장 시간이 끝났으면 탄 것 · 남았으면 놓침 · 안 들어왔으면 그대로', () => {
  assert.equal(arriveOutcome(0, true), 'board');
  assert.equal(arriveOutcome(-5, true), 'board');
  assert.equal(arriveOutcome(30, true), 'missed');
  assert.equal(arriveOutcome(0, false), null);
  assert.equal(arriveOutcome(30, false), null);
});

test('놓친 열차가 줄에 남아 있으면(줄에서는 뺐다) 「다음 열차」 글 · 놓침 한마디', () => {
  const text = waitText(legs, 1, 40, [300, 540], 0, false, true);
  assert.equal(text.sub, '걸어서 1분 · 다음 열차 5분 뒤 · 그다음 9분 뒤');
  assert.equal(text.say, '포탈 열면 가능한데… 그럴 거면 집으로 여시죠');
  assert.equal(waitText(legs, 1, 40, [300, 540], 0).sub, '걸어서 1분 · 열차 5분 뒤 · 다음 9분 뒤', '놓친 열차가 없으면 예전대로');
  // 곧 올 열차 줄에 놓친 열차뿐(2026-11-07 시청 캡처): 다음 열차는 아직 모르니 걷는 시간 + 놓침 한마디
  assert.deepEqual(waitText(legs, 1, 40, [], 0, false, true), {say: '포탈 열면 가능한데… 그럴 거면 집으로 여시죠', sub: '걸어서 1분'});
});

test('다른 출구 근처에서 위치가 끊김: 역 150m 밖이어도 출구 50m 안이면 기다리기로 · 출구에서 먼 곳이면 안 넘김', () => {
  const base = {nowMs: 100000, lastFixMs: 100000 - 31000, stationM: 320};
  assert.equal(lostUnderground({...base, exitM: 45}), true, '다른 출구 근처에서 끊김');
  assert.equal(lostUnderground({...base, exitM: 51}), false, '출구에서 51m');
  assert.equal(lostUnderground({...base, exitM: null}), false, '출구 자료 없음 · 역 150m 밖');
  assert.equal(lostUnderground({...base, exitM: 45, lastFixMs: 100000 - 30000}), false, '30초까지는 기다린다');
  assert.equal(lostUnderground({...base, stationM: 140, exitM: 200}), true, '역 150m 규칙은 그대로');
});

test('승강장 시간이 남았는데 이 역에 들어와 있는 열차는 고른 열차가 아니어도 놓친 열차(③ — 2026-11-07 화면 추적 0102 「시청 도착」)', () => {
  const rows = [{message: '시청 도착', trainNo: '0102'}, {message: '시청 진입', trainNo: '0100'}, {message: '전역 도착', trainNo: '0106'},
    {message: '시청 출발', trainNo: '0098'}, {message: '[2]번째 전역 (남영)', trainNo: '0654'}, {message: '시청 도착', trainNo: null}];
  assert.deepEqual(arrivedEarly(rows, 30, '시청'), ['0102', '0100'], '전역 도착(남은 초를 깎아 0 이 돼도) · 출발 · 번호 없는 줄은 빼지 않는다');
  assert.deepEqual(arrivedEarly(rows, 30, '시청(1호선)'), ['0102', '0100'], '괄호 붙은 역 이름');
  assert.deepEqual(arrivedEarly(rows, 0, '시청'), [], '승강장 시간이 끝났으면 서 있는 열차를 탈 수 있다');
});
