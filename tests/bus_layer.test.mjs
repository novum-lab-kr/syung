import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBusData, visibleBusRoutes, busRequestURL, busPollDelay, createBusLayer, busRoutesNearStops, journeyBusRouteIds, journeyBusRange, arrivalParts, countdownText, placeStopPosts} from '../web/bus/layer.mjs';
import {buildBusPath, busMotionDistance} from '../web/bus/motion.mjs';
import {createJourneyMap} from '../web/ui/journey.mjs';

const stops = {schemaVersion: 1, stops: [
  {id: '01', name: '출발', arsId: '00123', lng: 127, lat: 37.5},
  {id: '02', name: '회차', arsId: null, lng: 127.01, lat: 37.51},
]};
const route = {id: '100000001', name: '100', type: 'trunk', stopIds: ['01', '02', '01'],
  path: [[127, 37.5], [127.01, 37.51], [127, 37.5]], pathSource: 'stops'};

test('v1 adapter preserves repeated stops, string IDs and approximation provenance', () => {
  const data = prepareBusData({schemaVersion: 1, routes: [route]}, stops);
  assert.deepEqual(data.routeById.get(route.id).stopIds, ['01', '02', '01']);
  assert.equal(data.stopById.get('01').arsId, '00123');
  assert.equal(data.routesByStop.get('01').length, 1);
  assert.equal(data.routeById.get(route.id).approximate, true);
  assert.throws(() => prepareBusData({routes: [route]}, stops), /Unsupported/);
});

test('a viewport inside a route bbox but between its arms does not request that route', () => {
  const far = {...route, path: [[126, 37], [126, 38], [128, 38], [128, 37]]};
  const data = prepareBusData({schemaVersion: 1, routes: [far]}, stops);
  assert.equal(visibleBusRoutes(data, [126.9, 37.4, 127.1, 37.6]).length, 0);
});

test('culling, selected-route priority and per-request cap preserve the server budget', () => {
  const routes = Array.from({length: 20}, (_, i) => ({...route, id: String(100000000 + i)}));
  const data = prepareBusData({schemaVersion: 1, routes}, stops);
  const visible = visibleBusRoutes(data, [126.999, 37.499, 127.002, 37.502], routes[19].id);
  assert.equal(visible[0].route.id, routes[19].id);
  const url = new URL(busRequestURL(visible.map(r => r.route.id), routes[19].id), 'http://test');
  assert.equal(url.searchParams.get('routes').split(',').length, 8);
  assert.equal(url.searchParams.get('focus'), routes[19].id);
  assert.equal(new URL(busRequestURL([route.id], 'not-visible'), 'http://test').searchParams.has('focus'), false);
});

test('broken coordinates and unknown stop references never reach the map source', () => {
  const data = prepareBusData({schemaVersion: 1, routes: [
    {...route, stopIds: ['01', 'missing', '02']}, {...route, id: 'broken', path: [[null, 37], [127, 37.5]]},
  ]}, stops);
  assert.equal(data.routeById.size, 1);
  assert.deepEqual(data.routeById.get(route.id).stopIds, ['01', '02']);
});

let arrivalBody = {schemaVersion: 1, mode: 'live', status: 'fresh', fetchedAt: '2026-10-07T05:05:20Z', ageSeconds: 0, arrivals: [
  {routeId: route.id, name: '100', type: 'trunk', direction: '회차', buses: [{message: '곧 도착', seconds: 40, last: false}, {message: '8분후[5번째 전]', seconds: 480, last: true}]},
  {routeId: '100100513', name: '6100', type: 'airport', direction: null, buses: [{message: '3분후[1번째 전]', seconds: 197, last: false}]},
], errors: []};

async function withLayerFixture(run, enabled=true) {
  const originals = Object.fromEntries(['document', 'localStorage', 'matchMedia', 'devicePixelRatio', 'cancelAnimationFrame'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const node = () => ({style: {}, setAttribute() {}, addEventListener() {}, removeEventListener() {}, after() {}, append() {}, remove() {}, clientWidth: 400, clientHeight: 300,
    getContext: () => ({clearRect() {}, setTransform() {}})});
  const sources = new Map(), canvas = node(), container = node();
  const map = {getLayer: () => true, addLayer() {}, setLayoutProperty() {}, addSource: id => sources.set(id, {setData(data) {this.data=data;}}), getSource: id => sources.get(id),
    getCanvas: () => canvas, getContainer: () => container, getZoom: () => 16, on() {}, off() {},
    getBounds: () => ({getWest: () => 126.99, getSouth: () => 37.49, getEast: () => 127.02, getNorth: () => 37.52})};
  Object.assign(globalThis, {document: {documentElement: {dataset: {}}, createElement: node, getElementById: () => null, querySelector: () => null, addEventListener() {}, removeEventListener() {}, hidden: false},
    localStorage: {getItem: () => null, setItem() {}}, matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}}), devicePixelRatio: 1, cancelAnimationFrame() {}});
  let layer; const requested = [];
  try {
    layer = createBusLayer({map, fetcher: async function(url) {
      // Window.fetch rejects non-Window receivers. Node's fetch alone cannot catch this regression.
      if (this !== undefined) throw new TypeError('Illegal invocation');
      requested.push(url);
      return {ok: true, json: async () => url.includes('routes.json') ? {schemaVersion: 1, routes: [route]} : url.includes('stops.json') ? stops
        : url.includes('stop=') ? arrivalBody : {schemaVersion: 1, mode: 'unavailable', buses: [], routes: {}}};
    }});
    if (enabled !== null) layer.setEnabled(enabled);
    await new Promise(resolve => setImmediate(resolve));
    await run(layer, requested);
  } finally {
    layer?.destroy();
    for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
}

