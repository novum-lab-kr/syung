import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBusData, visibleBusRoutes, busRequestURL, createBusLayer} from '../web/lib/bus_layer.mjs';

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

async function withLayerFixture(run) {
  const originals = Object.fromEntries(['document', 'localStorage', 'matchMedia', 'devicePixelRatio', 'cancelAnimationFrame'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const node = () => ({style: {}, setAttribute() {}, addEventListener() {}, removeEventListener() {}, after() {}, append() {}, remove() {}, clientWidth: 400, clientHeight: 300,
    getContext: () => ({clearRect() {}, setTransform() {}})});
  const sources = new Map(), canvas = node(), container = node();
  const map = {getLayer: () => true, addLayer() {}, setLayoutProperty() {}, addSource: id => sources.set(id, {setData() {}}), getSource: id => sources.get(id),
    getCanvas: () => canvas, getContainer: () => container, getZoom: () => 16, on() {}, off() {},
    getBounds: () => ({getWest: () => 126.99, getSouth: () => 37.49, getEast: () => 127.02, getNorth: () => 37.52})};
  Object.assign(globalThis, {document: {documentElement: {dataset: {}}, createElement: node, getElementById: () => null, addEventListener() {}, removeEventListener() {}, hidden: false},
    localStorage: {getItem: () => null, setItem() {}}, matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}}), devicePixelRatio: 1, cancelAnimationFrame() {}});
  let layer; const requested = [];
  try {
    layer = createBusLayer({map, fetcher: async function(url) {
      // Window.fetch rejects non-Window receivers. Node's fetch alone cannot catch this regression.
      if (this !== undefined) throw new TypeError('Illegal invocation');
      requested.push(url);
      return {ok: true, json: async () => url.includes('routes.json') ? {schemaVersion: 1, routes: [route]} : url.includes('stops.json') ? stops : {schemaVersion: 1, mode: 'unavailable', buses: [], routes: {}}};
    }});
    layer.setEnabled(true);
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
