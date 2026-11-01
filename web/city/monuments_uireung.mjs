import { UIR_AT, UIR_ORIGIN } from "./monuments_data.mjs";
import { buildBySuffix, tombZone } from "./monuments_tomb_kit.mjs";
import { UIR_BANKS, UIR_BUILDINGS, UIR_TOMBS, UIR_WALLS } from "./monuments_uireung_data.mjs";
import { UIR_TORCHES } from "./monuments_uireung_torches_data.mjs";
// web/city/monuments_uireung.mts
var torches = {
	at: UIR_AT,
	data: UIR_TORCHES
};
var ZONE = tombZone({
	at: UIR_AT,
	origin: UIR_ORIGIN,
	buildings: UIR_BUILDINGS,
	tombs: UIR_TOMBS,
	walls: UIR_WALLS,
	banks: UIR_BANKS,
	torches: UIR_TORCHES,
	levels: {
		480559564: 6.5,
		480559565: 3
	}
});
var buildMonument = (id) => buildBySuffix(id, ZONE);
export { buildMonument, torches };
