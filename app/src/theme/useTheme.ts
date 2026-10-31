// 라이트/다크 고르기: 지도가 알려 준 값(다리 ready · themeChanged)이 먼저, 그 전에는 웹 첫 그림(web/index.html 첫 스크립트)의 자동 공식.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { tokens, webLiterals } from './tokens';
import { fonts } from './fonts';

export type ThemeName = 'light' | 'dark';

// 서울 시각 · 달로 낮이면 light
export function themeAt(now: Date): ThemeName {
  const hour = (now.getUTCHours() + 9 + now.getUTCMinutes() / 60) % 24;
  const season = Math.cos(((now.getUTCMonth() + 1 - 6.5) / 6) * Math.PI);
  const sunrise = 6.45 - 1.3 * season;
  const sunset = 18.3 + 1.4 * season;
  return hour >= sunrise && hour < sunset ? 'light' : 'dark';
}

function themeOf(name: ThemeName) {
  return { name, color: tokens.color[name], shadow: tokens.shadow[name], literal: webLiterals, font: fonts };
}
export type Theme = ReturnType<typeof themeOf>;

// 지도가 알려 준 테마 하나를 모든 화면이 같이 본다
let mapTheme: ThemeName | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setMapTheme(name: ThemeName) {
  if (name === mapTheme) return;
  mapTheme = name;
  listeners.forEach((listener) => listener());
}

export function useTheme(): Theme {
  const fromMap = useSyncExternalStore(subscribe, () => mapTheme);
  const [name, setName] = useState<ThemeName>(() => themeAt(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setName(themeAt(new Date())), 60000);
    return () => clearInterval(timer);
  }, []);
  return themeOf(fromMap ?? name);
}

// 움직임 줄이기 설정(웹 prefers-reduced-motion 자리) — 켜져 있으면 미끄러짐 없이 바로 보인다
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; subscription.remove(); };
  }, []);
  return reduced;
}
