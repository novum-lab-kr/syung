import { toM } from "./life.mjs";
import { K, bandBox, buildBrackets, buildRoof } from "./monument_parts.mjs";
import { matbaeRoof } from "./monument_matbae.mjs";
// web/city/monuments_hanok.mts
var frameOf = (at, origin) => {
	const [ox, oy] = toM(at[0], at[1]);
	return {
		origin,
		ox,
		oy
	};
};
var local = (lng, lat, frame) => {
	const [mx, my] = toM(lng, lat);
	return [mx - frame.ox, -(my - frame.oy)];
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
			{
				const rz0 = WALL.ridgeZ - .02, rz1 = WALL.ridgeZ + .2, hw = .2, ext = .15;
				const a = [px - ux * ext, py - uy * ext], b = [qx + ux * ext, qy + uy * ext];
				const c = (point, sign, z) => [
					point[0] + nx * hw * sign,
					point[1] + ny * hw * sign,
					z
				];
				w.quad(c(a, -1, rz1), c(b, -1, rz1), c(b, 1, rz1), c(a, 1, rz1), K.ridge, [
					0,
					0,
					1
				]);
				for (const sign of [-1, 1]) w.quad(c(a, sign, rz0), c(b, sign, rz0), c(b, sign, rz1), c(a, sign, rz1), K.ridge, [
					nx * sign,
					ny * sign,
					0
				]);
				w.quad(c(a, 1, rz0), c(a, -1, rz0), c(a, -1, rz1), c(a, 1, rz1), K.ridge, [
					-ux,
					-uy,
					0
				]);
				w.quad(c(b, -1, rz0), c(b, 1, rz0), c(b, 1, rz1), c(b, -1, rz1), K.ridge, [
					ux,
					uy,
					0
				]);
			}
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
function rectOf(p, frame) {
	const pts = [];
	for (let i = 0; i < p.length; i += 2) pts.push(local(frame.origin[0] + p[i] / 1e6, frame.origin[1] + p[i + 1] / 1e6, frame));
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
	const doorFirst = S.bays[0] <= 3 || S.doorsAll ? 0 : 1, doorLast = S.bays[0] <= 3 || S.doorsAll ? S.bays[0] - 1 : S.bays[0] - 2;
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
		const bay = 2 * hx / S.bays[0], first = S.bays[0] <= 3 || S.doorsAll ? 0 : 1, last = S.bays[0] <= 3 || S.doorsAll ? S.bays[0] - 1 : S.bays[0] - 2;
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
			], S.doorKind ?? K.tunnel, [
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
	if (S.gabled) {
		matbaeRoof(w, {
			hx: S.hx + .45,
			hy: S.hy + .45,
			eave: S.eave,
			z0: top - .25,
			rise: S.rise
		});
		return top - .25 + S.rise;
	}
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
var MID = {
	side: 6,
	slope: 3
};
var ROUGH = {
	side: 3,
	slope: 2
};
function wingsOf(r) {
	const STEP = .3, cosA = Math.cos(r.ang), sinA = Math.sin(r.ang), cols = Math.ceil(r.len / STEP), rows = Math.ceil(r.wid / STEP);
	const inside = (x, y) => {
		let hit = false;
		for (let i = 0, j = r.pts.length - 1; i < r.pts.length; j = i++) {
			const [xi, yi] = r.pts[i], [xj, yj] = r.pts[j];
			if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
		}
		return hit;
	};
	const grid = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (__, col) => {
		const u = (col + .5) * STEP - r.len / 2, v = (row + .5) * STEP - r.wid / 2;
		return inside(r.cx + u * cosA - v * sinA, r.cy + u * sinA + v * cosA);
	}));
	const out = [];
	for (let pass = 0; pass < 3; pass++) {
		const heights = new Array(cols).fill(0);
		let best = {
			area: 0,
			col0: 0,
			col1: 0,
			row0: 0,
			row1: 0
		};
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) heights[col] = grid[row][col] ? heights[col] + 1 : 0;
			for (let col0 = 0; col0 < cols; col0++) {
				let low = Infinity;
				for (let col1 = col0; col1 < cols && heights[col1]; col1++) {
					low = Math.min(low, heights[col1]);
					const area = low * (col1 - col0 + 1);
					if (area > best.area) best = {
						area,
						col0,
						col1,
						row0: row - low + 1,
						row1: row
					};
				}
			}
		}
		const w0 = (best.col1 - best.col0 + 1) * STEP, h0 = (best.row1 - best.row0 + 1) * STEP;
		if (best.area * STEP * STEP < 14 || Math.min(w0, h0) < 3) break;
		const uc = (best.col0 + best.col1 + 1) / 2 * STEP - r.len / 2, vc = (best.row0 + best.row1 + 1) / 2 * STEP - r.wid / 2, tall = h0 > w0;
		out.push({
			cx: r.cx + uc * cosA - vc * sinA,
			cy: r.cy + uc * sinA + vc * cosA,
			len: Math.max(w0, h0),
			wid: Math.min(w0, h0),
			ang: tall ? r.ang + Math.PI / 2 : r.ang,
			fill: 1,
			pts: []
		});
		for (let row = best.row0; row <= best.row1; row++) for (let col = best.col0; col <= best.col1; col++) grid[row][col] = false;
	}
	return out;
}
var isConcave = (pts) => {
	let sign = 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], [cx, cy] = pts[(i + 2) % pts.length], cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
		if (Math.abs(cross) < 1e-6) continue;
		if (sign && Math.sign(cross) !== sign) return true;
		sign = Math.sign(cross);
	}
	return false;
};
function buildFrameOutline(w, r, look = {}) {
	const pts = r.pts, cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length, cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length, wall = look.height ?? 3.4, wallKind = look.wall ?? K.plaster;
	let area2 = 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
		area2 += ax * by - bx * ay;
	}
	const ccw = area2 > 0, small = !look.band && Math.abs(area2) / 2 < 600;
	if (small && isConcave(pts)) {
		const wings = wingsOf(r);
		if (wings.length) {
			for (const wing of wings) {
				place(w, wing);
				const hx = Math.max(1.2, wing.len / 2 - .6), hy = Math.max(1, wing.wid / 2 - .6);
				hall(w, {
					hx,
					hy,
					podium: .6,
					body: 3.2,
					rise: clamp((hy + 1.6) * .55, 1.2, 3.4),
					eave: clamp(hy * .5, .9, 1.8),
					bays: [clamp(Math.round(hx * 2 / 3.3), 1, 9), clamp(Math.round(hy * 2 / 3.3), 1, 3)],
					steps: ROUGH
				});
			}
			w.xf = null;
			return;
		}
	}
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
		], wallKind, [
			dy,
			-dx,
			0
		]);
		if (small) {
			const e = (x, y) => [
				x + (cx - x) * .06,
				y + (cy - y) * .06,
				wall + .5
			];
			w.quad([
				ax,
				ay,
				wall
			], [
				bx,
				by,
				wall
			], e(bx, by), e(ax, ay), K.giwa, [
				dy,
				-dx,
				0
			]);
			w.tri(e(ax, ay), e(bx, by), [
				cx,
				cy,
				wall + 2
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
				wall - .1
			], ridge = (x, y) => [
				x + inx * depth,
				y + iny * depth,
				wall + 1.7
			];
			w.quad(eave(ax, ay), eave(bx, by), ridge(bx, by), ridge(ax, ay), K.giwa, [
				-inx * .4,
				-iny * .4,
				.9
			]);
			w.quad(eave(ax, ay), eave(bx, by), [
				bx - inx * out,
				by - iny * out,
				wall - .35
			], [
				ax - inx * out,
				ay - iny * out,
				wall - .35
			], K.fascia, [
				-inx,
				-iny,
				0
			]);
		}
	}
}
function buildFrames(w, buildings, dedicated, frame, outline = buildFrameOutline, remapFor) {
	for (const b of buildings.filter((each) => !dedicated.includes(each.name) && each.p.length >= 6)) {
		const r = rectOf(b.p, frame);
		if (r.len * r.wid < 10) continue;
		if (r.fill < .78 || r.len * r.wid > 1500) {
			w.xf = null;
			outline(w, r);
			continue;
		}
		place(w, r);
		w.remap = remapFor?.(r) ?? null;
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
		w.remap = null;
	}
	w.xf = null;
}
export { FINE, MID, ROUGH, buildFrameOutline, buildFrames, buildWallLine, clamp, frameOf, hall, local, place, rectOf, wingsOf };
