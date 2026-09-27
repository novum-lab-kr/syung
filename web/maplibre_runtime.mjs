import * as maplibregl from './vendor/maplibre-gl.mjs';
import {key,normStatus,createRouter} from './lib/routing.mjs';
import {seoulSun,sunPosition as sunAt} from './lib/sun.mjs';

const json=id=>JSON.parse(document.getElementById(id).textContent);
const stations=json('stationData'),counts=json('lineCounts'),paths=json('linePaths');
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
    features.push({type:'Feature',properties:{line,color:colors[line],offset:edgeOffset(line,lo,hi)},geometry:{type:'LineString',coordinates:edgeCoords(line,lo,hi)}});
  })));
  return features;
}
const edgeGeom=new Map();
function geom(line,a,b){
  const lo=Math.min(a,b),hi=Math.max(a,b),id=`${line}:${lo}:${hi}`;
  let g=edgeGeom.get(id);if(g)return g;
  const pts=edgeCoords(line,lo,hi).map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)),cum=[0];
  for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
  g={pts,cum,total:cum[cum.length-1]};edgeGeom.set(id,g);return g;
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
const stationRects=new Map();
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
// Transfer stations: tie the per-line points together with a short connector (minimum spanning tree).
function buildTransferFeatures(){
  const out=[];
  for(const s of stations){
    if(s.lines.length<2)continue;
    const pts=[...new Map(s.lines.map(x=>[String(stopPos(x.name,s)),stopPos(x.name,s)])).values()];
    if(pts.length<2)continue;
    const d=(a,b)=>Math.hypot((a[0]-b[0])*Math.cos(a[1]*Math.PI/180),a[1]-b[1]),inTree=[0],segs=[];
    while(inTree.length<pts.length){let best=null;for(const i of inTree)pts.forEach((p,j)=>{if(!inTree.includes(j)&&(!best||d(pts[i],p)<best[0]))best=[d(pts[i],p),i,j]});inTree.push(best[2]);segs.push([pts[best[1]],pts[best[2]]])}
    out.push({type:'Feature',properties:{id:s.id},geometry:{type:'MultiLineString',coordinates:segs}});
  }
  return out;
}

