// 길찾기 시트(아래 시트 몸통): 출발 · 도착 칸과 장소 찾기 목록, 출발 시각 고르기, 상태 글자, 결과(종류 탭 · 경로 카드 · 단계) · 찾는 중 · 못 찾음.
// 화면 조각(Preact)이라 그리기만 한다 — 상태 · 셈 · 찾기 요청 · 지도 표시는 lib/journey-ui.mts(JourneyView · JourneyActions), 시트 껍데기는 ui/sheet.mts.
// 표시(DOM 모양 · class · id · 문구 · aria)는 옛 HTML 글자와 같다: 스타일(syung.css)과 시트의 '.journey 가 있나' 검사가 그대로 맞는다.
// 출발 · 도착 입력칸은 사용자가 치는 칸이라 처음 값(defaultValue)만 준다 — 값 바꾸기는 journey-ui 가 옛것처럼 .value 로.
import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import type { JourneyActions, JourneyResultView, JourneyView, Place, PlaceListView, PlanView, StepHold, StepView, TrackSegView } from '../lib/journey-ui.mts';

const PIN = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/></svg>;
const SWAP = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/></svg>;
const WALK = <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="13" cy="4" r="2"/><path d="M10.2 7.6 7 9.4V13h2v-2.4l1.3-.7-1.6 8.1H11l1-4.3 2 2V21h2v-6.2l-2.1-2.1.6-3.1c1 1.3 2.5 2.1 4.2 2.2v-2c-1.4-.1-2.5-.9-3.1-2l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.6.1-.9.2z"/></svg>;
const CHEV = <svg class="jw-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>;
const UP = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>;
const DOWN = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>;
const CLOCK = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>;
const EDIT = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>;
const BUS = <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2zm0 3v5h14V6zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>;

// 장소 찾기 목록: 고를 곳들, 또는 빈 글자 한 줄
function PlaceList({ id, label, list, onPick }:{ id:string; label:string; list:PlaceListView; onPick:(place:Place)=>void }) {
  return <ul class="jf-list" id={id} aria-label={label} hidden={list.hidden}>
    {list.empty !== null
      ? <li class="jf-empty">{list.empty}</li>
      : list.places.map(place => <li><button type="button" onClick={() => onPick(place)}><b>{place.name}</b><small>{place.address}</small></button></li>)}
  </ul>;
}

// 시각 단추 하나: 누르면 한 칸, 누르고 있으면 되풀이(journey-ui 의 StepHold) · 길게 눌러도 고르기 · 메뉴가 뜨지 않게
function StepButton({ unit, step, label, off, hold, icon }:{ unit:string; step:number; label:string; off:boolean; hold:StepHold; icon:ComponentChildren }) {
  return <button type="button" class="jw-step" data-u={unit} data-s={String(step)} aria-label={label} disabled={off}
    onPointerDown={hold.down} onPointerUp={hold.stop} onPointerLeave={hold.stop} onPointerCancel={hold.stop} onClick={hold.click}
    onTouchStart={event => event.preventDefault()} onContextMenu={event => event.preventDefault()}>{icon}</button>;
}

