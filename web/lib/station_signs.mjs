// 작은 역 이름 이름표 위에 노선색 점을 놓고, 놓인 표지만 캔버스에 그려요.
export const SIGN_FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
// px 치수는 원근 비율을 곱해요. 이름표 아래의 떠 있는 틈은 유지해요.
export const SIGN = {gap: 14, padX: .5, padY: 4 / 14, rim: 1.75, dot: 8, dotGap: 3, dotRise: 2, dotRim: 1, bob: 2, bobPeriod: 3200};
const THEMES = {
  light: {fill: '#ffffff', dotRim: '#ffffff', shadow: 'rgba(0,0,0,.28)'},
  dark: {fill: '#ffffff', dotRim: '#172229', shadow: 'rgba(0,0,0,.45)'},
};

// 이름 크기는 자리잡이 레이어와 같은 줌 보간을 써요.
export function signTextSize(zoom) {
  return interpolateSize(zoom, [[13, 10], [16, 12.5], [18, 14]]);
}

function interpolateSize(zoom, S) {
  if (zoom <= S[0][0]) return S[0][1];
  for (let i = 1; i < S.length; i++) if (zoom <= S[i][0]) {
    const [z0, s0] = S[i - 1], [z1, s1] = S[i];
    return s0 + (s1 - s0) * (zoom - z0) / (z1 - z0);
  }
  return S[S.length - 1][1];
}

// 기울인 화면에서 MapLibre 가 화면 정렬 글자에 곱하는 원근 비율이에요.
export function perspectiveRatio(centerW, anchorW) {
  return Math.min(4, Math.max(0, .5 + .5 * centerW / anchorW));
}

// 한 글자 약자로 구분하고, 인천 두 노선만 두 글자를 써요.
const LINE_CHIPS = {'GTX-A': 'A', '경의중앙선': '경', '경강선': '강', '경춘선': '춘', '공항철도': '공', '김포골드라인': '김', '서해선': '서', '수인분당선': '수', '신분당선': '신', '신림선': '림', '에버라인선': '에', '우이신설선': '우', '의정부선': '의', '인천1호선': '인1', '인천2호선': '인2'};
export function lineChip(name) {
  const s = String(name || '');
  return s.match(/^([1-9])호선$/)?.[1] || LINE_CHIPS[s] || Array.from(s)[0] || '';
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

// 흰 바탕 대비는 sRGB 상대 휘도로 계산해요.
export function whiteContrast(hex) {
  const linear = i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  };
  return 1.05 / (.2126 * linear(1) + .7152 * linear(3) + .0722 * linear(5) + .05);
}

// RGB를 같은 비율로 낮춰 색상을 유지하고, 반올림 뒤에도 대비 4.5 이상을 보장해요.
export function routeTextColor(hex) {
  const color = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#52646a';
  if (whiteContrast(color) >= 4.5) return color;
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const shade = factor => '#' + rgb.map(c => Math.floor(c * factor).toString(16).padStart(2, '0')).join('');
  let low = 0, high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (whiteContrast(shade(mid)) >= 4.5) low = mid; else high = mid;
  }
  return shade(low);
}

// 점의 테두리를 포함한 전체 폭과 중심 위치를 계산해요.
export function dotLayout(count, scale = 1) {
  const diameter = (SIGN.dot + SIGN.dotRim) * scale;
  const step = (SIGN.dot + SIGN.dotRim + SIGN.dotGap) * scale;
  return {width: count ? diameter + (count - 1) * step : 0,
    centers: Array.from({length: count}, (_, i) => (i - (count - 1) / 2) * step)};
}

export function signDimensions(nameWidth, size, count, scale = 1) {
  const height = size * scale + 2 * SIGN.padY * size * scale;
  const width = Math.max(height, nameWidth + 2 * SIGN.padX * size * scale);
  const dots = dotLayout(count, scale);
  return {width, height, dots, boundsWidth: Math.max(width + SIGN.rim * scale, dots.width),
    above: count ? (SIGN.dot + SIGN.dotRim + SIGN.dotRise + SIGN.rim / 2) * scale : 0};
}

// 세로 경계를 기기 픽셀에 맞추고 공유해서 구간 사이 틈과 겹침을 막아요.
export function borderSegments(x, width, count, rim, dpr = 1) {
  const left = x - width / 2;
  const edges = Array.from({length: count + 1}, (_, i) => i === 0 ? left - rim / 2
    : i === count ? left + width + rim / 2 : Math.round((left + width * i / count) * dpr) / dpr);
  return Array.from({length: count}, (_, i) => ({left: edges[i], right: edges[i + 1]}));
}

