// Placement is a world-space decision, independent of camera, visible-instance order and animation.
import { pointInPolygon, edgeDistance, bbox } from '../../city/geom.mjs';
export const RIDE_SITE_RULES=Object.freeze({gapM:24,sameKindM:{ferris:600,drop:380,swing:350,saucer:350},compactSameKindM:140,moveM:500,clearanceM:6,buildingRoofM:12});

export function withRideKind(site,kind){
  const H=site.height_m,D=site.wheelD??Math.min(Math.max(Math.min(.85*H,2.8*site.R),90),170);
  return {...site,kind,sxy:kind==='ferris'?D:site.r,sz:kind==='ferris'?D:H,
    top:kind==='ferris'?1.12*D:kind==='drop'?1.08*H:H,
    wide:kind==='ferris'?.57*D:Math.max(1.2*site.r,2.6*site.mastR),
    period:kind==='ferris'?75:kind==='swing'?40:kind==='saucer'?90:20};
}

// Union of swept vertical cylinders, covering every pose and the maximum zoom exaggeration.
// The narrow mast can stand beside a low roof while a high canopy passes safely above it.
export function rideVolumes(s){
  const eh=Math.min(s.lotte?1:2.4,s.maxExagH??2.4),ev=Math.min(s.lotte?1:1.35,s.maxExagV??1.35),H=s.height_m,base=s.base_m||0;
  // The GPU turns scaled wheel vectors: at distant zooms the wider horizontal scale
  // reaches above and below the hub too. Include the gondola footboards at the bottom.
  if(s.kind==='ferris')return [{radius:s.wide*eh,low:base+Math.min(-.045*ev,.46*ev-.51*eh)*s.sz,
    high:base+Math.max(s.top*ev,(.58*ev+.54*eh)*s.sz)}];
  const v=[{radius:2.6*s.mastR*eh,low:0,high:.025*H*ev},
    {radius:(s.kind==='drop'?1.9:1.25)*s.mastR*eh,low:0,high:s.top*ev}];
  v.push({radius:1.2*s.r*eh,low:(s.kind==='drop'?.115:s.kind==='swing'?.59:.79)*H,high:(s.kind==='drop'?.9:1)*H*ev});
  return v.map(v=>({...v,low:v.low+base,high:v.high+base}));
}

export const rideRadius=s=>s.wide*Math.min(s.lotte?1:2.4,s.maxExagH??2.4);
export function ridePairClearance(a,b){
  const physical=rideRadius(a)+rideRadius(b)+RIDE_SITE_RULES.gapM;
  if(a.kind!==b.kind)return physical;
  const same=(a.compact||b.compact)&&['swing','saucer'].includes(a.kind)?RIDE_SITE_RULES.compactSameKindM:RIDE_SITE_RULES.sameKindM[a.kind];
  return Math.max(physical,same);
}

export function rideIntersectsBuildings(s,buildings){
  const volumes=rideVolumes(s);
  for(const b of buildings){
    const box=b.box||bbox(b.outer);
    for(const v of volumes){
      if(b.height+RIDE_SITE_RULES.buildingRoofM<=v.low||(b.base||0)>=v.high)continue;
      const r=(v.radius+RIDE_SITE_RULES.clearanceM)*s.mu;
      if(s.x<box[0]-r||s.x>box[2]+r||s.y<box[1]-r||s.y>box[3]+r)continue;
      if(pointInPolygon(s.x,s.y,b.outer,b.holes)||edgeDistance(s.x,s.y,[b.outer,...(b.holes||[])])<=r)return true;
    }
  }
  return false;
}

export function rideIntersectsTracks(s,tracks){
  const volumes=rideVolumes(s);
  for(const t of tracks)for(const v of volumes){
    const pad=(t.radius||0)+RIDE_SITE_RULES.clearanceM,lo=v.low-pad,hi=v.high+pad,dz=t.b[2]-t.a[2];
    let from=0,to=1;
    if(Math.abs(dz)<1e-9){if(t.a[2]<lo||t.a[2]>hi)continue}
    else{const u=(lo-t.a[2])/dz,w=(hi-t.a[2])/dz;from=Math.max(0,Math.min(u,w));to=Math.min(1,Math.max(u,w));if(from>to)continue}
    const dx=t.b[0]-t.a[0],dy=t.b[1]-t.a[1],l2=dx*dx+dy*dy;
    const u=Math.max(from,Math.min(to,l2?((s.x-t.a[0])*dx+(s.y-t.a[1])*dy)/l2:from));
    if(Math.hypot(t.a[0]+u*dx-s.x,t.a[1]+u*dy-s.y)<=(v.radius+pad)*s.mu)return true;
  }
  return false;
}

