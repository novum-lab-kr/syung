// 길찾기: from a place (or my location) to a place, leaving now or at a set time.
// The sheet asks /api/place for places and /api/route for plans (server/journey.py).
// 시트 몸통은 화면 조각(Preact — ui/journey_sheet.tsx)이 그린다: 이 파일은 상태 · 셈(그릴 거리 JourneyView)과 누르기 처리를 맡고,
// 바뀔 때마다 본체가 넘긴 drawJourney 로 다시 그린다. 시트 밖 막대(.jbar)는 껍데기만 여기서 만들고 속은 drawJourneyBar 가 그린다.
// 서버 응답(server/services/journey_graph.py · sources/kakao.py) 중 이 파일이 읽는 칸(path · stations · trainNo 는 여정 지도 표시 ui/journey 가 읽는다)
import { serverUrl } from './server_url.mts';   // 앱 지도 모드면 운영 서비스 주소로
import { endName, findStations, mergeHits, swappedEnds, type FoundPlace, type PlaceHit, type SearchableStation } from './place-search.mts';
import { createTimeWheel, type TimeWheel } from './time-wheel.mts';
interface WalkLeg { type:'walk'; seconds:number; metres:number; exit:string; realtime?:undefined; path?:[number, number][] }
interface TrainLeg { type:'ride'; line:string; from:string; to:string; departs:string; arrives:string; direction:string; destination:string | null; stops:number; wait:number; realtime:boolean; trainNow:string | null; stations:number[]; trainNo?:string | null }
// 같은 정류장(또는 옆 정류장)에서 타서 같은 곳에 내리는 다른 노선(서버가 먼저 오는 순으로 많아야 3개)
// 옆 정류장에서 타거나 내리는 후보면 어느 정류장인지(이름 · 걷는 거리 · 갈아타는 역의 가까운 출구 — 자료 있을 때만)
export interface SideStop { name:string; metres:number; walkMinutes?:number; exit?:string; id?:string; ars?:string }
export interface BusAlternative { route:string; color:string; departs:string; arrives:string; boardAt?:SideStop; alightAt?:SideStop }
interface BusLeg { type:'bus'; route:string; color:string; from:string; to:string; departs:string; arrives:string; toward:string; stops:number; wait:number; realtime:boolean; alts?:string[]; alternatives?:BusAlternative[]; path:[number, number][] }
type TransitLeg = TrainLeg | BusLeg;
type Leg = WalkLeg | TransitLeg;
// 띠 그리기에 쓰는 칸만(승차권에 저장한 경로도 이 칸은 있다 — user/account)
type TrackTransit = Pick<TrainLeg, 'type' | 'line' | 'departs' | 'arrives' | 'wait'> | Pick<BusLeg, 'type' | 'route' | 'color' | 'departs' | 'arrives' | 'wait' | 'alternatives'>;
export type TrackLeg = (Pick<WalkLeg, 'type' | 'seconds'> & { exit?:string }) | TrackTransit;
export interface Plan { tag?:string; kind:string; leaveBy:string; arrives:string; minutes:number; transfers:number; walkMinutes:number; legs:Leg[] }
interface PlaceAnswer { ok:boolean; error?:string; places:FoundPlace[] }
interface RouteAnswer { ok:boolean; error?:string; plans:Plan[] }
type Colors = Record<string, string>;
type Seg = { k:'wait'; s:number } | { k:'walk'; s:number; l:TrackLeg } | { k:'ride'; s:number; l:TrackTransit };
type End = { lat:number; lng:number; name?:string };
type When = { k:'now'; d?:undefined } | { k:'at'; d:Date };
export type EndKind = 'from' | 'to';
interface LastSearch { d:RouteAnswer; sel:number; from:string; to:string; at:string; when:When; picked:{ from:End | null; to:End | null }; tab?:string }

// ---- 화면 조각이 그리는 거리(ui/journey_sheet.tsx 는 이것만 보고 그린다)
// 경로 띠 한 칸: 걷기 · 기다림은 시간 비율만, 타기는 최소 너비(짧은 이름) · 노선 색 · 글자 색 · 버스 아이콘
export type TrackSegView = { k:'walk' | 'wait'; flex:number } | { k:'ride'; flex:number; need:number; color:string; ink:string; bus:boolean; icon:boolean; label:string };
// 걸리는 시간: 한 시간이 넘으면 '1시간 5분'
export interface DurationView { hours:number | null; minutes:number }
// 단계 목록의 한 줄(길찾기 시트와 승차권이 같이 그린다): 출발 · 도착 / 걷기 / 승차(노선 · 버스 칩) / 하차
// 탈 수 있는 버스 칩: 고른 버스 + 같은 구간 다른 버스. side 는 옆 정류장에서 타야 하면 '옆 3분'(누르면 side.detail 에 정류장 이름 · 번호)
export interface BusChipView { route:string; color:string; ink:string; side:string | null; detail:string | null }
// 마지막 구간에서 다른 버스가 다른 정류장에 내리면 그 칩에 정류장 이름을 작게
export interface AlightChipView { route:string; color:string; ink:string; where:string }
export type StepView =
  | { kind:'place'; at:'start' | 'end'; name:string; time:string | null }
  | { kind:'walk'; text:string; detail:string }
  | { kind:'board'; name:string; color:string; time:string | null }
  | { kind:'ride'; color:string; ink:string; bus:boolean; chip:string; toward:string | null; chips:BusChipView[]; info:string; live:string | null }
  | { kind:'alight'; name:string; color:string; time:string | null; chips:AlightChipView[] };
