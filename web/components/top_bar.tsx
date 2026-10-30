// 상단 막대: 로고 · 실시간 상태 글자(화면에서는 숨김) · 확대 표시 · 새로고침 · 메뉴 단추.
// 스토리에서만 쓴다 — 첫 화면에 바로 보여야 해서 화면은 index.html 의 정적 HTML 이고, 글자 · 단추 동작은 본체가 id 로 찾아 건다(JS 로 그리면 그만큼 늦게 뜬다).
// index.html 의 .mast 를 고치면 여기도 같이 고친다(단추 글자가 같은지 tests/static_shell.test.mjs 가 본다).

export type LiveStateKind = 'idle' | 'loading' | 'ok' | 'error';
export interface TopBarProps { zoom?:string; liveKind?:LiveStateKind; liveText?:string; liveHidden?:boolean }

export const TopBar = ({ zoom = 'z–', liveKind = 'loading', liveText = '실시간 열차 불러오는 중', liveHidden = true }:TopBarProps) =>
  <header class="mast"><div class="identity"><img class="brand-icon" src="./brand/syung-dark.svg" alt="" width="38" height="38" /><div class="brand-line"><h1>ㅅ슈슝~</h1><p>어디쯤이슝?</p></div></div><div id="liveState" class="source-state" data-state={liveKind} hidden={liveHidden}><i></i><span>{liveText}</span></div><span id="zoomBadge" class="zoom-badge" aria-label="지도 줌">{zoom}</span><button id="refreshButton" class="settings-button refresh-button" type="button" aria-label="새로고침"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg></button><button id="settingsButton" class="settings-button" type="button" aria-label="설정 메뉴" aria-expanded="false" aria-controls="settingsPanel" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></header>;
