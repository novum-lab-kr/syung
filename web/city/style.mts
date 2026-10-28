// 심시티 지면 — the miniature city's ground, on the MapLibre basemap: zone floors by landuse class, roads
// by class with pavements, lane marks and centre lines close up, rail ballast, paths and plazas.
//
// Everything that is a colour, a width or a zoom comes from a style pack (web/modes/basic/city.mts is the
// one pack for now); this module turns the pack into MapLibre layer definitions, paint and a palette,
// and the runtime applies them where it already builds its basemap:
//
//   import {addCityLayers, applyCityStyle, cityPalette} from './city/style.mts';
//   addCityLayers(map, {pack});                                   // once, at the end of addBasemap()
//   Object.assign(palette, cityPalette(theme, {pack, tone}));  // in mapPalette() — tone: 팩의 modes 항목 이름(모드 설정 city.tone: simcity · coaster)
//   applyCityStyle(map, {on, theme, tone, mapOn, pack});       // in applyTheme() and the map toggle
//
// In coaster mode the ground is the same city, toned down (spec §7: luma mix in linear light, then a
// touch darker) so the rides and the trains stand out against it.

import SEOUL from '../modes/basic/city.mts';

type Hex = string;
type Theme = 'light' | 'dark';
type Rgb = number[];
// 땅 색 한 벌(용도 → 색): 이 파일이 이름으로 읽는 칸 + 용도 이름으로 찾는 칸
interface GroundColors { base:Hex; park:Hex; grass:Hex; forest:Hex; water:Hex; sidewalk:Hex; ballast:Hex; [key:string]:Hex | undefined }
// 흙 질감(조선 팩 ground.texture)
export interface DirtTexture { size:number; pixelRatio?:number; blotch:number; grain:number; crumbs:number; pebbles:number }
interface RoadSpec { widthM:number; sidewalkM?:number; colors:Record<Theme, Hex> }
// 모드마다 색 맞추기(팩 modes.simcity · coaster …)
interface ModeTone { saturation?:Partial<Record<Theme, number>>; brightness?:Partial<Record<Theme, number>>; shadowOpacity?:Partial<Record<Theme, number>> }
interface NightRoadLayer { colors?:Record<string, Hex>; widthMul?:number; blurMul?:number; opacity?:Record<string, number> }
// 도시 팩(modes/basic/city.mts)에서 이 파일이 읽는 칸 — 모드 팩은 기본 팩에 덧쓴 것이라 모양이 같다
export interface CityStylePack {
  ground:{ aliases?:Record<string, string>; light:GroundColors; dark:GroundColors; ride?:Partial<Record<Theme, Record<string, Hex>>>; texture?:DirtTexture };
  roads:{
    aliases?:Record<string, string>; classes:Record<string, RoadSpec | undefined> & { service:RoadSpec; minor:RoadSpec; primary:RoadSpec; motorway:RoadSpec };
    lane:{ minZoom:number; classes:string[]; dashM:number; gapM:number; colors:Record<Theme, Hex>; opacity:Record<Theme, number> };
    centerLine:{ colors:Record<Theme, Hex>; opacity?:Partial<Record<Theme, number>> };
  };
  modes?:{ colorMath?:{ lumaWeights?:readonly number[] }; transitionMs?:number; [mode:string]:unknown };
  lighting?:Partial<Record<Theme, { color?:Hex; directional?:number }>>;
  night?:{ ground?:{
    roads?:{ colors?:Record<string, Hex>; halo?:NightRoadLayer; core?:NightRoadLayer };
    downtown?:{ colors:readonly Hex[]; minZoom?:number; intensity?:number; radiusM?:number; opacity?:number };
  } };
}
// 지도 층 하나(MapLibre 층 정의 — 식은 그대로 넘긴다)
interface CityLayerDef { id:string; type:string; source:string; 'source-layer':string; minzoom?:number; filter?:unknown; layout:Record<string, unknown>; paint:Record<string, unknown> }
// 층과 그 층을 넣을 자리 후보(먼저 있는 것 아래에)
export interface CityLayer { before:string[]; layer:CityLayerDef }
// 이 파일이 쓰는 지도 기능(MapLibre Map 의 일부)
export interface CityStyleMap {
  getLayer(id:string):unknown; addLayer(layer:CityLayerDef, before?:string):unknown;
  setLayoutProperty(id:string, name:string, value:unknown):unknown; setPaintProperty(id:string, name:string, value:unknown):unknown; getPaintProperty(id:string, name:string):unknown;
  hasImage(id:string):boolean; addImage(id:string, image:{ width:number; height:number; data:Uint8ClampedArray }, options:{ pixelRatio?:number }):unknown;
}

