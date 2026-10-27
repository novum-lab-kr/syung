// web/city/mvt.mts
const TD = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
var Pbf = class {
	constructor(buf) {
		this.b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
		this.pos = 0;
		this.dv = new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength);
	}
	varint() {
		const b = this.b;
		let v = b[this.pos++];
		if (v < 128) return v;
		v &= 127;
		let s = 7, c;
		do {
			c = b[this.pos++];
			if (s < 28) v |= (c & 127) << s;
			else v += (c & 127) * 2 ** s;
			s += 7;
		} while (c >= 128);
		return v;
	}
	svarint() {
		const v = this.varint();
		return v % 2 === 1 ? -(v + 1) / 2 : v / 2;
	}
	skip(type) {
		if (type === 0) while (this.b[this.pos++] >= 128);
		else if (type === 2) this.pos += this.varint();
		else if (type === 5) this.pos += 4;
		else if (type === 1) this.pos += 8;
		else throw Error("pbf: wire type " + type);
	}
	bytes() {
		const n = this.varint(), s = this.pos;
		this.pos += n;
		return [s, this.pos];
	}
	string() {
		const [s, e] = this.bytes();
		return TD ? TD.decode(this.b.subarray(s, e)) : String.fromCharCode(...this.b.subarray(s, e));
	}
};
function readValue(p, end) {
	let v = null;
	while (p.pos < end) {
		const tag = p.varint(), f = tag >> 3, t = tag & 7;
		if (f === 1) v = p.string();
		else if (f === 2) {
			v = p.dv.getFloat32(p.pos, true);
			p.pos += 4;
		} else if (f === 3) {
			v = p.dv.getFloat64(p.pos, true);
			p.pos += 8;
		} else if (f === 4 || f === 5) v = p.varint();
		else if (f === 6) v = p.svarint();
		else if (f === 7) v = !!p.varint();
		else p.skip(t);
	}
	return v;
}
var Feature = class {
	constructor(layer, s, e) {
		this.layer = layer;
		this.s = s;
		this.e = e;
		this.id = void 0;
		this.type = 0;
		this.properties = {};
		this.g = null;
		const p = new Pbf(layer.buf);
		p.pos = s;
		while (p.pos < e) {
			const tag = p.varint(), f = tag >> 3, t = tag & 7;
			if (f === 1) this.id = p.varint();
			else if (f === 2) {
				const [a, b] = p.bytes();
				const q = new Pbf(layer.buf);
				q.pos = a;
				while (q.pos < b) {
					const k = layer.keys[q.varint()], v = layer.values[q.varint()];
					this.properties[k] = v;
				}
			} else if (f === 3) this.type = p.varint();
			else if (f === 4) this.g = p.bytes();
			else p.skip(t);
		}
	}
	loadGeometry() {
		const out = [];
		if (!this.g) return out;
		const p = new Pbf(this.layer.buf);
		p.pos = this.g[0];
		const end = this.g[1];
		let x = 0, y = 0, cmd = 0, len = 0, line = null;
		while (p.pos < end) {
			if (len <= 0) {
				const c = p.varint();
				cmd = c & 7;
				len = c >> 3;
			}
			len--;
			if (cmd === 1 || cmd === 2) {
				x += p.svarint();
				y += p.svarint();
				if (cmd === 1) {
					if (line) out.push(line);
					line = [];
				}
				line.push({
					x,
					y
				});
			} else if (cmd === 7) {
				if (line && line.length) line.push({
					x: line[0].x,
					y: line[0].y
				});
			} else throw Error("mvt: command " + cmd);
		}
		if (line) out.push(line);
		return out;
	}
};
var Layer = class {
	constructor(buf, s, e) {
		this.buf = buf;
		this.name = "";
		this.extent = 4096;
		this.version = 1;
		this.keys = [];
		this.values = [];
		this.f = [];
		const p = new Pbf(buf);
		p.pos = s;
		while (p.pos < e) {
			const tag = p.varint(), f = tag >> 3, t = tag & 7;
			if (f === 15) this.version = p.varint();
			else if (f === 1) this.name = p.string();
			else if (f === 2) this.f.push(p.bytes());
			else if (f === 3) this.keys.push(p.string());
			else if (f === 4) {
				const [a, b] = p.bytes();
				const q = new Pbf(buf);
				q.pos = a;
				this.values.push(readValue(q, b));
			} else if (f === 5) this.extent = p.varint();
			else p.skip(t);
		}
		this.length = this.f.length;
	}
	feature(i) {
		const [s, e] = this.f[i];
		return new Feature(this, s, e);
	}
};
function decodeTile(buffer, wanted) {
	const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), p = new Pbf(buf), out = {};
	while (p.pos < buf.length) {
		const tag = p.varint(), f = tag >> 3, t = tag & 7;
		if (f === 3) {
			const [s, e] = p.bytes();
			const L = new Layer(buf, s, e);
			if (!wanted || wanted.has(L.name)) out[L.name] = L;
		} else p.skip(t);
	}
	return out;
}
// web/city/landmarks_data.mts
const LANDMARKS = [{
	id: "lotte",
	name: "롯데월드타워",
	lngLat: [127.102655, 37.51254],
	hide: {
		radiusM: 48,
		minH: 140
	},
	seamDeg: 158,
	profile: [
		[
			0,
			45,
			.89
		],
		[
			147,
			43,
			.9
		],
		[
			183,
			41,
			.92
		],
		[
			290,
			32,
			.97
		],
		[
			392,
			22,
			1
		],
		[
			440,
			18.5,
			1
		],
		[
			500,
			15,
			1
		],
		[
			555,
			13,
			1
		]
	],
	roundness: 1.3,
	seam: {
		widthM: 2.6,
		depthM: 1.3
	},
	crown: {
		splitM: 465,
		gapTopM: 12,
		latticeFromM: 450
	},
	height: 555
}];
const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2;
const landmarkMerc = (L) => [mercX(L.lngLat[0]), mercY(L.lngLat[1])];
// web/city/parts.mts
const parts = /* @__PURE__ */ new Map();
function registerCityPart(key, impl) {
	if (parts.has(key) && parts.get(key).impl !== impl) throw new Error(`도시 부품 ${key}: 이미 다른 것이 등록됨`);
	if (!parts.has(key)) parts.set(key, {
		impl,
		part: Object.freeze({ ...impl })
	});
}
function cityPart(key) {
	const p = parts.get(key);
	if (!p) throw new Error(`도시 부품 ${key} 없음 — 그 콘텐츠 모듈을 먼저 불러야 한다`);
	return p.part;
}
// web/city/geom.mts
function signedArea2(r) {
	let a = 0;
	for (let i = 0, n = r.length; i < n; i += 2) {
		const j = (i + 2) % n;
		a += r[i] * r[j + 1] - r[j] * r[i + 1];
	}
	return a;
}
const area = (r) => Math.abs(signedArea2(r)) / 2;
function bbox(r) {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (let i = 0; i < r.length; i += 2) {
		const x = r[i], y = r[i + 1];
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
		if (y < y0) y0 = y;
		if (y > y1) y1 = y;
	}
	return [
		x0,
		y0,
		x1,
		y1
	];
}
function perimeter(r) {
	let p = 0;
	for (let i = 0, n = r.length; i < n; i += 2) {
		const j = (i + 2) % n;
		p += Math.hypot(r[j] - r[i], r[j + 1] - r[i + 1]);
	}
	return p;
}
function centroid(r) {
	let a = 0, cx = 0, cy = 0;
	for (let i = 0, n = r.length; i < n; i += 2) {
		const j = (i + 2) % n, c = r[i] * r[j + 1] - r[j] * r[i + 1];
		a += c;
		cx += (r[i] + r[j]) * c;
		cy += (r[i + 1] + r[j + 1]) * c;
	}
	if (Math.abs(a) < 1e-12) {
		let x = 0, y = 0;
		for (let i = 0; i < r.length; i += 2) {
			x += r[i];
			y += r[i + 1];
		}
		return [x / (r.length / 2), y / (r.length / 2)];
	}
	return [cx / (3 * a), cy / (3 * a)];
}
function pointInRing(x, y, r) {
	let inside = false;
	for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
		const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
		if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}
const pointInPolygon = (x, y, outer, holes) => pointInRing(x, y, outer) && !(holes && holes.some((h) => pointInRing(x, y, h)));
function edgeDistance(x, y, rings) {
	let best = Infinity;
	for (const r of rings) for (let i = 0, n = r.length; i < n; i += 2) {
		const j = (i + 2) % n, ax = r[i], ay = r[i + 1], bx = r[j] - ax, by = r[j + 1] - ay, l2 = bx * bx + by * by;
		let t = l2 ? ((x - ax) * bx + (y - ay) * by) / l2 : 0;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const dx = x - ax - bx * t, dy = y - ay - by * t, d = dx * dx + dy * dy;
		if (d < best) best = d;
	}
	return Math.sqrt(best);
}
function interiorPoint(outer, holes) {
	const [cx, cy] = centroid(outer);
	if (pointInPolygon(cx, cy, outer, holes)) return [cx, cy];
	const xs = [];
	for (const r of [outer, ...holes || []]) for (let i = 0, n = r.length; i < n; i += 2) {
		const j = (i + 2) % n, y0 = r[i + 1], y1 = r[j + 1];
		if (y0 > cy !== y1 > cy) xs.push(r[i] + (r[j] - r[i]) * (cy - y0) / (y1 - y0));
	}
	xs.sort((a, b) => a - b);
	let best = null, bw = -1;
	for (let i = 0; i + 1 < xs.length; i += 2) {
		const w = xs[i + 1] - xs[i];
		if (w > bw) {
			bw = w;
			best = (xs[i] + xs[i + 1]) / 2;
		}
	}
	return best == null ? [cx, cy] : [best, cy];
}
function simplifyRing(r, eps = 1e-9) {
	let pts = [];
	for (let i = 0; i < r.length; i += 2) {
		const x = r[i], y = r[i + 1], n = pts.length;
		if (n && Math.abs(pts[n - 2] - x) < eps && Math.abs(pts[n - 1] - y) < eps) continue;
		pts.push(x, y);
	}
	while (pts.length >= 4 && Math.abs(pts[0] - pts[pts.length - 2]) < eps && Math.abs(pts[1] - pts[pts.length - 1]) < eps) pts.length -= 2;
	for (let pass = 0, changed = true; changed && pass < 8 && pts.length >= 8; pass++) {
		changed = false;
		const out = [], n = pts.length / 2;
		for (let i = 0; i < n; i++) {
			const px = pts[(i + n - 1) % n * 2], py = pts[(i + n - 1) % n * 2 + 1], x = pts[i * 2], y = pts[i * 2 + 1], nx = pts[(i + 1) % n * 2], ny = pts[(i + 1) % n * 2 + 1];
			const cross = (x - px) * (ny - y) - (y - py) * (nx - x);
			if (Math.abs(cross) <= eps * (Math.hypot(x - px, y - py) + Math.hypot(nx - x, ny - y)) && out.length / 2 + (n - i - 1) >= 3) {
				changed = true;
				continue;
			}
			out.push(x, y);
		}
		pts = out;
	}
	return pts;
}
function classifyRings(rings) {
	const polys = [];
	let cur = null;
	for (let i = 0; i < rings.length; i++) {
		const r = rings[i];
		if (r.length < 6) continue;
		const a = signedArea2(r);
		if (a === 0) continue;
		if (a > 0) {
			cur = {
				outer: r,
				holes: [],
				area2: a,
				idx: i
			};
			polys.push(cur);
		} else if (cur) cur.holes.push(r);
	}
	return polys;
}
function clipRing(r, x0, y0, x1, y1) {
	let pts = r;
	for (let side = 0; side < 4 && pts.length; side++) {
		const out = [], n = pts.length;
		const inside = (x, y) => side === 0 ? x >= x0 : side === 1 ? x <= x1 : side === 2 ? y >= y0 : y <= y1;
		for (let i = 0; i < n; i += 2) {
			const j = (i + 2) % n, ax = pts[i], ay = pts[i + 1], bx = pts[j], by = pts[j + 1], ia = inside(ax, ay), ib = inside(bx, by);
			if (ia !== ib) {
				let t, px, py;
				if (side < 2) {
					const cx = side === 0 ? x0 : x1;
					t = (cx - ax) / (bx - ax);
					px = cx;
					py = ay + (by - ay) * t;
				} else {
					const cy = side === 2 ? y0 : y1;
					t = (cy - ay) / (by - ay);
					py = cy;
					px = ax + (bx - ax) * t;
				}
				out.push(px, py);
			}
			if (ib) out.push(bx, by);
		}
		pts = out;
	}
	return pts.length >= 6 ? simplifyRing(pts) : [];
}
const ringInBox = (r, x0, y0, x1, y1) => {
	for (let i = 0; i < r.length; i += 2) if (r[i] < x0 || r[i] > x1 || r[i + 1] < y0 || r[i + 1] > y1) return false;
	return true;
};
function insetRing(r, d, dir = 1) {
	const n = r.length / 2, out = new Array(r.length);
	const a2 = signedArea2(r), s = (a2 > 0 ? 1 : -1) * dir;
	for (let i = 0; i < n; i++) {
		const p = (i + n - 1) % n, q = (i + 1) % n;
		const x = r[i * 2], y = r[i * 2 + 1];
		let e0x = x - r[p * 2], e0y = y - r[p * 2 + 1], e1x = r[q * 2] - x, e1y = r[q * 2 + 1] - y;
		const l0 = Math.hypot(e0x, e0y) || 1, l1 = Math.hypot(e1x, e1y) || 1;
		e0x /= l0;
		e0y /= l0;
		e1x /= l1;
		e1y /= l1;
		const n0x = -e0y * s, n0y = e0x * s, n1x = -e1y * s, n1y = e1x * s;
		let mx = n0x + n1x, my = n0y + n1y;
		const ml = Math.hypot(mx, my);
		if (ml < 1e-9) {
			mx = n0x;
			my = n0y;
		} else {
			mx /= ml;
			my /= ml;
		}
		const k = d / Math.max(.25, mx * n0x + my * n0y);
		out[i * 2] = x + mx * k;
		out[i * 2 + 1] = y + my * k;
	}
	const b2 = signedArea2(out);
	if (b2 === 0 || b2 > 0 !== a2 > 0) return null;
	for (let i = 0; i < n; i++) {
		const q = (i + 1) % n, ox = r[q * 2] - r[i * 2], oy = r[q * 2 + 1] - r[i * 2 + 1], nx = out[q * 2] - out[i * 2], ny = out[q * 2 + 1] - out[i * 2 + 1];
		if (ox * nx + oy * ny <= 0) return null;
	}
	const expect = Math.abs(a2) / 2 - perimeter(r) * d;
	if (expect <= 0 || Math.abs(b2) / 2 < expect * .5) return null;
	return out;
}
function orientedBox(r) {
	const n = r.length / 2;
	let best = null;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n, dx = r[j * 2] - r[i * 2], dy = r[j * 2 + 1] - r[i * 2 + 1], l = Math.hypot(dx, dy);
		if (l < 1e-9) continue;
		const ux = dx / l, uy = dy / l;
		let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
		for (let k = 0; k < n; k++) {
			const x = r[k * 2], y = r[k * 2 + 1], u = x * ux + y * uy, v = -x * uy + y * ux;
			if (u < u0) u0 = u;
			if (u > u1) u1 = u;
			if (v < v0) v0 = v;
			if (v > v1) v1 = v;
		}
		const a = (u1 - u0) * (v1 - v0);
		if (!best || a < best.a) best = {
			a,
			ux,
			uy,
			u0,
			u1,
			v0,
			v1
		};
	}
	if (!best) return null;
	let { ux, uy, u0, u1, v0, v1 } = best, hw = (u1 - u0) / 2, hh = (v1 - v0) / 2;
	const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, cx = cu * ux - cv * uy, cy = cu * uy + cv * ux;
	if (hh > hw) {
		[hw, hh] = [hh, hw];
		[ux, uy] = [-uy, ux];
	}
	return {
		cx,
		cy,
		hw,
		hh,
		ux,
		uy,
		ang: Math.atan2(uy, ux),
		area: best.a
	};
}
function deepestPoint(outer, holes, cells = 12) {
	const [x0, y0, x1, y1] = bbox(outer), rings = [outer, ...holes || []];
	let bx = NaN, by = NaN, bd = -1;
	const probe = (x, y) => {
		if (!pointInPolygon(x, y, outer, holes)) return;
		const d = edgeDistance(x, y, rings);
		if (d > bd) {
			bd = d;
			bx = x;
			by = y;
		}
	};
	const sx = (x1 - x0) / cells, sy = (y1 - y0) / cells;
	for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) probe(x0 + (i + .5) * sx, y0 + (j + .5) * sy);
	if (bd < 0) {
		const p = interiorPoint(outer, holes);
		return {
			x: p[0],
			y: p[1],
			d: edgeDistance(p[0], p[1], rings)
		};
	}
	for (let step = Math.max(sx, sy) / 2, it = 0; it < 3; it++, step /= 2) {
		const cx = bx, cy = by;
		for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) probe(cx + i * step, cy + j * step);
	}
	return {
		x: bx,
		y: by,
		d: bd
	};
}
function Node(i, x, y) {
	this.i = i;
	this.x = x;
	this.y = y;
	this.prev = null;
	this.next = null;
	this.steiner = false;
}
function insertNode(i, x, y, last) {
	const p = new Node(i, x, y);
	if (!last) {
		p.prev = p;
		p.next = p;
	} else {
		p.next = last.next;
		p.prev = last;
		last.next.prev = p;
		last.next = p;
	}
	return p;
}
function removeNode(p) {
	p.next.prev = p.prev;
	p.prev.next = p.next;
}
const eq = (a, b) => a.x === b.x && a.y === b.y;
const tarea = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
function linkedList(data, start, end, clockwise) {
	let last = null, sum = 0;
	for (let i = start, j = end - 2; i < end; j = i, i += 2) sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
	let i;
	if (clockwise === sum > 0) for (i = start; i < end; i += 2) last = insertNode(i / 2, data[i], data[i + 1], last);
	else for (i = end - 2; i >= start; i -= 2) last = insertNode(i / 2, data[i], data[i + 1], last);
	if (last && eq(last, last.next)) {
		removeNode(last);
		last = last.next;
	}
	return last;
}
function filterPoints(start, end) {
	if (!start) return start;
	if (!end) end = start;
	let p = start, again;
	do {
		again = false;
		if (!p.steiner && (eq(p, p.next) || tarea(p.prev, p, p.next) === 0)) {
			removeNode(p);
			p = end = p.prev;
			if (p === p.next) break;
			again = true;
		} else p = p.next;
	} while (again || p !== end);
	return end;
}
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
	return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}
