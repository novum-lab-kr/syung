import { K, MeshWriter } from "./monument_parts.mjs";
import { FINE, MID, ROUGH, buildFrameOutline, buildFrames, buildWallLine, clamp, hall, local, place, rectOf } from "./monuments_hanok.mjs";
// web/city/monuments_palace_kit.mts
var TIMBER_REMAP = {
	[K.red]: K.timber,
	[K.dancheong]: K.timber,
	[K.band]: K.timber,
	[K.wood]: K.timber,
	[K.fascia]: K.timber,
	[K.soffit]: K.timber,
	[K.bracket]: K.timber
};
function faceTo(r, dir = [0, -1]) {
	const options = [{ ...r }, {
		...r,
		ang: r.ang + Math.PI
	}];
	if (Math.abs(r.len - r.wid) < Math.max(r.len, r.wid) * .2) options.push({
		...r,
		ang: r.ang + Math.PI / 2,
		len: r.wid,
		wid: r.len
	}, {
		...r,
		ang: r.ang - Math.PI / 2,
		len: r.wid,
		wid: r.len
	});
	const score = (opt) => Math.sin(opt.ang) * dir[0] - Math.cos(opt.ang) * dir[1];
	return options.reduce((best, opt) => score(opt) > score(best) ? opt : best);
}
var half = (r, margin) => ({
	hx: Math.max(1, r.len / 2 - margin),
	hy: Math.max(1, r.wid / 2 - margin)
});
function buildZoneWall(w, spec) {
	if (!spec.wall) return;
	const ring = spec.ring().map(([lng, lat]) => {
		const [x, y] = local(lng, lat, spec.frame);
		return [
			x,
			y,
			0
		];
	});
	ring.push(ring[0]);
	const gaps = spec.buildings.filter((each) => spec.wall.gaps.includes(each.name)).map((each) => {
		const r = rectOf(each.p, spec.frame), xs = r.pts.map((p) => p[0]), ys = r.pts.map((p) => p[1]);
		return [
			Math.min(...xs) - 2,
			Math.max(...xs) + 2,
			Math.min(...ys) - 2,
			Math.max(...ys) + 2
		];
	});
	buildWallLine(w, ring, (x, y) => gaps.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1) || (spec.wall.skip?.(x, y) ?? false));
}
function pavilion(w, r, roof) {
	if (roof !== void 0) w.remap = { [K.giwa]: roof };
	const { hx, hy } = half(r, .35), bayX = clamp(Math.round(hx * 2 / 2.4), 1, 3), bayY = clamp(Math.round(hy * 2 / 2.4), 1, 3);
	hall(w, {
		hx,
		hy,
		podium: .7,
		body: 2.8,
		rise: clamp((hy + 1.4) * .6, 1.3, 2.6),
		eave: 1.4,
		bays: [bayX, bayY],
		steps: ROUGH,
		hollow: true
	});
	w.remap = null;
}
var gate = (w, r, bays = [3, 2]) => {
	hall(w, {
		...half(r, .8),
		podium: 1.1,
		body: 3.4,
		rise: 3.2,
		eave: 2.1,
		bays,
		steps: MID,
		brackets: true,
		doors: true,
		stair: r.len > 8
	});
};
function mainHall(w, r, spec) {
	const { margin = 1.2, ...rest } = spec;
	hall(w, {
		...half(r, margin),
		podium: 1.4,
		lowPodium: [1, .4],
		body: 4.2,
		rise: 4.4,
		eave: 2.8,
		steps: FINE,
		brackets: true,
		doors: true,
		stair: true,
		gable: .5,
		...rest
	});
}
function buildRichOutline(w, r, post = K.red) {
	const height = 3.2;
	buildFrameOutline(w, r, {
		band: true,
		height
	});
	const pts = r.pts;
	let area2 = 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
		area2 += ax * by - bx * ay;
	}
	const ccw = area2 > 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
		if (len < 1.6) continue;
		const ux = dx / len, uy = dy / len, outX = (ccw ? dy : -dy) / len, outY = (ccw ? -dx : dx) / len, bays = Math.max(1, Math.round(len / 3));
		const along = (t, lift, z) => [
			ax + dx * t + outX * lift,
			ay + dy * t + outY * lift,
			z
		];
		w.quad(along(0, .12, 0), along(1, .12, 0), along(1, .12, .5), along(0, .12, .5), K.granite, [
			outX,
			outY,
			0
		]);
		w.quad(along(0, .1, 2.7), along(1, .1, 2.7), along(1, .1, height), along(0, .1, height), post, [
			outX,
			outY,
			0
		]);
		for (let k = 0; k <= bays; k++) {
			const [x, y] = along(k / bays, .12, 0);
			w.box(x - .13 - Math.abs(uy) * .05, x + .13 + Math.abs(uy) * .05, y - .13 - Math.abs(ux) * .05, y + .13 + Math.abs(ux) * .05, .4, height, post, { bottom: true });
		}
		for (let k = 0; k < bays; k++) {
			const t0 = (k + .2) / bays, t1 = (k + .8) / bays;
			w.quad(along(t0, .07, .9), along(t1, .07, .9), along(t1, .07, 2.5), along(t0, .07, 2.5), K.window, [
				outX,
				outY,
				0
			]);
		}
		const inX = -outX, inY = -outY, depth = 2.7, ridgeZ = 4.9 + .12;
		const [rx0, ry0, rx1, ry1] = [
			ax + inX * depth,
			ay + inY * depth,
			bx + inX * depth,
			by + inY * depth
		];
		w.quad([
			rx0 - inX * .15 - ux * .2,
			ry0 - inY * .15 - uy * .2,
			ridgeZ
		], [
			rx1 - inX * .15 + ux * .2,
			ry1 - inY * .15 + uy * .2,
			ridgeZ
		], [
			rx1 + inX * .15 + ux * .2,
			ry1 + inY * .15 + uy * .2,
			ridgeZ
		], [
			rx0 + inX * .15 - ux * .2,
			ry0 + inY * .15 - uy * .2,
			ridgeZ
		], K.ridge, [
			0,
			0,
			1
		]);
	}
}
function wingsOf(r, passes = 3) {
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
	for (let pass = 0; pass < passes; pass++) {
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
function timberHall(w, r, bays, margin = .5) {
	w.remap = TIMBER_REMAP;
	const { hx, hy } = half(r, margin);
	hall(w, {
		hx,
		hy,
		podium: .8,
		lowPodium: [.7],
		body: 3.2,
		rise: 3,
		eave: 2,
		bays,
		steps: FINE,
		doors: true,
		stair: r.len > 8,
		gable: .45
	});
	w.remap = null;
}
function buildTimberHouse(w, outline, face = [0, -1], passes = 3) {
	for (const wing of wingsOf(outline, passes)) {
		const r = faceTo(wing, face);
		place(w, r);
		w.remap = TIMBER_REMAP;
		const { hx, hy } = half(r, .5);
		hall(w, {
			hx,
			hy,
			podium: .8,
			lowPodium: [.7],
			body: 3.2,
			rise: 3,
			eave: 2,
			bays: [clamp(Math.round(hx * 2 / 3), 1, 6), clamp(Math.round(hy * 2 / 3), 1, 2)],
			steps: FINE,
			doors: true,
			stair: r.len > 8,
			gable: .45
		});
		w.remap = null;
		w.xf = null;
	}
}
var real = (list) => list.filter((each) => each.p.length >= 6);
function buildZoneHalls(w, spec) {
	const timber = spec.timber ?? [];
	for (const each of real(spec.buildings).filter((item) => timber.includes(item.name))) buildTimberHouse(w, rectOf(each.p, spec.frame), spec.facing?.[each.name]);
	const modern = spec.modern ?? {};
	for (const each of real(spec.buildings).filter((item) => spec.dedicated[item.name] || modern[item.name])) {
		const r = faceTo(rectOf(each.p, spec.frame), spec.facing?.[each.name]);
		place(w, r);
		(spec.dedicated[each.name] ?? modern[each.name])(w, r);
		w.xf = null;
	}
	for (const each of real(spec.buildings).filter((item) => spec.wings?.[item.name])) for (const wing of wingsOf(rectOf(each.p, spec.frame), spec.wingPasses ?? 4)) {
		const r = faceTo(wing, spec.facing?.[each.name]);
		place(w, r);
		spec.wings[each.name](w, r);
		w.xf = null;
	}
}
function buildZoneFrames(w, spec) {
	const outlineOnly = spec.outlineOnly ?? [], named = [
		...Object.keys(spec.dedicated),
		...Object.keys(spec.modern ?? {}),
		...Object.keys(spec.wings ?? {}),
		...spec.timber ?? []
	];
	const rich = (ww, r) => buildRichOutline(ww, r, spec.timberRich?.(r) ? K.timber : K.red);
	buildFrames(w, spec.buildings.filter((each) => !outlineOnly.includes(each.name)), named, spec.frame, rich, spec.timberRich ? (r) => spec.timberRich(r) ? TIMBER_REMAP : null : void 0);
	for (const each of real(spec.buildings).filter((item) => outlineOnly.includes(item.name))) {
		w.xf = null;
		rich(w, rectOf(each.p, spec.frame));
	}
}
function buildZone(spec, id, suffix) {
	const w = new MeshWriter();
	if (id === suffix.wall) buildZoneWall(w, spec);
	else if (id === suffix.halls) buildZoneHalls(w, spec);
	else if (id === suffix.frames) buildZoneFrames(w, spec);
	return new Float32Array(w.data);
}
export { TIMBER_REMAP, buildRichOutline, buildTimberHouse, buildZone, buildZoneFrames, buildZoneHalls, buildZoneWall, faceTo, gate, half, mainHall, pavilion, timberHall, wingsOf };
