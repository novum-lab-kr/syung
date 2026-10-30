// 설정 서랍 승차권 쪽들의 속 — 승차권 목록(#menuTickets) · 발권 화면(#menuTicket — 장소 찾기 · 경로 목록까지 한 화면, 2026-10-29).
// 받기 · 바꾸기 · 알림(토스트) · 검사 차례는 user/account.mts 그대로 — 이 파일은 그리기와 누름 전달만. 상태는 옛 DOM 이 들고 있던 그대로이고
// account.mts 가 옛 DOM 을 고치던 자리에서 ticketsView.set(...) 으로 바꾼다. 바뀔 때마다 바로(같은 작업 안에서) 다시 그린다.
// 표시(DOM 모양 · class · id · 문구 · aria)는 옛 index.html · 옛 innerHTML 과 같다(옛 코드가 한 덩어리로 넣던 글자는 템플릿 하나로 — 글자 노드가 갈리면 커닝이 달라진다).
// 출발 시각 바퀴의 칸 속(.tw-col 의 단추 · 스크롤 자리 · on/near · aria-valuetext)은 account.mts 가 바닐라로 그대로 다룬다 — 여기서는 다시 그리지 않는다.
// 서랍 껍데기 · 쪽(section) 숨기기 · 쪽 이름(aria-label)은 본체 · account.mts 그대로.
import { render } from 'preact';
import { routeSteps, routeTrack } from '../lib/journey-ui.mts';   // 경로 띠: 길찾기 결과와 같은 그림(본체가 이미 받은 파일)
import type { Plan, TrackLeg } from '../lib/journey-ui.mts';
// 찾는 동안 뼈대 카드 · 단계 목록 · 세그먼트 탭: 길찾기 시트와 같은 기초 컴포넌트(본체가 이미 받은 파일)
import { RouteLoading } from '../components/route_card.tsx';
import { Segmented } from '../components/segmented.tsx';
import { StepList } from '../components/step_list.tsx';
// 승차권 · 발권 부품(값과 콜백만 받는다 — 상태 · 누름 전달은 이 파일)
import { DayPicker } from '../components/day_picker.tsx';
import { PlaceField } from '../components/place_field.tsx';
import { RouteHead } from '../components/route_head.tsx';
import type { RouteWhen } from '../components/route_head.tsx';
import { SaveButton } from '../components/save_button.tsx';
import { TicketCard, TicketFront, TicketList } from '../components/ticket_card.tsx';
import { TimeField } from '../components/time_field.tsx';
import { DAYS, esc, shortName } from './ticket_routes.mts';
import type { RouteFilterView, RouteKind } from './ticket_routes.mts';
export { DAYS, esc, shortName };   // 이름 줄이기 · 요일 · 글자 막기는 부품 · 시험도 쓰게 ticket_routes.mts 에 둔다

// 서버 응답(server/routes/members.py · /api/place) 가운데 이 쪽들이 읽는 칸
export interface Place { name:string; lat:number; lng:number }
export interface FoundPlace extends Place { address:string }
// 저장하는 경로: 띠를 그리고 뒷면을 쓰는 데 필요한 칸만(slimRoute)
export type SlimLeg = TrackLeg & { from?:string; to?:string };
export interface SlimRoute { tag:string; minutes:number; leaveBy:string; arrives:string; transfers:number; walkMinutes:number; legs:SlimLeg[] }
// 승차권 한 장(id 가 없으면 발권 화면의 미리보기)
export interface Ticket { id?:number | string; name:string; from:Place; to:Place; depart:string; days:number[]; route?:SlimRoute | null }

const todayDay = () => (new Date().getDay() + 6) % 7 + 1;   // 1(월) … 7(일)
// 출발 시각 글자: '오전' · '8:00'(발권 화면 시각 칸 · 경로 선택 머리말)
export function timeParts(time:string) {
  const [hour, minute] = (time || '08:00').split(':').map(Number) as [number, number];
  return { ampm: hour < 12 ? '오전' : '오후', clock: `${hour % 12 || 12}:${String(minute).padStart(2, '0')}` };
}
// 경로 칸 오른쪽 꺾쇠
const CHEVRON = '<svg class="tf-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
export type PlaceKey = 'from' | 'to';
// 칸마다: [머리 글자, 빈 칸 글자, 이름, 칸 id]
const PLACE_TEXT = { from: ['출발', '출발지 고르기', '출발지', 'ticketFrom'], to: ['도착', '도착지 고르기', '도착지', 'ticketTo'] } as const;

