// 내 정보(웹 서랍 안 내 정보 — web/user/account_view.tsx AccountPage 와 같은 칸 · 값): 프로필 줄 · 내 통계 · 계정(로그인 기기) · 개인정보처리방침 · 로그아웃 · 탈퇴.
// 로그인이 안 됐으면 웹 #loginSheet 모양의 시트(열 때 서랍은 닫고, 로그인하면 웹처럼 지도 첫 화면으로 돌아간다). 승차권은 웹처럼 메뉴 첫 단계에만 있다.
// 내 데이터 내려받기는 후속으로 미루고 그 자리에 웹 안내 한 줄만 둔다.
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SERVER_ORIGIN } from '../config';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { call, isRecord, sessionOf, statsOf, type Session, type Stats } from './api';
import { PencilIcon } from './icons';
import { form } from './literals';
import { LoginPanel } from './LoginPanel';
import { closeMenu } from './menuLink';
import { dropSession, refreshMe, signOut, useSession } from './session';
import { body, makeStyles } from './style';
import { resetTickets } from './tickets';
import { showToast } from './toast';
import { AvatarFace, BottomSheet, closeAll, goBack, Message, PROVIDER_NAMES, Screen, Section } from './ui';

const FARE_REASONS: Record<string, string> = { route: '고른 경로가 없는 승차권', distance: '공식 거리 자료가 없는 노선', outside: '수도권 밖 구간',
  extra: '추가 운임 노선(신분당선 · 의정부경전철 · 공항철도 영종 구간)', bus: '요금 · 거리 자료가 없는 버스', none: '전철 · 버스를 타지 않는 승차권' };
const won = (count: number) => `${count.toLocaleString('ko-KR')}원`;
const monthDay = (seconds: number) => { const date = new Date(seconds * 1000); return `${date.getMonth() + 1}월 ${date.getDate()}일`; };

const useStyles = makeStyles(theme => {
  const note = { ...body(theme, tokens.text[11], tokens.weight.regular, theme.color.muted), lineHeight: tokens.text[11] * 1.45 };
  const plainButton = { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.paper, boxShadow: `inset 0 0 0 1px ${theme.color.rule}` } as const;
  return {
    wait: { marginTop: 40 },
    retry: { ...plainButton, minHeight: 42, marginTop: tokens.space[3], borderRadius: tokens.radius[12] },
    retryText: body(theme, tokens.text[13], tokens.weight.bold),
    prof: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: tokens.space[1], marginBottom: 14 },
    bigAvatar: { width: 84, height: 84 },
    badge: { position: 'absolute', right: -4, bottom: -4, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: theme.color.syung, boxShadow: `0 0 0 3px ${theme.color.paper}` },
    who: { flex: 1, minWidth: 0 },
    name: body(theme, tokens.text[17], tokens.weight.bold),
    provider: body(theme, tokens.text[12], tokens.weight.regular, theme.color.muted),
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] },
    cell: { flexBasis: '47%', flexGrow: 1, paddingVertical: 10, paddingHorizontal: tokens.space[3], borderRadius: tokens.radius[14], backgroundColor: theme.color.paper },
    cellValue: { ...body(theme, tokens.text[18], tokens.weight.bold), lineHeight: tokens.text[18] * 1.2 },
    // 웹 .st-cell small 은 줄 안 글자라 줄 높이가 칸(부모) 기준 — 캡처로 잰 약 18px
    cellLabel: { ...body(theme, tokens.text['11.5'], tokens.weight.regular, theme.color.muted), lineHeight: 18 },
    bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 44, marginTop: 10, marginHorizontal: 2, borderBottomWidth: 1, borderBottomColor: theme.color.rule },
    bar: { flex: 1, minWidth: 2, borderTopLeftRadius: tokens.radius[2], borderTopRightRadius: tokens.radius[2], backgroundColor: theme.color.syungDeep },
    note: { ...note, marginTop: tokens.space[2], marginHorizontal: 2 },
    fare: { marginTop: tokens.space[3], padding: tokens.space[3], borderRadius: tokens.radius[14], backgroundColor: theme.color.paper },
    fareTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    fareTitle: body(theme, tokens.text[13], tokens.weight.bold),
    fareTotal: body(theme, tokens.text[20], tokens.weight.bold),
    fareList: { marginTop: 10, gap: 6 },
    fareRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    fareName: { ...body(theme, tokens.text[13]), flex: 1 },
    fareCount: body(theme, tokens.text[11], tokens.weight.regular, theme.color.muted),
    fareValue: body(theme, tokens.text[13], tokens.weight.bold),
    skip: { ...body(theme, tokens.text[12], tokens.weight.bold, theme.color.secondary), marginTop: tokens.space[2], marginHorizontal: 2 },
    sub: { ...body(theme, tokens.text[13], tokens.weight.bold), marginBottom: tokens.space[2] },
    devices: { gap: 6 },
    device: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], paddingVertical: 10, paddingHorizontal: tokens.space[3], borderRadius: tokens.radius[14], backgroundColor: theme.color.paper },
    deviceNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    deviceName: body(theme, tokens.text[14], tokens.weight.bold),
    thisDevice: { ...body(theme, tokens.text[11], tokens.weight.bold), marginLeft: 6, paddingVertical: 1, paddingHorizontal: 7, borderRadius: tokens.radius.pill, overflow: 'hidden', backgroundColor: theme.color.selected },
    deviceWhen: body(theme, tokens.text['11.5'], tokens.weight.regular, theme.color.muted),
    deviceOut: { alignItems: 'center', justifyContent: 'center', minHeight: 36, paddingHorizontal: tokens.space[3], borderRadius: tokens.radius[10], backgroundColor: theme.color.control },
    deviceOutText: body(theme, tokens.text[12], tokens.weight.bold),
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2], marginTop: 10 },
    action: { ...plainButton, flexGrow: 1, flexBasis: 140, minHeight: 42, borderRadius: tokens.radius[12] },
    actionText: body(theme, tokens.text[13], tokens.weight.bold),
    foot: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 18 },
    link: { ...body(theme, tokens.text[12], tokens.weight.regular, theme.color.muted), textDecorationLine: 'underline' },
    linkDanger: { color: form.danger },
    confirm: { marginTop: tokens.space[3], padding: tokens.space[3], borderRadius: tokens.radius[14], backgroundColor: theme.color.control, gap: tokens.space[2] },
    confirmText: body(theme, tokens.text[14], tokens.weight.bold),
    confirmRow: { flexDirection: 'row', gap: tokens.space[2] },
    confirmNo: { ...plainButton, flex: 1, minHeight: 42, borderRadius: tokens.radius[10] },
    confirmYes: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[10], backgroundColor: form.danger },
    confirmNoText: body(theme, tokens.text[13], tokens.weight.bold),
    confirmYesText: body(theme, tokens.text[13], tokens.weight.bold, form.white),
    locked: { opacity: 0.5 },
  };
});

