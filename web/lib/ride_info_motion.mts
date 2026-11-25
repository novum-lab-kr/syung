// 타고 가는 동안 정보 화면의 「가고 있다」 풍경 움직임(Lottie): 풍경(web/brand/ride-scenery.json · tools/ride_motion/make.mjs — 건물 · 나무 · 차가 지나간다)
// + 지금 날씨(메뉴 하늘 그림과 같은 자료 · 장면 — map/sky_weather.mts fetchWeather · sceneFor, web/brand/sky-*.json)
// + 가운데 로고: 로그인 화면과 같은 「타고 가는」 로고 움직임(web/brand/login-motion-loop.json — 「어디로 갈까요?」 와 같은 손질 where_motion panelScene · 뛰어가 올라타는 앞부분은 틀지 않고 처음부터 달리는 구간(loop 마커)만 되풀이 · 2026-11-25 사용자).
//   모양 · 움직임은 그대로, 불러온 뒤 색만 바꾼다(logoScene — 노란 바탕은 빼고 까만 열차는 낮 까망 · 밤 노랑 · 2026-11-25 사용자). 움직임 줄이기면 달리는 구간 첫 장면에서 멈춘다.
// 플레이어(web/vendor/lottie)와 자료는 정보 화면이 처음 뜰 때만 받는다(ride_card.tsx 가 import() 로 부른다 · 첫 화면 코드에 없음).
// 배터리: 플레이어의 자동 재생(rAF — 화면 주사율만큼 그림)을 쓰지 않고 타이머 하나가 1초에 FPS 번만 모든 장면을 넘긴다(goToAndStop). 화면이 숨으면 멈추고 보이면 이어 간다.
// 움직임 줄이기면 첫 장면에서 멈춘다. 색: 풍경은 자리 표시 색(make.mjs CODE)을 낮(라이트) · 밤(다크) 색으로 칠하고, 날씨 장면은 밤이면 sky_motion 의 밤 표로 바꾼다
import { fetchWeather, sceneFor, weatherArt, weatherTalk, type WeatherTalk } from '../map/sky_weather.mts';
import { nightColors } from '../map/sky_motion.mts';
import { panelScene, playRange, type MotionScene } from './where_motion.mts';

interface LottieAnim { destroy():void; goToAndStop(frame:number, isFrame:boolean):void; addEventListener(name:string, listener:()=>void):void }
interface LottieApi { loadAnimation(options:{ container:HTMLElement; renderer:string; loop:boolean; autoplay:boolean; animationData:unknown; rendererSettings?:{ preserveAspectRatio:string } }):LottieAnim }
const player = () => (globalThis as unknown as { lottie?:LottieApi }).lottie;   // 받으면 globalThis.lottie 가 생긴다(where_motion.mts · arrival_motion.mts 와 같은 전역)

interface Json { [key:string]:unknown }
export interface RideScene extends Json { layers:Json[]; op:number; fr:number }

const FPS = 20;

