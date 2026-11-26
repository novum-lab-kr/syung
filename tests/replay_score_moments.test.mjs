import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {replayMap} from '../pipeline/map_replay.mjs';
import {scoreWindow} from '../pipeline/replay_score.mjs';
import {stopTiming} from '../web/trains/plan.mts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

// 가짜 열차 하나(7호선): 피드가 지도 계획이 기대하는 때에 꼭 맞게 도착 · 출발을 내면 채점은 0 근처여야 한다.
// 같은 순간끼리 견주기 전에는 도착 +brake · 출발 −pullOut(7호선 +20 · −20)이 그대로 남았다(2026-11-27 syung-fe 재현)
test('replay_score: 지도 기대와 꼭 맞는 피드는 도착 · 출발 쏠림이 0 근처',async()=>{
  const html=read('web/index.html');
  const stations=JSON.parse(html.match(/id="stationData"[^>]*>([\s\S]*?)<\/script>/)[1]),byId=new Map(stations.map(s=>[s.id,s]));
  const ids=JSON.parse(html.match(/id="linePaths"[^>]*>([\s\S]*?)<\/script>/)[1])['7호선'][0];
  const edges=JSON.parse(read('data/ktdb-gtfs-2025/edge_times.json')).edges,timing=JSON.parse(read('data/live-timing.json'));
  const tm={...timing.default,...timing.lines['7호선']},{stand,brake,pullOut}=stopTiming(tm);
  assert.ok(brake>0&&pullOut>0,'고치기 전 쏠림이 생기는 조건(감속 · 앞당김이 있다)');
  const kst=ms=>new Date(ms+9*3600e3).toISOString().slice(0,19).replace('T',' ');
  const from=Date.parse('2026-11-25T13:00:00+09:00'),to=from+30*60e3,dest=byId.get(ids.at(-1)).name,lag=20e3;
  const records=[],events=[];let at=from-5*60e3;
  for(let i=8;i<20;i++){
    const A=byId.get(ids[i]),B=byId.get(ids[i+1]),R=edges[`7호선:${Math.min(A.id,B.id)}:${Math.max(A.id,B.id)}`]??90;
    const run=Math.max(.5*R,tm.pace*(R+30)-stand),arrive=at+(run-15-brake)*1000;   // 출발은 달린 지 15초 · 도착은 서기 brake 초 전(plan.mts paced)
    const push=(s,status,t)=>{records.push({line:'7호선',trainNo:'7999',station:s.name,status,receivedAt:kst(t),direction:'하행',destination:dest,express:false,seen:t+lag});
      if(t>=from&&t<to)events.push({train:'7999',station:s.name,status,t})};
    push(A,'출발',at);push(B,'도착',arrive);at=arrive+tm.zone*1000;
  }
  records.sort((a,b)=>a.seen-b.seen);
  const log=await replayMap({from,to:to+5*60e3,records,trains:['7999'],timingPath:path.join(ROOT,'data/live-timing.json')});
  assert.deepEqual(log.get('7999').timing,stopTiming(tm),'재현 기록은 지도와 같은 셈을 단다');
  const r=scoreWindow(events,log,to+5*60e3);
  assert.equal(r.moments,'section');
  assert.equal(r.coverage,1);
  assert.ok(r.arrive.n>=8&&r.depart.n>=8);
  assert.ok(Math.abs(r.arrive.signedMedian)<=2&&Math.abs(r.depart.signedMedian)<=2,`도착 ${r.arrive.signedMedian} · 출발 ${r.depart.signedMedian}`);
  assert.ok(r.arrive.p90<=10&&r.depart.p90<=10,`90 % 도착 ${r.arrive.p90} · 출발 ${r.depart.p90}`);
});

test('scoreWindow: 선 때 − brake 를 피드 도착과, 떠난 때 + pullOut 을 피드 출발과 견준다',()=>{
  const s=1e6,log=new Map([['7001',{stops:[{where:'중곡',stop:s,leave:s+40e3}],timing:{brake:20,pullOut:20}}]]);
  const r=scoreWindow([{train:'7001',station:'중곡',status:'도착',t:s-20e3},{train:'7001',station:'중곡',status:'출발',t:s+65e3}],log,s+120e3);
  assert.deepEqual([r.arrive.signedMedian,r.depart.signedMedian],[0,-5]);
});
