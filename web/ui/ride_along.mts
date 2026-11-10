// 타고 가기(「이 길로 출발」 뒤): 카드 한 장이 경로 순서대로 걷기 → 기다리기 → 타기 → … → 「슝 도착!」.
// 셈 · 글은 lib/ride-along.mts, 카드 그리기는 components/ride_card.tsx(본체가 drawRideCard 로 넘긴다).
// 위치는 출발한 동안만 휴대폰 안에서 비교하고 서버로 보내지 않는다(내 위치 단추가 꺼져 있었으면 켰다가 끝날 때 끈다).
// 땅 위: 내 위치로 진행 · 지하철: 탄 열차(짐작 — 지도에서 같은 노선 열차를 누르면 그 열차로 바로잡기)의 실시간 위치로 · 위치도 열차도 없으면 시각으로.
// 버스: 기다리는 동안은 정류장 도착(남은 시간)과 노선 버스 위치(곧 올 차가 정류장에 들어오면 탄 것 · 승강장 시간 전이면 놓침 — 2026-11-07 사용자 결정),
// 탄 뒤에는 내 위치와 남은 정거장으로 · 탄 차는 슝 실시간 위치 대신 내 위치에 그린다(버스 안 GPS 가 더 정확 — 2026-11-07 사용자 결정)
import { serverUrl } from '../lib/server_url.mts';
import {
  BAD_FIX_M, BOARD_GIVE_UP_MS, HURRY_SHARE, NEAR_HOLD_MS, NEAR_M, OFF_M, STATION_ACCESS_S,
  arrivalFits, arrivedEarly, arriveOutcome, boardNow, characterOf, holdOutcome, leftBehind, lostUnderground, nearBoarding, nearestM, pickedArrived, doneParts, doneSub, rideEndSpot, leftStation, legOverByTime, legPace, measuredPace, metres, onPath, onPathFrom, pickedLeft, offFixes, rideOver, rideSteps, rideStops, shouldReroute, rideSub, stayedFixes, rideTitle, withTrainFixes, reached, splitPath, stopsLeft, stopsLeftByTime,
  transferS, waitText, waitTitle, walkLeftS, walkSub, walkTitle,
  type LngLat, type RideBusLeg, type RideCardView, type RideWhere, type RideLeg, type RideStep, type RideTrainLeg,
} from '../lib/ride-along.mts';

// /api/live?arrivals= 한 줄(server/services/live.py index_arrivals — 이 파일이 읽는 칸)
export interface RideArrival { line:string; direction:string; destination?:string | null; trainNo?:string | null; eta:number | null; message:string; receivedAt:string | null }
interface RidePlanLike { id:string; seq:readonly { id:number }[]; cum:readonly number[] }
interface GeolocateLike { trigger():boolean; _watchState:string; on(type:'geolocate', listener:(event:{ coords:GeolocationCoordinates }) => void):unknown }
interface CameraMap {
  getZoom():number; isMoving():boolean;
  easeTo(options:{ center:[number, number]; zoom?:number; padding:{ top:number; bottom:number; left:number; right:number }; duration:number }):unknown;
  jumpTo(options:{ center:{ lng:number; lat:number }; padding:{ top:number; bottom:number; left:number; right:number } }):unknown;
  on(type:'movestart', listener:(event:{ originalEvent?:unknown }) => void):unknown;
}
export interface RideCardActionsLike { close():void; detour():void; follow():void }
export interface RideAlongDeps {
  map:CameraMap; geolocate:GeolocateLike; planner:{ plans:readonly RidePlanLike[] }; trainPose:(plan:never) => { dist:number }; trainLngLat:(plan:never) => { lng:number; lat:number };
  arrivalRank:(row:never) => number; byId:ReadonlyMap<number, { lat:number; lon:number; name:string }>; animFrame:(() => void)[];
  drawRideCard:(host:HTMLElement, view:RideCardView | null, actions:RideCardActionsLike) => void;
  look:() => string | null | undefined; walked:(leg:number, cut:{ done:LngLat[]; rest:LngLat[] } | null) => void;
  // arrived: 「슝 도착!」 카드의 ✕(목적지에 닿은 뒤) — 길찾기를 다 끝낸다 · false 는 타는 도중 ✕(경로는 아래 막대로 남긴다)
  ended:(arrived:boolean) => void; detour:() => void;
  // 걷는 길에서 벗어남: 지금 위치 → 그 걷는 구간(plan.legs[index])의 끝까지 걷기만 다시 찾아 그 구간만 바꾼 경로(lib/journey-ui reroute — 탈 것은 그대로).
  // 못 찾으면 null · use() 는 그 경로를 지도 · 아래 막대에 둔다
  reroute:(spot:LngLat, plan:RidePlan, index:number) => Promise<{ plan:RidePlan; use():void } | null>;
  // 시트의 다른 따라가기(열차 · 버스 — ui/sheet.mts following · followBus): 켜져 있으면 타고 가기 카메라가 비키고, 「다시 따라가기」는 그쪽을 끈다
  otherFollow:{ active():boolean; stop():void };
  // 역의 모든 출구 좌표(본체가 받은 /exits.json — 역 번호 → 출구들 · 아직 못 받았거나 없으면 [])
  exitsOf:(stationId:number) => readonly LngLat[];
  // 버스 구간에서 내 위치의 지금 정류장 · 다음 정류장(bus/layer journeyStopAt — 버스 층이 없거나 노선을 못 맞추면 null · now null = 아직 탄 정류장 다음을 못 지남)
  busStopAt:(leg:RideBusLeg, spot:LngLat, share:number | null) => { now:string | null; next:string | null } | null;
  // 버스 기다리기 · 타기(bus/layer journeyBoard · journeyArrivals · journeyApproach · journeyAtStop · rideWith — 버스 층이 없으면 모두 null)
  bus:{
    // routeId '' + routeName: 서울 자료에 없는 노선(광역 등) — 도착만 이름으로 받고 곧 올 차 · 탄 차는 모른다
    board(leg:RideBusLeg):{ routeId:string; stopId:string; arsId:string | null; routeName?:string } | null;
    arrivals(arsId:string, routeId:string, routeName:string | null):Promise<number[] | null>;
    approach(routeId:string, stopId:string, skip:ReadonlySet<string>):string | null;
    atStop(vehicleId:string, stopId:string):boolean | null;
    // riding: 버스를 타는 단계인지 — 타는 동안은 탄 차를 놓쳐도(vehicleId null) 내 위치 캐릭터를 계속 숨긴다(2026-11-08 사용자 결정)
    ride(vehicleId:string | null, spot:LngLat | null, riding:boolean):void;
    // 기다리거나 타는 버스 노선(서울 노선 id — 버스 구간을 떠나면 null): 지도에서 다른 노선 · 정류장을 눌러도 이 노선 실시간은 계속 받는다
    watch(routeId:string | null):void;
    // 타고 가기 동안 버스 정류장 기둥은 내 경로의 것만(2026-11-10 사용자 결정 — 배터리 · bus/layer setRouteOnly). 그만두면 false
    routeOnly?(on:boolean):void;
  };
}
export interface RidePlan { arrives:string; legs:readonly unknown[] }

