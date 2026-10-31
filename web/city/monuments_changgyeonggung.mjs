import { CGG_AT, CGG_ORIGIN, cggRing } from "./monuments_data.mjs";
import { K } from "./monument_parts.mjs";
import { FINE, clamp, frameOf, hall } from "./monuments_hanok.mjs";
import { CGG_BUILDINGS } from "./monuments_changgyeonggung_data.mjs";
import { CGG_TREES } from "./monuments_changgyeonggung_trees_data.mjs";
import { CGG_TORCHES } from "./monuments_changgyeonggung_torches_data.mjs";
import { buildZone, gate, half, mainHall, pavilion } from "./monuments_palace_kit.mjs";
import { westernBuilding } from "./monuments_western.mjs";
// web/city/monuments_changgyeonggung.mts
var trees = {
	at: CGG_AT,
	data: CGG_TREES
};
var torches = {
	at: CGG_AT,
	data: CGG_TORCHES
};
var FRAME = frameOf(CGG_AT, CGG_ORIGIN);
var hongwhamun = (w, r) => {
	hall(w, {
		...half(r, .8),
		podium: 1.4,
		lowPodium: [1, .5],
		body: 3.6,
		rise: 3.6,
		eave: 2.4,
		bays: [3, 2],
		steps: FINE,
		tiers: 2,
		brackets: true,
		doors: true,
		stair: true,
		upper: [.9, .88],
		upperRise: 3
	});
};
var MAIN = (bays, extra = {}) => (w, r) => {
	mainHall(w, r, {
		bays,
		margin: extra.margin ?? 1.2,
		ridgeless: extra.ridgeless,
		gable: extra.ridgeless ? void 0 : .5,
		brackets: extra.brackets ?? false
	});
};
var BAYS = {
	"경춘전": [7, 4],
	"양화당": [6, 4],
	"숭문당": [4, 3]
};
var DAEONSIL = {
	floors: 1,
	storey: 5.2,
	wall: K.glass,
	plinth: .6,
	roof: "gable",
	roofKind: K.glass,
	roofRise: 3.2,
	eave: .3,
	glass: true,
	trim: K.trim,
	bayWidth: 3
};
var OFFICE = {
	floors: 1,
	storey: 3.6,
	wall: K.plaster,
	plinth: .4,
	roof: "hip",
	roofKind: K.giwa,
	roofRise: 1.8,
	eave: .8,
	bayWidth: 3.4,
	trim: K.trim
};
var DEDICATED = {
	"홍화문": hongwhamun,
	"명정전": MAIN([5, 3], {
		margin: 1.4,
		brackets: true
	}),
	"문정전": MAIN([5, 3]),
	"숭문당": MAIN(BAYS["숭문당"], { margin: .8 }),
	"빈양문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"통명전": MAIN([7, 4], { ridgeless: true }),
	"환경전": MAIN([5, 3]),
	"경춘전": MAIN(BAYS["경춘전"], { margin: .8 }),
	"양화당": MAIN(BAYS["양화당"], { margin: .8 }),
	"영춘헌": MAIN([clamp(Math.round(34 / 3.6), 5, 9), 3], { margin: .8 }),
	"창경궁 함인정": (w, r) => {
		pavilion(w, r);
	},
	"관덕정": (w, r) => {
		pavilion(w, r);
	},
	"창경궁 선인문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"집춘문": (w, r) => {
		gate(w, r, [1, 1]);
	},
	"월근문": (w, r) => {
		gate(w, r, [1, 1]);
	}
};
var glassHouse = (w, r) => {
	const { hx, hy } = half(r, .1);
	westernBuilding(w, hx, hy, DAEONSIL);
};
var office = (w, r) => {
	const { hx, hy } = half(r, .2);
	westernBuilding(w, hx, hy, OFFICE);
};
var SPEC = {
	frame: FRAME,
	ring: cggRing,
	buildings: CGG_BUILDINGS,
	dedicated: DEDICATED,
	facing: {
		"홍화문": [1, 0],
		"명정전": [1, 0],
		"창경궁 선인문": [1, 0],
		"경춘전": [1, 0],
		"집춘문": [0, 1],
		"월근문": [0, 1],
		"숭문당": [1, 0]
	},
	wings: {
		"대온실": glassHouse,
		"관리소": office
	},
	wall: { gaps: [
		"홍화문",
		"창경궁 선인문",
		"집춘문",
		"월근문"
	] }
};
function buildMonument(id) {
	return buildZone(SPEC, id, {
		wall: "cgg-wall",
		halls: "cgg-halls",
		frames: "cgg-frames"
	});
}
export { BAYS, buildMonument, torches, trees };
