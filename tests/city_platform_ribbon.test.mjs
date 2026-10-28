// 도시 모드(심시티 · 조선 · 롤코) 승강장은 기본 모드처럼 선로를 따라 휜다(2026-10-11 행님: 버티고개에서 곧은 승강장이 휜 상판 밖으로 나감, '기본 베이스에 맞춰져야')
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { CityViaduct, buildPlatform, STRIDE, MAT } from '../web/city/viaduct.mts';
import SEOUL from '../web/modes/basic/city.mts';
import { toM } from '../web/city/life.mts';
import { platformRuntime, local, distance } from './platform_endpoints_fixture.mjs';

test('심시티 승강장은 전 역에서 상판 중심선(cityCoords) 위에, 기본 승강장과 같은 길이로', () => {
  const r = platformRuntime(), ctx = r.context, build = simcity => { ctx.simcity = simcity; vm.runInContext('stationRects.clear();buildStationFeatures()', ctx); return new Map(vm.runInContext('[...stationRects]', ctx)) };
  const basic = build(false), city = build(true), deck = {};
  for (const [k, c] of Object.entries(r.raw)) { const p = k.split(':'), hi = p.pop(), lo = p.pop(), line = p.join(':'); for (const id of [lo, hi]) (deck[`${line}:${id}`] ??= []).push(c) }
  const len = c => { let m = 0; for (let i = 1; i < c.length; i++) m += Math.hypot(...local(c[i], c[i - 1])); return m };
  let bad = [];
  for (const [key, rc] of city) {
    const d = deck[key]; if (!d) continue;
    if (Math.abs(len(rc.coords) - len(basic.get(key).coords)) > 1) bad.push(`${key} 길이`);
    if (d.length < 2) continue;   // 끝역: 승강장 반은 선로 끝 너머(기본 모드와 같이 곧게 늘림)
    const far = Math.max(...rc.coords.map(p => Math.min(...d.map(e => distance(p, e)))));
    if (far > .5) bad.push(`${key} ${far.toFixed(1)} m`);
  }
  assert.deepEqual(bad, []);
  assert.ok(city.get('6호선:416').coords.length > 2, '버티고개: 휜 선로를 따라 여러 점');
});

test('고가 승강장 바닥 · 지붕은 휜 rows 를 따라 짓는다(곧은 두 점 rect 는 예전 상자 그대로)', () => {
  const V = SEOUL.viaduct, v = new CityViaduct({ pack: SEOUL, net: {} });
  // 반지름 150 m 의 호 위 승강장
  const c0 = [127, 37.5], [ox, oy] = toM(...c0), arc = [];
  for (let i = 0; i <= 20; i++) { const a = -0.6 + 1.2 * i / 20; arc.push([ox + 150 * Math.sin(a), oy + 150 * (1 - Math.cos(a))]) }
  const ll = ([x, y]) => { const k = 1 / (111320 * Math.cos(37.5 * Math.PI / 180)); return [c0[0] + (x - ox) * k, c0[1] - (y - oy) / 111320] };   // toM 은 y 가 남쪽으로
  const p = v.platGeom({ coords: arc.map(ll), offset: 0, plat: 1 });
  assert.ok(p.rows.length > 10 && Math.abs(p.L - 180) < 3, `호 길이 ${p.L}`);
  const d = buildPlatform(p, 0, V, true);
  // 바닥 꼭짓점의 기준점(x, y)은 모두 rows 위 — 곧은 상자처럼 가운데 한 점에서 뻗지 않는다
  let off = 0; for (let i = 0; i < d.length; i += STRIDE) if (d[i + 17] === MAT.FLOOR) off = Math.max(off, Math.min(...p.rows.map(r => Math.hypot(d[i] - r.x, d[i + 1] - r.y))));
  assert.ok(off < .01, String(off));
  const two = v.platGeom({ coords: [ll(arc[0]), ll(arc[20])], offset: 0, plat: .5 });
  assert.equal(two.rows.length, 2); assert.ok(Math.abs(two.L - Math.hypot(arc[20][0] - arc[0][0], arc[20][1] - arc[0][1]) / 2) < 1);
});