export interface PlanView { aria:string; duration:DurationView; arrive:string; tag:string | null; track:TrackSegView[]; meta:string; live:boolean; steps:StepView[] }
export interface PlanCardView { plan:PlanView; kind:string; on:boolean; hidden:boolean; note?:string }
export interface KindTabView { kind:string; name:string; count:number; pressed:boolean }
export type JourneyResultView = { kind:'none' } | { kind:'loading' } | { kind:'failed'; message:string } | { kind:'plans'; tabs:KindTabView[] | null; cards:PlanCardView[] };
// 장소 검색: fixed 는 이미 정해진 끝(그 반대쪽을 찾는다), here 는 맨 위 「내 위치」 줄을 보일지
export interface FixedEnd { which:EndKind; name:string }
export interface PlaceSearchView { title:string; query:string; hits:PlaceHit[]; pending:boolean; failed:boolean; fixed:FixedEnd | null; here:boolean }
// 출발 시각 고르기 칸: 시 · 분은 바퀴가 스스로 들고(lib/time-wheel.mts) 날짜만 그린다
export interface DraftView { tomorrow:boolean }
export interface JourneySummaryView { from:string; to:string; when:string; aria:string }
// 시트를 닫은 뒤 지도 아래 막대: 고른 경로의 걸리는 시간 · 도착 · 띠
export interface JourneyBarView { duration:DurationView; arrives:string; track:TrackSegView[] }
export interface JourneyBarActions { open():void; clear():void }
// 시트 한 장의 단계: 장소 검색 → 고른 곳의 작은 시트 → 경로 결과
export interface JourneyView {
  stage:'search' | 'picked' | 'route'; search:PlaceSearchView; picked:PlaceHit | null; done:boolean; summary:JourneySummaryView | null;
  whenText:string; whenAt:boolean; whenOpen:boolean; draft:DraftView | null;
  status:{ text:string; sr:boolean }; result:JourneyResultView;
}
// 화면 조각의 단추 · 입력칸이 부르는 것
export interface JourneyActions {
  typed(text:string):void; place(hit:PlaceHit):void; here():void; end(which:EndKind):void; arrivals():void; changeEnd(which:EndKind):void; swap():void;
  whenRow():void; whenNow():void; whenGo():void; day(offset:number):void;
  tab(kind:string):void; card(index:number):void; ticket(index:number):void; retry():void;
}
// 승차권 등록(user/account.mts 가 맡는다): 값을 채워 경로 목록 위에 발권 화면(서랍)을 연다(로그인 전이면 로그인 팝업). search 는 발권 화면을 닫을 때 그대로 돌려줄 지난 검색
export interface TicketStart { from:End & { name:string }; to:End & { name:string }; leaveBy:string; fromHere:boolean; plan:Plan }
export interface TicketDesk { start(draft:TicketStart, search:unknown):void }
export interface TicketReturn { back():void }

// 본체가 넘기는 것(이 파일이 쓰는 칸만)
export interface JourneyDeps {
  openSheetView:(mount:(body:HTMLElement)=>()=>void)=>number; closeSheet?:()=>void; map:{ getCenter():{ lat:number; lng:number }; getZoom():number; flyTo(options:{ center:[number, number]; zoom:number; duration:number; padding?:{ top:number; bottom:number; left:number; right:number } }):unknown }; colors:Colors; myLocation:()=>readonly number[] | null | undefined;
  button:HTMLElement; showRoute?:(plan:Plan)=>void; clearRoute?:()=>void;
  drawJourney:(body:HTMLElement, view:JourneyView, actions:JourneyActions)=>void; clearJourney:(body:HTMLElement)=>void;
  drawJourneyBar:(host:HTMLElement, bar:JourneyBarView | null, actions:JourneyBarActions)=>void;
  stations:readonly SearchableStation[]; showStation:(station:SearchableStation)=>void; setPlaceMarker:(spot:readonly [number, number] | null)=>void; ticketDesk?:()=>Promise<TicketDesk | undefined>;
}
const HERE_NAME = '내 위치';
const HOME_ZOOM = 15;   // 「어디로 갈까요?」로 내 위치에 옮길 때 · 고른 곳으로 옮길 때 이보다 멀면 이만큼 당긴다
const PICK_ZOOM = 16;
const PICK_PAD = 200;   // 작은 시트에 가리지 않게 고른 곳을 위로
const esc = (s:unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'} as Record<string, string>)[c]!);
const min = (s:number) => Math.max(1, Math.round(s / 60));

// 경로 한 개의 색 띠(구간마다 실제 걸리는 시간 비율 · 노선 색) — 길찾기 결과와 승차권 경로 선택(user/account.mjs)이 같이 쓴다
const hm = (t:string) => { const [h, m] = String(t).split(':').map(Number) as [number, number]; return h * 60 + m; };
const legSecs = (l:TrackLeg) => l.type === 'walk' ? l.seconds : Math.max(60, ((hm(l.arrives) - hm(l.departs) + 1440) % 1440) * 60);
const legColorOf = (l:TrackTransit, colors:Colors) => l.type === 'bus' ? l.color : (colors[l.line] || '#888');
const legName = (l:TrackTransit) => l.type === 'bus' ? l.route : l.line;
const legShort = (l:TrackTransit) => l.type === 'bus' ? l.route : l.line.replace(/호선$/, '').replace(/선$/, '');
// text on a line colour: dark on the light ones (수인분당, 에버라인…), white on the rest
const inkOn = (hex:string) => { const n = parseInt(String(hex).slice(1), 16); if (Number.isNaN(n)) return '#fff';
  const [r, g, b] = [n >> 16, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }) as [number, number, number];
  const L = .2126 * r + .7152 * g + .0722 * b;
  return 1.05 / (L + .05) >= (L + .05) / .057 ? '#fff' : '#141414'; };   // whichever reads better (#141414 ≈ L .007)
