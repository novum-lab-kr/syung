// 길찾기: from a place (or my location) to a place, leaving now or at a set time.
// The sheet asks /api/place for places and /api/route for plans (server/journey.py).
// 시트 몸통은 화면 조각(Preact — ui/journey_sheet.tsx)이 그린다: 이 파일은 상태 · 셈(그릴 거리 JourneyView)과 누르기 처리를 맡고,
// 바뀔 때마다 본체가 넘긴 drawJourney 로 다시 그린다. 시트 밖 막대(.jbar)는 바닐라 그대로.
// 서버 응답(server/services/journey_graph.py · sources/kakao.py) 중 이 파일이 읽는 칸(path · stations · trainNo 는 여정 지도 표시 ui/journey 가 읽는다)
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
export interface Place { name:string; address:string; lat:number; lng:number }
interface PlaceAnswer { ok:boolean; error?:string; places:Place[] }
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
export interface PlanCardView { plan:PlanView; kind:string; on:boolean; hidden:boolean }
export interface KindTabView { kind:string; name:string; count:number; pressed:boolean }
export type JourneyResultView = { kind:'none' } | { kind:'loading' } | { kind:'failed'; message:string } | { kind:'plans'; tabs:KindTabView[] | null; cards:PlanCardView[] };
// 장소 찾기 목록: 숨김 · 고를 곳들 · 빈 글자(못 찾음 · 오류)
export interface PlaceListView { hidden:boolean; places:Place[]; empty:string | null }
// 출발 시각 고르기 칸(열 때 · 날짜 · 한 칸 움직일 때만 다시 셈 — 옛 drawDraft)
export interface DraftView { hours:string; minutes:string; tomorrow:boolean; off:Record<string, boolean> }
export interface JourneyView {
  here:boolean; done:boolean; summary:{ from:string; to:string; when:string; aria:string } | null;
  whenText:string; whenAt:boolean; whenOpen:boolean; draft:DraftView | null;
  lists:Record<EndKind, PlaceListView>; status:{ text:string; sr:boolean }; result:JourneyResultView;
}
// 시각 단추 하나를 누르고 있기(0.4초 뒤 되풀이 · 오래 누를수록 빨라짐)
export interface StepHold { down(event:PointerEvent):void; stop():void; click(event:MouseEvent):void }
// 화면 조각의 단추 · 입력칸이 부르는 것
export interface JourneyActions {
  typed(which:EndKind, text:string):void; place(which:EndKind, place:Place):void; here():void; swap():void; summary():void;
  whenRow():void; whenNow():void; whenGo():void; day(offset:number):void; hold:Record<string, StepHold>;
  tab(kind:string):void; card(index:number):void; retry():void;
}

// 본체가 넘기는 것(이 파일이 쓰는 칸만)
export interface JourneyDeps {
  openSheetView:(mount:(body:HTMLElement)=>()=>void)=>number; closeSheet?:()=>void; map:{ getCenter():{ lat:number; lng:number } }; colors:Colors; myLocation:()=>readonly number[] | null | undefined;
  button:HTMLElement; showRoute?:(plan:Plan)=>void; clearRoute?:()=>void;
  drawJourney:(body:HTMLElement, view:JourneyView, actions:JourneyActions)=>void; clearJourney:(body:HTMLElement)=>void;
}
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

