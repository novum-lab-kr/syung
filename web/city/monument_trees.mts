// 궁 안 나무(경복궁): 수종별 낮은 면 모형 넷을 한 번 짓고 자리마다 인스턴스로 그린다. 모양 근거: 소나무 = 굽은 줄기 + 층진 납작한 수관 덩어리,
// 활엽수(수종 미상) = 둥근 수관 · 퍼진 수관 둘, 감나무 = 낮은 줄기에 넓은 수관 + 주황 열매(건청궁 뜰 — 위키 건청궁). 자리 자료는 monuments_trees_data.mts.
// 고정 규칙: 어느 모드 · 테마에서나 같은 모양 · 같은 색, 낮 · 밤 조명만 다르다. 멀리서는 안 그린다(Monuments.render 가 도시 건물과 같은 줌 · 자라기 · 거리 줄이기로 부른다 — zoom_gate.mts).
import { PALACE_TREES } from './monuments_trees_data.mts';
import { PALACE_AT } from './monuments_data.mts';
import { toM, MU } from './life.mts';
import { compileProgram } from './traffic.mts';

type V3 = [number, number, number];
// 색표: 줄기 · 소나무 잎 · 활엽 둥근 · 활엽 퍼진 · 감나무 잎 · 감 열매 · 소나무 줄기(붉은 갈색)
const TREE_COLORS = ['#5B4A3A', '#3F5A40', '#5C8A44', '#7DA04E', '#4F7A3C', '#D9731F', '#8A5A3C'];
const TC = { trunk: 0, pine: 1, round: 2, wide: 3, persimmon: 4, fruit: 5, pineBark: 6 } as const;
const toRgb = (value:string) => { const v = parseInt(value.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255] };
const TREE_STRIDE = 7;   // x y z · 법선 3 · 색 번호

class TreeWriter {
  data:number[] = [];
  // 면 하나(법선은 중심에서 바깥쪽으로 향하게 맞춘다)
  tri(a:V3, b:V3, c:V3, kind:number, center:V3):void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const len = Math.hypot(nx, ny, nz); if (len < 1e-9) return;
    nx /= len; ny /= len; nz /= len;
    if (nx * (a[0] - center[0]) + ny * (a[1] - center[1]) + nz * (a[2] - center[2]) < 0) { nx = -nx; ny = -ny; nz = -nz }
    for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], nx, ny, nz, kind);
  }
  // 납작한(또는 길쭉한) 덩어리: 가로 반지름 rx · 높이 반지름 rz · sides 각 · rings 층(위아래 뾰족한 회전체, 모서리는 해마다 조금씩 어긋나 덩어리 느낌)
  blob(cx:number, cy:number, cz:number, rx:number, rz:number, kind:number, sides = 7, rings = 3, twist = 0):void {
    const center:V3 = [cx, cy, cz], ring = (level:number):V3[] => {
      const phi = Math.PI * level / rings - Math.PI / 2, rr = Math.cos(phi) * rx, zz = cz + Math.sin(phi) * rz;
      return Array.from({ length: sides }, (_, i) => { const t = 2 * Math.PI * (i + (level % 2) * .5) / sides + twist; return [cx + Math.cos(t) * rr, cy + Math.sin(t) * rr, zz] as V3 });
    };
    const bottom:V3 = [cx, cy, cz - rz], top:V3 = [cx, cy, cz + rz]; let prev = ring(1);
    for (let i = 0; i < sides; i++) this.tri(bottom, prev[i]!, prev[(i + 1) % sides]!, kind, center);
    for (let level = 2; level < rings; level++) {
      const next = ring(level);
      for (let i = 0; i < sides; i++) {   // 층 사이 띠(어긋난 점끼리 삼각형 둘)
        const a = prev[i]!, b = prev[(i + 1) % sides]!, c = next[i]!, d = next[(i + 1) % sides]!;
        this.tri(a, c, b, kind, center); this.tri(b, c, d, kind, center);
      }
      prev = next;
    }
    for (let i = 0; i < sides; i++) this.tri(top, prev[(i + 1) % sides]!, prev[i]!, kind, center);
  }
  // 줄기: 아래 (x0, y0, z0) 반지름 r0 → 위 (x1, y1, z1) 반지름 r1 의 6각 기둥
  limb(x0:number, y0:number, z0:number, r0:number, x1:number, y1:number, z1:number, r1:number, kind:number):void {
    const sides = 6, center:V3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    for (let i = 0; i < sides; i++) {
      const t0 = 2 * Math.PI * i / sides, t1 = 2 * Math.PI * (i + 1) / sides;
      const a:V3 = [x0 + Math.cos(t0) * r0, y0 + Math.sin(t0) * r0, z0], b:V3 = [x0 + Math.cos(t1) * r0, y0 + Math.sin(t1) * r0, z0];
      const c:V3 = [x1 + Math.cos(t0) * r1, y1 + Math.sin(t0) * r1, z1], d:V3 = [x1 + Math.cos(t1) * r1, y1 + Math.sin(t1) * r1, z1];
      this.tri(a, b, c, kind, center); this.tri(b, d, c, kind, center);
    }
  }
}

