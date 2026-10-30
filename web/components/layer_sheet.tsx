// 틀: 화면 위에 뜨는 레이어 팝업의 속 — 가림막 · 카드(휴대폰은 아래에서, 넓은 화면은 가운데) · 손잡이. 로그인 팝업 · 프로필 수정 팝업이 같이 쓴다.
// 바깥 칸(.login-sheet)과 떠오르기 · 닫기 · 초점은 화면(user/account.mts)에 남는다. 화면은 한 번만 그리고 그쪽이 찾아 건다.
import type { ComponentChildren } from 'preact';

export const LayerSheet = ({ label, labelledBy, children }:{ label?:string; labelledBy?:string; children?:ComponentChildren }) => <>
  <div class="login-scrim"></div>
  <div class="login-card" role="dialog" aria-modal="true" aria-label={label} aria-labelledby={labelledBy}><div class="login-grab"></div>{children}</div>
</>;