export function initJourney({openSheetView, closeSheet, map, colors, myLocation, button, showRoute, clearRoute, drawJourney, clearJourney}:JourneyDeps) {
  const picked:{ from:End | null; to:End | null } = {from: null, to: null};
  let last:LastSearch | null = null;   // the last search: {d, sel, from, to, at} — kept while its route is on the map
  let inSheet = false;
  let goSeq = 0;   // the latest route search; older answers are dropped   // the journey sheet (not a station or train one) is what's open

  // bar at the bottom while the sheet is closed: the chosen route; tap to see the results again
  const bar = document.createElement('div');
  bar.className = 'jbar'; bar.hidden = true;
  bar.innerHTML = '<button type="button" class="jbar-open" aria-label="경로 결과 다시 보기"></button><button type="button" class="jbar-x" aria-label="경로 지우기" title="경로 지우기"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
  document.body.append(bar);
  bar.querySelector<HTMLElement>('.jbar-open')!.onclick = () => open();
  bar.querySelector<HTMLElement>('.jbar-x')!.onclick = () => { last = null; bar.hidden = true; clearRoute?.(); };

  // 지금 그린 몸통: 열 때마다 번호가 하나씩 늘고, 다른 시트가 자리를 차지하면(치우는 함수) 0 — 늦게 온 답은 번호로 버린다(옛 out.isConnected)
  let body:HTMLElement | null = null, mounted = 0, mountSeq = 0;
  const emptyList = ():PlaceListView => ({hidden: true, places: [], empty: null});
  // one card, two rows (출발 / 도착), like a map app; the search runs as soon as both ends are known
  const freshView = ():JourneyView => ({here: !!myLocation(), done: false, summary: null, whenText: '지금 출발', whenAt: false, whenOpen: false, draft: null,
    lists: {from: emptyList(), to: emptyList()}, status: {text: '', sr: false}, result: {kind: 'none'}});
  let view = freshView();
  const paint = () => { if (body) drawJourney(body, view, actions); };
  const field = (which:EndKind) => document.getElementById(which === 'from' ? 'jFrom' : 'jTo') as HTMLInputElement;

  // 출발 시각: now, or a time today/tomorrow picked in 10-minute steps (never before the next step from now)
  const pad = (n:number) => String(n).padStart(2, '0');
  let when:When = {k: 'now'}, draft:Date | null = null;
  const local = (d:Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const hhmm = (d:Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const isTomorrow = (d:Date) => d.toDateString() !== new Date().toDateString();
  const soonest = () => { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1); return d; };   // the next minute
  const nextTen = () => { const d = soonest(); d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10); return d; };   // where the picker starts
  const latest = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 50, 0, 0); return d; };
  const clamp = (d:Date) => new Date(Math.min(latest() as unknown as number, Math.max(soonest() as unknown as number, d as unknown as number)));
  function whenValue() { return when.k === 'at' ? local(when.d) : ''; }
  function whenLabel() { return when.k === 'at' ? `${isTomorrow(when.d) ? '내일' : '오늘'} ${hhmm(when.d)} 출발` : '지금 출발'; }
  function whenSet(chosen:When) {
    when = chosen;
    view.whenText = whenLabel(); view.whenAt = chosen.k === 'at';
    paint();
  }
  // hours move the time by an hour; minutes by one within the hour (59 → 00 keeps the hour); then kept in range
  function stepped(d:Date, unit:string | undefined, n:number) {
    const x = new Date(d);
    if (unit === 'h') x.setTime(+x + n * 3600e3);
    else x.setMinutes((x.getMinutes() + n + 60) % 60);
    return clamp(x);
  }
  // 시각 단추 넷(시 · 분 × 늦게 · 이르게): 이름은 `${단위}${걸음}`
  const STEP_KEYS = [['h', 1], ['h', -1], ['m', 1], ['m', -1]] as const;
  function drawDraft() {
    const at = draft!;
    view.draft = {hours: pad(at.getHours()), minutes: pad(at.getMinutes()), tomorrow: isTomorrow(at),
      off: Object.fromEntries(STEP_KEYS.map(([unit, step]) => [`${unit}${step}`, +stepped(at, unit, step) === +at]))};
    paint();
  }
  function whenOpen(on:boolean) {
    view.whenOpen = on;
    if (on) { draft = clamp(when.k === 'at' ? new Date(when.d) : nextTen()); drawDraft(); requestAnimationFrame(() => document.getElementById('jWhenPanel')?.scrollIntoView({block: 'nearest', behavior: 'smooth'})); }
    else paint();
  }
  // tap: one step; hold: keeps going, faster (after 0.4 s it repeats, and speeds up the longer it is held — minutes go one at a time)
  function holdStep(unit:'h' | 'm', amount:number):StepHold {
    let hold:ReturnType<typeof setTimeout> | 0 = 0, repeat:ReturnType<typeof setTimeout> | 0 = 0;
    const step = () => { draft = stepped(draft!, unit, amount); drawDraft(); };
    const stop = () => { clearTimeout(hold); clearTimeout(repeat); hold = repeat = 0; };
    return {
      down(event) {
        if (event.button) return;
        const target = event.currentTarget as HTMLButtonElement;
        step(); const started = performance.now();
        const tick = ():void => { if (target.disabled) return stop(); step(); const held = performance.now() - started; repeat = setTimeout(tick, held > 2200 ? 35 : held > 1200 ? 60 : 110); };
        hold = setTimeout(tick, 400);
      },
      stop,
      click(event) { if (event.detail === 0) step(); },   // keyboard (Enter/Space) presses
    };
  }
  const holds:Record<string, StepHold> = Object.fromEntries(STEP_KEYS.map(([unit, step]) => [`${unit}${step}`, holdStep(unit, step)]));

  // 장소 찾기: 300 ms 늦춰 묻고, 늦게 온 답(seq)은 버린다. 두 글자 미만이면 목록만 숨긴다(속은 남김)
  const seeks:Record<EndKind, { timer:ReturnType<typeof setTimeout> | 0; seq:number }> = {from: {timer: 0, seq: 0}, to: {timer: 0, seq: 0}};
  function typed(which:EndKind, text:string) {
    const seek = seeks[which], list = view.lists[which];
    picked[which] = null;
    clearTimeout(seek.timer);
    const query = text.trim();
    if (query.length < 2) { list.hidden = true; paint(); return; }
    seek.timer = setTimeout(async () => {
      const mine = ++seek.seq, centre = map.getCenter();
      const show = (places:Place[], empty:string | null) => { const now = view.lists[which]; now.places = places; now.empty = empty; now.hidden = false; paint(); };
      try {
        const response = await fetch(`./api/place?q=${encodeURIComponent(query)}&near=${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`);
        const answer:PlaceAnswer = await response.json();
        if (mine !== seek.seq) return;
        if (!answer.ok) { show([], answer.error || '검색하지 못했어요'); return; }
        if (!answer.places.length) { show([], '찾는 곳이 없어요'); return; }
        show(answer.places, null);
      } catch { if (mine === seek.seq) show([], '검색하지 못했어요'); }
    }, 300);
  }
  function placePicked(which:EndKind, place:Place) {
    picked[which] = place; field(which).value = place.name; view.lists[which].hidden = true; paint(); next(which);
  }

  // the start is known: a picked place, or 내 위치 while it is there
  const fromOf = () => picked.from || (field('from').value.trim() === '내 위치' && myLocation() ? {lat: myLocation()![1]!, lng: myLocation()![0]!} : null);
  function next(which?:EndKind) {
    if (fromOf() && picked.to) { go(); return; }
    const empty = !fromOf() ? 'from' : 'to';
    if (which) field(empty).focus({preventScroll: true});
  }
  // results up: the form folds into one line; tap it to change the trip
  function fold(on:boolean) {
    view.done = on;
    if (on) {
      const from = field('from').value, to = field('to').value, label = whenLabel();
      view.summary = {from, to, when: label, aria: `${from}에서 ${to}까지, ${label}. 눌러서 바꾸기`};
    }
    paint();
  }

  // ---- results: one row per route; a bar shows each part of the trip at its real share of the time
  const track = (p:Plan, width = 330) => routeTrack(p, colors, width);
  const durParts = (total:number):DurationView => total >= 60 ? {hours: Math.floor(total / 60), minutes: total % 60} : {hours: null, minutes: total};
  const dur = (total:number) => { const parts = durParts(total); return parts.hours !== null ? `${parts.hours}<small>시간</small> ${parts.minutes}<small>분</small>` : `${parts.minutes}<small>분</small>`; };

  function planView(plan:Plan):PlanView {
    return {aria: `${plan.tag || '경로'} ${plan.minutes}분, ${plan.arrives} 도착, 지도에서 보기`, duration: durParts(plan.minutes), arrive: `${plan.leaveBy} → ${plan.arrives}`, tag: plan.tag || null,
      track: trackParts(plan, colors), meta: `환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`, live: plan.legs.some(leg => leg.realtime), steps: routeSteps(plan.legs, {from: last?.from || '출발', to: last?.to || '도착'}, colors, {start: plan.leaveBy, end: plan.arrives})};
  }

  const KINDS = [['all', '전체'], ['subway', '지하철'], ['bus', '버스'], ['mixed', '지하철+버스']] as const;
  const cardsOf = () => view.result.kind === 'plans' ? view.result.cards : [];
  // 경로 하나 고르기: 카드를 펼치고 지도에 보인다(옛것처럼 그린 다음 showRoute)
  function pick(index:number) {
    last!.sel = index;
    cardsOf().forEach((card, other) => { card.on = other === index; });
    paint();
    showRoute?.(last!.d.plans[index]!);
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
    const trip = {from: field('from').value, to: field('to').value, picked: {...picked}};
    if (!from) { view.status.text = '출발지를 목록에서 골라 주세요.'; paint(); return; }
    if (!to) { view.status.text = '도착지를 목록에서 골라 주세요.'; paint(); return; }
    const at = whenValue();
    // while the routes are worked out (a few seconds): the rows they will fill, 슝 running along the first
    view.status = {text: '경로를 찾고 있어요', sr: false}; view.result = {kind: 'loading'}; fold(false);
    (document.activeElement as HTMLElement | null)?.blur?.();   // phone keyboard down, so the results have the room
    const current = () => my === goSeq && mine !== 0 && mounted === mine;   // a newer search took over, or the sheet shows something else now
    try {
      const response = await fetch(`./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${at ? `&at=${encodeURIComponent(at)}` : ''}`);
      const answer:RouteAnswer = await response.json();
      if (!current()) return;
      if (!answer.ok) { failed(answer.error || '출발지나 도착지를 바꿔 보세요.'); return; }
      view.status.text = '';
      last = {d: answer, sel: 0, from: trip.from, to: trip.to, at, when: {...when}, picked: trip.picked};
      render(answer, 0);
      dispatchEvent(new CustomEvent('syung:route'));   // 내 통계의 길찾기 횟수(user/account.mjs 가 로그인했을 때만 센다 · 장소 · 시각은 안 보낸다)
      fold(true);
      const sheetBody = body?.closest('.sheet-body'); if (sheetBody) sheetBody.scrollTop = 0;   // the trip line and the tabs first
    } catch { if (current()) failed('연결이 불안정해요. 잠시 뒤 다시 찾아 주세요.'); }
  }

  const actions:JourneyActions = {
    typed, place: placePicked,
    here() { picked.from = null; field('from').value = '내 위치'; next('from'); },
    swap() {
      const fromField = field('from'), toField = field('to'), start = fromOf();
      [fromField.value, toField.value] = [toField.value, fromField.value];
      [picked.from, picked.to] = [picked.to, start && !picked.from ? {...start, name: '내 위치'} : picked.from];
      next();
    },
    summary() { fold(false); field('to').focus({preventScroll: true}); },
    whenRow() { whenOpen(!view.whenOpen); },
    whenNow() { whenSet({k: 'now'}); whenOpen(false); next(); },
    whenGo() { whenSet({k: 'at', d: new Date(draft!)}); whenOpen(false); next(); },
    day(offset) {
      const at = new Date(draft!), today = new Date(); at.setFullYear(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      draft = clamp(at); drawDraft();
    },
    hold: holds,
    tab: filter, card: cardPressed, retry: () => { go(); },
  };

  function open(fresh = false) {
    bar.hidden = true;
    // 앞서 연 몸통의 늦은 장소 답 · 누르고 있던 시각 단추는 새 몸통에 닿지 않게
    for (const seek of Object.values(seeks)) { clearTimeout(seek.timer); seek.seq++; }
    for (const hold of Object.values(holds)) hold.stop();
    view = freshView();
    openSheetView(target => {
      const id = ++mountSeq; body = target; mounted = id; paint();
      // 단추를 누른 채로 몸통이 치워지면(Esc 등) pointerup 이 오지 않는다 — 누르고 있기 타이머도 여기서 멈춘다
      return () => { if (mounted === id) { mounted = 0; body = null; } for (const hold of Object.values(holds)) hold.stop(); clearJourney(target); };
    });
    inSheet = true;
    if (!last) when = {k: 'now'};
    whenSet(when);
    if (last) {   // back to the last search, as it was
      field('from').value = last.from;
      field('to').value = last.to;
      whenSet(last.when ? {...last.when, d: last.when.d && new Date(last.when.d)} as When : {k: 'now'});
      Object.assign(picked, last.picked);
      render(last.d, last.sel);
      fold(true);
    } else if (!fresh) field('to').focus({preventScroll: true});
  }

  // from a station sheet: this station is one end; ask for the other
  function openWith(end:EndKind, place:End & { name:string }) {
    last = null; picked.from = picked.to = null; clearRoute?.();
    open(true);
    const other = end === 'from' ? 'to' : 'from';
    picked[end] = place;
    field(end).value = place.name;
    const otherField = field(other);
    if (other === 'from' && otherField.value === '내 위치') { go(); return; }   // to here from where I am: straight to the routes
    otherField.value = ''; otherField.focus({preventScroll: true});
  }

  // the sheet was closed: keep the route and show the bar when it was ours; true if a route stays up
  function sheetClosed() {
    const was = inSheet; inSheet = false;
    if (!last || !was) return false;
    const p = last.d.plans[last.sel]!;
    bar.querySelector('.jbar-open')!.innerHTML = `<span class="jbar-top"><b>${dur(p.minutes)}</b><span>${esc(p.arrives)} 도착</span></span>${track(p, 240)}`;
    bar.hidden = false;
    return true;
  }

  // another sheet (station, train) took the place of ours
  function sheetReplaced() { if (inSheet) { inSheet = false; if (last) sheetClosed(); } }

  // 다른 길(승차권 경로 지도에서 보기 — user/account)이 지도를 차지했다: 고른 경로 · 아래 막대를 놓는다(지도는 그쪽이 다시 그린다)
  function drop() { last = null; bar.hidden = true; }

  button.addEventListener('click', () => open());
  return {open, openWith, sheetClosed, sheetReplaced, drop};
}
