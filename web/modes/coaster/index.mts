// 롤러코스터 모드: 심시티 도시 위 공원(언덕 선로 · 88열차 · 놀이기구 · 1인칭). 다른 것만 적는다 — 설정 키는 4단계 커밋마다 옮겨 온다.
export default {
  id: 'coaster',
  from: 'simcity',
  label: '롤러코스터',
  settings: {
    map: { paletteKind: 'park-city', verticalGradient: false },   // 파스텔 공원 색, 건물은 고른 색(고층 · 랜드마크는 심시티 그대로 — 놀이기구는 공원 안, 2026-10-11 행님)
    city: { xray: false, tone: 'coaster', lampPool: null },   // 공원에서는 건물을 유리로 안 바꾸고, 차분한 공원 톤(팩 modes.coaster)
    track: { kind: 'coaster' },   // 언덕 길(승강장은 기본 · 심시티처럼 선로를 따라)
    trains: { look: 'coaster88', predictStops: 99, timeWarp: true },   // 88열차 칸, 다음 자료까지 계속 달리고, 배속
    park: { enabled: true,   // 공원 켜기(자료는 기본 모드 park.style)
      // 랜드마크 대관람차(2026-10-11 행님: 롤코에 관람차 랜드마크처럼 엄청 큰 거 하나): 상암 하늘공원 — 서울시가 지름 180 m 대관람차 '서울링'을 세우려는 자리
      landmarkRides: [{ kind: 'ferris', lngLat: [126.8853, 37.5682], diameterM: 180, yawDeg: 20 }] },
    me: { look: 'visitor' },   // 내 위치: 풍선 든 놀이공원 아이(2026-10-22 행님)
    sun: { light: 'park' },   // 공원의 따뜻한 빛(밤에 푸른 기 없이)
  },
};
