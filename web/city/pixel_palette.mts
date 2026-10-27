// 도트 색표 · 윤곽(레트로 — 모드 설정 map.pixel): 지금까지 그린 그림을 한 장 베껴, 픽셀마다 색표에서 가장 가까운 색으로 바꾸고
// 밝은 이웃보다 많이 어두운 쪽 가장자리를 먹선으로 칠해 다시 쓴다. 지도 · 열차 캔버스가 이미 낮은 해상도(도트 한 칸 = 픽셀 하나)라 한 픽셀씩이면 된다.
//
//   const fx = new PixelPalette(); fx.init(gl);
//   fx.render(gl, {palette: 'endesga32', outline: true, alpha: false});   // 3D 를 다 그린 뒤. alpha: 투명 바탕 캔버스(열차) — 반투명은 0 · 1 로 자른다
//   fx.dispose(gl);                                                        // 레트로를 나가면 부르는 쪽이 치운다
//
// GL 상태: 바꾼 것(프레임버퍼 · 뷰포트 · 프로그램 · VAO · 텍스처 · 섞기 · 깊이 · 스텐실 · 가위 · 색 마스크)을 끝에 되돌린다.
// 색표는 이름으로 고른다(설정은 데이터만). 노선 · 열차에 브랜드 노랑을 쓰지 않으려 노랑(fee761)은 뺐다.

export const PALETTES:Record<string, string[]> = {
  // Endesga 32(Lospec) — 노랑 fee761 뺀 31색
  endesga32: ['be4a2f', 'd77643', 'ead4aa', 'e4a672', 'b86f50', '733e39', '3e2731', 'a22633', 'e43b44', 'f77622', 'feae34', '63c74d', '3e8948', '265c42', '193c3e', '124e89',
    '0099db', '2ce8f5', 'ffffff', 'c0cbdc', '8b9bb4', '5a6988', '3a4466', '262b44', '181425', 'ff0044', '68386c', 'b55088', 'f6757a', 'e8b796', 'c28569'],
};
const INK = [0x18 / 255, 0x14 / 255, 0x25 / 255];   // 먹선(Endesga 181425)
const MAX = 32;

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;   // 화면을 덮는 삼각형 하나
const FS = `#version 300 es
precision highp float;
uniform sampler2D u_src; uniform vec3 u_pal[${MAX}]; uniform int u_n; uniform vec3 u_ink; uniform float u_outline, u_alpha; out vec4 o;
vec4 at(ivec2 p) { ivec2 s = textureSize(u_src, 0); vec4 c = texelFetch(u_src, clamp(p, ivec2(0), s - 1), 0); if (u_alpha > .5 && c.a > 0.) c.rgb /= c.a; return c; }   // 미리 곱한 알파를 풀어 제 색으로
float lum(vec3 c) { return dot(c, vec3(.3, .59, .11)); }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); vec4 c = at(p);
  float a = u_alpha > .5 ? step(.5, c.a) : 1.;
  if (a < .5) { o = vec4(0.); return; }   // 투명 바탕은 그대로 비운다
  vec3 best = u_pal[0]; float bd = 1e9;
  for (int i = 0; i < ${MAX}; i++) { if (i >= u_n) break; vec3 q = c.rgb - u_pal[i]; float d = dot(q * q, vec3(.3, .59, .11)); if (d < bd) { bd = d; best = u_pal[i]; } }
  if (u_outline > .5) {   // 먹선: 이웃보다 많이 어두운 쪽(또는 투명 바탕과 맞닿은 가장자리)
    float l = lum(c.rgb), e = 0.; bool edge = false;
    for (int k = 0; k < 4; k++) { ivec2 d = k == 0 ? ivec2(1, 0) : k == 1 ? ivec2(-1, 0) : k == 2 ? ivec2(0, 1) : ivec2(0, -1); vec4 n = at(p + d);
      if (u_alpha > .5 && n.a < .5) edge = true; else e = max(e, lum(n.rgb) - l); }
    if (edge || e > .3) best = u_ink;
  }
  o = vec4(best * a, a);
}`;

