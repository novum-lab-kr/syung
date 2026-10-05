import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import SNAP from '../web/lib/city_viaduct_snap.mjs';

const shapes = JSON.parse(readFileSync(new URL('../data/osm-tracks/track_shapes.json', import.meta.url), 'utf8'));
const local = (p, origin) => [(p[0] - origin[0]) * 111320 * Math.cos(origin[1] * Math.PI / 180), (p[1] - origin[1]) * 111320];
const turns = coords => {
  const points = [];
  for (const p of coords) if (!points.length || Math.hypot(...local(p, points.at(-1))) >= 1) points.push(p);
  const hits = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = local(points[i - 1], points[i]), b = local(points[i + 1], points[i]);
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    if (la <= 8 || lb <= 8) continue;
    const angle = 180 - Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)))) * 180 / Math.PI;
    if (angle > 50) hits.push({ i, angle });
  }
  return hits;
};

test('발산·구로·화랑대·청량리 구간에 급한 꺾임이 없어요', () => {
  for (const key of ['5호선:366:367', '1호선:226:227', '6호선:425:426', '수인분당선:8:16']) {
    assert.deepEqual(turns(shapes.edges[key]), [], key);
  }
});

test('전체 774개 구간에 두 변 8 m 초과인 50° 초과 꺾임이 없어요', () => {
  assert.equal(Object.keys(shapes.edges).length, 774);
  const remaining = Object.entries(shapes.edges).flatMap(([key, points]) => turns(points).map(t => ({ key, ...t })));
  assert.deepEqual(remaining, []);
});

test('심시티 스냅 결과에도 같은 기준의 급한 꺾임이 없어요', () => {
  const remaining = Object.entries(SNAP).flatMap(([key, points]) => turns(points).map(t => ({ key, ...t })));
  assert.deepEqual(remaining, []);
});

test('스냅 끝에 남는 1 m 미만 구간도 원래 역 좌표에서 끝나요', () => {
  for (const key of ['2호선:14:15', '5호선:365:366']) {
    assert.deepEqual(SNAP[key][0], shapes.edges[key][0], key);
    assert.deepEqual(SNAP[key].at(-1), shapes.edges[key].at(-1), key);
  }
});
