// 장소 검색 부품 스토리: 입력칸 · 역과 장소 한 목록 · 빈 상태 · 고른 뒤 작은 시트 · 한쪽이 정해진 칸. 부품은 web/components/place_search.tsx
import type { Meta, StoryObj } from '@storybook/preact-vite';
import type { ComponentChildren } from 'preact';
import { PlaceEmpty, PlaceEndsCard, PlaceHereRow, PlaceList, PlacePickedSheet, PlaceSearchField } from '../web/components/place_search.tsx';
import type { PlaceHit } from '../web/lib/place-search.mts';
import { SEARCH_HITS } from './assembled.tsx';

const STATION = SEARCH_HITS[0]!;
const PLACE:PlaceHit = { name: '양재천', address: '서울 강남구 도곡동', lat: 37.4839, lng: 127.0483 };
const HITS:PlaceHit[] = [STATION, SEARCH_HITS[2]!, { name: '서울선릉과정릉', address: '서울 강남구 선릉로100길 1', lat: 37.5088, lng: 127.0489 }, PLACE];
const noop = () => {};
const box = (children:ComponentChildren) => <div style={{ width: '358px', padding: '16px', background: 'var(--paper)' }}>{children}</div>;

const meta:Meta = { title: '컴포넌트/장소 검색' };
export default meta;
export const field:StoryObj = { name: '입력칸', render: () => box(<div class="ps"><PlaceSearchField /><PlaceSearchField value="강남" /></div>) };
export const rows:StoryObj = { name: '결과 줄(역 · 장소 한 목록)', render: () => box(<PlaceList hits={HITS} query="강남" />) };
export const hereRow:StoryObj = { name: '출발을 다시 찾을 때(맨 위 내 위치)', render: () => box(<PlaceList hits={HITS} query="강남" here={<PlaceHereRow onPick={noop} />} />) };
export const emptyStart:StoryObj = { name: '빈 상태: 적기 전', render: () => box(<PlaceEmpty />) };
export const emptyNone:StoryObj = { name: '빈 상태: 못 찾음', render: () => box(<PlaceEmpty query="슝슝역" />) };
export const emptyFailed:StoryObj = { name: '빈 상태: 찾기 실패', render: () => box(<PlaceEmpty query="강남" failed />) };
export const pickedStation:StoryObj = { name: '작은 시트: 역', render: () => box(<PlacePickedSheet hit={STATION} />) };
export const pickedPlace:StoryObj = { name: '작은 시트: 장소', render: () => box(<PlacePickedSheet hit={PLACE} />) };
export const ends:StoryObj = { name: '한쪽이 정해진 칸', render: () => box(<PlaceEndsCard fixed="from" fixedName="강남역" />) };
