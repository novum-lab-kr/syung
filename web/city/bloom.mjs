// web/city/bloom.mts
var VS = `#version 300 es
out vec2 v_uv;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
var FS_PRE = `#version 300 es
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
var FS_DOWN = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_src; uniform vec2 u_texel; out vec4 o;
void main(){
  vec2 d = u_texel;
  vec3 c = texture(u_src, v_uv).rgb * 4.;
  c += texture(u_src, v_uv - d).rgb + texture(u_src, v_uv + d).rgb + texture(u_src, v_uv + vec2(d.x, -d.y)).rgb + texture(u_src, v_uv - vec2(d.x, -d.y)).rgb;
  o = vec4(c / 8., 1.);
}`;
var FS_UP = `#version 300 es
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
var FS_OUT = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_src; uniform float u_k; out vec4 o;
void main(){
  vec3 g = min(texture(u_src, v_uv).rgb * u_k, vec3(1.));
  float a = max(g.r, max(g.g, g.b));
  if (a < .002) discard;
  o = vec4(g, a);
}`;
var MAX_PX = 8294400;
function program(gl, fs) {
	const sh = (t, s) => {
		const x = gl.createShader(t);
		gl.shaderSource(x, s);
		gl.compileShader(x);
		if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) {
			const m = gl.getShaderInfoLog(x);
			gl.deleteShader(x);
			throw Error("night-bloom shader: " + m);
		}
		return x;
	};
	const p = gl.createProgram(), a = sh(gl.VERTEX_SHADER, VS), b = sh(gl.FRAGMENT_SHADER, fs);
	gl.attachShader(p, a);
	gl.attachShader(p, b);
	gl.linkProgram(p);
	gl.deleteShader(a);
	gl.deleteShader(b);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
		const m = gl.getProgramInfoLog(p);
		gl.deleteProgram(p);
		throw Error("night-bloom link: " + m);
	}
	const u = {};
	for (const k of [
		"u_src",
		"u_texel",
		"u_th",
		"u_tint",
		"u_k"
	]) u[k] = gl.getUniformLocation(p, k);
	return {
		p,
		u
	};
}
var NightBloom = class {
	init(gl) {
		this.gl = gl;
		this.broken = false;
		try {
			this.pre = program(gl, FS_PRE);
			this.down = program(gl, FS_DOWN);
			this.up = program(gl, FS_UP);
			this.out = program(gl, FS_OUT);
		} catch (e) {
			console.warn("night-bloom: off", e);
			this.broken = true;
			for (const P of [
				this.pre,
				this.down,
				this.up,
				this.out
			]) if (P) gl.deleteProgram(P.p);
			this.pre = this.down = this.up = this.out = null;
			return;
		}
		this.vao = gl.createVertexArray();
		this.half = !!gl.getExtension("EXT_color_buffer_float");
		this.src = null;
		this.chain = [];
		this.w = 0;
		this.h = 0;
	}
	tex(gl, w, h, half) {
		const t = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, t);
		if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
		else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		for (const [k, v] of [
			[gl.TEXTURE_MIN_FILTER, gl.LINEAR],
			[gl.TEXTURE_MAG_FILTER, gl.LINEAR],
			[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
			[gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]
		]) gl.texParameteri(gl.TEXTURE_2D, k, v);
		return t;
	}
	resize(gl, w, h, levels) {
		if (w === this.w && h === this.h && levels === this.chain.length) return;
		this.free(gl);
		this.w = w;
		this.h = h;
		this.src = this.tex(gl, w, h, false);
		let cw = Math.ceil(w / 2), ch = Math.ceil(h / 2);
		for (let i = 0; i < levels; i++) {
			cw = Math.max(1, Math.ceil(cw / 2));
			ch = Math.max(1, Math.ceil(ch / 2));
			const t = this.tex(gl, cw, ch, this.half), fb = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
			if (i === 0 && this.half && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				gl.deleteFramebuffer(fb);
				gl.deleteTexture(t);
				this.half = false;
				this.w = 0;
				this.resize(gl, w, h, levels);
				return;
			}
			this.chain.push({
				t,
				fb,
				w: cw,
				h: ch
			});
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}
	pass(gl, P, src, dst, texel) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : this.outFb);
		gl.viewport(0, 0, dst ? dst.w : this.w, dst ? dst.h : this.h);
		gl.useProgram(P.p);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, src);
		gl.uniform1i(P.u.u_src, 0);
		if (P.u.u_texel && texel) gl.uniform2f(P.u.u_texel, texel[0], texel[1]);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}
	render(gl, { strength = 1.2, threshold = .72, knee = .06, levels = 4, tint = [
		1,
		1,
		1
	], spread = 1 } = {}) {
		const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
		if (this.broken || W < 16 || H < 16 || W * H > MAX_PX) return;
		const saved = this.save(gl);
		gl.activeTexture(gl.TEXTURE0);
		levels = Math.max(2, Math.min(5, levels | 0));
		this.resize(gl, W, H, levels);
		gl.bindFramebuffer(gl.FRAMEBUFFER, saved.fb);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.src);
		gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.disable(gl.SCISSOR_TEST);
		gl.disable(gl.STENCIL_TEST);
		gl.depthMask(false);
		gl.colorMask(true, true, true, true);
		gl.disable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.bindVertexArray(this.vao);
		const C = this.chain;
		this.outFb = saved.fb;
		gl.useProgram(this.pre.p);
		gl.uniform3f(this.pre.u.u_th, threshold, Math.max(.001, knee), 0);
		gl.uniform3fv(this.pre.u.u_tint, tint);
		this.pass(gl, this.pre, this.src, C[0], null);
		for (let i = 1; i < C.length; i++) this.pass(gl, this.down, C[i - 1].t, C[i], [.5 / C[i - 1].w, .5 / C[i - 1].h]);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		for (let i = C.length - 1; i > 0; i--) {
			gl.useProgram(this.up.p);
			gl.uniform1f(this.up.u.u_k, spread);
			this.pass(gl, this.up, C[i].t, C[i - 1], [.5 / C[i].w, .5 / C[i].h]);
		}
		gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.useProgram(this.out.p);
		gl.uniform1f(this.out.u.u_k, strength / (1 + spread * (C.length - 1) * .5));
		this.pass(gl, this.out, C[0].t, null, null);
		this.restore(gl, saved);
	}
	save(gl) {
		const g = (k) => gl.getParameter(k), on = (k) => gl.isEnabled(k);
		gl.activeTexture(gl.TEXTURE0);
		const tex0 = g(gl.TEXTURE_BINDING_2D);
		return {
			fb: g(gl.DRAW_FRAMEBUFFER_BINDING),
			rfb: g(gl.READ_FRAMEBUFFER_BINDING),
			tex0,
			vp: g(gl.VIEWPORT),
			prog: g(gl.CURRENT_PROGRAM),
			vao: g(gl.VERTEX_ARRAY_BINDING),
			unit: g(gl.ACTIVE_TEXTURE),
			cm: g(gl.COLOR_WRITEMASK),
			dm: g(gl.DEPTH_WRITEMASK),
			blend: on(gl.BLEND),
			depth: on(gl.DEPTH_TEST),
			cull: on(gl.CULL_FACE),
			scissor: on(gl.SCISSOR_TEST),
			stencil: on(gl.STENCIL_TEST),
			bf: [
				g(gl.BLEND_SRC_RGB),
				g(gl.BLEND_DST_RGB),
				g(gl.BLEND_SRC_ALPHA),
				g(gl.BLEND_DST_ALPHA)
			],
			be: [g(gl.BLEND_EQUATION_RGB), g(gl.BLEND_EQUATION_ALPHA)]
		};
	}
	restore(gl, s) {
		const set = (k, v) => v ? gl.enable(k) : gl.disable(k);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.fb);
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.rfb);
		gl.viewport(s.vp[0], s.vp[1], s.vp[2], s.vp[3]);
		gl.useProgram(s.prog);
		gl.bindVertexArray(s.vao);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, s.tex0);
		gl.activeTexture(s.unit);
		gl.colorMask(...s.cm);
		gl.depthMask(s.dm);
		gl.blendFuncSeparate(...s.bf);
		gl.blendEquationSeparate(...s.be);
		set(gl.BLEND, s.blend);
		set(gl.DEPTH_TEST, s.depth);
		set(gl.CULL_FACE, s.cull);
		set(gl.SCISSOR_TEST, s.scissor);
		set(gl.STENCIL_TEST, s.stencil);
	}
	free(gl) {
		if (this.src) gl.deleteTexture(this.src);
		for (const c of this.chain) {
			gl.deleteTexture(c.t);
			gl.deleteFramebuffer(c.fb);
		}
		this.src = null;
		this.chain = [];
		this.w = this.h = 0;
	}
	dispose(gl) {
		if (this.broken) {
			if (this.vao) gl.deleteVertexArray(this.vao);
			this.vao = null;
			return;
		}
		this.free(gl);
		for (const P of [
			this.pre,
			this.down,
			this.up,
			this.out
		]) if (P) gl.deleteProgram(P.p);
		if (this.vao) gl.deleteVertexArray(this.vao);
		this.pre = this.down = this.up = this.out = this.vao = null;
	}
};
export { NightBloom };