// ARRIVALS_STALE: 곧 올 열차 목록을 이만큼 못 새로 받으면 없는 것처럼(탈 시각으로)
// BUS_ARRIVALS_MS: 버스 정류장 도착은 서버가 하루 장부로 아껴 받는 자료라 정류장 시트(30초)와 같게 · BUS_MISS_MS: 놓친 버스가 아직 남은 도착 목록에서 그 버스로 볼 창
const BUS_ARRIVALS_MS = 30000, BUS_MISS_MS = 30000;
const TICK_MS = 1000, ARRIVALS_MS = 20000, ARRIVALS_STALE_MS = ARRIVALS_MS * 3, FIX_FRESH_MS = 30000;
const FOLLOW_ZOOM = 16, RIDE_ZOOM = 15, FOLLOW_EASE = 0.25;

export function createRideAlong({map, geolocate, planner, trainPose, trainLngLat, arrivalRank, byId, animFrame, drawRideCard, look, walked, ended, detour, reroute, otherFollow, exitsOf, busStopAt, bus}:RideAlongDeps) {
  const host = document.createElement('div');
  host.className = 'rg-host';
  document.body.append(host);

  type Ride = {
    legs:RideLeg[]; arrives:string; toName:string; steps:RideStep[]; at:number; startedMs:number; turn:number;
    // offFixes: 걷는 길에서 연달아 벗어난 위치 수 · rerouting: 길을 다시 찾는 중 · reroutedAt: 지난번 다시 찾은 때(ms, 0 = 아직) · detour: 다시 못 찾아 「다른 길 찾기 ›」
    nearSince:number; offFixes:number; rerouting:boolean; reroutedAt:number; detour:boolean; track:{ t:number; at:number }[];
    train:string | null; zeroSince:number; arrivals:RideArrival[] | null; arrivalsFor:number; leftM:number; waitFrom:{ s:number; at:number };
    // picked: 곧 올 목록에서 걸어서 탈 수 있어 고른 열차 · due: 그 열차가 올 때(ms) · arrivalsAt: 목록을 마지막으로 받은 때
    picked:string | null; pickedSaw:boolean; due:{ trainNo:string; atMs:number } | null; arrivalsAt:number;
    // missed: 승강장 시간 전에 들어와 놓친 열차 번호(곧 올 열차 줄에서 빼고 다음 열차를 고른다)
    missed:Set<string>;
    // stayed: 탄 열차는 다음 역에 갔는데 내 위치가 탄 역에 그대로인 위치 수 · backed: 그래서 기다리기로 되돌아왔다(탈 시각으로는 다시 넘기지 않는다)
    stayed:number; backed:boolean;
    // hold: 고른 열차가 들어와 탈 수 있었는데 아직 탔는지 모름 — 떠난 뒤 내 위치로 가린다(기다리기 화면 그대로 · 2026-11-11 사용자 선택 B)
    //  id 열차 · sinceMs 붙든 때 · leftMs 탈 역을 떠난 것을 본 때(0 = 아직) · moved 떠난 뒤 열차를 따라간 위치 수
    hold:{ id:string; trainNo:string; sinceMs:number; leftMs:number; moved:number } | null;
    // 버스 기다리기: board 탈 정류장 · etas 그 노선 버스가 올 때(ms) · etasAt 받은 때 · car 지켜보는 곧 올 차 · missedAt 놓친 때(0 = 없음)
    // ridden: 탄 차(정류장에 들어온 그 차 — 모르면 null · 지도에서 내 위치에 그린다)
    busBoard:{ routeId:string; stopId:string; arsId:string | null; routeName?:string } | null; etas:number[] | null; etasAt:number; car:string | null; missedAt:number; ridden:string | null;
    // busAt: 버스 구간 길(leg.path) 위 지난 자리(m) — 고리 노선에서 앞으로만 찾는다(onPathFrom)
    busAt:number;
  };
  let ride:Ride | null = null, timer:ReturnType<typeof setInterval> | 0 = 0, arrivalsTimer:ReturnType<typeof setInterval> | 0 = 0, busTimer:ReturnType<typeof setInterval> | 0 = 0;
  let fix:{ spot:LngLat; t:number } | null = null, following = true, turnedOn = false, cam:{ lng:number; lat:number } | null = null, camAt = 0, camKey = '';

  const step = () => ride ? ride.steps[ride.at]! : null;
  const legAt = (index:number) => ride?.legs[index];
  const freshFix = () => fix && Date.now() - fix.t < FIX_FRESH_MS ? fix.spot : null;
  // 도착 자리(지도 속 도착 표시 · 도착 때 카메라)
  const endSpot = ():LngLat | null => ride ? rideEndSpot(ride.legs, id => { const station = byId.get(id); return station ? [station.lon, station.lat] : null; }) : null;
  const planOf = (id:string | null) => id ? planner.plans.find(plan => plan.id === id) ?? null : null;
  const trackOf = (plan:RidePlanLike) => ({seqIds: plan.seq.map(station => station.id), cum: plan.cum, dist: trainPose(plan as never).dist});
  // 카드 높이만큼 아래를 비워 내 위치 · 열차가 말풍선 위에 오게
  const pad = () => { const card = host.querySelector('.rg-talk'); return {top: 0, bottom: card ? Math.max(0, innerHeight - card.getBoundingClientRect().top) : 0, left: 0, right: 0}; };

  // ---- 위치: 내 위치 단추(GeolocateControl)의 위치를 같이 받는다. 꺼져 있었으면 켜고 끝날 때 끈다
  // 출발 전에 받은 위치도 30초 안이면 쓴다(같은 자리면 다시 오지 않는다)
  geolocate.on('geolocate', event => {
    if (event.coords.accuracy > BAD_FIX_M) return;
    fix = {spot: [event.coords.longitude, event.coords.latitude], t: Date.now()};
    if (!ride) return;
    offTrack(fix.spot);
    leftWithoutMe(fix.spot);
    followHeld(fix.spot);
    tick();
    const current = step();
    if (following && current && current.kind !== 'done' && !(current.kind === 'ride' && legAt(current.leg)?.type === 'ride')) map.easeTo({center: [...fix.spot], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 600});
  });
  const locate = () => { if (geolocate._watchState === 'OFF') { turnedOn = true; geolocate.trigger(); } };
  const unlocate = () => {
    if (!turnedOn) return;
    turnedOn = false;
    for (let tries = 0; tries < 3 && geolocate._watchState !== 'OFF'; tries++) geolocate.trigger();   // 한쪽으로 끈 지도(BACKGROUND)는 한 번 더 눌러야 꺼진다
  };
  // 손으로 지도를 움직이면 따라가기를 멈추고 「다시 따라가기」
  map.on('movestart', event => { if (ride && event.originalEvent && following) { following = false; draw(); } });

  // 지하철을 타는 동안 지도가 따라갈 열차가 있는가(탄 열차가 지도 목록에 있을 때만). 본체가 시트 따라가기 루프(ui/sheet.mts followLoop) · 열차 층(trains/draw.mts)에
  // 이 값을 넘겨 루프를 돌린다 — 아래 animFrame 콜백은 그 루프가 부른다(루프는 시트 따라가기 · 롤코 · 버스일 때만 돌아, 이 값이 없으면 콜백이 한 번도 안 불린다 — 2026-11-04 운영)
  const followingTrain = ():boolean => { const current = step(); return !!ride && following && current?.kind === 'ride' && legAt(current.leg)?.type === 'ride' && !!planOf(ride.train); };
  // 시트에서 다른 열차 · 버스 따라가기를 고르면 손으로 움직였을 때와 같게 끈다(카드에 「다시 따라가기」). 프레임에서(같은 프레임에 둘 다 jumpTo 하면 뒤인 이쪽이
  // 덮어 버린다 — Codex 리뷰 2026-11-04)와 1초 tick 에서(고른 열차가 역에 서 있으면 프레임 루프가 안 돌아 카드가 안 바뀌었다 — 2026-11-04 로컬 확인) 본다
  const yieldToOther = ():boolean => { if (!ride || !following || !otherFollow.active()) return false; following = false; draw(); return true; };
  // 지하철을 타는 동안: 탄 열차를 말풍선 위 가운데에(시트 따라가기처럼 부드럽게 · 같은 자리면 건너뛴다)
  animFrame.push(() => {
    if (!ride || !following || yieldToOther()) return;
    if (!followingTrain() || map.isMoving()) return;
    const spot = trainLngLat(planOf(ride.train) as never), now = performance.now();
    if (!cam || now - camAt > 1000) cam = {lng: spot.lng, lat: spot.lat};
    else { const share = 1 - Math.exp(-(now - camAt) / 1000 / FOLLOW_EASE); cam = {lng: cam.lng + (spot.lng - cam.lng) * share, lat: cam.lat + (spot.lat - cam.lat) * share}; }
    camAt = now;
    const key = `${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;
    if (key === camKey) return;
    camKey = key;
    map.jumpTo({center: cam, padding: pad()});
  });

  // ---- 기다리는 역의 곧 올 열차(같은 노선 · 같은 방향)
  async function loadArrivals(index:number) {
    const leg = legAt(index);
    if (!ride || leg?.type !== 'ride' || !leg.direction) return;   // 방향을 모르는 구간(서버가 null — 9호선 등)은 곧 올 열차를 고를 수 없어 걷는 시간만
    const mine = ride;
    try {
      const response = await fetch(serverUrl(`./api/live?arrivals=${encodeURIComponent(leg.from.replace(/\([^)]*\)/g, ''))}`), {cache: 'no-store'});
      const answer = await response.json() as { arrivals?:RideArrival[] };
      if (ride !== mine || mine.steps[mine.at]?.kind !== 'wait') return;
      // 같은 노선 · 방향이고 내릴 역까지 가는 열차만(앞 종착 · 다른 지선 빼기 — 지도에 있는 열차는 예측 차례로)
      const seqOf = (row:RideArrival) => row.trainNo ? planOf(`${leg.line}:${row.trainNo}`)?.seq.map(station => station.id) ?? null : null;
      mine.arrivals = (answer.arrivals ?? []).filter(row => arrivalFits(row, leg, seqOf(row), id => byId.get(id)?.name));
      mine.arrivalsFor = index; mine.arrivalsAt = Date.now();
      draw();
    } catch { /* 다음 차례에 다시 */ }
  }
  // 길찾기가 알려 준 실시간 열차(trainNo)가 첫 짐작 — 곧 올 열차를 받으면 걸어서 탈 수 있는 첫 열차로 바꾼다
  const guessTrain = (index:number) => { const leg = legAt(index); return leg?.type === 'ride' && leg.trainNo ? `${leg.line}:${leg.trainNo}` : null; };
  const arrivalSecs = () => ride?.arrivals?.filter(row => !row.trainNo || !ride!.missed.has(row.trainNo)).map(row => ({row, s: arrivalRank(row as never)})).sort((first, second) => first.s - second.s) ?? null;
  // 놓친 열차가 줄에 아직 있나(카드를 「다음 열차」 글로)
  const missedShown = () => !!ride?.arrivals?.some(row => !!row.trainNo && ride!.missed.has(row.trainNo));

  // ---- 버스를 기다리는 정류장의 그 노선 도착(정류장 번호가 없는 가상 정류장 · 노선을 못 맞추면 받지 않는다 — 걷는 시간만)
  async function loadBusArrivals(index:number) {
    const leg = legAt(index), board = ride?.busBoard;
    if (!ride || leg?.type !== 'bus' || !board?.arsId) return;
    const mine = ride, times = await bus.arrivals(board.arsId, board.routeId, board.routeName ?? null);
    const current = mine.steps[mine.at];
    if (ride !== mine || current?.kind !== 'wait' || current.leg !== index || !times) return;
    mine.etas = times; mine.etasAt = Date.now();
    draw();
  }
  // 카드에 쓸 남은 초(놓친 버스는 그 뒤 30초 안에 오던 것으로 보고 뺀다 — 도착 자료에 차 번호가 없다)
  const busEtaSecs = (nowMs:number):number[] | null => ride?.etas?.filter(at => !ride!.missedAt || at > ride!.missedAt + BUS_MISS_MS).map(at => Math.max(0, (at - nowMs) / 1000)) ?? null;

  // 기다리기 카드가 뜬 순간 타는 곳까지 걷는 시간(초): 갈아타기는 환승 시간, 걸어온 길 끝이면 남은 길 + 승강장, 그 밖은 승강장까지만
  function walkFromS(index:number):number {
    const leg = legAt(index), previous = legAt(index - 1);
    if (!ride || !leg) return 0;
    if (previous?.type === 'ride' && leg.type === 'ride') return transferS(previous, leg);
    if (previous?.type === 'walk') return walkLeftS(ride.legs, index - 1, ride.leftM, measuredPace(ride.track) ?? legPace(ride.legs, index - 1));
    return leg.type === 'ride' ? STATION_ACCESS_S : 0;
  }
  // 지금 남은 걷기: 카드가 뜬 뒤로 걸은 만큼 줄어든다(타는 곳에 닿은 뒤 들어오는 열차를 탈 열차로 고를 수 있게)
  const waitWalkS = () => ride ? Math.max(0, ride.waitFrom.s - (Date.now() - ride.waitFrom.at) / 1000) : 0;
  // since: 걷는 시간을 셀 때부터(위치가 끊겨 넘기면 마지막 위치를 받은 때 — 그 뒤 걸은 만큼 이미 줄어 있다)
  const startWait = (index:number, since = Date.now()) => { if (ride) ride.waitFrom = {s: walkFromS(index), at: since}; };
  const startBusWait = (index:number) => {
    const leg = legAt(index);
    if (!ride || leg?.type !== 'bus') return;
    Object.assign(ride, {busBoard: bus.board(leg), etas: null, etasAt: 0, car: null, missedAt: 0, ridden: null, busAt: 0});
    bus.watch(ride.busBoard?.routeId || null);
    loadBusArrivals(index);
  };

  // ---- 한 걸음 나아가기(구간이 끝났다)
  function advance(waitSince?:number) {
    if (!ride) return;
    const was = step();
    if (was?.kind === 'walk') walked(was.leg + 1, null);
    ride.at = Math.min(ride.steps.length - 1, ride.at + 1);
    ride.turn++; ride.nearSince = 0; ride.offFixes = 0; ride.detour = false; ride.zeroSince = 0;
    ride.picked = null; ride.pickedSaw = false; ride.due = null; ride.arrivalsAt = 0; ride.missed = new Set(); ride.stayed = 0; ride.backed = false; ride.hold = null;
    if (was?.kind === 'ride') { ride.ridden = null; bus.ride(null, null, false); bus.watch(null); }   // 내린 버스는 다시 실시간 위치로
    const now = step()!;
    if (now.kind === 'wait' && legAt(now.leg)?.type === 'bus') startBusWait(now.leg);
    // 탄 차: 지켜보던 차가 정류장에 들어와 있을 때만(내 위치로 넘어왔는데 그 차가 아직 오기 전이면 다른 차를 탄 것 — 모름)
    if (now.kind === 'ride' && legAt(now.leg)?.type === 'bus') ride.ridden = ride.car && ride.busBoard && bus.atStop(ride.car, ride.busBoard.stopId) ? ride.car : null;
    if (now.kind === 'walk') { ride.track = []; ride.leftM = (legAt(now.leg) as { metres?:number })?.metres ?? 0; }
    if (now.kind === 'wait') startWait(now.leg, waitSince);
    if (now.kind === 'wait' && legAt(now.leg)?.type === 'ride') { ride.arrivals = null; ride.train = guessTrain(now.leg); loadArrivals(now.leg); }
    if (now.kind === 'ride') {
      const leg = legAt(now.leg);
      if (leg?.type === 'ride') { const plan = planOf(ride.train); if (plan && following) map.easeTo({center: [trainLngLat(plan as never).lng, trainLngLat(plan as never).lat], zoom: RIDE_ZOOM, padding: pad(), duration: 700}); }
    }
    const spot = freshFix();
    if (following && spot && now.kind !== 'ride' && now.kind !== 'done') map.easeTo({center: [...spot], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 600});
    if (now.kind === 'done') {
      clearInterval(timer); clearInterval(arrivalsTimer); clearInterval(busTimer); timer = arrivalsTimer = busTimer = 0; unlocate();
      // 도착: 카메라를 도착 자리로(도착 표시가 화면에 보이게 — 모르면 내 위치) · 그 뒤 위치가 와도 따라가지 않는다(위 geolocate)
      const end = endSpot() ?? spot;
      if (end) map.easeTo({center: [...end], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 800});
    }
    cam = null;
    draw();
  }

  // ---- 걷는 길에서 벗어남: 위치를 받을 때마다 센다(1초 tick 은 같은 위치를 여러 번 보니 세지 않는다). 20m 넘게 연달아 3번이면 지금 위치에서 다시 찾는다
  function offTrack(spot:LngLat) {
    const current = step(), leg = current?.kind === 'walk' ? legAt(current.leg) : null;
    if (!ride || leg?.type !== 'walk' || !leg.path || leg.path.length < 2) return;
    ride.offFixes = offFixes(ride.offFixes, onPath(spot, leg.path).off);
    if (!ride.offFixes) ride.detour = false;
    if (shouldReroute({offFixes: ride.offFixes, busy: ride.rerouting, nowMs: Date.now(), lastMs: ride.reroutedAt})) rerouteFrom(spot);
  }
  // 새 걷기가 오면 시트 없이 그 걷는 구간만 바꿔 같은 단계를 이어 간다(나머지 구간 · 탈 열차 · 버스는 그대로). 못 찾으면(길 없음 · 연결 · 터무니없는 답)
  // 지금 길 그대로 「다른 길 찾기 ›」. 그 사이 걷기가 끝났거나 그만뒀으면 버린다
  async function rerouteFrom(spot:LngLat) {
    const mine = ride!, at = mine.at, index = (mine.steps[at] as { leg:number }).leg;
    mine.rerouting = true;
    const found = await reroute(spot, {arrives: mine.arrives, legs: mine.legs}, index).catch(() => null);
    mine.rerouting = false; mine.reroutedAt = Date.now();
    if (ride !== mine || mine.at !== at) return;
    if (!found || found.plan.legs.length !== mine.legs.length) { mine.detour = true; draw(); return; }
    found.use();
    mine.turn++;
    const legs = found.plan.legs as RideLeg[];
    Object.assign(mine, {legs, arrives: found.plan.arrives, steps: rideSteps(legs), nearSince: 0, offFixes: 0, detour: false, track: [], leftM: (legs[index] as { metres?:number })?.metres ?? 0});
    cam = null;
    const now = freshFix();
    if (following && now) map.easeTo({center: [...now], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 600});
    draw();
  }

  // ---- 지하철을 탄 것으로 넘겼는데 열차만 떠남: 위치를 받을 때마다 센다(offTrack 처럼). 탄 열차가 다음 역에 닿았는데 내 위치가 탄 역에 연달아 3번이면
  // 그 열차를 놓친 것으로 보고 같은 구간의 기다리기로 되돌린다(승강장은 이미 닿았으니 걷기 0 · 놓친 열차는 빼고 다음 열차 — 2026-11-10 사용자 「안 탔는데 탄 걸로」)
  function leftWithoutMe(spot:LngLat) {
    const current = step();
    if (!ride || current?.kind !== 'ride') return;
    const leg = legAt(current.leg);
    if (leg?.type !== 'ride') return;
    const plan = planOf(ride.train), {stationM, exitM} = boardingAway(spot, leg);
    ride.stayed = stayedFixes(ride.stayed, plan ? trackOf(plan) : null, leg.stations[1], nearBoarding({goalM: Infinity, stationM, exitM}));
    if (!leftBehind(ride.stayed)) return;
    const trainNo = ride.train!.slice(leg.line.length + 1);
    ride.at--; ride.turn++;
    Object.assign(ride, {stayed: 0, backed: true, hold: null, nearSince: 0, zeroSince: 0, picked: null, pickedSaw: false, due: null, train: null, missed: new Set([trainNo]), waitFrom: {s: 0, at: Date.now()}});
    loadArrivals(current.leg);
    cam = null;
    if (following) map.easeTo({center: [...spot], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 600});
    draw();
  }

  // ---- 기다리기 → 탔다(2026-11-11 사용자 선택 B): 고른 열차가 들어와 탈 수 있게 되면 바로 넘기지 않고 붙든다(hold — 기다리기 화면 그대로).
  // 출구 ~ 승강장 통로가 길면 승강장 90초가 지나도 아직 통로라, 열차가 떠난 뒤 내 위치가 그 열차를 따라가거나 끊겨야(지하) 탄 것으로 본다.
  // 붙들 수 없으면(곧 올 열차 줄에서 고른 열차가 아님 — 방향 모르는 구간 · 지도에 없는 열차 · 탈 역 좌표 없음) 지금처럼 바로 넘긴다
  function boardOrHold(leg:RideTrainLeg, nowMs:number) {
    if (!ride) return;
    const plan = ride.picked && ride.picked === ride.train ? planOf(ride.train) : null;
    if (!plan || !byId.get(leg.stations[0]!)) { advance(); return; }
    ride.hold = {id: plan.id, trainNo: plan.id.slice(leg.line.length + 1), sinceMs: nowMs, leftMs: 0, moved: 0};
    holdTick(leg, nowMs);
  }
  // 붙든 열차가 탈 역을 떠났나(본 때를 남긴다) — 지도에서 사라졌으면 null
  function heldTrack(leg:RideTrainLeg, nowMs:number) {
    const hold = ride?.hold, plan = hold ? planOf(hold.id) : null;
    if (!hold || !plan) return null;
    const track = trackOf(plan);
    if (!hold.leftMs && leftStation(track, leg.stations[0]!)) hold.leftMs = nowMs;
    return {hold, plan, track};
  }
  // 위치를 받을 때마다(offTrack 처럼 — 1초 tick 은 같은 위치를 여러 번 보니 세지 않는다): 떠난 뒤 탄 역을 벗어나 열차 쪽이면 센다
  function followHeld(spot:LngLat) {
    const current = step(), leg = current?.kind === 'wait' ? legAt(current.leg) : null;
    if (!ride?.hold || leg?.type !== 'ride') return;
    const held = heldTrack(leg, Date.now()), {stationM, exitM} = boardingAway(spot, leg);
    if (!held?.hold.leftMs || stationM === null) return;
    const train = trainLngLat(held.plan as never);
    held.hold.moved = withTrainFixes(held.hold.moved, {stationM, exitM, trainM: metres(spot, [train.lng, train.lat])});
  }
  function holdTick(leg:RideTrainLeg, nowMs:number) {
    if (!ride?.hold) return;
    const held = heldTrack(leg, nowMs), nextId = leg.stations[1];
    if (!held) { advance(); return; }   // 지도에서 열차가 사라졌다 — 붙들기 전처럼 탄 것으로
    const {hold, track} = held;
    const outcome = holdOutcome({nowMs, sinceMs: hold.sinceMs, leftMs: hold.leftMs, lastFixMs: fix?.t ?? 0, moved: hold.moved,
      nextReached: nextId !== undefined && (reached(track, nextId) || leftStation(track, nextId))});
    if (outcome === 'board') { advance(); return; }
    if (outcome === 'missed') {
      // 놓침: 그 열차를 빼고 다음 열차(승강장은 이미 닿았으니 걷기 0 · 탈 시각으로 다시 넘기지 않는다 — leftWithoutMe 와 같다)
      ride.missed.add(hold.trainNo);
      Object.assign(ride, {hold: null, backed: true, picked: null, pickedSaw: false, due: null, zeroSince: 0, train: null});
    }
    draw();
  }

  // 다음 구간이 지하철이면 그 탈 역 한가운데 · 가장 가까운 출구까지(m — 모르면 null)
  function boardingAway(spot:LngLat, next:RideLeg | undefined):{ stationM:number | null; exitM:number | null } {
    const stationId = next?.type === 'ride' ? next.stations[0] : undefined, station = stationId === undefined ? null : byId.get(stationId);
    if (stationId === undefined) return {stationM: null, exitM: null};
    return {stationM: station ? metres(spot, [station.lon, station.lat]) : null, exitM: nearestM(spot, exitsOf(stationId))};
  }

  // 1초마다(그리고 위치를 받을 때마다) 지금 단계가 끝났는지 본다
  function tick() {
    yieldToOther();
    const current = step();
    if (!ride || !current || current.kind === 'done') return;
    const leg = legAt(current.leg)!, spot = freshFix(), nowMs = Date.now(), now = new Date();
    if (current.kind === 'walk') {
      const next = legAt(current.leg + 1), path = leg.type === 'walk' ? leg.path ?? [] : [];
      if (!spot || path.length < 2) {
        // 지하로 들어가 위치가 끊김: 마지막 위치가 타는 역 150m 안이거나 그 역 아무 출구 50m 안이면 기다리기로
        // (남은 길 0 · 승강장 시간만 마지막 위치를 받은 때부터 센다 — 2026-11-07 사용자 결정)
        if (fix && path.length >= 2) {
          const {stationM, exitM} = boardingAway(fix.spot, next);
          if (lostUnderground({nowMs, lastFixMs: fix.t, stationM, exitM})) { ride.leftM = 0; advance(fix.t); return; }
        }
        if (legOverByTime(ride.legs, current.leg, now, ride.arrives)) advance(); else draw();
        return;
      }
      const where = onPath(spot, path);
      ride.leftM = Math.max(0, where.total - where.at);
      ride.track.push({t: nowMs, at: where.at}); if (ride.track.length > 90) ride.track.shift();
      walked(current.leg, splitPath(path, where.at));
      // 다음 탈 곳(역 · 정류장 · 목적지) 100m 안이나 탈 역 아무 출구 50m 안에 5초 머물면 닿은 것(남은 길 0 · 승강장 시간만 그때부터 — 2026-11-07 사용자 결정)
      const goalM = metres(spot, path[path.length - 1]!), {stationM, exitM} = boardingAway(spot, next);
      if (nearBoarding({goalM, stationM, exitM})) {
        ride.nearSince ||= nowMs;
        if (nowMs - ride.nearSince >= NEAR_HOLD_MS) { ride.leftM = 0; advance(); return; }
      }
      else ride.nearSince = 0;
      draw();
      return;
    }
    if (current.kind === 'wait') {
      if (leg.type === 'bus') {
        // 지켜보는 곧 올 차가 정류장에 들어왔다: 승강장 시간(걷기)이 끝났으면 그 순간 탄 것 · 아직이면 놓침 → 그 차를 빼고 다음 차(지하철과 같은 규칙 — 2026-11-07 사용자 결정)
        const board = ride.busBoard;
        if (board) {
          // 아직 정류장에 안 들어온 차는 틱마다 다시 고른다(가장 가까운 곧 올 차): 앞 차 위치가 몇 초 끊긴 사이 뒤 차를 붙들면
          //  돌아온 앞 차가 정류장에 들어와도 못 봤다(2026-11-07 운영 472 추적). 들어온 차(true)는 탈지 놓칠지 가릴 때까지 그대로
          if (ride.car && bus.atStop(ride.car, board.stopId) !== true) ride.car = null;
          if (board.routeId) ride.car ??= bus.approach(board.routeId, board.stopId, ride.missed);
          const outcome = arriveOutcome(waitWalkS(), !!ride.car && bus.atStop(ride.car, board.stopId) === true);
          if (outcome === 'board') { advance(); return; }
          if (outcome === 'missed' && ride.car) { ride.missed.add(ride.car); ride.car = null; ride.missedAt = nowMs; draw(); return; }
        }
        // 차를 못 봤어도 탔다: 내 위치가 버스 길을 따라 타는 곳에서 100m 넘게 나아갔다(위치 없으면 출발 시각)
        const where = spot ? busAlong(spot, leg.path) : null;
        if (where ? where.off <= OFF_M && where.at > NEAR_M : passedTime(leg.departs, now, 1)) { advance(); return; }
        draw();
        return;
      }
      if (leg.type !== 'ride') return;
      if (ride.hold) { holdTick(leg, nowMs); return; }
      const list = arrivalSecs(), walkS = waitWalkS(), fromId = leg.stations[0]!;
      // 새 목록으로 짐작을 바꾸기 전에: 먼저 고른 열차가 이 역을 떠났나 · 올 때가 지나 새 목록에서 사라졌나(곧 도착 0초를 피드가 건너뛰어도 탄 것으로)
      const pickedPlan = ride.picked === ride.train ? planOf(ride.picked) : null;
      const pickedTrack = pickedPlan ? trackOf(pickedPlan) : null;
      if (pickedTrack?.seqIds.includes(fromId)) ride.pickedSaw = true;
      const trainLeft = pickedTrack ? pickedLeft(pickedTrack, fromId, ride.pickedSaw) : null;
      // 고른 열차가 곧 올 열차 줄에서 몇 초 남았나(줄이 끊겼거나 빠졌으면 모름)
      const listFresh = nowMs - ride.arrivalsAt < ARRIVALS_STALE_MS;
      const pickedDueS = listFresh && ride.due ? list?.find(item => item.row.trainNo === ride!.due!.trainNo)?.s ?? null : null;
      const trainGone = !!ride.due && !!list && ride.due.atMs <= ride.arrivalsAt + ARRIVALS_MS && !list.some(item => item.row.trainNo === ride!.due!.trainNo);
      // 짐작을 새 줄로 바꾸기 전에 — 고른 열차가 들어왔다(또는 올 때가 지나 줄에서 사라졌다): 승강장 시간이 끝났으면 그 순간 탄 것 · 아직이면 놓침 → 그 열차를 빼고 다음 열차로(2026-11-07 사용자 결정)
      const outcome = arriveOutcome(walkS, pickedIn(leg) || trainGone);
      if (outcome === 'board') { boardOrHold(leg, nowMs); return; }
      if (outcome === 'missed' && ride.due) {
        ride.missed.add(ride.due.trainNo);
        ride.picked = null; ride.pickedSaw = false; ride.due = null; ride.zeroSince = 0; ride.train = null;
        draw();
        return;
      }
      // 승강장에 닿기 전에 들어와 있는 다른 열차도 놓친 것(③) — 다음 차례부터 줄에서 빠진다
      for (const trainNo of arrivedEarly((list ?? []).map(item => item.row), walkS, leg.from)) ride.missed.add(trainNo);
      // 걸어서 탈 수 있는 첫 열차가 탈 열차(짐작) — 그 열차가 역에 닿으면(곧 도착 0초) 그 열차로 굳힌다
      if (!ride.zeroSince && !trainGone) {
        const first = list?.find(item => item.s >= walkS * HURRY_SHARE);
        if (first?.row.trainNo) { const id = `${leg.line}:${first.row.trainNo}`; if (id !== ride.picked) ride.pickedSaw = false; ride.train = ride.picked = id; ride.due = {trainNo: first.row.trainNo, atMs: nowMs + first.s * 1000}; }
        if (first && first.s <= 0) ride.zeroSince = nowMs;
      }
      const zeroPlan = ride.zeroSince ? planOf(ride.train) : null;
      // 곧 올 열차를 모르면(못 받음 · 방향 모름 · 비었음 · 갱신이 끊김) 탈 시각 1분 뒤 — 단 승강장 걷기가 끝난 뒤에만. 탈 시각이 지나 닿은 갈아타기는
      // 곧 올 열차를 받기도 전(목록 0)에 바로 탄 것으로 넘어갔다(2026-11-08 운영 10케이스 #3 고속터미널 9호선 — 기다리기 2초)
      if (boardNow({nowMs, zeroSinceMs: ride.zeroSince, trainLeft: trainLeft ?? (zeroPlan ? leftStation(trackOf(zeroPlan), fromId) : null), pickedDueS, trainGone,
        listLength: list?.length ?? 0, listFresh, departsPassed: walkS <= 0 && !ride.backed && passedTime(leg.departs, now, 1)})) { boardOrHold(leg, nowMs); return; }
      draw();
      return;
    }
    // 타는 중
    if (leg.type === 'ride') {
      const plan = planOf(ride.train);
      const late = new Date(nowMs - BOARD_GIVE_UP_MS);   // 먼 내릴 역이 예측에 아직 안 보일 때는 도착 시각 + 3분까지 열차를 따른다
      if (rideOver(plan ? trackOf(plan) : null, leg.stations, legOverByTime(ride.legs, current.leg, now, ride.arrives), legOverByTime(ride.legs, current.leg, late, ride.arrives))) { advance(); return; }
    } else if (leg.type === 'bus') {
      bus.ride(ride.ridden, spot, true);
      const goal = leg.path[leg.path.length - 1];
      if (spot && goal && metres(spot, goal) <= NEAR_M) { ride.nearSince ||= nowMs; if (nowMs - ride.nearSince >= NEAR_HOLD_MS) { advance(); return; } }
      else if (!spot && legOverByTime(ride.legs, current.leg, now, ride.arrives)) { advance(); return; }
      else ride.nearSince = 0;
    }
    draw();
  }
  // 버스 구간 길 위 내 자리: 지난 자리부터 앞으로만 찾고(onPathFrom) 길 위로 맞춘 자리를 지난 자리로 둔다
  function busAlong(spot:LngLat, path:readonly LngLat[]) {
    const where = onPathFrom(spot, path, ride!.busAt);
    if (where.off <= OFF_M) ride!.busAt = where.at;
    return where;
  }
  const passedTime = (time:string, now:Date, extraMin = 0) => { const [hours = 0, minutes = 0] = time.split(':').map(Number); return ((now.getHours() * 60 + now.getMinutes() - hours * 60 - minutes - extraMin + 1440) % 1440) < 720; };

  // ---- 카드
  function view():RideCardView | null {
    const current = step();
    if (!ride || !current) return null;
    const character = characterOf(look()), base = {image: character.file, flip: character.flip, following, detour: false, say: null, goal: {at: endSpot()}};
    if (current.kind === 'done') { const now = new Date(); return {...base, following: true, title: '슝 도착!', sub: doneSub(ride.toName, now, ride.startedMs), arrival: {...doneParts(ride.toName, now, ride.startedMs), at: endSpot()}}; }
    const leg = legAt(current.leg)!;
    if (current.kind === 'walk') {
      const pace = measuredPace(ride.track) ?? legPace(ride.legs, current.leg);
      return {...base, detour: ride.detour, title: walkTitle(ride.legs, current.leg, ride.toName), sub: walkSub(ride.legs, current.leg, ride.leftM, walkLeftS(ride.legs, current.leg, ride.leftM, pace))};
    }
    const transit = leg as RideTrainLeg | RideBusLeg;
    if (current.kind === 'wait') {
      // 버스는 말풍선 없이(말풍선 글이 열차 · 승강장 이야기다 — 도착 시간을 넣기 전처럼)
      if (transit.type === 'bus') return {...base, title: waitTitle(transit), sub: waitText(ride.legs, current.leg, waitWalkS(), busEtaSecs(Date.now()), ride.turn, false, !!ride.missedAt).sub};
      const list = ride.arrivalsFor === current.leg ? arrivalSecs()?.map(item => item.s) ?? null : null;
      const arrived = !!list && pickedIn(transit);
      return {...base, title: waitTitle(transit), ...waitText(ride.legs, current.leg, waitWalkS(), list, ride.turn, arrived, missedShown())};
    }
    let left:number, where:RideWhere | null = null;
    if (transit.type === 'ride') {
      const plan = planOf(ride.train), track = plan ? trackOf(plan) : null, stops = track ? rideStops(track, transit.stations) : null;
      // 내릴 역이 예측에 없으면(먼 역) 지금 역의 구간 차례로 — stations 는 사이 역까지 모두(server journey_graph)
      const byStops = stops ? transit.stations.length - 1 - transit.stations.indexOf(stops.now) : null;
      left = (track && stopsLeft(track, transit.stations)) ?? byStops ?? stopsLeftByTime(transit, new Date());
      const name = (id:number | null) => id == null ? null : byId.get(id)?.name ?? null, now = name(stops?.now ?? null);
      if (now) where = {now, next: name(stops?.next ?? null)};
    } else {
      const spot = freshFix(), along = spot ? busAlong(spot, transit.path) : null;
      left = along && along.total ? Math.max(1, Math.ceil(transit.stops * (1 - along.at / along.total))) : stopsLeftByTime(transit, new Date());
      const at = spot ? busStopAt(transit, spot, along && along.total ? along.at / along.total : null) : null;
      if (at) where = {now: at.now ?? transit.from, next: at.next};   // 아직 아무 정류장도 못 지났으면 탄 정류장
    }
    return {...base, title: rideTitle(transit), sub: rideSub(ride.legs, current.leg, left, where)};
  }
  // tick 이 고른 열차(고를 때 걸어서 탈 수 있던 첫 열차)가 이 역에 들어왔나. 지도에서 다른 열차로 바로잡았으면(picked ≠ train) 보지 않는다
  function pickedIn(leg:RideTrainLeg):boolean {
    const due = ride?.due;
    if (!ride || !due || ride.picked !== ride.train) return false;
    // 그 열차 줄 자체로 본다(곧 도착 0초가 되면 「걸어서 탈 수 있는 첫 열차」에서 빠지니 첫 열차로 보면 들어온 것을 못 본다 — 2026-11-07 화면 추적)
    const row = arrivalSecs()?.find(item => item.row.trainNo === due.trainNo);
    const plan = planOf(ride.picked), listFresh = Date.now() - ride.arrivalsAt < ARRIVALS_STALE_MS;
    return pickedArrived({zeroSinceMs: ride.zeroSince, pickedDueS: listFresh && row ? row.s : null, track: plan ? trackOf(plan) : null, stationId: leg.stations[0]!});
  }
  const actions:RideCardActionsLike = {
    close: () => { const arrived = step()?.kind === 'done'; stop(); ended(arrived); },
    detour: () => { stop(); detour(); },
    follow: () => {
      otherFollow.stop(); following = true; cam = null; camKey = ''; draw();   // camKey 도 비운다 — 그 사이 다른 따라가기가 카메라를 옮겼을 수 있다
      const current = step(), spot = freshFix();
      if (current?.kind === 'ride' && legAt(current.leg)?.type === 'ride') { const plan = planOf(ride!.train); if (plan) { const at = trainLngLat(plan as never); map.easeTo({center: [at.lng, at.lat], zoom: Math.max(map.getZoom(), RIDE_ZOOM), padding: pad(), duration: 600}); } }
      else if (spot) map.easeTo({center: [...spot], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 600});
    },
  };
  let painted = '';
  function draw() {
    const next = view(), key = JSON.stringify(next);
    if (key === painted) return;
    painted = key;
    drawRideCard(host, next, actions);
    document.body.classList.toggle('riding-along', !!next);
  }

  // ride 의 경로 칸을 이 경로 처음으로(「이 길로 출발」 — 출발 시각 · 목적지 이름 · 따라가기는 그대로)
  function begin(plan:RidePlan) {
    if (!ride) return;
    const legs = plan.legs as RideLeg[];
    Object.assign(ride, {legs, arrives: plan.arrives, steps: rideSteps(legs), at: 0, nearSince: 0, offFixes: 0, detour: false, track: [],
      train: null, zeroSince: 0, arrivals: null, arrivalsFor: -1, picked: null, pickedSaw: false, due: null, arrivalsAt: 0, missed: new Set(), stayed: 0, backed: false, hold: null, busBoard: null, etas: null, etasAt: 0, car: null, missedAt: 0, ridden: null, busAt: 0, waitFrom: {s: 0, at: Date.now()}, leftM: (legs[0] as { metres?:number })?.metres ?? 0});
    const first = step()!;
    if (first.kind === 'wait') startWait(first.leg);
    if (first.kind === 'wait' && legs[first.leg]?.type === 'ride') { ride.train = guessTrain(first.leg); loadArrivals(first.leg); }
    if (first.kind === 'wait' && legs[first.leg]?.type === 'bus') startBusWait(first.leg);
  }
  // 「이 길로 출발」
  function start(plan:RidePlan, toName:string) {
    stop();
    ride = {legs: [], arrives: plan.arrives, toName, steps: [], at: 0, startedMs: Date.now(), turn: 0, nearSince: 0, offFixes: 0, rerouting: false, reroutedAt: 0, detour: false, track: [],
      train: null, zeroSince: 0, arrivals: null, arrivalsFor: -1, picked: null, pickedSaw: false, due: null, arrivalsAt: 0, missed: new Set(), stayed: 0, backed: false, hold: null, busBoard: null, etas: null, etasAt: 0, car: null, missedAt: 0, ridden: null, busAt: 0, waitFrom: {s: 0, at: Date.now()}, leftM: 0};
    begin(plan);
    bus.routeOnly?.(true);
    const legs = ride.legs;
    following = true; cam = null;
    locate();
    draw();
    timer = setInterval(tick, TICK_MS);
    arrivalsTimer = setInterval(() => { const current = step(); if (current?.kind === 'wait') loadArrivals(current.leg); }, ARRIVALS_MS);
    busTimer = setInterval(() => { const current = step(); if (current?.kind === 'wait' && !document.hidden) loadBusArrivals(current.leg); }, BUS_ARRIVALS_MS);
    // 내 위치로(아직 없으면 걷는 길 처음으로 — 위치가 오면 내 위치로)
    const walkPath = legs[0]?.type === 'walk' ? legs[0].path : null, spot = freshFix() ?? walkPath?.[0];
    if (spot) map.easeTo({center: [...spot], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 700});
  }
  function stop() {
    if (!ride) return;
    clearInterval(timer); clearInterval(arrivalsTimer); clearInterval(busTimer); timer = arrivalsTimer = busTimer = 0;
    ride = null; painted = '';
    bus.ride(null, null, false); bus.watch(null); bus.routeOnly?.(false);
    walked(-1, null);
    unlocate();
    drawRideCard(host, null, actions);
    document.body.classList.remove('riding-along');
  }
  // 지도에서 열차를 누름: 타고 가는 지하철 구간과 같은 노선이면 그 열차로 바로잡는다(시트는 열지 않는다). true 면 처리함
  function tapTrain(plan:{ id:string }):boolean {
    const current = step();
    if (!ride || !current || current.kind === 'walk' || current.kind === 'done') return false;
    const leg = legAt(current.leg);
    if (leg?.type !== 'ride' || !plan.id.startsWith(`${leg.line}:`)) return false;
    ride.train = plan.id;
    if (current.kind === 'wait') advance(); else { cam = null; draw(); }
    return true;
  }
  // 타고 가는(짐작 · 바로잡은) 열차: 길찾기가 고른 열차와 달라도 지도에 늘 보이게(journey trainShown 은 경로 구간을 지날 열차만 남긴다)
  const rideTrain = (plan:{ id:string }):boolean => !!ride && ride.train === plan.id;
  // 타고 가는 지하철 구간의 역 번호(지도에서 흐리게 하지 않는다) — 경로가 바뀔 때만 다시 모은다
  let lit:{ legs:RideLeg[] | null; ids:ReadonlySet<string> } = {legs: null, ids: new Set()};
  const stationIds = ():ReadonlySet<string> => {
    const legs = ride?.legs ?? null;
    if (lit.legs !== legs) lit = {legs, ids: new Set((legs ?? []).flatMap(leg => leg.type === 'ride' ? leg.stations.map(String) : []))};
    return lit.ids;
  };
  return {start, stop, tapTrain, rideTrain, get active() { return !!ride; }, get followingTrain() { return followingTrain(); }, get stationIds() { return stationIds(); }};
}
