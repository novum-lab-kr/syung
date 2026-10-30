// 메뉴 · 설정 부품: 테마 고르기 · 도시 모드 쪽 · 성능 · 배터리 쪽 · 데이터 출처 쪽 · 메뉴 첫 쪽의 목록. props 만 받아 그린다(전역 상태 없음).
// 상태와 누름 전달은 화면(ui/settings_menu.tsx). DOM · class · id · 문구 · aria 는 옛 index.html 그대로 — 스타일은 syung.css.
// 첫 화면 코드라 한 파일에 모았다(파일이 늘면 요청이 는다) — 본체가 preact 와 같은 단계에서 요청한다.
import type { ComponentChildren } from 'preact';
import { MenuItem, SettingSwitch } from './drawer.tsx';
import { LoginButton } from './login_button.tsx';

export const ICON = {
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
  tickets: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z"/><path d="M15 6v12" stroke-dasharray="2 2.4"/></svg>,
  device: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>,
  sources: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/></svg>,
};

// 눌림 글자: 기준값이 아직 없으면 속성 없음(옛 HTML 처음 모양)
const yes = (on:boolean) => on ? 'true' : 'false';
const pressedBy = <T,>(want:T | undefined, value:T) => want === undefined ? undefined : yes(want === value);
const Icon = ({ children }:{ children?:ComponentChildren }) => <span class="setting-icon" aria-hidden="true">{children}</span>;
const RawIcon = ({ svg }:{ svg:string }) => <span class="setting-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }}></span>;

// ---- 테마 고르기(메뉴 첫 쪽 맨 위) ----
// 한 줄 안내: 자동이면 '지금은 <b>다크</b> · … ', 고정이면 글자만
export type ThemeNote = string | { lead:string; bold:string; tail:string };
export interface ThemePickerProps {
  theme?:string | undefined; note:ThemeNote;
  sky:{ html:string; night:boolean; label?:string | undefined };   // label: 날씨 한 줄(있으면 하늘 그림이 그림 역할 aria-label)
  onPick?:(choice:string) => void;
}
const THEME_CHOICES:[string, ComponentChildren, string][] = [['auto', ICON.auto, '자동'], ['light', ICON.light, '라이트'], ['dark', ICON.dark, '다크']];
export const ThemePicker = ({ theme, note, sky, onPick }:ThemePickerProps) => <>
  <div id="sunPath" class={sky.night ? 'sun-path is-night' : 'sun-path'} role={sky.label ? 'img' : undefined} aria-label={sky.label} ><div class="sun-svg" dangerouslySetInnerHTML={{ __html: sky.html }}></div><div id="skyMotion" class="sky-motion" aria-hidden="true"></div></div>
  <div class="theme-seg" role="group" aria-label="테마" aria-describedby="themeNote">{THEME_CHOICES.map(([choice, icon, label]) =>
    <button type="button" data-theme-choice={choice} aria-pressed={pressedBy(theme, choice)} onClick={() => onPick?.(choice)}>{icon}<span>{label}</span></button>)}</div>
  <p id="themeNote" class="theme-note" aria-live="polite">{typeof note === 'string' ? note : <>{note.lead}<b>{note.bold}</b>{note.tail}</>}</p>
</>;

// ---- 도시 모드 쪽 ----
export type ModeSwitchId = 'toggleSimcity' | 'toggleJoseon' | 'toggleStarcraft' | 'toggleRetro' | 'toggleNation' | 'toggleCoaster';
export type ModeRowId = 'starcraftRace' | 'nationRow' | 'coasterSpeed';
export interface CityModesProps {
  pressed:Record<ModeSwitchId, boolean>; hidden:Record<ModeRowId, boolean>;
  race?:string | undefined; nation?:string | undefined; speed?:number | undefined; speedNote:string;   // 눌림 기준값(그 값과 같은 버튼이 눌림 · 없으면 aria-pressed 없음)
  icons:{ coaster:string; speed:string };   // 롤코 · 속도 아이콘(SVG 글자)
  onSwitch?:(id:ModeSwitchId) => void; onRace?:(race:string) => void; onNation?:(nation:string) => void; onSpeed?:(speed:number) => void;
}
const RACES = [['terran', '테란'], ['zerg', '저그'], ['protoss', '프로토스']] as const;
const NATIONS = [['greece', '그리스'], ['netherlands', '네덜란드'], ['paris', '파리'], ['egypt', '이집트']] as const;
const SPEEDS = [1, 5, 20];

