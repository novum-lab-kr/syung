// 지도 재현: 그날 원자료(샘플러가 /live 에서 본 사건)를 받은 차례대로 지도의 열차 예측(web/trains/plan.mjs)에 다시 흘려,
// 열차마다 슝이 언제 어느 역에 섰다 떠났는지(역 사이 멈춤 포함) 뽑는다. ride_replay(탑승 비교) · replay_score(날마다 점수)가 같이 쓴다.
// 읽기만 한다(web/ · data/ 를 쓰지 않는다). 바깥 API 를 부르지 않는다. 가짜 시계를 쓰므로 한 프로세스에서 한 번에 하나씩 돌린다.
//
// 근사(2026-10-12): 선로 길이는 역 사이 직선, 열차끼리 겹침 피하기(spaceTrains) · 롤코 · timeWarp 는 없다,
// 자료가 지도에 닿는 때는 샘플러가 처음 본 때(30초마다라 실제 화면보다 0~30초 늦을 수 있다 — 서는 시각은 기록 시각 기준이라 거의 영향 없음).
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRouter,key,normStatus,NEW_NAMES} from '../web/lib/routing.mjs';
import {catchup,catchupAt} from '../web/lib/train_catchup.mjs';
import {createTrainPlanner} from '../web/trains/plan.mjs';

export {key};
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const LIVE='/var/lib/subway-live';
export const hms=ms=>ms==null?'—':new Date(ms+9*3600e3).toISOString().slice(11,19);
export const stampMs=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4]-9,+m[5],+m[6]):NaN};
export const kstMs=(day,hm)=>Date.parse(`${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6)}T${hm.length===5?hm+':00':hm}+09:00`);

