import * as maplibregl from './vendor/maplibre-gl.mjs';

const json=id=>JSON.parse(document.getElementById(id).textContent);
const stations=json('stationData'),counts=json('lineCounts'),paths=json('linePaths');
const colors={'1호선':'#0052A4','2호선':'#00A84D','3호선':'#EF7C1C','4호선':'#00A5DE','5호선':'#996CAC','6호선':'#CD7C2F','7호선':'#747F00','8호선':'#E6186C','9호선':'#BDB092','GTX-A':'#9A6292','경강선':'#0054A6','경의중앙선':'#77C4A3','경춘선':'#178C72','공항철도':'#0090D2','김포골드라인':'#AD8605','서해선':'#8FC31F','수인분당선':'#F5A200','신림선':'#6789CA','신분당선':'#D4003B','에버라인선':'#6FB245','우이신설선':'#B7C452','의정부선':'#FDA600','인천1호선':'#7CA8D5','인천2호선':'#ED8B00'};
const HOME={center:[126.98,37.53],zoom:10},LINE_GAP=5;
const esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Stations renamed after the GTFS snapshot (live feed name → GTFS name).
const RENAMED={'불암산':'당고개'};
const key=v=>{const k=String(v||'').replace(/\([^)]*\)/g,'').replace(/(종착|지선|순환|역)$/,'').replace(/\s/g,'').toLocaleLowerCase('ko');return RENAMED[k]||k};
const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const byId=new Map(stations.map(s=>[s.id,s])),stationByLine=new Map();
stations.forEach(s=>s.lines.forEach(x=>stationByLine.set(`${x.name}:${key(s.name)}`,s)));
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
let shapes={},stops={},stopDirs={};   // stopDirs: platform direction (east, north) per line:stop, along its street
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
    let h=PLATFORM_HALF,f;
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
    stationRects.set(`${line}:${s.id}`,{coords,offset});
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

