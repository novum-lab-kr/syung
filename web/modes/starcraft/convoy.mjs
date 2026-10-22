// 스타크래프트 모드의 지하철: 열차 한 대가 유닛 행렬이 되어 고가 위를 간다(맨 앞 lead 한 마리 + 뒤 rest 여럿 — 모드 설정 trains.units).
// 조선 거북선 선단(web/modes/joseon/turtle_ship.mjs)과 같은 틀: TrainLayer 가 선로 위 틀(밑 뒤 점, F 앞, R 옆, U 위 — 메르카토르)과
// 길이 L · 폭 W(px)를 주면 그 가운데에 유닛 하나를 W 크기로 세운다. 모양은 unit_shapes.mjs(Codex 시안), 'line' 칸은 노선 색.
// 걷는 동안(가는 중) 다리(legA · legB)를 엉덩이 축으로 흔들고 몸을 살짝 들썩인다. 깊이: 건물 벽 뒤는 occlude 만큼 비친다.
//
//   const u=new UnitConvoy(); u.init(gl);
//   u.begin(ox,oy); u.unit(frame,L,W,kind,rgb,moving,key)…; u.draw(gl,M,ox,oy,{unit,walls,occlude,dark,time}); u.dispose(gl)
import { compile, hexRGB } from '../coaster/night.mjs';
import { UNIT_SHAPES, LINE, shapeTriangles } from './units.mjs';

const SUN = (v => { const l = Math.hypot(...v); return v.map(c => c / l) })([-.30, .46, .84]);   // 거북선 · 88열차와 같은 해
const VERT = 12, INST = 18;   // 꼭짓점: 자리 3 · 법선 3 · 색 3(노선 색 칸은 -1) · 다리 1 · 축 2 / 인스턴스: 틀 12 · L · W · 색 3 · 가는 중
const fnv1a = s => { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h >>> 0 };

// 유닛 하나의 꼭짓점(폭 1 단위)
export function buildUnitMesh(key) {
  const shape = UNIT_SHAPES[key], pal = shape.palette.map(hexRGB), data = [];
  for (const t of shapeTriangles(shape)) data.push(...t.p, ...t.n, ...(t.color === LINE ? [-1, -1, -1] : pal[t.color]), t.leg, ...t.pivot);
  return new Float32Array(data);
}
// 유닛 길이(폭 단위): 행렬 간격을 정할 때
export const unitLength = key => UNIT_SHAPES[key]?.len ?? 1;

const VS = `#version 300 es
precision highp float;
in vec3 a_p;in vec3 a_n;in vec3 a_c;in float a_leg;in vec2 a_pivot;
in vec3 i_o;in vec3 i_F;in vec3 i_R;in vec3 i_U;in vec2 i_LW;in vec3 i_rgb;in float i_go;
uniform mat4 u_matrix;uniform float u_unit,u_time;
out vec3 v_n;flat out vec3 v_c;
void main(){
  float L=i_LW.x,W=i_LW.y,go=mod(i_go,2.),seed=floor(i_go/2.)/997.;
  vec3 p=a_p,n=a_n;float ph=u_time*6.2832*1.6+seed*6.2832;
  if(abs(a_leg)>.5&&go>.5){   // 다리: 엉덩이 축으로 앞뒤로(A · B 반대 박자)
    float a=.5*sin(ph)*a_leg,c=cos(a),s=sin(a);vec2 d=vec2(p.x-a_pivot.x,p.z-a_pivot.y);
    p.x=a_pivot.x+c*d.x-s*d.y;p.z=a_pivot.y+s*d.x+c*d.y;n=vec3(c*n.x-s*n.z,n.y,s*n.x+c*n.z);
  }
  p.z+=go*.03*abs(sin(ph));
  vec3 loc=vec3(L*.5+p.x*W,p.y*W,p.z*W);
  gl_Position=u_matrix*vec4(i_o+(i_F*loc.x+i_R*loc.y+i_U*loc.z)*u_unit,1.);
  v_n=i_F*n.x+i_R*n.y+i_U*n.z;v_c=a_c.r<0.?i_rgb:a_c;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 v_n;flat in vec3 v_c;uniform float u_alpha,u_amb,u_dif;uniform vec3 u_light;out vec4 o;
void main(){float l=length(v_n),d=l>1e-6?abs(dot(v_n/l,u_light)):0.;o=vec4(v_c*(u_amb+u_dif*d),1.)*u_alpha;}`;

