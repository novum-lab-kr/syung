// 열차 캔버스의 정적 층 캐시(심시티 성능 ⑤ — 2026-11-27): 카메라가 멈춰 있는 동안 도시 생활의 정적 몫(나무 · 가로등 · 횡단보도 · 밤 웅덩이) ·
// 고가 · 랜드마크를 한 번 그려 색 + 깊이 텍스처에 담아 두고, 다음 장부터는 사각형 하나로 되살린다(그 뒤 건물 지우개 · 움직이는 것은 매 장).
// 기본 프레임버퍼(MSAA)를 blitFramebuffer 로 풀어 담는다 — 깊이 형식이 안 맞아 GL 오류면 broken 이 되어 다시는 쓰지 않는다(열차 캔버스는 지금 길로).
// 열차 캔버스(map/overlay.mts)가 쓰고, 본체가 import 해 deps 로 넘긴다(overlay 는 다른 화면 파일을 import 하지 않는다).

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D u_c, u_d; out vec4 o;
void main(){ ivec2 q = ivec2(gl_FragCoord.xy); o = texelFetch(u_c, q, 0); gl_FragDepth = texelFetch(u_d, q, 0).r; }`;

// 기본 프레임버퍼의 깊이와 같은 형식이어야 blit 이 된다 — 브라우저 · 기기마다 달라 앞에서부터 해 본다
type DepthFormat = [internal:number, format:number, type:number];

export class StaticLayer {
  declare gl:WebGL2RenderingContext; declare broken:boolean; declare w:number; declare h:number;
  declare fbo:WebGLFramebuffer | null; declare color:WebGLTexture | null; declare depth:WebGLTexture | null;
  declare prog:WebGLProgram | null; declare vao:WebGLVertexArrayObject | null; declare fmt:DepthFormat | null;
  // 담아 둔 그림의 열쇠(같은 열쇠 · 같은 크기일 때만 되살린다)와 담은 시각(오래되면 다시 그린다)
  declare key:readonly unknown[] | null; declare at:number;
  constructor(gl:WebGL2RenderingContext) {
    this.gl = gl; this.broken = false; this.w = 0; this.h = 0; this.fbo = this.color = this.depth = this.prog = this.vao = null; this.fmt = null; this.key = null; this.at = 0;
  }
  // 열쇠가 같고 담아 둔 그림이 있으면 true
  has(key:readonly unknown[], w:number, h:number) {
    const old = this.key;
    return !this.broken && !!old && this.w === w && this.h === h && old.length === key.length && old.every((v, i) => Object.is(v, key[i]));
  }
  invalidate() { this.key = null }
  // 지금 기본 프레임버퍼(색 · 깊이)를 담는다. 실패하면 false(그 뒤로는 broken)
  snapshot(key:readonly unknown[], w:number, h:number, now:number) {
    const gl = this.gl; this.key = null;
    if (this.broken) return false;
    if (this.w !== w || this.h !== h || !this.fbo) this.alloc(w, h);
    const tries:DepthFormat[] = this.fmt ? [this.fmt] : [
      [gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT], [gl.DEPTH24_STENCIL8, gl.DEPTH_STENCIL, gl.UNSIGNED_INT_24_8],
      [gl.DEPTH_COMPONENT16, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT], [gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT]];
    while (gl.getError() !== gl.NO_ERROR) { /* 앞서 남은 오류를 비운다(이 검사에 섞이지 않게) */ }
    let ok = false;
    for (const fmt of tries) {
      this.depthTex(fmt);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo);
      if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        ok = gl.getError() === gl.NO_ERROR;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (ok) { this.fmt = fmt; break }
      while (gl.getError() !== gl.NO_ERROR) { /* 다음 형식으로 */ }
    }
    if (!ok) { this.broken = true; this.dispose(); console.warn('static-layer: off — 깊이 형식이 맞지 않아 지금 길로 그린다'); return false }
    this.key = key; this.at = now; return true;
  }
  // 담아 둔 색 · 깊이를 기본 프레임버퍼에 그대로 되살린다(섞지 않고 덮는다)
  restore() {
    const gl = this.gl;
    if (!this.prog) {
      const sh = (type:number, src:string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s };
      const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('static-layer: shader —', gl.getProgramInfoLog(p)); this.broken = true; return false }
      this.prog = p; this.vao = gl.createVertexArray();
      gl.useProgram(p); gl.uniform1i(gl.getUniformLocation(p, 'u_c'), 0); gl.uniform1i(gl.getUniformLocation(p, 'u_d'), 1);
    }
    gl.useProgram(this.prog); gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.color); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.depth);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.ALWAYS); gl.depthMask(true); gl.colorMask(true, true, true, true);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // back to what the track and the trains expect(도시 생활 · 고가가 끝에 두는 상태와 같게)
    gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null); gl.bindVertexArray(null);
    gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }
  alloc(w:number, h:number) {
    const gl = this.gl; this.free(); this.w = w; this.h = h;
    this.fbo = gl.createFramebuffer(); this.color = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.color); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h); this.params();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.color, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null);
  }
  depthTex(fmt:DepthFormat) {
    const gl = this.gl;
    if (this.depth && this.fmt === fmt) return;
    if (this.depth) gl.deleteTexture(this.depth);
    this.depth = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.depth);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], this.w, this.h, 0, fmt[1], fmt[2], null); this.params();
    const at = fmt[1] === gl.DEPTH_STENCIL ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, null, 0);   // (앞서 해 본 형식의 붙임을 뗀다)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, at, gl.TEXTURE_2D, this.depth, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null);
  }
  params() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  // 텍스처 · 프레임버퍼만 치운다(셰이더는 남긴다 — 다시 들어오면 그대로)
  free() {
    const gl = this.gl;
    if (this.fbo) gl.deleteFramebuffer(this.fbo); if (this.color) gl.deleteTexture(this.color); if (this.depth) gl.deleteTexture(this.depth);
    this.fbo = this.color = this.depth = null; this.w = this.h = 0; this.key = null;
    // (fmt 는 남긴다: 같은 기본 프레임버퍼라 다음에도 그 형식)
  }
  dispose() {
    const gl = this.gl; this.free();
    if (this.prog) gl.deleteProgram(this.prog); if (this.vao) gl.deleteVertexArray(this.vao); this.prog = this.vao = null;
  }
}
