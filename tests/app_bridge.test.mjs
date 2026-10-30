// 앱 지도 모드 · 앱 ↔ 지도 다리(web/ui/app_bridge.mts) · 서버 주소 한 곳(web/lib/server_url.mts)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {APP_SERVER_ORIGIN, serverUrl} from '../web/lib/server_url.mts';
import {createAppBridge, parseAppMessage, APP_BRIDGE_VERSION} from '../web/ui/app_bridge.mts';

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
    focusStation: (id, zoom) => done.push(['focus', id, zoom]), setMode: id => { if (id === 'coaster') throw new Error('준비 실패'); done.push(['mode', id]) }}, 'basic', ['basic', 'simcity', 'coaster']);
  assert.deepEqual(sent.pop(), {type: 'ready', version: APP_BRIDGE_VERSION, mode: 'basic', modes: ['basic', 'simcity', 'coaster']});
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
  bridge.ready({showRoute() {}, clearRoute: () => done.push('clear'), focusStation() {}, setMode() {}}, 'basic', ['basic']);
  win.dispatchEvent(new MessageEvent('message', {data: '{"type":"clearRoute"}'}));
  doc.dispatchEvent(new MessageEvent('message', {data: '{"type":"clearRoute"}'}));
  assert.deepEqual(done, ['clear', 'clear']);
});
