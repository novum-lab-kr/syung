import test from 'node:test';
import assert from 'node:assert/strict';
import {lineChip, sortLines, signRows, placeholderText, chipInk, perspectiveRatio, drawStationSigns, signCollisionLayout, SIGN, signTextSize, signNameBaseline, signNameRise} from '../web/lib/station_signs.mjs';

test('환승역 이름표 하나: 번호 노선은 번호만, 번호 순서대로 먼저', () => {
  assert.deepEqual(sortLines(['7호선', '6호선']), ['6호선', '7호선']);
  assert.deepEqual(sortLines(['4호선', '공항철도', 'GTX-A', '1호선', '경의중앙선']), ['1호선', '4호선', '공항철도', 'GTX-A', '경의중앙선']);
  assert.deepEqual(['6호선', '인천1호선', '신분당선', '공항철도', 'GTX-A', '김포골드라인'].map(lineChip), ['6', '인천1', '신분당', '공항', 'GTX-A', '김포골드']);
  const rows = signRows({text: '태릉입구', ln: '6호선|7호선', lc: '#CD7C2F|#747F00'});
  assert.deepEqual(rows, {chips: [{text: '6', color: '#CD7C2F'}, {text: '7', color: '#747F00'}], name: '태릉입구'});
  assert.equal(placeholderText(['6호선', '7호선'], '태릉입구'), '태릉입구\n 6  7 ');
});

test('칩 글자색 · 원근 비율은 출구 번호 · MapLibre 심볼과 같은 기준', () => {
  assert.equal(chipInk('#00A84D'), '#ffffff');
  assert.equal(chipInk('#FFD400'), '#141414');
  assert.equal(perspectiveRatio(100, 100), 1);
  assert.equal(perspectiveRatio(100, 10), 4);
});

// 브라우저 없이 그리기 명령과 위치를 확인해요.
function recordingContext() {
  const calls = [];
  const ctx = {calls, measureText: text => ({width: text.length * 10})};
  for (const method of ['save', 'restore', 'setTransform', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'bezierCurveTo', 'closePath', 'fill', 'stroke', 'ellipse', 'roundRect', 'fillText', 'strokeText']) {
    ctx[method] = (...args) => calls.push({method, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle});
  }
  return ctx;
}

test('핀은 노선색을 보존하고 환승 칩과 이름 할로를 양 테마에 그려요', () => {
  for (const dark of [false, true]) for (const ln of ['2호선', '2호선|신분당선']) {
    const ctx = recordingContext();
    const rows = signRows({text: '강남', ln, lc: '#00A84D|#D4003B'});
    drawStationSigns(ctx, [{x: 100, y: 200, scale: 1, size: 17, rows}], {dark, still: true});
    assert.equal(ctx.calls.filter(c => c.method === 'roundRect').length, rows.chips.length === 1 ? 0 : 2);
    const name = ctx.calls.find(c => c.method === 'strokeText');
    assert.equal(name.args[0], '강남');
    assert.equal(name.stroke, dark ? '#172229' : '#ffffff');
    assert.ok(name.args[2] < ctx.calls.find(c => c.method === 'fillText').args[2]);
    if (rows.chips.length === 1) assert.ok(ctx.calls.some(c => c.method === 'fill' && c.fill === '#00A84D'));
    assert.equal(ctx.calls.filter(c => c.method === 'bezierCurveTo').length, rows.chips.length === 1 ? 4 : 2);
    if (rows.chips.length > 1) {
      assert.ok(ctx.calls.some(c => c.method === 'fill' && c.fill === (dark ? '#26343c' : '#141414')));
      assert.equal(ctx.calls.filter(c => c.method === 'arcTo').length, 4);
      assert.equal(ctx.calls.filter(c => c.method === 'stroke' && c.stroke === '#ffffff').length, dark ? 2 : 3);
    }
  }
});

test('움직임 줄이기는 핀과 땅 그림자를 고정하고 일반 모드는 천천히 떠요', () => {
  const render = (now, still) => {
    const ctx = recordingContext();
    drawStationSigns(ctx, [{x: 100, y: 200, scale: 1, size: 17, rows: signRows({text: '역', ln: '6호선', lc: '#CD7C2F'})}], {now, still});
    return ctx.calls;
  };
  assert.deepEqual(render(0, true), render(SIGN.bobPeriod / 4, true));
  const a = render(0, false), b = render(SIGN.bobPeriod / 4, false);
  assert.equal(a.find(c => c.method === 'moveTo').args[1] - b.find(c => c.method === 'moveTo').args[1], SIGN.bob);
  assert.deepEqual(a.find(c => c.method === 'ellipse').args.slice(0, 2), [100, 200]);
  assert.ok(b.find(c => c.method === 'ellipse').args[2] < a.find(c => c.method === 'ellipse').args[2]);
});

test('충돌 영역은 이름 위줄과 핀 아래줄, 끝과 떠 있는 틈을 예약해요', () => {
  const layout = signCollisionLayout();
  assert.equal(layout['text-line-height'][6], signNameRise(17));
  assert.equal(layout['text-max-width'], 100);
  for (const [index, zoom] of [[4, 13], [6, 16], [8, 18]]) {
    const size = signTextSize(zoom), offset = layout['text-offset'][index][1][1];
    assert.equal(-offset * size, SIGN.gap + SIGN.tail + (SIGN.head - 1) * size / 2);
  }
  assert.ok(layout['icon-text-fit-padding'][2] >= SIGN.gap + SIGN.tail + SIGN.bob);
  assert.equal(placeholderText([], '역'), '역\n ');
});


test('이름 잉크와 할로 아래 끝은 머리 테두리에서 2.5px 떨어져요', () => {
  for (const scale of [.7, 1, 2]) for (const descent of [0, 2, 5]) {
    const top = 100, baseline = signNameBaseline(top, descent, scale);
    const nameBottom = baseline + descent + SIGN.halo * scale;
    assert.ok(Math.abs(top - SIGN.rim / 2 * scale - nameBottom - SIGN.nameGap * scale) < 1e-10);
  }
});
