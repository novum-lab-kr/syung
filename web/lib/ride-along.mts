// 타고 가기(「이 길로 출발」 뒤 뚜벅이 네비): 셈과 카드 글만 — 위치 · 열차 · 카메라는 ui/ride_along.mts 가 맡고, 카드는 components/ride_card.tsx 가 그린다.
// 값의 근거는 계획서 plans/feature/20261102-슝-타고-가기.md 4절 「단순 흐름」 · 「더한 것」(2026-11-02 · 2026-11-04 사용자 확정)
// 걷기 시간 근거(server/services/journey_graph.py): 역까지 · 역에서 걷기 구간 seconds 에는 땅 위↔승강장 90초(STATION_ACCESS)가 들어 있다 · 같은 역 갈아타기는 구간 사이 시각 차(GTFS 최소 환승)
export type LngLat = readonly [number, number];

export const NEAR_M = 100;             // 역 · 정류장 이만큼 안이면 기다리기(2026-11-04 확정)
export const NEAR_HOLD_MS = 5000;      // …에 이만큼 머물면(위치가 튀어 왔다 갔다 하지 않게)
export const OFF_M = 60;               // 걷는 길에서 이만큼 넘게 벗어나
export const OFF_HOLD_MS = 10000;      // …이만큼 지나면 「다른 길 찾기」
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
// 길 위에서 가장 가까운 자리: off 길에서 떨어진 거리 · at 길 처음부터 그 자리까지 · total 길 전체
export function onPath(point:LngLat, path:readonly LngLat[]):{ off:number; at:number; total:number } {
  if (path.length < 2) return {off: path[0] ? metres(point, path[0]) : 0, at: 0, total: 0};
  const cos = Math.cos(point[1] * Math.PI / 180), flat = (spot:LngLat) => [spot[0] * cos * M_PER_DEG, spot[1] * M_PER_DEG] as const, here = flat(point);
  let best = Infinity, bestAt = 0, walked = 0;
  for (let index = 1; index < path.length; index++) {
    const start = flat(path[index - 1]!), end = flat(path[index]!), dx = end[0] - start[0], dy = end[1] - start[1], span = Math.hypot(dx, dy);
    const share = span ? Math.max(0, Math.min(1, ((here[0] - start[0]) * dx + (here[1] - start[1]) * dy) / (span * span))) : 0;
    const gap = Math.hypot(here[0] - start[0] - dx * share, here[1] - start[1] - dy * share);
    if (gap < best) { best = gap; bestAt = walked + span * share; }
    walked += span;
  }
  return {off: best, at: bestAt, total: walked};
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
export interface RideCardView { title:string; say:string | null; sub:string; detour:boolean; image:string; flip:boolean; following:boolean }
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
export function waitText(legs:readonly RideLeg[], index:number, walkS:number, arrivalsS:readonly number[] | null, turn:number):{ say:string | null; sub:string } {
  const previous = legs[index - 1], parts:string[] = [];
  if (previous && previous.type !== 'walk') parts.push(stepNo(legs, index - 1));
  parts.push(`걸어서 ${minutes(walkS)}분`);
  if (!arrivalsS?.length) return {say: null, sub: parts.join(' · ')};
  const {missed, next} = catchable(arrivalsS, walkS), [first, second] = next;
  if (first !== undefined) parts.push(missed ? `다음 열차 ${minutes(first)}분 뒤` : `열차 ${minutes(first)}분 뒤`);
  if (second !== undefined) parts.push(missed ? `그다음 ${minutes(second)}분 뒤` : `다음 ${minutes(second)}분 뒤`);
  const kind = missed || first === undefined ? 'miss' : talkKind(first, walkS);
  return {say: talkLine(kind, turn), sub: parts.join(' · ')};
}

// 타기 카드: 「사당에서 내려요」 · 「2/4 · 5정거장 · 08:21」 → 한 정거장 남으면 「2/4 · 다음 역에서 내려요」
export const rideTitle = (leg:RideTrainLeg | RideBusLeg):string => `${leg.to}에서 내려요`;
export function rideSub(legs:readonly RideLeg[], index:number, stopsLeft:number):string {
  const leg = legs[index] as RideTrainLeg | RideBusLeg;
  return stopsLeft <= 1 ? `${stepNo(legs, index)} · 다음 ${leg.type === 'bus' ? '정류장' : '역'}에서 내려요` : `${stepNo(legs, index)} · ${stopsLeft}정거장 · ${leg.arrives}`;
}
// 도착 카드: 「슝 도착!」 · 「강남역 · 08:40 · 32분 걸렸어요」
export function doneSub(toName:string, now:Date, startedMs:number):string {
  const pad = (value:number) => String(value).padStart(2, '0');
  return `${toName} · ${pad(now.getHours())}:${pad(now.getMinutes())} · ${minutes((+now - startedMs) / 1000)}분 걸렸어요`;
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
export function stopsLeft({seqIds, cum, dist}:PlanTrack, stations:readonly number[]):number | null {
  const goal = seqIds.indexOf(stations[stations.length - 1]!);
  if (goal < 0) return null;
  let count = 0;
  for (let index = 0; index <= goal; index++) if (cum[index]! > dist + gapAt(cum, index) * 0.03) count++;
  return count;
}
// 열차를 못 따라갈 때(지도에 없음): 탄 시각 · 내릴 시각 사이 지난 몫으로
export function stopsLeftByTime(leg:RideTrainLeg | RideBusLeg, now:Date):number {
  const start = hm(leg.departs), end = hm(leg.arrives), span = ((end - start + 1440) % 1440) || 1, gone = ((now.getHours() * 60 + now.getMinutes() - start + 1440) % 1440);
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

// 기다리기 → 탔다. 곧 도착 0초는 피드가 건너뛸 수 있고 목록 갱신이 끊길 수도 있어 여러 근거 중 하나면 탄 것으로 짐작한다
//  zeroSinceMs: 곧 도착 0초를 본 때(못 봤으면 0) · trainLeft: 짐작한 열차가 이 역을 떠났나(지도에 없으면 null)
//  trainGone: 짐작한 열차가 올 때가 지나 새 목록에서 사라졌나 · listFresh: 곧 올 열차 목록을 최근에 받았나 · departsPassed: 탈 시각 1분 지남
// 고른 열차가 탈 역을 떠났나: 차례(앞 9역)에서 그 역을 본 적이 있어야 한다(아직 먼 열차는 역이 차례에 없어 leftStation 이 떠남으로 본다)
export const pickedLeft = (track:PlanTrack, stationId:number, seen:boolean):boolean => (seen || track.seqIds.includes(stationId)) && leftStation(track, stationId);

export interface BoardInput { nowMs:number; zeroSinceMs:number; trainLeft:boolean | null; trainGone:boolean; listLength:number; listFresh:boolean; departsPassed:boolean }
export function boardNow({nowMs, zeroSinceMs, trainLeft, trainGone, listLength, listFresh, departsPassed}:BoardInput):boolean {
  if (trainLeft || trainGone) return true;
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
