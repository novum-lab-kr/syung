// 관리 화면 '회원'(admin/members.html 의 <main>): 회원 수 · 가입 · 탈퇴 추이 · 목록(찾기 · 쪽) · 상세 · 조치(장소 보기 · 강제 로그아웃 ·
// 사진 내리기 · 닉네임 초기화 · 탈퇴 처리). 셈은 admin/members_data.mts.
// 옛 인라인 스크립트와 받는 차례 · 확인 문구 · 버튼 막기 · 요청 머리말이 같아야 해서(데이터를 바꾸는 조치) 그 코드의 모양을 그대로 따른다:
// 쪽 · 찾는 말 · 고른 회원은 모듈 변수, 화면 상태는 view 하나 — set() 이 바꾸고 바로(같은 작업 안에서) 다시 그린다.
// 표시(DOM 모양 · class · 문구 · aria)는 옛 HTML 과 같다 — 첫 그림은 HTML 에 그대로 있고 이 모듈이 비우고 그린다.
import { createRef, render } from 'preact';
import type { TargetedEvent } from 'preact';
import {
  chartBars, facts, kindLines, logLine, pageInfo, placeRow, provider, ticketRow, when, withdrawName,
} from './members_data.mts';
import type { DayCount, MemberDetail, MemberPage, MemberStats, Place } from './members_data.mts';

type Action = 'place' | 'out' | 'avatar' | 'name' | 'del';
interface Msg { text:string; ok:boolean | null }   // ok 가 null 이면 아직 한 번도 안 씀(class 'msg')
interface View {
  login:boolean;
  stats:MemberStats | null; statsError:string | null; drawn:boolean;   // drawn: 그래프를 한 번 그렸나(그 뒤로는 class 'muted' 가 빠진 채)
  pager:{ text:string; prev:boolean; next:boolean };   // 목록을 받았을 때만 바뀐다(못 받으면 앞 글자 그대로)
  rows:{ members:MemberPage['members']; empty:string } | { error:string } | null; on:number | null;
  shown:boolean; title:string; member:MemberDetail | null; avatarSrc:string | null; places:Place[] | null;
  inputs:Record<Action | 'confirm', string>; msgs:Record<Action, Msg>; disabled:Record<Action, boolean>;
}

const ACTIONS:Action[] = ['place', 'out', 'avatar', 'name', 'del'];
const each = <T,>(make:(action:Action) => T) => Object.fromEntries(ACTIONS.map(action => [action, make(action)])) as Record<Action, T>;

let page = 1, query = '', picked:number | null = null;
let view:View = {
  login: false, stats: null, statsError: null, drawn: false,
  pager: { text: '', prev: true, next: true }, rows: null, on: null,
  shown: false, title: '회원', member: null, avatarSrc: null, places: null,
  inputs: { ...each(() => ''), confirm: '' }, msgs: each(() => ({ text: '', ok: null })), disabled: each(() => false),
};
const main = document.querySelector('main')!;
const detailRef = createRef<HTMLElement>(), searchRef = createRef<HTMLInputElement>();   // 찾는 말 칸은 옛 코드처럼 찾을 때만 읽는다
function set(patch:Partial<View>) { view = { ...view, ...patch }; render(<MembersPage />, main) }
const say = (action:Action, text:string, ok = false) => set({ msgs: { ...view.msgs, [action]: { text, ok } } });
const typed = (field:Action | 'confirm') => (event:TargetedEvent<HTMLInputElement>) => set({ inputs: { ...view.inputs, [field]: event.currentTarget.value } });

async function api<T>(path:string, options:RequestInit = {}):Promise<T> {
  const init:RequestInit = { credentials: 'same-origin', ...options };
  if (options.body) init.headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'syung' };
  const response = await fetch('/api/admin' + path, init);
  if (response.status === 401) { set({ login: true }); throw new Error('로그인이 필요해요') }
  set({ login: false });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `요청 실패(${response.status})`);
  return body as T;
}
const message = (error:unknown) => (error as Error).message;

