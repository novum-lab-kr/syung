// 타는 요일 고르기 스토리: 아무 날도 안 고름(빈 상태) · 평일 · 주말 · 매일 · 하나씩 · 포커스 · 누름. 눌러서 바꿔 볼 수 있다
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { DayPicker } from './day_picker.tsx';
import { freeze } from './story_states.mts';

const meta:Meta = { title: '컴포넌트/승차권/요일 고르기' };
export default meta;

function Days({ first = [] as number[] }) {
  const [days, setDays] = useState(first);
  return <div class="sb-paper ticket-page ticket-form"><DayPicker days={days} onQuick={value => setDays(value.split(',').map(Number))}
    onDay={day => setDays(days.includes(day) ? days.filter(other => other !== day) : [...days, day].sort((left, right) => left - right))} /></div>;
}

export const 빈_상태:StoryObj = { name: '빈 상태(안 고름)', render: () => <Days /> };
export const 평일:StoryObj = { render: () => <Days first={[1, 2, 3, 4, 5]} /> };
export const 주말:StoryObj = { render: () => <Days first={[6, 7]} /> };
export const 매일:StoryObj = { render: () => <Days first={[1, 2, 3, 4, 5, 6, 7]} /> };
export const 하나씩:StoryObj = { render: () => <Days first={[1, 3, 6]} /> };
export const 포커스:StoryObj = { render: () => <Days first={[1]} />, play: ({ canvasElement }) => freeze(canvasElement, 'button[data-day="2"],button[data-quick="6,7"]', 'is-focus') };
export const 누름:StoryObj = { render: () => <Days first={[1]} />, play: ({ canvasElement }) => freeze(canvasElement, 'button[data-day="2"],button[data-quick="6,7"]', 'is-pressed') };
