// 롤코 모드의 놀이기구 — the city's tall buildings (150 m and up) stand in as amusement-park rides.
//
// One self-contained WebGL2 layer. Four ride kinds, each a shared mesh drawn instanced: the mesh holds the
// shape in *unit space* (xy in radius units, z in height units) and every instance supplies its own scales,
// so a 555 m drop tower and a 160 m one are the same vertices. Animation is a uniform clock in the vertex
// shader (wheel turn, swing turn, saucer panels, the drop tower's rise/pause/drop/pause), so no buffer is
// rebuilt while they move; only the small per-frame instance list (18 floats a ride) is re-uploaded.
// opts.night hangs the festoon lights on the same instances: see buildBulbs / BULB_VS below.
//
//   const rides=new RideLayer(towers);           // [[lon,lat,footprintRadius_m,height_m], …]
//   rides.init(gl,maplibregl); rides.render(gl,matrix,opts); rides.sites(); rides.dispose(gl);
// opts.bearing is no longer read: a wheel keeps the yaw its hash gave it at every zoom.

import { BULB_FS, BULB_TWINKLE, BULB_PAL, NEON, RIBBON, RIBBON_FS, bulbSize, compile, hexRGB } from './park_night.mjs';
import { SEOUL_COASTER_STYLE as STYLE, ridePalette } from './coaster_style_seoul.mjs';

const EARTH = 40075016.685578488;
const mercX = lon => lon / 360 + .5;
const mercY = lat => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
const muOf = lat => 1 / (EARTH * Math.cos(lat * Math.PI / 180));   // mercator units a metre, as MercatorCoordinate.meterInMercatorCoordinateUnits()
const fnv1a = s => { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h >>> 0 };
const LOTTE = [127.102659, 37.512537];

// ── small vector helpers (unit space) ───────────────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] };

// ── mesh builder ────────────────────────────────────────────────────────────────────────────────
// 13 floats a vertex: a_v (the part that the animation turns) · a_w (the part it does not) ·
// normal · a_k = (colour slot, rot mode, xy-scale pick, shade bias).
// rot modes: 0 still · 1 turn about the mast (position and normal) · 2 turn about the wheel hub
//            (position and normal) · 3 the drop tower's ring, lifted · 4 orbit the hub, stays upright.
// colour slots: 0 ride colour A · 1 ride colour B · 2 structure · 3 structure shade — each one an
// index the instance supplies, so Lotte can take a gold mast and a blue ring from the same mesh.
const STILL = { mode: 0 }, SPIN = { mode: 1 }, LIFT = { mode: 3 };
const wheel = piv => ({ mode: 2, piv });
const orbit = (piv, arm) => ({ mode: 4, piv, arm });

class Mesh {
  constructor() { this.d = []; this.tris = 0 }
  v(C, p, n, o) {
    let a, b;
    if (C.mode === 1) { a = p; b = [0, 0, 0] }
    else if (C.mode === 2) { a = sub(p, C.piv); b = C.piv }
    else if (C.mode === 4) { a = C.arm; b = add(C.piv, p) }
    else { a = [0, 0, 0]; b = p }
    this.d.push(a[0], a[1], a[2], b[0], b[1], b[2], n[0], n[1], n[2], o.slot, C.mode, o.sel || 0, o.shade || 0);
  }
  tri(C, A, B, D, nA, nB, nD, o) { this.v(C, A, nA, o); this.v(C, B, nB, o); this.v(C, D, nD, o); this.tris++ }
  // a quad with a normal a corner
  quad(C, A, B, D, E, nA, nB, nD, nE, o) { this.tri(C, A, B, D, nA, nB, nD, o); this.tri(C, A, D, E, nA, nD, nE, o) }
  fan(C, c, pts, n, o) { for (let i = 0; i < pts.length; i++) this.tri(C, c, pts[i], pts[(i + 1) % pts.length], n, n, n, o) }
  buffer() { return new Float32Array(this.d) }
}

// a tube between two points, radius across the axis
function tube(M, C, p0, p1, rad, seg, o, cap0, cap1) {
  const u = norm(sub(p1, p0)), up = Math.abs(u[2]) < .9 ? [0, 0, 1] : [1, 0, 0];
  const a = norm(cross(u, up)), b = cross(u, a), ring = [];
  for (let i = 0; i < seg; i++) { const t = i / seg * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t); ring.push(norm([a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s])) }
  for (let i = 0; i < seg; i++) {
    const n0 = ring[i], n1 = ring[(i + 1) % seg];
    M.quad(C, add(p0, mul(n0, rad)), add(p0, mul(n1, rad)), add(p1, mul(n1, rad)), add(p1, mul(n0, rad)), n0, n1, n1, n0, o);
  }
  if (cap0) M.fan(C, p0, ring.map(n => add(p0, mul(n, rad))).reverse(), mul(u, -1), o);
  if (cap1) M.fan(C, p1, ring.map(n => add(p1, mul(n, rad))), u, o);
}
// a cone/skirt around the vertical axis from (r0,z0) to (r1,z1); alt: every other segment takes slot B
function cone(M, C, z0, r0, z1, r1, seg, o, alt, blk = 8) {
  const dr = r1 - r0, dz = z1 - z0, nl = Math.hypot(dr, dz) || 1, nr = dz / nl, nz = -dr / nl;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg * 2 * Math.PI, t1 = (i + 1) / seg * 2 * Math.PI, oo = alt != null && Math.floor(i * blk / seg) % 2 ? { ...o, slot: alt } : o;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const n0 = [c0 * nr, s0 * nr, nz], n1 = [c1 * nr, s1 * nr, nz];
    if (r0 === 0) M.tri(C, [0, 0, z0], [c1 * r1, s1 * r1, z1], [c0 * r1, s0 * r1, z1], n0, n1, n0, oo);
    else if (r1 === 0) M.tri(C, [c0 * r0, s0 * r0, z0], [c1 * r0, s1 * r0, z0], [0, 0, z1], n0, n1, n0, oo);
    else M.quad(C, [c0 * r0, s0 * r0, z0], [c1 * r0, s1 * r0, z0], [c1 * r1, s1 * r1, z1], [c0 * r1, s0 * r1, z1], n0, n1, n1, n0, oo);
  }
}
// a flat disc at z, facing up (dir 1) or down (dir -1)
function disc(M, C, z, rad, seg, o, dir = 1) {
  const n = [0, 0, dir], pts = [];
  for (let i = 0; i < seg; i++) { const t = (dir > 0 ? i : seg - i) / seg * 2 * Math.PI; pts.push([Math.cos(t) * rad, Math.sin(t) * rad, z]) }
  M.fan(C, [0, 0, z], pts, n, o);
}
// an annulus with a top, a bottom and both rims (the drop tower's seat ring)
function band(M, C, z0, z1, ri, ro, seg, o, alt, blk = 8) {
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg * 2 * Math.PI, t1 = (i + 1) / seg * 2 * Math.PI, oo = alt != null && Math.floor(i * blk / seg) % 2 ? { ...o, slot: alt } : o;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const O0 = [c0 * ro, s0 * ro], O1 = [c1 * ro, s1 * ro], I0 = [c0 * ri, s0 * ri], I1 = [c1 * ri, s1 * ri];
    M.quad(C, [...I0, z1], [...I1, z1], [...O1, z1], [...O0, z1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], oo);
    M.quad(C, [...O0, z0], [...O1, z0], [...I1, z0], [...I0, z0], [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1], oo);
    M.quad(C, [...O0, z0], [...O0, z1], [...O1, z1], [...O1, z0], [c0, s0, 0], [c0, s0, 0], [c1, s1, 0], [c1, s1, 0], oo);
    M.quad(C, [...I1, z0], [...I1, z1], [...I0, z1], [...I0, z0], [-c1, -s1, 0], [-c1, -s1, 0], [-c0, -s0, 0], [-c0, -s0, 0], oo);
  }
}
// a box centred at c, half-extents (hx along its yaw, hy across, hz up)
function box(M, C, c, hx, hy, hz, yaw, o) {
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  box3(M, C, c, [ca, sa, 0], [-sa, ca, 0], [0, 0, 1], hx, hy, hz, o);
}
// the same with the frame given, for parts that lie in the wheel's vertical plane
function box3(M, C, c, X, Y, Z, hx, hy, hz, o) {
  const P = (i, j, k) => [0, 1, 2].map(d => c[d] + X[d] * hx * i + Y[d] * hy * j + Z[d] * hz * k);
  const face = (n, a, b, d, e) => M.quad(C, a, b, d, e, n, n, n, n, o);
  face(X, P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1));
  face(mul(X, -1), P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1));
  face(Y, P(1, 1, -1), P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1));
  face(mul(Y, -1), P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1));
  face(Z, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1));
  face(mul(Z, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1));
}
// a torus in the XZ plane (the wheel's rim), axis along Y
function torusY(M, C, c, R, t, nMaj, nMin, o) {
  const pt = (i, j) => {
    const a = i / nMaj * 2 * Math.PI, b = j / nMin * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    return [[c[0] + (R + t * cb) * ca, c[1] + t * sb, c[2] + (R + t * cb) * sa], [cb * ca, sb, cb * sa]];
  };
  for (let i = 0; i < nMaj; i++) for (let j = 0; j < nMin; j++) {
    const [a, na] = pt(i, j), [b, nb] = pt(i + 1, j), [d, nd] = pt(i + 1, j + 1), [e, ne] = pt(i, j + 1);
    M.quad(C, a, b, d, e, na, nb, nd, ne, o);
  }
}

