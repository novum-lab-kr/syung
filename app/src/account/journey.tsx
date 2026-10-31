// 경로 띠 · 단계 목록(웹 web/lib/journey-ui.mts trackParts · routeSteps + web/ui/journey_sheet.tsx StepList · RouteLoading 을 옮긴 것 — 웹 파일은 DOM · 본체 모듈과 묶여 있어 같은 셈을 여기 둔다).
// 노선 색은 지도 다리 ready.colors 로 받는다(setLineColors) — 받기 전에는 LINE_COLORS 가 비어 있어 지하철 칸이 대체색으로 나온다.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Runner } from '../sheets/RouteParts';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { BusAlternative, PlanLeg } from './api';
import { BusIcon, WalkIcon } from './icons';
import { route as routeLook } from './literals';
import { body, makeStyles } from './style';

type Leg = PlanLeg;   // 저장한 구간(SlimLeg)도 이 모양에 들어간다
type Colors = Readonly<Record<string, string>>;
export const LINE_COLORS: Record<string, string> = {};
export const setLineColors = (colors: Colors) => { Object.assign(LINE_COLORS, colors); };

const ALT_SHOWN = 3;
const hm = (clock: string | undefined) => { const [hour = 0, minute = 0] = String(clock).split(':').map(Number); return hour * 60 + minute; };
const legSecs = (leg: Leg) => (leg.type === 'walk' ? leg.seconds ?? 0 : Math.max(60, ((hm(leg.arrives) - hm(leg.departs) + 1440) % 1440) * 60));
const textW = (text: string) => [...text].reduce((width, letter) => width + (/[가-힣]/.test(letter) ? 11.5 : 7), 0);
const minutesOf = (seconds: number) => Math.max(1, Math.round(seconds / 60));
const fieldText = (value: unknown) => (typeof value === 'string' ? value : '');
const fieldNumber = (value: unknown) => (typeof value === 'number' ? value : 0);
const alternativesOf = (leg: Leg): readonly BusAlternative[] => ('alternatives' in leg && leg.alternatives) || [];

