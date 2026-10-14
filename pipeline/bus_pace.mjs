// 밤마다: 버스 기록으로 노선 구간 빠르기를 배워 화면이 읽을 파일로 낸다(덕배 2026-10-14). retrain_live_timing.py 가 부른다.
//   node pipeline/bus_pace.mjs --web /var/www/syung [--out 폴더]      (--web 없으면 계산 · 저장만, 웹 폴더는 안 건드린다)
// 1. 다 받은 날(오늘 KST 전)마다 노선 · 시간대 · 50 m 칸의 시간 · 거리 합을 한 번만 만든다: STATE/bus-pace/days/YYYYMMDD.json.gz
//    (그 날 기록 파일 크기가 바뀌면 다시)
// 2. 최근 KEEP_DAYS 일 합을 더해 노선마다 {bin, hours: {시: [ms/m]}} → STATE/bus-pace/web/<노선>.json + index.json(배운 노선 목록)
// 3. --web 이면 그 폴더의 data/bus/pace/ 에도 같은 파일(배포는 deploy.sh 가 STATE 것을 새 릴리스에 넣는다)
// 학습 노선은 날마다 바뀐다(server/jobs/bus_samples.py) — 한 번 배운 노선은 KEEP_DAYS 동안 남는다.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {STATE, dayFile, readDay, loadRoutes, tracks, paceSums, addSums, paceTable} from './bus_records.mjs';

const KEEP_DAYS = 120;
const SUMS_VERSION = 1;   // 합 만드는 법이 바뀌면 올린다 — 저장한 날 합을 다시 만든다

function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text); fs.chmodSync(tmp, 0o644); fs.renameSync(tmp, file);
}

function main() {
  const a = process.argv.slice(2), opt = name => a.includes(name) ? a[a.indexOf(name) + 1] : null;
  const web = opt('--web'), OUT = opt('--out') || `${STATE}/bus-pace`;   // --out: 시험할 때 다른 폴더
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
  const days = [...new Set(fs.readdirSync(`${STATE}/bus`).map(f => f.slice(0, 8)).filter(d => /^\d{8}$/.test(d) && d < today))].sort().slice(-KEEP_DAYS);
  fs.mkdirSync(`${OUT}/days`, {recursive: true}); fs.mkdirSync(`${OUT}/web`, {recursive: true});
  const routes = loadRoutes(), made = [], sums = [];
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
    sums.push(entry.routes);
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
  console.log(JSON.stringify({days: days.length, made, routes: Object.keys(table).length,
    hours: Object.values(table).reduce((s, r) => s + Object.keys(r.hours).length, 0), web: !!web}));
}

main();