// ── the four rides, in unit space ───────────────────────────────────────────────────────────────
// xy are radius units (×Sxy, or ×Smast where sel=1); z is height units (×Sz). Spec section 3.
const CREAM = { slot: 2 }, SHADE = { slot: 3 }, A = { slot: 0 }, B = { slot: 1 };
const RED={slot:4},GOLD_TONE={slot:5},CREAM_TONE={slot:6},IVORY={slot:7},TEAL={slot:8};
const mast = s => ({ ...s, sel: 1 });

// Drop tower — mast H, a seat ring that rises to 0.82H and falls, a small cone crown.
function buildDrop(lod) {
  const M = new Mesh(), seg = lod ? 12 : 7, rs = lod ? 24 : 12, seats = lod ? 12 : 6, nb = lod ? 8 : 4;
  for (let i = 0; i < nb; i++)                                             // the mast, in broad alternating bands
    tube(M, STILL, [0, 0, i / nb], [0, 0, (i + 1) / nb], 1, seg, mast(CREAM), false, false);
  cone(M, STILL, .004, 2.5, .022, 1.5, seg, mast(SHADE));                 // a low foot, not a slab
  disc(M, STILL, .022, 1.5, seg, mast(SHADE));
  if (lod) for (let i = 0; i < 3; i++) {                                   // three slim guide rails up the mast
    const t = i / 3 * 2 * Math.PI;
    tube(M, STILL, [Math.cos(t) * 1.25, Math.sin(t) * 1.25, .02], [Math.cos(t) * 1.25, Math.sin(t) * 1.25, .97], .17, 4, mast(SHADE));
  }
  cone(M, STILL, .985, 1.9, 1.0, 1.8, seg, mast(SHADE));                   // the crown
  cone(M, STILL, 1.0, 1.8, 1.05, 0, seg, mast(GOLD_TONE));
  band(M, LIFT, 0, .025, .62, 1, rs, A, 1, 8);                             // the seat ring, in eight broad blocks
  for (let i = 0; i < seats; i++) {                                        // seats slung under its outer edge
    const t = i / seats * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    box(M, LIFT, [c * .83, s * .83, -.016], .09, .08, .016, t, i % 2 ? B : A);
    box(M, LIFT, [c * .905, s * .905, -.008], .02, .075, .024, t, SHADE);
  }
  return M;
}
// Ferris wheel — everything in D units (Sxy = Sz = D): bottom clearance .08, hub .58, rim radius .5.
function buildFerris(lod) {
  const M = new Mesh(), hub = [0, 0, .58], maj = lod ? 32 : 16, min = lod ? 4 : 3, cab = lod ? 12 : 8, lg = lod ? 6 : 4, sp = lod ? 12 : 8;
  for (const y of [-.085, .085]) {                                         // two open A-frames
    for (const x of [-.34, .34]) tube(M, STILL, [x, y, 0], [0, y, .575], .018, lg, TEAL, false, lod === 1);
    box(M, STILL, [0, y, .21], .19, .011, .011, 0, TEAL);                  // the brace across each A
  }
  box(M, STILL, [0, 0, .5], .014, .085, .014, 0, TEAL);                   // the tie between them
  tube(M, STILL, [0, -.105, .58], [0, .105, .58], .03, lod ? 10 : 6, SHADE, true, lod === 1);
  for (const y of (lod ? [-.058, .058] : [0])) torusY(M, wheel(hub), [0, y, .58], .5, .005, maj, min, {...IVORY,sel:2});
  for (let i = 0; i < sp; i++) {                                           // slender spokes, in the wheel's plane
    const t = i / sp * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    tube(M, wheel(hub), [0, 0, .58], [c * .49, 0, .58 + s * .49], lod ? .009 : .013, 4, CREAM, false, false);
    if (lod) for (const y of [-.058, .058]) tube(M, wheel(hub), [c * .2, y * .36, .58 + s * .2], [c * .49, y, .58 + s * .49], .006, 3, CREAM, false, false);
  }
  for (let i = 0; i < cab; i++) {                                          // upright gondolas: .065D across, .08D tall
    const t = i / cab * 2 * Math.PI, arm = [Math.cos(t) * .5, 0, Math.sin(t) * .5], C = orbit(hub, arm);
    box(M, C, [0, 0, -.072], .0275, .0325, .04, 0, i/cab < .5 ? CREAM_TONE : i/cab < 10/12 ? RED : GOLD_TONE);
    if (lod) { box(M, C, [0, 0, -.018], .007, .007, .018, 0, SHADE);       // the hanger and the footboard
               box(M, C, [0, 0, -.115], .024, .03, .005, 0, SHADE) }
  }
  return M;
}
// Sky swing — mast .90H, a shallow canopy at .78H radius r, eight seats on .14H suspensions.
function buildSwing(lod) {
  const M = new Mesh(), seg = lod ? 10 : 6, cs = STYLE.rides.swingSides, n = lod ? 12 : 8;
  tube(M, STILL, [0, 0, 0], [0, 0, .9], 1, seg, mast(CREAM), false, false);
  cone(M, STILL, .004, 2.4, .02, 1.4, seg, mast(SHADE)); disc(M, STILL, .02, 1.4, seg, mast(SHADE));
  cone(M, STILL, .9, 1.2, .93, 0, seg, mast(B));
  cone(M, SPIN, .775, 1, .818, .13, cs, CREAM_TONE);                              // the canopy, in alternating wedges
  disc(M, SPIN, .818, .13, cs, CREAM_TONE);
  disc(M, SPIN, .772, 1, cs, SHADE, -1);
  cone(M, SPIN, .765, .98, .775, 1, cs, GOLD_TONE);                             // its rim
  for (let i = 0; i < n; i++) {
    const t = i / n * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    tube(M, SPIN, [c * .9, s * .9, .768], [c * 1.06, s * 1.06, .636], .006, 4, TEAL, false, false);
    box(M, SPIN, [c * 1.06, s * 1.06, .618], .085, .075, .016, t, RED);
    box(M, SPIN, [c * 1.115, s * 1.115, .646], .014, .07, .03, t, RED);   // the backrest
  }
  return M;
}
// Observation saucer — mast .95H, a disc at .80H radius r thickness .055H, a cone cap reaching H.
function buildSaucer(lod) {
  const M = new Mesh(), seg = lod ? 10 : 6, ds = lod ? 20 : 10, n = 8;
  tube(M, STILL, [0, 0, 0], [0, 0, .95], 1, seg, mast(CREAM), false, false);
  cone(M, STILL, .004, 2.4, .02, 1.4, seg, mast(SHADE)); disc(M, STILL, .02, 1.4, seg, mast(SHADE));
  disc(M, STILL, .8, .72, ds, TEAL, -1);                                       // the saucer: under, rim, over
  cone(M, STILL, .8, .72, .8275, 1, ds, TEAL);
  cone(M, STILL, .8275, 1, .855, .8, ds, CREAM_TONE);
  disc(M, STILL, .855, .8, ds, CREAM_TONE);
  cone(M, STILL, .855, .55, .90, 0, lod ? 16 : 8, CREAM_TONE);                         // the cap, to the top of the tower
  for (let i = 0; i < n; i++) {                                             // alternating rim panels
    const t = (i + .5) / n * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    box(M, SPIN, [c * .995, s * .995, .8275 + (i % 2 ? .008 : -.008)], .015, .08, .006, t, GOLD_TONE);
  }
  return M;
}
// ── the lights the rides wear at night (opts.night) ─────────────────────────────────────────────
// One point sprite a bulb, on the same unit-space / rot-mode scheme as the ride mesh, so a bulb on the
// wheel rim turns with the rim and a bulb on the seat ring rides up and drops with it — no CPU work.
//   a_k = (bulb colour 0-3, rot mode, xy-scale pick, tier)   tier 0 outline · 1 spokes · 2 garland
//   a_e = (parameter, role)  role 0 plain · 1 rim (parameter = the way round, for the slow wave)
//                                 2 ground garland (parameter = along the string) · 3 Lotte's extra mast strings
class Bulbs {
  constructor() { this.d = []; this.n = 0 }
  at(C, p, col, tier, sel, param = 0, role = 0) {
    let a, b;
    if (C.mode === 1) { a = p; b = [0, 0, 0] }
    else if (C.mode === 2) { a = sub(p, C.piv); b = C.piv }
    else if (C.mode === 4) { a = C.arm; b = add(C.piv, p) }
    else { a = [0, 0, 0]; b = p }
    this.d.push(a[0], a[1], a[2], b[0], b[1], b[2], col, C.mode, sel, tier, param, role);
    this.n++;
  }
  ring(C, n, rad, z, col0, tier, sel, role) {    // a string of bulbs the whole way round
    for (let i = 0; i < n; i++) { const t = i / n * 2 * Math.PI; this.at(C, [Math.cos(t) * rad, Math.sin(t) * rad, z], col0(i), tier, sel, i / n, role) }
  }
  buffer() { return new Float32Array(this.d) }
}
// One bulb in three is the warm cream; the rest run through the seven accents, and each ride turns
// the accents on by its own hash, so two swings side by side are not the same string twice.
const bulbCol = i => i % 5 === 0 ? 1 : 0;
const GARLANDS = 4, GSPAN = 10;   // legacy wire mesh remains reusable, but outline tier has no ground garlands
function buildBulbs(kind) {
  const B=new Bulbs(),hub=[0,0,.58];
  if(kind==='ferris')for(let i=0;i<64;i++){const t=i/64*2*Math.PI;B.at(wheel(hub),[Math.cos(t)*.51,0,.58+Math.sin(t)*.51],bulbCol(i),0,0,i/64,1)}
  else if(kind==='swing')B.ring(SPIN,40,1.01,.777,bulbCol,0,0,1);
  else if(kind==='saucer')B.ring(STILL,40,1.01,.8275,bulbCol,0,0,1);
  else B.ring(STILL,24,1.9,1.0,bulbCol,0,1,1);
  return B;
}
// the wire the garland bulbs hang on, plus the little pole at its far end
function buildWire() {
  const d = [];
  const put = (dir, t) => d.push(0, 0, 0, dir[0], dir[1], 0, 0, 0, 0, 2, t, 2);   // the direction sits in a_w, as it does for a still bulb
  for (let g = 0; g < GARLANDS; g++) {
    const a = g / GARLANDS * 2 * Math.PI, dir = [Math.cos(a), Math.sin(a)];
    for (let j = 0; j < 12; j++) { put(dir, j / 12); put(dir, (j + 1) / 12) }
    d.push(0, 0, 0, dir[0], dir[1], 0, 0, 0, 0, 2, 1, 4);   // the pole: up from the ground to where the string ends
    put(dir, 1);
  }
  return new Float32Array(d);
}

