// 앱 ↔ 지도 다리 v2(앱 쪽). 계약 정본: 계획서 plans/feature/20261030-슝-앱-만들기.md 6절 표 · 웹 web/ui/app_bridge.mts.
// 메시지 이름 · 칸을 바꾸려면 웹과 같이 바꾼다(아테나 승인 · version 을 올린다). 지도에서 온 글자는 바깥 입력이라 여기서 모양을 검사한다.
import type { BusSheetView, LineColors, SheetCommand, TrainUpdate } from '../sheets/types';

export const BRIDGE_VERSION = 2;

export interface StationInfo { id: number; name: string; lines: string[]; lat: number; lon: number }
export interface TrainInfo {
  id: string; line: string; trainNo: string; station: string; destination: string; direction: string; status: string;
  express: boolean; last: boolean; receivedAt: string | null;
}
export type BridgeErrorCode = 'bad_message' | 'unknown_type' | 'bad_field' | 'not_ready' | 'failed';

// 지도 → 앱
export type MapMessage =
  | { type: 'ready'; version: number; mode: string; modes: string[]; colors: LineColors; theme: ThemeState | null; prefs: PrefsState | null }
  | { type: 'themeChanged'; theme: ThemeState }
  | { type: 'prefsChanged'; prefs: PrefsState }
  | { type: 'sky'; sky: SkyState }
  | { type: 'stationTap'; station: StationInfo }
  | { type: 'trainTap'; train: TrainInfo }
  | { type: 'modeChanged'; mode: string }
  | { type: 'trainUpdate'; update: TrainUpdate }
  | { type: 'trainGone'; id: string }
  | { type: 'busTap'; view: BusSheetView; selection: BusSelection }
  | { type: 'busUpdate'; view: BusSheetView; selection: BusSelection }
  | { type: 'busClosed' }
  | { type: 'error'; code: string; message: string; request?: string }
  | { type: 'followChanged'; id: string | null }
  | { type: 'rideChanged'; riding: boolean; id: string | null; text: string }
  // 아는 메시지지만 화면이 아직 쓰지 않는다(줌 · 실시간 글) — 경고 없이 넘긴다
  | { type: 'unused' };
export interface BusSelection { kind: string; id: string }
// 칸은 web/ui/app_bridge.mts ThemeState · PrefsState · SkyState 와 같다
export type ThemeChoice = 'auto' | 'light' | 'dark';
export interface ThemeState { choice: ThemeChoice; theme: 'light' | 'dark'; note: string }
export interface PrefsState { prebuild: boolean; saver: boolean; speed: number; speedNote: string }
export interface SkyMotion { clouds: string | null; fall: string | null; trainSpeed: number }
export interface SkyState { layers: { back: string; sun: string; front: string }; temp: string | null; sunset: string; sunrise: string; night: boolean; label: string | null; motion: SkyMotion }

// /api/route 응답 plans[] 한 개 — 앱은 칸을 고치지 않고 그대로 지도에 넘긴다(검사는 지도 쪽)
export type RoutePlan = { legs: unknown[] } & Record<string, unknown>;

// 앱 → 지도
export type AppCommand =
  | { type: 'showRoute'; plan: RoutePlan; padding?: { bottom?: number; right?: number } }
  | { type: 'clearRoute' }
  | { type: 'focusStation'; id: number; zoom?: number }
  | { type: 'setMode'; mode: string }
  // 메뉴를 열고 닫을 때(그래야 기온 · 날씨 글이 온다)
  | { type: 'skyOpen'; open: boolean }
  | { type: 'setTheme'; choice: ThemeChoice }
  // 지금 시트 높이(화면 px) — 따라가기 · 경로 맞추기가 이만큼 위로 잡는다
  | { type: 'setPadding'; bottom: number }
  | { type: 'setPref'; key: 'prebuild' | 'saver'; value: boolean }
  | { type: 'setPref'; key: 'speed'; value: number }
  | SheetCommand;

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

