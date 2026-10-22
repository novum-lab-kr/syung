// 조선 모드: 심시티와 같은 도시를 조선 팩으로(흙바닥 · 기와집 · 수로 · 거북선 · 가마). 다른 것만 적는다 — 설정 키는 4단계 커밋마다 옮겨 온다.
import { JOSEON_DELTA } from './style.mjs';

export default {
  id: 'joseon',
  from: 'simcity',
  label: '조선',
  settings: {
    city: { pack: JOSEON_DELTA, groundTexture: true, life: { cars: false, crossings: false }, landmarks: 'wood-tower' },   // 도시 팩에서 조선만 다른 것(흙바닥 · 한옥 · 수로 …), 흙 질감, 차 · 횡단보도 없음, 나무 탑
    map: { exitLook: 'jangseung' },   // 출구 표지: 장승(관모에 노선색 띠, 몸통에 출구 번호) + 양쪽 횃불(2026-10-11 행님)
    trains: { look: 'fleet' },
    me: { look: 'seonbi' },   // 내 위치: 갓 쓴 꼬마 선비(2026-10-22 행님)
    buses: { look: 'palanquin' },   // 버스 대신 가마   // 열차 대신 배 선단(맨 앞 거북선)
    sun: { lowHouseM: 5 },   // 기와집 그림자(처마 · 지붕, 용마루 조금 아래). 한옥 고층 · 목탑은 실제 높이
  },
};
