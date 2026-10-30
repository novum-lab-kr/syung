// 앱 지도 모드 · 앱 ↔ 지도 다리(web/ui/app_bridge.mts) · 서버 주소 한 곳(web/lib/server_url.mts)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {APP_SERVER_ORIGIN, serverUrl} from '../web/lib/server_url.mts';
import {createAppBridge, parseAppMessage, appNoticeLift, APP_BRIDGE_VERSION, STATUS_GAP_MS} from '../web/ui/app_bridge.mts';

const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
// index.html 의 앱 지도 모드 표시 스크립트를 주소 #… 하나로 돌려 html[data-app] 을 본다
const appScript = html.match(/<script>(\/\* 앱 지도 모드[^<]*)<\/script>/)?.[1];
function appFlag(hash) {
  const documentElement = {dataset: {}};
  vm.runInNewContext(appScript, {location: {hash}, document: {documentElement}});
  return documentElement.dataset.app;
}

test('index.html: 주소 #app(따로 떨어진 낱말)일 때만 html[data-app=map]', () => {
  assert.ok(appScript, 'index.html 에 앱 지도 모드 스크립트가 있다');
  for (const hash of ['#app', '#app&fps', '#fps&app', '#saver&app&debug']) assert.equal(appFlag(hash), 'map', hash);
  for (const hash of ['', '#', '#login=apple', '#apple', '#fps', '#happ', '#app=1', '#appx']) assert.equal(appFlag(hash), undefined, hash);
});

test('서버 주소: 웹은 그대로 · 앱 지도 모드는 map. 운영 주소에 붙인다', () => {
  assert.equal(APP_SERVER_ORIGIN, 'https://map.syung.novum-lab.com');
  assert.equal(serverUrl('./api/live?lines=1%ED%98%B8%EC%84%A0', false), './api/live?lines=1%ED%98%B8%EC%84%A0');
  assert.equal(serverUrl('/data/bus/routes.json', false), '/data/bus/routes.json');
  assert.equal(serverUrl('./api/live?lines=a', true), 'https://map.syung.novum-lab.com/api/live?lines=a');
  assert.equal(serverUrl('/api/bus/live?stop=1', true), 'https://map.syung.novum-lab.com/api/bus/live?stop=1');
  assert.equal(serverUrl('./edge_times.json', true), 'https://map.syung.novum-lab.com/edge_times.json');
  assert.equal(serverUrl('https://tiles.openfreemap.org/x', true), 'https://tiles.openfreemap.org/x');
  // Node 에는 document 가 없다: 앱 지도 모드가 아닌 것으로
  assert.equal(serverUrl('./api/route?x=1'), './api/route?x=1');
});

const facts = {hasStation: id => [1, 2, 3].includes(id), hasLine: line => line === '2호선', hasMode: id => ['basic', 'simcity', 'coaster'].includes(id)};
const walk = {type: 'walk', path: [[126.97, 37.56], [126.98, 37.57]]};
const ride = {type: 'ride', line: '2호선', stations: [1, 2, 3], trainNo: null};
const bus = {type: 'bus', path: [[127, 37.5], [127.01, 37.51]], route: '472'};
// ready 에 싣는 지도 상태(다리 v2) — 시험용 가짜 값
const theme = {choice: 'auto', theme: 'light', note: '지금은 낮이라 밝게'};
const prefs = {prebuild: false, saver: false, speed: 1, speedNote: '실시간'};
const info = (mode = 'basic', modes = ['basic', 'simcity', 'coaster']) => ({mode, modes, colors: {'2호선': '#00A84D'}, theme, prefs});

