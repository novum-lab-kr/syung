import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBusPath,busLaneMeters,offsetBusPath,offsetBusPointAt} from '../web/bus/motion.mts';
import {buildBusMesh,buildBusPostMesh,projectBusPoint,busModelScale} from '../web/bus/mesh.mts';

test('northbound and southbound buses move to their own right-hand lanes',()=>{
  const north=buildBusPath([[127,37.5],[127,37.501]]),south=buildBusPath([[127,37.501],[127,37.5]]);
  assert.ok(offsetBusPath(north,6)[0][0]>127);
  assert.ok(offsetBusPath(south,6)[0][0]<127);
  for(const z of [13,15,16,17,18])assert.equal(busLaneMeters(z,37.5),1.5,'unknown road width stays within one lane at every zoom');
});

test('offset motion follows the exact drawn lane around a corner',()=>{
  const path=buildBusPath([[127,37.5],[127,37.501],[127.001,37.501]]),lane=offsetBusPath(path,6);
  const s=(path.distances[1]+path.distances[2])/2,p=offsetBusPointAt(path,s,lane).coordinate;
  assert.ok(Math.abs(p[0]-(lane[1][0]+lane[2][0])/2)<1e-10);
  assert.ok(Math.abs(p[1]-(lane[1][1]+lane[2][1])/2)<1e-10);
  assert.ok(lane.every(p=>p.every(Number.isFinite)));
});

test('toy buses have real volume and wheels; round bus signs have a raised face',()=>{
  for(const mesh of [buildBusMesh(),buildBusPostMesh()]){
    assert.equal(mesh.length%27,0);assert.ok(mesh.every(Number.isFinite));
    assert.ok(mesh.length/9<1500,'bounded shared prototype mesh');
  }
  const bus=buildBusMesh(),slots=Array.from(bus).filter((_,i)=>i%9===8);
  for(const material of [0,1,2,3,4,5,6,12])assert.ok(slots.includes(material));
  const sign=buildBusPostMesh();assert.ok(Array.from(sign).some((v,i)=>i%9===2&&v>20));
  assert.ok(busModelScale(18)>busModelScale(15));
});

test('picking projects the same elevated point as the WebGL camera and rejects behind-camera points',()=>{
  const m=[1,0,0,0,0,1,0,0,0,.5,1,0,0,0,0,1];
  assert.deepEqual(projectBusPoint(m,0,0,0,400,300),{x:200,y:150});
  assert.ok(projectBusPoint(m,0,0,1,400,300).y<150);
  m[15]=-1;assert.equal(projectBusPoint(m,0,0,0,400,300),null);
});

// 모양(모드 설정 buses.look): 버스는 몸 묶음 0 · 밤 전조등, 가마는 몸 묶음 4 · 움직이는 동안 가마꾼 걸음 · 전조등 없음(4-12)
test('BusRenderer: look 으로 버스 · 가마를 고른다',async()=>{
  const {BusRenderer}=await import('../web/bus/mesh.mts');
  const run=(look,dark)=>{
    const r=new BusRenderer(),calls=[];let vao=null,last=null;
    r.init=()=>{};r.atlas=()=>{};r.labels=new Map();r.rows=1;r.u={};r.matrix=new Float32Array(16);
    r.batches=[0,1,2,3,4].map(i=>({vao:i,instances:{},count:3,staging:new Float32Array(0),capacity:0}));
    r.looks=new Map([['bus',{batch:0,carriers:false,headlights:true}],['palanquin',{batch:4,carriers:true,headlights:false}]]);
    const gl=new Proxy({bindVertexArray:v=>{vao=v},bufferSubData:(_t,_o,d)=>{last=Array.from(d.slice(0,12))},drawArraysInstanced:()=>calls.push({vao,moving:last[11]})},{get:(o,k)=>k in o?o[k]:typeof k==='string'&&/^[A-Z_]+$/.test(k)?0:()=>{}});
    r.render(gl,new Float32Array(16),{origin:[0,0],unit:1,dark,vehicles:[{world:[0,0],yaw:0,scale:1,rgb:[1,1,1],label:'1',moving:true}],stops:[],look});
    return calls;
  };
  assert.deepEqual(run('bus',false).map(c=>c.vao),[2,0]);
  assert.deepEqual(run('bus',true).map(c=>c.vao),[2,0,3],'밤 버스: 전조등');
  const p=run('palanquin',true);
  assert.deepEqual(p.map(c=>c.vao),[2,4],'가마: 몸 묶음 4, 전조등 없음');
  assert.ok(p.every(c=>c.moving===1),'움직이는 가마: 가마꾼 걸음');
  assert.ok(run('bus',false).every(c=>c.moving===0));
});

