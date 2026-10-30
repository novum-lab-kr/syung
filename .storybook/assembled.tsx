// 화면 기획의 조립 화면: 디자인 시스템 컴포넌트 + 고정 자료(tools/flows/fixtures)로 흐름의 화면을 그린다.
// 화면 이름은 docs/flows/screens/<흐름>/<이름>.json 과 같고, JSON 의 번호(at)는 이 화면 안 요소를 고른다.
// 아직 컴포넌트가 아닌 자리(지도 위 막대 · 경로 카드 · 기기 목록)는 web/user/*_view.tsx · web/user/account.mts 와 같은 DOM 을 여기 적는다 — view 파일은 불러오면 바로 화면을 찾아 그려서 스토리에서 못 부른다. 2e 로 컴포넌트가 되면 바꾼다
import { render, type ComponentChildren } from 'preact';
import indexHtml from '../web/index.html?raw';
import { DayPicker } from '../web/components/day_picker.tsx';
import { JourneyBar } from '../web/components/journey_summary.tsx';
import { AccountRows, CityModes, DeviceSettings, MenuNav, ThemePicker } from '../web/components/settings.tsx';
import { SheetFrame } from '../web/components/sheet_frame.tsx';
import { JourneySheet } from '../web/ui/journey_sheet.tsx';
import { DrawerHead } from '../web/components/drawer.tsx';
import { LayerSheet } from '../web/components/layer_sheet.tsx';
import { LoginSheetBody, SocialButtons } from '../web/components/login_sheet.tsx';
import { PlaceField, type PlaceRow } from '../web/components/place_field.tsx';
import { ProfileCard } from '../web/components/profile_card.tsx';
import { ProfileForm, ProfileSheetBody } from '../web/components/profile_form.tsx';
import { RouteHead } from '../web/components/route_head.tsx';
import { SaveButton } from '../web/components/save_button.tsx';
import { Segmented } from '../web/components/segmented.tsx';
import { StatsPanel } from '../web/components/stats_panel.tsx';
import { TicketCard, TicketFront, TicketList } from '../web/components/ticket_card.tsx';
import { TimeField } from '../web/components/time_field.tsx';
import { routeSteps, routeTrack, trackParts, type JourneyActions, type JourneyView, type Plan, type StepLeg } from '../web/lib/journey-ui.mts';
import { routeFilterView, usefulRoutes } from '../web/user/ticket_routes.mts';
import placesSeoul from '../tools/flows/fixtures/place-seoul.json';
import providers from '../tools/flows/fixtures/providers.json';
import routeAnswer from '../tools/flows/fixtures/route.json';
import sessionAnswer from '../tools/flows/fixtures/sessions.json';
import stats from '../tools/flows/fixtures/stats.json';
import ticketAnswer from '../tools/flows/fixtures/tickets.json';
import type { AssembledScreen } from './phone.tsx';

const noop = () => {};
// 고정 자료의 시각은 촬영 때와 같은 2026-11-02 월 07:30 — 평일 승차권이 '오늘'이다
const RIDE_DAY = 1;
const [COMMUTE, WEEKEND] = ticketAnswer.tickets as unknown as [Ticket, Ticket];
const PLANS = usefulRoutes(routeAnswer.plans as unknown as Plan[]);
const FILTER = routeFilterView(PLANS, 'all');
// 본체 maplibre_runtime.mts 의 노선 색(본체는 불러오면 지도를 띄워 못 부른다) — 고정 자료에 나오는 노선만
const COLORS = { '1호선': '#0052A4', '2호선': '#00A84D', '3호선': '#EF7C1C', '4호선': '#00A5DE', '9호선': '#BDB092', '신분당선': '#D4003B' };
const FROM = '서울역', TO = '강남역 2호선';
const BACK_CHAIN = '<span>서울역</span><em>→</em><span>사당</span><em>→</em><span>강남역</span><small>환승 1</small>';
const CHEVRON = '<svg class="tf-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

interface Ticket { id:number; name:string; depart:string; days:number[]; from:{ name:string }; to:{ name:string }; route:Plan }

// ---- 지도 화면의 틀: 머리 막대 · 검색은 index.html 원문을 잘라 쓴다(2e 로 컴포넌트가 되면 바꾼다). 지도 자리는 .map 의 정적 바탕 ----
const MAST = /<header class="mast">[\s\S]*?<\/header>/.exec(indexHtml)?.[0] ?? '';
const MAP_AREA = /<section class="map-area"[^>]*>([\s\S]*?)<\/section>/.exec(indexHtml)?.[1] ?? '';
function MapApp({ children }:{ children?:ComponentChildren }) {
  return <main class="app">
    <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: MAST }} />
    <div class="layout"><section class="map-area">
      <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: MAP_AREA }} />
      {children}
    </section></div>
  </main>;
}

