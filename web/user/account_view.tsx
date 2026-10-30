// 설정 서랍 '내 정보' 쪽(#menuAccount)의 속 — 프로필 큰 칸 · 프로필 수정(레이어 팝업 #profileSheet — 사진/캐릭터 고르기 + 닉네임을 한 화면에서) · 내 통계 · 계정(로그인한 기기 · 내려받기) · 로그아웃 · 탈퇴 확인.
// 받기 · 바꾸기 · 알림(토스트)은 user/account.mts 그대로 — 이 파일은 그리기와 누름 전달만. 상태는 옛 DOM 이 들고 있던 그대로이고
// account.mts 가 옛 DOM 을 고치던 자리에서 accountView.set(...) 으로 바꾼다. 바뀔 때마다 바로(같은 작업 안에서) 다시 그린다.
// 표시(DOM 모양 · class · id · 문구 · aria)는 옛 index.html · 옛 innerHTML 과 같다(옛 코드가 한 덩어리로 넣던 글자는 템플릿 하나로 — 글자 노드가 갈리면 커닝이 달라진다).
// 겉모양 부품은 components/(내 정보 틀 · 기기 목록 · 프로필 줄 · 프로필 수정 · 통계 · 레이어 팝업 · 로그인 팝업) — 여기는 상태를 값으로 풀어 넘긴다. 토스트는 그대로.
import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { AccountPage as AccountPageView, DeviceList } from '../components/account_page.tsx';
import type { Session } from '../components/account_page.tsx';
import { LayerSheet } from '../components/layer_sheet.tsx';
import { LoginSheetBody, SocialButtons } from '../components/login_sheet.tsx';
import { ProfileCard } from '../components/profile_card.tsx';
import { CHARACTERS, ProfileForm as ProfileFormView, ProfileSheetBody } from '../components/profile_form.tsx';
import { StatsPanel } from '../components/stats_panel.tsx';
import type { Stats } from '../components/stats_panel.tsx';

export interface Avatar { type:string; url?:string; id?:string }
export interface Me { name:string; provider:string; avatar?:Avatar | null }
export type { Session, Stats };

const PHOTO_URL = /^\/api\/me\/avatar\/[\w-]{32}\.(?:webp|jpg)$/;   // 서버가 주는 내 사진 주소 모양(그 밖은 그리지 않는다)
export const NAME_MAX = 12;
const PROVIDER_NAMES:Record<string, string> = { kakao: '카카오', google: '구글', apple: 'Apple' };
export const nameLength = (text:string) => [...text.trim()].length;

// 프로필 칸 그림: 올린 사진이면 칸을 꽉 채우고(photo), 아니면 캐릭터 얼굴(face). big: 큰 칸(240 그림)
export function avatarLook(avatar:Avatar | null | undefined, big = false):{ photo:boolean; image:string } {
  const photo = avatar?.type === 'photo' && PHOTO_URL.test(avatar.url!);
  const id = avatar?.type === 'character' && CHARACTERS.some(([key]) => key === avatar.id) ? avatar.id! : 'sprout';
  // 기본 새싹 · 작은 칸은 CSS 의 image-set(28 · 56 · 84) 그대로
  let image = '';
  if (photo) image = `url("${avatar!.url}")`;
  else if (big || id !== 'sprout') image = `url("./brand/faces/${id}-${big ? 240 : 84}.png")`;
  return { photo, image };
}
// 지금 고른 프로필: 사진 · 캐릭터 이름 · 기본 새싹
export const currentChoice = (avatar:Avatar | null | undefined) => {
  if (avatar?.type === 'photo') return 'photo';
  return avatar?.type === 'character' ? avatar.id : 'sprout';
};

// 프로필 수정에서 고르는 중인 사진: keep(그대로) · photo(새로 올릴 사진 — preview 는 미리보기 주소) · character(캐릭터 id)
export interface Draft { kind:'keep' | 'photo' | 'character'; id?:string; preview?:string }
interface Handlers {
  edit():void; cancel():void; save():void; pickPhoto():void; photoFile(file:File | undefined):void; pickCharacter(id:string):void;
  logoutDevice(id:string):void; logoutOthers():void; exportData():void; logout():void; deleteAsk():void; deleteNo():void; deleteYes():void;
}
interface View {
  me:Me | null; marked:boolean;   // marked: 고르기 칸의 눌림을 한 번이라도 그렸나(옛 markChoice — 처음엔 aria-pressed 없음)
  draft:Draft; converting:boolean;   // converting: 고른 사진을 줄이는 중(그동안 저장 막음)
  facesLoaded:boolean; saving:boolean; nameValue:string;   // facesLoaded: 수정을 처음 열 때 캐릭터 얼굴을 받기 시작(그 뒤 그대로)
  statsShown:boolean; stats:Stats | null; statsTurn:number;   // turn: 받을 때마다 늘려 칸을 새로 만든다(옛 innerHTML 바꾸기)
  safeShown:boolean; sessions:Session[] | null; safeTurn:number; outBusy:string[];
  confirmOpen:boolean;
}
let view:View = {
  me: null, marked: false, draft: { kind: 'keep' }, converting: false, facesLoaded: false, saving: false, nameValue: '',
  statsShown: false, stats: null, statsTurn: 0, safeShown: false, sessions: null, safeTurn: 0, outBusy: [], confirmOpen: false,
};
let handlers:Handlers | null = null;
const call = <K extends keyof Handlers>(key:K) => (...args:Parameters<Handlers[K]>) => (handlers?.[key] as (...a:Parameters<Handlers[K]>) => void)?.(...args);


