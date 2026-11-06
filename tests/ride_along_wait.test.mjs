// 타고 가기 기다리기 카드 — 승강장 도착 · 열차 도착 · 지하에서 위치가 끊겨 기다리기로(계획서 2026-11-06 「기다리기 카드」)
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOST_FIX_MS, LOST_NEAR_M, lostUnderground, pickedArrived, waitText } from '../web/lib/ride-along.mts';

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
