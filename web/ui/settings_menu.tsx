// 설정 서랍(햄버거 메뉴)의 몸통 칸 — 테마 고르기(하늘 그림 · 자동/라이트/다크 · 한 줄 안내) · 도시 모드 스위치 · 성능 · 배터리.
// 서랍 껍데기(열기 · 닫기 · 쪽 넘기기 · Tab 가두기 · ‹)와 목록 · 데이터 출처 · 내 정보 칸은 HTML · 본체 · user/account.mjs 그대로(D-W29).
// 상태는 옛 DOM 이 들고 있던 그대로(스위치별 눌림 · 줄별 숨김 · 종족 · 나라 · 속도 버튼의 눌림 기준값 · 글자) — 모드 전환 · 테마의 주인(본체 · map/theme.mts)이
// 옛 setAttribute 자리에서 press · hide · race … 를 불러 바꾸고, 누르면 on() 으로 받은 함수를 부른다. 바뀔 때마다 바로(같은 작업 안에서) 다시 그린다.
// 표시(DOM 모양 · class · id · 문구 · aria)는 옛 index.html 과 같다. 첫 화면 코드: 본체가 preact 와 같은 단계에서 이 파일을 요청한다.
import { render } from 'preact';
import type { ComponentChildren } from 'preact';

type SwitchId = 'toggleSimcity' | 'toggleJoseon' | 'toggleStarcraft' | 'toggleRetro' | 'toggleNation' | 'toggleCoaster' | 'togglePrebuild' | 'toggleSaver';
type RowId = 'starcraftRace' | 'nationRow' | 'coasterSpeed';
// 테마 한 줄 안내: 자동이면 '지금은 <b>다크</b> · … ', 고정이면 글자만
export type ThemeNote = string | { lead:string; bold:string; tail:string };
interface Handlers {
  switches:Partial<Record<SwitchId, () => void>>;
  race?:(race:string) => void; nation?:(nation:string) => void; speed?:(speed:number) => void; theme?:(choice:string) => void;
}
interface MenuState {
  pressed:Record<SwitchId, boolean>; hidden:Record<RowId, boolean>;
  race?:string; nation?:string; speed?:number; speedNote:string;   // 눌림 기준값(그 값과 같은 버튼이 눌림 · 없으면 aria-pressed 없음)
  icons:{ coaster:string; speed:string };   // 롤코 · 속도 아이콘(본체 ICONS 의 SVG 글자)
  theme?:string; themeNote:ThemeNote; sky:{ html:string; night:boolean };
}

const SWITCHES:SwitchId[] = ['toggleSimcity', 'toggleJoseon', 'toggleStarcraft', 'toggleRetro', 'toggleNation', 'toggleCoaster', 'togglePrebuild', 'toggleSaver'];
let state:MenuState = {
  pressed: Object.fromEntries(SWITCHES.map(id => [id, false])) as Record<SwitchId, boolean>,
  hidden: { starcraftRace: true, nationRow: true, coasterSpeed: true },
  speedNote: '실시간', icons: { coaster: '', speed: '' }, themeNote: '', sky: { html: '', night: false },
};
const handlers:Handlers = { switches: {} };

const ICON = {
  auto: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18z" fill="#f5a524"/><path d="M12 3a9 9 0 0 1 0 18z" fill="#4a5b78"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".6"/></svg>,
  light: <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="#f5a524" stroke="#d98a0b" stroke-width="1.6"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="#e39a17" stroke-width="2"/></svg>,
  dark: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="#b8c9da" stroke="#7f97b0" stroke-width="1"/></svg>,
  simcity: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M4 21V10h6v11M10 21V3h9v18M7 13v1m0 3v1m6-11h3m-3 4h3m-3 4h3m-3 4h3"/></svg>,
  joseon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10.5c3.5.3 6.5-1.8 10-5.5 3.5 3.7 6.5 5.8 10 5.5M5 9.5V20M19 9.5V20M3 20h18M9.5 20v-5h5v5"/></svg>,
  starcraft: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>,
  retro: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M4 4h4v4H4zM10 4h4v4h-4zM16 10h4v4h-4zM10 10h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z"/></svg>,
  nation: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z"/></svg>,
  prebuild: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V9l5-3v15M9 21V4h8v17M3 21h18M13 2l-2 4h4l-2 4"/></svg>,
  saver: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 11v2M7 10v4M10 10v4"/></svg>,
};

