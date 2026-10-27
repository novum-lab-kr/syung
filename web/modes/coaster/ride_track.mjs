import { PARK_DEFAULTS } from "../basic/park.mjs";
// web/modes/coaster/ride_track.mjs
var SLEEPER_M = .6;
var STRIDE = 7;
var hex = (h) => [
	1,
	3,
	5
].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
var SUN = ((v) => {
	const l = Math.hypot(...v);
	return v.map((c) => c / l);
})([
	-.3,
	.46,
	.84
]);
function buildRideTrack(frames, { mpu, origin, pack = PARK_DEFAULTS }) {
	const T = pack.rideTrack, out = new Float32Array(Math.max(1, frames.length) * 66 * STRIDE + STRIDE * 6);
	let o = 0;
	const g = T.gaugeM / 2, rw = T.railHeadM / 2, rTop = T.railTopM, rBot = T.sleeperTopM, sTop = T.sleeperTopM, sBot = T.sleeperBottomM, sl = T.sleeperLengthM / 2, sw = T.sleeperWidthM / 2;
	const at = (f, a, u, h) => [
		0,
		1,
		2
	].map((k) => f.p[k] + (f.R[k] * a + f.U[k] * h + f.F[k] * u) * mpu - (k < 2 ? origin[k] : 0));
	const lit = (f, n, rgb, k) => {
		const N = [
			0,
			1,
			2
		].map((i) => f.R[i] * n[0] + f.F[i] * n[1] + f.U[i] * n[2]), d = Math.max(0, N[0] * SUN[0] + N[1] * SUN[1] + N[2] * SUN[2]);
		return rgb.map((c) => c * k * (.64 + .36 * d));
	};
	const vtx = (p, c, fade) => {
		out[o++] = p[0];
		out[o++] = p[1];
		out[o++] = p[2];
		out[o++] = c[0];
		out[o++] = c[1];
		out[o++] = c[2];
		out[o++] = fade;
	};
	const quad = (a, b, c, d, col, fade) => {
		for (const p of [
			a,
			b,
			c,
			a,
			c,
			d
		]) vtx(p, col, fade);
	};
	const steel = hex(T.rail), head = hex(T.railHead), conc = hex(T.sleeper);
	const near = T.sleeperM ?? 1e9, every = Math.max(1, T.railEvery ?? 1);
	for (let i = 0; i < frames.length; i++) {
		const f = frames[i];
		if (f.d == null || f.d <= near) {
			const S = (a, u, h) => at(f, a, u, h);
			quad(S(-sl, -sw, sTop), S(sl, -sw, sTop), S(sl, sw, sTop), S(-sl, sw, sTop), lit(f, [
				0,
				0,
				1
			], conc, 1), 1);
			for (const e of [-1, 1]) {
				quad(S(-sl, e * sw, sBot), S(sl, e * sw, sBot), S(sl, e * sw, sTop), S(-sl, e * sw, sTop), lit(f, [
					0,
					e,
					0
				], conc, .9), 1);
				quad(S(e * sl, -sw, sBot), S(e * sl, sw, sBot), S(e * sl, sw, sTop), S(e * sl, -sw, sTop), lit(f, [
					e,
					0,
					0
				], conc, .85), 1);
			}
		}
		if (f.end || i % every && !frames[i + 1]?.end) continue;
		let j = i + 1;
		while (j < frames.length && j < i + every && !frames[j].end) j++;
		if (j >= frames.length) continue;
		const n = frames[j];
		for (const e of [-1, 1]) {
			const A = (a, h) => at(f, e * g + a, 0, h), B = (a, h) => at(n, e * g + a, 0, h);
			quad(A(-rw, rTop), B(-rw, rTop), B(rw, rTop), A(rw, rTop), lit(f, [
				0,
				0,
				1
			], head, 1), 0);
			for (const s of [-1, 1]) quad(A(s * rw, rBot), B(s * rw, rBot), B(s * rw, rTop), A(s * rw, rTop), lit(f, [
				s,
				0,
				0
			], steel, 1), 0);
		}
	}
	return out.subarray(0, o);
}
var VS = `#version 300 es
in vec3 a_p;in vec3 a_c;in float a_f;uniform mat4 u_matrix;uniform vec3 u_eye;uniform float u_mpu;
out vec3 v_c;out float v_f,v_d;
void main(){gl_Position=u_matrix*vec4(a_p,1.);v_c=a_c;v_f=a_f;v_d=length(a_p-u_eye)/u_mpu;}`;
var FS = `#version 300 es
precision highp float;in vec3 v_c;in float v_f,v_d;uniform vec2 u_fade;uniform float u_tint;out vec4 o;
void main(){float a=1.-v_f*smoothstep(u_fade.x,u_fade.y,v_d);if(a<.01)discard;o=vec4(v_c*u_tint*a,a);}`;
var RideTrack = class {
	constructor(pack = PARK_DEFAULTS) {
		this.pack = pack;
		this.n = 0;
		this.M = /* @__PURE__ */ new Float32Array(16);
	}
	init(gl) {
		const sh = (t, s) => {
			const x = gl.createShader(t);
			gl.shaderSource(x, s);
			gl.compileShader(x);
			if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(x));
			return x;
		};
		const p = gl.createProgram();
		gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
		gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
		this.p = p;
		this.u = Object.fromEntries([
			"u_matrix",
			"u_eye",
			"u_mpu",
			"u_fade",
			"u_tint"
		].map((k) => [k, gl.getUniformLocation(p, k)]));
		this.buf = gl.createBuffer();
		this.va = gl.createVertexArray();
		gl.bindVertexArray(this.va);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
		for (const [name, size, off] of [
			[
				"a_p",
				3,
				0
			],
			[
				"a_c",
				3,
				3
			],
			[
				"a_f",
				1,
				6
			]
		]) {
			const l = gl.getAttribLocation(p, name);
			gl.enableVertexAttribArray(l);
			gl.vertexAttribPointer(l, size, gl.FLOAT, false, STRIDE * 4, off * 4);
		}
		gl.bindVertexArray(null);
		this.gl = gl;
	}
	set(gl, frames, mpu, origin) {
		if (!this.p) this.init(gl);
		const d = buildRideTrack(frames, {
			mpu,
			origin,
			pack: this.pack
		});
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
		gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
		this.n = d.length / STRIDE;
		this.origin = origin;
		this.mpu = mpu;
	}
	clear() {
		this.n = 0;
	}
	draw(gl, M, eye, dark) {
		if (!this.n) return;
		const [ox, oy] = this.origin, MT = this.M;
		MT.set(M);
		for (let r = 0; r < 4; r++) MT[12 + r] = M[r] * ox + M[4 + r] * oy + M[12 + r];
		const T = this.pack.rideTrack;
		gl.useProgram(this.p);
		gl.bindVertexArray(this.va);
		gl.uniformMatrix4fv(this.u.u_matrix, false, MT);
		gl.uniform3f(this.u.u_eye, eye[0] - ox, eye[1] - oy, eye[2]);
		gl.uniform1f(this.u.u_mpu, this.mpu);
		gl.uniform2f(this.u.u_fade, T.sleeperFadeM[0], T.sleeperFadeM[1]);
		gl.uniform1f(this.u.u_tint, dark ? T.darkTint : 1);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.drawArrays(gl.TRIANGLES, 0, this.n);
		gl.bindVertexArray(null);
	}
	dispose(gl) {
		if (this.buf) gl.deleteBuffer(this.buf);
		if (this.va) gl.deleteVertexArray(this.va);
		if (this.p) gl.deleteProgram(this.p);
		this.p = null;
		this.n = 0;
	}
};
export { RideTrack, SLEEPER_M, buildRideTrack };
