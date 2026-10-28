// 버스 시트(아래 시트 몸통): 정류장 도착(번호 배지 · 새로고침 / 고른 번호 상태 칸 / 곧 도착 카드 / 한 줄 목록 / 운행 종료)과 노선 · 버스 상세.
// 화면 조각(Preact)이라 그리기만 한다 — 고르기 · 셈은 bus/layer.mts 의 detailView(), 단추 누르기는 layer 의 document click(routeClick — data-bus-* 로 찾는다),
// 1초마다 남은 시간 · 버스 아이콘 자리 고치기는 layer 의 tickArrivals 가 맡는다.
// 표시(DOM 모양 · class · 문구 · aria)는 옛 HTML 글자와 같다: 스타일(syung.css)과 단추 찾기가 그대로 맞는다.
import { render } from 'preact';
import type { BusBadgeView, BusFollowLineView, BusHeroView, BusRouteSheetView, BusRowView, BusSheetView, BusStopSheetView } from './layer.mts';

const BUS_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M7 21v-3M17 21v-3"/></svg>;
const REFRESH_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>;

// 노선 번호 배지: 흰 글자라 밝은 쪽 색. 긴 번호(5글자 이상)는 글자를 줄여 칸 안에
const Badge = ({ badge }:{ badge:BusBadgeView }) => <span class={badge.long ? 'bus-num bus-num-long' : 'bus-num'} style={`--c:${badge.color}`}>{badge.name}</span>;

function FollowLine({ line }:{ line:BusFollowLineView }) {
  return <div class={line.following ? 'bus-follow' : 'bus-follow is-off'}>
    <p class="bus-follow-state" role="status">{line.following && <span class="bus-follow-dot" aria-hidden="true"></span>}<Badge badge={line.badge} /><span class="bus-follow-text"><b>{line.state}</b>{line.arrival && <span>{line.arrival}</span>}</span></p>
    <div class="bus-follow-actions">{line.buttons.map(button => <button type="button" data-bus-stop-view={button.what} aria-label={button.aria || undefined}>{button.label}</button>)}</div>
  </div>;
}

function Hero({ hero }:{ hero:BusHeroView }) {
  const head = hero.one
    ? <span class="bus-hero-head"><Badge badge={hero.badges[0]!} /><span class="bus-hero-dir">{hero.direction}</span>{hero.onMap && <span class="bus-hero-on">지도에 표시 중</span>}</span>
    : <span class="bus-hero-head is-many">{hero.badges.map(badge => <Badge badge={badge} />)}{hero.more > 0 && <span class="bus-num bus-num-more">{`+${hero.more}`}</span>}</span>;
  const body = <>
    {head}
    <span class="bus-hero-now"><span class="bus-hero-soon">곧 도착</span>{hero.next && <span class="bus-hero-next">{hero.next}</span>}</span>
    <span class="bus-track" aria-hidden="true"><span class="bus-track-from"></span><span class="bus-track-bus" data-track-route={hero.trackRoute ?? undefined} style={`left:${hero.ratio * 50}%`}>{BUS_ICON}</span><span class="bus-track-here"></span><span class="bus-track-to"></span></span>
    <span class="bus-track-names"><span>{hero.prev}</span><b>{hero.stop}</b><span>{hero.after}</span></span>
  </>;
  return hero.button
    ? <button type="button" class="bus-hero" data-bus-route={hero.routeId} aria-pressed={hero.pressed}>{body}</button>
    : <div class="bus-hero">{body}</div>;
}

function RowTime({ row }:{ row:BusRowView }) {
  const time = row.time;
  if (time.kind === 'wait') return <span class="bus-row-time"><i class="bus-wait"></i></span>;
  if (time.kind === 'none') return <span class="bus-row-time"><span class="bus-away">도착 정보 없음</span></span>;
  if (time.kind === 'soon') return <span class="bus-row-time"><span class="bus-soon">곧 도착</span></span>;
  if (time.kind === 'away') return <span class="bus-row-time"><span class="bus-away">{time.text}</span></span>;
  return <span class="bus-row-time">{time.where && <span class="bus-away">{time.where}</span>}<span class="bus-eta" data-eta={String(time.at)}>{time.left}</span></span>;
}

