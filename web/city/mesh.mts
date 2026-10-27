// The miniature city's building meshes (web/city/buildings.mjs draws them; web/city/worker.mjs builds them off the
// main thread). One canonical z14 tile in → one vertex buffer, one index buffer in 4×4 chunks, each chunk's indices
// ordered [far-LOD roofs][walls][near-LOD roofs, parapets, roof plant, awnings]. Every look value comes from the style
// pack (resolvePack flattens it); the building type is one replaceable estimate, classifyBuilding. No GL, no DOM.

import { LANDMARKS, landmarkMerc } from './landmarks_data.mts';
import { cityPart } from './parts.mts';   // 조선 모드: every footprint as 기와집 when the pack carries `hanok` — 한옥 짓기는 부품 'hanok'(web/modes/joseon/hanok.mjs 가 등록)
// vertex kinds after the city's (0–7), for the 조선 pieces (web/modes/joseon/hanok.mjs): 기와 (roofs, ridges, wall caps), a house's walls (a_bld.z type 1: mud walls of a
// 초가), the 기와 담장's walls, 초가 thatch, 돌담 (fieldstone) — 메시 형식의 몫이라 여기에 둔다
export const HANOK_KIND = { ROOF: 8, WALL: 9, DAM: 10, THATCH: 11, STONE: 12 };
export const POSTS = 12;   // (조선) 벽 한 면에 세울 수 있는 기둥 수(칸 + 1): 이보다 칸이 많으면 그 면은 기둥 없이 — 한옥 상자 템플릿 · 셰이더가 같이 쓴다
import { signedArea2, area as ringArea, bbox as ringBbox, pointInPolygon, edgeDistance, interiorPoint, simplifyRing, classifyRings, clipRing, ringInBox, insetRing, orientedBox, deepestPoint, triangulate } from './geom.mts';
import type { Ring, RingPolygon } from './geom.mts';
import type { Layer } from './mvt.mts';

// ── 타입(이 파일이 읽는 칸만 — 도시 팩은 web/modes/basic/city.mjs, 모드가 다른 값만 덮는다) ──────────────────
type LightDark = { light:string; dark:string };
type ColorLists = { light?:string[]; dark?:string[] };
// 벽 한 면의 창 정책(facadeFaces.byType): 'full' | 'sparse' | 'single' | 'blank' | 'same'(짧은 면을 다르게 하지 않음)
interface FacePolicy { glass?:string; masonry?:FacePolicy; abutting?:string; shortFaces?:string; near?:string; primaryOnly?:boolean; open?:string; windowScale?:number }
interface PitchedSpec { areaM2?:[number, number]; maxHeightM?:number; probability?:number; riseMaxM?:number; riseHeightRatio?:number; weights?:number[] }
interface AwningSpec { baseM?:number; landuse?:string[]; probability?:number; frontageRatio?:[number, number]; depthM?:number; heightM?:number; weights?:number[] }
interface SetbackSpec { minHeightM?:number; minAreaM2?:number; probability?:number; maxInsetM?:number; topHeightRatio?:number }
interface ArticulationSpec {
  minHeightM?:number; crownWeights?:{ flatBand?:number; insetCap?:number; steppedCap?:number }; maxInsetM?:number;
  beltEveryFloors?:number | number[]; beltHeightM?:number | number[]; cornerWidthM?:number | number[]; maxAccentFacadeAreaRatio?:number;
  topZoneHeightRatio?:number[]; maxTopZoneHeightM?:number;
}
interface BuildingSpec {
  floorM?:number; bayM?:number; windowRatio?:number[]; pattern?:string;
  groundFloor?:{ heightM?:number; glassRatio?:number; colors?:unknown; storefrontLanduse?:string[] };
  night?:{
    litRatio?:number; groundFloorLitRatio?:number; temperatureWeights?:number[]; landuseLitRatio?:Record<string, number>; emission?:number; groundFloorEmission?:number;
    floorProbabilityMultiplier?:number[]; windowRatio?:unknown; brightnessTiers?:unknown; maxContiguousLitBays?:number;
  };
  roof?:{ flat?:LightDark; parapetM?:number; pitched?:PitchedSpec; panel?:unknown; variants?:ColorLists; variantWeights?:number[] };
  wall?:ColorLists; glass?:unknown; mullionM?:number; beltEveryFloors?:number; beltHeightM?:number; balconyEveryBays?:number; balconyBrightness?:number;
  spandrelM?:number; ribSpacingM?:number; baysPerGroup?:unknown; awning?:AwningSpec; setback?:SetbackSpec;
  materialMix?:{ family:string; weight?:number }[]; articulation?:ArticulationSpec; dayReflection?:unknown;
}
interface FamilySpec {
  wall:ColorLists; glass?:ColorLists; roof?:ColorLists; kind?:string; variantWeights?:number[];
  facade?:{ pattern?:string; windowRatio?:number[]; reflectionScale?:number; bayM?:number };
}
interface ClassRule { type:string; landuse?:string[]; excludedLanduse?:string[]; minHeightM?:number | null; maxHeightM?:number | null; minAreaM2?:number | null; maxAreaM2?:number | null }
interface SignsSpec {
  minHeightM?:number; maxHeightM?:number; types?:string[]; probability?:number; minWallM?:number; weights?:number[]; maxWalls?:number;
  fascia?:{ belowM?:number; heightM?:number; maxShops?:number; shopM?:number; gapM?:number; depthM?:number };
  upper?:{ maxFloors?:number; probability?:number; offsetM?:number; heightM?:number; frontage?:[number, number]; depthM?:number };
  blade?:{ minHeightM?:number; probability?:number; heightM?:[number, number]; baseAboveM?:number; insetM?:number; outM?:number; widthM?:number };
}
type LightSpec = { ambient:number; directional:number; color:string; maxSideDarken?:number; maxRoofBrighten?:number };
export interface MeshPack {
  buildings?:Record<string, BuildingSpec>;
  buildingDefaults?:{
    equipment?:{ minZoom?:number; minHeightM?:number; minAreaM2?:number; penthouseAreaRatio?:[number, number]; penthouseHeightM?:number; hvacCount?:[number, number]; hvacSizeM?:[number, number, number]; colors?:LightDark };
    litWindows?:{ colors?:string[]; emission?:number; groundFloorEmission?:number; floorProbabilityMultiplier?:number[] };
    waterproofRoof?:{ maxHeightM?:number; probability?:number; colors?:LightDark };
    wallWeights?:number[]; parapetThicknessM?:number; roofEquipmentEdgeClearanceM?:number; glass?:LightDark; windowBandMinPx?:number; windowCellMinPx?:number;
  };
  classification?:{ rules?:ClassRule[]; minimumHeightM?:number; missingHeightM?:number; mergedLowrise?:{ maxHeightM?:number; areaGreaterThanM2?:number }; equalAreaPriority?:string[]; landuseAliases?:Record<string, string> };
  lighting?:{ light?:LightSpec; dark?:LightSpec; ao?:{ opacity:number; widthM:number }; referenceSun?:{ azimuthDeg:number; elevationDeg:number } };
  modes?:Record<string, unknown>;
  lod?:{ roofEquipment?:number[]; windows?:number[] };
  throughBuildings?:{
    railHeightM?:number; bandBelowM?:number; bandAboveM?:number; glass?:Record<string, unknown>; frame?:Record<string, unknown>; insideLight?:Record<string, unknown>;
    mullionEveryM?:number; mullionM?:number; portalHalfM?:number; alongsideM?:number; skyMix?:number; insideMix?:number; nightEmission?:number; depthOpen?:boolean;
  };
  facadeFaces?:{ byType?:Record<string, FacePolicy>; windowScale?:Record<string, number>; minPierM?:Record<string, number>; neighbourGapM?:number; openDistanceM?:number; minFaceWidthM?:number; slabAspect?:number; primaryOnlyMaxAreaM2?:number };
  materialFamilies?:Record<string, FamilySpec> | null;
  materialAssignment?:{ variantSeedSalt?:number; roofSeedSalt?:number; roofPriority?:string[]; roofPriorityByType?:Record<string, string[]>; facadePolicyByType?:Record<string, string> };
  signs?:SignsSpec | null; hanok?:unknown; race?:unknown; nation?:unknown;
  xray?:{ alpha?:number; edgeAlpha?:number; edgePx?:number; featherPx?:number; fadeMs?:number; maxTargets?:number; pieceM?:number; platformMarginM?:number; platformBelowM?:number; platformAboveM?:number; trainHalfWidthM?:number; trainBelowM?:number; trainAboveM?:number; trains?:boolean } | null;
  viaduct?:{ railHeightM?:number };
  landmarkHide?:{ lngLat:[number, number]; radiusM:number; minH:number }[];   // 그 팩에서만 빼는 랜드마크 자리
}
// 재질 칸 하나(가족 × 변형, 또는 가족 없이 유형마다 벽 넷) — bayEff 는 다 모은 뒤 덧붙인다
interface Material {
  family:string; kind:string; wall:{ light:string | null | undefined; dark:string | null | undefined }; glass:{ light:string | null; dark:string | null } | null; roof:{ light:string | null; dark:string | null } | null;
  pattern:number; winW:number; winH:number; refl:number; bayM:number; glassKind:boolean; bayEff:number;
}
// 건물 유형 하나(팩의 buildings.<유형>을 펼친 것) — mats · famFacade · bayEff · roofVarBase · legacyRoofSlot 는 다 모은 뒤 덧붙인다
interface BuildingType {
  key:string; floorM:number; bayM:number; winW:number; winH:number; pattern:number; minPier:number; facePolicy:FacePolicy | null;
  groundM:number; groundGlass:number; groundColor:unknown; storefront:string[] | null;
  litRatio:number; groundLit:number; tempW:number[]; litByLanduse:Record<string, number> | null;
  wall:ColorLists; roof:LightDark; parapetM:number; pitched:PitchedSpec | null; panel:unknown;
  glass:unknown; mullionM:number; beltEvery:number; beltM:number; balconyEvery:number; balconyBright:number;
  spandrelM:number; ribM:number; baysPerGroup:unknown; awning:AwningSpec | null; setback:SetbackSpec | null;
  mix:{ family:string; weight?:number }[] | null; roofVariants:ColorLists | null; roofVariantW:number[] | null;
  nightEmission:number; nightGroundEmission:number; nightFloorMul:number[] | null; nightWin:unknown; tiers:unknown; maxContig:number;
  articulation:ArticulationSpec | null; dayReflection:unknown;
  mats:[number, number][]; famFacade:boolean; bayEff:number; roofVarBase:number; legacyRoofSlot:number;
}
export type ResolvedPack = ReturnType<typeof resolvePack>;
// 건물 유형 추정에 넘기는 것(classifyBuilding · opts.classify)
interface BuildingInfo { heightM:number; areaM2:number; landuse:string; id:number; props:unknown }
interface Estimate { type:string; mergedLowrise:boolean }
// 고가가 지나는 건물(buildings.mjs throughIndex): osm id → 지나는 점들, 또는 "z/x/y/feature/ring" → 그 외곽
interface ThroughEntry { lng:number; lat:number; railM?:number; line?:string; path?:[number, number][] | null }
type ThroughById = Map<number, ThroughEntry[]>;
interface ThroughMaps { byId?:ThroughById; byRing?:Map<string, ThroughEntry | ThroughEntry[]>; size?:number }
export interface TileSource { z:number; x:number; y:number; extent?:number; buildings:Layer | null; landuse:Layer | null }
export interface BuilderOptions { phone?:boolean; through?:ThroughMaps | ThroughById | null; classify?:((info:BuildingInfo, est:Estimate) => string | null | undefined) | null }
type InstLists = Record<string, ArrayBufferView[]>;   // 종류(skirt · roof · box)마다 인스턴스 바이트(조선 — hanok.mjs 가 넣는다)
interface Chunk { lo:number[]; walls:number[]; hi:number[]; inst:InstLists; instFar:InstLists; x0:number; y0:number; x1:number; y1:number; zmax:number; n:number }
// 1단계에서 읽은 외곽 하나
interface Item {
  item:number; outer:Ring; holes:Ring[]; clipped:boolean; A:number; H:number; minH:number; landuse:string; seed:number; ix:number; iy:number;
  idLo:number; idHi:number; raw:Ring; fi:number; ri:number; drop?:boolean; containers?:Set<number>; depth?:number; lower?:number;
}
interface LanduseArea { cls:string; outer:Ring; holes:Ring[]; bbox:[number, number, number, number]; area:number }
interface FaceView { abut:number; near:number; dist:number; short?:boolean }
// 건물 하나를 짓는 동안의 칸(부품 race · nation 도 받는다) — slab · roofSlot · th 는 만든 바로 뒤에 넣는다
interface BuildCtx {
  outer:Ring; holes:Ring[]; A:number; H:number; minH:number; T:BuildingType; ti:number; seed:number; chunk:Chunk; clipped:boolean; landuse:string;
  storefront:boolean; merged:boolean; mat:number; item:number; ignore:Set<number> | null;
  slab:{ ux:number; uy:number } | null; roofSlot:number; th:{ segs:number[]; half:number; near:number; rq:number } | null;
  cuts?:number[] | null; roofZ?:number; roofRing?:Ring; roofHoles?:Ring[];
}
// 부품(cityPart)의 건물 짓기: 지었으면 true
type BuildingPart = { building:(tb:TileBuilder, it:Item | BuildCtx, unit:(h:number, k:number) => number) => boolean | void };
type Quad = [number, number, number, number];

