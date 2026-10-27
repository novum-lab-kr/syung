// web/city/geom.mjs
function signedArea2(r) {
	let a = 0;
	for (let i = 0, n = r.length; i < n; i += 2) {
		const j = (i + 2) % n;
		a += r[i] * r[j + 1] - r[j] * r[i + 1];
	}
	return a;
}
var area = (r) => Math.abs(signedArea2(r)) / 2;
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
var pointInPolygon = (x, y, outer, holes) => pointInRing(x, y, outer) && !(holes && holes.some((h) => pointInRing(x, y, h)));
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
var ringInBox = (r, x0, y0, x1, y1) => {
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
var eq = (a, b) => a.x === b.x && a.y === b.y;
var tarea = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
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
var locallyInside = (a, b) => tarea(a.prev, a, a.next) < 0 ? tarea(a, b, a.next) >= 0 && tarea(a, a.prev, b) >= 0 : tarea(a, b, a.prev) < 0 || tarea(a, a.next, b) < 0;
function middleInside(a, b) {
	let p = a, inside = false;
	const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
	do {
		if (p.y > py !== p.next.y > py && p.next.y !== p.y && px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x) inside = !inside;
		p = p.next;
	} while (p !== a);
	return inside;
}
var isValidDiagonal = (a, b) => a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) && (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (tarea(a.prev, a, b.prev) || tarea(a, b.prev, b)) || eq(a, b) && tarea(a.prev, a, a.next) > 0 && tarea(b.prev, b, b.next) > 0);
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
var sectorContainsSector = (m, p) => tarea(m.prev, m, p.prev) < 0 && tarea(p.next, m, m.next) < 0;
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
export { area, bbox, centroid, classifyRings, clipRing, deepestPoint, edgeDistance, insetRing, interiorPoint, orientedBox, perimeter, pointInPolygon, pointInRing, ringInBox, signedArea2, simplifyRing, triangulate };
