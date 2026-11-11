// 타고 가기(「이 길로 출발」 뒤 뚜벅이 네비): 셈과 카드 글만 — 위치 · 열차 · 카메라는 ui/ride_along.mts 가 맡고, 카드는 components/ride_card.tsx 가 그린다.
// 값의 근거는 계획서 plans/feature/20261102-슝-타고-가기.md 4절 「단순 흐름」 · 「더한 것」(2026-11-02 · 2026-11-04 사용자 확정)
// 걷기 시간 근거(server/services/journey_graph.py): 역까지 · 역에서 걷기 구간 seconds 에는 땅 위↔승강장 90초(STATION_ACCESS)가 들어 있다 · 같은 역 갈아타기는 구간 사이 시각 차(GTFS 최소 환승)
export type LngLat = readonly [number, number];

export const NEAR_M = 100;             // 역 · 정류장 이만큼 안이면 기다리기(2026-11-04 확정)
export const NEAR_HOLD_MS = 5000;      // …에 이만큼 머물면(위치가 튀어 왔다 갔다 하지 않게)
export const OFF_M = 60;               // 버스를 기다릴 때 내 위치가 버스 길에서 이만큼 안이면 버스 길 위로 친다
export const WALK_OFF_M = 20;          // 걷는 길에서 이만큼 넘게 벗어난 위치를(2026-11-06 사용자 확정)
export const OFF_FIXES = 3;            // …연달아 이만큼 받으면 지금 위치에서 길을 다시 찾는다(위치 한 번 튐 무시 — 아테나 추천 · 2026-11-06 계획서)
export const REROUTE_GAP_MS = 10000;   // 다시 찾은 뒤(성공 · 실패) 이만큼은 다시 부르지 않는다(30초 → 10초 2026-11-07 사용자 — 30초면 새 길에서 240m 벗어나서야 다시 찾았다)
export const HURRY_SHARE = 0.8;        // 평소 걷는 시간의 80% 안에 닿으면 「서두르면 탈 수 있음」, 그보다 빠듯하면 못 탐
export const TRANSFER_SPARE_S = 60;    // 갈아타기 최소 시간은 방향 구분이 없어 1분 여유를 더한다
export const BAD_FIX_M = 100;          // 정확도가 이보다 나쁜 위치는 버린다
export const STATION_ACCESS_S = 90;    // 땅 위 ↔ 승강장(서버 STATION_ACCESS 와 같은 값)
const WALK_SPEED = 1.2;                // 서버의 걷기 빠르기(m/s) — 구간 값으로 셀 수 없을 때
const SPEED_RANGE:readonly [number, number] = [0.5, 2.5];   // 잰 걸음 빠르기를 이 안으로(멈춤 · 위치 튐을 걸음으로 읽지 않게)

// ---- 서버 구간(server/services/journey_graph.py — 이 파일이 읽는 칸만)
export interface RideWalkLeg { type:'walk'; seconds:number; metres:number; exit?:string; label?:string; path?:LngLat[] }
export interface RideTrainLeg { type:'ride'; line:string; from:string; to:string; departs:string; arrives:string; direction:string | null; stops:number; wait:number; stations:number[]; trainNo?:string | null }
export interface RideBusLeg { type:'bus'; route:string; from:string; to:string; departs:string; arrives:string; toward:string; stops:number; wait:number; path:LngLat[] }
export type RideLeg = RideWalkLeg | RideTrainLeg | RideBusLeg;

// ---- 거리(수도권 안의 짧은 거리라 평면으로 셈)
const M_PER_DEG = 111320;
export function metres(from:LngLat, to:LngLat):number {
  const across = (to[0] - from[0]) * Math.cos((from[1] + to[1]) / 2 * Math.PI / 180), up = to[1] - from[1];
  return Math.hypot(across, up) * M_PER_DEG;
}
export function pathLength(path:readonly LngLat[]):number {
  let total = 0;
  for (let index = 1; index < path.length; index++) total += metres(path[index - 1]!, path[index]!);
  return total;
}
// 길 위에서 가장 가까운 자리: off 길에서 떨어진 거리 · at 길 처음부터 그 자리까지 · total 길 전체.
// within: 길 처음부터 [min, max] m 안에서만 찾는다(그 밖 조각은 건너뛰고 걸친 조각은 그 끝까지만)
export function onPath(point:LngLat, path:readonly LngLat[], within?:{ min:number; max:number }):{ off:number; at:number; total:number } {
  if (path.length < 2) return {off: path[0] ? metres(point, path[0]) : 0, at: 0, total: 0};
  const cos = Math.cos(point[1] * Math.PI / 180), flat = (spot:LngLat) => [spot[0] * cos * M_PER_DEG, spot[1] * M_PER_DEG] as const, here = flat(point);
  const min = within?.min ?? -Infinity, max = within?.max ?? Infinity;
  let best = Infinity, bestAt = 0, walked = 0;
  for (let index = 1; index < path.length; index++) {
    const start = flat(path[index - 1]!), end = flat(path[index]!), dx = end[0] - start[0], dy = end[1] - start[1], span = Math.hypot(dx, dy);
    if (walked + span >= min && walked <= max) {
      const low = span ? Math.max(0, (min - walked) / span) : 0, high = span ? Math.min(1, (max - walked) / span) : 0;
      const share = span ? Math.max(low, Math.min(high, ((here[0] - start[0]) * dx + (here[1] - start[1]) * dy) / (span * span))) : 0;
      const gap = Math.hypot(here[0] - start[0] - dx * share, here[1] - start[1] - dy * share);
      if (gap < best) { best = gap; bestAt = walked + span * share; }
    }
    walked += span;
  }
  return {off: best, at: bestAt, total: walked};
}
// 버스 길처럼 같은 곳을 두 번 지나는 길(고리 · 오가는 노선)에서 지난 자리(from m)부터 앞으로만 찾는다: 30m 뒤 ~ 300m 앞(AHEAD_M) 안에서 먼저 보고,
// 그 안에서 길 위(OFF_M)로 못 맞추면(위치가 끊겼다 멀리서 돌아옴) 길 전체. 전체로 찾으면 고리의 되돌아오는 쪽에 붙어 타기 전에 「내려요」로 넘어가고
// 지금 · 다음 · 남은 정거장이 두 쪽 사이를 오갔다(2026-11-08 운영 10케이스 #7 6616 — 수궁119안전센터를 두 번 지남)
export const AHEAD_M = 300;
export function onPathFrom(point:LngLat, path:readonly LngLat[], from:number):{ off:number; at:number; total:number } {
  const near = onPath(point, path, {min: from - 30, max: from + AHEAD_M});
  return near.off <= OFF_M ? near : onPath(point, path);
}
// 길을 at(처음부터 m)에서 나눈다: 지나온 길 · 남은 길(둘 다 그 자리 점을 같이 가진다)
export function splitPath(path:readonly LngLat[], at:number):{ done:LngLat[]; rest:LngLat[] } {
  let walked = 0;
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1]!, end = path[index]!, span = metres(start, end);
    if (walked + span >= at) {
      const share = span ? (at - walked) / span : 0, cut:LngLat = [start[0] + (end[0] - start[0]) * share, start[1] + (end[1] - start[1]) * share];
      return {done: [...path.slice(0, index), cut], rest: [cut, ...path.slice(index)]};
    }
    walked += span;
  }
  return {done: [...path], rest: path.length ? [path[path.length - 1]!] : []};
}

