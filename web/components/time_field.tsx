// 시각 고르기: 출발 시각 칸 + 펼치는 바퀴(오전/오후 · 시 · 분). props 만 받아 그린다.
// 바퀴 칸 속(.tw-col 의 단추 · 스크롤 자리 · on/near · aria-valuetext)은 화면 쪽(account.mts)이 바닐라로 다룬다 — 여기서는 칸만 한 번 그리고 다시 그리지 않는다
import { Component } from 'preact';

class Wheels extends Component {
  override shouldComponentUpdate() { return false }
  override render() {
    return <div class="tw-cols"><div class="tw-band" aria-hidden="true"></div><div class="tw-col" data-part="ampm" role="spinbutton" tabindex={0} aria-label="오전 · 오후"></div>
      <div class="tw-col" data-part="hour" role="spinbutton" tabindex={0} aria-label="시"></div><span class="tw-colon" aria-hidden="true">:</span>
      <div class="tw-col" data-part="minute" role="spinbutton" tabindex={0} aria-label="분"></div></div>;
  }
}

export interface TimeFieldProps {
  open:boolean;   // 바퀴를 펼쳤나
  text:{ ampm:string; clock:string } | null;   // 칸에 보일 시각(null 이면 빈 칸)
  value:string;   // 'HH:MM'
  onToggle():void; onDone():void;
}
export function TimeField({ open, text, value, onToggle, onDone }:TimeFieldProps) {
  return <>
    <button id="ticketTimeBtn" class="tf-time" type="button" aria-expanded={open ? 'true' : 'false'} aria-controls="ticketTimePick" onClick={onToggle}><span>출발 시각</span>
      <b id="ticketTimeText">{text && <><em>{text.ampm}</em>{` ${text.clock}`}</>}</b><svg class="tf-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>
    <input id="ticketTime" type="hidden" value={value} />
    <div id="ticketTimePick" class="tf-wheel" hidden={!open}><Wheels />
      <div class="tw-foot"><span>돌려서 고르기 · 5분 단위</span><button id="ticketTimeDone" class="tw-ok" type="button" onClick={onDone}>완료</button></div></div>
  </>;
}
