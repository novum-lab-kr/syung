// 관리 화면 '디버깅'(주인만, 2026-10-12 덕배): 탈 때 실제 도착 · 출발(정답)과 GPS 를 남기고, 캡처를 올린다.
// 기록은 기기(localStorage)에 먼저 쌓고 15초마다 /api/admin/debug/ride 로 보낸다 — 지하 · 터널에서 끊겨도 잃지 않게.
// 셈은 admin/debug_data.mts. 기기 쪽 상태(보낼 줄 · GPS · 센서 · 탑승 기록 · 고른 파일)는 옛 인라인 스크립트처럼 모듈 변수로 두고,
// 화면 상태는 view 하나 — set() 이 바꾸고 바로(같은 작업 안에서) <main> 과 위 탭 줄을 다시 그린다(회원 화면과 같은 틀).
// 표시(DOM 모양 · class · 문구 · aria)는 옛 HTML 과 같다 — 첫 그림은 HTML 에 그대로 있고 이 모듈이 비우고 그린다.
import { createRef, render } from 'preact';
import type { TargetedEvent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import {
  batchSize, busLabel, closeCell, compareRows, dayLabel, elapsed, fmt, lineGraph, lineStations, motionChunks, nearest, rideLine, rideTitle, ridingView, shotLine,
} from './debug_data.mts';
import type { BusRoute, MotionCell, Recent, Ride, RideEvent, RideSummary, RidingView, Station } from './debug_data.mts';

// uPlot(vendor/uplot — HTML 의 일반 script 가 window.uPlot 으로 둔다): 이 파일이 쓰는 칸만
interface UPlot {
  ctx:CanvasRenderingContext2D; bbox:{ left:number; top:number; width:number; height:number };
  valToPos(value:number, scale:string, canvasPixels?:boolean):number; setSize(size:{ width:number; height:number }):void;
}
declare global { var uPlot:(new (options:object, data:number[][], target:HTMLElement) => UPlot) | undefined }

const store = {
  get<T>(key:string, fallback:T):T { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback } catch { return fallback } },
  set(key:string, value:unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} },
};
const QUEUE = 'syung-debug-queue', RIDE = 'syung-debug-ride';

type Tab = 'ride' | 'shot' | 'list';
interface View {
  login:boolean; tab:Tab;
  lines:string[] | null; linesFailed:boolean; line:string; station:string; train:string; busno:string; vehicle:string;
  routes:BusRoute[]; pressed:number | null;   // pressed: 누른 노선 칸(새 목록이 올 때까지 남는다 — 옛 aria-pressed 그대로)
  riding:boolean; ridingText:RidingView | null; time:string; gpsText:string; motionText:string; log:string[];
  thumbs:(string | null)[]; note:string; sendDisabled:boolean; status:{ text:string; cls:string };
  recent:(Recent & { load:number }) | null;
}
let view:View = {
  login: false, tab: 'ride',
  lines: null, linesFailed: false, line: '', station: '', train: '', busno: '', vehicle: '', routes: [], pressed: null,
  riding: false, ridingText: null, time: '0:00', gpsText: '-', motionText: '-', log: [],
  thumbs: [], note: '', sendDisabled: true, status: { text: '', cls: 'status' }, recent: null,
};
const main = document.querySelector('main')!, tabs = document.querySelector('nav.tabs')!;
const filesRef = createRef<HTMLInputElement>(), dayRef = createRef<HTMLSelectElement>();
function set(patch:Partial<View>) {
  view = { ...view, ...patch };
  render(<Tabs />, tabs); render(<DebugPage />, main);
}
const showLogin = (on:boolean) => set({ login: on });
const field = (name:'station' | 'train' | 'busno' | 'vehicle' | 'note') => (event:TargetedEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [name]: event.currentTarget.value });

