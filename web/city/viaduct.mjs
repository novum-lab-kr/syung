// 심시티 고가 (viaduct) — in the simcity mode every line rides a viaduct over the streets, the way 2호선 does at 건대입구:
// a concrete deck with the line's colour along its parapets, on single piers that stand only on the roads and the open
// ground (never inside a building's footprint: a pier that would is moved along the track, or left out), with roofed
// side platforms at the stations and, from each platform, roofed stairs down to the station's real exits
// (city_viaduct_exits.mjs). The trains run on the deck (the runtime lifts them to the same height, heightAt).
// At a transfer station whose platforms overlap in plan the lines take different levels (11 m, 18 m, 25 m…), the deck
// ramping gently between stations (city_viaduct_levels.mjs); stretches that really run in a tunnel under a street may
// be moved onto that street (city_viaduct_snap.mjs, built offline; the runtime draws and drives on the moved path).
// Drawn on the train overlay canvas after the buildings have written their depth, so a tall building hides the deck
// behind it and a low one passes under it, exactly as with the trains. Stretches that really are elevated (OSM
// bridge=*, web/city/viaduct_flags.mjs) get a slightly darker concrete; the rest looks the same, only lifted.
// Every colour, metre and zoom comes from the style pack (pack.viaduct).
//
//   const v = new CityViaduct({pack, net});
//   v.train(zoom, bodyPx) → {bodyPx, lanePx}      // the trains' width and lane offset in this mode (the deck is cut to them)
//   v.heightAt(line, a, b, k) → metres            // the rail height k of the way from station a to b (the runtime lifts the trains by it)
//   v.stationH(line, id) → metres                 // the rail height at a station (its level)
//   v.snapped(line, lo, hi) → [[lon,lat]…] | null // the edge's path moved onto its street, when it was
//   v.render(gl, matrix, {now, zoom, dark, phone, bounds, sun, life, selected, moving, bodyPx, journey}) → true while still building
//     journey: 길찾기로 탈 지하철 구간 [{line, stations}] (없으면 null, 버스만 타면 []) — 그 구간 · 타고 내리는 승강장은 노선색, 나머지 고가는 흐리게
//   v.screen(map, x, y, h)   v.shadowShift(sun, hM)   v.routeOpacity(focus)   v.dispose(gl)
//
//   net: the runtime's network — {paths, byId, geom(line,lo,hi) → {pts: [MercatorCoordinate…]}, offset(line,lo,hi) → px,
//        colors, rects: Map(line:stationId → {coords, offset, plat}), exits: {stationId: [[lon,lat,ref…]…]}, bodyPx(zoom) → px}
//   life: the CityLife instance (its cells know the building footprints; piers and stairs wait for a cell before they stand)
//
// Widths across the track are in CSS px (the trains are px-sized, the deck must carry them), heights and the piers'
// footprints in metres with a px floor so they never vanish. Zoomed out, where no cars drive, the deck is slimmer than
// the trains, which overhang it as they overhang the route line in the other modes.

import SEOUL from '../modes/basic/city.mjs';
import FLAGS from './viaduct_flags.mjs';
import SNAP from './viaduct_snap.mjs';
import { toneRGB, hexRgb, MPP } from './style.mjs';
import { compileProgram, hashi } from './traffic.mjs';
import { MU, MERC_ORIGIN as O, toM } from './life.mjs';
import { STRIDE, MAT, COLOR_KEYS, Mesh } from './viaduct_mesh.mjs';
import { stationLevels, holdLevels, edgeProfile, pointSegmentDistance, edgeOverlaps, resolveCrossings, sameLevelRegions, compareLines } from './viaduct_levels.mjs';
import { layoutExits, buildExits, exitSamples } from './viaduct_exits.mjs';
export { STRIDE, MAT };

const V_OF = pack => pack.viaduct || SEOUL.viaduct;
const STUB_MAX_M = 300;   // 끝역에서 상판을 늘리는 가장 긴 길이(가장 긴 승강장 반길이 광명 223 m 보다 길게)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) };
// local metres back to lon/lat (the inverse of city_life's toM)
export const toLL = (x, y) => { const mx = O.x + x * MU, my = O.y + y * MU; return [(mx - .5) * 360, Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI] };

