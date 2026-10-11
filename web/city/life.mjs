// 심시티 생활 — what makes the miniature city live: street trees and park trees, street lamps (lit after
// dark, with their pools of light), little cars driving the streets, people on the pavements, zebra
// crossings at the junctions. Drawn on the train overlay canvas (WebGL2), after the building walls have
// written their depth, so everything hides behind the buildings as the trains do.
//
// Everything is placed from the vector tiles' own data: streets (transportation), buildings, water,
// landcover (urban parks are landcover grass/wood in OpenMapTiles), landuse zones and POIs. Placement
// is per z14 tile ("cell"), built once in time slices while the map keeps its frame rate, cached on the
// GPU and culled by a sub-grid of each cell. A tree, a lamp or a crossing never moves once placed: the
// hash of its rounded position decides its look. Every colour, metre and zoom comes from the style pack.
//
//   const life = new CityLife({pack}); life.init(gl, maplibregl, map);
//   life.render(gl, matrix, {now, zoom, pitch, bearing, dark, tone, lampPool, cars, crossings, people, phone, reducedMotion, pixelRatio, bounds, mapOn, moving, sun});
//   tone: 팩의 modes 항목(모드 설정 city.tone), lampPool: 가로등 빛 웅덩이 배수(모드 설정 city.lampPool, null 이면 그 tone 의 lampPool)
//   life.animating(); life.dispose(gl);
//   people: both city modes draw them (the same figures on the same pavements; the mode only tones their colours); false hides them.

import SEOUL from '../modes/basic/city.mjs';
import { BULB_FS, bulbSize } from '../modes/coaster/night.mjs';
import { toneRGB, hexRgb, MPP } from './style.mjs';
import { RoadGraph, TrafficSim, VehicleRenderer, compileProgram, hashi, visibleRanges, sampleS } from './traffic.mjs';

const EARTH = 40075016.685578488, ORIGIN = [126.978, 37.5665];
const mercX = lon => lon / 360 + .5, mercY = lat => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
const O = { x: mercX(ORIGIN[0]), y: mercY(ORIGIN[1]) }, MU = 1 / (EARTH * Math.cos(ORIGIN[1] * Math.PI / 180));   // one local metre, in mercator units (a mercator metre: true metres × 0.3 % across Seoul)
const toM = (lon, lat) => [(mercX(lon) - O.x) / MU, (mercY(lat) - O.y) / MU];
const CELL_Z = 14, MINZ = 14.5, RASTER = 4;   // cells are the source's z14 tiles; nothing below MINZ; the water / landcover mask's cell (m)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) };
const ROAD = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']);
const SIDEWALK_TREES = new Set(['primary', 'secondary', 'tertiary']);
const PICK = (weights, r) => { let a = 0; for (let i = 0; i < weights.length; i++) { a += weights[i]; if (r < a) return i } return weights.length - 1 };

// ── meshes ──────────────────────────────────────────────────────────────────────────────────────
// a flat-shaded icosphere (every face its own vertices and normal): the toy tree's crown
function icosphere(subdiv) {
  const t = (1 + Math.sqrt(5)) / 2, V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(c => c / l) });
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const mid = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], l = Math.hypot(...m); return m.map(c => c / l) };
  let tris = F.map(f => f.map(i => V[i]));
  for (let s = 0; s < subdiv; s++) { const out = []; for (const [a, b, c] of tris) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); out.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]) } tris = out }
  return tris;
}
// tree: part 0 the trunk (a prism, radius 1, z 0..1), part 1 the crown (a unit sphere about the origin). 7 floats a vertex.
function treeMesh(lod) {
  const d = [], push = (p, n, part) => d.push(p[0], p[1], p[2], n[0], n[1], n[2], part);
  const sides = lod ? 5 : 4;
  for (let i = 0; i < sides; i++) { const a0 = i / sides * 2 * Math.PI, a1 = (i + 1) / sides * 2 * Math.PI, n = [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0];
    const A = [Math.cos(a0), Math.sin(a0), 0], B = [Math.cos(a1), Math.sin(a1), 0], C = [Math.cos(a1), Math.sin(a1), 1], D = [Math.cos(a0), Math.sin(a0), 1];
    for (const p of [A, B, C, A, C, D]) push(p, n, 0) }
  for (const tri of icosphere(lod ? 1 : 0)) { const n = tri[0].map((c, k) => (c + tri[1][k] + tri[2][k]) / 3), l = Math.hypot(...n); for (const p of tri) push(p, n.map(c => c / l), 1) }
  return new Float32Array(d);
}
// lamp: part 0 the pole and the arm, part 2 the head, part 1 the head's underside (the lamp, lit at night). The arm
// points +x. Vertices carry the centre-line point and the offset from it separately, so the shader can thicken a
// post that would otherwise be thinner than a pixel. 10 floats a vertex.
// A lantern post (L.lantern): a wooden post, a short arm on top and a paper 초롱 hanging from it, all lit at night,
// its middle at (armM, heightM − 0.2) where the night's bulb and pool are drawn.
// 횃불 (L.torch, 조선 모드): 나무 기둥 위 쇠 화로(part 2)에 불꽃(part 3). 불꽃은 셰이더가 흔들고(밤낮 모두 타오름), a_nrm.x 에
// 불꽃 안의 높이 몫(0 아래 주황 … 1 끝 노랑)을 싣는다. 밤의 불빛 · 바닥 빛은 기둥 위(armM 0, heightM − 0.2)에.
function lampMesh(L) {
  const H = L.heightM, A = L.armM, r = L.poleDiameterM / 2, d = [];
  const quad = (P, n, part) => { for (const p of [P[0], P[1], P[2], P[0], P[2], P[3]]) d.push(p[0], p[1], p[2], p[3], p[4], p[5], n[0], n[1], n[2], part) };
  // a box about a centre line: c(x,y,z) is the point on the line, the rest the offset; the line runs along `axis`
  const box = (c0, c1, hy, hz, part, bottom = part) => {   // from c0 to c1 (centre points), half extents across (y) and up (z)
    const V = (c, sy, sz) => [c[0], c[1], c[2], 0, sy * hy, sz * hz];
    quad([V(c1, -1, -1), V(c1, 1, -1), V(c1, 1, 1), V(c1, -1, 1)], [1, 0, 0], part); quad([V(c0, 1, -1), V(c0, -1, -1), V(c0, -1, 1), V(c0, 1, 1)], [-1, 0, 0], part);
    quad([V(c1, 1, -1), V(c0, 1, -1), V(c0, 1, 1), V(c1, 1, 1)], [0, 1, 0], part); quad([V(c0, -1, -1), V(c1, -1, -1), V(c1, -1, 1), V(c0, -1, 1)], [0, -1, 0], part);
    quad([V(c0, -1, 1), V(c1, -1, 1), V(c1, 1, 1), V(c0, 1, 1)], [0, 0, 1], part); quad([V(c0, 1, -1), V(c1, 1, -1), V(c1, -1, -1), V(c0, -1, -1)], [0, 0, -1], bottom) };
  // the pole: a box standing up — centre line (0,0,z), offsets in x and y
  { const V = (z, sx, sy) => [0, 0, z, sx * r, sy * r, 0];
    quad([V(0, 1, -1), V(0, 1, 1), V(H - .25, 1, 1), V(H - .25, 1, -1)], [1, 0, 0], 0); quad([V(0, -1, 1), V(0, -1, -1), V(H - .25, -1, -1), V(H - .25, -1, 1)], [-1, 0, 0], 0);
    quad([V(0, 1, 1), V(0, -1, 1), V(H - .25, -1, 1), V(H - .25, 1, 1)], [0, 1, 0], 0); quad([V(0, -1, -1), V(0, 1, -1), V(H - .25, 1, -1), V(H - .25, -1, -1)], [0, -1, 0], 0) }
  if (L.torch) {
    const F = L.torch, b0 = H + .05, b1 = b0 + F.basketM, fr = F.flameWidthM / 2, fz = b1 - .05, ft = fz + F.flameM;
    box([-F.basketWidthM / 2, 0, b0 + F.basketM / 2], [F.basketWidthM / 2, 0, b0 + F.basketM / 2], F.basketWidthM / 2, F.basketM / 2, 2);   // 화로
    { const V = (z, sx, sy) => [0, 0, z, sx * r, sy * r, 0];   // 기둥 윗부분(화로까지)
      quad([V(H - .25, 1, -1), V(H - .25, 1, 1), V(b0, 1, 1), V(b0, 1, -1)], [1, 0, 0], 0); quad([V(H - .25, -1, 1), V(H - .25, -1, -1), V(b0, -1, -1), V(b0, -1, 1)], [-1, 0, 0], 0);
      quad([V(H - .25, 1, 1), V(H - .25, -1, 1), V(b0, -1, 1), V(b0, 1, 1)], [0, 1, 0], 0); quad([V(H - .25, -1, -1), V(H - .25, 1, -1), V(b0, 1, -1), V(b0, -1, -1)], [0, -1, 0], 0) }
    // 불꽃: 아래가 둥글고 위가 뾰족한 팔면체 꼴(가로 고리 4점 · 끝 · 밑). 고리는 밑에서 0.3 높이
    const ring = [0, 1, 2, 3].map(k => { const a = k * Math.PI / 2 + Math.PI / 4; return [Math.cos(a) * fr, Math.sin(a) * fr, fz + .3 * F.flameM] });
    const fv = (p, m) => d.push(p[0], p[1], p[2], 0, 0, 0, m, 0, 0, 3);
    for (let k = 0; k < 4; k++) { const a = ring[k], c = ring[(k + 1) % 4]; fv(a, .3); fv(c, .3); fv([0, 0, ft], 1); fv(c, .3); fv(a, .3); fv([0, 0, fz], 0) }
    return new Float32Array(d);
  }
  if (L.lantern) {
    const top = H + .25, lw = L.lantern.widthM / 2, lh = L.lantern.heightM / 2, zc = H - .2;
    { const V = (z, sx, sy) => [0, 0, z, sx * r, sy * r, 0];   // the post's top above the pole drawn above (to the arm)
      quad([V(H - .25, 1, -1), V(H - .25, 1, 1), V(top, 1, 1), V(top, 1, -1)], [1, 0, 0], 0); quad([V(H - .25, -1, 1), V(H - .25, -1, -1), V(top, -1, -1), V(top, -1, 1)], [-1, 0, 0], 0);
      quad([V(H - .25, 1, 1), V(H - .25, -1, 1), V(top, -1, 1), V(top, 1, 1)], [0, 1, 0], 0); quad([V(H - .25, -1, -1), V(H - .25, 1, -1), V(top, 1, -1), V(top, -1, -1)], [0, -1, 0], 0) }
    box([-r, 0, top], [A + .05, 0, top], r * .8, r * .8, 0);                  // the arm
    box([A, 0, zc + lh], [A, 0, top], .02, .02, 0);                            // the cord
    box([A - lw, 0, zc], [A + lw, 0, zc], lw, lh, 1, 1);                       // the 초롱: the paper body, lit at night
    box([A - lw * .7, 0, zc + lh + .04], [A + lw * .7, 0, zc + lh + .04], lw * .7, .04, 0);   // its wooden cap
    return new Float32Array(d);
  }
  box([-r, 0, H - .3 + r * .8], [A, 0, H - .3 + r * .8], r * .8, r * .8, 0);   // the arm, out over the road
  box([A - .3, 0, H - .23], [A + .25, 0, H - .23], .14, .11, 2, 1);          // the head: a box, its underside the lamp
  return new Float32Array(d);
}
// a person, drawn face on to the camera: the round little figure the coaster's walkers once had (the runtime's former roundPerson) in
// unit space (f across the screen, z up), each vertex with its part and how far along its limb it is (t), so the
// shader can swing the legs and arms. 4 floats a vertex.
function personMesh() {
  const d = [], v = (f, z, part, t = 0) => d.push(f, z, part, t);
  const disc = (cf, cz, rf, rz, part, a0 = 0, a1 = 2 * Math.PI, N = 12, t = 0) => { for (let i = 0; i < N; i++) { const t0 = a0 + (a1 - a0) * i / N, t1 = a0 + (a1 - a0) * (i + 1) / N; v(cf, cz, part, t); v(cf + rf * Math.cos(t0), cz + rz * Math.sin(t0), part, t); v(cf + rf * Math.cos(t1), cz + rz * Math.sin(t1), part, t) } };
  const bar = (f0, z0, f1, z1, w, part) => { const dx = f1 - f0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nf = -dz / l * w, nz = dx / l * w;
    for (const [f, z, t] of [[f0 - nf, z0 - nz, 0], [f0 + nf, z0 + nz, 0], [f1 + nf, z1 + nz, 1], [f0 - nf, z0 - nz, 0], [f1 + nf, z1 + nz, 1], [f1 - nf, z1 - nz, 1]]) v(f, z, part, t) };
  const hip = 1, top = 2.7, hr = .95, hz = top + .75;
  for (const dd of [-1, 1]) { const k = dd < 0 ? 0 : 1; bar(dd * .38, hip, dd * .38, .25, .26, 10 + k); disc(dd * .38 + .08, .2, .3, .2, 12 + k, 0, 2 * Math.PI, 8, 1) }   // legs (parts 10, 11) and feet (12, 13)
  const bw = .85, br = .55; bar(0, hip + br * .6, 0, top - br * .4, bw, 20); disc(0, hip + br * .6, bw, br, 20, Math.PI, 2 * Math.PI, 8); disc(0, top - br * .4, bw, br, 20, 0, Math.PI, 8);   // the body (20)
  for (const dd of [-1, 1]) { const k = dd < 0 ? 0 : 1; bar(dd * .75, top - .45, dd * 1.15, hip + .75, .2, 30 + k); disc(dd * 1.15, hip + .75, .22, .22, 32 + k, 0, 2 * Math.PI, 8, 1) }   // arms (30, 31), hands (32, 33)
  disc(0, hz, hr, hr, 40); disc(0, hz + .12, hr * 1.03, hr * .95, 50, Math.PI * .05, Math.PI * .95, 10);   // head (40), hair (50)
  return new Float32Array(d);
}
const PERSON_UNITS = 2.7 + .75 + .95;   // the figure's height in its own units

