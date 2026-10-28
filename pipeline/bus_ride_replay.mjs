// 버스 탑승 비교: 디버깅 페이지 버스 탑승(휴대폰 GPS 5초마다)을 정답으로, 그 노선의 서버 기록(서울시 버스 응답)을 화면처럼 다시 그려
// 슝이 그린 자리가 실제 버스와 몇 m 어긋났는지 잰다(bus_records.mjs replayDay, 방식 none · recent · pace). 읽기만 하고 서울시를 부르지 않는다.
//   node pipeline/bus_ride_replay.mjs --day 20261015 --ride <탑승 id>
// 차량 번호를 안 넣었으면 휴대폰 GPS 와 가장 가까이 움직인 차를 고른다. 왕복 노선은 가는 길 · 오는 길이 겹쳐서
// 첫 GPS 가 붙을 수 있는 자리마다 이어 붙여 보고 앞으로 가장 많이 간 쪽을 쓴다.
import fs from 'node:fs';
import {STATE, dayFile, readDay, loadRoutes, tracks, kst, replayDay} from './bus_records.mjs';
import {snapBusToPath} from '../web/bus/motion.mts';

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const day = arg('day'), ride = arg('ride');
if (!/^\d{8}$/.test(day || '') || !ride) { console.error('사용: node pipeline/bus_ride_replay.mjs --day YYYYMMDD --ride <탑승 id>'); process.exit(2); }
const fmt = ms => new Date(ms + 9 * 3600e3).toISOString().slice(11, 19);
const events = fs.readFileSync(`${STATE}/debug/rides/${day}.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.ride === ride);
const routes = loadRoutes(), rid = events.find(e => e.routeId)?.routeId, route = routes.get(rid);
if (!route) { console.error('그 탑승의 노선을 못 찾았어요'); process.exit(1); }

// 휴대폰 GPS → 노선 위 거리
const gps = events.filter(e => e.kind === 'gps' && e.lat).sort((a, b) => a.t - b.t);
const follow = start => {
  let hint = start; const out = [];
  for (const e of gps) {
    const s = snapBusToPath(route.path, [e.lng, e.lat], {hint, min: Math.max(0, hint - 100), maxError: 250}); if (!s) continue;
    hint = s.distance; out.push({t: e.t, d: s.distance, acc: e.acc});
  }
  return out;
};
const starts = [];
for (let d = 0; d < route.path.total; d += 200) {
  const s = snapBusToPath(route.path, [gps[0].lng, gps[0].lat], {min: d, max: d + 400, maxError: 250});
  if (s && !starts.some(x => Math.abs(x - s.distance) < 300)) starts.push(s.distance);
}
const phone = starts.map(follow).filter(c => c.length > gps.length * .8).sort((a, b) => (b.at(-1).d - b[0].d) - (a.at(-1).d - a[0].d))[0];
if (!phone) { console.error('휴대폰 GPS 를 노선에 못 붙였어요'); process.exit(1); }

const at = (list, t) => {
  for (let i = 1; i < list.length; i++) if (list[i - 1].t <= t && t <= list[i].t) {
    const a = list[i - 1], b = list[i];
    return b.t - a.t > 60000 ? null : a.d + (b.d - a.d) * (t - a.t) / Math.max(1, b.t - a.t);
  }
  return null;
};
const t0 = phone[0].t - 180000, t1 = phone.at(-1).t + 60000;
const rows = readDay(dayFile(day)).filter(r => r.routeId === rid && Date.parse(r.fetchedAt) >= t0 && Date.parse(r.fetchedAt) <= t1);
const tr = tracks(rows, routes);
let best = null;
for (const [key, list] of tr) {
  const diffs = list.map(o => { const p = at(phone, o.t); return p == null ? null : Math.abs(o.d - p); }).filter(x => x != null);
  const mean = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
  if (diffs.length >= 3 && (!best || mean < best.mean)) best = {key, mean, n: diffs.length};
}
if (!best) { console.error('그 시각 기록에 맞는 차가 없어요'); process.exit(1); }
const veh = best.key.split(':')[1], mine = rows.filter(r => r.vehId === veh);

console.log(`${route.name}번 · 차 ${veh} (휴대폰과 원자료 위치 평균 ${Math.round(best.mean)} m 차이, ${best.n}번 비교) · ${fmt(phone[0].t)}–${fmt(phone.at(-1).t)} · 휴대폰 GPS ${phone.length}점 · ${Math.round(phone.at(-1).d - phone[0].d)} m 이동`);
const seen = new Map(); for (const r of mine) if (r.dataTm && !seen.has(r.dataTm)) seen.set(r.dataTm, r);
const lag = [...seen.values()].map(r => Math.round((Date.parse(r.fetchedAt) - kst(r.dataTm)) / 1000)).sort((a, b) => a - b);
console.log(`원자료가 받은 때까지 늦은 시간: 가운데 ${lag[lag.length >> 1]}초 (${lag[0]}~${lag.at(-1)}초, ${lag.length}번)`);
const out = replayDay(mine, routes, {}, {truth: new Map([[best.key, phone.map(({t, d}) => ({t, d}))]])});
const names = {none: '앞지르지 않음(10-12 전)', recent: '최근 2분 속도로 앞지름(배우지 않은 노선의 지금 화면)'};   // 배운 빠르기는 밤 학습 표가 있어야 해서 아직 안 잰다
for (const [k, v] of Object.entries(out.results)) {
  if (!names[k]) continue;
  const g = v.gap30.n ? v.gap30 : v['gap60+'];
  if (g.n) console.log(`${names[k]}: 평균 ${g.meanAbs} m · 절반 ${g.p50Abs} m 안 · 90 % ${g.p90Abs} m 안 · 가운데 ${g.signedMedian > 0 ? '앞' : '뒤'} ${Math.abs(g.signedMedian)} m (${g.n}초)`);
}
