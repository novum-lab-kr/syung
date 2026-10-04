// 심시티 고가 (viaduct) — in the simcity mode every line rides a viaduct over the streets, the way 2호선 does at 건대입구:
// a concrete deck with the line's colour along its parapets, on single piers that stand only on the roads and the open
// ground (never inside a building's footprint: a pier that would is moved along the track, or left out), with roofed
// side platforms at the stations. The trains run on the deck (the runtime lifts them to the same height, railM).
// Drawn on the train overlay canvas after the buildings have written their depth, so a tall building hides the deck
// behind it and a low one passes under it, exactly as with the trains. Stretches that really are elevated (OSM
// bridge=*, web/lib/city_viaduct_flags.mjs) get a slightly darker concrete; the rest looks the same, only lifted.
// Every colour, metre and zoom comes from the style pack (pack.viaduct).
//
//   const v = new CityViaduct({pack, net});
//   v.train(zoom, bodyPx) → {bodyPx, lanePx}      // the trains' width and lane offset in this mode (the deck is cut to them)
//   v.railM                                       // the rail height in metres (the runtime lifts the trains by it)
//   v.render(gl, matrix, {now, zoom, dark, phone, pixelRatio, bounds, sun, life, selected, moving, bodyPx}) → true while still building
//   v.screen(map, x, y, h)   v.shadowShift(sun)   v.routeOpacity(focus)   v.dispose(gl)
//
//   net: the runtime's network — {paths, byId, geom(line,lo,hi) → {pts: [MercatorCoordinate…]}, offset(line,lo,hi) → px,
//        colors, rects: Map(line:stationId → {coords, offset, plat})}
//   life: the CityLife instance (its cells know the building footprints; piers wait for a cell before they stand)
//
// Widths across the track are in CSS px (the trains are px-sized, the deck must carry them), heights and the piers'
// footprints in metres with a px floor so they never vanish. Zoomed out, where no cars drive, the deck is slimmer than
// the trains, which overhang it as they overhang the route line in the other modes.

import SEOUL from './city_style_seoul.mjs';
import FLAGS from './city_viaduct_flags.mjs';
import { toneRGB, hexRgb, MPP } from './city_style.mjs';
import { compileProgram, hashi } from './city_traffic.mjs';
import { MU, MERC_ORIGIN as O, toM } from './city_life.mjs';

const V_OF = pack => pack.viaduct || SEOUL.viaduct;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) };
// materials (the shader's u_col index; PARAPET and FASCIA take the line's colour)
export const MAT = { TOP: 0, SIDE: 1, UNDER: 2, PARAPET: 3, PIER: 4, BED: 5, RAIL: 6, FLOOR: 7, ROOF: 8, ROOF_UNDER: 9, POST: 10, FASCIA: 11 };
const COLOR_KEYS = ['concrete', 'concrete', 'under', 'concrete', 'pier', 'bed', 'rail', 'platform', 'roof', 'roofUnder', 'post', 'concrete'];

// ── pure helpers (the tests use them too) ────────────────────────────────────────────────────────
// the trains in this mode: the body the runtime gives (its slim coaster width) and a lane half a body plus the pack's gap off the line
export function trainMetrics(zoom, bodyPx, pack = SEOUL) { const V = V_OF(pack); return { bodyPx, lanePx: bodyPx / 2 + V.train.laneGapPx } }
// the deck's lane and body (px) at this zoom: the trains' own where cars drive on the streets, slimmer zoomed out
export function deckWidths(zoom, bodyPx, pack = SEOUL) {
  const V = V_OF(pack), { lanePx } = trainMetrics(zoom, bodyPx, pack), k = smooth(V.widthZoom[0], V.widthZoom[1], zoom);
  return { lane: V.lowZoomLanePx + (lanePx - V.lowZoomLanePx) * k, body: V.lowZoomBodyPx + (bodyPx - V.lowZoomBodyPx) * k };
}
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
// is the point at fraction t of the edge on a real bridge (ranges from city_viaduct_flags.mjs)
export function elevatedAt(ranges, t) { if (ranges) for (const [a, b] of ranges) if (t >= a && t <= b) return true; return false }
// the ground route line's opacity in this mode: it fades out as the deck takes over
export function routeOpacityExpr(focus, pack = SEOUL) { const [z0, z1] = V_OF(pack).lod.deck; return ['interpolate', ['linear'], ['zoom'], z0, focus ? .25 : .9, z1, 0] }

