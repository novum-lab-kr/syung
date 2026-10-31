// 창경궁 구역(둘레 담장 · 홍화문 · 명정전 일곽 · 문정전 · 숭문당 · 함인정 · 환경전 · 경춘전 · 통명전 · 양화당 · 영춘헌 · 대온실 · 나머지 한옥 틀) 모델.
// monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다. 부품은 창덕궁 · 경복궁과 같은 monuments_hanok.mts(공용 틀 monuments_palace_kit.mts),
// 대온실은 monuments_western.mts. 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 모두 OSM(© OpenStreetMap contributors): 둘레 = way 380863257(창경궁) 경계 · 건물 = 그 안의 building 25동 + 영춘헌(relation 2264939)(monuments_changgyeonggung_data.mts),
// 나무 = 같은 둘레 안의 wood · tree(monuments_changgyeonggung_trees_data.mts).
// 출처로 확인한 것(위키백과 ko): 창경궁은 조선 궁궐 가운데 유일하게 동향 / 명정전 정면 5칸 · 측면 3칸 단층 다포 팔작 · 동향 · 이중 월대 / 홍화문 정면 3칸 · 측면 2칸 중층 우진각 · 동향 /
//   통명전 정면 7칸 · 측면 4칸 이익공 팔작 · 용마루 없는 무량각 · 남향 · 큰 월대 / 환경전 남향 / 대온실 1909년 주철골 + 목조에 유리 외피(국가등록문화재 제83호).
// 사진 비례 근사(출처 못 찾음 · 값마다 주석에 "사진 비례 근사"): 건물 높이 · 처마 · 기단 치수 전부, 문정전 · 숭문당 · 빈양문 · 영춘헌 칸 수와 방향, 선인문 · 집춘문 · 월근문 칸 수와 방향,
//   경춘전 정면 7칸 · 측면 4칸은 한국민족문화대백과에서 확인 · 양화당 6×4 는 검토 의견의 인용값(원문 직접 확인 못 함) · 숭문당 정면 4칸 측면 3칸(실록위키에서 확인, 측면은 자료가 갈림 → 근사) · 숭문당 동향은 검토 의견(원문 직접 확인 못 함), 공포는 명정전만(나머지 익공 계열 근사),
//   대온실 중앙 홀 · 날개 높이 · 지붕 경사 · 철골 살 간격, 관리소(현대 건물) 모양.
// 못 그린 것: 명정전 월대 박석 · 품계석 · 금천교 · 통명전 연못 · 대온실 안 식물 · 춘당지 · 행각 칸막이(윤곽 압출만).
import { K } from './monument_parts.mts';
import { CGG_AT, CGG_ORIGIN, cggRing } from './monuments_data.mts';
import { CGG_BUILDINGS } from './monuments_changgyeonggung_data.mts';
import { CGG_TREES } from './monuments_changgyeonggung_trees_data.mts';
import { CGG_TORCHES } from './monuments_changgyeonggung_torches_data.mts';
import { frameOf, hall, clamp, FINE } from './monuments_hanok.mts';
import { buildZone, gate, half, mainHall, pavilion } from './monuments_palace_kit.mts';
import type { Builder, ZoneSpec } from './monuments_palace_kit.mts';
import { westernBuilding } from './monuments_western.mts';
import type { WesternLook } from './monuments_western.mts';

export const trees = { at: CGG_AT, data: CGG_TREES };
export const torches = { at: CGG_AT, data: CGG_TORCHES };   // 밤 길가 횃불(길 양쪽 한 쌍씩 같은 간격)
const FRAME = frameOf(CGG_AT, CGG_ORIGIN);

