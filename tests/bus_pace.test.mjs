import test from 'node:test';
import assert from 'node:assert/strict';
import {paceSums, addSums, paceTable, kst} from '../pipeline/bus_records.mjs';

// 버스 구간 빠르기 학습(pipeline/bus_records.mjs, 밤마다 bus_pace.mjs): 서 있던 칸은 느리게, 노선을 다 못 지난 시간대는 뺀다
const routes = new Map([['R', {path: {total: 1000}}]]);
const t = s => kst('20261014080000') + s * 1000;   // KST 08시

test('time between two observations goes to the 50 m pieces between them; standing still goes to the piece it stood in', () => {
  const track = [{t: t(0), d: 0}, {t: t(50), d: 500}, {t: t(80), d: 501}, {t: t(130), d: 1000}];   // 10 m/s, 500 m 에서 30초 섬
  const sums = paceSums(new Map([['R:1', track]]), routes);
  const [time, dist] = sums.R.hours[8];
  assert.equal(time[0], 5000); assert.equal(dist[0], 50);
  assert.equal(time[10], 30000 + Math.round(50000 * 49 / 499), '서 있던 30초 + 그 칸(501~550 m)을 지난 몫');
  const table = paceTable(addSums([sums, sums], routes));
  assert.equal(table.R.bin, 50);
  const pace = table.R.hours[8];
  assert.ok(pace[10] > 3 * pace[3], `정류장 칸이 느리다 (${pace[10]} vs ${pace[3]} ms/m)`);
  assert.ok(Math.abs(pace[3] - 100) < 30, '다른 칸은 약 10 m/s');
});

test('an hour that never covered the route, gaps over 90 s and backward jumps are not learned', () => {
  const sums = paceSums(new Map([['R:1', [{t: t(0), d: 0}, {t: t(20), d: 200}, {t: t(200), d: 400}, {t: t(210), d: 100}]]]), routes);
  assert.equal(sums.R.hours[8][1].reduce((a, b) => a + b, 0), 200, '첫 20초만');
  assert.deepEqual(paceTable(sums), {}, '200 m 로는 1 km 노선을 못 배운다');
  const changed = new Map([['R', {path: {total: 1200}}]]);
  assert.deepEqual(addSums([paceSums(new Map([['R:1', [{t: t(0), d: 0}, {t: t(60), d: 1000}]]]), routes)], changed), {}, '노선 길이가 바뀌면 옛 합은 버린다');
});
