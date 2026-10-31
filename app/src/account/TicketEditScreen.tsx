// 발권 · 고치기(웹 web/user/tickets_view.tsx TicketPage · RoutePage + account.mts 발권 흐름과 같은 칸 · 값): 미리보기 · 출발 · 도착(장소 찾기 /api/place) · 출발 시각 바퀴(5분 단위) · 경로 · 타는 날 · 이름 → 발권하기.
// 출발 · 도착 · 시각이 바뀌면 고른 경로는 풀린다(그 경로는 그 조건에서 찾은 것). 경로 고르기는 같은 서랍 안에서 넘어간다(뒤로 = 칸으로).
// 경로 고르는 동안 고른 경로 전체를 위쪽 지도에 맞춰 그리고, 경로 쪽을 나가면 지운다(웹 previewPlan · previewGone).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type Ref } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { currentFix } from '../map/useMyLocation';
import { PinIcon } from '../sheets/icons';
import { tokens } from '../theme/tokens';
import { useReducedMotion } from '../theme/useTheme';
import { call, foundPlaceOf, type FoundPlace, type Place, type Plan, type SlimRoute } from './api';
import { ChevronDown, ChevronRight } from './icons';
import { LINE_COLORS, RouteLoading, StepList, Track } from './journey';
import { clearRoutePreview, previewRoute } from './menuLink';
import { form, route as routeLook, size, ticket as look } from './literals';
import { body, makeStyles, round } from './style';
import { showToast } from './toast';
import { chosenAfter, nextRideDay, rideSig, routeAt, routeFilterView, usefulRoutes, type RouteKind } from './ticketRoutes';
import { DAYS, deleteTicket, findPlans, QUICK, saveTicket, slimRoute, ticketById, timeParts } from './tickets';
import { TicketPreview } from './TicketsScreen';
import { Message, Screen } from './ui';

const NAME_MAX = 12;
type PlaceKey = 'from' | 'to';
const PLACE_TEXT: Record<PlaceKey, { label: string; empty: string; aria: string }> = { from: { label: '출발', empty: '출발지 고르기', aria: '출발지' }, to: { label: '도착', empty: '도착지 고르기', aria: '도착지' } };
const WHEEL_ROW = 40;     // .tw-col 칸 높이
const LIST_ROW = 48;      // .tf-list 줄 높이

interface RoutePick { when: Date; plans: Plan[]; chosen: number; kind: RouteKind; loading: boolean; message: string }

