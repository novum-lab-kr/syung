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
