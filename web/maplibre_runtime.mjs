import * as maplibregl from './vendor/maplibre-gl.mjs';
import {key,normStatus,createRouter,NEW_NAMES} from './lib/routing.mjs';
import {seoulSun,sunPosition as sunAt} from './lib/sun.mjs';
import {initJourney} from './lib/journey-ui.mjs';
import {RideLayer} from './lib/park_rides.mjs';
import {NightLayer} from './lib/park_night.mjs';

const json=id=>JSON.parse(document.getElementById(id).textContent);
const stations=json('stationData').map(s=>NEW_NAMES[s.name]?{...s,name:NEW_NAMES[s.name]}:s),counts=json('lineCounts'),paths=json('linePaths');
const colors={'1호선':'#0052A4','2호선':'#00A84D','3호선':'#EF7C1C','4호선':'#00A5DE','5호선':'#996CAC','6호선':'#CD7C2F','7호선':'#747F00','8호선':'#E6186C','9호선':'#BDB092','GTX-A':'#9A6292','경강선':'#0054A6','경의중앙선':'#77C4A3','경춘선':'#178C72','공항철도':'#0090D2','김포골드라인':'#AD8605','서해선':'#8FC31F','수인분당선':'#F5A200','신림선':'#6789CA','신분당선':'#D4003B','에버라인선':'#6FB245','우이신설선':'#B7C452','의정부선':'#FDA600','인천1호선':'#7CA8D5','인천2호선':'#ED8B00'};
const HOME={center:[126.98,37.53],zoom:10},LINE_GAP=5;
const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const router=createRouter({stations,paths}),{byId,stationByLine,route,learnDirections}=router;
const sunPosition=(date=window.__sunTime||new Date())=>sunAt(date);   // __sunTime: preview another time of day
const esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const merc=s=>(s.m??=maplibregl.MercatorCoordinate.fromLngLat([s.lon,s.lat]));

// Shared track: every line on an edge gets a stable slot. Geometry is always emitted
// lower id → higher id so line-offset (which is relative to drawing direction) puts
// each line on the same side no matter which way its GTFS path runs.
const edgeLines=new Map();
Object.entries(paths).forEach(([line,chunks])=>chunks.forEach(ids=>ids.slice(1).forEach((b,i)=>{const k=edgeKey(ids[i],b);if(!edgeLines.has(k))edgeLines.set(k,new Set());edgeLines.get(k).add(line)})));
const edgeOffset=(line,a,b)=>{const shared=[...(edgeLines.get(edgeKey(a,b))||[line])].sort((x,y)=>x.localeCompare(y,'ko'));return (shared.indexOf(line)-(shared.length-1)/2)*LINE_GAP};
// Real track geometry (OSM, built by build_track_shapes.py), keyed line:lo:hi and drawn lo→hi.
// Edges without a shape fall back to a straight station-to-station segment.
// Stops are each station projected onto that line's track, so a transfer station has one on-track point per line.
let shapes={},stops={},stopDirs={},stopHalf={},platformHalf={},stopWidth={};   // stopDirs: platform direction (east, north) per line:stop, along its street
const stopPos=(line,s)=>stops[`${line}:${s.id}`]||[s.lon,s.lat];
const stopMerc=new Map(),mercStop=(line,s)=>{const k=`${line}:${s.id}`;let m=stopMerc.get(k);if(!m){m=maplibregl.MercatorCoordinate.fromLngLat(stopPos(line,s));stopMerc.set(k,m)}return m};
// OSM track polylines are simplified to a few metres, which reads as kinks when zoomed in;
// round them with Chaikin corner-cutting (endpoints stay put so edges still meet at the stop).
function chaikin(pts,rounds=3){
  for(let r=0;r<rounds&&pts.length>2;r++){
    const out=[pts[0]];
    for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];
      if(i>0)out.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25]);
      if(i<pts.length-2)out.push([a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}
    out.push(pts[pts.length-1]);pts=out;
  }
  return pts;
}
const smoothCache=new Map();
const edgeCoords=(line,lo,hi)=>{const k=`${line}:${lo}:${hi}`;if(!shapes[k])return [stopPos(line,byId.get(lo)),stopPos(line,byId.get(hi))];let c=smoothCache.get(k);if(!c){c=chaikin(shapes[k]);smoothCache.set(k,c)}return c};
// Where a station's label sits: its point on the selected line, else the middle of its per-line points.
function labelPos(s){if(selected!=='all'&&s.lines.some(x=>x.name===selected))return stopPos(selected,s);const p=s.lines.map(x=>stopPos(x.name,s));return [p.reduce((a,c)=>a+c[0],0)/p.length,p.reduce((a,c)=>a+c[1],0)/p.length]}
function buildLineFeatures(){
  const features=[],drawn=new Set();
  Object.entries(paths).forEach(([line,chunks])=>chunks.forEach(ids=>ids.slice(1).forEach((b,i)=>{
    const lo=Math.min(ids[i],b),hi=Math.max(ids[i],b),id=`${line}:${lo}:${hi}`;
    if(drawn.has(id)||!byId.has(lo)||!byId.has(hi))return;drawn.add(id);
    const coords=coaster?coasterPath(line,lo,hi).pts.map(q=>new maplibregl.MercatorCoordinate(q.x,q.y).toLngLat().toArray()):edgeCoords(line,lo,hi);   // on the 롤러코스터: its own path
    features.push({type:'Feature',properties:{line,color:colors[line],offset:edgeOffset(line,lo,hi)},geometry:{type:'LineString',coordinates:coords}});
  })));
  return features;
}
const edgeGeom=new Map();
// The track between two stations: the real one, or on the 롤러코스터 its own wandering path (coasterPath).
function geom(line,a,b){return coaster?coasterPath(line,a,b):realGeom(line,a,b)}
const withCum=pts=>{const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));return {pts,cum,total:cum[cum.length-1]}};
function realGeom(line,a,b){
  const lo=Math.min(a,b),hi=Math.max(a,b),id=`${line}:${lo}:${hi}`;
  let g=edgeGeom.get(id);if(g)return g;
  g=withCum(edgeCoords(line,lo,hi).map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)));edgeGeom.set(id,g);return g;
}
// 롤러코스터: the trains only keep their times, so between the stations the track goes its own way — on the real
// track through the platforms (COASTER_FLAT), then pushed off it sideways (across the line between the stations),
// eased in over 250 m: a wide bend (a cubic bump to either side, up to 35 % of the way between the stations or 400 m)
// and a sway of one to three waves on it (one per ≥ 450 m: shorter, sampled coarsely zoomed out, it zigzagged). Each edge its own, the same every time (hash of the line and its stations).
// (Bending onto a curve of its own instead kinked where it left the real track.)
function coasterPath(line,a,b){
  const lo=Math.min(a,b),hi=Math.max(a,b),id=`c:${line}:${lo}:${hi}`;
  let g=edgeGeom.get(id);if(g)return g;
  const T=towerCourse(line,lo,hi);if(T){g=towerPath(T,realGeom(line,lo,hi));edgeGeom.set(id,g);return g}
  const g0=realGeom(line,lo,hi),A=g0.pts[0],B=g0.pts[g0.pts.length-1],mu=A.meterInMercatorCoordinateUnits(),cx=B.x-A.x,cy=B.y-A.y,L=Math.hypot(cx,cy);
  if(L<200*mu)return g0;
  let ls=0;for(const ch of line)ls=Math.imul(ls,31)+ch.charCodeAt(0)|0;const r=i=>hash(lo^ls,hi,100+i);
  const ux=cx/L,uy=cy/L,nx=-uy,ny=ux,amp=Math.min(.35*L,400*mu)*(r(0)<.25?.2:.5+.5*r(1));   // a quarter of them nearly straight
  const o1=(r(2)*2-1)*amp,o2=(r(3)<.5?-1:1)*(.3+.7*r(4))*amp*(r(5)<.5?1:-Math.sign(o1)||1),sway=Math.min(.1*L,90*mu)*r(6),waves=Math.max(1,Math.min(1+(r(7)*3|0),Math.floor(L/mu/450))),ph=r(8)*6.283;
  let i=1;const real=s=>{while(i<g0.pts.length-1&&g0.cum[i]<s)i++;const P=g0.pts[i-1],Q=g0.pts[i],u=Math.max(0,Math.min(1,(s-g0.cum[i-1])/((g0.cum[i]-g0.cum[i-1])||1)));return [P.x+(Q.x-P.x)*u,P.y+(Q.y-P.y)*u]};
  const n=Math.max(32,Math.ceil((g0.total+2*amp)/(6*mu))),pts=[];   // s only grows: real() walks on from where it was
  for(let i=0;i<=n;i++){const u=i/n,s=u*g0.total,e=smooth(Math.max(0,Math.min(1,(Math.min(s,g0.total-s)/mu-COASTER_FLAT)/250)));
    const [rx,ry]=real(s),v=1-u,off=e*(3*v*v*u*o1+3*v*u*u*o2+sway*Math.sin(2*Math.PI*waves*u+ph)*Math.sin(Math.PI*u));
    pts.push({x:rx+nx*off,y:ry+ny*off})}
  followCorridor(line,lo,hi,g0,pts,mu);
  for(const q of pts)q.meterInMercatorCoordinateUnits=()=>mu;   // as the MercatorCoordinates of the real track
  g=withCum(pts);edgeGeom.set(id,g);return g;
}
// Lines side by side (2호선 and 공항철도 by 홍대) each wandered its own way and braided across each other. Where an edge runs
// along another line's track (within 2·CORR_NEAR, heading the same way or back), it takes that line's sideways shift
// there — all of it within CORR_NEAR, blended back to its own by 2·CORR_NEAR — so the two keep their real spacing. The
// line first by name leads (its own path may follow one before it); the tower course leads nothing.
const CORR_NEAR=70;let corrGrid=null,corrRanks=null;
const corrRank=()=>corrRanks??=new Map(Object.keys(paths).sort((a,b)=>a.localeCompare(b,'ko')).map((l,i)=>[l,i]));   // the lines in name order (localeCompare per sample took 0.3 s)
function corridors(){
  if(corrGrid)return corrGrid;corrGrid={cells:new Map(),size:0};const seen=new Set();
  for(const [line,chunks] of Object.entries(paths))for(const ids of chunks)for(let i=1;i<ids.length;i++){
    const lo=Math.min(ids[i-1],ids[i]),hi=Math.max(ids[i-1],ids[i]),k=`${line}:${lo}:${hi}`;if(seen.has(k)||!byId.has(lo)||!byId.has(hi)||towerCourse(line,lo,hi))continue;seen.add(k);
    const g=realGeom(line,lo,hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),cell=corrGrid.size||=2*CORR_NEAR*mu;let j=1;
    for(let s=0;s<=g.total;s+=20*mu){while(j<g.pts.length-1&&g.cum[j]<s)j++;const A=g.pts[j-1],B=g.pts[j],l=Math.hypot(B.x-A.x,B.y-A.y)||1,u=Math.max(0,Math.min(1,(s-g.cum[j-1])/((g.cum[j]-g.cum[j-1])||1)));
      const e={line,lo,hi,s,x:A.x+(B.x-A.x)*u,y:A.y+(B.y-A.y)*u,fx:(B.x-A.x)/l,fy:(B.y-A.y)/l},c=Math.floor(e.x/cell)+','+Math.floor(e.y/cell);
      if(!corrGrid.cells.has(c))corrGrid.cells.set(c,[]);corrGrid.cells.get(c).push(e)}}
  return corrGrid;
}
function followCorridor(line,lo,hi,g0,pts,mu){
  const {cells,size}=corridors(),n=pts.length-1,rank=corrRank(),me=rank.get(line),first=l=>rank.get(l)<me,ST=4,votes=new Map();let j=1;
  const X=new Float64Array(n+1),Y=new Float64Array(n+1),FX=new Float64Array(n+1),FY=new Float64Array(n+1);
  for(let i=0;i<=n;i++){const s=g0.total*i/n;while(j<g0.pts.length-1&&g0.cum[j]<s)j++;const A=g0.pts[j-1],B=g0.pts[j],l=Math.hypot(B.x-A.x,B.y-A.y)||1,u=Math.max(0,Math.min(1,(s-g0.cum[j-1])/((g0.cum[j]-g0.cum[j-1])||1)));
    X[i]=A.x+(B.x-A.x)*u;Y[i]=A.y+(B.y-A.y)*u;FX[i]=(B.x-A.x)/l;FY[i]=(B.y-A.y)/l}
  // the nearest sample of each line before it, heading the same way or back, within 2·CORR_NEAR (every ST-th point)
  // each line before it with a sample heading the same way or back within 2·CORR_NEAR: a vote (every 2·ST-th point); no
  // allocation per lookup (a Map each made it slow)
  const cellsAt=i=>{const cx=Math.floor(X[i]/size),cy=Math.floor(Y[i]/size),out=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const c=cells.get((cx+dx)+','+(cy+dy));if(c)out.push(c)}return out};
  const R2=(2*CORR_NEAR*mu)**2,seen=new Set();
  for(let i=0;i<=n;i+=2*ST){seen.clear();for(const c of cellsAt(i))for(const e of c){if(seen.has(e.line)||!first(e.line)||Math.abs(e.fx*FX[i]+e.fy*FY[i])<.85)continue;const dx=e.x-X[i],dy=e.y-Y[i];if(dx*dx+dy*dy<R2)seen.add(e.line)}
    for(const l of seen)votes.set(l,(votes.get(l)||0)+1)}
  // the leader: the line most often near (one line for the edge: switching between two, each with its own shift, kinked)
  let lead=null,most=0;for(const [l,c] of votes)if(c>most){most=c;lead=l}if(!lead)return;
  const nearest=i=>{let best=null,bd=R2;for(const c of cellsAt(i))for(const e of c){if(e.line!==lead||Math.abs(e.fx*FX[i]+e.fy*FY[i])<.85)continue;const dx=e.x-X[i],dy=e.y-Y[i],d=dx*dx+dy*dy;if(d<bd){bd=d;best=e}}return best};
  // its shift and how close it is (w), every ST-th point, in between linearly; blended in by w, rounded over ±50 m
  const K=[];for(let i=0;i<=n;i+=ST)K.push(i);if(K[K.length-1]!==n)K.push(n);
  const LX=new Float64Array(K.length),LY=new Float64Array(K.length),LW=new Float64Array(K.length);
  K.forEach((i,q)=>{const best=nearest(i);if(!best)return;const x=X[i],y=Y[i];
    // the foot on the leader's track (along its heading from the nearest sample: snapping to the 20 m samples stepped)
    const R=realGeom(best.line,best.lo,best.hi),t=(x-best.x)*best.fx+(y-best.y)*best.fy,ls=Math.max(0,Math.min(R.total,best.s+t)),bx=best.x+best.fx*(ls-best.s),by=best.y+best.fy*(ls-best.s);
    const L=coasterPath(best.line,best.lo,best.hi),m=L.pts.length-1,k=ls/R.total*m,a=Math.min(m-1,Math.floor(k)),f=k-a,P=L.pts[a],Q=L.pts[a+1]||P;
    LX[q]=P.x+(Q.x-P.x)*f-bx;LY[q]=P.y+(Q.y-P.y)*f-by;LW[q]=smooth(Math.max(0,Math.min(1,2-Math.abs((x-best.x)*best.fy-(y-best.y)*best.fx)/(CORR_NEAR*mu))))});   // w: by how far off the leader's track
  const DX=new Float64Array(n+1),DY=new Float64Array(n+1);
  for(let q=0;q<K.length;q++){const i0=K[q],i1=K[Math.min(K.length-1,q+1)];for(let i=i0;i<(q===K.length-1?n+1:i1);i++){const f=i1>i0?(i-i0)/(i1-i0):0,r=Math.min(K.length-1,q+1);
    const w=LW[q]+(LW[r]-LW[q])*f,lx=LX[q]+(LX[r]-LX[q])*f,ly=LY[q]+(LY[r]-LY[q])*f,ox=pts[i].x-X[i],oy=pts[i].y-Y[i];DX[i]=ox+w*(lx-ox);DY[i]=oy+w*(ly-oy)}}
  const st=g0.total/n/mu,W=Math.max(1,Math.round(50/st));
  for(let pass=0;pass<2;pass++)for(const D of [DX,DY]){const c=D.slice(),at=i=>c[Math.max(0,Math.min(n,i))];let sum=0;for(let i=-W;i<=W;i++)sum+=at(i);for(let i=0;i<=n;i++){if(i)sum+=at(i+W)-at(i-W-1);D[i]=sum/(2*W+1)}}
  for(let i=0;i<=n;i++){const e=smooth(Math.max(0,Math.min(1,(Math.min(i,n-i)*st-COASTER_FLAT)/250)));pts[i]={x:X[i]+DX[i]*e,y:Y[i]+DY[i]*e}}   // e: off its own platforms, as coasterPath
}
// Point and heading at fraction k of the way from station `from` to station `to` along the track.
function along(line,from,to,k){
  if(from===to){const m=mercStop(line,from);return {x:m.x,y:m.y,f:[0,-1]}}
  const g=geom(line,from.id,to.id),rev=from.id>to.id,d=(rev?1-k:k)*g.total;
  let i=1;while(i<g.pts.length-1&&g.cum[i]<d)i++;
  const A=g.pts[i-1],B=g.pts[i],seg=(g.cum[i]-g.cum[i-1])||1,u=Math.max(0,Math.min(1,(d-g.cum[i-1])/seg));
  const len=Math.hypot(B.x-A.x,B.y-A.y)||1,sign=rev?-1:1;
  return {x:A.x+(B.x-A.x)*u,y:A.y+(B.y-A.y)*u,f:[sign*(B.x-A.x)/len,sign*(B.y-A.y)/len]};
}
// Stations are drawn as platform-length pills laid along the track (≈180 m), like Kakao Map:
// a dot when zoomed out, a platform when zoomed in, so a stopped train visibly sits "in" it.
const PLATFORM_HALF=90;
function metresBetween(a,b){return Math.hypot((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1])*111320}
// First `dist` metres of the track from station s toward neighbour n, starting at s.
function trackFrom(line,s,n,dist){
  const c=edgeCoords(line,Math.min(s.id,n.id),Math.max(s.id,n.id)),pts=s.id<n.id?c:[...c].reverse(),out=[pts[0]];
  let left=dist;
  for(let i=1;i<pts.length&&left>0;i++){const d=metresBetween(pts[i-1],pts[i]);if(d>=left){const u=left/d;out.push([pts[i-1][0]+(pts[i][0]-pts[i-1][0])*u,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*u]);left=0}else{out.push(pts[i]);left-=d}}
  return out;
}
function neighbours(line,s){for(const ids of paths[line]||[]){const i=ids.indexOf(s.id);if(i>=0)return {prev:byId.get(ids[i-1]),next:byId.get(ids[i+1])}}return {}}
const STATION_WIDTH_STOPS=[[8,6],[12,11],[14,16],[16,24],[18,28]];   // [zoom, outline width px]
const stationWidthPx=z=>{const S=STATION_WIDTH_STOPS;if(z<=S[0][0])return S[0][1];for(let i=1;i<S.length;i++)if(z<=S[i][0]){const [z0,w0]=S[i-1],[z1,w1]=S[i];return w0+(w1-w0)*(z-z0)/(z1-z0)}return S[S.length-1][1]};
const stationRects=new Map(),PLATFORM_SCALE=.3;   // platform bars: a third of the old outline width (names sit beside them now)
const platformPx=(r,base)=>{if(!r.widthM)return base;const lat=r.coords[0][1]*Math.PI/180,mpp=40075016.686*Math.cos(lat)/(512*2**map.getZoom());return Math.max(base,Math.min(base*2,r.widthM/mpp))};
function buildStationFeatures(){
  return stations.flatMap(s=>s.lines.map(x=>{
    const line=x.name,{prev,next}=neighbours(line,s);
    const back=prev?trackFrom(line,s,prev,PLATFORM_HALF).reverse():[stopPos(line,s)],ahead=next?trackFrom(line,s,next,PLATFORM_HALF):[stopPos(line,s)];
    // A straight platform laid on the straight line that best fits the track through the station
    // (least squares), so the track runs through its middle. Where the track bends inside the
    // platform length, the rectangle is shortened (down to 60 m) until the track stays within
    // 6 m of its centre line — a clean rectangle on the straight part instead of a bent copy.
    const c=stopPos(line,s),kx=Math.cos(c[1]*Math.PI/180),M=111320;
    const fit=half=>{
      const bk=prev?trackFrom(line,s,prev,half).reverse():[c],ah=next?trackFrom(line,s,next,half):[c],raw=[...bk,...ah.slice(1)],pts=[];
      for(let i=0;i<raw.length;i++){pts.push(raw[i]);if(i<raw.length-1){const a=raw[i],b=raw[i+1],n=Math.ceil(metresBetween(a,b)/5);for(let k=1;k<n;k++)pts.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n])}}
      const xy=pts.map(p=>[(p[0]-c[0])*kx*M,(p[1]-c[1])*M]),mx=xy.reduce((t,p)=>t+p[0],0)/xy.length,my=xy.reduce((t,p)=>t+p[1],0)/xy.length;
      let sxx=0,syy=0,sxy=0;for(const [x,y] of xy){sxx+=(x-mx)**2;syy+=(y-my)**2;sxy+=(x-mx)*(y-my)}
      const th=.5*Math.atan2(2*sxy,sxx-syy);let dx=Math.cos(th),dy=Math.sin(th);
      if(xy.length<2||!isFinite(th)){dx=1;dy=0}
      const e0=xy[0],e1=xy[xy.length-1];if(((e1[0]-e0[0])*dx+(e1[1]-e0[1])*dy)<0){dx=-dx;dy=-dy}   // keep prev→next orientation
      const dev=Math.max(0,...xy.map(([x,y])=>Math.abs(-(x-mx)*dy+(y-my)*dx)));
      const t0=-mx*dx-my*dy;return {dx,dy,cx:mx+dx*t0,cy:my+dy*t0,dev};   // centre: the stop's foot on the fitted line
    };
    let h=stopHalf[`${line}:${s.id}`]||PLATFORM_HALF,f;   // half length from the exits' spread, when known
    const sd=stopDirs[`${line}:${s.id}`];
    if(sd){   // built along the station's street; the route line is threaded to its two ends
      let [ex,ey]=sd;const t=next||prev;
      if(t){const tx=(t.lon-c[0])*kx*M,ty=(t.lat-c[1])*M,sg=next?1:-1;if((ex*tx+ey*ty)*sg<0){ex=-ex;ey=-ey}}
      f={dx:ex,dy:ey,cx:0,cy:0};
    }else{f=fit(h);while(f.dev>6&&h>30){h-=10;f=fit(h)}}
    const {dx,dy,cx:cxm,cy:cym}=f;
    const toLL=(x,y)=>[c[0]+x/(kx*M),c[1]+y/M],coords=[toLL(cxm-dx*h,cym-dy*h),toLL(cxm+dx*h,cym+dy*h)];
    // The pill runs prev→next; put it on the same parallel track as the adjoining route line.
    const ref=next?[s,next]:prev?[prev,s]:null,offset=ref?edgeOffset(line,ref[0].id,ref[1].id)*(ref[0].id<ref[1].id?1:-1):0;
    // plat: platform share of the station length (the rest is passages out to the exits)
    const ph=platformHalf[`${line}:${s.id}`];
    stationRects.set(`${line}:${s.id}`,{coords,offset,widthM:stopWidth[`${line}:${s.id}`]||0,plat:ph?Math.min(1,ph/h):1});   // widthM: metres across, from the exits
    return {type:'Feature',properties:{id:s.id,name:s.name,line,lines:s.lines.map(y=>y.name).join('|'),color:colors[line],transfer:s.lines.length>1?1:0,offset},geometry:{type:'LineString',coordinates:coords}};
  }));
}

const shapesReady=fetch('./track_shapes.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{d=d||{};shapes=d.edges||(d.stops?{}:d);stops=d.stops||{};stopDirs=d.stopDirs||{};stopHalf=d.stopHalf||{};platformHalf=d.platformHalf||{};stopWidth=d.stopWidth||{};smoothCache.clear();edgeGeom.clear();edgeArcs.clear();rideClocks.clear();crossIdx=null;stopMerc.clear();if(Object.keys(shapes).length)document.querySelector('.provenance')?.insertAdjacentHTML('beforeend',' 선로 형태는 © OpenStreetMap contributors 자료를 사용했습니다.');plans=trains.map(planTrain).filter(Boolean)}).catch(()=>{});
// Phones (touch devices): render at most 2× device pixels and raise 3D buildings from zoom 15.
const PHONE=matchMedia('(max-width:720px),(pointer:coarse)').matches;
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)');
// Animation redraws (trains, my-location pulse) are capped: each one redraws the whole 3D map,
// and at the display's 60–120 Hz that kept phones hot. Panning and zooming still render at full rate.
// One timer for all of them; animFrame hooks update animated paint just before the redraw.
// Trains, the selected-train ripple and the my-location pulse are drawn on their own canvas over
// the map (drawTrains), at TRAIN_FPS while something there moves: a map redraw (3D buildings and
// all) is only needed when the camera moves, and following a train moves it at FOLLOW_FPS.
const TRAIN_FPS=30,FOLLOW_FPS=30,animFrame=[];let trainTimer=0,trainAt=0,drawTrains=()=>{},myLocation=null;
function trainFrameSoon(ms){const at=performance.now()+ms;if(trainTimer&&trainAt<=at)return;clearTimeout(trainTimer);trainAt=at;trainTimer=setTimeout(()=>{trainTimer=0;requestAnimationFrame(drawTrains)},ms)}let repaintTimer=0,repaintAt=0;
function repaintSoon(ms){const at=performance.now()+ms;if(repaintTimer&&repaintAt<=at)return;clearTimeout(repaintTimer);repaintAt=at;repaintTimer=setTimeout(()=>{repaintTimer=0;for(const f of animFrame)f();map.triggerRepaint()},ms)}
const map=new maplibregl.Map({container:'map',pixelRatio:Math.min(devicePixelRatio||1,PHONE?2:3),localIdeographFontFamily:'"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif',...HOME,pitch:35,bearing:0,maxZoom:18,minZoom:7,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf2f1'}}]},attributionControl:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
// My location (no station popup opens by itself; tap a station for its trains).
const geolocate=new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:false,maximumAge:10000},trackUserLocation:true,showAccuracyCircle:false,fitBoundsOptions:{maxZoom:16}});
map.addControl(geolocate,'top-right');   // under +/−; alone on phones, where +/− are hidden
let autoLocating=false;
geolocate.on('error',()=>{if(autoLocating){autoLocating=false;return}updateLiveNotice('위치를 가져오지 못했어요. 브라우저의 위치 권한을 확인해 주세요.')});
// First visit: fly to where the viewer is (inside the 수도권 only; elsewhere, or without permission,
// keep the whole-network view). Asks once for location; after that the browser remembers the answer.
const METRO_AREA=[126.3,36.8,127.9,38.3];
map.once('load',()=>{
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(pos=>{
    const {longitude:x,latitude:y}=pos.coords,[w,s,e,n]=METRO_AREA;
    if(x<w||x>e||y<s||y>n)return;
    autoLocating=true;geolocate.trigger();   // same as pressing the button: blue dot, zoom 16
  },()=>{},{enableHighAccuracy:false,timeout:8000,maximumAge:300000});
});
geolocate.on('geolocate',()=>{
  autoLocating=false;
});
let selected='all',trains=[],trainsEnabled=true,labels=[],liveRequest=0,ready=false,pendingLine=null;
const $=id=>document.getElementById(id);
const liveState=document.querySelector('#liveState span');   // the line filter panel is gone: every line is always shown

