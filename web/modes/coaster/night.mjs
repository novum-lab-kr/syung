// 밤의 놀이공원 — the lights the park wears after dark, and the fireworks over the river.
// Dark theme + coaster mode only; the caller builds this layer then and drops it on the way out.
//
// Three things live here:
//   · the bulb sprite — one point sprite, warm core plus a soft halo, shared with park_rides.mjs so
//     the festoon lights on the rides and the string under the coaster track are the same little lamp;
//   · the track bulbs — tens of thousands of points for the whole network, bucketed into a grid once
//     and drawn as a handful of row ranges, thinned by gl_VertexID so the cap is kept without rebuilding;
//   · the fireworks — four riverfront anchors on a 28 s cycle, every particle computed in the vertex
//     shader from its index and the clock, so nothing is uploaded while they fly.
//
//   const night=new NightLayer(); night.init(gl); night.setTrackBulbs(coasterTrack.bulbs());
//   night.render(gl,matrix,{now,zoom,phone,reducedMotion,bounds,pixelRatio}); night.animating(); night.dispose(gl);

import { PARK_DEFAULTS as STYLE } from '../basic/park.mjs'; import { metresPerPixel } from './metrics.mts';

const EARTH = 40075016.685578488;
const mercX = lon => lon / 360 + .5;
const mercY = lat => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
const muOf = lat => 1 / (EARTH * Math.cos(lat * Math.PI / 180));
export const ORIGIN = [126.978, 37.5665];   // the local origin every night buffer is relative to

export const hexRGB = h => { const v = parseInt(String(h).replace('#', ''), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255] };

// ── the bulb ────────────────────────────────────────────────────────────────────────────────────
// Shared by the ride festoons (park_rides.mjs), the track string and the fireworks: one sprite with a
// bright core and a wide soft halo. The overlay canvas is premultiplied alpha and the browser composites
// it, so this writes proper premultiplied source-over — never a blind ONE/ONE that leaves alpha wrong.
export const BULB_FS = `#version 300 es
precision highp float;
in vec3 v_rgb; in vec2 v_mix;   // v_mix = (core fraction of the sprite, brightness)
uniform vec2 u_wt;              // how much of the core and of the halo: a festoon bulb is quiet, a firework is not
out vec4 o;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;            // 0 at the centre, 1 at the sprite's edge
  if (d > 1.) discard;
  float core = 1. - smoothstep(v_mix.x * .66, v_mix.x, d);
  float halo = pow(max(0., 1. - d), 2.2);
  float a = (u_wt.x * core + u_wt.y * halo) * v_mix.y;
  if (a <= .003) discard;
  o = vec4(v_rgb * a, a);                               // premultiplied
}`;
// a twinkle for one bulb in five: 0.75-1.0 over 4-7 s, its own phase. No flashing.
export const BULB_TWINKLE = `
float twinkle(float h, float t, float anim){
  if (anim < .5 || h > .2) return 1.;
  return .875 + .125 * sin(6.283185 * (t / (4. + h * 15.) + h * 7.));
}
float hash1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }`;

// A ribbon: a segment A->B widened across the screen to a fixed pixel half-width, with a bright core
// and a soft fringe. Shared by the platform strips and the rides' neon outlines.
export const RIBBON = `
vec4 ribbon(vec4 A, vec4 B, float t, float side, float halfPx, vec2 vp){
  vec4 P = mix(A, B, t);
  vec2 d = (B.xy / max(abs(B.w), 1e-6) - A.xy / max(abs(A.w), 1e-6)) * vp * .5;   // the segment, in pixels
  float l = length(d);
  vec2 n = l > 1e-5 ? vec2(-d.y, d.x) / l : vec2(0., 1.);
  P.xy += n * (halfPx * side) * 2. / vp * P.w;
  return P;
}`;
export const RIBBON_FS = `#version 300 es
precision highp float;
in vec3 v_rgb; in vec3 v_mix;   // across the ribbon (-1..1), core fraction, brightness
uniform vec2 u_wt;
out vec4 o;
void main(){
  float d = abs(v_mix.x);
  float core = 1. - smoothstep(v_mix.y * .6, v_mix.y, d);
  float fringe = pow(max(0., 1. - d), 2.);
  float a = (u_wt.x * core + u_wt.y * fringe) * v_mix.z;
  if (a <= .003) discard;
  o = vec4(v_rgb * a, a);
}`;

