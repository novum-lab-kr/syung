// 석촌동 고분군(백제 적석총 제2 · 3 · 4호분) 구역 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 제3호분 = way 1108083866 · 제4호분 = 1108083868 · 제2호분 = 1201143817(historic=tomb 윤곽 — 중심 · 방향을 여기서 읽는다).
// 출처로 확인한 것(위키백과 ko 석촌동 고분군): 제2호분은 3단 · 밑변 16.4 m · 둘째 단 12.5 m · 셋째 단 8.5 m · 높이 합 3.5 m의 방형 적석총,
// 제3호분은 동서 50.8 m × 남북 48.4 m · 높이 4.5 m의 큰 계단식 방형 적석총, 제4호분은 한 변 17.2 m의 방형 적석총. 모두 돌을 쌓아 올린 모습(복원 · 정비된 지금 모양).
// 근사(출처 못 찾음 · 값마다 "근사"): 제3호분의 단 수(셋) · 단 높이 · 단 안쪽 들임 · 제4호분의 높이 3 m · 단 수(둘) · 단 안쪽 들임 · 돌 빛.
// 못 그린 것: 위쪽 윗면의 무너진 돌 · 돌 하나하나 · 제1호분 등 지도에 윤곽이 없는 고분 · 안내판.
import { MeshWriter, K } from './monument_parts.mts';
import { SKC_AT, SKC_ORIGIN } from './monuments_data.mts';
import { SKC_TOMBS } from './monuments_seokchon_data.mts';
import { SKC_TREES } from './monuments_seokchon_trees_data.mts';
import { SKC_TORCHES } from './monuments_seokchon_torches_data.mts';
import { frameOf, rectOf, place } from './monuments_hanok.mts';

export const trees = { at: SKC_AT, data: SKC_TREES };
export const torches = { at: SKC_AT, data: SKC_TORCHES };
const FRAME = frameOf(SKC_AT, SKC_ORIGIN);

// 제N호분 → 단 목록: [한 변 길이 가로 · 세로, 단 윗면 높이]. 출처 값이 있으면 그것, 없으면 근사 들임
const TIERS:Record<string, (len:number, wid:number) => [number, number, number][]> = {
  '석촌동 제2호분': () => [[16.4, 16.4, 1.17], [12.5, 12.5, 2.33], [8.5, 8.5, 3.5]],   // 위키 값(단 높이는 합 3.5 m 를 셋으로 고르게 나눈 근사)
  '석촌동 제3호분': () => [[50.8, 48.4, 1.6], [39.8, 37.4, 3.1], [28.8, 26.4, 4.5]],   // 밑변 · 높이 합은 위키 값, 위 두 단 들임(5.5 m씩) · 단 높이 근사
  '석촌동 제4호분': () => [[17.2, 17.2, 1.6], [13.2, 13.2, 3.0]],   // 밑변은 위키 값, 높이 3 m · 둘째 단 근사
};
export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id !== 'skc-halls') return new Float32Array(w.data);
  for (const tomb of SKC_TOMBS) {
    const tiers = TIERS[tomb.name]; if (!tiers) continue;
    const r = rectOf(tomb.p, FRAME);
    place(w, r);
    let below = 0;
    for (const [len, wid, top] of tiers(r.len, r.wid)) { w.box(-len / 2, len / 2, -wid / 2, wid / 2, below, top, K.rubble, { bottom: true }); below = top }
    w.xf = null;
  }
  return new Float32Array(w.data);
}
