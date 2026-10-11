import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBusPath, busPointAt, busPathSlice, busPathPasses, snapBusToPath, nextBusMotion, retimeBusMotion, busMotionDistance} from '../web/bus/motion.mjs';

const corner = buildBusPath([[127, 37.5], [127.001, 37.5], [127.001, 37.501]]);

test('interpolation follows the corner instead of cutting through the block', () => {
  const motion = nextBusMotion(nextBusMotion(null, 0, 0), corner.total, 1000, {interval: 10000});
  const halfway = busPointAt(corner, busMotionDistance(motion, 6000));
  assert.equal(halfway.coordinate[0], 127.001);
  assert.ok(halfway.coordinate[1] > 37.5 && halfway.coordinate[1] < 37.501);
  assert.equal(busMotionDistance(motion, 60000), corner.total, 'no extrapolation past latest observation');
});

test('invalid / degenerate paths do not invent links across missing coordinates', () => {
  assert.equal(buildBusPath([[127, 37], [NaN, 37], [128, 38]]), null);
  assert.equal(buildBusPath([[127, 37], [127, 37]]), null);
  assert.equal(buildBusPath([[127, 37], [127, 95]]), null);
  assert.equal(snapBusToPath(corner, [126, 37]), null);
});

test('overlapping return leg uses heading and previous distance', () => {
  const path = buildBusPath([[127, 37.5], [127.003, 37.5], [127, 37.5]]);
  const out = snapBusToPath(path, [127.001, 37.50002], {heading: 90, hint: 85});
  const back = snapBusToPath(path, [127.001, 37.50002], {heading: 270, hint: path.total - 85});
  assert.ok(out.distance < path.total / 2);
  assert.ok(back.distance > path.total / 2);
  assert.ok(Math.abs(busPointAt(path, back.distance).heading - 270) < 1);
});

test('new observations continue from displayed position without a jump', () => {
  const a = nextBusMotion({from: 0, to: 0, startedAt: 0, duration: 0}, 100, 0, {interval: 10000});
  const b = nextBusMotion(a, 140, 5000, {interval: 10000});
  assert.equal(b.from, 50);
  assert.equal(busMotionDistance(b, 5000), 50);
});

test('stale/reduced motion and route-wrap corrections do not produce phantom motion', () => {
  const previous = {from: 0, to: 100, startedAt: 0, duration: 10000};
  for (const options of [{reduced: true}, {stale: true}]) {
    assert.equal(nextBusMotion(previous, 150, 4000, options).duration, 0);
  }
  assert.equal(nextBusMotion(previous, 0, 10000).duration, 0);
  assert.equal(nextBusMotion(previous, 3000, 10000).duration, 0);
});

test('a path slice keeps the vertices between its ends and cuts the ends on the line', () => {
  const path = buildBusPath([[127, 37.5], [127.01, 37.5], [127.02, 37.5]]), half = path.distances[1];
  const part = busPathSlice(path, half / 2, half * 1.5);
  assert.equal(part.length, 3);
  assert.ok(Math.abs(part[0][0] - 127.005) < 1e-6 && Math.abs(part[2][0] - 127.015) < 1e-6);
  assert.deepEqual(part[1], [127.01, 37.5]);
});

test('a stop on an out-and-back line is passed twice, even where the two passes join at the turn', () => {
  const path = buildBusPath([[127, 37.5], [127.01, 37.5], [127, 37.5]]);
  const passes = busPathPasses(path, [127.002, 37.5001]);
  assert.equal(passes.length, 2);
  assert.ok(passes[0].distance < path.total / 2 && passes[1].distance > path.total / 2);
  assert.deepEqual(busPathPasses(path, [127.005, 37.6]), [], 'too far from the line');
});

test('an answer without a new position stretches the known remaining way to the next answer, never past it', () => {
  const moving = {from: 0, to: 300, startedAt: 0, duration: 30000};
  const later = retimeBusMotion(moving, 28000, 8000);
  assert.equal(busMotionDistance(later, 28000), 280, 'no jump');
  assert.equal(later.to, 300);
  assert.equal(later.startedAt + later.duration, 36000, 'arrives when the next answer is due instead of standing for 6 s');
  assert.equal(busMotionDistance(later, 60000), 300, 'and stops at the last known position');
  assert.equal(retimeBusMotion(moving, 5000, 8000), moving, 'never hurried: 25 s left stays 25 s');
  assert.equal(retimeBusMotion(moving, 31000, 8000), moving, 'already there: nothing to invent');
  const parked = {from: 300, to: 300, startedAt: 0, duration: 0};
  assert.equal(retimeBusMotion(parked, 1000, 8000), parked);
});
