// 밝은 · 어두운 테마와 지도 색(차분 · 컬러), 롤코 공원 색, 설정 버튼 · 5분마다 자동 테마, 해 위치 아이콘(자동일 때 테마 버튼).
// themeChoice · mapColor 의 주인(바깥은 getter). 저장 이름(subway-theme · subway-map-color)과 값 · 섞는 식은 그대로 — 저장 창구는 5단계.
// 색 자료는 지금 모드 설정의 map.themes · colors · park(원본 web/modes/basic/palette.mjs, 모드가 덧쓸 수 있다).
// 다른 화면 파일을 import 하지 않는다: 바뀌는 값(지금 모드의 설정 live.settings · 버스 층 · 지도 준비)은 live.<이름> 으로 읽는다. applyTheme 를 만들 때 부르지 않는다(본체가 부른다).
export function createMapTheme({map,$,ICONS,seoulSun,sunPosition,cityPalette,applyCityStyle,applyGroundTexture,syncCity,updateSun,focusRoute,journeyMap,rider,live}){
  // ---- light / dark theme --------------------------------------------------------------------
  // 자동 (default): light from sunrise to sunset in Seoul, dark at night; 라이트 / 다크: fixed by the viewer.
  const mixHex=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
  const MAP_COLOR_KEY='subway-map-color';let mapColor='calm';try{mapColor=localStorage.getItem(MAP_COLOR_KEY)||'calm'}catch{}
  const THEME_KEY='subway-theme';
  // 섞는 차례는 지금 모드 설정의 map.paletteKind: base(바탕) · city(+도시 땅) · park-city(+공원 색, 마지막에 도시 땅)
  const mapPalette=(t=effectiveTheme())=>{const S=live.settings,P={...S.map.themes[t],...(mapColor==='color'?S.map.colors[t]:{})};if(S.map.paletteKind!=='park-city')return S.map.paletteKind==='city'?{...P,...cityPalette(t,{pack:S.city.pack,tone:S.city.tone})}:P;   // city-life: 심시티 — the ground from the style pack
    const K=S.map.park[t],m=mapColor==='color'?0:.15,Q={...P,...K,bld3dOpacity:1};for(const k of ['bg','park','land','water','bld'])Q[k]=mixHex(K[k],K.bg,m);
    const id=['abs',['to-number',['id'],0]];   // ids run in tens and hundreds (osm id × 10…): two residues multiplied mix them
    Q.bld3d=['match',['%',['floor',['/',['*',['%',id,9973],['%',id,9967]],7]],6],...K.blocks.slice(0,5).flatMap((v,i)=>[i,v]),K.blocks[5]];return {...Q,...cityPalette(t,{pack:S.city.pack,tone:S.city.tone,ride:!!rider.ride})}};   // city-life: the park sits on the same city ground, toned down (spec §7)
  let themeChoice='auto';
  try{themeChoice=localStorage.getItem(THEME_KEY)||'auto'}catch{}
  // Sunrise / sunset for Seoul (sunrise equation; accurate to a few minutes)
  function effectiveTheme(){if(themeChoice!=='auto')return themeChoice;const now=new Date(),{rise,set}=seoulSun(now);return now>=rise&&now<set?'light':'dark'}
  function applyTheme(){queueMicrotask(()=>{if(map.getLayer?.('journey-veil'))focusRoute(!!journeyMap.routeBounds)});
    const t=effectiveTheme(),P=mapPalette(),S=live.settings;
    live.busLayer?.setTheme(t);   // bus: the same light/dark setting as the map
    for(const b of document.querySelectorAll('[data-map-color]'))b.setAttribute('aria-pressed',String(b.dataset.mapColor===mapColor));
    document.documentElement.dataset.theme=t;
    // favicon follows the map theme (the <link media> pair only knows the OS setting)
    for(const l of document.querySelectorAll('link[data-theme-icon]'))l.href=`./brand/favicon-${t}.svg`;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content',t==='dark'?'#1b1c1f':'#ffd400');
    // header logo: black tile on the yellow bar, yellow tile on the dark bar
    const bi=document.querySelector('.brand-icon');if(bi)bi.src=`./brand/syung-${t==='dark'?'light':'dark'}.svg`;
    // settings row: 자동 / 라이트 / 다크; in 자동 the icon is the sun over the map and the note gives sunrise / sunset
    for(const b of document.querySelectorAll('[data-theme-choice]'))b.setAttribute('aria-pressed',String(b.dataset.themeChoice===themeChoice));
    const ti=$('themeIcon'),tn=$('themeNote');
    if(ti&&tn){
      if(themeChoice==='auto'){const sa=sunArcIcon();ti.innerHTML=sa.svg;tn.textContent=`일출 ${sa.rise}\n일몰 ${sa.set}`}
      else{ti.innerHTML=ICONS[t==='dark'?'moon':'sun'];tn.textContent=''}
    }
    if(!live.ready)return;
    const set=(id,prop,v)=>{if(map.getLayer(id))map.setPaintProperty(id,prop,v)};
    set('background','background-color',P.bg);map.triggerRepaint();
    set('bm-water','fill-color',P.water);set('bm-park','fill-color',P.park);set('bm-landcover','fill-color',P.land);set('bm-bld','fill-color',P.bld);
    set('bm-bld3d','fill-extrusion-color',P.bld3d);set('bm-bld3d','fill-extrusion-opacity',S.city.enabled?0:P.bld3dOpacity);if(map.getLayer('bm-bld3d')){map.setFilter('bm-bld3d',S.map.towersAsRides?['<',['coalesce',['get','render_height'],10],S.park.towerM]:null);map.setPaintProperty('bm-bld3d','fill-extrusion-vertical-gradient',S.map.verticalGradient)}   // the towers are rides on the coaster
    set('bm-road-minor','line-color',P.roadMinor);set('bm-road-major','line-color',P.roadMajor);set('bm-rail','line-color',P.rail);
    for(const [id,c] of [['bm-label-place',P.text],['bm-label-road',P.road],['bm-label-water',P.waterText],['bm-label-park',P.parkText],['bm-label-poi',P.poi]]){set(id,'text-color',c);set(id,'text-halo-color',P.halo)}
    set('station-labels','text-color',P.stationText);set('station-labels','text-halo-color',P.halo);
    applyCityStyle(map,{on:S.city.enabled,theme:t,tone:S.city.tone,mapOn:$('toggleMap').getAttribute('aria-pressed')==='true',pack:S.city.pack,ride:!!rider.ride});   // city-life: the city ground's layers in this theme and mode (the stock roads step aside)
    applyGroundTexture(map,{on:S.city.groundTexture&&$('toggleMap').getAttribute('aria-pressed')==='true',theme:t,pack:S.city.pack});   // 조선: 흙 질감 (packed earth instead of a flat floor)
    syncCity();   // city-build: the buildings follow the mode and theme
  }
  document.head.insertAdjacentHTML('beforeend',`<style>
html[data-theme=dark]{--board:#0f171b;--paper:#152026;--ink:#e2ebee;--secondary:#a2b3b8;--muted:#8799a0;--rule:#28383f;--navy:#0a171d;--control:#1b2930;--selected:#213d48;color-scheme:dark}
html[data-theme=dark] .map{background-color:#10181c!important;background-image:linear-gradient(rgba(160,200,210,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(160,200,210,.05) 1px,transparent 1px)!important}
html[data-theme=dark] .map-status,html[data-theme=dark] .legend{background:rgba(21,32,38,.94);border-color:rgba(160,190,200,.18);color:var(--secondary)}
html[data-theme=dark] .map-toggle,html[data-theme=dark] .train-toggle,html[data-theme=dark] .webgl-zoom{background:#152026;color:var(--ink);border-color:#3a4b52}
html[data-theme=dark] .map-toggle[aria-pressed=true],html[data-theme=dark] .train-toggle[aria-pressed=true]{background:#2b6f8f;border-color:#2b6f8f;color:#fff}
html[data-theme=dark] .search input,html[data-theme=dark] .line-select{background:var(--control);color:var(--ink);border-color:#3a4b52}
html[data-theme=dark] .maplibregl-ctrl-group{background:#152026}html[data-theme=dark] .maplibregl-ctrl-group button+button{border-top-color:#2b3a40}
html[data-theme=dark] .maplibregl-ctrl-group button .maplibregl-ctrl-icon{filter:invert(1) hue-rotate(180deg)}
html[data-theme=dark] .maplibregl-popup-content{background:#152026;color:var(--ink)}html[data-theme=dark] .maplibregl-popup-tip{border-top-color:#152026;border-bottom-color:#152026}
html[data-theme=dark] .train-inspect .sec{color:var(--ink);border-bottom-color:#2b3a40}
.theme-toggle{top:206px}
#lineSelect{display:none}
.map-status{display:none}   /* title/description box over the map: removed */   /* line filter: the list of line buttons below is enough */
</style>`);
  for(const b of document.querySelectorAll('[data-map-color]'))b.onclick=()=>{mapColor=b.dataset.mapColor;try{localStorage.setItem(MAP_COLOR_KEY,mapColor)}catch{}applyTheme()};
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.onclick=()=>{themeChoice=b.dataset.themeChoice;try{localStorage.setItem(THEME_KEY,themeChoice)}catch{}applyTheme()};
  $('themeNote').closest('.setting-row').title='자동은 해 뜨면 라이트, 해 지면 다크.';
  setInterval(()=>{if(themeChoice==='auto')applyTheme();updateSun()},5*60*1000);

  // ---- sun position icon (theme button in 자동) -------------------------------------------------
  // Horizon, the day's arc filled up to the sun's place (moon + night progress after sunset).
  function sunArcIcon(){
    // Top-down: the ring is the horizon around "here"; the sun sits at its compass bearing as seen on the
    // map (rotates with the map), nearer the centre the higher it is; the stub from the centre is the
    // shadow, pointing the same way as the building shadows.
    const now=window.__sunTime||new Date(),{rise,set}=seoulSun(now),hm=d=>d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
    const {elevation:el,azimuth:az}=sunPosition(now),day=el>0,f=n=>n.toFixed(1);
    const S=22,c=S/2,R=8.5,ang=(az-(live.ready?map.getBearing():0))*Math.PI/180,r=R*(1-Math.max(0,Math.min(90,el))/90*.75);
    const sx=c+Math.sin(ang)*r,sy=c-Math.cos(ang)*r,len=day?Math.min(7,1.2/Math.tan(Math.max(4,el)*Math.PI/180)*3):0;
    const hx=c-Math.sin(ang)*len,hy=c+Math.cos(ang)*len;
    const svg=day
      ?`<svg width="22" height="22" viewBox="0 0 ${S} ${S}" aria-hidden="true">
       <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.1" stroke-dasharray="2 1.6"/>
       <line x1="${c}" y1="${c}" x2="${f(hx)}" y2="${f(hy)}" stroke="currentColor" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>
       <circle cx="${c}" cy="${c}" r="1.4" fill="currentColor"/>
       <circle cx="${f(sx)}" cy="${f(sy)}" r="3.2" fill="#f5a524" stroke="#d98a0b" stroke-width="1"/></svg>`
      :`<svg width="22" height="22" viewBox="0 0 ${S} ${S}" aria-hidden="true">
       <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="1.1" stroke-dasharray="2 1.6"/>
       <path d="M${c+1.8} ${c-5}a5 5 0 1 0 3.3 8.3a4 4 0 1 1-3.3-8.3z" fill="#b8c9da" stroke="#7f97b0" stroke-width=".7"/></svg>`;
    return {svg,rise:hm(rise),set:hm(set),day};
  }

  return {effectiveTheme,mapPalette,applyTheme,sunArcIcon,get themeChoice(){return themeChoice},get mapColor(){return mapColor}};
}