const EARTH = 40075016.685578488, LAT = 37.5;   // the map is Seoul: one latitude for the metre→pixel scale of the whole style
export const MPP = (z:number) => EARTH * Math.cos(LAT * Math.PI / 180) / (512 * 2 ** z);   // metres a CSS px at zoom z (512 px tiles, as MapLibre counts zoom)

// ── colour math ─────────────────────────────────────────────────────────────────────────────────
const hexRgb = (h:Hex | undefined):Rgb => { h = String(h).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) };
const rgbHex = (c:readonly number[]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const toLin = (c:number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
const toSrgb = (c:number) => c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055;
export const mixHex = (a:Hex, b:Hex, t:number) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i]! - v) * t)) };
// A material colour under a mode: pack.modes[mode] saturation (a luma mix in linear light) and brightness.
export function tone(hex:Hex, pack:CityStylePack = SEOUL, mode = 'simcity', theme:Theme = 'light'):Hex {
  const m = (pack.modes?.[mode] || pack.modes?.simcity) as ModeTone | undefined, sat = m?.saturation?.[theme] ?? 1, bri = m?.brightness?.[theme] ?? 1;
  if (sat === 1 && bri === 1) return hex;
  const [wr, wg, wb] = pack.modes?.colorMath?.lumaWeights || [.2126, .7152, .0722];
  const lin = hexRgb(hex).map(toLin), Y = wr! * lin[0]! + wg! * lin[1]! + wb! * lin[2]!;
  return rgbHex(lin.map(c => (Y + (c - Y) * sat) * bri).map(toSrgb));
}
// the same for an [r,g,b] 0..1 triple (the WebGL props use it)
export function toneRGB(rgb:readonly number[], pack:CityStylePack = SEOUL, mode = 'simcity', theme:Theme = 'light'):Rgb { return hexRgb(tone(rgbHex(rgb), pack, mode, theme)) }
export { hexRgb, rgbHex };

// ── the ground ──────────────────────────────────────────────────────────────────────────────────
// OpenMapTiles landuse classes → the pack's ground keys (pack.ground.aliases then fold those further)
const LANDUSE_KEY:Record<string, string> = {
  residential: 'residential', commercial: 'commercial', retail: 'retail', industrial: 'industrial', railway: 'railway',
  garages: 'industrial', quarry: 'industrial', military: 'industrial', dam: 'industrial', bus_station: 'commercial',
  school: 'school', university: 'university', college: 'college', hospital: 'hospital', civic: 'civic', public: 'public', stadium: 'civic',
  cemetery: 'park', theme_park: 'park', zoo: 'park', pitch: 'grass', playground: 'grass', track: 'grass',
};
export function groundHex(pack:CityStylePack, theme:Theme, key:string, ride = false):Hex {   // ride: 롤코 1인칭으로 타는 중 — pack.ground.ride 의 색이 있으면 그것
  const G = pack.ground, a = G.aliases || {}, T = G[theme] || G.light, k = a[key] ?? key, R:Record<string, Hex | undefined> = ride ? G.ride?.[theme] || {} : {};
  return R[k] ?? T[k] ?? R[a.unknown ?? 'base'] ?? T[a.unknown ?? 'base'] ?? T.base;
}
// ['match', class, …] with one entry per distinct colour
function landuseColor(pack:CityStylePack, theme:Theme, mode:string, ride = false):unknown[] {
  const by = new Map<Hex, string[]>();
  for (const [cls, key] of Object.entries(LANDUSE_KEY)) { const c = tone(groundHex(pack, theme, key, ride), pack, mode, theme); if (!by.has(c)) by.set(c, []); by.get(c)!.push(cls) }
  const base = tone(groundHex(pack, theme, 'unknown', ride), pack, mode, theme), out:unknown[] = ['match', ['get', 'class']];
  for (const [c, cls] of by) if (c !== base) out.push(cls, c);
  out.push(base); return out;
}

