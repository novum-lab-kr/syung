// 버스 기록(서버가 남긴 서울시 버스 응답, /var/lib/subway-live/bus/YYYYMMDD.jsonl[.gz]) 읽기와 구간 빠르기 학습 계산.
// bus_pace.mjs(밤마다 학습) · bus_replay.mjs(기록 재생 비교)가 같이 쓴다. 불러오기만 해서는 아무것도 하지 않는다.
// 선 · 정류장 맞추기는 화면(web/bus/layer.mjs)과 같은 함수(web/bus/motion.mjs)를 쓴다 — 학습한 칸이 화면의 거리와 같아야 한다.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildBusPath, snapBusToPath, busLeadDistance, busPaceLead, busKstHour, nextBusMotion, retimeBusMotion, busMotionDistance} from '../web/bus/motion.mts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATE = '/var/lib/subway-live';
export const PACE_BIN_M = 50;
const PRIOR_M = 100;   // 칸 자료가 적으면 이만큼(m)의 무게로 같은 칸 모든 시간 · 그 시간대 노선 평균에 기댄다

export function readDay(file) {
  const text = file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)).toString('utf8') : fs.readFileSync(file, 'utf8');
  return text.split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// 그 날 기록 파일(없으면 null): 다 받은 날은 .gz
export function dayFile(day, dir = `${STATE}/bus`) {
  for (const f of [`${dir}/${day}.jsonl`, `${dir}/${day}.jsonl.gz`]) if (fs.existsSync(f)) return f;
  return null;
}

// 'YYYYMMDDHHMMSS'(KST) → ms
export const kst = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10) - 9, +s.slice(10, 12), +s.slice(12, 14));
export const kstHour = ms => new Date(ms + 9 * 3600000).getUTCHours();

export function loadRoutes(root = ROOT) {
  const routes = JSON.parse(fs.readFileSync(`${root}/data/bus/routes.json`, 'utf8')).routes;
  const stops = new Map(JSON.parse(fs.readFileSync(`${root}/data/bus/stops.json`, 'utf8')).stops.map(s => [s.id, s]));
  const byId = new Map();
  for (const raw of routes) {
    // layer.mjs prepareBusData · geometry 와 같게: 도로에 맞춘 선(line) 우선, 정류장은 앞에서부터 차례로 맞춘다
    const entries = (raw.stopIds || []).map((id, i) => ({id, sequence: raw.stopSequences?.[i]})).filter(s => stops.has(s.id));
    const p = buildBusPath(raw.line) || buildBusPath(raw.path); if (!p) continue;
    let previous = 0;
    p.stops = entries.map(e => {
      const s = stops.get(e.id), snapped = snapBusToPath(p, [s.lng, s.lat], {hint: previous, min: previous, maxError: 1000});
      previous = snapped?.distance ?? previous;
      return {distance: previous};
    });
    byId.set(raw.id, {id: raw.id, name: raw.name, path: p, approximate: raw.pathSource !== 'api',
      sequences: entries.map(e => Number.isInteger(e.sequence) ? e.sequence : null)});
  }
  return byId;
}

// 정류장 순번 창 안에서 선에 맞춘다(layer.mjs setLiveData 와 같은 창)
export function snapRow(route, row, hint) {
  const p = route.path, seq = route.sequences.indexOf(Number(row.sectOrd));
  let min = 0, max = p.total;
  if (seq >= 0 && p.stops[seq] && p.stops[seq + 1]) { min = Math.max(0, p.stops[seq].distance - 50); max = Math.min(p.total, p.stops[seq + 1].distance + 50); }
  return snapBusToPath(p, [Number(row.gpsX), Number(row.gpsY)], {hint, min, max, maxError: route.approximate ? 700 : 250});
}

