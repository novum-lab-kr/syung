// web/map/avatar.mts
var RAD = Math.PI / 180;
function avatarScale(zoom) {
	const d = Math.max(0, Math.min(3, zoom - 15));
	return (40 + d * 6 + d * d * 1.2) * 1.5 ** Math.max(0, zoom - 18);
}
var LOOKS = /* @__PURE__ */ new Map();
function registerAvatar(id, look) {
	LOOKS.set(id, look);
}
var PARTS = {
	body: 0,
	legL: 1,
	legR: 2,
	armL: 3,
	armR: 4
};
var hex = (c) => [
	1,
	3,
	5
].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
function buildAvatarMesh({ build, rig }) {
	const data = [];
	const put = (p, n, rgb, part, pivot) => data.push(...p, ...n, ...rgb, part, ...pivot);
	const quad = (a, b, c, d, n, color, part = "body", pivot = null) => {
		const P = [
			a,
			b,
			c,
			d
		], K = (Array.isArray(part) ? part : [
			part,
			part,
			part,
			part
		]).map((p) => PARTS[p] ?? 0), rgb = hex(color);
		const px = pivot ? pivot[0] : (Math.min(a[0], b[0], c[0], d[0]) + Math.max(a[0], b[0], c[0], d[0])) / 2;
		const pv = (k) => [px, pivot && pivot[1] != null && k ? pivot[1] : k === 1 || k === 2 ? rig.hip : k ? rig.shoulder : 0];
		for (const i of [
			0,
			1,
			2,
			0,
			2,
			3
		]) put(P[i], n, rgb, K[i], pv(K[i]));
	};
	const box = (x0, y0, z0, x1, y1, z1, color, part = "body") => {
		const k = PARTS[part] ?? 0, pv = [(x0 + x1) / 2, k === 1 || k === 2 ? rig.hip : k ? rig.shoulder : 0];
		quad([
			x0,
			y0,
			z0
		], [
			x1,
			y0,
			z0
		], [
			x1,
			y0,
			z1
		], [
			x0,
			y0,
			z1
		], [
			0,
			-1,
			0
		], color, part, pv);
		quad([
			x1,
			y1,
			z0
		], [
			x0,
			y1,
			z0
		], [
			x0,
			y1,
			z1
		], [
			x1,
			y1,
			z1
		], [
			0,
			1,
			0
		], color, part, pv);
		quad([
			x1,
			y0,
			z0
		], [
			x1,
			y1,
			z0
		], [
			x1,
			y1,
			z1
		], [
			x1,
			y0,
			z1
		], [
			1,
			0,
			0
		], color, part, pv);
		quad([
			x0,
			y1,
			z0
		], [
			x0,
			y0,
			z0
		], [
			x0,
			y0,
			z1
		], [
			x0,
			y1,
			z1
		], [
			-1,
			0,
			0
		], color, part, pv);
		quad([
			x0,
			y1,
			z1
		], [
			x1,
			y1,
			z1
		], [
			x1,
			y0,
			z1
		], [
			x0,
			y0,
			z1
		], [
			0,
			0,
			1
		], color, part, pv);
		quad([
			x0,
			y0,
			z0
		], [
			x1,
			y0,
			z0
		], [
			x1,
			y1,
			z0
		], [
			x0,
			y1,
			z0
		], [
			0,
			0,
			-1
		], color, part, pv);
	};
	build({
		box,
		quad
	});
	const S = .42, sh = [
		[
			-.42,
			-.42,
			-1,
			-1
		],
		[
			S,
			-.42,
			1,
			-1
		],
		[
			S,
			S,
			1,
			1
		],
		[
			-.42,
			-.42,
			-1,
			-1
		],
		[
			S,
			S,
			1,
			1
		],
		[
			-.42,
			S,
			-1,
			1
		]
	];
	const shadow = [];
	for (const [x, y, u, v] of sh) shadow.push(x, y, .004, 0, 0, 1, 0, 0, 0, 5, u, v);
	return {
		body: new Float32Array(data),
		shadow: new Float32Array(shadow)
	};
}
var M_PER_DEG = 111320;
var metres = (a, b) => {
	const k = Math.cos((a[1] + b[1]) / 2 * RAD);
	return Math.hypot((b[0] - a[0]) * M_PER_DEG * k, (b[1] - a[1]) * M_PER_DEG);
};
function createMyMotion({ now = () => performance.now() } = {}) {
	let fixes = [], shown = null, target = null, yaw = null, walking = false, lastMove = -Infinity, walk = 0, phase = 0, at = null, gap = 1e3;
	const WINDOW = 1e4, RECENT = 6e3, MIN_SPAN = 3e3;
	const hold = () => Math.min(6e3, Math.max(2e3, gap * 1.5));
	return {
		fix(pos, t = now()) {
			const c = pos.coords, p = [c.longitude, c.latitude], acc = Number.isFinite(c.accuracy) ? c.accuracy : 30;
			if (!shown || metres(shown, p) > 200) {
				shown = p.slice();
				fixes = [];
			}
			if (fixes.length) gap = t - fixes[fixes.length - 1].t;
			target = p;
			fixes.push({
				p,
				t,
				acc
			});
			while (fixes.length > 1 && t - fixes[0].t > WINDOW) fixes.shift();
			const recent = fixes.filter((f) => t - f.t <= RECENT), a = recent[0], d = metres(a.p, p), span = t - a.t, speed = span > 0 ? d / (span / 1e3) : 0;
			const meanAcc = recent.reduce((s, f) => s + f.acc, 0) / recent.length;
			const moved = span >= MIN_SPAN && d > Math.max(5, meanAcc * .5) && speed >= .5;
			if (moved && speed <= 3) {
				walking = true;
				lastMove = t;
			} else if (moved) walking = false;
			else if (t - lastMove > hold()) walking = false;
			if (moved || walking) for (let i = fixes.length - 2; i >= 0; i--) {
				const q = fixes[i].p;
				if (metres(q, p) <= 3) continue;
				yaw = Math.atan2(-(p[1] - q[1]), (p[0] - q[0]) * Math.cos(p[1] * RAD));
				break;
			}
		},
		has: () => !!shown,
		shown: () => shown && shown.slice(),
		at(t = now()) {
			if (!shown) return null;
			const dt = at == null ? 0 : Math.min(.25, Math.max(0, (t - at) / 1e3));
			at = t;
			if (t - lastMove > hold()) walking = false;
			const k = 1 - Math.exp(-dt / .25);
			shown[0] += (target[0] - shown[0]) * k;
			shown[1] += (target[1] - shown[1]) * k;
			walk += ((walking ? 1 : 0) - walk) * (1 - Math.exp(-dt / .15));
			phase = (phase + dt * 1.7 * Math.max(walk, .001)) % 1;
			const gliding = metres(shown, target) > .05;
			return {
				lngLat: shown.slice(),
				yaw,
				walk,
				phase,
				animating: gliding || walk > .01
			};
		},
		get walking() {
			return walking;
		}
	};
}
var VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_normal; layout(location=2) in vec3 a_color;
layout(location=3) in float a_part; layout(location=4) in vec2 a_pivot;
uniform mat4 u_matrix; uniform vec4 u_pose; uniform float u_unit,u_walk,u_phase;
out vec3 v_normal; out vec3 v_color; out vec2 v_disc; flat out float v_part;
void main(){vec3 p=a_pos,n=a_normal;float ph=6.2832*u_phase,a=0.;
  // 다리: 엉덩이 축, 왼발 · 오른발 반대 박자. 팔: 어깨 축, 같은 쪽 다리와 반대
  if(a_part>.5&&a_part<2.5)a=u_walk*.5*sin(ph)*(a_part<1.5?1.:-1.);
  else if(a_part>2.5&&a_part<4.5)a=-u_walk*.4*sin(ph)*(a_part<3.5?1.:-1.);
  if(a!=0.){float ca=cos(a),sa=sin(a);vec2 d=vec2(p.x-a_pivot.x,p.z-a_pivot.y);p.x=a_pivot.x+ca*d.x-sa*d.y;p.z=a_pivot.y+sa*d.x+ca*d.y;
    n=vec3(ca*n.x-sa*n.z,n.y,sa*n.x+ca*n.z);}
  if(a_part<4.5)p.z+=u_walk*.03*abs(sin(ph));   // 걸음마다 살짝 들썩(그림자는 바닥에)
  float c=cos(u_pose.z),s=sin(u_pose.z);vec3 w=p*u_pose.w*u_unit;w.xy=vec2(c*w.x-s*w.y,s*w.x+c*w.y)+u_pose.xy;
  gl_Position=u_matrix*vec4(w,1.);v_normal=vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z);v_color=a_color;v_part=a_part;v_disc=a_pivot;}`;
var FS = `#version 300 es
precision highp float;in vec3 v_normal;in vec3 v_color;in vec2 v_disc;flat in float v_part;uniform float u_fade,u_dark;out vec4 o;
void main(){vec3 col=v_color;float alpha=1.;
  if(v_part>4.5){float d=length(v_disc);alpha=mix(.24,.4,u_dark)*(1.-smoothstep(.3,1.,d));col=vec3(.05,.06,.06);}
  else col*=.74+.26*max(dot(normalize(v_normal),normalize(vec3(-.5,.65,1.))),0.);   // 버스와 같은 빛
  alpha*=u_fade;if(alpha<.005)discard;o=vec4(col*alpha,alpha);}`;
var AvatarRenderer = class {
	constructor() {
		this.matrix = /* @__PURE__ */ new Float32Array(16);
	}
	init(gl) {
		if (this.gl === gl && this.p) return;
		this.gl = gl;
		this.p = gl.createProgram();
		this.meshes = /* @__PURE__ */ new Map();
		for (const [kind, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
			const s = gl.createShader(kind);
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
			gl.attachShader(this.p, s);
			gl.deleteShader(s);
		}
		gl.linkProgram(this.p);
		if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.p));
		this.u = Object.fromEntries([
			"matrix",
			"pose",
			"unit",
			"walk",
			"phase",
			"fade",
			"dark"
		].map((k) => [k, gl.getUniformLocation(this.p, "u_" + k)]));
	}
	mesh(id) {
		let m = this.meshes.get(id);
		if (m) return m;
		const look = LOOKS.get(id);
		if (!look) return null;
		const gl = this.gl, built = buildAvatarMesh(look);
		m = Object.fromEntries(Object.entries(built).map(([k, data]) => {
			const vao = gl.createVertexArray(), buf = gl.createBuffer();
			gl.bindVertexArray(vao);
			gl.bindBuffer(gl.ARRAY_BUFFER, buf);
			gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
			for (const [loc, n, off] of [
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
					3,
					6
				],
				[
					3,
					1,
					9
				],
				[
					4,
					2,
					10
				]
			]) {
				gl.enableVertexAttribArray(loc);
				gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 48, off * 4);
			}
			return [k, {
				vao,
				buf,
				count: data.length / 12
			}];
		}));
		gl.bindVertexArray(null);
		this.meshes.set(id, m);
		return m;
	}
	render(gl, matrix, { look = null, world, origin, yaw, scale, unit, walk = 0, phase = 0, dark = false, occlude = 0 }) {
		this.init(gl);
		const m = this.mesh(look) || this.mesh(LOOKS.keys().next().value);
		if (!m) return;
		this.matrix.set(matrix);
		for (let i = 0; i < 4; i++) this.matrix[12 + i] = matrix[i] * origin[0] + matrix[4 + i] * origin[1] + matrix[12 + i];
		gl.useProgram(this.p);
		gl.uniformMatrix4fv(this.u.matrix, false, this.matrix);
		gl.uniform4f(this.u.pose, world[0] - origin[0], world[1] - origin[1], yaw, scale);
		gl.uniform1f(this.u.unit, unit);
		gl.uniform1f(this.u.walk, walk);
		gl.uniform1f(this.u.phase, phase);
		gl.uniform1f(this.u.dark, dark ? 1 : 0);
		gl.enable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		const draw = (b, fade, func, write) => {
			gl.uniform1f(this.u.fade, fade);
			gl.depthFunc(func);
			gl.depthMask(write);
			gl.bindVertexArray(b.vao);
			gl.drawArrays(gl.TRIANGLES, 0, b.count);
		};
		draw(m.shadow, 1, gl.LEQUAL, false);
		if (occlude > 0) draw(m.body, occlude, gl.GREATER, false);
		draw(m.body, 1, gl.LEQUAL, true);
		gl.bindVertexArray(null);
		gl.depthMask(false);
		gl.depthFunc(gl.LEQUAL);
	}
	dispose() {
		if (!this.gl) return;
		const gl = this.gl;
		for (const m of this.meshes.values()) for (const b of Object.values(m)) {
			gl.deleteBuffer(b.buf);
			gl.deleteVertexArray(b.vao);
		}
		gl.deleteProgram(this.p);
		this.p = null;
		this.gl = null;
	}
};
export { AvatarRenderer, avatarScale, buildAvatarMesh, createMyMotion, registerAvatar };
