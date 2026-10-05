// 서울 하늘 유원지. M = map metres; Px = CSS pixels before device pixel ratio.
// Route colours stay in the live network's colors[line], never in this pack.
export const SEOUL_COASTER_STYLE = {
  id: 'seoul-coaster', version: 1,
  palette: {
    light: { cream:'#F4E4BC', ivory:'#E7DFC9', teal:'#244D56', tealShade:'#183840', red:'#C94235', gold:'#E9AF32', deck:'#D8CBB0', concrete:'#B5BBB0', ink:'#18343D', bulbWarm:'#FFD27E', bulbCore:'#FFF0CF' },
    dark: { cream:'#C3B99C', ivory:'#8F998E', teal:'#24424B', tealShade:'#152D35', red:'#B7463D', gold:'#C99941', deck:'#606660', concrete:'#495A59', ink:'#F4E4BC', bulbWarm:'#FFD27E', bulbCore:'#FFF0CF' }
  },
  track: { railBodyOffset:.30, railDiameterM:.32, railDiameterPx:[1,1.7], railSideLight:.80,
    spineWidthM:.55, spineDepthM:1.2, spineWidthPx:[.65,1.5], spineDepthPx:[1.2,2.6],
    girderDepthM:1.8, girderDepthPx:[3,7], girderBody:.5,   // 2026-10-05 덕배: 고가에서 솟는 레일 — 차선마다 노선색 상자 거더(폭 = 열차 폭, 위는 밝게), 두 차선이 붙어 넓은 상판처럼
    tieEveryM:7.5, tieBodyWidth:.78, tieThicknessM:.22, tieThicknessPx:[.7,1.2] },
  supports: { minHeightM:3, yHeightM:30, yBranchM:6, aHeightM:80, spanM:[60,80,100], clearM:15,
    diameterM:1.25, diameterPx:[1.1,2.8], aDiameterM:1.5, aSpread:.18, aMaxSpreadM:28, beamHeightM:1,
    footSizeM:3.2, footHeightM:.6 },
  station: { deckThicknessM:.8, walkClearM:2.4, curveClearM:6, safetyWidthM:.20,
    canopyLengthM:12, canopyGapM:3, canopyDepthM:4.2, canopyEaveM:4.2, canopyRidgeM:5.2,
    canopyPostM:.25, routeBandM:.45, gateWidthM:3.2, gateHeightM:3, badgePx:16,
    maxCanopiesPerSide:12, bulbEveryM:4, queueSizeM:[6,3] },
  rides: { detailZoom:14.5, crownHeightM:12, crownHeightRatio:.05, rimM:[.7,1.2],
    spokes:12, cabins:12, swingSides:8, saucerThicknessM:[5,10], saucerThicknessRatio:.035 },
  props: { flags:false, balloons:false },
  night: { bulbEveryM:18, bulbDropM:3, corePx:[1.4,1.8,2.2], haloPx:[4,5.5,7],
    warmShare:.8, trackEmission:.65, rideEmission:.55, stationEmission:.9,
    rideAmbient:.50, rideDirectional:.18,
    chaseLengthM:180, chasePeriodS:10, chaseAmplitude:.15,
    beamMinZoom:15.5, beamPeriodS:24, beamOpacity:.055, beamCap:2, phoneBeamCap:1,
    fireworksPeriodS:28, phoneFireworks:false },
  lod: { hysteresis:.15, canopy:[15.5,16.1], gate:[16.5,17.1], ties:[16.6,17.2], detail:[17.2,17.8] },
  performance: { stationBytes:16e6, phoneStationBytes:8e6, stationDraws:4,
    trackBytes:192e6, phoneTrackBytes:96e6 }
};

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function zoomFade(zoom, range) { const t=clamp((zoom-range[0])/(range[1]-range[0]),0,1); return t*t*(3-2*t); }
export const metresPerPixel = (zoom, lat=37.55) => 40075016.685578488*Math.cos(lat*Math.PI/180)/(512*2**zoom);
export function trackMetrics(zoom, lat=37.55, pack=SEOUL_COASTER_STYLE) {
  const mpp=metresPerPixel(zoom,lat), T=pack.track, S=pack.supports, px=(m,range)=>clamp(m/mpp,...range);
  return { mpp, rail:px(T.railDiameterM,T.railDiameterPx), spineWidth:px(T.spineWidthM,T.spineWidthPx),
    spineDepth:px(T.spineDepthM,T.spineDepthPx), girder:px(T.girderDepthM,T.girderDepthPx), tie:px(T.tieThicknessM,T.tieThicknessPx), post:px(S.diameterM,S.diameterPx) };
}
// A half-open edge grid: neighbouring chunks own each tie once; LOD only drops stable indices.
export function distanceGrid(startM, endM, everyM, stride=1) {
  const out=[], step=everyM*Math.max(1,stride);
  for(let i=Math.ceil((startM-1e-8)/step);i*step<endM-1e-8;i++)out.push(i*step);
  return out;
}
export function ridePalette(dark=false, pack=SEOUL_COASTER_STYLE) {
  const P=pack.palette[dark?'dark':'light'];
  return [P.red,P.gold,P.cream,P.ivory,P.teal,P.tealShade,P.cream,P.teal,P.gold,P.red];
}