test('앱 → 지도 메시지: 글자(JSON) · 객체 모두 받고 칸을 검사한다', () => {
  const route = parseAppMessage(JSON.stringify({type: 'showRoute', plan: {legs: [walk, ride, bus], minutes: 12}, padding: {bottom: 320}}), facts);
  assert.equal(route.ok, true);
  assert.deepEqual(route.command, {type: 'showRoute', plan: {legs: [walk, ride, bus], minutes: 12}, padding: {bottom: 320}});
  assert.deepEqual(parseAppMessage({type: 'clearRoute'}, facts), {ok: true, command: {type: 'clearRoute'}});
  assert.deepEqual(parseAppMessage({type: 'focusStation', id: 2}, facts).command, {type: 'focusStation', id: 2, zoom: null});
  assert.deepEqual(parseAppMessage({type: 'focusStation', id: 2, zoom: 16}, facts).command, {type: 'focusStation', id: 2, zoom: 16});
  assert.deepEqual(parseAppMessage({type: 'setMode', mode: 'simcity'}, facts).command, {type: 'setMode', mode: 'simcity'});
});

test('앱 → 지도 메시지: 틀린 칸은 bad_field · 모르는 type 은 unknown_type · 다리 메시지가 아니면 null', () => {
  const code = message => parseAppMessage(message, facts)?.code;
  assert.equal(code({type: 'showRoute', plan: {legs: []}}), 'bad_field');
  assert.equal(code({type: 'showRoute', plan: {legs: [{...ride, line: '없는선'}]}}), 'bad_field');
  assert.equal(code({type: 'showRoute', plan: {legs: [{...ride, stations: [1, 99]}]}}), 'bad_field');
  assert.equal(code({type: 'showRoute', plan: {legs: [{type: 'bus', path: [[1, 2]]}]}}), 'bad_field');
  assert.equal(code({type: 'showRoute', plan: {legs: [{type: 'boat'}]}}), 'bad_field');
  // 걷기 path 는 필수 · 지하철 path 는 있으면 둘 이상 · 좌표는 범위 안의 유한수
  assert.equal(code({type: 'showRoute', plan: {legs: [{type: 'walk'}, ride]}}), 'bad_field');
  assert.equal(code({type: 'showRoute', plan: {legs: [{...walk, path: [[126.97, 37.56]]}]}}), 'bad_field');
  assert.equal(code({type: 'showRoute', plan: {legs: [{...ride, path: []}]}}), 'bad_field');
  assert.equal(code({type: 'showRoute', plan: {legs: [{...ride, path: [[126.97, 37.56]]}]}}), 'bad_field');
  assert.equal(parseAppMessage({type: 'showRoute', plan: {legs: [{...ride, path: walk.path}]}}, facts).ok, true);
  for (const point of [[181, 37.5], [-181, 37.5], [127, 91], [127, -91], [127, Infinity], [NaN, 37.5], ['127', 37.5]]) {
    assert.equal(code({type: 'showRoute', plan: {legs: [{...walk, path: [walk.path[0], point]}]}}), 'bad_field', `walk ${point}`);
    assert.equal(code({type: 'showRoute', plan: {legs: [{...bus, path: [point, bus.path[1]]}]}}), 'bad_field', `bus ${point}`);
    assert.equal(code({type: 'showRoute', plan: {legs: [{...ride, path: [walk.path[0], point]}]}}), 'bad_field', `ride ${point}`);
  }
  assert.equal(parseAppMessage({type: 'showRoute', plan: {legs: [{type: 'walk', path: [[-180, -90], [180, 90]]}]}}, facts).ok, true);
  assert.equal(code({type: 'showRoute', plan: {legs: [walk]}, padding: {bottom: -1}}), 'bad_field');
  assert.equal(code({type: 'focusStation', id: 99}), 'bad_field');
  assert.equal(code({type: 'focusStation', id: '2'}), 'bad_field');
  assert.equal(code({type: 'focusStation', id: 2, zoom: 30}), 'bad_field');
  assert.equal(code({type: 'setMode', mode: 'nope'}), 'bad_field');
  assert.equal(code({type: 'flyAway'}), 'unknown_type');
  for (const other of ['not json', '{"a":1}', 42, null, {source: 'react-devtools'}]) assert.equal(parseAppMessage(other, facts), null);
});

