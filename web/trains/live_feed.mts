// 실시간 열차 받기. trains · 요청 번호 · 받은 시각의 주인(본체는 feed.trains · on · fetchedAt 로 읽는다)

// Live trains show from zoom 13 for every line on screen (or just the selected line). The proxy
// serves all lines from one cached upstream call, so the number of lines requested is free.
import { serverUrl } from '../lib/server_url.mts';   // 앱 지도 모드면 운영 서비스 주소로
export const LIVE_ZOOM=13,LIVE_MAX_LINES=24,STALE_SECONDS=600;

// onTrains(trains) → 자리 잡은 열차 수, onClear(): 예측 비우기
import type { Map as MapLibre } from 'maplibre-gl';
import type { LiveTrain, MapStation } from './types.mts';

export interface LiveFeedDeps {
  map:MapLibre; stations:MapStation[]; liveState:HTMLElement; getSelected:()=>string; getSheetTrain:()=>string|null;
  hasPlans:()=>boolean; age:(v:unknown)=>number; updateLiveNotice:(msg:string|null)=>void;
  onTrains:(trains:LiveTrain[])=>number; onClear:()=>void; journeyLines?:()=>string[]|null;
}
export function createLiveFeed({map,stations,liveState,getSelected,getSheetTrain,hasPlans,age,updateLiveNotice,onTrains,onClear,journeyLines=()=>null}:LiveFeedDeps){
  let trains:LiveTrain[]=[],request=0,on=false,failures=0,key='',at=0,fetchedAt:string|null=null;
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
      return;
    }
    // the line of the train whose sheet is open: the proxy reads it from the per-line position feed when that is on
    const sheetTrain=getSheetTrain(),focus=sheetTrain?sheetTrain.split(':')[0]:'';
    const k=lines.join(',')+(focus?'|'+focus:'');
    if(!force&&k===key&&Date.now()-at<30000)return; // same lines, fetched recently
    const mine=++request;key=k;at=Date.now();
    if(!hasPlans())liveState.parentElement!.dataset.state='loading';liveState.textContent=`${lines.join(' · ')} 열차 위치 확인 중`;
    try{
      const r=await fetch(serverUrl(`./api/live?lines=${encodeURIComponent(lines.join(','))}${focus?`&focus=${encodeURIComponent(focus)}`:''}`),{cache:'no-store'}),d:{ok?:boolean,error?:string,trains?:LiveTrain[],fetchedAt:string,quotaExhausted?:boolean,warnings?:string[],lines?:string[]}=await r.json();
      if(mine!==request)return; // a newer view or selection superseded this response
      if(!r.ok||!d.ok)throw Error((d.error||r.status) as string);   // 수(HTTP 상태)도 Error 가 글자로 바꾼다
      // A record not refreshed for 10 minutes is a train the feed lost track of (or one that left
      // service); extrapolating it would park a ghost train somewhere down the line.
      const all=d.trains||[];trains=all.filter(t=>age(t.receivedAt)<=STALE_SECONDS);const stale=all.length-trains.length;
      // Fresh data: each train carries on from where it is drawn (replacePlans), never jumping back.
      fetchedAt=d.fetchedAt;failures=0;updateLiveNotice(d.quotaExhausted?'오늘 실시간 조회 한도를 다 썼어요. 내일 첫차 무렵부터 다시 보여요.':d.warnings&&d.warnings.length?'실시간 정보 일부가 지연되고 있어요. 이전 자료로 표시 중이에요.':null);
      const placed=onTrains(trains),unplaced=trains.length-placed,shown=d.lines||lines;
      liveState.parentElement!.dataset.state='ok';liveState.textContent=`추정 위치 ${placed}대${unplaced?` (역 미확인 ${unplaced})`:''}${stale?` (오래된 기록 ${stale} 제외)`:''} · ${shown.join(' · ')} · ${new Date(d.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}`;
      map.triggerRepaint();
    }catch{if(mine===request){key='';failures++;liveState.parentElement!.dataset.state='error';liveState.textContent='실시간 위치 연결 실패 · 잠시 후 재시도';if(failures>=2||!hasPlans())updateLiveNotice('실시간 열차 정보에 연결하지 못했어요. 20초마다 다시 시도해요.')}}
  }
  // 노선 바꿀 때: 오는 응답은 버리고 기록을 비운다
  function reset(){request++;trains=[];key=''}
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
  return {refresh,reset,start,get trains(){return trains},get on(){return on},get fetchedAt(){return fetchedAt}};
}
