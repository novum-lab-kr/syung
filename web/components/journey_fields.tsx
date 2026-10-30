// 길찾기 출발 · 도착 칸(한 카드에 두 줄 · 내 위치 단추 · 바꾸기 단추)과 장소 찾기 목록. props 만 받아 그린다 — 찾기 · 고르기는 lib/journey-ui.mts.
// 칸은 사용자가 치는 곳이라 처음 값(defaultValue)만 준다 — 값 바꾸기는 journey-ui 가 .value 로
import type { EndKind, Place, PlaceListView } from '../lib/journey-ui.mts';

const PIN = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/></svg>;
const SWAP = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/></svg>;

export interface JourneyFieldsProps {
  here:boolean;   // 내 위치를 아는가(아니면 단추 없음)
  fromValue:string; toValue?:string;   // 처음 값
  onTyped(which:EndKind, text:string):void; onHere():void; onSwap():void;
}
export function JourneyFields({ here, fromValue, toValue, onTyped, onHere, onSwap }:JourneyFieldsProps) {
  return <div class="jcard">
    <div class="jf jrow"><i class="jdot from" aria-hidden="true"></i>
      <input id="jFrom" type="text" autocomplete="off" aria-label="출발지" placeholder="어디서 출발할까요?" defaultValue={fromValue} onInput={event => onTyped('from', event.currentTarget.value)} />
      {here && <button type="button" class="jf-here" id="jHere" aria-label="내 위치에서 출발" title="내 위치" onClick={onHere}>{PIN}</button>}</div>
    <div class="jf jrow"><i class="jdot to" aria-hidden="true"></i>
      <input id="jTo" type="text" autocomplete="off" aria-label="도착지" placeholder="어디로 갈까요?" defaultValue={toValue} onInput={event => onTyped('to', event.currentTarget.value)} /></div>
    <button type="button" class="jswap" id="jSwap" aria-label="출발지와 도착지 바꾸기" title="바꾸기" onClick={onSwap}>{SWAP}</button>
  </div>;
}

// 장소 찾기 목록: 고를 곳들, 또는 빈 글자 한 줄
export function JourneyPlaceList({ id, label, list, onPick }:{ id:string; label:string; list:PlaceListView; onPick:(place:Place)=>void }) {
  return <ul class="jf-list" id={id} aria-label={label} hidden={list.hidden}>
    {list.empty !== null
      ? <li class="jf-empty">{list.empty}</li>
      : list.places.map(place => <li><button type="button" onClick={() => onPick(place)}><b>{place.name}</b><small>{place.address}</small></button></li>)}
  </ul>;
}
