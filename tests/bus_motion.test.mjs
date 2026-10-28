import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBusPath, busPointAt, busPathSlice, busPathPasses, snapBusToPath, nextBusMotion, retimeBusMotion, busLeadDistance, busPaceLead, busKstHour, busMotionDistance} from '../web/bus/motion.mts';

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

// 2026-10-12 덕배(3011 탑승): 원자료 15~40초 늦음 + 다음 응답 때 닿기 = 화면이 GPS 보다 약 50~70초 뒤
test('a bus is drawn where it should be when the motion ends: recent speed ahead of the GPS time, never past the next stop', () => {
  const history = [{t: 0, d: 0}, {t: 30000, d: 150}];
  assert.equal(busLeadDistance(history, 300, 60000, 120000, [1000]), 600, '5 m/s for 60 s');
  assert.equal(busLeadDistance(history, 300, 60000, 120000, [450, 1000]), 450, 'not past the next stop (it may stop there)');
  assert.equal(busLeadDistance(history, 300, 60000, 400000, [5000]), 700, 'at most 400 m');
  assert.equal(busLeadDistance([{t: 0, d: 0}], 3000, 60000, 400000, [9000]), 3400, 'at most 400 m even when fast');
  assert.equal(busLeadDistance([{t: -200000, d: 0}], 300, 60000, 120000, [1000]), 300, 'no recent observation: no guess');
  assert.equal(busLeadDistance([], 300, 60000, 120000, [1000]), 300);
  assert.equal(busLeadDistance([{t: 0, d: 400}], 300, 60000, 120000, [1000]), 300, 'never behind the observation');
});

test('a guess that went ahead holds still instead of sliding back, but a real jump back still jumps', () => {
  const ahead = {from: 500, to: 500, startedAt: 0, duration: 0};
  const held = nextBusMotion(ahead, 420, 1000, {interval: 30000, hold: true});
  assert.deepEqual([held.from, held.to, held.duration], [500, 500, 0]);
  assert.equal(nextBusMotion(ahead, 420, 1000, {interval: 30000}).to, 420, 'without hold: as before');
  assert.equal(nextBusMotion(ahead, 0, 1000, {interval: 30000, hold: true}).to, 0, 'a new trip (far back) is not held');
  assert.equal(nextBusMotion(ahead, 700, 1000, {interval: 30000, hold: true}).duration, 30000, 'forward moves as before');
});

test('learned pace: the bus goes on by the time each 50 m piece took, slower where it stood (덕배 2026-10-14)', () => {
  const pace = [100, 100, 1000, 100, 100];   // ms/m: 2번 칸(100~150 m)은 정류장 — 서 있던 시간이 들어 있다
  assert.equal(busPaceLead(pace, 50, 0, 0, 5000), 50, '5 s at 10 m/s');
  assert.equal(busPaceLead(pace, 50, 0, 0, 30000), 120, '10 s to the stop, then 20 s of its 50 s');
  assert.equal(busPaceLead(pace, 50, 0, 0, 120000), 250, 'never past the end of the learned line');
  assert.equal(busPaceLead(pace, 50, 0, 10000, 0), 0, 'an answer from the future does not move it back');
  assert.equal(busPaceLead(Array(100).fill(10), 50, 0, 0, 60000), 800, 'at most 800 m ahead');
  assert.equal(busPaceLead(Array(100).fill(200), 50, 0, 0, 200000), 450, 'at most 90 s ahead');
  assert.equal(busPaceLead(undefined, 50, 0, 0, 5000), null, 'unknown hour → caller falls back');
  assert.equal(busKstHour(Date.UTC(2026, 9, 13, 23, 30)), 8, 'hours are Korean');
});
