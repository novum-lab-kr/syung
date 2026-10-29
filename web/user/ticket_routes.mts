// 승차권 경로 고르기(발권 화면 → 경로 칸 · 카드 뒷면): 매일 다닐 길이라 그 시각 시간표 하나에 맞춘 길을 다 보이지 않고 "길 모양"으로 고른다(사용자 결정 2026-10-29).
// 길 모양 = 탄 노선 + 타고 내린 역(rideSig). 같은 모양은 가장 빠른 것 하나만, 가장 빠른 길보다 한참 느린 길(우회 · 엉뚱한 방향이
// 대개 여기서 걸린다)은 뺀다. '가장 빠른 길' 태그 길은 늘 남긴다. 조금(한도 안) 느린 다른 모양은 환승이 같거나 많아도 남긴다 —
// 1분 차이 대안까지 빠져 고를 게 없어졌다(운영 확인 뒤 사용자 결정 2026-10-29).
// 길찾기("어디로 갈까요?")는 이 거르기를 쓰지 않는다 — 서버(/api/route) 응답 모양도 그대로.
import type { Plan } from '../lib/journey-ui.mts';
import type { SlimRoute } from './tickets_view.tsx';

// 한참 느린 길: 가장 빠른 길보다 max(10분, 30%) 넘게 더 걸리면 뺀다(계획서 Decisions 2026-10-29)
export const SLOW_LIMIT = { minutes: 10, share: 0.3 } as const;
const FASTEST = '가장 빠른 길';

type Shaped = Pick<Plan, 'tag' | 'minutes' | 'transfers' | 'legs'> | SlimRoute;
// 길 모양: 걷기를 뺀 탄 구간마다 노선(버스면 번호) · 탄 역 · 내린 역. 걸어가기만이면 빈 글자
export const rideSig = (plan:Shaped) => (plan.legs as readonly { type:string; line?:string; route?:string; from?:string; to?:string }[])
  .filter(leg => leg.type !== 'walk').map(leg => `${leg.line || leg.route}|${leg.from}|${leg.to}`).join('>');

// 둘 중 앞설 길: 덜 걸리는 길 → 같으면 '가장 빠른 길' 태그 → 같으면 환승 적은 길(그래도 같으면 먼저 온 것)
const ahead = (left:Shaped, right:Shaped) => left.minutes !== right.minutes ? left.minutes < right.minutes
  : (left.tag === FASTEST) !== (right.tag === FASTEST) ? left.tag === FASTEST : left.transfers < right.transfers;

// 보여 줄 길: 서버가 준 차례(도착 차례) 그대로, 빼야 할 것만 뺀다. 하나뿐이면 그대로
export function usefulRoutes<P extends Shaped>(plans:readonly P[]):P[] {
  const best = new Map<string, P>();   // 길 모양 → 그 모양에서 가장 빠른 길
  for (const plan of plans) {
    const sig = rideSig(plan), kept = best.get(sig);
    if (!kept || ahead(plan, kept)) best.set(sig, plan);
  }
  const shapes = plans.filter(plan => best.get(rideSig(plan)) === plan);
  if (shapes.length < 2) return shapes;
  const quickest = Math.min(...shapes.map(plan => plan.minutes));
  const slowest = quickest + Math.max(SLOW_LIMIT.minutes, quickest * SLOW_LIMIT.share);
  return shapes.filter(plan => plan.tag === FASTEST || plan.minutes <= slowest);
}

// 거르기 뒤 가장 빠른 길(없으면 null) — 카드 뒷면이 저장된 경로 없이 길을 찾을 때
export function quickestRoute<P extends Shaped>(plans:readonly P[]):P | null {
  return usefulRoutes(plans).reduce<P | null>((best, plan) => !best || ahead(plan, best) ? plan : best, null);
}

// ---- 조건 바꾸기(사용자 결정 2026-10-29 — 마음에 드는 경로가 없을 때): 거르기(usefulRoutes) 뒤 받은 길을 다시 나눠 보인다(서버를 다시 부르지 않는다) ----
// 종류: 길찾기 시트의 종류 탭(.jkinds)처럼 서버가 준 kind(subway · bus · mixed · walk)로 나눈다. 섞어 타기 · 걸어가기는 '전체'에만
export type RouteKind = 'all' | 'subway' | 'bus';
// 차례: '' 는 지금 차례(도착 차례), 환승 적게 · 덜 걷기는 그 수가 적은 길부터(같으면 지금 차례)
export type RouteSort = '' | 'transfers' | 'walk';
export const ROUTE_KINDS:readonly (readonly [RouteKind, string])[] = [['all', '전체'], ['subway', '지하철만'], ['bus', '버스만']];
export const ROUTE_SORTS:readonly (readonly [Exclude<RouteSort, ''>, string])[] = [['transfers', '환승 적게'], ['walk', '덜 걷기']];
type Sortable = Pick<Plan, 'kind' | 'transfers' | 'walkMinutes'>;
const fits = (plan:Sortable, kind:RouteKind) => kind === 'all' || plan.kind === kind;

// 조건에 맞는 길의 차례(plans 의 번호 — 고른 길은 번호로 둔다)
export function routeOrder(plans:readonly Sortable[], kind:RouteKind, sort:RouteSort):number[] {
  const order = plans.flatMap((plan, index) => fits(plan, kind) ? [index] : []);
  if (!sort) return order;
  const count = (index:number) => sort === 'transfers' ? plans[index]!.transfers : plans[index]!.walkMinutes;
  return order.sort((left, right) => count(left) - count(right) || left - right);
}

// 조건 고르기 칸에 그릴 것: 종류 단추(전체 · 지하철만 · 버스만 — 길 수와 함께) · 차례 단추 · 보일 차례 · 맞는 길이 없을 때의 안내
export interface RouteFilterView {
  kinds:{ kind:RouteKind; name:string; count:number; pressed:boolean }[];
  sorts:{ sort:Exclude<RouteSort, ''>; name:string; pressed:boolean }[];
  order:number[]; empty:string;
}
export function routeFilterView(plans:readonly Sortable[], kind:RouteKind, sort:RouteSort):RouteFilterView {
  const order = routeOrder(plans, kind, sort);
  const name = ROUTE_KINDS.find(([each]) => each === kind)![1];
  return {
    kinds: ROUTE_KINDS.map(([each, label]) => ({kind: each, name: label, count: plans.filter(plan => fits(plan, each)).length, pressed: each === kind})),
    sorts: ROUTE_SORTS.map(([each, label]) => ({sort: each, name: label, pressed: each === sort})),
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
// 승차권 길찾기 주소: 출발 · 도착 · 물을 시각(at 'YYYY-MM-DDTHH:MM') + 경유지가 있으면 via(서버 /api/route?via= — 2026-10-29 사용자 결정 A)
type Spot = { lat:number; lng:number };
export function routeUrl(from:Spot, to:Spot, at:string, via?:Spot | null) {
  return `./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&at=${encodeURIComponent(at)}${via ? `&via=${via.lat},${via.lng}` : ''}`;
}
