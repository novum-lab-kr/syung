// 앱 ↔ 지도 다리(웹 쪽): 슝 앱(React Native · Expo)이 웹뷰에 이 지도를 앱 지도 모드(주소 #app — index.html 첫 스크립트가 html[data-app=map])로 띄우면
// 지도 → 앱: window.ReactNativeWebView.postMessage(JSON 글자) — ready · stationTap · trainTap · modeChanged · error
//   v2(더하기만): themeChanged · trainUpdate · trainGone · followChanged · rideChanged · prefsChanged · status · sky · busTap · busUpdate · busClosed
// 앱 → 지도: 웹뷰의 postMessage(JSON 글자 — iOS 는 window, Android 는 document 의 message 이벤트) — showRoute · clearRoute · focusStation · setMode
//   v2(더하기만): setTheme · setPadding · watchTrain · unwatchTrain · followTrain · stopFollow · startRide · stopRide · setPref · skyOpen
//   · closeBus · followBus · busRoute · busRefresh · busStopView
// 메시지 이름 · 칸은 계획서(plans/feature/20261030-슝-앱-만들기.md) 6절 "다리 v2" 표 — 바꾸면 앱도 같이 바꾼다(version 을 올린다).
// 상태 알림(themeChanged · status · sky · prefsChanged · followChanged · rideChanged · busUpdate)은 같은 값이면 다시 보내지 않고, ready 전에는 보내지 않는다.
// 이 파일은 고르기 · 검사만 한다(화면 · 지도는 본체가 넘긴 함수로) — 다른 화면 파일을 import 하지 않는다(본체가 같은 단계에서 요청).
import type { MapStation, TrainPlan } from '../trains/types.mts';
import type { JourneyLeg, JourneyPlan } from './journey.mts';
import type { BusSheetView } from '../bus/layer.mts';

export const APP_BRIDGE_VERSION = 2;
// 앱 지도 모드 버스 안내 글의 아래 자리(px): 시트 위로 8px · 경로 막대는 앱이 showRoute padding 으로 잡아 둔 자리, 큰 쪽(둘 다 없으면 0 — 바닥값은 syung.css)
export const appNoticeLift = (sheet:number, route:number):number => Math.max(sheet?sheet+8:0, route);

type Position = [number, number];
// 지도 → 앱
export interface StationInfo { id:number; name:string; lines:string[]; lat:number; lon:number }
export interface TrainInfo {
  id:string; line:string; trainNo:string; station:string; destination:string; direction:string; status:string;
  express:boolean; last:boolean; receivedAt:string|null;
}
// v2 상태 칸(값은 본체가 만든다 — 문장은 웹과 같은 글자)
export type ThemeChoice = 'auto' | 'light' | 'dark';
export interface ThemeState { choice:string; theme:'light' | 'dark'; note:string }
export interface PrefsState { prebuild:boolean; saver:boolean; speed:number; speedNote:string }
export interface LiveStatus { state:string; text:string }   // state: idle · loading · ok · error(trains/live_feed.mts)
export interface MapStatus { zoom:number; live:LiveStatus }
export interface SkyMotion { clouds:string|null; fall:string|null; trainSpeed:number }   // 이름 = brand/sky-<이름>.json · 지하철(sky-train)은 늘
export interface SkyState {
  layers:{ back:string; sun:string; front:string }; temp:string|null; sunset:string; sunrise:string; night:boolean; label:string|null; motion:SkyMotion;
}
export interface Seat { car:number; row:number; side:number }   // 칸 1 = 맨 앞 · 줄 1 = 칸의 맨 앞 · side -1 왼쪽 · 1 오른쪽(modes/coaster/first_person.mts)
export interface TrainRaw { station:string; status:string; direction:string; destination:string; recorded:string; ageSec:number; fetched:string }   // ui/train_sheet.tsx TrainRawView 와 같은 칸
export interface TrainUpdate { id:string; dest:string; now:string; raw:TrainRaw; ride:{ cars:number; rows:number; seat:Seat } | null }
export interface RideState { riding:boolean; id:string|null; text:string }
export interface BusSelection { kind:string; id:string }   // stop · route · bus(bus/layer.mts selection)
export interface ReadyInfo { mode:string; modes:string[]; colors:Record<string, string>; theme:ThemeState; prefs:PrefsState }
export type MapMessage =
  | ({ type:'ready'; version:number } & ReadyInfo)
  | ({ type:'themeChanged' } & ThemeState)
  | ({ type:'trainUpdate' } & TrainUpdate)
  | { type:'trainGone'; id:string }
  | { type:'followChanged'; id:string|null }
  | ({ type:'rideChanged' } & RideState)
  | { type:'prefsChanged'; prefs:PrefsState }
  | ({ type:'status' } & MapStatus)
  | ({ type:'sky' } & SkyState)
  | { type:'busTap' | 'busUpdate'; view:BusSheetView; selection:BusSelection }
  | { type:'busClosed' }
  | { type:'stationTap'; station:StationInfo }
  | { type:'trainTap'; train:TrainInfo }
  | { type:'modeChanged'; mode:string }
  | { type:'error'; code:ErrorCode; message:string; request?:string };