test('다리: ready 전 명령은 not_ready, ready 뒤에는 지도에 넘기고 · 누름은 JSON 글자로 보낸다', () => {
  const sent = [], done = [];
  const bridge = createAppBridge({facts, post: text => sent.push(JSON.parse(text))});
  bridge.receive({type: 'clearRoute'});
  assert.deepEqual(sent.pop(), {type: 'error', code: 'not_ready', message: '지도를 준비하는 중 — ready 를 받은 뒤 보낸다', request: 'clearRoute'});
  bridge.ready({showRoute: (plan, pad) => done.push(['route', plan.legs.length, pad]), clearRoute: () => done.push(['clear']),
    focusStation: (id, zoom) => done.push(['focus', id, zoom]), setMode: id => { if (id === 'coaster') throw new Error('준비 실패'); done.push(['mode', id]) }}, info());
  assert.equal(APP_BRIDGE_VERSION, 2);
  assert.deepEqual(sent.pop(), {type: 'ready', version: 2, ...info()});
  bridge.receive(JSON.stringify({type: 'showRoute', plan: {legs: [ride]}}));
  bridge.receive({type: 'focusStation', id: 3});
  bridge.receive({type: 'setMode', mode: 'simcity'});
  assert.deepEqual(done, [['route', 1, {}], ['focus', 3, null], ['mode', 'simcity']]);
  const quiet = console.error;console.error = () => {};
  try { bridge.receive({type: 'setMode', mode: 'coaster'}) } finally { console.error = quiet }
  assert.deepEqual(sent.pop(), {type: 'error', code: 'failed', message: '준비 실패', request: 'setMode'});
  bridge.receive({type: 'focusStation', id: 99});
  assert.equal(sent.pop().code, 'bad_field');

  bridge.stationTap({id: 2, name: '을지로입구', lat: 37.566, lon: 126.982, lines: [{name: '2호선', code: 'GTFS'}], express: []});
  assert.deepEqual(sent.pop(), {type: 'stationTap', station: {id: 2, name: '을지로입구', lines: ['2호선'], lat: 37.566, lon: 126.982}});
  bridge.trainTap({id: '2호선:2045', t: {line: '2호선', trainNo: '2045', station: '시청', destination: '성수', direction: '내선', status: '도착', express: false, last: true, receivedAt: '2026-10-30 13:00:00', etaSeconds: 30}});
  assert.deepEqual(sent.pop(), {type: 'trainTap', train: {id: '2호선:2045', line: '2호선', trainNo: '2045', station: '시청', destination: '성수', direction: '내선', status: '도착', express: false, last: true, receivedAt: '2026-10-30 13:00:00'}});
  bridge.modeChanged('simcity');
  assert.deepEqual(sent.pop(), {type: 'modeChanged', mode: 'simcity'});
  assert.equal(sent.length, 0);
});

test('다리: iOS(window) · Android(document) 의 message 이벤트를 한 번씩만 받는다', () => {
  const win = new EventTarget(), doc = new EventTarget(), done = [];
  const bridge = createAppBridge({facts, post: () => {}, targets: {window: win, document: doc}});
  bridge.ready({showRoute() {}, clearRoute: () => done.push('clear'), focusStation() {}, setMode() {}}, info('basic', ['basic']));
  win.dispatchEvent(new MessageEvent('message', {data: '{"type":"clearRoute"}'}));
  doc.dispatchEvent(new MessageEvent('message', {data: '{"type":"clearRoute"}'}));
  assert.deepEqual(done, ['clear', 'clear']);
});