// ---- 걷는 길에서 벗어남(ui/ride_along 이 위치를 받을 때마다 부른다)
// 연달아 벗어난 위치 수: 벗어났으면 하나 늘고, 길 위(20m 안)로 돌아오면 0
export const offFixes = (count:number, offM:number):number => offM > WALK_OFF_M ? count + 1 : 0;
// 다시 찾을까: 연달아 3번 벗어났고 · 찾는 중이 아니고 · 지난번 찾은 뒤 간격이 지났다(lastMs 0 = 아직 안 찾음)
export interface RerouteInput { offFixes:number; busy:boolean; nowMs:number; lastMs:number }
export const shouldReroute = ({offFixes: count, busy, nowMs, lastMs}:RerouteInput):boolean =>
  count >= OFF_FIXES && !busy && (!lastMs || nowMs - lastMs >= REROUTE_GAP_MS);

// ---- 다시 찾기는 걷는 구간만(2026-11-06 사용자 — 고른 지하철 · 버스는 그대로 · plans/feature/20261106-슝-길-벗어나면-걷는-길만-다시-찾기.md)
// 서버 /api/route?walk=1 이 이보다 오래 걷는 길을 주면 못 찾은 것으로(위도 · 경도가 뒤집히면 13,000 km 직선이 온다 — 2026-11-07 아테나 운영 확인)
export const WALK_AGAIN_MAX_S = 7200;
// 지금 걷는 구간의 끝: 다음이 지하철이면 그 역(출구는 서버가 고른다) · 버스면 그 버스 길 첫 점(정류장) · 마지막 걷기면 목적지 · 걷기 다음 걷기면 지금 길 끝
export type WalkEnd = { station:number } | { to:LngLat } | { goal:true };
export function walkEnd(legs:readonly RideLeg[], index:number):WalkEnd | null {
  const leg = legs[index], next = legs[index + 1];
  if (leg?.type !== 'walk') return null;
  if (!next) return {goal: true};
  if (next.type === 'ride') return next.stations[0] === undefined ? null : {station: next.stations[0]};
  const end = next.type === 'bus' ? next.path[0] : leg.path?.[leg.path.length - 1];
  return end ? {to: end} : null;
}
// /api/route 뒤에 붙일 물음: 서버는 위도,경도 순서(spot · 길 점은 [경도, 위도]) · goal 은 목적지(위도 · 경도 칸)
export function walkQuery(spot:LngLat, end:WalkEnd, goal:{ lat:number; lng:number }):string {
  const from = `walk=1&from=${spot[1]},${spot[0]}`;
  if ('station' in end) return `${from}&station=${end.station}`;
  const [lng, lat] = 'to' in end ? end.to : [goal.lng, goal.lat];
  return `${from}&to=${lat},${lng}`;
}
// 서버 답 → 새 걷기(못 찾음 · 모양이 다름 · 터무니없이 긺이면 null)
export interface FreshWalk { seconds:number; metres:number; path:LngLat[]; exit:string; label:string; to:string | null }
const isSpot = (value:unknown):value is LngLat => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
export function freshWalk(answer:unknown):FreshWalk | null {
  if (!answer || typeof answer !== 'object' || (answer as { ok?:unknown }).ok !== true) return null;
  const leg = (answer as { leg?:unknown }).leg;
  if (!leg || typeof leg !== 'object') return null;
  const {type, seconds, metres, path, exit, label, to} = leg as Record<string, unknown>;
  if (type !== 'walk' || typeof seconds !== 'number' || !(seconds >= 0 && seconds <= WALK_AGAIN_MAX_S) || typeof metres !== 'number' || !Number.isFinite(metres)) return null;
  if (!Array.isArray(path) || path.length < 2 || !path.every(isSpot)) return null;
  return {seconds, metres, path: path.map(([lng, lat]) => [lng, lat] as const), exit: typeof exit === 'string' ? exit : '', label: typeof label === 'string' ? label : '', to: typeof to === 'string' ? to : null};
}
// 경로에서 index 의 걷기만 새 걷기로 바꾼 경로(나머지 구간 · 탈 것은 그대로 — 같은 객체).
// 역까지 걷기는 출구 · 역 이름도 서버 값으로, 글(label)은 첫 걷기일 때만 서버 값(갈아타기 · 버스 · 목적지 걷기는 원래 글 — 좌표 끝의 서버 글은 늘 「목적지까지 걸어서」).
// 시간: 걷는 시간 · 거리 · 걷는 분은 새 값. 마지막 걷기면 도착 시각 = 지금 + 새 걷는 시간(분은 그만큼 더하고 뺀다), 아니면 탈 것의 시각이 그대로라 도착도 그대로
export interface WalkPlanLike { arrives:string; minutes:number; walkMinutes:number; legs:readonly unknown[] }
export function spliceWalk<P extends WalkPlanLike>(plan:P, index:number, fresh:FreshWalk, end:WalkEnd, now:Date):P {
  const legs = [...plan.legs] as RideLeg[], old = legs[index] as RideWalkLeg, previous = legs[index - 1];
  const station = 'station' in end, transfer = !!previous && previous.type !== 'walk';
  legs[index] = {...old, seconds: fresh.seconds, metres: fresh.metres, path: fresh.path,
    ...(station ? {exit: fresh.exit, ...(fresh.to ? {to: fresh.to} : {})} : {}), ...(station && !transfer && fresh.label ? {label: fresh.label} : {})};
  const walkMinutes = Math.round(legs.reduce((sum, leg) => sum + (leg.type === 'walk' ? leg.seconds : 0), 0) / 60);
  if (index < legs.length - 1) return {...plan, legs, walkMinutes};
  const pad = (value:number) => String(value).padStart(2, '0'), at = new Date(+now + fresh.seconds * 1000);
  const arrives = `${pad(at.getHours())}:${pad(at.getMinutes())}`, shift = ((hm(arrives) - hm(plan.arrives) + 720 + 1440) % 1440) - 720;
  return {...plan, legs, walkMinutes, arrives, minutes: Math.max(0, plan.minutes + shift)};
}

