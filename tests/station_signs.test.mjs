import test from 'node:test';
import assert from 'node:assert/strict';
import {lineChip, sortLines, signRows, placeholderText, perspectiveRatio, drawStationSigns, signCollisionLayout, SIGN, signTextSize, dotLayout, signDimensions} from '../web/lib/station_signs.mjs';

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

test('말풍선은 이름에 좌우 7px 상하 4px 여백을 더하고 점 줄의 영역도 확보해요', () => {
  const box = signDimensions(56, 14, 3);
  assert.equal(box.width, 70);
  assert.equal(box.height, 22);
  assert.equal(box.above, 11);
  assert.equal(signDimensions(12, 12, 9).boundsWidth, dotLayout(9).width);
  assert.equal(signDimensions(0, 12, 0).width, 20);
  assert.equal(placeholderText(['6호선', '7호선'], '태릉입구'), '태릉입구');
  assert.ok(placeholderText(Array(9).fill('1호선'), '역').length > 1);
  assert.equal(placeholderText([], '역'), '역');
});

// 그리기 명령을 기록해서 브라우저 없이 테마와 위치를 확인해요.
function recordingContext() {
  const calls = [];
  const ctx = {calls, measureText: text => ({width: text.length * 14, actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 3})};
  for (const method of ['save', 'restore', 'setTransform', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'closePath', 'fill', 'stroke', 'ellipse', 'arc', 'fillText']) {
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

test('테마별 말풍선과 이름 색이 반전되고 번호 없이 노선 점만 그려요', () => {
  for (const dark of [false, true]) {
    const calls = render({dark});
    const fills = calls.filter(c => c.method === 'fill');
    assert.equal(fills[1].fill, dark ? '#eef3f4' : '#141414');
    const text = calls.filter(c => c.method === 'fillText');
    assert.equal(text.length, 1);
    assert.equal(text[0].args[0], '태릉입구');
    assert.equal(text[0].fill, dark ? '#141414' : '#ffffff');
    assert.deepEqual(fills.slice(2).map(c => c.fill), ['#CD7C2F', '#747F00']);
    const strokes = calls.filter(c => c.method === 'stroke');
    assert.equal(strokes.length, 2);
    assert.ok(strokes.every(c => c.stroke === (dark ? '#172229' : '#ffffff') && c.lineWidth === 1));
    const top = calls.find(c => c.method === 'moveTo').args[1];
    for (const c of calls.filter(c => c.method === 'arc')) {
      assert.equal(c.args[2], 4);
      assert.equal(top - (c.args[1] + c.args[2] + .5), 2);
    }
    assert.ok(calls.some(c => c.method === 'lineTo' && c.args[0] === 100 && c.args[1] === 186));
  }
});

test('둥둥 움직임은 말풍선과 점을 같이 올리고 땅 그림자는 고정해요', () => {
  assert.deepEqual(render({now: 0}), render({now: SIGN.bobPeriod / 4}));
  const a = render({still: false}), b = render({still: false, now: SIGN.bobPeriod / 4});
  for (const method of ['moveTo', 'arc', 'fillText']) {
    const index = method === 'fillText' ? 2 : 1;
    assert.equal(a.find(c => c.method === method).args[index] - b.find(c => c.method === method).args[index], SIGN.bob);
  }
  assert.deepEqual(b.find(c => c.method === 'ellipse').args.slice(0, 2), [100, 200]);
  assert.ok(b.find(c => c.method === 'ellipse').args[2] < a.find(c => c.method === 'ellipse').args[2]);
});

test('작은 이름 크기와 새 충돌 영역이 점 줄과 말풍선, 꼬리와 틈을 예약해요', () => {
  assert.deepEqual([13, 16, 18].map(signTextSize), [12, 14, 15]);
  assert.equal(signTextSize(17), 14.5);
  assert.equal(perspectiveRatio(100, 100), 1);
  assert.equal(perspectiveRatio(100, 10), 4);
  const layout = signCollisionLayout();
  for (const [index, zoom] of [[4, 13], [6, 16], [8, 18]]) {
    assert.equal(-layout['text-offset'][index][1][1] * signTextSize(zoom), SIGN.gap + SIGN.tail + SIGN.padY);
  }
  assert.deepEqual(layout['icon-text-fit-padding'], [17, 7, 26, 7]);
});
