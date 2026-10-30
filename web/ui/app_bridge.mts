// 앱 ↔ 지도 다리(웹 쪽): 슝 앱(React Native · Expo)이 웹뷰에 이 지도를 앱 지도 모드(주소 #app — index.html 첫 스크립트가 html[data-app=map])로 띄우면
// 지도 → 앱: window.ReactNativeWebView.postMessage(JSON 글자) — ready · stationTap · trainTap · modeChanged · error
// 앱 → 지도: 웹뷰의 postMessage(JSON 글자 — iOS 는 window, Android 는 document 의 message 이벤트) — showRoute · clearRoute · focusStation · setMode
// 메시지 이름 · 칸은 계획서(plans/feature/20261030-슝-앱-만들기.md) "공통 스펙"의 다리 계약 — 바꾸면 앱도 같이 바꾼다(version 을 올린다).
// 이 파일은 고르기 · 검사만 한다(화면 · 지도는 본체가 넘긴 함수로) — 다른 화면 파일을 import 하지 않는다(본체가 같은 단계에서 요청).
import type { MapStation, TrainPlan } from '../trains/types.mts';
import type { JourneyLeg, JourneyPlan } from './journey.mts';

export const APP_BRIDGE_VERSION = 1;

type Position = [number, number];
// 지도 → 앱
export interface StationInfo { id:number; name:string; lines:string[]; lat:number; lon:number }
export interface TrainInfo {
  id:string; line:string; trainNo:string; station:string; destination:string; direction:string; status:string;
  express:boolean; last:boolean; receivedAt:string|null;
}
export type MapMessage =
  | { type:'ready'; version:number; mode:string; modes:string[] }
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
  | { type:'setMode'; mode:string };
export type ErrorCode = 'bad_message' | 'unknown_type' | 'bad_field' | 'not_ready' | 'failed';
export type Parsed = { ok:true; command:AppCommand } | { ok:false; code:ErrorCode; message:string; request?:string } | null;

// 검사에 쓰는 지금 지도의 사실(본체가 넘긴다)
export interface BridgeFacts { hasStation(id:number):boolean; hasLine(line:string):boolean; hasMode(id:string):boolean }

const isRecord = (value:unknown):value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value);
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
    default: return { ok:false, code:'unknown_type', message:`모르는 type: ${type}`, request:type };
  }
}

// 지도 쪽이 다리에 넘기는 일(본체)
export interface BridgeActions {
  showRoute(plan:JourneyPlan, padding:RoutePadding):void;
  clearRoute():void;
  focusStation(id:number, zoom:number|null):void;
  setMode(id:string):void;
}
// 받는 곳: iOS 는 window, Android 는 document 에 message 이벤트(react-native-webview). 한 메시지가 두 번 오지 않게 각자 제 대상에서 생긴 것만
interface MessageTargets { window:EventTarget; document:EventTarget }
type Post = (text:string) => void;

declare global { interface Window { ReactNativeWebView?:{ postMessage(text:string):void } } }
// 앱 웹뷰가 넣어 주는 보내기 창구(보낼 때마다 찾는다 — 나중에 붙어도 · 데스크톱 점검에서 갈아 끼워도 된다). 없으면 버린다(일반 브라우저의 #app)
const defaultPost:Post = text => { globalThis.window?.ReactNativeWebView?.postMessage(text) };

export function createAppBridge({ facts, post = defaultPost, targets }:{ facts:BridgeFacts; post?:Post; targets?:MessageTargets }) {
  let actions:BridgeActions|null = null;
  const send = (message:MapMessage):void => { try { post(JSON.stringify(message)) } catch (error) { console.error('app bridge: 보내기 실패', error) } };
  function receive(raw:unknown):void {
    const parsed = parseAppMessage(raw, facts);
    if (!parsed) return;
    if (!parsed.ok) { send({ type:'error', code:parsed.code, message:parsed.message, ...(parsed.request ? { request:parsed.request } : {}) }); return }
    const command = parsed.command;
    if (!actions) { send({ type:'error', code:'not_ready', message:'지도를 준비하는 중 — ready 를 받은 뒤 보낸다', request:command.type }); return }
    try {
      if (command.type === 'showRoute') actions.showRoute(command.plan, command.padding);
      else if (command.type === 'clearRoute') actions.clearRoute();
      else if (command.type === 'focusStation') actions.focusStation(command.id, command.zoom);
      else actions.setMode(command.mode);
    } catch (error) {
      console.error('app bridge: 명령 실패', command.type, error);
      send({ type:'error', code:'failed', message:String((error as Error)?.message ?? error), request:command.type });
    }
  }
  if (targets) for (const target of [targets.window, targets.document]) target.addEventListener('message', event => { if (event.target === target) receive((event as MessageEvent).data) });
  return {
    receive,
    // 지도가 다 떴다: 이때부터 명령을 받는다
    ready(nextActions:BridgeActions, mode:string, modes:string[]):void { actions = nextActions; send({ type:'ready', version:APP_BRIDGE_VERSION, mode, modes }) },
    stationTap(station:MapStation):void { send({ type:'stationTap', station:stationInfo(station) }) },
    trainTap(plan:TrainPlan):void { send({ type:'trainTap', train:trainInfo(plan) }) },
    modeChanged(mode:string):void { send({ type:'modeChanged', mode }) },
  };
}
export type AppBridge = ReturnType<typeof createAppBridge>;
