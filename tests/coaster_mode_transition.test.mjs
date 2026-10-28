import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {offsetCoords,trackStart,extendStart,closestPlatformPoint} from '../web/lib/platform_route.mts';
import {createJourneyMap} from '../web/ui/journey.mts';
import {journeyCasingPaint,journeyRidePaint,journeyStopPaint} from '../web/lib/journey_map_style.mts';
import {createModeRegistry} from '../web/modes/index.mts';
import {createModeController,STARCRAFT,NATIONS,CITY_FAMILY} from '../web/modes/transition.mts';
const modeDefs=(await Promise.all(['basic','simcity','joseon','coaster','starcraft','nations','retro'].map(n=>import(`../web/modes/${n}/index.mts`).then(m=>m.default)))).flat();   // (스타크래프트는 종족 셋)
const source=stripTypeScriptTypes(readFileSync(new URL('../web/maplibre_runtime.mts',import.meta.url),'utf8'));   // 본체의 타입을 걷어 낸 JS(vm 은 JS 만 — 자리는 공백으로 남아 표지 글자 그대로)
const part=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end)};
const plain=x=>JSON.parse(JSON.stringify(x));
function setup(defs=modeDefs){
  const snapped=[[127,37],[127.001,37.001]],base=[[127,37],[127.001,37]];
  const stations=[{id:1,name:'출발',lon:127,lat:37,lines:[{name:'L'}]},{id:2,name:'도착',lon:127.001,lat:37,lines:[{name:'L'}]}];
  const sources=new Map(['stations','journey','routes'].map(id=>[id,{data:null,setData(data){this.data=plain(data)}}]));
  let labels=0,fits=0,rides=0,rebuilds=0;const buttons={};
  const races=STARCRAFT.map(race=>({dataset:{race}}));   // 종족 줄의 버튼
  const nationBtns=NATIONS.map(nation=>({dataset:{nation}}));   // 나라 줄의 버튼
  class Bounds{extend(){return this}}
  const context=vm.createContext({Map,Math,STARCRAFT,NATIONS,CITY_FAMILY,coasterGeo:{bld:true},kitReady:true,loadModeKit:()=>Promise.resolve(),loadCoasterBuildings:()=>Promise.resolve(),
    offsetCoords,trackStart,extendStart,closestPlatformPoint,
    stations,byId:new Map(stations.map(s=>[s.id,s])),paths:{L:[[1,2]]},colors:{L:'#123'},stopDirs:{},stopHalf:{},platformHalf:{},stopWidth:{},stopReach:{},
    cityViaduct:{snapped:()=>snapped,setGaps(){}},coasterGaps:()=>[],edgeCoords:()=>base,stopPos:(_,s)=>[s.lon,s.lat],edgeOffset:()=>0,edgeLines:new Map(),edgeKey:(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`,stopMerc:new Map(),snapStops:{},
    map:{getSource:id=>sources.get(id),getPitch:()=>60,getZoom:()=>15,triggerRepaint(){},fitBounds(){fits++}},
    maplibregl:{LngLatBounds:Bounds},busLayer:null,sheetPad:()=>0,stopRide(){rides++},
    $:id=>(buttons[id]??={setAttribute(k,v){if(k==='aria-pressed')this.pressed=v}}),setRouteOpacity(){},
    // 설정 서랍의 몸통 칸(ui/settings_menu.tsx) 창구: 옛 DOM 처럼 버튼마다 눌림(글자) · 줄마다 숨김을 남긴다
    menu:{press:(id,on)=>{(buttons[id]??={}).pressed=String(on)},hide:(id,hidden)=>{(buttons[id]??={}).hidden=hidden},
      race:want=>{for(const b of races)b.pressed=String(b.dataset.race===want)},nation:want=>{for(const b of nationBtns)b.pressed=String(b.dataset.nation===want)},speed(){}},
    buildLineFeatures:()=>[],planner:{rebuild(){rebuilds++}},lastPose:new Map(),applyTheme(){},updateSun(){},wallsNow(){},rebuildLabels(){labels++},
  });
  vm.runInContext([
    part('const PLATFORM_HALF=', 'function metresBetween('),
    'const stationRects=new Map();',
    part('const basicRouteCache=', 'function buildLineFeatures()'),
    part('const cityCoords=', 'function cityGeom('),
    part('function metresBetween(', 'const STATION_WIDTH_STOPS'),
    part('function buildStationFeatures()', 'const shapesReady='),
    part('function prepareMode(', 'menu.on({switches:{toggleSimcity'),
  ].join('\n'),context);
  // 모드 상태 · 전환은 실제 컨트롤러(web/modes/transition.mjs)에 본체의 준비 · 바꾸기 · 버튼 함수를 붙인다(본체가 하는 조립과 같게)
  const fn=name=>vm.runInContext(name,context);
  context.modeCtl=createModeController({registry:createModeRegistry(defs),clock:()=>0,prepare:id=>fn('prepareMode')(id),commit:(a,b,o)=>fn('commitMode')(a,b,o),onRequest:w=>fn('showModeButtons')(w),onFail:w=>fn('showModeButtons')(w)});
  context.modeOn=context.modeCtl.flags;
  globalThis.document??={querySelector:()=>null,documentElement:{dataset:{}}};   // 여정 모듈의 focusRoute 가 열차 캔버스 · 테마를 찾는다(node 에는 DOM 이 없다)
  // 여정 지도 표시는 실제 export(web/ui/journey.mjs)를 같은 지도 · 원본 stub 에 붙인다(본체가 하는 조립과 같게)
  const journeyMap=createJourneyMap({map:{...context.map,getLayer:()=>undefined},maplibregl:context.maplibregl,colors:context.colors,byId:context.byId,cityCoords:(...a)=>vm.runInContext('cityCoords',context)(...a),stopPos:context.stopPos,
    cityViaduct:context.cityViaduct,sheetPad:context.sheetPad,journeyCasingPaint,journeyRidePaint,journeyStopPaint,
    live:{get busLayer(){return context.busLayer},get settings(){return context.modeCtl.settings()},stationAlpha:1}});
  Object.assign(context,{journeyMap,showRoute:journeyMap.showRoute,clearRoute:journeyMap.clearRoute,setRouteOpacity:journeyMap.setRouteOpacity,focusRoute:journeyMap.focusRoute,setSubwayOff:journeyMap.setSubwayOff});
  const run=code=>vm.runInContext(code,context);
  run("map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});showRoute({legs:[{type:'ride',line:'L',stations:[1,2]}]})");
  return {run,sources,base,snapped,rect:()=>plain(run("stationRects.get('L:1')")),labels:()=>labels,fits:()=>fits,rides:()=>rides,rebuilds:()=>rebuilds,
    pressed:()=>Object.fromEntries(['toggleSimcity','toggleJoseon','toggleCoaster'].map(id=>[id,buttons[id]?.pressed])),
    star:()=>({on:buttons.toggleStarcraft?.pressed,row:buttons.starcraftRace?.hidden,race:races.filter(b=>b.pressed==='true').map(b=>b.dataset.race)}),
    nation:()=>({on:buttons.toggleNation?.pressed,row:buttons.nationRow?.hidden,pick:nationBtns.filter(b=>b.pressed==='true').map(b=>b.dataset.nation)})};
}

test('기본→롤코→기본 전환이 실제 승강장 데이터와 stationRects를 갱신해요',()=>{
  const r=setup(),initial=r.sources.get('stations').data,rect=r.rect();
  const city=setup();city.run("modeCtl.enter('simcity');stationRects.clear();buildStationFeatures()");   // 롤코도 심시티 고가와 같은 도로 맞춤 경로 위의 승강장
  r.run('setCoaster(true)');
  assert.deepEqual(r.rect(),city.rect());   // (이 곧은 선 한 줄 자료에서는 기본 승강장과도 같다: 모든 모드가 선로를 따라 그린다, 2026-10-11)
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

test('롤코 → 심시티: 1인칭에서 한 번 내리고(옛 상태에서), 롤코 경로를 지운 뒤 심시티 승강장, 버튼은 원하는 모드',()=>{
  const r=setup(),city=setup();city.run("modeCtl.enter('simcity');stationRects.clear();buildStationFeatures()");
  r.run('setCoaster(true)');assert.equal(r.rides(),0);
  assert.deepEqual(r.pressed(),{toggleSimcity:'false',toggleJoseon:'false',toggleCoaster:'true'});
  r.run('setSimcity(true)');
  assert.equal(r.rides(),1,'롤코를 끄며 한 번');assert.equal(r.run('modeCtl.current'),'simcity');
  assert.deepEqual(r.rect(),city.rect());
  assert.deepEqual(r.pressed(),{toggleSimcity:'true',toggleJoseon:'false',toggleCoaster:'false'});
  r.run('setSimcity(true,true)');assert.equal(r.run('modeCtl.current'),'joseon');assert.equal(r.labels(),3,'심시티 ↔ 조선은 승강장을 다시 만들지 않는다');
  r.run('setCoaster(false)');assert.equal(r.run('modeCtl.current'),'joseon','롤코 끄기는 다른 가족을 건드리지 않는다');
  r.run('setSimcity(false)');assert.equal(r.run('modeCtl.current'),'basic');
});

test('심시티에서 롤코를 받는 중 다시 누르면(끄기) 받기만 거두고 심시티 그대로, 롤코 끄기는 1인칭 내리기 한 번',async()=>{
  const r=setup();r.run("kitReady=true;coasterGeo={bld:null};loadCoasterBuildings=()=>new Promise(ok=>{globalThis.__done=ok})");
  r.run('setSimcity(true)');assert.equal(r.run('modeCtl.current'),'simcity');
  const p=r.run('setCoaster(true)');assert.equal(r.run('modeCtl.desired'),'coaster');
  r.run('setCoaster(false)');
  assert.equal(r.run('modeCtl.current'),'simcity');assert.equal(r.run('modeCtl.desired'),'simcity');
  assert.deepEqual(r.pressed(),{toggleSimcity:'true',toggleJoseon:'false',toggleCoaster:'false'});
  r.run('coasterGeo.bld=true;__done()');assert.equal(await p,false);assert.equal(r.run('modeCtl.current'),'simcity');
  r.run('setCoaster(true)');const n=r.rides();r.run('setCoaster(false)');
  assert.equal(r.rides()-n,1);assert.equal(r.run('modeCtl.current'),'basic');
});

test('심시티 ↔ 조선: 선로 설정이 같으면 승강장을 다시 만들지 않고, 조선이 선로를 덧쓰면 다시 만든다',()=>{
  const r=setup();r.run('setSimcity(true)');const n=r.labels();r.run('setSimcity(true,true)');assert.equal(r.labels(),n,'같은 선로: 그대로');
  const defs=modeDefs.map(d=>d.id==='joseon'?{...d,settings:{...d.settings,track:{kind:'ground',platform:'ribbon'}}}:d);
  const g=setup(defs),base=g.rect();g.run('setSimcity(true)');const m=g.labels();
  g.run('setSimcity(true,true)');assert.equal(g.labels(),m+1,'선로가 바뀌면 다시');assert.deepEqual(g.rect(),base,'조선이 땅 위 선로면 기본 승강장');
});

test('심시티 ↔ 조선: 선로가 같아도 예측 정차 수가 다르면 예측만 다시 세운다',()=>{
  const plain=setup();plain.run('setSimcity(true)');const p0=plain.rebuilds(),l0=plain.labels();plain.run('setSimcity(true,true)');
  assert.equal(plain.rebuilds(),p0,'같으면 그대로');
  const defs=modeDefs.map(d=>d.id==='joseon'?{...d,settings:{...d.settings,trains:{...d.settings.trains,predictStops:1}}}:d);
  const r=setup(defs);r.run('setSimcity(true)');const n=r.rebuilds(),l=r.labels();r.run('setSimcity(true,true)');
  assert.equal(r.rebuilds(),n+1);assert.equal(r.labels(),l,'승강장은 그대로');
  r.run('setSimcity(true)');assert.equal(r.rebuilds(),n+2,'돌아올 때도');
});

test('스타크래프트: 종족을 고르면 그 종족 모드(심시티 도시 그대로 — 승강장 · 예측을 다시 만들지 않는다), 스위치만 켜면 마지막 종족, 끄면 기본',()=>{
  const r=setup();r.run('setSimcity(true)');const l=r.labels(),n=r.rebuilds();
  assert.equal(r.run('setStarcraft(true)'),true);assert.equal(r.run('modeCtl.current'),'terran','처음엔 테란');
  assert.deepEqual(r.star(),{on:'true',row:false,race:['terran']});assert.equal(r.pressed().toggleSimcity,'false');
  assert.equal(r.run('modeOn.simcity'),true,'심시티 가족');assert.equal(r.run('modeOn.starcraft'),true);
  r.run("setStarcraft(true,'zerg')");assert.equal(r.run('modeCtl.current'),'zerg');assert.deepEqual(r.star().race,['zerg']);
  assert.equal(r.run('modeCtl.settings().me.look'),'drone');
  assert.equal(r.labels(),l,'같은 선로: 승강장 그대로');assert.equal(r.rebuilds(),n,'예측 그대로');
  r.run('setStarcraft(false)');assert.equal(r.run('modeCtl.current'),'basic');assert.deepEqual(r.star(),{on:'false',row:true,race:[]});
  r.run('setStarcraft(true)');assert.equal(r.run('modeCtl.current'),'zerg','다시 켜면 마지막 종족');
  r.run('setCoaster(true)');assert.equal(r.run('modeCtl.current'),'coaster');assert.equal(r.star().on,'false','롤코를 켜면 스타 스위치는 꺼짐');
});

test('나라: 스위치를 켜면 마지막 나라(처음엔 그리스) — 심시티 도시 그대로(승강장 · 예측 그대로), 다른 모드를 켜면 나라 스위치는 꺼짐',()=>{
  const r=setup();r.run('setSimcity(true)');const l=r.labels(),n=r.rebuilds();
  assert.equal(r.run('setNation(true)'),true);assert.equal(r.run('modeCtl.current'),'greece','처음엔 그리스');
  assert.deepEqual(r.nation(),{on:'true',row:false,pick:['greece']});assert.equal(r.pressed().toggleSimcity,'false');
  assert.equal(r.run('modeOn.simcity'),true,'심시티 가족');assert.equal(r.run('modeCtl.settings().city.pack.nation.kind'),'greece');
  assert.equal(r.labels(),l,'같은 선로: 승강장 그대로');assert.equal(r.rebuilds(),n,'예측 그대로');
  r.run("setStarcraft(true,'terran')");assert.equal(r.run('modeCtl.current'),'terran');assert.deepEqual(r.nation(),{on:'false',row:true,pick:[]});
  r.run('setNation(true)');assert.equal(r.run('modeCtl.current'),'greece','다시 켜면 마지막 나라');
  r.run('setNation(false)');assert.equal(r.run('modeCtl.current'),'basic');
});
