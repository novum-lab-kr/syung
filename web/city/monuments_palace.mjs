import { MONUMENTS, PALACE_AT, PALACE_ORIGIN, palaceRing } from "./monuments_data.mjs";
import { K } from "./monument_parts.mjs";
import { FINE, buildFrames, buildWallLine, clamp, frameOf, hall, local, place, rectOf } from "./monuments_hanok.mjs";
import { PALACE_BUILDINGS } from "./monuments_gyeongbok_data.mjs";
// web/city/monuments_palace.mts
var GB = frameOf(PALACE_AT, PALACE_ORIGIN);
var WALL_GAPS = ["건춘문", "신무문"];
function buildPalaceWall(w) {
	const ring = palaceRing().map(([lng, lat]) => {
		const [x, y] = local(lng, lat, GB);
		return [
			x,
			y,
			0
		];
	});
	ring.push(ring[0]);
	const [gx, gy] = local(MONUMENTS[0].lngLat[0], MONUMENTS[0].lngLat[1], GB);
	const gaps = PALACE_BUILDINGS.filter((b) => WALL_GAPS.includes(b.name)).map((b) => {
		const xs = [], ys = [];
		for (let i = 0; i < b.p.length; i += 2) {
			const [x, y] = local(PALACE_ORIGIN[0] + b.p[i] / 1e6, PALACE_ORIGIN[1] + b.p[i + 1] / 1e6, GB);
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
		const r = rectOf(b.p, GB);
		place(w, r);
		DEDICATED[b.name](w, r);
	}
	w.xf = null;
}
var buildPalaceFrames = (w) => buildFrames(w, PALACE_BUILDINGS, Object.keys(DEDICATED), GB);
export { buildPalaceFrames, buildPalaceHalls, buildPalaceWall };
