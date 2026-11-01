import { K, MeshWriter } from "./monument_parts.mjs";
import { wallLine } from "./monument_modern.mjs";
import { buildCityGate, clipOutsideGate } from "./monuments_gates.mjs";
import { SJ_WALLS } from "./monuments_sukjeongmun_data.mjs";
// web/city/monuments_sukjeongmun.mts
var SHAPE = {
	"base": [
		[6.815, 3.858],
		[6.707, 2.174],
		[6.333, -3.836],
		[-.121, -3.853],
		[-6.815, -3.872],
		[-6.76, 1.928],
		[-6.742, 3.872],
		[-2.659, 3.872],
		[.171, 3.866],
		[3.623, 3.867],
		[6.815, 3.858]
	],
	"frameWidth": 7.2,
	"frameDepth": 3.6,
	"height": 9,
	"masonryHeight": 4.8,
	"archWidth": 3.2,
	"archHeight": 3.8,
	"verticalPlaque": false,
	"tiers": 1,
	"bays": 3
};
function buildWall() {
	const w = new MeshWriter();
	for (const flat of SJ_WALLS) {
		const line = [];
		for (let i = 0; i < flat.length; i += 2) line.push([flat[i] / 10, flat[i + 1] / 10]);
		for (const piece of clipOutsideGate(line, SHAPE.base, 128)) wallLine(w, piece, {
			half: 1.6,
			height: 5.5,
			kind: K.granite,
			cap: K.granite
		});
	}
	return new Float32Array(w.data);
}
function buildMonument(id) {
	if (id === "sj-gate") return buildCityGate(SHAPE);
	if (id === "sj-wall") return buildWall();
	return /* @__PURE__ */ new Float32Array();
}
var torches = {
	at: [126.9810832, 37.595533],
	data: [
		67,
		-1,
		15,
		65,
		-15,
		-65,
		-67,
		1
	]
};
export { SHAPE, buildMonument, torches };