// ── shaders ─────────────────────────────────────────────────────────────────────────────────────
const LIT = `float lit(vec3 n, vec3 L, vec2 k){ float d = max(dot(n, L), 0.); return k.x + k.y * (.5 + .5 * d); }`;   // ambient + directional, the far side never darker than the pack allows
const TREE_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in float a_part;
layout(location=3) in vec4 i_a;   // x, y (local m), height m, crown diameter m
layout(location=4) in vec4 i_b;   // shape (0 rounded, 1 upright), colour index, rank, yaw
layout(location=5) in float i_k;  // fade group: 0 street, 1 park
uniform mat4 u_matrix; uniform float u_mu, u_keep, u_trunkR, u_shadow; uniform vec2 u_fade, u_lit; uniform vec3 u_pal[3], u_trunk, u_light, u_shade;
out vec3 v_col; out float v_a;
${LIT}
void main(){
  float s = (i_k < .5 ? u_fade.x : u_fade.y) * (1. - smoothstep(u_keep - .03, u_keep + .03, i_b.z));
  if (s <= .002) { gl_Position = vec4(2., 2., 2., 1.); return; }
  float H = i_a.z * s, D = i_a.w * s, up = i_b.x > .5 ? 1. : 0.;
  float rx = D * .5 * (1. - .12 * up), rz = mix(D * .5 * .84, H * .38, up), cz = H - rz;   // the crown: a flattened ball, or a tall egg
  vec3 p, n = a_nrm;
  if (u_shadow > .5) {                                                        // the ground shadow: the crown's disc, sheared off the sun
    if (a_part < .5) { gl_Position = vec4(2., 2., 2., 1.); return; }
    vec2 sh = -u_light.xy / max(u_light.z, .25) * cz; float l = length(sh); if (l > D) sh *= D / l;
    p = vec3(a_pos.xy * rx * 1.05 + sh, .04); v_a = .55;
  } else if (a_part > .5) { p = vec3(a_pos.xy * rx, cz + a_pos.z * rz); n = normalize(a_nrm * vec3(1. / rx, 1. / rx, 1. / rz)); v_a = 1.; }
  else { p = vec3(a_pos.xy * u_trunkR * s, a_pos.z * (cz + rz * .2)); v_a = 1.; }
  float c = cos(i_b.w), sn = sin(i_b.w);
  p.xy = vec2(p.x * c - p.y * sn, p.x * sn + p.y * c); n = vec3(n.x * c - n.y * sn, n.x * sn + n.y * c, n.z);
  gl_Position = u_matrix * vec4((i_a.xy + p.xy) * u_mu, p.z * u_mu, 1.);
  if (u_shadow > .5) { gl_Position.z -= 1.5e-5 * gl_Position.w; v_col = u_shade; return; }
  vec3 base = a_part > .5 ? u_pal[int(i_b.y + .5)] : u_trunk;
  v_col = base * lit(n, u_light, u_lit);
}`;
const FLAT_FS = `#version 300 es
precision highp float; in vec3 v_col; in float v_a; uniform float u_alpha; out vec4 o;
void main(){ float a = v_a * u_alpha; o = vec4(clamp(v_col, 0., 1.) * a, a); }`;
const LAMP_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_off; layout(location=2) in vec3 a_nrm; layout(location=6) in float a_part;
layout(location=3) in vec4 i_a;   // x, y, yaw, rank
uniform mat4 u_matrix; uniform float u_mu, u_fade, u_keep, u_night, u_thick, u_time; uniform vec2 u_lit; uniform vec3 u_pole, u_glow, u_light, u_flame[2];
out vec3 v_col; out float v_a;
${LIT}
void main(){
  float s = u_fade * (1. - smoothstep(u_keep - .03, u_keep + .03, i_a.w));
  if (s <= .002) { gl_Position = vec4(2., 2., 2., 1.); return; }
  float c = cos(i_a.z), sn = sin(i_a.z);
  vec3 p = a_pos + a_off * (a_part < .5 ? u_thick : sqrt(u_thick));
  if (a_part > 2.5) {   // 횃불의 불꽃: 기둥마다 다른 박자로 키가 들썩이고 끝이 흔들린다. 불꽃은 스스로 빛나서 조명을 받지 않는다
    float h = a_nrm.x, ph = i_a.w * 61.7, t = u_time;
    float f = 1. + .2 * sin(t * 9.3 + ph) + .12 * sin(t * 15.1 + ph * 1.7) + .06 * sin(t * 23.7 + ph * .6);
    p.z = mix(p.z, p.z + (f - 1.) * .35, h); p.xy *= mix(1.1 - .1 * f, 1., h); p.x += h * h * .05 * sin(t * 6.1 + ph); p.y += h * h * .04 * sin(t * 7.9 + ph * 1.3);
    p.z *= s; p.xy = vec2(p.x * c - p.y * sn, p.x * sn + p.y * c);
    gl_Position = u_matrix * vec4((i_a.xy + p.xy) * u_mu, p.z * u_mu, 1.);
    v_col = mix(u_flame[0], u_flame[1], h) * (u_night > .5 ? 1.25 : 1.); v_a = 1.; return;
  }
  p.z *= s; p.xy = vec2(p.x * c - p.y * sn, p.x * sn + p.y * c);
  vec3 n = vec3(a_nrm.x * c - a_nrm.y * sn, a_nrm.x * sn + a_nrm.y * c, a_nrm.z);
  gl_Position = u_matrix * vec4((i_a.xy + p.xy) * u_mu, p.z * u_mu, 1.);
  bool glass = a_part > .5 && a_part < 1.5;
  v_col = glass && u_night > .5 ? u_glow * 1.1 : (glass ? mix(u_pole, vec3(1.), .5) : u_pole) * lit(n, u_light, u_lit); v_a = 1.;
}`;
// a soft disc of light on the ground under the lamp head (night)
const POOL_VS = `#version 300 es
layout(location=0) in vec2 a_q;
layout(location=3) in vec4 i_a;
uniform mat4 u_matrix; uniform float u_mu, u_fade, u_keep, u_arm, u_radius; out vec2 v_q; out float v_s;
void main(){
  float s = u_fade * (1. - smoothstep(u_keep - .03, u_keep + .03, i_a.w)); v_s = s;
  if (s <= .002) { gl_Position = vec4(2., 2., 2., 1.); return; }
  float c = cos(i_a.z), sn = sin(i_a.z);
  vec2 p = vec2(u_arm, 0.) + a_q * u_radius; p = vec2(p.x * c - p.y * sn, p.x * sn + p.y * c);
  gl_Position = u_matrix * vec4((i_a.xy + p) * u_mu, .03 * u_mu, 1.); gl_Position.z -= 2e-5 * gl_Position.w; v_q = a_q;
}`;
const POOL_FS = `#version 300 es
precision highp float; in vec2 v_q; in float v_s; uniform vec3 u_rgb; uniform float u_alpha; out vec4 o;
void main(){ float d2 = dot(v_q, v_q); if (d2 > 1.) discard; float a = u_alpha * v_s * (1. - d2) * (1. - d2); o = vec4(u_rgb * a, a); }`;
const BULB_VS = `#version 300 es
layout(location=3) in vec4 i_a;
uniform mat4 u_matrix; uniform float u_mu, u_fade, u_keep, u_arm, u_h, u_size, u_core; uniform vec3 u_rgb; out vec3 v_rgb; out vec2 v_mix;
void main(){
  float s = u_fade * (1. - smoothstep(u_keep - .03, u_keep + .03, i_a.w));
  if (s <= .002) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
  float c = cos(i_a.z), sn = sin(i_a.z); vec2 p = vec2(u_arm * c, u_arm * sn);
  gl_Position = u_matrix * vec4((i_a.xy + p) * u_mu, (u_h - .2) * u_mu, 1.); gl_Position.z -= 3e-4 * gl_Position.w;
  gl_PointSize = u_size * s; v_rgb = u_rgb; v_mix = vec2(u_core, .9);
}`;
// a zebra crossing: a band across an arm of a junction, stripes along the road
const CROSS_VS = `#version 300 es
layout(location=0) in vec2 a_q;   // along the band (across the road) -1..1, across the band (along the road) -1..1
layout(location=3) in vec4 i_a;   // x, y, yaw (the arm's heading), road width
uniform mat4 u_matrix; uniform float u_mu, u_fade, u_depth; out vec2 v_q; out float v_w;
void main(){
  float c = cos(i_a.z), sn = sin(i_a.z);
  vec2 p = vec2(a_q.y * u_depth * .5, a_q.x * i_a.w * .5); p = vec2(p.x * c - p.y * sn, p.x * sn + p.y * c);
  gl_Position = u_matrix * vec4((i_a.xy + p) * u_mu, .02 * u_mu, 1.); gl_Position.z -= 1e-5 * gl_Position.w;
  v_q = a_q; v_w = i_a.w;
}`;
const CROSS_FS = `#version 300 es
precision highp float; in vec2 v_q; in float v_w; uniform vec3 u_rgb; uniform float u_alpha, u_stripe, u_gap; out vec4 o;
void main(){
  float x = (v_q.x * .5 + .5) * v_w, period = u_stripe + u_gap, m = mod(x + period * .5, period);
  float e = fwidth(x) * .7, bar = smoothstep(0., e, m) * (1. - smoothstep(u_stripe - e, u_stripe, m));
  float edge = 1. - smoothstep(.85, 1., abs(v_q.y)); float a = u_alpha * bar * edge; if (a <= .003) discard; o = vec4(u_rgb * a, a);
}`;
const PERSON_VS = `#version 300 es
layout(location=0) in vec4 a_v;   // f (across), z (up), part, t along the limb
layout(location=3) in vec4 i_a;   // x, y, phase, walking (0..1)
layout(location=4) in vec4 i_b;   // facing fx, fy, shirt index, scale
layout(location=5) in vec2 i_c;   // pants index, hair index
uniform mat4 u_matrix; uniform float u_mu, u_time, u_unit; uniform vec2 u_right, u_lit; uniform vec3 u_shirt[4], u_pants[4], u_hair[4], u_skin, u_light;
out vec3 v_col; out float v_a;
void main(){
  float s = i_b.w; if (s <= .002) { gl_Position = vec4(2., 2., 2., 1.); return; }
  float part = a_v.z, t = a_v.w, ph = i_a.z + u_time * 7.5, sw = i_a.w * sin(ph), bob = i_a.w * abs(sin(ph)) * .18;
  float m = dot(vec2(i_b.x, i_b.y), u_right) >= 0. ? 1. : -1.;   // mirrored to the way it walks
  float f = a_v.x, z = a_v.y + bob;
  if (part < 20.) { float d = mod(part, 2.) < .5 ? -1. : 1.; f += d * sw * .35 * (part < 12. ? t : 1.); }          // legs swing, feet with them
  else if (part >= 30. && part < 40.) { float d = mod(part, 2.) < .5 ? -1. : 1.; f -= d * sw * .4 * (part < 32. ? t : 1.); }   // arms the other way
  f *= m;
  float u = u_unit * s;
  vec3 p = vec3(i_a.xy + u_right * f * u, z * u);
  gl_Position = u_matrix * vec4(p.xy * u_mu, p.z * u_mu, 1.);
  int si = int(i_b.z + .5), pi = int(i_c.x + .5), hi = int(i_c.y + .5);
  vec3 c = part < 12. ? u_pants[pi] : part < 20. ? u_pants[pi] * .45 : part < 32. ? u_shirt[si] : part < 40. ? u_skin : part < 50. ? u_skin : u_hair[hi];
  v_col = c * (u_lit.x + u_lit.y * .8); v_a = 1.;
}`;

