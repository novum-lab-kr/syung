// 열차 시트: web/ui/train_sheet.tsx(구조 · 문구) + popups.mts 스타일 + syung.css(.sheet .kv · .ride-*). 글은 지도가 trainUpdate 로 1초마다 보낸 값을 그대로 쓴다(앱이 예측 문구를 만들지 않는다).
// 웹처럼 열면 그 열차를 따라가고(watchTrain · followTrain), 닫으면 놓는다(unwatchTrain). 첫 trainUpdate 는 watchTrain 바로 뒤에 오므로 그때 시트를 올린다.
// 열차가 없어지면(trainGone) 부모가 이 시트를 내린다.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FollowButton, Sheet } from '../components/Sheet';
import type { TrainInfo } from '../map/bridge';
import { tokens } from '../theme/tokens';
import { useTheme, type Theme } from '../theme/useTheme';
import type { LineColors, Seat, SendCommand, TrainRaw, TrainUpdate } from './types';
import { sheetColors } from './webColors';

interface Props { train: TrainInfo; update: TrainUpdate | null; colors: LineColors; letGo: boolean; send: SendCommand; onClose(): void }

// first_person.mts seatLabel
const seatLabel = (seat: Seat) => `${seat.car}칸 ${seat.row}열 ${seat.side < 0 ? '왼쪽' : '오른쪽'}`;
const sameSeat = (left: Seat, right: Seat) => left.car === right.car && left.row === right.row && left.side === right.side;
const SIDES = [-1, 1] as const;
const numbers = (count: number) => Array.from({ length: count }, (_unused, index) => index + 1);

export function TrainSheet({ train, update, colors, letGo, send, onClose }: Props) {
  const theme = useTheme();
  const [picked, setPicked] = useState<Seat | null>(null);

  useEffect(() => {
    send({ type: 'watchTrain', id: train.id });
    send({ type: 'followTrain', id: train.id });
    return () => send({ type: 'unwatchTrain' });
  }, [send, train.id]);

  if (!update) return null;
  const color = colors[train.line] ?? theme.literal.lineFallback;
  const ride = update.ride;
  const seat = picked ?? ride?.seat ?? null;
  const dark = theme.name === 'dark';
  const body = { fontFamily: theme.font.body };
  return (
    <Sheet onClose={onClose}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.line, body, { color }]}>{train.line}</Text>
        <Text style={[styles.number, body]}>{train.trainNo}</Text>
        {train.express ? <Text style={[styles.badge, body, { backgroundColor: color }]}>급행</Text> : null}
        {train.last ? <Text style={[styles.badge, body, { backgroundColor: sheetColors.badgeLast }]}>막차</Text> : null}
      </View>
      <Text style={[styles.dest, { color: theme.color.ink, fontFamily: theme.font.round }]} accessibilityRole="header">{update.dest}</Text>
      <Text style={[styles.now, body, { color: dark ? theme.color.secondary : sheetColors.nowLight }]}>{update.now}</Text>
      {ride && seat ? (
        <>
          <Section theme={theme} title="자리 고르고 타기" note=" · 위가 진행 방향" />
          <View style={styles.pick}>
            {numbers(ride.cars).map((car) => (
              <View key={car} style={styles.car}>
                <Text style={[styles.carName, body, { color: theme.color.muted }]}>{car === 1 ? '맨 앞' : car}</Text>
                <View style={[styles.seats, car === 1 ? styles.seatsLead : null, { backgroundColor: theme.color.rule }]}>
                  {numbers(ride.rows).flatMap((row) => SIDES.map((side) => {
                    const here = { car, row, side };
                    const on = sameSeat(here, seat);
                    return (
                      <Pressable key={`${row}${side}`} onPress={() => setPicked(here)} accessibilityRole="button" accessibilityLabel={seatLabel(here)} accessibilityState={{ selected: on }}
                        style={[styles.seat, on
                          ? { backgroundColor: color, boxShadow: `inset 0 0 0 2px ${theme.color.ink}` }
                          : { backgroundColor: theme.color.paper, boxShadow: `inset 0 0 0 1.5px ${theme.color.muted}` }]} />
                    );
                  }))}
                </View>
              </View>
            ))}
          </View>
          <Pressable onPress={() => send({ type: 'startRide', id: train.id, seat })} accessibilityRole="button"
            style={[styles.go, { backgroundColor: theme.color.syung, boxShadow: theme.shadow.edge }]}>
            <Text style={[styles.goText, { color: theme.color.syungInk, fontFamily: theme.font.round }]}>{`${seatLabel(seat)}에 타기`}</Text>
          </Pressable>
        </>
      ) : null}
      <Section theme={theme} title="서울시 실시간 원본" />
      <Raw theme={theme} raw={update.raw} />
      {letGo ? <FollowButton label="이 열차 따라가기" onPress={() => send({ type: 'followTrain', id: train.id })} /> : null}
    </Sheet>
  );
}

