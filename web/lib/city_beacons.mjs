// 심시티 역 표지탑 (station beacons) — at every station a slim post beside the elevated platform, taller than the
// buildings around it (the tallest within pack.beacon.radiusM, plus a margin, capped), with the station's line badges on
// top (the 88열차 badges: coaster_badges.mjs; a transfer station's stacked, three to a column), so a station shows from
// afar. The post stands only on open ground (the piers' inBuilding rule), tried beside the platform on either side and
// along it; where none is clear it stands on the platform's roof. The badges keep their screen size (px) from z15 to z18,
// fade in over pack.beacon.fadeZoom, and glow softly at night. Placement and the post's mesh are pure functions (tested);
// BeaconBadges draws the badges. CityViaduct owns the beacons (one per station, cached like its other pieces).
import SEOUL from './city_style_seoul.mjs';
import { Mesh, MAT } from './city_viaduct_mesh.mjs';
import { routeBadgeId, routeBadgeAtlas, BADGE_COLS, BADGE_ROWS } from './coaster_badges.mjs';
import { compileProgram } from './city_traffic.mjs';

const B_OF = pack => pack.beacon || SEOUL.beacon;

// where the post stands: the first clear spot of the candidates ({t, u} in the platform's frame, metres) — ground(t, u) →
// true / false / undefined (tile not here). → {t, u, onRoof, partial}: onRoof when no spot is clear (it then stands on the
// platform's roof at its middle); partial when a spot before the chosen one was unknown (built again later)
export function placeBeacon(cands, ground) {
  let partial = false;
  for (const c of cands) { const g = ground(c.t, c.u); if (g === true) return { t: c.t, u: c.u, onRoof: false, partial }; if (g === undefined) partial = true }
  return { t: 0, u: null, onRoof: true, partial };
}
// the candidates: beside the platform's outer edge on either side (offsetM past its widest), at each of alongM
export function beaconCandidates(edgeM, eoM, pack = SEOUL) { const B = B_OF(pack), out = []; for (const t of B.alongM) for (const d of [1, -1]) out.push({ t, u: eoM + d * (edgeM + B.offsetM) }); return out }
// how tall: above the tallest building around (and the platform's roof) by its margin, never under minM, never over maxM
export function beaconHeight(tallest, roofTop, pack = SEOUL) { const B = B_OF(pack); return Math.min(B.maxM, Math.max(B.minM, tallest + B.marginM, roofTop + B.minAboveM)) }
// the badges' layout on screen: n badges, perColumn to a column, columns side by side, the stack's bottom centre at 0;
// → [[x, y]] centres in px (y up)
export function badgeLayout(n, pack = SEOUL) {
  const B = B_OF(pack), s = B.badgePx, g = B.badgeGapPx, cols = Math.ceil(n / B.perColumn), out = [];
  for (let i = 0; i < n; i++) { const c = Math.floor(i / B.perColumn), r = i % B.perColumn; out.push([(c - (cols - 1) / 2) * (s + g), (r + .5) * s + r * g]) }
  return out;
}
// the post: a square column (metres with a px floor) from base to top, the line's colour in a band under its cap
// (r: {x, y, rx, ry, fx, fy} the platform's frame; at: {t, u} on it, or the roof's middle with u = null → eo px)
export function buildBeaconPost(r, at, eo, base, top, pack = SEOUL) {
  const B = B_OF(pack), M = new Mesh(80), h = B.sideM / 2, mp = B.minPx / 2, u = at.u ?? 0, px = at.u === null ? eo : 0;
  const C = (hh, l, a, n, mat) => [r, hh, px, 0, 0, 0, u, at.t, l, a, Math.sign(l) * mp, Math.sign(a) * mp, mat, 1, n];
  const bandLo = top - B.capM - B.bandM;
  for (const [h0, h1, mat] of [[base, bandLo, MAT.POST], [bandLo, top - B.capM, MAT.FASCIA], [top - B.capM, top, MAT.POST]]) for (const d of [-1, 1]) {
    M.quad(C(h0, d * h, -h, d, mat), C(h0, d * h, h, d, mat), C(h1, d * h, h, d, mat), C(h1, d * h, -h, d, mat));
    M.quad(C(h0, -h, d * h, 2 * d, mat), C(h0, h, d * h, 2 * d, mat), C(h1, h, d * h, 2 * d, mat), C(h1, -h, d * h, 2 * d, mat));
  }
  M.quad(C(top, -h, -h, 0, MAT.POST), C(top, h, -h, 0, MAT.POST), C(top, h, h, 0, MAT.POST), C(top, -h, h, 0, MAT.POST));
  return M.data();
}

