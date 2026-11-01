// 정릉(신덕왕후) 자료 — OSM 에서 받은 자료를 정수로 줄여 둔 것(손으로 고치지 않는다 · 만든 곳: 시안 폴더 tombs/gen_tombs.mjs).
// 좌표는 (경도 − 127) × 1e6 · (위도 − 37.6) × 1e6 짝(원점 JNG_ORIGIN — monuments_data.mts). 출처: © OpenStreetMap contributors (ODbL).
// 건물: 구역 둘레 안의 옛 건물(정자각 · 비각 · 수복방 · 재실 …) — 관리사무소 · 전시관 같은 새 건물은 뺐다(지도 그대로). 이름 없는 것은 ''.
export const JNG_BUILDINGS:{ id:number; name:string; p:number[] }[] = [
  { id: 345546536, name: "정릉 정자각", p: [6214,2321,6265,2182,6351,2202,6337,2241,6446,2266,6425,2324,6314,2298,6298,2341] },
];
// 봉분 윤곽(OSM historic=tomb — 호석을 두른 둥근 윤곽)
export const JNG_TOMBS:{ id:number; name:string; p:number[] }[] = [
  { id: 345476687, name: "신덕왕후릉", p: [5561,2154,5576,2131,5607,2123,5636,2134,5646,2158,5632,2181,5601,2190,5572,2178] },
];
// 곡장(OSM barrier=wall — 봉분 뒤를 감싸는 낮은 담)
export const JNG_WALLS:number[][] = [
  [5648,2251,5518,2199,5511,2149,5546,2104,5586,2081,5673,2111],
];
// 봉분이 앉은 둔덕(OSM man_made=embankment 중 닫힌 것)
export const JNG_BANKS:number[][] = [

];
