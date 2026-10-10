import * as maplibregl from './vendor/maplibre-gl.mjs';
import {key,normStatus,createRouter,NEW_NAMES} from './lib/routing.mjs';
import {seoulSun,sunPosition as sunAt} from './lib/sun.mjs';
import {initJourney} from './lib/journey-ui.mjs';
import {createCoasterTrack} from './modes/coaster/track.mjs';   // 롤코 선로 층
import {createCoasterGeometry} from './modes/coaster/geometry.mjs';   // 롤코 길 · 언덕 계산
import {createCoasterMotion} from './modes/coaster/motion.mjs';   // 롤코 주행 속도 · 탄 거리
import {createCoasterRide} from './modes/coaster/ride.mjs';   // 롤코 1인칭 타기
import {createStationSearch} from './ui/search.mjs';   // 역 검색
import {createBottomSheet} from './ui/sheet.mjs';   // 아래 시트 · 따라가기
import {createPopups} from './ui/popups.mjs';   // 열차 · 역 정보창
import {createJourneyMap} from './ui/journey.mjs';   // 여정 지도 표시
import {createTrainOverlay} from './map/overlay.mjs';   // 열차 캔버스 · 역 이름표 캔버스 그리기 차례
import {registerTransitLayers,registerLocationLayers,registerExitLayers,addBasemap as addBasemapLayers,BASEMAP_LAYERS} from './map/layers.mjs';   // 정적 층 등록 · 바탕 지도
import {createMapTheme} from './map/theme.mjs';   // 테마 · 지도 색 · 해 위치 아이콘
import {createModeRegistry} from './modes/index.mjs';   // 모드 목록 · 설정 상속(기본 → 모드 → 내 설정)
import {createModeController} from './modes/transition.mjs';   // 모드 전환: 지금 · 원하는 모드, 마지막 요청, 롤코 배속
import './modes/merge.mjs';   // (모드 목록이 부르는 합치기: 같은 단계에서 요청)
import BASIC_MODE from './modes/basic/index.mjs';   // 기본 모드: 모든 설정의 원본
import './modes/basic/palette.mjs';   // (기본 모드의 지도 색 자료: 같은 단계에서 요청)
import CITY_STYLE from './modes/basic/city.mjs';   // city-life: the one style pack (colours, metres, zooms) the city reads — 기본 모드의 도시 팩 원본
import './lib/city_style_seoul.mjs';   // (도시 팩 호환 이름: 공용 도시 · 버스 코드가 부른다 — 같은 단계에서 요청)
import SIMCITY_MODE from './modes/simcity/index.mjs';
import JOSEON_MODE from './modes/joseon/index.mjs';
import './modes/joseon/style.mjs';   // (조선 모드의 도시 팩 덧쓰기: 같은 단계에서 요청)
import COASTER_MODE from './modes/coaster/index.mjs';
import {SunShadowLayer,hull} from './map/sun.mjs';   // 해 그림자 층
import {createStationLabels} from './map/labels.mjs';   // 역 이름표 자료
import {StationNameLayer,ExitPillars} from './map/platform.mjs';   // 승강장 막대 · 출구 통로 · 출구 기둥
import {createTrainPlanner} from './trains/plan.mjs';   // 열차 예측
import {createLiveFeed} from './trains/live_feed.mjs';   // 실시간 열차 받기 · 기록
import {trainLayerClass,buildingDepthClass} from './trains/draw.mjs';   // 열차 그리기 · 건물 깊이
import {createBusLayer} from './lib/bus_layer.mjs';   // bus: optional Seoul routes, stops and live vehicles
import {journeyCasingPaint,journeyRidePaint,journeyStopPaint} from './lib/journey_map_style.mjs';   // bus: one journey presentation for route numbers and search results
import './lib/coaster_style_seoul.mjs';   // (공원 자료 호환 이름: 롤코 · 공원 코드가 부른다 — 같은 단계에서 요청)
import './modes/basic/park.mjs';   // coaster: shared park palette and metre/pixel dimensions — 기본 모드의 공원 자료(같은 단계에서 요청)
import './modes/coaster/metrics.mjs';   // (공원 치수 계산: 같은 단계에서 요청)
import {buildCoasterTrackMesh,coasterTrackVertexShader,COASTER_TRACK_FS} from './lib/coaster_track_mesh.mjs';   // 롤코 선로 메시 · 셰이더(선로 층에 넘김)
import {NightLayer} from './lib/park_night.mjs';
import {RIDE_ZOOM,rideFov,RIDE_NEAR_M,COCKPIT_NEAR_M,nearMatrix,RIDE_FAR_M,seatRows,seatIndex,seatNumber,seatEye,rideCamera,seatPickerHTML,seatLabel} from './lib/coaster_first_person.mjs';   // 롤코 1인칭: 자리 고르기 · 그 자리 눈의 카메라
import {addCityLayers,applyCityStyle,applyGroundTexture,cityPalette} from './lib/city_style.mjs';   // city-life: the miniature city's ground (zone floors, roads, lane marks)
import {CityLife} from './lib/city_life.mjs';
import {platformStroke} from './lib/platform_stroke.mjs';
import {drawStationSigns,signRows,signTextSize,perspectiveRatio,placeholderText,sortLines,signCollisionLayout,signAnchor} from './lib/station_signs.mjs';   // 역 이름표: 열차 · 고가 위에 떠 있는 팻말
import {catchup,catchupAt} from './lib/train_catchup.mjs';   // 앞선 예측을 따라잡을 때 더하는 속도에 상한
import {offsetCoords,trackStart,extendStart,closestPlatformPoint} from './lib/platform_route.mjs';
import {CityViaduct} from './lib/city_viaduct.mjs';
import {stops as snapStops} from './lib/city_viaduct_snap.mjs';   // 기본·심시티: 도로 위로 옮긴 지하 역 점(곧은 승강장이면 방향도)   // city-life: 심시티 — the viaduct every line rides in that mode (deck, piers, roofed platforms; the trains are lifted onto it below)

