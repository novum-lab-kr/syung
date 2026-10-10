// 열차 캔버스(지도 위에 따로 둔 GL)와 역 이름표 캔버스: 한 프레임에 그리는 차례 — 지우기 → 심시티 x-ray → 건물 깊이 → 놀이기구 → 도시 생활 → 버스 → 고가 · 랜드마크
// → 롤코 선로 → 열차 → 밤 공원 → 유리 건물 → 출구 기둥 → 1인칭 내 칸 → 역 이름표. 지도 load 안에서 한 번 만들고, render · idle · moveend · sourcedata 에 붙는다.
// 캔버스 · 이름표 배치 · 놀이기구 · 도시 생활 · 밤 공원 · 벽 타이머의 주인. 본체의 drawTrains · wallsNow 를 live setter 로 채운다(그 전엔 빈 함수).
// 다른 화면 파일을 import 하지 않는다: 열차 · 건물 깊이 클래스(trains/draw.mjs)와 lib 클래스는 본체가 넘기고, 바뀌는 값은 live.<이름> 으로 그때그때 읽는다.
export function createTrainOverlay({map,maplibregl,signTextSize,rider,perspectiveRatio,signRows,drawStationSigns,effectiveTheme,REDUCED,TRAIN_FPS,TrainLayer,BuildingDepth,cityOn,cityXrayTargets,mapPalette,coasterGeo,RIDE_H,coasterTrack,geom,edgeOffset,coasterBodyPx,trainBodyPx,cityViaduct,CORK_HEART,PHONE,trainFrameSoon,CityLife,CITY_STYLE,cityPack,$,sunPosition,NightLayer,journeyMap,exitPillars,RIDE_ZOOM,nearMatrix,COCKPIT_NEAR_M,live}){
  const c=document.createElement('canvas');c.className='train-overlay';map.getCanvas().after(c);   // right above the map, under markers and popups
  c.style.cssText='position:absolute;left:0;top:0;pointer-events:none';
  const gl=c.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:true});
  // 역 이름표 캔버스: 열차 캔버스 바로 위(마커 · 팝업 아래)
  const sc=document.createElement('canvas');sc.className='station-signs';c.after(sc);sc.style.cssText='position:absolute;left:0;top:0;pointer-events:none';
  const sctx=sc.getContext('2d');let signFeatures=[],signAt=0,signMatrix=null,signTimer=0,signShown=false;
  // 그릴 이름표가 없으면 캔버스를 숨긴다: 다 지우고 아무것도 안 그리면 크롬이 직전 그림을 계속 띄웠다 — 크게 옮긴 뒤 전 자리의 역 이름이
  // 같은 화면 자리에 몇 초씩 남았다(2026-10-10 덕배, 잠실 → 여의도). 캔버스 픽셀은 비어 있었다
  const showSigns=on=>{if(on!==signShown){signShown=on;sc.style.visibility=on?'':'hidden'}};
  const drawSigns=M=>{
    const m=map.getCanvas(),W=m.clientWidth,H=m.clientHeight;signMatrix=M;
    if(sc.width!==m.width||sc.height!==m.height){sc.width=m.width;sc.height=m.height}
    sc.style.width=m.style.width;sc.style.height=m.style.height;sctx.clearRect(0,0,sc.width,sc.height);
    const now=performance.now();   // 놓인 이름표 목록은 가끔만 다시 받아요(배치도 그 정도 간격으로 바뀌어요). 위치는 매 프레임 투영
    if(now-signAt>150){signAt=now;signFeatures=map.getLayer('station-labels')?map.queryRenderedFeatures({layers:['station-labels']}):[]}
    if(!signFeatures.length){showSigns(false);return}
    const clip=(x,y)=>[M[0]*x+M[4]*y+M[12],M[1]*x+M[5]*y+M[13],M[3]*x+M[7]*y+M[15]];
    const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),cw=clip(O.x,O.y)[2],z=map.getZoom(),size=signTextSize(z),seen=new Set(),items=[];
    for(const f of signFeatures){
      const [lng,lat]=f.geometry.coordinates,k=`${lng},${lat}`;if(seen.has(k))continue;seen.add(k);
      const q=maplibregl.MercatorCoordinate.fromLngLat([lng,lat]),[x,y,w]=clip(q.x,q.y);if(!(w>0))continue;
      const sx=(x/w*.5+.5)*W,sy=(.5-y/w*.5)*H;if(rider.ride&&!(sy>=0&&sy<=H))continue;   // 롤코 1인칭: 지나온 역 이름표가 화면 아래에서 탄 칸 위로 올라오지 않게
      items.push({x:sx,y:sy,scale:perspectiveRatio(cw,w),size,rows:signRows(f.properties),phase:(lng*977+lat*613)%(Math.PI*2)});   // phase: 팻말마다 다른 박자로 둥둥
    }
    items.sort((a,b)=>a.y-b.y);   // 먼 것(화면 위)부터, 가까운 것을 그 위에(출구 기둥과 같은 순서)
    showSigns(items.length>0);
    drawStationSigns(sctx,items,{dpr:m.width/Math.max(1,W),dark:effectiveTheme()==='dark',alpha:live.stationAlpha,now,still:REDUCED.matches});
    if(!REDUCED.matches&&!signTimer)signTimer=setTimeout(()=>{signTimer=0;if(!map.isMoving()&&signMatrix)drawSigns(signMatrix)},1000/TRAIN_FPS);   // 둥둥: 팻말 캔버스만 다시(카메라가 움직이면 지도 프레임마다 drawTrains 가 그려요)
  };
  map.on('idle',()=>{signAt=0;if(signMatrix)drawSigns(signMatrix)});   // 멈춘 뒤 마지막 배치로
  const layer=new TrainLayer();layer.onAdd(map,gl);const walls=new BuildingDepth(gl);let rides=null,night=null,cityLife=null,ridePlacement=null;   // coaster: checked ride sites; cityLife: city-life's props
  live.drawTrains=()=>{
    const S=live.settings,K=S.track.kind,park=S.park.enabled;   // 지금 모드 설정: 선로 종류(고가 · 롤코 길), 공원(놀이기구 · 밤 선로 · 1인칭)
    const m=map.getCanvas();if(c.width!==m.width||c.height!==m.height){c.width=m.width;c.height=m.height}
    c.style.width=m.style.width;c.style.height=m.style.height;
    gl.viewport(0,0,c.width,c.height);gl.clearColor(0,0,0,0);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);   // bus: clear instanced geometry depth even after a no-write pass
    const pd=map.painter.transform.getProjectionDataForCustomLayer(true);   // the transform the map just drew with
    if(cityOn()&&live.cityBuildings)live.cityBuildings.setXray(S.city.xray?cityXrayTargets():null);   // city-build: 심시티 x-ray boxes (none on the coaster)
    const drawn=cityOn()&&live.cityBuildings?live.cityBuildings.drawDepth(gl,pd.mainMatrix):walls.draw(pd.mainMatrix),behind=drawn&&!cityOn()?1-mapPalette().bld3dOpacity:0;   // city-build: in a city mode the city's own (opaque) walls
    if(park&&live.kitReady&&coasterGeo.bld?.towers?.length){   // the rides where the towers were (their buildings are filtered out): first, so the track and trains depth-test against them
      if(!rides){   // coaster: only expose a neighbourhood after its buildings and rails have been checked
        rides=new live.RideLayer(coasterGeo.bld.towers,{deferPlacement:true});rides.init(gl,maplibregl);if(window.__subwayWebGL)window.__subwayWebGL.rides=rides;   // 캡처 · 점검용: 놀이기구 자리(rides.sites())
        ridePlacement=new live.CoasterRidePlacement(rides.candidates.filter(c=>!c.lotte),{   // 롯데월드타워 자리는 놀이기구 대신 전용 모델(cityLandmarks)
          map,minH:live.cityBuildings.P.minH,missingH:live.cityBuildings.P.missingH,maxH:RIDE_H,
          getTracks:bounds=>live.sampleRideTracks(coasterTrack,bounds,{geometry:e=>geom(e.line,e.lo,e.hi),offset:e=>edgeOffset(e.line,e.lo,e.hi),bodyPx:coasterBodyPx(14),lanePx:cityViaduct.train(14,coasterBodyPx(14)).lanePx,heart:CORK_HEART}),
          onChange:sites=>{rides.setSites(sites);map.triggerRepaint()}});window.__subwayWebGL.ridePlacement=ridePlacement;
      }
      const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
      if(coasterTrack.edges)ridePlacement.update([A.x,B.y,B.x,A.y]);   // coaster: tile loading is asynchronous; pending sites stay hidden
      rides.render(gl,pd.mainMatrix,{now:performance.now(),dark:effectiveTheme()==='dark',night:effectiveTheme()==='dark',pixelRatio:c.width/Math.max(1,m.clientWidth),zoom:map.getZoom(),phone:PHONE,reducedMotion:REDUCED.matches,bounds:[A.x,B.y,B.x,A.y]});
      if(rides.animating())trainFrameSoon(1000/TRAIN_FPS)}
    if(S.city.enabled){   // city-life: the living city (trees, lamps, cars, people) once the walls and rides have their depth, before the track and the trains. The people walk in both modes (LIFE-01): the same figures in the same places, only toned by the mode
      if(!cityLife){cityLife=new CityLife({pack:CITY_STYLE});cityLife.init(gl,maplibregl,map);window.__subwayWebGL.cityLife=cityLife}
      const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
      cityLife.render(gl,pd.mainMatrix,{look:cityPack(),now:performance.now(),zoom:map.getZoom(),bearing:map.getBearing(),dark:effectiveTheme()==='dark',coaster:live.coaster,people:true,phone:PHONE,reducedMotion:REDUCED.matches,pixelRatio:c.width/Math.max(1,m.clientWidth),bounds:[A.x,B.y,B.x,A.y],mapOn:$('toggleMap').getAttribute('aria-pressed')==='true',moving:map.isMoving(),sun:sunPosition()});
      if(cityLife.animating())trainFrameSoon(1000/TRAIN_FPS)}
    if(live.busLayer)live.busLayer.joseon=live.joseon;live.busLayer?.render(gl,pd.mainMatrix,behind);   // 조선 모드: 버스 대신 가마   // bus: shared walls/depth, instanced road vehicles and BUS posts in every mode — 건물 뒤는 열차와 같은 투명도로 비친다
    if(K!=='ground'){   // city-life: 심시티 고가 — (롤코도 이 고가 위를 달린다) the viaduct the trains ride (deck; piers kept off the buildings' footprints through cityLife; roofed platforms), once the cars and buses have their depth, before the trains
      const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast()),zoom=map.getZoom();
      cityViaduct.setPack(cityPack());   // 조선 모드: 같은 고가를 물 채운 돌 수로로
      if(cityViaduct.render(gl,pd.mainMatrix,{now:performance.now(),zoom,dark:effectiveTheme()==='dark',phone:PHONE,bounds:[A.x,B.y,B.x,A.y],sun:sunPosition(),life:cityLife,selected:live.selected,moving:map.isMoving(),bodyPx:trainBodyPx(zoom)}))trainFrameSoon(50);
      live.cityLandmarks?.render(gl,pd.mainMatrix,{zoom,dark:effectiveTheme()==='dark',joseon:live.joseon,sun:sunPosition()})}   // 랜드마크: 조각 건물은 city_mesh 가 뺐다. 롤코에서도 같은 모델(2026-10-10 행님: 심시티만 바뀌고 롤코는 예전 그대로였다) — 그 자리 자이로드롭은 뺐고, 8호선 코스는 반지름 150 m 로 그 둘레를 감아 오른다
    coasterTrack.render(gl,pd.mainMatrix,behind);   // under the trains
    layer.render(gl,{defaultProjectionData:pd,walls:drawn||!!rides&&park,occlude:behind});
    // the park at night (dark theme): bulbs under the track and fireworks over the river — after everything solid has its depth
    if(park&&effectiveTheme()==='dark'&&coasterTrack.edges){   // (edges: once the track has been set up)
      if(!night){night=new NightLayer();night.init(gl)}
      {const bp=coasterTrack.bulbs();if(night.trackSrc!==bp){night.setTrackBulbs(bp,coasterTrack.bulbRgb);night.trackSrc=bp}}   // 레일이 고가를 떠난 곳 아래 전구(다시 지으면 다시); 승강장 불빛은 고가 승강장의 밤 조명이 맡는다
      const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
      night.render(gl,pd.mainMatrix,{now:performance.now(),zoom:map.getZoom(),phone:PHONE,reducedMotion:REDUCED.matches,bounds:[A.x,B.y,B.x,A.y],pixelRatio:c.width/Math.max(1,m.clientWidth)});
      if(night.animating())trainFrameSoon(1000/TRAIN_FPS)}
    else if(night){night.dispose(gl);night=null}
    if(S.city.xray&&live.cityBuildings)live.cityBuildings.drawGlass(gl,pd.mainMatrix);   // city-build: 심시티 x-ray — the buildings hiding a station or a train, as glass over what was drawn behind them
    if(!journeyMap.subwayOff)exitPillars.render(gl,pd.mainMatrix,m.clientWidth,m.clientHeight,c.width/Math.max(1,m.clientWidth),cityOn()&&drawn);   // above the trains   // city-life: 심시티 too: behind the (opaque) buildings and the viaduct
    if(rider.ride&&park&&layer.c88ride?.n){   // 롤코 1인칭: 내 칸은 맨 마지막에, 깊이를 비우고 눈앞 10 cm 까지 그린다(지도는 기본에 가까운 가까운 면 — RIDE_NEAR_M)
      const ppm=512*2**RIDE_ZOOM*maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()).meterInMercatorCoordinateUnits();
      gl.depthMask(true);gl.clear(gl.DEPTH_BUFFER_BIT);layer.c88ride.draw(gl,nearMatrix(pd.mainMatrix,COCKPIT_NEAR_M*ppm),layer.ox,layer.oy,{...layer.c88o,part:'body',occlude:0})}
    drawSigns(pd.mainMatrix);   // 역 이름표: 3D 를 다 그린 뒤 그 위 캔버스에
  };
  map.on('render',()=>live.drawTrains());   // the camera moved or the map redrew: trains follow in the same frame
  // walls: again when new building tiles arrive or the view settles somewhere new
  let wallTimer=0;const wallsSoon=()=>{clearTimeout(wallTimer);wallTimer=setTimeout(()=>{if(map.isMoving())return;walls.rebuild();requestAnimationFrame(live.drawTrains)},250)};   // not while moving (tiles arriving mid-pan ran it, 50–350 ms a stall): moveend runs it   // city-life: the walkers' streets went with the walkers (city_life.mjs)
  live.wallsNow=()=>{walls.rebuild();requestAnimationFrame(live.drawTrains)};map.on('moveend',wallsSoon);map.on('sourcedata',e=>{if(e.sourceId==='ofm'&&e.isSourceLoaded)wallsSoon()});
}
