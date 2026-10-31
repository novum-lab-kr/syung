var K = {
	granite: 0,
	trim: 1,
	red: 2,
	dancheong: 3,
	band: 4,
	giwa: 5,
	ridge: 6,
	wood: 7,
	fascia: 8,
	plaque: 9,
	soffit: 10,
	deck: 11,
	tunnel: 12,
	haechi: 13,
	brick: 14,
	bracket: 15,
	bronze: 16,
	gilt: 17,
	stone: 18,
	plaster: 19
};
var COLORS = [
	"#E6E0D2",
	"#F4F1EA",
	"#A8362A",
	"#3B7C68",
	"#3A3836",
	"#4B5357",
	"#A9A79F",
	"#3E6B56",
	"#2F6A58",
	"#15110E",
	"#356B58",
	"#F1E3C0",
	"#2A2722",
	"#CFC8B8",
	"#D9D3C6",
	"#3B7C68",
	"#3F4E44",
	"#B9954C",
	"#CFC9BC",
	"#D6CBB0"
];
var hex = (value) => {
	const v = parseInt(value.slice(1), 16);
	return [
		(v >> 16 & 255) / 255,
		(v >> 8 & 255) / 255,
		(v & 255) / 255
	];
};
var MeshWriter = class {
	data = [];
	xf = null;
	dz = 0;
	tri(a, b, c, kind, hint, sa = 0, sb = 0, sc = 0) {
		if (this.dz) {
			a = [
				a[0],
				a[1],
				a[2] + this.dz
			];
			b = [
				b[0],
				b[1],
				b[2] + this.dz
			];
			c = [
				c[0],
				c[1],
				c[2] + this.dz
			];
		}
		if (this.xf) {
			const { x, y, cos, sin } = this.xf;
			a = [
				x + a[0] * cos - a[1] * sin,
				y + a[0] * sin + a[1] * cos,
				a[2]
			];
			b = [
				x + b[0] * cos - b[1] * sin,
				y + b[0] * sin + b[1] * cos,
				b[2]
			];
			c = [
				x + c[0] * cos - c[1] * sin,
				y + c[0] * sin + c[1] * cos,
				c[2]
			];
			hint = [
				hint[0] * cos - hint[1] * sin,
				hint[0] * sin + hint[1] * cos,
				hint[2]
			];
		}
		const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz);
		if (len < 1e-9) return;
		nx /= len;
		ny /= len;
		nz /= len;
		if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
			nx = -nx;
			ny = -ny;
			nz = -nz;
		}
		for (const [p, s] of [
			[a, sa],
			[b, sb],
			[c, sc]
		]) this.data.push(p[0], p[1], p[2], nx, ny, nz, kind, s);
	}
	quad(a, b, c, e, kind, hint, sa = 0, sb = 0, sc = 0, se = 0) {
		this.tri(a, b, c, kind, hint, sa, sb, sc);
		this.tri(a, c, e, kind, hint, sa, sc, se);
	}
	box(x0, x1, y0, y1, z0, z1, kind, skip = {}) {
		this.quad([
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
		], kind, [
			0,
			-1,
			0
		]);
		this.quad([
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
		], kind, [
			0,
			1,
			0
		]);
		this.quad([
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
		], kind, [
			-1,
			0,
			0
		]);
		this.quad([
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
		], kind, [
			1,
			0,
			0
		]);
		if (!skip.top) this.quad([
			x0,
			y0,
			z1
		], [
			x1,
			y0,
			z1
		], [
			x1,
			y1,
			z1
		], [
			x0,
			y1,
			z1
		], kind, [
			0,
			0,
			1
		]);
		if (!skip.bottom) this.quad([
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
		], kind, [
			0,
			0,
			-1
		]);
	}
	frustum(cx, cy, hx0, hy0, z0, hx1, hy1, z1, kind, skip = {}) {
		const A = [
			cx - hx0,
			cy - hy0,
			z0
		], B = [
			cx + hx0,
			cy - hy0,
			z0
		], C = [
			cx + hx0,
			cy + hy0,
			z0
		], D = [
			cx - hx0,
			cy + hy0,
			z0
		];
		const E = [
			cx - hx1,
			cy - hy1,
			z1
		], F = [
			cx + hx1,
			cy - hy1,
			z1
		], G = [
			cx + hx1,
			cy + hy1,
			z1
		], H = [
			cx - hx1,
			cy + hy1,
			z1
		];
		this.quad(A, B, F, E, kind, [
			0,
			-1,
			0
		]);
		this.quad(C, D, H, G, kind, [
			0,
			1,
			0
		]);
		this.quad(D, A, E, H, kind, [
			-1,
			0,
			0
		]);
		this.quad(B, C, G, F, kind, [
			1,
			0,
			0
		]);
		if (!skip.top) this.quad(E, F, G, H, kind, [
			0,
			0,
			1
		]);
		if (!skip.bottom) this.quad(A, B, C, D, kind, [
			0,
			0,
			-1
		]);
	}
	prism(cx, cy, radius, z0, z1, kind, sides = 10) {
		for (let i = 0; i < sides; i++) {
			const a0 = Math.PI * 2 * i / sides, a1 = Math.PI * 2 * (i + 1) / sides, p0 = [cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius], p1 = [cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius], mid = (a0 + a1) / 2;
			this.quad([
				p0[0],
				p0[1],
				z0
			], [
				p1[0],
				p1[1],
				z0
			], [
				p1[0],
				p1[1],
				z1
			], [
				p0[0],
				p0[1],
				z1
			], kind, [
				Math.cos(mid),
				Math.sin(mid),
				0
			]);
			this.tri([
				cx,
				cy,
				z1
			], [
				p0[0],
				p0[1],
				z1
			], [
				p1[0],
				p1[1],
				z1
			], kind, [
				0,
				0,
				1
			]);
		}
	}
};
var corner = (R, c, inner) => {
	const [sx, sy] = [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1]
	][c];
	return inner ? [sx * R.ix, sy * R.iy] : [sx * R.hx, sy * R.hy];
};
function eaveXY(R, face, s) {
	const [ax, ay] = corner(R, face, false), [bx, by] = corner(R, (face + 1) % 4, false);
	const [sx, sy] = corner(R, s < .5 ? face : (face + 1) % 4, false), amount = R.flare * Math.abs(2 * s - 1) ** 3, norm = Math.hypot(sx, sy) || 1;
	return [ax + (bx - ax) * s + sx / norm * amount, ay + (by - ay) * s + sy / norm * amount];
}
var eaveZ = (R, s) => R.z0 + R.lift * Math.abs(2 * s - 1) ** 2.2;
function roofPoint(R, face, s, t) {
	const [ex, ey] = eaveXY(R, face, s), [ax, ay] = corner(R, face, true), [bx, by] = corner(R, (face + 1) % 4, true), ix = ax + (bx - ax) * s, iy = ay + (by - ay) * s;
	const z = R.z0 + R.rise * t ** 1.35 + R.lift * Math.abs(2 * s - 1) ** 2.2 * (1 - t) ** 1.6;
	return [
		ex + (ix - ex) * t,
		ey + (iy - ey) * t,
		z
	];
}
var FACE_OUT = [
	[
		0,
		-1,
		0
	],
	[
		1,
		0,
		0
	],
	[
		0,
		1,
		0
	],
	[
		-1,
		0,
		0
	]
];
function buildRoof(w, R, edge) {
	const SIDE = R.steps?.side ?? 28, SLOPE = R.steps?.slope ?? 6;
	const sideLen = (face) => Math.hypot(...corner(R, face, false).map((v, i) => corner(R, (face + 1) % 4, false)[i] - v));
	for (let face = 0; face < 4; face++) {
		const len = sideLen(face), out = FACE_OUT[face];
		for (let i = 0; i < SIDE; i++) {
			const s0 = i / SIDE, s1 = (i + 1) / SIDE, m0 = s0 * len, m1 = s1 * len;
			for (let j = 0; j < SLOPE; j++) {
				const t0 = j / SLOPE, t1 = (j + 1) / SLOPE;
				w.quad(roofPoint(R, face, s0, t0), roofPoint(R, face, s1, t0), roofPoint(R, face, s1, t1), roofPoint(R, face, s0, t1), K.giwa, [
					0,
					0,
					1
				], m0, m1, m1, m0);
			}
			const a = eaveXY(R, face, s0), b = eaveXY(R, face, s1), za = eaveZ(R, s0), zb = eaveZ(R, s1), inset = .38;
			const ia = [a[0] - out[0] * inset, a[1] - out[1] * inset], ib = [b[0] - out[0] * inset, b[1] - out[1] * inset];
			w.quad([
				a[0],
				a[1],
				za - .3
			], [
				b[0],
				b[1],
				zb - .3
			], [
				b[0],
				b[1],
				zb + .06
			], [
				a[0],
				a[1],
				za + .06
			], K.fascia, out, m0, m1, m1, m0);
			w.quad([
				a[0],
				a[1],
				za - .3
			], [
				b[0],
				b[1],
				zb - .3
			], [
				ib[0],
				ib[1],
				zb - .3
			], [
				ia[0],
				ia[1],
				za - .3
			], K.soffit, [
				0,
				0,
				-1
			], m0, m1, m1, m0);
			w.quad([
				ia[0],
				ia[1],
				za - .86
			], [
				ib[0],
				ib[1],
				zb - .86
			], [
				ib[0],
				ib[1],
				zb - .3
			], [
				ia[0],
				ia[1],
				za - .3
			], K.fascia, out, m0 + .19, m1 + .19, m1 + .19, m0 + .19);
			const fx = (p) => Math.abs(out[0]) ? Math.sign(out[0]) * edge.innerHx : Math.max(-edge.innerHx, Math.min(edge.innerHx, p[0])), fy = (p) => Math.abs(out[1]) ? Math.sign(out[1]) * edge.innerHy : Math.max(-edge.innerHy, Math.min(edge.innerHy, p[1]));
			w.quad([
				ia[0],
				ia[1],
				za - .86
			], [
				ib[0],
				ib[1],
				zb - .86
			], [
				fx(ib),
				fy(ib),
				edge.innerZ
			], [
				fx(ia),
				fy(ia),
				edge.innerZ
			], K.soffit, [
				0,
				0,
				-1
			], m0, m1, m1, m0);
		}
	}
	const ribbon = (pts, half, lift) => {
		for (let i = 0; i + 1 < pts.length; i++) {
			const p = pts[i], q = pts[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len * half, ny = dx / len * half;
			w.quad([
				p[0] - nx,
				p[1] - ny,
				p[2] + lift
			], [
				p[0] + nx,
				p[1] + ny,
				p[2] + lift
			], [
				q[0] + nx,
				q[1] + ny,
				q[2] + lift
			], [
				q[0] - nx,
				q[1] - ny,
				q[2] + lift
			], K.ridge, [
				0,
				0,
				1
			]);
		}
	};
	for (let c = 0; c < 4; c++) {
		const line = [];
		for (let j = 0; j <= SLOPE * 2; j++) line.push(roofPoint(R, c, 0, j / (SLOPE * 2)));
		ribbon(line, .3, .14);
	}
	if (R.iy === 0) {
		const zr = R.z0 + R.rise;
		w.box(-R.ix, R.ix, -.42, .42, zr - .1, zr + .62, K.ridge, { bottom: true });
	}
}
function buildBrackets(w, hx, hy, z) {
	for (const [vertical, half, along] of [[
		false,
		hy,
		hx
	], [
		true,
		hx,
		hy
	]]) {
		const count = Math.round(along * 2 / 1.55);
		for (const side of [-1, 1]) for (let i = 0; i <= count; i++) {
			const pos = -along + 2 * along * i / count;
			for (const [out, width, z0, z1] of [[
				.4,
				.3,
				z,
				z + .38
			], [
				.75,
				.42,
				z + .38,
				z + .7
			]]) {
				const face = side * half, far = face + side * out;
				if (vertical) w.box(Math.min(face, far), Math.max(face, far), pos - width, pos + width, z0, z1, K.bracket, { bottom: false });
				else w.box(pos - width, pos + width, Math.min(face, far), Math.max(face, far), z0, z1, K.bracket, { bottom: false });
			}
		}
	}
}
function bandBox(w, hx, hy, z0, z1, kind, sa, sb) {
	for (const [a, b, n] of [
		[
			[
				-1,
				-1,
				0
			],
			[
				1,
				-1,
				0
			],
			[
				0,
				-1,
				0
			]
		],
		[
			[
				1,
				-1,
				0
			],
			[
				1,
				1,
				0
			],
			[
				1,
				0,
				0
			]
		],
		[
			[
				1,
				1,
				0
			],
			[
				-1,
				1,
				0
			],
			[
				0,
				1,
				0
			]
		],
		[
			[
				-1,
				1,
				0
			],
			[
				-1,
				-1,
				0
			],
			[
				-1,
				0,
				0
			]
		]
	]) w.quad([
		a[0] * hx,
		a[1] * hy,
		z0
	], [
		b[0] * hx,
		b[1] * hy,
		z0
	], [
		b[0] * hx,
		b[1] * hy,
		z1
	], [
		a[0] * hx,
		a[1] * hy,
		z1
	], kind, n, sa, sa, sb, sb);
}
export { COLORS, FACE_OUT, K, MeshWriter, bandBox, buildBrackets, buildRoof, corner, eaveXY, eaveZ, hex, roofPoint };
