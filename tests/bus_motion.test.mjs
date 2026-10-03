import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBusPath, busPointAt, snapBusToPath, nextBusMotion, busMotionDistance} from '../web/lib/bus_motion.mjs';

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
