// 길찾기 시각 바퀴가 만드는 때 — web/lib/journey-ui.mts wheelDate · keepPickable
import test from 'node:test';
import assert from 'node:assert/strict';
import {keepPickable, soonestWhen, wheelDate} from '../web/lib/journey-ui.mts';

const at = (day, hours, minutes) => new Date(2026, 10, day, hours, minutes);
const picked = (time, now) => keepPickable(wheelDate(time, now), now);

test('바퀴를 연 채 자정을 넘겨 08:00 을 고르면 넘긴 날의 08:00 이다', () => {
  const opened = keepPickable(soonestWhen(at(1, 23, 54)), at(1, 23, 54));
  assert.deepEqual(opened, at(1, 23, 55));
  assert.deepEqual(picked('08:00', at(2, 0, 1)), at(2, 8, 0));
});

test('오늘 지난 시각은 다음 5분으로 되돌린다', () => {
  assert.deepEqual(picked('08:00', at(1, 20, 2)), at(1, 20, 5));
});

test('23:55 이 지나면 어떤 시각을 골라도 다음 날 00:00 이다', () => {
  assert.deepEqual(picked('08:00', at(1, 23, 57)), at(2, 0, 0));
  assert.deepEqual(picked('00:00', at(1, 23, 57)), at(2, 0, 0));
});
