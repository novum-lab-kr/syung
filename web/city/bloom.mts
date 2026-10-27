// 밤 빛 번짐(블룸) — 도시 모드(심시티 · 조선 · 롤코)의 밤에만. 열차 캔버스에 그린 3D(건물 창 · 간판 · 가로등 · 차 불빛 · 롤코 전구)를
// 한 장 베껴, 밝은 곳만 걸러 ¼ 로 줄이고(텍셀마다 문턱 — 작은 창이 어두운 이웃과 먼저 섞여 사라지지 않게) 반씩 더 흐린 뒤(dual filter: ¼ → … → 1/32)
// 다시 키우며 모아, 그 위에 '스크린'으로 살짝 겹친다.
// 불빛이 공기 속으로 번져 '켜진 것처럼' 보이게 — 창 하나하나가 아니라 번화가 · 큰길이 빛 덩어리로 읽힌다.
//
//   const bloom = new NightBloom(); bloom.init(gl);
//   bloom.render(gl, {strength, threshold, knee, levels, tint});   // 3D 를 다 그린 뒤, 출구 기둥 · 이름표(글자) 전에
//   bloom.dispose(gl);                                             // 낮 · 기본 모드 · 휴대폰으로 가면 부르는 쪽이 치운다
//
// 버퍼: 화면 크기 베낌 한 장(RGBA8, 기본 버퍼의 다중 샘플은 베낄 때 풀린다) + ¼ 이하 사슬(반정밀 부동소수가 되면 그것으로 — 흐린 끝의 띠 없이).
// 문턱은 '밝기(휘도, 따뜻한 색 ×1.15 · 차가운 색 ×.85)와 가장 진한 채널 × 0.85 중 큰 것': 회청색 글자 · 벽은 빠지고, 켜진 창과 네온 간판은 걸린다.
// GL 상태: 바꾼 것(프레임버퍼 · 뷰포트 · 프로그램 · VAO · 텍스처 · 섞기 · 깊이 · 스텐실 · 색 마스크)을 끝에 되돌린다 — 열차 캔버스의 다음 그리기가 그대로 이어진다.
// 설정 값은 팩의 night.bloom(web/modes/basic/city.mjs). 데이터만 받는다 — 모드 이름을 묻지 않는다.

