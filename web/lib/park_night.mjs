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

const lerpZ = (z, a, b, c) => z <= 13 ? a : z >= 17 ? c : z <= 15 ? a + (b - a) * (z - 13) / 2 : b + (c - b) * (z - 15) / 2;
// core diameter in CSS px by zoom, halo 4x capped at 18 px; scale 0.8 for the track string (the user: more, bigger festoons)
export function bulbSize(zoom, pixelRatio, scale = 1) {
  const core = lerpZ(zoom, 2.4, 3.4, 4.6), glow = Math.min(core * 4, 18);
  return { point: glow * scale * pixelRatio, coreFrac: core / glow };
}
export function sparkSize(zoom, pixelRatio) {           // the fireworks: halo 3x, no cap
  const core = lerpZ(zoom, 2.6, 3.4, 4.2), glow = core * 3;
  return { point: glow * pixelRatio, coreFrac: core / glow };
}
export const BULB_PAL = ['#FFE4A3', '#E8B4A9', '#B9DAD1', '#CDBDE7'];   // 3 in 4 are the warm cream
export const CREAM = '#FFE4A3';

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
layout(location=0) in vec3 a_p;              // mercator with the local origin taken off, z already in mercator units
uniform mat4 u_matrix; uniform float u_time, u_size, u_core, u_bright, u_stride, u_anim;
uniform vec3 u_rgb;
out vec3 v_rgb; out vec2 v_mix;
${BULB_TWINKLE}
void main(){
  if (mod(float(gl_VertexID), u_stride) >= .5) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
  gl_Position = u_matrix * vec4(a_p, 1.);
  gl_Position.z -= 2.5e-4 * gl_Position.w;   // a hair in front of the girder it hangs under
  gl_PointSize = u_size;
  v_rgb = u_rgb;
  v_mix = vec2(u_core, u_bright * twinkle(hash1(float(gl_VertexID) * .37 + 3.1), u_time, u_anim));
}`;

// ── the fireworks ───────────────────────────────────────────────────────────────────────────────
// Four riverfront anchors. 여의도 is the real 서울세계불꽃축제 site; the other three are park-mode
// displays at real Hangang parks. 28 s cycle, 7 s apart, so only one site is ever in the air.
export const FIREWORK_SITES = [
  { name: '여의도한강공원', at: [126.9400, 37.5235], big: true },
  { name: '반포한강공원', at: [126.9950, 37.5120] },
  { name: '뚝섬한강공원', at: [127.0670, 37.5285] },
  { name: '잠실한강공원', at: [127.0860, 37.5190] },
];
const SPARK_PAL = ['#FFD58A', '#F2A9BC', '#AFE0EA', '#CAB7EF'], HEAD = '#FFF0C8';
const CYCLE = 28, RISE = 1.2, LIFE = 3.2, SECOND = 1.4, MAXP = 80, MAXT = 4;

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

const CELL = 4.7e-5;   // ~1.5 km of mercator: a row of cells is one draw call

export class NightLayer {
  constructor() {
    this.O = { x: mercX(ORIGIN[0]), y: mercY(ORIGIN[1]) };
    this.M = new Float32Array(16);
    this.track = null;
    this.stats = { bulbs: 0, sparks: 0, draws: 0, ms: 0 };
    this._moving = false;
  }

  init(gl) {
    if (this.pT) return;
    this.pT = compile(gl, TRACK_VS, BULB_FS);
    this.uT = Object.fromEntries(['u_matrix', 'u_time', 'u_size', 'u_core', 'u_bright', 'u_stride', 'u_anim', 'u_rgb', 'u_wt'].map(n => [n, gl.getUniformLocation(this.pT, n)]));
    this.pF = compile(gl, FW_VS, BULB_FS);
    this.uF = Object.fromEntries(['u_matrix', 'u_time', 'u_size', 'u_core', 'u_phone', 'u_trails', 'u_site', 'u_on', 'u_pal', 'u_head', 'u_wt'].map(n => [n, gl.getUniformLocation(this.pF, n)]));

    // one vertex a spark: every site, both bursts, every particle, every trail sample, plus the rockets
    const out = [];
    for (let s = 0; s < FIREWORK_SITES.length; s++) {
      for (let b = 0; b < 2; b++) {
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

    this.site = new Float32Array(16); this.on = new Float32Array(4);
    FIREWORK_SITES.forEach((f, i) => {
      const [lon, lat] = f.at;
      this.site.set([mercX(lon) - this.O.x, mercY(lat) - this.O.y, muOf(lat), i * 7], i * 4);
      f.x = mercX(lon); f.y = mercY(lat); f.mu = muOf(lat);
    });
    this.sparkPal = new Float32Array(SPARK_PAL.flatMap(hexRGB));
    this.headRGB = new Float32Array(hexRGB(HEAD));
    this.creamRGB = new Float32Array(hexRGB(CREAM));
    if (this.pending) { this.setTrackBulbs(this.pending); this.pending = null }
    this.ready = true;
  }

  // The whole network's track bulbs: absolute mercator doubles (x, y, z in mercator units). Bucketed
  // row by row into one static buffer, so a view draws a few contiguous ranges and never re-uploads.
  setTrackBulbs(f64) {
    const old = this.track, gl0 = this.gl0;
    if (old?.b && gl0) { gl0.deleteBuffer(old.b); gl0.deleteVertexArray(old.va) }   // a second call replaces the first
    this.track = null;
    if (!f64 || !f64.length) return;
    if (!this.pT) { this.pending = f64; return }                 // init(gl) has not run yet
    const n = f64.length / 3, gx = new Int32Array(n), gy = new Int32Array(n);
    for (let i = 0; i < n; i++) { gx[i] = Math.floor(f64[i * 3] / CELL); gy[i] = Math.floor(f64[i * 3 + 1] / CELL) }
    const order = new Int32Array(n); for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => gy[a] - gy[b] || gx[a] - gx[b]);
    const data = new Float32Array(n * 3), rows = new Map();
    for (let j = 0; j < n; j++) {
      const i = order[j];
      data[j * 3] = f64[i * 3] - this.O.x; data[j * 3 + 1] = f64[i * 3 + 1] - this.O.y; data[j * 3 + 2] = f64[i * 3 + 2];
      let R = rows.get(gy[i]); if (!R) rows.set(gy[i], R = { cx: [], at: [], n: [] });
      const last = R.cx.length - 1;
      if (last >= 0 && R.cx[last] === gx[i]) R.n[last]++; else { R.cx.push(gx[i]); R.at.push(j); R.n.push(1) }
    }
    const gl = this.gl0;
    this.track = { n, data, rows, ys: [...rows.keys()].sort((a, b) => a - b) };
    if (gl) this.uploadTrack(gl);
  }
  uploadTrack(gl) {
    const T = this.track; if (!T || T.b) return;
    T.b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, T.b); gl.bufferData(gl.ARRAY_BUFFER, T.data, gl.STATIC_DRAW);
    T.va = gl.createVertexArray(); gl.bindVertexArray(T.va);
    gl.bindBuffer(gl.ARRAY_BUFFER, T.b); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    T.data = null;                                               // the GPU has it now
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
      const stride = Math.max(zoom < 14.5 ? 2 : 1, Math.ceil(total / Math.max(1, cap)));
      const sz = bulbSize(zoom, pixelRatio, .8);
      gl.useProgram(this.pT);
      gl.uniformMatrix4fv(this.uT.u_matrix, false, MT);
      gl.uniform1f(this.uT.u_time, ts); gl.uniform1f(this.uT.u_size, sz.point); gl.uniform1f(this.uT.u_core, sz.coreFrac);
      gl.uniform1f(this.uT.u_bright, .85); gl.uniform1f(this.uT.u_stride, stride); gl.uniform1f(this.uT.u_anim, reducedMotion ? 0 : 1);
      gl.uniform3fv(this.uT.u_rgb, this.creamRGB); gl.uniform2f(this.uT.u_wt, .85, .12);
      gl.bindVertexArray(T.va);
      for (let i = 0; i < runs.length; i += 2) { gl.drawArrays(gl.POINTS, runs[i], runs[i + 1]); draws++ }
      bulbs = Math.round(total / stride);
    }

    // the fireworks
    if (!reducedMotion) {
      let any = false;
      for (let i = 0; i < 4; i++) {
        const f = FIREWORK_SITES[i], pad = 420 * f.mu;                 // the burst sits ~320 m up
        const on = f.x > x0 - pad && f.x < x1 + pad && f.y > y0 - pad && f.y < y1 + pad;
        this.on[i] = on ? 1 : 0; if (on) any = true;
      }
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
    gl.bindVertexArray(null);
    lightsOff(gl);
    this.stats = { bulbs, sparks, draws, ms: performance.now() - t0 };
    this._moving = !reducedMotion && !(typeof document !== 'undefined' && document.hidden) && (bulbs > 0 || sparks > 0);
  }

  // true while something up there changes: the caller keeps the overlay's frames coming
  animating() { return !!this._moving }

  dispose(gl) {
    if (!this.pT) return;
    const T = this.track; if (T?.b) { gl.deleteBuffer(T.b); gl.deleteVertexArray(T.va) }
    gl.deleteBuffer(this.fwB); gl.deleteVertexArray(this.fwVA);
    gl.deleteProgram(this.pT); gl.deleteProgram(this.pF);
    this.pT = this.pF = null; this.track = null; this.pending = null; this.ready = false;
  }
}
export default NightLayer;
