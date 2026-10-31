import { CDG_AT, CDG_ORIGIN, cdgRing } from "./monuments_data.mjs";
import { toM } from "./life.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { CDG_BUILDINGS } from "./monuments_changdeokgung_data.mjs";
import { CDG_TREES } from "./monuments_changdeokgung_trees_data.mjs";
import { CDG_TORCHES } from "./monuments_changdeokgung_torches_data.mjs";
import { FINE, MID, ROUGH, buildFrameOutline, buildFrames, buildWallLine, clamp, frameOf, hall, place, rectOf } from "./monuments_hanok.mjs";
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
function buildFanPavilion(w, r) {
	const hx = Math.max(2, r.len / 2 - .3), radius = hx * 2, half = clamp(Math.atan2(Math.max(1, r.wid / 2 - .3), radius * .75), .35, 1.1), floor = .7, steps = 9;
	const arc = (rad, z, k) => {
		const a = -half + 2 * half * k / steps;
		return [
			-hx + Math.cos(a) * rad,
			Math.sin(a) * rad,
			z
		];
	};
	const apex = (z) => [
		-hx,
		0,
		z
	];
	for (let k = 0; k < steps; k++) {
		w.tri(apex(floor), arc(radius + .4, floor, k), arc(radius + .4, floor, k + 1), K.deck, [
			0,
			0,
			1
		]);
		const mid = -half + 2 * half * (k + .5) / steps;
		w.quad(arc(radius + .4, 0, k), arc(radius + .4, 0, k + 1), arc(radius + .4, floor, k + 1), arc(radius + .4, floor, k), K.granite, [
			Math.cos(mid),
			Math.sin(mid),
			0
		]);
	}
	for (const k of [
		0,
		3,
		6,
		9
	]) {
		const [x, y] = arc(radius, 0, k);
		w.box(x - .2, x + .2, y - .2, y + .2, floor, 3.3, K.red, {
			bottom: true,
			top: true
		});
	}
	w.box(-hx - .2, -hx + .2, -.2, .2, floor, 3.3, K.red, {
		bottom: true,
		top: true
	});
	const eaveZ = 3.3, over = 1.3;
	for (let k = 0; k < steps; k++) {
		const mid = -half + 2 * half * (k + .5) / steps, hint = [
			Math.cos(mid) * .5,
			Math.sin(mid) * .5,
			.85
		];
		w.tri(apex(4.9), arc(radius + over, eaveZ, k), arc(radius + over, eaveZ, k + 1), K.giwa, hint, 0, k * 1.2, (k + 1) * 1.2);
		w.quad(arc(radius + over, 3.05, k), arc(radius + over, 3.05, k + 1), arc(radius + over, eaveZ, k + 1), arc(radius + over, eaveZ, k), K.fascia, [
			Math.cos(mid),
			Math.sin(mid),
			0
		]);
	}
	for (const end of [-1, 1]) {
		const a = end < 0 ? 0 : steps;
		w.tri(apex(4.9), apex(eaveZ), arc(radius + over, eaveZ, a), K.fascia, [
			0,
			end,
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
	관람정: buildFanPavilion,
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
	for (const each of CDG_BUILDINGS.filter((item) => TIMBER_HOUSES.includes(item.name) && item.p.length >= 6)) {
		w.xf = null;
		buildFrameOutline(w, rectOf(each.p, FRAME), {
			wall: K.timber,
			band: true,
			height: 3.2
		});
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
function buildRest(w) {
	const names = [...Object.keys(DEDICATED), ...TIMBER_HOUSES];
	buildFrames(w, CDG_BUILDINGS.filter((each) => !OUTLINE_ONLY.includes(each.name)), names, FRAME);
	for (const each of CDG_BUILDINGS.filter((item) => OUTLINE_ONLY.includes(item.name))) {
		w.xf = null;
		buildFrameOutline(w, rectOf(each.p, FRAME));
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