test('browser fetch loads routes and live data without an invalid method receiver', () => withLayerFixture((layer, requested) => {
  assert.equal(layer.data?.routeById.size, 1, 'static routes loaded');
  assert.equal(requested.length, 3, 'two static files and one live request');
}));

test('stops load with nearby buses off, without any live request or default route line', () => withLayerFixture((layer,requested) => {
  assert.equal(layer.enabled,false);
  assert.ok(layer.stopFeatures.length>0);
  assert.equal(requested.length,2);
  assert.equal(layer.map.getSource('bus-routes').data.features.length,0);
  assert.equal(layer.map.getSource('bus-stops'),undefined,'no text/dot stop source remains');
},false));

test('a stop no drawn route serves (마을버스 · 경기 버스만) is still on the map', () => withLayerFixture(layer => {
  const lone = {id: '09', name: '마을버스만', arsId: '22532', lng: 127.005, lat: 37.505};
  layer.data = prepareBusData({schemaVersion: 1, routes: [route]}, {...stops, stops: [...stops.stops, lone]});
  layer.refreshView();
  assert.ok(layer.stopFeatures.some(f => f.properties.id === '09'));
}, false));

test('a stop number selects its route with the switch off; closing returns to static stops', () => withLayerFixture((layer,requested) => {
  layer.select({kind:'stop',id:'01'},null);
  assert.match(layer.detailHTML(),/data-bus-route="100000001"/);
  assert.deepEqual(requested.slice(2),['/api/bus/live?stop=00123'],'opening a stop asks only for its arrivals, never bus positions');
  layer.routeClick({target:{closest:()=>({dataset:{busRoute:route.id}})}});
  assert.deepEqual(layer.requested,[route.id]);
  assert.equal(layer.enabled,false,'selection does not change the always-show preference');
  assert.equal(layer.map.getSource('bus-routes').data.features.filter(f=>f.properties.kind==='ride').length,1);
  assert.ok(!layer.map.getSource('bus-routes').data.features.some(f=>f.properties.kind==='stop'),'고른 노선 위에는 정류장 동그라미가 없다');
  assert.equal(layer.active(),true);
  layer.clearSelection();
  assert.equal(layer.map.getSource('bus-routes').data.features.length,0);
  assert.ok(layer.stopFeatures.length>0);
  assert.equal(layer.active(),false);
  assert.equal(layer.liveController,null);
},false));

test('a selected stop keeps mock disclosure inside the sheet that covers the map notice', () => withLayerFixture(layer => {
  layer.select({kind:'stop',id:'01'},null);
  layer.routeClick({target:{closest:()=>({dataset:{busRoute:route.id}})}});
  assert.doesNotMatch(layer.detailHTML(),/예시 데이터/);
  layer.setLiveData({schemaVersion:1,mode:'mock',buses:[],routes:{}},[route.id]);
  assert.match(layer.detailHTML(),/예시 데이터 · 실제 운행 정보 아님/);
},false));

test('number selection and closing notify the shared journey presentation without replacing the stop sheet',()=>withLayerFixture(layer=>{
  const calls=[];layer.onRouteSelect=leg=>calls.push(leg);
  layer.select({kind:'stop',id:'01'},null);
  layer.routeClick({target:{closest:()=>({dataset:{busRoute:route.id}})}});
  assert.equal(calls.at(-1).routeId,route.id);assert.equal(layer.selection.kind,'stop');
  layer.clearSelection();assert.equal(calls.at(-1),null);
},false));

test('background polling is limited by actual stops in the viewport, while selection wins', () => {
  const data=prepareBusData({schemaVersion:1,routes:[route]},stops);
  assert.deepEqual(busRoutesNearStops(data,[127.004,37.504,127.006,37.506]),[], 'a crossing line alone must not spend API quota');
  assert.deepEqual(busRoutesNearStops(data,[127.004,37.504,127.006,37.506],[route.id]),[route.id]);
  const screen={width:390,height:800,project:()=>({x:500,y:200})};
  assert.deepEqual(busRoutesNearStops(data,[126.99,37.49,127.02,37.52],[],screen),[], 'rotated viewport bounds must not include offscreen stops');
  assert.deepEqual(busRoutesNearStops(data,[126.99,37.49,127.02,37.52],[route.id],screen),[route.id], 'an explicit route stays prioritized beyond the viewport');
});

