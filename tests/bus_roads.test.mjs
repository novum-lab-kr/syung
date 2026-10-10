import test from 'node:test';
import assert from 'node:assert/strict';
import {BusRoadNetwork,busRoadProfile,busRoadLane,busRoadPointAt,busLinePointAt} from '../web/bus/roads.mjs';
import {buildBusPath} from '../web/bus/motion.mjs';

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

test('route display line sits on the CityLife road centre, keeping its own carriageway and continuity',()=>{
  const two=network([road([[-150,0],[150,0]])]);
  const on=two.snapLine(path([[-100,8],[100,8]]));
  assert.ok(on.samples.every(p=>Math.abs(xy(p.coordinate)[1])<.01&&p.width===22));
  // 상하행 분리 차도: 가운데로 모아 둔 선도 진행 방향대로 자기 차도에 붙는다.
  const split=network([road([[-8,-150],[-8,150]],{oneway:1}),road([[8,150],[8,-150]],{oneway:1})]);
  const north=split.snapLine(path([[0,-100],[0,100]])),south=split.snapLine(path([[0,100],[0,-100]]));
  assert.ok(north.samples.every(p=>Math.abs(xy(p.coordinate)[0]+8)<.01));
  assert.ok(south.samples.every(p=>Math.abs(xy(p.coordinate)[0]-8)<.01));
  // 맞는 도로가 없으면 원래 자리에 남아 선이 끊기지 않는다.
  const far=two.snapLine(path([[-100,200],[100,200]]));
  assert.ok(far.samples.length>2&&far.samples.every(p=>p.width===null&&Math.abs(xy(p.coordinate)[1]-200)<.01));
});

test('route display line does not zigzag across a split road or jog off a short gap in the roads',()=>{
  // 미리 맞춘 선에 남은 6 m 되돌이 꺾임: 그 자리만 방향이 뒤집혀 반대 차도로 건너가는 가로 막대가 생겼다.
  const split=network([road([[-8,-150],[-8,150]],{oneway:1}),road([[8,150],[8,-150]],{oneway:1})]);
  const spike=split.snapLine(path([[0,-100],[0,0],[0,-6],[0,100]]));
  assert.ok(spike.samples.every(p=>Math.abs(xy(p.coordinate)[0]+8)<.01),'stays on its own carriageway');
  // 도로가 잠깐(24 m) 끊긴 곳: 샘플 몇 개가 원래 선(24 m 옆)으로 튀었다 돌아오던 계단 꺾임.
  const gap=network([road([[-150,0],[-12,0]]),road([[12,0],[150,0]])]);
  const hop=gap.snapLine(path([[-100,24],[100,24]]));
  assert.ok(hop.samples.every(p=>Math.abs(xy(p.coordinate)[1])<.01&&p.width===22),'bridges the gap on the road');
  // 도로 타일이 덜 들어온 가장자리: 큰길은 아직 없고 샘플 하나만 24 m 옆 골목에 붙던 가로 막대.
  const edge=network([road([[-4,23],[4,23]],{class:'minor'})]);
  const lone=edge.snapLine(path([[-100,0],[100,0]]));
  assert.ok(lone.samples.every(p=>Math.abs(xy(p.coordinate)[1])<.01),'stays on the route line');
  // 나란한 두 길(서부간선 · 안양천로) 사이를 흔들리며 지나는 선: 점마다 가까운 쪽으로 옮겨 다니던 지그재그.
  const pair=network([road([[-150,0],[150,0]],{oneway:1}),road([[-150,14],[150,14]],{oneway:1})]);
  const wobble=pair.snapLine(path(Array.from({length:17},(_,i)=>[-96+i*12,i%2?10:4])));
  const ys=new Set(wobble.samples.map(p=>Math.round(xy(p.coordinate)[1])));
  assert.equal(ys.size,1,'one road the whole way');
  // 교차로에서 꺾는 길은 곧게 펴지 않는다.
  const corner=network([road([[-150,0],[0,0]]),road([[0,0],[0,150]])]);
  const turn=corner.snapLine(path([[-100,0],[0,0],[0,100]]));
  assert.ok(turn.samples.every(p=>{const [x,y]=xy(p.coordinate);return Math.abs(x)<.01||Math.abs(y)<.01;}),'never cuts the corner diagonally');
});