// 앱 → 지도(검사를 거친 것)
export interface RoutePadding { bottom?:number; right?:number }
export type AppCommand =
  | { type:'showRoute'; plan:JourneyPlan; padding:RoutePadding }
  | { type:'clearRoute' }
  | { type:'focusStation'; id:number; zoom:number|null }
  | { type:'setMode'; mode:string }
  | { type:'setTheme'; choice:ThemeChoice }
  | { type:'setPadding'; bottom:number }
  | { type:'watchTrain' | 'followTrain' | 'followBus'; id:string }
  | { type:'unwatchTrain' | 'stopFollow' | 'stopRide' | 'closeBus' | 'busRefresh' }
  | { type:'startRide'; id:string; seat:Seat }
  | { type:'setPref'; key:'prebuild' | 'saver'; value:boolean }
  | { type:'setPref'; key:'speed'; value:number }
  | { type:'skyOpen'; open:boolean }
  | { type:'busRoute'; routeId:string }
  | { type:'busStopView'; what:'follow' | 'route' | 'stop' };
export type ErrorCode = 'bad_message' | 'unknown_type' | 'bad_field' | 'not_ready' | 'failed';
export type Parsed = { ok:true; command:AppCommand } | { ok:false; code:ErrorCode; message:string; request?:string } | null;

// 검사에 쓰는 지금 지도의 사실(본체가 넘긴다)
export interface BridgeFacts { hasStation(id:number):boolean; hasLine(line:string):boolean; hasMode(id:string):boolean }

const isRecord = (value:unknown):value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value);
const isId = (value:unknown):value is string => typeof value === 'string' && value.length > 0;
const isCount = (value:unknown):value is number => isNumber(value) && Number.isInteger(value) && value >= 1;
const isSeat = (value:unknown):value is Seat => isRecord(value) && isCount(value.car) && isCount(value.row) && (value.side === -1 || value.side === 1);
export const COASTER_SPEEDS:readonly number[] = [1, 5, 20];   // 메뉴 속도 단추(ui/settings_menu.tsx)
// [경도, 위도] — 유한수이고 경도 -180~180 · 위도 -90~90(틀린 좌표는 GeoJSON · 지도 맞추기를 깨뜨린다)
const isPosition = (value:unknown):value is Position => Array.isArray(value) && value.length >= 2
  && isNumber(value[0]) && value[0] >= -180 && value[0] <= 180 && isNumber(value[1]) && value[1] >= -90 && value[1] <= 90;
const isPath = (value:unknown):value is Position[] => Array.isArray(value) && value.length >= 2 && value.every(isPosition);

