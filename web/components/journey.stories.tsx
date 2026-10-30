// 길찾기 부품 스토리: 출발 · 도착 칸 · 장소 찾기 목록 · 출발 시각 고르기 · 접힌 요약 · 못 찾음 · 안내 글 · 아래 막대(기본 · 누름 · 포커스 · 비활성 · 빈 상태 · 긴 이름, 라이트/다크는 도구 막대)
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import type { DraftView, JourneyBarView, PlaceListView, StepHold } from '../lib/journey-ui.mts';
import { JourneyFields, JourneyPlaceList } from './journey_fields.tsx';
import { JourneyBar, JourneySummary } from './journey_summary.tsx';
import { JourneyWhen } from './journey_when.tsx';
import { RouteFailed, RouteNote } from './route_card.tsx';
import { SAMPLE_LONG, SAMPLE_PLAN } from './sample_plan.mts';
import { LONG_PLACES, SAMPLE_PLACES } from './sample_ticket.mts';
import { freeze } from './story_states.mts';

const meta:Meta = { title: '컴포넌트/길찾기' };
export default meta;

const noop = () => {};
const LONG_NAME = LONG_PLACES[0]!.name;
const NO_LIST:PlaceListView = { hidden: true, places: [], empty: null };

// 칸 + 목록(시트와 같은 차례 · 같은 바탕)
function Fields({ here = true, fromValue = '', toValue, list = NO_LIST }:{ here?:boolean; fromValue?:string; toValue?:string; list?:PlaceListView }) {
  return <div class="sb-paper"><div class="journey">
    <JourneyFields here={here} fromValue={fromValue} toValue={toValue} onTyped={noop} onHere={noop} onSwap={noop} />
    <JourneyPlaceList id="jFromList" label="출발지 찾기 결과" list={list} onPick={noop} />
  </div></div>;
}
export const 칸_내_위치:StoryObj = { name: '출발 · 도착 칸/내 위치 있음', render: () => <Fields fromValue="내 위치" /> };
export const 칸_위치_없음:StoryObj = { name: '출발 · 도착 칸/내 위치 없음(빈 칸)', render: () => <Fields here={false} /> };
export const 칸_고른_곳:StoryObj = { name: '출발 · 도착 칸/고른 곳', render: () => <Fields fromValue="강남역 2호선" toValue="교대역" /> };
export const 칸_긴_이름:StoryObj = { name: '출발 · 도착 칸/긴 이름', render: () => <Fields fromValue={LONG_NAME} toValue={LONG_NAME} /> };
export const 칸_포커스:StoryObj = { name: '출발 · 도착 칸/포커스', render: () => <Fields fromValue="내 위치" />, play: ({ canvasElement }) => freeze(canvasElement, '.jf', 'is-focus') };
export const 칸_바꾸기_누름:StoryObj = { name: '출발 · 도착 칸/바꾸기 누름', render: () => <Fields fromValue="내 위치" />, play: ({ canvasElement }) => freeze(canvasElement, '.jswap', 'is-pressed') };
export const 칸_바꾸기_포커스:StoryObj = { name: '출발 · 도착 칸/바꾸기 포커스', render: () => <Fields fromValue="내 위치" />, play: ({ canvasElement }) => freeze(canvasElement, '.jswap', 'is-focus') };
export const 칸_내_위치_포커스:StoryObj = { name: '출발 · 도착 칸/내 위치 포커스', render: () => <Fields fromValue="내 위치" />, play: ({ canvasElement }) => freeze(canvasElement, '.jf-here', 'is-focus') };
export const 목록:StoryObj = { name: '장소 찾기 목록/찾은 곳', render: () => <Fields fromValue="강남" list={{ hidden: false, places: SAMPLE_PLACES, empty: null }} /> };
export const 목록_없음:StoryObj = { name: '장소 찾기 목록/찾는 곳 없음(빈 상태)', render: () => <Fields fromValue="없는곳" list={{ hidden: false, places: [], empty: '찾는 곳이 없어요' }} /> };
export const 목록_실패:StoryObj = { name: '장소 찾기 목록/찾기 실패', render: () => <Fields fromValue="강남" list={{ hidden: false, places: [], empty: '검색하지 못했어요' }} /> };
export const 목록_긴_이름:StoryObj = { name: '장소 찾기 목록/긴 이름', render: () => <Fields fromValue="서울" list={{ hidden: false, places: LONG_PLACES, empty: null }} /> };
export const 목록_포커스:StoryObj = { name: '장소 찾기 목록/항목 포커스', render: () => <Fields fromValue="강남" list={{ hidden: false, places: SAMPLE_PLACES, empty: null }} />, play: ({ canvasElement }) => freeze(canvasElement, '.jf-list li:first-child button', 'is-focus') };