const useStyles = makeStyles(theme => {
  const edgeBrand = theme.shadow.edgeBrand;
  return {
    form: { gap: tokens.space[2], marginTop: tokens.space[3] },
    routeBox: { borderWidth: 2, borderColor: form.edge, borderRadius: tokens.radius[16], backgroundColor: form.back },
    placeRule: { borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: form.dashed },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[3], minHeight: 56, paddingRight: 6, paddingLeft: 14 },
    placeDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 3, borderColor: form.dot },
    placeDotTo: { backgroundColor: form.dot },
    placeBody: { flex: 1, minWidth: 0 },
    placeHere: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[12] },   // .tf-here
    placeLabel: { ...body(theme, tokens.text[12], tokens.weight.bold, form.label), lineHeight: 15 },   // 웹에서 잰 높이
    placeInput: { ...body(theme, tokens.text[16], tokens.weight.bold, form.ink), height: 28, marginVertical: -2, padding: 0 },   // .tf-pl input margin:-2px
    // 웹 계산값: .pp-list 가 .tf-list 의 여백을 덮어 margin 4 0 0 · padding 0
    list: { maxHeight: LIST_ROW * 5 + tokens.space[2], marginTop: tokens.space[1], borderWidth: 1, borderColor: form.listEdge, borderRadius: tokens.radius[12], backgroundColor: form.white, boxShadow: form.listShadow },
    listRow: { justifyContent: 'center', minHeight: LIST_ROW, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: form.listRule },
    listName: { ...body(theme, tokens.text[14], tokens.weight.bold, form.ink), lineHeight: tokens.text[14] * 1.35 },
    listAddress: { ...body(theme, tokens.text[11], tokens.weight.regular, form.label), lineHeight: tokens.text[11] * 1.35 },
    listRowLast: { borderBottomWidth: 0 },
    listEmpty: { ...body(theme, tokens.text[13], tokens.weight.regular, form.label), paddingVertical: tokens.space[3], paddingHorizontal: 10 },
    time: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: tokens.space[4], borderRadius: tokens.radius[16], backgroundColor: look.face, boxShadow: edgeBrand },
    timeOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, boxShadow: 'none' },
    timeLabel: { ...body(theme, tokens.text[13], tokens.weight.bold, form.ink), flex: 1 },
    timeValue: { ...round(theme, size.timeValue, form.ink), fontVariant: ['tabular-nums'] },
    timeAmPm: { fontSize: tokens.text[15] },
    chevron: { opacity: 0.6 },
    chevronOpen: { transform: [{ rotate: '180deg' }] },
    wheel: { marginTop: -tokens.space[2], paddingTop: tokens.space[3], paddingHorizontal: 14, paddingBottom: 14, borderWidth: 2, borderTopWidth: 0, borderColor: look.face, borderBottomLeftRadius: tokens.radius[16], borderBottomRightRadius: tokens.radius[16], backgroundColor: form.back },
    cols: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, height: WHEEL_ROW * 5 },
    band: { position: 'absolute', top: WHEEL_ROW * 2, left: 0, right: 0, height: WHEEL_ROW, borderRadius: tokens.radius[12], backgroundColor: look.face, boxShadow: edgeBrand },
    // ScrollView 는 기본 flexGrow:1 이라 그대로 두면 68 보다 넓어진다
    col: { flexGrow: 0, width: 68, height: WHEEL_ROW * 5 },
    // 웹 .tw-col mask(위아래 30% 를 투명으로): 앱에는 마스크가 없어 칸 배경색에서 투명으로 가는 덮개로 같은 모습을 낸다
    fadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: WHEEL_ROW * 1.5, experimental_backgroundImage: `linear-gradient(to bottom, ${form.back}, ${form.back}00)` },
    fadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: WHEEL_ROW * 1.5, experimental_backgroundImage: `linear-gradient(to top, ${form.back}, ${form.back}00)` },
    colPad: { paddingVertical: WHEEL_ROW * 2 },
    cell: { height: WHEEL_ROW, alignItems: 'center', justifyContent: 'center' },
    cellOff: round(theme, tokens.text[19], form.wheelOff),
    cellNear: round(theme, tokens.text[21], form.wheelNear),
    cellOn: round(theme, size.wheelOn, form.ink),
    colon: round(theme, tokens.text[26], form.ink),
    wheelFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: tokens.space[2] },
    wheelHint: body(theme, tokens.text[12], tokens.weight.regular, form.label),
    wheelDone: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 22, borderRadius: tokens.radius[14], backgroundColor: look.face, boxShadow: edgeBrand },
    wheelDoneText: round(theme, tokens.text[16], form.ink),
    label: { ...round(theme, tokens.text[14], form.label), lineHeight: 18, marginTop: tokens.space[1] },   // 웹에서 잰 높이
    pick: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.space[2], rowGap: 6, minHeight: 56, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 2, borderColor: form.edge, borderRadius: tokens.radius[16], backgroundColor: form.back },
    // 줄바꿈 칸의 기본 정렬이 웹(stretch)과 달라 한 줄일 때 위로 붙는다 — 가운데로
    pickEmpty: { justifyContent: 'space-between', alignContent: 'center', borderStyle: 'dashed' },
    pickTrack: { width: '100%' },
    pickText: { ...body(theme, tokens.text[14], tokens.weight.regular, form.ink), lineHeight: 23 },
    pickEmptyText: body(theme, tokens.text[14], tokens.weight.bold, form.label),
    pickMinutes: round(theme, tokens.text[18], form.ink),
    pickChange: { ...body(theme, tokens.text[13], tokens.weight.regular, form.label), marginLeft: 'auto', textDecorationLine: 'underline' },
    daysHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    quick: { flexDirection: 'row' },
    quickButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 2 },
    quickChip: { paddingVertical: tokens.space[1], paddingHorizontal: 10, borderWidth: 1.5, borderColor: form.quickEdge, borderRadius: tokens.radius.pill },
    quickChipOn: { backgroundColor: form.ink, borderColor: form.ink },
    quickText: body(theme, tokens.text[13], tokens.weight.bold, form.quickInk),
    quickTextOn: { color: form.back },
    days: { flexDirection: 'row', gap: tokens.space[1] },
    day: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: form.quickEdge, borderRadius: tokens.radius[12], backgroundColor: look.todayBack },
    dayOn: { borderColor: form.dayOnEdge, backgroundColor: look.face, boxShadow: edgeBrand },
    dayText: round(theme, tokens.text[16], form.quickInk),
    dayTextOn: { color: form.ink },
    nameBox: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], minHeight: 48, paddingHorizontal: 14, borderWidth: 2, borderColor: form.edge, borderRadius: tokens.radius[14], backgroundColor: form.back },
    nameInput: { ...body(theme, tokens.text[16], tokens.weight.bold, form.ink), flex: 1, paddingVertical: 0, paddingHorizontal: 2 },   // 웹 input 기본 안쪽 여백
    nameCount: body(theme, tokens.text[12], tokens.weight.regular, form.label),
    save: { alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 6, borderRadius: tokens.radius[16], backgroundColor: look.face, boxShadow: form.saveShadow },
    saveOff: { opacity: 0.45, boxShadow: 'none' },
    saveText: { ...round(theme, tokens.text[17], form.saveInk), letterSpacing: 1 },
    remove: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: tokens.space[1], borderWidth: 1.5, borderColor: form.dangerEdge, borderRadius: tokens.radius[14] },
    removeText: body(theme, tokens.text[14], tokens.weight.bold, form.danger),
    // 경로 고르기
    // 머리말(웹 .rt-sum): 출발지 → 도착지 한 줄 + 작은 날짜 · 시각 줄. 웹처럼 단어 단위로 줄을 바꾸려고 단어마다 칸을 둔다
    sum: { marginBottom: tokens.space[2] },
    trip: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
    tripWord: { ...round(theme, 19), lineHeight: 19 * 1.3, letterSpacing: -0.475, flexShrink: 1 },
    tripBox: { flexShrink: 1 },
    tripGap: { paddingRight: 5 },
    tripArrow: { ...round(theme, 19, theme.color.secondary), lineHeight: 19 * 1.3, marginHorizontal: 6 },
    tripMark: { position: 'absolute', left: 0, right: 0, bottom: 2, height: 6, backgroundColor: theme.color.syung },
    when: { ...body(theme, tokens.text[12], tokens.weight.semibold), lineHeight: 15, marginTop: 2 },
    // 종류 탭: 한 줄 가득 3등분(웹 .rt-filters .jkinds)
    segmented: { flexDirection: 'row', alignSelf: 'stretch', marginBottom: tokens.space[2], padding: 2, borderRadius: tokens.radius.pill, backgroundColor: theme.color.control },
    segment: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: tokens.radius.pill },
    segmentOn: { backgroundColor: theme.color.syung },
    segmentText: body(theme, tokens.text[13], tokens.weight.bold, theme.color.secondary),
    segmentTextOn: { color: theme.color.syungInk },
    segmentCount: { marginLeft: tokens.space[1], opacity: 0.55, fontVariant: ['tabular-nums'] },
    segmentCountOn: { opacity: 0.8 },
    plans: { gap: tokens.space[2] },
    plan: { flexDirection: 'row', gap: 10, paddingVertical: tokens.space[3], paddingLeft: tokens.space[3], paddingRight: tokens.space[12], borderWidth: 2, borderColor: theme.color.rule, borderRadius: tokens.radius[16], backgroundColor: theme.color.paper },
    planOn: { borderColor: routeLook.onEdge, backgroundColor: form.back, boxShadow: edgeBrand },
    radio: { width: 20, height: 20, marginTop: 3, borderRadius: 10, borderWidth: 2, borderColor: routeLook.radioEdge, backgroundColor: form.white },
    radioOn: { borderWidth: 6, borderColor: form.ink },
    planBody: { flex: 1, minWidth: 0, gap: 7 },
    planTop: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space[2], height: 24 },
    minutes: { ...round(theme, tokens.text[24]), lineHeight: 24 },
    minutesOn: { color: form.ink },
    minutesSmall: { fontSize: tokens.text[15] },
    tag: { ...body(theme, tokens.text['11.5'], tokens.weight.bold, theme.name === 'dark' ? theme.color.syung : routeLook.tagInk), marginLeft: 'auto', marginTop: 2.5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: tokens.radius.pill, overflow: 'hidden', backgroundColor: theme.name === 'dark' ? routeLook.tagDarkBack : theme.color.syungSoft },
    open: { position: 'absolute', top: 0, bottom: 0, right: 6, justifyContent: 'center' },
    openButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[12] },
    steps: { marginTop: tokens.space[1], marginBottom: 2, paddingTop: tokens.space[3], paddingHorizontal: tokens.space[3], paddingBottom: 6, borderRadius: tokens.radius[16], backgroundColor: theme.color.control },
    meta: { ...body(theme, tokens.text['12.5'], tokens.weight.regular, theme.color.secondary), marginBottom: tokens.space[2] },
    empty: { gap: tokens.space[1], paddingVertical: 14, paddingHorizontal: tokens.space[4], borderRadius: tokens.radius[16], backgroundColor: theme.color.control },
    emptyTitle: body(theme, tokens.text[15], tokens.weight.bold),
    emptyText: body(theme, tokens.text[13], tokens.weight.regular, theme.color.secondary),
    foot: { paddingTop: tokens.space[2], paddingHorizontal: tokens.space[2], backgroundColor: theme.color.paper, boxShadow: routeLook.footShadow },
  };
});

