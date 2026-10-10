import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceGrid, trackMetrics } from '../web/lib/coaster_style_seoul.mjs';
import { buildCoasterTrackMesh } from '../web/lib/coaster_track_mesh.mjs';

test('track ties stay on the same edge grid across chunk and LOD boundaries',()=>{
  const whole=distanceGrid(0,407,7.5), chunks=[...distanceGrid(0,200,7.5),...distanceGrid(200,407,7.5)];
  assert.deepEqual(chunks,whole);assert.equal(new Set(chunks).size,chunks.length);
  assert.ok(distanceGrid(0,407,7.5,2).every(x=>whole.includes(x)));
  for(const zoom of [12,14.5,16,17.5,18]){
    const m=trackMetrics(zoom);assert.ok(m.rail>=1&&m.rail<=1.7);assert.ok(m.spineDepth>=1.2&&m.spineDepth<=2.6);
  }
});

test('coaster mesh stays finite through an inversion and keeps a bounded footprint',()=>{
  const mu=1/32000000;
  const at=s=>({x:s,y:0,h:100*mu,R:[0,1],F:[1,0,0],U:[0,0,-1],G:[1,0,0],loop:true});
  const mesh=buildCoasterTrackMesh({points:[at(0),at(100*mu)],at,columns:[],s0:0,s1:100*mu,mu,offset:0,lvl:8,color:[0,.5,0]});
  assert.equal(mesh.length%22,0);assert.ok(mesh.length>0);assert.ok(mesh.every(Number.isFinite));
  assert.ok(mesh.byteLength<300000,'one 100 m chunk stays small');
});

test('줌 19.5 이상에서는 선로 · 기둥을 실제 굵기로 그린다(픽셀 상한에 묶여 납작해지지 않게)',()=>{
  const m=trackMetrics(20),mpp=m.mpp;
  assert.ok(Math.abs(m.post-1.25/mpp)<1e-9&&Math.abs(m.rail-.32/mpp)<1e-9&&Math.abs(m.spineDepth-1.2/mpp)<1e-9);
  assert.ok(trackMetrics(19).post>trackMetrics(18).post);
});
