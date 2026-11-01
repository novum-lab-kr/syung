// 길찾기 접힌 줄 둘: 결과 위 요약(출발 · 도착 — 누르면 그 끝을 장소 검색으로 바꾼다)과 시트를 닫은 뒤 지도 아래 막대(걸리는 시간 · 도착 · 경로 띠 — 누르면 결과 다시 보기, ✕ 는 경로 지우기).
// props 만 받아 그린다. 막대 껍데기(.jbar · 숨기기)는 lib/journey-ui.mts 가 만들고 이 조각은 그 속만 그린다
import type { JourneyBarView, JourneySummaryView } from '../lib/journey-ui.mts';
import { Track } from './route_card.tsx';

const CLOSE = <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>;

const SWAP = <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/></svg>;

export function JourneySummary({ summary, onEnd, onSwap }:{ summary:JourneySummaryView | null; onEnd(which:'from' | 'to'):void; onSwap?():void }) {
  return <div class="jsum" id="jSum" role="group" aria-label={summary?.aria}>{summary && <span class="jsum-trip">
    <button type="button" class="jsum-end" aria-label={`출발 ${summary.from} 바꾸기`} onClick={() => onEnd('from')}><i class="jdot from"></i><b>{summary.from}</b></button>
    <button type="button" class="jsum-end" aria-label={`도착 ${summary.to} 바꾸기`} onClick={() => onEnd('to')}><i class="jdot to"></i><b>{summary.to}</b></button>
  </span>}{summary && onSwap && <button type="button" class="jsum-swap" id="jSwap" aria-label="출발지와 도착지 바꾸기" title="바꾸기" onClick={onSwap}>{SWAP}</button>}</div>;
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
