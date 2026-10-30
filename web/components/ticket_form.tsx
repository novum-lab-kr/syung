// 발권 화면 틀: 미리보기 · 출발 · 도착 칸 · 시각 · 경로 칸 · 요일 · 이름 · 발권하기 · 지우기의 자리와 섹션 제목. props 만 받아 그린다.
// 칸 부품(장소 · 시각 · 요일)은 화면이 값을 채워 넣는다(places · time · days). 검사 · 저장은 화면(user/account.mts). DOM · class · id · 문구 · aria 는 옛 화면 그대로 — 스타일은 syung.css.
import type { ComponentChildren } from 'preact';
import { SaveButton } from './save_button.tsx';
import { TicketFront } from './ticket_card.tsx';
import type { TicketFaceData } from './ticket_card.tsx';

export interface TicketFormProps {
  preview:{ ticket:TicketFaceData; today:boolean } | null;   // 처음 열기 전엔 null(옛 HTML 의 빈 칸)
  places:ComponentChildren; time:ComponentChildren; days:ComponentChildren;
  routeHTML:string; routeEmpty:boolean;   // 경로 칸 속 글자 · 아직 안 고른 모양인가
  name:string;
  sending:boolean; saveDisabled:boolean;
  deleteHidden:boolean; deleteArmed:boolean;   // deleteArmed: 한 번 눌러 확인을 기다리는 중
  onRoute?:() => void; onName?:(value:string) => void; onSubmit?:() => void; onDelete?:() => void;
}
export function TicketForm({ preview, places, time, days, routeHTML, routeEmpty, name, sending, saveDisabled, deleteHidden, deleteArmed, onRoute, onName, onSubmit, onDelete }:TicketFormProps) {
  return <>
    <div id="ticketPreview" aria-hidden="true">{preview && <div class="ticket"><div class="ticket-in"><TicketFront ticket={preview.ticket} today={preview.today} /></div></div>}</div>
    <form id="ticketForm" class="ticket-form" autocomplete="off" noValidate onSubmit={event => { event.preventDefault(); onSubmit?.() }}>
      <div class="tf-route"><div class="tf-pls">{places}</div></div>
      {time}
      <span id="ticketRouteLabel" class="tf-l">경로</span>
      <button id="ticketRoute" class={routeEmpty ? 'tf-pick empty' : 'tf-pick'} type="button" aria-labelledby="ticketRouteLabel ticketRoute" onClick={() => onRoute?.()}
        dangerouslySetInnerHTML={{ __html: routeHTML }}></button>
      {days}
      <label class="tf-l" for="ticketName">승차권 이름</label><div class="tf-in"><input id="ticketName" maxlength={12} placeholder="이름 넣기" enterkeyhint="done" value={name}
        onInput={event => onName?.(event.currentTarget.value)} /><small id="ticketNameCount" aria-hidden="true">{`${[...name].length}/12`}</small></div>
      <SaveButton id="ticketSave" type="submit" disabled={saveDisabled}>{sending ? '발권하는 중…' : '발권하기'}</SaveButton>
      <button id="ticketDelete" class="tf-del" type="button" hidden={deleteHidden} onClick={() => onDelete?.()}>{deleteArmed ? '한 번 더 누르면 지워요' : '이 승차권 지우기'}</button>
    </form>
  </>;
}
