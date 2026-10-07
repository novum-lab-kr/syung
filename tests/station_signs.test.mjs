import test from 'node:test';
import assert from 'node:assert/strict';
import {lineChip, sortLines, signRows, placeholderText, chipInk, perspectiveRatio} from '../web/lib/station_signs.mjs';

test('환승역 이름표 하나: 번호 노선은 번호만, 번호 순서대로 먼저', () => {
  assert.deepEqual(sortLines(['7호선', '6호선']), ['6호선', '7호선']);
  assert.deepEqual(sortLines(['4호선', '공항철도', 'GTX-A', '1호선', '경의중앙선']), ['1호선', '4호선', '공항철도', 'GTX-A', '경의중앙선']);
  assert.deepEqual(['6호선', '인천1호선', '신분당선', '공항철도', 'GTX-A', '김포골드라인'].map(lineChip), ['6', '인천1', '신분당', '공항', 'GTX-A', '김포골드']);
  const rows = signRows({text: '태릉입구', ln: '6호선|7호선', lc: '#CD7C2F|#747F00'});
  assert.deepEqual(rows, {chips: [{text: '6', color: '#CD7C2F'}, {text: '7', color: '#747F00'}], name: '태릉입구'});
  assert.match(placeholderText(['6호선', '7호선'], '태릉입구'), /6.*7.*태릉입구$/);
});

test('칩 글자색 · 원근 비율은 출구 번호 · MapLibre 심볼과 같은 기준', () => {
  assert.equal(chipInk('#00A84D'), '#ffffff');
  assert.equal(chipInk('#FFD400'), '#141414');
  assert.equal(perspectiveRatio(100, 100), 1);
  assert.equal(perspectiveRatio(100, 10), 4);
});
