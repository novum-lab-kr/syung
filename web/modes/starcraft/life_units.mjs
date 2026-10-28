import { UNIT_SHAPES } from "./unit_shapes.mjs";
import { shapeTriangles } from "./units.mjs";
import { compile, hexRGB } from "../coaster/night.mjs";
// web/modes/starcraft/life_units.mts
var VERT = 12;
var INST = 8;
var VS = `#version 300 es
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
var FS = `#version 300 es
precision highp float;in vec3 v_n;flat in vec3 v_c;uniform vec3 u_light;uniform vec2 u_lit;out vec4 o;
void main(){float l=length(v_n),d=l>1e-6?max(dot(v_n/l,u_light),0.):0.;o=vec4(clamp(v_c*(u_lit.x+u_lit.y*(.35+.65*d)),0.,1.),1.);}`;
var TINY_PX = {
	person: 7,
	car: 15
};
var BOX = "#box";
function boxTriangles(shape, top, low, out) {
	const x = shape.len / 2 * .85, y = .38, z = 1.05, zm = z * .45;
	const f = (a, b, c, d, n, rgb) => {
		for (const p of [
			a,
			b,
			c,
			a,
			c,
			d
		]) out.push(...p, ...n, ...rgb, 0, 0, 0);
	};
	for (const [z0, z1, rgb] of [[
		0,
		zm,
		low
	], [
		zm,
		z,
		top
	]]) {
		f([
			-x,
			-.38,
			z0
		], [
			x,
			-.38,
			z0
		], [
			x,
			-.38,
			z1
		], [
			-x,
			-.38,
			z1
		], [
			0,
			-1,
			0
		], rgb);
		f([
			x,
			y,
			z0
		], [
			-x,
			y,
			z0
		], [
			-x,
			y,
			z1
		], [
			x,
			y,
			z1
		], [
			0,
			1,
			0
		], rgb);
		f([
			x,
			-.38,
			z0
		], [
			x,
			y,
			z0
		], [
			x,
			y,
			z1
		], [
			x,
			-.38,
			z1
		], [
			1,
			0,
			0
		], rgb);
		f([
			-x,
			y,
			z0
		], [
			-x,
			-.38,
			z0
		], [
			-x,
			-.38,
			z1
		], [
			-x,
			y,
			z1
		], [
			-1,
			0,
			0
		], rgb);
	}
	f([
		-x,
		-.38,
		z
	], [
		x,
		-.38,
		z
	], [
		x,
		y,
		z
	], [
		-x,
		y,
		z
	], [
		0,
		0,
		1
	], top);
}
var LifeUnits = class {
	init(gl) {
		if (this.p) return;
		this.p = compile(gl, VS, FS);
		this.attr = Object.fromEntries([
			"a_p",
			"a_n",
			"a_c",
			"a_leg",
			"a_pivot",
			"i_a",
			"i_b"
		].map((n) => [n, gl.getAttribLocation(this.p, n)]));
		this.uni = Object.fromEntries([
			"u_matrix",
			"u_mu",
			"u_time",
			"u_fly",
			"u_line",
			"u_light",
			"u_lit"
		].map((n) => [n, gl.getUniformLocation(this.p, n)]));
		this.meshes = /* @__PURE__ */ new Map();
		this.ib = gl.createBuffer();
		this.cap = 0;
		this.lists = /* @__PURE__ */ new Map();
	}
	mesh(gl, key) {
		let m = this.meshes.get(key);
		if (m) return m;
		const box = key.endsWith(BOX), shape = UNIT_SHAPES[box ? key.slice(0, -BOX.length) : key], pal = shape.palette.map(hexRGB), data = [];
		if (box) boxTriangles(shape, pal[0], pal[1] || pal[0], data);
		else for (const t of shapeTriangles(shape)) data.push(...t.p, ...t.n, ...t.color === "line" ? [
			-1,
			-1,
			-1
		] : pal[t.color], t.leg, ...t.pivot);
		const f = new Float32Array(data), b = gl.createBuffer(), va = gl.createVertexArray(), A = this.attr;
		gl.bindBuffer(gl.ARRAY_BUFFER, b);
		gl.bufferData(gl.ARRAY_BUFFER, f, gl.STATIC_DRAW);
		gl.bindVertexArray(va);
		gl.bindBuffer(gl.ARRAY_BUFFER, b);
		for (const [loc, size, off] of [
			[
				A.a_p,
				3,
				0
			],
			[
				A.a_n,
				3,
				3
			],
			[
				A.a_c,
				3,
				6
			],
			[
				A.a_leg,
				1,
				9
			],
			[
				A.a_pivot,
				2,
				10
			]
		]) if (loc >= 0) {
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, VERT * 4, off * 4);
		}
		gl.bindVertexArray(null);
		m = {
			b,
			va,
			n: f.length / VERT
		};
		this.meshes.set(key, m);
		return m;
	}
	push(key, x, y, yaw, s, go, seed) {
		if (!UNIT_SHAPES[key.endsWith(BOX) ? key.slice(0, -BOX.length) : key]) return;
		let l = this.lists.get(key);
		if (!l) this.lists.set(key, l = {
			inst: new Float32Array(INST * 64),
			n: 0
		});
		if ((l.n + 1) * INST > l.inst.length) {
			const g = new Float32Array(l.inst.length * 2);
			g.set(l.inst);
			l.inst = g;
		}
		l.inst.set([
			x,
			y,
			yaw,
			s,
			go,
			seed,
			0,
			0
		], l.n++ * INST);
	}
	draw(gl, MT, mu, { people, peopleN = 0, cars, carsN = 0, carList = null, units: U, personH = 1.7, carLenM = 4.3, mpp = 0, now = 0, light = [
		-.5,
		.5,
		.7
	], lit = [.64, .36], line = [
		.5,
		.5,
		.5
	] }) {
		this.init(gl);
		for (const l of this.lists.values()) l.n = 0;
		const P = U.people || [], C = U.cars || [];
		if (P.length) for (let i = 0; i < peopleN; i++) {
			const o = i * 14, k = P[Math.abs(Math.round(people[o + 10] * 7 + people[o + 6] * 3)) % P.length];
			if (!UNIT_SHAPES[k]) continue;
			const s = people[o + 7] * personH * (U.personScale ?? 1) / 1.25;
			const d = people[o + 11] || 1;
			this.push(mpp && s * 1.25 / mpp < TINY_PX.person ? k + BOX : k, people[o], people[o + 1], Math.atan2(people[o + 5] * d, people[o + 4] * d), s, people[o + 3], i * .618 % 1);
		}
		if (C.length) for (let i = 0; i < carsN; i++) {
			const o = i * 10, seed = carList?.[i]?.seed ?? i * .618 % 1, k = C[Math.min(C.length - 1, Math.floor(seed * C.length))], sh = UNIT_SHAPES[k];
			if (!sh) continue;
			const s = cars[o + 7] * carLenM * (U.carScale ?? 1) / sh.len;
			this.push(mpp && s * sh.len / mpp < TINY_PX.car ? k + BOX : k, cars[o], cars[o + 1], cars[o + 2], s, 1, i * .618 % 1);
		}
		const runs = [...this.lists].filter(([, l]) => l.n);
		if (!runs.length) return 0;
		const Uu = this.uni;
		gl.useProgram(this.p);
		gl.uniformMatrix4fv(Uu.u_matrix, false, MT);
		gl.uniform1f(Uu.u_mu, mu);
		gl.uniform1f(Uu.u_time, now / 1e3);
		gl.uniform3fv(Uu.u_line, line);
		gl.uniform3fv(Uu.u_light, light);
		gl.uniform2fv(Uu.u_lit, lit);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		const total = runs.reduce((a, [, l]) => a + l.n, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
		if (this.cap < total * INST) {
			this.cap = Math.max(total * INST, INST * 256) * 2;
			gl.bufferData(gl.ARRAY_BUFFER, this.cap * 4, gl.DYNAMIC_DRAW);
		}
		let off = 0, drawn = 0;
		for (const [key, l] of runs) {
			gl.bufferSubData(gl.ARRAY_BUFFER, off * 4, l.inst, 0, l.n * INST);
			const m = this.mesh(gl, key);
			gl.bindVertexArray(m.va);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
			for (const [n, k] of [["i_a", 0], ["i_b", 4]]) {
				const loc = this.attr[n];
				if (loc >= 0) {
					gl.enableVertexAttribArray(loc);
					gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, INST * 4, (off + k) * 4);
					gl.vertexAttribDivisor(loc, 1);
				}
			}
			gl.uniform1f(Uu.u_fly, UNIT_SHAPES[key.endsWith(BOX) ? key.slice(0, -BOX.length) : key].fly ? .9 : 0);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, l.n);
			drawn += l.n;
			off += l.n * INST;
			for (const n of ["i_a", "i_b"]) {
				const loc = this.attr[n];
				if (loc >= 0) gl.vertexAttribDivisor(loc, 0);
			}
		}
		gl.bindVertexArray(null);
		gl.enable(gl.BLEND);
		return drawn;
	}
	dispose(gl) {
		if (!this.p) return;
		for (const m of this.meshes.values()) {
			gl.deleteBuffer(m.b);
			gl.deleteVertexArray(m.va);
		}
		this.meshes.clear();
		gl.deleteBuffer(this.ib);
		gl.deleteProgram(this.p);
		this.p = null;
	}
};
export { LifeUnits, LifeUnits as default, TINY_PX };
