// 화면 재현 점수(오픈 판단 숫자, 2026-10-19 덕배 · Codex 상의): 고정 채점 창(server/jobs/health.py EVAL_LINES · EVAL_WINDOWS)마다
// 그날 지도가 받은 자료로 화면을 다시 그리고(map_replay), 나중에 위치 피드가 알려 준 열차 자신의 사건 시각과 견준다.
// '피드 사건 기준' 오차다: 피드의 도착 · 출발은 실제로 서고 떠난 때와 조금 다를 수 있다(실제 탑승 비교는 ride_replay).
// 읽기만 한다. 바깥 API 를 부르지 않는다.
//
//   node pipeline/replay_score.mjs --day 20261019 [--lines 7호선,2호선] [--windows 08:00-08:30,13:00-13:30] [--timing 파일] [--json]
//
// 창마다: 도착 · 출발 각각 슝 − 피드(부호 가운데값 · |오차| 가운데값 · 90 % · 60초 넘는 몫 · 개수), 피드 사건 가운데 슝이 그 역에 서고 떠난 것으로
// 맞춘 몫(coverage), 역 사이 10초 넘게 멈춘 횟수(열차 한 시간당).
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import path from 'node:path';
import {readSamples,replayMap,key,stampMs,kstMs,LIVE} from './map_replay.mjs';

export const EVAL_LINES=['7호선','2호선','9호선'];   // server/jobs/health.py 와 같게
export const EVAL_WINDOWS=['08:00-08:30','13:00-13:30','18:00-18:30'];
const MATCH_MS=300e3,STALL_S=10;

const q=(v,k)=>{if(!v.length)return null;const x=[...v].sort((a,b)=>a-b);return x[Math.min(x.length-1,Math.floor(k*x.length))]};
export function summary(errors){   // errors: 슝 − 피드(초)
  const abs=errors.map(Math.abs);
  return {n:errors.length,signedMedian:q(errors,.5),absMedian:q(abs,.5),p90:q(abs,.9),over60:errors.length?+(abs.filter(x=>x>60).length/errors.length).toFixed(3):null};
}

// 위치 피드 기록: 그 노선 · 그 창에서 열차마다 (역, 도착|출발) 사건 시각(첫 기록). 사건 시각은 피드의 receivedAt(열차 자신의 때)
async function feedEvents(day,line,from,to){
  const base=path.join(LIVE,'position',day),file=fs.existsSync(base+'.jsonl')?base+'.jsonl':base+'.jsonl.gz';
  if(!fs.existsSync(file))return [];
  let stream=fs.createReadStream(file);if(file.endsWith('.gz'))stream=stream.pipe(zlib.createGunzip());
  const seen=new Map(),needle=`"${line}"`;
  for await(const row of readline.createInterface({input:stream,crlfDelay:Infinity})){
    if(!row.includes(needle))continue;
    let e;try{e=JSON.parse(row)}catch{continue}
    if(e.line!==line||(e.status!=='도착'&&e.status!=='출발'))continue;
    const t=stampMs(e.receivedAt);if(!(t>=from&&t<to))continue;
    const k=`${e.trainNo}|${key(e.station)}|${e.status}`;if(!seen.has(k))seen.set(k,{train:e.trainNo,station:e.station,status:e.status,t});
  }
  return [...seen.values()];
}

// 한 창: 피드 사건마다 슝이 그 열차를 그 역에 세운 때(도착) · 떠나보낸 때(출발)
export function scoreWindow(events,log,to){
  const err={도착:[],출발:[]};let matched=0;
  for(const ev of events){
    const L=log.get(ev.train);if(!L)continue;
    const stops=L.stops.filter(s=>s.where!=='(역 사이)'&&key(s.where)===key(ev.station));
    const near=stops.map(s=>({s,at:ev.status==='도착'?s.stop:s.leave})).filter(x=>x.at!=null&&Math.abs(x.at-ev.t)<MATCH_MS).sort((a,b)=>Math.abs(a.at-ev.t)-Math.abs(b.at-ev.t))[0];
    if(!near)continue;
    matched++;err[ev.status].push(Math.round((near.at-ev.t)/1000));
  }
  let stalls=0,trainMs=0;const stallSecs=[];
  for(const L of log.values()){
    if(!L.stops.length)continue;
    trainMs+=Math.min(to,L.stops.at(-1).leave??to)-L.stops[0].stop;
    for(const s of L.stops)if(s.where==='(역 사이)'&&s.leave&&(s.leave-s.stop)/1000>=STALL_S){stalls++;stallSecs.push((s.leave-s.stop)/1000)}
  }
  return {arrive:summary(err.도착),depart:summary(err.출발),events:events.length,coverage:events.length?+(matched/events.length).toFixed(3):null,
    stalls:{n:stalls,perTrainHour:trainMs>0?+(stalls/(trainMs/3600e3)).toFixed(2):null,median:q(stallSecs,.5),p90:q(stallSecs,.9)}};
}

export async function scoreDay(day,{lines=EVAL_LINES,windows=EVAL_WINDOWS,timingPath}={}){
  const out=[];
  for(const line of lines)for(const w of windows){
    const [a,b]=w.split('-'),from=kstMs(day,a),to=kstMs(day,b);
    const events=await feedEvents(day,line,from,to);
    if(!events.length){out.push({line,window:w,events:0});continue}
    const records=await readSamples(day,line,from,to+10*60e3);
    const trains=[...new Set(events.map(e=>e.train))].filter(n=>records.some(r=>r.trainNo===n));
    const log=await replayMap({from,to:to+5*60e3,records,trains,timingPath});   // 창 끝 뒤 5분: 끝 무렵 사건의 출발까지
    out.push({line,window:w,trains:trains.length,...scoreWindow(events,log,to+5*60e3)});
  }
  return out;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const arg=(name,def)=>{const i=process.argv.indexOf(`--${name}`);return i>0?process.argv[i+1]:def};
  const day=arg('day');if(!/^\d{8}$/.test(day||'')){console.error('--day YYYYMMDD 가 필요해요');process.exit(2)}
  const lines=arg('lines')?.split(','),windows=arg('windows')?.split(',');
  const res=await scoreDay(day,{lines,windows,timingPath:arg('timing',path.join(LIVE,'live-timing.json'))});
  if(process.argv.includes('--json')){console.log(JSON.stringify({day,windows:res}));process.exit(0)}
  const f=s=>s?.n?`${s.signedMedian>0?'+':''}${s.signedMedian} · |${s.absMedian}| · 90% ${s.p90} · 60초+ ${Math.round(s.over60*100)}% (${s.n})`:'—';
  for(const r of res)console.log(`${r.line} ${r.window}: ${r.events?`열차 ${r.trains} · 도착 ${f(r.arrive)} · 출발 ${f(r.depart)} · 맞춤 ${Math.round(r.coverage*100)}% · 역 사이 멈춤 ${r.stalls.n}번(${r.stalls.perTrainHour}/열차·시간, 가운데 ${r.stalls.median}초)`:'피드 사건 없음'}`);
}
