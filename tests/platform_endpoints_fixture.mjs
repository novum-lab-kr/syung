import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {offsetCoords,trackStart,extendStart,closestPlatformPoint} from '../web/lib/platform_route.mts';
import SNAP,{stops as snapStops} from '../web/city/viaduct_snap.mjs';
import {stations,paths} from './fixtures.mjs';
import {createModeRegistry} from '../web/modes/index.mjs';
const MODES=createModeRegistry(await Promise.all(['basic','simcity','joseon','coaster'].map(n=>import(`../web/modes/${n}/index.mjs`).then(m=>m.default))));
export function platformRuntime(source=readFileSync(new URL('../web/maplibre_runtime.mjs',import.meta.url),'utf8'),zoom=16,helpers={}){
  const data=JSON.parse(readFileSync(new URL('../data/osm-tracks/track_shapes.json',import.meta.url),'utf8'));
  const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
  const context=vm.createContext({stations,paths,byId:new Map(stations.map(s=>[s.id,s])),colors:{},map:{getZoom:()=>zoom},offsetCoords,trackStart,extendStart,closestPlatformPoint,coaster:false,simcity:false,cityViaduct:{snapped:(l,a,b)=>SNAP[`${l}:${a}:${b}`]||null},snapStops,stopReach:{},...data,shapes:data.edges,Map,Math,...helpers});
  // 본체는 모드 값을 modeOn(모드 상태의 flags)으로 읽는다: 시험은 지금처럼 context.simcity · coaster 를 바꾸면 된다
  context.modeOn={get simcity(){return !!context.simcity},get coaster(){return !!context.coaster},get joseon(){return !!context.joseon}};
  context.modeCtl={settings:()=>MODES.settings(context.coaster?'coaster':context.joseon?'joseon':context.simcity?'simcity':'basic')};   // 본체처럼 지금 모드의 설정(실제 모드 정의)
  vm.runInContext([
    'const LINE_GAP=5;const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;',
    slice('const edgeLines=new Map();','// Real track geometry'),
    slice('const stopPos=','\nconst stopMerc='),   // 런타임과 같은 역 점(기본·심시티는 도로 위로 옮긴 점)
    slice('function chaikin(', '// Where a station'),
    slice(source.includes('const basicRouteCache=')?'const basicRouteCache=':source.includes('const platformRouteFeatures=')?'const platformRouteFeatures=':'function buildLineFeatures()', 'const edgeGeom=new Map();'),
    slice('const cityCoords=', 'function cityGeom('),
    slice('const PLATFORM_HALF=', 'const shapesReady='),
  ].join('\n'),context);
  vm.runInContext('buildStationFeatures()',context);
  const rects=vm.runInContext('stationRects',context);
  const lines=vm.runInContext('buildLineFeatures()',context);
  const raw=vm.runInContext('Object.fromEntries(Object.entries(paths).flatMap(([l,chunks])=>chunks.flatMap(ids=>ids.slice(1).map((b,i)=>{const a=ids[i],lo=Math.min(a,b),hi=Math.max(a,b);return [`${l}:${lo}:${hi}`,cityCoords(l,lo,hi)]}))))',context);
  return {rects,lines,raw,context,source,zoom};
}
export const local=(p,c)=>[(p[0]-c[0])*111320*Math.cos(c[1]*Math.PI/180),(p[1]-c[1])*111320];
export function distance(p,coords){let best=Infinity;for(let i=1;i<coords.length;i++){const a=local(coords[i-1],p),b=local(coords[i],p),d=[b[0]-a[0],b[1]-a[1]],u=Math.max(0,Math.min(1,-(a[0]*d[0]+a[1]*d[1])/(d[0]**2+d[1]**2)||0));best=Math.min(best,Math.hypot(a[0]+u*d[0],a[1]+u*d[1]))}return best}
// 지도 렌더러와 같은 Mercator 픽셀 오프셋을 적용한 화면 중심선을 측정해요.
const merc=p=>[(p[0]+180)/360,(1-Math.log(Math.tan(Math.PI/4+p[1]*Math.PI/360))/Math.PI)/2];
const lnglat=p=>[p[0]*360-180,Math.atan(Math.sinh(Math.PI*(1-2*p[1])))*180/Math.PI];
export function shifted(coords,offset,zoom){
  if(!offset)return coords;
  const pts=coords.map(merc),unit=offset/(512*2**zoom);
  return pts.map((p,i)=>{let a=i,b=i;while(a>0&&Math.hypot(pts[a][0]-p[0],pts[a][1]-p[1])<1e-12)a--;while(b<pts.length-1&&Math.hypot(pts[b][0]-p[0],pts[b][1]-p[1])<1e-12)b++;const dx=pts[b][0]-pts[a][0],dy=pts[b][1]-pts[a][1],d=Math.hypot(dx,dy)||1;return lnglat([p[0]-dy/d*unit,p[1]+dx/d*unit])});
}
export function measurements(r){
  const keys=Object.keys(r.raw),byStation=new Map();
  r.lines.forEach((f,i)=>{const parts=keys[i].split(':');for(const id of parts.slice(-2)){const key=parts.slice(0,-2).join(':')+':'+id;if(!byStation.has(key))byStation.set(key,[]);byStation.get(key).push(shifted(f.geometry.coordinates,f.properties.offset,r.zoom))}});
  return [...r.rects].flatMap(([key,rect])=>{const id=+key.slice(key.lastIndexOf(':')+1),s=stations.find(s=>s.id===id),coords=byStation.get(key)||[];return shifted([rect.coords[0],rect.coords.at(-1)],rect.offset,r.zoom).map((p,end)=>({key,name:s.name,end,distance:Math.min(...coords.map(c=>distance(p,c)))}))});
}
