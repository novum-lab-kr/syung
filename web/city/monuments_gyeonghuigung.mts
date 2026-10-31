// 경희궁 구역(숭정전 일곽 · 자정전 · 태령전 · 흥화문 · 나머지 한옥 틀) 모델. 복원된 건물만 그린다 — 일제강점기에 헐려 나간 나머지 전각 · 궁장은 자료가 없어 그리지 않는다.
// monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다. 부품은 창덕궁 · 경복궁과 같은 monuments_hanok.mts(공용 틀 monuments_palace_kit.mts).
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 모두 OSM(© OpenStreetMap contributors): 건물 = 숭정전 일곽 사각(GHG_RING) 안의 building 13동 + 둘레 밖 흥화문(way 196071778)(monuments_gyeonghuigung_data.mts),
// 나무 = 같은 사각 안의 wood · tree(monuments_gyeonghuigung_trees_data.mts, 수종 표기 없는 숲은 수종 미상).
// 출처로 확인한 것(위키백과 ko): 숭정전 정면 5칸 · 측면 4칸 팔작 · 이중 월대(복원) / 흥화문 정면 3칸 · 측면 2칸 다포계 겹처마 단층 우진각 · 지금은 남향 / 숭정전 일곽은 남향한 경사지의 축대 위.
// 향: OSM 에서 숭정문 · 자정문 · 자정전이 숭정전 앞쪽 축(남남동 → 북북서) 위에 늘어서 있어 일곽을 그 축의 남남동 쪽으로 향하게 했다(위키백과 "남향"과 같은 쪽).
// 사진 비례 근사(출처 못 찾음 · 값마다 주석에 "사진 비례 근사"): 건물 높이 · 처마 · 기단 치수 전부, 자정전 · 태령전 · 숭정문 · 자정문 · 태령문 칸 수.
// 못 그린 것: 숭정전 월대 박석 · 품계석 · 행각 칸막이(윤곽 압출만) · 금천교 · 옛 서궐 전각 · 궁장.
import { GHG_AT, GHG_ORIGIN, ghgRing } from './monuments_data.mts';
import { GHG_BUILDINGS } from './monuments_gyeonghuigung_data.mts';
import { GHG_TREES } from './monuments_gyeonghuigung_trees_data.mts';
import { GHG_TORCHES } from './monuments_gyeonghuigung_torches_data.mts';
import { frameOf } from './monuments_hanok.mts';
import { buildZone, gate, mainHall } from './monuments_palace_kit.mts';
import type { Builder, ZoneSpec } from './monuments_palace_kit.mts';

export const trees = { at: GHG_AT, data: GHG_TREES };
export const torches = { at: GHG_AT, data: GHG_TORCHES };   // 밤 길가 · 전각 앞 횃불
const FRAME = frameOf(GHG_AT, GHG_ORIGIN);

const MAIN = (bays:[number, number], margin = 1.2):Builder => (w, r) => { mainHall(w, r, { bays, margin }) };
const DEDICATED:Record<string, Builder> = {
  '숭정전': MAIN([5, 4], 1.0),                 // 정면 5칸 · 측면 4칸 팔작(위키백과)
  '숭정문': (w, r) => { gate(w, r, [3, 2]) },    // 칸 수 사진 비례 근사
  '자정문': (w, r) => { gate(w, r, [3, 2]) },    // 칸 수 사진 비례 근사
  '태령문': (w, r) => { gate(w, r, [3, 2]) },    // 칸 수 사진 비례 근사
  '자정전': MAIN([5, 3]),                        // 칸 수 사진 비례 근사
  '태령전': MAIN([5, 2], .8),                    // 칸 수 사진 비례 근사
  '흥화문': (w, r) => { gate(w, r, [3, 2]) },    // 정면 3칸 · 측면 2칸 단층 우진각(위키백과)
};
// 일곽 축(남남동 쪽이 앞) — OSM 건물 배치에서 읽은 방향. 흥화문은 위키백과대로 남향
const AXIS:[number, number] = [.53, -.85];
const FACING:Record<string, [number, number]> = { '숭정전': AXIS, '숭정문': AXIS, '자정문': AXIS, '태령문': AXIS, '자정전': AXIS, '태령전': AXIS, '흥화문': [0, -1] };

const SPEC:ZoneSpec = { frame: FRAME, ring: ghgRing, buildings: GHG_BUILDINGS, dedicated: DEDICATED, facing: FACING };

export function buildMonument(id:string):Float32Array {
  return buildZone(SPEC, id, { wall: 'ghg-wall', halls: 'ghg-halls', frames: 'ghg-frames' });
}
