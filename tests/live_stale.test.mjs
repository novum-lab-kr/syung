// 끝난 열차 빼기(web/trains/live_feed.mts staleLimit + plan.mts destinationLeg): 실제 역 · 경로 · 구간 시간 자료로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setImmediate} from 'node:timers/promises';
import {createRouter,key,normStatus,NEW_NAMES} from '../web/lib/routing.mts';
import {catchup,catchupAt} from '../web/lib/train_catchup.mts';
import {createTrainPlanner} from '../web/trains/plan.mts';
import {ARRIVAL_MEMORY_SECONDS,ARRIVED_SECONDS,LAST_LEG_MARGIN_SECONDS,LONG_LAST_LEG_SECONDS,NEAR_END_SECONDS,STALE_SECONDS,createArrivalMemory,staleLimit} from '../web/trains/live_feed.mts';

const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const json=id=>JSON.parse(html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`))[1]);
const edgeData=JSON.parse(fs.readFileSync(new URL('../data/ktdb-gtfs-2025/edge_times.json',import.meta.url),'utf8'));

async function setup(t,edges=edgeData){
  const stations=json('stationData').map(s=>NEW_NAMES[s.name]?{...s,name:NEW_NAMES[s.name]}:s);
  const {stationByLine,route}=createRouter({stations,paths:json('linePaths')});
  t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>url==='./edge_times.json'?edges:{}}));
  const merc=()=>({x:0,y:0,meterInMercatorCoordinateUnits:()=>1}),geom=()=>({total:1000});
  const planner=createTrainPlanner({stations,stationByLine,key,normStatus,route,merc,geom,realGeom:geom,trainPose:()=>({dist:0}),
    mercStop:()=>merc(),catchup,catchupAt,predictStops:()=>3,isRide:()=>false,getTrains:()=>[]});
  await setImmediate();
  const limit=record=>staleLimit(record,planner.destinationLeg(record));
  const edgeOf=(line,a,b)=>{const id=name=>stationByLine.get(`${line}:${key(name)}`).id,[x,y]=[id(a),id(b)];return edges.edges[`${line}:${Math.min(x,y)}:${Math.max(x,y)}`]};
  return {limit,edgeOf,leg:record=>planner.destinationLeg(record)};
}
const train=(line,station,status,destination,extra={})=>({line,trainNo:'1',station,status,destination,direction:'하행',express:false,last:false,receivedAt:'',...extra});

test('2026-11-02 봉화산: 도착한 6083 은 바로(2026-11-27부터) · 직전 역을 떠난 6085 는 구간 시간 + 여유 뒤에 빠진다',async t=>{
  const {limit,edgeOf}=await setup(t),run=edgeOf('6호선','화랑대','봉화산');
  assert.ok(run>0);
  assert.equal(limit(train('6호선','봉화산','도착','봉화산')),0);
  assert.equal(limit(train('6호선','화랑대','출발','봉화산')),run+LAST_LEG_MARGIN_SECONDS);
  // 2026-11-27: 직전 역 도착 · 진입은 구간 시간 + 6분, 행선지 역 진입은 6분(끝난 열차가 10분 서 있어 다음 열차와 겹쳤다)
  assert.equal(limit(train('6호선','화랑대','도착','봉화산')),run+NEAR_END_SECONDS);
  assert.equal(limit(train('6호선','화랑대','진입','봉화산')),run+NEAR_END_SECONDS);
  assert.equal(limit(train('6호선','봉화산','진입','봉화산')),NEAR_END_SECONDS);
  // 운행중 · 전역 출발은 행선지 근처에서도 오래 비었다 이어져 10분 그대로
  assert.equal(limit(train('6호선','화랑대','운행중','봉화산')),STALE_SECONDS);
  assert.equal(limit(train('6호선','봉화산','전역 출발','봉화산')),STALE_SECONDS);
  assert.equal(limit(train('6호선','봉화산','운행중','봉화산')),STALE_SECONDS);
});

test('2026-11-27 겹침: 종착역 출발 기록(8호선 별내 · GTX-A 서울역 · 신림선 샛강)은 6분 뒤 빠진다',async t=>{
  const {limit}=await setup(t);
  assert.equal(limit(train('8호선','별내','출발','별내')),NEAR_END_SECONDS);
  assert.equal(limit(train('GTX-A','서울역','출발','서울역')),NEAR_END_SECONDS);
  assert.equal(limit(train('신림선','샛강','출발','샛강')),NEAR_END_SECONDS);
  assert.ok(NEAR_END_SECONDS<STALE_SECONDS);
});

test('출발 대기 열차는 빼지 않는다: 행선지가 현재 역과 다르거나 departsAt 이 있으면 10분',async t=>{
  const {limit}=await setup(t);
  assert.equal(limit(train('5호선','마천','도착','방화')),STALE_SECONDS);
  assert.equal(limit(train('5호선','방화','도착','마천')),STALE_SECONDS);
  assert.equal(limit(train('5호선','마천','도착','방화',{departsAt:'2026-11-02 10:20:00'})),STALE_SECONDS);
  // 행선지 역에 찍힌 기록이어도, 직전 역을 떠난 기록이어도 departsAt 이 먼저다
  assert.equal(limit(train('5호선','마천','도착','마천',{departsAt:'2026-11-02 10:20:00'})),STALE_SECONDS);
  assert.equal(limit(train('6호선','화랑대','출발','봉화산',{departsAt:'2026-11-02 10:20:00'})),STALE_SECONDS);
});

test('행선지 역 출발은 바로 빼지 않는다(2호선 순환 · 우이신설선): 6분 — 성수 출발은 6일 1,212건 중 1,211건이 6분 안에 다음 기록',async t=>{
  const {limit}=await setup(t);
  assert.equal(limit(train('2호선','성수','출발','성수',{direction:'내선'})),NEAR_END_SECONDS);
  assert.equal(limit(train('우이신설선','신설동','출발','신설동')),NEAR_END_SECONDS);
  assert.ok(NEAR_END_SECONDS>0);
});

test('4호선: 사당행이 사당을 출발한 기록은 같은 번호로 이어 가니 10분',async t=>{
  const {limit}=await setup(t);
  assert.equal(limit(train('4호선','사당','출발','사당')),STALE_SECONDS);
  assert.equal(limit(train('4호선','사당','도착','사당')),0);
  assert.equal(limit(train('4호선','사당','진입','사당')),NEAR_END_SECONDS);
});

test('3호선: 구파발행이 구파발에 찍힌 기록은 10분, 그 밖은 일반 규칙',async t=>{
  const {limit,edgeOf}=await setup(t);
  assert.equal(limit(train('3호선','구파발','도착','구파발')),STALE_SECONDS);
  assert.equal(limit(train('3호선','구파발','진입','구파발')),STALE_SECONDS);
  assert.equal(limit(train('3호선','구파발','출발','구파발')),STALE_SECONDS);
  assert.equal(limit(train('3호선','대화','도착','대화')),0);
  assert.equal(limit(train('3호선','수서','도착','수서')),0);
  assert.equal(limit(train('3호선','지축','출발','구파발')),edgeOf('3호선','지축','구파발')+LAST_LEG_MARGIN_SECONDS);
  // 구파발이 행선지가 아니면 예외가 아니라 원래 10분 규칙이다(출발 대기)
  assert.equal(limit(train('3호선','구파발','도착','오금')),STALE_SECONDS);
});

test('7호선: 행선지 직전 천왕 · 강남구청 출발만 20분, 그 밖은 일반 규칙',async t=>{
  const {limit,edgeOf}=await setup(t);
  // 방향은 실제 기록 그대로(천왕 → 온수행도 하행으로 온다)
  assert.equal(limit(train('7호선','천왕','출발','온수')),LONG_LAST_LEG_SECONDS);
  assert.equal(limit(train('7호선','강남구청','출발','청담',{direction:'상행'})),LONG_LAST_LEG_SECONDS);
  assert.equal(limit(train('7호선','온수','도착','온수',{direction:'상행'})),0);
  assert.equal(limit(train('7호선','장암','도착','장암',{direction:'상행'})),0);
  assert.equal(limit(train('7호선','도봉산','출발','장암',{direction:'상행'})),edgeOf('7호선','도봉산','장암')+LAST_LEG_MARGIN_SECONDS);
  // 같은 역이어도 다음 역이 행선지가 아니면 10분 · 도착 기록은 일반 직전 역 규칙(6일 기록에서 길게 비지 않았다)
  assert.equal(limit(train('7호선','천왕','출발','장암',{direction:'상행'})),STALE_SECONDS);
  assert.equal(limit(train('7호선','천왕','도착','온수')),edgeOf('7호선','천왕','온수')+NEAR_END_SECONDS);
});

test('구간 시간이 없거나 역을 못 찾으면 10분',async t=>{
  const noEdges=await setup(t,{edges:{},dwell:{}});
  assert.equal(noEdges.limit(train('6호선','화랑대','출발','봉화산')),STALE_SECONDS);
  assert.equal(noEdges.limit(train('6호선','없는역','도착','없는역')),STALE_SECONDS);
});

test('행선지에서 먼 역의 출발 기록은 10분',async t=>{
  const {limit}=await setup(t);
  assert.equal(limit(train('6호선','태릉입구','출발','봉화산')),STALE_SECONDS);
});

test('2026-11-27 왕십리 6126: 행선지 역 도착은 받는 즉시 빠진다 · 계속 달리는 성수 · 구로 · 동묘앞은 3분',async t=>{
  const {limit}=await setup(t);
  assert.equal(limit(train('수인분당선','왕십리','도착','왕십리',{trainNo:'6126',direction:'상행',receivedAt:'2026-11-27 16:13:32'})),0);
  assert.equal(limit(train('2호선','성수','도착','성수',{direction:'내선'})),ARRIVED_SECONDS);
  assert.equal(limit(train('1호선','구로','도착','구로')),ARRIVED_SECONDS);
  assert.equal(limit(train('1호선','동묘앞','도착','동묘앞',{direction:'상행'})),ARRIVED_SECONDS);
  // 행선지 역 진입은 아직 들어오는 중이라 그대로 6분
  assert.equal(limit(train('수인분당선','왕십리','진입','왕십리',{direction:'상행'})),NEAR_END_SECONDS);
});

test('도착한 열차 기억: 그 역에서 뒤에 내는 출발 · 운행중 기록도 빼고, 다른 역 · 다른 행선지가 오면 다시 보인다',async t=>{
  const {leg}=await setup(t);
  let now=0;const memory=createArrivalMemory(()=>now);
  const seen=record=>!memory.finished(record,leg(record));
  const arrive=train('8호선','별내','도착','별내',{trainNo:'8314',direction:'상행',receivedAt:'2026-11-27 10:00:00'});
  assert.equal(seen(train('8호선','다산','출발','별내',{trainNo:'8314',direction:'상행',receivedAt:'2026-11-27 09:58:00'})),true);
  assert.equal(seen(arrive),false);
  assert.equal(seen(arrive),false);   // 같은 도착 기록이 다시 와도
  assert.equal(seen(train('8호선','별내','출발','별내',{trainNo:'8314',direction:'상행',receivedAt:'2026-11-27 10:02:30'})),false);
  assert.equal(seen(train('8호선','별내','운행 중','별내',{trainNo:'8314',direction:'상행',receivedAt:'2026-11-27 10:03:00'})),false);
  // 다른 열차 · 다른 역 · 다른 행선지는 그대로
  assert.equal(seen(train('8호선','별내','출발','별내',{trainNo:'8316',direction:'상행',receivedAt:'2026-11-27 10:03:00'})),true);
  assert.equal(seen(train('8호선','별내','출발','모란',{trainNo:'8314',direction:'하행',receivedAt:'2026-11-27 10:10:00'})),true);
  assert.equal(seen(train('8호선','별내','출발','별내',{trainNo:'8314',direction:'상행',receivedAt:'2026-11-27 10:11:00'})),true);   // 잊었다
});

test('도착 기억은 지금 규칙을 쓰는 곳(구파발 · 성수 · 구로 · 동묘앞)에선 걸지 않고, 30분 지나면 잊는다',async t=>{
  const {leg}=await setup(t);
  let now=0;const memory=createArrivalMemory(()=>now);
  const seen=record=>!memory.finished(record,leg(record));
  assert.equal(seen(train('3호선','구파발','도착','구파발',{trainNo:'3420',direction:'상행',receivedAt:'2026-11-27 10:00:00'})),true);
  assert.equal(seen(train('3호선','구파발','출발','구파발',{trainNo:'3420',direction:'상행',receivedAt:'2026-11-27 10:02:00'})),true);
  assert.equal(seen(train('2호선','성수','도착','성수',{trainNo:'2306',direction:'내선',receivedAt:'2026-11-27 10:00:00'})),true);
  assert.equal(seen(train('2호선','성수','출발','성수',{trainNo:'2306',direction:'내선',receivedAt:'2026-11-27 10:01:00'})),true);
  assert.equal(seen(train('6호선','봉화산','도착','봉화산',{trainNo:'6083',receivedAt:'2026-11-27 10:00:00'})),false);
  now=ARRIVAL_MEMORY_SECONDS+1;memory.forgetOld();
  assert.equal(seen(train('6호선','봉화산','출발','봉화산',{trainNo:'6083',receivedAt:'2026-11-27 10:31:00'})),true);
});
