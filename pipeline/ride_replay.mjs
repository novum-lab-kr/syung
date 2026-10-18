// 탑승 비교: 그날 원자료(샘플러 기록)를 받은 차례대로 지도의 열차 예측(web/trains/plan.mjs)에 다시 흘려,
// 슝이 그 열차를 역마다 언제 세우고 언제 떠나보냈는지 뽑고, 디버깅 페이지의 실제 도착 · 출발 누름과 나란히 놓는다.
// 읽기만 한다(web/ · data/ 를 쓰지 않는다). 바깥 API 를 부르지 않는다.
//
//   node pipeline/ride_replay.mjs --day 20261013 --line 7호선 [--train 7333,7290] [--from 08:00 --to 09:00]
//        [--rides /var/lib/subway-live/debug/rides/20261013.jsonl] [--ride <탑승 id>]
//
// --rides 가 있으면 그 탑승의 노선 · 시각 · 열차 번호를 쓰고, 열차 번호가 비었으면 누른 역 · 시각에 가장 잘 맞는 열차를 고른다.
// 근사(2026-10-12): 선로 길이는 역 사이 직선, 열차끼리 겹침 피하기(spaceTrains) · 롤코 · timeWarp 는 없다,
// 자료가 지도에 닿는 때는 샘플러가 처음 본 때(30초마다라 실제 화면보다 0~30초 늦을 수 있다 — 서는 시각은 기록 시각 기준이라 거의 영향 없음).
import fs from 'node:fs';
import {readSamples,replayMap,key,hms,stampMs,LIVE} from './map_replay.mjs';

const arg=(name,def)=>{const i=process.argv.indexOf(`--${name}`);return i>0?process.argv[i+1]:def};
const day=arg('day');if(!/^\d{8}$/.test(day||'')){console.error('--day YYYYMMDD 가 필요해요');process.exit(2)}
const ymd=`${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6)}`;
const kst=hm=>Date.parse(`${ymd}T${hm.length===5?hm+':00':hm}+09:00`);

// ---------- 탑승 기록(디버깅 페이지) ----------
let ride=null;
const ridesPath=arg('rides');
if(ridesPath){
  const all=fs.readFileSync(ridesPath,'utf8').split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(e=>e&&e.mode==='subway');
  const ids=[...new Set(all.map(e=>e.ride))],want=arg('ride')||ids.at(-1);
  if(!want){console.error('탑승 기록이 없어요');process.exit(2)}
  const ev=all.filter(e=>e.ride===want).sort((a,b)=>a.t-b.t);
  ride={id:want,line:ev.find(e=>e.line)?.line,train:ev.find(e=>e.train)?.train,taps:[],marks:ev.filter(e=>e.kind==='mark')};
  // '방금 것 취소'(이미 보낸 누름): 그 앞 마지막 누름을 뺀다 — server/services/debug.py CANCEL_NOTE
  for(const e of [...ev].sort((a,b)=>a.t-b.t)){
    if(e.kind==='arrive'||e.kind==='depart')ride.taps.push(e);
    else if(e.kind==='mark'&&e.note==='바로 앞 도착 · 출발 취소'){const i=ride.taps.findLastIndex(x=>x.t<=e.t);if(i>=0)ride.taps.splice(i,1)}
  }
  if(ids.length>1&&!arg('ride'))console.log(`탑승 ${ids.length}개 중 마지막(${want}) — 다른 것은 --ride`);
}
const line=arg('line',ride?.line);if(!line){console.error('--line 이 필요해요');process.exit(2)}
const taps=ride?.taps||[];
const from=arg('from')?kst(arg('from')):taps.length?taps[0].t-10*60e3:NaN,to=arg('to')?kst(arg('to')):taps.length?taps.at(-1).t+5*60e3:NaN;
if(!(from<to)){console.error('--from · --to(KST HH:MM) 이 필요해요(탑승 기록이 있으면 저절로)');process.exit(2)}