// ── pure helpers (the tests use them too) ────────────────────────────────────────────────────────
// the trains in this mode: the body the runtime gives (its slim coaster width) and a lane half a body plus the pack's gap off the line
export function trainMetrics(zoom, bodyPx, pack = SEOUL) { const V = V_OF(pack); return { bodyPx, lanePx: bodyPx / 2 + V.train.laneGapPx } }
// the deck's lane and body (px) at this zoom: the trains' own where cars drive on the streets, slimmer zoomed out
export function deckWidths(zoom, bodyPx, pack = SEOUL) {
  const V = V_OF(pack), { lanePx } = trainMetrics(zoom, bodyPx, pack), k = smooth(V.widthZoom[0], V.widthZoom[1], zoom);
  return { lane: V.lowZoomLanePx + (lanePx - V.lowZoomLanePx) * k, body: V.lowZoomBodyPx + (bodyPx - V.lowZoomBodyPx) * k };
}
// the platform's outer edge from the deck's centre, in metres at a zoom (px-sized, so it varies with the zoom)
export function platformEdgeM(zoom, bodyPx, pack = SEOUL) { const V = V_OF(pack), W = deckWidths(zoom, bodyPx, pack); return (V.marginPx + V.station.gapPx + W.lane + (.5 + V.station.platformDepthRatio) * W.body) * MPP(zoom) }
// the rows of a ribbon along a polyline (local metres): the point, the direction F, the across vector R mitred at the bends
// (an offset along it keeps the ribbon's width through a corner; capped at 2.5× for sharp ones) and the distance along, s
export function ribbonRows(P) {
  const dirs = []; for (let i = 0; i + 1 < P.length; i++) { const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dy); dirs.push(l > 1e-6 ? [dx / l, dy / l, l] : null) }
  const rows = []; let s = 0;
  for (let i = 0; i < P.length; i++) {
    const a = i > 0 ? dirs[i - 1] : null, b = i + 1 < P.length ? dirs[i] : null, f = b || a; if (a) s += a[2]; if (!f) continue;
    let rx = -f[1], ry = f[0], fx = f[0], fy = f[1];
    if (a && b) {
      const mx = -a[1] - b[1], my = a[0] + b[0], ml = Math.hypot(mx, my);
      if (ml > 1e-6) { const nx = mx / ml, ny = my / ml, k = Math.min(2.5, 1 / Math.max(.4, nx * -b[1] + ny * b[0])); rx = nx * k; ry = ny * k }
      const sx = a[0] + b[0], sy = a[1] + b[1], sl = Math.hypot(sx, sy); if (sl > 1e-6) { fx = sx / sl; fy = sy / sl }
    }
    rows.push({ x: P[i][0], y: P[i][1], fx, fy, rx, ry, s });
  }
  return rows;
}
// the point s along the rows, with its own segment's (unmitred) frame
export function rowAt(rows, s) {
  let i = 1, j = rows.length - 1; while (i < j) { const m = (i + j) >> 1; if (rows[m].s < s) i = m + 1; else j = m }
  const A = rows[i - 1], B = rows[i], l = (B.s - A.s) || 1, u = Math.max(0, Math.min(1, (s - A.s) / l)), dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
  return { x: A.x + dx * u, y: A.y + dy * u, fx: dx / d, fy: dy / d, rx: -dy / d, ry: dx / d, s };
}
// the stretch s0…s1 of a ribbon's rows (its ends on the line, straight on past the line's own ends)
export function sliceRows(rows, s0, s1) { return [rowAtX(rows, s0), ...rows.filter(r => r.s > s0 + 1e-6 && r.s < s1 - 1e-6), rowAtX(rows, s1)] }
// rowAt, carried straight on past the rows' ends
export function rowAtX(rows, s) { const c = Math.max(rows[0].s, Math.min(rows[rows.length - 1].s, s)), q = rowAt(rows, c), k = s - c; return { ...q, x: q.x + q.fx * k, y: q.y + q.fy * k, s } }
// the point s along the rows with the frame blended between its two rows (mitred across, as the faces joining them are)
function rowLerp(rows, s) {
  let i = 1, j = rows.length - 1; while (i < j) { const m = (i + j) >> 1; if (rows[m].s < s) i = m + 1; else j = m }
  const A = rows[i - 1], B = rows[i], u = Math.max(0, Math.min(1, (s - A.s) / ((B.s - A.s) || 1))), L = (a, b) => a + (b - a) * u, fx = L(A.fx, B.fx), fy = L(A.fy, B.fy), fl = Math.hypot(fx, fy) || 1;
  return { x: L(A.x, B.x), y: L(A.y, B.y), fx: fx / fl, fy: fy / fl, rx: L(A.rx, B.rx), ry: L(A.ry, B.ry), s };
}
// a ribbon's rows cut so no segment is longer than `max` metres (a ramp needs rows to bend over)
export function densify(rows, max) {
  if (!(max > 0)) return rows; const out = [];
  for (let i = 0; i < rows.length; i++) {
    out.push(rows[i]); if (i + 1 >= rows.length) continue;
    const A = rows[i], B = rows[i + 1], L = B.s - A.s, n = Math.ceil(L / max);
    for (let k = 1; k < n; k++) out.push(rowAt(rows, A.s + L * k / n));
  }
  return out;
}
// pier spots along an edge: one every `every` m from a phase, each moved along the track (6 m steps, up to `search` m) off a
// building. ok(s) → true (clear ground), false (inside a building), undefined (not known yet: that tile has not come). Returns
// the spots and whether one was left open for want of a tile (the caller builds again when it has come).
export function pierSpots(total, every, search, phase, ok) {
  const spots = [], end = total - 8; let unknown = false;
  for (let s = 8 + every * phase; s < end; s += every) {
    let put = null, open = false;
    for (let d = 0; d <= search && put === null; d += 6) for (const c of d ? [s + d, s - d] : [s]) { if (put !== null || c < 8 || c > end) continue; const r = ok(c); if (r === true) put = c; else if (r === undefined) open = true }
    if (put !== null) spots.push(put); else if (open) unknown = true;
  }
  return { spots, unknown };
}
// 상판을 끊는 구간(gaps: [[f0, f1]…], 가장자리 길이의 몫)을 뺀 나머지 rows 조각들 — 롤코에서 레일이 고가를 떠난 곳은 상판이 없다
export function rowsBetweenGaps(rows, gaps) {
  const total = rows.length ? rows[rows.length - 1].s : 0, cuts = (gaps || []).map(([a, b]) => [Math.max(0, a * total), Math.min(total, b * total)]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  if (!cuts.length) return [rows]; const keep = []; let at = 0;
  for (const [a, b] of cuts) { if (a > at) keep.push([at, a]); at = Math.max(at, b) } if (at < total) keep.push([at, total]);
  return keep.filter(([a, b]) => b - a > .5).map(([a, b]) => [rowAt(rows, a), ...rows.filter(r => r.s > a && r.s < b), rowAt(rows, b)]);
}
// is the point at fraction t of the edge on a real bridge (ranges from city_viaduct_flags.mjs)
export function elevatedAt(ranges, t) { if (ranges) for (const [a, b] of ranges) if (t >= a && t <= b) return true; return false }
// the ground route line's opacity in this mode: it fades out as the deck takes over
export function routeOpacityExpr(focus, pack = SEOUL) { const [z0, z1] = V_OF(pack).lod.deck; return ['interpolate', ['linear'], ['zoom'], z0, focus ? .25 : .9, z1, 0] }
const fnOf = h => typeof h === 'function' ? h : () => h;

// ── meshes ──────────────────────────────────────────────────────────────────────────────────────
// the deck along an edge: base = top, underside, sides and the parapets; detail = the two track beds and their rails.
// hT: the rail height in metres, a number or a function of s (the distance along) for an edge that ramps
export function buildDeck(rows, eo, V, flags, detail, hT = V.railHeightM) {
  const H = fnOf(hT), M = new Mesh(rows.length * (detail ? 36 : 60)), mg = V.marginPx, pp = V.parapetPx, total = rows[rows.length - 1].s || 1, K = V.elevatedConcreteK;
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i], b = rows[i + 1], sh = elevatedAt(flags, (a.s + b.s) / 2 / total) ? K : 1, hA = H(a.s), hB = H(b.s);
    const P = (r, h, px, kl, kb, mat, n, shade = sh) => [r, h, px, kl, kb, 0, 0, 0, 0, 0, 0, 0, mat, shade, n];
    if (!detail) {
      const dT = V.deckThicknessM, hP = V.parapetHeightM;
      M.quad(P(a, hA, eo + mg, 1, .5, MAT.TOP, 0), P(b, hB, eo + mg, 1, .5, MAT.TOP, 0), P(b, hB, eo - mg, -1, -.5, MAT.TOP, 0), P(a, hA, eo - mg, -1, -.5, MAT.TOP, 0));
      M.quad(P(a, hA - dT, eo + mg, 1, .5, MAT.UNDER, 3), P(b, hB - dT, eo + mg, 1, .5, MAT.UNDER, 3), P(b, hB - dT, eo - mg, -1, -.5, MAT.UNDER, 3), P(a, hA - dT, eo - mg, -1, -.5, MAT.UNDER, 3));
      for (const d of [-1, 1]) {
        const px = eo + d * mg, kl = d, kb = d * .5, pi = px - d * pp;
        M.quad(P(a, hA - dT, px, kl, kb, MAT.SIDE, d), P(b, hB - dT, px, kl, kb, MAT.SIDE, d), P(b, hB, px, kl, kb, MAT.SIDE, d), P(a, hA, px, kl, kb, MAT.SIDE, d));
        M.quad(P(a, hA, px, kl, kb, MAT.PARAPET, d, 1), P(b, hB, px, kl, kb, MAT.PARAPET, d, 1), P(b, hB + hP, px, kl, kb, MAT.PARAPET, d, 1), P(a, hA + hP, px, kl, kb, MAT.PARAPET, d, 1));
        M.quad(P(a, hA, pi, kl, kb, MAT.PARAPET, -d, 1), P(b, hB, pi, kl, kb, MAT.PARAPET, -d, 1), P(b, hB + hP, pi, kl, kb, MAT.PARAPET, -d, 1), P(a, hA + hP, pi, kl, kb, MAT.PARAPET, -d, 1));
        M.quad(P(a, hA + hP, px, kl, kb, MAT.PARAPET, 0, 1), P(b, hB + hP, px, kl, kb, MAT.PARAPET, 0, 1), P(b, hB + hP, pi, kl, kb, MAT.PARAPET, 0, 1), P(a, hA + hP, pi, kl, kb, MAT.PARAPET, 0, 1));
      }
    } else for (const d of [-1, 1]) {   // the track beds and the rails, at ±lane where the trains run
      const w = V.bedWidthRatio / 2, g = V.railGaugeRatio / 2, rp = V.railPx / 2;
      M.quad(P(a, hA + .08, eo, d, w, MAT.BED, 0, 1), P(b, hB + .08, eo, d, w, MAT.BED, 0, 1), P(b, hB + .08, eo, d, -w, MAT.BED, 0, 1), P(a, hA + .08, eo, d, -w, MAT.BED, 0, 1));
      for (const e of [-1, 1]) M.quad(P(a, hA + .16, eo + rp, d, e * g, MAT.RAIL, 0, 1), P(b, hB + .16, eo + rp, d, e * g, MAT.RAIL, 0, 1), P(b, hB + .16, eo - rp, d, e * g, MAT.RAIL, 0, 1), P(a, hA + .16, eo - rp, d, e * g, MAT.RAIL, 0, 1));
    }
  }
  return M.data();
}
// the piers of an edge at the spots given: a square column (metres, px floor) under a cap as wide as the deck
export function buildPiers(rows, spots, eo, V, flags, hT = V.railHeightM) {
  const H = fnOf(hT), M = new Mesh(spots.length * 54), half = V.pier.sideM / 2, mp = V.pier.minPx / 2, cl = V.pier.capLengthM / 2, total = rows[rows.length - 1].s || 1, K = V.elevatedConcreteK;
  for (const s of spots) {
    const r = rowAtX(rows, s), sh = elevatedAt(flags, Math.max(0, Math.min(1, s / total))) ? K : 1, hB = H(s) - V.deckThicknessM, hC = hB - V.pier.capDepthM;   // s past the ends: under a terminal's stub (stubsOf)
    const C = (h, l, a, n) => [r, h, eo, 0, 0, 0, 0, 0, l, a, Math.sign(l) * mp, Math.sign(a) * mp, MAT.PIER, sh, n];   // the column
    if (V.aqueduct) for (let k = 0; k < 8; k++) {   // 조선 수로: 팔각 통나무 기둥(면 k 의 법선 코드 4 + k)
      const p = (j, h) => { const t = (j - .5) * Math.PI / 4, c = Math.cos(t), s2 = Math.sin(t); return [r, h, eo, 0, 0, 0, 0, 0, .8 * half * c, .8 * half * s2, c * mp, s2 * mp, MAT.PIER, sh, 4 + k] };
      M.quad(p(k, 0), p(k + 1, 0), p(k + 1, hC), p(k, hC));
    } else for (const d of [-1, 1]) {
      M.quad(C(0, d * half, -half, d), C(0, d * half, half, d), C(hC, d * half, half, d), C(hC, d * half, -half, d));
      M.quad(C(0, -half, d * half, 2 * d), C(0, half, d * half, 2 * d), C(hC, half, d * half, 2 * d), C(hC, -half, d * half, 2 * d));
    }
    const X = (h, d, a, n) => [r, h, eo + d * (V.marginPx + V.pier.capOverhangPx), d, d * .5, 0, 0, 0, 0, a, 0, Math.sign(a) * V.pier.minPx, MAT.PIER, sh, n];   // the cap
    for (const d of [-1, 1]) {
      M.quad(X(hC, d, -cl, d), X(hC, d, cl, d), X(hB, d, cl, d), X(hB, d, -cl, d));
      M.quad(X(hC, -1, d * cl, 2 * d), X(hC, 1, d * cl, 2 * d), X(hB, 1, d * cl, 2 * d), X(hB, -1, d * cl, 2 * d));
    }
    M.quad(X(hC, -1, -cl, 3), X(hC, 1, -cl, 3), X(hC, 1, cl, 3), X(hC, -1, cl, 3));
  }
  return M.data();
}
// a station: a side platform either side of the deck, each under a flat canopy with the line's colour along its edge
// (p: {rows, row, L} — the platform's stretch of the line (it bends with the deck), else its centre frame and length in metres)
export function buildPlatform(p, eo, V, detail, hT = V.railHeightM) {
  const S = V.station, M = new Mesh(400), L = p.L, mg = V.marginPx, fT = hT + S.platformRiseM, fB = fT - S.floorM, dep = S.platformDepthRatio;
  const rows = p.rows || (r => [{ ...r, x: r.x - r.fx * L / 2, y: r.y - r.fy * L / 2, s: 0 }, { ...r, x: r.x + r.fx * L / 2, y: r.y + r.fy * L / 2, s: L }])(p.row);
  const s0 = rows[0].s, s1 = rows[rows.length - 1].s, Lc = s1 - s0 - 2 * S.canopyInsetM, rT = fT + S.canopyHeightM + S.canopyThicknessM, rB = rT - S.canopyThicknessM;
  const roofRows = Lc < 12 ? null : sliceRows(rows, s0 + S.canopyInsetM, s1 - S.canopyInsetM);
  const Q = (r, h, px, kl, kb, mat, n) => [r, h, px, kl, kb, 0, 0, 0, 0, 0, 0, 0, mat, 1, n];
  const ends = R => [[R[0], -1], [R[R.length - 1], 1]];
  for (const d of [-1, 1]) {
    const base = eo + d * (mg + S.gapPx), ki = d * .5, ko = d * (.5 + dep);   // inner edge (×body .5), outer edge (×body .5 + depth)
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i], b = rows[i + 1];
      M.quad(Q(a, fT, base, d, ki, MAT.FLOOR, 0), Q(a, fT, base, d, ko, MAT.FLOOR, 0), Q(b, fT, base, d, ko, MAT.FLOOR, 0), Q(b, fT, base, d, ki, MAT.FLOOR, 0));
      M.quad(Q(a, fB, base, d, ko, MAT.FLOOR, d), Q(b, fB, base, d, ko, MAT.FLOOR, d), Q(b, fT, base, d, ko, MAT.FLOOR, d), Q(a, fT, base, d, ko, MAT.FLOOR, d));
    }
    for (const [r, e] of ends(rows)) M.quad(Q(r, fB, base, d, ki, MAT.FLOOR, 2 * e), Q(r, fB, base, d, ko, MAT.FLOOR, 2 * e), Q(r, fT, base, d, ko, MAT.FLOOR, 2 * e), Q(r, fT, base, d, ki, MAT.FLOOR, 2 * e));
    if (!roofRows) continue;
    const cin = base - d * .3, cout = base + d * S.canopyOverhangPx;   // a little over the deck's edge; a little past the platform's
    for (let i = 0; i + 1 < roofRows.length; i++) {
      const a = roofRows[i], b = roofRows[i + 1];
      M.quad(Q(a, rT, cin, d, ki, MAT.ROOF, 0), Q(a, rT, cout, d, ko, MAT.ROOF, 0), Q(b, rT, cout, d, ko, MAT.ROOF, 0), Q(b, rT, cin, d, ki, MAT.ROOF, 0));
      M.quad(Q(a, rB, cin, d, ki, MAT.ROOF_UNDER, 3), Q(a, rB, cout, d, ko, MAT.ROOF_UNDER, 3), Q(b, rB, cout, d, ko, MAT.ROOF_UNDER, 3), Q(b, rB, cin, d, ki, MAT.ROOF_UNDER, 3));
      M.quad(Q(a, rB, cout, d, ko, MAT.FASCIA, d), Q(b, rB, cout, d, ko, MAT.FASCIA, d), Q(b, rT, cout, d, ko, MAT.FASCIA, d), Q(a, rT, cout, d, ko, MAT.FASCIA, d));
      M.quad(Q(a, rB, cin, d, ki, MAT.ROOF, -d), Q(b, rB, cin, d, ki, MAT.ROOF, -d), Q(b, rT, cin, d, ki, MAT.ROOF, -d), Q(a, rT, cin, d, ki, MAT.ROOF, -d));
    }
    for (const [r, e] of ends(roofRows)) M.quad(Q(r, rB, cin, d, ki, MAT.ROOF, 2 * e), Q(r, rB, cout, d, ko, MAT.ROOF, 2 * e), Q(r, rT, cout, d, ko, MAT.ROOF, 2 * e), Q(r, rT, cin, d, ki, MAT.ROOF, 2 * e));
    if (!detail) continue;
    const pc = base - d * S.postInsetPx, hp = S.postM / 2, pp = S.postPx / 2, c0 = roofRows[0].s, n = Math.max(2, Math.floor(Lc / S.postEveryM) + 1);   // posts along the outer edge
    for (let k = 0; k < n; k++) {
      const r = rowLerp(roofRows, c0 + 2 + (Lc - 4) * k / (n - 1)), T = (h, l, al, nn) => [r, h, pc, d, ko, 0, 0, 0, l, al, Math.sign(l) * pp, Math.sign(al) * pp, MAT.POST, 1, nn];
      for (const e of [-1, 1]) { M.quad(T(fT, e * hp, -hp, e), T(fT, e * hp, hp, e), T(rB, e * hp, hp, e), T(rB, e * hp, -hp, e)); M.quad(T(fT, -hp, e * hp, 2 * e), T(fT, hp, e * hp, 2 * e), T(rB, hp, e * hp, 2 * e), T(rB, -hp, e * hp, 2 * e)) }
    }
  }
  return M.data();
}