// Index once per neighbourhood: hundreds of deterministic trial positions should only inspect
// nearby footprints/segments, rather than scanning every building in a vector tile at each trial.
function obstacleIndex(items,boxOf){
  const cell=128/(40075016.685578488*Math.cos(37.5*Math.PI/180)),bins=new Map();
  for(const item of items){const b=boxOf(item);for(let x=Math.floor(b[0]/cell);x<=Math.floor(b[2]/cell);x++)for(let y=Math.floor(b[1]/cell);y<=Math.floor(b[3]/cell);y++){
    const k=x+','+y;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(item);
  }}
  return (s,r)=>{const seen=new Set(),d=r*s.mu;
    for(let x=Math.floor((s.x-d)/cell);x<=Math.floor((s.x+d)/cell);x++)for(let y=Math.floor((s.y-d)/cell);y<=Math.floor((s.y+d)/cell);y++)for(const b of bins.get(x+','+y)||[])seen.add(b);
    return [...seen];
  };
}
const polygonBox=b=>b.box||bbox(b.outer);
function circleHits(s,b,r){
  const box=polygonBox(b),d=r*s.mu;
  return !(s.x<box[0]-d||s.x>box[2]+d||s.y<box[1]-d||s.y>box[3]+d)&&
    (pointInPolygon(s.x,s.y,b.outer,b.holes)||edgeDistance(s.x,s.y,[b.outer,...(b.holes||[])])<=d);
}
function trialPositions(source,parks){
  const positions=[{x:source.x,y:source.y,d:0,score:-Infinity}],angle=source.yaw||0;
  for(let d=50;d<=RIDE_SITE_RULES.moveM;d+=50){const n=Math.ceil(2*Math.PI*d/55);
    for(let i=0;i<n;i++){
      const t=angle+i/n*Math.PI*2,p={x:source.x+Math.cos(t)*d*source.mu,y:source.y+Math.sin(t)*d*source.mu,d,mu:source.mu};
      p.score=d-(parks(p,0).some(b=>pointInPolygon(p.x,p.y,b.outer,b.holes))?180:0);positions.push(p);
    }
  }
  return positions.sort((a,b)=>a.score-b.score||a.d-b.d||a.x-b.x||a.y-b.y);
}
function atPosition(source,p){
  const lon=(p.x-.5)*360,lat=Math.atan(Math.sinh(Math.PI*(1-2*p.y)))*180/Math.PI;
  return {...source,x:p.x,y:p.y,lon,lat,mu:1/(40075016.685578488*Math.cos(lat*Math.PI/180)),
    sourceLon:source.lon,sourceLat:source.lat,sourceKind:source.kind,move_m:p.d,base_m:0};
}

export function selectRideSites(candidates,{blocked=()=>false,buildings=[],tracks=[],parks=[],water=[],relocate=false}={}){
  const sites=[],omitted=[];
  const nearbyBuildings=obstacleIndex(buildings,polygonBox),nearbyWater=obstacleIndex(water,polygonBox),nearbyParks=obstacleIndex(parks,polygonBox);
  const mu=1/(40075016.685578488*Math.cos(37.5*Math.PI/180));
  const nearbyTracks=obstacleIndex(tracks,t=>{const r=(t.radius||0)*mu;return [Math.min(t.a[0],t.b[0])-r,Math.min(t.a[1],t.b[1])-r,Math.max(t.a[0],t.b[0])+r,Math.max(t.a[1],t.b[1])+r]});
  const ordered=[...candidates].sort((a,b)=>Number(b.lotte)-Number(a.lotte)||b.height_m-a.height_m||a.lon-b.lon||a.lat-b.lat);
  for(const source of ordered){
    const smallKinds=[...(source.kind==='ferris'?['ferris']:[]),...(source.q%2?['saucer','swing']:['swing','saucer'])];
    const stages=relocate?[{kinds:[source.kind]},
      {kinds:smallKinds,size:1},{kinds:smallKinds.filter(k=>k!=='ferris'),size:2},
      {kinds:smallKinds,size:1,air:true},{kinds:smallKinds.filter(k=>k!=='ferris'),size:2,air:true}]:
      [{kinds:source.lotte?['drop']:[source.kind,...['ferris','swing','saucer','drop'].filter(k=>k!==source.kind)]}];
    const positions=relocate?trialPositions(source,nearbyParks):[{x:source.x,y:source.y,d:0}];
    let chosen=null;
    search:for(const stage of stages)for(const kind of stage.kinds)for(const p of positions){
      let s=atPosition(source,p);
      if(stage.size)s={...s,compact:true,lotte:false,height_m:stage.size===1?85:62,r:stage.size===1?16:11,mastR:stage.size===1?2.3:1.8,
        wheelD:70,maxExagH:1.6,maxExagV:1.15,collar:20,pole:22};
      s=withRideKind(s,kind);const radius=rideRadius(s)+RIDE_SITE_RULES.clearanceM;
      if(sites.some(a=>Math.hypot(s.x-a.x,s.y-a.y)/Math.max(s.mu,a.mu)<ridePairClearance(s,a)))continue;
      if(nearbyWater(s,radius).some(b=>circleHits(s,b,radius)))continue;
      const bs=nearbyBuildings(s,radius);
      if(stage.air){
        const roof=Math.max(0,...bs.filter(b=>circleHits(s,b,radius)).map(b=>b.height));
        if(roof>60)continue; // Low-rise blocks only; never lift above a tall building to force a fit.
        s.base_m=Math.ceil((roof+RIDE_SITE_RULES.buildingRoofM+12)/5)*5;
      }
      if(rideIntersectsBuildings(s,bs)||rideIntersectsTracks(s,nearbyTracks(s,radius))||blocked(s))continue;
      chosen=s;sites.push(s);break search;
    }
    if(!chosen)omitted.push(source);
  }
  return {sites,omitted};
}
