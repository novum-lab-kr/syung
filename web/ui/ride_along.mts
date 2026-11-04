// 타고 가기(「이 길로 출발」 뒤): 카드 한 장이 경로 순서대로 걷기 → 기다리기 → 타기 → … → 「슝 도착!」.
// 셈 · 글은 lib/ride-along.mts, 카드 그리기는 components/ride_card.tsx(본체가 drawRideCard 로 넘긴다).
// 위치는 출발한 동안만 휴대폰 안에서 비교하고 서버로 보내지 않는다(내 위치 단추가 꺼져 있었으면 켰다가 끝날 때 끈다).
// 땅 위: 내 위치로 진행 · 지하철: 탄 열차(짐작 — 지도에서 같은 노선 열차를 누르면 그 열차로 바로잡기)의 실시간 위치로 · 위치도 열차도 없으면 시각으로.
// 버스: 차량 번호가 없고 위치 자료가 30초쯤 늦어(계획서 2절 · Progress ②) 내 위치와 남은 정거장으로만(안 B)
import { serverUrl } from '../lib/server_url.mts';
import {
  BAD_FIX_M, BOARD_GIVE_UP_MS, HURRY_SHARE, NEAR_HOLD_MS, NEAR_M, OFF_HOLD_MS, OFF_M, STATION_ACCESS_S,
  arrivalFits, boardNow, characterOf, doneSub, leftStation, legOverByTime, legPace, measuredPace, metres, onPath, pickedLeft, rideOver, rideSteps, rideSub, rideTitle, splitPath, stopsLeft, stopsLeftByTime,
  transferS, waitText, waitTitle, walkLeftS, walkSub, walkTitle,
  type LngLat, type RideBusLeg, type RideCardView, type RideLeg, type RideStep, type RideTrainLeg,
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
  ended:() => void; detour:() => void;
  // 시트의 다른 따라가기(열차 · 버스 — ui/sheet.mts following · followBus): 켜져 있으면 타고 가기 카메라가 비키고, 「다시 따라가기」는 그쪽을 끈다
  otherFollow:{ active():boolean; stop():void };
}
export interface RidePlan { arrives:string; legs:readonly unknown[] }

// ARRIVALS_STALE: 곧 올 열차 목록을 이만큼 못 새로 받으면 없는 것처럼(탈 시각으로)
const TICK_MS = 1000, ARRIVALS_MS = 20000, ARRIVALS_STALE_MS = ARRIVALS_MS * 3, FIX_FRESH_MS = 30000;
const FOLLOW_ZOOM = 16, RIDE_ZOOM = 15, FOLLOW_EASE = 0.25;

