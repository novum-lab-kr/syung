#!/usr/bin/env node
// 도로 맞춤 경로 펴기: build_viaduct_snap.mjs 가 도로 중심선에 내린 경로는 교차로 · 차로 굴곡을 그대로 따라 S자로 흔들린다
// (2026-10-05 검수: S자 점수 30 넘는 구간 253곳 중 OSM 선로 탓은 4곳뿐). 승강장(platformHalf + 1 m)은 그대로 두고 그 사이를
// 4 m 간격으로 다시 찍어 이웃 평균으로 당기기를 iter 번(약 70 m 길이의 흔들림까지 걸러짐) 원래 도로 맞춤 경로에서 tubeM 안으로만
// 옮기고, 승강장 끝 joinM(40 m)은 승강장 방향에서 이어지는 Hermite 곡선으로 바꾼 뒤 Douglas–Peucker 0.3 m 로 줄인다.
// 양 끝 역 점 · 승강장(platformHalf + 1 m) 꼭짓점은 그대로.
//
//   node pipeline/smooth_viaduct_snap.mjs            # web/city/viaduct_snap.mjs 를 한 번 편다(이미 편 파일이면 멈춤)
//
// build_viaduct_snap.mjs 는 새로 만든 구간에 smoothSnapPath 를 바로 쓴다(값: pack.viaduct.snap.smoothTubeM · smoothIter).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SMOOTHED_MARK = '// 승강장 밖은 pipeline/smooth_viaduct_snap.mjs 로 편 경로(원래 도로 맞춤 경로에서 smoothTubeM 안).';
const K = 111320;

export function smoothSnapPath(coords, holdLo, holdHi, { tubeM = 8, iter = 300, joinM = 40 } = {}) {
  if (coords.length < 3) return coords;
  const kx = Math.cos(coords[0][1] * Math.PI / 180), p = coords.map(q => [q[0] * kx * K, q[1] * K]);
  const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const total = cum[cum.length - 1];
  if (total < holdLo + holdHi + 20) return coords;
  const n = Math.max(2, Math.round(total / 4)), P = [];
  for (let i = 0, j = 1; i <= n; i++) {
    const s = total * i / n; while (j < p.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
    P.push({ s, x: p[j - 1][0] + (p[j][0] - p[j - 1][0]) * u, y: p[j - 1][1] + (p[j][1] - p[j - 1][1]) * u });
  }
  const O = P.map(q => [q.x, q.y]), free = P.map(q => q.s > holdLo && q.s < total - holdHi);
  for (let it = 0; it < iter; it++) for (let i = 1; i < P.length - 1; i++) {
    if (!free[i]) continue;
    const a = P[i - 1], b = P[i + 1];
    let x = P[i].x + .5 * ((a.x + b.x) / 2 - P[i].x), y = P[i].y + .5 * ((a.y + b.y) / 2 - P[i].y);
    const dx = x - O[i][0], dy = y - O[i][1], d = Math.hypot(dx, dy);
    if (d > tubeM) { x = O[i][0] + dx / d * tubeM; y = O[i][1] + dy / d * tubeM }
    P[i].x = x; P[i].y = y;
  }
  // 승강장 끝에서 joinM 동안은 승강장 방향에서 출발해 편 경로 방향으로 들어가는 3차 Hermite 곡선(띠 끝 꺾임 없음)
  const dir = (i, j) => { const a = P[Math.max(0, Math.min(P.length - 1, i))], b = P[Math.max(0, Math.min(P.length - 1, j))], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [(b.x - a.x) / l, (b.y - a.y) / l] };
  const join = (i0, i1, t0, t1) => { const a = P[i0], b = P[i1], L = Math.hypot(b.x - a.x, b.y - a.y); for (let i = i0 + 1; i < i1; i++) { const t = (i - i0) / (i1 - i0), h00 = 2 * t ** 3 - 3 * t * t + 1, h10 = t ** 3 - 2 * t * t + t, h01 = -2 * t ** 3 + 3 * t * t, h11 = t ** 3 - t * t; P[i].x = h00 * a.x + h10 * L * t0[0] + h01 * b.x + h11 * L * t1[0]; P[i].y = h00 * a.y + h10 * L * t0[1] + h01 * b.y + h11 * L * t1[1] } };
  const first = free.indexOf(true), last = free.lastIndexOf(true), span = Math.round(joinM / 4);
  if (first > 0 && last < P.length - 1 && last - first > 2 * span + 2) {
    const a = first - 1, b = first + span, c = last - span, d = last + 1;   // a · d: 승강장 끝(고정), b · c: 편 경로
    join(a, b, dir(a - 3, a), dir(b - 1, b + 1));
    join(c, d, dir(c - 1, c + 1), dir(d, d + 3));
  }
  // 승강장 안은 원래 꼭짓점 그대로, 그 사이만 편 점
  const mid = P.filter(q => q.s > holdLo && q.s < total - holdHi).map(q => [q.x, q.y]);
  const head = p.filter((_, i) => cum[i] <= holdLo), tail = p.filter((_, i) => cum[i] >= total - holdHi);
  const keepHead = head.length, all = [...head, ...mid, ...tail], keep = all.map((_, i) => i < keepHead || i >= keepHead + mid.length);
  // Douglas–Peucker 0.3 m (편 점만 줄인다)
  const seg = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l)) : 0; return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t) };
  const lo = Math.max(0, keepHead - 1), hi = Math.min(all.length - 1, keepHead + mid.length), stack = [[lo, hi]];
  while (stack.length) { const [a, b] = stack.pop(); let far = 0, idx = -1; for (let k = a + 1; k < b; k++) { const d = seg(all[k], all[a], all[b]); if (d > far) { far = d; idx = k } } if (far > .3) { keep[idx] = true; stack.push([a, idx], [idx, b]) } }
  const out = []; for (let i = 0; i < all.length; i++) if (keep[i]) out.push(i < keepHead ? coords[i] : i >= keepHead + mid.length ? coords[coords.length - (all.length - i)] : [+(all[i][0] / kx / K).toFixed(6), +(all[i][1] / K).toFixed(6)]);
  return out;
}

