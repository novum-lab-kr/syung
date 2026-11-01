import { JG_AT, JG_ORIGIN } from "./monuments_data.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { FINE, MID, frameOf, hall, place, rectOf } from "./monuments_hanok.mjs";
import { ccw, faceSouth, heightOf, neutralBuilding, ptsOf, revolve } from "./monument_modern.mjs";
import { JG_BUILDINGS } from "./monuments_jogyesa_data.mjs";
import { JG_TREES } from "./monuments_jogyesa_trees_data.mjs";
// web/city/monuments_jogyesa.mts
var FRAME = frameOf(JG_AT, JG_ORIGIN);
var trees = {
	at: JG_AT,
	data: JG_TREES
};
function daeungjeon(w, flat) {
	const r = faceSouth(rectOf(flat, FRAME));
	place(w, r);
	hall(w, {
		hx: r.len / 2 - 2.6,
		hy: r.wid / 2 - 2.6,
		podium: 1.5,
		lowPodium: [1.2, .6],
		body: 6.2,
		rise: 5.6,
		eave: 2.6,
		bays: [7, 4],
		steps: FINE,
		brackets: true,
		doors: true,
		doorsAll: true,
		doorKind: K.timber,
		stair: true,
		gable: .5
	});
	w.xf = null;
}
function iljumun(w, flat) {
	const r = rectOf(flat, FRAME);
	place(w, r);
	hall(w, {
		hx: r.len / 2 - 1.3,
		hy: r.wid / 2 - 1.3,
		podium: .7,
		body: 3.6,
		rise: 2.8,
		eave: 1.5,
		bays: [3, 1],
		steps: MID,
		brackets: true,
		hollow: true
	});
	w.xf = null;
}
var SARI_AT = [-26, -45];
function sariPagoda(w) {
	const [cx, cy] = SARI_AT;
	w.xf = null;
	w.box(cx - 3.1, cx + 3.1, cy - 3.1, cy + 3.1, 0, .5, K.stone, { bottom: true });
	w.box(cx - 2.5, cx + 2.5, cy - 2.5, cy + 2.5, .5, 1.1, K.granite, { bottom: true });
	let z = 1.1;
	for (let story = 0; story < 10; story++) {
		const body = 1.55 - story * .08, cap = body + .38, bodyHeight = .62 - story * .01;
		w.box(cx - body, cx + body, cy - body, cy + body, z, z + bodyHeight, K.granite, { bottom: true });
		z += bodyHeight;
		w.box(cx - cap, cx + cap, cy - cap, cy + cap, z, z + .2, K.stone, { bottom: true });
		z += .2;
	}
	w.box(cx - .22, cx + .22, cy - .22, cy + .22, z, z + 2.2, K.gilt, { bottom: true });
}
var SOPHORA_AT = [-7, -48];
function ellipsoid(w, cx, cy, cz, rx, rz, kind) {
	const profile = [];
	for (let step = 0; step <= 6; step++) {
		const phi = -Math.PI / 2 + Math.PI * step / 6;
		profile.push([Math.max(.05, rx * Math.cos(phi)), cz + rz * Math.sin(phi)]);
	}
	revolve(w, cx, cy, profile, kind, 14, 0, true);
}
function sophora(w) {
	const [cx, cy] = SOPHORA_AT;
	w.xf = null;
	revolve(w, cx, cy, [
		[1.05, 0],
		[.68, 1.2],
		[.62, 5],
		[.5, 8.5],
		[.4, 10.5]
	], K.timber, 10, 0, true);
	for (const [dx, dy] of [
		[-3.2, .6],
		[2.6, 2.4],
		[1.2, -3.1]
	]) {
		revolve(w, cx + dx * .35, cy + dy * .35, [
			[.34, 8.4],
			[.3, 10.2],
			[.22, 12]
		], K.timber, 6, 0, true);
		revolve(w, cx + dx * .8, cy + dy * .8, [
			[.26, 11.2],
			[.2, 13],
			[.14, 14.6]
		], K.timber, 6, 0, true);
	}
	ellipsoid(w, cx, cy, 14.2, 9.8, 4.6, K.grass);
	ellipsoid(w, cx - 6.4, cy + 2, 12.4, 5.4, 3.4, K.grass);
	ellipsoid(w, cx + 6.2, cy - 2.2, 12.8, 5.6, 3.5, K.grass);
	ellipsoid(w, cx + 1, cy + 6.2, 12.2, 5, 3.3, K.grass);
	ellipsoid(w, cx - 1.4, cy - 6.4, 12.5, 5.2, 3.3, K.grass);
	ellipsoid(w, cx + .6, cy + .4, 19.4, 6.6, 4.6, K.grass);
}
function buildHalls(w) {
	sariPagoda(w);
	sophora(w);
	const main = JG_BUILDINGS.find((each) => each.name === "대웅전");
	if (main) daeungjeon(w, main.p);
	const gate = JG_BUILDINGS.find((each) => each.name === "일주문");
	if (gate) iljumun(w, gate.p);
}
function buildFrames(w) {
	w.xf = null;
	for (const b of JG_BUILDINGS.filter((each) => each.name !== "대웅전" && each.name !== "일주문")) neutralBuilding(w, ccw(ptsOf(b.p, FRAME)), heightOf(b, 5));
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "jg-halls") buildHalls(w);
	else if (id === "jg-frames") buildFrames(w);
	return new Float32Array(w.data);
}
export { buildMonument, trees };