function isEar(ear) {
	const a = ear.prev, b = ear, c = ear.next;
	if (tarea(a, b, c) >= 0) return false;
	const x0 = Math.min(a.x, b.x, c.x), y0 = Math.min(a.y, b.y, c.y), x1 = Math.max(a.x, b.x, c.x), y1 = Math.max(a.y, b.y, c.y);
	let p = c.next;
	while (p !== a) {
		if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && tarea(p.prev, p, p.next) >= 0) return false;
		p = p.next;
	}
	return true;
}
function intersects(p1, q1, p2, q2) {
	const sign = (v) => v > 0 ? 1 : v < 0 ? -1 : 0;
	const o1 = sign(tarea(p1, q1, p2)), o2 = sign(tarea(p1, q1, q2)), o3 = sign(tarea(p2, q2, p1)), o4 = sign(tarea(p2, q2, q1));
	if (o1 !== o2 && o3 !== o4) return true;
	const onSeg = (p, q, r) => q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
	if (o1 === 0 && onSeg(p1, p2, q1)) return true;
	if (o2 === 0 && onSeg(p1, q2, q1)) return true;
	if (o3 === 0 && onSeg(p2, p1, q2)) return true;
	if (o4 === 0 && onSeg(p2, q1, q2)) return true;
	return false;
}
function intersectsPolygon(a, b) {
	let p = a;
	do {
		if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true;
		p = p.next;
	} while (p !== a);
	return false;
}
const locallyInside = (a, b) => tarea(a.prev, a, a.next) < 0 ? tarea(a, b, a.next) >= 0 && tarea(a, a.prev, b) >= 0 : tarea(a, b, a.prev) < 0 || tarea(a, a.next, b) < 0;
function middleInside(a, b) {
	let p = a, inside = false;
	const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
	do {
		if (p.y > py !== p.next.y > py && p.next.y !== p.y && px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x) inside = !inside;
		p = p.next;
	} while (p !== a);
	return inside;
}
const isValidDiagonal = (a, b) => a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) && (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (tarea(a.prev, a, b.prev) || tarea(a, b.prev, b)) || eq(a, b) && tarea(a.prev, a, a.next) > 0 && tarea(b.prev, b, b.next) > 0);
function splitPolygon(a, b) {
	const a2 = new Node(a.i, a.x, a.y), b2 = new Node(b.i, b.x, b.y), an = a.next, bp = b.prev;
	a.next = b;
	b.prev = a;
	a2.next = an;
	an.prev = a2;
	b2.next = a2;
	a2.prev = b2;
	bp.next = b2;
	b2.prev = bp;
	return b2;
}
function cureLocalIntersections(start, tris) {
	let p = start;
	do {
		const a = p.prev, b = p.next.next;
		if (!eq(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
			tris.push(a.i, p.i, b.i);
			removeNode(p);
			removeNode(p.next);
			p = start = b;
		}
		p = p.next;
	} while (p !== start);
	return filterPoints(p);
}
function splitEarcut(start, tris) {
	let a = start;
	do {
		let b = a.next.next;
		while (b !== a.prev) {
			if (a.i !== b.i && isValidDiagonal(a, b)) {
				let c = splitPolygon(a, b);
				a = filterPoints(a, a.next);
				c = filterPoints(c, c.next);
				earcutLinked(a, tris, 0);
				earcutLinked(c, tris, 0);
				return;
			}
			b = b.next;
		}
		a = a.next;
	} while (a !== start);
}
function earcutLinked(ear, tris, pass) {
	if (!ear) return;
	let stop = ear, prev, next;
	while (ear.prev !== ear.next) {
		prev = ear.prev;
		next = ear.next;
		if (isEar(ear)) {
			tris.push(prev.i, ear.i, next.i);
			removeNode(ear);
			ear = next.next;
			stop = next.next;
			continue;
		}
		ear = next;
		if (ear === stop) {
			if (!pass) earcutLinked(filterPoints(ear), tris, 1);
			else if (pass === 1) {
				ear = cureLocalIntersections(filterPoints(ear), tris);
				earcutLinked(ear, tris, 2);
			} else if (pass === 2) splitEarcut(ear, tris);
			break;
		}
	}
}
function getLeftmost(start) {
	let p = start, m = start;
	do {
		if (p.x < m.x || p.x === m.x && p.y < m.y) m = p;
		p = p.next;
	} while (p !== start);
	return m;
}
const sectorContainsSector = (m, p) => tarea(m.prev, m, p.prev) < 0 && tarea(p.next, m, m.next) < 0;
function findHoleBridge(hole, outerNode) {
	let p = outerNode, qx = -Infinity, m;
	const hx = hole.x, hy = hole.y;
	do {
		if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
			const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
			if (x <= hx && x > qx) {
				qx = x;
				m = p.x < p.next.x ? p : p.next;
				if (x === hx) return m;
			}
		}
		p = p.next;
	} while (p !== outerNode);
	if (!m) return null;
	const stop = m, mx = m.x, my = m.y;
	let tanMin = Infinity, tan;
	p = m;
	do {
		if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
			tan = Math.abs(hy - p.y) / (hx - p.x);
			if (locallyInside(p, hole) && (tan < tanMin || tan === tanMin && (p.x > m.x || p.x === m.x && sectorContainsSector(m, p)))) {
				m = p;
				tanMin = tan;
			}
		}
		p = p.next;
	} while (p !== stop);
	return m;
}
function eliminateHole(hole, outerNode) {
	const bridge = findHoleBridge(hole, outerNode);
	if (!bridge) return outerNode;
	const bridgeReverse = splitPolygon(bridge, hole);
	filterPoints(bridgeReverse, bridgeReverse.next);
	return filterPoints(bridge, bridge.next);
}
function triangulate(outer, holes) {
	const data = holes && holes.length ? outer.concat(...holes) : outer;
	const outerLen = outer.length, tris = [];
	let outerNode = linkedList(data, 0, outerLen, true);
	if (!outerNode || outerNode.next === outerNode.prev) return tris;
	if (holes && holes.length) {
		const queue = [];
		let start = outerLen;
		for (const h of holes) {
			const list = linkedList(data, start, start + h.length, false);
			if (list) {
				if (list === list.next) list.steiner = true;
				queue.push(getLeftmost(list));
			}
			start += h.length;
		}
		queue.sort((a, b) => a.x - b.x);
		for (const q of queue) outerNode = eliminateHole(q, outerNode);
	}
	earcutLinked(outerNode, tris, 0);
	return tris;
}
// web/city/mesh.mts
const HANOK_KIND = {
	ROOF: 8,
	WALL: 9,
	DAM: 10,
	THATCH: 11,
	STONE: 12
};
const EARTH = 40075016.68557849;
const RAD = Math.PI / 180;
const CITY_LAT = 37.53;
const G$1 = [.8527222222222222, .5 - Math.log(Math.tan(Math.PI / 4 + CITY_LAT * RAD / 2)) / (2 * Math.PI)];
const S = EARTH * Math.cos(CITY_LAT * RAD);
const TYPES = [
	"house",
	"apartment",
	"shop",
	"office",
	"industrial",
	"civic"
];
const PATTERNS = {
	punched: 0,
	"vertical-balconies": 1,
	"horizontal-bands": 2,
	"curtain-wall": 3,
	clerestory: 4,
	"regular-grid": 5
};
const KIND = {
	WALL: 0,
	ROOF: 1,
	PARAPET: 2,
	EQUIP: 3,
	PITCHED: 4,
	AWNING: 5,
	HALL: 6,
	SIGN: 7,
	GIWA: HANOK_KIND.ROOF,
	HANOK: HANOK_KIND.WALL,
	DAM: HANOK_KIND.DAM
};
const RAIL_Q = {
	base: 10,
	step: .25
};
const FLAG = {
	ABS_U: 1,
	MERGED: 2,
	STOREFRONT: 4,
	NO_AO: 8
};
const OVERLAP = {
	touchShare: .1,
	nestedShare: .6,
	redundantShare: .9,
	insetM: .05,
	lowerM: .08
};
const LANDUSE_ALIASES = {
	library: "civic",
	kindergarten: "school",
	government: "civic",
	townhall: "civic"
};
const mix32 = (a, b, c = 0, d = 0) => {
	let x = Math.imul(a ^ 2654435769, 2246822507) ^ Math.imul(b + 1799596469, 3266489909) ^ Math.imul(c + 668265263, 374761393) ^ Math.imul(d + 461845907, 3432918353);
	x ^= x >>> 15;
	x = Math.imul(x, 739982445);
	x ^= x >>> 12;
	x = Math.imul(x, 695872825);
	x ^= x >>> 15;
	return x >>> 0;
};
const unit = (h, k) => (mix32(h, k * 40503 + 17) >>> 8) / 16777216;
const pick = (weights, r) => {
	let acc = 0;
	for (let i = 0; i < weights.length; i++) {
		acc += weights[i];
		if (r < acc) return i;
	}
	return weights.length - 1;
};
const hexRGB = (h) => {
	h = String(h || "#888888");
	return [
		parseInt(h.slice(1, 3), 16) / 255,
		parseInt(h.slice(3, 5), 16) / 255,
		parseInt(h.slice(5, 7), 16) / 255
	];
};
const num = (v, d) => Number.isFinite(+v) ? +v : d;
const COS_CORNER = Math.cos(20 * RAD);
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
	const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
	if (Math.abs(den) < 1e-12) return -1;
	const qx = cx - ax, qy = cy - ay, t = (qx * sy - qy * sx) / den, s = (qx * ry - qy * rx) / den;
	return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? t : -1;
}
function pathNear(px, py, G) {
	let d = Infinity, ux = 1, uy = 0;
	for (let s = 0; s < G.length; s += 4) {
		const ax = G[s], ay = G[s + 1], vx = G[s + 2] - ax, vy = G[s + 3] - ay, l2 = vx * vx + vy * vy, t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0, dd = Math.hypot(px - ax - vx * t, py - ay - vy * t);
		if (dd < d) {
			d = dd;
			const l = Math.sqrt(l2) || 1;
			ux = vx / l;
			uy = vy / l;
		}
	}
	return {
		d,
		ux,
		uy
	};
}
function realCorners(ring) {
	const n = ring.length / 2, out = new Array(n);
	for (let i = 0; i < n; i++) {
		const k = (i + n - 1) % n, j = (i + 1) % n, x = ring[i * 2], y = ring[i * 2 + 1], dx1 = x - ring[k * 2], dy1 = y - ring[k * 2 + 1], dx2 = ring[j * 2] - x, dy2 = ring[j * 2 + 1] - y, l1 = Math.hypot(dx1, dy1), l2 = Math.hypot(dx2, dy2);
		out[i] = l1 > 0 && l2 > 0 && (dx1 * dx2 + dy1 * dy2) / (l1 * l2) < COS_CORNER;
	}
	return out;
}
function resolvePack(pack) {
	const B = pack.buildings || {}, D = pack.buildingDefaults || {}, C = pack.classification || {}, L = pack.lighting || {}, M = pack.modes || {}, LOD = pack.lod || {};
	const TB = pack.throughBuildings || {}, FF = pack.facadeFaces || {}, FT = FF.byType || {}, mScale = num(FT.office?.masonry?.windowScale, 1);
	const types = TYPES.map((t) => {
		const b = B[t] || {}, gf = b.groundFloor || {}, n = b.night || {}, roof = b.roof || {};
		return {
			key: t,
			floorM: num(b.floorM, 3.2),
			bayM: num(b.bayM, 3),
			winW: num(b.windowRatio?.[0], .5) * num(FF.windowScale?.[t], 1),
			winH: num(b.windowRatio?.[1], .5),
			pattern: PATTERNS[b.pattern] ?? 5,
			minPier: num(FF.minPierM?.[t], 0),
			facePolicy: FT[t] || null,
			groundM: num(gf.heightM, 3.5),
			groundGlass: num(gf.glassRatio, .5),
			groundColor: gf.colors || null,
			storefront: gf.storefrontLanduse || null,
			litRatio: num(n.litRatio, .3),
			groundLit: num(n.groundFloorLitRatio, n.litRatio ?? .3),
			tempW: n.temperatureWeights || [
				.5,
				.4,
				.1
			],
			litByLanduse: n.landuseLitRatio || null,
			wall: b.wall || {
				light: ["#bbbbbb"],
				dark: ["#555555"]
			},
			roof: roof.flat || {
				light: "#888888",
				dark: "#333333"
			},
			parapetM: num(roof.parapetM, .5),
			pitched: roof.pitched || null,
			panel: roof.panel || null,
			glass: b.glass || null,
			mullionM: num(b.mullionM, .12),
			beltEvery: num(b.beltEveryFloors, 0),
			beltM: num(b.beltHeightM, .35),
			balconyEvery: num(b.balconyEveryBays, 0),
			balconyBright: num(b.balconyBrightness, 1.07),
			spandrelM: num(b.spandrelM, 0),
			ribM: num(b.ribSpacingM, 0),
			baysPerGroup: b.baysPerGroup || null,
			awning: b.awning || null,
			setback: b.setback || null,
			mix: b.materialMix || null,
			roofVariants: roof.variants || null,
			roofVariantW: roof.variantWeights || null,
			nightEmission: num(n.emission, NaN),
			nightGroundEmission: num(n.groundFloorEmission, NaN),
			nightFloorMul: n.floorProbabilityMultiplier || null,
			nightWin: n.windowRatio || null,
			tiers: n.brightnessTiers || null,
			maxContig: num(n.maxContiguousLitBays, 0),
			articulation: b.articulation || null,
			dayReflection: b.dayReflection || null
		};
	});
	const eq = D.equipment || {}, lit = D.litWindows || {}, wp = D.waterproofRoof || {};
	const fams = pack.materialFamilies || null, A = pack.materialAssignment || {}, materials = [], famIndex = {};
	const at = (arr, v) => arr && arr.length ? arr[v % arr.length] : null;
	if (fams) for (const [key, f] of Object.entries(fams)) {
		const n = Math.max(1, f.wall?.light?.length || 1), fac = f.facade || {};
		famIndex[key] = {
			base: materials.length,
			n,
			weights: f.variantWeights || [
				.5,
				.3,
				.2
			],
			hasRoof: !!f.roof
		};
		for (let v = 0; v < n; v++) materials.push({
			family: key,
			kind: f.kind || "",
			wall: {
				light: at(f.wall.light, v),
				dark: at(f.wall.dark || f.wall.light, v)
			},
			glass: f.glass ? {
				light: at(f.glass.light, v),
				dark: at(f.glass.dark || f.glass.light, v)
			} : null,
			roof: f.roof ? {
				light: at(f.roof.light, v),
				dark: at(f.roof.dark || f.roof.light, v)
			} : null,
			pattern: fac.pattern && fac.pattern !== "type-default" ? PATTERNS[fac.pattern] ?? -1 : -1,
			winW: num(fac.windowRatio?.[0], 0) * (f.kind === "glass" ? 1 : mScale),
			winH: num(fac.windowRatio?.[1], 0),
			refl: num(fac.reflectionScale, .1),
			bayM: num(fac.bayM, 0),
			glassKind: f.kind === "glass"
		});
	}
	const wallWeights = D.wallWeights || [
		.4,
		.3,
		.2,
		.1
	];
	for (const T of types) {
		T.mats = [];
		if (fams && T.mix) for (const m of T.mix) {
			const F = famIndex[m.family];
			if (!F) continue;
			for (let v = 0; v < F.n; v++) T.mats.push([F.base + v, num(m.weight, 0) * num(F.weights[v], 0)]);
		}
		if (!T.mats.length) {
			const base = materials.length, cols = T.wall.light || ["#999999"], dcols = T.wall.dark || cols;
			for (let v = 0; v < 4; v++) materials.push({
				family: "type-" + T.key,
				kind: "",
				wall: {
					light: cols[Math.min(v, cols.length - 1)],
					dark: dcols[Math.min(v, dcols.length - 1)]
				},
				glass: null,
				roof: null,
				pattern: -1,
				winW: 0,
				winH: 0,
				refl: T.key === "office" ? .85 : .1,
				bayM: 0,
				glassKind: T.key === "office" && T.pattern === 3
			});
			T.mats = wallWeights.map((w, v) => [base + v, w]);
		}
		const sum = T.mats.reduce((a, m) => a + m[1], 0) || 1;
		for (const m of T.mats) m[1] /= sum;
		T.famFacade = String(A.facadePolicyByType?.[T.key] || "").startsWith("use-family");
	}
	const pierBay = (bay, pattern, winW, pier) => pattern === 3 || pattern < 0 ? bay : Math.max(bay, pier / Math.max(.05, 1 - winW));
	for (const T of types) T.bayEff = pierBay(T.bayM, T.pattern, T.winW, T.minPier);
	const officeT = types.find((T) => T.key === "office") || types[0];
	for (const m of materials) m.bayEff = pierBay(m.bayM || officeT.bayM, m.pattern, m.winW || officeT.winW, officeT.minPier);
	const roofs = materials.map((m) => m.roof);
	for (const T of types) {
		T.roofVarBase = roofs.length;
		const rv = T.roofVariants;
		for (let v = 0; v < 4; v++) roofs.push(rv ? {
			light: at(rv.light, v),
			dark: at(rv.dark || rv.light, v)
		} : null);
	}
	const waterSlot = roofs.length;
	roofs.push(wp.colors || {
		light: "#7D9282",
		dark: "#3A5047"
	});
	for (const T of types) {
		T.legacyRoofSlot = roofs.length;
		roofs.push(T.roof);
	}
	return {
		materials,
		famIndex,
		roofs,
		waterSlot,
		variantSalt: num(A.variantSeedSalt, 173),
		roofSalt: num(A.roofSeedSalt, 431),
		roofPriority: A.roofPriority || [
			"waterproof-subset",
			"type-roof-variants",
			"family-roof",
			"legacy-flat"
		],
		roofPriorityByType: A.roofPriorityByType || {},
		lodPx: [num(D.windowBandMinPx, .65), num(D.windowCellMinPx, 1.25)],
		pack,
		types,
		byKey: Object.fromEntries(types.map((t, i) => [t.key, i])),
		rules: C.rules || [],
		minH: num(C.minimumHeightM, 3),
		missingH: num(C.missingHeightM, 9),
		merged: C.mergedLowrise || {
			maxHeightM: 15,
			areaGreaterThanM2: 1200
		},
		equalAreaPriority: C.equalAreaPriority || [],
		landuseAliases: {
			...LANDUSE_ALIASES,
			...C.landuseAliases || {}
		},
		wallWeights,
		parapetT: num(D.parapetThicknessM, .18),
		edgeClear: num(D.roofEquipmentEdgeClearanceM, .6),
		glass: D.glass || {
			light: "#52696C",
			dark: "#1B2B33"
		},
		lit: {
			colors: (lit.colors || [
				"#FFD59A",
				"#FFE7BD",
				"#DDEAF0"
			]).map(hexRGB),
			emission: num(lit.emission, .7),
			groundEmission: num(lit.groundFloorEmission, .9),
			floorMul: lit.floorProbabilityMultiplier || [.65, 1.2]
		},
		equip: {
			minZoom: num(eq.minZoom, 16),
			minH: num(eq.minHeightM, 12),
			minA: num(eq.minAreaM2, 120),
			penthouseArea: eq.penthouseAreaRatio || [.04, .07],
			penthouseH: num(eq.penthouseHeightM, 1.8),
			hvacCount: eq.hvacCount || [1, 3],
			hvacSize: eq.hvacSizeM || [
				1.6,
				1,
				.9
			],
			colors: eq.colors || {
				light: "#A7ADA5",
				dark: "#4D5C59"
			}
		},
		signs: pack.signs || null,
		hanok: pack.hanok || null,
		race: pack.race || null,
		nation: pack.nation || null,
		waterproof: {
			maxH: num(wp.maxHeightM, 15),
			p: num(wp.probability, .35),
			colors: wp.colors || {
				light: "#7D9282",
				dark: "#3A5047"
			}
		},
		light: L.light || {
			ambient: .64,
			directional: .36,
			color: "#FFF1D8",
			maxSideDarken: .2,
			maxRoofBrighten: .08
		},
		dark: L.dark || {
			ambient: .72,
			directional: .28,
			color: "#BCD0D6"
		},
		ao: L.ao || {
			opacity: .1,
			widthM: .5
		},
		refSun: L.referenceSun || {
			azimuthDeg: 225,
			elevationDeg: 42
		},
		modes: M,
		lod: {
			equipment: LOD.roofEquipment || [16, 16.5],
			windows: LOD.windows || [15, 16]
		},
		faces: {
			gap: num(FF.neighbourGapM, 3),
			open: num(FF.openDistanceM, 8),
			minFace: num(FF.minFaceWidthM, 6),
			slab: num(FF.slabAspect, 1.5),
			primaryOnlyMaxA: num(FF.primaryOnlyMaxAreaM2, 600)
		},
		xray: (() => {
			const X = pack.xray || {};
			return {
				alpha: num(X.alpha, .3),
				edgeAlpha: num(X.edgeAlpha, .75),
				edgePx: num(X.edgePx, 1.5),
				featherPx: num(X.featherPx, 24),
				fadeMs: num(X.fadeMs, 200),
				maxTargets: Math.max(1, num(X.maxTargets, 48)),
				pieceM: Math.max(5, num(X.pieceM, 30)),
				platformMarginM: num(X.platformMarginM, 4),
				platformBelowM: num(X.platformBelowM, 2.5),
				platformAboveM: num(X.platformAboveM, 6),
				trainHalfWidthM: num(X.trainHalfWidthM, 3),
				trainBelowM: num(X.trainBelowM, 1),
				trainAboveM: num(X.trainAboveM, 4.5),
				trains: X.trains !== false,
				on: pack.xray !== null
			};
		})(),
		through: {
			railM: num(TB.railHeightM, num(pack.viaduct?.railHeightM, 11)),
			below: num(TB.bandBelowM, 2),
			above: num(TB.bandAboveM, 4.6),
			glass: TB.glass || {},
			frame: TB.frame || {},
			inside: TB.insideLight || {},
			mullEvery: Math.max(.3, num(TB.mullionEveryM, 1.5)),
			mull: num(TB.mullionM, .08),
			portalHalf: Math.max(1, num(TB.portalHalfM, 12)),
			near: Math.max(0, num(TB.alongsideM, 8)),
			skyMix: num(TB.skyMix, .4),
			insideMix: num(TB.insideMix, .3),
			nightEmission: num(TB.nightEmission, 1.7),
			depthOpen: TB.depthOpen !== false
		}
	};
}
function classifyBuilding(info, P) {
	const H = info.heightM, A = info.areaM2, L = info.landuse || "unknown";
	let type = "shop";
	for (const r of P.rules) {
		if (r.landuse && !r.landuse.includes(L)) continue;
		if (r.excludedLanduse && r.excludedLanduse.includes(L)) continue;
		if (r.minHeightM != null && H < r.minHeightM) continue;
		if (r.maxHeightM != null && H > r.maxHeightM) continue;
		if (r.minAreaM2 != null && A < r.minAreaM2) continue;
		if (r.maxAreaM2 != null && A > r.maxAreaM2) continue;
		type = r.type;
		break;
	}
	const m = P.merged, mergedLowrise = H <= num(m.maxHeightM, 15) && A > num(m.areaGreaterThanM2, 1200);
	return {
		type,
		mergedLowrise
	};
}
const INST_STRIDES = {
	skirt: 32,
	roof: 64,
	box: 40
};
function packModels(recs) {
	if (!recs || !recs.length) return null;
	recs.sort((a, b) => a[0] - b[0]);
	const buf = /* @__PURE__ */ new ArrayBuffer(recs.length * 40), f = new Float32Array(buf), u8 = new Uint8Array(buf), groups = [];
	recs.forEach((r, i) => {
		const o = i * 40;
		for (let k = 0; k < 8; k++) f[o / 4 + k] = r[1 + k];
		for (let k = 0; k < 8; k++) u8[o + 32 + k] = r[9 + k];
		if (!groups.length || groups[groups.length - 1][0] !== r[0]) groups.push([
			r[0],
			i,
			0
		]);
		groups[groups.length - 1][2]++;
	});
	return {
		data: u8,
		groups
	};
}
var Writer = class {
	constructor() {
		this.cap = 32768;
		this.buf = /* @__PURE__ */ new ArrayBuffer(this.cap * 32);
		this.view();
		this.n = 0;
		this.kind = 0;
		this.nx = 0;
		this.ny = 0;
		this.nz = 1;
		this.w = [
			0,
			0,
			0,
			0
		];
		this.b = [
			0,
			0,
			0,
			0
		];
		this.m = [
			0,
			0,
			0,
			0
		];
	}
	view() {
		this.f = new Float32Array(this.buf);
		this.u8 = new Uint8Array(this.buf);
		this.i8 = new Int8Array(this.buf);
	}
	grow() {
		const nb = /* @__PURE__ */ new ArrayBuffer(this.cap * 2 * 32);
		new Uint8Array(nb).set(this.u8);
		this.buf = nb;
		this.cap *= 2;
		this.view();
	}
	normal(nx, ny, nz) {
		this.nx = nx;
		this.ny = ny;
		this.nz = nz;
	}
	v(x, y, z, u) {
		if (this.n >= this.cap) this.grow();
		const i = this.n++, f = i * 8, o = i * 32;
		this.f[f] = x;
		this.f[f + 1] = y;
		this.f[f + 2] = z;
		this.f[f + 4] = u;
		this.i8[o + 12] = Math.round(this.nx * 127);
		this.i8[o + 13] = Math.round(this.ny * 127);
		this.i8[o + 14] = Math.round(this.nz * 127);
		this.i8[o + 15] = this.kind;
		const u8 = this.u8;
		u8[o + 20] = this.w[0];
		u8[o + 21] = this.w[1];
		u8[o + 22] = this.w[2];
		u8[o + 23] = this.w[3];
		u8[o + 24] = this.b[0];
		u8[o + 25] = this.b[1];
		u8[o + 26] = this.b[2];
		u8[o + 27] = this.b[3];
		u8[o + 28] = this.m[0];
		u8[o + 29] = this.m[1];
		u8[o + 30] = this.m[2];
		u8[o + 31] = this.m[3];
		return i;
	}
	bytes() {
		return this.u8.subarray(0, this.n * 32);
	}
};
var TileBuilder = class {
	constructor(src, P, opts) {
		this.src = src;
		this.P = P;
		this.opts = opts;
		this.E = src.extent || 4096;
		this.through = opts.through || null;
		const n = 2 ** src.z, lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * src.y / n))) + Math.atan(Math.sinh(Math.PI * (1 - 2 * (src.y + 1) / n)))) / 2;
		this.unit = 1 / n / this.E;
		this.mpu = 1 / (EARTH * Math.cos(lat));
		this.mPerUnit = this.unit / this.mpu;
		this.ox = src.x / n;
		this.oy = src.y / n;
		this.wox = (this.ox - G$1[0]) * S;
		this.woy = (this.oy - G$1[1]) * S;
		this.W = new Writer();
		this.chunks = [];
		for (let i = 0; i < 16; i++) this.chunks.push({
			lo: [],
			walls: [],
			hi: [],
			inst: {
				skirt: [],
				roof: [],
				box: []
			},
			instFar: {
				skirt: [],
				roof: [],
				box: []
			},
			x0: Infinity,
			y0: Infinity,
			x1: -Infinity,
			y1: -Infinity,
			zmax: 0,
			n: 0
		});
		this.zmax = 0;
		this.count = 0;
		this.fi = 0;
		this.polys = null;
		this.pi = 0;
		this.landuse = null;
		this.done = false;
		this.seen = /* @__PURE__ */ new Set();
		this.items = [];
		this.blockers = [];
		this.ei = 0;
		this.grid = null;
		this.models = null;
		this.marks = [...LANDMARKS, ...(P.pack?.landmarkHide || []).map((h) => ({
			lngLat: h.lngLat,
			hide: h
		}))].map((L) => {
			const [mx, my] = landmarkMerc(L);
			return {
				x: (mx - this.ox) / this.unit,
				y: (my - this.oy) / this.unit,
				r: L.hide.radiusM / this.mPerUnit,
				minH: L.hide.minH
			};
		}).filter((m) => m.x > -m.r - this.E && m.x < 2 * this.E + m.r && m.y > -m.r - this.E && m.y < 2 * this.E + m.r);
	}
	landmarkPart(flat, H) {
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		for (const a of flat) for (let i = 0; i < a.length; i += 2) {
			if (a[i] < x0) x0 = a[i];
			if (a[i] > x1) x1 = a[i];
			if (a[i + 1] < y0) y0 = a[i + 1];
			if (a[i + 1] > y1) y1 = a[i + 1];
		}
		const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
		return this.marks.some((m) => H >= m.minH && Math.hypot(cx - m.x, cy - m.y) < m.r && Math.max(x1 - x0, y1 - y0) < 2.5 * m.r);
	}
	step(budget) {
		const t0 = performance.now(), bl = this.src.buildings;
		if (!this.landuse) this.landuse = this.readLanduse();
		if (!bl) {
			this.done = true;
			return true;
		}
		while (this.fi < bl.length) {
			if (!this.polys) {
				const f = bl.feature(this.fi), p = f.properties || {};
				if (p.hide_3d === true || p.hide_3d === "true") {
					this.fi++;
					continue;
				}
				let rings;
				try {
					rings = f.loadGeometry();
				} catch {
					this.fi++;
					continue;
				}
				const flat = rings.map((r) => {
					const a = new Array(r.length * 2);
					for (let i = 0; i < r.length; i++) {
						a[i * 2] = r[i].x;
						a[i * 2 + 1] = r[i].y;
					}
					return a;
				});
				if (this.marks.length && this.landmarkPart(flat, num(p.render_height, 0))) {
					this.fi++;
					continue;
				}
				this.polys = classifyRings(flat);
				this.pi = 0;
				const id = f.id ?? 0;
				this.cur = {
					idLo: id >>> 0,
					idHi: Math.floor(id / 4294967296) >>> 0,
					H: num(p.render_height, NaN),
					minH: Math.max(0, num(p.render_min_height, 0))
				};
			}
			while (this.pi < this.polys.length) {
				const poly = this.polys[this.pi++];
				if (this.marks.length && this.landmarkPart([poly.outer], num(this.cur.H, 0))) continue;
				try {
					this.prepare(poly);
				} catch (e) {
					this.warn(e);
				}
				if (performance.now() - t0 > budget) return false;
			}
			this.polys = null;
			this.fi++;
			if (performance.now() - t0 > budget) return false;
		}
		if (!this.grid) {
			this.resolveOverlaps();
			this.indexEdges();
			if (performance.now() - t0 > budget) return false;
		}
		while (this.ei < this.items.length) {
			const it = this.items[this.ei++];
			if (it.drop) continue;
			try {
				this.building(it);
			} catch (e) {
				this.warn(e);
			}
			if (performance.now() - t0 > budget) return this.ei >= this.items.length ? this.done = true : false;
		}
		this.done = true;
		return true;
	}
	warn(e) {
		if (!this.warned) {
			this.warned = true;
			console.warn("city-build: building failed", e);
		}
	}
	readLanduse() {
		const out = [], lu = this.src.landuse;
		if (!lu) return out;
		const A = this.P.landuseAliases;
		for (let i = 0; i < lu.length; i++) {
			const f = lu.feature(i), cls = A[f.properties?.class] || f.properties?.class;
			if (!cls) continue;
			let rings;
			try {
				rings = f.loadGeometry();
			} catch {
				continue;
			}
			for (const poly of classifyRings(rings.map((r) => {
				const a = [];
				for (const p of r) a.push(p.x, p.y);
				return a;
			}))) out.push({
				cls,
				outer: poly.outer,
				holes: poly.holes,
				bbox: bbox(poly.outer),
				area: poly.area2 / 2
			});
		}
		return out;
	}
	landuseAt(x, y) {
		let best = null;
		for (const l of this.landuse) {
			const b = l.bbox;
			if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
			if (!pointInPolygon(x, y, l.outer, l.holes)) continue;
			if (!best || l.area < best.area - 1e-6 || Math.abs(l.area - best.area) <= 1e-6 && this.priority(l.cls) < this.priority(best.cls)) best = l;
		}
		return best ? best.cls : "unknown";
	}
	priority(cls) {
		const i = this.P.equalAreaPriority.indexOf(cls);
		return i < 0 ? 99 : i;
	}
	seedOf(ring, clipped) {
		const E = this.E, bx = this.src.x * E, by = this.src.y * E;
		let kx = Infinity, ky = Infinity;
		for (let i = 0; i < ring.length; i += 2) {
			const x = ring[i], y = ring[i + 1];
			if (clipped && !(x <= 0 || x >= E || y <= 0 || y >= E)) continue;
			if (x < kx || x === kx && y < ky) {
				kx = x;
				ky = y;
			}
		}
		if (kx === Infinity) {
			kx = ring[0];
			ky = ring[1];
		}
		return mix32(this.cur.idLo, this.cur.idHi, Math.round((bx + kx) * 4), Math.round((by + ky) * 4));
	}
	prepare(poly) {
		const E = this.E, P = this.P, cur = this.cur;
		let outer = poly.outer, holes = poly.holes, clipped = false;
		const raw = poly.outer;
		const bb = bbox(outer);
		if (bb[2] <= 0 || bb[0] >= E || bb[3] <= 0 || bb[1] >= E) {
			if (raw.length >= 6) this.blockers.push({
				ring: raw,
				item: -1
			});
			return;
		}
		if (!ringInBox(outer, 0, 0, E, E)) {
			outer = clipRing(outer, 0, 0, E, E);
			clipped = true;
			if (outer.length < 6) return;
			holes = holes.filter((h) => ringInBox(h, 0, 0, E, E));
		} else outer = simplifyRing(outer, .05);
		if (outer.length < 6) return;
		if (signedArea2(outer) < 0) return;
		holes = holes.map((h) => simplifyRing(h, .05)).filter((h) => h.length >= 6);
		const m2 = this.mPerUnit * this.mPerUnit, A = (Math.abs(signedArea2(outer)) / 2 - holes.reduce((s, h) => s + area(h), 0)) * m2;
		if (A < 4) return;
		const H = Math.max(P.minH, Number.isFinite(cur.H) ? cur.H : P.missingH), minH = Math.min(cur.minH, H - .5);
		const [ix, iy] = interiorPoint(outer, holes), landuse = this.landuseAt(ix, iy);
		const seed = this.seedOf(outer, clipped);
		const key = seed + ":" + H;
		if (this.seen.has(key)) return;
		this.seen.add(key);
		const item = this.items.length;
		this.items.push({
			item,
			outer,
			holes,
			clipped,
			A,
			H,
			minH,
			landuse,
			seed,
			ix,
			iy,
			idLo: cur.idLo,
			idHi: cur.idHi,
			raw,
			fi: this.fi,
			ri: poly.idx
		});
		this.blockers.push({
			ring: raw,
			item
		});
	}
	resolveOverlaps() {
		const items = this.items, n = items.length, O = OVERLAP, mpu = this.mPerUnit;
		if (n < 2) return;
		const bb = items.map((it) => bbox(it.outer)), order = items.map((_, i) => i).sort((a, b) => bb[a][0] - bb[b][0]);
		const share = (s, g) => {
			const r = s.outer, m = r.length / 2, k = Math.max(1, Math.ceil(m / 16));
			let inn = 0, tot = 1;
			if (pointInPolygon(s.ix, s.iy, g.outer, g.holes)) inn++;
			for (let i = 0; i < m; i += k) {
				tot++;
				if (pointInPolygon(s.ix + (r[i * 2] - s.ix) * .8, s.iy + (r[i * 2 + 1] - s.iy) * .8, g.outer, g.holes)) inn++;
			}
			return inn / tot;
		};
		for (let oi = 0; oi < n; oi++) {
			const i = order[oi], A = bb[i];
			for (let oj = oi + 1; oj < n; oj++) {
				const j = order[oj], B = bb[j];
				if (B[0] >= A[2]) break;
				if (B[1] >= A[3] || B[3] <= A[1]) continue;
				const a = items[i], b = items[j];
				if (a.drop || b.drop) continue;
				const sa = a.A <= b.A, s = sa ? a : b, g = sa ? b : a, S = sa ? A : B, G = sa ? B : A;
				if ((Math.min(S[2], G[2]) - Math.max(S[0], G[0])) * (Math.min(S[3], G[3]) - Math.max(S[1], G[1])) < .1 * (S[2] - S[0]) * (S[3] - S[1])) continue;
				const sh2 = share(s, g);
				if (sh2 < O.touchShare) continue;
				const sameH = Math.abs(s.H - g.H) < .05 && Math.abs(s.minH - g.minH) < .05;
				if (sameH && sh2 >= O.redundantShare) {
					s.drop = true;
					continue;
				}
				if (sh2 >= O.nestedShare) {
					(s.containers ||= /* @__PURE__ */ new Set()).add(g.item);
					s.depth = (s.depth || 0) + 1;
				}
				if (sameH) s.lower = (s.lower || 0) + 1;
			}
		}
		for (const it of items) {
			if (it.drop || !(it.depth || it.lower)) continue;
			if (it.depth && !it.clipped) {
				const r = insetRing(it.outer, O.insetM * it.depth / mpu);
				if (r && r.length >= 6 && signedArea2(r) > 0) it.outer = r;
			}
			if (it.lower) {
				it.H = Math.max(this.P.minH * .5, it.H - O.lowerM * it.lower);
				it.minH = Math.min(it.minH, it.H - .5);
			}
		}
	}
	indexEdges() {
		const cell = this.cell = 8 / this.mPerUnit, g = this.grid = /* @__PURE__ */ new Map(), off = this.goff = this.E;
		for (const { ring, item } of this.blockers) {
			const n = ring.length / 2;
			for (let i = 0; i < n; i++) {
				const j = (i + 1) % n, ax = ring[i * 2], ay = ring[i * 2 + 1], bx = ring[j * 2], by = ring[j * 2 + 1];
				if (ax === bx && ay === by) continue;
				const x0 = Math.floor((Math.min(ax, bx) + off) / cell), x1 = Math.floor((Math.max(ax, bx) + off) / cell), y0 = Math.floor((Math.min(ay, by) + off) / cell), y1 = Math.floor((Math.max(ay, by) + off) / cell);
				for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
					const k = cx * 65536 + cy;
					let a = g.get(k);
					if (!a) g.set(k, a = []);
					a.push(item, ax, ay, bx, by);
				}
			}
		}
		this.blockers = null;
	}
	faceOpen(item, ax, ay, bx, by, nx, ny, ignore = null) {
		const F = this.P.faces, mpu = this.mPerUnit, D = F.open / mpu, gap = F.gap / mpu, len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.min(6, Math.ceil(len * mpu / 4)));
		const g = this.grid, cell = this.cell, off = this.goff, eps = .02 / mpu;
		let abut = 0, near = 0;
		const ds = [];
		for (let s = 0; s < k; s++) {
			const t = (s + .5) / k, px = ax + (bx - ax) * t + nx * eps, py = ay + (by - ay) * t + ny * eps, qx = px + nx * D, qy = py + ny * D;
			let best = Infinity;
			const x0 = Math.floor((Math.min(px, qx) + off) / cell), x1 = Math.floor((Math.max(px, qx) + off) / cell), y0 = Math.floor((Math.min(py, qy) + off) / cell), y1 = Math.floor((Math.max(py, qy) + off) / cell);
			for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
				const a = g.get(cx * 65536 + cy);
				if (!a) continue;
				for (let i = 0; i < a.length; i += 5) {
					if (a[i] === item || ignore && ignore.has(a[i])) continue;
					const ex = a[i + 3] - a[i + 1], ey = a[i + 4] - a[i + 2], den = nx * ey - ny * ex;
					if (Math.abs(den) < 1e-9) continue;
					const wx = a[i + 1] - px, wy = a[i + 2] - py, tt = (wx * ey - wy * ex) / den, ss = (wx * ny - wy * nx) / den;
					if (tt > 0 && tt < best && ss >= 0 && ss <= 1) best = tt;
				}
			}
			if (best <= gap) abut++;
			if (best <= D) near++;
			ds.push(best);
		}
		ds.sort((p, q) => p - q);
		return {
			abut: abut / k,
			near: near / k,
			dist: ds[ds.length >> 1] * mpu
		};
	}
	faceDensity(ctx, f, primary) {
		const F = this.P.faces;
		let pol = ctx.T.facePolicy;
		if (!pol) return "full";
		if (pol.glass !== void 0 || pol.masonry) {
			if (this.P.materials[ctx.mat].glassKind) return pol.glass || "full";
			pol = pol.masonry || pol;
		}
		if (f.abut >= .5) return pol.abutting || "blank";
		if (f.short && pol.shortFaces && pol.shortFaces !== "same") return pol.shortFaces;
		if (f.near >= .5) return pol.near || "full";
		if (pol.primaryOnly && ctx.A <= F.primaryOnlyMaxA && !primary) return "sparse";
		return pol.open || "full";
	}
	building(it) {
		if (this.P.hanok) return cityPart("hanok").building(this, it, unit);
		const E = this.E, P = this.P, { outer, holes, clipped, A, H, minH, landuse, seed, ix, iy } = it;
		const info = {
			heightM: H,
			areaM2: A,
			landuse,
			id: it.idLo + it.idHi * 4294967296,
			props: null
		};
		let est = classifyBuilding(info, P);
		if (this.opts.classify) {
			const t = this.opts.classify(info, est);
			if (t && P.byKey[t] != null) est = {
				...est,
				type: t
			};
		}
		const ti = P.byKey[est.type] ?? 2, T = P.types[ti];
		const mat = T.mats[pick(T.mats.map((m) => m[1]), unit(seed, P.variantSalt))][0];
		const W = this.W, storefront = T.storefront ? T.storefront.includes(landuse) : false;
		const litOverride = T.litByLanduse && T.litByLanduse[landuse] != null ? Math.round(T.litByLanduse[landuse] * 255) : 0;
		const Hq = Math.min(65535, Math.round(H * 10));
		const chunk = this.chunks[Math.min(3, Math.floor(ix / E * 4)) + 4 * Math.min(3, Math.floor(iy / E * 4))];
		const ctx = {
			outer,
			holes,
			A,
			H,
			minH,
			T,
			ti,
			seed,
			chunk,
			clipped,
			landuse,
			storefront,
			merged: est.mergedLowrise,
			mat,
			item: it.item,
			ignore: it.containers || null
		};
		const obb = outer.length <= 400 ? orientedBox(outer) : null;
		ctx.slab = obb && obb.hh > 0 && obb.hw / obb.hh >= P.faces.slab ? {
			ux: obb.ux,
			uy: obb.uy
		} : null;
		ctx.roofSlot = this.roofSlotOf(ctx);
		const art = T.articulation;
		let crown = 0, crownInsets = null;
		if (art && !clipped && !holes.length && H >= num(art.minHeightM, 60)) {
			const r = unit(seed, 6), w = art.crownWeights || {
				flatBand: .5,
				insetCap: .3,
				steppedCap: .2
			};
			crown = r < num(w.flatBand, .5) ? 1 : r < num(w.flatBand, .5) + num(w.insetCap, .3) ? 2 : 3;
			const d = Math.min(1.2, num(art.maxInsetM, 1.2)) / this.mPerUnit;
			if (crown === 2) {
				const i1 = insetRing(outer, d) || insetRing(outer, d * .6);
				if (i1) crownInsets = [i1];
				else crown = 1;
			} else if (crown === 3) {
				const i1 = insetRing(outer, d * .5), i2 = i1 && insetRing(i1, d * .5);
				if (i2) crownInsets = [i1, i2];
				else crown = 1;
			}
		}
		let cwQ = 15;
		if (art && H >= num(art.minHeightM, 60)) {
			const corner = realCorners(outer), n = outer.length / 2;
			let per = 0, nc = 0;
			for (let i = 0; i < n; i++) {
				const j = (i + 1) % n;
				per += Math.hypot(outer[j * 2] - outer[i * 2], outer[j * 2 + 1] - outer[i * 2 + 1]);
				if (corner[i]) nc++;
			}
			per *= this.mPerUnit;
			const arr = (v, d) => {
				const a = (Array.isArray(v) ? v : [v]).map((x) => num(x, NaN)).filter(Number.isFinite);
				return a.length ? a : [d];
			};
			const beLo = Math.min(...arr(art.beltEveryFloors, 6)), bhHi = Math.max(...arr(art.beltHeightM, .55)), cwHi = Math.max(...arr(art.cornerWidthM, .65));
			const budget = num(art.maxAccentFacadeAreaRatio, 1) - bhHi / (Math.max(1, beLo) * T.floorM), use = nc * cwHi / Math.max(per, 1);
			cwQ = Math.round(Math.max(0, Math.min(1, budget / Math.max(use, 1e-6))) * 15);
		}
		const th = this.throughLevel(it);
		ctx.th = th && th.segs ? {
			segs: th.segs,
			half: P.through.portalHalf,
			near: P.through.near / this.mPerUnit,
			rq: Math.max(0, Math.min(63, Math.round((th.railM - RAIL_Q.base) / RAIL_Q.step)))
		} : null;
		W.b = [
			seed & 255,
			seed >>> 8 & 255,
			ti | crown << 3 | (T.famFacade ? 32 : 0),
			(est.mergedLowrise ? FLAG.MERGED : 0) | (storefront ? FLAG.STOREFRONT : 0) | cwQ << 4
		];
		W.m = [
			mat,
			litOverride,
			Hq & 255,
			Hq >>> 8
		];
		this.count++;
		chunk.n++;
		if (P.race && cityPart("race").building(this, ctx, unit)) return;
		if (P.nation && cityPart("nation").building(this, ctx, unit)) return;
		if (this.gable(ctx)) return;
		if (crownInsets) {
			const tz = art.topZoneHeightRatio || [.06, .1], r0 = num(tz[0], .06), r1 = num(tz[1], .1);
			this.crown(ctx, crownInsets, Math.min(H * (r0 + (r1 - r0) * ((seed & 65535) % 5) / 4), num(art.maxTopZoneHeightM, 4.5)));
			return;
		}
		if (!art && this.setback(ctx)) return;
		this.wallsOf(ctx, outer, minH, H, true);
		for (const h of holes) this.wallsOf(ctx, h, minH, H, false);
		this.flatRoof(ctx, outer, holes, H, true);
		this.cutWalls(ctx);
		this.plant(ctx);
		this.awning(ctx);
		this.signs(ctx);
	}
	throughLevel(it) {
		const TH = this.through;
		if (!TH) return 0;
		const hit = (list) => {
			if (!list.length) return 0;
			let segs = null;
			for (const e of list) {
				const s = this.pathSegs(e);
				if (s) segs = segs ? segs.concat(s) : s;
			}
			return {
				railM: num(list[0].railM, this.P.through.railM),
				segs
			};
		};
		const byRing = TH.byRing || null, byId = TH.byId || TH;
		if (byRing && byRing.size) {
			const a = byRing.get(`${this.src.z}/${this.src.x}/${this.src.y}/${it.fi}/${it.ri}`);
			if (a) return hit(Array.isArray(a) ? a : [a]);
		}
		const list = byId && byId.size ? byId.get(it.idLo + it.idHi * 4294967296) : null;
		if (!list) return 0;
		const n = 2 ** this.src.z, E = this.E, ring = it.raw || it.outer, inside = [], near = [];
		for (const e of list) {
			const x = ((e.lng / 360 + .5) * n - this.src.x) * E, y = ((.5 - Math.log(Math.tan(Math.PI / 4 + e.lat * RAD / 2)) / (2 * Math.PI)) * n - this.src.y) * E;
			if (pointInPolygon(x, y, ring, [])) inside.push(e);
			else {
				const b = bbox(ring), m = 2 / this.mPerUnit;
				if (x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m) near.push(e);
			}
		}
		return hit(inside.length ? inside : near);
	}
	pathSegs(e) {
		const p = e.path;
		if (!Array.isArray(p) || p.length < 2) return null;
		const n = 2 ** this.src.z, E = this.E, out = [];
		let px = 0, py = 0;
		for (let i = 0; i < p.length; i++) {
			const x = ((+p[i][0] / 360 + .5) * n - this.src.x) * E, y = ((.5 - Math.log(Math.tan(Math.PI / 4 + +p[i][1] * RAD / 2)) / (2 * Math.PI)) * n - this.src.y) * E;
			if (i) out.push(px, py, x, y);
			px = x;
			py = y;
		}
		return out.length ? out : null;
	}
	cutEdge(ax, ay, bx, by) {
		const E = this.E;
		return ax === bx && (ax <= 0 || ax >= E) || ay === by && (ay <= 0 || ay >= E);
	}
	wallsOf(ctx, ring, z0, z1, isOuter, solid = false) {
		const W = this.W, E = this.E, u = this.unit, mpu = this.mPerUnit, T = ctx.T, ch = ctx.chunk, n = ring.length / 2, corner = realCorners(ring), F = this.P.faces;
		const mat = this.P.materials[ctx.mat], bayM = T.famFacade && mat.bayEff ? mat.bayEff : T.bayEff;
		const faces = new Array(n);
		let prim = -1, primScore = -1;
		if (!solid) for (let i = 0; i < n; i++) {
			const j = (i + 1) % n, ax = ring[i * 2], ay = ring[i * 2 + 1], bx = ring[j * 2], by = ring[j * 2 + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
			if (l < 1e-6 || this.cutEdge(ax, ay, bx, by)) continue;
			const f = this.faceOpen(ctx.item, ax, ay, bx, by, dy / l, -dx / l, ctx.ignore);
			f.short = ctx.slab ? Math.abs((dx * ctx.slab.ux + dy * ctx.slab.uy) / l) < .7071 : false;
			faces[i] = f;
			const score = (f.abut >= .5 ? 0 : f.near >= .5 ? 1 : 2) * 1e4 + l * mpu;
			if (score > primScore) {
				primScore = score;
				prim = i;
			}
		}
		W.kind = KIND.WALL;
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n, ax = ring[i * 2], ay = ring[i * 2 + 1], bx = ring[j * 2], by = ring[j * 2 + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
			if (l < 1e-6) continue;
			const len = l * mpu, nx = dy / l, ny = -dx / l;
			const aEdge = ax <= 0 || ax >= E || ay <= 0 || ay >= E, bEdge = bx <= 0 || bx >= E || by <= 0 || by >= E;
			if (aEdge && bEdge && this.cutEdge(ax, ay, bx, by)) {
				if (!solid) (ctx.cuts ||= []).push(ax, ay, bx, by, z0);
				continue;
			}
			const absU0 = aEdge || bEdge;
			let bays = solid ? 0 : Math.max(1, Math.round(len / bayM));
			if (len < bayM * .55) bays = 0;
			const dens = faces[i] ? this.faceDensity(ctx, faces[i], i === prim) : "full";
			let cls = 0;
			if (dens === "blank") bays = 0;
			else if (bays > 0 && len < F.minFace) {
				bays = (dens !== "sparse" || i === prim) && len >= bayM * .8 ? 1 : 0;
				cls = 2;
			} else if (dens === "sparse") cls = 1;
			else if (dens === "single") cls = 2;
			let pieces = null;
			if (ctx.th) {
				const G = ctx.th.segs, hw = ctx.th.half / len;
				let lo = 2, hi = -1;
				for (let s = 0; s < G.length; s += 4) {
					const t = segX(ax, ay, bx, by, G[s], G[s + 1], G[s + 2], G[s + 3]);
					if (t >= 0) {
						lo = Math.min(lo, t - hw);
						hi = Math.max(hi, t + hw);
					}
				}
				if (ctx.th.near > 0) {
					const k = Math.max(2, Math.min(24, Math.ceil(len / 2))), ex = dx / l, ey = dy / l;
					for (let q = 0; q <= k; q++) {
						const t = q / k, r = pathNear(ax + dx * t, ay + dy * t, G);
						if (r.d <= ctx.th.near && Math.abs(r.ux * ex + r.uy * ey) >= .7) {
							lo = Math.min(lo, t - .5 / k);
							hi = Math.max(hi, t + .5 / k);
						}
					}
				}
				if (hi > lo) {
					const t0 = Math.max(0, lo), t1 = Math.min(1, hi);
					if (t0 <= .02 && t1 >= .98) pieces = [[
						0,
						1,
						true
					]];
					else {
						pieces = [];
						if (t0 > .02) pieces.push([
							0,
							t0,
							false
						]);
						pieces.push([
							t0,
							t1,
							true
						]);
						if (t1 < .98) pieces.push([
							t1,
							1,
							false
						]);
					}
				}
			}
			const split = !!pieces && pieces.length > 1, absU = absU0 || !!pieces;
			const flags = W.b[3], bz = W.b[2];
			W.b[3] = flags & ~(FLAG.ABS_U | FLAG.NO_AO) | (absU ? FLAG.ABS_U | FLAG.NO_AO : 0);
			let U0 = 0;
			if (absU) {
				const ex = dx / l, ey = dy / l, wx = this.wox + ax * u * S, wy = this.woy + ay * u * S;
				U0 = wx * ex + wy * ey;
			}
			W.normal(nx, ny, 0);
			const cornerBits = (corner[i] ? 64 : 0) | (corner[j] ? 128 : 0), eseed = mix32(ctx.seed, i, 3) & 15;
			for (const [t0, t1, hall] of pieces || [[
				0,
				1,
				false
			]]) {
				const pl = len * (t1 - t0);
				if (pl < .02) continue;
				const pb = split ? bays > 0 ? Math.max(1, Math.round(pl / bayM)) : 0 : bays, lq = Math.min(65535, Math.round(pl * 20));
				W.kind = hall ? KIND.HALL : KIND.WALL;
				if (pieces) {
					const rq = hall ? ctx.th.rq : 0;
					W.b[2] = bz & 63 | rq >> 4 << 6;
					W.b[3] = W.b[3] & 15 | (rq & 15) << 4;
				}
				W.w = [
					Math.min(255, pb),
					lq & 255,
					lq >>> 8,
					eseed | cls << 4 | (t0 <= 0 ? cornerBits & 64 : 0) | (t1 >= 1 ? cornerBits & 128 : 0)
				];
				const u0 = absU ? U0 + len * t0 : 0, u1 = absU ? U0 + len * t1 : pl;
				const X0 = (ax + dx * t0) * u, Y0 = (ay + dy * t0) * u, X1 = (ax + dx * t1) * u, Y1 = (ay + dy * t1) * u;
				const a0 = W.v(X0, Y0, z0, u0), b0 = W.v(X1, Y1, z0, u1), b1 = W.v(X1, Y1, z1, u1), a1 = W.v(X0, Y0, z1, u0);
				ch.walls.push(a0, b0, b1, a0, b1, a1);
				this.extend(ch, X0, Y0, X1, Y1, z1);
			}
			W.kind = KIND.WALL;
			W.b[3] = flags;
			W.b[2] = bz;
		}
	}
	cutWalls(ctx) {
		const c = ctx.cuts;
		if (!c) return;
		const W = this.W, u = this.unit, ch = ctx.chunk, top = ctx.roofZ ?? ctx.H;
		W.kind = KIND.WALL;
		W.w = [
			0,
			0,
			0,
			0
		];
		const flags = W.b[3];
		W.b[3] = flags | FLAG.NO_AO;
		for (let i = 0; i < c.length; i += 5) {
			const ax = c[i], ay = c[i + 1], bx = c[i + 2], by = c[i + 3], z0 = c[i + 4], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
			if (l < 1e-6) continue;
			W.normal(dy / l, -dx / l, 0);
			const a0 = W.v(ax * u, ay * u, z0, 0), b0 = W.v(bx * u, by * u, z0, 0), b1 = W.v(bx * u, by * u, top, 0), a1 = W.v(ax * u, ay * u, top, 0);
			ch.walls.push(a0, b0, b1, a0, b1, a1);
		}
		W.b[3] = flags;
		ctx.cuts = null;
	}
	extend(ch, x0, y0, x1, y1, z) {
		if (x0 < ch.x0) ch.x0 = x0;
		if (x0 > ch.x1) ch.x1 = x0;
		if (x1 < ch.x0) ch.x0 = x1;
		if (x1 > ch.x1) ch.x1 = x1;
		if (y0 < ch.y0) ch.y0 = y0;
		if (y0 > ch.y1) ch.y1 = y0;
		if (y1 < ch.y0) ch.y0 = y1;
		if (y1 > ch.y1) ch.y1 = y1;
		if (z > ch.zmax) ch.zmax = z;
		if (z > this.zmax) this.zmax = z;
	}
	cap(list, outer, holes, z, kind, colourPick, axisAngle) {
		const tris = triangulate(outer, holes);
		if (tris.length) this.capWith(list, outer, holes, tris, z, kind, colourPick, axisAngle);
	}
	capWith(list, outer, holes, tris, z, kind, colourPick, axisAngle) {
		const W = this.W, u = this.unit, data = holes.length ? outer.concat(...holes) : outer, base = W.n;
		W.kind = kind;
		W.normal(0, 0, 1);
		W.w = [
			0,
			0,
			0,
			0
		];
		const m0 = W.m[0];
		W.m[0] = colourPick;
		for (let i = 0; i < data.length; i += 2) W.v(data[i] * u, data[i + 1] * u, z, axisAngle);
		W.m[0] = m0;
		for (let t = 0; t < tris.length; t += 3) {
			const a = tris[t], b = tris[t + 1], c = tris[t + 2];
			if ((data[b * 2] - data[a * 2]) * (data[c * 2 + 1] - data[a * 2 + 1]) - (data[b * 2 + 1] - data[a * 2 + 1]) * (data[c * 2] - data[a * 2]) > 0) list.push(base + a, base + b, base + c);
			else list.push(base + a, base + c, base + b);
		}
	}
	strip(list, a, b, z, kind, skip) {
		const W = this.W, u = this.unit, n = a.length / 2;
		if (b.length !== a.length) return;
		W.kind = kind;
		W.normal(0, 0, 1);
		W.w = [
			0,
			0,
			0,
			0
		];
		const base = W.n;
		for (let i = 0; i < n; i++) {
			W.v(a[i * 2] * u, a[i * 2 + 1] * u, z, 0);
			W.v(b[i * 2] * u, b[i * 2 + 1] * u, z, 0);
		}
		for (let i = 0; i < n; i++) {
			if (skip && skip[i]) continue;
			const j = (i + 1) % n, o0 = base + i * 2, o1 = base + j * 2, i0 = o0 + 1, i1 = o1 + 1;
			if ((a[j * 2] - a[i * 2]) * (b[j * 2 + 1] - a[i * 2 + 1]) - (a[j * 2 + 1] - a[i * 2 + 1]) * (b[j * 2] - a[i * 2]) > 0) list.push(o0, o1, i1, o0, i1, i0);
			else list.push(o0, i1, o1, o0, i0, i1);
		}
	}
	roofSlotOf(ctx) {
		const P = this.P, T = ctx.T, m = P.materials[ctx.mat];
		for (const step of P.roofPriorityByType[T.key] || P.roofPriority) if (step === "waterproof-subset") {
			if (ctx.H <= P.waterproof.maxH && unit(ctx.seed, 5) < P.waterproof.p) return P.waterSlot;
		} else if (step === "type-roof-variants") {
			if (T.roofVariants) return T.roofVarBase + pick(T.roofVariantW || [
				.25,
				.25,
				.25,
				.25
			], unit(ctx.seed, P.roofSalt));
		} else if (step === "family-roof") {
			if (m.roof) {
				const F = P.famIndex[m.family];
				return F.base + pick(F.weights, unit(ctx.seed, P.roofSalt));
			}
		} else if (step === "legacy-flat") return T.legacyRoofSlot;
		return T.legacyRoofSlot;
	}
	flatRoof(ctx, outer, holes, H, withParapet) {
		const P = this.P, T = ctx.T, ch = ctx.chunk, pick = ctx.roofSlot;
		const obb = outer.length <= 400 ? orientedBox(outer) : null, ang = obb ? obb.ang : 0;
		const bbx = bbox(outer);
		this.extend(ch, bbx[0] * this.unit, bbx[1] * this.unit, bbx[2] * this.unit, bbx[3] * this.unit, H);
		const tris = triangulate(outer, holes);
		if (!tris.length) {
			ctx.roofZ = H;
			return;
		}
		this.capWith(ch.lo, outer, holes, tris, H, KIND.ROOF, pick, ang);
		const p = T.parapetM, d = P.parapetT / this.mPerUnit, inset = withParapet && !this.opts.phone && p > 0 ? insetRing(outer, d) : null;
		if (!inset) {
			this.capWith(ch.hi, outer, holes, tris, H, KIND.ROOF, pick, ang);
			ctx.roofZ = H;
			return;
		}
		const n = outer.length / 2, E = this.E, cut = new Array(n);
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n;
			cut[i] = this.cutEdge(outer[i * 2], outer[i * 2 + 1], outer[j * 2], outer[j * 2 + 1]);
		}
		for (let i = 0; i < n; i++) if (cut[i] || cut[(i + n - 1) % n]) {
			const x = outer[i * 2], y = outer[i * 2 + 1];
			if (x <= 0 || x >= E) inset[i * 2] = x;
			if (y <= 0 || y >= E) inset[i * 2 + 1] = y;
		}
		const innerHoles = holes.map((h) => insetRing(h, d, -1) || h);
		this.capWith(ch.hi, inset, innerHoles, tris, H - p, KIND.ROOF, pick, ang);
		ctx.roofZ = H - p;
		ctx.roofRing = inset;
		ctx.roofHoles = innerHoles;
		const W = this.W, u = this.unit;
		W.kind = KIND.PARAPET;
		W.w = [
			0,
			0,
			0,
			0
		];
		const flags = W.b[3];
		W.b[3] = flags | FLAG.NO_AO;
		const faces = (ring, skip) => {
			const n = ring.length / 2;
			for (let i = 0; i < n; i++) {
				if (skip && skip[i]) continue;
				const j = (i + 1) % n, ax = ring[i * 2], ay = ring[i * 2 + 1], bx = ring[j * 2], by = ring[j * 2 + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
				if (l < 1e-6) continue;
				W.normal(-dy / l, dx / l, 0);
				const a0 = W.v(ax * u, ay * u, H - p, 0), b0 = W.v(bx * u, by * u, H - p, 0), b1 = W.v(bx * u, by * u, H, 0), a1 = W.v(ax * u, ay * u, H, 0);
				ch.hi.push(a0, b1, b0, a0, a1, b1);
			}
		};
		faces(inset, cut);
		for (const h of innerHoles) faces(h);
		this.strip(ch.hi, outer, inset, H, KIND.PARAPET, cut);
		holes.forEach((h, i) => {
			if (innerHoles[i] !== h) this.strip(ch.hi, h, innerHoles[i], H, KIND.PARAPET);
		});
		W.b[3] = flags;
	}
	gable(ctx) {
		const g = ctx.T.pitched;
		if (!g || ctx.clipped || ctx.merged || ctx.holes.length) return false;
		const [a0, a1] = g.areaM2 || [45, 180];
		if (ctx.H > num(g.maxHeightM, 9) || ctx.A < a0 || ctx.A > a1) return false;
		if (unit(ctx.seed, 2) >= num(g.probability, .2)) return false;
		const r = simplifyRing(ctx.outer, .35 / this.mPerUnit);
		if (r.length !== 8) return false;
		const obb = orientedBox(r);
		if (!obb || obb.area * this.mPerUnit * this.mPerUnit > ctx.A * 1.15) return false;
		const len = (i) => Math.hypot(r[(i + 1) % 4 * 2] - r[i * 2], r[(i + 1) % 4 * 2 + 1] - r[i * 2 + 1]);
		const longFirst = len(0) + len(2) >= len(1) + len(3), L = longFirst ? [0, 2] : [1, 3], Sh = longFirst ? [1, 3] : [0, 2];
		const H = ctx.H, rise = Math.min(num(g.riseMaxM, 2.2), H * num(g.riseHeightRatio, .2)), eave = H - rise, u = this.unit, W = this.W, ch = ctx.chunk;
		const pt = (i) => [r[i % 4 * 2], r[i % 4 * 2 + 1]];
		const mid = (i) => {
			const a = pt(i), b = pt(i + 1);
			return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
		};
		const R0 = mid(Sh[0]), R1 = mid(Sh[1]);
		this.wallsOf(ctx, r, ctx.minH, eave, true);
		W.kind = KIND.WALL;
		W.w = [
			0,
			0,
			0,
			0
		];
		const flags = W.b[3];
		W.b[3] = flags | FLAG.NO_AO;
		for (const si of Sh) {
			const a = pt(si), b = pt(si + 1), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ridge = mid(si);
			W.normal(dy / l, -dx / l, 0);
			const i0 = W.v(a[0] * u, a[1] * u, eave, 0), i1 = W.v(b[0] * u, b[1] * u, eave, 0), i2 = W.v(ridge[0] * u, ridge[1] * u, H, 0);
			ch.walls.push(i0, i1, i2);
		}
		W.b[3] = flags;
		W.kind = KIND.PITCHED;
		W.m[0] = pick(g.weights || [
			.55,
			.3,
			.15
		], unit(ctx.seed, 6));
		for (const li of L) {
			const a = pt(li), b = pt(li + 1);
			const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
			const ra = d(a, R0) < d(a, R1) ? R0 : R1, rb = ra === R0 ? R1 : R0;
			const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1, inx = -ey / el, iny = ex / el;
			const run = Math.abs((ra[0] - a[0]) * inx + (ra[1] - a[1]) * iny) * this.mPerUnit || 1;
			let nx = -inx * rise, ny = -iny * rise, nz = run;
			const nl = Math.hypot(nx, ny, nz);
			nx /= nl;
			ny /= nl;
			nz /= nl;
			W.normal(nx, ny, nz);
			const i0 = W.v(a[0] * u, a[1] * u, eave, 0), i1 = W.v(b[0] * u, b[1] * u, eave, 0), i2 = W.v(rb[0] * u, rb[1] * u, H, 0), i3 = W.v(ra[0] * u, ra[1] * u, H, 0);
			ch.walls.push(i0, i1, i2, i0, i2, i3);
		}
		W.m[0] = ctx.mat;
		const bbx = bbox(r);
		this.extend(ch, bbx[0] * u, bbx[1] * u, bbx[2] * u, bbx[3] * u, H);
		return true;
	}
	setback(ctx) {
		const s = ctx.T.setback;
		if (!s || ctx.clipped || ctx.holes.length) return false;
		if (ctx.H < num(s.minHeightM, 80) || ctx.A < num(s.minAreaM2, 600) || unit(ctx.seed, 4) >= num(s.probability, .35)) return false;
		const inset = insetRing(ctx.outer, num(s.maxInsetM, 1.5) / this.mPerUnit) || insetRing(ctx.outer, 1 / this.mPerUnit);
		if (!inset) return false;
		const H = ctx.H, zs = H * (1 - num(s.topHeightRatio, .15)), ch = ctx.chunk;
		this.wallsOf(ctx, ctx.outer, ctx.minH, zs, true);
		this.cap(ch.lo, ctx.outer, [inset], zs, KIND.ROOF, ctx.roofSlot, 0);
		this.cap(ch.hi, ctx.outer, [inset], zs, KIND.ROOF, ctx.roofSlot, 0);
		this.wallsOf(ctx, inset, zs, H, true);
		this.flatRoof(ctx, inset, [], H, true);
		this.plant({
			...ctx,
			outer: inset,
			A: area(inset) * this.mPerUnit * this.mPerUnit
		});
		return true;
	}
	crown(ctx, insets, topH) {
		const H = ctx.H, ch = ctx.chunk, zs = H - topH, steps = insets.length, rs = ctx.roofSlot;
		let ring = ctx.outer, z = ctx.minH;
		for (let i = 0; i < steps; i++) {
			const zt = zs + topH * i / steps, inner = insets[i];
			this.wallsOf(ctx, ring, z, zt, true);
			this.cap(ch.lo, ring, [inner], zt, KIND.ROOF, rs, 0);
			this.cap(ch.hi, ring, [inner], zt, KIND.ROOF, rs, 0);
			ring = inner;
			z = zt;
		}
		this.wallsOf(ctx, ring, z, H, true);
		this.flatRoof(ctx, ring, [], H, true);
		this.plant({
			...ctx,
			outer: ring,
			A: area(ring) * this.mPerUnit * this.mPerUnit
		});
	}
	box(ch, cx, cy, ux, uy, hx, hy, z0, z1, kind, colourPick, list) {
		const W = this.W, u = this.unit, vx = -uy, vy = ux;
		W.kind = kind;
		W.w = [
			0,
			0,
			0,
			0
		];
		const m0 = W.m[0];
		W.m[0] = colourPick;
		const flags = W.b[3];
		W.b[3] = flags | FLAG.NO_AO;
		const c = (i, j) => [(cx + ux * hx * i + vx * hy * j) * u, (cy + uy * hx * i + vy * hy * j) * u];
		const side = (p, q, nx, ny) => {
			W.normal(nx, ny, 0);
			const a0 = W.v(p[0], p[1], z0, z0), b0 = W.v(q[0], q[1], z0, z0), b1 = W.v(q[0], q[1], z1, z0), a1 = W.v(p[0], p[1], z1, z0);
			list.push(a0, b0, b1, a0, b1, a1);
		};
		const p00 = c(-1, -1), p10 = c(1, -1), p11 = c(1, 1), p01 = c(-1, 1);
		side(p00, p10, -vx, -vy);
		side(p10, p11, ux, uy);
		side(p11, p01, vx, vy);
		side(p01, p00, -ux, -uy);
		W.normal(0, 0, 1);
		const t0 = W.v(p00[0], p00[1], z1, z0), t1 = W.v(p10[0], p10[1], z1, z0), t2 = W.v(p11[0], p11[1], z1, z0), t3 = W.v(p01[0], p01[1], z1, z0);
		if ((p10[0] - p00[0]) * (p11[1] - p00[1]) - (p10[1] - p00[1]) * (p11[0] - p00[0]) > 0) list.push(t0, t1, t2, t0, t2, t3);
		else list.push(t0, t2, t1, t0, t3, t2);
		W.m[0] = m0;
		W.b[3] = flags;
		for (const p of [
			p00,
			p10,
			p11,
			p01
		]) this.extend(ch, p[0], p[1], p[0], p[1], z1);
	}
	plant(ctx) {
		const P = this.P, eq = P.equip, ch = ctx.chunk, z = ctx.roofZ ?? ctx.H, mpu = this.mPerUnit;
		this.unit;
		const outer = ctx.roofRing || ctx.outer, holes = ctx.roofHoles || ctx.holes;
		if (ctx.merged) {
			if (ctx.A < 400) return;
			const bb = bbox(outer), step = 16 / mpu, want = Math.min(10, Math.floor(ctx.A / 350));
			let placed = 0;
			const sx = unit(ctx.seed, 7) * step, sy = unit(ctx.seed, 8) * step, cands = [];
			for (let x = bb[0] + sx; x < bb[2]; x += step) for (let y = bb[1] + sy; y < bb[3]; y += step) if (pointInPolygon(x, y, outer, holes) && edgeDistance(x, y, [outer, ...holes]) * mpu > 1.6) cands.push([x, y]);
			for (let i = 0; i < cands.length && placed < want; i++) {
				if (unit(ctx.seed, 20 + i) > .6) continue;
				const [x, y] = cands[i], a = unit(ctx.seed, 40 + i) * Math.PI;
				this.box(ch, x, y, Math.cos(a), Math.sin(a), .8 / mpu, .5 / mpu, z, z + .9, KIND.EQUIP, 0, ch.hi);
				placed++;
			}
			return;
		}
		if (ctx.H < eq.minH || ctx.A < eq.minA) return;
		const deep = deepestPoint(outer, holes, 8);
		if (!(deep.d > 0)) return;
		const clear = deep.d * mpu - P.edgeClear;
		if (clear < 1.2) return;
		const obb = outer.length <= 400 ? orientedBox(outer) : null, ux = obb ? obb.ux : 1, uy = obb ? obb.uy : 0;
		const pa = ctx.A * (eq.penthouseArea[0] + (eq.penthouseArea[1] - eq.penthouseArea[0]) * unit(ctx.seed, 9));
		let hx = Math.sqrt(pa * 1.3) / 2, hy = hx / 1.3;
		const halfDiag = Math.hypot(hx, hy);
		if (halfDiag > clear) {
			const k = clear / halfDiag;
			hx *= k;
			hy *= k;
		}
		if (hx < 1) return;
		this.box(ch, deep.x, deep.y, ux, uy, hx / mpu, hy / mpu, z, z + eq.penthouseH, KIND.EQUIP, 0, ch.hi);
		if (this.opts.phone) return;
		const n = eq.hvacCount[0] + Math.floor(unit(ctx.seed, 10) * (eq.hvacCount[1] - eq.hvacCount[0] + 1)), [sx, sy, sz] = eq.hvacSize;
		for (let i = 0, placed = 0; i < 6 && placed < n; i++) {
			const ang = unit(ctx.seed, 11 + i) * Math.PI * 2, dist = (hx + sx) * .5 + 1.2 + unit(ctx.seed, 30 + i) * 2.5;
			const px = deep.x + (Math.cos(ang) * ux - Math.sin(ang) * uy) * dist / mpu, py = deep.y + (Math.cos(ang) * uy + Math.sin(ang) * ux) * dist / mpu;
			if (!pointInPolygon(px, py, outer, holes) || edgeDistance(px, py, [outer, ...holes]) * mpu < P.edgeClear + Math.hypot(sx, sy) / 2) continue;
			const lx = ((px - deep.x) * ux + (py - deep.y) * uy) * mpu, ly = (-(px - deep.x) * uy + (py - deep.y) * ux) * mpu;
			if (Math.abs(lx) < hx + sx / 2 + .3 && Math.abs(ly) < hy + sy / 2 + .3) continue;
			this.box(ch, px, py, ux, uy, sx / 2 / mpu, sy / 2 / mpu, z, z + sz, KIND.EQUIP, 0, ch.hi);
			placed++;
		}
	}
	awning(ctx) {
		const a = ctx.T.awning;
		if (!a || this.opts.phone || !ctx.storefront || ctx.H < num(a.baseM, 3.1) + 1) return;
		if (!(a.landuse || []).includes(ctx.landuse) || unit(ctx.seed, 12) >= num(a.probability, .35)) return;
		const r = ctx.outer, n = r.length / 2, E = this.E, mpu = this.mPerUnit;
		let best = -1, bl = 0;
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n, ax = r[i * 2], ay = r[i * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1];
			if (ax <= 0 || ax >= E || ay <= 0 || ay >= E || bx <= 0 || bx >= E || by <= 0 || by >= E) continue;
			const l = Math.hypot(bx - ax, by - ay);
			if (l > bl) {
				bl = l;
				best = i;
			}
		}
		if (best < 0 || bl * mpu < 4) return;
		const j = (best + 1) % n, ax = r[best * 2], ay = r[best * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy), ex = dx / l, ey = dy / l, nx = ey, ny = -ex;
		const [f0, f1] = a.frontageRatio || [.5, .7], span = l * (f0 + (f1 - f0) * unit(ctx.seed, 13)), s0 = (l - span) / 2, depth = num(a.depthM, .8) / mpu, z0 = num(a.baseM, 3.1), z1 = z0 + num(a.heightM, .25);
		const cx = ax + ex * (s0 + span / 2) + nx * depth / 2, cy = ay + ey * (s0 + span / 2) + ny * depth / 2;
		this.box(ctx.chunk, cx, cy, ex, ey, span / 2, depth / 2, z0, z1, KIND.AWNING, pick(a.weights || [
			.45,
			.35,
			.2
		], unit(ctx.seed, 14)), ctx.chunk.hi);
	}
	signBox(ch, cx, cy, ux, uy, hx, hy, z0, z1, slot, axis, list) {
		const W = this.W, u = this.unit, mpu = this.mPerUnit, vx = -uy, vy = ux, m0 = W.m[0], m1 = W.m[1], flags = W.b[3];
		W.kind = KIND.SIGN;
		W.m[0] = slot;
		W.m[1] = Math.min(255, Math.round(z0 / .2));
		W.b[3] = flags | FLAG.NO_AO;
		const c = (i, j) => [(cx + ux * hx * i + vx * hy * j) * u, (cy + uy * hx * i + vy * hy * j) * u], hq = Math.min(255, Math.round((z1 - z0) / .05));
		const side = (p, q, nx, ny, len, text) => {
			const lq = Math.min(65535, Math.round(len / .05));
			W.w = [
				text ? axis : 0,
				lq & 255,
				lq >> 8,
				hq
			];
			W.normal(nx, ny, 0);
			const a0 = W.v(p[0], p[1], z0, 0), b0 = W.v(q[0], q[1], z0, len), b1 = W.v(q[0], q[1], z1, len), a1 = W.v(p[0], p[1], z1, 0);
			list.push(a0, b0, b1, a0, b1, a1);
		};
		const L = 2 * hx * mpu, D = 2 * hy * mpu, p00 = c(-1, -1), p10 = c(1, -1), p11 = c(1, 1), p01 = c(-1, 1);
		side(p00, p10, -vx, -vy, L, true);
		side(p10, p11, ux, uy, D, false);
		if (axis !== 1) side(p11, p01, vx, vy, L, true);
		if (axis !== 2) side(p01, p00, -ux, -uy, D, false);
		W.w = [
			0,
			0,
			0,
			hq
		];
		const cz = (p10[0] - p00[0]) * (p11[1] - p00[1]) - (p10[1] - p00[1]) * (p11[0] - p00[0]);
		for (const [z, nz] of [[z1, 1], [z0, -1]]) {
			W.normal(0, 0, nz);
			const t0 = W.v(p00[0], p00[1], z, 0), t1 = W.v(p10[0], p10[1], z, 0), t2 = W.v(p11[0], p11[1], z, 0), t3 = W.v(p01[0], p01[1], z, 0);
			if (cz > 0 === nz > 0) list.push(t0, t1, t2, t0, t2, t3);
			else list.push(t0, t2, t1, t0, t3, t2);
		}
		W.m[0] = m0;
		W.m[1] = m1;
		W.b[3] = flags;
		W.w = [
			0,
			0,
			0,
			0
		];
		for (const p of [
			p00,
			p10,
			p11,
			p01
		]) this.extend(ch, p[0], p[1], p[0], p[1], z1);
	}
	signs(ctx) {
		const S = this.P.signs, T = ctx.T;
		if (!S || ctx.H < num(S.minHeightM, 4) || ctx.H > num(S.maxHeightM, 32)) return;
		if (!ctx.storefront && !(S.types || []).includes(T.key)) return;
		if (unit(ctx.seed, 20) >= num(S.probability, .8)) return;
		const r = ctx.outer, n = r.length / 2, E = this.E, mpu = this.mPerUnit, edges = [];
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n, ax = r[i * 2], ay = r[i * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1];
			if (ax <= 0 || ax >= E || ay <= 0 || ay >= E || bx <= 0 || bx >= E || by <= 0 || by >= E) continue;
			const l = Math.hypot(bx - ax, by - ay);
			if (l * mpu >= num(S.minWallM, 4)) edges.push([i, l]);
		}
		if (!edges.length) return;
		edges.sort((a, b) => b[1] - a[1]);
		const F = S.fascia || {}, U = S.upper || {}, B = S.blade || {}, wts = S.weights || [1], H = ctx.H;
		const gEff = Math.min(T.groundM, H), up = H - gEff, nUp = up < T.floorM * .6 ? 0 : Math.max(1, Math.round(up / T.floorM)), fM = nUp ? up / nUp : T.floorM;
		let k = 0;
		const rnd = () => unit(ctx.seed, 21 + k++), col = () => pick(wts, rnd()), list = ctx.chunk.hi, ch = ctx.chunk;
		for (const [w, [i, l]] of edges.slice(0, num(S.maxWalls, 2)).entries()) {
			const j = (i + 1) % n, ax = r[i * 2], ay = r[i * 2 + 1], ex = (r[j * 2] - ax) / l, ey = (r[j * 2 + 1] - ay) / l, nx = ey, ny = -ex, lm = l * mpu;
			const at = (a, out) => [ax + ex * a + nx * out, ay + ey * a + ny * out];
			let z1 = nUp ? gEff - num(F.belowM, .1) + num(F.heightM, .9) : H - .25, z0 = z1 - num(F.heightM, .9);
			if (z0 > 2.2) {
				const shops = Math.max(1, Math.min(num(F.maxShops, 3), Math.round(lm / num(F.shopM, 7)))), gap = num(F.gapM, .35) / mpu, seg = (l - gap * (shops + 1)) / shops, d = num(F.depthM, .22) / mpu;
				if (seg * mpu > 1.5) for (let s = 0; s < shops; s++) {
					const [cx, cy] = at(gap + seg / 2 + s * (seg + gap), d / 2);
					this.signBox(ch, cx, cy, ex, ey, seg / 2, d / 2, z0, z1, col(), 1, list);
				}
			}
			for (let f = 1; f <= (this.opts.phone || w ? 0 : Math.min(nUp, num(U.maxFloors, 3))); f++) {
				if (rnd() >= num(U.probability, .55)) continue;
				z0 = gEff + (f - 1) * fM + num(U.offsetM, .15);
				z1 = z0 + num(U.heightM, .8);
				if (z1 > H - .3) break;
				const [f0, f1] = U.frontage || [.45, .85], span = l * (f0 + (f1 - f0) * rnd()), a = (l - span) * rnd() + span / 2, d = num(U.depthM, .1) / mpu, [cx, cy] = at(a, d / 2);
				this.signBox(ch, cx, cy, ex, ey, span / 2, d / 2, z0, z1, col(), 1, list);
			}
			if (H >= num(B.minHeightM, 8) && rnd() < num(B.probability, .6)) {
				const [h0, h1] = B.heightM || [3, 9];
				z0 = gEff + num(B.baseAboveM, .6);
				z1 = Math.min(H - .4, z0 + h0 + (h1 - h0) * rnd());
				if (z1 - z0 >= 2) {
					const a = rnd() < .5 ? num(B.insetM, .5) / mpu : l - num(B.insetM, .5) / mpu, out = num(B.outM, 1) / mpu, [cx, cy] = at(a, out / 2 + .05 / mpu);
					this.signBox(ch, cx, cy, nx, ny, out / 2, num(B.widthM, .3) / 2 / mpu, z0, z1, col(), 2, list);
				}
			}
		}
	}
	result() {
		const chunks = [], idx = [], inst = {}, at = {};
		let off = 0;
		for (const [kind, stride] of Object.entries(INST_STRIDES)) {
			let n = 0;
			for (const c of this.chunks) n += c.instFar[kind].length + c.inst[kind].length;
			inst[kind] = new Uint8Array(n * stride);
			at[kind] = 0;
		}
		for (const c of this.chunks) {
			if (!c.n) continue;
			const i0 = off;
			for (const v of c.lo) idx.push(v);
			const iLo = idx.length;
			for (const v of c.walls) idx.push(v);
			const iW = idx.length;
			for (const v of c.hi) idx.push(v);
			off = idx.length;
			const k = {};
			for (const [kind, stride] of Object.entries(INST_STRIDES)) {
				const buf = inst[kind], k0 = at[kind];
				let q = k0;
				for (const r of c.instFar[kind]) buf.set(new Uint8Array(r.buffer, r.byteOffset, stride), q++ * stride);
				const kF = q;
				for (const r of c.inst[kind]) buf.set(new Uint8Array(r.buffer, r.byteOffset, stride), q++ * stride);
				at[kind] = q;
				k[kind] = [
					k0,
					kF,
					q
				];
			}
			chunks.push({
				i0,
				iLo,
				iW,
				i1: off,
				k,
				x0: c.x0,
				y0: c.y0,
				x1: c.x1,
				y1: c.y1,
				zmax: c.zmax
			});
		}
		return {
			verts: this.W.bytes().slice(),
			idx: new Uint32Array(idx),
			inst,
			chunks,
			models: packModels(this.models),
			count: this.count,
			zmax: this.zmax,
			ox: this.ox,
			oy: this.oy,
			mpu: this.mpu,
			wox: this.wox,
			woy: this.woy,
			z: this.src.z,
			x: this.src.x,
			y: this.src.y
		};
	}
};
// web/modes/joseon/hanok.mjs
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const CIVIC = /* @__PURE__ */ new Set([
	"school",
	"university",
	"college",
	"hospital",
	"civic",
	"public"
]);
function bufferCut(r, E) {
	const n = r.length / 2, b = E / 64;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n, ax = r[i * 2], ay = r[i * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1];
		if (ax === bx && ay !== by && (ax <= -b || ax >= E + b) || ay === by && ax !== bx && (ay <= -b || ay >= E + b)) return true;
	}
	return false;
}
function hash2(x, y) {
	let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
	h = Math.imul(h ^ h >>> 13, 1274126177);
	return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function districtNoise(xm, ym, cell) {
	const x = xm / cell, y = ym / cell, ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
	return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), fx), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), fx), fy);
}
function hanokType(H, A, aspect, landuse, district, K, r) {
	const T = K.tall;
	if (H >= T.pagodaMinH && aspect <= T.pagodaMaxAspect && r(1) < T.pagodaShare) return {
		kind: "pagoda",
		thatch: false,
		H
	};
	if (H >= T.towerMinH) return {
		kind: "tower",
		thatch: false,
		H
	};
	if (H >= T.hallMinH && A >= T.hallMinAreaM2 && r(2) < (landuse === "residential" ? T.hallShareResidential : T.hallShare)) return {
		kind: "hall",
		thatch: false
	};
	const base = CIVIC.has(landuse) ? 0 : K.thatch.byLanduse[landuse] ?? K.thatch.byLanduse.unknown;
	const p = A > K.thatch.maxAreaM2 || H >= T.towerMinH ? 0 : clamp(base * (.2 + 1.6 * smooth(clamp((district - .25) / .5, 0, 1))), 0, .95);
	return {
		kind: "house",
		thatch: r(3) < p
	};
}
function houseWings(L, S, K, rnd, thatch) {
	const m = K.eaveOutM * .5, a = L / 2 - m, b = S / 2 - m;
	if (a < 1.6 || b < 1.4) return [{
		x: 0,
		y: 0,
		hl: Math.max(1.2, a),
		hd: Math.max(1.2, b),
		turn: false
	}];
	const d = clamp(Math.min(L, S) * .42, 4.2, thatch ? 5.2 : 6.6), sb = rnd(4) < .5 ? 1 : -1, sx = rnd(5) < .5 ? 1 : -1;
	const fitsL = 2 * b >= d + 3.5 && 2 * a >= 2 * d, fitsU = fitsL && 2 * a >= 2 * d + 3, fitsO = 2 * a >= 2 * d + 4 && 2 * b >= 2 * d + 4;
	const w = thatch ? K.plans.thatch : K.plans.giwa, u = rnd(6);
	let plan = u < w[0] ? "ㅡ" : u < w[0] + w[1] ? "ㄱ" : u < w[0] + w[1] + w[2] ? "ㄷ" : "ㅁ";
	if (plan === "ㅁ" && !fitsO) plan = "ㄷ";
	if (plan === "ㄷ" && !fitsU) plan = "ㄱ";
	if (plan === "ㄱ" && !fitsL) plan = "ㅡ";
	const back = {
		x: 0,
		y: sb * (b - d / 2),
		hl: a,
		hd: d / 2,
		turn: false
	};
	if (plan === "ㅡ") return 2 * b > d * 1.5 ? [back] : [{
		x: 0,
		y: 0,
		hl: a,
		hd: b,
		turn: false
	}];
	const side = (s) => {
		const y0 = sb * (b - d / 2), y1 = plan === "ㅁ" ? -y0 : -sb * b;
		return {
			x: s * (a - d / 2),
			y: (y0 + y1) / 2,
			hl: Math.abs(y0 - y1) / 2,
			hd: d / 2,
			turn: true
		};
	};
	if (plan === "ㄱ") return [back, side(sx)];
	if (plan === "ㄷ") return [
		back,
		side(1),
		side(-1)
	];
	return [
		back,
		{
			x: 0,
			y: -back.y,
			hl: a,
			hd: d / 2,
			turn: false
		},
		side(1),
		side(-1)
	];
}
function hanokLayout(L, S, K, rnd = () => .5, type = {
	kind: "house",
	thatch: false
}) {
	const eave = K.eaveOutM, one = K.single, C = K.compound, thatch = !!type.thatch, gate = rnd(9) < .5 ? 1 : -1;
	const court = (h, stone) => ({
		hx: L / 2 - C.insetM,
		hy: S / 2 - C.insetM,
		stone,
		gate
	});
	const T = K.tall;
	if (type.kind === "tower") {
		const a = Math.max(2.5, L / 2 - .3 - T.podiumOutM), b = Math.max(2.5, S / 2 - .3 - T.podiumOutM), [ma, mb] = T.towerMaxHalfM;
		if (a <= ma && b <= mb) return {
			houses: [{
				x: 0,
				y: 0,
				hl: a,
				hd: b,
				turn: false,
				thatch: false,
				kind: "tower",
				H: type.H
			}],
			wall: null
		};
		const ta = Math.min(a, ma), houses = [{
			x: 0,
			y: 0,
			hl: ta,
			hd: Math.min(b, mb),
			turn: false,
			thatch: false,
			kind: "tower",
			H: type.H
		}], side = L / 2 - ta - T.podiumOutM - 4;
		if (side >= 9) for (const sx of [-1, 1]) houses.push({
			x: sx * (L / 2 - side / 2 - 1.5),
			y: 0,
			hl: Math.min(side / 2 - 1, T.hallHalfM[0]),
			hd: clamp(S / 2 - 6, 3.5, T.hallHalfM[1]),
			turn: false,
			thatch: false,
			kind: "hall"
		});
		return {
			houses,
			wall: court(0, false)
		};
	}
	if (type.kind === "pagoda") {
		const s = Math.max(3, Math.min(L, S) / 2 - T.pagodaEaveM - .5), walled = L * S >= C.minAreaM2 && Math.min(L, S) / 2 - s > 4;
		return {
			houses: [{
				x: 0,
				y: 0,
				hl: s,
				hd: s,
				turn: false,
				thatch: false,
				kind: "pagoda",
				H: type.H
			}],
			wall: walled ? court(0, false) : null
		};
	}
	if (type.kind === "hall") return {
		houses: [{
			x: 0,
			y: 0,
			hl: clamp(L / 2 - 4, 4, T.hallHalfM[0]),
			hd: clamp(S / 2 - 4, 3.5, T.hallHalfM[1]),
			turn: false,
			thatch: false,
			kind: "hall"
		}],
		wall: L * S >= C.minAreaM2 ? court(0, false) : null
	};
	if (L <= one.maxLengthM && S <= one.maxDepthM) {
		const P = K.lot;
		if (L * S >= P.minAreaM2 && rnd(1) < (thatch ? P.thatchShare : P.giwaShare)) {
			const mx = C.insetM + P.wallThickM + .8, li = L - 2 * mx, si = S - 2 * mx - P.yardM;
			if (li >= 5 && si >= 4) return {
				houses: houseWings(li, si, K, rnd, thatch).map((h) => ({
					...h,
					y: h.y - gate * P.yardM / 2,
					thatch,
					kind: "house"
				})),
				wall: court(0, thatch || rnd(2) < P.stoneShareGiwa)
			};
		}
		return {
			houses: houseWings(L, S, K, rnd, thatch).map((h) => ({
				...h,
				thatch,
				kind: "house"
			})),
			wall: null
		};
	}
	const walled = L * S >= C.minAreaM2, edge = walled ? C.insetM + C.wallThickM + eave + 1 : eave * .5;
	const Li = Math.max(4, L - 2 * edge), Si = Math.max(4, S - 2 * edge), [d0, d1] = K.houseDepthM;
	let nR = Math.max(1, Math.floor((Si + K.yardM) / (d1 + K.yardM))), nC = Math.max(1, Math.round((Li + K.gapM) / (K.houseLengthM + K.gapM)));
	while (nR * nC > K.maxHouses) if (nC >= nR) nC--;
	else nR--;
	const D = clamp((Si - (nR - 1) * K.yardM) / nR, Math.min(d0, Si), d1), Lc = Math.min(K.maxLengthM, (Li - (nC - 1) * K.gapM) / nC);
	const pitchL = Lc + K.gapM, x0 = -(nC * Lc + (nC - 1) * K.gapM) / 2 + Lc / 2, pitchS = nR > 1 ? (Si - D) / (nR - 1) : 0, houses = [];
	for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
		const k = r * 97 + c;
		if (nR * nC >= 3 && rnd(k) < K.emptyShare) continue;
		const fl = .72 + .28 * rnd(k + 41), fd = .8 + .2 * rnd(k + 53);
		houses.push({
			x: x0 + pitchL * c,
			y: nR > 1 ? -Si / 2 + D / 2 + pitchS * r : 0,
			hl: Math.max(1.2, Lc / 2 * fl),
			hd: Math.max(1.2, D / 2 * fd),
			turn: false,
			thatch: thatch && rnd(k + 67) < .85,
			kind: "house"
		});
	}
	if (!houses.length) houses.push({
		x: 0,
		y: 0,
		hl: Math.max(1.2, Lc / 2),
		hd: D / 2,
		turn: false,
		thatch,
		kind: "house"
	});
	return {
		houses,
		wall: walled ? court(0, thatch || rnd(2) < C.stoneShare) : null
	};
}
function hanokBuilding(tb, it, unit) {
	const K = tb.P.hanok, E = tb.E, mpu = tb.mPerUnit;
	if (it.depth) return;
	const cut = it.clipped && bufferCut(it.raw, E), ring0 = !it.clipped || cut ? it.outer : it.raw;
	const box = orientedBox(ring0.length > 160 ? simplifyRing(ring0, .5 / mpu) : ring0);
	if (!box) return;
	const A = it.clipped && !cut ? area(it.raw) * mpu * mpu : it.A;
	const k = clamp(Math.sqrt(A / Math.max(box.hw * box.hh * 4 * mpu * mpu, 1e-6)), .55, 1) * K.fitK, L = box.hw * 2 * mpu * k, S = box.hh * 2 * mpu * k;
	const rnd = (i) => unit(it.seed, 101 + i), n = 2 ** tb.src.z, cm = 40075016.68557849 * Math.cos(37.55 * Math.PI / 180);
	const district = districtNoise((tb.src.x + box.cx / E) / n * cm, (tb.src.y + box.cy / E) / n * cm, K.thatch.districtM);
	const lay = hanokLayout(L, S, K, rnd, hanokType(it.H, A, L / Math.max(S, .1), it.landuse, district, K, (i) => unit(it.seed, 211 + i)));
	const ux = box.ux, uy = box.uy, vx = -uy, vy = ux;
	const at = (x, y) => [box.cx + (x * ux + y * vx) / mpu, box.cy + (x * uy + y * vy) / mpu];
	const sx = tb.src.x, sy = tb.src.y, q = (v) => Math.round(v * 1024) / 1024;
	const mine = (p) => Math.floor(q(sx * E + p[0]) / E) === sx && Math.floor(q(sy * E + p[1]) / E) === sy;
	const W = tb.W, seed = it.seed >>> 0;
	W.b = [
		seed & 255,
		seed >>> 8 & 255,
		0,
		0
	];
	let drawn = 0;
	lay.houses.forEach((h, i) => {
		const c = at(h.x, h.y);
		if (!mine(c)) return;
		const F = h.turn ? frame(tb, c, vx, vy) : frame(tb, c, ux, uy), r = (j) => unit(it.seed, 7 + i * 13 + j);
		if (h.kind === "tower") tower(tb, F, h.hl, h.hd, h.H, K, r);
		else if (h.kind === "pagoda") pagoda(tb, F, h.hl, h.H, K, r);
		else if (h.kind === "hall") hall(tb, F, h.hl, h.hd, K, r);
		else if (h.thatch) thatchHouse(tb, F, h.hl, h.hd, K, r);
		else giwaHouse(tb, F, h.hl, h.hd, K, r);
		drawn++;
	});
	if (lay.wall) drawn += walls(tb, at, mine, ux, uy, lay.wall, K);
	if (drawn) tb.count++;
}
function skirtGroups(len, G) {
	const leg = clamp(G.cornerK * len, G.cornerM[0], G.cornerM[1]);
	if (len <= 2 * leg + G.gapM) return [[0, len]];
	const span = len - 2 * leg - 2 * G.gapM, out = [[0, leg]];
	if (span >= G.minM) {
		const n = Math.max(1, Math.round((span + G.gapM) / (G.widthM + G.gapM))), w = (span - (n - 1) * G.gapM) / n;
		for (let i = 0; i < n; i++) {
			const x = leg + G.gapM + i * (w + G.gapM);
			out.push([x, x + w]);
		}
	}
	out.push([len - leg, len]);
	return out;
}
function skirtInst(xy, z, angle, L, u0, ends, l0, l1, o, slot) {
	const f = /* @__PURE__ */ new Float32Array(8), b = new Uint8Array(f.buffer), q = (v) => clamp(Math.round(v * 100), 0, 255);
	f[0] = xy[0];
	f[1] = xy[1];
	f[2] = z;
	f[3] = angle;
	f[4] = L;
	f[5] = u0;
	b[24] = q(ends[0]);
	b[25] = q(ends[1]);
	b[26] = q(ends[2]);
	b[27] = q(ends[3]);
	b[28] = q(l0);
	b[29] = q(l1);
	b[30] = q(o);
	b[31] = slot;
	return f;
}
function skirtTemplate(rows) {
	const v = [], idx = [], R = rows.length;
	for (const t of rows) for (const sc of [
		0,
		.5,
		1
	]) v.push(sc, t, 0);
	for (const sc of [
		0,
		.5,
		1
	]) v.push(sc, 1, 1, sc, 1, 2);
	const last = R * 3 - 1;
	idx.push(0, 2, last, 0, last, last - 2);
	for (let ti = 0; ti < R - 1; ti++) for (let si = 0; si < 2; si++) {
		const q = ti * 3 + si;
		idx.push(q, q + 1, q + 4, q, q + 4, q + 3);
	}
	const e = R * 3;
	for (let i = 0; i < 2; i++) {
		const a = e + 2 * i, b = a + 2;
		idx.push(a, b, b + 1, a, b + 1, a + 1);
	}
	return {
		verts: new Float32Array(v),
		idx: new Uint16Array(idx),
		lo: [0, 6],
		grid: [6, (R - 1) * 12],
		edge: [6 + (R - 1) * 12, 12]
	};
}
function roofInst(xy, angle, v, sty, seed) {
	const f = /* @__PURE__ */ new Float32Array(16), b = new Uint8Array(f.buffer);
	f[0] = xy[0];
	f[1] = xy[1];
	f[2] = angle;
	f.set(v, 3);
	b[56] = sty[0];
	b[57] = sty[1];
	b[58] = sty[2];
	b[60] = seed[0];
	b[61] = seed[1];
	return f;
}
function boxInst(xy, angle, a, b, z0, zt, storey, w, seed) {
	const f = /* @__PURE__ */ new Float32Array(10), u = new Uint8Array(f.buffer);
	f[0] = xy[0];
	f[1] = xy[1];
	f[2] = angle;
	f[3] = a;
	f[4] = b;
	f[5] = z0;
	f[6] = zt;
	f[7] = storey;
	u[32] = w[0];
	u[33] = w[1];
	u[34] = w[2];
	u[35] = w[3];
	u[36] = seed[0];
	u[37] = seed[1];
	return f;
}
function roofTemplate() {
	const v = [], P = [];
	const add = (part, n, f) => {
		const b = v.length / 3;
		P[part] = b;
		for (let k = 0; k < n; k++) {
			const [i, j] = f(k);
			v.push(part, i, j);
		}
	};
	for (const part of [0, 1]) add(part, 12, (k) => [k % 3, Math.floor(k / 3)]);
	for (const part of [2, 3]) add(part, 6, (k) => [k % 2, Math.floor(k / 2)]);
	for (const part of [4, 5]) add(part, 7, (k) => [k, 0]);
	add(6, 12, (k) => [k, 0]);
	add(7, 16, (k) => [k, 0]);
	add(8, 20, (k) => [k, 0]);
	add(9, 20, (k) => [k, 0]);
	add(10, 8, (k) => [k, 0]);
	add(11, 36, (k) => [k, 0]);
	const far = [], near = [], detail = [], gable = [
		5,
		6,
		1,
		5,
		1,
		0,
		0,
		1,
		3,
		0,
		3,
		2,
		2,
		3,
		4
	];
	for (const part of [0, 1]) {
		const b = P[part];
		far.push(b, b + 2, b + 11, b, b + 11, b + 9);
		for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
			const q = b + j * 3 + i;
			near.push(q, q + 1, q + 4, q, q + 4, q + 3);
		}
	}
	for (const part of [2, 3]) {
		const b = P[part];
		far.push(b, b + 1, b + 5, b, b + 5, b + 4);
		for (let j = 0; j < 2; j++) {
			const q = b + j * 2;
			near.push(q, q + 1, q + 3, q, q + 3, q + 2);
		}
	}
	for (const part of [4, 5]) for (const i of gable) {
		far.push(P[part] + i);
		near.push(P[part] + i);
	}
	for (let q = 0; q < 3; q++) {
		const b = P[6] + q * 4;
		near.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	for (let f = 0; f < 4; f++) {
		const b = P[7] + f * 4;
		near.push(b + 1, b + 3, b + 2, b + 1, b + 2, b);
	}
	for (const part of [8, 9]) for (let f = 0, b = P[part]; f < 4; f++) {
		const n = f < 2 ? 3 : 2;
		for (let i = 0; i < n - 1; i++) detail.push(b + i, b + i + 1, b + n + i + 1, b + i, b + n + i + 1, b + n + i);
		b += 2 * n;
	}
	for (const e of [0, 4]) {
		const b = P[10] + e;
		detail.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	for (let h = 0; h < 4; h++) for (let q = 0; q < 2; q++) for (let c = 0; c < 2; c++) {
		const a = P[11] + h * 9 + q * 3 + c, b = a + 3;
		detail.push(a, a + 1, b + 1, a, b + 1, b);
	}
	return {
		verts: new Float32Array(v),
		idx: new Uint16Array([
			...far,
			...near,
			...detail
		]),
		far: [0, far.length],
		near: [far.length, near.length],
		detail: [far.length, near.length + detail.length]
	};
}
function boxTemplate() {
	const v = [], idx = [];
	for (let s = 0; s < 4; s++) {
		for (const [e, t] of [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		]) v.push(s, e, t);
		const b = s * 4;
		idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	const b4 = v.length / 3;
	for (let i = 0; i < 20; i++) v.push(4, i, 0);
	const b5 = v.length / 3;
	for (let i = 0; i < 32; i++) v.push(5, i, 0);
	for (let q = 0; q < 5; q++) {
		const b = b4 + q * 4;
		idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	for (let q = 0; q < 8; q++) {
		const b = b5 + q * 4;
		idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	for (let sd = 0; sd < 4; sd++) for (let k = 0; k < 12; k++) {
		const b = v.length / 3;
		for (let c = 0; c < 28; c++) v.push(6 + sd, k, c);
		for (let q = 0; q < 7; q++) idx.push(b + q * 4, b + q * 4 + 1, b + q * 4 + 2, b + q * 4, b + q * 4 + 2, b + q * 4 + 3);
	}
	return {
		verts: new Float32Array(v),
		idx: new Uint16Array(idx),
		far: [0, 24],
		near: [0, 24],
		detail: [0, idx.length]
	};
}
function frame(tb, c, ux, uy) {
	const W = tb.W, mpu = tb.mPerUnit, u = tb.unit, vx = -uy, vy = ux, E = tb.E, CH = Math.sqrt(tb.chunks.length);
	const ch = tb.chunks[clamp(Math.floor(c[0] / E * CH), 0, CH - 1) + CH * clamp(Math.floor(c[1] / E * CH), 0, CH - 1)];
	ch.n++;
	const F = {
		ch,
		W,
		v(p, n, uu) {
			W.normal(n[0] * ux + n[1] * vx, n[0] * uy + n[1] * vy, n[2]);
			const x = (c[0] + (p[0] * ux + p[1] * vx) / mpu) * u, y = (c[1] + (p[0] * uy + p[1] * vy) / mpu) * u;
			tb.extend(ch, x, y, x, y, p[2]);
			return W.v(x, y, p[2], uu);
		},
		quad(P, n, U = [
			0,
			0,
			0,
			0
		], list = "walls") {
			const i = P.map((p, j) => F.v(p, n, U[j]));
			push(ch[list], i, P, n);
		},
		mesh(P, N, U, lists, out) {
			const i = P.map((p, j) => F.v(p, N[j], U[j]));
			for (const [list, tris] of Object.entries(lists)) for (let t = 0; t < tris.length; t += 3) tri(ch[list], i, P, tris[t], tris[t + 1], tris[t + 2], out);
		},
		shift(dx, dy) {
			return frame(tb, [c[0] + (dx * ux + dy * vx) / mpu, c[1] + (dx * uy + dy * vy) / mpu], ux, uy);
		},
		at(p) {
			return [(c[0] + (p[0] * ux + p[1] * vx) / mpu) * u, (c[1] + (p[0] * uy + p[1] * vy) / mpu) * u];
		},
		angle(d) {
			return Math.atan2(d[0] * uy + d[1] * vy, d[0] * ux + d[1] * vx);
		},
		inst(kind, rec, far, pts) {
			(far ? ch.instFar : ch.inst)[kind].push(rec);
			for (const p of pts) {
				const q = F.at(p);
				tb.extend(ch, q[0], q[1], q[0], q[1], p[2]);
			}
		}
	};
	return F;
}
const sub = (a, b) => [
	a[0] - b[0],
	a[1] - b[1],
	a[2] - b[2]
];
const cross = (a, b) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [
		a[0] / l,
		a[1] / l,
		a[2] / l
	];
};
function tri(list, i, P, a, b, c, out) {
	const n = cross(sub(P[b], P[a]), sub(P[c], P[a]));
	if (Math.hypot(n[0], n[1], n[2]) < 1e-9) return;
	if (dot(n, typeof out === "function" ? out(P[a], P[b], P[c]) : out) >= 0) list.push(i[a], i[b], i[c]);
	else list.push(i[a], i[c], i[b]);
}
function push(list, i, P, n) {
	tri(list, i, P, 0, 1, 2, n);
	tri(list, i, P, 0, 2, 3, n);
}
function box$1(F, a, b, z0, z1, top, wallU, list = "walls") {
	const C = [
		[-a, -b],
		[a, -b],
		[a, b],
		[-a, b]
	];
	for (let s = 0; s < 4; s++) {
		const p = C[s], q = C[(s + 1) % 4], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy), n = [
			dy / l,
			-dx / l,
			0
		];
		const nOut = dot([
			n[0],
			n[1],
			0
		], [
			(p[0] + q[0]) / 2,
			(p[1] + q[1]) / 2,
			0
		]) >= 0 ? n : [
			-n[0],
			-n[1],
			0
		];
		if (wallU) wallU(l, s);
		F.quad([
			[
				p[0],
				p[1],
				z0
			],
			[
				q[0],
				q[1],
				z0
			],
			[
				q[0],
				q[1],
				z1
			],
			[
				p[0],
				p[1],
				z1
			]
		], nOut, [
			0,
			l,
			l,
			0
		], list);
	}
	if (top) F.quad(C.map(([x, y]) => [
		x,
		y,
		z1
	]), [
		0,
		0,
		1
	], void 0, list);
}
const WALL$1 = {
	HOUSE: 0,
	MUD: 1,
	STOREYS: 2,
	STOREY: 3
};
function houseWalls(tb, F, a, b, z0, zt, type, K, r, storey = 0, mx = [0, 0]) {
	const s = tb.W.b;
	F.inst("box", boxInst(F.at([0, 0]), F.angle([1, 0]), a, b, z0, zt, storey, [
		type,
		mx[0],
		mx[1],
		Math.floor(r * 16)
	], s), true, [
		[
			-a,
			-b,
			zt
		],
		[
			a,
			b,
			zt
		],
		[
			a,
			-b,
			z0
		],
		[
			-a,
			b,
			z0
		]
	]);
}
const giwaProf = (t) => .45 * t + .55 * t * t;
const ROOF_STYLE = {
	hip: 0,
	paljak: 1,
	gable: 2
};
function roof(tb, F, a, b, o, ze, rise, ar, { thatch = false, lift = 0, kick = 0, t1 = 1, style = "hip", zt, H, slot }) {
	const s = tb.W.b, k = kick, top = H < 6e3 ? H : ze + rise;
	F.inst("roof", roofInst(F.at([0, 0]), F.angle([1, 0]), [
		a,
		b,
		o,
		ze,
		rise,
		ar,
		lift,
		k,
		t1,
		zt,
		H
	], [
		ROOF_STYLE[style],
		thatch ? 1 : 0,
		slot
	], s), true, [
		[
			-(a + o + k + .7),
			-(b + o + k),
			ze
		],
		[
			a + o + k + .7,
			b + o + k,
			top
		],
		[
			a + o + k + .7,
			-(b + o + k),
			ze
		],
		[
			-(a + o + k + .7),
			b + o + k,
			ze
		]
	]);
}
function giwaRoof(tb, F, a, b, zt, K, slot, opts = {}) {
	const o = opts.eave ?? K.eaveOutM, be = b + o, ae = a + o, ze = zt - .15, rise = clamp(K.riseK * be, K.riseM[0], K.riseM[1]);
	const R = K.ridge, ar = opts.pyramid ? 0 : Math.max(.3 * ae, ae - K.hipK * be), zr = ze + rise, top = opts.t1 ? ze + rise * giwaProf(opts.t1) : zr + R.upM;
	const style = opts.t1 || opts.pyramid ? "hip" : opts.style || "hip";
	roof(tb, F, a, b, o, ze, rise, ar, {
		lift: K.cornerLiftM,
		kick: K.cornerKickM * .7,
		t1: opts.t1 ?? 1,
		style,
		zt,
		H: opts.t1 ? 6553.5 : top,
		slot
	});
	return {
		ze,
		rise,
		zr,
		top
	};
}
function roofStyle(b, K, u) {
	const S = K.roofStyles, w = b <= S.narrowHalfM ? S.narrow : S.wide;
	return u < w[0] ? "paljak" : u < w[0] + w[1] ? "gable" : "hip";
}
function giwaHouse(tb, F, a, b, K, r) {
	const zt = K.baseM + lerp(K.wallM[0], K.wallM[1], clamp((b * 2 - 5) / 5, 0, 1)) * (.92 + .16 * r(1));
	houseWalls(tb, F, a, b, 0, zt, WALL$1.HOUSE, K, r(2));
	giwaRoof(tb, F, a, b, zt, K, Math.floor(r(3) * 3) % 3, { style: roofStyle(b, K, r(5)) });
}
function thatchHouse(tb, F, a, b, K, r) {
	const T = K.thatch, zt = T.baseM + T.wallM * (.93 + .14 * r(1)), o = T.eaveOutM, be = b + o, ae = a + o;
	const ze = zt + .05, rise = clamp(T.riseK * be, T.riseM[0], T.riseM[1]), ar = Math.max(.12 * ae, ae - T.hipK * be);
	houseWalls(tb, F, a, b, 0, zt, WALL$1.MUD, K, r(2));
	roof(tb, F, a, b, o, ze, rise, ar, {
		thatch: true,
		zt,
		H: ze + rise,
		slot: Math.floor(r(3) * 3) % 3
	});
}
function hall(tb, F, a, b, K, r) {
	const T = K.tall, slot = Math.floor(r(3) * 3) % 3, z1 = K.baseM + T.hallStoreyM[0], set = T.hallSetM, a2 = a - set, b2 = b - set;
	houseWalls(tb, F, a, b, 0, z1, WALL$1.HOUSE, K, r(2));
	const be = b + K.eaveOutM, skirt = giwaRoof(tb, F, a, b, z1, K, slot, { t1: clamp(1 - (b2 - .3) / be, .3, .8) });
	const z2 = skirt.top - .3 + T.hallStoreyM[1];
	houseWalls(tb, F, a2, b2, skirt.top - .3, z2, WALL$1.STOREY, K, r(4), T.hallStoreyM[1]);
	giwaRoof(tb, F, a2, b2, z2, K, slot, { style: "paljak" });
}
function pagoda(tb, F, s, H, K, r) {
	const T = K.tall, slot = Math.floor(r(3) * 3) % 3, spire = Math.min(T.spireM, H * .12), body = Math.max(12, H - spire - 2);
	const floors = clamp(Math.round(body / Math.max(T.pagodaStoreyMinM, body / 13)), 3, 13), st = body / (floors + .35);
	let z = 0, h = s;
	for (let f = 0; f < floors; f++) {
		const storey = f ? st : st * 1.35, zt = z + storey, last = f === floors - 1, next = h * (1 - T.pagodaShrink);
		houseWalls(tb, F, h, h, z, zt, f ? WALL$1.STOREY : WALL$1.HOUSE, K, r(10 + f), storey);
		if (last) {
			const R = giwaRoof(tb, F, h, h, zt, K, slot, {
				pyramid: true,
				eave: T.pagodaEaveM
			});
			tb.W.kind = HANOK_KIND.ROOF;
			tb.W.w = [
				0,
				0,
				0,
				0
			];
			tb.W.m = [
				3,
				0,
				255,
				255
			];
			box$1(F, .25, .25, R.zr - .3, R.zr + spire, true);
		} else {
			const be = h + T.pagodaEaveM, t1 = clamp(1 - (next - .2) / be, .25, .85);
			z = giwaRoof(tb, F, h, h, zt, K, slot, {
				t1,
				eave: T.pagodaEaveM
			}).top - .25;
		}
		h = next;
	}
}
function tower(tb, F, a, b, H, K, r) {
	const T = K.tall, slot = Math.floor(r(3) * 3) % 3, top = Math.max(T.podiumM + 2 * T.storeyM, H - 2.5);
	const floors = Math.max(2, Math.round((top - T.podiumM) / T.storeyM)), st = (top - T.podiumM) / floors;
	houseWalls(tb, F, a, b, 0, top, WALL$1.STOREYS, K, r(2), st, [T.skirtStep.find(([n]) => floors <= n)[1], Math.round(T.podiumM * 20)]);
	const pa = a + T.podiumOutM, pb = b + T.podiumOutM;
	houseWalls(tb, F, pa, pb, 0, T.podiumM, WALL$1.HOUSE, K, r(4));
	const be = pb + K.eaveOutM, t1 = clamp(1 - (b - .2) / be, .2, .7);
	giwaRoof(tb, F, pa, pb, T.podiumM, K, slot, { t1 });
	const G = T.skirtGroup, step = T.skirtStep.find(([n]) => floors <= n)[1], k = K.cornerKickM * .7, rise = T.skirtRiseM;
	const C = [
		[-a, -b],
		[a, -b],
		[a, b],
		[-a, b]
	], sides = C.map((p, s) => {
		const q = C[(s + 1) % 4], len = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
		return {
			p,
			d,
			n: [d[1], -d[0]],
			len,
			groups: skirtGroups(len, G)
		};
	});
	for (let f = step; f < floors; f += step) {
		const zi = T.podiumM + f * st + .15, far = f / step % 3 === 0;
		for (const { p, d, n, len, groups } of sides) for (const [x0, x1] of groups) {
			const c0 = x0 <= 1e-6, c1 = x1 >= len - 1e-6, o = c0 || c1 ? G.cornerOutM : G.outM, ck = o + k;
			const on0 = c0 ? ck : o, al0 = c0 ? ck : G.flareM, on1 = c1 ? ck : o, al1 = c1 ? ck : G.flareM;
			const w0 = [
				p[0] + d[0] * x0,
				p[1] + d[1] * x0,
				zi
			], w1 = [
				p[0] + d[0] * x1,
				p[1] + d[1] * x1,
				zi
			];
			const e0 = [
				w0[0] + n[0] * on0 - d[0] * al0,
				w0[1] + n[1] * on0 - d[1] * al0,
				zi - rise
			], e1 = [
				w1[0] + n[0] * on1 + d[0] * al1,
				w1[1] + n[1] * on1 + d[1] * al1,
				zi - rise
			];
			F.inst("skirt", skirtInst(F.at(w0), zi, F.angle(d), x1 - x0, x0, [
				on0,
				al0,
				on1,
				al1
			], c0 ? G.liftM[0] : G.liftM[1], c1 ? G.liftM[0] : G.liftM[1], o, slot), far, [
				w0,
				w1,
				e0,
				e1
			]);
		}
	}
	if (a / b >= T.triRoofAspect) {
		const leg = clamp(G.cornerK * 2 * a, G.cornerM[0], G.cornerM[1]), ae = Math.max(2, leg / 2), xe = a - ae, am = Math.max(2, Math.min(a * .34, xe - ae - 1));
		giwaRoof(tb, F.shift(-xe, 0), ae, b, top, K, slot, { style: "paljak" });
		giwaRoof(tb, F.shift(xe, 0), ae, b, top, K, slot, { style: "paljak" });
		houseWalls(tb, F, am, b * .92, top - .2, top + 2.2, WALL$1.STOREY, K, r(6), 2.4);
		giwaRoof(tb, F, am, b * .92, top + 2.2, K, slot, { style: "paljak" });
	} else giwaRoof(tb, F, a, b, top, K, slot, { style: "paljak" });
}
function walls(tb, at, mine, ux, uy, w, K) {
	const C = K.compound, W = tb.W, stone = w.stone, t = (stone ? K.lot.wallThickM : C.wallThickM) / 2, z = stone ? K.lot.stoneWallM : C.wallM;
	const { hx, hy } = w, gate = Math.min(C.gateM, hx) / 2, g = w.gate;
	const segs = [
		[[-hx, -g * hy], [hx, -g * hy]],
		[[hx, -hy], [hx, hy]],
		[[-hx, hy], [-hx, -hy]],
		[[-hx, g * hy], [-gate, g * hy]],
		[[gate, g * hy], [hx, g * hy]]
	];
	let n = 0;
	for (const [p, q] of segs) {
		const m = at((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
		if (!mine(m)) continue;
		const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
		if (l < .3) continue;
		const F = frame(tb, m, ux, uy), ex = (q[0] - p[0]) / l, ey = (q[1] - p[1]) / l, nx = -ey, ny = ex;
		const P = (s, d, zz) => {
			const x = (s - .5) * l, y = d;
			return [
				x * ex + y * nx,
				x * ey + y * ny,
				zz
			];
		};
		W.m = [
			0,
			0,
			Math.min(255, Math.round((z + .35) * 10)),
			0
		];
		W.kind = stone ? HANOK_KIND.STONE : HANOK_KIND.DAM;
		const lq = Math.min(65535, Math.round(l * 20));
		W.w = [
			0,
			lq & 255,
			lq >>> 8,
			0
		];
		const tz = stone ? z - .15 : z;
		F.quad([
			P(0, t, 0),
			P(1, t, 0),
			P(1, t * (stone ? .75 : 1), tz),
			P(0, t * (stone ? .75 : 1), tz)
		], [
			nx,
			ny,
			0
		], [
			0,
			l,
			l,
			0
		], "hi");
		F.quad([
			P(1, -t, 0),
			P(0, -t, 0),
			P(0, -t * (stone ? .75 : 1), tz),
			P(1, -t * (stone ? .75 : 1), tz)
		], [
			-nx,
			-ny,
			0
		], [
			l,
			0,
			0,
			l
		], "hi");
		F.quad([
			P(0, -t, 0),
			P(0, t, 0),
			P(0, t, z),
			P(0, -t, z)
		], [
			-ex,
			-ey,
			0
		], void 0, "hi");
		F.quad([
			P(1, t, 0),
			P(1, -t, 0),
			P(1, -t, z),
			P(1, t, z)
		], [
			ex,
			ey,
			0
		], void 0, "hi");
		if (stone) {
			F.quad([
				P(0, t * .75, tz),
				P(1, t * .75, tz),
				P(1, 0, z),
				P(0, 0, z)
			], norm([
				nx,
				ny,
				1.2
			]), [
				0,
				l,
				l,
				0
			], "hi");
			F.quad([
				P(1, -t * .75, tz),
				P(0, -t * .75, tz),
				P(0, 0, z),
				P(1, 0, z)
			], norm([
				-nx,
				-ny,
				1.2
			]), [
				l,
				0,
				0,
				l
			], "hi");
		} else {
			W.kind = HANOK_KIND.ROOF;
			W.m[0] = 0;
			const c = t + .16, zc = z + .35, zo = z - .05;
			F.quad([
				P(0, c, zo),
				P(1, c, zo),
				P(1, 0, zc),
				P(0, 0, zc)
			], norm([
				nx * .35,
				ny * .35,
				c
			]), [
				0,
				l,
				l,
				0
			], "hi");
			F.quad([
				P(1, -c, zo),
				P(0, -c, zo),
				P(0, 0, zc),
				P(1, 0, zc)
			], norm([
				-nx * .35,
				-ny * .35,
				c
			]), [
				l,
				0,
				0,
				l
			], "hi");
		}
		n++;
	}
	const gm = at(0, g * hy);
	if (!stone && mine(gm)) {
		const G = C.gateRoof, F = frame(tb, gm, ux, uy), hw = G.widthM / 2, hd = G.depthM / 2, zt = G.heightM, Hq = Math.min(65535, Math.round((zt + 1) * 10));
		W.kind = HANOK_KIND.WALL;
		W.b[2] = 0;
		W.w = [
			0,
			0,
			0,
			0
		];
		W.m = [
			0,
			0,
			Hq & 255,
			Hq >>> 8
		];
		for (const x of [-gate, gate]) box$1(F.shift(x, 0), .14, .14, 0, zt, false, null, "hi");
		W.kind = HANOK_KIND.ROOF;
		W.m = [
			0,
			0,
			Hq & 255,
			Hq >>> 8
		];
		for (const sd of [-1, 1]) F.quad([
			[
				-hw,
				sd * hd,
				zt
			],
			[
				hw,
				sd * hd,
				zt
			],
			[
				hw,
				0,
				zt + .8
			],
			[
				-hw,
				0,
				zt + .8
			]
		], norm([
			0,
			sd * .8,
			hd
		]), [
			-hw,
			hw,
			hw,
			-hw
		], "hi");
		n++;
	}
	return n;
}
registerCityPart("hanok", {
	building: hanokBuilding,
	skirtTemplate,
	roofTemplate,
	boxTemplate
});
// web/modes/starcraft/building_models.mjs
const A$2 = (slot) => ({
	look: "accent",
	slot
});
const G = (slot) => ({
	look: "glow",
	slot
});
const D = { look: "roof" };
const fit$1 = (minArea, maxAspect, weight) => ({
	minArea,
	maxArea: Infinity,
	maxAspect,
	tall: false,
	weight
});
const rect$1 = (x, y, hx, hy) => [
	[x - hx, y - hy],
	[x + hx, y - hy],
	[x + hx, y + hy],
	[x - hx, y + hy]
];
const ngon = (M, x, y, r, n = 8) => Array.from({ length: n }, (_, i) => [x + Math.cos(i * Math.PI * 2 / n) * r / M.aspect, y + Math.sin(i * Math.PI * 2 / n) * r]);
function box(M, x, y, hx, hy, z, h, slot = 0) {
	M.box(x, y, hx, hy, z, z + h, A$2(slot));
}
function bevel(M, x, y, hx, hy, z, h, slot = 0) {
	M.loft(rect$1(x, y, hx, hy), z, rect$1(x, y, hx * .77, hy * .77), z + h, {
		...A$2(slot),
		top: true
	});
}
function drum(M, x, y, r, z, h, slot = 0, r1 = r, n = 8) {
	M.frustum(x, y, r, r1, z, z + h, {
		n,
		...A$2(slot)
	});
}
function dome(M, x, y, r, z, h, slot = 0, light = false) {
	M.dome(x, y, r, z, h, {
		n: 8,
		rings: 3,
		...light ? G(slot) : A$2(slot)
	});
}
function sphere(M, x, y, r, z, h, slot = 0, light = true) {
	M.frustum(x, y, r * .32, r, z, z + h * .4, {
		n: 8,
		...light ? G(slot) : A$2(slot)
	});
	dome(M, x, y, r, z + h * .4, h * .6, slot, light);
}
function crystal(M, x, y, r, z, h, slot = 0) {
	M.frustum(x, y, r * .02, r, z, z + h * .43, {
		n: 6,
		...G(slot)
	});
	M.frustum(x, y, r, 0, z + h * .43, z + h, {
		n: 6,
		...G(slot)
	});
}
function bone(M, a, b, c, r = .09, slot = 1) {
	const p = ngon(M, a[0], a[1], r, 6), q = ngon(M, b[0], b[1], r * .55, 6), tip = q.map(() => [c[0], c[1]]);
	M.loft(p, a[2], q, b[2], {
		...A$2(slot),
		top: false
	});
	M.loft(q, b[2], tip, c[2], {
		...A$2(slot),
		top: false
	});
}
function strut(M, a, b, w = .055, slot = 1) {
	const lo = a[2] <= b[2] ? a : b, hi = a[2] <= b[2] ? b : a;
	M.loft(rect$1(lo[0], lo[1], w, w), lo[2], rect$1(hi[0], hi[1], w * .8, w * .8), Math.max(lo[2] + .02, hi[2]), {
		...A$2(slot),
		top: true
	});
}
function ring(M, x, y, r, z, width = .09, slot = 1, n = 8) {
	const a = ngon(M, x, y, r, n), b = ngon(M, x, y, r - width, n);
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n, p = [
			b[i],
			a[i],
			a[j],
			b[j]
		];
		M.loft(p, z, p, z + .045, {
			...A$2(slot),
			top: true
		});
	}
}
function slit(M, x, y, hx, hy, z, h = .08, slot = 1) {
	M.box(x, y, hx, hy, z, z + h, G(slot));
}
function grille(M, x, y, z, count = 4) {
	for (let i = 0; i < count; i++) M.box(x + (i - (count - 1) / 2) * .085, y, .018, .13, z, z + .035, D);
}
function legs(M) {
	for (const x of [-.57, .57]) for (const y of [-.57, .57]) {
		bevel(M, x, y, .16, .14, 0, .12, 1);
		strut(M, [
			x,
			y,
			.12
		], [
			x * .77,
			y * .77,
			.43
		], .075, 0);
	}
}
function tendrils(M, count = 6) {
	for (let i = 0; i < count; i++) {
		const a = i * Math.PI * 2 / count, x = Math.cos(a), y = Math.sin(a);
		M.loft(ngon(M, x * .48, y * .48, .13, 6), .04, ngon(M, x * .7, y * .7, .055, 6), .14, {
			...A$2(2),
			top: true
		});
	}
}
function maw(M, x, y, z, w = .23) {
	M.box(x, y, w, .035, z, z + .2, D);
	for (const s of [-1, 1]) bone(M, [
		x + s * w,
		y,
		.09 + z
	], [
		x + s * w * .85,
		y - .035,
		z + .27
	], [
		x + s * w * .48,
		y - .02,
		z + .37
	], .065);
}
const BUILDING_MODELS = {
	terran: [
		{
			id: "commandCenter",
			name: "커맨드 센터",
			fit: {
				...fit$1(220, 2.2, 3),
				big: true
			},
			build(M) {
				legs(M);
				drum(M, 0, 0, .85, .32, .25, 0, .66);
				drum(M, 0, 0, .66, .57, .44, 1);
				drum(M, 0, 0, .73, 1.01, .16, 0, .5);
				bevel(M, -.1, .07, .25, .25, 1.17, .25, 2);
				box(M, -.1, .07, .22, .22, 1.42, .16, 1);
				slit(M, -.1, -.155, .18, .018, 1.45, .07);
				box(M, -.1, .07, .11, .11, 1.58, .035, 0);
				drum(M, .31, .28, .13, 1.04, .3, 2);
				ring(M, .31, .28, .15, 1.34, .045, 1, 6);
				for (const x of [
					-.44,
					0,
					.44
				]) {
					bevel(M, x, -.56, .13, .14, .42, .28, 0);
					slit(M, x, -.71, .08, .02, .48, .06, 0);
				}
				grille(M, -.12, .15, 1.625, 3);
			}
		},
		{
			id: "barracks",
			name: "배럭",
			fit: {
				...fit$1(90, 3.8, 3),
				big: true
			},
			build(M) {
				legs(M);
				box(M, 0, 0, .72, .59, .33, .26, 2);
				for (const s of [-1, 1]) {
					box(M, s * .43, .07, .22, .51, .59, .49, 0);
					bevel(M, s * .43, .07, .24, .54, 1.08, .2, 1);
					box(M, s * .43, .39, .17, .17, 1.28, .21, 2);
					M.box(s * .43, .39, .11, .11, 1.49, 1.51, D);
					slit(M, s * .43, -.45, .17, .02, .79, .07, 0);
				}
				M.box(0, -.59, .23, .03, .4, .82, D);
				box(M, 0, -.65, .3, .1, .32, .08, 1);
				slit(M, 0, -.635, .19, .015, .82, .05);
				grille(M, 0, .25, .6, 4);
			}
		},
		{
			id: "supplyDepot",
			name: "서플라이 디팟",
			fit: {
				...fit$1(30, 3.8, 5),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .85, .73, 0, .16, 2);
				box(M, -.21, -.15, .48, .38, .16, .39, 0);
				bevel(M, -.21, -.15, .51, .41, .55, .16, 1);
				slit(M, -.23, -.57, .35, .02, .28, .15, 2);
				drum(M, -.18, .28, .34, .2, .48, 1);
				ring(M, -.18, .28, .32, .68, .075, 2, 8);
				drum(M, -.18, .28, .19, .68, .035, 2);
				for (const y of [
					-.4,
					0,
					.4
				]) {
					drum(M, .51, y, .17, .13, .27, 0);
					dome(M, .51, y, .17, .4, .14, 1);
					slit(M, .65, y, .025, .065, .26, .06, 0);
				}
				grille(M, -.22, -.12, .72, 4);
				box(M, -.61, .38, .07, .09, .3, .15, 2);
			}
		},
		{
			id: "factory",
			name: "팩토리",
			fit: {
				...fit$1(150, 4, 3),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .86, .73, 0, .17, 2);
				box(M, -.13, 0, .65, .58, .17, .58, 0);
				for (const x of [
					-.53,
					-.1,
					.33
				]) {
					M.loft(rect$1(x, 0, .19, .62), .75, rect$1(x, .09, .16, .4), 1.18, {
						...A$2(1),
						top: true
					});
					M.box(x, -.51, .12, .018, .73, 1.03, D);
					box(M, x, -.62, .16, .1, .17, .14, 1);
					slit(M, x, -.73, .1, .018, .24, .06, 0);
				}
				box(M, .68, .1, .16, .38, .17, .64, 2);
				slit(M, .845, .09, .018, .25, .55, .06, 0);
				for (const y of [-.11, .21]) drum(M, .63, y, .08, .81, .33, 1);
				grille(M, -.1, .12, 1.19, 4);
				box(M, -.55, .36, .09, .08, 1.16, .28, 2);
			}
		},
		{
			id: "starport",
			name: "스타포트",
			fit: {
				...fit$1(160, 3, 2),
				big: true
			},
			build(M) {
				legs(M);
				box(M, 0, 0, .58, .49, .3, .24, 0);
				drum(M, 0, .05, .75, .54, .12, 1);
				ring(M, 0, .05, .73, .66, .11, 2, 8);
				drum(M, 0, .05, .57, .65, .035, 2);
				for (const x of [-.4, .4]) {
					box(M, x, -.58, .1, .27, .3, .09, 1);
					slit(M, x, -.81, .07, .02, .39, .04, 0);
					strut(M, [
						x,
						.46,
						.57
					], [
						x,
						.62,
						1.03
					], .025, 2);
					slit(M, x, .62, .03, .03, 1.03, .05);
				}
				for (const x of [-.16, .16]) slit(M, x, .05, .025, .19, .69, .025);
				slit(M, 0, .05, .16, .025, .69, .025);
			}
		},
		{
			id: "engineeringBay",
			name: "엔지니어링 베이",
			fit: {
				...fit$1(100, 3.4, 2),
				big: true
			},
			build(M) {
				legs(M);
				bevel(M, 0, 0, .7, .63, .28, .32, 0);
				box(M, -.12, .07, .49, .42, .6, .28, 1);
				for (const x of [-.35, .11]) {
					drum(M, x, .07, .18, .88, .07, 2);
					ring(M, x, .07, .17, .95, .045, 1, 6);
				}
				for (const s of [-1, 1]) {
					drum(M, s * .62, -.1, .14, .36, .35, 2);
					dome(M, s * .62, -.1, .14, .71, .14, 0);
					slit(M, s * .62, -.25, .06, .02, .49, .07, 0);
				}
				M.box(0, -.6, .2, .025, .39, .62, D);
			}
		},
		{
			id: "bunker",
			name: "벙커",
			fit: {
				...fit$1(30, 2.6, 3),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .86, 0, .15, 2, .73);
				drum(M, 0, 0, .73, .15, .29, 0, .62);
				dome(M, 0, 0, .61, .44, .37, 1);
				for (let i = 0; i < 4; i++) {
					const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
					const px = x * .66, py = y * .66;
					M.box(px, py, .075, .075, .3, .39, D);
					bevel(M, x * .64, y * .64, x ? .22 : .29, x ? .29 : .22, .025, .12, 1);
					slit(M, x * .76, y * .76, .03, .03, .17, .04, 0);
				}
				grille(M, 0, 0, .79, 3);
				box(M, 0, .18, .08, .08, .74, .13, 2);
			}
		},
		{
			id: "missileTurret",
			name: "미사일 터렛",
			fit: {
				...fit$1(30, 2.6, 2),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .63, .61, 0, .15, 1);
				drum(M, 0, 0, .36, .15, .2, 2);
				box(M, 0, 0, .14, .16, .35, .51, 0);
				drum(M, 0, 0, .29, .86, .1, 1);
				for (const s of [-1, 1]) {
					box(M, s * .26, 0, .18, .36, .96, .26, 0);
					bevel(M, s * .26, 0, .2, .38, 1.22, .1, 1);
					for (const x of [-.07, .07]) for (const z of [1.02, 1.14]) M.box(s * .26 + x, -.37, .04, .02, z, z + .045, D);
					slit(M, s * .26, .34, .12, .02, 1.04, .04, 0);
				}
				strut(M, [
					0,
					.17,
					.89
				], [
					0,
					.4,
					1.42
				], .03, 2);
				box(M, 0, .41, .17, .025, 1.36, .16, 1);
			}
		},
		{
			id: "academy",
			name: "아카데미",
			fit: {
				...fit$1(70, 3.4, 2),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .77, .71, 0, .15, 2);
				drum(M, -.37, -.18, .27, .15, .43, 0);
				ring(M, -.37, -.18, .28, .58, .075, 1, 8);
				drum(M, -.37, -.18, .18, .57, .035, 2);
				drum(M, .34, .2, .31, .15, .65, 0);
				ring(M, .34, .2, .3, .8, .075, 1, 6);
				drum(M, .34, .2, .2, .79, .035, 2);
				M.loft(rect$1(.03, -.19, .27, .28), .28, rect$1(.07, -.05, .23, .17), .69, {
					...A$2(1),
					top: true
				});
				slit(M, .03, -.48, .2, .02, .4, .13);
				for (const x of [
					-.39,
					-.17,
					.05
				]) {
					drum(M, x, .38, .08, .15, .9, 2, .065, 6);
					dome(M, x, .38, .065, 1.05, .09, 1);
				}
				for (const x of [
					-.48,
					-.21,
					.06,
					.33
				]) bevel(M, x, -.56, .08, .16, .02, .21, 1);
				box(M, -.1, -.39, .29, .055, .19, .08, 0);
				box(M, .3, .18, .11, .12, .84, .05, 1);
			}
		},
		{
			id: "refinery",
			name: "리파이너리",
			fit: {
				...fit$1(30, 2.8, 2),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .77, .72, 0, .14, 0);
				drum(M, 0, 0, .35, .14, .65, 2);
				drum(M, 0, 0, .25, .79, .39, 2);
				ring(M, 0, 0, .28, 1.18, .065, 1, 8);
				for (const x of [-.48, .48]) for (const y of [-.4, .4]) {
					drum(M, x, y, .18, .1, .45, 1);
					dome(M, x, y, .18, .55, .19, 1);
					strut(M, [
						x,
						y,
						.65
					], [
						x * .4,
						y * .4,
						.91
					], .055, 1);
					slit(M, x, y - .18, .07, .02, .24, .06, 0);
				}
				box(M, 0, -.58, .23, .14, .12, .3, 0);
				grille(M, 0, -.58, .43, 3);
			}
		},
		{
			id: "armory",
			name: "무기고",
			fit: {
				...fit$1(70, 3.2, 2),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .76, .69, 0, .14, 2);
				drum(M, 0, 0, .4, .14, .25, 0);
				ring(M, 0, 0, .36, .39, .08, 1, 6);
				for (const s of [-1, 1]) {
					box(M, s * .48, 0, .24, .1, .17, .14, 1);
					bevel(M, s * .69, 0, .1, .2, .04, .21, 0);
					drum(M, s * .52, .37, .07, .13, .83, 2, .05, 6);
					slit(M, s * .52, .37, .025, .025, .97, .06, 0);
				}
				drum(M, 0, .43, .1, .12, .91, 0, .07, 6);
				box(M, 0, -.47, .23, .19, .13, .29, 0);
				grille(M, 0, -.47, .43, 4);
				slit(M, 0, -.67, .15, .02, .24, .06);
				for (const x of [-.24, .24]) box(M, x, -.29, .07, .1, .08, .14, 2);
			}
		},
		{
			id: "comsatStation",
			name: "컴샛 스테이션",
			fit: {
				...fit$1(30, 3, 2),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .71, .64, 0, .13, 2);
				box(M, 0, .1, .47, .38, .13, .24, 0);
				drum(M, 0, .12, .17, .37, .25, 1, .12, 6);
				drum(M, 0, .12, .2, .62, .16, 2, .54);
				ring(M, 0, .12, .54, .78, .09, 1, 8);
				drum(M, 0, .12, .44, .77, .035, 2);
				strut(M, [
					0,
					.12,
					.8
				], [
					0,
					.12,
					1.1
				], .025, 1);
				slit(M, 0, .12, .04, .04, 1.1, .06);
				box(M, -.48, -.27, .18, .21, .13, .31, 0);
				grille(M, -.48, -.27, .45, 3);
				for (const x of [
					-.26,
					.08,
					.4
				]) slit(M, x, -.3, .07, .02, .23, .06, 0);
			}
		},
		{
			id: "machineShop",
			name: "머신샵",
			fit: {
				...fit$1(30, 3.8, 3),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .81, .66, 0, .13, 2);
				drum(M, .16, -.12, .49, .13, .2, 0);
				ring(M, .16, -.12, .46, .33, .085, 1, 8);
				drum(M, .16, -.12, .31, .32, .03, 2);
				box(M, -.43, .19, .23, .34, .13, .27, 0);
				for (const x of [-.54, -.32]) {
					drum(M, x, .37, .075, .4, .39, 1, .06, 6);
					drum(M, x, .37, .09, .79, .055, 2, .09, 6);
				}
				for (const x of [
					-.35,
					0,
					.35
				]) bevel(M, x, -.5, .12, .12, .13, .1, 1);
				grille(M, -.43, .1, .41, 3);
				slit(M, .12, -.58, .18, .02, .22, .06, 0);
				box(M, .52, .27, .16, .16, .13, .21, 2);
			}
		},
		{
			id: "controlTower",
			name: "컨트롤 타워",
			fit: {
				...fit$1(30, 3, 2),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .7, .65, 0, .14, 2);
				drum(M, -.15, -.06, .39, .14, .48, 0);
				drum(M, -.15, -.06, .43, .62, .12, 1);
				for (const x of [
					-.4,
					-.15,
					.1
				]) slit(M, x, -.42, .065, .02, .48, .08);
				for (const y of [-.18, .15]) {
					strut(M, [
						.44,
						y,
						.14
					], [
						.44,
						y,
						1.22
					], .035, 2);
					slit(M, .44, y, .035, .035, 1.22, .07, 0);
				}
				for (const z of [
					.38,
					.64,
					.9,
					1.15
				]) box(M, .44, -.015, .065, .2, z, .04, 1);
				box(M, -.16, -.06, .19, .15, .74, .16, 2);
				grille(M, -.16, -.06, .91, 3);
				box(M, .39, -.43, .19, .12, .13, .14, 0);
				slit(M, .39, -.56, .11, .015, .2, .04, 0);
			}
		},
		{
			id: "scienceFacility",
			name: "사이언스 퍼실리티",
			fit: {
				...fit$1(130, 2.8, 2),
				big: true
			},
			build(M) {
				legs(M);
				drum(M, 0, 0, .58, .3, .36, 0, .49);
				drum(M, 0, 0, .45, .66, .27, 1);
				drum(M, 0, 0, .5, .93, .11, 1, .47);
				dome(M, 0, 0, .43, 1.04, .16, 1);
				M.box(0, 0, .025, .31, 1.19, 1.23, D);
				for (const x of [-.46, .46]) for (const y of [-.39, .39]) {
					drum(M, x, y, .14, .35, .33, 0);
					dome(M, x, y, .14, .68, .12, 1);
					slit(M, x, y - .14, .045, .02, .43, .1, 2);
				}
				box(M, 0, -.57, .22, .12, .29, .18, 2);
				grille(M, 0, -.57, .48, 3);
			}
		},
		{
			id: "nuclearSilo",
			name: "뉴클리어 사일로",
			fit: {
				...fit$1(50, 3, 1),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .77, .71, 0, .13, 2);
				drum(M, .17, .08, .47, .13, .4, 0);
				ring(M, .17, .08, .45, .53, .085, 2, 8);
				dome(M, .17, .08, .36, .54, .13, 1);
				M.box(.17, .08, .02, .31, .665, .7, D);
				for (const y of [-.37, .28]) {
					drum(M, -.44, y, .19, .13, .28, 0);
					dome(M, -.44, y, .19, .41, .12, 1);
				}
				drum(M, -.49, .3, .055, .54, .52, 2, .035, 6);
				slit(M, -.49, .3, .035, .035, 1.06, .06, 0);
				grille(M, 0, -.47, .27, 4);
				for (const x of [
					-.15,
					.15,
					.45
				]) slit(M, x, -.39, .05, .025, .22, .055, 0);
			}
		},
		{
			id: "physicsLab",
			name: "피직스 랩",
			fit: {
				...fit$1(45, 3.8, 1),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .78, .69, 0, .14, 2);
				box(M, -.12, 0, .48, .43, .14, .23, 0);
				M.loft(ngon(M, -.18, -.14, .38, 8), .37, ngon(M, -.18, .03, .33, 8), .85, {
					...A$2(1),
					top: true
				});
				ring(M, -.18, .03, .32, .85, .07, 2, 8);
				drum(M, -.18, .03, .21, .85, .035, 1);
				for (const x of [.27, .53]) {
					box(M, x, .12, .095, .44, .23, .21, 0);
					bevel(M, x, .12, .11, .46, .44, .16, 1);
					slit(M, x, -.34, .06, .02, .33, .05, 0);
				}
				box(M, -.18, -.52, .2, .13, .13, .13, 2);
				grille(M, -.18, -.52, .27, 3);
				slit(M, -.56, .1, .02, .09, .31, .08);
			}
		},
		{
			id: "covertOps",
			name: "코버트 옵스",
			fit: {
				...fit$1(45, 3.8, 1),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .79, .69, 0, .12, 2);
				box(M, 0, .05, .61, .43, .12, .25, 0);
				for (const x of [-.24, .24]) {
					M.loft(rect$1(x, .03, .19, .5), .37, rect$1(x, .16, .14, .31), .71, {
						...A$2(1),
						top: true
					});
					M.box(x, -.39, .11, .025, .25, .51, D);
					grille(M, x, .13, .72, 3);
				}
				drum(M, -.54, .37, .12, .24, .43, 2, .09, 6);
				drum(M, -.54, .37, .1, .67, .12, 1, .24, 6);
				ring(M, -.54, .37, .24, .79, .06, 2, 6);
				for (const x of [
					-.44,
					0,
					.44
				]) slit(M, x, -.48, .065, .02, .21, .05, 0);
				box(M, .57, .4, .11, .12, .13, .16, 0);
			}
		}
	],
	zerg: [
		{
			id: "hatchery",
			name: "해처리",
			fit: {
				...fit$1(180, 2.8, 4),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .76, .03, .62, 0);
				dome(M, 0, .29, .34, .5, .51, 2);
				maw(M, 0, -.63, .18, .27);
				for (const s of [-1, 1]) for (const x of [-.45, .45]) bone(M, [
					x,
					s * .44,
					.2
				], [
					x * .8,
					s * .38,
					.65
				], [
					x * .57,
					s * .23,
					.97
				], .11);
				dome(M, 0, .29, .19, 1.01, .15, 0);
				slit(M, 0, -.67, .14, .018, .24, .1, 1);
			}
		},
		{
			id: "lair",
			name: "레어",
			fit: {
				...fit$1(220, 2.6, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .76, .04, .64, 0);
				drum(M, 0, .2, .29, .52, .42, 2, .24);
				dome(M, 0, .2, .3, .94, .25, 0);
				maw(M, 0, -.64, .19, .28);
				for (const s of [-1, 1]) for (const x of [-.43, .43]) bone(M, [
					x,
					s * .47,
					.25
				], [
					x * 1.28,
					s * .57,
					1.11
				], [
					x * 1.1,
					s * .47,
					1.68
				], .13);
				for (const s of [-1, 1]) dome(M, s * .47, -.32, .18, .27, .2, 2);
			}
		},
		{
			id: "spawningPool",
			name: "스포닝 풀",
			fit: {
				...fit$1(50, 3.8, 3),
				big: true
			},
			build(M) {
				tendrils(M, 5);
				drum(M, -.13, -.02, .67, .02, .12, 2);
				drum(M, .46, .22, .3, .02, .14, 0);
				M.frustum(-.13, -.02, .56, .56, .14, .17, {
					n: 8,
					...G(0)
				});
				M.frustum(.46, .22, .22, .22, .16, .18, {
					n: 8,
					...G(2)
				});
				ring(M, -.13, -.02, .65, .16, .09, 2, 8);
				for (const s of [-1, 1]) bone(M, [
					s * .52,
					-.3,
					.14
				], [
					s * .64,
					-.24,
					.31
				], [
					s * .65,
					-.1,
					.43
				], .06);
				for (const x of [
					-.29,
					.08,
					.34
				]) dome(M, x, -.12, .065, .18, .065, 0, true);
			}
		},
		{
			id: "evolutionChamber",
			name: "에볼루션 챔버",
			fit: {
				...fit$1(40, 4, 3),
				big: true
			},
			build(M) {
				tendrils(M, 5);
				dome(M, -.16, .02, .48, .04, .61, 2);
				dome(M, .43, -.27, .27, .04, .44, 0);
				for (const s of [-1, 1]) {
					bone(M, [
						-.23,
						s * .25,
						.36
					], [
						-.39,
						s * .4,
						.91
					], [
						-.28,
						s * .47,
						1.26
					], .13, 2);
					bone(M, [
						.06,
						s * .22,
						.36
					], [
						.18,
						s * .32,
						.77
					], [
						.3,
						s * .36,
						1.06
					], .1, 2);
				}
				for (const x of [
					.26,
					.43,
					.6
				]) dome(M, x, -.3, .09, .37, .12, 0);
				maw(M, -.13, -.38, .13, .17);
			}
		},
		{
			id: "hydraliskDen",
			name: "히드라리스크 덴",
			fit: {
				...fit$1(60, 4, 3),
				big: true
			},
			build(M) {
				tendrils(M, 5);
				for (const s of [-1, 1]) {
					dome(M, s * .31, .06, .39, .08, .69, 0);
					for (let i = 0; i < 3; i++) bone(M, [
						s * .52,
						-.31 + i * .28,
						.35
					], [
						s * .58,
						-.24 + i * .28,
						.85
					], [
						s * .42,
						-.18 + i * .28,
						1.22 - i * .08
					], .085);
				}
				maw(M, 0, -.38, .17, .22);
				dome(M, 0, .4, .27, .24, .45, 2);
				dome(M, .26, -.5, .18, .05, .21, 0);
				slit(M, 0, -.42, .1, .018, .25, .07, 1);
			}
		},
		{
			id: "creepColony",
			name: "크립 콜로니",
			fit: {
				...fit$1(30, 3, 5),
				small: true
			},
			build(M) {
				tendrils(M, 6);
				dome(M, 0, 0, .52, .03, .47, 2);
				dome(M, 0, 0, .31, .46, .46, 0);
				for (let i = 0; i < 4; i++) {
					const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
					bone(M, [
						x * .4,
						y * .4,
						.2
					], [
						x * .59,
						y * .59,
						.49
					], [
						x * .66,
						y * .66,
						.64
					], .065);
				}
				for (const s of [-1, 1]) dome(M, s * .16, -.23, .095, .53, .14, 0);
			}
		},
		{
			id: "sunkenColony",
			name: "성큰 콜로니",
			fit: {
				...fit$1(30, 3, 3),
				small: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .55, .03, .4, 2);
				drum(M, 0, 0, .2, .4, .41, 0, .14, 6);
				bone(M, [
					0,
					0,
					.81
				], [
					.12,
					-.02,
					1.08
				], [
					.06,
					-.16,
					1.32
				], .14, 2);
				for (const s of [-1, 1]) for (const y of [-.32, .32]) bone(M, [
					s * .37,
					y,
					.14
				], [
					s * .56,
					y,
					.35
				], [
					s * .66,
					y - .06,
					.58
				], .09);
				for (const s of [-1, 1]) dome(M, s * .25, -.36, .09, .27, .12, 0);
			}
		},
		{
			id: "sporeColony",
			name: "스포어 콜로니",
			fit: {
				...fit$1(30, 3, 3),
				small: true
			},
			build(M) {
				tendrils(M);
				drum(M, 0, 0, .39, .05, .48, 2, .23);
				drum(M, 0, 0, .23, .53, .45, 0, .34);
				ring(M, 0, 0, .36, .98, .11, 2, 8);
				M.frustum(0, 0, .23, .23, .97, 1, {
					n: 8,
					...G(0)
				});
				for (const s of [-1, 1]) bone(M, [
					s * .3,
					0,
					.62
				], [
					s * .46,
					.02,
					.93
				], [
					s * .4,
					-.04,
					1.22
				], .08);
				dome(M, 0, .27, .16, .75, .24, 0);
			}
		},
		{
			id: "extractor",
			name: "익스트랙터",
			fit: {
				...fit$1(30, 2.8, 2),
				small: true
			},
			build(M) {
				tendrils(M, 5);
				dome(M, 0, .04, .56, .04, .54, 2);
				for (const s of [-1, 1]) {
					drum(M, s * .48, .07, .24, .05, .52, 2, .19);
					dome(M, s * .48, .07, .2, .57, .29, 0, true);
					bone(M, [
						s * .63,
						.08,
						.36
					], [
						s * .63,
						.13,
						1.1
					], [
						s * .42,
						.12,
						1.5
					], .13);
					bone(M, [
						s * .3,
						.34,
						.38
					], [
						s * .35,
						.4,
						1.07
					], [
						s * .16,
						.32,
						1.57
					], .1);
				}
				dome(M, 0, -.35, .24, .19, .51, 0);
				for (let i = 0; i < 4; i++) box(M, 0, -.57, .14, .025, .24 + i * .09, .035, 1);
			}
		},
		{
			id: "spire",
			name: "스파이어",
			fit: {
				...fit$1(40, 2.8, 2),
				big: true
			},
			build(M) {
				tendrils(M, 5);
				for (let i = 0; i < 6; i++) {
					const a = i * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
					strut(M, [
						x * .49,
						y * .49,
						.12
					], [
						x * .19,
						y * .19,
						1.24
					], .04, 2);
					box(M, x * .19, y * .19, .035, .035, 1.24, .12, 0);
				}
				drum(M, 0, 0, .24, 1.2, .18, 2, .54);
				dome(M, 0, 0, .54, 1.38, .32, 0);
				ring(M, 0, 0, .49, 1.39, .075, 2, 6);
				dome(M, 0, 0, .15, 1.69, .1, 2);
			}
		},
		{
			id: "hive",
			name: "하이브",
			fit: {
				...fit$1(230, 2.6, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .77, .04, .65, 0);
				drum(M, 0, .17, .33, .57, .42, 2, .27);
				dome(M, 0, .17, .32, .99, .29, 0);
				for (let i = 0; i < 6; i++) {
					const a = i * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
					bone(M, [
						x * .51,
						y * .51,
						.24
					], [
						x * .64,
						y * .64,
						1.28
					], [
						x * .54,
						y * .54,
						1.94
					], .12);
				}
				maw(M, 0, -.64, .2, .29);
				dome(M, 0, -.19, .25, .54, .21, 2);
				slit(M, 0, -.68, .11, .02, .29, .09, 1);
			}
		},
		{
			id: "queensNest",
			name: "퀸즈 네스트",
			fit: {
				...fit$1(90, 3, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .53, .1, .77, 0);
				dome(M, 0, .02, .32, .79, .29, 2);
				ring(M, 0, .02, .21, 1.04, .07, 2, 6);
				for (let i = 0; i < 6; i++) {
					const a = i * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
					bone(M, [
						x * .36,
						y * .36,
						.24
					], [
						x * .54,
						y * .54,
						.58
					], [
						x * .55,
						y * .55,
						.88
					], .07, 2);
				}
				maw(M, 0, -.45, .2, .19);
				for (const s of [-1, 1]) slit(M, s * .19, -.41, .035, .02, .56, .09, 1);
			}
		},
		{
			id: "ultraliskCavern",
			name: "울트라리스크 캐번",
			fit: {
				...fit$1(140, 3.5, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, .2, .64, .05, .83, 2);
				dome(M, 0, .35, .4, .73, .31, 0);
				for (const s of [-1, 1]) {
					dome(M, s * .42, -.15, .27, .08, .56, 0);
					bone(M, [
						s * .38,
						-.44,
						.13
					], [
						s * .4,
						-.49,
						.64
					], [
						s * .22,
						-.49,
						.86
					], .12);
				}
				M.box(0, -.48, .27, .035, .13, .66, D);
				for (let i = 0; i < 4; i++) {
					const y = -.02 + i * .14;
					strut(M, [
						-.48,
						y,
						.28
					], [
						-.17,
						y,
						.83
					], .035, 1);
					strut(M, [
						.48,
						y,
						.28
					], [
						.17,
						y,
						.83
					], .035, 1);
				}
				dome(M, 0, .35, .12, 1.02, .1, 0);
			}
		},
		{
			id: "defilerMound",
			name: "디파일러 마운드",
			fit: {
				...fit$1(65, 4, 2),
				big: true
			},
			build(M) {
				tendrils(M, 4);
				for (const x of [
					-.42,
					0,
					.42
				]) dome(M, x, 0, .28, .03, .39, 2);
				for (let i = 0; i < 5; i++) bone(M, [
					-.45 + i * .21,
					.04,
					.33
				], [
					-.43 + i * .21,
					.1,
					.66
				], [
					-.49 + i * .21,
					.08,
					.87
				], .07, 2);
				for (const s of [-1, 1]) {
					ring(M, s * .39, s * .38, .2, .17, .065, 0, 6);
					maw(M, s * .57, -.16, .12, .12);
				}
			}
		},
		{
			id: "nydusCanal",
			name: "나이더스 커널",
			fit: {
				...fit$1(30, 2.8, 2),
				small: true
			},
			build(M) {
				tendrils(M);
				drum(M, 0, 0, .37, .05, .38, 2, .25);
				drum(M, 0, 0, .25, .43, .36, 0, .34);
				ring(M, 0, 0, .36, .79, .11, 0, 8);
				M.frustum(0, 0, .22, .22, .78, .8, {
					n: 8,
					look: "roof"
				});
				for (const s of [-1, 1]) bone(M, [
					s * .28,
					0,
					.63
				], [
					s * .4,
					.02,
					1.04
				], [
					s * .28,
					.12,
					1.19
				], .08);
				dome(M, 0, .31, .18, .47, .28, 0);
				slit(M, 0, -.31, .07, .02, .46, .09, 1);
			}
		},
		{
			id: "greaterSpire",
			name: "그레이터 스파이어",
			fit: {
				...fit$1(110, 2.8, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				for (let i = 0; i < 4; i++) {
					const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
					strut(M, [
						x * .48,
						y * .48,
						.12
					], [
						x * .17,
						y * .17,
						.91
					], .07, 2);
					dome(M, x * .31, y * .31, .19, .87, .52, 0);
					bone(M, [
						x * .39,
						y * .39,
						1.12
					], [
						x * .43,
						y * .43,
						1.55
					], [
						x * .27,
						y * .27,
						1.76
					], .07, 2);
				}
				drum(M, 0, 0, .23, .84, .59, 2, .34);
				ring(M, 0, 0, .35, 1.43, .08, 0, 8);
				dome(M, 0, 0, .18, 1.45, .18, 2);
			}
		}
	],
	protoss: [
		{
			id: "nexus",
			name: "넥서스",
			fit: {
				...fit$1(200, 2.2, 4),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .82, .82, 0, .14, 2);
				M.loft(rect$1(0, 0, .7, .7), .14, rect$1(0, 0, .18, .18), .95, {
					...A$2(0),
					top: true
				});
				for (const x of [-.63, .63]) for (const y of [-.63, .63]) {
					bevel(M, x, y, .13, .13, .08, .15, 1);
					bone(M, [
						x,
						y,
						.23
					], [
						x * .93,
						y * .93,
						.83
					], [
						x * .91,
						y * .91,
						1.19
					], .065, 1);
				}
				for (let i = 0; i < 5; i++) {
					const t = (i - 2) * .135;
					strut(M, [
						t,
						-.67,
						.18
					], [
						t * .3,
						-.23,
						.87
					], .018, 1);
					strut(M, [
						.67,
						t,
						.18
					], [
						.23,
						t * .3,
						.87
					], .018, 1);
				}
				sphere(M, 0, 0, .13, .95, .25, 0);
				for (const s of [-1, 1]) bevel(M, 0, s * .74, .21, .16, .05, .15, 1);
			}
		},
		{
			id: "gateway",
			name: "게이트웨이",
			fit: {
				...fit$1(70, 3.8, 3),
				big: true
			},
			build(M) {
				for (const s of [-1, 1]) {
					bevel(M, s * .4, 0, .26, .67, 0, .17, 2);
					M.loft(rect$1(s * .43, 0, .19, .35), .17, rect$1(s * .2, .06, .14, .23), 1.16, {
						...A$2(0),
						top: true
					});
					M.loft(rect$1(s * .2, .06, .14, .23), 1.16, rect$1(s * .06, .1, .055, .11), 1.55, {
						...A$2(1),
						top: true
					});
					bevel(M, s * .58, .5, .21, .27, .1, .14, 1);
					strut(M, [
						s * .52,
						-.4,
						.2
					], [
						s * .21,
						-.19,
						1.12
					], .035, 2);
					slit(M, s * .49, -.36, .035, .035, .28, .12, 0);
				}
				M.box(0, .08, .035, .06, .21, 1.23, D);
				crystal(M, 0, -.15, .12, .88, .52, 0);
				for (const s of [-1, 1]) {
					box(M, s * .09, -.28, .035, .17, .12, .11, 1);
					slit(M, s * .09, -.28, .02, .12, .235, .035, 1);
				}
				bevel(M, 0, .65, .27, .19, .03, .18, 0);
				strut(M, [
					0,
					.65,
					.2
				], [
					0,
					.25,
					.44
				], .04, 1);
			}
		},
		{
			id: "pylon",
			name: "파일런",
			fit: {
				...fit$1(30, 2.8, 5),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .43, 0, .11, 2, .35, 6);
				crystal(M, 0, 0, .38, .35, 1.62, 0);
				for (let i = 0; i < 3; i++) {
					const a = i * Math.PI * 2 / 3, x = Math.cos(a), y = Math.sin(a);
					bevel(M, x * .4, y * .4, .11, .11, .02, .13, 1);
					bone(M, [
						x * .43,
						y * .43,
						.12
					], [
						x * .46,
						y * .46,
						.72
					], [
						x * .29,
						y * .29,
						1.01
					], .085, 0);
					slit(M, x * .41, y * .41, .035, .035, .29, .09, 1);
					strut(M, [
						x * .27,
						y * .27,
						.13
					], [
						x * .36,
						y * .36,
						.3
					], .035, 2);
				}
				ring(M, 0, 0, .32, .16, .065, 1, 6);
			}
		},
		{
			id: "forge",
			name: "포지",
			fit: {
				...fit$1(50, 3.8, 3),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .79, .68, 0, .15, 2);
				drum(M, .25, .26, .33, .15, .34, 0, .29);
				dome(M, .25, .26, .3, .49, .38, 1);
				sphere(M, .25, .26, .1, .85, .12, 0);
				dome(M, .34, -.42, .24, .12, .3, 1);
				sphere(M, .34, -.42, .1, .41, .1, 0);
				bevel(M, -.4, -.14, .3, .29, .1, .36, 0);
				drum(M, -.6, -.23, .15, .25, .26, 2, .12, 6);
				for (const x of [-.3, -.08]) {
					drum(M, x, .18, .07, .2, .65, 1, .055, 6);
					bone(M, [
						x,
						.18,
						.85
					], [
						x,
						.18,
						1.02
					], [
						x - .025,
						.18,
						1.16
					], .055, 1);
				}
				for (let i = 0; i < 4; i++) strut(M, [
					-.32 + i * .14,
					-.4,
					.15
				], [
					-.23 + i * .14,
					-.1,
					.57
				], .022, 1);
				box(M, .12, 0, .19, .07, .2, .09, 2);
			}
		},
		{
			id: "cyberneticsCore",
			name: "사이버네틱스 코어",
			fit: {
				...fit$1(70, 2.6, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .62, .03, .21, 2, .54);
				drum(M, 0, .12, .38, .24, .45, 0, .34);
				ring(M, 0, .12, .4, .69, .08, 1, 8);
				M.frustum(0, .12, .29, .29, .69, .73, {
					n: 8,
					...G(1)
				});
				for (let i = 0; i < 4; i++) {
					const a = Math.PI + (i + 1) * Math.PI / 5, x = Math.cos(a) * .54, y = Math.sin(a) * .54;
					drum(M, x, y, .15, .1, .21, 1, .11, 6);
					sphere(M, x, y, .14, .31, .27, 0);
				}
				for (const x of [
					-.3,
					0,
					.3
				]) bone(M, [
					x,
					.48,
					.22
				], [
					x,
					.53,
					.67
				], [
					x,
					.43,
					.99
				], .075, 1);
			}
		},
		{
			id: "photonCannon",
			name: "포톤 캐논",
			fit: {
				...fit$1(30, 2.8, 3),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .53, .02, .14, 2, .46);
				ring(M, 0, 0, .47, .16, .08, 1, 8);
				drum(M, 0, 0, .24, .17, .21, 0, .19, 6);
				sphere(M, 0, 0, .13, .38, .2, 0);
				for (const s of [-1, 1]) bone(M, [
					s * .14,
					0,
					.3
				], [
					s * .12,
					0,
					.65
				], [
					s * .075,
					0,
					.82
				], .045, 1);
				for (let i = 0; i < 4; i++) {
					const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
					bevel(M, x * .55, y * .55, .12, .12, .02, .12, 0);
					slit(M, x * .55, y * .55, .065, .065, .145, .035, 1);
				}
			}
		},
		{
			id: "stargate",
			name: "스타게이트",
			fit: {
				...fit$1(130, 4, 2),
				big: true
			},
			build(M) {
				for (const s of [-1, 1]) {
					const low = [
						[-.8, s * .22],
						[.48, s * .2],
						[.83, s * .52],
						[.48, s * .76],
						[-.54, s * .63]
					];
					const p = s > 0 ? low : [...low].reverse();
					const high = p.map(([x, y]) => [x * .84, y * .9]);
					M.loft(p, .11, high, .39, {
						...A$2(0),
						top: true
					});
					for (let i = 0; i < 4; i++) slit(M, -.55 + i * .2, s * .38, .065, .075, .395, .035, 1);
					M.loft(rect$1(.38, s * .53, .25, .15), .39, rect$1(.22, s * .49, .12, .1), 1.02, {
						...A$2(1),
						top: true
					});
					for (let i = 0; i < 3; i++) strut(M, [
						.29 + i * .1,
						s * .67,
						.43
					], [
						.16 + i * .05,
						s * .58,
						.83
					], .025, 2);
					bone(M, [
						-.62,
						s * .36,
						.25
					], [
						-.78,
						s * .44,
						.52
					], [
						-.6,
						s * .46,
						.69
					], .06, 1);
				}
				box(M, .54, 0, .12, .24, .08, .18, 2);
				sphere(M, .54, 0, .1, .26, .16, 0);
			}
		},
		{
			id: "assimilator",
			name: "어시밀레이터",
			fit: {
				...fit$1(30, 2.8, 2),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .63, .02, .19, 2, .55);
				dome(M, 0, .02, .53, .21, .7, 0);
				sphere(M, 0, -.3, .32, .21, .47, 0);
				for (const x of [-.34, .34]) {
					drum(M, x, .36, .12, .05, .75, 1, .1, 6);
					drum(M, x, .36, .13, .8, .13, 2, .11, 6);
				}
				drum(M, .46, -.3, .13, .08, .59, 1, .1, 6);
				drum(M, .46, -.3, .14, .67, .12, 2, .12, 6);
				for (let i = 0; i < 5; i++) {
					const y = -.2 + i * .15;
					strut(M, [
						-.41,
						y,
						.24
					], [
						-.18,
						y,
						.82
					], .028, 1);
					strut(M, [
						.41,
						y,
						.24
					], [
						.18,
						y,
						.82
					], .028, 1);
				}
				slit(M, 0, -.59, .12, .02, .28, .06, 1);
			}
		},
		{
			id: "citadelOfAdun",
			name: "시타델 오브 아둔",
			fit: {
				...fit$1(100, 3.8, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .49, .03, .18, 2, .37);
				dome(M, 0, 0, .39, .21, .69, 0);
				sphere(M, 0, -.19, .18, .58, .28, 0);
				for (const s of [-1, 1]) {
					box(M, s * .4, .1, .24, .055, .32, .09, 1);
					const p = rect$1(s * .69, .1, .12, .32);
					M.loft(p, .2, rect$1(s * .64, .12, .075, .21), 1.08, {
						...A$2(1),
						top: true
					});
					slit(M, s * .69, -.225, .06, .02, .37, .23, 1);
					for (let i = 0; i < 3; i++) box(M, s * .69, -.16 + i * .14, .125, .022, .51 + i * .1, .03, 2);
					bone(M, [
						s * .2,
						.06,
						.52
					], [
						s * .2,
						.1,
						.96
					], [
						s * .12,
						.08,
						1.15
					], .065, 1);
				}
				bevel(M, 0, -.47, .24, .15, .05, .18, 1);
				slit(M, 0, -.47, .14, .08, .235, .035, 0);
			}
		},
		{
			id: "templarArchives",
			name: "템플러 아카이브",
			fit: {
				...fit$1(80, 3.5, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .69, .02, .15, 2, .6);
				dome(M, .12, 0, .49, .17, .57, 0);
				sphere(M, .12, 0, .27, .66, .2, 0);
				for (const s of [-1, 1]) bone(M, [
					-.44,
					s * .33,
					.16
				], [
					-.48,
					s * .34,
					.9
				], [
					-.39,
					s * .3,
					1.21
				], .1, 1);
				for (let i = 0; i < 6; i++) {
					const a = Math.PI * .12 + i * Math.PI * .15, x = Math.cos(a), y = Math.sin(a);
					strut(M, [
						x * .61,
						y * .61,
						.13
					], [
						x * .4 + .07,
						y * .38,
						.55
					], .022, 1);
				}
				bevel(M, .62, -.33, .18, .18, .06, .14, 1);
				sphere(M, .62, -.33, .11, .2, .11, 0);
				box(M, -.27, -.2, .13, .17, .17, .22, 2);
				for (const x of [
					-.15,
					.05,
					.25
				]) strut(M, [
					x,
					-.45,
					.14
				], [
					x,
					-.2,
					.54
				], .02, 1);
			}
		},
		{
			id: "roboticsFacility",
			name: "로보틱스 퍼실리티",
			fit: {
				...fit$1(110, 3.8, 3),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .79, .69, 0, .14, 2);
				M.loft(rect$1(0, .21, .5, .39), .14, rect$1(0, .31, .11, .14), 1.28, {
					...A$2(0),
					top: true
				});
				M.box(0, -.31, .54, .035, .14, .58, D);
				for (let i = 0; i < 7; i++) strut(M, [
					-.48 + i * .16,
					-.35,
					.16
				], [
					-.28 + i * .09,
					-.32,
					.62
				], .018, 1);
				for (const z of [
					.24,
					.37,
					.5
				]) box(M, 0, -.36, .5, .015, z, .025, 1);
				for (const s of [-1, 1]) {
					bevel(M, s * .59, -.14, .15, .34, .08, .23, 1);
					slit(M, s * .59, -.14, .07, .18, .315, .035, 0);
					bone(M, [
						s * .31,
						.33,
						.38
					], [
						s * .24,
						.35,
						1.05
					], [
						s * .09,
						.33,
						1.4
					], .07, 1);
				}
				crystal(M, 0, .13, .12, .84, .43, 0);
			}
		},
		{
			id: "observatory",
			name: "옵저버토리",
			fit: {
				...fit$1(45, 3, 2),
				small: true
			},
			build(M) {
				const p = [
					[-.66, -.48],
					[.66, -.48],
					[0, .66]
				];
				M.loft(p, .02, p, .13, {
					...A$2(2),
					top: true
				});
				const posts = [
					[
						-.55,
						-.38,
						.65
					],
					[
						.55,
						-.38,
						.81
					],
					[
						0,
						.54,
						1.08
					]
				];
				for (const [x, y, h] of posts) {
					drum(M, x, y, .12, .13, h - .13, 1, .08, 6);
					sphere(M, x, y, .1, h, .22, 0);
					for (const z of [.24, .39]) drum(M, x, y, .13, z, .04, 2, .13, 6);
				}
				for (let i = 0; i < 3; i++) {
					const a = posts[i], b = posts[(i + 1) % 3];
					strut(M, [
						a[0],
						a[1],
						.25
					], [
						b[0],
						b[1],
						.43
					], .025, 1);
				}
				sphere(M, 0, 0, .16, .14, .2, 1);
				box(M, 0, -.41, .2, .08, .13, .13, 0);
			}
		},
		{
			id: "roboticsSupportBay",
			name: "로보틱스 서포트 베이",
			fit: {
				...fit$1(100, 3.2, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .69, .03, .13, 2, .62);
				ring(M, 0, 0, .59, .16, .1, 1, 8);
				M.frustum(0, 0, .38, .38, .16, .2, {
					n: 8,
					...G(1)
				});
				for (let i = 0; i < 3; i++) {
					const a = Math.PI / 2 + i * Math.PI * 2 / 3, x = Math.cos(a), y = Math.sin(a);
					M.loft(ngon(M, x * .21, y * .21, .15, 6), .17, ngon(M, x * .51, y * .51, .105, 6), 1.03, {
						...A$2(1),
						top: true
					});
					sphere(M, x * .51, y * .51, .09, 1.03, .16, 0);
					bone(M, [
						x * .13,
						y * .13,
						.18
					], [
						x * .3,
						y * .3,
						.66
					], [
						x * .39,
						y * .39,
						.99
					], .045, 0);
					slit(M, x * .56, y * .56, .04, .04, .2, .05, 0);
				}
				crystal(M, 0, 0, .11, .21, .24, 0);
			}
		},
		{
			id: "fleetBeacon",
			name: "플릿 비콘",
			fit: {
				...fit$1(140, 3, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .49, .04, .23, 2, .36);
				sphere(M, 0, 0, .32, .43, .67, 0);
				for (let i = 0; i < 3; i++) {
					const a = -Math.PI / 2 + i * Math.PI * 2 / 3, x = Math.cos(a), y = Math.sin(a);
					M.loft(ngon(M, x * .24, y * .24, .18, 6), .13, ngon(M, x * .58, y * .58, .12, 6), .4, {
						...A$2(0),
						top: true
					});
					drum(M, x * .6, y * .6, .16, .33, .15, 1, .14, 6);
					sphere(M, x * .6, y * .6, .11, .48, .14, 1);
					bone(M, [
						x * .25,
						y * .25,
						.32
					], [
						x * .34,
						y * .34,
						.62
					], [
						x * .23,
						y * .23,
						.89
					], .06, 1);
				}
				ring(M, 0, 0, .4, .42, .06, 1, 6);
			}
		},
		{
			id: "arbiterTribunal",
			name: "아비터 트리뷰널",
			fit: {
				...fit$1(110, 3.2, 2),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .64, .59, .02, .16, 2);
				for (const x of [-.5, .5]) for (const y of [-.45, .45]) {
					bevel(M, x, y, .2, .18, .02, .18, 0);
					slit(M, x, y, .08, .065, .205, .045, 1);
				}
				drum(M, 0, 0, .32, .18, .23, 1, .28);
				sphere(M, 0, 0, .24, .41, .25, 0);
				for (const x of [
					-.4,
					0,
					.4
				]) {
					drum(M, x, .42, .09, .18, .64, 0, .065, 6);
					sphere(M, x, .42, .08, .82, .23, 1);
					strut(M, [
						x,
						.42,
						.25
					], [
						x * .47,
						.12,
						.53
					], .04, 1);
				}
				for (const s of [-1, 1]) bone(M, [
					s * .36,
					-.18,
					.19
				], [
					s * .36,
					-.28,
					.48
				], [
					s * .2,
					-.35,
					.67
				], .055, 1);
			}
		},
		{
			id: "shieldBattery",
			name: "실드 배터리",
			fit: {
				...fit$1(30, 2.8, 4),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .32, .02, .13, 2, .23);
				sphere(M, 0, 0, .14, .15, .24, 0);
				for (let i = 0; i < 6; i++) {
					const a = i * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
					strut(M, [
						x * .2,
						y * .2,
						.12
					], [
						x * .53,
						y * .53,
						.26
					], .025, 0);
					bone(M, [
						x * .53,
						y * .53,
						.26
					], [
						x * .58,
						y * .58,
						.41
					], [
						x * .48,
						y * .48,
						.52
					], .035, 1);
					slit(M, x * .51, y * .51, .025, .025, .31, .065, 1);
				}
				crystal(M, 0, 0, .075, .39, .2, 0);
			}
		}
	]
};
// web/modes/starcraft/race_buildings.mjs
const NO_AO$1 = 8;
const LOOK = {
	wall: KIND.WALL,
	roof: KIND.ROOF,
	accent: KIND.PITCHED,
	glow: KIND.SIGN,
	metal: KIND.EQUIP,
	trim: KIND.AWNING
};
const RACE_LIMITS = {
	minAreaM2: 30,
	minHalfM: 2.5,
	baseM: .08,
	cellM: 16,
	cellMPhone: 26,
	smallHalfM: 7,
	bigHalfM: 11,
	emptyCell: .12,
	tinyHalfM: 6
};
const TINY = {
	terran: [{
		id: "tinyDepot",
		build(M) {
			M.box(0, 0, .9, .85, 0, .55, {
				look: "accent",
				slot: 0
			});
			M.box(.15, 0, .55, .5, .55, .8, {
				look: "accent",
				slot: 1
			});
		}
	}, {
		id: "tinyBunker",
		build(M) {
			M.frustum(0, 0, .95, .6, 0, .6, {
				n: 6,
				sx: M.aspect,
				look: "accent",
				slot: 0
			});
			M.box(0, 0, .25, .25, .6, .85, {
				look: "accent",
				slot: 2
			});
		}
	}],
	zerg: [{
		id: "tinyMound",
		build(M) {
			M.frustum(0, 0, .95, .45, 0, .7, {
				n: 6,
				sx: M.aspect,
				look: "accent",
				slot: 0
			});
			M.frustum(0, 0, .45, 0, .7, 1.1, {
				n: 4,
				look: "accent",
				slot: 1
			});
		}
	}, {
		id: "tinyColony",
		build(M) {
			M.frustum(0, 0, .9, .7, 0, .35, {
				n: 6,
				sx: M.aspect,
				look: "accent",
				slot: 2
			});
			M.frustum(0, 0, .55, 0, .35, .9, {
				n: 5,
				look: "accent",
				slot: 0
			});
		}
	}],
	protoss: [{
		id: "tinyPylon",
		build(M) {
			M.box(0, 0, .8, .7, 0, .3, {
				look: "accent",
				slot: 0
			});
			M.frustum(0, 0, .35, 0, .3, 1.3, {
				n: 4,
				rot: Math.PI / 4,
				look: "glow",
				slot: 0
			});
		}
	}, {
		id: "tinyShrine",
		build(M) {
			M.frustum(0, 0, .9, .6, 0, .45, {
				n: 6,
				sx: M.aspect,
				look: "accent",
				slot: 0
			});
			M.frustum(0, 0, .3, 0, .45, 1, {
				n: 4,
				look: "glow",
				slot: 1
			});
		}
	}]
};
function fitRect(outer, holes) {
	const obb = orientedBox(outer);
	if (!obb) return null;
	const { ux, uy } = obb, vx = -uy, vy = ux;
	const inside = (cx, cy, hx, hy) => {
		for (let i = 0; i <= 4; i++) for (const [a, b] of [
			[-1 + i / 2, -1],
			[-1 + i / 2, 1],
			[-1, -1 + i / 2],
			[1, -1 + i / 2]
		]) if (!pointInPolygon(cx + ux * hx * a + vx * hy * b, cy + uy * hx * a + vy * hy * b, outer, holes)) return false;
		return true;
	};
	const grow = (cx, cy, fx, fy) => {
		let lo = 0, hi = .98;
		if (!inside(cx, cy, obb.hw * fx * .05, obb.hh * fy * .05)) return 0;
		lo = .05;
		for (let i = 0; i < 7; i++) {
			const k = (lo + hi) / 2;
			if (inside(cx, cy, obb.hw * fx * k, obb.hh * fy * k)) lo = k;
			else hi = k;
		}
		return lo;
	};
	let best = null;
	const take = (cx, cy, fx, fy) => {
		const k = grow(cx, cy, fx, fy);
		if (k <= 0) return;
		const hx = obb.hw * fx * k, hy = obb.hh * fy * k, a = hx * hy;
		if (!best || a > best.a) best = {
			cx,
			cy,
			hx,
			hy,
			a
		};
	};
	take(obb.cx, obb.cy, 1, 1);
	if (!best || best.hx < obb.hw * .8) {
		const dp = deepestPoint(outer, holes), C = [[dp.x, dp.y]];
		for (const a of [
			-.5,
			0,
			.5
		]) for (const b of [
			-.5,
			0,
			.5
		]) C.push([obb.cx + ux * obb.hw * a + vx * obb.hh * b, obb.cy + uy * obb.hw * a + vy * obb.hh * b]);
		for (const [cx, cy] of C) {
			if (!pointInPolygon(cx, cy, outer, holes)) continue;
			for (const [fx, fy] of [
				[1, 1],
				[1, .6],
				[1, .35],
				[.6, 1],
				[.35, 1]
			]) take(cx, cy, fx, fy);
		}
	}
	if (!best) return null;
	return best.hx >= best.hy ? {
		...best,
		ux,
		uy
	} : {
		cx: best.cx,
		cy: best.cy,
		hx: best.hy,
		hy: best.hx,
		a: best.a,
		ux: vx,
		uy: vy
	};
}
function modelBuilder(tb, ctx, unit, rect) {
	const mpu = tb.mPerUnit, W = tb.W, ch = ctx.chunk, u = tb.unit, keepM = W.m.slice(), keepB3 = W.b[3];
	const HX = rect.hx * mpu, HY = rect.hy * mpu, s = HY, z0 = ctx.minH + RACE_LIMITS.baseM;
	const toTile = (x, y) => {
		const mx = x * HX, my = y * HY;
		return [rect.cx + (rect.ux * mx - rect.uy * my) / mpu, rect.cy + (rect.uy * mx + rect.ux * my) / mpu];
	};
	const clamp = (v) => Math.max(-1, Math.min(1, v));
	const set = (look, slot, zb) => {
		const kind = LOOK[look] ?? KIND.PITCHED;
		W.kind = kind;
		W.w = [
			0,
			0,
			0,
			0
		];
		W.b[3] = keepB3 | NO_AO$1;
		W.m[0] = look === "wall" ? ctx.mat : look === "roof" ? ctx.roofSlot : Math.max(0, slot | 0);
		W.m[1] = kind === KIND.SIGN ? Math.max(0, Math.min(255, Math.round(zb / .2))) : keepM[1];
		return kind;
	};
	const normal = (a, b, c) => {
		const ax = (b[0] - a[0]) * mpu, ay = (b[1] - a[1]) * mpu, az = b[2] - a[2], bx = (c[0] - a[0]) * mpu, by = (c[1] - a[1]) * mpu, bz = c[2] - a[2];
		const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz);
		return l > 1e-9 ? [
			nx / l,
			ny / l,
			nz / l
		] : null;
	};
	let verts = 0;
	const face = (pts, o, look, slot, zb) => {
		let n = normal(pts[0], pts[1], pts[pts.length - 1]) || normal(pts[0], pts[1], pts[2]);
		if (!n) return;
		const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length - o[0], my = pts.reduce((a, p) => a + p[1], 0) / pts.length - o[1], mz = pts.reduce((a, p) => a + p[2], 0) / pts.length - o[2];
		if (n[0] * mx * mpu + n[1] * my * mpu + n[2] * mz < 0) n = n.map((v) => -v);
		set(look, slot, zb);
		W.normal(n[0], n[1], n[2]);
		const idx = pts.map((p) => W.v(p[0] * u, p[1] * u, p[2], zb));
		verts += idx.length;
		for (const p of pts) tb.extend(ch, p[0] * u, p[1] * u, p[0] * u, p[1] * u, p[2]);
		if (idx.length === 3) ch.walls.push(idx[0], idx[1], idx[2]);
		else ch.walls.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
	};
	const capPoly = (ring, z, look, slot, zb, up = 1) => {
		if (ring.length < 3) return;
		set(look, slot, zb);
		W.normal(0, 0, up);
		const base = ring.map((p) => W.v(p[0] * u, p[1] * u, z, zb));
		verts += base.length;
		for (let i = 1; i < ring.length - 1; i++) ch.walls.push(base[0], base[i], base[i + 1]);
	};
	const loft = (p0, zA, p1, zB, { look = "accent", slot = 0, top = true } = {}) => {
		const n = Math.min(p0.length, p1.length);
		if (n < 3 || !(zB >= zA)) return false;
		const a = p0.slice(0, n).map(([x, y]) => [...toTile(clamp(x), clamp(y)), z0 + zA * s]), b = p1.slice(0, n).map(([x, y]) => [...toTile(clamp(x), clamp(y)), z0 + zB * s]);
		const o = [...toTile(p0.reduce((t, p) => t + p[0], 0) / n, p0.reduce((t, p) => t + p[1], 0) / n), z0 + (zA + zB) / 2 * s], zb = z0 + zA * s;
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n, q = [
				a[i],
				a[j],
				b[j],
				b[i]
			];
			const degenTop = Math.hypot(b[j][0] - b[i][0], b[j][1] - b[i][1]) * mpu < 1e-4;
			face(degenTop ? [
				a[i],
				a[j],
				b[i]
			] : q, o, look, slot, zb);
		}
		if (top) capPoly(b, b[0][2], look, slot, zb);
		return true;
	};
	const fitR = (x, y, r, sx = 1) => Math.max(0, Math.min(r, (1 - Math.abs(x)) * HX / (s * sx), (1 - Math.abs(y)) * HY / s));
	const ngon = (x, y, r, n, rot, sx) => Array.from({ length: n }, (_, i) => {
		const a = rot + i * 2 * Math.PI / n;
		return [x + Math.cos(a) * r * sx * s / HX, y + Math.sin(a) * r * s / HY];
	});
	const M = {
		s,
		area: ctx.A,
		H: ctx.H,
		Hn: Math.max(0, ctx.H - ctx.minH) / s,
		aspect: HX / HY,
		half: [HX, HY],
		rand: (k) => unit(ctx.seed, 500 + k),
		loft,
		box(x, y, hx, hy, zA, zB, { rot = 0, look = "accent", slot = 0 } = {}) {
			const c = Math.cos(rot), sn = Math.sin(rot), pts = [
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1]
			].map(([i, j]) => {
				const px = hx * i * HX, py = hy * j * HY;
				return [x + (c * px - sn * py) / HX, y + (sn * px + c * py) / HY];
			});
			return loft(pts, zA, pts, zB, {
				look,
				slot,
				top: true
			});
		},
		frustum(x, y, r0, r1, zA, zB, { n = 8, rot = 0, sx = 1, look = "accent", slot = 0, top = true } = {}) {
			const big = Math.max(r0, r1), k = big > 0 ? fitR(x, y, big, sx) / big : 0;
			if (k <= 0) return false;
			r0 *= k;
			r1 *= k;
			const lo = ngon(x, y, r0, n, rot, sx), hi = r1 > 1e-4 ? ngon(x, y, r1, n, rot, sx) : lo.map(() => [x, y]);
			return loft(lo, zA, hi, zB, {
				look,
				slot,
				top: top && r1 > 1e-4
			});
		},
		dome(x, y, r, zA, h, { n = 10, rings = 4, sx = 1, rot = 0, look = "accent", slot = 0, squash = 1 } = {}) {
			let ok = false;
			const f = (t) => Math.pow(Math.max(0, 1 - t * t), .5 / squash);
			for (let i = 0; i < rings; i++) {
				const t0 = i / rings, t1 = (i + 1) / rings;
				ok = M.frustum(x, y, r * f(t0), i === rings - 1 ? 0 : r * f(t1), zA + h * t0, zA + h * t1, {
					n,
					rot,
					sx,
					look,
					slot,
					top: false
				}) || ok;
			}
			return ok;
		},
		get verts() {
			return verts;
		}
	};
	return M;
}
function pickModel(list, { area, aspect, tall, r }) {
	const ok = list.filter((m) => !!m.fit?.tall === tall && area >= (m.fit?.minArea ?? 0) && area <= (m.fit?.maxArea ?? Infinity) && aspect <= (m.fit?.maxAspect ?? Infinity));
	const pool = ok.length ? ok : list.filter((m) => !!m.fit?.tall === tall);
	if (!pool.length) return null;
	let t = r * pool.reduce((a, m) => a + (m.fit?.weight ?? 1), 0);
	for (const m of pool) {
		t -= m.fit?.weight ?? 1;
		if (t <= 0) return m;
	}
	return pool[pool.length - 1];
}
const MX$1 = (lng) => lng / 360 + .5;
const MY$1 = (lat) => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
function keeps$1(tb, R) {
	if (tb._raceKeep && tb._raceKeepOf === R.keep) return tb._raceKeep;
	const E = tb.E || 4096, out = [];
	for (const [lng, lat, rM] of R.keep || []) {
		const x = (MX$1(lng) - tb.ox) / tb.unit, y = (MY$1(lat) - tb.oy) / tb.unit, r = rM / tb.mPerUnit;
		if (x > -r - E && x < 2 * E + r && y > -r - E && y < 2 * E + r) out.push([
			x,
			y,
			r
		]);
	}
	tb._raceKeep = out;
	tb._raceKeepOf = R.keep;
	return out;
}
function building$1(tb, ctx, unit) {
	const R = tb.P.race, list = R && BUILDING_MODELS[R.kind];
	if (!list?.length) return false;
	if (ctx.clipped || ctx.th || ctx.A < RACE_LIMITS.minAreaM2) return false;
	if (keeps$1(tb, R).some(([x, y, r]) => pointInPolygon(x, y, ctx.outer, ctx.holes) || edgeDistance(x, y, [ctx.outer]) <= r)) return false;
	const rect = fitRect(ctx.outer, ctx.holes);
	if (!rect || rect.hy * tb.mPerUnit < RACE_LIMITS.minHalfM) return false;
	const mpu = tb.mPerUnit, u = tb.unit, T = raceTemplates(R), recs = tb.models || (tb.models = []);
	const cellM = tb.opts?.phone ? RACE_LIMITS.cellMPhone : RACE_LIMITS.cellM;
	const HX = rect.hx * mpu, HY = rect.hy * mpu, thin = tb.opts?.phone && HY < RACE_LIMITS.tinyHalfM && TINY[R.kind]?.length;
	const nx = thin ? Math.max(1, Math.min(6, Math.round(HX / (HY * 1.6)))) : Math.max(1, Math.min(4, Math.round(HX / cellM))), ny = thin ? 1 : Math.max(1, Math.min(3, Math.round(HY / cellM)));
	const vx = -rect.uy, vy = rect.ux, gap = nx * ny > 1 ? .84 : 1;
	const b = tb.W.b, Hq = Math.min(65535, Math.round(ctx.H * 10));
	let built = 0;
	for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
		const seed = (ctx.seed ^ Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663)) >>> 0;
		if (nx * ny > 2 && unit(seed, 97) < RACE_LIMITS.emptyCell) continue;
		const ox = (-1 + (2 * i + 1) / nx) * rect.hx, oy = (-1 + (2 * j + 1) / ny) * rect.hy;
		const cell = {
			cx: rect.cx + rect.ux * ox + vx * oy,
			cy: rect.cy + rect.uy * ox + vy * oy,
			hx: rect.hx / nx * gap,
			hy: rect.hy / ny * gap,
			ux: rect.ux,
			uy: rect.uy
		};
		if (cell.hy > cell.hx) Object.assign(cell, {
			hx: cell.hy,
			hy: cell.hx,
			ux: vx,
			uy: vy
		});
		const area = 4 * cell.hx * cell.hy * mpu * mpu, half = cell.hy * mpu, aspect = cell.hx / cell.hy;
		const pool = half < RACE_LIMITS.smallHalfM ? list.filter((m) => m.fit?.small) : nx * ny > 1 ? list.filter((m) => !m.fit?.big || half >= RACE_LIMITS.bigHalfM) : list;
		const tiny = tb.opts?.phone && half < RACE_LIMITS.tinyHalfM && TINY[R.kind]?.length;
		const model = tiny ? null : pickModel(pool.length ? pool : list, {
			area,
			aspect,
			tall: false,
			r: unit(seed, 499)
		});
		if (!tiny && !model) continue;
		const t = tiny ? templateIndex(list.length + Math.floor(unit(seed, 496) * TINY[R.kind].length), aspect) : templateIndex(list.indexOf(model), aspect), hx = cell.hx * mpu, hy = cell.hy * mpu;
		recs.push([
			t,
			cell.cx * u,
			cell.cy * u,
			ctx.minH,
			cell.ux,
			cell.uy,
			hx,
			hy,
			hy,
			ctx.mat,
			ctx.roofSlot,
			Hq & 255,
			Hq >>> 8,
			seed & 255,
			seed >>> 8 & 255,
			b[2],
			b[3] | NO_AO$1
		]);
		const top = ctx.minH + T.tops[t] * hy, c = (a, d) => [(cell.cx + cell.ux * cell.hx * a + vx * cell.hy * d) * u, (cell.cy + cell.uy * cell.hx * a + vy * cell.hy * d) * u];
		for (const [a, d] of [[-1, -1], [1, 1]]) {
			const p = c(a, d);
			tb.extend(ctx.chunk, p[0], p[1], p[0], p[1], top);
		}
		built++;
	}
	return built > 0;
}
const BUCKETS = [
	1,
	1.7,
	2.8
];
const TPL_S = 10;
const TEMPLATES = /* @__PURE__ */ new Map();
const EXTRA_MODELS = /* @__PURE__ */ new Map();
function registerBuildingModels(kind, list) {
	if (BUILDING_MODELS[kind]) throw new Error(`모형 ${kind}: 스타크래프트 종족 이름과 겹침`);
	EXTRA_MODELS.set(kind, list);
}
const modelList = (kind) => BUILDING_MODELS[kind] || EXTRA_MODELS.get(kind) || [];
const templateIndex = (mi, aspect) => {
	let bi = 0, bd = Infinity;
	BUCKETS.forEach((b, k) => {
		const d = Math.abs(Math.log(aspect / b));
		if (d < bd) {
			bd = d;
			bi = k;
		}
	});
	return mi * BUCKETS.length + bi;
};
const tplHash = (h, k) => (Math.imul(h ^ Math.imul(k + 1, 2654435761), 2246822507) >>> 8) / 16777216;
function raceTemplates(R) {
	const key = R.kind + "|" + JSON.stringify(R.pad || null) + "|" + (R.lod || "");
	let T = TEMPLATES.get(key);
	if (T) return T;
	const list = modelList(R.kind), verts = [], idx = [], ranges = [], tops = [];
	[...list, ...TINY[R.kind] || []].forEach((model, mi) => BUCKETS.forEach((bk, bi) => {
		const HX = bk * TPL_S, HY = TPL_S, V = [], nrm = [
			0,
			0,
			1
		];
		const W = {
			n: 0,
			kind: 0,
			w: [
				0,
				0,
				0,
				0
			],
			b: [
				0,
				0,
				0,
				0
			],
			m: [
				0,
				0,
				0,
				0
			],
			normal(x, y, z) {
				nrm[0] = x;
				nrm[1] = y;
				nrm[2] = z;
			},
			v(x, y, z, zb) {
				V.push([
					x,
					y,
					z,
					...nrm,
					zb,
					this.kind,
					this.m[0]
				]);
				return this.n++;
			}
		};
		const ch = {
			walls: [],
			lo: [],
			hi: []
		}, tb = {
			mPerUnit: 1,
			unit: 1,
			W,
			extend() {}
		};
		const ctx = {
			minH: -RACE_LIMITS.baseM,
			A: 4 * HX * HY,
			H: 10,
			seed: 1540483477 * (mi + 1) + bi * 977 >>> 0,
			chunk: ch,
			mat: 0,
			roofSlot: 0
		};
		const M = modelBuilder(tb, ctx, tplHash, {
			cx: 0,
			cy: 0,
			hx: HX,
			hy: HY,
			ux: 1,
			uy: 0
		});
		if (R.lod === "low") {
			M.low = true;
			const fr = M.frustum, dm = M.dome;
			M.frustum = (x, y, r0, r1, zA, zB, o = {}) => fr(x, y, r0, r1, zA, zB, {
				...o,
				n: Math.min(o.n || 8, 6)
			});
			M.dome = (x, y, r, zA, h, o = {}) => dm(x, y, r, zA, h, {
				...o,
				n: Math.min(o.n || 10, 6),
				rings: Math.min(o.rings || 4, 2)
			});
		}
		if (R.pad) padOf(M, R.pad, tplHash(ctx.seed, 498));
		try {
			model.build(M);
		} catch (e) {
			console.warn("race template", R.kind, model.id, e);
		}
		const base = verts.length / 8, i0 = idx.length;
		let zmax = 0;
		for (const [x, y, z, nx, ny, nz, zb, kind, slot] of V) {
			const nl = Math.hypot(nx * HX, ny * HY, nz * TPL_S) || 1;
			verts.push(x / HX, y / HY, z / TPL_S, nx * HX / nl, ny * HY / nl, nz * TPL_S / nl, zb / TPL_S, kind * 16 + Math.min(15, slot));
			zmax = Math.max(zmax, z);
		}
		for (const k of ch.walls) idx.push(base + k);
		ranges.push([i0, idx.length - i0]);
		tops.push(zmax / TPL_S);
	}));
	T = {
		verts: new Float32Array(verts),
		idx: new Uint32Array(idx),
		ranges,
		tops,
		key
	};
	TEMPLATES.set(key, T);
	return T;
}
function padOf(M, pad, r) {
	const z1 = -RACE_LIMITS.baseM + .06 / M.s, o = {
		look: pad.look || "accent",
		slot: pad.slot ?? 0
	};
	if (pad.shape === "blob") M.frustum(0, 0, 1.3, 1.2, -RACE_LIMITS.baseM / M.s, z1, {
		n: 12,
		sx: Math.min(1.8, M.aspect),
		rot: r * Math.PI,
		...o
	});
	else if (pad.shape === "octagon") M.frustum(0, 0, 1.25, 1.2, -RACE_LIMITS.baseM / M.s, z1, {
		n: 8,
		rot: Math.PI / 8,
		sx: Math.min(1.8, M.aspect),
		...o
	});
	else M.box(0, 0, .97, .97, -RACE_LIMITS.baseM / M.s, z1, o);
}
registerCityPart("race", {
	building: building$1,
	templates: raceTemplates
});
// web/modes/nations/models.mjs
const A$1 = (slot) => ({
	look: "accent",
	slot
});
const rect = (x, y, hx, hy) => [
	[x - hx, y - hy],
	[x + hx, y - hy],
	[x + hx, y + hy],
	[x - hx, y + hy]
];
const WALL = { look: "wall" };
const ROOF = { look: "roof" };
const F = .32;
const fit = (weight, o = {}) => ({
	weight,
	tall: false,
	minArea: 0,
	maxArea: Infinity,
	maxAspect: Infinity,
	...o
});
function rim(M, z, h, o) {
	if (M.low) return;
	for (const [x, y, hx, hy] of [
		[
			0,
			-.985,
			1,
			.015
		],
		[
			0,
			.985,
			1,
			.015
		],
		[
			-.985,
			0,
			.015 / M.aspect,
			1
		],
		[
			.985,
			0,
			.015 / M.aspect,
			1
		]
	]) M.box(x, y, hx, hy, z, z + h, o);
}
const bays = (M, per) => Math.max(1, Math.round(M.aspect * per));
function facade(M, { zA = 0, zB, nL, nS, w = .5, rows = null, glass = A$1(2), wall = WALL, sides = [-1, 1], ends = [-1, 1], cap = true }) {
	if (M.low) {
		const side = (x, y, hx, hy, z0, z1, o) => {
			if (z1 - z0 > .002) M.loft(rect(x, y, hx, hy), z0, rect(x, y, hx, hy), z1, {
				...o,
				top: false
			});
		};
		const cx = .17 / M.aspect, cy = .3, mid = .07 / M.aspect;
		side(0, 0, 1 - .05 / M.aspect, .95, zA, zB, glass);
		for (const sx of [-1, 1]) for (const sy of [-1, 1]) side(sx * (1 - cx), sy * .7, cx, cy, zA, zB, wall);
		if (nL >= 2 && M.aspect > 1.25) for (const sy of [-1, 1]) side(0, sy * .975, mid, .025, zA, zB, wall);
		const R = rows || [[zA + (zB - zA) * .15, zB - (zB - zA) * .12]], cuts = [
			[zA, R[0][0]],
			...R.slice(0, -1).map((r, k) => [r[1], R[k + 1][0]]),
			[R[R.length - 1][1], zB]
		];
		for (const [z0, z1] of cuts) side(0, 0, 1, 1, z0, z1, wall);
		if (cap) M.box(0, 0, 1.006, 1.006, zB, zB + .015, ROOF);
		return;
	}
	const tL = .1, tS = .1 / M.aspect;
	M.box(0, 0, 1 - tS * .5, 1 - tL * .5, zA, zB, glass);
	const R = rows || [[zA, zB]], bands = [
		[zA, R[0][0]],
		...R.slice(0, -1).map((r, i) => [r[1], R[i + 1][0]]),
		[R[R.length - 1][1], zB]
	].filter(([a, b]) => b - a > .003);
	const face = (n, along, at, t, asp) => {
		const put = (c, h, z0, z1) => along === "x" ? M.box(c, at * (1 - t / 2), h, t / 2, z0, z1, wall) : M.box(at * (1 - t / 2), c, t / 2, h, z0, z1, wall);
		const hw = n ? w / n : 0, edges = [-1];
		for (let i = 0; i < n; i++) {
			const c = -1 + (2 * i + 1) / n;
			edges.push(c - hw, c + hw);
		}
		edges.push(1);
		for (let k = 0; k < edges.length; k += 2) {
			const a = edges[k], b = edges[k + 1];
			if (b - a > .002) for (const r of R) put((a + b) / 2, (b - a) / 2, r[0], r[1]);
		}
		for (const [z0, z1] of bands) put(0, 1, z0, z1);
	};
	for (const y of sides) face(nL, "x", y, tL);
	for (const x of ends) face(nS, "y", x, tS);
	M.box(0, 0, 1.006, 1.006, zB, zB + .015, ROOF);
}
const GREECE = [
	{
		id: "cube1",
		floors: 1,
		fit: fit(4),
		build(M) {
			const h = F * 1.15;
			facade(M, {
				zB: h,
				nL: bays(M, 2),
				nS: 1,
				w: .3,
				rows: [[.1, .22]],
				glass: A$1(0)
			});
			rim(M, h, .07, A$1(1));
		}
	},
	{
		id: "stair1",
		floors: 1,
		fit: fit(3),
		build(M) {
			const h = F * 1.1;
			facade(M, {
				zB: h,
				nL: bays(M, 1.5),
				nS: 1,
				w: .26,
				rows: [[.1, .22]],
				glass: A$1(0)
			});
			rim(M, h, .08, A$1(1));
			for (let k = 0; k < 6; k++) M.box(-.7 + k * .1, -1.06, .05, .06, 0, (k + 1) * h / 6, WALL);
		}
	},
	{
		id: "chapel",
		floors: 1,
		fit: fit(.5, { minArea: 80 }),
		build(M) {
			const h = F * 1.3;
			facade(M, {
				zB: h,
				nL: bays(M, 1.5),
				nS: 1,
				w: .3,
				rows: [[.12, .3]],
				glass: A$1(0)
			});
			rim(M, h, .05, A$1(1));
			const r = Math.min(.75, .75 / Math.max(1, M.aspect * .6));
			M.frustum(0, 0, r, r, h, .47600000000000003, {
				n: 12,
				...A$1(1)
			});
			M.dome(0, 0, r, .47600000000000003, .32, {
				n: 12,
				rings: 4,
				...A$1(0)
			});
			M.box(.8, 0, .06 / M.aspect, .45, h, .8360000000000001, A$1(1));
			M.box(.8, 0, .07 / M.aspect, .14, .5960000000000001, .716, A$1(0));
		}
	},
	{
		id: "cube2",
		floors: 2,
		fit: fit(3),
		build(M) {
			const h = F * 1.1;
			facade(M, {
				zB: h,
				nL: bays(M, 2),
				nS: 1,
				w: .28,
				rows: [[.1, .21]],
				glass: A$1(0)
			});
			M.box(-.35, .25, .6, .7, h, .672, WALL);
			rim(M, h, .07, A$1(1));
			rim(M, .672, .05, A$1(1));
		}
	},
	{
		id: "twin2",
		floors: 2,
		fit: fit(3),
		build(M) {
			const h = F * 2.1;
			facade(M, {
				zB: h,
				nL: bays(M, 2),
				nS: 1,
				w: .3,
				rows: [[.1, .22], [.42000000000000004, .54]],
				glass: A$1(0)
			});
			rim(M, h, .06, A$1(1));
			M.box(.55, 0, .45, 1.01, 0, F * .7, A$1(1));
			M.box(.55, 0, .43, .99, F * .7, F * .78, WALL);
		}
	},
	{
		id: "terrace",
		floors: 2,
		fit: fit(2),
		build(M) {
			for (let k = 0; k < 3; k++) {
				const x0 = -1 + k * .62, z = F * (k + 1) * .85;
				M.box((x0 + 1) / 2, 0, (1 - x0) / 2, 1, 0, z, WALL);
				rim(M, z, .05, A$1(1));
			}
		}
	},
	{
		id: "tower3",
		floors: 3,
		fit: fit(2),
		build(M) {
			const h = F * 1.05;
			facade(M, {
				zB: h,
				nL: bays(M, 2),
				nS: 1,
				w: .3,
				rows: [[.1, .22]],
				glass: A$1(0)
			});
			M.box(.15, -.1, .75, .75, h, .656, WALL);
			M.box(.3, -.2, .45, .45, .656, .976, WALL);
			M.box(.3, -.2, .47, .47, .976, 1.016, A$1(0));
			rim(M, h, .06, A$1(1));
			rim(M, .656, .05, A$1(1));
		}
	}
];
function dutch(gable, floors) {
	return {
		id: `${gable}${floors}`,
		floors,
		fit: fit(gable === "spout" ? 2 : 3),
		build(M) {
			const h = F * floors + .05, rise = .55;
			facade(M, {
				cap: false,
				zB: h,
				nL: bays(M, .8),
				nS: 2,
				w: .62,
				rows: Array.from({ length: floors }, (_, f) => [.06 + f * F, .06 + f * F + F * .62])
			});
			M.loft([
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1]
			], h, [
				[-.97, 0],
				[.97, 0],
				[.97, 0],
				[-.97, 0]
			], h + rise, {
				...ROOF,
				top: false
			});
			for (const sx of [-1, 1]) {
				const x = sx * .99, t = .02 / M.aspect;
				if (M.low) {
					M.loft([
						[x - t, -1],
						[x + t, -1],
						[x + t, 1],
						[x - t, 1]
					], h, gable === "spout" ? [
						[x - t, 0],
						[x + t, 0],
						[x + t, 0],
						[x - t, 0]
					] : [
						[x - t, -.4],
						[x + t, -.4],
						[x + t, .4],
						[x - t, .4]
					], h + rise * 1.05, {
						...WALL,
						top: gable !== "spout"
					});
					continue;
				}
				if (gable === "step") for (let k = 0; k < 4; k++) M.box(x, 0, t, 1 - k * .24, h + k * rise / 4, h + (k + 1) * rise / 4 + .03, WALL);
				else if (gable === "bell") for (let k = 0; k < 6; k++) M.box(x, 0, t, .58 + .38 * Math.cos(k / 5 * Math.PI / 2) - k * .07, h + k * rise / 6, h + (k + 1) * rise / 6 + .03, WALL);
				else if (gable === "neck") {
					M.box(x, 0, t, .95, h, h + rise * .35, WALL);
					M.box(x, 0, t, .4, h + rise * .35, h + rise * 1.08, WALL);
					M.box(x, 0, t * 1.4, .46, h + rise * 1.08, h + rise * 1.15, A$1(1));
				} else M.loft([
					[x - t, -1],
					[x + t, -1],
					[x + t, 1],
					[x - t, 1]
				], h, [
					[x - t, 0],
					[x + t, 0],
					[x + t, 0],
					[x - t, 0]
				], h + rise * 1.1, {
					...WALL,
					top: false
				});
				M.box(x, 0, t * 1.3, .07, h + rise * .55, h + rise * .55 + .05, A$1(1));
			}
		}
	};
}
const NETHERLANDS = [
	2,
	3,
	4,
	5
].flatMap((f) => [
	"step",
	"bell",
	"neck",
	"spout"
].map((g) => dutch(g, f)));
function band(M, z, h, out, o) {
	if (M.low) return;
	for (const y of [-1, 1]) M.box(0, y * (1 + out / 2), 1 + out / M.aspect, out / 2, z, z + h, o);
	for (const x of [-1, 1]) M.box(x * (1 + out / 2 / M.aspect), 0, out / 2 / M.aspect, 1, z, z + h, o);
}
function haussmann(floors, corner, style = "classic") {
	return {
		id: `haus${floors}${style}${corner ? "c" : ""}`,
		floors,
		fit: fit(corner ? .6 : 3, corner ? { minArea: 300 } : {}),
		build(M) {
			const h = F * floors + .12, rise = .36, k = .88;
			const sill = (f) => .42 + f * F, nW = bays(M, 1.8);
			facade(M, {
				cap: false,
				zB: h,
				nL: nW,
				nS: 2,
				w: .46,
				rows: [[.03, .3], ...Array.from({ length: floors - 1 }, (_, f) => [sill(f), sill(f) + .2])]
			});
			band(M, .34, .03, .03, WALL);
			if (style === "classic") {
				band(M, sill(0) - .025, .02, .05, A$1(1));
				band(M, sill(floors - 2) - .025, .02, .05, A$1(1));
			}
			if (style === "balcony") for (let f = 0; f < floors - 1; f++) band(M, sill(f) - .022, .016, .04, A$1(1));
			if (style === "plain") band(M, .64, .03, .02, WALL);
			band(M, h - .03, .045, .05, WALL);
			M.loft([
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1]
			], h + .015, [
				[-.88, -.88],
				[k, -.88],
				[k, k],
				[-.88, k]
			], h + rise, {
				...style === "plain" ? ROOF : A$1(0),
				top: true
			});
			for (let i = 0; i < (M.low ? Math.min(2, nW) : nW); i++) for (const y of M.low ? [-.955] : [-.955, .955]) M.box(-1 + (2 * i + 1) / nW, y, .2 / nW, .04, h + .08, h + .26, WALL);
			for (const x of M.low ? [.1] : [
				-.55,
				.1,
				.65
			]) M.box(x, 0, .04, .1, h + rise, h + rise + .16, ROOF);
			if (corner) {
				const r = .28;
				M.frustum(.8, -.72, r, r, h - F, h + .1, {
					n: 10,
					...WALL
				});
				M.dome(.8, -.72, r, h + .1, .3, {
					n: 10,
					rings: 3,
					...A$1(0)
				});
			}
		}
	};
}
const PARIS = [...[
	4,
	5,
	6,
	7
].flatMap((f) => [
	"classic",
	"balcony",
	"plain"
].map((st) => haussmann(f, false, st))), haussmann(6, true)];
function cairo(floors, extra) {
	return {
		id: `cairo${floors}${extra}`,
		floors,
		fit: fit(extra === "mosque" ? 1 : 3, extra === "mosque" ? { minArea: 160 } : {}),
		build(M) {
			const h = F * floors + .04;
			facade(M, {
				zB: h,
				nL: bays(M, 2),
				nS: 1,
				w: .3,
				rows: Array.from({ length: floors }, (_, f) => [.1 + f * F, .24 + f * F])
			});
			rim(M, h, .1, WALL);
			if (extra === "tanks" && M.low) M.frustum(-.5, .3, .1, .1, h, h + .13, {
				n: 8,
				...A$1(2)
			});
			else if (extra === "tanks") {
				M.frustum(-.5, .3, .1, .1, h, h + .13, {
					n: 8,
					...A$1(2)
				});
				M.frustum(-.15, .3, .1, .1, h, h + .13, {
					n: 8,
					...A$1(2)
				});
				M.dome(.5, -.4, .14, h + .06, .05, {
					n: 8,
					rings: 2,
					...A$1(1)
				});
				M.box(.5, -.4, .02, .03, h, h + .06, A$1(1));
			}
			if (extra === "plain" && !M.low) {
				M.box(-.3, 0, .5, .02, h + .12, h + .14, A$1(2));
				for (let k = 0; k < 3; k++) M.box(-.6 + k * .3, 0, .06, .03, h + .04, h + .12, [
					A$1(0),
					A$1(1),
					A$1(2)
				][k]);
			}
			if (extra === "rebar" && M.low) for (const [x, y] of [[-.8, -.8], [.8, .8]]) M.box(x, y, .015, .015, h, h + .25, A$1(2));
			else if (extra === "rebar") {
				for (const [x, y] of [
					[-.8, -.8],
					[.8, -.8],
					[-.8, .8],
					[.8, .8]
				]) M.box(x, y, .015, .015, h, h + .25, A$1(2));
				M.frustum(.3, .3, .1, .1, h, h + .13, {
					n: 8,
					...A$1(2)
				});
			}
			if (extra === "mosque") {
				const r = .55;
				M.frustum(0, 0, r, r, h, h + .06, {
					n: 12,
					...WALL
				});
				M.dome(0, 0, r, h + .06, .5, {
					n: 12,
					rings: 4,
					...A$1(0)
				});
				M.frustum(.85, .75, .1, .08, h, h + 1.2, {
					n: 8,
					...A$1(1)
				});
				M.dome(.85, .75, .09, h + 1.2, .14, {
					n: 8,
					rings: 2,
					...A$1(0)
				});
			}
		}
	};
}
const NATION_MODELS = {
	greece: GREECE,
	netherlands: NETHERLANDS,
	paris: PARIS,
	egypt: [
		...[
			2,
			3,
			4,
			5,
			6,
			7
		].flatMap((f) => [
			"tanks",
			"rebar",
			"plain"
		].map((x) => cairo(f, x))),
		cairo(3, "mosque"),
		cairo(4, "mosque")
	]
};
const NATION_CELLS = {
	greece: {
		halfM: 5.5,
		depthM: 6,
		maxH: 30,
		floors: [1, 3]
	},
	netherlands: {
		halfM: 3.6,
		depthM: 8,
		maxH: 30,
		floors: [2, 5]
	},
	paris: {
		halfM: 13,
		depthM: 9,
		maxH: 60,
		gap: .985,
		floors: [4, 7]
	},
	egypt: {
		halfM: 7,
		depthM: 7,
		maxH: 45,
		floors: [2, 7]
	}
};
// web/modes/nations/parts.mjs
for (const [k, list] of Object.entries(NATION_MODELS)) registerBuildingModels(k, list);
const NATION_LIMITS = {
	minAreaM2: 40,
	phoneMinAreaM2: 120,
	minHalfM: 3
};
const A = (slot) => ({
	look: "accent",
	slot
});
const top = (M) => M.Hn - .3 / M.s;
const NATIONS = {
	greece: {
		pick(r, c, phone) {
			if (c.H - c.minH > 30) return null;
			if (r < .04 && c.A >= 120 && c.A <= 3e3) return "church";
			if (r < .07 && c.A >= 60) return "bell";
			if (r < .32 && c.H - c.minH < 16) return "cubes";
			return null;
		},
		build: {
			church(M) {
				const z = top(M), r = .62;
				M.frustum(0, 0, r, r, z, z + .28, {
					n: 10,
					...A(1)
				});
				M.dome(0, 0, r, z + .28, r * 1.05, {
					n: 10,
					rings: 4,
					...A(0)
				});
				M.box(0, 0, .03, .03, z + .28 + r * 1.05, z + .28 + r * 1.05 + .32, A(1));
				M.box(0, 0, .12, .03, z + .28 + r * 1.05 + .2, z + .28 + r * 1.05 + .25, A(1));
			},
			bell(M) {
				const z = top(M), x = .6, y = 0;
				M.box(x, y, .16, .3, z, z + .9, A(1));
				M.box(x, y, .1, .2, z + .45, z + .7, A(0));
				M.dome(x, y, .22, z + .9, .28, {
					n: 8,
					rings: 3,
					...A(0)
				});
			},
			cubes(M, c, phone) {
				const z = top(M), f = 3.1 / M.s, sx = M.rand(1) < .5 ? -1 : 1;
				M.box(sx * .28, -.12, .62, .6, z, z + f, { look: "wall" });
				if (M.rand(2) < .45) M.box(-sx * .3, .3, .45, .45, z + f, z + 2 * f, { look: "wall" });
				if (phone) return;
				if (M.rand(3) < .35) M.box(-sx * .55, -.4, .3, .3, z, z + .45 * f, A(0));
				for (const [x, y, hx, hy] of [
					[
						0,
						-.97,
						1,
						.03
					],
					[
						0,
						.97,
						1,
						.03
					],
					[
						-.97,
						0,
						.03,
						1
					],
					[
						.97,
						0,
						.03,
						1
					]
				]) M.box(x, y, hx, hy, z, z + .32 / M.s * 2, A(1));
			}
		}
	},
	netherlands: {
		pick(r, c, phone) {
			const h = c.H - c.minH;
			if (r < .006 && c.A >= 120 && h < 20) return "windmill";
			if (r < .016 && c.A >= 200 && h < 30) return "spire";
			if (h < 24 && c.A < 900) return "canal";
			return null;
		},
		build: {
			canal(M, c, phone) {
				const z = top(M), rise = Math.min(1.6, 5.5 / M.s), tile = M.rand(5) < .35 ? 2 : 0;
				M.loft([
					[-1, -1],
					[1, -1],
					[1, 1],
					[-1, 1]
				], z, [
					[-.96, 0],
					[.96, 0],
					[.96, 0],
					[-.96, 0]
				], z + rise, {
					...A(tile),
					top: false
				});
				const kind = phone ? 3 : Math.floor(M.rand(6) * 4), w = .97, t = .04;
				if (kind === 0) for (let k = 0; k < 4; k++) M.box(w, 0, t, 1 - k * .24, z + k * rise / 4, z + (k + 1) * rise / 4 + .02, { look: "wall" });
				else if (kind === 1) for (let k = 0; k < 6; k++) M.box(w, 0, t, .55 + .4 * Math.cos(k / 5 * Math.PI / 2) - k * .06, z + k * rise / 6, z + (k + 1) * rise / 6 + .02, { look: "wall" });
				else if (kind === 2) {
					M.box(w, 0, t, .95, z, z + rise * .35, { look: "wall" });
					M.box(w, 0, t, .4, z + rise * .35, z + rise * 1.05, { look: "wall" });
					M.box(w, 0, .05, .46, z + rise * 1.05, z + rise * 1.12, A(1));
				} else M.loft([
					[.9299999999999999, -1],
					[1.01, -1],
					[1.01, 1],
					[.9299999999999999, 1]
				], z, [
					[.9299999999999999, 0],
					[1.01, 0],
					[1.01, 0],
					[.9299999999999999, 0]
				], z + rise * 1.08, {
					look: "wall",
					top: false
				});
				if (!phone) M.box(.98, 0, t, .08, z + rise * .55, z + rise * .55 + .5 / M.s, A(1));
			},
			windmill(M) {
				const z = top(M), x = 0, H = 4.2;
				M.frustum(x, 0, .55, .38, z, z + H, {
					n: 8,
					...A(0)
				});
				M.frustum(x, 0, .42, 0, z + H, z + H + .55, {
					n: 8,
					...A(2)
				});
				const fz = z + H * .85, fx = .5;
				M.box(fx, 0, .03, .05, fz - 2.1, fz + 2.1, A(1));
				M.box(fx, 0, .03, .98, fz - .09, fz + .09, A(1));
			},
			spire(M) {
				const z = top(M);
				M.box(.5, 0, .2, .2, z, z + 1.6, { look: "wall" });
				M.frustum(.5, 0, .22, 0, z + 1.6, z + 3.6, {
					n: 8,
					...A(0)
				});
			}
		}
	},
	paris: {
		pick(r, c, phone) {
			const h = c.H - c.minH;
			if (r < .0015 && c.A >= 1500 && h < 25) return "eiffel";
			if (r < .012 && c.A >= 400 && h < 35) return "dome";
			if (h >= 8 && h < 45) return "mansard";
			return null;
		},
		build: {
			mansard(M, c, phone) {
				const z = top(M), f = 3.2 / M.s, rise = Math.min(1.2, 4.6 / M.s), k = .84;
				if (!phone) {
					for (const zb of [z - (M.Hn > 4 * f ? M.Hn - 2 * f : 1.5 * f), z - f]) if (zb > .2) for (const [x, y, hx, hy] of [
						[
							0,
							-1,
							1,
							.025
						],
						[
							0,
							1,
							1,
							.025
						],
						[
							-1,
							0,
							.025,
							1
						],
						[
							1,
							0,
							.025,
							1
						]
					]) M.box(x, y, hx, hy, zb, zb + .12 / M.s * 3, A(1));
				}
				M.loft([
					[-1, -1],
					[1, -1],
					[1, 1],
					[-1, 1]
				], z, [
					[-.84, -.84],
					[k, -.84],
					[k, k],
					[-.84, k]
				], z + rise, {
					...A(0),
					top: true
				});
				const n = phone ? 2 : Math.max(2, Math.min(7, Math.round(M.half[0] / 4.2)));
				for (let i = 0; i < n; i++) {
					const x = -.8 + 1.6 * (i + .5) / n;
					for (const y of [-.9, .9]) M.box(x, y, Math.min(.06, .5 / n), .07, z + rise * .2, z + rise * .75, { look: "wall" });
				}
				for (let i = 0; i < (phone ? 1 : 3); i++) if (M.rand(20 + i) < .7) M.box(-.6 + i * .6, 0, .05, .14, z + rise, z + rise + 1.1 / M.s * 2, A(2));
			},
			dome(M) {
				const z = top(M);
				M.frustum(0, 0, .6, .6, z, z + .5, {
					n: 12,
					look: "wall"
				});
				M.dome(0, 0, .6, z + .5, .7, {
					n: 12,
					rings: 4,
					...A(0)
				});
				M.frustum(0, 0, .1, .02, z + 1.2, z + 1.6, {
					n: 6,
					...A(1)
				});
			},
			eiffel(M) {
				const z = top(M), c = {
					n: 4,
					rot: Math.PI / 4,
					...A(1)
				};
				M.frustum(0, 0, .95, .45, z, z + 2.2, c);
				M.box(0, 0, .5, .5, z + 2.2, z + 2.35, A(1));
				M.frustum(0, 0, .4, .18, z + 2.35, z + 4.6, c);
				M.box(0, 0, .22, .22, z + 4.6, z + 4.72, A(1));
				M.frustum(0, 0, .16, .03, z + 4.72, z + 8.4, c);
			}
		}
	},
	egypt: {
		pick(r, c, phone) {
			const h = c.H - c.minH;
			if (r < .002 && c.A >= 1500 && h < 20) return "pyramid";
			if (r < .016 && c.A >= 250 && h < 30) return "mosque";
			if (h < 40 && (!phone || r < .5)) return "rooftop";
			return null;
		},
		build: {
			rooftop(M, c, phone) {
				const z = top(M), u = 1 / M.s;
				for (const [x, y, hx, hy] of [
					[
						0,
						-.98,
						1,
						.02
					],
					[
						0,
						.98,
						1,
						.02
					],
					[
						-.98,
						0,
						.02,
						1
					],
					[
						.98,
						0,
						.02,
						1
					]
				]) M.box(x, y, hx, hy, z, z + .9 * u, { look: "wall" });
				const nT = phone ? 1 : 1 + Math.floor(M.rand(30) * 3);
				for (let i = 0; i < nT; i++) {
					const x = -.6 + M.rand(31 + i) * 1.2, y = -.5 + M.rand(35 + i);
					M.frustum(x, y, .7 * u, .7 * u, z, z + 1.3 * u, {
						n: 8,
						...A(1)
					});
				}
				if (phone) return;
				if (M.rand(40) < .55) {
					const x = .5 - M.rand(41), y = -.6;
					M.box(x, y, .3 * u, .3 * u, z, z + .9 * u, A(1));
					M.dome(x, y, .9 * u, z + .9 * u, .35 * u, {
						n: 8,
						rings: 2,
						...A(2)
					});
				}
				if (M.rand(42) < .4) for (const [x, y] of [
					[-.85, -.85],
					[.85, -.85],
					[-.85, .85],
					[.85, .85]
				]) M.box(x, y, .08 * u, .08 * u, z, z + 2.2 * u, A(1));
				if (M.rand(43) < .2) M.frustum(.55, .5, 1.3 * u, .9 * u, z, z + 3.2 * u, {
					n: 8,
					look: "wall"
				});
				if (M.rand(44) < .3) M.box(-.35, .35, .45, .35, z + 2.4 * u, z + 2.55 * u, A(2));
			},
			mosque(M) {
				const z = top(M), r = .55;
				M.frustum(0, 0, r, r, z, z + .3, {
					n: 12,
					look: "wall"
				});
				M.dome(0, 0, r, z + .3, r * .95, {
					n: 12,
					rings: 4,
					...A(0)
				});
				const x = .78, y = .7;
				M.frustum(x, y, .13, .1, z, z + 3.2, {
					n: 8,
					...A(2)
				});
				M.frustum(x, y, .16, .16, z + 2.4, z + 2.55, {
					n: 8,
					...A(2)
				});
				M.dome(x, y, .1, z + 3.2, .2, {
					n: 8,
					rings: 2,
					...A(0)
				});
			},
			pyramid(M) {
				const z = top(M);
				M.frustum(0, 0, .97, 0, z, z + 1.9, {
					n: 4,
					rot: Math.PI / 4,
					look: "wall"
				});
			}
		}
	}
};
const NO_AO = 8;
const MX = (lng) => lng / 360 + .5;
const MY = (lat) => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
function keeps(tb, R) {
	if (tb._natKeep && tb._natKeepOf === R.keep) return tb._natKeep;
	const E = tb.E || 4096, out = [];
	for (const [lng, lat, rM] of R.keep || []) {
		const x = (MX(lng) - tb.ox) / tb.unit, y = (MY(lat) - tb.oy) / tb.unit, r = rM / tb.mPerUnit;
		if (x > -r - E && x < 2 * E + r && y > -r - E && y < 2 * E + r) out.push([
			x,
			y,
			r
		]);
	}
	tb._natKeep = out;
	tb._natKeepOf = R.keep;
	return out;
}
function modelBuilding(tb, ctx, unit) {
	const R = tb.P.race, list = R && modelList(R.kind), C = R && NATION_CELLS[R.kind];
	if (!list?.length || !C) return false;
	if (ctx.clipped || ctx.th || ctx.A < NATION_LIMITS.minAreaM2 || ctx.H - ctx.minH > C.maxH) return false;
	if (keeps(tb, R).some(([x, y, r]) => pointInPolygon(x, y, ctx.outer, ctx.holes) || edgeDistance(x, y, [ctx.outer]) <= r)) return false;
	const rect = fitRect(ctx.outer, ctx.holes), mpu = tb.mPerUnit;
	if (!rect || rect.hy * mpu < NATION_LIMITS.minHalfM) return false;
	const u = tb.unit, T = raceTemplates(R), recs = tb.models || (tb.models = []), b = tb.W.b, Hq = Math.min(65535, Math.round(ctx.H * 10));
	const cs = tb.opts?.phone ? 1.7 : 1;
	const nx = Math.max(1, Math.min(8, Math.round(rect.hx * mpu / (C.halfM * cs)))), ny = Math.max(1, Math.min(3, Math.round(rect.hy * mpu / (C.depthM * cs)))), vx = -rect.uy, vy = rect.ux, gap = C.gap ?? .9;
	let built = 0;
	for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
		const seed = (ctx.seed ^ Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663)) >>> 0;
		const ox = (-1 + (2 * i + 1) / nx) * rect.hx, oy = (-1 + (2 * j + 1) / ny) * rect.hy;
		const cell = {
			cx: rect.cx + rect.ux * ox + vx * oy,
			cy: rect.cy + rect.uy * ox + vy * oy,
			hx: rect.hx / nx * gap,
			hy: rect.hy / ny * gap,
			ux: rect.ux,
			uy: rect.uy
		};
		if (cell.hy > cell.hx) Object.assign(cell, {
			hx: cell.hy,
			hy: cell.hx,
			ux: vx,
			uy: vy
		});
		const area = 4 * cell.hx * cell.hy * mpu * mpu, aspect = cell.hx / cell.hy;
		const [f0, f1] = C.floors || [1, 9], want = Math.max(f0, Math.min(f1, Math.round((ctx.H - ctx.minH) / 3.2 + (unit(seed, 612) - .5) * 2.2)));
		const near = Math.min(...list.map((m) => Math.abs((m.floors ?? want) - want)));
		const model = pickModel(list.filter((m) => Math.abs((m.floors ?? want) - want) === near), {
			area,
			aspect,
			tall: false,
			r: unit(seed, 611)
		});
		if (!model) continue;
		const t = templateIndex(list.indexOf(model), aspect), s = 10;
		recs.push([
			t,
			cell.cx * u,
			cell.cy * u,
			ctx.minH,
			cell.ux,
			cell.uy,
			cell.hx * mpu,
			cell.hy * mpu,
			s,
			ctx.mat,
			ctx.roofSlot,
			Hq & 255,
			Hq >>> 8,
			seed & 255,
			seed >>> 8 & 255,
			b[2],
			b[3] | NO_AO
		]);
		const top = ctx.minH + T.tops[t] * s, c = (a, d) => [(cell.cx + cell.ux * cell.hx * a + vx * cell.hy * d) * u, (cell.cy + cell.uy * cell.hx * a + vy * cell.hy * d) * u];
		for (const [a, d] of [[-1, -1], [1, 1]]) {
			const p = c(a, d);
			tb.extend(ctx.chunk, p[0], p[1], p[0], p[1], top);
		}
		built++;
	}
	return built > 0;
}
function building(tb, ctx, unit) {
	if (modelBuilding(tb, ctx, unit)) return true;
	const P = tb.P.nation, N = P && NATIONS[P.kind];
	if (!N) return false;
	const phone = !!tb.opts?.phone;
	if (ctx.clipped || ctx.th || ctx.A < (phone ? NATION_LIMITS.phoneMinAreaM2 : NATION_LIMITS.minAreaM2)) return false;
	const kind = N.pick(unit(ctx.seed, 610), ctx, phone);
	if (!kind) return false;
	const rect = fitRect(ctx.outer, ctx.holes);
	if (!rect || rect.hy * tb.mPerUnit < NATION_LIMITS.minHalfM) return false;
	const W = tb.W, keepM = W.m.slice(), keepB3 = W.b[3];
	tb.wallsOf(ctx, ctx.outer, ctx.minH, ctx.H, true);
	for (const h of ctx.holes) tb.wallsOf(ctx, h, ctx.minH, ctx.H, false);
	tb.flatRoof(ctx, ctx.outer, ctx.holes, ctx.H, true);
	W.m = keepM.slice();
	W.b[3] = keepB3;
	N.build[kind](modelBuilder(tb, ctx, unit, rect), ctx, phone);
	W.m = keepM;
	W.b[3] = keepB3;
	W.kind = KIND.WALL;
	W.w = [
		0,
		0,
		0,
		0
	];
	return true;
}
registerCityPart("nation", { building });
// web/city/worker.mts
let P = null;
let TH = null;
self.onmessage = (e) => {
	const m = e.data;
	if (m.type === "pack") {
		P = resolvePack(m.pack);
		TH = m.through || null;
		return;
	}
	if (m.type !== "build") return;
	try {
		if (!P) throw Error("city-build worker: no style pack yet");
		const L = decodeTile(m.pbf, /* @__PURE__ */ new Set(["building", "landuse"]));
		const tb = new TileBuilder({
			z: m.z,
			x: m.x,
			y: m.y,
			extent: L.building?.extent || 4096,
			buildings: L.building || null,
			landuse: L.landuse || null
		}, P, {
			phone: m.phone,
			through: TH
		});
		while (!tb.step(1e9));
		const r = tb.result();
		self.postMessage({
			type: "done",
			key: m.key,
			mesh: r
		}, [
			r.verts.buffer,
			r.idx.buffer,
			...Object.values(r.inst).map((b) => b.buffer),
			...r.models ? [r.models.data.buffer] : []
		]);
	} catch (err) {
		self.postMessage({
			type: "fail",
			key: m.key,
			error: String(err && err.stack || err)
		});
	}
};
