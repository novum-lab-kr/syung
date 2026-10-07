// 역 위치 핀: 투명한 station-labels 레이어가 자리를 잡고, 캔버스가 놓인 표지만 그려요.
// 노선색 머리와 뾰족한 끝, 위쪽 역 이름, 땅 그림자가 한 표지로 천천히 떠 있어요.

export const SIGN_FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
// px 치수는 원근 비율을 곱하고, 머리와 글자는 줌별 글자 크기에 맞춰요.
export const SIGN = {gap: 14, tail: 10, head: 1.65, chip: 1.12, chipFont: .65, chipGap: 3, padX: 5, rim: 1.2, nameGap: 2.5, chipRim: .7, halo: 3, bob: 2, bobPeriod: 3200};
const THEMES = {
  light: {fill: '#141414', rim: '#ffffff', ink: '#141414', halo: '#ffffff', shadow: 'rgba(0,0,0,.28)'},
  dark: {fill: '#26343c', rim: '#b4c3c9', ink: '#eef3f4', halo: '#172229', shadow: 'rgba(0,0,0,.45)'},
};

// 글자 크기: 지도 레이어의 text-size 와 같은 줌 보간(13 → 14, 16 → 17, 18 → 19)
export function signTextSize(zoom) {
  const S = [[13, 14], [16, 17], [18, 19]];
  if (zoom <= S[0][0]) return S[0][1];
  for (let i = 1; i < S.length; i++) if (zoom <= S[i][0]) {
    const [z0, s0] = S[i - 1], [z1, s1] = S[i];
    return s0 + (s1 - s0) * (zoom - z0) / (z1 - z0);
  }
  return S[S.length - 1][1];
}

// 기울인 화면에서 MapLibre 가 화면 정렬 글자에 곱하는 원근 비율(symbol 셰이더와 같은 식)
export function perspectiveRatio(centerW, anchorW) {
  return Math.min(4, Math.max(0, .5 + .5 * centerW / anchorW));
}

// 칩에 쓸 짧은 노선 이름: 6호선 → 6, 인천1호선 → 인천1, 신분당선 → 신분당, 공항철도 → 공항, GTX-A 그대로
export function lineChip(name) {
  const s = String(name || '');
  const n = s.match(/^(\d+)호선$/);
  if (n) return n[1];
  return s.replace(/호선$/, '').replace(/(경전철|철도|라인|선)$/, '') || s;
}

// 둥근 머리에서 승강장을 향한 끝으로 부드럽게 좁아져요.
function pinPath(ctx, x, top, w, h, tail) {
  const r = w / 2, cy = top + h / 2, tip = top + h + tail;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.bezierCurveTo(x + r * 1.33, top, x + r * 1.33, cy + h * .2, x + r * .62, top + h * .83);
  ctx.bezierCurveTo(x + r * .32, top + h, x + r * .13, tip - tail * .25, x, tip);
  ctx.bezierCurveTo(x - r * .13, tip - tail * .25, x - r * .32, top + h, x - r * .62, top + h * .83);
  ctx.bezierCurveTo(x - r * 1.33, cy + h * .2, x - r * 1.33, top, x, top);
  ctx.closePath();
}

// 환승 머리는 양끝이 완전히 둥근 캡슐이고, 아래 중앙에만 꼬리를 붙여요.
function transferPinPath(ctx, x, top, w, h, tail) {
  const left = x - w / 2, right = x + w / 2, bottom = top + h, r = h / 2;
  const neck = r * .62, tip = bottom + tail;
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(right - r, top);
  ctx.arcTo(right, top, right, top + r, r);
  ctx.arcTo(right, bottom, right - r, bottom, r);
  ctx.lineTo(x + neck, bottom);
  ctx.bezierCurveTo(x + r * .32, bottom, x + r * .13, tip - tail * .25, x, tip);
  ctx.bezierCurveTo(x - r * .13, tip - tail * .25, x - r * .32, bottom, x - neck, bottom);
  ctx.lineTo(left + r, bottom);
  ctx.arcTo(left, bottom, left, top + r, r);
  ctx.arcTo(left, top, left + r, top, r);
  ctx.closePath();
}

// 이름의 실제 잉크와 할로 아래 끝을 머리 테두리에서 2.5px 띄워요.
export function signNameBaseline(top, descent, scale = 1) {
  return top - (SIGN.rim / 2 + SIGN.nameGap + SIGN.halo) * scale - descent;
}

export function signNameRise(size) {
  return (SIGN.head + 1) / 2 + (SIGN.rim / 2 + SIGN.nameGap + SIGN.halo) / size;
}

// 칩 순서: 번호 노선(1, 2, …)을 번호대로 먼저, 나머지는 원래 순서
export function sortLines(names) {
  const num = n => { const m = String(n).match(/^(\d+)호선$/); return m ? +m[1] : Infinity; };
  return names.map((n, i) => [n, i]).sort((a, b) => num(a[0]) - num(b[0]) || a[1] - b[1]).map(([n]) => n);
}

// 밝은 노선색 위에는 검은 글자(출구 번호와 같은 기준)
export function chipInk(hex) {
  const h = String(hex || '#52646a'), r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
  return .299 * r + .587 * g + .114 * b > .62 ? '#141414' : '#ffffff';
}

