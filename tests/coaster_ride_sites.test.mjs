import test from 'node:test';
import assert from 'node:assert/strict';
import { RideLayer } from '../web/modes/coaster/rides.mjs';
import { rideIntersectsBuildings,rideIntersectsTracks,withRideKind,selectRideSites,rideInPark,RIDE_SITE_RULES } from '../web/modes/coaster/ride_sites.mjs';
import { CoasterRidePlacement } from '../web/modes/coaster/ride_placement.mjs';

// a square park (mercator) of half-size m metres round s, optionally offset east by dx metres
const square=(s,m,dx=0)=>{const r=m*s.mu,x=s.x+dx*s.mu;return {outer:[x-r,s.y-r,x+r,s.y-r,x+r,s.y+r,x-r,s.y+r],holes:[]}};
const closeWheels=[[127.060816,37.510319,54,229],[127.06122,37.509602,70,183]];
test('neighbouring tower sites cannot place two ferris wheels 87 metres apart',()=>{
  const a=new RideLayer(closeWheels).sites(),b=new RideLayer([...closeWheels].reverse()).sites();
  assert.ok(a.filter(s=>s.kind==='ferris').length<=1,'nearby wheels must diversify or be omitted');
  assert.deepEqual(a,b,'site selection cannot depend on source order');
});

test('a building through the ride base omits the site, including low buildings absent from the old height grid',()=>{
  const tower=[127.0276,37.4979,40,180],s=new RideLayer([tower]).candidates[0],r=4*s.mu;
  const building={outer:[s.x-r,s.y-r,s.x+r,s.y-r,s.x+r,s.y+r,s.x-r,s.y+r],holes:[],base:0,height:5};
  assert.equal(new RideLayer([tower],{buildings:[building]}).sites().length,0,'five-metre building occupies the mast foundation');
});

test('the swept ride volume cannot cut through an elevated coaster rail',()=>{
  const tower=[127.0276,37.4979,40,180],s=new RideLayer([tower]).candidates[0];
  const track={a:[s.x-100*s.mu,s.y,50],b:[s.x+100*s.mu,s.y,50],radius:3};
  assert.equal(new RideLayer([tower],{tracks:[track]}).sites().length,0,'elevated rail crosses every candidate mast');
});

test('a high canopy may clear a low roof but cannot pass through a tall neighbouring building',()=>{
  const s=withRideKind(new RideLayer([[127.0276,37.4979,40,180]]).candidates[0],'saucer'),x=s.x+48*s.mu,r=3*s.mu;
  const b={outer:[x-r,s.y-r,x+r,s.y-r,x+r,s.y+r,x-r,s.y+r],holes:[],base:0,height:40};
  assert.equal(rideIntersectsBuildings(s,[b]),false,'narrow mast and high canopy clear the low roof');
  assert.equal(rideIntersectsBuildings(s,[{...b,height:145}]),true,'the same footprint intersects the canopy at height');
});

test('a site stays hidden until its whole building neighbourhood has been checked',async()=>{
  const module=await import('../web/modes/coaster/ride_placement.mjs').catch(()=>({}));
  assert.equal(typeof module.CoasterRidePlacement,'function','placement must wait for authoritative footprint coverage');
  const candidates=new RideLayer([[127.0276,37.4979,40,180]]).candidates,s=candidates[0];
  let release;const ready=new Promise(resolve=>{release=resolve});
  const p=new module.CoasterRidePlacement(candidates,{readTile:async()=>{await ready;return {buildings:[],parks:[square(s,600)],water:[]}},getTracks:()=>[]});
  const loading=p.update([s.x-.001,s.y-.001,s.x+.001,s.y+.001]);
  assert.equal(p.sites.length,0);release();await loading;
  assert.equal(p.sites.length,1);
  const chosen=p.sites.map(s=>[s.lon,s.lat,s.kind]);
  await p.update([s.x-.00001,s.y-.00001,s.x+.00001,s.y+.00001]);
  assert.deepEqual(p.sites.map(s=>[s.lon,s.lat,s.kind]),chosen,'panning cannot reassign a completed neighbourhood');
});

