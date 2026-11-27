// 열차 간격 맞추기(본체 spaceTrains): 같은 선로에서 붙은 두 열차는 뒤 열차가 물러서고, 화면에서 먼 열차는 예측 그대로(선로 위 자리를 셈하지 않는다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../web/maplibre_runtime.mts', import.meta.url), 'utf8'));
const slice = (from, to) => { const a = source.indexOf(from), b = source.indexOf(to, a); assert.ok(a >= 0 && b > a, `본체에서 ${from} 구간을 찾지 못함`); return source.slice(a, b) };
const code = slice('const TRAIN_GAP_M=', '// 열차가 그 역을 떠날 때') + '\nglobalThis.out={trainPose,trainMid,trainNear};';

// 가짜 세상: 선로는 x 축을 따라 곧게, 1 m = 1e-6(mercator). 역은 1000 m 마다
const M = 1e-6;
function world({ view }) {
  const calls = { trackPoint: 0 };
  const station = x => ({ id: Math.round(x * 1e6), x });
  const plan = (id, x0, raw) => ({ id, raw, x0, cars: 1, carMetres: 100, t: { line: '2호선', direction: '내선', express: false },
    seq: [station(x0), station(x0 + 1000 * M), station(x0 + 2000 * M)], cum: [0, 1000 * M, 2000 * M] });
  const planner = { plans: [], frameClock: 1000 };
  const ctx = {
    planner, clock: () => 1000, Map, Math, Infinity,
    rawPose: p => ({ dist: p.raw, moving: true }),
    trackPoint: (p, dist) => { calls.trackPoint++; return { x: p.x0 + dist, y: .5, f: [1, 0], r: [0, 1], off: 0, h: 0 } },
    mercStop: (_line, s) => ({ x: s.x, y: .5, meterInMercatorCoordinateUnits: () => M }),
    map: { getBounds: () => ({ getSouthWest: () => [view[0], .5 + 500 * M], getNorthEast: () => [view[1], .5 - 500 * M] }) },
    maplibregl: { MercatorCoordinate: { fromLngLat: ([x, y]) => ({ x, y, meterInMercatorCoordinateUnits: () => M }) } },
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ...ctx.out, planner, plan, calls };
}

test('간격 맞추기: 화면 안에서 붙은 두 열차 — 뒤 열차가 몸 반 + 몸 반 + 20 m 뒤로', () => {
  const W = world({ view: [.5, .503] }), ahead = W.plan('A', .5, 1000 * M), behind = W.plan('B', .5, 950 * M);
  W.planner.plans = [ahead, behind];
  assert.equal(W.trainPose(ahead).dist, 1000 * M);
  assert.ok(Math.abs(W.trainPose(behind).dist - (1000 - 120) * M) < 1e-12, '뒤 열차는 앞 열차 가운데에서 120 m 뒤');
});

test('간격 맞추기: 앞 열차가 화면 밖이어도 여백(한 화면 폭) 안이면 맞춘다', () => {
  const W = world({ view: [.5, .503] }), ahead = W.plan('A', .5045, 600 * M), behind = W.plan('B', .5045, 560 * M);   // 화면 오른쪽 끝(.503)에서 1.5 km 밖
  W.planner.plans = [ahead, behind];
  assert.ok(Math.abs(W.trainPose(behind).dist - (600 - 120) * M) < 1e-12);
  assert.equal(W.trainNear(ahead, 600 * M), true, '열차 층도 여백 안 열차는 그린다');
});

test('간격 맞추기: 화면에서 먼 열차는 예측 그대로 — 선로 위 자리를 셈하지 않는다', () => {
  const W = world({ view: [.5, .503] }), ahead = W.plan('A', .6, 1000 * M), behind = W.plan('B', .6, 950 * M);   // 100 km 밖
  W.planner.plans = [ahead, behind];
  assert.equal(W.trainPose(behind).dist, 950 * M);
  assert.equal(W.calls.trackPoint, 0);
  assert.equal(W.trainNear(behind, 950 * M), false, '열차 층도 이 열차는 건너뛴다');
});

test('가운데 자리: 간격 맞추기가 셈한 것을 x-ray · 열차 층이 다시 쓴다', () => {
  const W = world({ view: [.5, .503] }), ahead = W.plan('A', .5, 1000 * M), behind = W.plan('B', .5, 950 * M);
  W.planner.plans = [ahead, behind];
  const pa = W.trainPose(ahead), pb = W.trainPose(behind), n = W.calls.trackPoint;
  assert.equal(W.trainMid(ahead, pa.dist).x, .5 + 1000 * M);
  assert.equal(W.trainMid(behind, pb.dist).x, .5 + pb.dist);
  assert.equal(W.calls.trackPoint, n, '같은 거리는 다시 셈하지 않는다');
  W.trainMid(ahead, pa.dist + M);
  assert.equal(W.calls.trackPoint, n + 1, '다른 거리면 새로 셈한다');
});
