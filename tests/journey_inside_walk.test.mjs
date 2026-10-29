// 길찾기 지도의 역 안 걷기(web/ui/journey.mts insideWalk): 선로를 따라 출구 가까운 점까지 간 뒤 출구로 꺾는다
import test from 'node:test';
import assert from 'node:assert/strict';
import {insideWalk} from '../web/ui/journey.mts';

// 동서로 긴 선로(경도 0.001 ≈ 88 m): 승강장은 가운데, 출구는 서쪽 끝 도로 쪽(북쪽 20 m 옆)
const track = [[127.050, 37.5], [127.052, 37.5], [127.054, 37.5], [127.056, 37.5]];
const platform = [127.054, 37.5];
const exit = [127.0505, 37.50018];

test('출구가 선로 끝 쪽이면 선로를 따라가다 꺾는다', () => {
  const way = insideWalk(track, platform, exit);
  assert.deepEqual(way[0], platform);
  assert.deepEqual(way.at(-1), exit);
  assert.ok(way.length >= 4, '선로 꼭짓점을 지난다');
  assert.ok(way.slice(1, -1).every(([, lat]) => Math.abs(lat - 37.5) < 1e-9), '가운데 점은 모두 선로 위');
});

test('선로가 없으면 직선', () => {
  assert.deepEqual(insideWalk([], platform, exit), [platform, exit]);
  assert.deepEqual(insideWalk([platform], platform, exit), [platform, exit]);
});

test('출구가 선로보다 승강장에 가까우면 직선', () => {
  const near = [127.0541, 37.50009];
  assert.deepEqual(insideWalk(track, platform, near), [platform, near]);
});

test('선로 밖으로 한참 돌아가는 길이면 직선', () => {
  const far = [127.054, 37.505];   // 선로에서 550 m 위
  assert.deepEqual(insideWalk(track, platform, far), [platform, far]);
});

// 같은 역 환승(ride → ride, 걷기 없음): 노선마다 승강장 점이 달라도 두 점을 옅은 선(inside)으로 잇는다(Codex 리뷰 2026-10-29)
import {createJourneyMap} from '../web/ui/journey.mts';
test('연속된 ride 사이 환승이 두 승강장 점을 잇는다', () => {
  globalThis.document ??= {documentElement: {dataset: {}}, querySelector: () => null};
  const sources = {};
  class Bounds {extend() {return this}}
  const map = {getSource: () => undefined, addSource(id, spec) {sources[id] = spec}, addLayer() {}, getLayer: () => undefined, triggerRepaint() {}, fitBounds() {}, setLayoutProperty() {}};
  const platform = {'1호선:5': [127.054, 37.5], '2호선:5': [127.0525, 37.5003]};
  const station = {id: 5};
  const journey = createJourneyMap({map, maplibregl: {LngLatBounds: Bounds}, colors: {}, byId: new Map([[1, {id: 1}], [5, station], [9, {id: 9}]]),
    cityCoords: () => [[127.05, 37.5], [127.056, 37.5]], stopPos: (line, st) => platform[`${line}:${st.id}`] ?? [127.0, 37.5],
    stationTrack: () => track, cityViaduct: null, sheetPad: () => 0, journeyCasingPaint: () => ({}), journeyRidePaint: () => ({}), journeyStopPaint: () => ({}),
    live: {busLayer: null, settings: {track: {kind: 'ground'}}, stationAlpha: 1}});
  journey.showRoute({legs: [
    {type: 'ride', line: '1호선', stations: [1, 5]},
    {type: 'ride', line: '2호선', stations: [5, 9]},
  ]});
  const inside = sources.journey.data.features.filter(f => f.properties.kind === 'inside');
  assert.equal(inside.length, 1);
  assert.deepEqual(inside[0].geometry.coordinates.at(0), platform['1호선:5']);
  assert.deepEqual(inside[0].geometry.coordinates.at(-1), platform['2호선:5']);
});
