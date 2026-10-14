// 버스 기록 재생: 서버가 남긴 서울시 버스 응답(/var/lib/subway-live/bus/YYYYMMDD.jsonl[.gz])으로 화면이 그렸을 자리를 다시 만들어
// 실제 GPS(뒤에 온 관측을 이은 것)와 1초마다 비교한다. 서울시 호출 없이 기록만 읽는다(덕배 2026-10-14: 버스는 지금 호출로 학습).
//   node pipeline/bus_replay.mjs --day 20261013 [--train 20261007,20261008,…] [--route 100100075] [--hours 7-10] [--json]
// 화면 쪽 계산은 web/bus/motion.mjs 를 그대로 쓴다(앞지르기 · 움직임). 배운 빠르기는 밤 학습(bus_pace.mjs)과 같은 계산 · 같은 꼴.
// 정답은 관측 사이를 거리로 이은 것이라 관측 사이에 신호 · 정류장에서 선 것은 정답에도 안 보인다 — 실제 오차는 이보다 크다. 방식끼리 견주는 데만 쓴다.
// 결과는 받기 간격으로 나눈다: gap30 = 30초마다(지도가 보는 노선), gap60+ = 그보다 드물게(학습용 수집만).
import fs from 'node:fs';
import {STATE, dayFile, readDay, kst, loadRoutes, snapRow, tracks, paceSums, addSums, paceTable} from './bus_records.mjs';
import {busLeadDistance, busPaceLead, busKstHour, nextBusMotion, retimeBusMotion, busMotionDistance} from '../web/bus/motion.mjs';

const STALE_MS = 120000, SLACK_MS = 2500, TRUTH_GAP_MS = 60000;

function args() {
  const out = {hours: [0, 24]};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--day') out.day = a[++i];
    else if (a[i] === '--train') out.train = a[++i].split(',');
    else if (a[i] === '--route') out.route = a[++i];
    else if (a[i] === '--hours') out.hours = a[++i].split('-').map(Number);
    else if (a[i] === '--json') out.json = true;
  }
  return out;
}

// 실제 자리: 그 시각을 감싸는 두 관측을 거리로 잇는다(사이가 60초 넘거나 뒤로 가면 모름)
function truthAt(list, t) {
  let lo = 0, hi = list.length - 1;
  if (!list.length || t < list[0].t || t > list[hi].t) return null;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (list[mid].t <= t) lo = mid; else hi = mid; }
  const a = list[lo], b = list[hi];
  if (b.t - a.t > TRUTH_GAP_MS || b.d < a.d - 30) return null;
  return b.t === a.t ? a.d : a.d + (b.d - a.d) * (t - a.t) / (b.t - a.t);
}

// 한 노선의 응답들을 차례로 화면처럼 받아(layer.mjs setLiveData) 1초마다 (그린 자리 − 실제 자리)를 모은다
function replayRoute(route, rows, truth, lead, hours, sink) {
  const calls = new Map();
  for (const r of rows) { if (!calls.has(r.fetchedAt)) calls.set(r.fetchedAt, []); calls.get(r.fetchedAt).push(r); }
  const times = [...calls.keys()].sort();
  const fleet = new Map();
  times.forEach((stamp, i) => {
    const wall = Date.parse(stamp), next = i + 1 < times.length ? Date.parse(times[i + 1]) : wall + 30000;
    const interval = Math.min(60000, Math.max(5000, next - wall)) + SLACK_MS, seen = new Set();
    for (const row of calls.get(stamp)) {
      if (row.isrunyn === '0' || !row.dataTm) continue;
      const id = row.vehId, previous = fleet.get(id), observed = kst(row.dataTm);
      if (previous && observed < previous.observed) { seen.add(id); continue; }
      const stale = wall - observed > STALE_MS;
      const snap = snapRow(route, row, previous?.snapped ?? previous?.motion.to ?? null); if (!snap) continue;
      seen.add(id);
      const same = previous && previous.observed === observed && Math.abs(previous.snapped - snap.distance) < 1;
      const history = same ? previous.history : previous?.snapped == null ? []
        : [...previous.history, {t: previous.observed, d: previous.snapped}].filter(h => observed - h.t <= 120000 && h.d <= snap.distance + 30);
      const target = stale ? snap.distance : lead({history, distance: snap.distance, observed, at: wall + interval, route});
      const motion = same ? retimeBusMotion(previous.motion, wall, interval) : nextBusMotion(previous?.motion, target, wall, {interval, stale, hold: true});
      fleet.set(id, {observed, snapped: snap.distance, history, motion, stale});
    }
    for (const id of fleet.keys()) if (!seen.has(id)) fleet.delete(id);
    const hour = busKstHour(wall);
    if (hour < hours[0] || hour >= hours[1]) return;
    for (const [id, bus] of fleet) {
      if (bus.stale) continue;
      const list = truth.get(`${route.id}:${id}`); if (!list) continue;
      for (let t = wall; t < Math.min(next, wall + 60000); t += 1000) {
        const real = truthAt(list, t); if (real == null) continue;
        sink[next - wall <= 40000 ? 'gap30' : 'gap60+'].push(busMotionDistance(bus.motion, t) - real);
      }
    }
  });
}