// 눌림 글자: 기준값이 아직 없으면 속성 없음(옛 HTML 처음 모양)
const yes = (on:boolean) => on ? 'true' : 'false';
const pressedBy = <T,>(want:T | undefined, value:T) => want === undefined ? undefined : yes(want === value);

function Switch({ id, name, desc, icon, controls }:{ id:SwitchId; name:string; desc:string; icon:ComponentChildren; controls?:string }) {
  const key = id.slice(6).toLowerCase();   // toggleSimcity → simcity
  return <button id={id} class="setting-switch" type="button" aria-pressed={yes(state.pressed[id])} aria-labelledby={`${key}Name`} aria-describedby={`${key}Description cityModeHelp`} aria-controls={controls}
    onClick={() => handlers.switches[id]?.()}>
    {icon}
    <span class="setting-name"><span id={`${key}Name`}>{name}</span><small id={`${key}Description`}>{desc}</small></span>
    <i class="switch" aria-hidden="true"></i>
  </button>;
}
const Icon = ({ children }:{ children?:ComponentChildren }) => <span class="setting-icon" aria-hidden="true">{children}</span>;
const RawIcon = ({ svg }:{ svg:string }) => <span class="setting-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }}></span>;

function Modes() {
  const races = [['terran', '테란'], ['zerg', '저그'], ['protoss', '프로토스']], nations = [['greece', '그리스'], ['netherlands', '네덜란드'], ['paris', '파리'], ['egypt', '이집트']];
  return <>
    <h3 id="cityModeTitle" class="sr">도시 모드</h3>
    <Switch id="toggleSimcity" name="심시티" desc="작은 서울을 거닐어요" icon={<Icon>{ICON.simcity}</Icon>} />
    <Switch id="toggleJoseon" name="조선" desc="한양 기와집 사이를 거닐어요" icon={<Icon>{ICON.joseon}</Icon>} />
    <Switch id="toggleStarcraft" name="스타크래프트" desc="종족을 골라 서울을 거닐어요" icon={<Icon>{ICON.starcraft}</Icon>} controls="starcraftRace" />
    <div id="starcraftRace" class="setting-row" hidden={state.hidden.starcraftRace}><Icon /><span class="setting-name">종족</span><div class="segmented" role="group" aria-label="종족">
      {races.map(([race, label]) => <button type="button" data-race={race} aria-pressed={pressedBy(state.race, race)} onClick={() => handlers.race?.(race!)}>{label}</button>)}</div></div>
    <Switch id="toggleRetro" name="레트로" desc="도트 게임 속 서울을 거닐어요" icon={<Icon>{ICON.retro}</Icon>} />
    <Switch id="toggleNation" name="세계 여행" desc="서울을 다른 나라 풍으로 거닐어요" icon={<Icon>{ICON.nation}</Icon>} controls="nationRow" />
    <div id="nationRow" class="setting-row" hidden={state.hidden.nationRow}><Icon /><span class="setting-name">나라</span><div class="segmented" role="group" aria-label="나라">
      {nations.map(([nation, label]) => <button type="button" data-nation={nation} aria-pressed={pressedBy(state.nation, nation)} onClick={() => handlers.nation?.(nation!)}>{label}</button>)}</div></div>
    <Switch id="toggleCoaster" name="롤러코스터" desc="도시 위를 달려요" icon={<RawIcon svg={state.icons.coaster} />} controls="coasterSpeed" />
    <div id="coasterSpeed" class="setting-row" hidden={state.hidden.coasterSpeed}><RawIcon svg={state.icons.speed} /><span class="setting-name">열차 속도<small id="speedNote">{state.speedNote}</small></span><div class="segmented" role="group" aria-label="열차 속도">
      {[1, 5, 20].map(speed => <button type="button" data-speed={speed} aria-pressed={pressedBy(state.speed, speed)} onClick={() => handlers.speed?.(speed)}>{`${speed}배`}</button>)}</div></div>
    <p id="cityModeHelp" class="setting-help">한 번에 하나만 켤 수 있어요.<br />모두 끄면 기본 지도예요.</p>
  </>;
}