export const EARTH = 40075016.685578488, RAD = Math.PI / 180;
const CITY_LNG = 126.98, CITY_LAT = 37.53;   // the metre frame's origin (windows are placed in world metres, kept small for float precision)
export const G:[number, number] = [CITY_LNG / 360 + .5, .5 - Math.log(Math.tan(Math.PI / 4 + CITY_LAT * RAD / 2)) / (2 * Math.PI)], S = EARTH * Math.cos(CITY_LAT * RAD);   // mercator → metres
const TYPES = ['house', 'apartment', 'shop', 'office', 'industrial', 'civic'];
const PATTERNS:Record<string, number> = { punched: 0, 'vertical-balconies': 1, 'horizontal-bands': 2, 'curtain-wall': 3, clerestory: 4, 'regular-grid': 5 };
export const KIND = { WALL: 0, ROOF: 1, PARAPET: 2, EQUIP: 3, PITCHED: 4, AWNING: 5, HALL: 6, SIGN: 7, GIWA: HANOK_KIND.ROOF, HANOK: HANOK_KIND.WALL, DAM: HANOK_KIND.DAM };   // HALL: the piece of a wall the viaduct passes through — the shader opens the glass band there, nowhere else; SIGN: 간판(signs())
export const RAIL_Q = { base: 10, step: .25 };   // a HALL piece carries the deck's rail height there in 6 bits (a_bld.z bits 6–7 high, a_bld.w bits 4–7 low): base + code × step, 10–25.75 m
const FLAG = { ABS_U: 1, MERGED: 2, STOREFRONT: 4, NO_AO: 8 };
export const CHUNKS = 4;   // sub-chunks a tile side
export const LOD_HI = 16;   // from here: roofs set back behind the parapet, roof plant, awnings
export const GROW_MS = 420;
// footprints over one another (resolveOverlaps): the share of sample points inside the other that counts as overlapping at all /
// nested / a mere duplicate, and how far the inner one is pulled in (m per nesting) and the smaller down (m, when the heights match)
// so the two never share a plane
export const OVERLAP = { touchShare: .1, nestedShare: .6, redundantShare: .9, insetM: .05, lowerM: .08 };
const LANDUSE_ALIASES:Record<string, string> = { library: 'civic', kindergarten: 'school', government: 'civic', townhall: 'civic' };

