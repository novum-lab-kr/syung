import test from 'node:test';
import assert from 'node:assert/strict';
import {platformStroke} from '../web/lib/platform_stroke.mjs';
import {platformRuntime} from './platform_endpoints_fixture.mjs';
import {trainRuntime} from './platform_trains_fixture.mjs';
import fs from 'node:fs';

test('촘촘한 직선은 짧은 선분을 늘리지 않고 같은 폭으로 연결해요',()=>{
 const p=[0,.01,.2,1,5,20].map(x=>({x,y:0})),r=platformStroke(p,1,8);
 assert.equal(r.length,20);
 assert.equal(r.vertices.length,30);
 for(const v of r.vertices){assert.ok(v.x>=-1&&v.x<=21);assert.equal(Math.abs(v.y),5)}
});

test('곡선과 전 역 승강장의 모든 이음매는 같은 정점을 공유해요',()=>{
 const r=trainRuntime(),{MercatorCoordinate}=r.context.maplibregl;
 for(const [key,rect] of r.rects){
  const points=rect.coords.map(c=>MercatorCoordinate.fromLngLat(c));
  const mesh=platformStroke(points,1/(512*2**18),12);
  assert.ok(mesh.length>0,key);
  for(const v of mesh.vertices)for(const k of ['x','y','s','t'])assert.ok(Number.isFinite(v[k]),key);
  for(let i=6;i<mesh.vertices.length;i+=6){
   assert.strictEqual(mesh.vertices[i-5],mesh.vertices[i],key);
   assert.strictEqual(mesh.vertices[i-4],mesh.vertices[i+5],key);
  }
 }
});

test('기본 지도는 리본 하나를 그리고 다른 모드는 기존 막대를 그려요',()=>{
 const src=fs.readFileSync('web/map/platform.mts','utf8');
 assert.ok(src.includes('const stroke=platformStroke(g.points,unit,g.h)'));
 assert.ok(src.includes('if(v_tw.x<-3.5)'));
 assert.ok(!src.includes('Math.max(d/unit,g.h)'));
 assert.ok(src.includes('quad(g.cx,g.cy,g.ax,g.ay,Math.max(g.len,g.h)'));
});