// ---- live train routing -------------------------------------------------------------
function kstMs(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4]-9,+m[5],+m[6]):NaN}
function age(v){const t=kstMs(v);return t===t?Math.max(0,(Date.now()-t)/1000):0}
// Run time between adjacent stations: the GTFS timetable's median (edge_times.json, built by
// build_edge_times.py); failing that, track length at the timetable's typical 12.4 m/s.
let edgeTimes={},lineDwell={};
// Per-line timing learned from the live feed (live-timing.json, built by build_live_timing.py):
// pace = observed ÷ timetable over several stations; zone = 도착→출발 (the feed marks a train
// entering and leaving the station section, not stopping and starting); approach = 진입→도착.
let liveTiming={lines:{},default:{pace:1,zone:62,approach:40}};
fetch('./live-timing.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(d=>{if(d&&d.lines){liveTiming=d;replacePlans(trains.map(planTrain).filter(Boolean))}}).catch(()=>{});
// weekday rush hours (KST minutes of the day; pipeline/build_live_timing.py RUSH): lines that run
// slower then have their own pace (rushPace)
const RUSH=[[420,570],[1050,1200]];
const rushNow=()=>{const k=new Date(Date.now()+9*3600e3),d=k.getUTCDay(),m=k.getUTCHours()*60+k.getUTCMinutes();return d>0&&d<6&&RUSH.some(([a,b])=>m>=a&&m<b)};
const timingFor=line=>{const tm={...liveTiming.default,...liveTiming.lines[line]};if(tm.rushPace&&rushNow())tm.pace=tm.rushPace;return tm};
fetch('./edge_times.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{edgeTimes=d.edges||{};lineDwell=d.dwell||{};plans=trains.map(planTrain).filter(Boolean)}).catch(()=>{});
function segmentSeconds(a,b,line){
  const sched=line&&edgeTimes[`${line}:${Math.min(a.id,b.id)}:${Math.max(a.id,b.id)}`];if(sched)return sched;
  const A=merc(a),B=merc(b),chord=Math.hypot(B.x-A.x,B.y-A.y),track=line?realGeom(line,a.id,b.id).total:chord,metres=Math.max(chord,track)/A.meterInMercatorCoordinateUnits();
  return Math.max(30,Math.min(180,metres/12.4));
}
// Dead reckoning: the API only reports the last event (진입/도착/출발/전역출발) and when it happened.
// Roll the train forward from that moment: approach → dwell → run → dwell … along its route,
// so a train that "arrived 90s ago" is drawn already heading to the next stop.
const EXPRESS_LINES=new Set(stations.flatMap(s=>s.express||[]));   // lines whose express stops the GTFS lists
// Station exits (OSM subway_entrance, built by pipeline/build_entrances.py): {station id: [[lon,lat,ref,wheelchair]]}
let exits={};const exitCol=new Map();   // exit "lon,lat" → the colour of the line its passage joins
const EXIT_MINZOOM=16,EXIT_MAX_M=350;   // exits (and their passages) from this zoom; farther than this from every platform: no passage
const exitsReady=fetch('./exits.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{exits=d||{}}).catch(()=>{});
function exitFeatures(){return Object.entries(exits).flatMap(([id,list])=>list.map(([lon,lat,ref,wc])=>({type:'Feature',properties:{ref,wc:wc??-1,station:+id},geometry:{type:'Point',coordinates:[lon,lat]}})))}
const smooth=x=>x*x*(3-2*x);
// Typical consist per line: [cars, metres per car]. Drawn at true length along the track.
const CONSIST={'1호선':[10,20],'2호선':[10,20],'3호선':[10,20],'4호선':[10,20],'5호선':[8,20],'6호선':[8,20],'7호선':[8,20],'8호선':[6,18],'9호선':[6,19.5],'GTX-A':[8,23.5],'경강선':[4,20],'경의중앙선':[8,20],'경춘선':[8,20],'공항철도':[6,22],'김포골드라인':[2,13],'서해선':[4,20],'수인분당선':[6,20],'신림선':[3,13],'신분당선':[6,19.5],'에버라인선':[1,12],'우이신설선':[2,13],'의정부선':[2,13],'인천1호선':[8,18],'인천2호선':[2,18]};
function planTrain(t){
  const s=stationByLine.get(`${t.line}:${key(t.station)}`);if(!s)return null;
  // Only move as far as the feed implies: the reported station may be left (after its dwell),
  // but the next station is only reached, never departed, until fresh data says so.
  // Express trains (1·9호선, whose express stops are in the GTFS) only stop at express stations and run
  // straight through the others; "the next station" for them means the next express stop.
  const expressLine=t.express&&EXPRESS_LINES.has(t.line),dest=stationByLine.get(`${t.line}:${key(t.destination)}`);
  const stops=st=>!expressLine||(st.express||[]).includes(t.line)||st===dest;
  const r=route(t,s),previous=r.previous,status=normStatus(t.status),phases=[];
  // Roll on through PREDICT_STOPS stops (dwelling at each) before waiting for data: waiting at the
  // very next stop left trains standing there while they had long left; replacePlans keeps an
  // over-prediction from jumping back.
  let upto=r.ahead.length-1;for(let j=1,n=0;j<r.ahead.length;j++)if(stops(r.ahead[j])&&++n===(coaster?99:PREDICT_STOPS)){upto=j;break}
  const ahead=r.ahead.slice(0,Math.max(1,upto)+1);
  // Stop to stop takes pace × (timetable run + 30 s dwell). The feed's 도착→출발 (the station section,
  // zone ~64 s) is not all standing: 도착 comes as the train enters the section and brakes along the
  // platform, it stands ~STAND s, and pulls out ~20 s before 출발. Standing the whole zone − 10 s had
  // trains stop early and leave late (7071 하행 면목·사가정·어린이대공원, 2026-09-30 ride). So a
  // predicted stop stands STAND and the run takes the rest; at the station of a 도착 record the train
  // brakes in over the last stretch (BRAKE s) and leaves zone − 20 s after the record. The times the
  // feed's next events are expected at are unchanged (build_live_timing.evaluate).
  const tm=timingFor(t.line),DWELL=Math.max(15,tm.zone-20),STAND=Math.min(DWELL,tm.stand||30),BRAKE=DWELL-STAND;
  // busy stations stand longer than the line (live-timing stops: 2호선 강남 83 s against 75): the difference goes on the standing
  const more=st=>(tm.stops?.[st.id]??tm.zone)-tm.zone,stand=st=>Math.max(5,STAND+more(st));
  const paced=(from,to)=>{const R=segmentSeconds(from,to,t.line);return Math.max(.5*R,tm.pace*(R+30)-STAND)};
  // ease: slow at a stop, full speed through a station the train passes
  const run=(from,to,k0=0,k1=1,dur=paced(from,to))=>{const a=k0===0&&stops(from),b=k1===1&&stops(to);
    phases.push({from,to,k0,k1,dur:dur*(a&&b?1:a||b?.9:.8),ease:a&&b?'both':a?'in':b?'out':'none'})};
  const dwell=(at,i,dur=STAND)=>{const nx=ahead[i+1];phases.push(nx?{from:at,to:nx,k0:0,k1:0,dur}:{from:previous&&i===0?previous:ahead[i-1]||at,to:at,k0:1,k1:1,dur})};
  // the reported station: 진입 → the approach (the line's 진입→도착 time) → 도착 → braking to the
  // platform (BRAKE) → standing; it leaves DWELL after 도착 as before
  const brakes=previous&&BRAKE>0&&(status==='진입'||status==='도착');
  if(status==='진입'&&previous)run(previous,s,.75,brakes?.85:1,tm.approach);
  if(status==='전역출발'&&previous)run(previous,s);
  if(brakes)phases.push({from:previous,to:s,k0:.85,k1:1,dur:BRAKE,ease:'out'});
  // a train standing at the terminus it starts from, minutes before leaving (proxy: departsAt)
  const wait=t.departsAt?(kstMs(t.departsAt)-kstMs(t.receivedAt))/1000:0;
  if(status!=='출발'&&(stops(s)||status==='도착'))dwell(s,0,Math.max((brakes?STAND:DWELL)+more(s),wait||0));
  for(let i=0;i<ahead.length-1;i++){run(ahead[i],ahead[i+1]);if(i+1<ahead.length-1&&stops(ahead[i+1]))dwell(ahead[i+1],i+1,stand(ahead[i+1]))}
  // Hold at the last station we are willing to predict (destination or MAX hops) until fresh data arrives.
  const last=ahead[ahead.length-1],before=ahead.length>1?ahead[ahead.length-2]:previous;
  phases.push(before?{from:before,to:last,k0:1,k1:1,dur:Infinity}:{from:last,to:last,k0:0,k1:0,dur:Infinity});
  // Stations the train runs through, in travel order; every phase goes from seq[i] to seq[i+1].
  // The geometry runs past where motion stops so a train held at a station keeps its full length.
  const seq=previous?[previous,...r.ahead]:[...r.ahead],cum=[0];
  for(let i=1;i<seq.length;i++)cum.push(cum[i-1]+geom(t.line,seq[i-1].id,seq[i].id).total);
  let [cars,carMetres]=CONSIST[t.line]||[8,20];
  // 2호선 branches run short trains: 성수지선 4 cars, 신정지선 6 cars (Seoul Metro)
  if(t.line==='2호선'){const where=`${t.station} ${t.destination}`;if(/신설동|용두|신답|용답|성수지선/.test(where))cars=4;else if(/까치산|신정네거리|양천구청|도림천|신도림지선/.test(where))cars=6}
  // 출발 is sent as the train leaves the station section, ~15 s into its run
  return {t,id:`${t.line}:${t.trainNo}`,phases,seq,cum,cars,carMetres,lead:status==='출발'?15:0};
}
// 롤러코스터 (settings): between stations the lines rise off the ground like a coaster track and the
// trains ride on it; its clock can run faster (×coasterSpeed): the trains then run ahead of the feed
// (warp s), a show rather than where they are. Flat at each platform, a climb, then hills of ~380 m,
// each its own height (COASTER_LOW..COASTER_H) and spacing.
let coaster=false,coasterWant=false,coasterSpeed=1,warp=0,warpAt=0;
const BULB_EVERY=18;const COL_SPAN=60,COL_AFRAME=80,COL_CLEAR=15;   // supports (CoasterTrack.columns): m between them low down, A-frames from, clear of another line's
const COASTER_H=110,COASTER_LOW=18,COASTER_FLAT=110,COASTER_RISE=160;   // m: the tallest and lowest tops; flat this far either side of a station; climb over this
const hash=(a,b,c=0)=>{let x=Math.imul(a^0x9e3779b9,0x85ebca6b)^Math.imul(b+0x6b43a9b5,0xc2b2ae35)^Math.imul(c+0x27d4eb2f,0x165667b1);x^=x>>>15;x=Math.imul(x,0x2c1b3c6d);x^=x>>>12;return (x>>>0)/4294967296};   // 0..1, the same every time
// The frame across (R) and up (U) of a track or car going along F, from the flat right r, turned by roll about F.
const rolled=(r,F,roll)=>{const d=r[0]*F[0]+r[1]*F[1];let R=[r[0]-d*F[0],r[1]-d*F[1],-d*F[2]];const l=Math.hypot(...R)||1;R=R.map(c=>c/l);
  const U=[F[1]*R[2]-F[2]*R[1],F[2]*R[0]-F[0]*R[2],F[0]*R[1]-F[1]*R[0]];if(!roll)return [R,U];const c=Math.cos(roll),s=Math.sin(roll);
  return [[c*R[0]-s*U[0],c*R[1]-s*U[1],c*R[2]-s*U[2]],[c*U[0]+s*R[0],c*U[1]+s*R[1],c*U[2]+s*R[2]]]};
const warpNow=()=>{const t=performance.now();if(warpAt)warp+=(t-warpAt)/1000*(coasterSpeed-1);warpAt=t;return warp};
// Loops and corkscrews are landmarks, not the rule (on half the edges each they all looked alike): along each line, in
// order, an edge may take one (not both) once INV_GAP m have passed since the last — a loop by chance INV_LOOP, else a
// corkscrew by INV_CORK. Chosen once per edge, the first line through it deciding; 'loop', 'cork' or ''.
const INV_GAP=2500,INV_LOOP=.3,INV_CORK=.25;
let invMap=null;
function inversion(lo,hi){
  if(!invMap){invMap=new Map();
    for(const chunks of Object.values(paths))for(const ids of chunks){let since=INV_GAP;
      for(let i=1;i<ids.length;i++){const a=Math.min(ids[i-1],ids[i]),b=Math.max(ids[i-1],ids[i]),k=a+':'+b,A=byId.get(a),B=byId.get(b);if(!A||!B)continue;
        const L=metresBetween([A.lon,A.lat],[B.lon,B.lat]);
        if(!invMap.has(k)){let pick='';if(since+L/2>=INV_GAP&&!towerEdge(a,b))pick=hash(a,b,1)<INV_LOOP?'loop':hash(a,b,3)<INV_CORK?'cork':'';invMap.set(k,pick)}
        since=invMap.get(k)?L/2:since+L}}}
  return invMap.get(lo+':'+hi)||'';
}
// A long edge (≥ LOOP_MIN) picked for it (inversion) turns a loop at its middle: over D of ground the train's ground
// point runs a prolate trochoid (on, back under itself at the top, on) while it climbs a circle of radius R,
// R = 45..100 m by edge, D = R·LOOP_DR.
const LOOP_DR=80/38,LOOP_MIN=800;   // m
const loopD=(L,lo,hi)=>{if(L<LOOP_MIN||inversion(lo,hi)!=='loop')return 0;const D=(45+55*hash(lo,hi,2))*LOOP_DR;return L>=D*4?D:0};   // m of ground, 0: none
// An edge (≥ 700 m) picked for it (inversion) turns a corkscrew (as 88열차): over D of ground (200–250 m a turn: shorter, a car spanned a
// quarter turn and looked wrung) the cars roll once or twice about their own middle (θ, eased in and out) and the rails
// wind round them (CORK_HEART: the shaders turn both about a line half a body up). Off the loop, clear of the climbs at
// either end. [start m from lo, D m, turns] or null.
const corkOf=(L,lo,hi)=>{
  if(L<700||inversion(lo,hi)!=='cork')return null;const T=hash(lo,hi,4)<.3?2:1,D=(200+50*hash(lo,hi,5))*T,end=COASTER_FLAT+COASTER_RISE,LD=loopD(L,lo,hi);
  const ok=c=>c-D/2>=end&&c+D/2<=L-end&&(!LD||Math.abs(c-L/2)>=LD/2+D/2+30);
  const want=LD?(hash(lo,hi,6)<.5?.27:.73)*L:(.35+.3*hash(lo,hi,6))*L;
  for(const c of [want,L-want,.25*L,.75*L,.5*L])if(ok(c))return [c-D/2,D,T];return null};
const CORK_HEART=.34;   // × body px: the corkscrew's axis above the rails, the cars' middle (their height is .68 body)
// roll at u (0..1) of the way through: a steady rate with 15 % ramps at either end (eased all the way, the middle turned
// twice as fast and wrung the cars there)
const corkTheta=(u,T)=>{const e=.15,f=u<e?u*u/(2*e):u>1-e?1-e-(1-u)*(1-u)/(2*e):u-e/2;return 2*Math.PI*T*f/(1-e)};
// [ground distance, height] (mercator units, lo→hi) where the track is at distance s along that line's edge
// The hills alone, m at s (mercator) along an edge of length L m: knots at irregular spacing (a top or a dip every
// ~375 m: at ~190 m the track rippled all the way), tops and dips alternating, each its own height; eased from knot to knot
function hillsAt(lo,hi,L,k){
  const d=Math.min(k,1-k)*L,env=smooth(Math.max(0,Math.min(1,(d-COASTER_FLAT)/COASTER_RISE)));if(!env)return 0;
  const n=Math.max(1,Math.round(L/750)),m=2*n+1,x=k*m,j=Math.min(m-1,Math.floor(x));
  const knot=i=>{if(i<=0||i>=m)return i<=0?0:1;return (i+(hash(lo,hi,10+i)-.5)*.6)/m},hk=i=>{const r=hash(lo,hi,40+i);
    return i%2?COASTER_LOW+(COASTER_H-COASTER_LOW)*r*r*.35:COASTER_LOW+(COASTER_H-COASTER_LOW)*(.25+.75*r)};   // odd: dips, low; even: tops, any height
  let a=j;while(a>0&&knot(a)>k)a--;while(a<m-1&&knot(a+1)<=k)a++;const u=(k-knot(a))/((knot(a+1)-knot(a))||1);
  return env*(hk(a)+(hk(a+1)-hk(a))*smooth(Math.max(0,Math.min(1,u))));
}
// Tower courses: on an edge running by a very tall building the track leaves the platform, swings round onto a ring
// about the tower and climbs it turn after turn to near its top, then comes off the ring and drops the long way down
// to the far station. Chosen by hand (the station has to leave room); lo → hi is the way up.
const TOWER_COURSES=[{line:'8호선',lo:24,hi:465,at:[127.102659,37.512537],tower:68,R:150,turns:5,top:440,off:800}];   // 잠실 → 석촌, 롯데월드타워 (555 m)
const towerCourse=(line,lo,hi)=>TOWER_COURSES.find(c=>c.line===line&&c.lo===lo&&c.hi===hi);
const towerEdge=(lo,hi)=>TOWER_COURSES.some(c=>c.lo===lo&&c.hi===hi);   // no loop or corkscrew there
// Its ground path: the real track through the platform; then steered (turning at most 1/35 m) onto the ring of radius R
// round the tower, the way the track already passes it; `turns` and a bit round it, leaving where the ring heads best
// for the point `off` m along the real track; a cubic from there onto the real track, and on to the far station.
// spiral: {a, r0, r1, b} in mercator along it — off the platform, on and off the ring, back on the real track.
function towerPath(C,g0){
  const mu=g0.pts[0].meterInMercatorCoordinateUnits(),T=maplibregl.MercatorCoordinate.fromLngLat(C.at),R=C.R*mu,ds=2*mu;
  const at=s=>{let i=1;while(i<g0.pts.length-1&&g0.cum[i]<s)i++;const P=g0.pts[i-1],Q=g0.pts[i],l=(g0.cum[i]-g0.cum[i-1])||1,u=Math.max(0,Math.min(1,(s-g0.cum[i-1])/l));return {x:P.x+(Q.x-P.x)*u,y:P.y+(Q.y-P.y)*u,fx:(Q.x-P.x)/l,fy:(Q.y-P.y)/l,i}};
  const sA=(COASTER_FLAT+10)*mu,sB=Math.min(C.off*mu,g0.total-(COASTER_FLAT+300)*mu),A=at(sA),B=at(sB),pts=[];
  for(let i=0;i<A.i;i++)pts.push({x:g0.pts[i].x,y:g0.pts[i].y});pts.push({x:A.x,y:A.y});
  const sg=Math.sign((A.x-T.x)*A.fy-(A.y-T.y)*A.fx)||1;   // the way round it the track already goes
  let x=A.x,y=A.y,hd=Math.atan2(A.fy,A.fx);const turn=ds/(35*mu);
  for(let k=0;k<3000;k++){const ex=x-T.x,ey=y-T.y,r=Math.hypot(ex,ey),e=[ex/r,ey/r],tau=[-sg*e[1],sg*e[0]],w=2*(R-r)/R;
    const want=Math.atan2(tau[1]+w*e[1],tau[0]+w*e[0]);let d=want-hd;d=Math.atan2(Math.sin(d),Math.cos(d));
    if(Math.abs(r-R)<.5*mu&&Math.abs(Math.atan2(Math.sin(Math.atan2(tau[1],tau[0])-hd),Math.cos(Math.atan2(tau[1],tau[0])-hd)))<.03)break;
    hd+=Math.max(-turn,Math.min(turn,d));x+=Math.cos(hd)*ds;y+=Math.sin(hd)*ds;pts.push({x,y})}
  const r0=pts.length-1;let f0=Math.atan2(y-T.y,x-T.x);
  // leave where the ring's heading points best at B
  let fx=f0,best=-2;for(let k=0;k<360;k++){const f=f0+sg*k/360*2*Math.PI,P=[T.x+R*Math.cos(f),T.y+R*Math.sin(f)],t=[-sg*Math.sin(f),sg*Math.cos(f)],v=[B.x-P[0],B.y-P[1]],l=Math.hypot(...v);const sc=(t[0]*v[0]+t[1]*v[1])/l;if(sc>best){best=sc;fx=f}}
  const sweep=2*Math.PI*C.turns+Math.abs(fx-f0),m=Math.ceil(sweep*R/ds);
  for(let k=1;k<=m;k++){const f=f0+sg*sweep*k/m;pts.push({x:T.x+R*Math.cos(f),y:T.y+R*Math.sin(f)})}
  const r1=pts.length-1,P=pts[r1],tx=-sg*Math.sin(f0+sg*sweep),ty=sg*Math.cos(f0+sg*sweep),D=Math.hypot(B.x-P.x,B.y-P.y),hl=.4*D,nb=Math.ceil(1.6*D/ds);
  const c1=[P.x+tx*hl,P.y+ty*hl],c2=[B.x-B.fx*hl,B.y-B.fy*hl];
  for(let k=1;k<=nb;k++){const u=k/nb,v=1-u;pts.push({x:v*v*v*P.x+3*v*v*u*c1[0]+3*v*u*u*c2[0]+u*u*u*B.x,y:v*v*v*P.y+3*v*v*u*c1[1]+3*v*u*u*c2[1]+u*u*u*B.y})}
  const b=pts.length-1;for(let i=B.i;i<g0.pts.length;i++)pts.push({x:g0.pts[i].x,y:g0.pts[i].y});
  for(const q of pts)q.meterInMercatorCoordinateUnits=()=>mu;
  const g=withCum(pts),aI=A.i;g.spiral={a:g.cum[aI],r0:g.cum[r0],r1:g.cum[r1],b:g.cum[b],T,tower:C.tower,top:C.top};return g;
}
// Building heights along the lines (pipeline/build_coaster_buildings.py: a sparse 20 m grid in web mercator), loaded
// when the 롤러코스터 first turns on; the courses wait for it, so they never change under a running train.
let coasterBld=null,coasterBldLoad=null;
function loadCoasterBuildings(){
  return coasterBldLoad??=Promise.all([fetch('./coaster_buildings.bin',{cache:'no-cache'}).then(r=>r.ok?r.arrayBuffer():null),fetch('./coaster_towers.json',{cache:'no-cache'}).then(r=>r.ok?r.json():[])]).then(([buf,towers])=>{
    const B={blocks:new Map(),towers:towers||[]};
    if(buf&&new TextDecoder().decode(new Uint8Array(buf,0,4))==='CBLD'){const v=new DataView(buf);
      Object.assign(B,{x0:v.getFloat64(8,true),y0:v.getFloat64(16,true),C:v.getFloat64(24,true),W:v.getUint32(32,true)});const n=v.getUint32(40,true);
      for(let i=0;i<n;i++){const c=v.getUint32(44+4*i,true),h=v.getUint16(44+4*n+2*i,true),ix=c%B.W,iy=(c-ix)/B.W,key=(iy>>5)*65536+(ix>>5);   // 32×32-cell blocks
        let blk=B.blocks.get(key);if(!blk)B.blocks.set(key,blk=new Uint16Array(1024));blk[(iy&31)*32+(ix&31)]=h}}
    coasterBld=B}).catch(()=>{coasterBld={blocks:new Map(),towers:[]}});
}
// the tallest building (m) over the 20 m cell at mercator x,y and its eight neighbours (the track's width and some)
function buildingNear(x,y){
  const B=coasterBld;if(!B?.W)return 0;const cx=Math.floor((x-B.x0)/B.C),cy=Math.floor((y-B.y0)/B.C);let h=0;
  for(let iy=cy-1;iy<=cy+1;iy++)for(let ix=cx-1;ix<=cx+1;ix++){if(ix<0||iy<0)continue;const blk=B.blocks.get((iy>>5)*65536+(ix>>5));if(blk){const v=blk[(iy&31)*32+(ix&31)];if(v>h)h=v}}
  return h;
}
// An edge's heights, every 10 m of s: the hills, raised to clear the buildings (8 m over the tallest within ~30 m)
// with ramps of at most COASTER_GRADE (raised round a building, never lowered below one), smoothed; on the ground
// through the platforms (COASTER_FLAT), climbing from there at COASTER_GRADE at most — a tall building right by a
// station is gone through (the stations are underground anyway). Metres.
const COASTER_GRADE=.7,COASTER_DROP=2.2,COASTER_CLEAR=8;
// Lines crossing on the coaster: where two lines' tracks cross (within CROSS_NEAR m, not side by side) the one later in
// name order keeps CROSS_CLEAR m from the other's height there — under it where it can (no building in the way),
// otherwise over it (the tracks are drawn some pixels wide, so at the same height they ran into each other).
// crossings(): per edge, [s (mercator along it), the other edge, its s], one per crossing, built once.
const CROSS_NEAR=35,CROSS_CLEAR=26;let crossIdx=null;
function crossings(){
  if(crossIdx)return crossIdx;crossIdx=new Map();const R=corrRank(),cells=new Map(),seen=new Set(),all=[];let cell=0;
  for(const [line,chunks] of Object.entries(paths))for(const ids of chunks)for(let i=1;i<ids.length;i++){
    const lo=Math.min(ids[i-1],ids[i]),hi=Math.max(ids[i-1],ids[i]),k=`${line}:${lo}:${hi}`;if(seen.has(k)||!byId.has(lo)||!byId.has(hi)||towerCourse(line,lo,hi))continue;seen.add(k);
    const g=coasterPath(line,lo,hi),mu=g.pts[0].meterInMercatorCoordinateUnits();cell||=2*CROSS_NEAR*mu;const e={line,lo,hi,k,r:R.get(line)??0};let j=1;
    for(let s=0;s<=g.total;s+=10*mu){while(j<g.pts.length-1&&g.cum[j]<s)j++;const A=g.pts[j-1],B=g.pts[j],l=Math.hypot(B.x-A.x,B.y-A.y)||1,u=Math.max(0,Math.min(1,(s-g.cum[j-1])/((g.cum[j]-g.cum[j-1])||1)));
      const q={e,s,x:A.x+(B.x-A.x)*u,y:A.y+(B.y-A.y)*u,fx:(B.x-A.x)/l,fy:(B.y-A.y)/l},c=Math.floor(q.x/cell)+','+Math.floor(q.y/cell);
      if(!cells.has(c))cells.set(c,[]);cells.get(c).push(q);all.push(q)}}
  // nearest pair per (edge, other edge, ~100 m stretch): the later edge takes the constraint
  const best=new Map();
  for(const q of all){const ix=Math.floor(q.x/cell),iy=Math.floor(q.y/cell);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const o of cells.get((ix+dx)+','+(iy+dy))||[]){
      if(o.e.line===q.e.line||o.e.r>q.e.r||o.e.r===q.e.r&&o.e.k>q.e.k)continue;   // q's edge is the later one
      if(Math.abs(q.fx*o.fx+q.fy*o.fy)>.9)continue;   // side by side: the corridors keep those apart
      const d=Math.hypot(q.x-o.x,q.y-o.y);if(d>cell/2)continue;const key=q.e.k+'|'+o.e.k+'|'+Math.round(o.s/(cell*1.5));
      const b=best.get(key);if(!b||d<b.d)best.set(key,{d,q,o})}}
  for(const {q,o} of best.values()){if(!crossIdx.has(q.e.k))crossIdx.set(q.e.k,[]);crossIdx.get(q.e.k).push([q.s,o.e,o.s])}
  return crossIdx;
}
function coasterProfile(line,lo,hi){
  const id=`h:${line}:${lo}:${hi}`;let P=edgeGeom.get(id);if(P)return P;
  const g=geom(line,lo,hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),L=g.total/mu,n=Math.max(2,Math.ceil(L/10)),st=L/n,need=new Float32Array(n+1),h=new Float32Array(n+1);
  let j=1;for(let i=0;i<=n;i++){const s=g.total*i/n;while(j<g.pts.length-1&&g.cum[j]<s)j++;const A=g.pts[j-1],B=g.pts[j],u=Math.max(0,Math.min(1,(s-g.cum[j-1])/((g.cum[j]-g.cum[j-1])||1)));
    // (a tower course does not count its own tower)
    const X=A.x+(B.x-A.x)*u,Y=A.y+(B.y-A.y)*u,S=g.spiral,b=S&&Math.hypot(X-S.T.x,Y-S.T.y)<(S.tower+40)*mu?0:buildingNear(X,Y);need[i]=b?b+COASTER_CLEAR:0;h[i]=hillsAt(lo,hi,L,i/n)}
  // crossing lines: over (need) or under (ceil) the one before it, CROSS_CLEAR m apart
  const ceil=new Float32Array(n+1).fill(Infinity);
  if(coaster&&!g.spiral)for(const [cs,o,os] of crossings().get(`${line}:${lo}:${hi}`)||[]){
    const O=coasterProfile(o.line,o.lo,o.hi),og=geom(o.line,o.lo,o.hi),ox=Math.max(0,Math.min(O.n,os/og.total*O.n)),oi=Math.min(O.n-1,Math.floor(ox)),oh=O.h[oi]+(O.h[oi+1]-O.h[oi])*(ox-oi);
    const c=Math.round(cs/g.total*n),w=Math.ceil(CROSS_NEAR/st),a=Math.max(0,c-w),b=Math.min(n,c+w);let nb=0,hh=0;for(let i=a;i<=b;i++){nb=Math.max(nb,need[i]);hh=Math.max(hh,h[i])}
    if(oh-CROSS_CLEAR>=Math.max(nb,6)&&hh<oh)for(let i=a;i<=b;i++)ceil[i]=Math.min(ceil[i],oh-CROSS_CLEAR);
    else for(let i=a;i<=b;i++)need[i]=Math.max(need[i],oh+CROSS_CLEAR)}
  // Over the buildings without corners (clamping to them after rounding, or rounding only ±20 m, bent the climbs at sharp
  // elbows): what they need, sloped off at COASTER_GRADE either side, widened by 3·W and rounded over ±W three times — so
  // never under it — then joined to the hills and to the platforms' cap with a soft max / min (no corner where they meet).
  const G=COASTER_GRADE*st,W=Math.max(1,Math.round(30/st)),env=need.slice();
  for(let i=1;i<=n;i++)env[i]=Math.max(env[i],env[i-1]-G);for(let i=n-1;i>=0;i--)env[i]=Math.max(env[i],env[i+1]-G);
  {const c=env.slice();for(let i=0;i<=n;i++){let m=0;for(let j=Math.max(0,i-3*W);j<=Math.min(n,i+3*W);j++)m=Math.max(m,c[j]);env[i]=m}}
  for(let pass=0;pass<3;pass++){const c=env.slice(),at=i=>c[Math.max(0,Math.min(n,i))];let sum=0;for(let i=-W;i<=W;i++)sum+=at(i);
    for(let i=0;i<=n;i++){if(i)sum+=at(i+W)-at(i-W-1);env[i]=sum/(2*W+1)}}
  // the hills, sloped off at COASTER_GRADE at most (close knots climbed at 0.9) and rounded twice over ±W
  for(let i=1;i<=n;i++)h[i]=Math.max(h[i],h[i-1]-G);for(let i=n-1;i>=0;i--)h[i]=Math.max(h[i],h[i+1]-G);
  for(let pass=0;pass<2;pass++){const c=h.slice(),at=i=>c[Math.max(0,Math.min(n,i))];let sum=0;for(let i=-W;i<=W;i++)sum+=at(i);
    for(let i=0;i<=n;i++){if(i)sum+=at(i+W)-at(i-W-1);h[i]=sum/(2*W+1)}}
  const K=12,smax=(a,b)=>(a+b+Math.hypot(a-b,K))/2,smin=(a,b)=>(a+b-Math.hypot(a-b,K))/2,sminK=(a,b,k)=>(a+b-Math.hypot(a-b,k))/2;
  // the platforms: on the ground, eased off it
  // (the hills keep to COASTER_GRADE off the platform; over a building it may drop as steep as COASTER_DROP, a coaster's
  // first drop — at 0.7 a tall block 200–300 m from a station stood through the track: 7호선 태릉입구→먹골, 118 m)
  for(let i=0;i<=n;i++){const x=Math.min(i,n-i)*st-COASTER_FLAT,cap=(G,R)=>x<=0?0:x<R?G*x*x/(2*R):G*(x-R/2);h[i]=Math.max(0,sminK(smax(smin(h[i],cap(COASTER_GRADE,60)),env[i]),cap(COASTER_DROP,80),30))}
  // under a crossing line: the ceiling sloped off at COASTER_GRADE either side, met softly
  if(ceil.some(Number.isFinite)){const G2=COASTER_GRADE*st;for(let i=1;i<=n;i++)ceil[i]=Math.min(ceil[i],ceil[i-1]+G2);for(let i=n-1;i>=0;i--)ceil[i]=Math.min(ceil[i],ceil[i+1]+G2);
    for(let i=0;i<=n;i++)if(Number.isFinite(ceil[i]))h[i]=Math.max(0,smin(h[i],ceil[i]))}
  const S=g.spiral;if(S){   // a tower course: up off the platform, along the ring to S.top, then the long drop (quintic eases, level at the joins)
    const E=u=>{u=Math.max(0,Math.min(1,u));return u*u*u*(10-15*u+6*u*u)},h0=30,end=g.total-COASTER_FLAT*mu;
    for(let i=0;i<=n;i++){const s=g.total*i/n;let v=s<=S.r0?h0*E((s-COASTER_FLAT*mu)/(S.r0-COASTER_FLAT*mu)):s<=S.r1?h0+(S.top-h0)*(s-S.r0)/(S.r1-S.r0):S.top*(1-E((s-S.r1)/(end-S.r1)));
      h[i]=Math.max(v,s>S.r1?need[i]:0)}}
  P={h,n,st,mu};edgeGeom.set(id,P);return P;
}
function coasterAt(line,lo,hi,s){
  const g=geom(line,lo,hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),L=g.total/mu,k=g.total?s/g.total:0,d=Math.min(k,1-k)*L;
  if(d<=COASTER_FLAT)return [s,0,0,0];
  const P=coasterProfile(line,lo,hi),x=Math.max(0,Math.min(P.n,k*P.n)),i=Math.min(P.n-1,Math.floor(x));
  let sg=s,h=(P.h[i]+(P.h[i+1]-P.h[i])*(x-i))*mu;
  const LD=loopD(L,lo,hi);
  if(LD){const D=LD*mu,s0=g.total/2-D/2,u=(s-s0)/D;
    if(u>0&&u<1){const t=2*Math.PI*u,r=D/LOOP_DR;sg=s0+D*u+r*Math.sin(t);h+=r*(1-Math.cos(t))}}
  const C=corkOf(L,lo,hi);let lat=0,roll=0;
  if(C){const u=(s/mu-C[0])/C[1];if(u>0&&u<1)roll=corkTheta(u,C[2])}
  return [sg,h,lat,roll];   // lat: across (+ to the right going lo→hi; none now), roll: about the way lo→hi
}
// Coaster pace as a real coaster runs: a chain lift pulls the car up at RIDE_LIFT m/s, and from there it rolls on its energy,
// ½mv² + mgh = const (mass cancels, every car alike): v = √(2g(E − h)), E the height its energy reaches — a drop speeds it
// up, a climb slows it until the lift takes over again (no friction; trim brakes hold it to RIDE_TRIM m/s). Only the pace within a run changes (scaled to the
// run's time), so every phase still starts and ends when the feed says (the stations' times are kept).
// rideClock(line,from,to): the share of a run's time spent by each point (k, the way the train runs), every 5 m.
const RIDE_G=9.81,RIDE_LIFT=5,RIDE_TRIM=35,rideClocks=new Map();
function rideClock(line,from,to){
  const id=`${line}:${from}:${to}`;let T=rideClocks.get(id);if(T)return T;
  const lo=Math.min(from,to),hi=Math.max(from,to),fw=from<to,g=geom(line,lo,hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),L=g.total/mu,n=Math.max(2,Math.ceil(L/5)),v=new Float32Array(n+1);
  const lift=RIDE_LIFT*RIDE_LIFT/(2*RIDE_G);let E=lift;
  for(let i=0;i<=n;i++){const k=i/n,h=coasterAt(line,lo,hi,(fw?k:1-k)*g.total)[1]/mu;if(E-h<lift)E=h+lift;v[i]=Math.sqrt(2*RIDE_G*(E-h));if(v[i]>RIDE_TRIM){v[i]=RIDE_TRIM;E=h+RIDE_TRIM*RIDE_TRIM/(2*RIDE_G)}}   // E − h < lift: the lift has it; over RIDE_TRIM the trim brakes take the rest (the tower's 500 m drop came to 100 m/s)
  T=new Float32Array(n+1);for(let i=1;i<=n;i++)T[i]=T[i-1]+2/(v[i-1]+v[i]);
  for(let i=1;i<=n;i++)T[i]/=T[n];
  rideClocks.set(id,T);return T;
}
// k (from k0 to k1 as e goes 0..1) on the coaster's pace
function ridePace(line,from,to,k0,k1,e){
  if(k0===k1)return k0;const T=rideClock(line,from,to),n=T.length-1,at=k=>{const x=Math.max(0,Math.min(n,k*n)),i=Math.min(n-1,Math.floor(x));return T[i]+(T[i+1]-T[i])*(x-i)};
  const t=at(k0)+(at(k1)-at(k0))*e;let i=0,j=n;while(j-i>1){const m=(i+j)>>1;if(T[m]<=t)i=m;else j=m}
  return (i+(T[j]>T[i]?(t-T[i])/(T[j]-T[i]):0))/n;
}
// Cars are spaced by ride distance, the length along the track as built (hills, loop, corkscrew), not by ground
// distance: spaced by ground distance they were stretched over a quarter of the loop each and crossed (it looked
// smashed), and pulled apart on the steep hills. edgeArc: ride from lo at every 2 m of s along the edge.
const edgeArcs=new Map();
function edgeArc(line,lo,hi){
  const id=`${line}:${lo}:${hi}`;let E=edgeArcs.get(id);if(E)return E;
  const g=geom(line,lo,hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),n=Math.max(1,Math.ceil(g.total/(2*mu))),A=new Float64Array(n+1);
  const at=s=>{const [sg,h,lat]=coasterAt(line,lo,hi,s);let i=1,j=g.pts.length-1;while(i<j){const m=(i+j)>>1;if(g.cum[m]<sg)i=m+1;else j=m}
    const P=g.pts[i-1],Q=g.pts[i],l=(g.cum[i]-g.cum[i-1])||1,u=Math.max(0,Math.min(1,(sg-g.cum[i-1])/l)),fx=(Q.x-P.x)/l,fy=(Q.y-P.y)/l;
    return [P.x+(Q.x-P.x)*u-fy*lat,P.y+(Q.y-P.y)*u+fx*lat,h]};
  let q=at(0);for(let k=1;k<=n;k++){const r=at(g.total*k/n);A[k]=A[k-1]+Math.hypot(r[0]-q[0],r[1]-q[1],r[2]-q[2]);q=r}
  E={A,step:g.total/n,total:A[n]};edgeArcs.set(id,E);return E;
}
const arcOf=(E,s)=>{const x=Math.max(0,Math.min(E.A.length-1,s/E.step)),i=Math.min(E.A.length-2,Math.floor(x));return E.A[i]+(E.A[i+1]-E.A[i])*(x-i)};
const sOfArc=(E,a)=>{const A=E.A;let lo=0,hi=A.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(A[m]<=a)lo=m;else hi=m}return (lo+Math.max(0,Math.min(1,(a-A[lo])/((A[hi]-A[lo])||1))))*E.step};
// a plan's ride distance ↔ its ground distance d along plan.seq (straight on past either end). Its edges' rides are
// added up as far as asked (only the trains drawn ask, mostly near the start of their way).
function rideEdge(p,i){const a=p.seq[i],b=p.seq[i+1];return edgeArc(p.t.line,Math.min(a.id,b.id),Math.max(a.id,b.id))}
function rideCum(p,i){const R=p.ride??={cum:[0]};while(R.cum.length<=i){const k=R.cum.length-1;R.cum.push(R.cum[k]+rideEdge(p,k).total)}return R.cum[i]}
function toRide(p,d){
  if(!coaster||p.seq.length<2)return d;const end=p.cum[p.cum.length-1],last=p.seq.length-1;if(d<=0)return d;if(d>=end)return rideCum(p,last)+d-end;
  let i=0;while(i<last-1&&p.cum[i+1]<d)i++;const E=rideEdge(p,i),t=d-p.cum[i],fw=p.seq[i].id<p.seq[i+1].id;
  return rideCum(p,i)+(fw?arcOf(E,t):E.total-arcOf(E,(p.cum[i+1]-p.cum[i])-t));
}
function fromRide(p,a){
  if(!coaster||p.seq.length<2)return a;const last=p.seq.length-1;if(a<=0)return a;
  let i=0;while(i<last&&rideCum(p,i+1)<a)i++;if(i===last)return p.cum[last]+a-rideCum(p,last);
  const E=rideEdge(p,i),r=a-rideCum(p,i),fw=p.seq[i].id<p.seq[i+1].id,L=p.cum[i+1]-p.cum[i];
  return p.cum[i]+(fw?sOfArc(E,r):L-sOfArc(E,E.total-r));
}
// Where the middle of the train is, as a distance (mercator units) along plan.seq: the feed's prediction (rawPose), but
// never into the train ahead on the same track. Two reports a moment apart put trains on top of each other (2호선 2083
// leaving 잠실나루 and 6085 coming in 2 s later, 2026-10-03; a train held at its next platform after fresh data meets the
// one standing there): the one behind waits TRAIN_GAP_M back, as at a signal. Same line, direction and express or not
// (an express passes a local at a station). Worked out for all the trains at once, at most every 10 ms.
const TRAIN_GAP_M=20,spaced=new Map();let spacedAt=-1e9,spacedFor=null;
function trainPose(p){const now=performance.now();if(now-spacedAt>10||spacedFor!==plans){spaceTrains();spacedAt=now;spacedFor=plans}return spaced.get(p)||rawPose(p)}
function spaceTrains(){
  spaced.clear();const groups=new Map(),at=e=>{const q=trackPoint(e.p,e.pose.dist);e.x=q.x;e.y=q.y;e.f=q.f};
  for(const p of plans){const pose=rawPose(p);spaced.set(p,pose);if(p.seq.length<2)continue;
    const m=mercStop(p.t.line,p.seq[0]).meterInMercatorCoordinateUnits(),k=`${p.t.line}|${p.t.direction}|${p.t.express?1:0}`,e={p,pose,half:p.cars*p.carMetres*m/2,m};at(e);
    if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}
  for(const g of groups.values())if(g.length>1)for(let pass=0;pass<2;pass++)for(const a of g)for(const b of g){if(a===b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),need=a.half+b.half+TRAIN_GAP_M*a.m;if(d>=need)continue;
    const ahead=dx*(a.f[0]+b.f[0])+dy*(a.f[1]+b.f[1]);if(ahead<0||ahead===0&&a.p.id<b.p.id)continue;   // b is not in front of a
    a.pose={...a.pose,dist:Math.max(0,a.pose.dist-(need-d))};at(a);spaced.set(a.p,a.pose)}
}
function rawPose(p){
  let el=age(p.t.receivedAt)+p.lead+(coaster?warpNow():0),ph=p.phases[p.phases.length-1];
  for(const x of p.phases){if(el<x.dur){ph=x;break}el-=x.dur}
  const u=ph.dur===Infinity?1:Math.min(1,el/ph.dur),e=ph.ease==='both'||ph.ease===true?smooth(u):ph.ease==='in'?u*u:ph.ease==='out'?1-(1-u)*(1-u):u,k=coaster&&ph.from!==ph.to?ridePace(p.t.line,ph.from.id,ph.to.id,ph.k0,ph.k1,e):ph.k0+(ph.k1-ph.k0)*e;
  const i=Math.max(0,p.seq.indexOf(ph.from)),len=(p.cum[i+1]??p.cum[i])-p.cum[i];
  const dist=p.cum[i]+len*(ph.from===ph.to?0:k),moving=ph.k0!==ph.k1;
  // After fresh data (see replacePlans): never back up — wait where the train was drawn until the
  // new prediction passes it; a forward correction is run along the track instead of jumped.
  if(p.hold!=null){
    // ahead of fresh data: run on to the station it was heading for and wait at the platform there
    // (standing still between stations looked broken), then go on once the prediction catches up
    let at=p.hold,creeping=false;
    if(p.creep){const w=(performance.now()-p.creep.at)/p.creep.ms;if(w<1){at=p.creep.from+(p.hold-p.creep.from)*(1-(1-w)*(1-w));creeping=true}else p.creep=null}
    if(dist<p.hold)return {dist:at,moving:creeping};
    if(creeping&&at<dist)p.glide={from:at,at:performance.now(),ms:1500};
    p.hold=null;p.creep=null;
  }
  if(p.glide){const w=(performance.now()-p.glide.at)/p.glide.ms;if(w<1)return {dist:p.glide.from+(dist-p.glide.from)*smooth(w),moving:true};p.glide=null}
  // stand: at a stop — s into it, how long it lasts and which station
  return {dist,moving,stand:!moving&&ph.dur!==Infinity?{t:el,dur:ph.dur,st:ph.k0===0?ph.from:ph.to}:null};
}
// Swap in plans from fresh data, carrying each train's drawn position over so it moves on continuously.
// A forward correction is run over 10 ms per metre (1.5–8 s), so a big one is not a dash.
const PREDICT_STOPS=3,GLIDE_MAX_M=2500,HOLD_MAX_M=3000;   // bigger corrections than these still jump
function replacePlans(next){
  const old=new Map(plans.map(p=>[p.id,p]));
  for(const p of next){
    const o=old.get(p.id);if(!o||o.seq.length<2)continue;
    const d=trainPose(o).dist;let i=0;while(i<o.seq.length-2&&o.cum[i+1]<d)i++;
    const a=o.seq[i].id,b=o.seq[i+1].id,f=(d-o.cum[i])/((o.cum[i+1]-o.cum[i])||1);
    // the same stretch of track in the new route, or else the station it was heading to
    let from;const j=p.seq.findIndex((s,k)=>s.id===a&&p.seq[k+1]?.id===b);
    if(j>=0)from=p.cum[j]+(p.cum[j+1]-p.cum[j])*f;
    else{const k=p.seq.findIndex(s=>s.id===b);if(k<0)continue;from=Math.max(0,p.cum[k]-(1-f)*(o.cum[i+1]-o.cum[i]))}   // different route: nothing to carry over
    const to=trainPose(p).dist,m=mercStop(p.t.line,p.seq[0]).meterInMercatorCoordinateUnits();
    if(from>to){if((from-to)/m<HOLD_MAX_M){
      // hold at the next station along (not where it happens to be drawn), reached at ~10 m/s
      const k=p.cum.findIndex(c=>c>=from-1e-9),st=k>=0?p.cum[k]:from;p.hold=st;
      if(st>from)p.creep={from,at:performance.now(),ms:Math.max(2000,Math.min(60000,(st-from)/m*100))};
    }}
    else if((to-from)/m>1&&(to-from)/m<GLIDE_MAX_M)p.glide={from,at:performance.now(),ms:Math.max(1500,Math.min(8000,(to-from)/m*10))};
  }
  plans=next;
}
// Point on the track `dist` along plan.seq (clamped to its ends), with heading and lateral offset.
// Trains keep to the right of their travel direction (Korean right-hand running): looking along
// the 상행 direction, 상행 trains are right of the line and 하행 trains left of it.
function trackPoint(p,dist){
  const {seq,cum}=p,line=p.t.line;
  if(seq.length<2){const m=mercStop(line,seq[0]);return {x:m.x,y:m.y,f:[0,-1],r:[1,0],off:0,h:0}}
  const end=cum[cum.length-1],d=Math.max(0,Math.min(end,dist)),over=dist-d; // beyond either end: extend straight
  let i=0;while(i<seq.length-2&&cum[i+1]<d)i++;
  const a=seq[i],b=seq[i+1],len=(cum[i+1]-cum[i])||1;let k=(d-cum[i])/len,h=0,lat=0,roll=0;const fw=a.id<b.id?1:-1;
  if(coaster){const lo=Math.min(a.id,b.id),hi=Math.max(a.id,b.id),g=geom(line,lo,hi),[sg,hh,la,ro]=coasterAt(line,lo,hi,(fw>0?k:1-k)*g.total),q=g.total?sg/g.total:0;h=hh;lat=la*fw;roll=ro*fw;k=fw>0?q:1-q}   // on the coaster: its ground point, height, and the corkscrew's swing and roll (the way it runs)
  const pt=along(line,a,b,k),f=pt.f,r=[-f[1],f[0]],x=pt.x+f[0]*over+r[0]*lat,y=pt.y+f[1]*over+r[1]*lat;
  // Shared-track slot changes at stations; ease it over ~60 m either side instead of jumping.
  const o=j=>edgeOffset(line,seq[j].id,seq[j+1].id)*(seq[j].id<seq[j+1].id?1:-1),B=60*(p.m??=mercStop(line,seq[0]).meterInMercatorCoordinateUnits());
  let off=o(i);
  if(i>0&&d-cum[i]<B)off+=(o(i-1)-off)*.5*(1-(d-cum[i])/B);
  else if(i<seq.length-2&&cum[i+1]-d<B)off+=(o(i+1)-off)*.5*(1-(cum[i+1]-d)/B);
  return {x,y,f,r,off,h,roll};
}
let plans=[];
const lastPose=new Map(),BLEND_MS=1200;

// Train body width and lane offset in screen px, shared by the train layer, roof numbers,
// destination tags and click picking.
const bodyWidthPx=z=>15+13*smooth(Math.max(0,Math.min(1,(z-13)/4))),TRAIN_MIN_PX=36;   // min on-screen length when zoomed out
const laneOffsetPx=(z,body=bodyWidthPx(z))=>(1.5+2.5*Math.max(0,Math.min(1,(z-8)/7)))/2+3.5+body/2;
// on the coaster (always car by car) zoomed out: a slimmer body, so a 20 m car stays longer than wide (≥ 7 px across)
const coasterBodyPx=z=>Math.min(bodyWidthPx(z),Math.max(7,20*512*2**z/(40075016.686*Math.cos(37.5*Math.PI/180))/1.6));
const destLabel=t=>{const d=String(t.destination||'');return !d?'':/순환$/.test(d)?`${d.replace(/순환$/,'')} 방면(순환)`:`${d}행`};

// ---- train model --------------------------------------------------------------------
// Stainless Korean EMUs: a quiet cab-led icon grows into rigid chord-aligned cars.
// Pixel-sized details fade in with car length; no textures, depth buffer or bent bodies.
const hexRGB=v=>[parseInt(v.slice(1,3),16)/255,parseInt(v.slice(3,5),16)/255,parseInt(v.slice(5,7),16)/255];
const TRAIN_VS=`#version 300 es
in vec3 a_pos;in vec2 a_local;in vec4 a_info;in vec3 a_color;in float a_face;
uniform mat4 u_matrix;uniform vec2 u_offset;uniform float u_shadow;
out vec2 v_local;flat out vec4 v_info;flat out vec3 v_color;flat out float v_face;
void main(){v_local=a_local;v_info=a_info;v_color=a_color;v_face=a_face;
  bool beam=a_face>5.5;   // headlight beam and selection ripple keep their own height in the ground pass and ignore the sun offset
  gl_Position=u_matrix*vec4(a_pos.xy+(beam?vec2(0.):u_offset),beam||u_shadow<.5?a_pos.z:0.,1.);}`;
const TRAIN_FS=`#version 300 es
precision highp float;
in vec2 v_local;flat in vec4 v_info;flat in vec3 v_color;flat in float v_face;
uniform float u_shadow,u_glow,u_time,u_alpha;out vec4 outColor;
float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float ink(float d){float a=max(.18,fwidth(d)*.65);return 1.-smoothstep(-a,a,d);}
float rect(vec2 p,vec2 c,vec2 b){return ink(box(p-c,b));}
float stroke(float d,float w){return ink(abs(d)-w);}
void shade(){
  float L=v_info.x,W=v_info.y,kind=mod(v_info.z,4.),carPx=v_info.w,H=W*.68;
  bool front=mod(kind,2.)>.5,back=kind>1.5;
  vec2 p=v_local;vec3 col;float alpha=1.;
  float endX=min(back?p.x:1e5,front?L-p.x:1e5);
  bool lead=front&&L-p.x<=endX+.001;   // nearer the running end → the cab that leads
  float nose=W*.48,halfW=W*.5;
  float localL=carPx>0.?carPx:L;
  float detail=smoothstep(W*1.1,W*2.5,localL);
  // Rounded cab corners only: inter-car ends remain square. Signed distance in pixels.
  float radius=W*.36;
  vec2 cab=vec2(radius-endX,abs(p.y)-(halfW-radius));
  float rounded=length(max(cab,0.))+min(max(cab.x,cab.y),0.)-radius;
  float edge=max(max(-p.x,p.x-L),max(abs(p.y)-halfW,rounded));
  if(v_face>6.5){
    // selected train: one calm line-colour pulse, like the my-location pulse, under every train body
    if(u_shadow<.5)discard;
    float R=W*3.4,d=length(p),k=clamp(fract(u_time/2.4)/.75,0.,1.),r=mix(W*.7,R,1.-(1.-k)*(1.-k)),fade=1.-k;
    float a=(1.-smoothstep(r-1.5,r+.5,d))*fade*.36+ink(abs(d-r)-1.)*fade*.22;
    outColor=vec4(v_color*a,a);return;
  }
  if(v_face>5.5){
    // headlight beam on the ground ahead of the leading cab, drawn with the ground shadows
    if(u_shadow<.5)discard;
    // two cones, one from each headlight, spreading slightly outward
    float len=W*3.4,u=p.x/len,yc=W*.27*(1.+.8*u),hw=W*(.09+.5*u);
    float cone=max(1.-smoothstep(.35,1.,abs(p.y-yc)/hw),1.-smoothstep(.35,1.,abs(p.y+yc)/hw));
    float a=pow(1.-u,1.6)*cone*u_glow*(1.+.8*(1.-smoothstep(0.,.12,u)));   // brightest right at the lamps
    outColor=vec4(vec3(1.,.95,.78)*a,a*.8);return;
  }
  if(u_shadow>.5){if(v_face>.5)discard;float a=(1.-smoothstep(-.4,2.4,edge))*.22;outColor=vec4(vec3(.09,.13,.16)*a,a);return;}
  if(v_face<.5){
    alpha=ink(edge);if(alpha<=0.)discard;
    float ay=abs(p.y),x=carPx>0.?mod(p.x,carPx):p.x;
    col=mix(vec3(.88,.91,.92),vec3(.60,.66,.70),smoothstep(W*.24,halfW,ay));
    // Raised roof shoulder and a continuous line-colour cant rail remain legible from above.
    col=mix(col,vec3(.97,.98,.98),stroke(ay-(halfW-1.9),.20));
    col=mix(col,v_color,ink(abs(ay-(halfW-.95))-.70));
    // Roof-edge glimpses of the window/door rhythm, never a stretched bitmap.
    float pitch=localL/4.,door=abs(mod(x+pitch*.5,pitch)-pitch*.5);
    float rim=ink(abs(ay-(halfW-.26))-.25);
    col=mix(col,door<min(1.1,pitch*.16)?vec3(.72,.78,.80):vec3(.12,.23,.28),rim*detail);
    vec3 cleanRoof=col;
    if(detail>0.){
      // Two low-profile air-conditioning packs with end grilles and a circular fan.
      float cx=x<localL*.5?localL*.29:localL*.71;
      vec2 q=vec2(x-cx,p.y);vec2 size=vec2(min(5.7,localL*.105),W*.235);
      col=mix(col,vec3(.46,.53,.57),rect(q,vec2(.35,.4),size+vec2(.35)));
      col=mix(col,vec3(.75,.80,.82),rect(q,vec2(0),size));
      float unitMask=rect(q,vec2(0),size-vec2(.65));
      float grille=stroke(mod(q.x+30.,1.45)-.725,.17);
      col=mix(col,vec3(.43,.52,.57),unitMask*grille*.8);
      float fan=length(q-vec2(-size.x*.35,0.));
      col=mix(col,vec3(.61,.68,.71),ink(fan-W*.135));
      col=mix(col,vec3(.36,.44,.49),stroke(fan-W*.115,.2));
      col=mix(col,vec3(.35,.43,.47),ink(fan-.4));
      // Longitudinal ribs and central roof hatch.
      col=mix(col,vec3(.66,.72,.75),stroke(ay-W*.29,.17));
      col=mix(col,vec3(.66,.72,.75),rect(vec2(x,p.y),vec2(localL*.5,0),vec2(1.5,W*.18))*.75);
      if(v_info.z>3.5){
        vec2 q=vec2(x-localL*.5,p.y);float diamond=abs(q.x)/2.8+abs(q.y)/2.;
        col=mix(col,vec3(.23,.29,.32),stroke(diamond-1.,.16));
        col=mix(col,vec3(.19,.24,.27),rect(q,vec2(0),vec2(.4,W*.29)));
      }
    }
    col=mix(cleanRoof,col,detail);
    float hatch=smoothstep(W*.75,W*1.3,localL)*(1.-detail);
    col=mix(col,vec3(.68,.75,.78),rect(vec2(x,p.y),vec2(localL*.5,0),vec2(localL*.16,W*.16))*hatch*.55);
    // At icon scale seams stop at the shoulders; no transverse ladder rungs.
    if(carPx>0.&&p.x>nose+1.&&p.x<L-nose-1.){
      float joint=abs(mod(p.x+carPx*.5,carPx)-carPx*.5);
      float seams=smoothstep(W*.8,W*1.5,carPx);
      float shoulder=smoothstep(W*.22,W*.36,ay);
      col=mix(col,vec3(.40,.49,.53),ink(joint-.25)*seams*mix(shoulder,.55,detail));
    }
    if(endX<nose+.7){
      vec3 body=col;
      if(lead){
        // Leading cab: coloured nose apron, sloping dark glass, destination display, bright headlights.
        col=mix(v_color,vec3(.82,.88,.89),.10);
        float glass=rect(vec2(endX,p.y),vec2(nose*.66,0),vec2(nose*.24,W*.32));
        col=mix(col,vec3(.055,.13,.18),glass);
        col=mix(col,vec3(.30,.43,.49),glass*rect(vec2(endX,p.y),vec2(nose*.73,-W*.13),vec2(.28,W*.18)));
        col=mix(col,vec3(.12,.19,.23),stroke(p.y,.16)*glass*detail);
        col=mix(col,vec3(.96,.66,.20),rect(vec2(endX,p.y),vec2(nose*.89,0),vec2(.22,W*.12))*detail);
        col=mix(col,vec3(1.,.98,.82),rect(vec2(endX,abs(p.y)),vec2(nose*.22,W*.27),vec2(max(.5,nose*.12),W*.09)));
      }else{
        // Tail: plain stainless end, narrow rear window, large red tail lights.
        col=mix(body,vec3(.80,.85,.87),.35);
        col=mix(col,vec3(.14,.22,.27),rect(vec2(endX,p.y),vec2(nose*.62,0),vec2(nose*.14,W*.22)));
        col=mix(col,vec3(.95,.12,.10),rect(vec2(endX,abs(p.y)),vec2(nose*.22,W*.27),vec2(max(.5,nose*.12),W*.09)));
      }
      col=mix(body,col,1.-smoothstep(nose-.15,nose+.55,endX));
    }
    col=mix(col,vec3(.24,.32,.36),1.-ink(max(abs(p.y)-halfW,rounded)+.34));
  }else if(v_face<1.5){
    // Local x follows the rigid car, local y is actual height. Four double sliding doors.
    float z=p.y,localL=carPx>0.?carPx:L,x=carPx>0.?mod(p.x,carPx):p.x;
    col=mix(vec3(.51,.59,.63),vec3(.81,.85,.86),z/H);
    col=mix(col,vec3(.17,.23,.26),1.-smoothstep(1.,1.45,z));
    float pitch=localL/4.,cell=mod(x,pitch)-pitch*.5;
    float doorW=min(W*.45,localL*.083),door=abs(cell);
    float windowBand=rect(vec2(x,z),vec2(localL*.5,H*.69),vec2(localL*.5-.9,H*.165));
    col=mix(col,vec3(.12,.23,.29),windowBand);
    // Silver window pillars split the passenger glazing into individual panes.
    float pillar=ink(abs(abs(cell)-pitch*.34)-.32);
    col=mix(col,vec3(.68,.75,.78),windowBand*pillar);
    col=mix(col,vec3(.37,.51,.58),windowBand*ink(abs(z-H*.79)-.25)*.75);
    col=mix(col,v_color,ink(abs(z-H*.39)-H*.085));
    float doorMask=rect(vec2(cell,z),vec2(0,H*.52),vec2(doorW*.5,H*.37));
    col=mix(col,vec3(.43,.52,.56),doorMask);
    col=mix(col,vec3(.78,.83,.84),rect(vec2(cell,z),vec2(0,H*.52),vec2(max(.2,doorW*.5-.38),H*.37-.28)));
    col=mix(col,v_color,doorMask*ink(abs(z-H*.39)-H*.085));
    float doorGlass=rect(vec2(abs(cell),z),vec2(doorW*.25,H*.70),vec2(max(.15,doorW*.18),H*.12));
    col=mix(col,vec3(.09,.21,.27),doorGlass);
    col=mix(col,vec3(.34,.43,.47),doorMask*stroke(cell,.17));
    col=mix(col,vec3(.93,.95,.95),ink(abs(z-(H-.30))-.23));
    col=mix(col,vec3(.40,.49,.54),ink(abs(z-1.75)-.15));
    if(endX<nose+1.){
      if(lead){   // coloured cab sides only at the leading end
        col=mix(vec3(.67,.74,.77),v_color,ink(abs(z-H*.39)-H*.085));
        col=mix(col,v_color,.55*(1.-smoothstep(H*.55,H*.6,z)));
        col=mix(col,vec3(.08,.19,.25),rect(vec2(endX,z),vec2(nose*.9,H*.72),vec2(nose*.52,H*.16)));
      }else col=mix(col,vec3(.08,.19,.25),rect(vec2(endX,z),vec2(nose*.9,H*.72),vec2(nose*.3,H*.12)));
      if(z<1.4)col=vec3(.16,.22,.25);
    }
    vec3 simpleSide=mix(vec3(.65,.72,.75),v_color,ink(abs(z-H*.45)-H*.15));
    simpleSide=mix(simpleSide,vec3(.13,.24,.29),ink(abs(z-H*.74)-H*.13));
    col=mix(simpleSide,col,detail);
    if(carPx>0.)col=mix(col,vec3(.34,.42,.46),ink(min(x,carPx-x)-.25)*detail);
  }else if(v_face<3.5){
    // End wall under the raked windscreen: coloured mask, lights, coupler and anti-climber.
    float z=p.y;col=v_face<2.5?mix(v_color,vec3(.12,.20,.24),.14):vec3(.74,.80,.82);   // coloured mask at the front, stainless at the tail
    col=mix(col,vec3(.73,.79,.81),ink(abs(z-1.6)-.5));
    col=mix(col,vec3(.13,.19,.23),1.-smoothstep(.6,1.1,z));
    vec3 lamp=v_face<2.5?vec3(1.,.98,.80):vec3(1.,.12,.09);
    col=mix(col,vec3(.13,.20,.23),rect(vec2(abs(p.x),z),vec2(W*.31,H*.33),vec2(1.05,.85)));
    col=mix(col,lamp,rect(vec2(abs(p.x),z),vec2(W*.31,H*.33),vec2(.9,.6)));
    col=mix(col,vec3(.15,.21,.24),rect(p,vec2(0,.85),vec2(.9,.5)));
  }else if(v_face>4.5){
    col=vec3(.55,.63,.67);
    col=mix(col,vec3(.16,.22,.25),rect(p,vec2(0,H*.47),vec2(W*.30,H*.40)));
    col=mix(col,vec3(.34,.41,.44),stroke(abs(p.x)-W*.25,.2));
  }else{
    // Recessed rubber bellows; fine ribs distinguish the joint from an empty gap.
    col=mix(vec3(.17,.23,.26),vec3(.38,.44,.47),stroke(mod(p.x+30.,.85)-.425,.14));
  }
  outColor=vec4(col*alpha,alpha);
}
// u_alpha: a train behind a building shows through it like through the map's translucent buildings
void main(){shade();outColor*=u_alpha;}`;
const NOSE_Z=.3;   // the leading nose slopes down to (almost) the ground, so the headlights meet their beam
class TrainLayer{
  constructor(){
    this.id='webgl-trains';this.type='custom';this.renderingMode='3d';
    // Reuse the staging array and matrix: no JS vertex arrays or per-vertex objects each frame.
    this.data=new Float32Array(131072);this.matrix=new Float32Array(16);this.rgb=new Map();
  }
  onAdd(map,gl){
    this.map=map;
    const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
    this.p=gl.createProgram();const vs=sh(gl.VERTEX_SHADER,TRAIN_VS),fs=sh(gl.FRAGMENT_SHADER,TRAIN_FS);
    gl.attachShader(this.p,vs);gl.attachShader(this.p,fs);gl.linkProgram(this.p);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(this.p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.p));
    this.b=gl.createBuffer();
    this.attr=Object.fromEntries(['a_pos','a_local','a_info','a_color','a_face'].map(n=>[n,gl.getAttribLocation(this.p,n)]));
    this.uni=Object.fromEntries(['u_matrix','u_offset','u_shadow','u_glow','u_time','u_alpha'].map(n=>[n,gl.getUniformLocation(this.p,n)]));
  }
  vertex(x,y,z,u,v,face){
    if(this.used+13>this.data.length){const larger=new Float32Array(this.data.length*2);larger.set(this.data);this.data=larger}
    const d=this.data,i=this.used,c=this.color;this.used+=13;
    d[i]=x-this.ox;d[i+1]=y-this.oy;d[i+2]=z;d[i+3]=u;d[i+4]=v;
    d[i+5]=this.length;d[i+6]=this.width;d[i+7]=this.kind;d[i+8]=this.carPx;
    d[i+9]=c[0];d[i+10]=c[1];d[i+11]=c[2];d[i+12]=face;
  }
  corner(x,y,z,u,v,face){
    // on the coaster each car has its own frame (fr: base, F along it, R across, U its up), so it climbs and turns over in the loop
    const f=this.fr;if(f){const X=x*this.unit,Y=y*this.unit,Z=z*this.unit;this.vertex(f[0]+f[3]*X+f[6]*Y+f[9]*Z,f[1]+f[4]*X+f[7]*Y+f[10]*Z,f[2]+f[5]*X+f[8]*Y+f[11]*Z,u,v,face);return}
    this.vertex(this.cx+(this.tx*x-this.ty*y)*this.unit,this.cy+(this.ty*x+this.tx*y)*this.unit,z*this.unit,u,v,face);
  }
  // Roof strip with a sloped height at either end (also used for gangway caps).
  roof(a,b,za,zb,w,face=0){
    this.corner(a,-w,za,a,-w,face);this.corner(a,w,za,a,w,face);this.corner(b,w,zb,b,w,face);
    this.corner(a,-w,za,a,-w,face);this.corner(b,w,zb,b,w,face);this.corner(b,-w,zb,b,-w,face);
  }
  wall(a,b,za,zb,y,face=1,yb=y){
    this.corner(a,y,.65,a,.65,face);this.corner(b,yb,.65,b,.65,face);this.corner(b,yb,zb,b,zb,face);
    this.corner(a,y,.65,a,.65,face);this.corner(b,yb,zb,b,zb,face);this.corner(a,y,za,a,za,face);
  }
  // Side facets follow the same rounded outline as the roof's pixel-space mask.
  cabWall(front,side,H,low=H*.44){
    const W=this.width,r=W*.36,nose=W*.48;
    let x=0,y=W*.5-r,z=low;
    for(let i=1;i<=4;i++){
      const t=i/4,xx=r*(1-Math.cos(t*Math.PI/2)),yy=W*.5-r+r*Math.sin(t*Math.PI/2),zz=low+(H-low)*xx/nose;
      this.wall(front?this.length-x:x,front?this.length-xx:xx,z,zz,side*y,1,side*yy);
      x=xx;y=yy;z=zz;
    }
    this.wall(front?this.length-r:r,front?this.length-nose:nose,z,H,side*W*.5);
  }
  // Selection ripple: a square on the ground centred on (x,y) in world units, radius R px.
  ripple(x,y,R){
    this.cx=x;this.cy=y;this.tx=1;this.ty=0;
    this.corner(-R,-R,.2,-R,-R,7);this.corner(R,-R,.2,R,-R,7);this.corner(R,R,.2,R,R,7);
    this.corner(-R,-R,.2,-R,-R,7);this.corner(R,R,.2,R,R,7);this.corner(-R,R,.2,-R,R,7);
  }
  // Headlight beams: a flat quad on the ground from the nose forward; the shader draws one cone per lamp.
  // It lies on the ground from the nose tip, where the headlights sit.
  beam(L,w){
    const len=this.width*3.4,w0=w*.8,w1=w*2.3,zl=.3,zg=.3;
    this.corner(L,-w0,zl,0,-w0,6);this.corner(L,w0,zl,0,w0,6);this.corner(L+len,w1,zg,len,w1,6);
    this.corner(L,-w0,zl,0,-w0,6);this.corner(L+len,w1,zg,len,w1,6);this.corner(L+len,-w1,zg,len,-w1,6);
  }
  end(x,w,z,face){
    this.corner(x,-w,.65,-w,.65,face);this.corner(x,w,.65,w,.65,face);this.corner(x,w,z,w,z,face);
    this.corner(x,-w,.65,-w,.65,face);this.corner(x,w,z,w,z,face);this.corner(x,-w,z,-w,z,face);
  }
  render(gl,options){
    if(!myLocation&&(!trainsEnabled||!plans.length))return;
    const drawTrainsToo=trainsEnabled;
    const zoom=map.getZoom(),unit=1/(512*2**zoom),bodyPx=coaster?coasterBodyPx(zoom):bodyWidthPx(zoom),MIN_PX=TRAIN_MIN_PX,MARGIN=3;
    // Lane: clear of the route line (its drawn width) by a visible gap, then half a car body.
    const lanePx=laneOffsetPx(zoom,bodyPx);
    const view=map.getBounds(),lo=maplibregl.MercatorCoordinate.fromLngLat(view.getSouthWest()),hi=maplibregl.MercatorCoordinate.fromLngLat(view.getNorthEast()),pad=(hi.x-lo.x)*.1;
    // Keep world coordinates in double precision until subtracting the view-centre origin.
    const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),ox=O.x,oy=O.y;
    this.ox=ox;this.oy=oy;this.unit=unit;this.width=bodyPx;this.used=0;this.fr=null;
    const bearing=map.getBearing()*Math.PI/180,camX=-Math.sin(bearing),camY=Math.cos(bearing),pitched=map.getPitch()>.1,H=bodyPx*.68;
    let animating=false,waiting=false,rippling=false;
    // my-location pulse: the ripple, in 슝 yellow, under the trains
    if(myLocation&&map.getBounds().contains(myLocation)){const q=maplibregl.MercatorCoordinate.fromLngLat(myLocation);this.color=[1,.83,0];this.width=8;this.length=0;this.kind=0;this.carPx=0;this.ripple(q.x,q.y,8*3.4);this.width=bodyPx;rippling=true}
    for(const plan of drawTrainsToo?plans:[]){
      const pose=trainPose(plan),mid=trackPoint(plan,pose.dist),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits();
      // Fresh data: glide from where the old prediction had the train instead of teleporting.
      let shiftX=0,shiftY=0;
      if(plan.blend){const w=(performance.now()-plan.blend.at)/BLEND_MS;if(w<1){const e=1-smooth(w);shiftX=(plan.blend.x-mid.x)*e;shiftY=(plan.blend.y-mid.y)*e;animating=true}else plan.blend=null}
      const previous=lastPose.get(plan.id);
      if(previous){previous.x=mid.x+shiftX;previous.y=mid.y+shiftY}else lastPose.set(plan.id,{x:mid.x+shiftX,y:mid.y+shiftY});
      // off-screen test with the train's half length as margin: zoomed in, a train is longer than the screen
      const reach=pad+Math.max(plan.cars*plan.carMetres*m,MIN_PX*unit)/2+lanePx*unit;
      if(mid.x<lo.x-reach||mid.x>hi.x+reach||mid.y>lo.y+reach||mid.y<hi.y-reach)continue;
      if(pose.moving)animating=true;else waiting=true;   // only trains on screen keep the map redrawing
      const n=plan.cars,real=n*plan.carMetres*m,total=Math.max(real,MIN_PX*unit,coaster?n*bodyPx*1.6*unit:0),car=total/n,tail=(coaster?toRide(plan,pose.dist):pose.dist)-total/2;   // on the coaster: car positions in ride distance
      let color=this.rgb.get(plan.t.line);if(!color){color=hexRGB(colors[plan.t.line]);this.rgb.set(plan.t.line,color)}this.color=color;
      if(plan.id===sheetTrain){const o=(mid.off+lanePx)*unit;this.fr=null;this.width=bodyPx;this.length=0;this.kind=0;this.carPx=0;this.ripple(mid.x+shiftX+mid.r[0]*o,mid.y+shiftY+mid.r[1]*o,bodyPx*3.4);this.width=bodyPx;rippling=true}
      const P=d=>{const q=trackPoint(plan,coaster?fromRide(plan,d):d);q.x+=shiftX;q.y+=shiftY;return q};
      const ratio=car/unit/bodyPx,separate=coaster||ratio>=1.5;   // on the coaster: always car by car, so the train bends over the hills
      const unfold=coaster?1:smooth(Math.max(0,Math.min(1,(ratio-1.5)/.9))),gap=1.4*unit*unfold;
      const start=P(tail),finish=P(tail+total);
      // At the LOD boundary, car chords coincide with the compact icon's chord.
      // Articulation and physical gaps then grow continuously, including on curves.
      const articulated=(d)=>{
        const q=P(d),t=(d-tail)/total;
        q.x=(start.x+(finish.x-start.x)*t)*(1-unfold)+q.x*unfold;
        q.y=(start.y+(finish.y-start.y)*t)*(1-unfold)+q.y*unfold;
        q.h=(start.h+(finish.h-start.h)*t)*(1-unfold)+q.h*unfold;
        return q;
      };
      if(separate){
        // Painter order follows camera ground direction; no hidden back wall can bleed through.
        const forward=mid.f[0]*camX+mid.f[1]*camY>=0;
        for(let k=0;k<n;k++){
          const j=forward?k:n-1-k,A=articulated(tail+j*car+(j?gap/2:0)),B=articulated(tail+(j+1)*car-(j<n-1?gap/2:0));
          if(coaster){const oa=(A.off+lanePx)*unit,ob=(B.off+lanePx)*unit;A.x+=A.r[0]*oa;A.y+=A.r[1]*oa;B.x+=B.r[0]*ob;B.y+=B.r[1]*ob}   // on the coaster each end on its own lane (one normal for both pulled the far end off it on curves)
          const dx=B.x-A.x,dy=B.y-A.y,dz=coaster?B.h-A.h:0,len=Math.hypot(dx,dy,dz);if(len<unit*.1)continue;
          const gl2=Math.hypot(dx,dy)||1e-12,tx=dx/gl2,ty=dy/gl2,L=len/unit,off=((A.off+B.off)/2+lanePx)*unit;
          this.cx=A.x-ty*off;this.cy=A.y+tx*off;this.tx=tx;this.ty=ty;this.length=L;this.carPx=0;
          let side=(coaster?A.r[0]*camX+A.r[1]*camY:-ty*camX+tx*camY)>=0?1:-1;
          if(coaster){const F=[dx/len,dy/len,dz/len],[R,U]=rolled(A.r,F,articulated(tail+(j+.5)*car).roll||0);   // turned over in a corkscrew, as at its middle (the ends' 2π and 0 averaged to π: upside down under the track)
            const [,U0]=rolled(A.r,F,0),hc=CORK_HEART*bodyPx*unit;   // turned about its own middle (the rails wind round the same line)
            this.fr=[A.x+(U0[0]-U[0])*hc,A.y+(U0[1]-U[1])*hc,A.h+(U0[2]-U[2])*hc,F[0],F[1],F[2],R[0],R[1],R[2],U[0],U[1],U[2]];side=R[0]*camX+R[1]*camY>=0?1:-1}
          const back=j===0,front=j===n-1,panto=/^(1호선|4호선|경의중앙선|수인분당선)$/.test(plan.t.line)&&j%3===1;
          this.kind=(front?1:0)+(back?2:0)+(panto?4:0);
          const w=bodyPx/2,nose=bodyPx*.48,a=back?nose:0,b=front?L-nose:L,low=H*.44;
          if(j&&unfold>0){this.roof(-.7*unfold,0,H-.75,H-.75,w*.62,4);if(pitched)this.wall(-.7*unfold,0,H-.75,H-.75,side*w*.62,4)}
          if(j<n-1&&unfold>0){this.roof(L,L+.7*unfold,H-.75,H-.75,w*.62,4);if(pitched)this.wall(L,L+.7*unfold,H-.75,H-.75,side*w*.62,4)}
          // Draw only the visible end and side, then cap them with the roof and raked cab glass.
          if(pitched){
            const alongCamera=tx*camX+ty*camY;
            if(alongCamera<0)this.end(0,back?w-bodyPx*.36:w,back?low:H,back?3:5);
            if(alongCamera>0&&!front)this.end(L,w,H,5);   // the leading nose slopes to the ground: no front wall
            this.wall(a,b,H,H,side*w);
            if(back)this.cabWall(false,side,H);
            if(front)this.cabWall(true,side,H,NOSE_Z);
          }
          this.roof(a,b,H,H,w);
          if(back)this.roof(0,a,low,H,w);
          if(front){this.roof(b,L,H,NOSE_Z,w);this.beam(L,w)}
        }
      }else{
        // One rigid, rounded icon. Detail uses true consist spacing, but tiny cars
        // do not split the silhouette. Use the same chord and lane rule as rigid cars.
        const dx=finish.x-start.x,dy=finish.y-start.y,len=Math.hypot(dx,dy);
        if(len<unit*.1)continue;
        const tx=dx/len,ty=dy/len,off=((start.off+finish.off)/2+lanePx)*unit;
        this.cx=start.x-ty*off;this.cy=start.y+tx*off;this.tx=tx;this.ty=ty;
        this.kind=3;this.length=len/unit;this.carPx=this.length/n;
        const L=this.length,w=bodyPx/2,nose=Math.min(bodyPx*.48,L*.24),low=H*.44;
        const side=(-ty*camX+tx*camY)>=0?1:-1;
        if(pitched){
          const alongCamera=tx*camX+ty*camY;
          if(alongCamera<0)this.end(0,w-bodyPx*.36,low,3);
          this.wall(nose,L-nose,H,H,side*w);
          this.cabWall(false,side,H);
          this.cabWall(true,side,H,NOSE_Z);
        }
        this.roof(nose,L-nose,H,H,w+MARGIN);
        this.roof(0,nose,low,H,w+MARGIN);
        this.roof(L-nose,L,H,NOSE_Z,w+MARGIN);
        this.roof(-MARGIN,0,low,low,w+MARGIN);
        this.roof(L,L+MARGIN,NOSE_Z,NOSE_Z,w+MARGIN);
        this.beam(L,w);
      }
    }
    if(this.used){
      gl.useProgram(this.p);
      const M=options.defaultProjectionData.mainMatrix,MT=this.matrix;MT.set(M);
      for(let r=0;r<4;r++)MT[12+r]=M[r]*ox+M[4+r]*oy+M[12+r]; // M · translate(origin), evaluated in double precision
      gl.uniformMatrix4fv(this.uni.u_matrix,false,MT);
      // Never write depth: the model's own faces are ordered by the painter's pass above (testing them
      // against each other flickered on phones). options.occlude (the building walls' depth is in the
      // buffer): draw what is in front of them, then what is behind at that alpha.
      gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.b);
      if(this.gpuCapacity!==this.data.length){gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);this.gpuCapacity=this.data.length}
      gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.used);
      const S=52,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off)};
      ptr('a_pos',3,0);ptr('a_local',2,12);ptr('a_info',4,20);ptr('a_color',3,36);ptr('a_face',1,48);
      gl.uniform1f(this.uni.u_glow,document.documentElement.dataset.theme==='dark'?.62:.3);gl.uniform1f(this.uni.u_time,performance.now()/1000);
      const pass=alpha=>{gl.uniform1f(this.uni.u_alpha,alpha);
        gl.uniform2f(this.uni.u_offset,sunTrainShadow[0]*unit,sunTrainShadow[1]*unit);gl.uniform1f(this.uni.u_shadow,1);gl.drawArrays(gl.TRIANGLES,0,this.used/13);
        gl.uniform2f(this.uni.u_offset,0,0);gl.uniform1f(this.uni.u_shadow,0);gl.drawArrays(gl.TRIANGLES,0,this.used/13)};
      if(options.walls){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);pass(1);if(options.occlude){gl.depthFunc(gl.GREATER);pass(options.occlude)}}   // solid buildings (the park): hidden behind them
      else{gl.disable(gl.DEPTH_TEST);pass(1)}
    }
    // moving trains, ripple or pulse: TRAIN_FPS (a followed train moves the camera: map redraws at
    // FOLLOW_FPS); trains standing at a station: once a second, to see them set off
    // following a moving train: camera, map and trains step together (followSoon), and no extra
    // train-only frames in between — they drew the train ahead of the map it sits on (jitter)
    if(animating&&following&&!easing)followSoon();
    else if(animating||rippling)trainFrameSoon(1000/TRAIN_FPS);else if(waiting)trainFrameSoon(1000);
  }
  onRemove(map,gl){gl.deleteBuffer(this.b);gl.deleteProgram(this.p)}
}

