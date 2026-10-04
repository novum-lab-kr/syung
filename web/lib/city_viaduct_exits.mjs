// 심시티 고가 역의 출구 (exit stairs) — from each elevated platform a roofed stair comes down to every real exit of the
// station (the app's exits: OSM subway_entrance points, where the exit pillars stand), the way 건대입구's do: platform →
// stair (flights with landings, low concrete walls, a roof with the line's colour along its edges) → the pavement.
// An exit near the platform gets a stair hung off the platform's outer edge, running along the deck and drifting out
// to the exit point; one farther out (past a block) a short elevated walkway straight out from the platform and the
// stair down the same line; one beyond the platform's end first a walkway along the deck's side. Nothing of it passes
// through a building (the same inBuilding check as the piers: a stair or walkway that would is turned the other way,
// or left out and listed), and nothing passes through another line's deck at a transfer station.
// Geometry is laid out in the platform's frame (t along its axis from its centre, u across; metres), with the ends
// that hang off the platform anchored to its px-sized edge (the shader adds the px parts), so the stairs stay attached
// at every zoom. Pure functions; the tests use them.
import SEOUL from './city_style_seoul.mjs';
import { pointSegmentDistance } from './city_viaduct_levels.mjs';
import { Mesh, MAT } from './city_viaduct_mesh.mjs';

const V_OF = pack => pack.viaduct || SEOUL.viaduct;

// the stair's vertical profile from `top` down to the ground: flights of at most landingDropM with flat landings between
export function stairProfile(top, S) {
  const n = Math.max(1, Math.ceil(top / S.landingDropM)), drop = top / n, flightRun = drop / S.riseRun, segs = []; let s = 0, h = top;
  for (let i = 0; i < n; i++) {
    segs.push({ s0: s, s1: s + flightRun, h0: h, h1: h - drop, flight: true }); s += flightRun; h -= drop;
    if (i < n - 1) { segs.push({ s0: s, s1: s + S.landingM, h0: h, h1: h, flight: false }); s += S.landingM }
  }
  return { run: s, segs, top };
}
export function stairHeightAt(prof, s) {
  for (const g of prof.segs) if (s <= g.s1) return g.h0 + (g.h1 - g.h0) * (g.s1 > g.s0 ? Math.max(0, (s - g.s0) / (g.s1 - g.s0)) : 0);
  return 0;
}

