import { BC_AT, BC_ORIGIN } from "./monuments_data.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { clamp, frameOf, place, rectOf } from "./monuments_hanok.mjs";
import { ccw, gableRoof, heightOf, neutralBuilding } from "./monument_modern.mjs";
import { BC_BUILDINGS } from "./monuments_bukchon_data.mjs";
// web/city/monuments_bukchon.mts
var FRAME = frameOf(BC_AT, BC_ORIGIN);
function hanok(w, flat) {
	const r = rectOf(flat, FRAME);
	if (r.len * r.wid < 10) return;
	place(w, r);
	const hx = Math.max(1.2, r.len / 2 - .7), hy = Math.max(1, r.wid / 2 - .7), rise = clamp(hy * .55 + .5, 1.1, 2.2);
	w.box(-hx - .3, hx + .3, -hy - .3, hy + .3, 0, .4, K.stone, { bottom: true });
	w.box(-hx, hx, -hy, hy, .4, 3.4, K.plaster, {
		bottom: true,
		top: true
	});
	gableRoof(w, hx, hy, 3.4, rise, .8, K.giwa, K.plaster);
	w.xf = null;
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "bc-halls") {
		for (const each of BC_BUILDINGS) if (each.name === "한옥") hanok(w, each.p);
	} else if (id === "bc-frames") for (const each of BC_BUILDINGS) {
		if (each.name === "한옥" || each.p.length < 6) continue;
		const pts = ccw(rectOf(each.p, FRAME).pts);
		neutralBuilding(w, pts, heightOf(each, 8), { windows: false });
	}
	return new Float32Array(w.data);
}
export { buildMonument };
