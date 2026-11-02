// 「어디로 갈까요?」 처음 안내 로고 움직임: 로그인 팝업과 같은 「타고 가는」 Lottie(web/brand/login-motion-loop.json · tools/login_motion/make.mjs)를 그대로 쓴다.
// 플레이어(web/vendor/lottie)와 자료는 칸이 처음 화면에 보일 때만 받는다(첫 화면 코드에 없음). 앞부분은 한 번, 그 뒤 달리는 구간(markers 'loop')만 되풀이한다.
// 멈춘 로고(<img>)를 그대로 두고 그 위에 그려, 움직임 줄이기 · 받기 실패면 로고가 남는다. 시트가 닫히거나 숨거나 칸이 밀려나 안 보이면 멈춘다.
interface LottieAnim { destroy():void; play():void; pause():void; playSegments(segments:[number, number][], force:boolean):void; addEventListener(name:string, listener:()=>void):void }
interface LottieApi { loadAnimation(options:{ container:HTMLElement; renderer:string; loop:boolean; autoplay:boolean; animationData:unknown }):LottieAnim }
const player = () => (globalThis as unknown as { lottie?:LottieApi }).lottie;   // 받으면 globalThis.lottie 가 생긴다(account.mts · sky_motion.mts 도 같은 전역을 쓴다)

interface Json { [key:string]:unknown }
export interface MotionScene extends Json { layers:Json[]; op:number; markers?:{ cm:string; tm:number; dr:number }[] }

const isYellow = (color:unknown):color is number[] => Array.isArray(color) && color.slice(0, 3).map(part => Math.round(Number(part) * 255)).join() === '255,212,0';
function paintYellow(node:unknown, rgb:number[]):void {
  if (Array.isArray(node)) { node.forEach(child => paintYellow(child, rgb)); return; }
  if (!node || typeof node !== 'object') return;
  const item = node as Json, color = item.c as { k?:unknown } | undefined;
  if (item.ty === 'fl' && color && isYellow(color.k)) color.k = [...rgb, 1];
  Object.values(item).forEach(child => paintYellow(child, rgb));
}
// 패널에 맞춘 복사본: 자료의 노랑(#ffd400)을 지금 테마 노랑(--syung · 다크 #e3c54f)으로 칠하고, 패널의 로고에는 턱이 없으니 턱 층은 숨긴다. 플레이어가 고쳐 쓰니 받은 자료는 그대로 둔다
export function panelScene(data:MotionScene, yellow:string):MotionScene {
  const copy = structuredClone(data), hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(yellow.trim());
  if (hex) paintYellow(copy.layers, hex.slice(1).map(part => parseInt(part, 16) / 255));
  copy.layers.forEach(layer => { if (layer.nm === 'logo-ledge') layer.hd = true; });
  return copy;
}
// 재생 구간: 처음부터 끝까지 한 번, 그다음 되풀이 구간만(끝 프레임의 그림 = 되풀이 시작 프레임의 그림)
export function playRange(data:MotionScene):[number, number][] {
  const loop = data.markers?.find(marker => marker.cm === 'loop');
  return loop ? [[0, data.op], [loop.tm, loop.tm + loop.dr]] : [[0, data.op]];
}

let scene:Promise<MotionScene | null> | null = null;
function loadScene():Promise<MotionScene | null> {
  scene ??= fetch(new URL('../brand/login-motion-loop.json', import.meta.url)).then(response => {
    if (!response.ok) throw new Error(`login-motion ${response.status}`);
    return response.json() as Promise<MotionScene>;
  }).catch(() => { scene = null; return null; });   // 못 받았으면 다음에 열 때 다시
  return scene;
}

// host 안에 움직임을 그리기 시작하고, 멈추고 치우는 함수를 돌려준다. 다 그려지면 host 에 on 을 붙인다(CSS 가 멈춘 로고를 숨긴다)
export function startWhereMotion(host:HTMLElement):()=>void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  let alive = true, visible = false, requested = false, begun = false, anim:LottieAnim | null = null, range:[number, number][] = [];
  // 처음 보일 때 구간을 걸고, 그 뒤로는 멈춘 자리에서 잇는다
  const resume = () => {
    if (!anim) return;
    if (begun) anim.play(); else { begun = true; anim.playSegments(range, true); }
  };
  async function load():Promise<void> {
    try {
      const [data] = await Promise.all([loadScene(), player() ? 0 : import('../vendor/lottie/lottie_light.min.js')]);   // UMD: 받으면 globalThis.lottie 가 생긴다
      const api = player();
      if (!alive || !data || !api) return;
      range = playRange(data);
      const made = anim = api.loadAnimation({ container: host, renderer: 'svg', loop: true, autoplay: false, animationData: panelScene(data, getComputedStyle(host).getPropertyValue('--syung')) });
      made.addEventListener('DOMLoaded', () => { if (anim === made) host.classList.add('on'); });
      if (visible) resume();
    } catch { /* 플레이어를 못 받으면 멈춘 로고 그대로 */ }
  }
  const watcher = new IntersectionObserver(entries => {
    visible = entries.at(-1)?.isIntersecting ?? false;
    if (visible && !requested) { requested = true; void load(); }
    if (visible) resume(); else anim?.pause();
  });
  watcher.observe(host);
  return () => {
    alive = false;
    watcher.disconnect();
    anim?.destroy(); anim = null;
    host.classList.remove('on');
  };
}
