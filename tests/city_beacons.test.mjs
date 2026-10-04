import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBeacon, beaconCandidates, beaconHeight, badgeLayout, buildBeaconPost } from '../web/lib/city_beacons.mjs';
import { STRIDE, MAT } from '../web/lib/city_viaduct_mesh.mjs';
import SEOUL from '../web/lib/city_style_seoul.mjs';

const B = SEOUL.beacon;
test('the post stands beside the platform on clear ground, on the roof when there is none, and waits for missing tiles', () => {
  const c = beaconCandidates(20, 0); assert.equal(c.length, B.alongM.length * 2); assert.ok(c.every(q => Math.abs(Math.abs(q.u) - 20 - B.offsetM) < 1e-9), 'past the platform edge by offsetM');
  assert.deepEqual(placeBeacon(c, (t, u) => u < 0), { t: 0, u: -(20 + B.offsetM), onRoof: false, partial: false }, 'the other side when one side is built over');
  const roof = placeBeacon(c, () => false); assert.equal(roof.onRoof, true); assert.equal(roof.u, null);
  assert.equal(placeBeacon(c, (t, u) => (u > 0 ? undefined : true)).partial, true, 'a tile still missing: built again later');
});
test('taller than the buildings around, never lower than minM over the roof, capped', () => {
  assert.equal(beaconHeight(0, 16), B.minM); assert.equal(beaconHeight(45, 16), 45 + B.marginM);
  assert.equal(beaconHeight(300, 16), B.maxM, 'a tower next door does not make an 300 m beacon'); assert.equal(beaconHeight(0, 30), Math.max(B.minM, 30 + B.minAboveM));
});
test('badges: one column up to perColumn, then side by side; the post mesh is whole with the line band', () => {
  const one = badgeLayout(1), five = badgeLayout(5);
  assert.deepEqual(one, [[0, B.badgePx / 2]]); assert.equal(new Set(five.map(p => p[0])).size, 2, 'five lines: two columns');
  assert.ok(Math.max(...five.map(p => p[1])) < B.perColumn * (B.badgePx + B.badgeGapPx), 'never taller than a full column');
  const d = buildBeaconPost({ x: 0, y: 0, rx: 0, ry: 1, fx: 1, fy: 0 }, { t: 0, u: 25 }, 0, 0, 60);
  assert.equal(d.length % STRIDE, 0); const mats = new Set(); let top = -1; for (let i = 0; i < d.length; i += STRIDE) { mats.add(d[i + 17]); top = Math.max(top, d[i + 2]); assert.ok(Number.isFinite(d[i + 2])) }
  assert.deepEqual([...mats].sort(), [MAT.POST, MAT.FASCIA].sort()); assert.equal(top, 60);
});
