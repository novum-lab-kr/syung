// 메뉴 하늘 그림 움직임(Lottie): 달리는 지하철 + 날씨 장면(구름 겹 · 떨어지는 것).
// 플레이어(web/vendor/lottie — lottie-web light, svg 렌더러만)와 장면 JSON(web/brand/sky-*.json — tools/sky_motion/make.mjs 가 만든다)은
// 메뉴를 열 때만 받는다(첫 화면 코드에 없음 · 로그인 팝업 로고 움직임과 같은 방식). 메뉴가 닫히면 멈추고, 움직임 줄이기면 첫 프레임 정지.
// 장면 색은 낮 팔레트로 만들어 두고, 밤이면 불러온 자료의 색만 밤 팔레트로 바꾼다(NIGHT 표 — make.mjs 의 COLOR 와 맞춘다).
import type { Scene } from './sky_weather.mts';

interface LottieAnim { destroy():void; goToAndStop(frame:number, isFrame:boolean):void; play():void; pause():void; setSpeed(speed:number):void }
interface LottieApi { loadAnimation(options:{ container:HTMLElement; renderer:string; loop:boolean; autoplay:boolean; animationData:unknown; rendererSettings?:{ preserveAspectRatio:string } }):LottieAnim }
const player = () => (globalThis as unknown as { lottie?:LottieApi }).lottie;   // 받으면 globalThis.lottie 가 생긴다(account.mts 도 같은 전역을 쓴다)

// 낮 → 밤 색(아래 하늘 그림 팔레트 안): 구름 · 물방울 · 눈 테두리 · 창문
const NIGHT: Record<string, string> = {
  '#f4f8fc': '#6d76a8', '#aab5c3': '#4b5382', '#8fa6c4': '#8a93c8',
  '#d6ecff': '#5b78c8', '#2b62b0': '#bfdcff', '#6f7b8c': '#3a4170',   // 빗방울: 낮 진한 파랑 테두리 ↔ 밤 밝은 하늘색 테두리(바탕과 대비가 같게)
   '#8fb4dc': '#9aa6e0',
  '#9fd4ff': '#ffe08a', '#ffffff': '#ffffff', '#fffbe0': '#c8d2ff',
};
const hexOf = (rgb:number[]) => `#${rgb.slice(0, 3).map(part => Math.round(part * 255).toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (code:string) => [1, 3, 5].map(at => +(parseInt(code.slice(at, at + 2), 16) / 255).toFixed(4));

interface Json { [key:string]:unknown }
function nightColors(node:unknown):void {
  if (Array.isArray(node)) { node.forEach(nightColors); return; }
  if (!node || typeof node !== 'object') return;
  const item = node as Json;
  if ((item.ty === 'fl' || item.ty === 'st') && item.c && typeof item.c === 'object') {
    const color = (item.c as { k?:unknown }).k;
    if (Array.isArray(color) && color.length === 4 && typeof color[0] === 'number') {
      const next = NIGHT[hexOf(color as number[])];
      if (next) (item.c as { k:number[] }).k = [...rgbOf(next), 1];
    }
  }
  Object.values(item).forEach(nightColors);
}

const cache = new Map<string, Promise<Json | null>>();
function loadScene(name:string):Promise<Json | null> {
  let pending = cache.get(name);
  if (!pending) {
    pending = fetch(new URL(`../brand/sky-${name}.json`, import.meta.url)).then(response => response.ok ? response.json() as Promise<Json> : null).catch(() => null);
    cache.set(name, pending);
  }
  return pending;
}

// 칸 하나(지하철 · 떨어지는 것 · 구름): 맨 아래부터 쌓는다 — 지하철 < 떨어지는 것 < 구름(떨어지는 것은 구름 밑에서 시작한다)
interface Slot { box:HTMLElement; key:string; anim:LottieAnim | null; token:number }
const ORDER = ['train', 'fall', 'clouds'] as const;
type SlotName = typeof ORDER[number];
const slots = new Map<SlotName, Slot>();
let hostBox:HTMLElement | null = null, running = false;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function slotOf(host:HTMLElement, name:SlotName):Slot {
  let slot = slots.get(name);
  if (slot && slot.box.parentElement !== host) { slot.anim?.destroy(); slot = undefined; }   // 화면이 다시 그려져 칸이 사라졌다
  if (!slot) {
    const box = document.createElement('div');
    box.className = `sky-motion-${name}`;
    host.append(box);
    slot = { box, key: '', anim: null, token: 0 };
    slots.set(name, slot);
  }
  return slot;
}

async function setSlot(host:HTMLElement, name:SlotName, scene:string | null, night:boolean, speed:number):Promise<void> {
  const slot = slotOf(host, name), key = scene ? `${scene}|${night ? 'n' : 'd'}` : '';
  if (slot.key === key) { slot.anim?.setSpeed(speed); return; }
  slot.key = key; const token = ++slot.token;
  slot.anim?.destroy(); slot.anim = null; slot.box.replaceChildren();
  if (!scene) return;
  const [data] = await Promise.all([loadScene(scene), player() ? 0 : import('../vendor/lottie/lottie_light.min.js')]);   // UMD: 받으면 globalThis.lottie 가 생긴다
  if (!data || !player() || token !== slot.token || !slot.box.isConnected) return;   // 그사이 바뀌었다
  const copy = structuredClone(data);   // 플레이어가 받은 자료를 고쳐 쓴다 · 밤 색 · 낮엔 전조등 숨김
  if (night) nightColors(copy);
  (copy.layers as Json[]).forEach(layer => { if (layer.nm === 'lamp') layer.hd = !night; });
  const still = reduced();
  const anim = slot.anim = player()!.loadAnimation({ container: slot.box, renderer: 'svg', loop: true, autoplay: false, animationData: copy, rendererSettings: { preserveAspectRatio: 'xMidYMid slice' } });
  anim.setSpeed(speed);
  if (still) anim.goToAndStop(0, true);   // 움직임 줄이기: 첫 프레임 정지(지하철은 가운데)
  else if (running) anim.play();
  else anim.goToAndStop(0, true);
  host.classList.add('on');
}

// 메뉴를 열었을 때(또는 날씨가 바뀌었을 때): 지하철 + 장면을 맞춘다. 비 · 눈 오는 날은 지하철이 조금 천천히
export async function showMotion(host:HTMLElement, scene:Scene | null, night:boolean, wet:boolean):Promise<void> {
  hostBox = host; running = true;
  await Promise.all([
    setSlot(host, 'train', 'train', night, wet ? 0.7 : 1),
    setSlot(host, 'fall', scene?.fall ?? null, night, 1),
    setSlot(host, 'clouds', scene?.clouds ? `clouds-${scene.clouds}` : null, night, 1),
  ]);
}
// 메뉴가 닫히면 멈추고, 다시 열리면 이어서(움직임 줄이기면 그대로 정지)
export function pauseMotion():void {
  running = false;
  slots.forEach(slot => slot.anim?.pause());
}
export function resumeMotion():void {
  running = true;
  if (reduced()) return;
  slots.forEach(slot => { if (slot.box.parentElement === hostBox) slot.anim?.play(); });
}
