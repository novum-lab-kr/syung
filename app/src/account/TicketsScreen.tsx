// 승차권 목록(웹 web/user/tickets_view.tsx Front · Card · TicketsPage 와 같은 칸 · 값): 카드 앞면 → 누르면 뒤집혀 뒷면(출발 → 갈아타는 역 → 도착 · 경로 자세히 · 출발 시각 · 타는 날 · 고치기).
// 뒤집을 때 사용 횟수 ticket 을 센다(웹과 같다). '지도에서 보기' 는 지도 다리가 붙은 뒤에 넣는다 — 동작 없는 단추를 두지 않는다(계획서 9-1).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useReducedMotion, useTheme } from '../theme/useTheme';
import type { Ticket } from './api';
import { BrandLogo, ChevronDown, TicketLogo } from './icons';
import { LINE_COLORS, StepList } from './journey';
import { size, ticket as look } from './literals';
import { countUse } from './session';
import { body, makeStyles, round } from './style';
import { shortName } from './ticketRoutes';
import { DAYS, daysText, fillChain, loadTickets, ticketListTurn, todayDay, useTickets, type Chain } from './tickets';
import { Message, Screen } from './ui';

const LOGOS = [0, 1, 2, 3, 4];
const STRIP = [0, 1, 2, 3, 4, 5, 6];
const FLIP_MS = 600;   // .ticket-in transition
const HALF_TURN = { inputRange: [0, 1], outputRange: ['0deg', '180deg'] };
const BACK_TURN = { inputRange: [0, 1], outputRange: ['180deg', '360deg'] };