// ---- bottom sheet: station and train details slide up from the bottom of the map -------------
const sheet=document.createElement('section');sheet.className='sheet';sheet.hidden=true;sheet.setAttribute('aria-label','상세 정보');
sheet.innerHTML='<button type="button" class="sheet-grab" aria-label="닫기" title="끌어내리거나 눌러서 닫기"></button><button type="button" class="sheet-close" aria-label="닫기">✕</button><div class="sheet-body"></div><button type="button" class="sheet-follow" hidden>이 열차 따라가기</button>';
const sheetBody=sheet.querySelector('.sheet-body'),followBtn=sheet.querySelector('.sheet-follow');
let sheetToken=0,sheetTrain=null,following=null,easing=false;
function openSheet(html){sheetBody.innerHTML=html;sheet.hidden=false;sheet.style.transform='';sheet.style.transition='';requestAnimationFrame(()=>sheet.classList.add('open'));return ++sheetToken}
// 길찾기 route on the map: walking dashed, rides along the line's track, in the line's colour
function rideCoords(line,ids){
  const out=[];
  for(let i=1;i<ids.length;i++){const a=ids[i-1],b=ids[i];let c=edgeCoords(line,Math.min(a,b),Math.max(a,b));if(a>b)c=c.slice().reverse();out.push(...(out.length?c.slice(1):c))}
  return out;
}
function showRoute(plan){
  const feats=[],pts=[];
  plan.legs.forEach((l,i)=>{
    if(l.type==='walk')feats.push({type:'Feature',properties:{kind:'walk'},geometry:{type:'LineString',coordinates:l.path}});
    else if(l.type==='bus'){feats.push({type:'Feature',properties:{kind:'ride',color:l.color},geometry:{type:'LineString',coordinates:l.path}});
      for(const c of [l.path[0],l.path[l.path.length-1]])pts.push({type:'Feature',properties:{kind:'stop',color:l.color},geometry:{type:'Point',coordinates:c}})}
    else{const c=rideCoords(l.line,l.stations);feats.push({type:'Feature',properties:{kind:'ride',color:colors[l.line]||'#888'},geometry:{type:'LineString',coordinates:c}});
      // boarding and alighting where the ride is drawn from (the platform on the track), not the
      // station's centre point, which sat 50–270 m off both the ride and the exit the walk reached
      const s0=byId.get(l.stations[0]),s1=byId.get(l.stations[l.stations.length-1]);
      for(const s of [s0,s1])if(s)pts.push({type:'Feature',properties:{kind:'stop',color:colors[l.line]||'#888'},geometry:{type:'Point',coordinates:stopPos(l.line,s)}});
      // the walk ends at an exit: join it to the platform, fainter (inside the station)
      const prev=plan.legs[i-1],next=plan.legs[i+1];
      if(prev&&prev.type==='walk'&&prev.path&&s0)feats.push({type:'Feature',properties:{kind:'inside'},geometry:{type:'LineString',coordinates:[prev.path[prev.path.length-1],stopPos(l.line,s0)]}});
      if(next&&next.type==='walk'&&next.path&&s1)feats.push({type:'Feature',properties:{kind:'inside'},geometry:{type:'LineString',coordinates:[stopPos(l.line,s1),next.path[0]]}})}

  });
  const first=plan.legs[0],last=plan.legs[plan.legs.length-1];
  if(first.path)pts.push({type:'Feature',properties:{kind:'start'},geometry:{type:'Point',coordinates:first.path[0]}});
  if(last.path)pts.push({type:'Feature',properties:{kind:'end'},geometry:{type:'Point',coordinates:last.path[last.path.length-1]}});
  const data={type:'FeatureCollection',features:[...feats,...pts]};
  if(!map.getSource('journey')){
    // veil: everything under the route (base map, other lines, station names) fades back
    map.addSource('journey-veil',{type:'geojson',data:{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]]]}}});
    // under the base map's labels: the ground fades back, street and place names stay readable
    // (over everything at .68 the map around a route was too dim to read); the other lines fade
    // by their own opacity in focusRoute
    map.addLayer({id:'journey-veil',type:'fill',source:'journey-veil',paint:{'fill-color':veilColor(),'fill-opacity':.45,'fill-opacity-transition':{duration:300}}},map.getLayer('bm-label-water')?'bm-label-water':undefined);
    map.addSource('journey',{type:'geojson',data});
    map.addLayer({id:'journey-casing',type:'line',source:'journey',filter:['==',['get','kind'],'ride'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],10,6,16,14]}});
    map.addLayer({id:'journey-ride',type:'line',source:'journey',filter:['==',['get','kind'],'ride'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],10,3.5,16,9]}});
    map.addLayer({id:'journey-walk',type:'line',source:'journey',filter:['==',['get','kind'],'walk'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':walkColor(),'line-width':['interpolate',['linear'],['zoom'],10,3,16,6],'line-dasharray':[0.1,1.8]}});
    map.addLayer({id:'journey-inside',type:'line',source:'journey',filter:['==',['get','kind'],'inside'],layout:{'line-cap':'round'},paint:{'line-color':walkColor(),'line-opacity':.45,'line-width':['interpolate',['linear'],['zoom'],10,2,16,4],'line-dasharray':[0.1,2.2]}});
    map.addLayer({id:'journey-stop',type:'circle',source:'journey',filter:['==',['get','kind'],'stop'],paint:{'circle-radius':6,'circle-color':'#ffffff','circle-stroke-color':['get','color'],'circle-stroke-width':3}});
    map.addLayer({id:'journey-ends',type:'circle',source:'journey',filter:['in',['get','kind'],['literal',['start','end']]],paint:{'circle-radius':8,'circle-color':['match',['get','kind'],'start','#ffd400','#141414'],'circle-stroke-color':['match',['get','kind'],'start','#141414','#ffd400'],'circle-stroke-width':3}});
  }else map.getSource('journey').setData(data);
  focusRoute(true);
  const all=data.features.flatMap(f=>f.geometry.type==='Point'?[f.geometry.coordinates]:f.geometry.coordinates);
  routeBounds=all.length?all.reduce((bb,c)=>bb.extend(c),new maplibregl.LngLatBounds(all[0],all[0])):null;
  fitRoute(sheetPad()+30);
}
let routeBounds=null;
function fitRoute(bottom){if(routeBounds)map.fitBounds(routeBounds,{padding:{top:90,bottom,left:40,right:40},maxZoom:16,pitch:0,duration:800})}
function clearRoute(){routeBounds=null;if(map.getSource('journey'))map.getSource('journey').setData({type:'FeatureCollection',features:[]});focusRoute(false)}
const veilColor=()=>document.documentElement.dataset.theme==='dark'?'#0b0c0e':'#fbfaf4';
const walkColor=()=>document.documentElement.dataset.theme==='dark'?'#f1efe6':'#141414';
// The lines on the ground: faded under a found route; on the 롤러코스터 a faint shadow of its track (the track itself
// is not drawn zoomed out below 12.5: there they come back in full)
let routeFocus=false;
const setRouteOpacity=()=>{if(map.getLayer('routes'))map.setPaintProperty('routes','line-opacity',coaster?['interpolate',['linear'],['zoom'],12.3,routeFocus?.25:.9,12.6,routeFocus?.1:.25]:routeFocus?.25:.9)};
// route focus: veil on, trains faded, my location kept above the veil
function focusRoute(on){
  if(map.getLayer('journey-veil')){map.setLayoutProperty('journey-veil','visibility',on?'visible':'none');map.setPaintProperty('journey-veil','fill-color',veilColor());map.setPaintProperty('journey-walk','line-color',walkColor());if(map.getLayer('journey-inside'))map.setPaintProperty('journey-inside','line-color',walkColor())}
  routeFocus=on;setRouteOpacity();
  stationAlpha=on?.35:1;map.triggerRepaint();
  for(const id of ['station-labels','station-labels-more'])if(map.getLayer(id))map.setPaintProperty(id,'text-opacity',on?.35:1);
  const c=document.querySelector('.train-overlay');if(c)c.style.opacity=on?'.3':'';
  if(on)for(const id of ['me-ring','me-dot'])if(map.getLayer(id))map.moveLayer(id);
}
const journey=initJourney({openSheet,closeSheet:()=>closeSheet(),map,colors,myLocation:()=>myLocation,button:document.getElementById('routeButton'),showRoute,clearRoute});
function closeSheet(){
  if(sheet.hidden)return;
  // a field still focused keeps the keyboard up: let both go down together
  if(sheet.contains(document.activeElement))document.activeElement.blur();
  sheet.classList.remove('open');sheetToken++;sheetTrain=null;following=null;followBtn.hidden=true;
  // a chosen route stays on the map, with a bar to bring the results back (journey-ui)
  if(routeBounds&&journey.sheetClosed())fitRoute(110);
  else map.easeTo({padding:{top:0,bottom:0,left:0,right:0},duration:300});
  setTimeout(()=>{if(!sheet.classList.contains('open')){sheet.hidden=true;sheet.style.setProperty('--kb','0px');sheet.classList.remove('kb')}},340);   // after the .32s slide
}
sheet.querySelector('.sheet-close').onclick=closeSheet;
// The handle: drag the sheet down to close it (far or fast enough), or just tap it.
{const grab=sheet.querySelector('.sheet-grab');let y0=0,t0=0,dy=0,drag=false,moved=false;
  grab.addEventListener('pointerdown',e=>{if(e.button)return;drag=true;moved=false;y0=e.clientY;t0=performance.now();dy=0;grab.setPointerCapture(e.pointerId);sheet.style.transition='none'});
  grab.addEventListener('pointermove',e=>{if(!drag)return;dy=Math.max(0,e.clientY-y0);if(dy>4)moved=true;sheet.style.transform=`translateY(${dy}px)`});
  const end=()=>{if(!drag)return;drag=false;sheet.style.transition='';
    const fast=dy/Math.max(1,performance.now()-t0)>.6;
    if(moved&&(dy>Math.min(120,sheet.offsetHeight*.3)||fast&&dy>24)){sheet.style.transform='translateY(calc(105% + var(--kb,0px)))';closeSheet()}
    else sheet.style.transform=''};
  grab.addEventListener('pointerup',end);grab.addEventListener('pointercancel',end);
  grab.addEventListener('click',e=>{if(moved){e.preventDefault();moved=false;return}closeSheet()})}
// Phone keyboard: only the sheet rises above it. iOS scrolls or pans the page to show a focused field
// (header and map slide off); put the page back and lift the sheet by the keyboard's height instead.
// iOS reports the keyboard late or only once (and not at all when a still-focused field is tapped again
// after the keyboard was folded away), so while it moves the height is re-read every frame for a second.
if(window.visualViewport){const vv=visualViewport;let dropTimer=0;
  const fitKeyboard=()=>{const H=document.documentElement.clientHeight||innerHeight;   // the layout height: the keyboard does not change it
    const kb=vv.scale>1.01?0:Math.max(0,Math.round(H-vv.height-vv.offsetTop));   // pinch-zoomed is not a keyboard
    if(!sheet.classList.contains('open'))return;   // closing: keep the lift until it is gone, or it jumps as the keyboard drops
    const now=parseInt(sheet.style.getPropertyValue('--kb'))||0,put=v=>{sheet.style.setProperty('--kb',v+'px');sheet.classList.toggle('kb',v>40)};
    // up at once; down only once it holds for 250 ms — moving between 출발 and 도착 makes iOS report "no keyboard"
    // for a frame or two, and following that dropped the sheet and brought it back up from the bottom
    if(kb>=now){clearTimeout(dropTimer);dropTimer=0;if(kb!==now)put(kb)}
    else if(!dropTimer)dropTimer=setTimeout(()=>{dropTimer=0;const H2=document.documentElement.clientHeight||innerHeight;
      const k2=vv.scale>1.01?0:Math.max(0,Math.round(H2-vv.height-vv.offsetTop));if(k2<(parseInt(sheet.style.getPropertyValue('--kb'))||0))put(k2)},250);
    if(scrollY||document.documentElement.scrollTop||document.body.scrollTop){scrollTo(0,0);document.body.scrollTop=0}};
  let until=0;const settle=()=>{fitKeyboard();if(performance.now()<until)requestAnimationFrame(settle)};
  const watch=()=>{const run=performance.now()>=until;until=performance.now()+1100;if(run)requestAnimationFrame(settle)};
  vv.addEventListener('resize',watch);vv.addEventListener('scroll',watch);
  for(const ev of ['focusin','focusout','pointerup'])sheet.addEventListener(ev,e=>{if(ev!=='pointerup'||e.target.closest('input,select,textarea'))watch()});
  addEventListener('scroll',()=>{if(sheet.classList.contains('kb'))fitKeyboard()},{passive:true});
  // Tapping another field: iOS focuses it by scrolling the page to it (then the page is put back: a jump).
  // Take the tap and focus without scrolling; the sheet already sits above the keyboard, so the field is in view.
  // (Not the time chip: its tap must reach the field for the phone's clock to open.)
  let tx=0,ty=0;
  sheet.addEventListener('touchstart',e=>{const t=e.touches[0];tx=t.clientX;ty=t.clientY},{passive:true});
  sheet.addEventListener('touchend',e=>{const f=e.target.closest?.('input[type=text],input[type=search],input:not([type])');const t=e.changedTouches[0];
    if(!f||document.activeElement===f||Math.hypot(t.clientX-tx,t.clientY-ty)>10)return;
    e.preventDefault();f.focus({preventScroll:true});const n=f.value.length;try{f.setSelectionRange(n,n)}catch{};watch()},{passive:false});
  // #kbdebug: the numbers behind the keyboard lift, live, for chasing a jump on a real phone
  if(location.hash.includes('kbdebug')){const o=document.createElement('pre');o.style.cssText='position:fixed;z-index:99;left:4px;top:4px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.78);color:#ffd400;border-radius:8px;pointer-events:none;white-space:pre';document.body.append(o);
    const log=[];const snap=()=>`H ${document.documentElement.clientHeight} iH ${innerHeight}\nvv ${Math.round(vv.height)} top ${Math.round(vv.offsetTop)} s ${vv.scale.toFixed(2)}\nscrollY ${Math.round(scrollY)} kb ${sheet.style.getPropertyValue('--kb')||'-'}\nfocus ${document.activeElement?.id||document.activeElement?.tagName}`;
    const tick=()=>{o.textContent=snap()+'\n'+log.slice(-6).join('\n');requestAnimationFrame(tick)};tick();
    for(const ev of ['resize','scroll'])vv.addEventListener(ev,()=>log.push(`${(performance.now()/1e3).toFixed(2)} vv.${ev} ${Math.round(vv.height)}/${Math.round(vv.offsetTop)}`));
    addEventListener('scroll',()=>log.push(`${(performance.now()/1e3).toFixed(2)} win.scroll ${Math.round(scrollY)}`),{passive:true});
    document.addEventListener('focusin',e=>log.push(`${(performance.now()/1e3).toFixed(2)} focus ${e.target.id||e.target.tagName}`))}}
addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
// Following: the camera keeps the chosen train in the middle of the map above the sheet.
// Dragging the map stops it; the button in the sheet starts it again.
const sheetPad=()=>sheet.hidden?0:Math.min(sheet.offsetHeight,map.getContainer().clientHeight*.75);   // the 길찾기 sheet grows to 72%
function trainLngLat(plan){
  const z=map.getZoom(),unit=1/(512*2**z),q=trackPoint(plan,trainPose(plan).dist),o=(q.off+laneOffsetPx(z))*unit;
  return new maplibregl.MercatorCoordinate(q.x+q.r[0]*o,q.y+q.r[1]*o,0).toLngLat();
}
function follow(id){following=id;followBtn.hidden=true;const plan=plans.find(p=>p.id===id);if(!plan)return;
  easing=true;cam=null;map.once('moveend',()=>{easing=false;map.triggerRepaint()});
  map.easeTo({center:trainLngLat(plan),zoom:Math.max(map.getZoom(),16),padding:{top:0,bottom:sheetPad(),left:0,right:0},duration:700})}
followBtn.onclick=()=>{if(sheetTrain)follow(sheetTrain)};
// station sheet → 길찾기 from or to this station
let sheetStation=null;
sheetBody.addEventListener('click',e=>{const b=e.target.closest('.st-journey [data-end]');if(!b||!sheetStation)return;
  const st=sheetStation;journey.openWith(b.dataset.end,{name:/역$/.test(st.name)?st.name:st.name+'역',lat:st.lat,lng:st.lon})});
// Keep a followed train centred at FOLLOW_FPS (every display frame redrew the whole map at 60–120 Hz,
// hot phones), on display frames (requestAnimationFrame, not timers: even steps), camera first and
// the map with its trains drawn right after in one render. The camera eases toward the train
// (FOLLOW_EASE s) so a correction from fresh data slides instead of jumping.
const FOLLOW_EASE=.25;let followAt='',followRaf=0,followLast=0,cam=null,camAt=0;
function followSoon(){if(!followRaf)followRaf=requestAnimationFrame(followLoop)}
function followLoop(ts){followRaf=0;if(!following||easing)return;
  if(ts-followLast<1000/FOLLOW_FPS-4){followSoon();return}   // skip display frames down to FOLLOW_FPS
  followLast=ts;for(const f of animFrame)f();map.triggerRepaint()}
animFrame.push(()=>{
  const sel=following&&!easing&&sheetTrain&&plans.find(p=>p.id===sheetTrain);if(!sel)return;
  const c=trainLngLat(sel),now=performance.now();
  if(!cam||now-camAt>1000)cam={lng:c.lng,lat:c.lat};
  else{const a=1-Math.exp(-(now-camAt)/1000/FOLLOW_EASE);cam={lng:cam.lng+(c.lng-cam.lng)*a,lat:cam.lat+(c.lat-cam.lat)*a}}
  camAt=now;
  const k=`${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;if(k===followAt)return;followAt=k;
  map.jumpTo({center:cam,padding:{top:0,bottom:sheetPad(),left:0,right:0}});
});
map.on('dragstart',()=>{if(following){following=null;followBtn.hidden=!sheetTrain}});

// ---- train inspector ----------------------------------------------------------------------
// Click a train (or its tag): show the raw live-feed record next to what the map is doing with it.
function trainState(plan){
  let el=age(plan.t.receivedAt)+plan.lead,ph=plan.phases[plan.phases.length-1],idx=plan.phases.length-1;
  for(let i=0;i<plan.phases.length;i++){const x=plan.phases[i];if(el<x.dur){ph=x;idx=i;break}el-=x.dur}
  if(ph.dur===Infinity)return `${ph.to.name}에서 대기 (예측 끝 · 다음 데이터 대기)`;
  const left=Math.max(0,ph.dur-el);
  if(ph.k0===ph.k1)return `${ph.k0===0?ph.from.name:ph.to.name} 정차 중 · 출발까지 ${Math.round(left)}초`;
  const k=ph.k0+(ph.k1-ph.k0)*Math.min(1,el/ph.dur);
  return `${ph.from.name} → ${ph.to.name} 주행 중 · ${Math.round(k*100)}% · 도착까지 ${Math.round(left)}초 (구간 ${Math.round((ph.k1-ph.k0)?ph.dur/(ph.k1-ph.k0):ph.dur)}초)`;
}
// The same phase lookup as trainState, worded for riders.
function riderState(plan){
  // held after fresh data (replacePlans): say where it is drawn, not where the new prediction has it
  if(trainPose(plan).moving===false&&plan.hold!=null){const i=plan.cum.findIndex(c=>Math.abs(c-plan.hold)<1e-9);if(i>=0)return `${plan.seq[i].name}역에 정차 중`}
  let el=age(plan.t.receivedAt)+plan.lead,ph=plan.phases[plan.phases.length-1];
  for(const x of plan.phases){if(el<x.dur){ph=x;break}el-=x.dur}
  if(ph.dur===Infinity)return `${ph.to.name}역에 있어요`;
  const left=Math.max(0,ph.dur-el),when=left<60?`${Math.round(left/10)*10}초`:`${Math.round(left/60)}분`;
  if(ph.k0===ph.k1)return `${ph.k0===0?ph.from.name:ph.to.name}역에 정차 중`;
  return left<10?`${ph.from.name} → ${ph.to.name} · 곧 도착`:`${ph.from.name} → ${ph.to.name} · 약 ${when} 뒤 도착`;
}
function trainSheetHTML(plan){
  const t=plan.t,c=colors[t.line];
  const badges=[t.express?'<span class="b ex">급행</span>':'',t.last?'<span class="b last">막차</span>':''].join('');
  return `<div class="train-inspect" style="--c:${c}">
  <div class="tp-line"><span class="dot"></span>${esc(t.line)}<span class="no">${esc(t.trainNo)}</span>${badges}</div>
  <div class="tp-dest">${esc(destLabel(t)||'행선지 정보 없음')}</div>
  <div class="tp-now">${esc(riderState(plan))}</div>
  <div class="sec">서울시 실시간 원본</div>
  <dl class="kv">${rawFeedHTML(t)}</dl></div>`;
}
function rawFeedHTML(t){
  const a=Math.round(age(t.receivedAt)),kst=v=>v?new Date(v).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'-',kv=(k,v)=>`<dt>${k}</dt><dd>${v}</dd>`;
  return `${kv('역',esc(t.station))}${kv('상태',esc(t.status))}${kv('방향',esc(t.direction))}${kv('행선지',esc(t.destination||'-'))}
  ${kv('기록 시각',`${esc(String(t.receivedAt||'-').slice(11))} <span class="muted">(${a}초 전)</span>`)}${kv('받은 시각',kst(liveFetchedAt))}`;
}
function showTrainPopup(plan){
  const token=openSheet(trainSheetHTML(plan));sheetTrain=plan.id;
  requestAnimationFrame(()=>follow(plan.id));
  // keep the status line current while this train's sheet is open (plans are rebuilt on each feed update)
  const timer=setInterval(()=>{
    if(token!==sheetToken)return clearInterval(timer);
    const pl=plans.find(p=>p.id===sheetTrain);if(!pl)return;
    const now=sheetBody.querySelector('.tp-now'),dest=sheetBody.querySelector('.tp-dest');
    if(now)now.textContent=riderState(pl);if(dest)dest.textContent=destLabel(pl.t)||'행선지 정보 없음';
    // the raw record too: plan.t is replaced on every feed update, and the "N초 전" age ticks
    const raw=sheetBody.querySelector('.train-inspect .kv'),h=rawFeedHTML(pl.t);if(raw&&raw.innerHTML!==h)raw.innerHTML=h;
  },1000);
}
document.head.insertAdjacentHTML('beforeend','<style>.train-inspect{min-width:190px}.train-inspect .tp-line{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--c)}.train-inspect .tp-line .dot{width:9px;height:9px;border-radius:50%;background:var(--c)}.train-inspect .tp-line .no{color:#7a8a90;font-weight:600;font-variant-numeric:tabular-nums}.train-inspect .b{font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;color:#fff;background:var(--c)}.train-inspect .b.last{background:#141414}.train-inspect .tp-dest{font-size:20px;font-weight:800;margin:4px 0 2px;letter-spacing:-.01em}.train-inspect .tp-now{font-size:12px;color:#6b7b80}.train-inspect details{margin-top:8px;font-size:12px}.train-inspect summary{cursor:pointer;color:#8a979b;font-weight:600}.train-inspect table{border-collapse:collapse;font-size:12px;margin-top:4px}.train-inspect th{text-align:left;color:#6b7b80;font-weight:600;padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top}.train-inspect td{padding:2px 0}.train-inspect .sec{padding-top:8px;font-weight:800;color:#172429;border-bottom:1px solid #dbe1e2}.train-inspect .muted{color:#8a979b}</style>');
// Nearest train to a screen point (distance to the train's head–tail segment), within ~14 px.
function pickTrain(point){
  if(!trainsEnabled||!liveOn)return null;
  const unit=1/(512*2**map.getZoom());let best=null;
  for(const plan of plans){
    const pose=trainPose(plan),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits(),half=Math.max(plan.cars*plan.carMetres*m,TRAIN_MIN_PX*unit)/2;
    const lane=laneOffsetPx(map.getZoom()),P=d=>{const q=trackPoint(plan,d),o=(q.off+lane)*unit;return map.project(new maplibregl.MercatorCoordinate(q.x+q.r[0]*o,q.y+q.r[1]*o,0).toLngLat())};
    const A=P(pose.dist-half),B=P(pose.dist+half),dx=B.x-A.x,dy=B.y-A.y,l2=dx*dx+dy*dy||1,u=Math.max(0,Math.min(1,((point.x-A.x)*dx+(point.y-A.y)*dy)/l2));
    const d=Math.hypot(point.x-(A.x+dx*u),point.y-(A.y+dy*u));
    if(d<14&&(!best||d<best.d))best={plan,d};
  }
  return best&&best.plan;
}

// ---- live-data notice: a strip over the map when the feed fails or goes stale -----------------
const liveNotice=document.createElement('div');liveNotice.className='live-notice';liveNotice.hidden=true;liveNotice.setAttribute('role','status');
document.head.insertAdjacentHTML('beforeend','<style>.live-notice{position:absolute;z-index:6;left:50%;top:12px;transform:translateX(-50%);max-width:calc(100% - 120px);padding:8px 12px;border-radius:8px;background:#fff6e0;color:#6b4a00;border:1px solid #f0cf7a;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.12)}html[data-theme=dark] .live-notice{background:#3a2f12;color:#f4dc9a;border-color:#6d5620}</style>');
function updateLiveNotice(msg){
  // also flag data that stopped updating (no fresh fetch for 3 minutes while trains are shown)
  if(!msg&&liveFetchedAt&&liveOn&&Date.now()-new Date(liveFetchedAt).getTime()>180000)msg=`실시간 정보가 ${new Date(liveFetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})} 이후 갱신되지 않았어요.`;
  liveNotice.textContent=msg||'';liveNotice.hidden=!msg||!liveOn;
}
setInterval(()=>updateLiveNotice(liveNotice.hidden?null:liveNotice.textContent),30000);

// ---- station popup: upcoming trains -----------------------------------------------------------
// From the proxy's arrivals index (the same cached all-lines call): per line and direction, the next
// two trains, counting down from the time each row was recorded.
function arrivalText(a){
  if(a.eta>0){const left=Math.max(0,a.eta-age(a.receivedAt));return left<60?'곧 도착':`${Math.floor(left/60)}분 후`}
  return a.message.replace(/\[(\d+)\]번째 전역/,'$1번째 전역')||'-';
}
function arrivalRank(a){if(a.eta>0)return Math.max(0,a.eta-age(a.receivedAt));const m=a.message;if(/도착|진입/.test(m)&&!/전역/.test(m))return 0;const n=+(m.match(/\[(\d+)\]/)||[])[1];return n?n*120:/전역/.test(m)?90:600}
function exitList(st){
  const list=exits[st.id];if(!list||!list.length)return '';
  const seen=new Set(),items=list.filter(e=>!seen.has(e[2])&&seen.add(e[2]));
  return `<div class="exits">${items.map(([,,ref,wc])=>`<span class="exit" title="${esc(ref)}번 출구${wc===1?' · 휠체어 가능':''}">${esc(ref)}${wc===1?'<i>♿</i>':''}</span>`).join('')}</div>`;
}
async function showStationPopup(st,lngLat){
  if(!st)return;
  following=null;sheetTrain=null;followBtn.hidden=true;
  const lineChips=st.lines.map(x=>`<span class="chip" style="--c:${colors[x.name]||'#52646a'}"><span class="dot"></span>${esc(x.name)}</span>`).join('');
  sheetStation=st;
  const journeyHere='<div class="st-journey"><button type="button" data-end="from">여기서 출발</button><button type="button" data-end="to">여기로 도착</button></div>';
  const head=sub=>`<div class="tp-line">${lineChips}</div><div class="tp-dest">${esc(st.name)}</div><div class="tp-now">${sub}</div>${journeyHere}`;
  const html=d=>{
    const groups=new Map();
    for(const a of (d.arrivals||[])){const k=`${a.line}|${a.direction}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a)}
    const lines=st.lines.map(x=>x.name),order=[...groups.keys()].sort((x,y)=>lines.indexOf(x.split('|')[0])-lines.indexOf(y.split('|')[0])||x.localeCompare(y,'ko'));
    const cards=order.map(k=>{const [line,dir]=k.split('|'),list=groups.get(k).sort((a,b)=>arrivalRank(a)-arrivalRank(b)).slice(0,2);
      const toward=(list[0].heading.split('-')[1]||'').trim();
      return `<div class="arr" style="--c:${colors[line]||'#52646a'}"><div class="arr-h"><span class="dot"></span>${esc(line)} <span class="muted">${esc(dir)}${toward?' · '+esc(toward):''}</span></div>
        ${list.map(a=>`<div class="arr-t"><b>${esc(arrivalText(a))}</b><span class="muted">${esc(a.destination)}행${a.express?' · 급행':''}${a.last?' · 막차':''}</span></div>`).join('')}</div>`}).join('');
    const ex=exitList(st);
    return (`<div class="train-inspect station-sheet">${head(`서울시 실시간 도착정보 · ${new Date(d.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})} 기준`)}
      <div class="sec">곧 오는 열차</div>${cards?`<div class="arrs">${cards}</div>`:'<div class="muted empty">지금 도착 예정 열차 정보가 없어요.</div>'}
      ${ex?`<div class="sec">출구</div>${ex}`:''}</div>`);
  };
  const failed=`<div class="train-inspect station-sheet">${head('도착 정보를 불러오지 못했어요. 잠시 후 다시 눌러 주세요.')}</div>`;
  // Open once the arrivals are in, so the sheet rises at its real height instead of jumping from one line.
  // Past 0.7 s it opens anyway, on rows shaped like the ones coming, and fills them when they land.
  const seq=++stationSeq;
  let d=null,err=false;
  const settled=fetch(`./api/live?arrivals=${encodeURIComponent(st.name.replace(/\([^)]*\)/g,''))}`,{cache:'no-store'})
    .then(async r=>{const x=await r.json();if(!r.ok||!x.ok)throw Error();d=x},()=>{err=true});
  await Promise.race([settled,new Promise(r=>setTimeout(r,700))]);
  if(seq!==stationSeq)return;   // another station was tapped meanwhile
  const skeleton=`<div class="train-inspect station-sheet">${head('도착 정보 불러오는 중…')}<div class="sec">곧 오는 열차</div><div class="arrs st-sk" aria-hidden="true">${'<div class="arr"><i></i><i></i><i></i></div>'.repeat(Math.min(4,Math.max(2,st.lines.length*2)))}</div></div>`;
  const token=openSheet(d?html(d):err?failed:skeleton);
  const put=h=>{if(token===sheetToken)sheetBody.innerHTML=h};
  if(!d&&!err){await settled;put(d?html(d):failed)}
  if(d){const timer=setInterval(()=>{if(token!==sheetToken)return clearInterval(timer);put(html(d))},15000)}
}
let stationSeq=0;
document.head.insertAdjacentHTML('beforeend','<style>.station-pop table{border-collapse:collapse;font-size:12px;margin-top:6px;width:100%}.station-pop th{text-align:left;font-weight:700;padding:5px 10px 5px 0;vertical-align:top;white-space:nowrap}.station-pop td{padding:5px 0}.station-pop td div+div{margin-top:2px}.station-pop tr+tr th,.station-pop tr+tr td{border-top:1px solid rgba(120,140,150,.2)}.station-pop .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);margin-right:5px}.station-pop .muted{color:#7a8a90;font-weight:500}.station-pop .foot{margin-top:8px;font-size:11px}.station-pop .exits{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(120,140,150,.2)}.station-pop .exits .muted{margin-right:4px;font-size:12px}.station-pop .exit{min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ffd200;color:#1d1d1d;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:1px}.station-pop .exit i{font-style:normal;font-size:10px}</style>');