// 서랍(지도 위에 열린 모습)
function Drawer({ title, withMap = false, back = true, children }:{ title:string; withMap?:boolean; back?:boolean; children:ComponentChildren }) {
  return <>
    <MapApp />
    <div id="settingsPanel" class={withMap ? 'settings-panel open with-map' : 'settings-panel open'} role="dialog" aria-label={title}>
      <div class="menu-head"><DrawerHead title={title} back={back} /></div>
      <div class="menu-body">{children}</div>
    </div>
    <div class="menu-scrim" aria-hidden="true"></div>
  </>;
}

// ---- 03 승차권 ----
function TicketsPage({ flipped = false }:{ flipped?:boolean }) {
  return <section id="menuTickets" class="menu-page tickets-page">
    <TicketList onNew={noop}>
      <TicketCard ticket={COMMUTE} today={COMMUTE.days.includes(RIDE_DAY)} flipped={flipped} chain={flipped ? BACK_CHAIN : null} mapping={false} steps={null} onFlip={noop} onEdit={noop} onMap={noop} onSteps={noop} />
      <TicketCard ticket={WEEKEND} today={WEEKEND.days.includes(RIDE_DAY)} flipped={false} chain={null} mapping={false} steps={null} onFlip={noop} onEdit={noop} onMap={noop} onSteps={noop} />
    </TicketList>
  </section>;
}

const place = (rows:PlaceRow[] | string, listHidden:boolean) => ({ rows, listHidden, onFocus: noop, onInput: noop, onPick: noop, onLeave: noop, onHere: noop, onCloseList: noop });

interface DraftProps { from:string; to?:string; found?:PlaceRow[]; wheel?:boolean; route?:Plan; days?:number[]; name?:string }
function TicketPage({ from, to = '', found, wheel = false, route, days = [], name = '' }:DraftProps) {
  const routeBody = route
    ? `${routeTrack(route, COLORS, 270)}<span class="pk"><b>약 ${route.minutes}분</b> · 환승 ${route.transfers}</span><u>바꾸기</u>`
    : `<span class="pk">경로 고르기</span>${CHEVRON}`;
  return <section id="menuTicket" class="menu-page ticket-page">
    <div id="ticketPreview" aria-hidden="true"><div class="ticket"><div class="ticket-in"><TicketFront ticket={{ name, depart: '08:00', days }} today={days.includes(RIDE_DAY)} /></div></div></div>
    <form id="ticketForm" class="ticket-form" autocomplete="off" noValidate>
      <div class="tf-route"><div class="tf-pls">
        <PlaceField id="ticketFrom" head="출발" name="출발지" placeholder="출발지 고르기" value={from} {...place(found ?? [], !found)} />
        <PlaceField id="ticketTo" head="도착" name="도착지" placeholder="도착지 고르기" to value={to} {...place([], true)} />
      </div></div>
      <TimeField open={wheel} text={{ ampm: '오전', clock: '8:00' }} value="08:00" onToggle={noop} onDone={noop} />
      <span id="ticketRouteLabel" class="tf-l">경로</span>
      <button id="ticketRoute" class={route ? 'tf-pick' : 'tf-pick empty'} type="button" aria-labelledby="ticketRouteLabel ticketRoute" dangerouslySetInnerHTML={{ __html: routeBody }}></button>
      <DayPicker days={days} onDay={noop} onQuick={noop} />
      <label class="tf-l" for="ticketName">승차권 이름</label>
      <div class="tf-in"><input id="ticketName" maxlength={12} placeholder="이름 넣기" enterkeyhint="done" value={name} /><small id="ticketNameCount" aria-hidden="true">{`${[...name].length}/12`}</small></div>
      <SaveButton id="ticketSave" type="submit" disabled={!route}>발권하기</SaveButton>
    </form>
  </section>;
}

