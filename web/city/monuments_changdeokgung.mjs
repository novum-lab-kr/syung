import { CDG_AT, CDG_ORIGIN, cdgRing } from "./monuments_data.mjs";
import { toM } from "./life.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { CDG_BUILDINGS } from "./monuments_changdeokgung_data.mjs";
import { CDG_TREES } from "./monuments_changdeokgung_trees_data.mjs";
import { CDG_TORCHES } from "./monuments_changdeokgung_torches_data.mjs";
import { FINE, MID, ROUGH, buildFrameOutline, buildFrames, buildWallLine, clamp, frameOf, hall, place, rectOf, wingsOf } from "./monuments_hanok.mjs";
// web/city/monuments_changdeokgung.mts
var trees = {
	at: CDG_AT,
	data: CDG_TREES
};
var torches = {
	at: CDG_AT,
	data: CDG_TORCHES
};
var FRAME = frameOf(CDG_AT, CDG_ORIGIN);
var local = (lng, lat) => {
	const [mx, my] = toM(lng, lat);
	return [mx - FRAME.ox, -(my - FRAME.oy)];
};
var WALL_GAPS = [
	"돈화문",
	"금호문",
	"단봉문"
];
function buildWall(w) {
	const ring = cdgRing().map(([lng, lat]) => {
		const [x, y] = local(lng, lat);
		return [
			x,
			y,
			0
		];
	});
	ring.push(ring[0]);
	const gaps = CDG_BUILDINGS.filter((each) => WALL_GAPS.includes(each.name)).map((each) => {
		const r = rectOf(each.p, FRAME), xs = r.pts.map((p) => p[0]), ys = r.pts.map((p) => p[1]);
		return [
			Math.min(...xs) - 2,
			Math.max(...xs) + 2,
			Math.min(...ys) - 2,
			Math.max(...ys) + 2
		];
	});
	buildWallLine(w, ring, (x, y) => gaps.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
}
var southFacing = (r) => Math.cos(r.ang) < 0 ? {
	...r,
	ang: r.ang + Math.PI
} : r;
var half = (r, margin) => ({
	hx: Math.max(1, r.len / 2 - margin),
	hy: Math.max(1, r.wid / 2 - margin)
});
function buildInjeongjeon(w, r) {
	const hx = r.len / 2, hy = r.wid / 2, upper = 2, out = 3.5;
	w.box(-hx - out, hx + out, -hy - out, hy + out, 0, 1, K.granite, { bottom: true });
	w.quad([
		-hx - out,
		-hy - out,
		1
	], [
		hx + out,
		-hy - out,
		1
	], [
		hx + out,
		hy + out,
		1
	], [
		-hx - out,
		hy + out,
		1
	], K.deck, [
		0,
		0,
		1
	]);
	for (let k = 0; k < 3; k++) w.box(-3.4, 3.4, -hy - out - (3 - k) * .6, -hy - out + .01, 0, 1 * (k + 1) / 3, K.trim, { bottom: true });
	w.box(-hx, hx, -hy, hy, 1, upper, K.granite, { bottom: true });
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
	for (let k = 0; k < 3; k++) w.box(-3, 3, -hy - (3 - k) * .5, -hy + .01, 1, 1 + 1 * (k + 1) / 3, K.trim, { bottom: true });
	const S = {
		hx: hx - 3,
		hy: hy - 3,
		podium: 0,
		body: 5,
		rise: 5.2,
		eave: 3.2,
		bays: [5, 4],
		steps: FINE,
		tiers: 2,
		brackets: true,
		doors: true,
		lift: 1.5,
		upper: [.95, .93],
		upperRise: 3.6,
		ridgeFrac: .66,
		gable: .55
	};
	w.dz = upper;
	const ridgeTop = hall(w, S);
	w.dz = 0;
	const ridgeHalf = (S.hx * .95 + .45 + S.eave) * .66 * .7;
	for (let k = 0; k < 5; k++) {
		const x = -ridgeHalf + 2 * ridgeHalf * k / 4;
		w.frustum(x, 0, .3, .3, upper + ridgeTop - .1, .12, .12, upper + ridgeTop + .8, K.gilt);
	}
	const rail = (ax, ay, bx, by) => {
		const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2.6));
		for (let i = 0; i <= n; i++) {
			const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
			w.box(x - .15, x + .15, y - .15, y + .15, upper, 3, K.trim, { bottom: true });
		}
	};
	rail(-hx + .3, -hy + .3, -3.8, -hy + .3);
	rail(3.8, -hy + .3, hx - .3, -hy + .3);
	rail(-hx + .3, hy - .3, hx - .3, hy - .3);
	rail(-hx + .3, -hy + .3, -hx + .3, hy - .3);
	rail(hx - .3, -hy + .3, hx - .3, hy - .3);
}
function buildBuyongjeong(w, r) {
	const arm = {
		podium: 1.1,
		body: 2.8,
		rise: 2.6,
		eave: 1.3,
		bays: [3, 1],
		steps: ROUGH,
		hollow: true
	};
	hall(w, {
		...arm,
		hx: Math.max(1.4, r.len / 2 - .5),
		hy: Math.max(.9, r.wid * .24)
	});
	place(w, {
		...r,
		ang: r.ang + Math.PI / 2
	});
	hall(w, {
		...arm,
		hx: Math.max(1.4, r.wid / 2 - .5),
		hy: Math.max(.9, r.len * .24)
	});
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
function buildHexPavilion(w, r) {
	const radius = clamp(Math.max(r.len, r.wid) / 2 * 1.05, 2, 3.6), floor = .7;
	w.prism(0, 0, radius + .5, 0, floor, K.granite, 6);
	const pts = (rad, z) => Array.from({ length: 6 }, (_, k) => [
		Math.cos(Math.PI / 3 * k) * rad,
		Math.sin(Math.PI / 3 * k) * rad,
		z
	]);
	for (const p of pts(radius, 0)) w.box(p[0] - .2, p[0] + .2, p[1] - .2, p[1] + .2, floor, 3.5, K.red, {
		bottom: true,
		top: true
	});
	const band = (rad, z0, z1) => {
		const lo = pts(rad, z0), hi = pts(rad, z1);
		for (let k = 0; k < 6; k++) {
			const k2 = (k + 1) % 6, mid = Math.PI / 3 * (k + .5);
			w.quad(lo[k], lo[k2], hi[k2], hi[k], K.dancheong, [
				Math.cos(mid),
				Math.sin(mid),
				0
			]);
		}
	};
	band(radius + .25, 3.1, 3.5);
	const cone = (rad, z0, rise, tipRad) => {
		const lo = pts(rad, z0), hi = pts(tipRad, z0 + rise);
		for (let k = 0; k < 6; k++) {
			const k2 = (k + 1) % 6;
			w.quad(lo[k], lo[k2], hi[k2], hi[k], K.giwa, [
				0,
				0,
				1
			], k * 1.5, (k + 1) * 1.5, (k + 1) * 1.5, k * 1.5);
			w.quad([
				lo[k][0],
				lo[k][1],
				z0 - .3
			], [
				lo[k2][0],
				lo[k2][1],
				z0 - .3
			], lo[k2], lo[k], K.fascia, [
				lo[k][0] + lo[k2][0],
				lo[k][1] + lo[k2][1],
				0
			]);
		}
	};
	cone(radius + 1.5, 3.5, 1.1, radius * .75);
	cone(radius * .8 + .6, 5, 1.7, .12);
	w.frustum(0, 0, .2, .2, 6.6, .05, .05, 7.4, K.gilt);
}
function buildFanPavilion(w, pts) {
	const edges = pts.map((from, i) => ({
		from,
		to: pts[(i + 1) % pts.length],
		len: Math.hypot(pts[(i + 1) % pts.length][0] - from[0], pts[(i + 1) % pts.length][1] - from[1])
	})).sort((one, two) => two.len - one.len);
	const [side1, side2] = [edges[0], edges[1]];
	const d1 = [side1.to[0] - side1.from[0], side1.to[1] - side1.from[1]], d2 = [side2.to[0] - side2.from[0], side2.to[1] - side2.from[1]], cross = d1[0] * d2[1] - d1[1] * d2[0];
	if (Math.abs(cross) < 1e-6) return;
	const t = ((side2.from[0] - side1.from[0]) * d2[1] - (side2.from[1] - side1.from[1]) * d2[0]) / cross;
	const apex = [side1.from[0] + d1[0] * t, side1.from[1] + d1[1] * t];
	const cx = pts.reduce((sum, pt) => sum + pt[0], 0) / pts.length, cy = pts.reduce((sum, pt) => sum + pt[1], 0) / pts.length, mid = Math.atan2(cy - apex[1], cx - apex[0]);
	const polar = pts.map((pt) => {
		let rel = Math.atan2(pt[1] - apex[1], pt[0] - apex[0]) - mid;
		while (rel > Math.PI) rel -= 2 * Math.PI;
		while (rel < -Math.PI) rel += 2 * Math.PI;
		return {
			rel,
			rad: Math.hypot(pt[0] - apex[0], pt[1] - apex[1])
		};
	});
	const radii = polar.map((item) => item.rad), split = (Math.min(...radii) + Math.max(...radii)) / 2, mean = (list) => list.reduce((sum, v) => sum + v, 0) / Math.max(1, list.length);
	const rOut = mean(radii.filter((v) => v > split)), rIn = mean(radii.filter((v) => v <= split)), halfAng = Math.max(...polar.map((item) => Math.abs(item.rel)));
	const at = (rad, rel, z) => [
		apex[0] + Math.cos(mid + rel) * rad,
		apex[1] + Math.sin(mid + rel) * rad,
		z
	], floor = .6, ARC = 12;
	for (let k = 0; k < ARC; k++) {
		const r0 = -halfAng + 2 * halfAng * k / ARC, r1 = -halfAng + 2 * halfAng * (k + 1) / ARC, mr = (r0 + r1) / 2, lo = rIn - .3, hi = rOut + .4;
		w.quad(at(lo, r0, floor), at(hi, r0, floor), at(hi, r1, floor), at(lo, r1, floor), K.deck, [
			0,
			0,
			1
		]);
		w.quad(at(hi, r0, 0), at(hi, r1, 0), at(hi, r1, floor), at(hi, r0, floor), K.granite, [
			Math.cos(mid + mr),
			Math.sin(mid + mr),
			0
		]);
		w.quad(at(lo, r1, 0), at(lo, r0, 0), at(lo, r0, floor), at(lo, r1, floor), K.granite, [
			-Math.cos(mid + mr),
			-Math.sin(mid + mr),
			0
		]);
	}
	for (const side of [-1, 1]) w.quad(at(rIn - .3, side * halfAng, 0), at(rOut + .4, side * halfAng, 0), at(rOut + .4, side * halfAng, floor), at(rIn - .3, side * halfAng, floor), K.granite, [
		-Math.sin(mid + side * halfAng) * side,
		Math.cos(mid + side * halfAng) * side,
		0
	]);
	const post = (rad, rel) => {
		const [x, y] = at(rad, rel, 0);
		w.box(x - .17, x + .17, y - .17, y + .17, floor, 3.1, K.red, {
			bottom: true,
			top: true
		});
	};
	for (let k = 0; k <= 4; k++) post(rOut, -halfAng + 2 * halfAng * k / 4);
	for (let k = 0; k <= 2; k++) post(rIn, -halfAng + 2 * halfAng * k / 2);
	const beam = (rad, z0, z1) => {
		for (let k = 0; k < ARC; k++) {
			const r0 = -halfAng + 2 * halfAng * k / ARC, r1 = -halfAng + 2 * halfAng * (k + 1) / ARC, mr = (r0 + r1) / 2;
			w.quad(at(rad + .2, r0, z0), at(rad + .2, r1, z0), at(rad + .2, r1, z1), at(rad + .2, r0, z1), K.dancheong, [
				Math.cos(mid + mr),
				Math.sin(mid + mr),
				0
			]);
		}
	};
	beam(rOut, 2.65, 3.1);
	beam(rIn - .4, 2.65, 3.1);
	const eaveZ = 3.1, over = 1.1, outer = rOut + over, inner = Math.max(.4, rIn - .5), reach = halfAng + over / Math.max(1, rOut) * .9, RAD = 4, ANG = 14;
	const height = (rel, rad) => eaveZ + 1.4999999999999996 * (1 - Math.abs(rel) / reach) * (.82 + .18 * (rad - inner) / (outer - inner));
	for (let i = 0; i < RAD; i++) for (let k = 0; k < ANG; k++) {
		const rad0 = inner + (outer - inner) * i / RAD, rad1 = inner + (outer - inner) * (i + 1) / RAD, r0 = -reach + 2 * reach * k / ANG, r1 = -reach + 2 * reach * (k + 1) / ANG;
		w.quad(at(rad0, r0, height(r0, rad0)), at(rad1, r0, height(r0, rad1)), at(rad1, r1, height(r1, rad1)), at(rad0, r1, height(r1, rad0)), K.giwa, [
			0,
			0,
			1
		], i * 1.2, (i + 1) * 1.2, (i + 1) * 1.2, i * 1.2);
	}
	for (let k = 0; k < ANG; k++) {
		const r0 = -reach + 2 * reach * k / ANG, r1 = -reach + 2 * reach * (k + 1) / ANG, mr = (r0 + r1) / 2;
		w.quad(at(outer, r0, height(r0, outer) - .3), at(outer, r1, height(r1, outer) - .3), at(outer, r1, height(r1, outer)), at(outer, r0, height(r0, outer)), K.fascia, [
			Math.cos(mid + mr),
			Math.sin(mid + mr),
			0
		]);
		w.quad(at(inner, r1, height(r1, inner) - .3), at(inner, r0, height(r0, inner) - .3), at(inner, r0, height(r0, inner)), at(inner, r1, height(r1, inner)), K.fascia, [
			-Math.cos(mid + mr),
			-Math.sin(mid + mr),
			0
		]);
	}
	for (const side of [-1, 1]) for (let i = 0; i < RAD; i++) {
		const rad0 = inner + (outer - inner) * i / RAD, rad1 = inner + (outer - inner) * (i + 1) / RAD, rel = side * reach;
		w.quad(at(rad0, rel, height(rel, rad0) - .3), at(rad1, rel, height(rel, rad1) - .3), at(rad1, rel, height(rel, rad1)), at(rad0, rel, height(rel, rad0)), K.fascia, [
			-Math.sin(mid + rel) * side,
			Math.cos(mid + rel) * side,
			0
		]);
	}
	for (let i = 0; i < RAD; i++) {
		const rad0 = inner + (outer - inner) * i / RAD, rad1 = inner + (outer - inner) * (i + 1) / RAD, nx = -Math.sin(mid) * .22, ny = Math.cos(mid) * .22;
		const [a0, a1] = [at(rad0, 0, height(0, rad0) + .3), at(rad1, 0, height(0, rad1) + .3)];
		w.quad([
			a0[0] - nx,
			a0[1] - ny,
			a0[2]
		], [
			a1[0] - nx,
			a1[1] - ny,
			a1[2]
		], [
			a1[0] + nx,
			a1[1] + ny,
			a1[2]
		], [
			a0[0] + nx,
			a0[1] + ny,
			a0[2]
		], K.ridge, [
			0,
			0,
			1
		]);
		for (const side of [-1, 1]) w.quad([
			a0[0] + nx * side,
			a0[1] + ny * side,
			a0[2] - .3
		], [
			a1[0] + nx * side,
			a1[1] + ny * side,
			a1[2] - .3
		], [
			a1[0] + nx * side,
			a1[1] + ny * side,
			a1[2]
		], [
			a0[0] + nx * side,
			a0[1] + ny * side,
			a0[2]
		], K.ridge, [
			nx * side,
			ny * side,
			0
		]);
	}
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
var NAKSEONJAE_AT = [221, -418];
function buildRichOutline(w, r) {
	const post = Math.hypot(r.cx - NAKSEONJAE_AT[0], r.cy - NAKSEONJAE_AT[1]) < 70 ? K.timber : K.red, height = 3.2;
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
function buildTimberHouse(w, outline) {
	for (const wing of wingsOf(outline)) {
		const r = southFacing(wing);
		place(w, r);
		w.remap = {
			[K.red]: K.timber,
			[K.dancheong]: K.timber,
			[K.band]: K.timber
		};
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
var DEDICATED = {
	돈화문: (w, r) => {
		hall(w, {
			hx: Math.min(r.len / 2, 13) - .8,
			hy: Math.min(r.wid / 2, 6.5) - .8,
			podium: 1.6,
			lowPodium: [1.2, .6],
			body: 3.8,
			rise: 4.2,
			eave: 2.6,
			bays: [5, 2],
			steps: FINE,
			tiers: 2,
			brackets: true,
			doors: true,
			stair: true
		});
	},
	인정전: buildInjeongjeon,
	선정전: (w, r) => {
		w.remap = { [K.giwa]: K.blueTile };
		hall(w, {
			...half(r, 1.2),
			podium: 1.4,
			lowPodium: [1, .4],
			body: 4.2,
			rise: 4.4,
			eave: 2.8,
			bays: [3, 3],
			steps: FINE,
			brackets: true,
			doors: true,
			stair: true,
			gable: .5
		});
		w.remap = null;
	},
	희정당: (w, r) => {
		hall(w, {
			...half(r, 1),
			podium: 1.3,
			lowPodium: [1.2, .5],
			body: 3.9,
			rise: 4,
			eave: 2.6,
			bays: [9, 3],
			steps: FINE,
			brackets: true,
			doors: true,
			stair: true,
			gable: .5
		});
	},
	대조전: (w, r) => {
		hall(w, {
			...half(r, 1),
			podium: 1.3,
			lowPodium: [1.2, .5],
			body: 3.9,
			rise: 3.6,
			eave: 2.5,
			bays: [7, 3],
			steps: FINE,
			ridgeless: true,
			doors: true,
			stair: true
		});
	},
	주합루: (w, r) => {
		hall(w, {
			...half(r, .8),
			podium: 2.2,
			lowPodium: [.8, .3],
			body: 3.6,
			rise: 3.6,
			eave: 2.3,
			bays: [5, 3],
			steps: FINE,
			tiers: 2,
			brackets: true,
			doors: true,
			stair: true,
			upper: [.9, .88],
			upperRise: 3.2,
			gable: .5
		});
	},
	영화당: (w, r) => {
		hall(w, {
			...half(r, .8),
			podium: 1.1,
			body: 3.4,
			rise: 3.2,
			eave: 2.1,
			bays: [5, 3],
			steps: MID,
			brackets: true,
			doors: true,
			stair: true,
			gable: .45
		});
	},
	부용정: buildBuyongjeong,
	존덕정: buildHexPavilion,
	청의정: (w, r) => pavilion(w, r, K.thatch),
	인정문: (w, r) => gate(w, r),
	진선문: (w, r) => gate(w, r),
	숙장문: (w, r) => gate(w, r),
	선정문: (w, r) => gate(w, r, [3, 1]),
	금호문: (w, r) => gate(w, r, [3, 1]),
	단봉문: (w, r) => gate(w, r, [3, 1]),
	...Object.fromEntries([
		"애련정",
		"태극정",
		"소요정",
		"승재정",
		"취한정",
		"취규정",
		"능허정",
		"청심정",
		"농수정",
		"몽답정"
	].map((name) => [name, (w, r) => pavilion(w, r)]))
};
function buildHalls(w) {
	for (const each of CDG_BUILDINGS.filter((item) => TIMBER_HOUSES.includes(item.name) && item.p.length >= 6)) buildTimberHouse(w, rectOf(each.p, FRAME));
	for (const each of CDG_BUILDINGS.filter((item) => FAN_PAVILIONS.includes(item.name) && item.p.length >= 6)) {
		w.xf = null;
		buildFanPavilion(w, rectOf(each.p, FRAME).pts);
	}
	for (const each of CDG_BUILDINGS.filter((item) => DEDICATED[item.name] && item.p.length >= 6)) {
		const r = southFacing(rectOf(each.p, FRAME));
		place(w, r);
		DEDICATED[each.name](w, r);
		w.xf = null;
	}
}
var OUTLINE_ONLY = ["수강재"];
var TIMBER_HOUSES = ["낙선재", "석복헌"];
var FAN_PAVILIONS = ["관람정"];
function buildRest(w) {
	const names = [
		...Object.keys(DEDICATED),
		...TIMBER_HOUSES,
		...FAN_PAVILIONS
	];
	buildFrames(w, CDG_BUILDINGS.filter((each) => !OUTLINE_ONLY.includes(each.name)), names, FRAME, buildRichOutline);
	for (const each of CDG_BUILDINGS.filter((item) => OUTLINE_ONLY.includes(item.name))) {
		w.xf = null;
		buildRichOutline(w, rectOf(each.p, FRAME));
	}
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "cdg-wall") buildWall(w);
	else if (id === "cdg-halls") buildHalls(w);
	else if (id === "cdg-frames") buildRest(w);
	return new Float32Array(w.data);
}
export { buildMonument, torches, trees };
