// 조계사 안 건물 자리 — OSM 에서 받은 자료를 정수로 줄여 둔 것(손으로 고치지 않는다).
// 좌표는 (경도 − 126.98) × 1e6 · (위도 − 37.57) × 1e6 짝(원점 JG_ORIGIN — monuments_data.mts). 건물: 조계사 둘레 안에 중심이 든 OSM building — 이름이 없는 것은 ''. h: OSM height(m · 없으면 0) · lv: building:levels(없으면 0).
// 출처: © OpenStreetMap contributors (ODbL).
export const JG_BUILDINGS:{ id:number; name:string; h:number; lv:number; p:number[] }[] = [
  { id: 432721256, name: "대웅전", h: 0.0, lv: 0.0, p: [1631,4014,1645,3783,2084,3800,2070,4031] },
  { id: 446665397, name: "", h: 0.0, lv: 4.0, p: [2217,3717,2567,3758,2583,3675,2233,3634] },
  { id: 446665399, name: "조계사 대설법전", h: 0.0, lv: 0.0, p: [1597,4009,1515,3682,1357,3712,1444,4035] },
  { id: 446665401, name: "일주문", h: 0.0, lv: 0.0, p: [2576,3937,2697,3942,2709,3766,2587,3761] },
  { id: 471351367, name: "한국불교역사문화기념관", h: 0.0, lv: 5.0, p: [1917,4772,1910,4790,1775,4776,1771,4750,1493,4134,1804,4139,1799,4349,2138,4358,2130,4469,2231,4477,2224,4570,2109,4564,2093,4776] },
  { id: 1556525671, name: "", h: 0.0, lv: 0.0, p: [1359,3684,1329,3572,1457,3551,1487,3663] },
];
// 담 · 울타리(OSM barrier). kind: wall · retaining_wall · fence · city_wall. h: OSM height(m · 없으면 0).
export const JG_WALLS:{ kind:string; h:number; p:number[] }[] = [
];
