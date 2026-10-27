// 길찾기 중에는 내가 가는 방향의 열차만 보인다(2026-10-11): web/ui/journey.mjs trainShown · journeyTrain
import test from 'node:test';
import assert from 'node:assert/strict';
import {createJourneyMap} from '../web/ui/journey.mts';

function journey() {
  globalThis.document ??= {documentElement: {dataset: {}}, querySelector: () => null};
  class Bounds {extend() {return this}}
  const map = {getSource: () => undefined, addSource() {}, addLayer() {}, getLayer: () => undefined, triggerRepaint() {}, fitBounds() {}, setLayoutProperty() {}};
  return createJourneyMap({map, maplibregl: {LngLatBounds: Bounds}, colors: {}, byId: new Map(), cityCoords: () => [[127, 37.5], [127.01, 37.5]], stopPos: () => [127, 37.5],
    cityViaduct: null, sheetPad: () => 0, journeyCasingPaint: () => ({}), journeyRidePaint: () => ({}), journeyStopPaint: () => ({}),
    live: {busLayer: null, settings: {track: {kind: 'ground'}}, stationAlpha: 1}});
}
const walk = {type: 'walk', path: [[127, 37.5], [127.001, 37.5]]};
const train = (no, line, ids) => ({id: `${line}:${no}`, t: {line, trainNo: no}, seq: ids.map(id => ({id})), cum: ids.map((_, i) => i * 1000)});   // seq: 떠난 역 · 앞길, 역 사이 1000
const shown = (j, p, dist = 500) => j.trainShown(p, dist);   // 기본: 첫 칸 한가운데

test('a journey keeps only the trains coming my way on my line, and its own realtime train', () => {
  const j = journey();
  assert.equal(shown(j, train('1', '1호선', [9, 8])), true, 'no journey: every train');
  j.showRoute({legs: [walk, {type: 'ride', line: '1호선', stations: [1, 2, 3], trainNo: '0176'}, walk]});
  assert.equal(shown(j, train('a', '1호선', [-1, 0, 1, 2, 3, 4])), true, 'coming to my station');
  assert.equal(shown(j, train('b', '1호선', [2, 3, 4])), true, 'inside my ride');
  assert.equal(shown(j, train('c', '1호선', [4, 3, 2, 1, 0])), false, 'the other direction');
  assert.equal(shown(j, train('d', '1호선', [3, 4, 5])), false, 'past where I get off');
  assert.equal(shown(j, train('f', '1호선', [2, 3, 4]), 1500), false, "left my last station ('출발': seq still starts at the one before it)");
  assert.equal(shown(j, train('g', '1호선', [2, 3, 4]), 1000), true, 'standing at my last station');
  assert.equal(shown(j, train('e', '2호선', [1, 2, 3])), false, 'another line');
  assert.equal(shown(j, train('0176', '1호선', [-9, -8])), true, 'the train the journey picked');
  assert.equal(j.journeyTrain(train('0176', '1호선', [-9, -8])), true);
  assert.equal(j.journeyTrain(train('a', '1호선', [0, 1])), false);
  j.clearRoute();
  assert.equal(shown(j, train('c', '1호선', [4, 3, 2])), true, 'route cleared: every train again');
  assert.equal(j.journeyTrain(train('0176', '1호선', [0, 1])), false);
});

test('a bus-only journey shows no trains; a bus route number leaves the trains to subwayOff', () => {
  const j = journey();
  j.showRoute({legs: [walk, {type: 'bus', route: '100', path: [[127, 37.5], [127.01, 37.5]]}, walk]});
  assert.equal(shown(j, train('a', '1호선', [1, 2])), false);
  j.showRoute({legs: [{type: 'bus', route: '100', path: [[127, 37.5], [127.01, 37.5]]}]}, true);
  assert.equal(shown(j, train('a', '1호선', [1, 2])), true);
});

test('a ride through the same station twice (6호선 응암 loop) matches each stretch on its own', () => {
  const j = journey();
  j.showRoute({legs: [walk, {type: 'ride', line: '6호선', stations: [10, 11, 12, 13, 14, 15, 10, 16]}, walk]});   // 응암(10) → 고리 → 응암 → 새절(16)
  assert.equal(shown(j, train('a', '6호선', [15, 10, 16, 17])), true, 'on the last stretch 구산 → 응암 → 새절');
  assert.equal(shown(j, train('b', '6호선', [16, 10, 15])), false, 'the other way');
});

test('in a viaduct mode the ground journey line fades out where the decks come in; on the ground it stays', () => {
  globalThis.document ??= {documentElement: {dataset: {}}, querySelector: () => null};
  const paint = {}, settings = {track: {kind: 'viaduct'}};
  class Bounds {extend() {return this}}
  const map = {sources: {}, getSource(id) {return this.sources[id]}, addSource(id) {this.sources[id] = {setData() {}}}, addLayer() {}, getLayer: () => true, triggerRepaint() {}, fitBounds() {},
    setLayoutProperty() {}, setPaintProperty: (id, k, v) => {paint[id + ' ' + k] = v}, moveLayer() {}};
  const fade = ['interpolate', ['linear'], ['zoom'], 13.6, 1, 14.2, 0];
  const j = createJourneyMap({map, maplibregl: {LngLatBounds: Bounds}, colors: {}, byId: new Map(), cityCoords: () => [[127, 37.5], [127.01, 37.5]], stopPos: () => [127, 37.5],
    cityViaduct: {routeOpacity: () => 0, deckFade: () => fade}, sheetPad: () => 0, journeyCasingPaint: () => ({}), journeyRidePaint: () => ({}), journeyStopPaint: () => ({}),
    live: {busLayer: null, get settings() {return settings}, stationAlpha: 1}});
  const plan = {legs: [walk, {type: 'ride', line: '1호선', stations: [1, 2]}, walk]};
  j.showRoute(plan);
  for (const k of ['journey-ride line-opacity', 'journey-casing line-opacity', 'journey-stop circle-opacity', 'journey-stop circle-stroke-opacity']) assert.deepEqual(paint[k], fade, k);
  assert.equal(j.journeyRides(), j.journeyRides(), 'the viaduct is handed the same rides until the journey changes');
  assert.deepEqual(j.journeyRides().map(l => l.stations), [[1, 2]]);
  settings.track.kind = 'ground'; j.setRouteOpacity();
  assert.equal(paint['journey-ride line-opacity'], 1);
  j.clearRoute(); assert.equal(j.journeyRides(), null, 'route cleared: the viaducts as they were');
});

test('the coaster track shader declares its journey uniforms once and tints before it steps back', async () => {
  const {coasterTrackVertexShader} = await import('../web/modes/coaster/track_mesh.mjs');
  const vs = coasterTrackVertexShader('1.'), names = vs.match(/uniform [^;]+;/g).flatMap(d => d.replace(/^uniform \w+ /, '').replace(';', '').split(',').map(n => n.trim()));
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), [], 'no uniform declared twice');
  for (const n of ['u_route', 'u_dim', 'u_veil']) assert.ok(names.includes(n), n);
  assert.ok(vs.indexOf('if(u_route>.5&&u_route<1.5)') > vs.indexOf('v_c=(kind<.5') && vs.indexOf('if(u_route>1.5)') > vs.indexOf('if(u_route>.5&&u_route<1.5)'));
  const src = (await import('node:fs')).readFileSync(new URL('../web/modes/coaster/track.mjs', import.meta.url), 'utf8');
  for (const n of ['u_route', 'u_dim', 'u_veil']) assert.ok(src.includes(`'${n}'`), `track.mjs looks ${n} up`);
});
