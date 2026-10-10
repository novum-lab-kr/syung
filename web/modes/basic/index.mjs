// 기본 모드: 모든 설정의 원본. 다른 모드는 여기서 다른 것만 적는다(web/modes/<모드>/index.mjs, from 을 안 적으면 basic).
// 데이터뿐: 큰 자료는 옆 파일(palette …)에 두고 여기서 모은다. 엔진 함수 · DOM · 클래스는 넣지 않는다.
// (옆 파일은 본체도 직접 import 한다: 자식만 부르는 import 는 첫 화면 요청을 한 단계 늦춘다)
import { MAP_THEMES, MAP_COLORS, PARK_COLORS } from './palette.mjs';

export default {
  id: 'basic',
  label: '기본',
  settings: {
    themeChoice: 'auto',   // 내 설정(테마): auto · light · dark — 저장 이름 subway-theme
    mapColor: 'calm',      // 내 설정(지도 색): calm · color — 저장 이름 subway-map-color
    map: { themes: MAP_THEMES, colors: MAP_COLORS, park: PARK_COLORS },   // 지도 색: 테마별 바탕 · '컬러' 덧칠 · 공원(롤코)
  },
};