// ── small helpers ────────────────────────────────────────────────────────────────────────────────
const mix32 = (a:number, b:number, c = 0, d = 0) => { let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x6b43a9b5, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1) ^ Math.imul(d + 0x1b873593, 0xcc9e2d51); x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15; return x >>> 0 };
const unit = (h:number, k:number) => ((mix32(h, k * 0x9e37 + 17) >>> 8) / 16777216);   // 0..1 from a seed and a slot
const pick = (weights:readonly number[], r:number) => { let acc = 0; for (let i = 0; i < weights.length; i++) { acc += weights[i]!; if (r < acc) return i } return weights.length - 1 };
export const hexRGB = (h?:string | null) => { h = String(h || '#888888'); return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255] };
const lin = (c:number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
export const num = (v:unknown, d:number):number => Number.isFinite(+(v as number)) ? +(v as number) : d;
// which vertices of a ring are real corners (the outline turns 20° or more there) — a vertex that merely splits a straight
// facade is not one, so no corner accent, no corner shading and no accent budget is spent on it
const COS_CORNER = Math.cos(20 * RAD);
// where segment a–b meets segment c–d: the parameter along a–b (0..1), or -1
function segX(ax:number, ay:number, bx:number, by:number, cx:number, cy:number, dx:number, dy:number):number { const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx; if (Math.abs(den) < 1e-12) return -1; const qx = cx - ax, qy = cy - ay, t = (qx * sy - qy * sx) / den, s = (qx * ry - qy * rx) / den; return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? t : -1 }
// the nearest point of a polyline (segments [x0, y0, x1, y1, …]) to a point: the distance and the unit direction of that segment
function pathNear(px:number, py:number, G:readonly number[]):{ d:number; ux:number; uy:number } { let d = Infinity, ux = 1, uy = 0; for (let s = 0; s < G.length; s += 4) { const ax = G[s]!, ay = G[s + 1]!, vx = G[s + 2]! - ax, vy = G[s + 3]! - ay, l2 = vx * vx + vy * vy, t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0, dd = Math.hypot(px - ax - vx * t, py - ay - vy * t); if (dd < d) { d = dd; const l = Math.sqrt(l2) || 1; ux = vx / l; uy = vy / l } } return { d, ux, uy } }
function realCorners(ring:readonly number[]):boolean[] { const n = ring.length / 2, out:boolean[] = new Array(n); for (let i = 0; i < n; i++) { const k = (i + n - 1) % n, j = (i + 1) % n, x = ring[i * 2]!, y = ring[i * 2 + 1]!, dx1 = x - ring[k * 2]!, dy1 = y - ring[k * 2 + 1]!, dx2 = ring[j * 2]! - x, dy2 = ring[j * 2 + 1]! - y, l1 = Math.hypot(dx1, dy1), l2 = Math.hypot(dx2, dy2); out[i] = l1 > 0 && l2 > 0 && (dx1 * dx2 + dy1 * dy2) / (l1 * l2) < COS_CORNER } return out }

// ── the style pack, flattened for the shader and the builder ─────────────────────────────────────
// Pack keys that are design targets or documentation, read by nobody here on purpose (QA measures them on the screen):
// materialFamilies.*.targetSunlitLStar, buildings.office.night.targetLitFacadeAreaRatio, materialAssignment.adjacency.*
// (neighbour contrast: the stable weighted hash stays, as its missingNeighbours asks), materialAssignment.roofTargets,
// materialAssignment.familySeed / retainAcrossThemeModeZoom / recolorVisibleBuildingsOnNeighbourArrival (true by
// construction: one seed a footprint), dayReflection.space / seed / animated, articulation.replacesLegacySetback (the
// crown replaces the set-back whenever articulation exists) / keepOriginalMaxHeight (always), implementationContract, changeLog.
export function resolvePack(pack:MeshPack) {
  const B = pack.buildings || {}, D = pack.buildingDefaults || {}, C = pack.classification || {}, L = pack.lighting || {}, M = pack.modes || {}, LOD = pack.lod || {};
  const TB = pack.throughBuildings || {}, FF = pack.facadeFaces || {}, FT = FF.byType || {}, mScale = num(FT.office?.masonry?.windowScale, 1);   // windows by face (see TileBuilder.faceDensity); masonry offices' narrower windows
  const types = TYPES.map(t => {
    const b = B[t] || {}, gf = b.groundFloor || {}, n = b.night || {}, roof = b.roof || {};
    return {
      key: t, floorM: num(b.floorM, 3.2), bayM: num(b.bayM, 3), winW: num(b.windowRatio?.[0], .5) * num(FF.windowScale?.[t], 1), winH: num(b.windowRatio?.[1], .5), pattern: PATTERNS[b.pattern as string] ?? 5,
      minPier: num(FF.minPierM?.[t], 0), facePolicy: FT[t] || null,
      groundM: num(gf.heightM, 3.5), groundGlass: num(gf.glassRatio, .5), groundColor: gf.colors || null, storefront: gf.storefrontLanduse || null,
      litRatio: num(n.litRatio, .3), groundLit: num(n.groundFloorLitRatio, n.litRatio ?? .3), tempW: n.temperatureWeights || [.5, .4, .1], litByLanduse: n.landuseLitRatio || null,
      wall: b.wall || { light: ['#bbbbbb'], dark: ['#555555'] }, roof: roof.flat || { light: '#888888', dark: '#333333' }, parapetM: num(roof.parapetM, .5), pitched: roof.pitched || null, panel: roof.panel || null,
      glass: b.glass || null, mullionM: num(b.mullionM, .12), beltEvery: num(b.beltEveryFloors, 0), beltM: num(b.beltHeightM, .35), balconyEvery: num(b.balconyEveryBays, 0), balconyBright: num(b.balconyBrightness, 1.07),
      spandrelM: num(b.spandrelM, 0), ribM: num(b.ribSpacingM, 0), baysPerGroup: b.baysPerGroup || null, awning: b.awning || null, setback: b.setback || null,
      // QA1: material families, roof variants, the night emission mask and the office's crown
      mix: b.materialMix || null, roofVariants: roof.variants || null, roofVariantW: roof.variantWeights || null,
      nightEmission: num(n.emission, NaN), nightGroundEmission: num(n.groundFloorEmission, NaN), nightFloorMul: n.floorProbabilityMultiplier || null,
      nightWin: n.windowRatio || null, tiers: n.brightnessTiers || null, maxContig: num(n.maxContiguousLitBays, 0),
      articulation: b.articulation || null, dayReflection: b.dayReflection || null,
    } as BuildingType;
  });
  const eq = D.equipment || {}, lit = D.litWindows || {}, wp = D.waterproofRoof || {};
  // material slots: a family × its variants (wall, glass and roof colours paired), or without families each type's
  // own four walls; each type then draws from a weighted list of slots (one stable pick a building)
  const fams = pack.materialFamilies || null, A = pack.materialAssignment || {}, materials:Material[] = [], famIndex:Record<string, { base:number; n:number; weights:number[]; hasRoof:boolean }> = {};
  const at = <V,>(arr:readonly V[] | null | undefined, v:number):V | null => arr && arr.length ? arr[v % arr.length]! : null;
  if (fams) for (const [key, f] of Object.entries(fams)) {
    const n = Math.max(1, f.wall?.light?.length || 1), fac = f.facade || {};
    famIndex[key] = { base: materials.length, n, weights: f.variantWeights || [.5, .3, .2], hasRoof: !!f.roof };
    for (let v = 0; v < n; v++) materials.push({
      family: key, kind: f.kind || '', wall: { light: at(f.wall.light, v), dark: at(f.wall.dark || f.wall.light, v) },
      glass: f.glass ? { light: at(f.glass.light, v), dark: at(f.glass.dark || f.glass.light, v) } : null,
      roof: f.roof ? { light: at(f.roof.light, v), dark: at(f.roof.dark || f.roof.light, v) } : null,
      pattern: fac.pattern && fac.pattern !== 'type-default' ? (PATTERNS[fac.pattern] ?? -1) : -1, winW: num(fac.windowRatio?.[0], 0) * (f.kind === 'glass' ? 1 : mScale), winH: num(fac.windowRatio?.[1], 0), refl: num(fac.reflectionScale, .1),
      bayM: num(fac.bayM, 0), glassKind: f.kind === 'glass',
    } as Material);
  }
  const wallWeights = D.wallWeights || [.4, .3, .2, .1];
  for (const T of types) {
    T.mats = [];
    if (fams && T.mix) for (const m of T.mix) { const F = famIndex[m.family]; if (!F) continue; for (let v = 0; v < F.n; v++) T.mats.push([F.base + v, num(m.weight, 0) * num(F.weights[v], 0)]) }
    if (!T.mats.length) {
      const base = materials.length, cols = T.wall.light || ['#999999'], dcols = T.wall.dark || cols;
      for (let v = 0; v < 4; v++) materials.push({ family: 'type-' + T.key, kind: '', wall: { light: cols[Math.min(v, cols.length - 1)], dark: dcols[Math.min(v, dcols.length - 1)] }, glass: null, roof: null, pattern: -1, winW: 0, winH: 0, refl: T.key === 'office' ? .85 : .1, bayM: 0, glassKind: T.key === 'office' && T.pattern === 3 } as Material);
      T.mats = wallWeights.map((w, v) => [base + v, w]);
    }
    const sum = T.mats.reduce((a, m) => a + m[1], 0) || 1; for (const m of T.mats) m[1] /= sum;
    T.famFacade = String(A.facadePolicyByType?.[T.key] || '').startsWith('use-family');
  }
  // the bay actually used: the pack's bay widened until the pier between windows is at least minPierM (curtain walls keep theirs);
  // a family facade's own bay (stone offices) likewise, against the office's pier
  const pierBay = (bay:number, pattern:number, winW:number, pier:number) => pattern === 3 || pattern < 0 ? bay : Math.max(bay, pier / Math.max(.05, 1 - winW));
  for (const T of types) T.bayEff = pierBay(T.bayM, T.pattern, T.winW, T.minPier);
  const officeT = types.find(T => T.key === 'office') || types[0]!;
  for (const m of materials) m.bayEff = pierBay(m.bayM || officeT.bayM, m.pattern, m.winW || officeT.winW, officeT.minPier);
  // roof slots: one a material (its family's roof, when it has one), then each type's four variants, the waterproof
  // membrane, and each type's plain roof; the pick order (roofPriority) decides which a building gets
  const roofs = materials.map(m => m.roof);
  for (const T of types) { T.roofVarBase = roofs.length; const rv = T.roofVariants; for (let v = 0; v < 4; v++) roofs.push(rv ? { light: at(rv.light, v), dark: at(rv.dark || rv.light, v) } : null) }
  const waterSlot = roofs.length; roofs.push(wp.colors || { light: '#7D9282', dark: '#3A5047' });
  for (const T of types) { T.legacyRoofSlot = roofs.length; roofs.push(T.roof) }
  return {
    materials, famIndex, roofs, waterSlot, variantSalt: num(A.variantSeedSalt, 173), roofSalt: num(A.roofSeedSalt, 431),
    roofPriority: A.roofPriority || ['waterproof-subset', 'type-roof-variants', 'family-roof', 'legacy-flat'], roofPriorityByType: A.roofPriorityByType || {},
    lodPx: [num(D.windowBandMinPx, .65), num(D.windowCellMinPx, 1.25)],
    pack, types, byKey: Object.fromEntries(types.map((t, i) => [t.key, i])),
    rules: C.rules || [], minH: num(C.minimumHeightM, 3), missingH: num(C.missingHeightM, 9), merged: C.mergedLowrise || { maxHeightM: 15, areaGreaterThanM2: 1200 },
    equalAreaPriority: C.equalAreaPriority || [], landuseAliases: { ...LANDUSE_ALIASES, ...(C.landuseAliases || {}) },
    wallWeights, parapetT: num(D.parapetThicknessM, .18), edgeClear: num(D.roofEquipmentEdgeClearanceM, .6), glass: D.glass || { light: '#52696C', dark: '#1B2B33' },
    lit: { colors: (lit.colors || ['#FFD59A', '#FFE7BD', '#DDEAF0']).map(hexRGB), emission: num(lit.emission, .7), groundEmission: num(lit.groundFloorEmission, .9), floorMul: lit.floorProbabilityMultiplier || [.65, 1.2] },
    equip: { minZoom: num(eq.minZoom, 16), minH: num(eq.minHeightM, 12), minA: num(eq.minAreaM2, 120), penthouseArea: eq.penthouseAreaRatio || [.04, .07], penthouseH: num(eq.penthouseHeightM, 1.8), hvacCount: eq.hvacCount || [1, 3], hvacSize: eq.hvacSizeM || [1.6, 1, .9], colors: eq.colors || { light: '#A7ADA5', dark: '#4D5C59' } },
    signs: pack.signs || null,   // 간판(signs())
    hanok: pack.hanok || null,   // 조선 모드(city_hanok.mjs)
    race: pack.race || null,   // 스타크래프트 종족 건물(부품 'race' — web/modes/starcraft/race_buildings.mjs)
    nation: pack.nation || null,   // 나라 모드 건물(부품 'nation' — web/modes/nations/parts.mjs: 몇 채만 그 나라 건물, 나머지는 보통)
    waterproof: { maxH: num(wp.maxHeightM, 15), p: num(wp.probability, .35), colors: wp.colors || { light: '#7D9282', dark: '#3A5047' } },
    light: L.light || { ambient: .64, directional: .36, color: '#FFF1D8', maxSideDarken: .2, maxRoofBrighten: .08 }, dark: L.dark || { ambient: .72, directional: .28, color: '#BCD0D6' },
    ao: L.ao || { opacity: .1, widthM: .5 }, refSun: L.referenceSun || { azimuthDeg: 225, elevationDeg: 42 },
    modes: M, lod: { equipment: LOD.roofEquipment || [16, 16.5], windows: LOD.windows || [15, 16] },
    faces: { gap: num(FF.neighbourGapM, 3), open: num(FF.openDistanceM, 8), minFace: num(FF.minFaceWidthM, 6), slab: num(FF.slabAspect, 1.5), primaryOnlyMaxA: num(FF.primaryOnlyMaxAreaM2, 600) },
    // 심시티 x-ray (pack.xray): buildings hiding a station platform or a running train turn to glass there (city_buildings.mjs)
    xray: (() => { const X = pack.xray || {}; return { alpha: num(X.alpha, .3), edgeAlpha: num(X.edgeAlpha, .75), edgePx: num(X.edgePx, 1.5), featherPx: num(X.featherPx, 24), fadeMs: num(X.fadeMs, 200), maxTargets: Math.max(1, num(X.maxTargets, 48)), pieceM: Math.max(5, num(X.pieceM, 30)), platformMarginM: num(X.platformMarginM, 4), platformBelowM: num(X.platformBelowM, 2.5), platformAboveM: num(X.platformAboveM, 6), trainHalfWidthM: num(X.trainHalfWidthM, 3), trainBelowM: num(X.trainBelowM, 1), trainAboveM: num(X.trainAboveM, 4.5), trains: X.trains !== false, on: pack.xray !== null } })(),
    // buildings the viaduct passes through (pack.throughBuildings): the glass band around the deck's rail height, the portal width, its look
    through: { railM: num(TB.railHeightM, num(pack.viaduct?.railHeightM, 11)), below: num(TB.bandBelowM, 2), above: num(TB.bandAboveM, 4.6), glass: TB.glass || {}, frame: TB.frame || {}, inside: TB.insideLight || {}, mullEvery: Math.max(.3, num(TB.mullionEveryM, 1.5)), mull: num(TB.mullionM, .08), portalHalf: Math.max(1, num(TB.portalHalfM, 12)), near: Math.max(0, num(TB.alongsideM, 8)), skyMix: num(TB.skyMix, .4), insideMix: num(TB.insideMix, .3), nightEmission: num(TB.nightEmission, 1.7), depthOpen: TB.depthOpen !== false },
  };
}

// ── building type: the one place the estimate lives (height, footprint area, landuse class) ─────
// info = {heightM, areaM2, landuse, id, props}; returns {type, mergedLowrise}. Rules come from the pack
// (first match; the conditions inside a rule are ANDed). Replace through opts.classify when real
// per-building use data is available: classify(info, estimate) → type key or null to keep the estimate.
export function classifyBuilding(info:BuildingInfo, P:ResolvedPack):Estimate {
  const H = info.heightM, A = info.areaM2, L = info.landuse || 'unknown';
  let type = 'shop';
  for (const r of P.rules) {
    if (r.landuse && !r.landuse.includes(L)) continue;
    if (r.excludedLanduse && r.excludedLanduse.includes(L)) continue;
    if (r.minHeightM != null && H < r.minHeightM) continue;
    if (r.maxHeightM != null && H > r.maxHeightM) continue;
    if (r.minAreaM2 != null && A < r.minAreaM2) continue;
    if (r.maxAreaM2 != null && A > r.maxAreaM2) continue;
    type = r.type; break;
  }
  const m = P.merged, mergedLowrise = H <= num(m.maxHeightM, 15) && A > num(m.areaGreaterThanM2, 1200);
  return { type, mergedLowrise };
}

// ── vertex writer: 32 bytes a vertex ─────────────────────────────────────────────────────────────
//  0 xy f32×2 (tile-relative mercator) · 8 z f32 (m) · 12 normal i8×3 + kind i8 · 16 u f32 (wall: along it, m;
//  roof: its axis angle; plant/awning: base height) · 20 wall u8×4 (bays (0 = no windows), length lo/hi in 5 cm, edge seed (4 bits) | faceClass<<4 (0 all bays, 1 every other, 2 one narrow column) | corner-at-start<<6 | corner-at-end<<7)
//  · 24 building u8×4 (seed lo/hi, type|crown<<3|famFacade<<5, flags | cornerWidthShare<<4) · 28 misc u8×4 (colour pick, lit override, H lo/hi in 10 cm)
export const STRIDE = 32;
export const INST_STRIDES = { skirt: 32, roof: 64, box: 40 };
// 모형 기록(스타크래프트 종족 건물): 템플릿 번호 차례로 모아 한 판 — f32 x · y(타일 메르카토르) · 바닥 z(m) · 긴 축 ux, uy · 반 길이 · 반 폭 · 높이 단위(m),
// u8 재질 · 지붕 색 · 높이(10 cm) 둘 · 건물 바이트 넷. groups: [템플릿, 첫 기록, 수]
export const MODEL_STRIDE = 40;
function packModels(recs:number[][] | null):{ data:Uint8Array; groups:[number, number, number][] } | null {
  if (!recs || !recs.length) return null;
  recs.sort((a, b) => a[0]! - b[0]!);
  const buf = new ArrayBuffer(recs.length * MODEL_STRIDE), f = new Float32Array(buf), u8 = new Uint8Array(buf), groups:[number, number, number][] = [];
  recs.forEach((r, i) => { const o = i * MODEL_STRIDE; for (let k = 0; k < 8; k++) f[o / 4 + k] = r[1 + k]!; for (let k = 0; k < 8; k++) u8[o + 32 + k] = r[9 + k]!;
    if (!groups.length || groups[groups.length - 1]![0] !== r[0]) groups.push([r[0]!, i, 0]); groups[groups.length - 1]![2]++ });
  return { data: u8, groups };
}   // 인스턴스 하나의 바이트(조선): city_hanok.mjs skirtInst · roofInst · boxInst 가 채운다
class Writer {
  declare cap:number; declare buf:ArrayBuffer; declare f:Float32Array; declare u8:Uint8Array; declare i8:Int8Array; declare n:number; declare kind:number;
  declare nx:number; declare ny:number; declare nz:number; declare w:Quad; declare b:Quad; declare m:Quad;
  constructor() { this.cap = 1 << 15; this.buf = new ArrayBuffer(this.cap * STRIDE); this.view(); this.n = 0; this.kind = 0; this.nx = 0; this.ny = 0; this.nz = 1; this.w = [0, 0, 0, 0]; this.b = [0, 0, 0, 0]; this.m = [0, 0, 0, 0] }
  view() { this.f = new Float32Array(this.buf); this.u8 = new Uint8Array(this.buf); this.i8 = new Int8Array(this.buf) }
  grow() { const nb = new ArrayBuffer(this.cap * 2 * STRIDE); new Uint8Array(nb).set(this.u8); this.buf = nb; this.cap *= 2; this.view() }
  normal(nx:number, ny:number, nz:number) { this.nx = nx; this.ny = ny; this.nz = nz }
  v(x:number, y:number, z:number, u:number):number {
    if (this.n >= this.cap) this.grow();
    const i = this.n++, f = i * 8, o = i * STRIDE;
    this.f[f] = x; this.f[f + 1] = y; this.f[f + 2] = z; this.f[f + 4] = u;
    this.i8[o + 12] = Math.round(this.nx * 127); this.i8[o + 13] = Math.round(this.ny * 127); this.i8[o + 14] = Math.round(this.nz * 127); this.i8[o + 15] = this.kind;
    const u8 = this.u8; u8[o + 20] = this.w[0]; u8[o + 21] = this.w[1]; u8[o + 22] = this.w[2]; u8[o + 23] = this.w[3];
    u8[o + 24] = this.b[0]; u8[o + 25] = this.b[1]; u8[o + 26] = this.b[2]; u8[o + 27] = this.b[3];
    u8[o + 28] = this.m[0]; u8[o + 29] = this.m[1]; u8[o + 30] = this.m[2]; u8[o + 31] = this.m[3];
    return i;
  }
  bytes() { return this.u8.subarray(0, this.n * STRIDE) }
}

// ── one tile's meshes, built in slices ───────────────────────────────────────────────────────────
// src: {z,x,y,extent,buildings:VectorTileLayer,landuse:VectorTileLayer|null}
export class TileBuilder {
  declare src:TileSource; declare P:ResolvedPack; declare opts:BuilderOptions; declare E:number; declare through:ThroughMaps | ThroughById | null;
  declare unit:number; declare mpu:number; declare mPerUnit:number; declare ox:number; declare oy:number; declare wox:number; declare woy:number;
  declare W:Writer; declare chunks:Chunk[]; declare zmax:number; declare count:number; declare fi:number; declare polys:RingPolygon[] | null; declare pi:number;
  declare landuse:LanduseArea[] | null; declare done:boolean; declare seen:Set<string>; declare items:Item[]; declare blockers:{ ring:Ring; item:number }[] | null;
  declare ei:number; declare grid:Map<number, number[]> | null; declare cell:number; declare goff:number; declare models:number[][] | null;
  declare marks:{ x:number; y:number; r:number; minH:number }[]; declare cur:{ idLo:number; idHi:number; H:number; minH:number }; declare warned:boolean | undefined;
  constructor(src:TileSource, P:ResolvedPack, opts:BuilderOptions) {
    this.src = src; this.P = P; this.opts = opts; this.E = src.extent || 4096; this.through = opts.through || null;   // through: Map osm id → [{lng, lat, railM}] (web/city/through_buildings.mjs), the buildings the viaduct passes through
    const n = 2 ** src.z, latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * src.y / n))), latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (src.y + 1) / n))), lat = (latN + latS) / 2;
    this.unit = 1 / n / this.E;                        // mercator units a tile unit
    this.mpu = 1 / (EARTH * Math.cos(lat));            // mercator units a metre at this tile (as MercatorCoordinate.meterInMercatorCoordinateUnits)
    this.mPerUnit = this.unit / this.mpu;              // metres a tile unit (latitude corrected)
    this.ox = src.x / n; this.oy = src.y / n;          // the tile's origin in mercator
    this.wox = (this.ox - G[0]) * S; this.woy = (this.oy - G[1]) * S;   // and in city metres
    this.W = new Writer(); this.chunks = []; for (let i = 0; i < CHUNKS * CHUNKS; i++) this.chunks.push({ lo: [], walls: [], hi: [], inst: { skirt: [], roof: [], box: [] }, instFar: { skirt: [], roof: [], box: [] }, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, zmax: 0, n: 0 });
    this.zmax = 0; this.count = 0; this.fi = 0; this.polys = null; this.pi = 0; this.landuse = null; this.done = false; this.seen = new Set();
    this.items = []; this.blockers = []; this.ei = 0; this.grid = null; this.models = null;   // models: 모형 기록(부품 'race' — 스타크래프트 종족 건물, 꼭짓점 대신 템플릿 번호 · 자리)
    // 랜드마크 자리(타일 단위): 그 안에 중심이 있는 높은 조각 건물은 빼고 전용 모델(city_landmarks.mjs)이 그린다
    // (팩 landmarkHide: 그 팩에서만 빼는 자리 — 조선: 남산타워 자리에 석탑, 2026-10-11)
    this.marks = [...LANDMARKS, ...(P.pack?.landmarkHide || []).map(h => ({ lngLat: h.lngLat, hide: h }))].map(L => { const [mx, my] = landmarkMerc(L); return { x: (mx - this.ox) / this.unit, y: (my - this.oy) / this.unit, r: L.hide.radiusM / this.mPerUnit, minH: L.hide.minH } })
      .filter(m => m.x > -m.r - this.E && m.x < 2 * this.E + m.r && m.y > -m.r - this.E && m.y < 2 * this.E + m.r);   // phase 1 reads every footprint (items; blockers = raw outlines, also those in the tile's buffer), phase 2 writes the meshes
  }
  // 랜드마크 자리의 조각 건물인가: 외곽 전체의 가운데가 그 반경 안이고 높이가 minH 이상
  landmarkPart(flat:readonly (readonly number[])[], H:number):boolean {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const a of flat) for (let i = 0; i < a.length; i += 2) { if (a[i]! < x0) x0 = a[i]!; if (a[i]! > x1) x1 = a[i]!; if (a[i + 1]! < y0) y0 = a[i + 1]!; if (a[i + 1]! > y1) y1 = a[i + 1]! }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return this.marks.some(m => H >= m.minH && Math.hypot(cx - m.x, cy - m.y) < m.r && Math.max(x1 - x0, y1 - y0) < 2.5 * m.r);
  }
  // run until the budget (ms) is spent; true when the tile is finished. Two phases: every footprint is read first (and all
  // outlines indexed, so each wall can look for the building across from it), then the meshes are written
  step(budget:number):boolean {
    const t0 = performance.now(), bl = this.src.buildings;
    if (!this.landuse) this.landuse = this.readLanduse();
    if (!bl) { this.done = true; return true }
    while (this.fi < bl.length) {
      if (!this.polys) {
        const f = bl.feature(this.fi), p = f.properties || {};
        if (p.hide_3d === true || p.hide_3d === 'true') { this.fi++; continue }
        let rings; try { rings = f.loadGeometry() } catch { this.fi++; continue }
        const flat = rings.map(r => { const a:number[] = new Array(r.length * 2); for (let i = 0; i < r.length; i++) { a[i * 2] = r[i]!.x; a[i * 2 + 1] = r[i]!.y } return a });
        if (this.marks.length && this.landmarkPart(flat, num(p.render_height, 0))) { this.fi++; continue }
        this.polys = classifyRings(flat); this.pi = 0;
        const id = f.id ?? 0; this.cur = { idLo: id >>> 0, idHi: Math.floor(id / 4294967296) >>> 0, H: num(p.render_height, NaN), minH: Math.max(0, num(p.render_min_height, 0)) };
      }
      while (this.pi < this.polys.length) {
        const poly = this.polys[this.pi++]!;
        if (this.marks.length && this.landmarkPart([poly.outer], num(this.cur.H, 0))) continue;   // 여러 건물을 한 feature 로 묶은 타일(OFM)도 그 자리 조각만 뺀다(2026-10-11 남산 광장)
        try { this.prepare(poly) } catch (e) { this.warn(e) }
        if (performance.now() - t0 > budget) return false;
      }
      this.polys = null; this.fi++;
      if (performance.now() - t0 > budget) return false;
    }
    if (!this.grid) { this.resolveOverlaps(); this.indexEdges(); if (performance.now() - t0 > budget) return false }
    while (this.ei < this.items.length) {
      const it = this.items[this.ei++]!; if (it.drop) continue;
      try { this.building(it) } catch (e) { this.warn(e) }
      if (performance.now() - t0 > budget) return this.ei >= this.items.length ? (this.done = true) : false;
    }
    this.done = true; return true;
  }
  warn(e:unknown) { if (!this.warned) { this.warned = true; console.warn('city-build: building failed', e) } }
  readLanduse():LanduseArea[] {
    const out:LanduseArea[] = [], lu = this.src.landuse; if (!lu) return out;
    const A = this.P.landuseAliases;
    for (let i = 0; i < lu.length; i++) {
      const f = lu.feature(i), cls = A[f.properties?.class as string] || f.properties?.class as string; if (!cls) continue;
      let rings; try { rings = f.loadGeometry() } catch { continue }
      for (const poly of classifyRings(rings.map(r => { const a:number[] = []; for (const p of r) a.push(p.x, p.y); return a })))
        out.push({ cls, outer: poly.outer, holes: poly.holes, bbox: ringBbox(poly.outer), area: poly.area2 / 2 });
    }
    return out;
  }
  landuseAt(x:number, y:number):string {
    let best:LanduseArea | null = null;
    for (const l of this.landuse!) {
      const b = l.bbox; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (!pointInPolygon(x, y, l.outer, l.holes)) continue;
      if (!best || l.area < best.area - 1e-6 || (Math.abs(l.area - best.area) <= 1e-6 && this.priority(l.cls) < this.priority(best.cls))) best = l;
    }
    return best ? best.cls : 'unknown';
  }
  priority(cls:string):number { const i = this.P.equalAreaPriority.indexOf(cls); return i < 0 ? 99 : i }
  // the stable seed of one footprint: feature id + a point both tiles see (its lowest vertex, or where its
  // outline crosses the tile edge when it was cut), on the absolute tile grid
  seedOf(ring:Ring, clipped:boolean):number {
    const E = this.E, bx = this.src.x * E, by = this.src.y * E;
    let kx = Infinity, ky = Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      const x = ring[i]!, y = ring[i + 1]!, onEdge = x <= 0 || x >= E || y <= 0 || y >= E;
      if (clipped && !onEdge) continue;
      if (x < kx || (x === kx && y < ky)) { kx = x; ky = y }
    }
    if (kx === Infinity) { kx = ring[0]!; ky = ring[1]! }
    return mix32(this.cur.idLo, this.cur.idHi, Math.round((bx + kx) * 4), Math.round((by + ky) * 4));
  }
  // phase 1, one footprint: clipped to the tile, simplified, measured, deduplicated; its raw outline joins the neighbour index
  // (outlines wholly outside the tile, in its buffer, only as neighbours — the next tile draws them)
  prepare(poly:RingPolygon) {
    const E = this.E, P = this.P, cur = this.cur;
    let outer = poly.outer, holes = poly.holes, clipped = false; const raw = poly.outer;
    const bb = ringBbox(outer);
    if (bb[2] <= 0 || bb[0] >= E || bb[3] <= 0 || bb[1] >= E) { if (raw.length >= 6) this.blockers!.push({ ring: raw, item: -1 }); return }
    if (!ringInBox(outer, 0, 0, E, E)) { outer = clipRing(outer, 0, 0, E, E); clipped = true; if (outer.length < 6) return; holes = holes.filter(h => ringInBox(h, 0, 0, E, E)) }
    else outer = simplifyRing(outer, .05);
    if (outer.length < 6) return;
    if (signedArea2(outer) < 0) return;   // folded by the clip
    holes = holes.map(h => simplifyRing(h, .05)).filter(h => h.length >= 6);
    const m2 = this.mPerUnit * this.mPerUnit, A = (Math.abs(signedArea2(outer)) / 2 - holes.reduce((s, h) => s + ringArea(h), 0)) * m2;
    if (A < 4) return;
    const H = Math.max(P.minH, Number.isFinite(cur.H) ? cur.H : P.missingH), minH = Math.min(cur.minH, H - .5);
    const [ix, iy] = interiorPoint(outer, holes), landuse = this.landuseAt(ix, iy);
    const seed = this.seedOf(outer, clipped);
    const key = seed + ':' + H; if (this.seen.has(key)) return; this.seen.add(key);   // the same outline twice (duplicate features)
    const item = this.items.length;
    this.items.push({ item, outer, holes, clipped, A, H, minH, landuse, seed, ix, iy, idLo: cur.idLo, idHi: cur.idHi, raw, fi: this.fi, ri: poly.idx });
    this.blockers!.push({ ring: raw, item });
  }
  // phase boundary: a footprint lying inside another one (a part traced over its outline, a courtyard ring wound the wrong
  // way, a building drawn twice — the tiles carry many) shares its wall planes and, at the same height, its roof plane with
  // it, and the two fight for the pixel whenever the camera moves. The inner one is pulled in by a few centimetres, lowered
  // as much when the heights match, and dropped when it is a mere duplicate (the same height, (almost) wholly inside). Its
  // container's outline then does not count as a neighbour for its windows (faceOpen), so the pulled-in walls keep them
  resolveOverlaps() {
    const items = this.items, n = items.length, O = OVERLAP, mpu = this.mPerUnit; if (n < 2) return;
    const bb = items.map(it => ringBbox(it.outer)), order = items.map((_, i) => i).sort((a, b) => bb[a]![0] - bb[b]![0]);
    const share = (s:Item, g:Item) => {   // the share of the smaller's sample points (its interior point, points most of the way out to its vertices) inside the larger
      const r = s.outer, m = r.length / 2, k = Math.max(1, Math.ceil(m / 16)); let inn = 0, tot = 1; if (pointInPolygon(s.ix, s.iy, g.outer, g.holes)) inn++;
      for (let i = 0; i < m; i += k) { tot++; if (pointInPolygon(s.ix + (r[i * 2]! - s.ix) * .8, s.iy + (r[i * 2 + 1]! - s.iy) * .8, g.outer, g.holes)) inn++ }
      return inn / tot;
    };
    for (let oi = 0; oi < n; oi++) {
      const i = order[oi]!, A = bb[i]!;
      for (let oj = oi + 1; oj < n; oj++) {
        const j = order[oj]!, B = bb[j]!; if (B[0] >= A[2]) break;
        if (B[1] >= A[3] || B[3] <= A[1]) continue;
        const a = items[i]!, b = items[j]!; if (a.drop || b.drop) continue;
        const sa = a.A <= b.A, s = sa ? a : b, g = sa ? b : a, S = sa ? A : B, G = sa ? B : A;
        const ix = Math.min(S[2], G[2]) - Math.max(S[0], G[0]), iy = Math.min(S[3], G[3]) - Math.max(S[1], G[1]); if (ix * iy < .1 * (S[2] - S[0]) * (S[3] - S[1])) continue;   // the boxes barely meet (neighbours along a street): not an overlap
        const sh2 = share(s, g); if (sh2 < O.touchShare) continue;   // apart, or touching along an edge
        const sameH = Math.abs(s.H - g.H) < .05 && Math.abs(s.minH - g.minH) < .05;
        if (sameH && sh2 >= O.redundantShare) { s.drop = true; continue }
        if (sh2 >= O.nestedShare) { (s.containers ||= new Set()).add(g.item); s.depth = (s.depth || 0) + 1 }   // inside: its walls would lie in the other's wall planes
        if (sameH) s.lower = (s.lower || 0) + 1;   // the same roof plane, wholly or in part
      }
    }
    for (const it of items) {
      if (it.drop || !(it.depth || it.lower)) continue;
      if (it.depth && !it.clipped) { const r = insetRing(it.outer, O.insetM * it.depth / mpu); if (r && r.length >= 6 && signedArea2(r) > 0) it.outer = r }   // (a cut outline stays: its cut edges must lie on the tile edge)
      if (it.lower) { it.H = Math.max(this.P.minH * .5, it.H - O.lowerM * it.lower); it.minH = Math.min(it.minH, it.H - .5) }
    }
  }
  // a grid (8 m cells) over the tile and its buffer holding every outline edge, for the face look-ups
  indexEdges() {
    const cell = this.cell = 8 / this.mPerUnit, g = this.grid = new Map<number, number[]>(), off = this.goff = this.E;   // the offset keeps buffer coordinates (negative) positive
    for (const { ring, item } of this.blockers!) {
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = ring[i * 2]!, ay = ring[i * 2 + 1]!, bx = ring[j * 2]!, by = ring[j * 2 + 1]!;
        if (ax === bx && ay === by) continue;
        const x0 = Math.floor((Math.min(ax, bx) + off) / cell), x1 = Math.floor((Math.max(ax, bx) + off) / cell), y0 = Math.floor((Math.min(ay, by) + off) / cell), y1 = Math.floor((Math.max(ay, by) + off) / cell);
        for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = cx * 65536 + cy; let a = g.get(k); if (!a) g.set(k, a = []); a.push(item, ax, ay, bx, by) }
      }
    }
    this.blockers = null;
  }
  // what stands in front of a wall: rays from a few points along it, outward, up to openDistanceM — the share of them that
  // meet another building's outline within neighbourGapM (a party wall) or within openDistanceM (a close neighbour), and the
  // typical free distance (m). Only other buildings count, never the wall's own
  faceOpen(item:number, ax:number, ay:number, bx:number, by:number, nx:number, ny:number, ignore:Set<number> | null = null):FaceView {
    const F = this.P.faces, mpu = this.mPerUnit, D = F.open / mpu, gap = F.gap / mpu, len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.min(6, Math.ceil(len * mpu / 4)));
    const g = this.grid!, cell = this.cell, off = this.goff, eps = .02 / mpu; let abut = 0, near = 0; const ds:number[] = [];
    for (let s = 0; s < k; s++) {
      const t = (s + .5) / k, px = ax + (bx - ax) * t + nx * eps, py = ay + (by - ay) * t + ny * eps, qx = px + nx * D, qy = py + ny * D;
      let best = Infinity;
      const x0 = Math.floor((Math.min(px, qx) + off) / cell), x1 = Math.floor((Math.max(px, qx) + off) / cell), y0 = Math.floor((Math.min(py, qy) + off) / cell), y1 = Math.floor((Math.max(py, qy) + off) / cell);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const a = g.get(cx * 65536 + cy); if (!a) continue;
        for (let i = 0; i < a.length; i += 5) {
          if (a[i] === item || (ignore && ignore.has(a[i]!))) continue;   // never the wall's own outline, nor the one it stands inside
          const ex = a[i + 3]! - a[i + 1]!, ey = a[i + 4]! - a[i + 2]!, den = nx * ey - ny * ex; if (Math.abs(den) < 1e-9) continue;   // parallel to the ray
          const wx = a[i + 1]! - px, wy = a[i + 2]! - py, tt = (wx * ey - wy * ex) / den, ss = (wx * ny - wy * nx) / den;   // p + n·tt = a + e·ss
          if (tt > 0 && tt < best && ss >= 0 && ss <= 1) best = tt;
        }
      }
      if (best <= gap) abut++; if (best <= D) near++; ds.push(best);
    }
    ds.sort((p, q) => p - q);
    return { abut: abut / k, near: near / k, dist: ds[ds.length >> 1]! * mpu };
  }
  // which windows a wall gets — 'full' | 'sparse' (every other bay) | 'single' (one narrow column) | 'blank' — from the type's
  // policy (pack facadeFaces.byType), what the wall looks onto (a party wall, a close neighbour, open ground), its role (the short
  // end of a slab; the primary face = the longest open face of a small building). Glazed office families keep glass all round
  faceDensity(ctx:BuildCtx, f:FaceView, primary:boolean):string {
    const F = this.P.faces; let pol = ctx.T.facePolicy;
    if (!pol) return 'full';
    if (pol.glass !== undefined || pol.masonry) { if (this.P.materials[ctx.mat]!.glassKind) return pol.glass || 'full'; pol = pol.masonry || pol }
    if (f.abut >= .5) return pol.abutting || 'blank';
    if (f.short && pol.shortFaces && pol.shortFaces !== 'same') return pol.shortFaces;
    if (f.near >= .5) return pol.near || 'full';
    if (pol.primaryOnly && ctx.A <= F.primaryOnlyMaxA && !primary) return 'sparse';
    return pol.open || 'full';
  }
  // phase 2, one building's meshes
  building(it:Item) {
    if (this.P.hanok) return (cityPart('hanok') as BuildingPart).building(this, it, unit);   // 조선 모드: 기와집 instead of the city's buildings
    const E = this.E, P = this.P, { outer, holes, clipped, A, H, minH, landuse, seed, ix, iy } = it;
    const info:BuildingInfo = { heightM: H, areaM2: A, landuse, id: it.idLo + it.idHi * 4294967296, props: null };
    let est = classifyBuilding(info, P);
    if (this.opts.classify) { const t = this.opts.classify(info, est); if (t && P.byKey[t] != null) est = { ...est, type: t } }
    const ti = P.byKey[est.type] ?? 2, T = P.types[ti]!;
    const mat = T.mats[pick(T.mats.map(m => m[1]), unit(seed, P.variantSalt))]![0];   // the building's material slot (family and variant together)
    // per-building bytes
    const W = this.W, storefront = T.storefront ? T.storefront.includes(landuse) : false;
    const litOverride = T.litByLanduse && T.litByLanduse[landuse] != null ? Math.round(T.litByLanduse[landuse]! * 255) : 0;
    const Hq = Math.min(65535, Math.round(H * 10));
    const chunk = this.chunks[Math.min(CHUNKS - 1, Math.floor(ix / E * CHUNKS)) + CHUNKS * Math.min(CHUNKS - 1, Math.floor(iy / E * CHUNKS))]!;
    const ctx = { outer, holes, A, H, minH, T, ti, seed, chunk, clipped, landuse, storefront, merged: est.mergedLowrise, mat, item: it.item, ignore: it.containers || null } as BuildCtx;
    const obb = outer.length <= 400 ? orientedBox(outer) : null;   // a slab (long/short ≥ slabAspect): its ends are the short faces
    ctx.slab = obb && obb.hh > 0 && obb.hw / obb.hh >= P.faces.slab ? { ux: obb.ux, uy: obb.uy } : null;
    ctx.roofSlot = this.roofSlotOf(ctx);
    // the office's crown (QA1 articulation): flat band / inset cap / stepped cap by a stable share; the set-back kinds need a safe inset
    const art = T.articulation; let crown = 0, crownInsets:Ring[] | null = null;
    if (art && !clipped && !holes.length && H >= num(art.minHeightM, 60)) {
      const r = unit(seed, 6), w = art.crownWeights || { flatBand: .5, insetCap: .3, steppedCap: .2 }; crown = r < num(w.flatBand, .5) ? 1 : r < num(w.flatBand, .5) + num(w.insetCap, .3) ? 2 : 3;
      const d = Math.min(1.2, num(art.maxInsetM, 1.2)) / this.mPerUnit;
      if (crown === 2) { const i1 = insetRing(outer, d) || insetRing(outer, d * .6); if (i1) crownInsets = [i1]; else crown = 1 }
      else if (crown === 3) { const i1 = insetRing(outer, d * .5), i2 = i1 && insetRing(i1, d * .5); if (i2) crownInsets = [i1, i2]; else crown = 1 }
    }
    // the corner accents' width as a share (0..15/15) of the pack's range: the accent budget (maxAccentFacadeAreaRatio) over the whole
    // facade — the belts' worst case first, then the real corners' widest strips against the perimeter — so a small or many-cornered tower gets narrower corners
    let cwQ = 15;
    if (art && H >= num(art.minHeightM, 60)) {
      const corner = realCorners(outer), n = outer.length / 2; let per = 0, nc = 0;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; per += Math.hypot(outer[j * 2]! - outer[i * 2]!, outer[j * 2 + 1]! - outer[i * 2 + 1]!); if (corner[i]) nc++ }
      per *= this.mPerUnit;
      const arr = (v:unknown, d:number) => { const a = (Array.isArray(v) ? v : [v]).map(x => num(x, NaN)).filter(Number.isFinite); return a.length ? a : [d] };
      const beLo = Math.min(...arr(art.beltEveryFloors, 6)), bhHi = Math.max(...arr(art.beltHeightM, .55)), cwHi = Math.max(...arr(art.cornerWidthM, .65));
      const budget = num(art.maxAccentFacadeAreaRatio, 1) - bhHi / (Math.max(1, beLo) * T.floorM), use = nc * cwHi / Math.max(per, 1);
      cwQ = Math.round(Math.max(0, Math.min(1, budget / Math.max(use, 1e-6))) * 15);
    }
    const th = this.throughLevel(it);   // the viaduct passes through it: {railM, segs: its path here} or 0 — wallsOf opens the band only on the wall pieces the path crosses, which carry the rail height
    ctx.th = th && th.segs ? { segs: th.segs, half: P.through.portalHalf, near: P.through.near / this.mPerUnit, rq: Math.max(0, Math.min(63, Math.round((th.railM - RAIL_Q.base) / RAIL_Q.step))) } : null;
    W.b = [seed & 255, (seed >>> 8) & 255, ti | (crown << 3) | (T.famFacade ? 32 : 0), (est.mergedLowrise ? FLAG.MERGED : 0) | (storefront ? FLAG.STOREFRONT : 0) | (cwQ << 4)];
    W.m = [mat, litOverride, Hq & 255, Hq >>> 8];
    this.count++; chunk.n++;
    if (P.race && (cityPart('race') as BuildingPart).building(this, ctx, unit)) return;   // 스타크래프트: 종족 건물(못 지으면 아래 보통 건물)
    if (P.nation && (cityPart('nation') as BuildingPart).building(this, ctx, unit)) return;   // 나라 모드: 그 나라 건물(고른 몇 채만)
    // roofs: gabled small houses, crowned office tops, or the flat roof behind its parapet
    if (this.gable(ctx)) return;
    if (crownInsets) { const tz = art!.topZoneHeightRatio || [.06, .1], r0 = num(tz[0], .06), r1 = num(tz[1], .1); this.crown(ctx, crownInsets, Math.min(H * (r0 + (r1 - r0) * ((seed & 0xffff) % 5) / 4), num(art!.maxTopZoneHeightM, 4.5))); return }   // the top zone's height: the pack's ratio range, the same stable pick the shader makes from the 16-bit seed it sees
    if (!art && this.setback(ctx)) return;
    this.wallsOf(ctx, outer, minH, H, true); for (const h of holes) this.wallsOf(ctx, h, minH, H, false);
    this.flatRoof(ctx, outer, holes, H, true);
    this.cutWalls(ctx);
    this.plant(ctx);
    this.awning(ctx);
    this.signs(ctx);
  }
  // the viaduct passes through this footprint (this.through: osm id → [{lng, lat, railM, path}], a point inside each crossed
  // footprint): {railM: the deck's rail height there, segs: its path in tile units}, or 0 when it is not crossed. Matched by the
  // exact ring key when the list has one, else by the feature id and the point — a merged feature carries many rings — against
  // the unclipped outline, so both tiles' halves of a cut building agree
  throughLevel(it:Item):0 | { railM:number; segs:number[] | null } {
    const TH = this.through; if (!TH) return 0;
    const hit = (list:ThroughEntry[]) => { if (!list.length) return 0; let segs:number[] | null = null; for (const e of list) { const s = this.pathSegs(e); if (s) segs = segs ? segs.concat(s) : s } return { railM: num(list[0]!.railM, this.P.through.railM), segs } };   // every stretch crossing it (a station structure spans two edges): all their paths
    const byRing = (TH as ThroughMaps).byRing || null, byId = (TH as ThroughMaps).byId || (TH as ThroughById);   // {byId, byRing} from the layer, or a bare Map by id
    if (byRing && byRing.size) { const a = byRing.get(`${this.src.z}/${this.src.x}/${this.src.y}/${it.fi}/${it.ri}`); if (a) return hit(Array.isArray(a) ? a : [a]) }   // the exact ring of this tile version
    const list = byId && byId.size ? byId.get(it.idLo + it.idHi * 4294967296) : null; if (!list) return 0;
    const n = 2 ** this.src.z, E = this.E, ring = it.raw || it.outer, inside:ThroughEntry[] = [], near:ThroughEntry[] = [];
    for (const e of list) {
      const x = ((e.lng / 360 + .5) * n - this.src.x) * E, y = ((.5 - Math.log(Math.tan(Math.PI / 4 + e.lat * RAD / 2)) / (2 * Math.PI)) * n - this.src.y) * E;
      if (pointInPolygon(x, y, ring, [])) inside.push(e);
      else { const b = ringBbox(ring), m = 2 / this.mPerUnit; if (x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m) near.push(e) }   // a centre outside its own (concave) outline: its box, 2 m wide
    }
    return hit(inside.length ? inside : near);
  }
  // the viaduct's path at a listed building (the entry's lng/lat points) as segments in tile units [x0, y0, x1, y1, …], or null
  pathSegs(e:ThroughEntry):number[] | null {
    const p = e.path; if (!Array.isArray(p) || p.length < 2) return null;
    const n = 2 ** this.src.z, E = this.E, out:number[] = []; let px = 0, py = 0;
    for (let i = 0; i < p.length; i++) { const x = ((+p[i]![0] / 360 + .5) * n - this.src.x) * E, y = ((.5 - Math.log(Math.tan(Math.PI / 4 + +p[i]![1] * RAD / 2)) / (2 * Math.PI)) * n - this.src.y) * E; if (i) out.push(px, py, x, y); px = x; py = y }
    return out.length ? out : null;
  }
  // an edge lying along the tile's edge: the cut where the tile clipped the outline (the neighbour tile draws the rest)
  cutEdge(ax:number, ay:number, bx:number, by:number):boolean { const E = this.E; return (ax === bx && (ax <= 0 || ax >= E)) || (ay === by && (ay <= 0 || ay >= E)) }
  // writes one ring's walls from z0 to z1; outward normals; windows fitted edge by edge. Cut edges are kept for
  // after the roof (cutWalls): they rise only to the roof surface, so they never show as a fin across it
  wallsOf(ctx:BuildCtx, ring:Ring, z0:number, z1:number, isOuter:boolean, solid = false) {
    const W = this.W, E = this.E, u = this.unit, mpu = this.mPerUnit, T = ctx.T, ch = ctx.chunk, n = ring.length / 2, corner = realCorners(ring), F = this.P.faces;
    const mat = this.P.materials[ctx.mat]!, bayM = T.famFacade && mat.bayEff ? mat.bayEff : T.bayEff;
    // the faces first: what each wall looks onto and its role, then the primary face (the longest open one; failing that the longest)
    const faces:(FaceView | undefined)[] = new Array(n); let prim = -1, primScore = -1;
    if (!solid) for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = ring[i * 2]!, ay = ring[i * 2 + 1]!, bx = ring[j * 2]!, by = ring[j * 2 + 1]!, dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
      if (l < 1e-6 || this.cutEdge(ax, ay, bx, by)) continue;
      const f = this.faceOpen(ctx.item, ax, ay, bx, by, dy / l, -dx / l, ctx.ignore);
      f.short = ctx.slab ? Math.abs((dx * ctx.slab.ux + dy * ctx.slab.uy) / l) < 0.7071 : false;   // across the long axis rather than along it: a slab's end
      faces[i] = f;
      const score = (f.abut >= .5 ? 0 : f.near >= .5 ? 1 : 2) * 1e4 + l * mpu; if (score > primScore) { primScore = score; prim = i }
    }
    W.kind = KIND.WALL;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = ring[i * 2]!, ay = ring[i * 2 + 1]!, bx = ring[j * 2]!, by = ring[j * 2 + 1]!, dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const len = l * mpu, nx = dy / l, ny = -dx / l;   // away from the building (MVT winding)
      const aEdge = ax <= 0 || ax >= E || ay <= 0 || ay >= E, bEdge = bx <= 0 || bx >= E || by <= 0 || by >= E;
      if (aEdge && bEdge && this.cutEdge(ax, ay, bx, by)) { if (!solid) (ctx.cuts ||= []).push(ax, ay, bx, by, z0); continue }
      const absU0 = aEdge || bEdge;
      // the windows of this face: bays by the effective bay (piers at least the pack's minimum), then the face's density —
      // none on a party wall, every other bay on a side face, one narrow column on a slab's end or a face under minFaceWidthM
      let bays = solid ? 0 : Math.max(1, Math.round(len / bayM)); if (len < bayM * .55) bays = 0;
      const dens = faces[i] ? this.faceDensity(ctx, faces[i]!, i === prim) : 'full'; let cls = 0;
      if (dens === 'blank') bays = 0;
      else if (bays > 0 && len < F.minFace) { bays = (dens !== 'sparse' || i === prim) && len >= bayM * .8 ? 1 : 0; cls = 2 }
      else if (dens === 'sparse') cls = 1; else if (dens === 'single') cls = 2;
      // the viaduct's portal (ctx.th): the band opens (KIND.HALL) where its path crosses this wall, ±portalHalf around the crossing,
      // and along any stretch of the wall running beside the path, within alongsideM of it (the platform hall of a structure the
      // deck runs along); the rest of the wall stays a wall. A split wall takes world-metre window coordinates (ABS_U), so its pieces' windows
      // run on through the cuts
      let pieces:[number, number, boolean][] | null = null;
      if (ctx.th) {
        const G = ctx.th.segs, hw = ctx.th.half / len; let lo = 2, hi = -1;   // the open interval along the wall (0..1)
        for (let s = 0; s < G.length; s += 4) { const t = segX(ax, ay, bx, by, G[s]!, G[s + 1]!, G[s + 2]!, G[s + 3]!); if (t >= 0) { lo = Math.min(lo, t - hw); hi = Math.max(hi, t + hw) } }
        if (ctx.th.near > 0) { const k = Math.max(2, Math.min(24, Math.ceil(len / 2))), ex = dx / l, ey = dy / l; for (let q = 0; q <= k; q++) { const t = q / k, r = pathNear(ax + dx * t, ay + dy * t, G); if (r.d <= ctx.th.near && Math.abs(r.ux * ex + r.uy * ey) >= .7) { lo = Math.min(lo, t - .5 / k); hi = Math.max(hi, t + .5 / k) } } }   // beside the path and roughly along it (a wall across the path is the portal's business)
        if (hi > lo) { const t0 = Math.max(0, lo), t1 = Math.min(1, hi); if (t0 <= .02 && t1 >= .98) pieces = [[0, 1, true]]; else { pieces = []; if (t0 > .02) pieces.push([0, t0, false]); pieces.push([t0, t1, true]); if (t1 < .98) pieces.push([t1, 1, false]) } }
      }
      const split = !!pieces && pieces.length > 1, absU = absU0 || !!pieces;   // (a portal wall: absolute window coordinates, and no corner accents — their bits carry the rail height)
      const flags = W.b[3], bz = W.b[2]; W.b[3] = (flags & ~(FLAG.ABS_U | FLAG.NO_AO)) | (absU ? FLAG.ABS_U | FLAG.NO_AO : 0);
      let U0 = 0; if (absU) { const ex = dx / l, ey = dy / l, wx = this.wox + ax * u * S, wy = this.woy + ay * u * S; U0 = wx * ex + wy * ey }   // a wall cut by the tile edge, or split at a portal: its window coordinate in world metres, so the pieces continue each other
      W.normal(nx, ny, 0);
      const cornerBits = (corner[i] ? 64 : 0) | (corner[j] ? 128 : 0), eseed = mix32(ctx.seed, i, 3) & 15;
      for (const [t0, t1, hall] of pieces || [[0, 1, false]]) {
        const pl = len * (t1 - t0); if (pl < .02) continue;
        const pb = split ? (bays > 0 ? Math.max(1, Math.round(pl / bayM)) : 0) : bays, lq = Math.min(65535, Math.round(pl * 20));
        W.kind = hall ? KIND.HALL : KIND.WALL;
        if (pieces) { const rq = hall ? ctx.th!.rq : 0; W.b[2] = (bz & 63) | ((rq >> 4) << 6); W.b[3] = (W.b[3] & 15) | ((rq & 15) << 4) }   // the hall piece: the rail height code; the wall pieces of a portal wall: none (no corner accents on an absU wall anyway)
        W.w = [Math.min(255, pb), lq & 255, lq >>> 8, eseed | (cls << 4) | (t0 <= 0 ? cornerBits & 64 : 0) | (t1 >= 1 ? cornerBits & 128 : 0)];   // the edge's seed (4 bits), the face class, whether each end is a real corner
        const u0 = absU ? U0 + len * t0 : 0, u1 = absU ? U0 + len * t1 : pl;
        const X0 = (ax + dx * t0) * u, Y0 = (ay + dy * t0) * u, X1 = (ax + dx * t1) * u, Y1 = (ay + dy * t1) * u;
        const a0 = W.v(X0, Y0, z0, u0), b0 = W.v(X1, Y1, z0, u1), b1 = W.v(X1, Y1, z1, u1), a1 = W.v(X0, Y0, z1, u0);
        ch.walls.push(a0, b0, b1, a0, b1, a1);
        this.extend(ch, X0, Y0, X1, Y1, z1);
      }
      W.kind = KIND.WALL; W.b[3] = flags; W.b[2] = bz;
    }
  }
  // the walls along the tile's edge, up to the roof surface, solid (inside the whole building: seen only until the neighbour tile arrives)
  cutWalls(ctx:BuildCtx) {
    const c = ctx.cuts; if (!c) return; const W = this.W, u = this.unit, ch = ctx.chunk, top = ctx.roofZ ?? ctx.H;
    W.kind = KIND.WALL; W.w = [0, 0, 0, 0]; const flags = W.b[3]; W.b[3] = flags | FLAG.NO_AO;
    for (let i = 0; i < c.length; i += 5) {
      const ax = c[i]!, ay = c[i + 1]!, bx = c[i + 2]!, by = c[i + 3]!, z0 = c[i + 4]!, dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy); if (l < 1e-6) continue;
      W.normal(dy / l, -dx / l, 0);
      const a0 = W.v(ax * u, ay * u, z0, 0), b0 = W.v(bx * u, by * u, z0, 0), b1 = W.v(bx * u, by * u, top, 0), a1 = W.v(ax * u, ay * u, top, 0);
      ch.walls.push(a0, b0, b1, a0, b1, a1);
    }
    W.b[3] = flags; ctx.cuts = null;
  }
  extend(ch:Chunk, x0:number, y0:number, x1:number, y1:number, z:number) {
    if (x0 < ch.x0) ch.x0 = x0; if (x0 > ch.x1) ch.x1 = x0; if (x1 < ch.x0) ch.x0 = x1; if (x1 > ch.x1) ch.x1 = x1;
    if (y0 < ch.y0) ch.y0 = y0; if (y0 > ch.y1) ch.y1 = y0; if (y1 < ch.y0) ch.y0 = y1; if (y1 > ch.y1) ch.y1 = y1;
    if (z > ch.zmax) ch.zmax = z; if (z > this.zmax) this.zmax = z;
  }
  // a horizontal polygon (outer + holes) at z, facing up; into list
  cap(list:number[], outer:Ring, holes:Ring[], z:number, kind:number, colourPick:number, axisAngle:number) { const tris = triangulate(outer, holes); if (tris.length) this.capWith(list, outer, holes, tris, z, kind, colourPick, axisAngle) }
  // the same with a triangulation given (the set-back roof reuses the plain roof's: same vertices, moved a few cm)
  capWith(list:number[], outer:Ring, holes:Ring[], tris:number[], z:number, kind:number, colourPick:number, axisAngle:number) {
    const W = this.W, u = this.unit, data = holes.length ? outer.concat(...holes) : outer, base = W.n;
    W.kind = kind; W.normal(0, 0, 1); W.w = [0, 0, 0, 0]; const m0 = W.m[0]; W.m[0] = colourPick;
    for (let i = 0; i < data.length; i += 2) W.v(data[i]! * u, data[i + 1]! * u, z, axisAngle);
    W.m[0] = m0;
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!;
      const cz = (data[b * 2]! - data[a * 2]!) * (data[c * 2 + 1]! - data[a * 2 + 1]!) - (data[b * 2 + 1]! - data[a * 2 + 1]!) * (data[c * 2]! - data[a * 2]!);
      if (cz > 0) list.push(base + a, base + b, base + c); else list.push(base + a, base + c, base + b);
    }
  }
  // a flat band between two rings with matching vertices (the parapet's top), facing up
  strip(list:number[], a:Ring, b:Ring, z:number, kind:number, skip?:boolean[]) {
    const W = this.W, u = this.unit, n = a.length / 2; if (b.length !== a.length) return;
    W.kind = kind; W.normal(0, 0, 1); W.w = [0, 0, 0, 0]; const base = W.n;
    for (let i = 0; i < n; i++) { W.v(a[i * 2]! * u, a[i * 2 + 1]! * u, z, 0); W.v(b[i * 2]! * u, b[i * 2 + 1]! * u, z, 0) }
    for (let i = 0; i < n; i++) {
      if (skip && skip[i]) continue;
      const j = (i + 1) % n, o0 = base + i * 2, o1 = base + j * 2, i0 = o0 + 1, i1 = o1 + 1;
      const cz = (a[j * 2]! - a[i * 2]!) * (b[j * 2 + 1]! - a[i * 2 + 1]!) - (a[j * 2 + 1]! - a[i * 2 + 1]!) * (b[j * 2]! - a[i * 2]!);
      if (cz > 0) list.push(o0, o1, i1, o0, i1, i0); else list.push(o0, i1, o1, o0, i0, i1);
    }
  }
  // which roof colour slot a building gets, in the pack's order of preference for its type
  roofSlotOf(ctx:BuildCtx):number {
    const P = this.P, T = ctx.T, m = P.materials[ctx.mat]!;
    for (const step of P.roofPriorityByType[T.key] || P.roofPriority) {
      if (step === 'waterproof-subset') { if (ctx.H <= P.waterproof.maxH && unit(ctx.seed, 5) < P.waterproof.p) return P.waterSlot }
      else if (step === 'type-roof-variants') { if (T.roofVariants) return T.roofVarBase + pick(T.roofVariantW || [.25, .25, .25, .25], unit(ctx.seed, P.roofSalt)) }
      else if (step === 'family-roof') { if (m.roof) { const F = P.famIndex[m.family]!; return F.base + pick(F.weights, unit(ctx.seed, P.roofSalt)) } }
      else if (step === 'legacy-flat') return T.legacyRoofSlot;
    }
    return T.legacyRoofSlot;
  }
  // flat roof: plain at H for the far LOD; set back behind the parapet (inner faces, top) for the near one
  flatRoof(ctx:BuildCtx, outer:Ring, holes:Ring[], H:number, withParapet:boolean) {
    const P = this.P, T = ctx.T, ch = ctx.chunk, pick = ctx.roofSlot;
    const obb = outer.length <= 400 ? orientedBox(outer) : null, ang = obb ? obb.ang : 0;
    const bbx = ringBbox(outer); this.extend(ch, bbx[0] * this.unit, bbx[1] * this.unit, bbx[2] * this.unit, bbx[3] * this.unit, H);
    const tris = triangulate(outer, holes); if (!tris.length) { ctx.roofZ = H; return }
    this.capWith(ch.lo, outer, holes, tris, H, KIND.ROOF, pick, ang);
    const p = T.parapetM, d = P.parapetT / this.mPerUnit, inset = withParapet && !this.opts.phone && p > 0 ? insetRing(outer, d) : null;
    if (!inset) { this.capWith(ch.hi, outer, holes, tris, H, KIND.ROOF, pick, ang); ctx.roofZ = H; return }
    const n = outer.length / 2, E = this.E, cut:boolean[] = new Array(n);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; cut[i] = this.cutEdge(outer[i * 2]!, outer[i * 2 + 1]!, outer[j * 2]!, outer[j * 2 + 1]!) }
    for (let i = 0; i < n; i++) if (cut[i] || cut[(i + n - 1) % n]) {   // a vertex on the cut: back onto the tile edge, so both tiles' roofs meet there
      const x = outer[i * 2]!, y = outer[i * 2 + 1]!; if (x <= 0 || x >= E) inset[i * 2] = x; if (y <= 0 || y >= E) inset[i * 2 + 1] = y;
    }
    const innerHoles = holes.map(h => insetRing(h, d, -1) || h);
    this.capWith(ch.hi, inset, innerHoles, tris, H - p, KIND.ROOF, pick, ang);
    ctx.roofZ = H - p; ctx.roofRing = inset; ctx.roofHoles = innerHoles;
    // the parapet's inner faces (looking onto the roof), and its top
    const W = this.W, u = this.unit; W.kind = KIND.PARAPET; W.w = [0, 0, 0, 0];
    const flags = W.b[3]; W.b[3] = flags | FLAG.NO_AO;
    const faces = (ring:Ring, skip?:boolean[]) => { const n = ring.length / 2; for (let i = 0; i < n; i++) { if (skip && skip[i]) continue; const j = (i + 1) % n, ax = ring[i * 2]!, ay = ring[i * 2 + 1]!, bx = ring[j * 2]!, by = ring[j * 2 + 1]!, dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy); if (l < 1e-6) continue;
      W.normal(-dy / l, dx / l, 0);
      const a0 = W.v(ax * u, ay * u, H - p, 0), b0 = W.v(bx * u, by * u, H - p, 0), b1 = W.v(bx * u, by * u, H, 0), a1 = W.v(ax * u, ay * u, H, 0);
      ch.hi.push(a0, b1, b0, a0, a1, b1) } };
    faces(inset, cut); for (const h of innerHoles) faces(h);
    this.strip(ch.hi, outer, inset, H, KIND.PARAPET, cut); holes.forEach((h, i) => { if (innerHoles[i] !== h) this.strip(ch.hi, h, innerHoles[i]!, H, KIND.PARAPET) });
    W.b[3] = flags;
  }
  // gabled roof on small near-rectangular houses (the pack's share of them)
  gable(ctx:BuildCtx):boolean {
    const T = ctx.T, g = T.pitched; if (!g || ctx.clipped || ctx.merged || ctx.holes.length) return false;
    const [a0, a1] = g.areaM2 || [45, 180]; if (ctx.H > num(g.maxHeightM, 9) || ctx.A < a0 || ctx.A > a1) return false;
    if (unit(ctx.seed, 2) >= num(g.probability, .2)) return false;
    const r = simplifyRing(ctx.outer, .35 / this.mPerUnit); if (r.length !== 8) return false;
    const obb = orientedBox(r); if (!obb || obb.area * this.mPerUnit * this.mPerUnit > ctx.A * 1.15) return false;
    const len = (i:number) => Math.hypot(r[((i + 1) % 4) * 2]! - r[i * 2]!, r[((i + 1) % 4) * 2 + 1]! - r[i * 2 + 1]!);
    const longFirst = len(0) + len(2) >= len(1) + len(3), L = longFirst ? [0, 2] : [1, 3], Sh = longFirst ? [1, 3] : [0, 2];
    const H = ctx.H, rise = Math.min(num(g.riseMaxM, 2.2), H * num(g.riseHeightRatio, .2)), eave = H - rise, u = this.unit, W = this.W, ch = ctx.chunk;
    const pt = (i:number):[number, number] => [r[(i % 4) * 2]!, r[(i % 4) * 2 + 1]!];
    const mid = (i:number):[number, number] => { const a = pt(i), b = pt(i + 1); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    const R0 = mid(Sh[0]!), R1 = mid(Sh[1]!);   // ridge ends over the short walls
    this.wallsOf(ctx, r, ctx.minH, eave, true);
    // gables: triangles over the short walls (solid wall colour)
    W.kind = KIND.WALL; W.w = [0, 0, 0, 0]; const flags = W.b[3]; W.b[3] = flags | FLAG.NO_AO;
    for (const si of Sh) {
      const a = pt(si), b = pt(si + 1), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ridge = mid(si);
      W.normal(dy / l, -dx / l, 0);
      const i0 = W.v(a[0] * u, a[1] * u, eave, 0), i1 = W.v(b[0] * u, b[1] * u, eave, 0), i2 = W.v(ridge[0] * u, ridge[1] * u, H, 0);
      ch.walls.push(i0, i1, i2);
    }
    W.b[3] = flags;
    // the two roof planes: from each long eave up to the ridge
    W.kind = KIND.PITCHED; W.m[0] = pick(g.weights || [.55, .3, .15], unit(ctx.seed, 6));
    for (const li of L) {
      const a = pt(li), b = pt(li + 1);
      // ridge end nearest a, nearest b
      const d = (p:[number, number], q:[number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      const ra = d(a, R0) < d(a, R1) ? R0 : R1, rb = ra === R0 ? R1 : R0;
      const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1, inx = -ey / el, iny = ex / el;   // toward the ridge (inward)
      // normal: outward horizontal component scaled by rise, up by the horizontal run (in metres)
      const run = Math.abs((ra[0] - a[0]) * inx + (ra[1] - a[1]) * iny) * this.mPerUnit || 1;
      let nx = -inx * rise, ny = -iny * rise, nz = run; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      W.normal(nx, ny, nz);
      const i0 = W.v(a[0] * u, a[1] * u, eave, 0), i1 = W.v(b[0] * u, b[1] * u, eave, 0), i2 = W.v(rb[0] * u, rb[1] * u, H, 0), i3 = W.v(ra[0] * u, ra[1] * u, H, 0);
      ch.walls.push(i0, i1, i2, i0, i2, i3);
    }
    W.m[0] = ctx.mat;
    const bbx = ringBbox(r); this.extend(ch, bbx[0] * u, bbx[1] * u, bbx[2] * u, bbx[3] * u, H);
    return true;
  }
  // set-back office top: the lower body, a ledge, and the inset upper body with its own roof
  setback(ctx:BuildCtx):boolean {
    const T = ctx.T, s = T.setback; if (!s || ctx.clipped || ctx.holes.length) return false;
    if (ctx.H < num(s.minHeightM, 80) || ctx.A < num(s.minAreaM2, 600) || unit(ctx.seed, 4) >= num(s.probability, .35)) return false;
    const inset = insetRing(ctx.outer, num(s.maxInsetM, 1.5) / this.mPerUnit) || insetRing(ctx.outer, 1 / this.mPerUnit); if (!inset) return false;
    const H = ctx.H, zs = H * (1 - num(s.topHeightRatio, .15)), ch = ctx.chunk;
    this.wallsOf(ctx, ctx.outer, ctx.minH, zs, true);
    this.cap(ch.lo, ctx.outer, [inset], zs, KIND.ROOF, ctx.roofSlot, 0); this.cap(ch.hi, ctx.outer, [inset], zs, KIND.ROOF, ctx.roofSlot, 0);   // the ledge, both LODs
    this.wallsOf(ctx, inset, zs, H, true);
    this.flatRoof(ctx, inset, [], H, true);
    this.plant({ ...ctx, outer: inset, A: ringArea(inset) * this.mPerUnit * this.mPerUnit });
    return true;
  }
  // the office's crown (QA1): the top zone (topH) set back once (inset cap) or twice (stepped cap); the shader tones it
  crown(ctx:BuildCtx, insets:Ring[], topH:number) {
    const H = ctx.H, ch = ctx.chunk, zs = H - topH, steps = insets.length, rs = ctx.roofSlot;
    let ring = ctx.outer, z = ctx.minH;
    for (let i = 0; i < steps; i++) {
      const zt = zs + topH * i / steps, inner = insets[i]!;
      this.wallsOf(ctx, ring, z, zt, true);
      this.cap(ch.lo, ring, [inner], zt, KIND.ROOF, rs, 0); this.cap(ch.hi, ring, [inner], zt, KIND.ROOF, rs, 0);   // the ledge
      ring = inner; z = zt;
    }
    this.wallsOf(ctx, ring, z, H, true);
    this.flatRoof(ctx, ring, [], H, true);
    this.plant({ ...ctx, outer: ring, A: ringArea(ring) * this.mPerUnit * this.mPerUnit });
  }
  // a box standing on the roof: 4 sides + top (kind, colour pick); base z0, top z1
  box(ch:Chunk, cx:number, cy:number, ux:number, uy:number, hx:number, hy:number, z0:number, z1:number, kind:number, colourPick:number, list:number[]) {
    const W = this.W, u = this.unit, vx = -uy, vy = ux; W.kind = kind; W.w = [0, 0, 0, 0]; const m0 = W.m[0]; W.m[0] = colourPick; const flags = W.b[3]; W.b[3] = flags | FLAG.NO_AO;
    const c = (i:number, j:number):[number, number] => [(cx + ux * hx * i + vx * hy * j) * u, (cy + uy * hx * i + vy * hy * j) * u];
    const side = (p:[number, number], q:[number, number], nx:number, ny:number) => { W.normal(nx, ny, 0); const a0 = W.v(p[0], p[1], z0, z0), b0 = W.v(q[0], q[1], z0, z0), b1 = W.v(q[0], q[1], z1, z0), a1 = W.v(p[0], p[1], z1, z0); list.push(a0, b0, b1, a0, b1, a1) };
    const p00 = c(-1, -1), p10 = c(1, -1), p11 = c(1, 1), p01 = c(-1, 1);
    side(p00, p10, -vx, -vy); side(p10, p11, ux, uy); side(p11, p01, vx, vy); side(p01, p00, -ux, -uy);
    W.normal(0, 0, 1); const t0 = W.v(p00[0], p00[1], z1, z0), t1 = W.v(p10[0], p10[1], z1, z0), t2 = W.v(p11[0], p11[1], z1, z0), t3 = W.v(p01[0], p01[1], z1, z0);
    const cz = (p10[0] - p00[0]) * (p11[1] - p00[1]) - (p10[1] - p00[1]) * (p11[0] - p00[0]);
    if (cz > 0) list.push(t0, t1, t2, t0, t2, t3); else list.push(t0, t2, t1, t0, t3, t2);
    W.m[0] = m0; W.b[3] = flags;
    for (const p of [p00, p10, p11, p01]) this.extend(ch, p[0], p[1], p[0], p[1], z1);
  }
  // roof plant: a penthouse and a few condensers where the roof is deep enough; small boxes scattered over merged low-rise
  plant(ctx:BuildCtx) {
    const P = this.P, eq = P.equip, ch = ctx.chunk, z = ctx.roofZ ?? ctx.H, mpu = this.mPerUnit, u = this.unit;
    const outer = ctx.roofRing || ctx.outer, holes = ctx.roofHoles || ctx.holes;
    if (ctx.merged) {
      if (ctx.A < 400) return;
      const bb = ringBbox(outer), step = 16 / mpu, want = Math.min(10, Math.floor(ctx.A / 350)); let placed = 0;
      const sx = unit(ctx.seed, 7) * step, sy = unit(ctx.seed, 8) * step, cands:[number, number][] = [];
      for (let x = bb[0] + sx; x < bb[2]; x += step) for (let y = bb[1] + sy; y < bb[3]; y += step) if (pointInPolygon(x, y, outer, holes) && edgeDistance(x, y, [outer, ...holes]) * mpu > 1.6) cands.push([x, y]);
      for (let i = 0; i < cands.length && placed < want; i++) { if (unit(ctx.seed, 20 + i) > .6) continue; const [x, y] = cands[i]!, a = unit(ctx.seed, 40 + i) * Math.PI; this.box(ch, x, y, Math.cos(a), Math.sin(a), .8 / mpu, .5 / mpu, z, z + .9, KIND.EQUIP, 0, ch.hi); placed++ }
      return;
    }
    if (ctx.H < eq.minH || ctx.A < eq.minA) return;
    const deep = deepestPoint(outer, holes, 8); if (!(deep.d > 0)) return;
    const clear = deep.d * mpu - P.edgeClear; if (clear < 1.2) return;
    const obb = outer.length <= 400 ? orientedBox(outer) : null, ux = obb ? obb.ux : 1, uy = obb ? obb.uy : 0;
    // penthouse: 4–7 % of the roof, 1.3:1, shrunk to the room there is
    const pa = ctx.A * (eq.penthouseArea[0] + (eq.penthouseArea[1] - eq.penthouseArea[0]) * unit(ctx.seed, 9));
    let hx = Math.sqrt(pa * 1.3) / 2, hy = hx / 1.3; const halfDiag = Math.hypot(hx, hy);
    if (halfDiag > clear) { const k = clear / halfDiag; hx *= k; hy *= k }
    if (hx < 1) return;
    this.box(ch, deep.x, deep.y, ux, uy, hx / mpu, hy / mpu, z, z + eq.penthouseH, KIND.EQUIP, 0, ch.hi);
    if (this.opts.phone) return;
    // condensers beside it
    const n = eq.hvacCount[0] + Math.floor(unit(ctx.seed, 10) * (eq.hvacCount[1] - eq.hvacCount[0] + 1)), [sx, sy, sz] = eq.hvacSize;
    for (let i = 0, placed = 0; i < 6 && placed < n; i++) {
      const ang = unit(ctx.seed, 11 + i) * Math.PI * 2, dist = (hx + sx) * .5 + 1.2 + unit(ctx.seed, 30 + i) * 2.5;
      const px = deep.x + (Math.cos(ang) * ux - Math.sin(ang) * uy) * dist / mpu, py = deep.y + (Math.cos(ang) * uy + Math.sin(ang) * ux) * dist / mpu;
      if (!pointInPolygon(px, py, outer, holes) || edgeDistance(px, py, [outer, ...holes]) * mpu < P.edgeClear + Math.hypot(sx, sy) / 2) continue;
      // keep clear of the penthouse box
      const lx = ((px - deep.x) * ux + (py - deep.y) * uy) * mpu, ly = (-(px - deep.x) * uy + (py - deep.y) * ux) * mpu;
      if (Math.abs(lx) < hx + sx / 2 + .3 && Math.abs(ly) < hy + sy / 2 + .3) continue;
      this.box(ch, px, py, ux, uy, sx / 2 / mpu, sy / 2 / mpu, z, z + sz, KIND.EQUIP, 0, ch.hi); placed++;
    }
  }
  // shop awning: a plain strip over part of the longest street-side wall
  awning(ctx:BuildCtx) {
    const T = ctx.T, a = T.awning; if (!a || this.opts.phone || !ctx.storefront || ctx.H < num(a.baseM, 3.1) + 1) return;
    if (!(a.landuse || []).includes(ctx.landuse) || unit(ctx.seed, 12) >= num(a.probability, .35)) return;
    const r = ctx.outer, n = r.length / 2, E = this.E, mpu = this.mPerUnit; let best = -1, bl = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, ax = r[i * 2]!, ay = r[i * 2 + 1]!, bx = r[j * 2]!, by = r[j * 2 + 1]!; if (ax <= 0 || ax >= E || ay <= 0 || ay >= E || bx <= 0 || bx >= E || by <= 0 || by >= E) continue; const l = Math.hypot(bx - ax, by - ay); if (l > bl) { bl = l; best = i } }
    if (best < 0 || bl * mpu < 4) return;
    const j = (best + 1) % n, ax = r[best * 2]!, ay = r[best * 2 + 1]!, bx = r[j * 2]!, by = r[j * 2 + 1]!, dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy), ex = dx / l, ey = dy / l, nx = ey, ny = -ex;
    const [f0, f1] = a.frontageRatio || [.5, .7], frac = f0 + (f1 - f0) * unit(ctx.seed, 13), span = l * frac, s0 = (l - span) / 2, depth = num(a.depthM, .8) / mpu, z0 = num(a.baseM, 3.1), z1 = z0 + num(a.heightM, .25);
    const cx = ax + ex * (s0 + span / 2) + nx * depth / 2, cy = ay + ey * (s0 + span / 2) + ny * depth / 2;
    this.box(ctx.chunk, cx, cy, ex, ey, span / 2, depth / 2, z0, z1, KIND.AWNING, pick(a.weights || [.45, .35, .2], unit(ctx.seed, 14)), ctx.chunk.hi);
  }
  // 간판 상자 하나: (cx, cy) 가운데, (ux, uy) 방향으로 길이 2hx, 그 가로로 두께 2hy(타일 단위), z0~z1 m. 긴 두 면(±v)에 글자 무늬 —
  // axis 1 가로 글줄, 2 세로 글줄(돌출 간판). 면마다 u = 그 면의 길이 방향 m(0..len), wall = [axis | 0, len lo/hi (5 cm), 높이 (5 cm)], misc.y = z0 (20 cm)
  signBox(ch:Chunk, cx:number, cy:number, ux:number, uy:number, hx:number, hy:number, z0:number, z1:number, slot:number, axis:number, list:number[]) {
    const W = this.W, u = this.unit, mpu = this.mPerUnit, vx = -uy, vy = ux, m0 = W.m[0], m1 = W.m[1], flags = W.b[3];
    W.kind = KIND.SIGN; W.m[0] = slot; W.m[1] = Math.min(255, Math.round(z0 / .2)); W.b[3] = flags | FLAG.NO_AO;
    const c = (i:number, j:number):[number, number] => [(cx + ux * hx * i + vx * hy * j) * u, (cy + uy * hx * i + vy * hy * j) * u], hq = Math.min(255, Math.round((z1 - z0) / .05));
    const side = (p:[number, number], q:[number, number], nx:number, ny:number, len:number, text:boolean) => {
      const lq = Math.min(65535, Math.round(len / .05)); W.w = [text ? axis : 0, lq & 255, lq >> 8, hq]; W.normal(nx, ny, 0);
      const a0 = W.v(p[0], p[1], z0, 0), b0 = W.v(q[0], q[1], z0, len), b1 = W.v(q[0], q[1], z1, len), a1 = W.v(p[0], p[1], z1, 0); list.push(a0, b0, b1, a0, b1, a1);
    };
    const L = 2 * hx * mpu, D = 2 * hy * mpu, p00 = c(-1, -1), p10 = c(1, -1), p11 = c(1, 1), p01 = c(-1, 1);
    // 벽에 붙은 면은 안 보여 빼요: 가로 간판(axis 1)은 +v 면, 돌출 간판(2)은 −u 끝면(at() 의 밖 방향 = −v · +u)
    side(p00, p10, -vx, -vy, L, true); side(p10, p11, ux, uy, D, false); if (axis !== 1) side(p11, p01, vx, vy, L, true); if (axis !== 2) side(p01, p00, -ux, -uy, D, false);
    W.w = [0, 0, 0, hq]; const cz = (p10[0] - p00[0]) * (p11[1] - p00[1]) - (p10[1] - p00[1]) * (p11[0] - p00[0]);
    for (const [z, nz] of [[z1, 1], [z0, -1]] as const) {   // 위 · 아래(눈높이에선 간판 밑면이 보인다)
      W.normal(0, 0, nz); const t0 = W.v(p00[0], p00[1], z, 0), t1 = W.v(p10[0], p10[1], z, 0), t2 = W.v(p11[0], p11[1], z, 0), t3 = W.v(p01[0], p01[1], z, 0);
      if ((cz > 0) === (nz > 0)) list.push(t0, t1, t2, t0, t2, t3); else list.push(t0, t2, t1, t0, t3, t2);
    }
    W.m[0] = m0; W.m[1] = m1; W.b[3] = flags; W.w = [0, 0, 0, 0];
    for (const p of [p00, p10, p11, p01]) this.extend(ch, p[0], p[1], p[0], p[1], z1);
  }
  // 간판(2026-10-06 덕배): 상가 건물의 긴 바깥 벽(타일 안, 최대 maxWalls 개)에 1층 위 가로 간판(가게 칸마다 색), 가장 긴 벽의 2층부터 창 간판,
  // 벽 끝에 세로 돌출 간판. 층 높이는 셰이더와 같은 식(1층 groundM, 나머지 층은 높이에 맞춰 나눔)
  signs(ctx:BuildCtx) {
    const S = this.P.signs, T = ctx.T; if (!S || ctx.H < num(S.minHeightM, 4) || ctx.H > num(S.maxHeightM, 32)) return;
    if (!ctx.storefront && !(S.types || []).includes(T.key)) return;
    if (unit(ctx.seed, 20) >= num(S.probability, .8)) return;
    const r = ctx.outer, n = r.length / 2, E = this.E, mpu = this.mPerUnit, edges:[number, number][] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = r[i * 2]!, ay = r[i * 2 + 1]!, bx = r[j * 2]!, by = r[j * 2 + 1]!;
      if (ax <= 0 || ax >= E || ay <= 0 || ay >= E || bx <= 0 || bx >= E || by <= 0 || by >= E) continue;
      const l = Math.hypot(bx - ax, by - ay); if (l * mpu >= num(S.minWallM, 4)) edges.push([i, l]);
    }
    if (!edges.length) return; edges.sort((a, b) => b[1] - a[1]);
    const F = S.fascia || {}, U = S.upper || {}, B = S.blade || {}, wts = S.weights || [1], H = ctx.H;
    const gEff = Math.min(T.groundM, H), up = H - gEff, nUp = up < T.floorM * .6 ? 0 : Math.max(1, Math.round(up / T.floorM)), fM = nUp ? up / nUp : T.floorM;
    let k = 0; const rnd = () => unit(ctx.seed, 21 + k++), col = () => pick(wts, rnd()), list = ctx.chunk.hi, ch = ctx.chunk;
    for (const [w, [i, l]] of edges.slice(0, num(S.maxWalls, 2)).entries()) {
      const j = (i + 1) % n, ax = r[i * 2]!, ay = r[i * 2 + 1]!, ex = (r[j * 2]! - ax) / l, ey = (r[j * 2 + 1]! - ay) / l, nx = ey, ny = -ex, lm = l * mpu;
      const at = (a:number, out:number):[number, number] => [ax + ex * a + nx * out, ay + ey * a + ny * out];   // 벽을 따라 a, 밖으로 out(타일 단위)
      // 1층 위 가로 간판: 가게 칸마다 하나
      let z1 = nUp ? gEff - num(F.belowM, .1) + num(F.heightM, .9) : H - .25, z0 = z1 - num(F.heightM, .9);
      if (z0 > 2.2) {
        const shops = Math.max(1, Math.min(num(F.maxShops, 3), Math.round(lm / num(F.shopM, 7)))), gap = num(F.gapM, .35) / mpu, seg = (l - gap * (shops + 1)) / shops, d = num(F.depthM, .22) / mpu;
        if (seg * mpu > 1.5) for (let s = 0; s < shops; s++) { const [cx, cy] = at(gap + seg / 2 + s * (seg + gap), d / 2); this.signBox(ch, cx, cy, ex, ey, seg / 2, d / 2, z0, z1, col(), 1, list) }
      }
      // 2층부터 창 간판(층의 아래쪽, 벽 일부)
      for (let f = 1; f <= (this.opts.phone || w ? 0 : Math.min(nUp, num(U.maxFloors, 3))); f++) {   // 가장 긴 벽에만, 휴대폰은 빼요(정점)
        if (rnd() >= num(U.probability, .55)) continue;
        z0 = gEff + (f - 1) * fM + num(U.offsetM, .15); z1 = z0 + num(U.heightM, .8); if (z1 > H - .3) break;
        const [f0, f1] = U.frontage || [.45, .85], span = l * (f0 + (f1 - f0) * rnd()), a = (l - span) * rnd() + span / 2, d = num(U.depthM, .1) / mpu, [cx, cy] = at(a, d / 2);
        this.signBox(ch, cx, cy, ex, ey, span / 2, d / 2, z0, z1, col(), 1, list);
      }
      // 세로 돌출 간판: 벽 한쪽 끝에서 길 쪽으로
      if (H >= num(B.minHeightM, 8) && rnd() < num(B.probability, .6)) {
        const [h0, h1] = B.heightM || [3, 9]; z0 = gEff + num(B.baseAboveM, .6); z1 = Math.min(H - .4, z0 + h0 + (h1 - h0) * rnd());
        if (z1 - z0 >= 2) { const a = rnd() < .5 ? num(B.insetM, .5) / mpu : l - num(B.insetM, .5) / mpu, out = num(B.outM, 1) / mpu, [cx, cy] = at(a, out / 2 + .05 / mpu); this.signBox(ch, cx, cy, nx, ny, out / 2, num(B.widthM, .3) / 2 / mpu, z0, z1, col(), 2, list) }
      }
    }
  }
  // pack the result: one vertex buffer, one index buffer in chunk order [lo][walls][hi]; the instances (조선: city_hanok.mjs
  // skirtInst · roofInst · boxInst) one buffer a kind in chunk order, each chunk's far ones first: c.k[kind] = [k0, kF, k1],
  // [k0, kF) drawn from afar too, [kF, k1) near only
  result() {
    const chunks:{ i0:number; iLo:number; iW:number; i1:number; k:Record<string, [number, number, number]>; x0:number; y0:number; x1:number; y1:number; zmax:number }[] = [], idx:number[] = [], inst:Record<string, Uint8Array> = {}, at:Record<string, number> = {}; let off = 0;
    for (const [kind, stride] of Object.entries(INST_STRIDES)) {
      let n = 0; for (const c of this.chunks) n += c.instFar[kind]!.length + c.inst[kind]!.length;
      inst[kind] = new Uint8Array(n * stride); at[kind] = 0;
    }
    for (const c of this.chunks) {
      if (!c.n) continue;
      const i0 = off; for (const v of c.lo) idx.push(v); const iLo = idx.length; for (const v of c.walls) idx.push(v); const iW = idx.length; for (const v of c.hi) idx.push(v); off = idx.length;
      const k:Record<string, [number, number, number]> = {};
      for (const [kind, stride] of Object.entries(INST_STRIDES)) {
        const buf = inst[kind]!, k0 = at[kind]!; let q = k0;
        for (const r of c.instFar[kind]!) buf.set(new Uint8Array(r.buffer, r.byteOffset, stride), (q++) * stride);
        const kF = q; for (const r of c.inst[kind]!) buf.set(new Uint8Array(r.buffer, r.byteOffset, stride), (q++) * stride);
        at[kind] = q; k[kind] = [k0, kF, q];
      }
      chunks.push({ i0, iLo, iW, i1: off, k, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, zmax: c.zmax });
    }
    return { verts: this.W.bytes().slice(), idx: new Uint32Array(idx), inst, chunks, models: packModels(this.models), count: this.count, zmax: this.zmax, ox: this.ox, oy: this.oy, mpu: this.mpu, wox: this.wox, woy: this.woy, z: this.src.z, x: this.src.x, y: this.src.y };
  }
}