const shapesReady=fetch('./track_shapes.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{d=d||{};shapes=d.edges||(d.stops?{}:d);stops=d.stops||{};stopDirs=d.stopDirs||{};smoothCache.clear();edgeGeom.clear();stopMerc.clear();if(Object.keys(shapes).length)document.querySelector('.provenance')?.insertAdjacentHTML('beforeend',' 선로 형태는 © OpenStreetMap contributors 자료를 사용했습니다.');plans=trains.map(planTrain).filter(Boolean)}).catch(()=>{});
const map=new maplibregl.Map({container:'map',localIdeographFontFamily:'"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif',...HOME,pitch:35,bearing:0,maxZoom:18,minZoom:7,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf2f1'}}]},attributionControl:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
let selected='all',trains=[],trainsEnabled=true,labels=[],liveRequest=0,ready=false,pendingLine=null;
const $=id=>document.getElementById(id);
const lineList=$('lineList'),lineSelect=$('lineSelect'),liveState=document.querySelector('#liveState span'),lines=Object.keys(counts).sort((a,b)=>a.localeCompare(b,'ko'));
lines.forEach(line=>{const o=document.createElement('option');o.value=line;o.textContent=`${line} · ${counts[line]}개 역`;lineSelect.append(o);const b=document.createElement('button');b.type='button';b.className='line-btn';b.dataset.line=line;b.setAttribute('aria-pressed','false');b.innerHTML=`<span class="swatch" style="--line:${colors[line]}"></span><span>${esc(line)}</span><span class="count">${counts[line]}</span>`;b.onclick=()=>filterLine(selected===line?'all':line);lineList.append(b)});

// ---- live train routing -------------------------------------------------------------
// Seoul API statuses: 진입(approaching s), 도착(at s), 출발(left s), 전역출발(left the stop before s).
const normStatus=v=>String(v||'').replace(/\s/g,'');
function ringOf(line){const raw=(paths[line]||[])[0];if(!raw)return null;const end=raw.indexOf(raw[0],1);return end>1?raw.slice(0,end):null}
const ring2=ringOf('2호선');
// Stations the train will pass from s onward (s first), stopping at its destination.
// Which index direction 상행/하행 means differs per line and per path chunk, so learn it from
// trains whose destination resolves: dirVotes["line|chunk|up|down"] = Σ sign(dest index − index).
let dirVotes={};
const dirLabel=t=>/상|내/.test(String(t.direction||''))?'up':'down';
function learnDirections(list){
  dirVotes={};
  for(const t of list){
    const s=stationByLine.get(`${t.line}:${key(t.station)}`),dest=stationByLine.get(`${t.line}:${key(t.destination)}`);
    if(!s||!dest||dest.id===s.id)continue;
    (paths[t.line]||[]).forEach((ids,ci)=>{const i=ids.indexOf(s.id),j=ids.indexOf(dest.id);if(i>=0&&j>=0){const k=`${t.line}|${ci}|${dirLabel(t)}`;dirVotes[k]=(dirVotes[k]||0)+(j>i?1:-1)}});
  }
}
function route(t,s){
  const dest=stationByLine.get(`${t.line}:${key(t.destination)}`),dir=String(t.direction||''),MAX=8;
  // A train already at its destination has finished its run: hold it there (only use the
  // neighbour for orientation) instead of extrapolating onward in its direction of travel.
  const terminated=dest&&dest.id===s.id;
  if(t.line==='2호선'&&ring2&&!/신설동|성수지선|신도림지선|까치산/.test(String(t.destination||''))){
    const i=ring2.indexOf(s.id);
    if(i>=0){
      const sign=dir.includes('외')?-1:1,n=ring2.length,ahead=[];
      for(let k=0;k<=MAX;k++){const st=byId.get(ring2[((i+sign*k)%n+n)%n]);ahead.push(st);if(k&&dest&&st.id===dest.id)break}
      return {previous:byId.get(ring2[((i-sign)%n+n)%n]),ahead:terminated?[s]:ahead};
    }
  }
  // 6호선 응암 loop: one-way 응암 → 역촌 → 불광 → 독바위 → 연신내 → 구산 → 응암. 상행 '응암순환' trains run into
  // it at 응암; inside it the feed labels them 하행 (봉화산/신내) until they leave it at 응암 toward 새절.
  if(t.line==='6호선'){
    const ids=(paths['6호선']||[])[0]||[],eungam=stationByLine.get('6호선:응암'),a=eungam?ids.indexOf(eungam.id):-1,b=a>=0?ids.indexOf(eungam.id,a+1):-1;
    if(a>=0&&b>a&&b-a<12){
      const up=/상/.test(dir),circ=/순환/.test(String(t.destination||'')),st=normStatus(t.status);
      let i=-1;
      if(s.id===eungam.id)i=up&&circ?a:(/도착|진입/.test(st)?b:a);      // 하행 at 응암: arriving = finishing the loop
      else{const k=ids.indexOf(s.id);if(k>a&&k<b)i=k;else if(up&&circ){const k2=ids.lastIndexOf(s.id,a);if(k2>=0&&k2<a)i=k2}}
      if(i>=0){
        const ahead=[];for(let j=i;j<ids.length&&ahead.length<=MAX;j++){ahead.push(byId.get(ids[j]));if(j>i&&circ&&j===b)break}
        return {previous:byId.get(ids[i-1]),ahead};
      }
    }
  }
  let best=null;
  (paths[t.line]||[]).forEach((ids,ci)=>{for(let i=0;i<ids.length;i++){
    if(ids[i]!==s.id)continue;
    const consider=(sign,d)=>{if(ids[i+sign]!==undefined&&(!best||d<best.d))best={ids,i,sign,d}};
    if(dest&&dest.id!==s.id){const j=ids.indexOf(dest.id);if(j>=0)consider(j>i?1:-1,Math.abs(j-i))}
    // No usable destination: go the way other trains with the same 상행/하행 label go on this chunk.
    const vote=dirVotes[`${t.line}|${ci}|${dirLabel(t)}`],guess=vote?Math.sign(vote):(/상|내/.test(dir)?-1:1);
    consider(guess,1e6);
    consider(-guess,2e6);
  }});
  if(!best)return {previous:undefined,ahead:[s]};
  const {ids,i,sign}=best,ahead=[];
  for(let j=i;j>=0&&j<ids.length&&ahead.length<=MAX;j+=sign){const st=byId.get(ids[j]);if(!st)break;ahead.push(st);if(j!==i&&dest&&st.id===dest.id)break}
  return {previous:byId.get(ids[i-sign]),ahead:terminated?[s]:ahead};
}
function age(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);return m?Math.max(0,(Date.now()-Date.UTC(+m[1],+m[2]-1,+m[3],+m[4]-9,+m[5],+m[6]))/1000):0}
// Run time between adjacent stations: the GTFS timetable's median (edge_times.json, built by
// build_edge_times.py); failing that, track length at the timetable's typical 12.4 m/s.
let edgeTimes={},lineDwell={};
fetch('./edge_times.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{edgeTimes=d.edges||{};lineDwell=d.dwell||{};plans=trains.map(planTrain).filter(Boolean)}).catch(()=>{});
function segmentSeconds(a,b,line){
  const sched=line&&edgeTimes[`${line}:${Math.min(a.id,b.id)}:${Math.max(a.id,b.id)}`];if(sched)return sched;
  const A=merc(a),B=merc(b),chord=Math.hypot(B.x-A.x,B.y-A.y),track=line?geom(line,a.id,b.id).total:chord,metres=Math.max(chord,track)/A.meterInMercatorCoordinateUnits();
  return Math.max(30,Math.min(180,metres/12.4));
}
// Dead reckoning: the API only reports the last event (진입/도착/출발/전역출발) and when it happened.
// Roll the train forward from that moment: approach → dwell → run → dwell … along its route,
// so a train that "arrived 90s ago" is drawn already heading to the next stop.
const dwellFor=line=>lineDwell[line]||30,smooth=x=>x*x*(3-2*x);
// Typical consist per line: [cars, metres per car]. Drawn at true length along the track.
const CONSIST={'1호선':[10,20],'2호선':[10,20],'3호선':[10,20],'4호선':[10,20],'5호선':[8,20],'6호선':[8,20],'7호선':[8,20],'8호선':[6,18],'9호선':[6,19.5],'GTX-A':[8,23.5],'경강선':[4,20],'경의중앙선':[8,20],'경춘선':[8,20],'공항철도':[6,22],'김포골드라인':[2,13],'서해선':[4,20],'수인분당선':[6,20],'신림선':[3,13],'신분당선':[6,19.5],'에버라인선':[1,12],'우이신설선':[2,13],'의정부선':[2,13],'인천1호선':[8,18],'인천2호선':[2,18]};
function planTrain(t){
  const s=stationByLine.get(`${t.line}:${key(t.station)}`);if(!s)return null;
  // Only move as far as the feed implies: the reported station may be left (after its dwell),
  // but the next station is only reached, never departed, until fresh data says so.
  const r=route(t,s),previous=r.previous,ahead=r.ahead.slice(0,2),status=normStatus(t.status),phases=[];
  const run=(from,to,k0=0,k1=1,dur=segmentSeconds(from,to,t.line))=>phases.push({from,to,k0,k1,dur,ease:k0===0&&k1===1});
  const DWELL=dwellFor(t.line),dwell=(at,i)=>{const nx=ahead[i+1];phases.push(nx?{from:at,to:nx,k0:0,k1:0,dur:DWELL}:{from:previous&&i===0?previous:ahead[i-1]||at,to:at,k0:1,k1:1,dur:DWELL})};
  // 진입 → 도착 reports are ~53 s apart in the live feed (921 samples, 2026-09-24 evening): start the
  // approach three-quarters along and take up to 50 s to stop.
  if(status==='진입'&&previous)run(previous,s,.75,1,Math.min(50,segmentSeconds(previous,s,t.line)*.55));
  if(status==='전역출발'&&previous)run(previous,s);
  if(status!=='출발')dwell(s,0);
  for(let i=0;i<ahead.length-1;i++){run(ahead[i],ahead[i+1]);if(i+1<ahead.length-1)dwell(ahead[i+1],i+1)}
  // Hold at the last station we are willing to predict (destination or MAX hops) until fresh data arrives.
  const last=ahead[ahead.length-1],before=ahead.length>1?ahead[ahead.length-2]:previous;
  phases.push(before?{from:before,to:last,k0:1,k1:1,dur:Infinity}:{from:last,to:last,k0:0,k1:0,dur:Infinity});
  // Stations the train runs through, in travel order; every phase goes from seq[i] to seq[i+1].
  // The geometry runs past where motion stops so a train held at a station keeps its full length.
  const seq=previous?[previous,...r.ahead]:[...r.ahead],cum=[0];
  for(let i=1;i<seq.length;i++)cum.push(cum[i-1]+geom(t.line,seq[i-1].id,seq[i].id).total);
  const [cars,carMetres]=CONSIST[t.line]||[8,20];
  return {t,id:`${t.line}:${t.trainNo}`,phases,seq,cum,cars,carMetres};
}
// Where the middle of the train is, as a distance (mercator units) along plan.seq.
function trainPose(p){
  let el=age(p.t.receivedAt),ph=p.phases[p.phases.length-1];
  for(const x of p.phases){if(el<x.dur){ph=x;break}el-=x.dur}
  const u=ph.dur===Infinity?1:Math.min(1,el/ph.dur),k=ph.k0+(ph.k1-ph.k0)*(ph.ease?smooth(u):u);
  const i=Math.max(0,p.seq.indexOf(ph.from)),len=(p.cum[i+1]??p.cum[i])-p.cum[i];
  return {dist:p.cum[i]+len*(ph.from===ph.to?0:k),moving:ph.k0!==ph.k1};
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
  gl_Position=u_matrix*vec4(a_pos.xy+u_offset,u_shadow>.5?0.:a_pos.z,1.);}`;
const TRAIN_FS=`#version 300 es
precision highp float;
in vec2 v_local;flat in vec4 v_info;flat in vec3 v_color;flat in float v_face;
uniform float u_shadow;out vec4 outColor;
float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float ink(float d){float a=max(.18,fwidth(d)*.65);return 1.-smoothstep(-a,a,d);}
float rect(vec2 p,vec2 c,vec2 b){return ink(box(p-c,b));}
float stroke(float d,float w){return ink(abs(d)-w);}
void main(){
  float L=v_info.x,W=v_info.y,kind=mod(v_info.z,4.),carPx=v_info.w,H=W*.68;
  bool front=mod(kind,2.)>.5,back=kind>1.5;
  vec2 p=v_local;vec3 col;float alpha=1.;
  float endX=min(back?p.x:1e5,front?L-p.x:1e5);
  float nose=W*.48,halfW=W*.5;
  float localL=carPx>0.?carPx:L;
  float detail=smoothstep(W*1.1,W*2.5,localL);
  // Rounded cab corners only: inter-car ends remain square. Signed distance in pixels.
  float radius=W*.36;
  vec2 cab=vec2(radius-endX,abs(p.y)-(halfW-radius));
  float rounded=length(max(cab,0.))+min(max(cab.x,cab.y),0.)-radius;
  float edge=max(max(-p.x,p.x-L),max(abs(p.y)-halfW,rounded));
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
      // Sloping dark cab glass, narrow destination display and coloured nose apron.
      col=mix(v_color,vec3(.82,.88,.89),.16);
      float glass=rect(vec2(endX,p.y),vec2(nose*.66,0),vec2(nose*.24,W*.32));
      col=mix(col,vec3(.055,.13,.18),glass);
      col=mix(col,vec3(.30,.43,.49),glass*rect(vec2(endX,p.y),vec2(nose*.73,-W*.13),vec2(.28,W*.18)));
      col=mix(col,vec3(.12,.19,.23),stroke(p.y,.16)*glass*detail);
      col=mix(col,vec3(.96,.66,.20),rect(vec2(endX,p.y),vec2(nose*.89,0),vec2(.22,W*.12))*detail);
      vec3 lamp=p.x<L*.5?vec3(1.,.12,.10):vec3(1.,.98,.79);
      col=mix(col,lamp,rect(vec2(endX,abs(p.y)),vec2(.60,W*.32),vec2(.30,.40)));
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
      col=mix(vec3(.67,.74,.77),v_color,ink(abs(z-H*.39)-H*.085));
      col=mix(col,vec3(.08,.19,.25),rect(vec2(endX,z),vec2(nose*.9,H*.72),vec2(nose*.52,H*.16)));
      if(z<1.4)col=vec3(.16,.22,.25);
    }
    vec3 simpleSide=mix(vec3(.65,.72,.75),v_color,ink(abs(z-H*.45)-H*.15));
    simpleSide=mix(simpleSide,vec3(.13,.24,.29),ink(abs(z-H*.74)-H*.13));
    col=mix(simpleSide,col,detail);
    if(carPx>0.)col=mix(col,vec3(.34,.42,.46),ink(min(x,carPx-x)-.25)*detail);
  }else if(v_face<3.5){
    // End wall under the raked windscreen: coloured mask, lights, coupler and anti-climber.
    float z=p.y;col=mix(v_color,vec3(.12,.20,.24),.14);
    col=mix(col,vec3(.73,.79,.81),ink(abs(z-1.6)-.5));
    col=mix(col,vec3(.13,.19,.23),1.-smoothstep(.6,1.1,z));
    vec3 lamp=v_face<2.5?vec3(1.,.98,.80):vec3(1.,.12,.09);
    col=mix(col,vec3(.13,.20,.23),rect(vec2(abs(p.x),z),vec2(W*.31,H*.33),vec2(1.05,.85)));
    col=mix(col,lamp,rect(vec2(abs(p.x),z),vec2(W*.31,H*.33),vec2(.66,.42)));
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
    this.uni=Object.fromEntries(['u_matrix','u_offset','u_shadow'].map(n=>[n,gl.getUniformLocation(this.p,n)]));
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
  cabWall(front,side,H){
    const W=this.width,r=W*.36,nose=W*.48,low=H*.44;
    let x=0,y=W*.5-r,z=low;
    for(let i=1;i<=4;i++){
      const t=i/4,xx=r*(1-Math.cos(t*Math.PI/2)),yy=W*.5-r+r*Math.sin(t*Math.PI/2),zz=low+(H-low)*xx/nose;
      this.wall(front?this.length-x:x,front?this.length-xx:xx,z,zz,side*y,1,side*yy);
      x=xx;y=yy;z=zz;
    }
    this.wall(front?this.length-r:r,front?this.length-nose:nose,z,H,side*W*.5);
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
    let animating=false;
    for(const plan of plans){
      const pose=trainPose(plan),mid=trackPoint(plan,pose.dist),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits();
      // Fresh data: glide from where the old prediction had the train instead of teleporting.
      let shiftX=0,shiftY=0;
      if(plan.blend){const w=(performance.now()-plan.blend.at)/BLEND_MS;if(w<1){const e=1-smooth(w);shiftX=(plan.blend.x-mid.x)*e;shiftY=(plan.blend.y-mid.y)*e;animating=true}else plan.blend=null}
      if(pose.moving)animating=true;
      const previous=lastPose.get(plan.id);
      if(previous){previous.x=mid.x+shiftX;previous.y=mid.y+shiftY}else lastPose.set(plan.id,{x:mid.x+shiftX,y:mid.y+shiftY});
      // off-screen test with the train's half length as margin: zoomed in, a train is longer than the screen
      const reach=pad+Math.max(plan.cars*plan.carMetres*m,MIN_PX*unit)/2+lanePx*unit;
      if(mid.x<lo.x-reach||mid.x>hi.x+reach||mid.y>lo.y+reach||mid.y<hi.y-reach)continue;
      const n=plan.cars,real=n*plan.carMetres*m,total=Math.max(real,MIN_PX*unit),car=total/n,tail=pose.dist-total/2;
      let color=this.rgb.get(plan.t.line);if(!color){color=hexRGB(colors[plan.t.line]);this.rgb.set(plan.t.line,color)}this.color=color;
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
            if(alongCamera>0)this.end(L,front?w-bodyPx*.36:w,front?low:H,front?2:5);
            this.wall(a,b,H,H,side*w);
            if(back)this.cabWall(false,side,H);
            if(front)this.cabWall(true,side,H);
          }
          this.roof(a,b,H,H,w);
          if(back)this.roof(0,a,low,H,w);
          if(front)this.roof(b,L,H,low,w);
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
          if(alongCamera>0)this.end(L,w-bodyPx*.36,low,2);
          this.wall(nose,L-nose,H,H,side*w);
          this.cabWall(false,side,H);
          this.cabWall(true,side,H);
        }
        this.roof(nose,L-nose,H,H,w+MARGIN);
        this.roof(0,nose,low,H,w+MARGIN);
        this.roof(L-nose,L,H,low,w+MARGIN);
        this.roof(-MARGIN,0,low,low,w+MARGIN);
        this.roof(L,L+MARGIN,low,low,w+MARGIN);
      }
    }
    if(this.used){
      gl.useProgram(this.p);
      const M=options.defaultProjectionData.mainMatrix,MT=this.matrix;MT.set(M);
      for(let r=0;r<4;r++)MT[12+r]=M[r]*ox+M[4+r]*oy+M[12+r]; // M · translate(origin), evaluated in double precision
      gl.uniformMatrix4fv(this.uni.u_matrix,false,MT);
      // Depth: test against what 3D buildings wrote (so a building in front hides the train) but never
      // write — the model's own faces are still ordered by the painter's pass above.
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.b);
      if(this.gpuCapacity!==this.data.length){gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);this.gpuCapacity=this.data.length}
      gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.used);
      const S=52,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off)};
      ptr('a_pos',3,0);ptr('a_local',2,12);ptr('a_info',4,20);ptr('a_color',3,36);ptr('a_face',1,48);
      gl.uniform2f(this.uni.u_offset,sunTrainShadow[0]*unit,sunTrainShadow[1]*unit);gl.uniform1f(this.uni.u_shadow,1);gl.drawArrays(gl.TRIANGLES,0,this.used/13);
      gl.uniform2f(this.uni.u_offset,0,0);gl.uniform1f(this.uni.u_shadow,0);gl.drawArrays(gl.TRIANGLES,0,this.used/13);
      // depth-only pass: record the train so the translucent buildings drawn later stay behind it where they should
      gl.depthMask(true);gl.colorMask(false,false,false,false);gl.drawArrays(gl.TRIANGLES,0,this.used/13);gl.colorMask(true,true,true,true);
    }
    if(!animating)for(const plan of plans){let duration=0;for(let i=0;i<plan.phases.length-1;i++)duration+=plan.phases[i].dur;if(age(plan.t.receivedAt)<duration){animating=true;break}}
    if(animating)this.map.triggerRepaint();
  }
  onRemove(map,gl){gl.deleteBuffer(this.b);gl.deleteProgram(this.p)}
}

