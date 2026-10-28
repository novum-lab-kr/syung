// 레트로 모드: 심시티 도시를 도트로 — 아이소메트릭 거리(빽빽한 차 · 사람 · 나무, 검은 윤곽) + 16비트 RPG 마을(잔디 · 기와지붕 · 따뜻한 색).
// 다른 것만 적는다: 도트(map.pixel — 지도 · 열차 캔버스를 큰 도트 + 색표 · 먹선), 도시 팩(잔디 · 아스팔트 · 따뜻한 벽 · 기와 경사 지붕 — style.mts)
// 시야각을 좁혀(map.fov 12°) 원근이 거의 없는 아이소메트릭 시점, 켤 때 45° 대각선으로 돌린다(본체). 나무 · 차도 팩에서 빽빽하게(행님 2026-10-22, 시안 look3d '레트로').
import { RETRO_DELTA } from './style.mts';
export default {
  id: 'retro',
  from: 'simcity',
  label: '레트로',
  settings: {
    map: { pixel: { enabled: true }, fov: 12 },   // 지도 · 열차를 큰 도트로(크기 · 팔레트 · 윤곽은 기본 모드 map.pixel), 좁은 시야각
    city: { pack: RETRO_DELTA },   // 16비트 마을 색 · 경사 지붕
  },
};
