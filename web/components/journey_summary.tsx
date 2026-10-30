// 길찾기 접힌 줄 둘: 결과 위 요약(출발 · 도착 · 시각 · 수정 — 누르면 다시 고치기)과 시트를 닫은 뒤 지도 아래 막대(걸리는 시간 · 도착 · 경로 띠 — 누르면 결과 다시 보기, ✕ 는 경로 지우기).
// props 만 받아 그린다. 막대 껍데기(.jbar · 숨기기)는 lib/journey-ui.mts 가 만들고 이 조각은 그 속만 그린다
import type { JourneyBarView, JourneySummaryView } from '../lib/journey-ui.mts';
import { Track } from './route_card.tsx';

const EDIT = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>;
const CLOSE = <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>;

export function JourneySummary({ hidden, summary, onOpen }:{ hidden:boolean; summary:JourneySummaryView | null; onOpen():void }) {
  return <button type="button" class="jsum" id="jSum" hidden={hidden} aria-label={summary?.aria} onClick={onOpen}>{summary && <>
    <span class="jsum-trip"><span class="jsum-end"><i class="jdot from"></i><b>{summary.from}</b></span><span class="jsum-end"><i class="jdot to"></i><b>{summary.to}</b></span></span>
    <span class="jsum-side"><span class="jsum-when">{summary.when}</span><span class="jsum-edit">{EDIT}수정</span></span>
  </>}</button>;
}

// bar: 아직 고른 경로가 없으면 null(막대는 숨어 있다)
export function JourneyBar({ bar, onOpen, onClear }:{ bar:JourneyBarView | null; onOpen():void; onClear():void }) {
  const duration = bar?.duration;
  return <>
    <button type="button" class="jbar-open" aria-label="경로 결과 다시 보기" onClick={onOpen}>{bar && <>
      <span class="jbar-top"><b>{duration!.hours !== null ? <>{`${duration!.hours}`}<small>시간</small>{` ${duration!.minutes}`}<small>분</small></> : <>{`${duration!.minutes}`}<small>분</small></>}</b><span>{`${bar.arrives} 도착`}</span></span>
      <Track segs={bar.track} />
    </>}</button>
    <button type="button" class="jbar-x" aria-label="경로 지우기" title="경로 지우기" onClick={onClear}>{CLOSE}</button>
  </>;
}
