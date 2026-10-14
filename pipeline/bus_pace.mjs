// 밤마다: 버스 기록으로 노선 구간 빠르기를 배워 화면이 읽을 파일로 낸다(덕배 2026-10-14). retrain_live_timing.py 가 부른다.
//   node pipeline/bus_pace.mjs --web /var/www/syung [--out 폴더]      (--web 없으면 계산 · 저장만, 웹 폴더는 안 건드린다)
// 1. 다 받은 날(오늘 KST 전)마다 노선 · 시간대 · 50 m 칸의 시간 · 거리 합을 한 번만 만든다: STATE/bus-pace/days/YYYYMMDD.json.gz
//    (그 날 기록 파일 크기가 바뀌면 다시)
// 2. 최근 KEEP_DAYS 일 합을 더해 노선마다 {bin, hours: {시: [ms/m]}} → STATE/bus-pace/web/<노선>.json + index.json(배운 노선 목록)
// 3. --web 이면 그 폴더의 data/bus/pace/ 에도 같은 파일(배포는 deploy.sh 가 STATE 것을 새 릴리스에 넣는다)
// 4. 채점: 아직 안 한 날마다 그 전 날들로 배운 빠르기로 그 날을 다시 그려(bus_records.mjs replayDay) 방식별 거리 오차
//    → STATE/bus-pace/scores.json(학습 현황 페이지가 build_learning_stats.py 로 읽는다). 처음 한 번은 날마다 약 20초
// 학습 노선은 날마다 바뀐다(server/jobs/bus_samples.py) — 한 번 배운 노선은 KEEP_DAYS 동안 남는다.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {STATE, dayFile, readDay, loadRoutes, tracks, paceSums, addSums, paceTable, replayDay} from './bus_records.mjs';

const KEEP_DAYS = 120;
const SUMS_VERSION = 1;   // 합 만드는 법이 바뀌면 올린다 — 저장한 날 합을 다시 만든다
const SCORE_VERSION = 1;   // 채점 · 그리기(web/bus/motion.mjs)가 바뀌면 올린다 — 모든 날을 다시 채점한다

function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text); fs.chmodSync(tmp, 0o644); fs.renameSync(tmp, file);
}

// 날마다 그 전 날들로만 배운 것으로 채점한다(그 날을 미리 본 값으로 매기지 않게). 첫 날은 배운 게 없어 건너뛴다
function score(OUT, days, sums, stamps, routes) {
  const file = `${OUT}/scores.json`, made = [];
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')).days || {}; } catch { saved = {}; }
  const out = {};
  days.forEach((day, i) => {
    const old = saved[day];
    if (old && old.v === SCORE_VERSION && old.stamp === stamps[i]) { out[day] = old; return; }   // 한 번 매긴 날은 그대로(창이 밀려도)
    if (!i || !dayFile(day)) return;
    const table = paceTable(addSums(sums.slice(0, i), routes));
    if (!Object.keys(table).length) return;
    const rows = readDay(dayFile(day)).filter(r => routes.has(r.routeId));
    out[day] = {v: SCORE_VERSION, stamp: stamps[i], trainDays: i, ...replayDay(rows, routes, table)};
    made.push(day);
  });
  writeAtomic(file, JSON.stringify({schemaVersion: 1, generatedAt: new Date().toISOString(), days: out}));
  return made;
}

function main() {
  const a = process.argv.slice(2), opt = name => a.includes(name) ? a[a.indexOf(name) + 1] : null;
  const web = opt('--web'), OUT = opt('--out') || `${STATE}/bus-pace`;   // --out: 시험할 때 다른 폴더
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
  const days = [...new Set(fs.readdirSync(`${STATE}/bus`).map(f => f.slice(0, 8)).filter(d => /^\d{8}$/.test(d) && d < today))].sort().slice(-KEEP_DAYS);
  fs.mkdirSync(`${OUT}/days`, {recursive: true}); fs.mkdirSync(`${OUT}/web`, {recursive: true});
  const routes = loadRoutes(), made = [], sums = [], stamps = [];
  for (const day of days) {
    const src = dayFile(day), saved = `${OUT}/days/${day}.json.gz`, stamp = src ? fs.statSync(src).size : 0;
    let entry = null;
    try { entry = JSON.parse(zlib.gunzipSync(fs.readFileSync(saved)).toString('utf8')); } catch { entry = null; }
    if (!entry || entry.stamp !== stamp || entry.v !== SUMS_VERSION) {
      entry = {schemaVersion: 1, v: SUMS_VERSION, day, stamp, routes: src ? paceSums(tracks(readDay(src), routes), routes) : {}};
      const tmp = `${saved}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(entry))); fs.renameSync(tmp, saved);
      made.push(day);
    }
    sums.push(entry.routes); stamps.push(stamp);
  }
  for (const f of fs.readdirSync(`${OUT}/days`)) if (f.endsWith('.json.gz') && !days.includes(f.slice(0, 8))) fs.rmSync(`${OUT}/days/${f}`);   // 오래된 날
  const table = paceTable(addSums(sums, routes)), at = new Date().toISOString();
  const files = {'index.json': JSON.stringify({schemaVersion: 1, generatedAt: at, days: days.length, routes: Object.keys(table).sort()})};
  for (const [rid, r] of Object.entries(table)) files[`${rid}.json`] = JSON.stringify({schemaVersion: 1, routeId: rid, generatedAt: at, ...r});
  const targets = [`${OUT}/web`];
  if (web) { fs.mkdirSync(`${web}/data/bus/pace`, {recursive: true}); fs.chmodSync(`${web}/data/bus/pace`, 0o755); targets.push(`${web}/data/bus/pace`); }
  for (const dir of targets) {
    for (const [name, text] of Object.entries(files)) writeAtomic(`${dir}/${name}`, text);
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && !files[f]) fs.rmSync(`${dir}/${f}`);   // 이제 못 쓰는 노선(노선 자료가 바뀜 등)
  }
  const scored = score(OUT, days, sums, stamps, routes);
  console.log(JSON.stringify({days: days.length, made, scored, routes: Object.keys(table).length,
    hours: Object.values(table).reduce((s, r) => s + Object.keys(r.hours).length, 0), web: !!web}));
}

main();
