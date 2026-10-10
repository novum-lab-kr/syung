// Compact train badges. Keep Seoul 1–9 distinct from Incheon 1/2; an unknown line keeps only its colour.
// The journey UI's suffix-only names are retained where they fit, and longer names use these explicit abbreviations.
export const COASTER_BADGES = [
  { label: '', lines: [] },
  ...Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1), lines: [String(i + 1), `${i + 1}호선`] })),
  { label: '신', lines: ['신분당선', '신분당'] },
  { label: '경의', lines: ['경의중앙선', '경의중앙'] },
  { label: '공항', lines: ['공항철도', '공항선'] },
  { label: '수인', lines: ['수인분당선', '수인분당'] },
  { label: '경춘', lines: ['경춘선', '경춘'] },
  { label: '우이', lines: ['우이신설선', '우이신설'] },
  { label: '신림', lines: ['신림선', '신림'] },
  { label: '김포', lines: ['김포골드라인', '김포골드'] },
  { label: '서해', lines: ['서해선', '서해'] },
  { label: 'GTX\nA', lines: ['GTX-A', 'GTXA'] },
  { label: '인1', lines: ['인천1호선', '인천1', '인천1선'] },
  { label: '인2', lines: ['인천2호선', '인천2', '인천2선'] },
  { label: '의정', lines: ['의정부선', '의정부', '의정부경전철'] },
  { label: '에버', lines: ['에버라인선', '에버라인', '용인', '용인선', '용인경전철'] },
  { label: '경강', lines: ['경강선', '경강'] },
];
const normalize = line => String(line ?? '').replace(/\s/g, '').toUpperCase();
const ids = new Map(COASTER_BADGES.flatMap((b, i) => b.lines.map(line => [normalize(line), i])));
export const routeBadgeId = line => ids.get(normalize(line)) ?? 0;
export const BADGE_COLS = 8, BADGE_ROWS = 4, BADGE_CELL = 128;
let atlas;
export function routeBadgeAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = BADGE_COLS * BADGE_CELL; canvas.height = BADGE_ROWS * BADGE_CELL;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#152026'; ctx.lineJoin = 'round'; ctx.textAlign = 'center';
  // Use local Korean-capable fonts: no download, and no texture rebuild on each frame or theme change.
  const font = size => `900 ${size}px "Noto Sans CJK KR", "Noto Sans KR", "Malgun Gothic", sans-serif`;
  const text = (label, x, y, w, h) => {
    ctx.font = font(100);
    const m = ctx.measureText(label), size = 100 * Math.min(w / Math.max(1, m.width), h / Math.max(1, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent));
    ctx.font = font(size); ctx.lineWidth = Math.max(2, size * .045);
    const b = ctx.measureText(label), baseline = y + (b.actualBoundingBoxAscent - b.actualBoundingBoxDescent) / 2;
    ctx.strokeText(label, x, baseline); ctx.fillText(label, x, baseline);
  };
  COASTER_BADGES.forEach(({ label }, i) => {
    if (!label) return;
    const x = (i % BADGE_COLS + .5) * BADGE_CELL, y = (Math.floor(i / BADGE_COLS) + .5) * BADGE_CELL;
    if (label.includes('\n')) { const [top, bottom] = label.split('\n'); text(top, x, y - 34, 88, 28); text(bottom, x, y + 18, 84, 62) }
    else text(label, x, y, label.length === 1 ? 88 : 108, label.length === 1 ? 94 : 78);
  });
  return atlas = canvas;
}
