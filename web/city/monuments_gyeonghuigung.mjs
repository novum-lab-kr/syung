import { GHG_AT, GHG_ORIGIN, ghgRing } from "./monuments_data.mjs";
import { frameOf } from "./monuments_hanok.mjs";
import { buildZone, gate, mainHall } from "./monuments_palace_kit.mjs";
import { GHG_BUILDINGS } from "./monuments_gyeonghuigung_data.mjs";
import { GHG_TREES } from "./monuments_gyeonghuigung_trees_data.mjs";
import { GHG_TORCHES } from "./monuments_gyeonghuigung_torches_data.mjs";
// web/city/monuments_gyeonghuigung.mts
var trees = {
	at: GHG_AT,
	data: GHG_TREES
};
var torches = {
	at: GHG_AT,
	data: GHG_TORCHES
};
var FRAME = frameOf(GHG_AT, GHG_ORIGIN);
var MAIN = (bays, margin = 1.2) => (w, r) => {
	mainHall(w, r, {
		bays,
		margin
	});
};
var DEDICATED = {
	"숭정전": MAIN([5, 4], 1),
	"숭정문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"자정문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"태령문": (w, r) => {
		gate(w, r, [3, 2]);
	},
	"자정전": MAIN([5, 3]),
	"태령전": MAIN([5, 2], .8),
	"흥화문": (w, r) => {
		gate(w, r, [3, 2]);
	}
};
var AXIS = [.53, -.85];
var SPEC = {
	frame: FRAME,
	ring: ghgRing,
	buildings: GHG_BUILDINGS,
	dedicated: DEDICATED,
	facing: {
		"숭정전": AXIS,
		"숭정문": AXIS,
		"자정문": AXIS,
		"태령문": AXIS,
		"자정전": AXIS,
		"태령전": AXIS,
		"흥화문": [0, -1]
	}
};
function buildMonument(id) {
	return buildZone(SPEC, id, {
		wall: "ghg-wall",
		halls: "ghg-halls",
		frames: "ghg-frames"
	});
}
export { buildMonument, torches, trees };