const records=await readSamples(day,line,from,to);
if(!records.length){console.error(`${ymd} ${line} 원자료가 없어요`);process.exit(1)}

// 열차 고르기: --train, 탑승 기록의 번호, 아니면 누른 역 · 시각에 원자료 사건이 가장 많이 맞는 열차
let trains=(arg('train')||ride?.train||'').split(',').map(s=>s.trim()).filter(Boolean);
if(!trains.length&&taps.length){
  // 누른 역마다 150초 안에 그 역 기록이 있는 열차, 그 역들을 누른 차례대로 지나간 열차(반대 방향 열차는 순서가 거꾸로)
  const score=new Map();
  for(const n of new Set(records.map(r=>r.trainNo))){
    const mine=records.filter(r=>r.trainNo===n),times=[];
    for(const tap of taps){
      const hit=mine.filter(r=>key(r.station)===key(tap.station)&&Math.abs(stampMs(r.receivedAt)-tap.t)<150e3).sort((a,b)=>Math.abs(stampMs(a.receivedAt)-tap.t)-Math.abs(stampMs(b.receivedAt)-tap.t))[0];
      if(hit)times.push(stampMs(hit.receivedAt));
    }
    let back=0;for(let i=1;i<times.length;i++)if(times[i]<times[i-1]-1e3)back++;
    if(times.length)score.set(n,{hit:times.length,back,s:times.length-2*back});
  }
  const best=[...score].sort((a,b)=>b[1].s-a[1].s)[0];
  if(best&&best[1].s>0){trains=[best[0]];console.log(`열차 번호가 없어 원자료로 고름: ${best[0]} (누른 ${taps.length}번 중 ${best[1].hit}번 맞음, 순서 어긋남 ${best[1].back})`);
    if(best[1].hit<taps.length/2)console.log('  맞는 누름이 절반이 안 돼요 — 확실하지 않으니 --train 으로 정해 주세요')}
}
if(trains[0]==='all')trains=[...new Set(records.filter(r=>r.seen>=from).map(r=>r.trainNo))];   // 그 시간의 모든 열차(요약만)
const summaryOnly=arg('train')==='all';
if(!trains.length){console.error('--train 이 필요해요');process.exit(2)}

// ---------- 지도 예측을 가짜 시계로 다시 돌리기(map_replay) ----------
// --raw 면 샘플 그대로(고치기 전 서버)
const RAW=process.argv.includes('--raw');
const rawPoseFree=(rawPose,p)=>{const {hold,creep,glide}=p;p.hold=null;p.creep=null;p.glide=null;const d=rawPose(p).dist;Object.assign(p,{hold,creep,glide});return d};
const onPoll=process.env.DEBUG?(planner,NOW,before,rawPose)=>{for(const p of planner.plans){const b=before.get(p.id);if(p.hold!=null&&b&&!b.held&&NOW>=from)
  console.log(`${hms(NOW)} ${p.t.trainNo} 멈춤: ${b.t.station} ${b.t.status} ${String(b.t.receivedAt).slice(11)} → ${p.t.station} ${p.t.status} ${String(p.t.receivedAt).slice(11)}, 앞섬 ${Math.round(p.hold-p.creep?.from||0)}m 중 화면 ${Math.round((p.creep?.from??p.hold)-rawPoseFree(rawPose,p))}m 앞`)}}:null;
const log=await replayMap({from,to,records,trains,timingPath:arg('timing',`${LIVE}/live-timing.json`),raw:RAW,onPoll});