test('legacy journey names need matching geometry; sheet close keeps them, clearing the journey drops them', () => withLayerFixture(layer => {
  const leg={type:'bus',route:'100',path:route.path};
  assert.deepEqual(journeyBusRouteIds(null,[leg]),[], 'journey can begin before z15 has loaded static bus data');
  assert.deepEqual(journeyBusRouteIds(layer.data,[leg]),[route.id]);
  assert.deepEqual(journeyBusRouteIds(layer.data,[{...leg,path:[[126,36],[126.01,36.01]]}]),[]);
  layer.setJourney([leg]);assert.deepEqual(layer.chosenIds(),[route.id]);
  assert.equal(layer.map.getSource('bus-routes').data.features.filter(f=>f.properties.kind==='ride').length,1);
  layer.clearSelection();assert.deepEqual(layer.chosenIds(),[route.id],'시트 닫기 · 다른 시트 열기는 길찾기 버스 구간을 지우지 않는다');
  assert.equal(layer.map.getSource('bus-routes').data.features.filter(f=>f.properties.kind==='ride').length,1);
  layer.clearSelection({journey:true});assert.deepEqual(layer.chosenIds(),[]);
  assert.equal(layer.map.getSource('bus-routes').data.features.length,0);
  layer.map.getZoom=()=>11;
  layer.setJourney([leg]);
  assert.equal(layer.map.getSource('bus-routes').data.features.filter(f=>f.properties.kind==='ride').length,1,'selected journey routes stay visible when fitBounds zooms out');
  assert.equal(layer.active(),true,'journey buses are polled zoomed out too, like a route chosen by number (2026-10-11)');
  layer.clearSelection({journey:true});assert.equal(layer.active(),false,'low zoom without a journey or a chosen route must not poll');
},false));

// 2026-10-11 행님: 길찾기 버스는 탄 정류장 → 내릴 정류장 구간만(노선 전체가 보였다). 정류장 · 노선 번호로 고르면 전체.
test('a journey bus ride matches its direction on an out-and-back line', () => {
  const line = buildBusPath(route.path), half = line.total / 2;
  const back = journeyBusRange(line, {path: [[127.008, 37.508], [127.002, 37.502]]});   // 회차 뒤 돌아오는 쪽을 탔다
  assert.ok(back && back[0] > half && back[1] > back[0] && back[1] < line.total, `got ${back}`);
  const out = journeyBusRange(line, {path: [[127.002, 37.502], [127.008, 37.508]]});
  assert.ok(out && out[1] < half, `got ${out}`);
  assert.equal(journeyBusRange(line, {path: [[126, 36], [126.01, 36.01]]}), null, 'far from the line: draw the whole route');
});

test('a ride just after the turn of an out-and-back line keeps its own pass (Codex: 0→1000→0 m, back 900→600 m)', () => {
  const kx = 111320 * Math.cos(37.5 * Math.PI / 180), at = m => [127 + m / kx, 37.5];
  for (const step of [1000, 100]) {   // 꼭짓점이 적을 때 · 100 m 마다일 때
    const marks = []; for (let m = 0; m <= 1000; m += step) marks.push(m); for (let m = 1000 - step; m >= 0; m -= step) marks.push(m);
    const range = journeyBusRange(buildBusPath(marks.map(at)), {path: [at(900), at(600)]});
    assert.ok(range && Math.abs(range[0] - 1100) < 5 && Math.abs(range[1] - 1400) < 5, `step ${step}: got ${range}`);
  }
});

test('between the same two stops, the ride takes the branch its shape follows', () => {
  const A = [127, 37.5], U = [127.005, 37.503], B = [127.01, 37.5], L = [127.005, 37.497];
  const line = buildBusPath([A, U, B, L, A, L, B]);   // 위로 한 바퀴 돌고, 다시 아래로 B 까지
  const range = journeyBusRange(line, {path: [A, L, B]});
  const lower = line.distances[4], end = line.total;
  assert.ok(range && Math.abs(range[0] - lower) < 5 && Math.abs(range[1] - end) < 5, `got ${range}, lower branch ${lower}–${end}`);
});

test('a journey draws only the ridden part of its bus route; a route number draws all of it', () => withLayerFixture(layer => {
  const lines = () => layer.map.getSource('bus-routes').data.features.filter(f => f.properties.kind === 'ride').map(f => f.geometry.coordinates);
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4;
  layer.setJourney([{type: 'bus', route: '100', path: [[127.002, 37.502], [127.008, 37.508]]}]);
  const ride = lines();
  assert.equal(ride.length, 1);
  assert.ok(near(ride[0][0], [127.002, 37.502]) && near(ride[0].at(-1), [127.008, 37.508]), 'from boarding to alighting only');
  const stops = layer.map.getSource('bus-routes').data.features.filter(f => f.properties.kind === 'stop').map(f => f.geometry.coordinates);
  assert.ok(stops.length === 2 && near(stops[0], [127.002, 37.502]) && near(stops[1], [127.008, 37.508]), 'boarding and alighting markers at the cut ends');
  layer.select({kind: 'stop', id: '01'}, null);
  layer.routeClick({target: {closest: () => ({dataset: {busRoute: route.id}})}});
  assert.deepEqual(lines()[0], route.path, 'a route chosen by its number is drawn whole');
}, false));

test('journey buses past where I get off are left out; a route chosen by number keeps all its buses', () => withLayerFixture(layer => {
  assert.equal(layer.journeyEnds(), null, 'no journey');
  layer.setJourney([{type: 'bus', route: '100', path: [[127.002, 37.502], [127.008, 37.508]]}]);
  const [[from, end]] = layer.journeyEnds().get(route.id), line = buildBusPath(route.path);
  assert.ok(end > 0 && end < line.total / 2, `alighting on the way out: ${end}`);
  assert.ok(from < 0, 'buses coming from the start of the line up to 5 km before boarding');
  assert.equal(layer.journeyEnds(), layer.journeyEnds(), 'kept until the journey changes');
  layer.routeClick({target: {closest: () => ({dataset: {busRoute: route.id}})}});
  assert.equal(layer.journeyEnds(), null);
}, false));

