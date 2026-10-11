import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {trainRuntime} from './platform_trains_fixture.mjs';
import SNAP from '../web/city/viaduct_snap.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
for(const simcity of [false,true])for(const [line,lo,hi,snapped] of [['6호선',425,426,true],['1호선',226,227,false]])test(`${simcity?'심시티':'기본'} 노선·열차가 ${snapped?'스냅':'선로'} 원본 경로를 사용해요`,()=>{
 const r=trainRuntime();r.context.simcity=simcity;
 const g=r.geom(line,lo,hi),expected=r.raw[`${line}:${lo}:${hi}`];
 assert.equal(Boolean(SNAP[`${line}:${lo}:${hi}`]),snapped);
 const coords=vm.runInContext('buildLineFeatures()',r.context)[Object.keys(r.raw).indexOf(`${line}:${lo}:${hi}`)].geometry.coordinates;
 assert.deepEqual(plain(coords),plain(expected));
 g.pts.forEach((p,i)=>assert.ok(Math.hypot(...r.toLL(p).map((v,j)=>v-expected[i][j]))<1e-10));
});
test('롤코 경로와 심시티 승강장은 기본 승강장 단축과 독립적이에요',()=>{
 const r=trainRuntime(),sentinel={pts:[],total:123};r.context.coasterPath=()=>sentinel;r.context.coaster=true;
 assert.equal(r.geom('6호선',425,426),sentinel);
 r.context.coaster=false;r.context.simcity=true;vm.runInContext('buildStationFeatures()',r.context);
 // 심시티 승강장도 기본처럼 상판 중심선(cityCoords)을 따라 실제 승강장 길이(platformHalf)로 휜다(2026-10-11 행님 '기본 베이스에 맞춰져야')
 const c=r.rects.get('8호선:24').coords,M=(a,b)=>Math.hypot((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1])*111320;
 let m=0;for(let i=1;i<c.length;i++)m+=M(c[i-1],c[i]);
 assert.ok(Math.abs(m-2*r.context.platformHalf['8호선:24'])<1,String(m));
});
