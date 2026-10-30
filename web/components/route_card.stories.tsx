// 경로 카드 스토리: 기본(접힘) · 고름(펼침 — 설명 줄 · 단계 목록) · 키보드 포커스 · 불러오는 중(뼈대 카드). 카드를 누르면 펼치고 접는다
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { RouteCard, RouteLoading } from './route_card.tsx';
import { SAMPLE_LONG, SAMPLE_PLAN } from './sample_plan.mts';

const meta:Meta = { title: '컴포넌트/경로 카드' };
export default meta;

function Cards({ first = -1 }:{ first?:number }) {
  const [on, setOn] = useState(first);
  return <div class="sb-paper"><div class="jplans">
    <RouteCard plan={SAMPLE_PLAN} index={0} on={on === 0} onPick={index => setOn(on === index ? -1 : index)} />
    <RouteCard plan={SAMPLE_LONG} index={1} on={on === 1} onPick={index => setOn(on === index ? -1 : index)} />
  </div></div>;
}

export const 기본:StoryObj = { render: () => <Cards /> };
export const 고름:StoryObj = { name: '고름(펼침)', render: () => <Cards first={0} /> };
export const 포커스:StoryObj = {
  render: () => <Cards />,
  // 첫 카드에 키보드 포커스(:focus-visible 는 키보드로 옮긴 초점에만 그려진다 — 스토리 화면을 한 번 누른 뒤 Tab 으로도 본다)
  play: ({ canvasElement }) => { canvasElement.querySelector<HTMLElement>('.jp')?.focus({ focusVisible: true } as FocusOptions); },
};
export const 불러오는_중:StoryObj = { name: '불러오는 중', render: () => <div class="sb-paper"><p class="jf-status" role="status">경로를 찾고 있어요</p><div id="jResult"><RouteLoading /></div></div> };