const shapesReady=fetch('./track_shapes.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{d=d||{};shapes=d.edges||(d.stops?{}:d);stops=d.stops||{};stopDirs=d.stopDirs||{};stopHalf=d.stopHalf||{};platformHalf=d.platformHalf||{};stopWidth=d.stopWidth||{};smoothCache.clear();edgeGeom.clear();stopMerc.clear();if(Object.keys(shapes).length)document.querySelector('.provenance')?.insertAdjacentHTML('beforeend',' 선로 형태는 © OpenStreetMap contributors 자료를 사용했습니다.');plans=trains.map(planTrain).filter(Boolean)}).catch(()=>{});
// Phones (touch devices): render at most 2× device pixels and raise 3D buildings from zoom 15.
const PHONE=matchMedia('(max-width:720px),(pointer:coarse)').matches;
// Animation redraws (trains, my-location pulse) are capped: each one redraws the whole 3D map,
// and at the display's 60–120 Hz that kept phones hot. Panning and zooming still render at full rate.
// One timer for all of them; animFrame hooks update animated paint just before the redraw.
// Moving trains are redrawn about twice per screen pixel they move, between 12 fps (fewer read as
// stutter: 2–5 fps zoomed out was too few) and 24; the pulse and the selected-train ripple at 12;
// a followed train at FOLLOW_FPS, since then the whole map moves.
const ANIM_FPS=24,MIN_FPS=12,RIPPLE_FPS=12,FOLLOW_FPS=30,animFrame=[];let repaintTimer=0,repaintAt=0;
const trainFps=()=>{const mpp=40075016.686*Math.cos(map.getCenter().lat*Math.PI/180)/(512*2**map.getZoom());return Math.max(MIN_FPS,Math.min(ANIM_FPS,40/mpp))};
function repaintSoon(ms){const at=performance.now()+ms;if(repaintTimer&&repaintAt<=at)return;clearTimeout(repaintTimer);repaintAt=at;repaintTimer=setTimeout(()=>{repaintTimer=0;for(const f of animFrame)f();map.triggerRepaint()},ms)}
const map=new maplibregl.Map({container:'map',pixelRatio:Math.min(devicePixelRatio||1,PHONE?2:3),localIdeographFontFamily:'"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif',...HOME,pitch:35,bearing:0,maxZoom:18,minZoom:7,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf2f1'}}]},attributionControl:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
// My location (no station popup opens by itself; tap a station for its trains).
const geolocate=new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:false,maximumAge:10000},trackUserLocation:true,showAccuracyCircle:false,fitBoundsOptions:{maxZoom:16}});
map.addControl(geolocate,'bottom-right');
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
function age(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);return m?Math.max(0,(Date.now()-Date.UTC(+m[1],+m[2]-1,+m[3],+m[4]-9,+m[5],+m[6]))/1000):0}
// Run time between adjacent stations: the GTFS timetable's median (edge_times.json, built by
// build_edge_times.py); failing that, track length at the timetable's typical 12.4 m/s.
let edgeTimes={},lineDwell={};
// Per-line timing learned from the live feed (live-timing.json, built by build_live_timing.py):
// pace = observed ÷ timetable over several stations; zone = 도착→출발 (the feed marks a train
// entering and leaving the station section, not stopping and starting); approach = 진입→도착.
let liveTiming={lines:{},default:{pace:1,zone:62,approach:40}};
fetch('./live-timing.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(d=>{if(d&&d.lines){liveTiming=d;replacePlans(trains.map(planTrain).filter(Boolean))}}).catch(()=>{});
const timingFor=line=>({...liveTiming.default,...liveTiming.lines[line]});
fetch('./edge_times.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{edgeTimes=d.edges||{};lineDwell=d.dwell||{};plans=trains.map(planTrain).filter(Boolean)}).catch(()=>{});
function segmentSeconds(a,b,line){
  const sched=line&&edgeTimes[`${line}:${Math.min(a.id,b.id)}:${Math.max(a.id,b.id)}`];if(sched)return sched;
  const A=merc(a),B=merc(b),chord=Math.hypot(B.x-A.x,B.y-A.y),track=line?geom(line,a.id,b.id).total:chord,metres=Math.max(chord,track)/A.meterInMercatorCoordinateUnits();
  return Math.max(30,Math.min(180,metres/12.4));
}
// Dead reckoning: the API only reports the last event (진입/도착/출발/전역출발) and when it happened.
// Roll the train forward from that moment: approach → dwell → run → dwell … along its route,
// so a train that "arrived 90s ago" is drawn already heading to the next stop.
const EXPRESS_LINES=new Set(stations.flatMap(s=>s.express||[]));   // lines whose express stops the GTFS lists
// Station exits (OSM subway_entrance, built by pipeline/build_entrances.py): {station id: [[lon,lat,ref,wheelchair]]}
let exits={};
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
  let upto=r.ahead.length-1;for(let j=1,n=0;j<r.ahead.length;j++)if(stops(r.ahead[j])&&++n===PREDICT_STOPS){upto=j;break}
  const ahead=r.ahead.slice(0,Math.max(1,upto)+1);
  // Stop to stop takes pace × (timetable run + 30 s dwell). The train stands for the station section
  // time less 10 s (the start and stop inside the section are part of the run) and runs the rest.
  const tm=timingFor(t.line),DWELL=Math.max(15,tm.zone-10);
  const paced=(from,to)=>{const R=segmentSeconds(from,to,t.line);return Math.max(.5*R,tm.pace*(R+30)-tm.zone)+10};
  // ease: slow at a stop, full speed through a station the train passes
  const run=(from,to,k0=0,k1=1,dur=paced(from,to))=>{const a=k0===0&&stops(from),b=k1===1&&stops(to);
    phases.push({from,to,k0,k1,dur:dur*(a&&b?1:a||b?.9:.8),ease:a&&b?'both':a?'in':b?'out':'none'})};
  const dwell=(at,i)=>{const nx=ahead[i+1];phases.push(nx?{from:at,to:nx,k0:0,k1:0,dur:DWELL}:{from:previous&&i===0?previous:ahead[i-1]||at,to:at,k0:1,k1:1,dur:DWELL})};
  // 진입: start the approach three-quarters along, taking the line's 진입→도착 time to stop
  if(status==='진입'&&previous)run(previous,s,.75,1,tm.approach);
  if(status==='전역출발'&&previous)run(previous,s);
  if(status!=='출발'&&(stops(s)||status==='도착'))dwell(s,0);
  for(let i=0;i<ahead.length-1;i++){run(ahead[i],ahead[i+1]);if(i+1<ahead.length-1&&stops(ahead[i+1]))dwell(ahead[i+1],i+1)}
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
  // 출발 is sent as the train leaves the station section, ~5 s into its run
  return {t,id:`${t.line}:${t.trainNo}`,phases,seq,cum,cars,carMetres,lead:status==='출발'?5:0};
}
// Where the middle of the train is, as a distance (mercator units) along plan.seq.
function trainPose(p){
  let el=age(p.t.receivedAt)+p.lead,ph=p.phases[p.phases.length-1];
  for(const x of p.phases){if(el<x.dur){ph=x;break}el-=x.dur}
  const u=ph.dur===Infinity?1:Math.min(1,el/ph.dur),e=ph.ease==='both'||ph.ease===true?smooth(u):ph.ease==='in'?u*u:ph.ease==='out'?1-(1-u)*(1-u):u,k=ph.k0+(ph.k1-ph.k0)*e;
  const i=Math.max(0,p.seq.indexOf(ph.from)),len=(p.cum[i+1]??p.cum[i])-p.cum[i];
  const dist=p.cum[i]+len*(ph.from===ph.to?0:k),moving=ph.k0!==ph.k1;
  // After fresh data (see replacePlans): never back up — wait where the train was drawn until the
  // new prediction passes it; a forward correction is run along the track instead of jumped.
  if(p.hold!=null){if(dist<p.hold)return {dist:p.hold,moving:false};p.hold=null}
  if(p.glide){const w=(performance.now()-p.glide.at)/p.glide.ms;if(w<1)return {dist:p.glide.from+(dist-p.glide.from)*smooth(w),moving:true};p.glide=null}
  return {dist,moving};
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
    if(from>to){if((from-to)/m<HOLD_MAX_M)p.hold=from}
    else if((to-from)/m>1&&(to-from)/m<GLIDE_MAX_M)p.glide={from,at:performance.now(),ms:Math.max(1500,Math.min(8000,(to-from)/m*10))};
  }
  plans=next;
}
// Point on the track `dist` along plan.seq (clamped to its ends), with heading and lateral offset.
// Trains keep to the right of their travel direction (Korean right-hand running): looking along
// the 상행 direction, 상행 trains are right of the line and 하행 trains left of it.
function trackPoint(p,dist){
  const {seq,cum}=p,line=p.t.line;
  if(seq.length<2){const m=mercStop(line,seq[0]);return {x:m.x,y:m.y,f:[0,-1],r:[1,0],off:0}}
  const end=cum[cum.length-1],d=Math.max(0,Math.min(end,dist)),over=dist-d; // beyond either end: extend straight
  let i=0;while(i<seq.length-2&&cum[i+1]<d)i++;
  const a=seq[i],b=seq[i+1],len=(cum[i+1]-cum[i])||1,pt=along(line,a,b,(d-cum[i])/len),f=pt.f,r=[-f[1],f[0]],x=pt.x+f[0]*over,y=pt.y+f[1]*over;
  // Shared-track slot changes at stations; ease it over ~60 m either side instead of jumping.
  const o=j=>edgeOffset(line,seq[j].id,seq[j+1].id)*(seq[j].id<seq[j+1].id?1:-1),B=60*(p.m??=mercStop(line,seq[0]).meterInMercatorCoordinateUnits());
  let off=o(i);
  if(i>0&&d-cum[i]<B)off+=(o(i-1)-off)*.5*(1-(d-cum[i])/B);
  else if(i<seq.length-2&&cum[i+1]-d<B)off+=(o(i+1)-off)*.5*(1-(cum[i+1]-d)/B);
  return {x,y,f,r,off};
}
let plans=[];
const lastPose=new Map(),BLEND_MS=1200;

