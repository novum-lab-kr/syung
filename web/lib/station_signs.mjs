// 역 이름표(떠 있는 팻말): 지도의 station-labels 심볼 레이어가 투명한 채로 자리를 잡고(겹침 · 우선순위 · 줌 규칙),
// 놓인 이름표만 이 모듈이 열차 · 고가 · 출구 기둥 위 2D 캔버스에 그려요. 역마다 하나: [6][7] 태릉입구.
// 모양은 출구 기둥 · 버스 표지판과 한 식구예요: 노선색 칩에 흰 번호(출구 번호처럼), 흰 판에 먹색 테두리(버스 원판처럼),
// 판 아래 회색 두께(출구 기둥 아랫부분처럼), 땅에 옅은 그림자(출구 그림자처럼).

export const SIGN_FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
// px(글자 크기 비율이 아닌 것은 원근 비율 s 를 곱해요): gap = 판 아래 → 승강장(떠 있는 높이), slab = 회색 두께,
// tail = 판 아래 뾰족한 꼬리(지도 핀처럼 승강장을 가리켜요)
export const SIGN = {padX: 6, padY: 5, gap: 14, slab: 3, radius: 6, rim: 1.6, tail: 6, tailW: 7, chip: 1.12, chipGap: 3, nameGap: 6, bob: 2, bobPeriod: 3200};
const THEMES = {
  // 회색 두께는 출구 기둥 아래 회색(PILLAR_STYLE.grey)과 같은 값
  light: {fill: '#ffffff', rim: '#141414', slab: '#666b70', ink: '#141414', shadow: 'rgba(0,0,0,.28)'},
  dark: {fill: '#1f2b33', rim: '#8fa3aa', slab: '#8f979e', ink: '#eef3f4', shadow: 'rgba(0,0,0,.45)'},
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

// 판 + 아래 가운데 뾰족한 꼬리를 한 길로(지도 핀처럼)
function pinPath(ctx, left, top, w, h, r, tw, th) {
  const x = left + w / 2, b = top + h;
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.arcTo(left + w, top, left + w, b, r);
  ctx.arcTo(left + w, b, x + tw / 2, b, r);
  ctx.lineTo(x + tw / 2, b); ctx.lineTo(x, b + th); ctx.lineTo(x - tw / 2, b);
  ctx.arcTo(left, b, left, top, r);
  ctx.arcTo(left, top, left + w, top, r);
  ctx.closePath();
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

// 자리잡이 레이어가 쓸 글자: 칩 자리만큼 넓게(칩 하나 ≈ 글자 + 양옆 여백)
export function placeholderText(lines, name) {
  return lines.map(l => ` ${lineChip(l)} `).join('') + (lines.length ? ' ' : '') + name;
}

// 판에 쓸 것: 노선 칩들(속성 ln · lc 는 '|' 로 이은 노선 이름 · 색)과 역 이름
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
    const S = size * s, chipH = S * SIGN.chip, chipF = S * .78;
    ctx.font = `800 ${chipF}px ${SIGN_FONT}`;
    const chipW = rows.chips.map(c => Math.max(chipH, ctx.measureText(c.text).width + chipH * .55));
    const chipsW = chipW.reduce((a, w) => a + w, 0) + SIGN.chipGap * s * Math.max(0, chipW.length - 1);
    ctx.font = `700 ${S}px ${SIGN_FONT}`;
    const nameW = ctx.measureText(rows.name).width;
    const innerW = chipsW + (chipsW ? SIGN.nameGap * s : 0) + nameW, innerH = Math.max(chipH, S * 1.2);
    const w = innerW + 2 * SIGN.padX * s, h = innerH + 2 * SIGN.padY * s;
    const lift = still ? 0 : Math.sin(now / SIGN.bobPeriod * Math.PI * 2 + phase) * SIGN.bob * s;   // 둥둥: 천천히 오르내려요
    const bottom = y - SIGN.gap * s - lift, top = bottom - h - SIGN.slab * s, left = x - w / 2;
    // 땅 그림자: 팻말이 오르면 조금 작고 옅어져요
    const k = 1 - lift / (SIGN.gap * s) * .25;
    ctx.fillStyle = T.shadow;
    ctx.globalAlpha = alpha * k;
    ctx.beginPath(); ctx.ellipse(x, y, Math.min(w * .32, 18 * s) * k, 3.2 * s * k, 0, 0, Math.PI * 2); ctx.fill();   // 긴 팻말도 그림자는 동그랗게
    ctx.globalAlpha = alpha;
    // 회색 두께(판 아래로 비치는 옆면) → 먹색 테두리 → 흰 앞면
    const R = SIGN.radius * s, tw = SIGN.tailW * s, th = SIGN.tail * s, r = SIGN.rim * s;
    ctx.fillStyle = T.slab;
    pinPath(ctx, left, top + SIGN.slab * s, w, h, R, tw, th); ctx.fill();
    ctx.fillStyle = T.rim;
    pinPath(ctx, left, top, w, h, R, tw, th); ctx.fill();
    ctx.fillStyle = T.fill;
    pinPath(ctx, left + r, top + r, w - 2 * r, h - 2 * r, Math.max(0, R - r), tw - 2 * r, th - 1.6 * r); ctx.fill();
    // 노선 칩: 노선색 둥근 네모에 흰 번호(출구 기둥 번호처럼)
    const cy = top + h / 2;
    let cx = left + SIGN.padX * s;
    ctx.font = `800 ${chipF}px ${SIGN_FONT}`;
    rows.chips.forEach((c, i) => {
      ctx.fillStyle = c.color;
      ctx.beginPath(); ctx.roundRect(cx, cy - chipH / 2, chipW[i], chipH, chipH * .28); ctx.fill();
      ctx.fillStyle = chipInk(c.color);
      ctx.fillText(c.text, cx + chipW[i] / 2, cy + chipH * .03);
      cx += chipW[i] + SIGN.chipGap * s;
    });
    if (chipsW) cx += SIGN.nameGap * s - SIGN.chipGap * s;
    ctx.font = `700 ${S}px ${SIGN_FONT}`;
    ctx.fillStyle = T.ink;
    ctx.fillText(rows.name, cx + nameW / 2, cy + S * .03);
  }
  ctx.restore();
}