// 2026-10-11 행님: 길찾기 결과에서 고른 경로 카드를 누르면 시트가 닫히며(closeSheet → clearSelection) 버스 경로만 사라졌다
test('a journey bus leg stays on the map when its sheet closes, and goes with the route', () => withLayerFixture(layer => {
  class Bounds{constructor(a){this.a=a}extend(){return this}}
  const map={...layer.map,setPaintProperty(){},triggerRepaint(){},fitBounds(){},moveLayer(){}};
  const journeyMap=createJourneyMap({map,maplibregl:{LngLatBounds:Bounds},colors:{},byId:new Map(),cityCoords:()=>[],stopPos:()=>[0,0],cityViaduct:null,sheetPad:()=>0,
    journeyCasingPaint:()=>({}),journeyRidePaint:()=>({}),journeyStopPaint:()=>({}),live:{busLayer:layer,settings:{track:{kind:'ground'}},stationAlpha:1}});
  const rides=()=>layer.map.getSource('bus-routes').data.features.filter(f=>f.properties.kind==='ride').length;
  journeyMap.showRoute({legs:[{type:'walk',path:[[126.999,37.5],route.path[0]]},{type:'bus',route:'100',path:route.path},{type:'walk',path:[route.path.at(-1),[127.001,37.5]]}]});
  assert.equal(rides(),1);
  layer.clearSelection();   // what closeSheet · openSheet(other) call
  assert.equal(rides(),1,'the bus leg stays with the journey route and its bar');
  assert.deepEqual(layer.chosenIds(),[route.id]);
  layer.select({kind:'stop',id:'01'},null);layer.clearSelection();   // a stop tapped after the sheet closed, then its sheet closed
  assert.equal(rides(),1,'a stop alone does not replace the journey bus leg');
  journeyMap.clearRoute();   // the bar's ✕, or a new search from a station
  assert.equal(rides(),0);assert.deepEqual(layer.chosenIds(),[]);
},false));

test('an older cached observation cannot move a bus behind a newer observation', () => withLayerFixture(layer => {
  layer.setEnabled(false);
  const now = Date.now();
  const feed = (lng, at) => ({schemaVersion: 1, mode: 'live', fetchedAt: new Date(at).toISOString(),
    buses: [{id: 'vehicle-1', routeId: route.id, lng, lat: 37.5 + lng - 127, receivedAt: new Date(at).toISOString()}], routes: {}});
  layer.setLiveData(feed(127.005, now), [route.id]);
  const latest = layer.fleet.get('vehicle-1');
  for (const age of [10000, 660000]) {
    layer.setLiveData(feed(127.001, now - age), [route.id]);
    assert.ok(layer.fleet.has('vehicle-1'), 'an expired older snapshot must not delete a newer bus');
    assert.equal(layer.fleet.get('vehicle-1').observed, latest.observed);
    assert.equal(layer.fleet.get('vehicle-1').motion.to, latest.motion.to);
    assert.equal(layer.fleet.get('vehicle-1').stale, false);
  }
}));

// 2026-10-11 버스가 정류장도 아닌 데서 섬: 운영 470 · 143 재현(메모 20261011-버스-정확도-멈춤)
test('the next poll follows the server refresh time, not a fixed 30 s after the last answer', () => {
  const at = (status, retryAfterSeconds) => ({status, retryAfterSeconds});
  const ids = ['100000001', '100000002'];
  assert.equal(busPollDelay({pollAfterSeconds: 30, routes: {[ids[0]]: at('cached', 2)}}, ids.slice(0, 1)), 5000, 'a 28 s-old cache is asked again soon');
  assert.equal(busPollDelay({pollAfterSeconds: 30, routes: {[ids[0]]: at('fresh', 30)}}, ids.slice(0, 1)), 32000, 'just after the server can refresh it');
  assert.equal(busPollDelay({pollAfterSeconds: 15, routes: {[ids[0]]: at('fresh', 30), [ids[1]]: {status: 'deferred', retryAfterSeconds: 9}}}, ids), 15000);
  assert.equal(busPollDelay({pollAfterSeconds: 30, routes: {[ids[0]]: at('cached', 20), [ids[1]]: at('cached', 9)}}, ids), 11000);
  assert.equal(busPollDelay({pollAfterSeconds: 15, routes: {}}, []), 15000);
});

