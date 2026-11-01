import { SJN_AT, SJN_ORIGIN } from "./monuments_data.mjs";
import { buildBySuffix, tombZone } from "./monuments_tomb_kit.mjs";
import { SJN_BANKS, SJN_BUILDINGS, SJN_TOMBS, SJN_WALLS } from "./monuments_seonjeong_data.mjs";
import { SJN_TORCHES } from "./monuments_seonjeong_torches_data.mjs";
// web/city/monuments_seonjeong.mts
var torches = {
	at: SJN_AT,
	data: SJN_TORCHES
};
var ZONE = tombZone({
	at: SJN_AT,
	origin: SJN_ORIGIN,
	buildings: SJN_BUILDINGS,
	tombs: SJN_TOMBS,
	walls: SJN_WALLS,
	banks: SJN_BANKS,
	torches: SJN_TORCHES
});
var buildMonument = (id) => buildBySuffix(id, ZONE);
export { buildMonument, torches };