// ---- 한마디: 여유 = 열차가 오는 시간 − 걷는 시간(「뛰어요」는 쓰지 않는다 — 계단 안전 · 자료가 늦을 수 있음)
export type TalkKind = 'miss' | 'hurry' | 'tight' | 'fit' | 'easy' | 'free';
const TALK:Record<TalkKind, readonly string[]> = {
  miss: ['포탈 열면 가능한데… 그럴 거면 집으로 여시죠'],
  hurry: ['지금 출발하면 전설, 망설이면 다음 열차'],
  tight: ['경보 선수 모드 ON', '엘리베이터 말고 에스컬레이터 각'],
  fit: ['열차랑 약속 잡은 사람처럼 걷는 중'],
  easy: ['열차가 아직 출근 준비 중이에요'],
  free: ['편의점 들렀다 가도 돼요', '이 정도면 열차가 우릴 기다려야죠'],
};
export function talkKind(arrivalS:number, walkS:number):TalkKind {
  if (arrivalS < walkS * HURRY_SHARE) return 'miss';
  if (arrivalS < walkS) return 'hurry';
  const spare = arrivalS - walkS;
  if (spare < 120) return 'tight';
  if (spare < 300) return 'fit';
  if (spare < 600) return 'easy';
  return 'free';
}
// 칸 안에서 돌려 쓴다(turn: 카드가 바뀔 때마다 하나씩 느는 수)
export const talkLine = (kind:TalkKind, turn:number):string => { const lines = TALK[kind]; return lines[Math.abs(turn) % lines.length]!; };

// 기다리는 열차 고르기: 걸어서 못 타는 열차(평소 걷는 시간의 80% 전에 오는 것)는 빼고 그다음부터
export function catchable(arrivalsS:readonly number[], walkS:number):{ missed:boolean; next:number[] } {
  const sorted = [...arrivalsS].sort((first, second) => first - second), next = sorted.filter(arrival => arrival >= walkS * HURRY_SHARE);
  return {missed: next.length < sorted.length, next};
}

// ---- 걷기 시간
const hm = (time:string) => { const [hours = 0, minutes = 0] = String(time).split(':').map(Number); return hours * 60 + minutes; };
// 평소 걸음(m/s): 구간 거리 ÷ (구간 시간 − 승강장 오가는 시간). 셀 수 없으면 서버의 1.2
export function legPace(legs:readonly RideLeg[], index:number):number {
  const leg = legs[index];
  if (leg?.type !== 'walk' || !leg.metres) return WALK_SPEED;
  const access = (legs[index - 1]?.type === 'ride' ? STATION_ACCESS_S : 0) + (legs[index + 1]?.type === 'ride' ? STATION_ACCESS_S : 0);
  const pace = leg.metres / Math.max(1, leg.seconds - access);
  return pace >= SPEED_RANGE[0] && pace <= SPEED_RANGE[1] ? pace : WALK_SPEED;
}
// 잰 걸음: 지난 위치들(시각 ms · 길 위 자리 m) 중 15초 넘게 떨어진 첫 것과 비교 · 10m 안쪽 움직임은 걸음으로 치지 않는다
export function measuredPace(track:readonly { t:number; at:number }[]):number | null {
  const latest = track[track.length - 1];
  if (!latest) return null;
  const earlier = [...track].reverse().find(item => latest.t - item.t >= 15000);
  if (!earlier || latest.at - earlier.at < 10) return null;
  return Math.max(SPEED_RANGE[0], Math.min(SPEED_RANGE[1], (latest.at - earlier.at) / ((latest.t - earlier.t) / 1000)));
}
// 남은 걷기(초): 남은 길 ÷ 걸음 + (지하철을 타러 가면) 승강장까지
export const walkLeftS = (legs:readonly RideLeg[], index:number, leftM:number, pace:number):number =>
  leftM / pace + (legs[index + 1]?.type === 'ride' ? STATION_ACCESS_S : 0);
// 같은 역 갈아타기 걷기(초): 다음 열차가 타는 곳에 닿는 시각(departs − wait) − 앞 열차가 내리는 시각 + 1분 여유
export function transferS(previous:RideTrainLeg, next:RideTrainLeg):number {
  const ready = hm(next.departs) * 60 - next.wait, arrived = hm(previous.arrives) * 60;
  return Math.max(60, (ready - arrived + 86400) % 86400) + TRANSFER_SPARE_S;
}

// ---- 단계: 걷기 → 기다리기 → 타기 → … → 도착
export type RideStep = { kind:'walk'; leg:number } | { kind:'wait'; leg:number } | { kind:'ride'; leg:number } | { kind:'done' };
export function rideSteps(legs:readonly RideLeg[]):RideStep[] {
  const steps:RideStep[] = [];
  legs.forEach((leg, index) => { if (leg.type === 'walk') steps.push({kind: 'walk', leg: index}); else steps.push({kind: 'wait', leg: index}, {kind: 'ride', leg: index}); });
  steps.push({kind: 'done'});
  return steps;
}

// ---- 카드 글(components/ride_card.tsx 가 그린다)
// look: 카드 캐릭터 그림 이름 · detour: 작은 글 자리에 「다른 길 찾기 ›」 · flip: 오른쪽을 보는 그림이라 말풍선 쪽(왼쪽)으로 뒤집는다
// arrival: 도착 카드에만 — 도착 연기(components/ride_arrival.tsx)가 글을 나눠 쓴다(목적지 · 도착 시각 · 걸린 분)
export interface RideCardView { title:string; say:string | null; sub:string; detour:boolean; image:string; flip:boolean; following:boolean; arrival?:RideArrivalParts; goal?:RideGoal }
// goal: 길 끝 자리(타고 가는 동안 그 자리에 깃발을 미리 세운다 — 자리를 모르면 null)
export interface RideGoal { at:LngLat | null }
// at: 도착 자리(도착 연기가 그 자리에 붙는다 — 모르면 「슝 도착!」 말풍선)
export interface RideArrivalParts { to:string; time:string; took:number; at?:LngLat | null }
// 캐릭터 그림(brand/characters — 슝 소개 사이트 그림). 그림이 없는 스타 세 모드(SCV · 드론 · 프로브)는 새싹으로(2026-11-04 확정)
const CHARACTER:Record<string, { file:string; flip:boolean }> = {
  sprout: {file: 'sprout-left.webp', flip: false}, builder: {file: 'builder-right.webp', flip: true}, seonbi: {file: 'seonbi-right.webp', flip: true}, visitor: {file: 'visitor-left.webp', flip: false},
};
export const characterOf = (look:string | null | undefined):{ file:string; flip:boolean } => CHARACTER[look ?? ''] ?? CHARACTER.sprout!;