// 홍화문: 중층 우진각 3×2(위키백과). 높이 · 처마는 사진 비례 근사
const hongwhamun:Builder = (w, r) => { hall(w, { ...half(r, .8), podium: 1.4, lowPodium: [1.0, .5], body: 3.6, rise: 3.6, eave: 2.4, bays: [3, 2], steps: FINE, tiers: 2, brackets: true, doors: true, stair: true, upper: [.9, .88], upperRise: 3.0 }) };
// 큰 전각 공통 몸: 월대(기단)는 윤곽이 곧 월대 가장자리. 칸 수는 호출하는 쪽이 정한다
// 공포(다포)는 명정전에만 — 통명전(이익공 · 위키백과) · 숭문당(익공 · 실록위키)은 익공이라 크게 얹지 않고, 나머지는 출처를 못 찾아 익공 계열로 근사
const MAIN = (bays:[number, number], extra:{ ridgeless?:boolean; margin?:number; brackets?:boolean } = {}):Builder => (w, r) => { mainHall(w, r, { bays, margin: extra.margin ?? 1.2, ridgeless: extra.ridgeless, gable: extra.ridgeless ? undefined : .5, brackets: extra.brackets ?? false }) };
// 칸 수(정면 × 측면): 경춘전 7 × 4 · 양화당 6 × 4(경춘전 한국민족문화대백과 확인 · 양화당은 검토 의견 인용 — 직접 확인 못 함), 숭문당 정면 4칸(실록위키 · 측면 3칸은 자료가 갈려 근사)
export const BAYS:Record<string, [number, number]> = { '경춘전': [7, 4], '양화당': [6, 4], '숭문당': [4, 3] };
const DAEONSIL:WesternLook = { floors: 1, storey: 5.2, wall: K.glass, plinth: .6, roof: 'gable', roofKind: K.glass, roofRise: 3.2, eave: .3, glass: true, trim: K.trim, bayWidth: 3 };   // 주철골 + 유리(위키백과) · 높이 · 지붕 경사는 사진 비례 근사
const OFFICE:WesternLook = { floors: 1, storey: 3.6, wall: K.plaster, plinth: .4, roof: 'hip', roofKind: K.giwa, roofRise: 1.8, eave: .8, bayWidth: 3.4, trim: K.trim };   // 관리소(현대 건물) — 사진 비례 근사

const DEDICATED:Record<string, Builder> = {
  '홍화문': hongwhamun,
  '명정전': MAIN([5, 3], { margin: 1.4, brackets: true }),   // 정면 5칸 · 측면 3칸(위키백과)
  '문정전': MAIN([5, 3]),                     // 칸 수 사진 비례 근사
  '숭문당': MAIN(BAYS['숭문당']!, { margin: .8 }),   // 정면 4칸 익공(실록위키) · 측면 3칸은 근사
  '빈양문': (w, r) => { gate(w, r, [3, 2]) },
  '통명전': MAIN([7, 4], { ridgeless: true }),   // 정면 7칸 · 측면 4칸 · 무량각(위키백과)
  '환경전': MAIN([5, 3]),                     // 칸 수 사진 비례 근사
  '경춘전': MAIN(BAYS['경춘전']!, { margin: .8 }),   // 정면 7칸 · 측면 4칸
  '양화당': MAIN(BAYS['양화당']!, { margin: .8 }),   // 정면 6칸 · 측면 4칸
  '영춘헌': MAIN([clamp(Math.round(34 / 3.6), 5, 9), 3], { margin: .8 }),   // 윤곽 34 m 에서 읽은 칸 수 · 사진 비례 근사
  '창경궁 함인정': (w, r) => { pavilion(w, r) },
  '관덕정': (w, r) => { pavilion(w, r) },
  '창경궁 선인문': (w, r) => { gate(w, r, [3, 2]) },
  '집춘문': (w, r) => { gate(w, r, [1, 1]) },
  '월근문': (w, r) => { gate(w, r, [1, 1]) },
};
// 대온실: 윤곽(fill .69)이 중앙 홀 + 날개라 날개마다 유리 몸을 짓는다. 관리소는 현대 단층(날개마다 같은 모양)
const glassHouse:Builder = (w, r) => { const { hx, hy } = half(r, .1); westernBuilding(w, hx, hy, DAEONSIL) };
const office:Builder = (w, r) => { const { hx, hy } = half(r, .2); westernBuilding(w, hx, hy, OFFICE) };

// 앞이 향하는 쪽(동 · 북 +): 창경궁은 동향(위키백과). 문정전 · 환경전 · 통명전은 남향
const FACING:Record<string, [number, number]> = {
  '홍화문': [1, 0], '명정전': [1, 0], '창경궁 선인문': [1, 0], '경춘전': [1, 0],
  '집춘문': [0, 1], '월근문': [0, 1],
  '숭문당': [1, 0],   // 동향(검토 의견 · 직접 확인 못 함) — 문 · 계단도 그 쪽으로
};

const SPEC:ZoneSpec = {
  frame: FRAME, ring: cggRing, buildings: CGG_BUILDINGS, dedicated: DEDICATED, facing: FACING,
  wings: { '대온실': glassHouse, '관리소': office },
  wall: { gaps: ['홍화문', '창경궁 선인문', '집춘문', '월근문'] },
};

export function buildMonument(id:string):Float32Array {
  return buildZone(SPEC, id, { wall: 'cgg-wall', halls: 'cgg-halls', frames: 'cgg-frames' });
}
