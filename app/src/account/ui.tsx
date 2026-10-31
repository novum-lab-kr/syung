// 회원 화면 공용 조각: 서랍 껍데기(웹 .settings-panel · .menu-head) · 아래에서 올라오는 시트(.login-sheet) · 프로필 얼굴 · 칸 제목.
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SERVER_ORIGIN } from '../config';
import { MAP_ORIGIN } from '../map/source';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { Avatar } from './api';
import { BackIcon, CloseIcon } from './icons';
import { sheet } from './literals';
import { closeMenu, menuUnder, setMenuAside } from './menuLink';
import { body, makeStyles, round } from './style';
import { readToken } from './token';

// 프로필 캐릭터(웹 web/user/account_view.tsx CHARACTERS 와 같은 차례 · 이름). 첫째(새싹)가 기본
export const CHARACTERS = [['sprout', '새싹 볼빵 후디'], ['builder', '꼬마 건설 반장'], ['seonbi', '갓 쓴 꼬마 선비'], ['visitor', '두근두근 나들이'],
  ['scv', '테란 SCV'], ['drone', '저그 드론'], ['probe', '프로토스 프로브']] as const;
export const PROVIDER_NAMES: Record<string, string> = { kakao: '카카오', google: '구글', apple: 'Apple' };

// 캐릭터 얼굴은 앱 묶음 안 지도(앱 안 http 서버 — 지도 화면과 같은 출처)의 brand/faces/ 그림
export const faceUrl = (id: string) => `${MAP_ORIGIN}/brand/faces/${id}-240.png`;

export const closeAll = () => { router.dismissTo('/'); };
export const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };

const CARD_MS = tokens.duration[260];   // .login-card transform(--ease-standard)
const SCRIM_MS = tokens.duration[220];   // .login-scrim opacity(CSS 기본 곡선 ease)
const CSS_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
const DRAWER_MS = tokens.duration[260];   // .settings-panel · .menu-scrim
const PAGE_MS = tokens.duration[220];   // .menu-in
const PAGE_FROM = 28;   // @keyframes menu-in
const [x1, y1, x2, y2] = tokens.ease.standard;
const STANDARD = Easing.bezier(x1, y1, x2, y2);
const reducedNow = () => AccessibilityInfo.isReduceMotionEnabled().catch(() => false);

// 나타나기 · 사라지기 0 → 1 → 0. 동작 줄이기면 움직임 없이 바로
function useAppear(duration: number, enabled: boolean, easing = STANDARD) {
  const [progress] = useState(() => new Animated.Value(enabled ? 0 : 1));
  const run = useCallback((toValue: number, done?: () => void) => {
    void reducedNow().then(reduced => {
      if (reduced) { progress.setValue(toValue); done?.(); return; }
      Animated.timing(progress, { toValue, duration, easing, useNativeDriver: true }).start(({ finished }) => { if (finished) done?.(); });
    });
  }, [duration, easing, progress]);
  return { progress, run };
}

const useStyles = makeStyles(theme => ({
  fill: { flex: 1 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: sheet.menuScrim },
  scrimClear: { backgroundColor: 'transparent' },   // 밑의 메뉴 가림막이 이미 어둡게 한다
  panel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, backgroundColor: theme.color.paper, boxShadow: sheet.panelShadow,
    borderTopLeftRadius: tokens.radius[18], borderBottomLeftRadius: tokens.radius[18],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], minHeight: 56, paddingTop: tokens.space[2], paddingRight: tokens.space[2], paddingBottom: tokens.space[1], paddingLeft: 18 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -10, borderRadius: tokens.radius[10] },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[10] },
  title: { ...round(theme, tokens.text[20]), flex: 1 },
  body: { paddingHorizontal: tokens.space[2] + 10, paddingTop: tokens.space[1] },
  // 웹 .settings-panel.with-map: 위 58% 는 지도, 아래 42% 시트(좌우 꽉 참). 칸 여백은 .menu-body 8 뿐이다
  mapPanel: { top: '58%', left: 0, borderTopLeftRadius: tokens.radius[18], borderTopRightRadius: tokens.radius[18], borderBottomLeftRadius: 0 },
  mapBody: { paddingHorizontal: tokens.space[2] },
  mapHead: { minHeight: 48, paddingTop: tokens.space[1], paddingBottom: tokens.space[1] },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: sheet.loginScrim },
  card: {
    paddingTop: tokens.space[3], paddingHorizontal: tokens.space[6], borderTopLeftRadius: tokens.radius[27], borderTopRightRadius: tokens.radius[27],
    backgroundColor: theme.color.paper, boxShadow: sheet.cardShadow, maxHeight: '92%',
  },
  grabStart: { alignSelf: 'flex-start' },   // .profile-sheet .login-card{align-items:stretch}
  grab: { alignSelf: 'center', width: 32, height: 4, borderRadius: tokens.radius[5], backgroundColor: theme.color.rule, marginBottom: 23 },
  section: { marginBottom: 14, padding: tokens.space[3], borderRadius: tokens.radius[18], backgroundColor: theme.color.control },
  sectionTitle: { ...body(theme, tokens.text[12], tokens.weight.bold, theme.color.muted), marginBottom: tokens.space[2] },
  message: { ...body(theme, tokens.text[13], tokens.weight.regular, theme.color.secondary), marginTop: tokens.space[3] },
  face: { backgroundColor: theme.color.control },
}));