test('다리 v2 앱 → 지도: 새 명령의 칸 검사', () => {
  const ok = message => parseAppMessage(message, facts);
  const code = message => parseAppMessage(message, facts)?.code;
  assert.deepEqual(ok({type: 'setTheme', choice: 'dark'}).command, {type: 'setTheme', choice: 'dark'});
  assert.deepEqual(ok({type: 'setPadding', bottom: 0}).command, {type: 'setPadding', bottom: 0});
  for (const type of ['watchTrain', 'followTrain', 'followBus']) assert.deepEqual(ok({type, id: '2호선:2045'}).command, {type, id: '2호선:2045'});
  for (const type of ['unwatchTrain', 'stopFollow', 'stopRide', 'closeBus', 'busRefresh']) assert.deepEqual(ok({type}).command, {type});
  assert.deepEqual(ok({type: 'startRide', id: 'x', seat: {car: 1, row: 2, side: -1}}).command, {type: 'startRide', id: 'x', seat: {car: 1, row: 2, side: -1}});
  assert.deepEqual(ok({type: 'setPref', key: 'saver', value: true}).command, {type: 'setPref', key: 'saver', value: true});
  assert.deepEqual(ok({type: 'setPref', key: 'speed', value: 20}).command, {type: 'setPref', key: 'speed', value: 20});
  assert.deepEqual(ok({type: 'skyOpen', open: false}).command, {type: 'skyOpen', open: false});
  assert.deepEqual(ok({type: 'busRoute', routeId: '100100118'}).command, {type: 'busRoute', routeId: '100100118'});
  assert.deepEqual(ok({type: 'busStopView', what: 'follow'}).command, {type: 'busStopView', what: 'follow'});
  for (const bad of [
    {type: 'setTheme', choice: 'night'}, {type: 'setPadding', bottom: -5}, {type: 'setPadding'},
    {type: 'watchTrain', id: ''}, {type: 'followTrain', id: 3}, {type: 'followBus'},
    {type: 'startRide', id: 'x'}, {type: 'startRide', id: 'x', seat: {car: 0, row: 1, side: 1}}, {type: 'startRide', id: 'x', seat: {car: 1, row: 1.5, side: 1}},
    {type: 'startRide', id: 'x', seat: {car: 1, row: 1, side: 0}},
    {type: 'setPref', key: 'prebuild', value: 'on'}, {type: 'setPref', key: 'speed', value: 3}, {type: 'setPref', key: 'volume', value: 1},
    {type: 'skyOpen', open: 1}, {type: 'busRoute'}, {type: 'busStopView', what: 'map'},
  ]) {
    const result = ok(bad);
    assert.equal(result.code, 'bad_field', JSON.stringify(bad));
    assert.equal(result.request, bad.type);
  }
  assert.equal(code({type: 'watchBus', id: 'x'}), 'unknown_type');
});

test('다리 v2: 지도에 없는 일은 failed · 있는 일은 그대로 넘긴다', () => {
  const sent = [], done = [];
  const bridge = createAppBridge({facts, post: text => sent.push(JSON.parse(text))});
  bridge.ready({showRoute() {}, clearRoute() {}, focusStation() {}, setMode() {},
    startRide: (id, seat) => done.push(['ride', id, seat]), setPref: (key, value) => done.push([key, value]), busStopView: what => done.push(['stop', what])}, info());
  sent.length = 0;
  bridge.receive({type: 'startRide', id: 'a', seat: {car: 2, row: 3, side: 1}});
  bridge.receive({type: 'setPref', key: 'speed', value: 5});
  bridge.receive({type: 'busStopView', what: 'route'});
  assert.deepEqual(done, [['ride', 'a', {car: 2, row: 3, side: 1}], ['speed', 5], ['stop', 'route']]);
  const quiet = console.error;console.error = () => {};
  try { bridge.receive({type: 'skyOpen', open: true}) } finally { console.error = quiet }
  assert.equal(sent.pop().code, 'failed');
  assert.equal(sent.length, 0);
});