// ---------- 보내기 줄 ----------
let queue = store.get<RideEvent[]>(QUEUE, []), sending = false;
function push(event:Record<string, unknown> & { kind:string }):RideEvent {
  const entry:RideEvent = { ...event, ride: ride.id, mode: ride.mode, t: Date.now() };
  if (ride.mode === 'subway') Object.assign(entry, { line: ride.line, train: ride.train || undefined });
  else Object.assign(entry, { routeId: ride.routeId, routeName: ride.routeName, vehicle: ride.vehicle || undefined });
  if (gps.last && Date.now() - gps.last.t < 15000 && event.kind !== 'gps') Object.assign(entry, { lat: gps.last.lat, lng: gps.last.lng, acc: gps.last.acc });
  queue.push(entry); store.set(QUEUE, queue); set({}); return entry;
}
async function flush() {
  if (sending || !queue.length || !navigator.onLine) return;
  sending = true;
  const batch = queue.slice(0, batchSize(queue));
  try {
    const response = await fetch('/api/admin/debug/ride', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: batch }), credentials: 'same-origin' });
    if (response.status === 401) showLogin(true);
    else if (response.ok || response.status === 400) { showLogin(false); queue = queue.slice(batch.length); store.set(QUEUE, queue) }   // 400: 고칠 수 없는 묶음은 버린다
  } catch {} finally { sending = false; set({}) }
}
setInterval(flush, 15000);
addEventListener('online', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); else if (ride.id) keepAwake() });