// The ride's own frame, shared by the bulbs and the neon: where a point ends up once the animation
// has turned it and the ride's yaw has been applied, in metres about the site.
const RIDE_DIMENSIONS = `
vec3 rideDimensions(vec3 p,vec4 size,vec4 anim,float sel){
  if(anim.z>70.&&anim.z<80.&&sel>1.5){
    float k=clamp(size.x*.01,${STYLE.rides.rimM[0]},${STYLE.rides.rimM[1]})/(size.x*.01);
    vec2 d=vec2(p.x,p.z-size.y*.58);float r=length(d);
    d*=((r-size.x*.5)*k+size.x*.5)/max(r,1e-6);p.x=d.x;p.z=d.y+size.y*.58;
    float y=abs(p.y)>size.x*.03?sign(p.y)*size.x*.058:0.;p.y=y+(p.y-y)*k;
  }
  if(anim.z<21.&&p.z>size.y)p.z=size.y+(p.z-size.y)*min(size.y*${STYLE.rides.crownHeightRatio},${STYLE.rides.crownHeightM}.)/(size.y*.05);
  if(anim.z>89.&&sel<.5&&p.z>size.y*.8)p.z=size.y*.8+(p.z-size.y*.8)*clamp(size.y*${STYLE.rides.saucerThicknessRatio},${STYLE.rides.saucerThicknessM[0]}.,${STYLE.rides.saucerThicknessM[1]}.)/(size.y*.055);
  return p;
}`;
const RIDE_POINT = `
${RIDE_DIMENSIONS}
vec3 ridePoint(vec3 av, vec3 aw, float m, float sel, float tt, vec4 iS, vec4 iA){
  float sxy = sel > .5 && sel < 1.5 ? iS.z : iS.x, sz = iS.y, p6 = 6.283185307;
  vec3 v = vec3(av.xy * sxy, av.z * sz), w = vec3(aw.xy * sxy, aw.z * sz), p;
  if (m < .5) p = v + w;
  else if (m < 1.5){ float g = p6 * fract(tt / iA.z), c = cos(g), s = sin(g);
    p = vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z) + w; }
  else if (m < 2.5){ float g = p6 * fract(tt / iA.z), c = cos(g), s = sin(g);
    p = vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c) + w; }
  else if (m < 3.5){ float u = fract(tt / 20.) * 20., f;
    if (u < 12.) f = smoothstep(0., 1., u / 12.);
    else if (u < 14.) f = 1.;
    else if (u < 18.){ float q = (u - 14.) * .25; f = 1. - q * q * (2. - q); }
    else f = 0.;
    p = v + w; p.z += (.15 + .67 * f) * sz; }
  else { float g = p6 * fract(tt / iA.z), c = cos(g), s = sin(g);
    p = vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c) + w; }
  p=rideDimensions(p,iS,iA,sel);
  float yc = cos(iA.w), ys = sin(iA.w);
  return vec3(p.x * yc - p.y * ys, p.x * ys + p.y * yc, p.z);
}`;

