// 스타크래프트 모드: 심시티 도시 위에서 종족(테란 · 저그 · 프로토스)을 골라 논다. 종족마다 모드 하나(같은 심시티 도시 · 고가),
// 다른 것만 적는다 — 1단계는 내 위치 캐릭터(그 종족 일꾼)만. 건물 · 사람 · 차 · 하늘 유닛은 단계마다 더한다(행님 2026-10-22).

export const TERRAN = {
  id: 'terran',
  from: 'simcity',
  label: '테란',
  settings: {
    me: { look: 'scv' },   // 내 위치: SCV
  },
};
export const ZERG = {
  id: 'zerg',
  from: 'simcity',
  label: '저그',
  settings: {
    me: { look: 'drone' },   // 내 위치: 드론
  },
};
export const PROTOSS = {
  id: 'protoss',
  from: 'simcity',
  label: '프로토스',
  settings: {
    me: { look: 'probe' },   // 내 위치: 프로브
  },
};
export default [TERRAN, ZERG, PROTOSS];   // (고르는 줄의 차례 · 종족 id 목록은 transition.mjs STARCRAFT)
