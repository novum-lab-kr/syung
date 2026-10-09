// 조선 모드의 건물 — every footprint as 기와집, when the style pack carries `hanok` (city_style_joseon.mjs).
//
// The footprint is fitted with an oriented rectangle of its own area (a little inside it: pack fitK). A small one becomes
// one house (채); a big one a compound — houses in rows along its long side with yards between, some cells left open,
// and a 담장 with a gate round it when it is large enough. A house: the stone platform (기단), the walls between their
// posts (기둥, 회벽, 창호 — drawn in the fragment shader), a 우진각 roof with a concave slope, lifted and kicked-out
// corners (추녀) and a ridge (용마루), and the eave's underside. TileBuilder.building() hands every item here
// (web/lib/city_mesh.mjs); the vertex layout is its own, the kinds below are new.
//
// Tiles: a footprint cut by the tile edge is laid out on its whole outline, which both tiles hold, and each house (each
// 담장 stretch) is drawn by the tile its centre falls in, so the halves never draw the same house twice. An outline the
// tile's buffer also cut (each tile then holds a different piece of it) falls back to the part inside the tile.
import { area as ringArea, simplifyRing, orientedBox } from './city_geom.mjs';

export const HANOK_KIND = { ROOF: 8, WALL: 9, DAM: 10 };   // vertex kinds after city_mesh's (0–7): 기와 (and the eave's underside, facing down), the house's walls and platform, the 담장's walls

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// an outline the tile's buffer cut: an axis-aligned edge on the buffer's line (OpenFreeMap: 64 of 4096 round the tile;
// each tile then holds a different piece of it). Other axis-aligned edges out there are only walls running north–south
export function bufferCut(r, E) {
  const n = r.length / 2, b = E / 64;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = r[i * 2], ay = r[i * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1];
    if ((ax === bx && ay !== by && (ax <= -b || ax >= E + b)) || (ay === by && ax !== bx && (ay <= -b || ay >= E + b))) return true;
  }
  return false;
}

// the houses on a rectangle L × S (m, L ≥ S): {houses: [{x, y, hl, hd}] (centre in metres from the rectangle's, along its
// long and short sides; the walls' half length and half depth), dam: [half L, half S] of the 담장 or null}. rnd(i): 0..1, stable
export function hanokLayout(L, S, K, rnd = () => .5) {
  const eave = K.eaveOutM, one = K.single;
  if (L <= one.maxLengthM && S <= one.maxDepthM) return { houses: [{ x: 0, y: 0, hl: Math.max(1.2, L / 2 - eave * .5), hd: Math.max(1.2, S / 2 - eave * .5) }], dam: null };
  const C = K.compound, walled = L * S >= C.minAreaM2, edge = walled ? C.insetM + C.wallThickM + eave + 1 : eave * .5;
  const Li = Math.max(4, L - 2 * edge), Si = Math.max(4, S - 2 * edge), [d0, d1] = K.houseDepthM;
  let nR = Math.max(1, Math.floor((Si + K.yardM) / (d1 + K.yardM))), nC = Math.max(1, Math.round((Li + K.gapM) / (K.houseLengthM + K.gapM)));
  while (nR * nC > K.maxHouses) { if (nC >= nR) nC--; else nR-- }
  const D = clamp((Si - (nR - 1) * K.yardM) / nR, Math.min(d0, Si), d1), Lc = Math.min(K.maxLengthM, (Li - (nC - 1) * K.gapM) / nC);
  const pitchL = Li / nC, pitchS = nR > 1 ? (Si - D) / (nR - 1) : 0, houses = [];
  for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
    if (nR * nC >= 3 && rnd(r * 97 + c) < K.emptyShare) continue;   // an open yard
    houses.push({ x: -Li / 2 + pitchL * (c + .5), y: nR > 1 ? -Si / 2 + D / 2 + pitchS * r : 0, hl: Math.max(1.2, Lc / 2), hd: D / 2 });
  }
  if (!houses.length) houses.push({ x: 0, y: 0, hl: Math.max(1.2, Lc / 2), hd: D / 2 });
  return { houses, dam: walled ? [L / 2 - C.insetM, S / 2 - C.insetM] : null };
}

