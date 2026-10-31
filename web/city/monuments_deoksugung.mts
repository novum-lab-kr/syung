// 덕수궁 구역(담장 · 대한문 · 중화전 일곽 · 석어당 · 즉조당 · 준명당 · 함녕전 일곽 · 정관헌 · 석조전 · 덕수궁 미술관 · 돈덕전 · 중명전 · 나머지 한옥 틀) 모델.
// monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다. 부품은 창덕궁 · 경복궁과 같은 monuments_hanok.mts(공용 틀 monuments_palace_kit.mts)이고,
// 서양식 건물은 monuments_western.mts. 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 모두 OSM(© OpenStreetMap contributors): 둘레 = way 26658458(덕수궁 담장) 경계 · 건물 = 그 안의 building 22동 + 둘레 밖 중명전(way 646147127) ·
// 석조전(relation 19357693) · 덕수궁 미술관(relation 10718798)은 바깥 둘레를 이은 것(monuments_deoksugung_data.mts), 나무 = 같은 둘레 안의 wood · tree(monuments_deoksugung_trees_data.mts).
// 출처로 확인한 것(위키백과 ko): 중화전 정면 5칸 · 측면 4칸 다포 팔작 단층 · 2중 월대 · 남향(약간 서쪽으로 틀어짐) / 중화문 정면 3칸 · 측면 2칸 다포 팔작 / 대한문 정면 3칸 · 측면 2칸 단층 다포 우진각 /
//   석어당 덕수궁 안 유일한 2층 건물 / 함녕전 정면 9칸 · 측면 4칸 ㄱ자 익공 / 광명문 정면 3칸 · 측면 2칸 / 석조전 정면 54 m · 너비 31 m 3층 화강석 신고전주의(지층 + 1 · 2층) /
//   돈덕전 · 정관헌 · 중명전은 중국 벽돌 건물(석조전 글: "모두 중국 벽돌로 지은 것") / 정관헌 석조 기둥 + 바깥 가는 기둥 퇴(위키백과) · 현재는 벽 없는 개방 구조(국가유산청 2025-04, 건립 당시 1900년경은 사방 벽).
// 사진 비례 근사(출처 못 찾음 · 값마다 주석에 "사진 비례 근사"): 건물 높이 · 처마 · 기단 치수 전부, 석조전 현관 기둥 수 · 지층 높이 · 지붕 경사, 덕수궁 미술관 앞쪽 방향(동쪽) · 층 높이,
//   돈덕전(2023 복원 건물 · 위키백과 글이 비어 있다) 층 수 · 베란다, 중명전 층 수 · 1층 열주 아치, 포덕문 · 월곡문 칸 수 · 방향, 담장 높이는 궁장 공통 근사.
// 못 그린 것: 중화전 월대 박석 · 품계석 · 석조전 분수 정원 · 함녕전 ㄱ자 날개 세부(윤곽 압출만) · 돌담길 · 연못.
import { K } from './monument_parts.mts';
import { DSG_AT, DSG_ORIGIN, dsgRing } from './monuments_data.mts';
import { DSG_BUILDINGS } from './monuments_deoksugung_data.mts';
import { DSG_TREES } from './monuments_deoksugung_trees_data.mts';
import { DSG_TORCHES } from './monuments_deoksugung_torches_data.mts';
import { frameOf, hall, clamp, FINE, MID } from './monuments_hanok.mts';
import type { Rect, Hall } from './monuments_hanok.mts';
import { buildZone, gate, half, mainHall, TIMBER_REMAP } from './monuments_palace_kit.mts';
import type { Builder, ZoneSpec } from './monuments_palace_kit.mts';
import { westernBuilding, shiftLocal } from './monuments_western.mts';
import type { WesternLook } from './monuments_western.mts';

export const trees = { at: DSG_AT, data: DSG_TREES };
export const torches = { at: DSG_AT, data: DSG_TORCHES };   // 밤 길가 횃불(길 양쪽 한 쌍씩 같은 간격)
const FRAME = frameOf(DSG_AT, DSG_ORIGIN);

