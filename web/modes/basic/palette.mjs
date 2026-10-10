// 기본 지도 색(모든 모드의 원본): 밝은 · 어두운 테마, 지도 색 '컬러' 덧칠, 롤코 공원 색. 데이터뿐 — 섞는 식은 web/map/theme.mjs.
// (web/map/theme.mjs 에서 그대로 옮김: 값 · 키 차례 같음)
// 자동 (default): light from sunrise to sunset in Seoul, dark at night; 라이트 / 다크: fixed by the viewer.
export const MAP_THEMES={
  light:{bld3d:'#d9dde0',bld3dOpacity:.5,bg:'#edf2f1',water:'#cfe0e8',park:'#dde8da',land:'#e1eadf',bld:'#dfe4e6',roadMinor:'#ffffff',roadMajor:'#ffffff',rail:'#c3cbcf',
         text:'#56656a',road:'#7a8589',waterText:'#5d8aa3',parkText:'#5f8a5a',poi:'#8a7f6d',halo:'rgba(255,255,255,.9)',stationText:'#141414'},
  dark:{bld3d:'#3a4a53',bld3dOpacity:.78,bg:'#10181c',water:'#16293a',park:'#15241c',land:'#15211b',bld:'#1c262b',roadMinor:'#243238',roadMajor:'#2f3f47',rail:'#35454d',
        text:'#9aabb1',road:'#7f9096',waterText:'#6f9bb5',parkText:'#6e9a69',poi:'#a59a86',halo:'rgba(12,19,23,.9)',stationText:'#eef3f4'},
};
// 지도 색 (settings): 차분 keeps the quiet greys above; 컬러 paints water, green, roads and buildings over them
export const MAP_COLORS={
  light:{water:'#7cbfe8',park:'#9dd487',land:'#b3daa0',bld:'#e5dac8',bld3d:'#ddd0bb',bld3dOpacity:.6,bg:'#eeeadc',roadMinor:'#ffffff',roadMajor:'#ffffff',rail:'#b9b2c8',waterText:'#2f78a8',parkText:'#3f8a3a'},
  dark:{water:'#1a4260',park:'#21452c',land:'#1e3a28',bld:'#262d38',bld3d:'#444a5c',bld3dOpacity:.78,bg:'#141c24',roadMinor:'#2a343c',roadMajor:'#3e4650',rail:'#4a4560',waterText:'#7fb4d8',parkText:'#7cbf74'},
};
// 롤러코스터: the city as a pastel amusement park (Codex design) — every building one of six pastels by its feature id, solid
// (just for fun: a building may hide a train), the ground in park colours (차분: 15 % toward the background). The towers
// (RIDE_H m and up) become rides.
export const PARK_COLORS={
  light:{blocks:['#eacb80','#e5ae91','#dca2b9','#baaad8','#96c5d8','#abd0ae'],bg:'#f5eedf',park:'#c5ddb3',land:'#d8e4c6',water:'#afd5de',bld:'#dfd2c0',shadow:.06,light:'#ffffff',lightK:.35},
  dark:{blocks:['#ad9159','#ab7864','#a46c89','#8977ad','#6597ad','#789d7d'],bg:'#242329',park:'#354a39',land:'#303d32',water:'#2b4c5b',bld:'#3b343e',shadow:.03,light:'#fff1de',lightK:.25},
};
