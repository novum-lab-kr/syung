// 메뉴 서랍: web/index.html #settingsPanel + 본체 setOpen · showPage + syung.css .settings-panel(오른쪽 폭 min(340, 86%) · 0.26초).
// 첫 단계 차례: 테마 칸 → 선 → 로그인(또는 내 정보 · 승차권) → 선 → 도시 모드 · 성능 · 배터리 · 데이터 출처(web/ui/settings_menu.tsx). 로그인 칸은 웹처럼 답이 오기 전 · 연결이 끊겼을 때는 숨긴다.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarFace } from '../../account/ui';
import { bootSession, useSession } from '../../account/session';
import type { PrefsState, SkyState, ThemeChoice, ThemeState } from '../../map/bridge';
import { tokens } from '../../theme/tokens';
import { useReducedMotion, useTheme } from '../../theme/useTheme';
import { BackIcon, ChevronIcon, CloseIcon, DeviceIcon, LoginGoIcon, SimcityIcon, SourcesIcon, TicketsIcon } from '../Icons';
import { Device } from './Device';
import { Modes } from './Modes';
import { Sources } from './Sources';
import { ThemePick } from './ThemePick';

type Page = 'modes' | 'device' | 'sources';
const TITLES: Record<Page, string> = { modes: '도시 모드', device: '성능 · 배터리', sources: '데이터 출처' };
const [x1, y1, x2, y2] = tokens.ease.standard;
const STANDARD = Easing.bezier(x1, y1, x2, y2);

interface Props {
  open: boolean; covered: boolean; aside: boolean; onClose(): void; wantedMode: string; onPickMode(mode: string): void; onAccount(): void; onTickets(): void;
  themeState: ThemeState | null; sky: SkyState | null; prefs: PrefsState | null; onTheme(choice: ThemeChoice): void; onPref(key: 'prebuild' | 'saver' | 'speed', value: boolean | number): void;
}

