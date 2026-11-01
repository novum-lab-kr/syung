// 정릉(신덕왕후) 구역(봉분 · 곡장 · 정자각 · 비각 · 나머지 건물) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색. 모델 부품과 출처 · 근사 값은 monuments_tomb_kit.mts 머리 주석.
// 정릉(태조의 계비 신덕왕후): 봉분 = OSM way 345476687(신덕왕후릉), 정자각 = building way 345546536(丁자 윤곽), 곡장 = barrier=wall. 숨김 둘레는 윤곽 둘레에서 18 m 넓힌 근사.
import { buildBySuffix, tombZone } from './monuments_tomb_kit.mts';
import { JNG_AT, JNG_ORIGIN } from './monuments_data.mts';
import { JNG_BUILDINGS, JNG_TOMBS, JNG_WALLS, JNG_BANKS } from './monuments_jeongneung_data.mts';
import { JNG_TORCHES } from './monuments_jeongneung_torches_data.mts';

export const torches = { at: JNG_AT, data: JNG_TORCHES };
const ZONE = tombZone({ at: JNG_AT, origin: JNG_ORIGIN, buildings: JNG_BUILDINGS, tombs: JNG_TOMBS, walls: JNG_WALLS, banks: JNG_BANKS, torches: JNG_TORCHES });
export const buildMonument = (id:string):Float32Array => buildBySuffix(id, ZONE);