// a strip of neon on a ride: a run of segments, each widened across the screen
class Neon {
  constructor() { this.d = []; this.n = 0 }
  seg(C, p0, p1, { sel = 0, tier = 0, param = 0 } = {}) {
    const A = vw(C, p0), B = vw(C, p1);
    for (const [t, side] of [[0, -1], [0, 1], [1, 1], [0, -1], [1, 1], [1, -1]]) {
      this.d.push(A[0][0], A[0][1], A[0][2], A[1][0], A[1][1], A[1][2],
        B[0][0], B[0][1], B[0][2], B[1][0], B[1][1], B[1][2], param, C.mode, sel, tier, t, side);
      this.n++;
    }
  }
  loop(C, n, rad, z, o, plane) {
    for (let i = 0; i < n; i++) {
      const a = i / n * 2 * Math.PI, b = (i + 1) / n * 2 * Math.PI, P = t => plane
        ? [Math.cos(t) * rad, 0, z + Math.sin(t) * rad] : [Math.cos(t) * rad, Math.sin(t) * rad, z];
      this.seg(C, P(a), P(b), { ...o, param: i / n });
    }
  }
  buffer() { return new Float32Array(this.d) }
}
// the (turned, not turned) split a context implies, as Bulbs.at does it
function vw(C, p) {
  if (C.mode === 1) return [p, [0, 0, 0]];
  if (C.mode === 2) return [sub(p, C.piv), C.piv];
  if (C.mode === 4) return [C.arm, add(C.piv, p)];
  return [[0, 0, 0], p];
}
function buildNeon(kind) {
  const N=new Neon();
  if(kind==='drop')N.loop(STILL,24,1.9,1.,{sel:1},false);
  else if(kind==='saucer')N.loop(STILL,48,1.02,.8275,{},false);
  else if(kind==='swing')N.loop(SPIN,8,1.01,.777,{},false);
  else N.loop(wheel([0,0,.58]),48,.505,.58,{},true);
  return N;
}

const KINDS = ['drop', 'ferris', 'swing', 'saucer'];
const INST = [[4, 2], [5, 4], [6, 4], [7, 4], [8, 4]];   // the instance attributes, shared by the ride mesh and its lights
const BUILD = { drop: buildDrop, ferris: buildFerris, swing: buildSwing, saucer: buildSaucer };

