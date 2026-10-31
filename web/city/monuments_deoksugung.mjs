import { DSG_AT, DSG_ORIGIN, dsgRing } from "./monuments_data.mjs";
import { K } from "./monument_parts.mjs";
import { FINE, MID, clamp, frameOf, hall } from "./monuments_hanok.mjs";
import { TIMBER_REMAP, buildZone, gate, half, mainHall } from "./monuments_palace_kit.mjs";
import { shiftLocal, westernBuilding } from "./monuments_western.mjs";
import { DSG_BUILDINGS } from "./monuments_deoksugung_data.mjs";
import { DSG_TREES } from "./monuments_deoksugung_trees_data.mjs";
import { DSG_TORCHES } from "./monuments_deoksugung_torches_data.mjs";
// web/city/monuments_deoksugung.mts
var trees = {
	at: DSG_AT,
	data: DSG_TREES
};
var torches = {
	at: DSG_AT,
	data: DSG_TORCHES
};
var FRAME = frameOf(DSG_AT, DSG_ORIGIN);
var seoeodang = (w, r) => {
	const { hx, hy } = half(r, .5);
	w.remap = TIMBER_REMAP;
	hall(w, {
		hx,
		hy,
		podium: .9,
		lowPodium: [.6],
		body: 3.4,
		rise: 3.2,
		eave: 2.2,
		bays: [clamp(Math.round(hx * 2 / 3.2), 3, 7), 2],
		steps: FINE,
		tiers: 2,
		upper: [.97, .9],
		upperRise: 2.6,
		ridgeFrac: .6,
		doors: true,
		lift: 1.2,
		gable: .45
	});
	w.remap = null;
};
var hamnyeongjeon = (w, r) => {
	mainHall(w, r, {
		bays: [9, 4],
		margin: .8,
		body: 3.8,
		rise: 3.6,
		eave: 2.4,
		brackets: false
	});
};
var SEOKJOJEON = {
	floors: 2,
	storey: 5.2,
	wall: K.granite,
	plinth: 4.2,
	plinthKind: K.granite,
	roof: "hip",
	roofRise: 1.8,
	eave: .6,
	portico: {
		cols: 6,
		depth: 4.6,
		pediment: true,
		balcony: true
	},
	terrace: 5.4,
	plinthWindows: true,
	balustrade: true,
	arch: false,
	bayWidth: 3.6,
	trim: K.trim
};
var MUSEUM = {
	floors: 2,
	storey: 4.6,
	wall: K.stone,
	plinth: .9,
	roof: "hip",
	roofRise: 2.4,
	eave: .6,
	bayWidth: 3.6,
	trim: K.trim
};
var DONDEOKJEON = {
	floors: 2,
	storey: 4.2,
	wall: K.redBrick,
	plinth: .8,
	roof: "hip",
	roofRise: 3,
	eave: 1,
	veranda: {
		post: K.trim,
		depth: 2.2,
		sides: true,
		floors: 2,
		rail: true
	},
	frame: K.teal,
	balustrade: true,
	bayWidth: 3.2,
	trim: K.trim
};
var JUNGMYEONGJEON = {
	floors: 2,
	storey: 4.4,
	wall: K.redBrick,
	plinth: .8,
	roof: "hip",
	roofRise: 3.2,
	eave: .9,
	arch: true,
	sideBalcony: {
		side: -1,
		depth: 2.2
	},
	bayWidth: 3.2,
	trim: K.trim
};
var JEONGGWANHEON = {
	floors: 1,
	storey: 5,
	wall: K.redBrick,
	plinth: 1,
	plinthKind: K.granite,
	roof: "hip",
	roofKind: K.teal,
	roofRise: 2.6,
	eave: 1.2,
	open: true,
	veranda: {
		post: K.teal,
		depth: 2,
		sides: true,
		rail: true,
		thin: .08
	},
	frame: K.gilt,
	trim: K.teal,
	bayWidth: 3.2
};
function western(look, back = 0, tweak) {
	return (w, r) => {
		const { hx, hy } = tweak ? tweak(r) : half(r, 0);
		if (back) shiftLocal(w, 0, back);
		westernBuilding(w, hx, hy, look);
	};
}
var seokjojeon = (w, r) => {
	const hx = Math.min(27, r.len / 2), hy = Math.min(15.5, r.wid / 2 - SEOKJOJEON.terrace - .6);
	shiftLocal(w, 0, r.wid / 2 - hy - .6);
	westernBuilding(w, hx, hy, SEOKJOJEON);
};
var jungmyeongjeon = (w, r) => {
	const pad = JUNGMYEONGJEON.sideBalcony.depth + .4, hx = Math.max(1, r.len / 2 - pad), hy = Math.max(1, r.wid / 2 - .4);
	shiftLocal(w, pad / 2, 0);
	westernBuilding(w, hx, hy, JUNGMYEONGJEON);
};
var DEDICATED = {
	"중화전": (w, r) => {
		mainHall(w, r, {
			bays: [5, 4],
			margin: 1.4
		});
	},
	"중화문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"대한문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"광명문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"월곡문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"포덕문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"석어당": seoeodang,
	"함녕전": hamnyeongjeon,
	"즉조당": (w, r) => {
		mainHall(w, r, {
			bays: [clamp(Math.round(r.len / 3.4), 3, 7), 2],
			margin: .6,
			body: 3.6,
			rise: 3.2,
			eave: 2.2,
			podium: 1,
			lowPodium: [.6],
			steps: MID
		});
	},
	"준명당": (w, r) => {
		mainHall(w, r, {
			bays: [clamp(Math.round(r.len / 3.4), 3, 6), 2],
			margin: .6,
			body: 3.6,
			rise: 3.2,
			eave: 2.2,
			podium: 1,
			lowPodium: [.6],
			steps: MID
		});
	},
	"덕홍전": (w, r) => {
		mainHall(w, r, {
			bays: [5, 4],
			margin: .8,
			body: 3.8,
			rise: 3.6,
			eave: 2.4
		});
	}
};
var MODERN = {
	"석조전": seokjojeon,
	"정관헌": western(JEONGGWANHEON, 0, (r) => half(r, 2)),
	"돈덕전": western(DONDEOKJEON, 0, (r) => half(r, 2.6)),
	"중명전": jungmyeongjeon
};
var SPEC = {
	frame: FRAME,
	ring: dsgRing,
	buildings: DSG_BUILDINGS,
	dedicated: DEDICATED,
	modern: MODERN,
	facing: {
		"대한문": [1, 0],
		"덕수궁 미술관": [1, 0],
		"중명전": [0, -1]
	},
	wings: { "덕수궁 미술관": western(MUSEUM, 0, (r) => half(r, 0)) },
	wall: { gaps: [
		"대한문",
		"월곡문",
		"포덕문"
	] }
};
function buildMonument(id) {
	return buildZone(SPEC, id, {
		wall: "dsg-wall",
		halls: "dsg-halls",
		frames: "dsg-frames"
	});
}
export { buildMonument, torches, trees };
