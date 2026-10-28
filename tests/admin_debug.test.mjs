import test from 'node:test';
import assert from 'node:assert/strict';
import {
  elapsed, lineGraph, lineStations, nearest, batchSize, closeCell, motionChunks, ridingView, busLabel, compareRows, dayLabel, rideTitle, rideLine, fmt,
} from '../web/admin/debug_data.mts';

// 관리 화면 '디버깅'의 셈(admin/debug.tsx 가 그린다) — 옛 인라인 스크립트와 같은 글자
const STATIONS = new Map([[1, { id: 1, name: '시청', lat: 37.5657, lon: 126.9769 }], [2, { id: 2, name: '을지로입구', lat: 37.566, lon: 126.9826 }],
  [3, { id: 3, name: '충정로', lat: 37.5597, lon: 126.9636 }], [4, { id: 4, name: '종각', lat: 37.5702, lon: 126.983 }]]);
const GRAPH = lineGraph(['2호선:1:2', '2호선:3:1', '1호선:1:4', '공항철도:3:9', '10호선:9:3']);

test('디버깅: 노선 이웃 · 노선 차례 · 노선의 역 · 가까운 역', () => {
  assert.deepEqual(GRAPH.lines, ['1호선', '2호선', '10호선', '공항철도']);
  assert.deepEqual(GRAPH.neighbors.get('2호선:1'), [2, 3]); assert.deepEqual(GRAPH.neighbors.get('2호선:2'), [1]);
  assert.deepEqual(lineStations(STATIONS, GRAPH.neighbors, '2호선').map(station => station.name), ['시청', '을지로입구', '충정로']);
  assert.equal(nearest(lineStations(STATIONS, GRAPH.neighbors, '2호선'), 37.566, 126.982)?.name, '을지로입구');
  assert.equal(nearest([], 37, 127), undefined);
});

test('디버깅: 보낼 묶음 · 센서 칸 · 탄 지', () => {
  assert.equal(batchSize(Array.from({ length: 700 }, () => ({ kind: 'gps' }))), 500);
  assert.equal(batchSize([...Array.from({ length: 45 }, () => ({ kind: 'motion' })), { kind: 'arrive' }]), 40);
  assert.equal(batchSize([]), 0);
  assert.deepEqual(closeCell({ slot: 1000, sum: [3, 0, 1], n: [2, 0, 3] }), [1000, 1.5, null, 0.33]);
  const bins = Array.from({ length: 150 }, (_, index) => [1000 + index * 100, index]);
  const chunks = motionChunks(bins, 1000);
  assert.equal(chunks.length, 2); assert.equal(chunks[0]?.length, 280); assert.deepEqual(chunks[1]?.slice(0, 2), [14000, 140]);
  assert.equal(elapsed(0), '0:00'); assert.equal(elapsed(125_900), '2:05');
});

test('디버깅: 탑승 중 글자(지하철 · 버스)', () => {
  const standing = ridingView({ id: 'r', mode: 'subway', line: '2호선', train: '7123', path: [3, 1], moving: false }, STATIONS, GRAPH.neighbors, null);
  assert.deepEqual(standing, { nextPick: 2, what: '2호선 · 7123열차', where: '시청', phase: '역에 서 있음 · 문 닫고 출발하면 누르세요', nextsHidden: true,
    nexts: [{ id: 2, name: '을지로입구', pressed: true }], act: '출발' });
  const moving = ridingView({ id: 'r', mode: 'subway', line: '2호선', train: '', path: [1], moving: true }, STATIONS, GRAPH.neighbors, 3);
  assert.equal(moving.nextPick, 3); assert.equal(moving.where, '→ 충정로'); assert.equal(moving.phase, '시청 출발함 · 역에 서면 누르세요');
  assert.equal(moving.nextsHidden, false); assert.equal(moving.act, '충정로 도착'); assert.equal(moving.what, '2호선');
  const lost = ridingView({ id: 'r', mode: 'subway', line: '2호선', path: [9], moving: true }, STATIONS, GRAPH.neighbors, null);
  assert.deepEqual([lost.nextPick, lost.where, lost.act], [null, '→ ?', '다음 역 도착']);
  assert.deepEqual(ridingView({ id: 'r', mode: 'bus', routeName: '3011', vehicle: '1234', stops: 2, moving: true }, STATIONS, GRAPH.neighbors, 5),
    { nextPick: 5, what: '3011번 · 1234', where: '달리는 중', phase: '정류장 2곳 · GPS 는 5초마다 저절로', nextsHidden: true, nexts: [], act: '정류장 도착' });
  assert.equal(busLabel({ id: '1', name: '3011', start: '강동', end: '잠실' }), '3011 · 강동→잠실'); assert.equal(busLabel({ id: '1', name: '3011' }), '3011');
});

test('디버깅: 누름 ↔ 센서 표', () => {
  const at = Date.UTC(2026, 9, 28, 1, 0, 0);
  const rows = compareRows({ ride: 'r', mode: 'bus', line: '3011', from: at, to: at, stops: 1, gps: 0,
    taps: [{ kind: 'depart', t: at }, { kind: 'arrive', t: at + 120_000 }],
    sensor: [{ kind: 'depart', t: at + 4000 }, { kind: 'arrive', t: at + 300_000 }], series: [[at, 0]] });
  assert.deepEqual(rows, [['처음', '출발', fmt(at), fmt(at + 4000), '+4초'], ['정류장 1', '도착', fmt(at + 120_000), '못 잡음', ''],
    ['(센서만)', '도착', '—', fmt(at + 300_000), '']]);
  const subway = compareRows({ ride: 'r', mode: 'subway', line: '2호선', from: at, to: at, stops: 0, gps: 0, taps: [{ kind: 'arrive', t: at, station: '시청' }],
    sensor: [{ kind: 'arrive', t: at - 3000 }, { kind: 'arrive', t: at - 1000 }] });
  assert.deepEqual(subway, [['(센서만)', '도착', '—', fmt(at - 3000), ''], ['시청', '도착', fmt(at), fmt(at - 1000), '-1초']]);
});

test('디버깅: 날짜 · 탑승 줄', () => {
  assert.equal(dayLabel('20261028', ['20261028', '20261027']), '10월 28일 (오늘)'); assert.equal(dayLabel('20261007', ['20261028']), '10월 7일');
  const ride = { ride: 'r', mode: 'bus', line: null, from: 0, to: 60_000, stops: 3, gps: 12, taps: [] };
  assert.equal(rideTitle(ride), '버스 '); assert.equal(rideTitle({ ...ride, mode: 'subway', line: '2호선' }), '지하철 2호선');
  assert.equal(rideLine(ride), `${fmt(0)}~${fmt(60_000)} · 도착 3번 · GPS 12점`); assert.ok(rideLine({ ...ride, series: [] }).endsWith(' · 센서 있음'));
});