interface Handlers {
  ticketFlip(index:number):void; ticketEdit(index:number):void; ticketMap(index:number):void; ticketNew():void;
  timeToggle():void; timeDone():void; route():void;
  day(day:number):void; quick(days:string):void; name(value:string):void; submit():void; remove():void;
  placeFocus(which:PlaceKey):void; placeInput(value:string):void; placePick(place:FoundPlace):void; placeBlur(which:PlaceKey):void; here(which:'from' | 'to'):void;
  plan(index:number):void; planPick():void; routeKind(kind:RouteKind):void;
}
interface View {
  colors:Record<string, string>;   // 노선 이름 → 색(본체)
  // 승차권 목록: 받을 때마다 listTurn 을 늘려 카드를 새로 만든다(옛 replaceChildren) · 카드마다 뒤집힘 · 뒷면 첫 줄(null 이면 기다리는 모양)
  tickets:Ticket[]; listTurn:number; flipped:boolean[]; chains:(string | null)[];
  mapping:number;   // 뒷면 '지도에서 보기'로 길을 찾는 중인 카드(없으면 -1)
  // 발권 화면: opened 는 한 번이라도 열었나(그 전엔 옛 HTML 의 빈 칸 그대로)
  opened:boolean; editingId:number | string | undefined; name:string; time:string; days:number[];
  from:Place | null; to:Place | null; route:SlimRoute | null; wheelOpen:boolean; sending:boolean; deleteArmed:boolean;
  fromHere:boolean; toHere:boolean;   // 그 칸의 곳이 '내 위치'로 넣은 것(칸에서 이름을 고칠 수 있다)
  // 장소 찾기(발권 화면 칸 바로 아래): placeFor 는 글자를 치는 중인 칸(없으면 null) · placeRows 는 찾은 곳 또는 안내 한 줄
  placeFor:PlaceKey | null; placeQuery:string; placeHidden:boolean; placeRows:FoundPlace[] | string;
  // 경로 선택(경로 칸을 누르면 넘어가는 쪽)
  routeWhen:RouteWhen|null; plans:Plan[]; chosen:number; routeMsg:string; routeLoading:boolean;   // routeLoading: 길을 찾는 중(뼈대 카드)
  routeFilter:RouteFilterView | null;   // 조건 고르기(종류 · 차례)와 보일 차례(plans 의 번호) — 길이 없으면 null
  stepsOf:Plan | null;   // 경로 고르기에서 단계 목록을 펼친 경로(목록을 다시 찾으면 다른 객체라 저절로 접힌다)
  stepsOpen:string | null;   // 승차권 뒷면에서 단계 목록을 펼친 카드(목록 번호 + 카드 번호 — 목록을 다시 받으면 저절로 접힌다)
}
let view:View = {
  colors: {}, tickets: [], listTurn: 0, flipped: [], chains: [], mapping: -1,
  opened: false, editingId: undefined, name: '', time: '08:00', days: [], from: null, to: null, route: null, wheelOpen: false, sending: false, deleteArmed: false, fromHere: false, toHere: false,
  placeFor: null, placeQuery: '', placeHidden: true, placeRows: [],
  routeWhen: null, plans: [], chosen: -1, routeMsg: '', routeLoading: false, routeFilter: null, stepsOf: null, stepsOpen: null,
};
let handlers:Handlers | null = null;
const call = <K extends keyof Handlers>(key:K) => (...args:Parameters<Handlers[K]>) => (handlers?.[key] as (...callArgs:Parameters<Handlers[K]>) => void)?.(...args);

