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

test('replayDay scores a day against the observations: learned pace beats not leading on a bus that keeps moving', async () => {
  const {replayDay} = await import('../pipeline/bus_records.mjs');
  const {buildBusPath} = await import('../web/bus/motion.mjs');
  const path = buildBusPath([[127.0, 37.5], [127.05, 37.5]]);   // 동쪽으로 약 4.4 km
  path.stops = [];
  const rmap = new Map([['R', {id: 'R', path, approximate: false, sequences: []}]]);
  const stamp = ms => new Date(ms + 9 * 3600000).toISOString().replace(/\D/g, '').slice(0, 14);
  const rows = [];
  for (let s = 0; s <= 400; s += 30) {   // 10 m/s, 30초마다 받고 원자료는 15초 늦다
    const seen = t(s) - 15000, d = 10 * (s - 15) + 150;
    rows.push({routeId: 'R', vehId: '1', isrunyn: '1', sectOrd: '1', fetchedAt: new Date(t(s)).toISOString(), dataTm: stamp(seen),
      gpsX: String(127.0 + 0.05 * d / path.total), gpsY: '37.5'});
  }
  const table = {R: {bin: 50, hours: {8: new Array(Math.ceil(path.total / 50) + 1).fill(100)}}};   // 100 ms/m = 10 m/s 로 배움
  const out = replayDay(rows, rmap, table);
  assert.equal(out.trainedRoutes, 1);
  const none = out.results.none.gap30, pace = out.results.pace.gap30;
  assert.ok(none.n > 100 && pace.n === none.n);
  assert.ok(none.signedMedian < -100, `앞지르지 않으면 늘 뒤 (${none.signedMedian} m)`);
  assert.ok(pace.meanAbs < none.meanAbs / 2, `배운 빠르기는 훨씬 가깝다 (${pace.meanAbs} vs ${none.meanAbs} m)`);
  assert.equal(replayDay(rows, rmap, {}).trainedRoutes, 0, '배운 노선이 없으면 매기지 않는다');
});
