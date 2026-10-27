import { BULB_FS, ORIGIN, bulbSize, compile, hexRGB, lightsOff, lightsOn } from "./night.mjs";
import { LANDMARKS, landmarkMerc } from "../../city/landmarks_data.mjs";
import { classifyRings } from "../../city/geom.mjs";
import { decodeTile } from "../../city/mvt.mjs";
// web/modes/coaster/festoon.mjs
var EARTH = 40075016.68557849;
var TILE_Z = 14;
var FESTOON = Object.freeze({
	minH: 20,
	share: .3,
	towerH: 80,
	towerShare: .15,
	roofM: 6,
	vertM: 8,
	roofMax: 64,
	vertMax: 32,
	aboveM: .8,
	minPx: 5,
	palette: [
		"#FFE6B8",
		"#FF9FC8",
		"#C7A6FF"
	],
	weights: [
		.45,
		.3,
		.25
	],
	zoomOn: 14,
	zoomKeep: [
		[14, 1 / 3],
		[15, 2 / 3],
		[16, 1]
	],
	vertZoom: 16,
	cap: {
		phone: 1600,
		desk: 3200
	},
	vertShare: .3,
	twinkleShare: .33,
	twinkleAmp: .4,
	twinkleS: [4, 8],
	bright: 1,
	wt: [1, .28],
	scale: 1.15,
	cacheTiles: 18
});
var mercX = (lon) => lon / 360 + .5;
var mercY = (lat) => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
var O = {
	x: mercX(ORIGIN[0]),
	y: mercY(ORIGIN[1])
};
var hash01 = (id, salt) => {
	let h = (Math.imul(id >>> 0 ^ 2654435769, 2246822507) ^ Math.imul(salt + 1, 3266489909)) >>> 0;
	h ^= h >>> 15;
	h = Math.imul(h, 739982445) >>> 0;
	h ^= h >>> 12;
	h = Math.imul(h, 695872825) >>> 0;
	h ^= h >>> 15;
	return (h >>> 0) / 4294967296;
};
var pick = (u, w) => {
	let a = 0;
	for (let i = 0; i < w.length; i++) {
		a += w[i];
		if (u < a) return i;
	}
	return w.length - 1;
};
function keepAt(zoom, F = FESTOON) {
	const k = F.zoomKeep;
	if (zoom < F.zoomOn) return 0;
	if (zoom <= k[0][0]) return k[0][1];
	for (let i = 1; i < k.length; i++) if (zoom <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (zoom - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
	return k[k.length - 1][1];
}
function festoonBulbs(layer, { x, y, z = TILE_Z }, F = FESTOON) {
	const out = [], roofs = [], verts = [];
	if (!layer) return {
		data: /* @__PURE__ */ new Float32Array(0),
		roofs,
		verts
	};
	const n = 2 ** z, E = layer.extent, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + .5) / n))), mu = 1 / (EARTH * Math.cos(lat));
	const marks = LANDMARKS.map((L) => {
		const [mx, my] = landmarkMerc(L);
		return {
			x: (mx * n - x) * E,
			y: (my * n - y) * E,
			r: L.hide.radiusM * mu * n * E,
			minH: L.hide.minH
		};
	});
	const wx = (v) => (v / E + x) / n, wy = (v) => (v / E + y) / n, inTile = (u, v) => u >= 0 && u < E && v >= 0 && v < E;
	for (let i = 0; i < layer.length; i++) {
		const f = layer.feature(i), p = f.properties || {};
		if (p.hide_3d === true || p.hide_3d === "true") continue;
		const H = +p.render_height;
		if (!(H >= F.minH)) continue;
		let flat;
		try {
			flat = f.loadGeometry().map((r) => r.flatMap((q) => [q.x, q.y]));
		} catch {
			continue;
		}
		{
			let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
			for (const a of flat) for (let k = 0; k < a.length; k += 2) {
				x0 = Math.min(x0, a[k]);
				x1 = Math.max(x1, a[k]);
				y0 = Math.min(y0, a[k + 1]);
				y1 = Math.max(y1, a[k + 1]);
			}
			const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
			if (marks.some((m) => H >= m.minH && Math.hypot(cx - m.x, cy - m.y) < m.r && Math.max(x1 - x0, y1 - y0) < 2.5 * m.r)) continue;
		}
		const base = Math.max(0, +p.render_min_height || 0), zTop = (H + F.aboveM) * mu;
		for (const poly of classifyRings(flat)) {
			const ring = poly.outer, m = ring.length / 2;
			if (m < 3) continue;
			let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
			for (let k = 0; k < ring.length; k += 2) {
				x0 = Math.min(x0, ring[k]);
				x1 = Math.max(x1, ring[k]);
				y0 = Math.min(y0, ring[k + 1]);
				y1 = Math.max(y1, ring[k + 1]);
			}
			const key = (Math.round(wx((x0 + x1) / 2) * 2 ** 25) ^ Math.imul(Math.round(wy((y0 + y1) / 2) * 2 ** 25), 668265261)) >>> 0;
			const rank = hash01(key, 1), tower = H >= F.towerH && hash01(key, 2) < F.towerShare, roof = rank < F.share;
			if (!roof && !tower) continue;
			const col = pick(hash01(key, 3), F.weights);
			let per = 0;
			for (let k = 0; k < m; k++) {
				const b = (k + 1) % m;
				per += Math.hypot(ring[2 * b] - ring[2 * k], ring[2 * b + 1] - ring[2 * k + 1]);
			}
			const perM = per / (n * E) / mu;
			if (perM < 8) continue;
			if (roof) {
				const r = rank / F.share, cnt = Math.min(F.roofMax, Math.max(4, Math.round(perM / F.roofM))), step = per / cnt;
				let s = 0, idx = 0, next = 0, kept = 0;
				for (let k = 0; k < m && idx < cnt; k++) {
					const ax = ring[2 * k], ay = ring[2 * k + 1], b = (k + 1) % m, bx = ring[2 * b], by = ring[2 * b + 1], L = Math.hypot(bx - ax, by - ay);
					while (next <= s + L && idx < cnt) {
						const u = L ? (next - s) / L : 0, px = ax + (bx - ax) * u, py = ay + (by - ay) * u;
						if (inTile(px, py)) {
							out.push(wx(px) - O.x, wy(py) - O.y, zTop, r, idx, col, hash01(key + idx * 7919, 4));
							kept++;
						}
						idx++;
						next += step;
					}
					s += L;
				}
				if (kept) roofs.push([r, kept]);
			}
			if (tower) {
				const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
				let a = 0, best = -1;
				for (let k = 0; k < m; k++) {
					const d = Math.hypot(ring[2 * k] - cx, ring[2 * k + 1] - cy);
					if (d > best) {
						best = d;
						a = k;
					}
				}
				let b = a;
				best = -1;
				for (let k = 0; k < m; k++) {
					const d = Math.hypot(ring[2 * k] - ring[2 * a], ring[2 * k + 1] - ring[2 * a + 1]);
					if (d > best) {
						best = d;
						b = k;
					}
				}
				const cnt = Math.min(F.vertMax, Math.max(2, Math.floor((H - base) / F.vertM))), rv = hash01(key, 2) / F.towerShare;
				for (const k of a === b ? [a] : [a, b]) {
					if (!inTile(ring[2 * k], ring[2 * k + 1])) continue;
					for (let j = 1; j <= cnt; j++) out.push(wx(ring[2 * k]) - O.x, wy(ring[2 * k + 1]) - O.y, (base + (H - base) * j / cnt) * mu, rv, cnt - j, col + 4, hash01(key + k * 31 + j * 7919, 5));
					verts.push([rv, cnt]);
				}
			}
		}
	}
	return {
		data: new Float32Array(out),
		roofs,
		verts
	};
}
function survivors(T, k, kv, stride, part = "all") {
	let c = 0;
	if (part !== "vert") {
		for (const [r, n] of T.roofs) if (r < k) c += Math.ceil(n / stride);
	}
	if (part !== "roof" && kv > 0) {
		for (const [r, n] of T.verts) if (r < kv) c += Math.ceil(n / stride);
	}
	return c;
}
var f = (v) => Number(v).toFixed(4);
var VS = `#version 300 es
layout(location=0) in vec3 a_p;    // 메르카토르(ORIGIN 뺌), z 도 메르카토르 단위
layout(location=1) in vec4 a_d;    // rank(0..1, 작을수록 먼저 켠다), 줄 안 차례, 색 + 4 × 세로, 반짝임 해시
uniform mat4 u_matrix; uniform float u_size, u_core, u_keep, u_vert, u_stride, u_time, u_anim, u_bright;
uniform vec3 u_pal[3];
out vec3 v_rgb; out vec2 v_mix;
void main(){
  float vert = step(3.5, a_d.z), keep = mix(u_keep, u_vert, vert);
  float fade = 1. - smoothstep(keep - .06, keep, a_d.x);   // 몫이 바뀌는 자리에서 서서히
  if (fade <= .01 || mod(a_d.y, u_stride) >= .5) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
  gl_Position = u_matrix * vec4(a_p, 1.);
  gl_Position.z -= 2e-4 * gl_Position.w;   // 지붕 · 모서리 벽보다 한 터럭 앞
  gl_PointSize = u_size;
  float h = a_d.w, tw = 1.;
  if (u_anim > .5 && h < ${f(FESTOON.twinkleShare)}) tw = 1. + ${f(FESTOON.twinkleAmp)} * sin(6.283185 * (u_time / (${f(FESTOON.twinkleS[0])} + h * ${f((FESTOON.twinkleS[1] - FESTOON.twinkleS[0]) / FESTOON.twinkleShare)}) + h * 61.));
  v_rgb = u_pal[int(mod(a_d.z, 4.))];
  v_mix = vec2(u_core, u_bright * fade * tw);
}`;
var FestoonLayer = class {
	constructor(F = FESTOON) {
		this.F = F;
		this.tiles = /* @__PURE__ */ new Map();
		this.want = /* @__PURE__ */ new Set();
		this.M = /* @__PURE__ */ new Float32Array(16);
		this.stats = {
			tiles: 0,
			bulbs: 0,
			drawn: 0,
			keep: 0,
			ms: 0
		};
		this.queue = [];
	}
	init(gl) {
		if (this.p || this.broken) return;
		try {
			this.p = compile(gl, VS, BULB_FS);
		} catch (e) {
			this.broken = true;
			console.error("coaster festoon: off —", e);
			return;
		}
		this.u = Object.fromEntries([
			"u_matrix",
			"u_size",
			"u_core",
			"u_keep",
			"u_vert",
			"u_stride",
			"u_time",
			"u_anim",
			"u_bright",
			"u_pal",
			"u_wt"
		].map((n) => [n, gl.getUniformLocation(this.p, n)]));
		this.pal = new Float32Array(this.F.palette.flatMap(hexRGB));
		this.gl = gl;
	}
	update(map) {
		if (!this.p) return;
		const now = performance.now();
		if (now - (this.looked || 0) < 300) return;
		this.looked = now;
		const man = map.style?.tileManagers?.ofm;
		if (!man) return;
		const c = map.getCenter(), n = 2 ** TILE_Z, cx = (c.lng + 180) / 360 * n, cy = (1 - Math.log(Math.tan(Math.PI / 4 + c.lat * Math.PI / 360)) / Math.PI) / 2 * n, all = [];
		for (const id of man.getRenderableIds?.() || []) {
			const t = man.getTileByID(id), q = t?.tileID?.canonical;
			if (!q || q.z !== TILE_Z || !t.latestFeatureIndex?.rawTileData) continue;
			all.push({
				k: `${q.x}/${q.y}`,
				x: q.x,
				y: q.y,
				raw: t.latestFeatureIndex.rawTileData,
				d: Math.hypot(q.x + .5 - cx, q.y + .5 - cy)
			});
		}
		all.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
		const near = all.slice(0, this.F.cacheTiles);
		this.want = new Set(near.map((w) => w.k));
		for (const w of near) {
			const T = this.tiles.get(w.k);
			if (T) T.seen = now;
		}
		this.queue = near.filter((w) => !this.tiles.has(w.k));
	}
	buildOne() {
		const q = this.queue.shift();
		if (!q || !this.gl) return false;
		if (this.tiles.size >= this.F.cacheTiles && !this.evict(1)) {
			this.queue.unshift(q);
			return false;
		}
		const t0 = performance.now(), gl = this.gl;
		let B;
		try {
			B = festoonBulbs(decodeTile(q.raw, /* @__PURE__ */ new Set(["building"])).building, {
				x: q.x,
				y: q.y
			}, this.F);
		} catch (e) {
			console.error("coaster festoon: tile", q.k, e);
			B = {
				data: /* @__PURE__ */ new Float32Array(0),
				roofs: [],
				verts: []
			};
		}
		const data = B.data, T = {
			n: data.length / 7,
			seen: performance.now(),
			box: null,
			roofs: B.roofs,
			verts: B.verts,
			d: q.k
		};
		if (T.n) {
			let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
			for (let i = 0; i < data.length; i += 7) {
				x0 = Math.min(x0, data[i]);
				x1 = Math.max(x1, data[i]);
				y0 = Math.min(y0, data[i + 1]);
				y1 = Math.max(y1, data[i + 1]);
			}
			T.box = [
				x0 + O.x,
				y0 + O.y,
				x1 + O.x,
				y1 + O.y
			];
			T.b = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, T.b);
			gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
			T.va = gl.createVertexArray();
			gl.bindVertexArray(T.va);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
			gl.enableVertexAttribArray(1);
			gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
			gl.bindVertexArray(null);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);
		}
		this.tiles.set(q.k, T);
		this.stats.ms = performance.now() - t0;
		return true;
	}
	evict(need) {
		const old = [...this.tiles].filter(([k]) => !this.want.has(k)).sort((a, b) => a[1].seen - b[1].seen);
		let done = 0;
		while (done < need && old.length) {
			const [k, T] = old.shift();
			this.drop(T);
			this.tiles.delete(k);
			done++;
		}
		return done >= need;
	}
	pump(map, repaint) {
		if (this.idle || !this.queue.length) return;
		const run = () => {
			this.idle = 0;
			if (!this.gl) return;
			if (map.isMoving()) {
				this.pump(map, repaint);
				return;
			}
			if (this.buildOne()) repaint();
		};
		this.idle = typeof requestIdleCallback === "function" ? requestIdleCallback(run, { timeout: 600 }) : setTimeout(run, 60);
	}
	pending() {
		return this.queue.length > 0;
	}
	render(gl, matrix, opts = {}) {
		if (!this.p) return;
		const { zoom = 15, phone = false, reducedMotion = false, bounds, pixelRatio = 1, now = performance.now() } = opts, F = this.F;
		let keep = keepAt(zoom, F);
		this.stats.keep = keep;
		this.stats.drawn = 0;
		if (keep <= 0) return;
		let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity;
		if (bounds) {
			x0 = Math.min(bounds[0], bounds[2]);
			x1 = Math.max(bounds[0], bounds[2]);
			y0 = Math.min(bounds[1], bounds[3]);
			y1 = Math.max(bounds[1], bounds[3]);
		}
		const vis = [];
		for (const T of this.tiles.values()) if (T.n && !(T.box[2] < x0 || T.box[0] > x1 || T.box[3] < y0 || T.box[1] > y1)) vis.push(T);
		if (!vis.length) return;
		const mpp = EARTH * Math.cos(ORIGIN[1] * Math.PI / 180) / (512 * 2 ** zoom), stride = Math.max(1, Math.ceil(F.minPx * mpp / F.roofM));
		const cap = phone ? F.cap.phone : F.cap.desk, count = (k, kv, part) => vis.reduce((s, T) => s + survivors(T, k, kv, stride, part), 0);
		let vert = zoom >= F.vertZoom ? Math.min(1, zoom - F.vertZoom + .3) : 0;
		const memo = `${stride}|${keep.toFixed(3)}|${vert.toFixed(2)}|${cap}|${vis.map((T) => T.d).join()}`;
		if (this.capMemo?.k === memo) ({keep, vert} = this.capMemo);
		else {
			while (vert > 0 && count(0, vert, "vert") > cap * F.vertShare) vert = Math.max(0, vert - .1);
			const rest = cap - count(0, vert, "vert");
			while (keep > 0 && count(keep, 0, "roof") > rest) keep = Math.max(0, keep - .05);
			this.capMemo = {
				k: memo,
				keep,
				vert,
				drawn: count(keep, vert)
			};
		}
		this.stats.drawn = this.capMemo.drawn;
		if (keep <= 0) return;
		const MT = this.M;
		MT.set(matrix);
		for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r] * O.x + matrix[4 + r] * O.y + matrix[12 + r];
		const sz = bulbSize(zoom, pixelRatio, F.scale);
		lightsOn(gl);
		gl.useProgram(this.p);
		gl.uniformMatrix4fv(this.u.u_matrix, false, MT);
		gl.uniform1f(this.u.u_size, sz.point);
		gl.uniform1f(this.u.u_core, sz.coreFrac);
		gl.uniform1f(this.u.u_keep, keep);
		gl.uniform1f(this.u.u_vert, vert);
		gl.uniform1f(this.u.u_stride, stride);
		gl.uniform1f(this.u.u_time, now / 1e3);
		gl.uniform1f(this.u.u_anim, reducedMotion ? 0 : 1);
		gl.uniform1f(this.u.u_bright, F.bright);
		gl.uniform3fv(this.u.u_pal, this.pal);
		gl.uniform2f(this.u.u_wt, F.wt[0], F.wt[1]);
		for (const T of vis) {
			gl.bindVertexArray(T.va);
			gl.drawArrays(gl.POINTS, 0, T.n);
		}
		gl.bindVertexArray(null);
		lightsOff(gl);
		this.stats.tiles = this.tiles.size;
		this.stats.bulbs = vis.reduce((s, T) => s + T.n, 0);
		this.stats.keepCapped = keep;
		this.stats.vert = vert;
	}
	animating() {
		return this.stats.drawn > 0;
	}
	drop(T) {
		const gl = this.gl;
		if (gl && T.b) {
			gl.deleteBuffer(T.b);
			gl.deleteVertexArray(T.va);
		}
	}
	dispose(gl) {
		for (const T of this.tiles.values()) this.drop(T);
		this.tiles.clear();
		this.queue = [];
		this.want = /* @__PURE__ */ new Set();
		this.looked = 0;
		if (this.idle) {
			(typeof cancelIdleCallback === "function" ? cancelIdleCallback : clearTimeout)(this.idle);
			this.idle = 0;
		}
		if (this.p) gl.deleteProgram(this.p);
		this.p = null;
		this.gl = null;
	}
};
export { FESTOON, FestoonLayer, FestoonLayer as default, festoonBulbs, keepAt, survivors };
