// Seoul bus map contract v1: /data/bus/{routes,stops}.json and /api/bus/live.
// Selected routes sit below the subway. Buses and BUS posts share the train WebGL overlay.
import {buildBusPath, busPointAt, snapBusToPath, nextBusMotion, busMotionDistance,
  validCoordinate, intersects, contains} from './bus_motion.mjs';
import {BusRenderer, busMercator, projectBusPoint, busModelScale, busPostScale} from './bus_mesh.mjs';
import {BusRoadNetwork,busLinePointAt,busMetresPerPixel} from './bus_roads.mjs';
import {journeyCasingPaint,journeyRidePaint,journeyStopPaint} from './journey_map_style.mjs';

export const BUS_ZOOM = {routes: 0, buses: 15, stops: 15, labels: 16};
export const BUS_TYPES = {
  trunk: {name: '간선', light: '#3567C8', dark: '#7FAAFF'},
  branch: {name: '지선', light: '#328044', dark: '#7AC98C'},
  express: {name: '광역', light: '#C74744', dark: '#FA9991'},
  circular: {name: '순환', light: '#916900', dark: '#E8C455'},
  night: {name: '심야', light: '#3567C8', dark: '#7FAAFF'},
  airport: {name: '공항', light: '#63747B', dark: '#A4B5BB'},
  village: {name: '마을', light: '#328044', dark: '#7AC98C'},
  other: {name: '버스', light: '#63747B', dark: '#A4B5BB'},
};
const SOURCE_ROUTES = 'bus-routes';
const LAYERS = ['bus-route-casing','bus-route-road','bus-route-approx','bus-route-stop'];
const STALE_MS = 120000, EXPIRE_MS = 600000;
// #buslines: 노선 점검용. 서울 버스 노선 전체를 종류 색으로, z14 부터 번호까지 그린다(정류장은 BUS 간판이 있어 점을 찍지 않는다).
// 실제 화면과 같은 선: 도로에 맞춘 표시선, z15 부터는 화면 안을 심시티 도로 중심선에 붙인다.
// 선을 누르면 그 노선만 골라 버스 · 정류장을 위에 겹쳐 본다.
const SOURCE_CHECK = 'bus-check', CHECK_LAYERS = ['bus-check-line','bus-check-label'];
const collection = features => ({type: 'FeatureCollection', features});
const feature = (type, coordinates, properties) => ({type: 'Feature', geometry: {type, coordinates}, properties});
const text = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const boundsArray = bounds => [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
const padded = b => { const x = (b[2] - b[0]) * .12, y = (b[3] - b[1]) * .12; return [b[0] - x, b[1] - y, b[2] + x, b[3] + y]; };
const boundsOf = points => points.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
const color = (route, theme) => (BUS_TYPES[route.type] || BUS_TYPES.other)[theme];
const typeName = route => (BUS_TYPES[route.type] || BUS_TYPES.other).name;
const ARRIVAL_POLL_MS = 30000, ARRIVAL_POLLS = 10;   // 정류장을 연 동안 30초마다, 5분까지
// 서울시 도착 문구 '6분후[3번째 전]' · '[막차] 10분후[6번째 전]' · '운행종료' → 크게 쓸 때 · 작게 쓸 덧말
export function arrivalParts(bus) {
  let message = String(bus?.message || '').trim(), last = !!bus?.last;
  if (message.includes('[막차]')) { last = true; message = message.replace(/\[막차\]\s*/g, ''); }
  const where = message.match(/\[([^\]]+)\]\s*$/);
  const when = (where ? message.slice(0, where.index) : message).trim()
    .replace(/^(\d+)분(\d+초)?\s*후$/, '$1분 후').replace(/^\d+초\s*후$/, '곧 도착') || '도착 정보 없음';
  return {when, detail: [where?.[1], last && '막차'].filter(Boolean).join(' · ')};
}
// 곧 오는 순서: 곧 도착(그 안에서는 남은 초), 남은 초, 출발 · 회차 대기, 운행 종료 · 정보 없음은 맨 뒤
function arrivalRank(row) {
  const first = row?.buses?.[0], message = String(first?.message || ''), seconds = Number.isFinite(first?.seconds) ? first.seconds : 0;
  if (!first || /운행종료/.test(message)) return 3e6;
  if (/곧 도착/.test(message)) return Math.min(999, Math.max(0, seconds)) / 1000;
  return seconds > 0 && /분|초/.test(message) ? seconds : 2e6;
}
const isSoon = row => /곧 도착/.test(String(row?.buses?.[0]?.message || ''));
const isEnded = row => /운행종료/.test(String(row?.buses?.[0]?.message || ''));
// 남은 초 → '7분 12초' · '48초' · '도착 중'(0이 되면 새 정보가 올 때까지)
export function countdownText(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return s <= 0 ? '도착 중' : s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
}
const BUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M7 21v-3M17 21v-3"/></svg>';
const REFRESH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255);

export function prepareBusData(routes, stops) {
  if (routes?.schemaVersion !== 1 || stops?.schemaVersion !== 1 || !Array.isArray(routes.routes) || !Array.isArray(stops.stops)) {
    throw new Error('Unsupported bus data');
  }
  const stopById = new Map(), routeById = new Map(), routesByStop = new Map();
  for (const stop of stops.stops) {
    if (typeof stop.id !== 'string' || !validCoordinate([stop.lng, stop.lat])) continue;
    stopById.set(stop.id, {...stop, name: String(stop.name || '이름 없는 정류장')});
  }
  for (const raw of routes.routes) {
    if (typeof raw.id !== 'string' || !Array.isArray(raw.path) || raw.path.length < 2 || !raw.path.every(validCoordinate)) continue;
    const stopEntries = Array.isArray(raw.stopIds) ? raw.stopIds.map((id, i) => ({id, sequence: raw.stopSequences?.[i]})).filter(s => stopById.has(s.id)) : [];
    const route = {...raw, name: String(raw.name || raw.id), type: BUS_TYPES[raw.type] ? raw.type : 'other',
      stopIds: stopEntries.map(s => s.id), stopSequences: stopEntries.map(s => Number.isInteger(s.sequence) ? s.sequence : null),
      bbox: boundsOf(raw.path), approximate: raw.pathSource !== 'api', geometry: null};
    routeById.set(route.id, route);
    for (const id of new Set(route.stopIds)) {
      if (!routesByStop.has(id)) routesByStop.set(id, []);
      routesByStop.get(id).push(route);
    }
  }
  return {routeById, stopById, routesByStop, source: routes.source};
}

// Keep only segments touching the viewport. A long route's overall bbox is not enough:
// its two arms can straddle the whole screen without any of its roads being visible.
export function visibleBusRoutes(data, box, selected = null) {
  const found = [], cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  for (const route of data.routeById.values()) {
    if (!intersects(route.bbox, box)) continue;
    const parts = []; let part = null, rank = Infinity;
    for (let i = 1; i < route.path.length; i++) {
      const a = route.path[i - 1], b = route.path[i];
      if (!intersects([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], box)) { part = null; continue; }
      if (!part) { part = [a]; parts.push(part); } part.push(b);
      const dx = (b[0] - a[0]) * .8, dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((cx - a[0]) * .8 * dx + (cy - a[1]) * dy) / l2)) : 0;
      rank = Math.min(rank, ((a[0] + (b[0] - a[0]) * t - cx) * .8) ** 2 + (a[1] + (b[1] - a[1]) * t - cy) ** 2);
    }
    if (parts.length) found.push({route, parts, rank: route.id === selected ? -1 : rank});
  }
  return found.sort((a, b) => a.rank - b.rank || a.route.id.localeCompare(b.route.id));
}

export function busRequestURL(routeIds, selected = null) {
  const ids = [...new Set(routeIds)].slice(0, 8);
  const query = new URLSearchParams({routes: ids.join(',')});
  if (selected && ids.includes(selected)) query.set('focus', selected);
  return `/api/bus/live?${query}`;
}

