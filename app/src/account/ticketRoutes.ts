// 승차권 경로 고르기 · 다음 탈 날 · 이름 줄이기 — web/user/ticket_routes.mts 를 옮겨 적었다(사용자 결정 2026-10-29 그대로).
// 웹 파일을 직접 부르지 않는 까닭: 앱 묶음(metro)은 app/ 밖을 읽지 않고, 그 파일의 타입이 웹 .tsx 를 따라간다. 웹을 고치면 여기도 같이 고친다.
// 길 모양 = 탄 노선 + 타고 내린 역(rideSig). 같은 모양은 가장 빠른 것 하나만 남기고, '가장 빠른 길' 태그 길은 늘 남는다.
const FASTEST = '가장 빠른 길';

interface ShapedLeg { type: string; line?: string; route?: string; from?: string; to?: string }
interface Shaped { tag?: string; minutes: number; transfers: number; legs: readonly ShapedLeg[] }

// 길 모양: 걷기를 뺀 탄 구간마다 노선(버스면 번호) · 탄 역 · 내린 역. 걸어가기만이면 빈 글자
export const rideSig = (plan: Shaped) => plan.legs
  .filter(leg => leg.type !== 'walk').map(leg => `${leg.line || leg.route}|${leg.from}|${leg.to}`).join('>');

// 둘 중 앞설 길: 덜 걸리는 길 → 같으면 '가장 빠른 길' 태그 → 같으면 환승 적은 길(그래도 같으면 먼저 온 것)
function ahead(left: Shaped, right: Shaped): boolean {
  if (left.minutes !== right.minutes) return left.minutes < right.minutes;
  if ((left.tag === FASTEST) !== (right.tag === FASTEST)) return left.tag === FASTEST;
  return left.transfers < right.transfers;
}

// 보여 줄 길: 서버가 준 차례(도착 차례) 그대로, 같은 길 모양의 느린 쪽만 뺀다
export function usefulRoutes<P extends Shaped>(plans: readonly P[]): P[] {
  const best = new Map<string, P>();
  for (const plan of plans) {
    const sig = rideSig(plan);
    const kept = best.get(sig);
    if (!kept || ahead(plan, kept)) best.set(sig, plan);
  }
  return plans.filter(plan => best.get(rideSig(plan)) === plan);
}

// 같은 모양을 묶은 뒤 가장 빠른 길(없으면 null) — 카드 뒷면이 저장된 경로 없이 길을 찾을 때
export function quickestRoute<P extends Shaped>(plans: readonly P[]): P | null {
  return usefulRoutes(plans).reduce<P | null>((best, plan) => (!best || ahead(plan, best) ? plan : best), null);
}

// 조건 바꾸기: 묶은 뒤 받은 길을 서버의 kind(subway · bus · mixed · walk)로 다시 나눈다. 섞어 타기 · 걸어가기는 '전체'에만
export type RouteKind = 'all' | 'subway' | 'bus';
export const ROUTE_KINDS: readonly (readonly [RouteKind, string])[] = [['all', '전체'], ['subway', '지하철만'], ['bus', '버스만']];
interface Kinded { kind: string }
const fits = (plan: Kinded, kind: RouteKind) => kind === 'all' || plan.kind === kind;

export function routeOrder(plans: readonly Kinded[], kind: RouteKind): number[] {
  return plans.flatMap((plan, index) => (fits(plan, kind) ? [index] : []));
}

export interface RouteFilterView {
  kinds: { kind: RouteKind; name: string; count: number; pressed: boolean }[];
  order: number[]; empty: string;
}
export function routeFilterView(plans: readonly Kinded[], kind: RouteKind): RouteFilterView {
  const order = routeOrder(plans, kind);
  const name = ROUTE_KINDS.find(([each]) => each === kind)?.[1] ?? '';
  return {
    kinds: ROUTE_KINDS.map(([each, label]) => ({ kind: each, name: label, count: plans.filter(plan => fits(plan, each)).length, pressed: each === kind })),
    order, empty: order.length ? '' : `${name} 타는 경로가 없어요`,
  };
}

// 조건을 바꾼 뒤 고를 길: 저장된 경로(같은 길 모양)가 보이면 그 길, 아니면 처음 카드, 보일 길이 없으면 -1
export function chosenAfter(plans: readonly Shaped[], order: readonly number[], saved: Shaped | null): number {
  const sig = saved ? rideSig(saved) : null;
  const mine = sig === null ? undefined : order.find(index => { const plan = plans[index]; return plan !== undefined && rideSig(plan) === sig; });
  return mine ?? order[0] ?? -1;
}

// 다음 탈 날: 고른 요일(1 월 … 7 일, 비었으면 아무 날) 가운데 지금보다 뒤인 가장 가까운 날의 그 시각(time 'HH:MM')
export function nextRideDay(days: readonly number[], time: string, now: Date) {
  const [hour = 8, minute = 0] = time.split(':').map(Number);
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute);
    const weekday = ((day.getDay() + 6) % 7) + 1;
    if (day > now && (!days.length || days.includes(weekday))) return day;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute);
}
// /api/route 의 at 칸: 'YYYY-MM-DDTHH:MM'(이 기기 시각)
export function routeAt(when: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}
// 승차권 길찾기 주소(서버 주소 뒤에 붙인다): 출발 · 도착 · 물을 시각
export function routePath(from: { lat: number; lng: number }, to: { lat: number; lng: number }, at: string) {
  return `/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&at=${encodeURIComponent(at)}`;
}

// 카드 · 뒷면 첫 줄의 이름 줄이기: 띄어쓰기를 뺀 글자가 10 이하면 그대로, 11 이상이면 앞 3 ‥ 뒤 2
export const shortName = (name: string) => (name.replace(/\s/g, '').length >= 11 ? `${name.slice(0, 3)}‥${name.slice(-2)}` : name);
