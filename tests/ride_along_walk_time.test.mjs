// 타고 가기 걷기 시간을 서버 값에 맞추기(2026-11-28 사용자 「웹을 맞추기」 · lib/ride-along walkAccessS · walkLeftS · walkLeftM · boardWalkS)
// 서버(server/services/journey_graph.py): 걷기 seconds · metres 는 OSRM 표, path 는 따로 다시 잰 선이라 길이가 다르다.
// 땅 위 ↔ 승강장 90초(STATION_ACCESS)는 지하철 ↔ 버스 사이 걷기 · 경유지 역에서 목적지까지 걷기(direct)에만 들어 있다
import test from 'node:test';
import assert from 'node:assert/strict';
import { STATION_ACCESS_S, boardWalkS, pathLength, spliceWalk, walkAccessS, walkLeftM, walkLeftS, walkLengthM, walkOverByTime, walkSub } from '../web/lib/ride-along.mts';

const WEST = [126.9770, 37.5660], MID = [126.97813, 37.5660], EAST = [126.97926, 37.5660];   // 서→동 약 200m(가운데 약 100m)
const ride = (extra = {}) => ({type: 'ride', line: '1호선', from: '서울역', to: '시청', departs: '08:10', arrives: '08:12', direction: '상행', stops: 1, wait: 120, stations: [150, 151], ...extra});
const bus = {type: 'bus', route: '472', from: '서울역', to: '시청', departs: '08:20', arrives: '08:30', toward: '시청', stops: 3, wait: 60, path: [EAST, [126.98, 37.567]]};
// 서울역 1번 출구 예: 서버 96m · 80초(길찾기 카드 「1분 · 100m」) — 그린 길은 약 200m
const toExit = (extra = {}) => ({type: 'walk', seconds: 80, metres: 96, exit: '1', label: '서울역 1번 출구까지', path: [WEST, MID, EAST], ...extra});

test('출발 역 걷기: 서버 seconds 에 승강장 90초가 없다 — 처음엔 길찾기 카드와 같은 분 · 거리', () => {
  const legs = [toExit(), ride()], full = walkLengthM(legs[0]);
  assert.equal(walkAccessS(legs, 0), 0);
  assert.equal(walkLeftS(legs, 0, full), 80);
  assert.equal(walkSub(walkLeftM(legs, 0, full), walkLeftS(legs, 0, full)), '100m · 1분', '길찾기 카드 「1분 · 100m」 와 같다');
});

test('그린 길 길이 ≠ 서버 metres: 남은 몫은 그린 길로 재고 시간 · 거리는 서버 값에 그 몫을 곱한다', () => {
  const legs = [toExit(), ride()], full = walkLengthM(legs[0]);
  assert.ok(Math.abs(full - pathLength(legs[0].path)) < 1e-9 && full > 150, '전체 길이는 그린 길(약 200m — 서버 96m 와 다르다)');
  assert.ok(Math.abs(walkLeftS(legs, 0, full / 2) - 40) < 1e-9, '반 남음 = 80초의 반');
  assert.ok(Math.abs(walkLeftM(legs, 0, full / 2) - 48) < 1e-9, '반 남음 = 96m 의 반');
  assert.equal(walkLeftS(legs, 0, full * 3), 80, '남은 길이 전체보다 길게 잡혀도 서버 seconds 를 넘지 않는다');
  assert.equal(walkLeftS(legs, 0, 0), 0);
});

test('지하철 ↔ 버스 갈아타기 걷기: 서버 seconds 에 90초가 있다 — 걷는 몫만 줄고 90초는 남긴다', () => {
  const transfer = {type: 'walk', seconds: 90 + 120, metres: 144, exit: '3', label: '서울역에서 서울역 정류장으로', path: [WEST, MID, EAST]};
  const legs = [ride(), transfer, bus], full = walkLengthM(transfer);
  assert.equal(walkAccessS(legs, 1), STATION_ACCESS_S);
  assert.equal(walkLeftS(legs, 1, full), 210, '처음엔 서버 seconds 그대로');
  assert.ok(Math.abs(walkLeftS(legs, 1, full / 2) - (60 + 90)) < 1e-9, '걷는 120초의 반 + 90초');
  assert.equal(walkAccessS([bus, transfer, ride()], 1), STATION_ACCESS_S, '버스 → 지하철도 같다');
  assert.equal(boardWalkS([bus, transfer, ride()], 1, 0), STATION_ACCESS_S, '타는 곳까지는 서버가 넣은 90초만 — 두 번 더하지 않는다');
});

test('90초가 없는 걷기: 도착 역 걷기 · 정류장끼리 · 다시 찾은 걷기', () => {
  const end = {type: 'walk', seconds: 250, metres: 300, exit: '2', label: '시청역 2번 출구에서 목적지까지', path: [WEST, EAST]};
  assert.equal(walkAccessS([ride(), end], 1), 0, '도착 역 걷기(OSRM 표)');
  assert.equal(walkAccessS([bus, {...end, label: '시청 정류장에서 서울역 정류장으로'}, bus], 1), 0, '정류장끼리');
  assert.equal(walkAccessS([ride(), {...end, direct: true}], 1), STATION_ACCESS_S, '경유지 역에서 목적지까지 다시 잰 걷기(direct)에는 있다');
  const plan = {arrives: '08:30', minutes: 20, walkMinutes: 4, legs: [ride(), {...end, direct: true, label: '목적지까지 걸어서'}]};
  const again = spliceWalk(plan, 1, {seconds: 200, metres: 240, path: [MID, EAST], exit: '', label: '목적지까지 걸어서', to: null}, {goal: true}, new Date(2026, 10, 28, 8, 20));
  assert.equal(walkAccessS(again.legs, 1), 0, '다시 찾은 걷기(서버 walk=1)는 승강장 시간을 넣지 않는다');
});

test('기다리기 카드 · 시각으로 끝내기: 서버가 안 넣은 승강장 시간만 더한다', () => {
  const legs = [toExit(), ride()];
  assert.equal(boardWalkS(legs, 0, walkLengthM(legs[0])), 80 + STATION_ACCESS_S, '출발 걷기 + 승강장(2026-11-07 결정 그대로)');
  const since = new Date(2026, 10, 28, 8, 20).getTime(), at = (sec) => new Date(since + sec * 1000);
  const via = [ride({arrives: '08:00'}), {type: 'walk', seconds: 90 + 60, metres: 72, direct: true, label: '목적지까지 걸어서', path: [WEST, EAST]}];
  assert.equal(walkOverByTime(via, 1, at(149), '08:05', since), false);
  assert.equal(walkOverByTime(via, 1, at(150), '08:05', since), true, '경유지 역 걷기는 서버 seconds 안에 이미 90초가 있어 더하지 않는다');
  const end = [ride({arrives: '08:00'}), {type: 'walk', seconds: 60, metres: 72, label: '시청역 2번 출구에서 목적지까지', path: [WEST, EAST]}];
  assert.equal(walkOverByTime(end, 1, at(149), '08:05', since), false, '도착 역 걷기는 60 + 90초');
  assert.equal(walkOverByTime(end, 1, at(150), '08:05', since), true);
});
