// 정보창: 열차 정보창(지금 상태 · 원본 기록 · 롤코면 자리 고르기), 지도에서 열차 고르기(pickTrain), 실시간 끊김 알림 줄, 역 도착 정보창(곧 오는 열차 · 출구).
// 역 요청 번호(stationSeq) · 알림 줄 DOM 의 주인. 시트 상태는 sheetUI(시트가 주인), 자리는 rider.seat(1인칭이 주인).
// 다른 화면 파일을 import 하지 않는다: 바뀌는 값(지금 모드 설정 settings · 열차 켬 · 노선 끔 · 출구 자료 · 실시간 받기 feed)은 live.<이름> 으로 그때그때 읽는다.
import { serverUrl } from '../lib/server_url.mts';   // 앱 지도 모드면 운영 서비스 주소로
import type { LngLat, Map as MapLibre, Point } from 'maplibre-gl';
import type { Settings } from '../modes/merge.mts';
import type { LiveTrain, MapStation, Merc, TrainPlan } from '../trains/types.mts';
import { drawStationSheet, clearPanel } from './station_sheet.tsx';
import { drawTrainSheet } from './train_sheet.tsx';
import type { TrainRawView, TrainRideView, TrainSheetProps } from './train_sheet.tsx';
import type { ArrivalCard, ExitItem, StationSheetProps, StationSheetState } from './station_sheet.tsx';

