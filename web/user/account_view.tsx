// 설정 서랍 '내 정보' 쪽(#menuAccount)의 속 — 프로필 큰 칸 · 프로필 수정(사진/캐릭터 고르기 + 닉네임을 한 화면에서) · 내 통계 · 계정(로그인한 기기 · 내려받기) · 로그아웃 · 탈퇴 확인.
// 받기 · 바꾸기 · 알림(토스트)은 user/account.mts 그대로 — 이 파일은 그리기와 누름 전달만. 상태는 옛 DOM 이 들고 있던 그대로이고
// account.mts 가 옛 DOM 을 고치던 자리에서 accountView.set(...) 으로 바꾼다. 바뀔 때마다 바로(같은 작업 안에서) 다시 그린다.
// 표시(DOM 모양 · class · id · 문구 · aria)는 옛 index.html · 옛 innerHTML 과 같다(옛 코드가 한 덩어리로 넣던 글자는 템플릿 하나로 — 글자 노드가 갈리면 커닝이 달라진다).
// 서랍 껍데기 · 목록 줄 · 로그인 팝업 · 토스트는 그대로(D-W29 ②).
import { render } from 'preact';
import type { ComponentChildren } from 'preact';

export interface Avatar { type:string; url?:string; id?:string }
export interface Me { name:string; provider:string; avatar?:Avatar | null }
export interface Stats {
  daysTogether:number; tickets:number; weeklyRides:number; recent:{ days:number; openDays:number; route:number; ticket:number };
  daily:{ day:string; open:number; route:number; ticket:number }[];
  fare:{ month:string; total:number; skipped:number; reasons:Record<string, number>; tickets:{ name:string; fare:number; rides:number; monthly:number }[] };
}
export interface Session { id:string; device:string; current?:boolean; lastUsedAt:number; createdAt:number }

// 프로필 캐릭터(내 위치 캐릭터 — web/map/avatars/). 첫째(새싹)가 기본
export const CHARACTERS = [['sprout', '새싹 볼빵 후디'], ['builder', '꼬마 건설 반장'], ['seonbi', '갓 쓴 꼬마 선비'], ['visitor', '두근두근 나들이'],
  ['scv', '테란 SCV'], ['drone', '저그 드론'], ['probe', '프로토스 프로브']] as const;
const PHOTO_URL = /^\/api\/me\/avatar\/[\w-]{32}\.(?:webp|jpg)$/;   // 서버가 주는 내 사진 주소 모양(그 밖은 그리지 않는다)
export const NAME_MAX = 12;
const PROVIDER_NAMES:Record<string, string> = { kakao: '카카오', google: '구글', apple: 'Apple' };
const FARE_REASONS:Record<string, string> = { route: '고른 경로가 없는 승차권', distance: '공식 거리 자료가 없는 노선', outside: '수도권 밖 구간',
  extra: '추가 운임 노선(신분당선 · 의정부경전철 · 공항철도 영종 구간)', bus: '요금 · 거리 자료가 없는 버스', none: '전철 · 버스를 타지 않는 승차권' };
export const nameLength = (text:string) => [...text.trim()].length;
const won = (count:number) => `${count.toLocaleString('ko-KR')}원`;
const monthDay = (seconds:number) => { const date = new Date(seconds * 1000); return `${date.getMonth() + 1}월 ${date.getDate()}일` };

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
  editOpen:boolean; draft:Draft; facesLoaded:boolean; saving:boolean; nameValue:string;   // facesLoaded: 수정을 처음 열 때 캐릭터 얼굴을 받기 시작(그 뒤 그대로)
  statsShown:boolean; stats:Stats | null; statsTurn:number;   // turn: 받을 때마다 늘려 칸을 새로 만든다(옛 innerHTML 바꾸기)
  safeShown:boolean; sessions:Session[] | null; safeTurn:number; outBusy:string[];
  confirmOpen:boolean;
}
let view:View = {
  me: null, marked: false, editOpen: false, draft: { kind: 'keep' }, facesLoaded: false, saving: false, nameValue: '',
  statsShown: false, stats: null, statsTurn: 0, safeShown: false, sessions: null, safeTurn: 0, outBusy: [], confirmOpen: false,
};
let handlers:Handlers | null = null;
const call = <K extends keyof Handlers>(key:K) => (...args:Parameters<Handlers[K]>) => (handlers?.[key] as (...a:Parameters<Handlers[K]>) => void)?.(...args);

// 누른 단추가 다시 그리면서 사라지는 자리(수정 열기 · 취소): 서랍의 '바깥을 누르면 닫기'가 사라진 단추를 바깥으로 읽지 않게 여기서 전파를 끊는다
const stay = (key:'edit' | 'cancel') => (event:Event) => { event.stopPropagation(); call(key)() };

const BADGE = <svg class="pf-badge" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>;
const CAMERA = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>;

