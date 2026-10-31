// 롤코 탑승 중 위쪽 띠(.ride-bar): 지도가 rideChanged 로 1초마다 보내는 글을 그대로 보이고, '내리기' 를 누르면 내린다.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { sheetColors } from './webColors';

const BAR_BACKGROUND = 'rgba(20,20,20,.86)';   // .ride-bar — 테마와 상관없이 같은 색

export function RideBar({ text, color, onLeave }: { text: string; color: string | undefined; onLeave(): void }) {
  const theme = useTheme();
  return (
    <View accessibilityRole="summary" style={[styles.bar, { boxShadow: theme.shadow.DEFAULT }]}>
      <View style={[styles.dot, { backgroundColor: color ?? theme.literal.lineFallback }]} />
      <Text numberOfLines={1} style={[styles.text, { fontFamily: theme.font.body }]}>{text}</Text>
      <Pressable onPress={onLeave} accessibilityRole="button" style={[styles.off, { backgroundColor: theme.color.syung }]}>
        <Text style={[styles.offText, { color: theme.color.syungInk, fontFamily: theme.font.round }]}>내리기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', zIndex: 21, top: tokens.space[3], alignSelf: 'center', maxWidth: '94%', flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], paddingVertical: 5, paddingRight: 5, paddingLeft: tokens.space[3], borderRadius: tokens.radius.pill, backgroundColor: BAR_BACKGROUND },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  text: { flexShrink: 1, color: sheetColors.onColor, fontSize: tokens.text[13], fontWeight: tokens.weight.semibold },
  off: { height: 32, paddingHorizontal: 14, justifyContent: 'center', borderRadius: tokens.radius.pill },
  offText: { fontSize: tokens.text[14] },
});
