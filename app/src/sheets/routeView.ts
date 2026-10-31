// 길찾기 그릴 거리 셈: web/lib/journey-ui.mts 의 routeSteps · trackParts · inkOn · walkText 를 그대로 옮겼다(웹 파일은 DOM 을 함께 다뤄 import 하지 않는다). 칸 이름은 서버 응답(/api/route) 그대로.
import { foundPlaceOf, isRecord, planOf, type Plan as AccountPlan, type PlanLeg } from '../account/api';
import type { LineColors } from './types';
import { sheetColors } from './webColors';

export interface SideStop { name: string; metres: number; walkMinutes?: number; exit?: string; id?: string; ars?: string }
export interface BusAlternative { route: string; color: string; departs: string; arrives: string; boardAt?: SideStop; alightAt?: SideStop }
export interface WalkLeg { type: 'walk'; seconds: number; metres: number; exit: string; label?: string; path?: [number, number][] }
export interface TrainLeg {
  type: 'ride'; line: string; from: string; to: string; departs: string; arrives: string; direction: string; destination: string | null;
  stops: number; wait: number; realtime: boolean; trainNow: string | null; stations: number[]; trainNo?: string | null;
}
export interface BusLeg {
  type: 'bus'; route: string; color: string; from: string; to: string; departs: string; arrives: string; toward: string;
  stops: number; wait: number; realtime: boolean; alts?: string[]; alternatives?: BusAlternative[]; path: [number, number][];
}
export type Leg = WalkLeg | TrainLeg | BusLeg;
// 계획 칸은 승차권과 같은 모양(account/api.ts) — 구간만 그리는 데 필요한 칸까지 좁힌다
export type Plan = Omit<AccountPlan, 'legs'> & { legs: Leg[] };
export interface Place { name: string; address: string; lat: number; lng: number }

export type TrackSegView = { kind: 'walk'; flex: number } | { kind: 'wait'; flex: number } | { kind: 'ride'; flex: number; need: number; color: string; ink: string; bus: boolean; icon: boolean; label: string };
export interface DurationView { hours: number | null; minutes: number }
export interface BusChipView { route: string; color: string; ink: string; side: string | null; detail: string | null }
export interface AlightChipView { route: string; color: string; ink: string; where: string }
export type StepView =
  | { kind: 'place'; at: 'start' | 'end'; name: string; time: string }
  | { kind: 'walk'; text: string; detail: string }
  | { kind: 'board'; name: string; color: string; time: string }
  | { kind: 'ride'; color: string; ink: string; bus: boolean; chip: string; toward: string | null; chips: BusChipView[]; info: string; live: string | null }
  | { kind: 'alight'; name: string; color: string; time: string; chips: AlightChipView[] };
export interface PlanView { aria: string; duration: DurationView; arrive: string; tag: string | null; track: TrackSegView[]; meta: string; live: boolean; steps: StepView[] }

export const ALT_SHOWN = 3;
const toMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
function clockMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
const spanMinutes = (departs: string, arrives: string) => (clockMinutes(arrives) - clockMinutes(departs) + 1440) % 1440;
const legSeconds = (leg: Leg) => (leg.type === 'walk' ? leg.seconds : Math.max(60, spanMinutes(leg.departs, leg.arrives) * 60));
const legColor = (leg: TrainLeg | BusLeg, colors: LineColors) => (leg.type === 'bus' ? leg.color : colors[leg.line] || sheetColors.fallbackLeg);
const legName = (leg: TrainLeg | BusLeg) => (leg.type === 'bus' ? leg.route : leg.line);
const legShort = (leg: TrainLeg | BusLeg) => (leg.type === 'bus' ? leg.route : leg.line.replace(/호선$/, '').replace(/선$/, ''));
const textWidth = (text: string) => [...text].reduce((width, letter) => width + (/[가-힣]/.test(letter) ? 11.5 : 7), 0);