const BULB_EVERY = STYLE.night.bulbEveryM;   // metres between track bulbs, as coasterTrack.bulbs() spaces them
const lerpZ = (z, a, b, c) => z <= 13 ? a : z >= 17 ? c : z <= 15 ? a + (b - a) * (z - 13) / 2 : b + (c - b) * (z - 15) / 2;
// Core and halo diameters in CSS pixels; the pack caps them at 2.2 / 7 px.
export function bulbSize(zoom, pixelRatio, scale = 1) {
  const core = lerpZ(zoom, ...STYLE.night.corePx), glow = lerpZ(zoom, ...STYLE.night.haloPx);
  return { point: glow * scale * pixelRatio, coreFrac: core / glow };
}
export function sparkSize(zoom, pixelRatio) {           // the fireworks: halo 3x, no cap
  const core = lerpZ(zoom, 2.6, 3.4, 4.2), glow = core * 3;
  return { point: glow * pixelRatio, coreFrac: core / glow };
}
// The existing eight-slot shader contract, with warm bulbs and restrained gold accents.
export const BULB_PAL = [STYLE.palette.dark.bulbWarm, ...Array(7).fill(STYLE.palette.dark.gold)];
export const NEON = {drop:STYLE.palette.dark.gold,saucer:STYLE.palette.dark.bulbWarm,swing:STYLE.palette.dark.bulbWarm,ferris:STYLE.palette.dark.bulbWarm};
export const CREAM = STYLE.palette.dark.bulbWarm;

export function compile(gl, vsrc, fsrc) {
  const sh = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(x)); return x };
  const p = gl.createProgram(), v = sh(gl.VERTEX_SHADER, vsrc), f = sh(gl.FRAGMENT_SHADER, fsrc);
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p); gl.deleteShader(v); gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  return p;
}
// what every light pass wants: tested against the rides and the walls, writing no depth, composited over.
export function lightsOn(gl) {
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
}
export function lightsOff(gl) {   // back to what the track and the trains expect
  gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
}

// ── the string under the coaster track ──────────────────────────────────────────────────────────
const TRACK_VS = `#version 300 es
layout(location=0) in vec4 a_p;              // mercator with the local origin taken off (z already in mercator units), and the bulb's place in its string
layout(location=1) in float a_i;             // which line's colour this bulb may take
uniform mat4 u_matrix; uniform float u_time, u_size, u_core, u_bright, u_stride, u_anim, u_chase;
uniform vec3 u_rgb, u_lines[32];
out vec3 v_rgb; out vec2 v_mix;
${BULB_TWINKLE}
void main(){
  if (mod(float(gl_VertexID), u_stride) >= .5) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
  gl_Position = u_matrix * vec4(a_p.xyz, 1.);
  gl_Position.z -= 2.5e-4 * gl_Position.w;   // a hair in front of the girder it hangs under
  gl_PointSize = u_size;
  vec3 rgb = u_rgb;
  float b = u_bright;
  if (mod(a_p.w, 4.) < .5) rgb=u_lines[int(a_i)];
  if(u_chase>.5)b*=1.+${STYLE.night.chaseAmplitude}*sin(6.283185*(a_p.w*${BULB_EVERY}./${STYLE.night.chaseLengthM}.-u_time*u_anim/${STYLE.night.chasePeriodS}.));
  v_rgb = rgb;
  v_mix = vec2(u_core, b);
}`;

// ── the fireworks ───────────────────────────────────────────────────────────────────────────────
// Four riverfront anchors. 여의도 is the real 서울세계불꽃축제 site; the other three are park-mode
// displays at real Hangang parks. 28 s cycle, 7 s apart, so only one site is ever in the air.
// bank: the way the river runs here (unit, +x east +y south) · arc: where the lantern cluster sits,
// metres from the anchor, on the park side · lamp: the searchlight fixture, metres from the anchor.
// Hand-placed like the anchors themselves — close enough to the bank at the zooms they appear at.
export const FIREWORK_SITES = [
  { name: '여의도한강공원', at: [126.9400, 37.5235], big: true, bank: [1, 0], arc: [-60, 60], lamp: [210, 130] },
  { name: '반포한강공원', at: [126.9950, 37.5120], bank: [1, 0], arc: [0, 60], lamp: [225, 130] },
  { name: '뚝섬한강공원', at: [127.0670, 37.5285], bank: [1, 0], arc: [0, -60], lamp: [225, -130] },
  { name: '잠실한강공원', at: [127.0860, 37.5190], bank: [1, 0], arc: [-20, 60], lamp: [-230, 130] },
];
const LANTERN_PAL = ['#FFD399', '#EAB0BE', '#B8D9CC'];          // in a 4:2:2 run along each cluster
const BEAM_PAL = ['#C0D8EA', '#E5D3AB'];
const SPARK_PAL = ['#FFD58A', '#F2A9BC', '#AFE0EA', '#CAB7EF'], HEAD = '#FFF0C8';
const CYCLE = STYLE.night.fireworksPeriodS, RISE = 1.2, LIFE = 3.2, SECOND = 1.4, MAXP = 80, MAXT = 4;

