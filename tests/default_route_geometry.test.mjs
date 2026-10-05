import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import SNAP from '../web/lib/city_viaduct_snap.mjs';

const source = readFileSync(new URL('../web/maplibre_runtime.mjs', import.meta.url), 'utf8');
const slice = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `${start} 구현을 찾았어요`);
  return source.slice(a, b);
};
const shapes = JSON.parse(readFileSync(new URL('../data/osm-tracks/track_shapes.json', import.meta.url), 'utf8')).edges;

function runtime({ simcity = false, coaster = false, line, lo, hi }) {
  class MercatorCoordinate {
    constructor(x, y) { this.x = x; this.y = y; }
    static fromLngLat(c) { return new this(...c); }
    toLngLat() { return { toArray: () => [this.x, this.y] }; }
  }
  const base = shapes[`${line}:${lo}:${hi}`];
  const coasterGeometry = { pts: [new MercatorCoordinate(1, 2), new MercatorCoordinate(3, 4)], total: 10 };
  const context = vm.createContext({ simcity, coaster, Map, Math,
    paths: { [line]: [[lo, hi]] }, byId: new Map([[lo, { id: lo }], [hi, { id: hi }]]),
    colors: { [line]: '#123456' }, edgeOffset: () => 0,
    cityViaduct: { snapped: (l, a, b) => SNAP[`${l}:${a}:${b}`] || null },
    edgeCoords: () => base, coasterPath: () => coasterGeometry,
    maplibregl: { MercatorCoordinate },
  });
  vm.runInContext([
    slice('function buildLineFeatures()', '// 롤러코스터: the trains only'),
    slice('function metresBetween(', 'function neighbours('),
    slice('function rideCoords(', 'function showRoute('),
  ].join('\n'), context);
  return {
    coords: vm.runInContext(`cityCoords(${JSON.stringify(line)},${lo},${hi})`, context),
    geom: vm.runInContext(`geom(${JSON.stringify(line)},${hi},${lo})`, context),
    line: vm.runInContext('buildLineFeatures()[0].geometry.coordinates', context),
    platform: vm.runInContext(`trackFrom(${JSON.stringify(line)},{id:${lo}},{id:${hi}},1e9)`, context),
    ride: vm.runInContext(`rideCoords(${JSON.stringify(line)},[${hi},${lo}])`, context),
    base, coasterGeometry,
  };
}
const plain = value => JSON.parse(JSON.stringify(value));

for (const simcity of [false, true]) {
  for (const [line, lo, hi, snapped] of [['6호선', 425, 426, true], ['5호선', 366, 367, false]]) {
    test(`${simcity ? '심시티' : '기본'} 모드의 노선·열차·승강장·여정이 ${snapped ? '스냅' : '선로'} 경로를 함께 써요`, () => {
      const r = runtime({ simcity, line, lo, hi });
      assert.equal(Boolean(SNAP[`${line}:${lo}:${hi}`]), snapped);
      const expected = snapped ? SNAP[`${line}:${lo}:${hi}`] : r.base;
      for (const coords of [r.coords, r.line, r.platform]) assert.deepEqual(plain(coords), expected);
      assert.deepEqual(plain(r.geom.pts.map(p => [p.x, p.y])), expected);
      assert.deepEqual(plain(r.ride), [...expected].reverse());
    });
  }
}

test('롤코 모드는 스냅이 있어도 기존 열차·노선 경로와 선로 기준 승강장·여정을 유지해요', () => {
  const r = runtime({ coaster: true, line: '6호선', lo: 425, hi: 426 });
  assert.equal(r.geom, r.coasterGeometry);
  assert.deepEqual(plain(r.line), [[1, 2], [3, 4]]);
  for (const coords of [r.coords, r.platform]) assert.deepEqual(plain(coords), r.base);
  assert.deepEqual(plain(r.ride), [...r.base].reverse());
});
