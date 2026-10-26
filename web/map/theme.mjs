// 밝은 · 어두운 테마와 지도 색(차분 · 컬러), 롤코 공원 색, 설정 버튼 · 5분마다 자동 테마, 해 궤적 띠(자동일 때 테마 줄 아래).
// themeChoice · mapColor 의 주인(바깥은 getter). 기기 저장은 내 설정 창구(prefs — web/user/prefs.mjs), 고른 값이 없으면 지금 모드 설정의 기본값.
// 색 자료는 지금 모드 설정의 map.themes · colors · park(원본 web/modes/basic/palette.mjs, 모드가 덧쓸 수 있다).
// 다른 화면 파일을 import 하지 않는다: 바뀌는 값(지금 모드의 설정 live.settings · 버스 층 · 지도 준비)은 live.<이름> 으로 읽는다. applyTheme 를 만들 때 부르지 않는다(본체가 부른다).
export function createMapTheme({map,$,ICONS,seoulSun,cityPalette,applyCityStyle,applyGroundTexture,syncCity,updateSun,focusRoute,journeyMap,rider,prefs,live}){
  // ---- light / dark theme --------------------------------------------------------------------
  // 자동 (default): light from sunrise to sunset in Seoul, dark at night; 라이트 / 다크: fixed by the viewer.
  const mixHex=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
  // 고른 값이 없으면 지금 모드 설정의 기본값을 그때그때(모드가 바뀌면 그 모드의 기본값)
  const cur={get mapColor(){return prefs.get('mapColor')??live.settings.mapColor},get themeChoice(){return prefs.get('themeChoice')??live.settings.themeChoice}};
  // 섞는 차례는 지금 모드 설정의 map.paletteKind: base(바탕) · city(+도시 땅) · park-city(+공원 색, 마지막에 도시 땅)
  const mapPalette=(t=effectiveTheme())=>{const S=live.settings,P={...S.map.themes[t],...(cur.mapColor==='color'?S.map.colors[t]:{})};if(S.map.paletteKind!=='park-city')return S.map.paletteKind==='city'?{...P,...cityPalette(t,{pack:S.city.pack,tone:S.city.tone})}:P;   // city-life: 심시티 — the ground from the style pack
    const K=S.map.park[t],m=cur.mapColor==='color'?0:.15,Q={...P,...K,bld3dOpacity:1};for(const k of ['bg','park','land','water','bld'])Q[k]=mixHex(K[k],K.bg,m);
    const id=['abs',['to-number',['id'],0]];   // ids run in tens and hundreds (osm id × 10…): two residues multiplied mix them
    Q.bld3d=['match',['%',['floor',['/',['*',['%',id,9973],['%',id,9967]],7]],6],...K.blocks.slice(0,5).flatMap((v,i)=>[i,v]),K.blocks[5]];return {...Q,...cityPalette(t,{pack:S.city.pack,tone:S.city.tone,ride:!!rider.ride})}};   // city-life: the park sits on the same city ground, toned down (spec §7)
  // Sunrise / sunset for Seoul (sunrise equation; accurate to a few minutes)
  function effectiveTheme(){if(cur.themeChoice!=='auto')return cur.themeChoice;const now=new Date(),{rise,set}=seoulSun(now);return now>=rise&&now<set?'light':'dark'}
  function applyTheme(){queueMicrotask(()=>{if(map.getLayer?.('journey-veil'))focusRoute(!!journeyMap.routeBounds)});
    const t=effectiveTheme(),P=mapPalette(),S=live.settings;
    live.busLayer?.setTheme(t);   // bus: the same light/dark setting as the map
    for(const b of document.querySelectorAll('[data-map-color]'))b.setAttribute('aria-pressed',String(b.dataset.mapColor===cur.mapColor));
    document.documentElement.dataset.theme=t;
    // favicon follows the map theme (the <link media> pair only knows the OS setting)
    for(const l of document.querySelectorAll('link[data-theme-icon]'))l.href=`./brand/favicon-${t}.svg`;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content',t==='dark'?'#1b1c1f':'#ffd400');
    // header logo: black tile on the yellow bar, yellow tile on the dark bar
    const bi=document.querySelector('.brand-icon');if(bi)bi.src=`./brand/syung-${t==='dark'?'light':'dark'}.svg`;
    // 설정 테마 줄: 자동 / 라이트 / 다크. 아이콘은 해 · 달(자동이면 지금 낮인지 밤인지), 자동일 때만 아래에 해 궤적 띠
    for(const b of document.querySelectorAll('[data-theme-choice]'))b.setAttribute('aria-pressed',String(b.dataset.themeChoice===cur.themeChoice));
    const ti=$('themeIcon'),ta=$('themeArc');
    if(ti&&ta){
      if(cur.themeChoice==='auto'){const sa=sunArc();ti.innerHTML=ICONS[sa.day?'sun':'moon'];ta.innerHTML=sa.html;ta.hidden=false}
      else{ti.innerHTML=ICONS[t==='dark'?'moon':'sun'];ta.hidden=true;ta.textContent=''}
    }
    if(!live.ready)return;
    const set=(id,prop,v)=>{if(map.getLayer(id))map.setPaintProperty(id,prop,v)};
    set('background','background-color',P.bg);map.triggerRepaint();
    set('bm-water','fill-color',P.water);set('bm-park','fill-color',P.park);set('bm-landcover','fill-color',P.land);set('bm-bld','fill-color',P.bld);
    set('bm-bld3d','fill-extrusion-color',P.bld3d);set('bm-bld3d','fill-extrusion-opacity',S.city.enabled?0:P.bld3dOpacity);if(map.getLayer('bm-bld3d'))map.setPaintProperty('bm-bld3d','fill-extrusion-vertical-gradient',S.map.verticalGradient)
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
  for(const b of document.querySelectorAll('[data-map-color]'))b.onclick=()=>{prefs.set('mapColor',b.dataset.mapColor);applyTheme()};
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.onclick=()=>{prefs.set('themeChoice',b.dataset.themeChoice);applyTheme()};
  $('themeIcon').closest('.setting-row').title='자동은 해 뜨면 라이트, 해 지면 다크.';
  setInterval(()=>{if(cur.themeChoice==='auto')applyTheme();updateSun()},5*60*1000);

  // ---- 해 궤적 띠 (자동일 때 테마 줄 아래) ------------------------------------------------------
  // 지평선 위 반원: 낮에는 해가 일출(왼쪽) → 일몰(오른쪽) 사이 지금 자리에, 밤에는 달이 일몰 → 다음 일출 사이 지금 자리에.
  // 지나온 길은 실선, 남은 길은 점선. 양 끝 아래에 그 두 시각. window.__sunTime 으로 다른 시각을 미리 볼 수 있다
  function sunArc(){
    const now=window.__sunTime||new Date(),{rise,set}=seoulSun(now),day=now>=rise&&now<set,f=n=>n.toFixed(1);
    const hm=d=>d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
    // 밤: 해 뜨기 전이면 어제 일몰부터, 해 진 뒤면 내일 일출까지
    const from=day?rise:(now<rise?seoulSun(new Date(now-864e5)).set:set),to=day?set:(now<rise?rise:seoulSun(new Date(+now+864e5)).rise);
    const p=Math.max(0,Math.min(1,(now-from)/(to-from)));
    const W=300,cx=W/2,cy=62,rx=126,ry=50,a=Math.PI*(1-p),x=cx+Math.cos(a)*rx,y=cy-Math.sin(a)*ry,x0=cx-rx,x1=cx+rx;
    const body=day
      ?`<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="#f5a524" stroke="#d98a0b" stroke-width="1.5"/>`
      :`<path d="M${f(x+2.5)} ${f(y-7)}a7 7 0 1 0 4.6 11.6a5.6 5.6 0 1 1-4.6-11.6z" fill="#b8c9da" stroke="#7f97b0" stroke-width="1"/>`;
    const svg=`<svg viewBox="0 0 ${W} 72" aria-hidden="true">
       <line x1="12" y1="${cy}" x2="${W-12}" y2="${cy}" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5" stroke-linecap="round"/>
       <path d="M${x0} ${cy}A${rx} ${ry} 0 0 1 ${x1} ${cy}" fill="none" stroke="currentColor" stroke-opacity="${day?.35:.25}" stroke-width="1.5" stroke-dasharray="4 4"/>
       <path d="M${x0} ${cy}A${rx} ${ry} 0 0 1 ${f(x)} ${f(y)}" fill="none" stroke="currentColor" stroke-opacity="${day?.75:.5}" stroke-width="2" stroke-linecap="round"/>
       ${body}</svg>`;
    const ends=day?[`일출 ${hm(rise)}`,`일몰 ${hm(set)}`]:[`일몰 ${hm(from)}`,`일출 ${hm(to)}`];
    return {html:`${svg}<div class="theme-arc-times"><span>${ends[0]}</span><span>${ends[1]}</span></div>`,day};
  }

  return {effectiveTheme,mapPalette,applyTheme,get themeChoice(){return cur.themeChoice},get mapColor(){return cur.mapColor}};
}
