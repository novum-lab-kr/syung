// 머리줄: web/index.html .mast · 휴대폰 값(syung.css max-width:720px — 높이 52 · 로고 32 · 이름 22). "어디쯤이슝?" 은 웹도 휴대폰에서 숨긴다.
// 줌 배지 · 실시간 상태는 지도가 값을 알려 주는 다리(A6) 뒤에 더한다.
import { useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { MenuIcon, RefreshIcon } from './Icons';

const LOGO_ON_YELLOW = require('../../assets/syung-dark-180.png');
const LOGO_ON_DARK = require('../../assets/syung-light-180.png');

export function Header({ menuOpen, onRefresh, onMenu }: { menuOpen: boolean; onRefresh(): void; onMenu(): void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [spin] = useState(() => new Animated.Value(0));
  const dark = theme.name === 'dark';
  const ink = dark ? theme.color.syung : theme.color.syungInk;

  const refresh = () => {
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: tokens.duration[600], easing: Easing.linear, useNativeDriver: true }).start();
    setTimeout(onRefresh, 250);   // 웹과 같이 돌기 시작하고 0.25초 뒤 다시 연다
  };
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.mast, {
      paddingTop: insets.top, height: 52 + insets.top, paddingLeft: tokens.space[3] + insets.left, paddingRight: tokens.space[3] + insets.right,
      backgroundColor: dark ? theme.literal.mastDark : theme.color.syung,
      boxShadow: dark ? '0 2px 0 rgba(255,212,0,.35)' : '0 2px 0 rgba(20,20,20,.12)',
    }]}>
      <View style={styles.identity}>
        <Image source={dark ? LOGO_ON_DARK : LOGO_ON_YELLOW} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text style={[styles.title, { color: ink, fontFamily: theme.font.round }]} accessibilityRole="header" numberOfLines={1}>ㅅ슈슝~</Text>
      </View>
      <Pressable style={styles.button} onPress={refresh} accessibilityRole="button" accessibilityLabel="새로고침">
        <Animated.View style={{ transform: [{ rotate }] }}><RefreshIcon size={24} color={ink} /></Animated.View>
      </Pressable>
      <Pressable style={[styles.button, styles.menu]} onPress={onMenu} accessibilityRole="button" accessibilityLabel="설정 메뉴" accessibilityState={{ expanded: menuOpen }}>
        <MenuIcon size={24} color={ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  mast: { flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 13 },
  logo: { width: 32, height: 32, borderRadius: tokens.radius[10], boxShadow: '0 2px 0 rgba(20,20,20,.18)' },
  title: { fontSize: tokens.text[22], letterSpacing: 0.44 },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[10] },
  menu: { marginLeft: 4 },
});
