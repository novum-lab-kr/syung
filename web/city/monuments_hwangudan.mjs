import { HG_AT, HG_ORIGIN } from "./monuments_data.mjs";
import { toM } from "./life.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { buildFrames, frameOf, place, rectOf } from "./monuments_hanok.mjs";
import { loft } from "./monument_curves.mjs";
import { HG_BUILDINGS, HG_SEOKGO, HG_WALLS } from "./monuments_hwangudan_data.mjs";
import { HG_TREES } from "./monuments_hwangudan_trees_data.mjs";
import { HG_TORCHES } from "./monuments_hwangudan_torches_data.mjs";
// web/city/monuments_hwangudan.mts
var trees = {
	at: HG_AT,
	data: HG_TREES
};
var torches = {
	at: HG_AT,
	data: HG_TORCHES
};
var FRAME = frameOf(HG_AT, HG_ORIGIN);
var local = (lng, lat) => {
	const [mx, my] = toM(lng, lat);
	return [mx - FRAME.ox, -(my - FRAME.oy)];
};
function stoneWall(w, line, halfWidth, height) {
	for (let i = 0; i + 1 < line.length; i++) {
		const [ax, ay] = line[i], [bx, by] = line[i + 1], len = Math.hypot(bx - ax, by - ay);
		if (len < .05) continue;
		const nx = -(by - ay) / len, ny = (bx - ax) / len;
		for (const sign of [-1, 1]) w.quad([
			ax + nx * halfWidth * sign,
			ay + ny * halfWidth * sign,
			0
		], [
			bx + nx * halfWidth * sign,
			by + ny * halfWidth * sign,
			0
		], [
			bx + nx * halfWidth * sign,
			by + ny * halfWidth * sign,
			height
		], [
			ax + nx * halfWidth * sign,
			ay + ny * halfWidth * sign,
			height
		], K.granite, [
			nx * sign,
			ny * sign,
			0
		]);
		w.quad([
			ax - nx * halfWidth,
			ay - ny * halfWidth,
			height
		], [
			bx - nx * halfWidth,
			by - ny * halfWidth,
			height
		], [
			bx + nx * halfWidth,
			by + ny * halfWidth,
			height
		], [
			ax + nx * halfWidth,
			ay + ny * halfWidth,
			height
		], K.trim, [
			0,
			0,
			1
		]);
	}
}
function buildWall(w) {
	for (const flat of HG_WALLS) {
		const line = [];
		for (let i = 0; i < flat.length; i += 2) line.push(local(HG_ORIGIN[0] + flat[i] / 1e6, HG_ORIGIN[1] + flat[i + 1] / 1e6));
		stoneWall(w, line, .35, 1.5);
	}
}
var SIDES = 8;
var ring = (radius, z, turn = Math.PI / SIDES) => Array.from({ length: SIDES }, (_, k) => [
	Math.cos(turn + Math.PI * 2 * k / SIDES) * radius,
	Math.sin(turn + Math.PI * 2 * k / SIDES) * radius,
	z
]);
var mid = (k, turn = Math.PI / SIDES) => turn + Math.PI * 2 * (k + .5) / SIDES;
function wallBand(w, radius, z0, z1, kind) {
	const lo = ring(radius, z0), hi = ring(radius, z1);
	for (let k = 0; k < SIDES; k++) {
		const next = (k + 1) % SIDES;
		w.quad(lo[k], lo[next], hi[next], hi[k], kind, [
			Math.cos(mid(k)),
			Math.sin(mid(k)),
			0
		]);
	}
}
function hwanggungu(w, flat) {
	const r = rectOf(flat, FRAME), base = Math.min(r.len, r.wid) / 2 * 1.02;
	place(w, {
		...r,
		cx: r.cx,
		cy: r.cy,
		ang: 0
	});
	const plinth = 1.1, storey = 3.3, wallR = base * .78;
	const lo = ring(base, 0), hi = ring(base, plinth);
	for (let k = 0; k < SIDES; k++) {
		const next = (k + 1) % SIDES;
		w.quad(lo[k], lo[next], hi[next], hi[k], K.granite, [
			Math.cos(mid(k)),
			Math.sin(mid(k)),
			0
		]);
	}
	w.quad(hi[0], hi[1], hi[2], hi[3], K.stone, [
		0,
		0,
		1
	]);
	w.quad(hi[0], hi[3], hi[4], hi[5], K.stone, [
		0,
		0,
		1
	]);
	w.quad(hi[0], hi[5], hi[6], hi[7], K.stone, [
		0,
		0,
		1
	]);
	for (let tier = 0; tier < 3; tier++) {
		const z0 = plinth + storey * tier, z1 = z0 + storey, radius = wallR - tier * .55;
		wallBand(w, radius, z0 + .1, z1 - .1, K.plaster);
		for (const p of ring(radius, z0)) w.box(p[0] - .22, p[0] + .22, p[1] - .22, p[1] + .22, z0, z1, K.red, {
			bottom: true,
			top: true
		});
		wallBand(w, radius + .04, z1 - .55, z1 - .1, K.dancheong);
		if (tier === 2) for (let k = 0; k < SIDES; k++) {
			const angle = mid(k), face = radius * Math.cos(Math.PI / SIDES) + .06, pitch = radius * 2 * Math.sin(Math.PI / SIDES) / 3.4;
			for (let n = -1; n <= 1; n++) {
				const along = n * pitch, half = pitch * .32, cx = Math.cos(angle) * face - Math.sin(angle) * along, cy = Math.sin(angle) * face + Math.cos(angle) * along, tx = -Math.sin(angle) * half, ty = Math.cos(angle) * half;
				w.quad([
					cx - tx,
					cy - ty,
					z0 + .8
				], [
					cx + tx,
					cy + ty,
					z0 + .8
				], [
					cx + tx,
					cy + ty,
					z1 - .9
				], [
					cx - tx,
					cy - ty,
					z1 - .9
				], K.window, [
					Math.cos(angle),
					Math.sin(angle),
					0
				]);
			}
		}
		else for (let k = 0; k < SIDES; k++) {
			const angle = mid(k), face = radius * Math.cos(Math.PI / SIDES) + .06, half = radius * Math.sin(Math.PI / SIDES) * .35, cx = Math.cos(angle) * face, cy = Math.sin(angle) * face, tx = -Math.sin(angle) * half, ty = Math.cos(angle) * half;
			w.quad([
				cx - tx,
				cy - ty,
				z0 + .3
			], [
				cx + tx,
				cy + ty,
				z0 + .3
			], [
				cx + tx,
				cy + ty,
				z1 - 1
			], [
				cx - tx,
				cy - ty,
				z1 - 1
			], K.red, [
				Math.cos(angle),
				Math.sin(angle),
				0
			]);
		}
	}
	const eave = (radius, z, rise, tip, kind) => {
		const out = ring(radius, z), inner = ring(tip, z + rise);
		for (let k = 0; k < SIDES; k++) {
			const next = (k + 1) % SIDES;
			w.quad(out[k], out[next], inner[next], inner[k], kind, [
				Math.cos(mid(k)) * .6,
				Math.sin(mid(k)) * .6,
				.8
			], k, k + 1, k + 1, k);
			w.quad([
				out[k][0],
				out[k][1],
				z - .25
			], [
				out[next][0],
				out[next][1],
				z - .25
			], out[next], out[k], K.fascia, [
				Math.cos(mid(k)),
				Math.sin(mid(k)),
				0
			]);
		}
	};
	eave(wallR + 1.7, 4.4, 1.3, wallR - .1, K.giwa);
	eave(wallR - .55 + 1.6, 7.699999999999999, 1.3, wallR - .65, K.giwa);
	eave(wallR - 1.1 + 1.5, 10.999999999999998, 3.4, .12, K.giwa);
	w.frustum(0, 0, .22, .22, 14.2, .05, .05, 15.599999999999998, K.stone);
	w.xf = null;
}
function drum(w, cx, baseZ) {
	const radius = .85, thick = .55, stand = .4, centerZ = baseZ + stand + radius;
	w.box(cx - thick * .9, cx + thick * .9, -.7, .7, baseZ, baseZ + stand, K.stone, { bottom: true });
	const belly = (v) => radius * (.93 + .07 * Math.sin(Math.PI * v));
	loft(w, 8, 20, (v, u) => {
		const angle = Math.PI * 2 * u, r = belly(v);
		return [
			cx - thick + 2 * thick * v,
			Math.cos(angle) * r,
			centerZ + Math.sin(angle) * r
		];
	}, K.stone);
	for (const side of [-1, 1]) loft(w, 1, 20, (v, u) => {
		const angle = Math.PI * 2 * u, r = radius * .93 * (1 - v);
		return [
			cx + side * thick,
			Math.cos(angle) * r,
			centerZ + Math.sin(angle) * r
		];
	}, K.stone);
}
function seokgo(w, flat) {
	const r = rectOf(flat, FRAME);
	place(w, r);
	const hx = r.len / 2, hy = r.wid / 2;
	w.box(-hx, hx, -hy, hy, 0, .35, K.granite, { bottom: true });
	w.quad([
		-hx,
		-hy,
		.35
	], [
		hx,
		-hy,
		.35
	], [
		hx,
		hy,
		.35
	], [
		-hx,
		hy,
		.35
	], K.stone, [
		0,
		0,
		1
	]);
	for (let n = 0; n < 3; n++) drum(w, -hx + 2 * hx * (n + .5) / 3, .35);
	w.xf = null;
}
function buildHalls(w) {
	const main = HG_BUILDINGS.find((each) => each.name === "환구단");
	if (main) hwanggungu(w, main.p);
	seokgo(w, HG_SEOKGO);
}
function buildRest(w) {
	buildFrames(w, HG_BUILDINGS.filter((each) => each.name !== "환구단"), [], FRAME);
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "hg-wall") buildWall(w);
	else if (id === "hg-halls") buildHalls(w);
	else if (id === "hg-frames") buildRest(w);
	return new Float32Array(w.data);
}
export { buildMonument, torches, trees };
