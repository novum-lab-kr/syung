// 관리 화면 '디버깅'의 셈(그리기 · 기기 다루기는 admin/debug.tsx): 시각 글자 · 노선 이웃 · 보낼 묶음 · 센서 칸 · 탑승 중 글자 · 누름 ↔ 센서 표 · 올린 것 줄.
// 응답은 server/services/debug.py(recent · bus_route) — 이 파일이 읽는 칸. 글자는 옛 인라인 스크립트(admin/debug.html)가 만들던 것과 같다.

export interface Station { id:number; name:string; lat:number; lon:number }
export interface Tap { kind:string; t:number; station?:string | null }
export interface SensorEvent { kind:string; t:number }
export interface RideSummary {
  ride:string; mode:string; line:string | null; from:number; to:number; stops:number; gps:number; taps:Tap[];
  sensor?:SensorEvent[]; series?:[number, number][];
}
export interface Shot { at:number; type:string; bytes:number; note:string | null }
export interface Recent { day?:string; days?:string[]; rides?:RideSummary[]; shots?:Shot[] }
export interface BusRoute { id:string; name:string; start?:string | null; end?:string | null }
// 탑승 중 기기에 둔 기록(localStorage syung-debug-ride) — 지하철은 line · train · path, 버스는 route* · vehicle · stops
export interface Ride {
  id?:string; mode?:string; startedAt?:number; moving?:boolean;
  line?:string; train?:string; path?:number[];
  routeId?:string; routeName?:string; vehicle?:string; stops?:number;
}
// 보낼 사건 하나(서버 record_ride 가 받는 모양 — 이 화면이 넣는 칸)
export type RideEvent = Record<string, unknown> & { kind:string; ride?:string; t:number };

