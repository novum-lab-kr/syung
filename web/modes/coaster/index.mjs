// 롤러코스터 모드: 심시티 도시 위 공원(언덕 선로 · 88열차 · 놀이기구 · 1인칭). 다른 것만 적는다 — 설정 키는 4단계 커밋마다 옮겨 온다.
export default {
  id: 'coaster',
  from: 'simcity',
  label: '롤러코스터',
  settings: {
    map: { paletteKind: 'park-city', towersAsRides: true, verticalGradient: false },   // 파스텔 공원 색, 고층은 놀이기구, 건물은 고른 색
    track: { kind: 'coaster' },   // 언덕 길(승강장은 심시티처럼 곧게)
    trains: { look: 'coaster88', predictStops: 99, timeWarp: true },   // 88열차 칸, 다음 자료까지 계속 달리고, 배속
    park: { enabled: true },   // 공원 켜기(자료는 기본 모드 park.style)
    sun: { light: 'park' },   // 공원의 따뜻한 빛(밤에 푸른 기 없이)
  },
};
