// 아래 시트: web/ui/sheet.mts + syung.css .sheet. 손잡이를 끌어내리거나 눌러서 닫는다(✕ 는 웹도 숨긴다). 0.32초 미끄러짐.
// tall: .sheet:has(.journey) — 최대 72% + 키보드 위로 올리기. bleed: .sheet-body:has(.journey|.bus-rows) — 줄 눌림 배경이 좌우로 나가도 안 잘리게.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Animated, Easing, Keyboard, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { useReducedMotion, useTheme } from '../theme/useTheme';

const SLIDE_MS = 320;
const [x1, y1, x2, y2] = tokens.ease.sheet;
const SLIDE = Easing.bezier(x1, y1, x2, y2);

// 지금 열린 시트 높이를 받을 곳(닫히면 0) — 지도 화면이 다리 setPadding 으로 넘긴다
export const SheetHeightContext = createContext<(height: number) => void>(() => undefined);

interface SheetProps { onClose(): void; children?: ReactNode; tall?: boolean; bleed?: boolean }

export function Sheet({ onClose, children, tall = false, bleed = false }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);
  const [offset] = useState(() => new Animated.Value(2000));
  const shown = useRef(false);
  const area = useRef<ComponentRef<typeof View>>(null);
  const [areaHeight, setAreaHeight] = useState(0);
  const [lift, setLift] = useState(0);
  const [liftOffset] = useState(() => new Animated.Value(0));
  const reportHeight = useContext(SheetHeightContext);

  useEffect(() => { if (height) reportHeight(height); }, [height, reportHeight]);
  useEffect(() => () => reportHeight(0), [reportHeight]);

  // 키보드가 지도 영역 아래쪽을 가린 만큼만 올린다(창이 줄어드는 기기면 가린 만큼이 0 이라 두 번 올라가지 않는다).
  // 올리기도 네이티브 움직임으로 한다 — LayoutAnimation 을 같이 쓰면 시트가 펼쳐지는 중 키보드가 뜰 때 시트가 화면 밖에 남아 키보드에 가렸다(iOS 26 시뮬레이터 재현)
  useEffect(() => {
    if (!tall) return undefined;
    const move = (next: number, duration: number) => {
      setLift(next);
      Animated.timing(liftOffset, { toValue: -next, duration: reduced ? 0 : duration, easing: SLIDE, useNativeDriver: true }).start();
    };
    const showName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showName, (event) => {
      area.current?.measureInWindow((_x, y, _width, measured) => move(Math.max(0, y + measured - event.endCoordinates.screenY), event.duration));
    });
    const hide = Keyboard.addListener(hideName, (event) => move(0, event.duration));
    return () => { show.remove(); hide.remove(); };
  }, [liftOffset, reduced, tall]);

  const close = useCallback(() => {
    if (reduced) { onClose(); return; }
    Animated.timing(offset, { toValue: Math.max(height, 200) * 1.05, duration: SLIDE_MS, easing: SLIDE, useNativeDriver: true }).start(() => onClose());
  }, [height, offset, onClose, reduced]);

  useEffect(() => {
    if (!height || shown.current) return;
    shown.current = true;
    if (reduced) { offset.setValue(0); return; }
    offset.setValue(height * 1.05);
    Animated.timing(offset, { toValue: 0, duration: SLIDE_MS, easing: SLIDE, useNativeDriver: true }).start();
  }, [height, offset, reduced]);

  // 웹 손잡이 규칙: 멀리(120 또는 높이의 30%) 또는 빠르게(0.6 px/ms · 24 넘게) 끌면 닫기, 안 움직였으면 누름으로 닫기
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_event, gesture) => offset.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      const moved = gesture.dy > 4;
      const far = gesture.dy > Math.min(120, height * 0.3);
      const fast = gesture.vy > 0.6 && gesture.dy > 24;
      if (!moved || far || fast) { close(); return; }
      Animated.timing(offset, { toValue: 0, duration: SLIDE_MS, easing: SLIDE, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => { offset.setValue(0); },
  }), [close, height, offset]);

  // 올라갔을 때 시트 위쪽이 화면 밖으로 나가지 않게 남은 높이로 줄인다
  const heightLimit = lift > 0 ? { maxHeight: Math.min(areaHeight * 0.72, areaHeight - lift - tokens.space[2]) } : null;
  return (
    <>
      <View ref={area} style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(event) => setAreaHeight(event.nativeEvent.layout.height)} />
      <Animated.View onLayout={(event) => setHeight(event.nativeEvent.layout.height)} accessibilityLabel="상세 정보"
        style={[styles.sheet, tall && styles.tall, heightLimit, {
          paddingBottom: lift > 0 ? 18 : 18 + insets.bottom, backgroundColor: theme.color.paper, transform: [{ translateY: Animated.add(offset, liftOffset) }],
          boxShadow: theme.name === 'dark' ? '0 -10px 30px rgba(0,0,0,.5)' : '0 -10px 30px rgba(40,35,0,.18)',
        }]}>
        <View {...pan.panHandlers} style={styles.grab} accessible accessibilityRole="button" accessibilityLabel="닫기" onAccessibilityTap={close}>
          <View style={[styles.bar, { backgroundColor: theme.color.rule }]} />
        </View>
        <ScrollView style={[styles.body, bleed && styles.bleed]} contentContainerStyle={bleed ? styles.bleedContent : undefined}
          bounces={false} keyboardShouldPersistTaps={tall ? 'handled' : 'never'}>
          {children}
        </ScrollView>
      </Animated.View>
    </>
  );
}

// 시트 큰 단추(.st-journey button): 높이 46 · 알약 · 둥근 글꼴 16
export function SheetButton({ label, onPress, primary }: { label: string; onPress(): void; primary?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.button, { backgroundColor: primary ? theme.color.syung : theme.color.control, opacity: pressed ? 0.8 : 1 }]}>
      <Text style={[styles.buttonText, { color: primary ? theme.color.syungInk : theme.color.ink, fontFamily: theme.font.round }]}>{label}</Text>
    </Pressable>
  );
}

// 끌어서 놓은 뒤 다시 따라가기(.sheet-follow): 높이 42 · 알약 · 시트 맨 아래
export function FollowButton({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.follow, { backgroundColor: theme.color.syung, boxShadow: theme.shadow.edge }]}>
      <Text style={[styles.buttonText, { color: theme.color.syungInk, fontFamily: theme.font.round }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', zIndex: 20, left: 0, right: 0, bottom: 0, maxHeight: '62%', paddingTop: 10, paddingHorizontal: tokens.space[5],
    borderTopLeftRadius: tokens.radius[22], borderTopRightRadius: tokens.radius[22],
  },
  tall: { maxHeight: '72%' },
  bleed: { marginHorizontal: -tokens.space[3] },
  bleedContent: { paddingHorizontal: tokens.space[3] },
  grab: { height: 26, marginTop: -10, marginHorizontal: -tokens.space[5], marginBottom: 2 },
  bar: { position: 'absolute', alignSelf: 'center', top: 10, width: 40, height: 5, borderRadius: 3 },
  body: { flexGrow: 0, flexShrink: 1 },
  button: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.pill },
  follow: { marginTop: tokens.space[3], height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.pill },
  buttonText: { fontSize: tokens.text[16] },
});
