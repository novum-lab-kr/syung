import { registerCityPart } from "../../city/parts.mjs";
import { area, orientedBox, simplifyRing } from "../../city/geom.mjs";
import { HANOK_KIND, POSTS } from "../../city/mesh.mjs";
// web/modes/joseon/hanok.mts
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
var lerp = (a, b, t) => a + (b - a) * t;
var smooth = (t) => t * t * (3 - 2 * t);
var CIVIC = /* @__PURE__ */ new Set([
	"school",
	"university",
	"college",
	"hospital",
	"civic",
	"public"
]);
function bufferCut(r, E) {
	const n = r.length / 2, b = E / 64;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n, ax = r[i * 2], ay = r[i * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1];
		if (ax === bx && ay !== by && (ax <= -b || ax >= E + b) || ay === by && ax !== bx && (ay <= -b || ay >= E + b)) return true;
	}
	return false;
}
function hash2(x, y) {
	let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
	h = Math.imul(h ^ h >>> 13, 1274126177);
	return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function districtNoise(xm, ym, cell) {
	const x = xm / cell, y = ym / cell, ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
	return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), fx), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), fx), fy);
}
function hanokType(H, A, aspect, landuse, district, K, r) {
	const T = K.tall;
	if (H >= T.pagodaMinH && aspect <= T.pagodaMaxAspect && r(1) < T.pagodaShare) return {
		kind: "pagoda",
		thatch: false,
		H
	};
	if (H >= T.towerMinH) return {
		kind: "tower",
		thatch: false,
		H
	};
	if (H >= T.hallMinH && A >= T.hallMinAreaM2 && r(2) < (landuse === "residential" ? T.hallShareResidential : T.hallShare)) return {
		kind: "hall",
		thatch: false
	};
	const base = CIVIC.has(landuse) ? 0 : K.thatch.byLanduse[landuse] ?? K.thatch.byLanduse.unknown;
	const p = A > K.thatch.maxAreaM2 || H >= T.towerMinH ? 0 : clamp(base * (.2 + 1.6 * smooth(clamp((district - .25) / .5, 0, 1))), 0, .95);
	return {
		kind: "house",
		thatch: r(3) < p
	};
}
function houseWings(L, S, K, rnd, thatch) {
	const m = K.eaveOutM * .5, a = L / 2 - m, b = S / 2 - m;
	if (a < 1.6 || b < 1.4) return [{
		x: 0,
		y: 0,
		hl: Math.max(1.2, a),
		hd: Math.max(1.2, b),
		turn: false
	}];
	const d = clamp(Math.min(L, S) * .42, 4.2, thatch ? 5.2 : 6.6), sb = rnd(4) < .5 ? 1 : -1, sx = rnd(5) < .5 ? 1 : -1;
	const fitsL = 2 * b >= d + 3.5 && 2 * a >= 2 * d, fitsU = fitsL && 2 * a >= 2 * d + 3, fitsO = 2 * a >= 2 * d + 4 && 2 * b >= 2 * d + 4;
	const w = thatch ? K.plans.thatch : K.plans.giwa, u = rnd(6);
	let plan = u < w[0] ? "ㅡ" : u < w[0] + w[1] ? "ㄱ" : u < w[0] + w[1] + w[2] ? "ㄷ" : "ㅁ";
	if (plan === "ㅁ" && !fitsO) plan = "ㄷ";
	if (plan === "ㄷ" && !fitsU) plan = "ㄱ";
	if (plan === "ㄱ" && !fitsL) plan = "ㅡ";
	const back = {
		x: 0,
		y: sb * (b - d / 2),
		hl: a,
		hd: d / 2,
		turn: false
	};
	if (plan === "ㅡ") return 2 * b > d * 1.5 ? [back] : [{
		x: 0,
		y: 0,
		hl: a,
		hd: b,
		turn: false
	}];
	const side = (s) => {
		const y0 = sb * (b - d / 2), y1 = plan === "ㅁ" ? -y0 : -sb * b;
		return {
			x: s * (a - d / 2),
			y: (y0 + y1) / 2,
			hl: Math.abs(y0 - y1) / 2,
			hd: d / 2,
			turn: true
		};
	};
	if (plan === "ㄱ") return [back, side(sx)];
	if (plan === "ㄷ") return [
		back,
		side(1),
		side(-1)
	];
	return [
		back,
		{
			x: 0,
			y: -back.y,
			hl: a,
			hd: d / 2,
			turn: false
		},
		side(1),
		side(-1)
	];
}
function hanokLayout(L, S, K, rnd = () => .5, type = {
	kind: "house",
	thatch: false
}) {
	const eave = K.eaveOutM, one = K.single, C = K.compound, thatch = !!type.thatch, gate = rnd(9) < .5 ? 1 : -1;
	const court = (h, stone) => ({
		hx: L / 2 - C.insetM,
		hy: S / 2 - C.insetM,
		stone,
		gate
	});
	const T = K.tall;
	if (type.kind === "tower") {
		const a = Math.max(2.5, L / 2 - .3 - T.podiumOutM), b = Math.max(2.5, S / 2 - .3 - T.podiumOutM), [ma, mb] = T.towerMaxHalfM;
		if (a <= ma && b <= mb) return {
			houses: [{
				x: 0,
				y: 0,
				hl: a,
				hd: b,
				turn: false,
				thatch: false,
				kind: "tower",
				H: type.H
			}],
			wall: null
		};
		const ta = Math.min(a, ma), houses = [{
			x: 0,
			y: 0,
			hl: ta,
			hd: Math.min(b, mb),
			turn: false,
			thatch: false,
			kind: "tower",
			H: type.H
		}], side = L / 2 - ta - T.podiumOutM - 4;
		if (side >= 9) for (const sx of [-1, 1]) houses.push({
			x: sx * (L / 2 - side / 2 - 1.5),
			y: 0,
			hl: Math.min(side / 2 - 1, T.hallHalfM[0]),
			hd: clamp(S / 2 - 6, 3.5, T.hallHalfM[1]),
			turn: false,
			thatch: false,
			kind: "hall"
		});
		return {
			houses,
			wall: court(0, false)
		};
	}
	if (type.kind === "pagoda") {
		const s = Math.max(3, Math.min(L, S) / 2 - T.pagodaEaveM - .5), walled = L * S >= C.minAreaM2 && Math.min(L, S) / 2 - s > 4;
		return {
			houses: [{
				x: 0,
				y: 0,
				hl: s,
				hd: s,
				turn: false,
				thatch: false,
				kind: "pagoda",
				H: type.H
			}],
			wall: walled ? court(0, false) : null
		};
	}
	if (type.kind === "hall") return {
		houses: [{
			x: 0,
			y: 0,
			hl: clamp(L / 2 - 4, 4, T.hallHalfM[0]),
			hd: clamp(S / 2 - 4, 3.5, T.hallHalfM[1]),
			turn: false,
			thatch: false,
			kind: "hall"
		}],
		wall: L * S >= C.minAreaM2 ? court(0, false) : null
	};
	if (L <= one.maxLengthM && S <= one.maxDepthM) {
		const P = K.lot;
		if (L * S >= P.minAreaM2 && rnd(1) < (thatch ? P.thatchShare : P.giwaShare)) {
			const mx = C.insetM + P.wallThickM + .8, li = L - 2 * mx, si = S - 2 * mx - P.yardM;
			if (li >= 5 && si >= 4) return {
				houses: houseWings(li, si, K, rnd, thatch).map((h) => ({
					...h,
					y: h.y - gate * P.yardM / 2,
					thatch,
					kind: "house"
				})),
				wall: court(0, thatch || rnd(2) < P.stoneShareGiwa)
			};
		}
		return {
			houses: houseWings(L, S, K, rnd, thatch).map((h) => ({
				...h,
				thatch,
				kind: "house"
			})),
			wall: null
		};
	}
	const walled = L * S >= C.minAreaM2, edge = walled ? C.insetM + C.wallThickM + eave + 1 : eave * .5;
	const Li = Math.max(4, L - 2 * edge), Si = Math.max(4, S - 2 * edge), [d0, d1] = K.houseDepthM;
	let nR = Math.max(1, Math.floor((Si + K.yardM) / (d1 + K.yardM))), nC = Math.max(1, Math.round((Li + K.gapM) / (K.houseLengthM + K.gapM)));
	while (nR * nC > K.maxHouses) if (nC >= nR) nC--;
	else nR--;
	const D = clamp((Si - (nR - 1) * K.yardM) / nR, Math.min(d0, Si), d1), Lc = Math.min(K.maxLengthM, (Li - (nC - 1) * K.gapM) / nC);
	const pitchL = Lc + K.gapM, x0 = -(nC * Lc + (nC - 1) * K.gapM) / 2 + Lc / 2, pitchS = nR > 1 ? (Si - D) / (nR - 1) : 0, houses = [];
	for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
		const k = r * 97 + c;
		if (nR * nC >= 3 && rnd(k) < K.emptyShare) continue;
		const fl = .72 + .28 * rnd(k + 41), fd = .8 + .2 * rnd(k + 53);
		houses.push({
			x: x0 + pitchL * c,
			y: nR > 1 ? -Si / 2 + D / 2 + pitchS * r : 0,
			hl: Math.max(1.2, Lc / 2 * fl),
			hd: Math.max(1.2, D / 2 * fd),
			turn: false,
			thatch: thatch && rnd(k + 67) < .85,
			kind: "house"
		});
	}
	if (!houses.length) houses.push({
		x: 0,
		y: 0,
		hl: Math.max(1.2, Lc / 2),
		hd: D / 2,
		turn: false,
		thatch,
		kind: "house"
	});
	return {
		houses,
		wall: walled ? court(0, thatch || rnd(2) < C.stoneShare) : null
	};
}
function hanokBuilding(tb, it, unit) {
	const K = tb.P.hanok, E = tb.E, mpu = tb.mPerUnit;
	if (it.depth) return;
	const cut = it.clipped && bufferCut(it.raw, E), ring0 = !it.clipped || cut ? it.outer : it.raw;
	const ring = ring0.length > 160 ? simplifyRing(ring0, .5 / mpu) : ring0, box = orientedBox(ring);
	if (!box) return;
	const A = it.clipped && !cut ? area(it.raw) * mpu * mpu : it.A;
	const k = clamp(Math.sqrt(A / Math.max(box.hw * box.hh * 4 * mpu * mpu, 1e-6)), .55, 1) * K.fitK, L = box.hw * 2 * mpu * k, S = box.hh * 2 * mpu * k;
	const rnd = (i) => unit(it.seed, 101 + i), n = 2 ** tb.src.z, cm = 40075016.68557849 * Math.cos(37.55 * Math.PI / 180);
	const district = districtNoise((tb.src.x + box.cx / E) / n * cm, (tb.src.y + box.cy / E) / n * cm, K.thatch.districtM);
	const lay = hanokLayout(L, S, K, rnd, hanokType(it.H, A, L / Math.max(S, .1), it.landuse, district, K, (i) => unit(it.seed, 211 + i)));
	const ux = box.ux, uy = box.uy, vx = -uy, vy = ux;
	const at = (x, y) => [box.cx + (x * ux + y * vx) / mpu, box.cy + (x * uy + y * vy) / mpu];
	const sx = tb.src.x, sy = tb.src.y, q = (v) => Math.round(v * 1024) / 1024;
	const mine = (p) => Math.floor(q(sx * E + p[0]) / E) === sx && Math.floor(q(sy * E + p[1]) / E) === sy;
	const W = tb.W, seed = it.seed >>> 0;
	W.b = [
		seed & 255,
		seed >>> 8 & 255,
		0,
		0
	];
	let drawn = 0;
	lay.houses.forEach((h, i) => {
		const c = at(h.x, h.y);
		if (!mine(c)) return;
		const F = h.turn ? frame(tb, c, vx, vy) : frame(tb, c, ux, uy), r = (j) => unit(it.seed, 7 + i * 13 + j);
		if (h.kind === "tower") tower(tb, F, h.hl, h.hd, h.H, K, r);
		else if (h.kind === "pagoda") pagoda(tb, F, h.hl, h.H, K, r);
		else if (h.kind === "hall") hall(tb, F, h.hl, h.hd, K, r);
		else if (h.thatch) thatchHouse(tb, F, h.hl, h.hd, K, r);
		else giwaHouse(tb, F, h.hl, h.hd, K, r);
		drawn++;
	});
	if (lay.wall) drawn += walls(tb, at, mine, ux, uy, lay.wall, K);
	if (drawn) tb.count++;
}
function skirtGroups(len, G) {
	const leg = clamp(G.cornerK * len, G.cornerM[0], G.cornerM[1]);
	if (len <= 2 * leg + G.gapM) return [[0, len]];
	const span = len - 2 * leg - 2 * G.gapM, out = [[0, leg]];
	if (span >= G.minM) {
		const n = Math.max(1, Math.round((span + G.gapM) / (G.widthM + G.gapM))), w = (span - (n - 1) * G.gapM) / n;
		for (let i = 0; i < n; i++) {
			const x = leg + G.gapM + i * (w + G.gapM);
			out.push([x, x + w]);
		}
	}
	out.push([len - leg, len]);
	return out;
}
function skirtInst(xy, z, angle, L, u0, ends, l0, l1, o, slot) {
	const f = /* @__PURE__ */ new Float32Array(8), b = new Uint8Array(f.buffer), q = (v) => clamp(Math.round(v * 100), 0, 255);
	f[0] = xy[0];
	f[1] = xy[1];
	f[2] = z;
	f[3] = angle;
	f[4] = L;
	f[5] = u0;
	b[24] = q(ends[0]);
	b[25] = q(ends[1]);
	b[26] = q(ends[2]);
	b[27] = q(ends[3]);
	b[28] = q(l0);
	b[29] = q(l1);
	b[30] = q(o);
	b[31] = slot;
	return f;
}
function skirtTemplate(rows) {
	const v = [], idx = [], R = rows.length;
	for (const t of rows) for (const sc of [
		0,
		.5,
		1
	]) v.push(sc, t, 0);
	for (const sc of [
		0,
		.5,
		1
	]) v.push(sc, 1, 1, sc, 1, 2);
	const last = R * 3 - 1;
	idx.push(0, 2, last, 0, last, last - 2);
	for (let ti = 0; ti < R - 1; ti++) for (let si = 0; si < 2; si++) {
		const q = ti * 3 + si;
		idx.push(q, q + 1, q + 4, q, q + 4, q + 3);
	}
	const e = R * 3;
	for (let i = 0; i < 2; i++) {
		const a = e + 2 * i, b = a + 2;
		idx.push(a, b, b + 1, a, b + 1, a + 1);
	}
	return {
		verts: new Float32Array(v),
		idx: new Uint16Array(idx),
		lo: [0, 6],
		grid: [6, (R - 1) * 12],
		edge: [6 + (R - 1) * 12, 12]
	};
}
var ROOF_INST = 64;
var BOX_INST = 40;
function roofInst(xy, angle, v, sty, seed) {
	const f = /* @__PURE__ */ new Float32Array(16), b = new Uint8Array(f.buffer);
	f[0] = xy[0];
	f[1] = xy[1];
	f[2] = angle;
	f.set(v, 3);
	b[56] = sty[0];
	b[57] = sty[1];
	b[58] = sty[2];
	b[60] = seed[0];
	b[61] = seed[1];
	return f;
}
function boxInst(xy, angle, a, b, z0, zt, storey, w, seed) {
	const f = /* @__PURE__ */ new Float32Array(10), u = new Uint8Array(f.buffer);
	f[0] = xy[0];
	f[1] = xy[1];
	f[2] = angle;
	f[3] = a;
	f[4] = b;
	f[5] = z0;
	f[6] = zt;
	f[7] = storey;
	u[32] = w[0];
	u[33] = w[1];
	u[34] = w[2];
	u[35] = w[3];
	u[36] = seed[0];
	u[37] = seed[1];
	return f;
}
function roofTemplate() {
	const v = [], P = [];
	const add = (part, n, f) => {
		const b = v.length / 3;
		P[part] = b;
		for (let k = 0; k < n; k++) {
			const [i, j] = f(k);
			v.push(part, i, j);
		}
	};
	for (const part of [0, 1]) add(part, 12, (k) => [k % 3, Math.floor(k / 3)]);
	for (const part of [2, 3]) add(part, 6, (k) => [k % 2, Math.floor(k / 2)]);
	for (const part of [4, 5]) add(part, 7, (k) => [k, 0]);
	add(6, 12, (k) => [k, 0]);
	add(7, 16, (k) => [k, 0]);
	add(8, 20, (k) => [k, 0]);
	add(9, 20, (k) => [k, 0]);
	add(10, 8, (k) => [k, 0]);
	add(11, 36, (k) => [k, 0]);
	const far = [], near = [], detail = [], gable = [
		5,
		6,
		1,
		5,
		1,
		0,
		0,
		1,
		3,
		0,
		3,
		2,
		2,
		3,
		4
	];
	for (const part of [0, 1]) {
		const b = P[part];
		far.push(b, b + 2, b + 11, b, b + 11, b + 9);
		for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
			const q = b + j * 3 + i;
			near.push(q, q + 1, q + 4, q, q + 4, q + 3);
		}
	}
	for (const part of [2, 3]) {
		const b = P[part];
		far.push(b, b + 1, b + 5, b, b + 5, b + 4);
		for (let j = 0; j < 2; j++) {
			const q = b + j * 2;
			near.push(q, q + 1, q + 3, q, q + 3, q + 2);
		}
	}
	for (const part of [4, 5]) for (const i of gable) {
		far.push(P[part] + i);
		near.push(P[part] + i);
	}
	for (let q = 0; q < 3; q++) {
		const b = P[6] + q * 4;
		near.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	for (let f = 0; f < 4; f++) {
		const b = P[7] + f * 4;
		near.push(b + 1, b + 3, b + 2, b + 1, b + 2, b);
	}
	for (const part of [8, 9]) for (let f = 0, b = P[part]; f < 4; f++) {
		const n = f < 2 ? 3 : 2;
		for (let i = 0; i < n - 1; i++) detail.push(b + i, b + i + 1, b + n + i + 1, b + i, b + n + i + 1, b + n + i);
		b += 2 * n;
	}
	for (const e of [0, 4]) {
		const b = P[10] + e;
		detail.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	for (let h = 0; h < 4; h++) for (let q = 0; q < 2; q++) for (let c = 0; c < 2; c++) {
		const a = P[11] + h * 9 + q * 3 + c, b = a + 3;
		detail.push(a, a + 1, b + 1, a, b + 1, b);
	}
	return {
		verts: new Float32Array(v),
		idx: new Uint16Array([
			...far,
			...near,
			...detail
		]),
		far: [0, far.length],
		near: [far.length, near.length],
		detail: [far.length, near.length + detail.length]
	};
}
function boxTemplate() {
	const v = [], idx = [];
	for (let s = 0; s < 4; s++) {
		for (const [e, t] of [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		]) v.push(s, e, t);
		const b = s * 4;
		idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	const b4 = v.length / 3;
	for (let i = 0; i < 20; i++) v.push(4, i, 0);
	const b5 = v.length / 3;
	for (let i = 0; i < 32; i++) v.push(5, i, 0);
	for (let q = 0; q < 5; q++) {
		const b = b4 + q * 4;
		idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	for (let q = 0; q < 8; q++) {
		const b = b5 + q * 4;
		idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	for (let sd = 0; sd < 4; sd++) for (let k = 0; k < 12; k++) {
		const b = v.length / 3;
		for (let c = 0; c < 28; c++) v.push(6 + sd, k, c);
		for (let q = 0; q < 7; q++) idx.push(b + q * 4, b + q * 4 + 1, b + q * 4 + 2, b + q * 4, b + q * 4 + 2, b + q * 4 + 3);
	}
	return {
		verts: new Float32Array(v),
		idx: new Uint16Array(idx),
		far: [0, 24],
		near: [0, 24],
		detail: [0, idx.length]
	};
}
function frame(tb, c, ux, uy) {
	const W = tb.W, mpu = tb.mPerUnit, u = tb.unit, vx = -uy, vy = ux, E = tb.E, CH = Math.sqrt(tb.chunks.length);
	const ch = tb.chunks[clamp(Math.floor(c[0] / E * CH), 0, CH - 1) + CH * clamp(Math.floor(c[1] / E * CH), 0, CH - 1)];
	ch.n++;
	const F = {
		ch,
		W,
		v(p, n, uu) {
			W.normal(n[0] * ux + n[1] * vx, n[0] * uy + n[1] * vy, n[2]);
			const x = (c[0] + (p[0] * ux + p[1] * vx) / mpu) * u, y = (c[1] + (p[0] * uy + p[1] * vy) / mpu) * u;
			tb.extend(ch, x, y, x, y, p[2]);
			return W.v(x, y, p[2], uu);
		},
		quad(P, n, U = [
			0,
			0,
			0,
			0
		], list = "walls") {
			const i = P.map((p, j) => F.v(p, n, U[j]));
			push(ch[list], i, P, n);
		},
		mesh(P, N, U, lists, out) {
			const i = P.map((p, j) => F.v(p, N[j], U[j]));
			for (const [list, tris] of Object.entries(lists)) for (let t = 0; t < tris.length; t += 3) tri(ch[list], i, P, tris[t], tris[t + 1], tris[t + 2], out);
		},
		shift(dx, dy) {
			return frame(tb, [c[0] + (dx * ux + dy * vx) / mpu, c[1] + (dx * uy + dy * vy) / mpu], ux, uy);
		},
		at(p) {
			return [(c[0] + (p[0] * ux + p[1] * vx) / mpu) * u, (c[1] + (p[0] * uy + p[1] * vy) / mpu) * u];
		},
		angle(d) {
			return Math.atan2(d[0] * uy + d[1] * vy, d[0] * ux + d[1] * vx);
		},
		inst(kind, rec, far, pts) {
			(far ? ch.instFar : ch.inst)[kind].push(rec);
			for (const p of pts) {
				const q = F.at(p);
				tb.extend(ch, q[0], q[1], q[0], q[1], p[2]);
			}
		}
	};
	return F;
}
var sub = (a, b) => [
	a[0] - b[0],
	a[1] - b[1],
	a[2] - b[2]
];
var cross = (a, b) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var norm = (a) => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [
		a[0] / l,
		a[1] / l,
		a[2] / l
	];
};
function tri(list, i, P, a, b, c, out) {
	const n = cross(sub(P[b], P[a]), sub(P[c], P[a]));
	if (Math.hypot(n[0], n[1], n[2]) < 1e-9) return;
	if (dot(n, typeof out === "function" ? out(P[a], P[b], P[c]) : out) >= 0) list.push(i[a], i[b], i[c]);
	else list.push(i[a], i[c], i[b]);
}
function push(list, i, P, n) {
	tri(list, i, P, 0, 1, 2, n);
	tri(list, i, P, 0, 2, 3, n);
}
function box(F, a, b, z0, z1, top, wallU, list = "walls") {
	const C = [
		[-a, -b],
		[a, -b],
		[a, b],
		[-a, b]
	];
	for (let s = 0; s < 4; s++) {
		const p = C[s], q = C[(s + 1) % 4], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy), n = [
			dy / l,
			-dx / l,
			0
		];
		const nOut = dot([
			n[0],
			n[1],
			0
		], [
			(p[0] + q[0]) / 2,
			(p[1] + q[1]) / 2,
			0
		]) >= 0 ? n : [
			-n[0],
			-n[1],
			0
		];
		if (wallU) wallU(l, s);
		F.quad([
			[
				p[0],
				p[1],
				z0
			],
			[
				q[0],
				q[1],
				z0
			],
			[
				q[0],
				q[1],
				z1
			],
			[
				p[0],
				p[1],
				z1
			]
		], nOut, [
			0,
			l,
			l,
			0
		], list);
	}
	if (top) F.quad(C.map(([x, y]) => [
		x,
		y,
		z1
	]), [
		0,
		0,
		1
	], void 0, list);
}
var WALL = {
	HOUSE: 0,
	MUD: 1,
	STOREYS: 2,
	STOREY: 3
};
function houseWalls(tb, F, a, b, z0, zt, type, K, r, storey = 0, mx = [0, 0]) {
	const s = tb.W.b;
	F.inst("box", boxInst(F.at([0, 0]), F.angle([1, 0]), a, b, z0, zt, storey, [
		type,
		mx[0],
		mx[1],
		Math.floor(r * 16)
	], s), true, [
		[
			-a,
			-b,
			zt
		],
		[
			a,
			b,
			zt
		],
		[
			a,
			-b,
			z0
		],
		[
			-a,
			b,
			z0
		]
	]);
}
var giwaProf = (t) => .45 * t + .55 * t * t;
var ROOF_STYLE = {
	hip: 0,
	paljak: 1,
	gable: 2
};
function roof(tb, F, a, b, o, ze, rise, ar, { thatch = false, lift = 0, kick = 0, t1 = 1, style = "hip", zt, H, slot }) {
	const s = tb.W.b, k = kick, top = H < 6e3 ? H : ze + rise;
	F.inst("roof", roofInst(F.at([0, 0]), F.angle([1, 0]), [
		a,
		b,
		o,
		ze,
		rise,
		ar,
		lift,
		k,
		t1,
		zt,
		H
	], [
		ROOF_STYLE[style],
		thatch ? 1 : 0,
		slot
	], s), true, [
		[
			-(a + o + k + .7),
			-(b + o + k),
			ze
		],
		[
			a + o + k + .7,
			b + o + k,
			top
		],
		[
			a + o + k + .7,
			-(b + o + k),
			ze
		],
		[
			-(a + o + k + .7),
			b + o + k,
			ze
		]
	]);
}
function giwaRoof(tb, F, a, b, zt, K, slot, opts = {}) {
	const o = opts.eave ?? K.eaveOutM, be = b + o, ae = a + o, ze = zt - .15, rise = clamp(K.riseK * be, K.riseM[0], K.riseM[1]);
	const R = K.ridge, ar = opts.pyramid ? 0 : Math.max(.3 * ae, ae - K.hipK * be), zr = ze + rise, top = opts.t1 ? ze + rise * giwaProf(opts.t1) : zr + R.upM;
	const style = opts.t1 || opts.pyramid ? "hip" : opts.style || "hip";
	roof(tb, F, a, b, o, ze, rise, ar, {
		lift: K.cornerLiftM,
		kick: K.cornerKickM * .7,
		t1: opts.t1 ?? 1,
		style,
		zt,
		H: opts.t1 ? 6553.5 : top,
		slot
	});
	return {
		ze,
		rise,
		zr,
		top
	};
}
function roofStyle(b, K, u) {
	const S = K.roofStyles, w = b <= S.narrowHalfM ? S.narrow : S.wide;
	return u < w[0] ? "paljak" : u < w[0] + w[1] ? "gable" : "hip";
}
function giwaHouse(tb, F, a, b, K, r) {
	const zt = K.baseM + lerp(K.wallM[0], K.wallM[1], clamp((b * 2 - 5) / 5, 0, 1)) * (.92 + .16 * r(1));
	houseWalls(tb, F, a, b, 0, zt, WALL.HOUSE, K, r(2));
	giwaRoof(tb, F, a, b, zt, K, Math.floor(r(3) * 3) % 3, { style: roofStyle(b, K, r(5)) });
}
function thatchHouse(tb, F, a, b, K, r) {
	const T = K.thatch, zt = T.baseM + T.wallM * (.93 + .14 * r(1)), o = T.eaveOutM, be = b + o, ae = a + o;
	const ze = zt + .05, rise = clamp(T.riseK * be, T.riseM[0], T.riseM[1]), ar = Math.max(.12 * ae, ae - T.hipK * be);
	houseWalls(tb, F, a, b, 0, zt, WALL.MUD, K, r(2));
	roof(tb, F, a, b, o, ze, rise, ar, {
		thatch: true,
		zt,
		H: ze + rise,
		slot: Math.floor(r(3) * 3) % 3
	});
}
function hall(tb, F, a, b, K, r) {
	const T = K.tall, slot = Math.floor(r(3) * 3) % 3, z1 = K.baseM + T.hallStoreyM[0], set = T.hallSetM, a2 = a - set, b2 = b - set;
	houseWalls(tb, F, a, b, 0, z1, WALL.HOUSE, K, r(2));
	const be = b + K.eaveOutM, skirt = giwaRoof(tb, F, a, b, z1, K, slot, { t1: clamp(1 - (b2 - .3) / be, .3, .8) });
	const z2 = skirt.top - .3 + T.hallStoreyM[1];
	houseWalls(tb, F, a2, b2, skirt.top - .3, z2, WALL.STOREY, K, r(4), T.hallStoreyM[1]);
	giwaRoof(tb, F, a2, b2, z2, K, slot, { style: "paljak" });
}
function pagoda(tb, F, s, H, K, r) {
	const T = K.tall, slot = Math.floor(r(3) * 3) % 3, spire = Math.min(T.spireM, H * .12), body = Math.max(12, H - spire - 2);
	const floors = clamp(Math.round(body / Math.max(T.pagodaStoreyMinM, body / 13)), 3, 13), st = body / (floors + .35);
	let z = 0, h = s;
	for (let f = 0; f < floors; f++) {
		const storey = f ? st : st * 1.35, zt = z + storey, last = f === floors - 1, next = h * (1 - T.pagodaShrink);
		houseWalls(tb, F, h, h, z, zt, f ? WALL.STOREY : WALL.HOUSE, K, r(10 + f), storey);
		if (last) {
			const R = giwaRoof(tb, F, h, h, zt, K, slot, {
				pyramid: true,
				eave: T.pagodaEaveM
			});
			tb.W.kind = HANOK_KIND.ROOF;
			tb.W.w = [
				0,
				0,
				0,
				0
			];
			tb.W.m = [
				3,
				0,
				255,
				255
			];
			box(F, .25, .25, R.zr - .3, R.zr + spire, true);
		} else {
			const be = h + T.pagodaEaveM, t1 = clamp(1 - (next - .2) / be, .25, .85);
			z = giwaRoof(tb, F, h, h, zt, K, slot, {
				t1,
				eave: T.pagodaEaveM
			}).top - .25;
		}
		h = next;
	}
}
function tower(tb, F, a, b, H, K, r) {
	const T = K.tall, slot = Math.floor(r(3) * 3) % 3, top = Math.max(T.podiumM + 2 * T.storeyM, H - 2.5);
	const floors = Math.max(2, Math.round((top - T.podiumM) / T.storeyM)), st = (top - T.podiumM) / floors;
	houseWalls(tb, F, a, b, 0, top, WALL.STOREYS, K, r(2), st, [T.skirtStep.find(([n]) => floors <= n)[1], Math.round(T.podiumM * 20)]);
	const pa = a + T.podiumOutM, pb = b + T.podiumOutM;
	houseWalls(tb, F, pa, pb, 0, T.podiumM, WALL.HOUSE, K, r(4));
	const be = pb + K.eaveOutM, t1 = clamp(1 - (b - .2) / be, .2, .7);
	giwaRoof(tb, F, pa, pb, T.podiumM, K, slot, { t1 });
	const G = T.skirtGroup, step = T.skirtStep.find(([n]) => floors <= n)[1], k = K.cornerKickM * .7, rise = T.skirtRiseM;
	const C = [
		[-a, -b],
		[a, -b],
		[a, b],
		[-a, b]
	], sides = C.map((p, s) => {
		const q = C[(s + 1) % 4], len = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
		return {
			p,
			d,
			n: [d[1], -d[0]],
			len,
			groups: skirtGroups(len, G)
		};
	});
	for (let f = step; f < floors; f += step) {
		const zi = T.podiumM + f * st + .15, far = f / step % 3 === 0;
		for (const { p, d, n, len, groups } of sides) for (const [x0, x1] of groups) {
			const c0 = x0 <= 1e-6, c1 = x1 >= len - 1e-6, o = c0 || c1 ? G.cornerOutM : G.outM, ck = o + k;
			const on0 = c0 ? ck : o, al0 = c0 ? ck : G.flareM, on1 = c1 ? ck : o, al1 = c1 ? ck : G.flareM;
			const w0 = [
				p[0] + d[0] * x0,
				p[1] + d[1] * x0,
				zi
			], w1 = [
				p[0] + d[0] * x1,
				p[1] + d[1] * x1,
				zi
			];
			const e0 = [
				w0[0] + n[0] * on0 - d[0] * al0,
				w0[1] + n[1] * on0 - d[1] * al0,
				zi - rise
			], e1 = [
				w1[0] + n[0] * on1 + d[0] * al1,
				w1[1] + n[1] * on1 + d[1] * al1,
				zi - rise
			];
			F.inst("skirt", skirtInst(F.at(w0), zi, F.angle(d), x1 - x0, x0, [
				on0,
				al0,
				on1,
				al1
			], c0 ? G.liftM[0] : G.liftM[1], c1 ? G.liftM[0] : G.liftM[1], o, slot), far, [
				w0,
				w1,
				e0,
				e1
			]);
		}
	}
	if (a / b >= T.triRoofAspect) {
		const leg = clamp(G.cornerK * 2 * a, G.cornerM[0], G.cornerM[1]), ae = Math.max(2, leg / 2), xe = a - ae, am = Math.max(2, Math.min(a * .34, xe - ae - 1));
		giwaRoof(tb, F.shift(-xe, 0), ae, b, top, K, slot, { style: "paljak" });
		giwaRoof(tb, F.shift(xe, 0), ae, b, top, K, slot, { style: "paljak" });
		houseWalls(tb, F, am, b * .92, top - .2, top + 2.2, WALL.STOREY, K, r(6), 2.4);
		giwaRoof(tb, F, am, b * .92, top + 2.2, K, slot, { style: "paljak" });
	} else giwaRoof(tb, F, a, b, top, K, slot, { style: "paljak" });
}
function walls(tb, at, mine, ux, uy, w, K) {
	const C = K.compound, W = tb.W, stone = w.stone, t = (stone ? K.lot.wallThickM : C.wallThickM) / 2, z = stone ? K.lot.stoneWallM : C.wallM;
	const { hx, hy } = w, gate = Math.min(C.gateM, hx) / 2, g = w.gate;
	const segs = [
		[[-hx, -g * hy], [hx, -g * hy]],
		[[hx, -hy], [hx, hy]],
		[[-hx, hy], [-hx, -hy]],
		[[-hx, g * hy], [-gate, g * hy]],
		[[gate, g * hy], [hx, g * hy]]
	];
	let n = 0;
	for (const [p, q] of segs) {
		const m = at((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
		if (!mine(m)) continue;
		const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
		if (l < .3) continue;
		const F = frame(tb, m, ux, uy), ex = (q[0] - p[0]) / l, ey = (q[1] - p[1]) / l, nx = -ey, ny = ex;
		const P = (s, d, zz) => {
			const x = (s - .5) * l, y = d;
			return [
				x * ex + y * nx,
				x * ey + y * ny,
				zz
			];
		};
		W.m = [
			0,
			0,
			Math.min(255, Math.round((z + .35) * 10)),
			0
		];
		W.kind = stone ? HANOK_KIND.STONE : HANOK_KIND.DAM;
		const lq = Math.min(65535, Math.round(l * 20));
		W.w = [
			0,
			lq & 255,
			lq >>> 8,
			0
		];
		const tz = stone ? z - .15 : z;
		F.quad([
			P(0, t, 0),
			P(1, t, 0),
			P(1, t * (stone ? .75 : 1), tz),
			P(0, t * (stone ? .75 : 1), tz)
		], [
			nx,
			ny,
			0
		], [
			0,
			l,
			l,
			0
		], "hi");
		F.quad([
			P(1, -t, 0),
			P(0, -t, 0),
			P(0, -t * (stone ? .75 : 1), tz),
			P(1, -t * (stone ? .75 : 1), tz)
		], [
			-nx,
			-ny,
			0
		], [
			l,
			0,
			0,
			l
		], "hi");
		F.quad([
			P(0, -t, 0),
			P(0, t, 0),
			P(0, t, z),
			P(0, -t, z)
		], [
			-ex,
			-ey,
			0
		], void 0, "hi");
		F.quad([
			P(1, t, 0),
			P(1, -t, 0),
			P(1, -t, z),
			P(1, t, z)
		], [
			ex,
			ey,
			0
		], void 0, "hi");
		if (stone) {
			F.quad([
				P(0, t * .75, tz),
				P(1, t * .75, tz),
				P(1, 0, z),
				P(0, 0, z)
			], norm([
				nx,
				ny,
				1.2
			]), [
				0,
				l,
				l,
				0
			], "hi");
			F.quad([
				P(1, -t * .75, tz),
				P(0, -t * .75, tz),
				P(0, 0, z),
				P(1, 0, z)
			], norm([
				-nx,
				-ny,
				1.2
			]), [
				l,
				0,
				0,
				l
			], "hi");
		} else {
			W.kind = HANOK_KIND.ROOF;
			W.m[0] = 0;
			const c = t + .16, zc = z + .35, zo = z - .05;
			F.quad([
				P(0, c, zo),
				P(1, c, zo),
				P(1, 0, zc),
				P(0, 0, zc)
			], norm([
				nx * .35,
				ny * .35,
				c
			]), [
				0,
				l,
				l,
				0
			], "hi");
			F.quad([
				P(1, -c, zo),
				P(0, -c, zo),
				P(0, 0, zc),
				P(1, 0, zc)
			], norm([
				-nx * .35,
				-ny * .35,
				c
			]), [
				l,
				0,
				0,
				l
			], "hi");
		}
		n++;
	}
	const gm = at(0, g * hy);
	if (!stone && mine(gm)) {
		const G = C.gateRoof, F = frame(tb, gm, ux, uy), hw = G.widthM / 2, hd = G.depthM / 2, zt = G.heightM, Hq = Math.min(65535, Math.round((zt + 1) * 10));
		W.kind = HANOK_KIND.WALL;
		W.b[2] = 0;
		W.w = [
			0,
			0,
			0,
			0
		];
		W.m = [
			0,
			0,
			Hq & 255,
			Hq >>> 8
		];
		for (const x of [-gate, gate]) box(F.shift(x, 0), .14, .14, 0, zt, false, null, "hi");
		W.kind = HANOK_KIND.ROOF;
		W.m = [
			0,
			0,
			Hq & 255,
			Hq >>> 8
		];
		for (const sd of [-1, 1]) F.quad([
			[
				-hw,
				sd * hd,
				zt
			],
			[
				hw,
				sd * hd,
				zt
			],
			[
				hw,
				0,
				zt + .8
			],
			[
				-hw,
				0,
				zt + .8
			]
		], norm([
			0,
			sd * .8,
			hd
		]), [
			-hw,
			hw,
			hw,
			-hw
		], "hi");
		n++;
	}
	return n;
}
registerCityPart("hanok", {
	building: hanokBuilding,
	skirtTemplate,
	roofTemplate,
	boxTemplate
});
export { BOX_INST, HANOK_KIND, POSTS, ROOF_INST, boxInst, boxTemplate, bufferCut, districtNoise, hanokBuilding, hanokLayout, hanokType, houseWings, roofInst, roofTemplate, skirtGroups, skirtInst, skirtTemplate };
