import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {platformRuntime, local as localMeters} from './platform_endpoints_fixture.mjs';
import {createStationLabels} from '../web/map/labels.mts';
import {registerTransitLayers} from '../web/map/layers.mjs';
import {lineChip, sortLines, signRows, placeholderText, perspectiveRatio, drawStationSigns, signCollisionLayout, SIGN, signTextSize, dotLayout, signDimensions, routeTextColor, whiteContrast, borderSegments, signAnchor, stationLabelName} from '../web/lib/station_signs.mjs';

test('모든 지정 노선 약자는 표와 같고 서로 겹치지 않아요', () => {
  const entries = [
    ...Array.from({length: 9}, (_, i) => [`${i + 1}호선`, String(i + 1)]),
    ['GTX-A', 'A'], ['경의중앙선', '경'], ['경강선', '강'], ['경춘선', '춘'], ['공항철도', '공'],
    ['김포골드라인', '김'], ['서해선', '서'], ['수인분당선', '수'], ['신분당선', '신'], ['신림선', '림'],
    ['에버라인선', '에'], ['우이신설선', '우'], ['의정부선', '의'], ['인천1호선', '인1'], ['인천2호선', '인2'],
  ];
  const chips = entries.map(([name]) => lineChip(name));
  assert.deepEqual(chips, entries.map(([, chip]) => chip));
  assert.equal(new Set(chips).size, entries.length);
  assert.equal(lineChip('새노선'), '새');
  assert.equal(lineChip(''), '');
});


test('노선 점은 정렬된 데이터 순서와 lc 색을 보존해요', () => {
  assert.deepEqual(sortLines(['7호선', '6호선']), ['6호선', '7호선']);
  assert.deepEqual(sortLines(['공항철도', '4호선', '1호선']), ['1호선', '4호선', '공항철도']);
  assert.deepEqual(signRows({text: '태릉입구', ln: '6호선|7호선', lc: '#CD7C2F|#747F00'}),
    {name: '태릉입구', dots: [{color: '#CD7C2F'}, {color: '#747F00'}]});
  assert.equal(signRows({text: '역', ln: '1호선'}).dots[0].color, '#52646a');
  assert.deepEqual(signRows({text: '역'}), {name: '역', dots: []});
});

test('점 줄은 테두리까지 포함해 가운데 정렬되고 3px 간격을 유지해요', () => {
  assert.deepEqual(dotLayout(0), {width: 0, centers: []});
  assert.deepEqual(dotLayout(1), {width: 9, centers: [0]});
  assert.deepEqual(dotLayout(3), {width: 33, centers: [-12, 0, 12]});
  assert.deepEqual(dotLayout(2, 2), {width: 42, centers: [-12, 12]});
});

test('이름표은 이름에 좌우 7px 상하 4px 여백을 더하고 점 줄의 영역도 확보해요', () => {
  const box = signDimensions(56, 14, 3);
  assert.equal(box.width, 70);
  assert.equal(box.height, 22);
  assert.equal(box.above, 11.875);
  assert.equal(signDimensions(12, 12, 9).boundsWidth, dotLayout(9).width);
  assert.equal(signDimensions(0, 14, 0).width, 22);
  assert.equal(placeholderText(['6호선', '7호선'], '태릉입구'), '태릉입구');
  assert.ok(placeholderText(Array(9).fill('1호선'), '역').length > 1);
  assert.equal(placeholderText([], '역'), '역');
});

// 그리기 명령을 기록해서 브라우저 없이 테마와 위치를 확인해요.
function recordingContext() {
  const calls = [];
  const ctx = {calls, measureText: text => ({width: text.length * 14, actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 3})};
  for (const method of ['save', 'restore', 'setTransform', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'closePath', 'fill', 'stroke', 'ellipse', 'arc', 'roundRect', 'rect', 'clip', 'fillText']) {
    ctx[method] = (...args) => calls.push({method, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, lineWidth: ctx.lineWidth});
  }
  return ctx;
}

function render({dark = false, now = 0, still = true, scale = 1} = {}) {
  const ctx = recordingContext();
  drawStationSigns(ctx, [{x: 100, y: 200, scale, size: 14,
    rows: signRows({text: '태릉입구', ln: '6호선|7호선', lc: '#CD7C2F|#747F00'})}], {dark, now, still});
  return ctx.calls;
}

