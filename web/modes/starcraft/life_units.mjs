// 스타크래프트 도시 생활: 길을 걷는 사람과 달리는 차 자리에 원작 유닛을 세운다(행님 2026-10-22: 사람이랑 차도 유닛으로).
// web/city/life.mjs 가 모드 설정 city.life.units 가 있으면 사람 · 차를 그리지 않고 이걸 부른다(본체가 모드 코드 받기로 받아 overlay 가 넘긴다).
// 자리 · 방향 · 걷는지는 엔진의 것(사람 poses 14 칸, 차 TrafficSim poses 10 칸)을 그대로 쓰고, 모양은 unit_shapes.mjs(Codex 시안).
// 사람은 그 사람의 look 번호로, 차는 차 종류(kind)와 자리로 모양 목록에서 고른다.
import { compile, hexRGB } from '../coaster/night.mjs';
import { UNIT_SHAPES, LINE, shapeTriangles } from './units.mjs';

const VERT = 12, INST = 8;   // 꼭짓점: 자리 3 · 법선 3 · 색 3 · 다리 1 · 축 2 / 인스턴스: x · y(로컬 m) · 방향 · 크기(m, 폭 1 당) · 걷는지 · 박자 · 색(노선 대신, 'line' 칸) r · g
const VS = `#version 300 es
in vec3 a_p;in vec3 a_n;in vec3 a_c;in float a_leg;in vec2 a_pivot;
in vec4 i_a;in vec4 i_b;
uniform mat4 u_matrix;uniform float u_mu,u_time,u_fly;uniform vec3 u_line;
out vec3 v_n;flat out vec3 v_c;
void main(){
  float s=i_a.w;if(s<=.002){gl_Position=vec4(2.,2.,2.,1.);return;}
  vec3 p=a_p,n=a_n;float go=i_b.x,ph=u_time*6.2832*1.8+i_b.y*6.2832;
  if(abs(a_leg)>.5&&go>.5){float a=.5*sin(ph)*a_leg,c=cos(a),sn=sin(a);vec2 d=vec2(p.x-a_pivot.x,p.z-a_pivot.y);p.x=a_pivot.x+c*d.x-sn*d.y;p.z=a_pivot.y+sn*d.x+c*d.y;n=vec3(c*n.x-sn*n.z,n.y,sn*n.x+c*n.z);}
  p.z+=go*.03*abs(sin(ph));if(u_fly>0.)p.z+=u_fly+.05*sin(u_time*2.+i_b.y*6.2832);
  p*=s;float c=cos(i_a.z),sn=sin(i_a.z);p.xy=vec2(p.x*c-p.y*sn,p.x*sn+p.y*c);n=vec3(n.x*c-n.y*sn,n.x*sn+n.y*c,n.z);
  gl_Position=u_matrix*vec4((i_a.xy+p.xy)*u_mu,p.z*u_mu,1.);
  v_n=n;v_c=a_c.r<0.?u_line:a_c;
}`;
const FS = `#version 300 es
precision highp float;in vec3 v_n;flat in vec3 v_c;uniform vec3 u_light;uniform vec2 u_lit;out vec4 o;
void main(){float l=length(v_n),d=l>1e-6?max(dot(v_n/l,u_light),0.):0.;o=vec4(clamp(v_c*(u_lit.x+u_lit.y*(.35+.65*d)),0.,1.),1.);}`;

