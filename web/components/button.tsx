// 기초 컴포넌트: 버튼(주 · 보조 · 글자 · 아이콘). props 만 받아 그린다(전역 상태 없음).
// 누름 효과 · 키보드 포커스 · 비활성은 components.css 의 .sy-btn 한 곳에서(#122 · #126 규칙 — 굵은 전역 포커스 테두리 대신 눌림 효과, Tab 일 때만 얇은 표시).
// 비활성은 disabled 대신 aria-disabled: disabled 단추는 누름이 부모(카드)로 새어 나갈 수 있어서(승차권 뒷면 '지도에서 보기'와 같은 방식). 비활성이면 onClick 을 부르지 않는다.
import type { ComponentChildren } from 'preact';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'icon';

export interface ButtonProps {
  variant?:ButtonVariant;
  class?:string;   // 덧붙일 class(놓인 자리 · 색 묶음 — 예: 'on-ticket' 은 승차권 종이 색)
  type?:'button' | 'submit';
  disabled?:boolean;
  loading?:ComponentChildren;   // 불러오는 중이면 이 글자를 보이고 비활성
  label?:string;   // aria-label(아이콘 단추는 꼭)
  expanded?:boolean;   // 펼치는 단추면 aria-expanded
  onClick?:(event:MouseEvent) => void;
  children?:ComponentChildren;
}

export function Button({ variant = 'primary', class:extra, type = 'button', disabled = false, loading, label, expanded, onClick, children }:ButtonProps) {
  const busy = loading !== undefined && loading !== null && loading !== false, off = disabled || busy;
  const classes = ['sy-btn', `sy-btn-${variant}`, extra].filter(Boolean).join(' ');
  return <button type={type} class={classes} aria-label={label} aria-expanded={expanded === undefined ? undefined : expanded ? 'true' : 'false'} aria-disabled={off ? 'true' : undefined}
    onClick={event => { if (!off) onClick?.(event); }}>{busy ? loading : children}</button>;
}
