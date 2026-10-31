// 길찾기 시트: web/ui/journey_sheet.tsx(구조 · 문구) + web/lib/journey-ui.mts(상태 · 셈 · 요청) + syung.css(.j*).
// 마지막 검색(JourneyMemory)은 시트가 닫혀도 경로와 함께 남아야 하니 부모가 들고, 시트는 열릴 때 받아 되돌리고 바뀌면 onMemory 로 알린다. 부모는 memory 가 있으면 닫힌 뒤 JourneyBar 를 띄운다.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Animated, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet } from '../components/Sheet';
import { SERVER_ORIGIN } from '../config';
import { tokens } from '../theme/tokens';
import { useReducedMotion, useTheme, type Theme } from '../theme/useTheme';
import { ChevronIcon, ClockIcon, DownIcon, EditIcon, PinIcon, SwapIcon, UpIcon } from './icons';
import { DottedRail, FadeIn, RouteCard, RouteLoading, Segmented, type SegmentItem } from './RouteParts';
import { placeAnswerOf, planView, routeAnswerOf, type Place, type Plan } from './routeView';
import type { LineColors } from './types';
import { sheetColors } from './webColors';

export type EndKind = 'from' | 'to';
export interface JourneyEnd { lat: number; lng: number; name?: string }
export type When = { kind: 'now' } | { kind: 'at'; date: Date };
export interface JourneyMemory {
  plans: Plan[]; selected: number; from: string; to: string; when: When; tab: string; picked: Record<EndKind, JourneyEnd | null>;
}
interface PlaceList { hidden: boolean; places: Place[]; empty: string | null }
type Result = { kind: 'none' } | { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'plans' };

interface Props {
  colors: LineColors;
  center(): { lat: number; lng: number };
  myLocation: readonly [number, number] | null;   // [경도, 위도]
  initial?: { end: EndKind; place: JourneyEnd & { name: string } };   // 역 시트에서 왔을 때 그 역이 한쪽 끝
  memory: JourneyMemory | null;
  onMemory(memory: JourneyMemory | null): void;
  showRoute(plan: Plan): void;
  clearRoute(): void;
  onClose(): void;
}

const KINDS = [['all', '전체'], ['subway', '지하철'], ['bus', '버스'], ['mixed', '지하철+버스']] as const;
const EMPTY_LIST: PlaceList = { hidden: true, places: [], empty: null };
const pad = (value: number) => String(value).padStart(2, '0');
const localText = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const clockText = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const isTomorrow = (date: Date) => date.toDateString() !== new Date().toDateString();
function soonest(): Date { const date = new Date(); date.setSeconds(0, 0); date.setMinutes(date.getMinutes() + 1); return date; }
function nextTen(): Date { const date = soonest(); date.setMinutes(Math.ceil(date.getMinutes() / 10) * 10); return date; }
function latest(): Date { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(23, 50, 0, 0); return date; }
const clamp = (date: Date) => new Date(Math.min(+latest(), Math.max(+soonest(), +date)));
const whenLabel = (when: When) => (when.kind === 'at' ? `${isTomorrow(when.date) ? '내일' : '오늘'} ${clockText(when.date)} 출발` : '지금 출발');
// 시는 한 시간씩, 분은 그 시간 안에서 한 분씩(59 → 00 은 시를 안 넘긴다)
function stepped(date: Date, unit: 'h' | 'm', amount: number): Date {
  const moved = new Date(date);
  if (unit === 'h') moved.setTime(+moved + amount * 3600e3);
  else moved.setMinutes((moved.getMinutes() + amount + 60) % 60);
  return clamp(moved);
}
function holdDelay(held: number): number {
  if (held > 2200) return 35;
  return held > 1200 ? 60 : 110;
}

// 시각 단추 하나: 누르면 한 칸, 누르고 있으면 0.4초 뒤부터 되풀이(오래 누를수록 빨라짐). onStep 은 움직였으면 true
function StepButton({ label, off, up, onStep }: { label: string; off: boolean; up: boolean; onStep(): boolean }) {
  const theme = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  useEffect(() => stop, [stop]);
  const start = () => {
    onStep();
    const started = Date.now();
    const tick = () => {
      if (!onStep()) { stop(); return; }
      timer.current = setTimeout(tick, holdDelay(Date.now() - started));
    };
    timer.current = setTimeout(tick, 400);
  };
  const Icon = up ? UpIcon : DownIcon;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off }} disabled={off} onPressIn={start} onPressOut={stop}
      accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => { onStep(); }}
      style={({ pressed }) => [styles.step, { backgroundColor: theme.color.paper }, off ? styles.stepOff : null, pressed ? styles.stepPressed : null]}>
      <Icon color={theme.color.ink} size={20} />
    </Pressable>
  );
}