// ---------- 표 ----------
const feedAt=(n,st,status)=>{const r=records.find(r=>r.trainNo===n&&key(r.station)===key(st)&&r.status===status);return r?{stamp:stampMs(r.receivedAt),seen:r.seen}:null};
if(summaryOnly){
  const between=[...log.values()].flatMap(L=>L.stops.filter(s=>s.where==='(역 사이)'&&s.leave)),secs=between.map(s=>(s.leave-s.stop)/1000);
  const stops=[...log.values()].flatMap(L=>L.stops.filter(s=>s.where!=='(역 사이)'));
  const lead=[];for(const [n,L] of log)for(const s of L.stops){if(s.where==='(역 사이)')continue;const f=feedAt(n,s.where,'도착');if(f&&Math.abs(s.stop-f.stamp)<300e3)lead.push((s.stop-f.stamp)/1000)}
  const q=(v,k)=>{const x=[...v].sort((a,b)=>a-b);return x.length?Math.round(x[Math.floor(k*(x.length-1))]):null};
  console.log(`${line} ${hms(from)}–${hms(to)} 열차 ${trains.length}대: 역 정차 ${stops.length}번, 역 사이 멈춤 ${between.length}번(합 ${Math.round(secs.reduce((a,b)=>a+b,0))}초, 가운데 ${q(secs,.5)}초 · 90% ${q(secs,.9)}초)`);
  console.log(`슝이 선 때 − 원자료 도착 기록: 가운데 ${q(lead,.5)}초 · 10% ${q(lead,.1)}초 · 90% ${q(lead,.9)}초 (${lead.length}역)`);
  process.exit(0);
}
for(const n of trains){
  const L=log.get(n);
  console.log(`\n${line} ${n}열차  ${hms(from)}–${hms(to)}  (원자료 시각 = 기록 시각, 괄호 = 지도가 받은 때)`);
  console.log('역 | 원자료 진입 · 도착 · 출발 | 슝 섰다 · 떠났다 | 실제 도착 · 출발 | 차이(슝−실제) 도착 · 출발');
  const names=[...new Set([...L.stops.map(s=>s.where),...taps.map(t=>t.station)])].filter(x=>x&&x!=='(역 사이)');
  const order=names.map(nm=>({nm,t:Math.min(...[...L.stops.filter(s=>s.where===nm).map(s=>s.stop),...taps.filter(t=>t.station===nm).map(t=>t.t)])})).sort((a,b)=>a.t-b.t);
  const diffs={arrive:[],depart:[]};
  for(const {nm} of order){
    const f=['진입','도착','출발'].map(s=>feedAt(n,nm,s)).map(x=>x?`${hms(x.stamp)}(${hms(x.seen).slice(3)})`:'—').join(' · ');
    const s=L.stops.filter(x=>x.where===nm),first=s[0],last=s.at(-1);
    const a=taps.find(t=>t.kind==='arrive'&&key(t.station)===key(nm)),d=taps.find(t=>t.kind==='depart'&&key(t.station)===key(nm));
    const da=first&&a?Math.round((first.stop-a.t)/1000):null,dd=last?.leave&&d?Math.round((last.leave-d.t)/1000):null;
    if(da!=null)diffs.arrive.push(da);if(dd!=null)diffs.depart.push(dd);
    const sign=v=>v==null?'—':(v>0?'+':'')+v+'초';
    console.log(`${nm} | ${f} | ${hms(first?.stop)} · ${hms(last?.leave)}${s.length>1?` (${s.length}번 섬)`:''} | ${hms(a?.t)} · ${hms(d?.t)} | ${sign(da)} · ${sign(dd)}`);
  }
  const between=L.stops.filter(s=>s.where==='(역 사이)');
  if(between.length)console.log(`역 사이에서 멈춤 ${between.length}번: `+between.map(s=>`${hms(s.stop)}–${hms(s.leave)} [${s.record}]`).join(', '));
  const med=v=>{if(!v.length)return null;const s=[...v].sort((a,b)=>a-b);return s[s.length>>1]};
  if(taps.length)console.log(`도착 차이 가운데값 ${med(diffs.arrive)}초 (${diffs.arrive.length}역) · 출발 차이 가운데값 ${med(diffs.depart)}초 (${diffs.depart.length}역) — 음수 = 슝이 이르다`);
}
if(ride?.marks?.length)console.log('\n표시: '+ride.marks.map(m=>`${hms(m.t)} ${m.note||''}`).join(' / '));
