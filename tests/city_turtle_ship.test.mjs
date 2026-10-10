import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShip, buildBoat, buildFlag, lineLabel, hullHalf, gunwale } from '../web/modes/joseon/turtle_ship.mjs';
import JOSEON from '../web/lib/city_style_joseon.mjs';
import SEOUL from '../web/lib/city_style_seoul.mjs';

test('거북선 메시: 단계마다 유한한 꼭짓점, 자세할수록 많고, 삼각형 단위', () => {
  const n = [0, 1, 2].map(l => { const d = buildShip(l); assert.ok(d.every(Number.isFinite)); assert.equal(d.length % 27, 0); return d.length / 9 });
  assert.ok(n[0] < n[1] && n[1] < n[2]);
});
test('거북선 몸통: 가운데가 가장 넓고(반폭 .5) 이물 · 고물은 뭉툭, 뱃전은 끝으로 높아진다', () => {
  assert.ok(Math.abs(hullHalf(.5) - .5) < 1e-9);
  assert.ok(hullHalf(0) >= .2 && hullHalf(1) >= .2 && hullHalf(0) < .5);
  assert.ok(gunwale(0) > gunwale(.5) && gunwale(1) > gunwale(.5));
});
test('조선 팩의 수로: 고가 치수는 서울 팩 그대로(지은 조각을 다시 쓴다), 물 색 · 돌 색만 다르다', () => {
  for (const k of ['railHeightM', 'deckThicknessM', 'parapetHeightM', 'marginPx', 'lowZoomLanePx', 'lowZoomBodyPx']) assert.equal(JOSEON.viaduct[k], SEOUL.viaduct[k]);
  assert.deepEqual(JOSEON.viaduct.levels, SEOUL.viaduct.levels);
  assert.ok(JOSEON.viaduct.aqueduct?.water?.light && !SEOUL.viaduct.aqueduct);
  assert.notEqual(JOSEON.viaduct.colors.light.concrete, SEOUL.viaduct.colors.light.concrete);
  assert.ok(JOSEON.train.coaster88, '서울 팩의 88열차 설정은 그대로 이어받는다');
});
test('배 선단: 일반 배 · 깃발 메시도 유한하고 삼각형 단위, 깃발 글자는 번호선 번호 · 이름선 두 글자', () => {
  for (const d of [buildBoat(0), buildBoat(2), buildFlag()]) { assert.ok(d.every(Number.isFinite)); assert.equal(d.length % 27, 0) }
  assert.ok(buildBoat(2).length < buildShip(2).length, '일반 배는 거북선보다 가볍다');
  assert.equal(lineLabel('2호선'), '2'); assert.equal(lineLabel('경의중앙선'), '경의'); assert.equal(lineLabel('GTX-A'), 'A'); assert.equal(lineLabel('신분당선'), '신분');
});
