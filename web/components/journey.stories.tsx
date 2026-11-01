// 길찾기 부품 스토리: 출발 시각 고르기 · 접힌 요약 · 못 찾음 · 안내 글 · 아래 막대(기본 · 누름 · 포커스 · 비활성 · 빈 상태 · 긴 이름, 라이트/다크는 도구 막대)
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DraftView, JourneyBarView } from '../lib/journey-ui.mts';
import { createTimeWheel } from '../lib/time-wheel.mts';
import { JourneyBar, JourneySummary } from './journey_summary.tsx';
import { JourneyWhen } from './journey_when.tsx';
import { RouteFailed, RouteNote } from './route_card.tsx';
import { SAMPLE_LONG, SAMPLE_PLAN } from './sample_plan.mts';
import { LONG_PLACES } from './sample_ticket.mts';
import { freeze } from './story_states.mts';

const meta:Meta = { title: '컴포넌트/길찾기' };
export default meta;

const noop = () => {};
const LONG_NAME = LONG_PLACES[0]!.name;

// 시각 고르기: 바퀴 칸 속은 화면과 같은 lib/time-wheel.mts 가 채운다
const DRAFT:DraftView = { tomorrow: false };
function When({ open = false, text = '지금 출발', isSet = false, first = DRAFT }:{ open?:boolean; text?:string; isSet?:boolean; first?:DraftView }) {
  const [shown, setShown] = useState(open), [draft, setDraft] = useState(first), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wheel = box.current?.querySelector<HTMLElement>('#jWhenWheel');
    if (shown && wheel) createTimeWheel(wheel, noop).show('08:30');
  }, [shown]);
  return <div ref={box} class="sb-paper"><div class="journey"><JourneyWhen text={text} isSet={isSet} open={shown} draft={draft}
    onRow={() => setShown(!shown)} onNow={() => setShown(false)} onGo={() => setShown(false)} onDay={day => setDraft({ tomorrow: day === 1 })} /></div></div>;
}
export const 시각_접힘:StoryObj = { name: '출발 시각/접힘(지금 출발)', render: () => <When /> };
export const 시각_고름:StoryObj = { name: '출발 시각/접힘(고른 시각)', render: () => <When text="오늘 08:30 출발" isSet /> };
export const 시각_펼침:StoryObj = { name: '출발 시각/펼침(바퀴)', render: () => <When open /> };
export const 시각_내일:StoryObj = { name: '출발 시각/펼침(내일)', render: () => <When open first={{ tomorrow: true }} /> };
export const 시각_줄_포커스:StoryObj = { name: '출발 시각/줄 포커스', render: () => <When />, play: ({ canvasElement }) => freeze(canvasElement, '.jw-row', 'is-focus') };
export const 시각_단추_누름:StoryObj = { name: '출발 시각/이 시간에 출발 누름', render: () => <When open />, play: ({ canvasElement }) => freeze(canvasElement, '.jw-go', 'is-pressed') };

// 접힌 요약: 결과가 나오면 입력 칸 자리에
function Summary({ from = '강남역 2호선', to = '교대역', when = '지금 출발' }:{ from?:string; to?:string; when?:string }) {
  return <div class="sb-paper"><div class="journey done"><JourneySummary summary={{ from, to, when, aria: `${from}에서 ${to}까지, ${when}` }} onEnd={noop} onSwap={noop} /></div></div>;
}
export const 요약:StoryObj = { name: '접힌 요약/기본', render: () => <Summary /> };
export const 요약_고른_시각:StoryObj = { name: '접힌 요약/고른 시각', render: () => <Summary when="내일 08:30 출발" /> };
export const 요약_긴_이름:StoryObj = { name: '접힌 요약/긴 이름', render: () => <Summary from={LONG_NAME} to={LONG_NAME} /> };
export const 요약_포커스:StoryObj = { name: '접힌 요약/포커스', render: () => <Summary />, play: ({ canvasElement }) => freeze(canvasElement, '.jsum-end', 'is-focus') };

export const 못_찾음:StoryObj = { name: '못 찾음/기본', render: () => <div class="sb-paper"><div id="jResult"><RouteFailed message="출발지나 도착지를 바꿔 보세요." onRetry={noop} /></div></div> };
export const 못_찾음_누름:StoryObj = { name: '못 찾음/다시 찾기 누름', render: () => <div class="sb-paper"><div id="jResult"><RouteFailed message="연결이 불안정해요. 잠시 뒤 다시 찾아 주세요." onRetry={noop} /></div></div>, play: ({ canvasElement }) => freeze(canvasElement, '.jerr-retry', 'is-pressed') };
export const 안내_글:StoryObj = { name: '결과 아래 안내 글', render: () => <div class="sb-paper"><RouteNote /></div> };

// 아래 막대: 지도 위에 떠 있는 칸이라 자리를 잡아 준다
const BAR:JourneyBarView = { duration: SAMPLE_PLAN.duration, arrives: '08:40', track: SAMPLE_PLAN.track };
const LONG_BAR:JourneyBarView = { duration: SAMPLE_LONG.duration, arrives: '09:07', track: SAMPLE_LONG.track };
const Bar = ({ bar = BAR }:{ bar?:JourneyBarView }) => <div style="position:relative;height:120px"><div class="jbar"><JourneyBar bar={bar} onOpen={noop} onClear={noop} /></div></div>;
export const 막대:StoryObj = { name: '아래 막대/기본', render: () => <Bar /> };
export const 막대_한_시간_넘게:StoryObj = { name: '아래 막대/한 시간 넘게', render: () => <Bar bar={LONG_BAR} /> };
export const 막대_누름:StoryObj = { name: '아래 막대/누름', render: () => <Bar />, play: ({ canvasElement }) => freeze(canvasElement, '.jbar-open', 'is-pressed') };
export const 막대_포커스:StoryObj = { name: '아래 막대/포커스', render: () => <Bar />, play: ({ canvasElement }) => freeze(canvasElement, '.jbar-open, .jbar-x', 'is-focus') };
