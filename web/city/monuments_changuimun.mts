// 창의문 구역(문 + 둘레 한양도성 성곽 선): 이 문이 화면에 닿을 때만 받는다. 모드 · 테마는 받지 않는다 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리: OSM way 382251765(건물 윤곽 · 2026-11-01 API 원자료) — 아래 SHAPE.base 는 그 윤곽을 문 중심에서 방향 253° 로 돌린 미터 좌표(중심 = 윤곽 최소 직사각형 중심 · monuments_data.mts).
// https://www.openstreetmap.org/way/382251765
// 문루: 정면 3칸 · 측면 2칸 단층(1741년 영조 때 세운 문루 · 4소문 가운데 유일하게 남은 원형 · 보물 제1881호 — 위키백과 ko 창의문에서 확인. 칸 수 · 지붕 모양은 기억 값이라 근사, 천장 봉황 그림은 안 그림).
// 근사(출처 못 찾음): 육축 높이 4.4 m · 문루 전체 높이 8.6 m · 홍예 3.0 × 3.4 m · 문루 폭 7.4 × 깊이 3.4 m · 현판 가로형(글씨 없음).
// 문 바깥 면이 서쪽(부암동)을 보도록 방향을 잡았다(근사).
// 성곽: OSM barrier=city_wall 선(문 중심 420 m 안 · monuments_changuimun_data.mts)을 한 줄 담으로 세운다 — 두께 3.2 m · 높이 5.5 m 는 근사(OSM 에 높이 자료가 일부만 12 m 로 있어 믿지 않았다), 여장 · 성돌 줄은 못 그림.
// 횃불: 통로 축 양쪽 끝에 좌우 대칭 두 쌍(축에서 ±4.2 m · 육축 앞뒤 면에서 1.4~1.5 m 밖) — 길 · 건물 겹침은 확인하지 못한 근사다. 횃불은 현대 실재 시설이 아닌 야간 시각화이다.
import { MeshWriter, K } from './monument_parts.mts';
import { buildCityGate, clipOutsideGate } from './monuments_gates.mts';
import type { GateShape } from './monuments_gates.mts';
import { wallLine } from './monument_modern.mts';
import type { P2 } from './monument_modern.mts';
import { CU_WALLS } from './monuments_changuimun_data.mts';
export const SHAPE:GateShape = {"base": [[-5.485, -3.723], [-5.515, 3.711], [5.477, 3.723], [5.515, -3.699], [-5.485, -3.723]], "frameWidth": 7.4, "frameDepth": 3.4, "height": 8.6, "masonryHeight": 4.4, "archWidth": 3.0, "archHeight": 3.4, "verticalPlaque": false, "tiers": 1, "bays": 3};
function buildWall():Float32Array {
  const w = new MeshWriter();
  for (const flat of CU_WALLS) {
    const line:P2[] = []; for (let i = 0; i < flat.length; i += 2) line.push([flat[i]! / 10, flat[i + 1]! / 10]);
    for (const piece of clipOutsideGate(line, SHAPE.base, 253)) wallLine(w, piece, { half: 1.6, height: 5.5, kind: K.granite, cap: K.granite });   // 두께 · 높이 근사 · 문 자리는 잘라 홍예를 연다
  }
  return new Float32Array(w.data);
}
export function buildMonument(id:string):Float32Array {
  if (id === 'cu-gate') return buildCityGate(SHAPE);
  if (id === 'cu-wall') return buildWall();
  return new Float32Array();
}
export const torches:{ at:[number, number]; data:number[] } = { at: [126.966521, 37.5926116], data: [-37, 55, -62, -25, 62, 25, 37, -55] };   // monuments.mts 가 구역을 받으면 횃불 숲으로 등록(문 중심 기준 동 · 북 0.1 m)
