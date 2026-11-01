// 06 검색 합치기의 열두 화면: 실제 시트(web/ui/journey_sheet.tsx)에 고정 자료를 넣어 폰 폭으로 그린다. 부품 · 상태 모양은 화면과 같다.
// 역 줄은 조립 화면과 같은 「강남」 결과, 장소 줄은 운영 /api/place?q=강남(2026-11-01)의 앞 네 곳, 경로는 tools/flows/fixtures/route.json.
// 지도 자리는 정적 바탕이다 — 실제 지도 위 모습은 docs/flows/06-search-merge.md 의 캡처, 마커 움직임은 스토리 컴포넌트/슝 마커.
import type { Meta, StoryObj } from '@storybook/preact-vite';
import type { JourneyResultView, JourneyView } from '../web/lib/journey-ui.mts';
import type { PlaceHit } from '../web/lib/place-search.mts';
import { createTimeWheel } from '../web/lib/time-wheel.mts';
import { SheetFrame } from '../web/components/sheet_frame.tsx';
import { JourneySheet } from '../web/ui/journey_sheet.tsx';
import { Drawer, EMPTY_JOURNEY, FOUND_JOURNEY, JOURNEY_ACTIONS, JOURNEY_PLANS, JourneyScreen, MapApp, SEARCH_HITS, TicketPage } from './assembled.tsx';
import { PhoneScreen, type AssembledScreen } from './phone.tsx';
import './flows.css';

const MY_PLACE = '내 위치', QUERY = '강남', STATION = '강남역';
const STATION_HIT = SEARCH_HITS[0]!;
const PLACE_HIT:PlaceHit = { name: '양재천', address: '서울 강남구 도곡동', lat: 37.4839, lng: 127.0483 };
// 역과 장소를 나누지 않는 한 목록. 차례는 역 검색의 순서(이름이 같을수록 앞) 뒤에 운영 /api/place?q=강남 의 앞쪽 장소
const HITS:PlaceHit[] = [
  ...SEARCH_HITS,
  { name: '서울선릉과정릉', address: '서울 강남구 선릉로100길 1', lat: 37.5088, lng: 127.0489 },
  { name: '압구정로데오거리', address: '서울 강남구 신사동 668-33', lat: 37.5269, lng: 127.0389 },
  { name: '대치동학원가', address: '서울 강남구 대치동 1026', lat: 37.4946, lng: 127.0626 },
  PLACE_HIT,
];
const SEARCH = EMPTY_JOURNEY.search;
const FOUND:JourneyView = { ...EMPTY_JOURNEY, search: { ...SEARCH, query: QUERY, hits: HITS } };
const picked = (hit:PlaceHit):JourneyView => ({ ...EMPTY_JOURNEY, stage: 'picked', picked: hit });
const finding = (title:string, which:'from' | 'to'):JourneyView => ({ ...EMPTY_JOURNEY, search: { ...SEARCH, title, fixed: { which, name: STATION } } });

const PLAN_RESULT = FOUND_JOURNEY.result as Extract<JourneyResultView, { kind:'plans' }>;
// 조립 화면의 고정 경로를 쓰되 출발 · 도착 이름만 이 흐름의 것으로
const CARDS = PLAN_RESULT.cards.map(card => ({ ...card, plan: { ...card.plan, steps: card.plan.steps.map(step => step.kind === 'place' ? { ...step, name: step.at === 'start' ? MY_PLACE : STATION } : step) } }));
const ROUTE:JourneyView = { ...FOUND_JOURNEY, summary: { from: MY_PLACE, to: STATION, when: '지금 출발', aria: `${MY_PLACE}에서 ${STATION}까지, 지금 출발` }, result: { ...PLAN_RESULT, cards: CARDS } };

const focusInput = (doc:Document) => doc.querySelector<HTMLInputElement>('#placeInput')?.focus({ preventScroll: true });
// 바퀴 칸 속은 화면과 같은 lib/time-wheel.mts 가 채운다
const fillWheel = (doc:Document) => { const wheel = doc.querySelector<HTMLElement>('#jWhenWheel'); if (wheel) createTimeWheel(wheel, () => {}).show('08:10'); };
const showTicketButton = (doc:Document) => doc.querySelector('.jp-ticket')?.scrollIntoView({ block: 'center' });
const sheet = (view:JourneyView, prepare?:(doc:Document)=>void):AssembledScreen => ({ draw: () => <JourneyScreen view={view} />, ...(prepare ? { prepare } : {}) });

const SCREENS:{ title:string; screen:AssembledScreen }[] = [
  { title: '1. 지도 첫 화면(위쪽 검색창 없음)', screen: { draw: () => <MapApp /> } },
  { title: '2. 모달: 내 위치로 이동 + 장소 검색', screen: sheet(EMPTY_JOURNEY, focusInput) },
  { title: '3. 모달 안 검색 결과(역 · 장소 한 목록)', screen: sheet(FOUND) },
  { title: '4. 역을 고름: 슝 마커 + 작은 시트 · 곧 오는 열차', screen: sheet(picked(STATION_HIT)) },
  { title: '5. 장소를 고름: 슝 마커 + 작은 시트', screen: sheet(picked(PLACE_HIT)) },
  { title: '6. 뒤로: 마커 · 시트 닫고 검색어 · 결과 그대로', screen: sheet(FOUND) },
  { title: '7. 도착을 고름: 출발은 내 위치, 지금 출발로 경로 결과', screen: sheet(ROUTE) },
  { title: '8. 「지금 출발」을 누르면 발권 화면과 같은 시각 바퀴', screen: sheet({ ...ROUTE, whenOpen: true, draft: { tomorrow: false } }, fillWheel) },
  { title: '9. 펼친 경로 카드 맨 아래 「승차권 등록」', screen: sheet(ROUTE, showTicketButton) },
  { title: '10. 경로 목록 위에 기존 발권 화면이 채워진 채 열림(닫으면 목록 그대로)', screen: { draw: () => <>
    <Drawer title="승차권 발권"><TicketPage from={MY_PLACE} to={STATION} route={JOURNEY_PLANS[0]!} /></Drawer>
    <section class="sheet open" aria-label="상세 정보"><SheetFrame><JourneySheet view={ROUTE} actions={JOURNEY_ACTIONS} /></SheetFrame></section>
  </> } },
  { title: '11. 출발을 고름: 도착을 같은 방식으로 찾기', screen: sheet(finding('어디로 갈까요?', 'from'), focusInput) },
  { title: '12. 내 위치를 못 쓸 때: 보던 자리에서 출발 찾기', screen: sheet(finding('어디서 출발할까요?', 'to'), focusInput) },
];

const meta:Meta = { title: '화면 흐름/06 검색 합치기 화면', parameters: { layout: 'fullscreen' } };
export default meta;

const story = (index:number):StoryObj => ({ name: SCREENS[index]!.title, render: () => <PhoneScreen screen={SCREENS[index]!.screen} title={SCREENS[index]!.title} /> });
export const screen1 = story(0);
export const screen2 = story(1);
export const screen3 = story(2);
export const screen4 = story(3);
export const screen5 = story(4);
export const screen6 = story(5);
export const screen7 = story(6);
export const screen8 = story(7);
export const screen9 = story(8);
export const screen10 = story(9);
export const screen11 = story(10);
export const screen12 = story(11);
