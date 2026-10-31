// 버스 시트: web/bus/sheet_view.tsx(구조 · 문구) + syung.css(.bus-*). 그릴 거리는 지도가 busTap · busUpdate 로 보낸 view 그대로이고,
// 남은 시간만 웹 tickArrivals 처럼 앱이 at(도착 예상 epoch ms)으로 1초마다 다시 센다. closeBus 는 지도 화면이 시트가 닫힐 때 한 곳에서 보낸다.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { FollowButton, Sheet } from '../components/Sheet';
import { tokens } from '../theme/tokens';
import { useReducedMotion, useTheme, type Theme } from '../theme/useTheme';
import { BusOutlineIcon, RefreshIcon } from './icons';
import type { BusBadgeView, BusFollowLineView, BusHeroView, BusRouteSheetView, BusRowView, BusSheetView, BusStopSheetView, SendCommand } from './types';
import { sheetColors } from './webColors';

interface Props { view: BusSheetView; followAgainId: string | null; send: SendCommand; onClose(): void }

// bus/layer.mts countdownText 와 같은 글
export function countdownText(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total <= 0) return '도착 중';
  if (total < 60) return `${total}초`;
  return `${Math.floor(total / 60)}분 ${String(total % 60).padStart(2, '0')}초`;
}

const heroColors = (theme: Theme) => ({ hero: sheetColors.hero[theme.name], line: sheetColors.heroLine[theme.name], dim: sheetColors.heroDim[theme.name] });

export function BusSheet({ view, followAgainId, send, onClose }: Props) {
  return (
    <Sheet onClose={onClose} bleed>
      {view.kind === 'stop' ? <StopSheet view={view} send={send} /> : <RouteSheet view={view} />}
      {followAgainId && view.kind === 'route' ? <FollowButton label="이 버스 따라가기" onPress={() => send({ type: 'followBus', id: followAgainId })} /> : null}
    </Sheet>
  );
}

// 노선 번호 배지(.bus-num): place 는 놓인 자리마다 다른 높이 · 글자 크기
type BadgePlace = 'row' | 'follow' | 'heroOne' | 'heroMany';
const BADGE_SIZE: Record<BadgePlace, { height: number; fontSize: number; longSize: number; padding: number; longPadding: number; radius: number }> = {
  row: { height: 28, fontSize: tokens.text[16], longSize: tokens.text[12], padding: tokens.space[2], longPadding: tokens.space[1], radius: tokens.radius[7] },
  follow: { height: 26, fontSize: tokens.text[16], longSize: tokens.text[12], padding: tokens.space[2], longPadding: tokens.space[1], radius: tokens.radius[7] },
  heroOne: { height: 26, fontSize: tokens.text[18], longSize: tokens.text[14], padding: 10, longPadding: tokens.space[1], radius: tokens.radius[7] },
  heroMany: { height: 24, fontSize: tokens.text[16], longSize: tokens.text[13], padding: tokens.space[2], longPadding: 6, radius: tokens.radius[7] },
};

function Badge({ badge, place }: { badge: BusBadgeView; place: BadgePlace }) {
  const theme = useTheme();
  const size = BADGE_SIZE[place];
  return (
    <View style={[styles.badge, { height: size.height, borderRadius: size.radius, paddingHorizontal: badge.long ? size.longPadding : size.padding, backgroundColor: badge.color }]}>
      <Text numberOfLines={1} style={{ fontFamily: theme.font.round, color: sheetColors.onColor, fontSize: badge.long ? size.longSize : size.fontSize, letterSpacing: badge.long ? size.longSize * -0.02 : 0 }}>{badge.name}</Text>
    </View>
  );
}

// 따라가는 동안 켜지는 점: syung-pulse(1.4초 · 1.35배)
function PulseDot({ theme }: { theme: Theme }) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) return undefined;
    const half = tokens.duration[1400] / 2;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, scale]);
  return <Animated.View style={[styles.followDot, { backgroundColor: theme.color.syung, transform: [{ scale }] }]} />;
}