// ---- station labels (DOM markers with box collision) --------------------------------
let labelFrame=0;
// Station names sit inside the platform rectangle, turned along it. Where the name is longer than
// the platform on screen, its box (same outline and fill) extends past it so the text still fits.
// They are drawn by a WebGL layer placed *below* the trains, so a train at a station stays visible.
const measure=(()=>{const c=document.createElement('canvas').getContext('2d'),cache=new Map();return (t,px)=>{const k=px.toFixed(1)+t;let w=cache.get(k);if(w==null){c.font=`700 ${px}px "Noto Sans KR",sans-serif`;w=c.measureText(t).width;cache.set(k,w)}return w}})();
// Screen-space placement of every visible name box (collision-culled), recomputed each frame.
const hexRGB3=v=>[parseInt(v.slice(1,3),16)/255,parseInt(v.slice(3,5),16)/255,parseInt(v.slice(5,7),16)/255];
const NAME_PX=40,NAME_ROW=50;   // atlas: each name rendered once at 40 px in a 50 px row
// 3D building walls, depth only, for the train canvas: trains behind a building show through it
// as they did when drawn inside the map. Walls alone suffice for things on the ground outside the
// footprints (a ray through a building always crosses one); walls along tile edges lie inside
// the building, so they hide nothing it would not.
const BLD_VS=`#version 300 es
in vec3 a_pos;uniform mat4 u_matrix;uniform float u_h;
void main(){gl_Position=u_matrix*vec4(a_pos.xy,a_pos.z*u_h,1.);}`;
const BLD_FS=`#version 300 es
precision mediump float;out vec4 o;void main(){o=vec4(0.);}`;
class BuildingDepth{
  constructor(gl){
    const sh=(t,src)=>{const x=gl.createShader(t);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,BLD_VS));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,BLD_FS));gl.linkProgram(this.p);
    this.a=gl.getAttribLocation(this.p,'a_pos');this.um=gl.getUniformLocation(this.p,'u_matrix');this.uh=gl.getUniformLocation(this.p,'u_h');
    this.b=gl.createBuffer();this.n=0;this.gl=gl;this.M=new Float32Array(16);
  }
  shown(){const z=map.getZoom();return z>=(PHONE?15:14)&&map.getLayer('bm-bld3d')&&map.getLayoutProperty('bm-bld3d','visibility')!=='none'}
  rebuild(){
    this.n=0;if(!this.shown())return;
    const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),mpu=O.meterInMercatorCoordinateUnits(),out=[];this.ox=O.x;this.oy=O.y;
    const X=l=>(l+180)/360-O.x,Y=a=>(180-180/Math.PI*Math.log(Math.tan(Math.PI/4+a*Math.PI/360)))/360-O.y;
    for(const f of map.querySourceFeatures('ofm',{sourceLayer:'building'})){
      const g=f.geometry,top=(f.properties.render_height??10)*mpu,base=(f.properties.render_min_height??0)*mpu;if(top<=base||coaster&&top>=RIDE_H*mpu)continue;
      for(const poly of g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[])for(const ring of poly)
        for(let i=0;i+1<ring.length;i++){const x0=X(ring[i][0]),y0=Y(ring[i][1]),x1=X(ring[i+1][0]),y1=Y(ring[i+1][1]);
          out.push(x0,y0,base,x1,y1,base,x1,y1,top,x0,y0,base,x1,y1,top,x0,y0,top)}
    }
    const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(out),gl.STATIC_DRAW);this.n=out.length/3;
  }
  // depth of the walls into the buffer; returns whether anything was drawn
  draw(M){
    if(!this.n||!this.shown())return false;
    const gl=this.gl,MT=this.M;MT.set(M);for(let r=0;r<4;r++)MT[12+r]=M[r]*this.ox+M[4+r]*this.oy+M[12+r];
    gl.useProgram(this.p);gl.uniformMatrix4fv(this.um,false,MT);gl.uniform1f(this.uh,Math.max(0,Math.min(1,map.getZoom()-14)));   // the map grows buildings in over z14–15
    gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.enableVertexAttribArray(this.a);gl.vertexAttribPointer(this.a,3,gl.FLOAT,false,12,0);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.depthMask(true);gl.colorMask(false,false,false,false);gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES,0,this.n);gl.colorMask(true,true,true,true);gl.disableVertexAttribArray(this.a);
    return true;
  }
}
class StationNameLayer{
  constructor(){this.id='station-names';this.type='custom';this.renderingMode='2d';this.atlasKey=''}
  onAdd(map,gl){
    this.map=map;
    const vs=`#version 300 es
in vec2 a_px;in vec2 a_local;in vec2 a_size;in vec4 a_uv;in vec3 a_color;in vec2 a_tw;
uniform mat4 u_matrix;out vec2 v_local;out vec2 v_size;out vec4 v_uv;out vec3 v_color;out vec2 v_tw;
// a_px: mercator position relative to the view centre (drawn on the ground, so pitch and bearing apply)
void main(){v_local=a_local;v_size=a_size;v_uv=a_uv;v_color=a_color;v_tw=a_tw;gl_Position=u_matrix*vec4(a_px,0.,1.);}`;
    const fs=`#version 300 es
precision highp float;in vec2 v_local;in vec2 v_size;in vec4 v_uv;in vec3 v_color;in vec2 v_tw;uniform sampler2D u_tex;uniform float u_dpr;uniform float u_dark;uniform float u_alpha;out vec4 o;
void main(){
  // v_tw.x: >0 name cell, 0 box, -1 exit passage (solid line colour), -3 its white casing, -2 soft shadow (size includes 6px blur)
  if(v_tw.x<-1.5){vec2 hs=v_size*.5-6.,q=abs(v_local)-(hs-min(hs.y,hs.x));float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-min(hs.y,hs.x);
    float a=(1.-smoothstep(-2.,6.,sd))*mix(.16,.4,u_dark);if(a<=0.)discard;o=vec4(0.,0.,0.,a)*u_alpha;return;}
  if(v_tw.x<-.5){vec2 hs=v_size*.5,q=abs(v_local)-(hs-hs.y);float sd=length(max(q,0.))-hs.y+min(max(q.x,q.y),0.),aa=max(fwidth(sd),1e-3),c=clamp(.5-sd/aa,0.,1.);if(c<=0.)discard;
    vec3 col=v_tw.x<-2.5?mix(vec3(1.),vec3(.12,.17,.2),u_dark):v_color;o=vec4(col*c,c)*u_alpha;return;}
  // rounded rectangle: white fill, line-colour border, dark name
  float r=abs(v_size.x-v_size.y)<.5?v_size.x*.5:min(v_size.y*(v_tw.x>0.?.32:.12),v_size.x*.5),border=(abs(v_size.x-v_size.y)<.5?1.8:2.2)*u_dpr;   // square box → dot
  vec2 q=abs(v_local)-(v_size*.5-r);float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-r;
  float aa=max(fwidth(sd),1e-3),cover=clamp(.5-sd/aa,0.,1.);if(cover<=0.)discard;
  vec3 fill=mix(vec3(1.),vec3(.12,.17,.2),u_dark),ink=mix(vec3(.11,.17,.19),vec3(.93,.96,.97),u_dark);   // dark mode: dark box, light name
  vec3 col=v_tw.x>0.?mix(fill,v_color,smoothstep(-border-aa,-border+aa,sd)):v_color;   // platform: solid line colour, set into the map
  if(v_tw.x>0.){vec2 t=(v_local+v_tw*.5)/v_tw;   // v_tw = text cell size (width, font × row ratio)
    if(t.x>0.&&t.x<1.&&t.y>0.&&t.y<1.){float a=texture(u_tex,vec2(mix(v_uv.x,v_uv.z,t.x),mix(v_uv.y,v_uv.w,t.y))).a;col=mix(col,ink,a);}}
  o=vec4(col*cover,cover)*u_alpha;   // premultiplied; faded behind a 길찾기 route
}`;
    const sh=(type,src)=>{const x=gl.createShader(type);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.p);
    if(!gl.getProgramParameter(this.p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.p));
    this.b=gl.createBuffer();this.tex=gl.createTexture();
    this.attr=Object.fromEntries(['a_px','a_local','a_size','a_uv','a_color','a_tw'].map(n=>[n,gl.getAttribLocation(this.p,n)]));
    this.uni=Object.fromEntries(['u_matrix','u_tex','u_dpr','u_dark','u_alpha'].map(n=>[n,gl.getUniformLocation(this.p,n)]));
  }
  buildAtlas(gl){
    const texts=[...new Set(labels.map(l=>l.text))],key=texts.join('|');if(key===this.atlasKey)return;this.atlasKey=key;
    const c=document.createElement('canvas'),ctx=c.getContext('2d'),W=2048;ctx.font=`700 ${NAME_PX}px "Noto Sans KR",sans-serif`;
    let x=0,y=0;const pos=new Map();
    for(const t of texts){const w=Math.ceil(ctx.measureText(t).width)+4;if(x+w>W){x=0;y+=NAME_ROW}pos.set(t,[x,y,w]);x+=w}
    c.width=W;c.height=Math.max(NAME_ROW,y+NAME_ROW);ctx.font=`700 ${NAME_PX}px "Noto Sans KR",sans-serif`;ctx.textBaseline='middle';ctx.fillStyle='#000';
    for(const [t,[px,py]] of pos)ctx.fillText(t,px+2,py+NAME_ROW/2);
    this.uv=new Map([...pos].map(([t,[px,py,w]])=>[t,[px/W,py/c.height,(px+w)/W,(py+NAME_ROW)/c.height,(w-4)/NAME_PX]]));
    gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  render(gl,options){
    if(!stationRects.size)return;
    this.buildAtlas(gl);
    const z=map.getZoom(),unit=1/(512*2**z),data=[],hgt=stationWidthPx(z);
    const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),ox=O.x,oy=O.y;
    // a box on the ground: centre (mercator), unit axis, length/height in CSS px at this zoom
    const quad=(cx,cy,ax,ay,bw,h,uv,col,tw,th)=>{const nx=-ay,ny=ax,hw=bw/2,hh=h/2;
      const corner=(lx,ly)=>[cx-ox+(ax*lx+nx*ly)*unit,cy-oy+(ay*lx+ny*ly)*unit,lx,ly,bw,h,uv[0],uv[1],uv[2],uv[3],...col,tw,th];
      const q=[corner(-hw,-hh),corner(hw,-hh),corner(hw,hh),corner(-hw,hh)];for(const i of [0,1,2,0,2,3])data.push(...q[i])};
    // zoomed out (phone ≤ 12, desktop ≤ 13): each platform is just a dot, no names
    const pointsOnly=z<=(matchMedia('(max-width:720px),(pointer:coarse)').matches?12:13),dot=Math.max(7,Math.min(10,hgt*.55));
    const b=map.getBounds(),lo=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),hi=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast()),pad=(hi.x-lo.x)*.2;
    const geo=new Map();   // rect key → ground placement, reused for its name
    for(const [k,r] of stationRects){
      const line=k.slice(0,k.lastIndexOf(':'));if(selected!=='all'&&line!==selected)continue;
      const m0=maplibregl.MercatorCoordinate.fromLngLat(r.coords[0]),m1=maplibregl.MercatorCoordinate.fromLngLat(r.coords[r.coords.length-1]);
      let ax=m1.x-m0.x,ay=m1.y-m0.y;const lenU=Math.hypot(ax,ay)||1e-12;ax/=lenU;ay/=lenU;
      const cx=(m0.x+m1.x)/2-ay*r.offset*unit,cy=(m0.y+m1.y)/2+ax*r.offset*unit;   // line-offset: right of drawing direction
      if(cx<lo.x-pad||cx>hi.x+pad||cy>lo.y+pad||cy<hi.y-pad)continue;
      const col=hexRGB3(colors[line]||'#52646a'),h=platformPx(r,hgt)*PLATFORM_SCALE,len=lenU/unit;
      // names read left→right on screen: flip the axis when it points leftward
      const p0=map.project(r.coords[0]),p1=map.project(r.coords[r.coords.length-1]),flip=p1.x<p0.x?-1:1;
      geo.set(k,{cx,cy,ax:ax*flip,ay:ay*flip,len,h,col,id:k.slice(k.lastIndexOf(':')+1)});
    }
    // zoom 16+: each exit hangs off its station by a short passage (drawn first, so the box covers its root)
    if(!pointsOnly&&z>=EXIT_MINZOOM){
      const byStation=new Map();for(const g of geo.values()){if(!byStation.has(g.id))byStation.set(g.id,[]);byStation.get(g.id).push(g)}
      const w=Math.max(3,Math.min(5,hgt*.18)),pass=[];
      for(const [id,boxes] of byStation)for(const [lon,lat] of exits[id]||[]){
        const e=maplibregl.MercatorCoordinate.fromLngLat([lon,lat]);let best=null;
        for(const g of boxes){   // nearest point on the box's centre line (its rounded ends excluded)
          const rx=(e.x-g.cx)/unit,ry=(e.y-g.cy)/unit,half=Math.max(0,(Math.max(g.len,g.h)-g.h)/2),t=Math.max(-half,Math.min(half,rx*g.ax+ry*g.ay));
          const sx=g.cx+g.ax*t*unit,sy=g.cy+g.ay*t*unit,d=Math.hypot(e.x-sx,e.y-sy)/unit;if(!best||d<best.d)best={sx,sy,d,g}}
        if(best)exitCol.set(lon+','+lat,best.g.col);
        if(!best||best.d*unit*40075016.686*Math.cos(lat*Math.PI/180)>EXIT_MAX_M||best.d<best.g.h/2)continue;   // too far to be this station's, or inside the box
        // past the box's end: the concourse runs on along the box's axis and the exit branches off it square
        const g=best.g,t=((e.x-g.cx)*g.ax+(e.y-g.cy)*g.ay)/unit,half=Math.max(0,(Math.max(g.len,g.h)-g.h)/2);
        if(Math.abs(t)>half){const side=t>0?1:-1;g.trunk=g.trunk||{};g.trunk[side]=Math.max(g.trunk[side]||half,Math.abs(t))}
        const sx=g.cx+g.ax*t*unit,sy=g.cy+g.ay*t*unit,d=Math.hypot(e.x-sx,e.y-sy)/unit;if(d<g.h/2)continue;
        pass.push([(sx+e.x)/2,(sy+e.y)/2,(e.x-sx)/unit/d,(e.y-sy)/unit/d,d+w,w,g.col]);
      }
      for(const g of geo.values())for(const [side,far] of Object.entries(g.trunk||{})){const half=Math.max(0,(Math.max(g.len,g.h)-g.h)/2),m=(half+far)/2*side;
        pass.unshift([g.cx+g.ax*m*unit,g.cy+g.ay*m*unit,g.ax*side,g.ay*side,far-half+w,w,g.col]);delete g.trunk}   // the concourse the exits share
      for(const [cx,cy,ux,uy,l,ww,col] of pass)quad(cx,cy,ux,uy,l+3,ww+3,[0,0,0,0],col,-3,0);   // white casing
      for(const [cx,cy,ux,uy,l,ww,col] of pass)quad(cx,cy,ux,uy,l,ww,[0,0,0,0],col,-1,0);       // passage: a thin line in the station's line colour
    }
    for(const g of geo.values()){
      if(pointsOnly){quad(g.cx,g.cy,1,0,dot,dot,[0,0,0,0],g.col,0,0);continue}
      quad(g.cx,g.cy,g.ax,g.ay,Math.max(g.len,g.h),g.h,[0,0,0,0],g.col,0,0);   // one bar: platform and passages out to the exits
    }
    if(!data.length)return;
    const M=options.defaultProjectionData.mainMatrix,MT=Array.from(M);for(let r=0;r<4;r++)MT[12+r]=M[r]*ox+M[4+r]*oy+M[12+r];
    gl.useProgram(this.p);gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
    const S=15*4,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off*4)};
    ptr('a_px',2,0);ptr('a_local',2,2);ptr('a_size',2,4);ptr('a_uv',4,6);ptr('a_color',3,10);ptr('a_tw',2,13);
    gl.uniformMatrix4fv(this.uni.u_matrix,false,new Float32Array(MT));gl.uniform1f(this.uni.u_dpr,1);gl.uniform1f(this.uni.u_dark,document.documentElement.dataset.theme==='dark'?1:0);gl.uniform1f(this.uni.u_alpha,stationAlpha);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(this.uni.u_tex,0);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES,0,data.length/15);
  }
}
// Exit pillars (zoom 16+), drawn on the train canvas above the trains: a square column standing on the exit,
// painted grey with a band of its line's colour round the top and the exit number in yellow, like real entrance pillars.
// The box is built in map space, so it leans with the tilt and turns with the bearing; only the sides facing
// the viewer are drawn, lit from the south-west. Seen from straight above, the number moves onto the cap.
const PILLAR_PX=[[16,7,20],[18,12,36]];   // [zoom, side, height] in screen px
// segs: [from, to (share of the height), colour (an [r,g,b], or 1: the line's), number on it]
// segs: [from, to (share of the height), colour (an [r,g,b], 1: the line's, 'grey': the theme's), number on it]
// grey: a slightly dark grey by day; lighter at night so the pillar stands off the dark map
const PILLAR_STYLE={ink:[1,.83,0],cap:1,grey:{light:[.4,.42,.44],dark:[.56,.59,.62]},segs:[[0,.46,'grey'],[.46,.84,'grey',1],[.84,1,1]]};
class ExitPillars{
  init(gl){
    const vs=`#version 300 es
in vec3 a_pos;in vec2 a_local;in vec3 a_col;in vec3 a_ink;in vec4 a_glyph;in vec4 a_guv;in float a_mode;uniform vec2 u_view;
out vec2 v_local;out vec3 v_col;out vec3 v_ink;flat out vec4 v_glyph;flat out vec4 v_guv;out float v_mode;
void main(){v_local=a_local;v_col=a_col;v_ink=a_ink;v_glyph=a_glyph;v_guv=a_guv;v_mode=a_mode;gl_Position=vec4(a_pos.xy/u_view*vec2(2.,-2.)+vec2(-1.,1.),a_pos.z,1.);}`;   // z: its depth, for the solid park buildings
    const fs=`#version 300 es
precision highp float;in vec2 v_local;in vec3 v_col;in vec3 v_ink;flat in vec4 v_glyph;flat in vec4 v_guv;in float v_mode;uniform sampler2D u_tex;out vec4 o;
void main(){
  if(v_mode<.5){float d=length(v_local);float a=(1.-smoothstep(.15,1.,d))*.3;if(a<=0.)discard;o=vec4(0.,0.,0.,a);return;}   // ground shadow
  vec3 col=v_col;
  if(v_mode>1.5){vec2 q=(v_local-v_glyph.xy)/(v_glyph.zw-v_glyph.xy);   // the number, printed on this face
    if(all(greaterThanEqual(q,vec2(0.)))&&all(lessThanEqual(q,vec2(1.)))){float a=texture(u_tex,mix(v_guv.xy,v_guv.zw,vec2(q.x,1.-q.y))).a;col=mix(col,v_ink,a);}}
  o=vec4(col,1.);
}`;
    const sh=(t,src)=>{const x=gl.createShader(t);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.p);
    this.attr=Object.fromEntries(['a_pos','a_local','a_col','a_ink','a_glyph','a_guv','a_mode'].map(n=>[n,gl.getAttribLocation(this.p,n)]));
    this.uView=gl.getUniformLocation(this.p,'u_view');this.uTex=gl.getUniformLocation(this.p,'u_tex');
    this.b=gl.createBuffer();this.tex=gl.createTexture();this.gl=gl;this.key='';
  }
  // number atlas: each exit ref once, bold, on a row of the texture
  atlas(){
    const refs=[...new Set(Object.values(exits).flatMap(l=>l.map(e=>String(e[2]))))].sort(),key=refs.join('|');if(key===this.key)return;this.key=key;
    const F=26,ROW=30,W=1024,c=document.createElement('canvas'),x=c.getContext('2d');x.font=`800 ${F}px "Noto Sans KR",system-ui,sans-serif`;
    let px=0,py=0;const pos=new Map();
    for(const r of refs){const w=Math.ceil(x.measureText(r).width)+4;if(px+w>W){px=0;py+=ROW}pos.set(r,[px,py,w]);px+=w}
    c.width=W;c.height=py+ROW;x.font=`800 ${F}px "Noto Sans KR",system-ui,sans-serif`;x.textBaseline='middle';x.textAlign='center';x.fillStyle='#000';
    for(const [r,[a,b,w]] of pos)x.fillText(r,a+w/2,b+ROW/2+1);
    this.uv=new Map([...pos].map(([r,[a,b,w]])=>[r,[a/W,b/c.height,(a+w)/W,(b+ROW)/c.height,w/ROW]]));
    const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);   // no mipmaps: they blur the digits' strokes into outlines
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  render(gl,M,W,H,dpr,solid=false){
    const z=map.getZoom();if(z<EXIT_MINZOOM||!Object.keys(exits).length)return;
    if(!this.p)this.init(gl);this.atlas();
    const unit=1/(512*2**z),f=Math.max(0,Math.min(1,(z-PILLAR_PX[0][0])/(PILLAR_PX[1][0]-PILLAR_PX[0][0]))),lerp=i=>PILLAR_PX[0][i]+(PILLAR_PX[1][i]-PILLAR_PX[0][i])*f;
    const sPx=lerp(1),half=sPx/2*unit,hgt=lerp(2)*unit,St=PILLAR_STYLE,grey=St.grey[document.documentElement.dataset.theme==='dark'?'dark':'light'],onTop=map.getPitch()<30;
    const proj=(x,y,zz)=>{const X=M[0]*x+M[4]*y+M[8]*zz+M[12],Y=M[1]*x+M[5]*y+M[9]*zz+M[13],Z=M[2]*x+M[6]*y+M[10]*zz+M[14],Wc=M[3]*x+M[7]*y+M[11]*zz+M[15];return Wc<=0?null:[(X/Wc+1)/2*W,(1-Y/Wc)/2*H,Z/Wc]};
    const data=[],NO=[0,0,0,0],vert=(p,l,col,ink,g,guv,mode)=>data.push(p[0],p[1],p[2]??0,l[0],l[1],...col,...ink,...g,...guv,mode);
    const quad=(P,Lc,col,ink,g,guv,mode)=>{for(const i of [0,1,2,0,2,3])vert(P[i],Lc[i],col,ink,g,guv,mode)};
    const LOC=[[0,0],[1,0],[1,1],[0,1]],mul=(c,k)=>c.map(v=>v*k);
    // where the number sits on a face of w×h screen px (local 0..1 across, 0..1 up)
    const glyph=(uv,w,h,fill=.8)=>{let gh=h*fill,gw=gh*uv[4];if(gw>w*.92){gh*=w*.92/gw;gw=w*.92}return [.5-gw/w/2,.5-gh/h/2,.5+gw/w/2,.5+gh/h/2]};
    const ids=new Set(selected==='all'?Object.keys(exits):stations.filter(s=>s.lines.some(x=>x.name===selected)).map(s=>String(s.id)));
    const items=[];
    for(const id of ids)for(const [lon,lat,ref] of exits[id]||[]){
      const m=maplibregl.MercatorCoordinate.fromLngLat([lon,lat]),b=proj(m.x,m.y,0);if(!b||b[0]<-40||b[0]>W+40||b[1]<-60||b[1]>H+40)continue;
      const st=stations.find(s=>String(s.id)===id);
      items.push([m,b,String(ref),exitCol.get(lon+','+lat)||hexRGB3(colors[st?.lines[0]?.name]||'#52646a')]);
    }
    items.sort((a,b)=>a[1][1]-b[1][1]);   // far (higher on screen) first, near ones drawn over them
    const Ld=[-.6,.8];   // light from the south-west (map y runs south)
    for(const [m,b,ref,lc] of items){
      const uv=this.uv.get(ref)||[0,0,0,0,1],guv=uv.slice(0,4),x=m.x,y=m.y;
      quad([[b[0]-sPx*1.1,b[1]-sPx*.55,b[2]],[b[0]+sPx*1.3,b[1]-sPx*.55,b[2]],[b[0]+sPx*1.3,b[1]+sPx*.65,b[2]],[b[0]-sPx*1.1,b[1]+sPx*.65,b[2]]],[[-1,-1],[1,-1],[1,1],[-1,1]],NO.slice(0,3),NO.slice(0,3),NO,NO,0);   // shadow on the ground
      const C=[[x-half,y-half,0,-1],[x+half,y-half,1,0],[x+half,y+half,0,1],[x-half,y+half,-1,0]];   // NW,NE,SE,SW and the normal of the side that starts there
      for(let i=0;i<4;i++){
        const [ax,ay,nx,ny]=C[i],[bx,by]=C[(i+1)%4],A0=proj(ax,ay,0),B0=proj(bx,by,0),A1=proj(ax,ay,hgt);if(!A0||!B0||!A1)continue;
        if((B0[0]-A0[0])*(A1[1]-A0[1])-(B0[1]-A0[1])*(A1[0]-A0[0])<=0)continue;   // faces away
        const k=.9+.1*(nx*Ld[0]+ny*Ld[1]),fw=Math.hypot(B0[0]-A0[0],B0[1]-A0[1]);
        for(const [t0,t1,tone,num] of St.segs){
          const P=[proj(bx,by,hgt*t0),proj(ax,ay,hgt*t0),proj(ax,ay,hgt*t1),proj(bx,by,hgt*t1)];if(P.some(p=>!p))continue;   // b→a reads left→right from outside
          const fh=Math.hypot(P[3][0]-P[0][0],P[3][1]-P[0][1]),col=mul(tone===1?lc:tone==='grey'?grey:tone,k),text=num&&!onTop&&fw>sPx*.55;
          quad(P,LOC,col,St.ink,text?glyph(uv,fw,fh):NO,guv,text?2:1);
        }
      }
      const T=C.map(([cx,cy])=>proj(cx,cy,hgt));if(T.some(p=>!p))continue;
      const xs=T.map(p=>p[0]),ys=T.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
      const TL=T.map(p=>[(p[0]-x0)/Math.max(1e-3,x1-x0),(y1-p[1])/Math.max(1e-3,y1-y0)]);   // screen-upright, so the number reads from above
      quad(T,TL,onTop?grey:St.cap===1?lc:St.cap,St.ink,onTop?glyph(uv,x1-x0,y1-y0,.72):NO,guv,onTop?2:1);   // the cap
    }
    if(!data.length)return;
    gl.useProgram(this.p);gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
    const st=20*4,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,st,off*4)};
    ptr('a_pos',3,0);ptr('a_local',2,3);ptr('a_col',3,5);ptr('a_ink',3,8);ptr('a_glyph',4,11);ptr('a_guv',4,15);ptr('a_mode',1,19);
    gl.uniform2f(this.uView,W,H);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(this.uTex,0);
    if(solid){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false)}else gl.disable(gl.DEPTH_TEST);   // solid park buildings hide them; through see-through ones they show
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES,0,data.length/20);
    for(const n of Object.keys(this.attr))gl.disableVertexAttribArray(this.attr[n]);
  }
}
const exitPillars=new ExitPillars();
// 롤러코스터 track (see coasterAt), drawn on the train canvas under the trains: per direction a pair of
// rails in the line's colour on a box girder, sleepers, and white columns down to the ground.
// Built per edge in map space once (lane offsets in px are applied in the shader, so zoom needs no rebuild).
const TRACK_BYTES=(PHONE?96:192)*1e6;   // GPU memory for the built track pieces (the next levels are built ahead only below 80 %: else they went out as fast as built)
class CoasterTrack{
  init(gl){
    const vs=`#version 300 es
in vec4 a_p;in vec2 a_r;in vec4 a_o;in vec2 a_z;in vec3 a_f;in vec3 a_u;in vec4 a_c;uniform mat4 u_matrix;uniform float u_unit,u_lane,u_body;uniform vec3 u_post;out vec3 v_c;
void main(){float lane=(a_o.x+a_o.y*u_lane)*u_unit,across=(a_o.z*u_body+a_o.w)*u_unit;   // lane: flat; across: along R = U × F (turned in a corkscrew)
  vec3 r=vec3(a_r,0.),p=r-dot(r,a_f)*a_f;float pl=length(p);vec3 U0=pl>1e-6?cross(a_f,p/pl):a_u;   // the up before any roll: turned (a_u ≠ U0), the rails wind round a line CORK_HEART body up
  gl_Position=u_matrix*vec4(vec3(a_p.xy+a_r*lane,a_p.z*a_p.w)+cross(a_u,a_f)*across+(a_f*a_z.x+a_u*a_z.y)*u_unit+(U0-a_u)*(${CORK_HEART}*u_body*u_unit),1.);v_c=a_c.a<0.?u_post*-a_c.a:a_c.rgb*a_c.a;}`;
    const fs=`#version 300 es
precision highp float;in vec3 v_c;uniform float u_alpha;out vec4 o;void main(){o=vec4(v_c*u_alpha,u_alpha);}`;
    const sh=(t,src)=>{const x=gl.createShader(t);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.p);
    this.attr=Object.fromEntries(['a_p','a_r','a_o','a_z','a_f','a_u','a_c'].map(n=>[n,gl.getAttribLocation(this.p,n)]));
    this.uni=Object.fromEntries(['u_matrix','u_unit','u_lane','u_body','u_post','u_alpha'].map(n=>[n,gl.getUniformLocation(this.p,n)]));
    this.gl=gl;this.M=new Float32Array(16);this.cache=new Map();
    this.O=maplibregl.MercatorCoordinate.fromLngLat(HOME.center);
    const seen=new Set();this.edges=[];
    for(const [line,chunks] of Object.entries(paths))for(const ids of chunks)for(let i=1;i<ids.length;i++){
      const lo=Math.min(ids[i-1],ids[i]),hi=Math.max(ids[i-1],ids[i]),id=`${line}:${lo}:${hi}`;if(seen.has(id)||!byId.has(lo)||!byId.has(hi))continue;seen.add(id);this.edges.push({id,line,lo,hi})}
  }
  // Built in pieces of ~400 m (a whole long edge at 8 m took up to 0.25 s), each with its own GPU buffer, uploaded once.
  // 22 floats a vertex — x y h hf (hf 0: on the ground) · R (across, flat) · px across: offset, ×lane, ×body, raw ·
  // px along F, px along U · F (along the track) · U (the track's up) · rgb shade (shade < 0: the post colour)
  pieces(){
    if(this.list)return this.list;this.list=[];
    for(const e of this.edges){const g=geom(e.line,e.lo,e.hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),k=Math.max(1,Math.round(g.total/mu/400)),H=coasterProfile(e.line,e.lo,e.hi);
      for(let j=0;j<k;j++){const s0=g.total*j/k,s1=g.total*(j+1)/k;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,top=0;
        for(let i=Math.floor(j/k*H.n);i<=Math.min(H.n,Math.ceil((j+1)/k*H.n));i++)top=Math.max(top,H.h[i]);const pad=(70+top*1.5)*mu;   // tall ones stand out of view on screen: a wider margin
        for(let i=0;i<g.pts.length;i++){if(i+1<g.pts.length&&g.cum[i+1]<s0)continue;if(i&&g.cum[i-1]>s1)break;const q=g.pts[i];x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y)}
        this.list.push({id:`${e.id}:${j}`,e,s0,s1,box:[x0-pad,y0-pad,x1+pad,y1+pad]})}}
    return this.list;
  }
  // the edge's point s (mercator units along it) on the coaster: ground point under it, height, lateral swing and roll
  sampler(e){
    const g=geom(e.line,e.lo,e.hi);
    const ground=s=>{let i=1,j=g.pts.length-1;while(i<j){const m=(i+j)>>1;if(g.cum[m]<s)i=m+1;else j=m}const A=g.pts[i-1],B=g.pts[i],u=Math.max(0,Math.min(1,(s-g.cum[i-1])/((g.cum[i]-g.cum[i-1])||1))),l=Math.hypot(B.x-A.x,B.y-A.y)||1;
      return {x:A.x+(B.x-A.x)*u,y:A.y+(B.y-A.y)*u,fx:(B.x-A.x)/l,fy:(B.y-A.y)/l}};   // i: first point at or past s, found by halving
    return s=>{const [sg,h,lat,roll]=coasterAt(e.line,e.lo,e.hi,s),q=ground(sg);q.x-=q.fy*lat;q.y+=q.fx*lat;q.h=h;q.roll=roll;q.loop=sg!==s||roll!==0||!!(g.spiral&&s>g.spiral.r0&&s<g.spiral.r1);return q};   // loop: no columns under it (nor under a tower ring: its turns are stacked)
  }
  // Supports: one under both directions (a crossbeam carries the two girders) a span apart by height — COL_SPAN m low,
  // more higher up, an A-frame from COL_AFRAME m — placed along each edge the same at every zoom (zoomed out every k-th:
  // piece), none on the ground, in a loop or corkscrew, nor within COL_CLEAR m of another line's (lines side by side made
  // a fence: a column every 30 m under each direction of each line, ~67 a km a line close up). Worked out once for all
  // the edges in id order, each moved on 10 m at a time until clear of the ones before.
  columns(){
    if(this.cols)return this.cols;this.cols=new Map();const grid=new Map(),cell=COL_CLEAR,key=(x,y)=>Math.floor(x/cell)+','+Math.floor(y/cell);
    for(const e of [...this.edges].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
      const g=geom(e.line,e.lo,e.hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),pos=this.sampler(e),list=[];this.cols.set(e.id,list);
      const near=q=>{const X=q.x/mu,Y=q.y/mu,ix=Math.floor(X/cell),iy=Math.floor(Y/cell);
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const c of grid.get((ix+dx)+','+(iy+dy))||[])if(c.line!==e.line&&Math.hypot(c.X-X,c.Y-Y)<COL_CLEAR)return true;return false};
      for(let s=0;s<g.total;){const q=pos(s);if(q.h<3*mu||q.loop||near(q)){s+=10*mu;continue}
        list.push(s);const X=q.x/mu,Y=q.y/mu,k=key(X,Y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push({X,Y,line:e.line});
        const h=q.h/mu;s+=(h<30?COL_SPAN:h<COL_AFRAME?80:100)*mu}
    }
    return this.cols;
  }
  // Night (the park in the dark theme): a string of bulbs under each edge's centre line, BULB_EVERY m apart and 3 m under
  // the girders — none on the ground, in a loop or corkscrew. Absolute mercator x, y and height, for NightLayer.
  bulbs(){
    if(this.bulbPts)return this.bulbPts;const out=[];
    for(const e of this.edges){const g=geom(e.line,e.lo,e.hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),pos=this.sampler(e);
      for(let s=BULB_EVERY*mu/2;s<g.total;s+=BULB_EVERY*mu){const q=pos(s);if(q.h<6*mu||q.loop)continue;out.push(q.x,q.y,q.h-3*mu)}}
    return this.bulbPts=new Float64Array(out);   // doubles: float mercator is ~2 m coarse here
  }
  // lvl: sample spacing in m (8 m close up; coarser zoomed out, where 8 m built 2.3 M vertices at z12.6 and stalled the map)
  piece(c,lvl){
    const ck=c.id+':'+lvl;let a=this.cache.get(ck);if(a)return a;
    const e=c.e,g=geom(e.line,e.lo,e.hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),col=hexRGB(colors[e.line]||'#888888'),eo=edgeOffset(e.line,e.lo,e.hi),O=this.O;
    const pos=this.sampler(e);
    const at=s=>{const q=pos(s),A=pos(Math.max(0,s-.5*mu)),B=pos(Math.min(g.total,s+.5*mu));
      let F=[B.x-A.x,B.y-A.y,B.h-A.h];const l=Math.hypot(...F)||1;F=F.map(c=>c/l);const R=[-q.fy,q.fx],[,U]=rolled(R,F,q.roll);
      return {x:q.x-O.x,y:q.y-O.y,h:q.h,R,F,U,G:[q.fx,q.fy,0],loop:q.loop,roll:q.roll}};
    // samples on the edge's own grid (so neighbouring pieces meet), the piece's ends, and densely over the loop
    // zoomed out: sampled at ≤ 16 m, then thinned to what bends (every lvl m alone cut the hills and curves to zigzags)
    const fine=Math.min(lvl,16),S=[c.s0],n=Math.max(1,Math.ceil(g.total/(fine*mu)));for(let i=Math.ceil(c.s0/g.total*n);i<=n;i++){const x=g.total*i/n;if(x>=c.s1)break;if(x>c.s0)S.push(x)}S.push(c.s1);
    const dense=[];if(loopD(g.total/mu,e.lo,e.hi)){const D=loopD(g.total/mu,e.lo,e.hi)*mu;dense.push([g.total/2-D/2,D,1])}const C=corkOf(g.total/mu,e.lo,e.hi);if(C)dense.push([C[0]*mu,C[1]*mu,C[2]]);
    for(const [s0,D,T] of dense){const m=Math.max(24,96*8/lvl|0)*T;for(let i=1;i<m;i++){const x=s0+D*i/m;if(x>c.s0&&x<c.s1)S.push(x)}}if(dense.length)S.sort((p,q)=>p-q);   // densely over the loop and the corkscrew
    let P=S.map(s=>Object.assign(at(s),{s}));
    if(lvl>fine){const tol=lvl/40*mu,K=[P[0]];let k=0;   // keep a sample where the ones since the last kept stray > tol (~¼ px; at ~1 px the corners showed) from a straight run
      // every corkscrew sample is kept (roll): its turn is in U, not in x/y/h
      const off=(A,B,Q)=>{const dx=B.x-A.x,dy=B.y-A.y,dh=B.h-A.h,l2=dx*dx+dy*dy+dh*dh||1,u=Math.max(0,Math.min(1,((Q.x-A.x)*dx+(Q.y-A.y)*dy+(Q.h-A.h)*dh)/l2));return Math.hypot(A.x+dx*u-Q.x,A.y+dy*u-Q.y,A.h+dh*u-Q.h)};
      for(let j=k+2;j<P.length;j++){let bad=P[j].loop!==P[k].loop||!!P[j-1].roll;for(let i=k+1;i<j&&!bad;i++)bad=off(P[k],P[j],P[i])>tol;if(bad){k=j-1;K.push(P[k])}}
      K.push(P[P.length-1]);P=K}
    const G=-6,NONE=[0,0,0],UP=[0,0,1];   // G: girder depth, px
    const out=new Float32Array(22*(2*42*P.length+120*((this.columns().get(e.id)||[]).length+1)));let o=0;   // room for every part on both sides
    const v=(q,hf,side,kb,kp,kf,zp,c,sh,post)=>{const F=post?q.G:q.F,U=post?UP:q.U;
      out[o++]=q.x;out[o++]=q.y;out[o++]=q.h;out[o++]=hf;out[o++]=q.R[0];out[o++]=q.R[1];out[o++]=eo;out[o++]=side;out[o++]=kb;out[o++]=kp;out[o++]=kf;
      out[o++]=zp;out[o++]=F[0];out[o++]=F[1];out[o++]=F[2];out[o++]=U[0];out[o++]=U[1];out[o++]=U[2];out[o++]=c[0];out[o++]=c[1];out[o++]=c[2];out[o++]=sh};
    // supports (columns()): a column, or two legs splayed 18 % of the height either way, from the ground to the crossbeam
    const leg=(B,q,w,hf0=0)=>{for(const [kp,kf] of [[w,0],[0,w]]){v(B,hf0,0,0,-kp,-kf,0,NONE,-1,1);v(B,hf0,0,0,kp,kf,0,NONE,-1,1);v(q,1,0,0,kp,kf,G,NONE,-1,1);v(B,hf0,0,0,-kp,-kf,0,NONE,-1,1);v(q,1,0,0,kp,kf,G,NONE,-1,1);v(q,1,0,0,-kp,-kf,G,NONE,-.86,1)}};
    const cols=this.columns().get(e.id)||[],every=Math.max(1,Math.round(lvl*3/80));
    for(let i=0;i<cols.length;i+=every){const cs=cols[i];if(cs<c.s0||cs>=c.s1)continue;const q=at(cs),h=q.h/mu;
      if(h<COL_AFRAME)leg(q,q,2.4);
      else{const d=.18*q.h,F=(x)=>({...q,x:q.x+q.R[0]*x,y:q.y+q.R[1]*x});leg(F(-d),q,2.4);leg(F(d),q,2.4);
        const a=F(-d/2),b=F(d/2);for(const [A,B] of [[a,b]]){v(A,.5,0,0,0,0,0,NONE,-.9,1);v(B,.5,0,0,0,0,0,NONE,-.9,1);v(B,.5,0,0,0,0,-3,NONE,-.8,1);v(A,.5,0,0,0,0,0,NONE,-.9,1);v(B,.5,0,0,0,0,-3,NONE,-.8,1);v(A,.5,0,0,0,0,-3,NONE,-.8,1)}}   // the brace halfway up
      if(lvl<=16)for(const [z0,z1,f0,f1] of [[G,G-4,0,0],[G,G,-1.6,1.6]]){v(q,1,-1.1,0,0,f0,z0,NONE,-.86,1);v(q,1,1.1,0,0,f0,z0,NONE,-.86,1);v(q,1,1.1,0,0,f1,z1,NONE,-.8,1);v(q,1,-1.1,0,0,f0,z0,NONE,-.86,1);v(q,1,1.1,0,0,f1,z1,NONE,-.8,1);v(q,1,-1.1,0,0,f1,z1,NONE,-.8,1)}}   // the crossbeam under both girders: its face and its underside (close up: farther out, rungs sticking out of the track)
    for(const side of [-1,1]){
      for(let i=0;i<P.length-1;i++){const A=P[i],B=P[i+1];
        for(const kb of [-.2,.2]){v(A,1,side,kb,0,0,0,col,.62);v(B,1,side,kb,0,0,0,col,.62);v(B,1,side,kb,0,0,G,col,.5);v(A,1,side,kb,0,0,0,col,.62);v(B,1,side,kb,0,0,G,col,.5);v(A,1,side,kb,0,0,G,col,.5)}   // the girder's two sides
        for(const kb of [-.3,.3]){v(A,1,side,kb,-.9,0,.4,col,1);v(A,1,side,kb,.9,0,.4,col,1);v(B,1,side,kb,.9,0,.4,col,1);v(A,1,side,kb,-.9,0,.4,col,1);v(B,1,side,kb,.9,0,.4,col,1);v(B,1,side,kb,-.9,0,.4,col,1)}}   // rails
      if(lvl===8)for(let i=0;i<P.length;i++){const q=P[i],w=.36;v(q,1,side,-w,0,-.6,.2,NONE,-.55);v(q,1,side,w,0,-.6,.2,NONE,-.55);v(q,1,side,w,0,.6,.2,NONE,-.55);v(q,1,side,-w,0,-.6,.2,NONE,-.55);v(q,1,side,w,0,.6,.2,NONE,-.55);v(q,1,side,-w,0,.6,.2,NONE,-.55)}   // sleepers (close up only)
    }
    const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,out.subarray(0,o),gl.STATIC_DRAW);
    a={b,n:o/22};this.cache.set(ck,a);this.bytes=(this.bytes||0)+o*4;
    return a;
  }
  use(gl,M,z){
    const MT=this.M;MT.set(M);for(let r=0;r<4;r++)MT[12+r]=M[r]*this.O.x+M[4+r]*this.O.y+M[12+r];
    gl.useProgram(this.p);gl.uniformMatrix4fv(this.uni.u_matrix,false,MT);
    gl.uniform1f(this.uni.u_unit,1/(512*2**z));gl.uniform1f(this.uni.u_lane,laneOffsetPx(z,coasterBodyPx(z)));gl.uniform1f(this.uni.u_body,coasterBodyPx(z));
    gl.uniform3fv(this.uni.u_post,document.documentElement.dataset.theme==='dark'?[.6,.63,.67]:[.58,.6,.64]);
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);
  }
  ptrs(gl){const S=88,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off*4)};
    ptr('a_p',4,0);ptr('a_r',2,4);ptr('a_o',4,6);ptr('a_z',2,10);ptr('a_f',3,12);ptr('a_u',3,15);ptr('a_c',4,18)}
  // 행인 (롤러코스터, zoom 16+, with the background map): round little people (roundPerson) stroll the streets between the
  // buildings. A show (no data), run where the camera is.
  // streets(): the walkable lines on and around the screen, rebuilt when the view settles.
  streets(){
    this.net=null;const z=map.getZoom();if(!coaster||!this.edges||z<RIDER_MINZOOM||!map.getSource('ofm'))return;   // edges: once init ran
    const b=map.getBounds(),lo=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),hi=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast()),pad=(hi.x-lo.x)*.3;
    const box=[lo.x-pad,hi.y-pad,hi.x+pad,lo.y+pad],mu=lo.meterInMercatorCoordinateUnits(),M=c=>maplibregl.MercatorCoordinate.fromLngLat(c);
    const SIDE={primary:9,secondary:7.5,tertiary:6,minor:4.5,service:3,track:2,path:0,pedestrian:0};   // m from the centre line to the pavement
    const lines=[],ends=new Map(),key=p=>Math.round(p[0]/mu)+','+Math.round(p[1]/mu);   // ends: 1 m grid → lines meeting there
    for(const f of map.querySourceFeatures('ofm',{sourceLayer:'transportation'})){
      const side=SIDE[f.properties.class];if(side==null||f.properties.brunnel)continue;   // no tunnels, and no bridges (they walked over the river)
      const g=f.geometry;for(const cs of g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[]){
        const pts=cs.map(c=>{const m=M(c);return [m.x,m.y]});if(pts.length<2||pts.every(p=>p[0]<box[0]||p[0]>box[2]||p[1]<box[1]||p[1]>box[3]))continue;
        const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));if(cum[cum.length-1]<3*mu)continue;
        const L={pts,cum,len:cum[cum.length-1],side:side*mu,near:0};lines.push(L);
        for(const e of [0,1]){const k=key(pts[e?pts.length-1:0]);if(!ends.has(k))ends.set(k,[]);ends.get(k).push([L,e])}}}
    // not along the subway: the lines run under the main roads, and at the platforms the track is on the ground, so walkers
    // there walked on it. A street with more than 40 % of it within reach of a line's track is left out.
    const mpp=1/(512*2**z)/mu,reach=(15+(laneOffsetPx(z,coasterBodyPx(z))+coasterBodyPx(z)/2)*mpp)*mu,cell=60*mu,grid=new Map(),gk=(x,y)=>Math.floor(x/cell)+','+Math.floor(y/cell);
    for(const e of this.edges){const P=geom(e.line,e.lo,e.hi).pts;for(let i=1;i<P.length;i++){const A=P[i-1],B=P[i];if(Math.max(A.x,B.x)<box[0]||Math.min(A.x,B.x)>box[2]||Math.max(A.y,B.y)<box[1]||Math.min(A.y,B.y)>box[3])continue;
      const seg=[A.x,A.y,B.x,B.y],n=Math.ceil(Math.hypot(B.x-A.x,B.y-A.y)/cell)+1;for(let k=0;k<=n;k++){const x=A.x+(B.x-A.x)*k/n,y=A.y+(B.y-A.y)*k/n;for(const dx of [-1,0,1])for(const dy of [-1,0,1]){const g=gk(x+dx*cell,y+dy*cell);if(!grid.has(g))grid.set(g,new Set());grid.get(g).add(seg)}}}}
    const nearTrack=(x,y)=>{const S=grid.get(gk(x,y));if(!S)return false;for(const [ax,ay,bx,by] of S){const dx=bx-ax,dy=by-ay,u=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(ax+dx*u-x,ay+dy*u-y)<reach)return true}return false};
    for(let i=lines.length-1;i>=0;i--){const L=lines[i];let near=0,all=0;for(let s=0;s<=L.len;s+=5*mu){all++;let j=1;while(j<L.pts.length-1&&L.cum[j]<s)j++;const A=L.pts[j-1],B=L.pts[j],u=(s-L.cum[j-1])/((L.cum[j]-L.cum[j-1])||1);if(nearTrack(A[0]+(B[0]-A[0])*u,A[1]+(B[1]-A[1])*u))near++}
      if(near>all*.4)lines.splice(i,1)}
    ends.clear();for(const L of lines)for(const e of [0,1]){const k=key(L.pts[e?L.pts.length-1:0]);if(!ends.has(k))ends.set(k,[]);ends.get(k).push([L,e])}
    if(!lines.length)return;
    const ex=Object.entries(exits).flatMap(([sid,l])=>l.map(([lon,lat])=>{const m=M([lon,lat]);return {x:m.x,y:m.y,sid}})).filter(m=>m.x>box[0]&&m.x<box[2]&&m.y>box[1]&&m.y<box[3]);
    for(const L of lines){const m=L.pts[L.pts.length>>1];if(ex.some(e=>Math.hypot(e.x-m[0],e.y-m[1])<90*mu))L.near=1}   // within ~90 m of an exit: busier
    const total=lines.reduce((a,L)=>a+L.len*(1+3*L.near),0);
    this.net={lines,ends,key,mu,total};
    // keep the walkers still on a street of the new set (their place snapped to it), the rest anew
    const old=this.walkers||[],n=Math.max(10,Math.min(40,Math.round(lines.reduce((a,L)=>a+L.len,0)/mu/100)));this.walkers=[];
    for(const w of old){if(this.walkers.length>=n)break;const s=this.snap(w.p);if(s)this.walkers.push({...w,...s})}
    while(this.walkers.length<n)this.walkers.push(this.spawn());
  }
  snap(p,far=4){const {lines,mu}=this.net;let best=null;
    for(const L of lines)for(let i=1;i<L.pts.length;i++){const A=L.pts[i-1],B=L.pts[i],dx=B[0]-A[0],dy=B[1]-A[1],l2=dx*dx+dy*dy||1,u=Math.max(0,Math.min(1,((p[0]-A[0])*dx+(p[1]-A[1])*dy)/l2)),d=Math.hypot(A[0]+dx*u-p[0],A[1]+dy*u-p[1])-L.side;
      if(Math.abs(d)<far*mu&&(!best||Math.abs(d)<best.d))best={d:Math.abs(d),L,s:L.cum[i-1]+Math.sqrt(l2)*u}}
    return best&&{L:best.L,s:best.s}}
  dress(w){const pick=a=>a[Math.random()*a.length|0],mu=this.net?.mu||1e-8;
    return Object.assign(w,{v:(1.05+Math.random()*.5)*mu,ph:Math.random()*6.3,pause:0,col:pick(SHIRTS),pants:pick(PANTS),hair:pick(HAIR)})}
  spawn(){const {lines,total}=this.net;let r=Math.random()*total,L=lines[0];for(const x of lines){r-=x.len*(1+3*x.near);if(r<=0){L=x;break}}
    return this.dress({mode:'street',L,s:Math.random()*L.len,dir:Math.random()<.5?1:-1,side:Math.random()<.5?1:-1})}
  // where a walker is: on its line at s, out to its pavement side, facing its way
  place(w){const L=w.L;let i=1;while(i<L.pts.length-1&&L.cum[i]<w.s)i++;const A=L.pts[i-1],B=L.pts[i],l=(L.cum[i]-L.cum[i-1])||1,u=Math.max(0,Math.min(1,(w.s-L.cum[i-1])/l));
    const fx=(B[0]-A[0])/l*w.dir,fy=(B[1]-A[1])/l*w.dir,o=L.side*w.side*w.dir;return {x:A[0]+(B[0]-A[0])*u-fy*o,y:A[1]+(B[1]-A[1])*u+fx*o,f:[fx,fy],r:[-fy,fx]}}
  people(gl,M,occlude){
    const z=map.getZoom();if(!coaster||z<RIDER_MINZOOM||!map.getSource('ofm')||map.getLayoutProperty('bm-road-major','visibility')==='none')return;
    if(!this.p)this.init(gl);if(!this.net){if(!this.netTried||performance.now()-this.netTried>1000){this.netTried=performance.now();this.streets()}if(!this.net)return}
    const now=performance.now(),dt=Math.min(.1,(now-(this.tick||now))/1000);this.tick=now;
    const {ends,key}=this.net,sc=coasterBodyPx(z)/9,O=this.O,out=[],b=map.getBearing()*Math.PI/180,right=[Math.cos(b),Math.sin(b)];   // right: the screen's right on the ground
    for(const w of this.walkers){
      if(w.pause>0)w.pause-=dt;else w.s+=w.v*dt*w.dir;
      if(w.s<0||w.s>w.L.len){   // at an end: on to another line meeting there, else back
        const e=w.s>w.L.len?1:0,P=w.L.pts[e?w.L.pts.length-1:0],next=(ends.get(key(P))||[]).filter(([L])=>L!==w.L);
        if(next.length){const [L,ne]=next[Math.random()*next.length|0];w.L=L;w.s=ne?L.len:0;w.dir=ne?-1:1;w.side=Math.random()<.8?w.side:-w.side}
        else{w.s=Math.max(0,Math.min(w.L.len,w.s));w.dir=-w.dir;w.side=-w.side;w.pause=Math.random()*2}}
      if(Math.random()<dt*.02)w.pause=1+Math.random()*3;   // now and then a stop
      const q=this.place(w);w.p=[q.x,q.y];const go=w.pause<=0;
      const ph=w.ph+now/1000*7.5;
      roundPerson(out,{x:q.x-O.x,y:q.y-O.y,r:[-right[1],right[0]],f:right},sc*1.3,go?Math.abs(Math.sin(ph))*.18:0,go?Math.sin(ph):0,q.f[0]*right[0]+q.f[1]*right[1]>=0?1:-1,w.col,w.pants,w.hair);
    }
    if(!out.length)return;trainFrameSoon(1000/TRAIN_FPS);   // they walk: keep drawing
    const data=new Float32Array(out),n=data.length/22;if(!this.pb)this.pb=gl.createBuffer();
    this.use(gl,M,z);gl.bindBuffer(gl.ARRAY_BUFFER,this.pb);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);this.ptrs(gl);gl.depthMask(false);
    // as the trains: full in front of the buildings, faint behind them (through the map's see-through buildings)
    gl.depthMask(false);
    if(occlude){gl.depthFunc(gl.GREATER);gl.uniform1f(this.uni.u_alpha,occlude);gl.drawArrays(gl.TRIANGLES,0,n)}
    gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.uniform1f(this.uni.u_alpha,1);gl.drawArrays(gl.TRIANGLES,0,n);gl.depthMask(false);   // their depth: the track tests against it
    for(const k of Object.keys(this.attr))gl.disableVertexAttribArray(this.attr[k]);
  }
  render(gl,M,occlude){
    const z=map.getZoom();if(!coaster||z<12.5)return;if(!this.p)this.init(gl);
    const view=map.getBounds(),lo=maplibregl.MercatorCoordinate.fromLngLat(view.getSouthWest()),hi=maplibregl.MercatorCoordinate.fromLngLat(view.getNorthEast()),w=hi.x-lo.x;
    const inside=(c,pad)=>{const [x0,y0,x1,y1]=c.box;return !(x1<lo.x-pad||x0>hi.x+pad||y0>lo.y+pad||y1<hi.y-pad)};
    const mine=this.pieces().filter(c=>selected==='all'||c.e.line===selected),vis=mine.filter(c=>inside(c,w*.1));
    const mpp=40075016.686*Math.cos(37.5*Math.PI/180)/(512*2**z),lvl=8*2**Math.max(0,Math.ceil(Math.log2(6*mpp/8)));   // ~6 px a sample
    // pieces not built at this level yet: a few each frame (~4 ms), meanwhile drawn at a level already built (building all
    // at once while zooming hitched and left gaps); spare time builds the next level out over a wider area, then in
    const t0=performance.now(),draw=[],LV=[8,16,32,64,128,256],near=[lvl*2,lvl/2,lvl*4,lvl/4,...LV];let pending=false;
    const frame=this.frame=(this.frame||0)+1,hit=k=>{const a=this.cache.get(k);if(a){this.cache.delete(k);this.cache.set(k,a);a.f=frame}return a};   // used: to the back of the queue
    for(const c of vis){const a=hit(c.id+':'+lvl);if(a){draw.push(a);continue}
      if(performance.now()-t0<4){draw.push(this.piece(c,lvl));continue}
      pending=true;let b=null;for(const l of near)if((b=hit(c.id+':'+l)))break;
      if(!b&&performance.now()-t0<12)b=this.piece(c,lvl);if(b)draw.push(b)}   // nothing built for it yet (newly on screen): up to 12 ms, rather than a gap
    if(!pending&&(this.bytes||0)<TRACK_BYTES*.8)for(const [l,pad] of [[lvl*2,w*.6],[lvl/2,0]])if(LV.includes(l))for(const c of mine){if(performance.now()-t0>=4){pending=true;break}if(inside(c,pad)&&!this.cache.has(c.id+':'+l))this.piece(c,l)}
    if(pending)trainFrameSoon(16);
    for(const a of draw)a.f=frame;
    // least recently drawn out past TRACK_BYTES, never one drawn this frame (dropping the oldest built deleted pieces on screen:
    // with every line at z13+ the 3,500 pieces at two or three levels passed the old 4,000 cap, and the track flickered)
    for(const [k,a] of this.cache){if(this.bytes<=TRACK_BYTES||a.f===frame)break;gl.deleteBuffer(a.b);this.cache.delete(k);this.bytes-=a.n*88}
    if(!draw.length)return;
    this.use(gl,M,z);
    const each=()=>{for(const a of draw){gl.bindBuffer(gl.ARRAY_BUFFER,a.b);this.ptrs(gl);gl.drawArrays(gl.TRIANGLES,0,a.n)}};
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);
    if(occlude){gl.depthMask(false);gl.depthFunc(gl.GREATER);gl.uniform1f(this.uni.u_alpha,occlude);each()}   // behind building walls: faint
    gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.uniform1f(this.uni.u_alpha,1);each();gl.depthMask(false);
    for(const n of Object.keys(this.attr))gl.disableVertexAttribArray(this.attr[n]);
  }
}
const RIDER_MINZOOM=16;
// A walker: a round little person, drawn face on to the camera (q.f is the screen's right on the ground, so nothing is
// seen edge on): stubby legs with round feet, a round-cornered body in its shirt colour, short arms with round hands and a
// big round head with hair on top. In px of sc; sw swings legs and arms (−1…1 walking, 0 standing), bob lifts it each
// step, m mirrors it to the way it walks. 22 floats a vertex, as the coaster track's.
function roundPerson(arr,q,sc,bob,sw,m,col,pants,hair){
  const v=(f,zz,cl,sh)=>arr.push(q.x,q.y,0,1,q.r[0],q.r[1],0,0,0,0,f*m,zz,q.f[0],q.f[1],0,0,0,1,cl[0],cl[1],cl[2],sh);
  const disc=(cf,cz,rf,rz,cl,sh,a0=0,a1=2*Math.PI,N=12)=>{for(let i=0;i<N;i++){const t0=a0+(a1-a0)*i/N,t1=a0+(a1-a0)*(i+1)/N;v(cf,cz,cl,sh);v(cf+rf*Math.cos(t0),cz+rz*Math.sin(t0),cl,sh);v(cf+rf*Math.cos(t1),cz+rz*Math.sin(t1),cl,sh)}};
  const bar=(f0,z0,f1,z1,w,cl,sh)=>{const dx=f1-f0,dz=z1-z0,l=Math.hypot(dx,dz)||1,nf=-dz/l*w,nz=dx/l*w;for(const [f,zz] of [[f0-nf,z0-nz],[f0+nf,z0+nz],[f1+nf,z1+nz],[f0-nf,z0-nz],[f1+nf,z1+nz],[f1-nf,z1-nz]])v(f,zz,cl,sh)};
  const u=sc,z=bob*u,hip=z+1*u,top=z+2.7*u,hr=.95*u,hz=top+.75*u;
  for(const d of [-1,1]){const fx=d*.38*u+sw*d*.35*u;bar(d*.38*u,hip,fx,z+.25*u,.26*u,pants,.85);disc(fx+.08*u,z+.2*u,.3*u,.2*u,[.18,.18,.2],1)}   // legs, round feet
  const bw=.85*u,br=.55*u;bar(0,hip+br*.6,0,top-br*.4,bw,col,1);disc(0,hip+br*.6,bw,br,col,1,Math.PI,2*Math.PI,8);disc(0,top-br*.4,bw,br,col,1,0,Math.PI,8);   // round body
  for(const d of [-1,1]){const hx=d*1.15*u-sw*d*.4*u,hz2=hip+.75*u;bar(d*.75*u,top-.45*u,hx,hz2,.2*u,col,.88);disc(hx,hz2,.22*u,.22*u,SKIN,1,0,2*Math.PI,8)}   // short arms, round hands
  disc(0,hz,hr,hr,SKIN,1);disc(0,hz+.12*u,hr*1.03,hr*.95,hair,1,Math.PI*.05,Math.PI*.95,10);   // head, hair on top
}
const SKIN=[.97,.82,.68],HAIR=[[.16,.12,.1],[.3,.2,.12],[.1,.1,.12],[.45,.3,.18]],
  PANTS=[[.2,.25,.4],[.28,.34,.5],[.18,.18,.2],[.45,.38,.3]],SHIRTS=[[.95,.38,.35],[.3,.58,.92],[1,.8,.2],[.36,.74,.48],[.66,.5,.88],[.98,.62,.32],[.95,.95,.96]];