test('다리 v2 지도 → 앱: 같은 값은 다시 안 보내고 · ready 전에는 마지막 값만 들고 있다', () => {
  const sent = [];
  const bridge = createAppBridge({facts, post: text => sent.push(JSON.parse(text))});
  const sky = {layers: {back: '<svg/>', sun: '', front: ''}, temp: null, sunset: '18:20', sunrise: '06:40', night: false, label: null, motion: {clouds: null, fall: null, trainSpeed: 1}};
  bridge.sky({...sky, sunset: '18:19'});
  bridge.sky(sky);
  bridge.followChanged('2호선:2045');
  bridge.trainUpdate({id: 'x', dest: '성수행', now: '', raw: null, ride: null});   // ready 전 열차 · 버스 자료는 버린다
  bridge.busTap({}, {kind: 'stop', id: '1'});
  assert.equal(sent.length, 0);
  bridge.ready({showRoute() {}, clearRoute() {}, focusStation() {}, setMode() {}}, info());
  assert.deepEqual(sent.map(message => message.type), ['ready', 'sky', 'followChanged']);
  assert.deepEqual(sent[1], {type: 'sky', ...sky});
  assert.deepEqual(sent[2], {type: 'followChanged', id: '2호선:2045'});
  sent.length = 0;
  // ready 에 실은 테마 · 내 설정과 같으면 안 보낸다
  bridge.themeChanged(theme);
  bridge.prefsChanged(prefs);
  bridge.sky(sky);
  bridge.followChanged('2호선:2045');
  assert.equal(sent.length, 0);
  bridge.themeChanged({...theme, choice: 'dark', theme: 'dark'});
  bridge.prefsChanged({...prefs, saver: true});
  bridge.followChanged(null);
  bridge.rideChanged({riding: true, id: 'a', text: '시청 → 을지로입구'});
  bridge.rideChanged({riding: true, id: 'a', text: '시청 → 을지로입구'});
  assert.deepEqual(sent, [
    {type: 'themeChanged', choice: 'dark', theme: 'dark', note: theme.note},
    {type: 'prefsChanged', prefs: {...prefs, saver: true}},
    {type: 'followChanged', id: null},
    {type: 'rideChanged', riding: true, id: 'a', text: '시청 → 을지로입구'},
  ]);
  sent.length = 0;
  // 열차 시트 자료는 1초마다 늘 보낸다
  const update = {id: 'a', dest: '성수행', now: '시청 도착', raw: null, ride: {cars: 10, rows: 3, seat: {car: 1, row: 1, side: 1}}};
  bridge.trainUpdate(update);
  bridge.trainUpdate(update);
  bridge.trainGone('a');
  assert.deepEqual(sent, [{type: 'trainUpdate', ...update}, {type: 'trainUpdate', ...update}, {type: 'trainGone', id: 'a'}]);
});

test('다리 v2 버스: 누름은 늘 · 바뀜은 다를 때만 · 닫힘은 열려 있을 때만', () => {
  const sent = [];
  const bridge = createAppBridge({facts, post: text => sent.push(JSON.parse(text))});
  bridge.ready({showRoute() {}, clearRoute() {}, focusStation() {}, setMode() {}}, info());
  sent.length = 0;
  const selection = {kind: 'stop', id: '12345'}, view = {kind: 'stop', title: '시청앞'};
  bridge.busClosed();
  bridge.busUpdate(view, selection);
  assert.equal(sent.length, 0);
  bridge.busTap(view, selection);
  bridge.busUpdate(view, selection);
  bridge.busUpdate({...view, title: '시청앞 · 덕수궁'}, selection);
  bridge.busTap(view, selection);
  bridge.busClosed();
  bridge.busClosed();
  assert.deepEqual(sent, [
    {type: 'busTap', view, selection},
    {type: 'busUpdate', view: {...view, title: '시청앞 · 덕수궁'}, selection},
    {type: 'busTap', view, selection},
    {type: 'busClosed'},
  ]);
});