const BUS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2zm0 3v5h14V6zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>';
const textW = (t:string) => [...String(t)].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 11.5 : 7), 0);   // at the bar's 11.5px
// 단계 목록을 만들 때 읽는 구간 칸. 길찾기 구간과 승차권에 저장한 구간이 같이 쓰는 모양이라 모두 있을 수도 없을 수도 있다
// (저장한 구간에는 걷는 거리 · 정거장 수 · 방면이 없다 — 있는 칸만 그리고 없으면 그 줄 없이)
export interface StepLeg { type:string; label?:string; seconds?:number; metres?:number; exit?:string; line?:string; route?:string; color?:string; from?:string; to?:string; departs?:string; arrives?:string;
  direction?:string | null; destination?:string | null; toward?:string; stops?:number; wait?:number; realtime?:boolean; trainNow?:string | null; alternatives?:readonly BusAlternative[] }
// 한 구간 안의 분(탄 시각 차이 · 한 분 이상). 시각이 없으면 null
const rideMinutes = (leg:StepLeg) => leg.departs && leg.arrives ? Math.max(1, (hm(leg.arrives) - hm(leg.departs) + 1440) % 1440) : null;
// 걷기 한 줄의 글자: 어디까지 걸어서 가는지(지하철에서 나올 때는 출구부터)
function walkText(prev:StepLeg | undefined, next:StepLeg | undefined, exit:string, label:string | undefined):string {
  const door = exit ? `${exit}번 출구` : '';
  const out = prev?.type === 'ride' && door ? `${door}로 나와 ` : '';
  if (!next) return `${out}목적지까지 걸어서`;
  if (next.type === 'walk') return `${out}${label ? `${label} 걸어서` : '걸어서 이동'}`;   // 경유지 앞뒤로 걷기가 이어질 때: 다음이 역인지 모르니 서버 글(label)을 따른다(저장한 구간에는 없다)
  if (next.type === 'bus') return `${out}${next.from ?? ''} 정류장까지 걸어서`;
  return `${next.from ?? ''}역${prev?.type !== 'ride' && door ? ` ${door}` : ''}까지 걸어서`;
}
// 탈 수 있는 버스 칩은 고른 버스 + 다른 버스 이만큼까지 보이고 나머지는 '외 N대' 를 눌러 펼친다
export const ALT_SHOWN = 3;
const sideStop = (stop:SideStop) => stop.walkMinutes ? `${stop.walkMinutes}분` : `${stop.metres}m`;
// 경로의 단계 목록: 출발 → (걷기 / 승차 → 타기 → 하차)… → 도착. times 가 있으면(길찾기) 시각 · 기다림 · 실시간 줄을 더한다
export function routeSteps(legs:readonly StepLeg[], ends:{ from:string; to:string }, colors:Colors, times:{ start:string; end:string } | null = null):StepView[] {
  const rows:StepView[] = [{kind: 'place', at: 'start', name: ends.from, time: times?.start ?? null}];
  legs.forEach((leg, at) => {
    if (leg.type === 'walk') {
      const minutes = min(leg.seconds ?? 0);
      rows.push({kind: 'walk', text: walkText(legs[at - 1], legs[at + 1], leg.exit ?? '', leg.label), detail: `${minutes}분${leg.metres ? ` · ${Math.round(leg.metres / 10) * 10}m` : ''}`});
      return;
    }
    const bus = leg.type === 'bus', place = (name:string | undefined) => bus ? name ?? '' : `${name ?? ''}역`;
    const color = bus ? leg.color ?? '#888' : colors[leg.line ?? ''] || '#888', ink = inkOn(color);
    const others = bus ? leg.alternatives ?? [] : [];
    const chips:BusChipView[] = bus ? [{route: leg.route ?? '', color, ink, side: null, detail: null}, ...others.map(other => ({route: other.route, color: other.color, ink: inkOn(other.color), side: other.boardAt ? `옆 ${sideStop(other.boardAt)}` : null,
      detail: other.boardAt ? `${other.boardAt.name}${other.boardAt.ars ? ` ${other.boardAt.ars}` : ''} · 걸어서 ${sideStop(other.boardAt)}${other.boardAt.exit ? ` · ${other.boardAt.exit}번 출구 쪽` : ''}` : null}))] : [];
    const minutes = rideMinutes(leg), waits = times && (leg.wait ?? 0) > 60 ? `${min(leg.wait ?? 0)}분 기다림` : null;
    const info = [leg.stops ? `${leg.stops}개 ${bus ? '정류장' : '역'}` : null, minutes ? `${minutes}분` : null, waits].filter(Boolean).join(' · ');
    const toward = bus ? (leg.toward ? `${leg.toward} 방면` : null) : leg.destination ? `${leg.destination} 방면` : leg.direction || null;
    rows.push({kind: 'board', name: `${place(leg.from)} 승차`, color, time: times ? leg.departs ?? null : null},
      {kind: 'ride', color, ink, bus, chip: bus ? leg.route ?? '' : leg.line ?? '', toward, chips, info, live: times && !bus && leg.realtime ? `실시간 · 지금 ${leg.trainNow ?? ''}` : null},
      {kind: 'alight', name: `${place(leg.to)} 하차`, color, time: times ? leg.arrives ?? null : null,
        chips: others.flatMap(other => other.alightAt ? [{route: other.route, color: other.color, ink: inkOn(other.color), where: other.alightAt.name}] : [])});
  });
  rows.push({kind: 'place', at: 'end', name: ends.to, time: times?.end ?? null});
  return rows;
}
// 띠의 칸들(셈) — HTML 글자(routeTrack · 승차권 · 아래 막대)와 화면 조각(결과 카드)이 같이 그린다
export function trackParts(p:{ legs:readonly TrackLeg[] }, colors:Colors, width = 330):TrackSegView[] {
  const segs:Seg[] = [];
  for (const l of p.legs) {
    if (l.type !== 'walk' && l.wait > 30) segs.push({k: 'wait', s: l.wait});
    segs.push({k: l.type === 'walk' ? 'walk' : 'ride', s: legSecs(l), l} as Seg);
  }
  const total = segs.reduce((a, g) => a + g.s, 0) || 1;
  return segs.map(seg => {
    if (seg.k !== 'ride') return {k: seg.k, flex: seg.s};
    // every ride keeps room for at least its short name (a one-stop hop is still a line to board); walks give way
    const px = seg.s / total * width, color = legColorOf(seg.l, colors), full = legName(seg.l), bus = seg.l.type === 'bus';
    return {k: 'ride', flex: seg.s, need: textW(legShort(seg.l)) + 12, color, ink: inkOn(color), bus, icon: bus && px >= textW(full) + 34, label: px >= textW(full) + 14 ? full : legShort(seg.l)};
  });
}
export function routeTrack(p:{ legs:readonly TrackLeg[] }, colors:Colors, width = 330) {
  return `<div class="jtrack" aria-hidden="true">${trackParts(p, colors, width).map(seg => seg.k !== 'ride'
    ? `<i class="jseg ${seg.k}" style="flex:${seg.flex} 1 0"></i>`
    : `<i class="jseg ride${seg.bus ? ' bus' : ''}" style="flex:${seg.flex} 1 0;min-width:${seg.need}px;--c:${seg.color};--t:${seg.ink}">${seg.icon ? BUS : ''}${esc(seg.label)}</i>`).join('')}</div>`;
}

