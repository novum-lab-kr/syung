import { UHG_AT, UHG_ORIGIN, uhgRing } from "./monuments_data.mjs";
import { K } from "./monument_parts.mjs";
import { ROUGH, clamp, frameOf, hall, place, rectOf } from "./monuments_hanok.mjs";
import { TIMBER_REMAP, buildZone, half, timberHall } from "./monuments_palace_kit.mjs";
import { westernBuilding } from "./monuments_western.mjs";
import { UHG_BUILDINGS } from "./monuments_unhyeongung_data.mjs";
import { UHG_TREES } from "./monuments_unhyeongung_trees_data.mjs";
import { UHG_TORCHES } from "./monuments_unhyeongung_torches_data.mjs";
// web/city/monuments_unhyeongung.mts
var trees = {
	at: UHG_AT,
	data: UHG_TREES
};
var torches = {
	at: UHG_AT,
	data: UHG_TORCHES
};
var FRAME = frameOf(UHG_AT, UHG_ORIGIN);
var YANGGWAN = {
	floors: 2,
	storey: 4,
	wall: K.cream,
	plinth: .7,
	roof: "hip",
	roofRise: 2.8,
	eave: .8,
	arch: true,
	balustrade: true,
	bayWidth: 3.2,
	trim: K.trim
};
var YANGGWAN_PORCH = {
	...YANGGWAN,
	portico: {
		cols: 4,
		depth: 2.4,
		balcony: true
	}
};
var EXHIBITION = {
	floors: 2,
	storey: 3.6,
	wall: K.plaster,
	plinth: .4,
	roof: "flat",
	roofRise: 0,
	bayWidth: 3.4,
	trim: K.trim
};
var western = (look, margin) => (w, r) => {
	const { hx, hy } = half(r, margin);
	westernBuilding(w, hx, hy, look);
};
var wingNumber = 0;
var yanggwan = (w, r) => {
	const { hx, hy } = half(r, .4);
	westernBuilding(w, hx, hy, wingNumber++ === 0 ? YANGGWAN_PORCH : YANGGWAN);
};
var CORE_PLAN = {
	noandang: {
		body: [6, 2],
		room: [5, 2],
		numaru: [2, 2]
	},
	norakdang: { body: [10, 3] }
};
var ANNEX_WIDTH = 6;
var ROOM_LENGTH = 12;
var NUMARU_LENGTH = 6.6;
var NUMARU_FLOOR = 1.7;
var CORE_ANCHORS = [
	{
		name: "노안당",
		at: [-1.4, -5.3]
	},
	{
		name: "노안당 덧붙임",
		at: [11.9, -15.1],
		skip: true
	},
	{
		name: "노락당",
		at: [-.7, 13.2],
		bays: CORE_PLAN.norakdang.body
	},
	{
		name: "노락당 날개",
		at: [-9.1, 27.6]
	}
];
var core = (w, r) => {
	const nearest = CORE_ANCHORS.map((anchor) => ({
		anchor,
		dist: Math.hypot(anchor.at[0] - r.cx, anchor.at[1] - r.cy)
	})).sort((a, b) => a.dist - b.dist)[0];
	const known = nearest.dist < 4 ? nearest.anchor : void 0;
	if (known?.skip) return;
	if (known?.name === "노안당") {
		noandang(w, r);
		return;
	}
	const { hx, hy } = half(r, .5);
	timberHall(w, r, known?.bays ?? [clamp(Math.round(hx * 2 / 3), 1, 8), clamp(Math.round(hy * 2 / 3), 1, 3)]);
};
var noandang = (w, r) => {
	const cos = Math.cos(r.ang), sin = Math.sin(r.ang), bay = r.wid / CORE_PLAN.noandang.body[1];
	const strip = (aLo, aHi, bLo, bHi, ang, turned) => {
		const a = (aLo + aHi) / 2, b = (bLo + bHi) / 2, along = aHi - aLo, across = bHi - bLo;
		return {
			cx: r.cx + a * cos - b * sin,
			cy: r.cy + a * sin + b * cos,
			len: turned ? across : along,
			wid: turned ? along : across,
			ang,
			fill: 1,
			pts: []
		};
	};
	const bodyEnd = -r.len / 2 + CORE_PLAN.noandang.body[0] * bay, northEdge = r.wid / 2;
	const body = strip(-r.len / 2, bodyEnd, -r.wid / 2, northEdge, r.ang, false);
	const room = strip(bodyEnd, bodyEnd + ANNEX_WIDTH, northEdge - ROOM_LENGTH, northEdge, r.ang - Math.PI / 2, true);
	const numaru = strip(bodyEnd, bodyEnd + ANNEX_WIDTH, northEdge - ROOM_LENGTH - NUMARU_LENGTH, northEdge - ROOM_LENGTH, r.ang - Math.PI / 2, true);
	place(w, body);
	timberHall(w, body, CORE_PLAN.noandang.body);
	w.xf = null;
	place(w, room);
	timberHall(w, room, CORE_PLAN.noandang.room);
	w.xf = null;
	place(w, numaru);
	yeonghwaru(w, numaru);
	w.xf = null;
};
var yeonghwaru = (w, r) => {
	const { hx, hy } = half(r, .3), floor = NUMARU_FLOOR, bays = CORE_PLAN.noandang.numaru, post = .2;
	w.remap = {
		...TIMBER_REMAP,
		[K.granite]: K.timber,
		[K.trim]: K.timber
	};
	for (let i = 0; i <= bays[0]; i++) for (let j = 0; j <= bays[1]; j++) {
		const x = -hx + 2 * hx * i / bays[0], y = -hy + 2 * hy * j / bays[1];
		w.box(x - post, x + post, y - post, y + post, 0, floor, K.timber, {
			bottom: true,
			top: true
		});
	}
	w.box(-hx - .35, hx + .35, -hy - .35, hy + .35, floor - .22, floor, K.timber, { bottom: true });
	w.dz = floor;
	hall(w, {
		hx,
		hy,
		podium: .05,
		lowPodium: [.02],
		body: 2.7,
		rise: 2.2,
		eave: 1.6,
		bays,
		steps: ROUGH,
		hollow: true,
		gable: .45
	});
	w.dz = 0;
	const rail = (x0, x1, y0, y1) => {
		w.box(x0, x1, y0, y1, floor + .8, floor + .92, K.timber, {
			bottom: true,
			top: true
		});
	};
	rail(-hx, hx, -hy - .04, -hy + .04);
	rail(-hx, hx, hy - .04, hy + .04);
	rail(-hx - .04, -hx + .04, -hy, hy);
	rail(hx - .04, hx + .04, -hy, hy);
	for (let k = 0; k <= 8; k++) {
		const x = -hx + 2 * hx * k / 8, y = -hy + 2 * hy * k / 8;
		for (const edge of [-hy, hy]) w.box(x - .03, x + .03, edge - .03, edge + .03, floor, floor + .8, K.timber, { bottom: true });
		for (const edge of [-hx, hx]) w.box(edge - .03, edge + .03, y - .03, y + .03, floor, floor + .8, K.timber, { bottom: true });
	}
	w.remap = null;
};
var IRO_HOLE = UHG_BUILDINGS.find((each) => each.name === "이로당").hole;
var irodang = (w, r) => {
	const hole = rectOf(IRO_HOLE, FRAME), dx = hole.cx - r.cx, dy = hole.cy - r.cy, cos = Math.cos(r.ang), sin = Math.sin(r.ang);
	const holeU = dx * cos + dy * sin, holeV = -dx * sin + dy * cos;
	const alongHole = Math.abs(Math.cos(hole.ang - r.ang)) > .7;
	const holeLen = Math.min(alongHole ? hole.len : hole.wid, r.len - 8), holeWid = Math.min(alongHole ? hole.wid : hole.len, r.wid - 8);
	const u0 = holeU - holeLen / 2, u1 = holeU + holeLen / 2, v0 = holeV - holeWid / 2, v1 = holeV + holeWid / 2;
	const strip = (uLo, uHi, vLo, vHi, ang, turned) => {
		const u = (uLo + uHi) / 2, v = (vLo + vHi) / 2, along = uHi - uLo, across = vHi - vLo;
		return {
			cx: r.cx + u * cos - v * sin,
			cy: r.cy + u * sin + v * cos,
			len: turned ? across : along,
			wid: turned ? along : across,
			ang,
			fill: 1,
			pts: []
		};
	};
	const north = strip(-r.len / 2, r.len / 2, v1, r.wid / 2, r.ang, false);
	const south = strip(-r.len / 2, r.len / 2, -r.wid / 2, v0, r.ang + Math.PI, false);
	const west = strip(-r.len / 2, u0, v0, v1, r.ang - Math.PI / 2, true);
	const east = strip(u1, r.len / 2, v0, v1, r.ang + Math.PI / 2, true);
	for (const wing of [
		north,
		south,
		west,
		east
	]) {
		place(w, wing);
		timberHall(w, wing, [clamp(Math.round(wing.len / 3.4), 1, 8), clamp(Math.round(wing.wid / 3.4), 1, 3)]);
		w.xf = null;
	}
};
var MODERN = { "유물전시관": western(EXHIBITION, .2) };
var SPEC = {
	frame: FRAME,
	ring: uhgRing,
	buildings: UHG_BUILDINGS,
	dedicated: { "이로당": irodang },
	modern: MODERN,
	wings: {
		"운현궁 양관": yanggwan,
		"노안당·노락당": core
	},
	wingPasses: 6,
	timber: ["수직사", "김승현 가옥"],
	timberRich: (_r) => true
};
function buildMonument(id) {
	wingNumber = 0;
	return buildZone(SPEC, id, {
		wall: "uhg-wall",
		halls: "uhg-halls",
		frames: "uhg-frames"
	});
}
export { CORE_PLAN, buildMonument, torches, trees };