// ---- train number labels ----------------------------------------------------------------
// From zoom 14.5, each train gets a small tag (number + destination) beside it, placed on the
// outer side of its lane. Elements are reused per train and repositioned on every rendered frame.
const LABEL_ZOOM=14.5,trainTags=new Map();
const tagLayer=document.createElement('div');tagLayer.className='train-tags';
document.head.insertAdjacentHTML('beforeend','<style>.train-tags{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2}.train-tag{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;transform:translate(-50%,-50%);white-space:nowrap;font:700 10.5px/1 "Noto Sans KR",sans-serif;color:#15252b;background:rgba(255,255,255,.92);border:1.5px solid var(--c);border-radius:9px;padding:2px 6px 2px 5px;box-shadow:0 1px 3px rgba(10,30,38,.25)}.train-tag b{color:var(--c);margin-right:3px}.train-roof{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;white-space:nowrap;font-family:"Noto Sans KR",sans-serif;font-weight:800;line-height:1;letter-spacing:.02em;color:#17262d;text-shadow:0 0 2px rgba(255,255,255,.9)}.train-roof[hidden]{display:none}.train-roof i{font-style:normal;font-weight:700;color:#33454d}.train-tag[hidden]{display:none}</style>');
// Number (and destination when there's room) written along the middle of the roof. In pitched
// views the text is lifted by the body height so it stays on the roof rather than the ground.
const ROOF_ZOOM=14,roofNums=new Map(),textWidth=(()=>{const c=document.createElement('canvas').getContext('2d');return (txt,px)=>{c.font=`800 ${px}px "Noto Sans KR",sans-serif`;return c.measureText(txt).width}})();
function updateTrainTags(){
  const z=map.getZoom(),show=trainsEnabled&&z>=ROOF_ZOOM,seen=new Set();
  if(show){
    const unit=1/(512*2**z),w=map.getCanvas().clientWidth,h=map.getCanvas().clientHeight,lane=laneOffsetPx(z),body=bodyWidthPx(z);
    const lift=body*.68*Math.sin(map.getPitch()*Math.PI/180),font=Math.max(8,Math.min(13,body*.6));
    const at=(plan,d,px)=>{const q=trackPoint(plan,d),o=(q.off+px)*unit;return map.project(new maplibregl.MercatorCoordinate(q.x+q.r[0]*o,q.y+q.r[1]*o,0).toLngLat())};
    for(const plan of plans){
      const pose=trainPose(plan),c=at(plan,pose.dist,lane);
      if(c.x<-120||c.y<-60||c.x>w+120||c.y>h+60)continue;
      const t=plan.t,m=mercStop(t.line,plan.seq[0]).meterInMercatorCoordinateUnits(),half=Math.max(plan.cars*plan.carMetres*m,TRAIN_MIN_PX*unit)/2;
      const A=at(plan,pose.dist-half,lane),B=at(plan,pose.dist+half,lane),len=Math.hypot(B.x-A.x,B.y-A.y);
      let ang=Math.atan2(B.y-A.y,B.x-A.x)*180/Math.PI;if(ang>90)ang-=180;else if(ang<-90)ang+=180;
      // fit: "번호 행선지" → "번호" → nothing, leaving room for the cab noses
      const room=len-body*1.6,full=`${t.trainNo} ${destLabel(t)}`.trim();
      const text=textWidth(full,font)<=room?full:textWidth(t.trainNo,font)<=room?t.trainNo:'';
      let el=roofNums.get(plan.id);
      if(!text){if(el)el.hidden=true;continue}
      if(!el){el=document.createElement('span');el.className='train-roof';el.onclick=ev=>{ev.stopPropagation();const pl=plans.find(x=>x.id===plan.id);if(pl)showTrainPopup(pl)};tagLayer.append(el);roofNums.set(plan.id,el)}
      if(el.dataset.k!==text){el.dataset.k=text;const sp=text.indexOf(' ');el.innerHTML=sp<0?esc(text):`${esc(text.slice(0,sp))}<i>${esc(text.slice(sp))}</i>`}
      el.style.fontSize=`${font.toFixed(1)}px`;
      el.style.transform=`translate(${c.x.toFixed(1)}px,${(c.y-lift).toFixed(1)}px) translate(-50%,-50%) rotate(${ang.toFixed(1)}deg)`;el.hidden=false;seen.add(plan.id);
    }
  }
  for(const [id,el] of roofNums)if(!seen.has(id)){if(!plans.some(p=>p.id===id)){el.remove();roofNums.delete(id)}else el.hidden=true}
  for(const [id,el] of trainTags){el.remove();trainTags.delete(id)}   // side tags retired: text now lives on the roof
}