export function busRoutesNearStops(data, box, chosen = [], screen = null) {
  const priority = [...new Set(chosen)].filter(id => data.routeById.has(id));
  if (priority.length) return priority.slice(0,8);
  const cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2,rank=new Map();
  for(const stop of data.stopById.values()) if(contains(box,[stop.lng,stop.lat])) {
    const point=screen?.project([stop.lng,stop.lat]);
    if(point&&(point.x<0||point.y<0||point.x>screen.width||point.y>screen.height))continue;
    const d=point?(point.x-screen.width/2)**2+(point.y-screen.height/2)**2:((stop.lng-cx)*.8)**2+(stop.lat-cy)**2;
    for(const route of data.routesByStop.get(stop.id)||[]) rank.set(route.id,Math.min(rank.get(route.id)??Infinity,d));
  }
  return [...rank].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).slice(0,8).map(([id])=>id);
}

// Legacy journey legs have names, not Seoul route IDs. Require a unique name AND
// matching endpoint geometry before using an official ID for live requests.
export function journeyBusRouteIds(data, legs) {
  if(!data)return [];
  const ids=[];
  for(const leg of legs) {
    if(leg.type!=='bus')continue;
    if(data.routeById.has(String(leg.routeId))){ids.push(String(leg.routeId));continue;}
    const matches=[...data.routeById.values()].filter(r=>r.name===String(leg.route));
    if(matches.length!==1||!leg.path?.length)continue;
    const path=buildBusPath(matches[0].path);
    if(path&&[leg.path[0],leg.path.at(-1)].every(p=>snapBusToPath(path,p,{maxError:350})))ids.push(matches[0].id);
  }
  return [...new Set(ids)].slice(0,8);
}

// 정류장 기둥(BUS 표지판)을 화면에 놓는다. features: 정류장 Point, exits: 출구 [lng,lat],
// view: {project(world,z), width, height, zoom, unit, origin, bearing, phone, selected}. → {posts, hits}
export function placeStopPosts(features, exits, view) {
  const {project,width,height,zoom,unit,origin,bearing=0,phone=false,selected=null}=view,posts=[],hits=[];
  const bounds=points=>[Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))];
  const pad=(r,x,y=x)=>[r[0]-x,r[1]-y,r[2]+x,r[3]+y];
  const hitBox=(r,minimum)=>{const cx=(r[0]+r[2])/2,cy=(r[1]+r[3])/2,w=Math.max(minimum,r[2]-r[0]+6),h=Math.max(minimum,r[3]-r[1]+6);return[cx-w/2,cy-h/2,cx+w/2,cy+h/2];};
  // Reserve the full screen silhouettes of nearby exit pillars before placing BUS signs.
  // 출구 기둥 폭은 화면 px 로 줌 16 에서 11 · 18 에서 17(maplibre_runtime PILLAR_PX): 그 절반 + 2px 만 비운다(손가락 칸 크기로 비우면 출구 옆 정류장이 빠졌다)
  const occupied=[],exitHeight=20+Math.max(0,Math.min(2,zoom-16))*8,exitHalf=(11+6*Math.max(0,Math.min(1,(zoom-16)/2)))/2+2;
  for(const coordinate of exits){
    const world=busMercator(coordinate),base=project(world,0),top=project(world,exitHeight*unit);
    if(base&&top)occupied.push(pad(bounds([base,top]),exitHalf,5));
  }
  const scale=busPostScale(zoom),c=Math.cos(bearing),s=Math.sin(bearing);
  const candidates=features.map(f=>({f,world:busMercator(f.geometry.coordinates)}));
  // Deterministic centre-first placement; a selected stop remains at the head of the list.
  candidates.sort((a,b)=>Number(b.f.properties.id===selected)-Number(a.f.properties.id===selected)||
    ((a.world[0]-origin[0])**2+(a.world[1]-origin[1])**2)-((b.world[0]-origin[0])**2+(b.world[1]-origin[1])**2));
  const placed=[];
  // 겹침은 보이는 기둥끼리만 본다. 손가락 칸(44px)으로 보면 붙어 있는 정류장을 빼서 강남역 줌 16 에서 24곳 중 13곳이 안 보였다(2026-10-08 덕배).
  // 손가락 칸은 겹쳐도 된다: 누르면 가운데가 가장 가까운 정류장이 골라진다
  // 줌 16 부터는 기둥이 반쯤 겹치는 것까지 그린다: 기둥이 실제 크기(약 15 m)로 커져 13 m 떨어진 정류장(강남역7번출구 · 강남역.삼성전자)은 어느 줌에서도 하나만 보였다
  const fits=world=>{
    const points=[];
    for(const x of [-7.5,7.5])for(const y of [-7.5,7.5])for(const z of [0,25.5]){
      const p=project([world[0]+(c*x-s*y)*scale*unit,world[1]+(s*x+c*y)*scale*unit],z*scale*unit);if(p)points.push(p);
    }
    if(points.length!==8)return null;const rectangle=bounds(points);
    if(!intersects(rectangle,[0,0,width,height]))return null;
    const spacing=pad(rectangle,2),base=project(world,0),postWidth=rectangle[2]-rectangle[0];
    const exit=occupied.find(r=>intersects(spacing,r));
    const crowded=zoom<16?placed.some(q=>intersects(spacing,q.spacing)):placed.some(q=>Math.hypot(q.base.x-base.x,q.base.y-base.y)<postWidth/2);
    return {world,rectangle,spacing,base,exit,crowded};
  };
  for(const {f,world} of candidates){
    let spot=fits(world);
    // 출구 기둥 자리에 찍힌 정류장(청담역 11번 출구 = 진흥아파트, 1 m)은 빼지 않고 기둥 옆으로 비켜 세운다(2026-10-09 덕배)
    // 줌 16 부터는 다른 정류장과 같은 자리(1~3 m, 석계역1번출구.A · B 등 서울 29쌍)여도 옆에 나란히 세운다
    if(spot&&(spot.exit||spot.crowded&&zoom>=16)){
      const block=spot.exit||placed.find(q=>Math.hypot(q.base.x-spot.base.x,q.base.y-spot.base.y)<(spot.rectangle[2]-spot.rectangle[0])/2)?.rectangle;
      const away=Math.sign((spot.rectangle[0]+spot.rectangle[2])-(block[0]+block[2]))||1;
      nudge:for(const k of [1,1.5,2,2.5])for(const side of [away,-away]){
        const d=15*k*side*scale*unit,moved=fits([world[0]+c*d,world[1]+s*d]);
        if(moved&&!moved.exit&&!moved.crowded){spot=moved;break nudge;}
      }
      if(spot.exit||spot.crowded)spot=null;
    }
    if(!spot||spot.exit||spot.crowded)continue;
    const touch=hitBox(spot.rectangle,phone?44:28);
    placed.push(spot);
    posts.push({world:spot.world,yaw:bearing,scale,rgb:[.25,.29,.30],selected:selected===f.properties.id});
    hits.push({id:f.properties.id,x:(touch[0]+touch[2])/2,y:(touch[1]+touch[3])/2,bounds:touch,visualBounds:spot.rectangle});
    if(posts.length>=(phone?700:1400))break;
  }
  return {posts,hits};
}

export function createBusLayer(options) { return new BusLayer(options); }

