// 장소 칸 · 장소 검색 결과 목록 스토리: 빈 칸 · 고른 곳 · 글자 치는 중 · 결과 · 결과 없음 · 찾기 실패 · 내 위치 누름 · 포커스 · 긴 이름
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { PlaceField, PlaceResults } from './place_field.tsx';
import type { PlaceRow } from './place_field.tsx';
import { LONG_PLACES, SAMPLE_PLACES } from './sample_ticket.mts';
import { freeze } from './story_states.mts';

const meta:Meta = { title: '컴포넌트/승차권/장소 칸' };
export default meta;

function Fields({ first = '', rows, second = '' }:{ first?:string; second?:string; rows?:PlaceRow[] | string }) {
  const [value, setValue] = useState(first);
  const noop = () => {};
  return <div class="sb-paper ticket-page"><div class="tf-route"><div class="tf-pls">
    <PlaceField id="sbFrom" head="출발" name="출발지" placeholder="출발지 고르기" value={value} listHidden={rows === undefined} rows={rows ?? []} onFocus={noop} onInput={setValue} onPick={noop} onLeave={noop} onHere={noop} onCloseList={noop} />
    <PlaceField id="sbTo" head="도착" name="도착지" placeholder="도착지 고르기" to value={second} listHidden rows={[]} onFocus={noop} onInput={noop} onPick={noop} onLeave={noop} onHere={noop} onCloseList={noop} />
  </div></div></div>;
}

export const 빈_칸:StoryObj = { name: '빈 칸', render: () => <Fields /> };
export const 고른_곳:StoryObj = { name: '고른 곳', render: () => <Fields first="강남역 2호선" second="교대역" /> };
export const 결과:StoryObj = { name: '검색 결과 목록', render: () => <Fields first="강남" rows={SAMPLE_PLACES} /> };
export const 결과_없음:StoryObj = { name: '결과 없음(빈 상태)', render: () => <Fields first="없는곳" rows="찾는 곳이 없어요" /> };
export const 찾기_실패:StoryObj = { name: '찾기 실패', render: () => <Fields first="강남" rows="검색하지 못했어요" /> };
export const 긴_이름:StoryObj = { name: '긴 이름', render: () => <Fields first={LONG_PLACES[0]!.name} rows={LONG_PLACES} /> };
export const 포커스:StoryObj = { render: () => <Fields />, play: ({ canvasElement }) => freeze(canvasElement, '.tf-pl:first-of-type', 'is-focus') };
export const 내_위치_포커스:StoryObj = { name: '내 위치 단추 포커스', render: () => <Fields />, play: ({ canvasElement }) => freeze(canvasElement, '.tf-here', 'is-focus') };
export const 목록만:StoryObj = { name: '목록만', render: () => <div class="sb-paper ticket-page"><PlaceResults id="sbList" label="찾기 결과" hidden={false} rows={SAMPLE_PLACES} onPick={() => {}} /></div> };
export const 목록_항목_포커스:StoryObj = { name: '목록 항목 포커스', render: () => <div class="sb-paper ticket-page"><PlaceResults id="sbList" label="찾기 결과" hidden={false} rows={SAMPLE_PLACES} onPick={() => {}} /></div>, play: ({ canvasElement }) => freeze(canvasElement, 'li:first-child button', 'is-focus') };
