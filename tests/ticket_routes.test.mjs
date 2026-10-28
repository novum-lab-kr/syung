// 승차권 경로 고르기(2026-10-29): 길 모양으로 묶고 · 지배되는 길 · 한참 느린 길은 빼고 · '가장 빠른 길'은 늘 남긴다 — web/user/ticket_routes.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import {usefulRoutes, quickestRoute, rideSig, nextRideDay, routeAt, SLOW_LIMIT} from '../web/user/ticket_routes.mts';

const walk = {type: 'walk', seconds: 120};
const ride = (line, from, to) => ({type: 'subway', line, from, to});
// 가짜 길: 이름(name)은 시험에서 찾기 쉽게만
const plan = (name, minutes, rides, tag = '') => ({name, tag, minutes, transfers: Math.max(0, rides.length - 1), walkMinutes: 4, legs: [walk, ...rides, walk]});
const names = plans => plans.map(item => item.name);

test('same shape (lines + stations) is kept once — the quickest of them', () => {
  const shape = [ride('2호선', '강남', '교대'), ride('3호선', '교대', '양재')];
  const plans = [plan('early', 30, shape, '가장 빠른 길'), plan('other', 33, [ride('신분당선', '강남', '양재')]), plan('same later', 36, shape)];
  assert.equal(rideSig(plans[0]), rideSig(plans[2]));
  assert.notEqual(rideSig(plans[0]), rideSig(plans[1]));
  assert.deepEqual(names(usefulRoutes(plans)), ['early', 'other']);
  // 같은 모양이면 더 빠른 것이 남는다(차례와 상관없이)
  assert.deepEqual(names(usefulRoutes([plan('slow twin', 34, shape), plan('fast twin', 31, shape)])), ['fast twin']);
});

test('a way that is slower and changes no less than another is dropped', () => {
  const plans = [
    plan('fast', 30, [ride('2호선', 'A', 'B'), ride('3호선', 'B', 'C')], '가장 빠른 길'),
    plan('direct', 34, [ride('9호선', 'A', 'C')], '환승 적은 길'),
    plan('dominated', 35, [ride('2호선', 'A', 'D'), ride('4호선', 'D', 'C')]),   // 30분 길보다 느리고 환승도 같다
    plan('dominated by direct', 37, [ride('7호선', 'A', 'C')]),                    // 34분 바로 가는 길보다 느리고 환승 같다
  ];
  assert.deepEqual(names(usefulRoutes(plans)), ['fast', 'direct']);
});

test(`a way much slower than the fastest (over max(${SLOW_LIMIT.minutes} min, ${SLOW_LIMIT.share * 100}%)) is dropped`, () => {
  // 가장 빠른 길 20분 → 한도 30분(10분이 더 크다): 30분 바로 가는 길은 남고 31분은 빠진다
  const short = [plan('fast', 20, [ride('2호선', 'A', 'B'), ride('3호선', 'B', 'C')], '가장 빠른 길')];
  assert.deepEqual(names(usefulRoutes([...short, plan('ok', 30, [ride('9호선', 'A', 'C')])])), ['fast', 'ok']);
  assert.deepEqual(names(usefulRoutes([...short, plan('detour', 31, [ride('9호선', 'A', 'C')])])), ['fast']);
  // 가장 빠른 길 60분 → 한도 78분(30%가 더 크다)
  const long = [plan('fast', 60, [ride('1호선', 'A', 'B'), ride('4호선', 'B', 'C')], '가장 빠른 길')];
  assert.deepEqual(names(usefulRoutes([...long, plan('ok', 78, [ride('경의중앙선', 'A', 'C')])])), ['fast', 'ok']);
  assert.deepEqual(names(usefulRoutes([...long, plan('wrong way', 79, [ride('경의중앙선', 'A', 'C')])])), ['fast']);
});

test("the '가장 빠른 길' tagged way always stays, and a lone way stays as it is", () => {
  // 태그 길이 (시험용으로) 가장 덜 걸리는 길이 아니어도 빠지지 않는다
  const plans = [plan('tagged', 50, [ride('1호선', 'A', 'B'), ride('2호선', 'B', 'C')], '가장 빠른 길'), plan('quick', 20, [ride('9호선', 'A', 'C')])];
  assert.deepEqual(names(usefulRoutes(plans)), ['tagged', 'quick']);
  const lone = [plan('only', 90, [ride('1호선', 'A', 'B'), ride('2호선', 'B', 'C'), ride('3호선', 'C', 'D')])];
  assert.deepEqual(names(usefulRoutes(lone)), ['only']);
  assert.deepEqual(usefulRoutes([]), []);
  // 걸어가기(탄 구간 없음)도 길 모양 하나
  const walking = {name: 'walk', tag: '걸어가기', minutes: 18, transfers: 0, walkMinutes: 18, legs: [walk]};
  assert.equal(rideSig(walking), '');
  assert.deepEqual(names(usefulRoutes([plan('ride', 15, [ride('2호선', 'A', 'B'), ride('3호선', 'B', 'C')], '가장 빠른 길'), walking])), ['ride', 'walk']);
  assert.deepEqual(names(usefulRoutes([plan('ride', 15, [ride('2호선', 'A', 'C')], '가장 빠른 길'), walking])), ['ride'], 'slower and no fewer changes: dropped like any way');
});

test('the card back takes the quickest way after filtering', () => {
  const plans = [plan('slow first', 40, [ride('1호선', 'A', 'C')]), plan('fast', 25, [ride('2호선', 'A', 'B'), ride('3호선', 'B', 'C')], '가장 빠른 길')];
  assert.equal(quickestRoute(plans).name, 'fast');
  assert.equal(quickestRoute([]), null);
});

test('next ride day: the nearest chosen weekday after now, at the ticket time', () => {
  const now = new Date(2026, 9, 29, 9, 0);   // 2026-10-29 목요일 09:00
  assert.equal(routeAt(nextRideDay([], '08:00', now)), '2026-10-30T08:00', 'no days: the next time it comes');
  assert.equal(routeAt(nextRideDay([], '18:30', now)), '2026-10-29T18:30');
  assert.equal(routeAt(nextRideDay([1, 2, 3, 4, 5], '08:00', now)), '2026-10-30T08:00', 'weekdays: Friday');
  assert.equal(routeAt(nextRideDay([6, 7], '08:00', now)), '2026-10-31T08:00', 'weekend: Saturday');
  assert.equal(routeAt(nextRideDay([4], '08:00', now)), '2026-11-05T08:00', 'Thursday already gone: next week');
});
