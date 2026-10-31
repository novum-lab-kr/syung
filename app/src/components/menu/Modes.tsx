// 도시 모드 쪽: web/ui/settings_menu.tsx Modes(줄 차례 · 문구 그대로) + 본체 모드 고르기 규칙(한 번에 하나 · 끄면 기본 · 마지막 종족/나라 기억).
// 받는 중에 다시 누르면 웹은 취소, 앱은 지금 다리에 취소가 없어 setMode basic 을 보낸다.
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import type { PrefsState } from '../../map/bridge';
import { CoasterIcon, JoseonIcon, NationIcon, RetroIcon, SimcityIcon, SpeedIcon, StarcraftIcon } from '../Icons';
import { Switch } from './Switch';

const RACES = [['terran', '테란'], ['zerg', '저그'], ['protoss', '프로토스']] as const;
const SPEEDS = [['1', '1배'], ['5', '5배'], ['20', '20배']] as const;
const NATIONS = [['greece', '그리스'], ['netherlands', '네덜란드'], ['paris', '파리'], ['egypt', '이집트']] as const;
// 세계 여행은 메뉴에서 뺐다(사용자 결정 2026-10-31). 코드는 두고 줄만 안 그린다 — 모드는 저장되지 않고 지도는 늘 기본으로 시작해 앱에서 켜질 길이 없다
const SHOW_NATIONS: boolean = false;
const includes = (list: readonly (readonly [string, string])[], mode: string) => list.some(([id]) => id === mode);

function Segments({ label, note, icon, items, want, onPick }: { label: string; note?: string; icon?: ReactNode; items: readonly (readonly [string, string])[]; want: string; onPick(id: string): void }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowNames}>
        <Text style={[styles.rowName, { color: theme.color.ink, fontFamily: theme.font.body }]}>{label}</Text>
        {note ? <Text style={[styles.rowNote, { color: theme.color.secondary, fontFamily: theme.font.body }]}>{note}</Text> : null}
      </View>
      <View style={[styles.segments, { backgroundColor: theme.color.control }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {items.map(([id, text]) => (
          <Pressable key={id} onPress={() => onPick(id)} accessibilityRole="radio" accessibilityState={{ selected: want === id }}
            style={[styles.segment, want === id && { backgroundColor: theme.color.syung }]}>
            <Text style={[styles.segmentText, { color: want === id ? theme.color.syungInk : theme.color.secondary, fontFamily: theme.font.body }]}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Modes({ wanted, onPick, prefs, onSpeed }: { wanted: string; onPick(mode: string): void; prefs: PrefsState | null; onSpeed(speed: number): void }) {
  const theme = useTheme();
  const lastRace = useRef<string>(RACES[0][0]);
  const lastNation = useRef<string>(NATIONS[0][0]);
  useEffect(() => {
    if (includes(RACES, wanted)) lastRace.current = wanted;
    if (includes(NATIONS, wanted)) lastNation.current = wanted;
  }, [wanted]);
  const iconColor = theme.color.secondary;
  const toggle = (on: boolean, mode: string) => onPick(on ? 'basic' : mode);
  const raceOn = includes(RACES, wanted), nationOn = includes(NATIONS, wanted);

  return (
    <View>
      <Switch name="심시티" description="작은 서울을 거닐어요" icon={<SimcityIcon size={18} color={iconColor} />} pressed={wanted === 'simcity'} onPress={() => toggle(wanted === 'simcity', 'simcity')} />
      <Switch name="조선" description="한양 기와집 사이를 거닐어요" icon={<JoseonIcon size={18} color={iconColor} />} pressed={wanted === 'joseon'} onPress={() => toggle(wanted === 'joseon', 'joseon')} />
      <Switch name="스타크래프트" description="종족을 골라 서울을 거닐어요" icon={<StarcraftIcon size={18} color={iconColor} />} pressed={raceOn} onPress={() => toggle(raceOn, lastRace.current)} />
      {raceOn ? <Segments label="종족" items={RACES} want={wanted} onPick={onPick} /> : null}
      <Switch name="레트로" description="도트 게임 속 서울을 거닐어요" icon={<RetroIcon size={18} color={iconColor} />} pressed={wanted === 'retro'} onPress={() => toggle(wanted === 'retro', 'retro')} />
      {SHOW_NATIONS ? <Switch name="세계 여행" description="서울을 다른 나라 풍으로 거닐어요" icon={<NationIcon size={18} color={iconColor} />} pressed={nationOn} onPress={() => toggle(nationOn, lastNation.current)} /> : null}
      {SHOW_NATIONS && nationOn ? <Segments label="나라" items={NATIONS} want={wanted} onPick={onPick} /> : null}
      <Switch name="롤러코스터" description="도시 위를 달려요" icon={<CoasterIcon size={18} color={iconColor} />} pressed={wanted === 'coaster'} onPress={() => toggle(wanted === 'coaster', 'coaster')} />
      {wanted === 'coaster' ? <Segments label="열차 속도" note={prefs?.speedNote} icon={<SpeedIcon size={18} color={iconColor} />} items={SPEEDS} want={String(prefs?.speed ?? '')} onPick={(id) => onSpeed(Number(id))} /> : null}
      <Text style={[styles.help, { color: theme.color.secondary, fontFamily: theme.font.body }]}>{'한 번에 하나만 켤 수 있어요.\n모두 끄면 기본 지도예요.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 10 },
  rowIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  rowNames: { flex: 1, minWidth: 0 },
  rowNote: { fontSize: tokens.text[12], lineHeight: 18 },
  rowName: { fontSize: tokens.text[14], fontWeight: tokens.weight.semibold },
  segments: { flexDirection: 'row', padding: 3, borderRadius: tokens.radius.pill },
  segment: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: tokens.radius.pill },
  segmentText: { fontSize: tokens.text[12], fontWeight: tokens.weight.bold },
  help: { marginTop: tokens.space[2], marginHorizontal: 10, marginBottom: tokens.space[1], fontSize: tokens.text[12], lineHeight: 19.2 },
});