// 역 · 열차 → 앱에 보낼 칸(역 id 는 index.html stationData 의 id — /api/route 응답 legs[].stations 와 같은 번호)
export function stationInfo(station:MapStation):StationInfo {
  return { id:station.id, name:station.name, lines:station.lines.map(line => line.name), lat:station.lat, lon:station.lon };
}
export function trainInfo(plan:TrainPlan):TrainInfo {
  const train = plan.t;
  return {
    id:plan.id, line:String(train.line), trainNo:String(train.trainNo), station:String(train.station ?? ''), destination:String(train.destination ?? ''),
    direction:String(train.direction ?? ''), status:String(train.status ?? ''), express:!!train.express, last:!!train.last, receivedAt:train.receivedAt ?? null,
  };
}

// 길찾기 구간 하나 검사 — 지도가 그릴 때 읽는 칸만(ui/journey.mts showRoute): 걷기 path · 지하철 line · stations · path(있으면) · 버스 path. 나머지 칸은 그대로 둔다(버스 층이 읽는다)
// 걷기 path 는 꼭 있어야 한다: showRoute 가 걷기 선 · 출발/도착 핀을 path 로 그린다(/api/route 는 걷기마다 늘 싣는다 — server/services/journey_graph.py walk_path)
function legProblem(leg:unknown, index:number, facts:BridgeFacts):string|null {
  if (!isRecord(leg)) return `plan.legs[${index}] 가 객체가 아니다`;
  const pathProblem = `plan.legs[${index}].path 는 [경도, 위도](경도 -180~180 · 위도 -90~90) 둘 이상`;
  if (leg.type === 'walk' || leg.type === 'bus') return isPath(leg.path) ? null : pathProblem;
  if (leg.type !== 'ride') return `plan.legs[${index}].type 은 walk · ride · bus`;
  if (typeof leg.line !== 'string' || !facts.hasLine(leg.line)) return `plan.legs[${index}].line 이 지도에 없는 노선`;
  if (leg.path !== undefined && !isPath(leg.path)) return pathProblem;
  const stations = leg.stations;
  if (!Array.isArray(stations) || stations.length < 2) return `plan.legs[${index}].stations 는 역 id 둘 이상`;
  for (const id of stations) if (!isNumber(id) || !facts.hasStation(id)) return `plan.legs[${index}].stations 에 지도에 없는 역 id`;
  return null;
}