const FW_VS = `#version 300 es
layout(location=0) in vec4 a_f;              // site, burst (0 main / 1 여의도's smaller follow-up), particle index (-1: the rocket), trail sample
uniform mat4 u_matrix; uniform float u_time, u_size, u_core, u_phone, u_trails;
uniform vec4 u_site[4];                      // x, y (origin off), mercator units a metre, cycle offset s
uniform float u_on[4];
uniform vec3 u_pal[4], u_head;
out vec3 v_rgb; out vec2 v_mix;
void kill(){ gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; }
void main(){
  int si = int(a_f.x); float burst = a_f.y, idx = a_f.z, trail = a_f.w;
  if (u_on[si] < .5) { kill(); return; }
  if (burst > .5 && (si != 0 || u_phone > .5)) { kill(); return; }     // the follow-up is 여의도's, and not on phones
  if (trail >= u_trails) { kill(); return; }
  vec4 S = u_site[si];
  float tt = u_time - S.w, n = floor(tt / ${CYCLE}.), lt = tt - n * ${CYCLE}.;
  float shape = mod(n + float(si), 3.);                                // chrysanthemum / ring / willow, in turn
  float small = burst > .5 ? 1. : 0.;
  vec3 rgb; float a, hM;
  float H = (shape < .5 ? 240. : shape < 1.5 ? 280. : 320.) * (1. - .2 * small);
  if (idx < 0.) {                                                      // the rocket on its way up
    float ta = lt - trail * .055;
    if (ta < 0. || ta > ${RISE}) { kill(); return; }
    float e = 1. - pow(1. - ta / ${RISE}, 2.);
    hM = H * e; rgb = u_head;
    a = (1. - ta / ${RISE} * .45) * pow(.5, trail);
    vec3 p = vec3(0., 0., hM);
    gl_Position = u_matrix * vec4(S.xy + p.xy * S.z, p.z * S.z, 1.);
    gl_PointSize = u_size * .9; v_rgb = rgb; v_mix = vec2(u_core, a);
    return;
  }
  float np = shape < .5 ? (u_phone > .5 ? 48. : 80.) : shape < 1.5 ? (u_phone > .5 ? 32. : 48.) : (u_phone > .5 ? 40. : 64.);
  if (idx >= np) { kill(); return; }
  float t0 = ${RISE} + small * ${SECOND}, age = lt - t0, ta = age - trail * .08;
  if (ta < 0. || ta > ${LIFE}) { kill(); return; }
  // the direction each spark takes: a golden-angle spiral on the sphere, so the same index always goes the same way
  float k = (idx + .5) / np, ph = acos(1. - 2. * k), th = 2.399963 * idx;
  vec3 dir = vec3(sin(ph) * cos(th), sin(ph) * sin(th), cos(ph));
  float R = (shape < .5 ? 85. : shape < 1.5 ? 70. : 95.) * (1. - .38 * small), g = 12.;
  if (shape > .5 && shape < 1.5) { dir = normalize(vec3(cos(th), sin(th) * .35, sin(th) * .94)); }   // a ring, tipped over
  if (shape > 1.5) { dir = normalize(dir + vec3(0., 0., .55)); g = 19.; }                            // a willow: thrown up, falling back
  float e = (1. - exp(-2.6 * ta)) / (1. - exp(-2.6 * ${LIFE}));
  vec3 p = vec3(0., 0., H) + dir * R * e;
  p.z -= .5 * g * ta * ta;
  a = smoothstep(0., .12, ta) * (1. - smoothstep(${LIFE} - 1.8, ${LIFE}, ta)) * pow(.35, trail);
  rgb = u_pal[int(mod(n + float(si) * 2. + small, 4.))];
  gl_Position = u_matrix * vec4(S.xy + p.xy * S.z, p.z * S.z, 1.);
  gl_PointSize = u_size;
  v_rgb = rgb; v_mix = vec2(u_core, a);
}`;

// Lanterns on the river bank by each festival site: eight to a cluster, 20 m apart, swaying.
const LANTERN_VS = `#version 300 es
layout(location=0) in vec2 a_f;              // site, place in the cluster
uniform mat4 u_matrix; uniform float u_time, u_size, u_core, u_anim;
uniform vec4 u_site[4], u_bank[4];           // site: x, y, mercator units a metre, offset s · bank: dir x,y and the cluster's offset in metres
uniform float u_on[4];
uniform vec3 u_pal[3];
out vec3 v_rgb; out vec2 v_mix;
${BULB_TWINKLE}
void main(){
  int si = int(a_f.x); float i = a_f.y;
  if (u_on[si] < .5) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
  vec4 S = u_site[si], Bk = u_bank[si];
  vec2 dir = normalize(Bk.xy), nrm = vec2(-dir.y, dir.x);
  float k = (i - 3.5) * 20., h = hash1(float(si) * 7.3 + i * 1.7);
  vec2 q = Bk.zw + dir * k + nrm * (6. * (1. - (k / 80.) * (k / 80.)));          // a shallow bow, following the bank
  q += nrm * .6 * sin(6.283185 * (u_time * u_anim / (7. + h * 3.) + h * 5.));    // the sway, ±0.6 m
  gl_Position = u_matrix * vec4(S.xy + q * S.z, 5. * S.z, 1.);
  gl_PointSize = u_size;
  float r = mod(i, 8.);
  v_rgb = r < 4. ? u_pal[0] : r < 6. ? u_pal[1] : u_pal[2];
  v_mix = vec2(u_core, 1.);
}`;

