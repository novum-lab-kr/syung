import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the production TrainLayer without a DOM or a second browser. Only the
// map/GL boundary and input track are fixtures; the generated mesh is real.
const src = readFileSync(new URL('../web/maplibre_runtime.mjs', import.meta.url), 'utf8');
const layerSource = src.slice(src.indexOf('function trainLanePoint('), src.indexOf('// ---- bottom sheet:'));
const widths = src.slice(src.indexOf('const bodyWidthPx='), src.indexOf('const destLabel='));
const mu = 1 / (40075016.686 * Math.cos(37.5 * Math.PI / 180));
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function scene(mode, zoom = 14, { straight = false, kink = false, dist = 0, pitch = 0 } = {}) {
  const unit = 1 / (512 * 2 ** zoom), radius = 200 * mu, draws = [], cars = [];
  const t = Math.max(0, Math.min(1, (zoom - 13) / 4)), body = 15 + 13 * t * t * (3 - 2 * t);
  const width = mode === 'off' ? body : Math.min(body, Math.max(7, 20 * mu / unit / 1.6));
  const lane = mode === 'simcity' ? 4 : (1.5 + 2.5 * Math.min(1, (zoom - 8) / 7)) / 2 + 3.5 + width / 2;
  const plan = { id: 'curve', t: { line: '3호선' }, cars: 10, carMetres: 20, seq: [0, 1] };
  const trackPoint = (_p, d) => {
    if (kink) { const a = d < 0 ? 0 : Math.PI / 4;
      return { x: d * Math.cos(a), y: d * Math.sin(a), f: [Math.cos(a), Math.sin(a)],
        r: [-Math.sin(a), Math.cos(a)], off: 0, h: 12 * mu, roll: 0 }; }
    const a = d / radius;
    return { x: straight ? d : radius * Math.sin(a), y: straight ? 0 : radius * (1 - Math.cos(a)),
      f: straight ? [1, 0] : [Math.cos(a), Math.sin(a)], r: straight ? [0, 1] : [-Math.sin(a), Math.cos(a)],
      off: 0, h: mode === 'off' ? 0 : 12 * mu, roll: 0 };
  };
  const map = { getZoom: () => zoom, getPitch: () => pitch, getBearing: () => 0,
    getBounds: () => ({ getSouthWest: () => ({ x: -1, y: 1 }), getNorthEast: () => ({ x: 1, y: -1 }) }),
    getCenter: () => ({ x: 0, y: 0 }) };
  const gl = new Proxy({ drawArrays: (...args) => draws.push(args) }, { get: (o, k) => k in o ? o[k] : () => {} });
  const context = vm.createContext({ map, maplibregl: { MercatorCoordinate: { fromLngLat: p => p } },
    myLocation: null, trainsEnabled: true, plans: [plan], coaster: mode === 'coaster', simcity: mode === 'simcity',
    cityViaduct: { train: () => ({ lanePx: 4 }), shadowShift: () => [0, 0] },
    smooth: x => x * x * (3 - 2 * x), colors: { '3호선': '#ff8800' }, hexRGB: () => [1, .53, 0],
    trainPose: () => ({ dist, moving: false }), trackPoint, mercStop: () => ({ meterInMercatorCoordinateUnits: () => mu }),
    toRide: (_p, d) => d, fromRide: (_p, d) => d, rolled: r => [r.concat(0), [0, 0, 1]], CORK_HEART: 0,
    lastPose: new Map(), sheetTrain: null, following: null, easing: false, NOSE_Z: .3,
    sunTrainShadow: [0, 0], sunPosition: () => [], document: { documentElement: { dataset: { theme: 'light' } } },
    performance: { now: () => 0 }, trainFrameSoon: () => {},
    CoasterTrain: class { begin() {} draw() {} car(fr, L, W, color, front, back) { cars.push({ fr, L, W, color, front, back }); } }
  });
  vm.runInContext(`${widths}\n${layerSource}\nglobalThis.layer = new TrainLayer();`, context);
  const layer = context.layer; layer.uni = {}; layer.attr = {};
  layer.render(gl, { defaultProjectionData: { mainMatrix: matrix } });
  return { layer, cars, draws, trackPoint, unit, lane, plan, width };
}