test('a bus keeps moving until the next fresh answer, even when its two GPS times were 15 s apart', () => withLayerFixture(layer => {
  layer.setEnabled(false);
  const t0 = Date.now() - 20000;
  const feed = (lng, at) => ({schemaVersion: 1, mode: 'live', fetchedAt: new Date().toISOString(), pollAfterSeconds: 30,
    buses: [{id: 'vehicle-1', routeId: route.id, lng, lat: 37.5 + lng - 127, receivedAt: new Date(at).toISOString()}],
    routes: {[route.id]: {status: 'fresh', ageSeconds: 0, retryAfterSeconds: 30}}});
  layer.setLiveData(feed(127.001, t0), [route.id]);
  layer.setLiveData(feed(127.002, t0 + 15000), [route.id]);
  const bus = layer.fleet.get('vehicle-1');
  assert.ok(bus.motion.to > bus.motion.from + 100, 'it moves to the new position');
  assert.ok(bus.motion.duration >= 32000, `it arrives when the next answer is due, not after the 15 s GPS gap (${bus.motion.duration} ms)`);
  // 28초 뒤 같은 GPS 시각이 다시 온다(서버가 이번엔 못 받았거나 그 차의 원자료가 안 바뀜): 다음 응답 때까지 남은 길만 늘인다
  const realNow = performance.now, later = bus.motion.startedAt + bus.motion.duration - 2000;
  performance.now = () => later;
  try {
    const shown = busMotionDistance(bus.motion, later);
    layer.setLiveData(feed(127.002, t0 + 15000), [route.id]);
    const again = layer.fleet.get('vehicle-1').motion;
    assert.equal(again.to, bus.motion.to, 'the same GPS time again is not a new position: no invented movement past it');
    assert.ok(Math.abs(busMotionDistance(again, later) - shown) < 1e-6, 'no jump');
    assert.ok(again.startedAt + again.duration >= later + 32000, 'it reaches the known position when the next answer is due, instead of standing');
  } finally { performance.now = realNow; }
  assert.equal(busPollDelay({pollAfterSeconds: 30, routes: {[route.id]: {status: 'stale', retryAfterSeconds: 300, reason: 'backoff'}}}, [route.id]), 60000,
    'a long server back-off still asks within the 90 s watch window');
}));

test('a route the server could not refresh this time is not frozen while its positions are recent', () => withLayerFixture(layer => {
  layer.setEnabled(false);
  const at = Date.now() - 40000;
  const feed = lng => ({schemaVersion: 1, mode: 'live', fetchedAt: new Date().toISOString(), pollAfterSeconds: 15,
    buses: [{id: 'vehicle-1', routeId: route.id, lng, lat: 37.5 + lng - 127, receivedAt: new Date(at).toISOString()}],
    routes: {[route.id]: {status: 'stale', ageSeconds: 31, retryAfterSeconds: 2, reason: 'paced'}}});
  layer.setLiveData(feed(127.001), [route.id]);
  assert.equal(layer.fleet.get('vehicle-1').stale, false, 'a 40 s-old position is drawn normally');
  assert.equal(layer.pollMs, 5000, 'and asked again in a few seconds');
  layer.setLiveData({...feed(127.001), buses: [{...feed(127.001).buses[0], id: 'vehicle-2', receivedAt: new Date(Date.now() - 180000).toISOString()}]}, [route.id]);
  assert.equal(layer.fleet.get('vehicle-2').stale, true, 'a position older than two minutes is still shown as delayed');
}));

test('gapped original stop sequences select the return leg of an overlapping route', () => withLayerFixture(layer => {
  layer.setEnabled(false);
  const returnRoute = {...route, stopIds: ['01', '02', '01', '03'], stopSequences: [1, 3, 4, 6],
    path: [[127, 37.5], [127.01, 37.51], [127, 37.5], [127.015, 37.5]]};
  layer.data = prepareBusData({schemaVersion: 1, routes: [returnRoute]}, {...stops, stops: [...stops.stops, {id: '03', name: '종점', lng: 127.015, lat: 37.5}]});
  layer.setLiveData({schemaVersion: 1, mode: 'live', fetchedAt: new Date().toISOString(),
    buses: [{id: 'return-bus', routeId: route.id, lng: 127.005, lat: 37.505, stopSequence: 3}], routes: {}}, [route.id]);
  const bus = layer.fleet.get('return-bus');
  assert.ok(Math.abs(bus.motion.to - (bus.path.distances[1] + bus.path.distances[2]) / 2) < 1,
    'sequence 3 maps to array index 1, halfway along the return leg');
}));

test('the selected next stop refreshes at motion completion within the one-second throttle', () => withLayerFixture(layer => {
  layer.setEnabled(false);
  const now = Date.now();
  layer.setLiveData({schemaVersion: 1, mode: 'live', fetchedAt: new Date(now).toISOString(),
    buses: [{id: 'finishing-bus', routeId: route.id, lng: 127.009, lat: 37.509}], routes: {}}, [route.id]);
  const bus = layer.fleet.get('finishing-bus'), turning = bus.path.stops[1].distance;
  bus.motion = {from: turning - 30, to: turning + 30, startedAt: performance.now(), duration: 2000};
  layer.selection = {kind: 'bus', id: bus.row.id}; layer.selectedRoute = route.id;
  let shown = layer.detailHTML(); layer.updateDetail = html => { shown = html; };
  assert.match(shown, /<dd>회차<small>/);
  // Completion follows a recent detail refresh and occurs even if the bus left the viewport.
  layer.enabled = true; layer.visible = [];
  bus.motion.startedAt = performance.now() - 2001; layer.detailAt = performance.now() - 100;
  layer.draw();
  assert.match(shown, /<dd>출발<small>/);
}));

