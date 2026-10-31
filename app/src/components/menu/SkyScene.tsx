// 하늘 그림 움직임 칸 하나: web/map/sky_motion.mts(장면 받기 · 밤 색 · 낮 전조등 숨김 · 움직임 줄이기면 첫 프레임). 받지 못하면 아무것도 안 그린다.
import { useEffect, useState } from 'react';
import { StyleSheet, UIManager } from 'react-native';
import { MAP_ORIGIN } from '../../map/source';
import { useReducedMotion } from '../../theme/useTheme';

type LottieModule = typeof import('lottie-react-native');
type LottieSource = import('lottie-react-native').AnimationObject;
type Json = Record<string, unknown>;

// lottie 네이티브가 들어가기 전 빌드에서도 메뉴가 깨지지 않게 있을 때만 부른다(없으면 정지 그림이 남는다)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lottie: LottieModule | null = UIManager.hasViewManagerConfig('LottieAnimationView') ? require('lottie-react-native') as LottieModule : null;

// 낮 → 밤 색(web/map/sky_motion.mts NIGHT 와 같다)
const NIGHT: Record<string, string> = {
  '#f4f8fc': '#6d76a8', '#aab5c3': '#4b5382', '#8fa6c4': '#8a93c8',
  '#d6ecff': '#5b78c8', '#2b62b0': '#bfdcff', '#6f7b8c': '#3a4170',
  '#8fb4dc': '#9aa6e0',
  '#9fd4ff': '#ffe08a', '#ffffff': '#ffffff', '#fffbe0': '#c8d2ff',
};
const hexOf = (rgb: number[]) => `#${rgb.slice(0, 3).map((part) => Math.round(part * 255).toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (code: string) => [1, 3, 5].map((at) => Number((parseInt(code.slice(at, at + 2), 16) / 255).toFixed(4)));
const isJson = (node: unknown): node is Json => typeof node === 'object' && node !== null;

function nightColors(node: unknown) {
  if (Array.isArray(node)) { node.forEach(nightColors); return; }
  if (!isJson(node)) return;
  if ((node.ty === 'fl' || node.ty === 'st') && isJson(node.c)) {
    const color = node.c.k;
    if (Array.isArray(color) && color.length === 4 && typeof color[0] === 'number') {
      const next = NIGHT[hexOf(color as number[])];
      if (next) node.c.k = [...rgbOf(next), 1];
    }
  }
  Object.values(node).forEach(nightColors);
}

const cache = new Map<string, Promise<string | null>>();
function loadScene(name: string): Promise<string | null> {
  let pending = cache.get(name);
  if (!pending) {
    pending = fetch(`${MAP_ORIGIN}/brand/sky-${name}.json`).then((response) => (response.ok ? response.text() : null)).catch(() => null);
    cache.set(name, pending);
  }
  return pending;
}
function sceneFor(text: string, night: boolean): Json {
  const copy = JSON.parse(text) as Json;
  if (night) nightColors(copy);
  if (Array.isArray(copy.layers)) copy.layers.forEach((layer: unknown) => { if (isJson(layer) && layer.nm === 'lamp') layer.hd = !night; });
  return copy;
}

export function SkyScene({ name, night, speed, onShown }: { name: string; night: boolean; speed: number; onShown?(): void }) {
  const reduced = useReducedMotion();
  const [scene, setScene] = useState<{ key: string; data: Json } | null>(null);
  const key = `${name}|${night}`;
  useEffect(() => {
    if (!lottie) return undefined;
    let alive = true;
    loadScene(name).then((text) => {
      if (!alive || !text) return;
      setScene({ key, data: sceneFor(text, night) });
      onShown?.();
    }).catch(() => undefined);
    return () => { alive = false; };
    // onShown 은 받을 때 한 번만 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, name, night]);
  if (!lottie || scene?.key !== key) return null;
  const LottieView = lottie.default;
  return <LottieView source={scene.data as unknown as LottieSource} style={StyleSheet.absoluteFill} resizeMode="cover" loop autoPlay={!reduced} speed={speed} />;
}