const minutes = (seconds:number) => Math.max(1, Math.round(seconds / 60));
const roundM = (value:number) => Math.max(10, Math.round(value / 10) * 10);
const placeOf = (leg:RideTrainLeg | RideBusLeg, name:string) => leg.type === 'bus' ? `${name} 정류장` : `${name}역`;
const stepNo = (legs:readonly RideLeg[], index:number) => `${index + 1}/${legs.length}`;

// 걷기 카드: 「서울역 15번 출구까지 걸어요」 · 「1/4 · 70m · 1분」. 첫 걷기는 서버 글(출구까지), 갈아타기 걷기는 다음 타는 곳, 마지막은 목적지
export function walkTitle(legs:readonly RideLeg[], index:number, toName:string):string {
  const leg = legs[index], next = legs[index + 1];
  if (!next) return `${toName}까지 걸어요`;
  if (next.type === 'walk') return leg?.type === 'walk' && leg.label ? `${leg.label} 걸어요` : '다음 곳까지 걸어요';
  if (index === 0 && leg?.type === 'walk' && leg.label) return `${leg.label} 걸어요`;
  return `${placeOf(next, next.from)}까지 걸어요`;
}
export const walkSub = (legs:readonly RideLeg[], index:number, leftM:number, leftS:number):string => `${stepNo(legs, index)} · ${roundM(leftM)}m · ${minutes(leftS)}분`;

// 기다리기 · 갈아타기 카드: 「4호선 사당 방면 타는 곳으로」 · 한마디 · 「걸어서 2분 · 열차 5분 뒤 · 다음 9분 뒤」(갈아타기는 앞에 「2/4 · 」)
export function waitTitle(leg:RideTrainLeg | RideBusLeg):string {
  return leg.type === 'bus' ? `${leg.route} ${leg.toward} 방면 타는 곳으로` : `${leg.line} ${leg.to} 방면 타는 곳으로`;
}
// 걷는 시간이 다 됐으면(0초) 「걸어서 1분」 대신 「승강장 도착」 · 버스는 「정류장 도착」(갈아타기도 같다) · arrived: 첫 열차(고른 열차)가 이 역에 들어왔다(pickedArrived)
// gone: 승강장 시간 전에 들어와 놓친 열차가 줄에 아직 있다(arrivalsS 에서는 뺐다) — 걸어서 못 타는 열차를 뺐을 때와 같은 글(「다음 열차」 · 놓침 한마디)
export function waitText(legs:readonly RideLeg[], index:number, walkS:number, arrivalsS:readonly number[] | null, turn:number, arrived = false, gone = false):{ say:string | null; sub:string } {
  const previous = legs[index - 1], parts:string[] = [];
  if (previous && previous.type !== 'walk') parts.push(stepNo(legs, index - 1));
  parts.push(walkS > 0 ? `걸어서 ${minutes(walkS)}분` : `${legs[index]?.type === 'bus' ? '정류장' : '승강장'} 도착`);   // 버스는 정류장(2026-11-07 사용자 시험)
  if (!arrivalsS?.length) return {say: gone ? talkLine('miss', turn) : null, sub: parts.join(' · ')};   // 놓친 열차 말고는 아직 모름
  const caught = catchable(arrivalsS, walkS), missed = caught.missed || gone, [first, second] = caught.next;
  const leg = legs[index], noun = leg?.type === 'bus' ? `${leg.route}번` : '열차';   // 버스는 「472번 3분 뒤」(2026-11-07 사용자 결정)
  if (first !== undefined) parts.push(firstTrainText(first, missed, arrived, noun));
  if (second !== undefined) parts.push(missed && !arrived ? `그다음 ${minutes(second)}분 뒤` : `다음 ${minutes(second)}분 뒤`);
  const kind = missed || first === undefined ? 'miss' : talkKind(first, walkS);
  return {say: talkLine(kind, turn), sub: parts.join(' · ')};
}

function firstTrainText(firstS:number, missed:boolean, arrived:boolean, noun:string):string {
  if (arrived) return `${noun} 도착 · 지금 타세요`;
  return missed ? `다음 ${noun} ${minutes(firstS)}분 뒤` : `${noun} ${minutes(firstS)}분 뒤`;
}

// 타기 카드: 「사당에서 내려요」 · 「2/4 · 5정거장 · 08:21」 → 한 정거장 남으면 「2/4 · 다음 역에서 내려요」
export const rideTitle = (leg:RideTrainLeg | RideBusLeg):string => `${leg.to}에서 내려요`;
// where: 지금 역(정류장) · 다음 역 이름(rideStops · 버스 층 journeyStopAt) — 모르면 null(그때는 예전 글 그대로)
export function rideSub(legs:readonly RideLeg[], index:number, stopsLeft:number, where:RideWhere | null = null):string {
  const leg = legs[index] as RideTrainLeg | RideBusLeg, head = where ? `${stepNo(legs, index)} · 지금 ${where.now}` : stepNo(legs, index);
  if (stopsLeft <= 1) return `${head} · 다음 ${leg.type === 'bus' ? '정류장' : '역'}에서 내려요`;
  return `${head}${where?.next ? ` · 다음 ${where.next}` : ''} · ${stopsLeft}정거장 · ${leg.arrives}`;
}
export interface RideWhere { now:string; next:string | null }
// 도착 카드: 「슝 도착!」 · 「강남역 · 08:40 · 32분 걸렸어요」
export function doneParts(toName:string, now:Date, startedMs:number):RideArrivalParts {
  const pad = (value:number) => String(value).padStart(2, '0');
  return {to: toName, time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, took: minutes((+now - startedMs) / 1000)};
}
// 길의 끝(도착 표시 · 도착 때 카메라): 끝에서부터 — 걷기 · 버스는 길 끝점, 지하철은 내린 역(stationSpot). 모르면 null
export function rideEndSpot(legs:readonly RideLeg[], stationSpot:(id:number) => LngLat | null):LngLat | null {
  for (let index = legs.length - 1; index >= 0; index--) {
    const leg = legs[index]!;
    if (leg.type === 'ride') {
      const id = leg.stations.at(-1), spot = id === undefined ? null : stationSpot(id);
      if (spot) return spot;
      continue;
    }
    const end = leg.path?.at(-1);
    if (end) return end;
  }
  return null;
}
export function doneSub(toName:string, now:Date, startedMs:number):string {
  const {to, time, took} = doneParts(toName, now, startedMs);
  return `${to} · ${time} · ${took}분 걸렸어요`;
}