// Where each exit's stair stands. P: {L: platform length, H: the station rectangle's half-length, eoM: the deck's centre
// across (m, reference zoom), Wfar: the platform's outer edge from the deck's centre at the widest zoom stairs show at (the
// far/near decision), W and W2: the same at the two closest zooms (the building checks: the px-sized platform reaches into
// the buildings along the street zoomed out, and so does anything hung off its edge — hidden inside them, as it is), top: the platform floor's height}; exits: [{ref, t, u}] (m, in the platform's frame);
// ground(t, u) → true (clear) / false (a building) / undefined (that tile has not come); blocked(t, u, h) → true where
// another line's deck is in the way at that height. → {items: [{ref, far, d, sg, T:{t,u|null}, foot:{t,u}, walk, bridge, posts…} | {ref, skip}], unknown}
export function layoutExits(P, exits, V, ground, blocked = () => false) {
  const X = V.exits, S = X.stair, prof = stairProfile(P.top, S), run = prof.run, items = []; let unknown = false;
  for (const e of exits) {
    const du = e.u - P.eoM, d = du >= 0 ? 1 : -1, lateral = Math.abs(du);
    if (pointSegmentDistance([e.t, e.u], [-P.H, P.eoM], [P.H, P.eoM]) > X.maxM) { items.push({ ref: e.ref, skip: 'far' }); continue }
    const far = lateral - (P.Wfar ?? P.W) >= run + X.farExtraM, sg = e.t >= 0 ? 1 : -1, tries = [];   // far: past the platform's widest edge by a whole stair (the bridge never runs backwards); the stair comes down heading out from the platform's middle
    if (far) tries.push({ far: true });
    tries.push({ far: false, sg }, { far: false, sg: -sg });
    if (!far) tries.push({ far: true });
    let placed = null, open = false;
    for (const tr of tries) {
      const it = planExit(P, e, d, tr, prof, X); if (!it) continue;
      const r = checkExit(it, P, prof, X, ground, blocked);
      if (r === true) { placed = it; break } if (r === undefined) open = true;
    }
    if (placed) { placed.posts = postSpots(placed, P, X, ground); items.push(placed) }
    else { if (open) unknown = true; items.push({ ref: e.ref, skip: open ? 'unknown' : 'blocked' }) }
  }
  return { items, unknown, run };
}
// one way of reaching the exit: far — a bridge straight out from the platform's edge at t and the stair on down the same
// line to the exit; near — the stair hung off the platform's edge (anchored), running along the deck from t_T to the exit
function planExit(P, e, d, tr, prof, X) {
  const run = prof.run, W = X.walk, half = P.L / 2;
  if (tr.far) {
    const uT = e.u - d * run, it = { ref: e.ref, far: true, d, sg: 0, T: { t: e.t, u: uT }, foot: { t: e.t, u: e.u }, bridge: { t: e.t, u1: uT }, walk: null };
    if (Math.abs(e.t) > half - 1) { if (Math.abs(e.t) > P.H + W.maxAlongM) return null; it.walk = { t0: Math.sign(e.t) * half, t1: e.t } }
    return it;
  }
  const tT = e.t - tr.sg * run, it = { ref: e.ref, far: false, d, sg: tr.sg, T: { t: tT, u: null }, foot: { t: e.t, u: e.u }, bridge: null, walk: null };
  if (Math.abs(tT) > half - 1) { if (Math.abs(tT) > P.H + W.maxAlongM) return null; it.walk = { t0: Math.sign(tT) * half, t1: tT } }
  return it;
}
// the exit's u for an anchored point (the platform's outer edge plus the gap) at the reference zooms
const edgeU = (P, d, X, z2) => P.eoM + d * ((z2 ? P.W2 : P.W) + X.nearGapM);
// the stair's line in the plane at a reference zoom: from T to the foot (anchored T takes the edge's u at that zoom)
function stairLine(it, P, X, z2) { return [[it.T.t, it.T.u ?? edgeU(P, it.d, X, z2)], [it.foot.t, it.foot.u]] }
// a stair, its walkway and bridge against the buildings (and other decks): true / false / undefined (a tile missing)
function checkExit(it, P, prof, X, ground, blocked) {
  let open = false, moved = 0;
  const probe = (t, u, h) => { if (blocked(t, u, h)) return false; const g = ground(t, u); if (g === false) return false; if (g === undefined) open = true; return true };
  const line = (A, B, hAt, step) => { const n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / step)); for (let i = 0; i <= n; i++) { const f = i / n; if (!probe(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, hAt(f))) return false } return true };
  // the foot: a stair may not land inside a building — pull the whole stair back along itself until it is clear
  for (; moved <= X.stair.footClearM; moved += 1) {
    const g = ground(it.foot.t, it.foot.u); if (g === undefined) open = true;
    if (g !== false) break;
    const [A, B] = stairLine(it, P, X, false), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, bx = (A[0] - B[0]) / L, by = (A[1] - B[1]) / L;
    it.foot = { t: it.foot.t + bx, u: it.foot.u + by }; if (it.T.u !== null) it.T = { t: it.T.t + bx, u: it.T.u + by }; else it.T = { t: it.T.t + bx, u: null };
    if (it.bridge) { it.bridge = { t: it.foot.t, u1: it.T.u } }
  }
  if (moved > X.stair.footClearM) return false;
  const hStair = f => stairHeightAt(prof, f * prof.run);
  for (const z2 of it.T.u === null ? [false, true] : [false]) if (!line(...stairLine(it, P, X, z2), hStair, X.checkStepM)) return false;
  if (it.walk) for (const z2 of [false, true]) { const u = edgeU(P, it.d, X, z2) - it.d * X.nearGapM - it.d * X.walk.widthM / 2; if (!line([it.walk.t0, u], [it.walk.t1, u], () => P.top, X.checkStepM)) return false }
  if (it.bridge) for (const z2 of [false, true]) { const u0 = edgeU(P, it.d, X, z2) - it.d * X.nearGapM; if (!line([it.bridge.t, u0], [it.bridge.t, it.bridge.u1], () => P.top, X.checkStepM)) return false }
  return open ? undefined : true;
}
// posts under the walkway and the bridge, every postEveryM, only on clear ground at both reference zooms
function postSpots(it, P, X, ground) {
  const out = [], W = X.walk, clear = (t, u) => ground(t, u) === true;
  if (it.walk) { const a = Math.min(it.walk.t0, it.walk.t1), b = Math.max(it.walk.t0, it.walk.t1); for (let t = a + W.postEveryM; t < b - 2; t += W.postEveryM) { let ok = true; for (const z2 of [false, true]) if (!clear(t, edgeU(P, it.d, X, z2) - it.d * X.nearGapM - it.d * W.widthM / 2)) ok = false; if (ok) out.push({ kind: 'walk', t }) } }
  if (it.bridge) { const uE = edgeU(P, it.d, X, true) - it.d * X.nearGapM, span = Math.abs(it.bridge.u1 - uE); for (let s = W.postEveryM; s < span - 2; s += W.postEveryM) { const u = it.bridge.u1 - it.d * s; if (clear(it.bridge.t, u)) out.push({ kind: 'bridge', u }) } }
  return out;
}

