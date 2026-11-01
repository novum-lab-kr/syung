import { K, MeshWriter } from "./monument_parts.mjs";
import { wallLine } from "./monument_modern.mjs";
import { buildCityGate, clipOutsideGate } from "./monuments_gates.mjs";
import { CU_WALLS } from "./monuments_changuimun_data.mjs";
// web/city/monuments_changuimun.mts
var SHAPE = {
	"base": [
		[-5.485, -3.723],
		[-5.515, 3.711],
		[5.477, 3.723],
		[5.515, -3.699],
		[-5.485, -3.723]
	],
	"frameWidth": 7.4,
	"frameDepth": 3.4,
	"height": 8.6,
	"masonryHeight": 4.4,
	"archWidth": 3,
	"archHeight": 3.4,
	"verticalPlaque": false,
	"tiers": 1,
	"bays": 3
};
function buildWall() {
	const w = new MeshWriter();
	for (const flat of CU_WALLS) {
		const line = [];
		for (let i = 0; i < flat.length; i += 2) line.push([flat[i] / 10, flat[i + 1] / 10]);
		for (const piece of clipOutsideGate(line, SHAPE.base, 253)) wallLine(w, piece, {
			half: 1.6,
			height: 5.5,
			kind: K.granite,
			cap: K.granite
		});
	}
	return new Float32Array(w.data);
}
function buildMonument(id) {
	if (id === "cu-gate") return buildCityGate(SHAPE);
	if (id === "cu-wall") return buildWall();
	return /* @__PURE__ */ new Float32Array();
}
var torches = {
	at: [126.966521, 37.5926116],
	data: [
		-37,
		55,
		-62,
		-25,
		62,
		25,
		37,
		-55
	]
};
export { SHAPE, buildMonument, torches };
