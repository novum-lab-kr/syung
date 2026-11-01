// 시각 고르기 스토리: 접힘 · 펼침(바퀴) · 빈 칸 · 포커스. 바퀴 칸 속은 화면과 같은 lib/time-wheel.mts 가 채운다
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createTimeWheel } from '../lib/time-wheel.mts';
import { freeze } from './story_states.mts';
import { TimeField } from './time_field.tsx';

const meta:Meta = { title: '컴포넌트/승차권/시각 고르기' };
export default meta;

function Field({ first = false, text = { ampm: '오전', clock: '8:00' } as { ampm:string; clock:string } | null }) {
  const [open, setOpen] = useState(first), box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && box.current) createTimeWheel(box.current, () => {}).show('08:00'); }, [open]);
  return <div ref={box} class="sb-paper ticket-page ticket-form"><TimeField open={open} text={text} value="08:00" onToggle={() => setOpen(!open)} onDone={() => setOpen(false)} /></div>;
}

export const 접힘:StoryObj = { render: () => <Field /> };
export const 펼침:StoryObj = { name: '펼침(바퀴)', render: () => <Field first /> };
export const 빈_칸:StoryObj = { name: '빈 칸', render: () => <Field text={null} /> };
export const 포커스:StoryObj = { render: () => <Field />, play: ({ canvasElement }) => freeze(canvasElement, '.tf-time', 'is-focus') };
export const 완료_누름:StoryObj = { name: '완료 단추 누름', render: () => <Field first />, play: ({ canvasElement }) => freeze(canvasElement, '.tw-ok', 'is-pressed') };
