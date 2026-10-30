// 기초 컴포넌트: 세그먼트 탭(길찾기 종류 탭 · 오늘/내일 · 승차권 경로 종류 — .segmented). 고른 칸은 aria-pressed.
// 지금 화면과 같은 DOM(div role=group > button[data-<attr>] · 개수는 <b>)을 그려 syung.css 를 그대로 쓴다
import type { ComponentChildren } from 'preact';

// Id: 칸 이름의 타입(예: 승차권 경로 종류 RouteKind) — 고른 칸을 그 타입 그대로 onPick 에 넘긴다
export interface SegmentItem<Id extends string = string> { id:Id; name:ComponentChildren; count?:number; pressed:boolean }

export interface SegmentedProps<Id extends string = string> {
  label:string;   // aria-label(무엇을 고르는 탭인지)
  class?:string;   // 덧붙일 class(놓인 자리 — 예: 'jkinds')
  attr:string;   // 칸마다 붙일 data- 이름(옛 DOM 그대로 — 길찾기 종류 'k' · 날짜 'd')
  items:SegmentItem<Id>[];
  onPick:(id:Id) => void;
}

export function Segmented<Id extends string>({ label, class:extra, attr, items, onPick }:SegmentedProps<Id>) {
  return <div class={extra ? `segmented ${extra}` : 'segmented'} role="group" aria-label={label}>{items.map(item => {
    const data:Record<string, string> = { [`data-${attr}`]: item.id };
    return <button type="button" {...data} aria-pressed={item.pressed} onClick={() => onPick(item.id)}>{item.name}{item.count !== undefined && <b>{item.count}</b>}</button>;
  })}</div>;
}
