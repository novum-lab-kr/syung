import test from 'node:test';
import assert from 'node:assert/strict';
import { stairProfile, stairHeightAt, layoutExits, buildExits, exitSamples } from '../web/city/viaduct_exits.mts';
import { STRIDE, MAT, platformEdgeM } from '../web/city/viaduct.mts';
import SEOUL from '../web/modes/basic/city.mjs';

const V = SEOUL.viaduct, X = V.exits, P = { L: 160, H: 190, eoM: 0, Wfar: 23.4, W: 11.4, W2: 10.9, top: 11.3 };
const mats = d => { const s = new Set(); for (let i = 17; i < d.length; i += STRIDE) s.add(d[i]); return s };
const finite = d => { for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) return false; return true };

test('a stair comes down in flights with landings, from the platform floor to the ground', () => {
  const p = stairProfile(11.3, X.stair);
  assert.equal(p.segs.filter(g => g.flight).length, Math.ceil(11.3 / X.stair.landingDropM)); assert.equal(p.segs.filter(g => !g.flight).length, p.segs.filter(g => g.flight).length - 1);
  assert.ok(Math.abs(stairHeightAt(p, 0) - 11.3) < 1e-9 && Math.abs(stairHeightAt(p, p.run)) < 1e-9);
  for (let s = 0; s < p.run; s += .5) assert.ok(stairHeightAt(p, s + .5) <= stairHeightAt(p, s) + 1e-9, 'never climbs back');
  const steep = stairProfile(25.3, X.stair); assert.ok(steep.run > p.run, 'a higher level: a longer stair'); assert.equal(steep.segs.filter(g => !g.flight).length, Math.ceil(25.3 / X.stair.landingDropM) - 1);
  assert.ok(platformEdgeM(16, 13.2) > platformEdgeM(18, 28), 'the px-sized platform is wider in metres zoomed out');
});
test('every exit gets a stair: along the deck when near, a bridge and stair straight out when far, a side walkway past the platform end', () => {
  const exits = [{ ref: '1', t: 40, u: 30 }, { ref: '2', t: -60, u: -28 }, { ref: '3', t: 10, u: -70 }, { ref: '4', t: 230, u: 26 }];
  const lay = layoutExits(P, exits, V, () => true);
  assert.equal(lay.unknown, false); assert.equal(lay.items.filter(i => i.skip).length, 0);
  const [a, b, c, d] = lay.items;
  assert.equal(a.far, false); assert.equal(a.T.u, null, 'hung off the platform edge'); assert.ok(a.T.t < a.foot.t && Math.abs(a.foot.t - a.T.t - lay.run) < 1e-9, 'comes down heading out from the middle');
  assert.equal(b.d, -1); assert.ok(b.T.t > b.foot.t, 'the other side, the other way');
  assert.equal(c.far, true); assert.ok(c.bridge && Math.abs(c.bridge.u1 - (c.foot.u + lay.run)) < 1e-9, 'the bridge ends where the stair starts, a run short of the exit'); assert.equal(c.walk, null);
  assert.ok(d.walk && d.walk.t0 === P.L / 2 && Math.abs(d.walk.t1 - d.T.t) < 1e-9, 'a walkway from the platform end along the deck to the stair'); assert.ok(d.posts.length >= 5, 'posts under the walkway');
  assert.equal(layoutExits(P, [{ ref: 'x', t: 900, u: 20 }], V, () => true).items[0].skip, 'far', 'an exit too far from the station gets nothing');
});
test('nothing passes through a building or another deck; a blocked exit is turned the other way, else listed', () => {
  const wall = (t, u) => !(t > 20 && t < 38 && u > 22 && u < 40);   // a building beside the platform, between its middle and exit 1 (where the stair would come down)
  const lay = layoutExits(P, [{ ref: '1', t: 40, u: 30 }], V, wall);
  assert.equal(lay.items[0].skip, undefined); assert.equal(lay.items[0].sg, -1, 'the stair turned the other way, toward the middle');
  const box = (t, u) => !(Math.abs(t - 40) < 60 && u > 15 && u < 60);
  const out = layoutExits(P, [{ ref: '1', t: 40, u: 30 }], V, box); assert.equal(out.items[0].skip, 'blocked', 'walled in: no stair, listed');
  const open = layoutExits(P, [{ ref: '1', t: 40, u: 30 }], V, (t, u) => (t > 25 ? undefined : true)); assert.equal(open.items[0].skip, 'unknown'); assert.equal(open.unknown, true, 'a tile still missing: built again later');
  const other = layoutExits(P, [{ ref: '1', t: 40, u: 30 }], V, () => true, (t, u, h) => t > 0 && t < 30 && h < 16);   // another line's deck across, lower
  assert.equal(other.items[0].sg, -1, 'turned away from the other deck');
  const foot = layoutExits(P, [{ ref: '1', t: 40, u: 30 }], V, (t, u) => !(t > 38 && u > 28));   // the exit itself sits at a building's edge
  assert.equal(foot.items[0].skip, undefined); assert.ok(foot.items[0].foot.t < 40 || foot.items[0].foot.u < 30, 'the stair pulled back onto clear ground');
});
test('the exits mesh is finite and uses the stair, walkway, roof, fascia and post materials; steps only in detail', () => {
  const exits = [{ ref: '1', t: 40, u: 30 }, { ref: '3', t: 10, u: -70 }, { ref: '4', t: 230, u: 26 }], r = { x: 0, y: 0, rx: 0, ry: 1, fx: 1, fy: 0 };
  const lay = layoutExits(P, exits, V, () => true); lay.top = P.top;
  const base = buildExits(lay, r, 0, V, false), det = buildExits(lay, r, 0, V, true);
  assert.ok(finite(base) && finite(det) && base.length % STRIDE === 0 && det.length > base.length);
  for (const m of [MAT.STAIR, MAT.STAIR_WALL, MAT.ROOF, MAT.ROOF_UNDER, MAT.FASCIA, MAT.POST, MAT.WALK, MAT.WALK_WALL, MAT.PIER]) assert.ok(mats(base).has(m), 'material ' + m);
  const samples = exitSamples(lay, P, V); assert.ok(samples.some(s => s.part === 'stair') && samples.some(s => s.part === 'bridge') && samples.some(s => s.part === 'walk'));
  for (const s of samples) assert.ok(s.h >= -1e-9 && s.h <= P.top + 1e-9);
  // anchored vertices carry the platform edge's px parts; the exit's foot is a pure metre point
  let anchored = 0, pure = 0; for (let i = 0; i < base.length; i += STRIDE) { if (base[i + 7] !== 0 || base[i + 9] !== 0) anchored++; else pure++ } assert.ok(anchored > 0 && pure > 0);
});
