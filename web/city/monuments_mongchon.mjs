import { MCN_AT, MCN_ORIGIN } from "./monuments_data.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { frameOf, local } from "./monuments_hanok.mjs";
import { loft } from "./monument_curves.mjs";
import { groundOf, lawn, lowStone, pointsOf } from "./monuments_tomb_kit.mjs";
import { MCN_PIT } from "./monuments_mongchon_data.mjs";
// web/city/monuments_mongchon.mts
var FRAME = frameOf(MCN_AT, MCN_ORIGIN);
var HUT_R = 4;
var HUT_H = 4.2;
var MCN_HILLS = [
	{
		x: -105,
		y: 0,
		r: 58,
		h: 6.5
	},
	{
		x: -85,
		y: -85,
		r: 56,
		h: 6
	},
	{
		x: -70,
		y: 85,
		r: 60,
		h: 6.5
	},
	{
		x: 95,
		y: 85,
		r: 58,
		h: 5.5
	},
	{
		x: 120,
		y: 0,
		r: 42,
		h: 3
	},
	{
		x: -135,
		y: -45,
		r: 36,
		h: 5
	},
	{
		x: -125,
		y: 50,
		r: 32,
		h: 4.5
	},
	{
		x: -40,
		y: 125,
		r: 32,
		h: 4
	},
	{
		x: 60,
		y: 125,
		r: 28,
		h: 3.5
	},
	{
		x: -60,
		y: -125,
		r: 32,
		h: 4
	}
];
function hut(w, cx, cy) {
	loft(w, 5, 20, (v, u) => {
		const angle = Math.PI * 2 * u, radius = HUT_R * (1 - v) ** 1.1;
		return [
			cx + Math.cos(angle) * radius,
			cy + Math.sin(angle) * radius,
			HUT_H * v
		];
	}, K.thatch);
	const door = [
		[
			cx - .55,
			cy - HUT_R - .05,
			0
		],
		[
			cx + .55,
			cy - HUT_R - .05,
			0
		],
		[
			cx + .35,
			cy - HUT_R * (1 - 1.5 / HUT_H) - .05,
			1.5
		],
		[
			cx - .35,
			cy - HUT_R * (1 - 1.5 / HUT_H) - .05,
			1.5
		]
	];
	w.quad(door[0], door[1], door[2], door[3], K.tunnel, [
		0,
		-.7,
		.7
	]);
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "mcn-land") {
		lawn(w, MCN_HILLS, groundOf(MCN_HILLS, [], [], []));
		return new Float32Array(w.data);
	}
	if (id !== "mcn-halls") return new Float32Array(w.data);
	lowStone(w, pointsOf(MCN_PIT.p, MCN_ORIGIN, FRAME));
	for (let i = 0; i < MCN_PIT.centers.length; i += 2) {
		const [cx, cy] = local(MCN_ORIGIN[0] + MCN_PIT.centers[i] / 1e6, MCN_ORIGIN[1] + MCN_PIT.centers[i + 1] / 1e6, FRAME);
		hut(w, cx, cy);
	}
	return new Float32Array(w.data);
}
export { MCN_HILLS, buildMonument };