// 시각 고르기: 스토리에서는 단추를 누르면 한 칸만 움직인다(누르고 있기 되풀이는 화면 쪽 journey-ui)
const OFF = { h1: false, 'h-1': false, m1: false, 'm-1': false };
const DRAFT:DraftView = { hours: '08', minutes: '30', tomorrow: false, off: OFF };
const pad = (value:number) => String(value).padStart(2, '0');
function When({ open = false, text = '지금 출발', isSet = false, first = DRAFT }:{ open?:boolean; text?:string; isSet?:boolean; first?:DraftView }) {
  const [shown, setShown] = useState(open), [draft, setDraft] = useState(first);
  const move = (unit:'hours' | 'minutes', amount:number) => {
    const size = unit === 'hours' ? 24 : 60;
    setDraft({ ...draft, [unit]: pad((Number(draft[unit]) + amount + size) % size) });
  };
  const hold = (unit:'hours' | 'minutes', amount:number):StepHold => ({ down: noop, stop: noop, click: () => move(unit, amount) });
  return <div class="sb-paper"><div class="journey"><JourneyWhen text={text} isSet={isSet} open={shown} draft={draft}
    hold={{ h1: hold('hours', 1), 'h-1': hold('hours', -1), m1: hold('minutes', 1), 'm-1': hold('minutes', -1) }}
    onRow={() => setShown(!shown)} onNow={() => setShown(false)} onGo={() => setShown(false)} onDay={day => setDraft({ ...draft, tomorrow: day === 1 })} /></div></div>;
}
export const 시각_접힘:StoryObj = { name: '출발 시각/접힘(지금 출발)', render: () => <When /> };
export const 시각_고름:StoryObj = { name: '출발 시각/접힘(고른 시각)', render: () => <When text="오늘 08:30 출발" isSet /> };
export const 시각_펼침:StoryObj = { name: '출발 시각/펼침', render: () => <When open /> };
export const 시각_내일:StoryObj = { name: '출발 시각/펼침(내일)', render: () => <When open first={{ ...DRAFT, tomorrow: true }} /> };
export const 시각_비활성:StoryObj = { name: '출발 시각/더 못 가는 단추(비활성)', render: () => <When open first={{ ...DRAFT, off: { ...OFF, 'h-1': true, 'm-1': true } }} /> };
export const 시각_줄_포커스:StoryObj = { name: '출발 시각/줄 포커스', render: () => <When />, play: ({ canvasElement }) => freeze(canvasElement, '.jw-row', 'is-focus') };
export const 시각_단추_누름:StoryObj = { name: '출발 시각/단추 누름', render: () => <When open />, play: ({ canvasElement }) => freeze(canvasElement, '.jw-step[data-u=h][data-s="1"], .jw-go', 'is-pressed') };

// 접힌 요약: 결과가 나오면 입력 칸 자리에
function Summary({ from = '강남역 2호선', to = '교대역', when = '지금 출발' }:{ from?:string; to?:string; when?:string }) {
  return <div class="sb-paper"><div class="journey done"><JourneySummary hidden={false} summary={{ from, to, when, aria: `${from}에서 ${to}까지, ${when}. 눌러서 바꾸기` }} onOpen={noop} /></div></div>;
}
export const 요약:StoryObj = { name: '접힌 요약/기본', render: () => <Summary /> };
export const 요약_고른_시각:StoryObj = { name: '접힌 요약/고른 시각', render: () => <Summary when="내일 08:30 출발" /> };
export const 요약_긴_이름:StoryObj = { name: '접힌 요약/긴 이름', render: () => <Summary from={LONG_NAME} to={LONG_NAME} /> };
export const 요약_포커스:StoryObj = { name: '접힌 요약/포커스', render: () => <Summary />, play: ({ canvasElement }) => freeze(canvasElement, '.jsum', 'is-focus') };

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