// /api/live?arrivals= 응답 한 줄(server/services/live.py index_arrivals — 이 파일이 읽는 칸)
interface Arrival { line:string; direction:string; heading:string; destination:string; eta:number|null; message:string; express:boolean; last:boolean; receivedAt:string|null }
interface ArrivalsAnswer { ok?:boolean; fetchedAt:string; arrivals?:Arrival[] }
// 출구 한 줄: [경도, 위도, 번호, 휠체어(1)](exits.json)
type Exit = [number, number, string, number?];
interface TrackPoint { x:number; y:number; r:[number,number]; off:number; h:number }
// 늦게 생기는 값 · 바뀌는 값(본체가 getter 로 넘긴다)
interface PopupsLive {
  settings:Settings & { track:{ kind:string } }; trainsEnabled:boolean; subwayOff:boolean; exits:Record<string, Exit[]>;
  feed:{ on:boolean; fetchedAt:string|null }; trainShown:(plan:TrainPlan, dist:number)=>boolean;
}
// 시트(ui/sheet)에서 이 파일이 쓰는 것
interface SheetUI { sheetTrain:string|null; sheetToken:number; following:string|null; sheetStation:MapStation|null }
export interface PopupsDeps {
  map:MapLibre; maplibregl:typeof import('../vendor/maplibre-gl.mjs'); planner:{ plans:TrainPlan[] }; colors:Record<string,string>;
  age:(v:unknown)=>number; destLabel:(t:LiveTrain)=>string; trainPose:(plan:TrainPlan)=>{ dist:number; moving?:boolean };
  trackPoint:(plan:TrainPlan, dist:number)=>TrackPoint; mercStop:(line:string, s:MapStation)=>Merc; TRAIN_MIN_PX:number;
  trainBodyPx:(zoom:number)=>number; canRide:()=>boolean; laneOffsetPx:(zoom:number, bodyPx?:number)=>number;
  cityViaduct:{ train(zoom:number, bodyPx:number):{ lanePx:number }; screen(map:MapLibre, x:number, y:number, h:number):{ x:number; y:number } };
  seatPickerHTML:typeof import('../modes/coaster/first_person.mts').seatPickerHTML; seatLabel:typeof import('../modes/coaster/first_person.mts').seatLabel; rideRows:(plan:TrainPlan)=>number;
  rider:{ seat:import('../modes/coaster/first_person.mts').Seat }; openSheetView:(mount:(body:HTMLElement)=>()=>void)=>number; follow:(id:string)=>void; sheetUI:SheetUI; sheetBody:HTMLElement;
  followBtn:HTMLElement; live:PopupsLive;
}
export function createPopups({map,maplibregl,planner,colors,age,destLabel,trainPose,trackPoint,mercStop,TRAIN_MIN_PX,trainBodyPx,canRide,laneOffsetPx,cityViaduct,seatPickerHTML,seatLabel,rideRows,rider,openSheetView,follow,sheetUI,sheetBody,followBtn,live}:PopupsDeps){
  // ---- train inspector ----------------------------------------------------------------------
  // Click a train (or its tag): show the raw live-feed record next to what the map is doing with it.
  function trainState(plan:TrainPlan):string{
    let el=age(plan.t.receivedAt)+plan.lead,ph=plan.phases[plan.phases.length-1]!,idx=plan.phases.length-1;
    for(let i=0;i<plan.phases.length;i++){const x=plan.phases[i]!;if(el<x.dur){ph=x;idx=i;break}el-=x.dur}
    if(ph.dur===Infinity)return `${ph.to.name}에서 대기 (예측 끝 · 다음 데이터 대기)`;
    const left=Math.max(0,ph.dur-el);
    if(ph.k0===ph.k1)return `${ph.k0===0?ph.from.name:ph.to.name} 정차 중 · 출발까지 ${Math.round(left)}초`;
    const k=ph.k0+(ph.k1-ph.k0)*Math.min(1,el/ph.dur);
    return `${ph.from.name} → ${ph.to.name} 주행 중 · ${Math.round(k*100)}% · 도착까지 ${Math.round(left)}초 (구간 ${Math.round((ph.k1-ph.k0)?ph.dur/(ph.k1-ph.k0):ph.dur)}초)`;
  }
  // The same phase lookup as trainState, worded for riders.
  function riderState(plan:TrainPlan):string{
    // held after fresh data (replacePlans): say where it is drawn, not where the new prediction has it
    if(trainPose(plan).moving===false&&plan.hold!=null){const i=plan.cum.findIndex(c=>Math.abs(c-plan.hold!)<1e-9);if(i>=0)return `${plan.seq[i]!.name}역에 정차 중`}
    let el=age(plan.t.receivedAt)+plan.lead,ph=plan.phases[plan.phases.length-1]!;
    for(const x of plan.phases){if(el<x.dur){ph=x;break}el-=x.dur}
    if(ph.dur===Infinity)return `${ph.to.name}역에 있어요`;
    const left=Math.max(0,ph.dur-el),when=left<60?`${Math.round(left/10)*10}초`:`${Math.round(left/60)}분`;
    if(ph.k0===ph.k1)return `${ph.k0===0?ph.from.name:ph.to.name}역에 정차 중`;
    return left<10?`${ph.from.name} → ${ph.to.name} · 곧 도착`:`${ph.from.name} → ${ph.to.name} · 약 ${when} 뒤 도착`;
  }
  // 열차 시트의 그릴 거리: ride(자리 고르기)는 연 순간의 값을 받아 그대로 쓴다 — 배치도 · 타기 단추 글자는 ride.mts 가 DOM 을 직접 고친다
  function trainView(plan:TrainPlan,ride:TrainRideView|null):TrainSheetProps{
    const t=plan.t;
    return {color:String(colors[t.line]),line:String(t.line),trainNo:String(t.trainNo),express:!!t.express,last:!!t.last,
      dest:destLabel(t)||'행선지 정보 없음',now:riderState(plan),ride,raw:rawFeed(t)};
  }
  // 옛 글자와 같게(esc 로 쓰던 칸은 String — 비어 있는 값도 옛것처럼 글자로)
  function rawFeed(t:LiveTrain):TrainRawView{
    const kst=(v:string|null)=>v?new Date(v).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'-';
    return {station:String(t.station),status:String(t.status),direction:String(t.direction),destination:String(t.destination||'-'),
      recorded:String(t.receivedAt||'-').slice(11),ageSec:Math.round(age(t.receivedAt)),fetched:kst(live.feed.fetchedAt)};
  }
  function showTrainPopup(plan:TrainPlan):void{
    const ride:TrainRideView|null=canRide()?{seatsHTML:seatPickerHTML(plan.cars,rideRows(plan),rider.seat),goLabel:`${seatLabel(rider.seat)}에 타기`}:null;
    const first=trainView(plan,ride),token=openSheetView(body=>{drawTrainSheet(body,first);return ()=>clearPanel(body)});sheetUI.sheetTrain=plan.id;
    requestAnimationFrame(()=>follow(plan.id));
    // keep the status line current while this train's sheet is open (plans are rebuilt on each feed update)
    // 지금 상태 · 행선지 · 원본(plan.t 는 새 자료마다 바뀌고 'N초 전' 이 흐른다)을 다시 그린다 — Preact 가 바뀐 글자만 고친다
    const timer=setInterval(()=>{
      if(token!==sheetUI.sheetToken)return clearInterval(timer);
      const pl=planner.plans.find(p=>p.id===sheetUI.sheetTrain);if(!pl)return;
      drawTrainSheet(sheetBody,{...first,dest:destLabel(pl.t)||'행선지 정보 없음',now:riderState(pl),raw:rawFeed(pl.t)});
    },1000);
  }
  document.head.insertAdjacentHTML('beforeend','<style>.train-inspect{min-width:190px}.train-inspect .tp-line{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--c)}.train-inspect .tp-line .dot{width:9px;height:9px;border-radius:50%;background:var(--c)}.train-inspect .tp-line .no{color:#7a8a90;font-weight:600;font-variant-numeric:tabular-nums}.train-inspect .b{font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;color:#fff;background:var(--c)}.train-inspect .b.last{background:#141414}.train-inspect .tp-dest{font-size:20px;font-weight:800;margin:4px 0 2px;letter-spacing:-.01em}.train-inspect .tp-now{font-size:12px;color:#6b7b80}.train-inspect details{margin-top:8px;font-size:12px}.train-inspect summary{cursor:pointer;color:#8a979b;font-weight:600}.train-inspect table{border-collapse:collapse;font-size:12px;margin-top:4px}.train-inspect th{text-align:left;color:#6b7b80;font-weight:600;padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top}.train-inspect td{padding:2px 0}.train-inspect .sec{padding-top:8px;font-weight:800;color:#172429;border-bottom:1px solid #dbe1e2}.train-inspect .muted{color:#8a979b}</style>');
  // Nearest train to a screen point (distance to the train's head–tail segment), within ~14 px.
  function pickTrain(point:Point):TrainPlan|null{
    if(!live.trainsEnabled||!live.feed.on||live.subwayOff)return null;
    const unit=1/(512*2**map.getZoom());let best:{plan:TrainPlan,d:number}|null=null;
    for(const plan of planner.plans){
      const pose=trainPose(plan);if(!live.trainShown(plan,pose.dist))continue;   // 길찾기에 숨긴 열차는 눌리지도 않게
      const m=mercStop(plan.t.line,plan.seq[0]!).meterInMercatorCoordinateUnits(),half=Math.max(plan.cars*plan.carMetres*m,TRAIN_MIN_PX*unit)/2;
      const Z=map.getZoom(),lane=live.settings.track.kind!=='ground'?cityViaduct.train(Z,trainBodyPx(Z)).lanePx:laneOffsetPx(Z,trainBodyPx(Z)),P=(d:number)=>{const q=trackPoint(plan,d),o=(q.off+lane)*unit,X=q.x+q.r[0]*o,Y=q.y+q.r[1]*o;return live.settings.track.kind!=='ground'?cityViaduct.screen(map,X,Y,q.h):map.project(new maplibregl.MercatorCoordinate(X,Y,0).toLngLat())};   // city-life: 심시티 — picked where it is drawn, up on the viaduct
      const A=P(pose.dist-half),B=P(pose.dist+half),dx=B.x-A.x,dy=B.y-A.y,l2=dx*dx+dy*dy||1,u=Math.max(0,Math.min(1,((point.x-A.x)*dx+(point.y-A.y)*dy)/l2));
      const d=Math.hypot(point.x-(A.x+dx*u),point.y-(A.y+dy*u));
      if(d<14&&(!best||d<best.d))best={plan,d};
    }
    return best&&best.plan;
  }

  // ---- live-data notice: a strip over the map when the feed fails or goes stale -----------------
  const liveNotice=document.createElement('div');liveNotice.className='live-notice';liveNotice.hidden=true;liveNotice.setAttribute('role','status');
  document.head.insertAdjacentHTML('beforeend','<style>.live-notice{position:absolute;z-index:6;left:50%;top:12px;transform:translateX(-50%);max-width:calc(100% - 120px);padding:8px 12px;border-radius:8px;background:#fff6e0;color:#6b4a00;border:1px solid #f0cf7a;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.12)}html[data-theme=dark] .live-notice{background:#3a2f12;color:#f4dc9a;border-color:#6d5620}</style>');
  function updateLiveNotice(msg:string|null):void{
    // also flag data that stopped updating (no fresh fetch for 3 minutes while trains are shown)
    if(!msg&&live.feed.fetchedAt&&live.feed.on&&Date.now()-new Date(live.feed.fetchedAt).getTime()>180000)msg=`실시간 정보가 ${new Date(live.feed.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})} 이후 갱신되지 않았어요.`;
    liveNotice.textContent=msg||'';liveNotice.hidden=!msg||!live.feed.on;
  }
  setInterval(()=>updateLiveNotice(liveNotice.hidden?null:liveNotice.textContent),30000);

  // ---- station popup: upcoming trains -----------------------------------------------------------
  // From the proxy's arrivals index (the same cached all-lines call): per line and direction, the next
  // two trains, counting down from the time each row was recorded.
  function arrivalText(a:Arrival):string{
    if(a.eta!>0){const left=Math.max(0,a.eta!-age(a.receivedAt));return left<60?'곧 도착':`${Math.floor(left/60)}분 후`}
    return a.message.replace(/\[(\d+)\]번째 전역/,'$1번째 전역')||'-';
  }
  function arrivalRank(a:Arrival):number{if(a.eta!>0)return Math.max(0,a.eta!-age(a.receivedAt));const m=a.message;if(/도착|진입/.test(m)&&!/전역/.test(m))return 0;const n=+(m.match(/\[(\d+)\]/)||[])[1]!;return n?n*120:/전역/.test(m)?90:600}
  // 출구 칸(번호마다 하나): 역 도착 시트의 출구 줄
  function exitItems(st:MapStation):ExitItem[]{
    const list=live.exits[st.id];if(!list||!list.length)return [];
    const seen=new Set(),items=list.filter(e=>!seen.has(e[2])&&seen.add(e[2]));
    return items.map(([,,ref,wc])=>({ref,wheelchair:wc===1}));
  }
  // 도착 정보 → 노선 · 방향마다 곧 오는 두 대(역의 노선 차례, 같은 노선은 방향 이름 차례)
  function arrivalCards(st:MapStation,d:ArrivalsAnswer):ArrivalCard[]{
    const groups=new Map<string,Arrival[]>();
    for(const a of (d.arrivals||[])){const k=`${a.line}|${a.direction}`;if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(a)}
    const lines=st.lines.map(x=>x.name),order=[...groups.keys()].sort((x,y)=>lines.indexOf(x.split('|')[0]!)-lines.indexOf(y.split('|')[0]!)||x.localeCompare(y,'ko'));
    return order.map(k=>{const [line,dir]=k.split('|') as [string,string],list=groups.get(k)!.sort((a,b)=>arrivalRank(a)-arrivalRank(b)).slice(0,2);
      return {line,direction:dir,toward:(list[0]!.heading.split('-')[1]||'').trim(),color:colors[line]||'#52646a',
        rows:list.map(a=>({text:arrivalText(a),destination:a.destination,express:a.express,last:a.last}))}});
  }
  async function showStationPopup(st:MapStation|undefined,lngLat?:LngLat):Promise<void>{
    if(!st)return;
    sheetUI.following=null;sheetUI.sheetTrain=null;followBtn.hidden=true;
    sheetUI.sheetStation=st;
    // 시트 몸통은 화면 조각(ui/station_sheet.tsx)이 그린다 — 받는 중 · 못 받음 · 받음
    const view=(state:StationSheetState):StationSheetProps=>({name:st.name,chips:st.lines.map(x=>({name:x.name,color:colors[x.name]||'#52646a'})),exits:exitItems(st),state});
    const ready=(d:ArrivalsAnswer):StationSheetState=>({kind:'ready',time:new Date(d.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}),cards:arrivalCards(st,d)});
    const failed:StationSheetState={kind:'failed'};
    // Open once the arrivals are in, so the sheet rises at its real height instead of jumping from one line.
    // Past 0.7 s it opens anyway, on rows shaped like the ones coming, and fills them when they land.
    const seq=++stationSeq;
    let d:ArrivalsAnswer|null=null,err=false;
    const settled=fetch(serverUrl(`./api/live?arrivals=${encodeURIComponent(st.name.replace(/\([^)]*\)/g,''))}`),{cache:'no-store'})
      .then(async r=>{const x:ArrivalsAnswer=await r.json();if(!r.ok||!x.ok)throw Error();d=x},()=>{err=true});
    await Promise.race([settled,new Promise(r=>setTimeout(r,700))]);
    if(seq!==stationSeq)return;   // another station was tapped meanwhile
    const skeleton:StationSheetState={kind:'loading',rows:Math.min(4,Math.max(2,st.lines.length*2))};
    const first=d?ready(d):err?failed:skeleton;
    const token=openSheetView(body=>{drawStationSheet(body,view(first));return ()=>clearPanel(body)});
    const put=(s:StationSheetState)=>{if(token===sheetUI.sheetToken)drawStationSheet(sheetBody,view(s))};
    if(!d&&!err){await settled;put(d?ready(d):failed)}
    if(d){const timer=setInterval(()=>{if(token!==sheetUI.sheetToken)return clearInterval(timer);put(ready(d!))},15000)}
  }
  let stationSeq=0;
  document.head.insertAdjacentHTML('beforeend','<style>.station-pop table{border-collapse:collapse;font-size:12px;margin-top:6px;width:100%}.station-pop th{text-align:left;font-weight:700;padding:5px 10px 5px 0;vertical-align:top;white-space:nowrap}.station-pop td{padding:5px 0}.station-pop td div+div{margin-top:2px}.station-pop tr+tr th,.station-pop tr+tr td{border-top:1px solid rgba(120,140,150,.2)}.station-pop .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);margin-right:5px}.station-pop .muted{color:#7a8a90;font-weight:500}.station-pop .foot{margin-top:8px;font-size:11px}.station-pop .exits{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(120,140,150,.2)}.station-pop .exits .muted{margin-right:4px;font-size:12px}.station-pop .exit{min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ffd200;color:#1d1d1d;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:1px}.station-pop .exit i{font-style:normal;font-size:10px}</style>');

  return {trainState,riderState,showTrainPopup,pickTrain,liveNotice,updateLiveNotice,arrivalText,arrivalRank,showStationPopup};
}