// ---- train inspector ----------------------------------------------------------------------
// Click a train (or its tag): show the raw live-feed record next to what the map is doing with it.
function trainState(plan){
  let el=age(plan.t.receivedAt),ph=plan.phases[plan.phases.length-1],idx=plan.phases.length-1;
  for(let i=0;i<plan.phases.length;i++){const x=plan.phases[i];if(el<x.dur){ph=x;idx=i;break}el-=x.dur}
  if(ph.dur===Infinity)return `${ph.to.name}에서 대기 (예측 끝 · 다음 데이터 대기)`;
  const left=Math.max(0,ph.dur-el);
  if(ph.k0===ph.k1)return `${ph.k0===0?ph.from.name:ph.to.name} 정차 중 · 출발까지 ${Math.round(left)}초`;
  const k=ph.k0+(ph.k1-ph.k0)*Math.min(1,el/ph.dur);
  return `${ph.from.name} → ${ph.to.name} 주행 중 · ${Math.round(k*100)}% · 도착까지 ${Math.round(left)}초 (구간 ${Math.round((ph.k1-ph.k0)?ph.dur/(ph.k1-ph.k0):ph.dur)}초)`;
}
function showTrainPopup(plan){
  const t=plan.t,pose=trainPose(plan),q=trackPoint(plan,pose.dist),ll=new maplibregl.MercatorCoordinate(q.x,q.y,0).toLngLat();
  const a=Math.round(age(t.receivedAt)),kst=v=>v?new Date(v).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'-';
  const row=(k,v)=>`<tr><th>${k}</th><td>${v}</td></tr>`;
  const html=`<div class="popup train-inspect"><h3 style="color:${colors[t.line]}">${esc(t.line)} ${esc(t.trainNo)}</h3>
  <table><tbody>
  <tr><td colspan=2 class="sec">API 원본</td></tr>
  ${row('역',esc(t.station))}${row('상태',esc(t.status))}${row('방향',esc(t.direction))}${row('행선지',`${esc(t.destination||'-')}${/순환$/.test(t.destination||'')?` <span class="muted">(${esc(destLabel(t))})</span>`:''}`)}
  ${row('기록 시각',`${esc(String(t.receivedAt||'-').slice(11))} <span class="muted">(${a}초 전)</span>`)}
  ${row('급행/막차',`${t.express?'급행':'일반'}${t.last?' · 막차':''}`)}
  ${row('받은 시각',kst(liveFetchedAt))}
  <tr><td colspan=2 class="sec">지도 예측</td></tr>
  <tr><td colspan=2>${esc(trainState(plan))}</td></tr>
  ${row('예측 경로',esc(plan.seq.map(s=>s.name).join(' › ')))}
  </tbody></table></div>`;
  new maplibregl.Popup({maxWidth:'320px'}).setLngLat(ll).setHTML(html).addTo(map);
}
document.head.insertAdjacentHTML('beforeend','<style>.train-inspect table{border-collapse:collapse;font-size:12px;margin-top:4px}.train-inspect th{text-align:left;color:#6b7b80;font-weight:600;padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top}.train-inspect td{padding:2px 0}.train-inspect .sec{padding-top:8px;font-weight:800;color:#172429;border-bottom:1px solid #dbe1e2}.train-inspect .muted{color:#8a979b}</style>');
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
    placed.push(box);out.push({item,cx,cy,ang,bw,hgt,font,tw});
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
uniform vec2 u_view;out vec2 v_local;out vec2 v_size;out vec4 v_uv;out vec3 v_color;out vec2 v_tw;
void main(){v_local=a_local;v_size=a_size;v_uv=a_uv;v_color=a_color;v_tw=a_tw;gl_Position=vec4(a_px.x/u_view.x*2.-1.,1.-a_px.y/u_view.y*2.,0.,1.);}`;
    const fs=`#version 300 es