export function AccountScreen() {
  const session = useSession();
  const styles = useStyles();
  const theme = useTheme();
  // 로그아웃 · 탈퇴는 메뉴 첫 단계로 먼저 돌아간다 — 그사이 로그인 시트가 비치지 않게 비워 둔다
  const [leaving, setLeaving] = useState(false);
  const leave = useCallback(() => { setLeaving(true); resetTickets(); goBack(); }, []);
  const signedOut = session.status === 'out';
  const wasOut = useRef(signedOut);
  useEffect(() => {
    if (wasOut.current && !signedOut && session.status === 'in') closeAll();   // 로그인 성공: 지도 첫 화면 그대로(웹 #login=ok) — 만료 뒤라 밑에 안쪽 쪽이 남아 있어도 지도로
    wasOut.current = signedOut;
  }, [signedOut, session.status]);
  useEffect(() => { if (signedOut && !leaving) closeMenu(); }, [signedOut, leaving]);   // 웹 openSheet: 로그인 팝업을 열 때 서랍은 닫는다
  if (signedOut) return leaving ? null : <BottomSheet onClose={closeAll}><LoginPanel /></BottomSheet>;
  return (
    <Screen title="내 정보" once>
      {session.status === 'in' && <Signed onLeave={leave} />}
      {session.status === 'loading' && <ActivityIndicator color={theme.color.ink} style={styles.wait} />}
      {session.status === 'offline' && (
        <>
          <Message>내 정보를 받지 못했어요. 연결을 확인해 주세요.</Message>
          <Pressable onPress={() => void refreshMe()} accessibilityRole="button" style={styles.retry}><Text style={styles.retryText}>다시 시도</Text></Pressable>
        </>
      )}
    </Screen>
  );
}

