// 심시티 모드: 기본 위에 미니어처 도시(고가 · 건물 · x-ray). 다른 것만 적는다 — 설정 키는 4단계 커밋마다 옮겨 온다.
export default {
  id: 'simcity',
  from: 'basic',
  label: '심시티',
  settings: {
    map: { paletteKind: 'city' },   // 지도 색 위에 도시 땅 색
    city: { enabled: true, xray: true },   // 역 · 열차를 가린 건물은 유리로
    track: { kind: 'viaduct' },   // 고가 위(승강장은 기본처럼 선로를 따라 휘는 띠 — 2026-10-11 행님 '기본 베이스에 맞춰져야')
    trains: { body: 'slim' },   // 고가 상판 폭에 맞춘 가는 몸
  },
};
