import { K } from "./monument_parts.mjs";
// web/city/monuments_western.mts
function railX(w, x0, x1, y, z, kind, skip) {
	const h = .9, count = Math.max(1, Math.round((x1 - x0) / .6));
	w.box(x0, x1, y - .07, y + .07, z + h - .08, z + h + .04, kind, { bottom: true });
	w.box(x0, x1, y - .06, y + .06, z + .06, z + .16, kind, {
		bottom: true,
		top: true
	});
	for (let i = 0; i <= count; i++) {
		const x = x0 + (x1 - x0) * i / count;
		if (skip?.(x)) continue;
		w.box(x - .035, x + .035, y - .035, y + .035, z + .16, z + h - .08, kind, {
			bottom: true,
			top: true
		});
	}
}
function railY(w, x, y0, y1, z, kind) {
	const h = .9, count = Math.max(1, Math.round((y1 - y0) / .6));
	w.box(x - .07, x + .07, y0, y1, z + h - .08, z + h + .04, kind, { bottom: true });
	w.box(x - .06, x + .06, y0, y1, z + .06, z + .16, kind, {
		bottom: true,
		top: true
	});
	for (let i = 0; i <= count; i++) {
		const y = y0 + (y1 - y0) * i / count;
		w.box(x - .035, x + .035, y - .035, y + .035, z + .16, z + h - .08, kind, {
			bottom: true,
			top: true
		});
	}
}
function windowAt(w, pt, nrm, center, half, z0, z1, look) {
	const frame = look.frame ?? look.trim ?? K.trim;
	const draw = (hw, bottom, top, off, kind) => {
		if (!look.arch) {
			w.quad(pt(center - hw, bottom, off), pt(center + hw, bottom, off), pt(center + hw, top, off), pt(center - hw, top, off), kind, nrm);
			return;
		}
		const spring = top - hw, segs = 6;
		w.quad(pt(center - hw, bottom, off), pt(center + hw, bottom, off), pt(center + hw, spring, off), pt(center - hw, spring, off), kind, nrm);
		for (let i = 0; i < segs; i++) {
			const a0 = Math.PI * i / segs, a1 = Math.PI * (i + 1) / segs;
			w.tri(pt(center, spring, off), pt(center + hw * Math.cos(a0), spring + hw * Math.sin(a0), off), pt(center + hw * Math.cos(a1), spring + hw * Math.sin(a1), off), kind, nrm);
		}
	};
	draw(half, z0, z1, .05, frame);
	draw(half - .12, z0 + .12, z1 - .1, .07, K.pane);
	w.quad(pt(center - .03, z0 + .12, .09), pt(center + .03, z0 + .12, .09), pt(center + .03, z1 - .2 - (look.arch ? half : 0), .09), pt(center - .03, z1 - .2 - (look.arch ? half : 0), .09), frame, nrm);
}
function windows(w, hx, hy, z0, z1, bay, look, face, skip, margin = .7) {
	const len = face < 2 ? hx * 2 : hy * 2, n = Math.max(1, Math.round(len / bay)), step = len / n, half = Math.min(1.1, step * .34);
	const nrm = face === 0 ? [
		0,
		-1,
		0
	] : face === 1 ? [
		0,
		1,
		0
	] : face === 2 ? [
		-1,
		0,
		0
	] : [
		1,
		0,
		0
	];
	const pt = (u, z, off) => face === 0 ? [
		u,
		-hy - off,
		z
	] : face === 1 ? [
		u,
		hy + off,
		z
	] : face === 2 ? [
		-hx - off,
		u,
		z
	] : [
		hx + off,
		u,
		z
	];
	for (let i = 0; i < n; i++) {
		const t = -len / 2 + step * (i + .5);
		if (skip(t)) continue;
		windowAt(w, pt, nrm, t, half, z0 + margin, z1 - margin, look);
	}
}
function portico(w, hx, hy, base, top, p, look) {
	const trim = look.trim ?? K.trim, frame = look.frame ?? trim, width = Math.min(hx * 2 * .55, Math.max(p.cols * 2.6, 6)) / 2, front = -hy - p.depth;
	w.box(-width - .6, width + .6, front - .3, -hy, base - .4, base, K.granite, { bottom: true });
	for (let k = 0; k < p.cols; k++) {
		const x = p.cols === 1 ? 0 : -width + 2 * width * k / (p.cols - 1);
		w.prism(x, front + .2, .42, base, top - .5, trim, 8);
	}
	w.box(-width - .5, width + .5, front - .15, -hy + .2, top - .5, top + .2, trim, { bottom: true });
	if (p.pediment) {
		const rise = Math.min(2.2, width * .28);
		w.tri([
			-width - .5,
			front - .15,
			top + .2
		], [
			width + .5,
			front - .15,
			top + .2
		], [
			0,
			front - .15,
			top + .2 + rise
		], trim, [
			0,
			-1,
			0
		]);
		const slope = (sx) => w.quad([
			sx * (width + .5),
			front - .15,
			top + .2
		], [
			sx * (width + .5),
			-hy + .2,
			top + .2
		], [
			0,
			-hy + .2,
			top + .2 + rise
		], [
			0,
			front - .15,
			top + .2 + rise
		], K.slate, [
			sx * .3,
			0,
			1
		]);
		slope(1);
		slope(-1);
	}
	if (p.balcony) {
		const z = top - 1.7;
		w.box(-width - .5, width + .5, front - .1, -hy, z, z + .2, trim, { bottom: true });
		if (look.balustrade) {
			railX(w, -width - .4, width + .4, front - .02, z + .2, frame);
			railY(w, -width - .4, front - .02, -hy, z + .2, frame);
			railY(w, width + .4, front - .02, -hy, z + .2, frame);
		}
	}
	if (!p.noStairs) for (let k = 0; k < 4; k++) w.box(-2.2, 2.2, front - (k + 1) * .32, front - k * .32, 0, base * (1 - (k + 1) / 5), K.granite, { bottom: true });
}
function terrace(w, hx, hy, plinth, depth, look) {
	const frame = look.frame ?? look.trim ?? K.trim, x = hx + .6, y = -hy - depth, gap = 2.6;
	w.box(-x, x, y, -hy, plinth - .5, plinth, K.granite, { bottom: true });
	if (look.balustrade) {
		railX(w, -x, x, y + .08, plinth, frame, (t) => Math.abs(t) < gap);
		railY(w, -x, y, -hy, plinth, frame);
		railY(w, x, y, -hy, plinth, frame);
	}
	const steps = 7, rise = plinth / 8;
	for (let k = 0; k < steps; k++) w.box(-2.6, gap, y - (k + 1) * .36, y - k * .36 + .02, 0, plinth - rise * (k + 1), K.granite, { bottom: true });
}
function veranda(w, hx, hy, plinth, storey, v, look) {
	const d = v.depth, trim = look.trim ?? K.trim, frame = look.frame ?? v.post, floors = v.floors ?? 1, half = v.thin ?? .12;
	const x0 = -hx - (v.sides ? d : 0), x1 = hx + (v.sides ? d : 0), yFront = -hy - d, yBack = v.sides ? hy + d : hy;
	const strip = (z0, z1, kind) => {
		w.box(x0 - .3, x1 + .3, yFront - .3, -hy, z0, z1, kind, { bottom: true });
		if (v.sides) {
			w.box(x0 - .3, -hx, -hy, yBack + .3, z0, z1, kind, { bottom: true });
			w.box(hx, x1 + .3, -hy, yBack + .3, z0, z1, kind, { bottom: true });
			w.box(-hx, hx, hy, yBack + .3, z0, z1, kind, { bottom: true });
		}
	};
	for (let f = 0; f < floors; f++) {
		const z = plinth + f * storey, post = (x, y) => w.box(x - half, x + half, y - half, y + half, z, z + storey - .3, v.post, {
			bottom: true,
			top: true
		});
		const n = Math.max(2, Math.round((x1 - x0) / 2.6));
		for (let i = 0; i <= n; i++) post(x0 + (x1 - x0) * i / n, yFront);
		if (v.sides) {
			const m = Math.max(2, Math.round((yBack - yFront) / 2.6));
			for (let i = 0; i <= m; i++) {
				const y = yFront + (yBack - yFront) * i / m;
				post(x0, y);
				post(x1, y);
			}
			for (let i = 0; i <= n; i++) post(x0 + (x1 - x0) * i / n, yBack);
		}
		strip(z + storey - .3, z + storey, trim);
		strip(z, z + .15, K.deck);
		if (v.rail) {
			railX(w, x0, x1, yFront, z + .15, frame);
			if (v.sides) {
				railY(w, x0, yFront, yBack, z + .15, frame);
				railY(w, x1, yFront, yBack, z + .15, frame);
				railX(w, x0, x1, yBack, z + .15, frame);
			}
		}
	}
}
function sideBalcony(w, hy, hx, plinth, storey, b, look) {
	const trim = look.trim ?? K.trim, frame = look.frame ?? trim, xIn = b.side * hx, xOut = b.side * (hx + b.depth), lo = Math.min(xIn, xOut), hi = Math.max(xIn, xOut), z = plinth + storey;
	w.box(lo, hi, -hy, hy, z - .2, z, trim, { bottom: true });
	const n = Math.max(2, Math.round(hy * 2 / 2.8));
	for (let i = 0; i <= n; i++) {
		const y = -hy + hy * 2 * i / n;
		w.box(xOut - .11, xOut + .11, y - .11, y + .11, plinth, z - .2, trim, {
			bottom: true,
			top: true
		});
	}
	railY(w, xOut, -hy, hy, z, frame);
	railX(w, lo, hi, -hy, z, frame);
	railX(w, lo, hi, hy, z, frame);
}
function glassFrame(w, hx, hy, plinth, H, look) {
	const trim = look.trim ?? K.trim, post = .05, off = .05, nx = Math.max(2, Math.round(hx * 2 / 1.6)), ny = Math.max(2, Math.round(hy * 2 / 1.6));
	for (let i = 0; i <= nx; i++) {
		const x = -hx + hx * 2 * i / nx;
		w.box(x - post, x + post, -hy - off - .04, -hy - off + .04, plinth, H, trim, {
			bottom: true,
			top: true
		});
		w.box(x - post, x + post, hy + off - .04, hy + off + .04, plinth, H, trim, {
			bottom: true,
			top: true
		});
	}
	for (let i = 0; i <= ny; i++) {
		const y = -hy + hy * 2 * i / ny;
		w.box(-hx - off - .04, -hx - off + .04, y - post, y + post, plinth, H, trim, {
			bottom: true,
			top: true
		});
		w.box(hx + off - .04, hx + off + .04, y - post, y + post, plinth, H, trim, {
			bottom: true,
			top: true
		});
	}
	for (const z of [plinth + (H - plinth) * .5, H - .05]) {
		w.box(-hx - off - .05, hx + off + .05, -hy - off - .04, -hy - off + .04, z - .05, z + .05, trim, {
			bottom: true,
			top: true
		});
		w.box(-hx - off - .05, hx + off + .05, hy + off - .04, hy + off + .04, z - .05, z + .05, trim, {
			bottom: true,
			top: true
		});
		w.box(-hx - off - .04, -hx - off + .04, -hy - off, hy + off, z - .05, z + .05, trim, {
			bottom: true,
			top: true
		});
		w.box(hx + off - .04, hx + off + .04, -hy - off, hy + off, z - .05, z + .05, trim, {
			bottom: true,
			top: true
		});
	}
}
function glassRoofFrame(w, hx, hy, base, top, o, look) {
	const trim = look.trim ?? K.trim, n = Math.max(2, Math.round(hx * 2 / 1.6)), lift = .06;
	for (let i = 0; i <= n; i++) {
		const x = -hx - o + (hx + o) * 2 * i / n;
		w.quad([
			x - .05,
			-hy - o,
			base + lift
		], [
			x + .05,
			-hy - o,
			base + lift
		], [
			x + .05,
			0,
			top + lift
		], [
			x - .05,
			0,
			top + lift
		], trim, [
			0,
			-.6,
			1
		]);
		w.quad([
			x - .05,
			hy + o,
			base + lift
		], [
			x + .05,
			hy + o,
			base + lift
		], [
			x + .05,
			0,
			top + lift
		], [
			x - .05,
			0,
			top + lift
		], trim, [
			0,
			.6,
			1
		]);
	}
	w.box(-hx - o, hx + o, -.08, .08, top, top + .1, trim, { bottom: true });
}
function openCore(w, hx, hy, plinth, H, look) {
	const stone = K.stone, brick = look.wall, pitch = 2.9, pier = .6;
	w.box(-hx, hx, -hy, hy, plinth, plinth + .12, K.deck, { bottom: true });
	w.box(-hx, hx, hy - .5, hy, plinth, H, brick, {
		bottom: true,
		top: true
	});
	for (const sx of [-1, 1]) for (const sy of [-1, 1]) w.box(sx * hx - pier, sx * hx + pier, sy * hy - pier, sy * hy + pier, plinth, H, brick, {
		bottom: true,
		top: true
	});
	const column = (x, y) => {
		w.box(x - .42, x + .42, y - .42, y + .42, plinth, plinth + .3, stone, { bottom: true });
		w.box(x - .3, x + .3, y - .3, y + .3, plinth + .3, H - .75, stone, {
			bottom: true,
			top: true
		});
		w.box(x - .46, x + .46, y - .46, y + .46, H - .75, H - .45, stone, { bottom: true });
	};
	const nx = Math.max(2, Math.round(hx * 2 / pitch)), ny = Math.max(2, Math.round(hy * 2 / pitch));
	for (let i = 1; i < nx; i++) column(-hx + hx * 2 * i / nx, -hy);
	for (let i = 1; i < ny; i++) {
		const y = -hy + hy * 2 * i / ny;
		column(-hx, y);
		column(hx, y);
	}
	w.box(-hx, hx, -hy - .3, -hy + .3, H - .45, H, stone, { bottom: true });
	w.box(-hx - .3, -hx + .3, -hy, hy, H - .45, H, stone, { bottom: true });
	w.box(hx - .3, hx + .3, -hy, hy, H - .45, H, stone, { bottom: true });
	w.box(-hx, hx, -hy, hy, H - .1, H, K.plaster, {
		bottom: false,
		top: true
	});
}
function westernBuilding(w, hx, hy, look) {
	const trim = look.trim ?? K.trim, plinth = look.plinth ?? .6, storey = look.storey, H = plinth + look.floors * storey, bay = look.bayWidth ?? 3.4;
	w.box(-hx, hx, -hy, hy, 0, plinth, look.plinthKind ?? K.granite, { bottom: true });
	if (!look.open) w.box(-hx + .05, hx - .05, -hy + .05, hy - .05, plinth, H, look.glass ? K.glass : look.wall, {
		bottom: true,
		top: true
	});
	else openCore(w, hx, hy, plinth, H, look);
	const porticoWidth = look.portico ? Math.min(hx * 2 * .55, Math.max(look.portico.cols * 2.6, 6)) / 2 + .6 : 0;
	const balcony = look.sideBalcony;
	if (look.plinthWindows && !look.glass && !look.open) {
		const low = {
			...look,
			arch: false
		};
		for (let face = 0; face < 4; face++) windows(w, hx, hy, 0, plinth, bay, low, face, (t) => face === 0 && look.portico !== void 0 && Math.abs(t) < porticoWidth, 1);
	}
	for (let floor = 0; floor < look.floors; floor++) {
		const z0 = plinth + floor * storey, z1 = z0 + storey;
		if (!look.glass && !look.open) for (let face = 0; face < 4; face++) windows(w, hx, hy, z0, z1, bay, look, face, (t) => face === 0 && look.portico !== void 0 && Math.abs(t) < porticoWidth);
		if (floor > 0 && !look.glass) w.box(-hx - .08, hx + .08, -hy - .08, hy + .08, z0 - .12, z0 + .12, trim, {
			bottom: true,
			top: true
		});
	}
	if (look.glass) glassFrame(w, hx, hy, plinth, H, look);
	w.box(-hx - .35, hx + .35, -hy - .35, hy + .35, H, H + .35, trim, { bottom: true });
	const eave = look.eave ?? .5, roofKind = look.roofKind ?? K.slate;
	if (look.roof === "flat") w.box(-hx - .1, hx + .1, -hy - .1, hy + .1, H + .35, H + .85, trim, { bottom: true });
	else if (look.roof === "hip") {
		const run = look.roofRise * 1.45, hx1 = Math.max(.25, hx + eave - run), hy1 = Math.max(.25, hy + eave - run);
		w.frustum(0, 0, hx + eave, hy + eave, H + .35, hx1, hy1, H + .35 + look.roofRise, roofKind, { bottom: true });
	} else {
		const top = H + .35 + look.roofRise, o = eave;
		w.quad([
			-hx - o,
			-hy - o,
			H + .35
		], [
			hx + o,
			-hy - o,
			H + .35
		], [
			hx + o,
			0,
			top
		], [
			-hx - o,
			0,
			top
		], roofKind, [
			0,
			-.6,
			1
		]);
		w.quad([
			hx + o,
			hy + o,
			H + .35
		], [
			-hx - o,
			hy + o,
			H + .35
		], [
			-hx - o,
			0,
			top
		], [
			hx + o,
			0,
			top
		], roofKind, [
			0,
			.6,
			1
		]);
		w.tri([
			-hx - o,
			-hy,
			H + .35
		], [
			-hx - o,
			hy,
			H + .35
		], [
			-hx - o,
			0,
			top - .05
		], look.wall, [
			-1,
			0,
			0
		]);
		w.tri([
			hx + o,
			hy,
			H + .35
		], [
			hx + o,
			-hy,
			H + .35
		], [
			hx + o,
			0,
			top - .05
		], look.wall, [
			1,
			0,
			0
		]);
		if (look.glass) glassRoofFrame(w, hx, hy, H + .35, top, o, look);
	}
	if (look.terrace) terrace(w, hx, hy, plinth, look.terrace, look);
	if (look.portico) portico(w, hx, hy, plinth, plinth + storey * Math.min(2, look.floors), {
		...look.portico,
		noStairs: look.portico.noStairs || look.terrace !== void 0
	}, look);
	if (look.veranda) veranda(w, hx, hy, plinth, storey, look.veranda, look);
	if (balcony) sideBalcony(w, hy, hx, plinth, storey, balcony, look);
}
function shiftLocal(w, dx, dy) {
	if (!w.xf) return;
	const { x, y, cos, sin } = w.xf;
	w.xf = {
		x: x + dx * cos - dy * sin,
		y: y + dx * sin + dy * cos,
		cos,
		sin
	};
}
export { shiftLocal, westernBuilding };