// ---- 회원 수 · 가입 · 탈퇴 추이 ----
async function loadStats() {
  try { set({ stats: await api<MemberStats>('/members/stats'), statsError: null, drawn: true }) } catch (error) { set({ statsError: message(error) }) }
}

// ---- 회원 목록 ----
async function loadList() {
  try {
    const body = await api<MemberPage>(`/members?q=${encodeURIComponent(query)}&page=${page}`);
    const info = pageInfo(body, page);
    set({ pager: { text: info.text, prev: info.prev, next: info.next }, rows: { members: body.members, empty: query ? '찾는 회원이 없어요' : '아직 회원이 없어요' }, on: picked });
  } catch (error) { set({ rows: { error: message(error) } }) }
}
const pickRow = (target:EventTarget | null) => {
  const row = (target as Element).closest<HTMLElement>('tr[data-id]');
  if (row) openMember(Number(row.dataset.id));
};

// ---- 회원 상세 · 조치 ----
async function openMember(id:number) {
  picked = id;
  set({ on: id, inputs: { ...each(() => ''), confirm: '' }, msgs: each(action => ({ ...view.msgs[action], text: '' })), places: null, disabled: each(() => false) });
  try { showMember(await api<MemberDetail>(`/members/${id}`)) } catch (error) { set({ shown: true, title: message(error) }); return }
  detailRef.current!.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showMember(member:MemberDetail) {
  // 올린 사진은 내리기 전에 볼 수 있게(주인 쿠키로만 받는 주소). 없으면 칸을 숨긴다
  const photo = member.avatar?.type === 'photo';
  set({ shown: true, title: `${member.name} · ${member.id}번`, member, avatarSrc: photo ? `/api/admin/members/${member.id}/avatar` : null,
    disabled: { ...view.disabled, avatar: !photo } });
}

const reasonOf = (action:Action) => view.inputs[action].trim();
const cleared = (action:Action) => set({ inputs: { ...view.inputs, [action]: '' } });

async function viewPlaces() {
  const reason = reasonOf('place');
  if (!reason) return say('place', '보는 이유를 적어 주세요');
  try {
    const body = await api<{ places:Place[] }>(`/members/${picked}/places`, { method: 'POST', body: JSON.stringify({ reason }) });
    set({ places: body.places });
    say('place', '열람 기록을 남겼어요', true);
    showMember(await api<MemberDetail>(`/members/${picked}`));
  } catch (error) { say('place', message(error)) }
}

async function forceLogout() {
  const reason = reasonOf('out');
  if (!reason) return say('out', '이유를 적어 주세요');
  try {
    const body = await api<{ sessions:number }>(`/members/${picked}/logout`, { method: 'POST', body: JSON.stringify({ reason }) });
    cleared('out');
    say('out', `로그인 기기 ${body.sessions}대에서 로그아웃했어요`, true);
    showMember(await api<MemberDetail>(`/members/${picked}`)); loadList();
  } catch (error) { say('out', message(error)) }
}

async function clearAvatar() {
  const reason = reasonOf('avatar');
  if (!reason) return say('avatar', '이유를 적어 주세요');
  try {
    await api(`/members/${picked}/avatar`, { method: 'POST', body: JSON.stringify({ reason }) });
    cleared('avatar');
    say('avatar', '사진을 내렸어요(기본 캐릭터로)', true);
    showMember(await api<MemberDetail>(`/members/${picked}`));
  } catch (error) { say('avatar', message(error)) }
}

async function resetName() {
  const reason = reasonOf('name');
  if (!reason) return say('name', '이유를 적어 주세요');
  try {
    const body = await api<{ name:string }>(`/members/${picked}/name`, { method: 'POST', body: JSON.stringify({ reason }) });
    cleared('name');
    say('name', `닉네임을 '${body.name}'(으)로 되돌렸어요`, true);
    showMember(await api<MemberDetail>(`/members/${picked}`)); loadList();
  } catch (error) { say('name', message(error)) }
}

async function withdraw() {
  const reason = reasonOf('del'), confirm = view.inputs.confirm.trim();
  if (!reason) return say('del', '이유를 적어 주세요');
  if (confirm !== String(picked)) return say('del', '확인용 회원번호가 맞지 않아요');
  try {
    const body = await api<{ removed:{ tickets:number; sessions:number } }>(`/members/${picked}`, { method: 'DELETE', body: JSON.stringify({ reason, confirm }) });
    say('del', `탈퇴 처리했어요(승차권 ${body.removed.tickets}장 · 로그인 기기 ${body.removed.sessions}대 삭제)`, true);
    set({ title: `${picked}번 회원 · 탈퇴 처리됨`, disabled: each(() => true), avatarSrc: null, places: null });
    picked = null; loadStats(); loadList();
  } catch (error) { say('del', message(error)) }
}

// ---- 그리기 ----
function Chart({ id, daily, label, barClass }:{ id:string; daily:DayCount[] | undefined; label:string; barClass:string }) {
  let inner;
  if (view.statsError) inner = view.statsError;
  else if (daily) {
    inner = <svg viewBox="0 0 600 180" role="img" aria-label={label}>{chartBars(daily).map(bar => <>
      <rect class={barClass} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="2"><title>{bar.title}</title></rect>
      {bar.value && <text class="val" x={bar.value.x} y={bar.value.y} text-anchor="middle">{bar.value.text}</text>}
      {bar.label && <text x={bar.label.x} y={bar.label.y} text-anchor={bar.label.anchor}>{bar.label.text}</text>}
    </>)}</svg>;
  } else inner = '불러오는 중';
  return <div id={id} class={view.drawn ? '' : 'muted'}>{inner}</div>;
}

const Kinds = ({ id, lines }:{ id:string; lines:{ name:string; count:number }[] | undefined }) =>
  <ul class="kinds" id={id}>{lines?.map(line => <li>{line.name}<b>{line.count}</b></li>)}</ul>;

const Stat = ({ label, id, value }:{ label:string; id:string; value:string | number | undefined }) =>
  <div class="stat"><small>{label}</small><b id={id}>{value ?? '–'}</b></div>;

function Act({ action, title, text, label, button, danger }:{ action:Action; title:string; text:string; label:string; button:string; danger?:boolean }) {
  const onClick = { place: viewPlaces, out: forceLogout, avatar: clearAvatar, name: resetName, del: withdraw }[action];
  return <div class={danger ? 'act danger' : 'act'}>
    <b>{title}</b>
    <p>{text}</p>
    <div class="row">
      <input id={`${action}Reason`} maxlength={200} placeholder="이유(기록에 남아요)" aria-label={label} value={view.inputs[action]} onInput={typed(action)} />
      {danger && <input id="delConfirm" inputmode="numeric" placeholder="회원번호 다시 입력" aria-label="확인용 회원번호" style={{ flex: '0 1 160px' }} value={view.inputs.confirm} onInput={typed('confirm')} />}
      <button class={danger ? 'btn danger' : 'btn quiet'} type="button" id={`${action}Btn`} disabled={view.disabled[action]} onClick={onClick}>{button}</button>
    </div>
    <Message action={action} />
  </div>;
}

function Message({ action }:{ action:Action }) {
  const { text, ok } = view.msgs[action];
  let cls = 'msg';
  if (ok != null) cls = ok ? 'msg ok' : 'msg err';
  return <div class={cls} id={`${action}Msg`} role="status">{text}</div>;
}

function MemberList() {
  const { rows } = view;
  if (!rows) return null;
  if ('error' in rows) return <tr><td colSpan={7}>{rows.error}</td></tr>;
  if (!rows.members.length) return <tr><td colSpan={7}>{rows.empty}</td></tr>;
  return <>{rows.members.map(member => <tr tabIndex={0} data-id={member.id} class={member.id === view.on ? 'on' : undefined}>
    <td class="n">{member.id}</td><td>{member.name}</td><td>{provider(member.provider)}</td><td>{when(member.createdAt, false)}</td>
    <td class="n">{member.tickets}</td><td>{when(member.lastLogin)}</td><td class="n">{member.sessions}</td>
  </tr>)}</>;
}

function Detail() {
  const { member } = view;
  return <section class="box" id="detail" aria-label="회원 상세" hidden={!view.shown} ref={detailRef}>
    <h2 id="dTitle">{view.title}</h2>
    <dl class="facts" id="dFacts">{member && facts(member).map(([label, value]) => <div><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {/* 사진이 없으면 src 없는 img(옛 코드의 removeAttribute — Preact 는 지운 src 를 빈 글자로 남겨서 칸을 바꿔 끼운다) */}
    <div id="dAvatar" class="avatar-view" hidden={!view.avatarSrc}>{view.avatarSrc
      ? <img key="photo" id="dAvatarImg" alt="회원이 올린 프로필 사진" width="96" height="96" src={view.avatarSrc} />
      : <img key="none" id="dAvatarImg" alt="회원이 올린 프로필 사진" width="96" height="96" />}<span>회원이 올린 프로필 사진 · 볼 때마다 관리 기록에 남아요</span></div>

    <h3>승차권</h3>
    <div class="tw"><table>
      <thead><tr><th>이름</th><th>출발 시각</th><th>타는 날</th><th>고른 경로</th><th>만든 날</th></tr></thead>
      <tbody id="dTickets">{member && (member.ticketList.length
        ? member.ticketList.map(ticket => <tr>{ticketRow(ticket).map(text => <td>{text}</td>)}</tr>)
        : <tr><td colSpan={5}>승차권이 없어요</td></tr>)}</tbody>
    </table></div>
    <div class="hidden-place" id="placeBox" style={{ marginTop: '10px' }} hidden={!!member && !member.ticketList.length}>
      <span>장소는 가려져 있어요.</span>
      <input id="placeReason" maxlength={200} placeholder="보는 이유(기록에 남아요)" aria-label="장소를 보는 이유" style={{ flex: '1 1 200px' }} value={view.inputs.place} onInput={typed('place')} />
      <button class="btn quiet" type="button" id="placeBtn" disabled={view.disabled.place} onClick={viewPlaces}>장소 보기</button>
    </div>
    <Message action="place" />
    <div class="tw" id="placeTable" hidden={!view.places}><table>
      <thead><tr><th>승차권</th><th>출발지</th><th>도착지</th></tr></thead>
      <tbody id="dPlaces">{view.places?.map(place => <tr>{placeRow(place).map(text => <td>{text}</td>)}</tr>)}</tbody>
    </table></div>

    <h3>조치</h3>
    <Act action="out" title="강제 로그아웃" text="이 회원이 로그인한 모든 기기에서 로그아웃돼요. 회원 정보와 승차권은 그대로예요." label="강제 로그아웃 이유" button="강제 로그아웃" />
    <Act action="avatar" title="프로필 사진 내리기" text="회원이 올린 사진을 지우고 기본 캐릭터로 되돌려요. 사진 파일도 지워져요." label="프로필 사진 내리기 이유" button="사진 내리기" />
    <Act action="name" title="닉네임 초기화" text="닉네임을 로그인 방법의 기본 이름(카카오 사용자 등)으로 되돌려요." label="닉네임 초기화 이유" button="닉네임 초기화" />
    <Act action="del" title="탈퇴 처리" text="회원 정보 · 로그인 연결 · 로그인 기기 · 승차권 · 올린 프로필 사진이 모두 지워지고 되돌릴 수 없어요. 확인을 위해 회원번호를 한 번 더 적어 주세요." label="탈퇴 처리 이유" button="탈퇴 처리" danger />

    <h3>관리 기록</h3>
    <ul class="log" id="dLog">{member && (member.log.length
      ? member.log.map(item => { const [at, what, reason] = logLine(item); return <li>{at}<b>{what}</b>{reason}</li> })
      : <li>아직 기록이 없어요</li>)}</ul>
  </section>;
}

function MembersPage() {
  const { stats } = view, out = stats?.withdraw;
  const search = (event:TargetedEvent<HTMLFormElement>) => { event.preventDefault(); query = searchRef.current!.value.trim(); page = 1; loadList() };
  return <>
    <p class="login" id="login" hidden={!view.login}>로그인이 풀렸어요. <a href="/admin/login.html?next=/admin/members">다시 로그인</a></p>

    <section class="stats" aria-label="회원 수">
      <Stat label="모든 회원" id="sTotal" value={stats?.total.toLocaleString('ko-KR')} />
      <Stat label="오늘 가입" id="sToday" value={stats?.today} />
      <Stat label="최근 7일 가입" id="sWeek" value={stats?.week} />
      <Stat label="최근 30일 가입" id="sMonth" value={stats?.month} />
    </section>

    <section class="box" aria-label="가입 추이">
      <h2>가입 추이 · 최근 30일</h2>
      <div class="trend">
        <Chart id="chart" daily={stats?.daily} label="날짜별 가입 수" barClass="bar" />
        <div><h3 style={{ marginTop: 0 }}>로그인 방법</h3><Kinds id="kinds" lines={stats ? kindLines(stats.providers, item => provider(item.provider), '아직 회원 없음') : undefined} /></div>
      </div>
    </section>

    <section class="stats" aria-label="탈퇴 수">
      <Stat label="모든 탈퇴" id="wTotal" value={out?.total.toLocaleString('ko-KR')} />
      <Stat label="오늘 탈퇴" id="wToday" value={out?.today} />
      <Stat label="최근 7일 탈퇴" id="wWeek" value={out?.week} />
      <Stat label="최근 30일 탈퇴" id="wMonth" value={out?.month} />
    </section>

    <section class="box" aria-label="탈퇴 추이">
      <h2>탈퇴 추이 · 최근 30일</h2>
      <div class="trend">
        <Chart id="outChart" daily={out?.daily} label="날짜별 탈퇴 수" barClass="bar out" />
        <div><h3 style={{ marginTop: 0 }}>탈퇴 사유</h3><Kinds id="outKinds" lines={out && kindLines(out.reasons, item => withdrawName(item.reason), '아직 탈퇴 없음')} /></div>
      </div>
    </section>

    <section class="box" aria-label="회원 목록">
      <h2>회원 목록</h2>
      <form class="search" id="searchForm" role="search" onSubmit={search}>
        <input id="q" type="search" maxlength={40} placeholder="닉네임이나 회원번호" aria-label="닉네임이나 회원번호로 찾기" ref={searchRef} />
        <button class="btn" type="submit">찾기</button>
      </form>
      <div class="tw"><table>
        <thead><tr><th class="n">번호</th><th>닉네임</th><th>로그인 방법</th><th>가입</th><th class="n">승차권</th><th>최근 로그인</th><th class="n">로그인 기기</th></tr></thead>
        <tbody class="pick" id="list" onClick={event => pickRow(event.target)} onKeyDown={event => { if (event.key === 'Enter') pickRow(event.target) }}><MemberList /></tbody>
      </table></div>
      <div class="pager"><span id="pageText">{view.pager.text}</span>
        <button class="btn quiet" type="button" id="prev" disabled={!view.pager.prev} onClick={() => { page -= 1; loadList() }}>이전</button>
        <button class="btn quiet" type="button" id="next" disabled={!view.pager.next} onClick={() => { page += 1; loadList() }}>다음</button></div>
      <p class="note">승차권의 장소(출발지 · 도착지)는 목록과 상세에 보이지 않아요. 상세의 [장소 보기]에서 이유를 적어야 보이고, 그때 기록이 남아요.</p>
    </section>

    <Detail />
  </>;
}

// HTML 에 있던 첫 그림(같은 모양)을 비우고 그 자리에 그린다 — 같은 작업 안이라 깜박이지 않는다
main.textContent = '';
set({});
loadStats(); loadList();