// 모드 설정: 기본이 원본, 모드는 다른 것만. 시작할 때 한 번 검사 · 합치고 얼려 둔다(잘못된 정의는 여기서 멈춘다)
const modes=createModeRegistry([BASIC_MODE,SIMCITY_MODE,JOSEON_MODE,COASTER_MODE]);
const JOSEON_STYLE=modes.settings('joseon').city.pack;   // 조선 모드: the same city in packed earth and 기와집 (cityPack()) — 기본 팩 + 조선 덧쓰기, 한 번 합쳐 얼린 것
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
  const features=[],drawn=new Set(),kind=modeCtl.settings().track.kind;
  Object.entries(paths).forEach(([line,chunks])=>chunks.forEach(ids=>ids.slice(1).forEach((b,i)=>{
    const lo=Math.min(ids[i],b),hi=Math.max(ids[i],b),id=`${line}:${lo}:${hi}`;
    if(drawn.has(id)||!byId.has(lo)||!byId.has(hi))return;drawn.add(id);
    const coords=kind==='coaster'?coasterPath(line,lo,hi).pts.map(q=>new maplibregl.MercatorCoordinate(q.x,q.y).toLngLat().toArray()):kind==='viaduct'?cityCoords(line,lo,hi):basicTrack(line,lo,hi).coords;   // 롤코는 고유 경로, 기본·심시티는 도로 맞춤 경로를 우선해요.
    features.push({type:'Feature',properties:{line,color:colors[line],offset:kind==='ground'?0:edgeOffset(line,lo,hi)},geometry:{type:'LineString',coordinates:coords}});
  })));
  return features;
}
const edgeGeom=new Map();
// 역 사이 열차 경로는 도로 맞춤 경로를 우선하고, 롤코는 coasterPath를 유지해요.
function geom(line,a,b){return modeCtl.settings().track.kind==='coaster'?coasterPath(line,a,b):cityGeom(line,a,b)}
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
  const g=modeCtl.settings().track.kind==='ground'?basicDrawGeom(line,from.id,to.id):geom(line,from.id,to.id),rev=from.id>to.id,d=(rev?1-k:k)*g.total;
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
  const ribbon=modeCtl.settings().track.platform==='ribbon';   // 기본: 노선을 따라 휘는 띠, 심시티 · 롤코: 곧은 상자
  return stations.flatMap(s=>s.lines.map(x=>{
    const line=x.name,{prev,next}=neighbours(line,s);
    const back=prev?trackFrom(line,s,prev,PLATFORM_HALF).reverse():[stopPos(line,s)],ahead=next?trackFrom(line,s,next,PLATFORM_HALF):[stopPos(line,s)];
    if(ribbon){
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
  predictStops:()=>modeCtl.settings().trains.predictStops,isRide:()=>rider.ride,getTrains:()=>feed.trains});
const {age,clock}=planner;
// Station exits (OSM subway_entrance, built by pipeline/build_entrances.py): {station id: [[lon,lat,ref,wheelchair]]}
let exits={};const exitCol=new Map();   // exit "lon,lat" → the colour of the line its passage joins
const EXIT_MINZOOM=16,EXIT_MAX_M=350;   // exits (and their passages) from this zoom; farther than this from every platform: no passage
const EXIT_PASSAGES=false;   // 2026-10-05: 승강장 → 출구 통로 선은 그리지 않는다(출구 번호를 이어지는 노선색으로 칠해 대신함)
const exitsReady=fetch('./exits.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{exits=d||{}}).catch(()=>{});
function exitFeatures(){return Object.entries(exits).flatMap(([id,list])=>list.map(([lon,lat,ref,wc])=>({type:'Feature',properties:{ref,wc:wc??-1,station:+id},geometry:{type:'Point',coordinates:[lon,lat]}})))}
const smooth=x=>x*x*(3-2*x);
// 롤러코스터 (settings): between stations the lines rise off the ground like a coaster track and the
// trains ride on it; its clock can run faster (×modeCtl.speed): the trains then run ahead of the feed
// (warp s), a show rather than where they are. Flat at each platform, a climb, then hills of ~380 m,
// each its own height (COASTER_LOW..COASTER_H) and spacing.
// 모드 상태(web/modes/transition.mjs): 지금 · 원하는 모드, 마지막 요청 번호, 롤코 배속 · 앞서 달린 시간의 주인. 본체는 modeOn.simcity · modeOn.joseon · modeOn.coaster 로 읽는다
// (심시티 모드: the miniature city — the coaster mode keeps its rides on the same city; 조선 모드: 심시티 (modeOn.simcity stays true: the viaduct,
// the trains on it, the x-ray) in the Joseon pack — 흙바닥, 기와집). 전환은 아래 '모드 전환'(prepareMode · commitMode).
const modeCtl=createModeController({registry:modes,clock:()=>clock(),prepare:id=>prepareMode(id),commit:(prev,next,o)=>commitMode(prev,next,o),onRequest:showModeButtons,onFail:showModeButtons});
const modeOn=modeCtl.flags;
const cityPack=()=>modeCtl.settings().city.pack;   // the pack the ground, the buildings and their shadows read — 지금 모드 설정의 도시 팩(심시티 · 롤코 · 기본은 같은 참조)
// city-build: the miniature city's buildings (web/lib/city_buildings.mjs): a custom layer under the station names (so names and
// labels stay readable over the city), and the same walls' depth for the train canvas; BuildingDepth and the map's own boxes
// stand down while a city mode is on. syncCity runs from applyTheme (mode, theme and the coaster's tower cut-off).
// 모드 코드: 심시티 · 조선 · 롤코에서만 쓰는 건물(city_buildings → city_mesh · city_hanok …) · 랜드마크 · 거북선 · 88열차 · 놀이기구는
// 첫 화면에서 받지 않는다 — 모드를 켤 때, 그리고 지도가 뜬 뒤 쉬는 틈에 받는다(2026-10-10 덕배: 첫 접속이 느리다, 첫 화면 JS 의 약 1/5).
// 모드는 이것이 다 온 뒤에야 켜진다(setSimcity · setCoaster 가 기다린다): 켜져 있으면 cityBuildings 등은 늘 있다
let CityBuildings,CityLandmarks,TurtleShips,CoasterTrain,RideTrack,SLEEPER_M,RideLayer,CoasterRidePlacement,sampleRideTracks,kitReady=false,kitLoad=null;
let cityBuildings=null,cityLandmarks=null;const cityOn=()=>modeCtl.settings().city.enabled;
// 모드 코드가 다시 정적으로 부르는 모듈: 함께 바로 요청한다(안 그러면 city_buildings 를 다 받고 읽은 뒤에야 city_mesh 를 요청 — 맥 측정 1.8 s 차례 대기)
const MODE_KIT_DEPS=['lib/city_mesh','city/parts','lib/city_geom','lib/city_mvt','lib/city_through_buildings','lib/city_landmarks_data','lib/coaster_badges','lib/coaster_ride_sites'];   // (web/ 기준 경로)
function loadModeKit(){
  if(!kitLoad)for(const n of MODE_KIT_DEPS)import(`./${n}.mjs`).catch(()=>{});   // 미리 받기만: 실패는 아래 본 import 가 알린다
  return kitLoad??=Promise.all([import('./lib/city_buildings.mjs'),import('./lib/city_landmarks.mjs'),import('./lib/city_turtle_ship.mjs'),import('./lib/coaster_train.mjs'),import('./lib/coaster_ride_track.mjs'),import('./lib/park_rides.mjs'),import('./lib/coaster_ride_placement.mjs'),import('./lib/city_hanok.mjs')])   // (city_hanok: 도시 부품 'hanok' 등록 — 건물을 짓기 전에)
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
  if(X.trains&&trainsEnabled){const bodyPx=trainBodyPx(zoom),lane=cityViaduct.train(zoom,bodyPx).lanePx;
    for(const plan of planner.plans){const pose=trainPose(plan),q=trackPoint(plan,pose.dist);if(!inV(q.x,q.y))continue;
      const half=Math.max(plan.cars*plan.carMetres*m,TRAIN_MIN_PX*unit)/2,a=trackPoint(plan,pose.dist-half),e=trackPoint(plan,pose.dist+half);
      out.push({id:'t'+plan.id,ax:a.x,ay:a.y,bx:e.x,by:e.y,z0:q.h-X.trainBelowM*m,z1:q.h+X.trainAboveM*m,w:X.trainHalfWidthM*m+(Math.abs(q.off||0)+lane+bodyPx)*unit,m})}}
  return out}
function syncCity(){if(!ready||!cityBuildings)return;if(cityOn()&&!map.getLayer('city-buildings'))map.addLayer(cityBuildings,map.getLayer('station-names')?'station-names':undefined);
  cityBuildings.set({on:cityOn(),tone:modeCtl.settings().city.tone,theme:effectiveTheme(),maxHeight:modeCtl.settings().map.towersAsRides?RIDE_H:1e9,pack:cityPack()});
}
const cityViaduct=new CityViaduct({pack:CITY_STYLE,net:{paths,colors,geom,offset:edgeOffset,bodyPx:z=>trainBodyPx(z),get byId(){return byId},get rects(){return stationRects},get exits(){return exits}}});   // city-life: 심시티 고가 — on the mode's track (geom: the real one, or a tunnel stretch moved onto its street), drawn in drawTrains; trackPoint lifts the trains onto it (heightAt: the stations' levels and the ramps between); exits: the stairs down to them
const coasterGeo=createCoasterGeometry({maplibregl,paths,byId,cityViaduct,edgeGeom,geom,cityGeom,withCum,metresBetween,smooth,onFresh:()=>{coasterMotion.clear();coasterTrack.stale=true}});   // 롤코 길 · 언덕 · 건물 높이(높이가 바뀌면 주행 시간 · 선로도 다시)
const {coasterPath,rolled,CORK_HEART,coasterProfile,coasterAt,coasterGaps,coasterRises,inversion,loopD,corkOf,loadCoasterBuildings}=coasterGeo;
const warpNow=()=>modeCtl.warpNow();   // 롤코 배속으로 앞서 달린 시간(s)
// Loops and corkscrews are landmarks, not the rule (on half the edges each they all looked alike): along each line, in
// order, an edge may take one (not both) once INV_GAP m have passed since the last — a loop by chance INV_LOOP, else a
// corkscrew by INV_CORK. Chosen once per edge, the first line through it deciding; 'loop', 'cork' or ''.
const coasterMotion=createCoasterMotion({geom,coasterAt,isCoaster:()=>modeCtl.settings().track.kind==='coaster'});const {ridePace,toRide,fromRide}=coasterMotion;   // 롤코 주행 속도 · 탄 거리
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
  const S=modeCtl.settings();let el=age(p.t.receivedAt)+p.lead+(S.trains.timeWarp?warpNow():0),ph=p.phases[p.phases.length-1];
  for(const x of p.phases){if(el<x.dur){ph=x;break}el-=x.dur}
  const u=ph.dur===Infinity?1:Math.min(1,el/ph.dur),e=ph.ease==='both'||ph.ease===true?smooth(u):ph.ease==='in'?u*u:ph.ease==='out'?1-(1-u)*(1-u):u,k=S.track.kind==='coaster'&&ph.from!==ph.to?ridePace(p.t.line,ph.from.id,ph.to.id,ph.k0,ph.k1,e):ph.k0+(ph.k1-ph.k0)*e;
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
  const {seq,cum}=p,line=p.t.line,kind=modeCtl.settings().track.kind;
  if(seq.length<2&&kind==='ground'){
    const s=seq[0],{prev,next}=platformNeighbours(line,s),n=next||prev;
    if(n){const q=next?along(line,s,n,0):along(line,n,s,1);return {...q,r:[-q.f[1],q.f[0]],off:0,h:0,roll:0}}
  }
  if(seq.length<2){const m=mercStop(line,seq[0]);return {x:m.x,y:m.y,f:[0,-1],r:[1,0],off:0,h:kind!=='ground'?cityViaduct.stationH(line,seq[0].id)*m.meterInMercatorCoordinateUnits():0}}   // city-life: 심시티 — on the viaduct, at this station's level
  const end=cum[cum.length-1],d=Math.max(0,Math.min(end,dist)),over=dist-d; // beyond either end: extend straight
  let i=0;while(i<seq.length-2&&cum[i+1]<d)i++;
  const a=seq[i],b=seq[i+1],len=(cum[i+1]-cum[i])||1;let k=(d-cum[i])/len,h=0,lat=0,roll=0;const fw=a.id<b.id?1:-1;
  if(kind==='coaster'){const lo=Math.min(a.id,b.id),hi=Math.max(a.id,b.id),g=geom(line,lo,hi),[sg,hh,la,ro]=coasterAt(line,lo,hi,(fw>0?k:1-k)*g.total),q=g.total?sg/g.total:0;h=hh;lat=la*fw;roll=ro*fw;k=fw>0?q:1-q}   // on the coaster: its ground point, height, and the corkscrew's swing and roll (the way it runs)
  const pt=along(line,a,b,k),f=pt.f,r=[-f[1],f[0]],x=pt.x+f[0]*over+r[0]*lat,y=pt.y+f[1]*over+r[1]*lat;
  // Shared-track slot changes at stations; ease it over ~60 m either side instead of jumping.
  const o=j=>edgeOffset(line,seq[j].id,seq[j+1].id)*(seq[j].id<seq[j+1].id?1:-1),B=60*(p.m??=mercStop(line,seq[0]).meterInMercatorCoordinateUnits());
  let off=o(i);
  if(i>0&&d-cum[i]<B)off+=(o(i-1)-off)*.5*(1-(d-cum[i])/B);
  else if(i<seq.length-2&&cum[i+1]-d<B)off+=(o(i+1)-off)*.5*(1-(cum[i+1]-d)/B);
  if(kind==='ground')off=0;   // 기본 화면 경로에 기존 공유 선로 간격이 들어 있어요.
  if(kind==='viaduct')h=cityViaduct.heightAt(line,a.id,b.id,k)*p.m;   // city-life: 심시티 — the trains run on the viaduct's deck: its rail height here (the station's level, or the ramp between two), in mercator units
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
// 지금 모드의 열차 굵기(trains.body: wide · slim) — 그리기 · 클릭 · 고가 상판 · x-ray 가 같은 값을 쓴다
const trainBodyPx=z=>modeCtl.settings().trains.body==='slim'?coasterBodyPx(z):bodyWidthPx(z);
// 1인칭으로 탈 수 있는지: 공원이 켜져 있고 롤코 길 위(자리 고르기 버튼 · 타기 · 내린 뒤 정보창이 같은 조건)
const canRide=()=>{const S=modeCtl.settings();return S.park.enabled&&S.track.kind==='coaster'};
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
const hexRGB=v=>[parseInt(v.slice(1,3),16)/255,parseInt(v.slice(3,5),16)/255,parseInt(v.slice(5,7),16)/255];

// ---- bottom sheet: station and train details slide up from the bottom of the map -------------
const sheetUI=createBottomSheet({map,maplibregl,planner,trackPoint,trainPose,laneOffsetPx,animFrame,FOLLOW_FPS,fitRoute:bottom=>fitRoute(bottom),
  live:{get journey(){return journey},get routeBounds(){return journeyMap.routeBounds},get busLayer(){return busLayer},get rider(){return rider},get stopRide(){return stopRide}}});   // 아래 시트 · 따라가기
const {sheet,sheetBody,followBtn,openSheet,closeSheet,sheetPad,trainLngLat,follow,followBusStart,followSoon}=sheetUI;
const journeyMap=createJourneyMap({map,maplibregl,colors,byId,cityCoords,stopPos,cityViaduct,sheetPad,journeyCasingPaint,journeyRidePaint,journeyStopPaint,
  live:{get busLayer(){return busLayer},get settings(){return modeCtl.settings()},get stationAlpha(){return stationAlpha},set stationAlpha(v){stationAlpha=v}}});   // 여정 지도 표시
const {rideCoords,showRoute,fitRoute,clearRoute,setSubwayOff,setRouteOpacity,focusRoute}=journeyMap;
const journey=initJourney({openSheet,closeSheet:()=>closeSheet(),map,colors,myLocation:()=>myLocation,button:document.getElementById('routeButton'),showRoute,clearRoute});
// ---- 롤코 1인칭: 고른 자리에 앉아 열차를 타요 ----------------------------------------------------
// 열차 정보창의 배치도에서 칸 · 줄 · 좌우를 고르고 타면, 카메라가 그 자리 눈(coaster_first_person.mjs)에서 진행 방향을 보고
// 오르내림 · 루프 · 코르크스크루를 칸과 함께 돌아요. 카메라와 내 열차는 같은 순간의 자리(ride.snap)로 그려 서로 밀리지 않아요.
// 지도를 끌거나 확대하면 · '내리기' · Esc · 롤코 끄기로 내려서 타기 전 카메라로 돌아가요.
const rider=createCoasterRide({map,maplibregl,planner,colors,cityViaduct,sheetBody,closeSheet,showTrainPopup:plan=>showTrainPopup(plan),applyTheme,effectiveTheme,coasterBodyPx,TRAIN_MIN_PX,mercStop,trainPose,trackPoint,blendShift,toRide,fromRide,coasterCarFrame,coasterRailFrames,riderState:plan=>riderState(plan),trainLngLat,
  stopFollowing:()=>{sheetUI.easing=false;sheetUI.following=null},isCoaster:canRide,getSheetTrain:()=>sheetUI.sheetTrain,getSleeperM:()=>SLEEPER_M});
const {riding,rideRows,startRide,stopRide,rideFrame,rideBar}=rider;
animFrame.push(rideFrame);
// #fps: 실제 기기에서 지도 프레임 — 초당 프레임, 늦은 프레임(20 · 34 ms 넘게) 수, 가장 긴 간격, 지도 한 프레임 · 1인칭 카메라 JS 시간(ms). 서버 캡처로는 잴 수 없어서(2026-10-06 덕배)
if(location.hash.includes('fps')){const o=document.createElement('pre');o.style.cssText='position:fixed;z-index:99;left:4px;bottom:4px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.78);color:#fff;border-radius:8px;pointer-events:none;white-space:pre';document.body.append(o);
  const iv=[],js=[],cam=[],r=map._render.bind(map);let last=0,shown=0;
  map._render=(...a)=>{const t=performance.now();if(last)iv.push(t-last);last=t;const x=r(...a);js.push(performance.now()-t);return x};
  animFrame[animFrame.indexOf(rideFrame)]=()=>{const t=performance.now();rideFrame();if(rider.ride)cam.push(performance.now()-t)};
  const ms=a=>a.length?Math.max(...a).toFixed(0):'-',avg=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):'-';
  setInterval(()=>{const now=performance.now(),s=now-shown;shown=now;
    o.textContent=`${rider.ride?'탑승 중':'지도'} ${(iv.length*1000/s).toFixed(0)} fps · 늦은 프레임 ${iv.filter(x=>x>20).length} / ${iv.filter(x=>x>34).length} · 가장 긴 간격 ${ms(iv)} ms\n지도 JS 평균 ${avg(js)} · 최장 ${ms(js)} ms · 카메라 ${avg(cam)} / ${ms(cam)} ms · ${devicePixelRatio}x ${innerWidth}×${innerHeight}`;
    iv.length=js.length=cam.length=0},1000)}
map.on('movestart',e=>{if(rider.ride&&e.originalEvent)stopRide(false)});   // 끌기 · 확대 · 돌리기: 사람이 카메라를 잡으면 내려요

const popups=createPopups({map,maplibregl,planner,colors,esc,age,destLabel,trainPose,trackPoint,mercStop,TRAIN_MIN_PX,trainBodyPx,canRide,laneOffsetPx,cityViaduct,seatPickerHTML,seatLabel,rideRows,rider,openSheet,follow,sheetUI,sheetBody,followBtn,
  live:{get settings(){return modeCtl.settings()},get trainsEnabled(){return trainsEnabled},get subwayOff(){return journeyMap.subwayOff},get exits(){return exits},get feed(){return feed}}});   // 열차 · 역 정보창, 열차 고르기, 실시간 알림
const {trainState,riderState,trainSheetHTML,rawFeedHTML,showTrainPopup,pickTrain,liveNotice,updateLiveNotice,arrivalText,arrivalRank,exitList,showStationPopup}=popups;

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
// 열차 그리기 · 건물 깊이(web/trains/draw.mjs): 바뀌는 값은 그때그때 읽게 getter 로 넘긴다
const trainLive={get kitReady(){return kitReady},get RideTrack(){return RideTrack},get CoasterTrain(){return CoasterTrain},get TurtleShips(){return TurtleShips},get myLocation(){return myLocation},get trainsEnabled(){return trainsEnabled},get subwayOff(){return journeyMap.subwayOff},get settings(){return modeCtl.settings()},get sheetTrain(){return sheetUI.sheetTrain},get sunTrainShadow(){return sunTrainShadow},get following(){return sheetUI.following},get easing(){return sheetUI.easing},get rider(){return rider},get riding(){return riding}};
const TrainLayer=trainLayerClass({map,JOSEON_STYLE,planner,coasterBodyPx,bodyWidthPx,TRAIN_MIN_PX,cityViaduct,laneOffsetPx,maplibregl,trainPose,trackPoint,mercStop,blendShift,lastPose,toRide,hexRGB,colors,fromRide,coasterCarFrame,smooth,sunPosition,followSoon,trainFrameSoon,TRAIN_FPS,live:trainLive});
const BuildingDepth=buildingDepthClass({cityOn,map,PHONE,maplibregl,live:trainLive});
const exitPillars=new ExitPillars({map,maplibregl,stations,exitCol,colors,hexRGB3,EXIT_MINZOOM,document,getExits:()=>exits,getSelected:()=>selected});
// 롤코 선로(modes/coaster/track.mjs)
const coasterTrack=createCoasterTrack({buildCoasterTrackMesh,coasterTrackVertexShader,COASTER_TRACK_FS,map,maplibregl,HOME,paths,byId,colors,geom,coasterProfile,coasterAt,coasterRises,loopD,corkOf,rolled,CORK_HEART,edgeOffset,hexRGB,coasterBodyPx,cityViaduct,PHONE,trainFrameSoon,isCoaster:()=>modeCtl.settings().track.kind==='coaster',getSelected:()=>selected});
let stationAlpha=1;   // station platforms and names: faded behind a 길찾기 route (focusRoute)
const stationNames=new StationNameLayer({map,maplibregl,stationRects,exitCol,cityViaduct,colors,hexRGB3,stationWidthPx,platformPx,PLATFORM_SCALE,closestPlatformPoint,platformStroke,EXIT_MINZOOM,EXIT_MAX_M,EXIT_PASSAGES,document,matchMedia:q=>matchMedia(q),
  getLabels:()=>stationLabels.list,getSelected:()=>selected,getExits:()=>exits,getStationAlpha:()=>stationAlpha,getTrack:()=>modeCtl.settings().track});   // city-life: 심시티 — the bars take the buildings' depth there too (see its render)
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
const feed=createLiveFeed({map,stations,liveState,getSelected:()=>selected,getSheetTrain:()=>sheetUI.sheetTrain,hasPlans:()=>planner.plans.length>0,age,updateLiveNotice,
  onTrains:trains=>{learnDirections(trains);planner.replacePlans(trains.map(planner.planTrain).filter(Boolean));lastPose.clear();return planner.plans.length},
  onClear:()=>{planner.clear();lastPose.clear();map.triggerRepaint()}});
function refreshLive(force=false){return feed.refresh(force)}

map.on('load',()=>{
  registerTransitLayers({map,shapesReady,buildLineFeatures,buildStationFeatures,basicRouteCache,rebuildLabels,stationNames,STATION_WIDTH_STOPS,PHONE,signCollisionLayout,live:{get track(){return modeCtl.settings().track}}});   // 노선 · 승강장 · 역 이름표 자리(web/map/layers.mjs)
  // trains: their own canvas over the map (see TRAIN_FPS) — web/map/overlay.mjs
  createTrainOverlay({map,maplibregl,signTextSize,rider,perspectiveRatio,signRows,drawStationSigns,effectiveTheme,REDUCED,TRAIN_FPS,TrainLayer,BuildingDepth,cityOn,cityXrayTargets,mapPalette,coasterGeo,RIDE_H,coasterTrack,geom,edgeOffset,coasterBodyPx,trainBodyPx,cityViaduct,CORK_HEART,PHONE,trainFrameSoon,CityLife,CITY_STYLE,cityPack,$,sunPosition,NightLayer,journeyMap,exitPillars,RIDE_ZOOM,nearMatrix,COCKPIT_NEAR_M,
    live:{get CoasterRidePlacement(){return CoasterRidePlacement},get RideLayer(){return RideLayer},get busLayer(){return busLayer},get cityBuildings(){return cityBuildings},get cityLandmarks(){return cityLandmarks},get settings(){return modeCtl.settings()},get joseon(){return modeOn.joseon},get kitReady(){return kitReady},get sampleRideTracks(){return sampleRideTracks},get selected(){return selected},get stationAlpha(){return stationAlpha},get drawTrains(){return drawTrains},set drawTrains(v){drawTrains=v},get wallsNow(){return wallsNow},set wallsNow(v){wallsNow=v}}});
  registerLocationLayers({map,geolocate,live:{get myLocation(){return myLocation},set myLocation(v){myLocation=v}}});   // 내 위치 점
  map.on('click',e=>{if(rider.ride)return;if(map.queryRenderedFeatures(e.point,{layers:['stations','stations-casing']}).length)return;const pl=pickTrain(e.point);if(pl)showTrainPopup(pl);else if(busLayer?.selectAt(e.point)){if(busLayer.selection?.kind==='bus')followBusStart(busLayer.selection.id)}else closeSheet()});   // bus: 누른 버스는 따라간다   // bus: subway picking keeps priority
  map.on('click','stations',e=>{if(rider.ride)return;const pl=pickTrain(e.point);if(pl){showTrainPopup(pl);return}const p=e.features[0].properties;showStationPopup(byId.get(+p.id),e.lngLat)});
  map.on('mouseenter','stations',()=>map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','stations',()=>map.getCanvas().style.cursor='');
  ready=true;
  // 모드 코드는 첫 화면이 다 뜬 뒤 쉬는 틈에 미리 받아 둔다(모드를 누르면 바로 켜지게)
  map.once('idle',()=>{const go=()=>loadModeKit().catch(()=>{});'requestIdleCallback' in window?requestIdleCallback(go,{timeout:4000}):setTimeout(go,1500)});
  map.on('rotate',()=>{if(theme.themeChoice==='auto'){const b=$('themeIcon');if(b)b.innerHTML=sunArcIcon().svg}});
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'노선·역·시간표 KTDB 대중교통 GTFS · 실시간 서울 열린데이터광장 · 선로 © OpenStreetMap contributors'}),'bottom-left');
  // start collapsed to the ⓘ button (MapLibre opens it on first load); tap to read
  map.once('idle',()=>{const d=map.getContainer().querySelector('.maplibregl-ctrl-attrib');if(d){d.classList.remove('maplibregl-compact-show');d.removeAttribute('open')}});
  // recompute shadows when the view settles or building tiles arrive (debounced)
  let sunTimer=0;const sunSoon=()=>{clearTimeout(sunTimer);sunTimer=setTimeout(()=>{if(!map.isMoving())updateSun()},400)};   // not mid-pan (as the walls): moveend runs it
  map.on('moveend',sunSoon);map.on('sourcedata',e=>{if(e.sourceId==='ofm'&&e.isSourceLoaded&&e.tile)sunSoon()});
  addBasemap();
  // bus: below subway lines, using the existing detail sheet and settings controls.
  busLayer=createBusLayer({map,phone:PHONE,requestRender:()=>trainFrameSoon(0),getExitCoordinates:()=>Object.values(exits).flat(),onSelect:html=>{   // bus: redraw only the train canvas; reserve exit pillars
    sheetUI.following=null;sheetUI.followBus=null;sheetUI.sheetTrain=null;followBtn.hidden=true;const token=openSheet(html,'bus');
    return next=>{if(sheetUI.sheetToken!==token||sheetBody.innerHTML===next)return;const focused=sheetBody.contains(document.activeElement);sheetBody.innerHTML=next;if(focused)sheetBody.querySelector('h3')?.focus({preventScroll:true})};
  },onRouteSelect:leg=>{   // bus: reuse journey's fitting/focus; closing or deselecting clears only this route-number presentation
    setSubwayOff(!!leg);
    if(leg)showRoute({legs:[leg]},true,busLayer?.selection?.kind!=='bus');   // 버스를 눌렀으면 노선 전체로 멀어지지 않고 그 버스를 따라간다
    else if(journeyMap.busRouteFocus){journeyMap.displayedRoute=null;journeyMap.busRouteFocus=false;journeyMap.routeBounds=null;map.getSource('journey')?.setData({type:'FeatureCollection',features:[]});focusRoute(false)}
  },onClear:()=>{if(sheetBody.querySelector('.bus-detail'))closeSheet()}});
  window.__subwayWebGL.busLayer=busLayer;
  registerExitLayers({map,exitsReady,exitFeatures,EXIT_MINZOOM});   // 출구 번호판
  $('toggleMap').setAttribute('aria-pressed','true');   // background map on by default
  applyTheme();
  map.getContainer().append(liveNotice);map.getContainer().parentElement.append(sheet,rideBar);   // train number and destination live in the train popup, not on the map
  if(pendingLine)filterLine(pendingLine);else{rebuildLabels();refreshLive(true)}
});