const useStyles = makeStyles(theme => ({
  wait: { marginTop: 40 },
  // 웹 .tickets-page 는 .account-page 의 좌우 10px 가 없어 카드가 그만큼 넓다
  list: { gap: tokens.space[3], marginHorizontal: -10 },
  retry: { alignItems: 'center', justifyContent: 'center', minHeight: 46, marginTop: tokens.space[3], borderRadius: tokens.radius[14], backgroundColor: theme.color.control },
  retryText: body(theme, tokens.text[14], tokens.weight.bold),
  add: { alignItems: 'center', justifyContent: 'center', minHeight: 46, marginTop: tokens.space[3], marginHorizontal: -10, borderRadius: tokens.radius[14], backgroundColor: theme.color.control },
  addText: body(theme, tokens.text[14], tokens.weight.bold),
  ticket: { height: 158 },
  face: { ...absolute(), borderRadius: tokens.radius[18], backgroundColor: look.face, boxShadow: `${theme.shadow.edgeBrand}, ${look.edgeShadow}`, backfaceVisibility: 'hidden' },
  back: { backgroundColor: look.back },
  perforation: { position: 'absolute', top: 6, right: 6, bottom: 6, left: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: look.dashed, borderRadius: tokens.radius[12] + 1 },
  logos: { position: 'absolute', top: 7, right: 7, bottom: 7, left: 7, overflow: 'hidden', borderRadius: tokens.radius[12] },
  logoRow: { position: 'absolute', top: 17, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 14 },
  logo: { opacity: 0.7, transform: [{ rotate: '-20deg' }] },
  top: { position: 'absolute', top: 14, left: 18, right: 18, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  name: { ...round(theme, tokens.text[24], look.name), lineHeight: 30, opacity: 0.8, flexShrink: 1 },
  time: { ...round(theme, size.ticketTime, look.name), lineHeight: 30, letterSpacing: -0.5, marginLeft: 10, opacity: 0.8 },
  strip: { position: 'absolute', top: 94, left: 7, right: 7, height: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, overflow: 'hidden', backgroundColor: look.stripBack, borderTopWidth: 1, borderBottomWidth: 1, borderColor: look.stripEdge },
  stripItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  stripLogo: { width: 13, height: 13, borderRadius: 4, overflow: 'hidden' },
  stripText: round(theme, tokens.text[12], look.stripInk),
  serial: { position: 'absolute', left: 18, bottom: 14, fontFamily: 'Menlo', fontSize: size.serial, fontWeight: tokens.weight.regular, lineHeight: 16, letterSpacing: 1, color: look.serial },
  today: { ...round(theme, tokens.text[12], look.todayInk), position: 'absolute', right: 48, bottom: 12, paddingVertical: 2, paddingHorizontal: 9, lineHeight: 18, borderRadius: tokens.radius.pill, overflow: 'hidden', backgroundColor: look.todayBack, boxShadow: look.todayShadow, transform: [{ rotate: '-7deg' }] },
  flip: { position: 'absolute', right: 17, bottom: 12, width: 23, height: 23, alignItems: 'center', justifyContent: 'center', borderRadius: 11.5, backgroundColor: look.flipBack },
  // 웹은 900 14px 이지만 ↻ 글자가 iOS 시스템 글꼴에서 더 크고 굵게 나와, 캡처에 맞춰 크기 · 굵기를 줄였다
  flipText: { fontSize: 11, fontWeight: tokens.weight.bold, lineHeight: 23, color: look.faceInk },
  chain: { ...round(theme, tokens.text[13], look.chain), position: 'absolute', top: 12, left: 17, right: 17, lineHeight: tokens.text[13] * 1.4 },
  chainWait: { color: look.chainSoft },
  arrow: { color: look.chainSoft },
  chainTag: { ...body(theme, 10, tokens.weight.bold, look.chainSoft), lineHeight: 14 },
  alts: { position: 'absolute', right: 17, bottom: 82, flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingHorizontal: tokens.space[1] },
  altsText: { ...round(theme, tokens.text[11], look.soft), lineHeight: 17 },
  timeRow: { position: 'absolute', left: 17, right: 17, bottom: 84, flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  timeLabel: round(theme, tokens.text[11], look.soft),
  timeValue: round(theme, tokens.text[16], look.timeValue),
  mag: { position: 'absolute', left: 7, right: 7, bottom: 52, height: 24, backgroundColor: look.mag, boxShadow: look.magShadow },
  foot: { position: 'absolute', left: 17, right: 17, bottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footText: round(theme, tokens.text[11], look.soft),
  edit: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: tokens.radius.pill, backgroundColor: look.faceInk },
  editText: { ...round(theme, tokens.text[11], look.editInk), lineHeight: 17 },
  pressed: { transform: [{ scale: 0.94 }] },
  chevronOpen: { transform: [{ rotate: '180deg' }] },   // .tk-steps-btn[aria-expanded=true] svg
  steps: { marginTop: -4, marginBottom: tokens.space[1], paddingTop: tokens.space[3], paddingHorizontal: 14, paddingBottom: 6, borderRadius: tokens.radius[16], backgroundColor: theme.color.control },
}));
function absolute() { return { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const; }

export function TicketsScreen() {
  const list = useTickets();
  const styles = useStyles();
  const theme = useTheme();
  // 발권 화면에서 돌아올 때마다 다시 받는다(웹도 서랍을 열 때 받는다)
  useFocusEffect(useCallback(() => { void loadTickets(); }, []));
  return (
    <Screen title="승차권">
      {list.status === 'loading' && <ActivityIndicator color={theme.color.ink} style={styles.wait} />}
      {list.status === 'error' && (
        <>
          <Message>{list.message}</Message>
          <Pressable onPress={() => void loadTickets()} accessibilityRole="button" style={styles.retry}><Text style={styles.retryText}>다시 시도</Text></Pressable>
        </>
      )}
      {list.status === 'ready' && <View style={styles.list}>{list.tickets.map(ticket => <Card key={`${ticketListTurn()}-${ticket.id}`} ticket={ticket} />)}</View>}
      <Pressable onPress={() => router.push('/account/ticket')} accessibilityRole="button" style={styles.add}><Text style={styles.addText}>+ 승차권 예매하기</Text></Pressable>
    </Screen>
  );
}

// 앞면(목록 카드 · 발권 화면 미리보기). id 가 없으면 미리보기라 오늘 · 뒤집기 표시를 뺀다
export function TicketFront({ ticket }: { ticket: Pick<Ticket, 'name' | 'depart' | 'days'> & { id?: number } }) {
  const styles = useStyles();
  const name = ticket.name || '승차권';
  const label = ticket.name ? `${name}권` : name;   // 이름이 없으면 '승차권'(승차권권 아님)
  // 웹은 HTML 이 빈칸을 하나로 합친다 — 요일이 없을 때 앱도 한 칸만 띄운다
  const dayText = ticket.days.map(day => DAYS[day - 1]).join('');
  const serial = [ticket.id ? String(ticket.id).padStart(4, '0') : '----', dayText, ticket.depart.replace(':', '')].filter(Boolean).join(' ');
  return (
    <>
      <View style={styles.logos}><View style={styles.logoRow}>{LOGOS.map(key => <View key={key} style={styles.logo}><TicketLogo color={look.logo} /></View>)}</View></View>
      <View style={styles.perforation} />
      <View style={styles.top}><Text style={styles.name} numberOfLines={1}>{name}</Text><Text style={styles.time}>{ticket.depart || '--:--'}</Text></View>
      <View style={styles.strip}>{STRIP.map(key => <View key={key} style={styles.stripItem}><View style={styles.stripLogo}><BrandLogo size={13} /></View><Text style={styles.stripText}>{label}</Text></View>)}</View>
      <Text style={styles.serial}>{serial}</Text>
      {ticket.id && ticket.days.includes(todayDay()) ? <Text style={styles.today}>오늘</Text> : null}
      {ticket.id ? <View style={styles.flip}><Text style={styles.flipText}>↻</Text></View> : null}
    </>
  );
}
export function TicketPreview({ ticket }: { ticket: Pick<Ticket, 'name' | 'depart' | 'days'> & { id?: number } }) {
  const styles = useStyles();
  return <View style={styles.ticket} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><View style={styles.face}><TicketFront ticket={ticket} /></View></View>;
}

function Card({ ticket }: { ticket: Ticket }) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const [turn] = useState(() => new Animated.Value(0));
  const [flipped, setFlipped] = useState(false);
  const [chain, setChain] = useState<Chain | null>(null);
  const [opened, setOpened] = useState(false);
  const flip = () => {
    const next = !flipped;
    setFlipped(next);
    Animated.timing(turn, { toValue: next ? 1 : 0, duration: reduced ? 0 : FLIP_MS, easing: Easing.bezier(0.3, 0.7, 0.2, 1.1), useNativeDriver: true }).start();
    if (!next) return;
    void fillChain(ticket).then(setChain);
    countUse('ticket');
  };
  const names = chain?.names ?? [shortName(ticket.from.name), shortName(ticket.to.name)];
  return (
    <>
      <Pressable onPress={flip} accessibilityRole="button" accessibilityLabel={[ticket.name, '승차권', ticket.depart].filter(Boolean).join(' ')} accessibilityHint={flipped ? '앞면 보기' : '뒷면 보기'} style={styles.ticket}>
        <Animated.View pointerEvents={flipped ? 'none' : 'auto'} style={[styles.face, { transform: [{ perspective: 900 }, { rotateY: turn.interpolate(HALF_TURN) }] }]}>
          <TicketFront ticket={ticket} />
        </Animated.View>
        <Animated.View pointerEvents={flipped ? 'auto' : 'none'} style={[styles.face, styles.back, { transform: [{ perspective: 900 }, { rotateY: turn.interpolate(BACK_TURN) }] }]}>
          <View style={styles.perforation} />
          <Text style={[styles.chain, !chain && styles.chainWait]} numberOfLines={2}>
            {names.map((each, index) => <Text key={`${index}${each}`}>{index > 0 && <Text style={styles.arrow}>{' → '}</Text>}{each}</Text>)}
            {chain?.tag ? <Text style={styles.chainTag}>{`  ${chain.tag}`}</Text> : null}
          </Text>
          {ticket.route && (
            <Pressable onPress={() => setOpened(!opened)} accessibilityRole="button" accessibilityState={{ expanded: opened }} hitSlop={6} style={styles.alts}>
              <Text style={styles.altsText}>경로 자세히</Text><View style={opened ? styles.chevronOpen : null}><ChevronDown size={12} width={2.6} color={look.soft} /></View>
            </Pressable>
          )}
          <View style={styles.timeRow}><Text style={styles.timeLabel}>출발 시각</Text><Text style={styles.timeValue}>{ticket.depart}</Text></View>
          <View style={styles.mag} />
          <View style={styles.foot}>
            <Text style={styles.footText}>{`타는 날 ${daysText(ticket.days)}`}</Text>
            <Pressable onPress={() => router.push({ pathname: '/account/ticket', params: { id: String(ticket.id) } })} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.edit, pressed && styles.pressed]}>
              <Text style={styles.editText}>고치기 ›</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
      {opened && ticket.route && <View style={styles.steps}><StepList legs={ticket.route.legs} ends={{ from: ticket.from.name, to: ticket.to.name }} colors={LINE_COLORS} /></View>}
    </>
  );
}