function Section({ theme, title, note }: { theme: Theme; title: string; note?: string }) {
  return (
    <Text style={[styles.section, { fontFamily: theme.font.body, color: theme.name === 'dark' ? theme.color.ink : theme.color.secondary, borderBottomColor: theme.color.rule }]}>
      {title}{note ? <Text style={[styles.sectionNote, { color: theme.color.muted }]}>{note}</Text> : null}
    </Text>
  );
}

function Raw({ theme, raw }: { theme: Theme; raw: TrainRaw }) {
  const label = [styles.key, { color: theme.color.muted, fontFamily: theme.font.body }];
  const value = [styles.value, { color: theme.color.ink, fontFamily: theme.font.body }];
  return (
    <View style={styles.table}>
      <View style={styles.tableRow}>
        <Text style={label}>역</Text><Text style={value}>{raw.station}</Text>
        <Text style={label}>상태</Text><Text style={value}>{raw.status}</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={label}>방향</Text><Text style={value}>{raw.direction}</Text>
        <Text style={label}>행선지</Text><Text style={value}>{raw.destination}</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={label}>기록 시각</Text>
        <Text style={value}>{`${raw.recorded} `}<Text style={[styles.valueNote, { color: theme.color.muted }]}>{`(${raw.ageSec}초 전)`}</Text></Text>
        <Text style={label}>받은 시각</Text><Text style={value}>{raw.fetched}</Text>
      </View>
    </View>
  );
}

// .sheet .kv 의 auto 칸 — 가장 긴 이름("기록 시각" 13px) 폭. RN 은 grid 가 없어 줄마다 같은 폭으로 맞춘다
const KEY_WIDTH = 49;   // 웹은 칸 폭이 글자 폭(기록 시각 13px = 48.3)

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  line: { fontSize: tokens.text['12.5'], lineHeight: 15, fontWeight: tokens.weight.bold },
  number: { color: sheetColors.trainNo, fontSize: tokens.text['12.5'], fontWeight: tokens.weight.semibold, fontVariant: ['tabular-nums'] },
  badge: { fontSize: tokens.text['10.5'], fontWeight: tokens.weight.extrabold, color: sheetColors.onColor, borderRadius: tokens.radius.pill, overflow: 'hidden', paddingVertical: 1, paddingHorizontal: 7 },
  dest: { fontSize: tokens.text[26], lineHeight: 33, marginTop: tokens.space[1], marginBottom: 2 },
  now: { fontSize: tokens.text[14], lineHeight: 17 },
  section: { marginTop: 14, paddingBottom: tokens.space[1], fontSize: tokens.text[12], lineHeight: 15, fontWeight: tokens.weight.bold, borderBottomWidth: 1 },
  sectionNote: { fontWeight: tokens.weight.medium },
  pick: { flexDirection: 'row', flexWrap: 'wrap', rowGap: tokens.space[2], columnGap: 6, marginTop: 10, marginBottom: 2 },
  car: { alignItems: 'center', gap: 3 },
  carName: { fontSize: tokens.text['10.5'], fontWeight: tokens.weight.bold },
  seats: {
    width: 54, flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[1], paddingTop: 6, paddingHorizontal: 5, paddingBottom: 5,
    borderTopLeftRadius: tokens.radius[9], borderTopRightRadius: tokens.radius[9], borderBottomLeftRadius: tokens.radius[5], borderBottomRightRadius: tokens.radius[5],
  },
  seatsLead: { paddingTop: tokens.space[3], borderTopLeftRadius: tokens.radius[18], borderTopRightRadius: tokens.radius[18] },
  seat: { width: 20, height: 20, borderRadius: tokens.radius[5] },
  go: { marginTop: 10, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.pill },
  goText: { fontSize: tokens.text[16] },
  table: { gap: 6, marginTop: tokens.space[2] },
  tableRow: { flexDirection: 'row', alignItems: 'baseline', columnGap: tokens.space[3] },
  key: { width: KEY_WIDTH, fontSize: tokens.text[13], lineHeight: 16, fontWeight: tokens.weight.semibold },
  value: { flex: 1, fontSize: tokens.text[13], lineHeight: 16, fontWeight: tokens.weight.semibold },
  valueNote: { fontWeight: tokens.weight.medium },
});
