// 저장 단추 스토리: 기본 · 누름 · 포커스 · 비활성(경로를 아직 안 고름) · 불러오는 중 · 이 경로로
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { SaveButton } from './save_button.tsx';
import { freeze } from './story_states.mts';

const meta:Meta = { title: '컴포넌트/승차권/저장 단추' };
export default meta;

const Save = ({ disabled = false, text = '발권하기' }) => <div class="sb-paper ticket-page ticket-form"><SaveButton id="sbSave" disabled={disabled}>{text}</SaveButton></div>;

export const 기본:StoryObj = { render: () => <Save /> };
export const 누름:StoryObj = { render: () => <Save />, play: ({ canvasElement }) => freeze(canvasElement, '.tf-save', 'is-pressed') };
export const 포커스:StoryObj = { render: () => <Save />, play: ({ canvasElement }) => freeze(canvasElement, '.tf-save', 'is-focus') };
export const 비활성:StoryObj = { render: () => <Save disabled /> };
export const 불러오는_중:StoryObj = { name: '불러오는 중', render: () => <Save disabled text="발권하는 중…" /> };
export const 이_경로로:StoryObj = { name: '이 경로로', render: () => <Save text="이 경로로" /> };
