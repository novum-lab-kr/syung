// 단계 목록 스토리: 시각 있음 · 시각 없음(승차권처럼) — 세로선 · 동그라미 · 환승 점선 · 버스 칩('외 N대' · 옆 정류장)
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { StepList } from './step_list.tsx';
import { SAMPLE_STEPS } from './sample_plan.mts';
import type { StepView } from '../lib/journey-ui.mts';

const meta:Meta = { title: '컴포넌트/단계 목록' };
export default meta;

const untimed = SAMPLE_STEPS.map(step => 'time' in step ? { ...step, time: null } : step) as StepView[];

export const 시각_있음:StoryObj = { name: '시각 있음', render: () => <div class="sb-paper"><StepList steps={SAMPLE_STEPS} className="jsteps shown" /></div> };
// 승차권 뒷면 · 경로 고르기처럼 시각이 없으면 시각 칸을 뺀다(바탕은 펼친 칸 --control)
export const 시각_없음:StoryObj = { name: '시각 없음', render: () => <div class="sb-paper"><div class="tk-steps"><StepList steps={untimed} className="jsteps shown" /></div></div> };