test('한 대의 오래된 위치는 지도 전체 지연 알림을 켜지 않고, 노선을 못 받으면 켠다', () => withLayerFixture(layer => {
  layer.fleet.set('old', {stale: true, mock: false, route}); layer.routeStates = {[route.id]: {status: 'cached'}};
  layer.updateStatus();
  assert.equal(layer.notice.textContent, '', '그 버스만 흐리게 그린다');
  layer.routeStates = {[route.id]: {status: 'stale'}};
  layer.updateStatus();
  assert.equal(layer.notice.textContent, '버스 위치 갱신 지연');
}));

test('처음부터 화면 근처 버스를 받지 않는다: 정적 노선 · 정류장만', () => withLayerFixture((layer, requested) => {
  assert.equal(layer.enabled, false);
  assert.equal(layer.active(), false);
  assert.equal(requested.filter(url => url.startsWith('/api/bus/live')).length, 0);
}, null));

test('정류장 팝업: 번호 배지 · 새로고침 / 곧 도착 1대 카드(다음 버스 · 앞뒤 정류장) / 한 줄 목록과 흐르는 남은 시간', () => withLayerFixture(async (layer, requested) => {
  layer.select({kind: 'stop', id: '01'}, null);
  assert.match(layer.detailHTML(), /data-bus-route="100000001"[^>]*>.*<i class="bus-wait"><\/i>/, '오는 동안에도 번호는 누를 수 있고 시간 자리만 빈 막대');
  await new Promise(resolve => setImmediate(resolve));
  const html = layer.detailHTML();
  assert.match(html, /<span class="bus-stop-no">.*00123<\/span><h3 tabindex="-1">출발<\/h3>/);
  assert.match(html, /<button type="button" class="bus-refresh" data-bus-refresh aria-label="도착 정보 새로 받기 · 14:05:20 기준"><span>14:05:20<\/span>/);
  assert.match(html, /<button type="button" class="bus-hero" data-bus-route="100000001" aria-pressed="false">.*회차 방면.*<span class="bus-hero-soon">곧 도착<\/span><span class="bus-hero-next">다음 8분<\/span>/);
  assert.match(html, /<span class="bus-track-names"><span>회차<\/span><b>출발<\/b><span><\/span><\/span>/, '같은 정류장을 두 번 지나는 노선은 앞 정류장이 있는 쪽');
  assert.match(html, /class="bus-row" data-bus-route="100000001"[^>]*>.*<span class="bus-soon">곧 도착<\/span>/, '곧 도착은 초 없이');
  assert.match(html, /<span class="bus-num" style="--c:#3567C8">100<\/span>/);
  assert.match(html, /<div class="bus-row">.*>6100<.*<span class="bus-tag">지도 없음<\/span>.*<span class="bus-away">1번째 전<\/span><span class="bus-eta" data-eta="\d+">3분 1\d초<\/span>/);
  assert.ok(html.indexOf('>100<') < html.indexOf('>6100<'), '곧 도착이 3분 뒤보다 먼저');
  layer.refreshArrivals();
  assert.match(requested.at(-1), /stop=00123&fresh=1$/, '새로고침은 서버에 새로 묻는다');
  layer.clearSelection();
  assert.equal(layer.arrivalTick, 0, '닫으면 1초 시계도 멈춘다');
  assert.equal(layer.arrivals, null);
}, false));

test('곧 도착이 여러 대면 카드에는 번호만: 한 줄에 들어가는 만큼, 넘치면 + 남은 수', () => withLayerFixture(async layer => {
  const saved = arrivalBody;
  const soon = n => Array.from({length: n}, (_, i) => ({routeId: String(100100100 + i), name: String(200 + i), type: 'trunk', direction: '종점',
    buses: [{message: '곧 도착', seconds: 30 + i, last: false}]}));
  try {
    for (const [n, shown, more] of [[5, 5, ''], [8, 5, '+3']]) {   // '200'~'207': 한 배지 약 48px, 300px 에 6개는 넘친다
      arrivalBody = {schemaVersion: 1, mode: 'live', status: 'fresh', fetchedAt: '2026-10-07T05:05:20Z', ageSeconds: 0, arrivals: soon(n), errors: []};
      layer.select({kind: 'stop', id: '01'}, null);
      await new Promise(resolve => setImmediate(resolve));
      const head = layer.detailHTML().match(/<span class="bus-hero-head is-many">(.*?)<\/span><span class="bus-hero-now">/)[1];
      assert.equal((head.match(/class="bus-num"/g) || []).length, shown, `${n}대`);
      assert.equal(head.includes(`bus-num-more">${more}<`), !!more);
      assert.doesNotMatch(head, /방면|지도에 표시 중/, '여러 대면 방면 · 지도 표시는 뺀다');
      assert.match(layer.detailHTML(), /<div class="bus-hero">/, '여러 대 카드는 누르는 버튼이 아니다');
    }
  } finally { arrivalBody = saved; }
}, false));

test('남은 시간 표기: 분 초, 1분 안은 초, 0이면 도착 중', () => {
  assert.equal(countdownText(432), '7분 12초');
  assert.equal(countdownText(65), '1분 05초');
  assert.equal(countdownText(48.4), '48초');
  assert.equal(countdownText(-3), '도착 중');
});

