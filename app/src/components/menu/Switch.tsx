// 메뉴 스위치 한 줄: web/ui/settings_menu.tsx Switch · DeviceSwitch + syung.css .setting-switch(높이 48 · plain) · .setting-modes(높이 56 · 켜지면 selected 바탕) · .switch(44×26).
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export function Switch({ name, description, icon, pressed, onPress, plain = false }: { name: string; description: string; icon: ReactNode; pressed: boolean; onPress(): void; plain?: boolean }) {
  const theme = useTheme();
  const [knob] = useState(() => new Animated.Value(pressed ? 18 : 0));
  useEffect(() => {
    Animated.timing(knob, { toValue: pressed ? 18 : 0, duration: tokens.duration[200], useNativeDriver: true }).start();
  }, [knob, pressed]);
  const offTrack = theme.name === 'dark' ? theme.literal.switchOffDark : theme.color.rule;
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: pressed }} accessibilityLabel={name} accessibilityHint={description}
      style={({ pressed: touching }) => (plain ? styles.plainRow : [styles.row, pressed && { backgroundColor: theme.color.selected }, touching && styles.touching])}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.names}>
        <Text style={[styles.name, { color: theme.color.ink, fontFamily: theme.font.body }]}>{name}</Text>
        <Text style={[plain ? styles.plainDescription : styles.description, { color: plain ? theme.color.muted : theme.color.secondary, fontFamily: theme.font.body }]}>{description}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: pressed ? theme.color.syung : offTrack }]}>
        <Animated.View style={[styles.knob, { backgroundColor: theme.literal.knob, transform: [{ translateX: knob }] }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 10, paddingVertical: tokens.space[2], borderRadius: tokens.radius[12] },
  plainRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 10, borderRadius: tokens.radius[12] },
  plainDescription: { marginTop: 1, fontSize: tokens.text[11], fontWeight: tokens.weight.medium },
  touching: { transform: [{ scale: 0.99 }] },
  icon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  names: { flex: 1, minWidth: 0 },
  name: { fontSize: tokens.text[14], fontWeight: tokens.weight.semibold },
  description: { marginTop: 1, fontSize: tokens.text[12], lineHeight: 18, fontWeight: tokens.weight.medium },
  track: { width: 44, height: 26, borderRadius: tokens.radius.pill },
  knob: { position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.3)' },
});
