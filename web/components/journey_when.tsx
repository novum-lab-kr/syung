// 길찾기 출발 시각 고르기: 접힌 줄(지금 출발 · 오늘 08:30 출발)과 펼친 칸(오늘/내일 · 시 · 분 단추 · 지금으로 · 이 시간에 출발). props 만 받아 그린다 — 시각 셈은 lib/journey-ui.mts.
import type { ComponentChildren } from 'preact';
import type { DraftView, StepHold } from '../lib/journey-ui.mts';
import { Segmented } from './segmented.tsx';

const CHEV = <svg class="jw-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>;
const UP = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>;
const DOWN = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>;
const CLOCK = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>;

// 시각 단추 하나: 누르면 한 칸, 누르고 있으면 되풀이(hold) · 길게 눌러도 고르기 · 메뉴가 뜨지 않게
function StepButton({ unit, step, label, off, hold, icon }:{ unit:string; step:number; label:string; off:boolean; hold:StepHold; icon:ComponentChildren }) {
  return <button type="button" class="jw-step" data-u={unit} data-s={String(step)} aria-label={label} disabled={off}
    onPointerDown={hold.down} onPointerUp={hold.stop} onPointerLeave={hold.stop} onPointerCancel={hold.stop} onClick={hold.click}
    onTouchStart={event => event.preventDefault()} onContextMenu={event => event.preventDefault()}>{icon}</button>;
}

export interface JourneyWhenProps {
  text:string; isSet:boolean;   // 접힌 줄 글자 · 시각을 골랐는가
  open:boolean; draft:DraftView | null;
  hold:Record<string, StepHold>;   // 단추 넷: h1 · h-1 · m1 · m-1
  onRow():void; onNow():void; onGo():void; onDay(offset:number):void;
}
export function JourneyWhen({ text, isSet, open, draft, hold, onRow, onNow, onGo, onDay }:JourneyWhenProps) {
  const off = (key:string) => draft?.off[key] ?? false;
  return <div class="jopts jwhen">
    <button type="button" class={isSet ? 'jw-row set' : 'jw-row'} id="jWhenRow" aria-expanded={open} aria-controls="jWhenPanel" onClick={onRow}>{CLOCK}<span id="jWhenText">{text}</span>{CHEV}</button>
    <div class="jw-panel" id="jWhenPanel" hidden={!open}>
      <div class="jw-head"><b>출발 시각</b><button type="button" class="jw-now" id="jWhenNow" onClick={onNow}>지금으로</button></div>
      <Segmented label="날짜" class="jw-day" attr="d" items={[{ id: '0', name: '오늘', pressed: !(draft?.tomorrow ?? false) }, { id: '1', name: '내일', pressed: draft?.tomorrow ?? false }]} onPick={day => onDay(Number(day))} />
      <div class="jw-clock" aria-live="polite">
        <div class="jw-col"><StepButton unit="h" step={1} label="1시간 늦게" off={off('h1')} hold={hold['h1']!} icon={UP} /><output id="jWhenH">{draft?.hours ?? '00'}</output><StepButton unit="h" step={-1} label="1시간 이르게" off={off('h-1')} hold={hold['h-1']!} icon={DOWN} /></div>
        <span class="jw-colon" aria-hidden="true">:</span>
        <div class="jw-col"><StepButton unit="m" step={1} label="1분 늦게" off={off('m1')} hold={hold['m1']!} icon={UP} /><output id="jWhenM">{draft?.minutes ?? '00'}</output><StepButton unit="m" step={-1} label="1분 이르게" off={off('m-1')} hold={hold['m-1']!} icon={DOWN} /></div>
      </div>
      <button type="button" class="jw-go" id="jWhenGo" onClick={onGo}>이 시간에 출발</button>
    </div>
  </div>;
}
