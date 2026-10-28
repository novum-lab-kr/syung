// 롤코 1인칭: 탄 열차 앞뒤 수백 m 만 실제 크기 레일 · 침목을 따로 그린다.
// 지도에서 보는 레일은 몇 px 짜리 납작한 띠라, 눈높이에서 보면 판 위에 줄만 그어 놓은 것처럼 보였다(2026-10-06 덕배).
//   frames: [{p:[x,y,z], F, R, U, end?}…] — 레일 중심(차선 가운데, 상판 높이)의 메르카토르 좌표와 틀, 진행 방향 순서로 SLEEPER_M 간격.
//   end: 그 선로의 마지막 틀(다음 틀은 다른 선로), d: 탄 열차 앞에서부터 거리(m, 침목을 어디까지 놓을지)
//   mpu: 1 m 의 메르카토르 길이, origin: [ox, oy] — 좌표는 여기서 뺀 값으로 담는다(float 정밀도)
import { PARK_DEFAULTS as STYLE } from '../basic/park.mts';
import type { ParkPack } from './metrics.mts';

// 레일 틀 하나(본체 coasterRailFrames): 레일 중심 p · 앞 F · 옆 R · 위 U(메르카토르), 그 선로의 끝 end, 탄 열차 앞에서부터 거리 d(m)
export interface RailFrame { p:readonly number[]; F:readonly number[]; R:readonly number[]; U:readonly number[]; end?:boolean; d?:number | null }
type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;
type RideTrackUniform = 'u_matrix' | 'u_eye' | 'u_mpu' | 'u_fade' | 'u_tint';

export const SLEEPER_M = .6;   // 침목 간격(한국 일반 선로 1 km 에 약 1,667개)
const STRIDE = 7;   // x y z · r g b · 침목이면 1(멀어지면 사라짐)

const hex = (h:string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const SUN = (v => { const l = Math.hypot(...v); return v.map(c => c / l) })([-.30, .46, .84]);   // coaster_train 과 같은 해

export function buildRideTrack(frames:RailFrame[], { mpu, origin, pack = STYLE }:{ mpu:number; origin:readonly number[]; pack?:ParkPack }) {
  const T = pack.rideTrack, out = new Float32Array(Math.max(1, frames.length) * (30 + 36) * STRIDE + STRIDE * 6);
  let o = 0;
  const g = T.gaugeM / 2, rw = T.railHeadM / 2, rTop = T.railTopM, rBot = T.sleeperTopM, sTop = T.sleeperTopM, sBot = T.sleeperBottomM, sl = T.sleeperLengthM / 2, sw = T.sleeperWidthM / 2;
  const at = (f:RailFrame, a:number, u:number, h:number) => [0, 1, 2].map(k => f.p[k]! + (f.R[k]! * a + f.U[k]! * h + f.F[k]! * u) * mpu - (k < 2 ? origin[k]! : 0));   // 가로 a · 앞 u · 위 h (m)
  const lit = (f:RailFrame, n:readonly number[], rgb:number[], k:number) => { const N = [0, 1, 2].map(i => f.R[i]! * n[0]! + f.F[i]! * n[1]! + f.U[i]! * n[2]!), d = Math.max(0, N[0]! * SUN[0]! + N[1]! * SUN[1]! + N[2]! * SUN[2]!); return rgb.map(c => c * k * (.64 + .36 * d)) };
  const vtx = (p:number[], c:number[], fade:number) => { out[o++] = p[0]!; out[o++] = p[1]!; out[o++] = p[2]!; out[o++] = c[0]!; out[o++] = c[1]!; out[o++] = c[2]!; out[o++] = fade };
  const quad = (a:number[], b:number[], c:number[], d:number[], col:number[], fade:number) => { for (const p of [a, b, c, a, c, d]) vtx(p, col, fade) };
  const steel = hex(T.rail), head = hex(T.railHead), conc = hex(T.sleeper);
  // 침목은 sleeperM 안(그 밖은 셰이더에서 사라진다)만, 레일은 railEvery 틀마다 이어(2.4 m — 곡선도 매끈) 정점을 줄인다
  const near = T.sleeperM ?? 1e9, every = Math.max(1, T.railEvery ?? 1);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    if (f.d == null || f.d <= near) {
    // 침목: 위 · 앞뒤 · 양 끝(밑은 안 보인다)
    const S = (a:number, u:number, h:number) => at(f, a, u, h);
    quad(S(-sl, -sw, sTop), S(sl, -sw, sTop), S(sl, sw, sTop), S(-sl, sw, sTop), lit(f, [0, 0, 1], conc, 1), 1);
    for (const e of [-1, 1]) {
      quad(S(-sl, e * sw, sBot), S(sl, e * sw, sBot), S(sl, e * sw, sTop), S(-sl, e * sw, sTop), lit(f, [0, e, 0], conc, .9), 1);
      quad(S(e * sl, -sw, sBot), S(e * sl, sw, sBot), S(e * sl, sw, sTop), S(e * sl, -sw, sTop), lit(f, [e, 0, 0], conc, .85), 1);
    }
    }
    if (f.end || i % every && !frames[i + 1]?.end) continue;
    // 레일 두 줄: 이 틀에서 다음 레일 틀(every 개 뒤, 선로 끝은 끝 틀)까지, 윗면(밝게 닳은 머리) · 양 옆
    let j = i + 1; while (j < frames.length && j < i + every && !frames[j]!.end) j++;
    if (j >= frames.length) continue;
    const n = frames[j]!;
    for (const e of [-1, 1]) {
      const A = (a:number, h:number) => at(f, e * g + a, 0, h), B = (a:number, h:number) => at(n, e * g + a, 0, h);
      quad(A(-rw, rTop), B(-rw, rTop), B(rw, rTop), A(rw, rTop), lit(f, [0, 0, 1], head, 1), 0);
      for (const s of [-1, 1]) quad(A(s * rw, rBot), B(s * rw, rBot), B(s * rw, rTop), A(s * rw, rTop), lit(f, [s, 0, 0], steel, 1), 0);
    }
  }
  return out.subarray(0, o);
}

