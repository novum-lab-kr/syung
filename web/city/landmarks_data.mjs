// 랜드마크: 지도 데이터의 조각 건물로는 모양이 안 나오는 건물을 전용 모델(web/city/landmarks.mjs)로 그린다.
// 이 파일은 데이터만 둔다(일꾼 스레드의 city_mesh 도 읽는다: 그 자리 조각 건물을 빼려고).
//
// 롯데월드타워(555 m, KPF): 모서리가 둥근 사각 평면, 위로 갈수록 볼록하게 가늘어진다. 구 도심(북서)을 향한 솔기가
// 북서 · 남동 두 모서리를 따라 위아래로 이어지고, 꼭대기는 그 솔기 선에서 두 갈래('귀')로 갈라진다.
// 치수는 OpenFreeMap z14 의 building:part 외곽(바닥부터 겹친 조각 147 · 154 · 183 · 290 · 312 · 392 · 432 · 440 · 520 · 555 m)에서
// 잰 반대각선(솔기 방향 r, 다른 방향 r × k)이다 (2026-10-09). 참고: https://www.kpf.com/project/lotte-world-tower
export const LANDMARKS = [
  {
    id: 'lotte', name: '롯데월드타워', lngLat: [127.102655, 37.51254],
    hide: { radiusM: 48, minH: 140 },   // 이 반경 안에 중심이 있고 이 높이 이상인 조각 건물은 그리지 않는다
    seamDeg: 158,                        // 솔기 모서리 방향(동쪽 0°, 반시계): 북서 — 반대쪽(남동) 모서리에도 솔기
    // [높이 m, 솔기 방향 반대각선 m, 다른 방향 비]
    profile: [[0, 45, .89], [147, 43, .9], [183, 41, .92], [290, 32, .97], [392, 22, 1], [440, 18.5, 1], [500, 15, 1], [555, 13, 1]],
    roundness: 1.3,                      // 평면 초타원 지수(1 마름모 … 2 타원): 볼록한 면, 솔기 모서리는 뾰족하게
    seam: { widthM: 2.6, depthM: 1.3 },  // 솔기 홈(너무 깊으면 몸통이 갈라져 보인다: Codex 검토)
    crown: { splitM: 465, gapTopM: 12, latticeFromM: 450 },   // 이 높이부터 두 갈래, 꼭대기에서 틈 12 m(실제보다 넓게: 멀리서도 갈라진 게 보이게)
    height: 555,
  },
];

// 석탑(조선 모드, 2026-10-11 행님 — 잠실 롯데 자리는 석탑 대신 더 조선스러운 목탑으로 되돌림): 원각사지 십층석탑(탑골공원, 1467, 대리석 약 12 m — 亞자 기단 3단 · 아래 세 층 亞자 · 위 일곱 층 네모)과
// 불국사 삼층석탑(석가탑, 약 10.8 m — 2단 기단 · 세 층, 층급받침 지붕돌). looks: 그리는 랜드마크 모양(모드 설정 city.landmarks).
// replaces: 이 모양일 때 그 자리 탑 모델(LANDMARKS id)을 대신한다. 남산타워는 지도 건물이라 조선 팩 landmarkHide 가 그 조각을 뺀다.
// minPx: 실제 크기면 너무 작을 때 화면에서 이만큼은 보이게 키운다(탑골공원 12 m). widthMul: 거대한 탑은 가로를 줄여 날씬하게(그대로 키우면 기단이 260 m).
export const STUPAS = [
  { id: 'namsan-stupa', kind: 'seokga', lngLat: [126.988227, 37.551169], height: 240, widthMul: .65, looks: ['wood-tower'], yawDeg: 0 },
  { id: 'wongaksa', kind: 'wongaksa', lngLat: [126.98826, 37.57107], height: 12, looks: ['wood-tower'], minPx: 30, yawDeg: 0 },
];

const mercX = lng => (lng + 180) / 360;
const mercY = lat => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2;
export const landmarkMerc = L => [mercX(L.lngLat[0]), mercY(L.lngLat[1])];
