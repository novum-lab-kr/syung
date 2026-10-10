// city-build: the mesh builder on synthetic tiles — footprints over one another never share a plane, and a building the
// viaduct passes through carries its level in the vertex bytes (web/lib/city_mesh.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TileBuilder, resolvePack, OVERLAP, STRIDE, KIND, INST_STRIDES } from '../web/lib/city_mesh.mjs';
import { SEOUL_CITY_STYLE } from '../web/lib/city_style_seoul.mjs';

const P = resolvePack(SEOUL_CITY_STYLE), Z = 14, TX = 13975, TY = 6346, E = 4096, N = 2 ** Z;
const UPM = E * N / (40075016.685578488 * Math.cos(37.54 * Math.PI / 180));   // tile units a metre here
const square = (cx, cy, half) => [{ x: cx - half, y: cy - half }, { x: cx + half, y: cy - half }, { x: cx + half, y: cy + half }, { x: cx - half, y: cy + half }, { x: cx - half, y: cy - half }];   // clockwise in tile space = exterior
const layer = feats => ({ length: feats.length, extent: E, feature: i => ({ id: feats[i].id, properties: feats[i].props, loadGeometry: () => feats[i].rings }) });
const build = (feats, opts = {}) => { const tb = new TileBuilder({ z: Z, x: TX, y: TY, extent: E, buildings: layer(feats), landuse: null }, P, opts); while (!tb.step(1e9)); return tb };
const lngLat = (x, y) => [((TX + x / E) / N) * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * (TY + y / E) / N))) * 180 / Math.PI];
const bbox = r => { let x0 = 1e9, x1 = -1e9; for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]) } return [x0, x1] };

test('a same-height footprint wholly inside another is dropped (a duplicate, not a second roof in the same plane)', () => {
  const tb = build([{ id: 1, props: { render_height: 12 }, rings: [square(2000, 2000, 20 * UPM)] }, { id: 2, props: { render_height: 12 }, rings: [square(2000, 2000, 14 * UPM)] }]);
  const kept = tb.items.filter(it => !it.drop);
  assert.equal(tb.items.length, 2); assert.equal(kept.length, 1); assert.equal(kept[0].idLo, 1);
  assert.equal(tb.result().count, 1);
});

test('a footprint inside a taller one is pulled in, so their shared wall planes never fight', () => {
  const tb = build([{ id: 1, props: { render_height: 10 }, rings: [square(2000, 2000, 20 * UPM)] }, { id: 2, props: { render_height: 30 }, rings: [square(1995, 2000, 10 * UPM)] }]);
  const inner = tb.items.find(it => it.idLo === 2), [x0, x1] = bbox(inner.outer), want = 20 * UPM - 2 * OVERLAP.insetM * UPM;
  assert.equal(inner.depth, 1); assert.ok(!inner.drop); assert.equal(inner.H, 30);
  assert.ok(Math.abs((x1 - x0) - want) < .02 * UPM, `inset width ${(x1 - x0) / UPM} m, want ${want / UPM}`);
  const outer = tb.items.find(it => it.idLo === 1); assert.ok(!outer.depth && !outer.lower, 'the container is left alone');
});

test('two same-height footprints overlapping in part: the smaller is lowered, both stay', () => {
  const tb = build([{ id: 1, props: { render_height: 9 }, rings: [square(2000, 2000, 15 * UPM)] }, { id: 2, props: { render_height: 9 }, rings: [square(2000 + 22 * UPM, 2000, 14 * UPM)] }]);
  const kept = tb.items.filter(it => !it.drop); assert.equal(kept.length, 2);
  const low = kept.find(it => it.lower), high = kept.find(it => !it.lower); assert.ok(low && high);
  assert.ok(Math.abs(low.H - (9 - OVERLAP.lowerM)) < 1e-9); assert.equal(high.H, 9);
  assert.ok(!low.depth, 'a partial overlap is not an inset');
});

