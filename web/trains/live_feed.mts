// 실시간 열차 받기. trains · 요청 번호 · 받은 시각의 주인(본체는 feed.trains · on · fetchedAt 로 읽는다)

// Live trains show from zoom 13 for every line on screen (or just the selected line). The proxy
// serves all lines from one cached upstream call, so the number of lines requested is free.
import { serverUrl } from '../lib/server_url.mts';   // 앱 지도 모드면 운영 서비스 주소로
import { key as stationKey } from '../lib/routing.mts';   // 역 이름 맞추기(성수종착 → 성수)
export const LIVE_ZOOM=13,LIVE_MAX_LINES=24,STALE_SECONDS=600;

// onTrains(trains) → 자리 잡은 열차 수, onClear(): 예측 비우기
import type { Map as MapLibre } from 'maplibre-gl';
import type { LiveTrain, MapStation } from './types.mts';

// 끝난 열차 빼기: 종착역 앞에 끊긴 기록을 10분 두면 약 3분 간격 노선에서 3대가 겹쳐 보인다.
// 값은 샘플 30일(2026-10-03~11-01)로 쟀다 — 달리는데 사라지는 비율이 노선마다 2% 이하인 가장 짧은 여유.
// 행선지 역의 진입 · 출발, 직전 역의 도착 · 진입도 같은 잣대로 6일(2026-11-18~25 중)을 재서 6분 여유(노선마다 1.1% 이하) —
// 이 기록이 10분 남아 종착역에 서 있던 것이 겹침의 가장 큰 몫이었다(11-25 하루 겹침 사건 6,503건 중 42%가 끝난 열차의 옛 기록).
// 운행중 · 전역 출발 기록은 행선지 근처에서도 오래 비었다 다시 이어져(경의중앙선 운행중 26%) 10분 그대로.
// 행선지 역 도착은 받는 즉시 뺀다(2026-11-27 사용자 결정 · 왕십리 6126 이 도착 뒤 136초 남았다) — 같은 6일 도착 30,712건 중
// 같은 번호가 다른 역에 다시 나온 것은 아래 넷 말고는 곳마다 0.6% 이하였다.
export const ARRIVED_SECONDS=180,LAST_LEG_MARGIN_SECONDS=240,LONG_LAST_LEG_SECONDS=1200,NEAR_END_SECONDS=360;
// 예외(같은 30일 기록): 구파발은 도착 뒤 대부분 연신내로 다시 나오고(3호선 사라짐 683건 중 669건 · 진입 · 출발도 6일 기록에서 이어 감), 천왕 → 온수는 다음 기록까지 길게 빈다(90% 13.5분).
// 사당행 4호선은 사당 출발 뒤에도 같은 번호로 이어 간다(6일 258건 중 254건 · 6분 한도면 15%를 잘못 뺀다).
// 종착처럼 보이는데 계속 달리는 곳(6일 도착 뒤 다른 역에 다시 나온 몫): 2호선 성수 23% · 1호선 구로 11% · 1호선 동묘앞 7%(+신설동 · 동대문으로 새 행선 56%) — 도착 3분 그대로.
const KEEP_ARRIVED=new Set(['3호선:구파발']),SLOW_ARRIVED=new Set(['2호선:성수','1호선:구로','1호선:동묘앞']),KEEP_DEPARTED=new Set(['4호선:사당']),LONG_LAST_LEG=new Set(['7호선:천왕','7호선:강남구청']);
export interface DestinationLeg { atDestination:boolean; lastLegSeconds:number|null }
const normStatus=(t:LiveTrain):string=>String(t.status||'').replace(/\s/g,'');
export function staleLimit(t:LiveTrain, leg:DestinationLeg):number{
  if(t.departsAt)return STALE_SECONDS;   // departsAt: 출발을 기다리는 열차는 지도가 그때까지 붙든다
  const status=normStatus(t),place=`${t.line}:${t.station}`;
  if(leg.atDestination){
    if(KEEP_ARRIVED.has(place))return STALE_SECONDS;
    if(status==='도착')return SLOW_ARRIVED.has(place)?ARRIVED_SECONDS:0;
    if(status==='진입'||(status==='출발'&&!KEEP_DEPARTED.has(place)))return NEAR_END_SECONDS;
    return STALE_SECONDS;
  }
  if(leg.lastLegSeconds==null)return STALE_SECONDS;
  if(status==='출발')return LONG_LAST_LEG.has(place)?LONG_LAST_LEG_SECONDS:Math.min(STALE_SECONDS,leg.lastLegSeconds+LAST_LEG_MARGIN_SECONDS);
  if(status==='도착'||status==='진입')return Math.min(STALE_SECONDS,leg.lastLegSeconds+NEAR_END_SECONDS);
  return STALE_SECONDS;
}