// 내 통계 · 로그인 기기(못 받은 쪽은 null — 다음에 열 때 다시 · 프로필 줄은 그대로)
async function fetchDetails(): Promise<{ stats: Stats | null; sessions: Session[] | null }> {
  try {
    const [statsReply, sessionsReply] = await Promise.all([call('GET', '/api/me/stats'), call('GET', '/api/me/sessions')]);
    const stats = statsReply.ok ? statsOf(statsReply.body) : null;
    const list = sessionsReply.ok && isRecord(sessionsReply.body) && Array.isArray(sessionsReply.body.sessions) ? sessionsReply.body.sessions : null;
    return { stats, sessions: list ? list.map(sessionOf).filter((item): item is Session => item !== null) : null };
  } catch {
    return { stats: null, sessions: null };
  }
}

function Signed({ onLeave }: { onLeave(): void }) {
  const styles = useStyles();
  const theme = useTheme();
  const session = useSession();
  const me = session.status === 'in' ? session.me : null;
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [outBusy, setOutBusy] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const loaded = await fetchDetails();
    if (loaded.stats) setStats(loaded.stats);
    if (loaded.sessions) setSessions(loaded.sessions);
  }, []);
  useEffect(() => {
    let alive = true;
    void fetchDetails().then(loaded => {
      if (!alive) return;
      if (loaded.stats) setStats(loaded.stats);
      if (loaded.sessions) setSessions(loaded.sessions);
    });
    return () => { alive = false; };
  }, []);

  const logoutDevice = async (id: string) => {
    setOutBusy(list => [...list, id]);
    try {
      const reply = await call('DELETE', `/api/me/sessions/${encodeURIComponent(id)}`);
      if (reply.status === 401) return;
      if (!reply.ok && reply.status !== 404) { showToast('로그아웃하지 못했어요.', true); return; }
      showToast('그 기기에서 로그아웃했어요');
      await load();
    } catch {
      showToast('로그아웃하지 못했어요. 연결을 확인해 주세요.', true);
    } finally {
      setOutBusy(list => list.filter(each => each !== id));
    }
  };
  const logoutOthers = async () => {
    try {
      const reply = await call('DELETE', '/api/me/sessions?others=1');
      if (reply.status === 401) return;
      if (!reply.ok) { showToast('로그아웃하지 못했어요.', true); return; }
      const removed = isRecord(reply.body) && typeof reply.body.removed === 'number' ? reply.body.removed : 0;
      showToast(`다른 기기 ${removed}대에서 로그아웃했어요`);
      await load();
    } catch {
      showToast('로그아웃하지 못했어요. 연결을 확인해 주세요.', true);
    }
  };
  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const reply = await call('DELETE', '/api/me');
      if (!reply.ok && reply.status !== 401) { showToast('탈퇴하지 못했어요. 잠시 뒤 다시 해 주세요.', true); return; }
      setConfirm(false);
      onLeave();
      await dropSession('탈퇴했어요');
    } catch {
      showToast('탈퇴하지 못했어요. 연결을 확인해 주세요.', true);
    } finally {
      setDeleting(false);
    }
  };

  if (!me) return null;
  return (
    <>
      <View style={styles.prof}>
        <Pressable onPress={() => router.push('/account/profile')} accessibilityRole="button" accessibilityLabel="프로필 수정" style={styles.bigAvatar}>
          <AvatarFace avatar={me.avatar} size={72} frame={84} radius={28} />
          <View style={styles.badge}><PencilIcon color={theme.color.syungInk} /></View>
        </Pressable>
        <View style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>{me.name}</Text>
          <Text style={styles.provider}>{PROVIDER_NAMES[me.provider] ?? me.provider}</Text>
        </View>
      </View>

      {stats && <Section title="내 통계"><StatsBody stats={stats} /></Section>}

      {sessions && (
        <Section title="계정">
          <Text style={styles.sub}>{`로그인한 기기 ${sessions.length}대`}</Text>
          <View style={styles.devices}>
            {sessions.map(item => (
              <View key={item.id} style={styles.device}>
                <View style={styles.who}>
                  <View style={styles.deviceNameRow}><Text style={styles.deviceName}>{item.device}</Text>{item.current && <Text style={styles.thisDevice}>이 기기</Text>}</View>
                  <Text style={styles.deviceWhen}>{`마지막 사용 ${monthDay(item.lastUsedAt)} · 로그인 ${monthDay(item.createdAt)}`}</Text>
                </View>
                {!item.current && (
                  <Pressable onPress={() => void logoutDevice(item.id)} disabled={outBusy.includes(item.id)} accessibilityRole="button" style={[styles.deviceOut, outBusy.includes(item.id) && styles.locked]}>
                    <Text style={styles.deviceOutText}>로그아웃</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
          {sessions.length > 1 && (
            <View style={styles.actions}>
              <Pressable onPress={() => void logoutOthers()} accessibilityRole="button" style={styles.action}><Text style={styles.actionText}>다른 기기 모두 로그아웃</Text></Pressable>
            </View>
          )}
          <Text style={styles.note}>내 데이터 내려받기는 웹에서 할 수 있어요.</Text>
        </Section>
      )}

      <View style={styles.foot}>
        <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${SERVER_ORIGIN}/privacy.html`)} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>개인정보처리방침</Text></Pressable>
        <Pressable onPress={() => { onLeave(); void signOut(); }} accessibilityRole="button" hitSlop={8}><Text style={styles.link}>로그아웃</Text></Pressable>
        <Pressable onPress={() => setConfirm(true)} accessibilityRole="button" hitSlop={8}><Text style={[styles.link, styles.linkDanger]}>탈퇴</Text></Pressable>
      </View>
      {confirm && (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>탈퇴하면 승차권까지 모두 지워져요</Text>
          <View style={styles.confirmRow}>
            <Pressable onPress={() => setConfirm(false)} disabled={deleting} accessibilityRole="button" style={styles.confirmNo}><Text style={styles.confirmNoText}>취소</Text></Pressable>
            <Pressable onPress={() => void deleteAccount()} disabled={deleting} accessibilityRole="button" accessibilityState={{ busy: deleting }} style={[styles.confirmYes, deleting && styles.locked]}><Text style={styles.confirmYesText}>탈퇴</Text></Pressable>
          </View>
        </View>
      )}
    </>
  );
}

const Cell = ({ value, label }: { value: string; label: string }) => {
  const styles = useStyles();
  return <View style={styles.cell}><Text style={styles.cellValue}>{value}</Text><Text style={styles.cellLabel}>{label}</Text></View>;
};

function StatsBody({ stats }: { stats: Stats }) {
  const styles = useStyles();
  const most = Math.max(1, ...stats.daily.map(day => day.open + day.route + day.ticket));
  const fare = stats.fare;
  const month = fare ? Number(fare.month.split('-')[1]) : 0;
  const why = fare ? Object.entries(fare.reasons).map(([key, count]) => `${FARE_REASONS[key] ?? key} ${count}장`).join(' · ') : '';
  const { days } = stats.recent;
  return (
    <>
      <View style={styles.grid}>
        <Cell value={`${stats.daysTogether}일`} label="함께한 날" />
        <Cell value={`${stats.tickets}장`} label="승차권" />
        <Cell value={`${stats.recent.openDays}일`} label={`최근 ${days}일 슝 연 날`} />
        <Cell value={`${stats.recent.route}번`} label={`최근 ${days}일 길찾기`} />
      </View>
      <View style={styles.bars} accessibilityRole="image" accessibilityLabel={`최근 ${days}일 날짜별 사용 횟수`}>
        {stats.daily.map(day => {
          const count = day.open + day.route + day.ticket;
          const height = count ? Math.max(8, Math.round((count / most) * 100)) : 0;
          return <View key={day.day} style={[styles.bar, { height: `${height}%` }]} />;
        })}
      </View>
      <Text style={styles.note}>{`한 주에 타는 횟수 ${stats.weeklyRides}번 · 승차권 본 횟수 ${stats.recent.ticket}번(최근 ${days}일)`}</Text>
      {fare && stats.tickets > 0 && (
        <View style={styles.fare}>
          <View style={styles.fareTop}><Text style={styles.fareTitle}>{`${month}월 예상 교통비`}</Text><Text style={styles.fareTotal}>{won(fare.total)}</Text></View>
          <Text style={styles.note}>승차권대로 다 탄다고 가정한 예상이에요</Text>
          {fare.tickets.length > 0 && (
            <View style={styles.fareList}>
              {fare.tickets.map(ticket => (
                <View key={ticket.name} style={styles.fareRow}>
                  <Text style={styles.fareName} numberOfLines={1}>{ticket.name}</Text>
                  <Text style={styles.fareCount}>{`${won(ticket.fare)} × ${ticket.rides}번`}</Text>
                  <Text style={styles.fareValue}>{won(ticket.monthly)}</Text>
                </View>
              ))}
            </View>
          )}
          {fare.skipped > 0 && <Text style={styles.skip}>{`${fare.skipped}장 계산 못 함${why ? ` — ${why}` : ''}`}</Text>}
          <Text style={styles.note}>교통카드 어른 요금 · 고른 경로 거리 기준이에요. 갈아타는 시간 · 정기권 · 공휴일은 넣지 않았어요.</Text>
        </View>
      )}
    </>
  );
}
