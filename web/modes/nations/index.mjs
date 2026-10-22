// 나라 모드: 심시티 도시(같은 서울 윤곽 · 고가)를 그 나라 풍으로 — 나라마다 모드 하나. 다른 것만 적는다:
// 도시 팩 색 · 창 · 지붕(나라 파일, 생성기로 만든 데이터)과 몇 채만 그 나라 건물(팩 nation.kind → 부품 'nation', web/modes/nations/parts.mjs).
// 차례대로 더한다: 그리스 → 네덜란드 → 파리 → 이집트(행님 2026-10-22, 시안 look3d).
import { GREECE_DELTA } from './greece.mjs';

export const GREECE = {
  id: 'greece',
  from: 'simcity',
  label: '그리스',
  settings: {
    city: { pack: GREECE_DELTA },   // 흰 회벽 · 파스텔 · 파란 돔 · 돌길 · 에게해
  },
};
export default [GREECE];   // (고르는 줄의 차례 · 나라 id 목록은 transition.mjs NATIONS)
