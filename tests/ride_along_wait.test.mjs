// 타고 가기 기다리기 카드 — 승강장 도착 · 열차 도착 · 지하에서 위치가 끊겨 기다리기로(계획서 2026-11-06 「기다리기 카드」)
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXIT_NEAR_M, LOST_FIX_MS, LOST_NEAR_M, STATION_ACCESS_S, lostUnderground, nearBoarding, nearestM, otherExit, pickedArrived, waitText, walkLeftS } from '../web/lib/ride-along.mts';

const walkLeg = {type: 'walk', seconds: 300, metres: 240, label: '시청역 5번 출구까지', path: [[126.977, 37.566], [126.979, 37.566]]};
const rideLeg = (extra = {}) => ({type: 'ride', line: '2호선', from: '시청', to: '강남', departs: '08:10', arrives: '08:40', direction: '외선', stops: 12, wait: 120, stations: [201, 202, 203], ...extra});
const legs = [walkLeg, rideLeg(), rideLeg({line: '4호선', from: '사당', to: '오이도', stations: [433, 434]})];

test('걷는 시간이 0이면 「승강장 도착」 — 0초 전에는 그대로 분(1분 아래도 1분)', () => {
  assert.equal(waitText(legs, 1, 0, [300, 540], 0).sub, '승강장 도착 · 열차 5분 뒤 · 다음 9분 뒤');
  assert.equal(waitText(legs, 1, 0, null, 0).sub, '승강장 도착');
  assert.equal(waitText(legs, 1, 20, null, 0).sub, '걸어서 1분');
  assert.equal(waitText(legs, 2, 0, [420], 0).sub, '2/3 · 승강장 도착 · 열차 7분 뒤', '갈아타기도 같다');
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

test('다른 출구로 들어갔으면 남은 길 0(승강장 90초만) — 정한 출구 쪽이면 남은 길 그대로', () => {
  assert.equal(otherExit({goalM: 400, exitM: 30}), true);
  assert.equal(otherExit({goalM: 20, exitM: 20}), false, '정한 출구 근처');
  assert.equal(otherExit({goalM: 400, exitM: 80}), false, '어느 출구에도 안 닿음');
  assert.equal(otherExit({goalM: 400, exitM: null}), false);
  assert.equal(walkLeftS([walkLeg, rideLeg()], 0, 0, 1.2), STATION_ACCESS_S, '남은 길 0 이면 승강장 90초만');
});

test('다른 출구 근처에서 위치가 끊김: 역 150m 밖이어도 출구 50m 안이면 기다리기로 · 출구에서 먼 곳이면 안 넘김', () => {
  const base = {nowMs: 100000, lastFixMs: 100000 - 31000, stationM: 320};
  assert.equal(lostUnderground({...base, exitM: 45}), true, '다른 출구 근처에서 끊김');
  assert.equal(lostUnderground({...base, exitM: 51}), false, '출구에서 51m');
  assert.equal(lostUnderground({...base, exitM: null}), false, '출구 자료 없음 · 역 150m 밖');
  assert.equal(lostUnderground({...base, exitM: 45, lastFixMs: 100000 - 30000}), false, '30초까지는 기다린다');
  assert.equal(lostUnderground({...base, stationM: 140, exitM: 200}), true, '역 150m 규칙은 그대로');
});
