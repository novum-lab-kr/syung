import test from 'node:test';
import assert from 'node:assert/strict';
import { CityViaduct, trainMetrics, deckWidths, ribbonRows, rowAt, pierSpots, elevatedAt, routeOpacityExpr, buildDeck, buildPiers, buildPlatform, STRIDE, MAT } from '../web/city/viaduct.mjs';
import FLAGS from '../web/city/viaduct_flags.mjs';
import SEOUL from '../web/lib/city_style_seoul.mjs';

const V = SEOUL.viaduct;
test('shared map picking projects elevated points in CSS pixels without map.transform',()=>{
  const matrix=[1,0,0,0,0,1,0,0,0,.5,1,0,0,0,0,1];
  const map={painter:{transform:{getProjectionDataForCustomLayer:()=>({mainMatrix:matrix})}},getCanvas:()=>({clientWidth:390,clientHeight:800,width:780,height:1600})};
  const v=new CityViaduct();assert.deepEqual(v.screen(map,0,0,0),{x:195,y:400});
  assert.deepEqual(v.screen(map,0,0,1),{x:195,y:200});
});
const finite = d => { for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) return false; return true };
const mats = d => { const s = new Set(); for (let i = 17; i < d.length; i += STRIDE) s.add(d[i]); return s };

test('the deck carries the whole train envelope where cars drive, and is slimmer zoomed out', () => {
  const body = 20, { lanePx } = trainMetrics(17, body);
  assert.equal(lanePx, body / 2 + V.train.laneGapPx);
  const w17 = deckWidths(17, body), w14 = deckWidths(14, body);
  assert.ok(w17.lane + w17.body / 2 + V.marginPx >= lanePx + body / 2, 'at z17 the deck edge is past the outer train side');
  assert.ok(w14.lane + w14.body / 2 < w17.lane + w17.body / 2, 'zoomed out the deck is slimmer than the trains');
  assert.equal(w14.lane, V.lowZoomLanePx);
});

test('ribbon rows keep the width through a bend (mitre) and measure the distance along', () => {
  const rows = ribbonRows([[0, 0], [100, 0], [100, 100]]);
  assert.equal(rows.length, 3);
  assert.ok(Math.abs(Math.hypot(rows[0].rx, rows[0].ry) - 1) < 1e-9 && Math.abs(Math.hypot(rows[2].rx, rows[2].ry) - 1) < 1e-9, 'straight rows: unit across');
  assert.ok(Math.abs(Math.hypot(rows[1].rx, rows[1].ry) - Math.SQRT2) < 1e-6, 'the corner row is mitred by 1/cos 45°');
  assert.deepEqual(rows.map(r => r.s), [0, 100, 200]);
  const q = rowAt(rows, 150); assert.ok(Math.abs(q.x - 100) < 1e-9 && Math.abs(q.y - 50) < 1e-9 && Math.abs(q.fy - 1) < 1e-9);
  assert.equal(ribbonRows([[0, 0], [0, 0], [50, 0]]).length, 2, 'a repeated point makes no row');
});

test('piers step off a building along the track and leave a hole where the tile is not known', () => {
  const ok = s => (s >= 50 && s <= 70) ? false : (s >= 100 && s <= 145) ? undefined : true;   // a building; a tile not come yet (wider than the search)
  const { spots, unknown } = pierSpots(300, 28, 12, 0, ok);
  assert.ok(spots.length >= 8);
  for (const s of spots) assert.notEqual(ok(s), false, 'no pier inside the building');
  assert.ok(spots.some(s => s > 70 && s < 85) || spots.some(s => s > 40 && s < 50), 'the pier that fell in the building moved along');
  assert.equal(unknown, true, 'a spot in the unknown tile is left open'); assert.ok(!spots.some(s => s >= 100 && s <= 145), 'and no pier guessed there');
  assert.equal(pierSpots(300, 28, 12, 0, () => true).unknown, false);
  assert.equal(pierSpots(300, 28, 12, 0, () => false).spots.length, 0, 'all buildings: no piers at all');
});

test('real bridge stretches: the flags carry 2호선 and the lookup reads them', () => {
  assert.ok(Object.keys(FLAGS).filter(k => k.startsWith('2호선:')).length >= 10);
  for (const r of Object.values(FLAGS)) for (const [a, b] of r) assert.ok(a >= 0 && b <= 1 && a < b);
  assert.equal(elevatedAt([[.2, .4]], .3), true); assert.equal(elevatedAt([[.2, .4]], .5), false); assert.equal(elevatedAt(null, .3), false);
});

test('deck, pier and platform meshes are finite, whole and use the right materials', () => {
  const rows = ribbonRows([[0, 0], [120, 0], [240, 60], [400, 60]]);
  const base = buildDeck(rows, 2.5, V, [[.5, 1]], false), det = buildDeck(rows, 2.5, V, null, true);
  assert.equal(base.length % STRIDE, 0); assert.ok(finite(base) && finite(det));
  assert.deepEqual([...mats(base)].sort(), [MAT.TOP, MAT.SIDE, MAT.UNDER, MAT.PARAPET].sort()); assert.deepEqual([...mats(det)].sort(), [MAT.BED, MAT.RAIL].sort());
  const shades = new Set(); for (let i = 17; i < base.length; i += STRIDE) if (base[i] === MAT.TOP) shades.add(base[i + 1]);
  assert.ok(shades.has(1) && [...shades].some(x => Math.abs(x - V.elevatedConcreteK) < 1e-6), 'the real bridge half is a shade darker, the rest plain (float32)');
  const piers = buildPiers(rows, pierSpots(400, 28, 12, .3, () => true).spots, 2.5, V, null);
  assert.ok(piers.length > 0 && piers.length % STRIDE === 0 && finite(piers)); assert.deepEqual([...mats(piers)], [MAT.PIER]);
  const p = { row: { x: 0, y: 0, fx: 1, fy: 0, rx: 0, ry: 1 }, L: 160 }, plat = buildPlatform(p, 0, V, true);
  assert.ok(plat.length % STRIDE === 0 && finite(plat)); for (const m of [MAT.FLOOR, MAT.ROOF, MAT.ROOF_UNDER, MAT.FASCIA, MAT.POST]) assert.ok(mats(plat).has(m), 'platform has ' + m);
  assert.ok(!mats(buildPlatform(p, 0, V, false)).has(MAT.POST), 'no posts zoomed out');
});

test('the ground route line fades out as the deck takes over', () => {
  const e = routeOpacityExpr(false); assert.equal(e[0], 'interpolate'); assert.equal(e[3], V.lod.deck[0]); assert.equal(e[5], V.lod.deck[1]); assert.equal(e[6], 0);
  assert.equal(routeOpacityExpr(true)[4], .25);
});