// Train body width and lane offset in screen px, shared by the train layer, roof numbers,
// destination tags and click picking.
const bodyWidthPx=z=>15+13*smooth(Math.max(0,Math.min(1,(z-13)/4))),TRAIN_MIN_PX=36;   // min on-screen length when zoomed out
const laneOffsetPx=z=>(1.5+2.5*Math.max(0,Math.min(1,(z-8)/7)))/2+3.5+bodyWidthPx(z)/2;
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
uniform float u_shadow,u_glow,u_time;out vec4 outColor;
float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float ink(float d){float a=max(.18,fwidth(d)*.65);return 1.-smoothstep(-a,a,d);}
float rect(vec2 p,vec2 c,vec2 b){return ink(box(p-c,b));}
float stroke(float d,float w){return ink(abs(d)-w);}
void main(){
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
}`;
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
    this.uni=Object.fromEntries(['u_matrix','u_offset','u_shadow','u_glow','u_time'].map(n=>[n,gl.getUniformLocation(this.p,n)]));
  }
  vertex(x,y,z,u,v,face){
    if(this.used+13>this.data.length){const larger=new Float32Array(this.data.length*2);larger.set(this.data);this.data=larger}
    const d=this.data,i=this.used,c=this.color;this.used+=13;
    d[i]=x-this.ox;d[i+1]=y-this.oy;d[i+2]=z;d[i+3]=u;d[i+4]=v;
    d[i+5]=this.length;d[i+6]=this.width;d[i+7]=this.kind;d[i+8]=this.carPx;
    d[i+9]=c[0];d[i+10]=c[1];d[i+11]=c[2];d[i+12]=face;
  }
  corner(x,y,z,u,v,face){
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
    if(!trainsEnabled||!plans.length)return;
    const zoom=map.getZoom(),unit=1/(512*2**zoom),bodyPx=bodyWidthPx(zoom),MIN_PX=TRAIN_MIN_PX,MARGIN=3;
    // Lane: clear of the route line (its drawn width) by a visible gap, then half a car body.
    const lanePx=laneOffsetPx(zoom);
    const view=map.getBounds(),lo=maplibregl.MercatorCoordinate.fromLngLat(view.getSouthWest()),hi=maplibregl.MercatorCoordinate.fromLngLat(view.getNorthEast()),pad=(hi.x-lo.x)*.1;
    // Keep world coordinates in double precision until subtracting the view-centre origin.
    const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),ox=O.x,oy=O.y;
    this.ox=ox;this.oy=oy;this.unit=unit;this.width=bodyPx;this.used=0;
    const bearing=map.getBearing()*Math.PI/180,camX=-Math.sin(bearing),camY=Math.cos(bearing),pitched=map.getPitch()>.1,H=bodyPx*.68;
    let animating=false,waiting=false,rippling=false;
    for(const plan of plans){
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
      const n=plan.cars,real=n*plan.carMetres*m,total=Math.max(real,MIN_PX*unit),car=total/n,tail=pose.dist-total/2;
      let color=this.rgb.get(plan.t.line);if(!color){color=hexRGB(colors[plan.t.line]);this.rgb.set(plan.t.line,color)}this.color=color;
      if(plan.id===sheetTrain){const o=(mid.off+lanePx)*unit;this.width=bodyPx;this.length=0;this.kind=0;this.carPx=0;this.ripple(mid.x+shiftX+mid.r[0]*o,mid.y+shiftY+mid.r[1]*o,bodyPx*3.4);this.width=bodyPx;rippling=true}
      const P=d=>{const q=trackPoint(plan,d);q.x+=shiftX;q.y+=shiftY;return q};
      const ratio=car/unit/bodyPx,separate=ratio>=1.5;
      const unfold=smooth(Math.max(0,Math.min(1,(ratio-1.5)/.9))),gap=1.4*unit*unfold;
      const start=P(tail),finish=P(tail+total);
      // At the LOD boundary, car chords coincide with the compact icon's chord.
      // Articulation and physical gaps then grow continuously, including on curves.
      const articulated=(d)=>{
        const q=P(d),t=(d-tail)/total;
        q.x=(start.x+(finish.x-start.x)*t)*(1-unfold)+q.x*unfold;
        q.y=(start.y+(finish.y-start.y)*t)*(1-unfold)+q.y*unfold;
        return q;
      };
      if(separate){
        // Painter order follows camera ground direction; no hidden back wall can bleed through.
        const forward=mid.f[0]*camX+mid.f[1]*camY>=0;
        for(let k=0;k<n;k++){
          const j=forward?k:n-1-k,A=articulated(tail+j*car+(j?gap/2:0)),B=articulated(tail+(j+1)*car-(j<n-1?gap/2:0));
          const dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy);if(len<unit*.1)continue;
          const tx=dx/len,ty=dy/len,L=len/unit,off=((A.off+B.off)/2+lanePx)*unit;
          this.cx=A.x-ty*off;this.cy=A.y+tx*off;this.tx=tx;this.ty=ty;this.length=L;this.carPx=0;
          const back=j===0,front=j===n-1,panto=/^(1호선|4호선|경의중앙선|수인분당선)$/.test(plan.t.line)&&j%3===1;
          this.kind=(front?1:0)+(back?2:0)+(panto?4:0);
          const w=bodyPx/2,nose=bodyPx*.48,a=back?nose:0,b=front?L-nose:L,low=H*.44;
          const side=(-ty*camX+tx*camY)>=0?1:-1;
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
      // Depth: test against what 3D buildings wrote (so a building in front hides the train) but never
      // write — the model's own faces are still ordered by the painter's pass above.
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);   // nothing opaque is drawn before trains; skipping the test avoids low-precision flicker on phones
      gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.b);
      if(this.gpuCapacity!==this.data.length){gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);this.gpuCapacity=this.data.length}
      gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.used);
      const S=52,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off)};
      ptr('a_pos',3,0);ptr('a_local',2,12);ptr('a_info',4,20);ptr('a_color',3,36);ptr('a_face',1,48);
      gl.uniform2f(this.uni.u_offset,sunTrainShadow[0]*unit,sunTrainShadow[1]*unit);gl.uniform1f(this.uni.u_shadow,1);gl.uniform1f(this.uni.u_glow,document.documentElement.dataset.theme==='dark'?.62:.3);gl.uniform1f(this.uni.u_time,performance.now()/1000);gl.drawArrays(gl.TRIANGLES,0,this.used/13);
      gl.uniform2f(this.uni.u_offset,0,0);gl.uniform1f(this.uni.u_shadow,0);gl.drawArrays(gl.TRIANGLES,0,this.used/13);
      // depth-only pass: record the train so the translucent buildings drawn later stay behind it where they should
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.ALWAYS);gl.depthMask(true);gl.colorMask(false,false,false,false);gl.drawArrays(gl.TRIANGLES,0,this.used/13);gl.colorMask(true,true,true,true);
    }
    // moving trains: trainFps(); the selected train's ripple: RIPPLE_FPS; trains standing at a
    // station: once a second, to see them set off
    const fps=Math.max(animating?(following?FOLLOW_FPS:trainFps()):0,rippling?RIPPLE_FPS:0);
    if(fps)repaintSoon(1000/fps);else if(waiting)repaintSoon(1000);
  }
  onRemove(map,gl){gl.deleteBuffer(this.b);gl.deleteProgram(this.p)}
}

// ---- bottom sheet: station and train details slide up from the bottom of the map -------------
const sheet=document.createElement('section');sheet.className='sheet';sheet.hidden=true;sheet.setAttribute('aria-label','상세 정보');
sheet.innerHTML='<div class="sheet-grab" aria-hidden="true"></div><button type="button" class="sheet-close" aria-label="닫기">✕</button><div class="sheet-body"></div><button type="button" class="sheet-follow" hidden>이 열차 따라가기</button>';
const sheetBody=sheet.querySelector('.sheet-body'),followBtn=sheet.querySelector('.sheet-follow');
let sheetToken=0,sheetTrain=null,following=null,easing=false;
function openSheet(html){sheetBody.innerHTML=html;sheet.hidden=false;requestAnimationFrame(()=>sheet.classList.add('open'));return ++sheetToken}
function closeSheet(){
  if(sheet.hidden)return;
  sheet.classList.remove('open');sheetToken++;sheetTrain=null;following=null;followBtn.hidden=true;
  map.easeTo({padding:{top:0,bottom:0,left:0,right:0},duration:300});
  setTimeout(()=>{if(!sheet.classList.contains('open'))sheet.hidden=true},260);
}
sheet.querySelector('.sheet-close').onclick=closeSheet;
addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
// Following: the camera keeps the chosen train in the middle of the map above the sheet.
// Dragging the map stops it; the button in the sheet starts it again.
const sheetPad=()=>sheet.hidden?0:Math.min(sheet.offsetHeight,map.getContainer().clientHeight*.6);
function trainLngLat(plan){
  const z=map.getZoom(),unit=1/(512*2**z),q=trackPoint(plan,trainPose(plan).dist),o=(q.off+laneOffsetPx(z))*unit;
  return new maplibregl.MercatorCoordinate(q.x+q.r[0]*o,q.y+q.r[1]*o,0).toLngLat();
}
function follow(id){following=id;followBtn.hidden=true;const plan=plans.find(p=>p.id===id);if(!plan)return;
  easing=true;map.once('moveend',()=>{easing=false});
  map.easeTo({center:trainLngLat(plan),zoom:Math.max(map.getZoom(),16),padding:{top:0,bottom:sheetPad(),left:0,right:0},duration:700})}
followBtn.onclick=()=>{if(sheetTrain)follow(sheetTrain)};
// Keep a followed train centred, stepped with the animation redraws (moving it every display frame
// redrew the whole map at 60–120 Hz) and only when it has moved.
let followAt='';
animFrame.push(()=>{
  const sel=following&&!easing&&sheetTrain&&plans.find(p=>p.id===sheetTrain);if(!sel)return;
  const c=trainLngLat(sel),k=`${c.lng.toFixed(7)},${c.lat.toFixed(7)}`;if(k===followAt)return;followAt=k;
  map.jumpTo({center:c,padding:{top:0,bottom:sheetPad(),left:0,right:0}});
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
  const t=plan.t,a=Math.round(age(t.receivedAt)),kst=v=>v?new Date(v).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'-';
  const kv=(k,v)=>`<dt>${k}</dt><dd>${v}</dd>`,c=colors[t.line];
  const badges=[t.express?'<span class="b ex">급행</span>':'',t.last?'<span class="b last">막차</span>':''].join('');
  return `<div class="train-inspect" style="--c:${c}">
  <div class="tp-line"><span class="dot"></span>${esc(t.line)}<span class="no">${esc(t.trainNo)}</span>${badges}</div>
  <div class="tp-dest">${esc(destLabel(t)||'행선지 정보 없음')}</div>
  <div class="tp-now">${esc(riderState(plan))}</div>
  <div class="sec">서울시 실시간 원본</div>
  <dl class="kv">${kv('역',esc(t.station))}${kv('상태',esc(t.status))}${kv('방향',esc(t.direction))}${kv('행선지',esc(t.destination||'-'))}
  ${kv('기록 시각',`${esc(String(t.receivedAt||'-').slice(11))} <span class="muted">(${a}초 전)</span>`)}${kv('받은 시각',kst(liveFetchedAt))}</dl></div>`;
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
  const head=sub=>`<div class="tp-line">${lineChips}</div><div class="tp-dest">${esc(st.name)}</div><div class="tp-now">${sub}</div>`;
  const token=openSheet(`<div class="train-inspect station-sheet">${head('도착 정보 불러오는 중…')}</div>`);
  const put=h=>{if(token===sheetToken)sheetBody.innerHTML=h};
  const render=d=>{
    const groups=new Map();
    for(const a of (d.arrivals||[])){const k=`${a.line}|${a.direction}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a)}
    const lines=st.lines.map(x=>x.name),order=[...groups.keys()].sort((x,y)=>lines.indexOf(x.split('|')[0])-lines.indexOf(y.split('|')[0])||x.localeCompare(y,'ko'));
    const cards=order.map(k=>{const [line,dir]=k.split('|'),list=groups.get(k).sort((a,b)=>arrivalRank(a)-arrivalRank(b)).slice(0,2);
      const toward=(list[0].heading.split('-')[1]||'').trim();
      return `<div class="arr" style="--c:${colors[line]||'#52646a'}"><div class="arr-h"><span class="dot"></span>${esc(line)} <span class="muted">${esc(dir)}${toward?' · '+esc(toward):''}</span></div>
        ${list.map(a=>`<div class="arr-t"><b>${esc(arrivalText(a))}</b><span class="muted">${esc(a.destination)}행${a.express?' · 급행':''}${a.last?' · 막차':''}</span></div>`).join('')}</div>`}).join('');
    const ex=exitList(st);
    put(`<div class="train-inspect station-sheet">${head(`서울시 실시간 도착정보 · ${new Date(d.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})} 기준`)}
      <div class="sec">곧 오는 열차</div>${cards?`<div class="arrs">${cards}</div>`:'<div class="muted empty">지금 도착 예정 열차 정보가 없어요.</div>'}
      ${ex?`<div class="sec">출구</div>${ex}`:''}</div>`);
  };
  try{const r=await fetch(`./api/live?arrivals=${encodeURIComponent(st.name.replace(/\([^)]*\)/g,''))}`,{cache:'no-store'}),d=await r.json();if(!r.ok||!d.ok)throw Error();render(d);
    const timer=setInterval(()=>{if(token!==sheetToken)return clearInterval(timer);render(d)},15000);}
  catch{put(`<div class="train-inspect station-sheet">${head('도착 정보를 불러오지 못했어요. 잠시 후 다시 눌러 주세요.')}</div>`)}
}
document.head.insertAdjacentHTML('beforeend','<style>.station-pop table{border-collapse:collapse;font-size:12px;margin-top:6px;width:100%}.station-pop th{text-align:left;font-weight:700;padding:5px 10px 5px 0;vertical-align:top;white-space:nowrap}.station-pop td{padding:5px 0}.station-pop td div+div{margin-top:2px}.station-pop tr+tr th,.station-pop tr+tr td{border-top:1px solid rgba(120,140,150,.2)}.station-pop .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);margin-right:5px}.station-pop .muted{color:#7a8a90;font-weight:500}.station-pop .foot{margin-top:8px;font-size:11px}.station-pop .exits{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(120,140,150,.2)}.station-pop .exits .muted{margin-right:4px;font-size:12px}.station-pop .exit{min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ffd200;color:#1d1d1d;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:1px}.station-pop .exit i{font-style:normal;font-size:10px}</style>');

