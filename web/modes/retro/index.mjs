// 레트로 모드: 심시티 도시를 도트로 — 아이소메트릭 거리(빽빽한 차 · 사람 · 나무, 검은 윤곽) + 16비트 RPG 마을(잔디 · 기와지붕 · 따뜻한 색).
// 다른 것만 적는다. 1단계는 모드 뼈대와 도트 설정(map.pixel)만 — 도트 그리기 · 팔레트 · 도시 팩은 단계마다 더한다(행님 2026-10-22, 시안 look3d '레트로').
export default {
  id: 'retro',
  from: 'simcity',
  label: '레트로',
  settings: {
    map: { pixel: { enabled: true } },   // 지도 · 열차를 큰 도트로(크기 · 팔레트 · 윤곽은 기본 모드 map.pixel)
  },
};