function When({ view, actions }:{ view:JourneyView; actions:JourneyActions }) {
  const draft = view.draft, off = (key:string) => draft?.off[key] ?? false;
  return <div class="jopts jwhen">
    <button type="button" class={view.whenAt ? 'jw-row set' : 'jw-row'} id="jWhenRow" aria-expanded={view.whenOpen} aria-controls="jWhenPanel" onClick={actions.whenRow}>{CLOCK}<span id="jWhenText">{view.whenText}</span>{CHEV}</button>
    <div class="jw-panel" id="jWhenPanel" hidden={!view.whenOpen}>
      <div class="jw-head"><b>출발 시각</b><button type="button" class="jw-now" id="jWhenNow" onClick={actions.whenNow}>지금으로</button></div>
      <div class="segmented jw-day" role="group" aria-label="날짜">
        <button type="button" data-d="0" aria-pressed={!(draft?.tomorrow ?? false)} onClick={() => actions.day(0)}>오늘</button>
        <button type="button" data-d="1" aria-pressed={draft?.tomorrow ?? false} onClick={() => actions.day(1)}>내일</button>
      </div>
      <div class="jw-clock" aria-live="polite">
        <div class="jw-col"><StepButton unit="h" step={1} label="1시간 늦게" off={off('h1')} hold={actions.hold.h1!} icon={UP} /><output id="jWhenH">{draft?.hours ?? '00'}</output><StepButton unit="h" step={-1} label="1시간 이르게" off={off('h-1')} hold={actions.hold['h-1']!} icon={DOWN} /></div>
        <span class="jw-colon" aria-hidden="true">:</span>
        <div class="jw-col"><StepButton unit="m" step={1} label="1분 늦게" off={off('m1')} hold={actions.hold.m1!} icon={UP} /><output id="jWhenM">{draft?.minutes ?? '00'}</output><StepButton unit="m" step={-1} label="1분 이르게" off={off('m-1')} hold={actions.hold['m-1']!} icon={DOWN} /></div>
      </div>
      <button type="button" class="jw-go" id="jWhenGo" onClick={actions.whenGo}>이 시간에 출발</button>
    </div>
  </div>;
}

// 경로 띠(승차권 · 아래 막대의 HTML 글자 routeTrack 과 같은 그림)
function Track({ segs }:{ segs:TrackSegView[] }) {
  return <div class="jtrack" aria-hidden="true">{segs.map(seg => seg.k !== 'ride'
    ? <i class={`jseg ${seg.k}`} style={`flex:${seg.flex} 1 0`}></i>
    : <i class={seg.bus ? 'jseg ride bus' : 'jseg ride'} style={`flex:${seg.flex} 1 0;min-width:${seg.need}px;--c:${seg.color};--t:${seg.ink}`}>{seg.icon && BUS}{seg.label}</i>)}</div>;
}

function Step({ step }:{ step:StepView }) {
  if (step.kind === 'node') return <li class={`js node ${step.n}`} style={`--c:${step.color}`}><span class="js-t">{step.time}</span><span class="js-dot"></span><div class="js-b"><b>{step.name}</b>{step.sub !== null && <small>{step.sub}</small>}</div></li>;
  if (step.kind === 'walk') return <li class="js walk"><span class="js-t"></span><span class="js-rail"></span><div class="js-b"><small>{WALK}{step.text}</small></div></li>;
  return <li class="js ride" style={`--c:${step.color};--t:${step.ink}`}><span class="js-t"></span><span class="js-rail"></span><div class="js-b">
    <p><span class="js-chip">{step.bus && BUS}{step.chip}</span>{step.toward}</p>
    <small>{step.text}{step.live !== null && <span class="js-live">{step.live}</span>}</small></div></li>;
}

// 경로 카드는 누르는 칸(옛 HTML 그대로 article role=button — Preact 타입은 article 에 button 역할을 두지 않아 펼쳐 넣는다)
const CARD_ROLE:Record<string, string> = {role: 'button'};

