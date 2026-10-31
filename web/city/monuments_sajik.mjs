import { SJ_AT, SJ_ORIGIN, sjRing } from "./monuments_data.mjs";
import { toM } from "./life.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { MID, buildFrames, frameOf, hall, place, rectOf } from "./monuments_hanok.mjs";
import { SJ_ALTARS, SJ_BUILDINGS, SJ_YU } from "./monuments_sajik_data.mjs";
import { SJ_TREES } from "./monuments_sajik_trees_data.mjs";
import { SJ_TORCHES } from "./monuments_sajik_torches_data.mjs";
// web/city/monuments_sajik.mts
var trees = {
	at: SJ_AT,
	data: SJ_TREES
};
var torches = {
	at: SJ_AT,
	data: SJ_TORCHES
};
var FRAME = frameOf(SJ_AT, SJ_ORIGIN);
var local = (lng, lat) => {
	const [mx, my] = toM(lng, lat);
	return [mx - FRAME.ox, -(my - FRAME.oy)];
};
var points = (flat) => {
	const out = [];
	for (let i = 0; i < flat.length; i += 2) out.push(local(SJ_ORIGIN[0] + flat[i] / 1e6, SJ_ORIGIN[1] + flat[i + 1] / 1e6));
	return out;
};
function stoneWall(w, line, halfWidth, height, gaps) {
	let travelled = 0;
	for (let i = 0; i + 1 < line.length; i++) {
		const [ax, ay] = line[i], [bx, by] = line[i + 1], len = Math.hypot(bx - ax, by - ay);
		if (len < .05) continue;
		const bays = Math.max(1, Math.round(len / 3)), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
		for (let k = 0; k < bays; k++) {
			const t0 = k / bays, t1 = (k + 1) / bays, px = ax + (bx - ax) * t0 - ux * .03, py = ay + (by - ay) * t0 - uy * .03, qx = ax + (bx - ax) * t1 + ux * .03, qy = ay + (by - ay) * t1 + uy * .03;
			const mx = (px + qx) / 2, my = (py + qy) / 2;
			if (gaps.some(([gx, gy, reach]) => Math.hypot(mx - gx, my - gy) < reach)) continue;
			const s0 = travelled + len * t0, s1 = travelled + len * t1;
			for (const sign of [-1, 1]) w.quad([
				px + nx * halfWidth * sign,
				py + ny * halfWidth * sign,
				0
			], [
				qx + nx * halfWidth * sign,
				qy + ny * halfWidth * sign,
				0
			], [
				qx + nx * halfWidth * sign,
				qy + ny * halfWidth * sign,
				height
			], [
				px + nx * halfWidth * sign,
				py + ny * halfWidth * sign,
				height
			], K.granite, [
				nx * sign,
				ny * sign,
				0
			], s0, s1, s1, s0);
			w.quad([
				px - nx * halfWidth,
				py - ny * halfWidth,
				height
			], [
				qx - nx * halfWidth,
				qy - ny * halfWidth,
				height
			], [
				qx + nx * halfWidth,
				qy + ny * halfWidth,
				height
			], [
				px + nx * halfWidth,
				py + ny * halfWidth,
				height
			], K.trim, [
				0,
				0,
				1
			], s0, s1, s1, s0);
		}
		travelled += len;
	}
}
var cornersOf = (ring) => {
	const first = ring[0], last = ring[ring.length - 1], pts = Math.hypot(first[0] - last[0], first[1] - last[1]) < .01 ? ring.slice(0, -1) : ring.slice();
	return pts.filter((p, i) => {
		const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length], d1x = p[0] - a[0], d1y = p[1] - a[1], d2x = b[0] - p[0], d2y = b[1] - p[1];
		return Math.abs(d1x * d2y - d1y * d2x) > .14 * Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y);
	});
};
var sidesOf = (corners) => {
	const cx = corners.reduce((sum, p) => sum + p[0], 0) / corners.length, cy = corners.reduce((sum, p) => sum + p[1], 0) / corners.length;
	return corners.map((a, i) => {
		const b = corners[(i + 1) % corners.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
		const sign = -uy * (mid[0] - cx) + ux * (mid[1] - cy) >= 0 ? 1 : -1;
		return {
			mid,
			along: [ux, uy],
			out: [-uy * sign, ux * sign]
		};
	});
};
var closed = (corners) => [...corners, corners[0]];
var outerCorners = () => cornersOf(sjRing().map(([lng, lat]) => local(lng, lat)));
var yuCorners = () => cornersOf(points(SJ_YU));
var YU_GAP = 1.4;
var GATE_GAP = 1.6;
var SAMMUN_PITCH = 4.4;
var northSide = (sides) => sides.reduce((best, side) => side.out[1] > best.out[1] ? side : best);
function gatesOf() {
	const outerSides = sidesOf(outerCorners()), north = northSide(outerSides), outer = [];
	for (const side of outerSides) for (const n of side === north ? [
		-1,
		0,
		1
	] : [0]) outer.push({
		x: side.mid[0] + side.along[0] * n * SAMMUN_PITCH,
		y: side.mid[1] + side.along[1] * n * SAMMUN_PITCH,
		along: side.along,
		span: GATE_GAP,
		reach: GATE_GAP + (side === north ? 1.4 : .5)
	});
	return {
		outer,
		yu: sidesOf(yuCorners()).map((side) => ({
			x: side.mid[0],
			y: side.mid[1],
			along: side.along,
			span: YU_GAP,
			reach: YU_GAP + .5
		}))
	};
}
function buildWall(w) {
	const { outer, yu } = gatesOf();
	stoneWall(w, closed(outerCorners()), .45, 1.9, outer.map((gate) => [
		gate.x,
		gate.y,
		gate.reach
	]));
	stoneWall(w, closed(yuCorners()), .35, 1, yu.map((gate) => [
		gate.x,
		gate.y,
		gate.reach
	]));
}
function hongsalmun(w, gate) {
	const { x, y, along, span } = gate, [ux, uy] = along, nx = -uy, ny = ux, post = .22, top = 4;
	const at = (u, v, z) => [
		x + ux * u + nx * v,
		y + uy * u + ny * v,
		z
	];
	for (const sign of [-1, 1]) {
		const [px, py] = at(span * sign, 0, 0);
		w.box(px - post, px + post, py - post, py + post, 0, top, K.red, {
			bottom: true,
			top: true
		});
	}
	w.quad(at(-span, -.1, 3.5), at(span, -.1, 3.5), at(span, -.1, top), at(-span, -.1, top), K.red, [
		nx * -1,
		ny * -1,
		0
	]);
	w.quad(at(span, .1, 3.5), at(-span, .1, 3.5), at(-span, .1, top), at(span, .1, top), K.red, [
		nx,
		ny,
		0
	]);
	w.quad(at(-span, -.1, top), at(span, -.1, top), at(span, .1, top), at(-span, .1, top), K.red, [
		0,
		0,
		1
	]);
	for (let k = 0; k <= 8; k++) {
		const [px, py] = at(-span + 2 * span * k / 8, 0, 0);
		w.frustum(px, py, .05, .05, top, .015, .015, 4.55, K.band);
	}
}
function buildGates(w) {
	const { outer, yu } = gatesOf();
	for (const gate of [...outer, ...yu]) hongsalmun(w, gate);
}
function buildAltar(w, flat) {
	const r = rectOf(flat, FRAME);
	let ang = r.ang;
	while (Math.cos(ang) < .7) ang += Math.PI / 2;
	place(w, {
		...r,
		ang
	});
	const hx = (r.len + r.wid) / 4, height = .93;
	w.box(-hx, hx, -hx, hx, 0, height, K.granite, { bottom: true });
	const topZ = .9500000000000001;
	w.quad([
		-hx,
		-hx,
		topZ
	], [
		hx,
		-hx,
		topZ
	], [
		hx,
		hx,
		topZ
	], [
		-hx,
		hx,
		topZ
	], K.thatch, [
		0,
		0,
		1
	]);
	for (let side = 0; side < 4; side++) {
		const cos = [
			0,
			1,
			0,
			-1
		][side], sin = [
			-1,
			0,
			1,
			0
		][side], halfW = 1.2;
		const corner = (u, v) => [cos * u - sin * v, sin * u + cos * v];
		for (let step = 0; step < 3; step++) {
			const x0 = hx + .32 * (2 - step), x1 = x0 + .32, z1 = height * (step + 1) / 4;
			const near = corner(x0, -1.2), far = corner(x1, -1.2), near2 = corner(x0, halfW), far2 = corner(x1, halfW);
			w.quad([
				near[0],
				near[1],
				z1
			], [
				far[0],
				far[1],
				z1
			], [
				far2[0],
				far2[1],
				z1
			], [
				near2[0],
				near2[1],
				z1
			], K.trim, [
				0,
				0,
				1
			]);
			w.quad([
				far[0],
				far[1],
				0
			], [
				far2[0],
				far2[1],
				0
			], [
				far2[0],
				far2[1],
				z1
			], [
				far[0],
				far[1],
				z1
			], K.granite, [
				cos,
				sin,
				0
			]);
			for (const sign of [-1, 1]) {
				const from = sign < 0 ? near : near2, to = sign < 0 ? far : far2;
				w.quad([
					from[0],
					from[1],
					0
				], [
					to[0],
					to[1],
					0
				], [
					to[0],
					to[1],
					z1
				], [
					from[0],
					from[1],
					z1
				], K.granite, [
					-sin * sign,
					cos * sign,
					0
				]);
			}
		}
	}
	w.xf = null;
}
function buildUnnamedHall(w, flat) {
	const r = rectOf(flat, FRAME), yu = yuCorners(), tx = yu.reduce((sum, p) => sum + p[0], 0) / yu.length - r.cx, ty = yu.reduce((sum, p) => sum + p[1], 0) / yu.length - r.cy;
	const front = (ang) => Math.sin(ang) * tx - Math.cos(ang) * ty;
	const face = {
		...r,
		ang: front(r.ang) >= 0 ? r.ang : r.ang + Math.PI
	};
	place(w, face);
	w.remap = { [K.tunnel]: K.red };
	hall(w, {
		hx: Math.max(1, face.len / 2 - .4),
		hy: Math.max(1, face.wid / 2 - .4),
		podium: .7,
		lowPodium: [.5],
		body: 3,
		rise: 2.4,
		eave: 1.5,
		bays: [3, 2],
		steps: MID,
		gabled: true,
		doors: true
	});
	w.remap = null;
	w.xf = null;
}
function buildHalls(w) {
	buildGates(w);
	for (const altar of SJ_ALTARS) buildAltar(w, altar);
	const unnamed = SJ_BUILDINGS[0];
	if (unnamed) buildUnnamedHall(w, unnamed.p);
}
function buildRest(w) {
	buildFrames(w, SJ_BUILDINGS.slice(1), [], FRAME);
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "sj-wall") buildWall(w);
	else if (id === "sj-halls") buildHalls(w);
	else if (id === "sj-frames") buildRest(w);
	return new Float32Array(w.data);
}
export { buildMonument, gatesOf, torches, trees };
