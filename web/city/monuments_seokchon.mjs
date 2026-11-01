import { SKC_AT, SKC_ORIGIN } from "./monuments_data.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { frameOf, place, rectOf } from "./monuments_hanok.mjs";
import { SKC_TOMBS } from "./monuments_seokchon_data.mjs";
import { SKC_TREES } from "./monuments_seokchon_trees_data.mjs";
import { SKC_TORCHES } from "./monuments_seokchon_torches_data.mjs";
// web/city/monuments_seokchon.mts
var trees = {
	at: SKC_AT,
	data: SKC_TREES
};
var torches = {
	at: SKC_AT,
	data: SKC_TORCHES
};
var FRAME = frameOf(SKC_AT, SKC_ORIGIN);
var TIERS = {
	"석촌동 제2호분": () => [
		[
			16.4,
			16.4,
			1.17
		],
		[
			12.5,
			12.5,
			2.33
		],
		[
			8.5,
			8.5,
			3.5
		]
	],
	"석촌동 제3호분": () => [
		[
			50.8,
			48.4,
			1.6
		],
		[
			39.8,
			37.4,
			3.1
		],
		[
			28.8,
			26.4,
			4.5
		]
	],
	"석촌동 제4호분": () => [[
		17.2,
		17.2,
		1.6
	], [
		13.2,
		13.2,
		3
	]]
};
function buildMonument(id) {
	const w = new MeshWriter();
	if (id !== "skc-halls") return new Float32Array(w.data);
	for (const tomb of SKC_TOMBS) {
		const tiers = TIERS[tomb.name];
		if (!tiers) continue;
		const r = rectOf(tomb.p, FRAME);
		place(w, r);
		let below = 0;
		for (const [len, wid, top] of tiers(r.len, r.wid)) {
			w.box(-len / 2, len / 2, -wid / 2, wid / 2, below, top, K.rubble, { bottom: true });
			below = top;
		}
		w.xf = null;
	}
	return new Float32Array(w.data);
}
export { buildMonument, torches, trees };
