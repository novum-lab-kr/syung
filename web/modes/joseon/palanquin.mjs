import { meshBuilder } from "../../bus/mesh.mjs";
// web/modes/joseon/palanquin.mts
function buildPalanquinMesh() {
	const { data, quad, box } = meshBuilder();
	const legBox = (x0, y0, z0, x1, y1, z1, uv) => {
		const U = [
			uv,
			uv,
			uv,
			uv
		];
		quad([
			x0,
			y0,
			z0
		], [
			x1,
			y0,
			z0
		], [
			x1,
			y0,
			z1
		], [
			x0,
			y0,
			z1
		], [
			0,
			-1,
			0
		], 20, U);
		quad([
			x1,
			y1,
			z0
		], [
			x0,
			y1,
			z0
		], [
			x0,
			y1,
			z1
		], [
			x1,
			y1,
			z1
		], [
			0,
			1,
			0
		], 20, U);
		quad([
			x1,
			y0,
			z0
		], [
			x1,
			y1,
			z0
		], [
			x1,
			y1,
			z1
		], [
			x1,
			y0,
			z1
		], [
			1,
			0,
			0
		], 20, U);
		quad([
			x0,
			y1,
			z0
		], [
			x0,
			y0,
			z0
		], [
			x0,
			y0,
			z1
		], [
			x0,
			y1,
			z1
		], [
			-1,
			0,
			0
		], 20, U);
		quad([
			x0,
			y0,
			z0
		], [
			x1,
			y0,
			z0
		], [
			x1,
			y1,
			z0
		], [
			x0,
			y1,
			z0
		], [
			0,
			0,
			-1
		], 20, U);
	};
	for (const y of [-.58, .58]) box(-1.55, y - .045, .78, 1.55, y + .045, .87, 27);
	box(-.66, -.5, .36, .66, .5, .42, 27);
	box(-.62, -.46, .42, .62, .46, 1.06, 24);
	for (const side of [-1, 1]) quad([
		-.4,
		side * .462,
		.58
	], [
		.4,
		side * .462,
		.58
	], [
		.4,
		side * .462,
		.96
	], [
		-.4,
		side * .462,
		.96
	], [
		0,
		side,
		0
	], 25);
	quad([
		.622,
		-.3,
		.5
	], [
		.622,
		.3,
		.5
	], [
		.622,
		.3,
		.98
	], [
		.622,
		-.3,
		.98
	], [
		1,
		0,
		0
	], 25);
	const E = [
		[-.72, -.58],
		[.72, -.58],
		[.72, .58],
		[-.72, .58]
	], T = [
		[-.57, -.26],
		[.57, -.26],
		[.57, .26],
		[-.57, .26]
	];
	for (let i = 0; i < 4; i++) {
		const j = (i + 1) % 4, a = E[i], b = E[j], c = T[j], d = T[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, l = Math.hypot(mx, my);
		quad([...a, 1.06], [...b, 1.06], [...c, 1.34], [...d, 1.34], [
			mx / l * .7,
			my / l * .7,
			.72
		], 26);
	}
	quad([
		-.72,
		-.58,
		1.06
	], [
		-.72,
		.58,
		1.06
	], [
		.72,
		.58,
		1.06
	], [
		.72,
		-.58,
		1.06
	], [
		0,
		0,
		-1
	], 24);
	quad([
		-.57,
		.26,
		1.341
	], [
		.57,
		.26,
		1.341
	], [
		.57,
		-.26,
		1.341
	], [
		-.57,
		-.26,
		1.341
	], [
		0,
		0,
		1
	], 26);
	quad([
		-.55,
		.24,
		1.343
	], [
		.55,
		.24,
		1.343
	], [
		.55,
		-.24,
		1.343
	], [
		-.55,
		-.24,
		1.343
	], [
		0,
		0,
		1
	], 28);
	[
		[
			1.22,
			.5,
			0
		],
		[
			1.22,
			-.5,
			0
		],
		[
			-1.22,
			.5,
			.5
		],
		[
			-1.22,
			-.5,
			.5
		]
	].forEach(([x, y, k]) => {
		for (const s of [-1, 1]) legBox(x - .05, y + s * .07 - .045, 0, x + .05, y + s * .07 + .045, .46, [x, s * (1 + k)]);
		box(x - .1, y - .14, .45, x + .1, y + .14, .78, 21);
		const out = Math.sign(y);
		box(x - .035, y + out * .12, .55, x + .035, y + out * .19, .84, 21);
		box(x - .07, y - .07, .78, x + .07, y + .07, .92, 22);
		box(x - .13, y - .13, .92, x + .13, y + .13, .94, 23);
		box(x - .065, y - .065, .94, x + .065, y + .065, 1.01, 23);
	});
	box(1.42, .51, .56, 1.56, .65, .76, 29);
	box(1.485, .575, .76, 1.495, .585, .8, 27);
	return new Float32Array(data);
}
var CHORONG_X = .95;
var CHORONG_RINGS = [
	[12.9, 5.25],
	[13.6, 5.8],
	[16.5, 6],
	[19.1, 6],
	[22.1, 5.8],
	[22.8, 5.25]
];
var CHORONG_CENTER = [
	3 - CHORONG_X,
	0,
	35.7 / 2
];
function buildChorongPostMesh() {
	const data = [];
	const put = (p, n, t, m) => data.push(p[0] - CHORONG_X, -p[2], p[1], n[0], -n[2], n[1], t[0], t[1], m);
	const tri = (a, b, c, m, ta = [0, 0], tb = [1, 0], tc = [1, 1]) => {
		const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
		const n = [
			ab[1] * ac[2] - ab[2] * ac[1],
			ab[2] * ac[0] - ab[0] * ac[2],
			ab[0] * ac[1] - ab[1] * ac[0]
		], len = Math.hypot(...n) || 1;
		for (const [p, t] of [
			[a, ta],
			[b, tb],
			[c, tc]
		]) put(p, n.map((v) => v / len), t, m);
	};
	const quad = (a, b, c, d, m, uv = [
		[0, 0],
		[1, 0],
		[1, 1],
		[0, 1]
	]) => {
		tri(a, b, c, m, uv[0], uv[1], uv[2]);
		tri(a, c, d, m, uv[0], uv[2], uv[3]);
	};
	const tube = (a, b, r0, r1, m, n = 8, cap = true) => {
		const v = b.map((x, i) => x - a[i]), len = Math.hypot(...v), axis = v.map((x) => x / len);
		const ref = Math.abs(axis[1]) > .9 ? [
			1,
			0,
			0
		] : [
			0,
			1,
			0
		];
		const u = [
			axis[1] * ref[2] - axis[2] * ref[1],
			axis[2] * ref[0] - axis[0] * ref[2],
			axis[0] * ref[1] - axis[1] * ref[0]
		], ul = Math.hypot(...u);
		for (let i = 0; i < 3; i++) u[i] /= ul;
		const w = [
			axis[1] * u[2] - axis[2] * u[1],
			axis[2] * u[0] - axis[0] * u[2],
			axis[0] * u[1] - axis[1] * u[0]
		];
		const point = (c, r, i) => {
			const t = i / n * Math.PI * 2;
			return c.map((x, j) => x + r * (u[j] * Math.cos(t) + w[j] * Math.sin(t)));
		};
		for (let i = 0; i < n; i++) {
			const p = point(a, r0, i), q = point(a, r0, i + 1), r = point(b, r1, i + 1), s = point(b, r1, i);
			quad(p, q, r, s, m);
			if (cap) {
				tri(a, q, p, m);
				tri(b, s, r, m);
			}
		}
	};
	tube([
		-4.8,
		.25,
		0
	], [
		-4.8,
		.9,
		0
	], 2.3, 1.8, 34, 8);
	const pole = [
		[
			-4.8,
			.7,
			0
		],
		[
			-4.55,
			9,
			0
		],
		[
			-4.1,
			17,
			0
		],
		[
			-3.8,
			25.15,
			0
		]
	];
	for (let i = 0; i < 3; i++) tube(pole[i], pole[i + 1], .43 - i * .03, .4 - i * .03, 30, 6);
	tube([
		-3.8,
		25.15,
		0
	], [
		-3.8,
		25.5,
		0
	], .34, .28, 30, 6);
	tube([
		-3.84,
		23.7,
		0
	], [
		3,
		24.55,
		0
	], .32, .24, 30, 6);
	tube([
		3,
		24.55,
		0
	], [
		3,
		22.92,
		0
	], .1, .1, 33, 4);
	const R = CHORONG_RINGS, H0 = R[0][0], H1 = R[R.length - 1][0], radial = 8;
	for (let j = 0; j < R.length - 1; j++) {
		const [y0, r0] = R[j], [y1, r1] = R[j + 1], m = j < 2 ? 32 : 31, v0 = (y0 - H0) / (H1 - H0), v1 = (y1 - H0) / (H1 - H0);
		for (let i = 0; i < radial; i++) {
			const a = i / radial * Math.PI * 2 + Math.PI / 8, b = (i + 1) / radial * Math.PI * 2 + Math.PI / 8;
			const p = (r, y, t) => [
				3 + r * Math.cos(t),
				y,
				r * Math.sin(t)
			];
			quad(p(r0, y0, a), p(r1, y1, a), p(r1, y1, b), p(r0, y0, b), m, [
				[0, v0],
				[0, v1],
				[1, v1],
				[1, v0]
			]);
		}
	}
	tube([
		3,
		12.62,
		0
	], [
		3,
		13,
		0
	], 5.36, 5.36, 30, radial);
	tube([
		3,
		22.75,
		0
	], [
		3,
		23.12,
		0
	], 5.36, 5.36, 30, radial);
	tube([
		3,
		12.58,
		.35
	], [
		3,
		11.85,
		.35
	], .17, .17, 33, 4);
	tube([
		3,
		11.85,
		.35
	], [
		3,
		9.6,
		.35
	], .48, .22, 35, 6);
	return new Float32Array(data);
}
function buildChorongGlowMesh() {
	const [x, y, z] = CHORONG_CENTER, r = 16, data = [];
	const P = [
		[
			x - r,
			y,
			z - r,
			0,
			0
		],
		[
			x + r,
			y,
			z - r,
			1,
			0
		],
		[
			x + r,
			y,
			z + r,
			1,
			1
		],
		[
			x - r,
			y,
			z + r,
			0,
			1
		]
	];
	for (const i of [
		0,
		1,
		2,
		0,
		2,
		3
	]) data.push(P[i][0], P[i][1], P[i][2], 0, -1, 0, P[i][3], P[i][4], 36);
	return new Float32Array(data);
}
export { CHORONG_CENTER, buildChorongGlowMesh, buildChorongPostMesh, buildPalanquinMesh };
