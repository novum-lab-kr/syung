// 롤코 모드의 놀이기구 — the city's tall buildings (150 m and up) stand in as amusement-park rides.
//
// One self-contained WebGL2 layer. Four ride kinds, each a shared mesh drawn instanced: the mesh holds the
// shape in *unit space* (xy in radius units, z in height units) and every instance supplies its own scales,
// so a 555 m drop tower and a 160 m one are the same vertices. Animation is a uniform clock in the vertex
// shader (wheel turn, swing turn, saucer panels, the drop tower's rise/pause/drop/pause), so no buffer is
// rebuilt while they move; only the small per-frame instance list (12 floats a ride) is re-uploaded.
//
//   const rides=new RideLayer(towers);           // [[lon,lat,footprintRadius_m,height_m], …]
//   rides.init(gl,maplibregl); rides.render(gl,matrix,opts); rides.sites(); rides.dispose(gl);

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
const mast = s => ({ ...s, sel: 1 });

// Drop tower — mast H, a seat ring that rises to 0.82H and falls, a small cone crown.
function buildDrop(lod) {
  const M = new Mesh(), seg = lod ? 12 : 7, rs = lod ? 24 : 12, seats = lod ? 12 : 6, nb = lod ? 8 : 4;
  for (let i = 0; i < nb; i++)                                             // the mast, in broad alternating bands
    tube(M, STILL, [0, 0, i / nb], [0, 0, (i + 1) / nb], 1, seg, mast(i % 2 ? SHADE : CREAM), false, false);
  cone(M, STILL, .004, 2.5, .022, 1.5, seg, mast(SHADE));                 // a low foot, not a slab
  disc(M, STILL, .022, 1.5, seg, mast(SHADE));
  if (lod) for (let i = 0; i < 3; i++) {                                   // three slim guide rails up the mast
    const t = i / 3 * 2 * Math.PI;
    tube(M, STILL, [Math.cos(t) * 1.25, Math.sin(t) * 1.25, .02], [Math.cos(t) * 1.25, Math.sin(t) * 1.25, .97], .17, 4, mast(SHADE));
  }
  cone(M, STILL, .985, 1.9, 1.0, 1.8, seg, mast(SHADE));                   // the crown
  cone(M, STILL, 1.0, 1.8, 1.07, 0, seg, mast(B));
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
    for (const x of [-.34, .34]) tube(M, STILL, [x, y, 0], [0, y, .575], .018, lg, CREAM, false, lod === 1);
    box(M, STILL, [0, y, .21], .19, .011, .011, 0, CREAM);                  // the brace across each A
  }
  box(M, STILL, [0, 0, .5], .014, .085, .014, 0, CREAM);                   // the tie between them
  tube(M, STILL, [0, -.105, .58], [0, .105, .58], .03, lod ? 10 : 6, SHADE, true, lod === 1);
  for (const y of (lod ? [-.058, .058] : [0])) torusY(M, wheel(hub), [0, y, .58], .5, .022, maj, min, A);
  for (let i = 0; i < sp; i++) {                                           // slender spokes, in the wheel's plane
    const t = i / sp * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    tube(M, wheel(hub), [0, 0, .58], [c * .49, 0, .58 + s * .49], lod ? .009 : .013, 4, CREAM, false, false);
    if (lod) for (const y of [-.058, .058]) tube(M, wheel(hub), [c * .2, y * .36, .58 + s * .2], [c * .49, y, .58 + s * .49], .006, 3, CREAM, false, false);
  }
  for (let i = 0; i < cab; i++) {                                          // upright gondolas: .065D across, .08D tall
    const t = i / cab * 2 * Math.PI, arm = [Math.cos(t) * .5, 0, Math.sin(t) * .5], C = orbit(hub, arm);
    box(M, C, [0, 0, -.072], .0275, .0325, .04, 0, i % 2 ? B : A);
    if (lod) { box(M, C, [0, 0, -.018], .007, .007, .018, 0, SHADE);       // the hanger and the footboard
               box(M, C, [0, 0, -.115], .024, .03, .005, 0, SHADE) }
  }
  return M;
}
// Sky swing — mast .90H, a shallow canopy at .78H radius r, eight seats on .14H suspensions.
function buildSwing(lod) {
  const M = new Mesh(), seg = lod ? 10 : 6, cs = lod ? 20 : 10, n = lod ? 8 : 5;
  tube(M, STILL, [0, 0, 0], [0, 0, .9], 1, seg, mast(CREAM), false, false);
  cone(M, STILL, .004, 2.4, .02, 1.4, seg, mast(SHADE)); disc(M, STILL, .02, 1.4, seg, mast(SHADE));
  cone(M, STILL, .9, 1.2, .93, 0, seg, mast(B));
  cone(M, SPIN, .775, 1, .818, .13, cs, A, 1);                              // the canopy, in alternating wedges
  disc(M, SPIN, .818, .13, cs, A);
  disc(M, SPIN, .772, 1, cs, SHADE, -1);
  cone(M, SPIN, .765, .98, .775, 1, cs, SHADE);                             // its rim
  for (let i = 0; i < n; i++) {
    const t = i / n * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    tube(M, SPIN, [c * .9, s * .9, .768], [c * 1.06, s * 1.06, .636], .011, 4, CREAM, false, false);
    box(M, SPIN, [c * 1.06, s * 1.06, .618], .085, .075, .016, t, i % 2 ? B : A);
    box(M, SPIN, [c * 1.115, s * 1.115, .646], .014, .07, .03, t, i % 2 ? B : A);   // the backrest
  }
  return M;
}
// Observation saucer — mast .95H, a disc at .80H radius r thickness .055H, a cone cap reaching H.
function buildSaucer(lod) {
  const M = new Mesh(), seg = lod ? 10 : 6, ds = lod ? 20 : 10, n = 8;
  tube(M, STILL, [0, 0, 0], [0, 0, .95], 1, seg, mast(CREAM), false, false);
  cone(M, STILL, .004, 2.4, .02, 1.4, seg, mast(SHADE)); disc(M, STILL, .02, 1.4, seg, mast(SHADE));
  disc(M, STILL, .8, .72, ds, B, -1);                                       // the saucer: under, rim, over
  cone(M, STILL, .8, .72, .8275, 1, ds, B);
  cone(M, STILL, .8275, 1, .855, .8, ds, B);
  disc(M, STILL, .855, .8, ds, B);
  cone(M, STILL, .855, .55, 1, 0, lod ? 16 : 8, A);                         // the cap, to the top of the tower
  for (let i = 0; i < n; i++) {                                             // alternating rim panels
    const t = (i + .5) / n * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    box(M, SPIN, [c * .995, s * .995, .8275 + (i % 2 ? .008 : -.008)], .035, .175, .019, t, i % 2 ? B : A);
  }
  return M;
}
const KINDS = ['drop', 'ferris', 'swing', 'saucer'];
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
void main(){
  float sxy = a_k.z > .5 ? i_s.z : i_s.x, sz = i_s.y;
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
  float yc = cos(i_a.w), ys = sin(i_a.w);
  p = vec3(p.x*yc - p.y*ys, p.x*ys + p.y*yc, p.z);
  n = vec3(n.x*yc - n.y*ys, n.x*ys + n.y*yc, n.z);
  gl_Position = u_matrix * vec4(i_org + p.xy*i_s.w, p.z*i_s.w, 1.);
  int ci = int(a_k.x < .5 ? i_c.x : a_k.x < 1.5 ? i_c.y : a_k.x < 2.5 ? i_c.z : i_c.w);
  float d = max(dot(normalize(n), u_light), 0.);
  v_col = clamp(u_pal[ci]*(u_lit.x + u_lit.y*d + a_k.w), 0., 1.);
}`;
const FS = `#version 300 es
precision highp float; in vec3 v_col; out vec4 o; void main(){ o = vec4(v_col, 1.); }`;

const SUN = norm([-.30, .46, .84]);   // +x east, +y south (mercator), +z up: a high south-western sun
// The rides do not borrow the building palette: they need to separate from the blocks they replace.
const RIDE_LIGHT = ['#D7B566', '#D69A7D', '#CC8CA7', '#AA93C7', '#78AEC4', '#8AB58F', '#D8CEB7', '#BAB19D', '#D9C382', '#94BBC8'];
const RIDE_DARK = ['#C5A768', '#C08E76', '#B7829E', '#A08DBB', '#80AABD', '#91B496', '#AAA391', '#8F897A', '#BAA16D', '#89A9B8'];
//                   0 butter   1 peach   2 rose    3 lilac   4 sky     5 mint   6 structure 7 shade  8 Lotte mast 9 Lotte ring
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
        colA: q % 6, colB: (q + 2) % 6, struct: STRUCT, shade: SHADE_I,
        yaw: (q >>> 8 & 1023) / 1024 * Math.PI * 2, phase: (q >>> 18 & 255) / 255 * 90,
        period: kind === 'ferris' ? 75 : kind === 'swing' ? 40 : kind === 'saucer' ? 90 : 20,
      };
      // Lotte: 555 m, mast 12 m, ring 28 m, nothing past 32 m from the spiral axis, and its own colours
      if (lotte) { s.mastR = 12; s.r = 28; s.colA = RING; s.colB = STRUCT; s.struct = GOLD; s.shade = STRUCT }
      s.sxy = kind === 'ferris' ? D : s.r;
      s.sz = kind === 'ferris' ? D : H;
      s.top = kind === 'ferris' ? 1.1 * D : kind === 'drop' ? 1.08 * H : H;   // metres, for the cull margin
      s.wide = kind === 'ferris' ? .55 * D : Math.max(1.2 * s.r, 2.6 * s.mastR);
      return s;
    });
    this.stats = { tris: 0, rides: 0, ms: 0 };
    this._moving = false;
  }

  // the canonical sites, so the caller can take these buildings out of the extrusion / walls / shadows
  sites() { return this._sites.map(s => ({ lon: s.lon, lat: s.lat, x: s.x, y: s.y, radius_m: s.radius_m, height_m: s.height_m, kind: s.kind })) }

  init(gl, maplibregl) {
    if (this.p) return;
    if (maplibregl?.MercatorCoordinate) {                                   // exactly the map's own numbers
      const O = maplibregl.MercatorCoordinate.fromLngLat([126.978, 37.5665]); this.O = { x: O.x, y: O.y };
      for (const s of this._sites) { const m = maplibregl.MercatorCoordinate.fromLngLat([s.lon, s.lat]); s.x = m.x; s.y = m.y; s.mu = m.meterInMercatorCoordinateUnits() }
    }
    const sh = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(x)); return x };
    this.p = gl.createProgram();
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    gl.attachShader(this.p, vs); gl.attachShader(this.p, fs); gl.linkProgram(this.p); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.p));
    this.uni = Object.fromEntries(['u_matrix', 'u_time', 'u_pal', 'u_light', 'u_lit'].map(n => [n, gl.getUniformLocation(this.p, n)]));

    this.kind = {};
    for (const k of KINDS) {
      const K = this.kind[k] = { order: [], inst: gl.createBuffer(), data: null, lod: [] };
      K.order = this._sites.filter(s => s.kind === k);
      K.data = new Float32Array(K.order.length * 14);
      gl.bindBuffer(gl.ARRAY_BUFFER, K.inst);
      gl.bufferData(gl.ARRAY_BUFFER, K.data.byteLength, gl.DYNAMIC_DRAW);
      for (const lod of [0, 1]) {
        const M = BUILD[k](lod), buf = M.buffer(), vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
        const va = gl.createVertexArray(); gl.bindVertexArray(va);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        const S = 13 * 4; let o = 0;
        for (const [loc, n] of [[0, 3], [1, 3], [2, 3], [3, 4]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, o); o += n * 4 }
        gl.bindBuffer(gl.ARRAY_BUFFER, K.inst);
        const IS = 14 * 4; o = 0;
        for (const [loc, n] of [[4, 2], [5, 4], [6, 4], [7, 4]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, IS, o); gl.vertexAttribDivisor(loc, 1); o += n * 4 }
        gl.bindVertexArray(null);
        K.lod[lod] = { va, vb, n: M.tris * 3, tris: M.tris };
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.ready = true;
  }

  render(gl, matrix, opts = {}) {
    if (!this.ready) return;
    const t0 = performance.now();
    const { now = performance.now(), dark = false, zoom = 15, phone = false, reducedMotion = false, bounds, bearing = 0 } = opts;
    // The rides carry their own palette (the building one is too close to the blocks they stand among);
    // opts.ridePalette overrides it. opts.palette / cream / shade are accepted and ignored.
    const pal = opts.ridePalette || (dark ? RIDE_DARK : RIDE_LIGHT);
    if (this._palKey !== pal) {
      const hex = h => { const v = parseInt(String(h).replace('#', ''), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255] };
      this._rgb = new Float32Array(30); pal.forEach((h, i) => this._rgb.set(hex(h), i * 3)); this._palKey = pal;
    }
    const rgb = this._rgb;

    // who is on screen: the view box grown by the ride's own height (a 555 m mast leans far across the screen)
    let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity;
    if (bounds) { x0 = Math.min(bounds[0], bounds[2]); x1 = Math.max(bounds[0], bounds[2]); y0 = Math.min(bounds[1], bounds[3]); y1 = Math.max(bounds[1], bounds[3]) }
    const EH = atZoom(zoom, EXAG_H), EV = atZoom(zoom, EXAG_V);   // Lotte stays at 1 (it has the spiral to fit inside)
    const vis = [];
    for (const s of this._sites) {
      const pad = (s.top * (s.lotte ? 1 : EV) + s.wide * (s.lotte ? 1 : EH)) * s.mu;
      if (s.x < x0 - pad || s.x > x1 + pad || s.y < y0 - pad || s.y > y1 + pad) continue;
      vis.push(s);
    }
    // phones: only the nearest 24 on screen keep moving
    let moving = null;
    if (reducedMotion) moving = new Set();
    else if (phone && vis.length > 24) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      moving = new Set([...vis].sort((a, b) => ((a.x - cx) ** 2 + (a.y - cy) ** 2) - ((b.x - cx) ** 2 + (b.y - cy) ** 2)).slice(0, 24));
    }
    const lod = zoom >= 14.5 ? 1 : 0, ts = now / 1000;
    // below z14.5 a wheel turned edge-on is a line: swing it toward facing the camera as the map pulls back
    const face = Math.min(1, Math.max(0, (14.5 - zoom) / 1)), bear = bearing * Math.PI / 180;
    for (const k of KINDS) this.kind[k].n = 0;
    for (const s of vis) {
      const K = this.kind[s.kind], d = K.data, i = K.n * 14, eh = s.lotte ? 1 : EH, ev = s.lotte ? 1 : EV;
      let yaw = s.yaw;
      if (s.kind === 'ferris' && face > 0) { let dy = (bear - yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI; yaw += dy * face }
      d[i] = s.x - this.O.x; d[i + 1] = s.y - this.O.y;
      d[i + 2] = s.sxy * eh; d[i + 3] = s.sz * ev; d[i + 4] = s.mastR * eh; d[i + 5] = s.mu;
      d[i + 6] = s.phase; d[i + 7] = moving && !moving.has(s) ? 0 : 1; d[i + 8] = s.period; d[i + 9] = yaw;
      d[i + 10] = s.colA; d[i + 11] = s.colB; d[i + 12] = s.struct; d[i + 13] = s.shade;
      K.n++;
    }

    const MT = this.M; MT.set(matrix);
    for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r] * this.O.x + matrix[4 + r] * this.O.y + matrix[12 + r];
    gl.useProgram(this.p);
    gl.uniformMatrix4fv(this.uni.u_matrix, false, MT);
    gl.uniform1f(this.uni.u_time, ts);
    gl.uniform3fv(this.uni.u_pal, rgb);
    gl.uniform3fv(this.uni.u_light, SUN);
    gl.uniform2fv(this.uni.u_lit, dark ? [.85, .15] : [.78, .22]);
    // Opaque, depth on. State is set and put back blind, never read: gl.getParameter/isEnabled here forces a
    // sync with the GPU process and swallowed a whole map frame (100-400 ms) when measured.
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    let tris = 0;
    for (const k of KINDS) {
      const K = this.kind[k]; if (!K.n) continue;
      const L = K.lod[lod];
      gl.bindBuffer(gl.ARRAY_BUFFER, K.inst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, K.data, 0, K.n * 14);
      gl.bindVertexArray(L.va);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, L.n, K.n);
      tris += L.tris * K.n;
    }
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // left for the caller: DEPTH_TEST on / LEQUAL / depth writes on, BLEND on (blendFunc untouched), CULL_FACE off
    gl.enable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    this.stats = { tris, rides: vis.length, moving: moving ? moving.size : vis.length, ms: performance.now() - t0, lod };
    this._moving = !reducedMotion && (moving ? moving.size > 0 : vis.length > 0);
  }

  // true when a ride on screen is still moving: the caller keeps asking for frames (the train overlay
  // only redraws when the map does). False under reduced motion, or with nothing on screen.
  animating() { return !!this._moving }

  dispose(gl) {
    if (!this.p) return;
    for (const k of KINDS) { const K = this.kind[k]; gl.deleteBuffer(K.inst); for (const L of K.lod) { gl.deleteVertexArray(L.va); gl.deleteBuffer(L.vb) } }
    gl.deleteProgram(this.p); this.p = null; this.kind = null; this.ready = false;
  }
}
export default RideLayer;
