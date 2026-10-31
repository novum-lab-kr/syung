// 시트를 닫은 뒤 남는 경로 막대(.jbar): 전체를 누르면 결과를 다시 열고, 오른쪽 위 ✕ 는 경로를 지운다. 웹 sheetClosed() 의 글자 · 띠 폭(240) 그대로.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { CloseIcon } from './icons';
import { Track } from './RouteParts';
import { durationParts, trackParts, type Plan } from './routeView';
import type { LineColors } from './types';

interface Props { plan: Plan; colors: LineColors; onOpen(): void; onClear(): void }

const BAR_MAX_WIDTH = 560;
const BOTTOM_NARROW = 22;   // 좁은 화면: 맨 아래 출처 위로(@media max-width:780px)

export function JourneyBar({ plan, colors, onOpen, onClear }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const duration = durationParts(plan.minutes);
  const unit = <Text style={styles.unit}>분</Text>;
  return (
    <View style={[styles.bar, { bottom: BOTTOM_NARROW + insets.bottom, backgroundColor: theme.color.paper, boxShadow: theme.shadow.DEFAULT }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="경로 결과 다시 보기" onPress={onOpen} style={styles.open}>
        <View style={styles.top}>
          <Text style={[styles.minutes, { color: theme.color.ink, fontFamily: theme.font.round }]}>
            {duration.hours !== null ? <>{duration.hours}<Text style={styles.unit}>시간</Text>{` ${duration.minutes}`}{unit}</> : <>{duration.minutes}{unit}</>}
          </Text>
          <Text style={[styles.arrive, { color: theme.color.secondary, fontFamily: theme.font.body }]}>{`${plan.arrives} 도착`}</Text>
        </View>
        <Track segs={trackParts(plan.legs, colors, 240)} small />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="경로 지우기" hitSlop={7} onPress={onClear} style={[styles.close, { backgroundColor: theme.color.control }]}>
        <CloseIcon color={theme.color.secondary} size={14} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', zIndex: 15, left: 10, right: 10, alignSelf: 'center', maxWidth: BAR_MAX_WIDTH, borderRadius: tokens.radius[18] },
  open: { gap: 9, paddingTop: tokens.space[3], paddingHorizontal: 14, paddingBottom: 13 },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: tokens.space[2], paddingRight: 34 },
  minutes: { fontSize: tokens.text[21], lineHeight: 21 },
  unit: { fontSize: tokens.text[13] },
  arrive: { fontSize: tokens.text[13], fontWeight: tokens.weight.bold },
  close: { position: 'absolute', top: 7, right: 7, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
});