const VS = `#version 300 es
out vec2 v_uv;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;   // 화면을 덮는 삼각형 하나

// 걸러 내며 ¼ 로: 4×4 텍셀을 하나씩 읽어 문턱(부드러운 무릎)을 넘은 몫만 더한다
const FS_PRE = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_src; uniform vec3 u_th; uniform vec3 u_tint; out vec4 o;
vec3 pass(vec3 c){
  float warm = smoothstep(-.05, .25, c.r - c.b), b = max(dot(c, vec3(.2126, .7152, .0722)) * mix(.85, 1.15, warm), .85 * max(c.r, max(c.g, c.b)));   // 따뜻한 불빛은 더, 차가운 회청색(바탕 글자)은 덜
  return c * smoothstep(u_th.x - u_th.y, u_th.x + u_th.y, b);   // 문턱을 넘은 픽셀은 색 그대로(초과분만 쓰면 겨우 넘는 작은 창이 0 에 가까웠다)
}
void main(){
  ivec2 sz = textureSize(u_src, 0), p0 = ivec2(gl_FragCoord.xy) * 4; vec3 c = vec3(0.);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) c += pass(texelFetch(u_src, min(p0 + ivec2(x, y), sz - 1), 0).rgb);
  o = vec4(c / 16. * u_tint, 1.);
}`;
// 반으로(dual filter down): 가운데 넷 몫 + 대각선 넷
const FS_DOWN = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_src; uniform vec2 u_texel; out vec4 o;
void main(){
  vec2 d = u_texel;
  vec3 c = texture(u_src, v_uv).rgb * 4.;
  c += texture(u_src, v_uv - d).rgb + texture(u_src, v_uv + d).rgb + texture(u_src, v_uv + vec2(d.x, -d.y)).rgb + texture(u_src, v_uv - vec2(d.x, -d.y)).rgb;
  o = vec4(c / 8., 1.);
}`;
// 두 배로(dual filter up, 천막 모양 여덟 탭): 한 단 큰 버퍼에 더한다(ONE, ONE)
const FS_UP = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_src; uniform vec2 u_texel; uniform float u_k; out vec4 o;
void main(){
  vec2 d = u_texel;
  vec3 c = texture(u_src, v_uv + vec2(-2. * d.x, 0.)).rgb + texture(u_src, v_uv + vec2(2. * d.x, 0.)).rgb
         + texture(u_src, v_uv + vec2(0., -2. * d.y)).rgb + texture(u_src, v_uv + vec2(0., 2. * d.y)).rgb;
  c += (texture(u_src, v_uv + vec2(-d.x, d.y)).rgb + texture(u_src, v_uv + vec2(d.x, d.y)).rgb
      + texture(u_src, v_uv + vec2(-d.x, -d.y)).rgb + texture(u_src, v_uv + vec2(d.x, -d.y)).rgb) * 2.;
  o = vec4(c / 12. * u_k, 1.);
}`;
// 화면에 겹치기: 스크린(g + 밑 × (1 − g)) — 미리 곱한 알파 그대로(알파 = g 의 가장 큰 값). 지도 캔버스 위의 빈 곳도 같은 식으로 밝아진다
const FS_OUT = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_src; uniform float u_k; out vec4 o;
void main(){
  vec3 g = min(texture(u_src, v_uv).rgb * u_k, vec3(1.));
  float a = max(g.r, max(g.g, g.b));
  if (a < .002) discard;
  o = vec4(g, a);
}`;

const MAX_PX = 3840 * 2160;
type Uniform = 'u_src' | 'u_texel' | 'u_th' | 'u_tint' | 'u_k';
// 셰이더 프로그램 하나와 그 uniform 자리
interface Prog { p:WebGLProgram; u:Record<Uniform, WebGLUniformLocation | null> }
// ¼ 이하 사슬의 한 단: 텍스처 · 그리는 프레임버퍼 · 크기
interface Level { t:WebGLTexture; fb:WebGLFramebuffer; w:number; h:number }
// render 가 바꾸고 끝에 되돌리는 GL 상태
interface SavedGL {
  fb:WebGLFramebuffer | null; rfb:WebGLFramebuffer | null; tex0:WebGLTexture | null; vp:Int32Array; prog:WebGLProgram | null; vao:WebGLVertexArrayObject | null; unit:number;
  cm:[boolean, boolean, boolean, boolean]; dm:boolean; blend:boolean; depth:boolean; cull:boolean; scissor:boolean; stencil:boolean;
  bf:[number, number, number, number]; be:[number, number];
}
// 팩 night.bloom 에서 overlay · 본체가 골라 넘기는 값
export interface BloomOptions { strength?:number; threshold?:number; knee?:number; levels?:number; tint?:number[]; spread?:number }
function program(gl:WebGL2RenderingContext, fs:string):Prog {
  const sh = (t:number, s:string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) { const m = gl.getShaderInfoLog(x); gl.deleteShader(x); throw Error('night-bloom shader: ' + m) } return x };
  const p = gl.createProgram(), a = sh(gl.VERTEX_SHADER, VS), b = sh(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p); gl.deleteShader(a); gl.deleteShader(b);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const m = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw Error('night-bloom link: ' + m) }
  const u = {} as Record<Uniform, WebGLUniformLocation | null>; for (const k of ['u_src', 'u_texel', 'u_th', 'u_tint', 'u_k'] as const) u[k] = gl.getUniformLocation(p, k);
  return { p, u };
}

export class NightBloom {
  // 필드는 선언만(declare — 실행 코드 없음, 값은 init 이 넣는다)
  declare gl:WebGL2RenderingContext; declare broken:boolean; declare pre:Prog | null; declare down:Prog | null; declare up:Prog | null; declare out:Prog | null;
  declare vao:WebGLVertexArrayObject | null; declare half:boolean; declare src:WebGLTexture | null; declare chain:Level[]; declare w:number; declare h:number; declare outFb:WebGLFramebuffer | null;
  init(gl:WebGL2RenderingContext):void {
    this.gl = gl; this.broken = false;
    try { this.pre = program(gl, FS_PRE); this.down = program(gl, FS_DOWN); this.up = program(gl, FS_UP); this.out = program(gl, FS_OUT) }
    catch (e) { console.warn('night-bloom: off', e); this.broken = true; for (const P of [this.pre, this.down, this.up, this.out]) if (P) gl.deleteProgram(P.p); this.pre = this.down = this.up = this.out = null; return }   // 셰이더가 안 되면 번짐 없이 그대로(다음 프레임도 조용히)
    this.vao = gl.createVertexArray();
    this.half = !!gl.getExtension('EXT_color_buffer_float');   // 반정밀 버퍼에 그릴 수 있으면(WebGL2 + 확장) 흐린 끝의 띠가 없다
    this.src = null; this.chain = []; this.w = 0; this.h = 0;
  }
  tex(gl:WebGL2RenderingContext, w:number, h:number, half:boolean):WebGLTexture {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  // 화면 크기가 바뀌면 버퍼를 다시(베낌 한 장 + ½ … 사슬)
  resize(gl:WebGL2RenderingContext, w:number, h:number, levels:number):void {
    if (w === this.w && h === this.h && levels === this.chain.length) return;
    this.free(gl); this.w = w; this.h = h;
    this.src = this.tex(gl, w, h, false);
    let cw = Math.ceil(w / 2), ch = Math.ceil(h / 2);   // (첫 단은 ¼: 아래에서 한 번 더 반으로)
    for (let i = 0; i < levels; i++) {
      cw = Math.max(1, Math.ceil(cw / 2)); ch = Math.max(1, Math.ceil(ch / 2));
      const t = this.tex(gl, cw, ch, this.half), fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (i === 0 && this.half && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(t); this.half = false; this.w = 0; this.resize(gl, w, h, levels); return }
      this.chain.push({ t, fb, w: cw, h: ch });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  pass(gl:WebGL2RenderingContext, P:Prog, src:WebGLTexture | null, dst:Level | null | undefined, texel:[number, number] | null):void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : this.outFb); gl.viewport(0, 0, dst ? dst.w : this.w, dst ? dst.h : this.h);
    gl.useProgram(P.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(P.u.u_src, 0);
    if (P.u.u_texel && texel) gl.uniform2f(P.u.u_texel, texel[0], texel[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // 지금 그림(기본 버퍼)에서: { strength 겹치는 세기, threshold 문턱(0..1), knee 무릎, levels 단 수(¼ 부터 2~5), tint 번짐 색 곱 }
  render(gl:WebGL2RenderingContext, { strength = 1.2, threshold = .72, knee = .06, levels = 4, tint = [1, 1, 1], spread = 1 }:BloomOptions = {}):void {
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; if (this.broken || W < 16 || H < 16 || W * H > MAX_PX) return;   // (4K 보다 큰 버퍼는 건너뛴다: 베낌 한 장만 33 MB)
    const saved = this.save(gl); gl.activeTexture(gl.TEXTURE0);
    levels = Math.max(2, Math.min(5, levels | 0)); this.resize(gl, W, H, levels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, saved.fb);   // 그린 곳(MapLibre 는 기본 버퍼)에서 베낀다(읽기 · 그리기 둘 다 거기로)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.src); gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);   // 3D 를 다 그린 지금 그림
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.depthMask(false); gl.colorMask(true, true, true, true); gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.bindVertexArray(this.vao);
    const C = this.chain; this.outFb = saved.fb;
    gl.useProgram(this.pre!.p); gl.uniform3f(this.pre!.u.u_th, threshold, Math.max(1e-3, knee), 0); gl.uniform3fv(this.pre!.u.u_tint, tint);
    this.pass(gl, this.pre!, this.src, C[0], null);
    for (let i = 1; i < C.length; i++) this.pass(gl, this.down!, C[i - 1]!.t, C[i], [.5 / C[i - 1]!.w, .5 / C[i - 1]!.h]);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);   // 키우며 한 단 큰 버퍼에 더한다: 넓은 번짐 + 좁은 번짐
    for (let i = C.length - 1; i > 0; i--) { gl.useProgram(this.up!.p); gl.uniform1f(this.up!.u.u_k, spread); this.pass(gl, this.up!, C[i]!.t, C[i - 1], [.5 / C[i]!.w, .5 / C[i]!.h]) }
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // 스크린
    gl.useProgram(this.out!.p); gl.uniform1f(this.out!.u.u_k, strength / (1 + spread * (C.length - 1) * .5));   // 단을 더한 만큼 나눠 세기를 단 수와 떼어 둔다
    this.pass(gl, this.out!, C[0]!.t, null, null);
    this.restore(gl, saved);
  }
  save(gl:WebGL2RenderingContext):SavedGL {
    const g = (k:number) => gl.getParameter(k), on = (k:number) => gl.isEnabled(k);
    gl.activeTexture(gl.TEXTURE0); const tex0 = g(gl.TEXTURE_BINDING_2D);
    return { fb: g(gl.DRAW_FRAMEBUFFER_BINDING), rfb: g(gl.READ_FRAMEBUFFER_BINDING), tex0, vp: g(gl.VIEWPORT), prog: g(gl.CURRENT_PROGRAM), vao: g(gl.VERTEX_ARRAY_BINDING), unit: g(gl.ACTIVE_TEXTURE), cm: g(gl.COLOR_WRITEMASK), dm: g(gl.DEPTH_WRITEMASK),
      blend: on(gl.BLEND), depth: on(gl.DEPTH_TEST), cull: on(gl.CULL_FACE), scissor: on(gl.SCISSOR_TEST), stencil: on(gl.STENCIL_TEST),
      bf: [g(gl.BLEND_SRC_RGB), g(gl.BLEND_DST_RGB), g(gl.BLEND_SRC_ALPHA), g(gl.BLEND_DST_ALPHA)], be: [g(gl.BLEND_EQUATION_RGB), g(gl.BLEND_EQUATION_ALPHA)] };
  }
  restore(gl:WebGL2RenderingContext, s:SavedGL):void {
    const set = (k:number, v:boolean) => v ? gl.enable(k) : gl.disable(k);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.fb); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.rfb); gl.viewport(s.vp[0]!, s.vp[1]!, s.vp[2]!, s.vp[3]!); gl.useProgram(s.prog); gl.bindVertexArray(s.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex0); gl.activeTexture(s.unit);
    gl.colorMask(...s.cm); gl.depthMask(s.dm); gl.blendFuncSeparate(...s.bf); gl.blendEquationSeparate(...s.be);
    set(gl.BLEND, s.blend); set(gl.DEPTH_TEST, s.depth); set(gl.CULL_FACE, s.cull); set(gl.SCISSOR_TEST, s.scissor); set(gl.STENCIL_TEST, s.stencil);
  }
  free(gl:WebGL2RenderingContext):void {
    if (this.src) gl.deleteTexture(this.src); for (const c of this.chain) { gl.deleteTexture(c.t); gl.deleteFramebuffer(c.fb) }
    this.src = null; this.chain = []; this.w = this.h = 0;
  }
  dispose(gl:WebGL2RenderingContext):void { if (this.broken) { if (this.vao) gl.deleteVertexArray(this.vao); this.vao = null; return } this.free(gl); for (const P of [this.pre, this.down, this.up, this.out]) if (P) gl.deleteProgram(P.p); if (this.vao) gl.deleteVertexArray(this.vao); this.pre = this.down = this.up = this.out = this.vao = null }
}