test('양 테마에 흰 이름표와 먹색 환승 이름을 쓰고 번호 없이 노선 점만 그려요', () => {
  for (const dark of [false, true]) {
    const calls = render({dark});
    const fills = calls.filter(c => c.method === 'fill');
    assert.equal(fills[1].fill, '#ffffff');
    const text = calls.filter(c => c.method === 'fillText');
    assert.equal(text.length, 1);
    assert.equal(text[0].args[0], '태릉입구');
    assert.equal(text[0].fill, '#141414');
    assert.deepEqual(fills.slice(2).map(c => c.fill), ['#CD7C2F', '#747F00']);
    const strokes = calls.filter(c => c.method === 'stroke');
    assert.equal(strokes.length, 4);
    assert.ok(strokes.slice(2).every(c => c.stroke === (dark ? '#172229' : '#ffffff') && c.lineWidth === 1));
    const top = calls.find(c => c.method === 'roundRect').args[1];
    for (const c of calls.filter(c => c.method === 'arc')) {
      assert.equal(c.args[2], 4);
      assert.equal(top - SIGN.rim / 2 - (c.args[1] + c.args[2] + .5), 2);
    }
    const pill = calls.find(c => c.method === 'roundRect');
    assert.equal(pill.args[1] + pill.args[3], 200 - SIGN.gap);
    assert.deepEqual(strokes.slice(0, 2).map(c => c.stroke), ['#CD7C2F', '#747F00']);
    assert.equal(strokes[0].lineWidth, 1.75);
    assert.equal(calls.filter(c => c.method === 'lineTo').length, 0);
  }
});

test('둥둥 움직임은 이름표과 점을 같이 올리고 땅 그림자는 고정해요', () => {
  assert.deepEqual(render({now: 0}), render({now: SIGN.bobPeriod / 4}));
  const a = render({still: false}), b = render({still: false, now: SIGN.bobPeriod / 4});
  for (const method of ['roundRect', 'arc', 'fillText']) {
    const index = method === 'fillText' ? 2 : 1;
    assert.equal(a.find(c => c.method === method).args[index] - b.find(c => c.method === method).args[index], SIGN.bob);
  }
  assert.deepEqual(b.find(c => c.method === 'ellipse').args.slice(0, 2), [100, 200]);
  assert.ok(b.find(c => c.method === 'ellipse').args[2] < a.find(c => c.method === 'ellipse').args[2]);
});

test('작은 이름 크기와 새 충돌 영역이 점 줄과 이름표, 테두리와 틈을 예약해요', () => {
  assert.deepEqual([13, 16, 18].map(signTextSize), [10, 12.5, 14]);
  assert.equal(signTextSize(17), 13.25);
  assert.equal(perspectiveRatio(100, 100), 1);
  assert.equal(perspectiveRatio(100, 10), 4);
  const layout = signCollisionLayout();
  for (const [index, zoom] of [[4, 13], [6, 16], [8, 18]]) {
    assert.equal(-layout['text-offset'][index][1][1] * signTextSize(zoom), SIGN.gap + SIGN.padY * signTextSize(zoom));
  }
  assert.deepEqual(layout['icon-text-fit-padding'][8][1], [17.875, 7.875, 20.875, 7.875]);
});


test('노선 글자색은 흰 바탕 대비 4.5를 만족하고 원래 색상을 유지해요', () => {
  assert.equal(routeTextColor('#0052A4'), '#0052A4');
  assert.equal(routeTextColor('#141414'), '#141414');
  for (const color of ['#F5A200', '#FDA600', '#AD8605', '#00A84D', '#FFFFFF', '#EF7C1C', '#A17800']) {
    const result = routeTextColor(color);
    assert.ok(whiteContrast(result) >= 4.5, `${color}: ${result}`);
    assert.equal(routeTextColor(result), result);
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const original = rgb(color), adjusted = rgb(result);
    const max = Math.max(...original), factor = adjusted[original.indexOf(max)] / max;
    original.forEach((value, i) => assert.ok(Math.abs(adjusted[i] - value * factor) <= 1));
  }
  assert.equal(whiteContrast('#000000'), 21);
  assert.equal(whiteContrast('#ffffff'), 1);
});

test('단일 노선의 테두리는 원색이고 글자만 대비를 보정해요', () => {
  for (const dark of [false, true]) {
    const ctx = recordingContext();
    drawStationSigns(ctx, [{x: 100, y: 200, scale: 1, size: 10,
      rows: signRows({text: '수인분당', ln: '수인분당선', lc: '#F5A200'})}], {dark, still: true});
    assert.equal(ctx.calls.find(c => c.method === 'stroke').stroke, '#F5A200');
    assert.equal(ctx.calls.find(c => c.method === 'fillText').fill, routeTextColor('#F5A200'));
    assert.equal(ctx.calls.find(c => c.method === 'arc').args[2], 4);
  }
});