// 열차 위 진행: 열차 예측(trains/plan)의 지나갈 역 차례(seq · cum)와 지금 자리(dist)로
// 그 역에 닿았나(cum 의 앞뒤 역 사이 3% 안쪽까지) · 그 역을 떠났나(다음 역까지 10% 넘게) · 내릴 역까지 남은 정거장
export interface PlanTrack { seqIds:readonly number[]; cum:readonly number[]; dist:number }
const gapAt = (cum:readonly number[], index:number) => Math.abs((cum[index + 1] ?? cum[index]!) - (cum[index - 1] ?? cum[index]!)) / 2 || 1;
export function reached({seqIds, cum, dist}:PlanTrack, stationId:number):boolean {
  const index = seqIds.indexOf(stationId);
  return index >= 0 && dist >= cum[index]! - gapAt(cum, index) * 0.03;
}
export function leftStation({seqIds, cum, dist}:PlanTrack, stationId:number):boolean {
  const index = seqIds.indexOf(stationId);
  if (index < 0) return seqIds.length > 0 && dist >= (cum[0] ?? 0);   // 그 역이 이미 지나간 차례에서 빠졌다
  return dist > cum[index]! + gapAt(cum, index) * 0.1;
}
// 탄 열차가 선 역(또는 막 지난 역)과 다음 역 — 탄 구간(stations: 탄 역 → 내릴 역, 사이 역 모두) 안에서, 닿음은 reached 와 같은 셈.
// 예측(seqIds)은 앞으로 갈 역 몇 개뿐이다(2026-11-07 화면에서 10개 — 먼 내릴 역은 없다): 예측에 처음 보이는 구간 역 앞은 이미 지난 역(leftStation 과 같음),
// 그 뒤 예측에 없는 역은 아직 먼 역. 구간 역이 하나도 예측에 없거나 아직 탄 역 전이면 null
export function rideStops(track:PlanTrack, stations:readonly number[]):{ now:number; next:number | null } | null {
  const first = stations.findIndex(id => track.seqIds.includes(id));
  if (first < 0) return null;
  let now:number | null = first > 0 ? stations[first - 1]! : null;
  for (const id of stations.slice(first)) {
    if (!track.seqIds.includes(id) || !reached(track, id)) return now == null ? null : {now, next: id};
    now = id;
  }
  return now == null ? null : {now, next: null};
}
export function stopsLeft({seqIds, cum, dist}:PlanTrack, stations:readonly number[]):number | null {
  const goal = seqIds.indexOf(stations[stations.length - 1]!);
  if (goal < 0) return null;
  let count = 0;
  for (let index = 0; index <= goal; index++) if (cum[index]! > dist + gapAt(cum, index) * 0.03) count++;
  return count;
}
// 열차를 못 따라갈 때(지도에 없음): 탄 시각 · 내릴 시각 사이 지난 몫으로. 길찾기가 정한 열차보다 앞 열차를 타 아직 탄 시각 전이면 지난 몫 0
//  (전에는 하루를 한 바퀴 돈 몫으로 셈해 막 탔는데 「다음 역에서 내려요」 — 2026-11-07 화면)
export function stopsLeftByTime(leg:RideTrainLeg | RideBusLeg, now:Date):number {
  const start = hm(leg.departs), end = hm(leg.arrives), span = ((end - start + 1440) % 1440) || 1, since = (now.getHours() * 60 + now.getMinutes() - start + 1440) % 1440;
  const gone = since < 720 ? since : 0;
  return Math.max(1, Math.ceil(leg.stops * (1 - Math.min(1, gone / span))));
}
// 시각 기준(위치를 못 쓸 때): 그 구간이 끝났나 — 걷기는 다음 탈 것이 타는 곳에 닿을 시각, 타기는 내릴 시각
export function legOverByTime(legs:readonly RideLeg[], index:number, now:Date, planArrives:string):boolean {
  const leg = legs[index], next = legs[index + 1], nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const passed = (time:string, less = 0) => { const at = hm(time) - less; return ((nowMin - at + 1440) % 1440) < 720; };
  if (!leg) return true;
  if (leg.type !== 'walk') return passed(leg.arrives);
  if (!next) return passed(planArrives);
  if (next.type === 'walk') return false;
  return passed(next.departs, next.wait / 60);
}

// ---- 지하철 진행 판단(ui/ride_along 의 tick 이 부른다 — 시험으로 멈춤 · 잘못 고름을 막는다)
export const BOARD_FALLBACK_MS = 45000;   // 탈 열차를 지도에서 못 찾을 때 도착 0초부터 이만큼 지나면 탄 것으로
export const BOARD_GIVE_UP_MS = 180000;   // 찾았어도 이만큼이면(열차 예측이 멈춘 경우)
export const BOARD_EARLY_S = 60;   // 곧 올 열차 줄에서 고른 열차가 이보다 많이 남았으면 지도 예측이 떠났다고 해도 타지 않았다

// 기다리기 → 탔다. 곧 도착 0초는 피드가 건너뛸 수 있고 목록 갱신이 끊길 수도 있어 여러 근거 중 하나면 탄 것으로 짐작한다
//  zeroSinceMs: 곧 도착 0초를 본 때(못 봤으면 0) · trainLeft: 짐작한 열차가 이 역을 떠났나(지도에 없으면 null)
//  pickedDueS: 고른 열차가 최근 받은 곧 올 열차 줄에서 몇 초 남았나(줄이 끊김 · 비었음 · 줄에서 빠짐이면 null)
//  trainGone: 짐작한 열차가 올 때가 지나 새 목록에서 사라졌나 · listFresh: 곧 올 열차 목록을 최근에 받았나 · departsPassed: 탈 시각 1분 지남
// 고른 열차가 탈 역을 떠났나: 차례(앞 9역)에서 그 역을 본 적이 있어야 한다(아직 먼 열차는 역이 차례에 없어 leftStation 이 떠남으로 본다)
export const pickedLeft = (track:PlanTrack, stationId:number, seen:boolean):boolean => (seen || track.seqIds.includes(stationId)) && leftStation(track, stationId);