const coasterTrack=new CoasterTrack();
let stationAlpha=1;   // station platforms and names: faded behind a 길찾기 route (focusRoute)
const stationNames=new StationNameLayer();
function updateLabelVisibility(){labelFrame=0;map.triggerRepaint()}
const scheduleLabels=()=>{if(!labelFrame)labelFrame=requestAnimationFrame(updateLabelVisibility)};
function rebuildLabels(){
  labels=[];
  const visible=stations.filter(s=>selected==='all'||s.lines.some(x=>x.name===selected)).sort((a,b)=>b.lines.length-a.lines.length);
  for(const s of visible){
    const line=selected!=='all'&&s.lines.some(x=>x.name===selected)?selected:s.lines[0].name;
    labels.push({station:s,line,text:s.name});
  }
  // a name beside each (visible) line's platform, like Kakao: the station's first line from the start, its others from zoom 16
  const src=map.getSource('station-labels');
  // above the name, its line(s) in line colour: all of them on the station's one early name, each line's own beside its platform
  const lineProps=names=>Object.fromEntries([0,1,2,3].flatMap(k=>[[`l${k}`,names[k]?(k?' ':'')+names[k]:''],[`c${k}`,colors[names[k]]||'#52646a']]));
  if(src)src.setData({type:'FeatureCollection',features:labels.flatMap(({station:s,text})=>{const shown=s.lines.filter(x=>selected==='all'||x.name===selected);return shown.flatMap((x,i)=>{
    const r=stationRects.get(`${x.name}:${s.id}`);if(!r)return [];
    const c=[(r.coords[0][0]+r.coords[r.coords.length-1][0])/2,(r.coords[0][1]+r.coords[r.coords.length-1][1])/2];
    return [{type:'Feature',properties:{text,rank:i*10-s.lines.length,primary:i?0:1,...lineProps(i?[x.name]:shown.map(y=>y.name)),...Object.fromEntries(['m0','m1','m2','m3'].map((k,j)=>[k,j?'':x.name])),mc:colors[x.name]||'#52646a'},geometry:{type:'Point',coordinates:c}}];
  })})});
  scheduleLabels();
}

