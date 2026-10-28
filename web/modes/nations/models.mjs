// web/modes/nations/models.mts
var A = (slot) => ({
	look: "accent",
	slot
});
var rect = (x, y, hx, hy) => [
	[x - hx, y - hy],
	[x + hx, y - hy],
	[x + hx, y + hy],
	[x - hx, y + hy]
];
var WALL = { look: "wall" };
var ROOF = { look: "roof" };
var F = .32;
var fit = (weight, o = {}) => ({
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
var bays = (M, per) => Math.max(1, Math.round(M.aspect * per));
function facade(M, { zA = 0, zB, nL, nS, w = .5, rows = null, glass = A(2), wall = WALL, sides = [-1, 1], ends = [-1, 1], cap = true }) {
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
var GREECE = [
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
				glass: A(0)
			});
			rim(M, h, .07, A(1));
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
				glass: A(0)
			});
			rim(M, h, .08, A(1));
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
				glass: A(0)
			});
			rim(M, h, .05, A(1));
			const r = Math.min(.75, .75 / Math.max(1, M.aspect * .6));
			M.frustum(0, 0, r, r, h, h + .06, {
				n: 12,
				...A(1)
			});
			M.dome(0, 0, r, h + .06, .32, {
				n: 12,
				rings: 4,
				...A(0)
			});
			M.box(.8, 0, .06 / M.aspect, .45, h, h + .42, A(1));
			M.box(.8, 0, .07 / M.aspect, .14, h + .18, h + .3, A(0));
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
				glass: A(0)
			});
			M.box(-.35, .25, .6, .7, h, h + F, WALL);
			rim(M, h, .07, A(1));
			rim(M, h + F, .05, A(1));
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
				rows: [[.1, .22], [.1 + F, .22 + F]],
				glass: A(0)
			});
			rim(M, h, .06, A(1));
			M.box(.55, 0, .45, 1.01, 0, F * .7, A(1));
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
				rim(M, z, .05, A(1));
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
				glass: A(0)
			});
			M.box(.15, -.1, .75, .75, h, h + F, WALL);
			M.box(.3, -.2, .45, .45, h + F, h + 2 * F, WALL);
			M.box(.3, -.2, .47, .47, h + 2 * F, h + 2 * F + .04, A(0));
			rim(M, h, .06, A(1));
			rim(M, h + F, .05, A(1));
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
					M.box(x, 0, t * 1.4, .46, h + rise * 1.08, h + rise * 1.15, A(1));
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
				M.box(x, 0, t * 1.3, .07, h + rise * .55, h + rise * .55 + .05, A(1));
			}
		}
	};
}
var NETHERLANDS = [
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
				band(M, sill(0) - .025, .02, .05, A(1));
				band(M, sill(floors - 2) - .025, .02, .05, A(1));
			}
			if (style === "balcony") for (let f = 0; f < floors - 1; f++) band(M, sill(f) - .022, .016, .04, A(1));
			if (style === "plain") band(M, .42 + F - .1, .03, .02, WALL);
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
				...style === "plain" ? ROOF : A(0),
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
					...A(0)
				});
			}
		}
	};
}
var PARIS = [...[
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
				...A(2)
			});
			else if (extra === "tanks") {
				M.frustum(-.5, .3, .1, .1, h, h + .13, {
					n: 8,
					...A(2)
				});
				M.frustum(-.15, .3, .1, .1, h, h + .13, {
					n: 8,
					...A(2)
				});
				M.dome(.5, -.4, .14, h + .06, .05, {
					n: 8,
					rings: 2,
					...A(1)
				});
				M.box(.5, -.4, .02, .03, h, h + .06, A(1));
			}
			if (extra === "plain" && !M.low) {
				M.box(-.3, 0, .5, .02, h + .12, h + .14, A(2));
				for (let k = 0; k < 3; k++) M.box(-.6 + k * .3, 0, .06, .03, h + .04, h + .12, [
					A(0),
					A(1),
					A(2)
				][k]);
			}
			if (extra === "rebar" && M.low) for (const [x, y] of [[-.8, -.8], [.8, .8]]) M.box(x, y, .015, .015, h, h + .25, A(2));
			else if (extra === "rebar") {
				for (const [x, y] of [
					[-.8, -.8],
					[.8, -.8],
					[-.8, .8],
					[.8, .8]
				]) M.box(x, y, .015, .015, h, h + .25, A(2));
				M.frustum(.3, .3, .1, .1, h, h + .13, {
					n: 8,
					...A(2)
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
					...A(0)
				});
				M.frustum(.85, .75, .1, .08, h, h + 1.2, {
					n: 8,
					...A(1)
				});
				M.dome(.85, .75, .09, h + 1.2, .14, {
					n: 8,
					rings: 2,
					...A(0)
				});
			}
		}
	};
}
var NATION_MODELS = {
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
var NATION_CELLS = {
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
export { NATION_CELLS, NATION_MODELS };