test('a stop pinned inside the carriageway moves to the pavement on its own side, across a split road',()=>{
  const two=network([road([[-150,0],[150,0]])]);
  const north=xy(two.kerbside(coord(0,4))),south=xy(two.kerbside(coord(0,-4)));
  assert.ok(north[1]>12.5&&north[1]<14&&Math.abs(north[0])<.01);
  assert.ok(south[1]<-11&&south[1]>-14);
  const pavement=coord(0,30);assert.deepEqual(two.kerbside(pavement),pavement);
  // 분리 차도 사이(중앙)에 찍힌 정류장은 바깥 차도를 넘어 인도까지 간다.
  const split=network([road([[-150,-9],[150,-9]],{oneway:1}),road([[150,9],[-150,9]],{oneway:1})]);
  const out=xy(split.kerbside(coord(0,2)));
  assert.ok(Math.abs(out[1])>9+22*.72/2+1.5,'beyond the outer carriageway');
  // 고가 도로 밑(화랑대역 · 북부간선)도 위에서 보면 도로라서, 지상 차도와 고가를 다 넘어 덜 움직이는 쪽 인도로.
  const deck=network([road([[-150,-19.2],[150,-19.2]],{oneway:1}),road([[150,-5.6],[-150,-5.6]],{oneway:1}),
    road([[-150,6],[150,6]],{class:'trunk',oneway:1,brunnel:'bridge'}),road([[150,14.5],[-150,14.5]],{class:'trunk',oneway:1,brunnel:'bridge'})]);
  const under=xy(deck.kerbside(coord(0,0)));
  assert.ok(under[1]>14.5+26*.72/2+1.5,'past both decks, the shorter way out');
});

test('a bus rides the route line in the right-hand lane of its road, and never vanishes off the road graph',()=>{
  const n=network([road([[-150,0],[150,0]])]),lane=busRoadLane(busRoadProfile({class:'primary'}));
  const east=path([[-100,8],[100,8]]),west=path([[100,8],[-100,8]]);
  const e=busLinePointAt(n.snapLine(east),east.total/2),w=busLinePointAt(n.snapLine(west),west.total/2);
  assert.ok(Math.abs(xy(e.coordinate)[1]+lane.offset)<.05&&Math.abs(e.heading-90)<1,'eastbound: south (right) lane');
  assert.ok(Math.abs(xy(w.coordinate)[1]-lane.offset)<.05&&Math.abs(w.heading-270)<1,'westbound: north (right) lane');
  assert.equal(e.laneWidth,lane.laneWidth);
  // 도로를 못 찾은 구간도 노선 선 위에 그대로 있다(예전엔 사라졌다).
  const far=path([[-100,200],[100,200]]),f=busLinePointAt(n.snapLine(far),far.total/2);
  assert.ok(Math.abs(xy(f.coordinate)[1]-200)<.05);
});

test('route display line keeps its carriageway past a side road or slip road crossing the median (청담역 2415)',()=>{
  // 노선 선은 분리 차도 가운데(중앙분리대)에 있다. 교차로에서 그 선을 비스듬히 지나는 골목, 선 바로 옆을 지나는 진출로가
  // 자기 차도(7 · 14 m 옆)보다 가까워서, 선이 몇 샘플 동안 그쪽으로 붙었다 돌아오던 지그재그(2026-10-09 덕배, 청담역 2415).
  const side=network([road([[-150,-7],[150,-7]],{class:'secondary',oneway:1}),road([[-40,-28],[40,28]],{class:'minor'})]);
  const a=side.snapLine(path([[-100,0],[100,0]]));
  assert.ok(a.samples.every(p=>Math.abs(xy(p.coordinate)[1]+7)<.01),'stays on its carriageway through the junction');
  const slip=network([road([[-150,-14],[150,-14]],{oneway:1}),road([[-30,-10],[30,3]],{oneway:1,ramp:1})]);
  const b=slip.snapLine(path([[-100,0],[100,0]]));
  assert.ok(b.samples.every(p=>Math.abs(xy(p.coordinate)[1]+14)<.01),'never runs along the slip road beside the line');
});