export class LifeUnits {
  init(gl) {
    if (this.p) return;
    this.p = compile(gl, VS, FS);
    this.attr = Object.fromEntries(['a_p', 'a_n', 'a_c', 'a_leg', 'a_pivot', 'i_a', 'i_b'].map(n => [n, gl.getAttribLocation(this.p, n)]));
    this.uni = Object.fromEntries(['u_matrix', 'u_mu', 'u_time', 'u_fly', 'u_line', 'u_light', 'u_lit'].map(n => [n, gl.getUniformLocation(this.p, n)]));
    this.meshes = new Map(); this.ib = gl.createBuffer(); this.cap = 0; this.lists = new Map();
  }
  mesh(gl, key) {
    let m = this.meshes.get(key); if (m) return m;
    const shape = UNIT_SHAPES[key], pal = shape.palette.map(hexRGB), data = [];
    for (const t of shapeTriangles(shape)) data.push(...t.p, ...t.n, ...(t.color === LINE ? [-1, -1, -1] : pal[t.color]), t.leg, ...t.pivot);
    const f = new Float32Array(data), b = gl.createBuffer(), va = gl.createVertexArray(), A = this.attr;
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, f, gl.STATIC_DRAW); gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    for (const [loc, size, off] of [[A.a_p, 3, 0], [A.a_n, 3, 3], [A.a_c, 3, 6], [A.a_leg, 1, 9], [A.a_pivot, 2, 10]]) if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, VERT * 4, off * 4) }
    gl.bindVertexArray(null); m = { b, va, n: f.length / VERT }; this.meshes.set(key, m); return m;
  }
  push(key, x, y, yaw, s, go, seed) {
    if (!UNIT_SHAPES[key]) return;
    let l = this.lists.get(key); if (!l) this.lists.set(key, l = { inst: new Float32Array(INST * 64), n: 0 });
    if ((l.n + 1) * INST > l.inst.length) { const g = new Float32Array(l.inst.length * 2); g.set(l.inst); l.inst = g }
    l.inst.set([x, y, yaw, s, go, seed, 0, 0], l.n++ * INST);
  }
  // 사람 · 차 자리에서 유닛 목록 만들고 그리기. U: 모드 설정 city.life.units {people: [이름…], cars: [이름…], personM, carM}
  draw(gl, MT, mu, { people, peopleN = 0, cars, carsN = 0, units: U, personH = 1.7, carLenM = 4.3, now = 0, light = [-.5, .5, .7], lit = [.64, .36], line = [.5, .5, .5] }) {
    this.init(gl); for (const l of this.lists.values()) l.n = 0;
    const P = U.people || [], C = U.cars || [];
    if (P.length) for (let i = 0; i < peopleN; i++) {
      const o = i * 14, k = P[Math.abs(Math.round(people[o + 10] * 7 + people[o + 6] * 3)) % P.length], sh = UNIT_SHAPES[k]; if (!sh) continue;
      const s = people[o + 7] * personH * (U.personScale ?? 1) / 1.25;   // 유닛 키(z 약 1.25) = 사람 키
      this.push(k, people[o], people[o + 1], Math.atan2(people[o + 5], people[o + 4]), s, people[o + 3], (i * .618) % 1);
    }
    if (C.length) for (let i = 0; i < carsN; i++) {
      const o = i * 10, k = C[(Math.abs(Math.round(cars[o] * .37 + cars[o + 1] * .53)) + cars[o + 3]) % C.length], sh = UNIT_SHAPES[k]; if (!sh) continue;
      const s = cars[o + 7] * carLenM * (U.carScale ?? 1) / sh.len;   // 유닛 길이 = 차 길이
      this.push(k, cars[o], cars[o + 1], cars[o + 2], s, 1, (i * .618) % 1);
    }
    const runs = [...this.lists].filter(([, l]) => l.n); if (!runs.length) return 0;
    const Uu = this.uni; gl.useProgram(this.p);
    gl.uniformMatrix4fv(Uu.u_matrix, false, MT); gl.uniform1f(Uu.u_mu, mu); gl.uniform1f(Uu.u_time, now / 1000); gl.uniform3fv(Uu.u_line, line); gl.uniform3fv(Uu.u_light, light); gl.uniform2fv(Uu.u_lit, lit);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    const total = runs.reduce((a, [, l]) => a + l.n, 0); gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    if (this.cap < total * INST) { this.cap = Math.max(total * INST, INST * 256) * 2; gl.bufferData(gl.ARRAY_BUFFER, this.cap * 4, gl.DYNAMIC_DRAW) }
    let off = 0, drawn = 0;
    for (const [key, l] of runs) {
      gl.bufferSubData(gl.ARRAY_BUFFER, off * 4, l.inst, 0, l.n * INST);
      const m = this.mesh(gl, key); gl.bindVertexArray(m.va); gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
      for (const [n, k] of [['i_a', 0], ['i_b', 4]]) { const loc = this.attr[n]; if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, INST * 4, (off + k) * 4); gl.vertexAttribDivisor(loc, 1) } }
      gl.uniform1f(Uu.u_fly, UNIT_SHAPES[key].fly ? .9 : 0);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, l.n); drawn += l.n; off += l.n * INST;
      for (const n of ['i_a', 'i_b']) { const loc = this.attr[n]; if (loc >= 0) gl.vertexAttribDivisor(loc, 0) }
    }
    gl.bindVertexArray(null); gl.enable(gl.BLEND);
    return drawn;
  }
  dispose(gl) {
    if (!this.p) return;
    for (const m of this.meshes.values()) { gl.deleteBuffer(m.b); gl.deleteVertexArray(m.va) }
    this.meshes.clear(); gl.deleteBuffer(this.ib); gl.deleteProgram(this.p); this.p = null;
  }
}

export default LifeUnits;