// 웹 서랍 그대로: 오른쪽에 min(340, 86%) 폭 패널 + 나머지는 가림막(누르면 닫힘). foot 은 스크롤 밖 맨 아래(.rt-foot)
// 메뉴에서 열면 메뉴 패널과 같은 자리에 떠서 패널은 그대로이고 안쪽만 바뀐다(.menu-in). once: 위에 뜬 시트(프로필 수정)에서 돌아올 땐 움직이지 않는다
export function Screen({ title, children, onBack, foot, withMap, once, onPanelHeight }: { title: string; children: ReactNode; onBack?: () => void; foot?: ReactNode; withMap?: boolean; once?: boolean; onPanelHeight?: (height: number) => void }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const panelWidth = Math.min(sheet.panelWidth, width * sheet.panelShare);
  // 밑에 메뉴가 없이 회원 묶음의 첫 화면으로 열릴 때만 서랍이 들어온다(웹 .settings-panel)
  const [under] = useState(menuUnder);
  const [opening] = useState(() => !withMap && !under && navigation.getState()?.index === 0);
  const { progress, run } = useAppear(DRAWER_MS, opening);
  useEffect(() => { if (opening) run(1); }, [opening, run]);
  // 경로 선택은 패널이 지도와 함께 아래 절반으로 바뀌므로 밑의 메뉴 서랍을 비켜 둔다
  useEffect(() => {
    if (!withMap) return undefined;
    setMenuAside(true);
    return () => setMenuAside(false);
  }, [withMap]);
  // 안쪽 넘김(.menu-in): 들어올 때 · 안쪽 화면에서 돌아올 때 · 경로 선택을 오갈 때 — 웹은 쪽 안의 ‹ 도 menu-in 이다
  const [pageSlide] = useState(() => new Animated.Value(opening ? 1 : 0));
  const slidIn = useRef(opening);
  const slideIn = useCallback(() => {
    if (once && slidIn.current) return;
    slidIn.current = true;
    pageSlide.setValue(0);
    void reducedNow().then(reduced => {
      Animated.timing(pageSlide, { toValue: 1, duration: reduced ? 0 : PAGE_MS, easing: STANDARD, useNativeDriver: true }).start();
    });
  }, [once, pageSlide]);
  useFocusEffect(slideIn);
  const firstLook = useRef(true);
  useEffect(() => {
    if (firstLook.current) { firstLook.current = false; return; }
    slideIn();
  }, [withMap, slideIn]);
  // 닫기는 메뉴까지 전부(웹 settingsClose · 가림막) — 패널 둘이 같은 움직임으로 함께 나가 하나로 보인다
  const close = withMap ? () => { closeMenu(); closeAll(); } : () => { closeMenu(); run(0, closeAll); };
  const slide = withMap ? null : { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] }) }] };
  return (
    <View style={styles.fill}>
      {!withMap && <Animated.View style={[styles.scrim, under ? styles.scrimClear : null, { opacity: progress }]}><Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="닫기" /></Animated.View>}
      <Animated.View style={[styles.panel, withMap ? styles.mapPanel : { width: panelWidth, paddingTop: insets.top }, slide]} onLayout={onPanelHeight && (event => onPanelHeight(event.nativeEvent.layout.height))}>
        <View style={[styles.head, withMap && styles.mapHead]}>
          <Pressable onPress={onBack ?? goBack} hitSlop={4} accessibilityRole="button" accessibilityLabel="메뉴로 돌아가기" style={styles.back}><BackIcon color={theme.color.ink} /></Pressable>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
          <Pressable onPress={close} hitSlop={4} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}><CloseIcon color={theme.color.secondary} /></Pressable>
        </View>
        <Animated.View style={[styles.fill, { opacity: pageSlide, transform: [{ translateX: pageSlide.interpolate({ inputRange: [0, 1], outputRange: [PAGE_FROM, 0] }) }] }]}>
        <ScrollView style={styles.fill} contentContainerStyle={[styles.body, withMap && styles.mapBody, { paddingBottom: foot ? tokens.space[4] : tokens.space[4] + insets.bottom }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>{children}</ScrollView>
        {foot}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// 웹 .login-sheet: 가림막 + 아래에서 올라온 카드(손잡이). 로그인 · 프로필 수정이 같이 쓴다
// still: 화면 전환이 대신 움직이는 시트(프로필 수정 — 저장 중에는 닫지 않고 저장 뒤 스스로 닫는다)
export function BottomSheet({ children, onClose, grabStart, still = false }: { children: ReactNode; onClose(): void; grabStart?: boolean; still?: boolean }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { progress, run } = useAppear(CARD_MS, !still);
  const { progress: scrimOpacity, run: runScrim } = useAppear(SCRIM_MS, !still, CSS_EASE);
  const [height, setHeight] = useState(0);
  const measured = height > 0;
  useEffect(() => { if (measured && !still) { run(1); runScrim(1); } }, [measured, run, runScrim, still]);
  const rise = still ? null : { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height || 2000, 0] }) }] };
  return (
    <View style={styles.sheetWrap}>
      <Animated.View style={[styles.sheetScrim, { opacity: scrimOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (still) { onClose(); return; } runScrim(0); run(0, onClose); }} accessibilityLabel="닫기" />
      </Animated.View>
      <Animated.View accessibilityViewIsModal onLayout={event => setHeight(event.nativeEvent.layout.height)} style={[styles.card, { paddingBottom: tokens.space[7] + insets.bottom }, rise]}>
        <View style={[styles.grab, grabStart && styles.grabStart]} />
        {children}
      </Animated.View>
    </View>
  );
}

