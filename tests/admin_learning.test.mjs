import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fmt, md, addDay, pct, r1, sightings, events, scores, scoreChart, scoreDelta, growth, lineTiers, stopRows, firstStopLine, openPass, CRITERIA, byLineOrder, lineColor,
} from '../web/admin/learning_data.mts';

// 관리 화면 '학습 현황'의 셈(admin/learning.tsx 가 그린다) — 옛 인라인 스크립트와 같은 글자 · 좌표

test('학습: 숫자 · 날짜 글자', () => {
  assert.equal(fmt(999), '999'); assert.equal(fmt(9999.6), '10,000'); assert.equal(fmt(12345), '1.2만'); assert.equal(fmt(2_345_678), '2.3백만');
  assert.equal(md('2026-10-07'), '10/7'); assert.equal(addDay('2026-11-01', -1), '2026-10-31'); assert.equal(addDay('2026-12-31', 1), '2027-01-01');
  assert.equal(pct(1.123), 12); assert.equal(pct(0.95), -5); assert.equal(r1(14.26), 14.3); assert.equal(r1(null), null);
  const day = { date: '2026-10-18', samples: { sightings: 10, event: 4 }, position: { sightings: 5 } };
  assert.equal(sightings(day), 15); assert.equal(events(day), 4);
  assert.deepEqual(['9호선', '경의중앙선', '1호선', '없는 노선'].sort(byLineOrder), ['없는 노선', '1호선', '9호선', '경의중앙선']);
  assert.equal(lineColor('2호선'), '#00A84D'); assert.equal(lineColor('x'), '#888');
});

test('학습: 채점 목록 · 큰 숫자 옆 글자', () => {
  const list = scores([{ date: '2026-10-08', candidate: { all: 5 } }, { date: '2026-10-09', result: 'published', candidate: { mean: 14.26, n: 900 }, current: { mean: 15.04 } }]);
  assert.deepEqual(list.map(item => [item.day, item.cand, item.cur, item.n]), [['2026-10-08', 14.3, 15, 900]]);
  assert.deepEqual(scoreDelta(list[0]), { cls: 'delta down', text: '▼ 같은 날 쓰던 값(15초)보다 0.7초 좋아졌어요' });
  assert.deepEqual(scoreDelta({ ...list[0], cur: null }), { cls: 'delta same', text: '첫 채점' });
  assert.deepEqual(scoreDelta({ ...list[0], result: 'kept current' }), { cls: 'delta up', text: '쓰던 값(15초)이 더 나아 그대로 써요' });
  assert.equal(scoreDelta({ ...list[0], cand: 15.5 }).text, '쓰던 값(15초)과 거의 같아요');
  assert.equal(scoreDelta({ ...list[0], cand: 15 }).text, '같은 날 쓰던 값도 15초 · 그대로예요');
});

test('학습: 채점 그래프 · 누적 그래프 좌표', () => {
  assert.equal(scoreChart([]), null);
  const chart = scoreChart([{ day: '2026-10-07', cand: 14, cur: null, kinds: {} }, { day: '2026-10-08', cand: 12, cur: 13, kinds: {} }]);
  assert.deepEqual(chart.grid.map(row => row.label), [11, 13, 15]);
  assert.deepEqual(chart.points.map(point => [point.x, point.cur, point.candY, point.label]), [[76, null, 58.5, '10/7'], [520, 91, 123.5, '10/8']]);
  assert.equal(growth([], () => 1), null);
  const grown = growth([{ date: '2026-10-01', n: 10 }, { date: '2026-10-02', n: 30 }], day => day.n);
  assert.equal(grown.total, 40); assert.equal(grown.line, '32,156.27272727272728 528,43.09090909090909');
  assert.deepEqual(grown.points.map(point => point.value), [{ text: '10', anchor: 'start' }, { text: '40', anchor: 'end' }]);
  assert.equal(growth([{ date: '2026-10-01', n: 5 }], day => day.n).points[0].x, 280);
});

test('학습: 노선 묶음 · 역 상태 · 처음 여는 노선', () => {
  const latest = { lines: { '2호선': { pace: 1.05, zone: 40, stops: { 201: 55 } }, '9호선': {} }, default: { zone: 35 }, n: { '2호선': { pace: 2500 }, '7호선': { pace: 400 } },
    stations: { '2호선': [201, 202, 203, 204], '9호선': [901] }, stands: { '2호선': { 201: [40, 54], 202: [10, null, 31], 203: [5, 30] }, '9호선': { 901: [31, 36] } }, names: { 201: '시청' } };
  assert.deepEqual(lineTiers(latest, []).map(group => group.lines.map(item => item.line)), [['2호선'], ['7호선'], ['9호선']]);
  const { rows, summary } = stopRows(latest, '2호선');
  assert.deepEqual(rows.map(row => [row.name, row.use, row.own, row.status[1]]), [['시청', 55, true, '따로 배움'], ['역 202', 40, false, '평균과 비슷'], ['역 203', 40, false, '모으는 중 0/30'], ['역 204', 40, false, '모으는 중 0/30']]);
  assert.equal(summary, '2호선 4개 역 · 따로 배움 1 · 평균과 비슷 1 · 모으는 중 2 · 노선 평균 40초');
  assert.equal(stopRows(latest, '9호선').summary, '9호선 1개 역 · 따로 배움 0 · 평균과 비슷 1 · 모으는 중 0 · 노선 평균 35초 (기본값)');
  assert.equal(firstStopLine(latest, ['2호선', '9호선']), '2호선');
});

test('학습: 오픈 기준 통과 창', () => {
  const good = { line: '2호선', window: '출근', events: 9, arrive: { signedMedian: -3, absMedian: 9, p90: 20 }, depart: { signedMedian: 4, absMedian: 10, p90: 25 }, stalls: { n: 0 } };
  assert.equal(openPass([good, { ...good, stalls: { n: 1 } }, { ...good, arrive: {} }], CRITERIA), 1);
});