const stationSearch=createStationSearch({map,stations,colors,esc,input:$('search'),list:$('searchList'),getSelected:()=>selected,showStationPopup});   // 역 검색
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

// ---- light / dark theme (web/map/theme.mjs) ---------------------------------------------------
const RIDE_H=modes.settings('coaster').park.towerM;   // m: 롤코에서 이 높이 이상 건물은 놀이기구(그림자 · 벽 · 건물에서 빠진다)
let wallsNow=()=>{};   // the train canvas's building walls, again (set up with it)
const theme=createMapTheme({map,$,ICONS,seoulSun,sunPosition,cityPalette,applyCityStyle,applyGroundTexture,syncCity,updateSun,focusRoute,journeyMap,rider,live:{get settings(){return modeCtl.settings()},get busLayer(){return busLayer},get ready(){return ready}}});
// 앞에서 만든 층 · 1인칭이 값으로 받아 간 이름이라 끌어올려지는 함수로 남긴다(부르는 건 테마를 만든 뒤)
function effectiveTheme(){return theme.effectiveTheme()}
function mapPalette(t){return t===undefined?theme.mapPalette():theme.mapPalette(t)}
function applyTheme(){return theme.applyTheme()}
function sunArcIcon(){return theme.sunArcIcon()}

// ---- sun light and shadows ----------------------------------------------------------------
// Real-time sun position over Seoul drives building face lighting (map light) and ground shadows:
// each building footprint is swept away from the sun by height ÷ tan(elevation) and the hull drawn
// on the ground under the lines. Trains cast their shadow the same way. No shadows after sunset.
let sunTrainShadow=[1.1,1.5];
const sunShadows=new SunShadowLayer();
function updateSun(){
  if(!ready)return;
  const {elevation:el,azimuth:az}=sunPosition(),up=el>1,dark=effectiveTheme()==='dark',S=modeCtl.settings();
  // face lighting: light comes from the sun (polar = 90° − elevation); a soft overhead light at night
  const K=S.sun.light==='park'&&S.map.park[dark?'dark':'light'];   // the park: a warm light, softer (no blue cast at night)
  try{map.setLight({anchor:'map',position:[1.4,up?az:0,up?Math.max(10,90-el):20],intensity:K?K.lightK:up?.55:.3,color:K?K.light:dark?'#9fb4c8':'#ffffff'})}catch{}
  // trains: shadow away from the sun, longer when it is low
  const sh=up?Math.min(7,1.6/Math.tan(el*Math.PI/180)):1.2,away=(az+180)*Math.PI/180;
  sunTrainShadow=up?[Math.sin(away)*sh,-Math.cos(away)*sh]:[.8,1.1];
  // buildings
  if(!up||map.getZoom()<14.5||!map.getLayer('bm-bld3d')||map.getLayoutProperty('bm-bld3d','visibility')==='none'){sunShadows.set(null,0);map.triggerRepaint();return}
  const k=1/Math.tan(el*Math.PI/180),ux=Math.sin(away),uy=Math.cos(away),seen=new Set(),tris=[];
  const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter());
  for(const f of map.querySourceFeatures('ofm',{sourceLayer:'building'})){
    const h0=+(f.properties.render_height??10),h=S.sun.lowHouseM!=null&&h0<S.city.pack.hanok.tall.towerMinH?S.sun.lowHouseM:h0,g=f.geometry;   // 조선: a low building is a low house; a tall one keeps its height (한옥 고층 · 목탑)if(!h||!g||coaster&&h>=RIDE_H)continue;
    const rings=g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):[];
    for(const ring of rings){
      if(!ring||ring.length<3)continue;
      const key=ring[0][0].toFixed(6)+ring[0][1].toFixed(6)+h;if(seen.has(key))continue;seen.add(key);
      // real low-sun shadows run ~10× the height; on a map that blankets whole blocks, so cap at 3.5× height / 250 m
      const len=Math.min(S.city.enabled?+(S.city.pack.lighting?.shadow?.maxLengthM??80):250,h*Math.min(k,3.5)),kx=Math.cos(ring[0][1]*Math.PI/180),dx=ux*len/(111320*kx),dy=uy*len/111320;
      const pts=[];for(const [x,y] of ring){pts.push([x,y]);pts.push([x+dx,y+dy])}
      const hp=hull(pts).map(q=>{const m=maplibregl.MercatorCoordinate.fromLngLat(q);return [m.x-O.x,m.y-O.y]});
      for(let i=1;i<hp.length-1;i++)tris.push(...hp[0],...hp[i],...hp[i+1]);   // convex hull → triangle fan
    }
  }
  // fade in over the first ~8° after sunrise (and out before sunset): very long low-sun shadows get cut off otherwise
  const fade=Math.max(0,Math.min(1,(el-2)/13));   // fade in over the first ~15° after sunrise, out before sunset
  // phones: small bright screens make the same shade read much darker, so lighten it there
  const phone=matchMedia('(max-width:720px),(pointer:coarse)').matches?.35:1;
  const cityA=cityOn()?+(cityPack().modes?.[S.city.tone]?.shadowOpacity?.[dark?'dark':'light']??.14):null;   // city-build: the city's shadow strength and colour from the style pack
  sunShadows.color=cityA!=null?hexRGB3(cityPack().lighting?.shadow?.color||'#394D4B'):null;
  sunShadows.set({data:new Float32Array(tris),ox:O.x,oy:O.y},cityA!=null?cityA*fade*phone:Math.min(S.map.paletteKind==='park-city'?mapPalette().shadow:.34,.14+el/150)*fade*(dark?.55:1)*phone);
  map.triggerRepaint();
}