test('다리 v2 status: 줄여 보내되 마지막 값은 늦게라도 보낸다', async () => {
  const sent = [];
  const bridge = createAppBridge({facts, post: text => sent.push(JSON.parse(text))});
  bridge.ready({showRoute() {}, clearRoute() {}, focusStation() {}, setMode() {}}, info());
  sent.length = 0;
  const live = {state: 'ok', text: '실시간 12대'};
  bridge.status({zoom: 12, live});
  bridge.status({zoom: 12.5, live});
  bridge.status({zoom: 13, live});
  assert.deepEqual(sent, [{type: 'status', zoom: 12, live}]);
  await new Promise(resolve => setTimeout(resolve, STATUS_GAP_MS + 50));
  assert.deepEqual(sent, [{type: 'status', zoom: 12, live}, {type: 'status', zoom: 13, live}]);
});

// 지도 빈 곳 누르기: 본체의 click 처리 · live.appMode 와 시트의 sheetBusy 를 글자로 잘라 함께 돌린다(sheet.mts 는 .tsx 를 불러 Node 가 직접 못 읽는다)
const runtimeSource = stripTypeScriptTypes(fs.readFileSync(new URL('../web/maplibre_runtime.mts', import.meta.url), 'utf8'));
const sheetSource = stripTypeScriptTypes(fs.readFileSync(new URL('../web/ui/sheet.mts', import.meta.url), 'utf8'));
function sliceBetween(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `표지를 찾지 못했다: ${start}`);
  return source.slice(from, to + end.length);
}
const emptyTapSource = sliceBetween(runtimeSource, "map.on('click',e=>{if(rider.ride)return;", 'closeSheet()});');
const appModeGetter = sliceBetween(runtimeSource, 'get appMode(){', '}');
const sheetBusySource = sliceBetween(sheetSource, 'function sheetBusy()', '\n');
function tapEmptyMap({app, hidden = true, following = null, followBus = null, selection = null, followView = false, journey = false}) {
  const closed = [];
  const context = vm.createContext({
    appBridge: app ? {} : null, sheet: {hidden}, following, followBus, sheetBody: {querySelector: () => (journey ? {} : null)},
    busLayer: {selection, followView: () => followView, selectAt: () => false},
    rider: {ride: null}, map: {on: (_name, handler) => { context.tap = handler; }, queryRenderedFeatures: () => []},
    pickTrain: () => null, closeSheet: () => closed.push('closed'),
  });
  vm.runInContext(`var live={${appModeGetter},get busLayer(){return busLayer}};${sheetBusySource}\n${emptyTapSource}`, context);
  context.tap({point: {x: 1, y: 1}});
  return closed.length === 1;
}

test('앱 지도 모드: 웹 시트가 숨어 있어도 따라가기 · 버스 선택 중이면 빈 곳을 눌러도 풀지 않는다', () => {
  assert.equal(tapEmptyMap({app: true, following: 'train-1'}), false);
  assert.equal(tapEmptyMap({app: true, followBus: 'bus-1'}), false);
  assert.equal(tapEmptyMap({app: true, selection: {kind: 'bus', id: 'bus-1'}}), false);
  assert.equal(tapEmptyMap({app: true, selection: {kind: 'stop', id: 'stop-1'}, followView: true}), false);
});

test('앱 지도 모드: 따라가기도 버스도 아니면 빈 곳을 누르면 푼다(정류장 · 노선 선택, 고른 것 없음)', () => {
  assert.equal(tapEmptyMap({app: true}), true);
  assert.equal(tapEmptyMap({app: true, selection: {kind: 'stop', id: 'stop-1'}}), true);
  assert.equal(tapEmptyMap({app: true, selection: {kind: 'route', id: 'route-1'}}), true);
});

test('일반 웹: 빈 곳 누르기는 그대로 — 시트가 숨어 있으면 닫기로 가고, 열려 있으면 하는 중인 시트만 둔다', () => {
  assert.equal(tapEmptyMap({app: false, hidden: true, selection: {kind: 'bus', id: 'bus-1'}}), true);
  assert.equal(tapEmptyMap({app: false, hidden: true, following: 'train-1'}), true);
  assert.equal(tapEmptyMap({app: false, hidden: false, following: 'train-1'}), false);
  assert.equal(tapEmptyMap({app: false, hidden: false, followBus: 'bus-1'}), false);
  assert.equal(tapEmptyMap({app: false, hidden: false, selection: {kind: 'bus', id: 'bus-1'}}), false);
  assert.equal(tapEmptyMap({app: false, hidden: false, journey: true}), false);
  assert.equal(tapEmptyMap({app: false, hidden: false}), true);
});

