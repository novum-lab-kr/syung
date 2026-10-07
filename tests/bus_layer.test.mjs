import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBusData, visibleBusRoutes, busRequestURL, createBusLayer, busRoutesNearStops, journeyBusRouteIds} from '../web/lib/bus_layer.mjs';

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

let arrivalBody = {schemaVersion: 1, mode: 'live', status: 'fresh', fetchedAt: '2026-10-07T05:05:20Z', arrivals: [
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

test('a stop number selects its route with the switch off; closing returns to static stops', () => withLayerFixture((layer,requested) => {
  layer.select({kind:'stop',id:'01'},null);
  assert.match(layer.detailHTML(),/data-bus-route="100000001"/);
  assert.deepEqual(requested.slice(2),['/api/bus/live?stop=00123'],'opening a stop asks only for its arrivals, never bus positions');
  layer.routeClick({target:{closest:()=>({dataset:{busRoute:route.id}})}});
  assert.deepEqual(layer.requested,[route.id]);
  assert.equal(layer.enabled,false,'selection does not change the always-show preference');
  assert.equal(layer.map.getSource('bus-routes').data.features.filter(f=>f.properties.kind==='ride').length,1);
  assert.ok(layer.map.getSource('bus-routes').data.features.some(f=>f.properties.kind==='stop'));
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

test('legacy journey names need matching geometry and clear on sheet close', () => withLayerFixture(layer => {
  const leg={type:'bus',route:'100',path:route.path};
  assert.deepEqual(journeyBusRouteIds(null,[leg]),[], 'journey can begin before z15 has loaded static bus data');
  assert.deepEqual(journeyBusRouteIds(layer.data,[leg]),[route.id]);
  assert.deepEqual(journeyBusRouteIds(layer.data,[{...leg,path:[[126,36],[126.01,36.01]]}]),[]);
  layer.setJourney([leg]);assert.deepEqual(layer.chosenIds(),[route.id]);
  assert.equal(layer.map.getSource('bus-routes').data.features.filter(f=>f.properties.kind==='ride').length,1);
  layer.clearSelection();assert.deepEqual(layer.chosenIds(),[]);
  assert.equal(layer.map.getSource('bus-routes').data.features.length,0);
  layer.map.getZoom=()=>11;
  layer.setJourney([leg]);
  assert.equal(layer.map.getSource('bus-routes').data.features.filter(f=>f.properties.kind==='ride').length,1,'selected journey routes stay visible when fitBounds zooms out');
  assert.equal(layer.active(),false,'low zoom must not poll or show bus vehicles');
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

test('정류장 팝업: 도착 문구 · 다음 버스 · 막차 · 방면, 노선 자료에 없는 번호는 누를 수 없는 이름표', () => withLayerFixture(async (layer, requested) => {
  layer.select({kind: 'stop', id: '01'}, null);
  assert.match(layer.detailHTML(), /도착 정보를 불러오는 중/);
  await new Promise(resolve => setImmediate(resolve));
  const html = layer.detailHTML();
  assert.match(html, /data-bus-route="100000001"[^>]*>간선 <b>100<\/b><\/button><span class="bus-arrival">곧 도착<small>다음 8분후\[5번째 전\] · 막차<\/small><small>회차 방면<\/small>/);
  assert.match(html, /<span class="bus-route-tag"[^>]*>공항 <b>6100<\/b><\/span>/);
  assert.doesNotMatch(html, /data-bus-route="100100513"/);
  assert.match(html, /05:20 기준 도착 정보/);
  layer.arrivals.rows[0].buses[1].message = '[막차] 14분후[9번째 전]'; layer.arrivals.rows[0].buses[0].last = true;
  assert.match(layer.detailHTML(), /곧 도착 <em class="bus-last">막차<\/em><small>다음 \[막차\] 14분후\[9번째 전\]<\/small>/, '문구에 이미 있으면 막차를 덧붙이지 않는다');
  assert.ok(layer.arrivalTimer, '열려 있는 동안 다시 받는다');
  layer.clearSelection();
  assert.equal(layer.arrivalTimer, 0, '닫으면 멈춘다');
  assert.equal(layer.arrivals, null);
  assert.equal(requested.filter(url => url.includes('stop=')).length, 1);
}, false));

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
