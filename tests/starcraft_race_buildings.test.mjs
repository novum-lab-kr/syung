import test from 'node:test';
import assert from 'node:assert/strict';
import { fitRect, modelBuilder, pickModel, building } from '../web/modes/starcraft/race_buildings.mjs';
import { BUILDING_MODELS } from '../web/modes/starcraft/building_models.mjs';
import { pointInPolygon } from '../web/city/geom.mjs';

// 가짜 타일 짓기(web/city/mesh.mjs TileBuilder 의 쓰는 부분만): 꼭짓점 자리를 모아 윤곽 밖으로 나가는지 본다
function fakeTile(outer, H = 20, kind = 'terran') {
  const pts = [], W = { n: 0, kind: 0, w: [0, 0, 0, 0], b: [0, 0, 0, 0], m: [0, 0, 0, 0], normal() {}, v(x, y, z) { pts.push([x, y, z]); return this.n++ } };
  const tb = { mPerUnit: 0.5, unit: 1, W, P: { race: { kind } }, extend() {},
    wallsOf(ctx, ring, z0, z1) { for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1], z1, 'base']) },
    cap(list, ring, holes, z) { for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1], z, 'base']) } };
  const ctx = { outer, holes: [], A: 0, H, minH: 0, T: { key: 'office' }, seed: 12345, chunk: { walls: [], lo: [], hi: [] }, mat: 0, roofSlot: 0, clipped: false, th: null };
  return { tb, ctx, pts };
}
const unit = (h, k) => ((Math.imul(h ^ (k * 2654435761), 2246822519) >>> 8) / 16777216);
const L = [0, 0, 80, 0, 80, 30, 30, 30, 30, 80, 0, 80];   // L 자(오목)
const inside = (ring, p) => pointInPolygon(p[0], p[1], ring, []) || ring.some((v, i) => i % 2 === 0 && Math.abs(v - p[0]) < 1e-6 && Math.abs(ring[i + 1] - p[1]) < 1e-6);

test('종족 건물: 모형을 세우는 직사각형은 윤곽 안(오목한 L 자도)', () => {
  const r = fitRect(L, []);
  assert.ok(r && r.hx >= r.hy && r.hy > 5);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) assert.ok(pointInPolygon(r.cx + r.ux * r.hx * a - r.uy * r.hy * b, r.cy + r.uy * r.hx * a + r.ux * r.hy * b, L, []));
});

test('종족 건물: 모든 모형이 여러 땅 · 높이에서 윤곽 안에만 짓는다(옆 건물과 겹치지 않게)', () => {
  for (const kind of Object.keys(BUILDING_MODELS)) for (const [ring, H] of [[[0, 0, 40, 0, 40, 30, 0, 30], 8], [[0, 0, 160, 0, 160, 40, 0, 40], 12], [L, 20], [[0, 0, 30, 0, 30, 30, 0, 30], 80]]) {
    const { tb, ctx, pts } = fakeTile(ring, H, kind); ctx.A = 400;
    assert.doesNotThrow(() => building(tb, ctx, unit), `${kind} H ${H}`);
    const out = pts.filter(p => !inside(ring, p));
    assert.equal(out.length, 0, `${kind} ${ring.length / 2}각 H ${H}: 윤곽 밖 ${out.length}`);
  }
});

test('종족 건물: 원작처럼 낮게 — 높은 빌딩 자리도 낮은 모형(tall 없음)', () => {
  for (const [kind, list] of Object.entries(BUILDING_MODELS)) {
    assert.ok(list.length >= 8 && list.every(m => !m.fit?.tall), kind);
    assert.ok(pickModel(list, { area: 900, aspect: 1.2, tall: false, r: .5 }));
  }
});

test('종족 건물: 서울을 대표하는 건물 자리(race.keep)는 스타 건물로 바꾸지 않는다(보통 건물로)', () => {
  const ring = [100, 100, 140, 100, 140, 130, 100, 130], { tb, ctx } = fakeTile(ring, 60);
  ctx.A = 300; Object.assign(tb, { E: 4096, ox: 0.5, oy: 0.5, unit: 1e-7 });
  const lng = (0.5 + 120e-7 - .5) * 360, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (0.5 + 115e-7)))) * 180 / Math.PI;   // 윤곽 가운데 점
  tb.P.race = { kind: 'terran', keep: [[lng, lat, 10]] };
  assert.equal(building(tb, ctx, unit), false);
  const far = fakeTile(ring, 60); far.ctx.A = 300; Object.assign(far.tb, { E: 4096, ox: 0.5, oy: 0.5, unit: 1e-7 }); far.tb.P.race = { kind: 'terran', keep: [[lng + 1, lat, 10]] };
  assert.equal(building(far.tb, far.ctx, unit), true);
});