type Uniform = 'u_src' | 'u_pal' | 'u_n' | 'u_ink' | 'u_outline' | 'u_alpha';
// render 가 바꾸고 끝에 되돌리는 GL 상태
interface SavedGL {
  fb:WebGLFramebuffer | null; rfb:WebGLFramebuffer | null; tex0:WebGLTexture | null; vp:Int32Array; prog:WebGLProgram | null; vao:WebGLVertexArrayObject | null; unit:number;
  cm:[boolean, boolean, boolean, boolean]; dm:boolean; blend:boolean; depth:boolean; cull:boolean; scissor:boolean; stencil:boolean;
}
export class PixelPalette {
  declare gl:WebGL2RenderingContext; declare broken:boolean; declare tex:WebGLTexture | null; declare w:number; declare h:number;
  declare p:WebGLProgram | null; declare u:Record<Uniform, WebGLUniformLocation | null>; declare vao:WebGLVertexArrayObject | null; declare palKey:string; declare pal:Float32Array;
  init(gl:WebGL2RenderingContext):void {
    this.gl = gl; this.broken = false; this.tex = null; this.w = this.h = 0;
    const sh = (t:number, s:string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) { const m = gl.getShaderInfoLog(x); gl.deleteShader(x); throw Error('pixel-palette shader: ' + m) } return x };
    try {
      const p = gl.createProgram(), a = sh(gl.VERTEX_SHADER, VS), b = sh(gl.FRAGMENT_SHADER, FS);
      gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p); gl.deleteShader(a); gl.deleteShader(b);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const m = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw Error('pixel-palette link: ' + m) }
      this.p = p; this.u = {} as Record<Uniform, WebGLUniformLocation | null>; for (const k of ['u_src', 'u_pal', 'u_n', 'u_ink', 'u_outline', 'u_alpha'] as const) this.u[k] = gl.getUniformLocation(p, k);
    } catch (e) { console.warn('pixel-palette: off', e); this.broken = true; return }   // 셰이더가 안 되면 도트만(색 그대로)
    this.vao = gl.createVertexArray(); this.palKey = '';
  }
  render(gl:WebGL2RenderingContext, { palette = 'endesga32', outline = true, alpha = false }:{ palette?:string; outline?:boolean; alpha?:boolean } = {}):void {
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, pal = PALETTES[palette]; if (this.broken || !pal || W < 2 || H < 2) return;
    const s = this.save(gl);
    gl.activeTexture(gl.TEXTURE0);
    if (W !== this.w || H !== this.h) {   // 화면 크기가 바뀌면 베낌 텍스처를 다시
      if (this.tex) gl.deleteTexture(this.tex);
      this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
      this.w = W; this.h = H;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);   // 그린 곳(기본 버퍼)에서 베낀다
    gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);
    gl.viewport(0, 0, W, H); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND); gl.depthMask(false); gl.colorMask(true, true, true, true);
    gl.useProgram(this.p); gl.bindVertexArray(this.vao); gl.uniform1i(this.u.u_src, 0);
    if (this.palKey !== palette) { this.palKey = palette; this.pal = new Float32Array(MAX * 3); pal.forEach((h, i) => { for (let j = 0; j < 3; j++) this.pal[i * 3 + j] = parseInt(h.slice(j * 2, j * 2 + 2), 16) / 255 }) }
    gl.uniform3fv(this.u.u_pal, this.pal); gl.uniform1i(this.u.u_n, Math.min(MAX, pal.length)); gl.uniform3fv(this.u.u_ink, INK);
    gl.uniform1f(this.u.u_outline, outline ? 1 : 0); gl.uniform1f(this.u.u_alpha, alpha ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.restore(gl, s);
  }
  save(gl:WebGL2RenderingContext):SavedGL {
    const g = (k:number) => gl.getParameter(k), on = (k:number) => gl.isEnabled(k);
    gl.activeTexture(gl.TEXTURE0); const tex0 = g(gl.TEXTURE_BINDING_2D);
    return { fb: g(gl.DRAW_FRAMEBUFFER_BINDING), rfb: g(gl.READ_FRAMEBUFFER_BINDING), tex0, vp: g(gl.VIEWPORT), prog: g(gl.CURRENT_PROGRAM), vao: g(gl.VERTEX_ARRAY_BINDING), unit: g(gl.ACTIVE_TEXTURE), cm: g(gl.COLOR_WRITEMASK), dm: g(gl.DEPTH_WRITEMASK),
      blend: on(gl.BLEND), depth: on(gl.DEPTH_TEST), cull: on(gl.CULL_FACE), scissor: on(gl.SCISSOR_TEST), stencil: on(gl.STENCIL_TEST) };
  }
  restore(gl:WebGL2RenderingContext, s:SavedGL):void {
    const set = (k:number, v:boolean) => v ? gl.enable(k) : gl.disable(k);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.fb); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.rfb); gl.viewport(s.vp[0]!, s.vp[1]!, s.vp[2]!, s.vp[3]!); gl.useProgram(s.prog); gl.bindVertexArray(s.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex0); gl.activeTexture(s.unit);
    gl.colorMask(...s.cm); gl.depthMask(s.dm);
    set(gl.BLEND, s.blend); set(gl.DEPTH_TEST, s.depth); set(gl.CULL_FACE, s.cull); set(gl.SCISSOR_TEST, s.scissor); set(gl.STENCIL_TEST, s.stencil);
  }
  dispose(gl:WebGL2RenderingContext):void { if (this.tex) gl.deleteTexture(this.tex); if (this.p) gl.deleteProgram(this.p); if (this.vao) gl.deleteVertexArray(this.vao); this.tex = this.p = this.vao = null; this.w = this.h = 0 }
}
