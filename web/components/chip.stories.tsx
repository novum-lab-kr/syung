// 칩 스토리: 노선(지하철 · 버스 아이콘) · 태그
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Chip } from './chip.tsx';
import { BUS } from './icons.tsx';

const meta:Meta = { title: '컴포넌트/칩' };
export default meta;

export const 노선:StoryObj = {
  render: () => <div class="sb-paper sb-row">
    <Chip kind="line" color="#00a84d" ink="#fff">2호선</Chip>
    <Chip kind="line" color="#ef7c1c" ink="#fff">3호선</Chip>
    <Chip kind="line" color="#d4003b" ink="#fff">신분당</Chip>
    <Chip kind="line" color="#3d5bab" ink="#fff" icon={BUS}>472</Chip>
    <Chip kind="line" color="#53b332" ink="#fff" icon={BUS}>7016</Chip>
  </div>,
};
export const 태그:StoryObj = {
  render: () => <div class="sb-paper sb-row"><Chip kind="tag">최소 시간</Chip><Chip kind="tag">최소 환승</Chip><Chip kind="tag">최소 도보</Chip></div>,
};
