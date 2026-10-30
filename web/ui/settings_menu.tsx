// 설정 서랍(햄버거 메뉴)의 몸통 칸 — 테마 고르기(하늘 그림 · 자동/라이트/다크 · 한 줄 안내) · 도시 모드 스위치 · 성능 · 배터리.
// 겉모양은 components/settings.tsx · drawer.tsx — 이 파일은 상태와 누름 전달만. 머리줄 · 목록 줄 · 로그인 단추 · 데이터 출처도 여기서 한 번 그린다(서랍이 숨어 있는 칸이라 첫 화면이 늦어지지 않는다). 열기 · 닫기 · 쪽 넘기기 · Tab 가두기는 본체 · user/account.mts 그대로.
// 상태는 옛 DOM 이 들고 있던 그대로(스위치별 눌림 · 줄별 숨김 · 종족 · 나라 · 속도 버튼의 눌림 기준값 · 글자) — 모드 전환 · 테마의 주인(본체 · map/theme.mts)이
// 옛 setAttribute 자리에서 press · hide · race … 를 불러 바꾸고, 누르면 on() 으로 받은 함수를 부른다. 바뀔 때마다 바로(같은 작업 안에서) 다시 그린다.
// 표시(DOM 모양 · class · id · 문구 · aria)는 옛 index.html 과 같다. 첫 화면 코드: 본체가 preact 와 같은 단계에서 이 파일을 요청한다.
import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { DrawerHead } from '../components/drawer.tsx';
import { AccountRows, CityModes, DeviceSettings, MenuNav, SourceList, ThemePicker } from '../components/settings.tsx';
import type { ModeRowId, ModeSwitchId, ThemeNote } from '../components/settings.tsx';

type SwitchId = ModeSwitchId | 'togglePrebuild' | 'toggleSaver';
type RowId = ModeRowId;
export type { ThemeNote };
interface Handlers {
  switches:Partial<Record<SwitchId, () => void>>;
  race?:(race:string) => void; nation?:(nation:string) => void; speed?:(speed:number) => void; theme?:(choice:string) => void;
}
interface MenuState {
  pressed:Record<SwitchId, boolean>; hidden:Record<RowId, boolean>;
  race?:string; nation?:string; speed?:number; speedNote:string;   // 눌림 기준값(그 값과 같은 버튼이 눌림 · 없으면 aria-pressed 없음)
  icons:{ coaster:string; speed:string };   // 롤코 · 속도 아이콘(본체 ICONS 의 SVG 글자)
  theme?:string; themeNote:ThemeNote; sky:{ html:string; night:boolean; label?:string };   // label: 날씨 한 줄(있으면 하늘 그림이 그림 역할 aria-label)
}

const SWITCHES:SwitchId[] = ['toggleSimcity', 'toggleJoseon', 'toggleStarcraft', 'toggleRetro', 'toggleNation', 'toggleCoaster', 'togglePrebuild', 'toggleSaver'];
let state:MenuState = {
  pressed: Object.fromEntries(SWITCHES.map(id => [id, false])) as Record<SwitchId, boolean>,
  hidden: { starcraftRace: true, nationRow: true, coasterSpeed: true },
  speedNote: '실시간', icons: { coaster: '', speed: '' }, themeNote: '', sky: { html: '', night: false },
};
const handlers:Handlers = { switches: {} };

const Modes = () => <CityModes pressed={state.pressed} hidden={state.hidden} race={state.race} nation={state.nation} speed={state.speed} speedNote={state.speedNote} icons={state.icons}
  onSwitch={id => handlers.switches[id]?.()} onRace={race => handlers.race?.(race)} onNation={nation => handlers.nation?.(nation)} onSpeed={speed => handlers.speed?.(speed)} />;
const Device = () => <DeviceSettings prebuild={state.pressed.togglePrebuild} saver={state.pressed.toggleSaver} onPrebuild={() => handlers.switches.togglePrebuild?.()} onSaver={() => handlers.switches.toggleSaver?.()} />;
const Theme = () => <ThemePicker theme={state.theme} note={state.themeNote} sky={state.sky} onPick={choice => handlers.theme?.(choice)} />;

const roots:[Element | null, () => ComponentChildren][] = [
  [document.querySelector('#menuRoot .theme-pick'), () => <Theme />],
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
  sky(html:string, night:boolean, label?:string) { paint({ sky: { html, night, label } }) },
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

const once:[Element | null, ComponentChildren][] = [
  [document.querySelector('#settingsPanel .menu-head'), <DrawerHead title="메뉴" />],
  [document.getElementById('accountItem'), <AccountRows />],
  [document.querySelector('#menuRoot .menu-nav'), <MenuNav />],
  [document.getElementById('menuSources'), <SourceList />],
];
for (const [root, view] of once) if (root) render(view, root);

// HTML 에는 빈 칸만 있다 — 처음 모양을 바로 그린다
paint({});