// ── the layer ───────────────────────────────────────────────────────────────────────────────────
export class CityLife {
  constructor({ pack = SEOUL } = {}) {
    this.pack = pack; this.cells = new Map(); this.graph = new RoadGraph(); this.stats = {}; this._anim = false; this.lastQuery = 0; this.building = null;
    this.M = new Float32Array(16);
    this.people = { list: [], poses: new Float32Array(400 * 14), count: 0, max: 400, seq: 0, simT: 0 };   // seq: ids; simT: walked time (s)
  }
  // A fault in the city must never take the trains with it: init and render catch their own errors and
  // the layer switches itself off (once, with the error in the console).
  init(gl, maplibregl, map) {
    if (this.gl || this.broken) return; this.map = map;
    try { this._init(gl) ; this.gl = gl } catch (e) { this.broken = true; console.error('city-life: off —', e) }
  }
  // a lamp mesh's vertex array (the instances are bound per draw)
  lampVA(gl, mesh) { const va = gl.createVertexArray(); gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b); for (const [loc, k, off] of [[0, 3, 0], [1, 3, 12], [2, 3, 24], [6, 1, 36]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, k, gl.FLOAT, false, 40, off) } return va }
  // the posts for a look's lamps (the 조선 pack's torches), built on first use
  lampFor(gl, LM) { let e = this.lamps.get(LM); if (!e) { const m = lampMesh(LM), b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, m, gl.STATIC_DRAW); const mesh = { b, n: m.length / 10 }; e = { va: this.lampVA(gl, mesh), mesh }; this.lamps.set(LM, e) } return e }
  _init(gl) {
    const U = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
    this.pT = compileProgram(gl, TREE_VS, FLAT_FS); this.uT = U(this.pT, ['u_matrix', 'u_mu', 'u_keep', 'u_trunkR', 'u_shadow', 'u_fade', 'u_lit', 'u_pal', 'u_trunk', 'u_light', 'u_shade', 'u_alpha']);
    this.pL = compileProgram(gl, LAMP_VS, FLAT_FS); this.uL = U(this.pL, ['u_matrix', 'u_mu', 'u_fade', 'u_keep', 'u_night', 'u_thick', 'u_time', 'u_lit', 'u_pole', 'u_glow', 'u_light', 'u_flame', 'u_alpha']);
    this.pP = compileProgram(gl, POOL_VS, POOL_FS); this.uP = U(this.pP, ['u_matrix', 'u_mu', 'u_fade', 'u_keep', 'u_arm', 'u_radius', 'u_rgb', 'u_alpha']);
    this.pB = compileProgram(gl, BULB_VS, BULB_FS); this.uB = U(this.pB, ['u_matrix', 'u_mu', 'u_fade', 'u_keep', 'u_arm', 'u_h', 'u_size', 'u_core', 'u_rgb', 'u_wt']);
    this.pX = compileProgram(gl, CROSS_VS, CROSS_FS); this.uX = U(this.pX, ['u_matrix', 'u_mu', 'u_fade', 'u_depth', 'u_rgb', 'u_alpha', 'u_stripe', 'u_gap']);
    this.pH = compileProgram(gl, PERSON_VS, FLAT_FS); this.uH = U(this.pH, ['u_matrix', 'u_mu', 'u_time', 'u_unit', 'u_right', 'u_lit', 'u_shirt', 'u_pants', 'u_hair', 'u_skin', 'u_light', 'u_alpha']);
    const vbo = data => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b };
    this.meshT = [0, 1].map(lod => { const m = treeMesh(lod); return { b: vbo(m), n: m.length / 7 } });
    { const m = lampMesh(this.pack.props.lamps); this.meshL = { b: vbo(m), n: m.length / 10 } }
    { const m = personMesh(); this.meshH = { b: vbo(m), n: m.length / 4 } }
    this.quad = vbo(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    this.vehicles = new VehicleRenderer(this.pack); this.vehicles.init(gl);
    this.traffic = new TrafficSim(this.graph, { pack: this.pack });
    this.peopleInst = [gl.createBuffer(), gl.createBuffer()]; this.ping = 0;
    this.vaH = gl.createVertexArray(); gl.bindVertexArray(this.vaH); gl.bindBuffer(gl.ARRAY_BUFFER, this.meshH.b); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    this.vaQ = gl.createVertexArray(); gl.bindVertexArray(this.vaQ); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.vaL = this.lampVA(gl, this.meshL); this.lamps = new Map([[this.pack.props.lamps, { va: this.vaL, mesh: this.meshL }]]);
    this.vaT = this.meshT.map(m => { const va = gl.createVertexArray(); gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, m.b); this.meshPtr(gl); return va });
    this.vaP = gl.createVertexArray(); gl.bindVertexArray(this.vaP); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  meshPtr(gl) { gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24) }

  // ── cells ───────────────────────────────────────────────────────────────────────────────────
  cellBox(x, y, z = CELL_Z) { const n = 2 ** z; return [(x / n - O.x) / MU, (y / n - O.y) / MU, ((x + 1) / n - O.x) / MU, ((y + 1) / n - O.y) / MU] }
  // which cells the view needs (local box → z14 tile range)
  needed(box) {
    const n = 2 ** CELL_Z, tx = v => Math.floor((v * MU + O.x) * n), ty = v => Math.floor((v * MU + O.y) * n), out = [];
    for (let x = tx(box[0]); x <= tx(box[2]); x++) for (let y = ty(box[1]); y <= ty(box[3]); y++) out.push([`${CELL_Z}/${x}/${y}`, x, y]);
    return out;
  }
  // the tiles' features by cell: queried for every source layer at once, at most every 400 ms, only while a cell waits
  gather() {
    const map = this.map, by = new Map(), key = f => { const t = f.tile; return t ? `${t.z}/${t.x}/${t.y}` : '' };
    for (const layer of ['transportation', 'building', 'water', 'landcover', 'landuse', 'poi']) {
      let fs = []; try { fs = map.querySourceFeatures('ofm', { sourceLayer: layer }) } catch { }
      for (const f of fs) { const k = key(f); if (!k) continue; let g = by.get(k); if (!g) by.set(k, g = { transportation: [], building: [], water: [], landcover: [], landuse: [], poi: [] }); g[layer].push(f) }
    }
    return by;
  }
  // Build a cell from its features, in slices (a generator): streets → graph, then the buildings' and water's
  // masks, then the trees, lamps, crossings and the pavements people walk, then the GPU buffers.
  *build(cell, F) {
    const pack = this.pack, P = pack.props, R = pack.roads, box = cell.box, [bx0, by0, bx1, by1] = box, t0 = performance.now();
    const spec = c => R.classes[R.aliases?.[c] ?? c] || R.classes.service, mark = n => { const t = performance.now(), cpu = (cell.cur || 0) + (t - (cell.s0 || t)); (cell.phases || (cell.phases = [])).push([n, Math.round(cpu)]); cell.cur = -(t - (cell.s0 || t)) };
    const lanesPerDir = w => Math.max(1, Math.round(w / 3.5 / 2)), onewayLanes = w => w < 7 ? 1 : Math.max(2, 2 * Math.round(w / 6.6));
    const lines = [], rails = [], paths = [];
    for (const f of F.transportation) {
      const p = f.properties, cls = p.class, g = f.geometry; if (g.type !== 'LineString' && g.type !== 'MultiLineString') continue;
      const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates, level = p.brunnel === 'tunnel' ? -1 : p.brunnel === 'bridge' ? 1 : 0;
      if (ROAD.has(cls)) { if (level < 0) continue; const S = spec(cls), oneway = p.oneway === 1 ? 1 : p.oneway === -1 ? -1 : 0, ramp = p.ramp === 1, W = S.widthM * (oneway ? .72 : 1) * (ramp ? .55 : 1);
        for (const cs of parts) lines.push({ pts: cs.map(c => toM(c[0], c[1])), cls, oneway, level, ramp, width: W, lanes: oneway ? onewayLanes(W) : lanesPerDir(W), sidewalk: ramp ? 0 : S.sidewalkM, speed: 8 }) }
      else if ((cls === 'rail' || cls === 'transit') && level === 0) for (const cs of parts) rails.push(cs.map(c => toM(c[0], c[1])));
      else if ((cls === 'path' || cls === 'track') && p.subclass !== 'steps' && level >= 0) for (const cs of parts) paths.push({ pts: cs.map(c => toM(c[0], c[1])), sub: p.subclass || cls });
    }
    mark('parse-roads'); yield;
    // the street graph for this cell (edges, nodes, signals)
    const G = yield* this.graph.addCellGen(cell.key, lines, box), edges = G.edges; cell.inGraph = true;
    yield;
    // a grid of edge segments for "how close is the nearest street"
    const SG = new Map(), SC = 20, sk = (x, y) => Math.floor(x / SC) + ',' + Math.floor(y / SC);
    for (const e of edges) for (let i = 0; i + 1 < e.xs.length; i++) { const x0 = Math.min(e.xs[i], e.xs[i + 1]), x1 = Math.max(e.xs[i], e.xs[i + 1]), y0 = Math.min(e.ys[i], e.ys[i + 1]), y1 = Math.max(e.ys[i], e.ys[i + 1]);
      for (let cx = Math.floor(x0 / SC); cx <= Math.floor(x1 / SC); cx++) for (let cy = Math.floor(y0 / SC); cy <= Math.floor(y1 / SC); cy++) { const k = cx + ',' + cy; let a = SG.get(k); if (!a) SG.set(k, a = []); a.push([e, i]) } }
    yield;
    const segDist = (x, y, e, i) => { const ax = e.xs[i], ay = e.ys[i], dx = e.xs[i + 1] - ax, dy = e.ys[i + 1] - ay, l2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); return Math.hypot(ax + dx * u - x, ay + dy * u - y) };
    // clear of every street but `self` by `margin` beyond its half width?
    const roadClear = (x, y, self, margin) => { const cx = Math.floor(x / SC), cy = Math.floor(y / SC);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [e, i] of SG.get((cx + dx) + ',' + (cy + dy)) || []) { if (e === self) continue; if (segDist(x, y, e, i) < e.width / 2 + margin) return false } return true };
    const railGrid = new Map(); for (const pts of rails) for (let i = 0; i + 1 < pts.length; i++) { const k = sk((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2); let a = railGrid.get(k); if (!a) railGrid.set(k, a = []); a.push([pts[i], pts[i + 1]]) }
    const railClear = (x, y, m) => { const cx = Math.floor(x / SC), cy = Math.floor(y / SC); for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (const [A, B] of railGrid.get((cx + dx) + ',' + (cy + dy)) || []) { const ex = B[0] - A[0], ey = B[1] - A[1], l2 = ex * ex + ey * ey || 1, u = Math.max(0, Math.min(1, ((x - A[0]) * ex + (y - A[1]) * ey) / l2)); if (Math.hypot(A[0] + ex * u - x, A[1] + ey * u - y) < m) return false } return true };
    const pathGrid = new Map(); for (const pth of paths) for (let i = 0; i + 1 < pth.pts.length; i++) { const A = pth.pts[i], B = pth.pts[i + 1]; const k = sk((A[0] + B[0]) / 2, (A[1] + B[1]) / 2); let a = pathGrid.get(k); if (!a) pathGrid.set(k, a = []); a.push([A, B]) }
    const pathClear = (x, y, m) => { const cx = Math.floor(x / SC), cy = Math.floor(y / SC); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [A, B] of pathGrid.get((cx + dx) + ',' + (cy + dy)) || []) { const ex = B[0] - A[0], ey = B[1] - A[1], l2 = ex * ex + ey * ey || 1, u = Math.max(0, Math.min(1, ((x - A[0]) * ex + (y - A[1]) * ey) / l2)); if (Math.hypot(A[0] + ex * u - x, A[1] + ey * u - y) < m) return false } return true };
    mark('graph+grids'); yield;
    // buildings: polygons on a grid, point-in-polygon with a margin to the walls
    const polys = [], BG = new Map(), BC = 30;
    const ringsOf = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let nb = 0; for (const f of F.building) { if (++nb % 12 === 0) yield; for (const poly of ringsOf(f.geometry)) { const rings = poly.map(r => r.map(c => toM(c[0], c[1]))); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of rings[0]) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
      if (x1 < bx0 - 5 || x0 > bx1 + 5 || y1 < by0 - 5 || y0 > by1 + 5) continue; const id = polys.length; polys.push({ rings, box: [x0, y0, x1, y1] });
      for (let cx = Math.floor((x0 - 2) / BC); cx <= Math.floor((x1 + 2) / BC); cx++) for (let cy = Math.floor((y0 - 2) / BC); cy <= Math.floor((y1 + 2) / BC); cy++) { const k = cx + ',' + cy; let a = BG.get(k); if (!a) BG.set(k, a = []); a.push(id) } } }
    const pip = (x, y, rings) => { let inside = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const yi = r[i][1], yj = r[j][1]; if ((yi > y) !== (yj > y) && x < (r[j][0] - r[i][0]) * (y - yi) / (yj - yi) + r[i][0]) inside = !inside } return inside };
    const edgeNear = (x, y, rings, m) => { for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const ax = r[j][0], ay = r[j][1], dx = r[i][0] - ax, dy = r[i][1] - ay, l2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); if (Math.hypot(ax + dx * u - x, ay + dy * u - y) < m) return true } return false };
    const inBuilding = (x, y, m) => { const a = BG.get(Math.floor(x / BC) + ',' + Math.floor(y / BC)); if (!a) return false; for (const id of a) { const P = polys[id], b = P.box; if (x < b[0] - m || x > b[2] + m || y < b[1] - m || y > b[3] + m) continue; if (pip(x, y, P.rings) || (m > 0 && edgeNear(x, y, P.rings, m))) return true } return false };
    cell.inBuilding = inBuilding;   // kept on the cell: the viaduct's piers ask it (CityLife.inBuilding)
    mark('buildings'); yield;
    // water, wood, park grass and lawns: a 4 m mask by scanline fill (even–odd); landuse zones on a 10 m grid
    const NW = Math.ceil((bx1 - bx0) / RASTER) + 1, NH = Math.ceil((by1 - by0) / RASTER) + 1, mask = new Uint8Array(NW * NH);
    const rasterize = (rings, bit) => { const rows = new Map();
      for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const ax = (r[i][0] - bx0) / RASTER, ay = (r[i][1] - by0) / RASTER, bx = (r[j][0] - bx0) / RASTER, by = (r[j][1] - by0) / RASTER; if (ay === by) continue;
        const ylo = Math.max(0, Math.ceil(Math.min(ay, by) - .5)), yhi = Math.min(NH - 1, Math.floor(Math.max(ay, by) - .5));
        for (let y = ylo; y <= yhi; y++) { const yc = y + .5; if ((ay > yc) === (by > yc)) continue; const x = ax + (bx - ax) * (yc - ay) / (by - ay); let a = rows.get(y); if (!a) rows.set(y, a = []); a.push(x) } }
      for (const [y, xs] of rows) { xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) { const x0 = Math.max(0, Math.ceil(xs[k] - .5)), x1 = Math.min(NW - 1, Math.floor(xs[k + 1] - .5)); for (let x = x0; x <= x1; x++) mask[y * NW + x] |= bit } } };
    const maskAt = (x, y) => { const ix = Math.floor((x - bx0) / RASTER), iy = Math.floor((y - by0) / RASTER); return ix < 0 || iy < 0 || ix >= NW || iy >= NH ? 0 : mask[iy * NW + ix] };
    for (const f of F.water) { for (const poly of ringsOf(f.geometry)) rasterize(poly.map(r => r.map(c => toM(c[0], c[1]))), 1); yield }
    mark('water'); yield;
    const PARKISH = new Set(['park', 'garden', 'recreation_ground', 'village_green', 'golf_course', 'cemetery', 'zoo', 'theme_park']);
    for (const f of F.landcover) { const p = f.properties; if (p.class !== 'wood' && p.class !== 'grass') continue; const bit = p.class === 'wood' ? 2 : PARKISH.has(p.subclass) ? 4 : 8;
      for (const poly of ringsOf(f.geometry)) rasterize(poly.map(r => r.map(c => toM(c[0], c[1]))), bit); if (++nb % 6 === 0) yield }
    mark('landcover'); yield;
    // zones (for how many people walk where): landuse, the bigger first so the smaller win where they overlap
    const ZC = 10, ZW = Math.ceil((bx1 - bx0) / ZC) + 1, ZH = Math.ceil((by1 - by0) / ZC) + 1, zone = new Uint8Array(ZW * ZH);
    const ZONE = { residential: 1, commercial: 2, retail: 3, industrial: 4, railway: 4, school: 5, university: 5, college: 5, hospital: 5, civic: 5, public: 5, cemetery: 6 }, lus = [];
    for (const f of F.landuse) { const z = ZONE[f.properties.class]; if (!z) continue; for (const poly of ringsOf(f.geometry)) { const rings = poly.map(r => r.map(c => toM(c[0], c[1]))); let A = 0; const r = rings[0]; for (let i = 0, j = r.length - 1; i < r.length; j = i++) A += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); lus.push({ rings, z, A: Math.abs(A) }) } }
    lus.sort((a, b) => b.A - a.A);
    for (const L of lus) { if (++nb % 8 === 0) yield; const rows = new Map(); for (const r of L.rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const ax = (r[i][0] - bx0) / ZC, ay = (r[i][1] - by0) / ZC, bx = (r[j][0] - bx0) / ZC, by = (r[j][1] - by0) / ZC; if (ay === by) continue;
        for (let y = Math.max(0, Math.ceil(Math.min(ay, by) - .5)); y <= Math.min(ZH - 1, Math.floor(Math.max(ay, by) - .5)); y++) { const yc = y + .5; if ((ay > yc) === (by > yc)) continue; const x = ax + (bx - ax) * (yc - ay) / (by - ay); let a = rows.get(y); if (!a) rows.set(y, a = []); a.push(x) } }
      for (const [y, xs] of rows) { xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - .5)); x <= Math.min(ZW - 1, Math.floor(xs[k + 1] - .5)); x++) zone[y * ZW + x] = L.z } }
    const zoneAt = (x, y) => { const m = maskAt(x, y); if (m & 14) return 7; const ix = Math.floor((x - bx0) / ZC), iy = Math.floor((y - by0) / ZC); return ix < 0 || iy < 0 || ix >= ZW || iy >= ZH ? 0 : zone[iy * ZW + ix] };   // 7: park / green
    // POIs: how lively a place is (shops, cafés…) on a 50 m grid; stations are hotspots
    const PG = new Map(), PC = 50, hot = [];
    for (const f of F.poi) { if (++nb % 1500 === 0) yield; const g = f.geometry; if (g.type !== 'Point') continue; const [x, y] = toM(g.coordinates[0], g.coordinates[1]), k = Math.floor(x / PC) + ',' + Math.floor(y / PC); PG.set(k, (PG.get(k) || 0) + 1);
      const c = f.properties.class; if (c === 'railway' || (c === 'bus' && f.properties.subclass === 'bus_station')) hot.push([x, y]) }
    const liveliness = (x, y) => { let n = 0; const cx = Math.floor(x / PC), cy = Math.floor(y / PC); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) n += PG.get((cx + dx) + ',' + (cy + dy)) || 0; let h = 1; for (const [hx, hy] of hot) if (Math.hypot(hx - x, hy - y) < 160) { h = 2.5; break } return h * (1 + Math.min(2, n / 12)) };
    mark('zones+poi'); yield;
    // street trees along the pavements: both sides, the pack's spacing by class, clear of junctions, buildings, water, other streets
    const T = P.trees, trees = [], lamps = [], cross = [], walks = [];
    const hsh = (x, y, c) => hashi(Math.round(x * 2), Math.round(y * 2), c);
    const treeAt = (x, y, kind, hMin, hMax, cMin, cMax) => { const r = hsh(x, y, 1), up = hsh(x, y, 2) < T.shapeWeights.upright ? 1 : 0; trees.push(x, y, hMin + (hMax - hMin) * r, cMin + (cMax - cMin) * hsh(x, y, 3), up, PICK(T.weights, hsh(x, y, 4)), hsh(x, y, 5), hsh(x, y, 6) * 6.283, kind) };
    const okTree = (x, y, self, margin, rail = 4) => x >= bx0 && x < bx1 && y >= by0 && y < by1 && !(maskAt(x, y) & 1) && !inBuilding(x, y, 1.2) && roadClear(x, y, self, margin) && railClear(x, y, rail);
    let n = 0;
    for (const e of edges) {
      if (e.level !== 0) continue; const sp = T.streetSpacingM[e.cls]; if (!sp || e.ramp) continue;
      const off = e.width / 2 + e.sidewalk * .55; if (!e.sidewalk) continue;
      for (const side of [-1, 1]) for (let s = sp * (.4 + .3 * hashi(e.id, side, 11)); s < e.len - 6; s += sp) { if (s < 6) continue; const p = this.graph.poseAt(e, s, side * off, 1); if (okTree(p.x, p.y, e, 1)) treeAt(p.x, p.y, 0, T.streetHeightM[0], T.streetHeightM[1], T.streetCrownDiameterM[0], T.streetCrownDiameterM[1]) }
      if (++n % 60 === 0) yield;
    }
    mark('street-trees'); yield;
    // park trees: a jittered lattice (world-aligned, so a park across two cells is one planting) over the wood / park / lawn mask
    for (const [bit, area] of [[2, T.parkAreaPerTreeM2 * .7], [4, T.parkAreaPerTreeM2], [8, T.parkAreaPerTreeM2 * 3.2]]) {
      const sp = Math.sqrt(area), minSp = T.parkMinSpacingM, j = Math.max(0, Math.min(.45, (sp - minSp) / (2 * sp)));   // the jitter keeps the pack's minimum spacing
      for (let gx = Math.floor(bx0 / sp); gx <= Math.floor(bx1 / sp); gx++) { for (let gy = Math.floor(by0 / sp); gy <= Math.floor(by1 / sp); gy++) {
        const x = (gx + .5 + (hashi(gx, gy, 21) - .5) * 2 * j) * sp, y = (gy + .5 + (hashi(gx, gy, 22) - .5) * 2 * j) * sp;
        if (!(maskAt(x, y) & bit) || !okTree(x, y, null, 2.5, 5) || !pathClear(x, y, 1.6)) continue;
        treeAt(x, y, 1, T.parkHeightM[0], T.parkHeightM[1], T.parkCrownDiameterM[0], T.parkCrownDiameterM[1]) }
        if (++n % 40 === 0) yield }
    }
    mark('park-trees'); yield;
    // lamps along the main streets: every 28 m, primaries both sides staggered, clear of the junctions
    // 골목(minor)도 한쪽에 minorSpacingM 마다(팩에 있을 때, 2026-10-11 행님: 밤 길 빛은 이유 없이 밝지 말고 가로등이 비추게)
    const LM = P.lamps;
    for (const e of edges) {
      const minor = e.cls === 'minor' && LM.minorSpacingM > 0;
      if (e.level !== 0 || e.ramp || !(SIDEWALK_TREES.has(e.cls) || minor)) continue; const off = e.width / 2 + .45, sides = e.cls === 'primary' ? [1, -1] : [1], step = minor ? LM.minorSpacingM : LM.spacingM;
      for (const side of sides) for (let s = (side > 0 ? step / 2 : step / 2 + LM.primaryStaggerM) % step; s < e.len; s += step) {
        if (s < LM.intersectionClearanceM || e.len - s < LM.intersectionClearanceM) continue; const p = this.graph.poseAt(e, s, side * off, 1);
        if (p.x < bx0 || p.x >= bx1 || p.y < by0 || p.y >= by1 || (maskAt(p.x, p.y) & 1) || inBuilding(p.x, p.y, .5) || !roadClear(p.x, p.y, e, .3)) continue;
        lamps.push(p.x, p.y, Math.atan2(-side * p.fx, side * p.fy), hashi(Math.round(p.x), Math.round(p.y), 31)) }   // yaw: the arm toward the road (−side × right)
    }
    mark('lamps'); yield;
    // zebra crossings at the junctions of two or more real streets (no motorways), one band per arm, set back round the corner
    const XW = R.crossing, seenN = new Set(), MAJORX = new Set(['primary', 'secondary', 'tertiary']);
    for (const e of edges) for (const node of [e.a, e.b]) {
      if (seenN.has(node) || node.boundary || node.x < bx0 || node.x >= bx1 || node.y < by0 || node.y >= by1) continue; seenN.add(node);
      if (node.out.length < 3 || node.out.some(o => o.e.cls === 'motorway' || o.e.cls === 'trunk' || o.e.level !== 0) || node.out.filter(o => MAJORX.has(o.e.cls)).length < 2) continue;
      for (const o of node.out) { if (o.e.cls === 'service') continue; let back = 0; for (const q of node.out) if (q.e !== o.e) back = Math.max(back, q.e.width / 2); const d = back + XW.cornerSetbackM + XW.depthM / 2;
        if (o.e.len < d + XW.depthM) continue; const hd = RoadGraph.heading(o); cross.push(node.x + Math.cos(hd) * d, node.y + Math.sin(hd) * d, hd, o.e.width) }
    }
    // the pavements people walk: each street's two sides (streets with a pavement; the alleys themselves), park paths
    for (const e of edges) { if (e.level !== 0 || e.cls === 'motorway' || e.cls === 'trunk' || e.ramp) continue; const p = this.graph.poseAt(e, e.len / 2, 0, 1), z = zoneAt(p.x, p.y), live = liveliness(p.x, p.y);
      for (const side of e.sidewalk ? [-1, 1] : [1]) walks.push({ e, side, off: e.sidewalk ? e.width / 2 + e.sidewalk * .5 : 0, zone: z, live, len: e.len, path: false }) }
    for (const pth of paths) { if (pth.pts.length < 2) continue; const xs = new Float64Array(pth.pts.length), ys = new Float64Array(pth.pts.length), cum = new Float64Array(pth.pts.length);
      const bb = [Infinity, Infinity, -Infinity, -Infinity]; for (let i = 0; i < pth.pts.length; i++) { xs[i] = pth.pts[i][0]; ys[i] = pth.pts[i][1]; if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); if (xs[i] < bb[0]) bb[0] = xs[i]; if (xs[i] > bb[2]) bb[2] = xs[i]; if (ys[i] < bb[1]) bb[1] = ys[i]; if (ys[i] > bb[3]) bb[3] = ys[i] }
      const len = cum[cum.length - 1]; if (len < 10) continue; const mx = xs[xs.length >> 1], my = ys[ys.length >> 1]; if (mx < bx0 || mx >= bx1 || my < by0 || my >= by1) continue;
      walks.push({ e: { xs, ys, cum, len, a: null, b: null, width: 0, box: bb }, side: 0, off: 0, zone: 7, live: liveliness(mx, my), len, path: true }) }
    mark('crossings+walks'); yield;
    // onto the GPU: each prop sorted into an 8×8 sub-grid of the cell, so the view draws only the rows and columns it covers
    const gl = this.gl, SUB = 8, sx = (bx1 - bx0) / SUB, sy = (by1 - by0) / SUB;
    const binned = (arr, stride) => { const n = arr.length / stride, idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = i;
      const sub = i => Math.min(SUB - 1, Math.max(0, Math.floor((arr[i * stride + 1] - by0) / sy))) * SUB + Math.min(SUB - 1, Math.max(0, Math.floor((arr[i * stride] - bx0) / sx)));
      idx.sort((a, b) => sub(a) - sub(b)); const data = new Float32Array(n * stride), start = new Int32Array(SUB * SUB + 1).fill(-1);
      for (let k = 0; k < n; k++) { const i = idx[k]; for (let j = 0; j < stride; j++) data[k * stride + j] = arr[i * stride + j]; const s = sub(i); if (start[s] < 0) start[s] = k } start[SUB * SUB] = n;
      for (let s = SUB * SUB - 1; s >= 0; s--) if (start[s] < 0) start[s] = start[s + 1];
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return { b, n, start, stride } };
    const street = [], park = []; for (let i = 0; i < trees.length; i += 9) (trees[i + 8] < .5 ? street : park).push(...trees.slice(i, i + 9));
    cell.trees = binned(street, 9); cell.ptrees = binned(park, 9); cell.lamps = binned(lamps, 4); cell.cross = binned(cross, 4); cell.walks = walks; cell.hot = hot;
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    cell.sub = { SUB, sx, sy }; cell.ms = performance.now() - t0; cell.counts = { trees: trees.length / 9, street: street.length / 9, lamps: lamps.length / 4, cross: cross.length / 4, edges: edges.length, walks: walks.length };
    mark('gpu'); cell.state = 'ready';
  }
  dropCell(cell) { const gl = this.gl; for (const k of ['trees', 'ptrees', 'lamps', 'cross']) if (cell[k]?.b) gl.deleteBuffer(cell[k].b); if (cell.inGraph) this.graph.removeCell(cell.key); this.cells.delete(cell.key) }
  // the sub-grid ranges of a cell the view box touches: [rowStart, rowEnd) as instance ranges
  ranges(cell, prop, box) {
    const B = cell[prop]; if (!B || !B.n) return []; const { SUB, sx, sy } = cell.sub, [bx0, by0] = cell.box, out = [];
    const cx0 = Math.max(0, Math.floor((box[0] - bx0) / sx)), cx1 = Math.min(SUB - 1, Math.floor((box[2] - bx0) / sx)), cy0 = Math.max(0, Math.floor((box[1] - by0) / sy)), cy1 = Math.min(SUB - 1, Math.floor((box[3] - by0) / sy));
    for (let cy = cy0; cy <= cy1; cy++) { const a = B.start[cy * SUB + cx0], b = B.start[cy * SUB + cx1 + 1]; if (b > a) out.push([a, b - a]) }
    return out;
  }

  // ── the frame ───────────────────────────────────────────────────────────────────────────────
  render(gl, matrix, opts = {}) {
    if (this.broken || !this.gl) return;
    try { this._render(gl, matrix, opts) } catch (e) { this.broken = true; this._anim = false; console.error('city-life: off —', e); try { gl.bindVertexArray(null); gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) } catch { } }
  }
  _render(gl, matrix, opts) {
    const t0 = performance.now(), { now = t0, zoom = 15, bearing = 0, dark = false, tone = 'simcity', lampPool = 1.4, cars = true, crossings = true, people = true, phone = false, reducedMotion = false, pixelRatio = 1, bounds, mapOn = true, moving = false, sun } = opts;
    const look = opts.look || this.pack;   // look: the mode's pack for the lamps' look(조선 팩: 횃불); cars · crossings: 모드 설정 city.life(조선: 차 · 횡단보도 없음)
    this._anim = false; if (!bounds || !mapOn || zoom < MINZ) { this.stats.idle = true; return }
    const pack = this.pack, box = [(bounds[0] - O.x) / MU, (bounds[1] - O.y) / MU, (bounds[2] - O.x) / MU, (bounds[3] - O.y) / MU];
    const pad = Math.min(400, (box[2] - box[0]) * .15), vbox = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];   // a little past the edges: props grow in before they are in frame
    // cells: wanted, waiting, being built
    const need = this.needed(vbox), wanted = new Set();
    for (const [key, x, y] of need) { wanted.add(key); if (!this.cells.has(key)) this.cells.set(key, { key, x, y, box: this.cellBox(x, y), state: 'pending', tries: 0 }) }
    const pending = [...this.cells.values()].filter(c => c.state === 'pending');
    const due = pending.filter(c => !(c.retryAt > now));
    if (due.length && now - this.lastQuery > 400) {
      this.lastQuery = now; const by = this.gather();
      // a tile that is there but bare (water, say) is finished at once; one whose features have not come (not loaded yet, or
      // only in the padding — the map does not fetch what is off screen) is asked after again, less and less often, and is
      // built when they do come. (Settling for empty after a few tries left whole tiles bare after a pan: no trees, cars or people.)
      for (const c of due) { const F = by.get(c.key); if (F && (F.transportation.length || F.building.length || F.landcover.length)) { c.state = 'building'; c.gen = this.build(c, F) } else if (F) { c.state = 'ready'; c.counts = {}; c.walks = []; c.bare = true } else { c.tries++; c.retryAt = now + Math.min(8000, 400 * 2 ** Math.min(c.tries, 5)) } }
    }
    // one cell at a time, nearest the centre first, within this frame's budget
    if (!this.building || this.building.state !== 'building') { const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2; this.building = [...this.cells.values()].filter(c => c.state === 'building').sort((a, b) => Math.hypot((a.box[0] + a.box[2]) / 2 - cx, (a.box[1] + a.box[3]) / 2 - cy) - Math.hypot((b.box[0] + b.box[2]) / 2 - cx, (b.box[1] + b.box[3]) / 2 - cy))[0] || null }
    // (slow frames — a weak device, a software renderer — get a bigger slice: the city should not take a minute to appear)
    if (this.building) { const deadline = t0 + (moving ? 4 : Math.min(60, Math.max(12, (now - (this.lastFrame || now)) * .4))), c = this.building; let r; do { const s0 = c.s0 = performance.now(); r = c.gen.next(); const el = performance.now() - s0; c.cur = (c.cur || 0) + el; c.maxStep = Math.max(c.maxStep || 0, el); c.cpuMs = (c.cpuMs || 0) + el } while (!r.done && performance.now() < deadline); if (r.done) { c.gen = null; this.building = null } }
    if (this.cells.size > 10) for (const c of [...this.cells.values()]) { if (this.cells.size <= 8) break; if (!wanted.has(c.key) && c.state !== 'building') this.dropCell(c) }
    this.lastFrame = now;
    const stillBuilding = [...this.cells.values()].some(c => c.state === 'building' || (c.state === 'pending' && !(c.box[2] < box[0] || c.box[0] > box[2] || c.box[3] < box[1] || c.box[1] > box[3]))), waiting = [...this.cells.values()].filter(c => c.state === 'pending').length;   // building: the view still lacks props (being built, or its tile not here yet); waiting: cells (in view or not) without their tile
    // the frame's matrix (the local origin folded in, in double precision) and lighting
    const MT = this.M; MT.set(matrix); for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r] * O.x + matrix[4 + r] * O.y + matrix[12 + r];
    const theme = dark ? 'dark' : 'light', mode = pack.modes[tone] ? tone : 'simcity', Lg = pack.lighting[theme], ref = pack.lighting.referenceSun;
    const az = (sun?.azimuth ?? ref.azimuthDeg) * Math.PI / 180, el = Math.max(sun?.elevation ?? ref.elevationDeg, 12) * Math.PI / 180;
    const light = [Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)], lit = [Lg.ambient, Lg.directional], tint = hexRgb(Lg.color);
    const col = h => { const c = toneRGB(hexRgb(h), pack, mode, theme); return [c[0] * tint[0], c[1] * tint[1], c[2] * tint[2]] };
    const lod = pack.lod, fadeStreet = smooth(lod.streetTrees[0], lod.streetTrees[1], zoom), fadePark = smooth(lod.parkTrees[0], lod.parkTrees[1], zoom), fadeLamp = smooth(lod.lamps[0], lod.lamps[1], zoom), fadeCar = smooth(lod.vehicles[0], lod.vehicles[1], zoom), fadePeople = smooth(lod.people[0], lod.people[1], zoom), fadeCross = smooth(pack.roads.crossing.minZoom, pack.roads.crossing.minZoom + .5, zoom);
    const ready = [...this.cells.values()].filter(c => c.state === 'ready' && c.trees && !(c.box[2] < vbox[0] || c.box[0] > vbox[2] || c.box[3] < vbox[1] || c.box[1] > vbox[3]));
    const stats = { cells: this.cells.size, ready: ready.length, trees: 0, lamps: 0, cross: 0, cars: 0, people: 0, building: stillBuilding, waiting, buildMs: Math.round(Math.max(0, ...ready.map(c => c.ms || 0))), cpuMs: Math.round(Math.max(0, ...ready.map(c => c.cpuMs || 0))), maxStep: Math.round(Math.max(0, ...ready.map(c => c.maxStep || 0))), phases: ready.map(c => c.phases), counts: ready.map(c => c.counts) };
    gl.bindVertexArray(null); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    // ── trees (and their shadows by day): the view's sub-grid ranges of each cell, capped by rank ──
    if (fadePark > 0) {
      const T = pack.props.trees, cap = T.maxVisible[phone ? 'phone' : 'desktop'], draws = [], pdraws = []; let nS = 0, nP = 0;
      for (const c of ready) { for (const [a, n] of this.ranges(c, 'trees', box)) nS += n; for (const [a, n] of this.ranges(c, 'ptrees', box)) nP += n;
        for (const r of this.ranges(c, 'trees', vbox)) draws.push([c, c.trees, ...r]); for (const r of this.ranges(c, 'ptrees', vbox)) pdraws.push([c, c.ptrees, ...r]) }
      // the cap (what is in frame): the street trees first, the park trees take what is left
      const keepS = nS * fadeStreet > cap ? cap / (nS * fadeStreet) : 1.01, keepP = nP * fadePark > Math.max(0, cap - nS * fadeStreet * Math.min(1, keepS)) ? Math.max(0, cap - nS * fadeStreet * Math.min(1, keepS)) / (nP * fadePark) : 1.01;
      stats.trees = Math.round(Math.min(nS * fadeStreet, cap) + Math.min(nP * fadePark, Math.max(0, cap - Math.min(nS * fadeStreet, cap)))); stats.treeCand = nS + nP;
      const lodI = zoom >= 16 ? 1 : 0, va = this.vaT[lodI], mesh = this.meshT[lodI], pal = T.colors[theme].map(col);
      gl.useProgram(this.pT); gl.uniformMatrix4fv(this.uT.u_matrix, false, MT); gl.uniform1f(this.uT.u_mu, MU); gl.uniform1f(this.uT.u_trunkR, Math.max(T.trunkDiameterM / 2, .45 * MPP(zoom)));
      gl.uniform2f(this.uT.u_fade, fadeStreet, fadePark); gl.uniform2fv(this.uT.u_lit, lit); gl.uniform3fv(this.uT.u_pal, pal.flat()); gl.uniform3fv(this.uT.u_trunk, col(T.trunk[theme])); gl.uniform3fv(this.uT.u_light, light);
      gl.uniform3fv(this.uT.u_shade, hexRgb(pack.lighting.shadow.color)); gl.uniform1f(this.uT.u_alpha, 1);
      gl.bindVertexArray(va);
      const inst = (B, a) => { gl.bindBuffer(gl.ARRAY_BUFFER, B.b); const o = a * 36; for (const [loc, n, off] of [[3, 4, 0], [4, 4, 16], [5, 1, 32]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 36, o + off); gl.vertexAttribDivisor(loc, 1) } };
      const pass = (list, keep) => { gl.uniform1f(this.uT.u_keep, keep); for (const [c, B, a, n] of list) { inst(B, a); gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.n, n) } };
      const shadows = !dark && (sun ? sun.elevation > 2 : true) && zoom >= 15.5;
      if (shadows) {   // the shadows first, blended onto the ground, no depth written
        gl.uniform1f(this.uT.u_shadow, 1); gl.uniform1f(this.uT.u_alpha, pack.modes[mode].shadowOpacity[theme] * 1.4); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        pass(draws, keepS); pass(pdraws, keepP);
        gl.depthMask(true); gl.disable(gl.BLEND); gl.uniform1f(this.uT.u_alpha, 1) }
      gl.uniform1f(this.uT.u_shadow, 0);
      pass(draws, keepS); pass(pdraws, keepP);
    }
    // ── lamps: the posts by day, glowing heads, pools and bulbs after dark ──
    // 밤 불빛(팩 night.lights, 다크 · 켰을 때): 웅덩이 · 전구는 기둥보다 먼 줌부터(lampPool.lod) 더 넓고 진하게, 차 앞불 줄기도 먼저 · 진하게
    const NL = dark && opts.night?.lights ? (look.night || pack.night)?.lights : null, fadePool = NL?.lampPool ? smooth(NL.lampPool.lod[0], NL.lampPool.lod[1], zoom) : fadeLamp;
    const lampDraws = []; if (fadeLamp > 0 || (dark && fadePool > 0)) {
      const LM = look.props.lamps, LP = this.lampFor(gl, LM); let total = 0; for (const c of ready) for (const [a, n] of this.ranges(c, 'lamps', vbox)) { lampDraws.push([c, a, n]); total += n }
      const keep = phone ? .5 : 1.01; stats.lamps = Math.round(total * Math.min(1, keep));
      const inst = (c, a) => { gl.bindBuffer(gl.ARRAY_BUFFER, c.lamps.b); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 16, a * 16); gl.vertexAttribDivisor(3, 1) };
      gl.useProgram(this.pL); gl.uniformMatrix4fv(this.uL.u_matrix, false, MT); gl.uniform1f(this.uL.u_mu, MU); gl.uniform1f(this.uL.u_fade, fadeLamp); gl.uniform1f(this.uL.u_keep, keep); gl.uniform1f(this.uL.u_night, dark ? 1 : 0); gl.uniform1f(this.uL.u_thick, Math.max(1, .55 * MPP(zoom) / (LM.poleDiameterM / 2)));   // never thinner than about half a pixel
      gl.uniform2fv(this.uL.u_lit, lit); gl.uniform3fv(this.uL.u_pole, col(LM.pole[theme])); gl.uniform3fv(this.uL.u_glow, hexRgb(LM.light)); gl.uniform3fv(this.uL.u_light, light); gl.uniform1f(this.uL.u_alpha, 1);
      if (LM.torch) { gl.uniform1f(this.uL.u_time, reducedMotion ? 0 : (now % 1e6) / 1000); gl.uniform3fv(this.uL.u_flame, [...hexRgb(LM.torch.flame[0]), ...hexRgb(LM.torch.flame[1])]); if (!reducedMotion && lampDraws.length) this._anim = true }   // 횃불은 계속 흔들린다
      if (fadeLamp > 0) { gl.bindVertexArray(LP.va); for (const [c, a, n] of lampDraws) { inst(c, a); gl.drawArraysInstanced(gl.TRIANGLES, 0, LP.mesh.n, n) } }
    }
    // ── cars: the simulation, then the instanced boxes ──
    if (fadeCar > 0 && cars && !(phone && zoom < 16.3)) {
      const V = pack.props.vehicles, dt = (now - (this.tick || now)) / 1000, grow = Math.max(1, 5 * MPP(zoom) / V.carSizeM[0]);
      this.traffic.step(dt, { box: vbox, cap: V.maxVisible[phone ? 'phone' : 'desktop'], fade: fadeCar, now: now / 1000, reducedMotion });
      this.vehicles.draw(gl, MT, MU, this.traffic.poses, this.traffic.count, { light, lit, night: dark, glass: col(pack.buildingDefaults.glass[theme]), dark: col('#2a2f33'), grow: grow * (.2 + .8 * fadeCar), beams: zoom >= (NL?.carBeam?.minZoom ?? 16.5), beamAlpha: NL?.carBeam?.opacity, pixelRatio });
      stats.cars = this.traffic.count; stats.traffic = this.traffic.stats; if (!reducedMotion && this.traffic.count) this._anim = true;
    } else this.traffic.clear();
    this.tick = now;
    // ── people on the pavements ──
    if (people && fadePeople > 0) { const n = this.stepPeople(now, vbox, ready, fadePeople, phone, reducedMotion); stats.people = n;
      if (n) { const PP = look.props.people, mpp = MPP(zoom), unit = Math.max(PP.heightM, 6 * mpp) / PERSON_UNITS, b = bearing * Math.PI / 180;
        const buf = this.peopleInst[this.ping ^= 1]; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, this.people.poses.byteLength, gl.DYNAMIC_DRAW); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.people.poses, 0, n * 14);
        const shirts = PP.clothes.map(col), pants = PP.clothes.map(h => col(h).map(v => v * .55)), hair = (PP.hair ?? ['#1C140F', '#332114', '#121214', '#4D331F']).map(col);   // (hair: the pack's if it has one)
        gl.useProgram(this.pH); gl.uniformMatrix4fv(this.uH.u_matrix, false, MT); gl.uniform1f(this.uH.u_mu, MU); gl.uniform1f(this.uH.u_time, reducedMotion ? 0 : now / 1000); gl.uniform1f(this.uH.u_unit, unit);
        gl.uniform2f(this.uH.u_right, Math.cos(b), Math.sin(b)); gl.uniform2fv(this.uH.u_lit, lit); gl.uniform3fv(this.uH.u_shirt, shirts.flat()); gl.uniform3fv(this.uH.u_pants, pants.flat()); gl.uniform3fv(this.uH.u_hair, hair.flat()); gl.uniform3fv(this.uH.u_skin, col(PP.skin[theme])); gl.uniform3fv(this.uH.u_light, light); gl.uniform1f(this.uH.u_alpha, 1);
        gl.bindVertexArray(this.vaH); gl.bindBuffer(gl.ARRAY_BUFFER, buf); for (const [loc, k, off] of [[3, 4, 0], [4, 4, 16], [5, 2, 32]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, k, gl.FLOAT, false, 56, off); gl.vertexAttribDivisor(loc, 1) }
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.meshH.n, n); if (!reducedMotion) this._anim = true } }
    else this.people.list.length = 0;
    // ── decals: zebra crossings close up; after dark the lamps' pools and bulbs ──
    gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (fadeCross > 0 && crossings) {
      const X = pack.roads.crossing, draws = []; let total = 0; for (const c of ready) for (const [a, n] of this.ranges(c, 'cross', vbox)) { draws.push([c, a, n]); total += n } stats.cross = total;
      if (total) { gl.useProgram(this.pX); gl.uniformMatrix4fv(this.uX.u_matrix, false, MT); gl.uniform1f(this.uX.u_mu, MU); gl.uniform1f(this.uX.u_fade, fadeCross); gl.uniform1f(this.uX.u_depth, X.depthM);
        gl.uniform3fv(this.uX.u_rgb, col(pack.roads.lane.colors[theme])); gl.uniform1f(this.uX.u_alpha, (dark ? .55 : .9) * fadeCross); gl.uniform1f(this.uX.u_stripe, X.stripeM); gl.uniform1f(this.uX.u_gap, X.gapM);
        gl.bindVertexArray(this.vaQ); for (const [c, a, n] of draws) { gl.bindBuffer(gl.ARRAY_BUFFER, c.cross.b); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 16, a * 16); gl.vertexAttribDivisor(3, 1); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n) } }
    }
    if (dark && lampDraws.length) {
      const LM = look.props.lamps, keep = phone ? .5 : 1.01, lp = lampPool ?? pack.modes[mode].lampPool, glow = hexRgb(LM.light), LPn = NL?.lampPool;
      const pool = LPn ? LPn.opacity * Math.max(.5, Math.min(1, lp / 1.4)) : Math.min(LM.poolOpacity * lp, LM.simcityPoolMaxOpacity);   // (밤 불빛: 모드의 웅덩이 배수를 기본 1.4 에 견준 몫만큼, 반 아래로는 안 줄인다)
      gl.useProgram(this.pP); gl.uniformMatrix4fv(this.uP.u_matrix, false, MT); gl.uniform1f(this.uP.u_mu, MU); gl.uniform1f(this.uP.u_fade, fadePool); gl.uniform1f(this.uP.u_keep, keep); gl.uniform1f(this.uP.u_arm, LM.armM); gl.uniform1f(this.uP.u_radius, LM.poolRadiusM * (LPn?.radiusMul ?? 1.6));
      gl.uniform3fv(this.uP.u_rgb, glow); gl.uniform1f(this.uP.u_alpha, pool);
      gl.bindVertexArray(this.vaQ); for (const [c, a, n] of lampDraws) { gl.bindBuffer(gl.ARRAY_BUFFER, c.lamps.b); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 16, a * 16); gl.vertexAttribDivisor(3, 1); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n) }
      const sz = bulbSize(zoom, pixelRatio, .9 * (LM.torch?.glowMul ?? 1));   // (횃불: 불빛 점을 더 크게)
      gl.useProgram(this.pB); gl.uniformMatrix4fv(this.uB.u_matrix, false, MT); gl.uniform1f(this.uB.u_mu, MU); gl.uniform1f(this.uB.u_fade, fadePool); gl.uniform1f(this.uB.u_keep, keep); gl.uniform1f(this.uB.u_arm, LM.armM); gl.uniform1f(this.uB.u_h, LM.heightM + (LM.torch ? LM.torch.basketM + .5 * LM.torch.flameM : 0));   // (횃불: 불꽃 가운데)
      gl.uniform1f(this.uB.u_size, sz.point); gl.uniform1f(this.uB.u_core, sz.coreFrac); gl.uniform3fv(this.uB.u_rgb, glow); gl.uniform2f(this.uB.u_wt, .85, .14);
      gl.bindVertexArray(this.vaP); for (const [c, a, n] of lampDraws) { gl.bindBuffer(gl.ARRAY_BUFFER, c.lamps.b); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 16, a * 16); gl.vertexAttribDivisor(3, 0); gl.drawArrays(gl.POINTS, 0, n) }
    }
    // back to what the track and the trains expect
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
    if (stillBuilding) this._anim = true;   // frames keep coming while a cell is being built
    stats.ms = performance.now() - t0; this.stats = stats;
  }
  // People: spawned on the pavements in view by zone (the pack's rate per 100 m) and how lively the place is
  // (POIs, stations), walking their side of the street, on to another street at the corner, a pause now and
  // then. Poses: x, y, phase, walking, fx, fy, shirt, scale, pants, hair, … (14 floats).
  stepPeople(now, box, ready, fade, phone, reducedMotion) {
    const PP = this.pack.props.people, L = this.people.list, dt = Math.min(.1, (now - (this.ptick || now)) / 1000); this.ptick = now; if (!reducedMotion) this.people.simT += dt;
    const RATE = { 1: PP.per100M.residential, 2: PP.per100M.commercial, 3: PP.per100M.retail, 4: PP.per100M.industrial, 5: PP.per100M.residential, 6: 1, 7: PP.per100M.park, 0: 2 };
    const vis = []; let want = 0;
    for (const c of ready) for (const w of c.walks) { const e = w.e, B = e.box; if (B && (B[2] < box[0] || B[0] > box[2] || B[3] < box[1] || B[1] > box[3])) continue; const V = visibleRanges(e, box); if (!V.len) continue; const r = (RATE[w.zone] ?? 2) * w.live * (w.path ? 1 : .5); vis.push([w, r, V]); want += V.len / 100 * r }   // the part of each pavement in view (a street's middle vertex was the test: long streets through the view got nobody)
    const cap = PP.maxVisible[phone ? 'phone' : 'desktop'], target = Math.min(cap, Math.round(want * fade));
    const G = this.graph, at = p => { const e = p.w.e, q = G.poseAt(e, p.s, p.w.side * p.w.off + p.jit, p.dir), h = p.hop; p.fx = q.fx; p.fy = q.fy;
      if (h) { if (!h.T) { h.T = Math.hypot(q.x - h.x0, q.y - h.y0) / p.v; if (h.T < .05) p.hop = null } if (p.hop) { const k = Math.min(1, h.t / h.T); p.x = h.x0 + (q.x - h.x0) * k; p.y = h.y0 + (q.y - h.y0) * k; return } }   // round the corner: from where they were to the next pavement, at walking pace
      p.x = q.x; p.y = q.y };
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i], e = p.w.e; if (!p.w.path && !G.edges.has(e)) { L.splice(i, 1); continue }
      if (!reducedMotion) {
        if (p.pause > 0) p.pause -= dt; else if (p.hop) { p.hop.t += dt; if (p.hop.t >= p.hop.T) p.hop = null } else p.s += p.v * dt * p.dir;
        if (Math.random() < dt * .02) p.pause = 1 + Math.random() * 3;
        if (p.s < 0 || p.s > e.len) {   // the end of the street: on to another one here, else back
          const node = p.s < 0 ? e.a : e.b, next = node ? node.out.filter(o => o.e !== e && o.e.level === 0 && (o.e.sidewalk || o.e.cls === 'minor' || o.e.cls === 'service')) : [];
          if (next.length) { const o = next[Math.random() * next.length | 0], ne = o.e, dir = o.end === 0 ? 1 : -1; let w = null; for (const c of ready) for (const x of c.walks) if (x.e === ne && (w == null || Math.random() < .5)) w = x; if (w) { p.hop = { x0: p.x, y0: p.y, t: 0, T: 0 }; p.w = w; p.dir = dir; p.s = dir > 0 ? 0 : ne.len } else { p.dir = -p.dir; p.s = Math.max(0, Math.min(e.len, p.s)) } }
          else { p.dir = -p.dir; p.s = Math.max(0, Math.min(e.len, p.s)); p.pause = Math.random() * 2 }
        }
      }
      if (p.dying) { p.sc -= dt * 2; if (p.sc <= 0) { L.splice(i, 1); continue } } else if (p.sc < 1) p.sc = Math.min(1, p.sc + dt * 2);
      at(p); if (p.x < box[0] - 150 || p.x > box[2] + 150 || p.y < box[1] - 150 || p.y > box[3] + 150) { L.splice(i, 1); continue }
    }
    let visible = 0; for (const p of L) if (!p.dying) visible++;
    if (vis.length && visible < target) for (let k = 0; k < 4 && visible < target && L.length < this.people.max; k++) {
      let r = Math.random() * want, pick = vis[0]; for (const v of vis) { r -= v[2].len / 100 * v[1]; if (r <= 0) { pick = v; break } }
      const w = pick[0], p = { id: ++this.people.seq, w, s: sampleS(pick[2], Math.random()), dir: Math.random() < .5 ? 1 : -1, v: PP.speedMps[0] + Math.random() * (PP.speedMps[1] - PP.speedMps[0]), ph: Math.random() * 6.283, pause: 0, jit: (Math.random() - .5) * (w.path ? 1.2 : .6), shirt: Math.random() * 4 | 0, pants: Math.random() * 4 | 0, hair: Math.random() * 4 | 0, sc: 0, dying: false };
      at(p); L.push(p); visible++;
    } else if (visible > target * 1.3) { let n = Math.min(3, visible - target); for (const p of L) { if (n <= 0) break; if (!p.dying) { p.dying = true; n-- } } }
    const P = this.people.poses; let n = 0;
    for (const p of L) { if (n >= this.people.max) break; const o = n * 14; P[o] = p.x; P[o + 1] = p.y; P[o + 2] = p.ph; P[o + 3] = p.pause > 0 ? 0 : 1; P[o + 4] = p.fx * p.dir; P[o + 5] = p.fy * p.dir; P[o + 6] = p.shirt; P[o + 7] = p.sc * fade; P[o + 8] = p.pants; P[o + 9] = p.hair; n++ }
    this.people.count = n; return n;
  }
  // Finish building every waiting cell right now, whatever it costs (for tests and screenshots, not for frames).
  flush() {
    if (!this.gl) return 0; let n = 0;
    for (let round = 0; round < 3; round++) {
      const by = this.gather(); for (const c of this.cells.values()) if (c.state === 'pending') { const F = by.get(c.key); if (F && (F.transportation.length || F.building.length || F.landcover.length)) { c.state = 'building'; c.gen = this.build(c, F) } }
      for (const c of this.cells.values()) if (c.state === 'building' && c.gen) { let r; do { c.s0 = performance.now(); r = c.gen.next() } while (!r.done); c.gen = null; if (this.building === c) this.building = null; n++ }
      if (![...this.cells.values()].some(c => c.state === 'pending')) break;
    }
    return n;
  }
  // Is (x, y) (local metres) inside a building footprint: true / false, or undefined where no cell is ready yet (the
  // viaduct's piers wait for that, so none stands in a building whose tile has not come).
  inBuilding(x, y) { for (const c of this.cells.values()) { const b = c.box; if (x < b[0] || x >= b[2] || y < b[1] || y >= b[3]) continue; if (c.state !== 'ready') return undefined; return c.bare ? false : c.inBuilding ? c.inBuilding(x, y, 1.3) : false } return undefined }
  animating() { return this._anim }
  dispose(gl) {
    if (!this.gl) return; for (const c of [...this.cells.values()]) this.dropCell(c);
    for (const p of [this.pT, this.pL, this.pP, this.pB, this.pX, this.pH]) gl.deleteProgram(p);
    for (const m of [...this.meshT, ...[...this.lamps.values()].map(e => e.mesh), this.meshH]) gl.deleteBuffer(m.b); for (const e of this.lamps.values()) if (e.va !== this.vaL) gl.deleteVertexArray(e.va); gl.deleteBuffer(this.quad); for (const b of this.peopleInst) gl.deleteBuffer(b);
    for (const va of [this.vaH, this.vaQ, this.vaL, this.vaP, ...this.vaT]) gl.deleteVertexArray(va);
    this.vehicles.dispose(gl); this.gl = null;
  }
}
export { ORIGIN, MU, O as MERC_ORIGIN, toM };   // the local metre frame (city_viaduct.mjs shares it)
export default CityLife;
