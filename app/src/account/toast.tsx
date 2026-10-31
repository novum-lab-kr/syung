// 토스트(웹 account.mts toast · syung.css .acct-toast — 흰 카드 + 노란 테두리 + 속도선, 경고는 빨강). 모듈 저장소라 어디서나 showToast, 그리는 곳은 회원 화면 레이아웃 하나. 누르면 닫힌다.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { useReducedMotion, useTheme } from '../theme/useTheme';
import { sheet, toastLook } from './literals';
import { body, makeStyles } from './style';

interface ToastState { text: string; error: boolean; turn: number }
let toast: ToastState | null = null;
let turn = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function showToast(text: string, error = false) {
  turn += 1;
  toast = { text, error, turn };
  emit();
}
const close = () => { toast = null; emit(); };

const SHOW_MS = 2600;

const useStyles = makeStyles(theme => ({
  wrap: { position: 'absolute', left: tokens.space[4], right: tokens.space[4], zIndex: 30 },   // 메뉴 서랍(20) 위
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.space[3], paddingVertical: tokens.space[3], paddingHorizontal: tokens.space[4], borderWidth: 2, borderColor: toastLook.edge,
    borderRadius: tokens.radius[16], backgroundColor: theme.color.paper, boxShadow: theme.name === 'dark' ? toastLook.darkShadow : toastLook.shadow,
  },
  error: { borderColor: toastLook.errorEdge },
  speed: { alignItems: 'flex-end', gap: 3 },
  line: { height: 3, borderRadius: tokens.radius[2], backgroundColor: toastLook.edge },
  long: { width: 16 },
  short: { width: 9 },
  lineError: { backgroundColor: toastLook.errorSpeed },
  text: { ...body(theme, tokens.text['14.5'], tokens.weight.bold, theme.name === 'dark' ? theme.color.ink : toastLook.ink), flex: 1, lineHeight: tokens.text['14.5'] * 1.4 },
  textError: { color: theme.color.ink },
}));

// inPanel: 서랍이 떠 있을 때 — 웹처럼 서랍 폭 안에서 좌우 16(#accountToast 는 .settings-panel 안)
export function Toast({ inPanel = false }: { inPanel?: boolean }) {
  const { width } = useWindowDimensions();
  const current = useSyncExternalStore(subscribe, () => toast);
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  useTheme();
  const reduced = useReducedMotion();
  const [pop] = useState(() => new Animated.Value(1));
  const shown = current?.turn;
  useEffect(() => {
    if (shown === undefined) return;
    if (!reduced) {
      pop.setValue(0);
      Animated.timing(pop, { toValue: 1, duration: 420, easing: Easing.bezier(0.2, 0.9, 0.3, 1.2), useNativeDriver: true }).start();
    }
    const timer = setTimeout(() => { if (toast?.turn === shown) close(); }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown, reduced, pop]);
  if (!current) return null;
  const motion = { opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] };
  return (
    <View pointerEvents="box-none" style={[styles.wrap, inPanel && { left: width - Math.min(sheet.panelWidth, width * sheet.panelShare) + tokens.space[4] }, { bottom: tokens.space[4] + insets.bottom }]}>
      <Animated.View style={motion}>
        <Pressable onPress={close} accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.toast, current.error && styles.error]}>
          <View style={styles.speed}>
            <View style={[styles.line, styles.long, current.error && styles.lineError]} />
            <View style={[styles.line, styles.short, current.error && styles.lineError]} />
          </View>
          <Text style={[styles.text, current.error && styles.textError]}>{current.text}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
