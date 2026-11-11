// 개발자 회원의 타고 가기 기록(2026-11-11 계획서 D2 · D3): 「이 길로 출발」 ~ 도착 · ✕ 동안 GPS · 가속도 센서 · 타고 가기 판정을
// 기기(localStorage)에 먼저 쌓고 15초마다 POST /api/me/rides 로 보낸다 — 지하 · 터널에서 끊겨도 잃지 않게(관리 화면 디버깅과 같은 방식).
// 사건 모양은 서버 services/debug.py clean_event(디버깅 기록과 같은 칸 + judge{state} · answer{answer}) — 서버가 source "map" 을 붙인다.
// 이 파일은 /api/me 가 developer:true 일 때만 user/account.mts 가 만든다 — 개발자가 아니거나 로그인 안 했으면 이 파일은 받지도 않고
// 센서 권한도 묻지 않고 요청도 없다. 브라우저 것(저장소 · fetch · 시계 · 센서)은 넘겨받아 Node 시험이 그대로 돌린다.

export type RideLogMode = 'subway' | 'bus';
export type RideAnswer = 'rode' | 'not_rode';
// 사건마다 붙일 수 있는 탈 것 칸(서버 TEXT 칸 가운데 지도가 아는 것)
export interface RideLogInfo { mode:RideLogMode; line?:string | null; train?:string | null; routeId?:string | null; routeName?:string | null; vehicle?:string | null; station?:string | null }
export interface RideLogEvent extends Record<string, unknown> { kind:string; mode:RideLogMode; ride:string; t:number }
export interface RideLog {
  // 「이 길로 출발」 누름 안에서 부른다(아이폰은 누르는 순간에만 센서 권한을 물을 수 있다)
  begin(info:RideLogInfo):void;
  gps(coords:{ latitude:number; longitude:number; accuracy:number; speed?:number | null; heading?:number | null }):void;
  judge(state:string, info:RideLogInfo):void;   // 같은 state 를 연달아 받으면 한 번만 남긴다
  answer(value:RideAnswer, info:RideLogInfo):void;
  end(note:string, info:RideLogInfo):void;   // 도착 · 그만둠 — 센서를 끄고 남은 것을 바로 보낸다
  flush():Promise<void>;   // 쌓인 것을 지금 보낸다(다시 연결 · 화면을 숨길 때)
  close():void;   // 로그아웃 · 개발자 아님: 센서 · 보내기를 멈춘다(쌓인 것은 기기에 둔다 — 다시 개발자로 로그인하면 보낸다)
  readonly recording:boolean;
  readonly answered:RideAnswer | null;   // 이번 탑승에서 마지막으로 누른 정답(카드에 눌림 표시)
}

export const RIDE_LOG_KEY = 'syung-dev-ride-log';   // 기기에 쌓아 둔 사건 줄
export const FLUSH_MS = 15000, MOTION_MS = 5000, GPS_GAP_MS = 4500, GPS_KEEP_MS = 15000;
export const MAX_QUEUE = 4000;   // 기기에 둘 사건 수 상한(넘으면 오래된 것부터 — 센서 묶음 약 3 KB × 4000 은 저장소 한도를 넘으니 저장 실패면 메모리에만)
const RIDE_URL = './api/me/rides';
const CHANGE = {'X-Requested-With': 'syung', 'Content-Type': 'application/json'};   // 서버가 바꾸는 요청에서 확인하는 머리말

// ---- 보내기 줄: 한 번에 500개 · 센서 묶음은 40개까지 — 본문 1 MB 상한 안에(관리 화면 debug_data.mts batchSize 와 같은 값)
export function batchSize(queue:readonly { kind:string }[]):number {
  let size = 0, moves = 0;
  for (const event of queue) { if (size >= 500 || (event.kind === 'motion' && ++moves > 40)) break; size++; }
  return size;
}
// 보낸 결과 → 보낸 묶음을 줄에서 뺄까. 200 · 400(고칠 수 없는 묶음) · 413(너무 큼)은 빼고, 503 · 끊김은 다음에 다시(401 · 403 은 아래에서 멈춘다)
export const dropAfter = (status:number):boolean => (status >= 200 && status < 300) || status === 400 || status === 413;

// ---- 가속도 센서: 0.1초 칸 평균 → [칸 시각, 값 9개(없으면 null)] · 5초마다 한 사건에 140칸까지(서버 상한 1500개 = 150칸)
export interface MotionCell { slot:number; sum:number[]; n:number[] }
export const closeCell = (cell:MotionCell):(number | null)[] =>
  [cell.slot, ...cell.sum.map((total, index) => cell.n[index] ? Math.round(total / cell.n[index]! * 100) / 100 : null)];
