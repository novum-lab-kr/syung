// 스타크래프트 모드: 심시티 도시 위에서 종족(테란 · 저그 · 프로토스)을 골라 논다. 종족마다 모드 하나(같은 심시티 도시 · 고가),
// 다른 것만 적는다: 도시 팩(건물 · 땅 · 길 · 고가 색 — style.mjs), 지하철은 수송선 편대(trains.units — 맨 앞 lead + 뒤 rest, 고가 위에 떠서), 버스는 유닛 한 마리,
// 내 위치는 그 종족 일꾼. 유닛 모양은 unit_shapes.mjs(Codex 시안). 사람 · 차 · 하늘 유닛은 다음 단계(행님 2026-10-22).
import { TERRAN_DELTA, ZERG_DELTA, PROTOSS_DELTA } from './style.mjs';

export const TERRAN = {
  id: 'terran',
  from: 'simcity',
  label: '테란',
  settings: {
    city: { pack: TERRAN_DELTA },   // 강철 기지
    trains: { look: 'units', units: { lead: 'dropship', rest: 'dropship' } },   // 드랍십 편대(2026-10-22 행님: 지하철은 수송선)
    buses: { look: 'siegeTank' },   // 시즈 탱크(2026-10-22 행님)
    me: { look: 'scv' },   // 내 위치: SCV
  },
};
export const ZERG = {
  id: 'zerg',
  from: 'simcity',
  label: '저그',
  settings: {
    city: { pack: ZERG_DELTA, groundTexture: true },   // 살덩이 건물, 땅은 크립(얼룩 질감)
    trains: { look: 'units', units: { lead: 'overlord', rest: 'overlord' } },   // 오버로드 떼
    buses: { look: 'ultralisk' },   // 울트라리스크(2026-10-22 행님)
    me: { look: 'drone' },   // 내 위치: 드론
  },
};
export const PROTOSS = {
  id: 'protoss',
  from: 'simcity',
  label: '프로토스',
  settings: {
    city: { pack: PROTOSS_DELTA },   // 금빛 외벽 · 청록 수정
    trains: { look: 'units', units: { lead: 'shuttle', rest: 'shuttle' } },   // 셔틀 편대
    buses: { look: 'dragoon' },   // 드라군
    me: { look: 'probe' },   // 내 위치: 프로브
  },
};
export default [TERRAN, ZERG, PROTOSS];   // (고르는 줄의 차례 · 종족 id 목록은 transition.mjs STARCRAFT)