test('여백은 이름 크기에 비례하고 점의 크기는 유지해요', () => {
  for (const size of [10, 12.5, 14]) {
    const box = signDimensions(50, size, 2);
    assert.equal(box.width, 50 + size);
    assert.equal(box.height, size * (1 + 2 * SIGN.padY));
    assert.deepEqual(box.dots, dotLayout(2));
  }
});


test('테두리 구간은 같은 폭으로 나누고 인접한 픽셀 경계를 공유해요', () => {
  assert.deepEqual(borderSegments(100, 60, 2, 2), [{left: 69, right: 100}, {left: 100, right: 131}]);
  assert.deepEqual(borderSegments(100, 60, 3, 2), [{left: 69, right: 90}, {left: 90, right: 110}, {left: 110, right: 131}]);
  assert.deepEqual(borderSegments(100, 60, 0, 2), []);
  for (const dpr of [1, 1.25, 2, 3]) {
    const x = 100.17, width = 65.33, parts = borderSegments(x, width, 3, 1.75, dpr);
    assert.equal(parts[0].left, x - width / 2 - .875);
    assert.ok(Math.abs(parts[2].right - (x + width / 2 + .875)) < 1e-10);
    for (let i = 0; i < 2; i++) {
      assert.equal(parts[i].right, parts[i + 1].left);
      assert.ok(Math.abs(parts[i].right - (x - width / 2 + width * (i + 1) / 3)) <= .5 / dpr);
      assert.ok(Math.abs(parts[i].right * dpr - Math.round(parts[i].right * dpr)) < 1e-10);
    }
  }
});

test('세 노선 환승 테두리는 세로 clip으로 점과 같은 순서로 칠해요', () => {
  const ctx = recordingContext();
  const colors = ['#0052A4', '#EF7C1C', '#996CAC'];
  drawStationSigns(ctx, [{x: 100, y: 200, scale: 1, size: 14,
    rows: signRows({text: '종로3가', ln: '1호선|3호선|5호선', lc: colors.join('|')})}], {still: true});
  const strokes = ctx.calls.filter(c => c.method === 'stroke');
  assert.deepEqual(strokes.slice(0, 3).map(c => c.stroke), colors);
  assert.deepEqual(ctx.calls.filter(c => c.method === 'fill').slice(2).map(c => c.fill), colors);
  assert.equal(ctx.calls.find(c => c.method === 'fillText').fill, '#141414');
  const rects = ctx.calls.filter(c => c.method === 'rect');
  assert.equal(ctx.calls.filter(c => c.method === 'clip').length, 3);
  for (let i = 0; i < 2; i++) assert.equal(rects[i].args[0] + rects[i].args[2], rects[i + 1].args[0]);
  assert.ok(rects.every(c => c.args[1] === rects[0].args[1] && c.args[3] === rects[0].args[3]));
});


// 서울 부근 좌표로 바꿔 경도 보정까지 확인해요.
const anchorMeters = 6371008.8 * Math.PI / 180;
const toLngLat = ([x, y]) => [127 + x / (anchorMeters * Math.cos(37.5 * Math.PI / 180)), 37.5 + y / anchorMeters];
function assertAnchor(platforms, expected, tolerance = .002) {
  const actual = signAnchor(platforms.map(path => path.map(toLngLat))), target = toLngLat(expected);
  assert.ok(Math.abs(actual[0] - target[0]) * anchorMeters < tolerance, `경도: ${actual[0]} != ${target[0]}`);
  assert.ok(Math.abs(actual[1] - target[1]) * anchorMeters < tolerance, `위도: ${actual[1]} != ${target[1]}`);
}

test('단일 승강장은 직선과 휜 폴리라인 모두 호 길이 절반에 놓아요', () => {
  assertAnchor([[[0, 0], [100, 0]]], [50, 0]);
  assertAnchor([[[0, 0], [20, 0], [20, 80]]], [20, 30]);
  assertAnchor([[[20, 80], [20, 0], [0, 0]]], [20, 30]);
  assertAnchor([[[5, 7], [5, 7]]], [5, 7]);
  assertAnchor([[[5, 7]]], [5, 7]);
  assert.equal(signAnchor([]), null);
  assert.equal(signAnchor([[], [[NaN, 37]]]), null);
});