test('끝역: 고가 상판 · 교각을 승강장 끝까지 늘리고, 열차가 쓰는 구간(높이 · 길이)은 그대로', async () => {
  const { MU, MERC_ORIGIN: O } = await import('../web/city/life.mts'), { toLL, STRIDE: ST } = await import('../web/city/viaduct.mts');
  // 노선 X: 1 — 2 — 3 (1 · 3 끝역), 동쪽으로 곧게 200 m 씩. 승강장은 역에서 앞뒤 90 m(기본 모드 리본처럼 끝역에서는 선로 끝 너머로 곧게)
  const at = m => ({ x: O.x + m * MU, y: O.y }), seg = { '1:2': [0, 200], '2:3': [200, 400] };
  const rect = c => ({ coords: [toLL(c - 90, 0), toLL(c, 0), toLL(c + 90, 0)], center: toLL(c, 0), offset: 0, plat: 1 });
  const rects = new Map([['X:1', rect(0)], ['X:2', rect(200)], ['X:3', rect(400)]]);
  const net = { paths: { X: [[1, 2, 3]] }, byId: new Map([[1, {}], [2, {}], [3, {}]]), colors: { X: '#3366aa' }, rects, offset: () => 0,
    geom: (l, lo, hi) => { const [a, b] = seg[`${lo}:${hi}`]; return { pts: [at(a), at(b)] } } };
  const v = new CityViaduct({ pack: SEOUL, net });
  const e12 = v.edgeOf('X', 1, 2), e23 = v.edgeOf('X', 2, 3); v.rowsOf(e12); v.rowsOf(e23);
  const s12 = v.stubsOf(e12), s23 = v.stubsOf(e23);
  assert.deepEqual(s12.map(s => s.end), ['lo']); assert.deepEqual(s23.map(s => s.end), ['hi'], '가운데 역(2) 쪽은 늘리지 않는다');
  assert.ok(Math.abs(s12[0].ext - 90) < .5 && Math.abs(s23[0].ext - 90) < .5, String([s12[0].ext, s23[0].ext]));
  assert.ok(e12.box[0] < -89 && e23.box[2] > 489, '보이는 범위도 늘린 끝까지');
  const xs = d => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < d.length; i += ST) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]) } return [lo, hi] };
  const H = v.profileOf(e12), [x0] = xs(v.deckMesh(e12, e12.rows, false, H)), [, x1] = xs(v.deckMesh(e23, e23.rows, true, v.profileOf(e23)));
  assert.ok(Math.abs(x0 + 90) < .5 && Math.abs(x1 - 490) < .5, `상판 끝 ${x0} · ${x1}`);
  assert.ok(Math.abs(e12.rows.at(-1).s - 200) < 1e-6, '열차가 쓰는 구간 길이 그대로');
  assert.equal(v.heightAt('X', 1, 2, 0), v.stationH('X', 1)); assert.equal(v.heightAt('X', 1, 2, 1), v.stationH('X', 2));
  const sp = v.spots(e12, { inBuilding: () => false }).spots;
  assert.ok(sp.some(s => s < -8 && s > -90) && sp.every(s => s >= -82 && s <= 192), String(sp));
  // 승강장이 바뀌면(모드 · 자료) 렌더가 구간마다 부르는 profileOf 에서 알아채고, 낡은 조각은 다음 프레임 첫머리에 지운다
  rects.set('X:1', { ...rect(0), coords: [toLL(-120, 0), toLL(0, 0), toLL(120, 0)] }); v.frame++; v.profileOf(e12);
  assert.ok(Math.abs(v.stubsOf(e12)[0].ext - 120) < .5); assert.equal(v.staleKeys.length, 3);
  v.levelsOf(); assert.equal(v.staleKeys.length, 3, '같은 프레임(렌더 도중 stationH)에는 안 지운다'); v.frame++; v.levelsOf(); assert.equal(v.staleKeys.length, 0);
  // 렌더 승강장 루프가 levelsDirty 를 켠 프레임에는 층을 다시 세우지 않는다(캐시를 지우면 그 프레임 draw 의 VAO 가 지워진 채 그려짐)
  const ver = v.levelsVersion; v.levelsDirty = true; v.levelsOf(); assert.equal(v.levelsVersion, ver, '같은 프레임: 그대로');
  v.frame++; v.levelsOf(); assert.ok(v.levelsVersion > ver && !v.levelsDirty, '다음 프레임 첫머리에 다시');
  // 롤코: gapFn(coasterGaps)이 heightAt → profileOf 를 부른다 — 끝역 조각이 gaps 를 물으면 끝없이 돈다(2026-10-11 운영 롤코 RangeError)
  v.setGaps((l, lo, hi) => { v.heightAt(l, lo, hi, .5); return lo === 1 ? [[0, .1]] : null });   // 1 쪽 끝은 레일이 고가를 떠남
  e12.prof = null; e23.prof = null;
  const H12 = v.profileOf(e12), H23 = v.profileOf(e23);
  const [g0] = xs(v.deckMesh(e12, e12.rows, false, H12)), [, g1] = xs(v.deckMesh(e23, e23.rows, false, H23));
  assert.ok(g0 > 19 && Math.abs(g1 - 490) < .5, `끊긴 끝(1)은 안 늘리고, 3 쪽은 늘린다: ${g0} · ${g1}`);
  assert.ok(v.spots(e12, { inBuilding: () => false }).spots.every(s => s > 0), '끊긴 끝 밑엔 교각 없음');
});