// 석어당: 2층 팔작(덕수궁 안 유일한 2층 건물). 칸 수는 윤곽(19.8 × 7.9 m)에서 읽은 근사
// 단청 · 붉은 기둥이 아니라 원목 기둥 · 회벽(석어당은 단청을 하지 않은 건물로 알려져 있으나 이 모델의 색은 사진 비례 근사)
const seoeodang:Builder = (w, r) => {
  const { hx, hy } = half(r, .5);
  w.remap = TIMBER_REMAP;
  hall(w, { hx, hy, podium: .9, lowPodium: [.6], body: 3.4, rise: 3.2, eave: 2.2, bays: [clamp(Math.round(hx * 2 / 3.2), 3, 7), 2], steps: FINE, tiers: 2, upper: [.97, .9], upperRise: 2.6, ridgeFrac: .6, doors: true, lift: 1.2, gable: .45 });
  w.remap = null;
};
// 함녕전: 정면 9칸 · 측면 4칸 익공 단층(위키백과). 윤곽은 ㄱ자라 앞 몸만 세운다 — 날개 세부는 못 그림
const hamnyeongjeon:Builder = (w, r) => { mainHall(w, r, { bays: [9, 4], margin: .8, body: 3.8, rise: 3.6, eave: 2.4, brackets: false }) };

// 서양식 건물 모양표 — 치수는 윤곽에서, 층 높이 · 창 간격 · 지붕 경사는 사진 비례 근사
const SEOKJOJEON:WesternLook = { floors: 2, storey: 5.2, wall: K.granite, plinth: 4.2, plinthKind: K.granite, roof: 'hip', roofRise: 1.8, eave: .6, portico: { cols: 6, depth: 4.6, pediment: true, balcony: true }, terrace: 5.4, plinthWindows: true, balustrade: true, arch: false, bayWidth: 3.6, trim: K.trim };   // 지층 + 1 · 2층, 화강석(위키백과) · 열주 6개 · 테라스 · 난간 · 지층 창은 공개 글에서 못 확인 — 사진 비례 근사
const MUSEUM:WesternLook = { floors: 2, storey: 4.6, wall: K.stone, plinth: .9, roof: 'hip', roofRise: 2.4, eave: .6, bayWidth: 3.6, trim: K.trim };   // 구 이왕가 미술관(1938) — 석조 · 사진 비례 근사
const DONDEOKJEON:WesternLook = { floors: 2, storey: 4.2, wall: K.redBrick, plinth: .8, roof: 'hip', roofRise: 3.0, eave: 1.0, veranda: { post: K.trim, depth: 2.2, sides: true, floors: 2, rail: true }, frame: K.teal, balustrade: true, bayWidth: 3.2, trim: K.trim };   // 붉은 벽돌 · 청록 창 · 난간(fnnews 복원 기사) · 베란다 층 수 · 기둥 색 · 첨탑(못 그림)은 사진 비례 근사
const JUNGMYEONGJEON:WesternLook = { floors: 2, storey: 4.4, wall: K.redBrick, plinth: .8, roof: 'hip', roofRise: 3.2, eave: .9, arch: true, sideBalcony: { side: -1, depth: 2.2 }, bayWidth: 3.2, trim: K.trim };   // 붉은 벽돌 · 지하 1 + 지상 2 · 1층 아치 창 · 서쪽 2층 베란다(한국민족문화대백과 중명전) · 베란다 폭 · 창 간격은 사진 비례 근사
const JEONGGWANHEON:WesternLook = { floors: 1, storey: 5.0, wall: K.redBrick, plinth: 1.0, plinthKind: K.granite, roof: 'hip', roofKind: K.teal, roofRise: 2.6, eave: 1.2, open: true, veranda: { post: K.teal, depth: 2.0, sides: true, rail: true, thin: .08 }, frame: K.gilt, trim: K.teal, bayWidth: 3.2 };   // 열린 열주 구조(국가유산청 기사 · 위키미디어 사진): 석조 기둥 줄 + 벽돌 뒷벽 · 모서리 + 청록 가는 기둥 퇴 + 금색 난간 + 녹색 지붕 — 기둥 간격 · 높이 · 지붕 색은 사진 비례 근사

