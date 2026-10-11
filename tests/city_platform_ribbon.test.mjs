// 도시 모드(심시티 · 조선 · 롤코) 승강장은 기본 모드처럼 선로를 따라 휜다(2026-10-11 행님: 버티고개에서 곧은 승강장이 휜 상판 밖으로 나감, '기본 베이스에 맞춰져야')
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { CityViaduct, buildPlatform, STRIDE, MAT } from '../web/city/viaduct.mjs';
import SEOUL from '../web/modes/basic/city.mjs';
import { toM } from '../web/city/life.mjs';
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
