import { HIN_AT, HIN_ORIGIN } from "./monuments_data.mjs";
import { buildBySuffix, tombZone } from "./monuments_tomb_kit.mjs";
import { HIN_BANKS, HIN_BUILDINGS, HIN_TOMBS, HIN_WALLS } from "./monuments_heonin_data.mjs";
import { HIN_TORCHES } from "./monuments_heonin_torches_data.mjs";
// web/city/monuments_heonin.mts
var torches = {
	at: HIN_AT,
	data: HIN_TORCHES
};
var ZONE = tombZone({
	at: HIN_AT,
	origin: HIN_ORIGIN,
	buildings: HIN_BUILDINGS,
	tombs: HIN_TOMBS,
	walls: HIN_WALLS,
	banks: HIN_BANKS,
	torches: HIN_TORCHES
});
var buildMonument = (id) => buildBySuffix(id, ZONE);
export { buildMonument, torches };
