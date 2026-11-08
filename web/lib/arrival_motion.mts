// 타고 가기 도착 표시 움직임(Lottie — 도착 연기 char-ride · 길 끝 깃발 flag): 장면 JSON(web/brand/arrival-*.json — tools/arrival_motion/make.mjs)과
// 플레이어(web/vendor/lottie — svg 렌더러)는 쓸 때만 받는다(ride_arrival.tsx 가 이 파일을 import() 로 부른다 · 첫 화면 코드에 없음).
// 연기는 한 번 재생하고 끝 장면에서 멈춘다 · 깃발만 되풀이 · 움직임 줄이기면 바로 끝 장면.
// 색: 'lm-' 층은 로그인 장면 색 그대로, 나머지(색종이)는 자리 표시 색으로 만들어 두고(make.mjs COLOR) 불러올 때 CSS 변수의 지금 값으로 칠한다
interface LottieAnim { destroy():void; play():void; goToAndStop(frame:number, isFrame:boolean):void; totalFrames:number; addEventListener(name:string, listener:() => void):void }
interface LottieApi { loadAnimation(options:{ container:HTMLElement; renderer:string; loop:boolean; autoplay:boolean; animationData:unknown }):LottieAnim }
const player = () => (globalThis as unknown as { lottie?:LottieApi }).lottie;   // 받으면 globalThis.lottie 가 생긴다(sky_motion.mts · where_motion.mts 와 같은 전역)

export type ArrivalScene = 'char-ride' | 'flag';   // char-ride: 로그인 로고 열차를 거꾸로 탄 도착 연기 · flag: 길 끝 깃발(되풀이)
interface Json { [key:string]:unknown }

// 자리 표시 색(make.mjs COLOR) → CSS 변수
const PAINT:Record<string, string> = { '#ffd400': '--syung', '#e0a000': '--syung-deep', '#2a2000': '--syung-ink', '#111111': '--ink', '#fefefe': '--paper' };
const hexOf = (rgb:number[]) => `#${rgb.slice(0, 3).map(part => Math.round(part * 255).toString(16).padStart(2, '0')).join('')}`;

// CSS 변수 값을 0~1 rgb 로(색 이름 · rgb() · hex 무엇이든 — 브라우저가 계산한 color 를 읽는다)
function cssRgb(host:HTMLElement, name:string):number[] | null {
  const probe = document.createElement('i');
  probe.style.color = `var(${name})`; probe.style.display = 'none';
  host.append(probe);
  const value = getComputedStyle(probe).color; probe.remove();
  const parts = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(value);
  return parts ? parts.slice(1, 4).map(part => +(Number(part) / 255).toFixed(4)) : null;
}

function paint(node:unknown, colors:Map<string, number[]>):void {
  if (Array.isArray(node)) { node.forEach(child => paint(child, colors)); return; }
  if (!node || typeof node !== 'object') return;
  const item = node as Json, color = item.c as { k?:unknown } | undefined;
  if (typeof item.nm === 'string' && item.nm.startsWith('lm-') && typeof item.ty === 'number') return;   // 로그인 로고 · 새싹이 · 깃발 층: 로그인 장면 그대로 고정 색
  if ((item.ty === 'fl' || item.ty === 'st') && color && Array.isArray(color.k) && typeof color.k[0] === 'number') {
    const next = colors.get(hexOf(color.k as number[]));
    if (next) color.k = [...next, 1];
  }
  Object.values(item).forEach(child => paint(child, colors));
}

const cache = new Map<ArrivalScene, Promise<Json | null>>();
function loadScene(name:ArrivalScene):Promise<Json | null> {
  let pending = cache.get(name);
  if (!pending) {
    pending = fetch(new URL(`../brand/arrival-${name}.json`, import.meta.url)).then(response => response.ok ? response.json() as Promise<Json> : null).catch(() => null);
    pending.then(data => { if (!data) cache.delete(name); });   // 못 받았으면 다음 도착 때 다시
    cache.set(name, pending);
  }
  return pending;
}

// box 안에 장면을 그린다. 돌려준 함수로 치운다(마커가 사라질 때). 실패는 부르는 쪽에 알려 기존 도착 카드로 돌린다.
export function playArrival(box:HTMLElement, name:ArrivalScene, onError?:() => void):() => void {
  let anim:LottieAnim | null = null, gone = false, failed = false;
  const fail = () => {
    if (gone || failed || !box.isConnected) return;
    failed = true; anim?.destroy(); anim = null; box.classList.remove('on'); onError?.();
  };
  void Promise.all([loadScene(name), player() ? 0 : import('../vendor/lottie/lottie_light.min.js')]).then(([data]) => {
    const lottie = player();
    if (gone || !box.isConnected) return;
    if (!data || !lottie) { fail(); return; }
    const colors = new Map<string, number[]>();
    for (const [code, variable] of Object.entries(PAINT)) { const rgb = cssRgb(box, variable); if (rgb) colors.set(code, rgb); }
    const copy = structuredClone(data);   // 플레이어가 받은 자료를 고쳐 쓴다
    paint(copy.layers, colors);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    anim = lottie.loadAnimation({ container: box, renderer: 'svg', loop: name === 'flag' && !still, autoplay: !still, animationData: copy });
    anim.addEventListener('data_failed', fail);
    anim.addEventListener('error', fail);
    if (still) anim.goToAndStop(anim.totalFrames - 1, true);   // 움직임 줄이기: 끝 장면 정지
    box.classList.add('on');
  }).catch(fail);
  return () => { gone = true; anim?.destroy(); anim = null; };
}
