import { BE_AT, BE_ORIGIN } from "./monuments_data.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { BE_BUILDINGS, BE_WALLS } from "./monuments_bongeunsa_data.mjs";
import { BE_TREES } from "./monuments_bongeunsa_trees_data.mjs";
import { FINE, buildFrames, clamp, frameOf, hall, local, place, rectOf } from "./monuments_hanok.mjs";
import { faceSouth, revolve, wallLine } from "./monument_modern.mjs";
// web/city/monuments_bongeunsa.mts
var FRAME = frameOf(BE_AT, BE_ORIGIN);
var trees = {
	at: BE_AT,
	data: BE_TREES
};
var DEDICATED = ["봉은사 판전", "봉은사 대웅전"];
function panjeon(w, flat) {
	const r = faceSouth(rectOf(flat, FRAME));
	place(w, r);
	const hx = r.len / 2 - 1.4, hy = r.wid / 2 - 1.4;
	hall(w, {
		hx,
		hy,
		podium: .9,
		lowPodium: [.7],
		body: 3.6,
		rise: 3.2,
		eave: 1.9,
		bays: [clamp(Math.round(hx * 2 / 3.3), 3, 7), clamp(Math.round(hy * 2 / 3.3), 2, 4)],
		steps: FINE,
		gabled: true,
		doors: true,
		stair: true
	});
	w.xf = null;
}
function daeungjeon(w, flat) {
	const r = faceSouth(rectOf(flat, FRAME));
	place(w, r);
	const hx = r.len / 2 - 2.2, hy = r.wid / 2 - 2.2;
	hall(w, {
		hx,
		hy,
		podium: 1.3,
		lowPodium: [1.1, .5],
		body: 5.2,
		rise: 4.8,
		eave: 2.3,
		bays: [clamp(Math.round(hx * 2 / 4), 3, 7), clamp(Math.round(hy * 2 / 4), 2, 5)],
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
var BUDDHA_AT = [-15, 140];
function buddha(w) {
	const [cx, cy] = BUDDHA_AT;
	w.xf = null;
	revolve(w, cx, cy, [
		[5.2, 0],
		[5.2, .9],
		[4.4, 1.3],
		[4.6, 2.2],
		[3.6, 3]
	], K.stone, 16, 0, true);
	revolve(w, cx, cy, [
		[3.6, 3],
		[3, 3.8],
		[2.7, 9],
		[2.4, 12.2],
		[2.7, 13.8],
		[2.2, 15.4],
		[1.1, 16],
		[.95, 16.7]
	], K.trim, 16, 0, true);
	for (const side of [-1, 1]) revolve(w, cx + side * 2.75, cy, [
		[.9, 13.8],
		[1, 12.6],
		[.85, 8.8],
		[.6, 8.2]
	], K.trim, 10, 0, true);
	revolve(w, cx, cy, [
		[.95, 16.4],
		[1.55, 17.4],
		[1.6, 18.7],
		[1.1, 19.8],
		[.02, 20.3]
	], K.trim, 16, 0, true);
	revolve(w, cx, cy, [[.35, 20.2], [.35, 21.4]], K.stone, 6);
	revolve(w, cx, cy, [
		[4.4, 21.2],
		[4.6, 21.6],
		[3.8, 22.2],
		[.5, 23]
	], K.stone, 16, 0, true);
	revolve(w, cx, cy, [
		[4.6, 21.5],
		[4.7, 21.7],
		[4.5, 21.8]
	], K.gilt, 16);
}
function buildHalls(w) {
	buddha(w);
	const small = BE_BUILDINGS.find((each) => each.name === "봉은사 판전");
	if (small) panjeon(w, small.p);
	const main = BE_BUILDINGS.find((each) => each.name === "봉은사 대웅전");
	if (main) daeungjeon(w, main.p);
}
function buildWall(w) {
	w.xf = null;
	for (const wall of BE_WALLS) {
		const line = [];
		for (let i = 0; i < wall.p.length; i += 2) line.push(local(BE_ORIGIN[0] + wall.p[i] / 1e6, BE_ORIGIN[1] + wall.p[i + 1] / 1e6, FRAME));
		wallLine(w, line, {
			half: .4,
			height: wall.h > 0 ? wall.h : 3,
			kind: K.granite,
			cap: K.trim
		});
	}
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "be-wall") buildWall(w);
	else if (id === "be-halls") buildHalls(w);
	else if (id === "be-frames") buildFrames(w, BE_BUILDINGS, DEDICATED, FRAME);
	return new Float32Array(w.data);
}
export { buildMonument, trees };
