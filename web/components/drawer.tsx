// 틀: 설정 서랍의 머리줄(뒤로 · 제목 · 닫기) · 목록 줄 · 스위치 줄. 겉모양만 그린다.
// 서랍 열기 · 닫기 · 쪽 넘기기 · Tab 가두기는 화면(본체 · user/account.mts)에 남는다. 머리줄 · 목록 줄은 화면이 한 번만 그리고 그쪽이 id · data-menu-page 로 찾아 건다.
import type { ComponentChildren } from 'preact';

const BACK = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>;
const CLOSE = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>;
const CHEVRON = <svg class="menu-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>;

export const DrawerHead = ({ title, back = false }:{ title:string; back?:boolean }) => <>
  <button id="menuBack" class="menu-back" type="button" aria-label="메뉴로 돌아가기" hidden={!back}>{BACK}</button>
  <h2 id="settingsTitle">{title}</h2>
  <button id="settingsClose" class="menu-close" type="button" aria-label="메뉴 닫기">{CLOSE}</button>
</>;

export interface MenuItemProps { page:string; icon:ComponentChildren; name?:string; id?:string; nameId?:string; hidden?:boolean; disabled?:boolean }

// 목록 줄: 누르면 그 쪽(page — .menu-page 의 id)으로. icon 은 왼쪽 그림(.setting-icon · 프로필 사진)
export const MenuItem = ({ page, icon, name, id, nameId, hidden, disabled }:MenuItemProps) => <button id={id} class="menu-item" type="button" data-menu-page={page} aria-controls={page} hidden={hidden} disabled={disabled}>
  {icon}<span id={nameId} class="setting-name">{name}</span>{CHEVRON}
</button>;

export interface SettingSwitchProps {
  id:string; name:string; note:string; icon:ComponentChildren; pressed:boolean; disabled?:boolean;
  nameId?:string; noteId?:string; describedBy?:string; controls?:string;   // 도시 모드 줄처럼 이름 · 설명을 따로 읽어 줄 때
  onClick?:() => void;
}

export function SettingSwitch({ id, name, note, icon, pressed, disabled, nameId, noteId, describedBy, controls, onClick }:SettingSwitchProps) {
  return <button id={id} class="setting-switch" type="button" aria-pressed={pressed ? 'true' : 'false'} aria-labelledby={nameId} aria-describedby={describedBy} aria-controls={controls} disabled={disabled} onClick={() => onClick?.()}>
    {icon}
    <span class="setting-name">{nameId ? <span id={nameId}>{name}</span> : name}<small id={noteId}>{note}</small></span>
    <i class="switch" aria-hidden="true"></i>
  </button>;
}
