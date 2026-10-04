// Shared by subway journeys and both ways of selecting a bus route. A bus's
// corridor is bounded by its actual road lane; an ordinary ride has no such cap.
import {busMetresPerPixel} from './bus_roads.mjs';
const width=(casing)=>['interpolate',['linear'],['zoom'],...[10,14,15,16,17,18,22].flatMap(z=>{
  const normal=casing?6+Math.min(6,Math.max(0,z-10))*8/6:3.5+Math.min(6,Math.max(0,z-10))*5.5/6;
  return [z,['min',normal,['*',['coalesce',['get','laneWidth'],1e6],(casing?.92:.62)/busMetresPerPixel(z)]]];
})];
export const journeyCasingPaint=()=>({'line-color':'#ffffff','line-width':width(true)});
export const journeyRidePaint=()=>({'line-color':['get','color'],'line-width':width(false)});
export const journeyStopPaint=()=>({'circle-radius':6,'circle-color':'#ffffff','circle-stroke-color':['get','color'],'circle-stroke-width':3});
