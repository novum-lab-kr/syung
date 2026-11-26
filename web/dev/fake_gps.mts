// 개발 도구: 가짜 GPS — PC 브라우저에서 타고 가기(탑승 판정 · 바로잡기 창구)를 가짜 위치로 시험한다(2026-11-26 사용자 요청)
// 주소에 ?fakegps=1 이 있을 때만 본체가 이 파일을 받아 붙인다(운영 · 폰에서도 · 앱 지도 #app 은 빼고) — 그 페이지는 타고 가기 기록을 서버로 보내지 않는다(본체 startRideLog)
// navigator.geolocation 을 감싼다 — 가짜를 끄면 진짜 GPS 그대로, 켜면 진짜 watch 를 끊고 이 패널이 정한 위치를 1초마다 보낸다
//  ① 지도를 눌러 내 위치 옮기기 ② 지금 타고 가기 경로를 따라 재생(걷기 → 승강장 → 그 열차 따라) ③ 지하(같은 좌표 되풀이) ④ 위치 끊김(오류) · 정확도(m)
// 고르기 · 셈(alongPath)은 Node 시험이 부른다 — 모듈을 읽을 때 브라우저 것을 만지지 않는다(installFakeGps 를 불러야 바꿔 끼운다)
import {metres} from '../lib/ride-along.mts';
import type {LngLat, RideLeg, RideStep} from '../lib/ride-along.mts';

// 경로(path) 위 from 에서 거리 m 만큼 간 자리 · 끝까지 갔는가
export function alongPath(path:readonly LngLat[], distanceM:number):{ spot:LngLat; end:boolean } {
  let left = Math.max(0, distanceM);
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1]!, to = path[index]!, length = metres(from, to);
    if (left <= length && length > 0) {
      const share = left / length;
      return {spot: [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share], end: false};
    }
    left -= length;
  }
  return {spot: path[path.length - 1] ?? [0, 0], end: true};
}

// 타고 가기가 알려 주는 지금 상태(ui/ride_along devPlay): 구간 · 지금 단계 · 기다리는(붙든) 또는 탄 열차 id
export interface FakeGpsRide { legs:readonly RideLeg[]; step:RideStep; train:string | null; held:boolean }
export interface FakeGpsDeps {
  map:{ getCenter():{ lng:number; lat:number }; getCanvasContainer():HTMLElement; unproject(point:[number, number]):{ lng:number; lat:number } };
  ride:() => FakeGpsRide | null;
  trainAt:(id:string) => LngLat | null;
  stationAt:(id:number) => LngLat | null;
  locate:() => void;
}

const WALK_MPS = 1.3, BUS_MPS = 8, TICK_MS = 1000, WOBBLE_DEG = 0.000003;
const SPEEDS = [1, 3, 10];

interface Watch { ok:PositionCallback; fail:PositionErrorCallback | null | undefined; options:PositionOptions | undefined; realId:number | null }

