// 기초 컴포넌트: 세그먼트 탭(길찾기 종류 탭 · 오늘/내일 · 승차권 경로 종류 — .segmented). 고른 칸은 aria-pressed.
// 지금 화면과 같은 DOM(div role=group > button[data-<attr>] · 개수는 <b>)을 그려 syung.css 를 그대로 쓴다
import type { ComponentChildren } from 'preact';

export interface SegmentItem { id:string; name:ComponentChildren; count?:number; pressed:boolean }

export interface SegmentedProps {
  label:string;   // aria-label(무엇을 고르는 탭인지)
  class?:string;   // 덧붙일 class(놓인 자리 — 예: 'jkinds')
  attr:string;   // 칸마다 붙일 data- 이름(옛 DOM 그대로 — 길찾기 종류 'k' · 날짜 'd')
  items:SegmentItem[];
  onPick:(id:string) => void;
}

export function Segmented({ label, class:extra, attr, items, onPick }:SegmentedProps) {
  return <div class={extra ? `segmented ${extra}` : 'segmented'} role="group" aria-label={label}>{items.map(item => {
    const data:Record<string, string> = { [`data-${attr}`]: item.id };
    return <button type="button" {...data} aria-pressed={item.pressed} onClick={() => onPick(item.id)}>{item.name}{item.count !== undefined && <b>{item.count}</b>}</button>;
  })}</div>;
}