const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
function summary(errors) {
  const abs = errors.map(Math.abs);
  return {n: errors.length, meanAbs: Math.round(abs.reduce((s, x) => s + x, 0) / (abs.length || 1)),
    p50Abs: Math.round(quant(abs, .5)), p90Abs: Math.round(quant(abs, .9)), signedMedian: Math.round(quant(errors, .5))};
}

function main() {
  const opt = args();
  if (!opt.day) { console.error('사용: node pipeline/bus_replay.mjs --day YYYYMMDD [--train 날짜,…] [--route ID] [--hours 7-10] [--json]'); process.exit(2); }
  const routes = loadRoutes();
  const only = rows => rows.filter(r => routes.has(r.routeId) && (!opt.route || r.routeId === opt.route));
  const train = opt.train || fs.readdirSync(`${STATE}/bus`).map(f => f.slice(0, 8)).filter(d => /^\d{8}$/.test(d) && d < opt.day).sort();
  const table = paceTable(addSums(train.filter(d => dayFile(d)).map(d => paceSums(tracks(only(readDay(dayFile(d))), routes), routes)), routes));
  const rows = only(readDay(dayFile(opt.day)));
  const truth = tracks(rows, routes);
  const ways = {
    // 앞지르지 않음(10-12 전)
    none: ({distance}) => distance,
    // 최근 2분 속도로 다음 정류장까지 · 400 m · 90초(10-12 ~)
    recent: ({history, distance, observed, at, route}) => busLeadDistance(history, distance, observed, at, route.path.stops.map(s => s.distance)),
    // 배운 구간 빠르기, 그 시간대를 모르면 최근 2분 속도(화면 layer.mjs 와 같은 차례)
    pace: a => busPaceLead(table[a.route.id]?.hours[busKstHour(a.observed)], table[a.route.id]?.bin, a.distance, a.observed, a.at) ?? ways.recent(a),
  };
  // 견주기는 배운 노선만(못 배운 노선은 pace 도 recent 로 떨어져 차이를 흐린다)
  const byRoute = new Map(), results = {};
  for (const r of rows) if (table[r.routeId]) { if (!byRoute.has(r.routeId)) byRoute.set(r.routeId, []); byRoute.get(r.routeId).push(r); }
  for (const [name, lead] of Object.entries(ways)) {
    const sink = {'gap30': [], 'gap60+': []};
    for (const [rid, list] of byRoute) replayRoute(routes.get(rid), list, truth, lead, opt.hours, sink);
    results[name] = Object.fromEntries(Object.entries(sink).map(([k, v]) => [k, summary(v)]));
  }
  const out = {day: opt.day, train, hours: opt.hours, routes: new Set(rows.map(r => r.routeId)).size, trainedRoutes: byRoute.size, results};
  console.log(opt.json ? JSON.stringify(out) : JSON.stringify(out, null, 1));
}

main();