// ── shaders ─────────────────────────────────────────────────────────────────────────────────────
const VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec2 a_r; layout(location=2) in vec2 a_f; layout(location=3) in vec2 a_px; layout(location=4) in vec2 a_k;
layout(location=5) in vec2 a_m; layout(location=6) in vec2 a_sz; layout(location=7) in vec2 a_min; layout(location=8) in vec2 a_mat; layout(location=9) in float a_n; layout(location=10) in float a_s;
uniform mat4 u_matrix; uniform float u_mu, u_unit, u_lane, u_body, u_night, u_alpha, u_shadow, u_railH, u_water; uniform vec2 u_shift, u_lit; uniform vec4 u_glowK; uniform vec3 u_line, u_light, u_tint, u_glow, u_shade, u_wcol; uniform vec3 u_col[16]; uniform float u_route; uniform vec3 u_veil;
out vec3 v_col; out float v_a; out vec2 v_w; out vec3 v_q; flat out float v_wat; flat out float v_wood;
float lit(vec3 n, vec3 L, vec2 k){ float d = max(dot(n, L), 0.); return k.x + k.y * (.5 + .5 * d); }
float sz(float m, float p){ float a = m * u_mu, b = p * u_unit; return abs(b) > abs(a) ? b : a; }   // a size in metres, never under its px floor
void main(){
  int m = int(a_mat.x + .5);
  if (u_shadow > .5 && m != 0 && m != 7 && m != 8 && m != 14) { gl_Position = vec4(2., 2., 2., 1.); return; }   // the shadow: the deck's top, the platforms, the roofs, the walkways
  vec2 R = a_r, F = a_f;
  float lat = a_m.x * u_mu + sz(a_sz.x, a_min.x) + (a_px.x + a_k.x * u_lane + a_k.y * u_body) * u_unit, alo = a_m.y * u_mu + sz(a_sz.y, a_min.y) + a_px.y * u_unit;
  vec3 p = vec3(a_pos.xy * u_mu + R * lat + F * alo, a_pos.z * u_mu);
  if (u_shadow > .5) { p.xy += u_shift * clamp(a_pos.z / u_railH, 0., 4.); p.z = .05 * u_mu; gl_Position = u_matrix * vec4(p, 1.); gl_Position.z -= 1.5e-5 * gl_Position.w; v_col = u_shade; v_a = u_alpha; return; }   // on the ground, away from the sun by its height
  gl_Position = u_matrix * vec4(p, 1.);
  v_w = p.xy / u_mu; v_wat = u_water > .5 && m == 0 ? 1. : 0.; v_wood = u_water > .5 && m == 4 ? 1. : 0.;   // 조선 수로: 상판 윗면은 물, 교각은 통나무(무늬는 FS)
  float ph = (a_n - 4.) * .78539816;   // 4–11: 팔각 기둥의 면
  vec3 n = a_n == 0. ? vec3(0., 0., 1.) : abs(a_n) < 1.5 ? vec3(normalize(R) * sign(a_n), 0.) : abs(a_n) < 2.5 ? vec3(F * sign(a_n), 0.) : a_n < 3.5 ? vec3(0., 0., -1.) : vec3(normalize(R) * cos(ph) + F * sin(ph), 0.);
  // 물: (길이 s, 폭 −1…1, -) · 나무: (면 위 가로 m, 높이 m, -)
  v_q = m == 0 ? vec3(a_s, a_k.x, 0.) : vec3(dot(v_w, vec2(-n.y, n.x)), a_pos.z, 0.);
  vec3 c = (m == 3 && !(u_water > .5 && a_n != 0.) || m == 11) ? u_line : u_col[m];   // 조선 수로: 난간은 돌, 윗면만 노선 색
  if (u_water > .5 && m == 0) c = u_wcol;
  // 길찾기(u_route 1): 탄 구간 · 타고 내리는 승강장을 노선색으로 — 상판 옆 · 난간(조선 돌 난간도) 노선색, 윗면 · 물은 노선색 쪽으로, 승강장 지붕 노선색 · 바닥 조금
  if (u_route > .5 && u_route < 1.5) {
    if (m == 1 || m == 3) c = u_line; else if (m == 0) c = mix(c, u_line, u_water > .5 ? .5 : .75);
    else if (m == 8) c = mix(c, u_line, .85); else if (m == 7) c = mix(c, u_line, .2);
  }
  c = c * a_mat.y * lit(n, u_light, u_lit) * u_tint;
  if (m == 2) c = mix(c, u_glow, u_night * u_glowK.x);                       // under the deck: lit softly at night
  if (m == 9 || m == 7) c = mix(c, u_glow, u_night * u_glowK.y * (m == 7 ? .6 : 1.));   // the platforms and under their roofs (the stairs' roofs too)
  if (m == 12) c = mix(c, u_glow, u_night * u_glowK.z);                      // the stairs' treads
  if (m == 14) c = mix(c, u_glow, u_night * u_glowK.w);                      // the walkways
  if (u_route > 1.5) c = mix(c, u_veil, .5);   // 길찾기(u_route 2): 다른 고가는 땅의 흐린 막(journey-veil)처럼 물러난다
  v_col = c; v_a = u_alpha;
}`;
const FS = `#version 300 es
precision highp float; in vec3 v_col; in float v_a; in vec2 v_w; in vec3 v_q; flat in float v_wat; flat in float v_wood; uniform float u_time; out vec4 o;
float h21(vec2 p){ p = fract(p * vec2(.1031, .1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 c = v_col;
  if (v_wat > .5) {   // 물: 길이(s) 방향으로 길게 늘어진 물결 두 겹이 다른 빠르기로 흘러가고(점처럼 반짝이는 마루 없음), 가운데는 깊은 색, 양 가장자리에 거품
    float s = v_q.x, q = v_q.y, t = u_time, k = 1. - smoothstep(.8, 2.5, fwidth(s));   // 멀리서(한 px 이 물결보다 크면) 잔잔하게
    float r = vn(vec2((s - t * 1.3) * .35, q * 2.)) * .6 + vn(vec2((s - t * .8) * .6 + 17., q * 3. + 5.)) * .4;
    c *= mix(.8, 1.06, smoothstep(0., 1., abs(q)));   // 가운데 깊게
    c *= 1. + .16 * (r - .5) * k;
    float foam = smoothstep(.8, .98, abs(q)) * (.55 + .45 * vn(vec2((s - t * 1.3) * 1.4, q * 6.)));
    c = mix(c, vec3(.93, .95, .94) * max(max(v_col.r, v_col.g), v_col.b) * 1.6, foam * .5);
  }
  if (v_wood > .5) {   // 통나무 기둥: 세로 나뭇결(가까이서만), 3.2 m 마다 밧줄 묶음(꼬임 무늬)
    float u = v_q.x, h = v_q.y, k = 1. - smoothstep(.12, .45, fwidth(u));
    float g = vn(vec2(u * 7., h * .5));
    c *= 1. + (.2 * (g - .5) + .07 * sin(u * 38. + g * 7.)) * k;
    float rh = mod(h - 1., 3.2), band = smoothstep(2.62, 2.66, rh) * (1. - smoothstep(2.94, 2.98, rh));
    float tw = mix(1., .78 + .22 * smoothstep(.35, .5, abs(fract(u * 3. + h * 7.) - .5) * 2.), k);
    c = mix(c, c * vec3(1.55, 1.45, 1.2) * tw, band);
  }
  o = vec4(clamp(c, 0., 1.) * v_a, v_a);
}`;
const UNIFORMS = ['u_matrix', 'u_mu', 'u_unit', 'u_lane', 'u_body', 'u_night', 'u_alpha', 'u_shadow', 'u_railH', 'u_water', 'u_wcol', 'u_time', 'u_shift', 'u_lit', 'u_glowK', 'u_line', 'u_light', 'u_tint', 'u_glow', 'u_shade', 'u_col', 'u_route', 'u_veil'];
const ATTRS = [[0, 3, 0], [1, 2, 3], [2, 2, 5], [3, 2, 7], [4, 2, 9], [5, 2, 11], [6, 2, 13], [7, 2, 15], [8, 2, 17], [9, 1, 19], [10, 1, 20]];

export class CityViaduct {
  constructor({ pack = SEOUL, net } = {}) {
    this.pack = pack; this.V = V_OF(pack); this.net = net; this.cache = new Map(); this.plats = new Map(); this.bytes = 0; this.frame = 0; this.stats = {}; this.edges = null; this.edgeIndex = null; this.gl = null; this.broken = false; this.rgb = new Map();
    this.levels = null; this.levelsVersion = 0; this.exitLayouts = new Map();
  }
  get railM() { return this.V.railHeightM }
  // 조선 모드 ↔ 심시티: 팩만 바꾼다. 두 팩의 치수가 같아서(조선 팩은 색 · aqueduct 만 덧쓴다) 지은 조각은 그대로 쓰고 색만 새로
  setPack(pack) { if (!pack || pack === this.pack) return; const was = this.aqueduct; this.pack = pack; this.V = V_OF(pack); this.rgb.clear(); if (this.gl && was !== this.aqueduct) for (const k of [...this.cache.keys()]) if (k.startsWith('pier:')) this.del(k) }   // 교각 모양은 팩마다 다르다(수로: 팔각 통나무)
  get aqueduct() { return !!this.V.aqueduct }
  // 상판을 끊을 구간 (line, lo, hi) → [[f0, f1]…] | null (롤코 모드에서만): 바뀌면 상판 · 레일 · 교각을 다시 짓는다
  setGaps(fn) { this.gapFn = fn || null; this.gapV = (this.gapV || 0) + 1; for (const k of [...this.cache.keys()]) if (/^(deck|det|pier):/.test(k)) this.del(k) }
  gapsOf(e) { return this.gapFn ? this.gapFn(e.line, e.lo, e.hi) : null }
  deckMesh(e, rows, detail, H) {
    const gaps = this.gapsOf(e), parts = !gaps || !gaps.length ? [buildDeck(rows, e.eo, this.V, e.flags, detail, H)] : rowsBetweenGaps(rows, gaps).filter(p => p.length >= 2).map(p => buildDeck(p, e.eo, this.V, e.flags, detail, H));
    for (const st of this.stubsOf(e)) parts.push(buildDeck(st.rows, e.eo, this.V, st.elevated ? [[-Infinity, Infinity]] : null, detail, H));   // 끝역: 승강장 끝까지 늘린 상판
    if (parts.length === 1) return parts[0];
    let n = 0; for (const q of parts) n += q.length; const out = new Float32Array(Math.max(n, STRIDE)); n = 0; for (const q of parts) { out.set(q, n); n += q.length } return out.subarray(0, n);
  }
  // this line's rail height at level 1: the pack's, plus a few centimetres by line so two lines crossing never share a plane (depth fighting in the overlap)
  // (each line its own step, by its place in the fixed line order: lines side by side share a level as one merged deck, and their tops never share a plane)
  railFor(line) {
    if (!this.lineSteps) { const names = Object.keys(this.net?.paths || {}).sort(compareLines); this.lineSteps = new Map(names.map((n, i) => [n, i])) }
    let k = this.lineSteps.get(line); if (k === undefined) { let h = 0; for (let i = 0; i < line.length; i++) h = (h * 31 + line.charCodeAt(i)) >>> 0; k = h % 4 }
    return this.V.railHeightM + k * (this.V.lineStepM ?? .03);
  }
  // the rail height at a station: its level on this line (levels.stepM a level) over the line's base
  stationH(line, id) { const L = this.levelsOf()?.get(line + ':' + id) ?? 1; return this.railFor(line) + (L - 1) * this.V.levels.stepM }
  levelOf(line, id) { return this.levelsOf()?.get(line + ':' + id) ?? 1 }
  // the rail height k of the way from station a to station b (metres), on the edge's profile
  heightAt(line, a, b, k) {
    const e = this.edgeOf(line, a, b); if (!e) return this.railFor(line);
    const rows = this.rowsOf(e), total = rows.length ? rows[rows.length - 1].s : 0, s = (a < b ? k : 1 - k) * total;
    return this.profileOf(e)(Math.max(0, Math.min(total, s)));
  }
  // the edge's path moved onto its street (built offline), or nothing
  snapped(line, lo, hi) { return SNAP[`${line}:${lo}:${hi}`] || null }
  train(zoom, bodyPx) { return trainMetrics(zoom, bodyPx, this.pack) }
  routeOpacity(focus) { return routeOpacityExpr(focus, this.pack) }
  deckFade() { const [z0, z1] = this.V.lod.deck; return ['interpolate', ['linear'], ['zoom'], z0, 1, z1, 0] }   // 길찾기 탄 구간의 땅 위 선: 상판이 나오면 사라진다
  // where a thing hM metres up casts its shadow: away from the sun by its height (mercator units; nothing when the sun is down)
  shadowShift(sun, hM = this.V.railHeightM) {
    const V = this.V; if (!sun || !(sun.elevation > 2)) return [0, 0];
    const away = (sun.azimuth + 180) * Math.PI / 180, L = Math.min(V.shadow.maxLengthM * hM / V.railHeightM, hM / Math.tan(Math.max(sun.elevation, 8) * Math.PI / 180)) * MU;
    return [Math.sin(away) * L, -Math.cos(away) * L];
  }
  // a point at height h (mercator units) on the screen, through the matrix the trains are drawn with (map.project knows no height)
  screen(map, x, y, h) {
    const M = map.painter.transform.getProjectionDataForCustomLayer(true).mainMatrix, w = M[3] * x + M[7] * y + M[11] * h + M[15] || 1e-9;
    const canvas=map.getCanvas();   // bus: shared picking uses CSS pixels; MapLibre exposes no map.transform
    return { x: ((M[0] * x + M[4] * y + M[8] * h + M[12]) / w + 1) / 2 * canvas.clientWidth, y: (1 - (M[1] * x + M[5] * y + M[9] * h + M[13]) / w) / 2 * canvas.clientHeight };
  }
  init(gl) { this.p = compileProgram(gl, VS, FS); this.u = Object.fromEntries(UNIFORMS.map(n => [n, gl.getUniformLocation(this.p, n)])); this.gl = gl; this.MT = new Float32Array(16) }
  // every station-to-station edge of every line, as the runtime draws them (lo → hi)
  edgeList() {
    if (this.edges) return this.edges; const { paths, byId } = this.net, seen = new Set(), out = []; this.edgeIndex = new Map();
    for (const [line, chunks] of Object.entries(paths || {})) for (const ids of chunks) for (let i = 1; i < ids.length; i++) {
      const lo = Math.min(ids[i - 1], ids[i]), hi = Math.max(ids[i - 1], ids[i]), id = `${line}:${lo}:${hi}`; if (seen.has(id) || !byId.has(lo) || !byId.has(hi)) continue; seen.add(id); const e = { id, line, lo, hi, g: null, rows: null }; out.push(e); this.edgeIndex.set(id, e) }
    return this.edges = out;
  }
  edgeOf(line, a, b) { this.edgeList(); return this.edgeIndex.get(`${line}:${Math.min(a, b)}:${Math.max(a, b)}`) || null }
  // 길찾기로 탈 구간 → 고가 구간 id · 타고 내리는 승강장 키(rects 의 line:id). 이웃한 두 역 사이(급행처럼 건너뛰면 그 노선 길을 따라 사이 구간까지).
  // 같은 journey(배열)면 다시 세지 않는다. null → null(길찾기 없음)
  journeyFocus(journey) {
    if (!journey) return this.focus = null;
    if (this.focus?.src === journey) return this.focus;
    const edges = new Set(), stops = new Set();
    for (const { line, stations = [] } of journey) {
      if (stations.length < 2) continue;
      stops.add(line + ':' + stations[0]); stops.add(line + ':' + stations.at(-1));
      for (let k = 1; k < stations.length; k++) {
        const a = +stations[k - 1], b = +stations[k], e = this.edgeOf(line, a, b); if (e) { edges.add(e.id); continue }
        let best = null; for (const ids of this.net.paths?.[line] || []) { const i = ids.indexOf(a), j = ids.indexOf(b); if (i >= 0 && j >= 0 && (!best || Math.abs(i - j) < Math.abs(best[1] - best[2]))) best = [ids, i, j] }
        if (best) { const [ids, i, j] = best; for (let x = Math.min(i, j); x < Math.max(i, j); x++) { const f = this.edgeOf(line, ids[x], ids[x + 1]); if (f) edges.add(f.id) } }
      }
    }
    return this.focus = { src: journey, edges, stops };
  }
  // the edge's rows in local metres — again when the runtime's geometry object changes (the track shapes arrive after the first frames; the simcity path differs)
  rowsOf(e) {
    const g = this.net.geom(e.line, e.lo, e.hi); if (e.g === g && e.rows) return e.rows;
    e.g = g; e.rows = ribbonRows(g.pts.map(q => [(q.x - O.x) / MU, (q.y - O.y) / MU])); e.flags = FLAGS[e.id] || null; e.eo = this.net.offset(e.line, e.lo, e.hi); e.prof = null; e.dense = null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const r of e.rows) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x); y1 = Math.max(y1, r.y) } e.box = [x0, y0, x1, y1]; e.stubKey = null;
    for (const k of ['deck', 'det', 'pier']) this.del(k + ':' + e.id);
    for (const end of this.terminalEnds(e)) { const A = end === 'lo' ? e.rows[0] : e.rows[e.rows.length - 1], k = (end === 'lo' ? -1 : 1) * STUB_MAX_M, x = A.x + A.fx * k, y = A.y + A.fy * k; e.box = [Math.min(e.box[0], x), Math.min(e.box[1], y), Math.max(e.box[2], x), Math.max(e.box[3], y)] }   // 끝역: 늘릴 수 있는 데까지 미리(조각은 승강장 · gaps 에 따라 deckMesh · spots 가 stubsOf 로)
    return e.rows;
  }
  // 끝역(그 노선 이웃이 하나인 역): 승강장이 상판 끝(역 점) 너머로 나간 만큼 상판을 곧게 늘린 조각 — 기본 모드 노선이 끝역 너머로
  // 승강장 반길이만큼 곧게 나가는 것과 같은 자리. 열차가 달리는 구간(rows · 높이 profileOf · heightAt)은 그대로라 끝역 정차 자리는 안 바뀐다.
  // [{end: 'lo'|'hi', ext (m), rows (s: lo 끝 −ext…0, hi 끝 total…total+ext), elevated}] — 롤코 상판이 그 끝에서 끊기면(gaps) 없음
  stubsOf(e) {
    const rows = e.rows, rects = this.net.rects; if (!rows || rows.length < 2 || !rects) return [];
    const key = [e.lo, e.hi].map(id => rects.get(e.line + ':' + id)).concat(this.gapV || 0);
    if (e.stubKey && e.stubKey.length === key.length && e.stubKey.every((k, i) => k === key[i])) return e.stubs;
    const total = rows[rows.length - 1].s, gaps = this.gapsOf(e) || [], out = [];
    for (const end of this.terminalEnds(e)) {
      const id = e[end], rect = rects.get(e.line + ':' + id); if (!rect) continue;
      const f = end === 'lo' ? 0 : 1; if (gaps.some(([a, b]) => f >= a && f <= b)) continue;
      const A = end === 'lo' ? rows[0] : rows[rows.length - 1], ox = end === 'lo' ? -A.fx : A.fx, oy = end === 'lo' ? -A.fy : A.fy;   // outward along the deck's end
      let ext = 0; for (const r of this.platGeom(rect).rows) ext = Math.max(ext, (r.x - A.x) * ox + (r.y - A.y) * oy);
      ext = Math.min(ext, STUB_MAX_M); if (ext < 1) continue;
      const st = end === 'lo' ? [rowAtX(rows, -ext), rowAtX(rows, 0)] : [rowAtX(rows, total), rowAtX(rows, total + ext)];
      out.push({ end, ext, rows: st, elevated: elevatedAt(e.flags, f) });
    }
    if (e.stubKey) (this.staleKeys ||= []).push(...['deck', 'det', 'pier'].map(k => [k + ':' + e.id, this.frame]));   // 승강장이 바뀌었다: 다음 프레임 첫머리(levelsOf)에 지우고 다시 짓는다(이 프레임에 꺼낸 조각은 그대로 그린다)
    e.stubs = out; e.stubKey = key; return out;
  }
  // 이 구간의 끝 중 그 노선의 끝역인 쪽('lo' · 'hi'): 그 노선 이웃이 하나뿐인 역(갈래 끝 포함, 기본 모드 terminalStops 와 같은 규칙)
  terminalEnds(e) {
    if (!this.nbr) { this.nbr = new Map(); for (const x of this.edgeList()) for (const id of [x.lo, x.hi]) { const k = x.line + ':' + id; this.nbr.set(k, (this.nbr.get(k) || 0) + 1) } }
    return ['lo', 'hi'].filter(end => this.nbr.get(e.line + ':' + e[end]) === 1);
  }
  // the edge's height profile: flat at each station's level, one gentle ramp between when they differ
  profileOf(e) {
    this.stubsOf(e);   // 끝역 조각이 승강장 · gaps 와 맞는지(키 비교만, 렌더가 구간마다 부른다)
    if (e.prof && e.profV === this.levelsVersion) return e.prof;
    const rows = this.rowsOf(e), total = rows.length ? rows[rows.length - 1].s : 0, hLo = this.stationH(e.line, e.lo), hHi = this.stationH(e.line, e.hi), humps = this.humps?.get(e.id) || null;
    e.prof = edgeProfile(hLo, hHi, total, this.platLength(e.line, e.lo) / 2, this.platLength(e.line, e.hi) / 2, this.pack, humps); e.profV = this.levelsVersion; e.ramp = Math.abs(hLo - hHi) > 1e-6 || !!(humps && humps.length);
    return e.prof;
  }
  platLength(line, id) { const r = this.net.rects?.get(line + ':' + id); return r ? this.platGeom(r).L : 2 * 90 * .5 }
  // the rows the deck is built on: cut to short pieces where the edge ramps, so the ramp bends smoothly
  deckRows(e) { this.profileOf(e); if (!e.ramp) return e.rows; return e.dense || (e.dense = densify(e.rows, 12)) }
  // the levels of every line:station (city_viaduct_levels.mjs), from the station rectangles; again when they change
  levelsOf() {
    if (this.staleKeys?.length) this.staleKeys = this.staleKeys.filter(([k, f]) => f >= this.frame || (this.del(k), false));   // stubsOf 가 낡았다고 한 조각: 지난 프레임 것만(렌더 도중 stationH 로 불려도 이 프레임 조각은 안 지운다)
    const rects = this.net.rects; if (!rects || !rects.size || this.resolving) return this.levels;
    if (this.levels && this.levelRects === rects && this.levelCount === rects.size && !this.levelsDirty) return this.levels;
    const t0 = performance.now(), Lv = this.V.levels, lines = new Map(); for (const k of rects.keys()) { const id = k.slice(k.lastIndexOf(':') + 1); lines.set(id, (lines.get(id) || 0) + 1) }
    const edgeLen = (line, a, b) => { const e = this.edgeOf(line, a, b); if (!e) return 1e9; const r = this.rowsOf(e); return r.length ? r[r.length - 1].s : 1e9 }, single = id => (lines.get(String(id)) || 0) <= 1;
    const build = floors => { const L = stationLevels(rects, toM, Lv.overlapM, floors, Lv.crossAngleDeg ?? 25); holdLevels(L, this.net.paths, edgeLen, Lv.holdM, single); return L };
    this.resolving = true;
    try {
      this.levels = build(null); this.humps = new Map(); this.levelsVersion++; this.levelRects = rects; this.levelCount = rects.size; this.levelsDirty = false;
      // 1) the stations' levels; 2) every place two decks cross or run together between stations (edgeOverlaps), separated by
      //    humps on the later line or, where the hump's ramp has no room before the platform, that station's level (floors)
      const all = this.edgeList().filter(e => this.rowsOf(e).length >= 2), byId = new Map(all.map(e => [e.id, e]));
      this.regions = edgeOverlaps(all, Lv.crossM ?? 24);
      const env = { edges: byId, profile: e => this.profileOf(e), stationH: (line, id) => this.stationH(line, id), platHalf: (line, id) => this.platLength(line, id) / 2, base: line => this.railFor(line), levelH: (line, level) => this.railFor(line) + (level - 1) * Lv.stepM,
        apply: (floors, humps) => { this.levels = build(floors); this.humps = humps; this.levelsVersion++ } };
      const r = resolveCrossings(this.regions, env, this.pack); this.floors = r.floors; this.humps = r.humps; this.levelNotes = r.notes;
      this.sameLevel = sameLevelRegions(this.regions, env, this.pack); this.parallel = this.regions.filter(r => (r.ang ?? 90) < (Lv.crossAngleDeg ?? 25)).length;
    } finally { this.resolving = false }
    this.levelsVersion++; this.levelsMs = +(performance.now() - t0).toFixed(1);
    for (const k of [...this.cache.keys()]) this.del(k); this.plats.clear(); this.exitLayouts.clear();   // every height may have changed
    return this.levels;
  }
  // the platform along the rect's line (the runtime's ribbon follows the deck through a bend; a straight rect is two points):
  // rows — its own stretch of that line, plat of it about the middle; row — the frame at its middle (the exits are laid out in it)
  platGeom(rect) {
    const all = ribbonRows(rect.coords.map(q => toM(q[0], q[1]))), total = all.length > 1 ? all[all.length - 1].s : 0;
    if (total < 1e-6) { const q = toM(rect.coords[0][0], rect.coords[0][1]); all.splice(0, all.length, { x: q[0], y: q[1], fx: 1, fy: 0, rx: 0, ry: 1, s: 0 }, { x: q[0] + 1, y: q[1], fx: 1, fy: 0, rx: 0, ry: 1, s: 1 }) }
    const d = all[all.length - 1].s, L = Math.max(20, d * Math.max(.1, Math.min(1, rect.plat || 1))), rows = sliceRows(all, d / 2 - L / 2, d / 2 + L / 2), m = rowAt(all, d / 2), row = { x: m.x, y: m.y, fx: m.fx, fy: m.fy, rx: m.rx, ry: m.ry };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const r of rows) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x); y1 = Math.max(y1, r.y) }
    return { rect, row, rows, L, H: d / 2, box: [x0 - 30, y0 - 30, x1 + 30, y1 + 30] };
  }
  spots(e, life) {
    const rows = e.rows, P = this.V.pier, H = this.profileOf(e), obs = this.pierObstacles(e), total = rows[rows.length - 1].s, gaps = (this.gapsOf(e) || []).map(([a, b]) => [a * total - 4, b * total + 4]);
    const sp = pierSpots(rows[rows.length - 1].s, P.everyM, P.searchM, hashi(e.lo, e.hi, 7), s => {
      const q = rowAt(rows, s);
      if (obs.length) { const h = H(s); for (const o of obs) if (h > o.h + 1 && pointSegmentDistance([q.x, q.y], o.seg[0], o.seg[1]) < o.half) return false }   // no pier of an upper deck down through a lower line's station
      const r = life.inBuilding(q.x, q.y); return r === undefined ? undefined : !r });
    if (gaps.length) sp.spots = sp.spots.filter(x => !gaps.some(([a, b]) => x >= a && x <= b));   // 상판이 끊긴 곳(롤코 레일이 떠난 곳)엔 교각 없음
    for (const st of this.stubsOf(e)) {   // 끝역에서 늘린 상판 밑: 같은 규칙으로(끝에서 8 m 안쪽, 건물 밖)
      const at = t => st.end === 'lo' ? -st.ext + t : total + st.ext - t, ok = t => { const s = at(t), q = rowAtX(rows, s); if (obs.length) { const h = H(s); for (const o of obs) if (h > o.h + 1 && pointSegmentDistance([q.x, q.y], o.seg[0], o.seg[1]) < o.half) return false } const r = life.inBuilding(q.x, q.y); return r === undefined ? undefined : !r };
      const more = pierSpots(st.ext, P.everyM, P.searchM, hashi(e.lo, e.hi, st.end === 'lo' ? 11 : 13), ok); sp.spots.push(...more.spots.map(at)); if (more.unknown) sp.unknown = true;
    }
    return sp;
  }
  // the other lines' station structures at this edge's two stations: an upper deck's piers keep out of them
  pierObstacles(e) {
    const out = [], rects = this.net.rects; if (!rects) return out; const half = platformEdgeM(17, this.net.bodyPx ? this.net.bodyPx(17) : 26, this.pack) + 2;
    for (const id of [e.lo, e.hi]) for (const [k, rect] of rects) {
      const i = k.lastIndexOf(':'); if (k.slice(i + 1) !== String(id)) continue; const ln = k.slice(0, i); if (ln === e.line) continue;
      const g = this.plats.get(k)?.rect === rect ? this.plats.get(k) : this.platGeom(rect), R = g.rows, h = this.stationH(ln, id);
      for (let j = 1; j < R.length; j++) out.push({ seg: [[R[j - 1].x, R[j - 1].y], [R[j].x, R[j].y]], half, h });   // along the platform, through its bend
    }
    for (const hm of this.humps?.get(e.id) || []) {   // the deck this one crosses over: no pier down onto it
      const o = this.edgeIndex?.get(hm.over); if (!o || !o.rows) continue; const R = o.rows, s0 = Math.max(0, hm.so0 - 12), s1 = Math.min(R[R.length - 1].s, hm.so1 + 12), n = Math.max(1, Math.ceil((s1 - s0) / 10));
      for (let k = 0; k < n; k++) { const a = rowAt(R, s0 + (s1 - s0) * k / n), b = rowAt(R, s0 + (s1 - s0) * (k + 1) / n); out.push({ seg: [[a.x, a.y], [b.x, b.y]], half: 11, h: -1e9 }) }
    }
    return out;
  }
  // ── the exits: each of the station's exits reaches the nearest platform drawn; laid out in that platform's frame ──
  exitLayout(key, p, line, id, life, solo, selected) {
    const X = this.V.exits, S = this.V.station, net = this.net, list = net.exits?.[id]; if (!list || !list.length) return null;
    const r = p.row, frame = (x, y) => ({ t: (x - r.x) * r.fx + (y - r.y) * r.fy, u: (x - r.x) * r.rx + (y - r.y) * r.ry });
    // the station's platforms drawn (all lines, or the selected one): an exit goes to the nearest; the others' decks are in the way of a stair
    const others = [], mine = []; for (const [k, rect] of net.rects) { const i = k.lastIndexOf(':'); if (k.slice(i + 1) !== String(id)) continue; const ln = k.slice(0, i); if (solo && ln !== selected) continue; const g = this.plats.get(k)?.rect === rect ? this.plats.get(k) : this.platGeom(rect); (ln === line ? mine : others).push({ line: ln, g, h: this.stationH(ln, id) }) }
    const segOf = g => { const c = g.row, h = g.L / 2; return [[c.x - c.fx * h, c.y - c.fy * h], [c.x + c.fx * h, c.y + c.fy * h]] };
    const exits = [];
    for (const [lon, lat, ref] of list) {
      const [x, y] = toM(lon, lat); let best = Infinity, bestLine = line;
      for (const o of [...mine, ...others]) { const d = pointSegmentDistance([x, y], ...segOf(o.g)) + (this.levelOf(o.line, id) - 1) * (X.levelPenaltyM ?? 40); if (d < best) { best = d; bestLine = o.line } }   // the nearest platform, the lower levels preferred: a stair from an upper one would have to come down through the lower line's station
      if (bestLine !== line) continue;
      exits.push({ ref: String(ref), ...frame(x, y), lon, lat });
    }
    if (!exits.length) return { items: [], unknown: false, top: 0, P: null };
    const bp = z => net.bodyPx ? net.bodyPx(z) : 28, zf = X.farZoom ?? 16, zc = X.checkZoom ?? 18, eoM = (p.rect.offset || 0) * MPP(zf);
    const top = this.stationH(line, id) + S.platformRiseM, P = { L: p.L, H: p.H, eoM, Wfar: platformEdgeM(zf, bp(zf), this.pack), W: platformEdgeM(zc, bp(zc), this.pack), W2: platformEdgeM(zc + .5, bp(zc + .5), this.pack), top };
    const ground = (t, u) => { const x = r.x + r.fx * t + r.rx * u, y = r.y + r.fy * t + r.ry * u, b = life.inBuilding(x, y); return b === undefined ? undefined : !b };
    const corr = P.W + X.clearanceM, Oth = others.map(o => ({ seg: segOf(o.g), lo: o.h - this.V.deckThicknessM - this.V.pier.capDepthM - 1, hi: o.h + S.platformRiseM + S.canopyHeightM + 1.5 }));
    const blocked = (t, u, h) => { if (!Oth.length) return false; const x = r.x + r.fx * t + r.rx * u, y = r.y + r.fy * t + r.ry * u; for (const o of Oth) if (h > o.lo && h < o.hi && pointSegmentDistance([x, y], o.seg[0], o.seg[1]) < corr) return true; return false };
    const lay = layoutExits(P, exits, this.V, ground, blocked); lay.top = top; lay.P = P; lay.exits = exits; return lay;
  }
  // ── the GPU cache: one VAO + buffer a piece, least recently drawn out first past the pack's budget ──
  get(k) { const a = this.cache.get(k); if (a) { this.cache.delete(k); this.cache.set(k, a); a.f = this.frame } return a }
  put(k, data) {
    const gl = this.gl, vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    for (const [loc, n, off] of ATTRS) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE * 4, off * 4) } gl.bindVertexArray(null);
    const a = { vao, b, n: data.length / STRIDE, bytes: data.byteLength, f: this.frame }; this.cache.set(k, a); this.bytes += a.bytes; return a;
  }
  del(k) { const a = this.cache.get(k); if (!a) return; this.gl.deleteVertexArray(a.vao); this.gl.deleteBuffer(a.b); this.bytes -= a.bytes; this.cache.delete(k) }
  lineRGB(line, theme) { const k = line + theme; let c = this.rgb.get(k); if (!c) { c = toneRGB(hexRgb(this.net.colors[line] || '#888888'), this.pack, 'simcity', theme); this.rgb.set(k, c) } return c }

  render(gl, matrix, opts = {}) {
    if (this.broken) return false;
    try { if (!this.gl) this.init(gl); return this._render(gl, matrix, opts) }
    catch (e) { this.broken = true; console.error('city-viaduct: off —', e); try { gl.bindVertexArray(null); gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE) } catch {} return false }
  }
  _render(gl, matrix, opts) {
    const { now = performance.now(), zoom = 15, dark = false, phone = false, bounds, sun, life = null, selected = 'all', moving = false, bodyPx = 7, journey = null } = opts, V = this.V, pack = this.pack, theme = dark ? 'dark' : 'light';
    if (!bounds || zoom < V.lod.deck[0] || !this.net?.paths) { this.stats = { idle: true }; return false }
    const t0 = performance.now(); this.frame++;
    const mpp = MPP(zoom), unit = 1 / (512 * 2 ** zoom), W = deckWidths(zoom, bodyPx, pack), halfPx = W.lane + W.body * .5 + V.marginPx;
    const box = [(bounds[0] - O.x) / MU, (bounds[1] - O.y) / MU, (bounds[2] - O.x) / MU, (bounds[3] - O.y) / MU], pad = (halfPx * 2 + V.pier.capOverhangPx) * mpp + 40;
    const inView = (b, extra = 0) => !(b[2] < box[0] - pad - extra || b[0] > box[2] + pad + extra || b[3] < box[1] - pad - extra || b[1] > box[3] + pad + extra);
    const budget = moving ? V.performance.buildMsMoving : V.performance.buildMs, time = () => performance.now() - t0 < budget;
    const wantDet = zoom >= V.lod.beds && !V.aqueduct, wantPiers = zoom >= V.lod.piers && !!life, solo = selected !== 'all', draw = [], plats = [], exitsDraw = [];
    let pending = false, piers = 0, open = 0, levelsOn = 0;
    this.levelsOf();   // the stations' levels, before anything is built on them
    const J = this.journeyFocus(journey);   // 길찾기로 탈 구간 · 타고 내리는 승강장(그 둘은 상판이 나오는 줌부터 그린다 — 땅 위 표시점이 상판과 함께 사라지므로)
    for (const e of this.edgeList()) {
      if (solo && e.line !== selected) continue; const rows = this.rowsOf(e); if (rows.length < 2 || !inView(e.box)) continue;
      const it = { e, deck: this.get('deck:' + e.id), det: null, pier: null }, H = this.profileOf(e), dr = this.deckRows(e); if (e.ramp) levelsOn++;
      if (!it.deck) { if (time()) it.deck = this.put('deck:' + e.id, this.deckMesh(e, dr, false, H)); else pending = true }
      if (wantDet) { it.det = this.get('det:' + e.id); if (!it.det) { if (time()) it.det = this.put('det:' + e.id, this.deckMesh(e, dr, true, H)); else pending = true } }
      if (wantPiers) {
        const k = 'pier:' + e.id; let c = this.get(k);
        if (c && c.partial && now - c.at > 1500 * 2 ** Math.min(c.tries || 0, 5) && time()) { this.pierTries = (c.tries || 0) + 1; this.del(k); c = null }   // a tile has had time to come: place the piers it was waiting for (again more and more rarely)
        if (!c) { if (time()) { const sp = this.spots(e, life); c = this.put(k, buildPiers(rows, sp.spots, e.eo, V, e.flags, H)); c.partial = sp.unknown; c.at = now; c.count = sp.spots.length; c.spots = sp.spots; c.tries = this.pierTries || 0; this.pierTries = 0 } else pending = true }
        if (c) { it.pier = c; piers += c.count || 0; if (c.partial) open++ }
      }
      draw.push(it);
    }
    const wantExits = V.exits.enabled !== false && zoom >= V.lodExits.stairs && !!life && this.net.exits,   // exits.enabled: false — 출구 계단 · 통로를 만들지 않음(2026-10-05, 출구는 노선색 기둥만)
    exitDetail = zoom >= V.lodExits.steps; let exitsOut = 0, exitsSkipped = 0, exitsOpen = 0;
    if ((zoom >= V.lod.platforms || J?.stops.size) && this.net.rects) for (const [key, rect] of this.net.rects) {
      const i = key.lastIndexOf(':'), line = key.slice(0, i), id = key.slice(i + 1); if (solo && line !== selected) continue;
      if (zoom < V.lod.platforms && !J.stops.has(key)) continue;
      let p = this.plats.get(key); if (!p || p.rect !== rect) { if (p) this.levelsDirty = true; p = this.platGeom(rect); this.plats.set(key, p); this.del('plat:' + key); this.del('plat:' + key + ':d'); this.exitLayouts.delete(key) }
      if (!inView(p.box, wantExits ? V.exits.maxM : 0)) continue;
      const hT = this.stationH(line, id), detail = zoom >= V.lod.posts, k = 'plat:' + key + (detail ? ':d' : ''); let c = this.get(k);
      if (!c) { if (time()) c = this.put(k, buildPlatform(p, rect.offset || 0, V, detail, hT)); else pending = true }
      if (c) plats.push([c, line, key]);
      if (!wantExits) continue;
      const ek = 'ex:' + key + (solo ? ':s' : ':a') + (exitDetail ? ':d' : ''); let x = this.get(ek);
      if (x && x.partial && now - x.at > 1500 * 2 ** Math.min(x.tries || 0, 5) && time()) { const tries = (x.tries || 0) + 1; this.del(ek); this.exitLayouts.delete(key + (solo ? ':s' : ':a')); x = null; this.exitTries = tries }   // a tile may still come: built again, more and more rarely
      if (!x) {
        if (time()) {
          const lk = key + (solo ? ':s' : ':a'); let lay = this.exitLayouts.get(lk); if (!lay || lay.partial) { lay = this.exitLayout(key, p, line, id, life, solo, selected); if (lay) { lay.partial = lay.unknown; this.exitLayouts.set(lk, lay) } }
          if (lay && lay.items.length) { x = this.put(ek, buildExits(lay, p.row, rect.offset || 0, V, exitDetail)); x.partial = lay.unknown; x.at = now; x.count = lay.items.filter(q => !q.skip).length; x.skipped = lay.items.filter(q => q.skip).length; x.lay = lay; x.tries = this.exitTries || 0 }
          else x = this.put(ek, new Float32Array(0));
          this.exitTries = 0;
        } else pending = true;
      }
      if (x) { exitsDraw.push([x, line]); exitsOut += x.count || 0; exitsSkipped += x.skipped || 0; if (x.partial) exitsOpen++ }
    }
    const cap = phone ? V.performance.phoneBytes : V.performance.bytes;
    for (const [k, a] of this.cache) { if (this.bytes <= cap || a.f === this.frame) break; this.del(k) }
    this.stats = { edges: draw.length, ramps: levelsOn, platforms: plats.length, piers, open, exits: exitsOut, exitsSkipped, exitsOpen, pieces: this.cache.size, mb: +(this.bytes / 1e6).toFixed(1), pending, ms: +(performance.now() - t0).toFixed(1), levelsMs: this.levelsMs, crossings: this.regions?.length, sameLevel: this.sameLevel?.length };
    if (!draw.length && !plats.length) return pending;
    const route = (k, set) => !J ? 0 : set.has(k) ? 1 : 2;   // 길찾기: 1 탄 구간 · 승강장, 2 나머지(흐리게)
    // ── draw ──
    const MT = this.MT; for (let i = 0; i < 16; i++) MT[i] = matrix[i]; for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r] * O.x + matrix[4 + r] * O.y + matrix[12 + r];
    const Lg = pack.lighting?.[theme] || {}, ref = pack.lighting?.referenceSun || { azimuthDeg: 225, elevationDeg: 42 }, az = (sun?.azimuth ?? ref.azimuthDeg) * Math.PI / 180, el = Math.max(sun?.elevation ?? ref.elevationDeg, 12) * Math.PI / 180;
    const col = h => toneRGB(hexRgb(h), pack, 'simcity', theme), C = V.colors[theme] || V.colors.light, u = this.u, N = V.night;
    gl.useProgram(this.p); gl.uniformMatrix4fv(u.u_matrix, false, MT); gl.uniform1f(u.u_mu, MU); gl.uniform1f(u.u_unit, unit); gl.uniform1f(u.u_lane, W.lane); gl.uniform1f(u.u_body, W.body); gl.uniform1f(u.u_railH, V.railHeightM);
    gl.uniform3f(u.u_light, Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)); gl.uniform2f(u.u_lit, Lg.ambient ?? .64, Lg.directional ?? .36); gl.uniform3fv(u.u_tint, hexRgb(Lg.color || '#ffffff'));
    gl.uniform1f(u.u_night, dark ? 1 : 0); gl.uniform3fv(u.u_glow, col(N.glow)); gl.uniform4f(u.u_glowK, N.underK, N.platformK, N.stairK ?? .5, N.walkK ?? .35); gl.uniform3fv(u.u_shade, hexRgb(pack.lighting?.shadow?.color || '#394D4B'));
    gl.uniform3fv(u.u_col, new Float32Array(COLOR_KEYS.flatMap(k => col(C[k] || C.concrete)))); gl.uniform1f(u.u_alpha, 1); gl.uniform1f(u.u_shadow, 0); gl.uniform2f(u.u_shift, 0, 0);
    const Q = V.aqueduct; gl.uniform1f(u.u_water, Q ? 1 : 0); gl.uniform3fv(u.u_wcol, col(Q ? Q.water[theme] || Q.water.light : '#000000')); gl.uniform1f(u.u_time, (now % 1e6) / 1000);   // 조선 수로: 물 색 · 물결 시각
    gl.uniform1f(u.u_route, 0); gl.uniform3fv(u.u_veil, dark ? [.043, .047, .055] : [.984, .98, .957]);   // journey-veil 의 색(#0b0c0e · #fbfaf4)
    gl.bindVertexArray(null); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    const one = a => { if (!a.n) return; gl.bindVertexArray(a.vao); gl.drawArrays(gl.TRIANGLES, 0, a.n) };
    // 1) its shadow on the streets (each thing's height, away from the sun), under whatever stands on them
    if (!dark && sun && sun.elevation > 2 && zoom >= V.shadow.minZoom) {
      const [sx, sy] = this.shadowShift(sun); gl.uniform1f(u.u_shadow, 1); gl.uniform2f(u.u_shift, sx, sy); gl.uniform1f(u.u_alpha, (pack.modes?.simcity?.shadowOpacity?.light ?? .18) * V.shadow.opacityK);
      gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      for (const it of draw) if (it.deck) one(it.deck); for (const [c] of plats) one(c); for (const [c] of exitsDraw) one(c);
      gl.depthMask(true); gl.disable(gl.BLEND); gl.uniform1f(u.u_shadow, 0); gl.uniform1f(u.u_alpha, 1);
    }
    // 2) the viaduct, each edge with its line's colour on the parapets; the platforms and stairs with theirs on the roof edges
    for (const it of draw) { gl.uniform3fv(u.u_line, this.lineRGB(it.e.line, theme)); gl.uniform1f(u.u_route, route(it.e.id, J?.edges)); if (it.deck) one(it.deck); if (it.det) one(it.det); if (it.pier) one(it.pier) }
    for (const [c, line, key] of plats) { gl.uniform3fv(u.u_line, this.lineRGB(line, theme)); gl.uniform1f(u.u_route, route(key, J?.stops)); one(c) }
    gl.uniform1f(u.u_route, J ? 2 : 0);
    for (const [c, line] of exitsDraw) { gl.uniform3fv(u.u_line, this.lineRGB(line, theme)); one(c) }
    gl.uniform1f(u.u_route, 0); gl.bindVertexArray(null); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    return pending;
  }
  // the piers now standing (local metres), for checks
  debugPiers() { const out = []; if (!this.edges) return out; for (const e of this.edges) { const a = this.cache.get('pier:' + e.id); if (!a || !a.spots) continue; for (const s of a.spots) { const q = rowAt(e.rows, s); out.push([e.id, q.x, q.y]) } } return out }
  // the exits laid out (per platform drawn): each exit's status, and the footprint's sample points in lon/lat with heights, for checks
  debugExits() {
    const out = [];
    for (const [k, a] of this.cache) {
      if (!k.startsWith('ex:') || !a.lay) continue; const key = k.slice(3).split(':'), line = key[0], id = key[1], p = this.plats.get(line + ':' + id); if (!p) continue;
      const r = p.row, ll = (t, u) => toLL(r.x + r.fx * t + r.rx * u, r.y + r.fy * t + r.ry * u);
      const items = a.lay.items.map(it => it.skip ? { ref: it.ref, skip: it.skip } : { ref: it.ref, far: it.far, walk: !!it.walk, bridge: !!it.bridge, posts: (it.posts || []).length });
      const samples = a.lay.P ? exitSamples(a.lay, a.lay.P, this.V).map(s => ({ ref: s.ref, part: s.part, h: +s.h.toFixed(1), ll: ll(s.t, s.u).map(v => +v.toFixed(6)) })) : [];
      out.push({ line, id, level: this.levelOf(line, id), top: a.lay.top, items, samples, partial: !!a.partial });
    }
    return out;
  }
  // does this exit (of station id, at lon/lat) have a stair standing? true / false (none placed, or blocked) / undefined (not laid out yet)
  hasStair(id, lon, lat) {
    let seen = false;
    for (const [k, a] of this.cache) {
      if (!k.startsWith('ex:') || !a.lay || k.split(':')[2] !== String(id)) continue; seen = true;
      const ex = a.lay.exits?.find(e => e.lon === lon && e.lat === lat); if (!ex) continue;
      const it = a.lay.items.find(q => q.ref === ex.ref); return !!it && !it.skip;
    }
    return seen ? false : undefined;
  }
  // every crossing between decks (regions), the humps and raised stations that separate them, and any still at one level, for checks
  debugCrossings() {
    this.levelsOf(); const mid = (e, s0, s1) => { const q = rowAt(e.rows, (s0 + s1) / 2); return toLL(q.x, q.y).map(v => +v.toFixed(6)) };
    const humps = []; for (const [id, list] of this.humps || []) { const e = this.edgeIndex.get(id); if (!e) continue; for (const h of list) humps.push({ edge: id, over: h.over, s0: +h.s0.toFixed(0), s1: +h.s1.toFixed(0), h: +h.h.toFixed(2), ll: mid(e, h.s0, h.s1) }) }
    const same = (this.sameLevel || []).map(r => { const e = this.edgeIndex.get(r.a); return { ...r, ll: e ? toLL(rowAt(e.rows, r.sa).x, rowAt(e.rows, r.sa).y).map(v => +v.toFixed(6)) : null } });
    return { regions: this.regions?.length || 0, parallel: this.parallel || 0, humps, floors: [...(this.floors || [])], notes: this.levelNotes || [], sameLevel: same, ms: this.levelsMs };
  }
  // every line:station with a level above the first, for checks
  debugLevels() { const out = []; for (const [k, L] of this.levelsOf() || []) if (L > 1) out.push([k, L]); return out }
  dispose(gl) { if (!this.gl) return; for (const k of [...this.cache.keys()]) this.del(k); gl.deleteProgram(this.p); this.gl = null }
}
export default CityViaduct;