// ── the roads ───────────────────────────────────────────────────────────────────────────────────
const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
const roadSpec = (pack:CityStylePack, c:string):RoadSpec => pack.roads.classes[pack.roads.aliases?.[c] ?? c] || pack.roads.classes.service;
const lanesPerDir = (pack:CityStylePack, c:string) => Math.max(1, Math.round(roadSpec(pack, c).widthM / 3.5 / 2));   // ~3.5 m lanes, half the width each way
const px = (m:number, z:number, floor = 0) => Math.max(floor, m / MPP(z));
const matchClass = (fn:(c:string) => unknown) => ['match', ['get', 'class'], ...ROAD_CLASSES.flatMap(c => [c, fn(c)]), fn('service')];
// a one-way street is one half of a dual carriageway (ONEWAY_K of the class width), a slip road narrower still
export const ONEWAY_K = .72, RAMP_K = .55;
const fac = ['*', ['case', ['==', ['get', 'ramp'], 1], RAMP_K, 1], ['case', ['has', 'oneway'], ONEWAY_K, 1]];
// a width that follows the ground between the stops (×2 a zoom), with a pixel floor zoomed out
const zoomCurve = (fn:(z:number) => unknown, stops = [14, 15, 16, 17, 18]) => ['interpolate', ['exponential', 2], ['zoom'], ...stops.flatMap(z => [z, fn(z)])];
const floorFor = (c:string) => c === 'service' ? .8 : c === 'minor' ? 1.3 : c === 'tertiary' ? 1.8 : 2.4;
const roadWidth = (pack:CityStylePack) => zoomCurve(z => ['*', matchClass(c => px(roadSpec(pack, c).widthM, z, floorFor(c))), fac]);
const caseWidth = (pack:CityStylePack) => zoomCurve(z => ['+', ['*', matchClass(c => px(roadSpec(pack, c).widthM, z, floorFor(c))), fac], matchClass(c => { const s = roadSpec(pack, c); return px(2 * (s.sidewalkM || .6), z, s.sidewalkM ? 1.4 : .8) })]);
// lanes: each way on a two-way street; across the whole (narrower) width on a one-way one — as city_life lays the cars
const onewayLanes = (w:number) => w < 7 ? 1 : Math.max(2, 2 * Math.round(w / 6.6));
const notTunnel = ['!=', ['coalesce', ['get', 'brunnel'], ''], 'tunnel'];
const onGround = ['!', ['has', 'brunnel']];
const roadFilter = (classes:readonly string[], ...more:unknown[]) => ['all', ['in', ['get', 'class'], ['literal', classes]], notTunnel, ['!=', ['geometry-type'], 'Polygon'], ...more];
// lane marks are metric: dash and gap in units of the line's width, by zoom
const laneWidthPx = ['step', ['zoom'], .8, 17, 1, 18, 1.3];
function laneDash(pack:CityStylePack):unknown[] {
  const d = pack.roads.lane.dashM, g = pack.roads.lane.gapM, w = (z:number) => z < 17 ? .8 : z < 18 ? 1 : 1.3, out:unknown[] = ['step', ['zoom']];
  const at = (z:number) => ['literal', [d / MPP(z) / w(z), g / MPP(z) / w(z)]];
  out.push(at(16.2)); for (const z of [16.5, 17, 17.5, 18]) out.push(z, at(z));
  return out;
}