// 고른 열차가 탈 역에 들어왔나(기다리기 카드의 「열차 도착 · 지금 타세요」) — 곧 올 열차 줄은 20초~1분 늦어 서 있는 열차를 「2분 뒤」로 보일 수 있어 지도 예측도 본다
//  zeroSinceMs: 곧 도착 0초를 본 때(0 = 못 봄) · pickedDueS: 고른 열차가 최근 줄에서 몇 초 남았나(모르면 null) · track: 고른 열차의 지도 예측(지도에 없으면 null)
//  셋 중 하나면 도착: 곧 도착 0초를 봤다 · 줄에서 0초 · 지도 예측이 그 역에 닿았고(reached) 아직 떠나지 않았다(leftStation 아님)
export interface ArrivedInput { zeroSinceMs:number; pickedDueS:number | null; track:PlanTrack | null; stationId:number }
export const pickedArrived = ({zeroSinceMs, pickedDueS, track, stationId}:ArrivedInput):boolean =>
  !!zeroSinceMs || (pickedDueS !== null && pickedDueS <= 0) || (!!track && reached(track, stationId) && !leftStation(track, stationId));

// 걷기 → 기다리기(지하로 들어가 위치가 끊김): 마지막 위치가 타는 역에서 150m 안이고 새 위치가 30초 넘게 안 오면(2026-11-06 계획서 — 거리는 사용자 확정 · 30초는 아테나 추천값)
//  30초는 ui/ride_along 이 위치를 「지금 위치」로 쓰는 시간(FIX_FRESH_MS)과 같다 — 그 뒤로는 위치가 없는 것처럼 시각으로만 넘겼다
export const LOST_NEAR_M = 150;
export const LOST_FIX_MS = 30000;
//  exitM: 마지막 위치에서 그 역의 가장 가까운 출구까지(m · 출구 자료가 없으면 null) — 50m(EXIT_NEAR_M) 안이어도 넘긴다(어느 출구든 · 2026-11-06 사용자 확정)
export interface LostInput { nowMs:number; lastFixMs:number; stationM:number | null; exitM?:number | null }
export const lostUnderground = ({nowMs, lastFixMs, stationM, exitM = null}:LostInput):boolean =>
  !!lastFixMs && nowMs - lastFixMs > LOST_FIX_MS && ((stationM !== null && stationM <= LOST_NEAR_M) || atExit(exitM));

// 걷기 → 기다리기(그 역의 어느 출구든 — 2026-11-06 사용자 확정): 길찾기가 정한 출구가 아닌 출구로 들어가도 넘기게 탈 역의 모든 출구를 본다
//  goalM: 걷는 길 끝(정한 출구)까지 · stationM: 역 한가운데까지(다음이 지하철이 아니면 null) · exitM: 가장 가까운 출구까지(출구 자료가 없으면 null)
export const EXIT_NEAR_M = 50;
const atExit = (exitM:number | null):boolean => exitM !== null && exitM <= EXIT_NEAR_M;
export const nearestM = (spot:LngLat, points:readonly LngLat[]):number | null =>
  points.reduce<number | null>((best, point) => { const away = metres(spot, point); return best === null || away < best ? away : best; }, null);
export interface NearInput { goalM:number; stationM:number | null; exitM:number | null }
// 기다리기로 넘길 만큼 가까운가: 길 끝 · 역 한가운데 100m(NEAR_M) 안이거나 아무 출구 50m 안(5초 머묾은 부르는 쪽이 센다)
export const nearBoarding = ({goalM, stationM, exitM}:NearInput):boolean =>
  goalM <= NEAR_M || (stationM !== null && stationM <= NEAR_M) || atExit(exitM);
// (가까워서 · 지하로 들어가 끊겨서 기다리기로 넘기면 남은 길은 0 으로 보고 승강장 90초만 그때부터 센다 — 2026-11-07 사용자 결정. 넘긴 자리의 남은 길은
//  길 밖 위치를 길 위로 비춘 값이라 역 앞에서도 100m 넘게 남아 「걸어서 2분」 · 열차 놓침으로 보였다)

// 고른 열차가 탈 역에 들어왔을 때(pickedArrived · 올 때가 지나 줄에서 사라짐 — 2026-11-07 사용자 결정): 승강장 시간이 끝났으면 그 순간 탄 것(board),
//  아직 남았으면 놓친 것(missed — 다음 열차로). 안 들어왔으면 null(지하라 위치 없이 시간으로만 가린다)
export type ArriveOutcome = 'board' | 'missed' | null;
export function arriveOutcome(walkS:number, arrived:boolean):ArriveOutcome {
  if (!arrived) return null;
  return walkS <= 0 ? 'board' : 'missed';
}

// 승강장 시간이 아직 남았는데 이미 이 역에 들어와 있는 열차는 고른 열차가 아니어도 놓친 열차(③ — 승강장에 닿기 전에 들어왔다).
// 이것을 빼지 않으면 승강장 시간이 끝나는 순간 서 있던 그 열차를 새로 골라 바로 탄 것으로 봤다(2026-11-07 화면 추적 — 0102 「시청 도착」 90초 넘게).
// 들어와 있음은 남은 초 0 이 아니라 줄의 글(「시청 도착」 · 「시청 진입」 — /api/live?arrivals= message)로 본다: 「전역 도착 150초」를 시계로 깎으면
// 실제보다 100초쯤 먼저 0 이 된다(같은 날 추적 0106)
export function arrivedEarly(rows:readonly { message:string; trainNo?:string | null }[], walkS:number, station:string):string[] {
  if (walkS <= 0) return [];
  const name = station.replace(/\([^)]*\)/g, '').trim();
  return rows.flatMap(row => row.trainNo && (row.message === `${name} 도착` || row.message === `${name} 진입`) ? [row.trainNo] : []);
}

// 탄 것으로 넘긴 뒤 → 사실은 놓침(2026-11-10 사용자 — 열차를 못 타고 승강장에 남았는데 「타는 중」 그대로): 탄 열차가 이 구간의 다음 역에 닿았거나 지났는데
//  내 위치는 아직 탄 역(역 한가운데 100m · 아무 출구 50m — 걷기 → 기다리기와 같은 nearBoarding)이면 그 위치를 센다. 연달아 OFF_FIXES(3)번이면 놓친 것
//  (지하라 위치가 안 오면 세지 않는다 — 지금처럼 탄 것으로 둔다)
export function stayedFixes(count:number, track:PlanTrack | null, nextId:number | undefined, atBoarding:boolean):number {
  if (!track || nextId === undefined || !atBoarding) return 0;
  return reached(track, nextId) || leftStation(track, nextId) ? count + 1 : 0;
}
export const leftBehind = (count:number):boolean => count >= OFF_FIXES;

