// 스타크래프트 모드: 심시티 도시 위에서 종족(테란 · 저그 · 프로토스)을 골라 논다. 종족마다 모드 하나(같은 심시티 도시 · 고가),
// 다른 것만 적는다: 도시 팩(건물 · 땅 · 길 · 고가 색 — style.mts), 지하철은 수송선 편대(trains.units — 맨 앞 lead + 뒤 rest, 고가 위에 떠서), 버스는 유닛 한 마리,
// 내 위치는 그 종족 일꾼. 유닛 모양은 unit_shapes.mjs(Codex 시안). 사람 · 차 · 하늘 유닛은 다음 단계(행님 2026-10-22).
import { TERRAN_DELTA, ZERG_DELTA, PROTOSS_DELTA } from './style.mts';

export const TERRAN = {
  id: 'terran',
  from: 'simcity',
  label: '테란',
  settings: {
    city: { pack: TERRAN_DELTA, life: { units: { people: ['marine', 'marine', 'firebat', 'medic', 'ghost'], cars: ['vulture', 'goliath'] } } },   // 강철 기지, 사람 · 차 대신 보병 · 벌처 · 골리앗
    trains: { look: 'units', units: { lead: 'dropship', rest: 'dropship' } },   // 드랍십 편대(2026-10-22 행님: 지하철은 수송선)
    buses: { look: 'siegeTank' },   // 시즈 탱크(2026-10-22 행님)
    sky: { units: ['wraith', 'wraith', 'battlecruiser', 'scienceVessel', 'valkyrie'] },   // 하늘: 레이스 · 배틀크루저 · 사이언스 베슬 · 발키리
    me: { look: 'scv' },   // 내 위치: SCV
  },
};
export const ZERG = {
  id: 'zerg',
  from: 'simcity',
  label: '저그',
  settings: {
    city: { pack: ZERG_DELTA, groundTexture: true, life: { units: { people: ['zergling', 'zergling', 'hydralisk'], cars: ['lurker', 'defiler'] } } },   // 황무지 흙 위 크립 건물, 사람 · 차 대신 저글링 · 히드라 · 러커 · 디파일러
    trains: { look: 'units', units: { lead: 'overlord', rest: 'overlord' } },   // 오버로드 떼
    buses: { look: 'ultralisk' },   // 울트라리스크(2026-10-22 행님)
    sky: { units: ['mutalisk', 'mutalisk', 'guardian', 'scourge', 'devourer'] },   // 하늘: 뮤탈리스크 · 가디언 · 스커지 · 디바우러
    me: { look: 'drone' },   // 내 위치: 드론
  },
};
export const PROTOSS = {
  id: 'protoss',
  from: 'simcity',
  label: '프로토스',
  settings: {
    city: { pack: PROTOSS_DELTA, life: { units: { people: ['zealot', 'zealot', 'highTemplar', 'darkTemplar'], cars: ['dragoon', 'archon'] } } },   // 사막 위 금빛 건물, 사람 · 차 대신 질럿 · 템플러 · 드라군 · 아콘(리버는 버스라 차에서 뺌 — 행님 2026-10-22: 겹친다)
    trains: { look: 'units', units: { lead: 'shuttle', rest: 'shuttle' } },   // 셔틀 편대
    buses: { look: 'reaver' },   // 리버(행님 2026-10-22)
    sky: { units: ['scout', 'carrier', 'corsair', 'corsair', 'arbiter'] },   // 하늘: 스카우트 · 캐리어 · 커세어 · 아비터
    me: { look: 'probe' },   // 내 위치: 프로브
  },
};
export default [TERRAN, ZERG, PROTOSS];   // (고르는 줄의 차례 · 종족 id 목록은 transition.mjs STARCRAFT)
