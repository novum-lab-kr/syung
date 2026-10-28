import { PARK_DEFAULTS } from "../basic/park.mjs";
import { ridePalette } from "./metrics.mjs";
import { BULB_FS, BULB_PAL, BULB_TWINKLE, NEON, RIBBON, RIBBON_FS, bulbSize, compile, hexRGB } from "./night.mjs";
import { selectRideSites } from "./ride_sites.mjs";
// web/modes/coaster/rides.mts
var EARTH = 40075016.68557849;
var mercX = (lon) => lon / 360 + .5;
var mercY = (lat) => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
var muOf = (lat) => 1 / (EARTH * Math.cos(lat * Math.PI / 180));
var fnv1a = (s) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
};
var LOTTE = [127.102659, 37.512537];
var sub = (a, b) => [
	a[0] - b[0],
	a[1] - b[1],
	a[2] - b[2]
];
var add = (a, b) => [
	a[0] + b[0],
	a[1] + b[1],
	a[2] + b[2]
];
var mul = (a, k) => [
	a[0] * k,
	a[1] * k,
	a[2] * k
];
var cross = (a, b) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];
var norm = (a) => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [
		a[0] / l,
		a[1] / l,
		a[2] / l
	];
};
var STILL = { mode: 0 };
var SPIN = { mode: 1 };
var LIFT = { mode: 3 };
var wheel = (piv) => ({
	mode: 2,
	piv
});
var orbit = (piv, arm) => ({
	mode: 4,
	piv,
	arm
});
var Mesh = class {
	constructor() {
		this.d = [];
		this.tris = 0;
	}
	v(C, p, n, o) {
		let a, b;
		if (C.mode === 1) {
			a = p;
			b = [
				0,
				0,
				0
			];
		} else if (C.mode === 2) {
			a = sub(p, C.piv);
			b = C.piv;
		} else if (C.mode === 4) {
			a = C.arm;
			b = add(C.piv, p);
		} else {
			a = [
				0,
				0,
				0
			];
			b = p;
		}
		this.d.push(a[0], a[1], a[2], b[0], b[1], b[2], n[0], n[1], n[2], o.slot, C.mode, o.sel || 0, o.shade || 0);
	}
	tri(C, A, B, D, nA, nB, nD, o) {
		this.v(C, A, nA, o);
		this.v(C, B, nB, o);
		this.v(C, D, nD, o);
		this.tris++;
	}
	quad(C, A, B, D, E, nA, nB, nD, nE, o) {
		this.tri(C, A, B, D, nA, nB, nD, o);
		this.tri(C, A, D, E, nA, nD, nE, o);
	}
	fan(C, c, pts, n, o) {
		for (let i = 0; i < pts.length; i++) this.tri(C, c, pts[i], pts[(i + 1) % pts.length], n, n, n, o);
	}
	buffer() {
		return new Float32Array(this.d);
	}
};
function tube(M, C, p0, p1, rad, seg, o, cap0, cap1) {
	const u = norm(sub(p1, p0));
	const a = norm(cross(u, Math.abs(u[2]) < .9 ? [
		0,
		0,
		1
	] : [
		1,
		0,
		0
	])), b = cross(u, a), ring = [];
	for (let i = 0; i < seg; i++) {
		const t = i / seg * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
		ring.push(norm([
			a[0] * c + b[0] * s,
			a[1] * c + b[1] * s,
			a[2] * c + b[2] * s
		]));
	}
	for (let i = 0; i < seg; i++) {
		const n0 = ring[i], n1 = ring[(i + 1) % seg];
		M.quad(C, add(p0, mul(n0, rad)), add(p0, mul(n1, rad)), add(p1, mul(n1, rad)), add(p1, mul(n0, rad)), n0, n1, n1, n0, o);
	}
	if (cap0) M.fan(C, p0, ring.map((n) => add(p0, mul(n, rad))).reverse(), mul(u, -1), o);
	if (cap1) M.fan(C, p1, ring.map((n) => add(p1, mul(n, rad))), u, o);
}
function cone(M, C, z0, r0, z1, r1, seg, o, alt, blk = 8) {
	const dr = r1 - r0, dz = z1 - z0, nl = Math.hypot(dr, dz) || 1, nr = dz / nl, nz = -dr / nl;
	for (let i = 0; i < seg; i++) {
		const t0 = i / seg * 2 * Math.PI, t1 = (i + 1) / seg * 2 * Math.PI, oo = alt != null && Math.floor(i * blk / seg) % 2 ? {
			...o,
			slot: alt
		} : o;
		const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
		const n0 = [
			c0 * nr,
			s0 * nr,
			nz
		], n1 = [
			c1 * nr,
			s1 * nr,
			nz
		];
		if (r0 === 0) M.tri(C, [
			0,
			0,
			z0
		], [
			c1 * r1,
			s1 * r1,
			z1
		], [
			c0 * r1,
			s0 * r1,
			z1
		], n0, n1, n0, oo);
		else if (r1 === 0) M.tri(C, [
			c0 * r0,
			s0 * r0,
			z0
		], [
			c1 * r0,
			s1 * r0,
			z0
		], [
			0,
			0,
			z1
		], n0, n1, n0, oo);
		else M.quad(C, [
			c0 * r0,
			s0 * r0,
			z0
		], [
			c1 * r0,
			s1 * r0,
			z0
		], [
			c1 * r1,
			s1 * r1,
			z1
		], [
			c0 * r1,
			s0 * r1,
			z1
		], n0, n1, n1, n0, oo);
	}
}
function disc(M, C, z, rad, seg, o, dir = 1) {
	const n = [
		0,
		0,
		dir
	], pts = [];
	for (let i = 0; i < seg; i++) {
		const t = (dir > 0 ? i : seg - i) / seg * 2 * Math.PI;
		pts.push([
			Math.cos(t) * rad,
			Math.sin(t) * rad,
			z
		]);
	}
	M.fan(C, [
		0,
		0,
		z
	], pts, n, o);
}
function band(M, C, z0, z1, ri, ro, seg, o, alt, blk = 8) {
	for (let i = 0; i < seg; i++) {
		const t0 = i / seg * 2 * Math.PI, t1 = (i + 1) / seg * 2 * Math.PI, oo = alt != null && Math.floor(i * blk / seg) % 2 ? {
			...o,
			slot: alt
		} : o;
		const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
		const O0 = [c0 * ro, s0 * ro], O1 = [c1 * ro, s1 * ro], I0 = [c0 * ri, s0 * ri], I1 = [c1 * ri, s1 * ri];
		M.quad(C, [...I0, z1], [...I1, z1], [...O1, z1], [...O0, z1], [
			0,
			0,
			1
		], [
			0,
			0,
			1
		], [
			0,
			0,
			1
		], [
			0,
			0,
			1
		], oo);
		M.quad(C, [...O0, z0], [...O1, z0], [...I1, z0], [...I0, z0], [
			0,
			0,
			-1
		], [
			0,
			0,
			-1
		], [
			0,
			0,
			-1
		], [
			0,
			0,
			-1
		], oo);
		M.quad(C, [...O0, z0], [...O0, z1], [...O1, z1], [...O1, z0], [
			c0,
			s0,
			0
		], [
			c0,
			s0,
			0
		], [
			c1,
			s1,
			0
		], [
			c1,
			s1,
			0
		], oo);
		M.quad(C, [...I1, z0], [...I1, z1], [...I0, z1], [...I0, z0], [
			-c1,
			-s1,
			0
		], [
			-c1,
			-s1,
			0
		], [
			-c0,
			-s0,
			0
		], [
			-c0,
			-s0,
			0
		], oo);
	}
}
function box(M, C, c, hx, hy, hz, yaw, o) {
	const ca = Math.cos(yaw), sa = Math.sin(yaw);
	box3(M, C, c, [
		ca,
		sa,
		0
	], [
		-sa,
		ca,
		0
	], [
		0,
		0,
		1
	], hx, hy, hz, o);
}
function box3(M, C, c, X, Y, Z, hx, hy, hz, o) {
	const P = (i, j, k) => [
		0,
		1,
		2
	].map((d) => c[d] + X[d] * hx * i + Y[d] * hy * j + Z[d] * hz * k);
	const face = (n, a, b, d, e) => M.quad(C, a, b, d, e, n, n, n, n, o);
	face(X, P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1));
	face(mul(X, -1), P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1));
	face(Y, P(1, 1, -1), P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1));
	face(mul(Y, -1), P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1));
	face(Z, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1));
	face(mul(Z, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1));
}
function truss(M, C, p0, p1, w, n, rad, o) {
	const u = norm(sub(p1, p0)), a = norm(cross(u, Math.abs(u[2]) < .9 ? [
		0,
		0,
		1
	] : [
		1,
		0,
		0
	])), b = cross(u, a);
	const off = (k) => {
		const t = k / 3 * 2 * Math.PI;
		return add(mul(a, Math.cos(t) * w), mul(b, Math.sin(t) * w));
	};
	const at = (k, f) => add(add(p0, mul(sub(p1, p0), f)), off(k));
	for (let k = 0; k < 3; k++) tube(M, C, at(k, 0), at(k, 1), rad, 4, o, false, false);
	for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) tube(M, C, at(k, i / n), at((k + 1) % 3, (i + 1) / n), rad * .55, 3, o, false, false);
}
function torusY(M, C, c, R, t, nMaj, nMin, o) {
	const pt = (i, j) => {
		const a = i / nMaj * 2 * Math.PI, b = j / nMin * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
		return [[
			c[0] + (R + t * cb) * ca,
			c[1] + t * sb,
			c[2] + (R + t * cb) * sa
		], [
			cb * ca,
			sb,
			cb * sa
		]];
	};
	for (let i = 0; i < nMaj; i++) for (let j = 0; j < nMin; j++) {
		const [a, na] = pt(i, j), [b, nb] = pt(i + 1, j), [d, nd] = pt(i + 1, j + 1), [e, ne] = pt(i, j + 1);
		M.quad(C, a, b, d, e, na, nb, nd, ne, o);
	}
}
var CREAM = { slot: 2 };
var SHADE = { slot: 3 };
var A = { slot: 0 };
var B = { slot: 1 };
var RED = { slot: 4 };
var GOLD_TONE = { slot: 5 };
var CREAM_TONE = { slot: 6 };
var IVORY = { slot: 7 };
var TEAL = { slot: 8 };
var mast = (s) => ({
	...s,
	sel: 1
});
function mastDetail(M, top, seg, skip = [2, 2], decks = true) {
	const free = (z) => z < skip[0] - .03 || z > skip[1] + .03;
	for (let i = 1; i < 12; i++) {
		const z = i / 12 * top;
		if (free(z)) band(M, STILL, z - .002, z + .002, .9, 1.1, seg, mast(SHADE));
	}
	for (const f of [.3, .58]) {
		const z = f * top;
		if (!decks || !free(z)) continue;
		band(M, STILL, z - .0015, z + .0015, .9, 1.45, seg * 2, mast(SHADE));
		band(M, STILL, z + .0015, z + .008, 1.41, 1.45, seg * 2, mast(CREAM));
		for (let k = 0; k < 6; k++) {
			const t = (k + .5) / 6 * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
			tube(M, STILL, [
				c,
				s,
				z - .015
			], [
				c * 1.35,
				s * 1.35,
				z - .0015
			], .04, 3, mast(SHADE), false, false);
		}
	}
	if (decks) box(M, STILL, [
		-1.03,
		0,
		top / 2
	], .05, .1, top / 2, 0, mast(SHADE));
}
function spoke(M, C, d, ra, ha, rb, hb, z0, z1, oa, ob) {
	const e = [-d[1], d[0]], P = (r, h, z) => [
		d[0] * r + e[0] * h,
		d[1] * r + e[1] * h,
		z
	];
	const face = (n, q) => {
		for (const [i, j, k] of [[
			0,
			1,
			2
		], [
			0,
			2,
			3
		]]) for (const x of [
			i,
			j,
			k
		]) M.v(C, q[x][0], n, q[x][1]);
		M.tris += 2;
	};
	face([
		0,
		0,
		1
	], [
		[P(ra, -ha, z1), oa],
		[P(rb, -hb, z1), ob],
		[P(rb, hb, z1), ob],
		[P(ra, ha, z1), oa]
	]);
	face([
		0,
		0,
		-1
	], [
		[P(ra, ha, z0), oa],
		[P(rb, hb, z0), ob],
		[P(rb, -hb, z0), ob],
		[P(ra, -ha, z0), oa]
	]);
	face([
		e[0],
		e[1],
		0
	], [
		[P(ra, ha, z1), oa],
		[P(rb, hb, z1), ob],
		[P(rb, hb, z0), ob],
		[P(ra, ha, z0), oa]
	]);
	face([
		-e[0],
		-e[1],
		0
	], [
		[P(ra, -ha, z0), oa],
		[P(rb, -hb, z0), ob],
		[P(rb, -hb, z1), ob],
		[P(ra, -ha, z1), oa]
	]);
}
function buildDrop(lod) {
	const M = new Mesh(), seg = lod ? 12 : 7, rs = lod ? 24 : 12, seats = lod ? 16 : 8, nb = lod ? 8 : 4;
	for (let i = 0; i < nb; i++) tube(M, STILL, [
		0,
		0,
		i / nb
	], [
		0,
		0,
		(i + 1) / nb
	], 1, seg, mast(CREAM), false, false);
	cone(M, STILL, .004, 2.5, .022, 1.5, seg, mast(SHADE));
	disc(M, STILL, .022, 1.5, seg, mast(SHADE));
	if (lod) for (let i = 0; i < 3; i++) {
		const t = i / 3 * 2 * Math.PI;
		tube(M, STILL, [
			Math.cos(t) * 1.25,
			Math.sin(t) * 1.25,
			.02
		], [
			Math.cos(t) * 1.25,
			Math.sin(t) * 1.25,
			.93
		], .17, 4, mast(SHADE));
	}
	if (lod) mastDetail(M, .93, seg, [2, 2], false);
	cone(M, STILL, .925, 1.1, .94, 2.6, seg * 2, mast(SHADE));
	cone(M, STILL, .94, 2.6, .955, 2.6, seg * 2, mast(A), 1, 8);
	cone(M, STILL, .955, 2.6, .966, 2.6, seg * 2, mast(SHADE));
	cone(M, STILL, .966, 2.6, .975, 2.6, seg * 2, mast(B), 0, 8);
	cone(M, STILL, .975, 2.75, .985, 1.9, seg * 2, mast(SHADE));
	disc(M, STILL, .975, 2.75, seg * 2, mast(SHADE), -1);
	cone(M, STILL, .985, 1.9, 1, 1.8, seg, mast(SHADE));
	cone(M, STILL, 1, 1.8, 1.05, 0, seg, mast(GOLD_TONE));
	band(M, LIFT, -.006, .03, 1.5, 1.95, seg * 2, mast(SHADE));
	for (let i = 0, n = lod ? 8 : 4; i < n; i++) {
		const t = (i + .5) / n * 2 * Math.PI;
		spoke(M, LIFT, [Math.cos(t), Math.sin(t)], 1.9, .35, .66, .02, .006, .022, mast(SHADE), SHADE);
	}
	band(M, LIFT, 0, .026, .64, .7, rs, A, 1, 8);
	const wt = Math.PI * .8 / seats * .55;
	for (let i = 0; i < seats; i++) {
		const t = (i + .5) / seats * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t), col = i % 2 ? B : A;
		box(M, LIFT, [
			c * .79,
			s * .79,
			.002
		], .09, wt, .004, t, SHADE);
		box(M, LIFT, [
			c * .715,
			s * .715,
			.03
		], .016, wt, .03, t, col);
		if (!lod) continue;
		box(M, LIFT, [
			c * .77,
			s * .77,
			.056
		], .05, wt * .55, .005, t, GOLD_TONE);
		box(M, LIFT, [
			c * .815,
			s * .815,
			.036
		], .006, wt * .55, .018, t, GOLD_TONE);
		for (const k of [-1, 1]) box(M, LIFT, [
			c * .86 - s * k * wt * .35,
			s * .86 + c * k * wt * .35,
			-.016
		], .012, wt * .16, .016, t, SHADE);
	}
	return M;
}
function buildFerris(lod) {
	const M = new Mesh(), hub = [
		0,
		0,
		.58
	], maj = lod ? 32 : 16, min = lod ? 4 : 3, cab = lod ? 12 : 8, lg = lod ? 6 : 4, sp = lod ? 12 : 8;
	for (const y of [-.085, .085]) {
		for (const x of [-.34, .34]) lod ? truss(M, STILL, [
			x,
			y,
			0
		], [
			0,
			y,
			.575
		], .016, 14, .0045, TEAL) : tube(M, STILL, [
			x,
			y,
			0
		], [
			0,
			y,
			.575
		], .018, lg, TEAL, false, false);
		box(M, STILL, [
			0,
			y,
			.21
		], .19, .011, .011, 0, TEAL);
	}
	box(M, STILL, [
		0,
		0,
		.5
	], .014, .085, .014, 0, TEAL);
	tube(M, STILL, [
		0,
		-.105,
		.58
	], [
		0,
		.105,
		.58
	], .03, lod ? 10 : 6, SHADE, true, lod === 1);
	for (const y of lod ? [-.058, .058] : [0]) torusY(M, wheel(hub), [
		0,
		y,
		.58
	], .5, .005, maj, min, {
		...IVORY,
		sel: 2
	});
	if (lod) for (let i = 0; i < maj; i++) {
		const t0 = i / maj * 2 * Math.PI, t1 = (i + 1) / maj * 2 * Math.PI;
		tube(M, wheel(hub), [
			Math.cos(t0) * .5,
			-.058,
			.58 + Math.sin(t0) * .5
		], [
			Math.cos(t1) * .5,
			.058,
			.58 + Math.sin(t1) * .5
		], .0035, 3, {
			...IVORY,
			sel: 2
		}, false, false);
	}
	for (let i = 0; i < sp; i++) {
		const t = i / sp * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
		tube(M, wheel(hub), [
			0,
			0,
			.58
		], [
			c * .49,
			0,
			.58 + s * .49
		], lod ? .009 : .013, 4, CREAM, false, false);
		if (lod) for (const y of [-.058, .058]) tube(M, wheel(hub), [
			c * .2,
			y * .36,
			.58 + s * .2
		], [
			c * .49,
			y,
			.58 + s * .49
		], .006, 3, CREAM, false, false);
	}
	for (let i = 0; i < cab; i++) {
		const t = i / cab * 2 * Math.PI, C = orbit(hub, [
			Math.cos(t) * .5,
			0,
			Math.sin(t) * .5
		]);
		const col = i / cab < .5 ? CREAM_TONE : i / cab < 10 / 12 ? RED : GOLD_TONE;
		if (!lod) box(M, C, [
			0,
			0,
			-.072
		], .0275, .0325, .04, 0, col);
		else {
			box(M, C, [
				0,
				0,
				-.094
			], .0275, .0325, .018, 0, col);
			box(M, C, [
				0,
				0,
				-.06
			], .0255, .0305, .016, 0, SHADE);
			for (const [x, y] of [
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1]
			]) box(M, C, [
				x * .0262,
				y * .0312,
				-.06
			], .0018, .0018, .016, 0, col);
			box(M, C, [
				0,
				0,
				-.042
			], .029, .034, .0025, 0, col);
			cone(M, C, -.0395, .044, -.026, 0, 4, col);
			box(M, C, [
				0,
				0,
				-.018
			], .007, .007, .012, 0, SHADE);
			box(M, C, [
				0,
				0,
				-.115
			], .024, .03, .004, 0, SHADE);
		}
	}
	return M;
}
function buildSwing(lod) {
	const M = new Mesh(), seg = lod ? 10 : 6, cs = PARK_DEFAULTS.rides.swingSides, n = lod ? 12 : 8;
	tube(M, STILL, [
		0,
		0,
		0
	], [
		0,
		0,
		.9
	], 1, seg, mast(CREAM), false, false);
	cone(M, STILL, .004, 2.4, .02, 1.4, seg, mast(SHADE));
	disc(M, STILL, .02, 1.4, seg, mast(SHADE));
	cone(M, STILL, .9, 1.2, .93, 0, seg, mast(B));
	if (lod) mastDetail(M, .9, seg, [.63, .82]);
	cone(M, SPIN, .775, 1, .818, .13, cs, A, 1, cs);
	disc(M, SPIN, .818, .13, cs, CREAM_TONE);
	disc(M, SPIN, .772, 1, cs, SHADE, -1);
	cone(M, SPIN, .765, .98, .775, 1, cs, GOLD_TONE);
	if (lod) {
		const k = cs * 2;
		for (let i = 0; i < k; i++) {
			const t0 = i / k * 2 * Math.PI, t1 = (i + 1) / k * 2 * Math.PI, tm = (t0 + t1) / 2, n0 = [
				Math.cos(tm),
				Math.sin(tm),
				0
			];
			M.tri(SPIN, [
				Math.cos(t0),
				Math.sin(t0),
				.765
			], [
				Math.cos(t1),
				Math.sin(t1),
				.765
			], [
				Math.cos(tm) * .995,
				Math.sin(tm) * .995,
				.712
			], n0, n0, n0, i % 2 ? A : B);
			M.tri(SPIN, [
				Math.cos(t1) * .99,
				Math.sin(t1) * .99,
				.765
			], [
				Math.cos(t0) * .99,
				Math.sin(t0) * .99,
				.765
			], [
				Math.cos(tm) * .985,
				Math.sin(tm) * .985,
				.712
			], mul(n0, -1), mul(n0, -1), mul(n0, -1), SHADE);
		}
		cone(M, SPIN, .818, .16, .826, .12, cs, GOLD_TONE);
		cone(M, SPIN, .826, .12, .862, 0, cs, GOLD_TONE);
	}
	for (let i = 0; i < n; i++) {
		const t = i / n * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t), sx = -s, sy = c;
		if (lod) for (const e of [-1, 1]) tube(M, SPIN, [
			c * .9 + sx * e * .05,
			s * .9 + sy * e * .05,
			.768
		], [
			c * 1.06 + sx * e * .07,
			s * 1.06 + sy * e * .07,
			.636
		], .005, 3, TEAL, false, false);
		else tube(M, SPIN, [
			c * .9,
			s * .9,
			.768
		], [
			c * 1.06,
			s * 1.06,
			.636
		], .006, 4, TEAL, false, false);
		box(M, SPIN, [
			c * 1.06,
			s * 1.06,
			.618
		], .085, .075, .016, t, RED);
		box(M, SPIN, [
			c * 1.115,
			s * 1.115,
			.646
		], .014, .07, .03, t, RED);
		if (lod) for (const e of [-1, 1]) box(M, SPIN, [
			c * 1.065 + sx * e * .07,
			s * 1.065 + sy * e * .07,
			.632
		], .06, .006, .012, t, GOLD_TONE);
	}
	return M;
}
function buildSaucer(lod) {
	const M = new Mesh(), seg = lod ? 10 : 6, ds = lod ? 32 : 16, n = lod ? 24 : 12;
	tube(M, STILL, [
		0,
		0,
		0
	], [
		0,
		0,
		.95
	], 1, seg, mast(CREAM), false, false);
	cone(M, STILL, .004, 2.4, .02, 1.4, seg, mast(SHADE));
	disc(M, STILL, .02, 1.4, seg, mast(SHADE));
	if (lod) mastDetail(M, .95, seg, [.72, .95]);
	cone(M, STILL, .735, .1, .8, .96, ds, TEAL);
	if (lod) for (let i = 0; i < 8; i++) {
		const t = (i + .5) / 8 * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
		tube(M, STILL, [
			c * .12,
			s * .12,
			.733
		], [
			c * .95,
			s * .95,
			.7975
		], .012, 3, SHADE, false, false);
	}
	cone(M, STILL, .8, .96, .804, 1, ds, TEAL);
	cone(M, STILL, .804, 1, .84, 1, ds, SHADE);
	cone(M, STILL, .84, 1, .843, 1.01, ds, GOLD_TONE);
	cone(M, STILL, .843, 1.01, .848, .94, ds, A);
	cone(M, STILL, .848, .94, .862, .8, ds, CREAM_TONE);
	disc(M, STILL, .862, .8, ds, CREAM_TONE);
	if (lod) band(M, STILL, .862, .869, .74, .755, ds, GOLD_TONE);
	cone(M, STILL, .862, .55, .905, 0, lod ? 16 : 8, CREAM_TONE);
	for (let i = 0; i < n; i++) {
		const t = i / n * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
		box(M, SPIN, [
			c * 1.004,
			s * 1.004,
			.822
		], .006, .012, .018, t, CREAM_TONE);
	}
	return M;
}
var Bulbs = class {
	constructor() {
		this.d = [];
		this.n = 0;
	}
	at(C, p, col, tier, sel, param = 0, role = 0) {
		let a, b;
		if (C.mode === 1) {
			a = p;
			b = [
				0,
				0,
				0
			];
		} else if (C.mode === 2) {
			a = sub(p, C.piv);
			b = C.piv;
		} else if (C.mode === 4) {
			a = C.arm;
			b = add(C.piv, p);
		} else {
			a = [
				0,
				0,
				0
			];
			b = p;
		}
		this.d.push(a[0], a[1], a[2], b[0], b[1], b[2], col, C.mode, sel, tier, param, role);
		this.n++;
	}
	ring(C, n, rad, z, col0, tier, sel, role) {
		for (let i = 0; i < n; i++) {
			const t = i / n * 2 * Math.PI;
			this.at(C, [
				Math.cos(t) * rad,
				Math.sin(t) * rad,
				z
			], col0(i), tier, sel, i / n, role);
		}
	}
	buffer() {
		return new Float32Array(this.d);
	}
};
var bulbCol = (i) => i % 5 === 0 ? 1 : 0;
var GARLANDS = 4;
function buildBulbs(kind) {
	const B = new Bulbs(), hub = [
		0,
		0,
		.58
	];
	if (kind === "ferris") for (let i = 0; i < 64; i++) {
		const t = i / 64 * 2 * Math.PI;
		B.at(wheel(hub), [
			Math.cos(t) * .51,
			0,
			.58 + Math.sin(t) * .51
		], bulbCol(i), 0, 0, i / 64, 1);
	}
	else if (kind === "swing") B.ring(SPIN, 40, 1.01, .777, bulbCol, 0, 0, 1);
	else if (kind === "saucer") B.ring(STILL, 40, 1.01, .8275, bulbCol, 0, 0, 1);
	else B.ring(STILL, 24, 1.9, 1, bulbCol, 0, 1, 1);
	return B;
}
function buildWire() {
	const d = [];
	const put = (dir, t) => d.push(0, 0, 0, dir[0], dir[1], 0, 0, 0, 0, 2, t, 2);
	for (let g = 0; g < GARLANDS; g++) {
		const a = g / GARLANDS * 2 * Math.PI, dir = [Math.cos(a), Math.sin(a)];
		for (let j = 0; j < 12; j++) {
			put(dir, j / 12);
			put(dir, (j + 1) / 12);
		}
		d.push(0, 0, 0, dir[0], dir[1], 0, 0, 0, 0, 2, 1, 4);
		put(dir, 1);
	}
	return new Float32Array(d);
}
var RIDE_DIMENSIONS = `
vec3 rideDimensions(vec3 p,vec4 size,vec4 anim,float sel){
  if(anim.z>70.&&anim.z<80.&&sel>1.5){
    float k=clamp(size.x*.01,${PARK_DEFAULTS.rides.rimM[0]},${PARK_DEFAULTS.rides.rimM[1]})/(size.x*.01);
    vec2 d=vec2(p.x,p.z-size.y*.58);float r=length(d);
    d*=((r-size.x*.5)*k+size.x*.5)/max(r,1e-6);p.x=d.x;p.z=d.y+size.y*.58;
    float y=abs(p.y)>size.x*.03?sign(p.y)*size.x*.058:0.;p.y=y+(p.y-y)*k;
  }
  if(anim.z<21.&&p.z>size.y)p.z=size.y+(p.z-size.y)*min(size.y*${PARK_DEFAULTS.rides.crownHeightRatio},${PARK_DEFAULTS.rides.crownHeightM}.)/(size.y*.05);
  if(anim.z>89.&&sel<.5&&p.z>size.y*.8)p.z=size.y*.8+(p.z-size.y*.8)*clamp(size.y*${PARK_DEFAULTS.rides.saucerThicknessRatio},${PARK_DEFAULTS.rides.saucerThicknessM[0]}.,${PARK_DEFAULTS.rides.saucerThicknessM[1]}.)/(size.y*.055);
  return p;
}`;
var RIDE_POINT = `
${RIDE_DIMENSIONS}
vec3 ridePoint(vec3 av, vec3 aw, float m, float sel, float tt, vec4 iS, vec4 iA){
  float sxy = sel > .5 && sel < 1.5 ? iS.z : iS.x, sz = iS.y, p6 = 6.283185307;
  vec3 v = vec3(av.xy * sxy, av.z * sz), w = vec3(aw.xy * sxy, aw.z * sz), p;
  if (m < .5) p = v + w;
  else if (m < 1.5){ float g = p6 * fract(tt / iA.z), c = cos(g), s = sin(g);
    p = vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z) + w; }
  else if (m < 2.5){ float g = p6 * fract(tt / iA.z), c = cos(g), s = sin(g);
    p = vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c) + w; }
  else if (m < 3.5){ float u = fract(tt / 20.) * 20., f;
    if (u < 12.) f = smoothstep(0., 1., u / 12.);
    else if (u < 14.) f = 1.;
    else if (u < 18.){ float q = (u - 14.) * .25; f = 1. - q * q * (2. - q); }
    else f = 0.;
    p = v + w; p.z += (.15 + .67 * f) * sz; }
  else { float g = p6 * fract(tt / iA.z), c = cos(g), s = sin(g);
    p = vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c) + w; }
  p=rideDimensions(p,iS,iA,sel);
  float yc = cos(iA.w), ys = sin(iA.w);
  return vec3(p.x * yc - p.y * ys, p.x * ys + p.y * yc, p.z);
}`;
var Neon = class {
	constructor() {
		this.d = [];
		this.n = 0;
	}
	seg(C, p0, p1, { sel = 0, tier = 0, param = 0 } = {}) {
		const A = vw(C, p0), B = vw(C, p1);
		for (const [t, side] of [
			[0, -1],
			[0, 1],
			[1, 1],
			[0, -1],
			[1, 1],
			[1, -1]
		]) {
			this.d.push(A[0][0], A[0][1], A[0][2], A[1][0], A[1][1], A[1][2], B[0][0], B[0][1], B[0][2], B[1][0], B[1][1], B[1][2], param, C.mode, sel, tier, t, side);
			this.n++;
		}
	}
	loop(C, n, rad, z, o, plane) {
		for (let i = 0; i < n; i++) {
			const a = i / n * 2 * Math.PI, b = (i + 1) / n * 2 * Math.PI, P = (t) => plane ? [
				Math.cos(t) * rad,
				0,
				z + Math.sin(t) * rad
			] : [
				Math.cos(t) * rad,
				Math.sin(t) * rad,
				z
			];
			this.seg(C, P(a), P(b), {
				...o,
				param: i / n
			});
		}
	}
	buffer() {
		return new Float32Array(this.d);
	}
};
function vw(C, p) {
	if (C.mode === 1) return [p, [
		0,
		0,
		0
	]];
	if (C.mode === 2) return [sub(p, C.piv), C.piv];
	if (C.mode === 4) return [C.arm, add(C.piv, p)];
	return [[
		0,
		0,
		0
	], p];
}
function buildNeon(kind) {
	const N = new Neon();
	if (kind === "drop") N.loop(STILL, 24, 1.9, 1, { sel: 1 }, false);
	else if (kind === "saucer") N.loop(STILL, 48, 1.02, .8275, {}, false);
	else if (kind === "swing") N.loop(SPIN, 8, 1.01, .777, {}, false);
	else N.loop(wheel([
		0,
		0,
		.58
	]), 48, .505, .58, {}, true);
	return N;
}
var KINDS = [
	"drop",
	"ferris",
	"swing",
	"saucer"
];
var INSTANCE_FLOATS = 19;
var INST = [
	[4, 3],
	[5, 4],
	[6, 4],
	[7, 4],
	[8, 4]
];
var BUILD = {
	drop: buildDrop,
	ferris: buildFerris,
	swing: buildSwing,
	saucer: buildSaucer
};
var RIDE_PROJECT = `
vec4 rideProject(vec3 p){ return u_matrix * vec4(i_org + p * i_s.w, 1.); }
`;
var VS = `#version 300 es
layout(location=0) in vec3 a_v;      // turned by the animation
layout(location=1) in vec3 a_w;      // not turned
layout(location=2) in vec3 a_n;
layout(location=3) in vec4 a_k;      // colour slot, rot mode, xy-scale pick, shade bias
layout(location=4) in vec3 i_org;    // mercator xyz, local xy origin taken off; z is the site's base altitude
layout(location=5) in vec4 i_s;      // Sxy, Sz, Smast (metres), mercator units a metre
layout(location=6) in vec4 i_a;      // phase s, rate (0 frozen), period s, yaw
layout(location=7) in vec4 i_c;      // palette index: ride A, ride B, structure, structure shade
uniform mat4 u_matrix; uniform float u_time; uniform vec3 u_pal[10]; uniform vec3 u_light; uniform vec2 u_lit;
out vec3 v_col; out vec3 v_n; out vec3 v_wp; out vec3 v_obj; flat out vec2 v_part;
${RIDE_PROJECT}
${RIDE_DIMENSIONS}
void main(){
  float sxy = a_k.z > .5 && a_k.z < 1.5 ? i_s.z : i_s.x, sz = i_s.y;
  vec3 v = vec3(a_v.xy*sxy, a_v.z*sz), w = vec3(a_w.xy*sxy, a_w.z*sz);
  vec3 n = vec3(a_n.xy/sxy, a_n.z/sz);                       // the inverse transpose of a diagonal scale
  float tt = u_time*i_a.y + i_a.x, m = a_k.y, p6 = 6.283185307;
  vec3 p;
  if(m < .5) p = v + w;
  else if(m < 1.5){ float g = p6*fract(tt/i_a.z), c = cos(g), s = sin(g);   // about the mast
    p = vec3(v.x*c - v.y*s, v.x*s + v.y*c, v.z) + w; n = vec3(n.x*c - n.y*s, n.x*s + n.y*c, n.z); }
  else if(m < 2.5){ float g = p6*fract(tt/i_a.z), c = cos(g), s = sin(g);   // about the wheel hub
    p = vec3(v.x*c + v.z*s, v.y, -v.x*s + v.z*c) + w; n = vec3(n.x*c + n.z*s, n.y, -n.x*s + n.z*c); }
  else if(m < 3.5){                                                         // the drop tower: 12 s up, 2, 4 s down, 2
    float u = fract(tt/20.)*20., f;
    if(u < 12.) f = smoothstep(0., 1., u/12.);
    else if(u < 14.) f = 1.;
    else if(u < 18.){ float t = (u - 14.)*.25; f = 1. - t*t*(2. - t); }
    else f = 0.;
    p = v + w; p.z += (.15 + .67*f)*sz; }
  else { float g = p6*fract(tt/i_a.z), c = cos(g), s = sin(g);              // orbits the hub, stays upright
    p = vec3(v.x*c + v.z*s, v.y, -v.x*s + v.z*c) + w; }
  p=rideDimensions(p,i_s,i_a,a_k.z);
  float yc = cos(i_a.w), ys = sin(i_a.w);
  p = vec3(p.x*yc - p.y*ys, p.x*ys + p.y*yc, p.z);
  n = vec3(n.x*yc - n.y*ys, n.x*ys + n.y*yc, n.z);
  gl_Position = rideProject(p);
  int ci = int(a_k.x >= 4. ? a_k.x - 4. : a_k.x < .5 ? i_c.x : a_k.x < 1.5 ? i_c.y : a_k.x < 2.5 ? i_c.z : i_c.w);
  float nl = length(n);
  v_n = nl > 1e-20 ? n / nl : vec3(0., 0., 1.);   // never normalize a zero: a NaN colour rasterizes differently every frame
  v_col = u_pal[ci] * (1. + a_k.w);
  v_wp = i_org + p * i_s.w;                       // 조각의 자리(메르카토르, 기준점 O 를 뺀 값): 보는 방향 계산용
  v_obj = v + w;                                  // 움직이기 전 미터 좌표: 무늬가 부품과 함께 돈다
  v_part = vec2(a_k.x < 1.5 || abs(a_k.x - 4.) < .5 || abs(a_k.x - 6.) < .5 ? 0. : 1., a_k.z);   // 0 칠한 판(놀이기구 색 · 빨강 · 크림) · 1 쇠 구조; 기둥(1) · 바퀴 테(2)
}`;
var FS = `#version 300 es
precision highp float;
in vec3 v_col; in vec3 v_n; in vec3 v_wp; in vec3 v_obj; flat in vec2 v_part;
uniform vec3 u_light; uniform vec2 u_lit; uniform vec3 u_eye;
out vec4 o;
float seam(float x, float period, float width){ float f = abs(fract(x / period + .5) - .5) * period, w = fwidth(x); return 1. - smoothstep(width, width + w * 1.5, f); }
void main(){
  vec3 n = normalize(v_n);
  vec3 V = normalize(u_eye - v_wp), L = u_light, H = normalize(L + V);
  float metal = v_part.x, dif = max(dot(n, L), 0.), day = u_lit.y / .22;
  float sky = mix(.82, 1.06, n.z * .5 + .5);                                  // 위를 보는 면은 하늘빛, 아래는 땅 반사
  vec3 c = v_col * (u_lit.x * sky + u_lit.y * dif);
  float pat = 0.;
  if(v_part.y > .5 && v_part.y < 1.5){                                        // 기둥: 철판 이음매 · 볼트 줄
    float ang = atan(v_obj.y, v_obj.x) * 1.2732395;                            // 8쪽(한 바퀴 = 8)
    pat = max(seam(v_obj.z, 4., .06), seam(ang, 1., .012)) * .16;
    pat += seam(v_obj.z + 2., 4., .03) * seam(ang * 6., 1., .06) * .1;
    pat *= 1. - smoothstep(.15, .35, fwidth(v_obj.z) / 4.);                    // 이음매가 화면에서 6 px 아래로 촘촘해지면 흐리게(멀리서 벽돌처럼 보였다)
  }                                                                           // 칠한 판에는 무늬 없이(이음매를 넣으면 벽돌처럼 보였다)
  c *= 1. - pat;
  c *= mix(.72, 1., smoothstep(0., 5., v_obj.z));                             // 땅 가까이 그늘
  float sh = metal > .5 ? 48. : 22., ks = (metal > .5 ? .38 : .16) * day;      // 반짝임: 쇠는 좁고 세게, 칠한 판은 넓고 약하게
  c += vec3(1., .97, .9) * ks * pow(max(dot(n, H), 0.), sh) * step(0., dot(n, L));
  float fr = pow(1. - max(dot(n, V), 0.), 4.);                                 // 비스듬한 면에 비치는 하늘
  c = mix(c, vec3(.78, .86, .95) * (u_lit.x + u_lit.y), fr * (metal > .5 ? .22 : .1) * day);
  o = vec4(clamp(c, 0., 1.), 1.);
}`;
var BULB_VS = `#version 300 es
layout(location=0) in vec3 a_v;
layout(location=1) in vec3 a_w;
layout(location=2) in vec4 a_k;      // bulb colour 0-3, rot mode, xy-scale pick, tier
layout(location=3) in vec2 a_e;      // parameter, role (0 plain · 1 rim · 2 garland · 3 Lotte's extra strings · 4 garland pole foot)
layout(location=4) in vec3 i_org;
layout(location=5) in vec4 i_s;
layout(location=6) in vec4 i_a;
layout(location=8) in vec4 i_n;      // garlands on, collar height m, pole radius m, the ride's place in the accent colours
uniform mat4 u_matrix; uniform float u_time, u_size, u_core, u_tier, u_thin, u_anim, u_bright, u_neonOn;
uniform vec3 u_pal[8];
out vec3 v_rgb; out vec2 v_mix;
${RIDE_PROJECT}
${BULB_TWINKLE}
${RIDE_DIMENSIONS}
void kill(){ gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; }
void main(){
  float role = a_e.y, tier = a_k.w;
  if (tier < -.5) { if (u_neonOn > .5) { kill(); return; } tier = -tier - 1.; }   // a row the neon replaces
  if (tier > u_tier + .5) { kill(); return; }
  bool garland = role > 1.5 && role < 2.5 || role > 3.5;                  // the string, and the little pole at its end
  if (garland && i_n.x < .5) { kill(); return; }                          // Lotte has the spiral round it: no garlands
  if (role > 2.5 && role < 3.5 && i_n.x > .5) { kill(); return; }         // the two extra mast strings are Lotte's only
  if (u_thin > 1.5 && mod(float(gl_VertexID), u_thin) >= .5) { kill(); return; }
  float tt = u_time * i_a.y + i_a.x, p6 = 6.283185307;
  vec3 p;
  if (garland) {                                                           // worked straight in metres: a collar on the mast
    vec2 dir = a_v.xy + a_w.xy;                                            // down and out to a 6 m pole, with a sag in the middle
    float t = a_e.x;
    p = mix(vec3(0., 0., i_n.y), vec3(dir * i_n.z, 6.), t);
    if (role > 3.5) p.z = 0.;                                              // the pole's foot, on the ground under the string's end
    else p.z -= 16. * t * (1. - t);                                        // about 4 m of sag
  } else {
    float sxy = a_k.z > .5 ? i_s.z : i_s.x, sz = i_s.y, m = a_k.y;
    vec3 v = vec3(a_v.xy * sxy, a_v.z * sz), w = vec3(a_w.xy * sxy, a_w.z * sz);
    if (m < .5) p = v + w;
    else if (m < 1.5){ float g = p6 * fract(tt / i_a.z), c = cos(g), sn = sin(g);
      p = vec3(v.x * c - v.y * sn, v.x * sn + v.y * c, v.z) + w; }
    else if (m < 2.5){ float g = p6 * fract(tt / i_a.z), c = cos(g), sn = sin(g);
      p = vec3(v.x * c + v.z * sn, v.y, -v.x * sn + v.z * c) + w; }
    else if (m < 3.5){ float u = fract(tt / 20.) * 20., f;
      if (u < 12.) f = smoothstep(0., 1., u / 12.);
      else if (u < 14.) f = 1.;
      else if (u < 18.){ float q = (u - 14.) * .25; f = 1. - q * q * (2. - q); }
      else f = 0.;
      p = v + w; p.z += (.15 + .67 * f) * sz; }
    else { float g = p6 * fract(tt / i_a.z), c = cos(g), sn = sin(g);
      p = vec3(v.x * c + v.z * sn, v.y, -v.x * sn + v.z * c) + w; }
  }
  p=rideDimensions(p,i_s,i_a,a_k.z);
  float yc = cos(i_a.w), ys = sin(i_a.w);
  p = vec3(p.x * yc - p.y * ys, p.x * ys + p.y * yc, p.z);
  gl_Position = rideProject(p);
  gl_Position.z -= 3.5e-4 * gl_Position.w;                                 // a hair in front of the surface it is fixed to
  gl_PointSize = u_size;
  float b = u_bright;
  if (role > .5 && role < 1.5) b *= .70 + .30 * (.5 + .5 * cos(p6 * (a_e.x - u_time * u_anim / 12.)));   // one slow wave round the rim every 12 s
  b *= twinkle(hash1(float(gl_VertexID) * .19 + i_a.x * .77), u_time, u_anim);
  v_rgb = u_pal[a_k.x < .5 ? 0 : 1 + int(mod(a_k.x - 1. + i_n.w, 7.))];   // every ride starts the accents at its own place
  v_mix = vec2(u_core, b);
}`;
var NEON_VS = `#version 300 es
layout(location=0) in vec3 a_v;      // the segment's first end, turned / not turned
layout(location=1) in vec3 a_w;
layout(location=2) in vec3 a_v2;     // its second end
layout(location=3) in vec3 a_w2;
layout(location=9) in vec4 a_g;      // place round the loop, rot mode, xy-scale pick, tier
layout(location=10) in vec2 a_e;     // along the segment, across it
layout(location=4) in vec3 i_org;
layout(location=5) in vec4 i_s;
layout(location=6) in vec4 i_a;
uniform mat4 u_matrix; uniform float u_time, u_half, u_core, u_tier, u_chase, u_anim;
uniform vec2 u_vp; uniform vec3 u_neon;
out vec3 v_rgb; out vec3 v_mix;
${RIDE_PROJECT}
${RIDE_POINT}
${RIBBON}
void main(){
  if (a_g.w > u_tier + .5) { gl_Position = vec4(2., 2., 2., 1.); return; }
  float tt = u_time * i_a.y + i_a.x;
  vec3 A = ridePoint(a_v, a_w, a_g.y, a_g.z, tt, i_s, i_a);
  vec3 B = ridePoint(a_v2, a_w2, a_g.y, a_g.z, tt, i_s, i_a);
  vec4 cA = rideProject(A);
  vec4 cB = rideProject(B);
  gl_Position = ribbon(cA, cB, a_e.x, a_e.y, u_half, u_vp);
  gl_Position.z -= 3.5e-4 * gl_Position.w;     // a hair in front of the surface it is fixed to
  float b = .80;
  if (u_chase > .5) b += .55 * smoothstep(.15, 0., fract(a_g.x - u_time * u_anim / 14.));   // one bright length, once round every 14 s
  v_rgb = u_neon; v_mix = vec3(a_e.y, u_core, b);
}`;
var WIRE_FS = `#version 300 es
precision highp float; uniform vec4 u_wire; out vec4 o;
void main(){ o = vec4(u_wire.rgb * u_wire.a, u_wire.a); }`;
var SUN = norm([
	-.3,
	.46,
	.84
]);
function eyeOf(m) {
	const a = Array.from(m), inv = new Array(16);
	inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
	inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
	inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
	inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
	inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
	inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
	inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
	inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
	inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
	inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
	inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
	inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
	inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
	inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
	inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
	inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
	const w = inv[11];
	return w ? [
		inv[8] / w,
		inv[9] / w,
		inv[10] / w
	] : [
		0,
		0,
		1
	];
}
var RIDE_LIGHT = ridePalette(false);
var RIDE_DARK = ridePalette(true);
var GOLD = 8;
var RING = 9;
var STRUCT = 6;
var SHADE_I = 7;
var EXAG = [
	13.5,
	14.5,
	15.5
];
var EXAG_H = [
	2.4,
	1.6,
	1
];
var EXAG_V = [
	1.35,
	1.15,
	1
];
var atZoom = (z, v) => z <= EXAG[0] ? v[0] : z >= EXAG[2] ? v[2] : z <= EXAG[1] ? v[0] + (v[1] - v[0]) * (z - EXAG[0]) : v[1] + (v[2] - v[1]) * (z - EXAG[1]);
function landmarkSite(L, k) {
	const [lon, lat] = L.lngLat, D = L.diameterM, q = fnv1a("landmark" + k);
	return {
		i: -1 - k,
		lon,
		lat,
		x: mercX(lon),
		y: mercY(lat),
		mu: muOf(lat),
		radius_m: .3 * D,
		height_m: 1.1 * D,
		kind: "ferris",
		lotte: false,
		landmark: true,
		q,
		R: .3 * D,
		r: .3 * D,
		mastR: 10,
		colA: 0,
		colB: 1,
		struct: STRUCT,
		shade: SHADE_I,
		yaw: (L.yawDeg ?? 0) * Math.PI / 180,
		phase: 0,
		period: 150,
		sxy: D,
		sz: D,
		top: 1.1 * D,
		wide: .55 * D,
		collar: 35,
		pole: 65,
		hue: 2,
		maxExagH: 1.15,
		maxExagV: 1.15
	};
}
function withLandmarks(sites, landmarks) {
	if (!landmarks?.length) return sites;
	return [...sites.filter((s) => !s.landmark && landmarks.every((L) => Math.hypot((s.lon - L.lon) * 88200, (s.lat - L.lat) * 111e3) > L.wide + (s.wide || 60))), ...landmarks];
}
var RideLayer = class {
	constructor(towers, options = {}) {
		this.towers = towers || [];
		this.O = {
			x: mercX(126.978),
			y: mercY(37.5665)
		};
		this.M = /* @__PURE__ */ new Float32Array(16);
		this.candidates = this.towers.map(([lon, lat, fr, H], i) => {
			const R = .7 * fr, q = fnv1a(lon.toFixed(5) + "," + lat.toFixed(5));
			const lotte = Math.abs(lon - LOTTE[0]) < 1e-4 && Math.abs(lat - LOTTE[1]) < 1e-4;
			const r = Math.min(Math.max(.9 * R, .12 * H, 24), 55), mastR = Math.min(Math.max(.025 * H, 5), 10);
			const kind = lotte || H >= 300 ? "drop" : R >= 30 && q % 2 === 0 ? "ferris" : q % 2 === 0 ? "swing" : "saucer";
			const D = Math.min(Math.max(Math.min(.85 * H, 2.8 * R), 90), 170);
			const s = {
				i,
				lon,
				lat,
				x: mercX(lon),
				y: mercY(lat),
				mu: muOf(lat),
				radius_m: fr,
				height_m: H,
				kind,
				lotte,
				q,
				R,
				r,
				mastR,
				colA: 0,
				colB: 1,
				struct: STRUCT,
				shade: SHADE_I,
				yaw: (q >>> 8 & 1023) / 1024 * Math.PI * 2,
				phase: (q >>> 18 & 255) / 255 * 90,
				period: kind === "ferris" ? 75 : kind === "swing" ? 40 : kind === "saucer" ? 90 : 20
			};
			if (lotte) {
				s.mastR = 12;
				s.r = 28;
				s.colA = RING;
				s.colB = STRUCT;
				s.struct = GOLD;
				s.shade = STRUCT;
			}
			s.sxy = kind === "ferris" ? D : s.r;
			s.sz = kind === "ferris" ? D : H;
			s.top = kind === "ferris" ? 1.1 * D : kind === "drop" ? 1.08 * H : H;
			s.wide = kind === "ferris" ? .55 * D : Math.max(1.2 * s.r, 2.6 * s.mastR);
			s.collar = Math.min(.25 * H, 35);
			s.pole = Math.min(1.3 * (kind === "ferris" ? .5 * D : s.r), 65);
			s.hue = (q >>> 3) % 7;
			return s;
		});
		this.landmarks = (options.landmarks || []).map((L, k) => landmarkSite(L, k));
		this._sites = withLandmarks(options.deferPlacement ? [] : selectRideSites(this.candidates, options).sites, this.landmarks);
		this.stats = {
			tris: 0,
			rides: 0,
			ms: 0
		};
		this._moving = false;
		this.ping = 0;
	}
	sites() {
		return this._sites.map((s) => ({
			lon: s.lon,
			lat: s.lat,
			x: s.x,
			y: s.y,
			radius_m: s.radius_m,
			height_m: s.height_m,
			kind: s.kind
		}));
	}
	setSites(sites) {
		sites = withLandmarks(sites, this.landmarks);
		if (this.p && this.mc) for (const s of this.landmarks) {
			const m = this.mc.fromLngLat([s.lon, s.lat]);
			s.x = m.x;
			s.y = m.y;
			s.mu = m.meterInMercatorCoordinateUnits();
		}
		this._sites = sites;
		if (this.kind) for (const k of KINDS) {
			const K = this.kind[k];
			K.order = sites.filter((s) => s.kind === k);
			K.data = new Float32Array(K.order.length * INSTANCE_FLOATS);
		}
	}
	init(gl, maplibregl) {
		if (this.p) return;
		this.mc = maplibregl?.MercatorCoordinate;
		if (maplibregl?.MercatorCoordinate) {
			const O = maplibregl.MercatorCoordinate.fromLngLat([126.978, 37.5665]);
			this.O = {
				x: O.x,
				y: O.y
			};
			for (const s of this._sites) {
				const m = maplibregl.MercatorCoordinate.fromLngLat([s.lon, s.lat]);
				s.x = m.x;
				s.y = m.y;
				s.mu = m.meterInMercatorCoordinateUnits();
			}
		}
		this.p = compile(gl, VS, FS);
		this.uni = Object.fromEntries([
			"u_matrix",
			"u_time",
			"u_pal",
			"u_light",
			"u_lit",
			"u_eye"
		].map((n) => [n, gl.getUniformLocation(this.p, n)]));
		this.pB = compile(gl, BULB_VS, BULB_FS);
		this.uB = Object.fromEntries([
			"u_matrix",
			"u_time",
			"u_size",
			"u_core",
			"u_tier",
			"u_thin",
			"u_anim",
			"u_bright",
			"u_pal",
			"u_wt",
			"u_neonOn"
		].map((n) => [n, gl.getUniformLocation(this.pB, n)]));
		this.pW = compile(gl, BULB_VS, WIRE_FS);
		this.uW = Object.fromEntries([
			"u_matrix",
			"u_time",
			"u_size",
			"u_core",
			"u_tier",
			"u_thin",
			"u_anim",
			"u_bright",
			"u_pal",
			"u_wt",
			"u_neonOn",
			"u_wire"
		].map((n) => [n, gl.getUniformLocation(this.pW, n)]));
		this.bulbRGB = new Float32Array(BULB_PAL.flatMap(hexRGB));
		this.pN = compile(gl, NEON_VS, RIBBON_FS);
		this.uN = Object.fromEntries([
			"u_matrix",
			"u_time",
			"u_half",
			"u_core",
			"u_tier",
			"u_chase",
			"u_anim",
			"u_vp",
			"u_neon",
			"u_wt"
		].map((n) => [n, gl.getUniformLocation(this.pN, n)]));
		this.neonRGB = Object.fromEntries(Object.entries(NEON).map(([k, h]) => [k, new Float32Array(hexRGB(h))]));
		this.wireBuf = buildWire();
		this.kind = {};
		for (const k of KINDS) {
			const K = this.kind[k] = {
				order: [],
				inst: [gl.createBuffer(), gl.createBuffer()],
				data: null,
				lod: []
			};
			K.order = this._sites.filter((s) => s.kind === k);
			K.data = new Float32Array(K.order.length * INSTANCE_FLOATS);
			for (const b of K.inst) {
				gl.bindBuffer(gl.ARRAY_BUFFER, b);
				gl.bufferData(gl.ARRAY_BUFFER, K.data.byteLength, gl.DYNAMIC_DRAW);
			}
			for (const lod of [0, 1]) {
				const M = BUILD[k](lod), buf = M.buffer(), vb = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, vb);
				gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
				const va = gl.createVertexArray();
				gl.bindVertexArray(va);
				gl.bindBuffer(gl.ARRAY_BUFFER, vb);
				const S = 52;
				let o = 0;
				for (const [loc, n] of [
					[0, 3],
					[1, 3],
					[2, 3],
					[3, 4]
				]) {
					gl.enableVertexAttribArray(loc);
					gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, o);
					o += n * 4;
				}
				gl.bindVertexArray(null);
				K.lod[lod] = {
					va,
					vb,
					n: M.tris * 3,
					tris: M.tris
				};
			}
			const lit = (buf, count) => {
				const vb = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, vb);
				gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
				const va = gl.createVertexArray();
				gl.bindVertexArray(va);
				gl.bindBuffer(gl.ARRAY_BUFFER, vb);
				const S = 48;
				let o = 0;
				for (const [loc, n] of [
					[0, 3],
					[1, 3],
					[2, 4],
					[3, 2]
				]) {
					gl.enableVertexAttribArray(loc);
					gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, o);
					o += n * 4;
				}
				gl.bindVertexArray(null);
				return {
					va,
					vb,
					n: count
				};
			};
			const B = buildBulbs(k);
			K.bulb = lit(B.buffer(), B.n);
			{
				const N = buildNeon(k), buf = N.buffer();
				const vb = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, vb);
				gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
				const va = gl.createVertexArray();
				gl.bindVertexArray(va);
				gl.bindBuffer(gl.ARRAY_BUFFER, vb);
				let o = 0;
				for (const [loc, n] of [
					[0, 3],
					[1, 3],
					[2, 3],
					[3, 3],
					[9, 4],
					[10, 2]
				]) {
					gl.enableVertexAttribArray(loc);
					gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 72, o);
					o += n * 4;
				}
				gl.bindVertexArray(null);
				K.neon = {
					va,
					vb,
					n: N.n
				};
			}
			K.wire = lit(this.wireBuf, this.wireBuf.length / 12);
			K.tiers = [
				0,
				0,
				0
			];
			for (let i = 0; i < B.n; i++) K.tiers[B.d[i * 12 + 9]]++;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		this.ready = true;
	}
	instPtr(gl, K) {
		gl.bindBuffer(gl.ARRAY_BUFFER, K.inst[this.ping]);
		const IS = INSTANCE_FLOATS * 4;
		let o = 0;
		for (const [loc, n] of INST) {
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, n, gl.FLOAT, false, IS, o);
			gl.vertexAttribDivisor(loc, 1);
			o += n * 4;
		}
	}
	render(gl, matrix, opts = {}) {
		if (!this.ready) return;
		const t0 = performance.now();
		const { now = performance.now(), dark = false, zoom = 15, phone = false, reducedMotion = false, bounds, night = false, pixelRatio = 1 } = opts;
		const pal = opts.ridePalette || (dark ? RIDE_DARK : RIDE_LIGHT);
		if (this._palKey !== pal) {
			this._rgb = /* @__PURE__ */ new Float32Array(30);
			pal.forEach((h, i) => this._rgb.set(hexRGB(h), i * 3));
			this._palKey = pal;
		}
		const rgb = this._rgb;
		let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity;
		if (bounds) {
			x0 = Math.min(bounds[0], bounds[2]);
			x1 = Math.max(bounds[0], bounds[2]);
			y0 = Math.min(bounds[1], bounds[3]);
			y1 = Math.max(bounds[1], bounds[3]);
		}
		const EH = atZoom(zoom, EXAG_H), EV = atZoom(zoom, EXAG_V);
		const vis = [];
		for (const s of this._sites) {
			const eh = Math.min(s.lotte ? 1 : EH, s.maxExagH ?? EXAG_H[0]), ev = Math.min(s.lotte ? 1 : EV, s.maxExagV ?? EXAG_V[0]);
			const pad = ((s.base_m ?? 0) + s.top * ev + s.wide * eh) * s.mu + (bounds ? (x1 - x0) * .15 : 0);
			if (s.x < x0 - pad || s.x > x1 + pad || s.y < y0 - pad || s.y > y1 + pad) continue;
			vis.push(s);
		}
		const split = PARK_DEFAULTS.rides.detailZoom, h = PARK_DEFAULTS.lod.hysteresis;
		const lod = this.lod = zoom >= split + h ? 1 : zoom < split - h ? 0 : this.lod ?? (zoom >= split ? 1 : 0), ts = now / 1e3;
		for (const k of KINDS) this.kind[k].n = 0;
		for (const s of vis) {
			const K = this.kind[s.kind], d = K.data, i = K.n * INSTANCE_FLOATS;
			const eh = Math.min(s.lotte ? 1 : EH, s.maxExagH ?? EXAG_H[0]), ev = Math.min(s.lotte ? 1 : EV, s.maxExagV ?? EXAG_V[0]);
			d[i] = s.x - this.O.x;
			d[i + 1] = s.y - this.O.y;
			d[i + 2] = (s.base_m ?? 0) * s.mu;
			d[i + 3] = s.sxy * eh;
			d[i + 4] = s.sz * ev;
			d[i + 5] = s.mastR * eh;
			d[i + 6] = s.mu;
			d[i + 7] = s.phase;
			d[i + 8] = reducedMotion ? 0 : 1;
			d[i + 9] = s.period;
			d[i + 10] = s.yaw;
			d[i + 11] = s.colA;
			d[i + 12] = s.colB;
			d[i + 13] = s.struct;
			d[i + 14] = s.shade;
			d[i + 15] = s.lotte ? 0 : 1;
			d[i + 16] = s.collar;
			d[i + 17] = s.pole;
			d[i + 18] = s.hue;
			K.n++;
		}
		const MT = this.M;
		MT.set(matrix);
		for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r] * this.O.x + matrix[4 + r] * this.O.y + matrix[12 + r];
		gl.useProgram(this.p);
		gl.uniformMatrix4fv(this.uni.u_matrix, false, MT);
		gl.uniform1f(this.uni.u_time, ts);
		gl.uniform3fv(this.uni.u_pal, rgb);
		gl.uniform3fv(this.uni.u_light, SUN);
		gl.uniform3fv(this.uni.u_eye, eyeOf(MT));
		gl.uniform2fv(this.uni.u_lit, dark ? [PARK_DEFAULTS.night.rideAmbient, PARK_DEFAULTS.night.rideDirectional] : [.78, .22]);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.disable(gl.CULL_FACE);
		const ping = this.ping = this.ping ^ 1;
		for (const k of KINDS) {
			const K = this.kind[k];
			if (!K.n) continue;
			gl.bindBuffer(gl.ARRAY_BUFFER, K.inst[ping]);
			gl.bufferData(gl.ARRAY_BUFFER, K.data.byteLength, gl.DYNAMIC_DRAW);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, K.data, 0, K.n * INSTANCE_FLOATS);
		}
		let tris = 0;
		for (const k of KINDS) {
			const K = this.kind[k];
			if (!K.n) continue;
			const L = K.lod[lod];
			gl.bindVertexArray(L.va);
			this.instPtr(gl, K);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, L.n, K.n);
			tris += L.tris * K.n;
		}
		let bulbs = 0;
		if (night) {
			let tier = 0;
			const cap = (phone ? 2500 : 6e3) * .4;
			const count = (t) => KINDS.reduce((a, k) => a + this.kind[k].n * this.kind[k].tiers.slice(0, t + 1).reduce((x, y) => x + y, 0), 0);
			while (tier > 0 && count(tier) > cap) tier--;
			bulbs = count(tier);
			const thin = bulbs > cap ? Math.ceil(bulbs / cap) : 1;
			bulbs = Math.ceil(bulbs / thin);
			const sz = bulbSize(zoom, pixelRatio);
			gl.depthMask(false);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			const setUni = (u) => {
				gl.uniformMatrix4fv(u.u_matrix, false, MT);
				gl.uniform1f(u.u_time, ts);
				gl.uniform1f(u.u_size, sz.point);
				gl.uniform1f(u.u_core, sz.coreFrac);
				gl.uniform1f(u.u_tier, tier);
				gl.uniform1f(u.u_thin, thin);
				gl.uniform1f(u.u_anim, reducedMotion ? 0 : 1);
				gl.uniform1f(u.u_bright, PARK_DEFAULTS.night.rideEmission);
				gl.uniform3fv(u.u_pal, this.bulbRGB);
				gl.uniform2f(u.u_wt, .85, .12);
				gl.uniform1f(u.u_neonOn, neonOn);
			};
			const neonOn = zoom >= (phone ? 15 : 14) ? 1 : 0;
			if (neonOn) {
				const core = Math.min(1.8, Math.max(1.2, 1.2 + (zoom - 14) * .3));
				gl.useProgram(this.pN);
				gl.uniformMatrix4fv(this.uN.u_matrix, false, MT);
				gl.uniform1f(this.uN.u_time, ts);
				gl.uniform1f(this.uN.u_half, 1.4 * pixelRatio);
				gl.uniform1f(this.uN.u_core, core / 4);
				gl.uniform1f(this.uN.u_tier, zoom >= 14.5 ? 1 : 0);
				gl.uniform1f(this.uN.u_anim, reducedMotion ? 0 : 1);
				gl.uniform2f(this.uN.u_vp, gl.drawingBufferWidth, gl.drawingBufferHeight);
				gl.uniform2f(this.uN.u_wt, PARK_DEFAULTS.night.rideEmission, .12);
				for (const k of KINDS) {
					const K = this.kind[k];
					if (!K.n) continue;
					gl.uniform3fv(this.uN.u_neon, this.neonRGB[k]);
					gl.uniform1f(this.uN.u_chase, 0);
					gl.bindVertexArray(K.neon.va);
					this.instPtr(gl, K);
					gl.drawArraysInstanced(gl.TRIANGLES, 0, K.neon.n, K.n);
				}
			}
			if (tier >= 2) {
				gl.useProgram(this.pW);
				setUni(this.uW);
				gl.uniform1f(this.uW.u_thin, 1);
				gl.uniform4f(this.uW.u_wire, .459, .408, .325, .35);
				for (const k of KINDS) {
					const K = this.kind[k];
					if (K.n) {
						gl.bindVertexArray(K.wire.va);
						this.instPtr(gl, K);
						gl.drawArraysInstanced(gl.LINES, 0, K.wire.n, K.n);
					}
				}
			}
			gl.useProgram(this.pB);
			setUni(this.uB);
			for (const k of KINDS) {
				const K = this.kind[k];
				if (K.n) {
					gl.bindVertexArray(K.bulb.va);
					this.instPtr(gl, K);
					gl.drawArraysInstanced(gl.POINTS, 0, K.bulb.n, K.n);
				}
			}
		}
		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.disable(gl.CULL_FACE);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		this.stats = {
			tris,
			rides: vis.length,
			bulbs,
			moving: reducedMotion ? 0 : vis.length,
			ms: performance.now() - t0,
			lod
		};
		this._moving = !reducedMotion && vis.length > 0;
	}
	animating() {
		return !!this._moving;
	}
	dispose(gl) {
		if (!this.p) return;
		for (const k of KINDS) {
			const K = this.kind[k];
			for (const b of K.inst) gl.deleteBuffer(b);
			for (const L of [
				...K.lod,
				K.bulb,
				K.wire,
				K.neon
			]) {
				gl.deleteVertexArray(L.va);
				gl.deleteBuffer(L.vb);
			}
		}
		gl.deleteProgram(this.p);
		gl.deleteProgram(this.pB);
		gl.deleteProgram(this.pW);
		gl.deleteProgram(this.pN);
		this.p = null;
		this.kind = null;
		this.ready = false;
	}
};
export { RideLayer, RideLayer as default };
