import { JM_AT, JM_ORIGIN, jmRing } from "./monuments_data.mjs";
import { toM } from "./life.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { FINE, MID, buildFrames, buildWallLine, frameOf, hall, place, rectOf } from "./monuments_hanok.mjs";
import { JM_BUILDINGS, JM_WALLS } from "./monuments_jongmyo_data.mjs";
import { JM_TREES } from "./monuments_jongmyo_trees_data.mjs";
import { JM_TORCHES } from "./monuments_jongmyo_torches_data.mjs";
// web/city/monuments_jongmyo.mts
var trees = {
	at: JM_AT,
	data: JM_TREES
};
var torches = {
	at: JM_AT,
	data: JM_TORCHES
};
var FRAME = frameOf(JM_AT, JM_ORIGIN);
var local = (lng, lat) => {
	const [mx, my] = toM(lng, lat);
	return [mx - FRAME.ox, -(my - FRAME.oy)];
};
var byId = new Map(JM_BUILDINGS.map((each) => [each.id, each]));
var GATE_BAYS = {
	170403782: [3, 2],
	170403786: [3, 2],
	170403796: [3, 2],
	170403781: [3, 2],
	382428482: [1, 1],
	382428477: [3, 1],
	382428478: [1, 1]
};
var WALL_GAPS = Object.keys(GATE_BAYS).map(Number);
function buildWall(w) {
	const gaps = WALL_GAPS.flatMap((id) => {
		const each = byId.get(id);
		if (!each) return [];
		const r = rectOf(each.p, FRAME), xs = r.pts.map((p) => p[0]), ys = r.pts.map((p) => p[1]);
		return [[
			Math.min(...xs) - 2.5,
			Math.max(...xs) + 2.5,
			Math.min(...ys) - 2.5,
			Math.max(...ys) + 2.5
		]];
	});
	const skip = (x, y) => gaps.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
	const ring = jmRing().map(([lng, lat]) => {
		const [x, y] = local(lng, lat);
		return [
			x,
			y,
			0
		];
	});
	ring.push(ring[0]);
	buildWallLine(w, ring, skip);
	for (const flat of JM_WALLS) {
		const line = [];
		for (let i = 0; i < flat.length; i += 2) {
			const [x, y] = local(JM_ORIGIN[0] + flat[i] / 1e6, JM_ORIGIN[1] + flat[i + 1] / 1e6);
			line.push([
				x,
				y,
				0
			]);
		}
		buildWallLine(w, line, skip);
	}
}
var southFacing = (r) => Math.cos(r.ang) < 0 ? {
	...r,
	ang: r.ang + Math.PI
} : r;
var northFacing = (r) => Math.cos(r.ang) < 0 ? r : {
	...r,
	ang: r.ang + Math.PI
};
var half = (r, margin) => ({
	hx: Math.max(1, r.len / 2 - margin),
	hy: Math.max(1, r.wid / 2 - margin)
});
var DOORS = { [K.tunnel]: K.red };
var SHRINE = {
	...DOORS,
	[K.window]: K.brick,
	[K.plaster]: K.brick
};
function moyeongWoldae(w, hy) {
	const back = hy + 3, front = back - 69, top = .75, hx = 54.5;
	w.box(-54.5, hx, front, back, 0, top, K.granite, { bottom: true });
	w.quad([
		-54.5,
		front,
		top
	], [
		hx,
		front,
		top
	], [
		hx,
		back,
		top
	], [
		-54.5,
		back,
		top
	], K.stone, [
		0,
		0,
		1
	]);
}
function buildJeongjeon(w, r) {
	const S = {
		...half(r, .8),
		podium: 1.3,
		lowPodium: [1.4, .7],
		body: 5,
		rise: 4.6,
		eave: 3.2,
		bays: [19, 3],
		steps: FINE,
		gabled: true,
		doors: true,
		doorsAll: true,
		stair: true
	};
	moyeongWoldae(w, S.hy);
	w.remap = SHRINE;
	hall(w, S);
	w.remap = null;
}
function buildYeongnyeongjeon(w, r) {
	const base = half(r, .8), bay = base.hx / 8, wing = {
		...base,
		hx: bay * 3
	};
	const cos = Math.cos(r.ang), sin = Math.sin(r.ang), center = {
		...base,
		hx: bay * 2
	};
	w.remap = SHRINE;
	hall(w, {
		...center,
		podium: 1.1,
		lowPodium: [1.2, .6],
		body: 5,
		rise: 4.4,
		eave: 3,
		bays: [4, 3],
		steps: FINE,
		gabled: true,
		doors: true,
		doorsAll: true,
		stair: true
	});
	for (const side of [-1, 1]) {
		const offset = side * bay * 5;
		place(w, {
			...r,
			cx: r.cx + cos * offset,
			cy: r.cy + sin * offset
		});
		hall(w, {
			...wing,
			podium: .9,
			lowPodium: [1, .5],
			body: 3.4,
			rise: 2.5,
			eave: 2.4,
			bays: [6, 3],
			steps: FINE,
			gabled: true,
			doors: true,
			doorsAll: true
		});
	}
	w.remap = null;
	place(w, r);
}
function buildGongsindang(w, r) {
	const S = {
		...half(r, .4),
		podium: .9,
		lowPodium: [.8],
		body: 3.6,
		rise: 3,
		eave: 2,
		bays: [16, 1],
		steps: MID,
		gabled: true
	};
	w.remap = DOORS;
	hall(w, S);
	const bayX = 2 * S.hx / 16, doorTop = S.podium + S.body - .7;
	for (let k = 6; k <= 8; k++) {
		const cx = -S.hx + bayX * (k + .5), dx = bayX * .36;
		w.quad([
			cx - dx,
			-S.hy - .03,
			S.podium + .3
		], [
			cx + dx,
			-S.hy - .03,
			S.podium + .3
		], [
			cx + dx,
			-S.hy - .03,
			doorTop
		], [
			cx - dx,
			-S.hy - .03,
			doorTop
		], K.tunnel, [
			0,
			-1,
			0
		]);
	}
	w.remap = null;
}
var gate = (w, r, bays) => {
	hall(w, {
		...half(r, .6),
		podium: 1,
		lowPodium: [.9, .4],
		body: 3.4,
		rise: 3,
		eave: 2.1,
		bays,
		steps: MID,
		gabled: true,
		doors: true,
		stair: r.len > 7
	});
};
var DEDICATED = {
	정전: buildJeongjeon,
	영녕전: buildYeongnyeongjeon,
	칠사당: (w, r) => hall(w, {
		...half(r, .4),
		podium: .9,
		lowPodium: [.8],
		body: 3.4,
		rise: 2.8,
		eave: 1.9,
		bays: [3, 1],
		steps: MID,
		gabled: true,
		doors: true
	}),
	외대문: (w, r) => gate(w, r, [3, 2]),
	남신문: (w, r) => gate(w, r, [3, 2])
};
var FACING_NORTH = ["공신당", "칠사당"];
function buildHalls(w) {
	for (const each of JM_BUILDINGS) {
		const gateBays = GATE_BAYS[each.id], dedicated = DEDICATED[each.name], builder = each.name === "공신당" ? buildGongsindang : dedicated ?? (gateBays ? (ww, rr) => gate(ww, rr, gateBays) : null);
		if (!builder || each.p.length < 6) continue;
		const base = rectOf(each.p, FRAME), r = FACING_NORTH.includes(each.name) ? northFacing(base) : southFacing(base);
		place(w, r);
		w.remap = DOORS;
		builder(w, r);
		w.remap = null;
		w.xf = null;
	}
}
function buildRest(w) {
	const names = [...Object.keys(DEDICATED), "공신당"];
	const rest = JM_BUILDINGS.filter((each) => !GATE_BAYS[each.id]);
	buildFrames(w, rest, names, FRAME);
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "jm-wall") buildWall(w);
	else if (id === "jm-halls") buildHalls(w);
	else if (id === "jm-frames") buildRest(w);
	return new Float32Array(w.data);
}
export { buildMonument, torches, trees };