test('a building the viaduct passes through opens only the walls its path crosses; the hall pieces carry the rail height', () => {
  const [lng, lat] = lngLat(2000, 2000), path = [lngLat(2000 - 60 * UPM, 2000), lngLat(2000 + 60 * UPM, 2000)], through = new Map([[7, [{ lng, lat, railM: 18, path }]]]);
  const feats = [{ id: 7, props: { render_height: 40 }, rings: [square(2000, 2000, 30 * UPM)] }, { id: 8, props: { render_height: 40 }, rings: [square(2300, 2300, 15 * UPM)] }];   // 60 m square: the walls across the path are crossed, the walls along it lie 30 m off (past alongsideM)
  const m = build(feats, { through }).result(), u8 = m.verts, i8 = new Int8Array(u8.buffer, u8.byteOffset), nv = u8.byteLength / STRIDE;
  const codes = new Set(), seeds = new Set(); let hall = 0, hallRail = new Set();
  for (let v = 0; v < nv; v++) { const o = v * STRIDE, kind = i8[o + 15], rq = ((u8[o + 26] >> 6) & 3) * 16 + (u8[o + 27] >> 4), seed = u8[o + 24] + u8[o + 25] * 256; if (kind === 6) { hall++; hallRail.add(10 + rq * .25); continue } if (kind !== 0) continue; codes.add((u8[o + 26] >> 6) & 3); seeds.add(seed) }
  assert.deepEqual([...codes], [0], 'plain walls carry no rail code in a_bld.z');
  assert.equal(seeds.size, 2);
  assert.equal(hall, 8, 'two portal pieces (24 m of each 60 m wall the path crosses), four vertices each; the walls along the path, 30 m off, stay walls'); assert.deepEqual([...hallRail], [18], 'the hall pieces carry the rail height');
  const noPath = build(feats, { through: new Map([[7, [{ lng, lat, railM: 18 }]]]) }).result(); let h2 = 0; for (let v = 0; v < noPath.verts.byteLength / STRIDE; v++) if (new Int8Array(noPath.verts.buffer, noPath.verts.byteOffset)[v * STRIDE + 15] === 6) h2++; assert.equal(h2, 0, 'no path, no portal');
  const none = build(feats).result(); for (let v = 0; v < none.verts.byteLength / STRIDE; v++) assert.equal((none.verts[v * STRIDE + 26] >> 6) & 3, 0);
});

test('간판: 상가 건물에만, 휴대폰에서는 창 간판 없이 줄어든다', () => {
  const signVerts = (props, opts) => {
    const hx = 10 * UPM, hy = 6 * UPM, ring = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([i, j]) => ({ x: 2000 + i * hx, y: 2000 + j * hy })), r = build([{ id: 1, props, rings: [ring] }], opts).result(), dv = new DataView(r.verts.buffer, r.verts.byteOffset, r.verts.byteLength);
    let n = 0; for (let o = 0; o < r.verts.byteLength; o += STRIDE) if (dv.getInt8(o + 15) === KIND.SIGN) n++; return n;
  };
  const shop = signVerts({ render_height: 20, class: 'commercial' }), phone = signVerts({ render_height: 20, class: 'commercial' }, { phone: true });
  assert.ok(shop > 0, 'a shop gets signs'); assert.ok(phone > 0 && phone < shop, `phone ${phone} < ${shop}`);
  assert.equal(signVerts({ render_height: 12 }), 0, 'a house gets none');
});

