// 헌릉 · 인릉 구역(봉분 · 곡장 · 정자각 · 비각 · 나머지 건물) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색. 모델 부품과 출처 · 근사 값은 monuments_tomb_kit.mts 머리 주석.
// 헌인릉: 헌릉(태종 · 원경왕후)과 인릉(순조 · 순원왕후)이 한 울타리 안. 봉분 = OSM way 346745927 · 346886974(헌릉) · 346724669(인릉), 정자각 = 346746076(헌릉) · 346724617(인릉), 태종신도비 = 682119244, 곡장 = barrier=wall 넷, 숨김 둘레 = way 346902903. 큰 이름 없는 건물(OSM 701650605 · 701650606 …)은 무엇인지 자료로 확인 못 해 한옥 틀로 짓는다.
import { buildBySuffix, tombZone } from './monuments_tomb_kit.mts';
import { HIN_AT, HIN_ORIGIN } from './monuments_data.mts';
import { HIN_BUILDINGS, HIN_TOMBS, HIN_WALLS, HIN_BANKS } from './monuments_heonin_data.mts';
import { HIN_TORCHES } from './monuments_heonin_torches_data.mts';

export const torches = { at: HIN_AT, data: HIN_TORCHES };
const ZONE = tombZone({ at: HIN_AT, origin: HIN_ORIGIN, buildings: HIN_BUILDINGS, tombs: HIN_TOMBS, walls: HIN_WALLS, banks: HIN_BANKS, torches: HIN_TORCHES });
export const buildMonument = (id:string):Float32Array => buildBySuffix(id, ZONE);
