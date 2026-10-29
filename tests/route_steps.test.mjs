// 경로 단계 목록(2026-10-29): 출발 → 걷기 · 승차 · 하차 → 도착 — web/lib/journey-ui.mts routeSteps (길찾기 시트와 승차권이 같이 쓴다)
import test from 'node:test';
import assert from 'node:assert/strict';
import {routeSteps} from '../web/lib/journey-ui.mts';

const colors = {'7호선': '#747f00'};
const ends = {from: '먹골역', to: '위워크 삼성역'};
const train = {type: 'ride', line: '7호선', from: '공릉', to: '청담', departs: '09:00', arrives: '09:25', destination: '석남', stops: 13, wait: 0, realtime: false};
const other = (route, extra = {}) => ({route, color: '#3d5bab', departs: '09:36', arrives: '09:40', ...extra});
const bus = alternatives => ({type: 'bus', route: '3011', color: '#53b332', from: '청담역7번출구', to: '삼성역', departs: '09:35', arrives: '09:39', toward: '삼성', stops: 2, wait: 0, alternatives});
const route = alternatives => [{type: 'walk', seconds: 420, metres: 400, exit: '2'}, train, {type: 'walk', seconds: 480, metres: 485, exit: '7'}, bus(alternatives), {type: 'walk', seconds: 300, metres: 300, exit: ''}];

test('steps run start, walk, board, ride, alight, walk, board, ride, alight, walk, end', () => {
  const steps = routeSteps(route([]), ends, colors);
  assert.deepEqual(steps.map(step => step.kind), ['place', 'walk', 'board', 'ride', 'alight', 'walk', 'board', 'ride', 'alight', 'walk', 'place']);
  assert.equal(steps[0].name, '먹골역'); assert.equal(steps.at(-1).name, '위워크 삼성역');
});

test('walk text names the exit, or the stop after coming out of a station', () => {
  const walks = routeSteps(route([]), ends, colors).filter(step => step.kind === 'walk');
  assert.deepEqual(walks.map(step => step.text), ['공릉역 2번 출구까지 걸어서', '7번 출구로 나와 청담역7번출구 정류장까지 걸어서', '목적지까지 걸어서']);
  assert.deepEqual(walks.map(step => step.detail), ['7분 · 400m', '8분 · 490m', '5분 · 300m']);
});

test('subway board / alight and the ride line', () => {
  const [, , board, ride, alight] = routeSteps(route([]), ends, colors);
  assert.equal(board.name, '공릉역 승차'); assert.equal(alight.name, '청담역 하차');
  assert.equal(ride.chip, '7호선'); assert.equal(ride.toward, '석남 방면'); assert.equal(ride.info, '13개 역 · 25분'); assert.equal(ride.color, '#747f00');
});

test('bus chips: the chosen bus first, a side stop says how far and which stop', () => {
  const side = other('2415', {boardAt: {name: '청담역.경기고교', metres: 60, walkMinutes: 2, exit: '11', ars: '23187'}});
  const ride = routeSteps(route([side, other('3012')]), ends, colors)[7];
  assert.deepEqual(ride.chips.map(chip => chip.route), ['3011', '2415', '3012']);
  assert.equal(ride.chips[1].side, '옆 2분');
  assert.equal(ride.chips[1].detail, '청담역.경기고교 23187 · 걸어서 2분 · 11번 출구 쪽');
  assert.equal(ride.chips[2].side, null);
  assert.equal(ride.info, '2개 정류장 · 4분');
});

test('a bus that gets off at another stop is named on the alight step', () => {
  const down = other('2415', {alightAt: {name: '무역센터', metres: 90}});
  const alight = routeSteps(route([down]), ends, colors)[8];
  assert.equal(alight.name, '삼성역 하차');
  assert.deepEqual(alight.chips.map(chip => [chip.route, chip.where]), [['2415', '무역센터']]);
});

test('times, waiting and live only when asked for (route search); a saved ticket route has none of them', () => {
  const legs = [{...train, wait: 180, realtime: true, trainNow: '공릉 도착'}];
  const plain = routeSteps(legs, ends, colors), timed = routeSteps(legs, ends, colors, {start: '08:55', end: '09:25'});
  assert.equal(plain[0].time, null); assert.equal(plain[1].time, null); assert.equal(plain[2].live, null);
  assert.deepEqual(timed.map(step => step.time), ['08:55', '09:00', undefined, '09:25', '09:25']);
  assert.equal(timed[2].live, '실시간 · 지금 공릉 도착'); assert.equal(timed[2].info, '13개 역 · 25분 · 3분 기다림');
});

test('saved ticket legs have fewer fields: draw what is there, nothing else', () => {
  const saved = [{type: 'walk', seconds: 60, exit: '1'}, {type: 'ride', line: '7호선', from: '공릉', to: '청담', departs: '09:00', arrives: '09:25', wait: 0}, {type: 'walk', seconds: 120}];
  const steps = routeSteps(saved, ends, colors);
  assert.equal(steps[1].text, '공릉역 1번 출구까지 걸어서'); assert.equal(steps[1].detail, '1분');
  assert.equal(steps[3].toward, null); assert.equal(steps[3].info, '25분');
  assert.equal(steps[5].text, '목적지까지 걸어서');
});

test('walks in a row (a via point): the next leg is a walk, so follow the server label instead of guessing a station', () => {
  const legs = [{type: 'walk', seconds: 120, label: '경유지 정류장까지'}, {type: 'walk', seconds: 240, label: '경유지에서 시청역으로'}, train, {type: 'walk', seconds: 60}];
  const steps = routeSteps(legs, ends, colors);
  assert.equal(steps[1].text, '경유지 정류장까지 걸어서');
  assert.equal(steps[2].text, '공릉역까지 걸어서');   // 다음이 지하철이면 그대로 역까지
  assert.equal(routeSteps([{type: 'walk', seconds: 60}, {type: 'walk', seconds: 60}], ends, colors)[1].text, '걸어서 이동');
});
