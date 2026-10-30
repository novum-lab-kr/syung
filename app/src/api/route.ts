// 길찾기 /api/route?from=위도,경도&to=위도,경도(server/routes/journey.py route · 웹 web/lib/journey-ui.mts 와 같은 주소).
// 응답 { ok, plans[], error? } — ok 가 거짓이면 error 에 한국어 안내(서버가 정한 문구).
import { SERVER_ORIGIN } from '../config';
import type { RoutePlan } from '../map/bridge';

export interface Point { lat: number; lon: number }
export type RouteResult = { ok: true; plan: RoutePlan } | { ok: false; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export async function findRoute(from: Point, to: Point, signal?: AbortSignal): Promise<RouteResult> {
  const url = `${SERVER_ORIGIN}/api/route?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`;
  let answer: unknown;
  try {
    const response = await fetch(url, { signal });
    answer = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ok: false, message: '연결이 불안정해요. 잠시 뒤 다시 찾아 주세요.' };
  }
  if (!isRecord(answer)) return { ok: false, message: '경로를 받지 못했어요.' };
  const first: unknown = Array.isArray(answer.plans) ? answer.plans[0] : undefined;
  if (answer.ok === true && isRecord(first) && Array.isArray(first.legs)) return { ok: true, plan: { ...first, legs: first.legs } };
  return { ok: false, message: typeof answer.error === 'string' ? answer.error : '출발지나 도착지를 바꿔 보세요.' };
}