function planBody(plan:Plan) {
  const tag = plan.tag ? `<span class="jp-tag">${plan.tag}</span>` : '';
  return `<i class="rt-radio" aria-hidden="true"></i><span class="rt-b"><span class="jp-top"><strong class="jp-min"><small>약 </small>${plan.minutes}<small>분</small></strong>${tag}</span>${routeTrack(plan, COLORS, 250)}</span>`;
}
function RoutePage() {
  return <section id="menuRoute" class="menu-page route-page">
    <RouteHead when={{ month: 11, day: 2, weekday: '월', time: '오전 8:00' }} from={FROM} to={TO} />
    <div class="rt-filters"><Segmented label="경로 종류" class="jkinds" attr="k" items={FILTER.kinds.map(tab => ({ id: tab.kind, name: tab.name, count: tab.count, pressed: tab.pressed }))} onPick={noop} /></div>
    <div id="routeList" class="rt-list" role="radiogroup" aria-label="경로">{FILTER.order.map(index => {
      const plan = PLANS[index]!;
      return <div class="rt-item" key={index}><div class="rt-card">
        <button type="button" class="rt-plan" role="radio" aria-checked={index === 0 ? 'true' : 'false'} aria-label={`${plan.tag || '경로'} 약 ${plan.minutes}분, 환승 ${plan.transfers}번`} dangerouslySetInnerHTML={{ __html: planBody(plan) }}></button>
        <button type="button" class="rt-open" aria-expanded="false" aria-label="경로 자세히 보기"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>
      </div></div>;
    })}</div>
    <p id="routeMsg" class="account-msg" role="status" aria-live="polite"></p>
    <div class="rt-foot"><SaveButton id="routePick">이 경로로</SaveButton></div>
  </section>;
}

// 경로를 지도에서 보는 막대(web/user/account.mts mapBar 와 같은 DOM)
function MapBar({ plan }:{ plan:Plan }) {
  return <div class="jbar">
    <button type="button" class="jbar-open" dangerouslySetInnerHTML={{ __html: `<span class="jbar-top"><b><small>약 </small>${plan.minutes}<small>분</small></b><span>‹ 승차권으로</span></span>${routeTrack(plan, COLORS, 240)}` }}></button>
    <button type="button" class="jbar-x" aria-label="닫고 돌아가기" title="닫고 돌아가기"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
  </div>;
}

// 시각 바퀴의 속: web/user/account.mts 와 같이 칸마다 단추를 채우고 지금 값을 가운데로(08:00 — 한 줄 40px)
const WHEEL_ROW = 40;
const WHEELS:Record<string, { texts:string[]; on:number }> = {
  ampm: { texts: ['오전', '오후'], on: 0 },
  hour: { texts: Array.from({ length: 12 }, (_unused, index) => String(index + 1)), on: 7 },
  minute: { texts: Array.from({ length: 12 }, (_unused, index) => String(index * 5).padStart(2, '0')), on: 0 },
};
function fillWheels(doc:Document) {
  for (const [part, { texts, on }] of Object.entries(WHEELS)) {
    const column = doc.querySelector<HTMLElement>(`.tw-col[data-part="${part}"]`);
    if (!column) continue;
    if (!column.childElementCount) for (const [index, text] of texts.entries()) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.tabIndex = -1;
      button.textContent = text;
      if (index === on) button.className = 'on';
      else if (Math.abs(index - on) === 1) button.className = 'near';
      column.append(button);
    }
    column.setAttribute('aria-valuetext', texts[on]!);
    column.scrollTop = on * WHEEL_ROW;
  }
}

const TICKET_TITLE = '승차권 발권';
const WEEKDAYS = [1, 2, 3, 4, 5];
const TICKETS:Record<string, AssembledScreen> = {
  list: { draw: () => <Drawer title="승차권"><TicketsPage /></Drawer> },
  back: { draw: () => <Drawer title="승차권"><TicketsPage flipped /></Drawer> },
  map: { draw: () => <MapApp><MapBar plan={COMMUTE.route} /></MapApp> },
  place: { draw: () => <Drawer title={TICKET_TITLE}><TicketPage from={FROM} found={placesSeoul.places} /></Drawer> },
  time: { draw: () => <Drawer title={TICKET_TITLE}><TicketPage from={FROM} to={TO} wheel /></Drawer>, prepare: fillWheels },
  route: { draw: () => <Drawer title="경로 선택" withMap><RoutePage /></Drawer> },
  ready: { draw: () => <Drawer title={TICKET_TITLE}><TicketPage from={FROM} to={TO} route={COMMUTE.route} days={WEEKDAYS} name="출근" /></Drawer> },
};

// ---- 04 로그인 · 내 정보 ----
const shortDate = (seconds:number) => {
  const date = new Date(seconds * 1000);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};
