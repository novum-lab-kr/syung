import test from 'node:test';
import assert from 'node:assert/strict';
import { raceBuilder, building } from '../web/modes/starcraft/race_buildings.mjs';
import { RACE_SHAPES } from '../web/modes/starcraft/race_shapes.mjs';
import { pointInPolygon } from '../web/city/geom.mjs';

// 가짜 타일 짓기(web/city/mesh.mjs TileBuilder 의 쓰는 부분만): 꼭짓점 자리를 모아 윤곽 밖으로 나가는지 본다
function fakeTile(outer, H = 20) {
  const pts = [], W = { n: 0, kind: 0, w: [0, 0, 0, 0], b: [0, 0, 0, 0], m: [0, 0, 0, 0], normal() {}, v(x, y, z) { pts.push([x, y, z]); return this.n++ } };
  const tb = { mPerUnit: 0.5, unit: 1, W, P: { race: { kind: 'terran' } }, extend() {},
    wallsOf(ctx, ring, z0, z1) { for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1], z1]) },
    cap(list, ring, holes, z) { for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1], z]) },
    box(ch, cx, cy, ux, uy, hx, hy, z0, z1) { const vx = -uy, vy = ux; for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push([cx + ux * hx * i + vx * hy * j, cy + uy * hx * i + vy * hy * j, z1]) } };
  const ctx = { outer, holes: [], A: 0, H, minH: 0, T: { key: 'office' }, seed: 12345, chunk: { walls: [], lo: [], hi: [] }, mat: 0, roofSlot: 0, clipped: false, th: null };
  return { tb, ctx, pts };
}
const unit = (h, k) => ((Math.imul(h ^ (k * 2654435761), 2246822519) >>> 8) / 16777216);
// L 자 윤곽(오목): 내접원 밖으로 나가면 윤곽 밖 — 둥근 조각은 내접원 안에 들어야 한다
const L = [0, 0, 80, 0, 80, 30, 30, 30, 30, 80, 0, 80];

test('종족 건물: 둥근 조각 · 상자는 윤곽에 내접하는 원 안에서만(넘치면 줄인다) — 옆 건물과 겹치지 않게', () => {
  const { tb, ctx, pts } = fakeTile(L);
  const B = raceBuilder(tb, ctx, unit);
  assert.ok(B && B.r > 5);
  const n0 = pts.length;
  B.dome(0, 0, B.r * 3, 20, 10); B.frustum(B.r * .5, 0, B.r, 0, 20, 30, { n: 6 }); B.box(0, B.r * .7, B.r, B.r, 20, 22);
  const out = pts.slice(n0).filter(p => !pointInPolygon(p[0], p[1], L, []) && !L.some((v, i) => i % 2 === 0 && Math.hypot(v - p[0], L[i + 1] - p[1]) < 1e-6));
  assert.equal(out.length, 0, `윤곽 밖 꼭짓점 ${out.length}`);
});

test('종족 건물: 세 종족 모양이 여러 크기 · 높이에서 오류 없이 지어진다', () => {
  for (const kind of Object.keys(RACE_SHAPES)) for (const [w, h, H] of [[12, 10, 6], [30, 14, 20], [60, 50, 90], [120, 20, 12]]) {
    const ring = [0, 0, w, 0, w, h, 0, h], { tb, ctx } = fakeTile(ring, H);
    tb.P.race = { kind }; ctx.A = w * h * tb.mPerUnit ** 2;
    assert.doesNotThrow(() => building(tb, ctx, unit), `${kind} ${w}×${h} ${H} m`);
  }
});
