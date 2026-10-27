// 밝은 · 어두운 테마와 지도 색(차분 · 컬러), 롤코 공원 색, 메뉴의 테마 카드 · 안내 한 줄 · 5분마다 자동 테마.
// themeChoice · mapColor 의 주인(바깥은 getter). 테마는 기기 저장(prefs — web/user/prefs.mjs), 고른 값이 없으면 지금 모드 설정의 기본값.
// 지도 색은 메뉴에서 뺐다(2026-10-26) — 저장된 값(subway-map-color)은 읽지 않고 늘 모드 설정의 기본값(basic: calm).
// 색 자료는 지금 모드 설정의 map.themes · colors · park(원본 web/modes/basic/palette.mjs, 모드가 덧쓸 수 있다).
// 다른 화면 파일을 import 하지 않는다: 바뀌는 값(지금 모드의 설정 live.settings · 버스 층 · 지도 준비)은 live.<이름> 으로 읽는다. applyTheme 를 만들 때 부르지 않는다(본체가 부른다).
import type { Map as MapLibre } from 'maplibre-gl';
import type { UserPrefs } from '../user/prefs.mts';

// 지도 색 한 벌(밝은 · 어두운 각각 — modes/basic/palette.mts MAP_THEMES 등)
type Palette = Record<string, string | number | unknown[]>;
// 공원 색(PARK_COLORS): 건물 여섯 색 + 땅 색
type ParkPalette = Palette & { blocks:string[]; bg:string };
type Theme = 'light' | 'dark';
// 지금 모드 설정에서 이 파일이 읽는 칸(modes/basic/index.mjs)
interface ThemeSettings {
  mapColor:string; themeChoice:string;
  map:{ themes:Record<Theme,Palette>; colors:Record<Theme,Palette>; park:Record<Theme,ParkPalette>; paletteKind:string; verticalGradient:boolean };
  city:{ pack:unknown; tone:unknown; enabled:boolean; groundTexture:unknown };
}
interface ThemeLive { settings:ThemeSettings; busLayer?:{ setTheme(theme:Theme):void }|null; ready:boolean }
export interface MapThemeDeps {
  map:MapLibre; $:(id:string)=>HTMLElement|null; seoulSun:(date?:Date)=>{ rise:Date; set:Date };
  cityPalette:(theme:Theme, options:{ pack:unknown; tone:unknown; ride?:boolean })=>Palette;
  applyCityStyle:(map:MapLibre, options:Record<string,unknown>)=>void; applyGroundTexture:(map:MapLibre, options:Record<string,unknown>)=>void;
  syncCity:()=>void; updateSun:()=>void; focusRoute:(on:boolean)=>void; journeyMap:{ routeBounds:unknown };
  rider:{ ride:unknown }; prefs:UserPrefs; live:ThemeLive;
}
export function createMapTheme({map,$,seoulSun,cityPalette,applyCityStyle,applyGroundTexture,syncCity,updateSun,focusRoute,journeyMap,rider,prefs,live}:MapThemeDeps){
  // ---- light / dark theme --------------------------------------------------------------------
  // 자동 (default): light from sunrise to sunset in Seoul, dark at night; 라이트 / 다크: fixed by the viewer.
  const mixHex=(a:string,b:string,t:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
  // 고른 값이 없으면 지금 모드 설정의 기본값을 그때그때(모드가 바뀌면 그 모드의 기본값)
  const cur={get mapColor(){return live.settings.mapColor},get themeChoice(){return prefs.get('themeChoice')??live.settings.themeChoice}};
  // 섞는 차례는 지금 모드 설정의 map.paletteKind: base(바탕) · city(+도시 땅) · park-city(+공원 색, 마지막에 도시 땅)
  const mapPalette=(t=effectiveTheme()):Palette=>{const S=live.settings,P={...S.map.themes[t],...(cur.mapColor==='color'?S.map.colors[t]:{})};if(S.map.paletteKind!=='park-city')return S.map.paletteKind==='city'?{...P,...cityPalette(t,{pack:S.city.pack,tone:S.city.tone})}:P;   // city-life: 심시티 — the ground from the style pack
    const K=S.map.park[t],m=cur.mapColor==='color'?0:.15,Q:Palette={...P,...K,bld3dOpacity:1};for(const k of ['bg','park','land','water','bld'])Q[k]=mixHex(K[k] as string,K.bg,m);
    const id=['abs',['to-number',['id'],0]];   // ids run in tens and hundreds (osm id × 10…): two residues multiplied mix them
    Q.bld3d=['match',['%',['floor',['/',['*',['%',id,9973],['%',id,9967]],7]],6],...K.blocks.slice(0,5).flatMap((v,i)=>[i,v]),K.blocks[5]];return {...Q,...cityPalette(t,{pack:S.city.pack,tone:S.city.tone,ride:!!rider.ride})}};   // city-life: the park sits on the same city ground, toned down (spec §7)
  // Sunrise / sunset for Seoul (sunrise equation; accurate to a few minutes)
  function effectiveTheme():Theme{if(cur.themeChoice!=='auto')return cur.themeChoice as Theme;const now=new Date(),{rise,set}=seoulSun(now);return now>=rise&&now<set?'light':'dark'}
  function applyTheme():void{queueMicrotask(()=>{if(map.getLayer?.('journey-veil'))focusRoute(!!journeyMap.routeBounds)});
    const t=effectiveTheme(),P=mapPalette(),S=live.settings;
    live.busLayer?.setTheme(t);   // bus: the same light/dark setting as the map
    document.documentElement.dataset.theme=t;
    // favicon follows the map theme (the <link media> pair only knows the OS setting)
    for(const l of document.querySelectorAll<HTMLLinkElement>('link[data-theme-icon]'))l.href=`./brand/favicon-${t}.svg`;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content',t==='dark'?'#1b1c1f':'#ffd400');
    // header logo: black tile on the yellow bar, yellow tile on the dark bar
    const bi=document.querySelector<HTMLImageElement>('.brand-icon');if(bi)bi.src=`./brand/syung-${t==='dark'?'light':'dark'}.svg`;
    // 메뉴의 테마 카드(자동 · 라이트 · 다크) 아래 한 줄: 자동이면 지금 테마와 다음에 바뀌는 때(서울 해 뜨고 지는 시각), 고정이면 자동이 뭔지
    for(const b of document.querySelectorAll<HTMLElement>('[data-theme-choice]'))b.setAttribute('aria-pressed',String(b.dataset.themeChoice===cur.themeChoice));
    const tn=$('themeNote');
    if(tn){
      if(cur.themeChoice==='auto'){
        // 다음에 바뀌는 때: 낮이면 오늘 일몰, 일출 전이면 오늘 일출, 일몰 뒤면 내일 일출(서울 날짜 기준 seoulSun 에 하루 뒤를 준다)
        const now=new Date(),{rise,set}=seoulSun(now),nextRise=now>=set?seoulSun(new Date(now.getTime()+864e5)).rise:rise;
        tn.innerHTML=t==='dark'?`지금은 <b>다크</b> · ${hm(nextRise)} 해 뜨면 라이트로`:`지금은 <b>라이트</b> · ${hm(set)} 해 지면 다크로`;
      }else tn.textContent='자동은 해 뜨면 라이트, 해 지면 다크예요';
    }
    drawSky();
    if(!live.ready)return;
    const set=(id:string,prop:Parameters<MapLibre['setPaintProperty']>[1],v:unknown)=>{if(map.getLayer(id))map.setPaintProperty(id,prop,v as Parameters<MapLibre['setPaintProperty']>[2])};
    set('background','background-color',P.bg);map.triggerRepaint();
    set('bm-water','fill-color',P.water);set('bm-park','fill-color',P.park);set('bm-landcover','fill-color',P.land);set('bm-bld','fill-color',P.bld);
    set('bm-bld3d','fill-extrusion-color',P.bld3d);set('bm-bld3d','fill-extrusion-opacity',S.city.enabled?0:P.bld3dOpacity);if(map.getLayer('bm-bld3d'))map.setPaintProperty('bm-bld3d','fill-extrusion-vertical-gradient',S.map.verticalGradient)
    set('bm-road-minor','line-color',P.roadMinor);set('bm-road-major','line-color',P.roadMajor);set('bm-rail','line-color',P.rail);
    for(const [id,c] of [['bm-label-place',P.text],['bm-label-road',P.road],['bm-label-water',P.waterText],['bm-label-park',P.parkText],['bm-label-poi',P.poi]] as [string,unknown][]){set(id,'text-color',c);set(id,'text-halo-color',P.halo)}
    set('station-labels','text-color',P.stationText);set('station-labels','text-halo-color',P.halo);
    applyCityStyle(map,{on:S.city.enabled,theme:t,tone:S.city.tone,mapOn:true,pack:S.city.pack,ride:!!rider.ride});   // city-life: the city ground's layers in this theme and mode (the stock roads step aside)
    applyGroundTexture(map,{on:S.city.groundTexture,theme:t,pack:S.city.pack});   // 조선: 흙 질감 (packed earth instead of a flat floor)
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
  for(const b of document.querySelectorAll<HTMLElement>('[data-theme-choice]'))b.onclick=()=>{prefs.set('themeChoice',b.dataset.themeChoice!);applyTheme()};
  setInterval(()=>{if(cur.themeChoice==='auto')applyTheme();else drawSky();updateSun()},5*60*1000);   // 고정 테마여도 하늘 그림의 해 · 달은 움직인다

  // ---- 하늘 띠(메뉴 맨 위 · 테마 세그먼트 위, 늘 보임) — 슝 그림: 산 · 서울 빌딩(남산타워 · 롯데타워) 앞 선로를 동글한 지하철이 달리고,
  // 낮엔 구름 하늘에 웃는 해가 지평선 위 호를 왼쪽(해 뜸) → 오른쪽(해 짐), 밤엔 별 하늘에 졸린 달이 오른쪽 → 왼쪽(해 진 뒤 → 다음 해 뜰 때). 밤엔 창문 · 전조등이 켜진다.
  // 호는 2차 베지어(양 끝 지평선 · 가운데 조절점) — 해 · 달은 그 곡선의 t=진행 자리. 밤 길이는 하루에서 낮을 뺀 값(다음 일출을 오늘 일출 시각으로 어림)
  const hm=(d:Date)=>d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
  // 메뉴 맨 위 하늘 그림: 고른 테마와 상관없이 늘 지금 실제 하늘(낮 · 밤)
  function drawSky():void{
    const sp=$('sunPath');if(!sp)return;
    const now=new Date(),{rise,set}=seoulSun(now);
    sp.innerHTML=sunPathHTML(now,rise,set);sp.classList.toggle('is-night',!(now>=rise&&now<set));
  }
  function sunPathHTML(now:Date,rise:Date,set:Date):string{
    const W=320,H=110,left=30,right=290,base=84,arcBase=62,top=-22,dayLen=+set-+rise,day=now>=rise&&now<set,nightLen=864e5-dayLen;
    const clamp=(v:number)=>Math.min(1,Math.max(0,v));
    const night=clamp(now>=set?(+now-+set)/nightLen:1-(+rise-+now)/nightLen),t=day?clamp((+now-+rise)/dayLen):1-night,u=1-t;   // 날짜 빼기는 숫자로(+): 같은 값
    const x=u*u*left+2*u*t*(W/2)+t*t*right,y=u*u*arcBase+2*u*t*top+t*t*arcBase,f=(n:number)=>n.toFixed(1);   // 길 양 끝은 산마루 높이 — 뜰 · 질 무렵 해가 산 위로 반쯤 보인다
    const C=day
      ?{sky:['#7cc8ff','#d8f0ff'],hill:'#9fd39a',hill2:'#7cbf86',city:'#8fb3d9',city2:'#a9c6e6',win:'#d8ecff',ground:'#f3e2a9',rail:'#c9a85a',path:'#ffffff'}
      :{sky:['#1b2346','#3b3f78'],hill:'#2b3466',hill2:'#232b57',city:'#1f2750',city2:'#283163',win:'#ffe08a',ground:'#171c38',rail:'#4b5487',path:'#c8d2ff'};
    // 낮: 몽글 구름 · 밤: 반짝 별(네 갈래)
    const cloud=(cx:number,cy:number,k:number)=>`<g fill="#fff" opacity=".92" transform="translate(${cx} ${cy}) scale(${k})"><circle cx="0" cy="0" r="7"/><circle cx="9" cy="-4" r="9"/><circle cx="19" cy="0" r="7"/><rect x="0" y="0" width="19" height="7" rx="3.5"/></g>`;
    const star=(sx:number,sy:number,k:number)=>`<path transform="translate(${sx} ${sy}) scale(${k})" d="M0-4Q.6-.6 4 0Q.6 .6 0 4Q-.6 .6-4 0Q-.6-.6 0-4z" fill="#fff6c9"/>`;
    const deco=day?cloud(24,22,.9)+cloud(236,16,.75)+cloud(92,40,.55)
      :[[22,16,1],[70,34,.7],[118,12,.9],[200,22,.7],[262,12,1.1],[300,36,.7],[160,46,.6],[48,52,.5]].map(([a,b2,k])=>star(a!,b2!,k!)).join('');
    // 산(북한산 느낌 두 겹)
    const hills=`<path d="M0 ${base}L0 60Q30 40 62 56Q92 34 128 58Q150 50 170 ${base}Z" fill="${C.hill2}"/><path d="M150 ${base}Q200 44 248 60Q280 46 320 58L320 ${base}Z" fill="${C.hill}"/>`;
    // 서울 빌딩: 낮은 상자들 + 남산타워(언덕 위 뾰족) + 롯데타워(가늘고 높은 뿔)
    const box=(bx:number,bw:number,bh:number,c:string)=>`<rect x="${bx}" y="${base-bh}" width="${bw}" height="${bh}" rx="2" fill="${c}"/>`;
    const wins=(bx:number,bw:number,bh:number)=>{let w='';for(let wy=base-bh+4;wy<base-4;wy+=6)for(let wx=bx+3;wx<bx+bw-3;wx+=5)w+=`<rect x="${wx}" y="${wy}" width="2" height="2.6" rx=".6" fill="${C.win}" opacity="${day?.7:((wx*7+wy*3)%5?1:.25)}"/>`;return w};
    const blocks:[number,number,number,string][]=[[96,14,18,C.city2],[112,10,26,C.city],[124,16,16,C.city2],[186,12,22,C.city],[200,16,14,C.city2],[218,10,30,C.city],[230,14,18,C.city2]];
    const city=blocks.map(([bx,bw,bh,c])=>box(bx,bw,bh,c)+wins(bx,bw,bh)).join('')
      +`<path d="M146 ${base}L146 ${base-14}Q160 ${base-24} 174 ${base-14}L174 ${base}Z" fill="${C.hill}"/>`   // 남산
      +`<rect x="158.6" y="${base-44}" width="2.8" height="24" fill="${C.city}"/><rect x="155" y="${base-40}" width="10" height="5" rx="2.5" fill="${C.city}"/><circle cx="160" cy="${base-46}" r="1.6" fill="${day?'#ff7a7a':'#ff9a9a'}"/>`   // 남산타워
      +`<path d="M262 ${base}L265 ${base-52}L267 ${base-56}L269 ${base-52}L272 ${base}Z" fill="${C.city}"/>`;   // 롯데타워
    // 해: 웃는 얼굴 + 볼 · 달: 졸린 얼굴 + z
    const face=(fx:number,fy:number,sleepy:boolean)=>sleepy
      ?`<path d="M${f(fx-5)} ${f(fy-1)}q2 2 4 0M${f(fx+1)} ${f(fy-1)}q2 2 4 0" fill="none" stroke="#7a6a3a" stroke-width="1.3" stroke-linecap="round"/><path d="M${f(fx-1.5)} ${f(fy+4)}q1.5 1 3 0" fill="none" stroke="#7a6a3a" stroke-width="1.2" stroke-linecap="round"/>`
      :`<circle cx="${f(fx-3.6)}" cy="${f(fy-1.5)}" r="1.3" fill="#5a3a00"/><circle cx="${f(fx+3.6)}" cy="${f(fy-1.5)}" r="1.3" fill="#5a3a00"/><path d="M${f(fx-3)} ${f(fy+2.2)}q3 3 6 0" fill="none" stroke="#5a3a00" stroke-width="1.4" stroke-linecap="round"/>`;
    const cheeks=(cx:number,cy:number)=>`<circle cx="${f(cx-6.5)}" cy="${f(cy+2)}" r="2" fill="#ff8a8a" opacity=".6"/><circle cx="${f(cx+6.5)}" cy="${f(cy+2)}" r="2" fill="#ff8a8a" opacity=".6"/>`;
    const rays=[0,45,90,135,180,225,270,315].map(deg=>{const r1=13.5,r2=17.5,rad=deg*Math.PI/180;return `M${f(x+Math.cos(rad)*r1)} ${f(y+Math.sin(rad)*r1)}L${f(x+Math.cos(rad)*r2)} ${f(y+Math.sin(rad)*r2)}`}).join('');
    const body=day
      ?`<circle cx="${f(x)}" cy="${f(y)}" r="20" fill="#fff8d6" opacity=".55"/><path d="${rays}" stroke="#ffb21a" stroke-width="2.6" stroke-linecap="round"/><circle cx="${f(x)}" cy="${f(y)}" r="11" fill="#ffc21a" stroke="#f39a00" stroke-width="1.6"/>${face(x,y,false)}${cheeks(x,y)}`
      :`<circle cx="${f(x)}" cy="${f(y)}" r="17" fill="#fff4c7" opacity=".18"/><circle cx="${f(x)}" cy="${f(y)}" r="11" fill="#fff4c7" stroke="#e9d68f" stroke-width="1.4"/><circle cx="${f(x+4)}" cy="${f(y-5)}" r="1.8" fill="#eadfae"/><circle cx="${f(x-5)}" cy="${f(y+5)}" r="1.3" fill="#eadfae"/>${face(x,y,true)}${cheeks(x,y)}<text x="${f(x+12)}" y="${f(y-9)}" font-size="8" font-weight="700" fill="#c8d2ff">z</text><text x="${f(x+17)}" y="${f(y-15)}" font-size="6" font-weight="700" fill="#c8d2ff">z</text>`;
    // 땅 · 선로 · 지하철(흰 몸통 + 2호선 초록 띠, 둥근 앞머리, 밤엔 전조등)
    const tx=118,ty=base-11;
    const car=(cx:number,front:boolean)=>`<rect x="${cx}" y="${ty}" width="34" height="13" rx="${front?6:3}" fill="#ffffff" stroke="#3a3f4a" stroke-width="1"/><rect x="${cx}" y="${ty+8}" width="34" height="2.4" fill="#00a84d"/>${[4,12,20].map(o=>`<rect x="${cx+o}" y="${ty+2.4}" width="6" height="4.4" rx="1.4" fill="${day?'#9fd4ff':'#ffe08a'}"/>`).join('')}`;
    const train=car(tx,false)+car(tx+36,true)
      +`<rect x="${tx+63}" y="${ty+2.4}" width="5" height="4.4" rx="1.6" fill="${day?'#9fd4ff':'#ffe08a'}"/><circle cx="${tx+64}" cy="${ty+9}" r="1.1" fill="#3a3f4a"/>`
      +(day?'':`<path d="M${tx+70} ${ty+6}L${tx+96} ${ty+1}L${tx+96} ${ty+13}Z" fill="#ffe08a" opacity=".28"/>`)
      +`<circle cx="${tx+6}" cy="${ty+13.5}" r="2" fill="#3a3f4a"/><circle cx="${tx+28}" cy="${ty+13.5}" r="2" fill="#3a3f4a"/><circle cx="${tx+42}" cy="${ty+13.5}" r="2" fill="#3a3f4a"/><circle cx="${tx+64}" cy="${ty+13.5}" r="2" fill="#3a3f4a"/>`
      +`<path d="M${tx-6} ${ty+5}h-8M${tx-5} ${ty+9}h-12" stroke="${C.path}" stroke-opacity=".8" stroke-width="1.6" stroke-linecap="round"/>`;   // 슝~ 바람 줄
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="sunPathSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky[0]}"/><stop offset="1" stop-color="${C.sky[1]}"/></linearGradient></defs>`
      +`<rect width="${W}" height="${H}" fill="url(#sunPathSky)"/>${deco}`
      +`<path d="M${left} ${arcBase}Q${W/2} ${top} ${right} ${arcBase}" fill="none" stroke="${C.path}" stroke-opacity=".75" stroke-width="1.8" stroke-dasharray="3 4" stroke-linecap="round"/>`
      +`${body}${hills}${city}`   // 해 · 달은 산 · 빌딩 뒤로 지고 뜬다
      +`<rect y="${base}" width="${W}" height="${H-base}" fill="${C.ground}"/><rect y="${base+2}" width="${W}" height="2" fill="${C.rail}"/>${train}</svg>`
      +`<div class="sun-times"><span>${hm(rise)} 해 뜸</span><span>해 짐 ${hm(set)}</span></div>`;
  }
  return {effectiveTheme,mapPalette,applyTheme,get themeChoice(){return cur.themeChoice},get mapColor(){return cur.mapColor}};
}
