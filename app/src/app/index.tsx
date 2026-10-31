// 지도 화면: 머리줄 + 지도(웹뷰) 위 검색 · 길찾기 단추 · 시트 + 메뉴 서랍을 붙인다. 각 조각의 모양은 그 파일에, 여기는 상태와 다리만.
import { router, useFocusEffect } from 'expo-router';
import { linkMenu, linkRouteMap } from '../account/menuLink';
import { Toast } from '../account/toast';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { Menu } from '../components/menu/Menu';
import { RouteButton } from '../components/RouteButton';
import { SheetButton, SheetHeightContext } from '../components/Sheet';
import { StationSearch } from '../components/StationSearch';
import { BRIDGE_VERSION, type AppCommand, type BusSelection, type MapMessage, type PrefsState, type RoutePlan, type SkyState, type StationInfo, type ThemeState, type TrainInfo } from '../map/bridge';
import { MapWebView, type MapWebViewHandle } from '../map/MapWebView';
import { BusSheet } from '../sheets/BusSheet';
import { JourneyBar } from '../sheets/JourneyBar';
import { JourneySheet, type EndKind, type JourneyMemory } from '../sheets/JourneySheet';
import { RideBar } from '../sheets/RideBar';
import type { Plan } from '../sheets/routeView';
import { StationSheet } from '../sheets/StationSheet';
import { TrainSheet } from '../sheets/TrainSheet';
import type { BusSheetView, LineColors, SendCommand, TrainUpdate } from '../sheets/types';
import { tokens } from '../theme/tokens';
import { setLineColors } from '../account/journey';
import { useMyLocation } from '../map/useMyLocation';
import { setMapTheme, useTheme } from '../theme/useTheme';

type Selected =
  | { kind: 'station'; station: StationInfo }
  | { kind: 'train'; train: TrainInfo }
  | { kind: 'bus'; view: BusSheetView; selection: BusSelection }
  | { kind: 'journey'; initial?: { end: EndKind; place: { lat: number; lng: number; name: string } } }
  | null;

// 지도(web setPadding)가 패딩을 옮기는 시간 300ms + 여유
const PADDING_EASE_MS = 350;
// 경로 막대 높이만큼 지도가 경로를 위로 맞추게(다리 showRoute padding.bottom — 화면 px)
const ROUTE_BAR_SPACE = 140;
// 다리에 지도 중심을 묻는 메시지가 없어, 고른 역이 없을 때 장소 검색 기준은 시청역(첫 화면 근처)으로 둔다
const SEARCH_CENTER = { lat: 37.5645695, lng: 126.976262 };