// ── meshes ──────────────────────────────────────────────────────────────────────────────────────
// 20 floats a vertex: x y (local m) h (m) · R · F · px across, px along · ×lane, ×body (px across) · m across, m along
// (centre) · half size across, along (m, signed) · their px floors (signed) · material, shade · normal code (0 up, ±1 ±R, ±2 ±F, 3 down)
export const STRIDE = 20;
class Mesh {
  constructor(n) { this.d = new Float32Array(Math.max(STRIDE, n * STRIDE)); this.o = 0 }
  v(r, h, px, kl, kb, apx, lm, am, szl, sza, lp, ap, mat, shade, n) {
    if (this.o + STRIDE > this.d.length) { const g = new Float32Array(this.d.length * 2); g.set(this.d); this.d = g }
    const d = this.d, o = this.o; this.o += STRIDE;
    d[o] = r.x; d[o + 1] = r.y; d[o + 2] = h; d[o + 3] = r.rx; d[o + 4] = r.ry; d[o + 5] = r.fx; d[o + 6] = r.fy; d[o + 7] = px; d[o + 8] = apx; d[o + 9] = kl; d[o + 10] = kb;
    d[o + 11] = lm; d[o + 12] = am; d[o + 13] = szl; d[o + 14] = sza; d[o + 15] = lp; d[o + 16] = ap; d[o + 17] = mat; d[o + 18] = shade; d[o + 19] = n;
  }
  quad(a, b, c, d) { for (const q of [a, b, c, a, c, d]) this.v(...q) }
  data() { return this.d.subarray(0, this.o) }
}
// the deck along an edge: base = top, underside, sides and the parapets; detail = the two track beds and their rails
export function buildDeck(rows, eo, V, flags, detail, hT = V.railHeightM) {
  const M = new Mesh(rows.length * (detail ? 36 : 60)), hB = hT - V.deckThicknessM, hP = hT + V.parapetHeightM, mg = V.marginPx, pp = V.parapetPx, total = rows[rows.length - 1].s || 1, K = V.elevatedConcreteK;
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i], b = rows[i + 1], sh = elevatedAt(flags, (a.s + b.s) / 2 / total) ? K : 1;
    const P = (r, h, px, kl, kb, mat, n, shade = sh) => [r, h, px, kl, kb, 0, 0, 0, 0, 0, 0, 0, mat, shade, n];
    if (!detail) {
      M.quad(P(a, hT, eo + mg, 1, .5, MAT.TOP, 0), P(b, hT, eo + mg, 1, .5, MAT.TOP, 0), P(b, hT, eo - mg, -1, -.5, MAT.TOP, 0), P(a, hT, eo - mg, -1, -.5, MAT.TOP, 0));
      M.quad(P(a, hB, eo + mg, 1, .5, MAT.UNDER, 3), P(b, hB, eo + mg, 1, .5, MAT.UNDER, 3), P(b, hB, eo - mg, -1, -.5, MAT.UNDER, 3), P(a, hB, eo - mg, -1, -.5, MAT.UNDER, 3));
      for (const d of [-1, 1]) {
        const px = eo + d * mg, kl = d, kb = d * .5, pi = px - d * pp;
        M.quad(P(a, hB, px, kl, kb, MAT.SIDE, d), P(b, hB, px, kl, kb, MAT.SIDE, d), P(b, hT, px, kl, kb, MAT.SIDE, d), P(a, hT, px, kl, kb, MAT.SIDE, d));
        M.quad(P(a, hT, px, kl, kb, MAT.PARAPET, d, 1), P(b, hT, px, kl, kb, MAT.PARAPET, d, 1), P(b, hP, px, kl, kb, MAT.PARAPET, d, 1), P(a, hP, px, kl, kb, MAT.PARAPET, d, 1));
        M.quad(P(a, hT, pi, kl, kb, MAT.PARAPET, -d, 1), P(b, hT, pi, kl, kb, MAT.PARAPET, -d, 1), P(b, hP, pi, kl, kb, MAT.PARAPET, -d, 1), P(a, hP, pi, kl, kb, MAT.PARAPET, -d, 1));
        M.quad(P(a, hP, px, kl, kb, MAT.PARAPET, 0, 1), P(b, hP, px, kl, kb, MAT.PARAPET, 0, 1), P(b, hP, pi, kl, kb, MAT.PARAPET, 0, 1), P(a, hP, pi, kl, kb, MAT.PARAPET, 0, 1));
      }
    } else for (const d of [-1, 1]) {   // the track beds and the rails, at ±lane where the trains run
      const w = V.bedWidthRatio / 2, g = V.railGaugeRatio / 2, rp = V.railPx / 2;
      M.quad(P(a, hT + .08, eo, d, w, MAT.BED, 0, 1), P(b, hT + .08, eo, d, w, MAT.BED, 0, 1), P(b, hT + .08, eo, d, -w, MAT.BED, 0, 1), P(a, hT + .08, eo, d, -w, MAT.BED, 0, 1));
      for (const e of [-1, 1]) M.quad(P(a, hT + .16, eo + rp, d, e * g, MAT.RAIL, 0, 1), P(b, hT + .16, eo + rp, d, e * g, MAT.RAIL, 0, 1), P(b, hT + .16, eo - rp, d, e * g, MAT.RAIL, 0, 1), P(a, hT + .16, eo - rp, d, e * g, MAT.RAIL, 0, 1));
    }
  }
  return M.data();
}
// the piers of an edge at the spots given: a square column (metres, px floor) under a cap as wide as the deck
export function buildPiers(rows, spots, eo, V, flags, hT = V.railHeightM) {
  const M = new Mesh(spots.length * 54), hB = hT - V.deckThicknessM, hC = hB - V.pier.capDepthM, half = V.pier.sideM / 2, mp = V.pier.minPx / 2, cl = V.pier.capLengthM / 2, total = rows[rows.length - 1].s || 1, K = V.elevatedConcreteK;
  for (const s of spots) {
    const r = rowAt(rows, s), sh = elevatedAt(flags, s / total) ? K : 1;
    const C = (h, l, a, n) => [r, h, eo, 0, 0, 0, 0, 0, l, a, Math.sign(l) * mp, Math.sign(a) * mp, MAT.PIER, sh, n];   // the column
    for (const d of [-1, 1]) {
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
// (p: {row, L} — the platform's centre and frame, its length in metres)
export function buildPlatform(p, eo, V, detail, hT = V.railHeightM) {
  const S = V.station, M = new Mesh(400), r = p.row, L = p.L, mg = V.marginPx, fT = hT + S.platformRiseM, fB = fT - S.floorM, dep = S.platformDepthRatio;
  const Lc = L - 2 * S.canopyInsetM, rT = fT + S.canopyHeightM + S.canopyThicknessM, rB = rT - S.canopyThicknessM;
  const Q = (h, px, kl, kb, a, mat, n, szl = 0, sza = 0, lp = 0, ap = 0) => [r, h, px, kl, kb, 0, 0, a, szl, sza, lp, ap, mat, 1, n];
  for (const d of [-1, 1]) {
    const base = eo + d * (mg + S.gapPx), ki = d * .5, ko = d * (.5 + dep);   // inner edge (×body .5), outer edge (×body .5 + depth)
    M.quad(Q(fT, base, d, ki, -L / 2, MAT.FLOOR, 0), Q(fT, base, d, ko, -L / 2, MAT.FLOOR, 0), Q(fT, base, d, ko, L / 2, MAT.FLOOR, 0), Q(fT, base, d, ki, L / 2, MAT.FLOOR, 0));
    M.quad(Q(fB, base, d, ko, -L / 2, MAT.FLOOR, d), Q(fB, base, d, ko, L / 2, MAT.FLOOR, d), Q(fT, base, d, ko, L / 2, MAT.FLOOR, d), Q(fT, base, d, ko, -L / 2, MAT.FLOOR, d));
    for (const e of [-1, 1]) M.quad(Q(fB, base, d, ki, e * L / 2, MAT.FLOOR, 2 * e), Q(fB, base, d, ko, e * L / 2, MAT.FLOOR, 2 * e), Q(fT, base, d, ko, e * L / 2, MAT.FLOOR, 2 * e), Q(fT, base, d, ki, e * L / 2, MAT.FLOOR, 2 * e));
    if (Lc < 12) continue;
    const cin = base - d * .3, cout = base + d * S.canopyOverhangPx;   // a little over the deck's edge; a little past the platform's
    M.quad(Q(rT, cin, d, ki, -Lc / 2, MAT.ROOF, 0), Q(rT, cout, d, ko, -Lc / 2, MAT.ROOF, 0), Q(rT, cout, d, ko, Lc / 2, MAT.ROOF, 0), Q(rT, cin, d, ki, Lc / 2, MAT.ROOF, 0));
    M.quad(Q(rB, cin, d, ki, -Lc / 2, MAT.ROOF_UNDER, 3), Q(rB, cout, d, ko, -Lc / 2, MAT.ROOF_UNDER, 3), Q(rB, cout, d, ko, Lc / 2, MAT.ROOF_UNDER, 3), Q(rB, cin, d, ki, Lc / 2, MAT.ROOF_UNDER, 3));
    M.quad(Q(rB, cout, d, ko, -Lc / 2, MAT.FASCIA, d), Q(rB, cout, d, ko, Lc / 2, MAT.FASCIA, d), Q(rT, cout, d, ko, Lc / 2, MAT.FASCIA, d), Q(rT, cout, d, ko, -Lc / 2, MAT.FASCIA, d));
    M.quad(Q(rB, cin, d, ki, -Lc / 2, MAT.ROOF, -d), Q(rB, cin, d, ki, Lc / 2, MAT.ROOF, -d), Q(rT, cin, d, ki, Lc / 2, MAT.ROOF, -d), Q(rT, cin, d, ki, -Lc / 2, MAT.ROOF, -d));
    for (const e of [-1, 1]) M.quad(Q(rB, cin, d, ki, e * Lc / 2, MAT.ROOF, 2 * e), Q(rB, cout, d, ko, e * Lc / 2, MAT.ROOF, 2 * e), Q(rT, cout, d, ko, e * Lc / 2, MAT.ROOF, 2 * e), Q(rT, cin, d, ki, e * Lc / 2, MAT.ROOF, 2 * e));
    if (!detail) continue;
    const pc = base - d * S.postInsetPx, hp = S.postM / 2, pp = S.postPx / 2, n = Math.max(2, Math.floor(Lc / S.postEveryM) + 1);   // posts along the outer edge
    for (let k = 0; k < n; k++) {
      const a = -Lc / 2 + 2 + (Lc - 4) * k / (n - 1), T = (h, l, al, nn) => [r, h, pc, d, ko, 0, 0, a, l, al, Math.sign(l) * pp, Math.sign(al) * pp, MAT.POST, 1, nn];
      for (const e of [-1, 1]) { M.quad(T(fT, e * hp, -hp, e), T(fT, e * hp, hp, e), T(rB, e * hp, hp, e), T(rB, e * hp, -hp, e)); M.quad(T(fT, -hp, e * hp, 2 * e), T(fT, hp, e * hp, 2 * e), T(rB, hp, e * hp, 2 * e), T(rB, -hp, e * hp, 2 * e)) }
    }
  }
  return M.data();
}

// ── shaders ─────────────────────────────────────────────────────────────────────────────────────
const VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec2 a_r; layout(location=2) in vec2 a_f; layout(location=3) in vec2 a_px; layout(location=4) in vec2 a_k;
layout(location=5) in vec2 a_m; layout(location=6) in vec2 a_sz; layout(location=7) in vec2 a_min; layout(location=8) in vec2 a_mat; layout(location=9) in float a_n;
uniform mat4 u_matrix; uniform float u_mu, u_unit, u_lane, u_body, u_night, u_alpha, u_shadow; uniform vec2 u_shift, u_lit, u_glowK; uniform vec3 u_line, u_light, u_tint, u_glow, u_shade; uniform vec3 u_col[12];
out vec3 v_col; out float v_a;
float lit(vec3 n, vec3 L, vec2 k){ float d = max(dot(n, L), 0.); return k.x + k.y * (.5 + .5 * d); }
float sz(float m, float p){ float a = m * u_mu, b = p * u_unit; return abs(b) > abs(a) ? b : a; }   // a size in metres, never under its px floor
void main(){
  int m = int(a_mat.x + .5);
  if (u_shadow > .5 && m != 0 && m != 7 && m != 8) { gl_Position = vec4(2., 2., 2., 1.); return; }   // the shadow: the deck's top, the platforms, the roofs
  vec2 R = a_r, F = a_f;
  float lat = a_m.x * u_mu + sz(a_sz.x, a_min.x) + (a_px.x + a_k.x * u_lane + a_k.y * u_body) * u_unit, alo = a_m.y * u_mu + sz(a_sz.y, a_min.y) + a_px.y * u_unit;
  vec3 p = vec3(a_pos.xy * u_mu + R * lat + F * alo, a_pos.z * u_mu);
  if (u_shadow > .5) { p.xy += u_shift; p.z = .05 * u_mu; gl_Position = u_matrix * vec4(p, 1.); gl_Position.z -= 1.5e-5 * gl_Position.w; v_col = u_shade; v_a = u_alpha; return; }
  gl_Position = u_matrix * vec4(p, 1.);
  vec3 n = a_n == 0. ? vec3(0., 0., 1.) : abs(a_n) < 1.5 ? vec3(normalize(R) * sign(a_n), 0.) : abs(a_n) < 2.5 ? vec3(F * sign(a_n), 0.) : vec3(0., 0., -1.);
  vec3 c = (m == 3 || m == 11) ? u_line : u_col[m];
  c = c * a_mat.y * lit(n, u_light, u_lit) * u_tint;
  if (m == 2) c = mix(c, u_glow, u_night * u_glowK.x);                       // under the deck: lit softly at night
  if (m == 9 || m == 7) c = mix(c, u_glow, u_night * u_glowK.y * (m == 7 ? .6 : 1.));   // the platforms and under their roofs
  v_col = c; v_a = u_alpha;
}`;
const FS = `#version 300 es
precision highp float; in vec3 v_col; in float v_a; out vec4 o;
void main(){ o = vec4(clamp(v_col, 0., 1.) * v_a, v_a); }`;
const UNIFORMS = ['u_matrix', 'u_mu', 'u_unit', 'u_lane', 'u_body', 'u_night', 'u_alpha', 'u_shadow', 'u_shift', 'u_lit', 'u_glowK', 'u_line', 'u_light', 'u_tint', 'u_glow', 'u_shade', 'u_col'];
const ATTRS = [[0, 3, 0], [1, 2, 3], [2, 2, 5], [3, 2, 7], [4, 2, 9], [5, 2, 11], [6, 2, 13], [7, 2, 15], [8, 2, 17], [9, 1, 19]];

export class CityViaduct {
  constructor({ pack = SEOUL, net } = {}) { this.pack = pack; this.V = V_OF(pack); this.net = net; this.cache = new Map(); this.plats = new Map(); this.bytes = 0; this.frame = 0; this.stats = {}; this.edges = null; this.gl = null; this.broken = false; this.rgb = new Map() }
  get railM() { return this.V.railHeightM }
  // this line's rail height: the pack's, plus a few centimetres by line so two lines crossing never share a plane (depth fighting in the overlap)
  railFor(line) { let h = 0; for (let i = 0; i < line.length; i++) h = (h * 31 + line.charCodeAt(i)) >>> 0; return this.V.railHeightM + (h % 4) * (this.V.lineStepM ?? .04) }
  train(zoom, bodyPx) { return trainMetrics(zoom, bodyPx, this.pack) }
  routeOpacity(focus) { return routeOpacityExpr(focus, this.pack) }
  // where the deck's shadow falls: away from the sun by the deck's height (mercator units; nothing when the sun is down)
  shadowShift(sun) {
    const V = this.V; if (!sun || !(sun.elevation > 2)) return [0, 0];
    const away = (sun.azimuth + 180) * Math.PI / 180, L = Math.min(V.shadow.maxLengthM, V.railHeightM / Math.tan(Math.max(sun.elevation, 8) * Math.PI / 180)) * MU;
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
    if (this.edges) return this.edges; const { paths, byId } = this.net, seen = new Set(), out = [];
    for (const [line, chunks] of Object.entries(paths || {})) for (const ids of chunks) for (let i = 1; i < ids.length; i++) {
      const lo = Math.min(ids[i - 1], ids[i]), hi = Math.max(ids[i - 1], ids[i]), id = `${line}:${lo}:${hi}`; if (seen.has(id) || !byId.has(lo) || !byId.has(hi)) continue; seen.add(id); out.push({ id, line, lo, hi, g: null, rows: null }) }
    return this.edges = out;
  }
  // the edge's rows in local metres — again when the runtime's geometry object changes (the track shapes arrive after the first frames)
  rowsOf(e) {
    const g = this.net.geom(e.line, e.lo, e.hi); if (e.g === g && e.rows) return e.rows;
    e.g = g; e.rows = ribbonRows(g.pts.map(q => [(q.x - O.x) / MU, (q.y - O.y) / MU])); e.flags = FLAGS[e.id] || null; e.eo = this.net.offset(e.line, e.lo, e.hi);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const r of e.rows) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x); y1 = Math.max(y1, r.y) } e.box = [x0, y0, x1, y1];
    for (const k of ['deck', 'det', 'pier']) this.del(k + ':' + e.id);
    return e.rows;
  }
  platGeom(rect) {
    const c = rect.coords, A = toM(c[0][0], c[0][1]), B = toM(c[c.length - 1][0], c[c.length - 1][1]), dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy) || 1, fx = dx / d, fy = dy / d;
    const L = Math.max(20, d * Math.max(.1, Math.min(1, rect.plat || 1))), cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2, h = L / 2 + 30;
    return { rect, row: { x: cx, y: cy, fx, fy, rx: -fy, ry: fx }, L, box: [cx - h, cy - h, cx + h, cy + h] };
  }
  spots(e, life) {
    const rows = e.rows, P = this.V.pier;
    return pierSpots(rows[rows.length - 1].s, P.everyM, P.searchM, hashi(e.lo, e.hi, 7), s => { const q = rowAt(rows, s), r = life.inBuilding(q.x, q.y); return r === undefined ? undefined : !r });
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
    const { now = performance.now(), zoom = 15, dark = false, phone = false, bounds, sun, life = null, selected = 'all', moving = false, bodyPx = 7 } = opts, V = this.V, pack = this.pack, theme = dark ? 'dark' : 'light';
    if (!bounds || zoom < V.lod.deck[0] || !this.net?.paths) { this.stats = { idle: true }; return false }
    const t0 = performance.now(); this.frame++;
    const mpp = MPP(zoom), unit = 1 / (512 * 2 ** zoom), W = deckWidths(zoom, bodyPx, pack), halfPx = W.lane + W.body * .5 + V.marginPx;
    const box = [(bounds[0] - O.x) / MU, (bounds[1] - O.y) / MU, (bounds[2] - O.x) / MU, (bounds[3] - O.y) / MU], pad = (halfPx * 2 + V.pier.capOverhangPx) * mpp + 40;
    const inView = b => !(b[2] < box[0] - pad || b[0] > box[2] + pad || b[3] < box[1] - pad || b[1] > box[3] + pad);
    const budget = moving ? V.performance.buildMsMoving : V.performance.buildMs, time = () => performance.now() - t0 < budget;
    const wantDet = zoom >= V.lod.beds, wantPiers = zoom >= V.lod.piers && !!life, solo = selected !== 'all', draw = [], plats = [];
    let pending = false, piers = 0, open = 0;
    for (const e of this.edgeList()) {
      if (solo && e.line !== selected) continue; const rows = this.rowsOf(e); if (rows.length < 2 || !inView(e.box)) continue;
      const it = { e, deck: this.get('deck:' + e.id), det: null, pier: null };
      if (!it.deck) { if (time()) it.deck = this.put('deck:' + e.id, buildDeck(rows, e.eo, V, e.flags, false, this.railFor(e.line))); else pending = true }
      if (wantDet) { it.det = this.get('det:' + e.id); if (!it.det) { if (time()) it.det = this.put('det:' + e.id, buildDeck(rows, e.eo, V, e.flags, true, this.railFor(e.line))); else pending = true } }
      if (wantPiers) {
        const k = 'pier:' + e.id; let c = this.get(k);
        if (c && c.partial && now - c.at > 1500 && time()) { this.del(k); c = null }   // a tile has had time to come: place the piers it was waiting for
        if (!c) { if (time()) { const sp = this.spots(e, life); c = this.put(k, buildPiers(rows, sp.spots, e.eo, V, e.flags, this.railFor(e.line))); c.partial = sp.unknown; c.at = now; c.count = sp.spots.length; c.spots = sp.spots } else pending = true }
        if (c) { it.pier = c; piers += c.count || 0; if (c.partial) open++ }
      }
      draw.push(it);
    }
    if (zoom >= V.lod.platforms && this.net.rects) for (const [key, rect] of this.net.rects) {
      const line = key.slice(0, key.lastIndexOf(':')); if (solo && line !== selected) continue;
      let p = this.plats.get(key); if (!p || p.rect !== rect) { p = this.platGeom(rect); this.plats.set(key, p); this.del('plat:' + key); this.del('plat:' + key + ':d') }
      if (!inView(p.box)) continue;
      const detail = zoom >= V.lod.posts, k = 'plat:' + key + (detail ? ':d' : ''); let c = this.get(k);
      if (!c) { if (time()) c = this.put(k, buildPlatform(p, rect.offset || 0, V, detail, this.railFor(line))); else pending = true }
      if (c) plats.push([c, line]);
    }
    const cap = phone ? V.performance.phoneBytes : V.performance.bytes;
    for (const [k, a] of this.cache) { if (this.bytes <= cap || a.f === this.frame) break; this.del(k) }
    this.stats = { edges: draw.length, platforms: plats.length, piers, open, pieces: this.cache.size, mb: +(this.bytes / 1e6).toFixed(1), pending, ms: +(performance.now() - t0).toFixed(1) };
    if (!draw.length && !plats.length) return pending;
    // ── draw ──
    const MT = this.MT; for (let i = 0; i < 16; i++) MT[i] = matrix[i]; for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r] * O.x + matrix[4 + r] * O.y + matrix[12 + r];
    const Lg = pack.lighting?.[theme] || {}, ref = pack.lighting?.referenceSun || { azimuthDeg: 225, elevationDeg: 42 }, az = (sun?.azimuth ?? ref.azimuthDeg) * Math.PI / 180, el = Math.max(sun?.elevation ?? ref.elevationDeg, 12) * Math.PI / 180;
    const col = h => toneRGB(hexRgb(h), pack, 'simcity', theme), C = V.colors[theme] || V.colors.light, u = this.u;
    gl.useProgram(this.p); gl.uniformMatrix4fv(u.u_matrix, false, MT); gl.uniform1f(u.u_mu, MU); gl.uniform1f(u.u_unit, unit); gl.uniform1f(u.u_lane, W.lane); gl.uniform1f(u.u_body, W.body);
    gl.uniform3f(u.u_light, Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)); gl.uniform2f(u.u_lit, Lg.ambient ?? .64, Lg.directional ?? .36); gl.uniform3fv(u.u_tint, hexRgb(Lg.color || '#ffffff'));
    gl.uniform1f(u.u_night, dark ? 1 : 0); gl.uniform3fv(u.u_glow, col(V.night.glow)); gl.uniform2f(u.u_glowK, V.night.underK, V.night.platformK); gl.uniform3fv(u.u_shade, hexRgb(pack.lighting?.shadow?.color || '#394D4B'));
    gl.uniform3fv(u.u_col, new Float32Array(COLOR_KEYS.flatMap(k => col(C[k] || C.concrete)))); gl.uniform1f(u.u_alpha, 1); gl.uniform1f(u.u_shadow, 0); gl.uniform2f(u.u_shift, 0, 0);
    gl.bindVertexArray(null); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    const one = a => { if (!a.n) return; gl.bindVertexArray(a.vao); gl.drawArrays(gl.TRIANGLES, 0, a.n) };
    // 1) its shadow on the streets (the deck's height, away from the sun), under whatever stands on them
    if (!dark && sun && sun.elevation > 2 && zoom >= V.shadow.minZoom) {
      const [sx, sy] = this.shadowShift(sun); gl.uniform1f(u.u_shadow, 1); gl.uniform2f(u.u_shift, sx, sy); gl.uniform1f(u.u_alpha, (pack.modes?.simcity?.shadowOpacity?.light ?? .18) * V.shadow.opacityK);
      gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      for (const it of draw) if (it.deck) one(it.deck); for (const [c] of plats) one(c);
      gl.depthMask(true); gl.disable(gl.BLEND); gl.uniform1f(u.u_shadow, 0); gl.uniform1f(u.u_alpha, 1);
    }
    // 2) the viaduct, each edge with its line's colour on the parapets; the platforms with theirs on the canopy edge
    for (const it of draw) { gl.uniform3fv(u.u_line, this.lineRGB(it.e.line, theme)); if (it.deck) one(it.deck); if (it.det) one(it.det); if (it.pier) one(it.pier) }
    for (const [c, line] of plats) { gl.uniform3fv(u.u_line, this.lineRGB(line, theme)); one(c) }
    gl.bindVertexArray(null); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    return pending;
  }
  // the piers now standing (local metres), for checks
  debugPiers() { const out = []; if (!this.edges) return out; for (const e of this.edges) { const a = this.cache.get('pier:' + e.id); if (!a || !a.spots) continue; for (const s of a.spots) { const q = rowAt(e.rows, s); out.push([e.id, q.x, q.y]) } } return out }
  dispose(gl) { if (!this.gl) return; for (const k of [...this.cache.keys()]) this.del(k); gl.deleteProgram(this.p); this.gl = null }
}
export default CityViaduct;