// 이름 위줄 + 핀 안 노선 아래줄: 글자 폭에 머리 여백을 더해 충돌 영역을 잡아요.
export function placeholderText(lines, name) {
  return `${name}\n${lines.length ? lines.map(l => ` ${lineChip(l)} `).join('') : ' '}`;
}

// 치수는 SIGN 과 맞춰요. 떠 있는 틈과 뾰족한 끝까지 투명 아이콘이 예약해요.
export function signCollisionLayout() {
  const offset = size => [0, -(SIGN.gap + SIGN.tail + (SIGN.head - 1) * size / 2) / size];
  return {
    'text-anchor': 'bottom', 'text-line-height': ['interpolate', ['linear'], ['zoom'], 13, signNameRise(14), 16, signNameRise(17), 18, signNameRise(19)], 'text-max-width': 100,
    'text-offset': ['interpolate', ['linear'], ['zoom'], 13, ['literal', offset(14)], 16, ['literal', offset(17)], 18, ['literal', offset(19)]],
    'text-padding': SIGN.halo + SIGN.bob,
    'icon-image': 'station-sign', 'icon-text-fit': 'both',
    'icon-text-fit-padding': [SIGN.halo + SIGN.bob, SIGN.padX + SIGN.rim, SIGN.gap + SIGN.tail + 8 + SIGN.bob, SIGN.padX + SIGN.rim],
  };
}

// 핀에 쓸 것: 노선 칩들(속성 ln · lc 는 '|' 로 이은 노선 이름 · 색)과 역 이름
export function signRows(p) {
  const names = String(p.ln || '').split('|').filter(Boolean), cols = String(p.lc || '').split('|');
  return {chips: names.map((n, i) => ({text: lineChip(n), color: cols[i] || '#52646a'})), name: String(p.text || '')};
}

// signs: [{x, y, scale, size, rows, phase}] — (x, y) 는 승강장 가운데(그림자 자리). 뒤에 올수록 위에 그려요
export function drawStationSigns(ctx, signs, {dpr = 1, dark = false, alpha = 1, now = 0, still = false} = {}) {
  const T = THEMES[dark ? 'dark' : 'light'];
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (const {x, y, scale: s, size, rows, phase = 0} of signs) {
    const S = size * s, headH = S * SIGN.head, chipH = S * SIGN.chip, chipF = S * SIGN.chipFont;
    ctx.font = `800 ${chipF}px ${SIGN_FONT}`;
    const chipW = rows.chips.map(c => Math.max(chipH, ctx.measureText(c.text).width + 8 * s));
    const chipsW = chipW.reduce((a, w) => a + w, 0) + SIGN.chipGap * s * Math.max(0, chipW.length - 1);
    const w = Math.max(headH, chipsW + (rows.chips.length > 1 ? 2 * SIGN.padX * s : 4 * s));
    const lift = still ? 0 : Math.sin(now / SIGN.bobPeriod * Math.PI * 2 + phase) * SIGN.bob * s;
    const top = y - SIGN.gap * s - SIGN.tail * s - headH - lift, cy = top + headH / 2;
    const k = 1 - lift / (SIGN.gap * s) * .25;
    ctx.fillStyle = T.shadow;
    ctx.globalAlpha = alpha * k;
    ctx.beginPath(); ctx.ellipse(x, y, Math.min(w * .32, 18 * s) * k, 3.2 * s * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
    // 단일 노선은 머리 전체에 노선색, 환승역은 중립 머리 안에 노선색 칩을 넣어요.
    const single = rows.chips.length === 1;
    ctx.fillStyle = single ? rows.chips[0].color : T.fill;
    ctx.strokeStyle = T.rim; ctx.lineWidth = SIGN.rim * s; ctx.lineJoin = 'round';
    (single ? pinPath : transferPinPath)(ctx, x, top, w, headH, SIGN.tail * s); ctx.fill(); ctx.stroke();
    let cx = x - chipsW / 2;
    ctx.font = `800 ${chipF}px ${SIGN_FONT}`;
    rows.chips.forEach((c, i) => {
      if (!single) {
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.roundRect(cx, cy - chipH / 2, chipW[i], chipH, chipH / 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = SIGN.chipRim * s; ctx.stroke();
      }
      ctx.fillStyle = chipInk(c.color);
      ctx.fillText(c.text, cx + chipW[i] / 2, cy);
      cx += chipW[i] + SIGN.chipGap * s;
    });
    // 박스 없이 이름만 할로로 지도와 분리해요.
    ctx.font = `700 ${S}px ${SIGN_FONT}`;
    ctx.strokeStyle = T.halo; ctx.lineWidth = SIGN.halo * s * 2;
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(rows.name);
    const baseline = signNameBaseline(top, metrics.actualBoundingBoxDescent ?? S * .12, s);
    ctx.strokeText(rows.name, x, baseline);
    ctx.fillStyle = T.ink;
    ctx.fillText(rows.name, x, baseline);
    ctx.textBaseline = 'middle';
  }
  ctx.restore();
}