// one footprint (a TileBuilder item) as hanok. unit(seed, k): the builder's stable 0..1
export function hanokBuilding(tb, it, unit) {
  const K = tb.P.hanok, E = tb.E, mpu = tb.mPerUnit;
  if (it.depth) return;   // a part traced inside another footprint: its container is the house
  const cut = it.clipped && bufferCut(it.raw, E), ring0 = !it.clipped || cut ? it.outer : it.raw;
  const ring = ring0.length > 160 ? simplifyRing(ring0, .5 / mpu) : ring0, box = orientedBox(ring); if (!box) return;
  const A = it.clipped && !cut ? ringArea(it.raw) * mpu * mpu : it.A;
  const k = clamp(Math.sqrt(A / Math.max(box.hw * box.hh * 4 * mpu * mpu, 1e-6)), .55, 1) * K.fitK, L = box.hw * 2 * mpu * k, S = box.hh * 2 * mpu * k;
  const lay = hanokLayout(L, S, K, i => unit(it.seed, 101 + i));
  const ux = box.ux, uy = box.uy, vx = -uy, vy = ux;
  const at = (x, y) => [box.cx + (x * ux + y * vx) / mpu, box.cy + (x * uy + y * vy) / mpu];   // metres from the rectangle's centre → tile units
  const sx = tb.src.x, sy = tb.src.y, q = v => Math.round(v * 1024) / 1024;   // whose tile a point is in: on the absolute tile grid, rounded, so both neighbours agree on a centre right on their edge
  const mine = p => Math.floor(q(sx * E + p[0]) / E) === sx && Math.floor(q(sy * E + p[1]) / E) === sy;
  const W = tb.W, seed = it.seed >>> 0; W.b = [seed & 255, (seed >>> 8) & 255, 0, 0];
  let drawn = 0;
  lay.houses.forEach((h, i) => { const c = at(h.x, h.y); if (!mine(c)) return; house(tb, frame(tb, c, ux, uy), h.hl, h.hd, K, unit(it.seed, 7 + i)); drawn++ });
  if (lay.dam) drawn += dam(tb, at, mine, ux, uy, lay.dam, K, unit(it.seed, 5));
  if (drawn) tb.count++;
}

// a local frame on the house: x along (ux, uy), y across, z up, metres → the writer's tile-mercator units; quads wound
// so their face points along the normal given (front = counter-clockwise seen from outside, as city_mesh's walls)
function frame(tb, c, ux, uy) {
  const W = tb.W, mpu = tb.mPerUnit, u = tb.unit, vx = -uy, vy = ux, E = tb.E, CH = Math.sqrt(tb.chunks.length);
  const ch = tb.chunks[clamp(Math.floor(c[0] / E * CH), 0, CH - 1) + CH * clamp(Math.floor(c[1] / E * CH), 0, CH - 1)];
  ch.n++;   // (result() keeps only the chunks that hold something)
  const F = {
    ch,
    v(p, n, uu) { W.normal(n[0] * ux + n[1] * vx, n[0] * uy + n[1] * vy, n[2]); const x = (c[0] + (p[0] * ux + p[1] * vx) / mpu) * u, y = (c[1] + (p[0] * uy + p[1] * vy) / mpu) * u; tb.extend(ch, x, y, x, y, p[2]); return W.v(x, y, p[2], uu) },
    // a quad (4 points, the same normal); u values per point
    quad(P, n, U = [0, 0, 0, 0]) { const i = P.map((p, j) => F.v(p, n, U[j])); push(ch.walls, i, P, n) },
    // a triangle fan or strip as triangles of point indices into P, each with its own normal list N (per point)
    mesh(P, N, U, tris, out) { const i = P.map((p, j) => F.v(p, N[j], U[j])); for (let t = 0; t < tris.length; t += 3) tri(ch.walls, i, P, tris[t], tris[t + 1], tris[t + 2], out) },
  };
  return F;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] };