export function motionChunks(bins:readonly (number | null)[][], base:number):(number | null)[][] {
  const chunks:(number | null)[][] = [];
  for (let index = 0; index < bins.length; index += 140) chunks.push(bins.slice(index, index + 140).flatMap(([slot, ...values]) => [(slot as number) - base, ...values]));
  return chunks;
}
// devicemotion 한 번 → 값 9개(중력 포함 가속 x y z, 중력 뺀 가속 x y z, 회전 α β γ)
interface Triple { x?:number | null; y?:number | null; z?:number | null }
interface Turn { alpha?:number | null; beta?:number | null; gamma?:number | null }
export interface MotionLike { accelerationIncludingGravity?:Triple | null; acceleration?:Triple | null; rotationRate?:Turn | null }
export function motionValues(event:MotionLike):(number | null | undefined)[] {
  const gravity = event.accelerationIncludingGravity ?? {}, linear = event.acceleration ?? {}, turn = event.rotationRate ?? {};
  return [gravity.x, gravity.y, gravity.z, linear.x, linear.y, linear.z, turn.alpha, turn.beta, turn.gamma];
}

// 탈 것 칸 → 사건 칸(빈 값은 싣지 않는다)
function infoFields(info:RideLogInfo):Record<string, string> {
  const fields:Record<string, string> = {};
  for (const key of ['line', 'train', 'routeId', 'routeName', 'vehicle', 'station'] as const) { const value = info[key]; if (value) fields[key] = value; }
  return fields;
}

export interface RideLogDeps {
  storage:{ getItem(key:string):string | null; setItem(key:string, value:string):void } | null;
  send(url:string, init:{ method:'POST'; credentials:'same-origin'; headers:Record<string, string>; body:string }):Promise<{ status:number }>;
  now():number;
  every(run:() => void, ms:number):() => void;   // 되풀이 걸기 → 끄기
  online():boolean;
  // 센서: 권한 묻기(아이폰만 함수가 있다 — 없으면 null) · 듣기 걸기 → 끄기. 센서가 없는 기기는 listen 이 null
  askMotion:(() => Promise<string>) | null;
  listenMotion:((on:(event:MotionLike) => void) => () => void) | null;
  forbidden?():void;   // 401(로그인 끝남) · 403(이제 개발자 아님) — 기록을 그만둔다
}

