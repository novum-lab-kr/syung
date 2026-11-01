import { TGN_AT, TGN_ORIGIN } from "./monuments_data.mjs";
import { buildBySuffix, tombZone } from "./monuments_tomb_kit.mjs";
import { TGN_BANKS, TGN_BUILDINGS, TGN_TOMBS, TGN_WALLS } from "./monuments_taegang_data.mjs";
import { TGN_TORCHES } from "./monuments_taegang_torches_data.mjs";
// web/city/monuments_taegang.mts
var torches = {
	at: TGN_AT,
	data: TGN_TORCHES
};
var ZONE = tombZone({
	at: TGN_AT,
	origin: TGN_ORIGIN,
	buildings: TGN_BUILDINGS,
	tombs: TGN_TOMBS,
	walls: TGN_WALLS,
	banks: TGN_BANKS,
	torches: TGN_TORCHES
});
var buildMonument = (id) => buildBySuffix(id, ZONE);
export { buildMonument, torches };
