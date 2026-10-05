import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {platformRuntime} from './platform_endpoints_fixture.mjs';

for(const zoom of [14,16,18,20])test(`줌 ${zoom}: 기본 노선에는 원본 대비 추가 되돌아감이 없어요`,()=>{
 const r=platformRuntime(undefined,zoom);
 for(const [key,raw] of Object.entries(r.raw)){
   const [line,a,b]=key.split(':');Object.assign(r.context,{testLine:line,testA:+a,testB:+b});
   const track=vm.runInContext('basicTrack(testLine,testA,testB)',r.context);
   // 원본 꼭짓점 수·순서를 보존해요. 종착역 접선 연장만 양 끝에 추가될 수 있어요.
   assert.equal(track.train.length,raw.length);assert.ok(track.coords.length-track.train.length<=2,key);
   for(let i=0;i<track.train.length;i++)assert.equal(track.coords[i+(track.coords.length>track.train.length&&track.coords[0]!==track.train[0]?1:0)],track.train[i],key);
 }
});

test('stops와 심시티·롤코 승강장은 기본 단축의 영향을 받지 않아요',()=>{
 const r=platformRuntime(),stops=JSON.stringify(r.context.stops);
 r.context.simcity=true;vm.runInContext('buildStationFeatures()',r.context);
 const simcity=JSON.stringify([...r.rects]);
 r.context.simcity=false;vm.runInContext('buildStationFeatures()',r.context);
 assert.notEqual(JSON.stringify([...r.rects]),simcity);
 r.context.simcity=true;vm.runInContext('buildStationFeatures()',r.context);
 assert.equal(JSON.stringify([...r.rects]),simcity);assert.equal(JSON.stringify(r.context.stops),stops);
});
