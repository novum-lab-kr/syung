// 타는 요일 고르기: 빠르게 고르기(평일 · 주말 · 매일) + 요일 일곱 칸. props 만 받아 그린다. 요일 번호는 1(월) … 7(일)
import { DAYS } from '../user/ticket_routes.mts';

const QUICK = [['1,2,3,4,5', '평일'], ['6,7', '주말'], ['1,2,3,4,5,6,7', '매일']] as const;

export function DayPicker({ days, onDay, onQuick }:{ days:number[]; onDay(day:number):void; onQuick(days:string):void }) {
  const quickNow = days.join(',');
  return <>
    <div class="tf-dh"><span id="ticketDaysLabel" class="tf-l">타는 날</span><span id="ticketQuick" class="tf-quick" role="group" aria-label="타는 날 빠르게 고르기">
      {QUICK.map(([value, label]) => <button type="button" data-quick={value} aria-pressed={quickNow === value ? 'true' : 'false'} onClick={() => onQuick(value)}><i>{label}</i></button>)}</span></div>
    <div id="ticketDays" class="tf-days" role="group" aria-labelledby="ticketDaysLabel">
      {DAYS.map((label, index) => <button type="button" data-day={index + 1} aria-pressed={days.includes(index + 1) ? 'true' : 'false'} onClick={() => onDay(index + 1)}>{label}</button>)}</div>
  </>;
}
