// 앱 ↔ 지도 다리 v1(앱 쪽). 계약 정본: 계획서 plans/feature/20261030-슝-앱-만들기.md 6절 "앱 ↔ 지도 다리 계약 v1" 표 · 웹 web/ui/app_bridge.mts.
// 메시지 이름 · 칸을 바꾸려면 웹과 같이 바꾼다(아테나 승인 · version 을 올린다). 지도에서 온 글자는 바깥 입력이라 여기서 모양을 검사한다.

export const BRIDGE_VERSION = 1;

export interface StationInfo { id: number; name: string; lines: string[]; lat: number; lon: number }
export interface TrainInfo {
  id: string; line: string; trainNo: string; station: string; destination: string; direction: string; status: string;
  express: boolean; last: boolean; receivedAt: string | null;
}
export type BridgeErrorCode = 'bad_message' | 'unknown_type' | 'bad_field' | 'not_ready' | 'failed';

// 지도 → 앱
export type MapMessage =
  | { type: 'ready'; version: number; mode: string; modes: string[] }
  | { type: 'stationTap'; station: StationInfo }
  | { type: 'trainTap'; train: TrainInfo }
  | { type: 'modeChanged'; mode: string }
  | { type: 'error'; code: string; message: string; request?: string };

// /api/route 응답 plans[] 한 개 — 앱은 칸을 고치지 않고 그대로 지도에 넘긴다(검사는 지도 쪽)
export type RoutePlan = { legs: unknown[] } & Record<string, unknown>;

// 앱 → 지도
export type AppCommand =
  | { type: 'showRoute'; plan: RoutePlan; padding?: { bottom?: number; right?: number } }
  | { type: 'clearRoute' }
  | { type: 'focusStation'; id: number; zoom?: number }
  | { type: 'setMode'; mode: string };

type Fields = Record<string, unknown>;
const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

function stationOf(value: unknown): StationInfo | null {
  if (!isRecord(value)) return null;
  const { id, name, lines, lat, lon } = value;
  if (!isNumber(id) || !isString(name) || !isStringList(lines) || !isNumber(lat) || !isNumber(lon)) return null;
  return { id, name, lines, lat, lon };
}

function trainOf(value: unknown): TrainInfo | null {
  if (!isRecord(value)) return null;
  const { id, line, trainNo, station, destination, direction, status, express, last, receivedAt } = value;
  const texts = [id, line, trainNo, station, destination, direction, status];
  if (!texts.every(isString) || typeof express !== 'boolean' || typeof last !== 'boolean') return null;
  if (receivedAt !== null && !isString(receivedAt)) return null;
  return {
    id: String(id), line: String(line), trainNo: String(trainNo), station: String(station), destination: String(destination),
    direction: String(direction), status: String(status), express, last, receivedAt,
  };
}

// 웹뷰 onMessage 의 글자 하나 → 지도 메시지. 모양이 틀리면 null(버린다 — 지도 쪽 버그는 개발 중 콘솔로 본다)
export function parseMapMessage(text: string): MapMessage | null {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return null; }
  if (!isRecord(data) || !isString(data.type)) return null;
  switch (data.type) {
    case 'ready':
      if (!isNumber(data.version) || !isString(data.mode) || !isStringList(data.modes)) return null;
      return { type: 'ready', version: data.version, mode: data.mode, modes: data.modes };
    case 'stationTap': {
      const station = stationOf(data.station);
      return station ? { type: 'stationTap', station } : null;
    }
    case 'trainTap': {
      const train = trainOf(data.train);
      return train ? { type: 'trainTap', train } : null;
    }
    case 'modeChanged':
      return isString(data.mode) ? { type: 'modeChanged', mode: data.mode } : null;
    case 'error': {
      if (!isString(data.code) || !isString(data.message)) return null;
      return { type: 'error', code: data.code, message: data.message, ...(isString(data.request) ? { request: data.request } : {}) };
    }
    default:
      return null;
  }
}
