import test from 'node:test';
import assert from 'node:assert/strict';
import {trainLayerClass} from '../web/trains/draw.mts';
import {createCoasterTrack} from '../web/modes/coaster/track.mts';

// 모드 전용 GL 자원(4-13②): 지금 모양에 쓰는 것만 만들고, 안 쓰는 모양으로 바뀌면 치운다. 같은 모양에서는 다시 만들지 않는다
test('열차 층: 88열차 · 1인칭 레일은 coaster88 에서만, 배 선단은 fleet 에서만', () => {
  const log=[];const mk=name=>class{constructor(){this.name=name;log.push('new '+name)}init(){log.push('init '+this.name)}dispose(){log.push('dispose '+this.name)}};
  class CoasterTrain extends mk('c88'){static last=null}class TurtleShips extends mk('ships'){static last=null}const RideTrack=mk('rail');
  const live={kitReady:true,CoasterTrain,TurtleShips,RideTrack,settings:{trains:{look:'commuter'}}};
  const L=trainLayerClass({map:{},JOSEON_STYLE:{train:{turtleShip:{}}},live}),layer=new L();layer.gl={};
  layer.kit('commuter');assert.deepEqual(log,[]);
  layer.kit('coaster88');layer.kit('coaster88');assert.deepEqual(log,['new rail','new c88','new c88','init c88','init c88'],'한 번만');
  CoasterTrain.last={n:3};log.length=0;
  layer.kit('fleet');assert.deepEqual(log,['dispose c88','dispose c88','dispose rail','new ships','init ships']);assert.equal(CoasterTrain.last,null,'점검 창구도 비운다');
  assert.equal(layer.c88,null);assert.equal(layer.rideTrack,null);
  log.length=0;layer.kit('commuter');layer.kit('commuter');assert.deepEqual(log,['dispose ships'],'두 번 치우지 않는다');
  live.kitReady=false;log.length=0;layer.kit('coaster88');assert.deepEqual(log,[],'모드 코드가 오기 전에는 아무것도');
});

test('열차 층: 그릴 열차가 없거나 열차를 꺼 둬도 모드를 나가면 치운다', () => {
  const log=[];const mk=name=>class{constructor(){this.name=name}init(){}dispose(){log.push('dispose '+this.name)}};
  class CoasterTrain extends mk('c88'){static last=null}class TurtleShips extends mk('ships'){static last=null}
  const live={kitReady:true,CoasterTrain,TurtleShips,RideTrack:mk('rail'),settings:{trains:{look:'coaster88'}},myLocation:null,trainsEnabled:true},planner={plans:[]};
  const L=trainLayerClass({map:{},JOSEON_STYLE:{train:{turtleShip:{}}},planner,live}),layer=new L();layer.gl={};layer.kit('coaster88');CoasterTrain.last={n:1};
  live.settings={trains:{look:'commuter'}};layer.render({},{});   // 열차 0대 — 일찍 끝나는 길
  assert.deepEqual(log,['dispose c88','dispose c88','dispose rail']);assert.equal(CoasterTrain.last,null);
  layer.kit('fleet');live.settings={trains:{look:'commuter'}};live.trainsEnabled=false;planner.plans=[{}];log.length=0;layer.render({},{});   // 열차 꺼 둠
  assert.deepEqual(log,['dispose ships']);
});

test('롤코 선로: 롤코가 아니면 지은 버퍼만 치우고(CPU 자료 · 셰이더는 남김) 그리지 않는다', () => {
  let coaster=true;const deleted=[];
  const T=createCoasterTrack({map:{getZoom:()=>15},maplibregl:{},HOME:{},paths:{},byId:new Map(),colors:{},PHONE:true,isCoaster:()=>coaster,getSelected:()=>'all',trainFrameSoon(){},
    coasterTrackVertexShader:()=>'',COASTER_TRACK_FS:'',buildCoasterTrackMesh(){},geom(){},coasterProfile(){},coasterAt(){},coasterRises(){},loopD(){},corkOf(){},rolled(){},CORK_HEART:0,edgeOffset(){},hexRGB(){},coasterBodyPx(){},cityViaduct:{}});
  T.p={};T.cache=new Map([['a',{b:'buf1',n:2}],['b',{b:'buf2',n:3}],['c',{n:1}]]);T.bytes=500;T.bulbPts=[1];T.list=['x'];
  const gl={deleteBuffer:b=>deleted.push(b)};
  coaster=false;T.render(gl,null,0);
  assert.deepEqual(deleted,['buf1','buf2']);assert.equal(T.cache.size,0);assert.equal(T.bytes,0);
  assert.deepEqual(T.bulbPts,[1],'전구 자리(밤 조명이 읽는다)는 남긴다');assert.ok(T.p,'셰이더는 남긴다');
  T.render(gl,null,0);assert.equal(deleted.length,2,'비었으면 다시 안 지운다');
});