// 오늘 타는 날인가(번호 없는 미리보기는 아니다)
const isToday = (ticket:{ id?:number | string | undefined; days:number[] }) => !!ticket.id && ticket.days.includes(todayDay());
// 목록 카드: 누르면 뒤집기, '고치기 ›' 는 발권 화면 · '지도에서 보기' 는 지도에 그 길(둘 다 카드 뒤집기 없이)
function Card({ ticket, index }:{ ticket:Ticket; index:number }) {
  const stepsKey = `${view.listTurn}-${index}`, opened = view.stepsOpen === stepsKey;
  return <TicketCard ticket={ticket} today={isToday(ticket)} flipped={!!view.flipped[index]} chain={view.chains[index] ?? null} mapping={view.mapping === index}
    steps={opened && ticket.route ? routeSteps(ticket.route.legs, { from: ticket.from.name, to: ticket.to.name }, view.colors) : null}
    onFlip={() => call('ticketFlip')(index)} onEdit={() => call('ticketEdit')(index)} onMap={() => call('ticketMap')(index)} onSteps={() => set({ stepsOpen: opened ? null : stepsKey })} />;
}
function TicketsPage() {
  return <TicketList onNew={call('ticketNew')}>{view.tickets.map((ticket, index) => <Card key={`${view.listTurn}-${index}`} ticket={ticket} index={index} />)}</TicketList>;
}

// 장소 칸(출발 · 도착): 칸을 누르거나 글자를 치면 칸 바로 아래에 찾은 곳이 펼쳐지고 고르면 접힌다(길찾기 시트의 출발 · 도착 칸과 같은 방식)
function Place({ which }:{ which:PlaceKey }) {
  const spot = view[which], active = view.placeFor === which, [head, empty, name, id] = PLACE_TEXT[which];
  return <PlaceField id={id} head={head} name={name} placeholder={view.opened ? empty : ''} to={which === 'to'} value={active ? view.placeQuery : spot?.name ?? ''} listHidden={!active || view.placeHidden} rows={view.placeRows}
    onFocus={() => call('placeFocus')(which)} onInput={value => call('placeInput')(value)} onPick={found => call('placePick')(found)} onLeave={() => call('placeBlur')(which)} onHere={() => call('here')(which)} onCloseList={() => set({ placeHidden: true })} />;
}
// 발권 화면의 경로 칸 속(옛 showRoute 의 innerHTML 글자) — 경로 목록과 같이 도착 시각은 빼고 '약 N분'(2026-10-29)
function routeHTML(route:SlimRoute | null) {
  if (!route) return `<span class="pk">경로 고르기</span>${CHEVRON}`;
  return `${routeTrack(route, view.colors, 270)}<span class="pk"><b>약 ${route.minutes}분</b> · 환승 ${route.transfers}</span><u>바꾸기</u>`;
}
function TicketPage() {
  const { opened } = view, time = timeParts(view.time), draft = { id: view.editingId, name: view.name.trim(), depart: view.time, days: view.days };
  return <>
    <div id="ticketPreview" aria-hidden="true">{opened && <div class="ticket"><div class="ticket-in"><TicketFront ticket={draft} today={isToday(draft)} /></div></div>}</div>
    <form id="ticketForm" class="ticket-form" autocomplete="off" noValidate onSubmit={event => { event.preventDefault(); call('submit')() }}>
      <div class="tf-route"><div class="tf-pls"><Place which="from" /><Place which="to" /></div></div>
      <TimeField open={view.wheelOpen} text={opened ? time : null} value={view.time} onToggle={call('timeToggle')} onDone={call('timeDone')} />
      <span id="ticketRouteLabel" class="tf-l">경로</span>
      <button id="ticketRoute" class={opened && !view.route ? 'tf-pick empty' : 'tf-pick'} type="button" aria-labelledby="ticketRouteLabel ticketRoute" onClick={call('route')}
        dangerouslySetInnerHTML={{ __html: opened ? routeHTML(view.route) : '' }}></button>
      <DayPicker days={view.days} onDay={day => call('day')(day)} onQuick={days => call('quick')(days)} />
      <label class="tf-l" for="ticketName">승차권 이름</label><div class="tf-in"><input id="ticketName" maxlength={12} placeholder="이름 넣기" enterkeyhint="done" value={view.name}
        onInput={event => call('name')(event.currentTarget.value)} /><small id="ticketNameCount" aria-hidden="true">{`${[...view.name].length}/12`}</small></div>
      <SaveButton id="ticketSave" type="submit" disabled={view.sending || (opened && !view.route)}>{view.sending ? '발권하는 중…' : '발권하기'}</SaveButton>
      <button id="ticketDelete" class="tf-del" type="button" hidden={!opened || view.editingId === undefined} onClick={call('remove')}>{view.deleteArmed ? '한 번 더 누르면 지워요' : '이 승차권 지우기'}</button>
    </form>
  </>;
}

