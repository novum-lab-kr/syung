// 길찾기 출발 시각 고르기: 시간 줄(지금 출발 · 오늘 08:30 출발)과 펼친 칸(발권 화면과 같은 시각 바퀴 · 지금으로 · 이 시간에 출발). props 만 받아 그린다 — 시각 셈은 lib/journey-ui.mts.
import { TimeWheels } from './time_field.tsx';

const CHEV = <svg class="jw-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>;
const CLOCK = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>;

export interface JourneyWhenProps {
  text:string; isSet:boolean;   // 시간 줄 글자 · 시각을 골랐는가
  open:boolean;
  onRow():void; onNow():void; onGo():void;
}
export function JourneyWhen({ text, isSet, open, onRow, onNow, onGo }:JourneyWhenProps) {
  return <div class="jopts jwhen">
    <button type="button" class={isSet ? 'jw-row set' : 'jw-row'} id="jWhenRow" aria-expanded={open} aria-controls="jWhenPanel" onClick={onRow}>{CLOCK}<span id="jWhenText">{text}</span>{CHEV}</button>
    <div class="jw-panel" id="jWhenPanel" role="group" aria-label="출발 시각" hidden={!open}>
      <div class="tf-wheel jw-wheel" id="jWhenWheel"><TimeWheels /></div>
      <div class="jw-acts"><button type="button" class="jw-now" id="jWhenNow" onClick={onNow}>지금으로</button><button type="button" class="jw-go" id="jWhenGo" onClick={onGo}>이 시간에 출발</button></div>
    </div>
  </div>;
}
