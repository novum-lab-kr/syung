// 내 승차권 목록(모듈 저장소 — 목록 화면과 발권 화면이 같이 본다). 서버 /api/me/tickets(웹과 같은 주소 · 모양).
import { useSyncExternalStore } from 'react';
import { call, errorMessage, planOf, ticketOf, type Plan, type PlanLeg, type SlimLeg, type SlimRoute, type Ticket, type TicketBody } from './api';
import { readToken } from './token';
import { quickestRoute, routeAt, routePath, nextRideDay, shortName } from './ticketRoutes';

export type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; tickets: Ticket[] };
let state: ListState = { status: 'loading' };
const listeners = new Set<() => void>();
function set(next: ListState) { state = next; listeners.forEach(listener => listener()); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useTickets = () => useSyncExternalStore(subscribe, () => state);
export const resetTickets = () => set({ status: 'loading' });
export const ticketById = (id: number) => (state.status === 'ready' ? state.tickets.find(ticket => ticket.id === id) ?? null : null);

// 요청을 보낼 때의 토큰으로 보내고, 응답 때 토큰이 바뀌었으면(로그아웃 · 다른 계정 로그인) 그 응답은 앞 세션 것이라 목록에 넣지 않는다
const withToken = (token: string | null) => (token ? { token } : {});
const sessionChanged = async (token: string | null) => (await readToken()) !== token;

export async function loadTickets(): Promise<void> {
  if (state.status !== 'ready') set({ status: 'loading' });
  const token = await readToken();
  try {
    const reply = await call('GET', '/api/me/tickets', undefined, withToken(token));
    if (await sessionChanged(token)) return;
    const body = reply.body as { tickets?: unknown } | null;
    if (reply.ok && body && Array.isArray(body.tickets)) {
      set({ status: 'ready', tickets: body.tickets.map(ticketOf).filter((ticket): ticket is Ticket => ticket !== null) });
      return;
    }
    if (reply.status !== 401) set({ status: 'error', message: '승차권을 받지 못했어요.' });
  } catch {
    if (await sessionChanged(token)) return;
    set({ status: 'error', message: '승차권을 받지 못했어요. 연결을 확인해 주세요.' });
  }
}

// 저장 · 지우기마다 하나씩 — 카드를 새로 만들어 뒤집힘을 처음 모양으로(웹 renderTickets)
let listTurn = 0;
export const ticketListTurn = () => listTurn;

export type SaveResult = { ok: true; ticket: Ticket } | { ok: false; message: string | null };   // message null = 401(세션 쪽이 이미 안내)

// 발권(id 없음) · 고치기(id)
export async function saveTicket(body: TicketBody, id?: number): Promise<SaveResult> {
  const token = await readToken();
  try {
    const reply = id === undefined ? await call('POST', '/api/me/tickets', body, withToken(token)) : await call('PUT', `/api/me/tickets/${id}`, body, withToken(token));
    if (await sessionChanged(token) || reply.status === 401) return { ok: false, message: null };
    const ticket = reply.ok ? ticketOf(reply.body) : null;
    if (!ticket) return { ok: false, message: errorMessage(reply.body) ?? '발권하지 못했어요.' };
    listTurn += 1;
    if (state.status === 'ready') {
      const tickets = id === undefined ? [...state.tickets, ticket] : state.tickets.map(each => (each.id === id ? ticket : each));
      set({ status: 'ready', tickets });
    }
    return { ok: true, ticket };
  } catch {
    return { ok: false, message: '발권하지 못했어요. 연결을 확인해 주세요.' };
  }
}

export async function deleteTicket(id: number): Promise<{ ok: boolean; message: string | null }> {
  const token = await readToken();
  try {
    const reply = await call('DELETE', `/api/me/tickets/${id}`, undefined, withToken(token));
    if (await sessionChanged(token) || reply.status === 401) return { ok: false, message: null };
    if (!reply.ok && reply.status !== 404) return { ok: false, message: '지우지 못했어요.' };
    listTurn += 1;
    if (state.status === 'ready') set({ status: 'ready', tickets: state.tickets.filter(ticket => ticket.id !== id) });
    return { ok: true, message: null };
  } catch {
    return { ok: false, message: '지우지 못했어요. 연결을 확인해 주세요.' };
  }
}

// 고른 경로를 저장할 칸만(웹 account.mts slimRoute · slimLeg 와 같다 — 서버 clean_ticket 이 그 밖은 버린다)
function slimLeg(leg: PlanLeg): SlimLeg {
  const wait = Math.max(0, Math.round(leg.wait ?? 0));
  const ends = { from: leg.from ?? '', to: leg.to ?? '', departs: leg.departs ?? '', arrives: leg.arrives ?? '' };
  if (leg.type === 'walk') return { type: 'walk', seconds: Math.max(0, Math.round(leg.seconds ?? 0)), ...(leg.exit ? { exit: leg.exit } : {}) };
  if (leg.type === 'bus') {
    const alternatives = (leg.alternatives ?? []).map(({ route, color, departs, arrives, boardAt, alightAt }) => ({
      route, color, departs, arrives, ...(boardAt ? { boardAt } : {}), ...(alightAt ? { alightAt } : {}),
    }));
    return { type: 'bus', route: leg.route ?? '', color: leg.color ?? '', ...ends, wait, ...(alternatives.length ? { alternatives } : {}) };
  }
  return { type: 'ride', line: leg.line ?? '', ...ends, wait };
}
export const slimRoute = (plan: Plan): SlimRoute => ({
  tag: plan.tag ?? '', minutes: plan.minutes, leaveBy: plan.leaveBy, arrives: plan.arrives, transfers: plan.transfers,
  walkMinutes: plan.walkMinutes, legs: plan.legs.map(slimLeg),
});

// /api/route 로 길 찾기(출발 · 도착 · 물을 시각) — 웹 승차권 경로 고르기와 같은 주소
export type RoutesResult = { ok: true; plans: Plan[] } | { ok: false; message: string };
export async function findPlans(from: { lat: number; lng: number }, to: { lat: number; lng: number }, at: string): Promise<RoutesResult> {
  try {
    const reply = await call('GET', routePath(from, to, at), undefined, { auth: false });
    const body = reply.body as { ok?: unknown; plans?: unknown; error?: unknown } | null;
    if (body?.ok === true && Array.isArray(body.plans)) return { ok: true, plans: body.plans.map(planOf).filter((plan): plan is Plan => plan !== null) };
    return { ok: false, message: typeof body?.error === 'string' ? body.error : '길을 찾지 못했어요' };
  } catch {
    return { ok: false, message: '길을 찾지 못했어요. 연결을 확인해 주세요.' };
  }
}

// 뒷면 첫 줄(웹 chainHTML 과 같은 셈): 출발지 → (마지막 빼고) 탄 구간마다 내린 곳 → 도착지 · 환승 N(없으면 바로 · 타지 않으면 걸어서)
const stationOnly = (name: string) => name.replace(/^(.+역)\s+\S*선$/, '$1');
export interface Chain { names: string[]; tag: string }
export function chainOf(ticket: Pick<Ticket, 'from' | 'to'>, legs: readonly { type: string; to?: string }[]): Chain {
  const rides = legs.filter(leg => leg.type !== 'walk');
  const names = [stationOnly(ticket.from.name), ...rides.slice(0, -1).map(leg => leg.to ?? ''), stationOnly(ticket.to.name)].map(shortName);
  let tag = '걸어서';
  if (rides.length > 1) tag = `환승 ${rides.length - 1}`;
  else if (rides.length) tag = '바로';
  return { names, tag };
}
// 고른 경로가 없는 옛 승차권: 다음 탈 날 그 시각으로 찾아 거른 뒤 가장 빠른 길로(웹 fillChain 과 같다)
const chainCache = new Map<string, Chain>();
export async function fillChain(ticket: Ticket): Promise<Chain> {
  if (ticket.route) return chainOf(ticket, ticket.route.legs);
  const at = routeAt(nextRideDay(ticket.days, ticket.depart, new Date()));
  const key = `${ticket.id}|${ticket.from.lat},${ticket.from.lng}|${ticket.to.lat},${ticket.to.lng}|${at}`;
  const cached = chainCache.get(key);
  if (cached) return cached;
  const found = await findPlans(ticket.from, ticket.to, at);
  const plan = found.ok ? quickestRoute(found.plans) : null;
  if (!plan) return { names: [shortName(ticket.from.name), shortName(ticket.to.name)], tag: '길을 찾지 못했어요' };
  const chain = chainOf(ticket, plan.legs);
  chainCache.set(key, chain);
  return chain;
}

export const DAYS = ['월', '화', '수', '목', '금', '토', '일'];   // 1(월) … 7(일)
export const QUICK = [[[1, 2, 3, 4, 5], '평일'], [[6, 7], '주말'], [[1, 2, 3, 4, 5, 6, 7], '매일']] as const;
export const daysText = (days: readonly number[]) => (days.length ? days.map(day => DAYS[day - 1]).join(' ') : '없음');
export const todayDay = () => ((new Date().getDay() + 6) % 7) + 1;
export function timeParts(time: string) {
  const [hour = 8, minute = 0] = (time || '08:00').split(':').map(Number);
  return { ampm: hour < 12 ? '오전' : '오후', clock: `${hour % 12 || 12}:${String(minute).padStart(2, '0')}` };
}
