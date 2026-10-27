import { UNIT_SHAPES } from "./unit_shapes.mjs";
import { meshBuilder } from "../../bus/mesh.mjs";
// web/modes/starcraft/units.mjs
var LINE = "line";
var LEG = {
	body: 0,
	legA: 1,
	legB: -1
};
function shapeTriangles(shape, scale = 1) {
	const out = [], hip = (shape.rig?.hip ?? 0) * scale;
	const quad = (a, b, c, d, n, color, part = "body", px = null) => {
		const leg = LEG[part] ?? 0, P = [
			a,
			b,
			c,
			d
		].map((v) => v.map((x) => x * scale));
		const pivot = [px ?? (Math.min(P[0][0], P[1][0], P[2][0], P[3][0]) + Math.max(P[0][0], P[1][0], P[2][0], P[3][0])) / 2, hip];
		for (const i of [
			0,
			1,
			2,
			0,
			2,
			3
		]) out.push({
			p: P[i],
			n,
			color,
			leg,
			pivot,
			crawl: part === "crawl"
		});
	};
	const box = (x0, y0, z0, x1, y1, z1, color, part = "body") => {
		const px = (x0 + x1) / 2 * scale;
		quad([
			x0,
			y0,
			z0
		], [
			x1,
			y0,
			z0
		], [
			x1,
			y0,
			z1
		], [
			x0,
			y0,
			z1
		], [
			0,
			-1,
			0
		], color, part, px);
		quad([
			x1,
			y1,
			z0
		], [
			x0,
			y1,
			z0
		], [
			x0,
			y1,
			z1
		], [
			x1,
			y1,
			z1
		], [
			0,
			1,
			0
		], color, part, px);
		quad([
			x1,
			y0,
			z0
		], [
			x1,
			y1,
			z0
		], [
			x1,
			y1,
			z1
		], [
			x1,
			y0,
			z1
		], [
			1,
			0,
			0
		], color, part, px);
		quad([
			x0,
			y1,
			z0
		], [
			x0,
			y0,
			z0
		], [
			x0,
			y0,
			z1
		], [
			x0,
			y1,
			z1
		], [
			-1,
			0,
			0
		], color, part, px);
		quad([
			x0,
			y1,
			z1
		], [
			x1,
			y1,
			z1
		], [
			x1,
			y0,
			z1
		], [
			x0,
			y0,
			z1
		], [
			0,
			0,
			1
		], color, part, px);
		quad([
			x0,
			y0,
			z0
		], [
			x1,
			y0,
			z0
		], [
			x1,
			y1,
			z0
		], [
			x0,
			y1,
			z0
		], [
			0,
			0,
			-1
		], color, part, px);
	};
	shape.build({
		box,
		quad: (a, b, c, d, n, color, part, px) => quad(a, b, c, d, n, color, part, px == null ? null : px * scale)
	});
	return out;
}
function buildUnitBusMesh(key) {
	const shape = UNIT_SHAPES[key], s = Math.min(2.6 / shape.len, 1.3), { data } = meshBuilder();
	for (const t of shapeTriangles(shape, s)) {
		const m = (t.color === "line" ? 39 : 40 + t.color) + (t.crawl ? 200 : t.leg ? 100 : 0), uv = t.crawl ? [t.pivot[0], 0] : t.leg ? [t.pivot[0], t.leg * Math.max(.01, t.pivot[1])] : [0, 0];
		data.push(...t.p, ...t.n, ...uv, m);
	}
	return new Float32Array(data);
}
function unitBusLook(key) {
	return {
		build: () => buildUnitBusMesh(key),
		carriers: true,
		headlights: false,
		palette: UNIT_SHAPES[key].palette
	};
}
export { LINE, UNIT_SHAPES, buildUnitBusMesh, shapeTriangles, unitBusLook };
