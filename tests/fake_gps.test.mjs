// 개발 도구 가짜 GPS(web/dev/fake_gps.mts): 경로 따라 재생이 길 위 자리를 바르게 고르는지 · 모듈을 읽기만 해서는 navigator 를 바꾸지 않는지
import test from 'node:test';
import assert from 'node:assert/strict';
import { alongPath } from '../web/dev/fake_gps.mts';
import { metres } from '../web/lib/ride-along.mts';

const path = [[127.0, 37.5], [127.001, 37.5], [127.001, 37.501]];
const first = metres(path[0], path[1]);

test('alongPath: 처음 · 가운데 · 꺾인 뒤 · 끝을 넘으면 끝 자리', () => {
  assert.deepEqual(alongPath(path, 0), { spot: [127.0, 37.5], end: false });
  const half = alongPath(path, first / 2);
  assert.equal(half.end, false);
  assert.ok(Math.abs(half.spot[0] - 127.0005) < 1e-9 && half.spot[1] === 37.5);
  const turned = alongPath(path, first + 10);
  assert.equal(turned.spot[0], 127.001);
  assert.ok(Math.abs(metres(path[1], turned.spot) - 10) < 0.01);
  assert.deepEqual(alongPath(path, 1e6), { spot: [127.001, 37.501], end: true });
  assert.deepEqual(alongPath(path, -5).spot, [127.0, 37.5]);
});

test('alongPath: 점 하나뿐인 길은 그 자리에서 끝', () => {
  assert.deepEqual(alongPath([[127, 37.5]], 30), { spot: [127, 37.5], end: true });
});

test('모듈을 읽기만 해서는 navigator.geolocation 을 바꾸지 않는다', () => {
  assert.equal(Object.getOwnPropertyDescriptor(globalThis.navigator ?? {}, 'geolocation'), undefined);
});
