// 틀 스토리: 아래 시트 · 설정 서랍 · 레이어 팝업(겉모양만 — 끌기 · 쪽 넘기기는 화면 몫). .sb-stage 는 휴대폰 크기 무대(fixed · absolute 가 이 안에 놓인다)
import type { Meta, StoryObj } from '@storybook/preact-vite';
import type { ComponentChildren } from 'preact';
import { DrawerHead, MenuItem, SettingSwitch } from './drawer.tsx';
import { LayerSheet } from './layer_sheet.tsx';
import { SheetFrame } from './sheet_frame.tsx';
import { focusFirst } from './story_state.mts';

const meta:Meta = { title: '컴포넌트/틀' };
export default meta;

const ICON = <span class="setting-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M4 21V10h6v11M10 21V3h9v18M7 13v1m0 3v1m6-11h3m-3 4h3m-3 4h3m-3 4h3"/></svg></span>;
const LONG = '이름이 아주 아주 아주 길어서 한 줄에 다 들어가지 않는 경우의 제목입니다';

const Sheet = ({ children, followHidden = true, followLabel }:{ children?:ComponentChildren; followHidden?:boolean; followLabel?:string }) =>
  <div class="sb-stage"><section class="sheet open" aria-label="상세 정보"><SheetFrame followHidden={followHidden} followLabel={followLabel}>{children}</SheetFrame></section></div>;

export const 시트_기본:StoryObj = { name: '아래 시트 · 기본', render: () => <Sheet><h3>강남역</h3><p>몸통은 시트마다 다르게 채운다.</p></Sheet> };
export const 시트_따라가기:StoryObj = { name: '아래 시트 · 따라가기 단추', render: () => <Sheet followHidden={false}><h3>2호선 내선순환</h3></Sheet> };
export const 시트_버스:StoryObj = { name: '아래 시트 · 버스 따라가기', render: () => <Sheet followHidden={false} followLabel="이 버스 따라가기"><h3>472</h3></Sheet> };
export const 시트_긴이름:StoryObj = { name: '아래 시트 · 긴 이름', render: () => <Sheet><h3>{LONG}</h3></Sheet> };
export const 시트_빈:StoryObj = { name: '아래 시트 · 빈 몸통', render: () => <Sheet /> };
export const 시트_포커스:StoryObj = { name: '아래 시트 · 손잡이 포커스', render: () => <div ref={focusFirst}><Sheet><h3>강남역</h3></Sheet></div> };

const Panel = ({ title = '메뉴', back = false, children }:{ title?:string; back?:boolean; children?:ComponentChildren }) =>
  <div class="sb-stage"><div class="settings-panel open sb-drawer" role="dialog" aria-label="메뉴"><div class="menu-head"><DrawerHead title={title} back={back} /></div><div class="menu-body">{children}</div></div></div>;

export const 서랍_머리줄:StoryObj = { name: '서랍 · 첫 단계', render: () => <Panel><div class="menu-list"><nav class="menu-nav"><MenuItem page="p1" icon={ICON} name="도시 모드" /><MenuItem page="p2" icon={ICON} name="성능 · 배터리" /><MenuItem page="p3" icon={ICON} name="데이터 출처" /></nav></div></Panel> };
export const 서랍_쪽:StoryObj = { name: '서랍 · 안쪽(뒤로 단추)', render: () => <Panel title="성능 · 배터리" back><SettingSwitch id="s1" name="건물 미리 짓기" note="모드 전환이 빨라져요 · 발열 주의" icon={ICON} pressed={false} /><SettingSwitch id="s2" name="절전" note="움직임을 조금 덜 부드럽게 · 배터리 아낌" icon={ICON} pressed /></Panel> };
export const 서랍_긴이름:StoryObj = { name: '서랍 · 긴 이름', render: () => <Panel title={LONG} back><MenuItem page="p1" icon={ICON} name={LONG} /><SettingSwitch id="s1" name={LONG} note={LONG} icon={ICON} pressed={false} /></Panel> };

export const 목록줄_상태:StoryObj = {
  name: '목록 줄 · 상태',
  render: () => <div class="sb-paper">
    <p class="sb-note">기본</p><MenuItem page="p1" icon={ICON} name="도시 모드" />
    <p class="sb-note">누름</p><div class="sb-pressed"><MenuItem page="p1" icon={ICON} name="도시 모드" /></div>
    <p class="sb-note">포커스</p><div ref={focusFirst}><MenuItem page="p1" icon={ICON} name="도시 모드" /></div>
  </div>,
};
export const 스위치_상태:StoryObj = {
  name: '스위치 줄 · 상태',
  render: () => <div class="sb-paper setting-modes">
    <SettingSwitch id="s1" name="꺼짐" note="기본" icon={ICON} pressed={false} />
    <SettingSwitch id="s2" name="켜짐" note="기본" icon={ICON} pressed />
    <div class="sb-pressed"><SettingSwitch id="s3" name="누름" note="누르는 동안" icon={ICON} pressed={false} /></div>
    <div ref={focusFirst}><SettingSwitch id="s4" name="포커스" note="Tab 으로 왔을 때" icon={ICON} pressed={false} /></div>
    <SettingSwitch id="s5" name="비활성" note="바꾸는 중" icon={ICON} pressed={false} disabled />
  </div>,
};

export const 레이어팝업:StoryObj = { name: '레이어 팝업', render: () => <div class="sb-stage"><div class="login-sheet open"><LayerSheet label="예시"><h2>제목</h2><p>속은 팝업마다 다르게 채운다.</p></LayerSheet></div></div> };