// 노선 · 차마다 서로 다른 관측 Map('노선:차' → [{t, d}]), 원자료 시각 차례
export function tracks(rows, routes) {
  const byVehicle = new Map();
  for (const r of rows) {
    if (!routes.has(r.routeId) || !r.dataTm || r.isrunyn === '0') continue;
    const key = `${r.routeId}:${r.vehId}`;
    if (!byVehicle.has(key)) byVehicle.set(key, new Map());
    byVehicle.get(key).set(r.dataTm, r);
  }
  const out = new Map();
  for (const [key, seen] of byVehicle) {
    const route = routes.get(key.split(':')[0]), list = [];
    let hint = null;
    for (const r of [...seen.values()].sort((a, b) => a.dataTm.localeCompare(b.dataTm))) {
      const snap = snapRow(route, r, hint); if (!snap) continue;
      hint = snap.distance;
      list.push({t: kst(r.dataTm), d: snap.distance});
    }
    out.set(key, list);
  }
  return out;
}

// 하루 기록 → 노선 · 시간대 · BIN m 칸마다 걸린 시간(ms) · 간 거리(m) 합: {routeId: {total, hours: {h: [time[], dist[]]}}}
// 이어진 두 관측 사이 시간을 그 사이 칸에 거리만큼 나눠 준다. 거의 안 움직였으면(정류장 · 신호) 그 칸에 시간만.
export function paceSums(trackMap, routes, {bin = PACE_BIN_M, minGap = 5000, maxGap = 90000, maxStep = 1500} = {}) {
  const out = {};
  for (const [key, list] of trackMap) {
    const rid = key.split(':')[0], total = routes.get(rid).path.total, bins = Math.ceil(total / bin) + 1;
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i], dt = b.t - a.t, dd = b.d - a.d;
      if (dt < minGap || dt > maxGap || dd < -5 || dd > maxStep) continue;
      out[rid] ??= {total: Math.round(total), hours: {}};
      const h = (out[rid].hours[kstHour(a.t)] ??= [new Array(bins).fill(0), new Array(bins).fill(0)]);
      if (dd < 5) { h[0][Math.min(bins - 1, Math.floor(a.d / bin))] += dt; continue; }
      for (let k = Math.floor(a.d / bin); k * bin < b.d && k < bins; k++) {
        const part = Math.min(b.d, (k + 1) * bin) - Math.max(a.d, k * bin);
        if (part > 0) { h[0][k] += dt * part / dd; h[1][k] += part; }
      }
    }
  }
  for (const r of Object.values(out)) for (const h of Object.values(r.hours)) for (const a of h) a.forEach((x, i) => { a[i] = Math.round(x); });
  return out;
}

// 여러 날 합을 더한다(선 길이가 1 % 넘게 다른 날은 노선 자료가 바뀐 것이라 뺀다)
export function addSums(days, routes) {
  const out = {};
  for (const day of days) for (const [rid, r] of Object.entries(day)) {
    const route = routes.get(rid); if (!route || Math.abs(route.path.total - r.total) > route.path.total * .01) continue;
    const acc = (out[rid] ??= {total: r.total, hours: {}});
    for (const [hour, [time, dist]] of Object.entries(r.hours)) {
      const h = (acc.hours[hour] ??= [new Array(time.length).fill(0), new Array(time.length).fill(0)]);
      for (let k = 0; k < Math.min(time.length, h[0].length); k++) { h[0][k] += time[k]; h[1][k] += dist[k]; }
    }
  }
  return out;
}

