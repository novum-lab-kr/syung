import test from 'node:test';
import assert from 'node:assert/strict';
import { assignLevels, stationLevels, holdLevels, edgeProfile, levelHeight, compareLines, segmentDistance } from '../web/lib/city_viaduct_levels.mjs';
import { CityViaduct, densify, ribbonRows } from '../web/lib/city_viaduct.mjs';
import SEOUL from '../web/lib/city_style_seoul.mjs';

const V = SEOUL.viaduct, Lv = V.levels;
test('lines in a fixed order: numbered by number, the rest by name after them', () => {
  assert.deepEqual(['공항철도', '9호선', 'GTX-A', '1호선', '경의중앙선'].sort(compareLines), ['1호선', '9호선', 'GTX-A', '경의중앙선', '공항철도']);
});
test('crossing platforms take different levels; ones apart share the lowest (약수·충무로 shapes, 서울역 with five lines)', () => {
  const L = assignLevels([{ line: '6호선', seg: [[-100, 0], [100, 0]] }, { line: '3호선', seg: [[0, -100], [0, 100]] }], Lv.overlapM);
  assert.equal(L.get('3호선'), 1); assert.equal(L.get('6호선'), 2);
  const S = assignLevels([{ line: '1호선', seg: [[0, -150], [0, 150]] }, { line: '4호선', seg: [[-150, 20], [150, -20]] }, { line: '경의중앙선', seg: [[8, -150], [8, 150]] }, { line: '공항철도', seg: [[-300, -40], [-60, -40]] }, { line: 'GTX-A', seg: [[-120, -200], [-100, 100]] }], Lv.overlapM);
  assert.equal(S.get('1호선'), 1); assert.equal(S.get('4호선'), 2); assert.equal(S.get('경의중앙선'), 3, 'parallel to 1호선 and across 4호선');
  assert.equal(S.get('GTX-A'), 1, 'crosses only 4호선: shares the ground level with 1호선'); assert.equal(S.get('공항철도'), 2, 'well west of 1호선: shares 4호선\'s level');
  assert.ok(Math.max(...S.values()) <= 3, 'five lines, three levels');
  assert.equal(segmentDistance([0, 0], [10, 0], [5, -5], [5, 5]), 0); assert.ok(Math.abs(segmentDistance([0, 0], [10, 0], [0, 7], [10, 7]) - 7) < 1e-9);
  const same = assignLevels([{ line: '2호선', seg: [[0, 0], [100, 0]] }, { line: '8호선', seg: [[50, -80], [50, 80]] }], Lv.overlapM);
  assert.deepEqual([...assignLevels([{ line: '8호선', seg: [[50, -80], [50, 80]] }, { line: '2호선', seg: [[0, 0], [100, 0]] }], Lv.overlapM)].sort(), [...same].sort(), 'the same whatever the order given');
});
test('station levels from the rectangles, and a raised line holds its level over single stations close by', () => {
  const toM = (lon, lat) => [lon, lat], rects = new Map([
    ['3호선:71', { coords: [[0, -100], [0, 100]] }], ['6호선:71', { coords: [[-100, 0], [100, 0]] }],
    ['6호선:72', { coords: [[400, 0], [600, 0]] }], ['6호선:73', { coords: [[900, 0], [1100, 0]] }], ['5호선:73', { coords: [[1000, -100], [1000, 100]] }], ['6호선:74', { coords: [[1500, 0], [1700, 0]] }]]);
  const lv = stationLevels(rects, toM, Lv.overlapM);
  assert.equal(lv.get('6호선:71'), 2); assert.equal(lv.get('6호선:72'), 1); assert.equal(lv.get('6호선:73'), 2); assert.equal(lv.get('5호선:73'), 1);
  const single = id => !['71', '73'].includes(String(id));
  holdLevels(lv, { '6호선': [[71, 72, 73, 74]] }, () => 500, Lv.holdM, single);
  assert.equal(lv.get('6호선:72'), 2, 'the single station between two raised ones keeps the level (1 km of track)');
  assert.equal(lv.get('6호선:74'), 1, 'after the last raised station the line comes down');
  const far = stationLevels(rects, toM, Lv.overlapM); holdLevels(far, { '6호선': [[71, 72, 73, 74]] }, () => 2000, Lv.holdM, single);
  assert.equal(far.get('6호선:72'), 1, 'too far apart: it dips between');
});
test('the ramp between levels is gentle, flat through both platforms and next to the higher station', () => {
  const h1 = levelHeight(1), h2 = levelHeight(2), h = edgeProfile(h1, h2, 1200, 80, 80);
  assert.ok(h1 % 1 !== 0, 'the rail height is not a whole metre (a whole one shared the plane of same-height roofs: depth fighting)');
  assert.equal(h(0), h1); assert.equal(h(110), h1); assert.equal(h(1200), h2); assert.equal(h(1090), h2);
  let maxGrade = 0; for (let s = 0; s < 1200; s += 2) maxGrade = Math.max(maxGrade, Math.abs(h(s + 2) - h(s)) / 2);
  assert.ok(maxGrade <= Lv.grade * 1.55 && maxGrade > Lv.grade, 'eased ramp: peak grade 1.5× the average, under 3.1 %');
  assert.ok(h(700) < h1 + .1 && h(1000) > h1 + 3, 'the ramp lies next to the raised station');
  const down = edgeProfile(18, 11, 1200, 80, 80); assert.equal(down(0), 18); assert.ok(down(300) < 17 && down(400) > 11.5, 'and the other way too'); assert.equal(down(600), 11);
  const short = edgeProfile(11, 18, 300, 80, 80); assert.equal(short(0), 11); assert.equal(short(300), 18); assert.ok(short(150) > 11 && short(150) < 18, 'a short edge ramps over what it has');
  assert.equal(edgeProfile(h1, h1, 500, 80, 80)(250), h1);
  const rows = densify(ribbonRows([[0, 0], [100, 0], [100, 300]]), 12); assert.ok(rows.length >= 30); for (let i = 1; i < rows.length; i++) assert.ok(rows[i].s - rows[i - 1].s <= 12 + 1e-9);
});
test('the viaduct lifts the trains to the station level and along the ramp (heightAt), the same for both travel directions', () => {
  const MU = 1 / (40075016.685578488 * Math.cos(37.5665 * Math.PI / 180));
  const pt = (x, y) => ({ x: 0.5 + x * MU, y: 0.5 + y * MU }), toLL = (x, y) => [x, y];
  const rects = new Map([['3호선:1', { coords: [[0, -90], [0, 90]], plat: .6 }], ['6호선:1', { coords: [[-90, 0], [90, 0]], plat: .6 }], ['6호선:2', { coords: [[1400, -90], [1400, 90]], plat: .6 }]]);
  const net = { paths: { '6호선': [[1, 2]], '3호선': [[1]] }, byId: new Map([[1, {}], [2, {}]]), colors: {}, geom: () => ({ pts: [pt(0, 0), pt(700, 0), pt(1400, 0)] }), offset: () => 0, rects };
  const v = new CityViaduct({ net });
  // toM in city_life maps lon/lat; here the rects are in a made-up frame — override the level computation through the public API
  v.levels = new Map([['3호선:1', 1], ['6호선:1', 2], ['6호선:2', 1]]); v.levelRects = rects; v.levelCount = rects.size; v.levelsVersion = 1;
  const base = v.railFor('6호선');
  assert.ok(Math.abs(v.stationH('6호선', 1) - (base + Lv.stepM)) < 1e-9); assert.ok(Math.abs(v.stationH('6호선', 2) - base) < 1e-9);
  assert.ok(Math.abs(v.heightAt('6호선', 1, 2, 0) - (base + Lv.stepM)) < 1e-9, 'leaving the raised station');
  assert.ok(Math.abs(v.heightAt('6호선', 1, 2, 1) - base) < 1e-9, 'arriving at the ground level one');
  assert.ok(Math.abs(v.heightAt('6호선', 2, 1, 0) - base) < 1e-9 && Math.abs(v.heightAt('6호선', 2, 1, 1) - (base + Lv.stepM)) < 1e-9, 'the other way round');
  const mid = v.heightAt('6호선', 1, 2, .1); assert.ok(mid < base + Lv.stepM + 1e-9 && mid >= base, 'on the way: between');
  assert.ok(Math.abs(v.heightAt('6호선', 1, 2, .3) - v.heightAt('6호선', 2, 1, .7)) < 1e-9, 'the same point, the same height');
  assert.equal(v.snapped('9호선', 1, 2), null);
});
