// 로그인 칸 로고 움직임(web/user/account.mts playLogoMotion): 새싹 캐릭터가 뛰어와 로고 열차에 올라타고 글자가 날아가며 출발 → 잎만 남은 채 달린다.
// 앞부분은 한 번, 그 뒤 달리는 구간(JSON markers 'loop')만 화면을 닫을 때까지 되풀이한다. 되풀이 표시가 없는 자료면 한 번 재생하고 정지 로고로 바꿔 낀다.
// 캔버스(800×170)의 로고 칸 가운데(400, 135)를 실제 로고 가운데에 맞춰 얹는다. 동작 줄이기 · 받기 실패면 정지 로고 그대로.
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, StyleSheet, UIManager, View } from 'react-native';
import { MAP_ORIGIN } from '../map/source';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { BrandLogo } from './icons';
import { sheet } from './literals';

type LottieModule = typeof import('lottie-react-native');
type LottieSource = import('lottie-react-native').AnimationObject;
type Json = Record<string, unknown>;

// lottie 네이티브가 없는 빌드에서도 로그인 칸이 깨지지 않게 있을 때만 부른다(components/menu/SkyScene.tsx 와 같다)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lottie: LottieModule | null = UIManager.hasViewManagerConfig('LottieAnimationView') ? require('lottie-react-native') as LottieModule : null;

const LOGO_SIZE = 47;
const MOTION = { width: 800, height: 170, slotX: 400, slotY: 135, wait: 220 };   // wait: 카드가 올라오는 동안 기다렸다 재생
// syung.css .login-motion: 바람 · 먼지는 테마 --muted, 날아가는 글자는 테마 --ink
const LAYER_COLOR = new Map<unknown, 'muted' | 'ink'>([['lm-wind', 'muted'], ['lm-dust', 'muted'], ['lm-word', 'ink']]);

const isJson = (node: unknown): node is Json => typeof node === 'object' && node !== null;
const rgbOf = (code: string) => [1, 3, 5].map(at => parseInt(code.slice(at, at + 2), 16) / 255);

function paint(node: unknown, rgb: number[]) {
  if (Array.isArray(node)) { node.forEach(child => paint(child, rgb)); return; }
  if (!isJson(node)) return;
  if ((node.ty === 'fl' || node.ty === 'st') && isJson(node.c)) node.c.k = [...rgb, 1];
  Object.values(node).forEach(child => paint(child, rgb));
}
function sceneFor(text: string, colors: { muted: string; ink: string }): Json {
  const copy = JSON.parse(text) as Json;
  if (Array.isArray(copy.layers)) copy.layers.forEach((layer: unknown) => {
    if (!isJson(layer)) return;
    const color = LAYER_COLOR.get(layer.cl);
    if (color) paint(layer.shapes, rgbOf(colors[color]));
  });
  return copy;
}
// 되풀이 구간(markers 의 'loop' — tm 시작 · dr 길이). 끝 프레임의 그림 = 시작 프레임의 그림이라 이음새가 없다
function loopRangeOf(scene: Json): { start: number; end: number } | null {
  if (!Array.isArray(scene.markers)) return null;
  const marker: unknown = scene.markers.find((item: unknown) => isJson(item) && item.cm === 'loop');
  if (!isJson(marker) || typeof marker.tm !== 'number' || typeof marker.dr !== 'number') return null;
  return { start: marker.tm, end: marker.tm + marker.dr };
}

// 받은 글만 기억한다 — 실패는 다음에 열 때 다시 받는다(웹과 같다)
let motionText: string | null = null;
async function loadMotion(): Promise<string | null> {
  if (motionText) return motionText;
  const response = await fetch(`${MAP_ORIGIN}/brand/login-motion-loop.json`);
  if (!response.ok) return null;
  motionText = await response.text();
  return motionText;
}

export function LoginLogo() {
  const theme = useTheme();
  const [text, setText] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const player = useRef<ComponentRef<LottieModule['default']>>(null);
  const [looping, setLooping] = useState(false);   // 앞부분을 다 돌았다 — 이제 되풀이 구간만
  const { muted, ink } = theme.color;
  const scene = useMemo(() => (text ? sceneFor(text, { muted, ink }) : null), [text, muted, ink]);
  const loopRange = useMemo(() => (scene ? loopRangeOf(scene) : null), [scene]);

  useEffect(() => {
    if (!lottie) return undefined;
    let alive = true;
    void (async () => {
      if (await AccessibilityInfo.isReduceMotionEnabled()) return;
      const loaded = await loadMotion();
      if (alive && loaded) setText(loaded);
    })().catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const showing = lottie !== null && scene !== null;
  useEffect(() => {
    if (!showing) return undefined;
    // 테마가 바뀌면 자료가 새로 깔려 멈추므로 scene 이 바뀌어도 다시 재생한다
    const timer = setTimeout(() => {
      if (looping && loopRange) player.current?.play(loopRange.start, loopRange.end);
      else player.current?.play();
    }, Math.max(0, MOTION.wait - (Date.now() - openedAt)));
    return () => clearTimeout(timer);
  }, [openedAt, showing, scene, looping, loopRange]);

  const LottieView = lottie?.default;
  return (
    <View style={styles.slot}>
      <View style={[styles.logo, showing && styles.hidden]}><BrandLogo /></View>
      {showing && LottieView && (
        <View style={styles.motion} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <LottieView ref={player} source={scene as unknown as LottieSource} style={styles.canvas} loop={looping} autoPlay={false}
            onAnimationFinish={cancelled => {
              if (cancelled) return;
              if (loopRange) setLooping(true);
              else setText(null);
            }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { width: LOGO_SIZE, height: LOGO_SIZE, marginBottom: 14, zIndex: 1 },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: tokens.radius[15], boxShadow: sheet.brandShadow },
  hidden: { opacity: 0 },
  motion: { position: 'absolute', left: LOGO_SIZE / 2 - MOTION.slotX, top: LOGO_SIZE / 2 - MOTION.slotY, width: MOTION.width, height: MOTION.height },
  canvas: { width: MOTION.width, height: MOTION.height },
});
