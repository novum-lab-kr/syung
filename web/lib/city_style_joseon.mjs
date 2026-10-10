// 조선 모드 — the Seoul pack (city_style_seoul.mjs) with the ground turned to packed earth and every building Joseon.
// Data only, like the Seoul pack: city_style.mjs paints the ground from `ground` / `roads`, and city_mesh.mjs builds
// a footprint with web/lib/city_hanok.mjs whenever the pack carries `hanok`. Everything not listed here (lighting,
// props, viaduct, x-ray …) is the Seoul pack's.
// 2026-10-09 (with Codex's review of the first captures): earth less yellow, light main roads / mid yards / darker lanes;
// thinner ridges, gentler corners; fewer and dimmer lit 창호; 초가 villages, plans, 돌담; tall buildings kept tall.
import SEOUL from './city_style_seoul.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(a?.[k]) ? merge(a[k], v) : v; return o };

export const JOSEON_CITY_STYLE = merge(SEOUL, {
  id: 'joseon',
  label: '한양 / 조선',
  // 흙바닥: 다진 흙 마당, 밝은 마른 흙 큰길, 조금 어두운 골목. 노란 필터가 아니라 회갈색 흙
  ground: {
    // 흙 질감 (city_style.mjs applyGroundTexture): a size-px tile at pixelRatio — blotches ±blotch, grain ±grain, crumbs, pebbles
    texture: { size: 256, pixelRatio: 2, blotch: 0.06, grain: 0.03, crumbs: 1400, pebbles: 26 },
    light: {
      base: '#C8BDA4', residential: '#C5B69A', commercial: '#CBBEA3', retail: '#CDBFA2', industrial: '#C1B59C',
      civic: '#D8CEB8', hospital: '#CFC4AC', park: '#8E9D73', grass: '#A2AE83', forest: '#637E59',
      water: '#73969B', sidewalk: '#D5C9AF', ballast: '#ADA38C',
    },
    dark: {
      base: '#32352F', residential: '#33352E', commercial: '#35372F', retail: '#373830', industrial: '#30332D',
      civic: '#3A3B33', hospital: '#35372F', park: '#2A3A26', grass: '#2F3E28', forest: '#21311F',
      water: '#1A3540', sidewalk: '#3C3E35', ballast: '#3A3B33',
    },
  },
  roads: {
    classes: {
      motorway: { colors: { light: '#DFD2B6', dark: '#41443A' } },
      primary: { colors: { light: '#DFD2B6', dark: '#41443A' } },
      secondary: { colors: { light: '#D8C8AB', dark: '#3E4137' } },
      tertiary: { colors: { light: '#D1C2A5', dark: '#3B3E35' } },
      minor: { colors: { light: '#CBB999', dark: '#383B33' } },
      service: { colors: { light: '#C7B597', dark: '#363931' } },
    },
    lane: { opacity: { light: 0, dark: 0 } },                                     // 흙길에는 차선이 없다
    centerLine: { opacity: { light: 0, dark: 0 } },
  },
  // 거리: 가로등 대신 나무 기둥 위 화로에 타는 횃불(2026-10-09 덕배: 전등 → 횃불), 사람들은 흰 옷 · 쪽빛 · 흙빛 한복
  // (자동차와 횡단보도는 city_life 가 조선 모드에서 그리지 않는다)
  props: {
    lamps: { heightM: 2.4, armM: 0, poleDiameterM: 0.14, pole: { light: '#5E4532', dark: '#3A2A20' }, light: '#FFB15E', poolRadiusM: 2.4, poolOpacity: 0.1, simcityPoolMaxOpacity: 0.13,
      torch: { basketM: 0.2, basketWidthM: 0.34, flameM: 0.55, flameWidthM: 0.3, flame: ['#F06A1E', '#FFD25A'] } },
    people: { clothes: ['#EDE9DE', '#E2DACA', '#55688A', '#B59A6E'], hair: ['#141214', '#1A1614', '#141214', '#201A16'] },
  },
  lighting: { shadow: { color: '#5A4630' } },
  // 공중 수로: 심시티 고가와 같은 치수에 물을 채운다(city_viaduct.mjs — aqueduct 가 있으면 윗면은 물결, 침목 · 레일 없음,
  // 난간은 돌에 윗면만 노선 색). 화강암 수로를 팔각 통나무 기둥(밧줄 묶음)이 받치고, 승강장은 나무 마루에 기와 지붕
  viaduct: {
    aqueduct: { water: { light: '#5E93A0', dark: '#1D3C48' } },
    colors: {
      light: { concrete: '#B7AE9C', under: '#8E8574', pier: '#7E5D41', platform: '#9C7A57', roof: '#4E585C', roofUnder: '#6B4F3A', post: '#5E4532', stair: '#B1A893', stairWall: '#A39A87', walk: '#9C7A57', walkWall: '#A39A87' },
      dark: { concrete: '#5C574D', under: '#3E3A33', pier: '#4A3727', platform: '#4E3D2C', roof: '#2E3537', roofUnder: '#3F2F23', post: '#3A2A20', stair: '#5A554B', stairWall: '#4F4A42', walk: '#4E3D2C', walkWall: '#4F4A42' },
    },
  },
  // 거북선: 조선 모드의 열차(web/lib/city_turtle_ship.mjs)
  train: { turtleShip: { wood: '#5A3E2B', woodDark: '#3B2A1E', shell: '#4E5B4A', shellEdge: '#2F3A31', spike: '#C9C3B0', red: '#B23A2A', gold: '#D9A43A', white: '#F2EBDC', ink: '#17120E', oar: '#8A6A4A', lamp: '#FFC874' } },
  modes: { simcity: { shadowOpacity: { light: 0.2, dark: 0.08 } } },
  // web/lib/city_hanok.mjs: every footprint fitted with an oriented rectangle of its own area, then a type (초가 · 기와 ·
  // 중층 전각 · 한옥 고층 · 목탑), a plan and a wall. Metres
  hanok: {
    fitK: 0.94,                       // the rectangle a little inside the footprint's own area, so neighbours' eaves seldom meet
    single: { maxLengthM: 24, maxDepthM: 20 },  // one house (ㅡ · ㄱ · ㄷ · ㅁ as the lot allows); larger lots become compounds (rows of houses)
    houseDepthM: [5.5, 7.5],          // wall to wall across one 채 in a compound
    houseLengthM: 11,                 // the target length of one 채 in a compound
    maxLengthM: 16,
    yardM: 7.5, gapM: 3.5,            // between rows of houses / between houses in a row (wall to wall)
    emptyShare: 0.15,                 // cells of a big compound left as open yards
    maxHouses: 48,
    baseM: 0.55,                      // 기단: the stone band at the foot of the walls (drawn by the shader)
    wallM: [2.5, 3.2],                // 기둥 높이 (ground to eave), small house to big hall
    eaveOutM: 1.15,                   // 처마: past the walls
    riseK: 0.62, riseM: [1.4, 4.4],   // the roof's rise over the eaves: × (half depth + eave), clamped
    hipK: 0.6,                        // 우진각: the ridge is shorter than the eaves by this × the half depth at each end
    cornerLiftM: 0.6, cornerKickM: 0.3,   // 추녀: the eave corners lifted and pushed out
    ridge: { halfWidthM: 0.11, upM: 0.18, downM: 0.08 },   // 용마루 (Codex 2차: 굵기 · 높이 20% 줄임)
    // 지붕 모양 몫 [팔작, 맞배, 우진각]: 좁은 채(반폭 narrowHalfM 이하)는 맞배가 많다. 맞배 지붕은 박공벽 밖으로 gableEndM 나온다
    // 가까이(줌 18~): 기와 처마 끝 두께, 기단이 벽 밖으로 나온 폭, 돌계단 폭, 기둥 폭 · 돌출, 받침목 폭 · 돌출, 추녀마루 폭 (Codex 3차)
    detail: { fasciaM: 0.16, platformOutM: 0.45, stepWidthM: 1.8, postM: 0.22, postOutM: 0.1, bracketM: 0.14, bracketOutM: 0.32, hipRidgeM: 0.14 },
    roofStyles: { narrowHalfM: 2.6, narrow: [0.25, 0.55, 0.2], wide: [0.6, 0.12, 0.28] }, gableEndM: 0.6,
    postM: 0.24, bayM: 2.4,           // 기둥 width and spacing (칸)
    paperShare: 0.55,                 // bays with 창호 (the rest 회벽)
    // plans: shares of ㅡ, ㄱ, ㄷ, ㅁ (a plan the lot cannot hold falls back to a simpler one)
    plans: { giwa: [0.3, 0.35, 0.22, 0.13], thatch: [0.6, 0.4, 0, 0] },
    // 초가: thatched houses by land use (× the district noise), never on big lots or public land
    thatch: {
      byLanduse: { residential: 0.55, unknown: 0.5, industrial: 0.5, commercial: 0.25, retail: 0.3 },
      districtM: 240, maxAreaM2: 420,
      baseM: 0.3, wallM: 2.2, eaveOutM: 0.55, riseK: 0.72, riseM: [1.3, 2.5], hipK: 0.95, edgeM: 0.32,
    },
    // a small lot walled now and then: the house set back behind a front yard; 돌담 round 초가, either round 기와
    lot: { minAreaM2: 95, thatchShare: 0.55, giwaShare: 0.4, stoneShareGiwa: 0.45, wallThickM: 0.55, stoneWallM: 1.35, yardM: 3.5 },
    compound: { minAreaM2: 260, wallM: 1.6, wallThickM: 0.38, insetM: 0.3, gateM: 3.2, stoneShare: 0.25, gateRoof: { widthM: 3.6, depthM: 1.1, heightM: 2.3 } },
    // tall buildings keep their height (the user's references: a 9층 목탑, a hanok high-rise with an eave round every floor)
    tall: {
      towerMinH: 15,                  // 한옥 고층: real height, a 기와 skirt round the floors, a hanok podium, roofs on top
      storeyM: 3.2, skirtStep: [[9, 1], [20, 2], [999, 3]],   // 처마: 9층까지 층마다, 20층까지 2층마다, 그 위 3층마다 (Codex 2026-10-10: 7~10단)
      skirtRiseM: 1.0, skirtEdgeM: 0.12,   // 처마 높이 · 끝 두께
      // 처마 지붕 무리 (city_hanok.mjs skirtGroups, 셰이더도 같은 셈): 가운데 지붕 폭 · 사이 · 내밀기 · 끝 벌림, 모서리 지붕 길이(면 × cornerK, cornerM 범위) · 내밀기
      // rows: 벽 → 처마 끝 경사 마디, upK: 처마 끝이 들리는 높이(내밀기 ×), liftM: 양 끝이 더 들리는 높이
      skirtGroup: { widthM: 9, gapM: 2.2, minM: 4.5, outM: 1.5, flareM: 0.35, cornerK: 0.24, cornerM: [4, 7.5], cornerOutM: 1.9, rows: [0, 0.55, 1], upK: 0.15, liftM: [0.75, 0.4] },   // liftM: 끝 들림 — 모서리 끝, 다른 끝 (Codex 3차: 실루엣에서 읽히게)
       podiumM: 4.2, podiumOutM: 1.6, triRoofAspect: 2.1,
      towerMaxHalfM: [22, 14],        // a broader tall lot (a mall, a hotel) becomes a palace court: the tower this big in the middle, 전각 either side
      pagodaMinH: 100, pagodaMaxAspect: 1.6, pagodaShare: 0.85,   // 목탑: tall and squarish
      pagodaStoreyMinM: 7, pagodaShrink: 0.07, pagodaEaveM: 1.6, spireM: 9,
      hallMinH: 8, hallMinAreaM2: 150, hallShare: 0.5, hallShareResidential: 0.12,   // 중층 전각: two storeys
      hallStoreyM: [3.4, 3.0], hallSetM: 1.4, hallHalfM: [14, 8],
    },
    colors: {
      // (Codex 2026-10-10, 레퍼런스 사진: 나무는 더 붉은 갈색, 회벽은 조금 어둡고 따뜻하게, 기와는 청록기 없는 중성 회색, 고층 유리창은 탁한 청회색)
      light: { giwa: ['#484C4B', '#3F4342', '#535857'], wood: '#7B513A', plaster: '#DED1B6', paper: '#F3EBD3', stone: '#A5A397', dam: '#D8CDB5', soffit: '#302B24', ridge: '#3E4241', glass: '#718887',
        thatch: ['#A88D55', '#9C8350', '#B39A62'], mud: '#C4AA83', field: ['#9C978B', '#857F74'], spire: '#C99B3A' },
      dark: { giwa: ['#424645', '#3A3D3C', '#4B4F4E'], wood: '#5A3824', plaster: '#8E877A', paper: '#9C927A', stone: '#6F6A60', dam: '#80776A', soffit: '#1F1B17', ridge: '#2A2D2C', glass: '#34403F',
        thatch: ['#6E5B39', '#625233', '#5A4D37'], mud: '#6B5C46', field: ['#5B5851', '#4D4A44'], spire: '#7A6024' },
    },
    night: { paper: '#EBC58A', litShare: 0.24, emission: 0.45 },   // 창호지 너머 등잔불: 몇 집, 한쪽 면 한두 칸
  },
});

export default JOSEON_CITY_STYLE;
