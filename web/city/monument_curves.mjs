// web/city/monument_curves.mts
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
var unit = (a) => {
	const len = Math.hypot(a[0], a[1], a[2]) || 1;
	return [
		a[0] / len,
		a[1] / len,
		a[2] / len
	];
};
var add = (a, b) => [
	a[0] + b[0],
	a[1] + b[1],
	a[2] + b[2]
];
var scale = (a, k) => [
	a[0] * k,
	a[1] * k,
	a[2] * k
];
function loft(w, rows, cols, at, kind, options = {}) {
	const closed = options.closed ?? true, width = closed ? cols : cols + 1, P = [];
	for (let i = 0; i <= rows; i++) {
		const row = [];
		for (let j = 0; j < width; j++) row.push(at(i / rows, j / cols));
		P.push(row);
	}
	const N = P.map((row) => row.map(() => [
		0,
		0,
		0
	]));
	const wrap = (j) => closed ? (j + width) % width : j;
	for (let i = 0; i < rows; i++) for (let j = 0; j < (closed ? width : width - 1); j++) {
		const j1 = wrap(j + 1), a = P[i][j], b = P[i][j1], c = P[i + 1][j1], e = P[i + 1][j];
		const n1 = cross(sub(b, a), sub(c, a)), n2 = cross(sub(c, a), sub(e, a));
		for (const [ii, jj, n] of [
			[
				i,
				j,
				n1
			],
			[
				i,
				j1,
				n1
			],
			[
				i + 1,
				j1,
				n1
			],
			[
				i,
				j,
				n2
			],
			[
				i + 1,
				j1,
				n2
			],
			[
				i + 1,
				j,
				n2
			]
		]) N[ii][jj] = add(N[ii][jj], n);
	}
	for (const [i, near] of [[0, 1], [rows, rows - 1]]) {
		const row = P[i];
		if (row.every((p) => Math.hypot(...sub(p, row[0])) < 1e-6)) {
			let sum = [
				0,
				0,
				0
			];
			for (const n of N[near]) sum = add(sum, unit(n));
			N[i] = row.map(() => sum);
		}
	}
	let flip = options.sign ?? 0;
	if (!flip) {
		let total = 0;
		for (let i = 0; i <= rows; i++) {
			let center = [
				0,
				0,
				0
			];
			for (const p of P[i]) center = add(center, p);
			center = scale(center, 1 / width);
			for (let j = 0; j < width; j++) total += dot(unit(N[i][j]), sub(P[i][j], center));
		}
		flip = total >= 0 ? 1 : -1;
	}
	if (options.inward) flip = -flip;
	const normal = (i, j) => scale(unit(N[i][j]), flip);
	const area = (a, b, c) => Math.hypot(...cross(sub(b, a), sub(c, a)));
	for (let i = 0; i < rows; i++) for (let j = 0; j < (closed ? width : width - 1); j++) {
		const j1 = wrap(j + 1), pa = P[i][j], pb = P[i][j1], pc = P[i + 1][j1], pe = P[i + 1][j];
		const s = (ii, jj) => options.s ? options.s(ii / rows, jj / cols) : 0;
		if (area(pa, pb, pc) > 1e-9) w.triN(pa, pb, pc, normal(i, j), normal(i, j1), normal(i + 1, j1), kind, s(i, j), s(i, j1), s(i + 1, j1));
		if (area(pa, pc, pe) > 1e-9) w.triN(pa, pc, pe, normal(i, j), normal(i + 1, j1), normal(i + 1, j), kind, s(i, j), s(i + 1, j1), s(i + 1, j));
	}
}
var rotate = (p, pose) => {
	let [x, y, z] = p;
	const { yaw = 0, pitch = 0, roll = 0 } = pose;
	if (pitch) {
		const c = Math.cos(pitch), s = Math.sin(pitch);
		[y, z] = [y * c - z * s, y * s + z * c];
	}
	if (roll) {
		const c = Math.cos(roll), s = Math.sin(roll);
		[x, z] = [x * c + z * s, -x * s + z * c];
	}
	if (yaw) {
		const c = Math.cos(yaw), s = Math.sin(yaw);
		[x, y] = [x * c - y * s, x * s + y * c];
	}
	return [
		x,
		y,
		z
	];
};
function ellipsoid(w, center, radii, kind, pose = {}, detail = [10, 14]) {
	loft(w, detail[0], detail[1], (v, u) => {
		const phi = v * Math.PI, theta = u * Math.PI * 2, r = Math.sin(phi);
		return add(center, rotate([
			radii[0] * r * Math.cos(theta),
			radii[1] * r * Math.sin(theta),
			-radii[2] * Math.cos(phi)
		], pose));
	}, kind);
}
var spline = (k, t) => {
	const i = Math.min(k.length - 2, Math.max(0, Math.floor(t))), f = t - i, p0 = k[Math.max(0, i - 1)], p1 = k[i], p2 = k[i + 1], p3 = k[Math.min(k.length - 1, i + 2)];
	const f2 = f * f, f3 = f2 * f;
	return p1.map((_, d) => .5 * (2 * p1[d] + (p2[d] - p0[d]) * f + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * f2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * f3));
};
function tube(w, knots, kind, options = {}) {
	const sides = options.sides ?? 10, steps = options.steps ?? (knots.length - 1) * 4, capRows = options.cap ?? 3, up = options.up ?? [
		0,
		0,
		1
	];
	const samples = [];
	for (let i = 0; i <= steps; i++) samples.push(spline(knots, i / steps * (knots.length - 1)));
	const centers = samples.map((k) => [
		k[0],
		k[1],
		k[2]
	]), tangents = centers.map((_, i) => unit(sub(centers[Math.min(i + 1, steps)], centers[Math.max(i - 1, 0)])));
	const frames = [];
	let side = cross(tangents[0], Math.abs(dot(tangents[0], up)) > .95 ? [
		1,
		0,
		0
	] : up);
	for (const tangent of tangents) {
		side = unit(sub(side, scale(tangent, dot(side, tangent))));
		frames.push([side, unit(cross(tangent, side))]);
	}
	const rows = [];
	const first = samples[0], last = samples[steps];
	for (let i = capRows; i >= 1; i--) {
		const phi = i / (capRows + 1) * Math.PI / 2, shift = Math.sin(phi), shrink = Math.cos(phi);
		rows.push({
			c: sub(centers[0], scale(tangents[0], shift * Math.max(first[3], first[4]))),
			a: frames[0][0],
			b: frames[0][1],
			rx: first[3] * shrink,
			ry: first[4] * shrink
		});
	}
	samples.forEach((k, i) => rows.push({
		c: centers[i],
		a: frames[i][0],
		b: frames[i][1],
		rx: k[3],
		ry: k[4]
	}));
	for (let i = 1; i <= capRows; i++) {
		const phi = i / (capRows + 1) * Math.PI / 2, shift = Math.sin(phi), shrink = Math.cos(phi);
		rows.push({
			c: add(centers[steps], scale(tangents[steps], shift * Math.max(last[3], last[4]))),
			a: frames[steps][0],
			b: frames[steps][1],
			rx: last[3] * shrink,
			ry: last[4] * shrink
		});
	}
	const end0 = rows[0], endN = rows[rows.length - 1];
	loft(w, rows.length + 1, sides, (v, u) => {
		const i = Math.round(v * (rows.length + 1)) - 1;
		if (i < 0) return sub(end0.c, scale(tangents[0], .001));
		if (i >= rows.length) return add(endN.c, scale(tangents[steps], .001));
		const row = rows[i], theta = u * Math.PI * 2;
		return add(row.c, add(scale(row.a, row.rx * Math.cos(theta)), scale(row.b, row.ry * Math.sin(theta))));
	}, kind);
}
function body(w, knots, kind, options = {}) {
	const cols = options.cols ?? 20, rows = options.rows ?? (knots.length - 1) * 4, fold = options.fold;
	const first = knots[0], last = knots[knots.length - 1];
	const ringPoint = (t, u) => {
		const k = spline(knots, t * (knots.length - 1)), theta = u * Math.PI * 2, f = fold ? 1 + fold(t, u) : 1;
		return [
			k[0] + k[3] * f * Math.cos(theta),
			k[1] + k[4] * f * Math.sin(theta),
			k[2]
		];
	};
	loft(w, rows, cols, (v, u) => ringPoint(Math.round(v * rows) / rows, u), kind);
	for (const [t, z, nz] of [[
		0,
		first[2],
		-1
	], [
		1,
		last[2],
		1
	]]) {
		const center = [
			t ? last[0] : first[0],
			t ? last[1] : first[1],
			z
		], flat = [
			0,
			0,
			nz
		];
		for (let j = 0; j < cols; j++) w.triN(center, ringPoint(t, j / cols), ringPoint(t, (j + 1) / cols), flat, flat, flat, kind);
	}
}
function torus(w, center, major, minor, kind, pose = {}, detail = [6, 24]) {
	loft(w, detail[0], detail[1], (v, u) => {
		const around = u * Math.PI * 2, section = v * Math.PI * 2, radius = major + minor * Math.cos(section);
		return add(center, rotate([
			radius * Math.cos(around),
			radius * Math.sin(around),
			minor * Math.sin(section)
		], pose));
	}, kind, { sign: 1 });
}
function bowl(w, center, radius, wall, kind, detail = [6, 20]) {
	const shell = (r) => (v, u) => {
		const phi = v * Math.PI / 2, theta = u * Math.PI * 2;
		return add(center, [
			r * Math.sin(phi) * Math.cos(theta),
			r * Math.sin(phi) * Math.sin(theta),
			-r * Math.cos(phi)
		]);
	};
	loft(w, detail[0], detail[1], shell(radius), kind);
	loft(w, detail[0], detail[1], shell(radius - wall), kind, { inward: true });
	loft(w, 1, detail[1], (v, u) => {
		const theta = u * Math.PI * 2, r = radius - wall * v;
		return add(center, [
			r * Math.cos(theta),
			r * Math.sin(theta),
			0
		]);
	}, kind, { sign: 1 });
}
function cup(w, center, radius, wall, height, kind, cols = 20) {
	const ring = (r, z, u) => add(center, [
		r * Math.cos(u * Math.PI * 2),
		r * Math.sin(u * Math.PI * 2),
		z
	]);
	loft(w, 1, cols, (v, u) => ring(radius, v * height, u), kind);
	loft(w, 1, cols, (v, u) => ring(radius - wall, v * height, u), kind, { inward: true });
	const up = [
		0,
		0,
		1
	], floor = height * .12;
	for (let col = 0; col < cols; col++) {
		const a = col / cols, b = (col + 1) / cols;
		w.triN(ring(radius, height, a), ring(radius - wall, height, a), ring(radius - wall, height, b), up, up, up, kind);
		w.triN(ring(radius, height, a), ring(radius - wall, height, b), ring(radius, height, b), up, up, up, kind);
		w.triN(add(center, [
			0,
			0,
			floor
		]), ring(radius - wall, floor, a), ring(radius - wall, floor, b), up, up, up, kind);
	}
}
export { body, bowl, cup, ellipsoid, loft, rotate, spline, torus, tube };
