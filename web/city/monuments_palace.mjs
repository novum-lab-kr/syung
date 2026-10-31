import { MONUMENTS, PALACE_AT, PALACE_ORIGIN, palaceRing } from "./monuments_data.mjs";
import { toM } from "./life.mjs";
import { K, bandBox, buildBrackets, buildRoof } from "./monument_parts.mjs";
import { PALACE_BUILDINGS } from "./monuments_gyeongbok_data.mjs";
// web/city/monuments_palace.mts
var [OX, OY] = toM(PALACE_AT[0], PALACE_AT[1]);
var local = (lng, lat) => {
	const [mx, my] = toM(lng, lat);
	return [mx - OX, -(my - OY)];
};
var WALL_BAY = 6;
var WALL = {
	stoneTop: 1.9,
	brickTop: 3.7,
	stoneHalf: 1,
	brickHalf: .85,
	eaveHalf: 1.3,
	eaveZ: 3.7,
	ridgeZ: 4.6
};
function buildWallLine(w, line, skip) {
	let travelled = 0;
	for (let i = 0; i + 1 < line.length; i++) {
		const [ax, ay] = line[i], [bx, by] = line[i + 1], len = Math.hypot(bx - ax, by - ay);
		if (len < .05) continue;
		const bays = Math.max(1, Math.round(len / WALL_BAY)), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
		for (let k = 0; k < bays; k++) {
			const t0 = k / bays, t1 = (k + 1) / bays, overlap = .04;
			const px = ax + (bx - ax) * t0 - ux * overlap, py = ay + (by - ay) * t0 - uy * overlap, qx = ax + (bx - ax) * t1 + ux * overlap, qy = ay + (by - ay) * t1 + uy * overlap;
			const m0 = travelled + len * t0, m1 = travelled + len * t1;
			if (skip((px + qx) / 2, (py + qy) / 2)) continue;
			const side = (half, z0, z1, kind) => {
				for (const sign of [-1, 1]) {
					const hint = [
						nx * sign,
						ny * sign,
						0
					];
					w.quad([
						px + nx * half * sign,
						py + ny * half * sign,
						z0
					], [
						qx + nx * half * sign,
						qy + ny * half * sign,
						z0
					], [
						qx + nx * half * sign,
						qy + ny * half * sign,
						z1
					], [
						px + nx * half * sign,
						py + ny * half * sign,
						z1
					], kind, hint, m0, m1, m1, m0);
				}
			};
			const top = (half, z, kind) => w.quad([
				px - nx * half,
				py - ny * half,
				z
			], [
				qx - nx * half,
				qy - ny * half,
				z
			], [
				qx + nx * half,
				qy + ny * half,
				z
			], [
				px + nx * half,
				py + ny * half,
				z
			], kind, [
				0,
				0,
				1
			], m0, m1, m1, m0);
			side(WALL.stoneHalf, 0, WALL.stoneTop, K.granite);
			top(WALL.stoneHalf, WALL.stoneTop, K.granite);
			side(WALL.brickHalf, WALL.stoneTop, WALL.brickTop, K.brick);
			for (const sign of [-1, 1]) {
				const eaveX = (x, y) => [x + nx * WALL.eaveHalf * sign, y + ny * WALL.eaveHalf * sign];
				const [e0x, e0y] = eaveX(px, py), [e1x, e1y] = eaveX(qx, qy);
				w.quad([
					e0x,
					e0y,
					WALL.eaveZ
				], [
					e1x,
					e1y,
					WALL.eaveZ
				], [
					qx,
					qy,
					WALL.ridgeZ
				], [
					px,
					py,
					WALL.ridgeZ
				], K.giwa, [
					nx * sign * .55,
					ny * sign * .55,
					.83
				], m0, m1, m1, m0);
				w.quad([
					e0x,
					e0y,
					WALL.eaveZ - .22
				], [
					e1x,
					e1y,
					WALL.eaveZ - .22
				], [
					e1x,
					e1y,
					WALL.eaveZ
				], [
					e0x,
					e0y,
					WALL.eaveZ
				], K.fascia, [
					nx * sign,
					ny * sign,
					0
				], m0, m1, m1, m0);
			}
			const rx = ux * .2, ry = uy * .2;
			w.box(Math.min(px, qx) - Math.abs(rx) - .15, Math.max(px, qx) + Math.abs(rx) + .15, Math.min(py, qy) - Math.abs(ry) - .15, Math.max(py, qy) + Math.abs(ry) + .15, WALL.ridgeZ - .02, WALL.ridgeZ + .2, K.ridge, { bottom: true });
			w.quad([
				px - nx * WALL.eaveHalf,
				py - ny * WALL.eaveHalf,
				WALL.eaveZ - .22
			], [
				px + nx * WALL.eaveHalf,
				py + ny * WALL.eaveHalf,
				WALL.eaveZ - .22
			], [
				px + nx * WALL.eaveHalf,
				py + ny * WALL.eaveHalf,
				WALL.eaveZ
			], [
				px - nx * WALL.eaveHalf,
				py - ny * WALL.eaveHalf,
				WALL.eaveZ
			], K.fascia, [
				-ux,
				-uy,
				0
			]);
		}
		travelled += len;
	}
}
var WALL_GAPS = ["건춘문", "신무문"];
function buildPalaceWall(w) {
	const ring = palaceRing().map(([lng, lat]) => {
		const [x, y] = local(lng, lat);
		return [
			x,
			y,
			0
		];
	});
	ring.push(ring[0]);
	const [gx, gy] = local(MONUMENTS[0].lngLat[0], MONUMENTS[0].lngLat[1]);
	const gaps = PALACE_BUILDINGS.filter((b) => WALL_GAPS.includes(b.name)).map((b) => {
		const xs = [], ys = [];
		for (let i = 0; i < b.p.length; i += 2) {
			const [x, y] = local(PALACE_ORIGIN[0] + b.p[i] / 1e6, PALACE_ORIGIN[1] + b.p[i + 1] / 1e6);
			xs.push(x);
			ys.push(y);
		}
		return [
			Math.min(...xs) - 2,
			Math.max(...xs) + 2,
			Math.min(...ys) - 2,
			Math.max(...ys) + 2
		];
	});
	const skip = (x, y) => Math.abs(x - gx) < 17 && Math.abs(y - gy) < 9 || gaps.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
	buildWallLine(w, ring, skip);
}
function rectOf(p) {
	const pts = [];
	for (let i = 0; i < p.length; i += 2) pts.push(local(PALACE_ORIGIN[0] + p[i] / 1e6, PALACE_ORIGIN[1] + p[i + 1] / 1e6));
	let area = 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
		area += ax * by - bx * ay;
	}
	area = Math.abs(area) / 2;
	let best = {
		size: Infinity,
		cx: 0,
		cy: 0,
		len: 0,
		wid: 0,
		ang: 0
	};
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], theta = Math.atan2(by - ay, bx - ax), cos = Math.cos(theta), sin = Math.sin(theta);
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
		for (const [x, y] of pts) {
			const u = x * cos + y * sin, v = -x * sin + y * cos;
			x0 = Math.min(x0, u);
			x1 = Math.max(x1, u);
			y0 = Math.min(y0, v);
			y1 = Math.max(y1, v);
		}
		if ((x1 - x0) * (y1 - y0) < best.size) {
			const mu = (x0 + x1) / 2, mv = (y0 + y1) / 2, long = x1 - x0 >= y1 - y0;
			best = {
				size: (x1 - x0) * (y1 - y0),
				cx: mu * cos - mv * sin,
				cy: mu * sin + mv * cos,
				len: Math.max(x1 - x0, y1 - y0),
				wid: Math.min(x1 - x0, y1 - y0),
				ang: long ? theta : theta + Math.PI / 2
			};
		}
	}
	return {
		cx: best.cx,
		cy: best.cy,
		len: best.len,
		wid: best.wid,
		ang: best.ang,
		fill: area / best.size,
		pts
	};
}
var place = (w, r) => {
	w.xf = {
		x: r.cx,
		y: r.cy,
		cos: Math.cos(r.ang),
		sin: Math.sin(r.ang)
	};
};
var BAND = 1.1;
function column(w, x, y, z0, z1, half = .26) {
	w.box(x - half, x + half, y - half, y + half, z0, z1, K.red, {
		bottom: true,
		top: true
	});
}
function windowPanes(w, S, hx, hy, base, top) {
	const z0 = base + .85, z1 = top - .6, off = .14;
	if (z1 - z0 < .8) return;
	const doorFirst = S.bays[0] <= 3 ? 0 : 1, doorLast = S.bays[0] <= 3 ? S.bays[0] - 1 : S.bays[0] - 2;
	const bayX = 2 * hx / S.bays[0], bayY = 2 * hy / S.bays[1];
	for (let i = 0; i < S.bays[0]; i++) {
		const cx = -hx + bayX * (i + .5), half = bayX * .31;
		if (!(S.doors && i >= doorFirst && i <= doorLast)) w.quad([
			cx - half,
			-hy + off,
			z0
		], [
			cx + half,
			-hy + off,
			z0
		], [
			cx + half,
			-hy + off,
			z1
		], [
			cx - half,
			-hy + off,
			z1
		], K.window, [
			0,
			-1,
			0
		]);
		w.quad([
			cx + half,
			hy - off,
			z0
		], [
			cx - half,
			hy - off,
			z0
		], [
			cx - half,
			hy - off,
			z1
		], [
			cx + half,
			hy - off,
			z1
		], K.window, [
			0,
			1,
			0
		]);
	}
	for (let j = 0; j < S.bays[1]; j++) {
		const cy = -hy + bayY * (j + .5), half = bayY * .31;
		for (const side of [-1, 1]) w.quad([
			side * (hx - off),
			cy - half,
			z0
		], [
			side * (hx - off),
			cy + half,
			z0
		], [
			side * (hx - off),
			cy + half,
			z1
		], [
			side * (hx - off),
			cy - half,
			z1
		], K.window, [
			side,
			0,
			0
		]);
	}
}
function storey(w, S, hx, hy, base, body, open = false) {
	const top = base + body;
	if (S.hollow) w.quad([
		-hx,
		-hy,
		base
	], [
		hx,
		-hy,
		base
	], [
		hx,
		hy,
		base
	], [
		-hx,
		hy,
		base
	], K.wood, [
		0,
		0,
		1
	]);
	else w.box(-hx + .2, hx - .2, -hy + .2, hy - .2, base, top, open ? K.wood : K.plaster, { top: true });
	for (let i = 0; i <= S.bays[0]; i++) {
		const x = -hx + 2 * hx * i / S.bays[0];
		for (const y of [-hy, hy]) column(w, x, y, base, top);
	}
	for (let i = 1; i < S.bays[1]; i++) {
		const y = -hy + 2 * hy * i / S.bays[1];
		for (const x of [-hx, hx]) column(w, x, y, base, top);
	}
	if (!S.hollow && !open) windowPanes(w, S, hx, hy, base, top);
	if (S.doors) {
		const bay = 2 * hx / S.bays[0], first = S.bays[0] <= 3 ? 0 : 1, last = S.bays[0] <= 3 ? S.bays[0] - 1 : S.bays[0] - 2;
		for (let i = first; i <= last; i++) {
			const cx = -hx + bay * (i + .5);
			w.quad([
				cx - bay * .32,
				-hy - .03,
				base + .1
			], [
				cx + bay * .32,
				-hy - .03,
				base + .1
			], [
				cx + bay * .32,
				-hy - .03,
				top - .35
			], [
				cx - bay * .32,
				-hy - .03,
				top - .35
			], K.tunnel, [
				0,
				-1,
				0
			]);
		}
	}
	bandBox(w, hx + .45, hy + .45, top - .4, top, K.dancheong, 0, .28);
	bandBox(w, hx + .45, hy + .45, top, top + BAND, K.dancheong, .3, 1);
	if (S.brackets) buildBrackets(w, hx + .45, hy + .45, top + .1);
	return top + BAND;
}
function podiumOf(w, S) {
	const out = S.lowPodium ?? [.9], steps = out.length;
	out.forEach((margin, i) => w.box(-S.hx - margin, S.hx + margin, -S.hy - margin, S.hy + margin, S.podium * i / steps, S.podium * (i + 1) / steps, K.granite, { bottom: true }));
	if (S.stair) {
		const margin = out[0], width = Math.min(3.4, S.hx * .35);
		for (let k = 0; k < 3; k++) w.box(-width, width, -S.hy - margin - (3 - k) * .6, -S.hy - margin + .01, 0, S.podium * (k + 1) / 3, K.trim, { bottom: true });
	}
}
function roofCap(w, hx, hy, z) {
	w.quad([
		-hx,
		-hy,
		z
	], [
		hx,
		-hy,
		z
	], [
		hx,
		hy,
		z
	], [
		-hx,
		hy,
		z
	], K.giwa, [
		0,
		0,
		1
	]);
}
function roofOf(S, hx, hy, z0, rise, innerHx, innerHy) {
	const outerX = hx + S.eave, outerY = hy + S.eave, lift = S.lift ?? Math.min(1.1, S.eave * .45 + .2);
	if (innerHx !== void 0 && innerHy !== void 0) return {
		hx: outerX,
		hy: outerY,
		ix: innerHx,
		iy: innerHy,
		z0,
		rise,
		lift,
		flare: Math.min(.9, S.eave * .4),
		steps: S.steps
	};
	if (S.ridgeless) {
		const iy = outerY * .3;
		return {
			hx: outerX,
			hy: outerY,
			ix: Math.max(.5, outerX - (outerY - iy)),
			iy,
			z0,
			rise,
			lift,
			flare: Math.min(.9, S.eave * .4),
			steps: S.steps
		};
	}
	const ix = S.ridgeFrac ? Math.max(.5, outerX * S.ridgeFrac) : Math.max(.5, outerX - outerY);
	if (S.gable) return {
		hx: outerX,
		hy: outerY,
		ix,
		iy: outerY * (1 - S.gable),
		z0,
		rise: rise * S.gable,
		lift,
		flare: Math.min(.9, S.eave * .4),
		steps: S.steps
	};
	return {
		hx: outerX,
		hy: outerY,
		ix,
		iy: 0,
		z0,
		rise,
		lift,
		flare: Math.min(.9, S.eave * .4),
		steps: S.steps
	};
}
function gableTop(w, skirt, fullRise) {
	const { ix, iy } = skirt, zs = skirt.z0 + skirt.rise, zTop = skirt.z0 + fullRise, over = .55;
	for (const side of [-1, 1]) {
		w.quad([
			-ix - over,
			side * (iy + over * .5),
			zs - over * .3
		], [
			ix + over,
			side * (iy + over * .5),
			zs - over * .3
		], [
			ix + over,
			0,
			zTop
		], [
			-ix - over,
			0,
			zTop
		], K.giwa, [
			0,
			side * (zTop - zs),
			iy
		]);
		for (const end of [-1, 1]) w.tri([
			end * ix,
			-iy,
			zs
		], [
			end * ix,
			iy,
			zs
		], [
			end * ix,
			0,
			zTop
		], K.plaster, [
			end,
			0,
			0
		]);
	}
	w.box(-ix - over - .1, ix + over + .1, -.42, .42, zTop - .12, zTop + .6, K.ridge, { bottom: true });
	for (const end of [-1, 1]) for (const side of [-1, 1]) {
		const x = end * (ix + over);
		w.quad([
			x,
			side * (iy + over * .5) - .22,
			zs - over * .3
		], [
			x,
			side * (iy + over * .5) + .22,
			zs - over * .3
		], [
			x,
			side * .22,
			zTop + .1
		], [
			x,
			side * -.22,
			zTop + .1
		], K.ridge, [
			end,
			0,
			0
		]);
	}
}
function hall(w, S) {
	podiumOf(w, S);
	const base = S.podium;
	if (S.tiers === 2) {
		const topLow = storey(w, S, S.hx, S.hy, base, S.body), upperHx = S.hx * (S.upper?.[0] ?? .86), upperHy = S.hy * (S.upper?.[1] ?? .8), roofZ = topLow - .25, lowRise = S.rise * .38;
		buildRoof(w, roofOf(S, S.hx + .45, S.hy + .45, roofZ, lowRise, upperHx + .6, upperHy + .6), {
			innerZ: topLow - .2,
			innerHx: S.hx + .45,
			innerHy: S.hy + .45
		});
		const upperBase = roofZ + lowRise - .6, top = storey(w, {
			bays: S.bays,
			brackets: S.brackets
		}, upperHx, upperHy, upperBase, S.body * .85, true);
		const upperRoof = roofOf(S, upperHx + .45, upperHy + .45, top - .25, S.upperRise ?? S.rise);
		buildRoof(w, upperRoof, {
			innerZ: top - .2,
			innerHx: upperHx + .45,
			innerHy: upperHy + .45
		});
		if (S.gable) gableTop(w, upperRoof, S.upperRise ?? S.rise);
		if (S.ridgeless) roofCap(w, upperRoof.ix, upperRoof.iy, top - .25 + S.rise);
		return top - .25 + (S.upperRise ?? S.rise);
	}
	const top = storey(w, S, S.hx, S.hy, base, S.body);
	const roof = roofOf(S, S.hx + .45, S.hy + .45, top - .25, S.rise);
	buildRoof(w, roof, {
		innerZ: top - .2,
		innerHx: S.hx + .45,
		innerHy: S.hy + .45
	});
	if (S.gable) gableTop(w, roof, S.rise);
	if (S.ridgeless) roofCap(w, roof.ix, roof.iy, top - .25 + S.rise);
	return top - .25 + S.rise;
}
var clamp = (value, min, max) => Math.max(min, Math.min(max, value));
var FINE = {
	side: 12,
	slope: 4
};
var ROUGH = {
	side: 3,
	slope: 2
};
function buildGeunjeongjeon(w, r) {
	const hx = r.len / 2, hy = r.wid / 2;
	w.box(-hx - 6, hx + 6, -hy - 6, hy + 6, 0, 1.1, K.granite, { bottom: true });
	w.quad([
		-hx - 6,
		-hy - 6,
		1.1
	], [
		hx + 6,
		-hy - 6,
		1.1
	], [
		hx + 6,
		hy + 6,
		1.1
	], [
		-hx - 6,
		hy + 6,
		1.1
	], K.deck, [
		0,
		0,
		1
	]);
	const stairW = 4;
	for (let k = 0; k < 4; k++) w.box(-4, stairW, -hy - 6 - (4 - k) * .7, -hy - 6 + .01, 0, 1.1 * (k + 1) / 4 + (k > 2 ? 0 : 0), K.trim, { bottom: true });
	const upper = 2.4;
	w.box(-hx, hx, -hy, hy, 1.1, upper, K.granite, { bottom: true });
	w.quad([
		-hx,
		-hy,
		upper
	], [
		hx,
		-hy,
		upper
	], [
		hx,
		hy,
		upper
	], [
		-hx,
		hy,
		upper
	], K.deck, [
		0,
		0,
		1
	]);
	const stair = 3.4;
	for (let k = 0; k < 3; k++) w.box(-3.4, stair, -hy - (3 - k) * .6, -hy + .01, 1.1, 1.1 + 1.2999999999999998 * (k + 1) / 3, K.trim, { bottom: true });
	const S = {
		hx: hx - 2.5,
		hy: hy - 2.5,
		podium: 0,
		body: 5.2,
		rise: 5.6,
		eave: 3.4,
		bays: [5, 5],
		steps: FINE,
		tiers: 2,
		brackets: true,
		doors: true,
		lift: 1.6,
		upper: [.95, .93],
		upperRise: 3.8,
		ridgeFrac: .66,
		gable: .55
	};
	w.dz = upper;
	hall(w, S);
	w.dz = 0;
	const rail = (ax, ay, bx, by) => {
		const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2.6));
		for (let i = 0; i <= n; i++) {
			const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
			w.box(x - .16, x + .16, y - .16, y + .16, upper, 3.45, K.trim, { bottom: true });
		}
	};
	rail(-hx + .3, -hy + .3, -4.2, -hy + .3);
	rail(4.2, -hy + .3, hx - .3, -hy + .3);
	rail(-hx + .3, hy - .3, hx - .3, hy - .3);
	rail(-hx + .3, -hy + .3, -hx + .3, hy - .3);
	rail(hx - .3, -hy + .3, hx - .3, hy - .3);
}
function buildGyeonghoeru(w, r) {
	const hx = r.len / 2, hy = r.wid / 2, podium = 1.3;
	w.box(-hx, hx, -hy, hy, 0, podium, K.granite, { bottom: true });
	const bx = Math.max(10, hx - 3.5), by = Math.min(bx * 5 / 7, hy - 2.5), floorZ = 6.5;
	for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
		const x = -bx + 2 * bx * i / 7, y = -by + 2 * by * j / 5;
		if (i === 0 || i === 7 || j === 0 || j === 5) w.box(x - .42, x + .42, y - .42, y + .42, podium, floorZ, K.granite, {
			bottom: true,
			top: true
		});
		else w.prism(x, y, .42, podium, floorZ, K.granite, 8);
	}
	w.box(-bx - .9, bx + .9, -by - .9, by + .9, floorZ, 6.95, K.wood, { bottom: true });
	const S = {
		hx: bx,
		hy: by,
		podium: 0,
		body: 5.2,
		rise: 5.8,
		eave: 3.2,
		bays: [7, 5],
		steps: FINE,
		brackets: true,
		hollow: true,
		ridgeFrac: .46,
		lift: 1.3,
		gable: .5
	};
	w.dz = 6.95;
	hall(w, S);
	w.dz = 0;
	const redRail = (ax, ay, bx2, by2) => {
		const n = Math.max(1, Math.round(Math.hypot(bx2 - ax, by2 - ay) / 3.4));
		for (let i = 0; i < n; i++) {
			const x0 = ax + (bx2 - ax) * i / n, y0 = ay + (by2 - ay) * i / n, x1 = ax + (bx2 - ax) * (i + 1) / n, y1 = ay + (by2 - ay) * (i + 1) / n;
			w.box(Math.min(x0, x1) - .07, Math.max(x0, x1) + .07, Math.min(y0, y1) - .07, Math.max(y0, y1) + .07, 7.73, 7.87, K.red, { bottom: true });
			w.box(Math.min(x0, x1) - .05, Math.max(x0, x1) + .05, Math.min(y0, y1) - .05, Math.max(y0, y1) + .05, 7.25, 7.37, K.red, { bottom: true });
		}
	};
	const rx = bx + .75, ry = by + .75;
	redRail(-rx, -ry, rx, -ry);
	redRail(-rx, ry, rx, ry);
	redRail(-rx, -ry, -rx, ry);
	redRail(rx, -ry, rx, ry);
	const stoneRail = (ax, ay, bx2, by2) => {
		const n = Math.max(1, Math.round(Math.hypot(bx2 - ax, by2 - ay) / 2.6));
		for (let i = 0; i <= n; i++) {
			const x = ax + (bx2 - ax) * i / n, y = ay + (by2 - ay) * i / n;
			w.box(x - .15, x + .15, y - .15, y + .15, podium, 2.15, K.trim, { bottom: true });
		}
	};
	const sx = hx - .4, sy = hy - .4;
	stoneRail(-sx, -sy, sx, -sy);
	stoneRail(-sx, sy, sx, sy);
	stoneRail(-sx, -sy, -sx, sy);
	stoneRail(sx, -sy, sx, sy);
}
function buildHyangwonjeong(w, r) {
	const radius = clamp(r.wid / 2 / Math.cos(Math.PI / 6) * .92, 3.2, 6), stone = .45, floor = 1.05;
	w.prism(0, 0, radius + 1.6, 0, stone, K.granite, 6);
	w.prism(0, 0, radius + .5, stone, floor, K.wood, 6);
	const hexPts = (rad, z) => Array.from({ length: 6 }, (_, k) => [
		Math.cos(Math.PI / 3 * k) * rad,
		Math.sin(Math.PI / 3 * k) * rad,
		z
	]);
	const wall = (rad, z0, z1, kind) => {
		const lo = hexPts(rad, z0), hi = hexPts(rad, z1);
		for (let k = 0; k < 6; k++) {
			const k2 = (k + 1) % 6, mid = Math.PI / 3 * (k + .5);
			w.quad(lo[k], lo[k2], hi[k2], hi[k], kind, [
				Math.cos(mid),
				Math.sin(mid),
				0
			]);
		}
	};
	const column = (rad, z0, z1) => hexPts(rad, 0).forEach((p) => w.box(p[0] - .22, p[0] + .22, p[1] - .22, p[1] + .22, z0, z1, K.red, {
		bottom: true,
		top: true
	}));
	const roof = (rad, z0, rise, lift) => {
		const RINGS = 5, ring = (t) => {
			const pts = [];
			for (let k = 0; k < 6; k++) {
				const a0 = Math.PI / 3 * k, a1 = Math.PI / 3 * (k + 1), scale = 1 - t, z = z0 + rise * t ** 1.35;
				pts.push([
					Math.cos(a0) * rad * 1.05 * scale,
					Math.sin(a0) * rad * 1.05 * scale,
					z + lift * (1 - t) ** 1.6
				]);
				pts.push([
					(Math.cos(a0) + Math.cos(a1)) / 2 * rad * scale,
					(Math.sin(a0) + Math.sin(a1)) / 2 * rad * scale,
					z
				]);
			}
			return pts;
		};
		for (let i = 0; i < RINGS; i++) {
			const lo = ring(i / RINGS), hi = ring((i + 1) / RINGS);
			for (let j = 0; j < 12; j++) {
				const j2 = (j + 1) % 12;
				w.quad(lo[j], lo[j2], hi[j2], hi[j], K.giwa, [
					0,
					0,
					1
				], j * 1.2, (j + 1) * 1.2, (j + 1) * 1.2, j * 1.2);
			}
		}
		const eave = ring(0);
		for (let j = 0; j < 12; j++) {
			const j2 = (j + 1) % 12, a = eave[j], b = eave[j2];
			w.quad(a, b, [
				b[0],
				b[1],
				b[2] - .32
			], [
				a[0],
				a[1],
				a[2] - .32
			], K.fascia, [
				(a[0] + b[0]) / 2,
				(a[1] + b[1]) / 2,
				0
			], j * 1.2, (j + 1) * 1.2, (j + 1) * 1.2, j * 1.2);
			w.tri([
				0,
				0,
				z0 - .3
			], [
				a[0],
				a[1],
				a[2] - .32
			], [
				b[0],
				b[1],
				b[2] - .32
			], K.soffit, [
				0,
				0,
				-1
			]);
		}
	};
	wall(radius, floor, 4.45, K.wood);
	column(radius, floor, 4.45);
	const balR = radius + .9;
	w.prism(0, 0, balR, 4.3, 4.57, K.wood, 6);
	const rails = hexPts(balR - .08, 0);
	for (let k = 0; k < 6; k++) {
		const a = rails[k], b = rails[(k + 1) % 6], mid = [
			(a[0] + b[0]) / 2,
			(a[1] + b[1]) / 2,
			0
		];
		w.quad([
			a[0],
			a[1],
			5.2
		], [
			b[0],
			b[1],
			5.2
		], [
			b[0],
			b[1],
			5.3500000000000005
		], [
			a[0],
			a[1],
			5.3500000000000005
		], K.red, mid);
		w.quad([
			a[0],
			a[1],
			4.75
		], [
			b[0],
			b[1],
			4.75
		], [
			b[0],
			b[1],
			4.87
		], [
			a[0],
			a[1],
			4.87
		], K.red, mid);
		w.box(a[0] - .1, a[0] + .1, a[1] - .1, a[1] + .1, 4.57, 5.3500000000000005, K.red, { bottom: true });
	}
	const r2 = radius * .82, z2 = 4.57;
	wall(r2, z2, 7.57, K.wood);
	column(r2, z2, 7.57);
	roof(r2 + 1.8, 7.57, 3.2, .55);
	w.prism(0, 0, .28, 10.67, 11.07, K.gilt, 8);
	w.frustum(0, 0, .22, .22, 11.07, .05, .05, 12.17, K.gilt);
}
var DEDICATED = {
	근정전: buildGeunjeongjeon,
	경회루: buildGyeonghoeru,
	향원정: buildHyangwonjeong,
	사정전: (w, r) => {
		hall(w, {
			hx: r.len / 2 - 1,
			hy: r.wid / 2 - 1,
			podium: 1.5,
			lowPodium: [
				1.8,
				1.2,
				.6
			],
			body: 4.4,
			rise: 4.3,
			eave: 2.8,
			bays: [5, 3],
			steps: FINE,
			brackets: true,
			doors: true,
			stair: true
		});
	},
	강녕전: (w, r) => {
		hall(w, {
			hx: r.len / 2 - 1,
			hy: r.wid / 2 - 1,
			podium: 1.2,
			lowPodium: [1.2, .6],
			body: 4,
			rise: 3.6,
			eave: 2.6,
			bays: [7, 3],
			steps: FINE,
			ridgeless: true,
			doors: true,
			stair: true
		});
	},
	교태전: (w, r) => {
		hall(w, {
			hx: r.len / 2 - 1,
			hy: r.wid / 2 - 1,
			podium: 1.2,
			lowPodium: [1.2, .6],
			body: 3.8,
			rise: 3.4,
			eave: 2.4,
			bays: [5, 3],
			steps: FINE,
			ridgeless: true,
			doors: true,
			stair: true
		});
	},
	흥례문: (w, r) => {
		hall(w, {
			hx: Math.min(r.len / 2, 12) - .5,
			hy: Math.min(r.wid / 2, 6) - .5,
			podium: 1.3,
			body: 3.6,
			rise: 4,
			eave: 2.4,
			bays: [3, 2],
			steps: FINE,
			tiers: 2,
			brackets: true,
			doors: true,
			stair: true
		});
	},
	근정문: (w, r) => {
		hall(w, {
			hx: Math.min(r.len / 2, 10) - .5,
			hy: Math.min(r.wid / 2, 5.5) - .5,
			podium: 1.3,
			body: 3.4,
			rise: 3.8,
			eave: 2.3,
			bays: [3, 2],
			steps: FINE,
			tiers: 2,
			brackets: true,
			doors: true,
			stair: true
		});
	}
};
var rects = (names, keep) => PALACE_BUILDINGS.filter((b) => names.includes(b.name) === keep && b.p.length >= 6);
function buildPalaceHalls(w) {
	for (const b of rects(Object.keys(DEDICATED), true)) {
		const r = rectOf(b.p);
		place(w, r);
		DEDICATED[b.name](w, r);
	}
	w.xf = null;
}
function buildFrameOutline(w, r) {
	const pts = r.pts, cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length, cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length, wall = 3.4;
	let area2 = 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
		area2 += ax * by - bx * ay;
	}
	const ccw = area2 > 0, small = Math.abs(area2) / 2 < 600;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
		w.quad([
			ax,
			ay,
			0
		], [
			bx,
			by,
			0
		], [
			bx,
			by,
			wall
		], [
			ax,
			ay,
			wall
		], K.plaster, [
			dy,
			-dx,
			0
		]);
		if (small) {
			const e = (x, y) => [
				x + (cx - x) * .06,
				y + (cy - y) * .06,
				3.9
			];
			w.quad([
				ax,
				ay,
				wall
			], [
				bx,
				by,
				wall
			], e(bx, by), e(ax, ay), K.fascia, [
				dy,
				-dx,
				0
			]);
			w.tri(e(ax, ay), e(bx, by), [
				cx,
				cy,
				5.4
			], K.giwa, [
				0,
				0,
				1
			]);
		} else {
			const inx = (ccw ? -dy : dy) / len, iny = (ccw ? dx : -dx) / len, depth = 2.7, out = .9;
			const eave = (x, y) => [
				x - inx * out,
				y - iny * out,
				3.3
			], ridge = (x, y) => [
				x + inx * depth,
				y + iny * depth,
				5.1
			];
			w.quad(eave(ax, ay), eave(bx, by), ridge(bx, by), ridge(ax, ay), K.giwa, [
				-inx * .4,
				-iny * .4,
				.9
			]);
			w.quad(eave(ax, ay), eave(bx, by), [
				bx - inx * out,
				by - iny * out,
				3.05
			], [
				ax - inx * out,
				ay - iny * out,
				3.05
			], K.fascia, [
				-inx,
				-iny,
				0
			]);
		}
	}
}
function buildPalaceFrames(w) {
	for (const b of rects(Object.keys(DEDICATED), false)) {
		const r = rectOf(b.p);
		if (r.len * r.wid < 10) continue;
		if (r.fill < .78 || r.len * r.wid > 1500) {
			w.xf = null;
			buildFrameOutline(w, r);
			continue;
		}
		place(w, r);
		const hx = Math.max(1.2, r.len / 2 - 1), hy = Math.max(1, r.wid / 2 - 1), bay = clamp(Math.round(hx * 2 / 3.3), 1, 9);
		hall(w, {
			hx,
			hy,
			podium: .6,
			body: 3.2,
			rise: clamp((hy + 1.6) * .55, 1.2, 3.4),
			eave: clamp(hy * .5, .9, 1.8),
			bays: [bay, clamp(Math.round(hy * 2 / 3.3), 1, 3)],
			steps: ROUGH
		});
	}
	w.xf = null;
}
export { buildPalaceFrames, buildPalaceHalls, buildPalaceWall };
