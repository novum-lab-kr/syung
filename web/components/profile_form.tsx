// 내 정보 부품: 프로필 수정 팝업의 속 — 닉네임 → 사진 · 캐릭터 고르기 → 취소 · 저장, 그리고 팝업의 닫기 칸(ProfileSheetBody).
// props 만 받는다: 고르는 중인 상태 · 저장은 화면(user/account_view.tsx · account.mts)에 남는다.
import { TextField } from './text_field.tsx';

// 프로필 캐릭터(내 위치 캐릭터 — web/map/avatars/). 첫째(새싹)가 기본
export const CHARACTERS = [['sprout', '새싹 볼빵 후디'], ['builder', '꼬마 건설 반장'], ['seonbi', '갓 쓴 꼬마 선비'], ['visitor', '두근두근 나들이'],
  ['scv', '테란 SCV'], ['drone', '저그 드론'], ['probe', '프로토스 프로브']] as const;

const CAMERA = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>;
const CLOSE = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>;

// 팝업 카드의 속: 닫기 · 폼이 들어갈 칸 · 알림 칸(폼은 화면이 #profileBody 에 따로 그린다)
export const ProfileSheetBody = () => <>
  <button id="profileClose" class="profile-x" type="button" aria-label="닫기">{CLOSE}</button>
  <div id="profileBody" class="profile-body"></div>
  <p id="profileMsg" class="login-msg" role="status" aria-live="polite"></p>
</>;

export interface ProfileFormProps {
  name:string; count:string; over:boolean;   // 닉네임 · 글자 수 표시 · 넘침
  photoImage:string; choice:string; marked:boolean;   // photoImage: 사진 칸 그림(없으면 '') · choice: 고른 것(photo · 캐릭터 id) · marked: 눌림을 보일까(처음엔 aria-pressed 없음)
  facesLoaded:boolean; saving:boolean; converting:boolean;   // facesLoaded: 캐릭터 얼굴을 받기 시작 · converting: 고른 사진을 줄이는 중(그동안 저장 막음)
  onName?:(value:string) => void; onSave?:() => void; onCancel?:() => void; onPickPhoto?:() => void; onPhotoFile?:(file:File | undefined) => void; onPickCharacter?:(id:string) => void;
}

const pressed = (marked:boolean, on:boolean) => { if (!marked) return undefined; return on ? 'true' : 'false'; };

export function ProfileForm({ name, count, over, photoImage, choice, marked, facesLoaded, saving, converting, onName, onSave, onCancel, onPickPhoto, onPhotoFile, onPickCharacter }:ProfileFormProps) {
  const lock = saving || converting;
  return <form id="profileForm" class="pf-form" onSubmit={event => { event.preventDefault(); onSave?.(); }}>
    <TextField id="nameInput" class="pf-in" label="닉네임" maxLength={40} autocomplete="nickname" value={name} disabled={saving} count={count} countId="nameCount" over={over} onInput={onName} />
    <div id="avatarPick" class="pf-pick"><p class="pf-l">사진 · 캐릭터</p>
      <div id="avatarChoices" class="pf-choices" role="group" aria-label="프로필 사진 고르기">
        <button id="photoPick" class={photoImage ? 'pf-choice pf-photo photo' : 'pf-choice pf-photo'} type="button" aria-label="사진 올리기" aria-pressed={pressed(marked, choice === 'photo')}
          style={photoImage ? { backgroundImage: photoImage } : undefined} disabled={lock} onClick={() => onPickPhoto?.()}>{CAMERA}<span>사진</span></button>
        {CHARACTERS.map(([id, label]) => <button type="button" class="pf-choice" data-character={id} aria-label={label} title={label} aria-pressed={pressed(marked, id === choice)}
          style={facesLoaded ? { backgroundImage: `url("./brand/faces/${id}-240.png")` } : undefined} disabled={saving} onClick={() => onPickCharacter?.(id)}></button>)}
      </div>
      <input id="photoFile" type="file" accept="image/*" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; onPhotoFile?.(file); }} />
      <p class="pf-note">가운데를 정사각형으로 잘라 올려요. 위치 같은 사진 정보는 빼요.</p>
    </div>
    <div class="pf-row"><button id="profileCancel" type="button" disabled={saving} onClick={() => onCancel?.()}>취소</button><button id="profileSave" type="submit" class="pf-ok" disabled={lock}>{converting ? '사진 준비 중' : '저장'}</button></div>
  </form>;
}