// Two strips of light along each station platform's edges, laid on the ground the coaster runs flat over.
const PLAT_VS = `#version 300 es
layout(location=0) in vec3 a_a;              // the strip's two ends, local mercator
layout(location=1) in vec3 a_b;
layout(location=2) in vec3 a_k;              // t along, side across, which of the three pieces (1 = the middle)
layout(location=3) in vec3 a_rgb;
uniform mat4 u_matrix; uniform vec2 u_vp; uniform float u_half, u_core, u_caps;
out vec3 v_rgb; out vec3 v_mix;
${RIBBON}
void main(){
  if (u_caps > .5 && a_k.z > .5 && a_k.z < 1.5) { gl_Position = vec4(2., 2., 2., 1.); return; }   // far out: the end caps alone
  gl_Position = ribbon(u_matrix * vec4(a_a, 1.), u_matrix * vec4(a_b, 1.), a_k.x, a_k.y, u_half, u_vp);
  gl_Position.z -= 2.e-4 * gl_Position.w;
  v_rgb = a_rgb; v_mix = vec3(a_k.y, u_core, 1.);
}`;

// A pair of searchlight beams by each festival site: two crossed feathered wedges, swinging slowly.
const BEAM_VS = `#version 300 es
layout(location=0) in vec4 a_f;              // site, beam, plane, along (0..1)
layout(location=1) in float a_v;             // across (-1..1)
uniform mat4 u_matrix; uniform float u_time, u_anim, u_peak, u_count;
uniform vec4 u_site[4], u_lamp[4];           // lamp: the fixture's offset in metres, and the way it points
uniform float u_on[4];
uniform vec3 u_pal[2];
out vec3 v_rgb; out vec2 v_e;
${BULB_TWINKLE}
void main(){
  int si = int(a_f.x); float beam = a_f.y, plane = a_f.z, u = a_f.w;
  if (u_on[si] < .5 || beam >= u_count) { gl_Position = vec4(2., 2., 2., 1.); return; }
  vec4 S = u_site[si], L = u_lamp[si];
  float h = hash1(float(si) * 3.1 + beam * 1.7);
  float az = L.z + (beam > .5 ? .55 : -.55) + .349 * sin(6.283185 * (u_time * u_anim / (${STYLE.night.beamPeriodS}. + h * 6.) + h));
  float tilt = .262;                                           // 15° off vertical
  vec3 ax = vec3(sin(tilt) * cos(az), sin(tilt) * sin(az), cos(tilt));
  vec3 e1 = normalize(cross(ax, vec3(0., 0., 1.))), e2 = normalize(cross(ax, e1));
  vec3 across = plane < .5 ? e1 : e2;
  vec3 m = vec3(L.xy, 6.) + ax * (160. * u) + across * (a_v * mix(1., 18., u));
  gl_Position = u_matrix * vec4(S.xy + m.xy * S.z, m.z * S.z, 1.);
  v_rgb = u_pal[beam > .5 ? 1 : 0];
  v_e = vec2(u_peak * (1. - u), a_v);
}`;
const BEAM_FS = `#version 300 es
precision highp float; in vec3 v_rgb; in vec2 v_e; out vec4 o;
void main(){ float a = v_e.x * (1. - abs(v_e.y)); if (a <= .0015) discard; o = vec4(v_rgb * a, a); }`;

const CELL = 4.7e-5;
const PLAT_CAP = 160;    // platforms lit at once; phones take half. Comfortably above what z14.2+ ever shows,
                         // so the view never has to pick a subset (which would pop as the camera moved)   // ~1.5 km of mercator: a row of cells is one draw call

export class NightLayer {
  constructor() {
    this.O = { x: mercX(ORIGIN[0]), y: mercY(ORIGIN[1]) };
    this.M = new Float32Array(16);
    this.track = null;
    this.stats = { bulbs: 0, sparks: 0, plats: 0, lanterns: 0, draws: 0, ms: 0 };
    this.plats = null; this.ping = 0; this.beamOn = new Float32Array(4);
    this._moving = false;
  }