export const fmt = (time:number):string => new Date(time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

// 탄 지 'M:SS'
export function elapsed(ms:number):string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ---- 지하철 자료: edge_times.json 의 `${line}:${a}:${b}` → 노선마다 역 이웃 · 노선 차례(숫자 노선 먼저) ----
export function lineGraph(edgeKeys:string[]):{ neighbors:Map<string, number[]>; lines:string[] } {
  const neighbors = new Map<string, number[]>(), lines = new Set<string>();
  for (const key of edgeKeys) {
    const [line = '', from = '', to = ''] = key.split(':'); lines.add(line);
    for (const [here, there] of [[from, to], [to, from]] as const) {
      const near = `${line}:${here}`;
      if (!neighbors.has(near)) neighbors.set(near, []);
      if (!neighbors.get(near)!.includes(+there)) neighbors.get(near)!.push(+there);
    }
  }
  return { neighbors, lines: [...lines].sort((left, right) => (parseInt(left) || 99) - (parseInt(right) || 99) || left.localeCompare(right, 'ko')) };
}

export const lineStations = (stations:Map<number, Station>, neighbors:Map<string, number[]>, line:string):Station[] =>
  [...stations.values()].filter(station => neighbors.has(`${line}:${station.id}`)).sort((left, right) => left.name.localeCompare(right.name, 'ko'));

// 가까운 역(위도 · 경도 거리를 위도에 맞춰 줄인 제곱)
export function nearest(list:Station[], lat:number, lng:number):Station | undefined {
  const far = (station:Station) => (station.lat - lat) ** 2 + ((station.lon - lng) * Math.cos(lat * Math.PI / 180)) ** 2;
  return [...list].sort((left, right) => far(left) - far(right))[0];
}

// ---- 보내기 줄: 한 번에 500개 · 센서 묶음(약 3KB)은 40개까지 — 본문 1MB 상한 안에 ----
export function batchSize(queue:{ kind:string }[]):number {
  let size = 0, moves = 0;
  for (const event of queue) { if (size >= 500 || (event.kind === 'motion' && ++moves > 40)) break; size++ }
  return size;
}

// ---- 가속도 센서: 0.1초 칸 평균 → [칸 시각, 값 9개(없으면 null)] · 5초마다 한 사건에 140칸까지 ----
export interface MotionCell { slot:number; sum:number[]; n:number[] }
export const closeCell = (cell:MotionCell):(number | null)[] =>
  [cell.slot, ...cell.sum.map((total, index) => cell.n[index] ? Math.round(total / cell.n[index]! * 100) / 100 : null)];
export function motionChunks(bins:(number | null)[][], base:number):(number | null)[][] {
  const chunks = [];
  for (let index = 0; index < bins.length; index += 140) chunks.push(bins.slice(index, index + 140).flatMap(([slot, ...values]) => [(slot as number) - base, ...values]));
  return chunks;
}

// ---- 탑승 중 화면 글자(옛 render) ----
export interface RidingView {
  nextPick:number | null; what:string; where:string; phase:string; nextsHidden:boolean; nexts:{ id:number; name:string | undefined; pressed:boolean }[]; act:string;
}
export function ridingView(ride:Ride, stations:Map<number, Station>, neighbors:Map<string, number[]>, nextPick:number | null):RidingView {
  if (ride.mode === 'subway') {
    const path = ride.path!, at = path.at(-1)!, here = stations.get(at);
    const options = (neighbors.get(`${ride.line}:${at}`) || []).filter(id => id !== path.at(-2));   // 지나온 역 쪽은 빼고
    const pick = nextPick != null && options.includes(nextPick) ? nextPick : options[0] ?? null;
    const next = pick == null ? undefined : stations.get(pick);
    return {
      nextPick: pick,
      what: `${ride.line}${ride.train ? ` · ${ride.train}열차` : ''}`,
      where: ride.moving ? `→ ${next?.name || '?'}` : here?.name || '?',
      phase: ride.moving ? `${here?.name || ''} 출발함 · 역에 서면 누르세요` : '역에 서 있음 · 문 닫고 출발하면 누르세요',
      nextsHidden: !ride.moving || options.length < 2,
      nexts: options.map(id => ({ id, name: stations.get(id)?.name, pressed: id === pick })),
      act: ride.moving ? `${next?.name || '다음 역'} 도착` : '출발',
    };
  }
  return {
    nextPick, what: `${ride.routeName}번${ride.vehicle ? ` · ${ride.vehicle}` : ''}`, where: ride.moving ? '달리는 중' : '정류장에 섬',
    phase: `정류장 ${ride.stops || 0}곳 · GPS 는 5초마다 저절로`, nextsHidden: true, nexts: [], act: ride.moving ? '정류장 도착' : '출발',
  };
}

export const busLabel = (route:BusRoute):string => `${route.name}${route.start ? ` · ${route.start}→${route.end}` : ''}`;

// ---- 올린 것 ----
// 누른 도착 · 출발과 센서가 잡은 것(서버 ride_motion, 시험판)을 나란히: 누름마다 90초 안의 같은 종류 센서 사건 하나 → [역, 도착/출발, 누름, 센서, 차이]
export function compareRows(ride:RideSummary):string[][] {
  const used = new Set<number>(), rows:{ t:number; where:string; kind:string; tap:number | null; sensor:number | null }[] = [], sensor = ride.sensor || [];
  const sec = (value:number) => `${value > 0 ? '+' : ''}${value}초`;
  let stop = 0;
  for (const tap of ride.taps || []) {
    let best:number | null = null;
    sensor.forEach((event, index) => {
      if (!used.has(index) && event.kind === tap.kind && Math.abs(event.t - tap.t) <= 90000 && (best == null || Math.abs(event.t - tap.t) < Math.abs(sensor[best]!.t - tap.t))) best = index;
    });
    if (best != null) used.add(best);
    if (tap.kind === 'arrive') stop++;
    let where = tap.station || '';
    if (!tap.station && ride.mode === 'bus') where = tap.kind === 'depart' && !stop ? '처음' : `정류장 ${stop}`;
    rows.push({ t: tap.t, where, kind: tap.kind, tap: tap.t, sensor: best != null ? sensor[best]!.t : null });
  }
  sensor.forEach((event, index) => { if (!used.has(index)) rows.push({ t: event.t, where: '(센서만)', kind: event.kind, tap: null, sensor: event.t }) });
  rows.sort((left, right) => left.t - right.t);
  const missing = ride.series ? '못 잡음' : '—';
  return rows.map(row => [row.where, row.kind === 'arrive' ? '도착' : '출발', row.tap ? fmt(row.tap) : '—', row.sensor ? fmt(row.sensor) : missing,
    row.tap && row.sensor ? sec(Math.round((row.sensor - row.tap) / 1000)) : '']);
}

// 날짜 고르기 글자(맨 위 = 오늘)
export const dayLabel = (day:string, days:string[]):string => `${Number(day.slice(4, 6))}월 ${Number(day.slice(6))}일${day === days[0] ? ' (오늘)' : ''}`;
export const rideTitle = (ride:RideSummary):string => `${ride.mode === 'bus' ? '버스' : '지하철'} ${ride.line || ''}`;
export const rideLine = (ride:RideSummary):string => `${fmt(ride.from)}~${fmt(ride.to)} · 도착 ${ride.stops}번 · GPS ${ride.gps}점${ride.series ? ' · 센서 있음' : ''}`;
export const shotLine = (shot:Shot):string => `${new Date(shot.at).toLocaleString('ko-KR')} · ${shot.type} · ${Math.round(shot.bytes / 1024)}KB`;
