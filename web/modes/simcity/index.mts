// 심시티 모드: 기본 위에 미니어처 도시(고가 · 건물 · x-ray). 다른 것만 적는다 — 설정 키는 4단계 커밋마다 옮겨 온다.
export default {
  id: 'simcity',
  from: 'basic',
  label: '심시티',
  settings: {
    map: { paletteKind: 'city' },   // 지도 색 위에 도시 땅 색
    city: { enabled: true, xray: true, heritage: true },   // heritage: 문화유산 모델(광화문 · 궁 · 동상)을 넣는 모드 — 나라 모드는 끈다   // 역 · 열차를 가린 건물은 유리로
    track: { kind: 'viaduct' },   // 고가 위(승강장은 기본처럼 선로를 따라 휘는 띠 — 2026-10-11 행님 '기본 베이스에 맞춰져야')
    trains: { body: 'slim' },   // 고가 상판 폭에 맞춘 가는 몸
    me: { look: 'builder' },   // 내 위치: 안전모 쓴 꼬마 건설 반장(2026-10-22 행님: 모드마다 다른 캐릭터)
  },
};