// 행선지 역 도착을 본 열차(번호)를 기억해, 그 역에서 뒤에 내는 도착 · 출발 · 운행중 기록도 뺀다 — 안 빼면 6일 도착의 약 20%가
// 종착역 출발(6분) · 운행중(10분) 기록으로 다시 뜬다. 다른 역 · 다른 행선지 기록이 오면 잊는다(다시 달리는 열차). 30분 지나도 잊는다.
export const ARRIVAL_MEMORY_SECONDS=1800;
const AFTER_ARRIVAL=new Set(['도착','출발','운행중']);
export function createArrivalMemory(age:(v:unknown)=>number){
  const arrived=new Map<string,{station:string;destination:string;receivedAt:string}>();
  // true: 끝난 열차의 기록이라 지도에서 뺀다(도착 기록 자체 포함)
  function finished(t:LiveTrain,leg:DestinationLeg):boolean{
    const id=`${t.line}:${t.trainNo}`,status=normStatus(t),last=arrived.get(id);
    if(leg.atDestination&&status==='도착'&&t.receivedAt&&staleLimit(t,leg)===0){
      if(!last||last.station!==t.station||last.destination!==t.destination||t.receivedAt>last.receivedAt)arrived.set(id,{station:t.station,destination:t.destination,receivedAt:t.receivedAt});
      return true;
    }
    if(!last)return false;
    if(last.station!==t.station||last.destination!==t.destination){arrived.delete(id);return false}
    // 받은 시각 글자("YYYY-MM-DD HH:MM:SS")는 글자 순서가 곧 시간 순서
    return AFTER_ARRIVAL.has(status)&&!!t.receivedAt&&t.receivedAt>=last.receivedAt;
  }
  function forgetOld(){for(const [id,last] of arrived)if(age(last.receivedAt)>ARRIVAL_MEMORY_SECONDS)arrived.delete(id)}
  return {finished,forgetOld};
}

// 2호선은 성수에서 번호가 바뀐다(같은 열차가 새 번호로 계속 돈다): 옛 번호의 성수 도착 · 진입 · 운행중 기록은 3~10분 남아(위 한도) 새 번호와 함께 그려졌다.
// 11-25 녹화: 성수에서 끝난 번호 286 가운데 207(성수종착 도착)은 바로 빠지고, 남는 79 의 새 번호는 옛 번호 마지막 기록 30~170초 뒤 성수 출발 · 운행중으로 처음 나온다.
// 같은 방향 승강장은 하나라 옛 번호가 닿은 뒤 성수를 떠나는 다른 번호는 그 열차다 — 옛 번호 → 새 번호(열차 id `노선:번호`)를 짝지어 옛 번호를 뺀다.
// 새 번호는 옛 번호 마지막 기록 뒤 RING_RENAME_SECONDS(5분 — 녹화의 짝이 거의 다 이 안) 안에서만 짝짓는다.
export const RING_RENAME_SECONDS=300;
const RING_LINE='2호선',RING_SWAP='성수',RING_ENDED=new Set(['도착','진입','운행중']),RING_LEAVING=new Set(['출발','운행중']);
const stampSeconds=(v:string|null):number=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);return m?Date.UTC(+m[1]!,+m[2]!-1,+m[3]!,+m[4]!,+m[5]!,+m[6]!)/1000:NaN};
const atSwap=(name:string):boolean=>stationKey(name)===RING_SWAP&&!/지선/.test(name);   // key 는 「지선」을 떼니(성수지선 → 성수) 이름으로 한 번 더 본다
export function ringRenames(list:readonly LiveTrain[]):Map<string,string>{
  const here=list.filter(t=>t.line===RING_LINE&&atSwap(t.station)&&!Number.isNaN(stampSeconds(t.receivedAt)))
    .sort((a,b)=>stampSeconds(a.receivedAt)-stampSeconds(b.receivedAt));
  const ended=(t:LiveTrain):boolean=>RING_ENDED.has(normStatus(t))&&atSwap(t.destination);
  const renames=new Map<string,string>(),taken=new Set<LiveTrain>();
  // 새 번호(성수를 떠나는 기록)마다 그보다 먼저 성수에서 끝난 옛 번호 가운데 가장 늦게 닿은 것 — 승강장에 서 있던 것은 마지막에 닿은 열차다.
  //  출발을 먼저 짝짓는다: 운행중은 끝난 옛 번호일 수도 새 번호일 수도 있어 먼저 보면 옛 번호끼리 짝지었다(2067 → 2069)
  for(const next of [...here.filter(t=>normStatus(t)==='출발'),...here.filter(t=>normStatus(t)!=='출발')]){
    if(taken.has(next)||!RING_LEAVING.has(normStatus(next)))continue;
    const at=stampSeconds(next.receivedAt);
    const old=here.findLast(t=>!taken.has(t)&&t!==next&&t.trainNo!==next.trainNo&&t.direction===next.direction&&ended(t)
      &&stampSeconds(t.receivedAt)<at&&at-stampSeconds(t.receivedAt)<=RING_RENAME_SECONDS);
    if(old){taken.add(old);taken.add(next);renames.set(`${old.line}:${old.trainNo}`,`${next.line}:${next.trainNo}`)}
  }
  return renames;
}
// 받을 때마다 짝을 이어 둔다: 새 번호가 성수를 떠나 다음 역에 찍혀도 옛 번호의 같은 기록(받은 시각 그대로)이 남아 있으면 계속 뺀다
//  (안 그러면 새 번호가 건대입구 · 뚝섬으로 가자마자 옛 번호가 성수에 다시 그려졌다). 옛 번호에 새 기록이 오면 잊는다(같은 번호로 계속 달리는 열차)
export function createRingRenames(){
  let links=new Map<string,{to:string;receivedAt:string|null}>();
  function apply(list:readonly LiveTrain[]):LiveTrain[]{
    const byId=new Map(list.map(t=>[`${t.line}:${t.trainNo}`,t])),next=new Map<string,{to:string;receivedAt:string|null}>();
    for(const [from,link] of links)if(byId.get(from)?.receivedAt===link.receivedAt&&byId.has(link.to))next.set(from,link);
    for(const [from,to] of ringRenames(list))if(!next.has(from))next.set(from,{to,receivedAt:byId.get(from)!.receivedAt});
    links=next;
    return links.size?list.filter(t=>!links.has(`${t.line}:${t.trainNo}`)):[...list];
  }
  return {apply,renamed:(id:string):string|null=>links.get(id)?.to??null,clear(){links=new Map()}};
}

