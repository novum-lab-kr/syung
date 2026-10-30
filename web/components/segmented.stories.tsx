// 세그먼트 탭 스토리: 길찾기 경로 종류(개수) · 오늘/내일. 누르면 고른 칸이 바뀐다
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Segmented } from './segmented.tsx';

const meta:Meta = { title: '컴포넌트/세그먼트 탭' };
export default meta;

const KINDS = [['all', '전체', 6], ['subway', '지하철', 3], ['bus', '버스', 1], ['mixed', '버스+지하철', 2]] as const;

function Kinds() {
  const [picked, setPicked] = useState('all');
  return <Segmented label="경로 종류" class="jkinds" attr="k" items={KINDS.map(([id, name, count]) => ({ id, name, count, pressed: id === picked }))} onPick={setPicked} />;
}
function Days() {
  const [picked, setPicked] = useState('0');
  return <Segmented label="날짜" class="jw-day" attr="d" items={[{ id: '0', name: '오늘', pressed: picked === '0' }, { id: '1', name: '내일', pressed: picked === '1' }]} onPick={setPicked} />;
}

export const 경로_종류:StoryObj = { name: '경로 종류', render: () => <div class="sb-paper"><Kinds /></div> };
export const 오늘_내일:StoryObj = { name: '오늘 · 내일', render: () => <div class="sb-paper sb-row"><Days /></div> };