// ── shaders ─────────────────────────────────────────────────────────────────────────────────────
const VS = `#version 300 es
layout(location=0) in vec3 a_v;      // turned by the animation
layout(location=1) in vec3 a_w;      // not turned
layout(location=2) in vec3 a_n;
layout(location=3) in vec4 a_k;      // colour slot, rot mode, xy-scale pick, shade bias
layout(location=4) in vec2 i_org;    // mercator, local origin taken off
layout(location=5) in vec4 i_s;      // Sxy, Sz, Smast (metres), mercator units a metre
layout(location=6) in vec4 i_a;      // phase s, rate (0 frozen), period s, yaw
layout(location=7) in vec4 i_c;      // palette index: ride A, ride B, structure, structure shade
uniform mat4 u_matrix; uniform float u_time; uniform vec3 u_pal[10]; uniform vec3 u_light; uniform vec2 u_lit;
out vec3 v_col;
${RIDE_DIMENSIONS}
void main(){
  float sxy = a_k.z > .5 && a_k.z < 1.5 ? i_s.z : i_s.x, sz = i_s.y;
  vec3 v = vec3(a_v.xy*sxy, a_v.z*sz), w = vec3(a_w.xy*sxy, a_w.z*sz);
  vec3 n = vec3(a_n.xy/sxy, a_n.z/sz);                       // the inverse transpose of a diagonal scale
  float tt = u_time*i_a.y + i_a.x, m = a_k.y, p6 = 6.283185307;
  vec3 p;
  if(m < .5) p = v + w;
  else if(m < 1.5){ float g = p6*fract(tt/i_a.z), c = cos(g), s = sin(g);   // about the mast
    p = vec3(v.x*c - v.y*s, v.x*s + v.y*c, v.z) + w; n = vec3(n.x*c - n.y*s, n.x*s + n.y*c, n.z); }
  else if(m < 2.5){ float g = p6*fract(tt/i_a.z), c = cos(g), s = sin(g);   // about the wheel hub
    p = vec3(v.x*c + v.z*s, v.y, -v.x*s + v.z*c) + w; n = vec3(n.x*c + n.z*s, n.y, -n.x*s + n.z*c); }
  else if(m < 3.5){                                                         // the drop tower: 12 s up, 2, 4 s down, 2
    float u = fract(tt/20.)*20., f;
    if(u < 12.) f = smoothstep(0., 1., u/12.);
    else if(u < 14.) f = 1.;
    else if(u < 18.){ float t = (u - 14.)*.25; f = 1. - t*t*(2. - t); }
    else f = 0.;
    p = v + w; p.z += (.15 + .67*f)*sz; }
  else { float g = p6*fract(tt/i_a.z), c = cos(g), s = sin(g);              // orbits the hub, stays upright
    p = vec3(v.x*c + v.z*s, v.y, -v.x*s + v.z*c) + w; }
  p=rideDimensions(p,i_s,i_a,a_k.z);
  float yc = cos(i_a.w), ys = sin(i_a.w);
  p = vec3(p.x*yc - p.y*ys, p.x*ys + p.y*yc, p.z);
  n = vec3(n.x*yc - n.y*ys, n.x*ys + n.y*yc, n.z);
  gl_Position = u_matrix * vec4(i_org + p.xy*i_s.w, p.z*i_s.w, 1.);
  int ci = int(a_k.x >= 4. ? a_k.x - 4. : a_k.x < .5 ? i_c.x : a_k.x < 1.5 ? i_c.y : a_k.x < 2.5 ? i_c.z : i_c.w);
  float nl = length(n);
  float d = nl > 1e-20 ? max(dot(n / nl, u_light), 0.) : 0.;   // never normalize a zero: a NaN colour rasterizes differently every frame
  v_col = clamp(u_pal[ci]*(u_lit.x + u_lit.y*d + a_k.w), 0., 1.);
}`;
const FS = `#version 300 es
precision highp float; in vec3 v_col; out vec4 o; void main(){ o = vec4(v_col, 1.); }`;

// the festoon lights: one sprite a bulb, instanced over the rides, carried by the same animation
const BULB_VS = `#version 300 es
layout(location=0) in vec3 a_v;
layout(location=1) in vec3 a_w;
layout(location=2) in vec4 a_k;      // bulb colour 0-3, rot mode, xy-scale pick, tier
layout(location=3) in vec2 a_e;      // parameter, role (0 plain · 1 rim · 2 garland · 3 Lotte's extra strings · 4 garland pole foot)
layout(location=4) in vec2 i_org;
layout(location=5) in vec4 i_s;
layout(location=6) in vec4 i_a;
layout(location=8) in vec4 i_n;      // garlands on, collar height m, pole radius m, the ride's place in the accent colours
uniform mat4 u_matrix; uniform float u_time, u_size, u_core, u_tier, u_thin, u_anim, u_bright, u_neonOn;
uniform vec3 u_pal[8];
out vec3 v_rgb; out vec2 v_mix;
${BULB_TWINKLE}
${RIDE_DIMENSIONS}
void kill(){ gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; }
void main(){
  float role = a_e.y, tier = a_k.w;
  if (tier < -.5) { if (u_neonOn > .5) { kill(); return; } tier = -tier - 1.; }   // a row the neon replaces
  if (tier > u_tier + .5) { kill(); return; }
  bool garland = role > 1.5 && role < 2.5 || role > 3.5;                  // the string, and the little pole at its end
  if (garland && i_n.x < .5) { kill(); return; }                          // Lotte has the spiral round it: no garlands
  if (role > 2.5 && role < 3.5 && i_n.x > .5) { kill(); return; }         // the two extra mast strings are Lotte's only
  if (u_thin > 1.5 && mod(float(gl_VertexID), u_thin) >= .5) { kill(); return; }
  float tt = u_time * i_a.y + i_a.x, p6 = 6.283185307;
  vec3 p;
  if (garland) {                                                           // worked straight in metres: a collar on the mast
    vec2 dir = a_v.xy + a_w.xy;                                            // down and out to a 6 m pole, with a sag in the middle
    float t = a_e.x;
    p = mix(vec3(0., 0., i_n.y), vec3(dir * i_n.z, 6.), t);
    if (role > 3.5) p.z = 0.;                                              // the pole's foot, on the ground under the string's end
    else p.z -= 16. * t * (1. - t);                                        // about 4 m of sag
  } else {
    float sxy = a_k.z > .5 ? i_s.z : i_s.x, sz = i_s.y, m = a_k.y;
    vec3 v = vec3(a_v.xy * sxy, a_v.z * sz), w = vec3(a_w.xy * sxy, a_w.z * sz);
    if (m < .5) p = v + w;
    else if (m < 1.5){ float g = p6 * fract(tt / i_a.z), c = cos(g), sn = sin(g);
      p = vec3(v.x * c - v.y * sn, v.x * sn + v.y * c, v.z) + w; }
    else if (m < 2.5){ float g = p6 * fract(tt / i_a.z), c = cos(g), sn = sin(g);
      p = vec3(v.x * c + v.z * sn, v.y, -v.x * sn + v.z * c) + w; }
    else if (m < 3.5){ float u = fract(tt / 20.) * 20., f;
      if (u < 12.) f = smoothstep(0., 1., u / 12.);
      else if (u < 14.) f = 1.;
      else if (u < 18.){ float q = (u - 14.) * .25; f = 1. - q * q * (2. - q); }
      else f = 0.;
      p = v + w; p.z += (.15 + .67 * f) * sz; }
    else { float g = p6 * fract(tt / i_a.z), c = cos(g), sn = sin(g);
      p = vec3(v.x * c + v.z * sn, v.y, -v.x * sn + v.z * c) + w; }
  }
  p=rideDimensions(p,i_s,i_a,a_k.z);
  float yc = cos(i_a.w), ys = sin(i_a.w);
  p = vec3(p.x * yc - p.y * ys, p.x * ys + p.y * yc, p.z);
  gl_Position = u_matrix * vec4(i_org + p.xy * i_s.w, p.z * i_s.w, 1.);
  gl_Position.z -= 3.5e-4 * gl_Position.w;                                 // a hair in front of the surface it is fixed to
  gl_PointSize = u_size;
  float b = u_bright;
  if (role > .5 && role < 1.5) b *= .70 + .30 * (.5 + .5 * cos(p6 * (a_e.x - u_time * u_anim / 12.)));   // one slow wave round the rim every 12 s
  b *= twinkle(hash1(float(gl_VertexID) * .19 + i_a.x * .77), u_time, u_anim);
  v_rgb = u_pal[a_k.x < .5 ? 0 : 1 + int(mod(a_k.x - 1. + i_n.w, 7.))];   // every ride starts the accents at its own place
  v_mix = vec2(u_core, b);
}`;
const NEON_VS = `#version 300 es
layout(location=0) in vec3 a_v;      // the segment's first end, turned / not turned
layout(location=1) in vec3 a_w;
layout(location=2) in vec3 a_v2;     // its second end
layout(location=3) in vec3 a_w2;
layout(location=9) in vec4 a_g;      // place round the loop, rot mode, xy-scale pick, tier
layout(location=10) in vec2 a_e;     // along the segment, across it
layout(location=4) in vec2 i_org;
layout(location=5) in vec4 i_s;
layout(location=6) in vec4 i_a;
uniform mat4 u_matrix; uniform float u_time, u_half, u_core, u_tier, u_chase, u_anim;
uniform vec2 u_vp; uniform vec3 u_neon;
out vec3 v_rgb; out vec3 v_mix;
${RIDE_POINT}
${RIBBON}
void main(){
  if (a_g.w > u_tier + .5) { gl_Position = vec4(2., 2., 2., 1.); return; }
  float tt = u_time * i_a.y + i_a.x;
  vec3 A = ridePoint(a_v, a_w, a_g.y, a_g.z, tt, i_s, i_a);
  vec3 B = ridePoint(a_v2, a_w2, a_g.y, a_g.z, tt, i_s, i_a);
  vec4 cA = u_matrix * vec4(i_org + A.xy * i_s.w, A.z * i_s.w, 1.);
  vec4 cB = u_matrix * vec4(i_org + B.xy * i_s.w, B.z * i_s.w, 1.);
  gl_Position = ribbon(cA, cB, a_e.x, a_e.y, u_half, u_vp);
  gl_Position.z -= 3.5e-4 * gl_Position.w;     // a hair in front of the surface it is fixed to
  float b = .80;
  if (u_chase > .5) b += .55 * smoothstep(.15, 0., fract(a_g.x - u_time * u_anim / 14.));   // one bright length, once round every 14 s
  v_rgb = u_neon; v_mix = vec3(a_e.y, u_core, b);
}`;
const WIRE_FS = `#version 300 es
precision highp float; uniform vec4 u_wire; out vec4 o;
void main(){ o = vec4(u_wire.rgb * u_wire.a, u_wire.a); }`;

