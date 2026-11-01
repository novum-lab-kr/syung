import { PNP_AT, PNP_ORIGIN } from "./monuments_data.mjs";
import { K, MeshWriter } from "./monument_parts.mjs";
import { clamp, frameOf } from "./monuments_hanok.mjs";
import { pointsOf } from "./monuments_tomb_kit.mjs";
import { PNP_LINES } from "./monuments_pungnap_data.mjs";
// web/city/monuments_pungnap.mts
var FRAME = frameOf(PNP_AT, PNP_ORIGIN);
var RAMPART = {
	halfBase: 17,
	halfCrest: 3.5,
	height: 8
};
var TAPER = 25;
var STEP = 15;
function resample(line) {
	const out = [line[0]];
	for (let i = 1; i < line.length; i++) {
		const [ax, ay] = line[i - 1], [bx, by] = line[i], parts = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 15));
		for (let k = 1; k <= parts; k++) out.push([ax + (bx - ax) * k / parts, ay + (by - ay) * k / parts]);
	}
	return out;
}
function rampart(w, source) {
	const line = resample(source);
	const dist = [0];
	for (let i = 1; i < line.length; i++) dist.push(dist[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
	const total = dist[dist.length - 1], cross = [];
	const segNormal = (i) => {
		const [ax, ay] = line[i], [bx, by] = line[i + 1], len = Math.hypot(bx - ax, by - ay) || 1;
		return [-(by - ay) / len, (bx - ax) / len];
	};
	for (let i = 0; i < line.length; i++) {
		const before = i > 0 ? segNormal(i - 1) : segNormal(0), after = i < line.length - 1 ? segNormal(i) : segNormal(line.length - 2);
		const mx = before[0] + after[0], my = before[1] + after[1], mlen = Math.hypot(mx, my) || 1, nx = mx / mlen, ny = my / mlen, miter = Math.min(2, 1 / Math.max(.5, nx * after[0] + ny * after[1]));
		const edge = clamp(Math.min(dist[i], total - dist[i]) / 25, 0, 1), f = edge * edge * (3 - 2 * edge), [px, py] = line[i];
		const at = (offset, z) => [
			px + nx * offset * miter * f,
			py + ny * offset * miter * f,
			z * f
		];
		cross.push([
			at(-RAMPART.halfBase, 0),
			at(-RAMPART.halfCrest, RAMPART.height),
			at(RAMPART.halfCrest, RAMPART.height),
			at(RAMPART.halfBase, 0)
		]);
	}
	for (let i = 0; i + 1 < line.length; i++) {
		const [ax, ay] = line[i], [bx, by] = line[i + 1], len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len;
		const hints = [
			[
				-nx * .6,
				-ny * .6,
				.8
			],
			[
				0,
				0,
				1
			],
			[
				nx * .6,
				ny * .6,
				.8
			]
		];
		for (let band = 0; band < 3; band++) w.quad(cross[i][band], cross[i + 1][band], cross[i + 1][band + 1], cross[i][band + 1], K.grass, hints[band]);
	}
}
function buildMonument(id) {
	const w = new MeshWriter();
	if (id === "pnp-wall") for (const flat of PNP_LINES) rampart(w, pointsOf(flat, PNP_ORIGIN, FRAME));
	return new Float32Array(w.data);
}
export { RAMPART, STEP, TAPER, buildMonument, rampart, resample };
