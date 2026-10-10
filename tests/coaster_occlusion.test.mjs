import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { signCollisionLayout } from '../web/lib/station_signs.mjs';
import { StationNameLayer } from '../web/map/platform.mjs';
import { registerTransitLayers } from '../web/map/layers.mjs';
import { createModeRegistry } from '../web/modes/index.mjs';

const source = readFileSync(new URL('../web/maplibre_runtime.mjs', import.meta.url), 'utf8');
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function platformRenderer() {
  const draws = [], state = { depth: true, func: 'LESS', mask: true };
  const gl = new Proxy({}, { get(_, key) {
    if (key === 'enable' || key === 'disable') return cap => { if (cap === 'DEPTH_TEST') state.depth = key === 'enable'; };
    if (key === 'depthFunc') return value => { state.func = value; };
    if (key === 'depthMask') return value => { state.mask = value; };
    if (key === 'drawArrays') return (_mode, _first, vertices) => draws.push({ ...state, vertices });
    return /^[A-Z_0-9]+$/.test(key) ? key : () => {};
  } });
  const mode = { coaster: true };
  const layer = new StationNameLayer({ getSelected: () => 'all', getStationAlpha: () => 1, getLabels: () => [], getTrack: () => ({ kind: mode.coaster ? 'coaster' : 'ground' }),
    stationWidthPx: () => 12, platformPx: () => 12, PLATFORM_SCALE: 1, EXIT_MINZOOM: 16, EXIT_MAX_M: 600, EXIT_PASSAGES: true,
    getExits: () => ({}), exitCol: new Map(), colors: { '2호선': '#00ff00' }, hexRGB3: () => [0, 1, 0],
    stationRects: new Map([['2호선:1', { coords: [[.5, .5], [.5001, .5]], offset: 0 }]]),
    map: { getZoom: () => 17, getCenter: () => [.5, .5],
      getBounds: () => ({ getSouthWest: () => [.49, .51], getNorthEast: () => [.51, .49] }),
      project: p => ({ x: p[0], y: p[1] }) },
    maplibregl: { MercatorCoordinate: { fromLngLat: p => ({ x: p[0], y: p[1] }) } },
    matchMedia: () => ({ matches: false }), document: { documentElement: { dataset: { theme: 'light' } } } });
  layer.buildAtlas = () => {};
  layer.attr = Object.fromEntries(['a_px', 'a_local', 'a_size', 'a_uv', 'a_color', 'a_tw'].map(x => [x, x]));
  layer.uni = {};
  return { layer, draws, render(coaster) {
    mode.coaster = coaster;
    layer.render(gl, { defaultProjectionData: { mainMatrix: matrix } });
  } };
}

test('coaster platforms test building depth while the ordinary map preserves its overlays', () => {
  const scene = platformRenderer();
  scene.render(true);
  assert.ok(scene.draws.length > 0 && scene.draws.every(d => d.vertices > 0), 'exercise visible platform geometry');
  assert.ok(scene.draws.every(d => d.depth), 'coaster facilities must be hidden by nearer building depth');
  assert.ok(scene.draws.every(d => d.func === 'LEQUAL' && d.mask === false), 'use the exit pillars depth rule');
  assert.equal(scene.layer.renderingMode, '3d', 'share the buildings projection depth range');
  scene.draws.length = 0;
  scene.render(false);
  assert.ok(scene.draws.length > 0 && scene.draws.every(d => !d.depth), 'ordinary-map platform visibility is preserved');
});

test('station labels keep their route names in every mode (the coaster rides the viaduct; no ground route signs to stand in for them)', async () => {
  const layers = new Map(), updates = [];
  const context = vm.createContext({ Map, signCollisionLayout, ready: true, coaster: false, simcity: false, PHONE: false, RIDE_H: 200,
    effectiveTheme: () => 'light', cityPack: () => null, CityBuildings: class { set() {} },
    map: { addLayer: layer => layers.set(layer.id, layer), getLayer: id => layers.get(id),
      getLayoutProperty: (id, key) => layers.get(id).layout[key],
      setLayoutProperty: (id, key, value) => { layers.get(id).layout[key] = value; updates.push(id); } } });
  // 본체가 load 때 부르는 실제 등록 함수(web/map/layers.mjs)가 만든 층
  Object.assign(context.map, { addSource() {}, addImage() {}, on() {}, getSource: () => ({ setData() {} }) });
  registerTransitLayers({ map: context.map, shapesReady: new Promise(() => {}), basicRouteCache: new Map(), buildLineFeatures: () => [], buildStationFeatures: () => [],
    rebuildLabels() {}, stationNames: { id: 'station-names', type: 'custom' }, STATION_WIDTH_STOPS: [[8, 2], [15, 6]], PHONE: false, signCollisionLayout,
    live: { get track() { return { kind: context.coaster ? 'coaster' : context.simcity ? 'viaduct' : 'ground' }; } } });
  const symbols = [...layers].filter(([, layer]) => layer.type === 'symbol');
  assert.deepEqual(symbols.map(([id]) => id), ['station-labels'], 'exercise the actual name symbol layer (one sign per station)');
  const plain = value => JSON.parse(JSON.stringify(value));
  const original = new Map(symbols.map(([id, layer]) => [id, plain(layer.layout['text-field'])]));
  // Exercise the actual label synchronization without constructing adjacent city renderers.
  // 모드 값은 본체처럼 modeOn(모드 상태의 flags)으로 읽는다
  const start = source.indexOf('function syncCity(){'), end = source.indexOf('const cityViaduct=new CityViaduct(', start);
  assert.ok(start >= 0 && end > start);
  context.modeOn = { get coaster() { return context.coaster; }, get simcity() { return context.simcity; }, joseon: false };
  const registry = createModeRegistry(await Promise.all(['basic', 'simcity', 'joseon', 'coaster'].map(n => import(`../web/modes/${n}/index.mjs`).then(m => m.default))));
  context.modeCtl = { settings: () => registry.settings(context.coaster ? 'coaster' : context.simcity ? 'simcity' : 'basic') };   // 본체처럼 지금 모드의 설정
  vm.runInContext('const cityBuildings=new CityBuildings();const cityOn=()=>modeCtl.settings().city.enabled;\n'+source.slice(start, end), context);
  const sync = coaster => { context.coaster = coaster; vm.runInContext('syncCity()', context); };
  sync(false);
  sync(true);
  for (const [id, field] of original) assert.deepEqual(plain(layers.get(id).layout['text-field']), field, 'coaster labels keep the route names');
  assert.equal(updates.length, 0, 'mode changes do no symbol layout work');
  sync(false);
  for (const [id, field] of original) assert.deepEqual(plain(layers.get(id).layout['text-field']), field, 'the ordinary map keeps them too');
});
