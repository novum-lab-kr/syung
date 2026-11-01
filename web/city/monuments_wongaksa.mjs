import { WG_AT, WG_ORIGIN } from "./monuments_data.mjs";
import { toM } from "./life.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { MID, frameOf, hall, place, rectOf } from "./monuments_hanok.mjs";
import { ccw, faceSouth, heightOf, neutralBuilding, ptsOf, revolve, wallLine } from "./monument_modern.mjs";
import { WG_BUILDINGS, WG_WALLS } from "./monuments_wongaksa_data.mjs";
// web/city/monuments_wongaksa.mts
var FRAME = frameOf(WG_AT, WG_ORIGIN);
var local = (lng, lat) => {
	const [mx, my] = toM(lng, lat);
	return [mx - FRAME.ox, -(my - FRAME.oy)];
};
var byName = (name) => WG_BUILDINGS.find((each) => each.name === name);
function plus(w, half, z0, z1, kind) {
	const core = half * .66, arm = half * .38;
	w.box(-core, core, -core, core, z0, z1, kind, { bottom: true });
	w.box(-half, half, -arm, arm, z0, z1, kind, { bottom: true });
	w.box(-arm, arm, -half, half, z0, z1, kind, { bottom: true });
}
function roofStone(w, half, z0, rise) {
	w.frustum(0, 0, half, half, z0, half * .55, half * .55, z0 + rise, K.stone, { bottom: true });
}
function pagoda(w) {
	const base = [
		{
			half: 4.6,
			height: 1.4
		},
		{
			half: 4,
			height: 1.2
		},
		{
			half: 3.4,
			height: 1
		}
	];
	let z = 0;
	for (const tier of base) {
		plus(w, tier.half, z, z + tier.height, K.stone);
		z += tier.height;
		w.box(-tier.half - .12, tier.half + .12, -tier.half - .12, tier.half + .12, z - .12, z, K.trim, { bottom: true });
	}
	for (let storey = 1; storey <= 10; storey++) {
		const cross = storey <= 3, body = cross ? .72 : .46, roof = cross ? .38 : .24, half = cross ? 2.55 - (storey - 1) * .17 : 1.5 - (storey - 4) * .1;
		if (cross) plus(w, half, z, z + body, K.stone);
		else w.box(-half, half, -half, half, z, z + body, K.stone, { bottom: true });
		for (const [sx, sy] of [
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1]
		]) w.box(sx * half * (cross ? .66 : 1) - .06, sx * half * (cross ? .66 : 1) + .06, sy * half * (cross ? .66 : 1) - .06, sy * half * (cross ? .66 : 1) + .06, z, z + body, K.trim, {
			bottom: true,
			top: true
		});
		z += body;
		roofStone(w, half + (cross ? .55 : .36), z, roof);
		z += roof;
	}
	w.box(-.1, .1, -.1, .1, z, z + .5, K.trim, {});
	w.frustum(0, 0, .3, .3, z + .5, .08, .08, z + .95, K.trim);
}
function glassCase(w, hx, hy) {
	const height = 14.5, rail = .06, spacing = 1.9;
	const nx = Math.max(2, Math.round(hx * 2 / spacing)), ny = Math.max(2, Math.round(hy * 2 / spacing));
	for (let i = 0; i <= nx; i++) {
		const x = -hx + hx * 2 * i / nx;
		for (const y of [-hy, hy]) w.box(x - rail, x + rail, y - rail, y + rail, 0, height, K.shield, {
			bottom: true,
			top: true
		});
	}
	for (let i = 1; i < ny; i++) {
		const y = -hy + hy * 2 * i / ny;
		for (const x of [-hx, hx]) w.box(x - rail, x + rail, y - rail, y + rail, 0, height, K.shield, {
			bottom: true,
			top: true
		});
	}
	for (const z of [
		.15,
		height * .5,
		height
	]) {
		w.box(-hx, hx, -hy - rail, -hy + rail, z - rail, z + rail, K.shield, {});
		w.box(-hx, hx, hy - rail, hy + rail, z - rail, z + rail, K.shield, {});
		w.box(-hx - rail, -hx + rail, -hy, hy, z - rail, z + rail, K.shield, {});
		w.box(hx - rail, hx + rail, -hy, hy, z - rail, z + rail, K.shield, {});
	}
	const ridge = 15.8;
	const tip = (sx) => [
		sx * Math.max(0, hx - hy) * .9,
		0,
		ridge
	];
	for (const [cx, cy] of [
		[-hx, -hy],
		[hx, -hy],
		[hx, hy],
		[-hx, hy]
	]) {
		const [tx, ty, tz] = tip(Math.sign(cx)), dx = tx - cx, dy = ty - cy, side = Math.hypot(dx, dy);
		if (side < .5) continue;
		w.quad([
			cx - dy / side * rail,
			cy + dx / side * rail,
			height
		], [
			cx + dy / side * rail,
			cy - dx / side * rail,
			height
		], [
			tx + dy / side * rail,
			ty - dx / side * rail,
			tz
		], [
			tx - dy / side * rail,
			ty + dx / side * rail,
			tz
		], K.shield, [
			0,
			0,
			1
		]);
	}
}
function buildPagodaCase(w) {
	const b = byName("서울원각사지십층석탑");
	if (!b) return;
	const r = faceSouth(rectOf(b.p, FRAME));
	place(w, r);
	pagoda(w);
	glassCase(w, r.len / 2 - .2, r.wid / 2 - .2);
	w.xf = null;
}
function octagonPavilion(w, flat) {
	const r = rectOf(flat, FRAME), radius = Math.min(r.len, r.wid) / 2 * .8;
	w.xf = {
		x: r.cx,
		y: r.cy,
		cos: 1,
		sin: 0
	};
	revolve(w, 0, 0, [[radius * 1.1, 0], [radius * 1.1, .85]], K.granite, 8, Math.PI / 8);
	revolve(w, 0, 0, [[radius * 1.1, .85], [.02, .85]], K.stone, 8, Math.PI / 8);
	for (let k = 0; k < 8; k++) {
		const angle = Math.PI * 2 * k / 8 + Math.PI / 8;
		w.box(Math.cos(angle) * radius * .88 - .24, Math.cos(angle) * radius * .88 + .24, Math.sin(angle) * radius * .88 - .24, Math.sin(angle) * radius * .88 + .24, .85, 5.1, K.red, {
			bottom: true,
			top: true
		});
	}
	revolve(w, 0, 0, [[radius * .94, 4.5], [radius * .94, 5.1]], K.dancheong, 8, Math.PI / 8);
	revolve(w, 0, 0, [[radius * 1.55, 4.9], [radius * 1.55, 5.2]], K.fascia, 8, Math.PI / 8);
	revolve(w, 0, 0, [[radius * 1.55, 5.2], [radius * .2, 8.3]], K.giwa, 8, Math.PI / 8);
	w.frustum(0, 0, .24, .24, 8.1, .06, .06, 9.2, K.stone);
	w.xf = null;
}
function samilmun(w, flat) {
	const r = faceSouth(rectOf(flat, FRAME));
	place(w, r);
	hall(w, {
		hx: r.len / 2 - 1.3,
		hy: r.wid / 2 - 1.3,
		podium: .6,
		body: 3.4,
		rise: 1.9,
		eave: 1.3,
		bays: [3, 1],
		steps: MID,
		hollow: true
	});
	w.xf = null;
}
function stele(w, flat) {
	const r = faceSouth(rectOf(flat, FRAME));
	place(w, r);
	const hx = r.len / 2, hy = r.wid / 2;
	w.box(-hx, hx, -hy, hy, 0, .2, K.granite, { bottom: true });
	w.box(-1.4, 1.4, -.8, .8, .2, .95, K.stone, { bottom: true });
	w.box(-.85, .85, -.25, .25, .95, 4.4, K.stone, { bottom: true });
	w.frustum(0, 0, .95, .32, 4.4, .6, .22, 5.1, K.stone);
	w.xf = null;
}
function buildHalls(w) {
	buildPagodaCase(w);
	const pavilion = byName("탑골공원 팔각정");
	if (pavilion) octagonPavilion(w, pavilion.p);
	const gate = byName("삼일문");
	if (gate) samilmun(w, gate.p);
	const monument = byName("서울원각사지대원각사비");
	if (monument) stele(w, monument.p);
}
function buildFrames(w) {
	for (const b of WG_BUILDINGS.filter((each) => ["", "탑골공원 관리실"].includes(each.name))) neutralBuilding(w, ccw(ptsOf(b.p, FRAME)), heightOf(b, 4.5));
}
function buildWall(w) {
	for (const wall of WG_WALLS) {
		const line = [];
		for (let i = 0; i < wall.p.length; i += 2) line.push(local(WG_ORIGIN[0] + wall.p[i] / 1e6, WG_ORIGIN[1] + wall.p[i + 1] / 1e6));
		wallLine(w, line, {
			half: .35,
			height: wall.h > 0 ? wall.h : 2.4,
			kind: K.stone,
			cap: K.trim
		});
	}
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "wg-wall") buildWall(w);
	else if (id === "wg-halls") buildHalls(w);
	else if (id === "wg-frames") buildFrames(w);
	return new Float32Array(w.data);
}
export { buildMonument };