// 수정 중 고른 것(draft)을 지금 프로필에 겹친 그림 · 눌림
function draftLook(me:Me | null, draft:Draft) {
  if (draft.kind === 'photo') return { photo: true, small: `url("${draft.preview}")`, choice: 'photo' };
  if (draft.kind === 'character') return { photo: false, small: '', choice: draft.id! };
  const big = avatarLook(me?.avatar, true), small = avatarLook(me?.avatar);
  return { photo: big.photo, small: small.photo ? small.image : '', choice: currentChoice(me?.avatar)! };
}

// 서랍 안 내 정보 쪽의 프로필 줄(보기만 — 고치기는 레이어 팝업 #profileSheet 에서)
function Profile() {
  const { me } = view;
  return <ProfileCard name={me?.name ?? ''} provider={me ? PROVIDER_NAMES[me.provider] || me.provider : ''} look={me ? avatarLook(me.avatar, true) : null} onEdit={call('edit')} />;
}

// 레이어 팝업(#profileSheet) 안: 닉네임 → 사진 · 캐릭터 고르기 → 취소 · 저장 — 껍데기(떠오르기 · 닫기 · 초점)는 account.mts
function ProfileForm() {
  const count = nameLength(view.nameValue), look = draftLook(view.me, view.draft);
  return <ProfileFormView name={view.nameValue} count={`${count}/${NAME_MAX}`} over={count > NAME_MAX} photoImage={look.small} choice={look.choice} marked={view.marked} facesLoaded={view.facesLoaded} saving={view.saving} converting={view.converting}
    onName={nameValue => set({ nameValue })} onSave={call('save')} onCancel={call('cancel')} onPickPhoto={call('pickPhoto')} onPhotoFile={call('photoFile')} onPickCharacter={call('pickCharacter')} />;
}

function AccountPage():ComponentChildren {
  return <AccountPageView profile={<Profile />} statsShown={view.statsShown} stats={view.stats && <StatsPanel key={view.statsTurn} stats={view.stats} />}
    safeShown={view.safeShown} safe={view.sessions && <DeviceList key={view.safeTurn} sessions={view.sessions} busy={view.outBusy} onLogoutDevice={id => call('logoutDevice')(id)} onLogoutOthers={call('logoutOthers')} onExport={call('exportData')} />}
    confirmOpen={view.confirmOpen} onLogout={call('logout')} onDeleteAsk={call('deleteAsk')} onDeleteNo={call('deleteNo')} onDeleteYes={call('deleteYes')} />;
}

// 두 팝업의 속을 한 번 그린다(열기 · 닫기는 account.mts 가 찾아 건다 — 아래 #profileBody 는 그 안에 생기니 이 뒤에 찾는다)
const loginRoot = document.getElementById('loginSheet'), profileRoot = document.getElementById('profileSheet');
if (loginRoot) render(<LayerSheet labelledBy="loginTitle"><LoginSheetBody /></LayerSheet>, loginRoot);
if (profileRoot) render(<LayerSheet label="프로필 수정"><ProfileSheetBody /></LayerSheet>, profileRoot);
// 받은 로그인 방법으로 단추를 그린다
export function drawProviders(providers:string[]) { const box = document.getElementById('accountProviders'); if (box) render(<SocialButtons providers={providers} />, box); }

const root = document.getElementById('menuAccount'), formRoot = document.getElementById('profileBody');
function set(patch:Partial<View>) { view = { ...view, ...patch }; if (root) render(<AccountPage />, root); if (formRoot) render(<ProfileForm />, formRoot) }

// account.mts 의 창구: 상태 바꾸기 · 지금 상태 읽기 · 누름 받을 함수 걸기
export const accountView = {
  set, get state():Readonly<View> { return view },
  on(next:Handlers) { handlers = next },
};

// HTML 의 옛 속(같은 모양)을 비우고 그 자리에 그린다
if (root) { root.textContent = ''; set({}) }
