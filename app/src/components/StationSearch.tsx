// 역 검색: web/ui/search.mts + syung.css .map-search · .search-list. 입력 뒤 0.12초에 찾고, 고르면 부모가 지도를 옮기고 역 시트를 연다.
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type TextInputInstance } from 'react-native';
import { loadStations, searchStations } from '../data/stations';
import type { StationInfo } from '../map/bridge';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { SearchIcon } from './Icons';

const focusColor = (focused: boolean, color: string) => (focused ? color : 'transparent');

export function StationSearch({ onPick }: { onPick(station: StationInfo): void }) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const input = useRef<TextInputInstance>(null);
  const stations = useRef<StationInfo[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [text, setText] = useState('');
  const [hits, setHits] = useState<StationInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const dark = theme.name === 'dark';
  const focusBorder = focusColor(focused, dark ? theme.color.syung : theme.color.syungDeep);

  useEffect(() => {
    loadStations().then((list) => { stations.current = list; }).catch((error: unknown) => console.warn('역 목록을 못 읽었다', error));
    return () => clearTimeout(timer.current);
  }, []);

  const change = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!value.trim().replace(/역$/, '')) { setHits([]); setOpen(false); return; }
      setHits(searchStations(stations.current, value));
      setOpen(true);
    }, 120);
  };
  const pick = (station: StationInfo | undefined) => {
    if (!station) return;
    setOpen(false); setText(station.name); input.current?.blur();
    onPick(station);
  };

  return (
    <View style={styles.wrap}>
      <TextInput ref={input} value={text} onChangeText={change} placeholder="어느 역으로 슝?" placeholderTextColor={theme.literal.placeholder}
        accessibilityLabel="역 검색" returnKeyType="search" autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing"
        onSubmitEditing={() => pick(hits[0])}
        onFocus={() => { setFocused(true); if (text.trim() && hits.length) setOpen(true); }}
        onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 150); }}
        style={[styles.input, {
          color: theme.color.ink, backgroundColor: theme.color.paper, fontFamily: theme.font.body, boxShadow: focused ? `0 0 0 4px rgba(255,212,0,${dark ? '.2' : '.35'})` : theme.shadow.DEFAULT,
          borderColor: focusBorder,
        }]} />
      <View style={styles.icon} pointerEvents="none"><SearchIcon size={18} color={theme.color.muted} /></View>
      {open ? (
        <ScrollView keyboardShouldPersistTaps="handled" accessibilityLabel="역 검색 결과"
          style={[styles.list, { backgroundColor: theme.color.paper, boxShadow: theme.shadow.DEFAULT, maxHeight: Math.min(360, height * 0.55) }]}>
          {hits.length ? hits.map((station) => (
            <Pressable key={station.id} onPress={() => pick(station)} accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.color.control }]}>
              <Text style={[styles.name, { color: theme.color.ink, fontFamily: theme.font.body }]} numberOfLines={1}>{station.name}</Text>
              <View style={styles.chips}>
                {station.lines.map((line) => (
                  <Text key={line} style={[styles.chip, { backgroundColor: theme.literal.lineFallback, color: theme.literal.chipInk, fontFamily: theme.font.body }]}>{line}</Text>
                ))}
              </View>
            </Pressable>
          )) : <View style={styles.row}><Text style={[styles.empty, { color: theme.color.muted, fontFamily: theme.font.body }]}>찾는 역이 없어요</Text></View>}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 6, top: 10, left: 10, right: 10 },
  input: { height: 44, borderWidth: 2, borderRadius: tokens.radius.pill, paddingLeft: 42, paddingRight: tokens.space[3], fontSize: tokens.text[16] },
  icon: { position: 'absolute', left: 15, top: 13 },
  list: { position: 'absolute', top: 50, left: 0, right: 0, padding: 6, borderRadius: tokens.radius[18] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48, paddingVertical: 6, paddingHorizontal: tokens.space[3], borderRadius: tokens.radius[12] },
  name: { fontSize: tokens.text[16], fontWeight: tokens.weight.bold },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: tokens.space[1] },
  chip: { fontSize: tokens.text[11], fontWeight: tokens.weight.bold, paddingVertical: 2, paddingHorizontal: tokens.space[2], borderRadius: tokens.radius.pill, overflow: 'hidden' },
  empty: { fontSize: tokens.text[14] },
});
