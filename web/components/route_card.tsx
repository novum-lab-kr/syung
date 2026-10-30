// 기초 컴포넌트: 경로 카드(걸리는 시간 · 도착 시각 · 꼬리표 · 경로 띠 · 펼치면 설명 줄과 단계 목록)와 찾는 동안의 뼈대 카드.
// 길찾기 시트(ui/journey_sheet.tsx)가 쓰고, 뼈대 카드는 승차권 경로 고르기(user/tickets_view.tsx)도 쓴다(옛 DOM 그대로).
// props 만 받는다: 누름은 onPick(번호)로 알린다. 그릴 거리(PlanView)는 lib/journey-ui.mts 가 만든다
import type { PlanView, TrackSegView } from '../lib/journey-ui.mts';
import { Chip } from './chip.tsx';
import { BUS } from './icons.tsx';
import { StepList } from './step_list.tsx';

// 경로 띠(승차권 · 아래 막대의 HTML 글자 routeTrack 과 같은 그림)
export function Track({ segs }:{ segs:TrackSegView[] }) {
  return <div class="jtrack" aria-hidden="true">{segs.map(seg => seg.k !== 'ride'
    ? <i class={`jseg ${seg.k}`} style={`flex:${seg.flex} 1 0`}></i>
    : <i class={seg.bus ? 'jseg ride bus' : 'jseg ride'} style={`flex:${seg.flex} 1 0;min-width:${seg.need}px;--c:${seg.color};--t:${seg.ink}`}>{seg.icon && BUS}{seg.label}</i>)}</div>;
}

// 카드는 누르는 칸(옛 HTML 그대로 article role=button — Preact 타입은 article 에 button 역할을 두지 않아 펼쳐 넣는다)
const CARD_ROLE:Record<string, string> = { role: 'button' };

export interface RouteCardProps { plan:PlanView; index:number; on:boolean; hidden?:boolean; onPick:(index:number) => void }

// on: 고른(펼친) 카드 — 설명 줄 · 단계 목록이 보인다. Enter · Space 로도 누른다
export function RouteCard({ plan, index, on, hidden = false, onPick }:RouteCardProps) {
  const duration = plan.duration;
  return <article class={on ? 'jp on' : 'jp'} data-i={String(index)} tabIndex={0} {...CARD_ROLE} aria-label={plan.aria} aria-expanded={on} hidden={hidden}
    onClick={() => onPick(index)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } }}>
    <div class="jp-top"><strong class="jp-min">{duration.hours !== null ? <>{`${duration.hours}`}<small>시간</small>{` ${duration.minutes}`}<small>분</small></> : <>{`${duration.minutes}`}<small>분</small></>}</strong><span class="jp-arr">{plan.arrive}</span>{plan.tag !== null && <Chip kind="tag">{plan.tag}</Chip>}</div>
    <Track segs={plan.track} />
    {on && <p class="jp-meta">{plan.meta}{plan.live && <span class="jp-live">실시간</span>}</p>}
    <StepList steps={plan.steps} className="jsteps" />
  </article>;
}

// 길을 찾는 동안의 뼈대 카드 3줄(첫 줄에 달리는 열차). 상태 글자는 부르는 쪽이 따로 둔다
export function RouteLoading() {
  return <div class="jload" aria-hidden="true">{[0, 1, 2].map(row => <div class="jsk"><i class="jsk-min"></i><div class="jsk-track">{row === 0 && <span class="jsk-run"><i></i></span>}</div><i class="jsk-meta"></i></div>)}</div>;
}
