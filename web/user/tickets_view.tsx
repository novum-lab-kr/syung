// 설정 서랍 승차권 쪽들의 속 — 승차권 목록(#menuTickets) · 발권 화면(#menuTicket — 장소 찾기 · 경로 목록까지 한 화면, 2026-10-29).
// 받기 · 바꾸기 · 알림(토스트) · 검사 차례는 user/account.mts 그대로 — 이 파일은 그리기와 누름 전달만. 상태는 옛 DOM 이 들고 있던 그대로이고
// account.mts 가 옛 DOM 을 고치던 자리에서 ticketsView.set(...) 으로 바꾼다. 바뀔 때마다 바로(같은 작업 안에서) 다시 그린다.
// 표시(DOM 모양 · class · id · 문구 · aria)는 옛 index.html · 옛 innerHTML 과 같다(옛 코드가 한 덩어리로 넣던 글자는 템플릿 하나로 — 글자 노드가 갈리면 커닝이 달라진다).
// 출발 시각 바퀴의 칸 속(.tw-col 의 단추 · 스크롤 자리 · on/near · aria-valuetext)은 account.mts 가 바닐라로 그대로 다룬다 — 여기서는 다시 그리지 않는다.
// 서랍 껍데기 · 쪽(section) 숨기기 · 쪽 이름(aria-label)은 본체 · account.mts 그대로.
import { Component, render } from 'preact';
import { routeSteps, routeTrack } from '../lib/journey-ui.mts';   // 경로 띠: 길찾기 결과와 같은 그림(본체가 이미 받은 파일)
import type { Plan, TrackLeg } from '../lib/journey-ui.mts';
import { RouteLoading, StepList } from '../ui/journey_sheet.tsx';   // 찾는 동안 뼈대 카드 · 단계 목록: 길찾기 시트와 같은 그림(본체가 이미 받은 파일)
import { shortName } from './ticket_routes.mts';
import type { RouteFilterView, RouteKind } from './ticket_routes.mts';
export { shortName };   // 이름 줄이기는 시험할 수 있게 ticket_routes.mts 에 둔다

// 서버 응답(server/routes/members.py · /api/place) 가운데 이 쪽들이 읽는 칸
interface RouteWhen {month:number; day:number; weekday:string; time:string}
export interface Place { name:string; lat:number; lng:number }
export interface FoundPlace extends Place { address:string }
// 저장하는 경로: 띠를 그리고 뒷면을 쓰는 데 필요한 칸만(slimRoute)
export type SlimLeg = TrackLeg & { from?:string; to?:string };
export interface SlimRoute { tag:string; minutes:number; leaveBy:string; arrives:string; transfers:number; walkMinutes:number; legs:SlimLeg[] }
// 승차권 한 장(id 가 없으면 발권 화면의 미리보기)
export interface Ticket { id?:number | string; name:string; from:Place; to:Place; depart:string; days:number[]; route?:SlimRoute | null }