// 스위치 줄: 도시 모드 설명은 도움말(#cityModeHelp)까지 같이 읽어 준다
function ModeSwitch({ id, name, desc, icon, controls, pressed, onSwitch }:{ id:ModeSwitchId; name:string; desc:string; icon:ComponentChildren; controls?:string; pressed:boolean; onSwitch:((id:ModeSwitchId) => void) | undefined }) {
  const key = id.slice(6).toLowerCase();   // toggleSimcity → simcity
  return <SettingSwitch id={id} name={name} note={desc} icon={icon} pressed={pressed} nameId={`${key}Name`} noteId={`${key}Description`} describedBy={`${key}Description cityModeHelp`} controls={controls} onClick={() => onSwitch?.(id)} />;
}

export function CityModes({ pressed, hidden, race, nation, speed, speedNote, icons, onSwitch, onRace, onNation, onSpeed }:CityModesProps) {
  return <>
    <h3 id="cityModeTitle" class="sr">도시 모드</h3>
    <ModeSwitch id="toggleSimcity" name="심시티" desc="작은 서울을 거닐어요" icon={<Icon>{ICON.simcity}</Icon>} pressed={pressed.toggleSimcity} onSwitch={onSwitch} />
    <ModeSwitch id="toggleJoseon" name="조선" desc="한양 기와집 사이를 거닐어요" icon={<Icon>{ICON.joseon}</Icon>} pressed={pressed.toggleJoseon} onSwitch={onSwitch} />
    <ModeSwitch id="toggleStarcraft" name="스타크래프트" desc="종족을 골라 서울을 거닐어요" icon={<Icon>{ICON.starcraft}</Icon>} controls="starcraftRace" pressed={pressed.toggleStarcraft} onSwitch={onSwitch} />
    <div id="starcraftRace" class="setting-row" hidden={hidden.starcraftRace}><Icon /><span class="setting-name">종족</span><div class="segmented" role="group" aria-label="종족">
      {RACES.map(([value, label]) => <button type="button" data-race={value} aria-pressed={pressedBy(race, value)} onClick={() => onRace?.(value)}>{label}</button>)}</div></div>
    <ModeSwitch id="toggleRetro" name="레트로" desc="도트 게임 속 서울을 거닐어요" icon={<Icon>{ICON.retro}</Icon>} pressed={pressed.toggleRetro} onSwitch={onSwitch} />
    <ModeSwitch id="toggleNation" name="세계 여행" desc="서울을 다른 나라 풍으로 거닐어요" icon={<Icon>{ICON.nation}</Icon>} controls="nationRow" pressed={pressed.toggleNation} onSwitch={onSwitch} />
    <div id="nationRow" class="setting-row" hidden={hidden.nationRow}><Icon /><span class="setting-name">나라</span><div class="segmented" role="group" aria-label="나라">
      {NATIONS.map(([value, label]) => <button type="button" data-nation={value} aria-pressed={pressedBy(nation, value)} onClick={() => onNation?.(value)}>{label}</button>)}</div></div>
    <ModeSwitch id="toggleCoaster" name="롤러코스터" desc="도시 위를 달려요" icon={<RawIcon svg={icons.coaster} />} controls="coasterSpeed" pressed={pressed.toggleCoaster} onSwitch={onSwitch} />
    <div id="coasterSpeed" class="setting-row" hidden={hidden.coasterSpeed}><RawIcon svg={icons.speed} /><span class="setting-name">열차 속도<small id="speedNote">{speedNote}</small></span><div class="segmented" role="group" aria-label="열차 속도">
      {SPEEDS.map(value => <button type="button" data-speed={value} aria-pressed={pressedBy(speed, value)} onClick={() => onSpeed?.(value)}>{`${value}배`}</button>)}</div></div>
    <p id="cityModeHelp" class="setting-help">한 번에 하나만 켤 수 있어요.<br />모두 끄면 기본 지도예요.</p>
  </>;
}

