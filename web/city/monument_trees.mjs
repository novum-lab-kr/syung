import { PALACE_AT } from "./monuments_data.mjs";
import { compileProgram } from "./traffic.mjs";
import { MU, toM } from "./life.mjs";
import { PALACE_TREES } from "./monuments_trees_data.mjs";
// web/city/monument_trees.mts
var TREE_MIN_ZOOM = 16.3;
var TREE_COLORS = [
	"#5B4A3A",
	"#3F5A40",
	"#5C8A44",
	"#7DA04E",
	"#4F7A3C",
	"#D9731F",
	"#8A5A3C"
];
var TC = {
	trunk: 0,
	pine: 1,
	round: 2,
	wide: 3,
	persimmon: 4,
	fruit: 5,
	pineBark: 6
};
var toRgb = (value) => {
	const v = parseInt(value.slice(1), 16);
	return [
		(v >> 16 & 255) / 255,
		(v >> 8 & 255) / 255,
		(v & 255) / 255
	];
};
var TREE_STRIDE = 7;
var TreeWriter = class {
	data = [];
	tri(a, b, c, kind, center) {
		const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz);
		if (len < 1e-9) return;
		nx /= len;
		ny /= len;
		nz /= len;
		if (nx * (a[0] - center[0]) + ny * (a[1] - center[1]) + nz * (a[2] - center[2]) < 0) {
			nx = -nx;
			ny = -ny;
			nz = -nz;
		}
		for (const p of [
			a,
			b,
			c
		]) this.data.push(p[0], p[1], p[2], nx, ny, nz, kind);
	}
	blob(cx, cy, cz, rx, rz, kind, sides = 7, rings = 3, twist = 0) {
		const center = [
			cx,
			cy,
			cz
		], ring = (level) => {
			const phi = Math.PI * level / rings - Math.PI / 2, rr = Math.cos(phi) * rx, zz = cz + Math.sin(phi) * rz;
			return Array.from({ length: sides }, (_, i) => {
				const t = 2 * Math.PI * (i + level % 2 * .5) / sides + twist;
				return [
					cx + Math.cos(t) * rr,
					cy + Math.sin(t) * rr,
					zz
				];
			});
		};
		const bottom = [
			cx,
			cy,
			cz - rz
		], top = [
			cx,
			cy,
			cz + rz
		];
		let prev = ring(1);
		for (let i = 0; i < sides; i++) this.tri(bottom, prev[i], prev[(i + 1) % sides], kind, center);
		for (let level = 2; level < rings; level++) {
			const next = ring(level);
			for (let i = 0; i < sides; i++) {
				const a = prev[i], b = prev[(i + 1) % sides], c = next[i], d = next[(i + 1) % sides];
				this.tri(a, c, b, kind, center);
				this.tri(b, c, d, kind, center);
			}
			prev = next;
		}
		for (let i = 0; i < sides; i++) this.tri(top, prev[(i + 1) % sides], prev[i], kind, center);
	}
	limb(x0, y0, z0, r0, x1, y1, z1, r1, kind) {
		const sides = 6, center = [
			(x0 + x1) / 2,
			(y0 + y1) / 2,
			(z0 + z1) / 2
		];
		for (let i = 0; i < sides; i++) {
			const t0 = 2 * Math.PI * i / sides, t1 = 2 * Math.PI * (i + 1) / sides;
			const a = [
				x0 + Math.cos(t0) * r0,
				y0 + Math.sin(t0) * r0,
				z0
			], b = [
				x0 + Math.cos(t1) * r0,
				y0 + Math.sin(t1) * r0,
				z0
			];
			const c = [
				x1 + Math.cos(t0) * r1,
				y1 + Math.sin(t0) * r1,
				z1
			], d = [
				x1 + Math.cos(t1) * r1,
				y1 + Math.sin(t1) * r1,
				z1
			];
			this.tri(a, b, c, kind, center);
			this.tri(b, d, c, kind, center);
		}
	}
};
var buildTemplate = (species) => {
	const w = new TreeWriter();
	if (species === "pine") {
		w.limb(0, 0, 0, .34, .5, .1, 3.4, .28, TC.pineBark);
		w.limb(.5, .1, 3.4, .28, -.3, .2, 6.2, .2, TC.pineBark);
		w.limb(-.3, .2, 5.2, .1, -2.2, .4, 6.4, .06, TC.pineBark);
		w.blob(-.3, .2, 7.7, 2.1, .7, TC.pine, 7, 3, .2);
		w.blob(-2.4, .5, 6.7, 1.7, .55, TC.pine, 6, 3, .6);
		w.blob(1.4, -.4, 5.6, 2.3, .6, TC.pine, 7, 3, 1.1);
	} else if (species === "broad") {
		w.limb(0, 0, 0, .3, 0, 0, 3.2, .22, TC.trunk);
		w.blob(0, 0, 5.7, 3, 2.8, TC.round, 8, 4, .15);
	} else if (species === "wide") {
		w.limb(0, 0, 0, .32, .1, 0, 2.4, .24, TC.trunk);
		w.limb(.1, 0, 2.2, .18, -1.6, .3, 3.6, .1, TC.trunk);
		w.blob(.2, 0, 4.4, 3.6, 1.7, TC.wide, 8, 3, .3);
		w.blob(-3.1, .6, 3.9, 2.2, 1.2, TC.wide, 6, 3, .8);
		w.blob(2.9, -.8, 3.7, 2.1, 1.1, TC.wide, 6, 3, .1);
	} else {
		w.limb(0, 0, 0, .24, 0, 0, 2.2, .18, TC.trunk);
		w.limb(0, 0, 2, .12, 1.4, .2, 3.1, .08, TC.trunk);
		w.blob(0, 0, 3.7, 2.7, 1.4, TC.persimmon, 7, 3, .4);
		for (const [fx, fy, fz] of [
			[
				1.8,
				.5,
				3.1
			],
			[
				-1.5,
				1.1,
				3
			],
			[
				.4,
				-1.9,
				2.9
			],
			[
				-.8,
				-1.3,
				3.5
			],
			[
				1.2,
				1.4,
				3.3
			]
		]) w.blob(fx, fy, fz, .42, .4, TC.fruit, 5, 2);
	}
	return new Float32Array(w.data);
};
var VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in float a_kind;
layout(location=3) in vec4 a_inst;   // 동 · 북 자리(m) · 크기 · 돌림(라디안)
uniform mat4 u_matrix; uniform float u_mu; uniform vec2 u_at;
out vec3 v_n; out float v_k; out float v_h;
void main(){
  float c = cos(a_inst.w), s = sin(a_inst.w);
  vec3 p = vec3(a_pos.xy * a_inst.z, a_pos.z * a_inst.z);
  vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + a_inst.xy;
  vec2 n2 = vec2(a_nrm.x * c - a_nrm.y * s, a_nrm.x * s + a_nrm.y * c);
  v_n = vec3(n2.x, -n2.y, a_nrm.z); v_k = a_kind;
  v_h = fract(sin(dot(a_inst.xy, vec2(12.9898, 78.233))) * 43758.5453);   // 나무마다 조금씩 다른 밝기
  gl_Position = u_matrix * vec4((u_at + vec2(q.x, -q.y)) * u_mu, p.z * u_mu, 1.);
}`;
var FS = `#version 300 es
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
var PalaceTrees = class {
	species = [];
	init(gl) {
		this.gl = gl;
		this.p = compileProgram(gl, VS, FS);
		this.at = toM(PALACE_AT[0], PALACE_AT[1]);
		this.u = Object.fromEntries([
			"u_matrix",
			"u_mu",
			"u_at",
			"u_light",
			"u_lit",
			"u_night",
			"u_col"
		].map((name) => [name, gl.getUniformLocation(this.p, name)]));
		for (const key of Object.keys(PALACE_TREES)) {
			const data = buildTemplate(key), points = PALACE_TREES[key], count = points.length / 2, inst = new Float32Array(count * 4);
			for (let i = 0; i < count; i++) {
				const x = points[i * 2] / 10, y = points[i * 2 + 1] / 10, h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
				inst.set([
					x,
					y,
					.8 + .45 * h,
					h * 6.2832
				], i * 4);
			}
			const va = gl.createVertexArray(), b = gl.createBuffer(), ib = gl.createBuffer();
			gl.bindVertexArray(va);
			gl.bindBuffer(gl.ARRAY_BUFFER, b);
			gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
			for (const [loc, size, off] of [
				[
					0,
					3,
					0
				],
				[
					1,
					3,
					3
				],
				[
					2,
					1,
					6
				]
			]) {
				gl.enableVertexAttribArray(loc);
				gl.vertexAttribPointer(loc, size, gl.FLOAT, false, TREE_STRIDE * 4, off * 4);
			}
			gl.bindBuffer(gl.ARRAY_BUFFER, ib);
			gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
			gl.enableVertexAttribArray(3);
			gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 16, 0);
			gl.vertexAttribDivisor(3, 1);
			gl.bindVertexArray(null);
			this.species.push({
				va,
				b,
				inst: ib,
				n: data.length / TREE_STRIDE,
				count
			});
		}
	}
	render(gl, MT, { light, lit, dark, zoom }) {
		if (zoom < 16.3) return;
		const u = this.u;
		gl.useProgram(this.p);
		gl.uniformMatrix4fv(u.u_matrix, false, MT);
		gl.uniform1f(u.u_mu, MU);
		gl.uniform2fv(u.u_at, this.at);
		gl.uniform3fv(u.u_light, light);
		gl.uniform2fv(u.u_lit, lit);
		gl.uniform1f(u.u_night, dark ? 1 : 0);
		gl.uniform3fv(u.u_col, new Float32Array(TREE_COLORS.flatMap(toRgb)));
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.disable(gl.CULL_FACE);
		for (const each of this.species) {
			gl.bindVertexArray(each.va);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, each.n, each.count);
		}
		gl.bindVertexArray(null);
	}
	dispose() {
		const gl = this.gl;
		for (const each of this.species) {
			gl.deleteBuffer(each.b);
			gl.deleteBuffer(each.inst);
			gl.deleteVertexArray(each.va);
		}
		this.species = [];
		gl.deleteProgram(this.p);
	}
};
export { PalaceTrees, TREE_MIN_ZOOM };