export function createRideLog(deps:RideLogDeps):RideLog {
  const load = ():RideLogEvent[] => { try { const raw = deps.storage?.getItem(RIDE_LOG_KEY); const list:unknown = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list as RideLogEvent[] : []; } catch { return []; } };
  let queue = load(), sending = false, stopped = false;
  const save = () => { try { deps.storage?.setItem(RIDE_LOG_KEY, JSON.stringify(queue)); } catch { /* 저장소가 차거나 막힘: 메모리에만 두고 보낸다 */ } };
  let ride:string | null = null, lastState = '', answered:RideAnswer | null = null, gpsAt = 0;
  let lastFix:{ t:number; lat:number; lng:number; acc:number } | null = null;
  const motion:{ bins:(number | null)[][]; cur:MotionCell | null; off:(() => void) | null; turn:number } = {bins: [], cur: null, off: null, turn: 0};
  let flushOff:(() => void) | null = null, motionOff:(() => void) | null = null;

  function push(kind:string, info:RideLogInfo, extra:Record<string, unknown> = {}) {
    if (!ride || stopped) return;
    const t = deps.now(), event:RideLogEvent = {kind, mode: info.mode, ride, t, ...infoFields(info), ...extra};
    // 센서 · 판정 · 정답에도 15초 안의 마지막 위치를 붙인다(디버깅 기록과 같게 — 지하에서 위치가 끊긴 때를 알 수 있게)
    if (kind !== 'gps' && lastFix && t - lastFix.t < GPS_KEEP_MS) Object.assign(event, {lat: lastFix.lat, lng: lastFix.lng, acc: lastFix.acc});
    queue.push(event);
    if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
    save();
  }
  async function flush() {
    if (sending || stopped || !queue.length || !deps.online()) return;
    sending = true;
    const batch = queue.slice(0, batchSize(queue));
    try {
      const reply = await deps.send(RIDE_URL, {method: 'POST', credentials: 'same-origin', headers: CHANGE, body: JSON.stringify({events: batch})});
      if (reply.status === 401) { quit(); deps.forbidden?.(); return; }   // 로그인이 끝났다 — 더 보내지 않는다(쌓인 것은 다음 로그인 때)
      if (reply.status === 403) { quit(); queue = []; save(); deps.forbidden?.(); return; }   // 이제 개발자가 아니다 — 받아 줄 곳이 없으니 기기 기록도 지운다
      if (dropAfter(reply.status)) { queue = queue.slice(batch.length); save(); }
    } catch { /* 끊김: 다음 차례에 다시 */ } finally { sending = false; }
    if (!ride && !queue.length) { flushOff?.(); flushOff = null; }   // 다 보냈고 타고 가기도 끝났다 — 다음 출발까지 쉰다
  }
  const flushing = () => { flushOff ??= deps.every(() => { void flush(); }, FLUSH_MS); };

  // ---- 센서
  let infoNow:RideLogInfo = {mode: 'subway'};
  function closeBin() { if (motion.cur) motion.bins.push(closeCell(motion.cur)); motion.cur = null; }
  function sendMotion(all = false) {
    if (all) closeBin();
    if (!ride || !motion.bins.length) return;
    for (const chunk of motionChunks(motion.bins, deps.now())) push('motion', infoNow, {m: chunk});
    motion.bins = [];
  }
  function onMotion(event:MotionLike) {
    const slot = Math.floor(deps.now() / 100) * 100, values = motionValues(event);
    if (!motion.cur || motion.cur.slot !== slot) { closeBin(); motion.cur = {slot, sum: values.map(() => 0), n: values.map(() => 0)}; }
    const cell = motion.cur;
    values.forEach((value, index) => { if (typeof value === 'number' && Number.isFinite(value)) { cell.sum[index]! += value; cell.n[index]!++; } });
  }
  function startMotion() {
    const listen = deps.listenMotion;
    if (!listen) return;
    const turn = ++motion.turn;
    const on = () => {
      if (turn !== motion.turn || !ride) return;   // 그사이 끝냈다
      motion.off = listen(onMotion);
      motionOff = deps.every(() => sendMotion(), MOTION_MS);
    };
    if (!deps.askMotion) { on(); return; }
    // 아이폰: 누름 안에서 바로 물어야 한다 — 이 함수는 「이 길로 출발」 누름에서 기다림 없이 불린다
    deps.askMotion().then(answer => { if (answer === 'granted') on(); }, () => { /* 거절 · 누름 밖: 센서 없이 GPS · 판정만 */ });
  }
  function stopMotion() {
    motion.turn++;
    if (motion.off) { motion.off(); motion.off = null; sendMotion(true); }
    motionOff?.(); motionOff = null;
    motion.bins = []; motion.cur = null;
  }
  function quit() {
    stopMotion();
    flushOff?.(); flushOff = null;
    ride = null; stopped = true;
  }

  if (queue.length) flushing();   // 지난번에 못 보낸 것

  const log:RideLog = {
    begin(info) {
      if (stopped) return;
      if (ride) log.end('다시 출발', infoNow);
      ride = `map-${deps.now()}`; lastState = ''; answered = null; gpsAt = 0; infoNow = info;
      startMotion();   // 맨 먼저(누름 안에서 권한 묻기)
      push('start', info);
      flushing();
    },
    gps(coords) {
      if (!ride) return;
      const t = deps.now();
      lastFix = {t, lat: coords.latitude, lng: coords.longitude, acc: coords.accuracy};
      if (t - gpsAt < GPS_GAP_MS) return;   // 5초에 한 점
      gpsAt = t;
      push('gps', infoNow, {lat: coords.latitude, lng: coords.longitude, acc: coords.accuracy,
        ...(typeof coords.speed === 'number' && Number.isFinite(coords.speed) ? {speed: coords.speed} : {}),
        ...(typeof coords.heading === 'number' && Number.isFinite(coords.heading) ? {heading: coords.heading} : {})});
    },
    judge(state, info) {
      infoNow = info;
      if (!ride || state === lastState) return;
      lastState = state;
      push('judge', info, {state});
    },
    answer(value, info) {
      if (!ride) return;
      answered = value;
      push('answer', info, {answer: value});
      void flush();   // 누른 것은 바로 보낸다(못 보내면 다음 차례에)
    },
    end(note, info) {
      if (!ride) return;
      stopMotion();
      push('end', info, {note});
      ride = null; lastFix = null;
      void flush();
    },
    flush,
    close: quit,
    get recording() { return !!ride; },
    get answered() { return answered; },
  };
  return log;
}

// 브라우저에 붙인 기록기(account.mts 가 개발자일 때만 부른다). forbidden: 401 · 403 이면 본체에서 떼어 낸다
type AskingMotion = typeof DeviceMotionEvent & { requestPermission?:() => Promise<string> };
export function browserRideLog(forbidden?:() => void):RideLog {
  let storage:RideLogDeps['storage'] = null;
  try { storage = localStorage; } catch { /* 막힌 저장소: 메모리에만 */ }
  const hasMotion = typeof DeviceMotionEvent !== 'undefined', ask = hasMotion ? (DeviceMotionEvent as AskingMotion).requestPermission : undefined;
  const log = createRideLog({
    storage,
    send: (url, init) => fetch(url, init),
    now: () => Date.now(),
    every: (run, ms) => { const timer = setInterval(run, ms); return () => clearInterval(timer); },
    online: () => navigator.onLine !== false,
    askMotion: typeof ask === 'function' ? () => ask.call(DeviceMotionEvent) : null,
    listenMotion: hasMotion ? on => { const listener = (event:DeviceMotionEvent) => on(event); addEventListener('devicemotion', listener); return () => removeEventListener('devicemotion', listener); } : null,
    forbidden,
  });
  addEventListener('online', () => { void log.flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void log.flush(); });
  return log;
}
