import test from 'node:test';
import assert from 'node:assert/strict';
import {BusRoadNetwork,busRoadProfile,busRoadLane,busRoadPointAt} from '../web/lib/bus_roads.mjs';
import {buildBusPath} from '../web/lib/bus_motion.mjs';

const K=111320*Math.cos(37.5*Math.PI/180),M=111320;
const coord=(x,y)=>[127+x/K,37.5+y/M];
const xy=p=>[(p[0]-127)*K,(p[1]-37.5)*M];
const road=(points,properties={})=>({type:'Feature',properties:{class:'primary',...properties},geometry:{type:'LineString',coordinates:points.map(p=>coord(...p))}});
const network=roads=>{const n=new BusRoadNetwork();n.update(roads);return n;};
const path=points=>buildBusPath(points.map(p=>coord(...p)));

test('bus lanes use CityLife widths and lane counts, including one-way ramps',()=>{
  const primary=busRoadProfile({class:'primary'}),minor=busRoadProfile({class:'minor'});
  assert.equal(primary.width,22);assert.equal(primary.lanes,3);assert.equal(minor.width,6);
  const ramp=busRoadProfile({class:'trunk',oneway:-1,ramp:1});
  assert.equal(ramp.width,26*.72*.55);assert.equal(ramp.oneway,-1);
  for(const p of [primary,minor,ramp,busRoadProfile({class:'service',oneway:1})]){
    const l=busRoadLane(p);assert.ok(l.offset>=0);assert.ok(l.offset+l.laneWidth/2<=p.width/2+1e-10);
  }
  assert.equal(busRoadProfile({class:'path'}),null);
  assert.equal(busRoadProfile({class:'primary',brunnel:'tunnel'}),null);
  assert.ok(busRoadLane(null).offset<=3.5);
});

test('off-road feed coordinates snap to the right lane, without changing feed distance',()=>{
  const n=network([road([[0,-150],[0,150]])]),p=path([[24,-100],[24,100]]),matched=n.match(p);
  const mid=busRoadPointAt(matched,p.total/2),q=xy(mid.coordinate);
  assert.ok(Math.abs(q[0]-22/2+22/12)<.1,'rightmost lane lies inside the 22m carriageway');
  assert.ok(Math.abs(q[1])<.1);assert.equal(mid.distance,p.total/2);
  assert.ok(Math.abs(mid.heading)<.1);
  const reverse=path([[24,100],[24,-100]]),south=xy(busRoadPointAt(n.match(reverse),reverse.total/2).coordinate);
  assert.ok(south[0]<0,'opposite direction uses the opposite side');
});

test('parallel one-way carriageways are selected by travel direction',()=>{
  const n=network([road([[0,-150],[0,150]],{oneway:1}),road([[20,150],[20,-150]],{oneway:1})]);
  const p=path([[16,-100],[16,100]]),q=xy(busRoadPointAt(n.match(p),p.total/2).coordinate);
  assert.ok(q[0]<12,'the nearby opposing carriageway must not win');
  const wrong=network([road([[0,-150],[0,150]],{oneway:1})]);
  assert.equal(wrong.match(path([[0,100],[0,-100]])).chunks.length,0);
});

test('connected turns traverse the road graph and vehicle samples stay on the drawn polyline',()=>{
  const n=network([road([[0,-140],[0,0]]),road([[0,0],[140,0]])]),p=path([[14,-110],[14,-8],[110,-8]]),matched=n.match(p);
  assert.ok(matched.chunks.length);
  for(const chunk of matched.chunks)for(let i=1;i<chunk.length;i++){
    const a=chunk[i-1],b=chunk[i];if(b.distance-a.distance<.001)continue;
    const d=(a.distance+b.distance)/2,pose=busRoadPointAt(matched,d);
    assert.ok(Math.hypot(...xy(pose.coordinate).map((v,k)=>v-(xy(a.coordinate)[k]+xy(b.coordinate)[k])/2))<.05);
    const [x,y]=xy(pose.coordinate);
    assert.ok((Math.abs(x)<=11.1&&y<=11.1)||(Math.abs(y)<=11.1&&x>=-11.1),'turn stays in the union of the two roads');
  }
});

test('a missing road does not draw or animate a straight shortcut across a gap',()=>{
  const n=network([road([[0,-180],[0,-70]]),road([[0,70],[0,180]])]),p=path([[0,-150],[0,150]]),matched=n.match(p);
  assert.equal(busRoadPointAt(matched,p.total/2),null);
  assert.ok(matched.chunks.every(c=>c.every(p=>Math.abs(xy(p.coordinate)[1])>=69.8)));
});

test('sub-metre OFM seams join only while the entire lane stays on the road surface',()=>{
  const n=network([road([[0,-150],[0,-.6]]),road([[0,.6],[0,150]])]),p=path([[3,-100],[3,100]]);
  assert.ok(busRoadPointAt(n.match(p),p.total/2),'a 1.2m source seam is covered by the road end surfaces');
  const gap=network([road([[0,-150],[0,-12]]),road([[0,12],[0,150]])]);
  assert.equal(busRoadPointAt(gap.match(p),p.total/2),null,'a larger gap remains unconnected');
});

test('unchanged OFM tiles reuse the graph; overview tiles cannot replace detailed geometry',()=>{
  const roads=[road([[0,-150],[0,150]])],n=network(roads),version=n.version;
  assert.equal(n.update(roads),false);assert.equal(n.version,version);
  assert.equal(n.update([{...roads[0],tile:{z:12,x:0,y:0}}]),false);
  assert.equal(n.version,version);
});
