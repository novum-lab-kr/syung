// 지도 화면(1단계 시제품): 웹 지도(웹뷰) 위에 역 · 열차 시트 · 모드 고르기 · 길찾기 경로 막대를 RN 으로 얹는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { findRoute } from '../api/route';
import { Sheet, SheetButton, sheetStyles } from '../components/Sheet';
import { BRIDGE_VERSION, type AppCommand, type MapMessage, type RoutePlan, type StationInfo, type TrainInfo } from '../map/bridge';
import { MapWebView, type MapWebViewHandle } from '../map/MapWebView';
import { modeLabel } from '../map/modes';

type Selected = { kind: 'station'; station: StationInfo } | { kind: 'train'; train: TrainInfo } | null;
type RouteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'shown' }
  | { status: 'failed'; message: string };
interface MapState { mode: string; modes: string[] }

// 경로 막대 높이만큼 지도가 경로를 위로 맞추게(다리 showRoute padding.bottom — 화면 px)
const ROUTE_BAR_SPACE = 140;

function trainSubtitle(train: TrainInfo): string {
  const tags = [train.express ? '급행' : '', train.last ? '막차' : ''].filter(Boolean).join(' · ');
  return [`${train.destination}행`, train.direction, tags].filter(Boolean).join(' · ');
}