// ── the mesh ────────────────────────────────────────────────────────────────────────────────────
// in the platform's frame r (its centre and R/F); eo: the deck's centre in px; the anchored edge: px eo + d·(margin + gap),
// ×lane d, ×body d·(.5 + depth), as buildPlatform lays the platform's outer edge
export function buildExits(layout, r, eo, V, detail) {
  const X = V.exits, S = X.stair, Wk = X.walk, St = V.station, M = new Mesh(600), top = layout.top, prof = stairProfile(top, S);
  const edge = d => ({ px: eo + d * (V.marginPx + St.gapPx), kl: d, kb: d * (.5 + St.platformDepthRatio) }), pure = { px: 0, kl: 0, kb: 0 };
  // a vertex: anchor a (px parts), u/t metres, height, half sizes across/along with their px floors, material, normal
  const Vx = (a, u, t, h, szl, sza, lp, ap, mat, n, shade = 1) => [r, h, a.px, a.kl, a.kb, 0, u, t, szl, sza, lp, ap, mat, shade, n];
  const mix = (a, b, f) => ({ px: a.px + (b.px - a.px) * f, kl: a.kl + (b.kl - a.kl) * f, kb: a.kb + (b.kb - a.kb) * f });
  for (const it of layout.items) {
    if (it.skip) continue;
    const d = it.d, E = edge(d), w = S.widthM / 2, mp = S.minPx / 2;
    // the stair's rows: from T (anchored at the edge + the gap, or a metre point) to the foot, at the profile's breaks
    const A0 = it.T.u === null ? E : pure, u0 = it.T.u === null ? d * X.nearGapM : it.T.u, t0 = it.T.t, u1 = it.foot.u, t1 = it.foot.t;
    const row = s => { const f = Math.max(0, Math.min(1, s / prof.run)); return { a: mix(A0, pure, f), u: u0 + (u1 - u0) * f, t: t0 + (t1 - t0) * f, h: stairHeightAt(prof, s) } };
    const along = it.far ? 'R' : 'F';   // the stair's direction: out across the deck (far) or along it (near); its width lies the other way
    const Q = (R, h, side, mat, n, extra = 0) => along === 'F' ? Vx(R.a, R.u, R.t, h, side * (w + extra), 0, side * mp, 0, mat, n) : Vx(R.a, R.u, R.t, h, 0, side * (w + extra), 0, side * mp, mat, n);
    const nSide = along === 'F' ? 1 : 2, nEnd = along === 'F' ? 2 : 1;   // normal codes: the sides face ±R (near) or ±F (far)
    const slab = (R0, R1) => {
      const hA = R0.h, hB = R1.h, hd = [hA - S.slabM, hB - S.slabM];
      M.quad(Q(R0, hA, -1, MAT.STAIR, 0), Q(R1, hB, -1, MAT.STAIR, 0), Q(R1, hB, 1, MAT.STAIR, 0), Q(R0, hA, 1, MAT.STAIR, 0));
      M.quad(Q(R0, hd[0], -1, MAT.STAIR_WALL, 3), Q(R1, hd[1], -1, MAT.STAIR_WALL, 3), Q(R1, hd[1], 1, MAT.STAIR_WALL, 3), Q(R0, hd[0], 1, MAT.STAIR_WALL, 3));
      for (const e of [-1, 1]) {
        M.quad(Q(R0, hd[0], e, MAT.STAIR_WALL, e * nSide), Q(R1, hd[1], e, MAT.STAIR_WALL, e * nSide), Q(R1, hB, e, MAT.STAIR_WALL, e * nSide), Q(R0, hA, e, MAT.STAIR_WALL, e * nSide));   // the slab's side
        M.quad(Q(R0, hA, e, MAT.STAIR_WALL, e * nSide), Q(R1, hB, e, MAT.STAIR_WALL, e * nSide), Q(R1, hB + S.wallM, e, MAT.STAIR_WALL, e * nSide), Q(R0, hA + S.wallM, e, MAT.STAIR_WALL, e * nSide));   // the low wall
      }
      const rT = [hA + S.roofClearM, hB + S.roofClearM], rB = [rT[0] - S.roofM, rT[1] - S.roofM], o = S.roofOverhangM;
      M.quad(Q(R0, rT[0], -1, MAT.ROOF, 0, o), Q(R1, rT[1], -1, MAT.ROOF, 0, o), Q(R1, rT[1], 1, MAT.ROOF, 0, o), Q(R0, rT[0], 1, MAT.ROOF, 0, o));
      M.quad(Q(R0, rB[0], -1, MAT.ROOF_UNDER, 3, o), Q(R1, rB[1], -1, MAT.ROOF_UNDER, 3, o), Q(R1, rB[1], 1, MAT.ROOF_UNDER, 3, o), Q(R0, rB[0], 1, MAT.ROOF_UNDER, 3, o));
      for (const e of [-1, 1]) M.quad(Q(R0, rB[0], e, MAT.FASCIA, e * nSide, o), Q(R1, rB[1], e, MAT.FASCIA, e * nSide, o), Q(R1, rT[1], e, MAT.FASCIA, e * nSide, o), Q(R0, rT[0], e, MAT.FASCIA, e * nSide, o));
    };
    const post = (R, e) => {   // a square post from the slab up to the roof, at the side e, set in by its own width
      const hp = S.postM / 2, pp = S.postPx / 2, inset = e * (w - S.postM), P = (h, l, a, n) => along === 'F' ? Vx(R.a, R.u, R.t, h, inset + l, a, Math.sign(l) * pp, Math.sign(a) * pp, MAT.POST, n) : Vx(R.a, R.u, R.t, h, a, inset + l, Math.sign(a) * pp, Math.sign(l) * pp, MAT.POST, n);
      const h0 = R.h, h1 = R.h + S.roofClearM - S.roofM;
      for (const g of [-1, 1]) { M.quad(P(h0, g * hp, -hp, g * nSide), P(h0, g * hp, hp, g * nSide), P(h1, g * hp, hp, g * nSide), P(h1, g * hp, -hp, g * nSide)); M.quad(P(h0, -hp, g * hp, g * nEnd), P(h0, hp, g * hp, g * nEnd), P(h1, hp, g * hp, g * nEnd), P(h1, -hp, g * hp, g * nEnd)) }
    };
    const rows = prof.segs.map(g => row(g.s0)); rows.push(row(prof.run));
    for (let i = 0; i + 1 < rows.length; i++) slab(rows[i], rows[i + 1]);
    for (const e of [-1, 1]) { post(rows[0], e); post(rows[rows.length - 1], e) }
    for (let i = 1; i + 1 < rows.length; i++) if (!prof.segs[i].flight) for (const e of [-1, 1]) post(rows[i], e);   // at each landing's start
    const endCap = (R, h0, h1, n) => M.quad(Q(R, h0, -1, MAT.STAIR_WALL, n), Q(R, h0, 1, MAT.STAIR_WALL, n), Q(R, h1, 1, MAT.STAIR_WALL, n), Q(R, h1, -1, MAT.STAIR_WALL, n));
    endCap(rows[rows.length - 1], 0, S.wallM, nEnd * (along === 'F' ? Math.sign(t1 - t0) : d));   // the foot's end
    if (detail) for (const g of prof.segs) {   // the steps: a tread and a riser each, on the flights
      if (!g.flight) continue; const n = Math.max(1, Math.round((g.h0 - g.h1) / S.stepRiseM)), dir = along === 'F' ? Math.sign(t1 - t0) : d;
      for (let k = 0; k < n; k++) {
        const sa = g.s0 + (g.s1 - g.s0) * k / n, sb = g.s0 + (g.s1 - g.s0) * (k + 1) / n, hk = g.h0 - (g.h0 - g.h1) * k / n, hk1 = g.h0 - (g.h0 - g.h1) * (k + 1) / n, Ra = row(sa), Rb = row(sb);
        M.quad(Q(Ra, hk + .02, -1, MAT.STAIR, 0), Q(Rb, hk + .02, -1, MAT.STAIR, 0), Q(Rb, hk + .02, 1, MAT.STAIR, 0), Q(Ra, hk + .02, 1, MAT.STAIR, 0));
        M.quad(Q(Rb, hk1, -1, MAT.STAIR_WALL, dir * nEnd), Q(Rb, hk1, 1, MAT.STAIR_WALL, dir * nEnd), Q(Rb, hk + .02, 1, MAT.STAIR_WALL, dir * nEnd), Q(Rb, hk + .02, -1, MAT.STAIR_WALL, dir * nEnd));
      }
    }
    // the walkway along the deck's side (the band just inside the platform's outer edge) and the bridge straight out
    const ww = Wk.widthM / 2, wp = Wk.minPx / 2, Wb = (a, u, t, h, side, orient, mat, n) => orient === 'F' ? Vx(a, u, t, h, side * ww, 0, side * wp, 0, mat, n) : Vx(a, u, t, h, 0, side * ww, 0, side * wp, mat, n);
    const deck = (A, uA, tA, B, uB, tB, orient) => {   // a level walkway from (A, uA, tA) to (B, uB, tB), width across its orientation
      const nS = orient === 'F' ? 1 : 2, hT = top, hB = top - Wk.slabM;
      M.quad(Wb(A, uA, tA, hT, -1, orient, MAT.WALK, 0), Wb(B, uB, tB, hT, -1, orient, MAT.WALK, 0), Wb(B, uB, tB, hT, 1, orient, MAT.WALK, 0), Wb(A, uA, tA, hT, 1, orient, MAT.WALK, 0));
      M.quad(Wb(A, uA, tA, hB, -1, orient, MAT.WALK_WALL, 3), Wb(B, uB, tB, hB, -1, orient, MAT.WALK_WALL, 3), Wb(B, uB, tB, hB, 1, orient, MAT.WALK_WALL, 3), Wb(A, uA, tA, hB, 1, orient, MAT.WALK_WALL, 3));
      for (const e of [-1, 1]) {
        M.quad(Wb(A, uA, tA, hB, e, orient, MAT.WALK_WALL, e * nS), Wb(B, uB, tB, hB, e, orient, MAT.WALK_WALL, e * nS), Wb(B, uB, tB, hT, e, orient, MAT.WALK_WALL, e * nS), Wb(A, uA, tA, hT, e, orient, MAT.WALK_WALL, e * nS));
        M.quad(Wb(A, uA, tA, hT, e, orient, MAT.WALK_WALL, e * nS), Wb(B, uB, tB, hT, e, orient, MAT.WALK_WALL, e * nS), Wb(B, uB, tB, hT + Wk.wallM, e, orient, MAT.WALK_WALL, e * nS), Wb(A, uA, tA, hT + Wk.wallM, e, orient, MAT.WALK_WALL, e * nS));
      }
    };
    if (it.walk) deck(E, -d * ww, it.walk.t0, E, -d * ww, it.walk.t1, 'F');
    if (it.bridge) deck(E, 0, it.bridge.t, pure, it.bridge.u1, it.bridge.t, 'R');
    for (const p of it.posts || []) {   // square columns under them, to the ground
      const hp = Wk.postM / 2, pp = Wk.postPx / 2, a = p.kind === 'walk' ? E : pure, u = p.kind === 'walk' ? -d * ww : p.u, t = p.kind === 'walk' ? p.t : it.bridge.t;
      const C = (h, l, al, n) => Vx(a, u, t, h, l, al, Math.sign(l) * pp, Math.sign(al) * pp, MAT.PIER, n), h1 = top - Wk.slabM;
      for (const g of [-1, 1]) { M.quad(C(0, g * hp, -hp, g), C(0, g * hp, hp, g), C(h1, g * hp, hp, g), C(h1, g * hp, -hp, g)); M.quad(C(0, -hp, g * hp, 2 * g), C(0, hp, g * hp, 2 * g), C(h1, hp, g * hp, 2 * g), C(h1, -hp, g * hp, 2 * g)) }
    }
  }
  return M.data();
}
// sample points of a laid-out exit's footprint (t,u) with heights, for checks from outside (the reference zoom's edge)
export function exitSamples(layout, P, V, step = 3) {
  const X = V.exits, prof = stairProfile(P.top, X.stair), out = [];
  for (const it of layout.items) {
    if (it.skip) continue;
    const [A, B] = stairLine(it, P, X, false), n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / step));
    for (let i = 0; i <= n; i++) { const f = i / n; out.push({ ref: it.ref, part: 'stair', t: A[0] + (B[0] - A[0]) * f, u: A[1] + (B[1] - A[1]) * f, h: stairHeightAt(prof, f * prof.run) }) }
    if (it.walk) { const u = edgeU(P, it.d, X, false) - it.d * X.nearGapM - it.d * X.walk.widthM / 2, m = Math.max(1, Math.ceil(Math.abs(it.walk.t1 - it.walk.t0) / step)); for (let i = 0; i <= m; i++) out.push({ ref: it.ref, part: 'walk', t: it.walk.t0 + (it.walk.t1 - it.walk.t0) * i / m, u, h: P.top }) }
    if (it.bridge) { const u0 = edgeU(P, it.d, X, false) - it.d * X.nearGapM, m = Math.max(1, Math.ceil(Math.abs(it.bridge.u1 - u0) / step)); for (let i = 0; i <= m; i++) out.push({ ref: it.ref, part: 'bridge', t: it.bridge.t, u: u0 + (it.bridge.u1 - u0) * i / m, h: P.top }) }
  }
  return out;
}
export default { stairProfile, stairHeightAt, layoutExits, buildExits, exitSamples };
