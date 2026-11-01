// 숙정문 구역(문 + 둘레 한양도성 성곽 선): 이 문이 화면에 닿을 때만 받는다. 모드 · 테마는 받지 않는다 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리: OSM way 607913396(건물 윤곽 · 2026-11-01 API 원자료) — 아래 SHAPE.base 는 그 윤곽을 문 중심에서 방향 128° 로 돌린 미터 좌표(중심 = 윤곽 최소 직사각형 중심 · monuments_data.mts).
// https://www.openstreetmap.org/way/607913396
// 문루: 정면 3칸 · 측면 2칸 단층 팔작(숙정문 문루는 1396년 건립 · 후에 무너져 1976년 복원 — 위키백과 ko 숙정문은 건립 · 폐쇄 · 문루가 무너진 뒤 문짝만 보존했다는 것까지 확인, 칸 수 · 지붕 모양은 국가유산 설명에서 읽은 기억 값이라 근사).
// 근사(출처 못 찾음): 육축 높이 4.8 m · 문루 전체 높이 9 m · 홍예 3.2 × 3.8 m · 문루 폭 7.2 × 깊이 3.6 m · 현판 가로형(글씨 없음) · 여장 높이 · 기둥 굵기.
// 북쪽 문(밖은 북동쪽): 문 바깥 면이 북동을 보도록 방향을 잡았다(근사).
// 성곽: OSM barrier=city_wall 선(문 중심 420 m 안 · monuments_sukjeongmun_data.mts)을 한 줄 담으로 세운다 — 두께 3.2 m · 높이 5.5 m 는 근사(OSM 에 높이 자료가 일부만 12 m 로 있어 믿지 않았다), 여장 · 성돌 줄은 못 그림.
// 횃불: 통로 축 양쪽 끝에 좌우 대칭 두 쌍(축에서 ±4.2 m · 육축 앞뒤 면에서 1.4~1.5 m 밖) — 길 · 건물 겹침은 확인하지 못한 근사다. 횃불은 현대 실재 시설이 아닌 야간 시각화이다.
import { MeshWriter, K } from './monument_parts.mts';
import { buildCityGate, clipOutsideGate } from './monuments_gates.mts';
import type { GateShape } from './monuments_gates.mts';
import { wallLine } from './monument_modern.mts';
import type { P2 } from './monument_modern.mts';
import { SJ_WALLS } from './monuments_sukjeongmun_data.mts';
export const SHAPE:GateShape = {"base": [[6.815, 3.858], [6.707, 2.174], [6.333, -3.836], [-0.121, -3.853], [-6.815, -3.872], [-6.76, 1.928], [-6.742, 3.872], [-2.659, 3.872], [0.171, 3.866], [3.623, 3.867], [6.815, 3.858]], "frameWidth": 7.2, "frameDepth": 3.6, "height": 9, "masonryHeight": 4.8, "archWidth": 3.2, "archHeight": 3.8, "verticalPlaque": false, "tiers": 1, "bays": 3};
function buildWall():Float32Array {
  const w = new MeshWriter();
  for (const flat of SJ_WALLS) {
    const line:P2[] = []; for (let i = 0; i < flat.length; i += 2) line.push([flat[i]! / 10, flat[i + 1]! / 10]);
    for (const piece of clipOutsideGate(line, SHAPE.base, 128)) wallLine(w, piece, { half: 1.6, height: 5.5, kind: K.granite, cap: K.granite });   // 두께 · 높이 근사 · 문 자리는 잘라 홍예를 연다
  }
  return new Float32Array(w.data);
}
export function buildMonument(id:string):Float32Array {
  if (id === 'sj-gate') return buildCityGate(SHAPE);
  if (id === 'sj-wall') return buildWall();
  return new Float32Array();
}
export const torches:{ at:[number, number]; data:number[] } = { at: [126.9810832, 37.595533], data: [67, -1, 15, 65, -15, -65, -67, 1] };   // monuments.mts 가 구역을 받으면 횃불 숲으로 등록(문 중심 기준 동 · 북 0.1 m)