precision highp float;in vec2 v_local;in vec2 v_size;in vec4 v_uv;in vec3 v_color;in vec2 v_tw;uniform sampler2D u_tex;uniform float u_dpr;uniform float u_dark;out vec4 o;
void main(){
  vec2 d=v_size*.5-abs(v_local);                         // px to the box edge
  // rounded rectangle: white fill, line-colour border, dark name
  float r=abs(v_size.x-v_size.y)<.5?v_size.x*.5:min(v_size.y*.32,v_size.x*.5),border=(abs(v_size.x-v_size.y)<.5?1.8:2.2)*u_dpr;   // square box → dot
  vec2 q=abs(v_local)-(v_size*.5-r);float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-r;
  float cover=clamp(.5-sd,0.,1.);if(cover<=0.)discard;
  vec3 fill=mix(vec3(1.),vec3(.12,.17,.2),u_dark),ink=mix(vec3(.11,.17,.19),vec3(.93,.96,.97),u_dark);   // dark mode: dark box, light name
  vec3 col=mix(fill,v_color,smoothstep(-border-.8,-border+.8,sd));
  if(v_tw.x>0.){vec2 t=(v_local+v_tw*.5)/v_tw;   // v_tw = text cell size (width, font × row ratio)
    if(t.x>0.&&t.x<1.&&t.y>0.&&t.y<1.){float a=texture(u_tex,vec2(mix(v_uv.x,v_uv.z,t.x),mix(v_uv.y,v_uv.w,t.y))).a;col=mix(col,ink,a);}}
  o=vec4(col*cover,cover);
}`;
    const sh=(type,src)=>{const x=gl.createShader(type);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.p);
    if(!gl.getProgramParameter(this.p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.p));
    this.b=gl.createBuffer();this.tex=gl.createTexture();
    this.attr=Object.fromEntries(['a_px','a_local','a_size','a_uv','a_color','a_tw'].map(n=>[n,gl.getAttribLocation(this.p,n)]));
    this.uni=Object.fromEntries(['u_view','u_tex','u_dpr','u_dark'].map(n=>[n,gl.getUniformLocation(this.p,n)]));
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
  render(gl){
    if(!stationRects.size)return;
    this.buildAtlas(gl);
    const cv=map.getCanvas(),dpr=cv.width/cv.clientWidth,data=[],hgt=stationWidthPx(map.getZoom());
    const quad=(cx,cy,ang,bw,h,uv,col,tw,th)=>{const c=Math.cos(ang),s_=Math.sin(ang),hw=bw/2,hh=h/2;
      const corner=(lx,ly)=>[(cx+lx*c-ly*s_)*dpr,(cy+lx*s_+ly*c)*dpr,lx*dpr,ly*dpr,bw*dpr,h*dpr,uv[0],uv[1],uv[2],uv[3],...col,tw,th];
      const q=[corner(-hw,-hh),corner(hw,-hh),corner(hw,hh),corner(-hw,hh)];for(const i of [0,1,2,0,2,3])data.push(...q[i])};
    // zoomed out (phone ≤ 12, desktop ≤ 13): each platform is just a dot, no names
    const pointsOnly=map.getZoom()<=(matchMedia('(max-width:720px),(pointer:coarse)').matches?12:13),dot=Math.max(7,Math.min(10,hgt*.55));
    // every platform of the visible lines, as a plain rounded box
    const cw=cv.clientWidth,ch=cv.clientHeight;
    for(const [k,r] of stationRects){
      const line=k.slice(0,k.lastIndexOf(':'));if(selected!=='all'&&line!==selected)continue;
      const p0=map.project(r.coords[0]),p1=map.project(r.coords[r.coords.length-1]);
      let dx=p1.x-p0.x,dy=p1.y-p0.y;const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
      const cx=(p0.x+p1.x)/2-dy*r.offset,cy=(p0.y+p1.y)/2+dx*r.offset;if(cx<-60||cy<-60||cx>cw+60||cy>ch+60)continue;
      if(pointsOnly)quad(cx,cy,0,dot,dot,[0,0,0,0],hexRGB3(colors[line]||'#52646a'),0,0);
      else quad(cx,cy,Math.atan2(dy,dx),Math.max(len,hgt),hgt,[0,0,0,0],hexRGB3(colors[line]||'#52646a'),0,0);
    }
    if(!pointsOnly)for(const L of layoutLabels()){
      const uv=this.uv.get(L.item.text);if(!uv)continue;
      quad(L.cx,L.cy,L.ang,L.bw,L.hgt,uv,hexRGB3(colors[L.item.line]||'#52646a'),uv[4]*L.font*dpr,L.font*dpr*NAME_ROW/NAME_PX);
    }
    if(!data.length)return;
    gl.useProgram(this.p);gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
    const S=15*4,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off*4)};
    ptr('a_px',2,0);ptr('a_local',2,2);ptr('a_size',2,4);ptr('a_uv',4,6);ptr('a_color',3,10);ptr('a_tw',2,13);
    gl.uniform2f(this.uni.u_view,cv.width,cv.height);gl.uniform1f(this.uni.u_dpr,dpr);gl.uniform1f(this.uni.u_dark,document.documentElement.dataset.theme==='dark'?1:0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(this.uni.u_tex,0);
    gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
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
  selected=line;lineSelect.value=line;
  document.querySelectorAll('.line-btn').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.line===line)));
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
let liveOn=false,liveKey='',liveAt=0,liveFetchedAt=null;
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
    liveState.textContent=!liveOn?'줌 13 이상에서 실시간 열차를 표시합니다':'이 화면에는 운행 노선이 없습니다';
    return;
  }
  const key=lines.join(',');
  if(!force&&key===liveKey&&Date.now()-liveAt<30000)return; // same lines, fetched recently
  const request=++liveRequest;liveKey=key;liveAt=Date.now();
  if(!plans.length)liveState.textContent=`${lines.join(' · ')} 열차 위치 확인 중`;
  try{
    const r=await fetch(`./api/live?lines=${encodeURIComponent(key)}`,{cache:'no-store'}),d=await r.json();
    if(request!==liveRequest)return; // a newer view or selection superseded this response
    if(!r.ok||!d.ok)throw Error(d.error||r.status);
    // A record not refreshed for 10 minutes is a train the feed lost track of (or one that left
    // service); extrapolating it would park a ghost train somewhere down the line.
    const all=d.trains||[];trains=all.filter(t=>age(t.receivedAt)<=STALE_SECONDS);const stale=all.length-trains.length;
    // Fresh data replaces positions outright (no glide from the old prediction).
    liveFetchedAt=d.fetchedAt;learnDirections(trains);plans=trains.map(planTrain).filter(Boolean);lastPose.clear();
    const unplaced=trains.length-plans.length,shown=d.lines||lines;
    liveState.textContent=`추정 위치 ${plans.length}대${unplaced?` (역 미확인 ${unplaced})`:''}${stale?` (오래된 기록 ${stale} 제외)`:''} · ${shown.join(' · ')} · ${new Date(d.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}`;
    map.triggerRepaint();
  }catch{if(request===liveRequest){liveKey='';liveState.textContent='실시간 위치 연결 실패 · 잠시 후 재시도'}}
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
  map.on('click',e=>{if(map.queryRenderedFeatures(e.point,{layers:['stations','stations-casing']}).length)return;const pl=pickTrain(e.point);if(pl)showTrainPopup(pl)});
  map.on('click','stations',e=>{const pl=pickTrain(e.point);if(pl){showTrainPopup(pl);return}const p=e.features[0].properties;new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<div class="popup"><h3>${esc(p.name)}</h3><div>${esc(p.lines.replaceAll('|',' · '))}</div></div>`).addTo(map)});
  map.on('mouseenter','stations',()=>map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','stations',()=>map.getCanvas().style.cursor='');
  ready=true;
  {const g=document.createElement('div');g.className='maplibregl-ctrl maplibregl-ctrl-group';g.append($('toggleMap'),$('toggleTrains'),$('toggleTheme'));map.getContainer().querySelector('.maplibregl-ctrl-top-right').append(g)}
  // recompute shadows when the view settles or building tiles arrive (debounced)
  let sunTimer=0;const sunSoon=()=>{clearTimeout(sunTimer);sunTimer=setTimeout(updateSun,400)};
  map.on('moveend',sunSoon);map.on('sourcedata',e=>{if(e.sourceId==='ofm'&&e.isSourceLoaded&&e.tile)sunSoon()});
  addBasemap();{const t=$('toggleMap');t.setAttribute('aria-pressed','true');iconButton(t,'map','배경 지도 끄기')}   // background map on by default
  applyTheme();
  map.getContainer().append(tagLayer,sunBadge);map.on('render',updateTrainTags);
  if(pendingLine)filterLine(pendingLine);else{rebuildLabels();refreshLive(true)}
});