// ── the badges: screen-facing discs at the posts' tops, constant px, depth-tested against the buildings ──
const VS = `#version 300 es
layout(location=0) in vec3 a_at; layout(location=1) in vec2 a_off; layout(location=2) in vec2 a_q; layout(location=3) in vec2 a_cell; layout(location=4) in vec3 a_col; layout(location=5) in float a_halo;
uniform mat4 u_matrix; uniform float u_mu; uniform vec2 u_view; out vec2 v_q; out vec2 v_cell; out vec3 v_col; out float v_halo;
void main(){ vec4 p = u_matrix * vec4(a_at.xy * u_mu, a_at.z * u_mu, 1.); p.xy += a_off / u_view * 2. * p.w; p.z -= 2e-4 * p.w; gl_Position = p; v_q = a_q; v_cell = a_cell; v_col = a_col; v_halo = a_halo; }`;
const FS = `#version 300 es
precision highp float; in vec2 v_q; in vec2 v_cell; in vec3 v_col; in float v_halo; uniform sampler2D u_tex; uniform vec2 u_grid; uniform vec3 u_ring, u_edge; uniform float u_alpha, u_glow, u_haloA; out vec4 o;
void main(){
  float d = length(v_q);
  if (v_halo > .5) { float a = (1. - smoothstep(.0, 1., d)) * u_haloA * u_alpha; if (a <= .002) discard; o = vec4(v_col * a, a); return; }   // the night halo
  float aa = fwidth(d) * 1.2, a = 1. - smoothstep(1. - aa, 1., d); if (a <= .002) discard;
  vec3 c = v_col * (1. + u_glow);
  c = mix(c, u_ring, smoothstep(.80 - aa, .80, d)); c = mix(c, u_edge, smoothstep(.93 - aa, .93, d));   // white ring, thin dark rim
  vec2 uv = (v_cell + .5 + v_q * vec2(.5, -.5) * .82) / u_grid; vec4 t = texture(u_tex, uv); if (d < .8) c = mix(c, t.rgb, t.a);   // the label from the badge atlas
  o = vec4(clamp(c, 0., 1.) * a * u_alpha, a * u_alpha);
}`;
const STRIDE_B = 13, hexRgb = h => { const v = parseInt(String(h).slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255] };
export class BeaconBadges {
  init(gl) {
    this.gl = gl; this.p = compileProgram(gl, VS, FS); this.u = Object.fromEntries(['u_matrix', 'u_mu', 'u_view', 'u_tex', 'u_grid', 'u_ring', 'u_edge', 'u_alpha', 'u_glow', 'u_haloA'].map(n => [n, gl.getUniformLocation(this.p, n)]));
    this.vao = gl.createVertexArray(); this.b = gl.createBuffer(); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.b);
    for (const [loc, n, off] of [[0, 3, 0], [1, 2, 3], [2, 2, 5], [3, 2, 7], [4, 3, 9], [5, 1, 12]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE_B * 4, off * 4) }
    gl.bindVertexArray(null); this.data = new Float32Array(STRIDE_B * 6 * 64);
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, routeBadgeAtlas()); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  // items: [{x, y, top (metres, local frame), lines: [{line, rgb}]}]
  draw(gl, MT, mu, items, { pack = SEOUL, dark = false, alpha = 1, pitch = 60, view = [1, 1] } = {}) {
    if (!items.length || alpha <= 0) return; if (!this.p) this.init(gl);
    const B = B_OF(pack), s = B.badgePx / 2, lift = B.liftPx + (pitch < B.lowPitchDeg ? B.lowPitchLiftPx : 0), halo = dark ? B.night.haloPx : 0;
    let n = 0; for (const it of items) n += it.lines.length * (dark ? 2 : 1); if (this.data.length < n * 6 * STRIDE_B) this.data = new Float32Array(n * 6 * STRIDE_B * 2);
    const d = this.data; let o = 0;
    const quad = (it, cx, cy, half, cell, rgb, isHalo) => { for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { d[o++] = it.x; d[o++] = it.y; d[o++] = it.top; d[o++] = cx + qx * half; d[o++] = cy + qy * half; d[o++] = qx; d[o++] = qy; d[o++] = cell[0]; d[o++] = cell[1]; d[o++] = rgb[0]; d[o++] = rgb[1]; d[o++] = rgb[2]; d[o++] = isHalo } };
    for (const it of items) {
      const L = badgeLayout(it.lines.length, pack);
      if (halo) it.lines.forEach((l, i) => quad(it, L[i][0], L[i][1] + lift, s + halo, [0, 0], l.rgb, 1));
      it.lines.forEach((l, i) => { const id = routeBadgeId(l.line); quad(it, L[i][0], L[i][1] + lift, s, [id % BADGE_COLS, Math.floor(id / BADGE_COLS)], l.rgb, 0) });
    }
    const C = B.colors[dark ? 'dark' : 'light'] || B.colors.light, u = this.u;
    gl.useProgram(this.p); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.b); gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, o), gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(u.u_matrix, false, MT); gl.uniform1f(u.u_mu, mu); gl.uniform2f(u.u_view, view[0], view[1]); gl.uniform2f(u.u_grid, BADGE_COLS, BADGE_ROWS);
    gl.uniform3fv(u.u_ring, hexRgb(C.ring)); gl.uniform3fv(u.u_edge, hexRgb(C.edge)); gl.uniform1f(u.u_alpha, alpha); gl.uniform1f(u.u_glow, dark ? .12 * B.night.emission : 0); gl.uniform1f(u.u_haloA, B.night.haloAlpha);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(u.u_tex, 0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, o / STRIDE_B);
    gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
  }
  dispose(gl) { if (!this.p) return; gl.deleteProgram(this.p); gl.deleteBuffer(this.b); gl.deleteVertexArray(this.vao); gl.deleteTexture(this.tex); this.p = null }
}
export default { placeBeacon, beaconCandidates, beaconHeight, badgeLayout, buildBeaconPost, BeaconBadges };