function AccountPage() {
  const { sessions } = sessionAnswer, me = providers.me;
  return <section id="menuAccount" class="menu-page account-page">
    <ProfileCard name={me.name} provider="카카오" look={{ photo: false, image: 'url("./brand/faces/sprout-240.png")' }} />
    <section id="accountStats" class="acct-sec" aria-labelledby="accountStatsTitle"><h4 id="accountStatsTitle" class="pf-l">내 통계</h4>
      <div id="accountStatsBody"><StatsPanel stats={stats} /></div></section>
    <section id="accountSafe" class="acct-sec" aria-labelledby="accountSafeTitle"><h4 id="accountSafeTitle" class="pf-l">계정</h4>
      <div id="accountSafeBody">
        <p class="acct-sub">{`로그인한 기기 ${sessions.length}대`}</p>
        <ul class="dv-list">{sessions.map(item => <li key={item.id}><span class="dv-name">{item.device}{item.current && <em>이 기기</em>}</span>
          <small>{`마지막 사용 ${shortDate(item.lastUsedAt)} · 로그인 ${shortDate(item.createdAt)}`}</small>
          {!item.current && <button type="button" class="dv-out">로그아웃</button>}</li>)}</ul>
        <div class="dv-actions"><button type="button" id="deviceOthers">다른 기기 모두 로그아웃</button><button type="button" id="dataExport">내 데이터 내려받기</button></div>
      </div></section>
  </section>;
}

// 프로필 팝업의 속: web/user/account_view.tsx 와 같이 #profileBody 칸에 폼을 따로 그린다
function fillProfile(doc:Document) {
  const body = doc.getElementById('profileBody');
  if (body) render(<ProfileForm name={providers.me.name} count="3/12" over={false} photoImage="" choice="sprout" marked facesLoaded saving={false} converting={false} />, body);
}

const ACCOUNT:Record<string, AssembledScreen> = {
  login: { draw: () => <>
    <MapApp />
    <div id="loginSheet" class="login-sheet open"><LayerSheet labelledBy="loginTitle"><LoginSheetBody><SocialButtons providers={providers.providers} /></LoginSheetBody></LayerSheet></div>
  </> },
  account: { draw: () => <Drawer title="내 정보"><AccountPage /></Drawer> },
  profile: { draw: () => <>
    <Drawer title="내 정보"><AccountPage /></Drawer>
    <div id="profileSheet" class="login-sheet profile-sheet open"><LayerSheet label="프로필 수정"><ProfileSheetBody /></LayerSheet></div>
  </>, prepare: fillProfile },
};

// ---- 02 길찾기 ----
const JOURNEY_PLANS = routeAnswer.plans as unknown as Plan[];
const durationOf = (minutes:number) => minutes >= 60 ? { hours: Math.floor(minutes / 60), minutes: minutes % 60 } : { hours: null, minutes };
const planView = (plan:Plan) => ({
  aria: `${plan.tag || '경로'} ${plan.minutes}분, ${plan.arrives} 도착, 지도에서 보기`, duration: durationOf(plan.minutes), arrive: `${plan.leaveBy} → ${plan.arrives}`, tag: plan.tag || null,
  track: trackParts(plan, COLORS), meta: `환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`, live: plan.legs.some(leg => 'realtime' in leg && leg.realtime),
  steps: routeSteps(plan.legs as unknown as StepLeg[], { from: FROM, to: TO }, COLORS, { start: plan.leaveBy, end: plan.arrives }),
});
const KIND_NAMES = [['all', '전체'], ['subway', '지하철'], ['bus', '버스'], ['mixed', '지하철+버스']] as const;
const countOf = (kind:string) => JOURNEY_PLANS.filter(plan => kind === 'all' || plan.kind === kind).length;
const NO_LIST = { hidden: true, places: [], empty: null };
const EMPTY_JOURNEY:JourneyView = { here: false, done: false, summary: null, whenText: '지금 출발', whenAt: false, whenOpen: false, draft: null, lists: { from: NO_LIST, to: NO_LIST }, status: { text: '', sr: false }, result: { kind: 'none' } };
const FOUND_JOURNEY:JourneyView = { ...EMPTY_JOURNEY, done: true,
  summary: { from: FROM, to: TO, when: '지금 출발', aria: `${FROM}에서 ${TO}까지, 지금 출발. 눌러서 바꾸기` },
  result: { kind: 'plans',
    tabs: KIND_NAMES.filter(([kind]) => countOf(kind)).map(([kind, name]) => ({ kind, name, count: countOf(kind), pressed: kind === 'all' })),
    cards: JOURNEY_PLANS.map((plan, index) => ({ plan: planView(plan), kind: plan.kind, on: index === 0, hidden: false })) } };