const isColors = (value: unknown): value is LineColors => isRecord(value) && Object.values(value).every(isString);

function updateOf(data: Fields): TrainUpdate | null {
  const { id, dest, now, raw, ride } = data;
  if (!isString(id) || !isString(dest) || !isString(now) || !isRecord(raw) || (ride !== null && !isRecord(ride))) return null;
  return data as unknown as TrainUpdate;   // raw · ride 속 칸은 지도가 만든 값 그대로 그린다(글자로만 쓴다)
}

function busOf(type: 'busTap' | 'busUpdate', data: Fields): MapMessage | null {
  const { view, selection } = data;
  if (!isRecord(view) || (view.kind !== 'stop' && view.kind !== 'route')) return null;
  if (!isRecord(selection) || !isString(selection.kind) || !isString(selection.id)) return null;
  return { type, view: view as unknown as BusSheetView, selection: { kind: selection.kind, id: selection.id } };
}

const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
function themeOf(value: unknown): ThemeState | null {
  if (!isRecord(value) || !isString(value.note)) return null;
  const { choice, theme, note } = value;
  if ((choice !== 'auto' && choice !== 'light' && choice !== 'dark') || (theme !== 'light' && theme !== 'dark')) return null;
  return { choice, theme, note };
}
function prefsOf(value: unknown): PrefsState | null {
  if (!isRecord(value)) return null;
  const { prebuild, saver, speed, speedNote } = value;
  return typeof prebuild === 'boolean' && typeof saver === 'boolean' && isNumber(speed) && isString(speedNote) ? { prebuild, saver, speed, speedNote } : null;
}
function skyOf(value: Record<string, unknown>): SkyState | null {
  const { layers, temp, sunset, sunrise, night, label, motion } = value;
  if (!isRecord(layers) || !isString(layers.back) || !isString(layers.sun) || !isString(layers.front)) return null;
  if (!isNullableString(temp) || !isString(sunset) || !isString(sunrise) || typeof night !== 'boolean' || !isNullableString(label)) return null;
  if (!isRecord(motion) || !isNullableString(motion.clouds) || !isNullableString(motion.fall) || !isNumber(motion.trainSpeed)) return null;
  return {
    layers: { back: layers.back, sun: layers.sun, front: layers.front }, temp, sunset, sunrise, night, label,
    motion: { clouds: motion.clouds, fall: motion.fall, trainSpeed: motion.trainSpeed },
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
      return { type: 'ready', version: data.version, mode: data.mode, modes: data.modes, colors: isColors(data.colors) ? data.colors : {}, theme: themeOf(data.theme), prefs: prefsOf(data.prefs) };
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
    case 'trainUpdate': {
      const update = updateOf(data);
      return update ? { type: 'trainUpdate', update } : null;
    }
    case 'trainGone':
      return isString(data.id) ? { type: 'trainGone', id: data.id } : null;
    case 'busTap': case 'busUpdate':
      return busOf(data.type, data);
    case 'busClosed':
      return { type: 'busClosed' };
    case 'themeChanged': {
      const { type: _type, ...rest } = data;
      const theme = themeOf(rest);
      return theme ? { type: 'themeChanged', theme } : null;
    }
    case 'prefsChanged': {
      const prefs = prefsOf(data.prefs);
      return prefs ? { type: 'prefsChanged', prefs } : null;
    }
    case 'sky': {
      const sky = skyOf(data);
      return sky ? { type: 'sky', sky } : null;
    }
    case 'followChanged':
      return isNullableString(data.id) ? { type: 'followChanged', id: data.id } : null;
    case 'rideChanged':
      return typeof data.riding === 'boolean' && isNullableString(data.id) && isString(data.text) ? { type: 'rideChanged', riding: data.riding, id: data.id, text: data.text } : null;
    case 'status':
      return { type: 'unused' };
    default:
      return null;
  }
}
