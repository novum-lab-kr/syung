import { JNG_AT, JNG_ORIGIN } from "./monuments_data.mjs";
import { buildBySuffix, tombZone } from "./monuments_tomb_kit.mjs";
import { JNG_BANKS, JNG_BUILDINGS, JNG_TOMBS, JNG_WALLS } from "./monuments_jeongneung_data.mjs";
import { JNG_TORCHES } from "./monuments_jeongneung_torches_data.mjs";
// web/city/monuments_jeongneung.mts
var torches = {
	at: JNG_AT,
	data: JNG_TORCHES
};
var ZONE = tombZone({
	at: JNG_AT,
	origin: JNG_ORIGIN,
	buildings: JNG_BUILDINGS,
	tombs: JNG_TOMBS,
	walls: JNG_WALLS,
	banks: JNG_BANKS,
	torches: JNG_TORCHES
});
var buildMonument = (id) => buildBySuffix(id, ZONE);
export { buildMonument, torches };
