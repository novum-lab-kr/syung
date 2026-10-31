// 메뉴 · 설정 스토리: 메뉴 첫 쪽(테마 · 목록) · 테마 고르기 · 도시 모드 · 성능 · 배터리 · 데이터 출처. 눌러서 바꿔 볼 수 있다. 라이트 · 다크는 위 막대 '테마'
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { AccountRows, CityModes, DeviceSettings, MenuNav, SourceList, ThemePicker } from './settings.tsx';
import type { CityModesProps, ModeSwitchId, ThemePickerProps } from './settings.tsx';
import { DrawerStage } from './story_drawer.tsx';
import { focusFirst } from './story_state.mts';
import { freeze } from './story_states.mts';

const meta:Meta = { title: '컴포넌트/메뉴 · 설정' };
export default meta;

// 하늘 그림은 화면에서 해 위치 · 날씨로 만든다 — 스토리는 보기용 그림 하나
const SKY = '<svg viewBox="0 0 320 96" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true"><rect width="320" height="96" fill="#bfe3f5"/><circle cx="210" cy="36" r="14" fill="#f5a524"/></svg>';
const NIGHT = '<svg viewBox="0 0 320 96" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true"><rect width="320" height="96" fill="#1c2a44"/><circle cx="80" cy="30" r="10" fill="#e6edf5"/></svg>';
const AUTO_NOTE = { lead: '지금은 ', bold: '라이트', tail: ' · 해 지면 다크로 바뀌어요' };

function Theme({ first = 'auto', ...props }:Partial<ThemePickerProps> & { first?:string }) {
  const [theme, setTheme] = useState(first);
  return <div class="sb-paper"><div class="theme-pick"><ThemePicker theme={theme} note={AUTO_NOTE} sky={{ html: SKY, night: false }} onPick={setTheme} {...props} /></div></div>;
}
export const 테마_자동:StoryObj = { name: '테마 · 자동', render: () => <Theme /> };
export const 테마_고정:StoryObj = { name: '테마 · 고정(글자만)', render: () => <Theme first="light" note="늘 라이트로 보여요" /> };
export const 테마_밤:StoryObj = { name: '테마 · 밤 하늘', render: () => <Theme first="dark" note="늘 다크로 보여요" sky={{ html: NIGHT, night: true, label: '맑음 · 영상 12도' }} /> };
export const 테마_처음:StoryObj = { name: '테마 · 기준값 없음(처음 모양)', render: () => <div class="sb-paper"><div class="theme-pick"><ThemePicker note="" sky={{ html: '', night: false }} /></div></div> };
export const 테마_누름:StoryObj = { name: '테마 · 누름', render: () => <Theme />, play: ({ canvasElement }) => freeze(canvasElement, '.theme-seg button', 'is-pressed') };
export const 테마_포커스:StoryObj = { name: '테마 · 포커스', render: () => <div ref={focusFirst}><Theme /></div> };

