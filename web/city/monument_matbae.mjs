import { K } from "./monument_parts.mjs";
// web/city/monument_matbae.mts
function matbaeRoof(w, R) {
	const over = R.over ?? .9, steps = R.steps ?? 8, outer = R.hy + R.eave, wallX = R.hx, endX = R.hx + over, thick = .25, zTop = R.z0 + R.rise;
	const sectionY = (side, t) => side * outer * (1 - t);
	const sectionZ = (t) => R.z0 + R.rise * t ** 1.5;
	for (const side of [-1, 1]) {
		for (let i = 0; i < steps; i++) {
			const t0 = i / steps, t1 = (i + 1) / steps, y0 = sectionY(side, t0), y1 = sectionY(side, t1), z0 = sectionZ(t0), z1 = sectionZ(t1);
			const slope = (z1 - z0) / Math.abs(y1 - y0);
			w.quad([
				-endX,
				y0,
				z0
			], [
				endX,
				y0,
				z0
			], [
				endX,
				y1,
				z1
			], [
				-endX,
				y1,
				z1
			], K.giwa, [
				0,
				side * slope,
				1
			], -endX, endX, endX, -endX);
		}
		w.quad([
			-endX,
			side * outer,
			R.z0 - thick
		], [
			endX,
			side * outer,
			R.z0 - thick
		], [
			endX,
			side * outer,
			R.z0
		], [
			-endX,
			side * outer,
			R.z0
		], K.fascia, [
			0,
			side,
			0
		], -endX, endX, endX, -endX);
		w.quad([
			-endX,
			side * outer,
			R.z0 - thick
		], [
			endX,
			side * outer,
			R.z0 - thick
		], [
			endX,
			side * R.hy,
			R.z0 - thick
		], [
			-endX,
			side * R.hy,
			R.z0 - thick
		], K.soffit, [
			0,
			0,
			-1
		]);
	}
	for (const end of [-1, 1]) {
		const wx = end * wallX, ex = end * endX;
		for (const side of [-1, 1]) for (let i = 0; i < steps; i++) {
			const t0 = i / steps, t1 = (i + 1) / steps;
			const a = [
				wx,
				sectionY(side, t0),
				R.z0 - thick
			], b = [
				wx,
				sectionY(side, t1),
				R.z0 - thick
			], c = [
				wx,
				sectionY(side, t1),
				sectionZ(t1) - .05
			], d = [
				wx,
				sectionY(side, t0),
				sectionZ(t0) - .05
			];
			w.quad(a, b, c, d, K.plaster, [
				end,
				0,
				0
			]);
			const e = [
				ex,
				sectionY(side, t0),
				sectionZ(t0) - .38
			], f = [
				ex,
				sectionY(side, t1),
				sectionZ(t1) - .38
			], g = [
				ex,
				sectionY(side, t1),
				sectionZ(t1)
			], h = [
				ex,
				sectionY(side, t0),
				sectionZ(t0)
			];
			w.quad(e, f, g, h, K.timber, [
				end,
				0,
				0
			]);
		}
	}
	w.box(-endX - .1, endX + .1, -.42, .42, zTop - .12, zTop + .55, K.ridge, { bottom: true });
}
export { matbaeRoof };