// 앱에서 온 메시지 하나 → 명령 · 오류. 다리 메시지가 아닌 것(JSON 이 아니거나 type 글자가 없음)은 null — 대답하지 않는다
export function parseAppMessage(raw:unknown, facts:BridgeFacts):Parsed {
  let data:unknown = raw;
  if (typeof raw === 'string') { try { data = JSON.parse(raw) } catch { return null } }
  if (!isRecord(data) || typeof data.type !== 'string') return null;
  const type = data.type, bad = (message:string):Parsed => ({ ok:false, code:'bad_field', message, request:type });
  switch (type) {
    case 'showRoute': {
      const plan = data.plan;
      if (!isRecord(plan) || !Array.isArray(plan.legs) || !plan.legs.length) return bad('plan.legs 는 구간 하나 이상(/api/route 응답 plans[] 한 개 그대로)');
      for (const [index, leg] of plan.legs.entries()) { const problem = legProblem(leg, index, facts); if (problem) return bad(problem) }
      const padding:RoutePadding = {}, pad = data.padding;
      if (pad !== undefined) {
        if (!isRecord(pad)) return bad('padding 은 { bottom, right }(화면 px)');
        for (const side of ['bottom', 'right'] as const) {
          const value = pad[side];
          if (value === undefined) continue;
          if (!isNumber(value) || value < 0) return bad(`padding.${side} 는 0 이상의 수(화면 px)`);
          padding[side] = value;
        }
      }
      return { ok:true, command:{ type, plan:{ ...plan, legs:plan.legs as JourneyLeg[] }, padding } };
    }
    case 'clearRoute': return { ok:true, command:{ type } };
    case 'focusStation': {
      if (!isNumber(data.id) || !facts.hasStation(data.id)) return bad('id 는 지도에 있는 역 id(stationTap 의 station.id)');
      if (data.zoom !== undefined && (!isNumber(data.zoom) || data.zoom < 7 || data.zoom > 20)) return bad('zoom 은 7~20');
      return { ok:true, command:{ type, id:data.id, zoom:isNumber(data.zoom) ? data.zoom : null } };
    }
    case 'setMode':
      if (typeof data.mode !== 'string' || !facts.hasMode(data.mode)) return bad('mode 는 ready 의 modes 중 하나');
      return { ok:true, command:{ type, mode:data.mode } };
    case 'setTheme':
      if (data.choice !== 'auto' && data.choice !== 'light' && data.choice !== 'dark') return bad('choice 는 auto · light · dark');
      return { ok:true, command:{ type, choice:data.choice } };
    case 'setPadding':
      if (!isNumber(data.bottom) || data.bottom < 0) return bad('bottom 은 0 이상의 수(화면 px)');
      return { ok:true, command:{ type, bottom:data.bottom } };
    case 'watchTrain': case 'followTrain':
      if (!isId(data.id)) return bad('id 는 trainTap 의 train.id');
      return { ok:true, command:{ type, id:data.id } };
    case 'followBus':
      if (!isId(data.id)) return bad('id 는 busTap 의 selection.id(kind bus)');
      return { ok:true, command:{ type, id:data.id } };
    case 'unwatchTrain': case 'stopFollow': case 'stopRide': case 'closeBus': case 'busRefresh': return { ok:true, command:{ type } };
    case 'startRide':
      if (!isId(data.id)) return bad('id 는 trainTap 의 train.id');
      if (!isSeat(data.seat)) return bad('seat 는 { car, row (1 이상 정수), side (-1 · 1) }');
      return { ok:true, command:{ type, id:data.id, seat:{ car:data.seat.car, row:data.seat.row, side:data.seat.side } } };
    case 'setPref':
      if (data.key === 'prebuild' || data.key === 'saver') {
        if (typeof data.value !== 'boolean') return bad(`${data.key} 의 value 는 참 · 거짓`);
        return { ok:true, command:{ type, key:data.key, value:data.value } };
      }
      if (data.key === 'speed') {
        if (!isNumber(data.value) || !COASTER_SPEEDS.includes(data.value)) return bad('speed 의 value 는 1 · 5 · 20');
        return { ok:true, command:{ type, key:data.key, value:data.value } };
      }
      return bad('key 는 prebuild · saver · speed');
    case 'skyOpen':
      if (typeof data.open !== 'boolean') return bad('open 은 참 · 거짓');
      return { ok:true, command:{ type, open:data.open } };
    case 'busRoute':
      if (!isId(data.routeId)) return bad('routeId 는 busTap view 의 routeId');
      return { ok:true, command:{ type, routeId:data.routeId } };
    case 'busStopView':
      if (data.what !== 'follow' && data.what !== 'route' && data.what !== 'stop') return bad('what 은 follow · route · stop');
      return { ok:true, command:{ type, what:data.what } };
    default: return { ok:false, code:'unknown_type', message:`모르는 type: ${type}`, request:type };
  }
}

// 지도 쪽이 다리에 넘기는 일(본체)
export interface BridgeActions {
  showRoute(plan:JourneyPlan, padding:RoutePadding):void;
  clearRoute():void;
  focusStation(id:number, zoom:number|null):void;
  setMode(id:string):void;
  // v2 — 없는 칸은 failed 로 답한다(데스크톱 점검 · 시험이 일부만 넘길 때)
  setTheme?(choice:ThemeChoice):void;
  setPadding?(bottom:number):void;
  watchTrain?(id:string):void;
  unwatchTrain?():void;
  followTrain?(id:string):void;
  stopFollow?():void;
  startRide?(id:string, seat:Seat):void;
  stopRide?():void;
  setPref?(key:'prebuild' | 'saver' | 'speed', value:boolean | number):void;
  skyOpen?(open:boolean):void;
  closeBus?():void;
  followBus?(id:string):void;
  busRoute?(routeId:string):void;
  busRefresh?():void;
  busStopView?(what:'follow' | 'route' | 'stop'):void;
}
// 받는 곳: iOS 는 window, Android 는 document 에 message 이벤트(react-native-webview). 한 메시지가 두 번 오지 않게 각자 제 대상에서 생긴 것만
interface MessageTargets { window:EventTarget; document:EventTarget }
type Post = (text:string) => void;

