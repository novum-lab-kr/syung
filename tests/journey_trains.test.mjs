// 길찾기 중에는 내가 가는 방향의 열차만 보인다(2026-10-11): web/ui/journey.mjs trainShown · journeyTrain
import test from 'node:test';
import assert from 'node:assert/strict';
import {createJourneyMap} from '../web/ui/journey.mjs';

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
