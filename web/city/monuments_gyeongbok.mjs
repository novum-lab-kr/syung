import { GATE_BASE_D, GATE_DECK_Z } from "./monuments_data.mjs";
import { K, MeshWriter, bandBox, buildBrackets, buildRoof } from "./monument_parts.mjs";
import { buildPalaceFrames, buildPalaceHalls, buildPalaceWall } from "./monuments_palace.mjs";
// web/city/monuments_gyeongbok.mts
var BASE_W = 31;
var ARCHES = [
	{
		cx: -7.8,
		w: 4,
		h: 4.7
	},
	{
		cx: 0,
		w: 4.8,
		h: 5.4
	},
	{
		cx: 7.8,
		w: 4,
		h: 4.7
	}
];
var archBottom = (x) => {
	for (const arch of ARCHES) {
		const half = arch.w / 2, d = x - arch.cx;
		if (Math.abs(d) <= half + 1e-6) return arch.h - half + Math.sqrt(Math.max(0, half * half - d * d));
	}
	return -1;
};
function buildGate(w) {
	const hw = BASE_W / 2, hd = GATE_BASE_D / 2, zTop = GATE_DECK_Z + 6, zBand = GATE_DECK_Z + 7;
	w.box(-hw, hw, -hd, hd, 0, GATE_DECK_Z, K.granite, { top: true });
	const step = .2, count = Math.round(BASE_W / step);
	for (let i = 0; i < count; i++) {
		const x0 = -hw + i * step, x1 = x0 + step, open = archBottom((x0 + x1) / 2) >= 0;
		const z0 = open ? GATE_DECK_Z + archBottom(x0) : GATE_DECK_Z, z1 = open ? GATE_DECK_Z + archBottom(x1) : GATE_DECK_Z;
		for (const [y, n] of [[-hd, -1], [hd, 1]]) w.quad([
			x0,
			y,
			z0
		], [
			x1,
			y,
			z1
		], [
			x1,
			y,
			zTop
		], [
			x0,
			y,
			zTop
		], K.granite, [
			0,
			n,
			0
		]);
		if (open) {
			w.quad([
				x0,
				-hd,
				z0
			], [
				x1,
				-hd,
				z1
			], [
				x1,
				hd,
				z1
			], [
				x0,
				hd,
				z0
			], K.tunnel, [
				0,
				0,
				-1
			]);
			w.quad([
				x0,
				-hd,
				GATE_DECK_Z
			], [
				x1,
				-hd,
				GATE_DECK_Z
			], [
				x1,
				hd,
				GATE_DECK_Z
			], [
				x0,
				hd,
				GATE_DECK_Z
			], K.deck, [
				0,
				0,
				1
			]);
		}
		w.quad([
			x0,
			-hd,
			zTop
		], [
			x1,
			-hd,
			zTop
		], [
			x1,
			hd,
			zTop
		], [
			x0,
			hd,
			zTop
		], K.granite, [
			0,
			0,
			1
		]);
	}
	for (const arch of ARCHES) {
		const half = arch.w / 2, spring = arch.h - half;
		for (const side of [-1, 1]) w.quad([
			arch.cx + side * half,
			-hd,
			GATE_DECK_Z
		], [
			arch.cx + side * half,
			hd,
			GATE_DECK_Z
		], [
			arch.cx + side * half,
			hd,
			GATE_DECK_Z + spring
		], [
			arch.cx + side * half,
			-hd,
			GATE_DECK_Z + spring
		], K.tunnel, [
			-side,
			0,
			0
		]);
		for (const [y, n] of [[-hd, -1], [hd, 1]]) {
			const outerHalf = half + .55;
			for (let k = 0; k < 18; k++) {
				const a0 = Math.PI * k / 18, a1 = Math.PI * (k + 1) / 18;
				const p = (ang, r) => [
					arch.cx + Math.cos(ang) * r,
					y + n * .14,
					GATE_DECK_Z + spring + Math.sin(ang) * r
				];
				w.quad(p(a0, half), p(a1, half), p(a1, outerHalf), p(a0, outerHalf), K.trim, [
					0,
					n,
					0
				]);
			}
			for (const side of [-1, 1]) w.quad([
				arch.cx + side * half,
				y + n * .14,
				GATE_DECK_Z
			], [
				arch.cx + side * outerHalf,
				y + n * .14,
				GATE_DECK_Z
			], [
				arch.cx + side * outerHalf,
				y + n * .14,
				GATE_DECK_Z + spring
			], [
				arch.cx + side * half,
				y + n * .14,
				GATE_DECK_Z + spring
			], K.trim, [
				0,
				n,
				0
			]);
		}
	}
	w.box(-hw - .25, hw + .25, -hd - .25, hd + .25, zTop, zBand, K.band, { bottom: true });
	w.box(-hw - .45, hw + .45, -hd - .45, hd + .45, zBand, zBand + .16, K.granite, { bottom: true });
	buildPavilion(w, zBand + .16);
	buildWoldae(w);
}
function buildPavilion(w, base) {
	const bandH = 1.1;
	const lowerHx = 12, lowerHy = 3.9, lowerCol = base + 2;
	w.box(-11.7, 11.7, -3.9 + .2, 3.6999999999999997, base, lowerCol, K.tunnel, { top: true });
	for (const x of [
		-12,
		-4,
		lowerHx / 3,
		lowerHx
	]) for (const y of [
		-3.9,
		0,
		lowerHy
	]) w.box(x - .3, x + .3, y - .3, y + .3, base, lowerCol, K.red, {
		bottom: true,
		top: true
	});
	bandBox(w, 12.45, 4.35, lowerCol - .4, lowerCol, K.dancheong, 0, .28);
	bandBox(w, 12.45, 4.35, lowerCol, lowerCol + bandH, K.dancheong, .3, 1);
	buildBrackets(w, 12.45, 4.35, lowerCol + .1);
	buildRoof(w, {
		hx: 15.9,
		hy: 6.6,
		ix: 11,
		iy: 3.7,
		z0: base + 2.84,
		rise: 1.7,
		lift: 1.15,
		flare: .9
	}, {
		innerZ: lowerCol + bandH - .2,
		innerHx: 12.45,
		innerHy: 4.35
	});
	const upperHx = 10.5, upperHy = 3.2, upperFloor = base + 4.6, upperCol = upperFloor + 1.7, upperBase = upperFloor - .6;
	w.box(-10.35, 10.35, -3.2 + .15, 3.0500000000000003, upperBase, upperCol, K.wood, { top: true });
	for (const x of [
		-10.5,
		-10.5 / 3,
		upperHx / 3,
		upperHx
	]) for (const y of [
		-3.2,
		0,
		upperHy
	]) w.box(x - .28, x + .28, y - .28, y + .28, upperBase, upperCol, K.red, {
		bottom: true,
		top: true
	});
	bandBox(w, 10.95, 3.6500000000000004, upperCol - .4, upperCol, K.dancheong, 0, .28);
	bandBox(w, 10.95, 3.6500000000000004, upperCol, upperCol + bandH, K.dancheong, .3, 1);
	buildBrackets(w, 10.95, 3.6500000000000004, upperCol + .1);
	const plaqueZ = upperFloor - .05, plaqueY = -3.2 - .16;
	w.quad([
		-2.5,
		plaqueY,
		plaqueZ
	], [
		2.5,
		plaqueY,
		plaqueZ
	], [
		2.5,
		plaqueY,
		plaqueZ + 1.65
	], [
		-2.5,
		plaqueY,
		plaqueZ + 1.65
	], K.plaque, [
		0,
		-1,
		0
	], 0, 0, 1, 1);
	const upperEave = upperCol + bandH - .1, ridgeTop = GATE_DECK_Z + 19;
	buildRoof(w, {
		hx: 15,
		hy: 6,
		ix: 9,
		iy: 0,
		z0: upperEave,
		rise: ridgeTop - .62 - upperEave,
		lift: 1.3,
		flare: 1
	}, {
		innerZ: upperCol + bandH - .2,
		innerHx: 10.95,
		innerHy: 3.6500000000000004
	});
}
function buildWoldae(w) {
	const halfW = 24.35, yN = -GATE_BASE_D / 2, yS = yN - 29.7;
	for (let tier = 0; tier < 3; tier++) {
		const out = .4 * (2 - tier), z0 = GATE_DECK_Z / 3 * tier, z1 = GATE_DECK_Z / 3 * (tier + 1);
		w.box(-24.35 - out, halfW + out, yS - out, yN, z0, z1, K.granite, {
			bottom: true,
			top: true
		});
		w.quad([
			-24.35 - out,
			yS - out,
			z1
		], [
			halfW + out,
			yS - out,
			z1
		], [
			halfW + out,
			yN,
			z1
		], [
			-24.35 - out,
			yN,
			z1
		], tier === 2 ? K.deck : K.trim, [
			0,
			0,
			1
		]);
	}
	for (let k = 0; k < 3; k++) w.box(-3.5, 3.5, yS - .8 - (2 - k) * .8, yS - .8 + 0, GATE_DECK_Z / 3 * k, GATE_DECK_Z / 3 * (k + 1), K.trim, { top: false });
	for (const side of [-1, 1]) {
		const xa = side * 3.5, xb = side * 4.2, yFront = yS - 2.4, yBack = yS + .6;
		w.quad([
			xa,
			yFront,
			.45
		], [
			xb,
			yFront,
			.45
		], [
			xb,
			yBack,
			GATE_DECK_Z + 1
		], [
			xa,
			yBack,
			GATE_DECK_Z + 1
		], K.trim, [
			0,
			0,
			1
		]);
		w.quad([
			xb,
			yFront,
			0
		], [
			xb,
			yBack,
			0
		], [
			xb,
			yBack,
			GATE_DECK_Z + 1
		], [
			xb,
			yFront,
			.45
		], K.trim, [
			side,
			0,
			0
		]);
		w.quad([
			xa,
			yFront,
			0
		], [
			xa,
			yBack,
			0
		], [
			xa,
			yBack,
			GATE_DECK_Z + 1
		], [
			xa,
			yFront,
			.45
		], K.trim, [
			-side,
			0,
			0
		]);
		w.quad([
			xa,
			yFront,
			0
		], [
			xb,
			yFront,
			0
		], [
			xb,
			yFront,
			.45
		], [
			xa,
			yFront,
			.45
		], K.trim, [
			0,
			-1,
			0
		]);
		buildHaechi(w, side * 4.9, yFront - .9);
	}
	const rail = (ax, ay, bx, by, out) => {
		const len = Math.hypot(bx - ax, by - ay), count = Math.max(1, Math.round(len / 2.4));
		for (let i = 0; i <= count; i++) {
			const t = i / count, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
			w.box(x - .17, x + .17, y - .17, y + .17, GATE_DECK_Z, GATE_DECK_Z + 1.15, K.trim, { bottom: true });
			w.box(x - .12, x + .12, y - .12, y + .12, GATE_DECK_Z + 1.15, GATE_DECK_Z + 1.4, K.trim, { bottom: true });
		}
		const nx = Math.abs(out[0]) ? .1 : 0, ny = Math.abs(out[1]) ? .1 : 0, x0 = Math.min(ax, bx) - nx, x1 = Math.max(ax, bx) + nx, y0 = Math.min(ay, by) - ny, y1 = Math.max(ay, by) + ny;
		w.box(x0, x1, y0, y1, GATE_DECK_Z + .72, GATE_DECK_Z + .9, K.trim, { bottom: true });
		w.box(x0, x1, y0, y1, GATE_DECK_Z, GATE_DECK_Z + .22, K.trim, { bottom: true });
	};
	rail(-24.35 + .2, yS + .2, -3.9, yS + .2, [
		0,
		-1,
		0
	]);
	rail(3.9, yS + .2, 24.150000000000002, yS + .2, [
		0,
		-1,
		0
	]);
	rail(-24.35 + .2, yS + .2, -24.35 + .2, yN - 1.2, [
		-1,
		0,
		0
	]);
	rail(24.150000000000002, yS + .2, 24.150000000000002, yN - 1.2, [
		1,
		0,
		0
	]);
	rail(-24.35 + .2, yN - .2, -BASE_W / 2 - .6, yN - .2, [
		0,
		1,
		0
	]);
	rail(BASE_W / 2 + .6, yN - .2, 24.150000000000002, yN - .2, [
		0,
		1,
		0
	]);
}
function buildHaechi(w, x, y) {
	const part = (x0, x1, y0, y1, z0, z1) => w.box(x + x0, x + x1, y + y0, y + y1, z0, z1, K.haechi, { bottom: true });
	part(-.85, .85, -1.3, 1.3, 0, .3);
	part(-.62, .62, 0, 1.05, .3, 1.2);
	part(-.46, .46, -.5, .75, .3, 1.5);
	part(-.5, -.28, -.78, -.42, .3, 1.25);
	part(.28, .5, -.78, -.42, .3, 1.25);
	part(-.5, .5, -.7, -.3, 1, 1.65);
	part(-.42, .42, -.72, -.25, 1.5, 1.95);
	part(-.62, .62, -.35, .25, 1.15, 2.05);
	part(-.52, .52, -1.15, -.45, 1.55, 2.2);
	part(-.34, .34, -1.45, -1.15, 1.6, 1.98);
	part(-.56, .56, -1.2, -.95, 2, 2.3);
	part(-.18, .18, -1.28, -1.05, 1.25, 1.62);
	part(-.66, -.5, -.9, -.65, 2.05, 2.5);
	part(.5, .66, -.9, -.65, 2.05, 2.5);
	part(-.14, .14, .95, 1.3, .5, 1.3);
}
var YI = {
	plinth: .5,
	shaftTop: 10.5,
	height: 6.5
};
function buildYiSunsin(w) {
	const z = YI.shaftTop;
	w.box(-5.2, 5.2, -5.2, 5.2, 0, .3, K.stone, { bottom: true });
	w.box(-4.2, 4.2, -4.2, 4.2, .3, YI.plinth, K.stone, { bottom: true });
	w.box(-1.9, 1.9, -1.7, 1.7, YI.plinth, 1.5, K.stone, { bottom: true });
	w.frustum(0, 0, 1.4, 1.25, 1.5, 1.18, 1.08, z - .3, K.stone, { bottom: true });
	w.box(-1.3, 1.3, -1.18, 1.18, z - .3, z, K.stone, { bottom: true });
	const sy = -3.2, sz = YI.plinth;
	w.box(-.6, .6, -4.5, -1.9000000000000001, sz, sz + .22, K.stone, { bottom: true });
	w.frustum(0, sy, .55, 1.3, sz + .22, .42, 1.1, sz + .62, K.bronze, { bottom: true });
	w.frustum(0, sy, .42, 1, sz + .62, .2, .7, sz + .98, K.bronze, { bottom: true });
	w.box(-.17, .17, -4.75, -4.300000000000001, sz + .5, sz + .85, K.bronze, { bottom: true });
	for (const x of [-2.4, 2.4]) {
		w.prism(x, -3, .5, sz, sz + .55, K.bronze, 12);
		w.prism(x, -3, .56, sz + .12, sz + .2, K.trim, 12);
	}
	w.box(-.8, -.1, -.85, .5, z, z + .4, K.bronze, { bottom: true });
	w.box(.1, .8, -.85, .5, z, z + .4, K.bronze, { bottom: true });
	w.frustum(0, 0, 1.05, .6, z + .3, .68, .5, z + 2.9, K.bronze, { bottom: true });
	w.box(-.8, .8, -.55, .55, z + 2.8, z + 3.1, K.trim, { bottom: true });
	w.frustum(0, 0, .65, .48, z + 3.05, .95, .52, z + 4.5, K.bronze, { bottom: true });
	for (const x of [-1.05, 1.05]) w.frustum(x, 0, .3, .36, z + 4.7, .22, .3, z + 3.9, K.bronze, { bottom: true });
	w.box(-1.45, -.85, -.5, .25, z + 3, z + 4.2, K.bronze, { bottom: true });
	w.box(-1.65, -1.1, -.9, -.45, z + 3.2, z + 3.75, K.bronze, { bottom: true });
	w.box(-1.55, -1.3, -.8, -.55, z + .5, z + 4.9, K.bronze, { bottom: true });
	w.box(-1.7, -1.15, -.88, -.48, z + 3.75, z + 3.9, K.trim, { bottom: true });
	w.box(.85, 1.7, -.1, .4, z + 3, z + 4.2, K.bronze, { bottom: true });
	w.box(.5, 1.3, -.45, 0, z + 2.85, z + 3.2, K.bronze, { bottom: true });
	w.box(-.25, .25, -.25, .25, z + 4.4, z + 4.7, K.bronze, { bottom: true });
	w.box(-.42, .42, -.42, .36, z + 4.6, z + 5.2, K.bronze, { bottom: true });
	w.box(-.12, .12, -.46, -.3, z + 4.7, z + 4.95, K.bronze, { bottom: true });
	w.frustum(0, 0, .52, .48, z + 5.15, .3, .28, z + 6.1, K.bronze, { bottom: true });
	w.box(-.5, .5, .3, .55, z + 4.7, z + 5.5, K.bronze, { bottom: true });
	w.box(-.07, .07, -.07, .07, z + 6.05, z + YI.height, K.bronze, { bottom: true });
}
var SEJONG = {
	baseTop: 3.4,
	total: 6.2
};
function buildSejong(w) {
	const z = SEJONG.baseTop, G = K.gilt;
	w.frustum(0, 0, 4.25, 3.1, 0, 2.7, 2.1, z, K.stone, { bottom: true });
	for (const [x, kind] of [
		[-3, 0],
		[0, 1],
		[3, 2]
	]) {
		const y = -5.2;
		w.box(x - .45, x + .45, -5.65, -4.75, 0, .85, K.stone, { bottom: true });
		if (kind === 0) w.frustum(x, y, .5, .5, .85, .72, .72, 1.25, G, { bottom: true });
		else if (kind === 1) w.prism(x, y, .22, .85, 1.55, G, 10);
		else {
			w.prism(x, y, .5, .85, 1, G, 8);
			w.frustum(x, y, .42, .42, 1, .42, .42, 1.8, G, { bottom: true });
			w.frustum(x, y, .55, .08, 1.15, .55, .08, 1.65, G, { bottom: true });
		}
	}
	w.box(-1.75, 1.75, -1.25, 1, z, z + .65, K.bronze, { bottom: true });
	w.box(-1.75, 1.75, .55, 1, z + .5, z + 3.1, K.bronze, { bottom: true });
	for (const x of [-1.7, 1.7]) w.box(x - .12, x + .12, .45, 1.05, z + .5, z + 3.3, K.bronze, { bottom: true });
	for (const x of [-1.55, 1.55]) w.box(x - .15, x + .15, -.85, .85, z + 2.75, z + 3.05, K.bronze, { bottom: true });
	const seat = z + .65;
	for (const x of [-.45, .45]) w.box(x - .22, x + .22, -1.35, -.6, seat, seat + .25, G, { bottom: true });
	w.frustum(0, -.55, 1.45, 1.1, seat, .95, .8, seat + 1.9, G, { bottom: true });
	for (const x of [-.6, .6]) w.frustum(x, -.95, .45, .6, seat + 1.2, .4, .5, seat + 2.3, G, { bottom: true });
	w.frustum(0, 0, .8, .55, seat + 1.2, 1, .5, seat + 3, G, { bottom: true });
	w.box(-.45, .45, -.6, -.25, seat + 1.7, seat + 2.6, G, { bottom: true });
	w.frustum(-1.05, -.4, .45, .35, seat + 2, .5, .4, seat + 2.95, G, { bottom: true });
	w.frustum(-1.3, -.75, .55, .4, seat + 1.9, .3, .25, seat + 2.9, G, { bottom: true });
	w.box(-1.55, -1.2, -1.05, -.8, seat + 2.8, seat + 3.4, G, { bottom: true });
	w.frustum(1.05, -.4, .4, .3, seat + 1.7, .45, .35, seat + 2.5, G, { bottom: true });
	w.frustum(1.25, -.85, .5, .4, seat + 1.2, .3, .25, seat + 1.9, G, { bottom: true });
	w.box(.55, 1.8, -1.5, -.7, seat + 1.2, seat + 1.35, G, { bottom: true });
	w.box(1.25, 1.8, -1.5, -.7, seat + 1.35, seat + 1.6, G, { bottom: true });
	w.box(-.2, .2, -.25, .1, seat + 2.95, seat + 3.2, G, { bottom: true });
	w.box(-.42, .42, -.42, .3, seat + 3.15, seat + 3.95, G, { bottom: true });
	w.box(-.18, .18, -.55, -.35, seat + 3, seat + 3.45, G, { bottom: true });
	w.frustum(0, -.05, .42, .4, seat + 3.9, .36, .34, seat + 4.55, G, { bottom: true });
	for (const x of [-1, 1]) w.box(x * .5 - .12, x * .5 + .12, 0, .4, seat + 4, seat + 4.4, G, { bottom: true });
}
function buildGwanghwamun() {
	const w = new MeshWriter();
	buildGate(w);
	return new Float32Array(w.data);
}
var BUILDERS = {
	gwanghwamun: buildGate,
	"yi-sunsin": buildYiSunsin,
	sejong: buildSejong,
	"palace-wall": buildPalaceWall,
	"palace-halls": buildPalaceHalls,
	"palace-frames": buildPalaceFrames
};
function buildMonument(id) {
	const build = BUILDERS[id];
	if (!build) throw new Error(`기념물 모델 없음: ${id}`);
	const w = new MeshWriter();
	build(w);
	return new Float32Array(w.data);
}
export { buildGwanghwamun, buildMonument };