function filterLine(line){
  if(!ready){pendingLine=line;return}
  selected=line;
  map.setFilter('routes',line==='all'?null:['==',['get','line'],line]);
  for(const id of ['stations','stations-casing'])map.setFilter(id,line==='all'?null:['==',['get','line'],line]);
  rebuildLabels();
  const visible=stations.filter(s=>line==='all'||s.lines.some(x=>x.name===line));
  $('mapTitle').textContent=line==='all'?`${stations.length}개 역 노드 전체 보기`:`${line} · ${visible.length}개 역`;
  $('status').textContent=`${line==='all'?'전체 노선':line} · ${visible.length}개 역 위치와 역명을 표시합니다.`;
  liveRequest++;trains=[];plans=[];lastPose.clear();liveKey='';map.triggerRepaint();
  if(line==='all')map.jumpTo(HOME);
  else{const b=new maplibregl.LngLatBounds();visible.forEach(s=>b.extend([s.lon,s.lat]));map.fitBounds(b,{padding:60,maxZoom:13})}
  refreshLive(true);
}
// Live trains show from zoom 13 for every line on screen (or just the selected line). The proxy
// serves all lines from one cached upstream call, so the number of lines requested is free.
const LIVE_ZOOM=13,LIVE_MAX_LINES=24,STALE_SECONDS=600;
let liveOn=false,liveFailures=0,liveKey='',liveAt=0,liveFetchedAt=null;
function liveLines(){
  // hysteresis: trains appear at zoom 13 but only disappear below 12.5, so pinching around 13 doesn't blink them
  liveOn=map.getZoom()>=LIVE_ZOOM||(liveOn&&map.getZoom()>=LIVE_ZOOM-.5);
  if(!liveOn)return [];
  if(selected!=='all')return [selected];
  const b=map.getBounds(),n={};
  for(const s of stations)if(b.contains([s.lon,s.lat]))for(const x of s.lines)n[x.name]=(n[x.name]||0)+1;
  // also lines merely passing through the view (no station inside it)
  const c=map.getCenter();
  // lines passing through the view: stations within 0.75 view or at least ~1.5 km of the centre (zoomed in the view is tiny)
  const w=Math.max((b.getEast()-b.getWest())*.75,.019),h=Math.max((b.getNorth()-b.getSouth())*.75,.0135);
  for(const s of stations)if(Math.abs(s.lon-c.lng)<w&&Math.abs(s.lat-c.lat)<h)for(const x of s.lines)n[x.name]??=.5;
  return Object.keys(n).sort((x,y)=>n[y]-n[x]).slice(0,LIVE_MAX_LINES);
}
async function refreshLive(force=false){
  const lines=liveLines();
  if(!lines.length){
    liveRequest++;liveKey='';if(plans.length){trains=[];plans=[];lastPose.clear();map.triggerRepaint()}
    liveState.parentElement.dataset.state='idle';liveState.textContent=!liveOn?'줌 13 이상에서 실시간 열차를 표시합니다':'이 화면에는 운행 노선이 없습니다';
    return;
  }
  // the line of the train whose sheet is open: the proxy reads it from the per-line position feed when that is on
  const focus=sheetTrain?sheetTrain.split(':')[0]:'';
  const key=lines.join(',')+(focus?'|'+focus:'');
  if(!force&&key===liveKey&&Date.now()-liveAt<30000)return; // same lines, fetched recently
  const request=++liveRequest;liveKey=key;liveAt=Date.now();
  if(!plans.length)liveState.parentElement.dataset.state='loading';liveState.textContent=`${lines.join(' · ')} 열차 위치 확인 중`;
  try{
    const r=await fetch(`./api/live?lines=${encodeURIComponent(lines.join(','))}${focus?`&focus=${encodeURIComponent(focus)}`:''}`,{cache:'no-store'}),d=await r.json();
    if(request!==liveRequest)return; // a newer view or selection superseded this response
    if(!r.ok||!d.ok)throw Error(d.error||r.status);
    // A record not refreshed for 10 minutes is a train the feed lost track of (or one that left
    // service); extrapolating it would park a ghost train somewhere down the line.
    const all=d.trains||[];trains=all.filter(t=>age(t.receivedAt)<=STALE_SECONDS);const stale=all.length-trains.length;
    // Fresh data: each train carries on from where it is drawn (replacePlans), never jumping back.
    liveFetchedAt=d.fetchedAt;liveFailures=0;updateLiveNotice(d.quotaExhausted?'오늘 실시간 조회 한도를 다 썼어요. 내일 첫차 무렵부터 다시 보여요.':d.warnings&&d.warnings.length?'실시간 정보 일부가 지연되고 있어요. 이전 자료로 표시 중이에요.':null);learnDirections(trains);replacePlans(trains.map(planTrain).filter(Boolean));lastPose.clear();
    const unplaced=trains.length-plans.length,shown=d.lines||lines;
    liveState.parentElement.dataset.state='ok';liveState.textContent=`추정 위치 ${plans.length}대${unplaced?` (역 미확인 ${unplaced})`:''}${stale?` (오래된 기록 ${stale} 제외)`:''} · ${shown.join(' · ')} · ${new Date(d.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}`;
    map.triggerRepaint();
  }catch{if(request===liveRequest){liveKey='';liveFailures++;liveState.parentElement.dataset.state='error';liveState.textContent='실시간 위치 연결 실패 · 잠시 후 재시도';if(liveFailures>=2||!plans.length)updateLiveNotice('실시간 열차 정보에 연결하지 못했어요. 20초마다 다시 시도해요.')}}
}

