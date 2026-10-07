import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { signCollisionLayout } from '../web/lib/station_signs.mjs';

const source = readFileSync(new URL('../web/maplibre_runtime.mjs', import.meta.url), 'utf8');
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function platformRenderer() {
  const start = source.indexOf('class StationNameLayer{');
  const end = source.indexOf('// Exit pillars (zoom 16+)', start);
  const draws = [], state = { depth: true, func: 'LESS', mask: true };
  const gl = new Proxy({}, { get(_, key) {
    if (key === 'enable' || key === 'disable') return cap => { if (cap === 'DEPTH_TEST') state.depth = key === 'enable'; };
    if (key === 'depthFunc') return value => { state.func = value; };
    if (key === 'depthMask') return value => { state.mask = value; };
    if (key === 'drawArrays') return (_mode, _first, vertices) => draws.push({ ...state, vertices });
    return /^[A-Z_0-9]+$/.test(key) ? key : () => {};
  } });
  const context = vm.createContext({ Map, Float32Array, Math, coaster: true, selected: 'all', stationAlpha: 1,
    stationWidthPx: () => 12, platformPx: () => 12, PLATFORM_SCALE: 1, EXIT_MINZOOM: 16, EXIT_MAX_M: 600, EXIT_PASSAGES: true,
    exits: {}, exitCol: new Map(), colors: { '2호선': '#00ff00' }, hexRGB3: () => [0, 1, 0],
    stationRects: new Map([['2호선:1', { coords: [[.5, .5], [.5001, .5]], offset: 0 }]]),
    map: { getZoom: () => 17, getCenter: () => [.5, .5],
      getBounds: () => ({ getSouthWest: () => [.49, .51], getNorthEast: () => [.51, .49] }),
      project: p => ({ x: p[0], y: p[1] }) },
    maplibregl: { MercatorCoordinate: { fromLngLat: p => ({ x: p[0], y: p[1] }) } },
    matchMedia: () => ({ matches: false }), document: { documentElement: { dataset: { theme: 'light' } } } });
  vm.runInContext(source.slice(start, end) + ';globalThis.Layer=StationNameLayer;', context);
  const layer = new context.Layer();
  layer.buildAtlas = () => {};
  layer.attr = Object.fromEntries(['a_px', 'a_local', 'a_size', 'a_uv', 'a_color', 'a_tw'].map(x => [x, x]));
  layer.uni = {};
  return { layer, draws, render(coaster) {
    context.coaster = coaster;
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

test('station labels keep their route names in every mode (the coaster rides the viaduct; no ground route signs to stand in for them)', () => {
  const layers = new Map(), updates = [];
  const context = vm.createContext({ Map, signCollisionLayout, ready: true, coaster: false, simcity: false, PHONE: false, RIDE_H: 200,
    effectiveTheme: () => 'light', CityBuildings: class { set() {} },
    map: { addLayer: layer => layers.set(layer.id, layer), getLayer: id => layers.get(id),
      getLayoutProperty: (id, key) => layers.get(id).layout[key],
      setLayoutProperty: (id, key, value) => { layers.get(id).layout[key] = value; updates.push(id); } } });
  const definitions = source.split('\n').filter(line => /map\.addLayer\(\{id:'station-labels'|const SIGN_(?:LAYOUT|PAINT)=/.test(line)).join('\n');
  vm.runInContext(definitions, context);
  assert.equal(layers.size, 1, 'exercise the actual name symbol layer (one sign per station)');
  const plain = value => JSON.parse(JSON.stringify(value));
  const original = new Map([...layers].map(([id, layer]) => [id, plain(layer.layout['text-field'])]));
  // Exercise the actual label synchronization without constructing adjacent city renderers.
  const start = source.indexOf('function syncCity(){'), end = source.indexOf('let coaster=false', start);
  vm.runInContext('const cityBuildings=new CityBuildings();const cityOn=()=>simcity||coaster;\n'+source.slice(start, end), context);
  const sync = coaster => { context.coaster = coaster; vm.runInContext('syncCity()', context); };
  sync(false);
  sync(true);
  for (const [id, field] of original) assert.deepEqual(plain(layers.get(id).layout['text-field']), field, 'coaster labels keep the route names');
  assert.equal(updates.length, 0, 'mode changes do no symbol layout work');
  sync(false);
  for (const [id, field] of original) assert.deepEqual(plain(layers.get(id).layout['text-field']), field, 'the ordinary map keeps them too');
});
