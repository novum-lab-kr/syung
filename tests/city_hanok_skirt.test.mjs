// 조선 고층 처마 조각 인스턴스: 템플릿 범위와 기록(32바이트) 형식
import test from 'node:test';
import assert from 'node:assert/strict';
import { skirtTemplate, skirtInst, skirtGroups } from '../web/modes/joseon/hanok.mjs';
import { INST_STRIDES } from '../web/city/mesh.mts';

test('템플릿: 먼 사각형 하나, 격자, 끝 두께가 이어진 범위', () => {
  const T = skirtTemplate([0, .55, 1]);
  assert.equal(T.verts.length / 3, 9 + 6);
  assert.deepEqual(T.lo, [0, 6]);
  assert.deepEqual(T.grid, [6, 24]);
  assert.deepEqual(T.edge, [30, 12]);
  assert.equal(T.idx.length, 42);
  for (const i of T.idx) assert.ok(i < 15);
});

test('기록: 32바이트, 길이 · 끝 거리 · 들림 · 색', () => {
  const r = skirtInst([.25, .5], 12.3, 1, 8, 4, [2.11, 2.11, 1.5, .35], .75, .4, 1.9, 2);
  assert.equal(r.byteLength, INST_STRIDES.skirt);
  const b = new Uint8Array(r.buffer);
  assert.deepEqual([...r.slice(0, 6)].map(v => +v.toFixed(3)), [.25, .5, 12.3, 1, 8, 4]);
  assert.deepEqual([...b.slice(24)], [211, 211, 150, 35, 75, 40, 190, 2]);
});

test('지붕 무리: 모서리 둘 사이에 가운데 지붕들, 좁은 면은 하나', () => {
  const G = { widthM: 9, gapM: 2.2, minM: 4.5, cornerK: .24, cornerM: [4, 7.5] };
  assert.deepEqual(skirtGroups(8, G), [[0, 8]]);
  const g = skirtGroups(48, G);
  assert.equal(g[0][0], 0); assert.equal(g[g.length - 1][1], 48);
  for (let i = 1; i < g.length; i++) assert.ok(g[i][0] - g[i - 1][1] > 2.1);
});
