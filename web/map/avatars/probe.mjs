import { __exportAll } from "../../_virtual/_rolldown/runtime.mjs";
// web/map/avatars/probe.mts
var probe_exports = /* @__PURE__ */ __exportAll({
	build: () => build,
	name: () => name,
	rig: () => rig
});
var name = "프로토스 프로브";
var rig = {
	hip: .52,
	shoulder: .52
};
function build({ box, quad }) {
	const gold = "#dcb963", light = "#f3d990", bronze = "#9b743f", cyan = "#70efeb";
	box(-.27, -.24, .56, .25, .24, .86, gold);
	box(-.21, -.29, .61, .18, .29, .81, gold);
	box(-.21, -.19, .85, .2, .19, .94, light);
	box(-.12, -.12, .93, .11, .12, .99, light);
	box(-.22, -.2, .49, .2, .2, .57, bronze);
	box(-.15, -.14, .46, .14, .14, .5, "#e4c477");
	box(-.3, -.12, .64, -.265, .12, .81, bronze);
	box(-.315, -.075, .68, -.3, .075, .77, cyan);
	box(.25, -.145, .635, .276, .145, .825, bronze);
	box(.276, -.112, .665, .305, .112, .795, "#258f9c");
	box(.305, -.078, .69, .334, .078, .775, cyan);
	box(.334, -.033, .715, .342, .033, .756, "#d5fffa");
	box(-.06, -.035, .99, .06, .035, 1.015, bronze);
	const spar = (a, b, wa, wb, color, part, rootX) => {
		const ends = (p, w) => [
			[
				p[0] - w,
				p[1] - w,
				p[2]
			],
			[
				p[0] + w,
				p[1] - w,
				p[2]
			],
			[
				p[0] + w,
				p[1] + w,
				p[2]
			],
			[
				p[0] - w,
				p[1] + w,
				p[2]
			]
		];
		const A = ends(a, wa), B = ends(b, wb), pivot = [rootX, rig.hip];
		quad(A[0], A[1], B[1], B[0], [
			0,
			-1,
			0
		], color, part, pivot);
		quad(A[1], A[2], B[2], B[1], [
			1,
			0,
			0
		], light, part, pivot);
		quad(A[2], A[3], B[3], B[2], [
			0,
			1,
			0
		], color, part, pivot);
		quad(A[3], A[0], B[0], B[3], [
			-1,
			0,
			0
		], bronze, part, pivot);
		quad(A[3], A[2], A[1], A[0], [
			0,
			0,
			1
		], light, part, pivot);
		quad(B[0], B[1], B[2], B[3], [
			0,
			0,
			-1
		], color, part, pivot);
	};
	for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
		const part = sy > 0 ? "legL" : "legR";
		const x = sx * .155, y = sy * .19;
		box(x - .065, y - .065, .5, x + .065, y + .065, .63, bronze, part);
		box(x - .046, y - .046, .49, x + .046, y + .046, .57, cyan, part);
		spar([
			x,
			y,
			.52
		], [
			sx * .32,
			sy * .34,
			.34
		], .047, .033, gold, part, x);
		spar([
			sx * .32,
			sy * .34,
			.34
		], [
			sx * .4,
			sy * .37,
			.14
		], .033, .006, gold, part, x);
	}
}
export { build, name, probe_exports, rig };