// navigator.geolocation 을 바꿔 끼우고 패널을 붙일 창구를 돌려준다(진짜가 없으면 null)
export function installFakeGps():{ mount(deps:FakeGpsDeps):void } | null {
  const real = navigator.geolocation;
  if (!real) return null;
  const watches = new Map<number, Watch>();
  let nextId = 1, on = false, spot:LngLat | null = null, accuracy = 10, frozen:LngLat | null = null, cut = false;

  const position = (at:LngLat):GeolocationPosition => {
    const coords = {latitude: at[1], longitude: at[0], accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null};
    const timestamp = Date.now();
    return {coords: {...coords, toJSON: () => coords}, timestamp, toJSON: () => ({coords, timestamp})} as GeolocationPosition;
  };
  const failure = (message:string):GeolocationPositionError => ({code: 2, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3}) as GeolocationPositionError;
  // 지금 보낼 자리: 끊김이면 없음 · 지하면 얼린 자리 그대로
  const sending = ():LngLat | null => cut ? null : frozen ?? spot;
  // 땅 위 GPS 는 서 있어도 좌표가 조금씩 흔들린다 — 지하(얼린 자리)가 아니면 약 0.3 m 씩 번갈아 흔들어 보낸다(같은 좌표 되풀이는 ③ 만)
  let wobble = 1;
  const emit = () => {
    const at = sending();
    if (!on || !at) return;
    wobble = -wobble;
    const sent:LngLat = frozen ? at : [at[0], at[1] + wobble * WOBBLE_DEG];
    for (const watch of watches.values()) watch.ok(position(sent));
    console.log(`[가짜 GPS] ${sent[1].toFixed(6)}, ${sent[0].toFixed(6)} ±${accuracy}m${frozen ? ' (지하: 같은 좌표)' : ''}`);   // 보낸 좌표(켰을 때만 — 위에서 꺼짐은 돌아갔다 · 2026-11-26 사용자)
  };

  const fake:Geolocation = {
    getCurrentPosition(ok, fail, options) {
      if (!on) { real.getCurrentPosition(ok, fail, options); return; }
      setTimeout(() => { const at = sending(); if (at) ok(position(at)); else fail?.(failure('가짜 GPS: 위치 없음')); }, 0);
    },
    watchPosition(ok, fail, options) {
      const id = nextId++;
      watches.set(id, {ok, fail, options, realId: on ? null : real.watchPosition(ok, fail, options)});
      // 끊김(④)을 먼저 켠 뒤 등록한 watch 도 오류를 받게 한다(emit 은 끊김이면 아무것도 안 보낸다)
      if (on) setTimeout(() => { if (cut) fail?.(failure('가짜 GPS: 위치 끊김')); else emit(); }, 0);
      return id;
    },
    clearWatch(id) {
      const watch = watches.get(id);
      if (watch?.realId != null) real.clearWatch(watch.realId);
      watches.delete(id);
    },
  };
  Object.defineProperty(navigator, 'geolocation', {value: fake, configurable: true});

  // 켜면 진짜 watch 를 끊고(PC 의 Wi-Fi 위치가 섞이지 않게) · 끄면 같은 처리기로 진짜를 다시 건다
  const setOn = (value:boolean) => {
    if (value === on) return;
    on = value;
    for (const watch of watches.values()) {
      if (on && watch.realId != null) { real.clearWatch(watch.realId); watch.realId = null; }
      if (!on && watch.realId == null) watch.realId = real.watchPosition(watch.ok, watch.fail, watch.options);
    }
  };

  return {mount(deps) {
    // ---- 재생: 타고 가기의 지금 단계를 보고 자리를 정한다(열차는 실제 시각대로 · 배속은 걷기 · 버스만)
    let playing = false, speed = 1, legIndex = -1, walkedM = 0, aboard = false, note = '';
    // 이 구간의 길 — 구간에 들어설 때 한 번 정해 둔다(지금 자리에서 곧은 선을 매 틱 다시 그으면 누적 거리가 겹쳐 더해진다)
    let legPath:LngLat[] | null = null;
    const playTick = () => {
      const ride = deps.ride();
      if (!ride) { note = '타고 가기가 꺼져 있어요'; return; }
      const {step, legs, train, held} = ride, leg = step.kind === 'done' ? undefined : legs[step.leg];
      if (step.kind === 'done' || !leg) { note = '도착'; playing = false; return; }
      if (step.leg !== legIndex) { legIndex = step.leg; walkedM = 0; aboard = false; legPath = null; }
      if (step.kind === 'walk' || leg.type === 'bus' && step.kind === 'ride') {
        legPath ??= pathOf(leg, legs[step.leg + 1]);
        const path = legPath;
        if (!path) { note = '걷는 길을 몰라요 — 지도를 눌러 옮겨 주세요'; return; }
        walkedM += (leg.type === 'bus' ? BUS_MPS : WALK_MPS) * speed * TICK_MS / 1000;
        const where = alongPath(path, walkedM);
        spot = where.spot;
        note = `${leg.type === 'bus' ? '버스' : '걷기'} ${step.leg + 1}/${legs.length} · ${Math.round(walkedM)}m${where.end ? ' (끝)' : ''}`;
        return;
      }
      if (leg.type === 'bus') { spot = leg.path[0] ?? spot; note = '버스 기다리는 중'; return; }
      if (leg.type !== 'ride') return;
      // 기다리기: 탈 역에 서 있다가 붙든(또는 짐작한) 열차가 오면 그 열차를 따라간다 · 타는 중: 탄 열차를 따라간다
      const board = deps.stationAt(leg.stations[0]!), trainSpot = train ? deps.trainAt(train) : null;
      if (step.kind === 'wait') {
        // 타고 가기가 들어온 열차를 붙들면(held) 올라탄다(aboard) — 그 뒤로는 열차를 따라간다(떠난 열차를 따라가야 탔다고 본다)
        // (역 점과 승강장 · 열차 자리는 수십 m 떨어질 수 있어 거리로 가리지 않는다 — 강남 2호선 2026-11-26 잼)
        if (trainSpot && held) aboard = true;
        if (trainSpot && aboard) { spot = trainSpot; note = `열차 ${train} 따라가는 중(기다리기)`; }
        else { spot = board ?? spot; note = `${leg.from}역에서 기다리는 중${train ? ` · 열차 ${train}` : ''}`; }
        return;
      }
      if (trainSpot) { spot = trainSpot; note = `열차 ${train} 타고 가는 중`; } else note = '탄 열차가 지도에 없어요';
    };
    // 걷기 · 버스 구간의 길: 걷기는 서버 길(path) · 없으면 지금 자리 → 다음 타는 곳 곧은 선
    const pathOf = (leg:RideLeg, next:RideLeg | undefined):LngLat[] | null => {
      if (leg.type !== 'walk') return leg.type === 'bus' && leg.path.length >= 2 ? [...leg.path] : null;
      if (leg.path && leg.path.length >= 2) return [...leg.path];
      const target = next?.type === 'ride' ? deps.stationAt(next.stations[0]!) : next?.type === 'bus' ? next.path[0] ?? null : null;
      return spot && target ? [spot, target] : null;
    };
    setInterval(() => { if (on && playing) playTick(); emit(); paint(); }, TICK_MS);

    // ---- 패널(작게 · 왼쪽 위 머리띠 아래 — 운영 syung.css 에 싣지 않으려고 모양은 여기 둔다)
    const box = document.createElement('div');
    box.className = 'dev-fake-gps';
    box.innerHTML = `<style>
.dev-fake-gps{position:fixed;left:8px;top:76px;z-index:9999;background:#fff;border:1px solid #888;border-radius:8px;padding:6px 8px;font:12px/1.5 sans-serif;color:#222;box-shadow:0 2px 8px #0003;max-width:250px}
.dev-fake-gps label{display:block}.dev-fake-gps button{font:inherit;margin:2px 2px 2px 0}.dev-fake-gps b{cursor:pointer}
.dev-fake-gps .on{background:#222;color:#fff}.dev-fake-gps input[type=number]{width:52px}.dev-fake-gps .note{color:#555;word-break:keep-all}
</style><b data-act="fold">가짜 GPS ▾</b><div data-part="body">
<label><input type="checkbox" data-act="on"> 가짜 위치 켜기</label>
<label>정확도 <input type="number" min="1" max="2000" value="10" data-act="accuracy"> m</label>
<button type="button" data-act="pick">① 지도 눌러 옮기기</button><br>
<button type="button" data-act="play">② 경로 따라 재생</button><select data-act="speed">${SPEEDS.map(value => `<option value="${value}">×${value}</option>`).join('')}</select>
<label><input type="checkbox" data-act="under"> ③ 지하(같은 좌표 되풀이)</label>
<label><input type="checkbox" data-act="cut"> ④ 위치 끊김(오류 보내기)</label>
<div class="note" data-part="note"></div></div>`;
    document.body.append(box);
    const part = <T extends HTMLElement>(selector:string) => box.querySelector<T>(selector)!;
    const onBox = part<HTMLInputElement>('[data-act=on]'), underBox = part<HTMLInputElement>('[data-act=under]'), cutBox = part<HTMLInputElement>('[data-act=cut]');
    const pickBtn = part<HTMLButtonElement>('[data-act=pick]'), playBtn = part<HTMLButtonElement>('[data-act=play]'), noteEl = part('[data-part=note]');
    let picking = false;
    const enable = () => {
      if (!on) { setOn(true); if (!spot) { const center = deps.map.getCenter(); spot = [center.lng, center.lat]; } }
      deps.locate();
    };
    function paint() {
      onBox.checked = on;
      pickBtn.classList.toggle('on', picking);
      playBtn.classList.toggle('on', playing);
      playBtn.textContent = playing ? '② 재생 멈춤' : '② 경로 따라 재생';
      const at = sending();
      noteEl.textContent = !on ? '꺼짐 — 진짜 GPS' : [at ? `${at[1].toFixed(5)}, ${at[0].toFixed(5)} · ±${accuracy}m` : cut ? '끊김 — 보내지 않음' : '위치 없음', frozen ? '지하: 같은 좌표' : '', playing ? note : ''].filter(Boolean).join(' · ');
    }
    onBox.addEventListener('change', () => { if (onBox.checked) enable(); else { setOn(false); playing = false; } paint(); });
    part<HTMLInputElement>('[data-act=accuracy]').addEventListener('change', event => { const value = +(event.target as HTMLInputElement).value; if (value > 0) accuracy = value; paint(); });
    part<HTMLSelectElement>('[data-act=speed]').addEventListener('change', event => { speed = +(event.target as HTMLSelectElement).value || 1; });
    part('[data-act=fold]').addEventListener('click', () => { const body = part('[data-part=body]'); body.hidden = !body.hidden; });
    pickBtn.addEventListener('click', () => { picking = !picking; paint(); });
    playBtn.addEventListener('click', () => {
      playing = !playing;
      if (playing) { enable(); legIndex = -1; note = ''; playTick(); emit(); }
      paint();
    });
    underBox.addEventListener('change', () => { frozen = underBox.checked ? sending() ?? spot : null; paint(); });
    cutBox.addEventListener('change', () => {
      cut = cutBox.checked;
      if (cut && on) for (const watch of watches.values()) watch.fail?.(failure('가짜 GPS: 위치 끊김'));
      paint();
    });
    // ① 지도 누름: 이 누름은 지도에 넘기지 않는다(역 · 열차 시트가 열리지 않게) · 한 번 옮기면 끝 · 재생은 멈춘다
    const canvas = deps.map.getCanvasContainer();
    window.addEventListener('click', event => {
      if (!picking || !(event.target instanceof Node) || !canvas.contains(event.target)) return;
      event.stopPropagation(); event.preventDefault();
      const rect = canvas.getBoundingClientRect(), at = deps.map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
      enable();
      spot = [at.lng, at.lat]; picking = false; playing = false;
      console.log(`[가짜 GPS] 지도 누름 → ${at.lat.toFixed(6)}, ${at.lng.toFixed(6)}`);
      if (frozen) frozen = spot;
      emit(); paint();
    }, true);
    paint();
  }};
}
