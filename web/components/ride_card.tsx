// 타고 가기 카드: 카드 자체가 캐릭터의 말풍선(슝 소개 사이트 첫 화면 모양 — 시안 .storybook/ride_along.stories.tsx (라)).
// 큰 글 한 줄 · 한마디(형광펜, 기다리기 카드만) · 작은 글(또는 「다른 길 찾기 ›」) · ✕, 오른쪽 아래에 캐릭터 온몸(꼬리가 가리킨다).
// 그리기만 한다 — 글 · 그림 이름은 lib/ride-along.mts, 상태 · 위치 · 카메라는 ui/ride_along.mts
import { render } from 'preact';
import type { RideCardView } from '../lib/ride-along.mts';
import type { ComponentChild } from 'preact';
import { GoalFlag, MapArrival, type ArrivalMap } from './ride_arrival.tsx';

const CLOSE = <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>;

export interface RideCardActions { close():void; detour():void; follow():void }

export function RideCard({ view, actions }:{ view:RideCardView; actions:RideCardActions }) {
  // rg-stack: 「다시 따라가기」 · 말풍선 · 캐릭터를 한 자리에 쌓는다(말풍선 높이가 글에 따라 바뀌어도 단추는 그 위에)
  return <div class="rg-stack">
    {!view.following && <button type="button" class="sheet-follow rg-follow" onClick={actions.follow}>다시 따라가기</button>}
    <div class="rg-talk" role="status" aria-live="polite">
      <b>{view.title}</b>
      {view.say && <p class="rg-said"><span class="rg-pen">{view.say}</span></p>}
      <small>{view.detour ? <a href="#" class="rg-detour" onClick={event => { event.preventDefault(); actions.detour(); }}>다른 길 찾기 ›</a> : view.sub}</small>
      <button type="button" class="rg-x" aria-label="타고 가기 끝내기" title="타고 가기 끝내기" onClick={actions.close}>{CLOSE}</button>
    </div>
    <i class={view.flip ? 'rg-sprout flip' : 'rg-sprout'} aria-hidden="true" style={`background-image:url("./brand/characters/${view.image}")`} />
  </div>;
}

// 카드 자리(ui/ride_along 이 만든다)에 그리기 · 다시 그리기 · 치우기(view 가 null)
// 타고 가는 동안 길 끝 자리에 깃발을 미리 세운다(GoalFlag — 도착 뒤에도 같은 열쇠로 남는다).
// 도착하면 말풍선 대신 지도 속 도착 자리에서 연기한다(MapArrival — map · 도착 자리가 있을 때만, 없으면 「슝 도착!」 말풍선).
// 타는 중엔 카드 앞(카드가 깃발을 덮는다) · 도착하면 연기 뒤에 둬서 열차 · 새싹이보다 앞에 그린다(같은 z-index — 문서 차례가 위아래)
export function drawRideCard(host:HTMLElement, view:RideCardView | null, actions:RideCardActions, map?:ArrivalMap, hideMe?:(on:boolean) => void):void {
  const goal = view?.goal?.at, flag = map && goal ? <GoalFlag key="goal" map={map} at={goal} /> : null;
  const draw = (body:ComponentChild, flagOnTop = false) => render(flag ? <>{flagOnTop ? null : flag}{body}{flagOnTop ? flag : null}</> : body, host);
  const at = view?.arrival?.at;
  if (view?.arrival && map && at) { draw(<MapArrival key="arrival" map={map} at={at} hideMe={hideMe} arrival={view.arrival} onClose={actions.close} />, true); return; }
  draw(view ? <RideCard key="card" view={view} actions={actions} /> : null);
}
