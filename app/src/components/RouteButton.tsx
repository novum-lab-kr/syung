// "어디로 갈까요?": syung.css .route-cta(아래 16 + 안전 영역 · 폭 min(360, 100%-132) · 높이 52).
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { RouteIcon } from './Icons';

export function RouteButton({ onPress }: { onPress(): void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const buttonWidth = Math.min(360, width - 132);
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.button, {
        bottom: tokens.space[4] + insets.bottom, width: buttonWidth, left: (width - buttonWidth) / 2, backgroundColor: theme.color.syung,
        boxShadow: theme.name === 'dark' ? '0 3px 0 rgba(0,0,0,.4),0 10px 24px rgba(0,0,0,.45)' : '0 3px 0 rgba(20,20,20,.18),0 10px 24px rgba(60,50,0,.22)',
        transform: [{ scale: pressed ? 0.97 : 1 }],
      }]}>
      <RouteIcon size={22} color={theme.color.syungInk} />
      <Text style={[styles.label, { color: theme.color.syungInk, fontFamily: theme.font.round }]} numberOfLines={1}>어디로 갈까요?</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { position: 'absolute', zIndex: 8, height: 52, paddingHorizontal: tokens.space[5], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.space[2], borderRadius: tokens.radius.pill },
  label: { fontSize: tokens.text[18] },
});
