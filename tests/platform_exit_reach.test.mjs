import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { closestPlatformPoint } from '../web/lib/platform_route.mjs';

// 출구가 승강장 한쪽 끝 밖에 몰린 역(stopReach): 그 끝을 늘린 통로에 출구가 붙어, 더 가까운 다른 노선 막대 끝으로 가지 않아요.
const source = readFileSync(new URL('../web/maplibre_runtime.mjs', import.meta.url), 'utf8');
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const EXIT = [.4999975, .5000008];

function renderExits(reach) {
  const start = source.indexOf('class StationNameLayer{');
  const end = source.indexOf('// Exit pillars (zoom 16+)', start);
  const gl = new Proxy({}, { get(_, key) { return /^[A-Z_0-9]+$/.test(key) ? key : () => {}; } });
  const exitCol = new Map();
  const context = vm.createContext({ Map, Float32Array, Math, coaster: false, selected: 'all', stationAlpha: 1,
    stationWidthPx: () => 12, platformPx: () => 12, PLATFORM_SCALE: 1, EXIT_MINZOOM: 16, EXIT_MAX_M: 600,
    exits: { 1: [[...EXIT, '2']] }, exitCol, colors: { A: '#ff0000', B: '#0000ff' }, hexRGB3: c => c === '#ff0000' ? [1, 0, 0] : [0, 0, 1],
    closestPlatformPoint, platformStroke: () => ({ vertices: [], length: 0 }),
    stationRects: new Map([
      // A: 동서 막대(160 m 남짓), 통로 끝은 서쪽으로 늘림 · B: 북서쪽 다른 노선 막대
      ['A:1', { coords: [[.5, .5], [.500004, .5]], center: [.500002, .5], offset: 0, reach }],
      ['B:1', { coords: [[.499994, .500002], [.499998, .500002]], center: [.499996, .500002], offset: 0, reach: null }],
    ]),
    map: { getZoom: () => 17, getCenter: () => [.5, .5],
      getBounds: () => ({ getSouthWest: () => [.49, .51], getNorthEast: () => [.51, .49] }),
      project: p => ({ x: p[0], y: p[1] }) },
    maplibregl: { MercatorCoordinate: { fromLngLat: p => ({ x: p[0], y: p[1] }) } },
    matchMedia: () => ({ matches: false }), document: { documentElement: { dataset: { theme: 'light' } } } });
  vm.runInContext(source.slice(start, end) + ';globalThis.Layer=StationNameLayer;', context);
  const layer = new context.Layer();
  layer.buildAtlas = () => {};
  layer.attr = Object.fromEntries(['a_px', 'a_local', 'a_size', 'a_uv', 'a_color', 'a_tw'].map(x => [x, x]));
  layer.uni = {};
  layer.render(gl, { defaultProjectionData: { mainMatrix: matrix } });
  return exitCol.get(EXIT[0] + ',' + EXIT[1]);
}

test('통로 끝(stopReach)이 없으면 출구는 가장 가까운 막대 끝(다른 노선)에 붙어요', () => {
  assert.deepEqual(renderExits(null), [0, 0, 1]);
});

test('출구가 한쪽 끝 밖에 몰린 노선은 그 끝을 늘린 통로로 출구를 가져와요', () => {
  assert.deepEqual(renderExits([.499997, .5]), [1, 0, 0]);
});

test('신길 1호선은 1·2번 출구 쪽(서쪽) 끝을 늘린 통로 끝이 있어요', () => {
  const ts = JSON.parse(readFileSync(new URL('../data/osm-tracks/track_shapes.json', import.meta.url), 'utf8'));
  const reach = ts.stopReach?.['1호선:133'];
  assert.ok(reach, '1호선:133 stopReach');
  const exits = JSON.parse(readFileSync(new URL('../data/osm-tracks/exits.json', import.meta.url), 'utf8'))['133'];
  const local = (p, c) => [(p[0] - c[0]) * 111320 * Math.cos(c[1] * Math.PI / 180), (p[1] - c[1]) * 111320];
  const c = ts.stops['1호선:133'], [rx, ry] = local(reach, c), rl = Math.hypot(rx, ry);
  for (const ref of ['1', '2']) {
    const e = exits.find(x => String(x[2]) === ref), [ex, ey] = local(e, c), t = (ex * rx + ey * ry) / rl;
    assert.ok(t > ts.platformHalf['1호선:133'] && t <= rl + 1, `${ref}번 출구는 막대 끝 밖, 통로 안`);
    assert.ok(Math.abs(-ex * ry / rl + ey * rx / rl) < 40, `${ref}번 출구는 통로 옆 40 m 안`);
  }
});
