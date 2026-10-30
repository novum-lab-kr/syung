// 입력 칸: 역 검색 칸(돋보기 · 입력 · 결과 목록)과 결과 목록.
// SearchList 는 화면(ui/search.mts)이 그대로 쓴다. SearchField 는 스토리에서만 쓴다 — 지도 위 검색 칸은 첫 화면에 바로 보여야 해서 index.html 의 정적 HTML 로 둔다(JS 로 그리면 그만큼 늦게 뜬다).
// index.html 의 .map-search 를 고치면 여기도 같이 고친다.
import type { ComponentChildren } from 'preact';

export interface SearchHit { name:string; lines:{ name:string; color:string }[] }

// marked: 방향키로 고른 줄(화면은 ui/search.mts 가 aria-selected 를 직접 고친다)
export function SearchList({ hits, marked = -1 }:{ hits:SearchHit[]; marked?:number }) {
  if (!hits.length) return <li key="empty" class="search-empty" role="option" aria-disabled="true">찾는 역이 없어요</li>;
  return <>{hits.map((hit, index) => <li id={`sr-${index}`} role="option" aria-selected={index === marked ? 'true' : 'false'} data-k={String(index)}><b>{hit.name}</b><span>{hit.lines.map(line => <i style={`--c:${line.color}`}>{line.name}</i>)}</span></li>)}</>;
}

export function SearchField({ value, expanded = false, disabled = false, children }:{ value?:string; expanded?:boolean; disabled?:boolean; children?:ComponentChildren }) {
  return <div class="map-search search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 5 5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
    <label class="sr" for="search">역 검색</label><input id="search" type="search" placeholder="어느 역으로 슝?" autocomplete="off" enterkeyhint="search" role="combobox" list={undefined} aria-expanded={expanded ? 'true' : 'false'} aria-controls="searchList" aria-autocomplete="list" value={value} disabled={disabled} />
    <ul id="searchList" class="search-list" role="listbox" aria-label="역 검색 결과" hidden={!expanded}>{children}</ul></div>;
}