map.on('load',()=>{
  map.addSource('routes',{type:'geojson',data:{type:'FeatureCollection',features:buildLineFeatures()}});
  shapesReady.then(()=>{map.getSource('routes').setData({type:'FeatureCollection',features:buildLineFeatures()});map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels();map.triggerRepaint()});
  map.addLayer({id:'routes',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],8,1.5,15,4],'line-offset':['get','offset'],'line-opacity':.9}});
  map.addSource('stations',{type:'geojson',data:{type:'FeatureCollection',features:buildStationFeatures()}});
  // Stations: square-ended platform rectangles filled with the line colour (no outline), widths shared with the name boxes.
  // line layers kept (invisible) for clicking; the visible platforms are drawn by the station-names layer
  map.addLayer({id:'stations-casing',type:'line',source:'stations',layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-opacity':0,'line-color':['get','color'],'line-offset':['get','offset'],'line-width':['interpolate',['linear'],['zoom'],...STATION_WIDTH_STOPS.flat()]}});
  map.addLayer({id:'stations',type:'line',source:'stations',layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-opacity':0,'line-color':['get','color'],'line-offset':['get','offset'],'line-width':['interpolate',['linear'],['zoom'],...STATION_WIDTH_STOPS.map(([z,w])=>[z,Math.max(1,w-4)]).flat()]}});
  map.addLayer(stationNames);   // platforms under the trains
  // station names: flat on the map beside the platform, dark with a halo (like Kakao); dots only when zoomed out
  map.addSource('station-labels',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'station-labels',type:'symbol',source:'station-labels',filter:['==',['get','primary'],1],minzoom:PHONE?12.01:13.01,layout:{'text-field':['step',['zoom'],['format',['get','l0'],{'text-color':['get','c0'],'font-scale':.78},['get','l1'],{'text-color':['get','c1'],'font-scale':.78},['get','l2'],{'text-color':['get','c2'],'font-scale':.78},['get','l3'],{'text-color':['get','c3'],'font-scale':.78},'\n',{},['get','text'],{}],16,['format',['get','m0'],{'text-color':['get','mc'],'font-scale':.78},'\n',{},['get','text'],{}]],'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],13,11,16,13,18,14],'symbol-sort-key':['get','rank'],'text-variable-anchor':['top','bottom','right','left'],'text-radial-offset':['interpolate',['linear'],['zoom'],13,.6,16,.9,18,1.1],'text-justify':'auto','text-padding':3},paint:{'text-color':'#141414','text-halo-color':'#ffffff','text-halo-width':1.6}});
  map.addLayer({id:'station-labels-more',type:'symbol',source:'station-labels',filter:['==',['get','primary'],0],minzoom:16,layout:{'text-field':['format',['get','m0'],{'text-color':['get','mc'],'font-scale':.78},'\n',{},['get','text'],{}],'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],13,11,16,13,18,14],'symbol-sort-key':['get','rank'],'text-variable-anchor':['top','bottom','right','left'],'text-radial-offset':['interpolate',['linear'],['zoom'],13,.6,16,.9,18,1.1],'text-justify':'auto','text-padding':3},paint:{'text-color':'#141414','text-halo-color':'#ffffff','text-halo-width':1.6}});
  // trains: their own canvas over the map (see TRAIN_FPS)
  {
    const c=document.createElement('canvas');c.className='train-overlay';map.getCanvas().after(c);   // right above the map, under markers and popups
    c.style.cssText='position:absolute;left:0;top:0;pointer-events:none';
    const gl=c.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:true});
    const layer=new TrainLayer();layer.onAdd(map,gl);const walls=new BuildingDepth(gl);let rides=null,night=null;
    drawTrains=()=>{
      const m=map.getCanvas();if(c.width!==m.width||c.height!==m.height){c.width=m.width;c.height=m.height}
      c.style.width=m.style.width;c.style.height=m.style.height;
      gl.viewport(0,0,c.width,c.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const pd=map.painter.transform.getProjectionDataForCustomLayer(true);   // the transform the map just drew with
      const drawn=walls.draw(pd.mainMatrix),behind=drawn?1-mapPalette().bld3dOpacity:0;
      if(coaster&&coasterBld?.towers?.length){   // the rides where the towers were (their buildings are filtered out): first, so the track and trains depth-test against them
        if(!rides){rides=new RideLayer(coasterBld.towers);rides.init(gl,maplibregl)}
        const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
        rides.render(gl,pd.mainMatrix,{now:performance.now(),dark:effectiveTheme()==='dark',night:effectiveTheme()==='dark',pixelRatio:c.width/Math.max(1,m.clientWidth),zoom:map.getZoom(),bearing:map.getBearing(),phone:PHONE,reducedMotion:REDUCED.matches,bounds:[A.x,B.y,B.x,A.y]});
        if(rides.animating())trainFrameSoon(1000/TRAIN_FPS)}
      coasterTrack.people(gl,pd.mainMatrix,behind);   // 행인 on the streets, before the track: it covers the ones beneath it
      coasterTrack.render(gl,pd.mainMatrix,behind);   // under the trains
      layer.render(gl,{defaultProjectionData:pd,walls:drawn||!!rides&&coaster,occlude:behind});
      // the park at night (dark theme): bulbs under the track and fireworks over the river — after everything solid has its depth
      if(coaster&&effectiveTheme()==='dark'&&coasterTrack.edges){   // (edges: once the track has been set up)
        if(!night){night=new NightLayer();night.init(gl);night.setTrackBulbs(coasterTrack.bulbs())}
        const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
        night.render(gl,pd.mainMatrix,{now:performance.now(),zoom:map.getZoom(),phone:PHONE,reducedMotion:REDUCED.matches,bounds:[A.x,B.y,B.x,A.y],pixelRatio:c.width/Math.max(1,m.clientWidth)});
        if(night.animating())trainFrameSoon(1000/TRAIN_FPS)}
      else if(night){night.dispose(gl);night=null}
      exitPillars.render(gl,pd.mainMatrix,m.clientWidth,m.clientHeight,c.width/Math.max(1,m.clientWidth),coaster&&drawn);   // above the trains
    };
    map.on('render',()=>drawTrains());   // the camera moved or the map redrew: trains follow in the same frame
    // walls: again when new building tiles arrive or the view settles somewhere new
    let wallTimer=0;const wallsSoon=()=>{clearTimeout(wallTimer);wallTimer=setTimeout(()=>{if(map.isMoving())return;walls.rebuild();coasterTrack.streets();requestAnimationFrame(drawTrains)},250)};   // and the streets the walkers use; not while moving (tiles arriving mid-pan ran it, 50–350 ms a stall): moveend runs it
    wallsNow=()=>{walls.rebuild();requestAnimationFrame(drawTrains)};map.on('moveend',wallsSoon);map.on('sourcedata',e=>{if(e.sourceId==='ofm'&&e.isSourceLoaded)wallsSoon()});
  }
  // My location, drawn on the ground under the trains (the control's own DOM dot is hidden in CSS).
  {
    map.addSource('me',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    const pa={'circle-pitch-alignment':'map','circle-pitch-scale':'map'};
    // the pulse is drawn with the trains (their canvas), so it does not redraw the map
    map.addLayer({id:'me-ring',type:'circle',source:'me',paint:{...pa,'circle-radius':14,'circle-color':'#ffffff','circle-blur':.15}});
    map.addLayer({id:'me-dot',type:'circle',source:'me',paint:{...pa,'circle-radius':9,'circle-color':'#ffd400','circle-stroke-color':'#141414','circle-stroke-width':2.5}});
    geolocate.on('geolocate',e=>{
      const {longitude:x,latitude:y}=e.coords;myLocation=[x,y];
      map.getSource('me').setData({type:'Feature',geometry:{type:'Point',coordinates:[x,y]},properties:{}});
    });
  }
  map.on('click',e=>{if(map.queryRenderedFeatures(e.point,{layers:['stations','stations-casing']}).length)return;const pl=pickTrain(e.point);if(pl)showTrainPopup(pl);else closeSheet()});
  map.on('click','stations',e=>{const pl=pickTrain(e.point);if(pl){showTrainPopup(pl);return}const p=e.features[0].properties;showStationPopup(byId.get(+p.id),e.lngLat)});
  map.on('mouseenter','stations',()=>map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','stations',()=>map.getCanvas().style.cursor='');
  ready=true;
  map.on('rotate',()=>{if(themeChoice==='auto'){const b=$('themeIcon');if(b)b.innerHTML=sunArcIcon().svg}});
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'노선·역·시간표 KTDB 대중교통 GTFS · 실시간 서울 열린데이터광장 · 선로 © OpenStreetMap contributors'}),'bottom-left');
  // start collapsed to the ⓘ button (MapLibre opens it on first load); tap to read
  map.once('idle',()=>{const d=map.getContainer().querySelector('.maplibregl-ctrl-attrib');if(d){d.classList.remove('maplibregl-compact-show');d.removeAttribute('open')}});
  // recompute shadows when the view settles or building tiles arrive (debounced)
  let sunTimer=0;const sunSoon=()=>{clearTimeout(sunTimer);sunTimer=setTimeout(()=>{if(!map.isMoving())updateSun()},400)};   // not mid-pan (as the walls): moveend runs it
  map.on('moveend',sunSoon);map.on('sourcedata',e=>{if(e.sourceId==='ofm'&&e.isSourceLoaded&&e.tile)sunSoon()});
  addBasemap();
  // exits: yellow number discs (like station exit signs) from zoom 16
  map.addSource('exits',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  // exit sign: flat yellow rounded square with a thin ink rim, stretched to the number
  {const R=2,S=26*R,c=document.createElement('canvas');c.width=S;c.height=S+2*R;const x=c.getContext('2d');
   x.beginPath();x.roundRect(R,R,S-2*R,S-2*R,4*R);x.fillStyle='#141414';x.fill();
   x.beginPath();x.roundRect(2.2*R,2.2*R,S-4.4*R,S-4.4*R,3*R);x.fillStyle='#ffd400';x.fill();   // flat: thin ink rim, no drop shadow
   map.addImage('exit-sign',x.getImageData(0,0,S,S+2*R),{pixelRatio:R,stretchX:[[10*R,16*R]],stretchY:[[10*R,16*R]],content:[5*R,4*R,S-5*R,S-4*R]})}
  map.addLayer({id:'exit-refs',type:'symbol',source:'exits',minzoom:EXIT_MINZOOM,layout:{'text-field':['get','ref'],'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],16,10,18,12.5],'icon-image':'exit-sign','icon-text-fit':'both','icon-text-fit-padding':[2,3,2,3],'icon-allow-overlap':true,'text-allow-overlap':true},paint:{'text-color':'#141414','text-opacity':0,'icon-opacity':0}});   // invisible: holds the exits' room so station names make way (the pillars are drawn with the trains)
  exitsReady.then(()=>map.getSource('exits').setData({type:'FeatureCollection',features:exitFeatures()}));
  $('toggleMap').setAttribute('aria-pressed','true');   // background map on by default
  applyTheme();
  map.getContainer().append(liveNotice);map.getContainer().parentElement.append(sheet);   // train number and destination live in the train popup, not on the map
  if(pendingLine)filterLine(pendingLine);else{rebuildLabels();refreshLive(true)}
});

let searchTimer=0;
// search: matching stations in a list; picking one flies there and opens its arrivals
const searchIn=$('search'),searchList=$('searchList');let searchHits=[],searchAt=-1;
function searchShow(open){searchList.hidden=!open;searchIn.setAttribute('aria-expanded',String(open));if(!open){searchAt=-1;searchIn.removeAttribute('aria-activedescendant')}}
function searchMark(i){searchAt=i;[...searchList.children].forEach((li,k)=>li.setAttribute('aria-selected',String(k===i)));if(i>=0)searchIn.setAttribute('aria-activedescendant','sr-'+i)}
function searchPick(st){if(!st)return;searchShow(false);searchIn.value=st.name;searchIn.blur();
  map.flyTo({center:[st.lon,st.lat],zoom:Math.max(map.getZoom(),15),duration:900});showStationPopup(st)}
searchIn.oninput=()=>{clearTimeout(searchTimer);searchHits=[];searchMark(-1);searchIn.removeAttribute('aria-activedescendant');searchTimer=setTimeout(()=>{
  const q=searchIn.value.trim().replace(/역$/,'');if(!q){searchShow(false);return}
  const ok=x=>selected==='all'||x.lines.some(l=>l.name===selected);
  const rank=x=>x.name===q?0:x.name.startsWith(q)?1:2;   // 서울 → 서울역 before 서울대입구
  searchHits=stations.filter(x=>ok(x)&&x.name.includes(q)).sort((a,b)=>rank(a)-rank(b)||a.name.length-b.name.length).slice(0,8);
  searchList.innerHTML=searchHits.length?searchHits.map((x,k)=>`<li id="sr-${k}" role="option" aria-selected="false" data-k="${k}"><b>${esc(x.name)}</b><span>${x.lines.map(l=>`<i style="--c:${colors[l.name]||'#52646a'}">${esc(l.name)}</i>`).join('')}</span></li>`).join(''):'<li class="search-empty" role="option" aria-disabled="true">찾는 역이 없어요</li>';
  searchShow(true)},120)};
searchList.addEventListener('pointerdown',e=>e.preventDefault());   // keep focus so the tap lands
searchList.addEventListener('click',e=>{const li=e.target.closest('li[data-k]');if(li)searchPick(searchHits[+li.dataset.k])});
searchIn.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;   // 한글 조합 중인 Enter는 글자 입력
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!searchHits.length)return;e.preventDefault();searchShow(true);searchMark((searchAt+(e.key==='ArrowDown'?1:searchHits.length-1))%searchHits.length)}
  else if(e.key==='Enter'){e.preventDefault();searchPick(searchHits[Math.max(searchAt,0)])}
  else if(e.key==='Escape')searchShow(false)});
searchIn.addEventListener('focus',()=>{if(searchIn.value.trim()&&searchHits.length)searchShow(true)});
searchIn.addEventListener('blur',()=>setTimeout(()=>searchShow(false),150));
searchIn.addEventListener('search',()=>{if(!searchIn.value)searchShow(false)});
// ---- icon buttons ----------------------------------------------------------------------------
const svg=d=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS={
  map:svg('<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  train:svg('<rect x="5" y="3" width="14" height="14" rx="3.5"/><path d="M5 10h14M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="13.5" r=".9" fill="currentColor"/><circle cx="15" cy="13.5" r=".9" fill="currentColor"/>'),
  sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'),
  moon:svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  auto:svg('<path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9"/>'),
  zoom:svg('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'),
  coaster:svg('<path d="M2 18c3 0 4-11 7.5-11S12 14 15 14s3.5-6 7-6"/><path d="M5 21v-5M9.5 21V9M15 21v-5M20 21v-10"/>'),
  palette:svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.2-.7-2.1 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4c0-4.9-4-8.8-9-8.8z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15" cy="7.8" r="1.2" fill="currentColor"/>'),
  speed:svg('<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4-5"/>'),
};
function iconButton(el,icon,label){el.innerHTML=ICONS[icon];el.setAttribute('aria-label',label);el.title=label}
document.head.insertAdjacentHTML('beforeend',`<style>
/* map / trains / theme sit in their own MapLibre control group under +/−, same size and look */
.maplibregl-ctrl-group .map-toggle,.maplibregl-ctrl-group .train-toggle{position:static!important;min-width:0!important;width:29px!important;height:29px!important;padding:0!important;margin:0;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;color:#33434a!important;display:grid!important;place-items:center}
.maplibregl-ctrl-group .map-toggle svg,.maplibregl-ctrl-group .train-toggle svg{width:17px;height:17px}
.maplibregl-ctrl-group .map-toggle+.map-toggle,.maplibregl-ctrl-group .map-toggle+.train-toggle,.maplibregl-ctrl-group .train-toggle+.map-toggle{border-top:1px solid #ddd!important}
html[data-theme=dark] .maplibregl-ctrl-group .map-toggle+.map-toggle,html[data-theme=dark] .maplibregl-ctrl-group .map-toggle+.train-toggle,html[data-theme=dark] .maplibregl-ctrl-group .train-toggle+.map-toggle{border-top-color:#2b3a40!important}
.maplibregl-ctrl-group .map-toggle[aria-pressed=false],.maplibregl-ctrl-group .train-toggle[aria-pressed=false]{color:#a3b0b4!important}
html[data-theme=dark] .maplibregl-ctrl-group .map-toggle,html[data-theme=dark] .maplibregl-ctrl-group .train-toggle{color:#dbe5e8!important}
html[data-theme=dark] .maplibregl-ctrl-group .map-toggle[aria-pressed=false],html[data-theme=dark] .maplibregl-ctrl-group .train-toggle[aria-pressed=false]{color:#61737a!important}
.webgl-zoom{display:flex;align-items:center;gap:3px;padding:4px 7px!important;font-variant-numeric:tabular-nums}
.webgl-zoom svg{width:14px;height:14px}
.legend{display:none}   /* legend removed; data sources stay in the side panel */
</style>`);

// ---- light / dark theme --------------------------------------------------------------------
// 자동 (default): light from sunrise to sunset in Seoul, dark at night; 라이트 / 다크: fixed by the viewer.
const MAP_THEMES={
  light:{bld3d:'#d9dde0',bld3dOpacity:.5,bg:'#edf2f1',water:'#cfe0e8',park:'#dde8da',land:'#e1eadf',bld:'#dfe4e6',roadMinor:'#ffffff',roadMajor:'#ffffff',rail:'#c3cbcf',
         text:'#56656a',road:'#7a8589',waterText:'#5d8aa3',parkText:'#5f8a5a',poi:'#8a7f6d',halo:'rgba(255,255,255,.9)',stationText:'#141414'},
  dark:{bld3d:'#3a4a53',bld3dOpacity:.78,bg:'#10181c',water:'#16293a',park:'#15241c',land:'#15211b',bld:'#1c262b',roadMinor:'#243238',roadMajor:'#2f3f47',rail:'#35454d',
        text:'#9aabb1',road:'#7f9096',waterText:'#6f9bb5',parkText:'#6e9a69',poi:'#a59a86',halo:'rgba(12,19,23,.9)',stationText:'#eef3f4'},
};
// 지도 색 (settings): 차분 keeps the quiet greys above; 컬러 paints water, green, roads and buildings over them
const MAP_COLORS={
  light:{water:'#7cbfe8',park:'#9dd487',land:'#b3daa0',bld:'#e5dac8',bld3d:'#ddd0bb',bld3dOpacity:.6,bg:'#eeeadc',roadMinor:'#ffffff',roadMajor:'#ffffff',rail:'#b9b2c8',waterText:'#2f78a8',parkText:'#3f8a3a'},
  dark:{water:'#1a4260',park:'#21452c',land:'#1e3a28',bld:'#262d38',bld3d:'#444a5c',bld3dOpacity:.78,bg:'#141c24',roadMinor:'#2a343c',roadMajor:'#3e4650',rail:'#4a4560',waterText:'#7fb4d8',parkText:'#7cbf74'},
};
// 롤러코스터: the city as a pastel amusement park (Codex design) — every building one of six pastels by its feature id, solid
// (just for fun: a building may hide a train), the ground in park colours (차분: 15 % toward the background). The towers
// (RIDE_H m and up) become rides.
const PARK_COLORS={
  light:{blocks:['#eacb80','#e5ae91','#dca2b9','#baaad8','#96c5d8','#abd0ae'],bg:'#f5eedf',park:'#c5ddb3',land:'#d8e4c6',water:'#afd5de',bld:'#dfd2c0',shadow:.06,light:'#ffffff',lightK:.35},
  dark:{blocks:['#ad9159','#ab7864','#a46c89','#8977ad','#6597ad','#789d7d'],bg:'#242329',park:'#354a39',land:'#303d32',water:'#2b4c5b',bld:'#3b343e',shadow:.03,light:'#fff1de',lightK:.25},
};
const RIDE_H=150;
let wallsNow=()=>{};   // the train canvas's building walls, again (set up with it)
const mixHex=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
const MAP_COLOR_KEY='subway-map-color';let mapColor='calm';try{mapColor=localStorage.getItem(MAP_COLOR_KEY)||'calm'}catch{}
const THEME_KEY='subway-theme';
const mapPalette=(t=effectiveTheme())=>{const P={...MAP_THEMES[t],...(mapColor==='color'?MAP_COLORS[t]:{})};if(!coaster)return P;
  const K=PARK_COLORS[t],m=mapColor==='color'?0:.15,Q={...P,...K,bld3dOpacity:1};for(const k of ['bg','park','land','water','bld'])Q[k]=mixHex(K[k],K.bg,m);
  const id=['abs',['to-number',['id'],0]],ci=['%',['floor',['/',['*',['%',id,9973],['%',id,9967]],7]],6];   // ids run in tens and hundreds (osm id × 10…): two residues multiplied mix them
  Q.bld3d=['match',ci,...K.blocks.slice(0,5).flatMap((v,i)=>[i,v]),K.blocks[5]];
  // at night the façades carry lit windows (Codex): images with the colour baked in (a pattern replaces the colour) —
  // from z15 a window tile on buildings 20 m and up (two in three), a plain tile on the rest
  if(t==='dark'){const h3=['%',['floor',['/',['*',['%',id,9967],['%',id,9973]],11]],3],solid=['concat','park-s-',['to-string',ci]];
    Q.bld3dPattern=['step',['zoom'],solid,15,['case',['all',['>=',['coalesce',['get','render_height'],10],20],['!=',h3,0]],['concat','park-w-',['to-string',ci],'-',['to-string',['%',h3,2]]],solid]]}
  return Q};
// the night façade tiles: 64 px (shown at ~21: pixelRatio 3), 4×4 windows of 4×6 px, 5 of 16 lit (four warm, one cool)
function parkPatterns(){
  if(map.hasImage('park-s-0'))return;const B=PARK_COLORS.dark.blocks,S=64,dim=c=>mixHex(c,'#000000',.15);
  for(let c=0;c<6;c++){
    const solid=document.createElement('canvas');solid.width=solid.height=S;const x=solid.getContext('2d');x.fillStyle=B[c];x.fillRect(0,0,S,S);map.addImage(`park-s-${c}`,x.getImageData(0,0,S,S),{pixelRatio:3});
    for(let v=0;v<2;v++){const cv=document.createElement('canvas');cv.width=cv.height=S;const y=cv.getContext('2d');y.fillStyle=B[c];y.fillRect(0,0,S,S);
      let r=(c*7+v*13+1)*2654435761>>>0;const rnd=()=>(r=Math.imul(r^r>>>15,2246822519)>>>0,r/4294967296);
      const lit=new Set();while(lit.size<5)lit.add(Math.floor(rnd()*16));let k=0;
      for(let i=0;i<16;i++){y.fillStyle=lit.has(i)?(k++===4?'#bbdad9':'#ffe1a0'):dim(B[c]);y.fillRect((i%4)*16+6,Math.floor(i/4)*16+5,4,6)}
      map.addImage(`park-w-${c}-${v}`,y.getImageData(0,0,S,S),{pixelRatio:3})}}
}
let themeChoice='auto';
try{themeChoice=localStorage.getItem(THEME_KEY)||'auto'}catch{}
// Sunrise / sunset for Seoul (sunrise equation; accurate to a few minutes)
function effectiveTheme(){if(themeChoice!=='auto')return themeChoice;const now=new Date(),{rise,set}=seoulSun(now);return now>=rise&&now<set?'light':'dark'}
function applyTheme(){queueMicrotask(()=>{if(map.getLayer?.('journey-veil'))focusRoute(!!routeBounds)});
  const t=effectiveTheme(),P=mapPalette();
  for(const b of document.querySelectorAll('[data-map-color]'))b.setAttribute('aria-pressed',String(b.dataset.mapColor===mapColor));
  document.documentElement.dataset.theme=t;
  // favicon follows the map theme (the <link media> pair only knows the OS setting)
  for(const l of document.querySelectorAll('link[data-theme-icon]'))l.href=`./brand/favicon-${t}.svg`;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content',t==='dark'?'#1b1c1f':'#ffd400');
  // header logo: black tile on the yellow bar, yellow tile on the dark bar
  const bi=document.querySelector('.brand-icon');if(bi)bi.src=`./brand/syung-${t==='dark'?'light':'dark'}.svg`;
  // settings row: 자동 / 라이트 / 다크; in 자동 the icon is the sun over the map and the note gives sunrise / sunset
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.setAttribute('aria-pressed',String(b.dataset.themeChoice===themeChoice));
  const ti=$('themeIcon'),tn=$('themeNote');
  if(ti&&tn){
    if(themeChoice==='auto'){const sa=sunArcIcon();ti.innerHTML=sa.svg;tn.textContent=`일출 ${sa.rise}\n일몰 ${sa.set}`}
    else{ti.innerHTML=ICONS[t==='dark'?'moon':'sun'];tn.textContent=''}
  }
  if(!ready)return;
  const set=(id,prop,v)=>{if(map.getLayer(id))map.setPaintProperty(id,prop,v)};
  set('background','background-color',P.bg);map.triggerRepaint();
  set('bm-water','fill-color',P.water);set('bm-park','fill-color',P.park);set('bm-landcover','fill-color',P.land);set('bm-bld','fill-color',P.bld);
  if(P.bld3dPattern)parkPatterns();set('bm-bld3d','fill-extrusion-color',P.bld3d);set('bm-bld3d','fill-extrusion-pattern',P.bld3dPattern??undefined);set('bm-bld3d','fill-extrusion-opacity',P.bld3dOpacity);if(map.getLayer('bm-bld3d')){map.setFilter('bm-bld3d',coaster?['<',['coalesce',['get','render_height'],10],RIDE_H]:null);map.setPaintProperty('bm-bld3d','fill-extrusion-vertical-gradient',!coaster)}   // the towers are rides on the coaster
  set('bm-road-minor','line-color',P.roadMinor);set('bm-road-major','line-color',P.roadMajor);set('bm-rail','line-color',P.rail);
  for(const [id,c] of [['bm-label-place',P.text],['bm-label-road',P.road],['bm-label-water',P.waterText],['bm-label-park',P.parkText],['bm-label-poi',P.poi]]){set(id,'text-color',c);set(id,'text-halo-color',P.halo)}
  for(const id of ['station-labels','station-labels-more']){set(id,'text-color',P.stationText);set(id,'text-halo-color',P.halo)}
}
document.head.insertAdjacentHTML('beforeend',`<style>
html[data-theme=dark]{--board:#0f171b;--paper:#152026;--ink:#e2ebee;--secondary:#a2b3b8;--muted:#8799a0;--rule:#28383f;--navy:#0a171d;--control:#1b2930;--selected:#213d48;color-scheme:dark}
html[data-theme=dark] .map{background-color:#10181c!important;background-image:linear-gradient(rgba(160,200,210,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(160,200,210,.05) 1px,transparent 1px)!important}
html[data-theme=dark] .map-status,html[data-theme=dark] .legend{background:rgba(21,32,38,.94);border-color:rgba(160,190,200,.18);color:var(--secondary)}
html[data-theme=dark] .map-toggle,html[data-theme=dark] .train-toggle,html[data-theme=dark] .webgl-zoom{background:#152026;color:var(--ink);border-color:#3a4b52}
html[data-theme=dark] .map-toggle[aria-pressed=true],html[data-theme=dark] .train-toggle[aria-pressed=true]{background:#2b6f8f;border-color:#2b6f8f;color:#fff}
html[data-theme=dark] .search input,html[data-theme=dark] .line-select{background:var(--control);color:var(--ink);border-color:#3a4b52}
html[data-theme=dark] .maplibregl-ctrl-group{background:#152026}html[data-theme=dark] .maplibregl-ctrl-group button+button{border-top-color:#2b3a40}
html[data-theme=dark] .maplibregl-ctrl-group button .maplibregl-ctrl-icon{filter:invert(1) hue-rotate(180deg)}
html[data-theme=dark] .maplibregl-popup-content{background:#152026;color:var(--ink)}html[data-theme=dark] .maplibregl-popup-tip{border-top-color:#152026;border-bottom-color:#152026}
html[data-theme=dark] .train-inspect .sec{color:var(--ink);border-bottom-color:#2b3a40}
.theme-toggle{top:206px}
#lineSelect{display:none}
.map-status{display:none}   /* title/description box over the map: removed */   /* line filter: the list of line buttons below is enough */
</style>`);
for(const b of document.querySelectorAll('[data-map-color]'))b.onclick=()=>{mapColor=b.dataset.mapColor;try{localStorage.setItem(MAP_COLOR_KEY,mapColor)}catch{}applyTheme()};
for(const b of document.querySelectorAll('[data-theme-choice]'))b.onclick=()=>{themeChoice=b.dataset.themeChoice;try{localStorage.setItem(THEME_KEY,themeChoice)}catch{}applyTheme()};
$('themeNote').closest('.setting-row').title='자동은 해 뜨면 라이트, 해 지면 다크.';
setInterval(()=>{if(themeChoice==='auto')applyTheme();updateSun()},5*60*1000);

// ---- sun position icon (theme button in 자동) -------------------------------------------------
// Horizon, the day's arc filled up to the sun's place (moon + night progress after sunset).
function sunArcIcon(){
  // Top-down: the ring is the horizon around "here"; the sun sits at its compass bearing as seen on the
  // map (rotates with the map), nearer the centre the higher it is; the stub from the centre is the
  // shadow, pointing the same way as the building shadows.
  const now=window.__sunTime||new Date(),{rise,set}=seoulSun(now),hm=d=>d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
  const {elevation:el,azimuth:az}=sunPosition(now),day=el>0,f=n=>n.toFixed(1);
  const S=22,c=S/2,R=8.5,ang=(az-(ready?map.getBearing():0))*Math.PI/180,r=R*(1-Math.max(0,Math.min(90,el))/90*.75);
  const sx=c+Math.sin(ang)*r,sy=c-Math.cos(ang)*r,len=day?Math.min(7,1.2/Math.tan(Math.max(4,el)*Math.PI/180)*3):0;
  const hx=c-Math.sin(ang)*len,hy=c+Math.cos(ang)*len;
  const svg=day
    ?`<svg width="22" height="22" viewBox="0 0 ${S} ${S}" aria-hidden="true">
       <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.1" stroke-dasharray="2 1.6"/>
       <line x1="${c}" y1="${c}" x2="${f(hx)}" y2="${f(hy)}" stroke="currentColor" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>
       <circle cx="${c}" cy="${c}" r="1.4" fill="currentColor"/>
       <circle cx="${f(sx)}" cy="${f(sy)}" r="3.2" fill="#f5a524" stroke="#d98a0b" stroke-width="1"/></svg>`
    :`<svg width="22" height="22" viewBox="0 0 ${S} ${S}" aria-hidden="true">
       <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="1.1" stroke-dasharray="2 1.6"/>
       <path d="M${c+1.8} ${c-5}a5 5 0 1 0 3.3 8.3a4 4 0 1 1-3.3-8.3z" fill="#b8c9da" stroke="#7f97b0" stroke-width=".7"/></svg>`;
  return {svg,rise:hm(rise),set:hm(set),day};
}

// ---- sun light and shadows ----------------------------------------------------------------
// Real-time sun position over Seoul drives building face lighting (map light) and ground shadows:
// each building footprint is swept away from the sun by height ÷ tan(elevation) and the hull drawn
// on the ground under the lines. Trains cast their shadow the same way. No shadows after sunset.
let sunTrainShadow=[1.1,1.5];
function hull(pts){pts=[...pts].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const c=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];
  for(const p of pts){while(lo.length>1&&c(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}
  for(const p of pts.reverse()){while(up.length>1&&c(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p)}
  return lo.slice(0,-1).concat(up.slice(0,-1))}
// Ground shadows: every hull is drawn once into an offscreen mask (so overlapping shadows don't stack
// up darker), then the mask is laid over the map at one opacity.
class SunShadowLayer{
  constructor(){this.id='sun-shadows';this.type='custom';this.renderingMode='2d';this.geo=null;this.alpha=0}
  set(geo,alpha){this.geo=geo;this.alpha=alpha;this.dirty=true}
  onAdd(map,gl){
    this.map=map;
    const sh=(t,src)=>{const x=gl.createShader(t);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    const prog=(v,f)=>{const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,v));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);return p};
    this.pMask=prog(`#version 300 es
in vec2 a;uniform mat4 m;void main(){gl_Position=m*vec4(a,0.,1.);}`,`#version 300 es
precision mediump float;out vec4 o;void main(){o=vec4(1.);}`);
    this.pComp=prog(`#version 300 es
in vec2 a;out vec2 uv;void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}`,`#version 300 es
precision mediump float;in vec2 uv;uniform sampler2D t;uniform vec4 c;out vec4 o;void main(){o=c*texture(t,uv).a;}`);
    this.buf=gl.createBuffer();this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);
    this.tex=gl.createTexture();this.fbo=gl.createFramebuffer();this.w=0;this.h=0;
  }
  render(gl,options){
    if(!this.geo||!this.geo.data.length||this.alpha<=0)return;
    const W=gl.drawingBufferWidth,H=gl.drawingBufferHeight,prevFbo=gl.getParameter(gl.FRAMEBUFFER_BINDING),prevVp=gl.getParameter(gl.VIEWPORT);
    if(W!==this.w||H!==this.h){gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.tex,0);this.w=W;this.h=H}
    // 1) mask
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.STENCIL_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true,true,true,true);gl.bindVertexArray(null);   // MapLibre may leave masks / a VAO bound
    const M=options.defaultProjectionData.mainMatrix,MT=Array.from(M),{ox,oy}=this.geo;for(let r=0;r<4;r++)MT[12+r]=M[r]*ox+M[4+r]*oy+M[12+r];
    gl.useProgram(this.pMask);gl.uniformMatrix4fv(gl.getUniformLocation(this.pMask,'m'),false,new Float32Array(MT));
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);if(this.dirty){gl.bufferData(gl.ARRAY_BUFFER,this.geo.data,gl.DYNAMIC_DRAW);this.dirty=false}
    let loc=gl.getAttribLocation(this.pMask,'a');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLES,0,this.geo.data.length/2);
    // 2) composite
    gl.bindFramebuffer(gl.FRAMEBUFFER,prevFbo);gl.viewport(prevVp[0],prevVp[1],prevVp[2],prevVp[3]);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.pComp);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(gl.getUniformLocation(this.pComp,'t'),0);
    const a=this.alpha;gl.uniform4f(gl.getUniformLocation(this.pComp,'c'),.11*a,.17*a,.2*a,a);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);loc=gl.getAttribLocation(this.pComp,'a');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
}
const sunShadows=new SunShadowLayer();
function updateSun(){
  if(!ready)return;
  const {elevation:el,azimuth:az}=sunPosition(),up=el>1,dark=effectiveTheme()==='dark';
  // face lighting: light comes from the sun (polar = 90° − elevation); a soft overhead light at night
  const K=coaster&&PARK_COLORS[dark?'dark':'light'];   // the park: a warm light, softer (no blue cast at night)
  try{map.setLight({anchor:'map',position:[1.4,up?az:0,up?Math.max(10,90-el):20],intensity:K?K.lightK:up?.55:.3,color:K?K.light:dark?'#9fb4c8':'#ffffff'})}catch{}
  // trains: shadow away from the sun, longer when it is low
  const sh=up?Math.min(7,1.6/Math.tan(el*Math.PI/180)):1.2,away=(az+180)*Math.PI/180;
  sunTrainShadow=up?[Math.sin(away)*sh,-Math.cos(away)*sh]:[.8,1.1];
  // buildings
  if(!up||map.getZoom()<14.5||!map.getLayer('bm-bld3d')||map.getLayoutProperty('bm-bld3d','visibility')==='none'){sunShadows.set(null,0);map.triggerRepaint();return}
  const k=1/Math.tan(el*Math.PI/180),ux=Math.sin(away),uy=Math.cos(away),seen=new Set(),tris=[];
  const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter());
  for(const f of map.querySourceFeatures('ofm',{sourceLayer:'building'})){
    const h=+(f.properties.render_height??10),g=f.geometry;if(!h||!g||coaster&&h>=RIDE_H)continue;
    const rings=g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):[];
    for(const ring of rings){
      if(!ring||ring.length<3)continue;
      const key=ring[0][0].toFixed(6)+ring[0][1].toFixed(6)+h;if(seen.has(key))continue;seen.add(key);
      // real low-sun shadows run ~10× the height; on a map that blankets whole blocks, so cap at 3.5× height / 250 m
      const len=Math.min(250,h*Math.min(k,3.5)),kx=Math.cos(ring[0][1]*Math.PI/180),dx=ux*len/(111320*kx),dy=uy*len/111320;
      const pts=[];for(const [x,y] of ring){pts.push([x,y]);pts.push([x+dx,y+dy])}
      const hp=hull(pts).map(q=>{const m=maplibregl.MercatorCoordinate.fromLngLat(q);return [m.x-O.x,m.y-O.y]});
      for(let i=1;i<hp.length-1;i++)tris.push(...hp[0],...hp[i],...hp[i+1]);   // convex hull → triangle fan
    }
  }
  // fade in over the first ~8° after sunrise (and out before sunset): very long low-sun shadows get cut off otherwise
  const fade=Math.max(0,Math.min(1,(el-2)/13));   // fade in over the first ~15° after sunrise, out before sunset
  // phones: small bright screens make the same shade read much darker, so lighten it there
  const phone=matchMedia('(max-width:720px),(pointer:coarse)').matches?.35:1;
  sunShadows.set({data:new Float32Array(tris),ox:O.x,oy:O.y},Math.min(coaster?mapPalette().shadow:.34,.14+el/150)*fade*(dark?.55:1)*phone);
  map.triggerRepaint();
}