// ---------- 역 · 선로(지도와 같은 자료) ----------
const html=fs.readFileSync(path.join(ROOT,'web/index.html'),'utf8');
const json=id=>JSON.parse(html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`))[1]);
const stations=json('stationData').map(s=>NEW_NAMES[s.name]?{...s,name:NEW_NAMES[s.name]}:s),paths=json('linePaths');
const {stationByLine,route,learnDirections}=createRouter({stations,paths});
const LAT0=37.55,M_LON=111320*Math.cos(LAT0*Math.PI/180),M_LAT=110540;
const merc=s=>({x:s.lon*M_LON,y:-s.lat*M_LAT,meterInMercatorCoordinateUnits:()=>1});   // 1 단위 = 1 m
const byId=new Map(stations.map(s=>[s.id,s]));
const geom=(_line,a,b)=>{const A=merc(byId.get(a)),B=merc(byId.get(b));return {total:Math.hypot(B.x-A.x,B.y-A.y)}};

// 그날 위치 피드가 알려 준 급행 여부(열차 번호 → true/false, 하루 안에 둘 다 나온 번호는 뺀다).
// 샘플러는 2026-10-22 까지 express 를 적지 않아 재현이 9호선 급행을 모두 완행으로 그렸다(지도는 /live 의 express 로 급행을 그린다)
const expressCache=new Map();
async function expressOf(day,line){
  const k=`${day}|${line}`;if(expressCache.has(k))return expressCache.get(k);
  const base=path.join(LIVE,'position',day),file=fs.existsSync(base+'.jsonl')?base+'.jsonl':base+'.jsonl.gz',out=new Map(),mixed=new Set();
  if(fs.existsSync(file)){
    let stream=fs.createReadStream(file);if(file.endsWith('.gz'))stream=stream.pipe(zlib.createGunzip());
    const needle=`"${line}"`;
    for await(const row of readline.createInterface({input:stream,crlfDelay:Infinity})){
      if(!row.includes(needle))continue;
      let e;try{e=JSON.parse(row)}catch{continue}
      if(e.line!==line||typeof e.express!=='boolean')continue;
      if(out.has(e.trainNo)&&out.get(e.trainNo)!==e.express)mixed.add(e.trainNo);out.set(e.trainNo,e.express);
    }
  }
  for(const n of mixed)out.delete(n);
  expressCache.set(k,out);return out;
}

// 한 노선의 그날 샘플러 기록(받은 때 seen 순서), from 20분 전부터 to 까지. express 가 없는 기록은 위치 피드로 채운다(expressOf)
export async function readSamples(day,line,from,to){
  const base=path.join(LIVE,'samples',day),file=fs.existsSync(base+'.jsonl')?base+'.jsonl':base+'.jsonl.gz';
  if(!fs.existsSync(file))return [];
  let stream=fs.createReadStream(file);if(file.endsWith('.gz'))stream=stream.pipe(zlib.createGunzip());
  const out=[],needle=`"${line}"`;
  for await(const row of readline.createInterface({input:stream,crlfDelay:Infinity})){
    if(!row.includes(needle))continue;
    let e;try{e=JSON.parse(row)}catch{continue}
    if(e.line!==line)continue;
    const seen=Date.parse(e.fetchedAt);if(!(seen>=from-20*60e3&&seen<=to))continue;
    out.push({...e,seen});
  }
  if(out.some(e=>e.express==null)){const ex=await expressOf(day,line);for(const e of out)if(e.express==null&&ex.has(e.trainNo))e.express=ex.get(e.trainNo)}
  return out.sort((a,b)=>a.seen-b.seen);
}

// 서버 forward_only(server/services/live.py)와 같게: 옛날 기록은 버리고 같은 역 · 같은 상태면 처음 시각. 2026-10-13 전의 샘플에는 이것이 없었다.
function forwardOnly(prev,r){
  if(!prev||prev.direction!==r.direction||stampMs(r.receivedAt)-stampMs(prev.receivedAt)<=-600e3)return r;
  if(prev.station===r.station&&prev.status===r.status)return {...r,receivedAt:prev.receivedAt};
  return stampMs(r.receivedAt)<stampMs(prev.receivedAt)?prev:r;
}

// records 를 가짜 시계로 from 20분 전부터 to 까지 흘려 trains(열차 번호들)의 기록을 돌려준다:
// Map(열차 번호 → {stops: [{where: 역 이름 | '(역 사이)', stop, leave, held, record}], passes: [{where, at}]}) — stop · leave · at 은 ms
// passes: 급행이 서지 않고 지나간 역과 그때(피드는 통과역에도 도착 · 출발을 찍는다 — 9호선 급행 10-21 하루 약 900건)
// raw: 샘플 그대로(고치기 전 서버) · onPoll(planner, NOW, before): 디버그용
export async function replayMap({from,to,records,trains,timingPath=path.join(LIVE,'live-timing.json'),raw=false,onPoll=null}){
  let NOW=from-20*60e3;const T0=NOW,realNow=Date.now,realPerf=globalThis.performance;
  Date.now=()=>NOW;
  Object.defineProperty(globalThis,'performance',{value:{now:()=>NOW-T0},configurable:true});
  const files={'./live-timing.json':timingPath,'./edge_times.json':path.join(ROOT,'data/ktdb-gtfs-2025/edge_times.json')};
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url=>{const f=files[url];return f&&fs.existsSync(f)?{ok:true,json:async()=>JSON.parse(fs.readFileSync(f,'utf8'))}:{ok:false,json:async()=>null}};
  try{
    let current=[];
    const smooth=x=>x*x*(3-2*x);
    let planner;
    // 본체 rawPose 와 같은 계산(롤코 · timeWarp 빼고)
    function rawPose(p){
      let el=planner.age(p.t.receivedAt)+p.lead,ph=p.phases[p.phases.length-1];
      for(const x of p.phases){if(el<x.dur){ph=x;break}el-=x.dur}
      const u=ph.dur===Infinity?1:Math.min(1,el/ph.dur),e=ph.ease==='both'||ph.ease===true?smooth(u):ph.ease==='in'?u*u:ph.ease==='out'?1-(1-u)*(1-u):u,k=ph.k0+(ph.k1-ph.k0)*e;
      const i=Math.max(0,p.seq.indexOf(ph.from)),len=(p.cum[i+1]??p.cum[i])-p.cum[i];
      const dist=p.cum[i]+len*(ph.from===ph.to?0:k),moving=ph.k0!==ph.k1;
      if(p.hold!=null){
        let at=p.hold,creeping=false;
        if(p.creep){const w=(planner.clock()-p.creep.at)/p.creep.ms;if(w<1){at=p.creep.from+(p.hold-p.creep.from)*(p.creep.linear?w:1-(1-w)*(1-w));creeping=true}else p.creep=null}
        if(dist<p.hold)return dist>at?{dist,moving,held:true}:{dist:at,moving:creeping,held:true};
        if(creeping&&at<dist&&!p.creep.linear)p.glide={c:catchup(dist-at),at:planner.clock()};
        p.hold=null;p.creep=null;
      }
      if(p.glide){const g=catchupAt(p.glide.c,(planner.clock()-p.glide.at)/1000);if(!g.done)return {dist:Math.max(0,dist-g.left),moving:true};p.glide=null}
      return {dist,moving};
    }
    planner=createTrainPlanner({stations,stationByLine,key,normStatus,route,merc,realGeom:geom,geom,trainPose:rawPose,
      mercStop:(_l,s)=>merc(s),catchup,catchupAt,predictStops:()=>3,isRide:()=>false,getTrains:()=>current});
    await new Promise(r=>setTimeout(r,50));   // live-timing · edge_times 읽기
    const latest=new Map(),want=new Set(trains);
    const log=new Map(trains.map(n=>[n,{stops:[],passes:[],state:null,plan:null,dist:0}]));
    const STEP=250,POLL=20e3,AT_STATION_M=30;
    let ri=0,nextPoll=NOW;
    for(;NOW<=to;NOW+=STEP){
      while(ri<records.length&&records[ri].seen<=NOW){const r=records[ri++];latest.set(r.trainNo,raw?r:forwardOnly(latest.get(r.trainNo),r))}
      if(NOW>=nextPoll){
        nextPoll=NOW+POLL;
        current=[...latest.values()].filter(t=>planner.age(t.receivedAt)<=600);
        learnDirections(current);
        const before=onPoll?new Map(planner.plans.map(p=>[p.id,{t:p.t,held:p.hold!=null}])):null;
        planner.replacePlans(current.filter(t=>want.has(t.trainNo)).map(planner.planTrain).filter(Boolean));
        onPoll?.(planner,NOW,before,rawPose);
      }
      if(NOW<from)continue;
      for(const p of planner.plans){
        const L=log.get(p.t.trainNo);if(!L)continue;
        const pose=rawPose(p);
        if(p.t.express){   // 같은 계획에서 이번 걸음에 지나간 비정차역(계획이 바뀐 걸음은 거리 기준이 달라 건너뛴다)
          if(L.plan===p)for(let i=0;i<p.seq.length;i++)if(p.cum[i]>L.dist&&p.cum[i]<=pose.dist&&!(p.seq[i].express||[]).includes(p.t.line))L.passes.push({where:p.seq[i].name,at:NOW});
          L.plan=p;L.dist=pose.dist;
        }
        let at=null;for(let i=0;i<p.seq.length;i++)if(Math.abs(p.cum[i]-pose.dist)<AT_STATION_M){at=p.seq[i];break}
        const state=pose.moving?'달림':at?`정차:${at.name}`:'선로 위 멈춤';
        if(state!==L.state){
          const prev=L.stops.at(-1);
          if(prev&&!prev.leave)prev.leave=NOW;
          if(!pose.moving)L.stops.push({where:at?at.name:'(역 사이)',stop:NOW,held:!!pose.held,record:`${p.t.station} ${p.t.status} ${String(p.t.receivedAt).slice(11)}`});
          L.state=state;
        }
      }
    }
    return log;
  }finally{
    Date.now=realNow;Object.defineProperty(globalThis,'performance',{value:realPerf,configurable:true});globalThis.fetch=realFetch;
  }
}
