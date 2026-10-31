// 회원 API(서버 server/routes/members.py · 계획서 8절 "앱 로그인 계약"). 응답 모양은 웹과 같다(web/user/account.mts · account_view.tsx · tickets_view.tsx).
// 모든 회원 주소에 Authorization: Bearer <토큰>, 바꾸는 요청(POST · PUT · DELETE)엔 X-Requested-With: syung 도 싣는다.
// 401(login) = 세션 끝남 → 저장한 토큰을 지우고 로그인 화면으로(session.ts 가 듣는다). 토큰은 어디에도 찍지 않는다.
import { SERVER_ORIGIN } from '../config';
import { readToken } from './token';

export type Avatar = { type: 'character'; id: string } | { type: 'photo'; url: string };
export interface Me { id: number; name: string; provider: string; avatar: Avatar | null }

export interface Place { name: string; lat: number; lng: number }
export interface FoundPlace extends Place { address: string }

// 저장하는 경로의 한 구간(웹 slimLeg 와 같은 칸만 — 서버 clean_ticket 이 그 밖은 버린다)
export type SlimLeg =
  | { type: 'walk'; seconds: number; exit?: string }
  | { type: 'ride'; line: string; from: string; to: string; departs: string; arrives: string; wait: number }
  | { type: 'bus'; route: string; color: string; from: string; to: string; departs: string; arrives: string; wait: number; alternatives?: BusAlternative[] };
export interface BusAlternative { route: string; color: string; departs: string; arrives: string; boardAt?: Record<string, unknown>; alightAt?: Record<string, unknown> }
export interface SlimRoute { tag: string; minutes: number; leaveBy: string; arrives: string; transfers: number; walkMinutes: number; legs: SlimLeg[] }
export interface Ticket { id: number; name: string; from: Place; to: Place; depart: string; days: number[]; route: SlimRoute | null }
export type TicketBody = Omit<Ticket, 'id'>;

// /api/route plans[] 한 개(웹 web/lib/journey-ui.mts Plan 중 승차권이 쓰는 칸) — legs 의 다른 칸은 slimLeg 가 버린다
export interface PlanLeg {
  type: string; seconds?: number; exit?: string; line?: string; route?: string; color?: string; from?: string; to?: string;
  departs?: string; arrives?: string; wait?: number; alternatives?: BusAlternative[];
  metres?: number; stops?: number; toward?: string; destination?: string | null; direction?: string | null; label?: string;   // 단계 목록에서 읽는 칸(저장한 구간에는 없다)
}
export interface Plan { tag?: string; kind: string; leaveBy: string; arrives: string; minutes: number; transfers: number; walkMinutes: number; legs: PlanLeg[] }

export interface Session { id: string; device: string; current?: boolean; lastUsedAt: number; createdAt: number }
export interface Stats {
  daysTogether: number; tickets: number; weeklyRides: number;
  recent: { days: number; openDays: number; route: number; ticket: number };
  daily: { day: string; open: number; route: number; ticket: number }[];
  fare?: { month: string; total: number; skipped: number; reasons: Record<string, number>; tickets: { name: string; fare: number; rides: number; monthly: number }[] };
}

export interface Reply { status: number; ok: boolean; body: unknown }

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === 'string';

// 401 을 받으면 부를 곳(session.ts 가 건다)
let onExpired: (() => void) | null = null;
export function whenExpired(listener: () => void) { onExpired = listener; }

// 서버 주소(/api/… — 앞에 SERVER_ORIGIN 을 붙인다)로 보낸다. 연결이 끊기면 던진다(부르는 쪽이 '연결을 확인해 주세요')
export async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, options: { auth?: boolean; token?: string } = {}): Promise<Reply> {
  const headers: Record<string, string> = {};
  const token = options.token ?? (options.auth === false ? null : await readToken());
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method !== 'GET') headers['X-Requested-With'] = 'syung';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${SERVER_ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (response.headers.get('content-type') ?? '').includes('json') ? await response.json().catch(() => null) : null;
  // 보낼 때의 토큰이 아직 지금 토큰일 때만 — 로그아웃 · 다시 로그인 전에 보낸 옛 요청의 401 이 새 세션을 지우지 않게
  if (response.status === 401 && token && token === await readToken()) onExpired?.();
  return { status: response.status, ok: response.ok, body: json };
}

// 오류 본문 {"error":{"code","message"}} 의 message(없으면 null)
export function errorMessage(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return isString(body.error.message) ? body.error.message : null;
}
export function errorCode(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return isString(body.error.code) ? body.error.code : null;
}

// ---- 응답 검사(서버도 바깥 입력 — 모양이 틀리면 null)
const PHOTO_URL = /^\/api\/me\/avatar\/[\w-]{32}\.(?:webp|jpg)$/;   // 웹 account_view.tsx 와 같은 모양만 그린다

