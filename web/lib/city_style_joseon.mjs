// 조선 모드 — the Seoul pack (city_style_seoul.mjs) with the ground turned to packed earth and every building a 기와집.
// Data only, like the Seoul pack: city_style.mjs paints the ground from `ground` / `roads`, and city_mesh.mjs builds
// a footprint as hanok (web/lib/city_hanok.mjs) whenever the pack carries `hanok`. Everything not listed here (lighting,
// props, viaduct, x-ray …) is the Seoul pack's.
import SEOUL from './city_style_seoul.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(a?.[k]) ? merge(a[k], v) : v; return o };

export const JOSEON_CITY_STYLE = merge(SEOUL, {
  id: 'joseon',
  label: '한양 / 조선',
  // 흙바닥: 마당과 골목은 다진 흙, 큰길은 조금 더 밝은 마른 흙, 풀밭과 숲은 그대로 푸르게
  ground: {
    light: {
      base: '#D2BC94', residential: '#D0B88E', commercial: '#D6BF95', retail: '#D9C29A', industrial: '#C9B48D',
      civic: '#DCC9A3', hospital: '#D3C09A', park: '#A3B57A', grass: '#B3C185', forest: '#71935A',
      water: '#7FA9B4', sidewalk: '#DCCAA5', ballast: '#B5A182',
    },
    dark: {
      base: '#2E2A22', residential: '#302B22', commercial: '#322D24', retail: '#352F25', industrial: '#2C2821',
      civic: '#363127', hospital: '#322E26', park: '#2A3A26', grass: '#2F3E28', forest: '#21311F',
      water: '#1A3540', sidewalk: '#3A3429', ballast: '#3A342B',
    },
  },
  roads: {
    classes: {
      motorway: { colors: { light: '#E0CDA6', dark: '#433C2F' } },
      primary: { colors: { light: '#E0CDA6', dark: '#433C2F' } },
      secondary: { colors: { light: '#DDC9A1', dark: '#403A2D' } },
      tertiary: { colors: { light: '#D9C49B', dark: '#3D372B' } },
      minor: { colors: { light: '#D6C098', dark: '#3A3429' } },
      service: { colors: { light: '#D4BE96', dark: '#383228' } },
    },
    lane: { opacity: { light: 0, dark: 0 } },                                     // 흙길에는 차선이 없다
    centerLine: { opacity: { light: 0, dark: 0 } },
  },
  lighting: { shadow: { color: '#5A4630' } },
  modes: { simcity: { shadowOpacity: { light: 0.2, dark: 0.08 } } },
  // 기와집 (web/lib/city_hanok.mjs): every footprint fitted with an oriented rectangle of its own area; a small one is one
  // house (채), a big one a walled compound (담장) of houses in rows with yards between. Metres
  hanok: {
    fitK: 0.94,                       // the rectangle a little inside the footprint's own area, so neighbours' eaves seldom meet
    single: { maxLengthM: 22, maxDepthM: 12 },
    houseDepthM: [5.5, 9],            // wall to wall across one 채
    houseLengthM: 15,                 // the target length of one 채 in a compound (rows split into this)
    maxLengthM: 20,
    yardM: 6, gapM: 2.5,              // between rows of houses / between houses in a row
    emptyShare: 0.15,                 // cells of a big compound left as open yards
    maxHouses: 48,
    baseM: 0.55, baseOutM: 0.6,       // 기단: the stone platform the house stands on, and how far it reaches past the walls
    wallM: [2.5, 3.2],                // 기둥 높이 (base to eave), small house to big hall
    eaveOutM: 1.15,                   // 처마: past the walls
    riseK: 0.62, riseM: [1.4, 4.4],   // the roof's rise over the eaves: × (half depth + eave), clamped
    hipK: 0.6,                        // 우진각: the ridge is shorter than the eaves by this × the half depth at each end
    cornerLiftM: 0.8, cornerKickM: 0.45,   // 추녀: the eave corners lifted and pushed out
    postM: 0.24, bayM: 2.4,           // 기둥 width and spacing (칸)
    paperShare: 0.55,                 // bays with 창호 (the rest 회벽)
    compound: { minAreaM2: 260, wallM: 1.9, wallThickM: 0.45, insetM: 0.3, gateM: 3.2 },
    colors: {
      light: { giwa: ['#666D73', '#596066', '#73777A'], wood: '#7A5236', plaster: '#ECE6D6', paper: '#F3EBD3', stone: '#B9B2A3', dam: '#DCCFB4', soffit: '#6E4B33', ridge: '#3D4246' },
      dark: { giwa: ['#3A3F44', '#33383C', '#424546'], wood: '#4A3224', plaster: '#8E897C', paper: '#9C927A', stone: '#6F6A60', dam: '#80776A', soffit: '#3B2A1F', ridge: '#25292C' },
    },
    night: { paper: '#FFC774', litShare: 0.6, emission: 0.85 },   // 창호지 너머 등잔불
  },
});

export default JOSEON_CITY_STYLE;
