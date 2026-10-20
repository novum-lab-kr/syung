// 여정 지도 표시: 길찾기 결과 · 버스 노선 번호를 지도에 그린다(걷기 점선 · 탄 구간은 노선 경로 · 타고 내리는 점 · 출발/도착), 둘레를 흐리게(veil), 맞춰 보기.
// 여정 상태(displayedRoute · routeBounds · busRouteFocus · routeFocus · subwayOff)의 주인 — 바깥은 같은 이름의 getter · setter. 길찾기 입력 화면(lib/journey-ui)은 본체가 그대로 부른다.
// 다른 화면 파일을 import 하지 않는다: 바뀌는 값(버스 층 · 지금 모드 설정 settings · 역 흐림 stationAlpha)은 live.<이름> 으로 그때그때 읽고 쓴다.
export function createJourneyMap({map,maplibregl,colors,byId,cityCoords,stopPos,cityViaduct,sheetPad,topPad=()=>0,journeyCasingPaint,journeyRidePaint,journeyStopPaint,live}){
  // 길찾기 route on the map: walking dashed, rides along the line's track, in the line's colour
  function rideCoords(line,ids){
    const out=[];
    for(let i=1;i<ids.length;i++){const a=ids[i-1],b=ids[i];let c=cityCoords(line,Math.min(a,b),Math.max(a,b));if(a>b)c=c.slice().reverse();out.push(...(out.length?c.slice(1):c))}   // 여정도 선택한 노선 경로를 따라가요.
    return out;
  }
  function showRoute(plan,busSelection=false,refit=true){   // bus: a stop's number uses the same fit, focus and journey styles
    displayedRoute={plan,busSelection};
    busRouteFocus=busSelection;if(!busSelection){setSubwayOff(false);live.busLayer?.setJourney(plan.legs)}   // bus: 길찾기 경로는 지하철을 다시 보인다   // bus: keep the stop sheet's selection intact
    const feats=[],pts=[];
    plan.legs.forEach((l,i)=>{
      if(l.type==='walk')feats.push({type:'Feature',properties:{kind:'walk'},geometry:{type:'LineString',coordinates:l.path}});
      else if(l.type==='bus'){}   // bus: road-matched line and boarding markers share busLayer's journey styles
      else{const c=rideCoords(l.line,l.stations);feats.push({type:'Feature',properties:{kind:'ride',color:colors[l.line]||'#888'},geometry:{type:'LineString',coordinates:c}});
        // boarding and alighting where the ride is drawn from (the platform on the track), not the
        // station's centre point, which sat 50–270 m off both the ride and the exit the walk reached
        const s0=byId.get(l.stations[0]),s1=byId.get(l.stations[l.stations.length-1]);
        for(const s of [s0,s1])if(s)pts.push({type:'Feature',properties:{kind:'stop',color:colors[l.line]||'#888'},geometry:{type:'Point',coordinates:stopPos(l.line,s)}});
        // the walk ends at an exit: join it to the platform, fainter (inside the station)
        const prev=plan.legs[i-1],next=plan.legs[i+1];
        if(prev&&prev.type==='walk'&&prev.path&&s0)feats.push({type:'Feature',properties:{kind:'inside'},geometry:{type:'LineString',coordinates:[prev.path[prev.path.length-1],stopPos(l.line,s0)]}});
        if(next&&next.type==='walk'&&next.path&&s1)feats.push({type:'Feature',properties:{kind:'inside'},geometry:{type:'LineString',coordinates:[stopPos(l.line,s1),next.path[0]]}})}

    });
    const first=plan.legs[0],last=plan.legs[plan.legs.length-1];
    if(first.path&&!busSelection)pts.push({type:'Feature',properties:{kind:'start'},geometry:{type:'Point',coordinates:first.path[0]}});   // bus: a route number has stops, not journey origin/destination pins
    if(last.path&&!busSelection)pts.push({type:'Feature',properties:{kind:'end'},geometry:{type:'Point',coordinates:last.path[last.path.length-1]}});   // bus
    const data={type:'FeatureCollection',features:[...feats,...pts]};
    if(!map.getSource('journey')){
      // veil: everything under the route (base map, other lines, station names) fades back
      map.addSource('journey-veil',{type:'geojson',data:{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]]]}}});
      // under the base map's labels: the ground fades back, street and place names stay readable
      // (over everything at .68 the map around a route was too dim to read); the other lines fade
      // by their own opacity in focusRoute
      map.addLayer({id:'journey-veil',type:'fill',source:'journey-veil',paint:{'fill-color':veilColor(),'fill-opacity':.45,'fill-opacity-transition':{duration:300}}},map.getLayer('bm-label-water')?'bm-label-water':undefined);
      map.addSource('journey',{type:'geojson',data});
      map.addLayer({id:'journey-casing',type:'line',source:'journey',filter:['==',['get','kind'],'ride'],layout:{'line-cap':'round','line-join':'round'},paint:journeyCasingPaint()});   // bus: shared casing
      map.addLayer({id:'journey-ride',type:'line',source:'journey',filter:['==',['get','kind'],'ride'],layout:{'line-cap':'round','line-join':'round'},paint:journeyRidePaint()});   // bus: shared stroke
      map.addLayer({id:'journey-walk',type:'line',source:'journey',filter:['==',['get','kind'],'walk'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':walkColor(),'line-width':['interpolate',['linear'],['zoom'],10,3,16,6],'line-dasharray':[0.1,1.8]}});
      map.addLayer({id:'journey-inside',type:'line',source:'journey',filter:['==',['get','kind'],'inside'],layout:{'line-cap':'round'},paint:{'line-color':walkColor(),'line-opacity':.45,'line-width':['interpolate',['linear'],['zoom'],10,2,16,4],'line-dasharray':[0.1,2.2]}});
      map.addLayer({id:'journey-stop',type:'circle',source:'journey',filter:['==',['get','kind'],'stop'],paint:journeyStopPaint()});   // bus: shared stop marker
      map.addLayer({id:'journey-ends',type:'circle',source:'journey',filter:['in',['get','kind'],['literal',['start','end']]],paint:{'circle-radius':8,'circle-color':['match',['get','kind'],'start','#ffd400','#141414'],'circle-stroke-color':['match',['get','kind'],'start','#141414','#ffd400'],'circle-stroke-width':3}});
    }else map.getSource('journey').setData(data);
    live.busLayer?.raiseRoute();focusRoute(true);   // bus: keep selected lanes above the lazily created veil
    const all=data.features.flatMap(f=>f.geometry.type==='Point'?[f.geometry.coordinates]:f.geometry.coordinates);
    all.push(...plan.legs.filter(l=>l.type==='bus').flatMap(l=>l.path));   // bus: retain journey fitting without a duplicate line
    routeBounds=all.length?all.reduce((bb,c)=>bb.extend(c),new maplibregl.LngLatBounds(all[0],all[0])):null;
    if(refit)fitRoute(sheetPad()+30);
  }
  let displayedRoute=null;   // 모드 전환 때 표시 중인 여정만 다시 그려요.
  let routeBounds=null,busRouteFocus=false;   // bus: route-number focus is released with its detail sheet
  // MapLibre 는 fitBounds 의 padding 에 지도에 남은 padding(따라가기 카메라가 jumpTo 로 둔 시트 높이)을 더한다 — 그대로 주면 시트 높이가
  // 두 번 빠져 높은 시트에서 '들어갈 자리 없음'으로 아무것도 안 했다(2026-10-12 덕배: 곧 올 버스 따라가기 뒤 노선 전체로 안 돌아옴). 남은 만큼 빼서 준다
  function fitRoute(bottom){if(!routeBounds)return;const p=map.getPadding?.()||{},less=(v,k)=>Math.max(0,v-(p[k]||0));
    map.fitBounds(routeBounds,{padding:{top:less(Math.max(90,topPad()),'top'),bottom:less(bottom,'bottom'),left:less(40,'left'),right:less(40,'right')},maxZoom:16,pitch:0,duration:800})}
  function clearRoute(){displayedRoute=null;live.busLayer?.clearSelection({journey:true});routeBounds=null;if(map.getSource('journey'))map.getSource('journey').setData({type:'FeatureCollection',features:[]});focusRoute(false)}   // bus: clear journey selection with its route
  const veilColor=()=>document.documentElement.dataset.theme==='dark'?'#0b0c0e':'#fbfaf4';
  const walkColor=()=>document.documentElement.dataset.theme==='dark'?'#f1efe6':'#141414';
  // The lines on the ground: faded under a found route; on the 롤러코스터 a faint shadow of its track (the track itself
  // is not drawn zoomed out below 12.5: there they come back in full)
  let routeFocus=false;
  // bus: 버스 노선을 고르면(정류장 팝업의 번호 · 지도 위 버스) 지하철 — 노선 · 승강장 · 이름표 · 열차 · 출구 — 을 감추고, 놓으면 다시(2026-10-08 덕배)
  let subwayOff=false;
  function setSubwayOff(on){
    if(subwayOff===on)return;subwayOff=on;
    for(const id of ['routes','stations-casing','stations','station-names','station-labels','exit-refs'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'none':'visible');   // 감춘 역은 눌리지도 않게
    live.stationAlpha=on?0:routeFocus?.35:1;map.triggerRepaint();
  }
  const setRouteOpacity=()=>{if(map.getLayer('routes'))map.setPaintProperty('routes','line-opacity',live.settings.track.kind!=='ground'?cityViaduct.routeOpacity(routeFocus):routeFocus?.25:.9);   // 롤코도 고가 위: 상판이 나오면 땅 위 노선은 사라져요
    // 길찾기 탄 구간도 같다: 상판이 나오면 땅 위 선 · 타고 내리는 점은 사라지고 고가가 노선색으로 밝아진다(viaduct journeyFocus, 2026-10-11 행님)
    if(map.getLayer('journey-ride')){const o=live.settings.track.kind!=='ground'?cityViaduct.deckFade():1;for(const id of ['journey-casing','journey-ride'])map.setPaintProperty(id,'line-opacity',o);for(const k of ['circle-opacity','circle-stroke-opacity'])map.setPaintProperty('journey-stop',k,o)}};
  // 길찾기 중에는 내가 가는 방향의 열차만(2026-10-11): 탈 노선에서, 지금 자리(dist — 그리는 거리)부터의 앞길(seq, 최대 8정거장)에
  // 탈 구간의 두 역을 그 순서로 지나는 열차 — 탈 역으로 오는 것과 탄 구간 안의 것. 반대 방향 · 내릴 역을 지난 것 · 다른 노선은 숨긴다.
  // (seq[0] 은 이미 떠난 역이고 '출발' 기록은 그 역을 지난 뒤라 지금 자리부터 센다.) 버스만 타는 경로면 열차는 없다.
  // 길찾기가 알려 준 실시간 열차(trainNo)는 늘 보인다. 버스 노선 번호를 고른 동안(busSelection)은 따로(subwayOff)
  let ridesOf=null,ridesList=null;   // 매 프레임 열차마다 묻는다: 여정이 바뀔 때만 다시 고른다
  const rides=()=>{if(ridesOf!==displayedRoute){ridesOf=displayedRoute;ridesList=displayedRoute&&!displayedRoute.busSelection?displayedRoute.plan.legs.filter(l=>l.type==='ride').map(l=>({...l,pairs:ridePairs(l.stations||[])})):null}return ridesList};
  // 탈 구간의 이웃한 두 역 짝: 뒤 역 → 앞 역들(같은 역을 두 번 지나는 6호선 응암 고리도 짝마다 따로)
  const ridePairs=ids=>{const m=new Map();for(let k=1;k<ids.length;k++){const b=String(ids[k]);if(!m.has(b))m.set(b,new Set());m.get(b).add(String(ids[k-1]))}return m};
  const passes=(seq,pairs)=>{const seen=new Set();for(const s of seq){const id=String(s.id),from=pairs.get(id);if(from)for(const a of from)if(seen.has(a))return true;seen.add(id)}return false};   // 탈 구간의 이웃한 두 역을 그 순서로
  const ahead=(p,dist)=>{let i=0;while(i<p.seq.length-1&&p.cum[i+1]<dist)i++;return p.seq.slice(i)};   // 지금 달리는 칸의 앞 역부터
  const isJourneyTrain=(p,l)=>!!l.trainNo&&p.id===`${l.line}:${l.trainNo}`;
  function trainShown(p,dist){const R=rides();return !R||R.some(l=>l.line===p.t.line&&(isJourneyTrain(p,l)||passes(ahead(p,dist),l.pairs)))}
  function journeyTrain(p){return !!rides()?.some(l=>isJourneyTrain(p,l))}   // 탈 열차: 고른 열차처럼 둘레가 퍼진다
  function journeyRides(){return rides()}   // 고가(viaduct journeyFocus): 같은 여정이면 같은 배열 — 없으면 null, 버스만 타면 []
  function rideLines(){const L=[...new Set((rides()||[]).map(l=>l.line))];return L.length?L:null}   // 실시간은 줌과 상관없이 이 노선만 받는다(live_feed)
  // route focus: veil on, my location kept above the veil (열차 · 버스는 흐리게 하지 않고 이 여정의 것만 남긴다 — trainShown · BusLayer.journeyEnds)
  function focusRoute(on){
    if(map.getLayer('journey-veil')){map.setLayoutProperty('journey-veil','visibility',on?'visible':'none');map.setPaintProperty('journey-veil','fill-color',veilColor());map.setPaintProperty('journey-walk','line-color',walkColor());if(map.getLayer('journey-inside'))map.setPaintProperty('journey-inside','line-color',walkColor())}
    routeFocus=on;setRouteOpacity();
    live.stationAlpha=subwayOff?0:on?.35:1;map.triggerRepaint();
    if(on)for(const id of ['me-ring','me-dot'])if(map.getLayer(id))map.moveLayer(id);
  }
  return {rideCoords,showRoute,fitRoute,clearRoute,setSubwayOff,setRouteOpacity,focusRoute,trainShown,journeyTrain,rideLines,journeyRides,get displayedRoute(){return displayedRoute},set displayedRoute(v){displayedRoute=v},get routeBounds(){return routeBounds},set routeBounds(v){routeBounds=v},get busRouteFocus(){return busRouteFocus},set busRouteFocus(v){busRouteFocus=v},get routeFocus(){return routeFocus},set routeFocus(v){routeFocus=v},get subwayOff(){return subwayOff},set subwayOff(v){subwayOff=v}};
}
