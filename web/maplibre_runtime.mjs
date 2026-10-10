import * as maplibregl from './vendor/maplibre-gl.mjs';
import {key,normStatus,createRouter,NEW_NAMES} from './lib/routing.mjs';
import {seoulSun,sunPosition as sunAt} from './lib/sun.mjs';
import {initJourney} from './lib/journey-ui.mjs';
import {createCoasterTrack} from './modes/coaster/track.mjs';   // 롤코 선로 층
import {createCoasterGeometry} from './modes/coaster/geometry.mjs';   // 롤코 길 · 언덕 계산
import {createCoasterMotion} from './modes/coaster/motion.mjs';   // 롤코 주행 속도 · 탄 거리
import {SunShadowLayer,hull} from './map/sun.mjs';   // 해 그림자 층
import {createStationLabels} from './map/labels.mjs';   // 역 이름표 자료
import {StationNameLayer,ExitPillars} from './map/platform.mjs';   // 승강장 막대 · 출구 통로 · 출구 기둥
import {createTrainPlanner} from './trains/plan.mjs';   // 열차 예측
import {createLiveFeed} from './trains/live_feed.mjs';   // 실시간 열차 받기 · 기록
import {createBusLayer} from './lib/bus_layer.mjs';   // bus: optional Seoul routes, stops and live vehicles
import {journeyCasingPaint,journeyRidePaint,journeyStopPaint} from './lib/journey_map_style.mjs';   // bus: one journey presentation for route numbers and search results
import {SEOUL_COASTER_STYLE as COASTER_STYLE} from './lib/coaster_style_seoul.mjs';   // coaster: shared park palette and metre/pixel dimensions
import {buildCoasterTrackMesh,coasterTrackVertexShader,COASTER_TRACK_FS} from './lib/coaster_track_mesh.mjs';   // 롤코 선로 메시 · 셰이더(선로 층에 넘김)
import {NightLayer} from './lib/park_night.mjs';
import {RIDE_ZOOM,rideFov,RIDE_NEAR_M,COCKPIT_NEAR_M,nearMatrix,RIDE_FAR_M,seatRows,seatIndex,seatNumber,seatEye,rideCamera,seatPickerHTML,seatLabel} from './lib/coaster_first_person.mjs';   // 롤코 1인칭: 자리 고르기 · 그 자리 눈의 카메라
import {addCityLayers,applyCityStyle,applyGroundTexture,cityPalette} from './lib/city_style.mjs';   // city-life: the miniature city's ground (zone floors, roads, lane marks)
import {CityLife} from './lib/city_life.mjs';
import CITY_STYLE from './lib/city_style_seoul.mjs';   // city-life: the one style pack (colours, metres, zooms) the city reads
import JOSEON_STYLE from './lib/city_style_joseon.mjs';   // 조선 모드: the same city in packed earth and 기와집 (cityPack())
import {platformStroke} from './lib/platform_stroke.mjs';
import {drawStationSigns,signRows,signTextSize,perspectiveRatio,placeholderText,sortLines,signCollisionLayout,signAnchor} from './lib/station_signs.mjs';   // 역 이름표: 열차 · 고가 위에 떠 있는 팻말
import {catchup,catchupAt} from './lib/train_catchup.mjs';   // 앞선 예측을 따라잡을 때 더하는 속도에 상한
import {offsetCoords,trackStart,extendStart,closestPlatformPoint} from './lib/platform_route.mjs';
import {CityViaduct} from './lib/city_viaduct.mjs';
import {stops as snapStops} from './lib/city_viaduct_snap.mjs';   // 기본·심시티: 도로 위로 옮긴 지하 역 점(곧은 승강장이면 방향도)   // city-life: 심시티 — the viaduct every line rides in that mode (deck, piers, roofed platforms; the trains are lifted onto it below)

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
let shapes={},stops={},stopDirs={},stopHalf={},platformHalf={},stopWidth={},stopReach={};   // stopDirs: platform direction (east, north) per line:stop, along its street   // stopReach: 출구가 한쪽 끝 밖에 몰린 역의 통로 끝 [lon, lat]
// 기본·심시티는 도로 맞춤 경로 끝과 같은 옮긴 역 점을, 롤코는 원래 역 점(stops)을 써요. 원본 stops는 바꾸지 않아요.
const stopPos=(line,s)=>{const k=`${line}:${s.id}`,m=snapStops[k];return m?[m[0],m[1]]:stops[k]||[s.lon,s.lat]};   // 롤코도 같은 역 점: 롤코가 심시티 고가(cityGeom) 위를 달리게 된 뒤(4899978)에도 원본 역 점을 써서 승강장이 어긋났다(2026-10-10 화랑대)
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
const basicRouteCache=new Map();
const terminalStops=new Set(),stopLinks=new Map();{   // stopLinks: line:역 → 그 노선의 이웃 역들
  for(const [line,chunks] of Object.entries(paths))for(const ids of chunks)for(let i=1;i<ids.length;i++)for(const [a,b] of [[ids[i-1],ids[i]],[ids[i],ids[i-1]]]){const k=`${line}:${a}`;if(!stopLinks.has(k))stopLinks.set(k,new Set());stopLinks.get(k).add(b)}
  for(const [key,set] of stopLinks)if(set.size===1)terminalStops.add(key);
}
// 공유 선로 칸이 역 앞뒤로 바뀌는 역(청량리 1호선: 제기동 쪽은 혼자, 회기 쪽은 경의중앙·경춘과 셋)은 승강장 안을 한 칸에 두고
// 승강장 밖 SLOT_EASE_M 동안 구간의 칸으로 옮겨 가요. 역의 칸은 함께 쓰는 노선이 가장 많은 이웃 구간의 칸(lo→hi 방향 기준).
const SLOT_EASE_M=80;
function stopSlot(line,id,lo,hi){
  let best=null;
  for(const n of stopLinks.get(`${line}:${id}`)||[]){
    const a=Math.min(id,n),b=Math.max(id,n),size=edgeLines.get(edgeKey(a,b))?.size||1,o=a===lo&&b===hi?edgeOffset(line,a,b):edgeOffset(line,a,b)*((id===hi)===(id===a)?1:-1);
    if(!best||size>best.size||size===best.size&&Math.abs(o)<Math.abs(best.o))best={size,o};
  }
  return best?best.o:edgeOffset(line,lo,hi);
}
function basicTrack(line,lo,hi){
  const key=`${line}:${lo}:${hi}`,mid=edgeOffset(line,lo,hi),sLo=stopSlot(line,lo,lo,hi),sHi=stopSlot(line,hi,lo,hi),shifted=Boolean(mid||sLo||sHi),zoom=shifted?map.getZoom():0;
  let cached=basicRouteCache.get(key);if(cached?.zoom===zoom)return cached;
  const hLo=(platformHalf[`${line}:${lo}`]||PLATFORM_HALF)+5,hHi=(platformHalf[`${line}:${hi}`]||PLATFORM_HALF)+5,ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
  const slot=(d,total)=>{const a=1-ease((d-hLo)/SLOT_EASE_M),b=1-ease((total-d-hHi)/SLOT_EASE_M);return (sLo*a+sHi*b+mid*Math.max(0,1-a-b))/Math.max(1,a+b)};
  const train=offsetCoords(cityCoords(line,lo,hi),sLo===mid&&sHi===mid?mid:slot,map.getZoom()),coords=[...train];
  const terminal=id=>terminalStops.has(`${line}:${id}`);
  if(terminal(lo))coords.unshift(extendStart(train,platformHalf[`${line}:${lo}`]||PLATFORM_HALF));
  if(terminal(hi))coords.push(extendStart([...train].reverse(),platformHalf[`${line}:${hi}`]||PLATFORM_HALF));
  cached={zoom,train,coords,shifted};basicRouteCache.set(key,cached);return cached;
}
function buildLineFeatures(){
  const features=[],drawn=new Set();
  Object.entries(paths).forEach(([line,chunks])=>chunks.forEach(ids=>ids.slice(1).forEach((b,i)=>{
    const lo=Math.min(ids[i],b),hi=Math.max(ids[i],b),id=`${line}:${lo}:${hi}`;
    if(drawn.has(id)||!byId.has(lo)||!byId.has(hi))return;drawn.add(id);
    const coords=coaster?coasterPath(line,lo,hi).pts.map(q=>new maplibregl.MercatorCoordinate(q.x,q.y).toLngLat().toArray()):simcity?cityCoords(line,lo,hi):basicTrack(line,lo,hi).coords;   // 롤코는 고유 경로, 기본·심시티는 도로 맞춤 경로를 우선해요.
    features.push({type:'Feature',properties:{line,color:colors[line],offset:!coaster&&!simcity?0:edgeOffset(line,lo,hi)},geometry:{type:'LineString',coordinates:coords}});
  })));
  return features;
}
const edgeGeom=new Map();
// 역 사이 열차 경로는 도로 맞춤 경로를 우선하고, 롤코는 coasterPath를 유지해요.
function geom(line,a,b){return coaster?coasterPath(line,a,b):cityGeom(line,a,b)}
// 기본·심시티에서 스냅이 있으면 노선·열차·승강장·여정이 같은 도로 맞춤 경로를 따라가요.
// 스냅이 없으면 기존 선로 경로를 써요(롤코도 같은 경로 — 고가 위를 달려요).
const cityCoords=(line,lo,hi)=>cityViaduct.snapped(line,lo,hi)||edgeCoords(line,lo,hi);
function cityGeom(line,a,b){const lo=Math.min(a,b),hi=Math.max(a,b),sn=cityViaduct.snapped(line,lo,hi);if(!sn)return realGeom(line,a,b);const id=`s:${line}:${lo}:${hi}`;let g=edgeGeom.get(id);if(g)return g;g=withCum(sn.map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)));edgeGeom.set(id,g);return g}
function basicDrawGeom(line,a,b){
  const lo=Math.min(a,b),hi=Math.max(a,b),track=basicTrack(line,lo,hi);if(!track.shifted)return cityGeom(line,a,b);
  const key=`b:${line}:${lo}:${hi}`;
  let g=edgeGeom.get(key);if(g?.track===track)return g;
  g=withCum(track.train.map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)));g.track=track;edgeGeom.set(key,g);return g;
}
const withCum=pts=>{const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));return {pts,cum,total:cum[cum.length-1]}};
function realGeom(line,a,b){
  const lo=Math.min(a,b),hi=Math.max(a,b),id=`${line}:${lo}:${hi}`;
  let g=edgeGeom.get(id);if(g)return g;
  g=withCum(edgeCoords(line,lo,hi).map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)));edgeGeom.set(id,g);return g;
}
// Point and heading at fraction k of the way from station `from` to station `to` along the track.
function along(line,from,to,k){
  if(from===to){const m=mercStop(line,from);return {x:m.x,y:m.y,f:[0,-1]}}
  const g=!coaster&&!simcity?basicDrawGeom(line,from.id,to.id):geom(line,from.id,to.id),rev=from.id>to.id,d=(rev?1-k:k)*g.total;
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
  const c=cityCoords(line,Math.min(s.id,n.id),Math.max(s.id,n.id)),pts=s.id<n.id?c:[...c].reverse(),out=[pts[0]];   // 승강장도 선택한 노선 경로를 따라가요.
  let left=dist;
  for(let i=1;i<pts.length&&left>0;i++){const d=metresBetween(pts[i-1],pts[i]);if(d>=left){const u=left/d;out.push([pts[i-1][0]+(pts[i][0]-pts[i-1][0])*u,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*u]);left=0}else{out.push(pts[i]);left-=d}}
  return out;
}
function neighbours(line,s){for(const ids of paths[line]||[]){const i=ids.indexOf(s.id);if(i>=0)return {prev:byId.get(ids[i-1]),next:byId.get(ids[i+1])}}return {}}
function platformNeighbours(line,s){
  const result=neighbours(line,s);
  // 지선이 여러 chunk에 나뉜 역도 실제 인접 역을 찾아요.
  for(const ids of paths[line]||[]){const i=ids.indexOf(s.id);if(i<0)continue;const p=byId.get(ids[i-1]),n=byId.get(ids[i+1]);if(!result.prev&&p&&p!==result.next)result.prev=p;if(!result.next&&n&&n!==result.prev)result.next=n}
  return result;
}
const STATION_WIDTH_STOPS=[[8,6],[12,11],[14,16],[16,24],[18,28]];   // [zoom, outline width px]
const stationWidthPx=z=>{const S=STATION_WIDTH_STOPS;if(z<=S[0][0])return S[0][1];for(let i=1;i<S.length;i++)if(z<=S[i][0]){const [z0,w0]=S[i-1],[z1,w1]=S[i];return w0+(w1-w0)*(z-z0)/(z1-z0)}return S[S.length-1][1]};
const stationRects=new Map(),PLATFORM_SCALE=.3;   // platform bars: a third of the old outline width (names sit beside them now)
const platformPx=(r,base)=>{if(!r.widthM)return base;const lat=r.coords[0][1]*Math.PI/180,mpp=40075016.686*Math.cos(lat)/(512*2**map.getZoom());return Math.max(base,Math.min(base*2,r.widthM/mpp))};
function buildStationFeatures(){
  return stations.flatMap(s=>s.lines.map(x=>{
    const line=x.name,{prev,next}=neighbours(line,s);
    const back=prev?trackFrom(line,s,prev,PLATFORM_HALF).reverse():[stopPos(line,s)],ahead=next?trackFrom(line,s,next,PLATFORM_HALF):[stopPos(line,s)];
    if(!coaster&&!simcity){
      const {prev,next}=platformNeighbours(line,s);
      const half=platformHalf[`${line}:${s.id}`]||PLATFORM_HALF;
      const from=n=>{const t=basicTrack(line,Math.min(s.id,n.id),Math.max(s.id,n.id)).train;return s.id<n.id?t:[...t].reverse()};
      const incoming=prev?from(prev):null,outgoing=next?from(next):null;
      const bk=incoming?trackStart(incoming,half).reverse():outgoing?[extendStart(outgoing,half),outgoing[0]]:[stopPos(line,s)];
      const ah=outgoing?trackStart(outgoing,half):incoming?[incoming[0],extendStart(incoming,half)]:[stopPos(line,s)];
      const coords=[...bk,...(metresBetween(bk.at(-1),ah[0])<.01?ah.slice(1):ah)],center=(outgoing||incoming)?.[0]||stopPos(line,s);
      stationRects.set(`${line}:${s.id}`,{coords,center,offset:0,widthM:stopWidth[`${line}:${s.id}`]||0,plat:1,half,reach:stopReach[`${line}:${s.id}`]||null});   // reach: 그쪽 끝에서 출구까지 늘린 통로 끝
      return {type:'Feature',properties:{id:s.id,name:s.name,line,lines:s.lines.map(y=>y.name).join('|'),color:colors[line],transfer:s.lines.length>1?1:0,offset:0},geometry:{type:'LineString',coordinates:coords}};
    }
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
    const sm=snapStops[`${line}:${s.id}`],sd=sm?.length>3?[sm[2],sm[3]]:stopDirs[`${line}:${s.id}`];   // 곧은 승강장으로 옮긴 역은 그 도로 방향
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

const shapesReady=fetch('./track_shapes.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{d=d||{};shapes=d.edges||(d.stops?{}:d);stops=d.stops||{};stopDirs=d.stopDirs||{};stopHalf=d.stopHalf||{};platformHalf=d.platformHalf||{};stopWidth=d.stopWidth||{};stopReach=d.stopReach||{};smoothCache.clear();basicRouteCache.clear();stationRects.clear();edgeGeom.clear();coasterMotion.clear();coasterGeo.reset();stopMerc.clear();if(Object.keys(shapes).length)document.querySelector('.provenance')?.insertAdjacentHTML('beforeend',' 선로 형태는 © OpenStreetMap contributors 자료를 사용했습니다.');planner.rebuild()}).catch(()=>{});
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
function trainFrameSoon(ms){const at=performance.now()+ms;if(trainTimer&&trainAt<=at)return;clearTimeout(trainTimer);trainAt=at;trainTimer=setTimeout(()=>{trainTimer=0;requestAnimationFrame(()=>{if(!map.isMoving())drawTrains()})},ms)}   // while the map moves it draws them with each of its frames: a timer frame there used a newer camera than the map under it (tall rides slid and snapped back)
let repaintTimer=0,repaintAt=0;   // coaster: keep map repaint scheduling outside the train timer's comment
function repaintSoon(ms){const at=performance.now()+ms;if(repaintTimer&&repaintAt<=at)return;clearTimeout(repaintTimer);repaintAt=at;repaintTimer=setTimeout(()=>{repaintTimer=0;for(const f of animFrame)f();map.triggerRepaint()},ms)}
const map=new maplibregl.Map({container:'map',pixelRatio:Math.min(devicePixelRatio||1,PHONE?2:3),localIdeographFontFamily:'"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif',...HOME,pitch:35,bearing:0,maxZoom:20,minZoom:7,zoomLevelsToOverscale:undefined,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf2f1'}}]},attributionControl:false,canvasContextAttributes:{antialias:!location.hash.includes('noaa')}});   // 모서리 계단 현상: 지도 캔버스도 MSAA(기본 꺼짐 — 1인칭에서 건물 · 고가 모서리가 깨지고 움직이면 반짝였다, 2026-10-06 덕배). #noaa: 끄고 비교(끊김 원인 찾기)   // 줌 20까지: zoomLevelsToOverscale(기본 4)을 끈다 — 켜 두면 줌 상한 20에서 바탕 타일을 z16 조각으로 잘라 받아 z14 타일만 쓰는 건물 · 버스 도로가 비었다(2026-10-09)
let busLayer=null;   // bus: owns its loading, viewport culling and animation lifecycle
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
let selected='all',trainsEnabled=true,ready=false,pendingLine=null;
const $=id=>document.getElementById(id);
const liveState=document.querySelector('#liveState span');   // the line filter panel is gone: every line is always shown

// ---- live train routing -------------------------------------------------------------
// 열차 예측(trains/plan.mjs): plans · 시계 · 시간표와 학습 자료의 주인. 본체는 planner.plans 로 읽는다
const planner=createTrainPlanner({stations,stationByLine,key,normStatus,route,merc,realGeom,geom,trainPose,mercStop,catchup,catchupAt,
  isCoaster:()=>coaster,isRide:()=>ride,getTrains:()=>feed.trains});
const {age,clock}=planner;
// Station exits (OSM subway_entrance, built by pipeline/build_entrances.py): {station id: [[lon,lat,ref,wheelchair]]}
let exits={};const exitCol=new Map();   // exit "lon,lat" → the colour of the line its passage joins
const EXIT_MINZOOM=16,EXIT_MAX_M=350;   // exits (and their passages) from this zoom; farther than this from every platform: no passage
const EXIT_PASSAGES=false;   // 2026-10-05: 승강장 → 출구 통로 선은 그리지 않는다(출구 번호를 이어지는 노선색으로 칠해 대신함)
const exitsReady=fetch('./exits.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{exits=d||{}}).catch(()=>{});
function exitFeatures(){return Object.entries(exits).flatMap(([id,list])=>list.map(([lon,lat,ref,wc])=>({type:'Feature',properties:{ref,wc:wc??-1,station:+id},geometry:{type:'Point',coordinates:[lon,lat]}})))}
const smooth=x=>x*x*(3-2*x);
// 롤러코스터 (settings): between stations the lines rise off the ground like a coaster track and the
// trains ride on it; its clock can run faster (×coasterSpeed): the trains then run ahead of the feed
// (warp s), a show rather than where they are. Flat at each platform, a climb, then hills of ~380 m,
// each its own height (COASTER_LOW..COASTER_H) and spacing.
let simcity=false;   // 심시티 모드: the miniature city (its own look; the coaster mode keeps its rides on the same city)
let joseon=false;   // 조선 모드: 심시티 (simcity stays true: the viaduct, the trains on it, the x-ray) in the Joseon pack — 흙바닥, 기와집
const cityPack=()=>joseon?JOSEON_STYLE:CITY_STYLE;   // the pack the ground, the buildings and their shadows read
// city-build: the miniature city's buildings (web/lib/city_buildings.mjs): a custom layer under the station names (so names and
// labels stay readable over the city), and the same walls' depth for the train canvas; BuildingDepth and the map's own boxes
// stand down while a city mode is on. syncCity runs from applyTheme (mode, theme and the coaster's tower cut-off).
// 모드 코드: 심시티 · 조선 · 롤코에서만 쓰는 건물(city_buildings → city_mesh · city_hanok …) · 랜드마크 · 거북선 · 88열차 · 놀이기구는
// 첫 화면에서 받지 않는다 — 모드를 켤 때, 그리고 지도가 뜬 뒤 쉬는 틈에 받는다(2026-10-10 덕배: 첫 접속이 느리다, 첫 화면 JS 의 약 1/5).
// 모드는 이것이 다 온 뒤에야 켜진다(setSimcity · setCoaster 가 기다린다): 켜져 있으면 cityBuildings 등은 늘 있다
let CityBuildings,CityLandmarks,TurtleShips,CoasterTrain,RideTrack,SLEEPER_M,RideLayer,CoasterRidePlacement,sampleRideTracks,kitReady=false,kitLoad=null,modeAsk=0;
let cityBuildings=null,cityLandmarks=null;const cityOn=()=>simcity||coaster;
// 모드 코드가 다시 정적으로 부르는 모듈: 함께 바로 요청한다(안 그러면 city_buildings 를 다 받고 읽은 뒤에야 city_mesh 를 요청 — 맥 측정 1.8 s 차례 대기)
const MODE_KIT_DEPS=['city_mesh','city_hanok','city_geom','city_mvt','city_through_buildings','city_landmarks_data','coaster_badges','coaster_ride_sites'];
function loadModeKit(){
  if(!kitLoad)for(const n of MODE_KIT_DEPS)import(`./lib/${n}.mjs`).catch(()=>{});   // 미리 받기만: 실패는 아래 본 import 가 알린다
  return kitLoad??=Promise.all([import('./lib/city_buildings.mjs'),import('./lib/city_landmarks.mjs'),import('./lib/city_turtle_ship.mjs'),import('./lib/coaster_train.mjs'),import('./lib/coaster_ride_track.mjs'),import('./lib/park_rides.mjs'),import('./lib/coaster_ride_placement.mjs')])
    .then(([b,l,t,c,r,p,q])=>{({CityBuildings}=b);({CityLandmarks}=l);({TurtleShips}=t);({CoasterTrain}=c);({RideTrack,SLEEPER_M}=r);({RideLayer}=p);({CoasterRidePlacement,sampleRideTracks}=q);
      cityBuildings=new CityBuildings({phone:PHONE});cityLandmarks=new CityLandmarks();kitReady=true;map.triggerRepaint()})
    .catch(e=>{kitLoad=null;console.warn('mode kit: failed to load',e);throw e})}
// city-build: 심시티 x-ray — the station platforms and running trains near the view, as boxes in mercator for cityBuildings: the
// buildings hiding them turn to glass there (pack.xray). Platforms: the station rect at its viaduct level; trains: tail to head on the deck
function cityXrayTargets(){
  const X=cityBuildings.P.xray;if(!X||!X.on)return null;
  const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast()),m=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()).meterInMercatorCoordinateUnits();
  const zoom=map.getZoom(),unit=1/(512*2**zoom),pad=(B.x-A.x)*.3,inV=(x,y)=>x>A.x-pad&&x<B.x+pad&&y>B.y-pad&&y<A.y+pad,out=[];
  for(const [k,r] of stationRects){const c=r.coords,i=k.lastIndexOf(':'),line=k.slice(0,i),id=+k.slice(i+1);
    const P=maplibregl.MercatorCoordinate.fromLngLat(c[0]),Q=maplibregl.MercatorCoordinate.fromLngLat(c[c.length-1]),cx=(P.x+Q.x)/2,cy=(P.y+Q.y)/2;if(!inV(cx,cy))continue;
    const dx=Q.x-P.x,dy=Q.y-P.y,d=Math.hypot(dx,dy)||1e-12,L=Math.max(20*m,d*Math.max(.1,Math.min(1,r.plat||1)))/2,h=cityViaduct.stationH(line,id)*m;
    out.push({id:'s'+k,ax:cx-dx/d*L,ay:cy-dy/d*L,bx:cx+dx/d*L,by:cy+dy/d*L,z0:h-X.platformBelowM*m,z1:h+X.platformAboveM*m,w:(Math.max(r.widthM||0,10)/2+X.platformMarginM)*m+Math.abs(r.offset||0)*unit,m})}
  if(X.trains&&trainsEnabled){const bodyPx=coasterBodyPx(zoom),lane=cityViaduct.train(zoom,bodyPx).lanePx;
    for(const plan of planner.plans){const pose=trainPose(plan),q=trackPoint(plan,pose.dist);if(!inV(q.x,q.y))continue;
      const half=Math.max(plan.cars*plan.carMetres*m,TRAIN_MIN_PX*unit)/2,a=trackPoint(plan,pose.dist-half),e=trackPoint(plan,pose.dist+half);
      out.push({id:'t'+plan.id,ax:a.x,ay:a.y,bx:e.x,by:e.y,z0:q.h-X.trainBelowM*m,z1:q.h+X.trainAboveM*m,w:X.trainHalfWidthM*m+(Math.abs(q.off||0)+lane+bodyPx)*unit,m})}}
  return out}
function syncCity(){if(!ready||!cityBuildings)return;if(cityOn()&&!map.getLayer('city-buildings'))map.addLayer(cityBuildings,map.getLayer('station-names')?'station-names':undefined);
  cityBuildings.set({on:cityOn(),mode:simcity?'simcity':'coaster',theme:effectiveTheme(),maxHeight:coaster?RIDE_H:1e9,pack:cityPack()});
}
let coaster=false,coasterWant=false,coasterSpeed=1,warp=0,warpAt=0;
const cityViaduct=new CityViaduct({pack:CITY_STYLE,net:{paths,colors,geom,offset:edgeOffset,bodyPx:z=>coasterBodyPx(z),get byId(){return byId},get rects(){return stationRects},get exits(){return exits}}});   // city-life: 심시티 고가 — on the mode's track (geom: the real one, or a tunnel stretch moved onto its street), drawn in drawTrains; trackPoint lifts the trains onto it (heightAt: the stations' levels and the ramps between); exits: the stairs down to them
const coasterGeo=createCoasterGeometry({maplibregl,paths,byId,cityViaduct,edgeGeom,geom,cityGeom,withCum,metresBetween,smooth,onFresh:()=>{coasterMotion.clear();coasterTrack.stale=true}});   // 롤코 길 · 언덕 · 건물 높이(높이가 바뀌면 주행 시간 · 선로도 다시)
const {coasterPath,rolled,CORK_HEART,coasterProfile,coasterAt,coasterGaps,coasterRises,inversion,loopD,corkOf,loadCoasterBuildings}=coasterGeo;
const warpNow=()=>{const t=clock();if(t<warpAt)return warp;if(warpAt)warp+=(t-warpAt)/1000*(coasterSpeed-1);warpAt=t;return warp};
// Loops and corkscrews are landmarks, not the rule (on half the edges each they all looked alike): along each line, in
// order, an edge may take one (not both) once INV_GAP m have passed since the last — a loop by chance INV_LOOP, else a
// corkscrew by INV_CORK. Chosen once per edge, the first line through it deciding; 'loop', 'cork' or ''.
const coasterMotion=createCoasterMotion({geom,coasterAt,isCoaster:()=>coaster});const {ridePace,toRide,fromRide}=coasterMotion;   // 롤코 주행 속도 · 탄 거리
// Where the middle of the train is, as a distance (mercator units) along plan.seq: the feed's prediction (rawPose), but
// never into the train ahead on the same track. Two reports a moment apart put trains on top of each other (2호선 2083
// leaving 잠실나루 and 6085 coming in 2 s later, 2026-10-03; a train held at its next platform after fresh data meets the
// one standing there): the one behind waits TRAIN_GAP_M back, as at a signal. Same line, direction and express or not
// (an express passes a local at a station). Worked out for all the trains at once, at most every 10 ms.
const TRAIN_GAP_M=20,spaced=new Map();let spacedAt=-1e9,spacedFor=null;
function trainPose(p){const now=clock(),plans=planner.plans;if((now===planner.frameClock?now!==spacedAt:now-spacedAt>10)||spacedFor!==plans){spaceTrains();spacedAt=now;spacedFor=plans}return spaced.get(p)||rawPose(p)}
function spaceTrains(){
  spaced.clear();const groups=new Map(),at=e=>{const q=trackPoint(e.p,e.pose.dist);e.x=q.x;e.y=q.y;e.f=q.f};
  for(const p of planner.plans){const pose=rawPose(p);spaced.set(p,pose);if(p.seq.length<2)continue;
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
    if(p.creep){const w=(clock()-p.creep.at)/p.creep.ms;if(w<1){at=p.creep.from+(p.hold-p.creep.from)*(1-(1-w)*(1-w));creeping=true}else p.creep=null}
    if(dist<p.hold)return {dist:at,moving:creeping};
    if(creeping&&at<dist)p.glide={c:catchup((dist-at)/mercStop(p.t.line,p.seq[0]).meterInMercatorCoordinateUnits()),at:clock()};
    p.hold=null;p.creep=null;
  }
  // 따라잡는 중: 예측보다 남은 차이(m)만큼 뒤에 그려요. 차이는 원래 주행 위에 더한 속도(상한 CATCHUP_MPS)로 줄어요.
  if(p.glide){const g=catchupAt(p.glide.c,(clock()-p.glide.at)/1000);if(!g.done)return {dist:Math.max(0,dist-g.left*mercStop(p.t.line,p.seq[0]).meterInMercatorCoordinateUnits()),moving:true};p.glide=null}
  // stand: at a stop — s into it, how long it lasts and which station
  return {dist,moving,stand:!moving&&ph.dur!==Infinity?{t:el,dur:ph.dur,st:ph.k0===0?ph.from:ph.to}:null};
}
// Point on the track `dist` along plan.seq (clamped to its ends), with heading and lateral offset.
// Trains keep to the right of their travel direction (Korean right-hand running): looking along
// the 상행 direction, 상행 trains are right of the line and 하행 trains left of it.
function trackPoint(p,dist){
  const {seq,cum}=p,line=p.t.line;
  if(seq.length<2&&!coaster&&!simcity){
    const s=seq[0],{prev,next}=platformNeighbours(line,s),n=next||prev;
    if(n){const q=next?along(line,s,n,0):along(line,n,s,1);return {...q,r:[-q.f[1],q.f[0]],off:0,h:0,roll:0}}
  }
  if(seq.length<2){const m=mercStop(line,seq[0]);return {x:m.x,y:m.y,f:[0,-1],r:[1,0],off:0,h:simcity||coaster?cityViaduct.stationH(line,seq[0].id)*m.meterInMercatorCoordinateUnits():0}}   // city-life: 심시티 — on the viaduct, at this station's level
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
  if(!coaster&&!simcity)off=0;   // 기본 화면 경로에 기존 공유 선로 간격이 들어 있어요.
  if(simcity)h=cityViaduct.heightAt(line,a.id,b.id,k)*p.m;   // city-life: 심시티 — the trains run on the viaduct's deck: its rail height here (the station's level, or the ramp between two), in mercator units
  return {x,y,f,r,off,h,roll};
}
const lastPose=new Map(),BLEND_MS=1200;

// Train body width and lane offset in screen px, shared by the train layer, roof numbers,
// destination tags and click picking.
// 가까이(z16→17) 볼 때는 화면 폭 대신 실제에 가까운 폭(TRAIN_CLOSE_M, 실제 약 3.1 m 의 1.5배)으로 줄여 간다 — 모든 모드 공통.
// 크게 그린 열차(z17 에서 13 m)가 출구 · 보도를 덮던 문제(중화 7호선, 2026-10-05). z16 이하는 그대로.
const TRAIN_CLOSE_M=4.6,TRAIN_CLOSE_ZOOM=[16,17],pxPerMetre=z=>512*2**z/(40075016.686*Math.cos(37.5*Math.PI/180));
const farBodyPx=z=>15+13*smooth(Math.max(0,Math.min(1,(z-13)/4)));
// z17 위로는 실제 폭 그대로 — 지도와 같이 커진다(2026-10-10 덕배: 줌 18 위에서 노선 폭이 바뀐다 — 멀리서의 폭 28 px 상한에
// 걸려 z18.5 부터 지도는 커지는데 열차 · 고가 · 수로는 28 px 에 멈춰 상대적으로 가늘어졌다)
const bodyWidthPx=z=>{const far=farBodyPx(z),k=smooth(Math.max(0,Math.min(1,(z-TRAIN_CLOSE_ZOOM[0])/(TRAIN_CLOSE_ZOOM[1]-TRAIN_CLOSE_ZOOM[0]))));
  return k<=0?far:far*(TRAIN_CLOSE_M*pxPerMetre(z)/far)**k},TRAIN_MIN_PX=36;   // min on-screen length when zoomed out; 줄어드는 구간은 비율로 이어서 매끄럽게
const laneOffsetPx=(z,body=bodyWidthPx(z))=>(1.5+2.5*Math.max(0,Math.min(1,(z-8)/7)))/2+3.5+body/2;
// on the coaster (always car by car) zoomed out: a slimmer body, so a 20 m car stays longer than wide (≥ 7 px across)
const coasterBodyPx=z=>Math.min(bodyWidthPx(z),Math.max(7,20*pxPerMetre(z)/1.6));
// 롤코 칸 하나의 틀(fr: 뒤 끝 바닥 가운데, F 앞, R 오른쪽, U 위)과 길이 L(px) — drawTrains 와 1인칭 카메라가 같은 식을 써요.
// P: 탄 거리 → 선로 위 점, tail: 맨 뒤 끝, car: 칸 하나 길이, j: 칸 번호(0 = 맨 뒤), gap: 칸 사이 틈
function coasterCarFrame(P,tail,car,j,n,unit,bodyPx,lanePx,gap){
  const A=P(tail+j*car+(j?gap/2:0)),B=P(tail+(j+1)*car-(j<n-1?gap/2:0));
  const oa=(A.off+lanePx)*unit,ob=(B.off+lanePx)*unit;A.x+=A.r[0]*oa;A.y+=A.r[1]*oa;B.x+=B.r[0]*ob;B.y+=B.r[1]*ob;   // each end on its own lane (one normal for both pulled the far end off it on curves)
  const dx=B.x-A.x,dy=B.y-A.y,dz=B.h-A.h,len=Math.hypot(dx,dy,dz);if(len<unit*.1)return null;
  const F=[dx/len,dy/len,dz/len],[R,U]=rolled(A.r,F,P(tail+(j+.5)*car).roll||0);   // turned over in a corkscrew, as at its middle (the ends' 2π and 0 averaged to π: upside down under the track)
  const [,U0]=rolled(A.r,F,0),hc=CORK_HEART*bodyPx*unit;   // turned about its own middle (the rails wind round the same line)
  return {fr:[A.x+(U0[0]-U[0])*hc,A.y+(U0[1]-U[1])*hc,A.h+(U0[2]-U[2])*hc,F[0],F[1],F[2],R[0],R[1],R[2],U[0],U[1],U[2]],L:len/unit};
}
// 1인칭 레일 · 침목의 틀: d0..d1(탄 길이, step 간격)마다 차선 가운데의 레일 중심과 틀 — 칸과 같은 식(coasterCarFrame), 코르크스크루에선 같은 축을 돈다
function coasterRailFrames(P,d0,d1,step,unit,bodyPx,lanePx,front=d0,m=1){   // (front · m: 열차 앞 끝의 탄 길이와 1 m — 틀마다 앞 끝에서의 거리 d m)   // (마지막 틀에 end: 레일이 다음 틀로 이어지지 않는다)
  const on=d=>{const q=P(d),o=(q.off+lanePx)*unit;q.x+=q.r[0]*o;q.y+=q.r[1]*o;return q},hc=CORK_HEART*bodyPx*unit,out=[];
  let A=on(d0);
  for(let d=d0;d<=d1+1e-12;d+=step){
    const B=on(d+step),dx=B.x-A.x,dy=B.y-A.y,dz=B.h-A.h,len=Math.hypot(dx,dy,dz);
    if(len>unit*.01){const F=[dx/len,dy/len,dz/len],[R,U]=rolled(A.r,F,A.roll||0),[,U0]=rolled(A.r,F,0);out.push({p:[A.x+(U0[0]-U[0])*hc,A.y+(U0[1]-U[1])*hc,A.h+(U0[2]-U[2])*hc],F,R,U,d:(d-front)/m})}
    A=B;
  }
  if(out.length)out[out.length-1].end=true;
  return out;
}
// 새 자료로 옮겨 그리는 중: 예전 자리에서 미끄러져 오는 양(메르카토르), 끝났으면 null
function blendShift(plan,mid){if(!plan.blend)return null;const w=(clock()-plan.blend.at)/BLEND_MS;if(w>=1){plan.blend=null;return null}const e=1-smooth(w);return [(plan.blend.x-mid.x)*e,(plan.blend.y-mid.y)*e]}
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
    this.rideTrack=this.c88ride=this.c88=this.ships=null;   // 모드 코드가 오면 kit() 가 만든다
  }
  // 모드 코드가 온 뒤 처음 그릴 때: 롤코 1인칭 레일 · 침목, 내가 탄 칸(맨 마지막에 깊이를 비우고 따로 — drawTrains 끝), 88열차(서울 팩의
  // train.coaster88), 조선 모드의 배 선단(열차 한 대 = 배 몇 척, 공중 수로 위)
  kit(){
    if(this.ships||!kitReady||!this.gl)return;
    this.rideTrack=new RideTrack();this.c88ride=new CoasterTrain();this.c88=new CoasterTrain();this.ships=new TurtleShips(JOSEON_STYLE.train?.turtleShip);
    this.c88.init(this.gl);this.c88ride.init(this.gl);this.ships.init(this.gl);
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
    this.gl=gl;this.kit();   // coaster-train: (모드 코드가 왔으면)
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
    this.vertex(this.cx+(this.tx*x-this.ty*y)*this.unit,this.cy+(this.ty*x+this.tx*y)*this.unit,z*this.unit+this.h0,u,v,face);   // city-life: + h0 (the deck's height in 심시티, else 0)
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
    if(!myLocation&&(!trainsEnabled||!planner.plans.length))return;
    const drawTrainsToo=trainsEnabled&&!subwayOff;   // bus: 버스 노선을 고른 동안은 열차를 그리지 않는다
    const zoom=map.getZoom(),unit=1/(512*2**zoom),bodyPx=coaster||simcity?coasterBodyPx(zoom):bodyWidthPx(zoom),MIN_PX=TRAIN_MIN_PX,MARGIN=3;   // city-life: 심시티 — the slim body too (the viaduct's deck is cut to it)
    // Lane: clear of the route line (its drawn width) by a visible gap, then half a car body.
    const lanePx=simcity||coaster?cityViaduct.train(zoom,bodyPx).lanePx:laneOffsetPx(zoom,bodyPx);   // city-life: 심시티 — no route line on the ground to keep clear of: the two lanes close up on the deck
    const view=map.getBounds(),lo=maplibregl.MercatorCoordinate.fromLngLat(view.getSouthWest()),hi=maplibregl.MercatorCoordinate.fromLngLat(view.getNorthEast()),pad=(hi.x-lo.x)*.1;
    // Keep world coordinates in double precision until subtracting the view-centre origin.
    const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),ox=O.x,oy=O.y;
    this.ox=ox;this.oy=oy;this.unit=unit;this.width=bodyPx;this.used=0;this.fr=null;this.h0=0;this.kit();if(this.ships){this.c88.begin(ox,oy);this.c88ride.begin(ox,oy);this.ships.begin(ox,oy)}   // city-life: h0 — the height the model stands at (the viaduct's deck in 심시티)   // coaster-train: this frame's 88열차 cars start empty
    const bearing=map.getBearing()*Math.PI/180,camX=-Math.sin(bearing),camY=Math.cos(bearing),pitched=map.getPitch()>.1,H=bodyPx*.68;
    let animating=false,waiting=false,rippling=false;
    // my-location pulse: the ripple, in 슝 yellow, under the trains
    if(myLocation&&map.getBounds().contains(myLocation)){const q=maplibregl.MercatorCoordinate.fromLngLat(myLocation);this.color=[1,.83,0];this.width=8;this.length=0;this.kind=0;this.carPx=0;this.ripple(q.x,q.y,8*3.4);this.width=bodyPx;rippling=true}
    for(const plan of drawTrainsToo?planner.plans:[]){
      const snap=riding(plan),pose=snap?snap.pose:trainPose(plan),mid=trackPoint(plan,pose.dist),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits();   // 1인칭으로 탄 열차: 카메라를 놓은 그 순간의 자리
      this.h0=simcity?mid.h:0;   // city-life: 심시티 — this train on the viaduct's deck (mid.h: the rail height there)
      // Fresh data: glide from where the old prediction had the train instead of teleporting.
      let shiftX=0,shiftY=0;
      const shift=snap?snap.shift:blendShift(plan,mid);if(shift){shiftX=shift[0];shiftY=shift[1];animating=true}
      const previous=lastPose.get(plan.id);
      if(previous){previous.x=mid.x+shiftX;previous.y=mid.y+shiftY}else lastPose.set(plan.id,{x:mid.x+shiftX,y:mid.y+shiftY});
      // off-screen test with the train's half length as margin: zoomed in, a train is longer than the screen
      const reach=pad+Math.max(plan.cars*plan.carMetres*m,MIN_PX*unit)/2+lanePx*unit;
      if(!snap&&(mid.x<lo.x-reach||mid.x>hi.x+reach||mid.y>lo.y+reach||mid.y<hi.y-reach))continue;
      if(pose.moving||snap&&trainPose(plan).moving)animating=true;else waiting=true;   // only trains on screen keep the map redrawing (탄 열차: 멈춘 순간에 그려도 지금 떠났으면 카메라를 다시 놓아요)
      const n=plan.cars,real=n*plan.carMetres*m,total=Math.max(real,MIN_PX*unit,coaster?n*bodyPx*1.6*unit:0),car=total/n,tail=(coaster?toRide(plan,pose.dist):pose.dist)-total/2;   // on the coaster: car positions in ride distance
      let color=this.rgb.get(plan.t.line);if(!color){color=hexRGB(colors[plan.t.line]);this.rgb.set(plan.t.line,color)}this.color=color;
      if(plan.id===sheetTrain){const o=(mid.off+lanePx)*unit;this.fr=null;this.width=bodyPx;this.length=0;this.kind=0;this.carPx=0;this.ripple(mid.x+shiftX+mid.r[0]*o,mid.y+shiftY+mid.r[1]*o,bodyPx*3.4);this.width=bodyPx;rippling=true}
      const P=d=>{const q=trackPoint(plan,coaster?fromRide(plan,d):d);q.x+=shiftX;q.y+=shiftY;return q};
      if(simcity&&joseon){   // 조선 모드: 배 선단 — 한 척이 몸 폭의 3.6배쯤 되게 척 수를 고르고(많아야 칸 수), 배 사이는 32 % 띄운다(한 척이 길이:폭 3.4쯤)
        // 맨 앞(j = k-1)만 거북선: 길이 1.25배 · 폭 1.3배(이물 쪽으로 늘린다), 뒤는 일반 배. 노선 깃발은 맨 앞에만 (2026-10-10 덕배)
        const k=Math.max(1,Math.min(n,Math.round(total/unit/(bodyPx*3.6)))),span=total/k;
        for(let j=0;j<k;j++){const c=coasterCarFrame(P,tail,span,j,k,unit,bodyPx,lanePx,span*.32);if(!c)continue;const lead=j===k-1;
          this.ships?.ship(c.fr,lead?c.L*1.25:c.L,lead?bodyPx*1.3:bodyPx,color,pose.moving,plan.id,{kind:lead?'turtle':'boat',flag:lead,line:plan.t.line})}   // 깃발은 맨 앞 거북선 꼬리에만(2026-10-10 덕배)
        continue}
      const ratio=car/unit/bodyPx,separate=coaster||ratio>=1.5;   // on the coaster: always car by car, so the train bends over the hills
      const unfold=coaster?1:smooth(Math.max(0,Math.min(1,(ratio-1.5)/.9))),gap=1.4*unit*unfold;
      const start=P(tail),finish=P(tail+total);
      // 심시티: at the LOD boundary, car chords coincide with the compact icon's chord, then articulate.
      // 기본 모드: 칸 끝은 늘 선로 위 점(P(d))에 둔다 — 곡선에서 곧은 막대로 모으지 않는다. 틈 · 지붕 이음만 unfold 로 자란다.
      const follow=simcity?unfold:1;
      const articulated=(d)=>{
        const q=P(d),t=(d-tail)/total;
        q.x=(start.x+(finish.x-start.x)*t)*(1-follow)+q.x*follow;
        q.y=(start.y+(finish.y-start.y)*t)*(1-follow)+q.y*follow;
        q.h=(start.h+(finish.h-start.h)*t)*(1-follow)+q.h*follow;
        return q;
      };
      // 기본 모드 낮은 줌: 칸이 짧으면 몇 칸을 한 마디(몸 폭 0.8배 이상)로 묶어 휘게 그린다
      const bends=coaster||simcity?1:Math.max(1,Math.min(n,Math.floor(total/unit/(bodyPx*.8))));
      if(separate){
        // Painter order follows camera ground direction; no hidden back wall can bleed through.
        const forward=mid.f[0]*camX+mid.f[1]*camY>=0;
        for(let k=0;k<n;k++){
          const j=forward?k:n-1-k;
          if(coaster){const c=coasterCarFrame(P,tail,car,j,n,unit,bodyPx,lanePx,gap);if(c){this.fr=c.fr;(snap&&snap.j===j?this.c88ride:this.c88)?.car(c.fr,c.L,bodyPx,color,j===n-1,j===0,plan.id,j,plan.t.line,snap&&snap.j===j?snap.k:-1)}continue}   // coaster-train: route badge + stable riders on the 88열차 car; no beam or gangways (1인칭: 내 자리는 비워요)
          const A=articulated(tail+j*car+(j?gap/2:0)),B=articulated(tail+(j+1)*car-(j<n-1?gap/2:0));if(simcity)this.h0=(A.h+B.h)/2;   // city-life: 심시티 — each car at the deck's height under it (on a ramp between levels the train tilts car by car)
          const dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy);if(len<unit*.1)continue;
          const gl2=Math.hypot(dx,dy)||1e-12,tx=dx/gl2,ty=dy/gl2,L=len/unit,off=((A.off+B.off)/2+lanePx)*unit;
          this.cx=A.x-ty*off;this.cy=A.y+tx*off;this.tx=tx;this.ty=ty;this.length=L;this.carPx=0;
          const side=(-ty*camX+tx*camY)>=0?1:-1;
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
      }else if(bends>1){
        // 기본 모드, 칸이 몸 폭 1.5배보다 짧을 때: 곧은 아이콘과 같은 모양 · 셰이더 칸 줄(carPx)을 마디마다 나눠 그려 선로를 따라 휜다.
        // 마디 끝은 그 점의 선로 법선으로 차선만큼 띄워, 이웃 마디와 같은 점에서 만난다. 틈 · 지붕 이음은 없다(한 몸).
        const w=bodyPx/2,nose=bodyPx*.48,low=H*.44,Wm=w+MARGIN,cut=[],dir=[];
        for(let i=0;i<=bends;i++){const q=P(tail+Math.round(i*n/bends)*car),o=(q.off+lanePx)*unit;q.x+=q.r[0]*o;q.y+=q.r[1]*o;cut.push(q)}
        for(let i=0;i<bends;i++){const dx=cut[i+1].x-cut[i].x,dy=cut[i+1].y-cut[i].y,len=Math.hypot(dx,dy)||1e-30;dir.push([dx/len,dy/len,len])}
        // 이음매는 두 마디 방향의 이등분선으로 비스듬히 자른다(마이터): 겹침도 틈도 없어 반투명(건물 뒤) · 그림자에 이음 줄이 안 생긴다.
        // 기울기 = 가로 1 당 세로 끝이 밀리는 양, 꺾임 반각 60° 까지
        const slope=(t,u)=>{const s=(-t[1]*u[0]+t[0]*u[1])/(1+t[0]*u[0]+t[1]*u[1]);return Math.max(-1.73,Math.min(1.73,s||0))};
        const forward=mid.f[0]*camX+mid.f[1]*camY>=0;
        for(let k=0;k<bends;k++){
          const j=forward?k:bends-1-k,A=cut[j],[tx,ty,len]=dir[j];if(len<unit*.1)continue;
          const back=j===0,front=j===bends-1,cars=Math.round((j+1)*n/bends)-Math.round(j*n/bends),S=len/unit,carPx=S/cars;
          let sA=back?0:slope(dir[j],dir[j-1]),sB=front?0:slope(dir[j],dir[j+1]);
          const squeeze=Wm*(Math.abs(sA)+Math.abs(sB))/(S*.9);if(squeeze>1){sA/=squeeze;sB/=squeeze}   // 아주 짧은 마디: 안쪽 모서리가 엇갈리지 않게
          // 셰이더 x 원점을 칸 길이의 배수만큼 앞에 둬 칸 줄 · 해치가 마디를 넘어 이어진다. 앞머리 아닌 마디는 길이를 넉넉히 줘 끝 칸 줄도 그린다
          const c=back?0:carPx*Math.ceil((Math.max(Math.abs(sA)*Wm,nose+1)+.01)/carPx),L=front?c+S:c+S+Math.abs(sB)*Wm+nose+2;
          this.cx=A.x-tx*c*unit;this.cy=A.y-ty*c*unit;this.tx=tx;this.ty=ty;
          this.kind=(front?1:0)+(back?2:0);this.length=L;this.carPx=carPx;
          const X0=y=>back?nose:c-y*sA,X1=y=>front?L-nose:c+S-y*sB,side=(-ty*camX+tx*camY)>=0?1:-1;
          if(pitched){
            if(back&&tx*camX+ty*camY<0)this.end(0,w-bodyPx*.36,low,3);
            this.wall(X0(side*w),X1(side*w),H,H,side*w);
            if(back)this.cabWall(false,side,H);
            if(front)this.cabWall(true,side,H,NOSE_Z);
          }
          const a0=X0(-Wm),a1=X0(Wm),b0=X1(-Wm),b1=X1(Wm);
          this.corner(a0,-Wm,H,a0,-Wm,0);this.corner(a1,Wm,H,a1,Wm,0);this.corner(b1,Wm,H,b1,Wm,0);
          this.corner(a0,-Wm,H,a0,-Wm,0);this.corner(b1,Wm,H,b1,Wm,0);this.corner(b0,-Wm,H,b0,-Wm,0);
          if(back){this.roof(0,nose,low,H,Wm);this.roof(-MARGIN,0,low,low,Wm)}
          if(front){this.roof(L-nose,L,H,NOSE_Z,Wm);this.roof(L,L+MARGIN,NOSE_Z,NOSE_Z,Wm);this.beam(L,w)}
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
    // coaster-train: the 88열차 cars, with their own buffers, program and depth (the ripple and pulse below stay this layer's)
    const c88o=this.c88o={zoom,unit,walls:options.walls,occlude:options.occlude,dark:document.documentElement.dataset.theme==='dark',shadow:sunTrainShadow,pixelRatio:gl.drawingBufferWidth/Math.max(1,gl.canvas.clientWidth||1),lod:ride?2:undefined};   // 1인칭: 눈앞의 칸들이라 늘 가장 자세하게
    if(simcity&&joseon&&this.ships)this.ships.draw(gl,options.defaultProjectionData.mainMatrix,ox,oy,c88o);   // 조선 모드: 거북선
    if(coaster&&this.c88){this.c88.draw(gl,options.defaultProjectionData.mainMatrix,ox,oy,c88o);this.c88ride.draw(gl,options.defaultProjectionData.mainMatrix,ox,oy,{...c88o,part:'foot'})}   // 내 칸은 땅 그림자만 여기서(몸은 cockpit)
    if(coaster&&this.rideTrack&&ride?.rail?.frames.length&&ride.eye){const r=ride.rail;if(r.dirty){this.rideTrack.set(gl,r.frames,r.mpu,[r.frames[0].p[0],r.frames[0].p[1]]);r.dirty=false}this.rideTrack.draw(gl,options.defaultProjectionData.mainMatrix,ride.eye,document.documentElement.dataset.theme==='dark')}
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
      const SS=simcity?cityViaduct.shadowShift(sunPosition()):[0,0];   // city-life: 심시티 — a train up on the viaduct casts its shadow where the deck casts its own
      const pass=alpha=>{gl.uniform1f(this.uni.u_alpha,alpha);
        gl.uniform2f(this.uni.u_offset,sunTrainShadow[0]*unit+SS[0],sunTrainShadow[1]*unit+SS[1]);gl.uniform1f(this.uni.u_shadow,1);gl.drawArrays(gl.TRIANGLES,0,this.used/13);
        gl.uniform2f(this.uni.u_offset,0,0);gl.uniform1f(this.uni.u_shadow,0);gl.drawArrays(gl.TRIANGLES,0,this.used/13)};
      if(options.walls){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);pass(1);if(options.occlude){gl.depthFunc(gl.GREATER);pass(options.occlude)}}   // solid buildings (the park): hidden behind them
      else{gl.disable(gl.DEPTH_TEST);pass(1)}
    }
    // moving trains, ripple or pulse: TRAIN_FPS (a followed train moves the camera: map redraws at
    // FOLLOW_FPS); trains standing at a station: once a second, to see them set off
    // following a moving train: camera, map and trains step together (followSoon), and no extra
    // train-only frames in between — they drew the train ahead of the map it sits on (jitter)
    if(animating&&(following||ride)&&!easing)followSoon();
    else if(animating||rippling)trainFrameSoon(1000/TRAIN_FPS);else if(waiting)trainFrameSoon(1000);
  }
  onRemove(map,gl){gl.deleteBuffer(this.b);gl.deleteProgram(this.p);this.c88?.dispose(gl);this.c88ride?.dispose(gl);this.ships?.dispose(gl);this.rideTrack?.dispose(gl)}   // coaster-train: and the 88열차's
}

// ---- bottom sheet: station and train details slide up from the bottom of the map -------------
const sheet=document.createElement('section');sheet.className='sheet';sheet.hidden=true;sheet.setAttribute('aria-label','상세 정보');
sheet.innerHTML='<button type="button" class="sheet-grab" aria-label="닫기" title="끌어내리거나 눌러서 닫기"></button><button type="button" class="sheet-close" aria-label="닫기">✕</button><div class="sheet-body"></div><button type="button" class="sheet-follow" hidden>이 열차 따라가기</button>';
const sheetBody=sheet.querySelector('.sheet-body'),followBtn=sheet.querySelector('.sheet-follow');
let sheetToken=0,sheetTrain=null,following=null,easing=false;
let followBus=null;   // bus: 지도에서 누른 버스를 카메라가 따라간다(2026-10-08 덕배). 끌면 멈추고 '이 버스 따라가기'로 다시
function openSheet(html,source='subway'){if(source!=='bus')busLayer?.clearSelection();sheetBody.innerHTML=html;sheet.hidden=false;sheet.style.transform='';sheet.style.transition='';requestAnimationFrame(()=>sheet.classList.add('open'));return ++sheetToken}   // bus: release the bus selection when another detail opens
// 길찾기 route on the map: walking dashed, rides along the line's track, in the line's colour
function rideCoords(line,ids){
  const out=[];
  for(let i=1;i<ids.length;i++){const a=ids[i-1],b=ids[i];let c=cityCoords(line,Math.min(a,b),Math.max(a,b));if(a>b)c=c.slice().reverse();out.push(...(out.length?c.slice(1):c))}   // 여정도 선택한 노선 경로를 따라가요.
  return out;
}
function showRoute(plan,busSelection=false,refit=true){   // bus: a stop's number uses the same fit, focus and journey styles
  displayedRoute={plan,busSelection};
  busRouteFocus=busSelection;if(!busSelection){setSubwayOff(false);busLayer?.setJourney(plan.legs)}   // bus: 길찾기 경로는 지하철을 다시 보인다   // bus: keep the stop sheet's selection intact
  const feats=[],pts=[];
  plan.legs.forEach((l,i)=>{
    if(l.type==='walk')feats.push({type:'Feature',properties:{kind:'walk'},geometry:{type:'LineString',coordinates:l.path}});
    else if(l.type==='bus'){}   // bus: road-matched line and boarding markers share busLayer's journey styles
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
  if(first.path&&!busSelection)pts.push({type:'Feature',properties:{kind:'start'},geometry:{type:'Point',coordinates:first.path[0]}});   // bus: a route number has stops, not journey origin/destination pins
  if(last.path&&!busSelection)pts.push({type:'Feature',properties:{kind:'end'},geometry:{type:'Point',coordinates:last.path[last.path.length-1]}});   // bus
  const data={type:'FeatureCollection',features:[...feats,...pts]};
  if(!map.getSource('journey')){
    // veil: everything under the route (base map, other lines, station names) fades back
    map.addSource('journey-veil',{type:'geojson',data:{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]]]}}});
    // under the base map's labels: the ground fades back, street and place names stay readable
    // (over everything at .68 the map around a route was too dim to read); the other lines fade
    // by their own opacity in focusRoute
    map.addLayer({id:'journey-veil',type:'fill',source:'journey-veil',paint:{'fill-color':veilColor(),'fill-opacity':.45,'fill-opacity-transition':{duration:300}}},map.getLayer('bm-label-water')?'bm-label-water':undefined);
    map.addSource('journey',{type:'geojson',data});
    map.addLayer({id:'journey-casing',type:'line',source:'journey',filter:['==',['get','kind'],'ride'],layout:{'line-cap':'round','line-join':'round'},paint:journeyCasingPaint()});   // bus: shared casing
    map.addLayer({id:'journey-ride',type:'line',source:'journey',filter:['==',['get','kind'],'ride'],layout:{'line-cap':'round','line-join':'round'},paint:journeyRidePaint()});   // bus: shared stroke
    map.addLayer({id:'journey-walk',type:'line',source:'journey',filter:['==',['get','kind'],'walk'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':walkColor(),'line-width':['interpolate',['linear'],['zoom'],10,3,16,6],'line-dasharray':[0.1,1.8]}});
    map.addLayer({id:'journey-inside',type:'line',source:'journey',filter:['==',['get','kind'],'inside'],layout:{'line-cap':'round'},paint:{'line-color':walkColor(),'line-opacity':.45,'line-width':['interpolate',['linear'],['zoom'],10,2,16,4],'line-dasharray':[0.1,2.2]}});
    map.addLayer({id:'journey-stop',type:'circle',source:'journey',filter:['==',['get','kind'],'stop'],paint:journeyStopPaint()});   // bus: shared stop marker
    map.addLayer({id:'journey-ends',type:'circle',source:'journey',filter:['in',['get','kind'],['literal',['start','end']]],paint:{'circle-radius':8,'circle-color':['match',['get','kind'],'start','#ffd400','#141414'],'circle-stroke-color':['match',['get','kind'],'start','#141414','#ffd400'],'circle-stroke-width':3}});
  }else map.getSource('journey').setData(data);
  busLayer?.raiseRoute();focusRoute(true);   // bus: keep selected lanes above the lazily created veil
  const all=data.features.flatMap(f=>f.geometry.type==='Point'?[f.geometry.coordinates]:f.geometry.coordinates);
  all.push(...plan.legs.filter(l=>l.type==='bus').flatMap(l=>l.path));   // bus: retain journey fitting without a duplicate line
  routeBounds=all.length?all.reduce((bb,c)=>bb.extend(c),new maplibregl.LngLatBounds(all[0],all[0])):null;
  if(refit)fitRoute(sheetPad()+30);
}
let displayedRoute=null;   // 모드 전환 때 표시 중인 여정만 다시 그려요.
let routeBounds=null,busRouteFocus=false;   // bus: route-number focus is released with its detail sheet
function fitRoute(bottom){if(routeBounds)map.fitBounds(routeBounds,{padding:{top:90,bottom,left:40,right:40},maxZoom:16,pitch:0,duration:800})}
function clearRoute(){displayedRoute=null;busLayer?.clearSelection();routeBounds=null;if(map.getSource('journey'))map.getSource('journey').setData({type:'FeatureCollection',features:[]});focusRoute(false)}   // bus: clear journey selection with its route
const veilColor=()=>document.documentElement.dataset.theme==='dark'?'#0b0c0e':'#fbfaf4';
const walkColor=()=>document.documentElement.dataset.theme==='dark'?'#f1efe6':'#141414';
// The lines on the ground: faded under a found route; on the 롤러코스터 a faint shadow of its track (the track itself
// is not drawn zoomed out below 12.5: there they come back in full)
let routeFocus=false;
// bus: 버스 노선을 고르면(정류장 팝업의 번호 · 지도 위 버스) 지하철 — 노선 · 승강장 · 이름표 · 열차 · 출구 — 을 감추고, 놓으면 다시(2026-10-08 덕배)
let subwayOff=false;
function setSubwayOff(on){
  if(subwayOff===on)return;subwayOff=on;
  for(const id of ['routes','stations-casing','stations','station-names','station-labels','exit-refs'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'none':'visible');   // 감춘 역은 눌리지도 않게
  stationAlpha=on?0:routeFocus?.35:1;map.triggerRepaint();
}
const setRouteOpacity=()=>{if(map.getLayer('routes'))map.setPaintProperty('routes','line-opacity',simcity||coaster?cityViaduct.routeOpacity(routeFocus):routeFocus?.25:.9)};   // 롤코도 고가 위: 상판이 나오면 땅 위 노선은 사라져요
// route focus: veil on, trains faded, my location kept above the veil
function focusRoute(on){
  if(map.getLayer('journey-veil')){map.setLayoutProperty('journey-veil','visibility',on?'visible':'none');map.setPaintProperty('journey-veil','fill-color',veilColor());map.setPaintProperty('journey-walk','line-color',walkColor());if(map.getLayer('journey-inside'))map.setPaintProperty('journey-inside','line-color',walkColor())}
  routeFocus=on;setRouteOpacity();
  stationAlpha=subwayOff?0:on?.35:1;map.triggerRepaint();
  const c=document.querySelector('.train-overlay');if(c)c.style.opacity=on&&!busLayer?.chosenIds().length&&!busLayer?.journeyLegs.length?'.3':'';   // bus: either entry point keeps its selected vehicles legible
  if(on)for(const id of ['me-ring','me-dot'])if(map.getLayer(id))map.moveLayer(id);
}
const journey=initJourney({openSheet,closeSheet:()=>closeSheet(),map,colors,myLocation:()=>myLocation,button:document.getElementById('routeButton'),showRoute,clearRoute});
function closeSheet(){
  busLayer?.clearSelection();   // bus: release the highlighted bus route with the shared sheet
  if(sheet.hidden)return;
  // a field still focused keeps the keyboard up: let both go down together
  if(sheet.contains(document.activeElement))document.activeElement.blur();
  sheet.classList.remove('open');sheetToken++;sheetTrain=null;following=null;followBus=null;followBtn.hidden=true;
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
addEventListener('keydown',e=>{if(e.key==='Escape'){if(ride)stopRide(true);else closeSheet()}});
// Following: the camera keeps the chosen train in the middle of the map above the sheet.
// Dragging the map stops it; the button in the sheet starts it again.
const sheetPad=()=>sheet.hidden?0:Math.min(sheet.offsetHeight,map.getContainer().clientHeight*.75);   // the 길찾기 sheet grows to 72%
function trainLngLat(plan){
  const z=map.getZoom(),unit=1/(512*2**z),q=trackPoint(plan,trainPose(plan).dist),o=(q.off+laneOffsetPx(z))*unit;
  return new maplibregl.MercatorCoordinate(q.x+q.r[0]*o,q.y+q.r[1]*o,0).toLngLat();
}
function follow(id){following=id;followBus=null;followBtn.hidden=true;followBtn.textContent='이 열차 따라가기';const plan=planner.plans.find(p=>p.id===id);if(!plan)return;
  easing=true;cam=null;map.once('moveend',()=>{easing=false;map.triggerRepaint()});
  map.easeTo({center:trainLngLat(plan),zoom:Math.max(map.getZoom(),16),padding:{top:0,bottom:sheetPad(),left:0,right:0},duration:700})}
// bus: 그 버스로 옮겨 가 따라간다. 멀리 있었으면 줌 16 으로(가까이 볼 때 버스가 보이는 크기)
function followBusStart(id){
  following=null;followBus=id;followBtn.hidden=true;const c=busLayer?.vehiclePosition(id);if(!c){followBus=null;return}
  easing=true;cam=null;map.once('moveend',()=>{easing=false;followSoon()});
  map.easeTo({center:c,zoom:Math.max(map.getZoom(),16),padding:{top:0,bottom:sheetPad(),left:0,right:0},duration:700});
}
followBtn.onclick=()=>{if(sheetTrain)follow(sheetTrain);else if(busLayer?.selection?.kind==='bus')followBusStart(busLayer.selection.id)};
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
function followLoop(ts){followRaf=0;if(!(following||ride||followBus)||easing)return;
  if(!ride&&ts-followLast<1000/FOLLOW_FPS-4){followSoon();return}   // skip display frames down to FOLLOW_FPS (1인칭으로 탈 때는 화면 주사율 그대로: 30 fps 로 묶으니 풍경이 끊겨 보였다 — 2026-10-06 덕배)
  followLast=ts;if(ride)planner.setFrame(ts);for(const f of animFrame)f();map.triggerRepaint();
  if(followBus)followSoon()}   // bus: 버스는 열차 그리기와 따로 움직여서, 따라가는 동안은 계속
animFrame.push(()=>{
  const sel=following&&!easing&&sheetTrain&&planner.plans.find(p=>p.id===sheetTrain);if(!sel)return;
  const c=trainLngLat(sel),now=performance.now();
  if(!cam||now-camAt>1000)cam={lng:c.lng,lat:c.lat};
  else{const a=1-Math.exp(-(now-camAt)/1000/FOLLOW_EASE);cam={lng:cam.lng+(c.lng-cam.lng)*a,lat:cam.lat+(c.lat-cam.lat)*a}}
  camAt=now;
  const k=`${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;if(k===followAt)return;followAt=k;
  map.jumpTo({center:cam,padding:{top:0,bottom:sheetPad(),left:0,right:0}});
});
animFrame.push(()=>{   // bus: 따라가는 버스 — 열차와 같은 방식으로 카메라가 부드럽게 따라붙는다
  if(!followBus||easing)return;
  const p=busLayer?.selection?.kind==='bus'&&busLayer.selection.id===followBus?busLayer.vehiclePosition(followBus):null;
  if(!p){followBus=null;return}   // 다른 걸 골랐거나 버스가 사라졌으면 그만
  const now=performance.now();
  if(!cam||now-camAt>1000)cam={lng:p[0],lat:p[1]};
  else{const a=1-Math.exp(-(now-camAt)/1000/FOLLOW_EASE);cam={lng:cam.lng+(p[0]-cam.lng)*a,lat:cam.lat+(p[1]-cam.lat)*a}}
  camAt=now;
  const k=`${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;if(k===followAt)return;followAt=k;
  map.jumpTo({center:cam,padding:{top:0,bottom:sheetPad(),left:0,right:0}});
});
map.on('dragstart',()=>{if(following){following=null;followBtn.hidden=!sheetTrain}
  if(followBus){followBus=null;followBtn.textContent='이 버스 따라가기';followBtn.hidden=busLayer?.selection?.kind!=='bus'}});

// ---- 롤코 1인칭: 고른 자리에 앉아 열차를 타요 ----------------------------------------------------
// 열차 정보창의 배치도에서 칸 · 줄 · 좌우를 고르고 타면, 카메라가 그 자리 눈(coaster_first_person.mjs)에서 진행 방향을 보고
// 오르내림 · 루프 · 코르크스크루를 칸과 함께 돌아요. 카메라와 내 열차는 같은 순간의 자리(ride.snap)로 그려 서로 밀리지 않아요.
// 지도를 끌거나 확대하면 · '내리기' · Esc · 롤코 끄기로 내려서 타기 전 카메라로 돌아가요.
let ride=null,rideSeat={car:1,row:1,side:-1};
const riding=plan=>ride&&ride.id===plan.id?ride.snap:null;   // 탄 열차는 늘 카메라를 놓은 순간에 그려요(느린 프레임에도 카메라와 어긋나지 않게)
const rideRows=plan=>{const unit=1/(512*2**RIDE_ZOOM),body=coasterBodyPx(RIDE_ZOOM),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits(),n=plan.cars;
  return seatRows(Math.max(n*plan.carMetres*m,TRAIN_MIN_PX*unit,n*body*1.6*unit)/n/unit-1.4,body)};   // 1인칭 줌에서 칸마다 줄 수(drawTrains 와 같은 칸 길이)
const rideBar=document.createElement('div');rideBar.className='ride-bar';rideBar.hidden=true;rideBar.setAttribute('role','status');
rideBar.innerHTML='<span class="dot"></span><span class="txt"></span><button type="button" class="ride-off">내리기</button>';
rideBar.querySelector('.ride-off').onclick=()=>stopRide(true);
sheetBody.addEventListener('click',e=>{
  const b=e.target.closest('.ride-pick .seat');
  if(b){rideSeat={car:+b.dataset.car,row:+b.dataset.row,side:+b.dataset.side};
    for(const x of sheetBody.querySelectorAll('.ride-pick .seat')){const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))}
    const go=sheetBody.querySelector('.ride-go');if(go)go.textContent=`${seatLabel(rideSeat)}에 타기`;return}
  if(e.target.closest('.ride-go')&&sheetTrain)startRide(sheetTrain)});
function rideBarText(plan){rideBar.style.setProperty('--c',colors[plan.t.line]||'#52646a');rideBar.querySelector('.txt').textContent=`${plan.t.line} ${seatLabel(ride.seat)} · ${riderState(plan)}`}
function startRide(id){
  const plan=planner.plans.find(p=>p.id===id);if(!plan||!coaster||ride)return;
  const back={center:map.getCenter(),zoom:map.getZoom(),bearing:map.getBearing(),elevation:map.getCenterElevation(),maxPitch:map.getMaxPitch(),fov:map.getVerticalFieldOfView(),clamp:map.getCenterClampedToGround()};
  closeSheet();map.stop();easing=false;following=null;
  ride={id,seat:{...rideSeat},snap:null,seen:performance.now(),back};
  map.setMaxPitch(180);map.setCenterClampedToGround(false);map.setVerticalFieldOfView(rideFov(map.getContainer().clientWidth,map.getContainer().clientHeight));   // 루프에서는 위를 보고 뒤집혀요
  const S=COASTER_STYLE.sky[effectiveTheme()==='dark'?'dark':'light'];back.sky=map.getSky();   // 수평선 위: 지도 바탕 대신 하늘
  map.setSky({'sky-color':S.sky,'horizon-color':S.horizon,'fog-color':S.horizon,'sky-horizon-blend':.45,'horizon-fog-blend':.7,'fog-ground-blend':.9,'atmosphere-blend':0});
  map.getContainer().style.setProperty('--ride-ground',S.ground);   // 타일이 끝난 땅: 바탕 격자 대신 먼 땅빛(syung.css body.riding .map)
  rideBarText(plan);rideBar.hidden=false;document.body.classList.add('riding');applyTheme();   // 땅: 탈 때의 색(pack.ground.ride)
  ride.timer=setInterval(()=>{const pl=ride&&planner.plans.find(p=>p.id===ride.id);if(pl)rideBarText(pl)},1000);
  rideFrame();map.triggerRepaint();
}
function stopRide(reopen){
  if(!ride)return;const r=ride;ride=null;clearInterval(r.timer);rideBar.hidden=true;document.body.classList.remove('riding');applyTheme();
  map._camera.transform.clearNearFarZOverride();map.setVerticalFieldOfView(r.back.fov);map.setSky(r.back.sky);
  const plan=planner.plans.find(p=>p.id===r.id);
  map.jumpTo({center:plan?trainLngLat(plan):r.back.center,zoom:r.back.zoom,bearing:r.back.bearing,pitch:r.back.pitch,roll:0,elevation:r.back.elevation});
  map.setMaxPitch(r.back.maxPitch);map.setCenterClampedToGround(r.back.clamp);
  if(reopen&&plan&&coaster)showTrainPopup(plan);   // '내리기': 그 열차 정보창으로(위에서 따라가기)
  map.triggerRepaint();
}
// 한 프레임: 탄 열차의 자리를 이 순간으로 정해 두고(ride.snap — drawTrains 가 같은 자리에 그려요) 내 칸의 틀에서 눈 · 시선을 구해 카메라를 놓아요
function rideFrame(){
  if(!ride)return;const plan=planner.plans.find(p=>p.id===ride.id),now=performance.now();
  if(!plan){if(now-ride.seen>5000)stopRide(false);return}   // 새 자료로 계획이 바뀌는 사이(같은 id 로 돌아와요)
  ride.seen=now;
  const unit=1/(512*2**RIDE_ZOOM),bodyPx=coasterBodyPx(RIDE_ZOOM),lanePx=cityViaduct.train(RIDE_ZOOM,bodyPx).lanePx,n=plan.cars;
  const pose=trainPose(plan),mid=trackPoint(plan,pose.dist),shift=blendShift(plan,mid),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits();
  const total=Math.max(n*plan.carMetres*m,TRAIN_MIN_PX*unit,n*bodyPx*1.6*unit),car=total/n,tail=toRide(plan,pose.dist)-total/2;
  const P=d=>{const q=trackPoint(plan,fromRide(plan,d));if(shift){q.x+=shift[0];q.y+=shift[1]}return q};
  const {j}=seatIndex(ride.seat,n,4),c=coasterCarFrame(P,tail,car,j,n,unit,bodyPx,lanePx,1.4*unit);if(!c)return;
  const rows=seatRows(c.L,bodyPx),{i,side}=seatIndex(ride.seat,n,rows);
  ride.snap={pose,shift,j,k:seatNumber(i,side)};
  const {E,F,U}=seatEye(c.fr,c.L,bodyPx,unit,rows,i,side),mpu=new maplibregl.MercatorCoordinate(E[0],E[1]).meterInMercatorCoordinateUnits();
  // 레일 · 침목: 침목은 땅에 박혀 있게 간격의 격자에 맞추고, 열차가 rebuildM 을 가면(또는 새 자료 · 옮겨 그리는 중이면) 다시 짓는다
  const RT=COASTER_STYLE.rideTrack,step=SLEEPER_M*m,d0=Math.floor((tail-RT.behindM*m)/step)*step;
  if(!ride.rail||ride.rail.plan!==plan||shift||Math.abs(d0-ride.rail.d0)>RT.rebuildM*m)ride.rail={plan,d0,frames:[lanePx,-lanePx].flatMap(l=>coasterRailFrames(P,d0,tail+total+RT.aheadM*m,step,unit,bodyPx,l,tail+total,m)),mpu:m,dirty:true};   // 내 선로와 옆(맞은편) 선로
  ride.eye=E;
  const box=map.getContainer(),fov=rideFov(box.clientWidth,box.clientHeight);if(Math.abs(map.getVerticalFieldOfView()-fov)>.01)map.setVerticalFieldOfView(fov);   // 화면을 돌리거나 크기가 바뀌면 시야각도
  const cam=ride.cam=rideCamera(E,F,U,{ctcd:.5/Math.tan(fov*Math.PI/360)*box.clientHeight,mpu});   // 카메라–center 거리(px): maplibre 와 같은 식
  map.jumpTo({center:new maplibregl.MercatorCoordinate(cam.x,cam.y).toLngLat(),zoom:cam.zoom,elevation:cam.elevation,bearing:cam.bearing,pitch:cam.pitch,roll:cam.roll,padding:{top:0,bottom:0,left:0,right:0}});
  const ppm=512*2**RIDE_ZOOM*mpu;map._camera.transform.overrideNearFarZ(RIDE_NEAR_M*ppm,RIDE_FAR_M*ppm);   // px(공개 API 없음 — maplibre 6.11 transform): 가까운 칸이 잘리지 않게(기본 가까운 면은 줌 18 에서 7 m)
}
animFrame.push(rideFrame);
// #fps: 실제 기기에서 지도 프레임 — 초당 프레임, 늦은 프레임(20 · 34 ms 넘게) 수, 가장 긴 간격, 지도 한 프레임 · 1인칭 카메라 JS 시간(ms). 서버 캡처로는 잴 수 없어서(2026-10-06 덕배)
if(location.hash.includes('fps')){const o=document.createElement('pre');o.style.cssText='position:fixed;z-index:99;left:4px;bottom:4px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.78);color:#fff;border-radius:8px;pointer-events:none;white-space:pre';document.body.append(o);
  const iv=[],js=[],cam=[],r=map._render.bind(map);let last=0,shown=0;
  map._render=(...a)=>{const t=performance.now();if(last)iv.push(t-last);last=t;const x=r(...a);js.push(performance.now()-t);return x};
  animFrame[animFrame.indexOf(rideFrame)]=()=>{const t=performance.now();rideFrame();if(ride)cam.push(performance.now()-t)};
  const ms=a=>a.length?Math.max(...a).toFixed(0):'-',avg=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):'-';
  setInterval(()=>{const now=performance.now(),s=now-shown;shown=now;
    o.textContent=`${ride?'탑승 중':'지도'} ${(iv.length*1000/s).toFixed(0)} fps · 늦은 프레임 ${iv.filter(x=>x>20).length} / ${iv.filter(x=>x>34).length} · 가장 긴 간격 ${ms(iv)} ms\n지도 JS 평균 ${avg(js)} · 최장 ${ms(js)} ms · 카메라 ${avg(cam)} / ${ms(cam)} ms · ${devicePixelRatio}x ${innerWidth}×${innerHeight}`;
    iv.length=js.length=cam.length=0},1000)}
map.on('movestart',e=>{if(ride&&e.originalEvent)stopRide(false)});   // 끌기 · 확대 · 돌리기: 사람이 카메라를 잡으면 내려요

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
  ${coaster?`<div class="sec">자리 고르고 타기 <span class="muted">· 위가 진행 방향</span></div><div class="ride-pick">${seatPickerHTML(plan.cars,rideRows(plan),rideSeat)}</div><button type="button" class="ride-go">${seatLabel(rideSeat)}에 타기</button>`:''}
  <div class="sec">서울시 실시간 원본</div>
  <dl class="kv">${rawFeedHTML(t)}</dl></div>`;
}
function rawFeedHTML(t){
  const a=Math.round(age(t.receivedAt)),kst=v=>v?new Date(v).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'-',kv=(k,v)=>`<dt>${k}</dt><dd>${v}</dd>`;
  return `${kv('역',esc(t.station))}${kv('상태',esc(t.status))}${kv('방향',esc(t.direction))}${kv('행선지',esc(t.destination||'-'))}
  ${kv('기록 시각',`${esc(String(t.receivedAt||'-').slice(11))} <span class="muted">(${a}초 전)</span>`)}${kv('받은 시각',kst(feed.fetchedAt))}`;
}
function showTrainPopup(plan){
  const token=openSheet(trainSheetHTML(plan));sheetTrain=plan.id;
  requestAnimationFrame(()=>follow(plan.id));
  // keep the status line current while this train's sheet is open (plans are rebuilt on each feed update)
  const timer=setInterval(()=>{
    if(token!==sheetToken)return clearInterval(timer);
    const pl=planner.plans.find(p=>p.id===sheetTrain);if(!pl)return;
    const now=sheetBody.querySelector('.tp-now'),dest=sheetBody.querySelector('.tp-dest');
    if(now)now.textContent=riderState(pl);if(dest)dest.textContent=destLabel(pl.t)||'행선지 정보 없음';
    // the raw record too: plan.t is replaced on every feed update, and the "N초 전" age ticks
    const raw=sheetBody.querySelector('.train-inspect .kv'),h=rawFeedHTML(pl.t);if(raw&&raw.innerHTML!==h)raw.innerHTML=h;
  },1000);
}
document.head.insertAdjacentHTML('beforeend','<style>.train-inspect{min-width:190px}.train-inspect .tp-line{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--c)}.train-inspect .tp-line .dot{width:9px;height:9px;border-radius:50%;background:var(--c)}.train-inspect .tp-line .no{color:#7a8a90;font-weight:600;font-variant-numeric:tabular-nums}.train-inspect .b{font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;color:#fff;background:var(--c)}.train-inspect .b.last{background:#141414}.train-inspect .tp-dest{font-size:20px;font-weight:800;margin:4px 0 2px;letter-spacing:-.01em}.train-inspect .tp-now{font-size:12px;color:#6b7b80}.train-inspect details{margin-top:8px;font-size:12px}.train-inspect summary{cursor:pointer;color:#8a979b;font-weight:600}.train-inspect table{border-collapse:collapse;font-size:12px;margin-top:4px}.train-inspect th{text-align:left;color:#6b7b80;font-weight:600;padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top}.train-inspect td{padding:2px 0}.train-inspect .sec{padding-top:8px;font-weight:800;color:#172429;border-bottom:1px solid #dbe1e2}.train-inspect .muted{color:#8a979b}</style>');
// Nearest train to a screen point (distance to the train's head–tail segment), within ~14 px.
function pickTrain(point){
  if(!trainsEnabled||!feed.on||subwayOff)return null;
  const unit=1/(512*2**map.getZoom());let best=null;
  for(const plan of planner.plans){
    const pose=trainPose(plan),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits(),half=Math.max(plan.cars*plan.carMetres*m,TRAIN_MIN_PX*unit)/2;
    const Z=map.getZoom(),lane=simcity||coaster?cityViaduct.train(Z,coasterBodyPx(Z)).lanePx:laneOffsetPx(Z),P=d=>{const q=trackPoint(plan,d),o=(q.off+lane)*unit,X=q.x+q.r[0]*o,Y=q.y+q.r[1]*o;return simcity||coaster?cityViaduct.screen(map,X,Y,q.h):map.project(new maplibregl.MercatorCoordinate(X,Y,0).toLngLat())};   // city-life: 심시티 — picked where it is drawn, up on the viaduct
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
  if(!msg&&feed.fetchedAt&&feed.on&&Date.now()-new Date(feed.fetchedAt).getTime()>180000)msg=`실시간 정보가 ${new Date(feed.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})} 이후 갱신되지 않았어요.`;
  liveNotice.textContent=msg||'';liveNotice.hidden=!msg||!feed.on;
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
// Station names sit inside the platform rectangle, turned along it. Where the name is longer than
// the platform on screen, its box (same outline and fill) extends past it so the text still fits.
// They are drawn by a WebGL layer placed *below* the trains, so a train at a station stays visible.
const measure=(()=>{const c=document.createElement('canvas').getContext('2d'),cache=new Map();return (t,px)=>{const k=px.toFixed(1)+t;let w=cache.get(k);if(w==null){c.font=`700 ${px}px "Noto Sans KR",sans-serif`;w=c.measureText(t).width;cache.set(k,w)}return w}})();
// Screen-space placement of every visible name box (collision-culled), recomputed each frame.
const hexRGB3=v=>[parseInt(v.slice(1,3),16)/255,parseInt(v.slice(3,5),16)/255,parseInt(v.slice(5,7),16)/255];
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
  shown(){if(cityOn())return false;const z=map.getZoom();return z>=(PHONE?15:14)&&map.getLayer('bm-bld3d')&&map.getLayoutProperty('bm-bld3d','visibility')!=='none'}
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
const exitPillars=new ExitPillars({map,maplibregl,stations,exitCol,colors,hexRGB3,EXIT_MINZOOM,document,getExits:()=>exits,getSelected:()=>selected});
// 롤코 선로(modes/coaster/track.mjs)
const coasterTrack=createCoasterTrack({buildCoasterTrackMesh,coasterTrackVertexShader,COASTER_TRACK_FS,map,maplibregl,HOME,paths,byId,colors,geom,coasterProfile,coasterAt,coasterRises,loopD,corkOf,rolled,CORK_HEART,edgeOffset,hexRGB,coasterBodyPx,cityViaduct,PHONE,trainFrameSoon,isCoaster:()=>coaster,getSelected:()=>selected});
let stationAlpha=1;   // station platforms and names: faded behind a 길찾기 route (focusRoute)
const stationNames=new StationNameLayer({map,maplibregl,stationRects,exitCol,cityViaduct,colors,hexRGB3,stationWidthPx,platformPx,PLATFORM_SCALE,closestPlatformPoint,platformStroke,EXIT_MINZOOM,EXIT_MAX_M,EXIT_PASSAGES,document,matchMedia:q=>matchMedia(q),
  getLabels:()=>stationLabels.list,getSelected:()=>selected,getExits:()=>exits,getStationAlpha:()=>stationAlpha,isCoaster:()=>coaster,isSimcity:()=>simcity});   // city-life: 심시티 — the bars take the buildings' depth there too (see its render)
// 역 이름표(map/labels.mjs): 보이는 역의 이름표 자료와 그 자리. labels 의 주인
const stationLabels=createStationLabels({map,stations,stationRects,colors,getSelected:()=>selected});
const scheduleLabels=stationLabels.schedule;
function rebuildLabels(){stationLabels.rebuild()}

function filterLine(line){
  if(!ready){pendingLine=line;return}
  selected=line;
  map.setFilter('routes',line==='all'?null:['==',['get','line'],line]);
  for(const id of ['stations','stations-casing'])map.setFilter(id,line==='all'?null:['==',['get','line'],line]);
  rebuildLabels();
  const visible=stations.filter(s=>line==='all'||s.lines.some(x=>x.name===line));
  $('mapTitle').textContent=line==='all'?`${stations.length}개 역 노드 전체 보기`:`${line} · ${visible.length}개 역`;
  $('status').textContent=`${line==='all'?'전체 노선':line} · ${visible.length}개 역 위치와 역명을 표시합니다.`;
  feed.reset();planner.clear();lastPose.clear();map.triggerRepaint();
  if(line==='all')map.jumpTo(HOME);
  else{const b=new maplibregl.LngLatBounds();visible.forEach(s=>b.extend([s.lon,s.lat]));map.fitBounds(b,{padding:60,maxZoom:13})}
  refreshLive(true);
}
// 실시간 열차(trains/live_feed.mjs): 받은 기록으로 예측만 다시 세운다
const feed=createLiveFeed({map,stations,liveState,getSelected:()=>selected,getSheetTrain:()=>sheetTrain,hasPlans:()=>planner.plans.length>0,age,updateLiveNotice,
  onTrains:trains=>{learnDirections(trains);planner.replacePlans(trains.map(planner.planTrain).filter(Boolean));lastPose.clear();return planner.plans.length},
  onClear:()=>{planner.clear();lastPose.clear();map.triggerRepaint()}});
function refreshLive(force=false){return feed.refresh(force)}

map.on('load',()=>{
  let labelsStale=false;
  map.addSource('routes',{type:'geojson',data:{type:'FeatureCollection',features:buildLineFeatures()}});
  shapesReady.then(()=>{map.getSource('routes').setData({type:'FeatureCollection',features:buildLineFeatures()});map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels();map.triggerRepaint()});
  map.on('zoom',()=>{if(coaster||simcity)return;let changed=false;for(const [key,t] of basicRouteCache){const [line,a,b]=key.split(':');if(t.zoom&&t.zoom!==map.getZoom()){changed=true;break}}if(!changed)return;map.getSource('routes').setData({type:'FeatureCollection',features:buildLineFeatures()});map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});labelsStale=true});
  map.on('zoomend',()=>{if(labelsStale){labelsStale=false;rebuildLabels()}});   // 승강장 좌표가 줌마다 바뀌어요. 이름표 자리는 줌이 끝난 뒤 한 번만 다시(줌 중 매 프레임 setData 하면 깜빡여요)
  map.addLayer({id:'routes',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],8,1.5,15,4],'line-offset':['get','offset'],'line-opacity':.9}});
  map.addSource('stations',{type:'geojson',data:{type:'FeatureCollection',features:buildStationFeatures()}});
  // Stations: square-ended platform rectangles filled with the line colour (no outline), widths shared with the name boxes.
  // line layers kept (invisible) for clicking; the visible platforms are drawn by the station-names layer
  map.addLayer({id:'stations-casing',type:'line',source:'stations',layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-opacity':0,'line-color':['get','color'],'line-offset':['get','offset'],'line-width':['interpolate',['linear'],['zoom'],...STATION_WIDTH_STOPS.flat()]}});
  map.addLayer({id:'stations',type:'line',source:'stations',layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-opacity':0,'line-color':['get','color'],'line-offset':['get','offset'],'line-width':['interpolate',['linear'],['zoom'],...STATION_WIDTH_STOPS.map(([z,w])=>[z,Math.max(1,w-4)]).flat()]}});
  map.addLayer(stationNames);   // platforms under the trains
  map.addSource('station-labels',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  // 역마다 작은 알약 이름표과 위쪽 노선 점을 놓고, 놓인 것만 열차 · 고가 위에 그려요.
  // 투명 아이콘은 전체 영역을 예약해요. 치수는 SIGN 과 맞춰요(lib/station_signs.mjs).
  {const R=2,W=32,H=32;
   map.addImage('station-sign',{width:W*R,height:H*R,data:new Uint8Array(W*R*H*R*4)},{pixelRatio:R,stretchX:[[0,W*R]],stretchY:[[0,H*R]],content:[0,0,W*R,H*R]})}
  const SIGN_LAYOUT={'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],13,10,16,12.5,18,14],'symbol-sort-key':['get','rank'],...signCollisionLayout()};
  const SIGN_PAINT={'text-color':'#141414','text-halo-color':'#ffffff','text-halo-width':0,'text-opacity':0,'icon-opacity':0};
  map.addLayer({id:'station-labels',type:'symbol',source:'station-labels',minzoom:PHONE?12.01:13.01,layout:{'text-field':['get','ph'],...SIGN_LAYOUT},paint:SIGN_PAINT});
  // trains: their own canvas over the map (see TRAIN_FPS)
  {
    const c=document.createElement('canvas');c.className='train-overlay';map.getCanvas().after(c);   // right above the map, under markers and popups
    c.style.cssText='position:absolute;left:0;top:0;pointer-events:none';
    const gl=c.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:true});
    // 역 이름표 캔버스: 열차 캔버스 바로 위(마커 · 팝업 아래)
    const sc=document.createElement('canvas');sc.className='station-signs';c.after(sc);sc.style.cssText='position:absolute;left:0;top:0;pointer-events:none';
    const sctx=sc.getContext('2d');let signFeatures=[],signAt=0,signMatrix=null,signTimer=0,signShown=false;
    // 그릴 이름표가 없으면 캔버스를 숨긴다: 다 지우고 아무것도 안 그리면 크롬이 직전 그림을 계속 띄웠다 — 크게 옮긴 뒤 전 자리의 역 이름이
    // 같은 화면 자리에 몇 초씩 남았다(2026-10-10 덕배, 잠실 → 여의도). 캔버스 픽셀은 비어 있었다
    const showSigns=on=>{if(on!==signShown){signShown=on;sc.style.visibility=on?'':'hidden'}};
    const drawSigns=M=>{
      const m=map.getCanvas(),W=m.clientWidth,H=m.clientHeight;signMatrix=M;
      if(sc.width!==m.width||sc.height!==m.height){sc.width=m.width;sc.height=m.height}
      sc.style.width=m.style.width;sc.style.height=m.style.height;sctx.clearRect(0,0,sc.width,sc.height);
      const now=performance.now();   // 놓인 이름표 목록은 가끔만 다시 받아요(배치도 그 정도 간격으로 바뀌어요). 위치는 매 프레임 투영
      if(now-signAt>150){signAt=now;signFeatures=map.getLayer('station-labels')?map.queryRenderedFeatures({layers:['station-labels']}):[]}
      if(!signFeatures.length){showSigns(false);return}
      const clip=(x,y)=>[M[0]*x+M[4]*y+M[12],M[1]*x+M[5]*y+M[13],M[3]*x+M[7]*y+M[15]];
      const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),cw=clip(O.x,O.y)[2],z=map.getZoom(),size=signTextSize(z),seen=new Set(),items=[];
      for(const f of signFeatures){
        const [lng,lat]=f.geometry.coordinates,k=`${lng},${lat}`;if(seen.has(k))continue;seen.add(k);
        const q=maplibregl.MercatorCoordinate.fromLngLat([lng,lat]),[x,y,w]=clip(q.x,q.y);if(!(w>0))continue;
        const sx=(x/w*.5+.5)*W,sy=(.5-y/w*.5)*H;if(ride&&!(sy>=0&&sy<=H))continue;   // 롤코 1인칭: 지나온 역 이름표가 화면 아래에서 탄 칸 위로 올라오지 않게
        items.push({x:sx,y:sy,scale:perspectiveRatio(cw,w),size,rows:signRows(f.properties),phase:(lng*977+lat*613)%(Math.PI*2)});   // phase: 팻말마다 다른 박자로 둥둥
      }
      items.sort((a,b)=>a.y-b.y);   // 먼 것(화면 위)부터, 가까운 것을 그 위에(출구 기둥과 같은 순서)
      showSigns(items.length>0);
      drawStationSigns(sctx,items,{dpr:m.width/Math.max(1,W),dark:effectiveTheme()==='dark',alpha:stationAlpha,now,still:REDUCED.matches});
      if(!REDUCED.matches&&!signTimer)signTimer=setTimeout(()=>{signTimer=0;if(!map.isMoving()&&signMatrix)drawSigns(signMatrix)},1000/TRAIN_FPS);   // 둥둥: 팻말 캔버스만 다시(카메라가 움직이면 지도 프레임마다 drawTrains 가 그려요)
    };
    map.on('idle',()=>{signAt=0;if(signMatrix)drawSigns(signMatrix)});   // 멈춘 뒤 마지막 배치로
    const layer=new TrainLayer();layer.onAdd(map,gl);const walls=new BuildingDepth(gl);let rides=null,night=null,cityLife=null,ridePlacement=null;   // coaster: checked ride sites; cityLife: city-life's props
    drawTrains=()=>{
      const m=map.getCanvas();if(c.width!==m.width||c.height!==m.height){c.width=m.width;c.height=m.height}
      c.style.width=m.style.width;c.style.height=m.style.height;
      gl.viewport(0,0,c.width,c.height);gl.clearColor(0,0,0,0);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);   // bus: clear instanced geometry depth even after a no-write pass
      const pd=map.painter.transform.getProjectionDataForCustomLayer(true);   // the transform the map just drew with
      if(cityOn()&&cityBuildings)cityBuildings.setXray(simcity?cityXrayTargets():null);   // city-build: 심시티 x-ray boxes (none on the coaster)
      const drawn=cityOn()&&cityBuildings?cityBuildings.drawDepth(gl,pd.mainMatrix):walls.draw(pd.mainMatrix),behind=drawn&&!cityOn()?1-mapPalette().bld3dOpacity:0;   // city-build: in a city mode the city's own (opaque) walls
      if(coaster&&kitReady&&coasterGeo.bld?.towers?.length){   // the rides where the towers were (their buildings are filtered out): first, so the track and trains depth-test against them
        if(!rides){   // coaster: only expose a neighbourhood after its buildings and rails have been checked
          rides=new RideLayer(coasterGeo.bld.towers,{deferPlacement:true});rides.init(gl,maplibregl);if(window.__subwayWebGL)window.__subwayWebGL.rides=rides;   // 캡처 · 점검용: 놀이기구 자리(rides.sites())
          ridePlacement=new CoasterRidePlacement(rides.candidates.filter(c=>!c.lotte),{   // 롯데월드타워 자리는 놀이기구 대신 전용 모델(cityLandmarks)
            map,minH:cityBuildings.P.minH,missingH:cityBuildings.P.missingH,maxH:RIDE_H,
            getTracks:bounds=>sampleRideTracks(coasterTrack,bounds,{geometry:e=>geom(e.line,e.lo,e.hi),offset:e=>edgeOffset(e.line,e.lo,e.hi),bodyPx:coasterBodyPx(14),lanePx:cityViaduct.train(14,coasterBodyPx(14)).lanePx,heart:CORK_HEART}),
            onChange:sites=>{rides.setSites(sites);map.triggerRepaint()}});window.__subwayWebGL.ridePlacement=ridePlacement;
        }
        const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
        if(coasterTrack.edges)ridePlacement.update([A.x,B.y,B.x,A.y]);   // coaster: tile loading is asynchronous; pending sites stay hidden
        rides.render(gl,pd.mainMatrix,{now:performance.now(),dark:effectiveTheme()==='dark',night:effectiveTheme()==='dark',pixelRatio:c.width/Math.max(1,m.clientWidth),zoom:map.getZoom(),phone:PHONE,reducedMotion:REDUCED.matches,bounds:[A.x,B.y,B.x,A.y]});
        if(rides.animating())trainFrameSoon(1000/TRAIN_FPS)}
      if(simcity||coaster){   // city-life: the living city (trees, lamps, cars, people) once the walls and rides have their depth, before the track and the trains. The people walk in both modes (LIFE-01): the same figures in the same places, only toned by the mode
        if(!cityLife){cityLife=new CityLife({pack:CITY_STYLE});cityLife.init(gl,maplibregl,map);window.__subwayWebGL.cityLife=cityLife}
        const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
        cityLife.render(gl,pd.mainMatrix,{look:cityPack(),now:performance.now(),zoom:map.getZoom(),bearing:map.getBearing(),dark:effectiveTheme()==='dark',coaster,people:true,phone:PHONE,reducedMotion:REDUCED.matches,pixelRatio:c.width/Math.max(1,m.clientWidth),bounds:[A.x,B.y,B.x,A.y],mapOn:$('toggleMap').getAttribute('aria-pressed')==='true',moving:map.isMoving(),sun:sunPosition()});
        if(cityLife.animating())trainFrameSoon(1000/TRAIN_FPS)}
      if(busLayer)busLayer.joseon=joseon;busLayer?.render(gl,pd.mainMatrix,behind);   // 조선 모드: 버스 대신 가마   // bus: shared walls/depth, instanced road vehicles and BUS posts in every mode — 건물 뒤는 열차와 같은 투명도로 비친다
      if(simcity||coaster){   // city-life: 심시티 고가 — (롤코도 이 고가 위를 달린다) the viaduct the trains ride (deck; piers kept off the buildings' footprints through cityLife; roofed platforms), once the cars and buses have their depth, before the trains
        const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast()),zoom=map.getZoom();
        cityViaduct.setPack(cityPack());   // 조선 모드: 같은 고가를 물 채운 돌 수로로
        if(cityViaduct.render(gl,pd.mainMatrix,{now:performance.now(),zoom,dark:effectiveTheme()==='dark',phone:PHONE,bounds:[A.x,B.y,B.x,A.y],sun:sunPosition(),life:cityLife,selected,moving:map.isMoving(),bodyPx:coasterBodyPx(zoom)}))trainFrameSoon(50);
        cityLandmarks?.render(gl,pd.mainMatrix,{zoom,dark:effectiveTheme()==='dark',joseon,sun:sunPosition()})}   // 랜드마크: 조각 건물은 city_mesh 가 뺐다. 롤코에서도 같은 모델(2026-10-10 행님: 심시티만 바뀌고 롤코는 예전 그대로였다) — 그 자리 자이로드롭은 뺐고, 8호선 코스는 반지름 150 m 로 그 둘레를 감아 오른다
      coasterTrack.render(gl,pd.mainMatrix,behind);   // under the trains
      layer.render(gl,{defaultProjectionData:pd,walls:drawn||!!rides&&coaster,occlude:behind});
      // the park at night (dark theme): bulbs under the track and fireworks over the river — after everything solid has its depth
      if(coaster&&effectiveTheme()==='dark'&&coasterTrack.edges){   // (edges: once the track has been set up)
        if(!night){night=new NightLayer();night.init(gl)}
        {const bp=coasterTrack.bulbs();if(night.trackSrc!==bp){night.setTrackBulbs(bp,coasterTrack.bulbRgb);night.trackSrc=bp}}   // 레일이 고가를 떠난 곳 아래 전구(다시 지으면 다시); 승강장 불빛은 고가 승강장의 밤 조명이 맡는다
        const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
        night.render(gl,pd.mainMatrix,{now:performance.now(),zoom:map.getZoom(),phone:PHONE,reducedMotion:REDUCED.matches,bounds:[A.x,B.y,B.x,A.y],pixelRatio:c.width/Math.max(1,m.clientWidth)});
        if(night.animating())trainFrameSoon(1000/TRAIN_FPS)}
      else if(night){night.dispose(gl);night=null}
      if(simcity&&cityBuildings)cityBuildings.drawGlass(gl,pd.mainMatrix);   // city-build: 심시티 x-ray — the buildings hiding a station or a train, as glass over what was drawn behind them
      if(!subwayOff)exitPillars.render(gl,pd.mainMatrix,m.clientWidth,m.clientHeight,c.width/Math.max(1,m.clientWidth),cityOn()&&drawn);   // above the trains   // city-life: 심시티 too: behind the (opaque) buildings and the viaduct
      if(ride&&coaster&&layer.c88ride?.n){   // 롤코 1인칭: 내 칸은 맨 마지막에, 깊이를 비우고 눈앞 10 cm 까지 그린다(지도는 기본에 가까운 가까운 면 — RIDE_NEAR_M)
        const ppm=512*2**RIDE_ZOOM*maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()).meterInMercatorCoordinateUnits();
        gl.depthMask(true);gl.clear(gl.DEPTH_BUFFER_BIT);layer.c88ride.draw(gl,nearMatrix(pd.mainMatrix,COCKPIT_NEAR_M*ppm),layer.ox,layer.oy,{...layer.c88o,part:'body',occlude:0})}
      drawSigns(pd.mainMatrix);   // 역 이름표: 3D 를 다 그린 뒤 그 위 캔버스에
    };
    map.on('render',()=>drawTrains());   // the camera moved or the map redrew: trains follow in the same frame
    // walls: again when new building tiles arrive or the view settles somewhere new
    let wallTimer=0;const wallsSoon=()=>{clearTimeout(wallTimer);wallTimer=setTimeout(()=>{if(map.isMoving())return;walls.rebuild();requestAnimationFrame(drawTrains)},250)};   // not while moving (tiles arriving mid-pan ran it, 50–350 ms a stall): moveend runs it   // city-life: the walkers' streets went with the walkers (city_life.mjs)
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
  map.on('click',e=>{if(ride)return;if(map.queryRenderedFeatures(e.point,{layers:['stations','stations-casing']}).length)return;const pl=pickTrain(e.point);if(pl)showTrainPopup(pl);else if(busLayer?.selectAt(e.point)){if(busLayer.selection?.kind==='bus')followBusStart(busLayer.selection.id)}else closeSheet()});   // bus: 누른 버스는 따라간다   // bus: subway picking keeps priority
  map.on('click','stations',e=>{if(ride)return;const pl=pickTrain(e.point);if(pl){showTrainPopup(pl);return}const p=e.features[0].properties;showStationPopup(byId.get(+p.id),e.lngLat)});
  map.on('mouseenter','stations',()=>map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','stations',()=>map.getCanvas().style.cursor='');
  ready=true;
  // 모드 코드는 첫 화면이 다 뜬 뒤 쉬는 틈에 미리 받아 둔다(모드를 누르면 바로 켜지게)
  map.once('idle',()=>{const go=()=>loadModeKit().catch(()=>{});'requestIdleCallback' in window?requestIdleCallback(go,{timeout:4000}):setTimeout(go,1500)});
  map.on('rotate',()=>{if(themeChoice==='auto'){const b=$('themeIcon');if(b)b.innerHTML=sunArcIcon().svg}});
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'노선·역·시간표 KTDB 대중교통 GTFS · 실시간 서울 열린데이터광장 · 선로 © OpenStreetMap contributors'}),'bottom-left');
  // start collapsed to the ⓘ button (MapLibre opens it on first load); tap to read
  map.once('idle',()=>{const d=map.getContainer().querySelector('.maplibregl-ctrl-attrib');if(d){d.classList.remove('maplibregl-compact-show');d.removeAttribute('open')}});
  // recompute shadows when the view settles or building tiles arrive (debounced)
  let sunTimer=0;const sunSoon=()=>{clearTimeout(sunTimer);sunTimer=setTimeout(()=>{if(!map.isMoving())updateSun()},400)};   // not mid-pan (as the walls): moveend runs it
  map.on('moveend',sunSoon);map.on('sourcedata',e=>{if(e.sourceId==='ofm'&&e.isSourceLoaded&&e.tile)sunSoon()});
  addBasemap();
  // bus: below subway lines, using the existing detail sheet and settings controls.
  busLayer=createBusLayer({map,phone:PHONE,requestRender:()=>trainFrameSoon(0),getExitCoordinates:()=>Object.values(exits).flat(),onSelect:html=>{   // bus: redraw only the train canvas; reserve exit pillars
    following=null;followBus=null;sheetTrain=null;followBtn.hidden=true;const token=openSheet(html,'bus');
    return next=>{if(sheetToken!==token||sheetBody.innerHTML===next)return;const focused=sheetBody.contains(document.activeElement);sheetBody.innerHTML=next;if(focused)sheetBody.querySelector('h3')?.focus({preventScroll:true})};
  },onRouteSelect:leg=>{   // bus: reuse journey's fitting/focus; closing or deselecting clears only this route-number presentation
    setSubwayOff(!!leg);
    if(leg)showRoute({legs:[leg]},true,busLayer?.selection?.kind!=='bus');   // 버스를 눌렀으면 노선 전체로 멀어지지 않고 그 버스를 따라간다
    else if(busRouteFocus){displayedRoute=null;busRouteFocus=false;routeBounds=null;map.getSource('journey')?.setData({type:'FeatureCollection',features:[]});focusRoute(false)}
  },onClear:()=>{if(sheetBody.querySelector('.bus-detail'))closeSheet()}});
  window.__subwayWebGL.busLayer=busLayer;
  // exits: yellow number discs (like station exit signs) from zoom 16
  map.addSource('exits',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  // exit sign: flat yellow rounded square with a thin ink rim, stretched to the number
  {const R=2,S=26*R,c=document.createElement('canvas');c.width=S;c.height=S+2*R;const x=c.getContext('2d');
   x.beginPath();x.roundRect(R,R,S-2*R,S-2*R,4*R);x.fillStyle='#141414';x.fill();
   x.beginPath();x.roundRect(2.2*R,2.2*R,S-4.4*R,S-4.4*R,3*R);x.fillStyle='#ffd400';x.fill();   // flat: thin ink rim, no drop shadow
   map.addImage('exit-sign',x.getImageData(0,0,S,S+2*R),{pixelRatio:R,stretchX:[[10*R,16*R]],stretchY:[[10*R,16*R]],content:[5*R,4*R,S-5*R,S-4*R]})}
  map.addLayer({id:'exit-refs',type:'symbol',source:'exits',minzoom:EXIT_MINZOOM,layout:{'text-field':['get','ref'],'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],16,10,18,12.5],'icon-image':'exit-sign','icon-text-fit':'both','icon-text-fit-padding':[2,3,2,3],'icon-allow-overlap':true,'text-allow-overlap':true},paint:{'text-color':'#141414','text-opacity':0,'icon-opacity':0}});   // invisible: holds the exits' room so station names make way (the pillars are drawn with the trains)
  map.moveLayer('exit-refs','station-labels');   // 역 이름표가 먼저 자리를 잡아요: 표지판은 역 바로 위에만 서서, 출구 자리를 비키면 기울인 화면에선 설 곳이 없어요(이름표가 기둥 위에 그려져요)
  exitsReady.then(()=>map.getSource('exits').setData({type:'FeatureCollection',features:exitFeatures()}));
  $('toggleMap').setAttribute('aria-pressed','true');   // background map on by default
  applyTheme();
  map.getContainer().append(liveNotice);map.getContainer().parentElement.append(sheet,rideBar);   // train number and destination live in the train popup, not on the map
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
const mapPalette=(t=effectiveTheme())=>{const P={...MAP_THEMES[t],...(mapColor==='color'?MAP_COLORS[t]:{})};if(!coaster)return simcity?{...P,...cityPalette(t,{pack:cityPack()})}:P;   // city-life: 심시티 — the ground from the style pack
  const K=PARK_COLORS[t],m=mapColor==='color'?0:.15,Q={...P,...K,bld3dOpacity:1};for(const k of ['bg','park','land','water','bld'])Q[k]=mixHex(K[k],K.bg,m);
  const id=['abs',['to-number',['id'],0]];   // ids run in tens and hundreds (osm id × 10…): two residues multiplied mix them
  Q.bld3d=['match',['%',['floor',['/',['*',['%',id,9973],['%',id,9967]],7]],6],...K.blocks.slice(0,5).flatMap((v,i)=>[i,v]),K.blocks[5]];return {...Q,...cityPalette(t,{pack:CITY_STYLE,coaster:true,ride:!!ride})}};   // city-life: the park sits on the same city ground, toned down (spec §7)
let themeChoice='auto';
try{themeChoice=localStorage.getItem(THEME_KEY)||'auto'}catch{}
// Sunrise / sunset for Seoul (sunrise equation; accurate to a few minutes)
function effectiveTheme(){if(themeChoice!=='auto')return themeChoice;const now=new Date(),{rise,set}=seoulSun(now);return now>=rise&&now<set?'light':'dark'}
function applyTheme(){queueMicrotask(()=>{if(map.getLayer?.('journey-veil'))focusRoute(!!routeBounds)});
  const t=effectiveTheme(),P=mapPalette();
  busLayer?.setTheme(t);   // bus: the same light/dark setting as the map
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
  set('bm-bld3d','fill-extrusion-color',P.bld3d);set('bm-bld3d','fill-extrusion-opacity',cityOn()?0:P.bld3dOpacity);if(map.getLayer('bm-bld3d')){map.setFilter('bm-bld3d',coaster?['<',['coalesce',['get','render_height'],10],RIDE_H]:null);map.setPaintProperty('bm-bld3d','fill-extrusion-vertical-gradient',!coaster)}   // the towers are rides on the coaster
  set('bm-road-minor','line-color',P.roadMinor);set('bm-road-major','line-color',P.roadMajor);set('bm-rail','line-color',P.rail);
  for(const [id,c] of [['bm-label-place',P.text],['bm-label-road',P.road],['bm-label-water',P.waterText],['bm-label-park',P.parkText],['bm-label-poi',P.poi]]){set(id,'text-color',c);set(id,'text-halo-color',P.halo)}
  set('station-labels','text-color',P.stationText);set('station-labels','text-halo-color',P.halo);
  applyCityStyle(map,{on:simcity||coaster,theme:t,coaster,mapOn:$('toggleMap').getAttribute('aria-pressed')==='true',pack:cityPack(),ride:!!ride});   // city-life: the city ground's layers in this theme and mode (the stock roads step aside)
  applyGroundTexture(map,{on:joseon&&$('toggleMap').getAttribute('aria-pressed')==='true',theme:t,pack:cityPack()});   // 조선: 흙 질감 (packed earth instead of a flat floor)
  syncCity();   // city-build: the buildings follow the mode and theme
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
const sunShadows=new SunShadowLayer();
const JOSEON_SHADOW_H=5;   // m: the shadow a 기와집 casts (its eaves and roof, a little under the ridge)
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
    const h0=+(f.properties.render_height??10),h=joseon&&h0<JOSEON_STYLE.hanok.tall.towerMinH?JOSEON_SHADOW_H:h0,g=f.geometry;   // 조선: a low building is a low house; a tall one keeps its height (한옥 고층 · 목탑)if(!h||!g||coaster&&h>=RIDE_H)continue;
    const rings=g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):[];
    for(const ring of rings){
      if(!ring||ring.length<3)continue;
      const key=ring[0][0].toFixed(6)+ring[0][1].toFixed(6)+h;if(seen.has(key))continue;seen.add(key);
      // real low-sun shadows run ~10× the height; on a map that blankets whole blocks, so cap at 3.5× height / 250 m
      const len=Math.min(cityOn()?+(cityPack().lighting?.shadow?.maxLengthM??80):250,h*Math.min(k,3.5)),kx=Math.cos(ring[0][1]*Math.PI/180),dx=ux*len/(111320*kx),dy=uy*len/111320;
      const pts=[];for(const [x,y] of ring){pts.push([x,y]);pts.push([x+dx,y+dy])}
      const hp=hull(pts).map(q=>{const m=maplibregl.MercatorCoordinate.fromLngLat(q);return [m.x-O.x,m.y-O.y]});
      for(let i=1;i<hp.length-1;i++)tris.push(...hp[0],...hp[i],...hp[i+1]);   // convex hull → triangle fan
    }
  }
  // fade in over the first ~8° after sunrise (and out before sunset): very long low-sun shadows get cut off otherwise
  const fade=Math.max(0,Math.min(1,(el-2)/13));   // fade in over the first ~15° after sunrise, out before sunset
  // phones: small bright screens make the same shade read much darker, so lighten it there
  const phone=matchMedia('(max-width:720px),(pointer:coarse)').matches?.35:1;
  const cityA=cityOn()?+(cityPack().modes?.[simcity?'simcity':'coaster']?.shadowOpacity?.[dark?'dark':'light']??.14):null;   // city-build: the city's shadow strength and colour from the style pack
  sunShadows.color=cityA!=null?hexRGB3(cityPack().lighting?.shadow?.color||'#394D4B'):null;
  sunShadows.set({data:new Float32Array(tris),ox:O.x,oy:O.y},cityA!=null?cityA*fade*phone:Math.min(coaster?mapPalette().shadow:.34,.14+el/150)*fade*(dark?.55:1)*phone);
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
  addCityLayers(map,{pack:CITY_STYLE});   // city-life: the city ground's layers (hidden until a city mode is on)
  applyTheme();
}
$('toggleMap').onclick=e=>{
  if(!ready)return;
  const on=e.currentTarget.getAttribute('aria-pressed')!=='true';
  e.currentTarget.setAttribute('aria-pressed',String(on));
  if(on&&!map.getSource('ofm'))addBasemap();
  for(const id of BASEMAP_LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none');
  updateSun();applyTheme();   // city-life: the city layers follow the map toggle
};
// 롤러코스터: on, the lines are lifted onto their own paths (coasterPath; the route lines on the ground follow them, faintly) and the view
// tilts to show it; the speed buttons run its clock ×1/×5/×20 (1배 = back to the live positions)
function setCoaster(on,speed=coasterSpeed){
  if(!on)stopRide(false);   // 롤코를 끄면 1인칭에서도 내려요
  if(on&&(!coasterGeo.bld||!kitReady)){coasterWant=true;$('toggleCoaster').setAttribute('aria-pressed','true');Promise.all([loadCoasterBuildings(),loadModeKit()]).then(()=>{if(coasterWant)setCoaster(true,speed)});return}   // (모드 코드도: 첫 화면에서는 받지 않았다)   // its courses need the buildings: wait for them
  coasterWant=on;if(on&&simcity){simcity=false;joseon=false;$('toggleSimcity')?.setAttribute('aria-pressed','false');$('toggleJoseon')?.setAttribute('aria-pressed','false')}
  if(on)cityMap();
  const was=coaster;coaster=on;coasterSpeed=on?speed:1;if(coasterSpeed===1){warp=0;warpAt=0}else warpNow();
  $('toggleCoaster').setAttribute('aria-pressed',String(on));$('coasterSpeed').hidden=!on;
  for(const b of document.querySelectorAll('[data-speed]'))b.setAttribute('aria-pressed',String(+b.dataset.speed===coasterSpeed));
  $('speedNote').textContent=coasterSpeed>1?'실제보다 앞서 달려요':'실시간';
  if(was!==on){stopMerc.clear();cityViaduct.setGaps(on?coasterGaps:null);setRouteOpacity();map.getSource('routes')?.setData({type:'FeatureCollection',features:buildLineFeatures()});planner.rebuild();lastPose.clear();
    if(map.getSource('stations')){map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels()}
    if(displayedRoute)showRoute(displayedRoute.plan,displayedRoute.busSelection,false);
    if(on&&map.getPitch()<40)map.easeTo({pitch:60,zoom:Math.max(map.getZoom(),14.5),duration:900});
    applyTheme();updateSun();wallsNow()}   // the park colours, and the towers out of the shadows and walls
  map.triggerRepaint();
}
function cityMap(){if(ready&&$('toggleMap').getAttribute('aria-pressed')!=='true')$('toggleMap').click()}   // the city modes are drawn on the background map: switch it on with them
// 조선 모드 is 심시티 in another pack (asJoseon): switching between the two changes only the look
function setSimcity(on,asJoseon=false){const J=!!(on&&asJoseon),ask=++modeAsk;$('toggleSimcity')?.setAttribute('aria-pressed',String(on&&!J));$('toggleJoseon')?.setAttribute('aria-pressed',String(J));
  if(on&&!kitReady){loadModeKit().then(()=>{if(ask===modeAsk)setSimcity(on,asJoseon)},()=>{if(ask===modeAsk){$('toggleSimcity')?.setAttribute('aria-pressed','false');$('toggleJoseon')?.setAttribute('aria-pressed','false')}});return}   // 모드 코드가 오면 켠다(그사이 다른 걸 누르면 그쪽)
  if(on&&(coaster||coasterWant))setCoaster(false);if(on)cityMap();
  if(joseon!==J){joseon=J;if(simcity===on){applyTheme();updateSun();map.triggerRepaint();return}}
  if(simcity===on)return;simcity=on;setRouteOpacity();planner.rebuild();lastPose.clear();map.getSource('routes')?.setData({type:'FeatureCollection',features:buildLineFeatures()});if(map.getSource('stations')){map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels()}applyTheme();updateSun();wallsNow();map.triggerRepaint()}   // 심시티에서는 노선 선의 투명도와 고가 표시를 바꾸고 같은 도로 맞춤 경로를 유지해요.
if($('toggleSimcity'))$('toggleSimcity').onclick=()=>setSimcity(!(simcity&&!joseon));
if($('toggleJoseon'))$('toggleJoseon').onclick=()=>setSimcity(!joseon,true);
const setJoseon=on=>setSimcity(on,true);
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
feed.start();
window.__subwayWebGL={map,get cityBuildings(){return cityBuildings},loadModeKit,cityViaduct,setSimcity,setJoseon,setCoaster,get simcity(){return simcity},get joseon(){return joseon},get coaster(){return coaster},refreshLive,updateSun,applyTheme,sunPosition,trackPoint,edgeCoords,coasterRises,coasterProfile,inversion,loopD,get paths(){return paths},get byId(){return byId},get plans(){return planner.plans},get renderer(){return map.getCanvas().getContext('webgl2')?'webgl2':'none'},showTrainPopup,startRide,stopRide,get ride(){return ride},get c88(){return CoasterTrain.last},get ships(){return TurtleShips.last},rideFrame,set rideSeat(v){rideSeat=v}};