export const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  const styles = useStyles();
  return <View style={styles.section}><Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>{children}</View>;
};

// .account-msg 한 줄(불러오는 중 · 오류)
export const Message = ({ children }: { children: ReactNode }) => {
  const styles = useStyles();
  return <Text style={styles.message} accessibilityLiveRegion="polite">{children}</Text>;
};

// 올린 사진은 회원 주소라 토큰을 실어 받는다(토큰은 머리말에만 — 주소에 싣지 않는다)
function usePhotoToken(photo: boolean) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return;
    let alive = true;
    void readToken().then(value => { if (alive) setToken(value); });
    return () => { alive = false; };
  }, [photo]);
  return token;
}

// 프로필 그림: 캐릭터는 frame 안에 size 크기로, 사진은 꽉 채운다
export function AvatarFace({ avatar, size, frame = size, radius, background }: { avatar: Avatar | null | undefined; size: number; frame?: number; radius?: number; background?: string }) {
  const styles = useStyles();
  const photo = avatar?.type === 'photo';
  const token = usePhotoToken(photo);
  const characterId = avatar?.type === 'character' && CHARACTERS.some(([key]) => key === avatar.id) ? avatar.id : 'sprout';
  const box = { width: frame, height: frame, borderRadius: radius ?? frame / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...(background ? { backgroundColor: background } : null) } as const;
  if (photo) {
    return (
      <View style={[styles.face, box]}>
        {token ? <Image source={{ uri: `${SERVER_ORIGIN}${avatar.url}`, headers: { Authorization: `Bearer ${token}` } }} style={{ width: frame, height: frame }} accessibilityIgnoresInvertColors /> : null}
      </View>
    );
  }
  return <View style={[styles.face, box]}><Image source={{ uri: faceUrl(characterId) }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors /></View>;
}