function Card({ plan, index, on, hidden, actions }:{ plan:PlanView; index:number; on:boolean; hidden:boolean; actions:JourneyActions }) {
  const duration = plan.duration;
  return <article class={on ? 'jp on' : 'jp'} data-i={String(index)} tabIndex={0} {...CARD_ROLE} aria-label={plan.aria} aria-expanded={on} hidden={hidden}
    onClick={() => actions.card(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}>
    <div class="jp-top"><strong class="jp-min">{duration.hours !== null ? <>{`${duration.hours}`}<small>시간</small>{` ${duration.minutes}`}<small>분</small></> : <>{`${duration.minutes}`}<small>분</small></>}</strong><span class="jp-arr">{plan.arrive}</span>{plan.tag !== null && <span class="jp-tag">{plan.tag}</span>}</div>
    <Track segs={plan.track} />
    <p class="jp-meta">{plan.meta}{plan.live && <span class="jp-live">실시간</span>}</p>
    <ol class="jsteps">{plan.steps.map(step => <Step step={step} />)}</ol>
  </article>;
}

function Result({ result, actions }:{ result:JourneyResultView; actions:JourneyActions }) {
  if (result.kind === 'none') return null;
  if (result.kind === 'loading') return <div class="jload" aria-hidden="true">{[0, 1, 2].map(row => <div class="jsk"><i class="jsk-min"></i><div class="jsk-track">{row === 0 && <span class="jsk-run"><i></i></span>}</div><i class="jsk-meta"></i></div>)}</div>;
  if (result.kind === 'failed') return <div class="jerr"><b>경로를 찾지 못했어요</b><p>{result.message}</p><button type="button" class="jerr-retry" onClick={actions.retry}>다시 찾기</button></div>;
  return <>
    {result.tabs && <div class="segmented jkinds" role="group" aria-label="경로 종류">{result.tabs.map(tab => <button type="button" data-k={tab.kind} aria-pressed={tab.pressed} onClick={() => actions.tab(tab.kind)}>{tab.name}<b>{tab.count}</b></button>)}</div>}
    <div class="jplans">{result.cards.map((card, index) => <Card plan={card.plan} index={index} on={card.on} hidden={card.hidden} actions={actions} />)}</div>
    <p class="jp-note">경로를 누르면 지도에 보여요. 창을 닫아도 경로는 남아 있어요. 첫 열차는 실시간 위치로, 이후 열차는 배차 간격으로, 버스는 시간표로 계산한 예상 시간이에요.</p>
  </>;
}

export function JourneySheet({ view, actions }:{ view:JourneyView; actions:JourneyActions }) {
  const summary = view.summary;
  return <div class={view.done ? 'journey done' : 'journey'}>
    <h3>길찾기</h3>
    <button type="button" class="jsum" id="jSum" hidden={!view.done} aria-label={summary?.aria} onClick={actions.summary}>{summary && <>
      <span class="jsum-trip"><span class="jsum-end"><i class="jdot from"></i><b>{summary.from}</b></span><span class="jsum-end"><i class="jdot to"></i><b>{summary.to}</b></span></span>
      <span class="jsum-side"><span class="jsum-when">{summary.when}</span><span class="jsum-edit">{EDIT}수정</span></span>
    </>}</button>
    <div class="jcard">
      <div class="jf jrow"><i class="jdot from" aria-hidden="true"></i>
        <input id="jFrom" type="text" autocomplete="off" aria-label="출발지" placeholder="어디서 출발할까요?" defaultValue={view.here ? '내 위치' : ''} onInput={event => actions.typed('from', event.currentTarget.value)} />
        {view.here && <button type="button" class="jf-here" id="jHere" aria-label="내 위치에서 출발" title="내 위치" onClick={actions.here}>{PIN}</button>}</div>
      <div class="jf jrow"><i class="jdot to" aria-hidden="true"></i>
        <input id="jTo" type="text" autocomplete="off" aria-label="도착지" placeholder="어디로 갈까요?" onInput={event => actions.typed('to', event.currentTarget.value)} /></div>
      <button type="button" class="jswap" id="jSwap" aria-label="출발지와 도착지 바꾸기" title="바꾸기" onClick={actions.swap}>{SWAP}</button>
    </div>
    <PlaceList id="jFromList" label="출발지 찾기 결과" list={view.lists.from} onPick={place => actions.place('from', place)} />
    <PlaceList id="jToList" label="도착지 찾기 결과" list={view.lists.to} onPick={place => actions.place('to', place)} />
    <When view={view} actions={actions} />
    <div class={view.status.sr ? 'jf-status sr' : 'jf-status'} id="jStatus" role="status" aria-live="polite">{view.status.text}</div>
    <div id="jResult"><Result result={view.result} actions={actions} /></div>
  </div>;
}

// 시트 몸통에 그리기 · 다시 그리기(같은 몸통이면 Preact 가 바뀐 곳만 고친다) · 치우기
export const drawJourney = (body:HTMLElement, view:JourneyView, actions:JourneyActions):void => render(<JourneySheet view={view} actions={actions} />, body);
export const clearJourney = (body:HTMLElement):void => render(null, body);