  init(gl) {
    if (this.pT) return;
    this.pT = compile(gl, TRACK_VS, BULB_FS);
    this.uT = Object.fromEntries(['u_matrix', 'u_time', 'u_size', 'u_core', 'u_bright', 'u_stride', 'u_anim', 'u_rgb', 'u_wt', 'u_chase', 'u_lines'].map(n => [n, gl.getUniformLocation(this.pT, n)]));
    this.pF = compile(gl, FW_VS, BULB_FS);
    this.uF = Object.fromEntries(['u_matrix', 'u_time', 'u_size', 'u_core', 'u_phone', 'u_trails', 'u_site', 'u_on', 'u_pal', 'u_head', 'u_wt'].map(n => [n, gl.getUniformLocation(this.pF, n)]));

    // One burst per site/cycle; sites retain their staggered 28-second festival clock.
    const out = [];
    for (let s = 0; s < FIREWORK_SITES.length; s++) {
      for (let b = 0; b < 1; b++) {
        if (b && !FIREWORK_SITES[s].big) continue;
        for (let t = 0; t < MAXT; t++) out.push(s, b, -1, t);                      // the rocket head and its tail
        for (let i = 0; i < MAXP; i++) for (let t = 0; t < MAXT; t++) out.push(s, b, i, t);
      }
    }
    this.fwN = out.length / 4;
    this.fwB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.fwB);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    this.fwVA = gl.createVertexArray(); gl.bindVertexArray(this.fwVA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fwB); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // the lanterns: eight a site, one vertex each
    this.pL = compile(gl, LANTERN_VS, BULB_FS);
    this.uL = Object.fromEntries(['u_matrix', 'u_time', 'u_size', 'u_core', 'u_anim', 'u_site', 'u_bank', 'u_on', 'u_pal', 'u_wt'].map(n => [n, gl.getUniformLocation(this.pL, n)]));
    { const d = []; for (let si = 0; si < 4; si++) for (let i = 0; i < 8; i++) d.push(si, i);
      this.lanN = d.length / 2; this.lanB = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lanB); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW);
      this.lanVA = gl.createVertexArray(); gl.bindVertexArray(this.lanVA);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lanB); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.bindVertexArray(null) }

    // the platform strips: rebuilt each frame from whatever is on screen, into two stores used in turn
    this.pP = compile(gl, PLAT_VS, RIBBON_FS);
    this.uP = Object.fromEntries(['u_matrix', 'u_vp', 'u_half', 'u_core', 'u_caps', 'u_wt'].map(n => [n, gl.getUniformLocation(this.pP, n)]));
    this.platB = [gl.createBuffer(), gl.createBuffer()]; this.platVA = [];
    this.platData = new Float32Array(PLAT_CAP * 36 * 12);
    for (let i = 0; i < 2; i++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.platB[i]); gl.bufferData(gl.ARRAY_BUFFER, this.platData.byteLength, gl.DYNAMIC_DRAW);
      const va = gl.createVertexArray(); gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, this.platB[i]);
      let o = 0; for (const [loc, n] of [[0, 3], [1, 3], [2, 3], [3, 3]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 48, o); o += n * 4 }
      gl.bindVertexArray(null); this.platVA.push(va);
    }

    // the searchlights: two beams a site, two crossed wedges each
    this.pS = compile(gl, BEAM_VS, BEAM_FS);
    this.uS = Object.fromEntries(['u_matrix', 'u_time', 'u_anim', 'u_peak', 'u_count', 'u_site', 'u_lamp', 'u_on', 'u_pal'].map(n => [n, gl.getUniformLocation(this.pS, n)]));
    { const f = [], v = [];
      for (let si = 0; si < 4; si++) for (let bm = 0; bm < 2; bm++) for (let pl = 0; pl < 2; pl++)
        for (const [u, vv] of [[0,-1],[0,1],[1,1],[0,-1],[1,1],[1,-1]]) { f.push(si, bm, pl, u); v.push(vv) }
      this.beamN = v.length;
      this.beamB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.beamB); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(f), gl.STATIC_DRAW);
      this.beamB2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.beamB2); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      this.beamVA = gl.createVertexArray(); gl.bindVertexArray(this.beamVA);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.beamB); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.beamB2); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 4, 0);
      gl.bindVertexArray(null) }

    this.site = new Float32Array(16); this.on = new Float32Array(4);
    this.bank = new Float32Array(16); this.lamp = new Float32Array(16);
    FIREWORK_SITES.forEach((f, i) => {
      const [lon, lat] = f.at;
      this.site.set([mercX(lon) - this.O.x, mercY(lat) - this.O.y, muOf(lat), i * 7], i * 4);
      this.bank.set([f.bank[0], f.bank[1], f.arc[0], f.arc[1]], i * 4);
      this.lamp.set([f.lamp[0], f.lamp[1], Math.atan2(-f.lamp[1], -f.lamp[0]), 0], i * 4);   // the beams lean back over the water
      f.x = mercX(lon); f.y = mercY(lat); f.mu = muOf(lat);
    });
    this.lanRGB = new Float32Array(LANTERN_PAL.flatMap(hexRGB));
    this.beamRGB = new Float32Array(BEAM_PAL.flatMap(hexRGB));
    this.ping = 0;
    this.sparkPal = new Float32Array(SPARK_PAL.flatMap(hexRGB));
    this.headRGB = new Float32Array(hexRGB(HEAD));
    this.creamRGB = new Float32Array(hexRGB(CREAM));
    if (this.pending) { this.setTrackBulbs(...this.pending); this.pending = null }
    this.ready = true;
  }

  // The whole network's track bulbs: absolute mercator doubles (x, y, z in mercator units), in the order
  // they were sampled along each edge. `rgb` is optional, one colour a bulb (Uint8Array, 3 bytes each):
  // the line that bulb hangs under, for the chase. Bucketed row by row into one static buffer, so a view
  // draws a few contiguous ranges and never re-uploads; each bulb keeps its place in its string, so the
  // wave still runs along the track after the reordering.
  setTrackBulbs(f64, rgb) {
    const old = this.track, gl0 = this.gl0;
    if (old?.b && gl0) { gl0.deleteBuffer(old.b); gl0.deleteVertexArray(old.va) }   // a second call replaces the first
    this.track = null;
    if (!f64 || !f64.length) return;
    if (!this.pT) { this.pending = [f64, rgb]; return }          // init(gl) has not run yet
    const n = f64.length / 3, gx = new Int32Array(n), gy = new Int32Array(n);
    for (let i = 0; i < n; i++) { gx[i] = Math.floor(f64[i * 3] / CELL); gy[i] = Math.floor(f64[i * 3 + 1] / CELL) }
    // the distinct line colours, so a bulb carries a one-byte index and the shader a small palette
    const pal = [], byKey = new Map();
    const idx = new Uint8Array(n);
    if (rgb) for (let i = 0; i < n; i++) {
      const k = rgb[i * 3] << 16 | rgb[i * 3 + 1] << 8 | rgb[i * 3 + 2];
      let j = byKey.get(k);
      if (j === undefined) { j = Math.min(pal.length, 31); if (pal.length < 32) { byKey.set(k, j); pal.push([rgb[i*3]/255, rgb[i*3+1]/255, rgb[i*3+2]/255]) } }
      idx[i] = j;
    }
    const order = new Int32Array(n); for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => gy[a] - gy[b] || gx[a] - gx[b]);
    const data = new Float32Array(n * 5), rows = new Map();
    for (let j = 0; j < n; j++) {
      const i = order[j], o = j * 5;
      data[o] = f64[i * 3] - this.O.x; data[o + 1] = f64[i * 3 + 1] - this.O.y; data[o + 2] = f64[i * 3 + 2];
      data[o + 3] = i; data[o + 4] = idx[i];                    // its place in the string, and its line
      let R = rows.get(gy[i]); if (!R) rows.set(gy[i], R = { cx: [], at: [], n: [] });
      const last = R.cx.length - 1;
      if (last >= 0 && R.cx[last] === gx[i]) R.n[last]++; else { R.cx.push(gx[i]); R.at.push(j); R.n.push(1) }
    }
    const lines = new Float32Array(96); pal.forEach((c, i) => lines.set(c, i * 3));
    this.track = { n, data, rows, ys: [...rows.keys()].sort((a, b) => a - b), lines, chase: pal.length > 0 };
    if (this.gl0) this.uploadTrack(this.gl0);
  }
  uploadTrack(gl) {
    const T = this.track; if (!T || T.b) return;
    T.b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, T.b); gl.bufferData(gl.ARRAY_BUFFER, T.data, gl.STATIC_DRAW);
    T.va = gl.createVertexArray(); gl.bindVertexArray(T.va);
    gl.bindBuffer(gl.ARRAY_BUFFER, T.b);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    T.data = null;                                               // the GPU has it now
  }

  // The station platforms, so their edges glow where the coaster runs flat through them.
  // Eight doubles a platform: x0, y0, x1, y1 (absolute mercator, the platform's centre line),
  // widthM (across), and r, g, b 0-255 — the station's line colour, or cream for a transfer.
  setPlatforms(f64) {
    this.plats = null;
    if (!f64 || !f64.length) return;
    const n = f64.length / 8, P = new Float64Array(f64);
    const box = new Float64Array(n * 4);
    for (let i = 0; i < n; i++) {
      box[i * 4] = Math.min(P[i * 8], P[i * 8 + 2]); box[i * 4 + 1] = Math.min(P[i * 8 + 1], P[i * 8 + 3]);
      box[i * 4 + 2] = Math.max(P[i * 8], P[i * 8 + 2]); box[i * 4 + 3] = Math.max(P[i * 8 + 1], P[i * 8 + 3]);
    }
    this.plats = { n, P, box };
  }

  // one platform's two edge strips, each in three pieces so the far-out view can keep the caps alone
  platVerts(d, o, i, mu) {
    const P = this.plats.P, b = i * 8;
    const ax = P[b] - this.O.x, ay = P[b + 1] - this.O.y, bx = P[b + 2] - this.O.x, by = P[b + 3] - this.O.y;
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, half = P[b + 4] / 2 * mu;
    const nx = -dy / L * half, ny = dx / L * half, z = .3 * mu;             // 0.3 m over the surface
    const C = [(255 * .7 + P[b + 5] * .3) / 255,        // 70 % the cream #FFE8B5, 30 % the station's line colour
      (232 * .7 + P[b + 6] * .3) / 255, (181 * .7 + P[b + 7] * .3) / 255];
    const cut = [0, .08, .92, 1];
    for (const sg of [-1, 1]) for (let k = 0; k < 3; k++) {
      const t0 = cut[k], t1 = cut[k + 1];
      const Ax = ax + dx * t0 + nx * sg, Ay = ay + dy * t0 + ny * sg;
      const Bx = ax + dx * t1 + nx * sg, By = ay + dy * t1 + ny * sg;
      for (const [t, side] of [[0, -1], [0, 1], [1, 1], [0, -1], [1, 1], [1, -1]]) {
        d[o++] = Ax; d[o++] = Ay; d[o++] = z; d[o++] = Bx; d[o++] = By; d[o++] = z;
        d[o++] = t; d[o++] = side; d[o++] = k; d[o++] = C[0]; d[o++] = C[1]; d[o++] = C[2];
      }
    }
    return o;
  }

  render(gl, matrix, opts = {}) {
    if (!this.ready) return;
    this.gl0 = gl; if (this.track && !this.track.b) this.uploadTrack(gl);
    const t0 = performance.now();
    const { now = performance.now(), zoom = 15, phone = false, reducedMotion = false, bounds, pixelRatio = 1 } = opts;
    const ts = now / 1000;
    let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity;
    if (bounds) { x0 = Math.min(bounds[0], bounds[2]); x1 = Math.max(bounds[0], bounds[2]); y0 = Math.min(bounds[1], bounds[3]); y1 = Math.max(bounds[1], bounds[3]) }

    const MT = this.M; MT.set(matrix);
    for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r] * this.O.x + matrix[4 + r] * this.O.y + matrix[12 + r];
    lightsOn(gl);
    let bulbs = 0, sparks = 0, draws = 0;

    // the string under the track
    const T = this.track;
    if (T && T.va) {
      const gy0 = Math.floor((y0 - CELL) / CELL), gy1 = Math.floor((y1 + CELL) / CELL);
      const cx0 = Math.floor((x0 - CELL) / CELL), cx1 = Math.floor((x1 + CELL) / CELL);
      const runs = [];
      let total = 0;
      for (const gy of T.ys) {
        if (gy < gy0 || gy > gy1) continue;
        const R = T.rows.get(gy);
        let a = -1, b = -1;
        for (let i = 0; i < R.cx.length; i++) { if (R.cx[i] < cx0 || R.cx[i] > cx1) continue; if (a < 0) a = i; b = i }
        if (a < 0) continue;
        const first = R.at[a], count = R.at[b] + R.n[b] - first;
        runs.push(first, count); total += count;
      }
      // the cap: the track string gives way first, and below z14.5 it is every other bulb anyway (36 m)
      const cap = (phone ? 2500 : 6000) * .6;
      const stride = Math.max(zoom < 14.5 ? 2 : 1, Math.ceil(5*metresPerPixel(zoom)/BULB_EVERY), Math.ceil(total / Math.max(1, cap)));
      const sz = bulbSize(zoom, pixelRatio);
      gl.useProgram(this.pT);
      gl.uniformMatrix4fv(this.uT.u_matrix, false, MT);
      gl.uniform1f(this.uT.u_time, ts); gl.uniform1f(this.uT.u_size, sz.point); gl.uniform1f(this.uT.u_core, sz.coreFrac);
      gl.uniform1f(this.uT.u_bright, STYLE.night.trackEmission); gl.uniform1f(this.uT.u_stride, stride); gl.uniform1f(this.uT.u_anim, reducedMotion ? 0 : 1);
      gl.uniform3fv(this.uT.u_rgb, this.creamRGB); gl.uniform2f(this.uT.u_wt, 1, .22);
      gl.uniform1f(this.uT.u_chase, T.chase && zoom >= 14.5 ? 1 : 0); gl.uniform3fv(this.uT.u_lines, T.lines);
      gl.bindVertexArray(T.va);
      for (let i = 0; i < runs.length; i += 2) { gl.drawArrays(gl.POINTS, runs[i], runs[i + 1]); draws++ }
      bulbs = Math.round(total / stride);
    }

    // which festival sites are in view at all: the fireworks, the lanterns and the beams share this
    let any = false;
    for (let i = 0; i < 4; i++) {
      const f = FIREWORK_SITES[i], pad = 420 * f.mu;                   // the burst sits ~320 m up
      const on = f.x > x0 - pad && f.x < x1 + pad && f.y > y0 - pad && f.y < y1 + pad;
      this.on[i] = on ? 1 : 0; if (on) any = true;
    }
    // the fireworks
    if (!reducedMotion && (!phone || STYLE.night.phoneFireworks)) {
      if (any) {
        const sz = sparkSize(zoom, pixelRatio);
        gl.useProgram(this.pF);
        gl.uniformMatrix4fv(this.uF.u_matrix, false, MT);
        gl.uniform1f(this.uF.u_time, ts); gl.uniform1f(this.uF.u_size, sz.point); gl.uniform1f(this.uF.u_core, sz.coreFrac);
        gl.uniform1f(this.uF.u_phone, phone ? 1 : 0); gl.uniform1f(this.uF.u_trails, phone ? 2 : 4);
        gl.uniform4fv(this.uF.u_site, this.site); gl.uniform1fv(this.uF.u_on, this.on);
        gl.uniform3fv(this.uF.u_pal, this.sparkPal); gl.uniform3fv(this.uF.u_head, this.headRGB); gl.uniform2f(this.uF.u_wt, .95, .34);
        gl.bindVertexArray(this.fwVA);
        gl.drawArrays(gl.POINTS, 0, this.fwN); draws++;
        sparks = this.fwN;
      }
    }
    // the platform strips
    let plats = 0;
    const P = this.plats;
    if (P && zoom >= 14.2) {
      const cap = phone ? PLAT_CAP >> 1 : PLAT_CAP, d = this.platData, mu = muOf(37.55);   // the coaster is flat through a station, so the strips lie on the ground
      let o = 0;
      for (let i = 0; i < P.n && plats < cap; i++) {
        if (P.box[i * 4] > x1 || P.box[i * 4 + 2] < x0 || P.box[i * 4 + 1] > y1 || P.box[i * 4 + 3] < y0) continue;
        o = this.platVerts(d, o, i, mu); plats++;
      }
      if (plats) {
        const pg = this.ping;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.platB[pg]);
        gl.bufferData(gl.ARRAY_BUFFER, this.platData.byteLength, gl.DYNAMIC_DRAW);     // fresh storage, never patched in flight
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, o);
        gl.useProgram(this.pP);
        gl.uniformMatrix4fv(this.uP.u_matrix, false, MT);
        gl.uniform2f(this.uP.u_vp, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.uniform1f(this.uP.u_half, 1.75 * pixelRatio); gl.uniform1f(this.uP.u_core, .3);
        gl.uniform1f(this.uP.u_caps, zoom < 14.5 ? 1 : 0); gl.uniform2f(this.uP.u_wt, STYLE.night.stationEmission, .16);
        gl.bindVertexArray(this.platVA[pg]);
        gl.drawArrays(gl.TRIANGLES, 0, o / 12); draws++;
      }
    }

    // the lanterns on the bank, and the searchlights behind them
    let lanterns = 0;
    if (zoom >= 14) {
      const mpp = EARTH * Math.cos(37.55 * Math.PI / 180) / (512 * 2 ** zoom);
      const core = Math.min(7, Math.max(4, 1.8 / mpp)) / 14;
      gl.useProgram(this.pL);
      gl.uniformMatrix4fv(this.uL.u_matrix, false, MT);
      gl.uniform1f(this.uL.u_time, ts); gl.uniform1f(this.uL.u_size, 14 * pixelRatio);
      gl.uniform1f(this.uL.u_core, core); gl.uniform1f(this.uL.u_anim, reducedMotion ? 0 : 1);
      gl.uniform4fv(this.uL.u_site, this.site); gl.uniform4fv(this.uL.u_bank, this.bank);
      gl.uniform1fv(this.uL.u_on, this.on); gl.uniform3fv(this.uL.u_pal, this.lanRGB);
      gl.uniform2f(this.uL.u_wt, .95, .16);
      gl.bindVertexArray(this.lanVA); gl.drawArrays(gl.POINTS, 0, this.lanN); draws++;
      lanterns = this.lanN;
    }
    if (zoom >= STYLE.night.beamMinZoom && !reducedMotion) {
      const cx=(x0+x1)/2,cy=(y0+y1)/2;
      const nearest=FIREWORK_SITES.map((s,i)=>({i,d:(s.x-cx)**2+(s.y-cy)**2})).filter(s=>this.on[s.i]).sort((a,b)=>a.d-b.d||a.i-b.i)[0];
      this.beamOn.fill(0);if(nearest)this.beamOn[nearest.i]=1;
      gl.useProgram(this.pS);
      gl.uniformMatrix4fv(this.uS.u_matrix, false, MT);
      gl.uniform1f(this.uS.u_time, ts); gl.uniform1f(this.uS.u_anim, reducedMotion ? 0 : 1);
      gl.uniform1f(this.uS.u_peak, STYLE.night.beamOpacity);gl.uniform1f(this.uS.u_count,phone?STYLE.night.phoneBeamCap:STYLE.night.beamCap);
      gl.uniform4fv(this.uS.u_site, this.site); gl.uniform4fv(this.uS.u_lamp, this.lamp);
      gl.uniform1fv(this.uS.u_on, this.beamOn); gl.uniform3fv(this.uS.u_pal, this.beamRGB);
      gl.bindVertexArray(this.beamVA); gl.drawArrays(gl.TRIANGLES, 0, this.beamN); draws++;
    }
    this.ping ^= 1;
    gl.bindVertexArray(null);
    lightsOff(gl);
    this.stats = { bulbs, sparks, plats, lanterns, draws, ms: performance.now() - t0 };
    this._moving = !reducedMotion && !(typeof document !== 'undefined' && document.hidden) && (bulbs > 0 || sparks > 0 || lanterns > 0);
  }

  // true while something up there changes: the caller keeps the overlay's frames coming
  animating() { return !!this._moving }

  dispose(gl) {
    if (!this.pT) return;
    const T = this.track; if (T?.b) { gl.deleteBuffer(T.b); gl.deleteVertexArray(T.va) }
    gl.deleteBuffer(this.fwB); gl.deleteVertexArray(this.fwVA);
    gl.deleteBuffer(this.lanB); gl.deleteVertexArray(this.lanVA);
    gl.deleteBuffer(this.beamB); gl.deleteBuffer(this.beamB2); gl.deleteVertexArray(this.beamVA);
    for (const b of this.platB) gl.deleteBuffer(b); for (const v of this.platVA) gl.deleteVertexArray(v);
    gl.deleteProgram(this.pT); gl.deleteProgram(this.pF); gl.deleteProgram(this.pL); gl.deleteProgram(this.pP); gl.deleteProgram(this.pS);
    this.pT = this.pF = null; this.track = null; this.pending = null; this.ready = false;
  }
}
export default NightLayer;