// 조선 모드 (web/lib/city_hanok.mjs): the Joseon pack builds every footprint as 기와집
test('조선: 낮은 건물은 초가 · 기와집, 높은 건물은 높이 그대로 한옥 고층, 큰 땅은 담장 두른 단지 — 모든 면이 바깥을 향한다', async () => {
  const { JOSEON_CITY_STYLE } = await import('../web/lib/city_style_joseon.mjs');
  const { hanokLayout, houseWings } = await import('../web/lib/city_hanok.mjs');
  const J = resolvePack(JOSEON_CITY_STYLE), K = J.hanok;
  const rect = (cx, cy, hx, hy) => [{ x: cx - hx, y: cy - hy }, { x: cx + hx, y: cy - hy }, { x: cx + hx, y: cy + hy }, { x: cx - hx, y: cy + hy }, { x: cx - hx, y: cy - hy }];
  const run = feats => { const tb = new TileBuilder({ z: Z, x: TX, y: TY, extent: E, buildings: layer(feats), landuse: null }, J, {}); while (!tb.step(1e9)); return tb.result() };
  const kinds = r => { const i8 = new Int8Array(r.verts.buffer, r.verts.byteOffset), c = {}; for (let v = 0; v < r.verts.byteLength / STRIDE; v++) { const k = i8[v * STRIDE + 15]; c[k] = (c[k] || 0) + 1 } return c };
  assert.equal(hanokLayout(12, 8, K).houses.length, 1); assert.equal(hanokLayout(12, 8, K).wall, null);
  const big = hanokLayout(80, 50, K); assert.ok(big.houses.length >= 4, `${big.houses.length} houses`); assert.ok(big.wall);
  // plans: a deep lot can take wings (ㄱ, ㄷ, ㅁ); every wing stays inside the lot
  const plans = new Set(); for (let i = 0; i < 40; i++) { const w = houseWings(16, 14, K, k => ((i * 7919 + k * 104729) % 1000) / 1000, false); plans.add(w.length); for (const h of w) { const [hx, hy] = h.turn ? [h.hd, h.hl] : [h.hl, h.hd]; assert.ok(Math.abs(h.x) + hx <= 8.01 && Math.abs(h.y) + hy <= 7.01) } }
  assert.ok(plans.size >= 3, `plans with ${[...plans]} wings`);
  const low = run([{ id: 1, props: { render_height: 6 }, rings: [rect(2000, 2000, 6 * UPM, 4 * UPM)] }]), kl = kinds(low);
  const insts = (m, kind) => m.inst[kind].byteLength / INST_STRIDES[kind];   // 지붕 · 벽은 인스턴스(city_hanok.mjs roofInst · boxInst)
  assert.ok(insts(low, 'roof') && insts(low, 'box') && !kl[KIND.WALL], JSON.stringify(kl)); assert.ok(low.zmax < 9, `a low house (ridge ${low.zmax.toFixed(1)} m)`);
  const tall = run([{ id: 4, props: { render_height: 40 }, rings: [rect(2000, 2000, 14 * UPM, 9 * UPM)] }]);
  assert.ok(tall.zmax > 36 && tall.zmax < 46, `a 40 m building keeps its height (${tall.zmax.toFixed(1)} m)`); assert.ok(insts(tall, 'roof') > 0 && insts(tall, 'skirt') > 0);
  const r = run([{ id: 2, props: { render_height: 8 }, rings: [rect(1000, 1000, 40 * UPM, 25 * UPM)] }]), kr = kinds(r); assert.ok(kr[KIND.DAM] > 0 || kr[12] > 0, '담장 or 돌담');
  // winding: every triangle faces along its vertices' normal (the culled side is the inside)
  for (const m of [low, tall, r]) {
    const f = new Float32Array(m.verts.buffer, m.verts.byteOffset, m.verts.byteLength / 4), i8 = new Int8Array(m.verts.buffer, m.verts.byteOffset), p = i => [f[i * 8] * N * E / UPM, f[i * 8 + 1] * N * E / UPM, f[i * 8 + 2]];
    let bad = 0; for (let t = 0; t < m.idx.length; t += 3) { const [A, B, C] = [0, 1, 2].map(j => p(m.idx[t + j])), u = B.map((v, j) => v - A[j]), w = C.map((v, j) => v - A[j]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], o = m.idx[t] * STRIDE; if (n[0] * i8[o + 12] + n[1] * i8[o + 13] + n[2] * i8[o + 14] < 0) bad++ }
    assert.equal(bad, 0, 'triangles wound against their normal');
  }
});

test('조선: 타일 경계에 걸친 건물의 집은 중심이 든 타일 한 곳에서만 그린다', async () => {
  const { JOSEON_CITY_STYLE } = await import('../web/lib/city_style_joseon.mjs');
  const H0 = JOSEON_CITY_STYLE.hanok, J = resolvePack({ ...JOSEON_CITY_STYLE, hanok: { ...H0, emptyShare: 0, compound: { ...H0.compound, stoneShare: 0 }, thatch: { ...H0.thatch, byLanduse: { unknown: 0 } } } }), half = 30 * UPM;   // nothing left to chance (open yards, 돌담, 초가): the whole block's seed (its own lowest vertex) differs from the cut halves'
  // the same 60 × 40 m block in two neighbouring tiles' coordinates (straddling x = E), as both tiles hold it
  const ring = ox => [{ x: E - half + ox, y: 2000 - 20 * UPM }, { x: E + half + ox, y: 2000 - 20 * UPM }, { x: E + half + ox, y: 2000 + 20 * UPM }, { x: E - half + ox, y: 2000 + 20 * UPM }, { x: E - half + ox, y: 2000 - 20 * UPM }];
  const roofs = (x, ox) => { const tb = new TileBuilder({ z: Z, x, y: TY, extent: E, buildings: layer([{ id: 3, props: { render_height: 6 }, rings: [ring(ox)] }]), landuse: null }, J, {}); while (!tb.step(1e9)); return tb.result().inst.box.byteLength / INST_STRIDES.box };   // 집마다 벽 상자 하나(인스턴스)
  const a = roofs(TX, 0), b = roofs(TX + 1, -E), whole = roofs(TX, -E / 2);
  assert.ok(a > 0 && b > 0, `both tiles draw some (${a}, ${b})`); assert.equal(a + b, whole, 'together exactly the houses of the whole block');
});