function DeviceSwitch({ id, name, note, icon }:{ id:SwitchId; name:string; note:string; icon:ComponentChildren }) {
  return <button id={id} class="setting-switch" type="button" aria-pressed={yes(state.pressed[id])} onClick={() => handlers.switches[id]?.()}>
    <Icon>{icon}</Icon><span class="setting-name">{name}<small>{note}</small></span><i class="switch" aria-hidden="true"></i>
  </button>;
}
const Device = () => <>
  <DeviceSwitch id="togglePrebuild" name="건물 미리 짓기" note="모드 전환이 빨라져요 · 발열 주의" icon={ICON.prebuild} />
  <DeviceSwitch id="toggleSaver" name="절전" note="움직임을 조금 덜 부드럽게 · 배터리 아낌" icon={ICON.saver} />
</>;

function ThemePick() {
  const note = state.themeNote, choices:[string, ComponentChildren, string][] = [['auto', ICON.auto, '자동'], ['light', ICON.light, '라이트'], ['dark', ICON.dark, '다크']];
  return <>
    <div id="sunPath" class={state.sky.night ? 'sun-path is-night' : 'sun-path'} dangerouslySetInnerHTML={{ __html: state.sky.html }}></div>
    <div class="theme-seg" role="group" aria-label="테마" aria-describedby="themeNote">{choices.map(([choice, icon, label]) =>
      <button type="button" data-theme-choice={choice} aria-pressed={pressedBy(state.theme, choice)} onClick={() => handlers.theme?.(choice)}>{icon}<span>{label}</span></button>)}</div>
    <p id="themeNote" class="theme-note" aria-live="polite">{typeof note === 'string' ? note : <>{note.lead}<b>{note.bold}</b>{note.tail}</>}</p>
  </>;
}

const roots:[Element | null, () => ComponentChildren][] = [
  [document.querySelector('#menuRoot .theme-pick'), () => <ThemePick />],
  [document.getElementById('menuModes'), () => <Modes />],
  [document.getElementById('menuDevice'), () => <Device />],
];
function paint(patch:Partial<MenuState>) {
  state = { ...state, ...patch };
  for (const [root, view] of roots) if (root) render(view(), root);
}

// 본체 · 테마가 부르는 창구(옛 setAttribute · hidden · textContent · innerHTML 자리)
export const settingsMenu = {
  press(id:SwitchId, on:boolean) { paint({ pressed: { ...state.pressed, [id]: on } }) },
  hide(id:RowId, hidden:boolean) { paint({ hidden: { ...state.hidden, [id]: hidden } }) },
  race(want:string) { paint({ race: want }) },
  nation(want:string) { paint({ nation: want }) },
  speed(speed:number, note:string) { paint({ speed, speedNote: note }) },
  icons(coaster:string, speed:string) { paint({ icons: { coaster, speed } }) },
  theme(choice:string) { paint({ theme: choice }) },
  themeNote(note:ThemeNote) { paint({ themeNote: note }) },
  sky(html:string, night:boolean) { paint({ sky: { html, night } }) },
  // 누르면 부를 함수(여러 번 불러 더한다 — 모드 · 미리 짓기 · 절전 · 테마가 따로 건다)
  on(more:Partial<Handlers>) {
    Object.assign(handlers.switches, more.switches);
    if (more.race) handlers.race = more.race;
    if (more.nation) handlers.nation = more.nation;
    if (more.speed) handlers.speed = more.speed;
    if (more.theme) handlers.theme = more.theme;
  },
};
export type SettingsMenu = typeof settingsMenu;

// HTML 에는 빈 칸만 있다 — 처음 모양을 바로 그린다
paint({});