applyTheme();

// Background map: OpenFreeMap vector tiles (OSM data, no key) drawn with only water, green space,
// streets and faint building footprints — no shops, stops or labels competing with the lines.
const BASEMAP_LAYERS=['bm-landcover','bm-park','bm-water','bm-bld','bm-bld3d','bm-road-minor','bm-road-major','bm-rail','bm-label-water','bm-label-park','bm-label-road','bm-label-poi','bm-label-place'];
function addBasemap(){
  map.addSource('ofm',{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenMapTiles © OpenStreetMap contributors'});
  const L=o=>map.addLayer(o,'routes');
  L({id:'bm-landcover',type:'fill',source:'ofm','source-layer':'landcover',filter:['in',['get','class'],['literal',['wood','grass']]],paint:{'fill-color':'#e1eadf','fill-opacity':.7}});
  L({id:'bm-park',type:'fill',source:'ofm','source-layer':'park',paint:{'fill-color':'#dde8da','fill-opacity':.8}});
  L({id:'bm-water',type:'fill',source:'ofm','source-layer':'water',paint:{'fill-color':'#cfe0e8'}});
  L({id:'bm-bld',type:'fill',source:'ofm','source-layer':'building',minzoom:14,paint:{'fill-color':'#dfe4e6','fill-opacity':['interpolate',['linear'],['zoom'],14,0,15,.9]}});
  // buildings rise in 3D from zoom 14; trains read their depth so they pass between them
  map.addLayer(sunShadows,'routes');   // on the ground: over water/parks/building footprints, under streets (added next), lines and 3D buildings
  // Translucent buildings drawn last, over lines, platforms and trains: whatever is behind a building
  // shows through it; trains write their depth first so a building behind a train doesn't cover it.
  map.addLayer({id:'bm-bld3d',type:'fill-extrusion',source:'ofm','source-layer':'building',minzoom:PHONE?15:14,paint:{'fill-extrusion-color':'#d9dde0','fill-extrusion-height':['interpolate',['linear'],['zoom'],14,0,15,['coalesce',['get','render_height'],10]],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.5}});
  L({id:'bm-road-minor',type:'line',source:'ofm','source-layer':'transportation',minzoom:14,filter:['in',['get','class'],['literal',['tertiary','minor']]],paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],14,.6,17,3],'line-opacity':.8}});
  L({id:'bm-road-major',type:'line',source:'ofm','source-layer':'transportation',filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary']]],paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],10,.8,14,3,17,9]}});
  // labels: glyphs from OpenFreeMap for Latin; Hangul is drawn with the device's own font (localIdeographFontFamily)
  try{if(!map.getGlyphs?.())map.setGlyphs('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf')}catch{}
  const name=['coalesce',['get','name:ko'],['get','name']],font=['Noto Sans Regular'],halo={'text-halo-color':'rgba(255,255,255,.9)','text-halo-width':1.4};
  L({id:'bm-rail',type:'line',source:'ofm','source-layer':'transportation',filter:['==',['get','class'],'rail'],minzoom:12,paint:{'line-color':'#c3cbcf','line-width':1.2,'line-dasharray':[3,2]}});
  // symbols sit under the route lines so map text never covers lines, stations or trains
  const sym=(id,layer,filter,minzoom,layout,paint)=>map.addLayer({id,type:'symbol',source:'ofm','source-layer':layer,...(filter?{filter}:{}),minzoom,layout:{'text-field':name,'text-font':font,...layout},paint:{...halo,...paint}},'routes');
  sym('bm-label-water','water_name',null,11,{'text-size':12,'text-letter-spacing':.1},{'text-color':'#5d8aa3'});
  sym('bm-label-park','park',null,14,{'text-size':11,'symbol-placement':'point'},{'text-color':'#5f8a5a'});
  sym('bm-label-road','transportation_name',['in',['get','class'],['literal',['motorway','trunk','primary','secondary','tertiary']]],13,{'text-size':['interpolate',['linear'],['zoom'],13,10,17,13],'symbol-placement':'line','text-max-angle':30},{'text-color':'#7a8589'});
  sym('bm-label-poi','poi',['all',['<=',['get','rank'],8],['in',['get','class'],['literal',['college','school','hospital','park','stadium','castle','monument','museum','townhall','attraction']]]],15,{'text-size':11,'text-anchor':'top','text-offset':[0,.3]},{'text-color':'#8a7f6d'});
  sym('bm-label-place','place',['in',['get','class'],['literal',['city','town','suburb','quarter','neighbourhood']]],10,{'text-size':['match',['get','class'],'suburb',14,'quarter',12,'neighbourhood',11,15],'text-letter-spacing':.05},{'text-color':'#56656a'});
  applyTheme();
}
$('toggleMap').onclick=e=>{
  if(!ready)return;
  const on=e.currentTarget.getAttribute('aria-pressed')!=='true';
  e.currentTarget.setAttribute('aria-pressed',String(on));
  if(on&&!map.getSource('ofm'))addBasemap();
  for(const id of BASEMAP_LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none');
  updateSun();
};
// 롤러코스터: on, the lines are lifted onto their own paths (coasterPath; the route lines on the ground follow them, faintly) and the view
// tilts to show it; the speed buttons run its clock ×1/×5/×20 (1배 = back to the live positions)
function setCoaster(on,speed=coasterSpeed){
  if(on&&!coasterBld){coasterWant=true;$('toggleCoaster').setAttribute('aria-pressed','true');loadCoasterBuildings().then(()=>{if(coasterWant)setCoaster(true,speed)});return}   // its courses need the buildings: wait for them
  coasterWant=on;
  const was=coaster;coaster=on;coasterSpeed=on?speed:1;if(coasterSpeed===1){warp=0;warpAt=0}else warpNow();
  $('toggleCoaster').setAttribute('aria-pressed',String(on));$('coasterSpeed').hidden=!on;
  for(const b of document.querySelectorAll('[data-speed]'))b.setAttribute('aria-pressed',String(+b.dataset.speed===coasterSpeed));
  $('speedNote').textContent=coasterSpeed>1?'실제보다 앞서 달려요':'실시간';
  if(was!==on){setRouteOpacity();map.getSource('routes')?.setData({type:'FeatureCollection',features:buildLineFeatures()});plans=trains.map(planTrain).filter(Boolean);lastPose.clear();
    if(on&&map.getPitch()<40)map.easeTo({pitch:60,zoom:Math.max(map.getZoom(),14.5),duration:900});
    applyTheme();updateSun();wallsNow()}   // the park colours, and the towers out of the shadows and walls
  map.triggerRepaint();
}
$('toggleCoaster').onclick=()=>setCoaster(!coaster);
for(const b of document.querySelectorAll('[data-speed]'))b.onclick=()=>setCoaster(true,+b.dataset.speed);
$('toggleTrains').onclick=e=>{trainsEnabled=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(trainsEnabled));map.triggerRepaint()};
// ---- settings (gear in the header): on/off switches ----
{
  {const z=$('zoomBadge'),show=()=>{z.textContent='z'+map.getZoom().toFixed(1)};map.on('zoom',show);show()}   // the zoom beside 새로고침, for checking views
  $('refreshButton').onclick=e=>{e.currentTarget.classList.add('spin');setTimeout(()=>location.reload(),250)};   // picks up a new deploy (plain asset URLs, no cache-busting)
  const btn=$('settingsButton'),panel=$('settingsPanel');
  $('toggleMap').querySelector('.setting-icon').innerHTML=ICONS.map;$('toggleTrains').querySelector('.setting-icon').innerHTML=ICONS.train;
  $('toggleCoaster').querySelector('.setting-icon').innerHTML=ICONS.coaster;$('mapColorIcon').innerHTML=ICONS.palette;$('coasterSpeed').querySelector('.setting-icon').innerHTML=ICONS.speed;
  const setOpen=o=>{panel.hidden=!o;btn.setAttribute('aria-expanded',String(o))};
  btn.onclick=e=>{e.stopPropagation();setOpen(panel.hidden)};
  document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target))setOpen(false)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){setOpen(false);btn.focus()}});
}
map.on('move',scheduleLabels);map.on('resize',scheduleLabels);
// Server caches ~90s and the upstream key has a daily quota: don't poll from background tabs.
// The proxy refreshes upstream every 90 s and serves its cache in between, so polling it often is
// free and picks up each upstream refresh within ~20 s.
// one timer: every 20 s, or every 10 s while a train's sheet is open (served from the proxy's cache).
// Two separate 20 s / 10 s timers fired together every 20 s and sent the same request twice.
setInterval(()=>{if(!document.hidden&&(sheetTrain||Date.now()-liveAt>=19000))refreshLive(true)},10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLive(true)});
let liveMoveTimer=0;map.on('moveend',()=>{clearTimeout(liveMoveTimer);liveMoveTimer=setTimeout(()=>refreshLive(),600)});
window.__subwayWebGL={map,refreshLive,updateSun,applyTheme,sunPosition,trackPoint,edgeCoords,get plans(){return plans},get renderer(){return map.getCanvas().getContext('webgl2')?'webgl2':'none'}};
