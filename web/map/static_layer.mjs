// web/map/static_layer.mts
var VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
var FS = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D u_c, u_d; out vec4 o;
void main(){ ivec2 q = ivec2(gl_FragCoord.xy); o = texelFetch(u_c, q, 0); gl_FragDepth = texelFetch(u_d, q, 0).r; }`;
var StaticLayer = class {
	constructor(gl) {
		this.gl = gl;
		this.broken = false;
		this.w = 0;
		this.h = 0;
		this.fbo = this.color = this.depth = this.prog = this.vao = null;
		this.fmt = null;
		this.key = null;
		this.at = 0;
	}
	has(key, w, h) {
		const old = this.key;
		return !this.broken && !!old && this.w === w && this.h === h && old.length === key.length && old.every((v, i) => Object.is(v, key[i]));
	}
	invalidate() {
		this.key = null;
	}
	snapshot(key, w, h, now) {
		const gl = this.gl;
		this.key = null;
		if (this.broken) return false;
		if (this.w !== w || this.h !== h || !this.fbo) this.alloc(w, h);
		const tries = this.fmt ? [this.fmt] : [
			[
				gl.DEPTH_COMPONENT24,
				gl.DEPTH_COMPONENT,
				gl.UNSIGNED_INT
			],
			[
				gl.DEPTH24_STENCIL8,
				gl.DEPTH_STENCIL,
				gl.UNSIGNED_INT_24_8
			],
			[
				gl.DEPTH_COMPONENT16,
				gl.DEPTH_COMPONENT,
				gl.UNSIGNED_SHORT
			],
			[
				gl.DEPTH_COMPONENT32F,
				gl.DEPTH_COMPONENT,
				gl.FLOAT
			]
		];
		while (gl.getError() !== gl.NO_ERROR);
		let ok = false;
		for (const fmt of tries) {
			this.depthTex(fmt);
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
			gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo);
			if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
				gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
				ok = gl.getError() === gl.NO_ERROR;
			}
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			if (ok) {
				this.fmt = fmt;
				break;
			}
			while (gl.getError() !== gl.NO_ERROR);
		}
		if (!ok) {
			this.broken = true;
			this.dispose();
			console.warn("static-layer: off — 깊이 형식이 맞지 않아 지금 길로 그린다");
			return false;
		}
		this.key = key;
		this.at = now;
		return true;
	}
	restore() {
		const gl = this.gl;
		if (!this.prog) {
			const sh = (type, src) => {
				const s = gl.createShader(type);
				gl.shaderSource(s, src);
				gl.compileShader(s);
				return s;
			};
			const p = gl.createProgram();
			gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
			gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
			gl.linkProgram(p);
			if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
				console.error("static-layer: shader —", gl.getProgramInfoLog(p));
				this.broken = true;
				return false;
			}
			this.prog = p;
			this.vao = gl.createVertexArray();
			gl.useProgram(p);
			gl.uniform1i(gl.getUniformLocation(p, "u_c"), 0);
			gl.uniform1i(gl.getUniformLocation(p, "u_d"), 1);
		}
		gl.useProgram(this.prog);
		gl.bindVertexArray(this.vao);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.color);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.depth);
		gl.disable(gl.BLEND);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.ALWAYS);
		gl.depthMask(true);
		gl.colorMask(true, true, true, true);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindVertexArray(null);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		return true;
	}
	alloc(w, h) {
		const gl = this.gl;
		this.free();
		this.w = w;
		this.h = h;
		this.fbo = gl.createFramebuffer();
		this.color = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.color);
		gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
		this.params();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.color, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
	depthTex(fmt) {
		const gl = this.gl;
		if (this.depth && this.fmt === fmt) return;
		if (this.depth) gl.deleteTexture(this.depth);
		this.depth = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.depth);
		gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], this.w, this.h, 0, fmt[1], fmt[2], null);
		this.params();
		const at = fmt[1] === gl.DEPTH_STENCIL ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, null, 0);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, at, gl.TEXTURE_2D, this.depth, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
	params() {
		const gl = this.gl;
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}
	free() {
		const gl = this.gl;
		if (this.fbo) gl.deleteFramebuffer(this.fbo);
		if (this.color) gl.deleteTexture(this.color);
		if (this.depth) gl.deleteTexture(this.depth);
		this.fbo = this.color = this.depth = null;
		this.w = this.h = 0;
		this.key = null;
	}
	dispose() {
		const gl = this.gl;
		this.free();
		if (this.prog) gl.deleteProgram(this.prog);
		if (this.vao) gl.deleteVertexArray(this.vao);
		this.prog = this.vao = null;
	}
};
export { StaticLayer };
