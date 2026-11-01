// 장소 검색의 순수 셈(web/lib/place-search.mts): 역 찾기 · 한 목록 합치기 · 가까운 5분
import test from 'node:test';
import assert from 'node:assert/strict';
import { endName, findStations, mergeHits, nearestFive, stationQuery, swappedEnds, ticketTime } from '../web/lib/place-search.mts';

const STATIONS = [
  { id: 1, name: '서울대입구', lat: 37.481, lon: 126.952, lines: [{ name: '2호선' }] },
  { id: 2, name: '서울', lat: 37.555, lon: 126.972, lines: [{ name: '1호선' }] },
  { id: 3, name: '강남', lat: 37.4979, lon: 127.0276, lines: [{ name: '2호선' }, { name: '없는선' }] },
  { id: 4, name: '남서울', lat: 37.5, lon: 127, lines: [] },
];
const COLORS = { '2호선': '#00a84d' };
const GANGNAM = findStations(STATIONS, '강남', COLORS);

test('끝의 「역」은 떼고 찾는다', () => {
  assert.equal(stationQuery(' 강남역 '), '강남');
  assert.deepEqual(findStations(STATIONS, '강남역', COLORS).map(hit => hit.name), ['강남']);
  assert.deepEqual(findStations(STATIONS, '  ', COLORS), []);
});
test('이름이 같은 역 → 그 말로 시작 → 포함 차례', () => {
  assert.deepEqual(findStations(STATIONS, '서울', COLORS).map(hit => hit.name), ['서울', '서울대입구', '남서울']);
});
test('역 줄은 좌표 · 노선 색을 갖고 모르는 노선은 기본 색이다', () => {
  assert.deepEqual(GANGNAM[0], { name: '강남', lat: 37.4979, lng: 127.0276, stationId: 3, lines: [{ name: '2호선', color: '#00a84d' }, { name: '없는선', color: '#52646a' }] });
});
test('한 목록: 역 먼저, 역 자체인 카카오 결과만 뺀다', () => {
  const near = { lat: 37.4985, lng: 127.0276 };
  const merged = mergeHits(GANGNAM, [
    { name: '강남역 2호선', address: 'a', ...near },
    { name: '강남역', address: 'b', ...near },
    { name: '강남역 스타벅스', address: 'c', ...near },
    { name: '강남역 2호선', address: 'd', lat: 37.6, lng: 127.2 },
    { name: '양재천', lat: 37.48, lng: 127.05 },
  ]);
  assert.deepEqual(merged.map(hit => hit.address ?? hit.name), ['강남', 'c', 'd', '양재천']);
  assert.equal(merged[0].lines?.length, 2);
});
test('경로 끝 이름: 역만 「역」을 붙인다', () => {
  assert.equal(endName(GANGNAM[0]), '강남역');
  assert.equal(endName({ name: '양재천', lat: 0, lng: 0 }), '양재천');
});
test('가까운 5분(하루를 넘으면 0시로)', () => {
  assert.equal(nearestFive('08:12'), '08:10');
  assert.equal(nearestFive('08:13'), '08:15');
  assert.equal(nearestFive('23:58'), '00:00');
  assert.equal(nearestFive('08:30'), '08:30');
});
test('승차권 등록 시각: 지난 시각이면 지금 기준 다음 5분, 내일 경로는 그대로', () => {
  const at = (hour, minute, second = 0) => new Date(2026, 10, 1, hour, minute, second);
  assert.equal(ticketTime('17:42', at(17, 42), false), '17:45');
  assert.equal(ticketTime('17:42', at(17, 50), false), '17:55', '결과를 오래 보다 눌렀다');
  assert.equal(ticketTime('17:38', at(17, 50), false), '17:55', '올려 맞춘 시각이 지났어도 같다');
  assert.equal(ticketTime('17:41', at(17, 40, 30), false), '17:45', '같은 분이면 이미 지난 것');
  assert.equal(ticketTime('17:42', at(17, 39), false), '17:40', '아직 안 지났으면 가까운 5분');
  assert.equal(ticketTime('18:00', at(17, 42), false), '18:00');
  assert.equal(ticketTime('23:58', at(23, 58), false), '00:00', '자정을 넘겨 올린 값은 그대로');
  assert.equal(ticketTime('23:50', at(23, 57), false), '00:00', '지금 기준 다음 5분이 자정을 넘는다');
  assert.equal(ticketTime('08:12', at(17, 42), true), '08:10', '내일 경로는 오후에 등록해도 가까운 5분');
});
test('역 자체 거르기: 그 역의 노선 · 철도 이름만 빠지고 가게 이름은 남는다', () => {
  const near = { lat: 37.4985, lng: 127.0276 }, seoul = findStations(STATIONS, '서울', COLORS).filter(hit => hit.name === '서울'), seoulNear = { lat: 37.555, lng: 126.972 };
  assert.deepEqual(mergeHits(GANGNAM, [{ name: '강남역 어선', ...near }]).map(hit => hit.name), ['강남', '강남역 어선']);
  assert.deepEqual(mergeHits(GANGNAM, [{ name: '강남역 3호선', ...near }]).map(hit => hit.name), ['강남', '강남역 3호선']);
  for (const name of ['서울역 공항철도', '서울역 KTX', '서울역 ktx', '서울역 SRT', '서울역 1호선', '서울역 1호선 KTX'])
    assert.deepEqual(mergeHits(seoul, [{ name, ...seoulNear }]).map(hit => hit.name), ['서울'], name);
});
test('맞바꾸기: 내 위치는 그 좌표로 도착이 되고, 출발로 돌아오면 다시 지금 위치를 쓴다', () => {
  const gangnam = { name: '강남역', lat: 1, lng: 2 }, here = { lat: 3, lng: 4 };
  const once = swappedEnds({ from: '내 위치', to: '강남역' }, { from: null, to: gangnam }, here, '내 위치');
  assert.deepEqual(once, { names: { from: '강남역', to: '내 위치' }, picked: { from: gangnam, to: { lat: 3, lng: 4, name: '내 위치' } } });
  const twice = swappedEnds(once.names, once.picked, gangnam, '내 위치');
  assert.deepEqual(twice, { names: { from: '내 위치', to: '강남역' }, picked: { from: null, to: gangnam } });
});