// 노선 색 위 글자: 밝은 색엔 어둡게, 나머지는 희게(웹 inkOn)
export function inkOn(hex: string) {
  const whole = parseInt(hex.slice(1), 16);
  if (Number.isNaN(whole)) return '#fff';
  const [red = 0, green = 0, blue = 0] = [whole >> 16, (whole >> 8) & 255, whole & 255].map(raw => {
    const part = raw / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  const light = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return 1.05 / (light + 0.05) >= (light + 0.05) / 0.057 ? '#fff' : '#141414';
}
const colorOf = (leg: Leg, colors: Colors, fallback: string) => (leg.type === 'bus' ? leg.color ?? fallback : colors[leg.line ?? ''] || fallback);

const useStyles = makeStyles(theme => ({
  track: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
  ride: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, alignSelf: 'stretch', overflow: 'hidden', borderRadius: tokens.radius[7], boxShadow: routeLook.rideShadow },
  rideText: body(theme, tokens.text['11.5'], tokens.weight.extrabold),
  walk: { minWidth: 6, height: 4, overflow: 'hidden', opacity: 0.9 },
  // 점이 칸 넓이에 끼어들지 않게 띄운다(웹은 배경 무늬라 넓이에 영향이 없다)
  walkDots: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center', gap: 2.8 },
  dot: { width: 3.2, height: 3.2, borderRadius: 1.6, backgroundColor: theme.color.muted, flexShrink: 0 },
  wait: { minWidth: 3, height: 4, borderRadius: tokens.radius.pill, backgroundColor: theme.color.rule },
  row: { flexDirection: 'row', gap: 10 },
  rail: { width: 16, alignItems: 'center' },
  node: { width: 14, height: 14, marginTop: 2, borderRadius: 7 },
  link: { flex: 1, width: 5 },
  // 점 개수가 줄 높이를 키우지 않도록, 남는 칸(dotsBox) 안에 띄워 둔다
  dotsBox: { flex: 1, width: 3 },
  dots: { position: 'absolute', top: 0, bottom: 0, width: 3, gap: 3, overflow: 'hidden', opacity: 0.8 },
  railDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.color.muted, flexShrink: 0 },
  full: { flex: 1, width: 5, alignSelf: 'center' },
  nodeBody: { flex: 1, paddingBottom: 10 },
  nodeText: { ...body(theme, tokens.text['14.5'], tokens.weight.bold), lineHeight: tokens.text['14.5'] * 1.35 },
  segment: { flex: 1, paddingTop: 1, paddingBottom: tokens.space[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: tokens.space[2], borderRadius: tokens.radius[7] },
  chipText: body(theme, tokens.text[12], tokens.weight.extrabold),
  chipSide: { ...body(theme, tokens.text['10.5'], tokens.weight.bold), marginLeft: 3, paddingHorizontal: 5, borderRadius: tokens.radius.pill, overflow: 'hidden', backgroundColor: routeLook.sideChip },
  more: body(theme, tokens.text[12], tokens.weight.bold, theme.color.secondary),
  // 웹 .js-b small: 아이콘 · 글자 · 시간이 한 줄(좁으면 줄바꿈), 틈 5 · 시간 앞 2 더
  walkLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  walkDetail: { marginLeft: 2, fontVariant: ['tabular-nums'] },
  toward: body(theme, tokens.text['13.5'], tokens.weight.semibold),
  info: { ...body(theme, tokens.text[12], tokens.weight.regular, theme.color.secondary), lineHeight: tokens.text[12] * 1.45 },
  side: { ...body(theme, tokens.text[12], tokens.weight.regular, theme.color.secondary), marginTop: 2 },
  skeleton: { marginTop: 2 },
  bone: { gap: 9, paddingTop: 14, paddingBottom: 13 },
  boneRule: { borderTopWidth: 1, borderTopColor: theme.color.rule },
  boneMin: { height: 18, borderRadius: tokens.radius[7], backgroundColor: theme.color.control },
  boneTrack: { height: 24, overflow: 'hidden', borderRadius: tokens.radius[7], backgroundColor: theme.color.control },
  boneMeta: { height: 11, width: '56%', borderRadius: tokens.radius[7], backgroundColor: theme.color.control },
}));

// 경로 한 개의 색 띠: 칸 넓이는 걸리는 시간 비율, 탈것은 짧은 이름이 들어갈 만큼은 늘 차지한다
export function Track({ legs, colors, width = 330, height }: { legs: readonly Leg[]; colors: Colors; width?: number; height?: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const seconds = legs.reduce((sum, leg) => sum + legSecs(leg) + (leg.type !== 'walk' && (leg.wait ?? 0) > 30 ? leg.wait ?? 0 : 0), 0) || 1;
  return (
    <View style={[styles.track, height ? { height } : null]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {legs.flatMap((leg, index) => {
        const secs = legSecs(leg);
        const fill = { flexGrow: secs, flexShrink: 1, flexBasis: 0 };
        if (leg.type === 'walk') return [<View key={index} style={[styles.walk, fill]}><View style={styles.walkDots}>{Array.from({ length: 24 }, (_item, dot) => <View key={dot} style={styles.dot} />)}</View></View>];
        const color = colorOf(leg, colors, theme.literal.lineFallback);
        const bus = leg.type === 'bus';
        const full = (bus ? leg.route : leg.line) ?? '';
        const short = bus ? full : full.replace(/호선$/, '').replace(/선$/, '');
        const pixels = (secs / seconds) * width;
        const ink = inkOn(color);
        const ride = (
          <View key={index} style={[styles.ride, fill, { minWidth: Math.max(10, textW(short) + 12), backgroundColor: color }]}>
            {bus && pixels >= textW(full) + 34 && <BusIcon color={ink} />}
            <Text style={[styles.rideText, { color: ink }]} numberOfLines={1}>{pixels >= textW(full) + 14 ? full : short}</Text>
          </View>
        );
        const wait = leg.wait ?? 0;
        return wait > 30 ? [<View key={`wait${index}`} style={[styles.wait, { flexGrow: wait, flexShrink: 1, flexBasis: 0 }]} />, ride] : [ride];
      })}
    </View>
  );
}

function walkText(prev: Leg | undefined, next: Leg | undefined, leg: Leg) {
  const exit = leg.exit ?? '';
  const door = exit ? `${exit}번 출구` : '';
  const out = prev?.type === 'ride' && door ? `${door}로 나와 ` : '';
  if (!next) return `${out}목적지까지 걸어서`;
  if (next.type === 'walk') { const label = 'label' in leg ? leg.label : undefined; return `${out}${label ? `${label} 걸어서` : '걸어서 이동'}`; }
  if (next.type === 'bus') return `${out}${next.from ?? ''} 정류장까지 걸어서`;
  return `${next.from ?? ''}역${prev?.type !== 'ride' && door ? ` ${door}` : ''}까지 걸어서`;
}

const sideStop = (stop: Record<string, unknown>) => (fieldNumber(stop.walkMinutes) ? `${fieldNumber(stop.walkMinutes)}분` : `${fieldNumber(stop.metres)}m`);
interface BusChip { route: string; color: string; ink: string; side: string | null; detail: string | null }
type Step =
  | { kind: 'place'; at: 'start' | 'end'; name: string }
  | { kind: 'walk'; text: string; detail: string }
  | { kind: 'board' | 'alight'; name: string; color: string }
  | { kind: 'ride'; color: string; ink: string; bus: boolean; chip: string; toward: string | null; chips: BusChip[]; info: string };

// 승차권용 단계(시각 없이 — 웹 routeSteps 의 times 없는 경우)
function stepsOf(legs: readonly Leg[], ends: { from: string; to: string }, colors: Colors, fallback: string): Step[] {
  const rows: Step[] = [{ kind: 'place', at: 'start', name: ends.from }];
  legs.forEach((leg, at) => {
    if (leg.type === 'walk') {
      const metres = 'metres' in leg ? leg.metres : undefined;
      rows.push({ kind: 'walk', text: walkText(legs[at - 1], legs[at + 1], leg), detail: `${minutesOf(leg.seconds ?? 0)}분${metres ? ` · ${Math.round(metres / 10) * 10}m` : ''}` });
      return;
    }
    const bus = leg.type === 'bus';
    const place = (name: string | undefined) => (bus ? name ?? '' : `${name ?? ''}역`);
    const color = colorOf(leg, colors, fallback);
    const ink = inkOn(color);
    const others = bus ? alternativesOf(leg) : [];
    const chips: BusChip[] = bus ? [{ route: leg.route ?? '', color, ink, side: null, detail: null }, ...others.map(other => {
      const stop = other.boardAt;
      return { route: other.route, color: other.color, ink: inkOn(other.color), side: stop ? `옆 ${sideStop(stop)}` : null,
        detail: stop ? `${fieldText(stop.name)}${fieldText(stop.ars) ? ` ${fieldText(stop.ars)}` : ''} · 걸어서 ${sideStop(stop)}${fieldText(stop.exit) ? ` · ${fieldText(stop.exit)}번 출구 쪽` : ''}` : null };
    })] : [];
    const stops = 'stops' in leg ? leg.stops : undefined;
    const minutes = leg.departs && leg.arrives ? Math.max(1, (hm(leg.arrives) - hm(leg.departs) + 1440) % 1440) : null;
    const info = [stops ? `${stops}개 ${bus ? '정류장' : '역'}` : null, minutes ? `${minutes}분` : null].filter(Boolean).join(' · ');
    const towardBus = 'toward' in leg && leg.toward ? `${leg.toward} 방면` : null;
    const towardTrain = 'destination' in leg && leg.destination ? `${leg.destination} 방면` : ('direction' in leg && leg.direction) || null;
    rows.push({ kind: 'board', name: `${place(leg.from)} 승차`, color },
      { kind: 'ride', color, ink, bus, chip: bus ? leg.route ?? '' : leg.line ?? '', toward: bus ? towardBus : towardTrain, chips, info },
      { kind: 'alight', name: `${place(leg.to)} 하차`, color });
  });
  rows.push({ kind: 'place', at: 'end', name: ends.to });
  return rows;
}

const Dots = () => {
  const styles = useStyles();
  return <View style={styles.dotsBox}><View style={styles.dots}>{Array.from({ length: 30 }, (_item, dot) => <View key={dot} style={styles.railDot} />)}</View></View>;
};

function BusChips({ chips }: { chips: BusChip[] }) {
  const styles = useStyles();
  const [all, setAll] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const shown = all ? chips : chips.slice(0, ALT_SHOWN + 1);
  const hidden = chips.length - shown.length;
  return (
    <>
      <View style={styles.chips}>
        {shown.map(chip => (
          <Pressable key={chip.route} disabled={!chip.detail} onPress={() => setNote(current => (current === chip.detail ? null : chip.detail))} accessibilityRole={chip.detail ? 'button' : 'text'} style={[styles.chip, { backgroundColor: chip.color }]}>
            <BusIcon color={chip.ink} /><Text style={[styles.chipText, { color: chip.ink }]}>{chip.route}</Text>
            {chip.side && <Text style={[styles.chipSide, { color: chip.ink }]}>{chip.side}</Text>}
          </Pressable>
        ))}
        {hidden > 0 && <Pressable onPress={() => setAll(true)} accessibilityRole="button" hitSlop={6}><Text style={styles.more}>{`외 ${hidden}대`}</Text></Pressable>}
      </View>
      {note && <Text style={styles.side}>{note}</Text>}
    </>
  );
}

export function StepList({ legs, ends, colors }: { legs: readonly Leg[]; ends: { from: string; to: string }; colors: Colors }) {
  const styles = useStyles();
  const theme = useTheme();
  const steps = stepsOf(legs, ends, colors, theme.literal.lineFallback);
  return (
    <View>
      {steps.map((step, index) => {
        if (step.kind === 'walk') {
          return (
            <View key={index} style={styles.row}>
              <View style={styles.rail}><Dots /></View>
              <View style={[styles.segment, styles.walkLine]}><WalkIcon color={theme.color.secondary} /><Text style={styles.info}>{step.text}</Text><Text style={[styles.info, styles.walkDetail]}>{step.detail}</Text></View>
            </View>
          );
        }
        if (step.kind === 'ride') {
          return (
            <View key={index} style={styles.row}>
              <View style={styles.rail}><View style={[styles.full, { backgroundColor: step.color }]} /></View>
              <View style={styles.segment}>
                {step.bus ? <BusChips chips={step.chips} /> : (
                  <View style={styles.chips}><View style={[styles.chip, { backgroundColor: step.color }]}><Text style={[styles.chipText, { color: step.ink }]}>{step.chip}</Text></View>
                    {step.toward && <Text style={styles.toward}>{step.toward}</Text>}</View>
                )}
                {step.bus && step.toward && <Text style={styles.toward}>{step.toward}</Text>}
                {step.info ? <Text style={styles.info}>{step.info}</Text> : null}
              </View>
            </View>
          );
        }
        const next = steps[index + 1];
        const nodeLook = step.kind === 'place'
          ? { backgroundColor: step.at === 'start' ? theme.color.syung : theme.color.syungInk, boxShadow: step.at === 'start' ? `inset 0 0 0 2px ${theme.name === 'dark' ? '#000' : theme.color.syungInk}` : `inset 0 0 0 3px ${theme.color.syung}` }
          : { backgroundColor: theme.color.control, boxShadow: `inset 0 0 0 3.5px ${step.color}` };
        return (
          <View key={index} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.node, nodeLook]} />
              {next?.kind === 'ride' && <View style={[styles.link, { backgroundColor: next.color }]} />}
              {next && next.kind !== 'ride' && <Dots />}
            </View>
            <View style={styles.nodeBody}><Text style={styles.nodeText}>{step.name}</Text></View>
          </View>
        );
      })}
    </View>
  );
}

// 찾는 동안 뼈대 카드(웹 RouteLoading — 첫 줄을 슝이 달린다)
export function RouteLoading() {
  const styles = useStyles();
  return (
    <View style={styles.skeleton} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[{ width: '38%', opacity: 1 }, { width: '30%', opacity: 0.7 }, { width: '34%', opacity: 0.45 }].map((look, index) => (
        <View key={look.width} style={[styles.bone, index > 0 && styles.boneRule, { opacity: look.opacity }]}>
          <View style={[styles.boneMin, { width: look.width as `${number}%` }]} /><View style={styles.boneTrack}>{index === 0 ? <Runner /> : null}</View><View style={styles.boneMeta} />
        </View>
      ))}
    </View>
  );
}