// 앱 지도 모드에서 켜자마자 위치를 묻지 않는다: 본체의 첫 방문 위치 구간을 글자로 잘라 돌린다
const firstVisitSource = sliceBetween(runtimeSource, "map.once('load',()=>{\n  if(!navigator.geolocation", '\n});');
function loadAndCountAsks({app}) {
  let asks = 0, onLoad = null;
  const context = vm.createContext({
    appMapMode: () => app, navigator: {geolocation: {getCurrentPosition: () => { asks++; }}},
    map: {once: (_name, handler) => { onLoad = handler; }}, geolocate: {trigger() {}}, METRO_AREA: [126.3, 36.8, 127.9, 38.3], autoLocating: false,
  });
  vm.runInContext(firstVisitSource, context);
  onLoad();
  return asks;
}

test('앱 지도 모드: 지도가 떠도 위치를 묻지 않는다(앱이 expo-location 으로 구한다 — 권한 창 없음)', () => {
  assert.equal(loadAndCountAsks({app: true}), 0);
});

test('일반 웹: 첫 방문 위치 묻기는 그대로', () => {
  assert.equal(loadAndCountAsks({app: false}), 1);
});

// 안내 글 자리: 앱 시트 · 막대 위로, 앱 검색창 아래로(앱 값은 app/src 의 StationSearch · RouteButton · JourneyBar · Sheet)
const css = fs.readFileSync(new URL('../web/syung.css', import.meta.url), 'utf8');

test('appNoticeLift: 시트는 그 위로 8px, 경로 막대는 앱이 잡아 둔 자리(showRoute padding) — 큰 쪽', () => {
  assert.equal(appNoticeLift(0, 0), 0);
  assert.equal(appNoticeLift(300, 0), 308);
  assert.equal(appNoticeLift(0, 174), 174);
  assert.equal(appNoticeLift(100, 174), 174);
  assert.equal(appNoticeLift(300, 174), 308);
});

test('앱 지도 모드 CSS: 위 글은 앱 검색창(위 10 + 높이 44) 아래, 아래 글은 시트 · 막대 값을 따르되 길찾기 단추 위가 바닥', () => {
  const top = css.match(/html\[data-app=map\] \.live-notice\{top:(\d+)px!important\}/);
  assert.ok(top, '앱 지도 모드 .live-notice 규칙이 없다');
  assert.ok(Number(top[1]) > 10 + 44);
  assert.match(css, /html\[data-app=map\] \.bus-notice\{bottom:max\(124px,var\(--app-notice-lift,0px\)\)\}/);
});

test('본체: setPadding · showRoute · clearRoute 가 아래 글 자리를 고친다(일반 웹에는 이 값을 쓰는 규칙이 없다)', () => {
  assert.match(runtimeSource, /setPadding:\(bottom\s*\)=>\{appPad=bottom;appSheetLift=bottom;liftAppNotice\(\);/);
  assert.match(runtimeSource, /showRoute:\(plan,pad\)=>\{ticketRoute\.show\(plan,\{bottom:pad\.bottom\?\?110,right:pad\.right\?\?40\}\);appRouteLift=pad\.bottom\?\?110;liftAppNotice\(\)\}/);
  assert.match(runtimeSource, /clearRoute:\(\)=>\{clearRoute\(\);refreshLive\(\);appRouteLift=0;liftAppNotice\(\)\}/);
  assert.equal(css.match(/--app-notice-lift/g).length, 1);
  assert.match(css.split('\n').find(line => line.includes('--app-notice-lift')), /^html\[data-app=map\] /);
});