// ---- 성능 · 배터리 쪽 ----
export interface DeviceSettingsProps { prebuild:boolean; saver:boolean; onPrebuild?:() => void; onSaver?:() => void }
export const DeviceSettings = ({ prebuild, saver, onPrebuild, onSaver }:DeviceSettingsProps) => <>
  <SettingSwitch id="togglePrebuild" name="건물 미리 짓기" note="모드 전환이 빨라져요 · 발열 주의" icon={<Icon>{ICON.prebuild}</Icon>} pressed={prebuild} onClick={onPrebuild} />
  <SettingSwitch id="toggleSaver" name="절전" note="움직임을 조금 덜 부드럽게 · 배터리 아낌" icon={<Icon>{ICON.saver}</Icon>} pressed={saver} onClick={onSaver} />
</>;

// ---- 데이터 출처 쪽 ----
const Out = ({ href, children }:{ href:string; children:ComponentChildren }) => <a href={href} target="_blank" rel="noopener">{children}</a>;
const SourceLink = ({ href, children }:{ href:string; children:ComponentChildren }) => <span class="source-link"><Out href={href}>{children}</Out></span>;
export const SourceList = () => <ul class="source-list">
  <li><b>노선 · 역 · 시간표</b><span>KTDB(국가교통DB, 한국교통연구원) 대중교통 GTFS</span><SourceLink href="https://www.ktdb.go.kr/">ktdb.go.kr</SourceLink></li>
  <li><b>실시간 열차 위치 · 도착</b><span>서울특별시 열린데이터광장 지하철 실시간 도착 · 위치 정보</span><SourceLink href="https://data.seoul.go.kr/">data.seoul.go.kr</SourceLink></li>
  <li><b>버스 노선 · 정류장</b><span>서울특별시 열린데이터광장 버스 노선 · 정류소 정보 · 공공누리 제1유형(출처표시)</span><SourceLink href="https://data.seoul.go.kr/">data.seoul.go.kr</SourceLink></li>
  <li><b>실시간 버스 위치 · 도착</b><span>서울특별시 버스 정보 API(ws.bus.go.kr)</span></li>
  <li><b>날씨</b><span>기상청 단기예보 조회서비스(공공데이터포털) 초단기실황 · 초단기예보 · 공공누리 제1유형(출처표시)</span><SourceLink href="https://www.data.go.kr/data/15084084/openapi.do">data.go.kr</SourceLink></li>
  <li><b>배경 지도 · 선로</b><span><Out href="https://openmaptiles.org/">© OpenMapTiles</Out> · <Out href="https://www.openstreetmap.org/copyright">© OpenStreetMap</Out> 기여자(ODbL) · 지도 타일 OpenFreeMap</span></li>
</ul>;

// ---- 메뉴 첫 쪽 목록 ----
// 내 정보 · 승차권 줄과 숨은 쪽 열기 단추(화면이 hidden · 글자를 직접 고치고 눌러 쓴다 — 그래서 화면은 한 번만 그린다)
export const AccountRows = () => <>
  <LoginButton />
  <MenuItem id="accountRow" page="menuAccount" hidden nameId="accountItemName" icon={<span id="accountAvatar" class="account-avatar face" aria-hidden="true"></span>} />
  <MenuItem id="ticketsRow" page="menuTickets" hidden name="승차권" icon={<Icon>{ICON.tickets}</Icon>} />
  <button id="ticketOpen" type="button" data-menu-page="menuTicket" aria-controls="menuTicket" hidden tabIndex={-1}></button>
  <button id="routeOpen" type="button" data-menu-page="menuRoute" aria-controls="menuRoute" hidden tabIndex={-1}></button>
</>;
export const MenuNav = () => <>
  <MenuItem page="menuModes" name="도시 모드" icon={<Icon>{ICON.simcity}</Icon>} />
  <MenuItem page="menuDevice" name="성능 · 배터리" icon={<Icon>{ICON.device}</Icon>} />
  <MenuItem page="menuSources" name="데이터 출처" icon={<Icon>{ICON.sources}</Icon>} />
</>;