applyTheme();

// Background map: OpenFreeMap vector tiles (OSM data, no key) drawn with only water, green space,
// streets and faint building footprints — no shops, stops or labels competing with the lines.
// 바탕 지도: OpenFreeMap 벡터 타일(web/map/layers.mjs) — 처음 켤 때 한 번 등록
function addBasemap(){addBasemapLayers({map,sunShadows,PHONE,CITY_STYLE,addCityLayers,applyTheme})}
$('toggleMap').onclick=e=>{
  if(!ready)return;
  const on=e.currentTarget.getAttribute('aria-pressed')!=='true';
  e.currentTarget.setAttribute('aria-pressed',String(on));
  if(on&&!map.getSource('ofm'))addBasemap();
  for(const id of BASEMAP_LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none');
  updateSun();applyTheme();   // city-life: the city layers follow the map toggle
};
// ---- 모드 전환 (상태의 주인: modeCtl — web/modes/transition.mjs) ----------------------------------------
// 준비: 모드 코드(심시티 · 조선 · 롤코 — 첫 화면에서는 받지 않았다), 롤코는 언덕을 정할 건물 높이도. 이미 있으면 true(바로 바꾼다)
function prepareMode(id){
  if(id==='basic')return true;
  if(id==='coaster')return coasterGeo.bld&&kitReady?true:Promise.all([loadCoasterBuildings(),loadModeKit()]);   // its courses need the buildings: wait for them
  return kitReady?true:loadModeKit();
}
// 버튼: 원하는 모드(받는 중이면 그 모드)를 눌린 것으로, 준비가 실패하면 지금 모드로
function showModeButtons(want){$('toggleSimcity')?.setAttribute('aria-pressed',String(want==='simcity'));$('toggleJoseon')?.setAttribute('aria-pressed',String(want==='joseon'));$('toggleCoaster').setAttribute('aria-pressed',String(want==='coaster'))}
// 바꾸기: 옛 setCoaster · setSimcity 가 하던 차례 그대로(롤코 → 심시티는 롤코를 끈 뒤 심시티를 켠다)
function commitMode(prev,next,{speed}={}){
  if(next==='coaster'){applyCoaster(true,speed??(prev==='coaster'?modeCtl.speed:1));return}   // (심시티 · 조선에서 오면 applyCoaster 가 먼저 끈다)
  if(prev==='coaster')applyCoaster(false);
  if(next==='basic'){if(prev==='simcity'||prev==='joseon')applySimcity(false,false);return}
  applySimcity(true,next==='joseon');
}
// 롤러코스터: on, the lines are lifted onto their own paths (coasterPath; the route lines on the ground follow them, faintly) and the view
// tilts to show it; the speed buttons run its clock ×1/×5/×20 (1배 = back to the live positions)
function applyCoaster(on,speed){
  if(!on)stopRide(false);   // 롤코를 끄면 1인칭에서도 내려요(옛 상태를 읽을 수 있는 동안)
  if(on&&modeOn.simcity){modeCtl.enter('basic');$('toggleSimcity')?.setAttribute('aria-pressed','false');$('toggleJoseon')?.setAttribute('aria-pressed','false')}
  if(on)cityMap();
  const was=modeOn.coaster;modeCtl.enter(on?'coaster':'basic');modeCtl.setSpeed(on?speed:1);
  $('toggleCoaster').setAttribute('aria-pressed',String(on));$('coasterSpeed').hidden=!on;
  for(const b of document.querySelectorAll('[data-speed]'))b.setAttribute('aria-pressed',String(+b.dataset.speed===modeCtl.speed));
  $('speedNote').textContent=modeCtl.speed>1?'실제보다 앞서 달려요':'실시간';
  if(was!==on){stopMerc.clear();cityViaduct.setGaps(on?coasterGaps:null);setRouteOpacity();map.getSource('routes')?.setData({type:'FeatureCollection',features:buildLineFeatures()});planner.rebuild();lastPose.clear();
    if(map.getSource('stations')){map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels()}
    if(journeyMap.displayedRoute)showRoute(journeyMap.displayedRoute.plan,journeyMap.displayedRoute.busSelection,false);
    if(on&&map.getPitch()<40)map.easeTo({pitch:60,zoom:Math.max(map.getZoom(),14.5),duration:900});
    applyTheme();updateSun();wallsNow()}   // the park colours, and the towers out of the shadows and walls
  map.triggerRepaint();
}
// 조선 모드 is 심시티 in another pack (J): switching between the two changes only the look — 선로 설정(track)이 같으면(같은 참조) 경로 · 승강장은 그대로,
// 예측 정차 수(trains.predictStops)만 다르면 예측만 다시
function applySimcity(on,J){
  if(on)cityMap();
  const was=modeCtl.settings(),next=on?(J?'joseon':'simcity'):'basic',same=modeCtl.current===next;modeCtl.enter(next);const now=modeCtl.settings();
  if(now.track===was.track){if(now.trains.predictStops!==was.trains.predictStops){planner.rebuild();lastPose.clear()}if(!same){applyTheme();updateSun();map.triggerRepaint()}return}
  setRouteOpacity();planner.rebuild();lastPose.clear();map.getSource('routes')?.setData({type:'FeatureCollection',features:buildLineFeatures()});if(map.getSource('stations')){map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels()}applyTheme();updateSun();wallsNow();map.triggerRepaint()}   // 심시티에서는 노선 선의 투명도와 고가 표시를 바꾸고 같은 도로 맞춤 경로를 유지해요.
// 요청(버튼 · 창구). 끄기: 그 가족이 켜져 있으면 기본으로(롤코를 끄면 1인칭에서도 내려요 — 바꾸기 안에서 한 번), 받는 중이기만 하면 그 요청만 거둔다(지금 모드 그대로),
// 다른 가족만 켜져 있거나 받는 중이면 그대로 둔다
function offFamily(ids){if(ids.includes(modeCtl.current))return modeCtl.request('basic');if(ids.includes(modeCtl.desired))modeCtl.cancel()}
function setCoaster(on,speed){return on?modeCtl.request('coaster',{speed}):offFamily(['coaster'])}
function setSimcity(on,asJoseon=false){return on?modeCtl.request(asJoseon?'joseon':'simcity'):offFamily(['simcity','joseon'])}
function cityMap(){if(ready&&$('toggleMap').getAttribute('aria-pressed')!=='true')$('toggleMap').click()}   // the city modes are drawn on the background map: switch it on with them
if($('toggleSimcity'))$('toggleSimcity').onclick=()=>setSimcity(modeCtl.desired!=='simcity');   // 받는 중에 다시 누르면 취소
if($('toggleJoseon'))$('toggleJoseon').onclick=()=>setSimcity(modeCtl.desired!=='joseon',true);
const setJoseon=on=>setSimcity(on,true);
$('toggleCoaster').onclick=()=>setCoaster(modeCtl.desired!=='coaster');
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
window.__subwayWebGL={map,modeSettings:(name)=>modes.settings(name),explainMode:(name)=>modes.explain(name),get cityBuildings(){return cityBuildings},loadModeKit,cityViaduct,setSimcity,setJoseon,setCoaster,get simcity(){return modeOn.simcity},get joseon(){return modeOn.joseon},get coaster(){return modeOn.coaster},refreshLive,updateSun,applyTheme,sunPosition,trackPoint,edgeCoords,coasterRises,coasterProfile,inversion,loopD,get paths(){return paths},get byId(){return byId},get plans(){return planner.plans},get renderer(){return map.getCanvas().getContext('webgl2')?'webgl2':'none'},showTrainPopup,startRide,stopRide,get ride(){return rider.ride},get c88(){return CoasterTrain.last},get ships(){return TurtleShips.last},rideFrame,set rideSeat(v){rider.seat=v}};
