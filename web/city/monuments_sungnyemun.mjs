import { buildCityGate } from "./monuments_gates.mjs";
// web/city/monuments_sungnyemun.mts
var SHAPE = {
	"base": [
		[-.738, -10.314],
		[3.811, -10.411],
		[9.133, -10.685],
		[17.001, -10.773],
		[16.881, -7.594],
		[16.67, -4.498],
		[16.647, -1.204],
		[16.807, 1.119],
		[16.712, 5.29],
		[16.892, 10.781],
		[8.808, 10.78],
		[-.695, 10.779],
		[-13.011, 10.771],
		[-14.181, 10.77],
		[-17.001, 10.773],
		[-17.025, 9.542],
		[-17.399, -10.174],
		[-10.378, -10.467],
		[-4.067, -10.244],
		[-.738, -10.314]
	],
	"frameWidth": 22.5,
	"frameDepth": 7.7,
	"height": 19,
	"masonryHeight": 6.4,
	"archWidth": 4.8,
	"archHeight": 5.2,
	"verticalPlaque": true
};
function buildMonument(id) {
	return id === "sungnyemun" ? buildCityGate(SHAPE) : /* @__PURE__ */ new Float32Array();
}
var torches = {
	at: [126.97536025, 37.559986249999994],
	data: [
		54,
		130,
		123,
		68,
		108,
		189,
		176,
		128,
		-123,
		-68,
		-54,
		-130,
		-176,
		-128,
		-108,
		-189,
		-229,
		-188,
		-161,
		-249
	]
};
export { SHAPE, buildMonument, torches };