test('버스 모양 등록: 등록한 모양은 다음 init 에서 배치 4 부터, 가마 메시는 web/modes/joseon/palanquin.mts',async()=>{
  const {BusRenderer,registerBusLook}=await import('../web/bus/mesh.mts');
  const {buildPalanquinMesh}=await import('../web/modes/joseon/palanquin.mts');
  const P=buildPalanquinMesh();assert.equal(P.length%9,0);assert.ok(P.every(Number.isFinite));assert.ok(Array.from(P).some((v,i)=>i%9===8&&v===20),'가마꾼 다리 재료');
  registerBusLook('palanquin',{build:buildPalanquinMesh,carriers:true,headlights:false});
  const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true},{get:(o,k)=>k in o?o[k]:typeof k==='string'&&/^[A-Z_0-9]+$/.test(k)?0:()=>({})});
  const r=new BusRenderer();r.init(gl);
  assert.equal(r.batches.length,5);assert.deepEqual([...r.looks].map(([n,L])=>[n,L.batch,L.carriers,L.headlights]),[['bus',0,false,true],['palanquin',4,true,false]]);
  assert.equal(r.batches[4].count,P.length/9);
});

// 조선 정류장(행님 2026-10-11): 가마 모양에 정류장 메시(청사초롱 장대)와 밤 불빛을 같이 등록 — 낮에는 장대만, 밤에는 불빛 묶음을 깊이 없이 하나 더
test('조선 청사초롱 정류장: BUS 기둥과 같은 크기, 가마 모양이면 정류장 묶음 · 밤 불빛',async()=>{
  const {BusRenderer,registerBusLook}=await import('../web/bus/mesh.mts');
  const {buildPalanquinMesh,buildChorongPostMesh,buildChorongGlowMesh}=await import('../web/modes/joseon/palanquin.mts');
  const C=buildChorongPostMesh(),xs=[],zs=[],mats=new Set();
  for(let i=0;i<C.length;i+=9){xs.push(C[i]);zs.push(C[i+2]);mats.add(C[i+8]);}
  assert.ok(C.every(Number.isFinite)&&C.length/9<1500);
  assert.ok(Math.max(...xs.map(Math.abs))<8.5,'가로 ±7.5 상자 안팎(BUS 판과 같은 자리)');
  assert.ok(Math.min(...zs)>=0&&Math.max(...zs)<=25.6,'높이 0~25.5');
  for(const m of [30,31,32,33,34,35])assert.ok(mats.has(m),`재료 ${m}`);
  assert.equal(buildChorongGlowMesh()[8],36);
  registerBusLook('palanquin',{build:buildPalanquinMesh,carriers:true,headlights:false,stop:buildChorongPostMesh,stopGlow:buildChorongGlowMesh});
  const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true},{get:(o,k)=>k in o?o[k]:typeof k==='string'&&/^[A-Z_0-9]+$/.test(k)?0:()=>({})});
  const r=new BusRenderer();r.init(gl);
  assert.deepEqual([...r.looks].map(([n,L])=>[n,L.batch,L.stopBatch,L.glowBatch]),[['bus',0,1,null],['palanquin',4,5,6]]);
  const run=(look,dark)=>{
    const calls=[];let vao=null;
    const g=new Proxy({bindVertexArray:v=>{vao=v},drawArraysInstanced:()=>calls.push(vao)},{get:(o,k)=>k in o?o[k]:typeof k==='string'&&/^[A-Z_]+$/.test(k)?0:()=>{}});
    r.init=()=>{};r.atlas=()=>{};r.labels=new Map();r.rows=1;r.u={};
    r.batches=r.batches.map((b,i)=>({...b,vao:i}));
    r.render(g,new Float32Array(16),{origin:[0,0],unit:1,dark,vehicles:[],stops:[{world:[0,0],yaw:0,scale:1,rgb:[.2,.4,.8]}],look});
    return calls;
  };
  assert.deepEqual(run('bus',true),[1],'버스: BUS 기둥, 정류장 불빛 없음');
  assert.deepEqual(run('palanquin',false),[5],'조선 낮: 청사초롱 장대');
  assert.deepEqual(run('palanquin',true),[5,6],'조선 밤: 장대 + 불빛');
});