// 노선 색 위 글자: 더 잘 읽히는 쪽(밝은 노선은 어두운 글자, 나머지는 흰 글자)
export function inkOn(hex: string): string {
  const packed = parseInt(hex.slice(1), 16);
  if (Number.isNaN(packed)) return sheetColors.onColor;
  const linear = (part: number) => { const value = part / 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
  const luminance = 0.2126 * linear(packed >> 16) + 0.7152 * linear((packed >> 8) & 255) + 0.0722 * linear(packed & 255);
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.057 ? sheetColors.onColor : sheetColors.inkDark;
}

function walkText(prev: Leg | undefined, next: Leg | undefined, exit: string, label: string | undefined): string {
  const door = exit ? `${exit}번 출구` : '';
  const out = prev?.type === 'ride' && door ? `${door}로 나와 ` : '';
  if (!next) return `${out}목적지까지 걸어서`;
  if (next.type === 'walk') return `${out}${label ? `${label} 걸어서` : '걸어서 이동'}`;
  if (next.type === 'bus') return `${out}${next.from} 정류장까지 걸어서`;
  return `${next.from}역${prev?.type !== 'ride' && door ? ` ${door}` : ''}까지 걸어서`;
}

const sideStop = (stop: SideStop) => (stop.walkMinutes ? `${stop.walkMinutes}분` : `${stop.metres}m`);
function busChip(other: BusAlternative): BusChipView {
  const stop = other.boardAt;
  return {
    route: other.route, color: other.color, ink: inkOn(other.color), side: stop ? `옆 ${sideStop(stop)}` : null,
    detail: stop ? `${stop.name}${stop.ars ? ` ${stop.ars}` : ''} · 걸어서 ${sideStop(stop)}${stop.exit ? ` · ${stop.exit}번 출구 쪽` : ''}` : null,
  };
}

export function routeSteps(legs: readonly Leg[], ends: { from: string; to: string }, colors: LineColors, times: { start: string; end: string }): StepView[] {
  const rows: StepView[] = [{ kind: 'place', at: 'start', name: ends.from, time: times.start }];
  legs.forEach((leg, at) => {
    if (leg.type === 'walk') {
      rows.push({ kind: 'walk', text: walkText(legs[at - 1], legs[at + 1], leg.exit, leg.label), detail: `${toMinutes(leg.seconds)}분${leg.metres ? ` · ${Math.round(leg.metres / 10) * 10}m` : ''}` });
      return;
    }
    const bus = leg.type === 'bus';
    const place = (name: string) => (bus ? name : `${name}역`);
    const color = legColor(leg, colors);
    const ink = inkOn(color);
    const others = bus ? leg.alternatives ?? [] : [];
    const chips: BusChipView[] = bus ? [{ route: leg.route, color, ink, side: null, detail: null }, ...others.map(busChip)] : [];
    const minutes = Math.max(1, spanMinutes(leg.departs, leg.arrives));
    const waits = leg.wait > 60 ? `${toMinutes(leg.wait)}분 기다림` : null;
    const info = [leg.stops ? `${leg.stops}개 ${bus ? '정류장' : '역'}` : null, `${minutes}분`, waits].filter(Boolean).join(' · ');
    const towardTrain = leg.type === 'ride' ? (leg.destination ? `${leg.destination} 방면` : leg.direction || null) : null;
    rows.push(
      { kind: 'board', name: `${place(leg.from)} 승차`, color, time: leg.departs },
      {
        kind: 'ride', color, ink, bus, chip: legName(leg), toward: leg.type === 'bus' ? (leg.toward ? `${leg.toward} 방면` : null) : towardTrain, chips, info,
        live: leg.type === 'ride' && leg.realtime ? `실시간 · 지금 ${leg.trainNow ?? ''}` : null,
      },
      {
        kind: 'alight', name: `${place(leg.to)} 하차`, color, time: leg.arrives,
        chips: others.flatMap((other) => (other.alightAt ? [{ route: other.route, color: other.color, ink: inkOn(other.color), where: other.alightAt.name }] : [])),
      },
    );
  });
  rows.push({ kind: 'place', at: 'end', name: ends.to, time: times.end });
  return rows;
}

type Part = { kind: 'wait'; seconds: number } | { kind: 'walk'; seconds: number } | { kind: 'ride'; seconds: number; leg: TrainLeg | BusLeg };

export function trackParts(legs: readonly Leg[], colors: LineColors, width = 330): TrackSegView[] {
  const parts: Part[] = [];
  for (const leg of legs) {
    if (leg.type === 'walk') { parts.push({ kind: 'walk', seconds: legSeconds(leg) }); continue; }
    if (leg.wait > 30) parts.push({ kind: 'wait', seconds: leg.wait });
    parts.push({ kind: 'ride', seconds: legSeconds(leg), leg });
  }
  const total = parts.reduce((sum, part) => sum + part.seconds, 0) || 1;
  return parts.map((part) => {
    if (part.kind === 'walk') return { kind: 'walk', flex: part.seconds };
    if (part.kind === 'wait') return { kind: 'wait', flex: part.seconds };
    const room = (part.seconds / total) * width;
    const color = legColor(part.leg, colors);
    const full = legName(part.leg);
    const bus = part.leg.type === 'bus';
    return {
      kind: 'ride', flex: part.seconds, need: textWidth(legShort(part.leg)) + 12, color, ink: inkOn(color), bus,
      icon: bus && room >= textWidth(full) + 34, label: room >= textWidth(full) + 14 ? full : legShort(part.leg),
    };
  });
}

export const durationParts = (total: number): DurationView => (total >= 60 ? { hours: Math.floor(total / 60), minutes: total % 60 } : { hours: null, minutes: total });

export function planView(plan: Plan, ends: { from: string; to: string }, colors: LineColors): PlanView {
  return {
    aria: `${plan.tag || '경로'} ${plan.minutes}분, ${plan.arrives} 도착, 지도에서 보기`, duration: durationParts(plan.minutes), arrive: `${plan.leaveBy} → ${plan.arrives}`, tag: plan.tag || null,
    track: trackParts(plan.legs, colors), meta: `환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`, live: plan.legs.some((leg) => leg.type !== 'walk' && leg.realtime),
    steps: routeSteps(plan.legs, { from: ends.from || '출발', to: ends.to || '도착' }, colors, { start: plan.leaveBy, end: plan.arrives }),
  };
}

// ---- 서버 응답 검사(/api/route · /api/place — 바깥 입력이라 모양이 틀리면 버린다)
const isText = (value: unknown): value is string => typeof value === 'string';
function isLeg(value: PlanLeg): value is PlanLeg & Leg {
  if (value.type === 'walk') return typeof value.seconds === 'number';
  const stops = [value.from, value.to, value.departs, value.arrives].every(isText);
  if (value.type === 'ride') return stops && isText(value.line);
  return value.type === 'bus' && stops && isText(value.route) && isText(value.color);
}
function routePlanOf(value: unknown): Plan | null {
  const plan = planOf(value);
  if (!plan || !plan.legs.every(isLeg)) return null;
  return { ...plan, legs: plan.legs.filter(isLeg) };
}
const answerError = (answer: Record<string, unknown>) => (isText(answer.error) && answer.error ? answer.error : null);

export type RouteAnswer = { ok: true; plans: Plan[] } | { ok: false; error: string | null };
export function routeAnswerOf(value: unknown): RouteAnswer {
  if (!isRecord(value)) return { ok: false, error: null };
  if (value.ok !== true || !Array.isArray(value.plans)) return { ok: false, error: answerError(value) };
  const plans = value.plans.map(routePlanOf).filter((plan): plan is Plan => plan !== null);
  return plans.length ? { ok: true, plans } : { ok: false, error: null };
}

export type PlaceAnswer = { ok: true; places: Place[] } | { ok: false; error: string | null };
export function placeAnswerOf(value: unknown): PlaceAnswer {
  if (!isRecord(value)) return { ok: false, error: null };
  if (value.ok !== true || !Array.isArray(value.places)) return { ok: false, error: answerError(value) };
  return { ok: true, places: value.places.map(foundPlaceOf).filter((place): place is Place => place !== null) };
}