class BusLayer {
  constructor({map, phone = false, beforeId = 'routes', onSelect = () => {}, onClear = () => {}, fetcher = fetch,
    requestRender = () => map.triggerRepaint?.(), getExitCoordinates = () => [], onRouteSelect = () => {}}) {
    this.map = map; this.phone = phone; this.beforeId = beforeId; this.onSelect = onSelect; this.onClear = onClear;
    this.fetcher = (...args) => fetcher(...args); // Window.fetch must not receive the BusLayer as its receiver.
    this.requestRender=requestRender;this.getExitCoordinates=getExitCoordinates;this.renderer=new BusRenderer();
    this.stopHits=[];this.requested=[];this.journeyLegs=[];this.journeyIds=[];
    this.roads=new BusRoadNetwork();this.onRouteSelect=onRouteSelect;
    this.theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    this.enabled = false; this.disposed = false; this.data = null; this.visible = []; this.fleet = new Map(); this.hits = [];
    this.selectedRoute = null; this.selection = null; this.updateDetail = null; this.mode = 'unavailable'; this.status = '';
    this.pollMs = 30000; this.frame = 0; this.frameTimer = 0; this.pollTimer = 0; this.viewTimer = 0; this.freshnessTimer = 0; this.detailAt = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.nearby = document.getElementById('inspectNearbyBus');
    this.notice = document.createElement('p'); this.notice.className = 'bus-notice'; this.notice.hidden = true;
    this.notice.setAttribute('role', 'status'); map.getContainer().append(this.notice);
    this.check = /buslines/.test(globalThis.location?.hash || ''); this.installLayers();
    this.move = () => { clearTimeout(this.viewTimer); this.viewTimer = setTimeout(() => this.refreshView(), 200); };
    this.visibility = () => {
      this.stopLive();
      if (!document.hidden) this.refreshView(); else this.clearScene();
    };
    this.motionChanged = () => { this.stopAnimation(); this.draw(); };
    this.zoom = () => { if (!this.active()) this.stopLive(); this.draw(); this.updateStatus(); };
    this.inspect = () => this.inspectNearby();
    this.routeClick = event => {
      const button=event.target.closest?.('.bus-detail [data-bus-route], .bus-detail [data-bus-refresh]');if(!button)return;
      if(button.dataset.busRefresh!==undefined){this.refreshArrivals();return;}
      const id=button.dataset.busRoute;if(!this.data?.routeById.has(id))return;
      this.selectedRoute=this.selectedRoute===id?null:id;this.journeyLegs=[];this.journeyIds=[];
      this.refreshView();this.refreshDetail();
      this.onRouteSelect(this.selectedLeg());
      document.querySelector(`.bus-detail [data-bus-route="${id}"]`)?.focus({preventScroll:true});
    };
    this.remove = () => this.destroy();
    this.roadData=e=>{if(e.sourceId==='ofm'&&e.isSourceLoaded){clearTimeout(this.roadTimer);this.roadTimer=setTimeout(()=>{if(!map.isMoving?.())this.refreshView();},250);}};
    map.on('moveend', this.move); map.on('zoom', this.zoom); map.on('remove', this.remove);
    map.on('sourcedata',this.roadData);
    document.addEventListener('visibilitychange', this.visibility); this.reduced.addEventListener('change', this.motionChanged);
    document.addEventListener('click',this.routeClick);
    this.nearby?.addEventListener('click', this.inspect);
    // 화면 근처 버스를 늘 받지 않는다: 정류장을 누르면 도착 정보, 노선 번호를 누르면 그 노선 버스만 실시간(2026-10-07 행님)
    this.setEnabled(false);
    if (this.check) this.loadStatic();
  }

  installLayers() {
    const map = this.map;
    map.addSource(SOURCE_ROUTES, {type: 'geojson', data: collection([]), tolerance: 0, maxzoom: 18,
      attribution: '버스 노선·정류장 <a href="https://data.seoul.go.kr/dataList/OA-1095/F/1/datasetView.do" target="_blank" rel="noopener">서울특별시 열린데이터광장</a>'});
    const layout={'line-cap':'round','line-join':'round'},ride=['==',['get','kind'],'ride'];
    map.addLayer({id:LAYERS[0],type:'line',source:SOURCE_ROUTES,filter:ride,layout,paint:journeyCasingPaint({thin:true})});
    for (const approximate of [false, true]) map.addLayer({id: approximate ? LAYERS[2] : LAYERS[1], type: 'line', source: SOURCE_ROUTES,
      filter: ['all',ride,['==', ['get', 'approximate'], approximate]], layout,
      paint: {...journeyRidePaint({thin:true}), ...(approximate ? {'line-dasharray': [2, 2]} : {})}});
    map.addLayer({id:LAYERS[3],type:'circle',source:SOURCE_ROUTES,filter:['==',['get','kind'],'stop'],paint:journeyStopPaint()});
    this.raiseRoute();
    if (this.check) this.installCheckLayers();
  }