test('환승역은 노선별 가운데 평균 대신 실제 십자 교차점에 놓아요', () => {
  assertAnchor([[[0, 0], [200, 0]], [[30, -20], [30, 120]]], [30, 0]);
  assertAnchor([[[0, 0], [30, 0], [200, 0]], [[30, -20], [30, 0], [30, 120]]], [30, 0]);
  assertAnchor([[[0, 0], [100, 0]], [[20, -10], [20, 10]], [[80, -10], [80, 10]]], [50, 0]);
});

test('나란한 승강장은 붙어 있는 겹침 구간 가운데에 놓아요', () => {
  assertAnchor([[[0, 0], [200, 0]], [[60, 20], [120, 20]]], [90, 10]);
  assertAnchor([[[0, 0], [80, 0], [200, 0]], [[120, 20], [60, 20]]], [90, 10]);
  assertAnchor([[[0, 0], [200, 0]], [[60, 0], [120, 0]]], [90, 0]);
});

test('연장 교차가 없는 가까운 승강장은 최근접점 쌍의 가운데에 놓아요', () => {
  assertAnchor([[[0, 0], [100, 0]], [[120, 20], [220, 20]]], [110, 10]);
});

test('멀리 떨어진 승강장은 각 폴리라인 호 길이 가운데의 평균에 놓아요', () => {
  assertAnchor([[[0, 0], [20, 0], [20, 80]], [[500, 0], [600, 0]]], [285, 15]);
  assertAnchor([[[0, 0], [200, 0]], [[60, 100], [120, 100]]], [95, 50]);
});


test('rebuildLabels는 보이는 승강장 coords만 사용하고 픽셀 offset은 무시해요', t => {
  let data, selected = 'all';
  const raf = globalThis.requestAnimationFrame;   // 다시 그리기 예약만(node 에는 없다): 끝나면 되돌린다
  globalThis.requestAnimationFrame = () => 1;
  t.after(() => { globalThis.requestAnimationFrame = raf; });
  const labels = createStationLabels({
    stations: [{id: 1, name: '환승역', lines: [{name: '1호선'}, {name: '2호선'}]}],
    stationRects: new Map([
      ['1호선:1', {coords: [[0, 0], [200, 0]].map(toLngLat), offset: 12}],
      ['2호선:1', {coords: [[30, -20], [30, 120]].map(toLngLat), offset: -12}],
    ]),
    map: {getSource: () => ({setData: value => { data = value; }}), triggerRepaint() {}},
    colors: {'1호선': '#0052A4', '2호선': '#00A84D'}, getSelected: () => selected,
  });
  labels.rebuild();
  const near = (actual, expected) => expected.forEach((v, i) => assert.ok(Math.abs(actual[i] - v) < 1e-8));
  near(data.features[0].geometry.coordinates, toLngLat([30, 0]));
  selected = '1호선';
  labels.rebuild();
  near(data.features[0].geometry.coordinates, toLngLat([100, 0]));
  assert.equal(data.features[0].properties.ln, '1호선');
});


test('교차점 앞에서 끝나는 십자 승강장은 양 끝 연장 교차점에 놓아요', () => {
  assertAnchor([[[-200, 0], [-50, 0]], [[0, 60], [0, 180]]], [0, 0]);
  assertAnchor([[[-50, 0], [-200, 0]], [[0, 180], [0, 60]]], [0, 0]);
  assertAnchor([[[-200, 0], [-50, 0], [-50, 0]], [[0, 60], [0, 60], [0, 180]]], [0, 0]);
  // 연장선과 다른 승강장 자체의 교차도 허용해요.
  assertAnchor([[[-200, 0], [-50, 0]], [[0, -80], [0, 80]]], [0, 0]);
  // 여러 연장 교차점은 중복 없이 가운데에 놓아요.
  assertAnchor([[[-100, 0], [-50, 0]], [[0, 50], [0, 100]], [[60, 50], [60, 100]]], [30, 0]);
});

test('20도 미만으로 거의 평행한 쌍은 연장 교차 대신 기존 가까운 구간을 써요', () => {
  // 두 직선은 약 11.3도로 만나지만 실제 승강장은 떨어져 있어요.
  assertAnchor([[[0, 0], [100, 0]], [[0, 20], [100, 40]]], [0, 10]);
  assertAnchor([[[100, 0], [0, 0]], [[100, 40], [0, 20]]], [0, 10]);
});

test('끝에서 300m를 넘어야 만나는 교차점은 쓰지 않아요', () => {
  assertAnchor([[[-500, 0], [-310, 0]], [[0, 50], [0, 100]]], [-202.5, 37.5]);
  // 한쪽만 300m를 넘어도 연장 교차에서 제외해요.
  assertAnchor([[[-100, 0], [-50, 0]], [[0, 310], [0, 500]]], [-37.5, 202.5]);
});


