// 선릉 · 정릉(중종) — 선정릉 공원 구역(봉분 · 곡장 · 정자각 · 비각 · 나머지 건물) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색. 모델 부품과 출처 · 근사 값은 monuments_tomb_kit.mts 머리 주석.
// 선릉(성종 · 정현왕후)과 정릉(중종)을 한 구역으로 둔다(공원 안에 둘이 같이 있다). 자리: 봉분 윤곽 = OSM historic=tomb 둘(선릉 성종왕릉 way 369687345 · 삼릉공원 중종정릉 369687342), 정자각 · 비각 · 수복방 · 재실 = building way 239953121 · 124 · 129 · 125 · 128 · 369687323 …, 곡장 = barrier=wall, 둔덕 = man_made=embankment 닫힌 선, 숨김 둘레 = 공원 way 382000603 와 두 무리의 윤곽 둘레. 이름 없는 건물(1494314036 …)은 무엇인지 자료로 확인 못 해 한옥 틀로 짓는다.
import { buildBySuffix, tombZone } from './monuments_tomb_kit.mts';
import { SJN_AT, SJN_ORIGIN } from './monuments_data.mts';
import { SJN_BUILDINGS, SJN_TOMBS, SJN_WALLS, SJN_BANKS } from './monuments_seonjeong_data.mts';
import { SJN_TORCHES } from './monuments_seonjeong_torches_data.mts';

export const torches = { at: SJN_AT, data: SJN_TORCHES };
const ZONE = tombZone({ at: SJN_AT, origin: SJN_ORIGIN, buildings: SJN_BUILDINGS, tombs: SJN_TOMBS, walls: SJN_WALLS, banks: SJN_BANKS, torches: SJN_TORCHES });
export const buildMonument = (id:string):Float32Array => buildBySuffix(id, ZONE);
