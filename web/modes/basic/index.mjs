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
    // verticalGradient: 지도 3D 건물 위아래 명암
    map: { themes: MAP_THEMES, colors: MAP_COLORS, park: PARK_COLORS, paletteKind: 'base', verticalGradient: true, exitLook: 'pillar',
      // pixel: 도트(레트로) — 지도 · 열차 캔버스를 size CSS px 한 칸의 도트로, palette 색표(none · endesga32), outline 앞 물체 가장자리 먹선. 역 이름표는 선명하게
      pixel: { enabled: false, size: 3, palette: 'endesga32', outline: true },
      fov: null },   // fov: 카메라 세로 시야각(도) — null 이면 MapLibre 기본, 작을수록 원근이 없어 아이소메트릭에 가깝다(레트로)   // exitLook: 출구 표지 — pillar(노선색 기둥) · jangseung(장승 + 양쪽 횃불, 조선)
    // 미니어처 도시(색 · 치수 · 줌 팩): 심시티 · 롤코는 이 팩 그대로(같은 참조), 조선은 덧쓴다. groundTexture: 땅에 흙 질감(팩의 ground.texture)
    // xray: 역 · 열차를 가린 건물을 유리로(치수는 팩의 xray)
    // tone: 팩의 modes 항목 이름(땅 · 건물 · 사람의 채도 · 밝기 · 그림자), lampPool: 가로등 빛 웅덩이 배수(null 이면 그 tone 의 lampPool)
    // life: 도시 생활(차 · 횡단보도), landmarks: 랜드마크 탑 모양(tower · wood-tower)
    city: { enabled: false, groundTexture: false, xray: false, tone: 'simcity', lampPool: 1.4, life: { cars: true, crossings: true }, landmarks: 'tower', pack: CITY_PACK },
    // 공원(롤코): 꺼 둔 기본 — 선로 · 역 · 놀이기구 · 밤 · 1인칭 자료. 놀이기구는 towerM 이상 탑마다 하나, 그 둘레 공원 안 빈 자리에(건물은 그대로)
    park: { enabled: false, towerM: 150, style: PARK_DEFAULTS, landmarkRides: [] },   // landmarkRides: 늘 그 자리에 서는 큰 놀이기구 [{kind:'ferris', lngLat:[경도, 위도], diameterM, yawDeg?}]
    // 선로: kind 는 노선 · 열차가 달리는 길 — ground(땅 위 노선, 도로 맞춤 · 공유 선로 칸은 경로 안), viaduct(심시티 고가 위, 공유 선로 칸은 옆으로 벌림),
    // coaster(롤코 언덕 길). platform 은 승강장 모양 — ribbon(노선을 따라 휘는 띠, 모든 모드), straight(선로에 맞춘 곧은 상자, 지금 쓰는 모드 없음)
    track: { kind: 'ground', platform: 'ribbon' },
    // 열차: look 은 모양 — commuter(전동차) · fleet(배 선단, 맨 앞 거북선) · coaster88(88열차 칸) · units(스타크래프트 유닛 행렬), body 는 굵기 — wide(지도 위) · slim(고가 · 공원),
    // predictStops 는 새 자료 없이 미리 달려 갈 정차 역 수, timeWarp 는 배속으로 앞서 달리기(롤코 배속 버튼)
    // units: look 이 units(스타크래프트 유닛 행렬)일 때 맨 앞 · 뒤 유닛 모양 이름(web/modes/starcraft/unit_shapes.mjs)
    trains: { look: 'commuter', body: 'wide', predictStops: 3, timeWarp: false, units: { lead: 'siegeTank', rest: 'siegeTank' } },
    // 버스: look 은 모양 — bus · palanquin(가마) · siegeTank · ultralisk · dragoon(스타크래프트 유닛)
    buses: { look: 'bus' },
    // 내 위치 캐릭터(줌 15 부터 노란 점 대신, web/map/avatars/): sprout(새싹 볼빵 후디) · builder(꼬마 건설 반장) · seonbi(꼬마 선비) · visitor(놀이공원 아이) · scv · drone · probe(스타크래프트 종족 일꾼)
    me: { look: 'sprout' },
    // 해: light 는 지도 빛(map: 해 따라 · park: 공원의 따뜻한 빛 PARK_COLORS), lowHouseM 은 그 팩의 hanok.tall.towerMinH 보다 낮은 건물 그림자 높이(m, 없으면 실제 높이)
    sun: { light: 'map', lowHouseM: null },
  },
};
