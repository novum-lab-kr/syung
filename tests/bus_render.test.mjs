import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBusPath,busLaneMeters,offsetBusPath,offsetBusPointAt} from '../web/lib/bus_motion.mjs';
import {buildBusMesh,buildBusPostMesh,projectBusPoint,busModelScale} from '../web/lib/bus_mesh.mjs';

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
