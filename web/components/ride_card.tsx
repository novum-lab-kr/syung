// 타고 가기 카드: 카드 자체가 캐릭터의 말풍선(슝 소개 사이트 첫 화면 모양 — 시안 .storybook/ride_along.stories.tsx (라)).
// 큰 글 한 줄 · 한마디(형광펜, 기다리기 카드만) · 작은 글(또는 「다른 길 찾기 ›」) · ✕, 오른쪽 아래에 캐릭터 온몸(꼬리가 가리킨다).
// 그리기만 한다 — 글 · 그림 이름은 lib/ride-along.mts, 상태 · 위치 · 카메라는 ui/ride_along.mts
import { render } from 'preact';
import type { RideCardView } from '../lib/ride-along.mts';

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
export const drawRideCard = (host:HTMLElement, view:RideCardView | null, actions:RideCardActions):void =>
  render(view ? <RideCard view={view} actions={actions} /> : null, host);
