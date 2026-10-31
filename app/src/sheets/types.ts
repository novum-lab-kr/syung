// 시트가 쓰는 다리 v2 모양: 정본은 web/ui/app_bridge.mts · web/bus/layer.mts 49~69(계획서 6절 v2 표). 칸 이름을 바꾸지 않는다.
// 지도에서 온 글자 검사는 map/bridge.ts 몫이고, 시트는 검사를 거친 값을 props 로 받는다.

export type LineColors = Readonly<Record<string, string>>;   // ready.colors(노선 이름 → 색)

export interface Seat { car: number; row: number; side: number }   // 칸 1 = 맨 앞 · 줄 1 = 칸의 맨 앞 · side -1 왼쪽 · 1 오른쪽
export interface TrainRaw { station: string; status: string; direction: string; destination: string; recorded: string; ageSec: number; fetched: string }
export interface TrainUpdate { id: string; dest: string; now: string; raw: TrainRaw; ride: { cars: number; rows: number; seat: Seat } | null }

export interface BusBadgeView { name: string; long: boolean; color: string }
export interface BusStopButton { what: string; label: string; aria: string }
export interface BusFollowLineView { following: boolean; badge: BusBadgeView; state: string; arrival: string; buttons: BusStopButton[] }
export type BusRowTime = { kind: 'wait' } | { kind: 'none' } | { kind: 'soon' } | { kind: 'eta'; where: string; at: number; left: string } | { kind: 'away'; text: string };
export interface BusRowView { routeId: string; live: boolean; pressed: boolean; badge: BusBadgeView; direction: string; tag: string; time: BusRowTime }
export interface BusHeroView {
  one: boolean; button: boolean; routeId: string; pressed: boolean; badges: BusBadgeView[]; more: number; direction: string; onMap: boolean; next: string;
  trackRoute: string | null; ratio: number; prev: string; stop: string; after: string;
}
export interface BusEndedView { routeId: string; name: string; live: boolean; pressed: boolean }
export interface BusStopSheetView {
  kind: 'stop'; name: string; arsId: string; compact: boolean; refresh: { clock: string; loading: boolean } | null; followLine: BusFollowLineView | null;
  note: string; stopNote: string; mock: boolean; hero: BusHeroView | null; rows: BusRowView[]; ended: BusEndedView[];
}
export interface BusRouteSheetView {
  kind: 'route'; typeName: string; typeColor: string; name: string; approx: boolean; note: string;
  grid: { next: string; onPath: boolean; clockLabel: string; time: string } | null;
}
export type BusSheetView = BusStopSheetView | BusRouteSheetView;

// 시트가 지도로 보내는 명령(app_bridge.mts AppCommand 중 시트 몫)
export type SheetCommand =
  | { type: 'watchTrain' | 'followTrain' | 'followBus'; id: string }
  | { type: 'unwatchTrain' | 'stopFollow' | 'stopRide' | 'closeBus' | 'busRefresh' }
  | { type: 'startRide'; id: string; seat: Seat }
  | { type: 'busRoute'; routeId: string }
  | { type: 'busStopView'; what: 'follow' | 'route' | 'stop' };
export type SendCommand = (command: SheetCommand) => void;
