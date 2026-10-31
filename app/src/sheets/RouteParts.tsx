// 경로 조각: web/components/{route_card,step_list,segmented,chip}.tsx 구조 그대로 + syung.css(.jp · .js · .jseg · .segmented · .jsk).
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { tokens } from '../theme/tokens';
import { useReducedMotion, useTheme } from '../theme/useTheme';
import { BusFilledIcon, WalkIcon } from './icons';
import { ALT_SHOWN, type BusChipView, type PlanView, type StepView, type TrackSegView } from './routeView';
import { sheetColors } from './webColors';

// 점선 세로줄(CSS border-left dotted): iOS 는 한 변만 점선을 못 그려 SVG 로 그린다. 웹 캡처의 3px 점이 네모라 둥글리지 않는다
export function DottedRail({ color, width, opacity, style }: { color: string; width: number; opacity: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width, opacity }, style]}>
      <Svg width={width} height="100%">
        <Line x1={width / 2} y1={0} x2={width / 2} y2="100%" stroke={color} strokeWidth={width} strokeDasharray={`${width} ${width}`} />
      </Svg>
    </View>
  );
}

// 경로 띠. small: 아래 막대(.jbar .jtrack)
export function Track({ segs, small = false }: { segs: TrackSegView[]; small?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.track, small ? styles.trackSmall : null]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {segs.map((seg, index) => {
        const flex = { flexGrow: seg.flex, flexShrink: 1, flexBasis: 0 };
        if (seg.kind === 'wait') return <View key={index} style={[styles.segWait, flex, { backgroundColor: theme.color.rule }]} />;
        if (seg.kind === 'walk') {
          return (
            <View key={index} style={[styles.segWalk, flex]}>
              <Svg width="100%" height={4}><Line x1={2} y1={2} x2="100%" y2={2} stroke={theme.color.muted} strokeWidth={3.2} strokeLinecap="round" strokeDasharray="0 6" /></Svg>
            </View>
          );
        }
        return (
          <View key={index} style={[styles.segRide, flex, small ? styles.segRideSmall : null, { minWidth: seg.need, backgroundColor: seg.color }]}>
            {seg.icon ? <BusFilledIcon color={seg.ink} size={12} /> : null}
            <Text numberOfLines={1} style={[styles.segText, small ? styles.segTextSmall : null, { color: seg.ink, fontFamily: theme.font.body }]}>{seg.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

interface ChipProps { color: string; ink: string; bus: boolean; children: ReactNode }
function LineChip({ color, ink, bus, children }: ChipProps) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      {bus ? <BusFilledIcon color={ink} size={12} /> : null}
      <Text style={[styles.chipText, { color: ink, fontFamily: theme.font.body }]}>{children}</Text>
    </View>
  );
}

function BusChips({ chips }: { chips: BusChipView[] }) {
  const theme = useTheme();
  const [all, setAll] = useState(false);
  const [tapped, setTapped] = useState<string | null>(null);
  const shown = all ? chips : chips.slice(0, 1 + ALT_SHOWN);
  const hidden = chips.length - shown.length;
  const note = chips.find((chip) => chip.route === tapped)?.detail;
  return (
    <>
      <View style={styles.chips}>
        {shown.map((chip) => {
          if (chip.detail === null) return <LineChip key={chip.route} color={chip.color} ink={chip.ink} bus>{chip.route}</LineChip>;
          const open = tapped === chip.route;
          return (
            <Pressable key={chip.route} accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setTapped(open ? null : chip.route)}
              style={[styles.chip, { backgroundColor: chip.color }, open ? { boxShadow: `0 0 0 2px ${theme.color.paper}, 0 0 0 3.5px ${chip.color}` } : null]}>
              <BusFilledIcon color={chip.ink} size={12} />
              <Text style={[styles.chipText, { color: chip.ink, fontFamily: theme.font.body }]}>{chip.route}</Text>
              <View style={styles.chipSide}><Text style={[styles.chipSideText, { color: chip.ink, fontFamily: theme.font.body }]}>{chip.side}</Text></View>
            </Pressable>
          );
        })}
        {hidden > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setAll(true)}>
            <Text style={[styles.more, { color: theme.color.ink, fontFamily: theme.font.body }]}>{`외 ${hidden}대`}</Text>
          </Pressable>
        ) : null}
      </View>
      {note != null ? <Text style={[styles.sideNote, { color: theme.color.secondary, fontFamily: theme.font.body }]}>{note}</Text> : null}
    </>
  );
}

// 가운데 칸: 위아래 줄이 이어지게 동그라미 뒤로 다음 칸까지 선을 내린다(.js.node:has(+ …)::after)
function NodeRail({ step, next, dot }: { step: Extract<StepView, { kind: 'place' | 'board' | 'alight' }>; next: StepView | undefined; dot: ViewStyle }) {
  const theme = useTheme();
  let color: string = theme.color.ink;
  if (step.kind !== 'place') color = step.color;
  else if (step.at === 'start') color = theme.color.syung;
  return (
    <View style={styles.rail}>
      {next?.kind === 'ride' ? <View style={[styles.nodeLine, { backgroundColor: color }]} /> : null}
      {next?.kind === 'walk' ? <DottedRail color={theme.color.muted} width={3} opacity={0.8} style={styles.nodeDots} /> : null}
      {next && next.kind !== 'ride' && next.kind !== 'walk' ? <DottedRail color={theme.color.muted} width={3} opacity={0.8} style={styles.nodeDotsLong} /> : null}
      <View style={[styles.dot, dot]} />
    </View>
  );
}

function Step({ step, next }: { step: StepView; next: StepView | undefined }) {
  const theme = useTheme();
  const body = { fontFamily: theme.font.body };
  const timeText = [styles.time, body, { color: theme.color.secondary }];
  const small: StyleProp<TextStyle> = [styles.small, body, { color: theme.color.secondary }];
  if (step.kind === 'walk') {
    return (
      <View style={styles.step}>
        <View style={styles.timeBox} />
        <View style={styles.rail}><DottedRail color={theme.color.muted} width={3} opacity={0.8} style={styles.fill} /></View>
        <View style={styles.stepBodyLine}>
          <View style={styles.smallRow}>
            <WalkIcon color={theme.color.secondary} size={13} />
            <Text style={small}>{step.text}</Text>
            <Text style={[small, styles.tabular]}>{` ${step.detail}`}</Text>
          </View>
        </View>
      </View>
    );
  }
  if (step.kind === 'ride') {
    return (
      <View style={styles.step}>
        <View style={styles.timeBox} />
        <View style={styles.rail}><View style={[styles.rideLine, { backgroundColor: step.color }]} /></View>
        <View style={styles.stepBodyLine}>
          <View style={styles.rideHead}>
            {step.bus ? <BusChips chips={step.chips} /> : <LineChip color={step.color} ink={step.ink} bus={false}>{step.chip}</LineChip>}
            {step.toward !== null ? <Text style={[styles.toward, body, { color: theme.color.ink }]}>{step.toward}</Text> : null}
          </View>
          {step.info !== '' || step.live !== null ? (
            <View style={styles.smallRow}>
              {step.info !== '' ? <Text style={small}>{step.info}</Text> : null}
              {step.live !== null ? <Text style={[styles.small, styles.liveText, body, { color: theme.name === 'dark' ? sheetColors.liveDark : sheetColors.liveLight }]}>{step.live}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  }
  const dark = theme.name === 'dark';
  let dot: ViewStyle;
  if (step.kind === 'place' && step.at === 'start') dot = { backgroundColor: theme.color.syung, boxShadow: `inset 0 0 0 2px ${dark ? sheetColors.dotFromDark : theme.color.syungInk}` };
  else if (step.kind === 'place') dot = { backgroundColor: theme.color.syungInk, boxShadow: `inset 0 0 0 3px ${theme.color.syung}` };
  else dot = { backgroundColor: theme.color.control, boxShadow: `inset 0 0 0 3.5px ${step.color}` };
  return (
    <View style={styles.step}>
      <View style={styles.timeBox}><Text style={timeText}>{step.time}</Text></View>
      <NodeRail step={step} next={next} dot={dot} />
      <View style={styles.stepBodyNode}>
        <Text style={[styles.nodeName, body, { color: theme.color.ink }]}>{step.name}</Text>
        {step.kind === 'alight' && step.chips.length > 0 ? (
          <View style={styles.alightChips}>
            {step.chips.map((chip) => (
              <View key={chip.route} style={styles.alt}>
                <LineChip color={chip.color} ink={chip.ink} bus>{chip.route}</LineChip>
                <Text style={small}>{chip.where}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// 펼칠 때 살짝 내려오며 나타난다(@keyframes js-in · jw-in)
export function FadeIn({ duration, style, children }: { duration: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [shown] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) return;
    Animated.timing(shown, { toValue: 1, duration, easing: Easing.bezier(...tokens.ease.sheet), useNativeDriver: true }).start();
  }, [duration, reduced, shown]);
  const translateY = shown.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] });
  return <Animated.View style={[style, { opacity: shown, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

export function StepList({ steps }: { steps: StepView[] }) {
  return <FadeIn duration={tokens.duration[220]} style={styles.steps}>{steps.map((step, index) => <Step key={index} step={step} next={steps[index + 1]} />)}</FadeIn>;
}

export function RouteCard({ plan, on, onPick }: { plan: PlanView; on: boolean; onPick(): void }) {
  const theme = useTheme();
  const dark = theme.name === 'dark';
  const minutes = <Text style={styles.minUnit}>분</Text>;
  return (
    // 펼친 카드는 안의 칩 단추를 스크린리더가 찾아가도록 묶지 않는다
    <Pressable accessible={!on} accessibilityRole="button" accessibilityLabel={plan.aria} accessibilityState={{ expanded: on }} onPress={onPick} style={[styles.card, on ? { backgroundColor: theme.color.control } : null]}>
      <View style={styles.cardTop}>
        <Text style={[styles.min, { color: theme.color.ink, fontFamily: theme.font.round }]}>
          {plan.duration.hours !== null ? <>{plan.duration.hours}<Text style={styles.minUnit}>시간</Text>{` ${plan.duration.minutes}`}{minutes}</> : <>{plan.duration.minutes}{minutes}</>}
        </Text>
        <Text style={[styles.arrive, { color: theme.color.secondary, fontFamily: theme.font.body }]}>{plan.arrive}</Text>
        {plan.tag !== null ? (
          <View style={[styles.tag, { backgroundColor: dark ? sheetColors.tagDarkBg : theme.color.syungSoft }]}>
            <Text style={[styles.tagText, { color: dark ? theme.color.syung : sheetColors.tagInk, fontFamily: theme.font.body }]}>{plan.tag}</Text>
          </View>
        ) : null}
      </View>
      <Track segs={plan.track} />
      {on ? (
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: theme.color.secondary, fontFamily: theme.font.body }]}>{plan.meta}</Text>
          {plan.live ? <Live /> : null}
        </View>
      ) : null}
      {on ? <StepList steps={plan.steps} /> : null}
    </Pressable>
  );
}

function Live() {
  const theme = useTheme();
  const color = theme.name === 'dark' ? sheetColors.liveDark : sheetColors.liveLight;
  return (
    <View style={styles.live}>
      <View style={[styles.liveDot, { backgroundColor: color, boxShadow: `0 0 0 3px ${color}38` }]} />
      <Text style={[styles.liveLabel, { color, fontFamily: theme.font.body }]}>실시간</Text>
    </View>
  );
}

const RUN_WIDTH = 34;
const RUN_START = -40;
const RUN_EASE = [0.65, 0, 0.35, 1] as const;   // cubic-bezier(.65,0,.35,1)

// 첫 줄을 달리는 열차(.jsk-run): 뒤로 속도선 셋
export function Runner() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [run] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced || !width) return undefined;
    const loop = Animated.loop(Animated.timing(run, { toValue: 1, duration: 1600, easing: Easing.bezier(...RUN_EASE), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduced, run, width]);
  const moving = {
    opacity: run.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 1, 1, 0] }),
    transform: [{ translateX: run.interpolate({ inputRange: [0, 1], outputRange: [RUN_START, width + 4] }) }],
  };
  const still = { transform: [{ translateX: width / 2 - RUN_WIDTH / 2 }] };
  const speed = { backgroundColor: theme.color.syung };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Animated.View style={[styles.run, reduced ? still : moving]}>
        <View style={styles.speedLines}>
          <View style={[styles.speedLine, styles.speedFirst, speed]} />
          <View style={[styles.speedLine, styles.speedSecond, speed]} />
          <View style={[styles.speedLine, styles.speedThird, speed]} />
        </View>
        <View style={[styles.runBody, { backgroundColor: theme.color.syung }]}>
          <View style={[styles.runWindow, { backgroundColor: theme.color.syungInk }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const LOADING_ROWS = [
  { opacity: 1, min: '38%' },
  { opacity: 0.7, min: '30%' },
  { opacity: 0.45, min: '34%' },
] as const;

export function RouteLoading() {
  const theme = useTheme();
  const bone = { backgroundColor: theme.color.control };
  return (
    <View style={styles.loading} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {LOADING_ROWS.map((row, index) => (
        <View key={row.min} style={[styles.bone, { opacity: row.opacity }, index ? { borderTopWidth: 1, borderTopColor: theme.color.rule } : null]}>
          <View style={[styles.boneMin, bone, { width: row.min }]} />
          <View style={[styles.boneTrack, bone]}>{index === 0 ? <Runner /> : null}</View>
          <View style={[styles.boneMeta, bone]} />
        </View>
      ))}
    </View>
  );
}

export interface SegmentItem { id: string; name: string; count?: number; pressed: boolean }

// 세그먼트 탭. place: 놓인 자리(.jkinds 넘치면 옆으로 밀기 · .jw-day)
export function Segmented({ label, place, items, onPick }: { label: string; place: 'kinds' | 'day'; items: SegmentItem[]; onPick(id: string): void }) {
  const theme = useTheme();
  const kinds = place === 'kinds';
  const row = (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.segmented, kinds ? styles.kindsRow : null, { backgroundColor: kinds ? theme.color.control : theme.color.paper }]}>
      {items.map((item) => {
        const ink = item.pressed ? theme.color.syungInk : theme.color.secondary;
        return (
          <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.pressed }} onPress={() => onPick(item.id)}
            style={[kinds ? styles.kindButton : styles.dayButton, item.pressed ? { backgroundColor: theme.color.syung } : null]}>
            <Text style={[kinds ? styles.kindText : styles.dayText, { color: ink, fontFamily: theme.font.body }]}>
              {item.name}
              {item.count !== undefined ? <Text style={{ opacity: item.pressed ? 0.8 : 0.55 }}>{` ${item.count}`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
  if (!kinds) return <View style={styles.dayBox}>{row}</View>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindsBox} contentContainerStyle={styles.kindsContent} keyboardShouldPersistTaps="handled">{row}</ScrollView>;
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
  trackSmall: { height: 18 },
  segWait: { minWidth: 3, height: 4, borderRadius: tokens.radius.pill },
  segWalk: { minWidth: 6, height: 4, opacity: 0.9, overflow: 'hidden' },
  segRide: { minWidth: 10, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, overflow: 'hidden', borderRadius: tokens.radius[7], boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.14)' },
  segRideSmall: { borderRadius: tokens.radius[5] },
  segText: { fontSize: tokens.text['11.5'], fontWeight: tokens.weight.extrabold, letterSpacing: -0.115 },
  segTextSmall: { fontSize: tokens.text['10.5'], letterSpacing: -0.105 },
  card: { gap: 7, paddingTop: 13, paddingHorizontal: tokens.space[3], paddingBottom: tokens.space[3], marginHorizontal: -tokens.space[3], borderRadius: tokens.radius[16] },
  cardTop: { flexDirection: 'row', alignItems: 'baseline', gap: tokens.space[2], minWidth: 0, height: 26 },   // 웹 .jp-top 실측 높이
  min: { fontSize: tokens.text[26], lineHeight: 26, letterSpacing: -0.26, fontVariant: ['tabular-nums'] },
  minUnit: { fontSize: tokens.text[15] },
  arrive: { fontSize: tokens.text[14], fontWeight: tokens.weight.bold, fontVariant: ['tabular-nums'] },
  tag: { marginLeft: 'auto', alignSelf: 'center', flexShrink: 0, paddingVertical: 3, paddingHorizontal: 9, borderRadius: tokens.radius.pill },
  tagText: { fontSize: tokens.text['11.5'], fontWeight: tokens.weight.bold },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: tokens.text['12.5'], fontVariant: ['tabular-nums'] },
  live: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[1], marginLeft: 'auto' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveLabel: { fontSize: tokens.text['11.5'], fontWeight: tokens.weight.bold },
  steps: { marginTop: 6, marginBottom: 2 },
  step: { flexDirection: 'row', columnGap: 10 },
  timeBox: { width: 40 },
  time: { paddingTop: 1, textAlign: 'right', fontSize: tokens.text['12.5'], fontWeight: tokens.weight.bold, fontVariant: ['tabular-nums'] },
  rail: { width: 16, alignItems: 'center' },
  fill: { flex: 1 },
  rideLine: { flex: 1, width: 5, marginBottom: -2 },
  nodeLine: { position: 'absolute', top: 12, bottom: 0, width: 5 },
  nodeDots: { position: 'absolute', top: 12, bottom: 0 },
  nodeDotsLong: { position: 'absolute', top: 12, bottom: -2 },
  dot: { zIndex: 1, width: 14, height: 14, marginTop: 2, borderRadius: 7 },
  stepBodyNode: { flex: 1, minWidth: 0, paddingBottom: 10 },
  stepBodyLine: { flex: 1, minWidth: 0, paddingTop: 1, paddingBottom: tokens.space[3] },
  nodeName: { fontSize: tokens.text['14.5'], lineHeight: 20, fontWeight: tokens.weight.bold },
  smallRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  small: { fontSize: tokens.text[12], lineHeight: 17 },
  tabular: { fontVariant: ['tabular-nums'] },
  liveText: { fontWeight: tokens.weight.bold },
  rideHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 2 },
  toward: { fontSize: tokens.text['13.5'], fontWeight: tokens.weight.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: tokens.space[2], borderRadius: tokens.radius[7] },
  chipText: { fontSize: tokens.text[12], fontWeight: tokens.weight.extrabold },
  chipSide: { marginLeft: 3, paddingHorizontal: 5, borderRadius: tokens.radius.pill, backgroundColor: sheetColors.sideChip },
  chipSideText: { fontSize: tokens.text['10.5'], fontWeight: tokens.weight.bold },
  more: { fontSize: tokens.text['13.5'], fontWeight: tokens.weight.bold, textDecorationLine: 'underline' },
  sideNote: { width: '100%', marginTop: 2, fontSize: tokens.text[12] },
  alightChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[1], marginRight: 6 },
  loading: { marginTop: 2 },
  bone: { gap: 9, paddingTop: 14, paddingBottom: 13 },
  boneMin: { height: 18, borderRadius: tokens.radius[7] },
  boneTrack: { height: 24, overflow: 'hidden', borderRadius: tokens.radius[7] },
  boneMeta: { height: 11, width: '56%', borderRadius: tokens.radius[7] },
  run: { position: 'absolute', top: 3, left: 0, width: RUN_WIDTH, height: 18 },
  runBody: { flex: 1, borderRadius: tokens.radius[6], boxShadow: '0 1px 0 rgba(20,20,20,.25)' },
  runWindow: { position: 'absolute', right: 5, top: 5, width: 8, height: 8, borderRadius: 4 },
  speedLines: { position: 'absolute', right: RUN_WIDTH + 3, top: 4, width: 26, height: 10, alignItems: 'flex-end', justifyContent: 'space-between', opacity: 0.8 },
  speedLine: { height: 2 },
  speedFirst: { width: '60%' },
  speedSecond: { width: '100%' },
  speedThird: { width: '45%' },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: tokens.radius.pill },
  kindsBox: { flexGrow: 0 },   // 웹 .jkinds 는 부모가 블록이라 칸이 적어도 폭을 가득 채운다
  kindsContent: { flexGrow: 1 },
  kindsRow: { flexGrow: 1 },
  dayBox: { alignItems: 'center' },
  kindButton: { paddingVertical: 6, paddingHorizontal: tokens.space[3], borderRadius: tokens.radius.pill },
  kindText: { fontSize: tokens.text[13], fontWeight: tokens.weight.bold },
  dayButton: { paddingVertical: 7, paddingHorizontal: 18, borderRadius: tokens.radius.pill },
  dayText: { fontSize: tokens.text['13.5'], fontWeight: tokens.weight.bold },
});