export function Menu({ open, covered, aside, onClose, wantedMode, onPickMode, onAccount, onTickets, themeState, sky, prefs, onTheme, onPref }: Props) {
  const theme = useTheme();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(340, screenWidth * 0.86);
  const [mounted, setMounted] = useState(open);
  const [page, setPage] = useState<Page | null>(null);
  const [progress] = useState(() => new Animated.Value(0));
  const [pageSlide] = useState(() => new Animated.Value(1));
  const [pageFrom, setPageFrom] = useState(28);
  const [lastOpen, setLastOpen] = useState(open);

  // 열릴 때마다 첫 단계부터 보인다
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setMounted(true); setPage(null); }
  }

  // 로그인 칸에 쓸 상태: 메뉴를 처음 열 때 받는다(내 정보 화면을 열기 전에는 아무도 안 받는다)
  const sessionLoading = session.status === 'loading';
  useEffect(() => { if (open && sessionLoading) void bootSession(); }, [open, sessionLoading]);

  useEffect(() => {
    Animated.timing(progress, { toValue: open ? 1 : 0, duration: reduced ? 0 : tokens.duration[260], easing: STANDARD, useNativeDriver: true })
      .start(({ finished }) => { if (finished && !open) setMounted(false); });
  }, [open, progress, reduced]);

  const go = (next: Page | null) => {
    setPageFrom(next ? 28 : -28);
    setPage(next);
    pageSlide.setValue(0);
    Animated.timing(pageSlide, { toValue: 1, duration: reduced ? 0 : tokens.duration[220], easing: STANDARD, useNativeDriver: true }).start();
  };

  // 안드로이드 뒤로: 쪽 → 첫 단계 → 닫기
  useEffect(() => {
    if (!open || covered) return undefined;   // 회원 화면이 위에 있으면 뒤로 키는 그 화면 차례
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page) go(null); else onClose();
      return true;
    });
    return () => subscription.remove();
    // go 는 받은 값 없이 같은 일을 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, covered, page, onClose]);

  // 회원 화면에서 돌아오면 패널은 그대로, 첫 단계만 왼쪽에서 밀려 온다(.menu-out)
  const [wasCovered, setWasCovered] = useState(covered);
  if (covered !== wasCovered) {
    setWasCovered(covered);
    if (!covered) setPageFrom(-28);
  }
  const coveredBefore = useRef(covered);
  useEffect(() => {
    const returned = coveredBefore.current && !covered;
    coveredBefore.current = covered;
    if (!returned || !open) return;
    pageSlide.setValue(0);
    Animated.timing(pageSlide, { toValue: 1, duration: reduced ? 0 : tokens.duration[220], easing: STANDARD, useNativeDriver: true }).start();
  }, [covered, open, pageSlide, reduced]);

  if (!mounted) return null;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] });
  const contentX = pageSlide.interpolate({ inputRange: [0, 1], outputRange: [pageFrom, 0] });

  const row = (name: string, icon: ReactNode, onPress: () => void) => (
    <Pressable key={name} onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.color.selected }]}>
      {icon}
      <Text numberOfLines={1} style={[styles.itemName, { color: theme.color.ink, fontFamily: theme.font.body }]}>{name}</Text>
      <ChevronIcon size={20} color={theme.color.muted} />
    </Pressable>
  );
  const icon = (drawing: ReactNode) => <View style={styles.itemIcon}>{drawing}</View>;
  const iconColor = theme.color.secondary;
  const rule = { borderTopColor: theme.color.rule };

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, aside && styles.aside]} pointerEvents={aside ? 'none' : 'auto'} accessibilityViewIsModal={!aside}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="메뉴 닫기" />
      </Animated.View>
      <Animated.View style={[styles.panel, {
        width, paddingTop: insets.top, paddingRight: insets.right, backgroundColor: theme.color.paper, transform: [{ translateX }],
        boxShadow: '-6px 0 24px rgba(20,20,20,.18)',
      }]}>
        <View style={styles.head}>
          {page ? (
            <Pressable style={styles.back} onPress={() => go(null)} accessibilityRole="button" accessibilityLabel="메뉴로 돌아가기">
              <BackIcon size={24} color={theme.color.ink} />
            </Pressable>
          ) : null}
          <Text style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.round }]} accessibilityRole="header">{page ? TITLES[page] : '메뉴'}</Text>
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="메뉴 닫기">
            <CloseIcon size={22} color={theme.color.secondary} />
          </Pressable>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: tokens.space[4] + insets.bottom }}>
          <Animated.View style={[styles.content, { opacity: pageSlide, transform: [{ translateX: contentX }] }]}>
            {page === 'modes' ? <Modes wanted={wantedMode} onPick={onPickMode} prefs={prefs} onSpeed={(speed) => onPref('speed', speed)} /> : null}
            {page === 'device' ? <Device prefs={prefs} onPref={onPref} /> : null}
            {page === 'sources' ? <Sources /> : null}
            {page === null ? (
              <View>
                <ThemePick sky={sky} state={themeState} onChoose={onTheme} />
                {session.status === 'out' ? (
                  <View style={[styles.section, rule]}>
                    <Pressable onPress={onAccount} accessibilityRole="button" accessibilityLabel="로그인" style={[styles.login, { backgroundColor: theme.color.control }]}>
                      <AvatarFace avatar={null} size={28} frame={38} background={theme.color.paper} />
                      <Text style={[styles.loginName, { color: theme.color.ink, fontFamily: theme.font.body }]}>로그인</Text>
                      <View style={[styles.loginGo, { backgroundColor: theme.color.syung, boxShadow: theme.shadow.knob }]}><LoginGoIcon size={20} color={theme.color.syungInk} /></View>
                    </Pressable>
                  </View>
                ) : null}
                {session.status === 'in' ? (
                  <View style={[styles.section, rule]}>
                    {row(session.me.name, <AvatarFace avatar={session.me.avatar} size={28} frame={32} radius={11} />, onAccount)}
                    {row('승차권', icon(<TicketsIcon size={18} color={iconColor} />), onTickets)}
                  </View>
                ) : null}
                <View style={[styles.section, rule]}>
                  {row(TITLES.modes, icon(<SimcityIcon size={18} color={iconColor} />), () => go('modes'))}
                  {row(TITLES.device, icon(<DeviceIcon size={18} color={iconColor} />), () => go('device'))}
                  {row(TITLES.sources, icon(<SourcesIcon size={18} color={iconColor} />), () => go('sources'))}
                </View>
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  aside: { opacity: 0 },   // 경로 선택(지도와 함께 보는 쪽)이 열린 동안
  root: { zIndex: 20 },   // 웹처럼 머리줄 · 검색칸까지 덮는다
  scrim: { backgroundColor: 'rgba(20,20,20,.32)' },
  panel: { position: 'absolute', top: 0, right: 0, bottom: 0, borderTopLeftRadius: tokens.radius[18], borderBottomLeftRadius: tokens.radius[18] },
  head: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], minHeight: 56, paddingTop: tokens.space[2], paddingRight: tokens.space[2], paddingBottom: tokens.space[1], paddingLeft: 18 },
  back: { width: 40, height: 40, marginLeft: -10, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[10] },
  title: { flex: 1, minWidth: 0, fontSize: tokens.text[20] },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[10] },
  body: { flex: 1, paddingHorizontal: tokens.space[2] },
  content: { paddingVertical: tokens.space[1] },
  section: { marginTop: tokens.space[2], paddingTop: tokens.space[2], borderTopWidth: 1 },
  login: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: tokens.space[1], minHeight: 52, paddingVertical: tokens.space[1], paddingLeft: tokens.space[2], paddingRight: tokens.space[1], borderRadius: tokens.radius.pill },
  loginName: { flex: 1, fontSize: tokens.text[16], fontWeight: tokens.weight.bold },
  loginGo: { width: 64, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.pill },
  item: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[3], minHeight: 56, paddingHorizontal: 10, borderRadius: tokens.radius[12] },
  itemIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  itemName: { flex: 1, minWidth: 0, fontSize: tokens.text[16], fontWeight: tokens.weight.semibold },
});
