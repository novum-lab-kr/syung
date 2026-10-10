import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {offsetCoords,trackStart,extendStart,closestPlatformPoint} from '../web/lib/platform_route.mjs';
import {createJourneyMap} from '../web/ui/journey.mjs';
import {journeyCasingPaint,journeyRidePaint,journeyStopPaint} from '../web/lib/journey_map_style.mjs';
const source=readFileSync(new URL('../web/maplibre_runtime.mjs',import.meta.url),'utf8');
const part=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end)};
const plain=x=>JSON.parse(JSON.stringify(x));
function setup(){
  const snapped=[[127,37],[127.001,37.001]],base=[[127,37],[127.001,37]];
  const stations=[{id:1,name:'출발',lon:127,lat:37,lines:[{name:'L'}]},{id:2,name:'도착',lon:127.001,lat:37,lines:[{name:'L'}]}];
  const sources=new Map(['stations','journey','routes'].map(id=>[id,{data:null,setData(data){this.data=plain(data)}}]));
  let labels=0,fits=0;
  class Bounds{extend(){return this}}
  const context=vm.createContext({Map,Math,coaster:false,simcity:false,coasterGeo:{bld:true},kitReady:true,loadModeKit:()=>Promise.resolve(),coasterWant:false,coasterSpeed:1,warp:0,warpAt:0,
    offsetCoords,trackStart,extendStart,closestPlatformPoint,
    stations,byId:new Map(stations.map(s=>[s.id,s])),paths:{L:[[1,2]]},colors:{L:'#123'},stopDirs:{},stopHalf:{},platformHalf:{},stopWidth:{},stopReach:{},
    cityViaduct:{snapped:()=>snapped,setGaps(){}},coasterGaps:()=>[],edgeCoords:()=>base,stopPos:(_,s)=>[s.lon,s.lat],edgeOffset:()=>0,edgeLines:new Map(),edgeKey:(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`,stopMerc:new Map(),snapStops:{},
    map:{getSource:id=>sources.get(id),getPitch:()=>60,getZoom:()=>15,triggerRepaint(){},fitBounds(){fits++}},
    maplibregl:{LngLatBounds:Bounds},busLayer:null,sheetPad:()=>0,stopRide(){},
    $:()=>({setAttribute(){}}),document:{querySelectorAll:()=>[]},cityMap(){},setRouteOpacity(){},
    buildLineFeatures:()=>[],planner:{rebuild(){}},lastPose:new Map(),applyTheme(){},updateSun(){},wallsNow(){},rebuildLabels(){labels++},
  });
  vm.runInContext([
    part('const PLATFORM_HALF=', 'function metresBetween('),
    'const stationRects=new Map();',
    part('const basicRouteCache=', 'function buildLineFeatures()'),
    part('const cityCoords=', 'function cityGeom('),
    part('function metresBetween(', 'const STATION_WIDTH_STOPS='),
    part('function buildStationFeatures()', 'const shapesReady='),
    part('function setCoaster(', 'function cityMap('),
  ].join('\n'),context);
  globalThis.document??={querySelector:()=>null,documentElement:{dataset:{}}};   // 여정 모듈의 focusRoute 가 열차 캔버스 · 테마를 찾는다(node 에는 DOM 이 없다)
  // 여정 지도 표시는 실제 export(web/ui/journey.mjs)를 같은 지도 · 원본 stub 에 붙인다(본체가 하는 조립과 같게)
  const journeyMap=createJourneyMap({map:{...context.map,getLayer:()=>undefined},maplibregl:context.maplibregl,colors:context.colors,byId:context.byId,cityCoords:(...a)=>vm.runInContext('cityCoords',context)(...a),stopPos:context.stopPos,
    cityViaduct:context.cityViaduct,sheetPad:context.sheetPad,journeyCasingPaint,journeyRidePaint,journeyStopPaint,
    live:{get busLayer(){return context.busLayer},get simcity(){return context.simcity},get coaster(){return context.coaster},stationAlpha:1}});
  Object.assign(context,{journeyMap,showRoute:journeyMap.showRoute,clearRoute:journeyMap.clearRoute,setRouteOpacity:journeyMap.setRouteOpacity,focusRoute:journeyMap.focusRoute,setSubwayOff:journeyMap.setSubwayOff});
  const run=code=>vm.runInContext(code,context);
  run("map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});showRoute({legs:[{type:'ride',line:'L',stations:[1,2]}]})");
  return {run,sources,base,snapped,rect:()=>plain(run("stationRects.get('L:1')")),labels:()=>labels,fits:()=>fits};
}

test('기본→롤코→기본 전환이 실제 승강장 데이터와 stationRects를 갱신해요',()=>{
  const r=setup(),initial=r.sources.get('stations').data,rect=r.rect();
  const city=setup();city.run("simcity=true;stationRects.clear();buildStationFeatures()");   // 롤코도 심시티 고가와 같은 도로 맞춤 경로 위의 승강장
  r.run('setCoaster(true)');
  assert.notDeepEqual(r.sources.get('stations').data,initial);
  assert.notDeepEqual(r.rect(),rect);
  assert.deepEqual(r.rect(),city.rect());
  assert.equal(r.labels(),1);
  r.run('setCoaster(false)');
  assert.deepEqual(r.sources.get('stations').data,initial);
  assert.deepEqual(r.rect(),rect);
  assert.equal(r.labels(),2);
});

test('표시 중인 여정도 기본→롤코→기본 경로를 따르고 전환이 지도를 다시 맞추지 않아요',()=>{
  const r=setup(),ride=()=>r.sources.get('journey').data.features.find(f=>f.properties.kind==='ride').geometry.coordinates;
  assert.deepEqual(ride(),r.snapped);
  r.run('setCoaster(true)');assert.deepEqual(ride(),r.snapped);   // 롤코도 고가(도로 맞춤 경로) 위를 달려요
  r.run('setCoaster(false)');assert.deepEqual(ride(),r.snapped);
  assert.equal(r.fits(),1);
  r.run('clearRoute();setCoaster(true)');
  assert.deepEqual(r.sources.get('journey').data.features,[]);
});
