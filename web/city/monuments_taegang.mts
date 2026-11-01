// 태릉 · 강릉 구역(봉분 · 곡장 · 정자각 · 비각 · 나머지 건물) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색. 모델 부품과 출처 · 근사 값은 monuments_tomb_kit.mts 머리 주석.
// 태릉(중종의 계비 문정왕후)과 강릉(명종 · 인순왕후): 봉분 = OSM way 480340175(태릉) · 382309975 · 382309976(강릉), 정자각 = 480340173 · 382309977, 곡장 = barrier=wall, 숨김 둘레 = 강릉 way 382309973 와 태릉 윤곽 둘레(18 m 넓힘 근사). 이 구역의 걷는 길은 지도에 거의 없어 횃불은 정자각 네 모서리에만 둔다.
import { buildBySuffix, tombZone } from './monuments_tomb_kit.mts';
import { TGN_AT, TGN_ORIGIN } from './monuments_data.mts';
import { TGN_BUILDINGS, TGN_TOMBS, TGN_WALLS, TGN_BANKS } from './monuments_taegang_data.mts';
import { TGN_TORCHES } from './monuments_taegang_torches_data.mts';

export const torches = { at: TGN_AT, data: TGN_TORCHES };
const ZONE = tombZone({ at: TGN_AT, origin: TGN_ORIGIN, buildings: TGN_BUILDINGS, tombs: TGN_TOMBS, walls: TGN_WALLS, banks: TGN_BANKS, torches: TGN_TORCHES });
export const buildMonument = (id:string):Float32Array => buildBySuffix(id, ZONE);
