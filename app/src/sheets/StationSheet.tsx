// 역 도착 시트: web/ui/station_sheet.tsx(문구 · 차례) + popups.mts(0.7초 규칙 · 15초 다시 그리기) + syung.css .station-sheet.
// 웹과 같이 도착 정보가 오면 그때 올라오고, 0.7초가 넘으면 뼈대 줄로 먼저 연다. 15초마다는 다시 받지 않고 받은 값으로 "N분 후"만 새로 센다.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet, SheetButton } from '../components/Sheet';
import { arrivalCards, fetchArrivals, seoulTime, type ArrivalCard, type ArrivalsAnswer } from '../data/arrivals';
import { loadExits, type ExitItem } from '../data/exits';
import type { StationInfo } from '../map/bridge';
import { tokens } from '../theme/tokens';
import { useTheme, type Theme } from '../theme/useTheme';
import type { LineColors } from './types';
import { sheetColors } from './webColors';

type Load = { kind: 'waiting' } | { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; answer: ArrivalsAnswer };

interface Props { station: StationInfo; colors: LineColors; onClose(): void; onPick(end: 'from' | 'to'): void }

export function StationSheet({ station, colors, onClose, onPick }: Props) {
  const theme = useTheme();
  const [load, setLoad] = useState<Load>({ kind: 'waiting' });
  const [exits, setExits] = useState<ExitItem[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const controller = new AbortController();
    const skeleton = setTimeout(() => setLoad((state) => (state.kind === 'waiting' ? { kind: 'loading' } : state)), 700);
    fetchArrivals(station.name, controller.signal).then(
      (answer) => { setNow(Date.now()); setLoad({ kind: 'ready', answer }); },
      () => { if (!controller.signal.aborted) setLoad({ kind: 'failed' }); },
    ).finally(() => clearTimeout(skeleton));
    loadExits(station.id).then(setExits).catch(() => setExits([]));
    return () => { controller.abort(); clearTimeout(skeleton); };
  }, [station.id, station.name]);

  const ready = load.kind === 'ready';
  useEffect(() => {
    if (!ready) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [ready]);

  const cards = useMemo(() => (load.kind === 'ready' ? arrivalCards(station, load.answer.arrivals, now) : []), [load, now, station]);

  if (load.kind === 'waiting') return null;
  return (
    <Sheet onClose={onClose}>
      <Head theme={theme} station={station} colors={colors} sub={subtitle(load)} onPick={onPick} />
      {load.kind === 'failed' ? null : <SectionTitle theme={theme} title="곧 오는 열차" />}
      {load.kind === 'loading' ? <Skeleton theme={theme} rows={Math.min(4, Math.max(2, station.lines.length * 2))} /> : null}
      {load.kind === 'ready' && cards.length ? <View style={styles.cards}>{cards.map((card) => <Card key={`${card.line}|${card.direction}`} theme={theme} card={card} color={colors[card.line] ?? theme.literal.lineFallback} />)}</View> : null}
      {load.kind === 'ready' && !cards.length ? <Text style={[styles.empty, bodyFont(theme), { color: theme.color.muted }]}>지금 도착 예정 열차 정보가 없어요.</Text> : null}
      {load.kind === 'ready' && exits.length ? (
        <>
          <SectionTitle theme={theme} title="출구" />
          <View style={styles.exits}>
            {exits.map((exit) => (
              <View key={exit.ref} accessible accessibilityLabel={`${exit.ref}번 출구${exit.wheelchair ? ' · 휠체어 가능' : ''}`}
                style={[styles.exit, { backgroundColor: theme.literal.exitBackground, boxShadow: theme.shadow.edgeChip }]}>
                <Text style={[styles.exitText, bodyFont(theme), { color: theme.literal.exitInk }]}>{exit.ref}</Text>
                {exit.wheelchair ? <Text style={styles.exitWheel}>♿</Text> : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

function subtitle(load: Load): string {
  if (load.kind === 'failed') return '도착 정보를 불러오지 못했어요. 잠시 후 다시 눌러 주세요.';
  if (load.kind === 'ready') return `서울시 실시간 도착정보 · ${seoulTime(load.answer.fetchedAt)} 기준`;
  return '도착 정보 불러오는 중…';
}

const bodyFont = (theme: Theme) => ({ fontFamily: theme.font.body });

function Head({ theme, station, colors, sub, onPick }: { theme: Theme; station: StationInfo; colors: LineColors; sub: string; onPick(end: 'from' | 'to'): void }) {
  return (
    <>
      <View style={styles.chips}>
        {station.lines.map((line, index) => {
          const lineColor = colors[line] ?? theme.literal.lineFallback;
          return (
            <View key={line} style={[styles.chip, index > 0 && styles.chipNext, { borderColor: theme.literal.chipEdge }]}>
              <View style={[styles.chipDot, { backgroundColor: lineColor }]} />
              <Text style={[styles.chipText, bodyFont(theme), { color: lineColor }]}>{line}</Text>
            </View>
          );
        })}
      </View>
      <Text style={[styles.name, { color: theme.color.ink, fontFamily: theme.font.round }]} accessibilityRole="header">{station.name}</Text>
      <Text style={[styles.sub, bodyFont(theme), { color: theme.name === 'dark' ? theme.color.secondary : sheetColors.nowLight }]}>{sub}</Text>
      <View style={styles.journey}>
        <SheetButton label="여기서 출발" onPress={() => onPick('from')} />
        <SheetButton label="여기로 도착" primary onPress={() => onPick('to')} />
      </View>
    </>
  );
}

function SectionTitle({ theme, title }: { theme: Theme; title: string }) {
  return <Text style={[styles.section, bodyFont(theme), { color: theme.name === 'dark' ? theme.color.ink : theme.color.secondary, borderBottomColor: theme.color.rule }]}>{title}</Text>;
}

function Card({ theme, card, color: lineColor }: { theme: Theme; card: ArrivalCard; color: string }) {
  return (
    <View style={styles.card}>
      <DashedRule color={theme.color.rule} />
      <View style={styles.cardHead}>
        <View style={[styles.cardDot, { backgroundColor: lineColor }]} />
        <Text style={[styles.cardLine, bodyFont(theme), { color: lineColor }]}>{card.line} <Text style={[styles.cardMuted, { color: theme.color.muted }]}>{card.direction}{card.toward ? ` · ${card.toward}` : ''}</Text></Text>
      </View>
      {card.rows.map((row, index) => (
        <View key={`${row.text}-${index}`} style={styles.row}>
          <Text style={[styles.rowText, bodyFont(theme), { color: theme.color.ink }]}>{row.text}</Text>
          <Text style={[styles.rowDest, bodyFont(theme), { color: theme.color.muted }]}>{row.destination}행{row.express ? ' · 급행' : ''}{row.last ? ' · 막차' : ''}</Text>
        </View>
      ))}
    </View>
  );
}

function Skeleton({ theme, rows }: { theme: Theme; rows: number }) {
  const bone = { backgroundColor: theme.color.control };
  return (
    <View style={styles.cards} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: rows }, (_unused, index) => (
        <View key={index} style={[styles.card, styles.boneCard]}>
          <DashedRule color={theme.color.rule} />
          <View style={[styles.boneFirst, bone]} />
          <View style={[styles.boneSecond, bone]} />
          <View style={[styles.boneThird, bone]} />
        </View>
      ))}
    </View>
  );
}

// 카드 아래 1px 점선(border-bottom:1px dashed): iOS 는 한 변만 점선을 못 그려, 네 변 점선 상자의 윗변만 잘라 보인다
function DashedRule({ color }: { color: string }) {
  return <View style={styles.dashedRule}><View style={[styles.dashedBox, { borderColor: color }]} /></View>;
}

const styles = StyleSheet.create({
  dashedRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, overflow: 'hidden' },
  dashedBox: { height: 3, borderWidth: 1, borderStyle: 'dashed' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chipNext: { marginLeft: tokens.space[1] },   // 웹 .chip+.chip — 줄이 바뀌어도 그대로 4px 밀린다
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: tokens.radius.pill, paddingVertical: 3, paddingRight: 10, paddingLeft: tokens.space[2] },
  chipDot: { width: 9, height: 9, borderRadius: 4.5 },
  chipText: { fontSize: tokens.text['12.5'], fontWeight: tokens.weight.bold },
  name: { fontSize: tokens.text[26], lineHeight: 33, marginTop: tokens.space[1], marginBottom: 2 },
  sub: { fontSize: tokens.text[14], lineHeight: 17 },
  journey: { flexDirection: 'row', gap: tokens.space[2], marginTop: 14 },   // 웹의 아래 여백 4px 은 다음 제목 위 14px 과 겹쳐 사라진다
  section: { marginTop: 14, paddingBottom: tokens.space[1], fontSize: tokens.text[12], lineHeight: 15, fontWeight: tokens.weight.bold, borderBottomWidth: 1 },
  cards: { marginTop: tokens.space[2], gap: tokens.space[2] },
  card: { gap: 3, paddingTop: tokens.space[2], paddingBottom: tokens.space[2] + 1 },   // 웹은 아래 점선 1px 이 높이에 든다
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardDot: { width: 8, height: 8, borderRadius: 4 },
  cardLine: { flexShrink: 1, fontSize: tokens.text[13], lineHeight: 16, fontWeight: tokens.weight.bold },
  cardMuted: { fontWeight: tokens.weight.medium },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: tokens.space[2], paddingLeft: 14 },
  rowText: { minWidth: 63, fontSize: tokens.text[14], lineHeight: 17, fontWeight: tokens.weight.bold, fontVariant: ['tabular-nums'] },
  rowDest: { flexShrink: 1, fontSize: tokens.text[13], lineHeight: 16 },
  empty: { marginTop: tokens.space[2], fontSize: tokens.text[13] },
  exits: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: tokens.space[2] },
  exit: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: tokens.radius[8], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  exitText: { fontSize: tokens.text[12], fontWeight: tokens.weight.extrabold },
  exitWheel: { fontSize: tokens.text[11] },
  boneCard: { gap: 7 },
  boneFirst: { height: 12, width: '46%', borderRadius: tokens.radius[6] },
  boneSecond: { height: 15, width: '62%', marginLeft: 14, borderRadius: tokens.radius[6] },
  boneThird: { height: 15, width: '52%', marginLeft: 14, borderRadius: tokens.radius[6] },
});