test('failed footprint coverage cannot admit a ride and a successful retry restores placement',async()=>{
  const candidates=new RideLayer([[127.0276,37.4979,40,180]]).candidates,park=square(candidates[0],600);
  let failed=true;
  const p=new CoasterRidePlacement(candidates,{readTile:async()=>{if(failed)throw Error('offline');return {buildings:[],parks:[park],water:[]}}});
  await p.update([0,0,1,1]);
  assert.equal(p.stats.failed,1);assert.equal(p.sites.length,0);
  failed=false;p.groups[0].retryAt=0;
  await p.update([0,0,1,1]);
  assert.equal(p.stats.failed,0);assert.equal(p.sites.length,1);
});

test('a drop seat at its lowest pose still blocks a roof just below the ring',()=>{
  const s=withRideKind(new RideLayer([[127.0276,37.4979,40,180]]).candidates[0],'drop'),x=s.x+40*s.mu,r=2*s.mu;
  // The seat underside is at (.15 - .032)H, below the nominal .12H bound.
  const b={outer:[x-r,s.y-r,x+r,s.y-r,x+r,s.y+r,x-r,s.y+r],height:.119*s.height_m-12};
  assert.equal(rideIntersectsBuildings(s,[b]),true);
});

test('height clipping follows rising and descending rail segments, while an overhead rail clears the ride',()=>{
  const s=withRideKind(new RideLayer([[127.0276,37.4979,40,180]]).candidates[0],'saucer');
  const crossing={a:[s.x-200*s.mu,s.y,0],b:[s.x+200*s.mu,s.y,300],radius:3};
  assert.equal(rideIntersectsTracks(s,[crossing]),true);
  assert.equal(rideIntersectsTracks(s,[{...crossing,a:crossing.b,b:crossing.a}]),true);
  assert.equal(rideIntersectsTracks(s,[{a:[s.x-200*s.mu,s.y,500],b:[s.x+200*s.mu,s.y,500],radius:3}]),false);
});

test('relocation keeps a blocked ride within 500 metres, clear of the building and rail',()=>{
  const candidates=new RideLayer([[127.0276,37.4979,40,180]]).candidates,s=candidates[0],r=30*s.mu;
  const buildings=[{outer:[s.x-r,s.y-r,s.x+r,s.y-r,s.x+r,s.y+r,s.x-r,s.y+r],height:100}];
  const tracks=[{a:[s.x-200*s.mu,s.y,50],b:[s.x+200*s.mu,s.y,50],radius:20}];
  const {sites}=selectRideSites(candidates,{buildings,tracks,relocate:true});
  assert.equal(sites.length,1,'move a blocked ride before considering omission');
  assert.ok(Math.hypot(sites[0].x-s.x,sites[0].y-s.y)/s.mu>30);
  assert.ok(Math.hypot(sites[0].x-s.x,sites[0].y-s.y)/s.mu<=500.01);
  assert.equal(rideIntersectsBuildings(sites[0],buildings),false);
  assert.equal(rideIntersectsTracks(sites[0],tracks),false);
});

test('compact elevated rides retain at least 70 percent over dense low-rise blocks without relaxing collisions',()=>{
  const towers=Array.from({length:10},(_,i)=>[127.0276+(i%5)*.00045,37.4979+Math.floor(i/5)*.00045,40,180]);
  const candidates=new RideLayer(towers).candidates,s=candidates[0],r=1500*s.mu;
  const buildings=[{outer:[s.x-r,s.y-r,s.x+r,s.y-r,s.x+r,s.y+r,s.x-r,s.y+r],height:20}];
  const selected=selectRideSites(candidates,{buildings,relocate:true}).sites;
  assert.ok(selected.length>=7,`retained ${selected.length}/10`);
  for(const a of selected){
    assert.ok(a.compact&&a.base_m>=32,'small rides stand wholly above the low roofs');
    assert.equal(rideIntersectsBuildings(a,buildings),false);
    const source=candidates.find(c=>c.lon===a.sourceLon&&c.lat===a.sourceLat);
    assert.ok(source);assert.ok(Math.hypot(a.x-source.x,a.y-source.y)/source.mu<=500.01);
  }
  const reverse=selectRideSites([...candidates].reverse(),{buildings,relocate:true}).sites;
  assert.deepEqual(selected.map(s=>[s.x,s.y,s.kind,s.base_m]),reverse.map(s=>[s.x,s.y,s.kind,s.base_m]));
});