declare global { interface Window { ReactNativeWebView?:{ postMessage(text:string):void } } }
// 앱 웹뷰가 넣어 주는 보내기 창구(보낼 때마다 찾는다 — 나중에 붙어도 · 데스크톱 점검에서 갈아 끼워도 된다). 없으면 버린다(일반 브라우저의 #app)
const defaultPost:Post = text => { globalThis.window?.ReactNativeWebView?.postMessage(text) };

// 명령 하나를 본체의 일로(없는 일은 던져 failed 로 답한다)
function need<T>(action:T|undefined, type:string):T { if (!action) throw new Error(`이 지도는 ${type} 를 못 한다`); return action }
function run(actions:BridgeActions, command:AppCommand):void {
  switch (command.type) {
    case 'showRoute': actions.showRoute(command.plan, command.padding); return;
    case 'clearRoute': actions.clearRoute(); return;
    case 'focusStation': actions.focusStation(command.id, command.zoom); return;
    case 'setMode': actions.setMode(command.mode); return;
    case 'setTheme': need(actions.setTheme, command.type).call(actions, command.choice); return;
    case 'setPadding': need(actions.setPadding, command.type).call(actions, command.bottom); return;
    case 'watchTrain': need(actions.watchTrain, command.type).call(actions, command.id); return;
    case 'followTrain': need(actions.followTrain, command.type).call(actions, command.id); return;
    case 'followBus': need(actions.followBus, command.type).call(actions, command.id); return;
    case 'unwatchTrain': need(actions.unwatchTrain, command.type).call(actions); return;
    case 'stopFollow': need(actions.stopFollow, command.type).call(actions); return;
    case 'stopRide': need(actions.stopRide, command.type).call(actions); return;
    case 'closeBus': need(actions.closeBus, command.type).call(actions); return;
    case 'busRefresh': need(actions.busRefresh, command.type).call(actions); return;
    case 'startRide': need(actions.startRide, command.type).call(actions, command.id, command.seat); return;
    case 'setPref': need(actions.setPref, command.type).call(actions, command.key, command.value); return;
    case 'skyOpen': need(actions.skyOpen, command.type).call(actions, command.open); return;
    case 'busRoute': need(actions.busRoute, command.type).call(actions, command.routeId); return;
    case 'busStopView': need(actions.busStopView, command.type).call(actions, command.what);
  }
}

export const STATUS_GAP_MS = 250;   // status 는 초당 4번까지(마지막 값은 늦게라도 보낸다)

