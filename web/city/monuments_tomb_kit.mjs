import { K, MeshWriter } from "./monument_parts.mjs";
import { MID, ROUGH, buildFrames, clamp, frameOf, hall, local, place, rectOf, wingsOf } from "./monuments_hanok.mjs";
import { loft } from "./monument_curves.mjs";
// web/city/monuments_tomb_kit.mts
var pointsOf = (flat, origin, frame) => {
	const out = [];
	for (let i = 0; i < flat.length; i += 2) out.push(local(origin[0] + flat[i] / 1e6, origin[1] + flat[i + 1] / 1e6, frame));
	return out;
};
var centroidOf = (pts) => [pts.reduce((sum, p) => sum + p[0], 0) / pts.length, pts.reduce((sum, p) => sum + p[1], 0) / pts.length];
var signedArea = (pts) => {
	let sum = 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
		sum += ax * by - bx * ay;
	}
	return sum / 2;
};
var insidePoly = (x, y, poly) => {
	let hit = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i], [xj, yj] = poly[j];
		if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
	}
	return hit;
};
function earClip(pts) {
	const order = pts.map((_, index) => index);
	if (signedArea(pts) < 0) order.reverse();
	const out = [];
	let guard = 0;
	while (order.length > 3 && guard++ < 5e3) {
		let cut = false;
		for (let i = 0; i < order.length && !cut; i++) {
			const a = order[(i + order.length - 1) % order.length], b = order[i], c = order[(i + 1) % order.length];
			const [ax, ay] = pts[a], [bx, by] = pts[b], [cx, cy] = pts[c];
			if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) <= 1e-9) continue;
			if (order.some((other) => {
				if (other === a || other === b || other === c) return false;
				const [px, py] = pts[other], d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax), d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx), d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
				return d1 >= 0 && d2 >= 0 && d3 >= 0;
			})) continue;
			out.push([
				a,
				b,
				c
			]);
			order.splice(i, 1);
			cut = true;
		}
		if (!cut) return out;
	}
	if (order.length === 3) out.push([
		order[0],
		order[1],
		order[2]
	]);
	return out;
}
function fillPoly(w, pts, z, kind) {
	for (const [a, b, c] of earClip(pts)) w.tri([
		pts[a][0],
		pts[a][1],
		z
	], [
		pts[b][0],
		pts[b][1],
		z
	], [
		pts[c][0],
		pts[c][1],
		z
	], kind, [
		0,
		0,
		1
	]);
}
function slab(w, pts, z0, z1, side, top) {
	const ccw = signedArea(pts) > 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], dx = bx - ax, dy = by - ay;
		w.quad([
			ax,
			ay,
			z0
		], [
			bx,
			by,
			z0
		], [
			bx,
			by,
			z1
		], [
			ax,
			ay,
			z1
		], side, ccw ? [
			dy,
			-dx,
			0
		] : [
			-dy,
			dx,
			0
		]);
	}
	fillPoly(w, pts, z1, top);
}
function terrace(w, pts, height) {
	const [cx, cy] = centroidOf(pts), meanR = pts.reduce((sum, p) => sum + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length, f = Math.max(.7, 1 - 3 / meanR);
	const top = pts.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]), ccw = signedArea(pts) > 0;
	for (let i = 0; i < pts.length; i++) {
		const j = (i + 1) % pts.length, [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, [tax, tay] = top[i], [tbx, tby] = top[j];
		w.quad([
			ax,
			ay,
			0
		], [
			bx,
			by,
			0
		], [
			tbx,
			tby,
			height
		], [
			tax,
			tay,
			height
		], K.grass, ccw ? [
			dy,
			-dx,
			.6
		] : [
			-dy,
			dx,
			.6
		]);
	}
	fillPoly(w, top, height, K.grass);
}
var smooth = (t) => {
	const c = clamp(t, 0, 1);
	return c * c * (3 - 2 * c);
};
function groundOf(hills, pads, clearPolys, clearPoints) {
	const top = Math.max(0, ...hills.map((hill) => hill.h));
	const edges = clearPolys.map((poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]));
	const clearOf = (x, y) => {
		let best = Infinity;
		for (let n = 0; n < clearPolys.length; n++) {
			if (insidePoly(x, y, clearPolys[n])) return 0;
			for (const [a, b] of edges[n]) {
				const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy, t = len ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / len, 0, 1) : 0;
				best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
			}
		}
		for (const p of clearPoints) best = Math.min(best, Math.hypot(x - p[0], y - p[1]) + 3);
		return smooth((best - 5) / 11);
	};
	return (x, y) => {
		let sum = 0;
		for (const hill of hills) {
			const t = Math.hypot(x - hill.x, y - hill.y) / hill.r;
			if (t < 1) sum += hill.h * (1 - t * t) ** 2;
		}
		let z = Math.min(sum, top) * clearOf(x, y);
		for (const pad of pads) {
			const weight = 1 - smooth((Math.hypot(x - pad.x, y - pad.y) - pad.flat) / (pad.fade - pad.flat));
			z = z * (1 - weight) + pad.z * weight;
		}
		return z;
	};
}
function lawn(w, hills, ground, STEP = 3) {
	if (!hills.length) return;
	const minX = Math.min(...hills.map((hill) => hill.x - hill.r)), maxX = Math.max(...hills.map((hill) => hill.x + hill.r));
	const minY = Math.min(...hills.map((hill) => hill.y - hill.r)), maxY = Math.max(...hills.map((hill) => hill.y + hill.r));
	const cols = Math.ceil((maxX - minX) / STEP) + 1, rows = Math.ceil((maxY - minY) / STEP) + 1, z = new Float32Array(cols * rows);
	for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) z[row * cols + col] = ground(minX + col * STEP, minY + row * STEP);
	const at = (col, row) => {
		const value = z[row * cols + col];
		return [
			minX + col * STEP,
			minY + row * STEP,
			value + .03
		];
	};
	const normal = (col, row) => {
		const left = z[row * cols + Math.max(0, col - 1)], right = z[row * cols + Math.min(cols - 1, col + 1)], down = z[Math.max(0, row - 1) * cols + col], up = z[Math.min(rows - 1, row + 1) * cols + col];
		const nx = (left - right) / (2 * STEP), ny = (down - up) / (2 * STEP), len = Math.hypot(nx, ny, 1);
		return [
			nx / len,
			ny / len,
			1 / len
		];
	};
	for (let row = 0; row + 1 < rows; row++) for (let col = 0; col + 1 < cols; col++) {
		const corners = [
			[col, row],
			[col + 1, row],
			[col + 1, row + 1],
			[col, row + 1]
		];
		if (Math.max(...corners.map(([c, r]) => z[r * cols + c])) < .01) continue;
		const [a, b, c, d] = corners.map(([cc, rr]) => ({
			p: at(cc, rr),
			n: normal(cc, rr)
		}));
		w.triN(a.p, b.p, c.p, a.n, b.n, c.n, K.grass);
		w.triN(a.p, c.p, d.p, a.n, c.n, d.n, K.grass);
	}
}
function lowWall(w, line, height = 1.5, half = .3) {
	for (let i = 0; i + 1 < line.length; i++) {
		const [ax, ay] = line[i], [bx, by] = line[i + 1], len = Math.hypot(bx - ax, by - ay);
		if (len < .05) continue;
		const nx = -(by - ay) / len, ny = (bx - ax) / len, cap = half + .12;
		for (const sign of [-1, 1]) w.quad([
			ax + nx * half * sign,
			ay + ny * half * sign,
			0
		], [
			bx + nx * half * sign,
			by + ny * half * sign,
			0
		], [
			bx + nx * half * sign,
			by + ny * half * sign,
			height
		], [
			ax + nx * half * sign,
			ay + ny * half * sign,
			height
		], K.plaster, [
			nx * sign,
			ny * sign,
			0
		]);
		for (const sign of [-1, 1]) w.quad([
			ax + nx * cap * sign,
			ay + ny * cap * sign,
			height
		], [
			bx + nx * cap * sign,
			by + ny * cap * sign,
			height
		], [
			bx,
			by,
			height + .32
		], [
			ax,
			ay,
			height + .32
		], K.giwa, [
			nx * sign * .5,
			ny * sign * .5,
			1
		]);
	}
}
function lowStone(w, ring) {
	for (let i = 0; i < ring.length; i++) {
		const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length], len = Math.hypot(bx - ax, by - ay);
		if (len < .05) continue;
		const nx = -(by - ay) / len, ny = (bx - ax) / len, half = .15;
		for (const sign of [-1, 1]) w.quad([
			ax + nx * half * sign,
			ay + ny * half * sign,
			0
		], [
			bx + nx * half * sign,
			by + ny * half * sign,
			0
		], [
			bx + nx * half * sign,
			by + ny * half * sign,
			.3
		], [
			ax + nx * half * sign,
			ay + ny * half * sign,
			.3
		], K.stone, [
			nx * sign,
			ny * sign,
			0
		]);
		w.quad([
			ax - nx * half,
			ay - ny * half,
			.3
		], [
			bx - nx * half,
			by - ny * half,
			.3
		], [
			bx + nx * half,
			by + ny * half,
			.3
		], [
			ax + nx * half,
			ay + ny * half,
			.3
		], K.stone, [
			0,
			0,
			1
		]);
	}
}
function royalTomb(w, outline, facing) {
	const [cx, cy] = centroidOf(outline), radius = clamp(outline.reduce((sum, p) => sum + Math.hypot(p[0] - cx, p[1] - cy), 0) / outline.length, 3, 9);
	const ringH = 1, domeH = clamp(radius * .45, 2.2, 3.4);
	w.prism(cx, cy, radius, 0, ringH, K.granite, 22);
	loft(w, 6, 22, (v, u) => {
		const angle = Math.PI * 2 * u, t = v * Math.PI / 2;
		return [
			cx + Math.cos(angle) * radius * .94 * Math.cos(t),
			cy + Math.sin(angle) * radius * .94 * Math.cos(t),
			.9 + domeH * Math.sin(t)
		];
	}, K.grass);
	const angle = Math.atan2(facing[1], facing[0]);
	w.xf = {
		x: cx,
		y: cy,
		cos: Math.cos(angle),
		sin: Math.sin(angle)
	};
	w.box(radius + 1, radius + 2.2, -1.25, 1.25, 0, .85, K.stone);
	for (const side of [-1, 1]) {
		w.frustum(radius + .7, side * 2.6, .32, .32, 0, .2, .2, 2, K.stone, { bottom: true });
		w.frustum(radius + 6.5, side * 3.4, .42, .42, 0, .3, .3, 2.6, K.stone, { bottom: true });
	}
	w.box(radius + 3.6, radius + 4.3, -.35, .35, 0, .7, K.stone);
	w.frustum(radius + 3.95, 0, .3, .3, .7, .22, .22, 2, K.stone, { bottom: true });
	w.xf = null;
}
function jeongjagak(w, r) {
	const wings = r.fill < .88 ? wingsOf(r) : [], parts = wings.length ? wings : [r];
	for (const wing of parts) {
		place(w, wing);
		const hx = Math.max(1.5, wing.len / 2 - .5), hy = Math.max(1.2, wing.wid / 2 - .5);
		hall(w, {
			hx,
			hy,
			podium: .9,
			lowPodium: [.6],
			body: 3.3,
			rise: 2.6,
			eave: 1.6,
			bays: [clamp(Math.round(hx * 2 / 3.6), 1, 5), clamp(Math.round(hy * 2 / 3.6), 1, 3)],
			steps: MID,
			gabled: true,
			doors: true
		});
	}
	w.xf = null;
}
function bigak(w, r) {
	place(w, r);
	const hx = Math.max(1.2, r.len / 2 - .6), hy = Math.max(1, r.wid / 2 - .6);
	hall(w, {
		hx,
		hy,
		podium: .5,
		body: 2.7,
		rise: clamp((hy + 1.4) * .6, 1.2, 2.6),
		eave: clamp(hy * .6, .8, 1.5),
		bays: [clamp(Math.round(hx * 2 / 3), 1, 3), 1],
		steps: ROUGH
	});
	w.xf = null;
}
var MODERN = /관리|전시|안내|박물관|매표|역사문화관|강당|화장실|매점/;
function plainBlock(w, r) {
	slab(w, r.pts, 0, 3.4, K.plaster, K.slate);
}
var isShrine = (name) => /정자각/.test(name);
var isStele = (name) => /비각|신도비/.test(name);
var TERRACE_H = .7;
var TOMB_LEVEL = 3;
function tombZone(data) {
	const frame = frameOf(data.at, data.origin), banks = data.banks.map((flat) => pointsOf(flat, data.origin, frame));
	const shrines = data.buildings.filter((each) => isShrine(each.name)).map((each) => centroidOf(pointsOf(each.p, data.origin, frame)));
	const others = data.buildings.map((each) => centroidOf(pointsOf(each.p, data.origin, frame)));
	const bankAt = (x, y) => banks.some((bank) => insidePoly(x, y, bank));
	const facingOf = (cx, cy) => {
		const pool = shrines.length ? shrines : others;
		let best = null, bestDist = Infinity;
		for (const p of pool) {
			const d = Math.hypot(p[0] - cx, p[1] - cy);
			if (d < bestDist) {
				bestDist = d;
				best = p;
			}
		}
		if (!best || bestDist < 1) return [0, -1];
		return [(best[0] - cx) / bestDist, (best[1] - cy) / bestDist];
	};
	const hills = [], pads = [];
	const tombAt = data.tombs.map((tomb) => {
		const [cx, cy] = centroidOf(pointsOf(tomb.p, data.origin, frame));
		return {
			id: tomb.id,
			cx,
			cy,
			level: data.levels?.[tomb.id] ?? TOMB_LEVEL,
			face: facingOf(cx, cy)
		};
	});
	for (const { cx, cy, level, face } of tombAt) {
		const reach = 22 + level * 1.7, peak = level * 1.6;
		hills.push({
			x: cx - face[0] * reach * .45,
			y: cy - face[1] * reach * .45,
			r: reach,
			h: peak
		}, {
			x: cx - face[0] * reach * .95,
			y: cy - face[1] * reach * .95,
			r: reach * .8,
			h: peak * .8
		});
		pads.push({
			x: cx,
			y: cy,
			z: level,
			flat: 14,
			fade: 22
		});
	}
	const torchAt = [];
	for (let i = 0; i + 1 < (data.torches?.length ?? 0); i += 2) torchAt.push([data.torches[i] / 10, -data.torches[i + 1] / 10]);
	const ground = groundOf(hills, pads, data.buildings.map((each) => pointsOf(each.p, data.origin, frame)).filter((poly) => poly.length >= 3), torchAt);
	const levelAt = (x, y) => {
		const near = pads.find((pad) => Math.hypot(x - pad.x, y - pad.y) < pad.fade);
		return near ? near.z : ground(x, y);
	};
	return {
		wall(w) {
			lawn(w, hills, ground);
			for (const bank of banks) if (ground(...centroidOf(bank)) < TERRACE_H) terrace(w, bank, TERRACE_H);
			for (const flat of data.walls) {
				const line = pointsOf(flat, data.origin, frame), [mx, my] = centroidOf(line);
				w.dz = levelAt(mx, my) + (bankAt(mx, my) && ground(mx, my) < TERRACE_H ? TERRACE_H : 0);
				lowWall(w, line);
				w.dz = 0;
			}
		},
		halls(w) {
			for (const tomb of data.tombs) {
				const outline = pointsOf(tomb.p, data.origin, frame), [cx, cy] = centroidOf(outline);
				w.dz = levelAt(cx, cy) + (bankAt(cx, cy) && ground(cx, cy) < TERRACE_H ? TERRACE_H : 0);
				royalTomb(w, outline, facingOf(cx, cy));
				w.dz = 0;
			}
			for (const each of data.buildings) {
				if (each.p.length < 6) continue;
				const r = rectOf(each.p, frame);
				if (isShrine(each.name)) jeongjagak(w, r);
				else if (isStele(each.name)) bigak(w, r);
			}
		},
		frames(w) {
			const rest = data.buildings.filter((each) => !isShrine(each.name) && !isStele(each.name));
			buildFrames(w, rest.filter((each) => !MODERN.test(each.name)), [], frame);
			for (const each of rest.filter((item) => MODERN.test(item.name) && item.p.length >= 6)) plainBlock(w, rectOf(each.p, frame));
		}
	};
}
function buildBySuffix(id, parts) {
	const w = new MeshWriter();
	if (id.endsWith("-wall")) parts.wall(w);
	else if (id.endsWith("-halls")) parts.halls(w);
	else if (id.endsWith("-frames")) parts.frames(w);
	return new Float32Array(w.data);
}
export { bigak, buildBySuffix, centroidOf, earClip, fillPoly, groundOf, insidePoly, jeongjagak, lawn, lowStone, lowWall, plainBlock, pointsOf, royalTomb, slab, terrace, tombZone };
