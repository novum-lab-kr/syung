// 승차권 카드: 앞면(TicketFront — 목록 카드 · 발권 화면 미리보기) · 앞뒤가 있는 목록 카드(TicketCard) · 목록과 예매 단추(TicketList).
// props 만 받아 그린다(전역 상태 없음). DOM · class · 문구 · aria 는 옛 화면 그대로 — 스타일은 syung.css
import type { ComponentChildren } from 'preact';
import type { StepView } from '../lib/journey-ui.mts';
import { DAYS, esc, shortName } from '../user/ticket_routes.mts';
import { Button } from './button.tsx';
import { DOWN } from './icons.tsx';
import { StepList } from './step_list.tsx';

// 점선 슝 로고(속도선 + 기차, 노랑 네모 없이) — 앞면에 5개를 가로로, 가운데 하나가 정가운데
const LOGO = '<svg viewBox="0 0 100 60"><g fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray=".3 2.3" stroke-linecap="round"><rect x="36" y="11" width="56" height="38" rx="19"/><rect x="40.5" y="15.5" width="47" height="29" rx="14.5"/><circle cx="74" cy="30" r="7.5"/><circle cx="74" cy="30" r="3.5"/><rect x="15" y="16" width="17" height="7" rx="3.5"/><rect x="8" y="26.5" width="24" height="7" rx="3.5"/><rect x="15" y="37" width="17" height="7" rx="3.5"/></g></svg>';
const LOGOS = { __html: LOGO.repeat(5) };
const STRIP = [0, 1, 2, 3, 4, 5, 6];
const daysText = (days:number[]) => days.length ? days.map(day => DAYS[day - 1]).join(' ') : '없음';

// 앞면에 쓰는 칸(id 가 없으면 발권 화면의 미리보기) · 뒷면은 출발 · 도착 이름과 저장한 경로가 있는지까지 본다
export interface TicketFaceData { id?:number | string | undefined; name:string; depart:string; days:number[] }
export interface TicketCardData extends TicketFaceData { from:{ name:string }; to:{ name:string }; route?:object | null }

export function TicketFront({ ticket, today }:{ ticket:TicketFaceData; today:boolean }) {
  const name = ticket.name || '승차권', label = ticket.name ? `${name}권` : name;   // 이름이 없으면 '승차권'(승차권권 아님)
  const serial = `${ticket.id ? String(ticket.id).padStart(4, '0') : '----'} ${ticket.days.map(day => DAYS[day - 1]).join('')} ${(ticket.depart || '').replace(':', '')}`;
  return <div class="tk-face tk-front"><div class="tk-logos"><div class="tk-logo-row" dangerouslySetInnerHTML={LOGOS}></div></div>
    <div class="tk-top"><b>{name}</b><b>{ticket.depart || '--:--'}</b></div>
    <div class="tk-strip">{STRIP.map(() => <span><img src="./brand/syung-light.svg" alt="" />{label}</span>)}</div>
    <div class="tk-serial">{serial}</div>{today ? <span class="tk-today">오늘</span> : null}
    {ticket.id ? <button class="tk-flip" type="button" aria-label="뒤집기">↻</button> : null}</div>;
}

export interface TicketCardProps {
  ticket:TicketCardData;
  today:boolean;   // 오늘 타는 날인가(앞면 '오늘' 표시)
  flipped:boolean;
  chain:string | null;   // 뒷면 첫 줄 HTML(null 이면 출발 → 도착 이름으로 기다리는 모양)
  mapping:boolean;   // '지도에서 보기'로 길을 찾는 중
  steps:StepView[] | null;   // 펼친 단계 목록(접혀 있으면 null)
  onFlip():void; onEdit():void; onMap():void; onSteps():void;
}
// 누르면 뒤집기. '고치기 ›' · '지도에서 보기' · '경로 자세히' 는 카드를 뒤집지 않는다 — 누름은 카드의 onClick 이 class 로 나눈다
export function TicketCard({ ticket, today, flipped, chain, mapping, steps, onFlip, onEdit, onMap, onSteps }:TicketCardProps) {
  const waiting = `<span>${esc(shortName(ticket.from.name))}</span><em>→</em><span>${esc(shortName(ticket.to.name))}</span>`;
  return <><div class={flipped ? 'ticket flipped' : 'ticket'} onClick={event => {
    if ((event.target as Element).closest('.tk-steps-btn')) { event.stopPropagation(); onSteps(); return }
    if ((event.target as Element).closest('.tk-edit')) { event.stopPropagation(); onEdit(); return }
    if ((event.target as Element).closest('.tk-map')) { event.stopPropagation(); onMap(); return }
    onFlip();
  }}><div class="ticket-in"><TicketFront ticket={ticket} today={today} /><div class="tk-face tk-back">
    <p class={chain === null ? 'tk-chain wait' : 'tk-chain'} dangerouslySetInnerHTML={{ __html: chain ?? waiting }}></p>
    {ticket.route && <div class="tk-alts"><Button variant="text" class="on-ticket tk-steps-btn" expanded={steps !== null}>경로 자세히{DOWN}</Button></div>}
    <p class="tk-time"><span>출발 시각</span><b>{ticket.depart}</b></p><div class="tk-mag"></div>
    <div class="tk-foot"><span>{`타는 날 ${daysText(ticket.days)}`}</span><span class="tk-acts">
      {/* 찾는 동안은 aria-disabled 만(Button — disabled 단추는 누름이 카드로 새어 뒤집힐 수 있다) — 두 번 누름은 화면 쪽(account.mts)이 막는다 */}
      <Button variant="secondary" class="on-ticket tk-map" loading={mapping ? '찾는 중…' : undefined}>지도에서 보기</Button>
      <Button class="on-ticket tk-edit">고치기 ›</Button></span></div></div></div></div>
    {ticket.route && steps && <div class="tk-steps"><StepList steps={steps} className="jsteps shown" /></div>}</>;
}

// 승차권 목록(카드가 없으면 빈 칸 + 예매 단추만 — 빈 목록 글은 없다)
export function TicketList({ onNew, children }:{ onNew?:() => void; children?:ComponentChildren }) {
  return <>
    <div id="ticketList" class="ticket-list">{children}</div>
    <button id="ticketNew" class="ticket-new" type="button" onClick={onNew}>+ 승차권 예매하기</button>
  </>;
}