const SUN = norm([-.30, .46, .84]);   // +x east, +y south (mercator), +z up: a high south-western sun
// The rides do not borrow the building palette: they need to separate from the blocks they replace.
const RIDE_LIGHT = ridePalette(false), RIDE_DARK = ridePalette(true);
const GOLD = 8, RING = 9, STRUCT = 6, SHADE_I = 7;
// the ride grows toward the viewer as the map pulls back, or a 200 m tower is three pixels of stalk
const EXAG = [13.5, 14.5, 15.5], EXAG_H = [2.4, 1.6, 1], EXAG_V = [1.35, 1.15, 1];
const atZoom = (z, v) => z <= EXAG[0] ? v[0] : z >= EXAG[2] ? v[2]
  : z <= EXAG[1] ? v[0] + (v[1] - v[0]) * (z - EXAG[0]) : v[1] + (v[2] - v[1]) * (z - EXAG[1]);

export class RideLayer {
  constructor(towers) {
    this.towers = towers || [];
    this.O = { x: mercX(126.978), y: mercY(37.5665) };
    this.M = new Float32Array(16);
    this._sites = this.towers.map(([lon, lat, fr, H], i) => {
      const R = .7 * fr, q = fnv1a(lon.toFixed(5) + ',' + lat.toFixed(5));
      const lotte = Math.abs(lon - LOTTE[0]) < 1e-4 && Math.abs(lat - LOTTE[1]) < 1e-4;
      // the ride head: broad enough at close zoom to read as an attraction, not a pin
      const r = Math.min(Math.max(.9 * R, .12 * H, 24), 55), mastR = Math.min(Math.max(.025 * H, 5), 10);
      const kind = lotte || H >= 300 ? 'drop' : R >= 30 && q % 2 === 0 ? 'ferris' : q % 2 === 0 ? 'swing' : 'saucer';
      const D = Math.min(Math.max(Math.min(.85 * H, 2.8 * R), 90), 170);
      const s = {
        i, lon, lat, x: mercX(lon), y: mercY(lat), mu: muOf(lat), radius_m: fr, height_m: H, kind, lotte, q, R, r, mastR,
        colA: 0, colB: 1, struct: STRUCT, shade: SHADE_I,
        yaw: (q >>> 8 & 1023) / 1024 * Math.PI * 2, phase: (q >>> 18 & 255) / 255 * 90,
        period: kind === 'ferris' ? 75 : kind === 'swing' ? 40 : kind === 'saucer' ? 90 : 20,
      };
      // Lotte: 555 m, mast 12 m, ring 28 m, nothing past 32 m from the spiral axis, and its own colours
      if (lotte) { s.mastR = 12; s.r = 28; s.colA = RING; s.colB = STRUCT; s.struct = GOLD; s.shade = STRUCT }
      s.sxy = kind === 'ferris' ? D : s.r;
      s.sz = kind === 'ferris' ? D : H;
      s.top = kind === 'ferris' ? 1.1 * D : kind === 'drop' ? 1.08 * H : H;   // metres, for the cull margin
      s.wide = kind === 'ferris' ? .55 * D : Math.max(1.2 * s.r, 2.6 * s.mastR);
      s.collar = Math.min(.25 * H, 35);                                     // where the night garlands are tied on
      s.pole = Math.min(1.3 * (kind === 'ferris' ? .5 * D : s.r), 65);
      s.hue = (q >>> 3) % 7;                                                // where this ride starts in the accent colours
      return s;
    });
    this.stats = { tris: 0, rides: 0, ms: 0 };
    this._moving = false; this.ping = 0;
  }

  // the canonical sites, so the caller can take these buildings out of the extrusion / walls / shadows
  sites() { return this._sites.map(s => ({ lon: s.lon, lat: s.lat, x: s.x, y: s.y, radius_m: s.radius_m, height_m: s.height_m, kind: s.kind })) }

