// 같은 구간 다른 버스 안내 한 줄(2026-10-29): '143 · 2415 · 301 중 먼저 오는 버스' — web/lib/journey-ui.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import {sameRoutes} from '../web/lib/journey-ui.mts';

const other = route => ({route, color: '#3d5bab', departs: '09:07', arrives: '09:11'});
const bus = (route, alternatives) => ({type: 'bus', route, color: '#3d5bab', departs: '09:05', arrives: '09:11', wait: 0, alternatives});

test('lists the chosen bus first, then the others', () => {
  assert.equal(sameRoutes([{type: 'walk', seconds: 60}, bus('143', [other('2415'), other('301')])]), '143 · 2415 · 301 중 먼저 오는 버스');
});
test('one line per bus leg that has others; none when no leg does', () => {
  assert.equal(sameRoutes([bus('143', [other('2415')]), bus('9', []), bus('7', [other('8')])]), '143 · 2415 중 먼저 오는 버스 / 7 · 8 중 먼저 오는 버스');
  assert.equal(sameRoutes([bus('143'), {type: 'walk', seconds: 60}]), null);
});

// 갈아탈 때 출구 안내(2026-10-29): '청담역 11번 출구 옆 정류장에서 2415'
import {exitHints} from '../web/lib/journey-ui.mts';
const ride = (from, to) => ({type: 'ride', line: '7호선', from, to});
test('exit hints for subway to bus and bus to subway', () => {
  assert.deepEqual(exitHints([ride('먹골', '청담'), {type: 'walk', seconds: 90, exit: '11'}, bus('2415')]), ['청담역 11번 출구 옆 정류장에서 2415']);
  assert.deepEqual(exitHints([bus('143'), {type: 'walk', seconds: 90, exit: '3'}, ride('대치', '삼성')]), ['대치역 3번 출구로']);
});
test('no hint without an exit number, or for the first and last walk', () => {
  assert.deepEqual(exitHints([ride('먹골', '청담'), {type: 'walk', seconds: 90, exit: ''}, bus('2415')]), []);
  assert.deepEqual(exitHints([{type: 'walk', seconds: 60, exit: '2'}, ride('먹골', '청담'), {type: 'walk', seconds: 60, exit: '11'}]), []);
});

test('side-stop buses say which stop and which exit', () => {
  const side = {...other('2415'), boardAt: {name: '청담역.경기고교', metres: 60, exit: '11'}};
  assert.equal(sameRoutes([bus('143', [side])]), '143 · 2415 중 먼저 오는 버스 (2415 는 옆 정류장 청담역.경기고교(60m · 11번 출구 쪽)에서 타요)');
  const down = {...other('2415'), alightAt: {name: '무역센터', metres: 90}};
  assert.equal(sameRoutes([bus('143', [down])]), '143 · 2415 중 먼저 오는 버스 (2415 는 옆 정류장 무역센터(90m)에서 내려요)');
});