lineSelect.onchange=e=>filterLine(e.target.value);
$('resetFilter').onclick=()=>{$('search').value='';filterLine('all')};
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
.webgl-zoom{top:auto!important;bottom:18px;right:10px!important}   /* zoom readout: bottom right */
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
function seoulSun(date=new Date()){
  // solar noon of the *Seoul* calendar day (KST = UTC+9); using the UTC day picked yesterday before 09:00 KST
  const KST=9*3600e3,noon=Math.floor((date.getTime()+KST)/864e5)*864e5-KST+12*3600e3;
  const rad=Math.PI/180,lat=37.5665,lon=126.978,J=noon/864e5+2440587.5,n=Math.round(J-2451545+.0008);
  const Js=n-lon/360,M=(357.5291+.98560028*Js)%360,C=1.9148*Math.sin(M*rad)+.02*Math.sin(2*M*rad)+.0003*Math.sin(3*M*rad);
  const L=(M+C+282.9372)%360,Jt=2451545+Js+.0053*Math.sin(M*rad)-.0069*Math.sin(2*L*rad),d=Math.asin(Math.sin(L*rad)*Math.sin(23.44*rad));
  const w=Math.acos((Math.sin(-.833*rad)-Math.sin(lat*rad)*Math.sin(d))/(Math.cos(lat*rad)*Math.cos(d)))/rad;
  const toDate=j=>new Date((j-2440587.5)*864e5);return {rise:toDate(Jt-w/360),set:toDate(Jt+w/360)};
}
function effectiveTheme(){if(themeChoice!=='auto')return themeChoice;const now=new Date(),{rise,set}=seoulSun(now);return now>=rise&&now<set?'light':'dark'}
function applyTheme(){
  const t=effectiveTheme(),P=MAP_THEMES[t];
  document.documentElement.dataset.theme=t;
  const btn=$('toggleTheme');if(btn)iconButton(btn,themeChoice==='auto'?'auto':t==='dark'?'moon':'sun',themeChoice==='auto'?`테마: 자동 (지금 ${t==='dark'?'다크':'라이트'}) · 눌러서 라이트로`:t==='dark'?'테마: 다크 · 눌러서 자동으로':'테마: 라이트 · 눌러서 다크로');
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
{
  const b=document.createElement('button');b.id='toggleTheme';b.type='button';b.className='map-toggle theme-toggle';b.title='자동 → 라이트 → 다크 순서로 바뀌어요. 자동은 해 뜨면 라이트, 해 지면 다크.';
  b.onclick=()=>{themeChoice={auto:'light',light:'dark',dark:'auto'}[themeChoice]||'auto';try{localStorage.setItem(THEME_KEY,themeChoice)}catch{}applyTheme()};
  $('toggleTrains').after(b);
}
setInterval(()=>{if(themeChoice==='auto')applyTheme();updateSun();updateSunBadge()},5*60*1000);

// ---- sunrise / sunset badge (bottom right) -------------------------------------------------
// A tiny sky: horizon line, the day's arc, and the sun at its place along it (the moon below at night).
const sunBadge=document.createElement('div');sunBadge.className='sun-badge';sunBadge.setAttribute('role','img');
document.head.insertAdjacentHTML('beforeend',`<style>
.sun-badge{position:absolute;z-index:5;right:64px;bottom:18px;display:flex;align-items:center;gap:6px;padding:3px 8px 3px 5px;border:1px solid #8e9b9f;border-radius:4px;background:#fff;color:#33434a;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}
.sun-badge svg{display:block}
html[data-theme=dark] .sun-badge{background:#152026;color:#dbe5e8;border-color:#3a4b52}
@media (max-width:720px),(pointer:coarse){.sun-badge .times{display:none}.sun-badge{padding:3px 5px}}
</style>`);
function updateSunBadge(){
  const now=window.__sunTime||new Date(),{rise,set}=seoulSun(now),hm=d=>d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
  const day=now>=rise&&now<set,t=day?(now-rise)/(set-rise):0;
  const W=34,H=20,cx=W/2,cy=H-3,R=13;let x,y,body;
  if(day){const a=Math.PI*(1-t);x=cx+R*Math.cos(a);y=cy-R*Math.sin(a);
    body=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="#f5a524" stroke="#d98a0b" stroke-width="1"/>`}
  else{x=cx;y=cy+.5;body=`<path d="M${cx+2.6} ${cy-7.5}a4 4 0 1 0 2.6 6.4a3.2 3.2 0 1 1-2.6-6.4z" fill="#9fb4c8"/>`}
  sunBadge.innerHTML=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="M${cx-R} ${cy}A${R} ${R} 0 0 1 ${cx+R} ${cy}" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="2 2"/>
    <line x1="2" y1="${cy}" x2="${W-2}" y2="${cy}" stroke="currentColor" stroke-opacity=".6" stroke-width="1.2"/>${body}</svg>
    <span class="times">일출 ${hm(rise)} · 일몰 ${hm(set)}</span>`;
  const label=`서울 일출 ${hm(rise)}, 일몰 ${hm(set)} (${day?'낮':'밤'})`;sunBadge.title=label;sunBadge.setAttribute('aria-label',label);
}
updateSunBadge();

// ---- sun light and shadows ----------------------------------------------------------------
// Real-time sun position over Seoul drives building face lighting (map light) and ground shadows:
// each building footprint is swept away from the sun by height ÷ tan(elevation) and the hull drawn
// on the ground under the lines. Trains cast their shadow the same way. No shadows after sunset.
let sunTrainShadow=[1.1,1.5];
function sunPosition(date=window.__sunTime||new Date()){   // __sunTime: preview another time of day
  const rad=Math.PI/180,lat=37.5665*rad,lon=126.978,d=date.getTime()/864e5-10957.5;   // days since J2000.0
  const g=(357.529+.98560028*d)*rad,q=280.459+.98564736*d,L=(q+1.915*Math.sin(g)+.02*Math.sin(2*g))*rad,e=(23.439-3.6e-7*d)*rad;
  const ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)),dec=Math.asin(Math.sin(e)*Math.sin(L));
  const gmst=(18.697374558+24.06570982441908*d)%24,H=((gmst*15+lon)*rad-ra);
  const el=Math.asin(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(H));
  const az=Math.atan2(-Math.sin(H),Math.tan(dec)*Math.cos(lat)-Math.sin(lat)*Math.cos(H));   // from north, clockwise
  return {elevation:el/rad,azimuth:((az/rad)+360)%360};
}
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
  const phone=matchMedia('(max-width:720px),(pointer:coarse)').matches?.6:1;
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
  map.addLayer({id:'bm-bld3d',type:'fill-extrusion',source:'ofm','source-layer':'building',minzoom:14,paint:{'fill-extrusion-color':'#d9dde0','fill-extrusion-height':['interpolate',['linear'],['zoom'],14,0,15,['coalesce',['get','render_height'],10]],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.5}});
  L({id:'bm-road-minor',type:'line',source:'ofm','source-layer':'transportation',minzoom:14,filter:['in',['get','class'],['literal',['tertiary','minor']]],paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],14,.6,17,3],'line-opacity':.8}});
  L({id:'bm-road-major',type:'line',source:'ofm','source-layer':'transportation',filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary']]],paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],10,.8,14,3,17,9]}});
  // labels: glyphs from OpenFreeMap for Latin; Hangul is drawn with the device's own font (localIdeographFontFamily)
  try{map.setGlyphs('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf')}catch{}
  const name=['coalesce',['get','name:ko'],['get','name']],font=['Noto Sans Regular'],halo={'text-halo-color':'rgba(255,255,255,.9)','text-halo-width':1.4};
  L({id:'bm-rail',type:'line',source:'ofm','source-layer':'transportation',filter:['==',['get','class'],'rail'],minzoom:12,paint:{'line-color':'#c3cbcf','line-width':1.2,'line-dasharray':[3,2]}});
  // symbols sit under the route lines so map text never covers lines, stations or trains
  const sym=(id,layer,filter,minzoom,layout,paint)=>map.addLayer({id,type:'symbol',source:'ofm','source-layer':layer,...(filter?{filter}:{}),minzoom,layout:{'text-field':name,'text-font':font,...layout},paint:{...halo,...paint}},'routes');
  sym('bm-label-water','water_name',null,11,{'text-size':12,'text-letter-spacing':.1},{'text-color':'#5d8aa3'});
  sym('bm-label-park','park',null,14,{'text-size':11,'symbol-placement':'point'},{'text-color':'#5f8a5a'});
  sym('bm-label-road','transportation_name',['in',['get','class'],['literal',['motorway','trunk','primary','secondary','tertiary']]],13,{'text-size':['interpolate',['linear'],['zoom'],13,10,17,13],'symbol-placement':'line','text-max-angle':30},{'text-color':'#7a8589'});
  sym('bm-label-poi','poi',['all',['<=',['get','rank'],8],['in',['get','class'],['literal',['college','school','hospital','park','stadium','castle','monument','museum','townhall','attraction']]]],15,{'text-size':11,'text-anchor':'top','text-offset':[0,.3]},{'text-color':'#8a7f6d'});
  sym('bm-label-place','place',['in',['get','class'],['literal',['city','town','suburb','quarter','neighbourhood']]],10,{'text-size':['match',['get','class'],'suburb',14,'quarter',12,'neighbourhood',11,15],'text-letter-spacing':.05},{'text-color':'#56656a'});
  document.querySelector('.provenance')?.insertAdjacentHTML('beforeend',' 배경 지도 © OpenMapTiles © OpenStreetMap contributors.');
  applyTheme();
}
$('toggleMap').onclick=e=>{
  if(!ready)return;
  const on=e.currentTarget.getAttribute('aria-pressed')!=='true';
  e.currentTarget.setAttribute('aria-pressed',String(on));iconButton(e.currentTarget,'map',on?'배경 지도 끄기':'배경 지도 켜기');
  if(on&&!map.getSource('ofm'))addBasemap();
  for(const id of BASEMAP_LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none');
  updateSun();
};
$('toggleTrains').onclick=e=>{trainsEnabled=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(trainsEnabled));iconButton(e.currentTarget,'train',trainsEnabled?'열차 숨기기':'열차 보이기');map.triggerRepaint()};
iconButton($('toggleTrains'),'train','열차 숨기기');iconButton($('toggleMap'),'map','배경 지도 켜기');
const zoom=()=>{const z=Math.round(map.getZoom()),el=$('zoomLevel');el.innerHTML=ICONS.zoom+`<span>${z}</span>`;el.title=`줌 ${z}`;el.setAttribute('aria-label',`줌 ${z}`)};zoom();
map.on('zoom',zoom);map.on('move',scheduleLabels);map.on('resize',scheduleLabels);
// Server caches ~90s and the upstream key has a daily quota: don't poll from background tabs.
// The proxy refreshes upstream every 90 s and serves its cache in between, so polling it often is
// free and picks up each upstream refresh within ~20 s.
setInterval(()=>{if(!document.hidden)refreshLive(true)},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLive(true)});
let liveMoveTimer=0;map.on('moveend',()=>{clearTimeout(liveMoveTimer);liveMoveTimer=setTimeout(()=>refreshLive(),600)});
window.__subwayWebGL={map,refreshLive,updateSun,updateSunBadge,sunPosition,trackPoint,edgeCoords,get plans(){return plans},get renderer(){return map.getCanvas().getContext('webgl2')?'webgl2':'none'}};
