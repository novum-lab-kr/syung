// 저장 단추(발권하기 · 이 경로로 — 노란 큰 단추 .tf-save). props 만 받아 그린다. 폼을 보내는 단추라 button.tsx 와 달리 진짜 disabled 를 쓴다(옛 화면 그대로)
import type { ComponentChildren } from 'preact';

export interface SaveButtonProps { id:string; type?:'button' | 'submit'; disabled?:boolean; onClick?:() => void; children:ComponentChildren }

export function SaveButton({ id, type = 'button', disabled, onClick, children }:SaveButtonProps) {
  return <button id={id} class="tf-save" type={type} disabled={disabled} onClick={onClick}>{children}</button>;
}
