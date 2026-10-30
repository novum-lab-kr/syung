// 경로 선택 쪽 틀: 머리말 · 종류 탭 · 경로 목록(고르기 · 단계 펼치기) · 빈 안내 · 알림 · 뼈대 카드 · '이 경로로'. props 만 받아 그린다.
// 찾기 · 고른 경로 저장은 화면(user/account.mts). DOM · class · id · 문구 · aria 는 옛 화면 그대로 — 스타일은 syung.css.
import type { Plan, StepView } from '../lib/journey-ui.mts';
import { routeTrack } from '../lib/journey-ui.mts';
import { esc } from '../user/ticket_routes.mts';
import type { RouteFilterView, RouteKind } from '../user/ticket_routes.mts';
import { RouteHead } from './route_head.tsx';
import type { RouteWhen } from './route_head.tsx';
import { RouteLoading } from './route_card.tsx';
import { SaveButton } from './save_button.tsx';
import { Segmented } from './segmented.tsx';
import { StepList } from './step_list.tsx';

// 경로 하나의 단추 속: 매일 다닐 길이라 시각(그날 시간표의 출발 · 도착)은 빼고 '약 N분'(2026-10-29)
function planHTML(plan:Plan, colors:Record<string, string>) {
  return `<i class="rt-radio" aria-hidden="true"></i><span class="rt-b"><span class="jp-top"><strong class="jp-min"><small>약 </small>${plan.minutes}<small>분</small></strong>`
    + `${plan.tag ? `<span class="jp-tag">${esc(plan.tag)}</span>` : ''}</span>`
    + `${routeTrack(plan, colors, 250)}</span>`;
}

// 목록 한 줄: index 는 고를 때 돌려주는 번호(plans 의 차례) · steps 는 펼친 단계(접혀 있으면 null)
export interface RoutePickerRow { index:number; plan:Plan; chosen:boolean; steps:StepView[] | null }
export interface RoutePickerProps {
  when:RouteWhen | null; from?:string | undefined; to?:string | undefined;
  filter:RouteFilterView | null;   // 종류 탭(길이 없으면 null)
  rows:RoutePickerRow[]; colors:Record<string, string>;
  message:string; loading:boolean;
  onKind?:(kind:RouteKind) => void; onPlan?:(index:number) => void; onSteps?:(plan:Plan) => void; onPick?:() => void;
}
export function RoutePicker({ when, from, to, filter, rows, colors, message, loading, onKind, onPlan, onSteps, onPick }:RoutePickerProps) {
  return <>
    <RouteHead when={when} from={from} to={to} />
    {filter && <div class="rt-filters">
      <Segmented label="경로 종류" class="jkinds" attr="k" items={filter.kinds.map(tab => ({ id: tab.kind, name: tab.name, count: tab.count, pressed: tab.pressed }))} onPick={kind => onKind?.(kind)} />
    </div>}
    {/* 고를 때는 표시(aria-checked)만 바뀐다 — 누른 단추가 문서에서 빠지면 본체의 '서랍 밖을 눌렀나' 검사가 서랍을 닫는다 */}
    {/* key 없이 자리마다 고쳐 쓴다 — 조건 차례로 단추를 옮기면(key) 크롬이 고른 카드의 동그라미 점을 빈 채로 그렸다(2026-10-29 확인) */}
    <div id="routeList" class="rt-list" role="radiogroup" aria-label="경로">{rows.map(({ index, plan, chosen, steps }) => <div class="rt-item"><div class="rt-card"><button type="button" class="rt-plan" role="radio" aria-checked={chosen ? 'true' : 'false'}
      aria-label={`${plan.tag || '경로'} 약 ${plan.minutes}분, 환승 ${plan.transfers}번`} onClick={() => onPlan?.(index)} dangerouslySetInnerHTML={{ __html: planHTML(plan, colors) }}></button>
      <button type="button" class="rt-open" aria-expanded={steps ? 'true' : 'false'} aria-label="경로 자세히 보기" onClick={() => onSteps?.(plan)}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg></button></div>
      {steps && <div class="rt-steps"><p class="jp-meta">{`환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`}</p><StepList steps={steps} className="jsteps shown" /></div>}</div>)}</div>
    {filter?.empty && <div class="rt-empty"><b>{filter.empty}</b><p>다른 조건을 골라 보세요</p></div>}
    <p id="routeMsg" class="account-msg" role="status" aria-live="polite">{message}</p>
    {loading && <RouteLoading />}
    {/* 이 경로로: 목록이 길어도 늘 보이게 맨 아래에 붙는다(경로 고르기 반쪽 시트 2026-10-29) */}
    <div class="rt-foot" hidden={!rows.length}><SaveButton id="routePick" onClick={() => onPick?.()}>이 경로로</SaveButton></div>
  </>;
}
