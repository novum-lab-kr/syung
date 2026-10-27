import test from 'node:test';
import assert from 'node:assert/strict';
import { CityViaduct, toLL, ribbonRows } from '../web/city/viaduct.mjs';
import { edgeOverlaps, edgeProfile, levelHeight } from '../web/city/viaduct_levels.mts';
import { MU, MERC_ORIGIN as O } from '../web/city/life.mts';
import SEOUL from '../web/modes/basic/city.mjs';

const Lv = SEOUL.viaduct.levels, step = Lv.stepM;
const merc = (x, y) => ({ x: O.x + x * MU, y: O.y + y * MU });   // local metres → mercator, as the runtime's geometry
// a little network: line 6호선 west–east through station 1 (x −1500) and 2 (x +1500); line 7호선 south–north through 3 and 4,
// crossing it at (cx, 0); platforms 80 m long, rectangles (rects) laid along each line at the stations
function net(cx = 0, yStations = [-1500, 1500]) {
  const paths = { '6호선': [[1, 2]], '7호선': [[3, 4]] }, P = { 1: [-1500, 0], 2: [1500, 0], 3: [cx, yStations[0]], 4: [cx, yStations[1]] };
  const rects = new Map(); const rect = (line, id, dx, dy) => { const [x, y] = P[id]; rects.set(`${line}:${id}`, { coords: [toLL(x - dx * 90, y - dy * 90), toLL(x + dx * 90, y + dy * 90)], offset: 0, plat: .45 }) };
  rect('6호선', 1, 1, 0); rect('6호선', 2, 1, 0); rect('7호선', 3, 0, 1); rect('7호선', 4, 0, 1);
  const geom = (line, lo, hi) => { const a = P[lo], b = P[hi], pts = []; for (let k = 0; k <= 20; k++) pts.push(merc(a[0] + (b[0] - a[0]) * k / 20, a[1] + (b[1] - a[1]) * k / 20)); return { pts } };
  return { paths, byId: new Map([1, 2, 3, 4].map(i => [i, {}])), colors: {}, geom, offset: () => 0, rects, exits: {}, bodyPx: () => 26 };
}
test('two decks crossing between stations are a level apart at the crossing, both platforms stay on the ground level', () => {
  const v = new CityViaduct({ net: net() }); v.levelsOf();
  assert.ok(v.regions.length >= 1, 'the crossing is found'); assert.equal(v.sameLevel.length, 0, 'no crossing left at one level');
  const h6 = v.heightAt('6호선', 1, 2, .5), h7 = v.heightAt('7호선', 3, 4, .5);
  assert.ok(h7 - h6 >= step - .3, `7호선 (the later line) goes over 6호선 at the crossing: ${h7.toFixed(1)} vs ${h6.toFixed(1)}`);
  for (const [line, id] of [['6호선', 1], ['6호선', 2], ['7호선', 3], ['7호선', 4]]) assert.ok(Math.abs(v.stationH(line, id) - v.railFor(line)) < 1e-9, 'platforms unchanged at ' + line + ':' + id);
  const f = v.profileOf(v.edgeOf('7호선', 3, 4)); let maxGrade = 0; const rows = v.rowsOf(v.edgeOf('7호선', 3, 4)), total = rows[rows.length - 1].s;
  for (let s = 0; s < total - 2; s += 2) maxGrade = Math.max(maxGrade, Math.abs(f(s + 2) - f(s)) / 2);
  assert.ok(maxGrade <= (Lv.humpGrade ?? Lv.grade) * 1.55, 'the hump ramps gently: ' + maxGrade.toFixed(3));
  assert.equal(v.debugCrossings().humps.length, 1); assert.equal(v.debugCrossings().sameLevel.length, 0);
});
test('a crossing right next to a platform raises that station instead of squeezing a ramp in', () => {
  const v = new CityViaduct({ net: net(0, [-150, 2000]) }); v.levelsOf();   // station 3 only 150 m south of the crossing
  assert.equal(v.sameLevel.length, 0);
  assert.ok(v.levelOf('7호선', 3) >= 2, '7호선 station 3 raised'); assert.equal(v.levelOf('7호선', 4), 1, 'the far station stays down');
  assert.ok(v.heightAt('7호선', 3, 4, 0) - v.railFor('7호선') >= step - 1e-6, 'the platform itself is a level up');
  assert.equal(v.levelOf('6호선', 1), 1); assert.equal(v.levelOf('6호선', 2), 1);
});
test('overlap regions and hump profiles are found and shaped as expected; the same input gives the same levels', () => {
  const A = { id: 'a', line: 'x', rows: ribbonRows([[0, 0], [1000, 0]]) }, B = { id: 'b', line: 'y', rows: ribbonRows([[500, -600], [500, 600]]) }, C = { id: 'c', line: 'y', rows: ribbonRows([[0, 300], [1000, 300]]) };
  for (const e of [A, B, C]) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const r of e.rows) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x); y1 = Math.max(y1, r.y) } e.box = [x0, y0, x1, y1] }
  const R = edgeOverlaps([A, B, C], 24); assert.equal(R.length, 1, 'only the real crossing (the parallel line 300 m off is no overlap)');
  assert.ok(Math.abs((R[0].sa0 + R[0].sa1) / 2 - 500) < 10 && Math.abs((R[0].sb0 + R[0].sb1) / 2 - 600) < 10);
  const base = levelHeight(1), f = edgeProfile(base, base, 1000, 40, 40, SEOUL, [{ s0: 480, s1: 520, h: base + step }]);
  assert.ok(Math.abs(f(500) - base - step) < 1e-9 && Math.abs(f(0) - base) < 1e-9 && Math.abs(f(1000) - base) < 1e-9 && f(400) > base && f(400) < base + step);
  const v1 = new CityViaduct({ net: net() }), v2 = new CityViaduct({ net: net() }); v1.levelsOf(); v2.levelsOf();
  assert.deepEqual([...v1.levels], [...v2.levels]); assert.deepEqual(v1.debugCrossings().humps, v2.debugCrossings().humps);
});
