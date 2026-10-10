// 기본 모드: 모든 설정의 원본. 다른 모드는 여기서 다른 것만 적는다(web/modes/<모드>/index.mjs, from 을 안 적으면 basic).
// 데이터뿐: 큰 자료는 옆 파일(palette …)에 두고 여기서 모은다. 엔진 함수 · DOM · 클래스는 넣지 않는다.
// (옆 파일은 본체도 직접 import 한다: 자식만 부르는 import 는 첫 화면 요청을 한 단계 늦춘다)
import { MAP_THEMES, MAP_COLORS, PARK_COLORS } from './palette.mjs';
import CITY_PACK from './city.mjs';
import PARK_DEFAULTS from './park.mjs';

export default {
  id: 'basic',
  label: '기본',
  settings: {
    themeChoice: 'auto',   // 내 설정(테마): auto · light · dark — 저장 이름 subway-theme
    mapColor: 'calm',      // 내 설정(지도 색): calm · color — 저장 이름 subway-map-color
    // 지도 색: 테마별 바탕 · '컬러' 덧칠 · 공원(롤코). paletteKind 는 섞는 차례 — base(바탕만) · city(+도시 땅) · park-city(+공원 색 · 도시 땅)
    // towersAsRides: park.towerM 이상 건물을 지도 · 도시 · 그림자에서 빼고 놀이기구로. verticalGradient: 지도 3D 건물 위아래 명암
    map: { themes: MAP_THEMES, colors: MAP_COLORS, park: PARK_COLORS, paletteKind: 'base', towersAsRides: false, verticalGradient: true },
    // 미니어처 도시(색 · 치수 · 줌 팩): 심시티 · 롤코는 이 팩 그대로(같은 참조), 조선은 덧쓴다. groundTexture: 땅에 흙 질감(팩의 ground.texture)
    city: { enabled: false, groundTexture: false, pack: CITY_PACK },
    // 공원(롤코): 꺼 둔 기본 — 선로 · 역 · 놀이기구 · 밤 · 1인칭 자료, towerM 이상 건물은 놀이기구
    park: { enabled: false, towerM: 150, style: PARK_DEFAULTS },
    // 해: light 는 지도 빛(map: 해 따라 · park: 공원의 따뜻한 빛 PARK_COLORS), lowHouseM 은 그 팩의 hanok.tall.towerMinH 보다 낮은 건물 그림자 높이(m, 없으면 실제 높이)
    sun: { light: 'map', lowHouseM: null },
  },
};
