// 나라 모드: 심시티 도시(같은 서울 윤곽 · 고가)를 그 나라 풍으로 — 나라마다 모드 하나. 다른 것만 적는다:
// 도시 팩 색 · 창 · 지붕(나라 파일, 생성기로 만든 데이터)과 몇 채만 그 나라 건물(팩 nation.kind → 부품 'nation', web/modes/nations/parts.mjs).
// 차례대로 더한다: 그리스 → 네덜란드 → 파리 → 이집트(행님 2026-10-22, 시안 look3d).
import { GREECE_DELTA } from './greece.mts';
import { NETHERLANDS_DELTA } from './netherlands.mts';
import { PARIS_DELTA } from './paris.mts';
import { EGYPT_DELTA } from './egypt.mts';
import { SEOUL_KEEP } from '../starcraft/style.mts';   // 서울 대표 건물은 원래 모양에 나라 색만(스타와 같은 목록)
// 팩에 race: 나라 건물을 스타 종족 건물처럼 통째로(모형 템플릿 — web/modes/nations/models.mjs, 그리기는 스타와 같은 인스턴스 길)
const withModels = <P extends object>(pack:P, kind:string) => ({ ...pack, race: { kind, keep: SEOUL_KEEP } });

export const GREECE = {
  id: 'greece',
  from: 'simcity',
  label: '그리스',
  settings: {
    city: { pack: withModels(GREECE_DELTA, 'greece') },   // 흰 회벽 · 파스텔 · 파란 돔 · 돌길 · 에게해
  },
};
export const NETHERLANDS = {
  id: 'netherlands',
  from: 'simcity',
  label: '네덜란드',
  settings: {
    city: { pack: withModels(NETHERLANDS_DELTA, 'netherlands') },   // 벽돌 · 박공 · 가파른 지붕 · 운하 · 풍차
  },
};
export const PARIS = {
  id: 'paris',
  from: 'simcity',
  label: '파리',
  settings: {
    city: { pack: withModels(PARIS_DELTA, 'paris') },   // 석회석 · 망사르드 · 지붕창 · 굴뚝 · 철제 발코니
  },
};
export const EGYPT = {
  id: 'egypt',
  from: 'simcity',
  label: '이집트',
  settings: {
    city: { pack: withModels(EGYPT_DELTA, 'egypt') },   // 사암 · 옥상 살림 · 모스크 · 피라미드 · 나일
  },
};
export default [GREECE, NETHERLANDS, PARIS, EGYPT];   // (고르는 줄의 차례 · 나라 id 목록은 transition.mjs NATIONS)
