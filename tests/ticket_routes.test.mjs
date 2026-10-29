// 승차권 경로 고르기(2026-10-29): 길 모양으로 묶고 · 한참 느린 길은 빼고 · '가장 빠른 길'은 늘 남긴다(조금 느린 다른 모양은 남김) — web/user/ticket_routes.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import {usefulRoutes, quickestRoute, rideSig, nextRideDay, routeAt, SLOW_LIMIT, routeOrder, routeFilterView, chosenAfter, routeUrl} from '../web/user/ticket_routes.mts';

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

test('another shape 1~9 min slower stays even with no fewer changes', () => {
  const plans = [
    plan('fast', 30, [ride('2호선', 'A', 'B'), ride('3호선', 'B', 'C')], '가장 빠른 길'),
    plan('direct', 34, [ride('9호선', 'A', 'C')], '환승 적은 길'),
    plan('one min slower', 31, [ride('2호선', 'A', 'D'), ride('4호선', 'D', 'C')]),   // 30분 길보다 1분 느리고 환승도 같다
    plan('slower than direct', 39, [ride('7호선', 'A', 'C')]),                        // 34분 바로 가는 길보다 느리고 환승 같다
  ];
  assert.deepEqual(names(usefulRoutes(plans)), ['fast', 'direct', 'one min slower', 'slower than direct']);
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
  assert.deepEqual(names(usefulRoutes([plan('ride', 15, [ride('2호선', 'A', 'C')], '가장 빠른 길'), walking])), ['ride', 'walk'], 'slower but within the limit: stays');
  assert.deepEqual(names(usefulRoutes([plan('ride', 7, [ride('2호선', 'A', 'C')], '가장 빠른 길'), walking])), ['ride'], 'over the limit: dropped like any way');
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

// 조건 바꾸기(2026-10-29): 거르기 뒤 받은 길을 종류(전체 · 지하철만 · 버스만)와 차례(환승 적게 · 덜 걷기)로 다시 나눈다
const bus = (route, from, to) => ({type: 'bus', route, from, to});
const kinded = (name, kind, minutes, transfers, walkMinutes, rides) => ({name, kind, tag: '', minutes, transfers, walkMinutes, legs: [walk, ...rides, walk]});
const mixedBag = [
  kinded('subway two', 'subway', 30, 1, 6, [ride('2호선', 'A', 'B'), ride('3호선', 'B', 'C')]),
  kinded('bus long walk', 'bus', 32, 0, 12, [bus('146', 'A', 'C')]),
  kinded('mixed', 'mixed', 33, 1, 3, [ride('2호선', 'A', 'B'), bus('470', 'B', 'C')]),
  kinded('subway many', 'subway', 34, 3, 2, [ride('1호선', 'A', 'B'), ride('4호선', 'B', 'D'), ride('7호선', 'D', 'E'), ride('9호선', 'E', 'C')]),
  kinded('subway direct', 'subway', 36, 0, 6, [ride('신분당선', 'A', 'C')]),
];
const at = order => order.map(index => mixedBag[index].name);

test('route kinds: all keeps every way, subway / bus only keep that kind (mixed and walking only in all)', () => {
  assert.deepEqual(at(routeOrder(mixedBag, 'all', '')), ['subway two', 'bus long walk', 'mixed', 'subway many', 'subway direct']);
  assert.deepEqual(at(routeOrder(mixedBag, 'subway', '')), ['subway two', 'subway many', 'subway direct']);
  assert.deepEqual(at(routeOrder(mixedBag, 'bus', '')), ['bus long walk']);
});

test('route sorts: fewer changes / less walking first, ties keep the given order', () => {
  assert.deepEqual(at(routeOrder(mixedBag, 'all', 'transfers')), ['bus long walk', 'subway direct', 'subway two', 'mixed', 'subway many']);
  assert.deepEqual(at(routeOrder(mixedBag, 'all', 'walk')), ['subway many', 'mixed', 'subway two', 'subway direct', 'bus long walk']);
  assert.deepEqual(at(routeOrder(mixedBag, 'subway', 'transfers')), ['subway direct', 'subway two', 'subway many']);
});

test('filter view: kind buttons with counts, sort buttons, and a short note when nothing fits', () => {
  const view = routeFilterView(mixedBag, 'subway', 'walk');
  assert.deepEqual(view.kinds.map(tab => [tab.kind, tab.name, tab.count, tab.pressed]), [['all', '전체', 5, false], ['subway', '지하철만', 3, true], ['bus', '버스만', 1, false]]);
  assert.deepEqual(view.sorts.map(tab => [tab.sort, tab.name, tab.pressed]), [['transfers', '환승 적게', false], ['walk', '덜 걷기', true]]);
  assert.equal(view.empty, '');
  const noBus = routeFilterView(mixedBag.filter(plan => plan.kind !== 'bus'), 'bus', '');
  assert.deepEqual(noBus.order, []);
  assert.equal(noBus.empty, '버스만 타는 경로가 없어요');
  assert.equal(noBus.kinds[2].count, 0);
});

test('after a change: the saved way if it shows, else the first card, else none', () => {
  const subwayFirst = routeOrder(mixedBag, 'subway', 'transfers');   // direct, two, many
  assert.equal(chosenAfter(mixedBag, subwayFirst, null), 4, 'no saved way: the first card');
  assert.equal(chosenAfter(mixedBag, subwayFirst, mixedBag[3]), 3, 'saved way shows: that card');
  // 저장된 경로는 시각 칸이 다른 SlimRoute 여도 길 모양으로 맞춘다
  const saved = {tag: '', minutes: 40, leaveBy: '08:00', arrives: '08:40', transfers: 1, walkMinutes: 6, legs: mixedBag[0].legs};
  assert.equal(chosenAfter(mixedBag, subwayFirst, saved), 0);
  assert.equal(chosenAfter(mixedBag, routeOrder(mixedBag, 'bus', ''), saved), 1, 'saved way hidden: the first card');
  assert.equal(chosenAfter(mixedBag, [], saved), -1);
});

test('route url asks with the via only when there is one (경유지 2026-10-29)', () => {
  const from = {name: '서울역', lat: 37.5547, lng: 126.9707}, to = {name: '강남역', lat: 37.4979, lng: 127.0276};
  const plain = './api/route?from=37.5547,126.9707&to=37.4979,127.0276&at=2026-10-30T08%3A30';
  assert.equal(routeUrl(from, to, '2026-10-30T08:30'), plain);
  assert.equal(routeUrl(from, to, '2026-10-30T08:30', null), plain, 'old tickets: same as before');
  assert.equal(routeUrl(from, to, '2026-10-30T08:30', {name: '성수역', lat: 37.5446, lng: 127.056}), `${plain}&via=37.5446,127.056`);
});
