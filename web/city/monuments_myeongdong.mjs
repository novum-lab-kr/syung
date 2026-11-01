import { MD_AT, MD_ORIGIN } from "./monuments_data.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { frameOf, place, rectOf } from "./monuments_hanok.mjs";
import { belt, capPolygon, ccw, edgeWindows, extrude, gableRoof, heightOf, neutralBuilding, pilasters, ptsOf, spire } from "./monument_modern.mjs";
import { MD_BUILDINGS } from "./monuments_myeongdong_data.mjs";
// web/city/monuments_myeongdong.mts
var FRAME = frameOf(MD_AT, MD_ORIGIN);
var NAVE_ID = 210335697;
var TOWER_ID = 1139745172;
var AISLE = 10;
var CLERE = 15.5;
var RIDGE = 23;
function placeAt(w, r, dx) {
	w.xf = {
		x: r.cx + dx * Math.cos(r.ang),
		y: r.cy + dx * Math.sin(r.ang),
		cos: Math.cos(r.ang),
		sin: Math.sin(r.ang)
	};
}
function nave(w) {
	const b = MD_BUILDINGS.find((each) => each.id === NAVE_ID);
	if (!b) return;
	const r = rectOf(b.p, FRAME), pts = ccw(r.pts), half = r.wid / 2, apse = -r.len / 2 + half;
	w.xf = null;
	extrude(w, pts, 0, AISLE, K.redBrick);
	belt(w, pts, 0, 1.1, K.stone, .12);
	belt(w, pts, AISLE - .3, AISLE + .1, K.stone, .16);
	capPolygon(w, pts, AISLE + .1, K.slate);
	edgeWindows(w, pts, {
		bay: 4.4,
		width: 1.7,
		z0: 3.2,
		z1: 8.8,
		arch: "pointed",
		pane: K.pane,
		minEdge: 6
	});
	pilasters(w, pts, 0, AISLE + .5, K.stone, {
		every: 6,
		width: .9,
		out: .6,
		minEdge: 8
	});
	placeAt(w, r, 0);
	const x0 = apse, x1 = r.len / 2 - .2, mid = (x0 + x1) / 2, body = 10;
	w.box(x0, x1, -10, body, AISLE, CLERE, K.redBrick, {});
	edgeWindows(w, [
		[x0, -10],
		[x1, -10],
		[x1, body],
		[x0, body]
	], {
		bay: 4.4,
		width: 1.6,
		z0: AISLE + 1.2,
		z1: CLERE - .5,
		arch: "pointed",
		pane: K.pane,
		minEdge: 8,
		skip: (x) => x < x0 + 2
	});
	for (const side of [-1, 1]) w.quad([
		x0,
		side * (half + .4),
		AISLE + .1
	], [
		x1,
		side * (half + .4),
		AISLE + .1
	], [
		x1,
		side * body,
		CLERE - .3
	], [
		x0,
		side * body,
		CLERE - .3
	], K.slate, [
		0,
		side * -1,
		.55
	]);
	placeAt(w, r, mid);
	gableRoof(w, (x1 - x0) / 2, body, CLERE, RIDGE - CLERE, .4, K.slate, K.redBrick);
	placeAt(w, r, 0);
	const rim = half + .5, apexZ = AISLE + 9;
	const steps = 12;
	for (let k = 0; k < steps; k++) {
		const a0 = Math.PI / 2 + Math.PI * k / steps, a1 = Math.PI / 2 + Math.PI * (k + 1) / steps, mid2 = (a0 + a1) / 2;
		w.tri([
			apse + Math.cos(a0) * rim,
			Math.sin(a0) * rim,
			AISLE + .1
		], [
			apse + Math.cos(a1) * rim,
			Math.sin(a1) * rim,
			AISLE + .1
		], [
			apse,
			0,
			apexZ
		], K.slate, [
			Math.cos(mid2) * 9,
			Math.sin(mid2) * 9,
			rim
		]);
	}
	w.xf = null;
}
function tower(w) {
	const b = MD_BUILDINGS.find((each) => each.id === TOWER_ID);
	if (!b) return;
	const r = rectOf(b.p, FRAME), pts = ccw(r.pts), shaft = 30;
	w.xf = null;
	extrude(w, pts, 0, shaft, K.redBrick);
	belt(w, pts, 0, 1.4, K.stone, .15);
	belt(w, pts, 10, 10.4, K.stone, .12);
	belt(w, pts, 20, 20.4, K.stone, .12);
	belt(w, pts, 29.5, shaft, K.stone, .35);
	capPolygon(w, pts, shaft, K.slate);
	edgeWindows(w, pts, {
		bay: 3.4,
		width: 1.2,
		z0: 3.8,
		z1: 8.6,
		arch: "pointed",
		pane: K.pane,
		minEdge: 6
	});
	edgeWindows(w, pts, {
		bay: 3.4,
		width: 1.2,
		z0: 21.4,
		z1: 28.2,
		arch: "pointed",
		pane: K.pane,
		minEdge: 6
	});
	pilasters(w, pts, 0, 30.4, K.stone, {
		every: 11,
		width: 1,
		out: .7,
		minEdge: 8
	});
	place(w, r);
	spire(w, 0, 0, shaft, 4.6, 47 / 1.04 - shaft / 1.04, K.slate, K.stone);
	w.xf = null;
}
function compound(w) {
	for (const b of MD_BUILDINGS) {
		if (b.id === NAVE_ID || b.id === TOWER_ID) continue;
		const pts = ccw(ptsOf(b.p, FRAME));
		neutralBuilding(w, pts, heightOf(b, 6));
	}
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "md-halls") {
		nave(w);
		tower(w);
	} else if (id === "md-frames") compound(w);
	return new Float32Array(w.data);
}
export { buildMonument };