// 짧은 이름에서도 점 줄이 충돌 영역 밖으로 나가지 않게 빈칸으로 폭을 확보해요.
export function placeholderText(lines, name) {
  const extra = Math.max(0, dotLayout(lines.length).width - Array.from(name).length * 10 - 2 * SIGN.padX * 10);
  const pad = ' '.repeat(Math.ceil(extra / 10));
  return pad + name + pad;
}

// 치수는 SIGN 과 맞춰요. 점 줄부터 이름표와 떠 있는 틈까지 예약해요.
export function signCollisionLayout() {
  const offset = size => [0, -(SIGN.gap + SIGN.padY * size) / size];
  const padding = size => [SIGN.padY * size + SIGN.rim / 2 + SIGN.dot + SIGN.dotRim + SIGN.dotRise + SIGN.bob,
    SIGN.padX * size + SIGN.rim / 2, SIGN.padY * size + SIGN.rim / 2 + SIGN.gap + SIGN.bob, SIGN.padX * size + SIGN.rim / 2];
  return {
    'text-anchor': 'bottom', 'text-max-width': 100,
    'text-offset': ['interpolate', ['linear'], ['zoom'], 13, ['literal', offset(10)], 16, ['literal', offset(12.5)], 18, ['literal', offset(14)]],
    'text-padding': SIGN.bob,
    'icon-image': 'station-sign', 'icon-text-fit': 'both',
    'icon-text-fit-padding': ['interpolate', ['linear'], ['zoom'], 13, ['literal', padding(10)], 16, ['literal', padding(12.5)], 18, ['literal', padding(14)]],
  };
}

// 노선색 순서는 자리잡이 데이터의 ln · lc 순서를 그대로 써요.
export function signRows(p) {
  const names = String(p.ln || '').split('|').filter(Boolean), cols = String(p.lc || '').split('|');
  return {dots: names.map((_, i) => ({color: cols[i] || '#52646a'})), name: String(p.text || '')};
}

// 꼬리 없이 양끝이 완전히 둥근 알약만 그려요.
function bubblePath(ctx, x, top, w, h) {
  ctx.beginPath(); ctx.roundRect(x - w / 2, top, w, h, h / 2);
}

// (x, y)는 승강장 가운데이며, 뒤에 오는 표지를 위에 그려요.
export function drawStationSigns(ctx, signs, {dpr = 1, dark = false, alpha = 1, now = 0, still = false} = {}) {
  const T = THEMES[dark ? 'dark' : 'light'];
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = alpha;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const {x, y, scale: s, size, rows, phase = 0} of signs) {
    const S = size * s;
    ctx.font = `700 ${S}px ${SIGN_FONT}`;
    const metrics = ctx.measureText(rows.name), box = signDimensions(metrics.width, size, rows.dots.length, s);
    const lift = still ? 0 : Math.sin(now / SIGN.bobPeriod * Math.PI * 2 + phase) * SIGN.bob * s;
    const top = y - SIGN.gap * s - box.height - lift;
    const k = 1 - lift / (SIGN.gap * s) * .25;
    ctx.fillStyle = T.shadow; ctx.globalAlpha = alpha * k;
    ctx.beginPath(); ctx.ellipse(x, y, Math.min(box.width * .32, 18 * s) * k, 3.2 * s * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha; ctx.fillStyle = T.fill;
    bubblePath(ctx, x, top, box.width, box.height); ctx.fill();
    const color = rows.dots.length === 1 ? rows.dots[0].color : '#141414';
    ctx.lineWidth = SIGN.rim * s;
    if (rows.dots.length > 1) {
      const segments = borderSegments(x, box.width, rows.dots.length, ctx.lineWidth, dpr);
      segments.forEach(({left, right}, i) => {
        ctx.save(); ctx.beginPath();
        ctx.rect(left, top - SIGN.rim * s, right - left, box.height + 2 * SIGN.rim * s); ctx.clip();
        ctx.strokeStyle = rows.dots[i].color;
        bubblePath(ctx, x, top, box.width, box.height); ctx.stroke(); ctx.restore();
      });
    } else {
      ctx.strokeStyle = color; ctx.stroke();
    }
    const ascent = metrics.actualBoundingBoxAscent ?? S * .8, descent = metrics.actualBoundingBoxDescent ?? S * .2;
    ctx.fillStyle = routeTextColor(color);
    ctx.fillText(rows.name, x, top + box.height / 2 + (ascent - descent) / 2);
    const dotY = top - (SIGN.rim / 2 + SIGN.dotRise) * s - (SIGN.dot + SIGN.dotRim) * s / 2;
    rows.dots.forEach((dot, i) => {
      ctx.fillStyle = dot.color; ctx.strokeStyle = T.dotRim; ctx.lineWidth = SIGN.dotRim * s;
      ctx.beginPath(); ctx.arc(x + box.dots.centers[i], dotY, SIGN.dot * s / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
  }
  ctx.restore();
}
