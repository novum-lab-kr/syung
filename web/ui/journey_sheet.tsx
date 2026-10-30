// 길찾기 시트(아래 시트 몸통): 출발 · 도착 칸과 장소 찾기 목록, 출발 시각 고르기, 상태 글자, 결과(종류 탭 · 경로 카드 · 단계) · 찾는 중 · 못 찾음.
// 화면 조각(Preact)이라 그리기만 한다 — 상태 · 셈 · 찾기 요청 · 지도 표시는 lib/journey-ui.mts(JourneyView · JourneyActions), 시트 껍데기는 ui/sheet.mts.
// 표시(DOM 모양 · class · id · 문구 · aria)는 옛 HTML 글자와 같다: 스타일(syung.css)과 시트의 '.journey 가 있나' 검사가 그대로 맞는다.
// 부품은 모두 components/(스토리북에 같은 모양) — 이 파일은 그릴 거리를 부품에 나눠 주고 차례대로 놓기만 한다
import { render } from 'preact';
import type { JourneyActions, JourneyBarActions, JourneyBarView, JourneyResultView, JourneyView } from '../lib/journey-ui.mts';
import { JourneyFields, JourneyPlaceList } from '../components/journey_fields.tsx';
import { JourneyBar, JourneySummary } from '../components/journey_summary.tsx';
import { JourneyWhen } from '../components/journey_when.tsx';
import { RouteCard, RouteFailed, RouteLoading, RouteNote } from '../components/route_card.tsx';
import { Segmented } from '../components/segmented.tsx';

function Result({ result, actions }:{ result:JourneyResultView; actions:JourneyActions }) {
  if (result.kind === 'none') return null;
  if (result.kind === 'loading') return <RouteLoading />;
  if (result.kind === 'failed') return <RouteFailed message={result.message} onRetry={actions.retry} />;
  return <>
    {result.tabs && <Segmented label="경로 종류" class="jkinds" attr="k" items={result.tabs.map(tab => ({ id: tab.kind, name: tab.name, count: tab.count, pressed: tab.pressed }))} onPick={kind => actions.tab(kind)} />}
    <div class="jplans">{result.cards.map((card, index) => <RouteCard plan={card.plan} index={index} on={card.on} hidden={card.hidden} onPick={pick => actions.card(pick)} />)}</div>
    <RouteNote />
  </>;
}

export function JourneySheet({ view, actions }:{ view:JourneyView; actions:JourneyActions }) {
  return <div class={view.done ? 'journey done' : 'journey'}>
    <h3>길찾기</h3>
    <JourneySummary hidden={!view.done} summary={view.summary} onOpen={actions.summary} />
    <JourneyFields here={view.here} fromValue={view.here ? '내 위치' : ''} onTyped={actions.typed} onHere={actions.here} onSwap={actions.swap} />
    <JourneyPlaceList id="jFromList" label="출발지 찾기 결과" list={view.lists.from} onPick={place => actions.place('from', place)} />
    <JourneyPlaceList id="jToList" label="도착지 찾기 결과" list={view.lists.to} onPick={place => actions.place('to', place)} />
    <JourneyWhen text={view.whenText} isSet={view.whenAt} open={view.whenOpen} draft={view.draft} hold={actions.hold} onRow={actions.whenRow} onNow={actions.whenNow} onGo={actions.whenGo} onDay={actions.day} />
    <div class={view.status.sr ? 'jf-status sr' : 'jf-status'} id="jStatus" role="status" aria-live="polite">{view.status.text}</div>
    <div id="jResult"><Result result={view.result} actions={actions} /></div>
  </div>;
}

// 시트 몸통에 그리기 · 다시 그리기(같은 몸통이면 Preact 가 바뀐 곳만 고친다) · 치우기
export const drawJourney = (body:HTMLElement, view:JourneyView, actions:JourneyActions):void => render(<JourneySheet view={view} actions={actions} />, body);
export const clearJourney = (body:HTMLElement):void => render(null, body);
// 시트를 닫은 뒤 지도 아래 막대의 속(껍데기 .jbar 는 journey-ui 가 만든다)
export const drawJourneyBar = (host:HTMLElement, bar:JourneyBarView | null, actions:JourneyBarActions):void => render(<JourneyBar bar={bar} onOpen={actions.open} onClear={actions.clear} />, host);