function Row({ row }:{ row:BusRowView }) {
  const inner = <><Badge badge={row.badge} /><span class="bus-row-dir"><span>{row.direction}</span>{row.tag && <span class="bus-tag">{row.tag}</span>}</span><RowTime row={row} /></>;
  return row.live
    ? <button type="button" class="bus-row" data-bus-route={row.routeId} aria-pressed={row.pressed}>{inner}<span class="bus-sr">, 곧 올 버스 따라가기</span></button>
    : <div class="bus-row">{inner}</div>;
}

function StopSheet({ view }:{ view:BusStopSheetView }) {
  // 따라가는 동안(멈춤 포함)은 상태 칸만 — 정류장 이름은 화면 읽기 · 포커스용
  if (view.compact) return <div class="bus-stop is-following"><h3 class="bus-sr" tabIndex={-1}>{view.name}</h3>{view.followLine && <FollowLine line={view.followLine} />}</div>;
  const refresh = view.refresh;
  return <div class="bus-stop">
    <div class="bus-stop-head">
      <div class="bus-stop-title">{view.arsId && <span class="bus-stop-no">{BUS_ICON}{view.arsId}</span>}<h3 tabIndex={-1}>{view.name}</h3></div>
      {refresh && <button type="button" class={refresh.loading ? 'bus-refresh is-loading' : 'bus-refresh'} data-bus-refresh="" aria-label={refresh.clock ? `도착 정보 새로 받기 · ${refresh.clock} 기준` : '도착 정보 새로 받기'}><span>{refresh.clock}</span>{REFRESH_ICON}</button>}
    </div>
    {view.followLine && <FollowLine line={view.followLine} />}
    {view.note && <p class="bus-detail-note">{view.note}</p>}
    {view.stopNote && <p class="bus-detail-note" role="status">{view.stopNote}</p>}
    {view.mock && <p class="bus-detail-note">예시 데이터 · 실제 운행 정보 아님</p>}
    {view.hero && <Hero hero={view.hero} />}
    <div class="bus-rows">{view.rows.map(row => <Row row={row} />)}</div>
    {view.ended.length > 0 && <div class="bus-ended"><span>운행 종료</span>{view.ended.map(item => item.live
      ? <button type="button" data-bus-route={item.routeId} aria-pressed={item.pressed}>{item.name}</button>
      : <span>{item.name}</span>)}</div>}
  </div>;
}

function RouteSheet({ view }:{ view:BusRouteSheetView }) {
  return <>
    <h3 tabIndex={-1}><span class="bus-type" style={`--bus-color:${view.typeColor}`}>{view.typeName}</span>{` ${view.name}번`}</h3>
    {view.grid && <dl class="bus-detail-grid"><dt>다음 정류장</dt><dd>{view.grid.next}{view.grid.onPath && <small>경로 기준</small>}</dd><dt>{view.grid.clockLabel}</dt><dd>{view.grid.time}</dd></dl>}
    <p class="bus-detail-note">{view.note}</p>
    {view.approx && <p class="bus-detail-note">정류장을 연결한 근사 경로예요.</p>}
  </>;
}

export function BusSheet({ view }:{ view:BusSheetView | null }) {
  if (!view) return null;
  return <div class="bus-detail">{view.kind === 'stop' ? <StopSheet view={view} /> : <RouteSheet view={view} />}</div>;
}

// 시트 몸통에 그리기 · 다시 그리기(같은 몸통이면 Preact 가 바뀐 곳만 고친다) · 치우기
export const drawBusSheet = (body:HTMLElement, view:BusSheetView | null):void => render(<BusSheet view={view} />, body);
export const clearBusSheet = (body:HTMLElement):void => render(null, body);
