// 궁 안 길가 횃불(경복궁): 밤(다크 · 야간 — 기존 effectiveTheme() === 'dark' 판단 그대로 `dark`)에만 그린다. 낮 · 라이트에는 아무것도 그리지 않는다.
// 한 개 = 나무 기둥 + 쇠 불통 + 불꽃(스스로 빛나는 색) + 땅 위에 번지는 따뜻한 빛 웅덩이(더하기 섞기). 모양 둘을 인스턴스로 한 번에 그린다.
// 자리 자료는 monuments_torches_data.mts(길 가장자리 밖 · 16 m 간격 — 건물 · 담장 · 연못 · 다른 길 · 나무 위는 뺐다). 모드 이름을 묻지 않는다 — 켜고 끄는 건 부르는 쪽(city.heritage).
import { PALACE_TORCHES } from './monuments_torches_data.mts';
import { PALACE_AT } from './monuments_data.mts';
import { toM, MU } from './life.mts';
import { compileProgram } from './traffic.mts';

const TORCH_STRIDE = 7;   // x y z · 법선 3 · 종류(0 기둥 · 1 쇠 불통 · 2 불꽃 · 3 빛 웅덩이)
const POOL_RADIUS = 4.6;  // 빛 웅덩이 반지름(m)
type V3 = [number, number, number];

// 면 하나(법선은 중심에서 바깥으로)
function pushTri(data:number[], a:V3, b:V3, c:V3, kind:number, center:V3):void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const len = Math.hypot(nx, ny, nz); if (len < 1e-9) return;
  nx /= len; ny /= len; nz /= len;
  if (nx * (a[0] - center[0]) + ny * (a[1] - center[1]) + nz * (a[2] - center[2]) < 0) { nx = -nx; ny = -ny; nz = -nz }
  for (const p of [a, b, c]) data.push(p[0], p[1], p[2], nx, ny, nz, kind);
}
// 위로 가늘어지는 네모 기둥(아래 반폭 → 위 반폭): 옆 네 면 + 위
function pushPost(data:number[], z0:number, z1:number, half0:number, half1:number, kind:number):void {
  const center:V3 = [0, 0, (z0 + z1) / 2], lo:V3[] = [[-half0, -half0, z0], [half0, -half0, z0], [half0, half0, z0], [-half0, half0, z0]], hi:V3[] = [[-half1, -half1, z1], [half1, -half1, z1], [half1, half1, z1], [-half1, half1, z1]];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; pushTri(data, lo[i]!, lo[j]!, hi[j]!, kind, center); pushTri(data, lo[i]!, hi[j]!, hi[i]!, kind, center) }
  pushTri(data, hi[0]!, hi[1]!, hi[2]!, kind, center); pushTri(data, hi[0]!, hi[2]!, hi[3]!, kind, center);
}
function buildSolid():Float32Array {
  const data:number[] = [];
  pushPost(data, 0, 1.75, .1, .08, 0);        // 나무 기둥
  pushPost(data, 1.75, 2.05, .17, .3, 1);      // 쇠 불통(위로 벌어진 그릇)
  const tip:V3 = [0, 0, 2.72], base:V3[] = [[.2, 0, 2.0], [0, .2, 2.0], [-.2, 0, 2.0], [0, -.2, 2.0]], mid:V3[] = [[.16, .05, 2.28], [-.05, .16, 2.28], [-.16, -.05, 2.28], [.05, -.16, 2.28]];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; pushTri(data, base[i]!, base[j]!, mid[j]!, 2, [0, 0, 2.2]); pushTri(data, base[i]!, mid[j]!, mid[i]!, 2, [0, 0, 2.2]); pushTri(data, mid[i]!, mid[j]!, tip, 2, [0, 0, 2.2]) }   // 불꽃(배 부른 뾰족 모양)
  return new Float32Array(data);
}
function buildPool():Float32Array {
  const data:number[] = [], z = .14, r = POOL_RADIUS;   // 땅에서 살짝 띄운 네모 — 둥근 빛은 셰이더가 만든다
  for (const p of [[-r, -r], [r, -r], [r, r], [-r, -r], [r, r], [-r, r]] as const) data.push(p[0], p[1], z, 0, 0, 1, 3);
  return new Float32Array(data);
}

const VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in float a_kind;
layout(location=3) in vec2 a_inst;   // 동 · 북 자리(m)
uniform mat4 u_matrix; uniform float u_mu, u_grow; uniform vec2 u_at;
out vec3 v_n; out float v_k; out vec3 v_p; out float v_ph;
void main(){
  v_n = vec3(a_nrm.x, -a_nrm.y, a_nrm.z); v_k = a_kind; v_p = a_pos;
  v_ph = fract(sin(dot(a_inst, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;   // 횃불마다 다른 흔들림 박자
  gl_Position = u_matrix * vec4((u_at + vec2(a_pos.x + a_inst.x, -(a_pos.y + a_inst.y))) * u_mu, a_pos.z * u_mu * u_grow, 1.);
}`;
const FS = `#version 300 es
precision highp float; in vec3 v_n; in float v_k; in vec3 v_p; in float v_ph; uniform float u_time, u_grow; uniform vec3 u_col[3];
out vec4 o;
void main(){
  int k = int(v_k + .5);
  float flick = .86 + .1 * sin(u_time * 9. + v_ph) + .06 * sin(u_time * 23. + v_ph * 2.3);
  if (k == 3) {   // 땅에 번지는 따뜻한 빛: 가운데가 밝고 가장자리로 부드럽게
    float r = length(v_p.xy) / ${POOL_RADIUS.toFixed(1)}; float a = pow(max(1. - r, 0.), 2.2) * .55 * flick * u_grow;
    o = vec4(vec3(1., .6, .26) * a, 0.); return;   // 알파는 건드리지 않는 더하기(오버레이 캔버스의 투명이 까맣게 막히지 않게)
  }
  if (k == 2) { float t = clamp((v_p.z - 2.) / .72, 0., 1.); o = vec4(mix(vec3(1., .62, .18), vec3(1., .93, .6), t) * (.9 + .15 * flick), 1.); return; }
  vec3 n = normalize(v_n); float up = .3 + .7 * max(n.z, 0.), near = exp(-max(v_p.z - 1.7, 0.) * 2.2);
  o = vec4(u_col[k] * (.35 * up + vec3(1., .62, .3) * .9 * near), 1.);   // 기둥 · 불통: 달빛 아래 어둡고 불꽃 가까이만 따뜻하게
}`;

interface TorchGl { va:WebGLVertexArrayObject; b:WebGLBuffer; n:number }
export class PalaceTorches {
  declare gl:WebGL2RenderingContext; declare p:WebGLProgram; declare u:Record<string, WebGLUniformLocation | null>; declare at:[number, number]; declare inst:WebGLBuffer;
  parts:TorchGl[] = []; count = 0;
  init(gl:WebGL2RenderingContext):void {
    this.gl = gl; this.p = compileProgram(gl, VS, FS); this.at = toM(PALACE_AT[0], PALACE_AT[1]);
    this.u = Object.fromEntries(['u_matrix', 'u_mu', 'u_grow', 'u_at', 'u_time', 'u_col'].map(name => [name, gl.getUniformLocation(this.p, name)]));
    this.count = PALACE_TORCHES.length / 2; const inst = new Float32Array(this.count * 2); for (let i = 0; i < inst.length; i++) inst[i] = PALACE_TORCHES[i]! / 10;
    this.inst = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    for (const data of [buildSolid(), buildPool()]) {
      const va = gl.createVertexArray(), b = gl.createBuffer();
      gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      for (const [loc, size, off] of [[0, 3, 0], [1, 3, 3], [2, 1, 6]] as const) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, TORCH_STRIDE * 4, off * 4) }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 8, 0); gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null); this.parts.push({ va: va!, b: b!, n: data.length / TORCH_STRIDE });
    }
  }
  // 밤(dark)에만 그린다 — 낮 · 라이트에서는 곧바로 돌아간다
  render(gl:WebGL2RenderingContext, MT:Float32Array, { dark, grow }:{ dark:boolean; grow:number }):void {   // grow: 도시 건물과 같은 줌 · 거리 높이 비율(빛 웅덩이는 그만큼 옅게)
    if (!dark || !this.count) return;
    const u = this.u;
    gl.useProgram(this.p); gl.uniformMatrix4fv(u.u_matrix!, false, MT); gl.uniform1f(u.u_mu!, MU); gl.uniform1f(u.u_grow!, grow); gl.uniform2fv(u.u_at!, this.at); gl.uniform1f(u.u_time!, performance.now() / 1000 % 1000);
    gl.uniform3fv(u.u_col!, new Float32Array([.36, .25, .17, .2, .19, .18, 0, 0, 0]));   // 기둥 · 쇠 불통 색(불꽃은 셰이더가 만든다)
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.bindVertexArray(this.parts[0]!.va); gl.drawArraysInstanced(gl.TRIANGLES, 0, this.parts[0]!.n, this.count);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE); gl.depthMask(false); gl.bindVertexArray(this.parts[1]!.va); gl.drawArraysInstanced(gl.TRIANGLES, 0, this.parts[1]!.n, this.count);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
  }
  dispose():void {
    const gl = this.gl; for (const each of this.parts) { gl.deleteBuffer(each.b); gl.deleteVertexArray(each.va) }
    gl.deleteBuffer(this.inst); this.parts = []; gl.deleteProgram(this.p);
  }
}
