import { SD_AT, SD_ORIGIN } from "./monuments_data.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { frameOf, local, place, rectOf } from "./monuments_hanok.mjs";
import { belt, capPolygon, ccw, edgeWindows, extrude, fenceLine, gableRoof, heightOf, neutralBuilding, wallLine } from "./monument_modern.mjs";
import { SD_BUILDINGS, SD_WALLS } from "./monuments_seodaemun_data.mjs";
import { SD_TREES } from "./monuments_seodaemun_trees_data.mjs";
// web/city/monuments_seodaemun.mts
var FRAME = frameOf(SD_AT, SD_ORIGIN);
var trees = {
	at: SD_AT,
	data: SD_TREES
};
var BRICK = {
	"서대문형무소 역사관": {
		height: 8.6,
		rise: 4.4,
		eave: .7
	},
	"중앙사": {
		height: 7.4,
		rise: 3,
		eave: .6
	},
	"9옥사": {
		height: 7.4,
		rise: 3,
		eave: .6
	},
	"10옥사": {
		height: 7.4,
		rise: 3,
		eave: .6
	},
	"11옥사": {
		height: 7.4,
		rise: 3,
		eave: .6
	},
	"12옥사": {
		height: 7.4,
		rise: 3,
		eave: .6
	},
	"여옥사": {
		height: 7.4,
		rise: 3,
		eave: .6
	},
	"공작사": {
		height: 6,
		rise: 2.6,
		eave: .6
	},
	"여공장": {
		height: 5.5,
		rise: 2.4,
		eave: .6
	},
	"한센병사": {
		height: 4.5,
		rise: 2,
		eave: .5
	}
};
var pointsOf = (flat) => {
	const line = [];
	for (let i = 0; i < flat.length; i += 2) line.push(local(SD_ORIGIN[0] + flat[i] / 1e6, SD_ORIGIN[1] + flat[i + 1] / 1e6, FRAME));
	return line;
};
function brickBlock(w, flat, look) {
	const r = rectOf(flat, FRAME), pts = ccw(r.pts), { height } = look;
	w.xf = null;
	extrude(w, pts, 0, height, K.redBrick);
	belt(w, pts, 0, .6, K.stone, .1);
	belt(w, pts, height - .3, height + .1, K.stone, .12);
	capPolygon(w, pts, height + .1, K.slate);
	const floors = height > 6 ? 2 : 1, storey = height / floors;
	for (let floor = 0; floor < floors; floor++) edgeWindows(w, pts, {
		bay: 3.2,
		width: .95,
		z0: storey * floor + 1.2,
		z1: storey * floor + 2.7,
		arch: "flat",
		pane: K.band,
		minEdge: 5
	});
	place(w, r);
	gableRoof(w, r.len / 2, r.wid / 2, height + .1, look.rise, look.eave, K.slate, K.redBrick);
	w.xf = null;
}
function deathHouse(w, flat) {
	const r = rectOf(flat, FRAME);
	place(w, r);
	const hx = r.len / 2, hy = r.wid / 2;
	w.box(-hx, hx, -hy, hy, 0, .5, K.stone, { bottom: true });
	w.box(-hx + .1, hx - .1, -hy + .1, hy - .1, .5, 4.5, K.timber, { bottom: true });
	gableRoof(w, hx, hy, 4.5, 2.6, .8, K.giwa, K.timber);
	w.xf = null;
}
function buildHalls(w) {
	for (const b of SD_BUILDINGS) {
		const look = BRICK[b.name];
		if (look) brickBlock(w, b.p, look);
		else if (b.name === "사형장") deathHouse(w, b.p);
		else if (b.name === "격벽장") {
			const ring = pointsOf(b.p);
			ring.push(ring[0]);
			wallLine(w, ring, {
				half: .22,
				height: 3,
				kind: K.redBrick,
				cap: K.stone
			});
		}
	}
}
function buildFrames(w) {
	for (const b of SD_BUILDINGS) {
		if (BRICK[b.name] || b.name === "사형장" || b.name === "격벽장") continue;
		neutralBuilding(w, ccw(rectOf(b.p, FRAME).pts), heightOf(b, 4.5));
	}
}
function buildWall(w) {
	w.xf = null;
	for (const wall of SD_WALLS) {
		const line = pointsOf(wall.p);
		if (wall.kind === "fence") fenceLine(w, line);
		else wallLine(w, line, {
			half: .35,
			height: wall.h > 0 ? wall.h : 3,
			kind: K.redBrick,
			cap: K.stone
		});
	}
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "sd-wall") buildWall(w);
	else if (id === "sd-halls") buildHalls(w);
	else if (id === "sd-frames") buildFrames(w);
	return new Float32Array(w.data);
}
export { buildMonument, trees };