// 경로 하나의 단추 속: 매일 다닐 길이라 시각(그날 시간표의 출발 · 도착)은 빼고 '약 N분'(2026-10-29)
function planHTML(plan:Plan) {
  return `<i class="rt-radio" aria-hidden="true"></i><span class="rt-b"><span class="jp-top"><strong class="jp-min"><small>약 </small>${plan.minutes}<small>분</small></strong>`
    + `${plan.tag ? `<span class="jp-tag">${esc(plan.tag)}</span>` : ''}</span>`
    + `${routeTrack(plan, view.colors, 250)}</span>`;
}
// 조건 고르기: 종류(길찾기 시트의 종류 탭 .jkinds 모양 · 길 수)
function RouteFilters({ filter }:{ filter:RouteFilterView }) {
  return <div class="rt-filters">
    <Segmented label="경로 종류" class="jkinds" attr="k" items={filter.kinds.map(tab => ({ id: tab.kind, name: tab.name, count: tab.count, pressed: tab.pressed }))} onPick={kind => call('routeKind')(kind)} />
  </div>;
}
// 경로 선택 쪽(발권 화면의 경로 칸으로 넘어간다): 출발 · 도착 머리말 · 시간 칩 · 종류 탭 · 단계 목록 · 이 경로로
function RoutePage() {
  const filter = view.routeFilter, order = filter ? filter.order : view.plans.map((_plan, index) => index);
  return <>
    <RouteHead when={view.routeWhen} from={view.from?.name} to={view.to?.name} />
    {filter && <RouteFilters filter={filter} />}
    {/* 고를 때는 표시(aria-checked)만 바뀐다 — 누른 단추가 문서에서 빠지면 본체의 '서랍 밖을 눌렀나' 검사가 서랍을 닫는다 */}
    {/* key 없이 자리마다 고쳐 쓴다 — 조건 차례로 단추를 옮기면(key) 크롬이 고른 카드의 동그라미 점을 빈 채로 그렸다(2026-10-29 확인) */}
    <div id="routeList" class="rt-list" role="radiogroup" aria-label="경로">{order.map(index => { const plan = view.plans[index]!, opened = view.stepsOf === plan; return <div class="rt-item"><div class="rt-card"><button type="button" class="rt-plan" role="radio" aria-checked={index === view.chosen ? 'true' : 'false'}
      aria-label={`${plan.tag || '경로'} 약 ${plan.minutes}분, 환승 ${plan.transfers}번`} onClick={() => call('plan')(index)} dangerouslySetInnerHTML={{ __html: planHTML(plan) }}></button>
      <button type="button" class="rt-open" aria-expanded={opened ? 'true' : 'false'} aria-label="경로 자세히 보기" onClick={() => set({ stepsOf: opened ? null : plan })}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg></button></div>
      {opened && <div class="rt-steps"><p class="jp-meta">{`환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`}</p><StepList steps={routeSteps(plan.legs, { from: view.from?.name ?? '출발', to: view.to?.name ?? '도착' }, view.colors)} className="jsteps shown" /></div>}</div>; })}</div>
    {filter?.empty && <div class="rt-empty"><b>{filter.empty}</b><p>다른 조건을 골라 보세요</p></div>}
    <p id="routeMsg" class="account-msg" role="status" aria-live="polite">{view.routeMsg}</p>
    {view.routeLoading && <RouteLoading />}
    {/* 이 경로로: 목록이 길어도 늘 보이게 맨 아래에 붙는다(경로 고르기 반쪽 시트 2026-10-29) */}
    <div class="rt-foot" hidden={!order.length}><SaveButton id="routePick" onClick={call('planPick')}>이 경로로</SaveButton></div>
  </>;
}

const PAGES = [['menuTickets', TicketsPage], ['menuTicket', TicketPage], ['menuRoute', RoutePage]] as const;
const roots = PAGES.map(([id, Page]) => [document.getElementById(id), Page] as const);
function set(patch:Partial<View>) {
  view = { ...view, ...patch };
  for (const [root, Page] of roots) if (root) render(<Page />, root);
}

// account.mts 의 창구: 상태 바꾸기 · 지금 상태 읽기 · 누름 받을 함수 걸기
export const ticketsView = {
  set, get state():Readonly<View> { return view },
  on(next:Handlers) { handlers = next },
};

// HTML 의 옛 속(같은 모양)을 비우고 그 자리에 그린다
for (const [root] of roots) if (root) root.textContent = '';
set({});
