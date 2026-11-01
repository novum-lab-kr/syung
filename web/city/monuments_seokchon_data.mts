// 석촌동 고분군 자료 — OSM 에서 받은 자료를 정수로 줄여 둔 것(손으로 고치지 않는다 · 만든 곳: 시안 폴더 tombs/gen_tombs.mjs).
// 좌표는 (경도 − 127.1) × 1e6 · (위도 − 37.5) × 1e6 짝(원점 SKC_ORIGIN — monuments_data.mts). 출처: © OpenStreetMap contributors (ODbL).
// 고분 윤곽(OSM historic=tomb 석촌동 제2 · 3 · 4호분)
export const SKC_TOMBS:{ id:number; name:string; p:number[] }[] = [
  { id: 1108083866, name: "석촌동 제3호분", p: [1883,3947,1893,3490,2469,3498,2459,3955] },
  { id: 1108083868, name: "석촌동 제4호분", p: [2017,3087,2214,3099,2230,2941,2033,2929] },
  { id: 1201143817, name: "석촌동 제2호분", p: [2238,2611,2420,2556,2351,2413,2169,2468] },
];