export class UnitConvoy {
  static last = null;   // 마지막 프레임에 그린 것(캡처 스크립트가 읽는다)
  constructor() { this.lists = new Map(); this.M = new Float32Array(16); this.seeds = new Map() }
  init(gl) {
    if (this.p) return;
    this.p = compile(gl, VS, FS);
    const names = ['a_p', 'a_n', 'a_c', 'a_leg', 'a_pivot', 'i_o', 'i_F', 'i_R', 'i_U', 'i_LW', 'i_rgb', 'i_go'];
    this.attr = Object.fromEntries(names.map(n => [n, gl.getAttribLocation(this.p, n)]));
    this.uni = Object.fromEntries(['u_matrix', 'u_unit', 'u_time', 'u_alpha', 'u_amb', 'u_dif', 'u_light'].map(n => [n, gl.getUniformLocation(this.p, n)]));
    this.meshes = new Map(); this.ib = gl.createBuffer(); this.cap = 0;
  }
  // 모양마다 꼭짓점 버퍼(처음 쓸 때 만든다)
  mesh(gl, key) {
    let m = this.meshes.get(key); if (m) return m;
    const data = buildUnitMesh(key), b = gl.createBuffer(), va = gl.createVertexArray(), A = this.attr;
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    for (const [loc, size, off] of [[A.a_p, 3, 0], [A.a_n, 3, 3], [A.a_c, 3, 6], [A.a_leg, 1, 9], [A.a_pivot, 2, 10]]) if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, VERT * 4, off * 4) }
    gl.bindVertexArray(null); m = { b, va, n: data.length / VERT }; this.meshes.set(key, m); return m;
  }
  begin(ox, oy) { this.ox = ox; this.oy = oy; for (const l of this.lists.values()) l.n = 0 }
  // 유닛 하나: 틀(fr: 밑 뒤 점, F, R, U), 그 칸 길이 L · 폭 W(px), 모양 이름, 노선 색, 가는 중인지, 열차 id(걸음 박자)
  unit(fr, L, W, kind, rgb, moving, key) {
    if (!UNIT_SHAPES[kind]) return;
    for (let k = 0; k < 12; k++) if (!Number.isFinite(fr[k])) return;
    let s = this.seeds.get(key); if (s == null) { s = fnv1a(String(key)) % 997; if (this.seeds.size > 4096) this.seeds.clear(); this.seeds.set(key, s) }
    let l = this.lists.get(kind); if (!l) this.lists.set(kind, l = { inst: new Float32Array(INST * 64), n: 0 });
    if ((l.n + 1) * INST > l.inst.length) { const g = new Float32Array(l.inst.length * 2); g.set(l.inst); l.inst = g }
    const d = l.inst, i = l.n * INST;
    d[i] = fr[0] - this.ox; d[i + 1] = fr[1] - this.oy; d[i + 2] = fr[2]; for (let k = 0; k < 9; k++) d[i + 3 + k] = fr[3 + k];
    d[i + 12] = L; d[i + 13] = W; d[i + 14] = rgb[0]; d[i + 15] = rgb[1]; d[i + 16] = rgb[2]; d[i + 17] = s * 2 + (moving ? 1 : 0); l.n++;
  }
  // o: unit(px 하나의 메르카토르), walls(버퍼에 건물 깊이), occlude(벽 뒤 몫의 알파), dark, time(초)
  draw(gl, M, ox, oy, o) {
    const runs = [...this.lists].filter(([, l]) => l.n), total = runs.reduce((a, [, l]) => a + l.n, 0);
    const at = []; for (const [, l] of runs) for (let k = 0; k < Math.min(l.n, 20); k++) at.push([l.inst[k * INST] + ox, l.inst[k * INST + 1] + oy, l.inst[k * INST + 2], l.inst[k * INST + 17] % 2]);   // 유닛 자리(메르카토르) · 가는 중: 캡처가 찾아 간다
    UnitConvoy.last = { n: total, kinds: Object.fromEntries(runs.map(([k, l]) => [k, l.n])), W: runs[0]?.[1].inst[13], at };
    if (!total || !this.p) return;
    const MT = this.M; MT.set(M); for (let r = 0; r < 4; r++) MT[12 + r] = M[r] * ox + M[4 + r] * oy + M[12 + r];
    const U = this.uni; gl.useProgram(this.p);
    gl.uniformMatrix4fv(U.u_matrix, false, MT); gl.uniform1f(U.u_unit, o.unit); gl.uniform1f(U.u_time, o.time ?? performance.now() / 1000);
    gl.uniform1f(U.u_amb, o.dark ? .55 : .62); gl.uniform1f(U.u_dif, o.dark ? .25 : .42); gl.uniform3fv(U.u_light, SUN);
    gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST);
    const need = total * INST; gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    if (this.cap < need) { this.cap = Math.max(need, INST * 256) * 2; gl.bufferData(gl.ARRAY_BUFFER, this.cap * 4, gl.DYNAMIC_DRAW) }
    let off = 0; const parts = [];
    for (const [key, l] of runs) { gl.bufferSubData(gl.ARRAY_BUFFER, off * 4, l.inst, 0, l.n * INST); parts.push([key, l, off]); off += l.n * INST }
    const names = ['i_o', 'i_F', 'i_R', 'i_U', 'i_LW', 'i_rgb', 'i_go'], sizes = [3, 3, 3, 3, 2, 3, 1];
    for (const [key, l, base] of parts) {
      const m = this.mesh(gl, key); gl.bindVertexArray(m.va); gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
      let a = 0; names.forEach((n, k) => { const loc = this.attr[n]; if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, sizes[k], gl.FLOAT, false, INST * 4, base * 4 + a * 4); gl.vertexAttribDivisor(loc, 1) } a += sizes[k] });
      const pass = alpha => { gl.uniform1f(U.u_alpha, alpha); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, l.n) };
      gl.depthMask(false);
      if (o.walls && o.occlude) { gl.depthFunc(gl.GREATER); pass(o.occlude) }   // 건물 뒤: 희미하게(제 깊이를 쓰기 전에)
      gl.depthFunc(gl.LEQUAL); gl.depthMask(true); pass(1); gl.depthMask(false);
      for (const n of names) { const loc = this.attr[n]; if (loc >= 0) gl.vertexAttribDivisor(loc, 0) }
    }
    gl.bindVertexArray(null); gl.depthFunc(gl.LEQUAL);
  }
  dispose(gl) {
    if (!this.p) return;
    for (const m of this.meshes.values()) { gl.deleteBuffer(m.b); gl.deleteVertexArray(m.va) }
    this.meshes.clear(); gl.deleteBuffer(this.ib); gl.deleteProgram(this.p); this.p = null;
  }
}
export default UnitConvoy;
