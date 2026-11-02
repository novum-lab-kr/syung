// 장소 검색 부품: 입력칸 · 역과 장소 한 목록 · 빈 상태 · 고른 뒤 작은 시트 · 한쪽이 정해진 칸. props 만 받아 그린다 — 상태 · 찾기는 lib/journey-ui.mts, 합치기 셈은 lib/place-search.mts.
// 모양 근거: 발권 화면 장소 칸(.tf-route), 「어디로 갈까요?」 단추(.route-cta), 역 시트(.st-journey), 노선 칩. 스타일은 syung.css .ps-*
import type { ComponentChildren } from 'preact';
import { distanceText, inkOn, type PlaceHit } from '../lib/place-search.mts';
import { startWhereMotion } from '../lib/where_motion.mts';

const SEARCH = <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>;
const CLEAR = <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>;
const PIN = <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>;
const TRAIN = <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="14" rx="3.5"/><path d="M5 11h14M9 21l2-3.5M15 21l-2-3.5"/><path d="M9 14.5h.01M15 14.5h.01"/></svg>;
const HERE = <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.500v3M2.500 12h3M18.500 12h3"/></svg>;

export const PLACE_SEARCH_LABEL = '장소 검색';
const noop = () => {};

export interface PlaceSearchFieldProps { value?:string; label?:string; onInput?:(text:string)=>void; onClear?:()=>void; onEnter?:()=>void }
export function PlaceSearchField({ value = '', label = PLACE_SEARCH_LABEL, onInput = noop, onClear = noop, onEnter = noop }:PlaceSearchFieldProps) {
  return <div class="ps-field">{SEARCH}<input id="placeInput" type="text" autocomplete="off" aria-label={label} enterkeyhint="go" placeholder={PLACE_SEARCH_LABEL} value={value} onInput={event => onInput(event.currentTarget.value)}
    onKeyDown={event => { if (event.key === 'Enter' && !event.isComposing) onEnter(); }} />
    {value && <button type="button" class="ps-clear" aria-label="지우기" onClick={onClear}>{CLEAR}</button>}</div>;
}

// 찾은 글자에 형광펜(「강남역」으로 찾아도 「강남」에). 역과 장소는 묶지 않고 그림 칸과 노선 칩으로만 구분한다
function Marked({ name, query }:{ name:string; query:string }) {
  const wanted = name.includes(query) ? query : query.replace(/역$/, ''), at = wanted ? name.indexOf(wanted) : -1;
  if (at < 0) return <b>{name}</b>;
  return <b>{name.slice(0, at)}<mark>{wanted}</mark>{name.slice(at + wanted.length)}</b>;
}
const Chips = ({ hit }:{ hit:PlaceHit }) => <span class="ps-chips">{hit.lines!.map(line => <i style={`--c:${line.color};--t:${inkOn(line.color)}`}>{line.name}</i>)}</span>;
export const PlaceRow = ({ hit, query, onPick = noop }:{ hit:PlaceHit; query:string; onPick?:(hit:PlaceHit)=>void }) =>
  <button type="button" class="ps-row" onClick={() => onPick(hit)}><span class={hit.lines ? 'ps-tile station' : 'ps-tile'}>{hit.lines ? TRAIN : PIN}</span>
    <span class="ps-text"><Marked name={hit.name} query={query} />{hit.lines ? <Chips hit={hit} /> : <small>{[hit.address, hit.metres === undefined ? '' : distanceText(hit.metres)].filter(Boolean).join(' · ')}</small>}</span></button>;
export const PlaceList = ({ hits, query, onPick, here }:{ hits:PlaceHit[]; query:string; onPick?:(hit:PlaceHit)=>void; here?:ComponentChildren }) =>
  <ul class="ps-list" aria-label="찾은 곳">{here && <li>{here}</li>}{hits.map(hit => <li><PlaceRow hit={hit} query={query} {...(onPick ? {onPick} : {})} /></li>)}</ul>;
// 출발을 다시 찾을 때 맨 위 한 줄: 내 위치로 되돌리기
export const PlaceHereRow = ({ onPick }:{ onPick():void }) =>
  <button type="button" class="ps-row" onClick={onPick}><span class="ps-tile">{HERE}</span><span class="ps-text"><b>내 위치</b></span></button>;

// 처음 안내의 로고: 멈춘 로고 자리에 로그인과 같은 「타고 가는」 움직임을 얹는다(lib/where_motion.mts). 칸이 생기고 없어질 때만 불리도록 ref 는 고정 함수
const LOGO = <img src="./brand/syung-light.svg" alt="" width={47} height={47} />;
let stopMotion:(()=>void) | null = null;
const motionRef = (box:HTMLDivElement | null) => {
  stopMotion?.();
  stopMotion = box ? startWhereMotion(box) : null;
};