// 수정 중 고른 것(draft)을 지금 프로필에 겹친 그림 · 눌림
function draftLook(me:Me | null, draft:Draft) {
  if (draft.kind === 'photo') return { photo: true, big: `url("${draft.preview}")`, small: `url("${draft.preview}")`, choice: 'photo' };
  if (draft.kind === 'character') return { photo: false, big: `url("./brand/faces/${draft.id}-240.png")`, small: '', choice: draft.id! };
  const big = avatarLook(me?.avatar, true), small = avatarLook(me?.avatar);
  return { photo: big.photo, big: big.image, small: small.photo ? small.image : '', choice: currentChoice(me?.avatar)! };
}

function Profile() {
  const { me, editOpen } = view, count = nameLength(view.nameValue);
  if (!editOpen) {
    const big = avatarLook(me?.avatar, true);
    return <div class="account-prof"><button id="accountAvatarBig" class={`account-avatar big ${me && big.photo ? 'photo' : 'face'}`} type="button" aria-label="프로필 수정"
      style={me ? { backgroundImage: big.image } : undefined} onClick={stay('edit')}>{BADGE}</button>
      <div class="pf-who"><div class="pf-name"><b id="accountName">{me?.name ?? ''}</b><button id="profileEdit" class="pf-link" type="button" onClick={stay('edit')}>프로필 수정</button></div>
        <small id="accountProvider">{me ? PROVIDER_NAMES[me.provider] || me.provider : ''}</small></div></div>;
  }
  const look = draftLook(me, view.draft);
  return <>
    <div class="account-prof"><span id="accountAvatarBig" class={`account-avatar big pf-static ${look.photo ? 'photo' : 'face'}`} style={{ backgroundImage: look.big }}></span>
      <div class="pf-who"><div class="pf-name"><b>프로필 수정</b></div><small id="accountProvider">{me ? PROVIDER_NAMES[me.provider] || me.provider : ''}</small></div></div>
    <form id="profileForm" class="pf-form" onSubmit={event => { event.preventDefault(); call('save')() }}>
      <div id="avatarPick" class="pf-pick"><p class="pf-l">사진 · 캐릭터</p>
        <div id="avatarChoices" class="pf-choices" role="group" aria-label="프로필 사진 고르기">
          <button id="photoPick" class={look.small ? 'pf-choice pf-photo photo' : 'pf-choice pf-photo'} type="button" aria-label="사진 올리기" aria-pressed={view.marked ? String(look.choice === 'photo') as 'true' | 'false' : undefined}
            style={look.small ? { backgroundImage: look.small } : undefined} disabled={view.saving} onClick={call('pickPhoto')}>{CAMERA}<span>사진</span></button>
          {CHARACTERS.map(([id, label]) => <button type="button" class="pf-choice" data-character={id} aria-label={label} title={label} aria-pressed={view.marked ? String(id === look.choice) as 'true' | 'false' : undefined}
            style={view.facesLoaded ? { backgroundImage: `url("./brand/faces/${id}-240.png")` } : undefined} disabled={view.saving} onClick={() => call('pickCharacter')(id)}></button>)}
        </div>
        <input id="photoFile" type="file" accept="image/*" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; call('photoFile')(file) }} />
        <p class="pf-note">가운데를 정사각형으로 잘라 올려요. 위치 같은 사진 정보는 빼요.</p>
      </div>
      <label class="tf-in pf-in"><input id="nameInput" maxlength={40} autocomplete="nickname" enterkeyhint="done" aria-label="닉네임" aria-describedby="nameCount" value={view.nameValue}
        onInput={event => set({ nameValue: event.currentTarget.value })} /><small id="nameCount" class={count > NAME_MAX ? 'over' : undefined}>{`${count}/${NAME_MAX}`}</small></label>
      <div class="pf-row"><button id="profileCancel" type="button" disabled={view.saving} onClick={stay('cancel')}>취소</button><button id="profileSave" type="submit" class="pf-ok" disabled={view.saving}>저장</button></div>
    </form>
  </>;
}

