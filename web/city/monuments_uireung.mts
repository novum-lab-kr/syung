// 의릉(경종 · 선의왕후) 구역(봉분 · 곡장 · 정자각 · 비각 · 나머지 건물) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색. 모델 부품과 출처 · 근사 값은 monuments_tomb_kit.mts 머리 주석.
// 의릉: 봉분 둘 = OSM way 480559564(경종 의릉) · 480559565(선의왕후 의릉) — 쌍릉이 아니라 위아래 따로 앉은 동원상하릉, 정자각 · 비각 = building way 480559566 · 480559567, 곡장 = barrier=wall, 숨김 둘레 = way 480559569.
import { buildBySuffix, tombZone } from './monuments_tomb_kit.mts';
import { UIR_AT, UIR_ORIGIN } from './monuments_data.mts';
import { UIR_BUILDINGS, UIR_TOMBS, UIR_WALLS, UIR_BANKS } from './monuments_uireung_data.mts';
import { UIR_TORCHES } from './monuments_uireung_torches_data.mts';

export const torches = { at: UIR_AT, data: UIR_TORCHES };
const ZONE = tombZone({ at: UIR_AT, origin: UIR_ORIGIN, buildings: UIR_BUILDINGS, tombs: UIR_TOMBS, walls: UIR_WALLS, banks: UIR_BANKS, torches: UIR_TORCHES, levels: { 480559564: 6.5, 480559565: 3 } });
export const buildMonument = (id:string):Float32Array => buildBySuffix(id, ZONE);