export function createRideAlong({map, geolocate, planner, trainPose, trainLngLat, arrivalRank, byId, animFrame, drawRideCard, look, walked, ended, detour, otherFollow}:RideAlongDeps) {
  const host = document.createElement('div');
  host.className = 'rg-host';
  document.body.append(host);

  type Ride = {
    legs:RideLeg[]; arrives:string; toName:string; steps:RideStep[]; at:number; startedMs:number; turn:number;
    nearSince:number; offSince:number; detour:boolean; track:{ t:number; at:number }[];
    train:string | null; zeroSince:number; arrivals:RideArrival[] | null; arrivalsFor:number; leftM:number; waitFrom:{ s:number; at:number };
    // picked: 곧 올 목록에서 걸어서 탈 수 있어 고른 열차 · due: 그 열차가 올 때(ms) · arrivalsAt: 목록을 마지막으로 받은 때
    picked:string | null; pickedSaw:boolean; due:{ trainNo:string; atMs:number } | null; arrivalsAt:number;
  };
  let ride:Ride | null = null, timer:ReturnType<typeof setInterval> | 0 = 0, arrivalsTimer:ReturnType<typeof setInterval> | 0 = 0;
  let fix:{ spot:LngLat; t:number } | null = null, following = true, turnedOn = false, cam:{ lng:number; lat:number } | null = null, camAt = 0, camKey = '';

  const step = () => ride ? ride.steps[ride.at]! : null;
  const legAt = (index:number) => ride?.legs[index];
  const freshFix = () => fix && Date.now() - fix.t < FIX_FRESH_MS ? fix.spot : null;
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
    tick();
    const current = step();
    if (following && current && !(current.kind === 'ride' && legAt(current.leg)?.type === 'ride')) map.easeTo({center: [...fix.spot], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 600});
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
  const arrivalSecs = () => ride?.arrivals?.map(row => ({row, s: arrivalRank(row as never)})).sort((first, second) => first.s - second.s) ?? null;

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
  const startWait = (index:number) => { if (ride) ride.waitFrom = {s: walkFromS(index), at: Date.now()}; };

  // ---- 한 걸음 나아가기(구간이 끝났다)
  function advance() {
    if (!ride) return;
    const was = step();
    if (was?.kind === 'walk') walked(was.leg + 1, null);
    ride.at = Math.min(ride.steps.length - 1, ride.at + 1);
    ride.turn++; ride.nearSince = 0; ride.offSince = 0; ride.detour = false; ride.zeroSince = 0;
    ride.picked = null; ride.pickedSaw = false; ride.due = null; ride.arrivalsAt = 0;
    const now = step()!;
    if (now.kind === 'walk') { ride.track = []; ride.leftM = (legAt(now.leg) as { metres?:number })?.metres ?? 0; }
    if (now.kind === 'wait') startWait(now.leg);
    if (now.kind === 'wait' && legAt(now.leg)?.type === 'ride') { ride.arrivals = null; ride.train = guessTrain(now.leg); loadArrivals(now.leg); }
    if (now.kind === 'ride') {
      const leg = legAt(now.leg);
      if (leg?.type === 'ride') { const plan = planOf(ride.train); if (plan && following) map.easeTo({center: [trainLngLat(plan as never).lng, trainLngLat(plan as never).lat], zoom: RIDE_ZOOM, padding: pad(), duration: 700}); }
    }
    const spot = freshFix();
    if (following && spot && now.kind !== 'ride') map.easeTo({center: [...spot], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 600});
    if (now.kind === 'done') { clearInterval(timer); clearInterval(arrivalsTimer); timer = arrivalsTimer = 0; unlocate(); }
    cam = null;
    draw();
  }

  // 1초마다(그리고 위치를 받을 때마다) 지금 단계가 끝났는지 본다
  function tick() {
    yieldToOther();
    const current = step();
    if (!ride || !current || current.kind === 'done') return;
    const leg = legAt(current.leg)!, spot = freshFix(), nowMs = Date.now(), now = new Date();
    if (current.kind === 'walk') {
      const next = legAt(current.leg + 1), path = leg.type === 'walk' ? leg.path ?? [] : [];
      if (!spot || path.length < 2) { if (legOverByTime(ride.legs, current.leg, now, ride.arrives)) advance(); else draw(); return; }
      const where = onPath(spot, path);
      ride.leftM = Math.max(0, where.total - where.at);
      ride.track.push({t: nowMs, at: where.at}); if (ride.track.length > 90) ride.track.shift();
      walked(current.leg, splitPath(path, where.at));
      // 길에서 벗어남(60m 넘게 10초)
      if (where.off > OFF_M) { ride.offSince ||= nowMs; if (nowMs - ride.offSince >= OFF_HOLD_MS) ride.detour = true; }
      else { ride.offSince = 0; ride.detour = false; }
      // 다음 탈 곳(역 · 정류장 · 목적지) 100m 안에 5초 머물면
      const goal = path[path.length - 1]!, station = next?.type === 'ride' ? byId.get(next.stations[0]!) : null;
      const near = metres(spot, goal) <= NEAR_M || (station && metres(spot, [station.lon, station.lat]) <= NEAR_M);
      if (near) { ride.nearSince ||= nowMs; if (nowMs - ride.nearSince >= NEAR_HOLD_MS) { advance(); return; } }
      else ride.nearSince = 0;
      draw();
      return;
    }
    if (current.kind === 'wait') {
      if (leg.type === 'bus') {
        // 버스를 탔다: 내 위치가 버스 길을 따라 타는 곳에서 100m 넘게 나아갔다(위치 없으면 출발 시각)
        const where = spot ? onPath(spot, leg.path) : null;
        if (where ? where.off <= OFF_M && where.at > NEAR_M : passedTime(leg.departs, now, 1)) { advance(); return; }
        draw();
        return;
      }
      if (leg.type !== 'ride') return;
      const list = arrivalSecs(), walkS = waitWalkS(), fromId = leg.stations[0]!;
      // 새 목록으로 짐작을 바꾸기 전에: 먼저 고른 열차가 이 역을 떠났나 · 올 때가 지나 새 목록에서 사라졌나(곧 도착 0초를 피드가 건너뛰어도 탄 것으로)
      const pickedPlan = ride.picked === ride.train ? planOf(ride.picked) : null;
      const pickedTrack = pickedPlan ? trackOf(pickedPlan) : null;
      if (pickedTrack?.seqIds.includes(fromId)) ride.pickedSaw = true;
      const trainLeft = pickedTrack ? pickedLeft(pickedTrack, fromId, ride.pickedSaw) : null;
      const trainGone = !!ride.due && !!list && ride.due.atMs <= ride.arrivalsAt + ARRIVALS_MS && !list.some(item => item.row.trainNo === ride!.due!.trainNo);
      // 걸어서 탈 수 있는 첫 열차가 탈 열차(짐작) — 그 열차가 역에 닿으면(곧 도착 0초) 그 열차로 굳힌다
      if (!ride.zeroSince && !trainGone) {
        const first = list?.find(item => item.s >= walkS * HURRY_SHARE);
        if (first?.row.trainNo) { const id = `${leg.line}:${first.row.trainNo}`; if (id !== ride.picked) ride.pickedSaw = false; ride.train = ride.picked = id; ride.due = {trainNo: first.row.trainNo, atMs: nowMs + first.s * 1000}; }
        if (first && first.s <= 0) ride.zeroSince = nowMs;
      }
      const zeroPlan = ride.zeroSince ? planOf(ride.train) : null;
      // 곧 올 열차를 모르면(못 받음 · 방향 모름 · 비었음 · 갱신이 끊김) 탈 시각 1분 뒤
      if (boardNow({nowMs, zeroSinceMs: ride.zeroSince, trainLeft: trainLeft ?? (zeroPlan ? leftStation(trackOf(zeroPlan), fromId) : null), trainGone,
        listLength: list?.length ?? 0, listFresh: nowMs - ride.arrivalsAt < ARRIVALS_STALE_MS, departsPassed: passedTime(leg.departs, now, 1)})) { advance(); return; }
      draw();
      return;
    }
    // 타는 중
    if (leg.type === 'ride') {
      const plan = planOf(ride.train);
      const late = new Date(nowMs - BOARD_GIVE_UP_MS);   // 먼 내릴 역이 예측에 아직 안 보일 때는 도착 시각 + 3분까지 열차를 따른다
      if (rideOver(plan ? trackOf(plan) : null, leg.stations, legOverByTime(ride.legs, current.leg, now, ride.arrives), legOverByTime(ride.legs, current.leg, late, ride.arrives))) { advance(); return; }
    } else if (leg.type === 'bus') {
      const goal = leg.path[leg.path.length - 1];
      if (spot && goal && metres(spot, goal) <= NEAR_M) { ride.nearSince ||= nowMs; if (nowMs - ride.nearSince >= NEAR_HOLD_MS) { advance(); return; } }
      else if (!spot && legOverByTime(ride.legs, current.leg, now, ride.arrives)) { advance(); return; }
      else ride.nearSince = 0;
    }
    draw();
  }
  const passedTime = (time:string, now:Date, extraMin = 0) => { const [hours = 0, minutes = 0] = time.split(':').map(Number); return ((now.getHours() * 60 + now.getMinutes() - hours * 60 - minutes - extraMin + 1440) % 1440) < 720; };

  // ---- 카드
  function view():RideCardView | null {
    const current = step();
    if (!ride || !current) return null;
    const character = characterOf(look()), base = {image: character.file, flip: character.flip, following, detour: false, say: null};
    if (current.kind === 'done') return {...base, following: true, title: '슝 도착!', sub: doneSub(ride.toName, new Date(), ride.startedMs)};
    const leg = legAt(current.leg)!;
    if (current.kind === 'walk') {
      const pace = measuredPace(ride.track) ?? legPace(ride.legs, current.leg);
      return {...base, detour: ride.detour, title: walkTitle(ride.legs, current.leg, ride.toName), sub: walkSub(ride.legs, current.leg, ride.leftM, walkLeftS(ride.legs, current.leg, ride.leftM, pace))};
    }
    const transit = leg as RideTrainLeg | RideBusLeg;
    if (current.kind === 'wait') {
      const list = transit.type === 'ride' && ride.arrivalsFor === current.leg ? arrivalSecs()?.map(item => item.s) ?? null : null;
      return {...base, title: waitTitle(transit), ...waitText(ride.legs, current.leg, waitWalkS(), list, ride.turn)};
    }
    let left:number;
    if (transit.type === 'ride') { const plan = planOf(ride.train); left = (plan && stopsLeft(trackOf(plan), transit.stations)) ?? stopsLeftByTime(transit, new Date()); }
    else { const spot = freshFix(), where = spot ? onPath(spot, transit.path) : null; left = where && where.total ? Math.max(1, Math.ceil(transit.stops * (1 - where.at / where.total))) : stopsLeftByTime(transit, new Date()); }
    return {...base, title: rideTitle(transit), sub: rideSub(ride.legs, current.leg, left)};
  }
  const actions:RideCardActionsLike = {
    close: () => { stop(); ended(); },
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

  // 「이 길로 출발」
  function start(plan:RidePlan, toName:string) {
    stop();
    const legs = plan.legs as RideLeg[];
    ride = {legs, arrives: plan.arrives, toName, steps: rideSteps(legs), at: 0, startedMs: Date.now(), turn: 0, nearSince: 0, offSince: 0, detour: false, track: [],
      train: null, zeroSince: 0, arrivals: null, arrivalsFor: -1, picked: null, pickedSaw: false, due: null, arrivalsAt: 0, waitFrom: {s: 0, at: Date.now()}, leftM: (legs[0] as { metres?:number })?.metres ?? 0};
    const first = step()!;
    if (first.kind === 'wait') startWait(first.leg);
    if (first.kind === 'wait' && legs[first.leg]?.type === 'ride') { ride.train = guessTrain(first.leg); loadArrivals(first.leg); }
    following = true; cam = null;
    locate();
    draw();
    timer = setInterval(tick, TICK_MS);
    arrivalsTimer = setInterval(() => { const current = step(); if (current?.kind === 'wait') loadArrivals(current.leg); }, ARRIVALS_MS);
    // 내 위치로(아직 없으면 걷는 길 처음으로 — 위치가 오면 내 위치로)
    const walkPath = legs[0]?.type === 'walk' ? legs[0].path : null, spot = freshFix() ?? walkPath?.[0];
    if (spot) map.easeTo({center: [...spot], zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding: pad(), duration: 700});
  }
  function stop() {
    if (!ride) return;
    clearInterval(timer); clearInterval(arrivalsTimer); timer = arrivalsTimer = 0;
    ride = null; painted = '';
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
  return {start, stop, tapTrain, rideTrain, get active() { return !!ride; }, get followingTrain() { return followingTrain(); }};
}