function avatarOf(value: unknown): Avatar | null {
  if (!isRecord(value)) return null;
  if (value.type === 'character' && isString(value.id)) return { type: 'character', id: value.id };
  if (value.type === 'photo' && isString(value.url) && PHOTO_URL.test(value.url)) return { type: 'photo', url: value.url };
  return null;
}
export function meOf(value: unknown): Me | null {
  if (!isRecord(value)) return null;
  const { id, name, provider } = value;
  if (!isNumber(id) || !isString(name) || !isString(provider)) return null;
  return { id, name, provider, avatar: avatarOf(value.avatar) };
}
function placeOf(value: unknown): Place | null {
  if (!isRecord(value)) return null;
  const { name, lat, lng } = value;
  return isString(name) && isNumber(lat) && isNumber(lng) ? { name, lat, lng } : null;
}
function legOf(value: unknown): SlimLeg | null {
  if (!isRecord(value)) return null;
  const { type, from, to, departs, arrives } = value;
  const wait = isNumber(value.wait) ? value.wait : 0;
  if (type === 'walk') return { type: 'walk', seconds: isNumber(value.seconds) ? value.seconds : 0, ...(isString(value.exit) && value.exit ? { exit: value.exit } : {}) };
  if (!isString(from) || !isString(to) || !isString(departs) || !isString(arrives)) return null;
  if (type === 'ride' && isString(value.line)) return { type: 'ride', line: value.line, from, to, departs, arrives, wait };
  if (type === 'bus' && isString(value.route) && isString(value.color)) {
    const alternatives = Array.isArray(value.alternatives) ? value.alternatives.filter((item): item is BusAlternative => isRecord(item) && isString(item.route) && isString(item.color)) : [];
    return { type: 'bus', route: value.route, color: value.color, from, to, departs, arrives, wait, ...(alternatives.length ? { alternatives } : {}) };
  }
  return null;
}
function routeOf(value: unknown): SlimRoute | null {
  if (!isRecord(value) || !Array.isArray(value.legs)) return null;
  const { minutes, leaveBy, arrives, transfers, walkMinutes } = value;
  if (!isNumber(minutes) || !isString(leaveBy) || !isString(arrives) || !isNumber(transfers)) return null;
  const legs = value.legs.map(legOf);
  if (!legs.length || legs.some(leg => leg === null)) return null;
  return { tag: isString(value.tag) ? value.tag : '', minutes, leaveBy, arrives, transfers, walkMinutes: isNumber(walkMinutes) ? walkMinutes : 0, legs: legs.filter((leg): leg is SlimLeg => leg !== null) };
}
export function ticketOf(value: unknown): Ticket | null {
  if (!isRecord(value)) return null;
  const from = placeOf(value.from), to = placeOf(value.to);
  const { id, name, depart, days } = value;
  if (!isNumber(id) || !isString(name) || !from || !to || !isString(depart) || !Array.isArray(days)) return null;
  return { id, name, from, to, depart, days: days.filter(isNumber), route: routeOf(value.route) };
}
export function planOf(value: unknown): Plan | null {
  if (!isRecord(value) || !Array.isArray(value.legs)) return null;
  const { kind, leaveBy, arrives, minutes, transfers, walkMinutes } = value;
  if (!isString(kind) || !isString(leaveBy) || !isString(arrives) || !isNumber(minutes) || !isNumber(transfers)) return null;
  const legs = value.legs.filter((leg): leg is PlanLeg => isRecord(leg) && isString(leg.type));
  return { ...(isString(value.tag) ? { tag: value.tag } : {}), kind, leaveBy, arrives, minutes, transfers, walkMinutes: isNumber(walkMinutes) ? walkMinutes : 0, legs };
}
export function sessionOf(value: unknown): Session | null {
  if (!isRecord(value)) return null;
  const { id, device, lastUsedAt, createdAt } = value;
  if (!isString(id) || !isString(device) || !isNumber(lastUsedAt) || !isNumber(createdAt)) return null;
  return { id, device, lastUsedAt, createdAt, current: value.current === true };
}
export function statsOf(value: unknown): Stats | null {
  if (!isRecord(value) || !isRecord(value.recent) || !Array.isArray(value.daily)) return null;
  const { daysTogether, tickets, weeklyRides } = value;
  const { days, openDays, route, ticket } = value.recent;
  if (!isNumber(daysTogether) || !isNumber(tickets) || !isNumber(weeklyRides) || ![days, openDays, route, ticket].every(isNumber)) return null;
  const daily = value.daily.filter((item): item is Stats['daily'][number] => isRecord(item) && isString(item.day) && isNumber(item.open) && isNumber(item.route) && isNumber(item.ticket));
  const fare = value.fare;
  const fareOk = isRecord(fare) && isString(fare.month) && isNumber(fare.total) && isNumber(fare.skipped) && isRecord(fare.reasons) && Array.isArray(fare.tickets);
  return {
    daysTogether, tickets, weeklyRides, daily,
    recent: { days: Number(days), openDays: Number(openDays), route: Number(route), ticket: Number(ticket) },
    ...(fareOk ? { fare: {
      month: String(fare.month), total: Number(fare.total), skipped: Number(fare.skipped),
      reasons: Object.fromEntries(Object.entries(fare.reasons as Record<string, unknown>).filter((entry): entry is [string, number] => isNumber(entry[1]))),
      tickets: (fare.tickets as unknown[]).filter((item): item is { name: string; fare: number; rides: number; monthly: number } =>
        isRecord(item) && isString(item.name) && isNumber(item.fare) && isNumber(item.rides) && isNumber(item.monthly)),
    } } : {}),
  };
}
export function foundPlaceOf(value: unknown): FoundPlace | null {
  const place = placeOf(value);
  if (!place || !isRecord(value)) return null;
  return { ...place, address: isString(value.address) ? value.address : '' };
}
