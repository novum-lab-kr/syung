// 입력 칸 스토리: 글자 칸
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { focusFirst } from './story_state.mts';
import { TextField } from './text_field.tsx';

const meta:Meta = { title: '컴포넌트/입력 칸' };
export default meta;

function Count({ start = '', disabled = false }:{ start?:string; disabled?:boolean }) {
  const [value, setValue] = useState(start), count = [...value.trim()].length;
  return <TextField id="storyName" class="pf-in" label="닉네임" value={value} disabled={disabled} count={`${count}/12`} countId="storyCount" over={count > 12} onInput={setValue} />;
}
export const 글자칸:StoryObj = {
  name: '글자 칸 · 상태',
  render: () => <div class="sb-paper">
    <p class="sb-note">기본</p><Count start="슝이" />
    <p class="sb-note">빈 칸</p><Count />
    <p class="sb-note">포커스</p><div ref={focusFirst}><Count start="슝이" /></div>
    <p class="sb-note">비활성(저장 중)</p><Count start="슝이" disabled />
    <p class="sb-note">글자 수 넘침</p><Count start="이름이 아주 아주 아주 긴 사람입니다" />
  </div>,
};