// 기다리기 → 탔다는 열차가 떠난 뒤 내 위치로 가린다(2026-11-11 사용자 선택 B — 출구 ~ 승강장 통로가 길어 승강장 90초가 지나도 아직 통로에 있을 수 있다).
// 고른 열차가 들어오면(승강장 시간 끝) 바로 넘기지 않고 기다리기 화면 그대로 붙들고(hold), 떠난 뒤:
//  위치가 탄 역에서 벗어나(역 한가운데 100m · 아무 출구 50m 밖 — nearBoarding 아님) 탄 역보다 열차에 더 가까우면 그 위치를 센다. 연달아 OFF_FIXES(3)번이면 탄 것
export interface WithTrainInput { stationM:number; exitM:number | null; trainM:number }
export function withTrainFixes(count:number, {stationM, exitM, trainM}:WithTrainInput):number {
  return !nearBoarding({goalM: Infinity, stationM, exitM}) && trainM < stationM ? count + 1 : 0;
}
//  sinceMs: 붙든 때 · leftMs: 열차가 탈 역을 떠난 것을 본 때(0 = 아직) · lastFixMs: 마지막 위치를 받은 때(0 = 없음) · moved: withTrainFixes 수 · nextReached: 열차가 다음 역에 닿았나(지났나)
//  탄 것: 열차를 따라 움직임 · 떠난 뒤 위치가 30초(LOST_FIX_MS — 걷기 → 기다리기의 지하 끊김과 같은 값) 넘게 안 옴(지하) ·
//   지도 예측이 떠나지 않은 채 3분(BOARD_GIVE_UP_MS — 예측이 멈춘 경우 · 붙들기 전과 같은 값)
//  놓친 것: 열차가 다음 역에 닿았는데 떠난 뒤 받은 마지막 위치가 열차 쪽이 아니다(아직 탄 역 · 통로 근처)
export interface HoldInput { nowMs:number; sinceMs:number; leftMs:number; lastFixMs:number; moved:number; nextReached:boolean }
export function holdOutcome({nowMs, sinceMs, leftMs, lastFixMs, moved, nextReached}:HoldInput):ArriveOutcome {
  if (!leftMs) return nowMs - sinceMs >= BOARD_GIVE_UP_MS ? 'board' : null;
  if (moved >= OFF_FIXES || nowMs - Math.max(lastFixMs, leftMs) > LOST_FIX_MS) return 'board';
  return nextReached && lastFixMs >= leftMs && !moved ? 'missed' : null;
}

export interface BoardInput { nowMs:number; zeroSinceMs:number; trainLeft:boolean | null; pickedDueS:number | null; trainGone:boolean; listLength:number; listFresh:boolean; departsPassed:boolean }
export function boardNow({nowMs, zeroSinceMs, trainLeft, pickedDueS, trainGone, listLength, listFresh, departsPassed}:BoardInput):boolean {
  // 지도 예측은 앞서 나갈 수 있다 — 곧 올 열차 줄이 아직 1분 넘게 남았다고 하면 떠난 것으로 보지 않는다
  const early = pickedDueS !== null && pickedDueS > BOARD_EARLY_S;
  if ((trainLeft && !early) || trainGone) return true;
  if (zeroSinceMs && (trainLeft !== null ? nowMs - zeroSinceMs >= BOARD_GIVE_UP_MS : nowMs - zeroSinceMs >= BOARD_FALLBACK_MS)) return true;
  return (!listLength || !listFresh) && departsPassed;
}

// 타는 중 → 내렸다: 탄 열차 예측(track — 지도에 없으면 null)에 내릴 역이 있으면 그것으로(늦는 열차도 기다린다)
//  내릴 역이 빠졌으면: 아직 이 구간의 역을 앞에 두었으면(예측이 9역까지라 먼 내릴 역이 안 보임) 넉넉한 시각(longOver), 아니면(지나침 · 다른 길) 시각(timeOver)
export function rideOver(track:PlanTrack | null, stations:readonly number[], timeOver:boolean, longOver:boolean):boolean {
  const toId = stations[stations.length - 1];
  if (!track || toId === undefined) return timeOver;
  if (track.seqIds.includes(toId)) return reached(track, toId);
  return track.seqIds.some(id => stations.includes(id)) ? longOver : timeOver;
}

// 역 이름 맞추기: "용산(급행)" · "용산역" → "용산"
const bareName = (name:string):string => name.replace(/\(.*?\)/g, '').trim().replace(/역$/, '');

// 곧 올 열차 줄이 이 구간에 맞나: 같은 노선 · 같은 방향이고 내릴 역까지 간다
//  trainSeq: 그 열차의 지도 예측 차례(앞 9역까지만 — routing MAX). 내릴 역에 닿기 전에 길 밖 역이 BRANCH_SKIP 보다 많이 이어지면 다른 지선
//   (구간 stations 는 정차역뿐이라 급행이 건너뛰는 역 — 9호선 노량진→여의도 사이 샛강 — 은 길 밖 역으로 끼지만 지선이 아니다 · 2026-11-04 운영 시험)
//  행선지 이름이 내릴 역 앞 역(탈 역 포함)이면 그 전에 끝난다(지도에 없는 열차의 지선은 이름으로 못 거른다)
export const BRANCH_SKIP = 4;   // 구간 밖 역이 이만큼까지 이어지면 급행 건너뛰기, 넘으면 다른 지선
export interface ArrivalRowLike { line:string; direction:string; destination?:string | null; trainNo?:string | null }
export function arrivalFits(row:ArrivalRowLike, leg:RideTrainLeg, trainSeq:readonly number[] | null, nameOf:(id:number) => string | undefined):boolean {
  if (row.line !== leg.line || row.direction !== leg.direction) return false;
  const toId = leg.stations[leg.stations.length - 1], onLeg = new Set(leg.stations);
  if (trainSeq && toId !== undefined) {
    const start = trainSeq.findIndex(id => onLeg.has(id) && id !== toId);
    let offRun = 0;
    if (start >= 0) for (const id of trainSeq.slice(start)) { if (id === toId) break; if (onLeg.has(id)) offRun = 0; else if (++offRun > BRANCH_SKIP) return false; }
  }
  if (!row.destination) return true;
  const destination = bareName(row.destination);
  return !leg.stations.slice(0, -1).some(id => { const name = nameOf(id); return !!name && bareName(name) === destination; });
}