  init(gl, maplibregl) {
    if (this.p) return;
    if (maplibregl?.MercatorCoordinate) {                                   // exactly the map's own numbers
      const O = maplibregl.MercatorCoordinate.fromLngLat([126.978, 37.5665]); this.O = { x: O.x, y: O.y };
      for (const s of this._sites) { const m = maplibregl.MercatorCoordinate.fromLngLat([s.lon, s.lat]); s.x = m.x; s.y = m.y; s.mu = m.meterInMercatorCoordinateUnits() }
    }
    this.p = compile(gl, VS, FS);
    this.uni = Object.fromEntries(['u_matrix', 'u_time', 'u_pal', 'u_light', 'u_lit'].map(n => [n, gl.getUniformLocation(this.p, n)]));

    this.pB = compile(gl, BULB_VS, BULB_FS);
    this.uB = Object.fromEntries(['u_matrix', 'u_time', 'u_size', 'u_core', 'u_tier', 'u_thin', 'u_anim', 'u_bright', 'u_pal', 'u_wt', 'u_neonOn'].map(n => [n, gl.getUniformLocation(this.pB, n)]));
    this.pW = compile(gl, BULB_VS, WIRE_FS);
    this.uW = Object.fromEntries(['u_matrix', 'u_time', 'u_size', 'u_core', 'u_tier', 'u_thin', 'u_anim', 'u_bright', 'u_pal', 'u_wt', 'u_neonOn', 'u_wire'].map(n => [n, gl.getUniformLocation(this.pW, n)]));
    this.bulbRGB = new Float32Array(BULB_PAL.flatMap(hexRGB));
    this.pN = compile(gl, NEON_VS, RIBBON_FS);
    this.uN = Object.fromEntries(['u_matrix', 'u_time', 'u_half', 'u_core', 'u_tier', 'u_chase', 'u_anim', 'u_vp', 'u_neon', 'u_wt'].map(n => [n, gl.getUniformLocation(this.pN, n)]));
    this.neonRGB = Object.fromEntries(Object.entries(NEON).map(([k, h]) => [k, new Float32Array(hexRGB(h))]));
    this.wireBuf = buildWire();

    this.kind = {};
    for (const k of KINDS) {
      const K = this.kind[k] = { order: [], inst: [gl.createBuffer(), gl.createBuffer()], data: null, lod: [] };
      K.order = this._sites.filter(s => s.kind === k);
      K.data = new Float32Array(K.order.length * 18);
      for (const b of K.inst) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, K.data.byteLength, gl.DYNAMIC_DRAW) }
      for (const lod of [0, 1]) {
        const M = BUILD[k](lod), buf = M.buffer(), vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
        const va = gl.createVertexArray(); gl.bindVertexArray(va);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        const S = 13 * 4; let o = 0;
        for (const [loc, n] of [[0, 3], [1, 3], [2, 3], [3, 4]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, o); o += n * 4 }
        gl.bindVertexArray(null);
        K.lod[lod] = { va, vb, n: M.tris * 3, tris: M.tris };
      }
      // the lights: one mesh a kind (no LOD; tiers and a stride thin them), on the same instance buffer
      const lit = (buf, count) => {
        const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
        const va = gl.createVertexArray(); gl.bindVertexArray(va);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        const S = 12 * 4; let o = 0;
        for (const [loc, n] of [[0, 3], [1, 3], [2, 4], [3, 2]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, o); o += n * 4 }
        gl.bindVertexArray(null);
        return { va, vb, n: count };
      };
      const B = buildBulbs(k);
      K.bulb = lit(B.buffer(), B.n);
      { const N = buildNeon(k), buf = N.buffer();                           // the signature outline
        const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
        const va = gl.createVertexArray(); gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        let o = 0; for (const [loc, n] of [[0, 3], [1, 3], [2, 3], [3, 3], [9, 4], [10, 2]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 72, o); o += n * 4 }
        gl.bindVertexArray(null); K.neon = { va, vb, n: N.n } }
      K.wire = lit(this.wireBuf, this.wireBuf.length / 12);
      K.tiers = [0, 0, 0];
      for (let i = 0; i < B.n; i++) K.tiers[B.d[i * 12 + 9]]++;             // how many bulbs each tier adds
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.ready = true;
  }

  // point the instance attributes of the bound VAO at this frame's store
  instPtr(gl, K) {
    gl.bindBuffer(gl.ARRAY_BUFFER, K.inst[this.ping]);
    const IS = 18 * 4; let o = 0;
    for (const [loc, n] of INST) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, IS, o); gl.vertexAttribDivisor(loc, 1); o += n * 4 }
  }

  render(gl, matrix, opts = {}) {
    if (!this.ready) return;
    const t0 = performance.now();
    const { now = performance.now(), dark = false, zoom = 15, phone = false, reducedMotion = false, bounds, night = false, pixelRatio = 1 } = opts;
    // The rides carry their own palette (the building one is too close to the blocks they stand among);
    // opts.ridePalette overrides it. opts.palette / cream / shade are accepted and ignored.
    const pal = opts.ridePalette || (dark ? RIDE_DARK : RIDE_LIGHT);
    if (this._palKey !== pal) {
      this._rgb = new Float32Array(30); pal.forEach((h, i) => this._rgb.set(hexRGB(h), i * 3)); this._palKey = pal;
    }
    const rgb = this._rgb;

    // who is on screen: the view box grown by the ride's own height (a 555 m mast leans far across the screen)
    let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity;
    if (bounds) { x0 = Math.min(bounds[0], bounds[2]); x1 = Math.max(bounds[0], bounds[2]); y0 = Math.min(bounds[1], bounds[3]); y1 = Math.max(bounds[1], bounds[3]) }
    const EH = atZoom(zoom, EXAG_H), EV = atZoom(zoom, EXAG_V);   // Lotte stays at 1 (it has the spiral to fit inside)
    const vis = [];
    for (const s of this._sites) {
      const pad = (s.top * (s.lotte ? 1 : EV) + s.wide * (s.lotte ? 1 : EH)) * s.mu + (bounds ? (x1-x0)*.15 : 0);
      if (s.x < x0 - pad || s.x > x1 + pad || s.y < y0 - pad || s.y > y1 + pad) continue;
      vis.push(s);
    }
    // Every visible ride animates, phone or not: the pose is a clock uniform in the vertex shader, so
    // freezing some of them saved nothing and cost a lot — a ride crossing the nearest-24 line jumped
    // between its live pose and its phase-only pose on alternate frames, which is the flicker while panning.
    // Reduced motion still stops the lot, and it is a global switch, so it never toggles under the camera.
    const split=STYLE.rides.detailZoom,h=STYLE.lod.hysteresis;
    const lod=this.lod=zoom>=split+h?1:zoom<split-h?0:this.lod??(zoom>=split?1:0),ts=now/1000;
    for (const k of KINDS) this.kind[k].n = 0;
    for (const s of vis) {
      const K = this.kind[s.kind], d = K.data, i = K.n * 18, eh = s.lotte ? 1 : EH, ev = s.lotte ? 1 : EV;
      d[i] = s.x - this.O.x; d[i + 1] = s.y - this.O.y;
      d[i + 2] = s.sxy * eh; d[i + 3] = s.sz * ev; d[i + 4] = s.mastR * eh; d[i + 5] = s.mu;
      d[i + 6] = s.phase; d[i + 7] = reducedMotion ? 0 : 1; d[i + 8] = s.period; d[i + 9] = s.yaw;
      d[i + 10] = s.colA; d[i + 11] = s.colB; d[i + 12] = s.struct; d[i + 13] = s.shade;
      d[i + 14] = s.lotte ? 0 : 1; d[i + 15] = s.collar; d[i + 16] = s.pole; d[i + 17] = s.hue;
      K.n++;
    }

    const MT = this.M; MT.set(matrix);
    for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r] * this.O.x + matrix[4 + r] * this.O.y + matrix[12 + r];
    gl.useProgram(this.p);
    gl.uniformMatrix4fv(this.uni.u_matrix, false, MT);
    gl.uniform1f(this.uni.u_time, ts);
    gl.uniform3fv(this.uni.u_pal, rgb);
    gl.uniform3fv(this.uni.u_light, SUN);
    gl.uniform2fv(this.uni.u_lit, dark ? [STYLE.night.rideAmbient, STYLE.night.rideDirectional] : [.78, .22]);
    // Opaque, depth on. State is set and put back blind, never read: gl.getParameter/isEnabled here forces a
    // sync with the GPU process and swallowed a whole map frame (100-400 ms) when measured.
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    // This frame's instance store. Never patch the one the last frame is still drawing from: a
    // bufferSubData into a buffer in flight is where the rides blinked on real (tile-based) GPUs.
    // Two stores a kind, used alternately, and each is orphaned before it is filled.
    const ping = this.ping = this.ping ^ 1;
    for (const k of KINDS) {
      const K = this.kind[k]; if (!K.n) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, K.inst[ping]);
      gl.bufferData(gl.ARRAY_BUFFER, K.data.byteLength, gl.DYNAMIC_DRAW);     // fresh storage
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, K.data, 0, K.n * 18);
    }
    let tris = 0;
    for (const k of KINDS) {
      const K = this.kind[k]; if (!K.n) continue;
      const L = K.lod[lod];
      gl.bindVertexArray(L.va); this.instPtr(gl, K);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, L.n, K.n);
      tris += L.tris * K.n;
    }
    // ── after dark: the festoon lights, on top of the same instances ────────────────────────────
    let bulbs = 0;
    if (night) {
      // tier 0 keeps every ride's outline, 1 adds the wheel spokes, 2 the ground garlands; then a stride
      let tier = 0;   // only each ride's signature outline; no spoke or ground-light blanket
      const cap = (phone ? 2500 : 6000) * .4;
      const count = t => KINDS.reduce((a, k) => a + this.kind[k].n * this.kind[k].tiers.slice(0, t + 1).reduce((x, y) => x + y, 0), 0);
      while (tier > 0 && count(tier) > cap) tier--;
      bulbs = count(tier);
      const thin = bulbs > cap ? Math.ceil(bulbs / cap) : 1;
      bulbs = Math.ceil(bulbs / thin);
      const sz = bulbSize(zoom, pixelRatio);
      gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const setUni = (u) => {
        gl.uniformMatrix4fv(u.u_matrix, false, MT);
        gl.uniform1f(u.u_time, ts); gl.uniform1f(u.u_size, sz.point); gl.uniform1f(u.u_core, sz.coreFrac);
        gl.uniform1f(u.u_tier, tier); gl.uniform1f(u.u_thin, thin); gl.uniform1f(u.u_anim, reducedMotion ? 0 : 1);
        gl.uniform1f(u.u_bright, STYLE.night.rideEmission); gl.uniform3fv(u.u_pal, this.bulbRGB); gl.uniform2f(u.u_wt, .85, .12);
        gl.uniform1f(u.u_neonOn, neonOn);
      };
      // the neon outline: one signature a ride, a ribbon widened in screen pixels
      const neonOn = zoom >= (phone ? 15 : 14) ? 1 : 0;
      if (neonOn) {
        const core = Math.min(1.8, Math.max(1.2, 1.2 + (zoom - 14) * .3));
        gl.useProgram(this.pN);
        gl.uniformMatrix4fv(this.uN.u_matrix, false, MT);
        gl.uniform1f(this.uN.u_time, ts); gl.uniform1f(this.uN.u_half, 1.4 * pixelRatio);
        gl.uniform1f(this.uN.u_core, core / 4); gl.uniform1f(this.uN.u_tier, zoom >= 14.5 ? 1 : 0);
        gl.uniform1f(this.uN.u_anim, reducedMotion ? 0 : 1);
        gl.uniform2f(this.uN.u_vp, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.uniform2f(this.uN.u_wt, STYLE.night.rideEmission, .12);
        for (const k of KINDS) {
          const K = this.kind[k]; if (!K.n) continue;
          gl.uniform3fv(this.uN.u_neon, this.neonRGB[k]);
          gl.uniform1f(this.uN.u_chase, 0);            // the bright length runs round the saucers
          gl.bindVertexArray(K.neon.va); this.instPtr(gl, K);
          gl.drawArraysInstanced(gl.TRIANGLES, 0, K.neon.n, K.n);
        }
      }
      if (tier >= 2) {                                                      // the thin wire first, under the bulbs
        gl.useProgram(this.pW); setUni(this.uW);
        gl.uniform1f(this.uW.u_thin, 1); gl.uniform4f(this.uW.u_wire, .459, .408, .325, .35);
        for (const k of KINDS) { const K = this.kind[k]; if (K.n) { gl.bindVertexArray(K.wire.va); this.instPtr(gl, K); gl.drawArraysInstanced(gl.LINES, 0, K.wire.n, K.n) } }
      }
      gl.useProgram(this.pB); setUni(this.uB);
      for (const k of KINDS) { const K = this.kind[k]; if (K.n) { gl.bindVertexArray(K.bulb.va); this.instPtr(gl, K); gl.drawArraysInstanced(gl.POINTS, 0, K.bulb.n, K.n) } }
    }
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // left for the caller: DEPTH_TEST on / LEQUAL / depth writes on, BLEND on (blendFunc untouched), CULL_FACE off
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    this.stats = { tris, rides: vis.length, bulbs, moving: reducedMotion ? 0 : vis.length, ms: performance.now() - t0, lod };
    this._moving = !reducedMotion && vis.length > 0;
  }

  // true when a ride on screen is still moving: the caller keeps asking for frames (the train overlay
  // only redraws when the map does). False under reduced motion, or with nothing on screen.
  animating() { return !!this._moving }

  dispose(gl) {
    if (!this.p) return;
    for (const k of KINDS) { const K = this.kind[k]; for (const b of K.inst) gl.deleteBuffer(b);
      for (const L of [...K.lod, K.bulb, K.wire, K.neon]) { gl.deleteVertexArray(L.va); gl.deleteBuffer(L.vb) } }
    gl.deleteProgram(this.p); gl.deleteProgram(this.pB); gl.deleteProgram(this.pW); gl.deleteProgram(this.pN); this.p = null; this.kind = null; this.ready = false;
  }
}
export default RideLayer;