// 합 → 노선마다 {bin, hours: {h: [칸마다 ms/m 정수]}}. 노선을 한 번도 다 못 지난 시간대는 뺀다(화면은 그때 최근 2분 속도로)
export function paceTable(sums, {bin = PACE_BIN_M} = {}) {
  const out = {};
  const sum = a => a.reduce((s, x) => s + x, 0);
  for (const [rid, r] of Object.entries(sums)) {
    const bins = Object.values(r.hours)[0]?.[0].length || 0;
    const allT = new Array(bins).fill(0), allD = new Array(bins).fill(0);
    for (const [time, dist] of Object.values(r.hours)) for (let k = 0; k < bins; k++) { allT[k] += time[k]; allD[k] += dist[k]; }
    const whole = sum(allT) / Math.max(1, sum(allD)), hours = {};
    for (const [hour, [time, dist]] of Object.entries(r.hours)) {
      if (sum(dist) < r.total) continue;
      const mean = (sum(time) + PRIOR_M * whole) / (sum(dist) + PRIOR_M);
      hours[hour] = time.map((t, k) => {
        const binAll = (allT[k] + PRIOR_M * mean) / (allD[k] + PRIOR_M);
        return Math.max(20, Math.round((t + PRIOR_M * binAll) / (dist[k] + PRIOR_M)));   // 20 ms/m = 180 km/h 아래로는 안 간다
      });
    }
    if (Object.keys(hours).length) out[rid] = {bin, hours};
  }
  return out;
}

// ── 기록 재생(bus_replay.mjs · 밤 학습 채점 bus_pace.mjs): 서버가 받은 응답을 화면처럼 차례로 받아 1초마다 (그린 자리 − 실제 자리)
// 정답은 관측 사이를 거리로 이은 것이라 관측 사이에 신호 · 정류장에서 선 것은 정답에도 안 보인다 — 실제 오차는 이보다 크다. 방식끼리 견주는 데만 쓴다.
// 결과는 받기 간격으로 나눈다: gap30 = 30초마다(지도가 보는 노선), gap60+ = 그보다 드물게(학습용 수집만).
const STALE_MS = 120000, SLACK_MS = 2500, TRUTH_GAP_MS = 60000;

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
export function summary(errors) {
  const abs = errors.map(Math.abs);
  return {n: errors.length, meanAbs: Math.round(abs.reduce((s, x) => s + x, 0) / (abs.length || 1)),
    p50Abs: Math.round(quant(abs, .5)), p90Abs: Math.round(quant(abs, .9)), signedMedian: Math.round(quant(errors, .5))};
}

// 앞지르는 방식 셋: none(10-12 전) · recent(최근 2분 속도, 10-12 ~) · pace(배운 구간 빠르기, 모르면 recent — 화면 layer.mjs 와 같은 차례)
export function leadWays(table) {
  const ways = {
    none: ({distance}) => distance,
    recent: ({history, distance, observed, at, route}) => busLeadDistance(history, distance, observed, at, route.path.stops.map(s => s.distance)),
    pace: a => busPaceLead(table[a.route.id]?.hours[busKstHour(a.observed)], table[a.route.id]?.bin, a.distance, a.observed, a.at) ?? ways.recent(a),
  };
  return ways;
}

// 그 날 기록(rows)을 방식마다 화면처럼 다시 그려 거리 오차를 잰다. 견주기는 배운 노선만(못 배운 노선은 pace 도 recent 로 떨어져 차이를 흐린다)
// truth: 정답을 따로 줄 때('노선:차' → [{t, d}], 예: 탄 사람 휴대폰 GPS) — 그때는 배우지 않은 노선도 매긴다
export function replayDay(rows, routes, table, {hours = [0, 24], truth = null} = {}) {
  const given = !!truth, byRoute = new Map(), results = {};
  truth ??= tracks(rows, routes);
  for (const r of rows) if ((given || table[r.routeId]) && routes.has(r.routeId)) { if (!byRoute.has(r.routeId)) byRoute.set(r.routeId, []); byRoute.get(r.routeId).push(r); }
  for (const [name, lead] of Object.entries(leadWays(table))) {
    const sink = {'gap30': [], 'gap60+': []};
    for (const [rid, list] of byRoute) replayRoute(routes.get(rid), list, truth, lead, hours, sink);
    results[name] = Object.fromEntries(Object.entries(sink).map(([k, v]) => [k, summary(v)]));
  }
  return {routes: new Set(rows.map(r => r.routeId)).size, trainedRoutes: byRoute.size, results};
}
