// 지도 위 부품 스토리: 상단 막대 · 길찾기 단추 · 지도 위 단추 · 안내 띠. 라이트 · 다크는 위 막대 '테마'
import type { Meta, StoryObj } from '@storybook/preact-vite';
import type { ComponentChildren } from 'preact';
import '../vendor/maplibre-gl.css';
import { LIVE_NOTICE_CSS, LiveNotice } from './live_notice.tsx';
import { MapControls } from './map_controls.tsx';
import type { LocateState } from './map_controls.tsx';
import { RouteButton } from './route_button.tsx';
import { focusFirst } from './story_state.mts';
import { TopBar } from './top_bar.tsx';

const meta:Meta = { title: '컴포넌트/지도 위' };
export default meta;

const MapSpot = ({ children }:{ children:ComponentChildren }) => <div class="sb-stage sb-stage-map sb-map-short">{children}</div>;

export const 막대_기본:StoryObj = { name: '상단 막대 · 기본', render: () => <div class="sb-bar"><TopBar zoom="z13.4" /></div> };
export const 막대_처음:StoryObj = { name: '상단 막대 · 지도 뜨기 전', render: () => <div class="sb-bar"><TopBar /></div> };
export const 막대_포커스:StoryObj = { name: '상단 막대 · 단추 포커스', render: () => <div class="sb-bar" ref={focusFirst}><TopBar zoom="z13.4" /></div> };
export const 막대_상태글자:StoryObj = {
  name: '상단 막대 · 실시간 상태 글자(화면에서는 숨김)',
  render: () => <div class="sb-bar sb-bar-wide">
    <TopBar zoom="z13.4" liveHidden={false} />
    <TopBar zoom="z13.4" liveHidden={false} liveKind="ok" liveText="추정 위치 42대 · 2호선 · 08:12 기준" />
    <TopBar zoom="z10.2" liveHidden={false} liveKind="idle" liveText="줌 13 이상에서 실시간 열차를 표시합니다" />
    <TopBar zoom="z13.4" liveHidden={false} liveKind="error" liveText="실시간 위치 연결 실패 · 잠시 후 재시도" />
  </div>,
};

export const 길찾기_기본:StoryObj = { name: '길찾기 단추 · 기본', render: () => <MapSpot><RouteButton /></MapSpot> };
export const 길찾기_포커스:StoryObj = { name: '길찾기 단추 · 포커스', render: () => <div ref={focusFirst}><MapSpot><RouteButton /></MapSpot></div> };

const Locate = ({ locate }:{ locate:LocateState }) => <MapSpot><MapControls locate={locate} /></MapSpot>;
export const 단추_기본:StoryObj = { name: '지도 위 단추 · 기본', render: () => <Locate locate="idle" /> };
export const 단추_찾는중:StoryObj = { name: '지도 위 단추 · 위치 찾는 중', render: () => <Locate locate="waiting" /> };
export const 단추_내위치:StoryObj = { name: '지도 위 단추 · 내 위치 따라가는 중', render: () => <Locate locate="active" /> };
export const 단추_벗어남:StoryObj = { name: '지도 위 단추 · 지도를 옮겨 벗어남', render: () => <Locate locate="background" /> };
export const 단추_오류:StoryObj = { name: '지도 위 단추 · 위치 오류', render: () => <Locate locate="error" /> };

const Notice = ({ text }:{ text:string }) => <MapSpot><style>{LIVE_NOTICE_CSS}</style><LiveNotice text={text} /></MapSpot>;
export const 안내_끊김:StoryObj = { name: '안내 띠 · 연결 실패', render: () => <Notice text="실시간 열차 정보에 연결하지 못했어요. 20초마다 다시 시도해요." /> };
export const 안내_오래됨:StoryObj = { name: '안내 띠 · 오래된 자료', render: () => <Notice text="실시간 정보가 08:12 이후 갱신되지 않았어요." /> };
