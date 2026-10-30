// 승차권 경로 고르기(발권 화면 → 경로 칸 · 카드 뒷면): 매일 다닐 길이라 그 시각 시간표 하나에 맞춘 길을 다 보이지 않고 "길 모양"으로 고른다(사용자 결정 2026-10-29).
// 길 모양 = 탄 노선 + 타고 내린 역(rideSig). 같은 모양은 가장 빠른 것 하나만 남기고, 다른 모양은 웬만하면 다 보인다
// (한참 느린 길 빼기 · 환승 적게 / 덜 걷기 정렬은 뺐다 — 사용자 결정 2026-10-29). '가장 빠른 길' 태그 길은 늘 남는다.
// 길찾기("어디로 갈까요?")는 이 거르기를 쓰지 않는다 — 서버(/api/route) 응답 모양도 그대로.
import type { Plan } from '../lib/journey-ui.mts';
import type { SlimRoute } from './tickets_view.tsx';

export const DAYS = ['월', '화', '수', '목', '금', '토', '일'];   // 1(월) … 7(일)
// HTML 글자에 넣을 때 막기
export const esc = (text:unknown) => String(text).replace(/[&<>"']/g, mark => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[mark]!);

const FASTEST = '가장 빠른 길';

type Shaped = Pick<Plan, 'tag' | 'minutes' | 'transfers' | 'legs'> | SlimRoute;
// 길 모양: 걷기를 뺀 탄 구간마다 노선(버스면 번호) · 탄 역 · 내린 역. 걸어가기만이면 빈 글자
export const rideSig = (plan:Shaped) => (plan.legs as readonly { type:string; line?:string; route?:string; from?:string; to?:string }[])
  .filter(leg => leg.type !== 'walk').map(leg => `${leg.line || leg.route}|${leg.from}|${leg.to}`).join('>');

// 둘 중 앞설 길: 덜 걸리는 길 → 같으면 '가장 빠른 길' 태그 → 같으면 환승 적은 길(그래도 같으면 먼저 온 것)
const ahead = (left:Shaped, right:Shaped) => left.minutes !== right.minutes ? left.minutes < right.minutes
  : (left.tag === FASTEST) !== (right.tag === FASTEST) ? left.tag === FASTEST : left.transfers < right.transfers;

// 보여 줄 길: 서버가 준 차례(도착 차례) 그대로, 같은 길 모양의 느린 쪽만 뺀다
export function usefulRoutes<P extends Shaped>(plans:readonly P[]):P[] {
  const best = new Map<string, P>();   // 길 모양 → 그 모양에서 가장 빠른 길
  for (const plan of plans) {
    const sig = rideSig(plan), kept = best.get(sig);
    if (!kept || ahead(plan, kept)) best.set(sig, plan);
  }
  return plans.filter(plan => best.get(rideSig(plan)) === plan);
}

// 같은 모양을 묶은 뒤 가장 빠른 길(없으면 null) — 카드 뒷면이 저장된 경로 없이 길을 찾을 때
export function quickestRoute<P extends Shaped>(plans:readonly P[]):P | null {
  return usefulRoutes(plans).reduce<P | null>((best, plan) => !best || ahead(plan, best) ? plan : best, null);
}

// ---- 조건 바꾸기(사용자 결정 2026-10-29 — 마음에 드는 경로가 없을 때): 묶기(usefulRoutes) 뒤 받은 길을 종류로 다시 나눠 보인다(서버를 다시 부르지 않는다) ----
// 종류: 길찾기 시트의 종류 탭(.jkinds)처럼 서버가 준 kind(subway · bus · mixed · walk)로 나눈다. 섞어 타기 · 걸어가기는 '전체'에만
export type RouteKind = 'all' | 'subway' | 'bus';
export const ROUTE_KINDS:readonly (readonly [RouteKind, string])[] = [['all', '전체'], ['subway', '지하철만'], ['bus', '버스만']];
type Kinded = Pick<Plan, 'kind'>;
const fits = (plan:Kinded, kind:RouteKind) => kind === 'all' || plan.kind === kind;

// 조건에 맞는 길의 차례(plans 의 번호 — 고른 길은 번호로 둔다)
export function routeOrder(plans:readonly Kinded[], kind:RouteKind):number[] {
  return plans.flatMap((plan, index) => fits(plan, kind) ? [index] : []);
}

// 조건 고르기 칸에 그릴 것: 종류 단추(전체 · 지하철만 · 버스만 — 길 수와 함께) · 보일 차례 · 맞는 길이 없을 때의 안내
export interface RouteFilterView {
  kinds:{ kind:RouteKind; name:string; count:number; pressed:boolean }[];
  order:number[]; empty:string;
}
export function routeFilterView(plans:readonly Kinded[], kind:RouteKind):RouteFilterView {
  const order = routeOrder(plans, kind);
  const name = ROUTE_KINDS.find(([each]) => each === kind)![1];
  return {
    kinds: ROUTE_KINDS.map(([each, label]) => ({kind: each, name: label, count: plans.filter(plan => fits(plan, each)).length, pressed: each === kind})),
    order, empty: order.length ? '' : `${name} 타는 경로가 없어요`,
  };
}

// 조건을 바꾼 뒤 고를 길: 저장된 경로(같은 길 모양)가 보이면 그 길, 아니면 처음 카드, 보일 길이 없으면 -1
export function chosenAfter(plans:readonly Shaped[], order:readonly number[], saved:Shaped | null):number {
  const sig = saved ? rideSig(saved) : null;
  const mine = sig === null ? undefined : order.find(index => rideSig(plans[index]!) === sig);
  return mine ?? order[0] ?? -1;
}

// 다음 탈 날: 고른 요일(1 월 … 7 일, 비었으면 아무 날) 가운데 지금보다 뒤인 가장 가까운 날의 그 시각(time 'HH:MM')
export function nextRideDay(days:readonly number[], time:string, now:Date) {
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute);
    const weekday = (day.getDay() + 6) % 7 + 1;
    if (day > now && (!days.length || days.includes(weekday))) return day;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute);
}
// /api/route 의 at 칸: 'YYYY-MM-DDTHH:MM'(이 기기 시각)
export function routeAt(when:Date) {
  const pad = (value:number) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}
// 승차권 길찾기 주소: 출발 · 도착 · 물을 시각(at 'YYYY-MM-DDTHH:MM') — 승차권 경유지는 2026-10-30 에 뺐다(서버 /api/route?via= 는 길찾기 시트용으로 남아 있다)
type Spot = { lat:number; lng:number };
export function routeUrl(from:Spot, to:Spot, at:string) {
  return `./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&at=${encodeURIComponent(at)}`;
}

// 카드 · 뒷면 첫 줄의 이름 줄이기: 띄어쓰기를 뺀 글자가 10 이하면 그대로(띄어쓰기 포함), 11 이상이면 앞 3 ‥ 뒤 2 (사용자 요청 2026-10-29)
export const shortName = (name:string) => name.replace(/\s/g, '').length >= 11 ? `${name.slice(0, 3)}‥${name.slice(-2)}` : name;
