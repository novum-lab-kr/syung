import { K, MeshWriter, bandBox, buildBrackets, buildRoof } from "./monument_parts.mjs";
// web/city/monuments_gates.mts
var PARAPET_HEIGHT = 1.2;
var PARAPET_THICKNESS = .44;
var PARAPET_MARGIN = {
	x: 1.5,
	y: 2
};
var PARAPET_BODY = .7;
var MERLON_LENGTH = .9;
var MERLON_PITCH = 1.6;
var UPPER_TIER_START = .39;
var BEAM_FRACTION = .22;
var ROOF_LIFT = .65;
var ROOF_FLARE = .45;
var PLAQUE_VERTICAL = {
	width: .9,
	height: 1.9
};
var PLAQUE_HORIZONTAL = {
	width: 2.8,
	height: 1
};
function masonry(writer, ring, height, arch) {
	const halfArch = (arch?.width ?? 0) / 2;
	const spring = (arch?.height ?? 0) - halfArch;
	const ceiling = (east) => {
		if (!arch || Math.abs(east) > halfArch + 1e-5) return 0;
		return spring + Math.sqrt(Math.max(0, halfArch * halfArch - east * east));
	};
	const cuts = ring.map((point) => point[0]);
	if (arch) for (let segment = 0; segment <= 40; segment++) cuts.push(-halfArch + arch.width * segment / 40);
	cuts.sort((left, right) => left - right);
	const unique = [...new Set(cuts)];
	for (let index = 0; index + 1 < unique.length; index++) {
		const from = unique[index], to = unique[index + 1], middle = (from + to) / 2;
		if (to - from < 1e-5) continue;
		const crossings = [];
		for (let edge = 0; edge + 1 < ring.length; edge++) {
			const start = ring[edge], end = ring[edge + 1];
			if (middle <= Math.min(start[0], end[0]) || middle >= Math.max(start[0], end[0])) continue;
			const northAt = (east) => start[1] + (end[1] - start[1]) * (east - start[0]) / (end[0] - start[0]);
			crossings.push({
				middle: northAt(middle),
				from: northAt(from),
				to: northAt(to)
			});
		}
		crossings.sort((left, right) => left.middle - right.middle);
		for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
			const front = crossings[pair], back = crossings[pair + 1];
			const opened = arch !== null && Math.abs(middle) < halfArch;
			const bottomFrom = opened ? ceiling(from) : 0, bottomTo = opened ? ceiling(to) : 0;
			writer.quad([
				from,
				front.from,
				bottomFrom
			], [
				to,
				front.to,
				bottomTo
			], [
				to,
				front.to,
				height
			], [
				from,
				front.from,
				height
			], K.granite, [
				0,
				-1,
				0
			]);
			writer.quad([
				to,
				back.to,
				bottomTo
			], [
				from,
				back.from,
				bottomFrom
			], [
				from,
				back.from,
				height
			], [
				to,
				back.to,
				height
			], K.granite, [
				0,
				1,
				0
			]);
			writer.quad([
				from,
				front.from,
				height
			], [
				to,
				front.to,
				height
			], [
				to,
				back.to,
				height
			], [
				from,
				back.from,
				height
			], K.granite, [
				0,
				0,
				1
			]);
			if (opened) writer.quad([
				from,
				front.from,
				bottomFrom
			], [
				from,
				back.from,
				bottomFrom
			], [
				to,
				back.to,
				bottomTo
			], [
				to,
				front.to,
				bottomTo
			], K.tunnel, [
				0,
				0,
				-1
			]);
		}
	}
	for (let edge = 0; edge + 1 < ring.length; edge++) {
		const start = ring[edge], end = ring[edge + 1];
		if (Math.abs(start[0] - end[0]) < 1e-5) writer.quad([
			start[0],
			start[1],
			0
		], [
			end[0],
			end[1],
			0
		], [
			end[0],
			end[1],
			height
		], [
			start[0],
			start[1],
			height
		], K.granite, [
			Math.sign(start[0]),
			0,
			0
		]);
	}
	if (arch) for (const side of [-1, 1]) {
		const east = side * halfArch, intersections = [];
		for (let edge = 0; edge + 1 < ring.length; edge++) {
			const start = ring[edge], end = ring[edge + 1];
			if (east <= Math.min(start[0], end[0]) || east >= Math.max(start[0], end[0])) continue;
			intersections.push(start[1] + (end[1] - start[1]) * (east - start[0]) / (end[0] - start[0]));
		}
		intersections.sort((left, right) => left - right);
		const front = intersections[0], back = intersections[intersections.length - 1];
		writer.quad([
			east,
			front,
			0
		], [
			east,
			back,
			0
		], [
			east,
			back,
			spring
		], [
			east,
			front,
			spring
		], K.tunnel, [
			-side,
			0,
			0
		]);
	}
}
function pavilion(writer, shape) {
	const halfWidth = shape.frameWidth / 2, halfDepth = shape.frameDepth / 2;
	const floor = shape.masonryHeight;
	const timberHeight = shape.height - floor;
	const tiers = shape.tiers ?? 2, bays = shape.bays ?? 5, top = tiers - 1;
	for (let tier = 0; tier < tiers; tier++) {
		const halfFront = halfWidth - tier * .6, halfSide = halfDepth - tier * .25;
		const bottom = floor + timberHeight * tier * UPPER_TIER_START;
		const beam = bottom + timberHeight * BEAM_FRACTION;
		for (let column = 0; column <= bays; column++) {
			const east = -halfFront + halfFront * 2 * column / bays;
			for (const north of [
				-halfSide,
				0,
				halfSide
			]) writer.prism(east, north, .25, bottom, beam, K.red, 10);
			if (tier === 1 && column < bays) for (const side of [-1, 1]) {
				const next = -halfFront + halfFront * 2 * (column + 1) / bays;
				writer.box(east + .25, next - .25, side * halfSide - .08, side * halfSide + .08, bottom + .15, beam - .15, K.wood);
			}
		}
		if (tier === 1) for (const side of [-1, 1]) writer.box(side * halfFront - .08, side * halfFront + .08, -halfSide, halfSide, bottom + .15, beam - .15, K.wood);
		bandBox(writer, halfFront + .3, halfSide + .3, beam - .2, beam + .25, K.dancheong, 0, .28);
		buildBrackets(writer, halfFront + .3, halfSide + .3, beam + .15);
		const eave = beam + .9, roofRise = shape.height - .62 - eave;
		const innerDepth = tier === top ? 0 : halfDepth - .2;
		const rise = tier === top ? roofRise : timberHeight * .17;
		buildRoof(writer, {
			hx: halfFront + 2.5,
			hy: halfSide + 2.4,
			ix: halfFront - halfSide,
			iy: innerDepth,
			z0: eave,
			rise,
			lift: ROOF_LIFT,
			flare: ROOF_FLARE
		}, {
			innerZ: beam + .8,
			innerHx: halfFront + .3,
			innerHy: halfSide + .3
		});
		if (tier === 0) writer.quad([
			-halfFront,
			-halfSide,
			beam
		], [
			halfFront,
			-halfSide,
			beam
		], [
			halfFront,
			halfSide,
			beam
		], [
			-halfFront,
			halfSide,
			beam
		], K.tunnel, [
			0,
			0,
			-1
		]);
		if (tier === top) {
			const plaque = shape.verticalPlaque ? PLAQUE_VERTICAL : PLAQUE_HORIZONTAL, y = -halfSide - .3, widthCode = 2 * Math.round(plaque.width * 10);
			writer.box(-plaque.width / 2, plaque.width / 2, y, y + .15, bottom + .1, bottom + .1 + plaque.height, K.plaque);
			writer.quad([
				-plaque.width / 2,
				y - .01,
				bottom + .1
			], [
				plaque.width / 2,
				y - .01,
				bottom + .1
			], [
				plaque.width / 2,
				y - .01,
				bottom + .1 + plaque.height
			], [
				-plaque.width / 2,
				y - .01,
				bottom + .1 + plaque.height
			], K.plaque, [
				0,
				-1,
				0
			], widthCode, widthCode, widthCode + 1, widthCode + 1);
		}
	}
	const parapetWidth = halfWidth + PARAPET_MARGIN.x, parapetDepth = halfDepth + PARAPET_MARGIN.y;
	const run = (alongX, fixed, from, to) => {
		const half = PARAPET_THICKNESS / 2, wall = (a0, a1, z1) => {
			if (alongX) writer.box(a0, a1, fixed - half, fixed + half, floor, z1, K.ridge);
			else writer.box(fixed - half, fixed + half, a0, a1, floor, z1, K.ridge);
		};
		wall(from, to, floor + PARAPET_BODY);
		const count = Math.max(1, Math.round((to - from) / MERLON_PITCH));
		for (let merlon = 0; merlon < count; merlon++) {
			const start = from + (to - from) * merlon / count;
			wall(start, Math.min(to, start + MERLON_LENGTH), floor + PARAPET_HEIGHT);
		}
	};
	for (const side of [-1, 1]) {
		run(true, side * parapetDepth, -parapetWidth, parapetWidth);
		run(false, side * parapetWidth, -parapetDepth, parapetDepth);
	}
}
function buildCityGate(shape) {
	const writer = new MeshWriter();
	masonry(writer, shape.base, shape.masonryHeight, {
		width: shape.archWidth,
		height: shape.archHeight
	});
	if (shape.enclosure) {
		masonry(writer, shape.enclosure, shape.masonryHeight, null);
		for (let edge = 0; edge + 1 < shape.enclosure.length; edge++) {
			const start = shape.enclosure[edge], end = shape.enclosure[edge + 1];
			const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
			if (length < .5) continue;
			writer.xf = {
				x: start[0],
				y: start[1],
				cos: (end[0] - start[0]) / length,
				sin: (end[1] - start[1]) / length
			};
			const count = Math.max(1, Math.ceil(length / 2.5));
			for (let merlon = 0; merlon < count; merlon++) {
				const from = length * merlon / count, to = length * (merlon + 1) / count;
				writer.box(from, to, -.22, .22, shape.masonryHeight, shape.masonryHeight + .35, K.granite);
				writer.box(from, to - .35, -.22, .22, shape.masonryHeight + .7, shape.masonryHeight + 1.15, K.granite);
				writer.box(from, from + .3, -.22, .22, shape.masonryHeight + .35, shape.masonryHeight + .7, K.granite);
			}
			writer.xf = null;
		}
	}
	pavilion(writer, shape);
	return new Float32Array(writer.data);
}
function clipOutsideGate(line, base, yawDeg) {
	const angle = yawDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
	const halfX = Math.max(...base.map((point) => Math.abs(point[0]))) + .8, halfY = Math.max(...base.map((point) => Math.abs(point[1]))) + 1.6;
	const inside = (east, north) => Math.abs(east * cos + north * sin) < halfX && Math.abs(-east * sin + north * cos) < halfY;
	const runs = [];
	let run = [];
	for (let index = 0; index + 1 < line.length; index++) {
		const [ax, ay] = line[index], [bx, by] = line[index + 1], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / .5));
		for (let step = 0; step < steps; step++) {
			const t0 = step / steps, t1 = (step + 1) / steps, from = [ax + (bx - ax) * t0, ay + (by - ay) * t0], to = [ax + (bx - ax) * t1, ay + (by - ay) * t1];
			if (inside((from[0] + to[0]) / 2, (from[1] + to[1]) / 2)) {
				if (run.length) runs.push(run);
				run = [];
				continue;
			}
			if (!run.length) run.push(from);
			run.push(to);
		}
	}
	if (run.length) runs.push(run);
	return runs;
}
export { buildCityGate, clipOutsideGate };
