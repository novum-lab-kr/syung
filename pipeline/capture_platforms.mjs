#!/usr/bin/env node
// 사진 도구(전 역 카카오 맞춤 ④): 바뀐 역 + OSM 승강장 면 없는 역만 카카오 / 슝 전(운영 main) / 슝 후(이 작업 폴더) 세 장.
//   node pipeline/capture_platforms.mjs --report .nhm/fit/<노선>.json [--only 영등포,신길] [--out .nhm/captures]
//        [--before-url https://syung.novum-lab.com/] [--port 8097] [--zoom 16] [--kakao-steps 0]
// --report: pipeline/fit_line_platforms.py --report 결과(photo 목록 · 전/후 역 점). 결과: <out>/<노선>/<역>-{kakao,before,after}.jpg (1000x700)
// 캡처는 공용 capd(127.0.0.1:8095)로만 — 역 하나에 작업 하나(시점 3개), 작업마다 가용 메모리 1.5GB 이상일 때만 보낸다.
// 슝 후: 이 작업 폴더를 deploy/dev_server.py 로 잠깐 띄워 찍고 끝나면 내린다. 축척: 카카오 기본 3단계(약 1 m/px) ≈ 슝 z16(512 px 타일). 슝은 열차를 끄고 찍는다.
// 카카오맵은 눈 비교용 화면만(좌표 · 자료 추출 없음). 화면 가운데는 우리 역 점(전 · 후 가운데).
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d };
const REPORT = opt('--report'), OUT = path.resolve(opt('--out', path.join(ROOT, '.nhm', 'captures')));
const BEFORE = opt('--before-url', 'https://syung.novum-lab.com/'), PORT = +opt('--port', '8097'), ZOOM = +opt('--zoom', '16');
const SKIP_BEFORE = args.includes('--skip-before'), KAKAO_STEPS = +opt('--kakao-steps', '0'), ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;
const CAPD = 'http://127.0.0.1:8095', JOB = path.join(ROOT, 'pipeline', 'capd_platform_job.mjs'), MIN_FREE_MB = 1536;
if (!REPORT) { console.error('--report 가 필요해요 (pipeline/fit_line_platforms.py --report 결과)'); process.exit(2) }

const report = JSON.parse(readFileSync(REPORT, 'utf8')), line = report.line;
const photo = new Set(report.photo || []);
const targets = report.stations.filter(s => photo.has(s.key) && s.before && (!ONLY || ONLY.has(s.station)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freeMB = () => +(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) / 1024;

async function waitMemory() {
  for (let i = 0; i < 30; i++) { if (freeMB() >= MIN_FREE_MB) return; console.error(`가용 메모리 ${freeMB().toFixed(0)} MB — 기다려요`); await sleep(20000) }
  throw new Error(`가용 메모리가 ${MIN_FREE_MB} MB 아래라 캡처를 멈춰요`);
}

async function startDev() {
  const dev = spawn('python3', [path.join(ROOT, 'deploy', 'dev_server.py'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/exits.json`); await r.arrayBuffer(); if (r.ok) return dev } catch {} await sleep(250) }
  dev.kill(); throw new Error(`개발 서버(${PORT})가 뜨지 않아요`);
}

const dev = await startDev();
const done = [];
try {
  for (const s of targets) {
    const a = s.before.at, b = s.after.at, c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dir = path.join(OUT, line), base = path.join(dir, s.station);
    mkdirSync(dir, { recursive: true });
    const views = [
      { kind: 'kakao', label: `${s.station}역`, lat: +c[1].toFixed(6), lon: +c[0].toFixed(6), steps: KAKAO_STEPS, file: `${base}-kakao.jpg` },
      ...(SKIP_BEFORE ? [] : [{ kind: 'syung', url: BEFORE, center: c, zoom: ZOOM, file: `${base}-before.jpg` }]),
      { kind: 'syung', url: `http://localhost:${PORT}/`, center: c, zoom: ZOOM, file: `${base}-after.jpg` },
    ];
    await waitMemory();
    const t0 = Date.now();
    const r = await (await fetch(`${CAPD}/run`, { method: 'POST', body: JSON.stringify({ job: JOB, args: { views } }) })).json();
    const ok = r.ok && views.every(v => existsSync(v.file));
    done.push({ key: s.key, station: s.station, verdict: s.verdict, ok, seconds: Math.round((Date.now() - t0) / 1000), files: views.map(v => path.relative(ROOT, v.file)), errors: r.errors?.slice(0, 3) || r.error });
    console.error(`${s.station}: ${ok ? '세 장' : '실패'} (${done.at(-1).seconds}초)`);
  }
} finally { dev.kill() }
console.log(JSON.stringify({ line, zoom: ZOOM, before: BEFORE, captured: done }, null, 1));
process.exit(done.every(d => d.ok) ? 0 : 1);