// 밤 바닥 빛: 길 폭의 몇 배로 흐리게 번지는 선(큰길일수록 진하게), 그리고 가게 · 식당 · 술집 POI 의 열지도(반지름은 미터 — 줌이 바뀌어도 같은 동네가 같은 만큼 빛난다).
// 둘 다 숨긴 채 만들고 applyCityStyle 이 다크 · 켬일 때만 보인다. 팩에 night.ground 가 없으면 없다
export const NIGHT_GROUND_IDS = ['city-night-roads', 'city-night-roads-core', 'city-night-downtown'];
const SHOPS = ['shop', 'grocery', 'restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream', 'clothing_store', 'alcohol_shop', 'bakery', 'cinema', 'theatre', 'lodging', 'entertainment', 'music', 'jewelry', 'mobile_phone', 'shoe', 'gift', 'department_store', 'mall'];
function nightGround(pack:CityStylePack):CityLayer[] {
  const G = pack.night?.ground; if (!G) return [];
  const hidden = { visibility: 'none' }, UNDER = ['sun-shadows', 'bm-rail', 'routes'], out:CityLayer[] = [];
  const rgba = (hex:Hex | undefined, a:number) => { const [r, g, b] = hexRgb(hex); return `rgba(${Math.round(r! * 255)},${Math.round(g! * 255)},${Math.round(b! * 255)},${a})` };
  if (G.roads) {   // 두 겹: 길 밖까지 옅게 번지는 빛(halo), 그 위에 길 면을 밝히는 좁은 빛(core) — 넓은 한 겹은 안개처럼 흐렸다
    const R = G.roads, classes = Object.keys(R.colors || {}).flatMap(c => c === 'motorway' ? ['motorway', 'trunk'] : [c]), K = (c:string) => c === 'trunk' ? 'motorway' : c;
    const w = (k:number) => zoomCurve(z => ['*', matchClass(c => px(roadSpec(pack, c).widthM * k, z, floorFor(c) * k)), fac]);
    const color = (C:Record<string, Hex> | undefined) => ['match', ['get', 'class'], ...classes.flatMap(c => [c, (C || R.colors)![K(c)] || R.colors![K(c)]]), '#FFD3A0'], op = (o:Record<string, number> | undefined) => ['match', ['get', 'class'], ...classes.flatMap(c => [c, o?.[K(c)] ?? 0]), 0];
    for (const [id, L] of [['city-night-roads', R.halo], ['city-night-roads-core', R.core]] as const) if (L)
      out.push({ before: UNDER, layer: { id, type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 13, filter: roadFilter(classes), layout: { 'line-cap': 'round', 'line-join': 'round', ...hidden },
        paint: { 'line-color': color(L.colors), 'line-width': w(L.widthMul || 1), 'line-blur': w(L.blurMul || .3), 'line-opacity': op(L.opacity) } } });
  }
  if (G.downtown) {
    const D = G.downtown, [c0, c1, c2] = D.colors;
    out.push({ before: UNDER, layer: { id: 'city-night-downtown', type: 'heatmap', source: 'ofm', 'source-layer': 'poi', minzoom: D.minZoom ?? 13, filter: ['in', ['get', 'class'], ['literal', SHOPS]], layout: { ...hidden },
      paint: { 'heatmap-weight': 1, 'heatmap-intensity': D.intensity ?? 1, 'heatmap-radius': zoomCurve(z => px(D.radiusM || 70, z, 2), [12, 14, 16, 18]),
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, rgba(c0, 0), .12, rgba(c0, .16), .35, rgba(c1, .34), .7, rgba(c2, .5), 1, rgba(c2, .62)],
        'heatmap-opacity': D.opacity ?? .7 } } });
  }
  return out;
}