function RowChevron({ open, color }: { open: boolean; color: string }) {
  const reduced = useReducedMotion();
  const [turn] = useState(() => new Animated.Value(open ? 1 : 0));
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: reduced ? 0 : tokens.duration[200], useNativeDriver: true }).start();
  }, [open, reduced, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  return <Animated.View style={{ transform: [{ rotate }] }}><ChevronIcon color={color} size={16} /></Animated.View>;
}

function EndDot({ theme, which, focused, small }: { theme: Theme; which: EndKind; focused?: boolean; small?: boolean }) {
  const dark = theme.name === 'dark';
  const from = which === 'from';
  const ring = from && dark ? sheetColors.dotFromDark : theme.color.syungInk;
  return <View style={[styles.dot, small ? styles.dotSmall : null, focused ? styles.dotFocused : null, { backgroundColor: from ? theme.color.syung : theme.color.syungInk, boxShadow: `0 0 0 2px ${from ? ring : theme.color.syung}` }]} />;
}

export function JourneySheet({ colors, center, myLocation, initial, memory, onMemory, showRoute, clearRoute, onClose }: Props) {
  const theme = useTheme();
  const body = { fontFamily: theme.font.body };
  const here = myLocation !== null;
  const [last, setLast] = useState<JourneyMemory | null>(initial ? null : memory);
  const [texts, setTexts] = useState<Record<EndKind, string>>(() => {
    if (!initial && memory) return { from: memory.from, to: memory.to };
    const start = here ? '내 위치' : '';
    if (initial?.end === 'from') return { from: initial.place.name, to: '' };
    if (initial?.end === 'to') return { from: start, to: initial.place.name };
    return { from: start, to: '' };
  });
  const picked = useRef<Record<EndKind, JourneyEnd | null>>(!initial && memory ? { ...memory.picked } : { from: initial?.end === 'from' ? initial.place : null, to: initial?.end === 'to' ? initial.place : null });
  const [lists, setLists] = useState<Record<EndKind, PlaceList>>({ from: EMPTY_LIST, to: EMPTY_LIST });
  const [when, setWhen] = useState<When>(!initial && memory ? memory.when : { kind: 'now' });
  const [whenOpen, setWhenOpen] = useState(false);
  const [draft, setDraft] = useState<Date | null>(null);
  const draftRef = useRef<Date | null>(null);
  const [status, setStatus] = useState({ text: '', sr: false });
  const [result, setResult] = useState<Result>(!initial && memory ? { kind: 'plans' } : { kind: 'none' });
  const [done, setDone] = useState(Boolean(!initial && memory));
  const [focused, setFocused] = useState<EndKind | null>(null);
  const [focusWish, setFocusWish] = useState<{ which: EndKind } | null>(() => {
    // 처음 한 번: 역 시트에서 왔으면 비어 있는 쪽을, 지난 경로가 없으면 도착을 묻는다
    if (initial) {
      const other = initial.end === 'from' ? 'to' : 'from';
      return other === 'from' && texts.from === '내 위치' ? null : { which: other };
    }
    return memory?.plans[memory.selected] ? null : { which: 'to' };
  });
  const fromInput = useRef<ComponentRef<typeof TextInput>>(null);
  const toInput = useRef<ComponentRef<typeof TextInput>>(null);
  const goSeq = useRef(0);
  const seeks = useRef<Record<EndKind, { timer: ReturnType<typeof setTimeout> | null; seq: number }>>({ from: { timer: null, seq: 0 }, to: { timer: null, seq: 0 } });

  useEffect(() => { onMemory(last); }, [last, onMemory]);
  useEffect(() => {
    if (!focusWish) return;
    (focusWish.which === 'from' ? fromInput : toInput).current?.focus();
  }, [focusWish]);
  useEffect(() => {
    if (status.sr && status.text) AccessibilityInfo.announceForAccessibility(status.text);
  }, [status]);
  // 닫히면 늦은 답이 닿지 않게
  useEffect(() => {
    const running = seeks.current;
    const searches = goSeq;
    return () => {
      for (const seek of Object.values(running)) { if (seek.timer) clearTimeout(seek.timer); seek.seq += 1; }
      searches.current += 1;
    };
  }, []);

  const setText = (which: EndKind, text: string, base: Record<EndKind, string> = texts) => {
    const next = { ...base, [which]: text };
    setTexts(next);
    return next;
  };
  const hideList = (which: EndKind) => setLists((now) => ({ ...now, [which]: { ...now[which], hidden: true } }));

  function typed(which: EndKind, text: string) {
    const seek = seeks.current[which];
    picked.current[which] = null;
    setText(which, text);
    if (seek.timer) clearTimeout(seek.timer);
    const query = text.trim();
    if (query.length < 2) { hideList(which); return; }
    seek.timer = setTimeout(async () => {
      seek.seq += 1;
      const mine = seek.seq;
      const middle = center();
      const show = (places: Place[], empty: string | null) => setLists((now) => ({ ...now, [which]: { hidden: false, places, empty } }));
      try {
        const response = await fetch(`${SERVER_ORIGIN}/api/place?q=${encodeURIComponent(query)}&near=${middle.lat.toFixed(5)},${middle.lng.toFixed(5)}`);
        const answer = placeAnswerOf(await response.json());
        if (mine !== seek.seq) return;
        if (!answer.ok) show([], answer.error ?? '검색하지 못했어요');
        else if (!answer.places.length) show([], '찾는 곳이 없어요');
        else show(answer.places, null);
      } catch {
        if (mine === seek.seq) show([], '검색하지 못했어요');
      }
    }, 300);
  }

  // 출발지: 고른 곳, 또는 칸이 '내 위치' 이고 위치를 알 때
  const fromOf = (fromText: string): JourneyEnd | null => {
    if (picked.current.from) return picked.current.from;
    return fromText.trim() === '내 위치' && myLocation ? { lat: myLocation[1], lng: myLocation[0] } : null;
  };

  function next(now: Record<EndKind, string>, whenNow: When, moveFocus: boolean) {
    if (fromOf(now.from) && picked.current.to) { void go(now, whenNow); return; }
    if (moveFocus) setFocusWish({ which: fromOf(now.from) ? 'to' : 'from' });
  }

  async function go(now: Record<EndKind, string>, whenNow: When) {
    const from = fromOf(now.from);
    const to = picked.current.to;
    goSeq.current += 1;
    const mine = goSeq.current;
    if (!from) { setStatus({ text: '출발지를 목록에서 골라 주세요.', sr: false }); return; }
    if (!to) { setStatus({ text: '도착지를 목록에서 골라 주세요.', sr: false }); return; }
    const tripPicked = { ...picked.current };
    setStatus({ text: '경로를 찾고 있어요', sr: false });
    setResult({ kind: 'loading' });
    setDone(false);
    Keyboard.dismiss();
    const at = whenNow.kind === 'at' ? `&at=${encodeURIComponent(localText(whenNow.date))}` : '';
    const failed = (message: string) => { setStatus({ text: `경로를 찾지 못했어요. ${message}`, sr: true }); setResult({ kind: 'failed', message }); };
    try {
      const response = await fetch(`${SERVER_ORIGIN}/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${at}`);
      const answer = routeAnswerOf(await response.json());
      if (mine !== goSeq.current) return;
      if (!answer.ok) { failed(answer.error ?? '출발지나 도착지를 바꿔 보세요.'); return; }
      const [first] = answer.plans;
      setStatus({ text: '', sr: false });
      setLast({ plans: answer.plans, selected: 0, from: now.from, to: now.to, when: whenNow, tab: 'all', picked: tripPicked });
      setResult({ kind: 'plans' });
      setDone(true);
      if (first) showRoute(first);
    } catch {
      if (mine === goSeq.current) failed('연결이 불안정해요. 잠시 뒤 다시 찾아 주세요.');
    }
  }

  // 처음 한 번: 지난 경로를 지도에 다시 보이거나, 역 시트에서 왔고 출발이 내 위치면 바로 찾는다
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (initial) {
      clearRoute();
      if (initial.end === 'to' && texts.from === '내 위치') void go(texts, when);
      return;
    }
    const again = memory?.plans[memory.selected];
    if (again) showRoute(again);
    // 열릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placePicked(which: EndKind, place: Place) {
    picked.current[which] = place;
    hideList(which);
    next(setText(which, place.name), when, true);
  }
  function pickHere() {
    picked.current.from = null;
    next(setText('from', '내 위치'), when, true);
  }
  function swap() {
    const start = fromOf(texts.from);
    const before = picked.current;
    picked.current = { from: before.to, to: start && !before.from ? { ...start, name: '내 위치' } : before.from };
    const now = { from: texts.to, to: texts.from };
    setTexts(now);
    next(now, when, false);
  }
  function openWhen(on: boolean) {
    setWhenOpen(on);
    if (!on) return;
    const start = clamp(when.kind === 'at' ? new Date(when.date) : nextTen());
    draftRef.current = start;
    setDraft(start);
  }
  function chooseWhen(chosen: When) {
    setWhen(chosen);
    setWhenOpen(false);
    next(texts, chosen, false);
  }
  const moveDraft = useCallback((unit: 'h' | 'm', amount: number): boolean => {
    const before = draftRef.current;
    if (!before) return false;
    const after = stepped(before, unit, amount);
    if (+after === +before) return false;
    draftRef.current = after;
    setDraft(after);
    return true;
  }, []);
  function chooseDay(offset: number) {
    const before = draftRef.current;
    if (!before) return;
    const at = new Date(before);
    const today = new Date();
    at.setFullYear(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const after = clamp(at);
    draftRef.current = after;
    setDraft(after);
  }
  const canStep = (unit: 'h' | 'm', amount: number) => (draft ? +stepped(draft, unit, amount) !== +draft : false);

  function pick(index: number) {
    const plan = last?.plans[index];
    if (!last || !plan) return;
    setLast({ ...last, selected: index });
    showRoute(plan);
  }
  // 펼친 경로를 또 누르면 시트를 닫는다(경로는 지도에 남는다)
  function cardPressed(index: number) {
    if (last?.selected === index) onClose();
    else pick(index);
  }
  function filter(kind: string) {
    if (!last) return;
    const shows = (plan: Plan) => kind === 'all' || plan.kind === kind;
    const chosen = last.plans[last.selected];
    const first = last.plans.findIndex(shows);
    const moved = chosen && !shows(chosen) && first >= 0;
    const moveTo = last.plans[first];
    setLast({ ...last, tab: kind, selected: moved ? first : last.selected });
    if (moved && moveTo) showRoute(moveTo);
  }

  const views = useMemo(() => (last ? last.plans.map((plan) => planView(plan, { from: last.from, to: last.to }, colors)) : []), [colors, last]);
  const tabs: SegmentItem[] | null = useMemo(() => {
    if (!last) return null;
    const count = (kind: string) => last.plans.filter((plan) => kind === 'all' || plan.kind === kind).length;
    if (KINDS.filter(([kind]) => kind !== 'all' && count(kind)).length < 2) return null;
    return KINDS.filter(([kind]) => kind === 'all' || count(kind)).map(([kind, name]) => ({ id: kind, name, count: count(kind), pressed: last.tab === kind }));
  }, [last]);

  const whenText = whenLabel(when);
  const listOpen = !lists.from.hidden || !lists.to.hidden;
  const showForm = !done;
  const setClockColor = theme.name === 'dark' ? theme.color.syung : theme.color.syungDeep;
  const clockColor = when.kind === 'at' ? setClockColor : theme.color.secondary;

  return (
    <Sheet onClose={onClose} tall bleed>
      <View style={styles.journey}>
        {showForm ? <Text accessibilityRole="header" style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.round }]}>길찾기</Text> : null}
        {done ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${texts.from}에서 ${texts.to}까지, ${whenText}. 눌러서 바꾸기`} onPress={() => { setDone(false); setFocusWish({ which: 'to' }); }}
            style={[styles.summary, { backgroundColor: theme.color.control }]}>
            <View style={styles.summaryTrip}>
              <DottedRail color={theme.color.muted} width={2} opacity={0.7} style={styles.summaryRail} />
              <View style={styles.summaryEnd}><EndDot theme={theme} which="from" small /><Text numberOfLines={1} style={[styles.summaryName, body, { color: theme.color.ink }]}>{texts.from}</Text></View>
              <View style={styles.summaryEnd}><EndDot theme={theme} which="to" small /><Text numberOfLines={1} style={[styles.summaryName, body, { color: theme.color.ink }]}>{texts.to}</Text></View>
            </View>
            <View style={styles.summarySide}>
              <Text style={[styles.summaryWhen, body, { color: theme.color.secondary }]}>{whenText}</Text>
              <View style={[styles.summaryEdit, { backgroundColor: theme.color.paper }]}>
                <EditIcon color={theme.color.ink} size={13} />
                <Text style={[styles.summaryEditText, body, { color: theme.color.ink }]}>수정</Text>
              </View>
            </View>
          </Pressable>
        ) : null}
        {showForm ? (
          <View style={[styles.form, { backgroundColor: theme.color.control }]}>
            <DottedRail color={theme.color.muted} width={2} opacity={0.6} style={styles.formRail} />
            <View style={styles.formRow}>
              <EndDot theme={theme} which="from" focused={focused === 'from'} />
              <TextInput ref={fromInput} value={texts.from} onChangeText={(text) => typed('from', text)} accessibilityLabel="출발지" placeholder="어디서 출발할까요?" placeholderTextColor={theme.color.muted}
                autoComplete="off" autoCorrect={false} onFocus={() => setFocused('from')} onBlur={() => setFocused(null)} style={[styles.input, body, { color: theme.color.ink }]} />
              {here ? <Pressable accessibilityRole="button" accessibilityLabel="내 위치에서 출발" onPress={pickHere} style={styles.hereButton}><PinIcon color={theme.color.secondary} size={20} /></Pressable> : null}
            </View>
            <View style={[styles.formRow, { borderTopWidth: 1, borderTopColor: theme.color.rule }]}>
              <EndDot theme={theme} which="to" focused={focused === 'to'} />
              <TextInput ref={toInput} value={texts.to} onChangeText={(text) => typed('to', text)} accessibilityLabel="도착지" placeholder="어디로 갈까요?" placeholderTextColor={theme.color.muted}
                autoComplete="off" autoCorrect={false} onFocus={() => setFocused('to')} onBlur={() => setFocused(null)} style={[styles.input, body, { color: theme.color.ink }]} />
            </View>
            {listOpen ? null : (
              <Pressable accessibilityRole="button" accessibilityLabel="출발지와 도착지 바꾸기" onPress={swap} style={[styles.swap, { backgroundColor: theme.color.paper, boxShadow: theme.shadow.DEFAULT }]}>
                <SwapIcon color={theme.color.ink} size={18} />
              </Pressable>
            )}
          </View>
        ) : null}
        {(['from', 'to'] as const).map((which) => {
          const list = lists[which];
          if (list.hidden || done) return null;
          return (
            <View key={which} accessibilityLabel={which === 'from' ? '출발지 찾기 결과' : '도착지 찾기 결과'} style={[styles.list, { backgroundColor: theme.color.control }]}>
              {list.empty !== null ? <Text style={[styles.listEmpty, body, { color: theme.color.muted }]}>{list.empty}</Text> : list.places.map((place) => (
                <Pressable key={`${place.name}|${place.address}|${place.lat}|${place.lng}`} accessibilityRole="button" onPress={() => placePicked(which, place)} style={styles.listItem}>
                  <Text style={[styles.listName, body, { color: theme.color.ink }]}>{place.name}</Text>
                  <Text style={[styles.listAddress, body, { color: theme.color.muted }]}>{place.address}</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
        {showForm && !listOpen ? (
          <View>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: whenOpen }} onPress={() => openWhen(!whenOpen)} style={[styles.whenRow, whenOpen ? styles.whenRowOpen : null, { backgroundColor: theme.color.control }]}>
              <ClockIcon color={clockColor} size={17} />
              <Text style={[styles.whenText, body, { color: theme.color.ink }]}>{whenText}</Text>
              <RowChevron open={whenOpen} color={theme.color.secondary} />
            </Pressable>
            {whenOpen ? (
              <FadeIn duration={tokens.duration[200]} style={[styles.panel, { backgroundColor: theme.color.control }]}>
                <View style={[styles.panelHead, { borderTopColor: theme.color.rule }]}>
                  <Text style={[styles.panelTitle, body, { color: theme.color.secondary }]}>출발 시각</Text>
                  <Pressable accessibilityRole="button" onPress={() => chooseWhen({ kind: 'now' })} style={[styles.nowButton, { backgroundColor: theme.color.paper }]}>
                    <Text style={[styles.nowText, body, { color: theme.color.ink }]}>지금으로</Text>
                  </Pressable>
                </View>
                <Segmented label="날짜" place="day" onPick={(day) => chooseDay(Number(day))}
                  items={[{ id: '0', name: '오늘', pressed: !(draft && isTomorrow(draft)) }, { id: '1', name: '내일', pressed: Boolean(draft && isTomorrow(draft)) }]} />
                <View style={styles.clock} accessibilityLiveRegion="polite">
                  <View style={styles.clockColumn}>
                    <StepButton up label="1시간 늦게" off={!canStep('h', 1)} onStep={() => moveDraft('h', 1)} />
                    <Text style={[styles.clockNumber, { color: theme.color.ink, fontFamily: theme.font.round }]}>{draft ? pad(draft.getHours()) : '00'}</Text>
                    <StepButton up={false} label="1시간 이르게" off={!canStep('h', -1)} onStep={() => moveDraft('h', -1)} />
                  </View>
                  <Text style={[styles.colon, { color: theme.color.muted, fontFamily: theme.font.round }]} accessibilityElementsHidden>:</Text>
                  <View style={styles.clockColumn}>
                    <StepButton up label="1분 늦게" off={!canStep('m', 1)} onStep={() => moveDraft('m', 1)} />
                    <Text style={[styles.clockNumber, { color: theme.color.ink, fontFamily: theme.font.round }]}>{draft ? pad(draft.getMinutes()) : '00'}</Text>
                    <StepButton up={false} label="1분 이르게" off={!canStep('m', -1)} onStep={() => moveDraft('m', -1)} />
                  </View>
                </View>
                <Pressable accessibilityRole="button" onPress={() => { if (draftRef.current) chooseWhen({ kind: 'at', date: new Date(draftRef.current) }); }} style={[styles.goButton, { backgroundColor: theme.color.syung, boxShadow: theme.shadow.edge }]}>
                  <Text style={[styles.goText, { color: theme.color.syungInk, fontFamily: theme.font.round }]}>이 시간에 출발</Text>
                </Pressable>
              </FadeIn>
            ) : null}
          </View>
        ) : null}
        {status.text && !status.sr ? (
          <Text accessibilityLiveRegion="polite" style={result.kind === 'loading' ? [styles.statusLoading, { color: theme.color.ink, fontFamily: theme.font.round }] : [styles.status, body, { color: theme.color.secondary }]}>{status.text}</Text>
        ) : null}
        {result.kind === 'loading' ? <RouteLoading /> : null}
        {result.kind === 'failed' ? (
          <View style={[styles.failed, { backgroundColor: theme.color.control }]}>
            <Text style={[styles.failedTitle, { color: theme.color.ink, fontFamily: theme.font.round }]}>경로를 찾지 못했어요</Text>
            <Text style={[styles.failedText, body, { color: theme.color.secondary }]}>{result.message}</Text>
            <Pressable accessibilityRole="button" onPress={() => { void go(texts, when); }} style={[styles.retry, { backgroundColor: theme.color.syung }]}>
              <Text style={[styles.retryText, { color: theme.color.syungInk, fontFamily: theme.font.round }]}>다시 찾기</Text>
            </Pressable>
          </View>
        ) : null}
        {result.kind === 'plans' && last ? (
          // 웹처럼 한 칸으로 묶는다: 필터와 카드 사이에 .journey 의 10px 간격이 끼지 않는다
          <View>
            {tabs ? <Segmented label="경로 종류" place="kinds" items={tabs} onPick={filter} /> : null}
            <View style={styles.plans}>
              {last.plans.map((plan, index) => {
                const view = views[index];
                if (!view || (last.tab !== 'all' && plan.kind !== last.tab)) return null;
                const on = last.selected === index;
                const previousOn = last.selected === index - 1;
                return (
                  <View key={index}>
                    {index > 0 && !on && !previousOn ? <View style={[styles.cardRule, { backgroundColor: theme.color.rule }]} /> : null}
                    <RouteCard plan={view} on={on} onPick={() => cardPressed(index)} />
                  </View>
                );
              })}
            </View>
            <Text style={[styles.note, body, { color: theme.color.muted }]}>경로를 누르면 지도에 보여요. 창을 닫아도 경로는 남아 있어요. 첫 열차는 실시간 위치로, 이후 열차는 배차 간격으로, 버스는 시간표로 계산한 예상 시간이에요.</Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  journey: { gap: 10 },
  title: { paddingHorizontal: 2, fontSize: tokens.text[17], lineHeight: 21 },
  form: { borderRadius: tokens.radius[16], paddingVertical: 2, paddingRight: tokens.space[12] },
  formRail: { position: 'absolute', left: 18, top: 30, bottom: 30 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotSmall: { width: 8, height: 8, borderRadius: 4 },
  dotFocused: { transform: [{ scale: 1.25 }] },
  input: { flex: 1, minWidth: 0, height: 48, padding: 0, fontSize: tokens.text[16] },
  hereButton: { width: 36, height: 36, marginRight: 2, alignItems: 'center', justifyContent: 'center' },
  swap: { position: 'absolute', right: 6, top: '50%', marginTop: -19, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  list: { marginTop: -tokens.space[1], padding: tokens.space[1], borderRadius: tokens.radius[14] },
  listEmpty: { paddingVertical: tokens.space[2], paddingHorizontal: 10, fontSize: tokens.text[12] },
  listItem: { minHeight: 48, gap: 1, paddingVertical: tokens.space[2], paddingHorizontal: 10, borderRadius: tokens.radius[9] },
  listName: { fontSize: tokens.text[14], fontWeight: tokens.weight.bold },
  listAddress: { fontSize: tokens.text[12] },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], height: 44, paddingLeft: 14, paddingRight: tokens.space[3], borderRadius: tokens.radius[14] },
  whenRowOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  whenText: { flex: 1, minWidth: 0, fontSize: tokens.text['14.5'], fontWeight: tokens.weight.bold },
  panel: { gap: tokens.space[3], paddingTop: tokens.space[1], paddingHorizontal: 14, paddingBottom: 14, borderBottomLeftRadius: tokens.radius[14], borderBottomRightRadius: tokens.radius[14] },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: tokens.space[3] },
  panelTitle: { fontSize: tokens.text[13], fontWeight: tokens.weight.bold },
  nowButton: { height: 30, paddingHorizontal: tokens.space[3], justifyContent: 'center', borderRadius: tokens.radius.pill },
  nowText: { fontSize: tokens.text['12.5'], fontWeight: tokens.weight.bold },
  clock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  clockColumn: { alignItems: 'center', gap: tokens.space[1] },
  clockNumber: { fontSize: 42, lineHeight: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  colon: { paddingHorizontal: 6, fontSize: tokens.text[36], lineHeight: 36 },
  step: { width: 64, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[12] },
  stepOff: { opacity: 0.3 },
  stepPressed: { transform: [{ scale: 0.95 }] },
  goButton: { height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.pill },
  goText: { fontSize: tokens.text[16] },
  status: { minHeight: 18, fontSize: tokens.text[13] },
  statusLoading: { minHeight: 18, fontSize: tokens.text[15] },
  failed: { alignItems: 'flex-start', gap: 6, padding: tokens.space[4], borderRadius: tokens.radius[16] },
  failedTitle: { fontSize: tokens.text[18] },
  failedText: { fontSize: tokens.text[13] },
  retry: { marginTop: 6, height: 40, paddingHorizontal: 18, justifyContent: 'center', borderRadius: tokens.radius.pill },
  retryText: { fontSize: tokens.text[15] },
  plans: { marginTop: tokens.space[1] },
  cardRule: { height: 1 },
  note: { marginTop: 10, fontSize: tokens.text['11.5'], lineHeight: 17 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[3], minHeight: 64, paddingVertical: 10, paddingLeft: 14, paddingRight: tokens.space[3], borderRadius: tokens.radius[16] },
  summaryTrip: { flex: 1, minWidth: 0, gap: 6 },
  summaryRail: { position: 'absolute', left: 3, top: 13, bottom: 13 },
  summaryEnd: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  summaryName: { flexShrink: 1, fontSize: tokens.text[15], lineHeight: 20, fontWeight: tokens.weight.bold },
  summarySide: { flexShrink: 0, alignItems: 'flex-end', gap: 6 },
  summaryWhen: { fontSize: tokens.text[12], lineHeight: 15, fontWeight: tokens.weight.bold, fontVariant: ['tabular-nums'] },
  summaryEdit: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[1], height: 26, paddingLeft: tokens.space[2], paddingRight: 10, borderRadius: tokens.radius.pill, boxShadow: '0 1px 0 rgba(20,20,20,.08)' },
  summaryEditText: { fontSize: tokens.text['12.5'], fontWeight: tokens.weight.bold },
});
