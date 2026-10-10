// 심시티 모드: 기본 위에 미니어처 도시(고가 · 건물 · x-ray). 다른 것만 적는다 — 설정 키는 4단계 커밋마다 옮겨 온다.
export default {
  id: 'simcity',
  from: 'basic',
  label: '심시티',
  settings: {
    map: { paletteKind: 'city' },   // 지도 색 위에 도시 땅 색
    city: { enabled: true },
    track: { kind: 'viaduct', platform: 'straight' },   // 고가 위, 곧은 승강장
    trains: { body: 'slim' },   // 고가 상판 폭에 맞춘 가는 몸
  },
};