// 자리 표시 색(make.mjs CODE) → [낮, 밤]. 메뉴 하늘 그림(map/theme.mts) 팔레트 계열 — 날씨 장면과 같이 놓여도 어울리게
const PAINT:Record<string, [string, string]> = {
  '#010101': ['#8fd0ff', '#1b2346'], '#010102': ['#d8f0ff', '#3b3f78'], '#010103': ['#9fd39a', '#2b3466'], '#010104': ['#bfe3b4', '#343d74'],
  '#010105': ['#7d8796', '#20264a'], '#010106': ['#ffffff', '#c8d2ff'], '#010107': ['#f3e2a9', '#2c3260'], '#010108': ['#d9c27c', '#4b5487'],
  '#020101': ['#ffb38a', '#7a5a9a'], '#020102': ['#8fb3d9', '#3a4a8c'], '#020103': ['#ffe9a8', '#56609c'], '#020104': ['#a9dcc6', '#2f6a80'], '#020105': ['#f6a5a5', '#8a4f84'],
  '#020106': ['#ffffff', '#ffe08a'], '#020107': ['#d8ecff', '#ffe08a'], '#020108': ['#f2695c', '#d0607a'], '#020109': ['#5d7fa8', '#8a93c8'], '#02010a': ['#8a5a3c', '#2a2f5a'], '#02010b': ['#ffd400', '#e3c54f'],
  '#030101': ['#6fc27c', '#2f7a6a'], '#030102': ['#8fd68a', '#3d8a5e'], '#030103': ['#a07a4a', '#4b5487'], '#030104': ['#6f7b8c', '#6d76a8'], '#030105': ['#fff2b0', '#ffe08a'],
  '#040101': ['#f2695c', '#e0655a'], '#040102': ['#5aa2e8', '#5a8fe0'], '#040103': ['#ffffff', '#e8ecff'], '#040104': ['#ff9f1c', '#f09a2a'], '#040105': ['#3fbf7f', '#3aa873'], '#040106': ['#3d7edb', '#4a80d8'],
  '#040107': ['#2bb3a3', '#2aa093'], '#040108': ['#fff7e0', '#d8dcf5'], '#040109': ['#d8ecff', '#ffe08a'], '#04010a': ['#2a2f3a', '#0e1230'], '#04010b': ['#2a2f3a', '#0e1230'],
};
const hexOf = (rgb:number[]) => `#${rgb.slice(0, 3).map(part => Math.round(part * 255).toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (code:string) => [1, 3, 5].map(at => +(parseInt(code.slice(at, at + 2), 16) / 255).toFixed(4));

function paint(node:unknown, night:boolean):void {
  if (Array.isArray(node)) { node.forEach(child => paint(child, night)); return; }
  if (!node || typeof node !== 'object') return;
  const item = node as Json, color = item.c as { k?:unknown } | undefined;
  if ((item.ty === 'fl' || item.ty === 'st') && color && Array.isArray(color.k) && typeof color.k[0] === 'number') {
    const next = PAINT[hexOf(color.k as number[])];
    if (next) color.k = [...rgbOf(next[night ? 1 : 0]), 1];
  }
  Object.values(item).forEach(child => paint(child, night));
}

// 내릴 곳 날씨를 말로(「비가 와요, 12도예요.」 · 한마디 「우산 챙겨요!」 · 그림 종류 — map/sky_weather weatherTalk). 못 받으면 null(줄 없음)
export const skySay = async (at:[number, number]):Promise<WeatherTalk | null> => { const weather = await fetchWeather(at); return weather ? weatherTalk(weather) : null; };

const cache = new Map<string, Promise<RideScene | null>>();
function loadScene(name:string):Promise<RideScene | null> {
  let pending = cache.get(name);
  if (!pending) {
    pending = fetch(new URL(`../brand/${name}.json`, import.meta.url)).then(response => response.ok ? response.json() as Promise<RideScene> : null).catch(() => null);
    cache.set(name, pending);
    void pending.then(data => { if (!data) cache.delete(name); });   // 못 받았으면 다음에 뜰 때 다시
  }
  return pending;
}

// 지난 시간(ms) → 장면 번호(한 바퀴를 되풀이)
export const frameAt = (elapsedMs:number, sceneFps:number, frames:number):number => frames > 0 ? (elapsedMs / 1000 * sceneFps) % frames : 0;
// 구간 재생(where_motion playRange — [[처음, 끝] 한 번, [되풀이 처음, 끝]])의 장면 번호: 앞 구간을 한 번 지난 뒤 마지막 구간만 되풀이한다(끝 장면은 넣지 않는다 — 그 그림 = 되풀이 처음 그림)
export function rangeFrameAt(elapsedMs:number, sceneFps:number, range:[number, number][]):number {
  let frame = elapsedMs / 1000 * sceneFps;
  for (const [from, to] of range.slice(0, -1)) {
    if (frame < to - from) return from + frame;
    frame -= to - from;
  }
  const [from, to] = range.at(-1) ?? [0, 0];
  return from + frameAt(frame / sceneFps * 1000, sceneFps, to - from);
}

// 풍경 위 로고(받은 자료는 그대로 · 복사본의 색만): 노란 바탕(logo-tile)과 턱(logo-ledge — panelScene)은 빼고, 까만 열차(몸통 · 속도선)는 낮 = 그대로 까망 · 밤 = 테마 노랑,
// 눈(바탕이 비쳐 보이던 노란 점)은 낮 = 그대로 노랑 · 밤 = 까망(노란 몸통에서 보이게). 올라타는 새싹 캐릭터(kid · rider-*)의 색은 건드리지 않는다
const LOGO_BODY = new Set(['logo-body', 'logo-line1', 'logo-line2', 'logo-line3']), INK = [0.0784, 0.0784, 0.0784];
function recolor(node:unknown, rgb:number[]):void {
  if (Array.isArray(node)) { node.forEach(child => recolor(child, rgb)); return; }
  if (!node || typeof node !== 'object') return;
  const item = node as Json, color = item.c as { k?:unknown } | undefined;
  if ((item.ty === 'fl' || item.ty === 'st') && color && Array.isArray(color.k)) color.k = [...rgb, 1];
  Object.values(item).forEach(child => recolor(child, rgb));
}
export function logoScene(data:MotionScene, yellow:string, night:boolean):MotionScene {
  const copy = panelScene(data, yellow), code = /^#[\da-f]{6}$/i.exec(yellow.trim())?.[0] ?? '#ffd400';
  copy.layers.forEach(layer => {
    if (layer.nm === 'logo-tile') layer.hd = true;
    if (!night) return;
    if (LOGO_BODY.has(String(layer.nm))) recolor(layer.shapes, rgbOf(code));
    if (layer.nm === 'logo-eye') recolor(layer.shapes, INK);
  });
  return copy;
}

// since: 이 장면이 붙은 때(타이머 시간) — 장면 번호는 붙은 때부터 센다
interface Playing { anim:LottieAnim; fps:number; frameOf:(elapsedMs:number) => number; since:number }

// host 안에 풍경 + 날씨를 그리기 시작하고, 멈추고 치우는 함수를 돌려준다. 풍경이 다 그려지면 host 에 on 을 붙인다.
// here: 날씨를 물을 자리([lng, lat] · 없으면 서울 — fetchWeather 와 같다). 날씨를 못 받으면 날씨 층 없이 풍경만
export function startRideMotion(host:HTMLElement, here:[number, number] | null = null):()=>void {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches, night = document.documentElement.dataset.theme === 'dark';
  const playing:Playing[] = [];
  let alive = true, timer:ReturnType<typeof setInterval> | 0 = 0, elapsed = 0, last = 0;
  const step = () => {
    const now = performance.now();
    elapsed += now - last; last = now;
    for (const item of playing) item.anim.goToAndStop(item.frameOf(elapsed - item.since), true);
  };
  const run = () => { if (!playing.length || timer || still || document.hidden) return; last = performance.now(); step(); timer = setInterval(step, 1000 / FPS); };
  const pause = () => { clearInterval(timer); timer = 0; };
  const onVisible = () => { if (document.hidden) pause(); else run(); };
  document.addEventListener('visibilitychange', onVisible);
  // 칸 하나에 장면 하나(아래부터 차례로 겹친다 — 풍경 < 가림막 < 떨어지는 것 < 구름)
  const slot = (name:string) => { const box = document.createElement('div'); box.className = `rg-scene-${name}`; host.append(box); return box; };
  const add = (box:HTMLElement, data:RideScene, fit:string, frameOf = (elapsedMs:number) => frameAt(elapsedMs, data.fr, data.op)) => {
    const api = player();
    if (!api) return null;
    const anim = api.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: false, animationData: data, rendererSettings: { preserveAspectRatio: fit } });
    anim.goToAndStop(frameOf(0), true);
    playing.push({ anim, fps: data.fr, frameOf, since: elapsed });
    return anim;
  };
  const boxes = { land: slot('land'), veil: slot('veil'), fall: slot('fall'), clouds: slot('clouds'), logo: slot('logo') };
  boxes.logo.classList.add('login-motion');   // 바람 선 · 먼지 · 글자 색(syung.css .login-motion .lm-*)을 로그인 화면과 같이
  // 가운데 로고: 달리는 구간만(올라타는 앞부분 없음). 움직임 줄이기면 그 첫 장면에서 멈춘다
  const logo = async () => {
    const data = await loadScene('login-motion-loop') as (RideScene & MotionScene) | null;
    if (!alive || !data) return;
    const range = playRange(data).slice(-1), copy = logoScene(data, getComputedStyle(host).getPropertyValue('--syung'), night) as RideScene & MotionScene;
    add(boxes.logo, copy, 'xMidYMid meet', elapsedMs => still ? range.at(-1)?.[0] ?? 0 : rangeFrameAt(elapsedMs, data.fr, range));
    run();
  };
  void (async () => {
    try {
      const [data] = await Promise.all([loadScene('ride-scenery'), player() ? 0 : import('../vendor/lottie/lottie_light.min.js')]);   // UMD: 받으면 globalThis.lottie 가 생긴다
      if (!alive || !data) return;
      const copy = structuredClone(data);   // 플레이어가 받은 자료를 고쳐 쓴다
      paint(copy.layers, night);
      add(boxes.land, copy, 'xMidYMax slice')?.addEventListener('DOMLoaded', () => { if (alive) host.classList.add('on'); });
      run();
      void logo();
      // 날씨: 메뉴 하늘 그림과 같은 자료 · 같은 고르기. 풍경이 뜬 뒤에 얹는다(날씨를 기다리느라 풍경이 늦지 않게)
      const weather = await fetchWeather(here);
      if (!alive || !weather) return;
      const scene = sceneFor(weather), names = [[boxes.fall, scene.fall], [boxes.clouds, scene.clouds ? `clouds-${scene.clouds}` : null]] as const;
      boxes.veil.innerHTML = `<svg viewBox="0 0 320 110" preserveAspectRatio="none" aria-hidden="true">${weatherArt(weather, night).back}</svg>`;   // 하늘이 흐려지는 가림막(같은 값)
      await Promise.all(names.map(async ([box, name]) => {
        const sky = name ? await loadScene(`sky-${name}`) : null;
        if (!alive || !sky) return;
        const skyCopy = structuredClone(sky);
        if (night) nightColors(skyCopy);
        add(box, skyCopy, 'xMidYMin slice');
      }));
      run();
    } catch { /* 플레이어를 못 받으면 빈 칸(이번 · 다음 역은 그대로) */ }
  })();
  return () => {
    alive = false;
    pause();
    document.removeEventListener('visibilitychange', onVisible);
    playing.forEach(item => item.anim.destroy()); playing.length = 0;
    host.replaceChildren();
    host.classList.remove('on');
  };
}