test('an elevated compact ride clears a low roof but still rejects a rail at its lifted height',()=>{
  const source=new RideLayer([[127.0276,37.4979,40,180]]).candidates[0];
  const s=withRideKind({...source,base_m:45,height_m:70,r:12,mastR:2,maxExagH:1.6,maxExagV:1.15},'saucer'),r=100*s.mu;
  const buildings=[{outer:[s.x-r,s.y-r,s.x+r,s.y-r,s.x+r,s.y+r,s.x-r,s.y+r],height:20}];
  assert.equal(rideIntersectsBuildings(s,buildings),false);
  assert.equal(rideIntersectsTracks(s,[{a:[s.x-r,s.y,80],b:[s.x+r,s.y,80],radius:3}]),true);
});

test('the placement loader checks the park radius and moves the ride off the tower into a park in the next tile',async()=>{
  const lon=((13973+.7)/2**14-.5)*360;
  const candidates=new RideLayer([[lon,37.4979,40,180]]).candidates,s=candidates[0],r=30*s.mu,tiles=[];
  const building={outer:[s.x-r,s.y-r,s.x+r,s.y-r,s.x+r,s.y+r,s.x-r,s.y+r],height:180};
  const park=square(s,150,800);   // 650-950 m east: in tile 13974
  const p=new CoasterRidePlacement(candidates,{readTile:async tile=>{tiles.push(tile);return {buildings:[building],parks:tile.x===13974?[park]:[],water:[]}}});
  await p.update([s.x-.0001,s.y-.0001,s.x+.0001,s.y+.0001]);
  assert.equal(p.sites.length,1,'runtime placement puts the ride in the park');
  assert.ok(p.sites[0].move_m>=600&&p.sites[0].move_m<=RIDE_SITE_RULES.parkMoveM);
  assert.ok(rideInPark(p.sites[0],[park]));
  assert.ok(tiles.some(t=>t.x===13974),'tile beyond the original footprint is checked for a park move');
});

test('park rides: no park in reach omits the ride; the tower stays a building and never becomes the site',()=>{
  const candidates=new RideLayer([[127.0276,37.4979,40,180]]).candidates,s=candidates[0];
  assert.equal(selectRideSites(candidates,{inPark:true}).sites.length,0,'no park, no ride');
  assert.equal(selectRideSites(candidates,{parks:[square(s,150,1400)],inPark:true}).sites.length,0,'a park beyond parkMoveM is out of reach');
  const tower={outer:square(s,30).outer,height:180},{sites}=selectRideSites(candidates,{buildings:[tower],parks:[square(s,200,450)],inPark:true});
  assert.equal(sites.length,1);assert.equal(rideIntersectsBuildings(sites[0],[tower]),false);
});