// ---- 알림 때(계획서 plans/feature/20261111-syung-타고-가기-앱-알림.md — D2 · 5절 글): 지금 구간(기다리기 · 타기)마다
//  탈 준비 = 기다리는 동안 걸어서 탈 수 있는 첫 열차 · 버스가 오기 2분 전(실시간 도착을 알 때만 — 시간표만으로 「곧 와요」를 하지 않는다)
//  내림 준비 = 내릴 역(정류장) 바로 앞 역을 떠날 때: 탄 열차의 예측(leaveAtMs)을 알면 그것, 카드가 「다음 역에서 내려요」(남은 1정거장)면 지금,
//   모르면 탄 때 + 타는 시간 × (정거장 − 1) ÷ 정거장(서버 구간에 역마다 시각이 없어 고르게 나눈다). 탄 때는 타는 중이면 탄 시각,
//   기다리는 중이면 실시간으로 올 때 — 기다리는 중에 그것을 모르면 내림 준비도 만들지 않는다(계획 시각이 이미 지났으면 승강장에서 「내리세요」가 울리고 id 가 소진된다)
// id 는 구간 번호로(놓쳐서 다음 열차 · 버스를 기다리면 탈 준비는 새 id — tries 는 놓친 수). at 은 1970 기준 ms
export const BOARD_ALERT_S = 120;   // 곧 와요: 도착 2분 전(2026-11-11 사용자 D2)
export interface RideAlert { id:string; at:number; title:string; body:string }
export interface AlertInput {
  legs:readonly RideLeg[]; index:number; step:'wait' | 'ride'; nowMs:number; tries:number;
  // boardAtMs: 기다리는 열차 · 버스가 올 때(실시간 — 모르면 null) · boardedMs: 탄 때(타는 중만)
  boardAtMs:number | null; boardedMs:number | null;
  // leaveAtMs: 탄 열차가 내릴 역 앞 역을 떠날 때(지도 예측 — 모르면 null) · stopsLeft: 카드의 남은 정거장(모르면 null)
  leaveAtMs:number | null; stopsLeft:number | null;
}
// 시각 글(「08:21」) → 지금에서 12시간 안쪽의 그 시각(ms)
export function clockMs(time:string, nowMs:number):number {
  const now = new Date(nowMs), day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), at = day + hm(time) * 60000;
  const gap = at - nowMs, half = 720 * 60000;
  if (gap > half) return at - 1440 * 60000;
  return gap < -half ? at + 1440 * 60000 : at;
}
// 앞 역을 떠나는 계획 시각: 탄 때부터 타는 시간의 (정거장 − 1) ÷ 정거장 뒤
export function alightPlanMs(leg:RideTrainLeg | RideBusLeg, boardMs:number):number {
  const spanMs = ((hm(leg.arrives) - hm(leg.departs) + 1440) % 1440) * 60000, stops = Math.max(1, leg.stops);
  return boardMs + spanMs * (stops - 1) / stops;
}
// 알림 글(5절 공통 스펙): 지하철 「🚇 4호선 사당 방면 열차가 곧 와요」 · 「탈 준비하세요」(방면은 기다리기 카드 waitTitle 과 같은 글)
export function boardAlertText(leg:RideTrainLeg | RideBusLeg):{ title:string; body:string } {
  return leg.type === 'bus' ? {title: `🚌 ${leg.route} 버스가 곧 와요`, body: ''} : {title: `🚇 ${leg.line} ${leg.to} 방면 열차가 곧 와요`, body: '탈 준비하세요'};
}
export function alightAlertText(leg:RideTrainLeg | RideBusLeg):{ title:string; body:string } {
  return {title: leg.type === 'bus' ? `🚌 다음 정류장 ${leg.to}에서 내리세요` : `🚇 다음 역 ${leg.to}에서 내리세요`, body: ''};
}
export function rideAlerts({legs, index, step, nowMs, tries, boardAtMs, boardedMs, leaveAtMs, stopsLeft}:AlertInput):RideAlert[] {
  const leg = legs[index];
  if (!leg || leg.type === 'walk') return [];
  const alerts:RideAlert[] = [];
  if (step === 'wait' && boardAtMs !== null) alerts.push({id: `board:${index}:${tries}`, at: boardAtMs - BOARD_ALERT_S * 1000, ...boardAlertText(leg)});
  if (step === 'wait' && boardAtMs === null) return alerts;
  // 타는 중에 탄 시각을 모를 때만 계획 출발 시각으로
  const boardMs = (step === 'ride' ? boardedMs : boardAtMs) ?? clockMs(leg.departs, nowMs);
  const last = step === 'ride' && stopsLeft !== null && stopsLeft <= 1;
  alerts.push({id: `alight:${index}`, at: last ? nowMs : leaveAtMs ?? alightPlanMs(leg, boardMs), ...alightAlertText(leg)});
  return alerts;
}

// 이미 울린 것 빼고 보낼 목록(ui/ride_alerts 가 부른다): 울릴 때가 지난 것은 — 아직 안 보냈거나 보낸 때가 아직 오지 않았으면(예측이 당겨짐) 지금 울리고,
//  이미 그때로 보냈으면 그쪽(앱 예약 · 브라우저 타이머)이 울렸으니 뺀다. 한 번 울린 id 는 다시 넣지 않는다(fired 에 더한다)
//  sent: 지난번 보낸 것(id → 울릴 때 · 글)
export interface SentAlert { at:number; text:string }
export function dueAlerts(list:readonly RideAlert[], sent:ReadonlyMap<string, SentAlert>, fired:Set<string>, nowMs:number):RideAlert[] {
  const out:RideAlert[] = [];
  for (const alert of list) {
    if (fired.has(alert.id)) continue;
    if (alert.at > nowMs) { out.push(alert); continue; }
    fired.add(alert.id);
    const was = sent.get(alert.id)?.at;
    if (was === undefined || was > nowMs) out.push({...alert, at: nowMs});
  }
  return out;
}
// 다시 보낼까: id · 글이 바뀌었거나 울릴 때가 10초 넘게 움직였다(실시간 도착 · 예측은 받을 때마다 조금씩 흔들린다)
export const ALERT_MOVE_MS = 10000;
export function alertsChanged(next:readonly RideAlert[], sent:ReadonlyMap<string, SentAlert>):boolean {
  if (next.length !== sent.size) return true;
  return next.some(alert => { const was = sent.get(alert.id); return !was || was.text !== `${alert.title}\n${alert.body}` || Math.abs(was.at - alert.at) >= ALERT_MOVE_MS; });
}