function tri(list, i, P, a, b, c, out) {
  const n = cross(sub(P[b], P[a]), sub(P[c], P[a])); if (Math.hypot(n[0], n[1], n[2]) < 1e-9) return;   // degenerate (the hip's apex)
  if (dot(n, out) >= 0) list.push(i[a], i[b], i[c]); else list.push(i[a], i[c], i[b]);
}
function push(list, i, P, n) { tri(list, i, P, 0, 1, 2, n); tri(list, i, P, 0, 2, 3, n) }

// a box's sides (and top) from z0 to z1 over the rectangle ±a × ±b (local metres)
function box(F, a, b, z0, z1, top, wallU) {
  const C = [[-a, -b], [a, -b], [a, b], [-a, b]];
  for (let s = 0; s < 4; s++) {
    const p = C[s], q = C[(s + 1) % 4], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy), n = [dy / l, -dx / l, 0];
    const nOut = dot([n[0], n[1], 0], [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0]) >= 0 ? n : [-n[0], -n[1], 0];
    if (wallU) wallU(l, s);
    F.quad([[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], nOut, [0, l, l, 0]);
  }
  if (top) F.quad(C.map(([x, y]) => [x, y, z1]), [0, 0, 1]);
}

function house(tb, F, a, b, K, r) {
  const W = tb.W, zb = K.baseM, bo = K.baseOutM, wallH = lerp(K.wallM[0], K.wallM[1], clamp((b * 2 - 5) / 5, 0, 1)), zt = zb + wallH;
  const o = K.eaveOutM, ae = a + o, be = b + o, ze = zt - .15, rise = clamp(K.riseK * be, K.riseM[0], K.riseM[1]), zr = ze + rise;
  const ar = Math.max(.3 * ae, ae - K.hipK * be), lift = K.cornerLiftM, kick = K.cornerKickM * .7, ridgeTop = zr + .42;
  const Hq = Math.min(65535, Math.round(ridgeTop * 10)), slot = Math.floor(r * 3) % 3;
  W.m = [0, clamp(Math.round(zt * 20), 0, 255), Hq & 255, Hq >>> 8];
  // 기단 and walls (kind WALL: the shader draws stone up to the platform's top, posts and panels above it)
  W.kind = HANOK_KIND.WALL; W.w = [0, 0, 0, 0];
  box(F, a + bo, b + bo, 0, zb, true);
  box(F, a, b, zb, zt, false, (l, s) => { const lq = Math.min(65535, Math.round(l * 20)); W.w = [Math.max(1, Math.round(l / K.bayM)), lq & 255, lq >>> 8, (s * 5 + Math.floor(r * 16)) & 15] });
  // the roof: four faces, each a 3 × 3 grid from the eave (t = 0) to the ridge (t = 1); the eave's corners lifted and kicked out
  W.kind = HANOK_KIND.ROOF; W.w = [0, 0, 0, 0]; W.m[0] = slot;
  const prof = t => rise * (.45 * t + .55 * t * t);
  const faces = [   // [eave start, eave end, ridge start, ridge end, along-eave axis]
    [[-ae, be], [ae, be], [-ar, 0], [ar, 0], 0], [[ae, -be], [-ae, -be], [ar, 0], [-ar, 0], 0],
    [[ae, be], [ae, -be], [ar, 0], [ar, 0], 1], [[-ae, -be], [-ae, be], [-ar, 0], [-ar, 0], 1],
  ];
  for (const [e0, e1, r0, r1, axis] of faces) {
    const P = [], U = [];
    for (let ti = 0; ti < 3; ti++) for (let si = 0; si < 3; si++) {
      const s = si / 2, t = ti / 2, corner = si !== 1;
      let ex = lerp(e0[0], e1[0], s), ey = lerp(e0[1], e1[1], s);
      if (corner) { ex += Math.sign(ex) * kick; ey += Math.sign(ey) * kick }
      const x = lerp(ex, lerp(r0[0], r1[0], s), t), y = lerp(ey, lerp(r0[1], r1[1], s), t);
      P.push([x, y, ze + prof(t) + (corner ? lift * (1 - t) * (1 - t) : 0)]); U.push(axis ? y : x);
    }
    const tris = []; for (let ti = 0; ti < 2; ti++) for (let si = 0; si < 2; si++) { const q = ti * 3 + si; tris.push(q, q + 1, q + 4, q, q + 4, q + 3) }
    const N = smooth(P, tris), mid = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2, 1];   // out: away from the ridge, up
    F.mesh(P, N, U, tris, norm([mid[0], mid[1], Math.hypot(mid[0], mid[1])]));
    // the eave's underside, facing down: from the eave's three points in to the wall's top edge
    const q0 = [Math.sign(e0[0]) * a, Math.sign(e0[1]) * b, zt], q1 = [Math.sign(e1[0]) * a, Math.sign(e1[1]) * b, zt];
    const S = [P[0], P[1], P[2], q1, q0], down = [0, 0, -1];
    F.mesh(S, S.map(() => down), [0, 0, 0, 0, 0], [0, 1, 4, 1, 3, 4, 1, 2, 3], down);
  }
  // 용마루: a low box along the ridge
  const rl = ar + .35, rw = .26;
  box(F, rl, rw, zr - .15, ridgeTop, true);
}
// the vertex normals of a grid: the faces round each point, by area (the apex's zero triangles add nothing)
function smooth(P, tris) {
  const N = P.map(() => [0, 0, 0]);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2]; let n = cross(sub(P[b], P[a]), sub(P[c], P[a])); if (n[2] < 0) n = n.map(v => -v);
    for (const i of [a, b, c]) { N[i][0] += n[0]; N[i][1] += n[1]; N[i][2] += n[2] }
  }
  return N.map(norm);
}

