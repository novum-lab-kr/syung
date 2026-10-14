// 버스 기록(서버가 남긴 서울시 버스 응답, /var/lib/subway-live/bus/YYYYMMDD.jsonl[.gz]) 읽기와 구간 빠르기 학습 계산.
// bus_pace.mjs(밤마다 학습) · bus_replay.mjs(기록 재생 비교)가 같이 쓴다. 불러오기만 해서는 아무것도 하지 않는다.
// 선 · 정류장 맞추기는 화면(web/bus/layer.mjs)과 같은 함수(web/bus/motion.mjs)를 쓴다 — 학습한 칸이 화면의 거리와 같아야 한다.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildBusPath, snapBusToPath} from '../web/bus/motion.mjs';

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
