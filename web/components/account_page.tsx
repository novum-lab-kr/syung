// 내 정보 쪽 틀: 프로필 · 내 통계 · 계정(로그인한 기기 · 내려받기) · 아래 줄(개인정보처리방침 · 로그아웃 · 탈퇴) · 탈퇴 확인. props 만 받아 그린다.
// 받기 · 바꾸기 · 알림은 화면(user/account.mts · account_view.tsx). DOM · class · id · 문구 · aria 는 옛 화면 그대로 — 스타일은 syung.css.
import type { ComponentChildren } from 'preact';

export interface Session { id:string; device:string; current?:boolean; lastUsedAt:number; createdAt:number }
const monthDay = (seconds:number) => { const date = new Date(seconds * 1000); return `${date.getMonth() + 1}월 ${date.getDate()}일` };

export interface DeviceListProps {
  sessions:Session[]; busy:string[];   // busy: 로그아웃을 보내는 중인 기기(단추 막음)
  onLogoutDevice?:(id:string) => void; onLogoutOthers?:() => void; onExport?:() => void;
}
// 로그인한 기기 목록 · 다른 기기 모두 로그아웃 · 내 데이터 내려받기
export function DeviceList({ sessions, busy, onLogoutDevice, onLogoutOthers, onExport }:DeviceListProps) {
  return <>
    <p class="acct-sub">{`로그인한 기기 ${sessions.length}대`}</p>
    <ul class="dv-list">{sessions.map(item => <li data-session={item.id}><span class="dv-name">{item.device}{item.current && <em>이 기기</em>}</span>
      <small>{`마지막 사용 ${monthDay(item.lastUsedAt)} · 로그인 ${monthDay(item.createdAt)}`}</small>
      {!item.current && <button type="button" class="dv-out" disabled={busy.includes(item.id)} onClick={() => onLogoutDevice?.(item.id)}>로그아웃</button>}</li>)}</ul>
    <div class="dv-actions">{sessions.length > 1 && <button type="button" id="deviceOthers" onClick={() => onLogoutOthers?.()}>다른 기기 모두 로그아웃</button>}
      <button type="button" id="dataExport" onClick={() => onExport?.()}>내 데이터 내려받기</button></div>
    <p class="st-note">내려받기: 회원 정보 · 로그인 기기 · 승차권 · 날짜별 사용 횟수를 JSON 파일 하나로 받아요.</p>
  </>;
}

export interface AccountPageProps {
  profile:ComponentChildren;   // 프로필 줄
  statsShown:boolean; stats?:ComponentChildren;   // 통계 칸 · 받기 전엔 비어 있다
  safeShown:boolean; safe?:ComponentChildren;   // 기기 목록 칸 · 받기 전엔 비어 있다
  confirmOpen:boolean;
  onLogout?:() => void; onDeleteAsk?:() => void; onDeleteNo?:() => void; onDeleteYes?:() => void;
}
export function AccountPage({ profile, statsShown, stats, safeShown, safe, confirmOpen, onLogout, onDeleteAsk, onDeleteNo, onDeleteYes }:AccountPageProps) {
  return <>
    {profile}
    <section id="accountStats" class="acct-sec" aria-labelledby="accountStatsTitle" hidden={!statsShown}><h4 id="accountStatsTitle" class="pf-l">내 통계</h4>
      <div id="accountStatsBody" aria-live="polite">{stats}</div></section>
    <section id="accountSafe" class="acct-sec" aria-labelledby="accountSafeTitle" hidden={!safeShown}><h4 id="accountSafeTitle" class="pf-l">계정</h4>
      <div id="accountSafeBody">{safe}</div></section>
    <div class="account-foot"><a href="./privacy.html" target="_blank" rel="noopener">개인정보처리방침</a><button id="accountLogout" type="button" onClick={() => onLogout?.()}>로그아웃</button>
      <button id="accountDelete" type="button" class="account-delete" onClick={() => onDeleteAsk?.()}>탈퇴</button></div>
    <div id="accountConfirm" class="account-confirm" hidden={!confirmOpen}><p>탈퇴하면 승차권까지 모두 지워져요</p>
      <div><button id="accountConfirmNo" type="button" onClick={() => onDeleteNo?.()}>취소</button><button id="accountConfirmYes" type="button" class="danger" onClick={() => onDeleteYes?.()}>탈퇴</button></div></div>
  </>;
}
