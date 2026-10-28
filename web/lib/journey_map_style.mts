// Shared by subway journeys and both ways of selecting a bus route. A bus's
// corridor is bounded by its actual road lane; an ordinary ride has no such cap.
import {busMetresPerPixel} from '../bus/roads.mjs';
// thin: 고른 버스 노선은 가늘게(z14 3 px · z18 4.5 px) — 굵으면 분리 차도의 상행 · 하행이 한 줄로 붙어 보인다.
const width=(casing:boolean,thin=false)=>['interpolate',['linear'],['zoom'],...[10,14,15,16,17,18,22].flatMap(z=>{
  const ride=thin?1.5+Math.min(8,Math.max(0,z-10))*3/8:3.5+Math.min(6,Math.max(0,z-10))*5.5/6;
  const normal=thin?(casing?ride+2.5:ride):casing?6+Math.min(6,Math.max(0,z-10))*8/6:ride;
  return [z,['min',normal,['*',['coalesce',['get','laneWidth'],1e6],(casing?.92:.62)/busMetresPerPixel(z)]]];
})];
export const journeyCasingPaint=({thin=false}={})=>({'line-color':'#ffffff','line-width':width(true,thin)});
export const journeyRidePaint=({thin=false}={})=>({'line-color':['get','color'],'line-width':width(false,thin)});
export const journeyStopPaint=()=>({'circle-radius':6,'circle-color':'#ffffff','circle-stroke-color':['get','color'],'circle-stroke-width':3});