for (const mode of ['off', 'simcity']) for (const zoom of [13, 14, 15]) test(`${mode}: compact train roof follows its lane around a curve at z${zoom}`, () => {
  const { layer, unit, trackPoint, lane, plan, draws } = scene(mode, zoom, { pitch: 50 });
  const total = Math.max(plan.cars * plan.carMetres * mu, 36 * unit), sections = new Set();
  let error = 0;
  for (let i = 0; i < layer.used; i += 6 * 13) {
    const d = layer.data; if (d[i + 12] !== 0) continue;
    for (const [a, b] of [[i, i + 13], [i + 2 * 13, i + 5 * 13]]) {
      const u = d[a + 3]; if (u < 0 || u > d[a + 5]) continue;
      const x = (d[a] + d[b]) / 2, y = (d[a + 1] + d[b + 1]) / 2;
      const along = layer.curve ? -total / 2 + u * unit : Math.atan2(x, 200 * mu - y) * 200 * mu;
      const q = trackPoint(plan, along); sections.add(`${x},${y}`);
      error = Math.max(error, Math.hypot(x - q.x - q.r[0] * lane * unit, y - q.y - q.r[1] * lane * unit) / unit);
    }
  }
  assert.ok(error < .15, `roof must stay on the curved lane; deviation ${error.toFixed(2)} px`);
  assert.ok(sections.size >= 10, 'the long roof must have interior path samples, not just two end caps');
  assert.equal(draws.length, 2, 'retain one batched shadow pass and one body pass');
  assert.ok(layer.data.subarray(0, layer.used).every(Number.isFinite), 'walls and both cabs stay finite on the curved body');
});

test('coaster: crossing a track vertex does not jump a car sideways at low zoom', () => {
  const unit = 1 / (512 * 2 ** 14), half = 10 * 7 * 1.6 * unit / 2;
  const before = scene('coaster', 14, { kink: true, dist: half - .0001 * unit });
  const after = scene('coaster', 14, { kink: true, dist: half + .0001 * unit });
  const A = before.cars[0].fr, B = after.cars[0].fr;
  const jump = Math.hypot(B[0] - A[0], B[1] - A[1]) / unit;
  assert.ok(jump < .02, `a subpixel advance must not cause a ${jump.toFixed(2)} px lateral jump`);
});

test('coaster: actual car instances bend along the curve at z13–15', () => {
  for (const z of [13, 14, 15]) {
    const { cars, unit, trackPoint, lane, plan } = scene('coaster', z);
    assert.equal(cars.length, plan.cars, 'retain one instance per car');
    const total = Math.max(plan.cars * plan.carMetres * mu, 36 * unit, plan.cars * 7 * 1.6 * unit);
    let maxError = 0;
    for (const c of cars) {
      const x = c.fr[0] + c.fr[3] * c.L * unit / 2, y = c.fr[1] + c.fr[4] * c.L * unit / 2;
      const r = 200 * mu, d = Math.atan2(x, r - y) * r, q = trackPoint(plan, d);
      maxError = Math.max(maxError, Math.hypot(x - q.x - q.r[0] * lane * unit, y - q.y - q.r[1] * lane * unit) / unit);
      assert.ok(c.L > 0 && c.L < total / unit, 'each car has its own short chord');
    }
    assert.ok(maxError < .7, `z${z}: per-car curve error ${maxError.toFixed(2)} px`);
    const headings = cars.map(c => Math.atan2(c.fr[4], c.fr[3]));
    assert.ok(Math.max(...headings) - Math.min(...headings) > .4, 'cars must have different headings on the curved track');
  }
});

for (const mode of ['off', 'simcity', 'coaster']) test(`${mode}: high-zoom straight track keeps body width, consist and livery`, () => {
  const { layer, cars, width, unit, plan } = scene(mode, 18, { straight: true, pitch: 50 });
  if (mode === 'coaster') {
    assert.equal(cars.length, plan.cars);
    for (const c of cars) {
      assert.equal(c.W, width);
      assert.deepEqual(c.color, [1, .53, 0]);
      assert.equal(c.fr[3], 1); assert.equal(c.fr[4], 0);
      assert.ok(Math.abs(c.L - (20 * mu / unit - (c.front || c.back ? .7 : 1.4))) < 1e-9);
    }
  } else {
    for (let i = 0; i < layer.used; i += 13) {
      assert.equal(layer.data[i + 6], width);
      assert.equal(layer.data[i + 9], 1); assert.equal(layer.data[i + 11], 0);
      assert.ok(Math.abs(layer.data[i + 10] - .53) < 1e-6);
    }
    assert.ok(layer.data.subarray(0, layer.used).every(Number.isFinite));
    assert.equal(layer.curve, null, 'high-zoom cars retain the existing rigid geometry');
  }
});
