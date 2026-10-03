import test from 'node:test';
import assert from 'node:assert/strict';
import { planStationFurniture, orientedOverlap } from '../web/lib/coaster_stations.mjs';

const site=(id,x=0,y=0,ax=1,ay=0)=>({key:`${id}:1`,id:'1',line:id,x,y,ax,ay,length:180,mu:1,offset:0,plat:1});
test('boarding canopies leave the complete train envelope open',()=>{
  const plan=planStationFurniture([site('2호선')],{metresPerPx:1,bodyPx:20,lanePx:18});
  assert.ok(plan.roofs.length>0);assert.equal(plan.decks.length,2);assert.equal(plan.gates.length,2);
  for(const roof of plan.roofs)assert.ok(Math.abs(roof.y)-roof.width/2>=28+2.4);
});
test('transfer canopies neither cross another line nor overlap one another',()=>{
  const plan=planStationFurniture([site('2호선'),site('신분당선',0,0,0,1)],{metresPerPx:1,bodyPx:20,lanePx:18});
  assert.ok(plan.roofs.length>0);
  for(let i=0;i<plan.roofs.length;i++){
    const roof=plan.roofs[i];
    for(const train of plan.corridors)assert.equal(orientedOverlap(roof,train),false,'roof stays outside every train corridor');
    for(const other of plan.roofs.slice(i+1))assert.equal(orientedOverlap(roof,other),false,'roofs stay separate');
  }
  assert.deepEqual(planStationFurniture([site('신분당선',0,0,0,1),site('2호선')],{metresPerPx:1,bodyPx:20,lanePx:18}),plan,'input order cannot change the transfer layout');
});