export interface LiveFeedDeps {
  map:MapLibre; stations:MapStation[]; liveState:HTMLElement; getSelected:()=>string; getSheetTrain:()=>string|null;
  hasPlans:()=>boolean; age:(v:unknown)=>number; destinationLeg:(t:LiveTrain)=>DestinationLeg; updateLiveNotice:(msg:string|null)=>void;
  onTrains:(trains:LiveTrain[])=>number; onClear:()=>void; journeyLines?:()=>string[]|null;
  onState?:()=>void;   // 실시간 글 · 상태가 바뀐 뒤(앱 지도 모드 다리 status)
}
export function createLiveFeed({map,stations,liveState,getSelected,getSheetTrain,hasPlans,age,destinationLeg,updateLiveNotice,onTrains,onClear,journeyLines=()=>null,onState}:LiveFeedDeps){
  let trains:LiveTrain[]=[],request=0,on=false,failures=0,key='',at=0,fetchedAt:string|null=null;
  const rings=createRingRenames();
  const arrivals=createArrivalMemory(age);
  function liveLines():string[]{
    // 길찾기 중: 줌과 상관없이 탈 노선만(경로 전체를 보는 줌 11~12 에도 내 열차가 보이게 — 다른 열차는 어차피 숨긴다, journey.mjs trainShown)
    const journey=journeyLines();if(journey){on=true;return journey}
    // hysteresis: trains appear at zoom 13 but only disappear below 12.5, so pinching around 13 doesn't blink them
    on=map.getZoom()>=LIVE_ZOOM||(on&&map.getZoom()>=LIVE_ZOOM-.5);
    if(!on)return [];
    const selected=getSelected();
    if(selected!=='all')return [selected];
    const b=map.getBounds(),n:Record<string,number>={};
    for(const s of stations)if(b.contains([s.lon,s.lat]))for(const x of s.lines)n[x.name]=(n[x.name]||0)+1;
    // also lines merely passing through the view (no station inside it)
    const c=map.getCenter();
    // lines passing through the view: stations within 0.75 view or at least ~1.5 km of the centre (zoomed in the view is tiny)
    const w=Math.max((b.getEast()-b.getWest())*.75,.019),h=Math.max((b.getNorth()-b.getSouth())*.75,.0135);
    for(const s of stations)if(Math.abs(s.lon-c.lng)<w&&Math.abs(s.lat-c.lat)<h)for(const x of s.lines)n[x.name]??=.5;
    return Object.keys(n).sort((x,y)=>n[y]!-n[x]!).slice(0,LIVE_MAX_LINES);
  }
  async function refresh(force=false):Promise<void>{
    const lines=liveLines();
    if(!lines.length){
      request++;key='';if(hasPlans()){trains=[];onClear()}
      liveState.parentElement!.dataset.state='idle';liveState.textContent=!on?'줌 13 이상에서 실시간 열차를 표시합니다':'이 화면에는 운행 노선이 없습니다';
      onState?.();return;
    }
    // the line of the train whose sheet is open: the proxy reads it from the per-line position feed when that is on
    const sheetTrain=getSheetTrain(),focus=sheetTrain?sheetTrain.split(':')[0]:'';
    const k=lines.join(',')+(focus?'|'+focus:'');
    if(!force&&k===key&&Date.now()-at<30000)return; // same lines, fetched recently
    const mine=++request;key=k;at=Date.now();
    if(!hasPlans())liveState.parentElement!.dataset.state='loading';liveState.textContent=`${lines.join(' · ')} 열차 위치 확인 중`;onState?.();
    try{
      const r=await fetch(serverUrl(`./api/live?lines=${encodeURIComponent(lines.join(','))}${focus?`&focus=${encodeURIComponent(focus)}`:''}`),{cache:'no-store'}),d:{ok?:boolean,error?:string,trains?:LiveTrain[],fetchedAt:string,quotaExhausted?:boolean,warnings?:string[],lines?:string[]}=await r.json();
      if(mine!==request)return; // a newer view or selection superseded this response
      if(!r.ok||!d.ok)throw Error((d.error||r.status) as string);   // 수(HTTP 상태)도 Error 가 글자로 바꾼다
      // A record not refreshed for 10 minutes is a train the feed lost track of (or one that left
      // service); extrapolating it would park a ghost train somewhere down the line. 행선지 앞 기록은 더 일찍(staleLimit) · 도착한 열차는 바로(createArrivalMemory).
      // 도착 기억(arrivals.finished)은 모든 기록에 먼저 묻는다 — 한도로 걸러진 도착 기록도 기억해야 뒤따르는 출발 · 운행중을 뺀다
      const all=d.trains||[];arrivals.forgetOld();
      trains=all.filter(t=>{const leg=destinationLeg(t);return !arrivals.finished(t,leg)&&age(t.receivedAt)<=staleLimit(t,leg)});
      // 성수에서 번호가 바뀐 2호선 열차는 새 번호 하나만(ringRenames) — 옛 번호 → 새 번호는 renamed 로 남겨 타고 가기가 이어 탄다
      trains=rings.apply(trains);
      const stale=all.length-trains.length;
      // Fresh data: each train carries on from where it is drawn (replacePlans), never jumping back.
      fetchedAt=d.fetchedAt;failures=0;updateLiveNotice(d.quotaExhausted?'오늘 실시간 조회 한도를 다 썼어요. 내일 첫차 무렵부터 다시 보여요.':d.warnings&&d.warnings.length?'실시간 정보 일부가 지연되고 있어요. 이전 자료로 표시 중이에요.':null);
      const placed=onTrains(trains),unplaced=trains.length-placed,shown=d.lines||lines;
      liveState.parentElement!.dataset.state='ok';liveState.textContent=`추정 위치 ${placed}대${unplaced?` (역 미확인 ${unplaced})`:''}${stale?` (오래된 기록 ${stale} 제외)`:''} · ${shown.join(' · ')} · ${new Date(d.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}`;onState?.();
      map.triggerRepaint();
    }catch{if(mine===request){key='';failures++;liveState.parentElement!.dataset.state='error';liveState.textContent='실시간 위치 연결 실패 · 잠시 후 재시도';onState?.();if(failures>=2||!hasPlans())updateLiveNotice('실시간 열차 정보에 연결하지 못했어요. 20초마다 다시 시도해요.')}}
  }
  // 노선 바꿀 때: 오는 응답은 버리고 기록을 비운다
  function reset(){request++;trains=[];key='';rings.clear()}
  // Server caches ~90s and the upstream key has a daily quota: don't poll from background tabs.
  // The proxy refreshes upstream every 90 s and serves its cache in between, so polling it often is
  // free and picks up each upstream refresh within ~20 s.
  // one timer: every 20 s, or every 10 s while a train's sheet is open (served from the proxy's cache).
  // Two separate 20 s / 10 s timers fired together every 20 s and sent the same request twice.
  function start(){
    setInterval(()=>{if(!document.hidden&&(getSheetTrain()||Date.now()-at>=19000))refresh(true)},10000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});
    let moveTimer:ReturnType<typeof setTimeout>|number=0;map.on('moveend',()=>{clearTimeout(moveTimer);moveTimer=setTimeout(()=>refresh(),600)});
  }
  return {refresh,reset,start,get trains(){return trains},renamed:rings.renamed,get on(){return on},get fetchedAt(){return fetchedAt}};
}
