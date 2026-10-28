// 롤코 공원 치수 계산(줌 → 픽셀 굵기, 줌 사이 흐려짐, 침목 격자, 놀이기구 색 차례). 자료는 기본 공원 자료(web/modes/basic/park.mts).
// (옛 web/lib/coaster_style_seoul.mjs 에서 그대로 옮김)
import { PARK_DEFAULTS } from '../basic/park.mts';

export const clamp = (v:number, lo:number, hi:number) => Math.max(lo, Math.min(hi, v));
export function zoomFade(zoom:number, range:readonly number[]) { const t=clamp((zoom-range[0]!)/(range[1]!-range[0]!),0,1); return t*t*(3-2*t); }
export const metresPerPixel = (zoom:number, lat=37.55) => 40075016.685578488*Math.cos(lat*Math.PI/180)/(512*2**zoom);
// 공원 자료 모양(기본 공원 자료 그대로)
export type ParkPack = typeof PARK_DEFAULTS;
export function trackMetrics(zoom:number, lat=37.55, pack:ParkPack=PARK_DEFAULTS) {
  // 픽셀 범위(멀리서 보이는 하한 · 가늘게 두는 상한)는 줌 18까지 그대로, 그 위로는 줌 19.5까지 실제 굵기로 넘어간다.
  // 상한에 묶이면 줌 20에서 기둥(1.25 m)이 2.8 px 막대 · 레일이 1.7 px 선이 되어 납작해 보였다(2026-10-10 행님 "네모 색 끝").
  const mpp=metresPerPixel(zoom,lat), T=pack.track, S=pack.supports, real=clamp((zoom-18)/1.5,0,1), px=(m:number,range:number[])=>Math.max(clamp(m/mpp,...(range as [number,number])),m/mpp*real);
  return { mpp, rail:px(T.railDiameterM,T.railDiameterPx), spineWidth:px(T.spineWidthM,T.spineWidthPx),
    spineDepth:px(T.spineDepthM,T.spineDepthPx), girder:px(T.girderDepthM,T.girderDepthPx), tie:px(T.tieThicknessM,T.tieThicknessPx), post:px(S.diameterM,S.diameterPx) };
}
// A half-open edge grid: neighbouring chunks own each tie once; LOD only drops stable indices.
export function distanceGrid(startM:number, endM:number, everyM:number, stride=1) {
  const out:number[]=[], step=everyM*Math.max(1,stride);
  for(let i=Math.ceil((startM-1e-8)/step);i*step<endM-1e-8;i++)out.push(i*step);
  return out;
}
export function ridePalette(dark=false, pack:ParkPack=PARK_DEFAULTS) {
  const P=pack.palette[dark?'dark':'light'];
  return [P.red,P.gold,P.cream,P.ivory,P.teal,P.tealShade,P.cream,P.teal,P.gold,P.red];
}
