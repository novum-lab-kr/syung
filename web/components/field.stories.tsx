// 입력 칸 스토리: 역 검색 칸 · 결과 목록 · 글자 칸
import type { Meta, StoryObj } from '@storybook/preact-vite';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { SearchField, SearchList } from './search_field.tsx';
import type { SearchHit } from './search_field.tsx';
import { focusFirst } from './story_state.mts';
import { TextField } from './text_field.tsx';

const meta:Meta = { title: '컴포넌트/입력 칸' };
export default meta;

const LINE2 = { name: '2호선', color: '#00a84d' }, LINE3 = { name: '3호선', color: '#ef7c1c' }, NEW = { name: '신분당', color: '#d4003b' };
const HITS:SearchHit[] = [{ name: '강남', lines: [LINE2, NEW] }, { name: '강남구청', lines: [LINE3] }, { name: '강남대', lines: [NEW] }];
const Stage = ({ children }:{ children:ComponentChildren }) => <div class="sb-stage sb-stage-map">{children}</div>;

export const 검색_기본:StoryObj = { name: '검색 칸 · 기본', render: () => <Stage><SearchField /></Stage> };
export const 검색_포커스:StoryObj = { name: '검색 칸 · 포커스', render: () => <div ref={focusFirst}><Stage><SearchField /></Stage></div> };
export const 검색_비활성:StoryObj = { name: '검색 칸 · 비활성', render: () => <Stage><SearchField disabled /></Stage> };
export const 검색_결과:StoryObj = { name: '검색 칸 · 결과', render: () => <Stage><SearchField value="강남" expanded><SearchList hits={HITS} /></SearchField></Stage> };
export const 검색_고른줄:StoryObj = { name: '검색 칸 · 방향키로 고른 줄', render: () => <Stage><SearchField value="강남" expanded><SearchList hits={HITS} marked={1} /></SearchField></Stage> };
export const 검색_빈결과:StoryObj = { name: '검색 칸 · 찾는 역 없음', render: () => <Stage><SearchField value="없는역" expanded><SearchList hits={[]} /></SearchField></Stage> };
export const 검색_긴이름:StoryObj = { name: '검색 칸 · 긴 이름', render: () => <Stage><SearchField value="동대문" expanded><SearchList hits={[{ name: '동대문역사문화공원', lines: [LINE2, LINE3, NEW, { name: '우이신설선', color: '#b0ce18' }] }]} /></SearchField></Stage> };

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