const Cell = ({ value, label }:{ value:string; label:string }) => <div class="st-cell"><b>{value}</b><small>{label}</small></div>;
function StatsBody({ stats }:{ stats:Stats }) {
  const most = Math.max(1, ...stats.daily.map(day => day.open + day.route + day.ticket)), fare = stats.fare, [, month] = fare.month.split('-').map(Number);
  const why = Object.entries(fare.reasons).map(([key, count]) => `${FARE_REASONS[key] || key} ${count}장`).join(' · ');
  return <>
    <div class="st-grid"><Cell value={`${stats.daysTogether}일`} label="함께한 날" /><Cell value={`${stats.tickets}장`} label="승차권" />
      <Cell value={`${stats.recent.openDays}일`} label={`최근 ${stats.recent.days}일 슝 연 날`} /><Cell value={`${stats.recent.route}번`} label={`최근 ${stats.recent.days}일 길찾기`} /></div>
    <div class="st-bars" role="img" aria-label={`최근 ${stats.recent.days}일 날짜별 사용 횟수`}>{stats.daily.map(day => {
      const count = day.open + day.route + day.ticket, [, dayMonth, date] = day.day.split('-').map(Number);
      return <i style={`height:${count ? Math.max(8, Math.round(count / most * 100)) : 0}%`} title={`${dayMonth}월 ${date}일 · ${count}번`}></i>;
    })}</div>
    <p class="st-note">{`한 주에 타는 횟수 ${stats.weeklyRides}번 · 승차권 본 횟수 ${stats.recent.ticket}번(최근 ${stats.recent.days}일)`}</p>
    {stats.tickets ? <div class="st-fare"><div class="st-fare-top"><span>{`${month}월 예상 교통비`}</span><b>{won(fare.total)}</b></div>
      <p class="st-note">승차권대로 다 탄다고 가정한 예상이에요</p>
      {fare.tickets.length > 0 && <ul class="st-fare-list">{fare.tickets.map(ticket => <li><span>{ticket.name}</span><small>{`${won(ticket.fare)} × ${ticket.rides}번`}</small><b>{won(ticket.monthly)}</b></li>)}</ul>}
      {fare.skipped ? <p class="st-skip">{`${fare.skipped}장 계산 못 함${why ? ` — ${why}` : ''}`}</p> : null}
      <p class="st-note">교통카드 어른 요금 · 고른 경로 거리 기준이에요. 갈아타는 시간 · 정기권 · 공휴일은 넣지 않았어요.</p></div> : null}
  </>;
}
function SafeBody({ sessions }:{ sessions:Session[] }) {
  return <>
    <p class="acct-sub">{`로그인한 기기 ${sessions.length}대`}</p>
    <ul class="dv-list">{sessions.map(item => <li data-session={item.id}><span class="dv-name">{item.device}{item.current && <em>이 기기</em>}</span>
      <small>{`마지막 사용 ${monthDay(item.lastUsedAt)} · 로그인 ${monthDay(item.createdAt)}`}</small>
      {!item.current && <button type="button" class="dv-out" disabled={view.outBusy.includes(item.id)} onClick={() => call('logoutDevice')(item.id)}>로그아웃</button>}</li>)}</ul>
    <div class="dv-actions">{sessions.length > 1 && <button type="button" id="deviceOthers" onClick={call('logoutOthers')}>다른 기기 모두 로그아웃</button>}
      <button type="button" id="dataExport" onClick={call('exportData')}>내 데이터 내려받기</button></div>
    <p class="st-note">내려받기: 회원 정보 · 로그인 기기 · 승차권 · 날짜별 사용 횟수를 JSON 파일 하나로 받아요.</p>
  </>;
}

function AccountPage():ComponentChildren {
  return <>
    <Profile />
    <section id="accountStats" class="acct-sec" aria-labelledby="accountStatsTitle" hidden={!view.statsShown}><h4 id="accountStatsTitle" class="pf-l">내 통계</h4>
      <div id="accountStatsBody" aria-live="polite">{view.stats && <StatsBody key={view.statsTurn} stats={view.stats} />}</div></section>
    <section id="accountSafe" class="acct-sec" aria-labelledby="accountSafeTitle" hidden={!view.safeShown}><h4 id="accountSafeTitle" class="pf-l">계정</h4>
      <div id="accountSafeBody">{view.sessions && <SafeBody key={view.safeTurn} sessions={view.sessions} />}</div></section>
    <div class="account-foot"><a href="./privacy.html" target="_blank" rel="noopener">개인정보처리방침</a><button id="accountLogout" type="button" onClick={call('logout')}>로그아웃</button>
      <button id="accountDelete" type="button" class="account-delete" onClick={call('deleteAsk')}>탈퇴</button></div>
    <div id="accountConfirm" class="account-confirm" hidden={!view.confirmOpen}><p>탈퇴하면 승차권까지 모두 지워져요</p>
      <div><button id="accountConfirmNo" type="button" onClick={call('deleteNo')}>취소</button><button id="accountConfirmYes" type="button" class="danger" onClick={call('deleteYes')}>탈퇴</button></div></div>
  </>;
}

const root = document.getElementById('menuAccount');
function set(patch:Partial<View>) { view = { ...view, ...patch }; if (root) render(<AccountPage />, root) }

// account.mts 의 창구: 상태 바꾸기 · 지금 상태 읽기 · 누름 받을 함수 걸기
export const accountView = {
  set, get state():Readonly<View> { return view },
  on(next:Handlers) { handlers = next },
};

// HTML 의 옛 속(같은 모양)을 비우고 그 자리에 그린다
if (root) { root.textContent = ''; set({}) }