export function createAppBridge({ facts, post = defaultPost, targets }:{ facts:BridgeFacts; post?:Post; targets?:MessageTargets }) {
  let actions:BridgeActions|null = null, busOpen = false;
  const send = (message:MapMessage):void => { try { post(JSON.stringify(message)) } catch (error) { console.error('app bridge: 보내기 실패', error) } };
  // 상태 알림: 같은 값이면 안 보낸다. ready 전에는 마지막 값만 들고 있다가 ready 뒤에 보낸다(sky · status · followChanged · rideChanged)
  const lastSent = new Map<string, string>(), waiting = new Map<string, MapMessage>();
  function state(message:MapMessage):void {
    if (!actions) { waiting.set(message.type, message); return }
    const text = JSON.stringify(message);
    if (lastSent.get(message.type) === text) return;
    lastSent.set(message.type, text);
    try { post(text) } catch (error) { console.error('app bridge: 보내기 실패', error) }
  }
  let statusNext:MapStatus|null = null, statusAt = 0, statusTimer:ReturnType<typeof setTimeout>|null = null;
  function flushStatus():void { statusTimer = null; if (!statusNext) return; statusAt = Date.now(); state({ type:'status', ...statusNext }); statusNext = null }
  function receive(raw:unknown):void {
    const parsed = parseAppMessage(raw, facts);
    if (!parsed) return;
    if (!parsed.ok) { send({ type:'error', code:parsed.code, message:parsed.message, ...(parsed.request ? { request:parsed.request } : {}) }); return }
    const command = parsed.command;
    if (!actions) { send({ type:'error', code:'not_ready', message:'지도를 준비하는 중 — ready 를 받은 뒤 보낸다', request:command.type }); return }
    try {
      run(actions, command);
    } catch (error) {
      console.error('app bridge: 명령 실패', command.type, error);
      send({ type:'error', code:'failed', message:String((error as Error)?.message ?? error), request:command.type });
    }
  }
  if (targets) for (const target of [targets.window, targets.document]) target.addEventListener('message', event => { if (event.target === target) receive((event as MessageEvent).data) });
  return {
    receive,
    // 지도가 다 떴다: 이때부터 명령을 받는다. 테마 · 내 설정은 ready 에 실어 보내고, 기다리던 하늘 · 상태는 바로 뒤에
    ready(nextActions:BridgeActions, info:ReadyInfo):void {
      actions = nextActions;
      send({ type:'ready', version:APP_BRIDGE_VERSION, ...info });
      lastSent.set('themeChanged', JSON.stringify({ type:'themeChanged', ...info.theme }));
      lastSent.set('prefsChanged', JSON.stringify({ type:'prefsChanged', prefs:info.prefs }));
      for (const type of ['sky', 'status', 'followChanged', 'rideChanged']) { const message = waiting.get(type); if (message) state(message) }
      waiting.clear();
    },
    stationTap(station:MapStation):void { send({ type:'stationTap', station:stationInfo(station) }) },
    trainTap(plan:TrainPlan):void { send({ type:'trainTap', train:trainInfo(plan) }) },
    modeChanged(mode:string):void { send({ type:'modeChanged', mode }) },
    themeChanged(theme:ThemeState):void { state({ type:'themeChanged', ...theme }) },
    prefsChanged(prefs:PrefsState):void { state({ type:'prefsChanged', prefs }) },
    sky(sky:SkyState):void { state({ type:'sky', ...sky }) },
    status(next:MapStatus):void {
      statusNext = next;
      if (statusTimer) return;
      const wait = STATUS_GAP_MS - (Date.now() - statusAt);
      if (wait <= 0) flushStatus(); else statusTimer = setTimeout(flushStatus, wait);
    },
    // 열차 시트(watch 중): 1초마다 · 예측이 없어지면 gone
    trainUpdate(update:TrainUpdate):void { if (actions) send({ type:'trainUpdate', ...update }) },
    trainGone(id:string):void { if (actions) send({ type:'trainGone', id }) },
    followChanged(id:string|null):void { state({ type:'followChanged', id }) },
    rideChanged(ride:RideState):void { state({ type:'rideChanged', ...ride }) },
    // 버스: 누름은 늘 보내고(같은 자료여도 새로 연다), 바뀜은 값이 다를 때만, 닫힘은 열려 있을 때만
    busTap(view:BusSheetView, selection:BusSelection):void {
      if (!actions) return;
      busOpen = true;
      const message:MapMessage = { type:'busTap', view, selection };
      lastSent.set('busUpdate', JSON.stringify({ ...message, type:'busUpdate' }));
      send(message);
    },
    busUpdate(view:BusSheetView, selection:BusSelection):void { if (busOpen) state({ type:'busUpdate', view, selection }) },
    busClosed():void { if (!busOpen) return; busOpen = false; lastSent.delete('busUpdate'); send({ type:'busClosed' }) },
  };
}
export type AppBridge = ReturnType<typeof createAppBridge>;