// ---- station labels (DOM markers with box collision) --------------------------------
let labelFrame=0;
// Station names sit inside the platform rectangle, turned along it. Where the name is longer than
// the platform on screen, its box (same outline and fill) extends past it so the text still fits.
// They are drawn by a WebGL layer placed *below* the trains, so a train at a station stays visible.
const measure=(()=>{const c=document.createElement('canvas').getContext('2d'),cache=new Map();return (t,px)=>{const k=px.toFixed(1)+t;let w=cache.get(k);if(w==null){c.font=`700 ${px}px "Noto Sans KR",sans-serif`;w=c.measureText(t).width;cache.set(k,w)}return w}})();
// Screen-space placement of every visible name box (collision-culled), recomputed each frame.
function layoutLabels(){
  const cw=map.getCanvas().clientWidth,ch=map.getCanvas().clientHeight,z=map.getZoom(),hgt=stationWidthPx(z),font=Math.max(9,Math.min(13,hgt*.58)),placed=[],out=[];
  for(const item of labels){
    const r=stationRects.get(`${item.line}:${item.station.id}`);if(!r)continue;
    const p0=map.project(r.coords[0]),p1=map.project(r.coords[r.coords.length-1]);
    let dx=p1.x-p0.x,dy=p1.y-p0.y;const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
    const nx=-dy,ny=dx,cx=(p0.x+p1.x)/2+nx*r.offset,cy=(p0.y+p1.y)/2+ny*r.offset;   // line-offset: right of drawing direction
    let ang=Math.atan2(dy,dx);if(ang>Math.PI/2)ang-=Math.PI;else if(ang<-Math.PI/2)ang+=Math.PI;
    const tw=measure(item.text,font),bw=Math.max(len,tw+10);
    const ex=(Math.abs(Math.cos(ang))*bw+Math.abs(Math.sin(ang))*hgt)/2,ey=(Math.abs(Math.sin(ang))*bw+Math.abs(Math.cos(ang))*hgt)/2;
    const box=[cx-ex,cy-ey,cx+ex,cy+ey];
    if(box[2]<0||box[0]>cw||box[3]<0||box[1]>ch||placed.some(o=>box[0]<o[2]&&box[2]>o[0]&&box[1]<o[3]&&box[3]>o[1]))continue;
    placed.push(box);out.push({item,cx,cy,ang,bw,hgt:platformPx(r,hgt),font,tw});
  }
  return out;
}
const hexRGB3=v=>[parseInt(v.slice(1,3),16)/255,parseInt(v.slice(3,5),16)/255,parseInt(v.slice(5,7),16)/255];
const NAME_PX=40,NAME_ROW=50;   // atlas: each name rendered once at 40 px in a 50 px row
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
precision highp float;in vec2 v_local;in vec2 v_size;in vec4 v_uv;in vec3 v_color;in vec2 v_tw;uniform sampler2D u_tex;uniform float u_dpr;uniform float u_dark;out vec4 o;
void main(){
  vec2 d=v_size*.5-abs(v_local);                         // px to the box edge
  // rounded rectangle: white fill, line-colour border, dark name
  float r=abs(v_size.x-v_size.y)<.5?v_size.x*.5:min(v_size.y*.32,v_size.x*.5),border=(abs(v_size.x-v_size.y)<.5?1.8:2.2)*u_dpr;   // square box → dot
  vec2 q=abs(v_local)-(v_size*.5-r);float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-r;
  float aa=max(fwidth(sd),1e-3),cover=clamp(.5-sd/aa,0.,1.);if(cover<=0.)discard;
  vec3 fill=mix(vec3(1.),vec3(.12,.17,.2),u_dark),ink=mix(vec3(.11,.17,.19),vec3(.93,.96,.97),u_dark);   // dark mode: dark box, light name
  vec3 col=mix(fill,v_color,smoothstep(-border-aa,-border+aa,sd));
  if(v_tw.x>0.){vec2 t=(v_local+v_tw*.5)/v_tw;   // v_tw = text cell size (width, font × row ratio)
    if(t.x>0.&&t.x<1.&&t.y>0.&&t.y<1.){float a=texture(u_tex,vec2(mix(v_uv.x,v_uv.z,t.x),mix(v_uv.y,v_uv.w,t.y))).a;col=mix(col,ink,a);}}
  o=vec4(col*cover,cover);
}`;
    const sh=(type,src)=>{const x=gl.createShader(type);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.p);
    if(!gl.getProgramParameter(this.p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.p));
    this.b=gl.createBuffer();this.tex=gl.createTexture();
    this.attr=Object.fromEntries(['a_px','a_local','a_size','a_uv','a_color','a_tw'].map(n=>[n,gl.getAttribLocation(this.p,n)]));
    this.uni=Object.fromEntries(['u_matrix','u_tex','u_dpr','u_dark'].map(n=>[n,gl.getUniformLocation(this.p,n)]));
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
      const col=hexRGB3(colors[line]||'#52646a'),h=platformPx(r,hgt),len=lenU/unit;
      // names read left→right on screen: flip the axis when it points leftward
      const p0=map.project(r.coords[0]),p1=map.project(r.coords[r.coords.length-1]),flip=p1.x<p0.x?-1:1;
      geo.set(k,{cx,cy,ax:ax*flip,ay:ay*flip,len,h,col});
      if(pointsOnly)quad(cx,cy,1,0,dot,dot,[0,0,0,0],col,0,0);
      else quad(cx,cy,ax*flip,ay*flip,Math.max(len,h),h,[0,0,0,0],col,0,0);   // one box: platform and passages out to the exits
    }
    if(!pointsOnly)for(const L of layoutLabels()){
      const g=geo.get(`${L.item.line}:${L.item.station.id}`),uv=this.uv.get(L.item.text);if(!g||!uv)continue;
      quad(g.cx,g.cy,g.ax,g.ay,Math.max(g.len,L.bw),g.h,uv,g.col,uv[4]*L.font,L.font*NAME_ROW/NAME_PX);
    }
    if(!data.length)return;
    const M=options.defaultProjectionData.mainMatrix,MT=Array.from(M);for(let r=0;r<4;r++)MT[12+r]=M[r]*ox+M[4+r]*oy+M[12+r];
    gl.useProgram(this.p);gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
    const S=15*4,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off*4)};
    ptr('a_px',2,0);ptr('a_local',2,2);ptr('a_size',2,4);ptr('a_uv',4,6);ptr('a_color',3,10);ptr('a_tw',2,13);
    gl.uniformMatrix4fv(this.uni.u_matrix,false,new Float32Array(MT));gl.uniform1f(this.uni.u_dpr,1);gl.uniform1f(this.uni.u_dark,document.documentElement.dataset.theme==='dark'?1:0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(this.uni.u_tex,0);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES,0,data.length/15);
  }
}
const stationNames=new StationNameLayer();
function updateLabelVisibility(){labelFrame=0;map.triggerRepaint()}
const scheduleLabels=()=>{if(!labelFrame)labelFrame=requestAnimationFrame(updateLabelVisibility)};
function rebuildLabels(){
  labels=[];
  const visible=stations.filter(s=>selected==='all'||s.lines.some(x=>x.name===selected)).sort((a,b)=>b.lines.length-a.lines.length);
  for(const s of visible){
    const line=selected!=='all'&&s.lines.some(x=>x.name===selected)?selected:s.lines[0].name;
    labels.push({station:s,line,text:s.name+(s.express?.length?' (급행)':'')});
  }
  scheduleLabels();
}

function filterLine(line){
  if(!ready){pendingLine=line;return}
  selected=line;
  map.setFilter('routes',line==='all'?null:['==',['get','line'],line]);
  for(const id of ['stations','stations-casing'])map.setFilter(id,line==='all'?null:['==',['get','line'],line]);
  for(const id of ['transfer-casing','transfer-fill'])map.setLayoutProperty(id,'visibility',line==='all'?'visible':'none');
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
  const key=lines.join(',');
  if(!force&&key===liveKey&&Date.now()-liveAt<30000)return; // same lines, fetched recently
  const request=++liveRequest;liveKey=key;liveAt=Date.now();
  if(!plans.length)liveState.parentElement.dataset.state='loading';liveState.textContent=`${lines.join(' · ')} 열차 위치 확인 중`;
  try{
    const r=await fetch(`./api/live?lines=${encodeURIComponent(key)}`,{cache:'no-store'}),d=await r.json();
    if(request!==liveRequest)return; // a newer view or selection superseded this response
    if(!r.ok||!d.ok)throw Error(d.error||r.status);
    // A record not refreshed for 10 minutes is a train the feed lost track of (or one that left
    // service); extrapolating it would park a ghost train somewhere down the line.
    const all=d.trains||[];trains=all.filter(t=>age(t.receivedAt)<=STALE_SECONDS);const stale=all.length-trains.length;
    // Fresh data: each train carries on from where it is drawn (replacePlans), never jumping back.
    liveFetchedAt=d.fetchedAt;liveFailures=0;updateLiveNotice(d.warnings&&d.warnings.length?'실시간 정보 일부가 지연되고 있어요. 이전 자료로 표시 중이에요.':null);learnDirections(trains);replacePlans(trains.map(planTrain).filter(Boolean));lastPose.clear();
    const unplaced=trains.length-plans.length,shown=d.lines||lines;
    liveState.parentElement.dataset.state='ok';liveState.textContent=`추정 위치 ${plans.length}대${unplaced?` (역 미확인 ${unplaced})`:''}${stale?` (오래된 기록 ${stale} 제외)`:''} · ${shown.join(' · ')} · ${new Date(d.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}`;
    map.triggerRepaint();
  }catch{if(request===liveRequest){liveKey='';liveFailures++;liveState.parentElement.dataset.state='error';liveState.textContent='실시간 위치 연결 실패 · 잠시 후 재시도';if(liveFailures>=2||!plans.length)updateLiveNotice('실시간 열차 정보에 연결하지 못했어요. 20초마다 다시 시도해요.')}}
}

map.on('load',()=>{
  map.addSource('routes',{type:'geojson',data:{type:'FeatureCollection',features:buildLineFeatures()}});
  shapesReady.then(()=>{map.getSource('routes').setData({type:'FeatureCollection',features:buildLineFeatures()});map.getSource('transfers').setData({type:'FeatureCollection',features:buildTransferFeatures()});map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels();map.triggerRepaint()});
  map.addLayer({id:'routes',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],8,1.5,15,4],'line-offset':['get','offset'],'line-opacity':.9}});
  map.addSource('transfers',{type:'geojson',data:{type:'FeatureCollection',features:buildTransferFeatures()}});
  map.addLayer({id:'transfer-casing',type:'line',source:'transfers',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#52646a','line-width':['interpolate',['linear'],['zoom'],9,5,15,11]}});
  map.addLayer({id:'transfer-fill',type:'line',source:'transfers',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],9,2.5,15,7]}});
  map.addSource('stations',{type:'geojson',data:{type:'FeatureCollection',features:buildStationFeatures()}});
  // Stations: square-ended platform rectangles filled with the line colour (no outline), widths shared with the name boxes.
  // line layers kept (invisible) for clicking; the visible platforms are drawn by the station-names layer
  map.addLayer({id:'stations-casing',type:'line',source:'stations',layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-opacity':0,'line-color':['get','color'],'line-offset':['get','offset'],'line-width':['interpolate',['linear'],['zoom'],...STATION_WIDTH_STOPS.flat()]}});
  map.addLayer({id:'stations',type:'line',source:'stations',layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-opacity':0,'line-color':['get','color'],'line-offset':['get','offset'],'line-width':['interpolate',['linear'],['zoom'],...STATION_WIDTH_STOPS.map(([z,w])=>[z,Math.max(1,w-4)]).flat()]}});
  map.addLayer(stationNames);   // names under the trains
  map.addLayer(new TrainLayer());
  // My location, drawn on the ground under the trains (the control's own DOM dot is hidden in CSS).
  {
    map.addSource('me',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    const pa={'circle-pitch-alignment':'map','circle-pitch-scale':'map'};
    // no paint transitions: the default 300 ms ease would chase every frame's value and visibly shrink the ring back at each cycle
    map.addLayer({id:'me-pulse',type:'circle',source:'me',paint:{...pa,'circle-radius':9,'circle-color':'#ffd400','circle-opacity':0,'circle-radius-transition':{duration:0},'circle-opacity-transition':{duration:0}}},'webgl-trains');
    map.addLayer({id:'me-ring',type:'circle',source:'me',paint:{...pa,'circle-radius':14,'circle-color':'#ffffff','circle-blur':.15}},'webgl-trains');
    map.addLayer({id:'me-dot',type:'circle',source:'me',paint:{...pa,'circle-radius':9,'circle-color':'#ffd400','circle-stroke-color':'#141414','circle-stroke-width':2.5}},'webgl-trains');
    let shown=false,me=null;
    geolocate.on('geolocate',e=>{
      const {longitude:x,latitude:y}=e.coords;shown=true;me=[x,y];
      map.getSource('me').setData({type:'Feature',geometry:{type:'Point',coordinates:[x,y]},properties:{}});
    });
    // the same pulse as MapLibre's dot: grows to 3× and fades over 70% of a 2 s cycle; runs only while on screen
    const onScreen=()=>shown&&map.getBounds().contains(me);
    animFrame.push(()=>{if(!onScreen())return;const t=(performance.now()%2000)/2000,k=Math.min(1,t/.7);
      map.setPaintProperty('me-pulse','circle-radius',9*(1+2*k));map.setPaintProperty('me-pulse','circle-opacity',.9*(1-k))});
    map.on('render',()=>{if(onScreen())repaintSoon(1000/RIPPLE_FPS)});
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
  let sunTimer=0;const sunSoon=()=>{clearTimeout(sunTimer);sunTimer=setTimeout(updateSun,400)};
  map.on('moveend',sunSoon);map.on('sourcedata',e=>{if(e.sourceId==='ofm'&&e.isSourceLoaded&&e.tile)sunSoon()});
  addBasemap();
  // exits: yellow number discs (like station exit signs) from zoom 16
  map.addSource('exits',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'exits',type:'circle',source:'exits',minzoom:16,paint:{'circle-radius':['interpolate',['linear'],['zoom'],16,6.5,18,9],'circle-color':'#ffd200','circle-stroke-color':'#3a3a3a','circle-stroke-width':1}});   // above the 3D buildings so every exit stays readable
  map.addLayer({id:'exit-refs',type:'symbol',source:'exits',minzoom:16,layout:{'text-field':['get','ref'],'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],16,9,18,12],'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#1d1d1d'}});
  exitsReady.then(()=>map.getSource('exits').setData({type:'FeatureCollection',features:exitFeatures()}));
  $('toggleMap').setAttribute('aria-pressed','true');   // background map on by default
  applyTheme();
  map.getContainer().append(liveNotice);map.getContainer().parentElement.append(sheet);   // train number and destination live in the train popup, not on the map
  if(pendingLine)filterLine(pendingLine);else{rebuildLabels();refreshLive(true)}
});

let searchTimer=0;
$('search').oninput=e=>{clearTimeout(searchTimer);const q=e.target.value.trim();if(!q)return;searchTimer=setTimeout(()=>{const s=stations.find(x=>x.name.startsWith(q)&&(selected==='all'||x.lines.some(l=>l.name===selected)))||stations.find(x=>x.name.includes(q)&&(selected==='all'||x.lines.some(l=>l.name===selected)));if(s)map.flyTo({center:[s.lon,s.lat],zoom:15})},350)};
// ---- icon buttons ----------------------------------------------------------------------------
const svg=d=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS={
  map:svg('<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  train:svg('<rect x="5" y="3" width="14" height="14" rx="3.5"/><path d="M5 10h14M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="13.5" r=".9" fill="currentColor"/><circle cx="15" cy="13.5" r=".9" fill="currentColor"/>'),
  sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'),
  moon:svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  auto:svg('<path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9"/>'),
  zoom:svg('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'),
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
         text:'#56656a',road:'#7a8589',waterText:'#5d8aa3',parkText:'#5f8a5a',poi:'#8a7f6d',halo:'rgba(255,255,255,.9)',xferCase:'#52646a',xferFill:'#ffffff'},
  dark:{bld3d:'#3a4a53',bld3dOpacity:.78,bg:'#10181c',water:'#16293a',park:'#15241c',land:'#15211b',bld:'#1c262b',roadMinor:'#243238',roadMajor:'#2f3f47',rail:'#35454d',
        text:'#9aabb1',road:'#7f9096',waterText:'#6f9bb5',parkText:'#6e9a69',poi:'#a59a86',halo:'rgba(12,19,23,.9)',xferCase:'#8ea1a8',xferFill:'#10181c'},
};
const THEME_KEY='subway-theme';
let themeChoice='auto';
try{themeChoice=localStorage.getItem(THEME_KEY)||'auto'}catch{}
// Sunrise / sunset for Seoul (sunrise equation; accurate to a few minutes)
function effectiveTheme(){if(themeChoice!=='auto')return themeChoice;const now=new Date(),{rise,set}=seoulSun(now);return now>=rise&&now<set?'light':'dark'}
function applyTheme(){
  const t=effectiveTheme(),P=MAP_THEMES[t];
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
  set('bm-bld3d','fill-extrusion-color',P.bld3d);set('bm-bld3d','fill-extrusion-opacity',P.bld3dOpacity);
  set('bm-road-minor','line-color',P.roadMinor);set('bm-road-major','line-color',P.roadMajor);set('bm-rail','line-color',P.rail);
  for(const [id,c] of [['bm-label-place',P.text],['bm-label-road',P.road],['bm-label-water',P.waterText],['bm-label-park',P.parkText],['bm-label-poi',P.poi]]){set(id,'text-color',c);set(id,'text-halo-color',P.halo)}
  set('transfer-casing','line-color',P.xferCase);set('transfer-fill','line-color',P.xferFill);
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
  try{map.setLight({anchor:'map',position:[1.4,up?az:0,up?Math.max(10,90-el):20],intensity:up?.55:.3,color:dark?'#9fb4c8':'#ffffff'})}catch{}
  // trains: shadow away from the sun, longer when it is low
  const sh=up?Math.min(7,1.6/Math.tan(el*Math.PI/180)):1.2,away=(az+180)*Math.PI/180;
  sunTrainShadow=up?[Math.sin(away)*sh,-Math.cos(away)*sh]:[.8,1.1];
  // buildings
  if(!up||map.getZoom()<14.5||!map.getLayer('bm-bld3d')||map.getLayoutProperty('bm-bld3d','visibility')==='none'){sunShadows.set(null,0);map.triggerRepaint();return}
  const k=1/Math.tan(el*Math.PI/180),ux=Math.sin(away),uy=Math.cos(away),seen=new Set(),tris=[];
  const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter());
  for(const f of map.querySourceFeatures('ofm',{sourceLayer:'building'})){
    const h=+(f.properties.render_height??10),g=f.geometry;if(!h||!g)continue;
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
  sunShadows.set({data:new Float32Array(tris),ox:O.x,oy:O.y},Math.min(.34,.14+el/150)*fade*(dark?.55:1)*phone);
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
$('toggleTrains').onclick=e=>{trainsEnabled=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(trainsEnabled));map.triggerRepaint()};
// ---- settings (gear in the header): on/off switches ----
{
  const btn=$('settingsButton'),panel=$('settingsPanel');
  $('toggleMap').querySelector('.setting-icon').innerHTML=ICONS.map;$('toggleTrains').querySelector('.setting-icon').innerHTML=ICONS.train;$('zoomIcon').innerHTML=ICONS.zoom;
  const setOpen=o=>{panel.hidden=!o;btn.setAttribute('aria-expanded',String(o))};
  btn.onclick=e=>{e.stopPropagation();setOpen(panel.hidden)};
  document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target))setOpen(false)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){setOpen(false);btn.focus()}});
}
const zoom=()=>{$('zoomValue').textContent=Math.round(map.getZoom())};zoom();   // current zoom, shown in settings
map.on('zoom',zoom);map.on('move',scheduleLabels);map.on('resize',scheduleLabels);
// Server caches ~90s and the upstream key has a daily quota: don't poll from background tabs.
// The proxy refreshes upstream every 90 s and serves its cache in between, so polling it often is
// free and picks up each upstream refresh within ~20 s.
setInterval(()=>{if(!document.hidden)refreshLive(true)},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLive(true)});
let liveMoveTimer=0;map.on('moveend',()=>{clearTimeout(liveMoveTimer);liveMoveTimer=setTimeout(()=>refreshLive(),600)});
window.__subwayWebGL={map,refreshLive,updateSun,applyTheme,sunPosition,trackPoint,edgeCoords,get plans(){return plans},get renderer(){return map.getCanvas().getContext('webgl2')?'webgl2':'none'}};