// Every city layer, with its paint for a theme and mode, and where it goes in the basemap stack.
// `before`: candidates, the first that exists wins (the sun shadows are a custom layer that may be replaced).
export function cityLayers({ pack = SEOUL as CityStylePack, theme = 'light' as Theme, mode = 'simcity', ride = false } = {}):CityLayer[] {
  const t = (h:Hex) => tone(h, pack, mode, theme), G = pack.ground[theme] || pack.ground.light, R = pack.roads, tr = { duration: pack.modes?.transitionMs ?? 180 };
  const sidewalk = t(G.sidewalk), kerb = t(mixHex(roadSpec(pack, 'motorway').colors[theme], theme === 'dark' ? '#000000' : '#1a1a1a', .3));
  const hidden = { visibility: 'none' }, L = (id:string, before:string[], def:Omit<CityLayerDef, 'id' | 'source' | 'layout'> & { layout?:Record<string, unknown> }):CityLayer => ({ before, layer: { id, source: 'ofm', ...def, layout: { ...(def.layout || {}), ...hidden } } });
  const UNDER = ['sun-shadows', 'bm-rail', 'routes'], BOTTOM = ['bm-landcover', 'bm-park', 'routes'];
  const fill = (classes:readonly [string, ...string[]], more?:unknown[]) => L('city-road-' + classes[0], UNDER, { type: 'line', 'source-layer': 'transportation', minzoom: classes[0] === 'service' ? 15 : 14, filter: roadFilter(classes, ...(more || [])),
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t(roadSpec(pack, classes[0]).colors[theme]), 'line-width': roadWidth(pack), 'line-color-transition': tr } });
  const laneK = (k:number, sign:number) => {
    const two = R.lane.classes.filter(c => lanesPerDir(pack, c) > k), one = R.lane.classes.filter(c => onewayLanes(roadSpec(pack, c).widthM * ONEWAY_K) / 2 > k);
    const byClass = (classes:readonly string[], fn:(c:string) => number) => classes.length ? ['match', ['get', 'class'], ...classes.flatMap(c => [c, fn(c)]), 0] : 0;   // (a match needs a case: none → 0)
    const offset = (z:number) => ['case', ['has', 'oneway'], byClass(one, c => { const W = roadSpec(pack, c).widthM * ONEWAY_K; return sign * k * px(W / onewayLanes(W), z) }),
      byClass(two, c => sign * k * px(roadSpec(pack, c).widthM / (2 * lanesPerDir(pack, c)), z))];
    return L(`city-lane-${k}${sign > 0 ? 'p' : 'n'}`, UNDER, { type: 'line', 'source-layer': 'transportation', minzoom: R.lane.minZoom,
      filter: ['all', notTunnel, ['!=', ['get', 'ramp'], 1], ['!=', ['geometry-type'], 'Polygon'], ['any', ['all', ['has', 'oneway'], ['in', ['get', 'class'], ['literal', one]]], ['all', ['!', ['has', 'oneway']], ['in', ['get', 'class'], ['literal', two]]]]],
      paint: { 'line-color': t(R.lane.colors[theme]), 'line-opacity': R.lane.opacity[theme], 'line-width': laneWidthPx, 'line-dasharray': laneDash(pack), 'line-offset': zoomCurve(offset, [16, 17, 18]), 'line-color-transition': tr } });
  };
  const list = [
    // zone floors, under everything the basemap paints
    L('city-landuse', BOTTOM, { type: 'fill', 'source-layer': 'landuse', paint: { 'fill-color': landuseColor(pack, theme, mode, ride), 'fill-antialias': false, 'fill-color-transition': tr } }),
    // plazas and pedestrian areas, rail ballast: over the green, under the roads
    L('city-plaza', UNDER, { type: 'fill', 'source-layer': 'transportation', minzoom: 15, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': sidewalk, 'fill-antialias': false, 'fill-color-transition': tr } }),
    L('city-rail-bed', UNDER, { type: 'line', 'source-layer': 'transportation', minzoom: 15, filter: ['all', ['in', ['get', 'class'], ['literal', ['rail', 'transit']]], onGround],
      paint: { 'line-color': t(G.ballast), 'line-width': zoomCurve(z => px(5.5, z, 1.5)), 'line-color-transition': tr } }),
    // roads in tunnels: a faint dashed trace (the real street is above; nothing drives on this)
    L('city-road-tunnel', UNDER, { type: 'line', 'source-layer': 'transportation', minzoom: 15, filter: ['all', ['in', ['get', 'class'], ['literal', ROAD_CLASSES.slice(0, 5)]], ['==', ['get', 'brunnel'], 'tunnel']],
      paint: { 'line-color': sidewalk, 'line-opacity': .4, 'line-width': zoomCurve(z => matchClass(c => px(roadSpec(pack, c).widthM * .35, z, 1))), 'line-dasharray': ['literal', [2.5, 2]] } }),
    // pavements: a casing wider than the carriageway, all of them before any carriageway so junctions join cleanly
    L('city-road-case', UNDER, { type: 'line', 'source-layer': 'transportation', minzoom: 14, filter: roadFilter(ROAD_CLASSES.slice(2)),
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': sidewalk, 'line-width': caseWidth(pack), 'line-color-transition': tr } }),
    L('city-road-case-hwy', UNDER, { type: 'line', 'source-layer': 'transportation', minzoom: 14, filter: roadFilter(['motorway', 'trunk']),
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': kerb, 'line-width': caseWidth(pack), 'line-color-transition': tr } }),
    // carriageways, narrowest first: a wide road's surface runs over the end of the alley that meets it
    fill(['service']), fill(['minor']), fill(['tertiary']), fill(['secondary']), fill(['primary']), fill(['motorway', 'trunk']),
    // 밤 바닥 빛(팩 night.ground, 다크에서만 보인다 — applyCityStyle): 큰길을 따라 길 밖까지 번지는 가로등 빛, 가게가 모인 곳의 따뜻한 빛 지도
    ...nightGround(pack),
    // paths and tracks through the parks
    L('city-path', UNDER, { type: 'line', 'source-layer': 'transportation', minzoom: 16, filter: ['all', ['in', ['get', 'class'], ['literal', ['path', 'track']]], notTunnel, ['!=', ['geometry-type'], 'Polygon'], ['!=', ['get', 'subclass'], 'steps']],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': sidewalk, 'line-opacity': .95, 'line-width': zoomCurve(z => px(1.6, z, 1), [16, 17, 18]), 'line-color-transition': tr } }),
    // lane marks: dividers between lanes going the same way (white dashes), the centre line (yellow, two-way roads)
    laneK(1, 1), laneK(1, -1), laneK(2, 1), laneK(2, -1),
    L('city-lane-center', UNDER, { type: 'line', 'source-layer': 'transportation', minzoom: R.lane.minZoom, filter: roadFilter(R.lane.classes, ['!', ['has', 'oneway']], ['!=', ['get', 'ramp'], 1]),
      paint: { 'line-color': t(R.centerLine.colors[theme]), 'line-opacity': R.centerLine.opacity?.[theme] ?? 1, 'line-width': ['step', ['zoom'], .8, 17, 1, 18, 1.4], 'line-color-transition': tr } }),
    L('city-lane-center-1way', UNDER, { type: 'line', 'source-layer': 'transportation', minzoom: R.lane.minZoom, filter: roadFilter(R.lane.classes.filter(c => onewayLanes(roadSpec(pack, c).widthM * ONEWAY_K) >= 2), ['has', 'oneway'], ['!=', ['get', 'ramp'], 1]),
      paint: { 'line-color': t(R.lane.colors[theme]), 'line-opacity': R.lane.opacity[theme], 'line-width': laneWidthPx, 'line-dasharray': laneDash(pack), 'line-color-transition': tr } }),
  ];
  return list;
}
export const CITY_LAYER_IDS = cityLayers().map(x => x.layer.id);

// Add every city layer to the map (hidden), each under the first of its `before` candidates that exists.
export function addCityLayers(map:CityStyleMap, { pack = SEOUL as CityStylePack } = {}):void {
  for (const { layer, before } of cityLayers({ pack })) { if (map.getLayer(layer.id)) continue; const at = before.find(id => map.getLayer(id)); map.addLayer(layer, at) }
}

// Show the city ground (on && mapOn) in this theme and mode, or hide it and give the stock roads back.
// The stock road layers stay 'visible' at opacity 0 while the city is on: other code reads their
// visibility as "the background map is on".
export function applyCityStyle(map:CityStyleMap, { on = false, theme = 'light' as Theme, tone = 'simcity', mapOn = true, pack = SEOUL as CityStylePack, ride = false, groundLight = false } = {}):boolean {   // groundLight: 밤 바닥 빛 켬(다크일 때만 보인다)
  if (!map.getLayer || !map.getLayer(CITY_LAYER_IDS[0]!)) return false;
  const show = on && mapOn, mode = tone;
  for (const { layer, before } of cityLayers({ pack, theme, mode, ride })) {
    const night = NIGHT_GROUND_IDS.includes(layer.id), vis = show && (!night || (groundLight && theme === 'dark'));
    if (night && vis && !map.getLayer(layer.id)) { const at = before.find(id => map.getLayer(id)); map.addLayer({ ...layer, layout: { ...layer.layout, visibility: 'visible' } }, at) }   // (조선 팩처럼 처음 만들 때 없던 팩: 그때 더한다)
    if (!map.getLayer(layer.id)) continue;
    map.setLayoutProperty(layer.id, 'visibility', vis ? 'visible' : 'none');
    if (show) for (const [k, v] of Object.entries(layer.paint)) if (!k.endsWith('-transition')) map.setPaintProperty(layer.id, k, v);
  }
  { const has = new Set(nightGround(pack).map(x => x.layer.id)); for (const id of NIGHT_GROUND_IDS) if (!has.has(id) && map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none') }   // 이 팩에 없는 밤 바닥 빛
  for (const [id, op] of [['bm-road-minor', .8], ['bm-road-major', 1]] as const) if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', show ? 0 : op);
  for (const [id, op] of [['bm-landcover', .7], ['bm-park', .8]] as const) if (map.getLayer(id)) map.setPaintProperty(id, 'fill-opacity', show ? 1 : op);
  return show;
}

// ── 흙 질감 (조선 모드: pack.ground.texture) ─────────────────────────────────────────────────────────
// The ground as packed earth instead of a flat colour: for each ground colour a tileable pattern — broad blotches of damper and
// drier earth, a fine grain, darker and lighter crumbs and a few small pebbles with their shadows — set as the landuse fill's and
// the background's pattern. Deterministic (a seeded hash), built once per colour and theme.
const H32 = (a:number, b:number, c:number) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 };
export function dirtPattern(hex:Hex, T:DirtTexture, dark = false):{ width:number; height:number; data:Uint8ClampedArray } {
  const n = T.size, [r0, g0, b0] = hexRgb(hex), px = new Float32Array(n * n), k = dark ? .6 : 1;
  const vn = (x:number, y:number, cell:number, seed:number) => {   // tileable value noise: the lattice wraps every n px
    const m = n / cell, fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const h = (i:number, j:number) => H32(((i % m) + m) % m, ((j % m) + m) % m, seed);
    return (h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx) * (1 - sy) + (h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx) * sy;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    px[y * n + x] = 1 + k * (T.blotch * (vn(x, y, n / 4, 1) - .5) * 2 + T.blotch * .6 * (vn(x, y, n / 16, 2) - .5) * 2 + T.grain * (H32(x, y, 3) - .5) * 2);
  const data = new Uint8ClampedArray(n * n * 4), warm = [1.02, 1, .96];
  for (let i = 0; i < n * n; i++) { const v = px[i]!; data[i * 4] = Math.round(r0! * v * 255); data[i * 4 + 1] = Math.round(g0! * v * 255); data[i * 4 + 2] = Math.round(b0! * v * 255); data[i * 4 + 3] = 255 }
  const dot = (cx:number, cy:number, rad:number, mul:number, tint = [1, 1, 1]) => {   // a soft disc, wrapped round the tile's edges
    for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
      const d = Math.hypot(x + .5 - cx, y + .5 - cy), a = Math.max(0, Math.min(1, rad + .5 - d)); if (a <= 0) continue;
      const i = ((((y % n) + n) % n) * n + (((x % n) + n) % n)) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = data[i + c]! * (1 - a) + Math.min(255, data[i + c]! * mul * tint[c]!) * a;
    }
  };
  for (let i = 0; i < T.crumbs; i++) { const lighter = H32(i, 7, 4) < .4; dot(H32(i, 1, 4) * n, H32(i, 2, 4) * n, .5 + H32(i, 3, 4) * .9, lighter ? 1 + .14 * k : 1 - .2 * k, lighter ? warm : [1, 1, 1]) }
  for (let i = 0; i < T.pebbles; i++) {   // 자갈: its shadow down-right, then the stone, lighter and a little grey
    const x = H32(i, 1, 5) * n, y = H32(i, 2, 5) * n, rad = 1.2 + H32(i, 3, 5) * 1.6;
    dot(x + .8, y + .9, rad, 1 - .22 * k); dot(x, y, rad, 1 + .16 * k, [.97, .98, 1.01]);
  }
  return { width: n, height: n, data };
}
// set (on) or clear the earth patterns on the city's landuse floor and the background
export function applyGroundTexture(map:CityStyleMap, { on = false, theme = 'light' as Theme, pack = SEOUL as CityStylePack } = {}):boolean {
  const T = pack.ground?.texture, layers = [['city-landuse', 'fill-pattern'], ['background', 'background-pattern']] as const;
  if (!on || !T) { for (const [id, prop] of layers) if (map.getLayer?.(id) && map.getPaintProperty(id, prop) != null) map.setPaintProperty(id, prop, undefined); return false }
  const name = (hex:Hex) => `city-dirt-${theme}-${hex.replace('#', '')}`, need = (hex:Hex) => { const id = name(hex); if (!map.hasImage(id)) map.addImage(id, dirtPattern(hex, T, theme === 'dark'), { pixelRatio: T.pixelRatio }); return id };
  const by = new Map<string, string[]>();
  for (const [cls, key] of Object.entries(LANDUSE_KEY)) { const id = need(tone(groundHex(pack, theme, key), pack, 'simcity', theme)); if (!by.has(id)) by.set(id, []); by.get(id)!.push(cls) }
  const base = need(tone(groundHex(pack, theme, 'unknown'), pack, 'simcity', theme)), expr:unknown[] = ['match', ['get', 'class']];
  for (const [id, cls] of by) if (id !== base) expr.push(cls, id);
  expr.push(base);
  if (map.getLayer('city-landuse')) map.setPaintProperty('city-landuse', 'fill-pattern', expr);
  if (map.getLayer('background')) map.setPaintProperty('background', 'background-pattern', base);
  return true;
}

// The palette keys the runtime's mapPalette() hands to its stock layers, from the pack: the background,
// water, parks, the landcover (wood and grass apart), footprints, rails, and the shadow / light values.
export function cityPalette(theme:Theme = 'light', { pack = SEOUL as CityStylePack, tone: mode = 'simcity', ride = false } = {}) {
  const t = (h:Hex) => tone(h, pack, mode, theme), G = { ...(pack.ground[theme] || pack.ground.light), ...(ride ? pack.ground.ride?.[theme] : null) }, R = pack.roads.classes;
  const ink = theme === 'dark' ? '#ffffff' : '#000000';
  return {
    bg: t(G.base), water: t(G.water), park: t(G.park),
    land: ['match', ['get', 'class'], 'wood', t(G.forest), 'grass', t(G.grass), t(G.grass)],
    bld: t(mixHex(G.base, ink, .07)),                        // z14–15 footprints: a shade off the floor they stand on
    roadMinor: t(R.minor.colors[theme]), roadMajor: t(R.primary.colors[theme]),
    rail: t(mixHex(G.ballast, ink, .3)),
    shadow: (pack.modes?.[mode] as ModeTone | undefined)?.shadowOpacity?.[theme] ?? .18, light: pack.lighting?.[theme]?.color ?? '#ffffff', lightK: pack.lighting?.[theme]?.directional ?? .36,
    cityMode: mode,
  };
}

export default { cityLayers, addCityLayers, applyCityStyle, applyGroundTexture, dirtPattern, cityPalette, tone, toneRGB, groundHex, MPP };