const VS = `#version 300 es
in vec3 a_p;in vec3 a_c;in float a_f;uniform mat4 u_matrix;uniform vec3 u_eye;uniform float u_mpu;
out vec3 v_c;out float v_f,v_d;
void main(){gl_Position=u_matrix*vec4(a_p,1.);v_c=a_c;v_f=a_f;v_d=length(a_p-u_eye)/u_mpu;}`;
const FS = `#version 300 es
precision highp float;in vec3 v_c;in float v_f,v_d;uniform vec2 u_fade;uniform float u_tint;out vec4 o;
void main(){float a=1.-v_f*smoothstep(u_fade.x,u_fade.y,v_d);if(a<.01)discard;o=vec4(v_c*u_tint*a,a);}`;   // 침목은 멀어지면 사라진다(1 px 아래로 줄어 물결무늬가 생기기 전에)

export class RideTrack {
  // 필드는 선언만(declare — 실행 코드 없음, 값은 지금처럼 constructor · init · set 이 넣는다)
  declare pack:ParkPack; declare n:number; declare M:Float32Array; declare p:WebGLProgram | null; declare u:Uniforms<RideTrackUniform>;
  declare buf:WebGLBuffer; declare va:WebGLVertexArrayObject; declare gl:WebGL2RenderingContext; declare origin:readonly number[]; declare mpu:number;
  constructor(pack:ParkPack = STYLE) { this.pack = pack; this.n = 0; this.M = new Float32Array(16) }
  init(gl:WebGL2RenderingContext) {
    const sh = (t:number, s:string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(x)!); return x };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p)!);
    this.p = p; this.u = Object.fromEntries((['u_matrix', 'u_eye', 'u_mpu', 'u_fade', 'u_tint'] as const).map(k => [k, gl.getUniformLocation(p, k)])) as Uniforms<RideTrackUniform>;
    this.buf = gl.createBuffer(); this.va = gl.createVertexArray(); gl.bindVertexArray(this.va); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    for (const [name, size, off] of [['a_p', 3, 0], ['a_c', 3, 3], ['a_f', 1, 6]] as [string, number, number][]) { const l = gl.getAttribLocation(p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, STRIDE * 4, off * 4) }
    gl.bindVertexArray(null); this.gl = gl;
  }
  set(gl:WebGL2RenderingContext, frames:RailFrame[], mpu:number, origin:readonly number[]) {
    if (!this.p) this.init(gl);
    const d = buildRideTrack(frames, { mpu, origin, pack: this.pack });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    this.n = d.length / STRIDE; this.origin = origin; this.mpu = mpu;
  }
  clear() { this.n = 0 }
  // M: 지도의 mainMatrix, eye: 눈(메르카토르), dark: 밤 테마
  draw(gl:WebGL2RenderingContext, M:ArrayLike<number>, eye:readonly number[], dark:boolean) {
    if (!this.n) return;
    const [ox, oy] = this.origin as [number, number], MT = this.M; MT.set(M); for (let r = 0; r < 4; r++) MT[12 + r] = M[r]! * ox + M[4 + r]! * oy + M[12 + r]!;   // M · translate(origin), double 로 계산
    const T = this.pack.rideTrack;
    gl.useProgram(this.p); gl.bindVertexArray(this.va);
    gl.uniformMatrix4fv(this.u.u_matrix, false, MT); gl.uniform3f(this.u.u_eye, eye[0]! - ox, eye[1]! - oy, eye[2]!); gl.uniform1f(this.u.u_mpu, this.mpu);
    gl.uniform2f(this.u.u_fade, T.sleeperFadeM[0]!, T.sleeperFadeM[1]!); gl.uniform1f(this.u.u_tint, dark ? T.darkTint : 1);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, this.n); gl.bindVertexArray(null);
  }
  dispose(gl:WebGL2RenderingContext) { if (this.buf) gl.deleteBuffer(this.buf); if (this.va) gl.deleteVertexArray(this.va); if (this.p) gl.deleteProgram(this.p); this.p = null; this.n = 0 }
}
