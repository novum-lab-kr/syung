// 기초 컴포넌트: 칩 — 노선(단계 목록의 노선 · 버스 번호 칩 .js-chip) · 태그(경로 카드의 '최소 시간' 같은 꼬리표 .jp-tag).
// 지금 화면과 같은 class 를 그려 syung.css 의 모양을 그대로 쓴다. props 만 받아 그린다
import type { ComponentChildren } from 'preact';

export type ChipProps =
  // 노선: 바탕 · 글자 색(--c · --t). 색을 안 주면 감싼 줄(단계 목록의 승차 줄)의 색을 받는다
  | { kind:'line'; color?:string; ink?:string; icon?:ComponentChildren; children:ComponentChildren }
  | { kind:'tag'; children:ComponentChildren };

export function Chip(props:ChipProps) {
  if (props.kind === 'tag') return <span class="jp-tag">{props.children}</span>;
  const style = props.color === undefined ? undefined : `--c:${props.color};--t:${props.ink ?? '#fff'}`;
  return <span class="js-chip" style={style}>{props.icon}{props.children}</span>;
}
