// 스토리 전용(운영에서 부르지 않는다): 휴대폰 크기 무대 위에 서랍을 연 모양. 머리줄은 진짜 부품, 몸통은 children
import type { ComponentChildren } from 'preact';
import { DrawerHead } from './drawer.tsx';

export const DrawerStage = ({ title = '메뉴', back = false, children }:{ title?:string; back?:boolean; children?:ComponentChildren }) =>
  <div class="sb-stage"><div class="settings-panel open sb-drawer" role="dialog" aria-label={title}><div class="menu-head"><DrawerHead title={title} back={back} /></div><div class="menu-body">{children}</div></div></div>;