// 빈 상태: 아직 안 적음 · 못 찾음 · 찾기 실패
export const PlaceEmpty = ({ query, failed = false, onRetry }:{ query?:string; failed?:boolean; onRetry?:()=>void }) => <div class="ps-empty">
  {!failed && !query ? <><div class="ps-logo">{LOGO}</div><div class="ps-motion-clip" aria-hidden="true"><div class="login-motion ps-motion" ref={motionRef}></div></div></> : LOGO}
  {failed && <><b>검색하지 못했어요</b><small>잠시 뒤 다시 찾아 보세요</small>{onRetry && <button type="button" class="ps-retry" onClick={onRetry}>다시 찾기</button>}</>}
  {!failed && query && <><b>찾는 곳이 없어요</b><small>「{query}」 대신 다른 이름으로 찾아 보세요</small></>}
  {!failed && !query && <><b>어디든 슝!</b><small>가는 길은 슝이 함께해요</small></>}
</div>;

// 장소는 두 글자부터 묻는다: 한 글자에 「없어요」라고 하지 않고 처음 안내를 둔다
const MIN_ASK = 2;
export interface PlaceSearchProps { title?:string; query?:string; hits?:PlaceHit[]; failed?:boolean; pending?:boolean; notice?:string; onPick?:(hit:PlaceHit)=>void; onRetry?:()=>void; here?:ComponentChildren; children?:ComponentChildren }
export const PlaceSearch = ({ title = '어디로 갈까요?', query = '', hits = [], failed = false, pending = false, notice = '', onPick, onRetry, here, children }:PlaceSearchProps) => {
  const wanted = query.trim(), listed = hits.length > 0 || !!here;
  return <div class="ps">
    <h3 class="ps-title">{title}</h3>
    <div class="ps-stick">{children ?? <PlaceSearchField value={query} />}</div>
    {notice && <p class="ps-notice" role="alert">{notice}</p>}
    {listed && <PlaceList hits={hits} query={wanted} here={here} {...(onPick ? {onPick} : {})} />}
    {pending && <p class="ps-pending" role="status">장소를 찾고 있어요</p>}
    {listed && failed && <p class="ps-failed" role="status">장소를 찾지 못했어요{onRetry && <button type="button" class="ps-retry" onClick={onRetry}>다시 찾기</button>}</p>}
    {!listed && !pending && <PlaceEmpty failed={failed} {...(wanted.length >= MIN_ASK ? {query: wanted} : {})} {...(onRetry ? {onRetry} : {})} />}
  </div>;
};

export interface PlacePickedSheetProps { hit:PlaceHit; notice?:string; onEnd?:(which:'from' | 'to')=>void; onArrivals?:()=>void }
// 고른 뒤 작은 시트: 역이든 장소든 같은 모양. 역은 주소 없이 노선 칩과 「곧 오는 열차」
export const PlacePickedSheet = ({ hit, notice = '', onEnd = noop, onArrivals = noop }:PlacePickedSheetProps) => <div class="ps-picked">
  <h3>{hit.name}</h3>
  {hit.lines ? <Chips hit={hit} /> : hit.address && <p>{hit.address}</p>}
  {notice && <p class="ps-notice" role="alert">{notice}</p>}
  {hit.lines && <button type="button" class="ps-arrivals" onClick={onArrivals}>곧 오는 열차</button>}
  <div class="ps-ends"><button type="button" data-end="from" onClick={() => onEnd('from')}>여기서 출발</button><button type="button" class="to" data-end="to" onClick={() => onEnd('to')}>여기로 도착</button></div>
</div>;

export interface PlaceEndsCardProps { fixedName:string; fixed:'from' | 'to'; value?:string; onInput?:(text:string)=>void; onClear?:()=>void; onEnter?:()=>void }
// 한쪽이 정해지고 다른 쪽을 찾는 칸(발권 화면 장소 칸처럼 점선으로 나눈다)
export const PlaceEndsCard = ({ fixedName, fixed, value = '', onInput = noop, onClear = noop, onEnter = noop }:PlaceEndsCardProps) => {
  const row = <div class="ps-end"><i class={`jdot ${fixed}`} aria-hidden="true"></i><span><small>{fixed === 'from' ? '출발' : '도착'}</small><b>{fixedName}</b></span></div>;
  const field = <PlaceSearchField value={value} label={fixed === 'from' ? '도착지' : '출발지'} onInput={onInput} onClear={onClear} onEnter={onEnter} />;
  return <div class="ps-route">{fixed === 'from' ? <>{row}{field}</> : <>{field}{row}</>}</div>;
};

// 패널의 한 단계 뒤로(돌아갈 곳이 있을 때) · 닫기(첫 단계 · 결과). 시트 맨 위 손잡이 줄에 얹는다
const BACK = <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>;
export const JourneyStep = ({ canBack, onPress = noop }:{ canBack:boolean; onPress?:()=>void }) =>
  <button type="button" class={canBack ? 'jstep back' : 'jstep'} aria-label={canBack ? '뒤로' : '닫기'} onClick={onPress}>{canBack ? BACK : CLEAR}</button>;
