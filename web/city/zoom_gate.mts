// 도시 건물과 문화유산 모델이 같이 쓰는 "보이는 줌 · 서서히 자라기 · 폰의 먼 곳 줄이기" 셈(한 곳에서만 정한다).
// 도시 엔진(buildings.mts)과 문화유산(monuments.mts)이 모두 여기서 읽으니, 어느 쪽 기준을 고쳐도 둘이 어긋나 비거나 겹치지 않는다.
// 잎 모듈(다른 import 없음) — 첫 화면 import 깊이를 늘리지 않는다.
export const smoothstep = (from:number, to:number, x:number):number => { const t = Math.max(0, Math.min(1, (x - from) / (to - from))); return t * t * (3 - 2 * t) };
export const GROW_ZOOM_SPAN = .6;   // 문턱에서 이만큼 더 확대하는 동안 높이가 0 → 전체로 자란다
// 이 줌보다 멀면 그리지 않는다(휴대폰은 조금 늦게 — 먼 곳 줄이기가 가볍게 해 준다)
export const cityMinZoom = (phone:boolean):number => phone ? 14.5 : 14;
// 줌에 따른 높이 비율(0 = 문턱 아래 · 1 = 전체)
export const cityGrow = (phone:boolean, zoom:number):number => smoothstep(cityMinZoom(phone), cityMinZoom(phone) + GROW_ZOOM_SPAN, zoom);
// 휴대폰: 화면 가운데에서 이 거리(m)보다 멀면 땅 속으로 가라앉다 사라진다 — [시작, 끝]
export const cityFarLimit = (zoom:number):[number, number] => { const end = Math.min(2600, 1200 * 2 ** ((zoom - 15) * .5)); return [end * .7, end] };
// 가운데에서 distM 떨어진 것의 남은 비율(1 = 그대로 · 0 = 제외)
export const cityFarFade = (distM:number, zoom:number):number => { const [from, to] = cityFarLimit(zoom); return 1 - smoothstep(from, to, distM) };