test('줌 10에서 16으로 옮겨도 상봉 이름표는 새로 그릴 승강장 좌표와 같아요', t => {
  let zoom = 10, labelData;
  const r = platformRuntime(undefined, zoom, {map: {getZoom: () => zoom}}), source = r.source;
  const sources = {
    routes: {setData: () => {}}, stations: {setData: () => {}},
    'station-labels': {setData: data => {labelData = data;}},
  };
  Object.assign(r.context, {selected: 'all', stations: r.context.stations.filter(s => s.id === 135)});
  r.context.map.getSource = id => sources[id];
  r.context.map.triggerRepaint = () => {};
  const on = {};
  r.context.map.on = (event, fn) => {on[event] = fn;};
  r.context.labelsStale = false;
  const raf = globalThis.requestAnimationFrame;   // 다시 그리기 예약만(node 에는 없다): 끝나면 되돌린다
  globalThis.requestAnimationFrame = () => 1;
  t.after(() => { globalThis.requestAnimationFrame = raf; });
  const labels = createStationLabels({map: r.context.map, stations: r.context.stations, stationRects: r.rects, colors: r.context.colors, getSelected: () => 'all'});
  r.context.rebuildLabels = () => labels.rebuild();   // 본체의 줌 핸들러가 부르는 이름
  labels.rebuild();
  const old = [...labelData.features[0].geometry.coordinates];
  const initial = r.rects.get('경춘선:135').coords[0];
  assert.ok(Math.abs(localMeters(initial, [127.0856, 37.5965])[1] + 123) < 1);
  // 본체가 load 때 부르는 실제 등록 함수(web/map/layers.mjs): 줌 · 줌 끝 핸들러를 이 지도에 붙인다
  Object.assign(r.context.map, {addSource() {}, addLayer() {}, addImage() {}});
  registerTransitLayers({map: r.context.map, shapesReady: new Promise(() => {}), basicRouteCache: vm.runInContext('basicRouteCache', r.context),
    buildLineFeatures: () => vm.runInContext('buildLineFeatures()', r.context), buildStationFeatures: () => vm.runInContext('buildStationFeatures()', r.context),
    rebuildLabels: () => labels.rebuild(), stationNames: {id: 'station-names', type: 'custom'}, STATION_WIDTH_STOPS: vm.runInContext("typeof STATION_WIDTH_STOPS==='undefined'?[]:STATION_WIDTH_STOPS", r.context),
    PHONE: false, signCollisionLayout, live: {get track() { return r.context.modeCtl.settings().track; }}});
  zoom = 16; on.zoom(); on.zoomend();
  const rects = [...r.rects].filter(([key]) => key.endsWith(':135')).map(([, rect]) => rect.coords);
  assert.ok(localMeters(r.rects.get('경춘선:135').coords[0], [127.0856, 37.5965])[1] > 0);
  const expected = signAnchor(rects);
  assert.ok(Math.hypot(...localMeters(expected, old)) > 100);
  assert.deepEqual([...labelData.features[0].geometry.coordinates], expected);
});


test('이름표 이름에서 여러 괄호를 빼고 공백을 정리해요', () => {
  assert.equal(stationLabelName(' 신촌(경의중앙선) '), '신촌');
  assert.equal(stationLabelName('양평(경의중앙선)(별칭)'), '양평');
  assert.equal(stationLabelName(' 역 (별칭) 이름 (노선) '), '역 이름');
  assert.equal(stationLabelName('역(별칭(설명))'), '역');
  assert.equal(stationLabelName(' 강남 '), '강남');
  assert.equal(stationLabelName('(노선)(별칭)'), '(노선)(별칭)');
  assert.equal(stationLabelName(''), '');
});

test('괄호 제거는 이름표 데이터와 실제 글자, 충돌 글자에만 적용해요', () => {
  const props = {text: '신촌(경의중앙선)', ln: '경의중앙선', lc: '#77C4A3'};
  assert.equal(signRows(props).name, '신촌');
  assert.equal(props.text, '신촌(경의중앙선)');
  assert.equal(placeholderText(['경의중앙선'], props.text), '신촌');
  const ctx = recordingContext();
  drawStationSigns(ctx, [{x: 100, y: 200, scale: 1, size: 14, rows: {name: props.text, dots: [{color: props.lc}]}}], {still: true});
  assert.equal(ctx.calls.find(c => c.method === 'fillText').args[0], '신촌');
  assert.equal(ctx.calls.find(c => c.method === 'roundRect').args[2], 2 * 14 + 14);
});