export default function MapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const myLocation = useMyLocation();
  const map = useRef<MapWebViewHandle>(null);
  const searchCenter = useRef(SEARCH_CENTER);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('basic');
  const [wantedMode, setWantedMode] = useState('basic');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeState, setThemeState] = useState<ThemeState | null>(null);
  const [prefs, setPrefs] = useState<PrefsState | null>(null);
  const [sky, setSky] = useState<SkyState | null>(null);
  const [colors, setColors] = useState<LineColors>({});
  const [trainUpdate, setTrainUpdate] = useState<TrainUpdate | null>(null);
  const [journey, setJourney] = useState<JourneyMemory | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  // 지금 따라가는 것 · 방금 놓은 것(끌어서 풀렸을 때만 '다시 따라가기' 단추를 보인다 — 시작하는 동안 깜빡이지 않게)
  const [follow, setFollow] = useState<{ id: string | null; letGo: string | null }>({ id: null, letGo: null });
  // 롤코 탑승 중: 지도 글자와, 내릴 때 다시 열 열차
  const [ride, setRide] = useState<{ text: string; train: TrainInfo | null } | null>(null);
  const selectedNow = useRef<Selected>(null);
  const mapClosedBus = useRef(false);

  // 지금 지도에 그린 경로(/api/route plans[] 한 개) — 지도가 다시 뜨면 ready 때 다시 그린다
  const shownPlan = useRef<RoutePlan | null>(null);
  // 승차권 경로 선택이 미리 그린 경로 — 길찾기 경로와 따로 둔다(나가면 지우기만 하고 되살리지 않는다)
  const previewed = useRef<{ plan: RoutePlan; bottom: number } | null>(null);
  const routeBottom = ROUTE_BAR_SPACE + insets.bottom;
  const sentHeight = useRef(0);

  const send = useCallback((command: AppCommand) => { if (ready) map.current?.send(command); }, [ready]);
  const sendSheet: SendCommand = send;

  const onMessage = useCallback((message: MapMessage) => {
    switch (message.type) {
      case 'ready':
        if (message.version !== BRIDGE_VERSION) setNotice(`지도 다리 판이 달라요(지도 ${message.version} · 앱 ${BRIDGE_VERSION})`);
        setReady(true); setColors(message.colors); setLineColors(message.colors); setMode(message.mode); setWantedMode(message.mode); setLoadError(null);
        if (message.theme) { setThemeState(message.theme); setMapTheme(message.theme.theme); }
        if (message.prefs) setPrefs(message.prefs);
        if (previewed.current) map.current?.send({ type: 'showRoute', plan: previewed.current.plan, padding: { bottom: previewed.current.bottom } });
        else if (shownPlan.current) map.current?.send({ type: 'showRoute', plan: shownPlan.current, padding: { bottom: routeBottom } });
        break;
      case 'themeChanged': setThemeState(message.theme); setMapTheme(message.theme.theme); break;
      case 'prefsChanged': setPrefs(message.prefs); break;
      case 'sky': setSky(message.sky); break;
      case 'stationTap': setSelected({ kind: 'station', station: message.station }); break;
      case 'trainTap': setTrainUpdate(null); setSelected({ kind: 'train', train: message.train }); break;
      case 'trainUpdate': setTrainUpdate(message.update); break;
      // 지도에서 사라진 열차: 그 열차 시트만 닫는다(그 사이 다른 시트를 열었으면 둔다)
      case 'trainGone': setSelected((current) => (current?.kind === 'train' && current.train.id === message.id ? null : current)); break;
      case 'busTap': setSelected({ kind: 'bus', view: message.view, selection: message.selection }); break;
      case 'busUpdate': setSelected((current) => (current?.kind === 'bus' ? { ...current, view: message.view, selection: message.selection } : current)); break;
      case 'busClosed':
        if (selectedNow.current?.kind === 'bus') mapClosedBus.current = true;
        setSelected((current) => (current?.kind === 'bus' ? null : current));
        break;
      case 'followChanged': {
        // 시트가 보고 있는 것을 놓쳤을 때만 단추를 보인다 — 시트를 닫거나 바꾸며 놓은 것(unwatchTrain · closeBus)은 아니다
        const shown = selectedNow.current;
        const shownId = shown?.kind === 'train' ? shown.train.id : shown?.kind === 'bus' ? shown.selection.id : null;
        setFollow((current) => ({ id: message.id, letGo: message.id === null && current.id === shownId ? current.id : null }));
        break;
      }
      case 'rideChanged': {
        if (!message.riding) { setRide(null); break; }
        const current = selectedNow.current;
        const train = current?.kind === 'train' ? current.train : null;
        setRide((before) => ({ text: message.text, train: before?.train ?? train }));
        setSelected(null);
        break;
      }
      case 'modeChanged': setMode(message.mode); setWantedMode(message.mode); break;
      case 'error':
        console.warn('지도 다리 오류', message.code, message.request ?? '', message.message);
        if (message.request === 'setMode') setWantedMode((current) => (current === mode ? current : mode));
        if (message.request === 'showRoute') { shownPlan.current = null; previewed.current = null; }
        break;
    }
  }, [mode, routeBottom]);

  // 지도가 처음부터 다시 뜬다 — ready 전에는 명령을 보내지 않는다(그린 경로는 ready 때 다시 그린다)
  const onReloading = useCallback(() => { setReady(false); setSelected(null); setMenuOpen(false); setRide(null); setFollow({ id: null, letGo: null }); }, []);

  const clearRoute = useCallback(() => { shownPlan.current = null; send({ type: 'clearRoute' }); }, [send]);
  const showRoute = useCallback((plan: Plan) => {
    shownPlan.current = plan;
    send({ type: 'showRoute', plan, padding: { bottom: Math.max(routeBottom, sentHeight.current) } });
  }, [routeBottom, send]);
  const dropJourney = useCallback(() => { setJourney(null); clearRoute(); }, [clearRoute]);

  useEffect(() => { selectedNow.current = selected; }, [selected]);

  // 버스 시트가 어떤 길로든 사라지면(뒤로가기 · 역 · 열차 · 검색) 지도의 버스 선택도 놓는다. 지도가 먼저 닫았으면(busClosed) 다시 보내지 않는다 — 그 사이 고른 다른 버스를 지우지 않게
  const busOpen = useRef(false);
  const selectedKind = selected?.kind;
  useEffect(() => {
    const open = selectedKind === 'bus';
    if (busOpen.current && !open && !mapClosedBus.current) send({ type: 'closeBus' });
    busOpen.current = open;
    mapClosedBus.current = false;
  }, [selectedKind, send]);

  // 시트 높이를 지도에 알린다(따라가기 · 맞추기가 시트 위로 잡게). 지도가 패딩을 움직이는 동안 경로를 맞추면 그 움직임이 끊겨 패딩이 옛 값에 남으니,
  // 움직임이 끝난 뒤에 길찾기 중이거나 시트가 닫혔으면 경로를 다시 맞춘다
  const refitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready) { sentHeight.current = 0; return; }
    if (sentHeight.current === sheetHeight) return;
    sentHeight.current = sheetHeight;
    send({ type: 'setPadding', bottom: sheetHeight });
    if (refitTimer.current) clearTimeout(refitTimer.current);
    refitTimer.current = setTimeout(() => {
      const kind = selectedNow.current?.kind;
      if (previewed.current) { send({ type: 'showRoute', plan: previewed.current.plan, padding: { bottom: previewed.current.bottom } }); return; }
      if (shownPlan.current && (kind === 'journey' || kind === undefined)) send({ type: 'showRoute', plan: shownPlan.current, padding: { bottom: Math.max(routeBottom, sentHeight.current) } });
    }, PADDING_EASE_MS);
  }, [ready, routeBottom, send, sheetHeight]);
  useEffect(() => () => { if (refitTimer.current) clearTimeout(refitTimer.current); }, []);

  // 내리기: 웹 '내리기' 처럼 그 열차 시트로 돌아간다(그 사이 없어졌으면 trainGone 이 닫는다)
  const leaveRide = useCallback(() => {
    send({ type: 'stopRide' });
    const train = ride?.train ?? null;
    setRide(null);
    if (train) { setTrainUpdate(null); setSelected({ kind: 'train', train }); }
  }, [ride, send]);

  // 회원 화면(모달)이 위에 떠 있는가 — 뒤로 키 차례 · 메뉴 돌아오기 · 토스트 자리
  const [covered, setCovered] = useState(false);
  useFocusEffect(useCallback(() => { setCovered(false); return () => setCovered(true); }, []));

  // 메뉴를 열고 닫을 때 지도에 알린다(다리 v2 — 그래야 기온 · 날씨 글이 온다)
  const openMenu = useCallback((open: boolean) => { setMenuOpen(open); send({ type: 'skyOpen', open }); }, [send]);

  // 안드로이드 뒤로가기: 탑승 → 시트 → 경로 차례로 닫고, 다 닫혔으면 시스템 기본(메뉴는 Menu 가 먼저 받는다)
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (covered) return false;   // 회원 화면이 위에 있으면 그 화면 차례
      if (ride) { leaveRide(); return true; }
      if (selected) { setSelected(null); return true; }
      if (journey) { dropJourney(); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [covered, ride, leaveRide, selected, journey, dropJourney]);

  const pickStation = (end: EndKind, station: StationInfo) => {
    searchCenter.current = { lat: station.lat, lng: station.lon };
    setSelected({ kind: 'journey', initial: { end, place: { lat: station.lat, lng: station.lon, name: station.name } } });
  };
  // 내 정보 · 승차권은 메뉴 안의 한 쪽(웹 menu-page): 서랍을 연 채 위에 같은 자리로 올리고, 뒤로 하면 서랍 첫 단계가 그대로 있다.
  // 로그인은 웹처럼 서랍을 닫고 시트만(account/AccountScreen).
  const openAccount = () => { router.push('/account'); };
  const openTickets = () => { router.push('/account/tickets'); };
  const [menuAside, setMenuAsideState] = useState(false);
  useEffect(() => {
    linkMenu(menuOpen ? { close: () => openMenu(false), setAside: setMenuAsideState } : null);
    // 닫힐 때 비켜 둠도 푼다 — 경로 선택의 닫기는 줄을 먼저 끊어 그 화면의 정리(setMenuAside(false))가 여기 닿지 못한다
    return () => { linkMenu(null); setMenuAsideState(false); };
  }, [menuOpen, openMenu]);

  // 승차권 경로 미리보기: 웹 ticketRoute.show 처럼 길찾기 · 시트를 치우고 그 경로만 패널 위에 맞춘다
  useEffect(() => {
    linkRouteMap({
      show: (plan, bottom) => {
        setJourney(null);
        setSelected(null);
        shownPlan.current = null;
        previewed.current = { plan, bottom };
        send({ type: 'showRoute', plan, padding: { bottom } });
      },
      clear: () => {
        if (!previewed.current) return;
        previewed.current = null;
        send({ type: 'clearRoute' });
      },
    });
    return () => linkRouteMap(null);
  }, [send]);

  const closeSheet = useCallback(() => setSelected(null), []);
  const barPlan = journey?.plans[journey.selected] ?? null;
  const body = { color: theme.color.secondary, fontFamily: theme.font.body };

  return (
    <View style={[styles.screen, { backgroundColor: theme.color.board }]}>
      <StatusBar style={theme.name === 'light' ? 'dark' : 'light'} />
      <Header menuOpen={menuOpen} onRefresh={() => map.current?.reload()} onMenu={() => openMenu(true)} />
      <View style={styles.mapArea}>
        <MapWebView ref={map} onMessage={onMessage} onReloading={onReloading} onLoadFailed={setLoadError} />

        {!ready && !loadError ? (
          <View style={[styles.cover, { backgroundColor: theme.color.board }]} pointerEvents="none">
            <ActivityIndicator size="large" />
            <Text style={[styles.coverText, body]}>지도를 여는 중</Text>
          </View>
        ) : null}
        {loadError ? (
          <View style={[styles.cover, { backgroundColor: theme.color.board }]}>
            <Text style={[styles.coverText, body]}>{loadError}</Text>
            <View style={styles.coverButton}><SheetButton label="다시 열기" onPress={() => { setLoadError(null); map.current?.reload(); }} /></View>
          </View>
        ) : null}

        {ready && !ride ? (
          <StationSearch onPick={(station) => { searchCenter.current = { lat: station.lat, lng: station.lon }; send({ type: 'focusStation', id: station.id }); setSelected({ kind: 'station', station }); }} />
        ) : null}
        {notice ? <Text style={[styles.notice, body, { backgroundColor: theme.color.paper }]} onPress={() => setNotice(null)}>{notice}</Text> : null}

        {ride ? <RideBar text={ride.text} color={ride.train ? colors[ride.train.line] : undefined} onLeave={leaveRide} /> : null}
        {ready && !selected && !barPlan && !ride ? <RouteButton onPress={() => setSelected({ kind: 'journey' })} /> : null}
        {barPlan && !selected && !ride ? <JourneyBar plan={barPlan} colors={colors} onOpen={() => setSelected({ kind: 'journey' })} onClear={dropJourney} /> : null}

        <SheetHeightContext.Provider value={setSheetHeight}>
        {selected?.kind === 'station' ? (
          <StationSheet key={selected.station.id} station={selected.station} colors={colors} onClose={closeSheet} onPick={(end) => pickStation(end, selected.station)} />
        ) : null}
        {selected?.kind === 'train' ? (
          <TrainSheet key={selected.train.id} train={selected.train} update={trainUpdate?.id === selected.train.id ? trainUpdate : null} colors={colors} letGo={follow.letGo === selected.train.id} send={sendSheet} onClose={closeSheet} />
        ) : null}
        {selected?.kind === 'bus' ? <BusSheet key={selected.selection.id} view={selected.view} followAgainId={selected.selection.kind === 'bus' && follow.letGo === selected.selection.id ? selected.selection.id : null} send={sendSheet} onClose={closeSheet} /> : null}
        {selected?.kind === 'journey' ? (
          <JourneySheet colors={colors} center={() => searchCenter.current} myLocation={myLocation} {...(selected.initial ? { initial: selected.initial } : {})}
            memory={journey} onMemory={setJourney} showRoute={showRoute} clearRoute={clearRoute} onClose={closeSheet} />
        ) : null}
        </SheetHeightContext.Provider>
      </View>
      <Menu open={menuOpen} covered={covered} aside={menuOpen && menuAside} onClose={() => openMenu(false)} wantedMode={wantedMode} onAccount={openAccount} onTickets={openTickets}
        themeState={themeState} sky={sky} prefs={prefs} onTheme={(choice) => send({ type: 'setTheme', choice })}
        onPref={(key, value) => { if (key === 'speed') send({ type: 'setPref', key, value: Number(value) }); else send({ type: 'setPref', key, value: value === true }); }}
        onPickMode={(next) => { setWantedMode(next); send({ type: 'setMode', mode: next }); }} />
      {covered ? null : <Toast inPanel={menuOpen} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  mapArea: { flex: 1 },
  cover: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: tokens.space[3], padding: 32 },
  coverText: { fontSize: tokens.text[15], textAlign: 'center' },
  coverButton: { flexDirection: 'row', width: 160 },
  notice: { position: 'absolute', zIndex: 7, top: 62, left: 10, right: 10, padding: tokens.space[2], borderRadius: tokens.radius[8], fontSize: tokens.text[12] },
});
