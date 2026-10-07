// 역 이름표(기둥 표지판): 지도의 station-labels 심볼 레이어가 투명한 채로 자리를 잡고(겹침 · 우선순위 · 줌 규칙),
// 놓인 이름표만 이 모듈이 열차 · 고가 · 출구 기둥 위 2D 캔버스에 그려요. 치수는 자리잡이 그림(station-sign)과 같아요.

export const SIGN_FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
export const SIGN = {padX: 12, padY: 7, stem: 11, dot: 2.6, radius: 8, rim: 1.7, lineScale: .78, lineHeight: 1.2};
const THEMES = {
  light: {fill: '#ffffff', rim: '#141414', post: '#3a4043', ink: '#141414'},
  dark: {fill: '#1f2b33', rim: '#8fa3aa', post: '#7d8d93', ink: '#eef3f4'},
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

// 판에 쓸 줄: 위는 노선 이름(노선색), 아래는 역 이름. 첫 이름표는 16 미만에서 그 역의 모든 노선, 16부터는 제 승강장 노선만
export function signRows(p, zoom) {
  const lines = Number(p.primary) && zoom < 16
    ? [0, 1, 2, 3].map(k => ({text: String(p[`l${k}`] || '').trim(), color: p[`c${k}`]})).filter(l => l.text)
    : p.m0 ? [{text: String(p.m0), color: p.mc}] : [];
  return {lines, name: String(p.text || '')};
}

// signs: [{x, y, scale, size, rows}] — 기둥 끝(x, y)이 승강장 가운데. 뒤에 올수록 위에 그려요
export function drawStationSigns(ctx, signs, {dpr = 1, dark = false, alpha = 1} = {}) {
  const T = THEMES[dark ? 'dark' : 'light'];
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const {x, y, scale: s, size, rows} of signs) {
    const S = size * s, small = S * SIGN.lineScale;
    ctx.font = `700 ${small}px ${SIGN_FONT}`;
    const gap = ctx.measureText(' ').width, widths = rows.lines.map(l => ctx.measureText(l.text).width);
    const lineW = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, widths.length - 1);
    ctx.font = `700 ${S}px ${SIGN_FONT}`;
    const nameW = ctx.measureText(rows.name).width;
    const rowLine = rows.lines.length ? small * SIGN.lineHeight : 0, rowName = S * SIGN.lineHeight;
    const w = Math.max(lineW, nameW) + 2 * SIGN.padX * s, h = rowLine + rowName + 2 * SIGN.padY * s;
    const bottom = y - SIGN.stem * s, top = bottom - h, left = x - w / 2;
    // 기둥 + 끝점(승강장 가운데)
    ctx.fillStyle = T.post;
    ctx.fillRect(x - 1.5 * s, bottom - 2 * s, 3 * s, SIGN.stem * s + 2 * s);
    ctx.beginPath(); ctx.arc(x, y, SIGN.dot * s, 0, Math.PI * 2); ctx.fill();
    // 판: 먹색 테두리 안에 흰 판(다크는 어두운 판)
    ctx.fillStyle = T.rim;
    ctx.beginPath(); ctx.roundRect(left, top, w, h, SIGN.radius * s); ctx.fill();
    const r = SIGN.rim * s;
    ctx.fillStyle = T.fill;
    ctx.beginPath(); ctx.roundRect(left + r, top + r, w - 2 * r, h - 2 * r, Math.max(0, (SIGN.radius - SIGN.rim) * s)); ctx.fill();
    if (rows.lines.length) {
      ctx.font = `700 ${small}px ${SIGN_FONT}`;
      let cx = x - lineW / 2;
      const cy = top + SIGN.padY * s + rowLine / 2;
      rows.lines.forEach((l, i) => { ctx.fillStyle = l.color || '#52646a'; ctx.fillText(l.text, cx, cy); cx += widths[i] + gap; });
    }
    ctx.font = `700 ${S}px ${SIGN_FONT}`;
    ctx.fillStyle = T.ink;
    ctx.fillText(rows.name, x - nameW / 2, top + SIGN.padY * s + rowLine + rowName / 2);
  }
  ctx.restore();
}
