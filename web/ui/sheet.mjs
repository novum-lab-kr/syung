// 아래 시트: 역 · 열차 · 버스 · 길찾기 상세가 지도 아래에서 올라온다(끌어 닫기 · 휴대폰 키보드 위로 올리기 · Esc), 고른 열차 · 버스 따라가기 카메라.
// 시트 상태(sheetToken · sheetTrain · following · easing · followBus · sheetStation)와 따라가기 카메라의 주인. 바깥은 같은 이름의 getter · setter 로 읽고 쓴다.
// 다른 화면 파일을 import 하지 않는다: 나중에 생기는 길찾기(journey · routeBounds) · 버스 층 · 1인칭(rider · stopRide)은 live.<이름> 으로 그때그때 읽는다.
// 만들 때 등록하는 순서(animFrame 의 열차 · 버스 카메라 → 뒤에 1인칭, Esc · dragstart)는 옛 본체 순서 그대로.
export function createBottomSheet({map,maplibregl,planner,trackPoint,trainPose,laneOffsetPx,animFrame,FOLLOW_FPS,fitRoute,live}){
  const sheet=document.createElement('section');sheet.className='sheet';sheet.hidden=true;sheet.setAttribute('aria-label','상세 정보');
  sheet.innerHTML='<button type="button" class="sheet-grab" aria-label="닫기" title="끌어내리거나 눌러서 닫기"></button><button type="button" class="sheet-close" aria-label="닫기">✕</button><div class="sheet-body"></div><button type="button" class="sheet-follow" hidden>이 열차 따라가기</button>';
  const sheetBody=sheet.querySelector('.sheet-body'),followBtn=sheet.querySelector('.sheet-follow');
  let sheetToken=0,sheetTrain=null,following=null,easing=false;
  let followBus=null;   // bus: 지도에서 누른 버스를 카메라가 따라간다(2026-10-08 덕배). 끌면 멈추고 '이 버스 따라가기'로 다시
  function openSheet(html,source='subway'){if(source!=='bus')live.busLayer?.clearSelection();sheetBody.innerHTML=html;sheet.hidden=false;sheet.style.transform='';sheet.style.transition='';requestAnimationFrame(()=>sheet.classList.add('open'));return ++sheetToken}   // bus: release the bus selection when another detail opens
  function closeSheet(){
    live.busLayer?.clearSelection();   // bus: release the highlighted bus route with the shared sheet
    if(sheet.hidden)return;
    // a field still focused keeps the keyboard up: let both go down together
    if(sheet.contains(document.activeElement))document.activeElement.blur();
    sheet.classList.remove('open');sheetToken++;sheetTrain=null;following=null;followBus=null;followBtn.hidden=true;
    // a chosen route stays on the map, with a bar to bring the results back (journey-ui)
    if(live.routeBounds&&live.journey.sheetClosed())fitRoute(110);
    else map.easeTo({padding:{top:0,bottom:0,left:0,right:0},duration:300});
    setTimeout(()=>{if(!sheet.classList.contains('open')){sheet.hidden=true;sheet.style.setProperty('--kb','0px');sheet.classList.remove('kb')}},340);   // after the .32s slide
  }
  sheet.querySelector('.sheet-close').onclick=closeSheet;
  // The handle: drag the sheet down to close it (far or fast enough), or just tap it.
  {const grab=sheet.querySelector('.sheet-grab');let y0=0,t0=0,dy=0,drag=false,moved=false;
    grab.addEventListener('pointerdown',e=>{if(e.button)return;drag=true;moved=false;y0=e.clientY;t0=performance.now();dy=0;grab.setPointerCapture(e.pointerId);sheet.style.transition='none'});
    grab.addEventListener('pointermove',e=>{if(!drag)return;dy=Math.max(0,e.clientY-y0);if(dy>4)moved=true;sheet.style.transform=`translateY(${dy}px)`});
    const end=()=>{if(!drag)return;drag=false;sheet.style.transition='';
      const fast=dy/Math.max(1,performance.now()-t0)>.6;
      if(moved&&(dy>Math.min(120,sheet.offsetHeight*.3)||fast&&dy>24)){sheet.style.transform='translateY(calc(105% + var(--kb,0px)))';closeSheet()}
      else sheet.style.transform=''};
    grab.addEventListener('pointerup',end);grab.addEventListener('pointercancel',end);
    grab.addEventListener('click',e=>{if(moved){e.preventDefault();moved=false;return}closeSheet()})}
  // Phone keyboard: only the sheet rises above it. iOS scrolls or pans the page to show a focused field
  // (header and map slide off); put the page back and lift the sheet by the keyboard's height instead.
  // iOS reports the keyboard late or only once (and not at all when a still-focused field is tapped again
  // after the keyboard was folded away), so while it moves the height is re-read every frame for a second.
  if(window.visualViewport){const vv=visualViewport;let dropTimer=0;
    const fitKeyboard=()=>{const H=document.documentElement.clientHeight||innerHeight;   // the layout height: the keyboard does not change it
      const kb=vv.scale>1.01?0:Math.max(0,Math.round(H-vv.height-vv.offsetTop));   // pinch-zoomed is not a keyboard
      if(!sheet.classList.contains('open'))return;   // closing: keep the lift until it is gone, or it jumps as the keyboard drops
      const now=parseInt(sheet.style.getPropertyValue('--kb'))||0,put=v=>{sheet.style.setProperty('--kb',v+'px');sheet.classList.toggle('kb',v>40)};
      // up at once; down only once it holds for 250 ms — moving between 출발 and 도착 makes iOS report "no keyboard"
      // for a frame or two, and following that dropped the sheet and brought it back up from the bottom
      if(kb>=now){clearTimeout(dropTimer);dropTimer=0;if(kb!==now)put(kb)}
      else if(!dropTimer)dropTimer=setTimeout(()=>{dropTimer=0;const H2=document.documentElement.clientHeight||innerHeight;
        const k2=vv.scale>1.01?0:Math.max(0,Math.round(H2-vv.height-vv.offsetTop));if(k2<(parseInt(sheet.style.getPropertyValue('--kb'))||0))put(k2)},250);
      if(scrollY||document.documentElement.scrollTop||document.body.scrollTop){scrollTo(0,0);document.body.scrollTop=0}};
    let until=0;const settle=()=>{fitKeyboard();if(performance.now()<until)requestAnimationFrame(settle)};
    const watch=()=>{const run=performance.now()>=until;until=performance.now()+1100;if(run)requestAnimationFrame(settle)};
    vv.addEventListener('resize',watch);vv.addEventListener('scroll',watch);
    for(const ev of ['focusin','focusout','pointerup'])sheet.addEventListener(ev,e=>{if(ev!=='pointerup'||e.target.closest('input,select,textarea'))watch()});
    addEventListener('scroll',()=>{if(sheet.classList.contains('kb'))fitKeyboard()},{passive:true});
    // Tapping another field: iOS focuses it by scrolling the page to it (then the page is put back: a jump).
    // Take the tap and focus without scrolling; the sheet already sits above the keyboard, so the field is in view.
    // (Not the time chip: its tap must reach the field for the phone's clock to open.)
    let tx=0,ty=0;
    sheet.addEventListener('touchstart',e=>{const t=e.touches[0];tx=t.clientX;ty=t.clientY},{passive:true});
    sheet.addEventListener('touchend',e=>{const f=e.target.closest?.('input[type=text],input[type=search],input:not([type])');const t=e.changedTouches[0];
      if(!f||document.activeElement===f||Math.hypot(t.clientX-tx,t.clientY-ty)>10)return;
      e.preventDefault();f.focus({preventScroll:true});const n=f.value.length;try{f.setSelectionRange(n,n)}catch{};watch()},{passive:false});
    // #kbdebug: the numbers behind the keyboard lift, live, for chasing a jump on a real phone
    if(location.hash.includes('kbdebug')){const o=document.createElement('pre');o.style.cssText='position:fixed;z-index:99;left:4px;top:4px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.78);color:#ffd400;border-radius:8px;pointer-events:none;white-space:pre';document.body.append(o);
      const log=[];const snap=()=>`H ${document.documentElement.clientHeight} iH ${innerHeight}\nvv ${Math.round(vv.height)} top ${Math.round(vv.offsetTop)} s ${vv.scale.toFixed(2)}\nscrollY ${Math.round(scrollY)} kb ${sheet.style.getPropertyValue('--kb')||'-'}\nfocus ${document.activeElement?.id||document.activeElement?.tagName}`;
      const tick=()=>{o.textContent=snap()+'\n'+log.slice(-6).join('\n');requestAnimationFrame(tick)};tick();
      for(const ev of ['resize','scroll'])vv.addEventListener(ev,()=>log.push(`${(performance.now()/1e3).toFixed(2)} vv.${ev} ${Math.round(vv.height)}/${Math.round(vv.offsetTop)}`));
      addEventListener('scroll',()=>log.push(`${(performance.now()/1e3).toFixed(2)} win.scroll ${Math.round(scrollY)}`),{passive:true});
      document.addEventListener('focusin',e=>log.push(`${(performance.now()/1e3).toFixed(2)} focus ${e.target.id||e.target.tagName}`))}}
  addEventListener('keydown',e=>{if(e.key==='Escape'){if(live.rider.ride)live.stopRide(true);else closeSheet()}});
  // Following: the camera keeps the chosen train in the middle of the map above the sheet.
  // Dragging the map stops it; the button in the sheet starts it again.
  const sheetPad=()=>sheet.hidden?0:Math.min(sheet.offsetHeight,map.getContainer().clientHeight*.75);   // the 길찾기 sheet grows to 72%
  function trainLngLat(plan){
    const z=map.getZoom(),unit=1/(512*2**z),q=trackPoint(plan,trainPose(plan).dist),o=(q.off+laneOffsetPx(z))*unit;
    return new maplibregl.MercatorCoordinate(q.x+q.r[0]*o,q.y+q.r[1]*o,0).toLngLat();
  }
  function follow(id){following=id;followBus=null;followBtn.hidden=true;followBtn.textContent='이 열차 따라가기';const plan=planner.plans.find(p=>p.id===id);if(!plan)return;
    easing=true;cam=null;map.once('moveend',()=>{easing=false;map.triggerRepaint()});
    map.easeTo({center:trainLngLat(plan),zoom:Math.max(map.getZoom(),16),padding:{top:0,bottom:sheetPad(),left:0,right:0},duration:700})}
  // bus: 그 버스로 옮겨 가 따라간다. 멀리 있었으면 줌 16 으로(가까이 볼 때 버스가 보이는 크기)
  // zoom: 정류장 시트에서 곧 올 버스를 따라갈 때는 그 버스로 더 가까이(17)
  function followBusStart(id,{zoom=16}={}){
    following=null;followBus=id;followBtn.hidden=true;const c=live.busLayer?.vehiclePosition(id);if(!c){followBus=null;return}
    easing=true;cam=null;map.once('moveend',()=>{easing=false;followSoon()});
    map.easeTo({center:c,zoom:Math.max(map.getZoom(),zoom),padding:{top:0,bottom:sheetPad(),left:0,right:0},duration:700});
  }
  followBtn.onclick=()=>{if(sheetTrain)follow(sheetTrain);else if(live.busLayer?.selection?.kind==='bus')followBusStart(live.busLayer.selection.id)};
  // station sheet → 길찾기 from or to this station
  let sheetStation=null;
  sheetBody.addEventListener('click',e=>{const b=e.target.closest('.st-journey [data-end]');if(!b||!sheetStation)return;
    const st=sheetStation;live.journey.openWith(b.dataset.end,{name:/역$/.test(st.name)?st.name:st.name+'역',lat:st.lat,lng:st.lon})});
  // Keep a followed train centred at FOLLOW_FPS (every display frame redrew the whole map at 60–120 Hz,
  // hot phones), on display frames (requestAnimationFrame, not timers: even steps), camera first and
  // the map with its trains drawn right after in one render. The camera eases toward the train
  // (FOLLOW_EASE s) so a correction from fresh data slides instead of jumping.
  const FOLLOW_EASE=.25;let followAt='',followRaf=0,followLast=0,cam=null,camAt=0;
  function followSoon(){if(!followRaf)followRaf=requestAnimationFrame(followLoop)}
  function followLoop(ts){followRaf=0;if(!(following||live.rider.ride||followBus)||easing)return;
    if(!live.rider.ride&&ts-followLast<1000/FOLLOW_FPS-4){followSoon();return}   // skip display frames down to FOLLOW_FPS (1인칭으로 탈 때는 화면 주사율 그대로: 30 fps 로 묶으니 풍경이 끊겨 보였다 — 2026-10-06 덕배)
    followLast=ts;if(live.rider.ride)planner.setFrame(ts);for(const f of animFrame)f();map.triggerRepaint();
    if(followBus)followSoon()}   // bus: 버스는 열차 그리기와 따로 움직여서, 따라가는 동안은 계속
  animFrame.push(()=>{
    const sel=following&&!easing&&sheetTrain&&planner.plans.find(p=>p.id===sheetTrain);if(!sel)return;
    const c=trainLngLat(sel),now=performance.now();
    if(!cam||now-camAt>1000)cam={lng:c.lng,lat:c.lat};
    else{const a=1-Math.exp(-(now-camAt)/1000/FOLLOW_EASE);cam={lng:cam.lng+(c.lng-cam.lng)*a,lat:cam.lat+(c.lat-cam.lat)*a}}
    camAt=now;
    const k=`${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;if(k===followAt)return;followAt=k;
    map.jumpTo({center:cam,padding:{top:0,bottom:sheetPad(),left:0,right:0}});
  });
  animFrame.push(()=>{   // bus: 따라가는 버스 — 열차와 같은 방식으로 카메라가 부드럽게 따라붙는다
    if(!followBus||easing)return;
    const b=live.busLayer,p=b?.selection?.kind==='bus'&&b.selection.id===followBus||b?.stopFollow===followBus?b.vehiclePosition(followBus):null;   // 정류장 시트에서 고른 곧 올 버스(stopFollow)도
    if(!p){followBus=null;return}   // 다른 걸 골랐거나 버스가 사라졌으면 그만
    const now=performance.now();
    if(!cam||now-camAt>1000)cam={lng:p[0],lat:p[1]};
    else{const a=1-Math.exp(-(now-camAt)/1000/FOLLOW_EASE);cam={lng:cam.lng+(p[0]-cam.lng)*a,lat:cam.lat+(p[1]-cam.lat)*a}}
    camAt=now;
    const k=`${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;if(k===followAt)return;followAt=k;
    map.jumpTo({center:cam,padding:{top:0,bottom:sheetPad(),left:0,right:0}});
  });
  map.on('dragstart',()=>{if(following){following=null;followBtn.hidden=!sheetTrain}
    if(followBus){followBus=null;followBtn.textContent='이 버스 따라가기';followBtn.hidden=live.busLayer?.selection?.kind!=='bus'}});

  return {sheet,sheetBody,followBtn,openSheet,closeSheet,sheetPad,trainLngLat,follow,followBusStart,followSoon,get sheetTrain(){return sheetTrain},set sheetTrain(v){sheetTrain=v},get following(){return following},set following(v){following=v},get easing(){return easing},set easing(v){easing=v},get followBus(){return followBus},set followBus(v){followBus=v},get sheetStation(){return sheetStation},set sheetStation(v){sheetStation=v},get sheetToken(){return sheetToken}};
}