test('park rides stand wholly inside the park (a narrow strip is not enough) and no taller than parkMaxH',()=>{
  const candidates=new RideLayer([[127.0276,37.4979,40,240]]).candidates,s=candidates[0];
  const strip={outer:[s.x-600*s.mu,s.y-8*s.mu,s.x+600*s.mu,s.y-8*s.mu,s.x+600*s.mu,s.y+8*s.mu,s.x-600*s.mu,s.y+8*s.mu],holes:[]};
  assert.equal(selectRideSites(candidates,{parks:[strip],inPark:true}).sites.length,0,'16 m wide verge holds no ride');
  const park=square(s,250,300),{sites}=selectRideSites(candidates,{parks:[park],inPark:true});
  assert.equal(sites.length,1);
  assert.ok(rideInPark(sites[0],[park]));
  assert.ok(sites[0].height_m<=RIDE_SITE_RULES.parkMaxH,`height ${sites[0].height_m}`);
  assert.ok(sites[0].top<=1.12*Math.max(sites[0].sxy,RIDE_SITE_RULES.parkMaxH));
  // a park cut at a tile edge is two polygons: the ride may straddle the cut
  const [a,b]=[{outer:[park.outer[0],park.outer[1],s.x+300*s.mu,park.outer[3],s.x+300*s.mu,park.outer[5],park.outer[6],park.outer[7]],holes:[]},{outer:[s.x+300*s.mu,park.outer[1],park.outer[2],park.outer[3],park.outer[4],park.outer[5],s.x+300*s.mu,park.outer[7]],holes:[]}];
  const split=selectRideSites(candidates,{parks:[a,b],inPark:true}).sites;
  assert.equal(split.length,1);assert.deepEqual([split[0].x,split[0].y],[sites[0].x,sites[0].y]);
});

test('park placement does not depend on candidate order',()=>{
  const towers=Array.from({length:6},(_,i)=>[127.0276+(i%3)*.002,37.4979+Math.floor(i/3)*.002,40,160+i*10]);
  const candidates=new RideLayer(towers,{deferPlacement:true}).candidates,park=square(candidates[0],900,200);
  const a=selectRideSites(candidates,{parks:[park],inPark:true,relocate:true}).sites,b=selectRideSites([...candidates].reverse(),{parks:[park],inPark:true,relocate:true}).sites;
  assert.ok(a.length>=3,`placed ${a.length}`);
  assert.deepEqual(a.map(s=>[s.x,s.y,s.kind]),b.map(s=>[s.x,s.y,s.kind]));
  for(const s of a)assert.ok(rideInPark(s,[park]));
});

test('water is not treated as an empty park even when its buildings are absent',()=>{
  const candidates=new RideLayer([[127.0276,37.4979,40,180]]).candidates,s=candidates[0],r=800*s.mu;
  const water=[{outer:[s.x-r,s.y-r,s.x+r,s.y-r,s.x+r,s.y+r,s.x-r,s.y+r],holes:[]}];
  assert.equal(selectRideSites(candidates,{water,relocate:true}).sites.length,0);
});

test('ferris clearance includes the full rotation after different horizontal and vertical zoom scales',()=>{
  const s=withRideKind(new RideLayer([closeWheels[0]],{deferPlacement:true}).candidates[0],'ferris');
  // The wheel rotates scaled xy/z vectors, so its horizontal exaggeration also reaches vertically.
  const z=(.58*1.35+.5*2.4)*s.sz;
  assert.equal(rideIntersectsTracks(s,[{a:[s.x-2*s.mu,s.y,z],b:[s.x+2*s.mu,s.y,z],radius:0}]),true);
});

test('a settled neighbourhood lets go of the tiles it read (riding across the city kept every one, 2026-10-15)',async()=>{
  const {CoasterRidePlacement}=await import('../web/modes/coaster/ride_placement.mjs');
  const s={lon:127.0,lat:37.55,height_m:200,R:20,r:20,mastR:3,top:200,mu:1/(40075016.685578488*Math.cos(37.55*Math.PI/180))};
  s.x=s.lon/360+.5;s.y=.5-Math.log(Math.tan(Math.PI/4+s.lat*Math.PI/360))/(2*Math.PI);
  let reads=0;const p=new CoasterRidePlacement([s],{readTile:async()=>{reads++;return {buildings:[],parks:[],water:[]}},getTracks:()=>[]});
  await p.update([0,0,1,1]);
  assert.equal(p.groups[0].state,'ready');assert.ok(reads>0);
  assert.equal(p.tiles.size,0,'받아 둔 타일을 버린다');
  assert.equal(p.groups[0].buildings,undefined,'동네도 건물 자료를 안 든다');
});
