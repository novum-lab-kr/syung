// 지도 위 정적 층 등록(지도 load 때 한 번, 같은 차례로): 노선 · 승강장 · 역 이름표 자리(투명 글자), 내 위치 점, 출구 번호판, 바탕 지도(OpenFreeMap).
// 다른 화면 파일을 import 하지 않는다: 자료 · 만드는 함수는 본체가 넘기고, 바뀌는 값(지금 모드의 선로 live.track · 내 위치)은 live.<이름> 으로 읽고 쓴다. 모두 동기로 등록하고 자료 Promise 는 지금처럼 나중에 채운다.

// 노선 · 승강장(클릭용 투명 선 + 그리는 층 stationNames) · 역 이름표 자리. 줌마다 공유 선로 간격과 승강장을 다시, 이름표 자리는 줌이 끝난 뒤 한 번만(labelsStale 의 주인)
export function registerTransitLayers({map,shapesReady,buildLineFeatures,buildStationFeatures,basicRouteCache,rebuildLabels,stationNames,STATION_WIDTH_STOPS,PHONE,signCollisionLayout,live}){
  let labelsStale=false;
  map.addSource('routes',{type:'geojson',data:{type:'FeatureCollection',features:buildLineFeatures()}});
  shapesReady.then(()=>{map.getSource('routes').setData({type:'FeatureCollection',features:buildLineFeatures()});map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels();map.triggerRepaint()});
  map.on('zoom',()=>{if(live.track.kind!=='ground')return;let changed=false;for(const [key,t] of basicRouteCache){const [line,a,b]=key.split(':');if(t.zoom&&t.zoom!==map.getZoom()){changed=true;break}}if(!changed)return;map.getSource('routes').setData({type:'FeatureCollection',features:buildLineFeatures()});map.getSource('stations').setData({type:'FeatureCollection',features:buildStationFeatures()});labelsStale=true});
  map.on('zoomend',()=>{if(labelsStale){labelsStale=false;rebuildLabels()}});   // 승강장 좌표가 줌마다 바뀌어요. 이름표 자리는 줌이 끝난 뒤 한 번만 다시(줌 중 매 프레임 setData 하면 깜빡여요)
  map.addLayer({id:'routes',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],8,1.5,15,4],'line-offset':['get','offset'],'line-opacity':.9}});
  map.addSource('stations',{type:'geojson',data:{type:'FeatureCollection',features:buildStationFeatures()}});
  // Stations: square-ended platform rectangles filled with the line colour (no outline), widths shared with the name boxes.
  // line layers kept (invisible) for clicking; the visible platforms are drawn by the station-names layer
  map.addLayer({id:'stations-casing',type:'line',source:'stations',layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-opacity':0,'line-color':['get','color'],'line-offset':['get','offset'],'line-width':['interpolate',['linear'],['zoom'],...STATION_WIDTH_STOPS.flat()]}});
  map.addLayer({id:'stations',type:'line',source:'stations',layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-opacity':0,'line-color':['get','color'],'line-offset':['get','offset'],'line-width':['interpolate',['linear'],['zoom'],...STATION_WIDTH_STOPS.map(([z,w])=>[z,Math.max(1,w-4)]).flat()]}});
  map.addLayer(stationNames);   // platforms under the trains
  map.addSource('station-labels',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  // 역마다 작은 알약 이름표과 위쪽 노선 점을 놓고, 놓인 것만 열차 · 고가 위에 그려요.
  // 투명 아이콘은 전체 영역을 예약해요. 치수는 SIGN 과 맞춰요(lib/station_signs.mjs).
  {const R=2,W=32,H=32;
   map.addImage('station-sign',{width:W*R,height:H*R,data:new Uint8Array(W*R*H*R*4)},{pixelRatio:R,stretchX:[[0,W*R]],stretchY:[[0,H*R]],content:[0,0,W*R,H*R]})}
  const SIGN_LAYOUT={'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],13,10,16,12.5,18,14],'symbol-sort-key':['get','rank'],...signCollisionLayout()};
  const SIGN_PAINT={'text-color':'#141414','text-halo-color':'#ffffff','text-halo-width':0,'text-opacity':0,'icon-opacity':0};
  map.addLayer({id:'station-labels',type:'symbol',source:'station-labels',minzoom:PHONE?12.01:13.01,layout:{'text-field':['get','ph'],...SIGN_LAYOUT},paint:SIGN_PAINT});
}
// 내 위치: 열차 아래 땅에 그리는 점(위치를 받으면 본체 myLocation 을 먼저 바꾸고 점을 옮긴다)
export function registerLocationLayers({map,geolocate,live}){
  // My location, drawn on the ground under the trains (the control's own DOM dot is hidden in CSS).
  map.addSource('me',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  const pa={'circle-pitch-alignment':'map','circle-pitch-scale':'map'};
  // the pulse is drawn with the trains (their canvas), so it does not redraw the map
  map.addLayer({id:'me-ring',type:'circle',source:'me',paint:{...pa,'circle-radius':14,'circle-color':'#ffffff','circle-blur':.15}});
  map.addLayer({id:'me-dot',type:'circle',source:'me',paint:{...pa,'circle-radius':9,'circle-color':'#ffd400','circle-stroke-color':'#141414','circle-stroke-width':2.5}});
  geolocate.on('geolocate',e=>{
    const {longitude:x,latitude:y}=e.coords;live.myLocation=[x,y];
    map.getSource('me').setData({type:'Feature',geometry:{type:'Point',coordinates:[x,y]},properties:{}});
  });
}
// 출구: 줌 16 부터 노란 번호판(역 이름표가 먼저 자리를 잡게 그 아래로)
export function registerExitLayers({map,exitsReady,exitFeatures,EXIT_MINZOOM}){
  // exits: yellow number discs (like station exit signs) from zoom 16
  map.addSource('exits',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  // exit sign: flat yellow rounded square with a thin ink rim, stretched to the number
  {const R=2,S=26*R,c=document.createElement('canvas');c.width=S;c.height=S+2*R;const x=c.getContext('2d');
   x.beginPath();x.roundRect(R,R,S-2*R,S-2*R,4*R);x.fillStyle='#141414';x.fill();
   x.beginPath();x.roundRect(2.2*R,2.2*R,S-4.4*R,S-4.4*R,3*R);x.fillStyle='#ffd400';x.fill();   // flat: thin ink rim, no drop shadow
   map.addImage('exit-sign',x.getImageData(0,0,S,S+2*R),{pixelRatio:R,stretchX:[[10*R,16*R]],stretchY:[[10*R,16*R]],content:[5*R,4*R,S-5*R,S-4*R]})}
  map.addLayer({id:'exit-refs',type:'symbol',source:'exits',minzoom:EXIT_MINZOOM,layout:{'text-field':['get','ref'],'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],16,10,18,12.5],'icon-image':'exit-sign','icon-text-fit':'both','icon-text-fit-padding':[2,3,2,3],'icon-allow-overlap':true,'text-allow-overlap':true},paint:{'text-color':'#141414','text-opacity':0,'icon-opacity':0}});   // invisible: holds the exits' room so station names make way (the pillars are drawn with the trains)
  map.moveLayer('exit-refs','station-labels');   // 역 이름표가 먼저 자리를 잡아요: 표지판은 역 바로 위에만 서서, 출구 자리를 비키면 기울인 화면에선 설 곳이 없어요(이름표가 기둥 위에 그려져요)
  exitsReady.then(()=>map.getSource('exits').setData({type:'FeatureCollection',features:exitFeatures()}));
}

export const BASEMAP_LAYERS=['bm-landcover','bm-park','bm-water','bm-bld','bm-bld3d','bm-road-minor','bm-road-major','bm-rail','bm-label-water','bm-label-park','bm-label-road','bm-label-poi','bm-label-place'];
export function addBasemap({map,sunShadows,PHONE,CITY_STYLE,addCityLayers,applyTheme}){
  map.addSource('ofm',{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenMapTiles © OpenStreetMap contributors'});
  const L=o=>map.addLayer(o,'routes');
  L({id:'bm-landcover',type:'fill',source:'ofm','source-layer':'landcover',filter:['in',['get','class'],['literal',['wood','grass']]],paint:{'fill-color':'#e1eadf','fill-opacity':.7}});
  L({id:'bm-park',type:'fill',source:'ofm','source-layer':'park',paint:{'fill-color':'#dde8da','fill-opacity':.8}});
  L({id:'bm-water',type:'fill',source:'ofm','source-layer':'water',paint:{'fill-color':'#cfe0e8'}});
  L({id:'bm-bld',type:'fill',source:'ofm','source-layer':'building',minzoom:14,paint:{'fill-color':'#dfe4e6','fill-opacity':['interpolate',['linear'],['zoom'],14,0,15,.9]}});
  // buildings rise in 3D from zoom 14; trains read their depth so they pass between them
  map.addLayer(sunShadows,'routes');   // on the ground: over water/parks/building footprints, under streets (added next), lines and 3D buildings
  // Translucent buildings drawn last, over lines, platforms and trains: whatever is behind a building
  // shows through it; trains write their depth first so a building behind a train doesn't cover it.
  map.addLayer({id:'bm-bld3d',type:'fill-extrusion',source:'ofm','source-layer':'building',minzoom:PHONE?15:14,paint:{'fill-extrusion-color':'#d9dde0','fill-extrusion-height':['interpolate',['linear'],['zoom'],14,0,15,['coalesce',['get','render_height'],10]],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.5}});
  L({id:'bm-road-minor',type:'line',source:'ofm','source-layer':'transportation',minzoom:14,filter:['in',['get','class'],['literal',['tertiary','minor']]],paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],14,.6,17,3],'line-opacity':.8}});
  L({id:'bm-road-major',type:'line',source:'ofm','source-layer':'transportation',filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary']]],paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],10,.8,14,3,17,9]}});
  // labels: glyphs from OpenFreeMap for Latin; Hangul is drawn with the device's own font (localIdeographFontFamily)
  try{if(!map.getGlyphs?.())map.setGlyphs('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf')}catch{}
  const name=['coalesce',['get','name:ko'],['get','name']],font=['Noto Sans Regular'],halo={'text-halo-color':'rgba(255,255,255,.9)','text-halo-width':1.4};
  L({id:'bm-rail',type:'line',source:'ofm','source-layer':'transportation',filter:['==',['get','class'],'rail'],minzoom:12,paint:{'line-color':'#c3cbcf','line-width':1.2,'line-dasharray':[3,2]}});
  // symbols sit under the route lines so map text never covers lines, stations or trains
  const sym=(id,layer,filter,minzoom,layout,paint)=>map.addLayer({id,type:'symbol',source:'ofm','source-layer':layer,...(filter?{filter}:{}),minzoom,layout:{'text-field':name,'text-font':font,...layout},paint:{...halo,...paint}},'routes');
  sym('bm-label-water','water_name',null,11,{'text-size':12,'text-letter-spacing':.1},{'text-color':'#5d8aa3'});
  sym('bm-label-park','park',null,14,{'text-size':11,'symbol-placement':'point'},{'text-color':'#5f8a5a'});
  sym('bm-label-road','transportation_name',['in',['get','class'],['literal',['motorway','trunk','primary','secondary','tertiary']]],13,{'text-size':['interpolate',['linear'],['zoom'],13,10,17,13],'symbol-placement':'line','text-max-angle':30},{'text-color':'#7a8589'});
  sym('bm-label-poi','poi',['all',['<=',['get','rank'],8],['in',['get','class'],['literal',['college','school','hospital','park','stadium','castle','monument','museum','townhall','attraction']]]],15,{'text-size':11,'text-anchor':'top','text-offset':[0,.3]},{'text-color':'#8a7f6d'});
  sym('bm-label-place','place',['in',['get','class'],['literal',['city','town','suburb','quarter','neighbourhood']]],10,{'text-size':['match',['get','class'],'suburb',14,'quarter',12,'neighbourhood',11,15],'text-letter-spacing':.05},{'text-color':'#56656a'});
  addCityLayers(map,{pack:CITY_STYLE});   // city-life: the city ground's layers (hidden until a city mode is on)
  applyTheme();
}