export const DAYS = ['월', '화', '수', '목', '금', '토', '일'];   // 1(월) … 7(일)
const QUICK = [['1,2,3,4,5', '평일'], ['6,7', '주말'], ['1,2,3,4,5,6,7', '매일']] as const;
export const esc = (text:unknown) => String(text).replace(/[&<>"']/g, mark => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[mark]!);
const todayDay = () => (new Date().getDay() + 6) % 7 + 1;   // 1(월) … 7(일)
const daysText = (days:number[]) => days.length ? days.map(day => DAYS[day - 1]).join(' ') : '없음';
// 출발 시각 글자: '오전' · '8:00'(발권 화면 시각 칸 · 경로 선택 머리말)
export function timeParts(time:string) {
  const [hour, minute] = (time || '08:00').split(':').map(Number) as [number, number];
  return { ampm: hour < 12 ? '오전' : '오후', clock: `${hour % 12 || 12}:${String(minute).padStart(2, '0')}` };
}
// 점선 슝 로고(속도선 + 기차, 노랑 네모 없이) — 앞면에 5개를 가로로, 가운데 하나가 정가운데
const LOGO = '<svg viewBox="0 0 100 60"><g fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray=".3 2.3" stroke-linecap="round"><rect x="36" y="11" width="56" height="38" rx="19"/><rect x="40.5" y="15.5" width="47" height="29" rx="14.5"/><circle cx="74" cy="30" r="7.5"/><circle cx="74" cy="30" r="3.5"/><rect x="15" y="16" width="17" height="7" rx="3.5"/><rect x="8" y="26.5" width="24" height="7" rx="3.5"/><rect x="15" y="37" width="17" height="7" rx="3.5"/></g></svg>';
const LOGOS = { __html: LOGO.repeat(5) };
const STRIP = [0, 1, 2, 3, 4, 5, 6];
// 내 위치 단추의 핀(길찾기 시트의 jf-here 와 같은 그림)
const CHEVRON = '<svg class="tf-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>';
export type PlaceKey = 'from' | 'to';
// 칸마다: [머리 글자, 빈 칸 글자, 이름, 칸 id, 동그라미 class]
const PLACE_TEXT = { from: ['출발', '출발지 고르기', '출발지', 'ticketFrom', 'tf-dot'], to: ['도착', '도착지 고르기', '도착지', 'ticketTo', 'tf-dot to'] } as const;

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

// 승차권 앞면(목록 카드 · 발권 화면 미리보기)
function Front({ ticket }:{ ticket:Pick<Ticket, 'id' | 'name' | 'depart' | 'days'> }) {
  const name = ticket.name || '승차권', label = ticket.name ? `${name}권` : name;   // 이름이 없으면 '승차권'(승차권권 아님)
  const serial = `${ticket.id ? String(ticket.id).padStart(4, '0') : '----'} ${ticket.days.map(day => DAYS[day - 1]).join('')} ${(ticket.depart || '').replace(':', '')}`;
  const today = ticket.id && ticket.days.includes(todayDay());
  return <div class="tk-face tk-front"><div class="tk-logos"><div class="tk-logo-row" dangerouslySetInnerHTML={LOGOS}></div></div>
    <div class="tk-top"><b>{name}</b><b>{ticket.depart || '--:--'}</b></div>
    <div class="tk-strip">{STRIP.map(() => <span><img src="./brand/syung-light.svg" alt="" />{label}</span>)}</div>
    <div class="tk-serial">{serial}</div>{today ? <span class="tk-today">오늘</span> : null}
    {ticket.id ? <button class="tk-flip" type="button" aria-label="뒤집기">↻</button> : null}</div>;
}
// 목록 카드: 누르면 뒤집기, '고치기 ›' 는 발권 화면 · '지도에서 보기' 는 지도에 그 길(둘 다 카드 뒤집기 없이)
function Card({ ticket, index }:{ ticket:Ticket; index:number }) {
  const chain = view.chains[index] ?? null, stepsKey = `${view.listTurn}-${index}`, opened = view.stepsOpen === stepsKey;
  const waiting = `<span>${esc(shortName(ticket.from.name))}</span><em>→</em><span>${esc(shortName(ticket.to.name))}</span>`;
  return <><div class={view.flipped[index] ? 'ticket flipped' : 'ticket'} onClick={event => {
    if ((event.target as Element).closest('.tk-steps-btn')) { event.stopPropagation(); set({ stepsOpen: opened ? null : stepsKey }); return }
    if ((event.target as Element).closest('.tk-edit')) { event.stopPropagation(); call('ticketEdit')(index); return }
    if ((event.target as Element).closest('.tk-map')) { event.stopPropagation(); call('ticketMap')(index); return }
    call('ticketFlip')(index);
  }}><div class="ticket-in"><Front ticket={ticket} /><div class="tk-face tk-back">
    <p class={chain === null ? 'tk-chain wait' : 'tk-chain'} dangerouslySetInnerHTML={{ __html: chain ?? waiting }}></p>
    {ticket.route && <div class="tk-alts"><button class="tk-steps-btn" type="button" aria-expanded={opened ? 'true' : 'false'}>경로 자세히<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg></button></div>}
    <p class="tk-time"><span>출발 시각</span><b>{ticket.depart}</b></p><div class="tk-mag"></div>
    <div class="tk-foot"><span>{`타는 날 ${daysText(ticket.days)}`}</span><span class="tk-acts">
      {/* 찾는 동안은 aria-disabled 만(disabled 단추는 누름이 카드로 새어 뒤집힐 수 있다) — 두 번 누름은 account.mts 가 막는다 */}
      <button class="tk-map" type="button" aria-disabled={view.mapping === index ? 'true' : undefined}>{view.mapping === index ? '찾는 중…' : '지도에서 보기'}</button>
      <button class="tk-edit" type="button">고치기 ›</button></span></div></div></div></div>
    {opened && ticket.route && <div class="tk-steps"><StepList steps={routeSteps(ticket.route.legs, { from: ticket.from.name, to: ticket.to.name }, view.colors)} className="jsteps shown" /></div>}</>;
}
function TicketsPage() {
  return <>
    <div id="ticketList" class="ticket-list">{view.tickets.map((ticket, index) => <Card key={`${view.listTurn}-${index}`} ticket={ticket} index={index} />)}</div>
    <button id="ticketNew" class="ticket-new" type="button" onClick={call('ticketNew')}>+ 승차권 예매하기</button>
  </>;
}

// 출발 시각 바퀴의 칸: 한 번만 그리고 다시 그리지 않는다(칸 속 단추 · 스크롤은 account.mts 가 바닐라로)
class Wheels extends Component {
  override shouldComponentUpdate() { return false }
  override render() {
    return <div class="tw-cols"><div class="tw-band" aria-hidden="true"></div><div class="tw-col" data-part="ampm" role="spinbutton" tabindex={0} aria-label="오전 · 오후"></div>
      <div class="tw-col" data-part="hour" role="spinbutton" tabindex={0} aria-label="시"></div><span class="tw-colon" aria-hidden="true">:</span>
      <div class="tw-col" data-part="minute" role="spinbutton" tabindex={0} aria-label="분"></div></div>;
  }
}
// 장소 칸(출발 · 도착): 칸을 누르거나 글자를 치면 칸 바로 아래에 찾은 곳이 펼쳐지고 고르면 접힌다(길찾기 시트의 출발 · 도착 칸과 같은 방식).
// 목록에서 고른 단추가 문서에서 빠지면 본체의 '서랍 밖을 눌렀나' 검사가 서랍을 닫는다 — 목록은 늘 문서에 두고 숨기기만 하고, 누름은 거기서 멈춘다
function PlaceField({ which }:{ which:PlaceKey }) {
  const spot = view[which], active = view.placeFor === which, [label, empty, aria, id, dot] = PLACE_TEXT[which], rows = view.placeRows;
  return <div class="tf-fld" onFocusOut={event => {   // 같은 칸(입력 · 📍 · 결과 목록) 안으로 초점이 옮겨 가면 목록을 남기고, 영역을 벗어나야 닫는다(Tab 으로 결과 고르기)
      const next = event.relatedTarget as Node | null;
      if (!next || !event.currentTarget.contains(next)) call('placeBlur')(which);
    }}><div class="tf-row"><label class="tf-pl"><i class={dot} aria-hidden="true"></i>
      <span><small>{label}</small><input id={id} type="text" maxlength={40} autocomplete="off" aria-label={aria} aria-controls={`${id}List`} placeholder={view.opened ? empty : ''} value={active ? view.placeQuery : spot?.name ?? ''}
        onFocus={event => { call('placeFocus')(which); event.currentTarget.select() }} onInput={event => call('placeInput')(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') event.preventDefault();   // 글자 칸의 Enter 가 발권(폼 제출)이 되지 않게
          else if (event.key === 'Escape' && active && !view.placeHidden) { event.stopPropagation(); set({ placeHidden: true }) }   // 목록이 떠 있으면 목록만 접고 서랍은 닫지 않는다
        }} /></span></label>
    <button id={`${id}Here`} class="tf-here" type="button" aria-label={`내 위치를 ${aria}로`} title="내 위치" onClick={() => call('here')(which)} dangerouslySetInnerHTML={{ __html: PIN }}></button></div>
    <ul id={`${id}List`} class="pp-list tf-list" aria-label={`${aria} 찾기 결과`} hidden={!active || view.placeHidden}>{typeof rows === 'string' ? <li class="empty">{rows}</li>
      : rows.map(found => <li><button type="button" onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); call('placePick')(found) }}><b>{found.name}</b><small>{found.address}</small></button></li>)}</ul></div>;
}
// 발권 화면의 경로 칸 속(옛 showRoute 의 innerHTML 글자) — 경로 목록과 같이 도착 시각은 빼고 '약 N분'(2026-10-29)
function routeHTML(route:SlimRoute | null) {
  if (!route) return `<span class="pk">경로 고르기</span>${CHEVRON}`;
  return `${routeTrack(route, view.colors, 270)}<span class="pk"><b>약 ${route.minutes}분</b> · 환승 ${route.transfers}</span><u>바꾸기</u>`;
}
function TicketPage() {
  const { opened } = view, time = timeParts(view.time), quickNow = view.days.join(',');
  return <>
    <div id="ticketPreview" aria-hidden="true">{opened && <div class="ticket"><div class="ticket-in"><Front ticket={{ id: view.editingId, name: view.name.trim(), depart: view.time, days: view.days }} /></div></div>}</div>
    <form id="ticketForm" class="ticket-form" autocomplete="off" noValidate onSubmit={event => { event.preventDefault(); call('submit')() }}>
      <div class="tf-route"><div class="tf-pls"><PlaceField which="from" /><PlaceField which="to" /></div></div>
      <button id="ticketTimeBtn" class="tf-time" type="button" aria-expanded={view.wheelOpen ? 'true' : 'false'} aria-controls="ticketTimePick" onClick={call('timeToggle')}><span>출발 시각</span>
        <b id="ticketTimeText">{opened && <><em>{time.ampm}</em>{` ${time.clock}`}</>}</b><svg class="tf-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>
      <input id="ticketTime" type="hidden" value={view.time} />
      <div id="ticketTimePick" class="tf-wheel" hidden={!view.wheelOpen}><Wheels />
        <div class="tw-foot"><span>돌려서 고르기 · 5분 단위</span><button id="ticketTimeDone" class="tw-ok" type="button" onClick={call('timeDone')}>완료</button></div></div>
      <span id="ticketRouteLabel" class="tf-l">경로</span>
      <button id="ticketRoute" class={opened && !view.route ? 'tf-pick empty' : 'tf-pick'} type="button" aria-labelledby="ticketRouteLabel ticketRoute" onClick={call('route')}
        dangerouslySetInnerHTML={{ __html: opened ? routeHTML(view.route) : '' }}></button>
      <div class="tf-dh"><span id="ticketDaysLabel" class="tf-l">타는 날</span><span id="ticketQuick" class="tf-quick" role="group" aria-label="타는 날 빠르게 고르기">
        {QUICK.map(([days, label]) => <button type="button" data-quick={days} aria-pressed={quickNow === days ? 'true' : 'false'} onClick={() => call('quick')(days)}><i>{label}</i></button>)}</span></div>
      <div id="ticketDays" class="tf-days" role="group" aria-labelledby="ticketDaysLabel">
        {DAYS.map((label, index) => <button type="button" data-day={index + 1} aria-pressed={view.days.includes(index + 1) ? 'true' : 'false'} onClick={() => call('day')(index + 1)}>{label}</button>)}</div>
      <label class="tf-l" for="ticketName">승차권 이름</label><div class="tf-in"><input id="ticketName" maxlength={12} placeholder="이름 넣기" enterkeyhint="done" value={view.name}
        onInput={event => call('name')(event.currentTarget.value)} /><small id="ticketNameCount" aria-hidden="true">{`${[...view.name].length}/12`}</small></div>
      <button id="ticketSave" class="tf-save" type="submit" disabled={view.sending || (opened && !view.route)}>{view.sending ? '발권하는 중…' : '발권하기'}</button>
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
    <div class="segmented jkinds" role="group" aria-label="경로 종류">{filter.kinds.map(tab => <button type="button" data-k={tab.kind} aria-pressed={tab.pressed} onClick={() => call('routeKind')(tab.kind)}>{tab.name}<b>{tab.count}</b></button>)}</div>
  </div>;
}
// 경로 선택 쪽(발권 화면의 경로 칸으로 넘어간다): 출발 · 도착 머리말 · 시간 칩 · 종류 탭 · 단계 목록 · 이 경로로
function RoutePage() {
  const filter = view.routeFilter, order = filter ? filter.order : view.plans.map((_plan, index) => index);
  return <>
    {/* 머리말: 왼쪽 달력 날짜 | 오른쪽 '출발지에서 → 도착지까지 → 시각 출발' (목적지가 제목) */}
    <div class="rt-sum">{view.routeWhen && <div class="rt-cal" id="routeWhen" aria-label={`${view.routeWhen.month}월 ${view.routeWhen.day}일 ${view.routeWhen.weekday}`}><span class="rt-month">{view.routeWhen.month}월</span><b class="rt-day">{view.routeWhen.day}</b><span class="rt-wd">{view.routeWhen.weekday}</span></div>}
      <div class="rt-trip"><p class="rt-origin"><b id="routeFrom">{view.from?.name}</b>에서</p>
        <p class="rt-dest"><b id="routeTo">{view.to?.name}</b><span class="rt-to-sfx">까지</span></p>
        {view.routeWhen && <p class="rt-time"><b>{view.routeWhen.time} 출발</b><span>이 시각 출발 기준으로 찾은 경로</span></p>}</div></div>
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
    <div class="rt-foot" hidden={!order.length}><button id="routePick" class="tf-save" type="button" onClick={call('planPick')}>이 경로로</button></div>
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
