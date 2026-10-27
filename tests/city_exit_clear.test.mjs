import test from 'node:test';
import assert from 'node:assert/strict';
import {clearSpot, EXIT_CLEAR} from '../web/city/life.mts';

// 지하철 출구 표지가 건물과 겹치지 않게(덕배 2026-10-15): 건물 안 · 벽 가까이 찍힌 출구는 가장 가까운 바깥으로
const box = (x0, y0, x1, y1) => (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

test('an exit inside a building moves just past its nearest wall, with the clearance', () => {
  const inB = box(0, 0, 20, 40);   // 20 × 40 m 건물, 출구는 동쪽 벽에서 2 m 안
  const [x, y] = clearSpot(18, 20, inB);
  assert.ok(!inB(x, y, EXIT_CLEAR.wallM), `바깥으로 (${x}, ${y})`);
  assert.ok(x >= 20 + EXIT_CLEAR.wallM && x < 20 + EXIT_CLEAR.wallM + 1.5 && Math.abs(y - 20) < 1e-9, '가까운 동쪽 벽 너머로, 옆으로 새지 않고');
});

test('an exit already clear stays put; one hemmed in past the limit stays put too', () => {
  const inB = box(0, 0, 20, 40);
  assert.deepEqual(clearSpot(30, 20, inB), [30, 20]);
  const everywhere = () => true;
  assert.deepEqual(clearSpot(5, 5, everywhere), [5, 5], '못 찾으면 원래 자리');
});

test('an exit in the gap between two buildings goes out of the gap, not into the other building', () => {
  const two = (x, y, m) => box(0, 0, 10, 30)(x, y, m) || box(12, 0, 22, 30)(x, y, m);   // 2 m 틈
  const [x, y] = clearSpot(11, 2, two);
  assert.ok(!two(x, y, EXIT_CLEAR.wallM) && y < 0, `틈 밖(남쪽)으로 (${x.toFixed(1)}, ${y.toFixed(1)})`);
});

// 옮긴 출구가 고가(조선은 수로) 상판 밑에 숨지 않게(2026-10-15 조선 종각 9 · 10번): deckProbe 로 상판 둘레를 피한다
test('the deck probe marks the strip under a viaduct, and an exit pushed off a building skips it', async () => {
  const {CityViaduct, toLL} = await import('../web/city/viaduct.mts');
  const pt = (x, y) => { const [lon, lat] = toLL(x, y); const mx = lon / 360 + .5, my = .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI); return {x: mx, y: my} };
  const byId = new Map([1, 2].map(id => [id, {id}]));
  const v = new CityViaduct({net: {paths: {L: [[1, 2]]}, byId, geom: () => ({pts: [pt(0, 0), pt(200, 0)]}), offset: () => 0, bodyPx: () => 26, rects: new Map()}});
  const deck = v.deckProbe(100, 10, 30);
  assert.ok(deck(100, 0) && deck(100, 3), '상판 가운데 · 가장자리 안');
  assert.ok(!deck(100, 25), '상판에서 먼 곳');
  const inB = box(90, 10, 110, 40);   // 상판 바로 북쪽 건물(남쪽 벽이 상판에서 10 m)
  const [x, y] = clearSpot(100, 12, (px, py, m) => inB(px, py, m) || deck(px, py, m));
  assert.ok(!inB(x, y, EXIT_CLEAR.wallM) && !deck(x, y, EXIT_CLEAR.wallM), `건물도 상판도 아닌 곳 (${x.toFixed(1)}, ${y.toFixed(1)})`);
  assert.equal(new CityViaduct({net: {}}).deckProbe(0, 0, 10), null, '노선이 아직 없으면 묻지 않는다');
});