const OFF:CityModesProps['pressed'] = { toggleSimcity: false, toggleJoseon: false, toggleStarcraft: false, toggleRetro: false, toggleNation: false, toggleCoaster: false };
const HIDDEN:CityModesProps['hidden'] = { starcraftRace: true, nationRow: true, coasterSpeed: true };
// 롤코 · 속도 아이콘은 화면에서 본체 ICONS 글자로 넘긴다 — 스토리는 보기용 그림
const ICONS = {
  coaster: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M2 18c4 0 5-10 9-10s4 6 11 6"/></svg>',
  speed: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 16a8 8 0 1 1 16 0M12 16l4-5"/></svg>',
};
// 스위치 하나만 켜지고 딸린 줄이 펼쳐진다(한 번에 하나 — 화면과 같은 모양)
const ROW_OF:Partial<Record<ModeSwitchId, keyof CityModesProps['hidden']>> = { toggleStarcraft: 'starcraftRace', toggleNation: 'nationRow', toggleCoaster: 'coasterSpeed' };
function Modes({ first, speedNote = '실시간' }:{ first?:ModeSwitchId; speedNote?:string }) {
  const [on, setOn] = useState(first), [race, setRace] = useState('terran'), [nation, setNation] = useState('greece'), [speed, setSpeed] = useState(1);
  const hidden = { ...HIDDEN }, row = on && ROW_OF[on];
  if (row) hidden[row] = false;
  return <DrawerStage title="도시 모드" back><section class="menu-page setting-modes"><CityModes pressed={on ? { ...OFF, [on]: true } : OFF} hidden={hidden} race={race} nation={nation} speed={speed} speedNote={speedNote} icons={ICONS}
    onSwitch={id => setOn(on === id ? undefined : id)} onRace={setRace} onNation={setNation} onSpeed={setSpeed} /></section></DrawerStage>;
}
export const 모드_모두끔:StoryObj = { name: '도시 모드 · 모두 끔', render: () => <Modes /> };
export const 모드_심시티:StoryObj = { name: '도시 모드 · 심시티', render: () => <Modes first="toggleSimcity" /> };
export const 모드_종족:StoryObj = { name: '도시 모드 · 스타크래프트(종족)', render: () => <Modes first="toggleStarcraft" /> };
export const 모드_속도:StoryObj = { name: '도시 모드 · 롤러코스터(속도)', render: () => <Modes first="toggleCoaster" speedNote="5배속" /> };
export const 모드_누름:StoryObj = { name: '도시 모드 · 고르기 누름', render: () => <Modes first="toggleStarcraft" />, play: ({ canvasElement }) => freeze(canvasElement, '.segmented button', 'is-pressed') };
export const 모드_포커스:StoryObj = { name: '도시 모드 · 고르기 포커스', render: () => <Modes first="toggleStarcraft" />, play: ({ canvasElement }) => freeze(canvasElement, '.segmented button', 'is-focus') };

function Device({ prebuild: first = false, saver: second = false }) {
  const [prebuild, setPrebuild] = useState(first), [saver, setSaver] = useState(second);
  return <DrawerStage title="성능 · 배터리" back><section class="menu-page"><DeviceSettings prebuild={prebuild} saver={saver} onPrebuild={() => setPrebuild(!prebuild)} onSaver={() => setSaver(!saver)} /></section></DrawerStage>;
}
export const 성능_끔:StoryObj = { name: '성능 · 배터리 · 끔', render: () => <Device /> };
export const 성능_켬:StoryObj = { name: '성능 · 배터리 · 켬', render: () => <Device prebuild saver /> };

export const 출처:StoryObj = { name: '데이터 출처', render: () => <DrawerStage title="데이터 출처" back><section class="menu-page"><SourceList /></section></DrawerStage> };

// 메뉴 첫 쪽: 내 정보 · 승차권 줄은 화면이 로그인 뒤 hidden 을 풀어 보여 준다
const RootPage = ({ loggedIn = false }) => <DrawerStage><div class="menu-list"><div class="theme-pick"><ThemePicker theme="auto" note={AUTO_NOTE} sky={{ html: SKY, night: false }} /></div>
  <div class="menu-account" ref={box => { if (!box) return; const shown = (id:string, on:boolean) => { const row = box.querySelector<HTMLElement>(id); if (row) row.hidden = !on }; shown('#accountRow', loggedIn); shown('#ticketsRow', loggedIn); shown('#accountLogin', !loggedIn); const name = box.querySelector('#accountItemName'); if (name) name.textContent = '슝이' }}><AccountRows /></div>
  <nav class="menu-nav" aria-label="메뉴"><MenuNav /></nav></div></DrawerStage>;
export const 첫쪽_로그아웃:StoryObj = { name: '메뉴 첫 쪽 · 로그아웃', render: () => <RootPage /> };
export const 첫쪽_로그인:StoryObj = { name: '메뉴 첫 쪽 · 로그인', render: () => <RootPage loggedIn /> };
