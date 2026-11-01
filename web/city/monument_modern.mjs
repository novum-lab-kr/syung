import { K } from "./monument_parts.mjs";
import { rectOf } from "./monuments_hanok.mjs";
// web/city/monument_modern.mts
var ptsOf = (flat, frame) => rectOf(flat, frame).pts;
var signedArea = (pts) => {
	let sum = 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
		sum += ax * by - bx * ay;
	}
	return sum / 2;
};
function ccw(pts) {
	const out = pts.filter((p, i) => {
		const q = pts[(i + 1) % pts.length];
		return Math.hypot(p[0] - q[0], p[1] - q[1]) > .05;
	});
	return signedArea(out) < 0 ? out.reverse() : out;
}
var faceSouth = (r) => Math.cos(r.ang) < 0 ? {
	...r,
	ang: r.ang + Math.PI
} : r;
function triangulate(pts) {
	const out = [], idx = pts.map((_, i) => i);
	const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
	let guard = 0;
	while (idx.length > 3 && guard++ < pts.length * pts.length) {
		let clipped = false;
		for (let i = 0; i < idx.length && !clipped; i++) {
			const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
			if (cross(pts[a], pts[b], pts[c]) <= 1e-9) continue;
			if (idx.some((k) => k !== a && k !== b && k !== c && cross(pts[a], pts[b], pts[k]) >= -1e-9 && cross(pts[b], pts[c], pts[k]) >= -1e-9 && cross(pts[c], pts[a], pts[k]) >= -1e-9)) continue;
			out.push([
				a,
				b,
				c
			]);
			idx.splice(i, 1);
			clipped = true;
		}
		if (!clipped) break;
	}
	for (let i = 1; i + 1 < idx.length; i++) out.push([
		idx[0],
		idx[i],
		idx[i + 1]
	]);
	return out;
}
function capPolygon(w, pts, z, kind, up = true) {
	for (const [a, b, c] of triangulate(pts)) w.tri([
		pts[a][0],
		pts[a][1],
		z
	], [
		pts[b][0],
		pts[b][1],
		z
	], [
		pts[c][0],
		pts[c][1],
		z
	], kind, [
		0,
		0,
		up ? 1 : -1
	]);
}
function extrude(w, pts, z0, z1, kind) {
	let travelled = 0;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, by - ay);
		if (len < .05) continue;
		w.quad([
			ax,
			ay,
			z0
		], [
			bx,
			by,
			z0
		], [
			bx,
			by,
			z1
		], [
			ax,
			ay,
			z1
		], kind, [
			by - ay,
			-(bx - ax),
			0
		], travelled, travelled + len, travelled + len, travelled);
		travelled += len;
	}
}
function prismPoly(w, pts, z0, z1, wall, cap) {
	extrude(w, pts, z0, z1, wall);
	capPolygon(w, pts, z1, cap);
}
function offsetPoly(pts, d) {
	return pts.map((p, i) => {
		const a = pts[(i + pts.length - 1) % pts.length], c = pts[(i + 1) % pts.length];
		const n1 = (() => {
			const l = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
			return [(p[1] - a[1]) / l, -(p[0] - a[0]) / l];
		})();
		const n2 = (() => {
			const l = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1;
			return [(c[1] - p[1]) / l, -(c[0] - p[0]) / l];
		})();
		const bx = n1[0] + n2[0], by = n1[1] + n2[1], bl = Math.hypot(bx, by) || 1, k = d / Math.max(.35, (bx * n1[0] + by * n1[1]) / bl);
		return [p[0] + bx / bl * k, p[1] + by / bl * k];
	});
}
function edgeWindows(w, pts, spec) {
	const frameKind = spec.frame ?? K.trim;
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, by - ay);
		if (len < (spec.minEdge ?? spec.bay * .9)) continue;
		const ux = (bx - ax) / len, uy = (by - ay) / len, nx = uy, ny = -ux, count = Math.max(1, Math.floor(len / spec.bay)), step = len / count;
		const nrm = [
			nx,
			ny,
			0
		];
		for (let k = 0; k < count; k++) {
			const along = step * (k + .5), cx = ax + ux * along, cy = ay + uy * along;
			if (spec.skip?.(cx, cy)) continue;
			const half = Math.min(spec.width / 2, step * .36), pt = (u, z, off) => [
				cx + ux * u + nx * off,
				cy + uy * u + ny * off,
				z
			];
			const draw = (hw, bottom, top, off, kind) => {
				if (spec.arch === "flat") {
					w.quad(pt(-hw, bottom, off), pt(hw, bottom, off), pt(hw, top, off), pt(-hw, top, off), kind, nrm);
					return;
				}
				const spring = top - (spec.arch === "round" ? hw : hw * 1.7);
				w.quad(pt(-hw, bottom, off), pt(hw, bottom, off), pt(hw, spring, off), pt(-hw, spring, off), kind, nrm);
				if (spec.arch === "pointed") {
					w.tri(pt(-hw, spring, off), pt(hw, spring, off), pt(0, top, off), kind, nrm);
					return;
				}
				for (let seg = 0; seg < 6; seg++) {
					const a0 = Math.PI * seg / 6, a1 = Math.PI * (seg + 1) / 6;
					w.tri(pt(0, spring, off), pt(hw * Math.cos(a0), spring + hw * Math.sin(a0), off), pt(hw * Math.cos(a1), spring + hw * Math.sin(a1), off), kind, nrm);
				}
			};
			draw(half, spec.z0, spec.z1, .05, frameKind);
			draw(half - .14, spec.z0 + .14, spec.z1 - .12, .08, spec.pane);
			w.quad(pt(-.04, spec.z0 + .14, .11), pt(.04, spec.z0 + .14, .11), pt(.04, spec.z1 - (spec.arch === "flat" ? .2 : half * 1.3), .11), pt(-.04, spec.z1 - (spec.arch === "flat" ? .2 : half * 1.3), .11), frameKind, nrm);
		}
	}
}
function pilasters(w, pts, z0, z1, kind, opts) {
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, by - ay);
		if (len < (opts.minEdge ?? opts.every * 1.3)) continue;
		const ux = (bx - ax) / len, uy = (by - ay) / len, nx = uy, ny = -ux, count = Math.max(2, Math.round(len / opts.every));
		for (let k = 0; k <= count; k++) {
			const along = Math.min(len - opts.width / 2, Math.max(opts.width / 2, len * k / count)), cx = ax + ux * along, cy = ay + uy * along;
			if (opts.skip?.(cx, cy)) continue;
			const corner = (u, o, z) => [
				cx + ux * u + nx * o,
				cy + uy * u + ny * o,
				z
			], half = opts.width / 2;
			w.quad(corner(-half, opts.out, z0), corner(half, opts.out, z0), corner(half, opts.out, z1), corner(-half, opts.out, z1), kind, [
				nx,
				ny,
				0
			]);
			w.quad(corner(-half, 0, z0), corner(-half, opts.out, z0), corner(-half, opts.out, z1), corner(-half, 0, z1), kind, [
				-ux,
				-uy,
				0
			]);
			w.quad(corner(half, opts.out, z0), corner(half, 0, z0), corner(half, 0, z1), corner(half, opts.out, z1), kind, [
				ux,
				uy,
				0
			]);
			w.quad(corner(-half, opts.out, z1), corner(half, opts.out, z1), corner(half, 0, z1 + .2), corner(-half, 0, z1 + .2), kind, [
				nx * .5,
				ny * .5,
				1
			]);
		}
	}
}
function belt(w, pts, z0, z1, kind, d = .12) {
	const out = offsetPoly(pts, d);
	extrude(w, out, z0, z1, kind);
	capPolygon(w, out, z1, kind);
}
function gableRoof(w, hx, hy, z0, rise, eave, roof, gable) {
	const top = z0 + rise;
	w.quad([
		-hx - eave,
		-hy - eave,
		z0
	], [
		hx + eave,
		-hy - eave,
		z0
	], [
		hx + eave,
		0,
		top
	], [
		-hx - eave,
		0,
		top
	], roof, [
		0,
		-rise,
		hy + eave
	], 0, hx * 2, hx * 2, 0);
	w.quad([
		hx + eave,
		hy + eave,
		z0
	], [
		-hx - eave,
		hy + eave,
		z0
	], [
		-hx - eave,
		0,
		top
	], [
		hx + eave,
		0,
		top
	], roof, [
		0,
		rise,
		hy + eave
	], 0, hx * 2, hx * 2, 0);
	w.tri([
		-hx - eave * .2,
		-hy,
		z0
	], [
		-hx - eave * .2,
		hy,
		z0
	], [
		-hx - eave * .2,
		0,
		top - rise * .08
	], gable, [
		-1,
		0,
		0
	]);
	w.tri([
		hx + eave * .2,
		hy,
		z0
	], [
		hx + eave * .2,
		-hy,
		z0
	], [
		hx + eave * .2,
		0,
		top - rise * .08
	], gable, [
		1,
		0,
		0
	]);
}
function revolve(w, cx, cy, profile, kind, sides = 16, turn = 0, smooth = false) {
	for (let i = 0; i + 1 < profile.length; i++) {
		const [r0, z0] = profile[i], [r1, z1] = profile[i + 1], dr = r1 - r0, dz = z1 - z0, norm = Math.hypot(dr, dz) || 1;
		for (let k = 0; k < sides; k++) {
			const a0 = turn + Math.PI * 2 * k / sides, a1 = turn + Math.PI * 2 * (k + 1) / sides, mid = (a0 + a1) / 2;
			const p = (r, z, angle) => [
				cx + Math.cos(angle) * r,
				cy + Math.sin(angle) * r,
				z
			];
			if (!smooth) {
				w.quad(p(r0, z0, a0), p(r0, z0, a1), p(r1, z1, a1), p(r1, z1, a0), kind, [
					Math.cos(mid) * dz,
					Math.sin(mid) * dz,
					-dr
				]);
				continue;
			}
			const nrm = (angle) => [
				Math.cos(angle) * dz / norm,
				Math.sin(angle) * dz / norm,
				-dr / norm
			];
			w.triN(p(r0, z0, a0), p(r0, z0, a1), p(r1, z1, a1), nrm(a0), nrm(a1), nrm(a1), kind);
			w.triN(p(r0, z0, a0), p(r1, z1, a1), p(r1, z1, a0), nrm(a0), nrm(a1), nrm(a0), kind);
		}
	}
}
function dome(w, cx, cy, z0, radius, height, kind, sides = 24) {
	const rings = 8, profile = [];
	for (let j = 0; j <= rings; j++) {
		const phi = Math.PI / 2 * j / rings;
		profile.push([Math.max(.02, radius * Math.cos(phi)), z0 + height * Math.sin(phi)]);
	}
	for (let i = 0; i + 1 < profile.length; i++) {
		const phi0 = Math.PI / 2 * i / rings, phi1 = Math.PI / 2 * (i + 1) / rings, [r0, h0] = profile[i], [r1, h1] = profile[i + 1];
		for (let k = 0; k < sides; k++) {
			const a0 = Math.PI * 2 * k / sides, a1 = Math.PI * 2 * (k + 1) / sides;
			const pt = (r, z, angle) => [
				cx + Math.cos(angle) * r,
				cy + Math.sin(angle) * r,
				z
			];
			const nrm = (angle, phi) => {
				const nx = Math.cos(angle) * Math.cos(phi) / radius, ny = Math.sin(angle) * Math.cos(phi) / radius, nz = Math.sin(phi) / height, len = Math.hypot(nx, ny, nz);
				return [
					nx / len,
					ny / len,
					nz / len
				];
			};
			w.triN(pt(r0, h0, a0), pt(r0, h0, a1), pt(r1, h1, a1), nrm(a0, phi0), nrm(a1, phi0), nrm(a1, phi1), kind);
			w.triN(pt(r0, h0, a0), pt(r1, h1, a1), pt(r1, h1, a0), nrm(a0, phi0), nrm(a1, phi1), nrm(a0, phi1), kind);
		}
	}
}
function spire(w, cx, cy, z0, radius, height, kind, accent) {
	revolve(w, cx, cy, [
		[radius, z0],
		[radius * .86, z0 + height * .3],
		[radius * .5, z0 + height * .72],
		[.25, z0 + height * .96]
	], kind, 8, Math.PI / 8);
	for (let corner = 0; corner < 4; corner++) {
		const angle = Math.PI / 4 + Math.PI / 2 * corner;
		revolve(w, cx + Math.cos(angle) * radius * 1.04, cy + Math.sin(angle) * radius * 1.04, [
			[radius * .2, z0 - .2],
			[radius * .2, z0 + height * .12],
			[.06, z0 + height * .3]
		], accent, 4, Math.PI / 4);
	}
	const top = z0 + height * .96;
	w.box(cx - .09, cx + .09, cy - .09, cy + .09, top, top + height * .08, accent);
	w.box(cx - .35, cx + .35, cy - .07, cy + .07, top + height * .035, top + height * .05, accent);
}
function wallLine(w, line, spec) {
	let travelled = 0;
	for (let i = 0; i + 1 < line.length; i++) {
		const [ax, ay] = line[i], [bx, by] = line[i + 1], len = Math.hypot(bx - ax, by - ay);
		if (len < .05) continue;
		const nx = -(by - ay) / len, ny = (bx - ax) / len;
		for (const sign of [-1, 1]) w.quad([
			ax + nx * spec.half * sign,
			ay + ny * spec.half * sign,
			0
		], [
			bx + nx * spec.half * sign,
			by + ny * spec.half * sign,
			0
		], [
			bx + nx * spec.half * sign,
			by + ny * spec.half * sign,
			spec.height
		], [
			ax + nx * spec.half * sign,
			ay + ny * spec.half * sign,
			spec.height
		], spec.kind, [
			nx * sign,
			ny * sign,
			0
		], travelled, travelled + len, travelled + len, travelled);
		w.quad([
			ax - nx * spec.half * 1.15,
			ay - ny * spec.half * 1.15,
			spec.height
		], [
			bx - nx * spec.half * 1.15,
			by - ny * spec.half * 1.15,
			spec.height
		], [
			bx + nx * spec.half * 1.15,
			by + ny * spec.half * 1.15,
			spec.height
		], [
			ax + nx * spec.half * 1.15,
			ay + ny * spec.half * 1.15,
			spec.height
		], spec.cap, [
			0,
			0,
			1
		]);
		travelled += len;
	}
}
function fenceLine(w, line, height = 1.5) {
	for (let i = 0; i + 1 < line.length; i++) {
		const [ax, ay] = line[i], [bx, by] = line[i + 1], len = Math.hypot(bx - ax, by - ay);
		if (len < .05) continue;
		const nx = -(by - ay) / len, ny = (bx - ax) / len;
		for (const sign of [-1, 1]) w.quad([
			ax,
			ay,
			.1
		], [
			bx,
			by,
			.1
		], [
			bx,
			by,
			height
		], [
			ax,
			ay,
			height
		], K.band, [
			nx * sign,
			ny * sign,
			0
		]);
		const posts = Math.max(1, Math.round(len / 3));
		for (let k = 0; k <= posts; k++) {
			const px = ax + (bx - ax) * k / posts, py = ay + (by - ay) * k / posts;
			w.box(px - .05, px + .05, py - .05, py + .05, 0, height + .1, K.band, { bottom: true });
		}
	}
}
var heightOf = (b, fallback = 8) => b.h > 0 ? b.h : b.lv > 0 ? b.lv * 3.3 + 1 : fallback;
function neutralBuilding(w, pts, height, opts = {}) {
	prismPoly(w, pts, 0, height, opts.wall ?? K.cream, opts.roof ?? K.stone);
	belt(w, pts, height, height + .35, K.trim, .1);
	if (opts.windows === false || height < 6) return;
	const floors = Math.max(2, Math.round(height / 3.4)), storey = height / floors;
	for (let floor = 0; floor < floors; floor++) edgeWindows(w, pts, {
		bay: 3.6,
		width: 1.5,
		z0: storey * floor + .9,
		z1: storey * (floor + 1) - .7,
		arch: "flat",
		pane: K.pane,
		minEdge: 5
	});
}
export { belt, capPolygon, ccw, dome, edgeWindows, extrude, faceSouth, fenceLine, gableRoof, heightOf, neutralBuilding, offsetPoly, pilasters, prismPoly, ptsOf, revolve, spire, triangulate, wallLine };
