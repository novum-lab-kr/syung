// 아래 시트: 역 · 열차 · 버스 · 길찾기 상세가 지도 아래에서 올라온다(끌어 닫기 · 휴대폰 키보드 위로 올리기 · Esc), 고른 열차 · 버스 따라가기 카메라.
// 시트 상태(sheetToken · sheetTrain · following · easing · followBus · sheetStation)와 따라가기 카메라의 주인. 바깥은 같은 이름의 getter · setter 로 읽고 쓴다.
// 다른 화면 파일을 import 하지 않는다: 나중에 생기는 길찾기(journey · routeBounds) · 버스 층 · 1인칭(rider · stopRide)은 live.<이름> 으로 그때그때 읽는다.
// 만들 때 등록하는 순서(animFrame 의 열차 · 버스 카메라 → 뒤에 1인칭, Esc · dragstart)는 옛 본체 순서 그대로.
import { h, render } from 'preact';
import type { LngLat, Map as MapLibre } from 'maplibre-gl';
import { SheetFrame } from '../components/sheet_frame.tsx';

// 열차 계획(trains/plan)에서 이 파일이 쓰는 칸 · 선로 위 한 점(trackPoint)
type TrainPlanLike = import('../trains/types.mts').TrainPlan;
interface TrackPoint { x:number; y:number; r:[number,number]; off:number }
interface PlannerLike { plans:TrainPlanLike[]; setFrame(ts:number):void }
// 버스 층에서 이 파일이 부르는 것
interface BusLayerLike {
  clearSelection(options?:{ journey?:boolean }):void; selection?:{ kind:string; id:string }|null; followView?():unknown;
  followChanged?():void; vehiclePosition(id:string):[number,number]|null|undefined; stopFollow?:string|null;
}
// 시트에서 길찾기로 넘기는 역(역 자료)
type SheetStation = import('../trains/types.mts').MapStation;
// 늦게 생기는 값 · 바뀌는 값(본체가 getter 로 넘긴다)
interface SheetLive {
  busLayer?:BusLayerLike|null; routeBounds:unknown; frameMs?:number;
  journey:{ sheetClosed():boolean; openWith(end:string, place:{ name:string; lat:number; lng:number }):void };
  rider:{ ride:unknown }; stopRide(instant:boolean):void;
  appMode:boolean;   // 앱 지도 모드인가(웹 시트를 쓰지 않는다)
  appPad?:number|null;   // 앱 지도 모드: 앱 시트 높이(다리 setPadding) — 있으면 웹 시트 대신 이 값
}
export interface BottomSheetDeps {
  map:MapLibre; maplibregl:typeof import('../vendor/maplibre-gl.mjs'); planner:PlannerLike;
  trackPoint:(plan:TrainPlanLike, dist:number)=>TrackPoint; trainPose:(plan:TrainPlanLike)=>{ dist:number };
  laneOffsetPx:(zoom:number)=>number; animFrame:(()=>void)[]; FOLLOW_FPS:number; fitRoute:(bottom:number)=>void; live:SheetLive;
}
export function createBottomSheet({map,maplibregl,planner,trackPoint,trainPose,laneOffsetPx,animFrame,FOLLOW_FPS,fitRoute,live}:BottomSheetDeps){
  const sheet=document.createElement('section');sheet.className='sheet';sheet.hidden=true;sheet.setAttribute('aria-label','상세 정보');
  render(h(SheetFrame,null),sheet);   // 틀은 한 번만 그린다: 아래 동작이 그려진 단추를 찾아 걸고 고친다
  const sheetBody=sheet.querySelector<HTMLElement>('.sheet-body')!,followBtn=sheet.querySelector<HTMLButtonElement>('.sheet-follow')!;   // 바로 위 innerHTML 에 있다
  let sheetToken=0,sheetTrain:string|null=null,following:string|null=null,easing=false;
  let followBus:string|null=null,busMiss=0;   // bus: 지도에서 누른 버스를 카메라가 따라간다(2026-10-08 덕배). 끌면 멈추고 '이 버스 따라가기'로 다시
  // 몸통을 화면 조각(Preact — ui/station_sheet.tsx …)이 그렸으면 다음 것을 열 때 먼저 치운다(그 조각의 정리 함수)
  let unmountBody:(()=>void)|null=null;
  function fillBody(fill:()=>void,source:string):number{tuck(false);if(source!=='bus')live.busLayer?.clearSelection();const u=unmountBody;unmountBody=null;u?.();fill();sheet.hidden=false;sheet.style.transform='';sheet.style.transition='';requestAnimationFrame(()=>sheet.classList.add('open'));return ++sheetToken}   // bus: release the bus selection when another detail opens
  // mount: 빈 몸통에 그리고 치우는 함수를 돌려준다
  function openSheetView(mount:(body:HTMLElement)=>()=>void,source='subway'):number{return fillBody(()=>{sheetBody.textContent='';unmountBody=mount(sheetBody)},source)}
  function closeSheet():void{
    live.busLayer?.clearSelection();   // bus: release the highlighted bus route with the shared sheet
    if(sheet.hidden)return;
    // a field still focused keeps the keyboard up: let both go down together
    if(sheet.contains(document.activeElement))(document.activeElement as HTMLElement).blur();
    sheet.classList.remove('open');sheetToken++;sheetTrain=null;following=null;followBus=null;followBtn.hidden=true;
    // a chosen route stays on the map, with a bar to bring the results back (journey-ui)
    if(live.routeBounds&&live.journey.sheetClosed())fitRoute(110);
    else map.easeTo({padding:{top:0,bottom:0,left:0,right:0},duration:300});
    setTimeout(()=>{if(!sheet.classList.contains('open')){sheet.hidden=true;sheet.style.setProperty('--kb','0px');sheet.classList.remove('kb')}},340);   // after the .32s slide
  }
  // 하는 중인 시트(열차 · 버스 따라가기, 버스 노선 전체, 길찾기)는 지도 빈 곳을 눌러도 닫지 않는다 — ✕ · 끌어내리기 · Esc 로만(덕배 2026-10-20)
  // 앱 지도 모드: 시트는 앱(RN)에 있어 웹 시트는 늘 숨어 있다 — 숨김과 상관없이 따라가기 · 버스 선택으로만 본다
  function sheetBusy():boolean{const b=live.busLayer,working=!!(following||followBus||b?.selection?.kind==='bus'||b?.followView?.());return live.appMode?working:!sheet.hidden&&(working||!!sheetBody.querySelector('.journey'))}
  sheet.querySelector<HTMLButtonElement>('.sheet-close')!.onclick=closeSheet;
  // The handle: drag the sheet down to close it (far or fast enough), or just tap it.
  {const grab=sheet.querySelector<HTMLButtonElement>('.sheet-grab')!;let y0=0,t0=0,dy=0,drag=false,moved=false;
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
  if(window.visualViewport){const vv=visualViewport!;let dropTimer:ReturnType<typeof setTimeout>|number=0;
    const fitKeyboard=()=>{const H=document.documentElement.clientHeight||innerHeight;   // the layout height: the keyboard does not change it
      const kb=vv.scale>1.01?0:Math.max(0,Math.round(H-vv.height-vv.offsetTop));   // pinch-zoomed is not a keyboard
      if(!sheet.classList.contains('open'))return;   // closing: keep the lift until it is gone, or it jumps as the keyboard drops
      const now=parseInt(sheet.style.getPropertyValue('--kb'))||0,put=(v:number)=>{sheet.style.setProperty('--kb',v+'px');sheet.classList.toggle('kb',v>40)};
      // up at once; down only once it holds for 250 ms — moving between 출발 and 도착 makes iOS report "no keyboard"
      // for a frame or two, and following that dropped the sheet and brought it back up from the bottom
      if(kb>=now){clearTimeout(dropTimer);dropTimer=0;if(kb!==now)put(kb)}
      else if(!dropTimer)dropTimer=setTimeout(()=>{dropTimer=0;const H2=document.documentElement.clientHeight||innerHeight;
        const k2=vv.scale>1.01?0:Math.max(0,Math.round(H2-vv.height-vv.offsetTop));if(k2<(parseInt(sheet.style.getPropertyValue('--kb'))||0))put(k2)},250);
      if(scrollY||document.documentElement.scrollTop||document.body.scrollTop){scrollTo(0,0);document.body.scrollTop=0}};
    let until=0;const settle=()=>{fitKeyboard();if(performance.now()<until)requestAnimationFrame(settle)};
    const watch=()=>{const run=performance.now()>=until;until=performance.now()+1100;if(run)requestAnimationFrame(settle)};
    vv.addEventListener('resize',watch);vv.addEventListener('scroll',watch);
    for(const ev of ['focusin','focusout','pointerup'])sheet.addEventListener(ev,e=>{if(ev!=='pointerup'||(e.target as Element).closest('input,select,textarea'))watch()});
    addEventListener('scroll',()=>{if(sheet.classList.contains('kb'))fitKeyboard()},{passive:true});
    // Tapping another field: iOS focuses it by scrolling the page to it (then the page is put back: a jump).
    // Take the tap and focus without scrolling; the sheet already sits above the keyboard, so the field is in view.
    // (Not the time chip: its tap must reach the field for the phone's clock to open.)
    let tx=0,ty=0;
    sheet.addEventListener('touchstart',e=>{const t=e.touches[0]!;tx=t.clientX;ty=t.clientY},{passive:true});
    sheet.addEventListener('touchend',e=>{const f=(e.target as Element).closest?.<HTMLInputElement>('input[type=text],input[type=search],input:not([type])');const t=e.changedTouches[0]!;
      if(!f||document.activeElement===f||Math.hypot(t.clientX-tx,t.clientY-ty)>10)return;
      e.preventDefault();f.focus({preventScroll:true});const n=f.value.length;try{f.setSelectionRange(n,n)}catch{};watch()},{passive:false});
    // #kbdebug: the numbers behind the keyboard lift, live, for chasing a jump on a real phone
    if(location.hash.includes('kbdebug')){const o=document.createElement('pre');o.style.cssText='position:fixed;z-index:99;left:4px;top:4px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.78);color:#ffd400;border-radius:8px;pointer-events:none;white-space:pre';document.body.append(o);
      const log:string[]=[];const snap=()=>`H ${document.documentElement.clientHeight} iH ${innerHeight}\nvv ${Math.round(vv.height)} top ${Math.round(vv.offsetTop)} s ${vv.scale.toFixed(2)}\nscrollY ${Math.round(scrollY)} kb ${sheet.style.getPropertyValue('--kb')||'-'}\nfocus ${document.activeElement?.id||document.activeElement?.tagName}`;
      const tick=()=>{o.textContent=snap()+'\n'+log.slice(-6).join('\n');requestAnimationFrame(tick)};tick();
      for(const ev of ['resize','scroll'])vv.addEventListener(ev,()=>log.push(`${(performance.now()/1e3).toFixed(2)} vv.${ev} ${Math.round(vv.height)}/${Math.round(vv.offsetTop)}`));
      addEventListener('scroll',()=>log.push(`${(performance.now()/1e3).toFixed(2)} win.scroll ${Math.round(scrollY)}`),{passive:true});
      document.addEventListener('focusin',e=>log.push(`${(performance.now()/1e3).toFixed(2)} focus ${(e.target as Element).id||(e.target as Element).tagName}`))}}
  addEventListener('keydown',e=>{if(e.key==='Escape'){if(live.rider.ride)live.stopRide(true);else closeSheet()}});
  // Following: the camera keeps the chosen train in the middle of the map above the sheet.
  // Dragging the map stops it; the button in the sheet starts it again.
  const sheetPad=()=>{if(live.appPad!=null)return live.appPad;if(sheet.classList.contains('tucked')){const p=map.getContainer().querySelector<HTMLElement>('.bfu-panel');return p?p.offsetHeight+24:0}return sheet.hidden?0:Math.min(sheet.offsetHeight,map.getContainer().clientHeight*.75)};   // 내려 둔 동안은 아래 따라가기 칸만큼
  // 지도 우선 버스 따라가기(2026-10-20 덕배): 시트를 닫지 않고(정류장 선택은 그대로) 아래로 내려 둔다 — 카메라는 지도 전체 가운데에 버스를 둔다
  function tuck(on:unknown):void{sheet.classList.toggle('tucked',!!on);sheet.inert=!!on}   // the 길찾기 sheet grows to 72%
  function trainLngLat(plan:TrainPlanLike):LngLat{
    const z=map.getZoom(),unit=1/(512*2**z),q=trackPoint(plan,trainPose(plan).dist),o=(q.off+laneOffsetPx(z))*unit;
    return new maplibregl.MercatorCoordinate(q.x+q.r[0]*o,q.y+q.r[1]*o,0).toLngLat();
  }
  function follow(id:string):void{following=id;followBus=null;followBtn.hidden=true;followBtn.textContent='이 열차 따라가기';const plan=planner.plans.find(p=>p.id===id);if(!plan)return;
    easing=true;cam=null;map.once('moveend',()=>{easing=false;map.triggerRepaint()});
    map.easeTo({center:trainLngLat(plan),zoom:Math.max(map.getZoom(),16),padding:{top:0,bottom:sheetPad(),left:0,right:0},duration:700})}
  // bus: 그 버스로 옮겨 가 따라간다. 멀리 있었으면 줌 16 으로(가까이 볼 때 버스가 보이는 크기)
  // zoom: 정류장 시트에서 곧 올 버스를 따라갈 때는 그 버스로 더 가까이(17)
  const busFollowChanged=()=>live.busLayer?.followChanged?.();   // 정류장 시트의 '따라가는 중' 줄을 새로(2026-10-16 덕배)
  function followBusStart(id:string,{zoom=16}={}):void{
    following=null;followBus=id;busMiss=0;followBtn.hidden=true;const c=live.busLayer?.vehiclePosition(id);if(!c){followBus=null;busFollowChanged();return}
    busFollowChanged();
    easing=true;cam=null;map.once('moveend',()=>{easing=false;followSoon()});
    map.easeTo({center:c,zoom:Math.max(map.getZoom(),zoom),padding:{top:0,bottom:sheetPad(),left:0,right:0},duration:700});
  }
  followBtn.onclick=()=>{if(sheetTrain)follow(sheetTrain);else if(live.busLayer?.selection?.kind==='bus')followBusStart(live.busLayer.selection.id)};
  // station sheet → 길찾기 from or to this station
  let sheetStation:SheetStation|null=null;
  sheetBody.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLElement>('.st-journey [data-end]');if(!b||!sheetStation)return;
    const st=sheetStation;live.journey.openWith(b.dataset.end!,{name:/역$/.test(st.name)?st.name:st.name+'역',lat:st.lat,lng:st.lon})});
  // Keep a followed train centred at FOLLOW_FPS (every display frame redrew the whole map at 60–120 Hz,
  // hot phones), on display frames (requestAnimationFrame, not timers: even steps), camera first and
  // the map with its trains drawn right after in one render. The camera eases toward the train
  // (FOLLOW_EASE s) so a correction from fresh data slides instead of jumping.
  const FOLLOW_EASE=.25;let followAt='',followRaf=0,followLast=0,cam:{lng:number,lat:number}|null=null,camAt=0;
  function followSoon(){if(!followRaf)followRaf=requestAnimationFrame(followLoop)}
  // 손가락 · 마우스가 지도에 닿아 있거나 손으로 움직이는(핀치 · 휠 · 회전) 동안은 따라가기 카메라가 쉰다: jumpTo 는 MapLibre 의 손동작을
  // 모두 끊고 처음부터 다시 받게 해서(stop → 처리기 reset) 따라가는 동안 핀치 확대 · 천천히 끌기가 먹지 않았다(행님 2026-10-22). 놓으면 다시 따라간다
  const touching=new Set<number>();
  map.getCanvasContainer().addEventListener('pointerdown',e=>touching.add(e.pointerId));
  for(const t of ['pointerup','pointercancel'] as const)addEventListener(t,e=>touching.delete(e.pointerId),true);
  addEventListener('blur',()=>touching.clear());
  const handsOn=()=>{if(!(touching.size>0||map.isMoving()))return false;
    const m=map.getCenter();cam={lng:m.lng,lat:m.lat};camAt=performance.now();followAt='';return true};   // 놓으면 사람이 둔 자리에서 열차 · 버스로 미끄러져 돌아간다
  function followLoop(ts:number):void{followRaf=0;if(!(following||live.rider.ride||followBus)||easing)return;
    if(!live.rider.ride&&ts-followLast<Math.max(1000/FOLLOW_FPS,live.frameMs||0)-4){followSoon();return}   // skip display frames down to FOLLOW_FPS (1인칭으로 탈 때는 화면 주사율 그대로: 30 fps 로 묶으니 풍경이 끊겨 보였다 — 2026-10-06 덕배)
    followLast=ts;if(live.rider.ride)planner.setFrame(ts);for(const f of animFrame)f();map.triggerRepaint();
    if(followBus)followSoon()}   // bus: 버스는 열차 그리기와 따로 움직여서, 따라가는 동안은 계속
  animFrame.push(()=>{
    const sel=following&&!easing&&!handsOn()&&sheetTrain&&planner.plans.find(p=>p.id===sheetTrain);if(!sel)return;
    const c=trainLngLat(sel),now=performance.now();
    if(!cam||now-camAt>1000)cam={lng:c.lng,lat:c.lat};
    else{const a=1-Math.exp(-(now-camAt)/1000/FOLLOW_EASE);cam={lng:cam.lng+(c.lng-cam.lng)*a,lat:cam.lat+(c.lat-cam.lat)*a}}
    camAt=now;
    const k=`${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;if(k===followAt)return;followAt=k;
    map.jumpTo({center:cam,padding:{top:0,bottom:sheetPad(),left:0,right:0}});
  });
  animFrame.push(()=>{   // bus: 따라가는 버스 — 열차와 같은 방식으로 카메라가 부드럽게 따라붙는다
    if(!followBus||easing||handsOn())return;
    const b=live.busLayer,chosen=b?.selection?.kind==='bus'&&b.selection.id===followBus||b?.stopFollow===followBus;   // 정류장 시트에서 고른 곧 올 버스(stopFollow)도
    if(!chosen){followBus=null;busFollowChanged();return}   // 다른 걸 골랐으면 그만
    const p=b!.vehiclePosition(followBus),now=performance.now();   // chosen 이면 버스 층이 있다
    // 위치가 잠깐 없을 때(새 자료로 버스를 바꿔 끼우는 사이 등)는 기다린다 — 바로 놓으면 확대만 하고 따라가지 않는 것처럼 보였다(2026-10-16 덕배). 10초 넘게 없으면 그만
    if(!p){if(!busMiss)busMiss=now;else if(now-busMiss>10000){followBus=null;busFollowChanged()}return}
    busMiss=0;
    if(!cam||now-camAt>1000)cam={lng:p[0],lat:p[1]};
    else{const a=1-Math.exp(-(now-camAt)/1000/FOLLOW_EASE);cam={lng:cam.lng+(p[0]-cam.lng)*a,lat:cam.lat+(p[1]-cam.lat)*a}}
    camAt=now;
    const k=`${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;if(k===followAt)return;followAt=k;
    map.jumpTo({center:cam,padding:{top:0,bottom:sheetPad(),left:0,right:0}});
  });
  map.on('dragstart',()=>{if(following){following=null;followBtn.hidden=!sheetTrain}
    if(followBus){followBus=null;followBtn.textContent='이 버스 따라가기';followBtn.hidden=live.busLayer?.selection?.kind!=='bus';busFollowChanged()}});

  return {sheet,sheetBody,followBtn,openSheetView,closeSheet,sheetBusy,sheetPad,tuck,trainLngLat,follow,followBusStart,followSoon,get sheetTrain(){return sheetTrain},set sheetTrain(v:string|null){sheetTrain=v},get following(){return following},set following(v:string|null){following=v},get easing(){return easing},set easing(v:boolean){easing=v},get followBus(){return followBus},set followBus(v:string|null){followBus=v},get sheetStation(){return sheetStation},set sheetStation(v:SheetStation|null){sheetStation=v},get sheetToken(){return sheetToken}};
}
