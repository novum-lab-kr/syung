import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreWindow} from '../pipeline/replay_score.mjs';

// 급행이 서지 않는 역의 피드 사건은 슝이 지나간 때와 견준다. 서는 역은 그대로 정차 · 출발과 견준다
test('scoreWindow: 통과역 사건은 지나간 때(passes)와 맞추고 passed 로 센다',()=>{
  const s=1e6;
  const log=new Map([['9001',{stops:[{where:'가양',stop:s,leave:s+60e3}],passes:[{where:'증미',at:s+150e3}]}]]);
  const events=[
    {train:'9001',station:'가양',status:'도착',t:s-20e3},
    {train:'9001',station:'가양',status:'출발',t:s+80e3},
    {train:'9001',station:'증미',status:'도착',t:s+145e3},
    {train:'9001',station:'증미',status:'출발',t:s+155e3},
    {train:'9001',station:'등촌',status:'출발',t:s+200e3},
  ];
  const r=scoreWindow(events,log,s+400e3);
  assert.equal(r.coverage,.8,'등촌은 서지도 지나지도 않아 못 맞춘다');
  assert.equal(r.passed,2);
  assert.deepEqual([r.arrive.n,r.depart.n],[2,2]);
  assert.equal(r.arrive.p90,20);
  assert.equal(r.depart.p90,20);
});

test('scoreWindow: passes 가 없는 옛 기록도 그대로 채점',()=>{
  const log=new Map([['7001',{stops:[{where:'중곡',stop:0,leave:30e3}]}]]);
  const r=scoreWindow([{train:'7001',station:'중곡',status:'도착',t:-10e3}],log,60e3);
  assert.deepEqual([r.coverage,r.passed,r.arrive.signedMedian],[1,0,10]);
});