// ---------- GPS · 화면 켜 두기 ----------
const gps:{ watch:number | null; last:{ t:number; lat:number; lng:number; acc:number } | null; sentAt:number; points:number } = { watch: null, last: null, sentAt: 0, points: 0 };
function startGps() {
  if (!navigator.geolocation || gps.watch != null) return;
  gps.watch = navigator.geolocation.watchPosition(position => {
    const coords = position.coords; gps.last = { t: Date.now(), lat: coords.latitude, lng: coords.longitude, acc: coords.accuracy };
    set({ gpsText: `${Math.round(coords.accuracy)}m` });
    if (ride.id && Date.now() - gps.sentAt >= 4500) {   // 5초에 한 점
      gps.sentAt = Date.now(); gps.points++;
      push({ kind: 'gps', lat: coords.latitude, lng: coords.longitude, acc: coords.accuracy, speed: coords.speed ?? undefined, heading: Number.isFinite(coords.heading) ? coords.heading : undefined });
    }
  }, () => { set({ gpsText: '없음' }) }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
function stopGps() { if (gps.watch != null) navigator.geolocation.clearWatch(gps.watch); gps.watch = null }
let lock:WakeLockSentinel | null | undefined = null;
async function keepAwake() { try { lock = await navigator.wakeLock?.request('screen') } catch {} }

// ---------- 가속도 센서: 0.1초 칸 평균을 5초마다 한 사건(motion)으로 — 누른 도착 · 출발과 센서가 잡은 섰다 · 떠났다를 맞춰 본다 ----------
// 칸마다 [사건 t 기준 ms, 중력 포함 가속 x y z, 중력 뺀 가속 x y z, 회전 α β γ](m/s², °/s, 없는 값 null). 화면이 꺼지면 브라우저가 센서를 멈춘다.
const motion:{ on:boolean; asking?:boolean; bins:(number | null)[][]; cur:MotionCell | null; samples:number; since:number } = { on: false, bins: [], cur: null, samples: 0, since: 0 };
const setMotion = (text:string) => { set({ motionText: text }) };
type AskingMotion = typeof DeviceMotionEvent & { requestPermission?:() => Promise<string> };
async function startMotion() {
  if (motion.on || motion.asking) return;
  if (typeof DeviceMotionEvent === 'undefined') return setMotion('없음');
  motion.asking = true;
  try {   // 아이폰: 누르는 순간에만 물을 수 있다(탑승 시작 · 센서 칸)
    const ask = (DeviceMotionEvent as AskingMotion).requestPermission;
    if (typeof ask === 'function' && await ask() !== 'granted') return setMotion('거부');
  } catch { return setMotion('눌러 켜기') } finally { motion.asking = false }
  motion.on = true; motion.since = Date.now(); motion.samples = 0; addEventListener('devicemotion', onMotion); setMotion('대기');
}
function stopMotion() { if (!motion.on) return; removeEventListener('devicemotion', onMotion); motion.on = false; sendMotion(true); setMotion('-') }
function onMotion(event:DeviceMotionEvent) {
  const slot = Math.floor(Date.now() / 100) * 100, gravity = (event.accelerationIncludingGravity || {}) as Partial<DeviceMotionEventAcceleration>,
    linear = (event.acceleration || {}) as Partial<DeviceMotionEventAcceleration>, turn = (event.rotationRate || {}) as Partial<DeviceMotionEventRotationRate>;
  const values = [gravity.x, gravity.y, gravity.z, linear.x, linear.y, linear.z, turn.alpha, turn.beta, turn.gamma];
  if (!motion.cur || motion.cur.slot !== slot) { closeBin(); motion.cur = { slot, sum: values.map(() => 0), n: values.map(() => 0) } }
  const cell = motion.cur;
  values.forEach((value, index) => { if (Number.isFinite(value)) { cell.sum[index]! += value as number; cell.n[index]!++ } });
  motion.samples++;
}
function closeBin() { if (motion.cur) motion.bins.push(closeCell(motion.cur)); motion.cur = null }
function sendMotion(all = false) {
  if (all) closeBin();
  if (!ride.id || !motion.bins.length) return;
  // 한 사건에 140칸까지(서버 상한 150칸 = 1500개) — 넘는 묶음은 서버가 통째로 거절해 함께 보낸 도착 · 출발까지 버려진다
  for (const chunk of motionChunks(motion.bins, Date.now())) push({ kind: 'motion', m: chunk });
  motion.bins = [];
  setMotion(`${Math.round(motion.samples / Math.max(1, (Date.now() - motion.since) / 1000))}Hz`);
}
setInterval(sendMotion, 5000);

// ---------- 지하철 자료: 역(index.html 안의 stationData) · 노선 이웃(edge_times.json) ----------
const stations = new Map<number, Station>();
let neighbors = new Map<string, number[]>();   // `${line}:${id}` → [이웃 id]
const onLine = (line:string) => lineStations(stations, neighbors, line);
async function loadSubway() {
  const [html, edges] = await Promise.all([fetch('/index.html').then(response => response.text()), fetch('/edge_times.json').then(response => response.json())]);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const station of JSON.parse(doc.getElementById('stationData')!.textContent!) as Station[]) stations.set(station.id, station);
  const graph = lineGraph(Object.keys(edges.edges));
  neighbors = graph.neighbors;
  set({ lines: graph.lines, line: store.get('syung-debug-line', graph.lines[0]) || graph.lines[0]! });
}
const stationByName = (line:string, name:string) => onLine(line).find(station => station.name === name.trim());
const nearStation = () => navigator.geolocation?.getCurrentPosition(position => {
  const best = nearest(onLine(view.line), position.coords.latitude, position.coords.longitude);
  if (best) set({ station: best.name });
}, () => alert('GPS 를 못 받았어요(지하일 수 있어요). 역 이름을 직접 골라 주세요.'), { enableHighAccuracy: true, timeout: 10000 });

// ---------- 버스: 번호 → 노선 ----------
let busPick:BusRoute | null = null, busTimer:ReturnType<typeof setTimeout> | undefined;
async function findBus() {
  const name = view.busno.trim(); busPick = null; set({});
  if (!name) { set({ routes: [], pressed: null }); return }
  const response = await fetch(`/api/admin/debug/bus-route?name=${encodeURIComponent(name)}`, { credentials: 'same-origin' });
  if (response.status === 401) return showLogin(true);
  const { routes = [] } = await response.json() as { routes?:BusRoute[] };
  set({ routes, pressed: null });
  if (routes.length === 1) pickBus(0);
}
function pickBus(index:number) { busPick = view.routes[index]!; set({ pressed: index }) }

// ---------- 탑승 ----------
let mode = 'subway';
const ride = store.get<Ride>(RIDE, {});
const startable = () => mode === 'subway' ? !!stationByName(view.line, view.station) : !!busPick;
const save = () => store.set(RIDE, ride);
const say = (text:string) => set({ log: [`${fmt(Date.now())} ${text}`, ...view.log] });

function start() {
  startMotion();   // 아이폰 센서 허락은 이 누름 안에서만 물을 수 있다
  for (const key of Object.keys(ride)) delete ride[key as keyof Ride];
  Object.assign(ride, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, mode, startedAt: Date.now(), moving: false });
  if (mode === 'subway') {
    const station = stationByName(view.line, view.station)!;
    Object.assign(ride, { line: view.line, train: view.train.trim(), path: [station.id] }); push({ kind: 'start', station: station.name });
  } else { Object.assign(ride, { routeId: busPick!.id, routeName: busPick!.name, vehicle: view.vehicle.trim(), stops: 0 }); push({ kind: 'start' }) }
  save(); set({ log: [] }); say('탑승 시작'); enterRiding(); flush();
}
function enterRiding() {
  set({ riding: true }); startGps(); keepAwake(); startMotion(); paintRide();
  if (ride.mode === 'bus') { pollBus(); clearInterval(pollTimer); pollTimer = setInterval(pollBus, 30000) }
  if (ride.mode === 'subway') { pollSubway(); clearInterval(pollTimer); pollTimer = setInterval(pollSubway, 20000) }
}
// 탄 노선을 서버가 '보는 중'으로 두어 원자료 위치가 30초마다 기록되게(정답과 맞춰 볼 자료)
// 지하철: 지도에서 그 노선을 보는 사람처럼 20초마다 물어 서버가 노선 위치 피드도 받게 한다 — 그래야 학습 기록(샘플)에 남아
// 실제 지도와 같은 자료로 슝을 재현할 수 있다(2026-10-14: 디버깅 페이지만 켜 둬 7호선은 늦은 전 역 도착 자료뿐이었다)
function pollSubway() { if (ride.mode === 'subway' && ride.line && !document.hidden) fetch(`/api/live?lines=${encodeURIComponent(ride.line)}`, { cache: 'no-store' }).catch(() => {}) }
function pollBus() { if (ride.mode === 'bus' && ride.routeId) fetch(`/api/bus/live?routes=${ride.routeId}&focus=${ride.routeId}`, { cache: 'no-store' }).catch(() => {}) }
let nextPick:number | null = null, pollTimer:ReturnType<typeof setInterval> | undefined;
// 탑승 중 글자를 지금 기록으로 다시 쓴다(옛 render — 탑승이 끝나면 마지막 글자를 그대로 둔다)
function paintRide() {
  if (!ride.id) return;
  const text = ridingView(ride, stations, neighbors, nextPick);
  nextPick = text.nextPick; set({ ridingText: text });
}
function act() {
  if (navigator.vibrate) navigator.vibrate(30);
  if (ride.mode === 'subway') {
    const path = ride.path!, here = stations.get(path.at(-1)!)?.name;
    if (ride.moving) { const next = nextPick == null ? undefined : stations.get(nextPick); push({ kind: 'arrive', station: next?.name }); path.push(nextPick!); ride.moving = false; say(`${next?.name} 도착`) }
    else { push({ kind: 'depart', station: here }); ride.moving = true; say(`${here} 출발`) }
  } else if (ride.moving) { ride.stops = (ride.stops || 0) + 1; push({ kind: 'arrive' }); ride.moving = false; say('정류장 도착') }
  else { push({ kind: 'depart' }); ride.moving = true; say('출발') }
  save(); paintRide(); flush();
}
function mark() { const note = prompt('무엇이 이상했나요? (비워도 돼요)') ?? null; if (note === null) return; push({ kind: 'mark', note }); say(`표시${note ? `: ${note}` : ''}`); flush() }
function undo() {
  // 아직 안 보낸 마지막 도착 · 출발만 거둔다(보낸 것은 표시로 바로잡기)
  const index = queue.findLastIndex(event => event.ride === ride.id && (event.kind === 'arrive' || event.kind === 'depart'));
  if (index < 0) { push({ kind: 'mark', note: '바로 앞 도착 · 출발 취소' }); say('이미 보낸 것 — 취소 표시를 남겼어요') }
  else { const event = queue.splice(index, 1)[0]!; store.set(QUEUE, queue); say(`${event.kind === 'arrive' ? '도착' : '출발'} 취소`) }
  if (ride.mode === 'subway') { if (ride.moving) ride.moving = false; else if (ride.path!.length > 1) { nextPick = ride.path!.pop()!; ride.moving = true } }
  else ride.moving = !ride.moving;
  save(); paintRide();
}
async function end() {
  if (!confirm('탑승 기록을 끝낼까요?')) return;
  stopMotion(); push({ kind: 'end' }); clearInterval(pollTimer); stopGps(); lock?.release?.().catch(() => {});
  for (const key of Object.keys(ride)) delete ride[key as keyof Ride];
  save(); await flush();
  set({ riding: false });
}
setInterval(() => { if (ride.id) set({ time: elapsed(Date.now() - ride.startedAt!) }) }, 1000);