export function TicketEditScreen() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = params.id ? ticketById(Number(params.id)) : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [from, setFrom] = useState<Place | null>(editing?.from ?? null);
  const [to, setTo] = useState<Place | null>(editing?.to ?? null);
  const [time, setTime] = useState(editing?.depart ?? '08:00');
  const [days, setDays] = useState<number[]>(editing?.days ?? []);
  const [route, setRoute] = useState<SlimRoute | null>(editing?.route ?? null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [pick, setPick] = useState<RoutePick | null>(null);   // 경로 고르기 쪽이 열려 있으면 그 상태
  const [sending, setSending] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const routeSeq = useRef(0);
  const [hereFlags, setHereFlags] = useState<Record<PlaceKey, boolean>>({ from: false, to: false });   // 그 칸의 곳이 '내 위치'로 넣은 것(칸에서 이름을 고칠 수 있다)
  const hereEpoch = useRef(0);   // 위치를 기다리는 사이 칸을 바꾸거나 곳을 고르거나 화면을 나가면 늦게 온 위치는 버린다
  const toInput = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => () => { hereEpoch.current++; }, []);

  // 출발 · 도착 · 시각이 바뀌면 고른 경로는 풀린다
  const routeGone = () => {
    if (route) showToast('출발 · 도착 · 시각이 바뀌어서 경로를 다시 골라 주세요', true);
    setRoute(null);
  };
  const setSpot = (which: PlaceKey, place: Place, here = false) => {
    hereEpoch.current++;
    const before = which === 'from' ? from : to;
    if (which === 'from') setFrom(place); else setTo(place);
    setHereFlags(flags => ({ ...flags, [which]: here }));
    if (!before || before.lat !== place.lat || before.lng !== place.lng) routeGone();
  };
  // 📍 내 위치로 칸을 채운다(웹 useHere — 실패 글만 앱에 맞춰 '브라우저의' 를 뺐다)
  const fillHere = async (which: PlaceKey) => {
    const epoch = ++hereEpoch.current;
    const fix = await currentFix();
    if (epoch !== hereEpoch.current) return;
    if (!fix) { showToast('위치를 가져오지 못했어요. 위치 권한을 확인해 주세요.', true); return; }
    setSpot(which, { name: '내 위치', lat: fix[1], lng: fix[0] }, true);
    if (which === 'from' && !to) toInput.current?.focus();
  };
  // 칸을 떠날 때 '내 위치'에 이름을 쳐 두었으면 좌표는 두고 이름만 고친다(웹 placeBlur)
  const renameHere = (which: PlaceKey, typed: string) => {
    const spot = which === 'from' ? from : to;
    if (!spot || !hereFlags[which] || !typed || typed === spot.name) return;
    if (which === 'from') setFrom({ ...spot, name: typed }); else setTo({ ...spot, name: typed });
  };
  const changeTime = (next: string) => { if (next !== time) { setTime(next); routeGone(); } };

  const openRoutes = async () => {
    if (!from || !to) { showToast('출발지 · 도착지를 먼저 골라 주세요', true); return; }
    const when = nextRideDay(days, time, new Date());
    const my = ++routeSeq.current;
    setPick({ when, plans: [], chosen: -1, kind: 'all', loading: true, message: '경로를 찾고 있어요' });
    const found = await findPlans(from, to, routeAt(when));
    if (my !== routeSeq.current) return;
    if (!found.ok || !found.plans.length) {
      setPick(current => current && { ...current, loading: false, message: found.ok ? '경로를 찾지 못했어요.' : found.message });
      return;
    }
    const plans = usefulRoutes(found.plans);
    const mine = route ? plans.findIndex(plan => rideSig(plan) === rideSig(route)) : -1;
    const fastest = plans.findIndex(plan => plan.tag === '가장 빠른 길');   // 기본은 가장 빠른 길(웹 사용자 결정 2026-10-27)
    setPick(current => current && { ...current, plans, chosen: mine >= 0 ? mine : Math.max(0, fastest), loading: false, message: '' });
  };

  const submit = async () => {
    if (sending) return;
    const trimmed = name.trim();
    if (!from || !to) { showToast('출발지 · 도착지를 골라 주세요', true); return; }
    if (!route) { showToast('경로를 골라 주세요', true); return; }
    if (!trimmed) { showToast('승차권 이름을 넣어 주세요', true); return; }
    setSending(true);
    try {
      const result = await saveTicket({ name: trimmed, from, to, depart: time, days, route }, editing?.id);
      if (!result.ok) { if (result.message) showToast(result.message, true); return; }
      showToast(editing ? '승차권을 고쳤어요' : '발권했어요');
      router.back();
    } finally {
      setSending(false);
    }
  };
  const remove = async () => {
    if (!editing) return;
    if (!deleteArmed) { setDeleteArmed(true); return; }
    const result = await deleteTicket(editing.id);
    if (!result.ok) { if (result.message) showToast(result.message, true); return; }
    showToast('승차권을 지웠어요');
    router.back();
  };

  if (params.id && !editing) {
    return <Screen title="승차권 고치기"><Message>이 승차권을 찾지 못했어요.</Message></Screen>;
  }
  if (pick) {
    return (
      <RoutePicker pick={pick} from={from} to={to} time={time}
        onKind={kind => setPick(current => current && { ...current, kind, chosen: chosenAfter(current.plans, routeFilterView(current.plans, kind).order, route) })}
        onChoose={index => setPick(current => current && { ...current, chosen: index })}
        onBack={() => { routeSeq.current++; setPick(null); }}
        onUse={plan => { setRoute(slimRoute(plan)); setPick(null); }} />
    );
  }

  const parts = timeParts(time);
  const quickNow = days.join(',');
  const locked = sending || !route;
  return (
    <Screen title={editing ? '승차권 고치기' : '승차권 발권'}>
      <TicketPreview ticket={{ ...(editing ? { id: editing.id } : {}), name: name.trim(), depart: time, days }} />
      <View style={styles.form}>
        <View style={styles.routeBox}>
          <PlaceField which="from" place={from} onPick={place => setSpot('from', place)} onHere={() => void fillHere('from')} onChanging={() => { hereEpoch.current++; }} onLeave={typed => renameHere('from', typed)} />
          <View style={styles.placeRule} />
          <PlaceField which="to" place={to} inputRef={toInput} onPick={place => setSpot('to', place)} onHere={() => void fillHere('to')} onChanging={() => { hereEpoch.current++; }} onLeave={typed => renameHere('to', typed)} />
        </View>

        <Pressable onPress={() => setWheelOpen(!wheelOpen)} accessibilityRole="button" accessibilityState={{ expanded: wheelOpen }} style={[styles.time, wheelOpen && styles.timeOpen]}>
          <Text style={styles.timeLabel}>출발 시각</Text>
          <Text style={styles.timeValue}><Text style={styles.timeAmPm}>{parts.ampm}</Text>{` ${parts.clock}`}</Text>
          <View style={[styles.chevron, wheelOpen && styles.chevronOpen]}><ChevronDown color={form.ink} /></View>
        </Pressable>
        {wheelOpen && (
          <View style={styles.wheel}>
            <TimeWheel time={time} onChange={changeTime} />
            <View style={styles.wheelFoot}>
              <Text style={styles.wheelHint}>돌려서 고르기 · 5분 단위</Text>
              <Pressable onPress={() => setWheelOpen(false)} accessibilityRole="button" style={styles.wheelDone}><Text style={styles.wheelDoneText}>완료</Text></Pressable>
            </View>
          </View>
        )}

        <Text style={styles.label}>경로</Text>
        <Pressable onPress={() => void openRoutes()} accessibilityRole="button" accessibilityLabel={route ? `경로 약 ${route.minutes}분 환승 ${route.transfers} 바꾸기` : '경로 고르기'} style={[styles.pick, !route && styles.pickEmpty]}>
          {route ? (
            <>
              <View style={styles.pickTrack}><Track legs={route.legs} colors={LINE_COLORS} width={270} height={22} /></View>
              <Text style={styles.pickText}><Text style={styles.pickMinutes}>{`약 ${route.minutes}분`}</Text>{` · 환승 ${route.transfers}`}</Text>
              <Text style={styles.pickChange}>바꾸기</Text>
            </>
          ) : <><Text style={styles.pickEmptyText}>경로 고르기</Text><ChevronRight color={form.label} /></>}
        </Pressable>

        <View style={styles.daysHead}>
          <Text style={styles.label}>타는 날</Text>
          <View style={styles.quick} accessibilityLabel="타는 날 빠르게 고르기">
            {QUICK.map(([list, label]) => {
              const on = quickNow === list.join(',');
              return (
                <Pressable key={label} onPress={() => setDays([...list])} accessibilityRole="button" accessibilityState={{ selected: on }} style={styles.quickButton}>
                  <View style={[styles.quickChip, on && styles.quickChipOn]}><Text style={[styles.quickText, on && styles.quickTextOn]}>{label}</Text></View>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.days}>
          {DAYS.map((label, index) => {
            const day = index + 1;
            const on = days.includes(day);
            return (
              <Pressable key={label} onPress={() => setDays(on ? days.filter(each => each !== day) : [...days, day].sort((left, right) => left - right))} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.day, on && styles.dayOn]}>
                <Text style={[styles.dayText, on && styles.dayTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>승차권 이름</Text>
        <View style={styles.nameBox}>
          <TextInput value={name} onChangeText={setName} maxLength={NAME_MAX} placeholder="이름 넣기" placeholderTextColor={form.placeholder} returnKeyType="done" accessibilityLabel="승차권 이름" style={styles.nameInput} />
          <Text style={styles.nameCount}>{`${[...name].length}/${NAME_MAX}`}</Text>
        </View>

        <Pressable onPress={() => void submit()} disabled={locked} accessibilityRole="button" accessibilityState={{ disabled: locked, busy: sending }} style={[styles.save, locked && styles.saveOff]}>
          <Text style={styles.saveText}>{sending ? '발권하는 중…' : '발권하기'}</Text>
        </Pressable>
        {editing && (
          <Pressable onPress={() => void remove()} accessibilityRole="button" style={styles.remove}><Text style={styles.removeText}>{deleteArmed ? '한 번 더 누르면 지워요' : '이 승차권 지우기'}</Text></Pressable>
        )}
      </View>
    </Screen>
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

// 바퀴 한 열: 스냅 스크롤 · 칸을 누르면 그 자리로 굴러간다(.tw-col)
function WheelColumn<Value extends string | number>({ label, items, value, render, onPick }: { label: string; items: readonly Value[]; value: Value; render(item: Value): string; onPick(item: Value): void }) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const at = items.indexOf(value);
  const land = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const landed = items[Math.round(event.nativeEvent.contentOffset.y / WHEEL_ROW)];
    if (landed !== undefined && landed !== value) onPick(landed);
  };
  const lookOf = (index: number) => {
    const gap = Math.abs(index - at);
    if (gap === 0) return styles.cellOn;
    return gap === 1 ? styles.cellNear : styles.cellOff;
  };
  return (
    <ScrollView ref={scroller} style={styles.col} contentContainerStyle={styles.colPad} contentOffset={{ x: 0, y: Math.max(0, at) * WHEEL_ROW }} snapToInterval={WHEEL_ROW} decelerationRate="fast" nestedScrollEnabled
      showsVerticalScrollIndicator={false} onMomentumScrollEnd={land} accessibilityLabel={label} accessibilityValue={{ text: render(value) }}>
      {items.map((item, index) => (
        <Pressable key={String(item)} style={styles.cell} onPress={() => { scroller.current?.scrollTo({ y: index * WHEEL_ROW, animated: !reduced }); onPick(item); }} accessibilityRole="button" accessibilityLabel={render(item)}>
          <Text style={lookOf(index)}>{render(item)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// 출발 시각 바퀴: 오전 · 오후 / 시 / 분(5분 단위 · 예전 값이 5분 단위가 아니면 그 값도 끼운다)
const AMPM = [0, 1] as const;
const HOURS = Array.from({ length: 12 }, (_item, index) => index + 1);
const FIVES = Array.from({ length: 12 }, (_item, index) => index * 5);
function TimeWheel({ time, onChange }: { time: string; onChange(next: string): void }) {
  const styles = useStyles();
  const [hour = 8, minute = 0] = time.split(':').map(Number);
  const half = hour >= 12 ? 1 : 0;
  const hour12 = hour % 12 || 12;
  const minutes = FIVES.includes(minute) ? FIVES : [...FIVES, minute].sort((left, right) => left - right);
  const make = (nextHalf: number, nextHour: number, nextMinute: number) => `${pad(nextHalf * 12 + (nextHour % 12))}:${pad(nextMinute)}`;
  return (
    <View style={styles.cols}>
      <View style={styles.band} />
      <WheelColumn label="오전 · 오후" items={AMPM} value={half as 0 | 1} render={item => (item ? '오후' : '오전')} onPick={item => onChange(make(item, hour12, minute))} />
      <WheelColumn label="시" items={HOURS} value={hour12} render={String} onPick={item => onChange(make(half, item, minute))} />
      <Text style={styles.colon}>:</Text>
      <WheelColumn label="분" items={minutes} value={minute} render={pad} onPick={item => onChange(make(half, hour12, item))} />
      <View style={styles.fadeTop} pointerEvents="none" />
      <View style={styles.fadeBottom} pointerEvents="none" />
    </View>
  );
}

// 장소 칸: 글자를 치면 칸 아래에 찾은 곳이 펼쳐지고(300 ms 늦춰 · 늦게 온 답은 버린다 — 웹과 같다), 고르면 접힌다
function PlaceField({ which, place, inputRef, onPick, onHere, onChanging, onLeave }: {
  which: PlaceKey; place: Place | null; inputRef?: Ref<ComponentRef<typeof TextInput>>; onPick(place: Place): void; onHere(): void; onChanging(): void; onLeave(typed: string): void;
}) {
  const styles = useStyles();
  const { label, empty, aria } = PLACE_TEXT[which];
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState(false);
  const [rows, setRows] = useState<FoundPlace[] | string>([]);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    const text = query.trim();
    if (!active || !typed || text.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const reply = await call('GET', `/api/place?q=${encodeURIComponent(text)}`, undefined, { auth: false });
        if (my !== seq.current) return;
        const found = reply.body as { ok?: unknown; places?: unknown } | null;
        if (found?.ok !== true || !Array.isArray(found.places)) { setRows('검색하지 못했어요'); return; }
        const places = found.places.map(foundPlaceOf).filter((item): item is FoundPlace => item !== null);
        setRows(places.length ? places : '찾는 곳이 없어요');
      } catch {
        if (my === seq.current) setRows('검색하지 못했어요');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, active, typed]);
  const shown = active && typed && query.trim().length >= 2;   // 두 글자부터 찾는다(웹과 같다)

  return (
    <View>
      <View style={styles.placeRow}>
        <View style={[styles.placeDot, which === 'to' && styles.placeDotTo]} />
        <View style={styles.placeBody}>
          <Text style={styles.placeLabel}>{label}</Text>
          <TextInput ref={inputRef} value={active ? query : place?.name ?? ''} onChangeText={text => { setQuery(text); setTyped(true); onChanging(); }} placeholder={empty} placeholderTextColor={form.placeholder} maxLength={40}
            selectTextOnFocus accessibilityLabel={aria} returnKeyType="search" autoComplete="off" style={styles.placeInput}
            onFocus={() => { setQuery(place?.name ?? ''); setTyped(false); setRows([]); setActive(true); onChanging(); }} onBlur={() => { setActive(false); if (typed) onLeave(query.trim()); }} />
        </View>
        <Pressable onPress={onHere} accessibilityRole="button" accessibilityLabel={`내 위치를 ${aria}로`} hitSlop={4} style={styles.placeHere}><PinIcon color={form.ink} size={20} /></Pressable>
      </View>
      {shown && (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {typeof rows === 'string' ? <Text style={styles.listEmpty}>{rows}</Text> : rows.map((row, index) => (
            <Pressable key={`${row.lat},${row.lng},${row.name}`} accessibilityRole="button" style={[styles.listRow, index === rows.length - 1 && styles.listRowLast]}
              onPress={() => { onPick({ name: row.name, lat: row.lat, lng: row.lng }); setActive(false); setQuery(''); setTyped(false); }}>
              <Text style={styles.listName} numberOfLines={1}>{row.name}</Text>
              {row.address ? <Text style={styles.listAddress} numberOfLines={1}>{row.address}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// 경로 고르기 쪽: 달력 · 출발 → 도착 · 시각 머리말 → 종류 탭(길 수) → 길 카드(띠 · 펼치면 단계) → 아래 붙은 '이 경로로'
// 이름을 띄어쓰기로 나눈다(단어 단위 줄바꿈 — 웹 word-break:keep-all)
const words = (name: string) => name.split(' ').filter(Boolean);

function RoutePicker({ pick, from, to, time, onKind, onChoose, onBack, onUse }: {
  pick: RoutePick; from: Place | null; to: Place | null; time: string;
  onKind(kind: RouteKind): void; onChoose(index: number): void; onBack(): void; onUse(plan: Plan): void;
}) {
  const styles = useStyles();
  const [openPlan, setOpenPlan] = useState<Plan | null>(null);
  const filter = pick.plans.length ? routeFilterView(pick.plans, pick.kind) : null;
  const chosen = pick.plans[pick.chosen];
  // 지도 미리보기: 패널 높이를 잰 뒤부터 고른 경로를 패널 위에 맞춘다(웹과 같이 패널 높이 + 24). 쪽이 어떻게 사라지든 지운다
  const [panelHeight, setPanelHeight] = useState(0);
  useEffect(() => {
    if (!chosen) { clearRoutePreview(); return; }
    if (panelHeight > 0) previewRoute({ ...chosen }, panelHeight + 24);
  }, [chosen, panelHeight]);
  useEffect(() => clearRoutePreview, []);
  const parts = timeParts(time);
  const weekday = DAYS[(pick.when.getDay() + 6) % 7];
  const ends = { from: from?.name ?? '출발', to: to?.name ?? '도착' };
  const foot = chosen && filter?.order.length ? (
    <View style={styles.foot}>
      <Pressable onPress={() => onUse(chosen)} accessibilityRole="button" style={styles.save}><Text style={styles.saveText}>이 경로로</Text></Pressable>
    </View>
  ) : undefined;
  return (
    <Screen title="경로 선택" onBack={onBack} foot={foot} withMap onPanelHeight={setPanelHeight}>
      <View style={styles.sum}>
        <View style={styles.trip} accessible accessibilityLabel={`${ends.from}에서 ${ends.to}까지`}>
          {words(ends.from).map((word, index, all) => (
            <Text key={index} style={[styles.tripWord, index < all.length - 1 && styles.tripGap]}>{word}</Text>
          ))}
          <Text style={styles.tripArrow}>→</Text>
          {words(ends.to).map((word, index, all) => (
            <View key={index} style={[styles.tripBox, index < all.length - 1 && styles.tripGap]}>
              <View style={styles.tripMark} />
              <Text style={styles.tripWord}>{word}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.when}>{`${pick.when.getMonth() + 1}월 ${pick.when.getDate()}일 (${weekday}) · ${parts.ampm} ${parts.clock} 출발`}</Text>
      </View>
      {filter && (
        <View style={styles.segmented} accessibilityLabel="경로 종류">
          {filter.kinds.map(tab => (
            <Pressable key={tab.kind} onPress={() => onKind(tab.kind)} accessibilityRole="button" accessibilityState={{ selected: tab.pressed }} style={[styles.segment, tab.pressed && styles.segmentOn]}>
              <Text style={[styles.segmentText, tab.pressed && styles.segmentTextOn]}>{tab.name}</Text>
              <Text style={[styles.segmentText, styles.segmentCount, tab.pressed && styles.segmentTextOn, tab.pressed && styles.segmentCountOn]}>{tab.count}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.plans} accessibilityRole="radiogroup" accessibilityLabel="경로">
        {filter?.order.map(index => {
          const plan = pick.plans[index];
          if (!plan) return null;
          const on = index === pick.chosen;
          const opened = openPlan === plan;
          return (
            <View key={index}>
              <View>
                <Pressable onPress={() => onChoose(index)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${plan.tag || '경로'} 약 ${plan.minutes}분, 환승 ${plan.transfers}번`} style={[styles.plan, on && styles.planOn]}>
                  <View style={[styles.radio, on && styles.radioOn]} />
                  <View style={styles.planBody}>
                    <View style={styles.planTop}>
                      <Text style={[styles.minutes, on && styles.minutesOn]}><Text style={styles.minutesSmall}>약 </Text>{plan.minutes}<Text style={styles.minutesSmall}>분</Text></Text>
                      {plan.tag ? <Text style={styles.tag}>{plan.tag}</Text> : null}
                    </View>
                    <Track legs={plan.legs} colors={LINE_COLORS} width={250} />
                  </View>
                </Pressable>
                <View style={styles.open} pointerEvents="box-none">
                  <Pressable onPress={() => setOpenPlan(opened ? null : plan)} accessibilityRole="button" accessibilityLabel="경로 자세히 보기" accessibilityState={{ expanded: opened }} style={styles.openButton}>
                    <View style={opened ? styles.chevronOpen : null}><ChevronDown size={16} width={2.6} color={routeLook.openInk} /></View>
                  </Pressable>
                </View>
              </View>
              {opened && <View style={styles.steps}><Text style={styles.meta}>{`환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`}</Text><StepList legs={plan.legs} ends={ends} colors={LINE_COLORS} /></View>}
            </View>
          );
        })}
      </View>
      {filter?.empty ? <View style={styles.empty}><Text style={styles.emptyTitle}>{filter.empty}</Text><Text style={styles.emptyText}>다른 조건을 골라 보세요</Text></View> : null}
      {pick.message ? <Message>{pick.message}</Message> : null}
      {pick.loading && <RouteLoading />}
    </Screen>
  );
}
