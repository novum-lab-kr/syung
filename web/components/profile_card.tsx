// 내 정보 부품: 프로필 줄(큰 사진 · 이름 · 로그인 방법). props 만 받는다 — 사진 고르기 · 저장은 화면(user/account_view.tsx)에 남는다
const BADGE = <svg class="pf-badge" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>;

export interface ProfileCardProps {
  name:string; provider:string;
  look:{ photo:boolean; image:string } | null;   // 칸 그림(올린 사진이면 photo) · 아직 모르면 null(CSS 의 기본 새싹)
  onEdit?:() => void;
}

export function ProfileCard({ name, provider, look, onEdit }:ProfileCardProps) {
  return <div class="account-prof"><button id="accountAvatarBig" class={`account-avatar big ${look?.photo ? 'photo' : 'face'}`} type="button" aria-label="프로필 수정" aria-haspopup="dialog"
    style={look ? { backgroundImage: look.image } : undefined} onClick={() => onEdit?.()}>{BADGE}</button>
    <div class="pf-who"><div class="pf-name"><b id="accountName">{name}</b></div>
      <small id="accountProvider">{provider}</small></div></div>;
}