// 담장: the rectangle ±h[0] × ±h[1] round a compound, a gate in the middle of one long side; each stretch drawn by the tile
// holding its middle. Returns the stretches drawn
function dam(tb, at, mine, ux, uy, h, K, r) {
  const C = K.compound, W = tb.W, t = C.wallThickM / 2, z = C.wallM, [hx, hy] = h, gate = Math.min(C.gateM, hx) / 2, side = r < .5 ? 1 : -1;
  const segs = [[[-hx, -side * hy], [hx, -side * hy]], [[hx, -hy], [hx, hy]], [[-hx, hy], [-hx, -hy]], [[-hx, side * hy], [-gate, side * hy]], [[gate, side * hy], [hx, side * hy]]];
  let n = 0;
  for (const [p, q] of segs) {
    const m = at((p[0] + q[0]) / 2, (p[1] + q[1]) / 2); if (!mine(m)) continue;
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l < .3) continue;
    const F = frame(tb, m, ux, uy), ex = (q[0] - p[0]) / l, ey = (q[1] - p[1]) / l, nx = -ey, ny = ex;   // in the stretch's own local terms (centred on m)
    const P = (s, d, zz) => { const x = (s - .5) * l, y = d; return [x * ex + y * nx, x * ey + y * ny, zz] };
    W.m = [0, 0, Math.min(255, Math.round((z + .35) * 10)), 0];
    W.kind = HANOK_KIND.DAM; const lq = Math.min(65535, Math.round(l * 20)); W.w = [0, lq & 255, lq >>> 8, 0];
    F.quad([P(0, t, 0), P(1, t, 0), P(1, t, z), P(0, t, z)], [nx, ny, 0], [0, l, l, 0]);
    F.quad([P(1, -t, 0), P(0, -t, 0), P(0, -t, z), P(1, -t, z)], [-nx, -ny, 0], [l, 0, 0, l]);
    F.quad([P(0, -t, 0), P(0, t, 0), P(0, t, z), P(0, -t, z)], [-ex, -ey, 0]);
    F.quad([P(1, t, 0), P(1, -t, 0), P(1, -t, z), P(1, t, z)], [ex, ey, 0]);
    // its 기와 cap: two slopes over the top
    W.kind = HANOK_KIND.ROOF; W.m[0] = 0; const c = t + .16, zc = z + .35, zo = z - .05;
    F.quad([P(0, c, zo), P(1, c, zo), P(1, 0, zc), P(0, 0, zc)], norm([nx * .35, ny * .35, c]), [0, l, l, 0]);
    F.quad([P(1, -c, zo), P(0, -c, zo), P(0, 0, zc), P(1, 0, zc)], norm([-nx * .35, -ny * .35, c]), [l, 0, 0, l]);
    n++;
  }
  return n;
}