// 구간 lo → hi 의 승강장 길이(양 끝 역): 기본 지도 승강장 띠와 같은 track_shapes.json platformHalf(없으면 90) + 1 m
export const holdsFor = (id, platformHalf) => { const [line, lo, hi] = id.split(':'); return [(platformHalf[`${line}:${lo}`] || 90) + 1, (platformHalf[`${line}:${hi}`] || 90) + 1] };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), FILE = path.join(ROOT, 'web', 'city', 'viaduct_snap.mjs');
  const src = readFileSync(FILE, 'utf8');
  if (src.includes(SMOOTHED_MARK)) { console.error('이미 편 파일이에요. build_viaduct_snap.mjs 로 새로 만든 뒤에만 다시 펴요.'); process.exit(1) }
  const { default: SNAP, stops } = await import(FILE), pack = (await import('../web/modes/basic/city.mjs')).default, SN = pack.viaduct.snap;
  const TS = JSON.parse(readFileSync(path.join(ROOT, 'data', 'osm-tracks', 'track_shapes.json'), 'utf8'));
  const out = {}; for (const [id, c] of Object.entries(SNAP)) out[id] = smoothSnapPath(c, ...holdsFor(id, TS.platformHalf), { tubeM: SN.smoothTubeM, iter: SN.smoothIter });
  const lines = src.split('\n'), at = lines.findIndex(l => l.startsWith('export default '));
  lines.splice(at, 1, SMOOTHED_MARK, `export default ${JSON.stringify(out)};`);
  if (!lines.some(l => l.startsWith('export const stops = '))) throw new Error('stops 줄이 없어요');
  writeFileSync(FILE, lines.join('\n'));
  console.log(`편 구간 ${Object.keys(out).length}`);
}