// 모양 넷(미터 · 높이 z). 소나무 약 9 m: 굽은 줄기 + 층진 납작 수관 셋 / 둥근 활엽 약 8 m / 퍼진 활엽 약 6.5 m · 폭 9 m / 감나무 약 5 m + 열매
const buildTemplate = (species:keyof typeof PALACE_TREES):Float32Array => {
  const w = new TreeWriter();
  if (species === 'pine') {
    w.limb(0, 0, 0, .34, .5, .1, 3.4, .28, TC.pineBark); w.limb(.5, .1, 3.4, .28, -.3, .2, 6.2, .2, TC.pineBark);
    w.limb(-.3, .2, 5.2, .1, -2.2, .4, 6.4, .06, TC.pineBark);   // 옆으로 뻗은 가지
    w.blob(-.3, .2, 7.7, 2.1, .7, TC.pine, 7, 3, .2); w.blob(-2.4, .5, 6.7, 1.7, .55, TC.pine, 6, 3, .6); w.blob(1.4, -.4, 5.6, 2.3, .6, TC.pine, 7, 3, 1.1);
  } else if (species === 'broad') {
    w.limb(0, 0, 0, .3, 0, 0, 3.2, .22, TC.trunk); w.blob(0, 0, 5.7, 3, 2.8, TC.round, 8, 4, .15);
  } else if (species === 'wide') {
    w.limb(0, 0, 0, .32, .1, 0, 2.4, .24, TC.trunk); w.limb(.1, 0, 2.2, .18, -1.6, .3, 3.6, .1, TC.trunk);
    w.blob(.2, 0, 4.4, 3.6, 1.7, TC.wide, 8, 3, .3); w.blob(-3.1, .6, 3.9, 2.2, 1.2, TC.wide, 6, 3, .8); w.blob(2.9, -.8, 3.7, 2.1, 1.1, TC.wide, 6, 3, .1);
  } else {
    w.limb(0, 0, 0, .24, 0, 0, 2.2, .18, TC.trunk); w.limb(0, 0, 2, .12, 1.4, .2, 3.1, .08, TC.trunk);
    w.blob(0, 0, 3.7, 2.7, 1.4, TC.persimmon, 7, 3, .4);
    for (const [fx, fy, fz] of [[1.8, .5, 3.1], [-1.5, 1.1, 3.0], [.4, -1.9, 2.9], [-.8, -1.3, 3.5], [1.2, 1.4, 3.3]] as const) w.blob(fx, fy, fz, .42, .4, TC.fruit, 5, 2);
  }
  return new Float32Array(w.data);
};

const VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in float a_kind;
layout(location=3) in vec4 a_inst;   // 동 · 북 자리(m) · 크기 · 돌림(라디안)
uniform mat4 u_matrix; uniform float u_mu, u_grow; uniform vec2 u_at;
out vec3 v_n; out float v_k; out float v_h;
void main(){
  float c = cos(a_inst.w), s = sin(a_inst.w);
  vec3 p = vec3(a_pos.xy * a_inst.z, a_pos.z * a_inst.z);
  vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + a_inst.xy;
  vec2 n2 = vec2(a_nrm.x * c - a_nrm.y * s, a_nrm.x * s + a_nrm.y * c);
  v_n = vec3(n2.x, -n2.y, a_nrm.z); v_k = a_kind;
  v_h = fract(sin(dot(a_inst.xy, vec2(12.9898, 78.233))) * 43758.5453);   // 나무마다 조금씩 다른 밝기
  gl_Position = u_matrix * vec4((u_at + vec2(q.x, -q.y)) * u_mu, p.z * u_mu * u_grow, 1.);
}`;
const FS = `#version 300 es
precision highp float; in vec3 v_n; in float v_k; in float v_h; uniform vec3 u_light; uniform vec2 u_lit; uniform float u_night; uniform vec3 u_col[7];
out vec4 o;
void main(){
  vec3 n = normalize(v_n); float d = max(dot(n, u_light), 0.), sky = .5 + .5 * n.z;
  vec3 c = u_col[int(v_k + .5)] * (.9 + .2 * v_h);
  float lt = u_lit.x * (.72 + .28 * sky) + u_lit.y * d;
  if (u_night < .5) lt *= 1.32;
  vec3 col = c * lt; if (u_night > .5) col = c * lt * .42 + c * vec3(1., .78, .52) * .04;
  o = vec4(clamp(col, 0., 1.), 1.);
}`;

interface SpeciesGl { va:WebGLVertexArrayObject; b:WebGLBuffer; inst:WebGLBuffer; n:number; count:number }
export class PalaceTrees {
  declare gl:WebGL2RenderingContext; declare p:WebGLProgram; declare u:Record<string, WebGLUniformLocation | null>; declare at:[number, number];
  species:SpeciesGl[] = [];
  init(gl:WebGL2RenderingContext):void {
    this.gl = gl; this.p = compileProgram(gl, VS, FS); this.at = toM(PALACE_AT[0], PALACE_AT[1]);
    this.u = Object.fromEntries(['u_matrix', 'u_mu', 'u_grow', 'u_at', 'u_light', 'u_lit', 'u_night', 'u_col'].map(name => [name, gl.getUniformLocation(this.p, name)]));
    for (const key of Object.keys(PALACE_TREES) as (keyof typeof PALACE_TREES)[]) {
      const data = buildTemplate(key), points = PALACE_TREES[key], count = points.length / 2, inst = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {   // 크기 · 돌림은 자리에서 정해 같은 값이 나온다
        const x = points[i * 2]! / 10, y = points[i * 2 + 1]! / 10, h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        inst.set([x, y, .8 + .45 * h, h * 6.2832], i * 4);
      }
      const va = gl.createVertexArray(), b = gl.createBuffer(), ib = gl.createBuffer();
      gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      for (const [loc, size, off] of [[0, 3, 0], [1, 3, 3], [2, 1, 6]] as const) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, TREE_STRIDE * 4, off * 4) }
      gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null); this.species.push({ va: va!, b: b!, inst: ib!, n: data.length / TREE_STRIDE, count });
    }
  }
  render(gl:WebGL2RenderingContext, MT:Float32Array, { light, lit, dark, grow }:{ light:[number, number, number]; lit:number[]; dark:boolean; grow:number }):void {   // grow: 도시 건물과 같은 줌 · 거리 높이 비율
    const u = this.u;
    gl.useProgram(this.p); gl.uniformMatrix4fv(u.u_matrix!, false, MT); gl.uniform1f(u.u_mu!, MU); gl.uniform1f(u.u_grow!, grow); gl.uniform2fv(u.u_at!, this.at); gl.uniform3fv(u.u_light!, light); gl.uniform2fv(u.u_lit!, lit); gl.uniform1f(u.u_night!, dark ? 1 : 0);
    gl.uniform3fv(u.u_col!, new Float32Array(TREE_COLORS.flatMap(toRgb)));
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    for (const each of this.species) { gl.bindVertexArray(each.va); gl.drawArraysInstanced(gl.TRIANGLES, 0, each.n, each.count) }
    gl.bindVertexArray(null);
  }
  dispose():void {
    const gl = this.gl; for (const each of this.species) { gl.deleteBuffer(each.b); gl.deleteBuffer(each.inst); gl.deleteVertexArray(each.va) }
    this.species = []; gl.deleteProgram(this.p);
  }
}
