// 나라 모드: 심시티 도시(같은 서울 윤곽 · 고가)를 그 나라 풍으로 — 나라마다 모드 하나. 다른 것만 적는다:
// 도시 팩 색 · 창 · 지붕(나라 파일, 생성기로 만든 데이터)과 몇 채만 그 나라 건물(팩 nation.kind → 부품 'nation', web/modes/nations/parts.mjs).
// 차례대로 더한다: 그리스 → 네덜란드 → 파리 → 이집트(행님 2026-10-22, 시안 look3d).
import { GREECE_DELTA } from './greece.mjs';
import { NETHERLANDS_DELTA } from './netherlands.mjs';
import { PARIS_DELTA } from './paris.mjs';

export const GREECE = {
  id: 'greece',
  from: 'simcity',
  label: '그리스',
  settings: {
    city: { pack: GREECE_DELTA },   // 흰 회벽 · 파스텔 · 파란 돔 · 돌길 · 에게해
  },
};
export const NETHERLANDS = {
  id: 'netherlands',
  from: 'simcity',
  label: '네덜란드',
  settings: {
    city: { pack: NETHERLANDS_DELTA },   // 벽돌 · 박공 · 가파른 지붕 · 운하 · 풍차
  },
};
export const PARIS = {
  id: 'paris',
  from: 'simcity',
  label: '파리',
  settings: {
    city: { pack: PARIS_DELTA },   // 석회석 · 망사르드 · 지붕창 · 굴뚝 · 철제 발코니
  },
};
export default [GREECE, NETHERLANDS, PARIS];   // (고르는 줄의 차례 · 나라 id 목록은 transition.mjs NATIONS)
