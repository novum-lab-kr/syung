// 문화역서울 284 안 건물 자리 — OSM 에서 받은 자료를 정수로 줄여 둔 것(손으로 고치지 않는다).
// 좌표는 (경도 − 126.97) × 1e6 · (위도 − 37.55) × 1e6 짝(원점 S2_ORIGIN — monuments_data.mts). 건물: 문화역서울 284 둘레 안에 중심이 든 OSM building — 이름이 없는 것은 ''. h: OSM height(m · 없으면 0) · lv: building:levels(없으면 0).
// 출처: © OpenStreetMap contributors (ODbL).
export const S2_BUILDINGS:{ id:number; name:string; h:number; lv:number; p:number[] }[] = [
  { id: 759569673, name: "문화역서울284", h: 0.0, lv: 3.0, p: [1446,6612,1446,6211,1462,5406,1462,5367,1619,5366,1619,5406,1636,5416,1705,5415,1707,5476,1620,5474,1619,5553,1675,5551,1675,5636,1631,5639,1632,5762,1649,5769,1656,5786,1723,5788,1722,5776,1764,5777,1767,5974,1722,5976,1721,5968,1660,5970,1649,5988,1632,5996,1636,6113,1675,6114,1700,6130,1696,6212,1604,6212,1603,6394,1624,6394,1624,6500,1584,6501,1581,6614] },
];
// 담 · 울타리(OSM barrier). kind: wall · retaining_wall · fence · city_wall. h: OSM height(m · 없으면 0).
export const S2_WALLS:{ kind:string; h:number; p:number[] }[] = [
];