// ---------- 캡처 ----------
let picked:File[] = [];
function showPicked() { set({ thumbs: picked.map(file => file.type.startsWith('image/') ? URL.createObjectURL(file) : null), sendDisabled: !picked.length }) }
const deviceState = () => ({ ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, theme: document.documentElement.dataset.theme,
  ride: ride.id ? { id: ride.id, mode: ride.mode, line: ride.line || ride.routeName, at: ride.mode === 'subway' ? stations.get(ride.path!.at(-1)!)?.name : undefined } : undefined,
  gps: gps.last ? { lat: +gps.last.lat.toFixed(5), lng: +gps.last.lng.toFixed(5), acc: Math.round(gps.last.acc) } : undefined, at: new Date().toISOString() });
async function send() {
  set({ sendDisabled: true }); const status = (text:string, kind = '') => set({ status: { text, cls: `status ${kind}` } });
  const note = view.note.trim(), state = JSON.stringify(deviceState());
  try {
    for (let index = 0; index < picked.length; index++) {
      status(`올리는 중… ${index + 1}/${picked.length}`);
      const file = picked[index]!, response = await fetch(`/api/admin/debug/shot?note=${encodeURIComponent(note)}&state=${encodeURIComponent(state)}`,
        { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file, credentials: 'same-origin' });
      if (response.status === 401) { showLogin(true); throw new Error('로그인이 필요해요') }
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message || `오류 ${response.status}`);
    }
    picked = []; showPicked(); set({ note: '' }); status('올렸어요. 헤르메스 창에 "올렸어"라고 알려 주세요.', 'ok');
  } catch (error) { status(`못 올렸어요: ${(error as Error).message}`, 'bad'); set({ sendDisabled: !picked.length }) }
}

