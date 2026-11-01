import { S2_AT, S2_ORIGIN } from "./monuments_data.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { frameOf } from "./monuments_hanok.mjs";
import { belt, capPolygon, ccw, dome, edgeWindows, extrude, gableRoof, ptsOf, revolve } from "./monument_modern.mjs";
import { S2_BUILDINGS } from "./monuments_seoul284_data.mjs";
// web/city/monuments_seoul284.mts
var FRAME = frameOf(S2_AT, S2_ORIGIN);
var WALL = 13.2;
var DOME_AT = [6.6, -12.5];
var DRUM = 4.2;
var RADIUS = 6.5;
function roofAt(w, [cx, cy], alongY, hx, hy, rise, eave) {
	w.xf = {
		x: cx,
		y: cy,
		cos: alongY ? 0 : 1,
		sin: alongY ? 1 : 0
	};
	gableRoof(w, hx, hy, WALL + .3, rise, eave, K.slate, K.redBrick);
	w.xf = null;
}
function portico(w) {
	const height = 10.6;
	const block = [
		[13.5, -20.5],
		[17.1, -20.5],
		[17.1, -4.5],
		[13.5, -4.5]
	];
	w.xf = null;
	extrude(w, block, 0, height, K.redBrick);
	belt(w, block, 0, 1.2, K.stone, .1);
	belt(w, block, 10, 10.799999999999999, K.stone, .2);
	capPolygon(w, block, 10.799999999999999, K.stone);
	edgeWindows(w, block, {
		bay: 5.2,
		width: 3.4,
		z0: 1.8,
		z1: 8.6,
		arch: "round",
		pane: K.pane,
		minEdge: 8,
		skip: (x) => x < 16.8
	});
	w.xf = {
		x: 15.3,
		y: -12.5,
		cos: 0,
		sin: 1
	};
	gableRoof(w, 8.4, 2.2, 10.799999999999999, 2.4, .5, K.slate, K.redBrick);
	w.xf = null;
}
function station(w) {
	const b = S2_BUILDINGS[0];
	if (!b) return;
	const pts = ccw(ptsOf(b.p, FRAME));
	w.xf = null;
	extrude(w, pts, 0, WALL, K.redBrick);
	belt(w, pts, 0, 1.2, K.stone, .12);
	belt(w, pts, 5.2, 5.55, K.stone, .1);
	belt(w, pts, 10.2, 10.5, K.stone, .1);
	belt(w, pts, WALL - .5, WALL + .3, K.stone, .28);
	capPolygon(w, pts, WALL + .3, K.slate);
	roofAt(w, [-6.6, 0], true, 56, 7.9, 3.8, .7);
	roofAt(w, [-6.6, -63.5], false, 7.9, 6.1, 6.8, .7);
	roofAt(w, [-6.6, 63.3], false, 7.9, 6.2, 6.8, .7);
	roofAt(w, [-4.3, -44], false, 10, 4.7, 3.2, .5);
	roofAt(w, [-3.5, 19.2], false, 11.4, 5.5, 3.4, .5);
	portico(w);
	edgeWindows(w, pts, {
		bay: 4.4,
		width: 2,
		z0: 1.9,
		z1: 5,
		arch: "round",
		pane: K.pane,
		minEdge: 5
	});
	edgeWindows(w, pts, {
		bay: 4.4,
		width: 2,
		z0: 6.4,
		z1: 9.9,
		arch: "round",
		pane: K.pane,
		minEdge: 5
	});
	edgeWindows(w, pts, {
		bay: 4.4,
		width: 1.8,
		z0: 11,
		z1: 12.6,
		arch: "flat",
		pane: K.pane,
		minEdge: 5
	});
	const [cx, cy] = DOME_AT, z0 = WALL + .3;
	revolve(w, cx, cy, [[RADIUS + .5, z0], [RADIUS + .5, z0 + DRUM]], K.redBrick, 16, 0, false);
	revolve(w, cx, cy, [
		[RADIUS + .75, z0 + DRUM - .5],
		[RADIUS + .75, z0 + DRUM + .2],
		[RADIUS, z0 + DRUM + .2]
	], K.stone, 16);
	dome(w, cx, cy, z0 + DRUM + .2, RADIUS, 5.5, K.copper, 24);
	w.box(cx - .15, cx + .15, cy - .15, cy + .15, z0 + DRUM + 5.5, z0 + DRUM + 7.2, K.copper, {});
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "s2-halls") station(w);
	return new Float32Array(w.data);
}
export { buildMonument };