function followButtonColors(theme: Theme, following: boolean, stop: boolean) {
  const dark = theme.name === 'dark';
  if (following) return stop ? { background: sheetColors.followStop, ink: sheetColors.cream } : { background: theme.color.syung, ink: theme.color.syungInk };
  if (stop) return { background: theme.color.paper, ink: theme.color.ink, shadow: `inset 0 0 0 1px ${theme.color.rule}` };
  return dark ? { background: theme.color.syung, ink: theme.color.syungInk } : { background: theme.color.syungInk, ink: sheetColors.cream };
}

function followBackground(theme: Theme, following: boolean): string {
  if (!following) return theme.color.control;
  return theme.name === 'dark' ? sheetColors.followDark : theme.color.syungInk;
}

function FollowLine({ line, send, first }: { line: BusFollowLineView; send: SendCommand; first?: boolean }) {
  const theme = useTheme();
  const ink = line.following ? sheetColors.cream : theme.color.ink;
  const body = { fontFamily: theme.font.body };
  return (
    <View style={[styles.follow, first ? null : styles.followGap, { backgroundColor: followBackground(theme, line.following) }]}>
      <View style={styles.followState} accessibilityLiveRegion="polite">
        {line.following ? <PulseDot theme={theme} /> : null}
        <Badge badge={line.badge} place="follow" />
        <View style={styles.followText}>
          <Text style={[styles.followName, body, { color: ink }]}>{line.state}</Text>
          {line.arrival ? <Text style={[styles.followArrival, body, { color: ink }]}>{line.arrival}</Text> : null}
        </View>
      </View>
      <View style={styles.followActions}>
        {line.buttons.map((button) => {
          const colors = followButtonColors(theme, line.following, button.what === 'stop');
          return (
            <Pressable key={button.what} accessibilityRole="button" accessibilityLabel={button.aria || undefined}
              onPress={() => send({ type: 'busStopView', what: button.what as 'follow' | 'route' | 'stop' })}
              style={[styles.followButton, { backgroundColor: colors.background, boxShadow: colors.shadow }]}>
              <Text numberOfLines={1} style={[styles.followButtonText, body, { color: colors.ink }]}>{button.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// 버스 아이콘 자리: 웹 transition:left 1s linear
function TrackBus({ ratio }: { ratio: number }) {
  const reduced = useReducedMotion();
  const [left] = useState(() => new Animated.Value(ratio));
  useEffect(() => {
    if (reduced) { left.setValue(ratio); return; }
    Animated.timing(left, { toValue: ratio, duration: 1000, easing: Easing.linear, useNativeDriver: false }).start();
  }, [left, ratio, reduced]);
  const position = left.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] });
  return (
    <Animated.View style={[styles.trackBus, { left: position }]}>
      <BusOutlineIcon color={sheetColors.onColor} size={16} />
    </Animated.View>
  );
}

function Hero({ hero, send }: { hero: BusHeroView; send: SendCommand }) {
  const theme = useTheme();
  const colors = heroColors(theme);
  const body = { fontFamily: theme.font.body };
  const [firstBadge] = hero.badges;
  const content = (
    <>
      {hero.one && firstBadge ? (
        <View style={styles.heroHead}>
          <Badge badge={firstBadge} place="heroOne" />
          <Text numberOfLines={1} style={[styles.heroDirection, body]}>{hero.direction}</Text>
          {hero.onMap ? <Text style={[styles.heroOnMap, body, { color: theme.color.syung }]}>지도에 표시 중</Text> : null}
        </View>
      ) : (
        <View style={[styles.heroHead, styles.heroMany]}>
          {hero.badges.map((badge) => <Badge key={badge.name} badge={badge} place="heroMany" />)}
          {hero.more > 0 ? (
            <View style={[styles.badge, styles.badgeMore]}><Text style={{ fontFamily: theme.font.round, color: sheetColors.cream, fontSize: tokens.text[16] }}>{`+${hero.more}`}</Text></View>
          ) : null}
        </View>
      )}
      <View style={styles.heroNow}>
        <Text style={[styles.heroSoon, { color: theme.color.syung, fontFamily: theme.font.round }]}>곧 도착</Text>
        {hero.next ? <Text style={[styles.heroNext, body]}>{hero.next}</Text> : null}
      </View>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.trackLine, styles.trackLineBefore, { backgroundColor: colors.line }]} />
        <View style={[styles.trackLine, styles.trackLineAfter, { backgroundColor: colors.dim }]} />
        <View style={[styles.trackEnd, styles.trackFrom]} />
        <TrackBus ratio={hero.ratio} />
        <View style={[styles.trackHere, { backgroundColor: theme.color.syung }]} />
        <View style={[styles.trackEnd, styles.trackTo, { backgroundColor: colors.line }]} />
      </View>
      <View style={styles.trackNames}>
        <Text numberOfLines={2} style={[styles.trackName, styles.trackPrev, body]}>{hero.prev}</Text>
        <Text numberOfLines={2} style={[styles.trackName, styles.trackStop, body, { color: theme.color.syung }]}>{hero.stop}</Text>
        <Text numberOfLines={2} style={[styles.trackName, styles.trackNext, body]}>{hero.after}</Text>
      </View>
    </>
  );
  const box = [styles.hero, { backgroundColor: colors.hero }];
  if (!hero.button) return <View style={box}>{content}</View>;
  return (
    <Pressable style={box} accessibilityRole="button" accessibilityState={{ selected: hero.pressed }} onPress={() => send({ type: 'busRoute', routeId: hero.routeId })}>
      {content}
    </Pressable>
  );
}

function RowTime({ row, now }: { row: BusRowView; now: number }) {
  const theme = useTheme();
  const { time } = row;
  const away = [styles.away, { color: theme.color.secondary, fontFamily: theme.font.body }];
  if (time.kind === 'wait') return <View style={[styles.wait, { backgroundColor: theme.color.control }]} />;
  if (time.kind === 'none') return <Text style={away}>도착 정보 없음</Text>;
  if (time.kind === 'away') return <Text style={away}>{time.text}</Text>;
  if (time.kind === 'soon') {
    return <View style={[styles.soon, { backgroundColor: theme.color.syung }]}><Text style={[styles.soonText, { color: theme.color.syungInk, fontFamily: theme.font.round }]}>곧 도착</Text></View>;
  }
  return (
    <View style={styles.rowTime}>
      {time.where ? <Text style={away}>{time.where}</Text> : null}
      <Text style={[styles.eta, { color: theme.color.ink, fontFamily: theme.font.body }]}>{countdownText((time.at - now) / 1000)}</Text>
    </View>
  );
}

function Row({ row, now, send }: { row: BusRowView; now: number; send: SendCommand }) {
  const theme = useTheme();
  const inner: ReactNode = (
    <>
      <View style={styles.rowBadge}><Badge badge={row.badge} place="row" /></View>
      <View style={styles.rowDirection}>
        <Text numberOfLines={1} style={[styles.rowDirectionText, { color: theme.color.ink, fontFamily: theme.font.body }]}>{row.direction}</Text>
        {row.tag ? <Text style={[styles.tag, { color: theme.color.secondary, borderColor: theme.color.rule, fontFamily: theme.font.body }]}>{row.tag}</Text> : null}
      </View>
      <RowTime row={row} now={now} />
    </>
  );
  const line = { borderBottomColor: theme.color.rule };
  if (!row.live) return <View style={[styles.row, line]}>{inner}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${row.badge.name} ${row.direction}, 곧 올 버스 따라가기`} accessibilityState={{ selected: row.pressed }}
      onPress={() => send({ type: 'busRoute', routeId: row.routeId })}
      style={[styles.row, line, row.pressed ? { backgroundColor: theme.color.selected, borderRadius: tokens.radius[12], borderBottomColor: 'transparent' } : null]}>
      {inner}
    </Pressable>
  );
}

function RefreshButton({ clock, loading, send }: { clock: string; loading: boolean; send: SendCommand }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [turn] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!loading || reduced) { turn.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [loading, reduced, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Pressable style={styles.refresh} accessibilityRole="button" accessibilityLabel={clock ? `도착 정보 새로 받기 · ${clock} 기준` : '도착 정보 새로 받기'} onPress={() => send({ type: 'busRefresh' })}>
      <Text style={[styles.refreshClock, { color: theme.color.secondary, fontFamily: theme.font.body }]}>{clock}</Text>
      <Animated.View style={{ transform: [{ rotate }] }}><RefreshIcon color={theme.color.secondary} size={16} /></Animated.View>
    </Pressable>
  );
}

function StopSheet({ view, send }: { view: BusStopSheetView; send: SendCommand }) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const counting = view.rows.some((row) => row.time.kind === 'eta');
  useEffect(() => {
    if (!counting) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);
  const body = { fontFamily: theme.font.body };
  const note = [styles.note, body, { color: theme.color.secondary }];
  // 따라가는 동안(멈춤 포함)은 상태 칸만
  if (view.compact) return view.followLine ? <FollowLine line={view.followLine} send={send} first /> : null;
  return (
    <View>
      <View style={styles.stopHead}>
        <View style={styles.stopTitle}>
          {view.arsId ? (
            <View style={[styles.stopNumber, { borderColor: theme.color.rule }]}>
              <BusOutlineIcon color={theme.color.secondary} size={13} />
              <Text style={[styles.stopNumberText, body, { color: theme.color.secondary }]}>{view.arsId}</Text>
            </View>
          ) : null}
          <Text accessibilityRole="header" style={[styles.stopName, { color: theme.color.ink, fontFamily: theme.font.round }]}>{view.name}</Text>
        </View>
        {view.refresh ? <RefreshButton clock={view.refresh.clock} loading={view.refresh.loading} send={send} /> : null}
      </View>
      {view.followLine ? <FollowLine line={view.followLine} send={send} /> : null}
      {view.note ? <Text style={note}>{view.note}</Text> : null}
      {view.stopNote ? <Text style={note} accessibilityLiveRegion="polite">{view.stopNote}</Text> : null}
      {view.mock ? <Text style={note}>예시 데이터 · 실제 운행 정보 아님</Text> : null}
      {view.hero ? <Hero hero={view.hero} send={send} /> : null}
      <View style={styles.rows}>{view.rows.map((row) => <Row key={row.routeId} row={row} now={now} send={send} />)}</View>
      {view.ended.length ? (
        <View style={styles.ended}>
          <Text style={[styles.endedTitle, body, { color: theme.color.secondary }]}>운행 종료</Text>
          {view.ended.map((item) => {
            const text = <Text style={[styles.endedText, body, { color: item.pressed ? theme.color.ink : theme.color.secondary }]}>{item.name}</Text>;
            const box = [styles.endedItem, { borderColor: theme.color.rule }];
            if (!item.live) return <View key={item.routeId} style={box}>{text}</View>;
            return (
              <Pressable key={item.routeId} accessibilityRole="button" accessibilityState={{ selected: item.pressed }} onPress={() => send({ type: 'busRoute', routeId: item.routeId })}
                style={[box, item.pressed ? { backgroundColor: theme.color.selected } : null]}>{text}</Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function RouteSheet({ view }: { view: BusRouteSheetView }) {
  const theme = useTheme();
  const body = { fontFamily: theme.font.body };
  const note = [styles.note, body, { color: theme.color.secondary }];
  return (
    <View>
      <Text accessibilityRole="header" style={[styles.routeTitle, { color: theme.color.ink, fontFamily: theme.font.round }]}>
        <Text style={[styles.routeType, body, { color: view.typeColor }]}>{view.typeName}</Text>{` ${view.name}번`}
      </Text>
      {view.grid ? (
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Text style={[styles.gridKey, body, { color: theme.color.secondary }]}>다음 정류장</Text>
            <View style={styles.gridValueBox}>
              <Text style={[styles.gridValue, body, { color: theme.color.ink }]}>{view.grid.next}</Text>
              {view.grid.onPath ? <Text style={[styles.gridSmall, body, { color: theme.color.secondary }]}>경로 기준</Text> : null}
            </View>
          </View>
          <View style={styles.gridRow}>
            <Text style={[styles.gridKey, body, { color: theme.color.secondary }]}>{view.grid.clockLabel}</Text>
            <View style={styles.gridValueBox}><Text style={[styles.gridValue, body, { color: theme.color.ink }]}>{view.grid.time}</Text></View>
          </View>
        </View>
      ) : null}
      <Text style={note}>{view.note}</Text>
      {view.approx ? <Text style={note}>정류장을 연결한 근사 경로예요.</Text> : null}
    </View>
  );
}

// .bus-detail-grid 의 auto 칸 — 가장 긴 이름("다음 정류장" 14px) 폭. RN 은 grid 가 없어 줄마다 같은 폭으로 맞춘다
const GRID_KEY_WIDTH = 74;

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeMore: { height: 24, paddingHorizontal: tokens.space[2], borderRadius: tokens.radius[7], borderWidth: 1, borderColor: sheetColors.moreEdge },
  note: { marginTop: tokens.space[2], fontSize: tokens.text[12], lineHeight: 19 },
  follow: { paddingTop: tokens.space[2], paddingHorizontal: 10, paddingBottom: 10, borderRadius: tokens.radius[14] },
  followGap: { marginTop: tokens.space[2] },
  followState: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] },
  followDot: { width: 10, height: 10, borderRadius: 5 },
  followText: { flexShrink: 1, minWidth: 0 },
  followName: { fontSize: tokens.text[14], lineHeight: 19, fontWeight: tokens.weight.bold },
  followArrival: { fontSize: tokens.text[12], lineHeight: 16, opacity: 0.78 },
  followActions: { flexDirection: 'row', gap: 6, marginTop: tokens.space[2] },
  followButton: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: tokens.space[2], alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[12] },
  followButtonText: { fontSize: tokens.text[14], fontWeight: tokens.weight.bold },
  stopHead: { flexDirection: 'row', alignItems: 'flex-end', gap: tokens.space[3] },
  stopTitle: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  stopNumber: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[1], marginBottom: tokens.space[1], paddingVertical: 2, paddingLeft: 7, paddingRight: 9, borderWidth: 1, borderRadius: tokens.radius.pill },
  stopNumberText: { fontSize: tokens.text[12], fontWeight: tokens.weight.extrabold, fontVariant: ['tabular-nums'] },
  stopName: { fontSize: tokens.text[26], lineHeight: 31 },
  refresh: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, marginRight: -6, marginBottom: -6, paddingHorizontal: 6 },
  refreshClock: { fontSize: tokens.text[11], fontWeight: tokens.weight.bold, fontVariant: ['tabular-nums'] },
  hero: { marginTop: 10, padding: tokens.space[4], borderRadius: 20 },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], overflow: 'hidden' },
  heroMany: { gap: 5 },
  heroDirection: { flexShrink: 1, minWidth: 0, color: sheetColors.heroText, fontSize: tokens.text[13], fontWeight: tokens.weight.bold },
  heroOnMap: { flexShrink: 0, marginLeft: 'auto', fontSize: tokens.text[12], fontWeight: tokens.weight.bold },
  heroNow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 10 },
  heroSoon: { fontSize: tokens.text[36], lineHeight: 36 },
  heroNext: { marginLeft: 'auto', color: sheetColors.heroMuted, fontSize: tokens.text[12] },
  track: { height: 22, marginTop: 18 },
  trackLine: { position: 'absolute', top: 10, height: 2 },
  trackLineBefore: { left: 4, right: '50%' },
  trackLineAfter: { left: '50%', right: 4 },
  trackEnd: { position: 'absolute', top: 7, width: 8, height: 8, borderRadius: 4, zIndex: 1 },
  trackFrom: { left: 0, backgroundColor: sheetColors.moreEdge },
  trackTo: { right: 0 },
  trackHere: { position: 'absolute', zIndex: 1, left: '50%', top: 2, width: 18, height: 18, marginLeft: -9, borderRadius: 9, borderWidth: 3, borderColor: sheetColors.cream },
  trackBus: { position: 'absolute', zIndex: 2, top: 0, width: 30, height: 22, marginLeft: -15, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[7], backgroundColor: sheetColors.trackBus },
  trackNames: { flexDirection: 'row', gap: 6, marginTop: tokens.space[2] },
  trackName: { fontSize: tokens.text[11], lineHeight: 14 },
  trackPrev: { flex: 1, textAlign: 'left', color: sheetColors.heroMuted },
  trackStop: { flex: 1.2, textAlign: 'center', fontSize: tokens.text[12], lineHeight: 16, fontWeight: tokens.weight.bold },
  trackNext: { flex: 1, textAlign: 'right', color: sheetColors.heroAfter },
  rows: { marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', columnGap: 10, minHeight: 48, marginHorizontal: -tokens.space[2], paddingVertical: 6, paddingHorizontal: tokens.space[2], borderBottomWidth: 1 },
  rowBadge: { width: 56 },   // 웹 .bus-row 는 격자라 번호 칸이 56px 를 가득 채운다
  rowDirection: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowDirectionText: { flexShrink: 1, minWidth: 0, fontSize: tokens.text[14], fontWeight: tokens.weight.bold },
  tag: { flexShrink: 0, paddingHorizontal: 5, borderWidth: 1, borderRadius: tokens.radius[5], fontSize: tokens.text[11], fontWeight: tokens.weight.bold },
  rowTime: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] },
  away: { fontSize: tokens.text[12] },
  eta: { minWidth: 76, textAlign: 'right', fontSize: tokens.text[16], fontWeight: tokens.weight.extrabold, fontVariant: ['tabular-nums'] },
  soon: { height: 26, paddingHorizontal: 10, justifyContent: 'center', borderRadius: tokens.radius.pill },
  soonText: { fontSize: tokens.text[15] },
  wait: { width: 64, height: 14, borderRadius: tokens.radius[6] },
  ended: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 6, columnGap: tokens.space[2], paddingTop: tokens.space[3] },
  endedTitle: { fontSize: tokens.text[13], fontWeight: tokens.weight.bold },
  endedItem: { minHeight: 32, paddingHorizontal: 9, justifyContent: 'center', borderWidth: 1, borderRadius: tokens.radius[8] },
  endedText: { fontSize: tokens.text[13], fontWeight: tokens.weight.bold },
  routeTitle: { fontSize: tokens.text[24], marginTop: 2, marginBottom: 6 },
  routeType: { fontSize: tokens.text[14], fontWeight: tokens.weight.semibold },
  grid: { gap: tokens.space[2], marginVertical: tokens.space[3] },
  gridRow: { flexDirection: 'row', columnGap: tokens.space[4] },
  gridKey: { width: GRID_KEY_WIDTH, fontSize: tokens.text[14], lineHeight: 21 },
  gridValueBox: { flex: 1, minWidth: 0 },
  gridValue: { fontSize: tokens.text[14], lineHeight: 21, fontWeight: tokens.weight.semibold },
  gridSmall: { fontSize: tokens.text[12], fontWeight: tokens.weight.regular },
});