const TICKET_NO_START = '내 위치를 찾지 못했어요. 위에서 출발을 다시 골라 주세요.';   // 펼친 카드는 길어 위 안내 줄이 안 보인다: 단추 바로 위에

export function initJourney({openSheetView, closeSheet, map, colors, myLocation, button, showRoute, clearRoute, drawJourney, clearJourney, drawJourneyBar, stations, showStation, setPlaceMarker, ticketDesk}:JourneyDeps) {
  const picked:{ from:End | null; to:End | null } = {from: null, to: null};
  const names:Record<EndKind, string> = {from: HERE_NAME, to: ''};
  let last:LastSearch | null = null;   // the last search: {d, sel, from, to, at} — kept while its route is on the map
  let inSheet = false;
  let goSeq = 0;   // the latest route search; older answers are dropped   // the journey sheet (not a station or train one) is what's open

  // bar at the bottom while the sheet is closed: the chosen route; tap to see the results again
  const bar = document.createElement('div');
  bar.className = 'jbar'; bar.hidden = true;
  document.body.append(bar);
  const barActions:JourneyBarActions = {open: () => open(), clear: () => { last = null; bar.hidden = true; clearRoute?.(); }};
  drawJourneyBar(bar, null, barActions);

  // 지금 그린 몸통: 열 때마다 번호가 하나씩 늘고, 다른 시트가 자리를 차지하면(치우는 함수) 0 — 늦게 온 답은 번호로 버린다(옛 out.isConnected)
  let body:HTMLElement | null = null, mounted = 0, mountSeq = 0;
  const hereKnown = () => !!myLocation();
  const emptySearch = (fixed:FixedEnd | null = null):PlaceSearchView => ({title: fixed?.which === 'from' ? '어디로 갈까요?' : fixed ? '어디서 출발할까요?' : '어디로 갈까요?', query: '', hits: [], pending: false, failed: false, fixed, here: fixed?.which === 'to' && hereKnown()});
  const freshView = ():JourneyView => ({stage: 'search', search: emptySearch(), picked: null, done: false, summary: null, whenText: '지금 출발', whenAt: false, whenOpen: false, draft: null, status: {text: '', sr: false}, result: {kind: 'none'}});
  let view = freshView();
  const paint = () => { if (body) drawJourney(body, view, actions); };
  const focusSearch = () => document.getElementById('placeInput')?.focus({preventScroll: true});

  // 출발 시각: 지금, 또는 오늘 · 내일의 5분 단위 시각(발권 화면과 같은 바퀴 — 지금보다 앞은 고를 수 없다)
  const pad = (n:number) => String(n).padStart(2, '0');
  let when:When = {k: 'now'}, draft:Date | null = null, wheel:TimeWheel | null = null, wheelBox:HTMLElement | null = null, wheelTimer:ReturnType<typeof setTimeout> | 0 = 0;
  const local = (d:Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const hhmm = (d:Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const isTomorrow = (d:Date) => d.toDateString() !== new Date().toDateString();
  const soonest = () => { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / 5) * 5 + 5); return d; };   // 바퀴로 고를 수 있는 가장 이른 때: 다음 5분
  const latest = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 55, 0, 0); return d; };
  const clamp = (d:Date) => new Date(Math.min(+latest(), Math.max(+soonest(), +d)));
  function whenValue() { return when.k === 'at' ? local(when.d) : ''; }
  function whenLabel() { return when.k === 'at' ? `${isTomorrow(when.d) ? '내일' : '오늘'} ${hhmm(when.d)} 출발` : '지금 출발'; }
  function whenSet(chosen:When) {
    when = chosen;
    view.whenText = whenLabel(); view.whenAt = chosen.k === 'at';
    paint();
  }
  const drawDraft = () => { view.draft = {tomorrow: isTomorrow(draft!)}; paint(); };
  // 돌리는 동안 값만 따라가고, 멈춘 뒤에 지난 시각이면 고를 수 있는 가장 이른 때로 되돌린다(돌리는 손과 싸우지 않게)
  function wheelMoved(time:string) {
    const [hours = 0, minutes = 0] = time.split(':').map(Number), at = new Date(draft!);
    at.setHours(hours, minutes, 0, 0); draft = at;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { const kept = clamp(draft!); if (+kept !== +draft!) { draft = kept; wheel?.roll(hhmm(kept)); } drawDraft(); }, 180);
  }
  function whenOpen(on:boolean) {
    view.whenOpen = on; clearTimeout(wheelTimer);
    if (!on) { paint(); return; }
    draft = clamp(when.k === 'at' ? new Date(when.d) : soonest()); drawDraft();
    const box = document.getElementById('jWhenWheel');   // 칸이 새로 그려졌을 때만 새로 잇는다(같은 칸에 듣는 곳이 쌓이지 않게)
    if (box && box !== wheelBox) { wheelBox = box; wheel = createTimeWheel(box, wheelMoved); }
    wheel?.show(hhmm(draft));
    requestAnimationFrame(() => document.getElementById('jWhenPanel')?.scrollIntoView({block: 'nearest', behavior: 'smooth'}));
  }

  // 장소 찾기: 역은 글자를 칠 때마다 바로(받은 자료), 장소는 300 ms 늦춰 두 글자부터 묻고 늦게 온 답(seq)은 버린다. 답이 오면 한 목록으로 합친다
  let seekTimer:ReturnType<typeof setTimeout> | 0 = 0, seekSeq = 0;
  function typed(text:string) {
    const search = view.search, query = text.trim(), mine = ++seekSeq, stationHits = findStations(stations, query, colors);
    clearTimeout(seekTimer);
    search.query = text; search.hits = stationHits; search.failed = false; search.pending = query.length >= 2;
    paint();
    if (query.length < 2) return;
    seekTimer = setTimeout(async () => {
      const centre = map.getCenter(), show = (places:FoundPlace[], failed:boolean) => { search.hits = mergeHits(stationHits, places); search.failed = failed; search.pending = false; paint(); };
      try {
        const response = await fetch(serverUrl(`./api/place?q=${encodeURIComponent(query)}&near=${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`));
        const answer:PlaceAnswer = await response.json();
        if (mine === seekSeq) show(answer.ok ? answer.places : [], !answer.ok);
      } catch { if (mine === seekSeq) show([], true); }
    }, 300);
  }
  const stopSeeking = () => { clearTimeout(seekTimer); seekSeq++; };

  const endOf = (hit:PlaceHit):End & { name:string } => ({name: endName(hit), lat: hit.lat, lng: hit.lng});
  // 목록에서 고름: 한쪽이 정해져 있으면 다른 쪽을 채워 바로 길찾기, 아니면 그곳으로 옮겨 마커와 작은 시트
  function placePicked(hit:PlaceHit) {
    stopSeeking(); view.search.pending = false;
    const fixed = view.search.fixed;
    if (fixed) { fillEnd(fixed.which === 'from' ? 'to' : 'from', endOf(hit)); go(); return; }
    (document.activeElement as HTMLElement | null)?.blur?.();
    view.picked = hit; view.stage = 'picked'; paint();
    setPlaceMarker([hit.lng, hit.lat]);
    map.flyTo({center: [hit.lng, hit.lat], zoom: Math.max(map.getZoom(), PICK_ZOOM), padding: {top: 0, bottom: PICK_PAD, left: 0, right: 0}, duration: 900});
  }
  function fillEnd(which:EndKind, end:End & { name:string }) { picked[which] = end; names[which] = end.name; }
  const useHere = () => { picked.from = null; names.from = HERE_NAME; };
  // 「여기서 출발」 · 「여기로 도착」(작은 시트 · 역 시트): 도착이고 내 위치를 알면 바로 경로, 아니면 다른 쪽을 찾는다
  function chooseEnd(which:EndKind, end:End & { name:string }) {
    dispatchEvent(new CustomEvent('syung:place_end', {detail: which}));   // 방문 통계(lib/analytics.mts — 출발 · 도착 구분만, 장소는 안 보낸다)
    fillEnd(which, end);
    if (which === 'to' && hereKnown()) { useHere(); go(); return; }
    if (which === 'from') { picked.to = null; names.to = ''; } else { picked.from = null; names.from = ''; }
    searchFor(which, end.name);
  }
  function searchFor(which:EndKind, name:string) {
    stopSeeking();
    whenOpen(false);   // 시각 칸이 문서에서 빠진다: 돌아오면 닫힌 채로(열면 새 칸에 바퀴를 잇는다)
    view.search = emptySearch({which, name}); view.picked = null; view.stage = 'search'; view.done = false;
    paint(); focusSearch();
  }
  // 경로 결과 위 출발 · 도착을 누름: 그 끝을 장소 검색으로 바꾼다(다른 끝은 그대로)
  function changeEnd(which:EndKind) {
    const other = which === 'from' ? 'to' : 'from';
    searchFor(other, names[other]);
  }
  // 요약 줄의 맞바꾸기: 내 위치는 그 순간의 좌표로 도착이 되고, 내 위치가 출발로 돌아오면 다시 지금 위치를 쓴다
  function swap() {
    const swapped = swappedEnds(names, picked, fromOf(), HERE_NAME);
    Object.assign(names, swapped.names); Object.assign(picked, swapped.picked);
    whenOpen(false); stopSeeking(); go();
  }
  function hereRow() { useHere(); stopSeeking(); go(); }

  const fromOf = () => picked.from || (names.from === HERE_NAME && myLocation() ? {lat: myLocation()![1]!, lng: myLocation()![0]!} : null);
  function fold() {
    const label = whenLabel();
    view.done = true; view.stage = 'route';
    view.summary = {from: names.from, to: names.to, when: label, aria: `${names.from}에서 ${names.to}까지, ${label}`};
  }

  // ---- results: one row per route; a bar shows each part of the trip at its real share of the time
  const durParts = (total:number):DurationView => total >= 60 ? {hours: Math.floor(total / 60), minutes: total % 60} : {hours: null, minutes: total};

  function planView(plan:Plan):PlanView {
    return {aria: `${plan.tag || '경로'} ${plan.minutes}분, ${plan.arrives} 도착, 지도에서 보기`, duration: durParts(plan.minutes), arrive: `${plan.leaveBy} → ${plan.arrives}`, tag: plan.tag || null,
      track: trackParts(plan, colors), meta: `환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`, live: plan.legs.some(leg => leg.realtime), steps: routeSteps(plan.legs, {from: last?.from || '출발', to: last?.to || '도착'}, colors, {start: plan.leaveBy, end: plan.arrives})};
  }

  const KINDS = [['all', '전체'], ['subway', '지하철'], ['bus', '버스'], ['mixed', '지하철+버스']] as const;
  const cardsOf = () => view.result.kind === 'plans' ? view.result.cards : [];
  // 경로 하나 고르기: 카드를 펼치고 지도에 보인다(옛것처럼 그린 다음 showRoute)
  function pick(index:number) {
    last!.sel = index;
    cardsOf().forEach((card, other) => { card.on = other === index; card.note = ''; });
    paint();
    // 지도가 아직 안 떴거나 그리다 실패해도 목록은 쓴다(로그인 복귀가 이 길로 온다)
    try { showRoute?.(last!.d.plans[index]!); } catch (error) { console.warn('지도에 경로를 그리지 못했어요', error); }
  }
  // 종류 탭: 고른 경로가 숨으면 첫 보이는 경로로
  function filter(kind:string) {
    last!.tab = kind;
    if (view.result.kind === 'plans') view.result.tabs?.forEach(tab => { tab.pressed = tab.kind === kind; });
    const cards = cardsOf();
    cards.forEach(card => { card.hidden = !(kind === 'all' || card.kind === kind); });
    paint();
    if (cards[last!.sel]?.hidden) { const first = cards.findIndex(card => !card.hidden); if (first >= 0) pick(first); }
  }
  function render(answer:RouteAnswer, sel:number) {
    const count = (kind:string) => answer.plans.filter(plan => kind === 'all' || plan.kind === kind).length;
    const kinds = KINDS.filter(([kind]) => kind !== 'all' && count(kind));
    if (kinds.length < 2) last!.tab = 'all';   // one kind only: nothing to filter
    const tabs = kinds.length < 2 ? null : KINDS.filter(([kind]) => kind === 'all' || count(kind)).map(([kind, name]) => ({kind, name, count: count(kind), pressed: (last!.tab || 'all') === kind}));
    // bus: 버스 구간도 여정과 함께 남는다(지우기는 막대의 ✕)
    view.result = {kind: 'plans', tabs, cards: answer.plans.map(plan => ({plan: planView(plan), kind: plan.kind, on: false, hidden: false}))};
    paint();
    pick(sel);
    filter(last!.tab || 'all');
  }
  // 펼친 경로를 또 누르면 시트를 닫는다(경로는 지도에 남는다)
  function cardPressed(index:number) { if (last!.sel === index && cardsOf()[index]?.on) closeSheet?.(); else pick(index); }

  function failed(message:string) {
    view.status = {text: `경로를 찾지 못했어요. ${message}`, sr: true};   // announced; the card below shows it
    view.result = {kind: 'failed', message};
    paint();
  }

  async function go() {
    const from = fromOf(), to = picked.to, my = ++goSeq, mine = mounted;
    const trip = {from: names.from, to: names.to, picked: {...picked}};
    if (!from || !to) { searchFor(from ? 'from' : 'to', from ? names.from : names.to); return; }
    const at = whenValue();
    setPlaceMarker(null);
    // while the routes are worked out (a few seconds): the rows they will fill, 슝 running along the first
    view.status = {text: '경로를 찾고 있어요', sr: false}; view.result = {kind: 'loading'}; view.picked = null; fold(); paint();
    (document.activeElement as HTMLElement | null)?.blur?.();   // phone keyboard down, so the results have the room
    const current = () => my === goSeq && mine !== 0 && mounted === mine;   // a newer search took over, or the sheet shows something else now
    try {
      const response = await fetch(serverUrl(`./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${at ? `&at=${encodeURIComponent(at)}` : ''}`));
      const answer:RouteAnswer = await response.json();
      if (!current()) return;
      if (!answer.ok) { failed(answer.error || '출발지나 도착지를 바꿔 보세요.'); return; }
      view.status.text = '';
      last = {d: answer, sel: 0, from: trip.from, to: trip.to, at, when: {...when}, picked: trip.picked};
      render(answer, 0);
      dispatchEvent(new CustomEvent('syung:route'));   // 내 통계의 길찾기 횟수(user/account.mjs 가 로그인했을 때만 센다) · 방문 통계(lib/analytics.mts) — 둘 다 장소 · 시각은 안 보낸다
      paint();
      const sheetBody = body?.closest('.sheet-body'); if (sheetBody) sheetBody.scrollTop = 0;   // the trip line and the tabs first
    } catch { if (current()) failed('연결이 불안정해요. 잠시 뒤 다시 찾아 주세요.'); }
  }

  // 펼친 카드의 「승차권 등록」: 경로 목록은 그대로 두고 그 위에 값이 채워진 발권 화면을 연다. 로그인 전이면 로그인 팝업
  async function ticket(index:number) {
    const search = last, plan = search?.d.plans[index];
    if (!search || !plan) return;
    search.sel = index;
    view.status = {text: '', sr: false};
    const desk = await ticketDesk?.();
    if (last !== search) return;
    if (!desk) { view.status = {text: '지금은 승차권을 등록할 수 없어요.', sr: false}; paint(); return; }
    const here = search.picked.from ? null : fromOf(), start = search.picked.from ?? here, end = search.picked.to;
    if (!start || !end) { const card = cardsOf()[index]; if (card) { card.note = TICKET_NO_START; paint(); } return; }
    desk.start({from: {name: search.from, lat: start.lat, lng: start.lng}, to: {name: search.to, lat: end.lat, lng: end.lng}, leaveBy: plan.leaveBy, fromHere: !!here, plan}, search);
  }
  // 발권 화면을 닫을 때(뒤로 · 닫기 · 저장): 경로 목록이 펼친 카드까지 그대로. 목록이 아직 열려 있으면 할 일이 없고,
  // 경로 고르기 지도가 지도를 차지해(drop) 목록이 닫혔으면 간직한 search 로 다시 연다. search 는 로그인 페이지를 다녀오면 sessionStorage 에서 온 복사본이다 — 시각(when.d)이 글자라 open 이 다시 Date 로 만든다
  function ticketReturn(search:unknown):TicketReturn | null {
    const saved = search as LastSearch | null | undefined;
    if (!saved?.d?.plans?.length) return null;
    return {
      back() {
        if (!inSheet || !last) { last = saved; open(); }
        requestAnimationFrame(() => {
          const again = body?.querySelector<HTMLElement>('.jp.on .jp-ticket');
          again?.scrollIntoView({block: 'nearest'}); again?.focus({preventScroll: true});
        });
      },
    };
  }

  const actions:JourneyActions = {
    typed, place: placePicked, here: hereRow, swap,
    end(which) { const hit = view.picked; if (hit) chooseEnd(which, endOf(hit)); },
    arrivals() {
      const hit = view.picked, station = hit && stations.find(one => one.name === hit.name && one.lat === hit.lat);
      if (station) showStation(station);
    },
    changeEnd,
    whenRow() { whenOpen(!view.whenOpen); },
    whenNow() { whenSet({k: 'now'}); whenOpen(false); go(); },
    whenGo() { draft = clamp(draft!); whenSet({k: 'at', d: new Date(draft)}); whenOpen(false); go(); },
    day(offset) {
      const at = new Date(draft!), today = new Date(); at.setFullYear(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      draft = clamp(at); wheel?.roll(hhmm(draft)); drawDraft();
    },
    tab: filter, card: cardPressed, ticket: index => { ticket(index); }, retry: () => { go(); },
  };

  function showResults() {
    const search = last!;
    names.from = search.from; names.to = search.to;
    whenSet(search.when ? {...search.when, d: search.when.d && new Date(search.when.d)} as When : {k: 'now'});
    Object.assign(picked, search.picked);
    fold();
    render(search.d, search.sel);
  }
  function open() {
    bar.hidden = true;
    stopSeeking();   // 앞서 연 몸통의 늦은 장소 답은 새 몸통에 닿지 않게
    view = freshView();
    openSheetView(target => {
      const id = ++mountSeq; body = target; mounted = id; paint();
      return () => { if (mounted === id) { mounted = 0; body = null; } clearTimeout(wheelTimer); setPlaceMarker(null); clearJourney(target); };
    });
    inSheet = true;
    if (!last) { when = {k: 'now'}; useHere(); picked.to = null; names.to = ''; if (!hereKnown()) names.from = ''; }
    whenSet(when);
    if (last) showResults();   // back to the last search, as it was
  }
  // 「어디로 갈까요?」: 지난 결과가 있으면 그대로, 아니면 내 위치로 옮겨 장소 검색(내 위치를 모르면 지도는 보던 자리)
  function start() {
    open();
    if (last) return;
    const spot = myLocation();
    if (spot) map.flyTo({center: [spot[0]!, spot[1]!], zoom: Math.max(map.getZoom(), HOME_ZOOM), duration: 900});
    focusSearch();
  }

  // from a station sheet: this station is one end; ask for the other
  function openWith(end:EndKind, place:End & { name:string }) {
    last = null; picked.from = picked.to = null; clearRoute?.();
    open();
    chooseEnd(end, place);
  }

  // 시트를 닫기 전에 시트가 묻는다(손잡이 · Esc): 고른 곳의 작은 시트면 장소 검색으로(검색어 · 결과 · 지도 그대로), 결과에서 끝을 바꾸던 중이면 결과로 돌아간다. true 면 닫지 않는다
  function back() {
    if (!inSheet) return false;
    setPlaceMarker(null);
    if (view.stage === 'picked') { view.stage = 'search'; view.picked = null; paint(); return true; }
    if (view.stage === 'search' && view.search.fixed && last) { stopSeeking(); showResults(); return true; }
    return false;
  }

  const showBar = () => {
    const plan = last!.d.plans[last!.sel]!;
    drawJourneyBar(bar, {duration: durParts(plan.minutes), arrives: plan.arrives, track: trackParts(plan, colors, 240)}, barActions);
    bar.hidden = false;
  };
  // the sheet was closed: keep the route and show the bar when it was ours; true if a route stays up
  function sheetClosed() {
    const was = inSheet; inSheet = false;
    setPlaceMarker(null);
    if (!last || !was) return false;
    showBar();
    return true;
  }

  // another sheet (station, train) took the place of ours
  function sheetReplaced() { if (inSheet) { inSheet = false; if (last) sheetClosed(); } }

  // 다른 길(승차권 경로 지도에서 보기 — user/account)이 지도를 차지했다: 고른 경로 · 아래 막대를 놓는다(지도는 그쪽이 다시 그린다)
  function drop() { last = null; bar.hidden = true; }

  button.addEventListener('click', start);
  return {open, openWith, back, sheetClosed, sheetReplaced, drop, ticketReturn};
}