  installCheckLayers() {
    const map = this.map, before = map.getLayer(this.beforeId) ? this.beforeId : undefined;
    map.addSource(SOURCE_CHECK, {type: 'geojson', data: collection([]), tolerance: 0});
    const line = ['==', ['geometry-type'], 'LineString'];
    map.addLayer({id: CHECK_LAYERS[0], type: 'line', source: SOURCE_CHECK, filter: line, layout: {'line-cap': 'round', 'line-join': 'round'},
      paint: {'line-color': ['get', 'color'], 'line-opacity': .75, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, .8, 14, 1.6, 17, 3]}}, before);
    map.addLayer({id: CHECK_LAYERS[1], type: 'symbol', source: SOURCE_CHECK, minzoom: 14, filter: line,
      layout: {'symbol-placement': 'line', 'symbol-spacing': 260, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11},
      paint: {'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.6}}, before);
  }

  renderCheck() {
    if (!this.check || !this.data) return;
    // 공식 경로는 도로 중심선에서 중간값 6.5 m(10 m 넘게 22 %) 비껴 있어 점검 화면에서도 쓰지 않는다.
    const box = this.box, detail = !!box && this.map.getZoom() >= BUS_ZOOM.buses && !!this.map.querySourceFeatures;
    if (!detail && this.checkDetail === false) return; // 멀리서는 한 번 그린 전체 선 그대로
    this.checkDetail = detail;
    const features = [];
    for (const route of this.data.routeById.values()) {
      const properties = {routeId: route.id, name: route.name, color: color(route, this.theme)}, line = this.lineGeometry(route);
      if (!detail || !line) { features.push(feature('LineString', line?.points || route.path, properties)); continue; }
      if (!intersects(route.bbox, box)) continue;
      // 화면 안 구간만 도로에 붙여 그린다(전 노선 전체를 6 m 간격으로 보내지 않게).
      let part = [];
      const flush = () => { if (part.length > 1) features.push(feature('LineString', part, properties)); part = []; };
      for (const p of this.roads.snapLine(line, box).samples) { if (contains(box, p.coordinate)) part.push(p.coordinate); else flush(); }
      flush();
    }
    this.map.getSource(SOURCE_CHECK)?.setData(collection(features));
  }

  setTheme(theme) {
    if (this.disposed) return;
    this.theme = theme === 'dark' ? 'dark' : 'light';
    this.checkDetail = null; this.renderStatic(); this.renderCheck(); this.draw(); this.refreshDetail();
  }

  setEnabled(enabled) {
    if (this.disposed) return;
    this.enabled = !!enabled;
    if (!this.enabled && !this.chosenIds().length) {this.stopLive();this.fleet.clear();this.hits=[];}
    this.refreshView();this.draw();
    this.updateStatus();
  }

  async loadStatic() {
    if (this.loading || this.data || this.disposed) return;
    this.loading = true; this.status = ''; const controller = new AbortController(); this.staticController = controller; this.updateStatus();
    try {
      const read = async url => { const r = await this.fetcher(url, {signal: controller.signal}); if (!r.ok) throw new Error('Bus data unavailable'); return r.json(); };
      const results = await Promise.all([read('/data/bus/routes.json'), read('/data/bus/stops.json')]);
      if (controller.signal.aborted || this.disposed) return;
      this.data = prepareBusData(...results); this.loading = false;
      this.journeyIds=journeyBusRouteIds(this.data,this.journeyLegs);
      this.renderCheck(); this.refreshView();
    } catch (error) {
      if (!controller.signal.aborted) { this.loading = false; this.status = '버스 노선을 불러오지 못했어요 · 새로고침해 주세요'; this.updateStatus(); }
    } finally { if (this.staticController === controller) this.staticController = null; }
  }

  refreshView() {
    if (this.disposed || document.hidden) return;
    if (this.map.getZoom() < BUS_ZOOM.routes) { this.stopLive(); this.visible = []; this.renderStatic(); this.updateStatus(); return; }
    if (!this.data) { if(this.map.getZoom()>=BUS_ZOOM.stops||this.journeyLegs.length)this.loadStatic(); return; }
    this.box = padded(boundsArray(this.map.getBounds()));
    this.visible = visibleBusRoutes(this.data, this.box, this.selectedRoute);
    if(this.map.getZoom()>=BUS_ZOOM.buses&&(this.enabled||this.check||this.chosenIds().length)){
      try{this.roads.update(this.map.querySourceFeatures?.('ofm',{sourceLayer:'transportation'})||[]);}catch{/* Tiles may still be loading. */}
    }
    this.exitCoordinates=this.getExitCoordinates().filter(p=>contains(this.box,p));
    const canvas=this.map.getCanvas(),screen=this.map.project?{project:p=>this.map.project(p),width:canvas.clientWidth,height:canvas.clientHeight}:null;
    this.requested=this.enabled||this.chosenIds().length?busRoutesNearStops(this.data,boundsArray(this.map.getBounds()),this.chosenIds(),screen):[];
    this.renderStatic(); this.renderCheck(); this.draw(); this.updateStatus();
    const ids = this.requested, key = `${ids.join(',')}|${this.selectedRoute || this.journeyIds[0] || ''}`;
    if (!this.active() || !ids.length) { this.stopLive(); return; }
    if (key !== this.requestKey) { this.stopLive(); this.requestKey = key; this.pollLive(); }
    else if (!this.liveController && !this.pollTimer) this.pollLive();
    if (!this.freshnessTimer) this.freshnessTimer = setInterval(() => this.checkFreshness(), 30000);
  }

  renderStatic() {
    if (this.disposed) return;
    const features = [], stopFeatures = [], chosen=new Set(this.chosenIds());
    const drawRoute=(route,markers)=>{
      const properties={routeId:route.id,name:route.name,color:color(route,this.theme),kind:'ride',selected:true,approximate:route.approximate};
      // 지하철 노선처럼 끊김 없는 한 줄: 미리 도로 중앙선에 맞춘 선(pipeline/bus_match_lines.py),
      // 없으면 공식 경로. 화면 타일로 차로를 맞추던 조각선은 끊기고 갈고리가 생겨 쓰지 않는다.
      // 줌 15 이상은 그 선을 심시티가 그리는 도로 중심선에 다시 붙이고, 굵기는 도로 폭 안(laneWidth)으로.
      const line=this.lineGeometry(route),snapped=line&&this.map.getZoom()>=BUS_ZOOM.buses&&this.map.querySourceFeatures?this.snappedLine(route,line):null;
      if(!snapped)features.push(feature('LineString',line?.points||route.path,properties));
      else{
        let part=[],width=snapped.samples[0].width;
        const flush=()=>{if(part.length>1)features.push(feature('LineString',part,width?{...properties,laneWidth:width}:properties));};
        for(const p of snapped.samples){
          if(p.width!==width){flush();part=part.length?[part.at(-1)]:[];width=p.width;}
          part.push(p.coordinate);
        }flush();
      }
      for(const marker of markers){
        const snap=line&&snapBusToPath(line,marker.coordinate,{maxError:80});
        const at=snap&&(snapped?snapped.samples[Math.min(snapped.samples.length-1,Math.round(snap.distance/snapped.step))].coordinate:busPointAt(line,snap.distance).coordinate);
        features.push(feature('Point',at||marker.coordinate,{...properties,kind:'stop'}));
      }
    };
    for(const id of chosen){
      const route=this.data?.routeById.get(id);if(!route)continue;
      const path=this.geometry(route),legs=this.journeyLegs.filter(l=>journeyBusRouteIds(this.data,[l]).includes(id));
      // 노선 위 정류장 동그라미는 그리지 않는다(정류장은 BUS 기둥으로). 길찾기의 타는 곳 · 내리는 곳만 남긴다.
      const markers=legs.flatMap(l=>[l.path[0],l.path.at(-1)].map(coordinate=>({coordinate})));
      drawRoute(route,markers);
    }
    for(const leg of this.journeyLegs) if(!journeyBusRouteIds(this.data,[leg]).length){
      leg.displayRoute??={id:'',name:String(leg.route),path:leg.path,type:'other',approximate:true,stopIds:[]};
      drawRoute(leg.displayRoute,[leg.path[0],leg.path.at(-1)].map(coordinate=>({coordinate})));
    }
    // 정류장은 우리가 그리는 노선과 상관없이 화면 안의 것을 다 찍는다(마을버스 · 경기 버스만 서는 정류장도)
    if (this.data && this.box && this.map.getZoom() >= BUS_ZOOM.stops) for (const [id, stop] of this.data.stopById) {
      if (contains(this.box, [stop.lng, stop.lat])) stopFeatures.push(feature('Point', this.kerbside(stop), {id, name: stop.name}));
      if (stopFeatures.length >= (this.phone ? 700 : 1400)) break;
    }
    this.map.getSource(SOURCE_ROUTES)?.setData(collection(features));
    this.raiseRoute();
    this.stopFeatures = stopFeatures;
  }

  async pollLive() {
    clearTimeout(this.pollTimer); this.pollTimer = 0;
    if (this.liveController || !this.active() || !this.requested.length) return;
    const ids = this.requested, controller = new AbortController();
    this.liveController = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const r = await this.fetcher(busRequestURL(ids, this.selectedRoute||this.journeyIds[0]), {cache: 'no-store', signal: controller.signal});
      if (!r.ok) throw new Error('Bus live unavailable');
      const payload = await r.json();
      if (!controller.signal.aborted && this.active()) this.setLiveData(payload, ids);
    } catch {
      if (this.liveController === controller && this.active()) {
        this.mode = 'error'; for (const bus of this.fleet.values()) this.freeze(bus);
        this.updateStatus(); this.refreshDetail(); this.draw();
      }
    } finally {
      clearTimeout(timeout);
      if (this.liveController === controller) {
        this.liveController = null;
        if (this.active()) this.pollTimer = setTimeout(() => this.pollLive(), this.pollMs);
      }
    }
  }

  kerbside(stop) {
    // 차도 안에 찍힌 정류장 기둥은 심시티 도로 기준 인도로(도로를 불러온 줌에서만).
    if(stop.kerb?.version!==this.roads.version)stop.kerb={version:this.roads.version,coordinate:this.roads.kerbside([stop.lng,stop.lat])};
    return stop.kerb.coordinate;
  }
  snappedLine(route,line) {
    if(route.snapped?.version!==this.roads.version)route.snapped=this.roads.snapLine(line);
    return route.snapped;
  }
  lineGeometry(route) { return this.geometry(route); }
  geometry(route) {
    // 노선 선 · 정류장 거리 · 버스 위치가 모두 같은 도로에 맞춘 선(line) 위에서 정해진다(없으면 공식 경로).
    if (route.geometry) return route.geometry;
    const path = buildBusPath(route.line) || buildBusPath(route.path); if (!path) return null;
    let previous = 0;
    path.stops = route.stopIds.map(id => {
      const stop = this.data.stopById.get(id);
      const snapped = snapBusToPath(path, [stop.lng, stop.lat], {hint: previous, min: previous, maxError: 1000});
      previous = snapped?.distance ?? previous;
      return {stop, distance: previous};
    });
    route.geometry = path; return path;
  }

  setLiveData(payload, requested = this.requested) {
    if (!this.data || this.disposed) return;
    if (payload?.schemaVersion !== 1 || !Array.isArray(payload.buses)) throw new Error('Unsupported bus live data');
    const now = performance.now(), wall = Date.now(), seen = new Set(), allowed = new Set(requested);
    this.mode = ['live', 'mock', 'unavailable'].includes(payload.mode) ? payload.mode : 'unavailable';
    this.routeStates = payload.routes || {};
    this.pollMs = Math.min(300000, Math.max(15000, (Number(payload.pollAfterSeconds) || 30) * 1000));
    for (const row of payload.buses) {
      const route = this.data.routeById.get(row.routeId);
      if (!route || !allowed.has(row.routeId) || typeof row.id !== 'string' || !validCoordinate([row.lng, row.lat])) continue;
      const path = this.geometry(route); if (!path) continue;
      const state = payload.routes?.[row.routeId] || {}, previous = this.fleet.get(row.id);
      const received = timestamp(row.receivedAt), fetched = timestamp(state.fetchedAt) ?? timestamp(payload.fetchedAt);
      const observed = received ?? fetched;
      if (previous?.observed != null && observed != null && observed < previous.observed) {
        seen.add(row.id); // An older cache response is not a new position or a route correction.
        continue;
      }
      const age = Math.max(0, observed == null ? 0 : wall - observed, Number(state.ageSeconds || 0) * 1000);
      if (age > EXPIRE_MS) continue;
      const stale = ['stale', 'error', 'deferred', 'unavailable'].includes(state.status) || age > STALE_MS || observed == null;
      let min = 0, max = path.total;
      // Original ordinals can have gaps. Only the explicit aligned mapping is a hint;
      // an absent/unmatched ordinal must never be treated as an array index.
      const seq = Number.isInteger(row.stopSequence) ? route.stopSequences.indexOf(row.stopSequence) : -1;
      if (seq >= 0 && path.stops[seq] && path.stops[seq + 1]) {
        min = Math.max(0, path.stops[seq].distance - 50); max = Math.min(path.total, path.stops[seq + 1].distance + 50);
      }
      const options = {hint: previous?.motion.to ?? null, min, max, heading: row.heading, maxError: route.approximate ? 700 : 250};
      const snap = snapBusToPath(path, [row.lng, row.lat], options);
      if (!snap) continue;
      seen.add(row.id);
      const same = previous && previous.observed === observed && Math.abs(previous.motion.to - snap.distance) < 1;
      const interval = previous && observed > previous.observed ? observed - previous.observed : this.pollMs;
      const motion = same ? previous.motion : nextBusMotion(previous?.motion, snap.distance, now, {interval, reduced: this.reduced.matches, stale});
      const bus = {row, route, path, motion, observed, fetched, received, stale, receivedWall: wall,
        mock: payload.mode === 'mock' || row.mock === true || row.id.startsWith('mock:'), status: state.status};
      if (stale) this.freeze(bus);
      this.fleet.set(row.id, bus);
    }
    for (const [id, bus] of this.fleet) {
      if (allowed.has(bus.route.id) && !seen.has(id)) this.fleet.delete(id);
      else if (wall - bus.receivedWall > EXPIRE_MS) this.fleet.delete(id);
    }
    this.updateStatus(); this.refreshDetail(); this.draw();
  }

  freeze(bus) { bus.stale = true; bus.motion = {...bus.motion, from: bus.motion.to, duration: 0}; }
  checkFreshness() {
    const now = Date.now();
    for (const [id, bus] of this.fleet) {
      const age = now - (bus.observed ?? bus.receivedWall);
      if (age > EXPIRE_MS) this.fleet.delete(id);
      else if (age > STALE_MS) this.freeze(bus);
    }
    this.updateStatus(); this.refreshDetail(); this.draw();
  }
  chosenIds(){return this.selectedRoute?[this.selectedRoute]:this.journeyIds;}
  // 정류장 팝업에서 고른 노선 하나는 노선 전체가 보이게 멀리 빼도 그 노선 버스를 계속 받는다(호출은 노선 1개)
  active() { return !this.disposed && !document.hidden && (!!this.selectedRoute || (this.enabled||this.chosenIds().length>0) && this.map.getZoom() >= BUS_ZOOM.buses); }
  stopAnimation() { clearTimeout(this.frameTimer); cancelAnimationFrame(this.frame); this.frameTimer = 0; this.frame = 0; }
  stopLive() {
    clearTimeout(this.pollTimer); this.pollTimer = 0; this.stopAnimation();
    clearInterval(this.freshnessTimer); this.freshnessTimer = 0;
    this.liveController?.abort(); this.liveController = null; this.requestKey = null;
  }
  clearScene() { this.hits=[];this.stopHits=[]; }

  selectedLeg(){
    const r=this.data?.routeById.get(this.selectedRoute);
    return r?{type:'bus',routeId:r.id,route:r.name,path:r.path,color:color(r,this.theme)}:null;
  }
  raiseRoute(){
    // Above journey's ground veil, below raised buildings: a road line must not
    // paint over a roof simply because the selection layers were created last.
    const before=this.map.getLayer('city-buildings')?'city-buildings':this.map.getLayer('bm-bld3d')?'bm-bld3d':undefined;
    if(this.map.moveLayer)for(const id of LAYERS)if(this.map.getLayer(id))this.map.moveLayer(id,before);
  }

  refreshAnimatedDetail(now) {
    const selectedBus=this.selection?.kind==='bus'?this.fleet.get(this.selection.id):null;
    if(!selectedBus)return false;
    const completedAt=selectedBus.motion.startedAt+selectedBus.motion.duration;
    if(now-this.detailAt>=1000||(now>=completedAt&&this.detailAt<completedAt)){this.detailAt=now;this.refreshDetail();}
    return !this.reduced.matches&&!selectedBus.stale&&now<completedAt;
  }
  draw(){if(this.disposed)return;this.refreshAnimatedDetail(performance.now());this.requestRender();}

  // Called from drawTrains, after its building depth pass. Never creates another canvas.
  render(gl,matrix,occlude=0) {   // occlude: 건물 뒤를 비치게 그릴 불투명도(열차와 같은 값)
    this.clearScene();
    if(this.disposed||document.hidden||!this.data||this.map.getZoom()<BUS_ZOOM.stops&&!this.active()){this.renderer.stats={vehicles:0,stops:0,drawCalls:0};return;}
    const now=performance.now(),wall=Date.now(),zoom=this.map.getZoom(),canvas=this.map.getCanvas();
    const width=canvas.clientWidth,height=canvas.clientHeight,unit=1/(512*2**zoom),box=boundsArray(this.map.getBounds());
    const origin=busMercator([(box[0]+box[2])/2,(box[1]+box[3])/2]),vehicles=[],posts=[];
    const project=(world,z)=>projectBusPoint(matrix,world[0],world[1],z,width,height);
    const bounds=points=>[Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))];
    const pad=(r,x,y=x)=>[r[0]-x,r[1]-y,r[2]+x,r[3]+y];
    const hitBox=(r,minimum)=>{const cx=(r[0]+r[2])/2,cy=(r[1]+r[3])/2,w=Math.max(minimum,r[2]-r[0]+6),h=Math.max(minimum,r[3]-r[1]+6);return[cx-w/2,cy-h/2,cx+w/2,cy+h/2];};
    let moving=false;
    const allowed=new Set(this.chosenIds().length?this.chosenIds():this.requested);
    if(this.active())for(const bus of [...this.fleet.values()].sort((a,b)=>Number(b.row.id===this.selection?.id)-Number(a.row.id===this.selection?.id))){
      if(!allowed.has(bus.route.id)||wall-bus.receivedWall>EXPIRE_MS)continue;
      if(bus.observed!=null&&wall-bus.observed>STALE_MS)this.freeze(bus);
      const distance=this.reduced.matches?bus.motion.to:busMotionDistance(bus.motion,now);
      // API 좌표는 노선 선 위 지점(distance)으로만 쓴다. 멀리서는 그 선 위, 줌 15 부터는 심시티 도로의 진행 방향 오른쪽 차로.
      const overview=zoom<BUS_ZOOM.buses||!this.map.querySourceFeatures,pose=overview?busPointAt(bus.path,distance):busLinePointAt(this.snappedLine(bus.route,bus.path),distance);
      if(!pose||!contains(this.box||box,pose.coordinate))continue;
      // 차로가 충분히 넓은 줌(18쯤)에서는 바퀴까지 차로 안에. 그보다 멀면 아래처럼 최소 크기를 지킨다
      // 차로 폭에 맞추면 줌 15에서 4px · 16에서 8px 로 줄어 사라진 것처럼 보였다(2026-10-08 덕배): 줌 15 크기 밑으로는 줄이지 않는다
      const fit=pose.laneWidth*.88/(1.12*busMetresPerPixel(zoom,pose.coordinate[1]));
      const scale=overview?busModelScale(zoom):Math.min(busModelScale(zoom),Math.max(busModelScale(BUS_ZOOM.buses),fit));
      const world=busMercator(pose.coordinate),yaw=(pose.heading-90)*Math.PI/180;
      const c=Math.cos(yaw),s=Math.sin(yaw),corners=[];
      for(const x of [-1.55,1.55])for(const y of [-.56,.56])for(const z of [0,1.32]){
        const q=project([world[0]+(c*x-s*y)*scale*unit,world[1]+(s*x+c*y)*scale*unit],z*scale*unit);if(q)corners.push(q);
      }
      if(corners.length!==8)continue;const rectangle=bounds(corners);
      if(!intersects(rectangle,[0,0,width,height]))continue;
      const p=project(world,.7*scale*unit),selected=this.selection?.kind==='bus'&&this.selection.id===bus.row.id;
      vehicles.push({world,yaw,scale,rgb:rgb(bus.route.type==='circular'?'#EAB308':color(bus.route,this.theme)),alpha:bus.stale?.55:1,label:bus.route.name,selected});
      this.hits.push({x:p.x,y:p.y,bounds:hitBox(rectangle,this.phone?44:24),bus,coordinate:pose.coordinate,heading:pose.heading,laneWidth:pose.laneWidth,scale});
      if(!this.reduced.matches&&!bus.stale&&now<bus.motion.startedAt+bus.motion.duration)moving=true;
      if(vehicles.length>=(this.phone?160:320))break;
    }
    const placement=placeStopPosts(zoom<BUS_ZOOM.stops?[]:(this.stopFeatures||[]),this.exitCoordinates||[],
      {project,width,height,zoom,unit,origin,bearing:(this.map.getBearing?.()||0)*Math.PI/180,phone:this.phone,selected:this.selection?.id});
    posts.push(...placement.posts);this.stopHits.push(...placement.hits);
    this.renderer.render(gl,matrix,{origin,unit,pitch:(this.map.getPitch?.()||0)*Math.PI/180,dark:this.theme==='dark',vehicles,stops:posts,occlude});
    moving=this.refreshAnimatedDetail(now)||moving;
    if(moving&&this.active()&&!this.frameTimer&&!this.frame){
      this.frameTimer=setTimeout(()=>{this.frameTimer=0;this.draw();},1000/(this.phone?24:30));
    }
  }

  // 따라가기(지도 쪽 카메라): 그 버스가 지금 그려지는 자리 — render 와 같은 계산(멀리서는 노선 선, 줌 15 부터는 차로)
  vehiclePosition(id) {
    const bus = this.fleet.get(id); if (!bus || !this.active()) return null;
    const zoom = this.map.getZoom(), distance = this.reduced.matches ? bus.motion.to : busMotionDistance(bus.motion, performance.now());
    const pose = zoom < BUS_ZOOM.buses || !this.map.querySourceFeatures ? busPointAt(bus.path, distance) : busLinePointAt(this.snappedLine(bus.route, bus.path), distance);
    return pose?.coordinate || null;
  }
  selectAt(point) {
    if (!this.data) return false;
    let nearest = null, distance = Infinity;
    for (const hit of this.hits) { const d = Math.hypot(hit.x - point.x, hit.y - point.y); if (contains(hit.bounds,[point.x,point.y])&&d<distance) { nearest=hit;distance=d; } }
    if (nearest) { this.select({kind: 'bus', id: nearest.bus.row.id}, nearest.bus.route.id); return true; }
    if (this.map.getZoom() < BUS_ZOOM.stops) return false;
    const stop=this.stopHits.filter(h=>contains(h.bounds,[point.x,point.y])).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0];
    if(stop){this.select({kind:'stop',id:stop.id},null);return true;}
    const routes = this.map.queryRenderedFeatures([[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]], {layers: [...LAYERS.slice(0, 2), ...(this.check ? CHECK_LAYERS.slice(0, 1) : [])]});
    if (routes.length) { const id = routes[0].properties.routeId; this.select({kind: 'route', id}, id); return true; }
    return false;
  }

  inspectNearby() {
    const c = this.map.getCanvas(), centre = {x: c.clientWidth / 2, y: c.clientHeight / 2};
    const hit = [...this.stopHits].sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))[0];
    if (hit) this.select({kind: 'stop', id: hit.id}, null);
    else if (this.stopFeatures?.length) {
      const stops = this.stopFeatures.map(f => ({f, p: this.map.project(f.geometry.coordinates)}));
      stops.sort((a, b) => Math.hypot(a.p.x - centre.x, a.p.y - centre.y) - Math.hypot(b.p.x - centre.x, b.p.y - centre.y));
      this.select({kind: 'stop', id: stops[0].f.properties.id}, null);
    } else if (this.visible[0]) this.select({kind: 'route', id: this.visible[0].route.id}, this.visible[0].route.id);
    else return;
    const panel = document.getElementById('settingsPanel'); if (panel) panel.hidden = true;
    document.getElementById('settingsButton')?.setAttribute('aria-expanded', 'false');
    this.restoreFocus = document.getElementById('settingsButton');
    document.querySelector('.bus-detail h3')?.focus({preventScroll: true});
  }

  select(selection, routeId) {
    this.journeyLegs=[];this.journeyIds=[];
    this.selection = selection; this.selectedRoute = routeId;
    this.stopArrivals();
    if (selection?.kind === 'stop') { this.loadArrivals(); this.arrivalTick = setInterval(() => this.tickArrivals(), 1000); }
    this.updateDetail = this.onSelect(this.detailHTML()) || null;
    this.refreshView();
    this.onRouteSelect(this.selectedLeg());
  }
  clearSelection() {
    if (!this.selection&&!this.journeyLegs.length&&!this.selectedRoute) return;
    if (document.activeElement?.closest?.('.bus-detail')) this.restoreFocus?.focus({preventScroll: true});
    this.restoreFocus=null;this.selection=null;this.selectedRoute=null;this.updateDetail=null;this.journeyLegs=[];this.journeyIds=[];
    this.stopArrivals();
    if(!this.enabled){this.stopLive();this.fleet.clear();}
    this.refreshView();this.renderStatic();this.draw();
    this.onRouteSelect(null);
  }
  setJourney(legs){
    this.selection=null;this.selectedRoute=null;this.updateDetail=null;this.stopArrivals();
    this.journeyLegs=(legs||[]).filter(l=>l.type==='bus'&&Array.isArray(l.path)&&l.path.length>1&&l.path.every(validCoordinate));
    this.journeyIds=this.data?journeyBusRouteIds(this.data,this.journeyLegs):[];this.refreshView();
  }
  refreshDetail() { if (this.selection && this.updateDetail) this.updateDetail(this.detailHTML()); }

  // 정류장 도착 정보: 정류장 하나 = 서버 호출 1번(같은 정류장은 서버가 20초 동안 함께 쓴다)
  async loadArrivals(fresh = false) {
    clearTimeout(this.arrivalTimer); this.arrivalTimer = 0;
    const stop = this.selection?.kind === 'stop' ? this.data?.stopById.get(this.selection.id) : null; if (!stop) return;
    if (!stop.arsId) { this.arrivals = {stopId: stop.id, state: 'none', rows: [], count: 0}; return; }   // 번호 없는 가상 정류장
    const previous = this.arrivals?.stopId === stop.id ? this.arrivals : null;
    const schedule = () => {
      // 못 받았으면(서울시 서버가 401 을 가끔 섞어 준다) 6초 뒤 다시, 받았으면 30초 뒤
      const wait = ['error', 'stale'].includes(this.arrivals.state) ? 6000 : ARRIVAL_POLL_MS;
      if (this.selection?.kind === 'stop' && this.selection.id === stop.id && this.arrivals.count < ARRIVAL_POLLS) this.arrivalTimer = setTimeout(() => this.loadArrivals(), wait);
    };
    if (previous && document.hidden) { schedule(); return; }   // 안 보는 동안은 부르지 않는다
    this.arrivals = {...previous, stopId: stop.id, rows: previous?.rows || [], state: previous?.state || 'loading', count: (previous?.count || 0) + 1};
    this.arrivalController?.abort();
    const controller = this.arrivalController = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const r = await this.fetcher(`/api/bus/live?stop=${encodeURIComponent(stop.arsId)}${fresh ? '&fresh=1' : ''}`, {cache: 'no-store', signal: controller.signal});
      const body = await r.json();
      if (controller !== this.arrivalController) return;
      if (body?.schemaVersion !== 1 || !Array.isArray(body.arrivals)) throw new Error('Unsupported bus arrival data');
      // 남은 초는 서버가 받은 때 기준: 서버 캐시에 있던 시간(ageSeconds)만큼 빼서 이 기기 시계로 도착 시각을 잡는다
      const got = Date.now(), age = Number(body.ageSeconds) || 0;
      const rows = body.arrivals.filter(a => a && typeof a.routeId === 'string').map(a => ({...a, buses: (a.buses || []).map(b =>
        ({...b, etaAt: Number.isFinite(b?.seconds) && b.seconds > 0 ? got + (b.seconds - age) * 1000 : null}))}));
      this.arrivals = {...this.arrivals, state: body.status, mode: body.mode, rows, fetchedAt: timestamp(body.fetchedAt), code: body.errors?.[0]?.code || ''};
    } catch {
      if (controller !== this.arrivalController) return;
      this.arrivals = {...this.arrivals, state: this.arrivals.rows.length ? 'stale' : 'error', code: ''};
    } finally {
      clearTimeout(timeout);
      if (controller === this.arrivalController) { this.arrivalController = null; schedule(); }
    }
    this.refreshDetail();
  }
  refreshArrivals() {
    if (!this.arrivals || this.arrivals.state === 'none') return;
    this.arrivals.count = 0;   // 새로고침하면 30초마다 다시 받기도 처음부터
    this.loadArrivals(true); this.refreshDetail();
  }
  // 1초마다: 남은 시간 글자와 곧 도착 카드의 버스 아이콘만 고친다(팝업을 다시 그리지 않아 누르던 버튼 포커스가 그대로)
  tickArrivals() {
    const sheet = document.querySelector?.('.bus-detail .bus-stop'); if (!sheet) return;
    for (const el of sheet.querySelectorAll('[data-eta]')) {
      const left = countdownText((Number(el.dataset.eta) - Date.now()) / 1000);
      if (el.textContent !== left) el.textContent = left;
    }
    const icon = sheet.querySelector('[data-track-route]'), stop = this.selection?.kind === 'stop' ? this.selection.id : null;
    const route = icon && this.data?.routeById.get(icon.dataset.trackRoute);
    if (route && stop) icon.style.left = `${this.approach(route, stop).ratio * 50}%`;
  }
  stopArrivals() {
    clearInterval(this.arrivalTick); this.arrivalTick = 0;
    clearTimeout(this.arrivalTimer); this.arrivalTimer = 0;
    const controller = this.arrivalController; this.arrivalController = null; controller?.abort();
    this.arrivals = null;
  }
  // 이 정류장으로 오는 구간: 이전 · 다음 정류장 이름과, 그 노선을 지도에 띄웠다면 지도 위 버스가 구간의 어디쯤인지(0 이전 정류장 ~ 1 이 정류장)
  approach(route, stopId) {
    const path = route?.stopIds ? this.geometry(route) : null, stops = path?.stops || [];
    const now = performance.now(), found = [];
    stops.forEach((s, i) => { if (i > 0 && s.stop.id === stopId) found.push(i); });
    let best = {i: found[0], ratio: null};
    if (route?.id === this.selectedRoute) for (const i of found) {
      const from = stops[i - 1].distance, to = stops[i].distance; if (!(to > from)) continue;
      for (const bus of this.fleet.values()) {
        if (bus.route.id !== route.id || bus.stale) continue;
        const d = this.reduced.matches ? bus.motion.to : busMotionDistance(bus.motion, now);
        if (d >= from - 20 && d <= to + 5 && (best.ratio == null || (d - from) / (to - from) > best.ratio)) best = {i, ratio: (d - from) / (to - from)};
      }
    }
    return {prev: best.i ? stops[best.i - 1]?.stop.name : '', next: best.i ? stops[best.i + 1]?.stop.name : '',
      ratio: best.ratio == null ? .52 : Math.max(.06, Math.min(.96, best.ratio))};   // 모르면 구간 가운데쯤
  }
  // 정류장 팝업(2026-10-07 행님 시안): 번호 배지 · 이름 · 새로고침 / 곧 도착 카드 / 한 줄 목록 / 운행 종료
  stopHTML(stop, routes, mock) {
    const a = this.arrivals?.stopId === stop.id ? this.arrivals : null;
    const rows = new Map((a?.rows || []).map(row => [row.routeId, row])), known = new Set(routes.map(r => r.id));
    const answered = a && ['fresh', 'cached', 'stale', 'mock'].includes(a.state), waiting = !a || a.state === 'loading';
    const clock = a?.fetchedAt == null ? '' : new Date(a.fetchedAt).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul'});
    const note = !a || waiting ? '' : a.state === 'none' ? '이 정류장은 도착 정보가 없어요.' : a.state === 'unavailable' ? '지금은 도착 정보를 쓸 수 없어요.'
      : a.mode === 'mock' ? '예시 데이터 · 실제 운행 정보 아님' : a.state === 'stale' ? '도착 정보 갱신 지연 · 마지막으로 받은 정보예요.'
      : answered ? '' : a.code === 'daily_limit' ? '오늘 도착 정보 조회 한도를 다 썼어요.' : '도착 정보를 불러오지 못했어요.';
    // 우리 노선 자료에 없는 번호(공항버스 등)도 도착 정보는 보여 주되, 지도에 그릴 경로가 없어 누를 수 없다
    const items = [...routes.map(route => ({route, row: rows.get(route.id), live: true})),
      ...[...rows.values()].filter(row => !known.has(row.routeId)).map(row => ({route: {id: row.routeId, name: row.name, type: row.type}, row, live: false}))];
    items.sort((x, y) => arrivalRank(x.row) - arrivalRank(y.row));
    // 흰 글자라 밝은 쪽 색. '7101파주' · '새벽A148' 같은 긴 번호(5글자 이상)는 글자를 줄여 칸 안에
    const badge = route => `<span class="bus-num${[...String(route.name)].length > 4 ? ' bus-num-long' : ''}" style="--c:${color(route, 'light')}">${text(route.name)}</span>`;
    const soon = items.filter(i => isSoon(i.row)), ended = items.filter(i => isEnded(i.row)), list = items.filter(i => !isEnded(i.row));
    // 곧 도착 카드: 1대면 번호 · 방면 · 다음 버스, 여러 대면 번호만(6대까지, 7대부터 5대 + '+N')
    let hero = '';
    if (soon.length) {
      const lead = soon[0], near = this.approach(lead.live ? lead.route : null, stop.id), one = soon.length === 1;
      const nextBus = one && lead.row.buses?.[1] ? arrivalParts(lead.row.buses[1]).when : '';
      // 여러 대: 한 줄에 들어가는 만큼만(휴대폰 카드 안쪽 약 300px, 배지 16px 글씨), 넘치면 '+N' 칩 자리를 남긴다
      const width = name => { const chars = [...String(name)], long = chars.length > 4;   // 긴 번호는 13px(.is-many .bus-num-long)
        return (long ? 12 : 16) + chars.reduce((w, c) => w + (c.charCodeAt(0) < 128 ? 9 : 15), 0) * (long ? 13 / 16 : 1) + 5; };
      const fits = list => list.reduce((w, i) => w + width(i.route.name), 0) <= 300;
      let shown = soon;
      if (!fits(soon)) { shown = []; for (const i of soon) { if (!fits([...shown, i]) || shown.reduce((w, x) => w + width(x.route.name), 0) + width(i.route.name) > 300 - 44) break; shown.push(i); } }
      const head = one
        ? `${badge(lead.route)}<span class="bus-hero-dir">${text(lead.row.direction ? `${lead.row.direction} 방면` : typeName(lead.route))}</span>${lead.live && lead.route.id === this.selectedRoute ? '<span class="bus-hero-on">지도에 표시 중</span>' : ''}`
        : `${shown.map(i => badge(i.route)).join('')}${soon.length > shown.length ? `<span class="bus-num bus-num-more">+${soon.length - shown.length}</span>` : ''}`;
      const next = nextBus === '곧 도착' ? '다음 버스도 곧 도착' : /분 후$/.test(nextBus) ? `다음 ${nextBus.replace(/ 후$/, '')}` : '';
      let body = `<span class="bus-hero-head">${head}</span><span class="bus-hero-now"><span class="bus-hero-soon">곧 도착</span>${next ? `<span class="bus-hero-next">${text(next)}</span>` : ''}</span>` +
        `<span class="bus-track" aria-hidden="true"><span class="bus-track-from"></span><span class="bus-track-bus"${lead.live ? ` data-track-route="${text(lead.route.id)}"` : ''} style="left:${near.ratio * 50}%">${BUS_ICON}</span><span class="bus-track-here"></span><span class="bus-track-to"></span></span>` +
        `<span class="bus-track-names"><span>${text(near.prev || '')}</span><b>${text(stop.name)}</b><span>${text(near.next || '')}</span></span>`;
      if (!one) body = body.replace('<span class="bus-hero-head">', '<span class="bus-hero-head is-many">');
      hero = one && lead.live
        ? `<button type="button" class="bus-hero" data-bus-route="${text(lead.route.id)}" aria-pressed="${lead.route.id === this.selectedRoute}">${body}</button>`
        : `<div class="bus-hero">${body}</div>`;
    }
    const row = ({route, row, live}) => {
      const first = row?.buses?.[0], parts = first ? arrivalParts(first) : null;
      const where = parts?.detail.split(' · ').filter(t => t !== '막차' && t !== '0번째 전').join(' · ') || '';   // 서울시가 가끔 주는 '0번째 전'은 뺀다
      const tag = parts?.detail.includes('막차') ? '막차' : live ? '' : '지도 없음';
      const time = waiting && !row ? '<i class="bus-wait"></i>'
        : !row ? '<span class="bus-away">도착 정보 없음</span>'
        : isSoon(row) ? '<span class="bus-soon">곧 도착</span>'
        : first?.etaAt ? `${where ? `<span class="bus-away">${text(where)}</span>` : ''}<span class="bus-eta" data-eta="${Math.round(first.etaAt)}">${countdownText((first.etaAt - Date.now()) / 1000)}</span>`
        : `<span class="bus-away">${text(parts.when)}</span>`;
      const inner = `${badge(route)}<span class="bus-row-dir"><span>${text(row?.direction ? `${row.direction} 방면` : typeName(route))}</span>${tag ? `<span class="bus-tag">${tag}</span>` : ''}</span><span class="bus-row-time">${time}</span>`;
      return live ? `<button type="button" class="bus-row" data-bus-route="${text(route.id)}" aria-pressed="${route.id === this.selectedRoute}">${inner}</button>` : `<div class="bus-row">${inner}</div>`;
    };
    const endedLine = ended.length ? `<div class="bus-ended"><span>운행 종료</span>${ended.map(({route, live}) => live
      ? `<button type="button" data-bus-route="${text(route.id)}" aria-pressed="${route.id === this.selectedRoute}">${text(route.name)}</button>` : `<span>${text(route.name)}</span>`).join('')}</div>` : '';
    const refresh = stop.arsId ? `<button type="button" class="bus-refresh${this.arrivalController ? ' is-loading' : ''}" data-bus-refresh aria-label="도착 정보 새로 받기${clock ? ` · ${clock} 기준` : ''}"><span>${clock}</span>${REFRESH_ICON}</button>` : '';
    return `<div class="bus-stop"><div class="bus-stop-head"><div class="bus-stop-title">${stop.arsId ? `<span class="bus-stop-no">${BUS_ICON}${text(stop.arsId)}</span>` : ''}<h3 tabindex="-1">${text(stop.name)}</h3></div>${refresh}</div>` +
      `${note ? `<p class="bus-detail-note">${note}</p>` : ''}${mock ? '<p class="bus-detail-note">예시 데이터 · 실제 운행 정보 아님</p>' : ''}` +
      `${hero}<div class="bus-rows">${list.map(row).join('')}</div>${endedLine}</div>`;
  }

  detailHTML() {
    const selection = this.selection; if (!selection) return '';
    const wrap = html => `<div class="bus-detail">${html}</div>`;
    if (selection.kind === 'stop') {
      const stop = this.data.stopById.get(selection.id); if (!stop) return '';
      const routes = this.data.routesByStop.get(stop.id) || [];
      const chosen=this.data.routeById.get(this.selectedRoute);
      const mock=chosen&&(this.mode==='mock'||[...this.fleet.values()].some(b=>b.route.id===chosen.id&&b.mock));
      return `<div class="bus-detail">${this.stopHTML(stop, routes, mock)}</div>`;
    }
    const bus = selection.kind === 'bus' ? this.fleet.get(selection.id) : null;
    const route = bus?.route || this.data.routeById.get(this.selectedRoute); if (!route) return '';
    const heading = `<h3 tabindex="-1"><span class="bus-type" style="--bus-color:${color(route, this.theme)}">${text(BUS_TYPES[route.type].name)}</span> ${text(route.name)}번</h3>`;
    const approx = route.approximate ? '<p class="bus-detail-note">정류장을 연결한 근사 경로예요.</p>' : '';
    if (!bus) return wrap(`${heading}<p class="bus-detail-note">${selection.kind === 'bus' ? '이 버스의 최신 위치를 확인하지 못했어요.' : `${route.stopIds.length}개 정류장`}</p>${approx}`);
    const position = busMotionDistance(bus.motion, performance.now());
    const next = bus.path.stops.find(s => s.distance > position + 8)?.stop;
    const clock = bus.received ?? bus.fetched;
    const time = clock == null ? '확인되지 않음' : new Date(clock).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul'});
    const state = bus.mock ? '예시 데이터 · 실제 운행 정보 아님' : bus.stale ? '위치 갱신 지연 · 마지막 위치' : '마지막 수신 위치를 연결해 보여요';
    return wrap(`${heading}<dl class="bus-detail-grid"><dt>다음 정류장</dt><dd>${text(next?.name || '정보 없음')}${next ? '<small>경로 기준</small>' : ''}</dd><dt>${bus.received ? '수신 시각' : '조회 시각'}</dt><dd>${text(time)}</dd></dl><p class="bus-detail-note">${state}</p>${approx}`);
  }

  updateStatus() {
    if (this.disposed) return;
    const zoom = this.map.getZoom();
    // 지연 알림은 우리 쪽(노선을 못 받았거나 늦음)만. 버스 한 대의 위치가 오래된 건(차고지 대기 등, 2026-10-07 149대 중 2대) 그 버스만 흐리게
    const delayed = this.mode === 'error' ||
      Object.values(this.routeStates || {}).some(s => ['stale', 'deferred', 'error'].includes(s.status));
    if (this.nearby) { this.nearby.hidden = false; this.nearby.disabled = !this.stopFeatures?.length || zoom < BUS_ZOOM.stops; }
    const chosen=new Set(this.chosenIds()),approximate=this.visible.some(v=>chosen.has(v.route.id)&&v.route.approximate),mock=this.mode==='mock'||[...this.fleet.values()].some(b=>b.mock);
    const notice = this.status || (mock ? '버스 예시 데이터 · 실제 운행 정보 아님' : delayed ? '버스 위치 갱신 지연' : '');   // 스위치 설명이 없어져 불러오기 실패도 지도 알림으로
    this.notice.textContent = [notice, approximate ? `${notice ? '' : '버스 · '}정류장 연결선` : ''].filter(Boolean).join(' · ');
    this.notice.hidden = !(this.enabled||chosen.size||this.journeyLegs.length) || !this.active() || !this.notice.textContent;
  }

  destroy() {
    if (this.disposed) return;
    this.stopLive(); this.stopArrivals(); clearTimeout(this.viewTimer);clearTimeout(this.roadTimer); this.staticController?.abort(); this.disposed = true;
    this.map.off('moveend', this.move); this.map.off('zoom', this.zoom); this.map.off('remove', this.remove);
    this.map.off('sourcedata',this.roadData);
    document.removeEventListener('visibilitychange', this.visibility); this.reduced.removeEventListener('change', this.motionChanged);
    document.removeEventListener('click',this.routeClick);
    this.nearby?.removeEventListener('click', this.inspect);
    this.renderer.dispose();this.notice.remove();this.fleet.clear();
  }
}