const HOLD = { down: noop, stop: noop, click: noop };
const JOURNEY_ACTIONS:JourneyActions = { typed: noop, place: noop, here: noop, swap: noop, summary: noop, whenRow: noop, whenNow: noop, whenGo: noop, day: noop, hold: { h1: HOLD, 'h-1': HOLD, m1: HOLD, 'm-1': HOLD }, tab: noop, card: noop, retry: noop };
const JourneyScreen = ({ view }:{ view:JourneyView }) => <>
  <MapApp />
  <section class="sheet open" aria-label="상세 정보"><SheetFrame><JourneySheet view={view} actions={JOURNEY_ACTIONS} /></SheetFrame></section>
</>;
const FIRST_PLAN = JOURNEY_PLANS[0]!;
const JOURNEY:Record<string, AssembledScreen> = {
  input: { draw: () => <JourneyScreen view={EMPTY_JOURNEY} /> },
  result: { draw: () => <JourneyScreen view={FOUND_JOURNEY} /> },
  map: { draw: () => <>
    <MapApp />
    <div class="jbar"><JourneyBar bar={{ duration: durationOf(FIRST_PLAN.minutes), arrives: FIRST_PLAN.arrives, track: trackParts(FIRST_PLAN, COLORS, 240) }} onOpen={noop} onClear={noop} /></div>
  </> },
};

// ---- 05 설정 · 지도 모드 ----
// 하늘 그림 · 롤코 아이콘은 실제 화면에서 해 위치 · 본체 ICONS 로 만든다 — 조립 화면은 스토리(components/settings.stories.tsx)와 같은 보기용 그림
const SKY = '<svg viewBox="0 0 320 96" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true"><rect width="320" height="96" fill="#bfe3f5"/><circle cx="210" cy="36" r="14" fill="#f5a524"/></svg>';
const MODE_ICONS = {
  coaster: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M2 18c4 0 5-10 9-10s4 6 11 6"/></svg>',
  speed: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 16a8 8 0 1 1 16 0M12 16l4-5"/></svg>',
};
const MODES_OFF = { toggleSimcity: false, toggleJoseon: false, toggleStarcraft: false, toggleRetro: false, toggleNation: false, toggleCoaster: false };
const ROWS_HIDDEN = { starcraftRace: true, nationRow: true, coasterSpeed: true };
// 메뉴 첫 쪽: 로그인한 모습 — web/user/account.mts 가 하듯 숨은 줄을 열고 이름 · 얼굴을 넣는다
function fillAccountRows(doc:Document) {
  const byId = (id:string) => doc.getElementById(id);
  byId('accountItem')?.removeAttribute('hidden');
  byId('loginOpen')?.setAttribute('hidden', '');
  byId('accountRow')?.removeAttribute('hidden');
  byId('ticketsRow')?.removeAttribute('hidden');
  const name = byId('accountItemName'), avatar = byId('accountAvatar');
  if (name) name.textContent = providers.me.name;
  if (avatar) avatar.style.backgroundImage = 'url("./brand/faces/sprout-240.png")';
}
const SETTINGS:Record<string, AssembledScreen> = {
  menu: { draw: () => <Drawer title="메뉴" back={false}><div id="menuRoot" class="menu-list">
    <div class="theme-pick"><ThemePicker theme="auto" note={{ lead: '지금은 ', bold: '라이트', tail: ' · 해 지면 다크로 바뀌어요' }} sky={{ html: SKY, night: false }} /></div>
    <div id="accountItem" class="menu-account"><AccountRows /></div>
    <nav class="menu-nav" aria-label="메뉴"><MenuNav /></nav>
  </div></Drawer>, prepare: fillAccountRows },
  modes: { draw: () => <Drawer title="도시 모드"><section id="menuModes" class="menu-page setting-modes" role="group" aria-labelledby="cityModeTitle" aria-describedby="cityModeHelp"><CityModes pressed={MODES_OFF} hidden={ROWS_HIDDEN} speedNote="실시간" icons={MODE_ICONS} /></section></Drawer> },
  device: { draw: () => <Drawer title="성능 · 배터리"><section id="menuDevice" class="menu-page" aria-label="성능 · 배터리"><DeviceSettings prebuild={false} saver={false} /></section></Drawer> },
};

// 흐름 폴더 → 조립 화면. 여기 있는 흐름은 '화면 기획'이 캡처 대신 이것을 쓴다
export const ASSEMBLED:Record<string, Record<string, AssembledScreen>> = { '02-journey': JOURNEY, '03-tickets': TICKETS, '04-account': ACCOUNT, '05-settings-modes': SETTINGS };