function routeMessage(route: RouteState): string {
  if (route.status === 'loading') return '경로를 찾고 있어요';
  if (route.status === 'failed') return route.message;
  return '';
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const map = useRef<MapWebViewHandle>(null);
  const routeRequest = useRef<AbortController | null>(null);
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [modePicker, setModePicker] = useState(false);
  const [from, setFrom] = useState<StationInfo | null>(null);
  const [to, setTo] = useState<StationInfo | null>(null);
  const [route, setRoute] = useState<RouteState>({ status: 'idle' });

  // 지금 지도에 그린 경로(/api/route plans[] 한 개) — 지도가 다시 뜨면 ready 때 다시 그린다
  const shownPlan = useRef<RoutePlan | null>(null);
  const routeBottom = ROUTE_BAR_SPACE + insets.bottom;

  const send = useCallback((command: AppCommand) => { if (mapState) map.current?.send(command); }, [mapState]);

  const onMessage = useCallback((message: MapMessage) => {
    switch (message.type) {
      case 'ready':
        if (message.version !== BRIDGE_VERSION) setNotice(`지도 다리 판이 달라요(지도 ${message.version} · 앱 ${BRIDGE_VERSION})`);
        setMapState({ mode: message.mode, modes: message.modes });
        setLoadError(null);
        if (shownPlan.current) map.current?.send({ type: 'showRoute', plan: shownPlan.current, padding: { bottom: routeBottom } });
        break;
      case 'stationTap': setSelected({ kind: 'station', station: message.station }); setModePicker(false); break;
      case 'trainTap': setSelected({ kind: 'train', train: message.train }); setModePicker(false); break;
      case 'modeChanged': setMapState((state) => (state ? { ...state, mode: message.mode } : state)); break;
      case 'error':
        console.warn('지도 다리 오류', message.code, message.request ?? '', message.message);
        if (message.request === 'showRoute') { shownPlan.current = null; setRoute({ status: 'failed', message: '이 경로는 지도에 그릴 수 없어요.' }); }
        break;
    }
  }, [routeBottom]);

  // 지도가 처음부터 다시 뜬다 — ready 전에는 명령을 보내지 않는다(그린 경로는 ready 때 다시 그린다)
  const onReloading = useCallback(() => {
    setMapState(null);
    setSelected(null);
    setModePicker(false);
  }, []);

  const clearRoute = useCallback(() => {
    routeRequest.current?.abort();
    shownPlan.current = null;
    setFrom(null); setTo(null); setRoute({ status: 'idle' });
    send({ type: 'clearRoute' });
  }, [send]);

  // 출발 · 도착 역이 다 정해지면 길찾기 → 첫 경로를 지도에 그린다(앞의 찾기는 버린다)
  const searchRoute = (start: StationInfo, goal: StationInfo) => {
    routeRequest.current?.abort();
    const controller = new AbortController();
    routeRequest.current = controller;
    setRoute({ status: 'loading' });
    findRoute(start, goal, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (!result.ok) { setRoute({ status: 'failed', message: result.message }); return; }
      shownPlan.current = result.plan;
      map.current?.send({ type: 'showRoute', plan: result.plan, padding: { bottom: routeBottom } });
      setRoute({ status: 'shown' });
    }).catch(() => undefined);
  };

  useEffect(() => () => routeRequest.current?.abort(), []);

  // 안드로이드 뒤로가기: 열린 것(모드 목록 → 시트 → 경로)부터 닫고, 다 닫혔으면 시스템 기본(앱 나가기)
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modePicker) { setModePicker(false); return true; }
      if (selected) { setSelected(null); return true; }
      if (from || to) { clearRoute(); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [modePicker, selected, from, to, clearRoute]);

  const pickStation = (role: 'from' | 'to', station: StationInfo) => {
    const start = role === 'from' ? station : from, goal = role === 'to' ? station : to;
    setFrom(start); setTo(goal); setSelected(null);
    if (start && goal) searchRoute(start, goal);
  };

  const routeShown = from !== null || to !== null;

  return (
    <View style={styles.screen}>
      <View style={[styles.mapArea, { paddingTop: insets.top }]}>
        <MapWebView ref={map} onMessage={onMessage} onReloading={onReloading} onLoadFailed={setLoadError} />
      </View>

      {!mapState && !loadError ? (
        <View style={styles.cover} pointerEvents="none">
          <ActivityIndicator size="large" />
          <Text style={styles.coverText}>지도를 여는 중</Text>
        </View>
      ) : null}
      {loadError ? (
        <View style={styles.cover}>
          <Text style={styles.coverText}>{loadError}</Text>
          <SheetButton label="다시 열기" onPress={() => { setLoadError(null); map.current?.reload(); }} />
        </View>
      ) : null}

      {mapState ? (
        <Pressable style={[styles.modeButton, { top: insets.top + 12, right: insets.right + 12 }]} accessibilityRole="button"
          accessibilityLabel={`모드 바꾸기, 지금 ${modeLabel(mapState.mode)}`} onPress={() => setModePicker((open) => !open)}>
          <Text style={styles.modeButtonText}>{modeLabel(mapState.mode)}</Text>
        </Pressable>
      ) : null}
      {notice ? <Text style={[styles.notice, { top: insets.top + 60 }]} onPress={() => setNotice(null)}>{notice}</Text> : null}

      {mapState && modePicker ? (
        <View style={[styles.modeList, { top: insets.top + 60, right: insets.right + 12 }]}>
          <ScrollView>
            {mapState.modes.map((id) => (
              <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: id === mapState.mode }}
                style={({ pressed }) => [styles.modeItem, pressed && styles.pressed]}
                onPress={() => { setModePicker(false); if (id !== mapState.mode) send({ type: 'setMode', mode: id }); }}>
                <Text style={[styles.modeItemText, id === mapState.mode && styles.modeItemCurrent]}>{modeLabel(id)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {routeShown && !selected ? (
        <View style={[styles.routeBar, { bottom: insets.bottom + 16 }]}>
          <Text style={styles.routeTitle}>{from?.name ?? '출발 역을 고르세요'} → {to?.name ?? '도착 역을 고르세요'}</Text>
          {routeMessage(route) ? <Text style={sheetStyles.line}>{routeMessage(route)}</Text> : null}
          <View style={sheetStyles.row}><SheetButton label="경로 지우기" onPress={clearRoute} /></View>
        </View>
      ) : null}

      {selected?.kind === 'station' ? (
        <Sheet title={selected.station.name} subtitle={selected.station.lines.join(' · ')} onClose={() => setSelected(null)}>
          <View style={sheetStyles.row}>
            <SheetButton label="여기로 이동" onPress={() => send({ type: 'focusStation', id: selected.station.id })} />
            <SheetButton label="출발" onPress={() => pickStation('from', selected.station)} />
            <SheetButton label="도착" onPress={() => pickStation('to', selected.station)} />
          </View>
        </Sheet>
      ) : null}
      {selected?.kind === 'train' ? (
        <Sheet title={`${selected.train.line} ${selected.train.trainNo}`} subtitle={trainSubtitle(selected.train)} onClose={() => setSelected(null)}>
          <Text style={sheetStyles.line}>{[selected.train.station, selected.train.status].filter(Boolean).join(' ')}</Text>
          {selected.train.receivedAt ? <Text style={sheetStyles.line}>받은 시각 {selected.train.receivedAt.slice(11)}</Text> : null}
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f1ea' },
  mapArea: { flex: 1 },
  cover: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#f4f1ea' },
  coverText: { fontSize: 15, color: '#3d4148', textAlign: 'center' },
  modeButton: {
    position: 'absolute', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(20,20,20,0.86)',
  },
  modeButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  modeList: {
    position: 'absolute', maxHeight: 360, minWidth: 150, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  modeItem: { paddingHorizontal: 16, paddingVertical: 10 },
  modeItemText: { fontSize: 15, color: '#141414' },
  modeItemCurrent: { fontWeight: '700' },
  pressed: { opacity: 0.6 },
  notice: {
    position: 'absolute', left: 12, right: 12, padding: 10, borderRadius: 12, backgroundColor: '#fff3cd', color: '#5c4400', fontSize: 13, overflow: 'hidden',
  },
  routeBar: {
    position: 'absolute', left: 12, right: 12, padding: 16, borderRadius: 18, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  routeTitle: { fontSize: 16, fontWeight: '700', color: '#141414' },
});