// ---------- 올린 것 ----------
let loads = 0;   // 받을 때마다 늘려 목록 · 그래프를 새로 만든다(옛 innerHTML 비우기)
async function loadRecent() {
  const pick = dayRef.current?.value;
  const response = await fetch(`/api/admin/debug/recent${pick ? `?day=${pick}` : ''}`, { credentials: 'same-origin' });
  if (response.status === 401) return showLogin(true);
  set({ recent: { ...await response.json() as Recent, load: ++loads } });
}
function openTab(tab:Tab) { set({ tab }); if (tab === 'list') loadRecent() }

// ---------- 그리기 ----------
function Tabs() {
  const tab = (id:Tab, label:string) => <button role="tab" id={`tab-${id}`} aria-selected={view.tab === id} aria-controls={id} onClick={() => openTab(id)}>{label}</button>;
  return <>{tab('ride', '탑승 기록')}{tab('shot', '캡처 올리기')}{tab('list', '올린 것')}</>;
}

// 센서 그래프(uPlot, vendor/uplot): 가운데 = 힘(위 초록 출발 가속 · 아래 빨강 브레이크), 세로 실선 = 내가 누름, 아래 가장자리 △ = 센서가 잡은 것(초록 출발 · 빨강 도착)
function MotionChart({ ride }:{ ride:RideSummary }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const points = (ride.series || []).filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  const drawable = points.length > 0 && typeof uPlot !== 'undefined';
  useEffect(() => {
    if (!drawable) return;
    const plot = plotRef.current!, css = (name:string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const times = points.map(point => point[0] / 1000), up = points.map(point => Math.max(0, point[1])), down = points.map(point => Math.min(0, point[1]));
    const top = Math.max(1, ...points.map(point => Math.abs(point[1]))) * 1.15, good = css('--good'), bad = css('--bad');
    // 누름 = 위아래 끝까지 세로 실선(덕배 2026-10-12), 센서 = 아래 가장자리 △ — 이름 · 시각은 위 표에 있다
    const marks = (chart:UPlot) => {
      const { ctx } = chart, dpr = devicePixelRatio || 1, size = 6 * dpr;
      const outside = (px:number) => px < chart.bbox.left - 1 || px > chart.bbox.left + chart.bbox.width + 1;
      const tri = (t:number, kind:string, below:boolean) => {
        const px = chart.valToPos(t / 1000, 'x', true); if (outside(px)) return;
        const y = below ? chart.bbox.top + chart.bbox.height - size - 2 : chart.bbox.top + size + 2, dir = below ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(px - size, y - dir * size); ctx.lineTo(px + size, y - dir * size); ctx.lineTo(px, y + dir * size * .8); ctx.closePath();
        ctx.lineWidth = 2 * dpr; ctx.strokeStyle = kind === 'depart' ? good : bad;
        if (below) ctx.stroke(); else { ctx.fillStyle = kind === 'depart' ? good : bad; ctx.fill() }
      };
      const line = (t:number, kind:string) => {
        const px = chart.valToPos(t / 1000, 'x', true); if (outside(px)) return;
        ctx.beginPath(); ctx.moveTo(px, chart.bbox.top); ctx.lineTo(px, chart.bbox.top + chart.bbox.height); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = kind === 'depart' ? good : bad; ctx.stroke();
      };
      ctx.save();
      const zero = chart.valToPos(0, 'y', true); ctx.beginPath(); ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.moveTo(chart.bbox.left, zero); ctx.lineTo(chart.bbox.left + chart.bbox.width, zero);
      ctx.lineWidth = dpr; ctx.strokeStyle = css('--secondary'); ctx.stroke(); ctx.setLineDash([]);   // 0 선(서 있음 · 일정하게 달림)
      for (const tap of ride.taps || []) line(tap.t, tap.kind);
      for (const event of ride.sensor || []) tri(event.t, event.kind, true);
      ctx.restore();
    };
    const two = (value:number) => String(value).padStart(2, '0');
    const hms = (seconds:number) => { const date = new Date(seconds * 1000); return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}` };
    let resize:(() => void) | undefined;
    const build = () => {
      const width = Math.max(260, plot.clientWidth || 320);
      const chart = new uPlot!({
        width, height: 170, legend: { show: false }, cursor: { y: false, drag: { x: false, y: false } },
        scales: { x: { time: false }, y: { range: [-top, top] } },
        axes: [
          { stroke: css('--secondary'), grid: { show: false }, ticks: { stroke: css('--rule') }, values: (_:unknown, values:number[]) => values.map(hms), space: 90, font: '11px system-ui' },
          { show: false },   // 왼쪽 글자는 자리만 차지한다(덕배 2026-10-12) — 위 · 아래 뜻은 그래프 위 한 줄로
        ],
        series: [{}, { stroke: good, fill: `${good}33`, width: 2, fillTo: 0, points: { show: false } }, { stroke: bad, fill: `${bad}33`, width: 2, fillTo: 0, points: { show: false } }],
        hooks: { draw: [marks] },
      }, [times, up, down], plot);
      resize = () => chart.setSize({ width: Math.max(260, plot.clientWidth), height: 170 });
      addEventListener('resize', resize);
    };
    const frame = requestAnimationFrame(build);   // 화면에 붙은 뒤 폭을 재서 그린다
    return () => { cancelAnimationFrame(frame); if (resize) removeEventListener('resize', resize) };
  }, []);
  return <figure class="motion-chart">
    <figcaption class="motion-chart__note">위로 솟으면 출발, 아래로 꺼지면 브레이크예요.</figcaption>
    <div class="motion-chart__plot" ref={plotRef}>{drawable ? null : '센서 기록이 없어요.'}</div>
    <p class="motion-chart__legend"><span><i>│</i> 내가 누름</span><span><i>△</i> 센서</span><span><i style="color:var(--good)">●</i> 출발</span><span><i style="color:var(--bad)">●</i> 도착</span></p>
  </figure>;
}

function RideItem({ ride }:{ ride:RideSummary }) {
  return <li><b>{rideTitle(ride)}</b><br /><small>{rideLine(ride)}</small>
    {((ride.taps || []).length > 0 || (ride.sensor || []).length > 0) && <table class="cmp">
      <thead><tr><th>역</th><th></th><th>누름</th><th>센서</th><th>차이</th></tr></thead>
      <tbody>{compareRows(ride).map(row => <tr>{row.map((text, index) => <td class={index === 4 ? 'd' : undefined}>{text}</td>)}</tr>)}</tbody>
    </table>}
    {(ride.series || []).length > 0 && <MotionChart ride={ride} />}
  </li>;
}

function Recently() {
  const recent = view.recent;
  if (!recent) return <>
    <div class="box"><div class="row day-row"><h2>탑승 기록</h2><select id="ride-day" aria-label="날짜" ref={dayRef} onChange={loadRecent}></select></div><ul class="list" id="rides"></ul></div>
    <div class="box"><h2>최근 캡처</h2><ul class="list" id="shots"></ul></div>
  </>;
  const { day = '', days = [], rides = [], shots = [], load } = recent;
  return <>
    <div class="box"><div class="row day-row"><h2>탑승 기록</h2>
      <select id="ride-day" aria-label="날짜" ref={dayRef} onChange={loadRecent}>{days.map(each => <option key={`${load}:${each}`} value={each} selected={each === day}>{dayLabel(each, days)}</option>)}</select></div>
      <ul class="list" id="rides">{rides.length
        ? rides.map((ride, index) => <RideItem key={`${load}:${index}`} ride={ride} />)
        : <li class="muted">{day === days[0] ? '오늘은' : '이날은'} 기록이 없어요.</li>}</ul></div>
    <div class="box"><h2>최근 캡처</h2><ul class="list" id="shots">{shots.length
      ? shots.map(shot => <li><b>{shot.note || '(메모 없음)'}</b><br /><small>{shotLine(shot)}</small></li>)
      : <li class="muted">아직 없어요.</li>}</ul></div>
  </>;
}

function DebugPage() {
  const text = view.ridingText;
  let lineOptions = view.lines?.map(line => <option>{line}</option>);
  if (view.linesFailed) lineOptions = [<option>역 자료를 못 받았어요</option>];
  return <>
    <p class="login" id="login" hidden={!view.login}>로그인이 풀렸어요. <a href="/admin/login.html?next=%2Fadmin%2Fdebug">다시 로그인</a>하면 쌓아 둔 기록을 이어서 보내요.</p>

    {/* 1. 탑승 기록 */}
    <section id="ride" role="tabpanel" hidden={view.tab !== 'ride'}>
      <div class="box" id="setup" hidden={view.riding}>
        <h2>무엇을 타나요?</h2>
        <div class="seg"><button id="m-subway" aria-pressed={mode === 'subway'} onClick={() => { mode = 'subway'; set({}) }}>지하철</button><button id="m-bus" aria-pressed={mode === 'bus'} onClick={() => { mode = 'bus'; set({}) }}>버스</button></div>
        <div id="subway-setup" hidden={mode !== 'subway'}>
          <label for="line">노선</label>
          <select id="line" value={view.lines && !view.linesFailed ? view.line : undefined} onChange={event => { store.set('syung-debug-line', event.currentTarget.value); set({ line: event.currentTarget.value }) }}>{lineOptions}</select>
          <label for="station">지금 탄 역</label>
          <div class="row"><input id="station" list="stations" placeholder="역 이름" autocomplete="off" value={view.station} onInput={field('station')} /><button class="btn ghost" id="near" style="margin:0;flex:0 0 auto;width:auto;padding:0 14px" onClick={nearStation}>가까운 역</button></div>
          <datalist id="stations">{view.lines && onLine(view.line).map(station => <option value={station.name} />)}</datalist>
          <label for="train">열차 번호(모르면 비워 두세요)</label>
          <input id="train" inputmode="numeric" placeholder="예: 7123" value={view.train} onInput={field('train')} />
        </div>
        <div id="bus-setup" hidden={mode !== 'bus'}>
          <label for="busno">버스 번호</label>
          <input id="busno" inputmode="text" placeholder="예: 3011" autocomplete="off" value={view.busno} onInput={event => { field('busno')(event); clearTimeout(busTimer); busTimer = setTimeout(findBus, 300) }} />
          <div class="chips" id="busroutes">{view.routes.map((route, index) => <button aria-pressed={view.pressed === index} onClick={() => pickBus(index)}>{busLabel(route)}</button>)}</div>
          <label for="vehicle">차량 번호(모르면 비워 두세요)</label>
          <input id="vehicle" placeholder="예: 서울70사1234 뒤 4자리" value={view.vehicle} onInput={field('vehicle')} />
        </div>
        <button class="btn" id="start" disabled={!startable()} onClick={start}>탑승 시작</button>
        <p class="muted" style="margin-top:10px">탑승 중에는 화면을 켜 두세요(GPS가 꺼지지 않게). 지하에서 끊겨도 기기에 쌓았다가 다시 연결되면 보내요.</p>
      </div>

      <div class="box" id="riding" hidden={!view.riding}>
        <div class="now"><small id="ride-what">{text?.what}</small><b id="ride-where">{text?.where}</b><small id="ride-phase">{text?.phase}</small></div>
        <div class="chips" id="nexts" hidden={text ? text.nextsHidden : true}>{text?.nexts.map(next => <button aria-pressed={next.pressed} onClick={() => { nextPick = next.id; paintRide() }}>{next.name}</button>)}</div>
        <button class="btn huge" id="act" onClick={act}>{text?.act}</button>
        <div class="row"><button class="btn ghost" id="mark" onClick={mark}>이상한 순간 표시</button><button class="btn ghost" id="undo" onClick={undo}>방금 것 취소</button></div>
        <div class="facts">
          <div><small>탄 지</small><b id="f-time">{view.time}</b></div>
          <div><small>GPS</small><b id="f-gps">{view.gpsText}</b></div>
          <div><small>보낼 것</small><b id="f-queue">{queue.length}</b></div>
          <div id="f-motion-box" onClick={() => { if (ride.id) startMotion() }}><small>센서</small><b id="f-motion">{view.motionText}</b></div>
        </div>
        <ul class="log" id="log">{view.log.map(line => <li>{line}</li>)}</ul>
        <button class="btn ghost" id="end" style="margin-top:16px" onClick={end}>내렸어요(끝내기)</button>
      </div>
    </section>

    {/* 2. 캡처 올리기 */}
    <section id="shot" role="tabpanel" hidden={view.tab !== 'shot'}>
      <div class="box">
        <h2>캡처 올리기</h2>
        <p class="muted">이상한 화면 · 동영상을 올려 주세요. 기기 정보와 지금 탑승 기록이 같이 붙어요.</p>
        <button class="btn" id="pick" onClick={() => filesRef.current!.click()}>캡처 고르기</button>
        <input id="files" type="file" accept="image/*,video/*" multiple hidden ref={filesRef} onChange={event => { picked = [...picked, ...event.currentTarget.files!].slice(0, 8); event.currentTarget.value = ''; showPicked() }} />
        <div class="thumbs" id="thumbs">{view.thumbs.map(url => url ? <img src={url} alt="고른 캡처" /> : <span>동영상</span>)}</div>
        <label for="note">어떤 상황이었나요?</label>
        <textarea id="note" placeholder="예: 조선 모드, 11번 출구 장승, 갓이 깨져 보임 / 3011 탑승 중, 지도 버스가 내 위치보다 한 정류장 뒤" value={view.note} onInput={field('note')}></textarea>
        <button class="btn" id="send" disabled={view.sendDisabled} onClick={send}>올리기</button>
        <div class={view.status.cls} id="shot-status" role="status">{view.status.text}</div>
      </div>
    </section>

    {/* 3. 올린 것 */}
    <section id="list" role="tabpanel" hidden={view.tab !== 'list'}>
      <Recently />
    </section>
  </>;
}

// HTML 에 있던 첫 그림(같은 모양)을 비우고 그 자리에 그린다 — 같은 작업 안이라 깜박이지 않는다
main.textContent = ''; tabs.textContent = '';
set({});
// 시작: 지하철 자료 · 하던 탑승 이어서
loadSubway().then(() => { if (ride.id) { set({ log: [] }); say('하던 탑승 이어서'); enterRiding() } }).catch(() => { set({ linesFailed: true }) });
fetch('/api/admin/debug/recent', { credentials: 'same-origin' }).then(response => showLogin(response.status === 401)).catch(() => {});
flush();
