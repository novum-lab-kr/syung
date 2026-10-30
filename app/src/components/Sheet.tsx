// 지도 위 아래 시트(간단한 판). 역 · 열차를 누르면 연다 — 1단계 시제품이라 끌어 올리기 · 내리기 없이 열고 닫기만.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  title: string;
  subtitle?: string;
  onClose(): void;
  children?: ReactNode;
}

export function Sheet({ title, subtitle, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal>
      <View style={styles.head}>
        <View style={styles.titles}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

export function SheetButton({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export const sheetStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  line: { fontSize: 14, color: '#3d4148', marginTop: 4 },
});

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 16, paddingHorizontal: 20,
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  titles: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', color: '#141414' },
  subtitle: { fontSize: 14, color: '#5d6168', marginTop: 2 },
  close: { padding: 4 },
  closeText: { fontSize: 18, color: '#5d6168' },
  button: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#eef0f3' },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#141414' },
});
