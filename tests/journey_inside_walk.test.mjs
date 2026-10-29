// 길찾기 지도의 역 안 걷기(web/ui/journey.mts insideWalk): 선로를 따라 출구 가까운 점까지 간 뒤 출구로 꺾는다
import test from 'node:test';
import assert from 'node:assert/strict';
import {insideWalk} from '../web/ui/journey.mts';

// 동서로 긴 선로(경도 0.001 ≈ 88 m): 승강장은 가운데, 출구는 서쪽 끝 도로 쪽(북쪽 20 m 옆)
const track = [[127.050, 37.5], [127.052, 37.5], [127.054, 37.5], [127.056, 37.5]];
const platform = [127.054, 37.5];
const exit = [127.0505, 37.50018];

test('출구가 선로 끝 쪽이면 선로를 따라가다 꺾는다', () => {
  const way = insideWalk(track, platform, exit);
  assert.deepEqual(way[0], platform);
  assert.deepEqual(way.at(-1), exit);
  assert.ok(way.length >= 4, '선로 꼭짓점을 지난다');
  assert.ok(way.slice(1, -1).every(([, lat]) => Math.abs(lat - 37.5) < 1e-9), '가운데 점은 모두 선로 위');
});

test('선로가 없으면 직선', () => {
  assert.deepEqual(insideWalk([], platform, exit), [platform, exit]);
  assert.deepEqual(insideWalk([platform], platform, exit), [platform, exit]);
});

test('출구가 선로보다 승강장에 가까우면 직선', () => {
  const near = [127.0541, 37.50009];
  assert.deepEqual(insideWalk(track, platform, near), [platform, near]);
});

test('선로 밖으로 한참 돌아가는 길이면 직선', () => {
  const far = [127.054, 37.505];   // 선로에서 550 m 위
  assert.deepEqual(insideWalk(track, platform, far), [platform, far]);
});
