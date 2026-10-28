// 역 이름표: 보이는 역마다 이름 · 노선 · 자리(signAnchor)를 'station-labels' 자료로 만든다. labels 의 주인(승강장 층이 getLabels 로 읽는다).
// 이름표 symbol 층 등록 · 캔버스 팻말 그리기는 아직 본체(map.on('load') · 열차 캔버스).
import type { Feature } from 'geojson';
import type { GeoJSONSource, Map as MapLibre } from 'maplibre-gl';
import type { MapStation } from '../trains/types.mts';
import {signAnchor,sortLines,placeholderText} from '../lib/station_signs.mts';

// 이름표 하나(승강장 층이 getLabels 로 읽는다)
export interface StationLabel { station:MapStation; line:string; text:string }
export interface StationLabelsDeps { map:MapLibre; stations:MapStation[]; stationRects:Map<string,{coords:unknown}>; colors:Record<string,string>; getSelected:()=>string }
export function createStationLabels({map,stations,stationRects,colors,getSelected}:StationLabelsDeps){
  let labels:StationLabel[]=[],frame=0;
  function updateLabelVisibility(){frame=0;map.triggerRepaint()}
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(updateLabelVisibility)};
  function rebuild(){
    const selected=getSelected();
    labels=[];
    const visible=stations.filter(s=>selected==='all'||s.lines.some(x=>x.name===selected)).sort((a,b)=>b.lines.length-a.lines.length);
    for(const s of visible){
      const line=selected!=='all'&&s.lines.some(x=>x.name===selected)?selected:s.lines[0]!.name;
      labels.push({station:s,line,text:s.name});
    }
    // 보이는 승강장의 교차 · 근접 구간을 우선하고, 한 노선이면 호 길이의 가운데에 놓아요
    const src=map.getSource<GeoJSONSource>('station-labels');
    if(src)src.setData({type:'FeatureCollection',features:labels.flatMap(({station:s,text}):Feature[]=>{
      const shown=s.lines.filter(x=>selected==='all'||x.name===selected);
      const c=signAnchor((shown.map(x=>stationRects.get(`${x.name}:${s.id}`)).filter(Boolean) as {coords:unknown[]}[]).map(r=>r.coords));
      if(!c)return [];
      const names=sortLines(shown.map(x=>x.name));
      return [{type:'Feature',properties:{text,rank:-s.lines.length,ln:names.join('|'),lc:names.map((n:string)=>colors[n]||'#52646a').join('|'),ph:placeholderText(names,text)},geometry:{type:'Point',coordinates:c}}];
    })});
    schedule();
  }
  return {rebuild,schedule,get list(){return labels}};
}