function western(look:WesternLook, back = 0, tweak?:(r:Rect) => { hx:number; hy:number }):Builder {
  return (w, r) => {
    const { hx, hy } = tweak ? tweak(r) : half(r, 0);
    if (back) shiftLocal(w, 0, back);
    westernBuilding(w, hx, hy, look);
  };
}
// 석조전: 정면 54 m · 너비 31 m(위키백과). 윤곽(56 × 41 m)에는 현관 · 앞 계단 · 뒤쪽 돌출이 섞여 있어 본체만 뒤로 붙이고 현관이 앞으로 나올 자리를 둔다
const seokjojeon:Builder = (w, r) => {
  const hx = Math.min(27, r.len / 2), hy = Math.min(15.5, r.wid / 2 - SEOKJOJEON.terrace! - .6);
  shiftLocal(w, 0, r.wid / 2 - hy - .6);
  westernBuilding(w, hx, hy, SEOKJOJEON);
};
// 중명전: 서쪽 옆 2층 베란다가 윤곽 안에 들도록 본채를 동쪽으로 밀어 놓는다
const jungmyeongjeon:Builder = (w, r) => {
  const pad = JUNGMYEONGJEON.sideBalcony!.depth + .4, hx = Math.max(1, r.len / 2 - pad), hy = Math.max(1, r.wid / 2 - .4);
  shiftLocal(w, pad / 2, 0);
  westernBuilding(w, hx, hy, JUNGMYEONGJEON);
};
const DEDICATED:Record<string, Builder> = {
  '중화전': (w, r) => { mainHall(w, r, { bays: [5, 4], margin: 1.4 }) },
  '중화문': (w, r) => { gate(w, r, [3, 2]) },
  '대한문': (w, r) => { gate(w, r, [3, 2]) },
  '광명문': (w, r) => { gate(w, r, [3, 2]) },
  '월곡문': (w, r) => { gate(w, r, [3, 2]) },
  '포덕문': (w, r) => { gate(w, r, [3, 2]) },
  '석어당': seoeodang,
  '함녕전': hamnyeongjeon,
  '즉조당': (w, r) => { mainHall(w, r, { bays: [clamp(Math.round(r.len / 3.4), 3, 7), 2], margin: .6, body: 3.6, rise: 3.2, eave: 2.2, podium: 1.0, lowPodium: [.6], steps: MID }) },
  '준명당': (w, r) => { mainHall(w, r, { bays: [clamp(Math.round(r.len / 3.4), 3, 6), 2], margin: .6, body: 3.6, rise: 3.2, eave: 2.2, podium: 1.0, lowPodium: [.6], steps: MID }) },
  '덕홍전': (w, r) => { mainHall(w, r, { bays: [5, 4], margin: .8, body: 3.8, rise: 3.6, eave: 2.4 }) },
};
const MODERN:Record<string, Builder> = {
  '석조전': seokjojeon,
  '정관헌': western(JEONGGWANHEON, 0, r => half(r, 2.0)),
  '돈덕전': western(DONDEOKJEON, 0, r => half(r, 2.6)),
  '중명전': jungmyeongjeon,
};

// 앞이 향하는 쪽(동 · 북 +): 대한문은 동쪽 길(세종대로)을 향한다 · 석조전 정면은 남쪽 분수 정원 쪽 · 미술관 앞쪽은 사진 근사(동쪽)
const FACING:Record<string, [number, number]> = { '대한문': [1, 0], '덕수궁 미술관': [1, 0], '중명전': [0, -1] };

const SPEC:ZoneSpec = {
  frame: FRAME, ring: dsgRing, buildings: DSG_BUILDINGS, dedicated: DEDICATED, modern: MODERN, facing: FACING,
  wings: { '덕수궁 미술관': western(MUSEUM, 0, r => half(r, 0)) },   // 윤곽이 여러 날개(fill .73)라 날개마다 짓는다
  wall: { gaps: ['대한문', '월곡문', '포덕문'] },
};

export function buildMonument(id:string):Float32Array {
  return buildZone(SPEC, id, { wall: 'dsg-wall', halls: 'dsg-halls', frames: 'dsg-frames' });
}