test('서울시 도착 문구를 시간과 덧말로: 막차는 한 번만', () => {
  assert.deepEqual(arrivalParts({message: '6분후[3번째 전]', last: false}), {when: '6분 후', detail: '3번째 전'});
  assert.deepEqual(arrivalParts({message: '[막차] 14분후[9번째 전]', last: true}), {when: '14분 후', detail: '9번째 전 · 막차'});
  assert.deepEqual(arrivalParts({message: '2분12초후[1번째 전]'}), {when: '2분 후', detail: '1번째 전'});
  assert.deepEqual(arrivalParts({message: '40초후[1번째 전]'}), {when: '곧 도착', detail: '1번째 전'});
  assert.deepEqual(arrivalParts({message: '운행종료'}), {when: '운행종료', detail: ''});
  assert.deepEqual(arrivalParts({message: '곧 도착', last: true}), {when: '곧 도착', detail: '막차'});
});

test('번호 없는 가상 정류장은 도착 정보를 부르지 않는다', () => withLayerFixture(async (layer, requested) => {
  layer.select({kind: 'stop', id: '02'}, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(layer.detailHTML(), /이 정류장은 도착 정보가 없어요/);
  assert.equal(requested.filter(url => url.includes('stop=')).length, 0);
}, false));

test('도착 정보 한도 소진은 그대로 알린다', () => withLayerFixture(async layer => {
  const saved = arrivalBody;
  arrivalBody = {schemaVersion: 1, mode: 'live', status: 'error', fetchedAt: null, arrivals: [], errors: [{code: 'daily_limit'}]};
  try {
    layer.select({kind: 'stop', id: '01'}, null);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(layer.detailHTML(), /오늘 도착 정보 조회 한도를 다 썼어요/);
  } finally { arrivalBody = saved; }
}, false));

test('정류장에서 고른 노선은 노선 전체가 보이게 멀리 빼도 그 노선 버스만 계속 받는다', () => withLayerFixture(layer => {
  layer.select({kind: 'stop', id: '01'}, null);
  layer.routeClick({target: {closest: () => ({dataset: {busRoute: route.id}})}});
  layer.map.getZoom = () => 10;
  assert.equal(layer.active(), true);
  layer.refreshView();
  assert.deepEqual(layer.requested, [route.id]);
  layer.routeClick({target: {closest: () => ({dataset: {busRoute: route.id}})}});   // 다시 누르면 해제
  assert.equal(layer.active(), false, '고른 노선이 없으면 멀리서는 받지 않는다');
}, false));

test('곧 도착 카드의 버스 아이콘: 지도에 띄운 노선이면 지도 위 버스가 구간의 어디쯤인지, 아니면 가운데쯤', () => withLayerFixture(layer => {
  const r = layer.data.routeById.get(route.id), path = layer.geometry(r);
  const from = path.stops[1].distance, to = path.stops[2].distance;
  assert.equal(layer.approach(r, '01').ratio, .52, '노선을 안 띄웠으면 위치를 모른다');
  layer.selectedRoute = route.id;
  layer.fleet.set('b', {route: r, stale: false, motion: {from: from + (to - from) * .75, to: from + (to - from) * .75, startedAt: 0, duration: 0}});
  const near = layer.approach(r, '01');
  assert.ok(Math.abs(near.ratio - .75) < .01, `구간의 3/4: ${near.ratio}`);
  assert.equal(near.prev, '회차');
}, false));

test('긴 버스 번호(5글자 이상)는 배지 글자를 줄인다', () => withLayerFixture(async layer => {
  const saved = arrivalBody;
  arrivalBody = {...saved, arrivals: [{routeId: '234000001', name: '7101파주', type: 'other', direction: '파주', buses: [{message: '4분후[1번째 전]', seconds: 240, last: false}]}]};
  try {
    layer.select({kind: 'stop', id: '01'}, null);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(layer.detailHTML(), /<span class="bus-num bus-num-long"[^>]*>7101파주<\/span>/);
  } finally { arrivalBody = saved; }
}, false));

test('따라가기 카메라용 버스 위치: 그려지는 노선 선 위 지금 자리, 없거나 안 보이는 버스는 null', () => withLayerFixture(layer => {
  const r = layer.data.routeById.get(route.id), path = layer.geometry(r), half = path.total / 4;
  layer.selectedRoute = route.id;
  layer.fleet.set('b', {route: r, path, stale: false, motion: {from: half, to: half, startedAt: 0, duration: 0}});
  const p = layer.vehiclePosition('b');
  assert.ok(Math.abs(p[0] - 127.005) < 1e-4 && Math.abs(p[1] - 37.505) < 1e-4, `노선 첫 구간 가운데: ${p}`);
  assert.equal(layer.vehiclePosition('없는 버스'), null);
  layer.selectedRoute = null;
  assert.equal(layer.vehiclePosition('b'), null, '버스를 안 그리는 동안은 따라갈 자리도 없다');
}, false));

test('따라가는 동안(매 프레임 jumpTo → moveend) 화면 상자가 시작 자리에 얼지 않는다: 1초마다 새로, 멈추면 200 ms 뒤', t => withLayerFixture(layer => {
  let now = 0, lng = 127; const realNow = performance.now;
  t.mock.timers.enable({apis: ['setTimeout']}); performance.now = () => now;
  layer.map.getBounds = () => ({getWest: () => lng - .002, getSouth: () => 37.499, getEast: () => lng + .002, getNorth: () => 37.501});
  try {
    let refreshed = 0; const at = [0], refresh = layer.refreshView.bind(layer); layer.refreshView = () => { refreshed++; at.push(now); refresh(); };
    for (; now < 5000; now += 33) { lng += .00003; layer.move(); t.mock.timers.tick(33); }   // 30 fps 로 5초, 초속 약 80 m 로 동쪽
    assert.ok(refreshed >= 4, `5초 내내 움직이는 동안 ${refreshed}번 새로 잡음`);
    assert.ok(Math.max(...[...at, now].slice(1).map((x, i) => x - at[i])) <= 1000 + 2 * 33, `새로 잡은 때 ${at}: 1초(+ 앞뒤 한 프레임씩)보다 벌어지지 않는다`);
    assert.ok(layer.box[0] < lng && lng < layer.box[2], `상자 ${layer.box} 가 지금 화면 가운데 ${lng} 를 담는다`);
    refreshed = 0; t.mock.timers.tick(166); assert.equal(refreshed, 0);   // 마지막 moveend 뒤 이미 33 ms 지남
    t.mock.timers.tick(1); assert.equal(refreshed, 1, '멈추면 200 ms 뒤 한 번');
    refreshed = 0; now += 5000; layer.move(); t.mock.timers.tick(150); layer.move(); assert.equal(refreshed, 0, '한 번 움직이고 멈춘 지도는 예전처럼 기다린다');
  } finally { performance.now = realNow; }
}, false));

test('따라가는 버스는 낡은 화면 상자(this.box) 밖이어도 지금 화면 안이면 그린다', () => withLayerFixture(layer => {
  const r = layer.data.routeById.get(route.id), path = layer.geometry(r), bounds = c => () => ({getWest: () => c[0] - .001, getSouth: () => c[1] - .001, getEast: () => c[0] + .001, getNorth: () => c[1] + .001});
  layer.selectedRoute = route.id;
  layer.map.getBounds = bounds([127.001, 37.501]); layer.refreshView();   // 따라가기 시작 자리에서 잡은 상자
  layer.map.getBounds = bounds([127.005, 37.505]);                         // 카메라는 버스와 함께 옮겨 왔고 moveend 기다림은 아직
  layer.fleet.set('b', {row: {id: 'b'}, route: r, path, stale: false, receivedWall: Date.now(), observed: null, motion: {from: path.total / 4, to: path.total / 4, startedAt: 0, duration: 0}});
  assert.ok(!(layer.box[2] >= 127.005), `버스가 낡은 상자 ${layer.box} 밖`);
  const K = 512 * 2 ** 16, ox = 127.005 / 360 + .5, oy = .5 - Math.log(Math.tan(Math.PI / 4 + 37.505 * Math.PI / 360)) / (2 * Math.PI), sx = K * 2 / 400, sy = K * 2 / 300;
  const matrix = [sx, 0, 0, 0, 0, -sy, 0, 0, 0, 0, 0, 0, -ox * sx, oy * sy, 0, 1];   // 위에서 내려다보는 400×300, 가운데 = 지금 화면 가운데
  let drawn = null; layer.renderer.render = (gl, m, scene) => { drawn = scene.vehicles; };
  layer.render({}, matrix);
  assert.equal(drawn?.length, 1, '화면 가운데 버스를 그린다');
  assert.equal(layer.hits.length, 1, '누를 자리도 있다');
}, false));

// 위에서 내려다보는 휴대폰 화면(390×844): 화면 가운데 = origin
function topDownView(zoom, center) {
  const K = 512 * 2 ** zoom, ox = center[0] / 360 + .5, oy = .5 - Math.log(Math.tan(Math.PI / 4 + center[1] * Math.PI / 360)) / (2 * Math.PI);
  return {width: 390, height: 844, zoom, unit: 1 / K, origin: [ox, oy], phone: true,
    project: w => ({x: 195 + (w[0] - ox) * K, y: 422 + (w[1] - oy) * K})};
}
const stopPoint = (id, lng, lat) => ({type: 'Feature', geometry: {type: 'Point', coordinates: [lng, lat]}, properties: {id, name: id}});

test('a stop standing on an exit pillar is moved beside it, not dropped (청담역 11번 출구 · 진흥아파트)', () => {
  const exit = [127.052099, 37.519287], stop = stopPoint('진흥아파트', 127.05209, 37.519291);
  for (const zoom of [16, 17, 18]) {
    const {hits} = placeStopPosts([stop], [exit], topDownView(zoom, exit));
    assert.equal(hits.length, 1, `zoom ${zoom}`);
    const [left, , right] = hits[0].visualBounds;   // 출구 기둥은 화면 가운데(x 195)
    assert.ok(left > 195 + 5 || right < 195 - 5, `zoom ${zoom}: post ${left}–${right} is clear of the pillar`);
  }
});

test('two stops on the same spot both get a post from zoom 16 (석계역1번출구.A · B)', () => {
  const a = stopPoint('A', 127.0656, 37.6149), b = stopPoint('B', 127.06561, 37.61490);
  for (const zoom of [16, 17, 18]) assert.equal(placeStopPosts([a, b], [], topDownView(zoom, [127.0656, 37.6149])).hits.length, 2, `zoom ${zoom}`);
  assert.equal(placeStopPosts([a, b], [], topDownView(15, [127.0656, 37.6149])).hits.length, 1, 'zoom 15 keeps one post per spot');
});
