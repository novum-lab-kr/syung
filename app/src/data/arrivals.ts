// 역 도착 정보: /api/live?arrivals=(server/services/live.py index_arrivals) · 글자 · 차례 · 카드 묶기는 web/ui/popups.mts 와 같다.
import { SERVER_ORIGIN } from '../config';
import type { StationInfo } from '../map/bridge';

export interface Arrival {
  line: string; direction: string; heading: string; destination: string; eta: number | null; message: string;
  express: boolean; last: boolean; receivedAt: string | null;
}
export interface ArrivalsAnswer { fetchedAt: string; arrivals: Arrival[] }
export interface ArrivalRow { text: string; destination: string; express: boolean; last: boolean }
export interface ArrivalCard { line: string; direction: string; toward: string; rows: ArrivalRow[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function arrivalOf(value: unknown): Arrival | null {
  if (!isRecord(value)) return null;
  const { line, direction, heading, destination, eta, message, express, last, receivedAt } = value;
  if (typeof line !== 'string' || typeof direction !== 'string' || typeof heading !== 'string' || typeof destination !== 'string' || typeof message !== 'string') return null;
  return {
    line, direction, heading, destination, message, express: express === true, last: last === true,
    eta: typeof eta === 'number' ? eta : null, receivedAt: typeof receivedAt === 'string' ? receivedAt : null,
  };
}

export async function fetchArrivals(name: string, signal: AbortSignal): Promise<ArrivalsAnswer> {
  const query = encodeURIComponent(name.replace(/\([^)]*\)/g, ''));
  const response = await fetch(`${SERVER_ORIGIN}/api/live?arrivals=${query}`, { signal, cache: 'no-store' });
  const answer: unknown = await response.json();
  if (!response.ok || !isRecord(answer) || answer.ok !== true || typeof answer.fetchedAt !== 'string') throw new Error('도착 정보 응답이 다르다');
  const list = Array.isArray(answer.arrivals) ? answer.arrivals : [];
  return { fetchedAt: answer.fetchedAt, arrivals: list.flatMap((item: unknown) => arrivalOf(item) ?? []) };
}

// 받은 시각(서울 시각 글자 "YYYY-MM-DD HH:MM:SS")부터 지난 초 — web/trains/plan.mts age
function ageSeconds(received: string | null, now: number): number {
  const found = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(received ?? '');
  if (!found) return 0;
  const [year, month, day, hour, minute, second] = found.slice(1).map(Number) as [number, number, number, number, number, number];
  return Math.max(0, (now - Date.UTC(year, month - 1, day, hour - 9, minute, second)) / 1000);
}

export function arrivalText(arrival: Arrival, now: number): string {
  if (arrival.eta !== null && arrival.eta > 0) {
    const left = Math.max(0, arrival.eta - ageSeconds(arrival.receivedAt, now));
    return left < 60 ? '곧 도착' : `${Math.floor(left / 60)}분 후`;
  }
  return arrival.message.replace(/\[(\d+)\]번째 전역/, '$1번째 전역') || '-';
}

export function arrivalRank(arrival: Arrival, now: number): number {
  if (arrival.eta !== null && arrival.eta > 0) return Math.max(0, arrival.eta - ageSeconds(arrival.receivedAt, now));
  const { message } = arrival;
  if (/도착|진입/.test(message) && !/전역/.test(message)) return 0;
  const count = Number(/\[(\d+)\]/.exec(message)?.[1] ?? 0);
  if (count) return count * 120;
  return /전역/.test(message) ? 90 : 600;
}

// 노선 · 방향마다 곧 오는 두 대(역의 노선 차례, 같은 노선은 방향 이름 차례)
export function arrivalCards(station: StationInfo, arrivals: Arrival[], now: number): ArrivalCard[] {
  const groups = new Map<string, Arrival[]>();
  for (const arrival of arrivals) {
    const key = `${arrival.line}|${arrival.direction}`;
    groups.set(key, [...(groups.get(key) ?? []), arrival]);
  }
  const order = (key: string) => station.lines.indexOf(key.split('|')[0] ?? '');
  return [...groups.keys()].sort((left, right) => order(left) - order(right) || left.localeCompare(right, 'ko')).map((key) => {
    const list = [...(groups.get(key) ?? [])].sort((left, right) => arrivalRank(left, now) - arrivalRank(right, now)).slice(0, 2);
    const [line = '', direction = ''] = key.split('|');
    return {
      line, direction, toward: (list[0]?.heading.split('-')[1] ?? '').trim(),
      rows: list.map((arrival) => ({ text: arrivalText(arrival, now), destination: arrival.destination, express: arrival.express, last: arrival.last })),
    };
  });
}

export const seoulTime = (iso: string): string => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
